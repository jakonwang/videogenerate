import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-recover-task-handle-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  await cloneRepo.upsertProject({
    id: 'recover-task-handle-project',
    createdAt: now,
    updatedAt: now,
    title: 'recover-task-handle-project',
    archived: false,
    status: 'ready',
    runMode: 'auto',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [
        {
          id: 'shot_9',
          index: 1,
          status: 'generating',
          generatedTaskId: undefined,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_9',
        segmentId: 'shot_9',
        index: 1,
        status: 'remote_running',
        provider: 'apifox_hub',
        model: 'veo3.1',
        remoteStatus: 'processing',
        remoteRaw: {
          data: {
            record_id: 'recovered-record-id-001',
            status: 'processing',
          },
        },
        sourceEvent: 'segment_submit_started',
        updatedAt: now,
      },
    ],
    autoFlowStatus: {
      enabled: true,
      targetStage: 'final_compose',
      status: 'running',
      currentStage: 'storyboard_videos',
      currentStageLabel: 'auto storyboard videos',
      updatedAt: now,
      lastProgressAt: now,
      idleHeartbeatCount: 0,
      imageRetryLimit: 2,
      videoRetryLimit: 2,
    },
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

  const result = await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: 'recover-task-handle-project' } as any)
  const latest = await cloneRepo.getProject('recover-task-handle-project')
  const output = latest?.shotVideoOutputs?.find((item) => item.shotId === 'shot_9')
  const shot = latest?.blueprint?.shots?.find((item) => item.id === 'shot_9')

  assert.ok(result?.results?.some((item: any) => item.shotId === 'shot_9' && item.taskId === 'recovered-record-id-001'))
  assert.equal(String(output?.taskId || ''), 'recovered-record-id-001')
  assert.equal(String(shot?.generatedTaskId || ''), 'recovered-record-id-001')
  console.log('clone shot video reconcile recovers task handle from remote raw smoke test passed')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
