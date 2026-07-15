import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

type ReplayStep = {
  id: string
  path: string
  body: Record<string, unknown>
  expectActionType?: string
  expectReplyType?: string
  captureSessionAs?: string
}

type ReplayFixture = {
  name: string
  steps: ReplayStep[]
}

function substituteTokens(value: unknown, tokens: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{([a-z0-9_:-]+)\}\}/gi, (_, key: string) => String(tokens[key] || ''))
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteTokens(item, tokens))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, substituteTokens(item, tokens)]),
    )
  }
  return value
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-hermes-replay-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const { productImageMaterialsRepo } = await import('../src/main/modules/product-image-materials/repo')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { hermesMediaIngressService } = await import('../src/main/modules/live-photo/hermesMediaIngress')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  const { hermesLivePhotoService } = await import('../src/main/modules/live-photo/hermes')
  const { handleWebApiRequest } = await import('../src/main/modules/web-platform/webApiRouter')

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

  hermesMediaIngressService.setTestDependencies({
    fetch: (async (input: any) => {
      const url = String(input || '')
      if (url.includes('/im/v1/messages/')) {
        return new Response(Buffer.from('feishu-image-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      }
      return new Response(JSON.stringify({ access_token: 'mock-token', tenant_access_token: 'tenant-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as any,
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

  let server: http.Server | null = null

  try {
    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
      videoProviderPrimary: 'grsai',
      grsaiApiKey: 'test-grsai-key',
      grsaiVideoModel: 'grok-video-3',
    } as any)

    const fixtureDir = path.join(root, 'fixtures')
    await mkdir(fixtureDir, { recursive: true })
    const productImage = path.join(fixtureDir, 'product.jpg')
    const materialImage = path.join(fixtureDir, 'material-choice.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(materialImage, 'material-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'Replay Product',
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

    await productImageMaterialsRepo.upsertMaterial({
      id: 'replay-material-choice',
      userId: 'desktop-local',
      batchId: 'replay-batch-1',
      category: 'ring',
      sourceVideoPath: path.join(fixtureDir, 'replay-source.mp4'),
      sourceVideoName: 'replay-source.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.1,
      localImagePath: materialImage,
      qiniuUrl: 'https://example.com/replay-material-choice.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const reusableDeliveryItem = await livePhotoService.enqueueReferenceItems({
      referenceImagePaths: [productImage],
      productId: product.id,
      motionTemplate: 'push_in',
    })
    const reusableDeliveryPath = path.join(fixtureDir, 'replay-delivery.mp4')
    await writeFile(reusableDeliveryPath, 'replay-delivery', 'utf-8')
    await livePhotoRepo.upsert({
      ...(reusableDeliveryItem as any),
      packagingStatus: 'completed',
      previewVideoPath: reusableDeliveryPath,
      livePhotoVideoPath: reusableDeliveryPath,
      generatedVideoPath: reusableDeliveryPath,
      hermesDeliveryUsedAt: undefined,
      usageStatus: 'unused',
      updatedAt: Date.now(),
    } as any)

    server = http.createServer((req, res) => {
      void handleWebApiRequest(req, res)
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Failed to bind replay smoke server')
    const baseUrl = `http://127.0.0.1:${address.port}`

    const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'hermes-live-photo', 'feishu-live-photo-replay.json')
    const fixture = JSON.parse(await readFile(fixturePath, 'utf-8')) as ReplayFixture
    const tokens: Record<string, string> = {}

    for (const step of fixture.steps) {
      const requestBody = substituteTokens(step.body, tokens)
      const response = await fetch(`${baseUrl}${step.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(requestBody),
      })
      const payload = (await response.json()) as any
      assert.equal(payload?.ok, true, `step ${step.id} should succeed`)
      if (step.expectActionType) {
        assert.equal(payload?.actions?.[0]?.type, step.expectActionType, `step ${step.id} action type mismatch`)
      }
      if (step.expectReplyType) {
        assert.equal(payload?.replies?.[0]?.msg_type, step.expectReplyType, `step ${step.id} reply type mismatch`)
      }
      if (step.captureSessionAs) {
        const sessionId = String(payload?.actions?.[0]?.sessionId || '').trim()
        assert.ok(sessionId, `step ${step.id} should expose sessionId`)
        tokens[step.captureSessionAs] = sessionId
      }
    }

    const startSessionId = String(tokens.start_session || '').trim()
    const materialsSessionId = String(tokens.materials_session || '').trim()
    const deliverySessionId = String(tokens.delivery_session || '').trim()
    assert.ok(startSessionId)
    assert.ok(materialsSessionId)
    assert.ok(deliverySessionId)

    const startSession = await hermesLivePhotoService.getSessionStatus(startSessionId)
    const materialSession = await hermesLivePhotoService.getSessionStatus(materialsSessionId)
    const deliverySession = await hermesLivePhotoService.getSessionStatus(deliverySessionId)
    assert.ok(startSession.session.closedAt)
    assert.ok(materialSession.session.closedAt)
    assert.ok(deliverySession.session.closedAt)

    const latestSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-replay-user-1',
    })
    assert.equal(latestSession, null)

    console.log(`live photo hermes replay smoke test passed (${fixture.name})`)
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    }
    await waitForAutoFlowIdle().catch(() => undefined)
    livePhotoService.resetTestDependencies()
    hermesMediaIngressService.resetTestDependencies()
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
