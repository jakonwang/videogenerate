import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-remote-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

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
  })

  try {
    await cloneRepo.setCredentials({
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

    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const refImage = path.join(assetsDir, 'reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')

    const product = await productsRepo.upsert({
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

    const remoteImageTaskId = 'remote-image-task-1'
    let remoteImageSubmitCount = 0
    let remoteImageQueryCount = 0
    const originalFetch = globalThis.fetch
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
        return new Response(
          JSON.stringify({
            id: remoteImageTaskId,
            status: 'running',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.startsWith('https://upload.qiniup.com')) {
        return new Response(JSON.stringify({ key: 'uploaded/mock.png' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return await originalFetch(input, init)
    }) as typeof fetch

    const created = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })

    const pendingSnapshot = await waitForItemCondition(
      created.id,
      (item) => Boolean(item?.imageTaskId) || String(item?.error || '').includes('[remote_pending]'),
      12000,
    )

    assert.equal(pendingSnapshot.packagingStatus, 'processing')
    assert.equal(pendingSnapshot.imageTaskId, remoteImageTaskId)
    assert.equal(pendingSnapshot.imageTaskProvider, 'grsai')
    assert.match(String(pendingSnapshot.error || ''), /\[remote_pending\]/)
    assert.equal(remoteImageSubmitCount, 1)

    const resumeRemote = await livePhotoService.resumePendingTasksOnStartup()
    assert.ok(resumeRemote.itemIds.includes(created.id))

    const resumedSnapshot = await waitForItemCondition(
      created.id,
      (item) => String(item?.imageTaskId || '').trim() === remoteImageTaskId,
      12000,
    )

    const queryObserved = await waitForItemCondition(
      created.id,
      () => remoteImageQueryCount >= 1,
      12000,
    )

    assert.equal(resumedSnapshot.imageTaskId, remoteImageTaskId)
    assert.equal(remoteImageSubmitCount, 1)
    assert.ok(queryObserved)
    assert.ok(remoteImageQueryCount >= 1)

    globalThis.fetch = originalFetch
    console.log('live photo remote pending smoke test passed')
  } finally {
    livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite()
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await new Promise((resolve) => setTimeout(resolve, 100))
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
