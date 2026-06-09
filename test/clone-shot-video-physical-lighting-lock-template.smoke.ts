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
  assert.match(handheldPrompt, /The Product must retain 100% strict structural consistency and clear geometric details from start to finish/i)
  assert.match(handheldPrompt, /the model's Hands and Fingers must dynamically re-calculate/i)
  assert.match(handheldPrompt, /Implement Micro-handheld camera movement focusing on the hands with a highly controlled, microscopic handheld camera shake/i)
  assert.match(handheldPrompt, /The fingers gently rotate the product a few degrees, showcasing the natural textures and everyday light reflections on its surface\./i)

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
  assert.match(jewelryPrompt, /The Earring must retain 100% strict structural consistency and clear geometric details from start to finish/i)
  assert.match(jewelryPrompt, /the model's Ear lobe must dynamically re-calculate/i)
  assert.match(jewelryPrompt, /Implement Subtle handheld close-up on the ear area with a highly controlled, microscopic handheld camera shake/i)
  assert.match(jewelryPrompt, /The model slightly tilts her head by a tiny 3 degrees, causing the jewelry piece to respond naturally to gravity, swaying with a realistic, micro-pendulum effect\./i)

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
  assert.match(accessoryPrompt, /The Ring must retain 100% strict structural consistency and clear geometric details from start to finish/i)
  assert.match(accessoryPrompt, /the model's Wrist and Fingers must dynamically re-calculate/i)
  assert.match(accessoryPrompt, /Implement Subtle handheld sliding tilt across the fingers with a highly controlled, microscopic handheld camera shake/i)
  assert.match(accessoryPrompt, /The fingers move slightly and naturally, causing subtle, realistic contact shadows and highlights to shift flawlessly across the accessory's edges\./i)

  console.log('clone shot video physical lighting lock template smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
