import assert from 'node:assert/strict'
import {
  buildLivePhotoCategorySpecificPromptRules,
  buildReferenceReplacementNegativePrompt,
} from '../src/main/modules/live-photo/service'

const starEarring = {
  type: 'earring',
  productAnalysis: {
    category: 'earrings',
    summary: 'Silver huggie hoop earrings with iridescent blue star inlay.',
    coreSubject: 'Small hinged hoop with a fixed five-pointed star motif on the front.',
    connectionStructure: 'Hinged huggie closure. Curved post snaps into a rear U-catch.',
    geometryDetails: 'Circular tubular hoop with a symmetrical five-pointed star.',
    wearingPosition: 'earlobe',
    sizeScale: 'Petite, approximately 10 to 15 millimeters in diameter.',
    matchingRules: ['Small huggie', 'Five-pointed star', 'Earlobe scale'],
    rawDescription: 'Silver star huggie earring with a hinged closure.',
  },
} as any

const bowEarring = {
  type: 'earring',
  productAnalysis: {
    category: 'earrings',
    summary: 'Silver huggie hoop earrings with a crystal bow.',
    coreSubject: 'Small hoop earring featuring a faceted crystal bow motif.',
    connectionStructure: 'Hinged huggie hoop with snap closure and a bow fixed to the front.',
    geometryDetails: 'Circular hoop with a bow made of triangular and baguette stones.',
    wearingPosition: 'earlobe',
    sizeScale: 'Petite.',
    matchingRules: ['Small huggie', 'Crystal bow', 'Earlobe scale'],
    rawDescription: 'Silver bow huggie earring with a hinged closure.',
  },
} as any

const starPrompt = buildLivePhotoCategorySpecificPromptRules(starEarring).join('\n')
assert.match(starPrompt, /Preserve the exact star motif and point count/i)
assert.doesNotMatch(starPrompt, /bow tail crystal|baguette tail stones|Preserve the exact bow motif/i)

const starNegativePrompt = buildReferenceReplacementNegativePrompt({ product: starEarring })
assert.match(starNegativePrompt, /wrong star point count/i)
assert.doesNotMatch(starNegativePrompt, /wrong bow shape/i)

const bowPrompt = buildLivePhotoCategorySpecificPromptRules(bowEarring).join('\n')
assert.match(bowPrompt, /Preserve the exact bow motif/i)
assert.doesNotMatch(bowPrompt, /Preserve the exact star motif and point count/i)

const bowNegativePrompt = buildReferenceReplacementNegativePrompt({ product: bowEarring })
assert.match(bowNegativePrompt, /wrong bow shape/i)
assert.doesNotMatch(bowNegativePrompt, /wrong star point count/i)

console.log('live photo earring prompt DNA smoke test passed')
