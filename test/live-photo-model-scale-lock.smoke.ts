import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-scale-lock-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
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
      name: 'Scale Lock Product',
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
        rawDescription: 'Structured product baseline for model scale lock',
      },
      images: [
        {
          id: 'img-scale-1',
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

    const prompt = String((queued as any)?.imagePromptPreview?.prompt || '')
    assert.match(prompt, /Replace the product in Image 1 with the exact physical product from Image 2/i)
    assert.match(prompt, /Treat the product in Image 2 as the only source of truth/i)
    assert.match(prompt, /Allow only natural environmental adaptation/i)
    assert.match(prompt, /seamlessly integrated into Image 1 with no cut-and-paste artifacts/i)

    assert.doesNotMatch(prompt, /Product real-world scale from Image 2 and Product DNA/i)
    assert.doesNotMatch(prompt, /When Image 1 is a model reference, keep the selected product at its own correct wearable scale\./i)
    assert.doesNotMatch(prompt, /Do NOT inherit the old product size from Image 1/i)
    assert.doesNotMatch(prompt, /If the scene contains a person or model, keep the product close to the body anchor and never float it outward\./i)

    console.log('live photo model scale lock smoke test passed')
  } finally {
    livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
