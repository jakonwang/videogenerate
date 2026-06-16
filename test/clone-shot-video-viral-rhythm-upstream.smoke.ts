import assert from 'node:assert/strict'

async function main() {
  const { buildViralRhythmShotGuidance } = await import('../src/main/modules/clone/prompt')
  const { compilePromptConsistency } = await import('../src/main/modules/clone/prompt-consistency/compiler')

  const hookGuidance = buildViralRhythmShotGuidance({
    scriptRole: 'hook' as any,
    scriptText: 'soft setup before product payoff',
    generationPrompt: 'ambient opener without explicit result',
    visualDescription: 'wide lifestyle opener before the product moment lands',
    actionDescription: 'gentle setup motion only',
    cameraDescription: 'slow opening drift',
    productFocus: 'show product value quickly',
    motion: 'static' as any,
    framing: 'wide' as any,
    shotType: 'model_demo' as any,
  })

  assert.match(hookGuidance, /Hook Rhythm: The first beat must communicate product value immediately, not after a soft setup\./i)
  assert.match(hookGuidance, /Hook Framing: Tighten the composition so the payoff reads instantly on a vertical short-video screen\./i)
  assert.match(hookGuidance, /Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot\./i)

  const proofGuidance = buildViralRhythmShotGuidance({
    scriptRole: 'proof' as any,
    scriptText: 'confirm the result clearly',
    generationPrompt: 'static proof coverage',
    visualDescription: 'clear result state',
    actionDescription: 'steady result hold',
    cameraDescription: 'clean proof closeup',
    productFocus: 'keep result readable',
    motion: 'static' as any,
    framing: 'closeup' as any,
    shotType: 'closeup' as any,
  })

  assert.match(proofGuidance, /Middle Rhythm: Keep the shot commercially readable and moving forward\./i)
  assert.match(proofGuidance, /Momentum Lift: Add one realistic emphasis shift in motion, framing, or reveal timing so the middle section does not feel dead\./i)
  assert.match(proofGuidance, /Variation Break: Do not repeat the same static close-up coverage\./i)
  assert.match(proofGuidance, /Body Progression: If this is a close-up proof or detail shot, make sure the next visual idea can escalate into a wider use case, hand interaction, or cleaner product-context reveal\./i)
  assert.match(proofGuidance, /Proof Rhythm: This shot must feel like visible confirmation, not generic coverage\./i)
  assert.match(proofGuidance, /Proof-to-Action Bridge: Let the proof already lean toward purchase intent and closing momentum\./i)

  const ctaGuidance = buildViralRhythmShotGuidance({
    scriptRole: 'cta' as any,
    scriptText: 'close with order now intent',
    generationPrompt: 'final buy now close',
    visualDescription: 'decisive purchase-ending frame',
    actionDescription: 'direct final action',
    cameraDescription: 'tight final closeup',
    productFocus: 'keep action readable',
    motion: 'static' as any,
    framing: 'closeup' as any,
    shotType: 'closeup' as any,
  })

  assert.match(ctaGuidance, /Closing Rhythm: End on a decisive action frame with direct decision pressure, not a soft fade-out feeling\./i)
  assert.match(ctaGuidance, /CTA Pressure: Make urgency, action, or buy-now intent visually clear without becoming spammy\./i)

  const compiled = compilePromptConsistency({
    projectId: 'viral-rhythm-upstream-project',
    shot: {
      id: 'shot_hook_upstream',
      index: 0,
      scriptRole: 'hook',
      scriptText: 'soft setup before product payoff',
      generationPrompt: 'ambient opener without explicit result',
      visualDescription: 'wide lifestyle opener before the product moment lands',
      actionDescription: 'gentle setup motion only',
      cameraDescription: 'slow opening drift',
      productFocus: 'show product value quickly',
      motion: 'static',
      framing: 'wide',
      shotType: 'model_demo',
      productType: 'general',
      materialNeed: 'hero product',
      prompt: { positive: '', negative: '', cameraMotion: '', aspectRatio: '9:16' },
      uploadedAssetIds: [],
      aiEnabled: true,
      sourceMode: 'ai',
      reviewStatus: 'pending',
      durationSec: 2.2,
      startSec: 0,
      purpose: 'hook',
      scriptConfidence: 0.9,
      visual: '',
      subtitleSuggestion: '',
      narrationText: '',
      generationPromptHash: undefined as any,
    } as any,
    productDescription: 'hero product',
    productReferenceImagePaths: [],
  }).result

  const shotLayer = compiled.layers.find((item: any) => item.name === 'SHOT_LAYER')
  assert.ok(shotLayer)
  assert.match(String(shotLayer?.text || ''), /Hook Rhythm: The first beat must communicate product value immediately, not after a soft setup\./i)
  assert.match(String(shotLayer?.text || ''), /Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot\./i)

  console.log('clone shot video viral rhythm upstream smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
