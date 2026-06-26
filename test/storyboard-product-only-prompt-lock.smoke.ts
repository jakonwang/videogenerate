import assert from 'node:assert/strict'
import { buildGptFramePrompt } from '../src/main/modules/clone/gptImage.ts'
import type { ShotSpec } from '../src/main/modules/clone/types.ts'

const tabletopShot = {
  id: 'shot-tabletop-product',
  index: 0,
  role: 'product_closeup',
  purpose: 'detail',
  shotType: 'closeup',
  framing: 'closeup',
  productType: 'general',
  visualPrompt: 'Static tabletop product-only close-up.',
  visualDescription: 'Product only on tabletop with no person.',
  actionDescription: 'No subject motion.',
  cameraDescription: 'Static tabletop product framing.',
  productFocus: 'product structure only',
  materialNeed: 'preserve exact structure and proportions',
  scriptText: 'Product only on tabletop.',
  status: 'empty',
} as ShotSpec

const packagingOnlyShot = {
  ...tabletopShot,
  id: 'shot-packaging-only',
  shotType: 'packaging',
  visualPrompt: 'Isolated product packaging on pure white background.',
  visualDescription: 'No person. Product only display on white background.',
  scriptText: 'Packaging only close-up with no model.',
  thumbnailPath: 'D:/tmp/product-only-white-background.png',
} as ShotSpec

const handOnlyProductShot = {
  ...tabletopShot,
  id: 'shot-hand-only-product',
  productType: 'earrings',
  visualPrompt: 'Close-up shot of fingers holding the earring only.',
  visualDescription: 'Tight close-up of fingers holding the earring only, with no ear, face, neck, or body visible.',
  actionDescription: 'Static hand-held product display only.',
  cameraDescription: 'Close-up hand-only product framing.',
  productFocus: 'exact earring structure in the fingers only',
  scriptText: 'Fingers holding the product only.',
} as ShotSpec

const tabletopPrompt = buildGptFramePrompt({
  shot: tabletopShot,
  productType: 'general',
  which: 'start',
})

const packagingOnlyPrompt = buildGptFramePrompt({
  shot: packagingOnlyShot,
  productType: 'general',
  which: 'start',
})

const handOnlyProductPrompt = buildGptFramePrompt({
  shot: handOnlyProductShot,
  productType: 'earrings',
  which: 'start',
})

assert.match(tabletopPrompt, /NO HUMAN ADDITIONS:/i)
assert.match(tabletopPrompt, /do NOT add any hands, fingers, arms, human limbs, or human interaction/i)
assert.match(tabletopPrompt, /Do NOT invent hand gestures, hand posing, or hand actions/i)

assert.match(packagingOnlyPrompt, /NO HUMAN ADDITIONS:/i)
assert.match(packagingOnlyPrompt, /do NOT add any hands, fingers, arms, human limbs, or human interaction/i)
assert.match(packagingOnlyPrompt, /Do NOT invent hand gestures, hand posing, or hand actions/i)

assert.match(handOnlyProductPrompt, /NO HUMAN ADDITIONS:/i)
assert.match(handOnlyProductPrompt, /do NOT add any hands, fingers, arms, human limbs, or human interaction/i)
assert.match(handOnlyProductPrompt, /Do NOT invent hand gestures, hand posing, or hand actions/i)

console.log('storyboard product only prompt lock smoke test passed')
