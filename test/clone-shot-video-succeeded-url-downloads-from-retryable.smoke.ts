import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-succeeded-url-downloads-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const projectId = 'retryable-download-project'
  const shotId = 'shot_1'
  const fixtureVideoPath = resolve(
    'test',
    'automation_output',
    'user_request_afterfix2_20260411_132112',
    '自动化测试产品-含配乐文字-20260411_132113_自动化测试模板-含配乐文字-20260411_132113_1775888491921_0e6c0ee0.mp4',
  )
  const fixtureVideo = await readFile(fixtureVideoPath)
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    const url = String(input || '')
    if (url === 'https://example.com/final.mp4') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => fixtureVideo.buffer.slice(fixtureVideo.byteOffset, fixtureVideo.byteOffset + fixtureVideo.byteLength),
        text: async () => '',
        clone() {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => '',
            arrayBuffer: async () => fixtureVideo.buffer.slice(fixtureVideo.byteOffset, fixtureVideo.byteOffset + fixtureVideo.byteLength),
          }
        },
        headers: new Headers(),
      } as any
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as any

  try {
    await cloneRepo.upsertProject({
      id: projectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: projectId,
      archived: false,
      status: 'ready',
      runMode: 'rewrite',
      locale: 'zh-CN',
      strength: 'medium',
      referenceVideoPath: 'C:\\temp\\ref.mp4',
      referenceVideoName: 'ref.mp4',
      blueprint: {
        shots: [
          {
            id: shotId,
            index: 0,
            status: 'failed',
            generatedTaskId: 'veo_3_1-fast-4K:task_retryable',
          },
        ],
      },
      shotVideoOutputs: [
        {
          shotId,
          segmentId: shotId,
          index: 0,
          status: 'failed_retryable',
          taskId: 'veo_3_1-fast-4K:task_retryable',
          remoteStatus: 'succeeded',
          remoteRaw: {
            status: 'completed',
            metadata: {
              url: 'https://example.com/final.mp4',
              video_url: 'https://example.com/final.mp4',
            },
          },
          error: '本地等待超时，但远端可能已完成',
          updatedAt: Date.now(),
        },
      ],
      aiTasks: [],
      reviewDecisions: {},
      sessions: [],
      modelIdentityPacks: [],
      defaultGenerationPolicy: { qualityProfile: 'high', variantStrength: 'medium' },
      policy: {
        qualityPriority: 'high',
        fallbackChain: ['seedance', 'kling', 'grsai'],
        concurrency: 4,
        retries: 2,
        qualityGate: { enabled: true, minDurationRatio: 0.6, maxDurationRatio: 1.6, maxBlackFrameRatio: 0.45, minShortSide: 720, requireAudio: false },
      },
    } as any)

    const result = await cloneService.forceDownloadShotVideoResult({ cloneProjectId: projectId, shotId })
    if (String(result?.status || '') !== 'done') {
      console.log('DEBUG_RESULT', JSON.stringify(result, null, 2))
      const debugSaved = await cloneRepo.getProject(projectId)
      console.log('DEBUG_OUTPUT', JSON.stringify(debugSaved?.shotVideoOutputs?.find((item) => item.shotId === shotId) || null, null, 2))
    }
    assert.equal(String(result?.status || ''), 'done')
    assert.equal(Boolean(result?.synced), true)

    const saved = await cloneRepo.getProject(projectId)
    const output = saved?.shotVideoOutputs?.find((item) => item.shotId === shotId)
    assert.equal(String(output?.status || ''), 'done')
    assert.equal(String(output?.videoUrl || ''), 'https://example.com/final.mp4')
    assert.ok(String(output?.videoPath || '').includes('generated_clip.mp4'))
    console.log('clone shot video succeeded url downloads from retryable smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
