import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-done-queued-self-heal-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const staleLocalPath = join(root, 'generated_clip.mp4')
  await writeFile(staleLocalPath, 'stale-video')

  const project = await cloneRepo.upsertProject({
    id: 'done-queued-self-heal-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'done-queued-self-heal-project',
    archived: false,
    status: 'completed',
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
          generatedTaskId: 'veo_3_1-fast-4K:task_new',
          generatedClipPath: staleLocalPath,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        taskId: 'veo_3_1-fast-4K:task_new',
        remoteStatus: 'created',
        remoteRaw: {
          id: 'veo_3_1-fast-4K:task_new',
          status: 'queued',
        },
        videoUrl: 'https://example.com/fake.mp4',
        videoPath: staleLocalPath,
        localPath: staleLocalPath,
        previousTaskIds: ['veo_3_1-fast-4K:task_old'],
        submissionStartedAt: Date.now(),
        submissionLockedUntil: Date.now() + 60000,
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
  assert.notEqual(String(synced.project?.shotVideoOutputs?.[0]?.status || ''), 'done')
  assert.equal(String(synced.project?.shotVideoOutputs?.[0]?.videoPath || ''), '')
  assert.equal(String(synced.project?.blueprint?.shots?.[0]?.generatedClipPath || ''), '')
  console.log('clone shot video done with queued remote self heal smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
