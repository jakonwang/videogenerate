import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-sync-ignores-superseded-task-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const projectId = 'sync-ignores-superseded-task-project'
  const shotId = 'shot_1'
  const now = Date.now()

  await cloneRepo.upsertProject({
    id: projectId,
    createdAt: now,
    updatedAt: now,
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
          status: 'generating',
          generatedTaskId: 'task_new',
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId,
        segmentId: shotId,
        index: 0,
        status: 'remote_succeeded_pending_download',
        taskId: 'task_old',
        previousTaskIds: ['task_old'],
        videoUrl: 'https://example.com/old.mp4',
        remoteStatus: 'succeeded',
        remoteRaw: {
          status: 'succeeded',
          video_url: 'https://example.com/old.mp4',
        },
        updatedAt: now,
        sourceEvent: 'late_old_poll_result',
      },
      {
        shotId,
        segmentId: shotId,
        index: 0,
        status: 'remote_running',
        taskId: 'task_new',
        previousTaskIds: ['task_old'],
        remoteStatus: 'running',
        updatedAt: now + 1,
        sourceEvent: 'segment_submit_succeeded',
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

  const saved = await cloneRepo.getProject(projectId)
  const staleShot = {
    ...(saved?.blueprint?.shots?.find((item) => item.id === shotId) as any),
    generatedTaskId: 'task_old',
  }

  const result = await cloneService.syncShotVideoTask({
    cloneProjectId: projectId,
    shotId,
  } as any)

  const output = result.project?.shotVideoOutputs?.find((item: any) => item.shotId === shotId)
  const latest = await cloneRepo.getProject(projectId)
  const latestOutput = latest?.shotVideoOutputs?.find((item) => item.shotId === shotId)
  const latestShot = latest?.blueprint?.shots?.find((item) => item.id === shotId)

  assert.equal(String(output?.taskId || ''), 'task_new')
  assert.equal(String(latestOutput?.taskId || ''), 'task_new')
  assert.equal(String(latestShot?.generatedTaskId || ''), 'task_new')
  assert.ok(['remote_running', 'failed_retryable', 'remote_pending', 'downloading', 'remote_succeeded_pending_download'].includes(String(latestOutput?.status || '')))
  assert.equal(String(latestOutput?.videoUrl || ''), '')
  assert.equal(String(staleShot.generatedTaskId || ''), 'task_old')
  console.log('clone shot video sync ignores superseded task smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
