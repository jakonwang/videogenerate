import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-late-regression-guard-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const localVideo = join(root, 'generated_clip.mp4')
  await writeFile(localVideo, 'video')

  const project = await cloneRepo.upsertProject({
    id: 'late-regression-guard-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'late-regression-guard-project',
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
          generatedTaskId: 'veo_3_1:task_new',
          generatedClipPath: localVideo,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        taskId: 'veo_3_1:task_new',
        videoPath: localVideo,
        localPath: localVideo,
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

  const synced = await cloneService.syncShotVideoTask({ cloneProjectId: project.id, shotId: 'shot_1' })
  assert.equal(String(synced.project?.shotVideoOutputs?.[0]?.status || ''), 'done')
  assert.equal(String(synced.project?.shotVideoOutputs?.[0]?.videoPath || ''), localVideo)
  console.log('clone shot video late regression guard smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
