import assert from 'node:assert/strict'

async function main() {
  const { __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')

  const shot = {
    id: 'service_motion_default',
    index: 0,
    purpose: 'solution',
    startSec: 0,
    durationSec: 2.5,
    scriptRole: 'solution',
    scriptText: 'show the product clearly in use',
    generationPrompt: 'usage proof with consistency',
    visualDescription: 'close usage proof shot',
    actionDescription: 'steady product handling',
    cameraDescription: '',
    productFocus: 'keep product stable and visible',
    materialNeed: 'usage proof',
    motion: 'static',
    framing: 'closeup',
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
    id: 'service-preview-motion-default-project',
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
      totalDurationSec: 2.5,
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

  const compiledPrompt = String(preview.effectiveShot.compiledPrompt || '')
  assert.match(compiledPrompt, /gentle visible sense of progression|controlled handheld motion that still feels alive/i)
  assert.doesNotMatch(compiledPrompt, /mostly static handheld shot with tiny natural micro movement/i)

  console.log('clone shot video service preview motion defaults smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
