import { createHash, createHmac, createPrivateKey, randomBytes, timingSafeEqual, type KeyObject } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { signEntitlementToken } from '../../../src/shared/cloud/entitlementToken'
import {
  CLOUD_FEATURES,
  CLOUD_PERMANENT_EXPIRES_AT,
  deviceKindOf,
  type CloudAdminStats,
  type CloudAdminUserDetail,
  type CloudAdminUserPatch,
  type CloudClientKind,
  type CloudDevice,
  type CloudDeviceActivateRequest,
  type CloudDeviceActivateResponse,
  type CloudEntitlement,
  type CloudFeature,
  type CloudLoginRequest,
  type CloudLoginResponse,
  type CloudMeResponse,
  type CloudOrder,
  type CloudPayChannel,
  type CloudPlan,
  type CloudPlansResponse,
  type CloudUserRole,
  type EntitlementTokenPayload,
} from '../../../src/shared/cloud/types'
import {
  createDefaultManagedSettings,
  maskManagedSettings,
  mergeManagedSecrets,
  normalizeManagedSettings,
  stripManagedSecretsForClient,
  type ManagedSoftwareSettings,
} from '../../../src/shared/cloud/managedSettings'
import { qiniuDomainOf, qiniuObjectKey, qiniuPrefixOf, qiniuUploadHostOf, qiniuUploadToken } from '../../../src/main/modules/clone/qiniu'
import type { CloudConfig } from './config'
import { transaction, type CloudDb } from './db'
import { createBillingService } from './billing'
import { defaultPlanQuotas, normalizePlanQuotas, type CloudRedeemKind } from '../../../src/shared/cloud/billing'
import { AlipayGateway } from './payments/alipay'
import { WechatPayV3, type WechatSignatureHeaders } from './payments/wechatPayV3'
import { publicUser, type CloudRepo, type UserRow } from './repo'
import {
  CloudError,
  LoginThrottle,
  badRequest,
  burnPasswordCheck,
  forbidden,
  hashPassword,
  newId,
  newOrderNo,
  newRedeemCode,
  newSessionToken,
  normalizeAccount,
  notFound,
  sha256,
  unauthorized,
  validatePassword,
  verifyPassword,
} from './security'

const DAY = 24 * 60 * 60 * 1000

/** 软件设置（含平台密钥）单独存放，不出现在通用配置列表里，也不能通过通用配置接口修改 */
export const MANAGED_SETTINGS_KEY = 'software.managedSettings'
const RESERVED_CONFIG_PREFIX = 'software.'

export type Actor = { user: UserRow; ip: string }

export const DEFAULT_PLANS: CloudPlan[] = [
  { code: 'month', name: '月度会员', description: '全部功能，1 台电脑 + 1 部手机', days: 30, amountFen: 9900, maxDevices: 1, features: ['*'], active: true, sort: 10, credits: 0, quotas: defaultPlanQuotas() },
  { code: 'quarter', name: '季度会员', description: '全部功能，2 台电脑 + 1 部手机', days: 90, amountFen: 26900, maxDevices: 2, features: ['*'], active: true, sort: 20, credits: 0, quotas: defaultPlanQuotas() },
  { code: 'year', name: '年度会员', description: '全部功能，3 台电脑 + 1 部手机', days: 365, amountFen: 89900, maxDevices: 3, features: ['*'], active: true, sort: 30, credits: 0, quotas: defaultPlanQuotas() },
]

export const DEFAULT_CONFIG: Array<{ key: string; value: unknown; scope: 'public' | 'private'; description: string }> = [
  { key: 'client.announcement', value: '', scope: 'public', description: '桌面端顶部公告，留空不显示' },
  { key: 'client.minVersion', value: '', scope: 'public', description: '最低可用客户端版本，低于此版本强制更新' },
  { key: 'client.featureFlags', value: {}, scope: 'public', description: '功能开关，例如 {"gmv-max": false}' },
  { key: 'support.contact', value: '', scope: 'public', description: '客服联系方式（微信 / 电话）' },
  { key: 'client.downloadUrl', value: '', scope: 'public', description: 'Windows 客户端安装包下载地址（官网下载页使用）' },
  { key: 'client.latestVersion', value: '', scope: 'public', description: '官网展示的最新版本号，例如 5.0.129' },
  { key: 'client.releaseNotes', value: '', scope: 'public', description: '官网下载页展示的更新说明' },
]

export function createCloudService(deps: {
  config: CloudConfig
  db: CloudDb
  repo: CloudRepo
  entitlementPrivateKey: string | KeyObject
  now?: () => number
}) {
  const { config, db, repo } = deps
  const now = deps.now ?? (() => Date.now())
  const privateKey = typeof deps.entitlementPrivateKey === 'string' ? createPrivateKey(deps.entitlementPrivateKey) : deps.entitlementPrivateKey
  // AI 代理令牌的签名密钥：由授权私钥派生，不需要额外配置
  const proxySecret = createHash('sha256').update(`ai-proxy:${privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()}`).digest()
  const wechat = new WechatPayV3(config.wechat)
  const alipay = new AlipayGateway(config.alipay)
  const throttle = new LoginThrottle(config.loginMaxFailures, config.loginLockMs)
  const reconcileThrottle = new Map<string, number>()

  function audit(actor: Actor | null, action: string, target: string, detail?: unknown) {
    repo.insertAudit({
      actorUserId: actor?.user.id ?? null,
      actorAccount: actor?.user.account ?? null,
      action,
      target,
      detail: detail ?? null,
      ip: actor?.ip ?? '',
      now: now(),
    })
  }

  /* ------------------------------------------------------------------ 授权计算 */

  function isUnlimited(user: UserRow) {
    return user.role === 'super_admin' || user.unlimited
  }

  function entitlementFor(user: UserRow): CloudEntitlement {
    if (isUnlimited(user)) {
      return { active: user.status === 'active', unlimited: true, planCode: user.planCode, planName: '不受限', expiresAt: null, features: ['*'], maxDevices: 0, maxMobileDevices: 0 }
    }
    const plan = user.planCode ? repo.getPlan(user.planCode) : null
    const active = user.status === 'active' && Boolean(user.planExpiresAt && user.planExpiresAt > now())
    return {
      active,
      unlimited: false,
      planCode: user.planCode,
      planName: plan?.name ?? null,
      expiresAt: user.planExpiresAt,
      features: active ? (plan?.features ?? []) : [],
      maxDevices: plan?.maxDevices ?? 1,
      maxMobileDevices: config.maxMobileDevices,
    }
  }

  const billing = createBillingService({
    db,
    repo,
    now,
    entitlementFor,
    currentModel: (capability) => {
      const settings = readManagedSettings().settings
      if (!settings.enabled) return null
      const cap = settings.capabilities[capability]
      return { platform: cap.platform, model: cap.model }
    },
  })

  function signToken(user: UserRow, device: CloudDevice, entitlement: CloudEntitlement): string {
    const issuedAt = now()
    const ttl = entitlement.unlimited ? config.unlimitedEntitlementTtlMs : config.entitlementTtlMs
    const licenseExpiresAt = entitlement.unlimited ? 0 : (entitlement.expiresAt ?? 0)
    let exp = issuedAt + ttl
    if (licenseExpiresAt > 0) exp = Math.min(exp, licenseExpiresAt)
    const payload: EntitlementTokenPayload = {
      v: 1,
      sub: user.id,
      acc: user.account,
      role: user.role,
      mid: device.machineId,
      did: device.id,
      plan: entitlement.planCode,
      feat: entitlement.features,
      unl: entitlement.unlimited,
      lexp: licenseExpiresAt,
      iat: issuedAt,
      exp,
    }
    return signEntitlementToken(payload, privateKey)
  }

  /** 给用户增加会员时长：从「当前到期时间」与「现在」较晚者顺延；days = 0 表示永久 */
  function grantPlan(user: UserRow, plan: { code: string; days: number }) {
    const t = now()
    const base = Math.max(t, user.planExpiresAt ?? 0)
    const expiresAt = plan.days === 0 ? CLOUD_PERMANENT_EXPIRES_AT : Math.min(CLOUD_PERMANENT_EXPIRES_AT, base + plan.days * DAY)
    repo.updateUser(user.id, { planCode: plan.code, planExpiresAt: expiresAt }, t)
  }

  /* ------------------------------------------------------------------ 账号 */

  async function createUser(input: { account: string; password: string; displayName?: string; role?: CloudUserRole }): Promise<UserRow> {
    const account = normalizeAccount(input.account)
    validatePassword(input.password)
    if (repo.getUserByAccount(account)) throw new CloudError('CONFLICT', '该账号已注册', 409)
    const id = newId('u')
    repo.insertUser({
      id,
      account,
      passwordHash: await hashPassword(input.password),
      displayName: String(input.displayName || '').trim().slice(0, 40) || account,
      role: input.role ?? 'user',
      now: now(),
    })
    return repo.getUserById(id)!
  }

  function issueSession(user: UserRow, client: CloudClientKind, machineId: string | null) {
    const token = newSessionToken()
    const ttl = client === 'admin' ? config.adminSessionTtlMs : config.sessionTtlMs
    repo.insertSession({ tokenHash: sha256(token), userId: user.id, client, machineId, now: now(), expiresAt: now() + ttl })
    return token
  }

  async function register(input: { account: string; password: string; displayName?: string }, ip: string): Promise<CloudLoginResponse> {
    if (!config.allowRegistration) throw forbidden('暂未开放注册，请联系客服')
    const user = await createUser(input)
    audit({ user, ip }, 'user.register', user.id)
    return { sessionToken: issueSession(user, 'web', null), user: publicUser(user), entitlement: entitlementFor(user) }
  }

  async function login(input: CloudLoginRequest, ip: string): Promise<CloudLoginResponse> {
    const client: CloudClientKind = input.client === 'admin' || input.client === 'desktop' || input.client === 'mobile' ? input.client : 'web'
    let account: string
    try {
      account = normalizeAccount(input.account)
    } catch {
      throw unauthorized('账号或密码错误')
    }
    const throttleKey = `${account}|${ip}`
    throttle.assertAllowed(throttleKey, now())
    const user = repo.getUserByAccount(account)
    const password = String(input.password || '')
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false)
    if (!user || !ok) {
      throttle.fail(throttleKey, now())
      throw unauthorized('账号或密码错误')
    }
    throttle.succeed(throttleKey)
    if (user.status !== 'active') throw new CloudError('ACCOUNT_DISABLED', '账号已被停用，请联系客服', 403)
    if (client === 'admin' && user.role === 'user') throw forbidden('该账号没有后台权限')

    const machineId = client === 'desktop' || client === 'mobile' ? String(input.machineId || '').slice(0, 128) || null : null
    repo.updateUser(user.id, { lastLoginAt: now() }, now())
    const sessionToken = issueSession(user, client, machineId)
    if (client === 'admin') audit({ user, ip }, 'admin.login', user.id)
    const fresh = repo.getUserById(user.id)!
    return { sessionToken, user: publicUser(fresh), entitlement: entitlementFor(fresh) }
  }

  function authenticate(token: string | null, options: { admin?: boolean; superAdmin?: boolean } = {}) {
    if (!token) throw unauthorized()
    const tokenHash = sha256(token)
    const session = repo.getSession(tokenHash)
    const t = now()
    if (!session || session.revokedAt || session.expiresAt <= t) throw unauthorized('登录已失效，请重新登录')
    const user = repo.getUserById(session.userId)
    if (!user) throw unauthorized('登录已失效，请重新登录')
    if (user.status !== 'active') throw new CloudError('ACCOUNT_DISABLED', '账号已被停用，请联系客服', 403)
    if (options.admin && (session.client !== 'admin' || user.role === 'user')) throw forbidden()
    if (options.superAdmin && user.role !== 'super_admin') throw forbidden('仅超级管理员可操作')
    if (t - session.lastSeenAt > 60_000) repo.touchSession(tokenHash, t)
    return { user, session, tokenHash }
  }

  function logout(tokenHash: string) {
    repo.revokeSession(tokenHash, now())
  }

  function me(user: UserRow): CloudMeResponse {
    return { user: publicUser(user), entitlement: entitlementFor(user), devices: repo.listActiveDevices(user.id) }
  }

  async function changePassword(user: UserRow, oldPassword: string, newPassword: string, keepTokenHash: string) {
    if (!(await verifyPassword(String(oldPassword || ''), user.passwordHash))) throw badRequest('原密码不正确')
    validatePassword(String(newPassword || ''))
    if (String(newPassword) === String(oldPassword)) throw badRequest('新密码不能和原密码相同')
    repo.updateUser(user.id, { passwordHash: await hashPassword(newPassword), mustChangePassword: false }, now())
    // 初始密码文件只在改密码前有用，改完就删掉
    if (user.mustChangePassword) rmSync(initialAdminFile(), { force: true })
    // 其它会话全部下线
    repo.revokeUserSessions(user.id, now())
    db.prepare('UPDATE sessions SET revoked_at = NULL WHERE token_hash = ?').run(keepTokenHash)
  }

  /* ------------------------------------------------------------------ 设备 */

  function activateDevice(user: UserRow, input: CloudDeviceActivateRequest): CloudDeviceActivateResponse {
    const machineId = String(input.machineId || '').trim().slice(0, 128)
    if (!machineId) throw badRequest('缺少机器码')
    const entitlement = entitlementFor(user)
    if (!entitlement.active) throw new CloudError('NO_ENTITLEMENT', '当前账号没有有效会员，请先购买或兑换', 402, { entitlement })
    const info = {
      name: String(input.deviceName || '').slice(0, 80),
      platform: String(input.platform || '').slice(0, 40),
      appVersion: String(input.appVersion || '').slice(0, 40),
      now: now(),
    }
    const device = transaction(db, () => {
      const existing = repo.getActiveDeviceByMachine(user.id, machineId)
      if (existing) {
        repo.touchDevice(existing.id, info)
        return repo.getActiveDevice(user.id, existing.id)!
      }
      const kind = deviceKindOf(info.platform)
      const sameKind = repo.listActiveDevices(user.id).filter((device) => device.kind === kind)
      if (kind === 'mobile') {
        // Phones have their own allowance. A new phone takes over from the least recently used one,
        // so switching phones never needs a manual unbind.
        const limit = entitlement.maxMobileDevices
        if (limit > 0 && sameKind.length >= limit) {
          const oldest = [...sameKind].sort((a, b) => a.lastSeenAt - b.lastSeenAt).slice(0, sameKind.length - limit + 1)
          for (const device of oldest) {
            repo.revokeDevice(device.id, 'replaced', info.now)
            repo.revokeUserSessions(user.id, info.now, device.machineId)
            audit({ user, ip: '' }, 'device.replace', device.id, { machineId: device.machineId, by: machineId })
          }
        }
      } else if (entitlement.maxDevices > 0 && sameKind.length >= entitlement.maxDevices) {
        throw new CloudError('DEVICE_LIMIT', `当前会员最多绑定 ${entitlement.maxDevices} 台电脑，请先解绑其它电脑`, 409, { devices: sameKind, maxDevices: entitlement.maxDevices })
      }
      const id = newId('d')
      repo.insertDevice({ id, userId: user.id, machineId, ...info })
      return repo.getActiveDevice(user.id, id)!
    })
    return { entitlement, entitlementToken: signToken(user, device, entitlement), device }
  }

  function unbindOwnDevice(user: UserRow, deviceId: string, ip: string) {
    const device = repo.getActiveDevice(user.id, deviceId)
    if (!device) throw notFound('设备不存在')
    if (!isUnlimited(user)) {
      const used = repo.countUserUnbindsSince(user.id, now() - 30 * DAY)
      if (used >= config.deviceUnbindPer30d) {
        throw new CloudError('RATE_LIMITED', `30 天内最多自助解绑 ${config.deviceUnbindPer30d} 次，请联系客服`, 429)
      }
    }
    repo.revokeDevice(device.id, 'user', now())
    repo.revokeUserSessions(user.id, now(), device.machineId)
    audit({ user, ip }, 'device.unbind', device.id, { machineId: device.machineId })
  }

  /* ------------------------------------------------------------------ 套餐与订单 */

  function availableChannels(): CloudPayChannel[] {
    const channels: CloudPayChannel[] = []
    if (wechat.isConfigured() && config.publicBaseUrl) channels.push('wechat')
    if (alipay.isConfigured() && config.publicBaseUrl) channels.push('alipay')
    if (config.mockPay) channels.push('mock')
    return channels
  }

  function listPlans(): CloudPlansResponse {
    return { plans: repo.listPlans(false), channels: availableChannels(), maxMobileDevices: config.maxMobileDevices }
  }

  async function createOrder(user: UserRow, input: { planCode: string; channel: CloudPayChannel }): Promise<CloudOrder> {
    const plan = repo.getPlan(String(input.planCode || ''))
    if (!plan || !plan.active) throw badRequest('套餐不存在或已下架')
    if (plan.amountFen <= 0) throw badRequest('套餐价格无效')
    if (!availableChannels().includes(input.channel)) throw badRequest('该支付方式暂未开通')

    const t = now()
    const orderNo = newOrderNo(t)
    const expireAt = t + config.orderExpireMs
    const subject = `TiktokCut ${plan.name}`
    let qrContent = `mock://pay/${orderNo}`
    if (input.channel === 'wechat') {
      qrContent = (await wechat.createNative({ orderNo, description: subject, amountFen: plan.amountFen, expireAt, notifyUrl: `${config.publicBaseUrl}/api/v1/pay/notify/wechat` })).codeUrl
    } else if (input.channel === 'alipay') {
      qrContent = (await alipay.precreate({ orderNo, subject, amountFen: plan.amountFen, expireAt, notifyUrl: `${config.publicBaseUrl}/api/v1/pay/notify/alipay` })).qrCode
    }
    const order: CloudOrder = {
      orderNo,
      userId: user.id,
      planCode: plan.code,
      planName: plan.name,
      days: plan.days,
      amountFen: plan.amountFen,
      channel: input.channel,
      status: 'pending',
      qrContent,
      transactionId: null,
      paidAt: null,
      expireAt,
      createdAt: t,
      refundedAt: null,
      note: '',
      credits: plan.credits,
    }
    repo.insertOrder(order, t)
    return order
  }

  /**
   * 已验签的支付结果到账（幂等）。订单已过期关闭但钱确实到了，也照样到账。
   * 返回 true 表示本次真正完成了到账。
   */
  function fulfill(input: { orderNo: string; channel: CloudPayChannel; transactionId: string; paidFen: number; source: string }): boolean {
    return transaction(db, () => {
      const order = repo.getOrder(input.orderNo)
      if (!order) throw notFound('订单不存在')
      if (order.status === 'paid' || order.status === 'refunded') return false
      if (order.channel !== input.channel) throw badRequest('支付渠道与订单不一致')
      if (order.amountFen !== input.paidFen) throw badRequest('支付金额与订单不一致')
      const user = repo.getUserById(order.userId)
      if (!user) throw notFound('订单用户不存在')
      if (order.status === 'closed') repo.setOrderStatus(order.orderNo, 'pending', now())
      repo.markOrderPaid({ orderNo: order.orderNo, transactionId: input.transactionId.slice(0, 64), paidFen: input.paidFen, source: input.source, now: now() })
      grantPlan(user, { code: order.planCode, days: order.days })
      if (order.credits > 0) billing.applyCreditsInTx({ userId: user.id, delta: order.credits, kind: 'order', ref: order.orderNo, note: order.planName })
      audit(null, 'order.paid', order.orderNo, { userId: user.id, channel: input.channel, source: input.source, amountFen: input.paidFen })
      return true
    })
  }

  async function reconcileWithChannel(order: CloudOrder) {
    const last = reconcileThrottle.get(order.orderNo) ?? 0
    if (now() - last < 5000) return
    reconcileThrottle.set(order.orderNo, now())
    if (reconcileThrottle.size > 10_000) reconcileThrottle.clear()
    try {
      if (order.channel === 'wechat') {
        const tx = await wechat.queryByOrderNo(order.orderNo)
        if (tx && wechat.isPaidTransactionFor(tx, order.orderNo, order.amountFen)) {
          fulfill({ orderNo: order.orderNo, channel: 'wechat', transactionId: String(tx.transaction_id || ''), paidFen: order.amountFen, source: 'query' })
        }
      } else if (order.channel === 'alipay') {
        const trade = await alipay.query(order.orderNo)
        if (trade && alipay.isPaidTradeFor(trade, order.orderNo, order.amountFen)) {
          fulfill({ orderNo: order.orderNo, channel: 'alipay', transactionId: String(trade.trade_no || ''), paidFen: order.amountFen, source: 'query' })
        }
      }
    } catch (error) {
      console.warn('[cloud-pay] 主动查单失败', order.orderNo, (error as Error).message)
    }
  }

  async function getOwnOrder(user: UserRow, orderNo: string): Promise<CloudOrder> {
    let order = repo.getOrder(orderNo)
    if (!order || order.userId !== user.id) throw notFound('订单不存在')
    if (order.status === 'pending') {
      if (order.expireAt < now() - 60_000) {
        await reconcileWithChannel(order)
        order = repo.getOrder(orderNo)!
        if (order.status === 'pending') {
          repo.setOrderStatus(orderNo, 'closed', now())
          order = repo.getOrder(orderNo)!
        }
      } else if (order.channel !== 'mock') {
        await reconcileWithChannel(order)
        order = repo.getOrder(orderNo)!
      }
    }
    return order
  }

  function mockPay(user: UserRow, orderNo: string): CloudOrder {
    if (!config.mockPay) throw forbidden('模拟支付未开启')
    const order = repo.getOrder(orderNo)
    if (!order || order.userId !== user.id) throw notFound('订单不存在')
    if (order.channel !== 'mock') throw badRequest('只有模拟渠道订单可以模拟支付')
    fulfill({ orderNo, channel: 'mock', transactionId: `MOCK-${orderNo}`, paidFen: order.amountFen, source: 'mock' })
    return repo.getOrder(orderNo)!
  }

  function handleWechatNotify(headers: WechatSignatureHeaders, rawBody: string): { status: number; body: string } {
    const fail = (message: string) => ({ status: 400, body: JSON.stringify({ code: 'FAIL', message }) })
    if (!wechat.isConfigured()) return fail('not configured')
    if (!wechat.verifySignature(headers, rawBody)) {
      console.warn('[cloud-pay] 微信回调验签失败')
      return fail('invalid signature')
    }
    try {
      const event = JSON.parse(rawBody)
      if (event?.event_type !== 'TRANSACTION.SUCCESS') return { status: 204, body: '' }
      const tx = wechat.decryptResource(event.resource || {})
      const orderNo = String(tx.out_trade_no || '')
      const order = repo.getOrder(orderNo)
      if (!order || order.channel !== 'wechat' || !wechat.isPaidTransactionFor(tx, orderNo, order.amountFen)) {
        console.warn('[cloud-pay] 微信回调与订单不一致', orderNo)
        return fail('order mismatch')
      }
      fulfill({ orderNo, channel: 'wechat', transactionId: String(tx.transaction_id || ''), paidFen: order.amountFen, source: 'notify' })
      return { status: 204, body: '' }
    } catch (error) {
      console.error('[cloud-pay] 微信回调处理失败', (error as Error).message)
      return { status: 500, body: JSON.stringify({ code: 'FAIL', message: 'retry' }) }
    }
  }

  function handleAlipayNotify(rawBody: string): string {
    const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>
    if (!alipay.isConfigured() || !alipay.verifyNotify(params)) {
      console.warn('[cloud-pay] 支付宝通知验签失败')
      return 'failure'
    }
    try {
      const orderNo = String(params.out_trade_no || '')
      const order = repo.getOrder(orderNo)
      if (!order || order.channel !== 'alipay') return 'failure'
      if (params.trade_status !== 'TRADE_SUCCESS' && params.trade_status !== 'TRADE_FINISHED') return 'success'
      if (!alipay.isPaidTradeFor(params, orderNo, order.amountFen)) {
        console.warn('[cloud-pay] 支付宝通知与订单不一致', orderNo)
        return 'failure'
      }
      fulfill({ orderNo, channel: 'alipay', transactionId: String(params.trade_no || ''), paidFen: order.amountFen, source: 'notify' })
      return 'success'
    } catch (error) {
      console.error('[cloud-pay] 支付宝通知处理失败', (error as Error).message)
      return 'failure'
    }
  }

  /* ------------------------------------------------------------------ 兑换码 */

  function redeem(user: UserRow, rawCode: string, ip: string): CloudEntitlement {
    return redeemDetailed(user, rawCode, ip).entitlement
  }

  /** 兑换卡密：套餐卡加时长 + 点数，点数卡只加点数。返回兑换结果给界面提示 */
  function redeemDetailed(user: UserRow, rawCode: string, ip: string) {
    // 用户粘贴时可能带空格、小写或漏掉分隔符
    const compact = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const code = compact.length === 16 ? compact.match(/.{4}/g)!.join('-') : String(rawCode || '').trim().toUpperCase()
    const throttleKey = `redeem|${user.id}`
    throttle.assertAllowed(throttleKey, now())
    // 失败也要计入防爆破次数：事务回滚不能把这次失败一起撤掉，所以在事务外记
    let failed = false
    let result: { kind: CloudRedeemKind; days: number; credits: number; planName: string | null }
    try {
      result = transaction(db, () => {
        const record = repo.getRedeemCode(code)
        if (!record || record.status !== 'unused') {
          failed = true
          throw badRequest(record?.status === 'used' ? '兑换码已被使用' : record?.status === 'disabled' ? '兑换码已作废' : '兑换码无效')
        }
        if (record.expiresAt && record.expiresAt < now()) throw badRequest('兑换码已过期')
        if (!repo.markRedeemUsed(code, user.id, now())) throw badRequest('兑换码已被使用')
        let planName: string | null = null
        if (record.kind === 'plan') {
          const plan = repo.getPlan(record.planCode)
          if (!plan) throw badRequest('兑换码对应的套餐已删除，请联系客服')
          grantPlan(repo.getUserById(user.id)!, { code: plan.code, days: record.days })
          planName = plan.name
        }
        if (record.credits > 0) billing.applyCreditsInTx({ userId: user.id, delta: record.credits, kind: 'redeem', ref: code, note: planName ?? '点数卡' })
        return { kind: record.kind, days: record.kind === 'plan' ? record.days : 0, credits: record.credits, planName }
      })
    } catch (error) {
      if (failed) throttle.fail(throttleKey, now())
      throw error
    }
    throttle.succeed(throttleKey)
    audit({ user, ip }, 'redeem.use', code, result)
    const fresh = repo.getUserById(user.id)!
    return { entitlement: entitlementFor(fresh), redeemed: result, credits: billing.balance(user.id) }
  }

  /* ------------------------------------------------------------------ 配置 */

  /** managedAi：后台是否统一配置了 AI 平台（Key 只在服务器）。是的话各端不给普通用户显示平台 / 模型 / 七牛设置 */
  function publicConfig(): { values: Record<string, unknown>; version: string; managedAi: boolean } {
    const entries = repo.listConfig('public')
    const values: Record<string, unknown> = {}
    let latest = 0
    for (const entry of entries) {
      values[entry.key] = entry.value
      latest = Math.max(latest, entry.updatedAt)
    }
    return { values, version: `${entries.length}-${latest}`, managedAi: readManagedSettings().settings.enabled }
  }

  /* ------------------------------------------------------------------ 软件设置下发 */

  function readManagedSettings(): { settings: ManagedSoftwareSettings; updatedAt: number } {
    const entry = repo.listConfig('private').find((item) => item.key === MANAGED_SETTINGS_KEY)
    if (!entry) return { settings: createDefaultManagedSettings(), updatedAt: 0 }
    return { settings: normalizeManagedSettings(entry.value), updatedAt: entry.updatedAt }
  }

  /* ------------------------------------------------------------------ AI 代理令牌 */

  const PROXY_TOKEN_TTL_MS = 30 * DAY
  const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url')

  /** 代理令牌 = 签名的 {用户, 会话, 机器码, 过期时间}；每次使用都会重新检查会话、会员和设备，退出登录 / 解绑立即失效 */
  function issueAiProxyToken(user: UserRow, sessionTokenHash: string, machineId: string) {
    const payload = b64url(JSON.stringify({ v: 1, sub: user.id, sh: sessionTokenHash, mid: machineId, exp: now() + PROXY_TOKEN_TTL_MS }))
    const sig = b64url(createHmac('sha256', proxySecret).update(payload).digest())
    return `vgp1.${payload}.${sig}`
  }

  function verifyAiProxyToken(token: string): { userId: string } {
    const parts = String(token || '').split('.')
    if (parts.length !== 3 || parts[0] !== 'vgp1') throw unauthorized('代理令牌无效，请重新登录软件')
    const expected = createHmac('sha256', proxySecret).update(parts[1]).digest()
    const actual = Buffer.from(parts[2], 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw unauthorized('代理令牌无效，请重新登录软件')
    let payload: { sub?: string; sh?: string; mid?: string; exp?: number }
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    } catch {
      throw unauthorized('代理令牌无效，请重新登录软件')
    }
    const t = now()
    if (!payload.sub || !payload.sh || !payload.mid || !payload.exp || payload.exp <= t) throw unauthorized('代理令牌已过期，请联网后重启软件')
    const session = repo.getSession(payload.sh)
    if (!session || session.revokedAt || session.expiresAt <= t || session.userId !== payload.sub) throw unauthorized('登录已失效，请重新登录')
    const user = repo.getUserById(payload.sub)
    if (!user) throw unauthorized('登录已失效，请重新登录')
    if (user.status !== 'active') throw new CloudError('ACCOUNT_DISABLED', '账号已被停用，请联系客服', 403)
    if (!entitlementFor(user).active) throw new CloudError('NO_ENTITLEMENT', '会员已过期，续费后才能继续生成', 402)
    if (!repo.getActiveDeviceByMachine(user.id, payload.mid)) throw forbidden('本机已解绑，请重新登录')
    return { userId: user.id }
  }

  /**
   * 只下发给会员有效、且本机设备处于绑定状态的客户端。
   * 平台 Key、TikHub Key、七牛 AK/SK 都不下发：客户端拿到去密钥的设置 + 代理令牌，生成请求走云端代理。
   */
  function clientManagedSettings(user: UserRow, machineId: string, sessionTokenHash: string) {
    const entitlement = entitlementFor(user)
    if (!entitlement.active) throw new CloudError('NO_ENTITLEMENT', '当前账号没有有效会员', 402)
    if (!machineId || !repo.getActiveDeviceByMachine(user.id, machineId)) throw forbidden('本机未激活')
    const { settings, updatedAt } = readManagedSettings()
    if (!settings.enabled) return { settings: null, version: String(updatedAt), proxyToken: null }
    return { settings: stripManagedSecretsForClient(settings), version: String(updatedAt), proxyToken: issueAiProxyToken(user, sessionTokenHash, machineId) }
  }

  /** 七牛单次上传凭证：只能写云端指定的这一个对象名，1 小时内有效 */
  function qiniuUploadGrant(user: UserRow, machineId: string, input: { fileName?: unknown; keyPrefix?: unknown }) {
    const entitlement = entitlementFor(user)
    if (!entitlement.active) throw new CloudError('NO_ENTITLEMENT', '当前账号没有有效会员', 402)
    if (!machineId || !repo.getActiveDeviceByMachine(user.id, machineId)) throw forbidden('本机未激活')
    const { settings } = readManagedSettings()
    const q = settings.qiniu
    if (!settings.enabled || !q.accessKey || !q.secretKey || !q.bucket || !q.domain) throw forbidden('后台没有配置七牛云存储，请联系客服')
    const fileName = String(input.fileName || 'asset.png').slice(-120)
    const key = qiniuObjectKey({ prefix: qiniuPrefixOf(q.prefix), keyPrefix: String(input.keyPrefix || ''), fileName })
    return {
      token: qiniuUploadToken({ accessKey: q.accessKey, secretKey: q.secretKey, bucket: q.bucket, key }),
      key,
      uploadHost: qiniuUploadHostOf(q.uploadHost),
      domain: qiniuDomainOf(q.domain),
    }
  }

  function adminGetManagedSettings() {
    const { settings, updatedAt } = readManagedSettings()
    return { settings: maskManagedSettings(settings), updatedAt }
  }

  function adminSaveManagedSettings(actor: Actor, input: unknown) {
    if (actor.user.role !== 'super_admin') throw forbidden('仅超级管理员可修改软件设置')
    const previous = readManagedSettings().settings
    const merged = mergeManagedSecrets(normalizeManagedSettings(input), previous)
    repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: merged, scope: 'private', description: '软件设置（平台密钥、默认模型、存储）', updatedBy: actor.user.id, now: now() })
    audit(actor, 'admin.software.update', MANAGED_SETTINGS_KEY, {
      enabled: merged.enabled,
      capabilities: merged.capabilities,
      platformsWithKey: Object.entries(merged.platforms).filter(([, v]) => v.apiKey).map(([k]) => k),
      qiniuBucket: merged.qiniu.bucket,
    })
    return adminGetManagedSettings()
  }

  /* ------------------------------------------------------------------ 管理后台 */

  function clampPage(page: unknown, pageSize: unknown) {
    return {
      page: Math.max(1, Number.parseInt(String(page ?? '1'), 10) || 1),
      pageSize: Math.min(100, Math.max(1, Number.parseInt(String(pageSize ?? '20'), 10) || 20)),
    }
  }

  function revenueTrend(startOfToday: number) {
    const days = 14
    const start = startOfToday - (days - 1) * DAY
    const buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date(start + i * DAY + 8 * 60 * 60 * 1000)
      return { date: `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`, fen: 0, count: 0 }
    })
    for (const order of repo.listPaidSince(start)) {
      const index = Math.floor((order.paidAt - start) / DAY)
      if (index >= 0 && index < days) {
        buckets[index].fen += order.fen
        buckets[index].count += 1
      }
    }
    return buckets
  }

  function adminStats(): CloudAdminStats {
    const t = now()
    const startOfToday = t - ((t + 8 * 60 * 60 * 1000) % DAY)
    const last30 = repo.revenueSince(t - 30 * DAY)
    return {
      users: repo.countUsers(),
      activeSubscribers: repo.countActiveSubscribers(t),
      newUsers7d: repo.countUsersSince(t - 7 * DAY),
      paidOrders30d: last30.count,
      revenue30dFen: last30.fen,
      revenueTodayFen: repo.revenueSince(startOfToday).fen,
      devices: repo.countActiveDevices(),
      revenueTrend: revenueTrend(startOfToday),
    }
  }

  function adminUserDetail(userId: string): CloudAdminUserDetail {
    const user = repo.getUserById(userId)
    if (!user) throw notFound('用户不存在')
    return {
      user: publicUser(user),
      entitlement: entitlementFor(user),
      devices: repo.listActiveDevices(user.id),
      orders: repo.listOrders({ userId: user.id, page: 1, pageSize: 50 }).items,
      credits: billing.balance(user.id),
      ledger: billing.ledger(user.id, 1, 50).items,
      holds: billing.recentHolds(user.id, 50),
    }
  }

  function adminAdjustCredits(actor: Actor, userId: string, input: { delta: unknown; note?: unknown }) {
    if (actor.user.role !== 'super_admin') throw forbidden('仅超级管理员可调整点数')
    const user = repo.getUserById(userId)
    if (!user) throw notFound('用户不存在')
    const delta = Math.trunc(Number(input.delta))
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 10_000_000) throw badRequest('调整数量无效')
    const note = String(input.note ?? '').trim().slice(0, 200)
    if (!note) throw badRequest('请填写调整原因')
    const balance = transaction(db, () => billing.applyCreditsInTx({ userId, delta, kind: 'admin', note, actorUserId: actor.user.id, clampAtZero: true }))
    audit(actor, 'admin.credits.adjust', userId, { delta, note, balance })
    return adminUserDetail(userId)
  }

  async function adminCreateUser(actor: Actor, input: { account: string; password: string; displayName?: string; role?: CloudUserRole; planCode?: string; days?: number }) {
    const role = input.role ?? 'user'
    if (role !== 'user' && actor.user.role !== 'super_admin') throw forbidden('仅超级管理员可创建管理员')
    const user = await createUser({ ...input, role })
    if (input.planCode) {
      const plan = repo.getPlan(input.planCode)
      if (!plan) throw badRequest('套餐不存在')
      grantPlan(user, { code: plan.code, days: Number(input.days ?? plan.days) })
    }
    audit(actor, 'admin.user.create', user.id, { account: user.account, role, planCode: input.planCode ?? null })
    return adminUserDetail(user.id)
  }

  async function adminPatchUser(actor: Actor, userId: string, patch: CloudAdminUserPatch) {
    const user = repo.getUserById(userId)
    if (!user) throw notFound('用户不存在')
    const isSuper = actor.user.role === 'super_admin'
    if (!isSuper && (user.role !== 'user' || patch.role !== undefined || patch.unlimited !== undefined)) {
      throw forbidden('仅超级管理员可修改角色、不受限权限或管理员账号')
    }
    if (user.id === actor.user.id && (patch.role !== undefined || patch.status === 'disabled')) {
      throw badRequest('不能修改自己的角色或停用自己')
    }
    const t = now()
    const next: Parameters<CloudRepo['updateUser']>[1] = {}
    if (patch.displayName !== undefined) next.displayName = String(patch.displayName).trim().slice(0, 40)
    if (patch.role !== undefined) {
      if (!['user', 'admin', 'super_admin'].includes(patch.role)) throw badRequest('角色无效')
      next.role = patch.role
    }
    if (patch.status !== undefined) {
      if (!['active', 'disabled'].includes(patch.status)) throw badRequest('状态无效')
      next.status = patch.status
    }
    if (patch.unlimited !== undefined) next.unlimited = Boolean(patch.unlimited)
    if (patch.planCode !== undefined) {
      if (patch.planCode !== null && !repo.getPlan(patch.planCode)) throw badRequest('套餐不存在')
      next.planCode = patch.planCode
    }
    if (patch.planExpiresAt !== undefined) next.planExpiresAt = patch.planExpiresAt === null ? null : Number(patch.planExpiresAt)
    if (patch.extendDays !== undefined) {
      const days = Number(patch.extendDays)
      if (!Number.isFinite(days) || days === 0) throw badRequest('延长天数无效')
      const base = Math.max(t, user.planExpiresAt ?? 0)
      next.planExpiresAt = Math.min(CLOUD_PERMANENT_EXPIRES_AT, base + days * DAY)
      if (!user.planCode && patch.planCode === undefined) next.planCode = repo.listPlans(false)[0]?.code ?? null
    }
    if (patch.password !== undefined) {
      validatePassword(String(patch.password))
      next.passwordHash = await hashPassword(String(patch.password))
    }
    repo.updateUser(user.id, next, t)
    if (patch.status === 'disabled' || patch.password !== undefined) repo.revokeUserSessions(user.id, t)
    const { password: _omit, ...auditPatch } = patch
    audit(actor, 'admin.user.update', user.id, { ...auditPatch, passwordReset: patch.password !== undefined })
    return adminUserDetail(user.id)
  }

  function adminRevokeDevice(actor: Actor, userId: string, deviceId: string) {
    const device = repo.getActiveDevice(userId, deviceId)
    if (!device) throw notFound('设备不存在')
    repo.revokeDevice(device.id, 'admin', now())
    repo.revokeUserSessions(userId, now(), device.machineId)
    audit(actor, 'admin.device.revoke', device.id, { userId, machineId: device.machineId })
    return adminUserDetail(userId)
  }

  function adminUpsertPlan(actor: Actor, input: Partial<CloudPlan> & { code: string }) {
    const code = String(input.code || '').trim()
    if (!/^[a-z0-9_-]{2,32}$/.test(code)) throw badRequest('套餐编码只能是 2-32 位小写字母、数字、- 或 _')
    const existing = repo.getPlan(code)
    const features = (input.features ?? existing?.features ?? ['*']).filter((item): item is CloudFeature => item === '*' || (CLOUD_FEATURES as readonly string[]).includes(item))
    const plan: CloudPlan = {
      code,
      name: String(input.name ?? existing?.name ?? '').trim(),
      description: String(input.description ?? existing?.description ?? '').trim(),
      days: Math.max(0, Math.floor(Number(input.days ?? existing?.days ?? 30))),
      amountFen: Math.max(0, Math.floor(Number(input.amountFen ?? existing?.amountFen ?? 0))),
      maxDevices: Math.max(0, Math.floor(Number(input.maxDevices ?? existing?.maxDevices ?? 1))),
      features,
      active: input.active ?? existing?.active ?? true,
      sort: Math.floor(Number(input.sort ?? existing?.sort ?? 0)),
      credits: Math.max(0, Math.min(10_000_000, Math.floor(Number(input.credits ?? existing?.credits ?? 0) || 0))),
      quotas: normalizePlanQuotas(input.quotas ?? existing?.quotas ?? defaultPlanQuotas()),
    }
    if (!plan.name) throw badRequest('请填写套餐名称')
    repo.upsertPlan(plan, now())
    audit(actor, existing ? 'admin.plan.update' : 'admin.plan.create', code, plan)
    return repo.getPlan(code)!
  }

  function adminRefundOrder(actor: Actor, orderNo: string, input: { revokeDays: boolean; note?: string }) {
    const order = repo.getOrder(orderNo)
    if (!order) throw notFound('订单不存在')
    if (order.status !== 'paid') throw badRequest('只有已支付订单可以标记退款')
    transaction(db, () => {
      repo.setOrderStatus(orderNo, 'refunded', now(), String(input.note || '').slice(0, 200))
      if (input.revokeDays && order.days > 0) {
        const user = repo.getUserById(order.userId)
        if (user?.planExpiresAt && user.planExpiresAt < CLOUD_PERMANENT_EXPIRES_AT) {
          repo.updateUser(user.id, { planExpiresAt: Math.max(now(), user.planExpiresAt - order.days * DAY) }, now())
        }
      }
      // 收回这笔订单送的点数（已经用掉的部分最多扣到 0）
      if (input.revokeDays && order.credits > 0) {
        billing.applyCreditsInTx({ userId: order.userId, delta: -order.credits, kind: 'order_refund', ref: orderNo, note: '订单退款收回点数', actorUserId: actor.user.id, clampAtZero: true })
      }
    })
    audit(actor, 'admin.order.refund', orderNo, input)
    return repo.getOrder(orderNo)!
  }

  function adminGenerateRedeemCodes(
    actor: Actor,
    input: { kind?: CloudRedeemKind; planCode?: string; days?: number | null; credits?: number | null; count: number; note?: string; channel?: string; expiresAt?: number | null },
  ) {
    const blank = (value: unknown) => value === undefined || value === null || value === ''
    const kind: CloudRedeemKind = input.kind === 'credits' ? 'credits' : 'plan'
    const count = Math.floor(Number(input.count))
    if (!Number.isFinite(count) || count < 1 || count > 1000) throw badRequest('单次生成 1-1000 个')
    let planCode = ''
    let days = 0
    let credits = 0
    if (kind === 'plan') {
      const plan = repo.getPlan(String(input.planCode || ''))
      if (!plan) throw badRequest('套餐不存在')
      planCode = plan.code
      days = blank(input.days) ? plan.days : Math.floor(Number(input.days))
      if (!Number.isFinite(days) || days < 0) throw badRequest('天数无效')
      credits = blank(input.credits) ? plan.credits : Math.floor(Number(input.credits))
      if (!Number.isFinite(credits) || credits < 0) throw badRequest('点数无效')
    } else {
      credits = Math.floor(Number(input.credits))
      if (!Number.isFinite(credits) || credits < 1 || credits > 10_000_000) throw badRequest('点数卡的点数必须大于 0')
    }
    let expiresAt: number | null = null
    if (!blank(input.expiresAt)) {
      expiresAt = Number(input.expiresAt)
      if (!Number.isFinite(expiresAt) || expiresAt <= now()) throw badRequest('兑换截止时间必须晚于现在')
    }
    const channel = String(input.channel || '').trim().slice(0, 60)
    const batchId = newId('b')
    const codes: string[] = []
    transaction(db, () => {
      while (codes.length < count) {
        const code = newRedeemCode()
        if (repo.getRedeemCode(code)) continue
        repo.insertRedeemCode({ code, kind, planCode, days, credits, expiresAt, channel, batchId, note: String(input.note || '').slice(0, 100), createdBy: actor.user.id, now: now() })
        codes.push(code)
      }
    })
    audit(actor, 'admin.redeem.generate', batchId, { kind, planCode, days, credits, count, channel, expiresAt })
    return { batchId, codes }
  }

  function requireSuper(actor: Actor, what: string) {
    if (actor.user.role !== 'super_admin') throw forbidden(`仅超级管理员可${what}`)
  }

  function adminBillingOverview() {
    return { defaults: billing.readDefaults(), models: billing.listModels() }
  }

  function adminSaveBillingDefaults(actor: Actor, input: unknown) {
    requireSuper(actor, '修改计费价格')
    const defaults = billing.saveDefaults(input, actor.user.id)
    audit(actor, 'admin.billing.defaults', 'billing', defaults)
    return adminBillingOverview()
  }

  function adminUpsertModel(actor: Actor, input: Record<string, unknown>) {
    requireSuper(actor, '修改模型')
    const model = billing.upsertModel(input as any)
    audit(actor, input.id ? 'admin.model.update' : 'admin.model.create', model.id, model)
    return adminBillingOverview()
  }

  function adminDeleteModel(actor: Actor, id: string) {
    requireSuper(actor, '删除模型')
    billing.deleteModel(id)
    audit(actor, 'admin.model.delete', id)
    return adminBillingOverview()
  }

  function adminSetRedeemBatchStatus(actor: Actor, batchId: string, status: 'unused' | 'disabled') {
    const changed = repo.setRedeemBatchStatus(batchId, status)
    audit(actor, 'admin.redeem.batch-status', batchId, { status, changed })
    return { changed }
  }

  function adminSetRedeemStatus(actor: Actor, code: string, status: 'unused' | 'disabled') {
    const record = repo.getRedeemCode(code)
    if (!record) throw notFound('兑换码不存在')
    if (record.status === 'used') throw badRequest('已使用的兑换码不能修改')
    repo.setRedeemStatus(code, status)
    audit(actor, 'admin.redeem.status', code, { status })
    return repo.getRedeemCode(code)!
  }

  function adminUpsertConfig(actor: Actor, input: { key: string; value: unknown; scope?: 'public' | 'private'; description?: string }) {
    const key = String(input.key || '').trim()
    if (!/^[a-zA-Z0-9_.-]{2,80}$/.test(key)) throw badRequest('配置键只能包含字母、数字、. _ -')
    if (key.startsWith(RESERVED_CONFIG_PREFIX)) throw badRequest('软件设置请在「软件设置」页面修改')
    const existing = repo.listConfig().find((entry) => entry.key === key)
    const scope = input.scope ?? existing?.scope ?? 'public'
    repo.upsertConfig({ key, value: input.value, scope, description: String(input.description ?? existing?.description ?? ''), updatedBy: actor.user.id, now: now() })
    audit(actor, 'admin.config.update', key, { scope, value: scope === 'private' ? '[hidden]' : input.value })
    return repo.listConfig().find((entry) => entry.key === key)!
  }

  function adminDeleteConfig(actor: Actor, key: string) {
    if (key.startsWith(RESERVED_CONFIG_PREFIX)) throw badRequest('软件设置请在「软件设置」页面修改')
    repo.deleteConfig(key)
    audit(actor, 'admin.config.delete', key)
  }

  /* ------------------------------------------------------------------ 初始化 */

  const initialAdminFile = () => join(config.dataDir, 'initial-admin-password.txt')

  /**
   * 首次部署：还没有超级管理员时自动创建一个，登录后必须先改密码。
   * 仓库是公开的，所以不写死默认密码：账号 / 密码取环境变量 CLOUD_ADMIN_ACCOUNT / CLOUD_ADMIN_PASSWORD，
   * 没填密码就随机生成，写到数据目录的 initial-admin-password.txt 并打印到服务日志。
   */
  async function ensureDefaultAdmin(input: { account?: string; password?: string } = {}) {
    const hasSuperAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1").get()
    if (hasSuperAdmin) return null
    const account = normalizeAccount(input.account || 'admin@tiktokcut.local')
    const password = input.password || randomBytes(9).toString('base64url')
    validatePassword(password)
    const passwordHash = await hashPassword(password)
    if (db.prepare("SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1").get()) return null
    const existing = repo.getUserByAccount(account)
    const t = now()
    if (existing) {
      repo.updateUser(existing.id, { role: 'super_admin', status: 'active', passwordHash, mustChangePassword: true }, t)
      repo.revokeUserSessions(existing.id, t)
    } else {
      const id = newId('u')
      repo.insertUser({ id, account, passwordHash, displayName: '超级管理员', role: 'super_admin', now: t })
      repo.updateUser(id, { mustChangePassword: true }, t)
    }
    audit(null, 'system.create-default-admin', account)
    const generated = !input.password
    if (generated) {
      try {
        mkdirSync(config.dataDir, { recursive: true })
        writeFileSync(initialAdminFile(), `管理后台初始账号（登录后会要求改密码，改完本文件自动删除）
账号：${account}
密码：${password}
`, { mode: 0o600 })
      } catch (error) {
        console.warn('[videogen-cloud] 写入初始管理员密码文件失败', (error as Error).message)
      }
    }
    console.log(
      `[videogen-cloud] 已创建超级管理员 ${account}` +
        (generated ? `，初始密码：${password}（也保存在 ${initialAdminFile()}）` : '，密码为 CLOUD_ADMIN_PASSWORD') +
        '。登录后台后会要求先修改密码。',
    )
    return { account, generated }
  }

  function ensureSeed() {
    if (repo.countPlans() === 0) {
      for (const plan of DEFAULT_PLANS) repo.upsertPlan(plan, now())
    }
    const existing = new Set(repo.listConfig().map((entry) => entry.key))
    for (const entry of DEFAULT_CONFIG) {
      if (!existing.has(entry.key)) repo.upsertConfig({ ...entry, updatedBy: null, now: now() })
    }
  }

  return {
    /** 仅云端内部使用：服务器复刻引擎子进程的登录会话 */
    issueEngineSession: (userId: string) => {
      const user = repo.getUserById(userId)
      if (!user) throw unauthorized()
      return issueSession(user, 'web', null)
    },
    revokeSessionToken: (token: string) => repo.revokeSession(sha256(token), now()),
    /** 仅云端内部使用（AI 网关读取平台密钥），不对外返回 */
    readManagedSettings: () => readManagedSettings().settings,
    ensureSeed,
    ensureDefaultAdmin,
    availableChannels,
    entitlementFor,
    createUser,
    register,
    login,
    authenticate,
    logout,
    me,
    changePassword,
    activateDevice,
    unbindOwnDevice,
    listPlans,
    createOrder,
    getOwnOrder,
    mockPay,
    fulfill,
    handleWechatNotify,
    handleAlipayNotify,
    redeem,
    redeemDetailed,
    billing,
    publicConfig,
    clientManagedSettings,
    verifyAiProxyToken,
    qiniuUploadGrant,
    listOwnOrders: (user: UserRow, page: unknown, pageSize: unknown) => {
      const p = clampPage(page, pageSize)
      return { ...repo.listOrders({ userId: user.id, ...p }), ...p }
    },
    admin: {
      stats: adminStats,
      listUsers: (q: Record<string, string>) => {
        const p = clampPage(q.page, q.pageSize)
        return { ...repo.listUsers({ keyword: q.keyword?.trim(), role: q.role, status: q.status, ...p }), ...p }
      },
      userDetail: adminUserDetail,
      createUser: adminCreateUser,
      patchUser: adminPatchUser,
      revokeDevice: adminRevokeDevice,
      listPlans: () => repo.listPlans(true),
      upsertPlan: adminUpsertPlan,
      listOrders: (q: Record<string, string>) => {
        const p = clampPage(q.page, q.pageSize)
        return { ...repo.listOrders({ status: q.status, keyword: q.keyword?.trim(), userId: q.userId, ...p }), ...p }
      },
      refundOrder: adminRefundOrder,
      listRedeemCodes: (q: Record<string, string>) => {
        const p = clampPage(q.page, q.pageSize)
        return { ...repo.listRedeemCodes({ batchId: q.batchId, status: q.status, keyword: q.keyword?.trim(), ...p }), ...p }
      },
      generateRedeemCodes: adminGenerateRedeemCodes,
      setRedeemStatus: adminSetRedeemStatus,
      setRedeemBatchStatus: adminSetRedeemBatchStatus,
      exportRedeemBatch: (batchId: string) => ({ codes: repo.listRedeemBatch(batchId) }),
      adjustCredits: adminAdjustCredits,
      billing: adminBillingOverview,
      saveBillingDefaults: adminSaveBillingDefaults,
      upsertModel: adminUpsertModel,
      deleteModel: adminDeleteModel,
      usageStats: (days: unknown) => billing.usageStats(Math.max(1, Math.min(365, Math.floor(Number(days) || 30)))),
      listConfig: () => repo.listConfig().filter((entry) => !entry.key.startsWith(RESERVED_CONFIG_PREFIX)),
      getManagedSettings: adminGetManagedSettings,
      saveManagedSettings: adminSaveManagedSettings,
      upsertConfig: adminUpsertConfig,
      deleteConfig: adminDeleteConfig,
      listAudit: (q: Record<string, string>) => {
        const p = clampPage(q.page, q.pageSize)
        return { ...repo.listAudit({ keyword: q.keyword?.trim(), ...p }), ...p }
      },
      channels: availableChannels,
    },
  }
}

export type CloudService = ReturnType<typeof createCloudService>
