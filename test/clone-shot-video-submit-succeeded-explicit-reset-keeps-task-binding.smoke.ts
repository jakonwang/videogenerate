import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-submit-succeeded-reset-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  await cloneRepo.upsertProject({
    id: 'submit-succeeded-explicit-reset-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'submit-succeeded-explicit-reset-project',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [{ id: 'shot_4', index: 3, status: 'generating', generatedTaskId: 'veo_3_1-fast-4K:task_keep' }],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_4',
        segmentId: 'shot_4',
        index: 3,
        status: 'remote_running',
        taskId: 'veo_3_1-fast-4K:task_keep',
        provider: 'apifox_hub',
        model: 'veo_3_1-fast-4K',
        remoteStatus: 'created',
        sourceEvent: 'segment_submit_succeeded',
        updatedAt: 1000,
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

  const current = await cloneRepo.getProject('submit-succeeded-explicit-reset-project')
  assert.ok(current)

  await cloneRepo.upsertProject({
    ...current!,
    updatedAt: Date.now() + 1,
    blueprint: {
      ...current!.blueprint,
      shots: [
        {
          ...current!.blueprint!.shots[0],
          status: 'generating',
          generatedTaskId: undefined,
        },
      ],
    },
    shotVideoOutputs: [
      {
        ...(current!.shotVideoOutputs?.[0] ?? {}),
        shotId: 'shot_4',
        segmentId: 'shot_4',
        index: 3,
        status: 'remote_running',
        taskId: undefined,
        provider: 'apifox_hub',
        model: 'veo_3_1-fast-4K',
        remoteStatus: 'created',
        sourceEvent: 'segment_submit_succeeded',
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
        updatedAt: 2000,
      },
    ],
  } as any)

  const saved = await cloneRepo.getProject('submit-succeeded-explicit-reset-project')
  const output = saved?.shotVideoOutputs?.find((item) => item.shotId === 'shot_4')
  const shot = saved?.blueprint?.shots?.find((item) => item.id === 'shot_4')

  assert.equal(output?.taskId, 'veo_3_1-fast-4K:task_keep')
  assert.equal(output?.status, 'remote_running')
  assert.equal(output?.remoteStatus, 'created')
  assert.equal(output?.sourceEvent, 'segment_submit_succeeded')
  assert.equal(shot?.generatedTaskId, 'veo_3_1-fast-4K:task_keep')

  console.log('clone shot video submit succeeded explicit reset keeps task binding smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
