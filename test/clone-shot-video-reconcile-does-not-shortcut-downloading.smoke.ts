import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-reconcile-downloading-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const staleLocalPath = join(root, 'generated_clip.mp4')
  await writeFile(staleLocalPath, 'stale-video')

  const project = await cloneRepo.upsertProject({
    id: 'reconcile-downloading-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'reconcile-downloading-project',
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
          generatedTaskId: 'veo_3_1-fast-4K:task_old',
          generatedClipPath: staleLocalPath,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'downloading',
        taskId: 'veo_3_1-fast-4K:task_old',
        remoteStatus: 'succeeded',
        videoUrl: 'https://example.com/fake.mp4',
        videoPath: staleLocalPath,
        localPath: staleLocalPath,
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

  const reconciled = await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: project.id } as any)
  const result = Array.isArray(reconciled?.results) ? reconciled.results[0] : null
  assert.ok(result)
  assert.notEqual(String(result?.status || ''), 'done')
  const latest = await cloneRepo.getProject(project.id)
  assert.notEqual(String(latest?.shotVideoOutputs?.[0]?.status || ''), 'done')
  console.log('clone shot video reconcile does not shortcut downloading smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
