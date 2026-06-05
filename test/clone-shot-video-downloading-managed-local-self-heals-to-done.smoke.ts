import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-downloading-managed-local-done-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const projectId = 'downloading-managed-local-done-project'
  const shotId = 'shot_1'
  const managedVideoPath = join(process.env.VIDEOGENERATE_DATA_DIR, 'viral-clone', projectId, 'shots', shotId, 'generated_clip.mp4')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'viral-clone', projectId, 'shots', shotId), { recursive: true })
  await writeFile(managedVideoPath, 'real-video')

  const project = await cloneRepo.upsertProject({
    id: projectId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
          generatedTaskId: 'veo3.1:task_done',
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId,
        segmentId: shotId,
        index: 0,
        status: 'downloading',
        taskId: 'veo3.1:task_done',
        remoteStatus: 'succeeded',
        videoUrl: 'https://example.com/video.mp4',
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
  assert.equal(String(result?.status || ''), 'done')

  const latest = await cloneRepo.getProject(project.id)
  const output = latest?.shotVideoOutputs?.[0]
  const shot = latest?.blueprint?.shots?.[0]
  assert.equal(String(output?.status || ''), 'done')
  assert.equal(String(output?.videoPath || ''), managedVideoPath)
  assert.equal(String(output?.localPath || ''), managedVideoPath)
  assert.equal(String(shot?.generatedClipPath || ''), managedVideoPath)
  console.log('clone shot video downloading managed local self heals to done smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
