import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-hermes-platform-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { hermesPlatformFormatters } = await import('../src/main/modules/live-photo/hermesPlatformFormatters')
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
  })

  async function waitForSessionCompleted(
    hermesLivePhotoService: Awaited<typeof import('../src/main/modules/live-photo/hermes')>['hermesLivePhotoService'],
    sessionId: string,
    timeoutMs = 15000,
  ) {
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
    const refImage = path.join(assetsDir, 'reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(refImage, 'reference-image', 'utf-8')

    const product = await productsRepo.upsert({
      name: 'Formatter Demo Product',
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

    const feishuStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-1',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    assert.equal(feishuStart.ok, true)
    assert.equal(feishuStart.actions[0]?.type, 'product_options')
    assert.equal(feishuStart.replies[0]?.msg_type, 'text')
    const feishuReplyContent = JSON.parse(String(feishuStart.replies[0]?.content || '{}'))
    assert.ok(String(feishuReplyContent.text || '').length > 0)
    assert.ok(String(feishuReplyContent.text || '').length > 0)
    assert.match(String(feishuReplyContent.text || ''), /1\.\s+/)
    const sessionId = String((feishuStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(sessionId)

    const feishuNamedStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-named',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    assert.equal(feishuNamedStart.ok, true)
    const feishuNamedSelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-named',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: product.name,
          }),
        },
      },
    })
    assert.equal(feishuNamedSelect.ok, true)
    assert.equal(feishuNamedSelect.replies[0]?.msg_type, 'text')
    assert.equal(String((feishuNamedSelect.actions[0] as any)?.sessionId || '').trim().length > 0, true)
    const feishuNamedReply = JSON.parse(String(feishuNamedSelect.replies[0]?.content || '{}'))
    assert.ok(String(feishuNamedReply.text || '').length > 0)

    const feishuSelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
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
    assert.equal(feishuSelect.ok, true)
    assert.equal(feishuSelect.replies[0]?.msg_type, 'text')
    assert.equal(String((feishuSelect.actions[0] as any)?.sessionId || '').trim().length > 0, true)
    const feishuSelectReply = JSON.parse(String(feishuSelect.replies[0]?.content || '{}'))
    assert.ok(String(feishuSelectReply.text || '').length > 0)

    const feishuProgressReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-1',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'progress',
          }),
        },
      },
    })
    const feishuProgressText = JSON.parse(String(feishuProgressReply.replies[0]?.content || '{}'))
    assert.ok(String(feishuProgressText.text || '').length > 0)

    const genericLivePhotoTextReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-generic-live-photo',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'I want to make a live photo',
          }),
        },
      },
    })
    assert.equal(genericLivePhotoTextReply.ok, true)
    assert.equal(genericLivePhotoTextReply.actions[0]?.type, 'text')
    const genericLivePhotoText = JSON.parse(String(genericLivePhotoTextReply.replies[0]?.content || '{}'))
    assert.match(String(genericLivePhotoText.text || ''), /参考图片|materials|unused live photo/i)

    const explicitProgressReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-1',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session=${sessionId} progress`,
          }),
        },
      },
    })
    const explicitProgressText = JSON.parse(String(explicitProgressReply.replies[0]?.content || '{}'))
    assert.ok(String(explicitProgressText.text || '').length > 0)

    const feishuExplicitSelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const explicitSessionId = String((feishuExplicitSelect.actions[0] as any)?.sessionId || '').trim()
    assert.ok(explicitSessionId)
    const explicitSelected = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session=${explicitSessionId} product=${product.id}`,
          }),
        },
      },
    })
    assert.equal(explicitSelected.ok, true)
    assert.equal(explicitSelected.replies[0]?.msg_type, 'text')

    const explicitHelpReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session=${explicitSessionId} help`,
          }),
        },
      },
    })
    const explicitHelpText = JSON.parse(String(explicitHelpReply.replies[0]?.content || '{}'))
    assert.ok(String(explicitHelpText.text || '').length > 0)

    const explicitFullWidthProgressReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session：${explicitSessionId}\nprogress`,
          }),
        },
      },
    })
    const explicitFullWidthProgressText = JSON.parse(String(explicitFullWidthProgressReply.replies[0]?.content || '{}'))
    assert.ok(String(explicitFullWidthProgressText.text || '').length > 0)

    const explicitFullWidthProductSelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2b',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const explicitFullWidthSessionId = String((explicitFullWidthProductSelect.actions[0] as any)?.sessionId || '').trim()
    assert.ok(explicitFullWidthSessionId)
    const explicitFullWidthProductReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2b',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session＝${explicitFullWidthSessionId} product：${product.id}`,
          }),
        },
      },
    })
    assert.equal(explicitFullWidthProductReply.ok, true)
    assert.equal(explicitFullWidthProductReply.replies[0]?.msg_type, 'text')

    const explicitNamedProductStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2c',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const explicitNamedProductSessionId = String((explicitNamedProductStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(explicitNamedProductSessionId)
    const explicitNamedProductReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2c',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session：${explicitNamedProductSessionId}\nproduct：${product.name}`,
          }),
        },
      },
    })
    assert.equal(explicitNamedProductReply.ok, true)
    assert.equal(explicitNamedProductReply.replies[0]?.msg_type, 'text')

    const explicitChineseLabelStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2d',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const explicitChineseLabelSessionId = String((explicitChineseLabelStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(explicitChineseLabelSessionId)
    const explicitChineseLabelReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2d',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `会话：${explicitChineseLabelSessionId}\n商品：${product.name}`,
          }),
        },
      },
    })
    assert.equal(explicitChineseLabelReply.ok, true)
    assert.equal(explicitChineseLabelReply.replies[0]?.msg_type, 'text')

    const explicitChineseSameLineStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2e',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const explicitChineseSameLineSessionId = String((explicitChineseSameLineStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(explicitChineseSameLineSessionId)
    const explicitChineseSameLineReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2e',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `会话：${explicitChineseSameLineSessionId} 商品：${product.name}`,
          }),
        },
      },
    })
    assert.equal(explicitChineseSameLineReply.ok, true)
    assert.equal(explicitChineseSameLineReply.replies[0]?.msg_type, 'text')

    const explicitChineseSameLineExtraIntentStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2f',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const explicitChineseSameLineExtraIntentSessionId = String(
      (explicitChineseSameLineExtraIntentStart.actions[0] as any)?.sessionId || '',
    ).trim()
    assert.ok(explicitChineseSameLineExtraIntentSessionId)
    const explicitChineseSameLineExtraIntentReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-2f',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `会话：${explicitChineseSameLineExtraIntentSessionId} 商品：${product.name} progress`,
          }),
        },
      },
    })
    assert.equal(explicitChineseSameLineExtraIntentReply.ok, true)
    assert.equal(explicitChineseSameLineExtraIntentReply.replies[0]?.msg_type, 'text')

    const feishuMaterialStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-material',
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
    assert.equal(feishuMaterialStart.ok, true)
    assert.equal(feishuMaterialStart.actions[0]?.type, 'product_options')
    const feishuMaterialReply = JSON.parse(String(feishuMaterialStart.replies[0]?.content || '{}'))
    assert.ok(String(feishuMaterialReply.text || '').length > 0)
    assert.ok(String(feishuMaterialReply.text || '').length > 0)

    const feishuDeliveryStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-delivery',
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
    assert.equal(feishuDeliveryStart.ok, true)
    assert.equal(feishuDeliveryStart.actions[0]?.type, 'product_options')
    const feishuDeliveryReply = JSON.parse(String(feishuDeliveryStart.replies[0]?.content || '{}'))
    assert.ok(String(feishuDeliveryReply.text || '').length > 0)
    assert.ok(String(feishuDeliveryReply.text || '').length > 0)

    const feishuRestartStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-restart',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const feishuRestartSessionId = String((feishuRestartStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(feishuRestartSessionId)
    const feishuRestartReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-restart',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: '重新开始',
          }),
        },
      },
    })
    const feishuRestartText = JSON.parse(String(feishuRestartReply.replies[0]?.content || '{}'))
    assert.ok(String(feishuRestartText.text || '').length > 0)
    const { hermesLivePhotoService } = await import('../src/main/modules/live-photo/hermes')
    const feishuRestartClosed = await hermesLivePhotoService.getSessionStatus(feishuRestartSessionId)
    assert.ok(feishuRestartClosed.session.closedAt)
    const feishuClosedExplicitReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-restart',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session=${feishuRestartSessionId} 1`,
          }),
        },
      },
    })
    const feishuClosedExplicitText = JSON.parse(String(feishuClosedExplicitReply.replies[0]?.content || '{}'))
    assert.ok(String(feishuClosedExplicitText.text || '').length > 0)

    const feishuChangeProductStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-change-product',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const feishuChangeProductSessionId = String((feishuChangeProductStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(feishuChangeProductSessionId)
    const feishuChangeProductReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-change-product',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: '换商品',
          }),
        },
      },
    })
    assert.equal(feishuChangeProductReply.actions[0]?.type, 'product_options')
    const feishuChangeProductLatest = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-change-product',
    })
    assert.equal(feishuChangeProductLatest?.selectionMode, 'product')
    assert.equal(feishuChangeProductLatest?.status, 'awaiting_product')
    assert.notEqual(feishuChangeProductLatest?.id, feishuChangeProductSessionId)
    const feishuChangeProductClosed = await hermesLivePhotoService.getSessionStatus(feishuChangeProductSessionId)
    assert.ok(feishuChangeProductClosed.session.closedAt)

    const feishuSwitchStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-switch-mode',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const feishuSwitchSessionId = String((feishuSwitchStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(feishuSwitchSessionId)
    const feishuSwitchReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-switch-mode',
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
    assert.equal(feishuSwitchReply.actions[0]?.type, 'product_options')
    const feishuSwitchLatest = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-switch-mode',
    })
    assert.equal(feishuSwitchLatest?.selectionMode, 'material')
    assert.equal(feishuSwitchLatest?.status, 'awaiting_product')
    const feishuSwitchClosed = await hermesLivePhotoService.getSessionStatus(feishuSwitchSessionId)
    assert.ok(feishuSwitchClosed.session.closedAt)

    const officialModeSwitchStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-official-switch',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const officialModeSwitchSessionId = String((officialModeSwitchStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(officialModeSwitchSessionId)
    const officialModeSwitchSelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-official-switch',
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
    const officialModeSwitchSelectText = JSON.parse(String(officialModeSwitchSelect.replies[0]?.content || '{}'))
    assert.ok(String(officialModeSwitchSelectText.text || '').length > 0)
    const officialModeSwitchReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-official-switch',
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
    assert.equal(officialModeSwitchReply.actions[0]?.type, 'product_options')
    const officialModeSwitchClosed = await hermesLivePhotoService.getSessionStatus(officialModeSwitchSessionId)
    assert.ok(officialModeSwitchClosed.session.closedAt)
    const officialModeSwitchLatest = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-official-switch',
    })
    assert.equal(officialModeSwitchLatest?.selectionMode, 'material')
    assert.equal(officialModeSwitchLatest?.status, 'awaiting_product')

    const crossFlowDeliveryStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-cross-flow',
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
    assert.equal(crossFlowDeliveryStart.ok, true)
    assert.equal(crossFlowDeliveryStart.actions[0]?.type, 'product_options')

    const crossFlowDeliverySelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-cross-flow',
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
    const crossFlowDeliverySelectReply = JSON.parse(String(crossFlowDeliverySelect.replies[0]?.content || '{}'))
    assert.ok(String(crossFlowDeliverySelectReply.text || '').length > 0)

    const crossFlowGenerationStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-cross-flow',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    assert.equal(crossFlowGenerationStart.ok, true)
    assert.equal(crossFlowGenerationStart.actions[0]?.type, 'product_options')

    const crossFlowGenerationSelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-cross-flow',
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
    const crossFlowGenerationReply = JSON.parse(String(crossFlowGenerationSelect.replies[0]?.content || '{}'))
    const crossFlowLatestSession = await hermesLivePhotoService.getLatestSession({
      channel: 'feishu',
      userId: 'feishu-user-cross-flow',
    })
    assert.equal(crossFlowLatestSession?.selectionMode, 'product')
    assert.equal(crossFlowLatestSession?.status, 'processing')

    const crossFlowHelpReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-cross-flow',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'help',
          }),
        },
      },
    })
    const crossFlowHelpText = JSON.parse(String(crossFlowHelpReply.replies[0]?.content || '{}'))
    assert.ok(String(crossFlowHelpText.text || '').length > 0)

    const explicitSendFinalStart = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-send-final',
          },
        },
        message: {
          message_type: 'image',
          content: JSON.stringify({
            image_paths: [refImage],
          }),
        },
      },
    })
    const explicitSendFinalSessionId = String((explicitSendFinalStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(explicitSendFinalSessionId)
    const explicitSendFinalSelect = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-send-final',
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
    const explicitSendFinalSelectText = JSON.parse(String(explicitSendFinalSelect.replies[0]?.content || '{}'))
    assert.ok(String(explicitSendFinalSelectText.text || '').length > 0)
    await waitForSessionCompleted(hermesLivePhotoService, explicitSendFinalSessionId)
    const explicitSendFinalReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-send-final',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: `session：${explicitSendFinalSessionId}\n发送成品`,
          }),
        },
      },
    })
    assert.equal(explicitSendFinalReply.ok, true)
    assert.equal(explicitSendFinalReply.actions[0]?.type, 'video')
    assert.equal(String((explicitSendFinalReply.actions[0] as any)?.sessionId || '').trim(), explicitSendFinalSessionId)

    const noSessionReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-missing',
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
    assert.equal(noSessionReply.ok, true)
    const noSessionText = JSON.parse(String(noSessionReply.replies[0]?.content || '{}'))
    assert.ok(String(noSessionText.text || '').length > 0)

    const noSessionHelpReply = await hermesPlatformFormatters.handleFeishuOfficialEvent({
      event: {
        sender: {
          sender_id: {
            open_id: 'feishu-user-missing-help',
          },
        },
        message: {
          message_type: 'text',
          content: JSON.stringify({
            text: 'help',
          }),
        },
      },
    })
    const noSessionHelpText = JSON.parse(String(noSessionHelpReply.replies[0]?.content || '{}'))
    assert.ok(String(noSessionHelpText.text || '').length > 0)

    const wecomStart = await hermesPlatformFormatters.handleWecomOfficialEvent({
      FromUserName: 'wecom-user-1',
      MsgType: 'image',
      PicUrl: refImage,
    })
    assert.equal(wecomStart.ok, true)
    assert.equal(wecomStart.actions[0]?.type, 'product_options')
    assert.equal(wecomStart.replies[0]?.msgtype, 'text')
    assert.ok(String((wecomStart.replies[0] as any)?.text?.content || '').length > 0)

    console.log('live photo hermes platform formatter smoke test passed')
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

