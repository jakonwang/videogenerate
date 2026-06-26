import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-video-direct-output-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  async function waitForItemCompleted(id: string, timeoutMs = 12000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current?.packagingStatus === 'completed') return current
      if (current?.packagingStatus === 'failed') {
        throw new Error(`Live photo item failed unexpectedly: ${String(current.error || 'unknown failure')}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const latest = await livePhotoService.get(id)
    throw new Error(`Timed out waiting for live photo completion ${id}: ${JSON.stringify(latest, null, 2)}`)
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
    analyzeProductStructureWithGrs: async () => ({
      productName: 'Demo Product',
      analysisText: 'Stable product structure.',
      keyFeatures: ['stable product structure'],
    }) as any,
    reviewReferenceReplacementStillStrict: async () => ({
      passed: true,
      skipped: false,
      score: 1,
      matchedPhrases: ['stable product structure'],
      missingPhrases: [],
      negativeSignals: [],
      analyzed: null,
    }) as any,
    reviewReferenceReplacementStillVisual: async () => ({
      passed: true,
      skipped: false,
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
    }) as any,
  })

  let videoPostCount = 0
  let downloadCount = 0
  let capturedVideoBody: any = null

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
        return new Response(JSON.stringify({ key: `uploaded/${Date.now()}.png` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://gaorui.cc/v1/videos') {
        videoPostCount += 1
        capturedVideoBody = JSON.parse(String(init?.body || '{}'))
        return new Response(JSON.stringify({ url: 'https://cdn.example.com/generated/live-photo-direct.mp4' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://cdn.example.com/generated/live-photo-direct.mp4') {
        downloadCount += 1
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

    const completed = await waitForItemCompleted(created.id)
    assert.equal(videoPostCount, 1, 'Expected direct-output provider flow to submit exactly one video task')
    assert.equal(downloadCount, 1, 'Expected live photo flow to download the direct provider output exactly once')
    assert.ok(capturedVideoBody, 'Expected direct-output video request body to be captured')
    assert.equal(String(capturedVideoBody?.model || ''), 'veo_3_1-fl')
    assert.equal(Number(capturedVideoBody?.duration || 0), 6)
    assert.equal(Boolean(capturedVideoBody?.enhance_prompt), false)
    assert.ok(Array.isArray(capturedVideoBody?.images), 'Expected single locked-still images payload')
    assert.equal(capturedVideoBody.images.length, 1)
    assert.ok(existsSync(String(completed.motionVideoPath || '')))
    assert.ok(existsSync(String(completed.previewVideoPath || '')))

    globalThis.fetch = originalFetch
    console.log('live photo video direct output smoke test passed')
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
