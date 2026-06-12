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
  assert.match(prompt, /NO INFERENCE RULE: Do not infer, reconstruct, redesign, or generate unseen parts of the Earring\./i)
  assert.match(prompt, /STRUCTURE LOCK: Preserve the exact visible structure, silhouette, proportions, connection points, and orientation from the reference image\./i)
  assert.match(prompt, /Keep realistic micro-shadows consistent with the scene and product placement\./i)
  assert.match(prompt, /Implement Subtle handheld close-up on the ear area with highly controlled subtle handheld movement to simulate natural smartphone filming in real life\./i)
  assert.match(prompt, /The earring sways naturally under gravity with minimal realistic movement\./i)
  assert.match(prompt, /The camera angle remains tightly cropped on the Ear lobe, keeping the model's eyes, nose, and lips completely out of the frame or naturally turned away to maintain absolute privacy and anonymity\./i)
  assert.match(prompt, /The model must remain completely silent\. No talking, no speaking voice, no lip-sync, no mouth performance, no vocalization, no open-mouth speaking expression, no speech-like lip shapes, and no presenter-style delivery\. Keep lips closed or only minimally relaxed at all times\./i)
  assert.doesNotMatch(prompt, /\[ABSOLUTE RULES\]|\[ROLE MAP\]|\[SHOT CONTROL\]|\[FACE CONTROL\]|\[LIGHTING CONTROL\]/i)
  assert.doesNotMatch(prompt, /100% strict structural consistency|millimeter precision|tiny 3 degrees|natural physical inertia|natural ambient occlusion/i)
  console.log('clone shot video jewelry prompt v2 lock smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
