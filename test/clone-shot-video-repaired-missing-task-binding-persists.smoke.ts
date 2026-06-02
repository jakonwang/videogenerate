import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-repaired-binding-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const repoMod = await import('../src/main/modules/clone/repo')
  const cloneRepo = repoMod.cloneRepo ?? repoMod.default?.cloneRepo
  assert.ok(cloneRepo)

  const now = Date.now()
  await cloneRepo.upsertProject({
    id: 'repaired-missing-task-binding-project',
    createdAt: now,
    updatedAt: now,
    title: 'repaired-missing-task-binding-project',
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
          id: 'shot_4',
          index: 3,
          status: 'generating',
          generatedTaskId: 'veo_3_1-fast-4K:task_repaired',
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_4',
        segmentId: 'shot_4',
        index: 3,
        status: 'failed_retryable',
        taskId: 'veo_3_1-fast-4K:task_repaired',
        provider: 'VectorEngine',
        model: 'veo_3_1-fast-4K',
        remoteStatus: 'created',
        error: '[missing_task] repaired task id can continue polling',
        sourceEvent: 'segment_submit_started',
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

  const repaired = await cloneRepo.getProject('repaired-missing-task-binding-project')
  assert.ok(repaired)

  await cloneRepo.upsertProject({
    ...repaired!,
    updatedAt: now + 1,
    blueprint: {
      ...repaired!.blueprint,
      shots: [
        {
          ...repaired!.blueprint!.shots[0],
          generatedTaskId: undefined,
          status: 'generating',
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_4',
        segmentId: 'shot_4',
        index: 3,
        status: 'failed_terminal',
        remoteStatus: 'created',
        error: '当前分镜缺少可继续查询的 taskId，已跳过远端续查，请重新生成该分镜视频。',
        sourceEvent: 'segment_submit_started',
        updatedAt: now + 1,
      },
    ],
  } as any)

  const latest = await cloneRepo.getProject('repaired-missing-task-binding-project')
  const output = latest?.shotVideoOutputs?.find((item) => item.shotId === 'shot_4')
  const shot = latest?.blueprint?.shots?.find((item) => item.id === 'shot_4')

  assert.equal(output?.taskId, 'veo_3_1-fast-4K:task_repaired')
  assert.equal(output?.status, 'failed_retryable')
  assert.equal(output?.remoteStatus, 'created')
  assert.equal(shot?.generatedTaskId, 'veo_3_1-fast-4K:task_repaired')

  console.log('clone shot video repaired missing-task binding persists smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
