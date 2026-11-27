import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { configureAppPathRuntime } from '../src/main/lib/paths'

/**
 * 贴真实商品：擦除 → 抠图 → 摆放（可停下来等确认）→ 融合 → 视频。平台请求全部用假的。
 */
async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-paste-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const paste = await import('../src/main/modules/live-photo/pasteReplace')

  async function waitFor<T>(label: string, read: () => Promise<T | null | undefined | false>, timeoutMs = 20000): Promise<T> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const value = await read()
      if (value) return value as T
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`timed out: ${label}`)
  }

  const fixtures = path.join(root, 'fixtures')
  await mkdir(fixtures, { recursive: true })
  const refImage = path.join(fixtures, 'reference.png')
  const productImage = path.join(fixtures, 'product.png')
  await sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 200, g: 150, b: 130 } } }).png().toFile(refImage)
  // 商品：白底上一个深色方块
  await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ffffff' } })
    .composite([{ input: await sharp({ create: { width: 80, height: 120, channels: 3, background: '#303540' } }).png().toBuffer(), left: 60, top: 40 }])
    .png()
    .toFile(productImage)

  // 抠图（服务器代办）：返回商品方块的蒙版
  let cutoutCalls = 0
  paste.setProductCutoutProvider(async (input) => {
    cutoutCalls += 1
    const meta = await sharp(Buffer.from(input.image, 'base64')).metadata()
    const mask = await sharp({ create: { width: meta.width!, height: meta.height!, channels: 3, background: '#000000' } })
      .composite([{ input: await sharp({ create: { width: Math.round(meta.width! * 0.4), height: Math.round(meta.height! * 0.6), channels: 3, background: '#ffffff' } }).png().toBuffer(), left: Math.round(meta.width! * 0.3), top: Math.round(meta.height! * 0.2) }])
      .png()
      .toBuffer()
    return { mask: mask.toString('base64') }
  })

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    // 贴真实商品不走这里；换掉它只是为了让定位商品用默认框（不去请求对话模型）
    generateGptShotFrameImage: async () => {
      throw new Error('paste replace must not call the legacy image generation')
    },
  } as any)

  const generateBodies: any[] = []
  let videoPosts = 0
  const originalFetch = globalThis.fetch
  const fakePng = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 190, g: 140, b: 120 } } }).png().toBuffer()
  const fakeSquare = await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 190, g: 140, b: 120 } } }).png().toBuffer()
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input || '')
    if (url.startsWith('https://upload.qiniup.com')) {
      return new Response(JSON.stringify({ key: `uploaded/${Date.now()}-${Math.random()}.png` }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url === 'https://grsaiapi.com/v1/api/generate') {
      const body = JSON.parse(String(init?.body || '{}'))
      generateBodies.push(body)
      return new Response(JSON.stringify({ id: `task-${generateBodies.length}`, status: 'running' }), { status: 200 })
    }
    if (url.startsWith('https://grsaiapi.com/v1/api/result?id=')) {
      const id = new URL(url).searchParams.get('id')
      return new Response(JSON.stringify({ data: { id, status: 'succeeded', results: [{ url: `https://cdn.example.com/gen/${id}.png` }] } }), { status: 200 })
    }
    if (url.startsWith('https://cdn.example.com/gen/')) {
      const square = /task-1\b/.test(url) // 第一次是擦除（方图）
      return new Response(new Uint8Array(square ? fakeSquare : fakePng), { status: 200, headers: { 'Content-Type': 'image/png' } })
    }
    if (url === 'https://gaorui.cc/v1/videos') {
      videoPosts += 1
      return new Response(JSON.stringify({ url: 'https://cdn.example.com/video/out.mp4' }), { status: 200 })
    }
    if (url === 'https://cdn.example.com/video/out.mp4') return new Response('mock-video', { status: 200, headers: { 'Content-Type': 'video/mp4' } })
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  try {
    await cloneRepo.setCredentials({
      imageProviderPrimary: 'grsai',
      grsaiApiKey: 'test-grs',
      grsaiHost: 'https://grsaiapi.com',
      videoProviderPrimary: 'apifox_hub',
      videoApifoxHubProfile: 'gaorui',
      apifoxHubProfile: 'gaorui',
      gaoruiHub: { enabled: true, baseUrl: 'https://gaorui.cc', apiKey: 'test-gaorui', videoProvider: 'gaorui', defaultPollIntervalMs: 5, defaultTimeoutMs: 50 },
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://cdn.example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)
    const product = await productsRepo.upsert({
      name: 'Paste Earring',
      type: 'earrings',
      images: [{ id: 'img-1', productId: 'pending', filePath: productImage, fileName: 'product.png', fileSize: 1, createdAt: Date.now(), updatedAt: Date.now(), isCover: true }],
      coverImagePath: productImage,
      canonicalSourcePath: productImage,
      canonicalSourceStatus: 'done',
    } as any)

    // 1) 生成前让我确认：擦完、抠完停下来
    const created: any = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
      videoModelId: 'gaorui:veo_3_1-fl',
      videoZoomPercent: 0,
      placementMode: 'confirm',
    } as any)
    assert.equal(created.replaceMode, 'paste')
    assert.equal(created.placementMode, 'confirm')
    const waiting: any = await waitFor('awaiting placement', async () => {
      const item: any = await livePhotoService.get(created.id)
      if (item?.packagingStatus === 'failed') throw new Error(`failed: ${item.error}`)
      return item?.awaitingPlacement ? item : null
    })
    assert.ok(existsSync(waiting.erasedScenePath), 'erased scene saved')
    assert.ok(existsSync(waiting.productCutoutPath), 'cutout saved')
    assert.equal(waiting.autoFlowStatus.paused, true)
    assert.equal(generateBodies.length, 1, 'only the erase call before confirmation')
    assert.equal(generateBodies[0].images.length, 1)
    assert.equal(generateBodies[0].model, 'nano-banana-2.1')
    assert.equal(cutoutCalls, 1)
    const eraseOut = await sharp(waiting.erasedScenePath).metadata()
    assert.equal(eraseOut.width, 300)
    assert.equal(eraseOut.height, 400)

    // 2) 调整摆放的数据：默认大小 = 原商品框
    const placement: any = await livePhotoService.getPlacement({ id: created.id })
    assert.equal(placement.ready, true)
    assert.ok(Math.abs(placement.defaultPlacement.cx - 0.5) < 1e-6)
    const cutoutMeta = await sharp(placement.cutoutPath).metadata()
    assert.ok(cutoutMeta.hasAlpha, 'cutout has alpha')

    // 3) 确认（放大到 150%、转 10 度）：融合一次，再生成视频
    await livePhotoService.confirmPlacement({ id: created.id, placement: { ...placement.defaultPlacement, width: placement.defaultPlacement.width * 1.5, rotation: 10 } })
    const completed: any = await waitFor('completed', async () => {
      const item: any = await livePhotoService.get(created.id)
      if (item?.packagingStatus === 'failed') throw new Error(`failed: ${item.error}`)
      return item?.packagingStatus === 'completed' ? item : null
    })
    assert.equal(generateBodies.length, 2, 'erase reused, one harmonize call')
    assert.equal(generateBodies[1].images.length, 2, 'harmonize sends the placed guide + product photo')
    assert.match(generateBodies[1].prompt, /do not enlarge or shrink/)
    assert.match(generateBodies[1].prompt, /ear lobe piercing/, 'earring wearing instructions')
    assert.equal(cutoutCalls, 1, 'cutout cached')
    assert.ok(completed.placement.confirmedAt)
    assert.ok(existsSync(completed.generatedStillPath), 'final still saved')
    const still = await sharp(completed.generatedStillPath).metadata()
    assert.equal(still.width, 300, 'still keeps the reference size')
    assert.equal(videoPosts, 1)
    assert.ok(!completed.awaitingPlacement)

    // 4) 自动摆放：不停顿，抠图走缓存
    const auto: any = await livePhotoService.createFromReference({ referenceImagePath: refImage, productId: product.id, motionTemplate: 'push_in', videoModelId: 'gaorui:veo_3_1-fl', videoZoomPercent: 0 } as any)
    assert.equal(auto.placementMode, 'auto')
    await waitFor('auto completed', async () => {
      const item: any = await livePhotoService.get(auto.id)
      if (item?.packagingStatus === 'failed') throw new Error(`failed: ${item.error}`)
      return item?.packagingStatus === 'completed' ? item : null
    })
    assert.equal(cutoutCalls, 1, 'same product image is cut out only once')
    assert.equal(generateBodies.length, 4)

    // 5) 没登录（不能抠图）：新任务回到原来的方式
    paste.setProductCutoutProvider(null)
    const legacy: any = await livePhotoService.enqueueReferenceItems({ referenceImagePath: refImage, productId: product.id } as any)
    assert.equal(legacy.replaceMode, undefined)

    // 6) 默认摆放的计算：按长边塞进原商品的框
    const def = paste.defaultProductPlacement({ region: { x: 0.4, y: 0.4, width: 0.2, height: 0.1 }, sceneWidth: 1000, sceneHeight: 1000, cutoutWidth: 50, cutoutHeight: 100 })
    assert.ok(Math.abs(def.width - 0.05) < 1e-9, 'height-limited: 100px tall box → 50px wide')
    assert.ok(Math.abs(def.cx - 0.5) < 1e-9 && Math.abs(def.cy - 0.45) < 1e-9)

    // 7) 商品图是一对：只留一只；单只的不动
    const W = 300
    const H = 200
    const pair = Buffer.alloc(W * H * 4, 0)
    const fill = (buf: Buffer, x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) buf[(y * W + x) * 4 + 3] = 255 }
    fill(pair, 20, 40, 110, 160)
    fill(pair, 170, 50, 250, 150)
    assert.equal(paste.keepSinglePiece(pair, W, H), true)
    const kept = await sharp(pair, { raw: { width: W, height: H, channels: 4 } }).png().trim({ threshold: 1 }).toBuffer({ resolveWithObject: true })
    assert.deepEqual([kept.info.width, kept.info.height], [90, 120], 'keeps the larger one of the pair')
    const single = Buffer.alloc(W * H * 4, 0)
    fill(single, 20, 40, 110, 160)
    fill(single, 280, 10, 284, 14)
    assert.equal(paste.keepSinglePiece(single, W, H), false, 'a single product with a speck is left alone')

    console.log('live photo paste replace smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
    paste.setProductCutoutProvider(null)
    await livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await new Promise((resolve) => setTimeout(resolve, 100))
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
