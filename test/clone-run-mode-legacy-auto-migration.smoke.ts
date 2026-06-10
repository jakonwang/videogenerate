import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-run-mode-migration-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  await cloneRepo.upsertProject({
    id: 'legacy-auto-run-mode-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'legacy-auto-run-mode-project',
    archived: false,
    status: 'completed',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'structure',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    baseBlueprint: null,
    blueprint: null,
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
      qualityGate: {
        enabled: true,
        minDurationRatio: 0.6,
        maxDurationRatio: 1.6,
        maxBlackFrameRatio: 0.45,
        minShortSide: 720,
        requireAudio: false,
      },
    },
    autoFlowStatus: {
      enabled: true,
      targetStage: 'final_compose',
      currentStage: 'final_compose',
      status: 'done',
      imageRetryLimit: 2,
      videoRetryLimit: 2,
      lastStartedAt: Date.now(),
      lastCompletedAt: Date.now(),
      lastSummary: 'auto run completed',
    },
  } as any)

  const migrated = await cloneRepo.getProject('legacy-auto-run-mode-project')
  assert.equal(migrated?.runMode, 'auto')

  const rows = await cloneRepo.listRawProjects()
  const row = rows.find((item) => item.id === 'legacy-auto-run-mode-project')
  assert.equal(row?.runMode, 'auto')

  console.log('clone run mode legacy auto migration smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
