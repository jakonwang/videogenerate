import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-latest-replacement-task-only-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  await cloneRepo.upsertProject({
    id: 'latest-replacement-task-only-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'latest-replacement-task-only-project',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [{ id: 'shot_1', index: 0, status: 'idle' }],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'submitting',
        taskId: 'task_new',
        previousTaskIds: ['task_old'],
        updatedAt: 2000,
        sourceEvent: 'task_replaced',
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
    id: 'latest-replacement-task-only-project',
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'remote_running',
        taskId: 'task_old',
        updatedAt: 1500,
        sourceEvent: 'stale_poll_result',
      },
    ],
  } as any)

  const saved = await cloneRepo.getProject('latest-replacement-task-only-project')
  const output = saved?.shotVideoOutputs?.[0]
  assert.equal(output?.taskId, 'task_new')
  assert.equal(output?.status, 'submitting')
  assert.equal(output?.sourceEvent, 'task_replaced')
  console.log('clone shot video latest replacement task only smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
