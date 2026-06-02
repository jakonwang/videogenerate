import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-task-binding-regression-guard-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  await cloneRepo.upsertProject({
    id: 'task-binding-regression-guard-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'task-binding-regression-guard-project',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [{ id: 'shot_2', index: 1, status: 'generating', generatedTaskId: 'veo3.1:task_keep' }],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_2',
        segmentId: 'shot_2',
        index: 1,
        status: 'remote_running',
        taskId: 'veo3.1:task_keep',
        provider: 'apifox_hub',
        model: 'veo3.1',
        remoteStatus: 'created',
        updatedAt: 1000,
        sourceEvent: 'task_submitted',
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
    id: 'task-binding-regression-guard-project',
    shotVideoOutputs: [
      {
        shotId: 'shot_2',
        segmentId: 'shot_2',
        index: 1,
        status: 'remote_running',
        provider: 'apifox_hub',
        model: 'veo3.1',
        updatedAt: 2000,
        sourceEvent: 'stale_running_without_task',
      },
    ],
  } as any)

  await cloneRepo.upsertProject({
    id: 'task-binding-regression-guard-project',
    shotVideoOutputs: [
      {
        shotId: 'shot_2',
        segmentId: 'shot_2',
        index: 1,
        status: 'failed_terminal',
        provider: 'apifox_hub',
        model: 'veo3.1',
        updatedAt: 3000,
        sourceEvent: 'stale_terminal_without_task',
      },
    ],
  } as any)

  const saved = await cloneRepo.getProject('task-binding-regression-guard-project')
  const output = saved?.shotVideoOutputs?.find((item) => item.shotId === 'shot_2')
  assert.equal(output?.taskId, 'veo3.1:task_keep')
  assert.equal(output?.status, 'remote_running')
  assert.equal(output?.sourceEvent, 'task_submitted')
  console.log('clone shot video task binding regression guard smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
