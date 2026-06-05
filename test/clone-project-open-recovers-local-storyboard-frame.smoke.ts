import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-project-open-recovers-storyboard-frame-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const projectId = 'recover-storyboard-open-project'
  const shotId = 'shot_2'
  const frameDir = join(process.env.VIDEOGENERATE_DATA_DIR, 'viral-clone', projectId, 'shots', shotId, 'gpt-frames')
  await mkdir(frameDir, { recursive: true })
  const framePath = join(frameDir, 'gpt_first_2_test.png')
  await writeFile(framePath, 'frame')

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
      shots: [
        { id: 'shot_1', index: 0, gptFirstFramePath: 'C:\\frames\\shot1.png', gptFrameStatus: 'done', status: 'ready' },
        { id: shotId, index: 1, gptFrameStatus: 'generating', status: 'generating' },
      ],
    },
    storyboardFrames: [
      { id: 'frame-1', shotId: 'shot_1', imagePath: 'C:\\frames\\shot1.png', status: 'cropped', frameIndex: 0, updatedAt: Date.now() },
      { id: 'frame-2', shotId, status: 'generating', frameIndex: 1, updatedAt: Date.now() },
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

  const project = await cloneService.getProject({ cloneProjectId: projectId })
  const recoveredShot = project?.blueprint?.shots?.find((item: any) => item.id === shotId)
  const recoveredFrame = project?.storyboardFrames?.find((item: any) => item.shotId === shotId)

  assert.equal(String(recoveredShot?.gptFirstFramePath || ''), framePath)
  assert.equal(String(recoveredShot?.gptFrameStatus || ''), 'done')
  assert.equal(String(recoveredFrame?.imagePath || ''), framePath)
  console.log('clone project open recovers local storyboard frame smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
