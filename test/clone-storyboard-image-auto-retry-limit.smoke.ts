import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-storyboard-auto-retry-limit-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const productRef = join(root, 'product_ref.png')
  const modelRef = join(root, 'model_ref.png')
  await writeFile(productRef, 'product-ref')
  await writeFile(modelRef, 'model-ref')

  await cloneRepo.setCredentials({
    imageProviderPrimary: 'openai',
    openaiApiKey: '',
    openaiImageModel: 'gpt-image-1',
    openaiImageQuality: 'high',
  } as any)

  const project = await cloneRepo.upsertProject({
    id: 'storyboard-auto-retry-limit-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'storyboard-auto-retry-limit-project',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    productReferenceImagePaths: [productRef],
    boundProductSnapshot: {
      id: 'product-1',
      name: 'product-1',
      type: 'earrings',
      canonicalSourcePath: productRef,
      coverImagePath: productRef,
    },
    selectedModelIdentityId: 'identity-1',
    selectedModelIdentitySnapshot: {
      id: 'identity-1',
      name: 'identity-1',
      imagePaths: [modelRef],
    },
    modelIdentityPacks: [
      {
        id: 'identity-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'done',
        confirmed: true,
        imagePaths: [modelRef],
      },
    ],
    blueprint: {
      shots: [
        {
          id: 'shot_1',
          index: 0,
          role: 'model_scene',
          purpose: 'model_demo',
          shotType: 'closeup',
          productType: 'earrings',
          durationSec: 3,
          status: 'ready',
          error: '',
          scriptConfidence: 1,
          generationPrompt: 'extreme close-up earring storyboard frame',
          aiPrompt: 'close-up earring demo',
          materialNeed: 'lock product identity',
          productReferenceImagePaths: [productRef],
        },
      ],
    },
    aiTasks: [],
    reviewDecisions: {},
    sessions: [],
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
    await cloneService.generateGptShotFrames({
      cloneProjectId: project.id,
      shotId: 'shot_1',
      which: 'both',
      productReferenceImagePaths: [productRef],
    } as any)
  } catch {
    threw = true
  }

  assert.equal(threw, true)
  const latest = await cloneRepo.getProject(project.id)
  const shot = latest?.blueprint?.shots?.find((item) => item.id === 'shot_1')
  assert.ok(shot)
  assert.equal(Number(shot?.retryCount ?? 0), 3)
  assert.equal(String(shot?.gptFrameStatus || ''), 'failed')
  console.log('clone storyboard image auto retry limit smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
