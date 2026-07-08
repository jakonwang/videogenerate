import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-retry-limit-manual-retry-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

  function delay(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        pendingTimers.delete(timer)
        resolve()
      }, ms)
      pendingTimers.add(timer)
    })
  }

  async function waitForItemCompleted(id: string, timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current?.packagingStatus === 'completed') return current
      if (current?.packagingStatus === 'failed' && current?.autoFlowStatus?.status === 'failed_terminal') {
        throw new Error(String(current.error || `Live photo item ${id} failed`))
      }
      await delay(100)
    }
    throw new Error(`Timed out waiting for live photo item ${id}`)
  }

  let generatedStillCalls = 0
  const submittedVideoTaskIds: string[] = []

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { outDir: string; filePrefix?: string }) => {
      generatedStillCalls += 1
      const outputFilePath = path.join(input.outDir, `${input.filePrefix || 'reference_replace'}.png`)
      await mkdir(path.dirname(outputFilePath), { recursive: true })
      await writeFile(outputFilePath, 'mock-generated-still', 'utf-8')
      return outputFilePath
    },
  })

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
        imageToVideoModel: 'veo_3_1-fl',
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
      name: 'Retry Limit Product',
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
    let latestSubmittedTaskId = ''
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.startsWith('https://upload.qiniup.com')) {
        return new Response(JSON.stringify({ key: `uploaded/${Date.now()}.png` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://gaorui.cc/v1/videos') {
        const nextTaskId = `gaorui-live-photo-task-${submittedVideoTaskIds.length + 1}`
        latestSubmittedTaskId = nextTaskId
        submittedVideoTaskIds.push(nextTaskId)
        return new Response(
          JSON.stringify({
            id: nextTaskId,
            status: 'queued',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url === `https://gaorui.cc/v1/videos/${latestSubmittedTaskId}`) {
        return new Response(
          JSON.stringify({
            id: latestSubmittedTaskId,
            status: 'succeeded',
            output_url: 'https://cdn.example.com/live-photo-retried.mp4',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url === 'https://cdn.example.com/live-photo-retried.mp4') {
        return new Response(Buffer.from('remote-retried-video'), {
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
    })
    const completed = await waitForItemCompleted(created.id, 15000)
    assert.equal(completed.packagingStatus, 'completed')
    assert.ok(generatedStillCalls >= 1)
    assert.equal(submittedVideoTaskIds.length, 1)
    assert.ok(existsSync(String(completed.generatedStillPath || '')))

    await rm(path.join(root, 'plugin-live-photo', created.id), { recursive: true, force: true })

    const failedTerminal = await livePhotoRepo.upsert({
      ...completed,
      motionVideoPath: undefined,
      livePhotoImagePath: undefined,
      livePhotoVideoPath: undefined,
      previewVideoPath: undefined,
      posterPath: undefined,
      packagingManifestPath: undefined,
      exportBundlePath: undefined,
      packagingAssetIdentifier: undefined,
      packagingMetadataBridgePath: undefined,
      videoMetadataMode: undefined,
      imageMetadataMode: undefined,
      packagingStatus: 'failed',
      error: '[retry_limit] Live Photo auto retry reached 2 times. Please check the source material and retry manually.',
      videoTaskId: 'old-failed-task-id',
      videoTaskProvider: 'gaorui',
      videoTaskModel: 'veo_3_1-fl',
      videoTaskBaseUrl: 'https://gaorui.cc',
      videoTaskEndpointStyle: 'openai_video',
      workflow: {
        currentStep: 'video_generation',
        updatedAt: Date.now(),
        stepStatus: {
          queued: { status: 'done', updatedAt: Date.now() },
          image_generation: { status: 'done', updatedAt: Date.now() },
          video_generation: { status: 'failed', updatedAt: Date.now(), error: 'video failed twice' },
          live_photo_packaging: { status: 'idle', updatedAt: Date.now() },
          completed: { status: 'idle', updatedAt: Date.now() },
        },
      },
      autoFlowStatus: {
        enabled: true,
        status: 'failed_terminal',
        paused: false,
        retryLimit: 2,
        retryCount: 2,
        currentStage: 'video_generation',
        lastError: 'video failed twice',
      },
      updatedAt: Date.now(),
    } as any)

    const retried = await livePhotoService.retry({
      id: failedTerminal.id,
      motionTemplate: 'push_out',
    })
    assert.equal(retried.autoFlowStatus?.retryCount, 0)
    assert.ok(['idle', 'running'].includes(String(retried.autoFlowStatus?.status || '')))
    assert.ok(['queued', 'video_generation'].includes(String(retried.workflow?.currentStep || '')))
    assert.equal(String(retried.videoTaskId || '').trim(), '')

    const retriedCompleted = await waitForItemCompleted(retried.id, 15000)
    assert.equal(retriedCompleted.packagingStatus, 'completed')
    assert.equal(generatedStillCalls, 2)
    assert.equal(submittedVideoTaskIds.length, 2)
    assert.equal(submittedVideoTaskIds[0], 'gaorui-live-photo-task-1')
    assert.equal(submittedVideoTaskIds[1], 'gaorui-live-photo-task-2')
    assert.ok(
      Array.isArray(retriedCompleted.logs) &&
        retriedCompleted.logs.some((log: any) =>
          String(log?.message || '').includes('manual retry preserved generated still and restarted from video_generation stage'),
        ),
    )
    assert.doesNotMatch(String(retriedCompleted.error || ''), /\[retry_limit\]/)

    globalThis.fetch = originalFetch
    console.log('live photo retry-limit manual retry resubmits video smoke test passed')
  } finally {
    await livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await Promise.all(
      [...pendingTimers].map(
        (timer) =>
          new Promise<void>((resolve) => {
            clearTimeout(timer)
            resolve()
          }),
      ),
    )
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
