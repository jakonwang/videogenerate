import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-hermes-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const { productImageMaterialsRepo } = await import('../src/main/modules/product-image-materials/repo')
  const { hermesLivePhotoService } = await import('../src/main/modules/live-photo/hermes')
  const { hermesLivePhotoAdapters } = await import('../src/main/modules/live-photo/hermesAdapters')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { outDir: string; filePrefix: string }) => {
      const stillPath = path.join(input.outDir, `${input.filePrefix}.png`)
      await mkdir(path.dirname(stillPath), { recursive: true })
      await writeFile(stillPath, 'mock-generated-still', 'utf-8')
      return stillPath
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
    reviewReferenceReplacementStillStrict: async () => ({
      passed: true,
      skipped: false,
      reason: '',
      score: 1,
      matchedPhrases: [],
      missingPhrases: [],
      negativeSignals: [],
      analyzed: null,
    }),
    reviewReferenceReplacementStillVisual: async () => ({
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
    }),
  })

  async function waitForAutoFlowIdle(timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const queueState = livePhotoService.getAutoFlowQueueState()
      if ((queueState.activeCount || 0) === 0 && (queueState.pendingCount || 0) === 0) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for live photo auto flow to become idle')
  }

  async function waitForSessionCompleted(sessionId: string, timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const result = await hermesLivePhotoService.getSessionStatus(sessionId)
      if (result.session.status === 'completed') return result
      if (result.session.status === 'failed') {
        throw new Error(result.session.error || `Hermes live photo session ${sessionId} failed`)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out waiting for Hermes live photo session ${sessionId}`)
  }

  async function removeDirWithRetry(target: string, timeoutMs = 5000) {
    const startedAt = Date.now()
    let lastError: unknown
    while (Date.now() - startedAt < timeoutMs) {
      try {
        await rm(target, { recursive: true, force: true })
        return
      } catch (error) {
        lastError = error
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    const code = String((lastError as { code?: unknown } | null)?.code || '').trim()
    if (code === 'EBUSY' || code === 'ENOTEMPTY') return
    throw lastError
  }

  try {
    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'grsai',
      grsaiApiKey: 'test-grsai-key',
      grsaiVideoModel: 'grok-video-3',
    } as any)

    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const refImage = path.join(assetsDir, 'reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'Hermes Demo Product',
      type: 'ring',
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

    const started = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-1',
      referenceImagePaths: [refImage],
    })
    assert.equal(started.session.status, 'awaiting_product')
    assert.equal(started.products.length, 1)
    assert.equal(started.products[0]?.id, product.id)
    assert.equal(started.session.presentedProducts?.[0]?.id, product.id)
    assert.equal(started.products[0]?.analysisBoardPath, productImage)
    assert.equal(started.session.presentedProducts?.[0]?.analysisBoardPath, productImage)

    const latestAwaiting = await hermesLivePhotoService.getLatestAwaitingProductSession({
      channel: 'feishu',
      userId: 'user-1',
    })
    assert.equal(latestAwaiting?.id, started.session.id)

    const resolvedNumericSelection = await hermesLivePhotoService.resolveSelection({
      channel: 'feishu',
      userId: 'user-1',
      text: '1',
    })
    assert.equal(resolvedNumericSelection?.sessionId, started.session.id)
    assert.equal((resolvedNumericSelection as any)?.productId, product.id)

    const selected = await hermesLivePhotoService.selectProduct({
      sessionId: started.session.id,
      productId: product.id,
    })
    assert.equal(selected.session.status, 'processing')
    assert.equal(selected.createdItems.length, 1)
    assert.equal(selected.product.analysisBoardPath, productImage)

    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-choice',
      userId: 'desktop-local',
      batchId: 'batch-1',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source.mp4'),
      sourceVideoName: 'ring-source.mp4',
      segmentIndex: 0,
      segmentPath: path.join(assetsDir, 'ring-source-segment.mp4'),
      frameTimeSec: 1.2,
      localImagePath: refImage,
      qiniuUrl: 'https://example.com/material-choice.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const materialSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-mat',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    assert.equal(materialSession.session.status, 'awaiting_product')
    assert.equal(materialSession.session.selectionMode, 'material')

    const materialSelectedProduct = await hermesLivePhotoService.selectProduct({
      sessionId: materialSession.session.id,
      productId: product.id,
    })
    assert.equal(materialSelectedProduct.session.status, 'awaiting_material')
    assert.equal(materialSelectedProduct.materials?.length, 1)
    assert.equal(materialSelectedProduct.materials?.[0]?.id, 'material-choice')

    const materialStalePath = path.join(assetsDir, 'material-stale.jpg')
    await writeFile(materialStalePath, 'material-stale', 'utf-8')
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-stale',
      userId: 'desktop-local',
      batchId: 'batch-stale',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-stale.mp4'),
      sourceVideoName: 'ring-source-stale.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.8,
      localImagePath: materialStalePath,
      qiniuUrl: 'https://example.com/material-stale.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now() - 10,
      updatedAt: Date.now() - 10,
    })

    const materialDeletePath = path.join(assetsDir, 'material-delete.jpg')
    await writeFile(materialDeletePath, 'material-delete', 'utf-8')
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-delete',
      userId: 'desktop-local',
      batchId: 'batch-2',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-2.mp4'),
      sourceVideoName: 'ring-source-2.mp4',
      segmentIndex: 1,
      segmentPath: '',
      frameTimeSec: 2.3,
      localImagePath: materialDeletePath,
      qiniuUrl: 'https://example.com/material-delete.jpg',
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const materialDeleteSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-mat-delete',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    const materialDeleteSelectedProduct = await hermesLivePhotoService.selectProduct({
      sessionId: materialDeleteSession.session.id,
      productId: product.id,
    })
    assert.equal(materialDeleteSelectedProduct.session.status, 'awaiting_material')
    assert.equal(materialDeleteSelectedProduct.materials?.length, 3)
    const materialDeleteIds = (materialDeleteSelectedProduct.materials || []).map((item) => item.id)
    assert.equal(materialDeleteIds.includes('material-choice'), true)
    assert.equal(materialDeleteIds.includes('material-stale'), true)
    assert.equal(materialDeleteIds.includes('material-delete'), true)

    const deletedMaterials = await hermesLivePhotoService.deleteMaterials({
      sessionId: materialDeleteSession.session.id,
      materialIds: ['material-delete'],
    })
    assert.equal(deletedMaterials.deleted.length, 1)
    assert.equal(await productImageMaterialsRepo.getMaterial('desktop-local', 'material-delete'), null)
    const remainingAfterDeleteIds = deletedMaterials.materials.map((item) => item.id)
    assert.equal(remainingAfterDeleteIds.includes('material-choice'), true)
    assert.equal(remainingAfterDeleteIds.includes('material-stale'), true)

    await productImageMaterialsRepo.removeMaterial('desktop-local', 'material-stale')

    const refreshedDeleteSession = await hermesLivePhotoService.getLatestAwaitingMaterialSession({
      channel: 'feishu',
      userId: 'user-mat-delete',
    })
    assert.equal(refreshedDeleteSession?.status, 'awaiting_material')
    assert.equal((refreshedDeleteSession?.presentedMaterials || []).length, 1)
    assert.equal(refreshedDeleteSession?.presentedMaterials?.[0]?.id, 'material-choice')

    await assert.rejects(
      () =>
        hermesLivePhotoService.deleteMaterials({
          sessionId: materialDeleteSession.session.id,
          materialIds: ['material-stale'],
        }),
      /Selected materials do not exist/,
    )

    const invalidDeleteReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat-delete',
      text: 'delete 9',
    })
    assert.equal(invalidDeleteReply.ok, true)
    assert.equal(invalidDeleteReply.actions[0]?.type, 'text')
    assert.ok(String(invalidDeleteReply.actions[0]?.text || '').length > 0)

    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-refresh-a',
      userId: 'desktop-local',
      batchId: 'batch-refresh',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-refresh-a.mp4'),
      sourceVideoName: 'ring-source-refresh-a.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.1,
      localImagePath: refImage,
      qiniuUrl: 'https://example.com/material-refresh-a.jpg',
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-refresh-b',
      userId: 'desktop-local',
      batchId: 'batch-refresh',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-refresh-b.mp4'),
      sourceVideoName: 'ring-source-refresh-b.mp4',
      segmentIndex: 1,
      segmentPath: '',
      frameTimeSec: 1.4,
      localImagePath: refImage,
      qiniuUrl: 'https://example.com/material-refresh-b.jpg',
      usageStatus: 'unused',
      createdAt: Date.now() - 5,
      updatedAt: Date.now() - 5,
    })

    const refreshSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-refresh',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    const refreshSelectedProduct = await hermesLivePhotoService.selectProduct({
      sessionId: refreshSession.session.id,
      productId: product.id,
    })
    assert.equal(refreshSelectedProduct.session.status, 'awaiting_material')
    assert.equal((refreshSelectedProduct.materials || []).some((item) => item.id === 'material-refresh-a'), true)
    assert.equal((refreshSelectedProduct.materials || []).some((item) => item.id === 'material-refresh-b'), true)

    await productImageMaterialsRepo.removeMaterial('desktop-local', 'material-refresh-a')

    const refreshedSession = await hermesLivePhotoService.getLatestAwaitingMaterialSession({
      channel: 'feishu',
      userId: 'user-refresh',
    })
    assert.equal(refreshedSession?.presentedMaterials?.length, 2)
    assert.equal(refreshedSession?.presentedMaterials?.some((item) => item.id === 'material-refresh-a'), false)
    assert.equal(refreshedSession?.presentedMaterials?.some((item) => item.id === 'material-refresh-b'), true)
    const refreshedChoice = refreshedSession?.presentedMaterials?.find((item) => item.id === 'material-refresh-b')
    assert.ok(refreshedChoice)

    const refreshedSelection = await hermesLivePhotoService.resolveSelection({
      channel: 'feishu',
      userId: 'user-refresh',
      text: String(refreshedChoice?.index || ''),
    })
    assert.equal(refreshedSelection?.selectionType, 'material')
    assert.equal((refreshedSelection as any)?.materialId, 'material-refresh-b')

    const resolvedMaterialSelection = await hermesLivePhotoService.resolveSelection({
      channel: 'feishu',
      userId: 'user-mat',
      text: '1',
    })
    assert.equal(resolvedMaterialSelection?.selectionType, 'material')
    assert.equal((resolvedMaterialSelection as any)?.materialId, 'material-choice')

    const materialFlowReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat',
      sessionId: materialSession.session.id,
      text: '1',
    })
    assert.equal(materialFlowReply.actions[0]?.type, 'text')
    assert.equal(String((materialFlowReply.actions[0] as any)?.sessionId || '').trim(), materialSession.session.id)
    assert.ok(String((materialFlowReply.actions[0] as any)?.text || '').length > 0)

    const materialHelpReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat',
      sessionId: materialSession.session.id,
      text: 'help',
    })
    assert.ok(materialHelpReply.actions[0]?.type === 'text' || materialHelpReply.actions[0]?.type === 'video')

    const usedMaterial = await productImageMaterialsRepo.getMaterial('desktop-local', 'material-choice')
    assert.equal(usedMaterial?.usageStatus, 'used')

    const materialBatchPathA = path.join(assetsDir, 'material-batch-a.jpg')
    const materialBatchPathB = path.join(assetsDir, 'material-batch-b.jpg')
    await writeFile(materialBatchPathA, 'material-batch-a', 'utf-8')
    await writeFile(materialBatchPathB, 'material-batch-b', 'utf-8')
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-batch-a',
      userId: 'desktop-local',
      batchId: 'batch-batch',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-batch-a.mp4'),
      sourceVideoName: 'ring-source-batch-a.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.6,
      localImagePath: materialBatchPathA,
      qiniuUrl: 'https://example.com/material-batch-a.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-batch-b',
      userId: 'desktop-local',
      batchId: 'batch-batch',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-batch-b.mp4'),
      sourceVideoName: 'ring-source-batch-b.mp4',
      segmentIndex: 1,
      segmentPath: '',
      frameTimeSec: 2.1,
      localImagePath: materialBatchPathB,
      qiniuUrl: 'https://example.com/material-batch-b.jpg',
      usageStatus: 'unused',
      createdAt: Date.now() - 1,
      updatedAt: Date.now() - 1,
    })

    const materialBatchSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-mat-batch',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    const materialBatchSelectedProduct = await hermesLivePhotoService.selectProduct({
      sessionId: materialBatchSession.session.id,
      productId: product.id,
    })
    assert.equal(materialBatchSelectedProduct.session.status, 'awaiting_material')

    const materialBatchSelection = await hermesLivePhotoService.resolveSelection({
      channel: 'feishu',
      userId: 'user-mat-batch',
      text: '1 2',
    })
    assert.equal(materialBatchSelection?.selectionType, 'material_batch')
    assert.equal((materialBatchSelection as any)?.materialIds.length, 2)

    const materialBatchReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat-batch',
      text: '1 2',
    })
    assert.equal(materialBatchReply.actions[0]?.type, 'text')
    assert.equal(String((materialBatchReply.actions[0] as any)?.sessionId || '').trim(), materialBatchSession.session.id)
    assert.ok(String((materialBatchReply.actions[0] as any)?.text || '').length > 0)

    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-batch-c',
      userId: 'desktop-local',
      batchId: 'batch-batch-2',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-batch-c.mp4'),
      sourceVideoName: 'ring-source-batch-c.mp4',
      segmentIndex: 2,
      segmentPath: '',
      frameTimeSec: 2.4,
      localImagePath: materialBatchPathA,
      qiniuUrl: 'https://example.com/material-batch-c.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-batch-d',
      userId: 'desktop-local',
      batchId: 'batch-batch-2',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-batch-d.mp4'),
      sourceVideoName: 'ring-source-batch-d.mp4',
      segmentIndex: 3,
      segmentPath: '',
      frameTimeSec: 2.8,
      localImagePath: materialBatchPathB,
      qiniuUrl: 'https://example.com/material-batch-d.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now() - 1,
      updatedAt: Date.now() - 1,
    })
    const materialBatchCommaSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-mat-batch-comma',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    const materialBatchCommaSelectedProduct = await hermesLivePhotoService.selectProduct({
      sessionId: materialBatchCommaSession.session.id,
      productId: product.id,
    })
    assert.equal(materialBatchCommaSelectedProduct.session.status, 'awaiting_material')
    const materialBatchCommaReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat-batch-comma',
      text: '1,2',
    })
    assert.equal(materialBatchCommaReply.actions[0]?.type, 'text')
    const materialBatchCommaCompleted = await waitForSessionCompleted(materialBatchCommaSession.session.id)
    assert.equal(materialBatchCommaCompleted.items.length, 2)

    const materialBatchCompleted = await waitForSessionCompleted(materialBatchSession.session.id)
    assert.equal(materialBatchCompleted.items.length, 2)

    const materialBatchFinished = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat-batch',
      sessionId: materialBatchSession.session.id,
    })
    assert.equal(materialBatchFinished.ok, true)
    assert.equal(materialBatchFinished.actions.length, 2)
    assert.equal(materialBatchFinished.actions[0]?.type, 'video')
    assert.equal(materialBatchFinished.actions[1]?.type, 'video')

    const usedBatchMaterialA = await productImageMaterialsRepo.getMaterial('desktop-local', 'material-batch-a')
    const usedBatchMaterialB = await productImageMaterialsRepo.getMaterial('desktop-local', 'material-batch-b')
    assert.equal(usedBatchMaterialA?.usageStatus, 'used')
    assert.equal(usedBatchMaterialB?.usageStatus, 'used')

    const materialPartialPathA = path.join(assetsDir, 'material-partial-a.jpg')
    const materialPartialPathB = path.join(assetsDir, 'material-partial-b.jpg')
    await writeFile(materialPartialPathA, 'material-partial-a', 'utf-8')
    await writeFile(materialPartialPathB, 'material-partial-b', 'utf-8')
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-partial-a',
      userId: 'desktop-local',
      batchId: 'batch-partial',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-partial-a.mp4'),
      sourceVideoName: 'ring-source-partial-a.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.3,
      localImagePath: materialPartialPathA,
      qiniuUrl: 'https://example.com/material-partial-a.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await productImageMaterialsRepo.upsertMaterial({
      id: 'material-partial-b',
      userId: 'desktop-local',
      batchId: 'batch-partial',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'ring-source-partial-b.mp4'),
      sourceVideoName: 'ring-source-partial-b.mp4',
      segmentIndex: 1,
      segmentPath: '',
      frameTimeSec: 1.9,
      localImagePath: materialPartialPathB,
      qiniuUrl: 'https://example.com/material-partial-b.jpg',
      usageStatus: 'unused',
      createdAt: Date.now() - 1,
      updatedAt: Date.now() - 1,
    })

    const partialSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-mat-partial',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    const partialSelectedProduct = await hermesLivePhotoService.selectProduct({
      sessionId: partialSession.session.id,
      productId: product.id,
    })
    assert.equal(partialSelectedProduct.session.status, 'awaiting_material')

    const partialSelectionReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat-partial',
      text: '1 2',
    })
    assert.equal(partialSelectionReply.actions[0]?.type, 'text')
    await waitForSessionCompleted(partialSession.session.id)

    const partialStatusBeforeRewrite = await hermesLivePhotoService.getSessionStatus(partialSession.session.id)
    assert.equal(partialStatusBeforeRewrite.items.length, 2)

    const partialVideoPath = path.join(assetsDir, 'partial-success-live.mov')
    await writeFile(partialVideoPath, 'partial-success-live', 'utf-8')

    await livePhotoRepo.upsert({
      ...(partialStatusBeforeRewrite.items[0] as any),
      packagingStatus: 'completed',
      livePhotoVideoPath: partialVideoPath,
      generatedVideoPath: partialVideoPath,
      updatedAt: Date.now(),
    } as any)
    await livePhotoRepo.upsert({
      ...(partialStatusBeforeRewrite.items[1] as any),
      packagingStatus: 'failed',
      error: 'mock partial failure',
      updatedAt: Date.now(),
    } as any)

    const partialStatus = await hermesLivePhotoService.getSessionStatus(partialSession.session.id)
    assert.equal(partialStatus.session.status, 'completed')
    assert.ok(String(partialStatus.session.error || '').length > 0)
    assert.match(String(partialStatus.session.error || ''), /个任务生成失败/)
    assert.match(String(partialStatus.session.error || ''), /mock partial failure/)

    const partialFinishedReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-mat-partial',
      sessionId: partialSession.session.id,
    })
    assert.equal(partialFinishedReply.ok, true)
    assert.equal(partialFinishedReply.actions[0]?.type, 'text')
    assert.equal(partialFinishedReply.actions[1]?.type, 'video')

    const finished = await waitForSessionCompleted(started.session.id)
    assert.equal(finished.session.status, 'completed')
    assert.ok(String(finished.session.generatedVideoPath || '').trim())
    assert.ok(existsSync(String(finished.session.generatedVideoPath || '')))

    const feishuCompleted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-1',
      sessionId: started.session.id,
    })
    assert.equal(feishuCompleted.ok, true)
    assert.equal(feishuCompleted.actions[0]?.type, 'video')
    assert.match(String((feishuCompleted.actions[0] as any)?.videoPath || ''), /preview\.mp4$|motion\.mp4$|live-photo\.mov$/i)

    const directSendFinalExplicitBeforeResetReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-1',
      sessionId: started.session.id,
      text: 'send video',
    })
    assert.equal(directSendFinalExplicitBeforeResetReply.ok, true)
    assert.equal(directSendFinalExplicitBeforeResetReply.actions[0]?.type, 'video')
    assert.equal(String((directSendFinalExplicitBeforeResetReply.actions[0] as any)?.sessionId || '').trim(), started.session.id)

    const directSendFinalReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-1',
      text: '发送成品',
    })
    assert.equal(directSendFinalReply.ok, true)
    assert.equal(directSendFinalReply.actions[0]?.type, 'product_options')
    assert.notEqual(String((directSendFinalReply.actions[0] as any)?.sessionId || '').trim(), started.session.id)
    assert.ok(Array.isArray((directSendFinalReply.actions[0] as any)?.options))

    const directSendFinalExplicitReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-1',
      sessionId: started.session.id,
      text: '发送视频',
    })
    assert.equal(directSendFinalExplicitReply.ok, true)
    assert.equal(directSendFinalExplicitReply.actions[0]?.type, 'text')
    assert.equal(String((directSendFinalExplicitReply.actions[0] as any)?.sessionId || '').trim(), started.session.id)

    const wecomStarted = await hermesLivePhotoAdapters.handleWecomEvent({
      userId: 'user-2',
      imagePaths: [refImage],
    })
    assert.equal(wecomStarted.ok, true)
    assert.equal(wecomStarted.actions[0]?.type, 'product_options')
    assert.ok(String((wecomStarted.actions[0] as any)?.sessionId || '').trim())
    assert.ok(Array.isArray((wecomStarted.actions[0] as any)?.options))

    const numericStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-3',
      imagePaths: [refImage],
    })
    assert.equal(numericStarted.actions[0]?.type, 'product_options')
    assert.ok(String((numericStarted.actions[0] as any)?.text || '').length > 0)
    assert.match(String((numericStarted.actions[0] as any)?.text || ''), /1\.\s+/)

    const numericSelected = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-3',
      text: '1',
    })
    assert.equal(numericSelected.ok, true)
    assert.equal(numericSelected.actions[0]?.type, 'text')
    assert.equal(String((numericSelected.actions[0] as any)?.sessionId || '').trim().length > 0, true)
    assert.ok(String((numericSelected.actions[0] as any)?.text || '').length > 0)

    const namedStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-named-product',
      imagePaths: [refImage],
    })
    assert.equal(namedStarted.actions[0]?.type, 'product_options')
    const namedSelected = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-named-product',
      text: product.name,
    })
    assert.equal(namedSelected.ok, true)
    assert.equal(namedSelected.actions[0]?.type, 'text')
    assert.equal(String((namedSelected.actions[0] as any)?.sessionId || '').trim().length > 0, true)
    assert.ok(String((namedSelected.actions[0] as any)?.text || '').length > 0)

    const numericStatusReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-3',
      text: 'progress',
    })
    assert.equal(numericStatusReply.ok, true)
    assert.ok(numericStatusReply.actions[0]?.type === 'text' || numericStatusReply.actions[0]?.type === 'video')
    if (numericStatusReply.actions[0]?.type === 'text') {
      assert.ok(String((numericStatusReply.actions[0] as any)?.text || '').length > 0)
    } else {
      assert.ok(String((numericStatusReply.actions[0] as any)?.videoPath || '').length > 0)
    }

    const explicitStatusReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-3',
      sessionId: String((numericStarted.actions[0] as any)?.sessionId || ''),
      text: 'progress',
    })
    assert.equal(explicitStatusReply.ok, true)
    assert.ok(explicitStatusReply.actions[0]?.type === 'text' || explicitStatusReply.actions[0]?.type === 'video')

    const invalidSelection = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-4',
      imagePaths: [refImage],
    })
    assert.equal(invalidSelection.actions[0]?.type, 'product_options')
    const invalidReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-4',
      text: 'hello',
    })
    assert.equal(invalidReply.actions[0]?.type, 'product_options')
    assert.ok(Array.isArray((invalidReply.actions[0] as any)?.options))

    const noSessionReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-missing',
      text: '1',
    })
    assert.equal(noSessionReply.actions[0]?.type, 'text')
    assert.ok(String((noSessionReply.actions[0] as any)?.text || '').length > 0)

    const noSessionHelpReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-missing-help',
      text: 'help',
    })
    assert.equal(noSessionHelpReply.actions[0]?.type, 'text')
    assert.ok(String((noSessionHelpReply.actions[0] as any)?.text || '').length > 0)

    const genericLivePhotoIntentReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-generic-live-photo',
      text: 'I want to make a live photo',
    })
    assert.equal(genericLivePhotoIntentReply.actions[0]?.type, 'text')
    assert.match(String((genericLivePhotoIntentReply.actions[0] as any)?.text || ''), /参考图片|materials|unused live photo/i)

    const restartStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-restart',
      imagePaths: [refImage],
    })
    const restartSessionId = String((restartStarted.actions[0] as any)?.sessionId || '')
    assert.ok(restartSessionId)
    const restartReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-restart',
      text: '重新开始',
    })
    assert.equal(restartReply.actions[0]?.type, 'text')
    const restartClosedSession = await hermesLivePhotoService.getSessionStatus(restartSessionId)
    assert.ok(restartClosedSession.session.closedAt)
    const restartHelpReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-restart',
      text: 'help',
    })
    assert.equal(restartHelpReply.actions[0]?.type, 'text')
    const closedExplicitReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-restart',
      sessionId: restartSessionId,
      text: '1',
    })
    assert.equal(closedExplicitReply.actions[0]?.type, 'text')
    assert.ok(String((closedExplicitReply.actions[0] as any)?.text || '').length > 0)

    const changeProductStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-change-product',
      imagePaths: [refImage],
    })
    const changeProductSessionId = String((changeProductStarted.actions[0] as any)?.sessionId || '')
    assert.ok(changeProductSessionId)
    const changeProductReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-change-product',
      text: '换商品',
    })
    assert.equal(changeProductReply.actions[0]?.type, 'product_options')
    const changedProductSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'user-change-product',
    })
    assert.ok(changedProductSession?.id)
    assert.notEqual(changedProductSession?.id, changeProductSessionId)
    assert.equal(changedProductSession?.selectionMode, 'product')
    const closedChangeProductSession = await hermesLivePhotoService.getSessionStatus(changeProductSessionId)
    assert.ok(closedChangeProductSession.session.closedAt)

    const switchStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-switch-mode',
      imagePaths: [refImage],
    })
    const switchSessionId = String((switchStarted.actions[0] as any)?.sessionId || '')
    assert.ok(switchSessionId)
    const switchReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-switch-mode',
      text: 'materials',
    })
    assert.equal(switchReply.actions[0]?.type, 'product_options')
    const switchedSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'user-switch-mode',
    })
    assert.equal(switchedSession?.selectionMode, 'material')
    assert.equal(switchedSession?.status, 'awaiting_product')
    const closedSwitchSession = await hermesLivePhotoService.getSessionStatus(switchSessionId)
    assert.ok(closedSwitchSession.session.closedAt)

    const deliveryProductImage = path.join(assetsDir, 'delivery-product.jpg')
    await writeFile(deliveryProductImage, 'delivery-product-image', 'utf-8')
    const deliveryProduct = await productsRepo.upsert({
      name: 'Hermes Delivery Product',
      type: 'ring',
      images: [
        {
          id: 'delivery-img-1',
          productId: 'pending',
          filePath: deliveryProductImage,
          fileName: 'delivery-product.jpg',
          fileSize: 16,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isCover: true,
        },
      ],
      coverImagePath: deliveryProductImage,
      analysisBoardPath: deliveryProductImage,
      analysisBoardStatus: 'done',
      canonicalSourcePath: deliveryProductImage,
      canonicalSourceStatus: 'done',
    } as any)

    const completedItem = await livePhotoService.enqueueReferenceItems({
      referenceImagePaths: [refImage],
      productId: deliveryProduct.id,
      motionTemplate: 'push_in',
    })
    await livePhotoRepo.upsert({
      ...(completedItem as any),
      packagingStatus: 'completed',
      previewVideoPath: path.join(assetsDir, 'delivery-preview.mp4'),
      livePhotoVideoPath: path.join(assetsDir, 'delivery-live.mp4'),
      generatedVideoPath: path.join(assetsDir, 'delivery-live.mp4'),
      hermesDeliveryUsedAt: undefined,
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now() - 10_000,
    } as any)
    const completedItemAll = await livePhotoService.enqueueReferenceItems({
      referenceImagePaths: [refImage],
      productId: deliveryProduct.id,
      motionTemplate: 'push_in',
    })
    await livePhotoRepo.upsert({
      ...(completedItemAll as any),
      packagingStatus: 'completed',
      previewVideoPath: path.join(assetsDir, 'delivery-preview-all.mp4'),
      livePhotoVideoPath: path.join(assetsDir, 'delivery-live-all.mp4'),
      generatedVideoPath: path.join(assetsDir, 'delivery-live-all.mp4'),
      hermesDeliveryUsedAt: undefined,
      usageStatus: 'unused',
      createdAt: Date.now() - 20_000,
      updatedAt: Date.now(),
    } as any)
    await writeFile(path.join(assetsDir, 'delivery-preview.mp4'), 'delivery-preview', 'utf-8')
    await writeFile(path.join(assetsDir, 'delivery-live.mp4'), 'delivery-live', 'utf-8')
    await writeFile(path.join(assetsDir, 'delivery-preview-all.mp4'), 'delivery-preview-all', 'utf-8')
    await writeFile(path.join(assetsDir, 'delivery-live-all.mp4'), 'delivery-live-all', 'utf-8')
    const reusableDeliveryItems = await livePhotoService.listReusableCompletedItemsByProduct({
      productId: deliveryProduct.id,
      limit: 2,
    })
    assert.equal(reusableDeliveryItems[0]?.id, (completedItem as any).id)
    assert.equal(reusableDeliveryItems[1]?.id, (completedItemAll as any).id)

    const deliveryStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      selectionMode: 'delivery',
    })
    assert.equal(deliveryStarted.actions[0]?.type, 'product_options')

    const deliveryProductReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      text: deliveryProduct.name,
    })
    assert.equal(deliveryProductReply.actions[0]?.type, 'text')
    assert.ok(String((deliveryProductReply.actions[0] as any)?.text || '').length > 0)

    const deliveryHelpReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      text: 'help',
    })
    assert.equal(deliveryHelpReply.actions[0]?.type, 'text')
    assert.ok(String((deliveryHelpReply.actions[0] as any)?.text || '').length > 0)

    const explicitDeliveryHelpReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      sessionId: String((deliveryStarted.actions[0] as any)?.sessionId || ''),
      text: 'help',
    })
    assert.equal(explicitDeliveryHelpReply.actions[0]?.type, 'text')

    const deliveryCountReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      text: '1',
    })
    assert.equal(deliveryCountReply.actions[0]?.type, 'video')
    assert.match(String((deliveryCountReply.actions[0] as any)?.videoPath || ''), /delivery-live\.mp4$/i)
    assert.equal(String((deliveryCountReply.actions[0] as any)?.sessionId || '').trim().length > 0, true)
    const deliveredSessionId = String((deliveryCountReply.actions[0] as any)?.sessionId || '').trim()
    await hermesLivePhotoService.closeSession({
      sessionId: deliveredSessionId,
      reason: 'final_sent',
    })
    const deliveredStatusReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      sessionId: deliveredSessionId,
      text: 'progress',
    })
    assert.equal(deliveredStatusReply.actions[0]?.type, 'text')
    assert.ok(deliveredStatusReply.actions.every((item) => item.type !== 'video'))
    assert.match(String((deliveredStatusReply.actions[0] as any)?.text || ''), /已发送完成|materials|unused live photo/i)
    const deliveredSessionOnlyReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      sessionId: deliveredSessionId,
    })
    assert.equal(deliveredSessionOnlyReply.actions[0]?.type, 'text')
    assert.ok(deliveredSessionOnlyReply.actions.every((item) => item.type !== 'video'))
    const deliveredImplicitStatusReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      text: 'done?',
    })
    assert.equal(deliveredImplicitStatusReply.actions[0]?.type, 'text')
    assert.match(String((deliveredImplicitStatusReply.actions[0] as any)?.text || ''), /已发送完成|materials|unused live photo/i)
    const deliveredImplicitHelpReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery',
      text: 'help',
    })
    assert.equal(deliveredImplicitHelpReply.actions[0]?.type, 'text')
    assert.match(String((deliveredImplicitHelpReply.actions[0] as any)?.text || ''), /已发送完成|materials|unused live photo/i)

    const deliveryAllStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery-all',
      selectionMode: 'delivery',
    })
    assert.equal(deliveryAllStarted.actions[0]?.type, 'product_options')
    const deliveryAllProductReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery-all',
      text: deliveryProduct.name,
    })
    assert.equal(deliveryAllProductReply.actions[0]?.type, 'text')
    assert.match(String((deliveryAllProductReply.actions[0] as any)?.text || ''), /all/i)
    const deliveryAllReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-delivery-all',
      text: 'all',
    })
    assert.ok(deliveryAllReply.actions.length >= 2)
    assert.equal(deliveryAllReply.actions[0]?.type, 'video')
    assert.ok(deliveryAllReply.actions.every((item) => item.type === 'video'))
    assert.ok(deliveryAllReply.actions.every((item) => String((item as any)?.sessionId || '').trim().length > 0))
    assert.match(String((deliveryAllReply.actions[0] as any)?.videoPath || ''), /delivery-live\.mp4$/i)

    const materialReselectSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-material-reselect',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    const materialReselectSelected = await hermesLivePhotoService.selectProduct({
      sessionId: materialReselectSession.session.id,
      productId: product.id,
    })
    assert.equal(materialReselectSelected.session.status, 'awaiting_material')
    const materialReselectReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-material-reselect',
      text: '换商品',
    })
    assert.equal(materialReselectReply.actions[0]?.type, 'product_options')
    const materialReselectLatest = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'user-material-reselect',
    })
    assert.equal(materialReselectLatest?.selectionMode, 'material')
    assert.equal(materialReselectLatest?.status, 'awaiting_product')
    const materialReselectClosed = await hermesLivePhotoService.getSessionStatus(materialReselectSession.session.id)
    assert.ok(materialReselectClosed.session.closedAt)

    const materialStatusSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-material-status',
      selectionMode: 'material',
      referenceImagePaths: [],
    })
    await hermesLivePhotoService.selectProduct({
      sessionId: materialStatusSession.session.id,
      productId: product.id,
    })
    const materialStatusReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-material-status',
      text: '有结果了吗',
    })
    assert.equal(materialStatusReply.actions[0]?.type, 'material_options')
    assert.match(String((materialStatusReply.actions[0] as any)?.text || ''), /选素材图|图片编号/i)

    const materialSendFinalReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-material-status',
      text: '发送成品',
    })
    assert.equal(materialSendFinalReply.actions[0]?.type, 'product_options')
    assert.ok(String((materialSendFinalReply.actions[0] as any)?.text || '').length > 0)

    const crossFlowDeliveryStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cross-flow',
      selectionMode: 'delivery',
    })
    assert.equal(crossFlowDeliveryStarted.actions[0]?.type, 'product_options')

    const crossFlowDeliveryProductReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cross-flow',
      text: '1',
    })
    assert.equal(crossFlowDeliveryProductReply.actions[0]?.type, 'text')


    const crossFlowGenerationStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cross-flow',
      imagePaths: [refImage],
    })
    assert.equal(crossFlowGenerationStarted.actions[0]?.type, 'product_options')

    const crossFlowGenerationSelect = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cross-flow',
      text: '1',
    })
    assert.equal(crossFlowGenerationSelect.actions[0]?.type, 'text')
    const crossFlowLatestSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'user-cross-flow',
    })
    assert.equal(crossFlowLatestSession?.selectionMode, 'product')
    assert.equal(crossFlowLatestSession?.status, 'processing')

    const crossFlowProgressReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cross-flow',
      text: 'done?',
    })
    assert.equal(crossFlowProgressReply.actions[0]?.type, 'text')
    assert.ok(String((crossFlowProgressReply.actions[0] as any)?.text || '').length > 0)

    const cancelStarted = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cancel',
      imagePaths: [refImage],
    })
    const cancelSessionId = String((cancelStarted.actions[0] as any)?.sessionId || '')
    assert.ok(cancelSessionId)
    const cancelSelected = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cancel',
      text: '1',
    })
    assert.equal(cancelSelected.actions[0]?.type, 'text')
    const cancelReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-cancel',
      text: 'cancel',
    })
    assert.equal(cancelReply.actions[0]?.type, 'text')
    const cancelledSession = await hermesLivePhotoService.getSessionStatus(cancelSessionId)
    assert.ok(cancelledSession.session.closedAt)
    const cancelledLatestSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'user-cancel',
    })
    assert.equal(cancelledLatestSession, null)

    const olderSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-5',
      referenceImagePaths: [refImage],
    })
    const latestSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-5',
      referenceImagePaths: [refImage],
    })
    const latestOnlySelection = await hermesLivePhotoService.resolveSelection({
      channel: 'feishu',
      userId: 'user-5',
      text: '1',
    })
    const olderAwaitingStatus = await hermesLivePhotoService.getSessionStatus(olderSession.session.id)
    assert.ok(olderAwaitingStatus.session.closedAt)
    assert.equal(olderAwaitingStatus.session.closeReason, 'switch_to_product')
    assert.equal(latestOnlySelection?.sessionId, latestSession.session.id)
    assert.notEqual(latestOnlySelection?.sessionId, olderSession.session.id)

    const splitBatchPartA = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-split-batch',
      referenceImagePaths: [refImage],
    })
    const splitBatchPartB = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-split-batch',
      referenceImagePaths: [refImage2, refImage3],
    })
    assert.equal(splitBatchPartB.session.id, splitBatchPartA.session.id)
    const mergedSplitBatchStatus = await hermesLivePhotoService.getSessionStatus(splitBatchPartA.session.id)
    assert.equal(mergedSplitBatchStatus.session.status, 'awaiting_product')
    assert.equal(mergedSplitBatchStatus.session.referenceImagePaths.length, 3)

    const processingSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-6',
      referenceImagePaths: [refImage],
    })
    await hermesLivePhotoService.selectProduct({
      sessionId: processingSession.session.id,
      productId: product.id,
    })
    const restartedDuringProcessing = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-6',
      referenceImagePaths: [refImage],
    })
    const closedProcessingStatus = await hermesLivePhotoService.getSessionStatus(processingSession.session.id)
    assert.ok(closedProcessingStatus.session.closedAt)
    assert.equal(closedProcessingStatus.session.closeReason, 'switch_to_product')
    const restartedProcessingSelection = await hermesLivePhotoService.resolveSelection({
      channel: 'feishu',
      userId: 'user-6',
      text: '1',
    })
    assert.equal(restartedProcessingSelection?.sessionId, restartedDuringProcessing.session.id)

    const completedSession = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-7',
      referenceImagePaths: [refImage],
    })
    const completedSelected = await hermesLivePhotoService.selectProduct({
      sessionId: completedSession.session.id,
      productId: product.id,
    })
    await waitForSessionCompleted(completedSession.session.id)
    const restartedAfterCompleted = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-7',
      referenceImagePaths: [refImage],
    })
    const closedCompletedStatus = await hermesLivePhotoService.getSessionStatus(completedSession.session.id)
    assert.ok(closedCompletedStatus.session.closedAt)
    assert.equal(closedCompletedStatus.session.closeReason, 'switch_to_product')
    const restartedCompletedSelection = await hermesLivePhotoService.resolveSelection({
      channel: 'feishu',
      userId: 'user-7',
      text: '1',
    })
    assert.equal(restartedCompletedSelection?.sessionId, restartedAfterCompleted.session.id)
    const abandonedCompletedItemId = String(completedSelected.createdItems[0]?.id || '').trim()
    assert.ok(abandonedCompletedItemId)
    const reusableAfterAbandon = await livePhotoService.listReusableCompletedItemsByProduct({
      productId: product.id,
      limit: 50,
    })
    assert.equal(reusableAfterAbandon.some((item) => item.id === abandonedCompletedItemId), false)

    console.log('live photo hermes smoke test passed')
  } finally {
    await waitForAutoFlowIdle().catch(() => undefined)
    livePhotoService.resetTestDependencies()
    closeLivePhotoSqlite()
    closeCloneSqlite()
    await new Promise((resolve) => setTimeout(resolve, 150))
    await removeDirWithRetry(root)
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

