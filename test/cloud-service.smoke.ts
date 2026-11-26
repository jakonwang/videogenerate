/**
 * 云端服务冒烟测试：真实 HTTP 服务 + 临时数据库 + 临时密钥。
 * 覆盖：注册登录、设备激活与上限、授权令牌验签、模拟支付、微信 / 支付宝回调验签与金额校验、
 * 兑换码、管理后台（用户、套餐、订单退款、配置、审计）、不受限账号。
 * 运行：npm run test:cloud
 */
import assert from 'node:assert/strict'
import { createCipheriv, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCloudApp } from '../services/cloud/src/app'
import { buildAlipaySignContent } from '../services/cloud/src/payments/alipay'
import { buildWechatResponseMessage } from '../services/cloud/src/payments/wechatPayV3'
import { hashPassword, newId } from '../services/cloud/src/security'
import { checkEntitlementToken } from '../src/shared/cloud/entitlementToken'
import { applyManagedSettings, createDefaultManagedSettings, toProxiedManagedSettings } from '../src/shared/cloud/managedSettings'

const dir = mkdtempSync(join(tmpdir(), 'vg-cloud-'))
const pem = (key: any, type: 'pkcs8' | 'spki') => key.export({ type, format: 'pem' }).toString()

const entitlement = generateKeyPairSync('ed25519')
const wechatMerchant = generateKeyPairSync('rsa', { modulusLength: 2048 })
const wechatPlatform = generateKeyPairSync('rsa', { modulusLength: 2048 })
const alipayApp = generateKeyPairSync('rsa', { modulusLength: 2048 })
const alipayPlatform = generateKeyPairSync('rsa', { modulusLength: 2048 })
const files = {
  entitlement: join(dir, 'ent.pem'),
  wxMerchant: join(dir, 'wx-merchant.pem'),
  wxPlatformPub: join(dir, 'wx-platform-pub.pem'),
  aliApp: join(dir, 'ali-app.pem'),
  aliPub: join(dir, 'ali-pub.pem'),
}
writeFileSync(files.entitlement, pem(entitlement.privateKey, 'pkcs8'))
writeFileSync(files.wxMerchant, pem(wechatMerchant.privateKey, 'pkcs8'))
writeFileSync(files.wxPlatformPub, pem(wechatPlatform.publicKey, 'spki'))
writeFileSync(files.aliApp, pem(alipayApp.privateKey, 'pkcs8'))
writeFileSync(files.aliPub, pem(alipayPlatform.publicKey, 'spki'))
const entitlementPublicPem = pem(entitlement.publicKey, 'spki')

const APIV3_KEY = 'abcdefghijklmnopqrstuvwxyz012345'

const app = createCloudApp({
  host: '127.0.0.1',
  port: 0,
  dataDir: dir,
  dbPath: join(dir, 'cloud.sqlite'),
  entitlementPrivateKeyPath: files.entitlement,
  mockPay: true,
  isProduction: false,
  allowRegistration: true,
  publicBaseUrl: 'https://cloud.test',
  wechat: {
    mchid: '1900000001',
    appid: 'wx-test-app',
    merchantSerialNo: 'MERCHANT-SERIAL',
    merchantPrivateKeyPath: files.wxMerchant,
    apiV3Key: APIV3_KEY,
    platformPublicKeyPath: files.wxPlatformPub,
    platformSerial: 'PUB_KEY_ID_TEST',
    apiBase: 'https://wechat.invalid',
  },
  alipay: {
    appId: '2021000000000001',
    appPrivateKeyPath: files.aliApp,
    alipayPublicKeyPath: files.aliPub,
    gateway: 'https://alipay.invalid/gateway.do',
  },
})

let base = ''

async function call(method: string, path: string, options: { token?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  let body: string | undefined
  if (options.raw !== undefined) body = options.raw
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  const res = await fetch(`${base}${path}`, { method, headers, body })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}

let passed = 0
async function step(name: string, fn: () => Promise<void>) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

/** 直接在库里插入订单（不经过渠道下单接口，因为测试里没有真实的微信 / 支付宝） */
function insertChannelOrder(userId: string, channel: 'wechat' | 'alipay', amountFen: number) {
  const orderNo = `VGTEST${Date.now()}${Math.floor(Math.random() * 1e6)}`
  app.repo.insertOrder(
    {
      orderNo,
      userId,
      planCode: 'month',
      planName: '月度会员',
      days: 30,
      amountFen,
      channel,
      status: 'pending',
      qrContent: 'test',
      transactionId: null,
      paidAt: null,
      expireAt: Date.now() + 1800_000,
      createdAt: Date.now(),
      refundedAt: null,
      note: '',
    },
    Date.now(),
  )
  return orderNo
}

function wechatNotify(tx: Record<string, unknown>, opts: { badSignature?: boolean; serial?: string; timestamp?: number } = {}) {
  const nonce = randomBytes(8).toString('hex')
  const iv = randomBytes(6).toString('hex') // 12 字节
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(APIV3_KEY), Buffer.from(iv))
  cipher.setAAD(Buffer.from('transaction'))
  const enc = Buffer.concat([cipher.update(JSON.stringify(tx)), cipher.final(), cipher.getAuthTag()])
  const body = JSON.stringify({
    id: 'EV-1',
    event_type: 'TRANSACTION.SUCCESS',
    resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext: enc.toString('base64'), nonce: iv, associated_data: 'transaction' },
  })
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000))
  const signer = opts.badSignature ? wechatMerchant.privateKey : wechatPlatform.privateKey
  const signature = sign('sha256', Buffer.from(buildWechatResponseMessage(timestamp, nonce, body)), signer).toString('base64')
  return call('POST', '/api/v1/pay/notify/wechat', {
    raw: body,
    headers: {
      'Content-Type': 'application/json',
      'Wechatpay-Timestamp': timestamp,
      'Wechatpay-Nonce': nonce,
      'Wechatpay-Signature': signature,
      'Wechatpay-Serial': opts.serial ?? 'PUB_KEY_ID_TEST',
    },
  })
}

function alipayNotify(params: Record<string, string>, opts: { badSignature?: boolean } = {}) {
  const full: Record<string, string> = { ...params, sign_type: 'RSA2', charset: 'utf-8', notify_time: '2026-11-15 10:00:00' }
  const signer = opts.badSignature ? alipayApp.privateKey : alipayPlatform.privateKey
  full.sign = sign('sha256', Buffer.from(buildAlipaySignContent(full, true)), signer).toString('base64')
  return call('POST', '/api/v1/pay/notify/alipay', {
    raw: new URLSearchParams(full).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

async function main() {
  const port = await app.listen()
  base = `http://127.0.0.1:${port}`
  console.log(`cloud smoke on ${base}`)

  let userToken = ''
  let userId = ''
  const machineA = 'machine-aaaa'

  await step('health 与公共配置、套餐', async () => {
    assert.equal((await call('GET', '/api/v1/health')).json.ok, true)
    const cfg = await call('GET', '/api/v1/client/config')
    assert.ok('client.announcement' in cfg.json.values)
    const plans = await call('GET', '/api/v1/plans')
    assert.equal(plans.json.plans.length, 3)
    assert.deepEqual(plans.json.channels, ['wechat', 'alipay', 'mock'])
  })

  await step('注册、重复注册、登录、错误密码限流', async () => {
    const reg = await call('POST', '/api/v1/auth/register', { body: { account: 'Buyer@Example.com', password: 'password123' } })
    assert.equal(reg.status, 200)
    assert.equal(reg.json.user.account, 'buyer@example.com')
    assert.equal(reg.json.entitlement.active, false)
    assert.equal((await call('POST', '/api/v1/auth/register', { body: { account: 'buyer@example.com', password: 'password123' } })).status, 409)
    assert.equal((await call('POST', '/api/v1/auth/register', { body: { account: 'x@y.com', password: 'short' } })).status, 400)

    const login = await call('POST', '/api/v1/auth/login', { body: { account: 'buyer@example.com', password: 'password123', client: 'desktop', machineId: machineA } })
    assert.equal(login.status, 200)
    userToken = login.json.sessionToken
    userId = login.json.user.id

    await call('POST', '/api/v1/auth/register', { body: { account: 'victim@example.com', password: 'password123' } })
    for (let i = 0; i < 5; i++) {
      const bad = await call('POST', '/api/v1/auth/login', { body: { account: 'victim@example.com', password: 'wrong-pass', client: 'web' } })
      assert.equal(bad.status, 401)
    }
    const locked = await call('POST', '/api/v1/auth/login', { body: { account: 'victim@example.com', password: 'password123', client: 'web' } })
    assert.equal(locked.status, 429)
    // 不存在的账号与错误密码返回同样的错误
    const ghost = await call('POST', '/api/v1/auth/login', { body: { account: 'ghost@example.com', password: 'whatever1', client: 'web' } })
    assert.equal(ghost.status, 401)
    assert.equal(ghost.json.error, '账号或密码错误')
    assert.equal((await call('GET', '/api/v1/me')).status, 401)
  })

  await step('普通用户不能登录后台、不能访问后台接口', async () => {
    const r = await call('POST', '/api/v1/auth/login', { body: { account: 'buyer@example.com', password: 'password123', client: 'admin' } })
    // 账号被上一步限流锁住 → 429；否则应为 403。两者都表示拒绝
    assert.equal(r.status, 403)
    assert.equal((await call('GET', '/api/v1/admin/stats', { token: userToken })).status, 403)
  })

  await step('无会员时激活设备被拒（NO_ENTITLEMENT）', async () => {
    const r = await call('POST', '/api/v1/devices/activate', { token: userToken, body: { machineId: machineA } })
    assert.equal(r.status, 402)
    assert.equal(r.json.code, 'NO_ENTITLEMENT')
  })

  await step('模拟支付下单 → 到账 → 激活设备 → 令牌验签', async () => {
    const created = await call('POST', '/api/v1/orders', { token: userToken, body: { planCode: 'month', channel: 'mock' } })
    assert.equal(created.status, 200)
    const orderNo = created.json.order.orderNo
    assert.equal(created.json.order.amountFen, 9900)
    const paid = await call('POST', `/api/v1/orders/${orderNo}/mock-pay`, { token: userToken })
    assert.equal(paid.json.order.status, 'paid')
    // 重复支付幂等
    await call('POST', `/api/v1/orders/${orderNo}/mock-pay`, { token: userToken })
    const me = await call('GET', '/api/v1/me', { token: userToken })
    assert.equal(me.json.entitlement.active, true)
    const days = (me.json.entitlement.expiresAt - Date.now()) / 86400000
    assert.ok(days > 29.9 && days < 30.1, `应为 30 天，实际 ${days}`)

    const act = await call('POST', '/api/v1/devices/activate', { token: userToken, body: { machineId: machineA, deviceName: 'PC-A', appVersion: '5.0.129' } })
    assert.equal(act.status, 200)
    const check = checkEntitlementToken({ token: act.json.entitlementToken, publicKeyPem: entitlementPublicPem, machineId: machineA, now: Date.now() })
    assert.equal(check.ok, true)
    assert.equal(checkEntitlementToken({ token: act.json.entitlementToken, publicKeyPem: entitlementPublicPem, machineId: 'other', now: Date.now() }).ok, false)
    const tampered = act.json.entitlementToken.replace(/^./, (c: string) => (c === 'e' ? 'f' : 'e'))
    assert.equal(checkEntitlementToken({ token: tampered, publicKeyPem: entitlementPublicPem, machineId: machineA, now: Date.now() }).ok, false)
    if (check.ok) {
      assert.ok(check.payload.exp <= Date.now() + 7 * 86400000 + 1000, '普通用户令牌最长 7 天')
      assert.equal(check.payload.unl, false)
      const expired = checkEntitlementToken({ token: act.json.entitlementToken, publicKeyPem: entitlementPublicPem, machineId: machineA, now: check.payload.exp + 1 })
      assert.equal(expired.ok, false)
    }
  })

  await step('设备数上限与自助解绑', async () => {
    const second = await call('POST', '/api/v1/devices/activate', { token: userToken, body: { machineId: 'machine-bbbb' } })
    assert.equal(second.status, 409)
    assert.equal(second.json.code, 'DEVICE_LIMIT')
    const deviceId = second.json.details.devices[0].id
    const unbind = await call('DELETE', `/api/v1/devices/${deviceId}`, { token: userToken })
    assert.equal(unbind.status, 200)
    // 解绑同机器会话也下线：重新登录
    const relogin = await call('POST', '/api/v1/auth/login', { body: { account: 'buyer@example.com', password: 'password123', client: 'desktop', machineId: 'machine-bbbb' } })
    assert.equal(relogin.status, 200)
    userToken = relogin.json.sessionToken
    const again = await call('POST', '/api/v1/devices/activate', { token: userToken, body: { machineId: 'machine-bbbb' } })
    assert.equal(again.status, 200)
  })

  await step('微信回调：伪造签名 / 错误序列号 / 过期时间戳 / 金额不符都被拒绝，正确回调到账且幂等', async () => {
    const orderNo = insertChannelOrder(userId, 'wechat', 9900)
    const tx = { appid: 'wx-test-app', mchid: '1900000001', out_trade_no: orderNo, transaction_id: '4200000001', trade_state: 'SUCCESS', amount: { total: 9900, currency: 'CNY' } }
    assert.equal((await wechatNotify(tx, { badSignature: true })).status, 400)
    assert.equal((await wechatNotify(tx, { serial: 'OTHER' })).status, 400)
    assert.equal((await wechatNotify(tx, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status, 400)
    assert.equal((await wechatNotify({ ...tx, amount: { total: 1, currency: 'CNY' } })).status, 400)
    assert.equal((await wechatNotify({ ...tx, mchid: '1900000999' })).status, 400)
    assert.equal(app.repo.getOrder(orderNo)!.status, 'pending')
    const before = app.repo.getUserById(userId)!.planExpiresAt!
    assert.equal((await wechatNotify(tx)).status, 204)
    assert.equal(app.repo.getOrder(orderNo)!.status, 'paid')
    assert.equal((await wechatNotify(tx)).status, 204)
    const after = app.repo.getUserById(userId)!.planExpiresAt!
    assert.ok(Math.abs(after - before - 30 * 86400000) < 5000, '只顺延一次 30 天')
  })

  await step('支付宝通知：伪造签名 / 金额不符被拒绝，正确通知到账', async () => {
    const orderNo = insertChannelOrder(userId, 'alipay', 9900)
    const params = { app_id: '2021000000000001', out_trade_no: orderNo, trade_no: '2026111522001', trade_status: 'TRADE_SUCCESS', total_amount: '99.00' }
    assert.equal((await alipayNotify(params, { badSignature: true })).text, 'failure')
    assert.equal((await alipayNotify({ ...params, total_amount: '0.01' })).text, 'failure')
    assert.equal((await alipayNotify({ ...params, app_id: '2021999999999999' })).text, 'failure')
    assert.equal(app.repo.getOrder(orderNo)!.status, 'pending')
    assert.equal((await alipayNotify({ ...params, trade_status: 'WAIT_BUYER_PAY' })).text, 'success')
    assert.equal(app.repo.getOrder(orderNo)!.status, 'pending')
    assert.equal((await alipayNotify(params)).text, 'success')
    assert.equal(app.repo.getOrder(orderNo)!.status, 'paid')
  })

  let adminToken = ''
  await step('超级管理员（不受限账号）登录后台，令牌不受限且不限设备', async () => {
    const id = newId('u')
    app.repo.insertUser({ id, account: 'owner@example.com', passwordHash: await hashPassword('owner-pass-123'), displayName: 'Owner', role: 'super_admin', now: Date.now() })
    const login = await call('POST', '/api/v1/auth/login', { body: { account: 'owner@example.com', password: 'owner-pass-123', client: 'admin' } })
    assert.equal(login.status, 200)
    adminToken = login.json.sessionToken
    assert.equal(login.json.entitlement.unlimited, true)

    const desktop = await call('POST', '/api/v1/auth/login', { body: { account: 'owner@example.com', password: 'owner-pass-123', client: 'desktop', machineId: 'owner-pc-1' } })
    for (const mid of ['owner-pc-1', 'owner-pc-2', 'owner-pc-3', 'owner-pc-4']) {
      const act = await call('POST', '/api/v1/devices/activate', { token: desktop.json.sessionToken, body: { machineId: mid } })
      assert.equal(act.status, 200)
      const check = checkEntitlementToken({ token: act.json.entitlementToken, publicKeyPem: entitlementPublicPem, machineId: mid, now: Date.now() })
      assert.ok(check.ok && check.payload.unl && check.payload.feat.includes('*'))
    }
    // 桌面端会话不能调用后台接口
    assert.equal((await call('GET', '/api/v1/admin/stats', { token: desktop.json.sessionToken })).status, 403)
  })

  await step('后台：统计、用户搜索、延期、停用后会话失效', async () => {
    const stats = await call('GET', '/api/v1/admin/stats', { token: adminToken })
    assert.equal(stats.json.stats.users, 3)
    assert.equal(stats.json.stats.paidOrders30d, 3)
    assert.equal(stats.json.stats.revenue30dFen, 29700)
    const list = await call('GET', '/api/v1/admin/users?keyword=buyer', { token: adminToken })
    assert.equal(list.json.total, 1)
    const before = app.repo.getUserById(userId)!.planExpiresAt!
    const ext = await call('PATCH', `/api/v1/admin/users/${userId}`, { token: adminToken, body: { extendDays: 10 } })
    assert.ok(Math.abs(ext.json.user.planExpiresAt - before - 10 * 86400000) < 5000)
    const disabled = await call('PATCH', `/api/v1/admin/users/${userId}`, { token: adminToken, body: { status: 'disabled' } })
    assert.equal(disabled.json.user.status, 'disabled')
    assert.equal((await call('GET', '/api/v1/me', { token: userToken })).status, 401)
    await call('PATCH', `/api/v1/admin/users/${userId}`, { token: adminToken, body: { status: 'active' } })
    // 不能停用自己
    const ownerId = app.repo.getUserByAccount('owner@example.com')!.id
    assert.equal((await call('PATCH', `/api/v1/admin/users/${ownerId}`, { token: adminToken, body: { status: 'disabled' } })).status, 400)
  })

  await step('后台：套餐编辑、退款扣回时长', async () => {
    const plan = await call('PUT', '/api/v1/admin/plans/trial', { token: adminToken, body: { name: '体验版', days: 3, amountFen: 100, maxDevices: 1, features: ['clone', 'bogus'] } })
    assert.equal(plan.status, 200)
    assert.deepEqual(plan.json.plan.features, ['clone'])
    assert.equal((await call('PUT', '/api/v1/admin/plans/BAD CODE', { token: adminToken, body: { name: 'x' } })).status, 400)
    const orders = await call('GET', '/api/v1/admin/orders?status=paid', { token: adminToken })
    const target = orders.json.items[0]
    const before = app.repo.getUserById(userId)!.planExpiresAt!
    const refund = await call('POST', `/api/v1/admin/orders/${target.orderNo}/refund`, { token: adminToken, body: { revokeDays: true, note: '用户申请' } })
    assert.equal(refund.json.order.status, 'refunded')
    const after = app.repo.getUserById(userId)!.planExpiresAt!
    assert.ok(Math.abs(before - after - 30 * 86400000) < 5000)
  })

  await step('兑换码：生成、兑换、重复兑换被拒、禁用', async () => {
    const gen = await call('POST', '/api/v1/admin/redeem-codes', { token: adminToken, body: { planCode: 'quarter', count: 3, note: '渠道A' } })
    assert.equal(gen.json.codes.length, 3)
    const reg = await call('POST', '/api/v1/auth/register', { body: { account: '13800000000', password: 'password123' } })
    const t = reg.json.sessionToken
    const ok = await call('POST', '/api/v1/redeem', { token: t, body: { code: gen.json.codes[0].toLowerCase() } })
    assert.equal(ok.status, 200)
    assert.equal(ok.json.entitlement.active, true)
    assert.equal(ok.json.entitlement.maxDevices, 2)
    assert.equal((await call('POST', '/api/v1/redeem', { token: t, body: { code: gen.json.codes[0] } })).status, 400)
    await call('PATCH', `/api/v1/admin/redeem-codes/${gen.json.codes[1]}`, { token: adminToken, body: { status: 'disabled' } })
    assert.equal((await call('POST', '/api/v1/redeem', { token: t, body: { code: gen.json.codes[1] } })).status, 400)
  })

  await step('后台：配置下发与审计', async () => {
    await call('PUT', '/api/v1/admin/config/client.announcement', { token: adminToken, body: { value: '双十一 8 折' } })
    await call('PUT', '/api/v1/admin/config/ai.providerKeys', { token: adminToken, body: { value: { ai666: 'secret' }, scope: 'private' } })
    const pub = await call('GET', '/api/v1/client/config')
    assert.equal(pub.json.values['client.announcement'], '双十一 8 折')
    assert.equal('ai.providerKeys' in pub.json.values, false, '私有配置不能下发')
    const auditList = await call('GET', '/api/v1/admin/audit?keyword=config', { token: adminToken })
    assert.ok(auditList.json.total >= 2)
    assert.ok(!JSON.stringify(auditList.json.items).includes('secret'), '审计里不能出现私有配置值')
  })

  await step('软件设置：保存、打码、掩码回传不覆盖、仅授权设备可拉取', async () => {
    const settings = createDefaultManagedSettings()
    settings.enabled = true
    settings.platforms.ai666 = { apiKey: 'sk-ai666-secret-1234', baseUrl: 'https://ai666.example.com/' }
    settings.tikhubApiKey = 'tikhub-secret-9999'
    settings.capabilities.video = { platform: 'ai666', model: 'veo3-fast' }
    settings.qiniu = { accessKey: 'AK-SECRET', secretKey: 'SK-SECRET', bucket: 'b1', domain: 'https://cdn.example.com', uploadHost: '', prefix: 'vg/' }
    const saved = await call('PUT', '/api/v1/admin/software-settings', { token: adminToken, body: { settings } })
    assert.equal(saved.status, 200)
    assert.equal(saved.json.settings.platforms.ai666.apiKey, '••••1234')
    assert.equal(saved.json.settings.platforms.ai666.baseUrl, 'https://ai666.example.com')
    assert.ok(!JSON.stringify(saved.json).includes('AK-SECRET'))

    // 后台再次保存时密钥仍是掩码 → 不能被覆盖成掩码
    const masked = saved.json.settings
    masked.capabilities.image = { platform: 'grsai', model: 'gpt-image-1', quality: 'medium' }
    await call('PUT', '/api/v1/admin/software-settings', { token: adminToken, body: { settings: masked } })

    // 通用配置接口不能读写软件设置
    assert.equal((await call('PUT', '/api/v1/admin/config/software.managedSettings', { token: adminToken, body: { value: {} } })).status, 400)
    const cfgList = await call('GET', '/api/v1/admin/config', { token: adminToken })
    assert.ok(!JSON.stringify(cfgList.json).includes('sk-ai666'))
    assert.ok(!JSON.stringify(await call('GET', '/api/v1/client/config')).includes('sk-ai666'))

    // 客户端：本机未激活被拒；激活设备拿到去密钥的设置 + 代理令牌，明文密钥不下发（之前停用过账号，会话已失效，重新登录）
    const relogin = await call('POST', '/api/v1/auth/login', { body: { account: 'buyer@example.com', password: 'password123', client: 'desktop', machineId: 'machine-bbbb' } })
    userToken = relogin.json.sessionToken
    assert.equal((await call('GET', '/api/v1/client/managed-settings?machineId=unknown', { token: userToken })).status, 403)
    const client = await call('GET', '/api/v1/client/managed-settings?machineId=machine-bbbb', { token: userToken })
    assert.equal(client.status, 200)
    assert.ok(!JSON.stringify(client.json).includes('sk-ai666-secret'), '平台 Key 不能下发')
    assert.ok(!JSON.stringify(client.json).includes('AK-SECRET') && !JSON.stringify(client.json).includes('SK-SECRET'), '七牛密钥不能下发')
    assert.ok(!JSON.stringify(client.json).includes('tikhub-secret'), 'TikHub Key 不能下发')
    assert.equal(client.json.settings.platforms.ai666.baseUrl, '', '真实平台地址也不下发')
    assert.match(client.json.proxyToken, /^vgp1\./)
    assert.equal(client.json.settings.capabilities.image.model, 'gpt-image-1')
    assert.ok(client.json.version)
    assert.equal((await call('GET', '/api/v1/client/managed-settings?machineId=machine-bbbb')).status, 401)

    // 普通管理员不能改密钥
    const adminId = newId('u')
    app.repo.insertUser({ id: adminId, account: 'ops@example.com', passwordHash: await hashPassword('ops-pass-123'), displayName: 'Ops', role: 'admin', now: Date.now() })
    const ops = await call('POST', '/api/v1/auth/login', { body: { account: 'ops@example.com', password: 'ops-pass-123', client: 'admin' } })
    assert.equal((await call('PUT', '/api/v1/admin/software-settings', { token: ops.json.sessionToken, body: { settings } })).status, 403)

    // 映射到桌面端本地凭据
    const proxied = toProxiedManagedSettings(client.json.settings, { cloudBaseUrl: 'https://cloud.example.com/', token: client.json.proxyToken })
    const applied = applyManagedSettings({ videoProviderPrimary: 'grsai', ai666Hub: { enabled: false, chatModel: 'keep-me' }, someLocalField: 'x' }, proxied)
    assert.equal(applied.videoProviderPrimary, 'apifox_hub')
    assert.equal(applied.videoApifoxHubProfile, 'ai666')
    assert.equal(applied.ai666Hub?.apiKey, client.json.proxyToken)
    assert.equal(applied.ai666Hub?.baseUrl, 'https://cloud.example.com/api/v1/ai-proxy/ai666')
    assert.equal(applied.xibapiHub?.apiKey, '', '后台没配 Key 的平台不给令牌')
    assert.equal((applied as any).vectorEngineHub, undefined, '已删除的平台不再下发')
    assert.equal(applied.tikhubApiKey, client.json.proxyToken)
    assert.equal(applied.qiniuAccessKey, '')
    assert.equal(applied.ai666Hub?.enabled, true)
    assert.equal(applied.ai666Hub?.startEndVideoModel, 'veo3-fast')
    assert.equal(applied.ai666Hub?.chatModel, 'keep-me')
    assert.equal(applied.imageProviderPrimary, 'grsai')
    assert.equal(applied.grsaiImageModel, 'gpt-image-1')
    assert.equal(applied.openaiImageQuality, 'medium')
    assert.equal(applied.qiniuBucket, 'b1')
    assert.equal(applied.someLocalField, 'x')
    assert.equal(applied.apifoxHub?.apiKey, client.json.proxyToken)
  })

  await app.close()
  rmSync(dir, { recursive: true, force: true })
  console.log(`\ncloud smoke passed: ${passed} steps`)
}

main().catch(async (error) => {
  console.error(error)
  try {
    await app.close()
  } catch {
    // ignore
  }
  process.exitCode = 1
})
