import assert from 'node:assert/strict'

async function main() {
  const { buildFinalShotVideoPositivePrompt } = await import('../src/main/modules/clone/prompt')

  const handheldPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'shot_packaging',
      index: 0,
      productType: 'phone_case' as any,
      scriptText: 'macro side reveal for premium phone case edges',
      generationPrompt: 'premium phone case hero shot',
      visualDescription: 'close-up premium packaging style product display',
      actionDescription: 'continuous edge reveal',
      cameraDescription: 'macro sliding pan across the case edge',
      productFocus: 'keep sharp edge and matte finish readable',
      materialNeed: 'premium matte finish phone case',
      motion: 'pan_right',
      framing: 'closeup',
      shotType: 'product_demo' as any,
      compiledPrompt: '',
    },
    productIdentityText: 'exact same bound product only',
    productMode: 'STRICT' as any,
  })
  assert.match(handheldPrompt, /NO INFERENCE RULE: Do not infer, reconstruct, redesign, or generate unseen parts of the Product\./i)
  assert.match(handheldPrompt, /STRUCTURE LOCK: Preserve the exact visible structure, silhouette, proportions, connection points, and orientation from the reference image\./i)
  assert.match(handheldPrompt, /Keep realistic micro-shadows consistent with the scene and product placement\./i)
  assert.match(handheldPrompt, /Implement Micro-handheld camera movement focusing on the hands with highly controlled subtle handheld movement to simulate natural smartphone filming in real life\./i)
  assert.match(handheldPrompt, /The product moves minimally and naturally with realistic micro-shadows\./i)

  const jewelryPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'shot_liquid',
      index: 1,
      productType: 'earrings' as any,
      scriptText: 'close-up jewelry wearing reveal',
      generationPrompt: 'silver earring wearing showcase',
      visualDescription: 'tight crop of model wearing earrings',
      actionDescription: 'slight model movement with natural jewelry sway',
      cameraDescription: 'macro close-up with tilt',
      productFocus: 'keep earring silhouette and metallic texture crisp',
      materialNeed: 'silver earring with premium gemstone detail',
      motion: 'push_in',
      framing: 'closeup',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
    },
    productIdentityText: 'exact same bound product only',
    productMode: 'STRICT' as any,
  })
  assert.match(jewelryPrompt, /NO INFERENCE RULE: Do not infer, reconstruct, redesign, or generate unseen parts of the Earring\./i)
  assert.match(jewelryPrompt, /STRUCTURE LOCK: Preserve the exact visible structure, silhouette, proportions, connection points, and orientation from the reference image\./i)
  assert.match(jewelryPrompt, /Keep realistic micro-shadows consistent with the scene and product placement\./i)
  assert.match(jewelryPrompt, /Implement Subtle handheld close-up on the ear area with highly controlled subtle handheld movement to simulate natural smartphone filming in real life\./i)
  assert.match(jewelryPrompt, /The earring sways naturally under gravity with minimal realistic movement\./i)

  const accessoryPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      id: 'shot_accessory',
      index: 2,
      productType: 'general' as any,
      scriptText: 'macro ring detail reveal on fingers',
      generationPrompt: 'premium ring on hand',
      visualDescription: 'macro accessory display on fingers',
      actionDescription: 'gentle finger motion under premium light',
      cameraDescription: 'macro sliding pan across fingers',
      productFocus: 'keep ring edges and reflections crisp',
      materialNeed: 'luxury metallic ring with sharp edge detail',
      motion: 'slide_left',
      framing: 'closeup',
      shotType: 'model_demo' as any,
      compiledPrompt: '',
    },
    productIdentityText: 'exact same bound product only',
    productMode: 'STRICT' as any,
  })
  assert.match(accessoryPrompt, /NO INFERENCE RULE: Do not infer, reconstruct, redesign, or generate unseen parts of the Ring\./i)
  assert.match(accessoryPrompt, /STRUCTURE LOCK: Preserve the exact visible structure, silhouette, proportions, connection points, and orientation from the reference image\./i)
  assert.match(accessoryPrompt, /Keep realistic micro-shadows consistent with the scene and product placement\./i)
  assert.match(accessoryPrompt, /Implement Subtle handheld sliding tilt across the fingers with highly controlled subtle handheld movement to simulate natural smartphone filming in real life\./i)
  assert.match(accessoryPrompt, /The accessory moves minimally and naturally with realistic micro-shadows\./i)
  assert.doesNotMatch(accessoryPrompt, /100% strict structural consistency|millimeter precision|tiny 3 degrees|natural physical inertia|natural ambient occlusion/i)

  console.log('clone shot video physical lighting lock template smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
