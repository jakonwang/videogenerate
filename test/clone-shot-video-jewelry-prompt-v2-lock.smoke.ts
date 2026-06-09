import assert from 'node:assert/strict'

async function main() {
  const { buildFinalShotVideoPositivePrompt } = await import('../src/main/modules/clone/prompt')

  const prompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'shot_1',
      index: 0,
      productType: 'earrings' as any,
      scriptText: '展示耳环佩戴效果',
      generationPrompt: 'close-up silver earring with realistic metallic and stone detail',
      visualDescription: 'close-up of model wearing the earrings in a real social-commerce scene',
      actionDescription: 'slight head turn and subtle hand touch near the ear',
      cameraDescription: 'closeup framing, gentle push-in',
      productFocus: 'keep earring structure and material readable',
      materialNeed: 'S925 silver hoop earrings with clear stones and star pendant',
      motion: 'subtle camera movement',
      framing: 'closeup',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
    },
    productIdentityText: 'exact same bound product only',
    productMode: 'STRICT' as any,
  })

  assert.match(prompt, /^Main Instruction: A natural, crisp, high-definition \(HD\) 60fps video with a handheld smartphone shooting look/i)
  assert.match(prompt, /The Earring must retain 100% strict structural consistency and clear geometric details from start to finish\./i)
  assert.match(prompt, /the model's Ear lobe must dynamically re-calculate/i)
  assert.match(prompt, /Implement Subtle handheld close-up on the ear area with a highly controlled, microscopic handheld camera shake/i)
  assert.match(prompt, /The model slightly tilts her head by a tiny 3 degrees, causing the jewelry piece to respond naturally to gravity, swaying with a realistic, micro-pendulum effect\./i)
  assert.match(prompt, /The camera angle remains tightly cropped on the Ear lobe, keeping the model's eyes, nose, and lips completely out of the frame or naturally turned away to maintain absolute privacy and anonymity\./i)
  assert.match(prompt, /The model must remain completely silent\. No talking, no speaking voice, no lip-sync, no mouth performance, no vocalization, and no presenter-style delivery\./i)
  assert.doesNotMatch(prompt, /\[ABSOLUTE RULES\]|\[ROLE MAP\]|\[SHOT CONTROL\]|\[FACE CONTROL\]|\[LIGHTING CONTROL\]/i)
  console.log('clone shot video jewelry prompt v2 lock smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
