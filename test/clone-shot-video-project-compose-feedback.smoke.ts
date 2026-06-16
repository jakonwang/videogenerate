import assert from 'node:assert/strict'

async function main() {
  const { __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')

  const baseProject = {
    id: 'project-compose-feedback',
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
      shots: [] as any[],
      analysisNotes: [],
      transcript: '',
    },
    finalCompose: {
      status: 'done',
      updatedAt: Date.now(),
      composeSummary: {
        bodyUpgradePlan: {
          proofUpgrade: true,
          showUpgrade: true,
          preferredMoves: ['hand_demo', 'wider_usage_context', 'angle_shift', 'momentum_lift'],
        },
        upstreamOptimizationPatch: {
          tightenOpening: true,
          addImmediatePayoff: true,
          increaseMidVariation: true,
          strengthenCtaUrgency: true,
          preferSnapClose: true,
        },
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

  const hookShot = {
    id: 'hook_shot',
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
    id: 'proof_shot',
    index: 1,
    purpose: 'solution',
    scriptRole: 'proof',
    scriptText: 'show the result clearly before close',
    generationPrompt: 'static proof coverage',
    visualDescription: 'clear result state with product confirmation',
    actionDescription: 'steady result hold',
    cameraDescription: 'clean proof closeup',
    productFocus: 'keep result readable',
    motion: 'static',
    framing: 'closeup',
    shotType: 'closeup',
  }

  const showShot = {
    ...hookShot,
    id: 'show_shot',
    index: 2,
    purpose: 'solution',
    scriptRole: 'show',
    scriptText: 'show natural usage with one stronger context beat',
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
    id: 'cta_shot',
    index: 3,
    purpose: 'cta',
    scriptRole: 'cta',
    scriptText: 'close with order now intent',
    generationPrompt: 'final buy now close',
    visualDescription: 'decisive purchase-ending frame',
    actionDescription: 'direct final action',
    cameraDescription: 'tight final closeup',
    productFocus: 'keep action readable',
    motion: 'static',
    framing: 'closeup',
    shotType: 'closeup',
  }

  baseProject.blueprint.shots = [hookShot, proofShot, showShot, ctaShot]

  const hookPreview = await __test_buildShotVideoPromptPreviewText({
    project: baseProject,
    shot: hookShot,
    productType: 'general',
    productAnalysisText: 'hero product',
  })
  assert.match(String(hookPreview.effectiveShot.compiledPrompt || ''), /Opening Hook Priority: Reveal the product payoff in the first beat\./i)
  assert.match(String(hookPreview.effectiveShot.compiledPrompt || ''), /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)
  assert.match(String(hookPreview.effectiveShot.compiledPrompt || ''), /Hook Rhythm: The first beat must communicate product value immediately, not after a soft setup\./i)

  const proofPreview = await __test_buildShotVideoPromptPreviewText({
    project: baseProject,
    shot: proofShot,
    productType: 'general',
    productAnalysisText: 'hero product',
  })
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive\./i)
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Proof Move Priority: Favor hand demo, wider usage context, angle shift, momentum lift before repeating another static close-up proof beat\./i)
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Proof Upgrade: Do not stay on repeated static close-up coverage\./i)
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Conversion Pressure: Make the action outcome immediate and direct\./i)
  assert.match(String(proofPreview.effectiveShot.compiledPrompt || ''), /Proof-to-Action Bridge: Let the proof already lean toward purchase intent and closing momentum\./i)

  const showPreview = await __test_buildShotVideoPromptPreviewText({
    project: baseProject,
    shot: showShot,
    productType: 'general',
    productAnalysisText: 'hero product',
  })
  assert.match(String(showPreview.effectiveShot.compiledPrompt || ''), /Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive\./i)
  assert.match(String(showPreview.effectiveShot.compiledPrompt || ''), /Show Move Priority: Favor hand demo, wider usage context, angle shift, momentum lift so the middle keeps opening out instead of repeating the same usage beat\./i)
  assert.match(String(showPreview.effectiveShot.compiledPrompt || ''), /Show Upgrade: Move beyond generic usage coverage\./i)
  assert.doesNotMatch(String(showPreview.effectiveShot.compiledPrompt || ''), /Proof Upgrade:/i)

  const ctaPreview = await __test_buildShotVideoPromptPreviewText({
    project: baseProject,
    shot: ctaShot,
    productType: 'general',
    productAnalysisText: 'hero product',
  })
  assert.match(String(ctaPreview.effectiveShot.compiledPrompt || ''), /Conversion Pressure: Make the action outcome immediate and direct\./i)
  assert.match(String(ctaPreview.effectiveShot.compiledPrompt || ''), /Snap Close: End with a decisive final action beat or clean proof-to-action handoff\./i)
  assert.match(String(ctaPreview.effectiveShot.compiledPrompt || ''), /Closing Rhythm: End on a decisive action frame with direct decision pressure, not a soft fade-out feeling\./i)
  assert.match(String(ctaPreview.effectiveShot.compiledPrompt || ''), /CTA Pressure: Make urgency, action, or buy-now intent visually clear without becoming spammy\./i)

  console.log('clone shot video project compose feedback smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
