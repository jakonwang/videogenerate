import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-retry-merge-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  const projectId = 'retry-limit-manual-regenerate-wins-merge'

  await cloneRepo.upsertProject({
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
      shots: [{ id: 'shot_5', index: 4, status: 'failed', retryCount: 2, generatedTaskId: 'task_old' }],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_5',
        segmentId: 'shot_5',
        index: 4,
        status: 'failed_terminal',
        taskId: 'task_old',
        retryCount: 2,
        error: '[retry_limit] 该分镜视频自动重新生成已达到 2 次，已停止继续查询和处理，请手动检查或更换素材后再重试',
        updatedAt: 100,
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

  await cloneRepo.upsertProject({
    id: projectId,
    shotVideoOutputs: [
      {
        shotId: 'shot_5',
        segmentId: 'shot_5',
        index: 4,
        status: 'submitting',
        taskId: undefined,
        previousTaskIds: ['task_old'],
        retryCount: 0,
        error: undefined,
        submissionStartedAt: 200,
        submissionLockedUntil: 300,
        updatedAt: 200,
        sourceEvent: 'force_regenerate_submit',
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
      },
    ],
  } as any)

  const latest = await cloneRepo.getProject(projectId)
  const output = latest?.shotVideoOutputs?.find((item) => item.shotId === 'shot_5')
  assert.ok(output)
  assert.equal(String(output?.status || ''), 'submitting')
  assert.equal(Number(output?.retryCount ?? -1), 0)
  assert.equal(String(output?.taskId || ''), '')
  assert.deepEqual(output?.previousTaskIds || [], ['task_old'])
  assert.ok(!String(output?.error || '').includes('[retry_limit]'))
  console.log('clone shot video retry limit manual regenerate wins merge smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
