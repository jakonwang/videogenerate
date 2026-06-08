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

  assert.match(prompt, /\[TYPE\]\s+Realistic ecommerce video/i)
  assert.match(prompt, /\[ABSOLUTE RULES\]/i)
  assert.match(prompt, /Product is a visual identity anchor from the canonical reference/i)
  assert.match(prompt, /\[ROLE MAP\]/i)
  assert.match(prompt, /Image 1 = product canonical source/i)
  assert.match(prompt, /\[SHOT CONTROL\]/i)
  assert.match(prompt, /Composition priority: product is the visual center, occupies 40% to 60% of the frame/i)
  assert.match(prompt, /Hierarchy: product > hands > body > face/i)
  assert.match(prompt, /\[FACE CONTROL\]/i)
  assert.match(prompt, /Do NOT show full face as the subject/i)
  assert.match(prompt, /\[LIGHTING CONTROL\]/i)
  assert.match(prompt, /Flat diffuse lighting/i)
  assert.match(prompt, /No specular highlights/i)
  assert.match(prompt, /Camera must NOT introduce new angles, perspectives, or product reinterpretation/i)
  assert.match(prompt, /Do NOT generate speaking, dialogue, lip-sync, mouth-shape acting, subtitles, watermark, logo, or UI overlay/i)
  assert.doesNotMatch(prompt, /Force non-jewelry matte coated appearance/i)
  assert.doesNotMatch(prompt, /No metallic behavior, no crystal behavior/i)
  assert.doesNotMatch(prompt, /Storyboard visual prompt:/i)
  assert.doesNotMatch(prompt, /silver earring with realistic metallic and stone detail/i)
  console.log('clone shot video jewelry prompt v2 lock smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
