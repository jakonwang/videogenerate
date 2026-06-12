import assert from 'node:assert/strict'

async function main() {
  const { buildFinalShotVideoPositivePrompt, buildShotScriptConstraintText } = await import('../src/main/modules/clone/prompt')

  const shot = {
    id: 'shot_silent_override',
    index: 0,
    productType: 'earrings' as any,
    scriptText: 'Model talks to camera and explains why the earrings are good.',
    narrationText: 'Say this is lightweight and elegant.',
    generationPrompt: 'close-up jewelry demo, presenter speaking to camera, open mouth expression',
    visualDescription: 'close-up of model wearing the earrings in a real ecommerce setting',
    actionDescription: 'speaker presentation with talking mouth and product near the ear',
    cameraDescription: 'closeup framing, gentle push-in',
    productFocus: 'keep product structure and material readable',
    materialNeed: 'silver earring with clear stones',
    motion: 'subtle camera movement',
    framing: 'closeup',
    shotType: 'model_demo' as any,
    compiledPrompt: '',
  }

  const constraint = buildShotScriptConstraintText(shot as any)
  assert.match(constraint, /Silent visual performance only/i)
  assert.match(constraint, /Every frame must read as silent, never mid-speech, never about to speak, and never finishing a spoken line\./i)
  assert.doesNotMatch(constraint, /Model talks to camera/i)
  assert.doesNotMatch(constraint, /speaker presentation/i)
  assert.doesNotMatch(constraint, /open mouth expression/i)

  const prompt = buildFinalShotVideoPositivePrompt({
    shot: shot as any,
    productIdentityText: 'exact same bound product only',
    productMode: 'STRICT' as any,
  })

  assert.match(prompt, /The model must remain completely silent\./i)
  assert.match(prompt, /Every visible frame must read as fully silent, never mid-speech, never about to speak, and never finishing a spoken line\./i)
  assert.doesNotMatch(prompt, /talks to camera|talking to camera|speaking to camera/i)
  assert.doesNotMatch(prompt, /\bspeaker presentation\b/i)
  console.log('clone shot video silent lock overrides speech cues smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
