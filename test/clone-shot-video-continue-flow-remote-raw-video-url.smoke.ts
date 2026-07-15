import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-remote-raw-video-url-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  const downloadUrl = 'https://example.com/fake-remote-result.mp4'

  const project = await cloneRepo.upsertProject({
    id: 'remote-raw-video-url-project',
    createdAt: now,
    updatedAt: now,
    title: 'remote-raw-video-url-project',
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
          generatedTaskId: 'task_remote_raw',
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'failed_retryable',
        taskId: 'task_remote_raw',
        remoteStatus: 'succeeded',
        videoUrl: '',
        remoteRaw: {
          status: 'succeeded',
          url: downloadUrl,
        },
        updatedAt: now,
        error: '[retry_limit] waiting too long before local download',
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
  assert.notEqual(String(synced.status || ''), 'remote_running')

  const latest = await cloneRepo.getProject(project.id)
  const output = latest?.shotVideoOutputs?.find((item) => item.shotId === 'shot_1')
  const shot = latest?.blueprint?.shots?.find((item) => item.id === 'shot_1')
  assert.equal(String(output?.videoUrl || ''), downloadUrl)
  assert.ok(['remote_succeeded_pending_download', 'downloading', 'failed_retryable', 'done'].includes(String(output?.status || '')))
  assert.notEqual(String(shot?.status || ''), 'remote_running')
  console.log('clone shot video continue flow remote raw video url smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
