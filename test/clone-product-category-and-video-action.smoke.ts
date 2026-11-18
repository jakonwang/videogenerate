import assert from 'node:assert/strict'

async function main() {
  const {
    normalizeCloneProductType,
    isEarringTarget,
    isJewelryTarget,
    inferCloneProductTypeFromText,
  } = await import('../src/main/modules/clone/productCategory')
  const { buildFinalShotVideoPositivePrompt, sanitizeJewelryGenerationPrompt } = await import('../src/main/modules/clone/prompt')

  // --- category normalisation: the product library types map onto clone types
  assert.equal(normalizeCloneProductType('earring'), 'earrings')
  assert.equal(normalizeCloneProductType('earrings'), 'earrings')
  for (const type of ['necklace', 'ring', 'bracelet', 'phone_case', 'clothes', 'bag', 'shoes', 'toy'] as const) {
    assert.equal(normalizeCloneProductType(type), type)
  }
  assert.equal(normalizeCloneProductType('something else'), 'general')
  assert.equal(normalizeCloneProductType(undefined), 'general')

  // --- keyword false positives that used to flip products into earrings / jewelry
  const trickyText =
    'A gold phone case near the window in a bright studio with clear silver trim, model wearing a hoodie during the demo under a ring light'
  assert.equal(isEarringTarget('general', trickyText), false)
  assert.equal(isJewelryTarget('general', trickyText), false)
  assert.equal(inferCloneProductTypeFromText('model wearing a jacket during a studio shoot'), 'clothes')
  // an explicit category always wins over text
  assert.equal(isEarringTarget('phone_case', 'held next to her earrings'), false)
  assert.equal(isJewelryTarget('clothes', 'styled with a necklace'), false)
  assert.equal(isEarringTarget('general', 'close-up of drop earrings on the ear'), true)
  assert.equal(isJewelryTarget('general', 'a silver ring on the finger'), true)
  assert.equal(isJewelryTarget('necklace'), true)

  // a non-jewelry prompt must not receive the jewelry restraint block
  const caseGenerationPrompt = sanitizeJewelryGenerationPrompt('Gold phone case held in a studio during the demo', 'phone_case')
  assert.doesNotMatch(caseGenerationPrompt, /jewelry/i)

  const baseShot = {
    id: 'shot_1',
    index: 0,
    scriptText: '',
    generationPrompt: '',
    cameraDescription: 'medium shot, slow pan right',
    productFocus: 'keep the product readable',
    materialNeed: '',
    motion: 'pan_right',
    framing: 'medium',
    compiledPrompt: '',
  }

  // --- clothes: model presentation follows the base image instead of forcing a wrist crop
  const clothesPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      ...baseShot,
      productType: 'clothes' as any,
      visualDescription: 'half-body model wearing the knit cardigan in a bedroom',
      actionDescription: 'The model turns left and right, then lifts the hem to show the fabric',
      shotType: 'model_demo' as any,
      storyboardReferenceMode: 'model_presentation' as any,
    },
  })
  assert.match(clothesPrompt, /unseen parts of the Garment\./)
  assert.match(clothesPrompt, /Reference Action: .*turns left and right, then lifts the hem to show the fabric\./)
  assert.match(clothesPrompt, /Reference Scene Beat: .*knit cardigan in a bedroom\./)
  assert.match(clothesPrompt, /Face Framing: Follow the base image framing exactly/)
  assert.doesNotMatch(clothesPrompt, /Wrist and Fingers|Absolute Anonymity: The camera angle/)
  assert.match(clothesPrompt, /The model must remain completely silent\./)

  // --- a clothes detail shot still stays cropped
  const clothesDetailPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      ...baseShot,
      productType: 'clothes' as any,
      visualDescription: 'macro of the knitted cuff texture',
      actionDescription: 'Fingers pinch and stretch the cuff',
      shotType: 'closeup' as any,
      storyboardReferenceMode: 'product_closeup' as any,
    },
  })
  assert.match(clothesDetailPrompt, /Absolute Anonymity: The camera angle remains tightly cropped on the Torso and Outfit/)

  // --- gold / studio wording must not turn a phone case into an earring
  const casePrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      ...baseShot,
      productType: 'phone_case' as any,
      visualDescription: 'gold phone case held near a window in a studio',
      actionDescription: 'The hand flips the phone to reveal the back of the case',
      shotType: 'product_demo' as any,
    },
  })
  assert.match(casePrompt, /unseen parts of the Phone Case\./)
  assert.match(casePrompt, /Reference Action: .*flips the phone to reveal the back of the case\./)
  assert.doesNotMatch(casePrompt, /earring|Ear lobe/i)

  // --- new categories get their own wording
  const expectations: Array<[string, RegExp, RegExp]> = [
    ['necklace', /unseen parts of the Necklace\./, /cropped on the Collarbone and Neck/],
    ['bracelet', /unseen parts of the Bracelet\./, /cropped on the Wrist and Hand/],
    ['shoes', /unseen parts of the Shoes\./, /cropped on the Feet and Ankles/],
    ['bag', /unseen parts of the Bag\./, /cropped on the Hand, Arm and Shoulder carrying the bag/],
  ]
  for (const [productType, namePattern, bodyPattern] of expectations) {
    const prompt = buildFinalShotVideoPositivePrompt({
      shot: { ...baseShot, productType: productType as any, visualDescription: '', actionDescription: '', shotType: 'closeup' as any },
    })
    assert.match(prompt, namePattern)
    assert.match(prompt, bodyPattern)
    // no empty bullet or stray blank line where the optional reference lines would be
    assert.doesNotMatch(prompt, /ANONYMITY:\n\n/)
    assert.doesNotMatch(prompt, /\{\{/)
  }

  // --- spoken actions never reach the prompt
  const spokenPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      ...baseShot,
      productType: 'general' as any,
      visualDescription: 'creator holding a water bottle',
      actionDescription: 'She talks to camera with an open mouth. Then she shakes the bottle',
      shotType: 'model_demo' as any,
    },
  })
  assert.doesNotMatch(spokenPrompt, /talks to camera|open mouth\./i)
  assert.match(spokenPrompt, /Reference Action: .*shakes the bottle\./)

  // --- "$" inside shot text must be kept literally
  const dollarPrompt = buildFinalShotVideoPositivePrompt({
    shot: {
      ...baseShot,
      productType: 'toy' as any,
      visualDescription: 'toy next to a $1 price tag',
      actionDescription: 'Hand pushes the toy forward',
      shotType: 'product_demo' as any,
    },
  })
  assert.match(dollarPrompt, /\$1 price tag/)

  console.log('clone product category and video action smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
