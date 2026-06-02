import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-download-ready-status-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  const project = await cloneRepo.upsertProject({
    id: 'download-ready-status-project',
    createdAt: now,
    updatedAt: now,
    title: 'download-ready-status-project',
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
          status: 'generating',
          generatedTaskId: 'veo_3_1-fast-4K:task_ready',
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'remote_succeeded_pending_download',
        taskId: 'veo_3_1-fast-4K:task_ready',
        remoteStatus: 'succeeded',
        videoUrl: 'https://example.com/fake.mp4',
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

  const synced = await cloneService.syncShotVideoTask({ cloneProjectId: project.id, shotId: 'shot_1' })
  assert.notEqual(String(synced.status || ''), 'remote_succeeded_pending_download')
  console.log('clone shot video continue flow download ready status smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
