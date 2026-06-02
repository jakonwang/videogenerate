import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-reconcile-submit-lock-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  await cloneRepo.upsertProject({
    id: 'submit-lock-project',
    createdAt: now,
    updatedAt: now,
    title: 'submit-lock-project',
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
          id: 'shot_2',
          index: 1,
          status: 'generating',
          generatedTaskId: undefined,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_2',
        segmentId: 'shot_2',
        index: 1,
        status: 'remote_running',
        provider: 'apifox_hub',
        model: 'veo3.1',
        requestCapability: 'video_start_end_to_video',
        endpointStyle: 'openai_video',
        remoteStatus: 'created',
        submissionFingerprint: 'fingerprint-1',
        submissionStartedAt: now - 5_000,
        submissionLockedUntil: now + 60_000,
        updatedAt: now,
      },
    ],
    autoFlowStatus: {
      enabled: true,
      targetStage: 'final_compose',
      status: 'running',
      currentStage: 'storyboard_videos',
      currentStageLabel: '自动生成分镜视频',
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

  const result = await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: 'submit-lock-project' } as any)
  const latest = await cloneRepo.getProject('submit-lock-project')
  const output = latest?.shotVideoOutputs?.find((item) => item.shotId === 'shot_2')

  assert.ok(result?.results?.some((item: any) => item.shotId === 'shot_2' && item.status === 'remote_running'))
  assert.equal(String(output?.status || ''), 'remote_running')
  assert.equal(String(output?.taskId || ''), '')
  assert.equal(String(latest?.lastErrorContext?.action || ''), '')
  console.log('clone shot video reconcile does not fail missing task during submit lock smoke test passed')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
