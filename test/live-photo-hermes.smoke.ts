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
    assert.match(String((materialFlowReply.actions[0] as any)?.text || ''), /已开始生成/i)

    const usedMaterial = await productImageMaterialsRepo.getMaterial('desktop-local', 'material-choice')
    assert.equal(usedMaterial?.usageStatus, 'used')

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
    assert.match(String((feishuCompleted.actions[0] as any)?.videoPath || ''), /preview\.mp4$|motion\.mp4$/i)

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
    assert.match(String((numericStarted.actions[0] as any)?.text || ''), /使用说明/i)
    assert.match(String((numericStarted.actions[0] as any)?.text || ''), /1\.\s+/)

    const numericSelected = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-3',
      text: '1',
    })
    assert.equal(numericSelected.ok, true)
    assert.equal(numericSelected.actions[0]?.type, 'text')
    assert.match(String((numericSelected.actions[0] as any)?.text || ''), /已开始生成/i)

    const invalidSelection = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-4',
      imagePaths: [refImage],
    })
    assert.equal(invalidSelection.actions[0]?.type, 'product_options')
    const invalidReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-4',
      text: '9',
    })
    assert.equal(invalidReply.actions[0]?.type, 'text')
    assert.match(String((invalidReply.actions[0] as any)?.text || ''), /选择无效/i)

    const noSessionReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-missing',
      text: '1',
    })
    assert.equal(noSessionReply.actions[0]?.type, 'text')
    assert.match(String((noSessionReply.actions[0] as any)?.text || ''), /请先发送参考图片/i)

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
    assert.equal(latestOnlySelection?.sessionId, latestSession.session.id)
    assert.notEqual(latestOnlySelection?.sessionId, olderSession.session.id)

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
