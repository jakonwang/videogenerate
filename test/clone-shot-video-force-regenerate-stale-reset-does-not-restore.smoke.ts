import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-force-reset-stale-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  const oldVideoPath = join(root, 'old_generated_clip.mp4')
  await writeFile(oldVideoPath, 'old-video')

  const base = {
    id: 'force-regenerate-stale-reset-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'force-regenerate-stale-reset-project',
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
        status: 'submitting',
        taskId: undefined,
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
        updatedAt: 1500,
        sourceEvent: 'stale_worker',
      },
    ],
  } as any)

  const latest = await cloneRepo.getProject(base.id)
  const output = latest?.shotVideoOutputs?.[0]
  assert.equal(String(output?.taskId || ''), '')
  assert.equal(String(output?.videoPath || ''), '')
  assert.equal(String(output?.localPath || ''), '')
  assert.equal(String(output?.videoUrl || ''), '')
  assert.equal(String(output?.status || ''), 'submitting')
  assert.equal(String(output?.sourceEvent || ''), 'force_regenerate_reset')
  assert.deepEqual(output?.previousTaskIds || [], ['veo_3_1:task_old'])
  console.log('clone shot video force regenerate stale reset does not restore smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
