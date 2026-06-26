import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-video-request-lock-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  async function waitForItemCondition(id: string, predicate: (item: any) => boolean, timeoutMs = 8000) {
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

  let capturedVideoBody: any = null
  let uploadCount = 0
  try {
    await cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'apifox_hub',
      videoApifoxHubProfile: 'gaorui',
      apifoxHubProfile: 'gaorui',
      gaoruiHub: {
        enabled: true,
        baseUrl: 'https://gaorui.cc',
        apiKey: 'test-gaorui-key',
        videoProvider: 'gaorui',
        videoEndpointStyle: 'openai_video',
        imageToVideoModel: 'veo_3_1-fl',
        referenceVideoModel: 'veo_3_1-components',
        defaultPollIntervalMs: 5,
        defaultTimeoutMs: 50,
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
    const productBoardImage = path.join(assetsDir, 'product-board.jpg')
    const refImage = path.join(assetsDir, 'reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(productBoardImage, 'product-board-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'Demo Product',
      type: 'earrings',
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
      analysisBoardPath: productBoardImage,
      analysisBoardStatus: 'done',
      canonicalSourcePath: productImage,
      canonicalSourceStatus: 'done',
    } as any)

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input || '')
      if (url.startsWith('https://upload.qiniup.com')) {
        uploadCount += 1
        return new Response(JSON.stringify({ key: `uploaded/${uploadCount}.png` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://gaorui.cc/v1/videos') {
        capturedVideoBody = JSON.parse(String(init?.body || '{}'))
        return new Response(
          JSON.stringify({
            id: 'gaorui-live-photo-task-1',
            status: 'queued',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url === 'https://gaorui.cc/v1/videos/gaorui-live-photo-task-1') {
        return new Response(
          JSON.stringify({
            id: 'gaorui-live-photo-task-1',
            status: 'running',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return await originalFetch(input, init)
    }) as typeof fetch

    const created = await livePhotoService.createFromReference({
      referenceImagePath: refImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })

    await waitForItemCondition(created.id, (item) => String(item?.videoTaskId || '').trim() === 'gaorui-live-photo-task-1', 8000)

    assert.ok(capturedVideoBody, 'Expected live photo video request body to be captured')
    assert.equal(String(capturedVideoBody?.model || ''), 'veo_3_1-fl')
    assert.equal(Number(capturedVideoBody?.motion_strength || 0), 1)
    assert.equal(Number(capturedVideoBody?.weight || 0), 1)
    assert.equal(Number(capturedVideoBody?.duration || 0), 6)
    assert.equal(Boolean(capturedVideoBody?.enhance_prompt), false)
    assert.ok(Array.isArray(capturedVideoBody?.images), 'Expected images array in live photo video request')
    assert.equal(capturedVideoBody.images.length, 1, 'Expected locked still image only in live photo video request')
    assert.ok(String(capturedVideoBody.images[0] || '').includes('cdn.example.com'))
    assert.match(String(capturedVideoBody?.prompt || ''), /STRUCTURE LOCK:/i)
    assert.match(String(capturedVideoBody?.prompt || ''), /NO INFERENCE RULE:/i)
    assert.match(String(capturedVideoBody?.prompt || ''), /SCALE LOCK:/i)
    assert.match(String(capturedVideoBody?.prompt || ''), /PROVIDER INPUT ROLE LOCK:/i)
    assert.match(String(capturedVideoBody?.prompt || ''), /The uploaded image array contains exactly 1 image\./i)
    assert.match(String(capturedVideoBody?.prompt || ''), /The uploaded image is the locked still scene and product anchor image\./i)
    assert.match(String(capturedVideoBody?.prompt || ''), /The locked still image is both the scene anchor and the product identity anchor for the video stage\./i)
    assert.match(String(capturedVideoBody?.prompt || ''), /partial non-identity-bearing crop only/i)
    assert.match(String(capturedVideoBody?.prompt || ''), /ultra slow micro push-in/i)
    assert.match(String(capturedVideoBody?.prompt || ''), /same exact visible product instance/i)
    assert.doesNotMatch(String(capturedVideoBody?.prompt || ''), /Image 2/i)
    assert.doesNotMatch(String(capturedVideoBody?.prompt || ''), /Image 1/i)
    assert.ok(String(capturedVideoBody?.negative_prompt || '').trim().length > 0, 'Expected gaorui negative prompt to be populated')
    assert.match(String(capturedVideoBody?.negative_prompt || ''), /no duplicate product/i)
    assert.match(String(capturedVideoBody?.negative_prompt || ''), /no redesigned product/i)

    globalThis.fetch = originalFetch
    console.log('live photo video request lock smoke test passed')
  } finally {
    await livePhotoService.resetTestDependencies()
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
