import type { PromptRiskFlag } from './types'

export const PROMPT_CONSISTENCY_COMPILER_VERSION = 'pc-1.0.0'
export const PROMPT_CONSISTENCY_POLICY_VERSION = 'pc-policy-1.2.0'

export const HIGH_RISK_PRODUCT_TYPES = new Set([
  'earrings',
  'ring',
  'rings',
  'necklace',
  'necklaces',
  'bracelet',
  'bracelets',
  'bag',
  'bags',
  'shoes',
  'beauty',
  'fashion_accessory',
  'fashion accessories',
  'beauty products',
])

export const CINEMATIC_OVERRIDE_TERMS = [
  'transform',
  'reinterpret',
  'stylized',
  'fantasy',
  'magical',
  'sparkling',
  'morphing',
  'luxury reinterpretation',
  'abstract',
  'glowing',
]

export const REFLECTIVE_HINTS = ['metal', 'reflective', 'chrome', 'glossy', 'mirror', 'gem', 'jewelry', 'gold', 'silver']

export const DEFAULT_NEGATIVE_FLAGS: PromptRiskFlag[] = [
  'extra_decoration_risk',
  'geometry_drift_risk',
  'category_switch_risk',
]
