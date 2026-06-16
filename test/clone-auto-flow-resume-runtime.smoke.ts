import assert from 'node:assert/strict'
import { copyFile, mkdtemp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-auto-flow-resume-'))
  const dataDir = join(root, '.videogenerate')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  await mkdir(join(dataDir, 'db'), { recursive: true })

  const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  await ensureCloneSqliteReady()
  await cloneRepo.setCredentials({
    allowMockWhenNoKey: true,
    imageProviderPrimary: 'openai',
    videoProviderPrimary: 'seedance',
  } as any)
  const analysisBoardPath = join(dataDir, 'analysis-board.png')
  const productRefPath = join(dataDir, 'product-ref.png')
  const fixtureImagePath = join(process.cwd(), 'resources', 'icon.png')
  await copyFile(fixtureImagePath, analysisBoardPath)
  await copyFile(fixtureImagePath, productRefPath)
  const project = await cloneRepo.createProject({
    locale: 'zh-CN',
    strength: 'structure',
    referenceVideoPath: 'C:\\temp\\reference.mp4',
    referenceVideoName: 'reference.mp4',
  })
  project.runMode = 'auto'
  project.baseBlueprint = {
    id: project.id,
    title: 'auto-resume',
    shots: [
      {
        id: 'shot-1',
        index: 0,
        scriptText: 'demo',
        generationPrompt: 'demo',
        visualDescription: 'demo',
        actionDescription: 'demo',
        cameraDescription: 'demo',
        productFocus: 'demo',
        materialNeed: 'demo',
        role: 'hook',
        shotType: 'closeup',
        status: 'ready',
        productType: 'general',
        productReferenceImagePaths: [productRefPath],
      },
    ],
    productCategory: 'general',
  } as any
  project.blueprint = project.baseBlueprint as any
  project.originalProductReferenceImagePaths = [productRefPath]
  project.productReferenceImagePaths = [analysisBoardPath]
  project.boundProductSnapshot = {
    id: 'product-1',
    name: 'Product One',
    type: 'general',
    productAnalysis: {
      category: 'general',
      summary: 'demo',
      coreSubject: 'demo',
      connectionStructure: 'demo',
      materialDetails: 'demo',
      wearingPosition: 'demo',
      surfaceDetails: 'demo',
      colorDetails: 'demo',
      geometryDetails: 'demo',
      sizeScale: 'demo',
      matchingRules: [],
      rawDescription: 'demo',
      updatedAt: Date.now(),
    },
    originalImagePaths: [productRefPath],
    frozenReferenceImagePaths: [analysisBoardPath],
    boundAt: Date.now(),
    updatedAt: Date.now(),
    analysisBoardPath,
    analysisBoardStatus: 'done',
    canonicalSourcePath: analysisBoardPath,
    canonicalSourceStatus: 'done',
    status: 'done',
  } as any
  project.selectedModelIdentityId = 'identity-1'
  project.selectedModelIdentitySnapshot = {
    id: 'identity-1',
    name: 'Model One',
    imagePaths: ['C:\\temp\\identity.png'],
    status: 'done',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    productType: 'general',
    market: 'GLOBAL',
    gender: 'female',
    ageRange: '20-30',
    hairStyle: 'natural',
    skinTone: 'fair',
    outfitStyle: 'casual',
    mood: 'calm',
    sceneStyle: 'studio',
    description: 'demo',
    model: 'demo',
  } as any
  project.autoFlowStatus = {
    enabled: true,
    targetStage: 'final_compose',
    status: 'running',
    currentStage: 'storyboard_design',
    imageRetryLimit: 2,
    videoRetryLimit: 2,
    lastStartedAt: Date.now() - 1000,
  } as any
  await cloneRepo.upsertProject(project)

  const result = await cloneService.resumePendingRemoteStoryboardVideosOnStartup()
  assert.ok(result.totalProjectCount >= 1)
  assert.ok(result.resumableAutoFlowProjectCount >= 1)
  assert.equal(result.autoFlowProjectIds[0], project.id)

  await wait(1200)
  const resumed = await cloneRepo.getProject(project.id)
  assert.ok(resumed)
  assert.equal(resumed?.autoFlowStatus?.enabled, true)
  assert.notEqual(String(resumed?.autoFlowStatus?.currentStage || '').trim(), '')

  console.log('clone auto flow resume runtime smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
