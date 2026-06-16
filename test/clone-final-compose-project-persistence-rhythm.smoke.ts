import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function ensureExists(path: string) {
  await access(path)
  return path
}

async function main() {
  const { __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')
  const root = await mkdtemp(join(tmpdir(), 'vg-final-compose-project-persistence-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
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
  const { cloneService } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  const projectId = 'project-persistence-rhythm-project'
  const outputDir = join(root, 'outputs')

  await cloneRepo.upsertProject({
    id: projectId,
    createdAt: now,
    updatedAt: now,
    title: 'project-persistence-rhythm-project',
    archived: false,
    status: 'ready',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'structure',
    referenceVideoPath: '',
    referenceVideoName: '',
    outputDir,
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
          onScreenText: 'See the result right away.',
          actionDescription: 'direct result reveal with quick payoff',
          productFocus: 'hero result visible immediately',
          motion: 'static',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
        },
        {
          id: 'shot_payoff_real',
          index: 1,
          durationSec: 2.2,
          generatedClipPath: sourcePaths[1],
          generatedSource: 'cloud',
          scriptRole: 'proof',
          storyboardReferenceMode: 'product_closeup',
          framing: 'closeup',
          productVisibility: 'high',
          shotType: 'closeup',
          productFocus: 'visible product detail and payoff close-up',
          actionDescription: 'clear proof hold with result focus',
          motion: 'static',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
        },
        {
          id: 'shot_repeat_real',
          index: 2,
          durationSec: 2.2,
          generatedClipPath: sourcePaths[2],
          generatedSource: 'cloud',
          scriptRole: 'proof',
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
        },
        {
          id: 'shot_show_real',
          index: 3,
          durationSec: 2.1,
          generatedClipPath: sourcePaths[3],
          generatedSource: 'cloud',
          scriptRole: 'show',
          framing: 'medium',
          productVisibility: 'medium',
          shotType: 'model_demo',
          productFocus: 'natural product use',
          actionDescription: 'natural demo with clean payoff',
          motion: 'pan_right',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
        },
        {
          id: 'shot_cta_real',
          index: 4,
          durationSec: 1.8,
          generatedClipPath: sourcePaths[4],
          generatedSource: 'cloud',
          scriptRole: 'cta',
          onScreenText: 'Tap now to get yours before it sells out today only.',
          actionDescription: 'order now limited time full set deal',
          motion: 'static',
          canEnterRender: true,
          status: 'done',
          qualityStatus: 'passed',
        },
      ],
      analysisNotes: [],
      transcript: '',
    },
    aiTasks: [],
    reviewDecisions: {},
    sessions: [],
    modelIdentityPacks: [],
    defaultGenerationPolicy: { qualityProfile: 'high', variantStrength: 'medium' },
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

  const result = await cloneService.composeCloneFinalVideo({
    cloneProjectId: projectId,
    outputDir,
  } as any)

  assert.ok(String(result.project?.finalCompose?.outputPath || '').trim().toLowerCase().endsWith('.mp4'))
  assert.ok(String(result.previewPipeline?.previewReportPath || '').trim().toLowerCase().endsWith('batch-report.json'))
  assert.equal(result.project?.finalCompose?.status, 'done')
  assert.equal(result.project?.finalCompose?.composeHealth?.verdict, 'needs_tuning')
  assert.equal(Array.isArray(result.project?.finalCompose?.composeHealth?.flags), true)
  assert.equal(result.project?.finalCompose?.composeHealth?.flags?.includes('low_variation_signal'), true)
  assert.equal(result.project?.finalCompose?.composeSummary?.stageCounts?.hook, 1)
  assert.equal(result.project?.finalCompose?.composeSummary?.stageCounts?.close, 1)
  assert.equal(result.project?.finalCompose?.composeSummary?.payoffHandoffCount, 1)
  assert.equal(result.project?.finalCompose?.composeSummary?.strongCtaCount, 1)
  assert.equal(result.project?.finalCompose?.composeSummary?.snapCloseCount, 1)
  assert.equal(result.project?.finalCompose?.composeSummary?.upstreamOptimizationPatch?.preferSnapClose, true)
  assert.equal(result.project?.finalCompose?.composeSummary?.upstreamOptimizationPatch?.increaseMidVariation, true)
  assert.equal(Array.isArray(result.project?.finalCompose?.composeSummary?.optimizationLanes), true)
  assert.equal(result.project?.finalCompose?.composeSummary?.optimizationLanes?.includes('body'), true)
  assert.equal(Array.isArray(result.project?.finalCompose?.composeSummary?.nextActions), true)
  assert.equal(
    result.project?.finalCompose?.composeSummary?.nextActions?.includes('Replace one repeated close-up with a clearer hand demo, wider usage context, or angle shift through the middle section.'),
    true,
  )
  assert.equal(result.project?.finalCompose?.composeSummary?.optimizationBrief?.focusArea, 'body')
  assert.equal(result.project?.finalCompose?.composeSummary?.bodyUpgradePlan?.proofUpgrade, true)
  assert.equal(result.project?.finalCompose?.composeSummary?.bodyUpgradePlan?.showUpgrade, true)
  assert.equal(
    result.project?.finalCompose?.composeSummary?.bodyUpgradePlan?.preferredMoves?.includes('hand_demo'),
    true,
  )
  assert.equal(
    result.project?.finalCompose?.composeSummary?.optimizationBrief?.upstreamPromptHints?.includes(
      'Replace one repeated close-up with a hand demo, wider usage context, or angle shift in the middle section.',
    ),
    true,
  )

  const saved = await cloneRepo.getProject(projectId)
  assert.equal(saved?.finalCompose?.status, 'done')
  assert.equal(saved?.finalCompose?.composeSummary?.snapCloseCount, 1)
  assert.equal(saved?.finalCompose?.composeSummary?.upstreamOptimizationPatch?.increaseMidVariation, true)
  assert.equal(Array.isArray(saved?.finalCompose?.composeSummary?.optimizationLanes), true)
  assert.equal(saved?.finalCompose?.composeSummary?.optimizationLanes?.includes('body'), true)
  assert.equal(Array.isArray(saved?.finalCompose?.composeSummary?.nextActions), true)
  assert.equal(
    saved?.finalCompose?.composeSummary?.nextActions?.includes('Replace one repeated close-up with a clearer hand demo, wider usage context, or angle shift through the middle section.'),
    true,
  )
  assert.equal(saved?.finalCompose?.composeSummary?.optimizationBrief?.focusArea, 'body')
  assert.equal(saved?.finalCompose?.composeSummary?.bodyUpgradePlan?.proofUpgrade, true)
  assert.equal(saved?.finalCompose?.composeSummary?.bodyUpgradePlan?.showUpgrade, true)
  assert.equal(
    saved?.finalCompose?.composeSummary?.bodyUpgradePlan?.preferredMoves?.includes('angle_shift'),
    true,
  )
  assert.equal(
    saved?.finalCompose?.composeSummary?.optimizationBrief?.upstreamPromptHints?.includes(
      'Replace one repeated close-up with a hand demo, wider usage context, or angle shift in the middle section.',
    ),
    true,
  )
  assert.ok(String(saved?.finalCompose?.outputPath || '').trim().toLowerCase().endsWith('.mp4'))

  const proofShot = saved?.blueprint?.shots?.find((item: any) => item.id === 'shot_repeat_real')
  const showShot = saved?.blueprint?.shots?.find((item: any) => item.id === 'shot_show_real')
  assert.ok(proofShot)
  assert.ok(showShot)

  const proofPreview = await __test_buildShotVideoPromptPreviewText({
    project: saved as any,
    shot: proofShot as any,
    productType: 'general',
    productAnalysisText: 'hero product',
  })
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive\./i)
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Proof Upgrade: Do not stay on repeated static close-up coverage\./i)

  const showPreview = await __test_buildShotVideoPromptPreviewText({
    project: saved as any,
    shot: showShot as any,
    productType: 'general',
    productAnalysisText: 'hero product',
  })
  assert.match(String(showPreview.effectiveShot.compiledPrompt || ''), /Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive\./i)
  assert.match(String(showPreview.effectiveShot.compiledPrompt || ''), /Show Upgrade: Move beyond generic usage coverage\./i)
  assert.doesNotMatch(String(showPreview.effectiveShot.compiledPrompt || ''), /Proof Upgrade:/i)

  console.log('clone final compose project persistence rhythm smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
