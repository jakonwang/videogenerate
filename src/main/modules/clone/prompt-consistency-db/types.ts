export type DbPromptRiskFlag =
  | 'high_risk_product_category'
  | 'small_detail_product'
  | 'reflective_material'
  | 'weak_identity_description'
  | 'cinematic_override_risk'
  | 'extra_decoration_risk'
  | 'geometry_drift_risk'
  | 'category_switch_risk'
  | 'motion_occlusion_risk'
  | 'reference_anchor_gap'

export type DbProductRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type DbPromptLayerName =
  | 'IDENTITY_LAYER'
  | 'ANCHOR_LAYER'
  | 'CONSISTENCY_LAYER'
  | 'PRODUCT_DESCRIPTION_LAYER'
  | 'SHOT_LAYER'
  | 'MOTION_LAYER'
  | 'STYLE_LAYER'
  | 'PERFORMANCE_LAYER'
  | 'NEGATIVE_LAYER'

export type DbAnchorSource = 'product_type_rule' | 'shot_field' | 'product_analysis' | 'manual'

export type DbIdentityAnchorRow = {
  id: string
  project_id: string
  shot_id: string
  anchor_key: string
  anchor_value: string
  confidence: number
  source: DbAnchorSource
  sort_order: number
  created_at: number
}

export type DbShotRiskFlagRow = {
  id: string
  project_id: string
  shot_id: string
  risk_flag: DbPromptRiskFlag
  severity: DbProductRiskLevel
  created_at: number
}

export type DbShotPatchType =
  | 'identity_patch'
  | 'anchor_patch'
  | 'consistency_patch'
  | 'anti_variation_patch'
  | 'negative_patch'

export type DbShotPatchRow = {
  id: string
  project_id: string
  shot_id: string
  patch_type: DbShotPatchType
  patch_text: string
  created_at: number
  updated_at: number
}

export type DbPromptLayerRow = {
  id: string
  project_id: string
  shot_id: string
  layer_name: DbPromptLayerName
  layer_priority: number
  layer_text: string
  created_at: number
}

export type DbShotReportRow = {
  id: string
  project_id: string
  shot_id: string
  product_type: string
  risk_level: DbProductRiskLevel
  strict_consistency_mode: number
  reference_priority_mode: 'standard' | 'hard'
  compiler_version: string
  policy_version: string
  compiled_prompt: string
  compiled_negative_prompt: string
  source_prompt_hash: string
  report_json: string
  created_at: number
  updated_at: number
}

export type DbProjectConsistencyRow = {
  project_id: string
  compiler_version: string
  policy_version: string
  last_compiled_at: number | null
  strict_mode_default: number
  summary_json: string
  created_at: number
  updated_at: number
}

export type DbCompilationHistoryRow = {
  id: string
  project_id: string
  shot_id: string
  compiler_version: string
  policy_version: string
  risk_level: DbProductRiskLevel
  compiled_prompt: string
  compiled_negative_prompt: string
  snapshot_json: string
  created_at: number
}
