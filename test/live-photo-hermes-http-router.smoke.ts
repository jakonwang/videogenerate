import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-hermes-http-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const { productImageMaterialsRepo } = await import('../src/main/modules/product-image-materials/repo')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { hermesLivePhotoService } = await import('../src/main/modules/live-photo/hermes')
  const { hermesMediaIngressService } = await import('../src/main/modules/live-photo/hermesMediaIngress')
  const { hermesDeliveryService } = await import('../src/main/modules/live-photo/hermesDelivery')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
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
      if (url.includes('/im/v1/files')) {
        return new Response(JSON.stringify({ data: { file_key: 'file-key-http-1' } }), {
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
      return new Response(JSON.stringify({ tenant_access_token: 'tenant-token' }), {
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

  async function waitForSessionCompleted(baseUrl: string, sessionId: string, timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const response = await fetch(`${baseUrl}/hermes/live-photo/session/${encodeURIComponent(sessionId)}`)
      const payload = (await response.json()) as any
      if (payload?.session?.status === 'completed') return payload
      if (payload?.session?.status === 'failed') {
        throw new Error(String(payload?.session?.error || `Session ${sessionId} failed`).trim())
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out waiting for session ${sessionId}`)
  }

  async function waitForReplayCapture(timeoutMs = 10000) {
    const captureDir = path.join(root, 'hermes-live-photo-replay', 'feishu')
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const files = await readdir(captureDir)
        const jsonFiles = files.filter((item) => item.endsWith('.json'))
        if (jsonFiles.length) {
          const latestFile = jsonFiles.sort().at(-1)
          if (latestFile) {
            const content = JSON.parse(await readFile(path.join(captureDir, latestFile), 'utf-8')) as any
            return { captureDir, files: jsonFiles, content }
          }
        }
      } catch {
        // Wait until capture files are flushed.
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for Feishu replay capture output')
  }

  async function waitForReplayCaptureRoute(route: string, timeoutMs = 10000) {
    const capture = await waitForReplayCaptureKinds(['official_event', 'webhook', 'send_final'], timeoutMs)
    const matched = capture.contents.find((entry) => entry.payload?.route === route)
    if (!matched) {
      throw new Error(`Timed out waiting for Feishu replay capture route: ${route}`)
    }
    return {
      captureDir: path.join(root, 'hermes-live-photo-replay', 'feishu'),
      files: capture.files,
      content: matched.payload,
    }
  }

  async function waitForReplayCaptureKinds(expectedPrefixes: string[], timeoutMs = 10000) {
    const captureDir = path.join(root, 'hermes-live-photo-replay', 'feishu')
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const files = (await readdir(captureDir)).filter((item) => item.endsWith('.json'))
        const foundAll = expectedPrefixes.every((prefix) => files.some((item) => item.includes(`_${prefix}_`)))
        if (foundAll) {
          const contents = await Promise.all(
            files.map(async (file) => ({
              file,
              payload: JSON.parse(await readFile(path.join(captureDir, file), 'utf-8')) as any,
            })),
          )
          return { files, contents }
        }
      } catch {
        // Wait until capture files are flushed.
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out waiting for Feishu replay capture kinds: ${expectedPrefixes.join(', ')}`)
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

    const assetsDir = path.join(root, 'fixtures')
    await mkdir(assetsDir, { recursive: true })
    const productImage = path.join(assetsDir, 'product.jpg')
    const materialImage = path.join(assetsDir, 'material-choice.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(materialImage, 'material-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'HTTP Router Product',
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
      id: 'http-router-material-choice',
      userId: 'desktop-local',
      batchId: 'http-router-batch-1',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'http-router-source.mp4'),
      sourceVideoName: 'http-router-source.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.1,
      localImagePath: materialImage,
      qiniuUrl: 'https://example.com/http-router-material-choice.jpg',
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
    const reusableDeliveryPath = path.join(assetsDir, 'http-router-delivery.mp4')
    await writeFile(reusableDeliveryPath, 'http-router-delivery', 'utf-8')
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
    if (!address || typeof address === 'string') throw new Error('Failed to bind HTTP router smoke server')
    const baseUrl = `http://127.0.0.1:${address.port}`

    const startResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        tenantAccessToken: 'tenant-token',
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-1',
            },
          },
          message: {
            message_id: 'om_http_user_1_start',
            message_type: 'image',
            content: JSON.stringify({
              image_key: 'img-key-http-user-1',
            }),
          },
        },
      }),
    })
    const startPayload = (await startResponse.json()) as any
    assert.equal(startPayload?.ok, true)
    assert.equal(startPayload?.actions?.[0]?.type, 'product_options')
    const startSessionId = String(startPayload?.actions?.[0]?.sessionId || '').trim()
    assert.ok(startSessionId)

    const ingressImageContent = await fetch(`${baseUrl}/hermes/live-photo/session/${encodeURIComponent(startSessionId)}`)
    const ingressSessionPayload = (await ingressImageContent.json()) as any
    assert.equal(Array.isArray(ingressSessionPayload?.session?.referenceImagePaths), true)
    assert.equal(String(ingressSessionPayload?.session?.referenceImagePaths?.[0] || '').endsWith('img-key-http-user-1.jpg'), true)

    const restartResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-1',
            },
          },
          message: {
            message_type: 'text',
            content: JSON.stringify({
              text: 'restart',
            }),
          },
        },
      }),
    })
    const restartPayload = (await restartResponse.json()) as any
    assert.equal(restartPayload?.ok, true)
    assert.ok(String(JSON.parse(String(restartPayload?.replies?.[0]?.content || '{}'))?.text || '').length > 0)

    const closedExplicitResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-1',
            },
          },
          message: {
            message_type: 'text',
            content: JSON.stringify({
              text: `session=${startSessionId} 1`,
            }),
          },
        },
      }),
    })
    const closedExplicitPayload = (await closedExplicitResponse.json()) as any
    assert.equal(closedExplicitPayload?.ok, true)
    assert.ok(String(JSON.parse(String(closedExplicitPayload?.replies?.[0]?.content || '{}'))?.text || '').length > 0)

    const startResponse2 = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-1',
            },
          },
          message: {
            message_type: 'image',
            content: JSON.stringify({
              image_paths: [productImage],
            }),
          },
        },
      }),
    })
    const startPayload2 = (await startResponse2.json()) as any
    assert.equal(startPayload2?.ok, true)
    assert.equal(startPayload2?.actions?.[0]?.type, 'product_options')
    const startSessionId2 = String(startPayload2?.actions?.[0]?.sessionId || '').trim()
    assert.ok(startSessionId2)

    const selectResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-1',
            },
          },
          message: {
            message_type: 'text',
            content: JSON.stringify({
              text: '1',
            }),
          },
        },
      }),
    })
    const selectPayload = (await selectResponse.json()) as any
    assert.equal(selectPayload?.ok, true)
    assert.ok(String(JSON.parse(String(selectPayload?.replies?.[0]?.content || '{}'))?.text || '').length > 0)

    const materialsResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-1',
            },
          },
          message: {
            message_type: 'text',
            content: JSON.stringify({
              text: 'materials',
            }),
          },
        },
      }),
    })
    const materialsPayload = (await materialsResponse.json()) as any
    assert.equal(materialsPayload?.ok, true)
    assert.equal(materialsPayload?.actions?.[0]?.type, 'product_options')

    const webhookResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        userId: 'feishu-http-user-webhook-1',
        text: 'materials',
      }),
    })
    const webhookPayload = (await webhookResponse.json()) as any
    assert.equal(webhookPayload?.ok, true)
    assert.ok(String(webhookPayload?.actions?.[0]?.type || '').length > 0)

    const latestResponse = await fetch(`${baseUrl}/hermes/live-photo/session/latest?channel=feishu&userId=feishu-http-user-1`)
    const latestPayload = (await latestResponse.json()) as any
    assert.equal(latestPayload?.ok, true)
    assert.equal(latestPayload?.result?.session?.selectionMode, 'material')
    assert.equal(latestPayload?.result?.session?.status, 'awaiting_product')

    const closedSessionResponse = await fetch(`${baseUrl}/hermes/live-photo/session/${encodeURIComponent(startSessionId2)}`)
    const closedSessionPayload = (await closedSessionResponse.json()) as any
    assert.ok(closedSessionPayload?.session?.closedAt)

    const deliveryStartResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-2',
            },
          },
          message: {
            message_type: 'image',
            content: JSON.stringify({
              image_paths: [productImage],
            }),
          },
        },
      }),
    })
    const deliveryStartPayload = (await deliveryStartResponse.json()) as any
    const deliverySessionId = String(deliveryStartPayload?.actions?.[0]?.sessionId || '').trim()
    assert.ok(deliverySessionId)

    await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-2',
            },
          },
          message: {
            message_type: 'text',
            content: JSON.stringify({
              text: '1',
            }),
          },
        },
      }),
    })

    const completedPayload = await waitForSessionCompleted(baseUrl, deliverySessionId)
    assert.equal(completedPayload?.session?.status, 'completed')

    const sendFinalResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/send-final`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        sessionId: deliverySessionId,
        userId: 'feishu-http-user-2',
        receiveId: 'ou_http_user_2',
        receiveIdType: 'open_id',
        tenantAccessToken: 'tenant-token',
      }),
    })
    const sendFinalPayload = (await sendFinalResponse.json()) as any
    assert.equal(sendFinalPayload?.ok, true)
    assert.equal(sendFinalPayload?.session?.status, 'completed')
    assert.ok(sendFinalPayload?.session?.closedAt)
    assert.equal(sendFinalPayload?.session?.closeReason, 'final_sent')
    assert.ok(deliveryCalls.some((item) => item.includes('/im/v1/files')))
    assert.ok(deliveryCalls.some((item) => item.includes('/im/v1/messages')))

    const deliveryCallCountAfterFirstSend = deliveryCalls.length
    const sendFinalAgainResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/send-final`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        sessionId: deliverySessionId,
        userId: 'feishu-http-user-2',
        receiveId: 'ou_http_user_2',
        receiveIdType: 'open_id',
        tenantAccessToken: 'tenant-token',
      }),
    })
    const sendFinalAgainPayload = (await sendFinalAgainResponse.json()) as any
    assert.equal(sendFinalAgainPayload?.ok, true)
    assert.equal(sendFinalAgainPayload?.alreadySent, true)
    assert.equal(deliveryCalls.length, deliveryCallCountAfterFirstSend)

    const finalSentExplicitResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-2',
            },
          },
          message: {
            message_type: 'text',
            content: JSON.stringify({
              text: `session=${deliverySessionId} 1`,
            }),
          },
        },
      }),
    })
    const finalSentExplicitPayload = (await finalSentExplicitResponse.json()) as any
    assert.equal(finalSentExplicitPayload?.ok, true)
    const finalSentExplicitText = String(JSON.parse(String(finalSentExplicitPayload?.replies?.[0]?.content || '{}'))?.text || '')
    assert.match(finalSentExplicitText, /不会再重复发送旧成品/)

    const staleStartResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-3',
            },
          },
          message: {
            message_type: 'image',
            content: JSON.stringify({
              image_paths: [productImage],
            }),
          },
        },
      }),
    })
    const staleStartPayload = (await staleStartResponse.json()) as any
    const staleSessionId = String(staleStartPayload?.actions?.[0]?.sessionId || '').trim()
    assert.ok(staleSessionId)
    await fetch(`${baseUrl}/hermes/live-photo/feishu/official-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        event: {
          sender: {
            sender_id: {
              open_id: 'feishu-http-user-3',
            },
          },
          message: {
            message_type: 'text',
            content: JSON.stringify({
              text: '1',
            }),
          },
        },
      }),
    })
    const staleCompletedPayload = await waitForSessionCompleted(baseUrl, staleSessionId)
    assert.equal(staleCompletedPayload?.session?.status, 'completed')
    await hermesLivePhotoService.closeSession({
      sessionId: staleSessionId,
      reason: 'switch_to_product',
    })
    const deliveryCallCountBeforeClosedSkip = deliveryCalls.length
    const closedSendFinalResponse = await fetch(`${baseUrl}/hermes/live-photo/feishu/send-final`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        sessionId: staleSessionId,
        userId: 'feishu-http-user-3',
        receiveId: 'ou_http_user_3',
        receiveIdType: 'open_id',
        tenantAccessToken: 'tenant-token',
      }),
    })
    const closedSendFinalPayload = (await closedSendFinalResponse.json()) as any
    assert.equal(closedSendFinalPayload?.ok, true)
    assert.equal(closedSendFinalPayload?.skippedClosed, true)
    assert.equal(closedSendFinalPayload?.session?.closeReason, 'switch_to_product')
    assert.equal(deliveryCalls.length, deliveryCallCountBeforeClosedSkip)

    const replayCapture = await waitForReplayCaptureRoute('/hermes/live-photo/feishu/official-event')
    assert.ok(replayCapture.files.length >= 1)
    assert.equal(replayCapture.content?.route, '/hermes/live-photo/feishu/official-event')
    assert.ok(String(replayCapture.content?.userId || '').length > 0)
    assert.ok(String(replayCapture.content?.messageType || '').length > 0)
    assert.ok(Object.prototype.hasOwnProperty.call(replayCapture.content || {}, 'parsedSessionId'))
    assert.ok(Object.prototype.hasOwnProperty.call(replayCapture.content || {}, 'parsedProductText'))
    assert.ok(Object.prototype.hasOwnProperty.call(replayCapture.content || {}, 'inferredSelectionMode'))
    assert.equal(Array.isArray(replayCapture.content?.actions), true)
    assert.ok(
      replayCapture.files.some((item) => item.includes('feishu-http-user-1')) ||
        replayCapture.files.some((item) => item.includes('feishu-http-user-2')),
    )

    const captureKinds = await waitForReplayCaptureKinds(['official_event', 'webhook', 'send_final'])
    assert.ok(captureKinds.files.some((item) => item.includes('_webhook_')))
    assert.ok(captureKinds.files.some((item) => item.includes('_send_final_')))
    assert.ok(captureKinds.contents.some((entry) => entry.payload?.route === '/hermes/live-photo/feishu/webhook'))
    assert.ok(captureKinds.contents.some((entry) => entry.payload?.route === '/hermes/live-photo/feishu/send-final'))

    console.log('live photo hermes http router smoke test passed')
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    }
    await waitForAutoFlowIdle().catch(() => undefined)
    livePhotoService.resetTestDependencies()
    hermesMediaIngressService.resetTestDependencies()
    hermesDeliveryService.resetTestDependencies()
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
