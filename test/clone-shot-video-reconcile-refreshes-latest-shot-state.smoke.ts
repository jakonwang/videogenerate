import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-reconcile-refreshes-latest-shot-state-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const projectId = 'reconcile-refreshes-latest-shot-state-project'
  const shotId = 'shot_2'
  const fixtureVideo = Buffer.from('fake-mp4-binary')
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    const url = String(input || '')
    if (url === 'https://example.com/reconcile-latest.mp4') {
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
    const now = Date.now()
    await cloneRepo.upsertProject({
      id: projectId,
      createdAt: now,
      updatedAt: now,
      title: projectId,
      archived: false,
      status: 'ready',
      runMode: 'auto',
      locale: 'zh-CN',
      strength: 'medium',
      referenceVideoPath: 'C:\\temp\\ref.mp4',
      referenceVideoName: 'ref.mp4',
      blueprint: {
        shots: [
          {
            id: shotId,
            index: 1,
            status: 'generating',
            generatedTaskId: 'veo3.1:task_latest',
          },
        ],
      },
      shotVideoOutputs: [
        {
          shotId,
          segmentId: shotId,
          index: 1,
          status: 'remote_succeeded_pending_download',
          taskId: 'veo3.1:task_latest',
          provider: 'apifox_hub',
          model: 'veo3.1',
          remoteStatus: 'succeeded',
          videoUrl: 'https://example.com/reconcile-latest.mp4',
          remoteRaw: {
            status: 'succeeded',
            video_url: 'https://example.com/reconcile-latest.mp4',
          },
          updatedAt: now,
        },
      ],
      autoFlowStatus: {
        enabled: true,
        targetStage: 'final_compose',
        status: 'running',
        currentStage: 'storyboard_videos',
        currentStageLabel: '自动生成分镜视频',
        updatedAt: now,
        lastProgressAt: now,
        idleHeartbeatCount: 0,
        imageRetryLimit: 2,
        videoRetryLimit: 2,
      },
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

    const staleProject = await cloneRepo.getProject(projectId)
    assert.ok(staleProject?.blueprint?.shots?.[0])
    ;(staleProject!.blueprint!.shots[0] as any).generatedTaskId = undefined

    const result = await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: projectId } as any)
    const output = result?.project?.shotVideoOutputs?.find((item: any) => item.shotId === shotId)
    const saved = await cloneRepo.getProject(projectId)
    const savedOutput = saved?.shotVideoOutputs?.find((item) => item.shotId === shotId)
    const savedShot = saved?.blueprint?.shots?.find((item) => item.id === shotId)

    assert.ok(['done', 'failed_retryable', 'downloading', 'remote_succeeded_pending_download'].includes(String(output?.status || '')))
    assert.ok(['done', 'failed_retryable', 'downloading', 'remote_succeeded_pending_download'].includes(String(savedOutput?.status || '')))
    assert.equal(String(savedOutput?.taskId || ''), 'veo3.1:task_latest')
    assert.equal(String(savedShot?.generatedTaskId || ''), 'veo3.1:task_latest')
    assert.equal(String(saved?.lastErrorContext?.action || ''), 'download_completed_segment_task')
    console.log('clone shot video reconcile refreshes latest shot state smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
