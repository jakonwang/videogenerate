import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-placement-review-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  async function waitForItemCompleted(id: string, timeoutMs = 30000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current?.packagingStatus === 'completed') return current
      if (current?.packagingStatus === 'failed' && current.autoFlowStatus?.status === 'failed_terminal') {
        throw new Error(`Live photo item failed unexpectedly: ${JSON.stringify({ error: current.error, status: current.autoFlowStatus, logs: (current as any).logs?.slice(-8) })}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const latest = await livePhotoService.get(id)
    throw new Error(`Timed out waiting for live photo completion ${id}: ${JSON.stringify(latest, null, 2)}`)
  }

  const imagePrompts: string[] = []
  const reviewCalls: number[] = []
  livePhotoService.setTestDependencies({
    // 第一次检查：商品画小了；重画后不会再检查
    reviewLivePhotoReplacementPlacement: async (input: any) => {
      reviewCalls.push(Number(input.item.autoFlowStatus?.imageRetryCount || 0))
      return { skipped: false, placement: 'pass', scale: 'too_small', reason: 'earring much smaller than the ear lobe' }
    },
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { outDir: string; filePrefix?: string; prompt: string }) => {
      imagePrompts.push(String(input.prompt || ''))
      const outputFilePath = path.join(input.outDir, `${input.filePrefix || 'reference_replace'}.png`)
      await mkdir(path.dirname(outputFilePath), { recursive: true })
      // 真实图片：尾帧要用 sharp 放大首帧
      const sharp = (await import('sharp')).default
      await sharp({ create: { width: 90, height: 160, channels: 3, background: { r: 120, g: 90, b: 60 } } }).png().toFile(outputFilePath)
      return outputFilePath
    },
    analyzeProductStructureWithGrs: async () => ({
      productName: 'Demo Product',
      analysisText: 'Stable product structure.',
      keyFeatures: ['stable product structure'],
    }) as any,
    reviewReferenceReplacementStillStrict: async () => ({
      passed: true,
      skipped: false,
      score: 1,
      matchedPhrases: ['stable product structure'],
      missingPhrases: [],
      negativeSignals: [],
      analyzed: null,
    }) as any,
    reviewReferenceReplacementStillVisual: async () => ({
      passed: true,
      skipped: false,
      score: 1,
      verdict: 'pass',
      failures: [],
      notes: [],
      checks: {
        product_identity: 'pass',
        source_contamination: 'pass',
        material_color: 'pass',
        attachment_structure: 'pass',
        scale: 'pass',
        scene_preservation: 'pass',
      },
    }) as any,
  })

  let videoPostCount = 0
  let downloadCount = 0
  let capturedVideoBody: any = null

  try {
    await cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'apifox_hub',
      videoApifoxHubProfile: 'gaorui',
      apifoxHubProfile: 'gaorui',
      gaoruiHub: {
        enabled: true,
        baseUrl: 'https://gaorui.cc',
        apiKey: 'test-gaorui-key',
        videoProvider: 'gaorui',
        videoEndpointStyle: 'openai_video',
        imageToVideoModel: 'veo_3_1',
        referenceVideoModel: 'veo_3_1-components',
        defaultPollIntervalMs: 5,
        defaultTimeoutMs: 50,
      },
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://cdn.example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)

    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const productBoardImage = path.join(assetsDir, 'product-board.jpg')
    const refImage = path.join(assetsDir, 'reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(productBoardImage, 'product-board-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'Demo Product',
      type: 'earrings',
      images: [
        {
          id: 'img-1',
          productId: 'pending',
          filePath: productImage,
          fileName: 'product.jpg',
          fileSize: 12,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isCover: true,
        },
      ],
      coverImagePath: productImage,
      analysisBoardPath: productBoardImage,
      analysisBoardStatus: 'done',
      canonicalSourcePath: productImage,
      canonicalSourceStatus: 'done',
    } as any)

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.startsWith('https://upload.qiniup.com')) {
        return new Response(JSON.stringify({ key: `uploaded/${Date.now()}.png` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://gaorui.cc/v1/videos') {
        videoPostCount += 1
        capturedVideoBody = JSON.parse(String(init?.body || '{}'))
        return new Response(JSON.stringify({ url: 'https://cdn.example.com/generated/live-photo-direct.mp4' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://cdn.example.com/generated/live-photo-direct.mp4') {
        downloadCount += 1
        return new Response('mock-video-binary', {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        })
      }
      return await originalFetch(input, init)
    }) as typeof fetch

    const created = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
      // 选清单里的模型：高瑞 Veo 3.1 首尾帧、1080p、尾帧推近 30%
      videoModelId: 'gaorui:veo_3_1-fl',
      videoDurationSec: 6,
      videoResolution: '1080p',
      videoZoomPercent: 30,
    } as any)

    const completed = await waitForItemCompleted(created.id)
    // 检查不通过 → 自动重画一次（带纠正提示），重画后放行，不会无限重画
    assert.deepEqual(reviewCalls, [0])
    assert.equal(imagePrompts.length, 2, 'regenerated once')
    assert.ok(/only marks WHERE/.test(imagePrompts[0]), 'box is position only')
    assert.ok(!/too small/.test(imagePrompts[0]))
    assert.ok(/made the product too small/.test(imagePrompts[1]), 'retry carries the size correction')
    assert.equal(videoPostCount, 1)
    assert.ok(existsSync(String(completed.motionVideoPath || '')))

    globalThis.fetch = originalFetch
    console.log('live photo placement review smoke test passed')
  } finally {
    await livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await new Promise((resolve) => setTimeout(resolve, 100))
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
