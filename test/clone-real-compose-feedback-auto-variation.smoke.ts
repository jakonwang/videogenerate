import assert from 'node:assert/strict'
import { access, mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { renderViralCloneBatch } from '../src/main/modules/clone/renderViralCloneBatch'

async function ensureExists(path: string) {
  await access(path)
  return path
}

async function main() {
  const { __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')

  const root = 'D:\\phpstudy_pro\\WWW\\videogenerate\\.videogenerate\\viral-clone\\b79f1d94-1ada-43e6-8136-3a42c7b3a411\\outputs\\job_001_try_1'
  const outputDir = await mkdtemp(join(os.tmpdir(), 'clone-real-compose-feedback-auto-variation-'))
  const sourcePaths = await Promise.all([
    ensureExists(join(root, 'shot_1.mp4')),
    ensureExists(join(root, 'shot_2.mp4')),
    ensureExists(join(root, 'shot_3.mp4')),
    ensureExists(join(root, 'shot_4.mp4')),
    ensureExists(join(root, 'shot_5.mp4')),
  ])

  const composeResult = await renderViralCloneBatch({
    projectId: 'real-auto-variation-compose-project',
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
      } as any,
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
      } as any,
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
      } as any,
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
      } as any,
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
      } as any,
    ],
    outDir: outputDir,
    count: 1,
    maxRetry: 0,
  })

  const report = JSON.parse(await readFile(composeResult.reportPath, 'utf8'))
  const patch = report?.composeSummary?.upstreamOptimizationPatch
  const bodyUpgradePlan = report?.composeSummary?.bodyUpgradePlan
  assert.ok(patch)
  assert.equal(patch.increaseMidVariation, true)
  assert.equal(bodyUpgradePlan?.proofUpgrade, true)
  assert.equal(bodyUpgradePlan?.showUpgrade, true)
  assert.equal(Array.isArray(bodyUpgradePlan?.preferredMoves), true)
  assert.equal(bodyUpgradePlan?.preferredMoves?.includes('wider_usage_context'), true)

  const hookShot = {
    id: 'hook_auto_variation_shot',
    index: 0,
    purpose: 'hook',
    startSec: 0,
    durationSec: 2.2,
    scriptRole: 'hook',
    scriptText: 'soft setup before product payoff',
    generationPrompt: 'ambient opener without explicit result',
    visualDescription: 'wide lifestyle opener before the product moment lands',
    actionDescription: 'gentle setup motion only',
    cameraDescription: 'slow opening drift',
    productFocus: 'show product value quickly',
    materialNeed: 'hero product',
    motion: 'static',
    framing: 'wide',
    shotType: 'model_demo',
    productType: 'general',
    prompt: { positive: '', negative: '', cameraMotion: '', aspectRatio: '9:16' },
    uploadedAssetIds: [],
    aiEnabled: true,
    sourceMode: 'ai',
    reviewStatus: 'pending',
    scriptConfidence: 0.9,
    visual: '',
    subtitleSuggestion: '',
    productReferenceImagePaths: [],
  } as any

  const proofShot = {
    ...hookShot,
    id: 'proof_auto_variation_shot',
    index: 1,
    purpose: 'solution',
    scriptRole: 'proof',
    scriptText: 'show the result clearly before close',
    generationPrompt: 'static proof coverage',
    visualDescription: 'clear result state with product confirmation',
    actionDescription: 'steady result hold',
    cameraDescription: 'clean proof closeup',
    productFocus: 'keep result readable',
    framing: 'closeup',
    shotType: 'closeup',
  }

  const showShot = {
    ...hookShot,
    id: 'show_auto_variation_shot',
    index: 2,
    purpose: 'solution',
    scriptRole: 'show',
    scriptText: 'show natural usage with a clearer context shift',
    generationPrompt: 'middle product use coverage',
    visualDescription: 'natural product use in a real-life moment',
    actionDescription: 'gentle hand demo with visible usage context',
    cameraDescription: 'medium product use framing',
    productFocus: 'keep usage readable',
    motion: 'pan_right',
    framing: 'medium',
    shotType: 'model_demo',
  }

  const ctaShot = {
    ...hookShot,
    id: 'cta_auto_variation_shot',
    index: 3,
    purpose: 'cta',
    scriptRole: 'cta',
    scriptText: 'close with order now intent',
    generationPrompt: 'final buy now close',
    visualDescription: 'decisive purchase-ending frame',
    actionDescription: 'direct final action',
    cameraDescription: 'tight final closeup',
    productFocus: 'keep action readable',
    framing: 'closeup',
    shotType: 'closeup',
  }

  const project = {
    id: 'real-auto-variation-preview-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'draft',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'structure',
    referenceVideoPath: 'ref.mp4',
    referenceVideoName: 'ref.mp4',
    baseBlueprint: null,
    blueprint: {
      totalDurationSec: 8,
      referenceAspectRatio: '9:16',
      scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
      shots: [hookShot, proofShot, showShot, ctaShot],
      analysisNotes: [],
      transcript: '',
    },
    finalCompose: {
      status: 'done',
      updatedAt: Date.now(),
      composeSummary: {
        bodyUpgradePlan,
        upstreamOptimizationPatch: patch,
      },
    },
    aiTasks: [],
    sessions: [],
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
  } as any

  const proofPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project,
      shot: proofShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(proofPrompt, /Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive\./i)
  assert.match(proofPrompt, /Proof Move Priority: Favor hand demo, wider usage context, angle shift, momentum lift before repeating another static close-up proof beat\./i)
  assert.match(proofPrompt, /Proof Upgrade: Do not stay on repeated static close-up coverage\./i)

  const showPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project,
      shot: showShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(showPrompt, /Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive\./i)
  assert.match(showPrompt, /Show Move Priority: Favor hand demo, wider usage context, angle shift, momentum lift so the middle keeps opening out instead of repeating the same usage beat\./i)
  assert.match(showPrompt, /Show Upgrade: Move beyond generic usage coverage\./i)
  assert.doesNotMatch(showPrompt, /Proof Upgrade:/i)

  console.log('clone real compose feedback auto variation smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
