/**
 * 点数计费冒烟测试：真实 HTTP 服务 + 临时数据库。
 * 覆盖：套餐赠点、卡密（套餐卡 / 点数卡 / 过期 / 作废批次 / 免分隔符输入）、按套餐规则冻结与扣点、
 * 每月免费次数、模型价目（覆盖价、停用、限定套餐）、失败退回与每日退还上限、超管不扣点、
 * 后台调点权限、订单退款收回点数、云端图片 / 视频任务扣点与失败退回、电脑端计费挂钩。
 * 运行：npm run test:cloud-billing
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCloudApp } from '../services/cloud/src/app'
import { extractUnits } from '../services/cloud/src/aiProxy'
import { MANAGED_SETTINGS_KEY } from '../services/cloud/src/service'
import { hashPassword, newId } from '../services/cloud/src/security'
import { CloudClientError, createCloudClient } from '../src/shared/cloud/client'
import { createDefaultManagedSettings } from '../src/shared/cloud/managedSettings'
import { createCloudUsageMeter, runWithUsageFeature, setUsageMeter, withUsageCharge } from '../src/main/modules/clone/usageMeter'

const dir = mkdtempSync(join(tmpdir(), 'vg-billing-'))
const keyPath = join(dir, 'ent.pem')
writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const MP4 = Buffer.from('000000186674797069736f6d', 'hex')
let videoShouldFail = false

const app = createCloudApp(
  { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, aiPerDay: 500, publicBaseUrl: 'PLACEHOLDER', isProduction: false },
  {
    generationProviders: {
      generateVideo: async (input) => {
        if (videoShouldFail) throw new Error('provider exploded')
        const outputPath = join(input.outDir, 'result.mp4')
        writeFileSync(outputPath, MP4)
        return { outputPath } as any
      },
    },
  },
)

async function expectError(promise: Promise<unknown>, code: string, status: number, message?: RegExp) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof CloudClientError, String(error))
    assert.equal(error.code, code, error.message)
    assert.equal(error.status, status, error.message)
    if (message) assert.match(error.message, message)
    return error
  }
  assert.fail(`expected ${code}`)
}

async function main() {
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  ;(app.config as any).publicBaseUrl = base
  const clientFor = () => {
    let token = ''
    const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    return { client, setToken: (t: string) => (token = t) }
  }
  const login = async (account: string, password: string, kind: 'web' | 'admin' = 'web') => {
    const c = clientFor()
    c.setToken((await c.client.login({ account, password, client: kind })).sessionToken)
    return c.client
  }
  const register = async (account: string) => {
    const c = clientFor()
    c.setToken((await c.client.register({ account, password: 'password-123' })).sessionToken)
    return c.client
  }

  // ---- 管理员账号
  for (const [account, role] of [['owner@example.com', 'super_admin'], ['ops@example.com', 'admin']] as const) {
    app.repo.insertUser({ id: newId('u'), account, passwordHash: await hashPassword('owner-pass-123'), displayName: account, role, now: Date.now() })
  }
  const owner = await login('owner@example.com', 'owner-pass-123', 'admin')
  const ops = await login('ops@example.com', 'owner-pass-123', 'admin')

  // 后台启用平台密钥（云端任务用这个模型计价）
  const managed = createDefaultManagedSettings()
  managed.enabled = true
  managed.platforms.vectorengine = { apiKey: 'sk-ve', baseUrl: 'https://ve.example.com' }
  managed.capabilities.video = { platform: 'vectorengine', model: 'veo3.1-fast' }
  managed.capabilities.image = { platform: 'vectorengine', model: 'gpt-image-1', quality: 'high' }
  app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: managed, scope: 'private', description: '', updatedBy: null, now: Date.now() })

  // ---- 老套餐默认「不限」：升级后已付费用户不受影响
  const plans = (await owner.admin.listPlans()).plans
  assert.ok(plans.every((p) => p.quotas.video.mode === 'unlimited' && p.quotas.image.mode === 'unlimited' && p.credits === 0))

  // ---- 套餐：视频每次扣点、图片每月免费 2 次后扣点，购买送 100 点
  await owner.admin.savePlan({
    code: 'pro',
    name: '专业版',
    days: 30,
    amountFen: 19900,
    maxDevices: 1,
    features: ['*'],
    credits: 100,
    quotas: { video: { mode: 'credits', freePerMonth: 0 }, image: { mode: 'free_then_credits', freePerMonth: 2 } },
  })
  await owner.admin.savePlan({ code: 'lite', name: '轻量版', days: 30, amountFen: 4900, credits: 0, quotas: { video: { mode: 'disabled', freePerMonth: 0 }, image: { mode: 'credits', freePerMonth: 0 } } })
  console.log('  ✓ 套餐保存计费规则与赠送点数')

  // ---- 默认价格与模型价目
  await owner.admin.saveBillingDefaults({ points: { video: 10, image: 2 }, refundPerDay: 2 })
  await owner.admin.saveModel({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-pro', label: 'Veo 高清', points: 30 })
  await owner.admin.saveModel({ capability: 'video', platform: '*', model: 'sora-2', label: 'Sora 2', points: 50, enabled: false })
  await owner.admin.saveModel({ capability: 'video', platform: '*', model: 'kling-master', label: '可灵大师', points: 40, planCodes: ['year'] })
  await expectError(ops.admin.saveModel({ capability: 'video', model: 'x', points: 1 }), 'FORBIDDEN', 403)
  await expectError(owner.admin.saveModel({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-pro', points: 1 }), 'CONFLICT', 409)
  console.log('  ✓ 模型价目：只有超管能改，同平台同模型不能重复')

  // ---- 购买套餐：到账加时长 + 点数
  const alice = await register('alice@example.com')
  await expectError(alice.holdUsage({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-fast' }), 'NO_ENTITLEMENT', 402)
  const order = (await alice.createOrder({ planCode: 'pro', channel: 'mock' })).order
  assert.equal(order.credits, 100)
  await alice.mockPay(order.orderNo)
  let credits = await alice.credits()
  assert.equal(credits.balance, 100)
  assert.equal(credits.ledger.items[0].kind, 'order')
  console.log('  ✓ 支付成功发放套餐点数')

  // ---- 视频：每次扣点（默认价 10），失败退回
  const hold = (await alice.holdUsage({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-fast', client: 'desktop', feature: 'clone' })).hold
  assert.equal(hold.source, 'credits')
  assert.equal(hold.points, 10)
  assert.equal((await alice.credits()).balance, 90)
  await alice.settleUsage(hold.id, false, '平台超时')
  assert.equal((await alice.credits()).balance, 100, 'refunded on failure')
  const again = await alice.settleUsage(hold.id, true)
  assert.equal(again.hold.status, 'released', 'settle is idempotent')
  // 覆盖价
  const pro = (await alice.holdUsage({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-pro' })).hold
  assert.equal(pro.points, 30)
  await alice.settleUsage(pro.id, true)
  assert.equal((await alice.credits()).balance, 70)
  // 停用的模型、限定套餐的模型
  await expectError(alice.holdUsage({ capability: 'video', platform: 'ai666', model: 'sora-2' }), 'FORBIDDEN', 403, /已停用/)
  await expectError(alice.holdUsage({ capability: 'video', platform: 'ai666', model: 'kling-master' }), 'FORBIDDEN', 403, /升级套餐/)
  console.log('  ✓ 视频按模型扣点，失败退回，重复结算安全，停用 / 限定套餐的模型被拒')

  // ---- 每日退还上限（测试里设为 2 次；上面已经退过 1 次）
  for (let i = 0; i < 3; i += 1) {
    const h = (await alice.holdUsage({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-fast' })).hold
    const settled = (await alice.settleUsage(h.id, false, 'boom')).hold
    if (i === 0) assert.equal(settled.status, 'released')
    else {
      assert.equal(settled.status, 'committed', 'over the daily refund cap')
      assert.match(settled.reason, /上限/)
    }
  }
  assert.equal((await alice.credits()).balance, 50, 'failures over the cap are not refunded')
  console.log('  ✓ 每天失败退还次数有上限，超出后不再退点')

  // ---- 图片：每月免费 2 次，之后扣点
  const img = async () => (await alice.holdUsage({ capability: 'image', platform: 'vectorengine', model: 'gpt-image-1' })).hold
  const i1 = await img()
  const i2 = await img()
  assert.deepEqual([i1.source, i1.points, i2.source], ['free', 0, 'free'])
  const i3 = await img()
  assert.deepEqual([i3.source, i3.points], ['credits', 2])
  // 失败的免费次数还回来
  await alice.settleUsage(i1.id, false, 'x')
  const i4 = await img()
  assert.equal(i4.source, 'free', 'a failed free use is given back')
  credits = await alice.credits()
  const imageUsage = credits.usage.find((u) => u.capability === 'image')!
  assert.equal(imageUsage.freeUsed, 2)
  assert.equal(imageUsage.rule.freePerMonth, 2)
  assert.equal(credits.usage.find((u) => u.capability === 'video')!.points, 10, 'shows the price of the current default model')
  console.log('  ✓ 每月免费次数用完后扣点，失败的免费次数会还回来')

  // ---- 点数不足
  app.db.prepare('UPDATE users SET credits = 5 WHERE account = ?').run('alice@example.com')
  const short = await expectError(alice.holdUsage({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-fast' }), 'INSUFFICIENT_CREDITS', 402, /点数不足/)
  assert.deepEqual((short as CloudClientError).details, { needed: 10, balance: 5 })
  console.log('  ✓ 点数不足时拒绝并说明需要多少点')

  // ---- 卡密：点数卡、套餐卡（免分隔符小写输入）、过期、作废批次
  const creditsBatch = await owner.admin.generateRedeemCodes({ kind: 'credits', credits: 200, count: 2, channel: '闲鱼', note: '测试' })
  const r1 = await alice.redeem(creditsBatch.codes[0].replace(/-/g, '').toLowerCase())
  assert.deepEqual(r1.redeemed, { kind: 'credits', days: 0, credits: 200, planName: null })
  assert.equal(r1.credits, 205)
  const bob = await register('bob@example.com')
  const planBatch = await owner.admin.generateRedeemCodes({ kind: 'plan', planCode: 'pro', count: 1 })
  const r2 = await bob.redeem(` ${planBatch.codes[0]} `)
  assert.equal(r2.redeemed.credits, 100, 'plan card carries the plan credits')
  assert.equal(r2.redeemed.days, 30)
  assert.ok(r2.entitlement.active)
  await expectError(bob.redeem(planBatch.codes[0]), 'BAD_REQUEST', 400, /已被使用/)
  const expiring = await owner.admin.generateRedeemCodes({ kind: 'credits', credits: 10, count: 1, expiresAt: Date.now() + 60_000 })
  app.db.prepare('UPDATE redeem_codes SET expires_at = ? WHERE batch_id = ?').run(Date.now() - 1, expiring.batchId)
  await expectError(bob.redeem(expiring.codes[0]), 'BAD_REQUEST', 400, /过期/)
  await owner.admin.setRedeemBatchStatus(creditsBatch.batchId, 'disabled')
  await expectError(bob.redeem(creditsBatch.codes[1]), 'BAD_REQUEST', 400, /作废/)
  const exported = await owner.admin.exportRedeemBatch(creditsBatch.batchId)
  assert.deepEqual(exported.codes.map((c) => [c.status, c.channel, c.credits]).sort(), [['disabled', '闲鱼', 200], ['used', '闲鱼', 200]])
  await expectError(owner.admin.generateRedeemCodes({ kind: 'credits', credits: 0, count: 1 }), 'BAD_REQUEST', 400)
  await expectError(owner.admin.generateRedeemCodes({ kind: 'credits', credits: 5, count: 1, expiresAt: Date.now() - 1 }), 'BAD_REQUEST', 400)
  console.log('  ✓ 卡密：点数卡、套餐卡、过期、整批作废、导出、免分隔符输入')

  // ---- 套餐不包含视频
  const carol = await register('carol@example.com')
  const liteCard = await owner.admin.generateRedeemCodes({ kind: 'plan', planCode: 'lite', count: 1 })
  await carol.redeem(liteCard.codes[0])
  await expectError(carol.holdUsage({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-fast' }), 'FORBIDDEN', 403, /不包含视频生成/)
  console.log('  ✓ 套餐不包含的生成类型被拒')

  // ---- 超管 / 不受限账号不扣点
  const ownerWeb = await login('owner@example.com', 'owner-pass-123')
  const free = (await ownerWeb.holdUsage({ capability: 'video', platform: 'ai666', model: 'kling-master' })).hold
  assert.deepEqual([free.source, free.points], ['unlimited', 0])
  console.log('  ✓ 超级管理员不扣点、不受模型套餐限制')

  // ---- 后台调点：只有超管、必须写原因、扣到 0 为止
  const aliceId = (await alice.me()).user.id
  await expectError(ops.admin.adjustCredits(aliceId, 50, '补偿'), 'FORBIDDEN', 403)
  await expectError(owner.admin.adjustCredits(aliceId, 50, ''), 'BAD_REQUEST', 400)
  let detail = await owner.admin.adjustCredits(aliceId, 50, '补偿生成失败')
  assert.equal(detail.credits, 255)
  detail = await owner.admin.adjustCredits(aliceId, -100000, '清零')
  assert.equal(detail.credits, 0)
  assert.ok(detail.ledger.some((e) => e.kind === 'admin' && e.note === '补偿生成失败'))
  assert.ok(detail.holds.length > 0)
  console.log('  ✓ 后台调点：仅超管、需填原因、不会扣成负数')

  // ---- 订单退款收回点数（最多扣到 0）
  const dave = await register('dave@example.com')
  const dOrder = (await dave.createOrder({ planCode: 'pro', channel: 'mock' })).order
  await dave.mockPay(dOrder.orderNo)
  const daveHold = (await dave.holdUsage({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-pro' })).hold
  await dave.settleUsage(daveHold.id, true)
  await owner.admin.refundOrder(dOrder.orderNo, { revokeDays: true, note: 'test' })
  assert.equal((await dave.credits()).balance, 0, 'refund takes back what is left, never below zero')
  console.log('  ✓ 订单退款收回剩余点数')

  // ---- 云端图片 / 视频任务：创建时扣点，失败退回
  await owner.admin.adjustCredits(aliceId, 25, '测试云端任务')
  const photo = await alice.sync.uploadFile(PNG, 'image/png')
  const job = (await alice.ai.createJob({ kind: 'video', prompt: '旋转', imageFileIds: [photo.fileId] })).job
  assert.equal((await alice.credits()).balance, 15, 'charged when the job is queued')
  await app.generation.idle()
  assert.equal((await alice.ai.getJob(job.id)).job.status, 'succeeded')
  videoShouldFail = true
  const failing = (await alice.ai.createJob({ kind: 'video', prompt: 'again', imageFileIds: [photo.fileId] })).job
  await app.generation.idle()
  assert.equal((await alice.ai.getJob(failing.id)).job.status, 'failed')
  // 今天退还次数已到上限（2），这次失败不退
  assert.equal((await alice.credits()).balance, 5)
  await owner.admin.saveBillingDefaults({ points: { video: 10, image: 2 }, refundPerDay: 100 })
  await owner.admin.adjustCredits(aliceId, 10, '测试退还')
  const failing2 = (await alice.ai.createJob({ kind: 'video', prompt: 'again', imageFileIds: [photo.fileId] })).job
  assert.equal((await alice.credits()).balance, 5)
  await app.generation.idle()
  assert.equal((await alice.ai.getJob(failing2.id)).job.status, 'failed')
  assert.equal((await alice.credits()).balance, 15, 'refunded once the cap allows it')
  await owner.admin.adjustCredits(aliceId, -100000, '清零')
  await expectError(alice.ai.createJob({ kind: 'video', prompt: 'x', imageFileIds: [photo.fileId] }), 'INSUFFICIENT_CREDITS', 402)
  videoShouldFail = false
  console.log('  ✓ 云端任务排队时扣点，失败退回，点数不足时直接拒绝')

  // ---- 后台统计
  const stats = await owner.admin.usageStats(30)
  const veo = stats.models.find((m) => m.model === 'veo3.1-fast' && m.capability === 'video')!
  assert.ok(veo.calls >= 1 && veo.failed >= 1)
  assert.ok(stats.outstandingCredits > 0)
  console.log('  ✓ 后台按模型统计次数、失败与扣点')

  // ---- 防亏：不限套餐每天封顶、成本入账、客户端不能给云端冻结的记录退点、一次多份按份扣
  await owner.admin.saveBillingDefaults({ points: { video: 10, image: 2 }, refundPerDay: 100, includedPerDay: { video: 2, image: 5 }, costFen: { video: 80, image: 0.5 }, pointFen: 19.8 })
  await owner.admin.savePlan({ code: 'open', name: '不限版', days: 30, amountFen: 100, quotas: { video: { mode: 'unlimited', freePerMonth: 0 }, image: { mode: 'unlimited', freePerMonth: 0 } } })
  const erin = await register('erin@example.com')
  await erin.redeem((await owner.admin.generateRedeemCodes({ kind: 'plan', planCode: 'open', count: 1 })).codes[0])
  const erinId = (await erin.me()).user.id
  const video = { capability: 'video' as const, platform: 'vectorengine', model: 'veo3.1-fast' }
  const e1 = (await erin.holdUsage(video)).hold
  assert.equal(e1.source, 'included')
  const e2 = (await erin.holdUsage(video)).hold
  await expectError(erin.holdUsage(video), 'RATE_LIMITED', 429, /最多 2 次/)
  await erin.settleUsage(e2.id, false, 'boom')
  const e3 = (await erin.holdUsage(video)).hold
  assert.equal(e3.source, 'included', 'a failed one does not use up the daily cap')
  await expectError(Promise.resolve().then(() => erin.holdUsage(video)), 'RATE_LIMITED', 429)
  const img4 = app.service.billing.hold(erinId, { capability: 'image', platform: 'p', model: 'm' }, { units: 4 })
  assert.throws(() => app.service.billing.hold(erinId, { capability: 'image', platform: 'p', model: 'm' }, { units: 2 }), /最多 5 次/)
  await expectError(erin.settleUsage(img4.id, false, '骗退'), 'FORBIDDEN', 403, /云端自动结算/)
  const paid4 = await owner.admin.adjustCredits(aliceId, 100, '份数测试')
  const multi = app.service.billing.hold(aliceId, { capability: 'video', platform: 'vectorengine', model: 'veo3.1-pro' }, { units: 2 })
  assert.equal(multi.points, 60)
  assert.equal(paid4.credits - (await alice.credits()).balance, 60)
  app.service.billing.settle(null, multi.id, false)
  await owner.admin.adjustCredits(aliceId, -100000, '清零')
  // 没有单独填成本：用默认成本；单独填了用自己的
  const erinCost = (await owner.admin.usageStats(30)).topUsers.find((u) => u.userId === erinId)!
  assert.equal(erinCost.costFen, 162, '2 videos x 80 + 4 images x 0.5')
  const listed = (await owner.admin.getBilling()).models.find((m) => m.model === 'veo3.1-pro')!
  await owner.admin.saveModel({ ...listed, costFen: 250 })
  app.service.billing.hold(erinId, { capability: 'image', platform: 'p', model: 'm' })
  assert.equal((await owner.admin.getBilling()).models.find((m) => m.model === 'veo3.1-pro')!.costFen, 250)
  assert.ok(!/costFen|pointFen|includedPerDay/.test(JSON.stringify(await alice.pricing())), 'cost never reaches the public price list')
  const fresh = await owner.admin.savePlan({ code: 'fresh', name: '新套餐', days: 30, amountFen: 100 })
  assert.equal(fresh.plan.quotas.video.mode, 'credits', 'new plans charge unless the admin picks unlimited')
  assert.equal(extractUnits(Buffer.from('{"n":4}')), 4)
  assert.equal(extractUnits(Buffer.from('{"input":{"parameters":{"batch_size":"3"}}}')), 3)
  assert.equal(extractUnits(Buffer.from('--b\r\nContent-Disposition: form-data; name="n"\r\n\r\n5\r\n--b--'), 'multipart/form-data; boundary=b'), 5)
  assert.equal(extractUnits(Buffer.from('{"prompt":"n: 9"}')), 1)
  console.log('  ✓ 防亏：每天封顶、成本入账、不能自己退点、多份按份扣、新套餐默认扣点')

  // ---- 电脑端计费挂钩：嵌套只算一次，失败退回，未登录给出明确提示
  const events: string[] = []
  setUsageMeter({
    hold: async (charge) => {
      events.push(`hold:${charge.capability}:${charge.model}:${charge.feature ?? ''}`)
      return 'h1'
    },
    settle: async (id, ok) => void events.push(`settle:${id}:${ok}`),
  })
  await runWithUsageFeature('clone', () =>
    withUsageCharge({ capability: 'video', platform: 'vectorengine', model: 'm' }, () => withUsageCharge({ capability: 'image', platform: 'p', model: 'inner' }, async () => 'ok')),
  )
  await assert.rejects(withUsageCharge({ capability: 'image', platform: 'p', model: 'm2' }, async () => Promise.reject(new Error('nope'))), /nope/)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(events, ['hold:video:m:clone', 'settle:h1:true', 'hold:image:m2:', 'settle:h1:false'])
  // 不计费（用户自己的 Key）时直接执行
  setUsageMeter(createCloudUsageMeter({ client: () => null, clientKind: 'desktop', shouldCharge: () => false }))
  assert.equal(await withUsageCharge({ capability: 'video', platform: 'p', model: 'm' }, async () => 'own-key'), 'own-key')
  setUsageMeter(createCloudUsageMeter({ client: () => null, clientKind: 'desktop' }))
  await assert.rejects(withUsageCharge({ capability: 'video', platform: 'p', model: 'm' }, async () => 'x'), /请先登录/)
  // 真实云端：用 alice 的会话走一遍
  const tokenClient = clientFor()
  tokenClient.setToken((await tokenClient.client.login({ account: 'alice@example.com', password: 'password-123', client: 'web' })).sessionToken)
  await owner.admin.adjustCredits(aliceId, 10, '挂钩测试')
  setUsageMeter(createCloudUsageMeter({ client: () => tokenClient.client, clientKind: 'desktop' }))
  await withUsageCharge({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-fast' }, async () => 'done')
  await assert.rejects(withUsageCharge({ capability: 'video', platform: 'vectorengine', model: 'veo3.1-fast' }, async () => 'x'), /点数不足/)
  setUsageMeter(null)
  console.log('  ✓ 电脑端挂钩：嵌套只扣一次，失败退回，用户自己的 Key 不计费')

  console.log('\ncloud billing smoke passed')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    app.server.close()
    app.db.close()
    rmSync(dir, { recursive: true, force: true })
  })
