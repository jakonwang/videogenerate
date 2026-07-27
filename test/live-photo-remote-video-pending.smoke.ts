import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-remote-video-'))
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
    const latest = await livePhotoService.get(id)
    throw new Error(`Timed out waiting for live photo item condition ${id}: ${JSON.stringify(latest, null, 2)}`)
  }

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, `mock:${path.basename(outPath)}`, 'utf-8')
    },
    generateGptShotFrameImage: async (input: { outDir: string; filePrefix?: string }) => {
      const outputFilePath = path.join(input.outDir, `${input.filePrefix || 'reference_replace'}.png`)
      await mkdir(path.dirname(outputFilePath), { recursive: true })
      await writeFile(outputFilePath, 'mock-generated-still', 'utf-8')
      return outputFilePath
    },
  })

  try {
    await cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      imageApifoxHubProfile: 'ai666',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'apifox_hub',
      videoApifoxHubProfile: 'vectorengine',
      apifoxHubProfile: 'vectorengine',
      vectorEngineHub: {
        enabled: true,
        baseUrl: 'https://vector.example.com',
        apiKey: 'test-vector-key',
        videoProvider: 'veo',
        videoEndpointStyle: 'official_rest',
        imageToVideoModel: 'veo_3_1',
      },
      qiniuAccessKey: 'test-ak',
      qiniuSecretKey: 'test-sk',
      qiniuBucket: 'test-bucket',
      qiniuDomain: 'https://cdn.example.com',
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

    const remoteVideoTaskId = 'remote-video-task-1'
    let remoteVideoSubmitCount = 0
    let remoteVideoQueryCount = 0
    let remoteVideoDownloadCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.includes('/v1/images/edits')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from('mock-reference-replaced-image', 'utf-8').toString('base64'),
              },
            ],
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
      if (url.includes('/model/generateVideo') || url.includes('/v1/video/create')) {
        remoteVideoSubmitCount += 1
        return new Response(
          JSON.stringify({
            id: remoteVideoTaskId,
            status: 'submitted',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/model/prediction/') || url.includes('/v1/video/query?id=')) {
        remoteVideoQueryCount += 1
        if (remoteVideoQueryCount >= 2) {
          return new Response(
            JSON.stringify({
              id: remoteVideoTaskId,
              status: 'succeeded',
              outputUrl: 'https://cdn.example.com/live-photo-remote-video.mp4',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            id: remoteVideoTaskId,
            status: 'running',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url === 'https://cdn.example.com/live-photo-remote-video.mp4') {
        remoteVideoDownloadCount += 1
        return new Response('mock-video-binary', {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
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
      (item) => Boolean(item?.videoTaskId) || String(item?.error || '').includes('[remote_pending]'),
      15000,
    )

    assert.equal(pendingSnapshot.packagingStatus, 'processing')
    assert.equal(pendingSnapshot.videoTaskId, remoteVideoTaskId)
    assert.equal(pendingSnapshot.videoTaskProvider, 'apifox_hub')
    assert.equal(pendingSnapshot.autoFlowStatus?.status, 'running')
    assert.match(String(pendingSnapshot.autoFlowStatus?.lastError || ''), /\[remote_pending\]/)
    assert.match(String(pendingSnapshot.error || ''), /\[remote_pending\]/)
    assert.equal(remoteVideoSubmitCount, 1)

    const resumeRemote = await livePhotoService.resumePendingTasksOnStartup()
    assert.equal(resumeRemote.itemIds.includes(created.id), false)

    await waitForItemCondition(
      created.id,
      () => remoteVideoQueryCount >= 1,
      12000,
    )
    const resumedSnapshot = await livePhotoService.get(created.id)
    const queryObserved = remoteVideoQueryCount >= 1

    assert.ok(resumedSnapshot)
    assert.equal(resumedSnapshot?.videoTaskId, remoteVideoTaskId)
    assert.equal(resumedSnapshot.autoFlowStatus?.status, 'running')
    assert.match(String(resumedSnapshot.autoFlowStatus?.lastError || ''), /\[remote_pending\]/)
    assert.equal(remoteVideoSubmitCount, 1)
    assert.ok(queryObserved)
    assert.ok(remoteVideoQueryCount >= 1)

    const fastFollowupObservedAt = Date.now()
    const secondQueryObserved = await waitForItemCondition(
      created.id,
      () => remoteVideoQueryCount >= 2,
      12000,
    )

    assert.ok(secondQueryObserved)
    assert.ok(remoteVideoQueryCount >= 2)

    const completedSnapshot = await waitForItemCondition(
      created.id,
      (item) => item?.packagingStatus === 'completed' && Boolean(String(item?.livePhotoVideoPath || '').trim()),
      12000,
    )

    assert.equal(completedSnapshot.packagingStatus, 'completed')
    assert.ok(String(completedSnapshot.livePhotoVideoPath || '').trim().length > 0)
    assert.ok(remoteVideoDownloadCount >= 1)
    assert.ok(Date.now() - fastFollowupObservedAt < 12000)

    const summaries = await livePhotoService.listSummaries({ filter: 'all' })
    const summary = summaries.items.find((item) => item.id === created.id)
    assert.ok(summary)
    assert.equal(summary?.packagingStatus, 'completed')

    globalThis.fetch = originalFetch
    console.log('live photo remote video pending smoke test passed')
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
