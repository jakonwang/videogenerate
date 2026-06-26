import assert from 'node:assert/strict'
import { buildProductAnalysisBoardPrompt } from '../src/main/modules/clone/productAnalysisBoard.ts'
import { getProductCanonicalSourcePrompt } from '../src/main/modules/clone/productImageSanitizer.ts'

const canonicalPrompt = getProductCanonicalSourcePrompt()
const analysisPrompt = buildProductAnalysisBoardPrompt()

assert.match(canonicalPrompt, /Do not add any hands, fingers, arms, human limbs, hand gestures, or hand actions\./i)
assert.match(analysisPrompt, /Do not add any hands, fingers, arms, human limbs, hand gestures, or hand actions in any cell\./i)

console.log('product only prompt lock smoke test passed')
