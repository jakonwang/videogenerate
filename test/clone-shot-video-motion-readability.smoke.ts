import assert from 'node:assert/strict'

async function main() {
  const { buildFinalShotVideoPositivePrompt, buildReferenceLock } = await import('../src/main/modules/clone/prompt')

  const prompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'motion_readability_static',
      index: 0,
      productType: 'general' as any,
      scriptText: 'middle product demo beat',
      generationPrompt: 'clean product demo with product consistency',
      visualDescription: 'close product usage proof',
      actionDescription: 'steady product handling for proof',
      cameraDescription: 'clean handheld closeup',
      productFocus: 'keep product structure and screen position stable',
      materialNeed: 'hero product proof',
      motion: 'static',
      framing: 'closeup',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
      scriptRole: 'solution' as any,
    },
  })

  assert.match(
    prompt,
    /The overall dynamic movement must stay natural, organic, and everyday lifestyle-oriented, and it should still feel alive instead of like a static image\./i,
  )
  assert.match(
    prompt,
    /Natural Motion: Implement .* with controlled handheld motion that still feels alive and product-first\./i,
  )

  const referenceLock = buildReferenceLock({
    id: 'motion_reference_lock',
    index: 1,
    productType: 'general' as any,
    framing: 'closeup',
    motion: 'static',
    shotType: 'model_demo' as any,
    purpose: 'detail',
    visualPrompt: 'product close demonstration',
    action: 'show the product in hand',
  } as any)

  assert.match(String(referenceLock.motionPath || ''), /visible natural motion progression/i)
  assert.doesNotMatch(String(referenceLock.motionPath || ''), /mostly static handheld shot with tiny natural micro movement/i)

  console.log('clone shot video motion readability smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
