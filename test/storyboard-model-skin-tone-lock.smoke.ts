import assert from 'node:assert/strict'

async function main() {
  const { buildModelIdentityLockText } = await import('../src/main/modules/clone/gptImage')

  const text = buildModelIdentityLockText({
    id: 'pack_skin_lock',
    description: 'Selected model identity reused for this clone project',
    market: 'tiktok',
    gender: 'female',
    ageRange: 'young adult',
    hairStyle: 'long dark hair',
    skinTone: 'natural warm skin tone',
    outfitStyle: 'casual',
    mood: 'calm',
    sceneStyle: 'lifestyle',
    imagePaths: ['model-1.png'],
  } as any)

  assert.match(text, /Keep the model skin tone and complexion consistent with Image 2: natural warm skin tone\./i)
  assert.match(text, /Do not drift lighter, darker, cooler, or warmer across frames\./i)

  console.log('storyboard model skin tone lock smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
