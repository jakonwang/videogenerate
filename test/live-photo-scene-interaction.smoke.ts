import assert from 'node:assert/strict'

import { buildReferenceReplacementNegativePrompt } from '../src/main/modules/live-photo/service'
import {
  buildLivePhotoSceneInteractionNegativeTerms,
  buildLivePhotoSceneInteractionPromptRules,
  normalizeLivePhotoSceneInteraction,
} from '../src/main/modules/live-photo/sceneInteraction'

function main() {
  const held = normalizeLivePhotoSceneInteraction({
    mode: 'held',
    confidence: 0.96,
    support: 'pinched between two fingertips',
    occlusion: 'fingertips overlap the lower ring band',
    revision: 2,
    updatedAt: 10,
  })
  assert.ok(held)
  assert.equal(held.mode, 'held')
  assert.equal(normalizeLivePhotoSceneInteraction({ mode: 'worn', confidence: 0.69 })?.mode, 'unknown')

  const rules = buildLivePhotoSceneInteractionPromptRules(held).join('\n')
  assert.match(rules, /held or pinched for display/i)
  assert.match(rules, /do not put the product on a finger/i)
  assert.match(rules, /pinched between two fingertips/i)
  assert.match(rules, /fingertips overlap the lower ring band/i)

  const heldNegatives = buildLivePhotoSceneInteractionNegativeTerms(held)
  assert.ok(heldNegatives.includes('ring worn on finger'))
  assert.ok(!heldNegatives.includes('hand holding product'))

  const wornNegatives = buildLivePhotoSceneInteractionNegativeTerms({
    mode: 'worn',
    confidence: 0.95,
    revision: 1,
    updatedAt: 1,
  })
  assert.ok(wornNegatives.includes('product held for display'))

  const scenarios = [
    { mode: 'placed' as const, expectedRule: /resting on a surface/i, expectedNegative: 'floating product' },
    { mode: 'hanging' as const, expectedRule: /visible suspension point/i, expectedNegative: 'missing suspension point' },
    { mode: 'attached' as const, expectedRule: /attached to another object/i, expectedNegative: 'missing attachment point' },
    { mode: 'none' as const, expectedRule: /no physical support is visible/i, expectedNegative: 'added hands' },
  ]
  for (const scenario of scenarios) {
    const interaction = normalizeLivePhotoSceneInteraction({
      mode: scenario.mode,
      confidence: 0.95,
      revision: 1,
      updatedAt: 1,
    })
    assert.ok(interaction)
    assert.match(buildLivePhotoSceneInteractionPromptRules(interaction).join('\n'), scenario.expectedRule)
    assert.ok(buildLivePhotoSceneInteractionNegativeTerms(interaction).includes(scenario.expectedNegative))
  }

  const fullNegativePrompt = buildReferenceReplacementNegativePrompt({ sceneInteraction: held })
  assert.match(fullNegativePrompt, /ring worn on finger/i)
  assert.doesNotMatch(fullNegativePrompt, /hand holding product/i)
  assert.doesNotMatch(fullNegativePrompt, /human interaction/i)

  console.log('live photo scene interaction smoke test passed')
}

main()
