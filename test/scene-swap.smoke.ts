/**
 * 批量换景冒烟测试：真实 HTTP 服务 + 假图片平台 + 假抠图（不产生真实调用和费用）。
 * 覆盖：系统 / 我的场景权限、试图免费、整批扣点、质检不确定先冻结（接受才扣、不要全退）、融合没质检不放行、
 * 点数不足自动暂停、衣服像素不变、合格图进素材库、重启恢复、越权。
 * 运行：npx tsx test/scene-swap.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createCloudApp } from '../services/cloud/src/app'
import { MANAGED_SETTINGS_KEY } from '../services/cloud/src/service'
import { canvasFor, composeKeep, maskStats, normalizeSource, readMask } from '../services/cloud/src/sceneSwap/compose'
import { createCloudClient } from '../src/shared/cloud/client'
import { createDefaultManagedSettings } from '../src/shared/cloud/managedSettings'
import { SYNC_COLLECTIONS } from '../src/shared/cloud/sync'
import { styleGroupOf } from '../src/shared/sceneSwap'

const W = 120
const H = 160
/** 带花纹的「衣服」矩形：x 40–80，y 30–150 */
async function photo(seed: number) {
  const px = Buffer.alloc(W * H * 3, 235)
  for (let y = 30; y < 150; y += 1) for (let x = 40; x < 80; x += 1) {
    const i = (y * W + x) * 3
    px[i] = 150 + ((x * 7 + y * 3 + seed) % 90)
    px[i + 1] = 30 + ((x * y) % 40)
    px[i + 2] = 40 + (seed % 20)
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
}
async function writeMask(output: string) {
  const px = Buffer.alloc(W * H)
  for (let y = 30; y < 150; y += 1) for (let x = 40; x < 80; x += 1) px[y * W + x] = 255
  await sharp(px, { raw: { width: W, height: H, channels: 1 } }).png().toFile(output)
}

async function main() {
  assert.equal(styleGroupOf('A108-1.jpg'), 'A108')
  assert.equal(styleGroupOf('A108 (2).png'), 'A108')
  assert.equal(styleGroupOf('红色连衣裙_03.jpg'), '红色连衣裙')
  assert.equal(styleGroupOf('IMG_001.jpg'), '未分款')
  assert.equal(styleGroupOf('abc.jpg'), '未分款')
  assert.deepEqual(canvasFor(900, 1200, '1:1'), { width: 1200, height: 1200, left: 150, top: 0 })
  assert.deepEqual(canvasFor(900, 1200, '9:16'), { width: 900, height: 1600, left: 0, top: 400 })
  assert.deepEqual(canvasFor(900, 1200, 'original'), { width: 900, height: 1200, left: 0, top: 0 })

  const dir = mkdtempSync(join(tmpdir(), 'vg-scene-'))
  const keyPath = join(dir, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

  // ---- 人物内部像素和原图逐个相同（关闭亮度匹配，PNG 输出）
  {
    const source = join(dir, 'p.png')
    const size = await normalizeSource(await photo(1), source)
    const maskFile = join(dir, 'm.png')
    await writeMask(maskFile)
    const mask = await readMask(maskFile, size.width, size.height)
    const plate = join(dir, 'plate.png')
    await sharp({ create: { width: 200, height: 300, channels: 3, background: '#3366aa' } }).png().toFile(plate)
    const output = join(dir, 'o.jpg')
    for (const canvasSize of ['original', '1:1'] as const) {
      const { canvas } = await composeKeep({ source, mask, plate, ...size, size: canvasSize, matchLight: false, output })
      const before = await sharp(source).raw().toBuffer()
      const after = await sharp(output).raw().toBuffer()
      let diff = 0
      let n = 0
      for (let y = 40; y < 140; y += 1) for (let x = 48; x < 72; x += 1) for (let c = 0; c < 3; c += 1) {
        diff += Math.abs(before[(y * W + x) * 3 + c]! - after[((y + canvas.top) * canvas.width + x + canvas.left) * 3 + c]!)
        n += 1
      }
      assert.ok(diff / n < 4, `person pixels only differ by JPEG rounding, got ${diff / n}`)
      const bg = (5 * canvas.width + 5) * 3
      assert.ok(Math.abs(after[bg]! - 0x33) < 6 && Math.abs(after[bg + 2]! - 0xaa) < 6, 'old background is gone')
    }
    assert.equal(maskStats(mask, W, H).bottom, false)
  }

  let verdict = '{"edge":true,"light":true,"color":true,"pattern":true,"face":true}'
  let renders = 0
  let mattes = 0
  const overrides = { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, aiPerDay: 500, publicBaseUrl: '', sceneSwapTrialsPerDay: 4, sceneSwapConcurrency: 2 }
  const options = {
    generationProviders: {
      generateImage: async (input: any) => {
        renders += 1
        const outputPath = join(input.outDir, `r_${renders}.png`)
        await sharp({ create: { width: 90, height: 120, channels: 3, background: { r: renders % 255, g: 120, b: 200 } } }).png().toFile(outputPath)
        return { outputPath } as any
      },
    },
    matting: { available: () => true, run: async (_input: string, output: string) => { mattes += 1; await writeMask(output) }, close: () => undefined },
    inspect: async () => {
      if (verdict === 'down') throw new Error('not configured')
      return verdict
    },
  }
  const app = createCloudApp(overrides, options as any)
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const status = async (promise: Promise<unknown>) => promise.then(() => 200, (error) => error.status)
  try {
    const settings = createDefaultManagedSettings()
    settings.enabled = true
    settings.platforms.vectorengine = { apiKey: 'sk-ve', baseUrl: 'https://ve.example.com' }
    settings.capabilities.image = { platform: 'vectorengine', model: 'gpt-image-2', quality: 'high' }
    app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: settings, scope: 'private', description: '', updatedBy: null, now: Date.now() })

    const ids: Record<string, string> = {}
    const makeUser = async (name: string) => {
      let token = ''
      const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
      await client.register({ account: `${name}@example.com`, password: 'password-123' })
      const login = await client.login({ account: `${name}@example.com`, password: 'password-123', client: 'mobile', machineId: name })
      token = login.sessionToken
      ids[name] = login.user.id
      const plans = await client.listPlans()
      const order = await client.createOrder({ planCode: plans.plans[0]!.code, channel: 'mock' })
      await client.mockPay(order.order.orderNo)
      return client
    }
    const alice = await makeUser('alice')
    const bob = await makeUser('bob')
    const plan = (await alice.listPlans()).plans[0]!
    app.db.prepare('UPDATE plans SET quotas = ? WHERE code = ?').run(JSON.stringify({ image: { mode: 'credits', freePerMonth: 0 }, video: { mode: 'credits', freePerMonth: 0 } }), plan.code)
    const setCredits = (name: string, n: number) => app.db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(n, ids[name]!)
    const credits = (name: string) => Number((app.db.prepare('SELECT credits FROM users WHERE id = ?').get(ids[name]!) as any).credits)
    setCredits('alice', 1000)
    const price = (await alice.sceneSwap.info()).pointsPerImage
    assert.ok(price > 0)

    // ---- 场景：自己的只有自己看到，系统场景都能读，普通用户进不了后台接口
    const up = async (client: typeof alice, body: Buffer) => (await client.sync.uploadFile(body, 'image/png')).fileId
    const sceneFile = await up(alice, await sharp({ create: { width: 60, height: 80, channels: 3, background: '#aabbcc' } }).png().toBuffer())
    const mine = await alice.sceneSwap.addScene({ fileId: sceneFile, name: '我的档口' })
    assert.equal((await bob.sceneSwap.info()).scenes.length, 0)
    assert.equal(await status(alice.admin.listScenes()), 403)
    const sysFile = await up(alice, await sharp({ create: { width: 60, height: 80, channels: 3, background: '#112233' } }).png().toBuffer())
    assert.equal(await status(bob.sync.downloadFile(sysFile)), 404)
    const system = app.sceneSwap.addScene(ids.alice!, { fileId: sysFile, name: '咖啡馆', category: '室内' }, true)
    assert.ok((await bob.sync.downloadFile(sysFile)).size > 0, 'system scene image readable by everyone')
    assert.equal(await status(bob.sync.downloadFile(sceneFile)), 404)
    assert.equal(await status(bob.sceneSwap.removeScene(mine.id)), 404)
    assert.equal(await status(bob.sceneSwap.removeScene(system.id)), 404)

    const images = [] as Array<{ fileId: string; name: string }>
    for (let i = 0; i < 4; i += 1) images.push({ fileId: await up(alice, await photo(i + 2)), name: i < 2 ? `A108-${i}.jpg` : `A109-${i}.jpg` })
    const input = { mode: 'keep' as const, size: 'original' as const, matchLight: false, images, sceneIds: [mine.id] }
    const done = async (id: string, client = alice) => { await app.sceneSwap.idle(); return client.sceneSwap.get(id) }

    // ---- 试图免费、两款各一张；跑整批只扣剩下的
    const created = await alice.sceneSwap.create(input)
    let batch = await done(created.id)
    assert.equal(batch.status, 'trial_ready', JSON.stringify(batch))
    assert.deepEqual(batch.items.filter((item) => item.status === 'passed').map((item) => item.group), ['A108', 'A109'])
    assert.equal(credits('alice'), 1000)
    assert.equal(await status(bob.sceneSwap.get(created.id)), 404)
    await alice.sceneSwap.action(created.id, 'run')
    batch = await done(created.id)
    assert.equal(batch.status, 'done')
    assert.ok(batch.items.every((item) => item.status === 'passed'))
    assert.equal(credits('alice'), 1000 - 2 * price)
    assert.equal(mattes, 4, 'each source matted once')
    const assets = (await alice.sync.pull(0, [SYNC_COLLECTIONS.assets])).changes
    assert.equal(assets.length, 4, 'passed images are in the asset library')
    const inspectItem = batch.items[0]!
    assert.equal(await status(alice.sceneSwap.item(created.id, inspectItem.id, 'reject')), 400, 'passed images cannot be refunded')

    // ---- 质检没过：冻结，不要全退，接受才扣；超过 12 小时也不自动扣
    verdict = '{"edge":true,"light":false}'
    const flagged = await alice.sceneSwap.create({ ...input, images: images.slice(0, 1) })
    let review = await done(flagged.id)
    assert.equal(review.items[0]!.status, 'review')
    assert.equal(review.items[0]!.attempts, 2, 'retried once automatically')
    const before = credits('alice')
    const flagged2 = await alice.sceneSwap.create({ ...input, images: images.slice(0, 4) })
    await done(flagged2.id)
    await alice.sceneSwap.action(flagged2.id, 'run')
    review = await done(flagged2.id)
    const held = review.items.filter((item) => !item.trial)
    assert.equal(credits('alice'), before - held.length * price)
    app.db.prepare("UPDATE usage_holds SET created_at = 1 WHERE status = 'held'").run()
    app.service.billing.sweep()
    await alice.sceneSwap.item(flagged2.id, held[0]!.id, 'reject')
    assert.equal(credits('alice'), before - (held.length - 1) * price, 'rejected image refunded')
    await alice.sceneSwap.item(flagged2.id, held[1]!.id, 'accept')
    assert.equal(credits('alice'), before - (held.length - 1) * price)
    assert.equal(await status(alice.sceneSwap.item(flagged2.id, held[1]!.id, 'reject')), 400)
    // 冻结中的重做不再扣；删除批次退回没确认的
    verdict = 'down'
    const b4 = credits('alice')
    await alice.sceneSwap.remove(flagged2.id)
    assert.ok(credits('alice') >= b4)

    // ---- 保真：没有视觉质检也能出；融合：确认不了衣服没变，一律要看
    const blend = await alice.sceneSwap.create({ ...input, mode: 'blend', images: images.slice(0, 1) })
    assert.equal((await done(blend.id)).items[0]!.status, 'review')

    // ---- 点数不足：整批暂停、说明原因，充值后继续
    verdict = '{"edge":true,"light":true}'
    setCredits('alice', price)
    const poor = await alice.sceneSwap.create({ ...input, images })
    await done(poor.id)
    await alice.sceneSwap.action(poor.id, 'run')
    let paused = await done(poor.id)
    if (paused.items.some((item) => item.status !== 'passed')) {
      assert.equal(paused.status, 'paused')
      assert.match(paused.notice ?? '', /点数不足/)
      assert.ok(credits('alice') >= 0)
      setCredits('alice', 1000)
      await alice.sceneSwap.action(poor.id, paused.items.some((item) => item.status === 'waiting') ? 'run' : 'resume')
      paused = await done(poor.id)
      if (paused.status === 'trial_ready') {
        await alice.sceneSwap.action(poor.id, 'run')
        paused = await done(poor.id)
      }
    } else assert.fail('should have run out of credits')
    assert.equal(paused.status, 'done', JSON.stringify(paused.items.map((item) => [item.status, item.error])))
    assert.equal((await alice.sceneSwap.info()).trialsLeft, 0)

    // ---- 参数校验
    assert.equal(await status(alice.sceneSwap.create({ ...input, images: [] })), 400)
    assert.equal(await status(alice.sceneSwap.create({ ...input, sceneIds: ['nope'] })), 400)
    assert.equal(await status(bob.sceneSwap.create({ ...input, sceneIds: [system.id] })), 404, 'cannot use images of another account')

    // ---- 重启：跑到一半的重新排队
    app.db.prepare("UPDATE scene_swap_items SET status = 'running' WHERE id = ?").run(paused.items[0]!.id)
    app.db.prepare("UPDATE scene_swap_batches SET status = 'running' WHERE id = ?").run(paused.id)
  } finally {
    await app.close()
  }
  const again = createCloudApp(overrides, options as any)
  again.sceneSwap.start()
  await again.sceneSwap.idle()
  assert.equal(Number((again.db.prepare("SELECT COUNT(*) AS n FROM scene_swap_items WHERE status = 'running'").get() as any).n), 0)
  again.sceneSwap.close()
  again.db.close()
  rmSync(dir, { recursive: true, force: true })
  console.log('scene-swap smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
