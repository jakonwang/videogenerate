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

  assert.match(prompt, /Use reference image as visual guide/i)
  assert.match(prompt, /Flat diffuse lighting/i)
  assert.match(prompt, /No specular highlights/i)
  assert.match(prompt, /Constant brightness/i)
  assert.match(prompt, /Very subtle movement only, maintaining original viewing angle/i)
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
