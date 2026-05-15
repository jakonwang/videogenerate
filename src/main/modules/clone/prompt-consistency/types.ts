export type ProductRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type PromptRiskFlag =
  | 'high_risk_product_category'
  | 'small_detail_product'
  | 'reflective_material'
  | 'weak_identity_description'
  | 'cinematic_override_risk'
  | 'extra_decoration_risk'
  | 'geometry_drift_risk'
  | 'category_switch_risk'
  | 'motion_occlusion_risk'

export type IdentityAnchor = {
  key:
    | 'shape'
    | 'silhouette'
    | 'material'
    | 'proportion'
    | 'structure'
    | 'color'
    | 'reflective_behavior'
    | 'count'
    | 'attachment'
    | 'surface_finish'
  value: string
  confidence: number
  source: 'product_type_rule' | 'shot_field' | 'product_analysis' | 'manual'
}

export type PromptLayerName =
  | 'IDENTITY_LAYER'
  | 'ANCHOR_LAYER'
  | 'CONSISTENCY_LAYER'
  | 'SHOT_LAYER'
  | 'MOTION_LAYER'
  | 'STYLE_LAYER'
  | 'PERFORMANCE_LAYER'
  | 'NEGATIVE_LAYER'

export type PromptLayerBlock = {
  name: PromptLayerName
  priority: number
  text: string
}

export type ConsistencyPatchSet = {
  identityPatch: string
  anchorPatch: string
  consistencyPatch: string
  antiVariationPatch: string
  negativePatch: string
}

export type PromptConsistencyReport = {
  projectId: string
  shotId: string
  productType: string
  riskLevel: ProductRiskLevel
  riskFlags: PromptRiskFlag[]
  strictConsistencyMode: boolean
  referencePriorityMode: 'standard' | 'hard'
  anchors: IdentityAnchor[]
  layers: PromptLayerBlock[]
  patches: ConsistencyPatchSet
  finalPrompt: string
  finalNegativePrompt: string
  compilerVersion: string
  policyVersion: string
  sourcePromptHash: string
}

export type PromptCompileResult = PromptConsistencyReport
