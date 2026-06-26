import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

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
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /The final product must be a full replacement, not a hybrid, not a blend, and not a new structure made from Image 1 plus Image 2\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Use Image 2 and Product DNA as the source of truth for the product real-world size and product-to-body proportion\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Maintain correct body-to-product size relationship for the selected product, even if the old product in Image 1 was visibly larger or smaller\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /If uncertainty exists, preserve the selected product real-world scale from Image 2 and Product DNA instead of copying the old product size from Image 1\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Keep the product at the same body contact point, but use the selected product wearable size rather than the replaced product size from Image 1\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /If Image 1 is a flat lay, tabletop, product-only, or no-person reference, do NOT add any hands, fingers, arms, or human interaction\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /If Image 1 contains no visible human body parts, the final image must also contain no visible human body parts\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /If Image 1 contains no visible hands or fingers, the final image must contain no visible hands, fingers, nails, palms, wrists, or skin-contact presentation cues\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Do not combine different thumbnails, do NOT borrow details from multiple angles, and do NOT reconstruct a new composite view\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Do NOT ovalize, flatten, stretch, widen, or re-arc the hoop body\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Do NOT replace a curved huggie snap-closure post with a straight post, rigid pin, or simplified straight attachment bar\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Treat a huggie earring as a huggie earring specifically\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /If Image 2 shows a snap closure, the final result must keep the same snap-closure logic and the same curved closure path\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /If Image 2 shows a front-fixed bow mounted on the front of the hoop, keep that same front-fixed bow placement and attachment logic\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Keep the visible faceted stone geometry, transparent crystal look, and front-facing placement from Image 2\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Do NOT merge visible structure from Image 1 and Image 2 into a new hybrid product\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /The replacement product must be a full substitute from Image 2 only, not a blended reconstruction\./i,
      )
      assert.match(
        String(queued.imagePromptPreview?.prompt || ''),
        /Keep the final earring at the exact real-world size that matches the selected earring from Image 2 and Product DNA\./i,
      )
      assert.doesNotMatch(
        String(queued.imagePromptPreview?.prompt || ''),
        /preserve hand and finger structure exactly/i,
      )
      assert.doesNotMatch(
        String(queued.imagePromptPreview?.prompt || ''),
        /Select exactly one matching visible angle from array item 2 that best fits array item 1 perspective\./i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /if the starting still has no visible hands or fingers, every frame must remain completely free of added hands, fingers, palms, wrists, forearms, or skin-contact gestures/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /do not let any hand enter from the edge of the frame later in the clip/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /if the starting still contains no visible person, keep every frame completely free of people/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /do not introduce holding, pinching, gripping, presenting, or touching actions around the product/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /every frame must remain completely free of hands, fingers, palms, wrists, forearms, or skin-contact gestures/i,
      )
      assert.match(
        String(queued.videoPromptPreview?.prompt || ''),
        /do not add a hidden presenter, assistant, or off-screen person whose hands appear in frame/i,
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
