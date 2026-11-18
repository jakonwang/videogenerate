import { createPrivateKey, type KeyObject } from 'node:crypto'
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
  type ManagedSoftwareSettings,
} from '../../../src/shared/cloud/managedSettings'
import type { CloudConfig } from './config'
import { transaction, type CloudDb } from './db'
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
  { code: 'month', name: '月度会员', description: '全部功能，1 台电脑 + 1 部手机', days: 30, amountFen: 9900, maxDevices: 1, features: ['*'], active: true, sort: 10 },
  { code: 'quarter', name: '季度会员', description: '全部功能，2 台电脑 + 1 部手机', days: 90, amountFen: 26900, maxDevices: 2, features: ['*'], active: true, sort: 20 },
  { code: 'year', name: '年度会员', description: '全部功能，3 台电脑 + 1 部手机', days: 365, amountFen: 89900, maxDevices: 3, features: ['*'], active: true, sort: 30 },
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
    repo.updateUser(user.id, { passwordHash: await hashPassword(newPassword) }, now())
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
    const code = String(rawCode || '').trim().toUpperCase()
    const throttleKey = `redeem|${user.id}`
    throttle.assertAllowed(throttleKey, now())
    transaction(db, () => {
      const record = repo.getRedeemCode(code)
      if (!record || record.status !== 'unused') {
        throttle.fail(throttleKey, now())
        throw badRequest(record?.status === 'used' ? '兑换码已被使用' : '兑换码无效')
      }
      if (!repo.markRedeemUsed(code, user.id, now())) throw badRequest('兑换码已被使用')
      grantPlan(repo.getUserById(user.id)!, { code: record.planCode, days: record.days })
    })
    throttle.succeed(throttleKey)
    audit({ user, ip }, 'redeem.use', code)
    return entitlementFor(repo.getUserById(user.id)!)
  }

  /* ------------------------------------------------------------------ 配置 */

  function publicConfig(): { values: Record<string, unknown>; version: string } {
    const entries = repo.listConfig('public')
    const values: Record<string, unknown> = {}
    let latest = 0
    for (const entry of entries) {
      values[entry.key] = entry.value
      latest = Math.max(latest, entry.updatedAt)
    }
    return { values, version: `${entries.length}-${latest}` }
  }

  /* ------------------------------------------------------------------ 软件设置下发 */

  function readManagedSettings(): { settings: ManagedSoftwareSettings; updatedAt: number } {
    const entry = repo.listConfig('private').find((item) => item.key === MANAGED_SETTINGS_KEY)
    if (!entry) return { settings: createDefaultManagedSettings(), updatedAt: 0 }
    return { settings: normalizeManagedSettings(entry.value), updatedAt: entry.updatedAt }
  }

  /** 只下发给会员有效、且本机设备处于绑定状态的客户端 */
  function clientManagedSettings(user: UserRow, machineId: string) {
    const entitlement = entitlementFor(user)
    if (!entitlement.active) throw new CloudError('NO_ENTITLEMENT', '当前账号没有有效会员', 402)
    if (!machineId || !repo.getActiveDeviceByMachine(user.id, machineId)) throw forbidden('本机未激活')
    const { settings, updatedAt } = readManagedSettings()
    return { settings: settings.enabled ? settings : null, version: String(updatedAt) }
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
    }
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
    })
    audit(actor, 'admin.order.refund', orderNo, input)
    return repo.getOrder(orderNo)!
  }

  function adminGenerateRedeemCodes(actor: Actor, input: { planCode: string; days?: number; count: number; note?: string }) {
    const plan = repo.getPlan(String(input.planCode || ''))
    if (!plan) throw badRequest('套餐不存在')
    const count = Math.floor(Number(input.count))
    if (!Number.isFinite(count) || count < 1 || count > 1000) throw badRequest('单次生成 1-1000 个')
    const days = input.days === undefined || input.days === null ? plan.days : Math.max(0, Math.floor(Number(input.days)))
    const batchId = newId('b')
    const codes: string[] = []
    transaction(db, () => {
      while (codes.length < count) {
        const code = newRedeemCode()
        if (repo.getRedeemCode(code)) continue
        repo.insertRedeemCode({ code, planCode: plan.code, days, batchId, note: String(input.note || '').slice(0, 100), createdBy: actor.user.id, now: now() })
        codes.push(code)
      }
    })
    audit(actor, 'admin.redeem.generate', batchId, { planCode: plan.code, days, count })
    return { batchId, codes }
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
    publicConfig,
    clientManagedSettings,
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
