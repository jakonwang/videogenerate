import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-hermes-e2e-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { hermesPlatformFormatters } = await import('../src/main/modules/live-photo/hermesPlatformFormatters')
  const { hermesMediaIngressService } = await import('../src/main/modules/live-photo/hermesMediaIngress')
  const { hermesDeliveryService } = await import('../src/main/modules/live-photo/hermesDelivery')
  const { hermesLivePhotoService } = await import('../src/main/modules/live-photo/hermes')
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

  hermesMediaIngressService.setTestDependencies({
    fetch: (async (input: any) => {
      const url = String(input || '')
      if (url.includes('/im/v1/messages/')) {
        return new Response(Buffer.from('feishu-image-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      }
      if (url.includes('/cgi-bin/media/get')) {
        return new Response(Buffer.from('wecom-image-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      }
      return new Response(JSON.stringify({ access_token: 'mock-token', tenant_access_token: 'mock-tenant-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as any,
  })

  const deliveryCalls: string[] = []
  hermesDeliveryService.setTestDependencies({
    fetch: (async (input: any) => {
      const url = String(input || '')
      deliveryCalls.push(url)
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return new Response(JSON.stringify({ tenant_access_token: 'tenant-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/im/v1/files')) {
        return new Response(JSON.stringify({ data: { file_key: 'file-key-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/im/v1/messages')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    }) as any,
  })

  async function waitForSessionCompleted(sessionId: string, timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const result = await hermesLivePhotoService.getSessionStatus(sessionId)
      if (result.session.status === 'completed') return result
      if (result.session.status === 'failed') throw new Error(result.session.error || `Session ${sessionId} failed`)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out waiting for session ${sessionId}`)
  }

  async function waitForAutoFlowIdle(timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const queueState = livePhotoService.getAutoFlowQueueState()
      if ((queueState.activeCount || 0) === 0 && (queueState.pendingCount || 0) === 0) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for live photo auto flow to become idle')
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
    await writeFile(productImage, 'product-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'E2E Demo Product',
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

    const startResult = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      tenantAccessToken: 'tenant-token',
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-1',
          },
        },
        message: {
          message_id: 'om_xxx',
          message_type: 'image',
          content: JSON.stringify({
            image_key: 'img-key-1',
          }),
        },
      },
    })
    const sessionId = String((startResult.actions[0] as any)?.sessionId || '').trim()
    assert.ok(sessionId)

    await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-1',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: '1',
          }),
        },
      },
    })

    const completed = await waitForSessionCompleted(sessionId)
    assert.equal(completed.session.status, 'completed')
    assert.ok(String(completed.session.generatedVideoPath || '').trim())

    const finalActions = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-1',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session=${sessionId}`,
          }),
        },
      },
    })
    assert.equal(finalActions.actions[0]?.type, 'video')

    const deliveryResult = await hermesDeliveryService.sendFinalToFeishu({
      tenantAccessToken: 'tenant-token',
      receiveId: 'ou_xxx',
      receiveIdType: 'open_id',
      actions: finalActions.actions as any,
    })
    assert.equal(Array.isArray(deliveryResult), true)
    assert.ok(deliveryCalls.some((item) => item.includes('/im/v1/files')))
    assert.ok(deliveryCalls.some((item) => item.includes('/im/v1/messages')))

    console.log('live photo hermes e2e sim smoke test passed')
  } finally {
    await waitForAutoFlowIdle().catch(() => undefined)
    livePhotoService.resetTestDependencies()
    hermesMediaIngressService.resetTestDependencies()
    hermesDeliveryService.resetTestDependencies()
    closeLivePhotoSqlite()
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
