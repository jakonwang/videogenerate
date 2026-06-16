import assert from 'node:assert/strict'

async function main() {
  const { __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')

  const shot = {
    id: 'service_hook_shot',
    index: 0,
    purpose: 'hook',
    startSec: 0,
    durationSec: 2.3,
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

  const project = {
    id: 'service-rhythm-preview-project',
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
      totalDurationSec: 2.3,
      referenceAspectRatio: '9:16',
      scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
      shots: [shot],
      analysisNotes: [],
      transcript: '',
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

  const preview = await __test_buildShotVideoPromptPreviewText({
    project,
    shot,
    productType: 'general',
    productAnalysisText: 'hero product',
  })

  assert.match(String(preview.effectiveShot.aiPrompt || ''), /Hook Rhythm: The first beat must communicate product value immediately, not after a soft setup\./i)
  assert.match(String(preview.effectiveShot.aiPrompt || ''), /Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot\./i)
  assert.ok(String(preview.effectiveShot.compiledPrompt || '').trim().startsWith('Main Instruction:'))
  assert.match(String(preview.scriptSpliceText || ''), /soft setup before product payoff/i)

  const shotLayer = preview.compiled.layers.find((item: any) => item.name === 'SHOT_LAYER')
  assert.ok(shotLayer)
  assert.match(String(shotLayer?.text || ''), /Hook Rhythm: The first beat must communicate product value immediately, not after a soft setup\./i)
  assert.match(String(shotLayer?.text || ''), /Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot\./i)

  console.log('clone shot video service rhythm preview smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
