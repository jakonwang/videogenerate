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
  const { hermesLivePhotoService } = await import('../src/main/modules/live-photo/hermes')
  const { hermesLivePhotoAdapters } = await import('../src/main/modules/live-photo/hermesAdapters')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')

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
  })

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
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'Hermes Demo Product',
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

    const started = await hermesLivePhotoService.startReferenceSession({
      channel: 'feishu',
      userId: 'user-1',
      referenceImagePaths: [refImage],
    })
    assert.equal(started.session.status, 'awaiting_product')
    assert.equal(started.products.length, 1)
    assert.equal(started.products[0]?.id, product.id)
    assert.equal(started.session.presentedProducts?.[0]?.id, product.id)

    const latestAwaiting = await hermesLivePhotoService.getLatestAwaitingProductSession({
      channel: 'feishu',
      userId: 'user-1',
    })
    assert.equal(latestAwaiting?.id, started.session.id)

    const resolvedNumericSelection = await hermesLivePhotoService.resolveProductSelection({
      channel: 'feishu',
      userId: 'user-1',
      text: '1',
    })
    assert.equal(resolvedNumericSelection?.sessionId, started.session.id)
    assert.equal(resolvedNumericSelection?.productId, product.id)

    const selected = await hermesLivePhotoService.selectProduct({
      sessionId: started.session.id,
      productId: product.id,
    })
    assert.equal(selected.session.status, 'processing')
    assert.equal(selected.createdItems.length, 1)

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
    assert.match(String((numericStarted.actions[0] as any)?.text || ''), /1\.\s+/)

    const numericSelected = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-3',
      text: '1',
    })
    assert.equal(numericSelected.ok, true)
    assert.equal(numericSelected.actions[0]?.type, 'text')
    assert.match(String((numericSelected.actions[0] as any)?.text || ''), /generation started/i)

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
    assert.match(String((invalidReply.actions[0] as any)?.text || ''), /invalid selection/i)

    const noSessionReply = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId: 'user-missing',
      text: '1',
    })
    assert.equal(noSessionReply.actions[0]?.type, 'text')
    assert.match(String((noSessionReply.actions[0] as any)?.text || ''), /send a reference image first/i)

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
    const latestOnlySelection = await hermesLivePhotoService.resolveProductSelection({
      channel: 'feishu',
      userId: 'user-5',
      text: '1',
    })
    assert.equal(latestOnlySelection?.sessionId, latestSession.session.id)
    assert.notEqual(latestOnlySelection?.sessionId, olderSession.session.id)

    console.log('live photo hermes smoke test passed')
  } finally {
    livePhotoService.resetTestDependencies()
    closeLivePhotoSqlite()
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
