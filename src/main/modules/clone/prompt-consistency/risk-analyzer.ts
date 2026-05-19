import type { ShotSpec } from '../types'
import type { ProductRiskLevel, PromptRiskFlag } from './types'
import { CINEMATIC_OVERRIDE_TERMS, HIGH_RISK_PRODUCT_TYPES, REFLECTIVE_HINTS } from './constants'

export function detectProductType(shot: ShotSpec) {
  const raw = String(shot.productType || '').trim().toLowerCase()
  if (raw) return raw
  const text = [shot.materialNeed, shot.visualDescription, shot.productFocus, shot.aiPrompt, shot.generationPrompt]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (/earring|ear jewelry|ear line/.test(text)) return 'earrings'
  if (/ring/.test(text)) return 'ring'
  if (/necklace|pendant/.test(text)) return 'necklace'
  if (/bracelet|bangle/.test(text)) return 'bracelet'
  if (/bag|handbag|tote|purse/.test(text)) return 'bag'
  if (/shoe|heels|sneaker|boot/.test(text)) return 'shoes'
  if (/lipstick|serum|cream|foundation|beauty/.test(text)) return 'beauty'
  if (/accessory|fashion/.test(text)) return 'fashion_accessory'
  return raw || 'general'
}

export function analyzePromptRisk(shot: ShotSpec, productType: string) {
  const content = [
    shot.scriptText,
    shot.visualDescription,
    shot.actionDescription,
    shot.cameraDescription,
    shot.generationPrompt,
    shot.aiPrompt,
    shot.productFocus,
    shot.materialNeed,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const riskFlags = new Set<PromptRiskFlag>()
  let score = 0

  if (HIGH_RISK_PRODUCT_TYPES.has(productType)) {
    riskFlags.add('high_risk_product_category')
    score += 4
  }
  if (/(earring|ring|necklace|bracelet|gem|charm|chain|stone|logo|clasp)/.test(content)) {
    riskFlags.add('small_detail_product')
    score += 2
  }
  if (REFLECTIVE_HINTS.some((item) => content.includes(item))) {
    riskFlags.add('reflective_material')
    score += 2
  }
  if (CINEMATIC_OVERRIDE_TERMS.some((item) => content.includes(item))) {
    riskFlags.add('cinematic_override_risk')
    score += 2
  }
  if (!String(shot.productFocus || '').trim() && !String(shot.materialNeed || '').trim()) {
    riskFlags.add('weak_identity_description')
    score += 1
  }
  if (/occlusion|hidden|blur|fast|whip|dramatic movement|turn head/.test(content) || shot.motion === 'shake' || shot.motion === 'fast_cut') {
    riskFlags.add('motion_occlusion_risk')
    score += 1
  }
  riskFlags.add('extra_decoration_risk')
  riskFlags.add('geometry_drift_risk')
  riskFlags.add('category_switch_risk')

  const riskLevel: ProductRiskLevel =
    score >= 7 ? 'critical' : score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low'

  return {
    productType,
    riskLevel,
    riskFlags: Array.from(riskFlags),
    strictConsistencyMode: riskLevel === 'high' || riskLevel === 'critical',
    referencePriorityMode: (riskLevel === 'high' || riskLevel === 'critical' ? 'hard' : 'standard') as 'standard' | 'hard',
  }
}
