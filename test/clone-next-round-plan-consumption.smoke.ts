import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

async function ensureExists(path: string) {
  await access(path)
  return path
}

async function main() {
  const workspaceDir = await mkdtemp(join(os.tmpdir(), 'clone-next-round-plan-consumption-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = workspaceDir
  process.env.VIDEOGENERATE_DATA_DIR = join(workspaceDir, '.videogenerate')
  process.env.VG_ALLOW_MOCK_GENERATION = 'true'
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const sourceRoot =
    'D:\\phpstudy_pro\\WWW\\videogenerate\\.videogenerate\\viral-clone\\b79f1d94-1ada-43e6-8136-3a42c7b3a411\\outputs\\job_001_try_1'
  const sourcePaths = await Promise.all([
    ensureExists(join(sourceRoot, 'shot_1.mp4')),
    ensureExists(join(sourceRoot, 'shot_2.mp4')),
    ensureExists(join(sourceRoot, 'shot_3.mp4')),
    ensureExists(join(sourceRoot, 'shot_4.mp4')),
    ensureExists(join(sourceRoot, 'shot_5.mp4')),
  ])

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService, __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  const projectId = 'next-round-plan-consumption-project'
  const outputDir = join(workspaceDir, 'outputs')
  const productRef = join(workspaceDir, 'product_ref.png')
  const modelRef = join(workspaceDir, 'model_ref.png')
  await writeFile(productRef, 'product-ref')
  await writeFile(modelRef, 'model-ref')

  await cloneRepo.setCredentials({
    videoProviderPrimary: 'seedance',
    videoModelPrimary: 'seedance-1.0-lite',
    seedanceApiKey: '',
    allowMockWhenNoKey: true,
  } as any)

  await cloneRepo.upsertProject({
    id: projectId,
    createdAt: now,
    updatedAt: now,
    title: 'next-round-plan-consumption-project',
    archived: false,
    status: 'ready',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'structure',
    referenceVideoPath: '',
    referenceVideoName: '',
    outputDir,
    productReferenceImagePaths: [productRef],
    boundProductSnapshot: {
      id: 'product-1',
      name: 'product-1',
      type: 'general',
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
        createdAt: now,
        updatedAt: now,
        status: 'done',
        confirmed: true,
        imagePaths: [modelRef],
      },
    ],
    blueprint: {
      totalDurationSec: 10.2,
      referenceAspectRatio: '9:16',
      scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
      shots: [
        {
          id: 'shot_hook_real',
          index: 0,
          durationSec: 1.9,
          generatedClipPath: sourcePaths[0],
          generatedSource: 'cloud',
          scriptRole: 'hook',
          scriptText: 'see the result right away',
          actionDescription: 'direct result reveal with quick payoff',
          productFocus: 'hero result visible immediately',
          motion: 'static',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
          framing: 'wide',
          shotType: 'model_demo',
          productType: 'general',
          forceAi: true,
          materialNeed: 'lock product identity',
          productReferenceImagePaths: [productRef],
          generatedFirstFramePath: productRef,
          generatedLastFramePath: productRef,
        },
        {
          id: 'shot_repeat_real',
          index: 1,
          durationSec: 2.2,
          generatedClipPath: sourcePaths[2],
          generatedSource: 'cloud',
          scriptRole: 'proof',
          scriptText: 'repeat close product proof',
          storyboardReferenceMode: 'product_closeup',
          framing: 'closeup',
          productVisibility: 'high',
          shotType: 'closeup',
          productFocus: 'visible product detail and payoff close-up',
          actionDescription: 'steady repeated detail hold',
          motion: 'static',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
          productType: 'general',
          forceAi: true,
          materialNeed: 'lock product identity',
          productReferenceImagePaths: [productRef],
          generatedFirstFramePath: productRef,
          generatedLastFramePath: productRef,
        },
        {
          id: 'shot_show_real',
          index: 2,
          durationSec: 2.1,
          generatedClipPath: sourcePaths[3],
          generatedSource: 'cloud',
          scriptRole: 'show',
          scriptText: 'show natural usage in context',
          framing: 'medium',
          productVisibility: 'medium',
          shotType: 'model_demo',
          productFocus: 'natural product use',
          actionDescription: 'natural demo with clean payoff',
          motion: 'pan_right',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
          productType: 'general',
          forceAi: true,
          materialNeed: 'lock product identity',
          productReferenceImagePaths: [productRef],
          generatedFirstFramePath: productRef,
          generatedLastFramePath: productRef,
        },
        {
          id: 'shot_cta_real',
          index: 3,
          durationSec: 1.8,
          generatedClipPath: sourcePaths[4],
          generatedSource: 'cloud',
          scriptRole: 'cta',
          scriptText: 'tap now before it sells out',
          onScreenText: 'Tap now to get yours before it sells out today only.',
          actionDescription: 'order now limited time full set deal',
          motion: 'static',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
          framing: 'closeup',
          shotType: 'closeup',
          productType: 'general',
          forceAi: true,
          materialNeed: 'lock product identity',
          productReferenceImagePaths: [productRef],
          generatedFirstFramePath: productRef,
          generatedLastFramePath: productRef,
        },
      ],
    },
    previewPipeline: { status: 'idle', updatedAt: now, lastError: '' },
    finalCompose: { status: 'ready', updatedAt: now },
    aiTasks: [],
    sessions: [],
    shotVideoOutputs: [],
    policy: {
      qualityPriority: 'high',
      fallbackChain: ['seedance'],
      concurrency: 1,
      retries: 0,
      qualityGate: {
        enabled: false,
        minDurationRatio: 0,
        maxDurationRatio: 10,
        maxBlackFrameRatio: 1,
        minShortSide: 0,
        requireAudio: false,
      },
    },
  } as any)

  const beforeProject = await cloneRepo.getProject(projectId)
  const proofShot = beforeProject?.blueprint?.shots?.find((item: any) => item.id === 'shot_repeat_real')
  const beforePreview = await __test_buildShotVideoPromptPreviewText({
    project: beforeProject as any,
    shot: proofShot as any,
    productType: 'general',
    productAnalysisText: 'hero product',
  })
  assert.doesNotMatch(String(beforePreview.effectiveShot.compiledPrompt || ''), /Next Round Rhythm Upgrade:/i)

  const result = await cloneService.composeCloneFinalVideo({
    cloneProjectId: projectId,
    outputDir,
  } as any)

  const saved = await cloneRepo.getProject(projectId)
  const savedProofShot = saved?.blueprint?.shots?.find((item: any) => item.id === 'shot_repeat_real')
  const afterPreview = await __test_buildShotVideoPromptPreviewText({
    project: saved as any,
    shot: savedProofShot as any,
    productType: 'general',
    productAnalysisText: 'hero product',
  })

  assert.ok(String(result.finalCompose?.nextRoundPlanPath || '').trim().toLowerCase().endsWith('next-round-plan.json'))
  assert.match(String(afterPreview.effectiveShot.compiledPrompt || ''), /Next Round Rhythm Upgrade:/i)
  assert.match(
    String(afterPreview.effectiveShot.compiledPrompt || ''),
    /Upgrade this proof beat with a hand demo, wider usage context, angle shift, or momentum lift\./i,
  )
  assert.equal(
    Array.isArray(savedProofShot?.nextRoundPromptDirectives),
    false,
  )

  const stopAfterPromptEvidence = new Error('stop-after-prompt-evidence')
  const originalLog = console.log
  const debugLines: string[] = []
  console.log = (...args: any[]) => {
    const line = args
      .map((item) => {
        if (typeof item === 'string') return item
        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      })
      .join(' ')
    debugLines.push(line)
    originalLog(...args)
    if (line.includes('[clone-debug] final-shot-video-prompts')) {
      throw stopAfterPromptEvidence
    }
  }

  try {
    await assert.rejects(
      cloneService.generateShotClip({
        cloneProjectId: projectId,
        shotId: 'shot_repeat_real',
        forceRegenerate: true,
      } as any),
      (error: any) => {
        const message = String(error?.message || '')
        return error === stopAfterPromptEvidence || /Seedance API Key|stop-after-prompt-evidence/i.test(message)
      },
    )
  } finally {
    console.log = originalLog
  }

  const regeneratedProject = await cloneRepo.getProject(projectId)
  const regeneratedProofShot = regeneratedProject?.blueprint?.shots?.find((item: any) => item.id === 'shot_repeat_real')
  assert.ok(regeneratedProofShot)
  assert.equal(Array.isArray(regeneratedProofShot?.productReferenceImagePaths), true)
  assert.equal(String(regeneratedProofShot?.productReferenceImagePaths?.[0] || ''), productRef)
  assert.equal(Array.isArray(regeneratedProofShot?.nextRoundPromptDirectives), true)
  assert.equal(
    regeneratedProofShot?.nextRoundPromptDirectives?.includes(
      'Upgrade this proof beat with a hand demo, wider usage context, angle shift, or momentum lift.',
    ),
    true,
  )
  const finalPromptLog = debugLines.find((line) => line.includes('[clone-debug] final-shot-video-prompts'))
  assert.ok(finalPromptLog)
  assert.match(finalPromptLog || '', /Proof Move Priority:/i)
  assert.match(finalPromptLog || '', /Proof Upgrade:/i)
  assert.match(finalPromptLog || '', /productReferenceCount\":1|productReferenceCount: 1/i)
  assert.match(finalPromptLog || '', /product_ref\.png/i)

  const planJson = JSON.parse(await readFile(String(result.finalCompose?.nextRoundPlanPath || '').trim(), 'utf8'))
  assert.equal(Array.isArray(planJson?.plan), true)
  const proofPlan = planJson.plan.find((item: any) => item.shotId === 'shot_repeat_real')
  assert.equal(
    proofPlan?.promptDirectives?.includes(
      'Upgrade this proof beat with a hand demo, wider usage context, angle shift, or momentum lift.',
    ),
    true,
  )

  console.log('clone next round plan consumption smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
