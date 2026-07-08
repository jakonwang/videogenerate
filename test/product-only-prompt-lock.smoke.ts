import assert from 'node:assert/strict'
import { buildProductAnalysisBoardPrompt } from '../src/main/modules/clone/productAnalysisBoard.ts'
import { getProductCanonicalSourcePrompt } from '../src/main/modules/clone/productImageSanitizer.ts'

const canonicalPrompt = getProductCanonicalSourcePrompt()
const analysisPrompt = buildProductAnalysisBoardPrompt()

assert.match(canonicalPrompt, /Do not add any hands, fingers, arms, human limbs, hand gestures, or hand actions\./i)
assert.match(analysisPrompt, /Do not add any hands, fingers, arms, human limbs, hand gestures, or hand actions in any cell\./i)
assert.match(analysisPrompt, /Output exactly one 6-panel board arranged as a clean 3x2 contact sheet\./i)
assert.match(analysisPrompt, /Generate these six exact labeled views only: Front View, Three-Quarter Front View, Side View, Rear View, Three-Quarter Rear View, Single Earring Front View\./i)
assert.match(analysisPrompt, /Each panel must include its own professional English view label rendered as clear overlay text inside the image\./i)

console.log('product only prompt lock smoke test passed')
