import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-persistence-concurrent-merge-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  const base = {
    id: 'concurrent-merge-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'concurrent-merge-project',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [
        { id: 'shot_1', index: 0, status: 'idle' },
        { id: 'shot_2', index: 1, status: 'idle' },
        { id: 'shot_5', index: 4, status: 'idle' },
      ],
    },
    shotVideoOutputs: [],
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
  } as any

  await cloneRepo.upsertProject(base)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      { shotId: 'shot_1', segmentId: 'shot_1', index: 0, status: 'remote_running', taskId: 'task_a', updatedAt: 1001, sourceEvent: 'worker_a' },
    ],
  } as any)
  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      { shotId: 'shot_2', segmentId: 'shot_2', index: 1, status: 'remote_running', taskId: 'task_b', updatedAt: 1002, sourceEvent: 'worker_b' },
    ],
  } as any)
  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      { shotId: 'shot_5', segmentId: 'shot_5', index: 4, status: 'remote_running', taskId: 'task_c', updatedAt: 1003, sourceEvent: 'worker_c' },
    ],
  } as any)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [],
  } as any)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      { shotId: 'shot_1', segmentId: 'shot_1', index: 0, status: 'submitting', taskId: 'task_old', updatedAt: 1000, sourceEvent: 'stale_worker' },
    ],
  } as any)

  const saved = await cloneRepo.getProject(base.id)
  const outputs = saved?.shotVideoOutputs || []
  assert.equal(outputs.length, 3)
  assert.equal(outputs.find((item) => item.shotId === 'shot_1')?.taskId, 'task_a')
  assert.equal(outputs.find((item) => item.shotId === 'shot_1')?.status, 'remote_running')
  assert.equal(outputs.find((item) => item.shotId === 'shot_2')?.taskId, 'task_b')
  assert.equal(outputs.find((item) => item.shotId === 'shot_5')?.taskId, 'task_c')
  console.log('clone shot video persistence concurrent merge smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
