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
  assert.match(prompt, /^Main Instruction: A crisp, high-definition \(HD\) 60fps short-form product video that continues the provided base image as a real camera recording\./i)
  assert.match(prompt, /The camera angle remains tightly cropped on the Ear lobe, keeping the model's eyes, nose, and lips completely out of the frame or naturally turned away to maintain absolute privacy and anonymity\./i)
  assert.match(prompt, /The model must remain completely silent\. No talking, no speaking voice, no lip-sync, no mouth performance, no vocalization, no open-mouth speaking expression, no speech-like lip shapes, and no presenter-style delivery\./i)
  assert.match(prompt, /Every visible frame must read as fully silent, never mid-speech, never about to speak, and never finishing a spoken line\./i)
  assert.match(prompt, /Visual Aesthetic: Match the base image: same color grade, depth of field and polish level, realistic skin textures, true-to-life product materials\./i)
  assert.match(prompt, /Absolutely PROHIBIT robotic PPT-style panning\/zooming and any CGI or 3D-render look\./i)
  assert.doesNotMatch(prompt, /\[RESTRICTIONS\]|\[OUTPUT\]|Silent visual commercial video/i)
  console.log('clone shot video audio filter safe prompt smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
