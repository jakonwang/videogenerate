import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-batch-manual-sync-guard-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const projectId = 'batch-submit-manual-sync-late-old-task-guard-project'
  const shotId = 'shot_1'
  const oldVideoPath = join(root, 'old_generated_clip.mp4')
  const newVideoPath = join(root, 'new_generated_clip.mp4')
  await writeFile(oldVideoPath, 'old-video')
  await writeFile(newVideoPath, 'new-video')

  const fixtureVideoPath = resolve(
    'test',
    'automation_output',
    'user_request_afterfix2_20260411_132112',
    '鑷姩鍖栨祴璇曚骇鍝?鍚厤涔愭枃瀛?20260411_132113_鑷姩鍖栨祴璇曟ā鏉?鍚厤涔愭枃瀛?20260411_132113_1775888491921_0e6c0ee0.mp4',
  )
  const fixtureVideo = await readFile(fixtureVideoPath)
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    const url = String(input || '')
    if (url === 'https://example.com/new.mp4') {
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
            status: 'done',
            generatedTaskId: 'task_old',
            generatedClipPath: oldVideoPath,
          },
        ],
      },
      shotVideoOutputs: [
        {
          shotId,
          segmentId: shotId,
          index: 0,
          status: 'done',
          taskId: 'task_old',
          videoPath: oldVideoPath,
          localPath: oldVideoPath,
          videoUrl: 'https://example.com/old.mp4',
          updatedAt: 1000,
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

    await cloneRepo.upsertProject({
      id: projectId,
      shotVideoOutputs: [
        {
          shotId,
          segmentId: shotId,
          index: 0,
          status: 'remote_running',
          taskId: 'task_new',
          previousTaskIds: ['task_old'],
          videoPath: undefined,
          localPath: undefined,
          videoUrl: undefined,
          submissionStartedAt: 2000,
          submissionLockedUntil: 5000,
          updatedAt: 2000,
          sourceEvent: 'storyboard_video_batch_submit_started',
          provider: 'apifox_hub',
          model: 'veo3.1',
          remoteStatus: 'running',
        },
      ],
    } as any)

    await cloneRepo.upsertProject({
      id: projectId,
      shotVideoOutputs: [
        {
          shotId,
          segmentId: shotId,
          index: 0,
          status: 'remote_succeeded_pending_download',
          taskId: 'task_new',
          previousTaskIds: ['task_old'],
          videoUrl: 'https://example.com/new.mp4',
          remoteStatus: 'succeeded',
          remoteRaw: { status: 'succeeded', video_url: 'https://example.com/new.mp4' },
          updatedAt: 2100,
          sourceEvent: 'segment_submit_succeeded',
          provider: 'apifox_hub',
          model: 'veo3.1',
        },
      ],
    } as any)

    const synced = await cloneService.syncShotVideoTask({ cloneProjectId: projectId, shotId })
    const syncedOutput = synced.project?.shotVideoOutputs?.find((item: any) => item.shotId === shotId)
    assert.equal(String(syncedOutput?.taskId || ''), 'task_new')
    assert.equal(String(syncedOutput?.status || ''), 'done')

    await cloneRepo.upsertProject({
      id: projectId,
      shotVideoOutputs: [
        {
          shotId,
          segmentId: shotId,
          index: 0,
          status: 'done',
          taskId: 'task_old',
          videoPath: oldVideoPath,
          localPath: oldVideoPath,
          videoUrl: 'https://example.com/old.mp4',
          updatedAt: 2050,
          sourceEvent: 'late_old_batch_worker_after_manual_sync',
        },
      ],
    } as any)

    const latest = await cloneRepo.getProject(projectId)
    const output = latest?.shotVideoOutputs?.find((item) => item.shotId === shotId)
    assert.equal(String(output?.taskId || ''), 'task_new')
    assert.equal(String(output?.status || ''), 'done')
    assert.equal(String(output?.videoUrl || ''), 'https://example.com/new.mp4')
    assert.ok(String(output?.videoPath || '').includes('generated_clip.mp4'))
    assert.notEqual(String(output?.videoPath || ''), oldVideoPath)
    console.log('clone shot video batch submit manual sync late old task guard smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
