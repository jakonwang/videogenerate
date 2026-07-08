import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const productsRepoModule = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const livePhotoRepoModule = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const generatedStillCalls: Array<{ prompt: string; imagePaths: string[]; uploadFileNames?: string[]; uploadKeyPrefixes?: string[]; negativePrompt?: string; outputSize?: string }> = []
  const generatedVideoCalls: Array<{
    prompt?: string
    negativePrompt?: string
    referenceImagePaths?: string[]
    cameraMotion?: string
    startFramePath?: string
    endFramePath?: string
  }> = []
  const ffmpegOutputs: Array<{ outPath: string; args: string[] }> = []
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
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

  function delay(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        pendingTimers.delete(timer)
        resolve()
      }, ms)
      pendingTimers.add(timer)
    })
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

  async function waitForItemCompleted(id: string, timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current?.packagingStatus === 'completed') return current
      if (current?.packagingStatus === 'failed' && current?.autoFlowStatus?.status === 'failed_terminal') {
        const tailLogs = Array.isArray(current.logs)
          ? current.logs.slice(-8).map((log: any) => String(log?.message || '')).join(' | ')
          : ''
        throw new Error(`${current.error || `Live photo item ${id} failed`} logs=${tailLogs}`)
      }
      await delay(100)
    }
    throw new Error(`Timed out waiting for live photo item ${id}`)
  }

  async function waitForItemCondition(
    id: string,
    predicate: (item: any) => boolean,
    timeoutMs = 15000,
  ) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current && predicate(current)) return current
      await delay(100)
    }
    throw new Error(`Timed out waiting for live photo item condition ${id}`)
  }

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      if (!outPath) throw new Error('Missing ffmpeg output path')
      ffmpegOutputs.push({ outPath, args: [...input.args] })
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { prompt: string; imagePaths: string[]; uploadFileNames?: string[]; uploadKeyPrefixes?: string[]; negativePrompt?: string; outputSize?: string; outDir: string; filePrefix: string }) => {
      generatedStillCalls.push({
        prompt: input.prompt,
        imagePaths: [...input.imagePaths],
        uploadFileNames: Array.isArray(input.uploadFileNames) ? [...input.uploadFileNames] : [],
        uploadKeyPrefixes: Array.isArray(input.uploadKeyPrefixes) ? [...input.uploadKeyPrefixes] : [],
        negativePrompt: input.negativePrompt,
        outputSize: input.outputSize,
      })
      const stillPath = path.join(input.outDir, `${input.filePrefix}.png`)
      await mkdir(path.dirname(stillPath), { recursive: true })
      await writeFile(stillPath, 'mock-generated-still', 'utf-8')
      return stillPath
    },
    generateShotVideoByProviderChain: async (input: { outDir: string }) => {
      generatedVideoCalls.push({
        prompt: (input as any)?.shot?.prompt?.positive || (input as any)?.compiledPrompt,
        negativePrompt: (input as any)?.shot?.prompt?.negative || (input as any)?.compiledNegativePrompt,
        referenceImagePaths: [String((input as any)?.startFramePath || '').trim()].filter(Boolean),
        cameraMotion: (input as any)?.shot?.prompt?.cameraMotion,
        startFramePath: String((input as any)?.startFramePath || '').trim() || undefined,
        endFramePath: String((input as any)?.endFramePath || '').trim() || undefined,
      })
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
    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'grsai',
      videoProviderFallback: 'grsai',
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)

    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const alternateProductImage = path.join(assetsDir, 'product-alt.jpg')
    const analysisBoardImage = path.join(assetsDir, 'product-analysis-board.jpg')
    const canonicalProductImage = path.join(assetsDir, 'product-canonical.jpg')
    const refImage = path.join(assetsDir, 'reference.jpg')
    const shotImage = path.join(assetsDir, 'shot.jpg')
    const shotVideo = path.join(assetsDir, 'shot.mp4')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(alternateProductImage, 'product-image-alt', 'utf-8')
    await writeFile(analysisBoardImage, 'product-analysis-board', 'utf-8')
    await writeFile(canonicalProductImage, 'product-canonical', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')
    await writeFile(shotImage, 'shot-image', 'utf-8')
    await writeFile(shotVideo, 'shot-video', 'utf-8')

    const bootstrapFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.startsWith('https://upload.qiniup.com')) {
        return new Response(JSON.stringify({ key: 'uploaded/mock.png' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return await bootstrapFetch(input, init)
    }) as typeof fetch

    const product = await productsRepoModule.productsRepo.upsert({
      name: 'Demo Product',
      type: 'general',
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
          id: 'img-1',
          productId: 'pending',
          filePath: alternateProductImage,
          fileName: 'product-alt.jpg',
          fileSize: 12,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isCover: true,
        },
        {
          id: 'img-2',
          productId: 'pending',
          filePath: productImage,
          fileName: 'product.jpg',
          fileSize: 12,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isCover: false,
        },
      ],
      coverImagePath: alternateProductImage,
      livePhotoReferenceImagePath: productImage,
      analysisBoardPath: analysisBoardImage,
      analysisBoardStatus: 'done',
      canonicalSourcePath: canonicalProductImage,
      canonicalSourceStatus: 'done',
    } as any)

    const productWithoutAnalysis = await productsRepoModule.productsRepo.upsert({
      name: 'No Analysis Product',
      type: 'general',
      images: [
        {
          id: 'img-no-analysis',
          productId: 'pending',
          filePath: productImage,
          fileName: 'product-no-analysis.jpg',
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
      canonicalSourcePath: canonicalProductImage,
      canonicalSourceStatus: 'done',
    } as any)

    const earringProduct = await productsRepoModule.productsRepo.upsert({
      name: 'Closed Hoop Earring',
      type: 'earring',
      productAnalysis: {
        category: 'earrings',
        summary: 'Silver huggie hoop earrings with crystal bow.',
        coreSubject: 'Small hoop earring featuring a faceted crystal bow motif.',
        connectionStructure: 'Hinged huggie hoop with snap closure; bow fixed to front.',
        materialDetails: 'Polished silver-tone metal, clear faceted crystals.',
        wearingPosition: 'earlobe',
        surfaceDetails: 'High-shine metal, brilliant-cut stone facets.',
        colorDetails: 'Silver, clear transparent.',
        geometryDetails: 'Circular hoop, bow made of triangular and baguette stones.',
        sizeScale: 'Petite/small.',
        matchingRules: ['Casual wear', 'Semi-formal', 'Silver jewelry pairing'],
        rawDescription: 'Structured closed hoop earring baseline for validation',
      },
      images: [
        {
          id: 'img-earring-1',
          productId: 'pending',
          filePath: productImage,
          fileName: 'product-earring.jpg',
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
      canonicalSourcePath: canonicalProductImage,
      canonicalSourceStatus: 'done',
    } as any)

    const wearableProduct = await productsRepoModule.productsRepo.upsert({
      name: 'Pendant Necklace',
      type: 'necklace',
      productAnalysis: {
        category: 'jewelry',
        summary: 'gold pendant necklace with centered charm',
        coreSubject: 'delicate pendant necklace',
        connectionStructure: 'fine chain with centered pendant drop',
        materialDetails: 'polished gold-tone metal',
        wearingPosition: 'neckline',
        surfaceDetails: 'smooth reflective metal surface',
        colorDetails: 'warm gold tone',
        geometryDetails: 'thin chain with small pendant',
        sizeScale: 'small proportion relative to the neck anchor',
        matchingRules: ['fine chain', 'small pendant', 'gold jewelry'],
        rawDescription: 'Structured wearable baseline for validation',
      },
      images: [
        {
          id: 'img-necklace-1',
          productId: 'pending',
          filePath: productImage,
          fileName: 'product-necklace.jpg',
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
      canonicalSourcePath: canonicalProductImage,
      canonicalSourceStatus: 'done',
    } as any)

    const cloneProject = await cloneRepoModule.cloneRepo.createProject({
      title: 'Clone Project Demo',
      description: 'live photo smoke',
      locale: 'zh-CN',
      strength: 'structure',
      runMode: 'manual',
    })

    const patchedProject = await cloneRepoModule.cloneRepo.upsertProject({
      ...cloneProject,
      blueprint: {
        ...(cloneProject.blueprint || {}),
        shots: [
          {
            id: 'shot-1',
            scriptText: 'Hero product closeup',
            scriptRole: 'hook',
          },
        ],
      },
      storyboardFrames: [
        {
          id: 'frame-1',
          shotId: 'shot-1',
          imagePath: shotImage,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      shotVideoOutputs: [
        {
          shotId: 'shot-1',
          videoPath: shotVideo,
          localPath: shotVideo,
          status: 'done',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    } as any)

    const beforeCloneState = JSON.stringify(await cloneRepoModule.cloneRepo.getProject(patchedProject.id))

    const referenceQueued = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    assert.equal(referenceQueued.packagingStatus, 'processing')
    const referenceItem = await waitForItemCompleted(referenceQueued.id)
    assert.equal(referenceItem.packagingStatus, 'completed')
    assert.equal(referenceItem.autoFlowStatus?.enabled, true)
    assert.equal(referenceItem.autoFlowStatus?.status, 'done')
    assert.equal(referenceItem.workflow?.currentStep, 'completed')
    assert.deepEqual(referenceItem.productSnapshot?.imagePaths || [], [analysisBoardImage])
    assert.equal(String(referenceItem.productSnapshot?.authoritativeProductReferencePath || ''), analysisBoardImage)
    assert.match(referenceQueued.imagePromptPreview?.prompt || '', /PROVIDER INPUT ROLE LOCK:/i)
    assert.match(referenceQueued.imagePromptPreview?.prompt || '', /Array item 1 is the base scene image\./i)
    assert.match(referenceQueued.imagePromptPreview?.prompt || '', /Array item 2 is the authoritative product reference image\./i)
    assert.match(referenceQueued.imagePromptPreview?.prompt || '', /Image 1 file path:/i)
    assert.match(referenceQueued.imagePromptPreview?.prompt || '', /Image 2 file path:/i)
    assert.deepEqual(referenceQueued.imagePromptPreview?.referenceImagePaths || [], [refImage, analysisBoardImage])
    assert.equal(referenceQueued.imagePromptPreview?.provider, 'openai')
    assert.match(referenceItem.promptPreview?.instructions.join(' ') || '', /Replace only the original product with the selected product/i)
    assert.ok(existsSync(String(referenceItem.livePhotoImagePath || '')))
    assert.ok(existsSync(String(referenceItem.livePhotoVideoPath || '')))
    assert.ok(existsSync(String(referenceItem.previewVideoPath || '')))
    assert.equal(generatedStillCalls.length, 1)
    assert.deepEqual(generatedStillCalls[0]?.imagePaths, [refImage, analysisBoardImage])
    assert.deepEqual(generatedStillCalls[0]?.uploadFileNames, ['image_1_base_scene.png', 'image_2_product_reference.png'])
    assert.deepEqual(generatedStillCalls[0]?.uploadKeyPrefixes, ['grsai-input/live-photo/base-scene', 'grsai-input/live-photo/product-reference'])
    assert.equal(generatedStillCalls[0]?.imagePaths.length, 2)
    assert.match(generatedStillCalls[0]?.prompt || '', new RegExp(`Image 2 file path: ${analysisBoardImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    assert.doesNotMatch(generatedStillCalls[0]?.prompt || '', new RegExp(`Image 2 file path: ${alternateProductImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    assert.doesNotMatch(generatedStillCalls[0]?.prompt || '', new RegExp(`Image 2 file path: ${canonicalProductImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    assert.match(generatedStillCalls[0]?.prompt || '', /You are a deterministic product mapping system/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /INPUT STRUCTURE \(EXACTLY 2 IMAGES\):/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /PROVIDER INPUT ROLE LOCK:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Array item 1 is the base scene image\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Array item 2 is the authoritative product reference image\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Array item 1 must be treated as Image 1 only\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Array item 2 must be treated as Image 2 only\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /The uploaded image array contains exactly 2 images\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Uploaded file name for array item 1: image_1_base_scene\.png\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Uploaded file name for array item 2: image_2_product_reference\.png\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /The FIRST uploaded image is always Image 1\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /The SECOND uploaded image is always Image 2\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Uploaded file name for Image 1 = image_1_base_scene\.png\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Uploaded file name for Image 2 = image_2_product_reference\.png\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /PRODUCT SOURCE OVERRIDE:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /If Image 1 already contains a product, ignore its design completely\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /NO CROSS-CONTAMINATION:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /The final visible product must be 100 percent derived from Image 2/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /STRICT REPLACEMENT RULE:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Replace ONLY the product in Image 1 with the product from Image 2\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /GLOBAL PRIORITY ORDER:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /VIEW SELECTION AND ISOLATION:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Image 1 file path:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Image 2 file path:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Image 1 source =/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Image 2 source =/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Image 1 uploaded file name: image_1_base_scene\.png\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Image 2 uploaded file name: image_2_product_reference\.png\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Authoritative product reference path:/i)
    assert.doesNotMatch(generatedStillCalls[0]?.prompt || '', /Selected product reference image count:/i)
    assert.doesNotMatch(generatedStillCalls[0]?.prompt || '', /Selected product reference path 2:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Use Image 1 only for scene, pose, composition, contact, lighting, and framing/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Use Image 2 only for exact product identity/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /The final product MUST be a structurally identical instance of Image 2/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /improvement, enhancement, or reinterpretation of the product/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Do NOT infer unseen sides/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /The spatial relationship between the product and the surrounding body or environment in Image 1 must remain EXACTLY the same/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Only transfer what is EXACTLY visible/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Use Image 2 and Product DNA as the source of truth for the product real-world size and product-to-body proportion\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /If uncertainty exists, preserve the selected product real-world scale from Image 2 and Product DNA instead of copying the old product size from Image 1\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /MODEL REFERENCE LOCK:/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Do not upscale jewelry, accessories, or wearable products/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Do not downscale jewelry, accessories, or wearable products to make the model look cleaner or more spacious\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /more readable than the original object/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /If identity is not perfect, the output is incorrect\./i)
    assert.match(generatedStillCalls[0]?.prompt || '', /A single photorealistic image where:/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /blurry product/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /oversized product/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /original product retained/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /original silhouette remains/i)
    assert.equal(generatedStillCalls[0]?.outputSize, '1024x1536')
    assert.equal(generatedStillCalls[0]?.imagePaths.length, 2)
    assert.ok(generatedVideoCalls.length >= 1)
    assert.deepEqual(referenceItem.videoPromptPreview?.referenceImagePaths || [], [String(referenceItem.generatedStillPath || '')])
    assert.match(generatedVideoCalls[0]?.prompt || '', /You are a product-motion video system for a locked still image/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /Create a realistic 6-second product close-up clip with extremely subtle motion/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /STRUCTURE LOCK:/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /NO INFERENCE RULE:/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /Use ONLY one motion:/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /extremely subtle near-static natural micro-movement/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /no push-in/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /no pull-back/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /no refocus/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /movement must be uniform and linear across full 6 seconds/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /The video should feel almost static/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /natural daylight only/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /same exact visible product instance/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /zero product reconstruction/i)
    assert.match(generatedVideoCalls[0]?.cameraMotion || '', /no noticeable shake/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /perfect product consistency/i)
    assert.equal(generatedVideoCalls[0]?.cameraMotion, 'Extremely subtle near-static natural micro-movement only, with no push-in, no pull-back, no refocus, and no noticeable shake')
    assert.ok((generatedVideoCalls[0]?.referenceImagePaths || []).length >= 1)
    assert.match(String(generatedVideoCalls[0]?.referenceImagePaths?.[0] || ''), /generated-still[\\/].*reference_replace\.png$/i)
    assert.match(String(generatedVideoCalls[0]?.startFramePath || ''), /generated-still[\\/].*reference_replace\.png$/i)
    assert.match(String(generatedVideoCalls[0]?.endFramePath || ''), /generated-still[\\/].*reference_replace\.png$/i)
    assert.doesNotMatch(generatedVideoCalls[0]?.negativePrompt || '', /oversized product|hero enlarged product/i)
    assert.notEqual(String(referenceItem.generatedStillPath || ''), refImage)
    assert.match(String(referenceItem.generatedStillPath || ''), /plugin-live-photo[\\/].+[\\/]still\.png$/i)

    const earringReferenceQueued = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: earringProduct.id,
      motionTemplate: 'push_in',
    })
    const earringReferenceItem = await waitForItemCompleted(earringReferenceQueued.id)
    assert.equal(earringReferenceItem.packagingStatus, 'completed')
    assert.match(earringReferenceQueued.imagePromptPreview?.prompt || '', /EARRING STRUCTURE LOCK:/i)
    assert.match(earringReferenceQueued.imagePromptPreview?.prompt || '', /A closed hoop earring must remain a closed hoop earring\./i)
    assert.match(
      earringReferenceQueued.imagePromptPreview?.prompt || '',
      /Do NOT convert a closed hoop into an open ear cuff, ring, open band, or partial arc\./i,
    )
    assert.match(
      earringReferenceQueued.imagePromptPreview?.prompt || '',
      /Preserve hinge, clasp, latch, post, connector spacing, and closure logic exactly/i,
    )

    let wearableStrictReviewCount = 0
    let wearableVisualReviewCount = 0
    const wearableStartIndex = generatedStillCalls.length
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: { prompt: string; imagePaths: string[]; uploadFileNames?: string[]; uploadKeyPrefixes?: string[]; negativePrompt?: string; outputSize?: string; outDir: string; filePrefix: string }) => {
          generatedStillCalls.push({
            prompt: input.prompt,
            imagePaths: [...input.imagePaths],
            uploadFileNames: Array.isArray(input.uploadFileNames) ? [...input.uploadFileNames] : [],
            uploadKeyPrefixes: Array.isArray(input.uploadKeyPrefixes) ? [...input.uploadKeyPrefixes] : [],
            negativePrompt: input.negativePrompt,
            outputSize: input.outputSize,
          })
          const stillPath = path.join(input.outDir, `${input.filePrefix}-wearable.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, 'mock-wearable-still', 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-wearable.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-wearable', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-wearable-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: async () => ({
          summary: 'gold pendant necklace with centered charm structure preserved',
          coreSubject: 'delicate pendant necklace',
          connectionStructure: 'fine chain with centered pendant drop',
          materialDetails: 'polished gold-tone metal',
          surfaceDetails: 'smooth reflective metal surface',
          colorDetails: 'warm gold tone',
          geometryDetails: 'thin chain with small pendant',
          sizeScale: 'small proportion relative to the neck anchor',
          matchingRules: ['fine chain', 'small pendant', 'gold jewelry'],
        }),
        reviewReferenceReplacementStillStrict: async () => {
          wearableStrictReviewCount += 1
          return {
            passed: wearableStrictReviewCount > 1,
            skipped: false,
            reason: '',
            score: wearableStrictReviewCount > 1 ? 1 : 0.3,
            matchedPhrases: wearableStrictReviewCount > 1 ? ['delicate pendant necklace'] : [],
            missingPhrases: wearableStrictReviewCount > 1 ? [] : ['delicate pendant necklace'],
            negativeSignals: [],
            analyzed: null,
          }
        },
        reviewReferenceReplacementStillVisual: async () => {
          wearableVisualReviewCount += 1
          return {
            passed: wearableVisualReviewCount > 1,
            skipped: false,
            reason: '',
            score: wearableVisualReviewCount > 1 ? 1 : 0.4,
            verdict: wearableVisualReviewCount > 1 ? 'pass' : 'fail',
            failures: wearableVisualReviewCount > 1 ? [] : ['product appears enlarged'],
            notes: [],
            checks: {
              product_identity: wearableVisualReviewCount > 1 ? 'pass' : 'fail',
              source_contamination: wearableVisualReviewCount > 1 ? 'pass' : 'fail',
              material_color: 'pass',
              attachment_structure: 'pass',
              scale: wearableVisualReviewCount > 1 ? 'pass' : 'fail',
              scene_preservation: 'pass',
            },
          }
        },
      }) as any,
    })

    const wearableReferenceQueued = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: wearableProduct.id,
      motionTemplate: 'push_in',
    })
    const wearableReferenceItem = await waitForItemCompleted(wearableReferenceQueued.id)
    assert.equal(wearableReferenceItem.packagingStatus, 'completed')
    assert.match(wearableReferenceQueued.imagePromptPreview?.prompt || '', /WEARABLE SCALE LOCK:/i)
    assert.match(wearableReferenceQueued.imagePromptPreview?.prompt || '', /Treat the product as a body-anchored wearable with a fixed real-world size, not as a free-scaling decoration\./i)
    assert.match(wearableReferenceQueued.imagePromptPreview?.prompt || '', /When Image 1 is a model reference, keep the selected product at its own correct wearable scale\./i)
    const wearableCalls = generatedStillCalls.slice(wearableStartIndex)
    assert.ok(wearableCalls.length >= 1)
    assert.equal(wearableCalls[0]?.outputSize, '1024x1536')
    assert.match(wearableCalls[0]?.prompt || '', /WEARABLE SCALE LOCK:/i)
    assert.equal(wearableStrictReviewCount, 2)
    assert.equal(wearableVisualReviewCount, 2)

    const cloneQueuedItems = await livePhotoService.createFromCloneShots({
      cloneProjectId: patchedProject.id,
      shotIds: ['shot-1'],
      motionTemplate: 'ambient_sway',
    })
    assert.equal(cloneQueuedItems.length, 1)
    assert.equal(cloneQueuedItems[0]?.packagingStatus, 'processing')
    const cloneItem = await waitForItemCompleted(cloneQueuedItems[0]!.id)
    assert.equal(cloneItem.packagingStatus, 'completed')
    assert.equal(cloneItem.autoFlowStatus?.status, 'done')
    assert.match(String(cloneItem.sourceShotLabel || ''), /Hero product closeup|hook/i)

    const exportResult = await livePhotoService.exportItems({
      ids: [referenceItem.id, cloneItem.id],
      settings: {
        outputResolution: '1080x1440',
        frameRate: '24',
        quality: 'medium',
      },
    })
    assert.equal(exportResult.total, 2)
    assert.equal(exportResult.exported.length, 2)
    assert.match(exportResult.exported[0]!.bundlePath, /\.livephoto\.json$/)
    assert.match(exportResult.exported[0]!.metadataBridgePath, /\.asset-metadata\.json$/)
    assert.match(exportResult.exported[0]!.assetIdentifier, /^livephoto-/i)
    const manifest = JSON.parse(await readFile(exportResult.exported[0]!.bundlePath, 'utf-8'))
    assert.equal(manifest.type, 'apple_live_photo_bundle')
    assert.equal(manifest.assetIdentifier, exportResult.exported[0]!.assetIdentifier)
    const metadataBridge = JSON.parse(await readFile(exportResult.exported[0]!.metadataBridgePath, 'utf-8'))
    assert.equal(metadataBridge.type, 'apple_live_photo_metadata_bridge')
    assert.equal(metadataBridge.assetIdentifier, exportResult.exported[0]!.assetIdentifier)
    assert.ok(existsSync(exportResult.exported[0]!.imagePath))
    assert.ok(existsSync(exportResult.exported[0]!.videoPath))
    const exportedJpegCall = ffmpegOutputs.find((item) => item.outPath === exportResult.exported[0]!.imagePath)
    if (exportedJpegCall) {
      assert.ok(exportedJpegCall.args.includes('-q:v'))
      assert.ok(exportedJpegCall.args.some((arg) => String(arg).includes('scale=1080:1440')))
      assert.ok(exportedJpegCall.args.includes('4'))
    }
    const exportedMovCall = ffmpegOutputs.find((item) => item.outPath === exportResult.exported[0]!.videoPath)
    if (exportedMovCall) {
      assert.ok(exportedMovCall.args.some((arg) => String(arg).includes('scale=1080:1440')))
      assert.ok(exportedMovCall.args.some((arg) => String(arg).includes('fps=24')))
      assert.ok(exportedMovCall.args.includes('22'))
    }
    const normalizedMotionCall = ffmpegOutputs.find((item) => /motion\.mp4$/i.test(item.outPath))
    assert.ok(normalizedMotionCall, 'Expected normalized motion video ffmpeg call')
    assert.equal(normalizedMotionCall!.args[normalizedMotionCall!.args.indexOf('-t') + 1], '6')

    const savedSettings = await livePhotoService.saveSettings({
      outputResolution: '3024x4032',
      frameRate: '30',
      quality: 'high',
    })
    assert.equal(savedSettings.outputResolution, '3024x4032')
    assert.equal(savedSettings.frameRate, '30')
    assert.equal(savedSettings.quality, 'high')
    const reloadedSettings = await livePhotoService.getSettings()
    assert.equal(reloadedSettings.outputResolution, '3024x4032')
    assert.equal(reloadedSettings.frameRate, '30')
    assert.equal(reloadedSettings.quality, 'high')

    const afterCloneState = JSON.stringify(await cloneRepoModule.cloneRepo.getProject(patchedProject.id))
    assert.equal(afterCloneState, beforeCloneState)

    const brokenReference = await livePhotoService.get(referenceItem.id)
    assert.ok(brokenReference)
    await writeFile(String(brokenReference!.referenceImagePath), 'reference-image-updated', 'utf-8')
    await livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: { prompt: string; imagePaths: string[]; uploadFileNames?: string[]; uploadKeyPrefixes?: string[]; negativePrompt?: string; outputSize?: string; outDir: string; filePrefix: string }) => {
          const stillPath = path.join(input.outDir, `${input.filePrefix}.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, 'mock-generated-still-retry', 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-retry.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-retry', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-retry-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: mockStructureAnalysis,
        reviewReferenceReplacementStillStrict: mockStrictReplacementReview,
        reviewReferenceReplacementStillVisual: mockVisualReplacementReview,
      }) as any,
    })
    const retriedItem = await livePhotoService.retry({ id: referenceItem.id, motionTemplate: 'push_out' })
    const retriedCompletedItem = await waitForItemCompleted(retriedItem.id)
    assert.equal(retriedCompletedItem.packagingStatus, 'completed')
    assert.ok(existsSync(String(retriedCompletedItem.livePhotoImagePath || '')))
    assert.ok(existsSync(String(retriedCompletedItem.livePhotoVideoPath || '')))

    const videoRetryStillPath = path.join(root, 'video-retry-still.png')
    await writeFile(videoRetryStillPath, 'mock-video-retry-still', 'utf-8')
    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'grsai',
      videoProviderFallback: 'grsai',
      apifoxHub: {
        enabled: true,
        baseUrl: 'https://example.invalid/video',
        apiKey: 'test-video-key',
        videoProvider: 'seedance',
        videoEndpointStyle: 'openai_compatible',
        videoModel: 'seedance-live-photo',
      },
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)
    const syntheticVideoFailedItem = await livePhotoRepoModule.livePhotoRepo.upsert({
      ...retriedCompletedItem,
      generatedStillPath: videoRetryStillPath,
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
      error: 'video failed',
      packagingStatus: 'failed',
      updatedAt: Date.now(),
    } as any)
    const beforeVideoRetryImageCount = generatedStillCalls.length
    const beforeVideoRetryVideoCount = generatedVideoCalls.length
    const originalVideoRetryFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.includes('https://example.invalid/video/v1/video/query?id=failed-video-task-id')) {
        return new Response(JSON.stringify({ id: 'failed-video-task-id', status: 'running' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('https://example.invalid/video/v1/video/query?id=seedance-live-photo%3Afailed-video-task-id')) {
        return new Response(
          JSON.stringify({
            id: 'seedance-live-photo:failed-video-task-id',
            status: 'succeeded',
            outputUrl: 'https://cdn.example.com/plugin-retried-live-photo.mp4',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      if (url === 'https://cdn.example.com/plugin-retried-live-photo.mp4') {
        return new Response(Buffer.from('plugin-remote-retried-video'), {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        })
      }
      return await originalVideoRetryFetch(input, init)
    }) as typeof fetch
    await livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: {
          prompt: string
          imagePaths: string[]
          uploadFileNames?: string[]
          uploadKeyPrefixes?: string[]
          negativePrompt?: string
          outputSize?: string
          outDir: string
          filePrefix: string
        }) => {
          generatedStillCalls.push({
            prompt: input.prompt,
            imagePaths: [...input.imagePaths],
            uploadFileNames: Array.isArray(input.uploadFileNames) ? [...input.uploadFileNames] : [],
            uploadKeyPrefixes: Array.isArray(input.uploadKeyPrefixes) ? [...input.uploadKeyPrefixes] : [],
            negativePrompt: input.negativePrompt,
            outputSize: input.outputSize,
          })
          const stillPath = path.join(input.outDir, `${input.filePrefix}-unexpected-video-retry.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, 'unexpected-video-retry-still', 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { prompt?: string; negativePrompt?: string; outDir: string }) => {
          generatedVideoCalls.push({
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            referenceImagePaths: Array.isArray((input as any)?.shot?.productReferenceImagePaths)
              ? [...(input as any).shot.productReferenceImagePaths]
              : [],
            cameraMotion: (input as any)?.shot?.prompt?.cameraMotion,
          })
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-video-only-retry.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-video-only-retry', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-video-only-retry-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: mockStructureAnalysis,
        reviewReferenceReplacementStillStrict: mockStrictReplacementReview,
        reviewReferenceReplacementStillVisual: mockVisualReplacementReview,
      }) as any,
    })
    const retriedVideoOnlyItem = await livePhotoService.retry({
      id: syntheticVideoFailedItem.id,
      motionTemplate: 'push_out',
    })
    assert.equal(retriedVideoOnlyItem.workflow?.currentStep, 'video_generation')
    assert.equal(retriedVideoOnlyItem.workflow?.stepStatus.image_generation.status, 'done')
    assert.equal(retriedVideoOnlyItem.autoFlowStatus?.currentStage, 'video_generation')
    const retriedVideoOnlyCompletedItem = await waitForItemCompleted(retriedVideoOnlyItem.id)
    globalThis.fetch = originalVideoRetryFetch
    assert.equal(retriedVideoOnlyCompletedItem.packagingStatus, 'completed')
    assert.equal(generatedStillCalls.length, beforeVideoRetryImageCount, 'Video-only retry should not regenerate the still image')
    assert.ok(
      generatedVideoCalls.length > beforeVideoRetryVideoCount ||
        String(retriedVideoOnlyCompletedItem.motionVideoPath || '').trim().length > 0,
      'Video-only retry should either submit a new video task or recover the preserved remote video task',
    )
    assert.ok(
      Array.isArray(retriedVideoOnlyCompletedItem.logs) &&
        retriedVideoOnlyCompletedItem.logs.some((log: any) =>
          String(log?.message || '').includes('manual retry preserved generated still and restarted from video_generation stage'),
        ),
    )

    await livePhotoService.resetTestDependencies()
    let inlineEscalationValidationAttempt = 0
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: {
          prompt: string
          imagePaths: string[]
          uploadFileNames?: string[]
          uploadKeyPrefixes?: string[]
          negativePrompt?: string
          outputSize?: string
          outDir: string
          filePrefix: string
        }) => {
          generatedStillCalls.push({
            prompt: input.prompt,
            imagePaths: [...input.imagePaths],
            uploadFileNames: Array.isArray(input.uploadFileNames) ? [...input.uploadFileNames] : [],
            uploadKeyPrefixes: Array.isArray(input.uploadKeyPrefixes) ? [...input.uploadKeyPrefixes] : [],
            negativePrompt: input.negativePrompt,
            outputSize: input.outputSize,
          })
          const stillPath = path.join(input.outDir, `${input.filePrefix}_${Date.now()}_${inlineEscalationValidationAttempt}.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, 'mock-inline-escalation-still', 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-inline-escalation.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-inline-escalation', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-inline-escalation-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: mockStructureAnalysis,
        reviewReferenceReplacementStillStrict: async () => {
          inlineEscalationValidationAttempt += 1
          if (inlineEscalationValidationAttempt === 1) {
            return {
              passed: false,
              skipped: false,
              reason: 'original product retained',
              score: 0,
              matchedPhrases: [],
              missingPhrases: ['Small hoop earring featuring a faceted crystal bow motif.'],
              negativeSignals: ['original product retained'],
              analyzed: null,
            }
          }
          return await mockStrictReplacementReview()
        },
        reviewReferenceReplacementStillVisual: async () => {
          if (inlineEscalationValidationAttempt === 1) {
            return {
              passed: false,
              skipped: false,
              reason: 'original product retained',
              score: 0.4,
              verdict: 'fail',
              failures: ['preserves the original earring silhouette'],
              notes: ['leftover original contour'],
              checks: {
                product_identity: 'pass',
                source_contamination: 'fail',
                material_color: 'pass',
                attachment_structure: 'pass',
                scale: 'pass',
                scene_preservation: 'pass',
              },
            }
          }
          return await mockVisualReplacementReview()
        },
      }) as any,
    })
    const inlineEscalationStartIndex = generatedStillCalls.length
    const inlineEscalationQueued = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: earringProduct.id,
      motionTemplate: 'push_in',
    })
    const inlineEscalationItem = await waitForItemCompleted(inlineEscalationQueued.id)
    assert.equal(inlineEscalationItem.packagingStatus, 'completed')
    const inlineEscalationCalls = generatedStillCalls.slice(inlineEscalationStartIndex)
    assert.equal(inlineEscalationCalls.length, 2)
    assert.equal(inlineEscalationCalls[0]?.outputSize, '1024x1536')
    assert.equal(inlineEscalationCalls[1]?.outputSize, '1024x1536')
    assert.match(inlineEscalationCalls[0]?.prompt || '', /ANCHOR CLOSE-UP REPLACEMENT MODE/i)
    assert.match(inlineEscalationCalls[1]?.prompt || '', /ANCHOR CLOSE-UP REPLACEMENT MODE/i)
    const inlineEscalationLogText = Array.isArray(inlineEscalationItem.logs)
      ? inlineEscalationItem.logs.map((log: any) => String(log?.message || '')).join('\n')
      : ''
    assert.match(
      inlineEscalationLogText,
      /(image validation requested inline anchor-closeup escalation|image validation passed after inline escalation|marked retryable failure: retry 1\/2)/i,
    )

    const resumable = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const resumableLatest = await livePhotoService.get(resumable.id)
    assert.ok(resumableLatest)
    await productsRepoModule.productsRepo.list()
    const startupResume = await livePhotoService.resumePendingTasksOnStartup()
    assert.equal(startupResume.itemIds.includes(resumable.id), false)
    await waitForItemCompleted(resumable.id)

    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'grsai',
      grsaiApiKey: 'test-grsai-key',
      grsaiImageModel: 'gpt-image-2',
      videoProviderPrimary: 'seedance',
      seedanceApiKey: 'test-seedance-key',
      videoModelPrimary: 'seedance-20',
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)

    const originalFetch = globalThis.fetch
    const remoteImageTaskId = 'remote-image-task-1'
    let remoteImageSubmitCount = 0
    let remoteImageQueryCount = 0
    let remoteImageReady = false
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.includes('/v1/draw/completions')) {
        remoteImageSubmitCount += 1
        return new Response(
          JSON.stringify({
            id: remoteImageTaskId,
            status: 'submitted',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/v1/draw/result')) {
        remoteImageQueryCount += 1
        if (!remoteImageReady) {
          return new Response(
            JSON.stringify({
              id: remoteImageTaskId,
              status: 'running',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            id: remoteImageTaskId,
            status: 'succeeded',
            url: 'https://example.com/live-photo-result.png',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url === 'https://example.com/live-photo-result.png') {
        return new Response(Buffer.from('remote-image-result'), { status: 200 })
      }
      if (url.startsWith('https://upload.qiniup.com')) {
        return new Response(JSON.stringify({ key: 'uploaded/mock.png' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return await originalFetch(input, init)
    }) as typeof fetch

    const remotePendingReference = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const pendingSnapshot = await waitForItemCondition(
      remotePendingReference.id,
      (item) => Boolean(item?.imageTaskId) || String(item?.error || '').includes('[remote_pending]'),
      12000,
    )
    assert.equal(pendingSnapshot?.packagingStatus, 'processing')
    assert.equal(pendingSnapshot?.imageTaskId, remoteImageTaskId)
    assert.equal(pendingSnapshot?.imageTaskProvider, 'grsai')
    assert.match(String(pendingSnapshot?.error || ''), /\[remote_pending\]/)
    assert.equal(remoteImageSubmitCount, 1)

    remoteImageReady = true
    const resumeRemote = await livePhotoService.resumePendingTasksOnStartup()
    assert.equal(resumeRemote.itemIds.includes(remotePendingReference.id), true)
    const resumedSnapshot = await waitForItemCondition(
      remotePendingReference.id,
      (item) => Boolean(item?.generatedStillPath) || item?.packagingStatus === 'completed',
      20000,
    )
    assert.ok(Boolean(resumedSnapshot?.generatedStillPath))
    assert.equal(remoteImageSubmitCount, 1)
    assert.ok(remoteImageQueryCount >= 1)
    globalThis.fetch = originalFetch

    await livePhotoService.resetTestDependencies()
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-apifox-priority.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-apifox-priority', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-apifox-priority-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: mockStructureAnalysis as any,
        reviewReferenceReplacementStillStrict: mockStrictReplacementReview as any,
        reviewReferenceReplacementStillVisual: async () => ({
          ...(await mockVisualReplacementReview()),
          checks: {
            product_identity: 'pass',
            source_contamination: 'pass',
            material_color: 'pass',
            attachment_structure: 'pass',
            scale: 'pass',
            scene_preservation: 'pass',
          },
        }),
      }) as any,
    })

    await cloneRepoModule.cloneRepo.setCredentials({
      allowMockWhenNoKey: false,
      imageProviderPrimary: 'grsai',
      videoProviderPrimary: 'grsai',
      videoProviderFallback: 'grsai',
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)

    let strictProviderFailure: any = null
    try {
      await livePhotoService.createFromReference({
        referenceImagePath: refImage,
        productId: product.id,
        motionTemplate: 'push_in',
      })
    } catch (error: any) {
      strictProviderFailure = error
    }
    assert.ok(strictProviderFailure, 'Expected Live Photo replacement to fail fast without a strict image-edit provider')
    assert.match(String(strictProviderFailure?.message || ''), /strict image-edit provider/i)
    const strictProviderFailureItems = await livePhotoService.list()
    assert.equal(
      strictProviderFailureItems.some((item) => item.referenceImagePath === refImage && item.productId === product.id && item.packagingStatus === 'processing'),
      false,
      'Strict provider validation should block task creation before enqueueing a Live Photo item',
    )

    await cloneRepoModule.cloneRepo.setCredentials({
      allowMockWhenNoKey: false,
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
        imageEditModel: '',
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
        imageEditModel: '',
        imageEndpointStyle: 'openai_images',
        defaultPollIntervalMs: 2000,
        defaultTimeoutMs: 600000,
      },
    } as any)

    const compatibleApifoxPreview = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    assert.equal(compatibleApifoxPreview.imagePromptPreview?.provider, 'openai')
    assert.equal(compatibleApifoxPreview.imagePromptPreview?.model, 'gpt-image-1')
    assert.equal(compatibleApifoxPreview.packagingStatus, 'processing')

    await cloneRepoModule.cloneRepo.setCredentials({
      allowMockWhenNoKey: false,
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
    } as any)

    const livePhotoApifoxFetch = globalThis.fetch
    let apifoxEditCount = 0
    let grsDrawCount = 0
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url === 'https://api.openai.com/v1/images/edits') {
        return new Response(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from('openai-priority-image').toString('base64'),
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url === 'https://vector.example.com/v1/images/edits') {
        apifoxEditCount += 1
        return new Response(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from('apifox-priority-image').toString('base64'),
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/v1/draw/completions')) {
        grsDrawCount += 1
        return new Response(JSON.stringify({ id: 'should-not-run', status: 'submitted' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return await livePhotoApifoxFetch(input, init)
    }) as typeof fetch

    const providerAlignedPreview = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    assert.equal(providerAlignedPreview.imagePromptPreview?.provider, 'openai')
    assert.equal(providerAlignedPreview.imagePromptPreview?.model, 'gpt-image-1')
    const providerAlignedCompleted = await waitForItemCompleted(providerAlignedPreview.id, 20000)
    assert.equal(providerAlignedCompleted.packagingStatus, 'completed')

    const apifoxEditCountBeforePreferred = apifoxEditCount
    const grsDrawCountBeforePreferred = grsDrawCount
    const apifoxPreferredReference = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const apifoxPreferredCompleted = await waitForItemCompleted(apifoxPreferredReference.id, 20000)
    assert.equal(apifoxPreferredCompleted.packagingStatus, 'completed')
    assert.equal(apifoxEditCount - apifoxEditCountBeforePreferred, 0)
    assert.equal(grsDrawCount - grsDrawCountBeforePreferred, 0)
    globalThis.fetch = livePhotoApifoxFetch

    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'grsai',
      videoProviderFallback: 'grsai',
      grsaiApiKey: 'test-grsai-key',
      grsaiVideoModel: 'grok-video-3',
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://example.com',
      qiniuUploadHost: 'https://upload.qiniup.com',
    } as any)

    let validationRetryStillCallCount = 0
    let validationRetryAnalysisCount = 0
    let validationRetryStrictReviewCount = 0
    let validationRetryVisualReviewCount = 0
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string }) => {
          validationRetryStillCallCount += 1
          generatedStillCalls.push({
            prompt: (input as any).prompt,
            imagePaths: Array.isArray((input as any).imagePaths) ? [...(input as any).imagePaths] : [],
            uploadFileNames: Array.isArray((input as any).uploadFileNames) ? [...(input as any).uploadFileNames] : [],
            uploadKeyPrefixes: Array.isArray((input as any).uploadKeyPrefixes) ? [...(input as any).uploadKeyPrefixes] : [],
            negativePrompt: (input as any).negativePrompt,
            outputSize: (input as any).outputSize,
          })
          const stillPath = path.join(input.outDir, `${input.filePrefix}-${validationRetryStillCallCount}.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, `mock-generated-still-validation-${validationRetryStillCallCount}`, 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-validation-retry.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-validation-retry', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-validation-retry-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: async () => {
          validationRetryAnalysisCount += 1
          if (validationRetryAnalysisCount === 1) {
            return {
              summary: 'silver hoop earring with rectangular drop charm but wrong product mismatch',
              coreSubject: 'silver hoop earring',
              connectionStructure: 'hinged hoop with rectangular hanging charm and missing clasp mismatch',
              materialDetails: 'polished silver metal with incorrect finish',
              surfaceDetails: 'smooth reflective metal surface',
              colorDetails: 'cool silver tone',
              geometryDetails: 'thin circular hoop and vertical rectangular charm with wrong geometry mismatch',
              sizeScale: 'small earring proportion relative to ear but oversized',
              matchingRules: ['hinged hoop', 'rectangular charm', 'silver metal', 'small earring', 'different product'],
            }
          }
          return await mockStructureAnalysis()
        },
        reviewReferenceReplacementStillStrict: async () => {
          validationRetryStrictReviewCount += 1
          if (validationRetryStrictReviewCount === 1) {
            return {
              passed: false,
              skipped: false,
              score: 0.5,
              matchedPhrases: ['silver hoop earring'],
              missingPhrases: ['hinged hoop with rectangular hanging charm', 'small earring proportion relative to ear'],
              negativeSignals: ['wrong product'],
              analyzed: null,
            }
          }
          return await mockStrictReplacementReview()
        },
        reviewReferenceReplacementStillVisual: async () => {
          validationRetryVisualReviewCount += 1
          if (validationRetryVisualReviewCount === 1) {
            return {
              passed: false,
              skipped: false,
              reason: '',
              score: 0.45,
              verdict: 'fail',
              failures: [
                'generated result still preserves the original product identity from Image 1',
              ],
              notes: ['replacement incomplete', 'original contour remains', 'color drift'],
              checks: {
                product_identity: 'fail',
                source_contamination: 'fail',
                material_color: 'fail',
                attachment_structure: 'fail',
                scale: 'fail',
                scene_preservation: 'pass',
              },
            }
          }
          return await mockVisualReplacementReview()
        },
      }) as any,
    })

    const validationRetryStartIndex = generatedStillCalls.length
    const validationRetryReference = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const validationRetryCompleted = await waitForItemCompleted(validationRetryReference.id, 30000)
    assert.equal(validationRetryCompleted.packagingStatus, 'completed')
    assert.equal(validationRetryCompleted.autoFlowStatus?.status, 'done')
    assert.equal(validationRetryStillCallCount, 2)
    assert.equal(validationRetryAnalysisCount, 2)
    assert.equal(validationRetryStrictReviewCount, 2)
    assert.equal(validationRetryVisualReviewCount, 2)
    const validationRetryCalls = generatedStillCalls.slice(validationRetryStartIndex)
    assert.ok(validationRetryCalls.length >= 2)
    const validationRetryLogText = Array.isArray(validationRetryCompleted.logs)
      ? validationRetryCompleted.logs.map((log: any) => String(log?.message || '')).join('\n')
      : ''
    for (const marker of [
      '[validation_category:original_product_retained]',
      '[validation_category:wrong_product_identity]',
      '[validation_category:source_contamination]',
      '[validation_category:material_color_drift]',
      '[validation_category:attachment_drift]',
      '[validation_category:oversized_product]',
      '[validation_category:missing_structure]',
      '[validation_category:geometry_drift]',
      '[image_validation_failed]',
    ]) {
      assert.match(validationRetryLogText, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    let noAnalysisVisualReviewCount = 0
    let noAnalysisStillCallCount = 0
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string }) => {
          noAnalysisStillCallCount += 1
          const stillPath = path.join(input.outDir, `${input.filePrefix}-no-analysis-${noAnalysisStillCallCount}.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, `mock-generated-still-no-analysis-${noAnalysisStillCallCount}`, 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-no-analysis.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-no-analysis', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-no-analysis-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: async () => {
          throw new Error('analyzeProductStructureWithGrs should not run when productAnalysis is missing')
        },
        reviewReferenceReplacementStillStrict: async () => {
          throw new Error('reviewReferenceReplacementStillStrict should not run when productAnalysis is missing')
        },
        reviewReferenceReplacementStillVisual: async () => {
          noAnalysisVisualReviewCount += 1
          if (noAnalysisVisualReviewCount === 1) {
            return {
              passed: false,
              skipped: false,
              reason: '',
              score: 0.55,
              verdict: 'fail',
              failures: ['generated result still preserves the original product identity from Image 1'],
              notes: ['replacement incomplete'],
              checks: {
                product_identity: 'fail',
                source_contamination: 'fail',
                material_color: 'pass',
                attachment_structure: 'pass',
                scale: 'pass',
                scene_preservation: 'pass',
              },
            }
          }
          return await mockVisualReplacementReview()
        },
      }) as any,
    })

    const noAnalysisQueued = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: productWithoutAnalysis.id,
      motionTemplate: 'push_in',
    })
    const noAnalysisCompleted = await waitForItemCompleted(noAnalysisQueued.id, 30000)
    assert.equal(noAnalysisCompleted.packagingStatus, 'completed')
    assert.equal(noAnalysisStillCallCount, 2)
    assert.equal(noAnalysisVisualReviewCount, 2)

    let missingChecksStillCallCount = 0
    let missingChecksVisualReviewCount = 0
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string }) => {
          missingChecksStillCallCount += 1
          const stillPath = path.join(input.outDir, `${input.filePrefix}-missing-checks-${missingChecksStillCallCount}.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, `mock-generated-still-missing-checks-${missingChecksStillCallCount}`, 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-missing-checks.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-missing-checks', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-missing-checks-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: async () => await mockStructureAnalysis(),
        reviewReferenceReplacementStillStrict: async () => await mockStrictReplacementReview(),
        reviewReferenceReplacementStillVisual: async () => {
          missingChecksVisualReviewCount += 1
          if (missingChecksVisualReviewCount === 1) {
            return {
              passed: false,
              skipped: false,
              reason: '',
              score: 0.95,
              verdict: 'pass',
              failures: [],
              notes: [],
              checks: {
                product_identity: 'pass',
                source_contamination: 'pass',
                material_color: 'pass',
                attachment_structure: 'pass',
                scene_preservation: 'pass',
              },
            }
          }
          return await mockVisualReplacementReview()
        },
      }) as any,
    })

    const missingChecksQueued = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const missingChecksCompleted = await waitForItemCompleted(missingChecksQueued.id, 30000)
    assert.equal(missingChecksCompleted.packagingStatus, 'completed')
    assert.equal(missingChecksStillCallCount, 2)
    assert.equal(missingChecksVisualReviewCount, 2)
    assert.ok(
      Array.isArray(missingChecksCompleted.logs) &&
        missingChecksCompleted.logs.some((log: any) =>
          String(log?.message || '').includes('visual_check_missing:scale'),
        ),
    )

    let multiRetryStillCallCount = 0
    const multiRetryPrompts: string[] = []
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string; prompt: string }) => {
          multiRetryStillCallCount += 1
          multiRetryPrompts.push(String(input.prompt || ''))
          const stillPath = path.join(input.outDir, `${input.filePrefix}-multi-${multiRetryStillCallCount}.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, `mock-generated-still-multi-${multiRetryStillCallCount}`, 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-multi-retry.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-multi-retry', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-multi-retry-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: async () => await mockStructureAnalysis(),
        reviewReferenceReplacementStillStrict: async () => {
          if (multiRetryStillCallCount <= 1) {
            return {
              passed: false,
              skipped: false,
              score: 0.4,
              matchedPhrases: ['silver hoop earring'],
              missingPhrases: ['hinged hoop with rectangular hanging charm'],
              negativeSignals: ['wrong product'],
              analyzed: null,
            }
          }
          return await mockStrictReplacementReview()
        },
        reviewReferenceReplacementStillVisual: async () => {
          if (multiRetryStillCallCount <= 1) {
            return {
              passed: false,
              skipped: false,
              reason: '',
              score: 0.35,
              verdict: 'fail',
              failures: ['generated result still preserves the original product identity from Image 1'],
              notes: ['replacement incomplete'],
            }
          }
          return await mockVisualReplacementReview()
        },
      }) as any,
    })
    const multiRetryReference = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const multiRetryCompleted = await waitForItemCompleted(multiRetryReference.id, 30000)
    assert.equal(multiRetryCompleted.packagingStatus, 'completed')
    assert.ok(multiRetryStillCallCount >= 2)
    const firstEscalatedRetryPrompt = multiRetryPrompts.find((prompt) => /Retry escalation is active\./i.test(prompt)) || ''
    assert.match(firstEscalatedRetryPrompt, /Force exact source separation: Image 1 contributes scene only, Image 2 contributes product only\./i)
    assert.match(firstEscalatedRetryPrompt, /Enter zero-tolerance replacement mode:/i)
    assert.match(firstEscalatedRetryPrompt, /Do not preserve any silhouette, edge rhythm, connector layout, color grouping, or material cue from the original product in Image 1\./i)
    assert.match(firstEscalatedRetryPrompt, /If uncertain, reduce detail instead of introducing any structural deviation from Image 2\./i)
    assert.match(firstEscalatedRetryPrompt, /The same single product instance with no replacement and no redesign\./i)
    const multiRetryLogText = Array.isArray(multiRetryCompleted.logs)
      ? multiRetryCompleted.logs.map((log: any) => String(log?.message || '')).join('\n')
      : ''
    assert.match(multiRetryLogText, /\[image_validation_failed\]/i)
    assert.match(multiRetryLogText, /(image validation requested inline anchor-closeup escalation|marked retryable failure: retry 1\/2)/i)

    await livePhotoService.resetTestDependencies()

    let reviewOverloadStillCallCount = 0
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string }) => {
          reviewOverloadStillCallCount += 1
          const stillPath = path.join(input.outDir, `${input.filePrefix}-review-overload-${reviewOverloadStillCallCount}.png`)
          await mkdir(path.dirname(stillPath), { recursive: true })
          await writeFile(stillPath, `mock-generated-review-overload-${reviewOverloadStillCallCount}`, 'utf-8')
          return stillPath
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-live-photo-review-overload.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-generated-video-review-overload', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-review-overload-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: async () => {
          throw new Error('model load is too high, try again later')
        },
        reviewReferenceReplacementStillVisual: async () => ({
          passed: true,
          skipped: true,
          reason: 'review_service_overloaded',
          score: 1,
          verdict: 'pass',
          failures: [],
          notes: ['Review service overloaded; visual review deferred.'],
          checks: {},
        }),
      }) as any,
    })

    const reviewOverloadReference = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const reviewOverloadCompleted = await waitForItemCompleted(reviewOverloadReference.id, 30000)
    assert.equal(reviewOverloadCompleted.packagingStatus, 'completed')
    assert.ok(reviewOverloadStillCallCount >= 1)
    const reviewOverloadLogText = Array.isArray(reviewOverloadCompleted.logs)
      ? reviewOverloadCompleted.logs.map((log: any) => String(log?.message || '')).join('\n')
      : ''
    assert.doesNotMatch(reviewOverloadLogText, /\[remote_pending\] Image validation review service is overloaded/i)

    await livePhotoService.resetTestDependencies()

    let failingStillCallCount = 0
    livePhotoService.setTestDependencies({
      ...({
        runFfmpeg: async (input: { args: string[] }) => {
          const outPath = String(input.args[input.args.length - 1] || '').trim()
          if (!outPath) throw new Error('Missing ffmpeg output path')
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
        },
        generateGptShotFrameImage: async () => {
          failingStillCallCount += 1
          throw new Error(`forced-still-failure-${failingStillCallCount}`)
        },
        generateShotVideoByProviderChain: async (input: { outDir: string }) => {
          const outputFilePath = path.join(input.outDir, 'mock-should-not-run.mp4')
          await mkdir(path.dirname(outputFilePath), { recursive: true })
          await writeFile(outputFilePath, 'mock-video-should-not-run', 'utf-8')
          return {
            outputFilePath,
            taskId: `mock-task-failure-${Date.now()}`,
            provider: 'seedance',
          } as any
        },
        analyzeProductStructureWithGrs: mockStructureAnalysis,
        reviewReferenceReplacementStillStrict: mockStrictReplacementReview,
        reviewReferenceReplacementStillVisual: mockVisualReplacementReview,
      }) as any,
    })

    const failingReference = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    let failedTerminalItem = null as any
    const failureStartedAt = Date.now()
    while (Date.now() - failureStartedAt < 30000) {
      const current = await livePhotoService.get(failingReference.id)
      if (current?.packagingStatus === 'failed' && current?.autoFlowStatus?.status === 'failed_terminal') {
        failedTerminalItem = current
        break
      }
      await delay(100)
    }
    assert.ok(failedTerminalItem, 'Expected failed Live Photo item to reach retry limit state')
    assert.equal(failedTerminalItem.autoFlowStatus?.status, 'failed_terminal')
    assert.equal(failedTerminalItem.autoFlowStatus?.retryCount, failedTerminalItem.autoFlowStatus?.retryLimit)
    assert.match(String(failedTerminalItem.error || ''), /\[retry_limit\]/)
    const startupResumeAfterTerminalFailure = await livePhotoService.resumePendingTasksOnStartup()
    assert.equal(
      startupResumeAfterTerminalFailure.itemIds.includes(failingReference.id),
      false,
      'Retry-limit failed item should not be re-enqueued by startup resume',
    )

    console.log('live photo plugin smoke test passed')
  } finally {
    for (const timer of pendingTimers) clearTimeout(timer)
    pendingTimers.clear()
    await livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
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
