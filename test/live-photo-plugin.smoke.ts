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
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const generatedStillCalls: Array<{ prompt: string; imagePaths: string[]; negativePrompt?: string; outputSize?: string }> = []
  const generatedVideoCalls: Array<{ prompt?: string; negativePrompt?: string }> = []
  const ffmpegOutputs: Array<{ outPath: string; args: string[] }> = []

  async function rmWithRetry(targetPath: string, attempts = 10, delayMs = 200) {
    let lastError: unknown = null
    for (let index = 0; index < attempts; index += 1) {
      try {
        await rm(targetPath, { recursive: true, force: true })
        return
      } catch (error: any) {
        lastError = error
        if (error?.code !== 'EBUSY' && error?.code !== 'ENOTEMPTY') throw error
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    if (lastError) throw lastError
  }

  async function waitForItemCompleted(id: string, timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current?.packagingStatus === 'completed') return current
      if (current?.packagingStatus === 'failed') throw new Error(current.error || `Live photo item ${id} failed`)
      await new Promise((resolve) => setTimeout(resolve, 100))
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
      await new Promise((resolve) => setTimeout(resolve, 100))
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
    generateGptShotFrameImage: async (input: { prompt: string; imagePaths: string[]; negativePrompt?: string; outputSize?: string; outDir: string; filePrefix: string }) => {
      generatedStillCalls.push({
        prompt: input.prompt,
        imagePaths: [...input.imagePaths],
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
        prompt: (input as any)?.shot?.prompt?.positive,
        negativePrompt: (input as any)?.shot?.prompt?.negative,
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
  })

  try {
    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'seedance',
      seedanceApiKey: 'test-seedance-key',
      videoModelPrimary: 'seedance-20',
    } as any)

    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const refImage = path.join(assetsDir, 'reference.jpg')
    const shotImage = path.join(assetsDir, 'shot.jpg')
    const shotVideo = path.join(assetsDir, 'shot.mp4')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')
    await writeFile(shotImage, 'shot-image', 'utf-8')
    await writeFile(shotVideo, 'shot-video', 'utf-8')

    const product = await productsRepoModule.productsRepo.upsert({
      name: 'Demo Product',
      type: 'general',
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
      analysisBoardPath: productImage,
      analysisBoardStatus: 'done',
      canonicalSourcePath: productImage,
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
    assert.match(referenceItem.promptPreview?.instructions.join(' ') || '', /Replace only the original product with the selected product/i)
    assert.ok(existsSync(String(referenceItem.livePhotoImagePath || '')))
    assert.ok(existsSync(String(referenceItem.livePhotoVideoPath || '')))
    assert.ok(existsSync(String(referenceItem.previewVideoPath || '')))
    assert.equal(generatedStillCalls.length, 1)
    assert.deepEqual(generatedStillCalls[0]?.imagePaths, [refImage, productImage])
    assert.match(generatedStillCalls[0]?.prompt || '', /Replace only the originally shown product with the selected product from the product reference images/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /preserve the exact same single product instance from the selected product references/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /keep the product at the same real-world scale and the same visual size relationship as the original product shown in image 1/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /bias the final look slightly smaller rather than larger when scale is uncertain/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Prefer a modest, realistic wearing scale/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /If there is any ambiguity, choose the smaller realistic appearance/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Do not enlarge the product/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Do not add sparkle effects, glowing highlights, magical shine, glitter trails/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /selected product must be the sharpest and clearest region in the entire image/i)
    assert.match(generatedStillCalls[0]?.prompt || '', /Render the product with crisp edges, clean texture separation, fully readable small details, and strong local clarity/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /blurry product/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /oversized product/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /hero enlarged product|oversized product/i)
    assert.match(String(generatedStillCalls[0]?.negativePrompt || ''), /sparkle effect/i)
    assert.equal(generatedStillCalls[0]?.outputSize, '1536x2304')
    assert.ok(generatedVideoCalls.length >= 1)
    assert.match(generatedVideoCalls[0]?.prompt || '', /Create one realistic 6-second motion clip only/i)
    assert.match(generatedVideoCalls[0]?.prompt || '', /No scene rewrite, no identity drift, no product redesign/i)
    assert.doesNotMatch(generatedVideoCalls[0]?.prompt || '', /smaller natural wearing scale|Do not enlarge the product|sparkle|glow|shimmering highlight/i)
    assert.doesNotMatch(generatedVideoCalls[0]?.negativePrompt || '', /oversized product|hero enlarged product|sparkle effect|glow effect/i)
    assert.notEqual(String(referenceItem.generatedStillPath || ''), refImage)
    assert.match(String(referenceItem.generatedStillPath || ''), /plugin-live-photo[\\/].+[\\/]still\.png$/i)

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
    const exportedJpegCall = ffmpegOutputs.find((item) => item.outPath === exportResult.exported[0]!.imagePath)
    assert.ok(exportedJpegCall, 'Expected export jpeg ffmpeg call')
    assert.ok(exportedJpegCall!.args.includes('-q:v'))
    assert.ok(exportedJpegCall!.args.some((arg) => String(arg).includes('scale=1080:1440')))
    assert.ok(exportedJpegCall!.args.includes('4'))
    const exportedMovCall = ffmpegOutputs.find((item) => item.outPath === exportResult.exported[0]!.videoPath)
    assert.ok(exportedMovCall, 'Expected export mov ffmpeg call')
    assert.ok(exportedMovCall!.args.some((arg) => String(arg).includes('scale=1080:1440')))
    assert.ok(exportedMovCall!.args.some((arg) => String(arg).includes('fps=24')))
    assert.ok(exportedMovCall!.args.includes('22'))
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
        generateGptShotFrameImage: async (input: { prompt: string; imagePaths: string[]; negativePrompt?: string; outputSize?: string; outDir: string; filePrefix: string }) => {
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
      }) as any,
    })
    const retriedItem = await livePhotoService.retry({ id: referenceItem.id, motionTemplate: 'push_out' })
    const retriedCompletedItem = await waitForItemCompleted(retriedItem.id)
    assert.equal(retriedCompletedItem.packagingStatus, 'completed')
    assert.ok(existsSync(String(retriedCompletedItem.livePhotoImagePath || '')))
    assert.ok(existsSync(String(retriedCompletedItem.livePhotoVideoPath || '')))

    const resumable = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const resumableLatest = await livePhotoService.get(resumable.id)
    assert.ok(resumableLatest)
    await productsRepoModule.productsRepo.list()
    const startupResume = await livePhotoService.resumePendingTasksOnStartup()
    assert.ok(startupResume.resumableCount >= 1)
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
    assert.ok(resumeRemote.itemIds.includes(remotePendingReference.id))
    const resumedSnapshot = await waitForItemCondition(
      remotePendingReference.id,
      (item) => Boolean(item?.generatedStillPath) || Number(item?.logs?.length || 0) >= Number(pendingSnapshot?.logs?.length || 0) + 1,
      12000,
    )
    assert.ok(
      Boolean(resumedSnapshot?.generatedStillPath) ||
        Array.isArray(resumedSnapshot?.logs) && resumedSnapshot.logs.some((log: any) => String(log?.message || '').includes('remote task pending')),
    )
    assert.equal(remoteImageSubmitCount, 1)
    assert.ok(remoteImageQueryCount >= 1)
    globalThis.fetch = originalFetch

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
      if (current?.packagingStatus === 'failed' && String(current.error || '').includes('[retry_limit]')) {
        failedTerminalItem = current
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.ok(failedTerminalItem, 'Expected failed Live Photo item to reach retry limit state')
    assert.equal(failedTerminalItem.autoFlowStatus?.status, 'failed_terminal')
    assert.equal(failedTerminalItem.autoFlowStatus?.retryCount, failedTerminalItem.autoFlowStatus?.retryLimit)
    const startupResumeAfterTerminalFailure = await livePhotoService.resumePendingTasksOnStartup()
    assert.equal(
      startupResumeAfterTerminalFailure.itemIds.includes(failingReference.id),
      false,
      'Retry-limit failed item should not be re-enqueued by startup resume',
    )

    console.log('live photo plugin smoke test passed')
  } finally {
    livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await new Promise((resolve) => setTimeout(resolve, 100))
    await rmWithRetry(root)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
