import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-created-without-task-binding-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  await cloneRepo.upsertProject({
    id: 'created-without-task-binding-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'created-without-task-binding-project',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [{ id: 'shot_3', index: 2, status: 'generating', generatedTaskId: 'veo3.1:task_keep' }],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_3',
        segmentId: 'shot_3',
        index: 2,
        status: 'remote_running',
        taskId: 'veo3.1:task_keep',
        provider: 'apifox_hub',
        model: 'veo3.1',
        remoteStatus: 'created',
        updatedAt: 1000,
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

  await cloneRepo.upsertProject({
    id: 'created-without-task-binding-project',
    shotVideoOutputs: [
      {
        shotId: 'shot_3',
        segmentId: 'shot_3',
        index: 2,
        status: 'remote_running',
        provider: 'apifox_hub',
        model: 'veo3.1',
        remoteStatus: 'created',
        updatedAt: 2000,
        sourceEvent: 'late_created_snapshot_without_task',
      },
    ],
  } as any)

  const saved = await cloneRepo.getProject('created-without-task-binding-project')
  const output = saved?.shotVideoOutputs?.find((item) => item.shotId === 'shot_3')
  const shot = saved?.blueprint?.shots?.find((item) => item.id === 'shot_3')
  assert.equal(output?.taskId, 'veo3.1:task_keep')
  assert.equal(output?.status, 'remote_running')
  assert.equal(shot?.generatedTaskId, 'veo3.1:task_keep')
  console.log('clone shot video created without task does not clear task binding smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
