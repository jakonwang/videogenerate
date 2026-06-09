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

  assert.doesNotMatch(prompt, /\btalking head\b/i)
  assert.match(prompt, /^Main Instruction: A natural, crisp, high-definition \(HD\) 60fps video with a handheld smartphone shooting look/i)
  assert.match(prompt, /The camera angle remains tightly cropped on the Ear lobe, keeping the model's eyes, nose, and lips completely out of the frame or naturally turned away to maintain absolute privacy and anonymity\./i)
  assert.match(prompt, /The model must remain completely silent\. No talking, no speaking voice, no lip-sync, no mouth performance, no vocalization, and no presenter-style delivery\./i)
  assert.match(prompt, /Visual Aesthetic: Casual everyday smartphone video, natural organic color tones, realistic skin textures, soft focused background, authentic lifestyle product showcase\./i)
  assert.match(prompt, /Absolutely PROHIBIT cinematic studio setups, heavy commercial color grading, and robotic PPT-style panning\/zooming\./i)
  assert.doesNotMatch(prompt, /\[RESTRICTIONS\]|\[OUTPUT\]|Silent visual commercial video/i)
  console.log('clone shot video audio filter safe prompt smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
