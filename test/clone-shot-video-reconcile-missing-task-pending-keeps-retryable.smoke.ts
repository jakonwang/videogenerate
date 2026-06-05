import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-missing-task-pending-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })
  const productRef = join(root, 'product-ref.png')
  await writeFile(productRef, 'stub')

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  await cloneRepo.upsertProject({
    id: 'missing-task-pending-project',
    createdAt: now,
    updatedAt: now,
    title: 'missing-task-pending-project',
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
          productReferenceImagePaths: [productRef],
          generatedTaskId: undefined,
        },
      ],
    },
    productReferenceImagePaths: [productRef],
    shotVideoOutputs: [
      {
        shotId: 'shot_2',
        segmentId: 'shot_2',
        index: 1,
        status: 'failed_terminal',
        provider: 'apifox_hub',
        model: 'veo3.1',
        remoteStatus: 'created',
        remoteRaw: { status: 'created' },
        sourceEvent: 'segment_submit_started',
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

  const result = await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: 'missing-task-pending-project' } as any)
  const latest = await cloneRepo.getProject('missing-task-pending-project')
  const output = latest?.shotVideoOutputs?.find((item) => item.shotId === 'shot_2')

  assert.ok(result?.results?.some((item: any) => item.shotId === 'shot_2' && item.status === 'failed_retryable'))
  assert.equal(String(output?.status || ''), 'failed_retryable')
  assert.match(String(output?.error || ''), /\[missing_task\]/)
  assert.equal(String(latest?.autoFlowStatus?.status || ''), 'running')
  assert.equal(String(latest?.autoFlowStatus?.currentStage || ''), 'storyboard_videos')
  console.log('clone shot video reconcile missing task pending keeps retryable smoke test passed')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
