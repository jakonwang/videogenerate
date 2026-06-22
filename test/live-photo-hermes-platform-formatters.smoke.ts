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
    assert.match(String(feishuReplyContent.text || ''), /Please choose a product/i)
    assert.match(String(feishuReplyContent.text || ''), /1\.\s+/)
    const sessionId = String((feishuStart.actions[0] as any)?.sessionId || '').trim()
    assert.ok(sessionId)

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
    const feishuSelectReply = JSON.parse(String(feishuSelect.replies[0]?.content || '{}'))
    assert.match(String(feishuSelectReply.text || ''), /generation started/i)

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
    assert.match(String(noSessionText.text || ''), /send a reference image first/i)

    const wecomStart = await hermesPlatformFormatters.handleWecomOfficialEvent({
      FromUserName: 'wecom-user-1',
      MsgType: 'image',
      PicUrl: refImage,
    })
    assert.equal(wecomStart.ok, true)
    assert.equal(wecomStart.actions[0]?.type, 'product_options')
    assert.equal(wecomStart.replies[0]?.msgtype, 'text')
    assert.match(String((wecomStart.replies[0] as any)?.text?.content || ''), /Please choose a product/i)

    console.log('live photo hermes platform formatter smoke test passed')
  } finally {
    await waitForAutoFlowIdle().catch(() => undefined)
    livePhotoService.resetTestDependencies()
    closeLivePhotoSqlite()
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
