import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-oversized-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  async function rmWithRetry(targetPath: string, attempts = 10, delayMs = 200) {
    let lastError: unknown = null
    for (let index = 0; index < attempts; index += 1) {
      try {
        await rm(targetPath, { recursive: true, force: true })
        return
      } catch (error: any) {
        lastError = error
        if (error?.code !== 'EBUSY' && error?.code !== 'ENOTEMPTY') throw error
        await delay(delayMs)
      }
    }
    if (lastError) throw lastError
  }

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string }) => {
      const outputFilePath = path.join(input.outDir, `${input.filePrefix}.png`)
      await mkdir(path.dirname(outputFilePath), { recursive: true })
      await writeFile(outputFilePath, 'mock-generated-still', 'utf-8')
      return outputFilePath
    },
    generateShotVideoByProviderChain: async (input: { outDir: string }) => {
      const outputFilePath = path.join(input.outDir, 'mock-live-photo.mp4')
      await mkdir(path.dirname(outputFilePath), { recursive: true })
      await writeFile(outputFilePath, 'mock-generated-video', 'utf-8')
      return {
        outputFilePath,
        taskId: `mock-task-${Date.now()}`,
        provider: 'seedance',
      } as any
    },
    analyzeProductStructureWithGrs: async () =>
      ({
        summary: 'small huggie earring for ear-lobe wearing',
        coreSubject: 'small huggie earring',
        connectionStructure: 'hinged huggie closure with front ornament',
        materialDetails: 'polished gold metal with crystal ornament',
        surfaceDetails: 'smooth reflective metal surface',
        colorDetails: 'warm gold tone with clear crystal',
        geometryDetails: 'small circular huggie with front bow charm',
        sizeScale: 'small earring proportion relative to ear lobe',
        matchingRules: ['small huggie', 'ear lobe scale', 'front bow charm'],
      }) as any,
    reviewReferenceReplacementStillStrict: async () =>
      ({
        passed: true,
        skipped: false,
        reason: '',
        score: 1,
        matchedPhrases: [],
        missingPhrases: [],
        negativeSignals: [],
        analyzed: null,
      }) as any,
    reviewReferenceReplacementStillVisual: async () =>
      ({
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
      }) as any,
  })

  try {
    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const analysisBoardImage = path.join(assetsDir, 'product-analysis-board.jpg')
    const referenceImage = path.join(assetsDir, 'model-reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(analysisBoardImage, 'analysis-board-image', 'utf-8')
    await writeFile(referenceImage, 'model-reference-image', 'utf-8')

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
      },
      apifoxHub: {
        enabled: true,
        baseUrl: 'https://vector.example.com',
        apiKey: 'vector-key',
        imageProvider: 'openai',
        imageModel: 'vector-image',
        imageEditModel: 'vector-image-edit',
        imageEndpointStyle: 'openai_images',
      },
      videoProviderPrimary: 'grsai',
      videoProviderFallback: 'grsai',
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)

    const product = await productsRepo.upsert({
      name: 'Oversized Regression Product',
      type: 'earring',
      productAnalysis: {
        category: 'jewelry',
        summary: 'small huggie earring for ear-lobe wearing',
        coreSubject: 'small huggie earring',
        connectionStructure: 'hinged huggie closure with front ornament',
        materialDetails: 'polished gold metal with crystal ornament',
        surfaceDetails: 'smooth reflective metal surface',
        colorDetails: 'warm gold tone with clear crystal',
        geometryDetails: 'small circular huggie with front bow charm',
        sizeScale: 'small earring proportion relative to ear lobe',
        matchingRules: ['small huggie', 'ear lobe scale', 'front bow charm'],
        rawDescription: 'Structured product baseline for oversized-product regression',
      },
      images: [
        {
          id: 'img-oversized-1',
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

    const queued = await livePhotoService.enqueueReferenceItems({
      referenceImagePath: referenceImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })

    const oversizedFailed = await livePhotoRepo.upsert({
      ...(queued as any),
      packagingStatus: 'failed',
      error: '[image_validation_failed] oversized product on model [validation_category:oversized_product] visual_check_failed:scale',
      autoFlowStatus: {
        enabled: true,
        status: 'failed_retryable',
        retryLimit: 2,
        retryCount: 1,
        currentStage: 'image_generation',
        lastError: '[image_validation_failed] oversized product on model [validation_category:oversized_product] visual_check_failed:scale',
      },
      updatedAt: Date.now(),
    } as any)

    const retried = await livePhotoService.retry({
      id: oversizedFailed.id,
      motionTemplate: 'push_in',
    })

    const prompt = String((retried as any)?.imagePromptPreview?.prompt || '')
    assert.match(prompt, /If the product looks too large on the model, shrink it back to the selected product wearable ratio before changing anything else\./i)
    assert.match(prompt, /For earrings, keep the selected product proportion relative to ear-lobe height, ear-rim span, and piercing area\./i)
    assert.match(prompt, /If the result still looks oversized on the model, shrink the product to the correct ear-lobe, ear-rim, or body-anchor proportion without moving the anchor point\./i)

    console.log('live photo model oversized regression smoke test passed')
  } finally {
    await livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await delay(100)
    await rmWithRetry(root)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
