import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-download-504-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  async function waitForItemCompleted(id: string, timeoutMs = 12000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current?.packagingStatus === 'completed') return current
      if (current?.packagingStatus === 'failed') {
        throw new Error(`Live photo item failed unexpectedly: ${String(current.error || 'unknown failure')}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const latest = await livePhotoService.get(id)
    throw new Error(`Timed out waiting for live photo completion ${id}: ${JSON.stringify(latest, null, 2)}`)
  }

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { outDir: string; filePrefix?: string }) => {
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
    downloadRetryDelaysMs: [10, 10, 10],
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
  let queryCount = 0
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
        return new Response(JSON.stringify({ id: 'task_504', status: 'queued' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://gaorui.cc/v1/videos/task_504') {
        queryCount += 1
        return new Response(JSON.stringify({ id: 'task_504', status: 'completed', url: 'https://cdn.example.com/generated/live-photo-504.mp4' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://cdn.example.com/generated/live-photo-504.mp4') {
        downloadCount += 1
        // 前 6 次文件服务器网关超时（比一轮重试次数多），之后恢复
        if (downloadCount <= 6) return new Response('<html>504 Gateway Time-out</html>', { status: 504 })
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

    // 远端已成功、下载先 504：不能判失败，要继续等、下次再下
    const completed = await waitForItemCompleted(created.id, 90000)
    assert.equal(completed.packagingStatus, 'completed')
    assert.equal(videoPostCount, 1, 'download failures must not resubmit the video task')
    assert.ok(downloadCount >= 7, `expected the download to be retried until it worked, got ${downloadCount}`)
    assert.ok(queryCount >= 2, 'a failed download round should leave the task pending and poll again')
    assert.equal(completed.autoFlowStatus?.videoRetryCount ?? 0, 0, 'a transient download failure is not a video failure')
    assert.ok(existsSync(String(completed.motionVideoPath || '')))

    // 旧版本留下的「下载 504 被判失败」任务：重试只重新下载，不重新提交扣费
    const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
    // 和真实情况一致：还没成片就失败了，首帧图在 generated-still/ 里（不在会被重试清掉的成片目录）
    const { copyFile } = await import('node:fs/promises')
    const stillDir = path.join(path.dirname(String(completed.generatedStillPath)), 'generated-still')
    await mkdir(stillDir, { recursive: true })
    const retryStill = path.join(stillDir, 'reference_replace_retry.png')
    await copyFile(String(completed.generatedStillPath), retryStill)
    await livePhotoRepo.upsert({
      ...completed,
      generatedStillPath: retryStill,
      packagingStatus: 'failed',
      motionVideoPath: undefined,
      livePhotoVideoPath: undefined,
      previewVideoPath: undefined,
      videoTaskId: 'task_504',
      videoTaskProvider: 'video_catalog',
      videoTaskModel: 'gaorui:veo_3_1-fl',
      error: '[retry_limit] Video generation retry limit reached after 2 attempts. Download failed HTTP 504: https://cdn.example.com/generated/live-photo-504.mp4',
      autoFlowStatus: { ...(completed.autoFlowStatus as any), status: 'failed_terminal', failedStage: 'video', currentStage: 'video_generation', lastError: 'Download failed HTTP 504' },
      updatedAt: Date.now(),
    } as any)
    const postsBeforeRetry = videoPostCount
    const queriesBeforeRetry = queryCount
    await livePhotoService.retry({ id: created.id, retryMode: 'manual_once' } as any)
    const recovered = await waitForItemCompleted(created.id, 90000)
    assert.equal(recovered.packagingStatus, 'completed')
    assert.equal(videoPostCount, postsBeforeRetry, 'retry after a download failure must not resubmit')
    assert.ok(queryCount > queriesBeforeRetry, 'retry re-queries the existing remote task')

    // 普通原因失败后重试（会清掉旧任务）：要按所选模型正常提交一次，不能落到旧的生成链
    const recoveredStill = path.join(stillDir, 'reference_replace_retry2.png')
    await copyFile(retryStill, recoveredStill)
    const afterRecovery = await livePhotoRepo.get(created.id)
    await livePhotoRepo.upsert({
      ...(afterRecovery as any),
      generatedStillPath: recoveredStill,
      packagingStatus: 'failed',
      motionVideoPath: undefined,
      livePhotoVideoPath: undefined,
      previewVideoPath: undefined,
      videoTaskId: undefined,
      videoTaskProvider: undefined,
      videoTaskModel: undefined,
      error: '[retry_limit] Video generation retry limit reached after 2 attempts. upstream said no',
      autoFlowStatus: { ...((afterRecovery as any).autoFlowStatus || {}), status: 'failed_terminal', failedStage: 'video', currentStage: 'video_generation', lastError: 'upstream said no' },
      updatedAt: Date.now(),
    } as any)
    const postsBeforeSecondRetry = videoPostCount
    await livePhotoService.retry({ id: created.id, retryMode: 'manual_once' } as any)
    const regenerated = await waitForItemCompleted(created.id, 90000)
    assert.equal(regenerated.packagingStatus, 'completed')
    assert.equal(videoPostCount, postsBeforeSecondRetry + 1, 'a normal retry submits exactly once with the chosen model')

    globalThis.fetch = originalFetch
    console.log('live photo download 504 smoke test passed')
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
