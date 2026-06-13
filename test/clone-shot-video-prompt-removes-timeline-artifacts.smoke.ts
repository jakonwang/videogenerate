import assert from 'node:assert/strict'

async function main() {
  const { buildFinalShotVideoPositivePrompt } = await import('../src/main/modules/clone/prompt')

  const prompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'shot_timeline_filter',
      index: 0,
      productType: 'earrings' as any,
      scriptText: '[CAMERA]\nClose-up.\n0.0s-2.6s Close-up shot.\nSlowly pans slightly to center the ear.\nSlight horizontal pan.',
      generationPrompt: 'close-up earring wearing demo',
      visualDescription: 'close-up of model wearing the earrings in a real ecommerce setting',
      actionDescription: 'subtle model stillness with only gentle camera movement',
      cameraDescription: '[CAMERA]\n0.0s-2.6s Close-up shot.\nSlowly pans slightly to center the ear.\nSlight horizontal pan.',
      productFocus: 'keep earring structure and ear placement readable',
      materialNeed: 'silver earrings',
      motion: 'pan_right',
      framing: 'closeup',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
    },
    productIdentityText: 'exact same bound product only',
    productMode: 'STRICT' as any,
  })

  assert.doesNotMatch(prompt, /\b0\.0s-2\.6s\b/i)
  assert.doesNotMatch(prompt, /\b2\.6s\b/i)
  assert.doesNotMatch(prompt, /\bseconds?\b/i)
  assert.doesNotMatch(prompt, /0\.0s-2\.6s Close-up shot/i)
  assert.doesNotMatch(prompt, /Extreme close-up shot/i)
  assert.match(prompt, /Slowly pans slightly to center the ear\./i)
  assert.match(prompt, /Slight horizontal pan\./i)
  assert.match(prompt, /Subtle handheld close-up on the ear area|Micro-handheld camera movement focusing on the hands|Subtle handheld sliding tilt across the fingers/i)
  assert.match(prompt, /Ear lobe|Hands and Fingers|Wrist and Fingers/i)
  console.log('clone shot video prompt timeline artifact filter smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
