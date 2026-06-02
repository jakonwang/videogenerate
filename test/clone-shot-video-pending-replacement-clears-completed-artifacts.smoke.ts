import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-pending-replacement-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  const staleVideoPath = join(root, 'generated_clip.mp4')
  await writeFile(staleVideoPath, 'stale-video')

  await cloneRepo.upsertProject({
    id: 'pending-replacement-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'pending-replacement-project',
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
          id: 'shot_1',
          index: 0,
          status: 'done',
          generatedTaskId: 'veo_3_1-fast-4K:task_old',
          generatedClipPath: staleVideoPath,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        taskId: 'veo_3_1-fast-4K:task_old',
        remoteStatus: 'succeeded',
        videoUrl: 'https://example.com/old.mp4',
        videoPath: staleVideoPath,
        localPath: staleVideoPath,
        completedAt: Date.now(),
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

  const saved = await cloneRepo.upsertProject({
    id: 'pending-replacement-project',
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'submitting',
        taskId: 'veo_3_1-fast-4K:task_old',
        previousTaskIds: ['veo_3_1-fast-4K:task_old'],
        remoteStatus: 'created',
        remoteRaw: { status: 'queued' },
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
        completedAt: undefined,
        submissionStartedAt: Date.now(),
        submissionLockedUntil: Date.now() + 60000,
        updatedAt: Date.now(),
      },
    ],
  } as any)

  const output = saved.shotVideoOutputs?.find((item) => item.shotId === 'shot_1')
  assert.equal(String(output?.videoPath || ''), '')
  assert.equal(String(output?.localPath || ''), '')
  assert.equal(String(output?.videoUrl || ''), '')
  assert.equal(String(output?.completedAt || ''), '')
  console.log('clone shot video pending replacement clears completed artifacts smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
