import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

const EXPECTED_IMAGE_REPLACEMENT_PROMPT = [
  'Replace the product in Image 1 with the exact physical product from Image 2 while preserving the original scene, composition, lighting, and atmosphere of Image 1.',
  '',
  'Treat the product in Image 2 as the only source of truth for the product. Preserve its text, colors, materials, textures, proportions, structure, and all visible details exactly as shown. Do not redesign, recreate, recolor, reshape, simplify, or modify the product in any way.',
  '',
  'Allow only natural environmental adaptation, including realistic ambient lighting, reflections, highlights, and stable contact shadows consistent with Image 1. These lighting effects must not alter the product\'s original appearance or identity.',
  '',
  'The replacement should be seamlessly integrated into Image 1 with no cut-and-paste artifacts, appearing as if the product had always been part of the original photograph.',
].join('\n')

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-guards-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const productsRepoModule = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
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
    analyzeProductStructureWithGrs: mockStructureAnalysis as any,
    reviewReferenceReplacementStillStrict: mockStrictReplacementReview as any,
    reviewReferenceReplacementStillVisual: mockVisualReplacementReview as any,
  })

  try {
    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const refImage = path.join(assetsDir, 'reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')

    const product = await productsRepoModule.productsRepo.upsert({
      name: 'Guard Product',
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
        rawDescription: 'Structured product baseline for validation',
      },
      images: [
        {
          id: 'img-guard-1',
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
      analysisBoardPath: productImage,
      analysisBoardStatus: 'done',
      canonicalSourcePath: productImage,
      canonicalSourceStatus: 'done',
    } as any)

    await cloneRepoModule.cloneRepo.setCredentials({
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

    try {
      const queued = await livePhotoService.createFromReference({
        referenceImagePath: refImage,
        productId: product.id,
        motionTemplate: 'push_in',
      })

      assert.equal(queued.imagePromptPreview?.provider, 'openai')
      assert.equal(queued.imagePromptPreview?.model, 'gpt-image-1')
      const imagePrompt = String(queued.imagePromptPreview?.prompt || '')
      assert.ok(imagePrompt.startsWith(EXPECTED_IMAGE_REPLACEMENT_PROMPT))
      assert.match(imagePrompt, /PROVIDER INPUT ROLE LOCK:/i)
      assert.match(imagePrompt, /EARRING STRUCTURE LOCK:/i)
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /Create a realistic 6-second product close-up clip with extremely subtle motion/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /only tiny non-product micro-movement already implied by the still/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /The video should feel almost static/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /natural daylight only/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /product body remains fully frozen with no self-motion/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /Use ONLY one motion(?: style)?:/i,
      )
      assert.doesNotMatch(
        String(queued.videoPromptPreview?.prompt || ''),
        /human-hand micro-shake|unless absolutely necessary/i,
      )
      const completed = await waitForItemCompleted(queued.id, 20000)
      assert.equal(completed.packagingStatus, 'completed')
      assert.ok(existsSync(String(completed.livePhotoImagePath || '')))
      assert.ok(existsSync(String(completed.livePhotoVideoPath || '')))
    } finally {
      globalThis.fetch = originalFetch
    }

    console.log('live photo replace guards smoke test passed')
  } finally {
    for (const timer of pendingTimers) clearTimeout(timer)
    pendingTimers.clear()
    await livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
