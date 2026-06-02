import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-force-regenerate-lock-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const oldVideoPath = join(root, 'old_generated_clip.mp4')
  await writeFile(oldVideoPath, 'old-video')

  const lockedUntil = Date.now() + 10 * 60 * 1000
  const project = await cloneRepo.upsertProject({
    id: 'force-regenerate-lock-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'force-regenerate-lock-project',
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
          status: 'done',
          generatedTaskId: 'veo_3_1:task_old',
          generatedClipPath: oldVideoPath,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'submitting',
        taskId: 'veo_3_1:task_old',
        remoteStatus: 'processing',
        videoPath: oldVideoPath,
        localPath: oldVideoPath,
        submissionFingerprint: 'old-fingerprint',
        submissionStartedAt: Date.now(),
        submissionLockedUntil: lockedUntil,
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
  assert.equal(String(latest?.shotVideoOutputs?.[0]?.taskId || ''), '')
  assert.equal(String(latest?.shotVideoOutputs?.[0]?.videoPath || ''), '')
  assert.equal(String(latest?.shotVideoOutputs?.[0]?.status || ''), 'failed_terminal')
  assert.ok(Array.isArray(latest?.shotVideoOutputs?.[0]?.previousTaskIds))
  assert.ok((latest?.shotVideoOutputs?.[0]?.previousTaskIds || []).includes('veo_3_1:task_old'))
  console.log('clone shot video force regenerate bypass submission lock smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
