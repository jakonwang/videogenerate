import assert from 'node:assert/strict'

async function main() {
  const {
    buildTiktokListingDescriptionPrompt,
    buildTiktokListingImagePrompt,
    buildTiktokListingTitlePrompt,
  } = await import('../src/main/modules/tiktok-listing/prompts')

  const jewelryCases = [
    { category: 'earring', imageExpected: /ear|earlobe/i, textExpected: /Earring|earring/i },
    { category: 'ring', imageExpected: /hand|finger/i, textExpected: /Ring|ring|band/i },
    { category: 'necklace', imageExpected: /neck|clavicle/i, textExpected: /Necklace|necklace|pendant|chain/i },
    { category: 'phone_case', imageExpected: /phone|case|camera/i, textExpected: /Phone Case|phone case|printed case/i },
    { category: 'bracelet', imageExpected: /wrist|bracelet|clasp/i, textExpected: /Bracelet|bracelet|bangle|chain bracelet/i },
  ] as const

  for (const testCase of jewelryCases) {
    for (let index = 0; index < 5; index += 1) {
      const prompt = buildTiktokListingImagePrompt({
        category: testCase.category,
        index,
        sku: 'SKU-001',
        anchorMode: index === 0 ? 'source_only' : 'source_plus_hero',
        detailText: 'gold jewelry detail',
      })
      assert.ok(prompt.trim().length > 0)
      assert.match(prompt, /Reference image priority is highest/i)
      assert.match(prompt, /Do not redesign the product/i)
      assert.match(prompt, /Cinematic styling must not override identity/i)
      assert.match(prompt, /believable real-world size/i)
      assert.match(prompt, /Do not enlarge, magnify, or exaggerate the product size/i)

      if (index === 0) {
        assert.match(prompt, /Reference image 1 is the original product truth source/i)
        assert.match(prompt, /This shot must remain product-only and no-model/i)
        assert.match(prompt, /Do not add any hands, fingers, arms, human limbs, hand gestures, or hand actions/i)
        assert.match(prompt, /Do not add ear, neck, wrist, clavicle, skin, hair, face, or any other body anchor/i)
        assert.doesNotMatch(prompt, /Subject: a model /i)
      } else {
        assert.match(prompt, /Reference image 2 is the approved hero result/i)
        assert.match(prompt, /no structural drift/i)
        assert.match(prompt, /do not progressively enlarge the item across later images/i)
        assert.match(prompt, testCase.imageExpected)
      }
    }

    const titlePrompt = buildTiktokListingTitlePrompt({
      category: testCase.category,
      language: 'zh-CN',
      sku: 'SKU-001',
      detailText: 'gold jewelry detail',
    })
    assert.match(titlePrompt, /Generate exactly 1 product title/i)
    assert.match(titlePrompt, /Keep it within 200 characters/i)
    assert.match(titlePrompt, testCase.textExpected)

    const descriptionPrompt = buildTiktokListingDescriptionPrompt({
      category: testCase.category,
      language: 'zh-CN',
      sku: 'SKU-001',
      detailText: 'gold jewelry detail',
    })
    assert.match(descriptionPrompt, /Generate exactly 1 concise product description/i)
    assert.match(descriptionPrompt, /Do not invent/i)
    assert.match(descriptionPrompt, testCase.textExpected)
  }

  console.log('tiktok listing prompts smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
