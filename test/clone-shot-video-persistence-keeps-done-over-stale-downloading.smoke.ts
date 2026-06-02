import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-persistence-keeps-done-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  const projectId = 'persistence-keeps-done-project'
  const shotId = 'shot_1'
  const localVideoPath = join(root, 'generated_clip.mp4')
  const taskId = 'veo_3_1-fast-4K:task_same'
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
          status: 'done',
          generatedTaskId: taskId,
          generatedClipPath: localVideoPath,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId,
        segmentId: shotId,
        index: 0,
        status: 'done',
        taskId,
        remoteStatus: 'succeeded',
        videoUrl: 'https://example.com/final.mp4',
        videoPath: localVideoPath,
        localPath: localVideoPath,
        completedAt: now,
        updatedAt: now,
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
    createdAt: now,
    updatedAt: now + 1,
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
          generatedTaskId: taskId,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId,
        segmentId: shotId,
        index: 0,
        status: 'downloading',
        taskId,
        remoteStatus: 'succeeded',
        videoUrl: 'https://example.com/final.mp4',
        updatedAt: now + 1,
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
  const output = saved?.shotVideoOutputs?.find((item) => item.shotId === shotId)

  assert.equal(String(output?.status || ''), 'done')
  assert.equal(String(output?.taskId || ''), taskId)
  assert.equal(String(output?.videoPath || ''), localVideoPath)
  assert.equal(String(output?.localPath || ''), localVideoPath)
  console.log('clone shot video persistence keeps done over stale downloading smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
