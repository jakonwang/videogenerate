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
import { cosAuthorization, createMatting } from '../services/cloud/src/sceneSwap/matting'
import { canvasFor, composeKeep, maskStats, normalizeSource, readMask } from '../services/cloud/src/sceneSwap/compose'
import { createCloudClient } from '../src/shared/cloud/client'
import { createDefaultManagedSettings, maskManagedSettings, mergeManagedSecrets, normalizeManagedSettings, readManagedSecret, stripManagedSecretsForClient, toProxiedManagedSettings } from '../src/shared/cloud/managedSettings'
import { SYNC_COLLECTIONS } from '../src/shared/cloud/sync'
import { grsAspectRatio } from '../services/cloud/src/generate'
import { productViewOf, styleGroupOf, tryonProducts, tryonShotsFor } from '../src/shared/sceneSwap'

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
  assert.equal(styleGroupOf('A108-背.jpg'), 'A108')
  assert.equal(styleGroupOf('A108_back_2.jpg'), 'A108')
  assert.equal(styleGroupOf('A108-2 细节.jpg'), 'A108')
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

  // ---- 腾讯云抠图：签名、上传→抠图→删除、限流重试、尺寸不一致要报错、密钥不下发
  {
    const cfg = { secretId: 'AKID', secretKey: 'SECRET', bucket: 'b-1250000000', region: 'ap-guangzhou', type: 'AIPicMatting' as const }
    assert.match(cosAuthorization({ ...cfg, method: 'GET', path: '/a.jpg', params: { 'ci-process': 'AIPicMatting' }, headers: { host: 'h' }, now: 1557989813000 }), /^q-sign-algorithm=sha1&q-ak=AKID&q-sign-time=1557989753;1557990413&q-key-time=1557989753;1557990413&q-header-list=host&q-url-param-list=ci-process&q-signature=[0-9a-f]{40}$/)
    const input = join(dir, 'cos-in.png')
    const output = join(dir, 'cos-mask.png')
    writeFileSync(input, await photo(1))
    const calls: string[] = []
    let mode = 'ok'
    const cut = async (width: number, height: number) => sharp({ create: { width, height, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).png().toBuffer()
    const fake = (async (url: string, init: any) => {
      calls.push(init.method)
      assert.ok(url.startsWith('https://b-1250000000.cos.ap-guangzhou.myqcloud.com/scene-swap-temp/'))
      if (init.method !== 'GET') return new Response(null, { status: 200 })
      if (mode === 'slow') { mode = 'ok'; return new Response('<Error><Code>SlowDown</Code></Error>', { status: 503 }) }
      if (mode === 'denied') return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
      return new Response(new Uint8Array(await cut(mode === 'crop' ? W - 10 : W, H)))
    }) as any
    const matting = createMatting({ settings: () => cfg, fetchImpl: fake, retryMs: 1 })
    await matting.run(input, output)
    assert.deepEqual(calls.splice(0), ['PUT', 'GET', 'DELETE'])
    const raw = await sharp(output).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual([raw.info.width, raw.info.height], [W, H])
    assert.ok(Math.abs(raw.data[0]! - 128) <= 1, 'mask is the alpha channel')
    mode = 'slow'
    await matting.run(input, output)
    assert.deepEqual(calls.splice(0), ['PUT', 'GET', 'GET', 'DELETE'])
    mode = 'crop'
    await assert.rejects(matting.run(input, output), /不一致/)
    calls.length = 0
    mode = 'denied'
    await assert.rejects(matting.run(input, output), /没有权限/)
    assert.deepEqual(calls.splice(0), ['PUT', 'GET', 'DELETE'], 'temp photo is deleted on failure, no pointless retry')
    mode = 'ok'
    await Promise.all([1, 2, 3, 4, 5].map((n) => matting.run(input, join(dir, `cos-${n}.png`))))
    assert.equal(createMatting({ settings: () => ({ ...cfg, secretKey: '' }) }).available(), false)

    const saved = normalizeManagedSettings({ ...createDefaultManagedSettings(), matting: cfg })
    assert.deepEqual(saved.matting, cfg)
    assert.equal(normalizeManagedSettings({ matting: { ...cfg, bucket: 'evil.com/' } }).matting.bucket, 'evilcom')
    assert.ok(!JSON.stringify(maskManagedSettings(saved)).includes('SECRET'))
    assert.deepEqual(mergeManagedSecrets(normalizeManagedSettings(maskManagedSettings(saved)), saved).matting, cfg)
    assert.equal(readManagedSecret(saved, 'matting.secretKey'), cfg.secretKey, 'admin reveal reads the plain secret')
    assert.equal(readManagedSecret(saved, 'platform.grsai'), saved.platforms.grsai.apiKey)
    for (const bad of ['platform.evil', 'qiniu.bucket', 'enabled', '']) assert.equal(readManagedSecret(saved, bad), null, `no reveal for ${bad}`)
    for (const out of [stripManagedSecretsForClient(saved), toProxiedManagedSettings(saved, { cloudBaseUrl: 'https://x', token: 't' })]) assert.equal(out.matting.secretKey + out.matting.secretId, '')
  }

  let verdict = '{"edge":true,"light":true,"color":true,"pattern":true,"face":true}'
  let renders = 0
  let lastRefs = 0
  let lastPrompt = ''
  const refLog: number[] = []
  let mattes = 0
  const overrides = { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, aiPerDay: 500, publicBaseUrl: '', sceneSwapTrialsPerDay: 4, sceneSwapConcurrency: 2 }
  const options = {
    generationProviders: {
      generateImage: async (input: any) => {
        renders += 1
        lastRefs = input.imagePaths?.length ?? 0
        lastPrompt = input.prompt
        refLog.push(lastRefs)
        const outputPath = join(input.outDir, `r_${renders}.png`)
        await sharp({ create: { width: input.size === '1024x1024' ? 120 : 90, height: 120, channels: 3, background: { r: renders % 255, g: 120, b: 200 } } }).png().toFile(outputPath)
        return { outputPath } as any
      },
    },
    matting: { available: () => true, run: async (_input: string, output: string) => { mattes += 1; await writeMask(output) } },
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
    settings.platforms.ai666 = { apiKey: 'sk-ve', baseUrl: 'https://ve.example.com' }
    settings.capabilities.image = { platform: 'ai666', model: 'gpt-image-2', quality: 'high' }
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

    // ---- 模特库：自己的、系统的、同步上来的；场景列表里看不到模特
    assert.deepEqual([productViewOf('A1-背面.jpg'), productViewOf('A1_detail.png'), productViewOf('A1-1.jpg')], ['back', 'detail', 'front'])
    assert.deepEqual(tryonProducts([...Array(5)].map((_, i) => ({ i, view: 'front' as const })).concat([{ i: 9, view: 'back' as any }])).map((p) => p.i), [0, 1, 2, 9], 'back photo is always kept')
    assert.deepEqual(tryonShotsFor([{ view: 'front' }], ['back', 'side', 'front']), ['front', 'side'])
    assert.deepEqual(tryonShotsFor([{ view: 'back' }], ['back', 'front']), ['back'])
    const modelFile = await up(alice, await photo(90))
    const sceneCount = (await alice.sceneSwap.info()).scenes.length
    const mineModel = await alice.sceneSwap.addModel({ fileId: modelFile, name: 'Mali', gender: '女', skin: '乱填' })
    assert.equal(mineModel.skin, '')
    const sysModelFile = await up(alice, await photo(91))
    const sysModel = app.sceneSwap.addModel(ids.alice!, { fileId: sysModelFile, name: 'Nina', gender: '女', skin: '浅', body: '标准' }, true)
    await alice.sync.push([{ collection: SYNC_COLLECTIONS.models, id: 'm1', updatedAt: Date.now(), deleted: false, data: { name: '库里的', gender: 'female', images: [{ fileId: modelFile, mime: 'image/png' }], createdAt: 1 } }] as any)
    const models = (await alice.sceneSwap.info()).models
    assert.deepEqual(models.map((m) => [m.name, m.source, m.gender]), [['Mali', 'mine', '女'], ['Nina', 'system', '女'], ['库里的', 'library', '女']])
    assert.equal((await alice.sceneSwap.info()).scenes.length, sceneCount)
    assert.deepEqual((await bob.sceneSwap.info()).models.map((m) => m.name), ['Nina'])
    assert.ok((await bob.sync.downloadFile(sysModelFile)).size > 0)
    assert.equal(await status(bob.sync.downloadFile(modelFile)), 404)
    assert.equal(await status(bob.sceneSwap.removeModel(mineModel.id)), 404)
    assert.equal(await status(alice.sceneSwap.removeScene(mineModel.id)), 404, 'a model is not a scene')
    assert.equal(await status(bob.admin.listModels()), 403)

    // ---- 换模特：不选场景也能做；不像所选模特就要看，重做理由按任务过滤
    setCredits('alice', 5000)
    const swapInput = { ...input, task: 'model' as const, sceneIds: [], images: images.slice(0, 3) }
    assert.equal(await status(alice.sceneSwap.create(swapInput)), 400, 'model is required')
    assert.equal(await status(bob.sceneSwap.create({ ...swapInput, modelId: mineModel.id })), 400)
    verdict = '{"color":true,"pattern":true,"model":true,"pose":true,"limbs":true}'
    const swap = await alice.sceneSwap.create({ ...swapInput, modelId: 'lib_m1' })
    let swapped = await done(swap.id)
    assert.equal(swapped.status, 'trial_ready')
    assert.deepEqual([swapped.task, swapped.mode, swapped.modelName, lastRefs], ['model', 'blend', '库里的', 2])
    await alice.sceneSwap.action(swap.id, 'run')
    swapped = await done(swap.id)
    assert.ok(swapped.items.every((item) => item.status === 'passed'))
    verdict = '{"color":true,"pattern":true,"model":false,"pose":true,"limbs":true}'
    await alice.sceneSwap.item(swap.id, swapped.items[0]!.id, 'redo', ['脸变了', '不像所选模特'])
    swapped = await done(swap.id)
    assert.equal(swapped.items[0]!.status, 'review')
    assert.match(lastPrompt, /did not look like the chosen model/)
    assert.doesNotMatch(lastPrompt, /identical to image 1: same color, print, logo, seams, buttons/)

    // ---- 换商品：要商品图、参考图齐全、不能用别人的图、理由按任务过滤
    verdict = '{"product":true,"scene":true,"limbs":true,"light":true}'
    const goods = [await up(alice, await photo(200)), await up(alice, await photo(201))]
    const productInput = { ...input, task: 'product' as const, sceneIds: [mine.id], images: images.slice(0, 2), productFileIds: goods, productName: '碎花裙' }
    assert.equal(await status(alice.sceneSwap.create({ ...productInput, productFileIds: [] })), 400)
    assert.equal(await status(alice.sceneSwap.create({ ...productInput, productFileIds: [...goods, ...images.map((image) => image.fileId)] })), 400)
    assert.equal(await status(bob.sceneSwap.create({ ...productInput })), 404)
    const replaced = await alice.sceneSwap.create(productInput)
    let goodsBatch = await done(replaced.id)
    assert.ok(goodsBatch.items.every((item) => item.status === 'passed' && item.sceneName === '碎花裙'), JSON.stringify(goodsBatch))
    assert.deepEqual([goodsBatch.task, goodsBatch.mode, goodsBatch.productFileIds, lastRefs], ['product', 'blend', goods, 3])
    assert.match(lastPrompt, /Replace only the original product/)
    // 尺寸：原尺寸和原图一样大；选了比例就按比例出，提示词里说明补背景
    const sizeOf = async (batch: any) => { const meta = await sharp(Buffer.from(await (await alice.sync.downloadFile(batch.items[0].outputFileId)).arrayBuffer())).metadata(); return meta.width! / meta.height! }
    const square = await done((await alice.sceneSwap.create({ ...productInput, size: '1:1' as const })).id)
    assert.equal(square.size, '1:1')
    assert.match(lastPrompt, /Output a 1:1 image/)
    assert.doesNotMatch(lastPrompt, /preserve the original image aspect ratio/)
    assert.equal(await sizeOf(square), 1)
    assert.ok(Math.abs((await sizeOf(goodsBatch)) - W / H) < 0.01)
    assert.deepEqual([grsAspectRatio('gpt-image-2.6', 1320 / 1794), grsAspectRatio('gpt-image-2', 1), grsAspectRatio('', 9 / 16), grsAspectRatio('gpt-image-2-vip', 1)], ['3:4', '1:1', '9:16', undefined])
    verdict = '{"product":true,"scene":false,"limbs":true,"light":true}'
    await alice.sceneSwap.item(replaced.id, goodsBatch.items[0]!.id, 'redo', ['其他地方变了', '不像所选模特'])
    goodsBatch = await done(replaced.id)
    assert.equal(goodsBatch.items[0]!.status, 'review')
    assert.match(lastPrompt, /changed other parts of image 1/)
    assert.doesNotMatch(lastPrompt, /chosen model/)

    // ---- 生成模特图：先主图，其余等主图并带上主图参考；没有背面图不出背面
    verdict = '{"color":true,"pattern":true,"shape":true,"model":true,"limbs":true}'
    const tryInput = { ...input, task: 'tryon' as const, modelId: sysModel.id, shots: ['front', 'side', 'back'] as any, size: '3:4' as const, images: [...images.slice(0, 1), { ...images[1]!, name: 'A108-背.jpg', group: 'A108' }, ...images.slice(2, 3)] }
    refLog.length = 0
    const beforeTry = credits('alice')
    const tryon = await alice.sceneSwap.create(tryInput)
    assert.equal(await status(alice.sceneSwap.create({ ...tryInput, sceneIds: [mine.id, system.id] })), 400)
    assert.equal(await status(alice.sceneSwap.create({ ...tryInput, shots: ['back'] as any })), 400, 'style without a back photo')
    let made = await done(tryon.id)
    assert.equal(made.status, 'trial_ready')
    assert.deepEqual(made.items.map((item) => [item.group, item.shot, item.master, item.status]), [
      ['A108', 'front', true, 'passed'], ['A108', 'side', false, 'waiting'], ['A108', 'back', false, 'waiting'],
      ['A109', 'front', true, 'passed'], ['A109', 'side', false, 'waiting'],
    ])
    assert.deepEqual([...refLog].sort(), [3, 4], 'products + model + scene')
    assert.equal(await status(alice.sceneSwap.action(tryon.id, 'retrial')), 400, 'no other style to try')
    refLog.length = 0
    await alice.sceneSwap.action(tryon.id, 'run')
    made = await done(tryon.id)
    assert.equal(made.status, 'done', JSON.stringify(made.items.map((item) => [item.status, item.error])))
    assert.deepEqual([...refLog].sort(), [4, 5, 5], 'the approved photo is a reference')
    assert.equal(beforeTry - credits('alice'), 5 * price, 'free trials are used up, every image is charged once')
    assert.equal(made.items[2]!.sourceFileId, images[1]!.fileId, 'back view is compared with the back photo')

    // ---- 主图没过：同款其余先不跑；主图不要了，其余失败但不扣点
    verdict = '{"color":false,"pattern":true,"shape":true,"model":true,"limbs":true}'
    const three = await alice.sceneSwap.create({ ...tryInput, shots: ['front', 'side'] as any, images: images.slice(0, 3).map((image, i) => ({ ...image, group: `G${i}` })) })
    verdict = '{"color":true,"pattern":true,"shape":true,"model":true,"limbs":true}'
    await done(three.id)
    verdict = '{"color":false,"pattern":true,"shape":true,"model":true,"limbs":true}'
    await alice.sceneSwap.action(three.id, 'run')
    made = await done(three.id)
    const third = made.items.filter((item) => item.group === 'G2')
    assert.deepEqual(third.map((item) => item.status), ['review', 'waiting'])
    assert.equal(made.status, 'trial_ready')
    await alice.sceneSwap.item(three.id, third[0]!.id, 'reject')
    const kept = credits('alice')
    await alice.sceneSwap.action(three.id, 'run')
    made = await done(three.id)
    assert.equal(made.items.find((item) => item.id === third[1]!.id)!.status, 'failed')
    assert.match(made.items.find((item) => item.id === third[1]!.id)!.error ?? '', /主图/)
    assert.equal(credits('alice'), kept)
    assert.equal(made.status, 'done')
    const folders = (await alice.sync.pull(0, [SYNC_COLLECTIONS.assets])).changes.map((change: any) => change.data.folder)
    assert.ok(folders.includes('模特图 / A108') && folders.includes('换模特 / A108'))

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
  // ---- 出图一直不返回：到时限算失败并退点，不占着队列
  again.db.prepare("UPDATE scene_swap_batches SET status = 'done'").run()
  const stuck = again.db.prepare("SELECT id, batch_id, user_id FROM scene_swap_items WHERE batch_id IN (SELECT id FROM scene_swap_batches WHERE json_extract(data, '$.mode') = 'blend') LIMIT 1").get() as any
  assert.ok(stuck)
  again.db.prepare("UPDATE scene_swap_items SET status = 'queued', trial = 0, hold_id = NULL, attempts = 0 WHERE id = ?").run(stuck.id)
  again.db.prepare("UPDATE scene_swap_batches SET status = 'running' WHERE id = ?").run(stuck.batch_id)
  const balance = () => Number((again.db.prepare('SELECT credits FROM users WHERE id = ?').get(stuck.user_id) as any).credits)
  again.db.prepare('UPDATE users SET credits = 1000 WHERE id = ?').run(stuck.user_id)
  let editTimeoutMs = 0
  const hung = createCloudApp(overrides, { ...options, sceneSwapAttemptLimitMs: 400, generationProviders: { generateImage: (input: any) => { editTimeoutMs = input.editTimeoutMs; return new Promise(() => undefined) } } } as any)
  hung.sceneSwap.start()
  await hung.sceneSwap.idle()
  const row = hung.db.prepare('SELECT status, hold_id, data FROM scene_swap_items WHERE id = ?').get(stuck.id) as any
  assert.equal(row.status, 'failed')
  assert.equal(row.hold_id, null)
  assert.match(row.data, /AI 出图超时/)
  assert.equal(editTimeoutMs, 280_000)
  assert.equal(balance(), 1000, 'timed-out image is refunded')
  hung.sceneSwap.close()
  hung.db.close()
  again.db.close()
  rmSync(dir, { recursive: true, force: true })
  console.log('scene-swap smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
