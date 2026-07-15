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
  const { productImageMaterialsRepo } = await import('../src/main/modules/product-image-materials/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { hermesPlatformFormatters } = await import('../src/main/modules/live-photo/hermesPlatformFormatters')
  const { hermesMediaIngressService } = await import('../src/main/modules/live-photo/hermesMediaIngress')
  const { hermesDeliveryService } = await import('../src/main/modules/live-photo/hermesDelivery')
  const { hermesLivePhotoService } = await import('../src/main/modules/live-photo/hermes')
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
    await writeFile(productImage, 'product-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'E2E Demo Product',
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

    const materialImage = path.join(assetsDir, 'material-choice.jpg')
    await writeFile(materialImage, 'material-choice', 'utf-8')
    await productImageMaterialsRepo.upsertMaterial({
      id: 'e2e-material-choice',
      userId: 'desktop-local',
      batchId: 'e2e-batch-1',
      category: 'ring',
      sourceVideoPath: path.join(assetsDir, 'e2e-material-source.mp4'),
      sourceVideoName: 'e2e-material-source.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.2,
      localImagePath: materialImage,
      qiniuUrl: 'https://example.com/e2e-material-choice.jpg',
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
    const reusableDeliveryPath = path.join(assetsDir, 'e2e-delivery-live.mp4')
    await writeFile(reusableDeliveryPath, 'e2e-delivery-live', 'utf-8')
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

    const userAStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-a',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [productImage],
          }),
        },
      },
    })
    const userASessionId = String((userAStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(userASessionId)

    const userBStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-b',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [productImage],
          }),
        },
      },
    })
    const userBSessionId = String((userBStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(userBSessionId)
    assert.notEqual(userASessionId, userBSessionId)

    const userARestart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-a',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'restart',
          }),
        },
      },
    })
    const userARestartText = JSON.parse(String(userARestart.replies[0]?.content || '{}'))
    assert.ok(String(userARestartText.text || '').length > 0)
    const userAClosedSession = await hermesLivePhotoService.getSessionStatus(userASessionId)
    assert.ok(userAClosedSession.session.closedAt)

    const userAClosedExplicit = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-a',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session=${userASessionId} 1`,
          }),
        },
      },
    })
    const userAClosedExplicitText = JSON.parse(String(userAClosedExplicit.replies[0]?.content || '{}'))
    assert.ok(String(userAClosedExplicitText.text || '').length > 0)

    const userBContinue = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-b',
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
    const userBContinueText = JSON.parse(String(userBContinue.replies[0]?.content || '{}'))
    assert.ok(String(userBContinueText.text || '').length > 0)
    const userBLatest = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-b',
    })
    assert.equal(userBLatest?.id, userBSessionId)
    assert.equal(userBLatest?.status, 'processing')

    const chaosStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [productImage],
          }),
        },
      },
    })
    const chaosSessionStartId = String((chaosStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(chaosSessionStartId)

    const chaosSelectProduct = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
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
    const chaosSelectProductText = JSON.parse(String(chaosSelectProduct.replies[0]?.content || '{}'))
    assert.ok(String(chaosSelectProductText.text || '').length > 0)
    const chaosProcessing = await hermesLivePhotoService.getSessionStatus(chaosSessionStartId)
    assert.equal(chaosProcessing.session.status, 'processing')

    const chaosToMaterials = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'materials',
          }),
        },
      },
    })
    assert.equal(chaosToMaterials.actions[0]?.type, 'product_options')
    const chaosClosedProcessing = await hermesLivePhotoService.getSessionStatus(chaosSessionStartId)
    assert.ok(chaosClosedProcessing.session.closedAt)
    const chaosMaterialSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-chaos',
    })
    assert.equal(chaosMaterialSession?.selectionMode, 'material')
    assert.equal(chaosMaterialSession?.status, 'awaiting_product')

    const chaosMaterialProduct = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
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
    assert.equal(chaosMaterialProduct.actions[0]?.type, 'material_options')
    const chaosAwaitingMaterial = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-chaos',
    })
    assert.equal(chaosAwaitingMaterial?.status, 'awaiting_material')

    const chaosChangeProduct = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'change product',
          }),
        },
      },
    })
    assert.equal(chaosChangeProduct.actions[0]?.type, 'product_options')
    const chaosReselectedMaterialSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-chaos',
    })
    assert.equal(chaosReselectedMaterialSession?.selectionMode, 'material')
    assert.equal(chaosReselectedMaterialSession?.status, 'awaiting_product')
    assert.notEqual(chaosReselectedMaterialSession?.id, chaosAwaitingMaterial?.id)

    const chaosToDelivery = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'unused live photo',
          }),
        },
      },
    })
    assert.equal(chaosToDelivery.actions[0]?.type, 'product_options')
    const chaosDeliverySession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-chaos',
    })
    assert.equal(chaosDeliverySession?.selectionMode, 'delivery')
    assert.equal(chaosDeliverySession?.status, 'awaiting_product')

    const chaosDeliveryProduct = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
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
    const chaosDeliveryProductText = JSON.parse(String(chaosDeliveryProduct.replies[0]?.content || '{}'))
    assert.ok(String(chaosDeliveryProductText.text || '').length > 0)
    const chaosAwaitingDelivery = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-chaos',
    })
    assert.equal(chaosAwaitingDelivery?.status, 'awaiting_delivery_count')

    const chaosCancel = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'cancel',
          }),
        },
      },
    })
    const chaosCancelText = JSON.parse(String(chaosCancel.replies[0]?.content || '{}'))
    assert.ok(String(chaosCancelText.text || '').length > 0)
    const chaosClosedDelivery = await hermesLivePhotoService.getSessionStatus(String(chaosDeliverySession?.id || ''))
    assert.ok(chaosClosedDelivery.session.closedAt)
    const chaosLatestAfterCancel = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-chaos',
    })
    assert.equal(chaosLatestAfterCancel, null)

    const chaosClosedExplicit = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-chaos',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session=${chaosSessionStartId} 1`,
          }),
        },
      },
    })
    const chaosClosedExplicitText = JSON.parse(String(chaosClosedExplicit.replies[0]?.content || '{}'))
    assert.ok(String(chaosClosedExplicitText.text || '').length > 0)

    console.log('live photo hermes e2e sim smoke test passed')
  } finally {
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
