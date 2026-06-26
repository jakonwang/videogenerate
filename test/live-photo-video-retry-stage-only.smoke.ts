import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-video-retry-'))
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

  const generatedStillCalls: Array<{ imagePaths: string[]; prompt?: string }> = []
  const generatedVideoCalls: Array<{ prompt?: string; negativePrompt?: string }> = []

  const mockStructureAnalysis = async () => ({
    summary: 'silver hoop earring with rectangular drop charm structure preserved',
    coreSubject: 'silver hoop earring',
    connectionStructure: 'hinged hoop with rectangular hanging charm',
    materialDetails: 'polished silver metal',
    surfaceDetails: 'smooth reflective metal surface',
    colorDetails: 'cool silver tone',
    geometryDetails: 'thin circular hoop and vertical rectangular charm',
    sizeScale: 'small earring proportion relative to ear',
    matchingRules: ['hinged hoop', 'rectangular charm', 'silver metal', 'small earring'],
  })

  const mockStrictReplacementReview = async () => ({
    passed: true,
    skipped: false,
    reason: '',
    score: 1,
    matchedPhrases: ['silver hoop earring', 'hinged hoop with rectangular hanging charm'],
    missingPhrases: [],
    negativeSignals: [],
    analyzed: null,
  })

  const mockVisualReplacementReview = async () => ({
    passed: true,
    skipped: false,
    reason: '',
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
  })

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      if (!outPath) throw new Error('Missing ffmpeg output path')
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string; imagePaths: string[]; prompt?: string }) => {
      generatedStillCalls.push({
        imagePaths: [...input.imagePaths],
        prompt: input.prompt,
      })
      const outputFilePath = path.join(input.outDir, `${input.filePrefix}.png`)
      await mkdir(path.dirname(outputFilePath), { recursive: true })
      await writeFile(outputFilePath, 'mock-generated-still', 'utf-8')
      return outputFilePath
    },
    generateShotVideoByProviderChain: async (input: { outDir: string; prompt?: string; negativePrompt?: string }) => {
      generatedVideoCalls.push({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
      })
      const outputFilePath = path.join(input.outDir, `mock-live-photo-${generatedVideoCalls.length}.mp4`)
      await mkdir(path.dirname(outputFilePath), { recursive: true })
      await writeFile(outputFilePath, 'mock-generated-video', 'utf-8')
      return {
        outputFilePath,
        taskId: `mock-task-${generatedVideoCalls.length}`,
        provider: 'seedance',
      } as any
    },
    analyzeProductStructureWithGrs: mockStructureAnalysis as any,
    reviewReferenceReplacementStillStrict: mockStrictReplacementReview as any,
    reviewReferenceReplacementStillVisual: mockVisualReplacementReview as any,
  })

  try {
    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const referenceImage = path.join(assetsDir, 'reference.jpg')
    const analysisBoardImage = path.join(assetsDir, 'product-analysis-board.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(referenceImage, 'reference-image', 'utf-8')
    await writeFile(analysisBoardImage, 'analysis-board-image', 'utf-8')

    await cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      imageApifoxHubProfile: 'vectorengine',
      vectorEngineHub: {
        enabled: true,
        baseUrl: 'https://vector.example.com',
        apiKey: 'vector-key',
        imageProvider: 'openai',
        imageModel: 'vector-image',
        imageEditModel: 'vector-image-edit',
        imageEndpointStyle: 'openai_images',
        defaultPollIntervalMs: 2000,
        defaultTimeoutMs: 600000,
      },
      apifoxHub: {
        enabled: true,
        baseUrl: 'https://vector.example.com',
        apiKey: 'vector-key',
        imageProvider: 'openai',
        imageModel: 'vector-image',
        imageEditModel: 'vector-image-edit',
        imageEndpointStyle: 'openai_images',
        defaultPollIntervalMs: 2000,
        defaultTimeoutMs: 600000,
      },
      videoProviderPrimary: 'grsai',
      videoProviderFallback: 'grsai',
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.startsWith('https://upload.qiniup.com')) {
        return new Response(JSON.stringify({ key: 'uploaded/mock.png' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://api.openai.com/v1/images/edits') {
        return new Response(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from('openai-image').toString('base64'),
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url === 'https://vector.example.com/v1/images/edits') {
        return new Response(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from('vector-image').toString('base64'),
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return await originalFetch(input, init)
    }) as typeof fetch

    const product = await productsRepo.upsert({
      name: 'Retry Stage Product',
      type: 'earring',
      productAnalysis: {
        category: 'jewelry',
        summary: 'silver hoop earring with rectangular drop charm',
        coreSubject: 'silver hoop earring',
        connectionStructure: 'hinged hoop with rectangular hanging charm',
        materialDetails: 'polished silver metal',
        wearingPosition: 'ear lobe',
        surfaceDetails: 'smooth reflective metal surface',
        colorDetails: 'cool silver tone',
        geometryDetails: 'thin circular hoop and vertical rectangular charm',
        sizeScale: 'small earring proportion relative to ear',
        matchingRules: ['hinged hoop', 'rectangular charm', 'silver metal', 'small earring'],
        rawDescription: 'Structured product baseline for retry-stage validation',
      },
      images: [
        {
          id: 'img-retry-1',
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
      livePhotoReferenceImagePath: productImage,
      analysisBoardPath: analysisBoardImage,
      analysisBoardStatus: 'done',
      canonicalSourcePath: productImage,
      canonicalSourceStatus: 'done',
    } as any)

    const created = await livePhotoService.createFromReference({
      referenceImagePath: referenceImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const completed = await waitForItemCompleted(created.id)
    assert.equal(completed.packagingStatus, 'completed')
    assert.equal(generatedStillCalls.length, 1)
    assert.equal(generatedVideoCalls.length, 1)
    assert.ok(existsSync(String(completed.generatedStillPath || '')))

    const beforeRetryStillCalls = generatedStillCalls.length
    const beforeRetryVideoCalls = generatedVideoCalls.length
    const syntheticFailedVideoItem = await livePhotoRepo.upsert({
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
      imageTaskId: undefined,
      imageTaskProvider: undefined,
      imageTaskModel: undefined,
      imageTaskBaseUrl: undefined,
      imageTaskEndpointStyle: undefined,
      videoTaskId: 'failed-video-task-id',
      videoTaskProvider: 'seedance',
      videoTaskModel: 'seedance-live-photo',
      videoTaskBaseUrl: 'https://example.invalid/video',
      videoTaskEndpointStyle: 'openai_compatible',
      packagingStatus: 'failed',
      error: 'video failed',
      workflow: {
        currentStep: 'video_generation',
        updatedAt: Date.now(),
        stepStatus: {
          queued: { status: 'done', updatedAt: Date.now() },
          image_generation: { status: 'done', updatedAt: Date.now() },
          video_generation: { status: 'failed', updatedAt: Date.now(), error: 'video failed' },
          live_photo_packaging: { status: 'idle', updatedAt: Date.now() },
          completed: { status: 'idle', updatedAt: Date.now() },
        },
      },
      autoFlowStatus: {
        enabled: true,
        status: 'failed_terminal',
        retryLimit: 2,
        retryCount: 1,
        currentStage: 'video_generation',
        lastError: 'video failed',
      },
      updatedAt: Date.now(),
    } as any)

    const retried = await livePhotoService.retry({
      id: syntheticFailedVideoItem.id,
      motionTemplate: 'push_out',
    })
    assert.equal(retried.workflow?.currentStep, 'video_generation')
    assert.equal(retried.workflow?.stepStatus.image_generation.status, 'done')
    assert.equal(retried.autoFlowStatus?.currentStage, 'video_generation')

    const retriedCompleted = await waitForItemCompleted(retried.id)
    assert.equal(retriedCompleted.packagingStatus, 'completed')
    assert.equal(generatedStillCalls.length, beforeRetryStillCalls)
    assert.ok(generatedVideoCalls.length > beforeRetryVideoCalls)
    assert.ok(
      Array.isArray(retriedCompleted.logs) &&
        retriedCompleted.logs.some((log: any) =>
          String(log?.message || '').includes('manual retry preserved generated still and restarted from video_generation stage'),
        ),
    )

    globalThis.fetch = originalFetch
    console.log('live photo video retry stage-only smoke test passed')
  } finally {
    livePhotoService.resetTestDependencies()
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
