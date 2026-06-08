import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-force-late-old-task-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  const oldVideoPath = join(root, 'old_generated_clip.mp4')
  const newVideoPath = join(root, 'new_generated_clip.mp4')
  await writeFile(oldVideoPath, 'old-video')
  await writeFile(newVideoPath, 'new-video')

  const base = {
    id: 'force-regenerate-late-old-task-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'force-regenerate-late-old-task-project',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [{ id: 'shot_1', index: 0, status: 'done', generatedTaskId: 'veo_3_1:task_old', generatedClipPath: oldVideoPath }],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        taskId: 'veo_3_1:task_old',
        remoteStatus: 'succeeded',
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
  } as any

  await cloneRepo.upsertProject(base)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'submitting',
        taskId: undefined,
        previousTaskIds: ['veo_3_1:task_old'],
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
        submissionStartedAt: 2000,
        submissionLockedUntil: 5000,
        sourceEvent: 'force_regenerate_reset',
        updatedAt: 2000,
      },
    ],
  } as any)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'remote_running',
        taskId: 'veo_3_1:task_new',
        previousTaskIds: ['veo_3_1:task_old'],
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
        submissionStartedAt: 2100,
        submissionLockedUntil: 5100,
        sourceEvent: 'segment_submit_succeeded',
        updatedAt: 2100,
      },
    ],
  } as any)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        taskId: 'veo_3_1:task_old',
        remoteStatus: 'succeeded',
        videoPath: oldVideoPath,
        localPath: oldVideoPath,
        videoUrl: 'https://example.com/old.mp4',
        updatedAt: 2050,
        sourceEvent: 'late_old_worker',
      },
    ],
  } as any)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        taskId: 'veo_3_1:task_new',
        remoteStatus: 'succeeded',
        videoPath: newVideoPath,
        localPath: newVideoPath,
        videoUrl: 'https://example.com/new.mp4',
        previousTaskIds: ['veo_3_1:task_old'],
        completedAt: 2200,
        updatedAt: 2200,
        sourceEvent: 'new_worker',
      },
    ],
  } as any)

  await cloneRepo.upsertProject({
    id: base.id,
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        taskId: 'veo_3_1:task_old',
        remoteStatus: 'succeeded',
        videoPath: oldVideoPath,
        localPath: oldVideoPath,
        videoUrl: 'https://example.com/old.mp4',
        updatedAt: 2150,
        sourceEvent: 'late_old_worker_after_new_task',
      },
    ],
  } as any)

  const latest = await cloneRepo.getProject(base.id)
  const output = latest?.shotVideoOutputs?.[0]
  assert.equal(String(output?.taskId || ''), 'veo_3_1:task_new')
  assert.equal(String(output?.videoPath || ''), newVideoPath)
  assert.equal(String(output?.localPath || ''), newVideoPath)
  assert.equal(String(output?.videoUrl || ''), 'https://example.com/new.mp4')
  assert.equal(String(output?.status || ''), 'done')
  assert.ok((output?.previousTaskIds || []).includes('veo_3_1:task_old'))
  console.log('clone shot video force regenerate late old task does not win smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
