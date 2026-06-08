import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-retry-reset-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const project = await cloneRepo.upsertProject({
    id: 'retry-limit-regenerate-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'retry-limit-regenerate-project',
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
          status: 'failed',
          generatedTaskId: 'veo_3_1:task_old',
          retryCount: 2,
          error: '[retry_limit] 该分镜视频自动重新生成已达到 2 次，已停止继续查询和处理，请手动检查或更换素材后再重试',
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'failed_terminal',
        taskId: 'veo_3_1:task_old',
        retryCount: 2,
        remoteStatus: 'failed',
        error: '[retry_limit] 该分镜视频自动重新生成已达到 2 次，已停止继续查询和处理，请手动检查或更换素材后再重试',
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

  let threw = false
  try {
    await cloneService.regenerateShotVideo({ cloneProjectId: project.id, shotId: 'shot_1' } as any)
  } catch {
    threw = true
  }

  const latest = await cloneRepo.getProject(project.id)
  assert.ok(threw)
  assert.equal(Number(latest?.shotVideoOutputs?.[0]?.retryCount ?? -1), 0)
  assert.equal(Number(latest?.blueprint?.shots?.[0]?.retryCount ?? -1), 0)
  assert.equal(String(latest?.shotVideoOutputs?.[0]?.status || ''), 'failed_terminal')
  assert.ok(!String(latest?.shotVideoOutputs?.[0]?.error || '').includes('[retry_limit]'))
  console.log('clone shot video retry limit regenerate resets state smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
