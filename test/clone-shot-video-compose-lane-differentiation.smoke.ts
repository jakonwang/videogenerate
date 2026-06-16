import assert from 'node:assert/strict'

async function main() {
  const { __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')

  const makeProject = (patch: Record<string, boolean>) =>
    ({
      id: `lane-project-${Object.keys(patch).join('-')}`,
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
    }) as any

  const hookShot = {
    id: 'hook_lane_shot',
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
    id: 'proof_lane_shot',
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

  const ctaShot = {
    ...hookShot,
    id: 'cta_lane_shot',
    index: 2,
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

  const hookOnlyProject = makeProject({
    tightenOpening: true,
    addImmediatePayoff: false,
    increaseMidVariation: false,
    strengthenCtaUrgency: false,
    preferSnapClose: false,
  })
  hookOnlyProject.blueprint.shots = [hookShot, proofShot, ctaShot]
  const hookOnlyPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project: hookOnlyProject,
      shot: hookShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(hookOnlyPrompt, /Opening Hook Priority: Reveal the product payoff in the first beat\./i)
  assert.doesNotMatch(hookOnlyPrompt, /Mid-Sequence Variation:/i)
  assert.doesNotMatch(hookOnlyPrompt, /Conversion Pressure:/i)

  const payoffOnlyProject = makeProject({
    tightenOpening: false,
    addImmediatePayoff: true,
    increaseMidVariation: false,
    strengthenCtaUrgency: false,
    preferSnapClose: false,
  })
  payoffOnlyProject.blueprint.shots = [hookShot, proofShot, ctaShot]
  const payoffOnlyPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project: payoffOnlyProject,
      shot: proofShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(payoffOnlyPrompt, /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)
  assert.doesNotMatch(payoffOnlyPrompt, /Opening Hook Priority:/i)
  assert.doesNotMatch(payoffOnlyPrompt, /Snap Close:/i)

  const closeOnlyProject = makeProject({
    tightenOpening: false,
    addImmediatePayoff: false,
    increaseMidVariation: false,
    strengthenCtaUrgency: true,
    preferSnapClose: true,
  })
  closeOnlyProject.blueprint.shots = [hookShot, proofShot, ctaShot]
  const closeOnlyPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project: closeOnlyProject,
      shot: ctaShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(closeOnlyPrompt, /Conversion Pressure: Make the action outcome immediate and direct\./i)
  assert.match(closeOnlyPrompt, /Snap Close: End with a decisive final action beat or clean proof-to-action handoff\./i)
  assert.doesNotMatch(closeOnlyPrompt, /Opening Hook Priority:/i)
  assert.doesNotMatch(closeOnlyPrompt, /Mid-Sequence Variation:/i)

  console.log('clone shot video compose lane differentiation smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
