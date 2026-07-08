import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-apifox-live-photo-'))
  const originalFetch = globalThis.fetch
  const originalConsoleLog = console.log
  const logs: string[] = []
  let capturedCreateBody: any = null

  console.log = (...args: any[]) => {
    logs.push(
      args
        .map((item) => {
          if (typeof item === 'string') return item
          try {
            return JSON.stringify(item)
          } catch {
            return String(item)
          }
        })
        .join(' '),
    )
  }

  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input || '')
    if (url === 'https://upload.qiniup.com') {
      return new Response(JSON.stringify({ key: `uploaded/${Date.now()}.png` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url === 'https://gaorui.cc/v1/videos') {
      capturedCreateBody = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({ id: 'apifox_live_photo_branch_task', status: 'queued' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url === 'https://gaorui.cc/v1/videos/apifox_live_photo_branch_task') {
      return new Response(JSON.stringify({ id: 'apifox_live_photo_branch_task', status: 'completed', url: 'https://cdn.example.com/out.mp4' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url === 'https://cdn.example.com/out.mp4') {
      return new Response('mock-video', { status: 200 })
    }
    return await originalFetch(input, init)
  }) as typeof fetch

  try {
    const { generateShotVideoByProviderChain } = await import('../src/main/modules/clone/providers')

    const assetsDir = path.join(root, 'assets')
    await mkdir(assetsDir, { recursive: true })
    const stillPath = path.join(assetsDir, 'still.png')
    await writeFile(stillPath, 'still', 'utf-8')

    let caughtError: unknown = null
    try {
      await generateShotVideoByProviderChain({
        shot: {
        id: 'live-photo-apifox-branch',
        index: 0,
        purpose: 'solution',
        startSec: 0,
        endSec: 6,
        durationSec: 6,
        motion: 'zoom_in',
        replaceMode: 'ai_generate',
        productType: 'earrings',
          productReferenceImagePaths: [],
        productMainImage: stillPath,
        generatedFirstFramePath: stillPath,
        generatedLastFramePath: stillPath,
        scriptText: 'Live photo branch test.',
        scriptRole: 'show',
        visualDescription: 'Locked still only.',
        actionDescription: 'Almost static motion only.',
        cameraDescription: 'Extremely subtle near-static natural micro-movement only.',
        productFocus: 'Keep exact product identity.',
        generationPrompt:
          'PROVIDER INPUT ROLE LOCK:\nFRAME-TO-FRAME IDENTITY LOCK:\nUse ONLY one motion style:\n-> extremely subtle near-static natural micro-movement\nThe video should feel almost static.',
        scriptConfidence: 1,
        framing: 'closeup',
        cameraMovement: 'Extremely subtle near-static natural micro-movement only, with no push-in, no pull-back, no refocus, and no noticeable shake',
        action: 'Minimal camera motion only.',
        productVisibility: 'high',
        replacementMode: 'ai_generate',
        aiDifficulty: 'low',
        realismRisk: 'low',
        realismStyle: 'product_closeup',
        forceAi: true,
        locked: true,
        status: 'ready',
        visual: 'live photo motion clip',
        subtitleSuggestion: '',
        materialNeed: 'locked still frame',
        sourceMode: 'ai',
        uploadedAssetIds: [],
        aiEnabled: true,
        reviewStatus: 'pending',
        consistencyMode: 'strict',
        promptCompilerVersion: 'live-photo-v1',
        compiledPrompt:
          'PROVIDER INPUT ROLE LOCK:\nFRAME-TO-FRAME IDENTITY LOCK:\nUse ONLY one motion style:\n-> extremely subtle near-static natural micro-movement\nThe video should feel almost static.',
        compiledNegativePrompt: 'product redesign, strong shake',
        prompt: {
          positive:
            'PROVIDER INPUT ROLE LOCK:\nFRAME-TO-FRAME IDENTITY LOCK:\nUse ONLY one motion style:\n-> extremely subtle near-static natural micro-movement\nThe video should feel almost static.',
          negative: 'product redesign, strong shake',
          cameraMotion: 'Extremely subtle near-static natural micro-movement only, with no push-in, no pull-back, no refocus, and no noticeable shake',
          aspectRatio: '9:16',
        },
      } as any,
      outDir: path.join(root, 'out'),
      startFramePath: stillPath,
      endFramePath: stillPath,
      consistencyMode: 'hard',
      credentials: {
        apifoxHub: {
          enabled: true,
          apiKey: 'gaorui-key',
          baseUrl: 'https://gaorui.cc',
          videoProvider: 'gaorui',
          videoEndpointStyle: 'openai_video',
          textToVideoModel: 'veo_3_1',
          imageToVideoModel: 'veo_3_1-fl',
          startEndVideoModel: 'veo_3_1-fl',
          referenceVideoModel: 'veo_3_1-components',
          defaultPollIntervalMs: 5,
          defaultTimeoutMs: 50,
        },
        gaoruiHub: {
          enabled: true,
          apiKey: 'gaorui-key',
          baseUrl: 'https://gaorui.cc',
          videoProvider: 'gaorui',
          videoEndpointStyle: 'openai_video',
          textToVideoModel: 'veo_3_1',
          imageToVideoModel: 'veo_3_1-fl',
          startEndVideoModel: 'veo_3_1-fl',
          referenceVideoModel: 'veo_3_1-components',
          defaultPollIntervalMs: 5,
          defaultTimeoutMs: 50,
        },
        videoProviderPrimary: 'apifox_hub',
        videoApifoxHubProfile: 'gaorui',
        apifoxHubProfile: 'gaorui',
        imageApifoxHubProfile: 'vectorengine',
        chatApifoxHubProfile: 'vectorengine',
        qiniuAccessKey: 'test-ak',
        qiniuSecretKey: 'test-sk',
        qiniuBucket: 'test-bucket',
        qiniuDomain: 'https://cdn.example.com',
        qiniuUploadHost: 'https://upload.qiniup.com',
      } as any,
      chain: ['apifox_hub'],
      compiledPrompt:
        'PROVIDER INPUT ROLE LOCK:\nFRAME-TO-FRAME IDENTITY LOCK:\nUse ONLY one motion style:\n-> extremely subtle near-static natural micro-movement\nThe video should feel almost static.',
        compiledNegativePrompt: 'product redesign, strong shake',
      })
    } catch (error) {
      caughtError = error
    }

    assert.ok(caughtError, 'Expected mocked output download to fail during ffmpeg normalization')
    assert.match(String((caughtError as Error)?.message || caughtError || ''), /ffmpeg|Invalid data found/i)
    assert.ok(capturedCreateBody, 'Expected apifox live photo create request body')
    assert.equal(String(capturedCreateBody?.model || ''), 'veo_3_1-fl')
    assert.equal(Number(capturedCreateBody?.duration || 0), 6)
    assert.equal(Number(capturedCreateBody?.motion_strength || 0), 1)
    assert.equal(Number(capturedCreateBody?.weight || 0), 1)
    assert.ok(Array.isArray(capturedCreateBody?.images), 'Expected images array for reference video path')
    assert.equal(capturedCreateBody.images.length, 1)
    assert.ok(String(capturedCreateBody.images[0] || '').includes('cdn.example.com'))
    assert.match(String(capturedCreateBody?.prompt || ''), /FRAME-TO-FRAME IDENTITY LOCK:/i)
    assert.match(String(capturedCreateBody?.prompt || ''), /extremely subtle near-static natural micro-movement/i)
    assert.match(String(capturedCreateBody?.negative_prompt || ''), /product redesign/i)

    const debugLog = logs.find((line) => line.includes('[clone-debug] final-shot-video-prompts'))
    assert.ok(debugLog, 'Expected final-shot-video-prompts debug log')
    assert.match(debugLog || '', /"useDirectCompiledPrompt":true/i)

    console.log = originalConsoleLog
    console.log('clone apifox live photo reference branch smoke test passed')
  } finally {
    console.log = originalConsoleLog
    globalThis.fetch = originalFetch
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
