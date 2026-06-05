import assert from 'node:assert/strict'

async function main() {
  const { buildFinalShotVideoPositivePrompt } = await import('../src/main/modules/clone/prompt')

  const prompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'shot_audio_safe',
      index: 0,
      productType: 'earrings' as any,
      scriptText: '展示耳环佩戴效果',
      generationPrompt: 'close-up jewelry wearing demo',
      visualDescription: 'close-up of model wearing the earrings in a real ecommerce setting',
      actionDescription: 'subtle head turn and gentle hand movement near the ear',
      cameraDescription: 'closeup framing, gentle push-in',
      productFocus: 'keep product structure and material readable',
      materialNeed: 'silver earring with clear stones',
      motion: 'subtle camera movement',
      framing: 'closeup',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
    },
    productIdentityText: 'exact same bound product only',
    productMode: 'STRICT' as any,
  })

  assert.doesNotMatch(prompt, /\bspeaking\b/i)
  assert.doesNotMatch(prompt, /\bdialogue\b/i)
  assert.doesNotMatch(prompt, /\blip-sync\b/i)
  assert.doesNotMatch(prompt, /\bmouth shapes\b/i)
  assert.match(prompt, /host-style/i)
  console.log('clone shot video audio filter safe prompt smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
