import assert from 'node:assert/strict'

async function main() {
  const { buildFinalShotVideoPositivePrompt } = await import('../src/main/modules/clone/prompt')

  const hookPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'hook_patch',
      index: 0,
      productType: 'general' as any,
      scriptText: 'soft lifestyle opener before product reveal',
      generationPrompt: 'soft atmosphere intro with delayed reveal',
      visualDescription: 'ambient setup with background mood first',
      actionDescription: 'gentle setup before payoff',
      cameraDescription: 'slow opening drift',
      productFocus: 'show the product clearly once revealed',
      materialNeed: 'hero product',
      motion: 'static',
      framing: 'wide',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
      scriptRole: 'hook' as any,
    },
    composeOptimizationPatch: {
      tightenOpening: true,
      addImmediatePayoff: true,
    },
  })

  assert.match(hookPrompt, /Opening Hook Priority: Reveal the product payoff in the first beat\./i)
  assert.match(hookPrompt, /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)
  assert.match(hookPrompt, /Hook Framing: Tighten the composition so the payoff reads instantly on a vertical short-video screen\./i)
  assert.match(hookPrompt, /Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot\./i)

  const bodyPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'body_patch',
      index: 1,
      productType: 'general' as any,
      scriptText: 'show usage detail in the middle section',
      generationPrompt: 'repeated middle product demo',
      visualDescription: 'mid-sequence product use shot',
      actionDescription: 'steady repeated product handling',
      cameraDescription: 'clean centered handheld view',
      productFocus: 'keep product use readable',
      materialNeed: 'product usage',
      motion: 'static',
      framing: 'closeup',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
      scriptRole: 'solution' as any,
    },
    composeOptimizationPatch: {
      increaseMidVariation: true,
    },
  })

  assert.match(bodyPrompt, /Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive\./i)
  assert.match(bodyPrompt, /Show Upgrade: Move beyond generic usage coverage\./i)
  assert.match(bodyPrompt, /Momentum Lift: Add one realistic emphasis shift in motion, framing, or reveal timing so the middle section does not feel dead\./i)

  const unclearPayoffHookPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'unclear_payoff_hook',
      index: 11,
      productType: 'general' as any,
      scriptText: 'ambient opener before anything specific happens',
      generationPrompt: 'soft setup without explicit result',
      visualDescription: 'lifestyle setup before the product moment lands',
      actionDescription: 'gentle setup motion only',
      cameraDescription: 'slow opening drift',
      productFocus: 'eventually show the product',
      materialNeed: 'hero product',
      motion: 'static',
      framing: 'wide',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
      scriptRole: 'hook' as any,
    },
    composeOptimizationPatch: {
      addImmediatePayoff: true,
    },
  })

  assert.match(unclearPayoffHookPrompt, /Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot\./i)

  const ctaPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'cta_patch',
      index: 2,
      productType: 'general' as any,
      scriptText: 'final order now close',
      generationPrompt: 'close with direct action',
      visualDescription: 'final close with purchase intent',
      actionDescription: 'urgent order now handoff',
      cameraDescription: 'tight finish closeup',
      productFocus: 'keep product and action readable',
      materialNeed: 'offer close',
      motion: 'static',
      framing: 'closeup',
      shotType: 'closeup' as any,
      compiledPrompt: '',
      scriptRole: 'cta' as any,
    },
    composeOptimizationPatch: {
      strengthenCtaUrgency: true,
      preferSnapClose: true,
    },
  })

  assert.match(ctaPrompt, /Conversion Pressure: Make the action outcome immediate and direct\./i)
  assert.match(ctaPrompt, /Snap Close: End with a decisive final action beat or clean proof-to-action handoff\./i)
  assert.match(ctaPrompt, /Closing Rhythm: End on a decisive action frame with direct decision pressure, not a soft fade-out feeling\./i)
  assert.match(ctaPrompt, /CTA Pressure: Make urgency, action, or buy-now intent visually clear without becoming spammy\./i)

  const proofPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'proof_patch',
      index: 3,
      productType: 'general' as any,
      scriptText: 'show clear product result before close',
      generationPrompt: 'neutral product proof',
      visualDescription: 'simple proof state without strong action handoff',
      actionDescription: 'steady result hold',
      cameraDescription: 'clean proof closeup',
      productFocus: 'keep result readable',
      materialNeed: 'proof close',
      motion: 'static',
      framing: 'closeup',
      shotType: 'closeup' as any,
      compiledPrompt: '',
      scriptRole: 'proof' as any,
    },
    composeOptimizationPatch: {
      addImmediatePayoff: true,
      increaseMidVariation: true,
      strengthenCtaUrgency: true,
      preferSnapClose: true,
    },
  })

  assert.match(proofPrompt, /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)
  assert.match(proofPrompt, /Proof Upgrade: Do not stay on repeated static close-up coverage\./i)
  assert.match(proofPrompt, /Conversion Pressure: Make the action outcome immediate and direct\./i)
  assert.match(proofPrompt, /Proof-to-Action Bridge: Let the proof already lean toward purchase intent and closing momentum\./i)
  assert.match(proofPrompt, /Snap Close: End with a decisive final action beat or clean proof-to-action handoff\./i)

  console.log('clone shot video compose optimization hook smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
