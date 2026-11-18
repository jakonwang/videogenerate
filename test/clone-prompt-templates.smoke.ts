import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'clone-prompt-templates-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, 'data')

  try {
    const { clonePromptTemplateService, getDefaultClonePromptTemplate } = await import('../src/main/modules/clone/promptTemplates')
    const { buildFinalShotVideoPositivePrompt } = await import('../src/main/modules/clone/prompt')
    const { buildGptFramePrompt } = await import('../src/main/modules/clone/gptImage')
    const { setActiveClonePromptTemplates } = await import('../src/main/modules/clone/promptTemplateRegistry')

    const shot = {
      id: 'shot_1',
      index: 0,
      scriptText: '',
      generationPrompt: '',
      visualDescription: 'hand holding the product on a desk',
      actionDescription: 'The hand rotates the product slowly',
      cameraDescription: 'close-up, slow push-in',
      productFocus: '',
      materialNeed: '',
      motion: 'zoom_in',
      framing: 'closeup',
      shotType: 'product_demo',
      compiledPrompt: '',
    } as any
    const videoPrompt = (productType: string) => buildFinalShotVideoPositivePrompt({ shot: { ...shot, productType } })

    await clonePromptTemplateService.load()

    // --- nothing saved: the built-in default is listed, active, and used
    const initial = await clonePromptTemplateService.list({ kind: 'shot_video' })
    assert.equal(initial.length, 1)
    assert.equal(initial[0].builtin, true)
    assert.equal(initial[0].active, true)
    assert.equal(initial[0].prompt, getDefaultClonePromptTemplate('shot_video'))
    assert.match(videoPrompt('bag'), /^Main Instruction:/)

    // --- unknown placeholders are rejected, because they would reach the model literally
    await assert.rejects(
      clonePromptTemplateService.save({ kind: 'shot_video', prompt: 'Show {{productName}} with {{notAThing}}' }),
      /Unknown placeholders: \{\{notAThing\}\}/,
    )
    await assert.rejects(clonePromptTemplateService.save({ kind: 'shot_video', prompt: '   ' }), /required/)
    await assert.rejects(clonePromptTemplateService.save({ kind: 'nope', prompt: 'x' }), /Unknown clone prompt kind/)
    await assert.rejects(clonePromptTemplateService.save({ kind: 'shot_video', productType: 'spaceship', prompt: 'x' }), /Unknown product category/)

    // --- saving alone changes nothing; activating does
    const allV1 = await clonePromptTemplateService.save({
      kind: 'shot_video',
      name: 'All categories test',
      prompt: 'ALL-TEMPLATE for {{productName}} on {{targetBodyPart}}. Action: {{referenceAction}}. {{faceRuleLine}}',
    })
    assert.equal(allV1.version, 1)
    assert.equal(allV1.active, false)
    assert.match(videoPrompt('bag'), /^Main Instruction:/)

    await clonePromptTemplateService.activate({ id: allV1.id, kind: 'shot_video' })
    const bagPrompt = videoPrompt('bag')
    assert.match(bagPrompt, /^ALL-TEMPLATE for Bag on Hand, Arm and Shoulder carrying the bag\. Action: The hand rotates the product slowly\./)
    assert.doesNotMatch(bagPrompt, /\{\{/)

    // --- a category-scoped version overrides the all-categories one for that category only
    const earringV1 = await clonePromptTemplateService.save({
      kind: 'shot_video',
      productType: 'earring', // product-library spelling is accepted
      prompt: 'EARRING-TEMPLATE {{productName}}',
    })
    assert.equal(earringV1.productType, 'earrings')
    await clonePromptTemplateService.activate({ id: earringV1.id, kind: 'shot_video', productType: 'earrings' })
    assert.equal(videoPrompt('earrings'), 'EARRING-TEMPLATE Earring')
    assert.match(videoPrompt('bag'), /^ALL-TEMPLATE for Bag/)
    assert.deepEqual((await clonePromptTemplateService.listActiveScopes({ kind: 'shot_video' })).sort(), ['all', 'earrings'])

    // --- editing in place keeps the version number and stays active
    const edited = await clonePromptTemplateService.save({
      id: earringV1.id,
      kind: 'shot_video',
      productType: 'earrings',
      prompt: 'EARRING-TEMPLATE-EDITED {{productName}}',
    })
    assert.equal(edited.id, earringV1.id)
    assert.equal(edited.version, 1)
    assert.equal(edited.active, true)
    assert.equal(videoPrompt('earrings'), 'EARRING-TEMPLATE-EDITED Earring')

    // --- "save as new" from the built-in default creates version 2 in that scope
    const earringV2 = await clonePromptTemplateService.save({
      id: 'builtin:shot_video',
      kind: 'shot_video',
      productType: 'earrings',
      prompt: 'EARRING-V2 {{productName}}',
    })
    assert.equal(earringV2.version, 2)
    assert.notEqual(earringV2.id, earringV1.id)

    // --- rollback copies an old version into a new active one
    const rolledBack = await clonePromptTemplateService.rollback({ id: 'builtin:shot_video', kind: 'shot_video', productType: 'earrings' })
    assert.equal(rolledBack.version, 3)
    assert.equal(rolledBack.active, true)
    assert.match(videoPrompt('earrings'), /^Main Instruction:/)
    assert.match(videoPrompt('earrings'), /unseen parts of the Earring\./)

    // --- activating the built-in default deactivates the saved versions of that scope only
    await clonePromptTemplateService.activate({ id: 'builtin:shot_video', kind: 'shot_video', productType: 'earrings' })
    const earringList = await clonePromptTemplateService.list({ kind: 'shot_video', productType: 'earrings' })
    assert.equal(earringList.filter((item) => item.active).length, 1)
    assert.equal(earringList.find((item) => item.active)?.builtin, true)
    // earrings now falls through to the all-categories template
    assert.match(videoPrompt('earrings'), /^ALL-TEMPLATE for Earring/)

    // --- storyboard templates: scoped by reference mode, placeholders filled
    const storyboardShot = { ...shot, storyboardReferenceMode: 'product_closeup', visualDescription: 'product only on a tabletop' }
    const defaultFramePrompt = buildGptFramePrompt({ shot: storyboardShot, productType: 'toy', which: 'start' })
    assert.match(defaultFramePrompt, /NO HUMAN ADDITIONS/)
    assert.doesNotMatch(defaultFramePrompt, /\{\{/)
    const storyboard = await clonePromptTemplateService.save({
      kind: 'storyboard_product',
      prompt: 'Place the {{productName}} from Image 1 into Image 2, European apartment.\n{{humanSupportRule}}',
    })
    await clonePromptTemplateService.activate({ id: storyboard.id, kind: 'storyboard_product' })
    const customFramePrompt = buildGptFramePrompt({ shot: storyboardShot, productType: 'toy', which: 'start' })
    assert.match(customFramePrompt, /^Place the Toy from Image 1 into Image 2, European apartment\.\n- NO HUMAN ADDITIONS/)
    // the model-presentation template is a different kind and is untouched
    const modelFramePrompt = buildGptFramePrompt({ shot: { ...shot, storyboardReferenceMode: 'model_presentation' }, productType: 'toy', which: 'start' })
    assert.match(modelFramePrompt, /^Look at these two reference images/)

    // --- persistence: a fresh registry is restored from disk by load()
    setActiveClonePromptTemplates([])
    assert.match(videoPrompt('bag'), /^Main Instruction:/)
    await clonePromptTemplateService.load()
    assert.match(videoPrompt('bag'), /^ALL-TEMPLATE for Bag/)

    // --- removing the active version falls back to the default
    assert.deepEqual(await clonePromptTemplateService.remove({ id: allV1.id }), { removed: true })
    assert.deepEqual(await clonePromptTemplateService.remove({ id: allV1.id }), { removed: false })
    assert.match(videoPrompt('bag'), /^Main Instruction:/)

    // --- script analysis default keeps its two placeholders and no output contract
    const scriptDefault = getDefaultClonePromptTemplate('script_analysis')
    assert.match(scriptDefault, /Target market: \{\{targetMarket\}\}\. Product category: \{\{productCategory\}\}\./)
    assert.doesNotMatch(scriptDefault, /JSON shape|Shot timeline/)
    const described = clonePromptTemplateService.describe()
    assert.deepEqual(described.kinds.map((item) => item.kind), ['shot_video', 'storyboard_model', 'storyboard_product', 'script_analysis'])
    assert.equal(described.productTypes[0], 'all')
    assert.equal(described.productTypes.length, 11)
  } finally {
    await rm(root, { recursive: true, force: true })
  }

  console.log('clone prompt templates smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
