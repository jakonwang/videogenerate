export type GmvMaxHelpTargetTab = 'overview' | 'sop' | 'campaigns' | 'growth' | 'rules' | 'creatives' | 'profit' | 'actions' | 'audit'

export type GmvMaxHelpChapter = {
  id: string
  targetTab: GmvMaxHelpTargetTab
  stepCount: number
  keywords: string[]
}

export type GmvMaxHelpIssue = {
  code: string
  steps: string[]
  targetTab: GmvMaxHelpTargetTab
  actionTarget: string
  approvalRequired: boolean
  rollbackSupported: boolean
}

export const GMV_MAX_HELP_CHAPTERS: GmvMaxHelpChapter[] = [
  { id: 'quick_start', targetTab: 'overview', stepCount: 4, keywords: ['start', 'setup', 'connect', 'quick'] },
  { id: 'data_sync', targetTab: 'overview', stepCount: 4, keywords: ['sync', 'report', 'catalog', 'freshness'] },
  { id: 'overview', targetTab: 'overview', stepCount: 4, keywords: ['dashboard', 'store', 'performance', 'risk'] },
  { id: 'sop', targetTab: 'sop', stepCount: 4, keywords: ['sop', 'new product', 'mature product', 'live', 'stage'] },
  { id: 'campaigns', targetTab: 'campaigns', stepCount: 4, keywords: ['campaign', 'budget', 'target roi', 'pacing'] },
  { id: 'growth', targetTab: 'growth', stepCount: 4, keywords: ['growth', 'learning', 'product', 'allocation'] },
  { id: 'rules', targetTab: 'rules', stepCount: 4, keywords: ['policy', 'rule', 'permission', 'automation'] },
  { id: 'creatives', targetTab: 'creatives', stepCount: 4, keywords: ['creative', 'video', 'winner', 'heat', 'exclude', 's a b c'] },
  { id: 'profit', targetTab: 'profit', stepCount: 4, keywords: ['profit', 'cost', 'break-even roi', 'net gmv', 'net roi'] },
  { id: 'actions', targetTab: 'actions', stepCount: 4, keywords: ['approval', 'execute', 'request id', 'rollback'] },
  { id: 'audit', targetTab: 'audit', stepCount: 4, keywords: ['audit', 'connection', 'platform', 'verification'] },
  { id: 'metrics', targetTab: 'overview', stepCount: 4, keywords: ['formula', 'roi', 'cvr', 'ctr', 'live score', 'health score'] },
  { id: 'execution', targetTab: 'actions', stepCount: 4, keywords: ['real execution', 'accepted', 'verified', 'retry', 'rollback'] },
  { id: 'issues', targetTab: 'sop', stepCount: 4, keywords: ['issue', 'problem', 'seller center', 'troubleshooting'] },
]

const issue = (
  code: string,
  targetTab: GmvMaxHelpTargetTab,
  actionTarget: string,
  steps: string[],
  approvalRequired = false,
  rollbackSupported = false,
): GmvMaxHelpIssue => ({ code, targetTab, actionTarget, steps, approvalRequired, rollbackSupported })

export const GMV_MAX_HELP_ISSUES: GmvMaxHelpIssue[] = [
  issue('profit_model_incomplete', 'profit', 'profit', ['open_profit', 'complete_costs', 'save_and_recalculate']),
  issue('target_roi_missing', 'sop', 'supplemental', ['open_supplemental', 'enter_target_roi', 'save_and_recalculate']),
  issue('creative_supply_below_target', 'creatives', 'creatives', ['open_creatives', 'review_supply', 'create_candidates']),
  issue('complete_days_below_target', 'overview', 'sync', ['sync_data', 'wait_complete_days']),
  issue('orders_below_target', 'overview', 'sync', ['sync_data', 'collect_orders']),
  issue('roi_below_profit_floor', 'actions', 'actions', ['review_profit_evidence', 'open_actions', 'approve_one_variable'], true, true),
  issue('net_profit_negative', 'profit', 'profit', ['open_profit', 'verify_costs', 'review_reduction']),
  issue('winner_missing', 'creatives', 'creatives', ['open_creatives', 'review_candidates', 'run_protected_test']),
  issue('three_profitable_days_required', 'sop', 'sync', ['sync_data', 'wait_three_delivery_days']),
  issue('seven_profitable_days_required', 'sop', 'sync', ['sync_data', 'wait_seven_delivery_days']),
  issue('campaign_binding_missing', 'audit', 'sync', ['sync_data', 'verify_binding']),
  issue('campaign_disabled', 'sop', 'seller_center', ['verify_disabled_reason', 'confirm_readiness', 'record_external_change']),
  issue('delivery_data_stale', 'overview', 'sync', ['sync_data', 'verify_latest_delivery']),
  issue('delivery_missing', 'overview', 'sync', ['sync_data', 'verify_campaign_delivery']),
  issue('product_budget_missing', 'sop', 'supplemental', ['open_supplemental', 'enter_product_budget', 'save_and_recalculate']),
  issue('intraday_spend_missing', 'sop', 'supplemental', ['open_supplemental', 'enter_intraday_spend', 'save_and_recalculate']),
  issue('report_coverage_low', 'overview', 'sync', ['sync_data', 'verify_report_coverage']),
  issue('mature_dormant_recovery', 'sop', 'seller_center', ['review_mature_evidence', 'confirm_readiness', 'record_external_change']),
  issue('mature_diagnosis_required', 'sop', 'supplemental', ['review_mature_evidence', 'open_supplemental', 'save_and_recalculate']),
  issue('mature_velocity_constrained', 'actions', 'actions', ['review_mature_evidence', 'keep_single_variable', 'observe_three_delivery_days'], true, true),
  issue('mature_scale_ready', 'actions', 'actions', ['review_mature_evidence', 'keep_single_variable', 'observe_three_delivery_days'], true, true),
  issue('mature_quality_decay', 'actions', 'actions', ['review_mature_evidence', 'keep_single_variable', 'observe_three_delivery_days'], true, true),
  issue('mature_competitive_decay', 'creatives', 'creatives', ['review_mature_evidence', 'keep_single_variable', 'observe_three_delivery_days']),
  issue('mature_growth_ceiling', 'creatives', 'creatives', ['review_mature_evidence', 'create_candidates', 'observe_three_delivery_days']),
  issue('mature_healthy_hold', 'sop', 'none', ['review_mature_evidence', 'keep_single_variable', 'observe_three_delivery_days']),
  issue('live_metrics_missing', 'sop', 'supplemental', ['open_supplemental', 'enter_live_metrics', 'save_and_recalculate']),
  issue('approval_pending', 'actions', 'actions', ['open_actions', 'review_approval', 'approve_one_variable'], true, true),
  issue('recommendation_failed', 'audit', 'audit', ['review_failure', 'verify_binding', 'review_approval'], false, true),
  issue('observation_active', 'sop', 'audit', ['keep_single_variable', 'sync_data', 'observe_three_delivery_days']),
  issue('sync_interrupted', 'overview', 'sync', ['review_sync_error', 'retry_sync']),
  issue('external_campaign_setup', 'sop', 'seller_center', ['open_seller_center', 'change_one_variable', 'record_external_change']),
  issue('external_delivery_mode', 'sop', 'seller_center', ['open_seller_center', 'change_one_variable', 'record_external_change']),
  issue('external_auto_budget', 'sop', 'seller_center', ['open_seller_center', 'change_one_variable', 'record_external_change']),
  issue('external_promotion_schedule', 'sop', 'seller_center', ['open_seller_center', 'change_one_variable', 'record_external_change']),
  issue('external_manual_intervention', 'sop', 'seller_center', ['open_seller_center', 'change_one_variable', 'record_external_change']),
  issue('external_verification_pending', 'audit', 'audit', ['review_failure', 'verify_binding', 'review_approval']),
]

export const GMV_MAX_HELP_ISSUE_CODES = GMV_MAX_HELP_ISSUES.map((item) => item.code)
