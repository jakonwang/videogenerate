import { createHash } from 'node:crypto'
import type {
  GmvMaxMatureAssessment,
  GmvMaxPolicy,
  GmvMaxRecommendation,
  GmvMaxSopInstance,
  GmvMaxSopIntervention,
  GmvMaxSopIssueResolution,
  GmvMaxSopMetricSummary,
  GmvMaxSopTask,
  GmvMaxSyncProgress,
} from './types'

export const GMV_MAX_ISSUE_CODES = [
  'profit_model_incomplete',
  'target_roi_missing',
  'creative_supply_below_target',
  'complete_days_below_target',
  'orders_below_target',
  'roi_below_profit_floor',
  'net_profit_negative',
  'winner_missing',
  'three_profitable_days_required',
  'seven_profitable_days_required',
  'campaign_binding_missing',
  'campaign_disabled',
  'delivery_data_stale',
  'delivery_missing',
  'product_budget_missing',
  'intraday_spend_missing',
  'report_coverage_low',
  'mature_dormant_recovery',
  'mature_diagnosis_required',
  'mature_velocity_constrained',
  'mature_scale_ready',
  'mature_quality_decay',
  'mature_competitive_decay',
  'mature_growth_ceiling',
  'mature_healthy_hold',
  'live_metrics_missing',
  'approval_pending',
  'recommendation_failed',
  'observation_active',
  'sync_interrupted',
  'external_campaign_setup',
  'external_delivery_mode',
  'external_auto_budget',
  'external_promotion_schedule',
  'external_manual_intervention',
] as const

type IssueCode = (typeof GMV_MAX_ISSUE_CODES)[number] | 'external_verification_pending'

const BLOCKER_ACTIONS: Record<string, Pick<GmvMaxSopIssueResolution, 'resolutionMode' | 'actionTarget' | 'steps'>> = {
  profit_model_incomplete: { resolutionMode: 'manual_input', actionTarget: 'profit', steps: ['open_profit', 'complete_costs', 'save_and_recalculate'] },
  target_roi_missing: { resolutionMode: 'manual_input', actionTarget: 'supplemental', steps: ['open_supplemental', 'enter_target_roi', 'save_and_recalculate'] },
  creative_supply_below_target: { resolutionMode: 'internal_route', actionTarget: 'creatives', steps: ['open_creatives', 'review_supply', 'create_candidates'] },
  complete_days_below_target: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'wait_complete_days'] },
  orders_below_target: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'collect_orders'] },
  roi_below_profit_floor: { resolutionMode: 'approval', actionTarget: 'actions', steps: ['review_profit_evidence', 'open_actions', 'approve_one_variable'] },
  net_profit_negative: { resolutionMode: 'internal_route', actionTarget: 'profit', steps: ['open_profit', 'verify_costs', 'review_reduction'] },
  winner_missing: { resolutionMode: 'internal_route', actionTarget: 'creatives', steps: ['open_creatives', 'review_candidates', 'run_protected_test'] },
  three_profitable_days_required: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'wait_three_delivery_days'] },
  seven_profitable_days_required: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'wait_seven_delivery_days'] },
  campaign_binding_missing: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'verify_binding'] },
  campaign_disabled: { resolutionMode: 'manual_external', actionTarget: 'seller_center', steps: ['verify_disabled_reason', 'confirm_readiness', 'record_external_change'] },
  delivery_data_stale: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'verify_latest_delivery'] },
  delivery_missing: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'verify_campaign_delivery'] },
  product_budget_missing: { resolutionMode: 'manual_input', actionTarget: 'supplemental', steps: ['open_supplemental', 'enter_product_budget', 'save_and_recalculate'] },
  intraday_spend_missing: { resolutionMode: 'manual_input', actionTarget: 'supplemental', steps: ['open_supplemental', 'enter_intraday_spend', 'save_and_recalculate'] },
  report_coverage_low: { resolutionMode: 'wait_sync', actionTarget: 'sync', steps: ['sync_data', 'verify_report_coverage'] },
}

function id(...parts: unknown[]) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join(':')).digest('hex').slice(0, 32)
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function inferGmvMaxExternalResolutionCode(task: Pick<GmvMaxSopTask, 'resolutionCode' | 'title' | 'description'>): IssueCode {
  if (task.resolutionCode && GMV_MAX_ISSUE_CODES.includes(task.resolutionCode as (typeof GMV_MAX_ISSUE_CODES)[number])) return task.resolutionCode as IssueCode
  const value = `${task.title} ${task.description}`.toLowerCase()
  if (value.includes('auto budget')) return 'external_auto_budget'
  if (value.includes('promotion')) return 'external_promotion_schedule'
  if (value.includes('max delivery') && value.includes('creation')) return 'external_campaign_setup'
  if (value.includes('max delivery') || value.includes('target roi')) return 'external_delivery_mode'
  return 'external_manual_intervention'
}

export function isGmvMaxSopTaskApplicable(task: GmvMaxSopTask, instance: GmvMaxSopInstance) {
  if (task.executionMode !== 'manual_external' || task.status !== 'pending') return true
  const code = inferGmvMaxExternalResolutionCode(task)
  if (instance.track === 'mature_product' && ['external_campaign_setup', 'external_delivery_mode', 'external_promotion_schedule'].includes(code)) return false
  if (instance.track === 'mature_product' && code === 'external_auto_budget') {
    return instance.phase === 'controlled_scaling' && instance.matureState === 'scale_ready'
  }
  return true
}

export function buildGmvMaxSopIssueResolutions(input: {
  instance: GmvMaxSopInstance
  metrics: GmvMaxSopMetricSummary
  policy: GmvMaxPolicy
  matureAssessment?: GmvMaxMatureAssessment
  tasks: GmvMaxSopTask[]
  interventions: GmvMaxSopIntervention[]
  recommendations: GmvMaxRecommendation[]
  latestSyncJob?: GmvMaxSyncProgress
  profitFloor: string
  targetRoi: string
  campaignOperationStatus: string
  creativeCount: number
  hasLiveMetrics: boolean
}) {
  const result: GmvMaxSopIssueResolution[] = []
  const base = { sopInstanceId: input.instance.id, campaignId: input.instance.campaignId, productId: input.instance.productId }
  const activeIntervention = input.interventions.find((item) => item.status === 'draft' || item.status === 'pending_verification' || item.status === 'observing')
  const push = (code: IssueCode, patch: Partial<GmvMaxSopIssueResolution> = {}) => {
    const action = BLOCKER_ACTIONS[code] || { resolutionMode: 'internal_route' as const, actionTarget: 'none' as const, steps: [] }
    result.push({
      ...base,
      id: id(input.instance.id, code, patch.taskId, patch.recommendationId),
      code,
      severity: 'must_fix',
      ...action,
      approvalRequired: action.resolutionMode === 'approval',
      rollbackSupported: false,
      manualCompletionAllowed: action.resolutionMode !== 'wait_sync',
      ...patch,
    })
  }

  for (const blocker of input.instance.blockers) {
    if (!BLOCKER_ACTIONS[blocker]) continue
    const values: Record<string, [string?, string?]> = {
      profit_model_incomplete: ['incomplete', 'complete'],
      target_roi_missing: [input.targetRoi, '> 0'],
      creative_supply_below_target: [String(input.creativeCount), String(input.policy.minExplorationCreatives)],
      complete_days_below_target: [String(input.metrics.completeDays), String(input.policy.minCompleteDays)],
      orders_below_target: [input.metrics.orders, String(input.policy.minOrders)],
      roi_below_profit_floor: [input.metrics.roi, input.profitFloor],
      net_profit_negative: [input.metrics.estimatedNetProfit, '>= 0'],
      winner_missing: [String(input.metrics.winningCreativeCount), '>= 1'],
      three_profitable_days_required: [String(input.metrics.consecutiveProfitableDays), '3'],
      seven_profitable_days_required: [String(input.metrics.consecutiveProfitableDays), '7'],
      campaign_disabled: [input.campaignOperationStatus, 'ACTIVE'],
      delivery_data_stale: [input.matureAssessment?.lastDeliveryDate, '<= 2 complete days'],
      delivery_missing: [input.matureAssessment?.lastDeliveryDate || 'missing', 'latest delivery date'],
      product_budget_missing: ['missing', '> 0'],
      intraday_spend_missing: ['missing', 'current day spend'],
      report_coverage_low: [input.matureAssessment ? `${Math.round(number(input.matureAssessment.dataCoverage) * 100)}%` : undefined, '>= 80%'],
    }
    const [currentValue, targetValue] = values[blocker] || []
    push(blocker as IssueCode, {
      currentValue,
      targetValue,
      evidenceSource: input.matureAssessment?.dataSources.performance || 'derived',
      ...(activeIntervention && blocker === 'campaign_disabled' ? { resolutionMode: 'wait_sync' as const, actionTarget: 'audit' as const, interventionId: activeIntervention.id, manualCompletionAllowed: false } : {}),
    })
  }

  if (input.matureAssessment) {
    const state = input.matureAssessment.state
    const resolved = state === 'healthy_hold'
    push(`mature_${state}` as IssueCode, {
      severity: resolved ? 'resolved' : state === 'scale_ready' || state === 'velocity_constrained' || state === 'growth_ceiling' ? 'recommended' : 'must_fix',
      resolutionMode: state === 'quality_decay' ? 'approval' : state === 'diagnosis_required' ? 'manual_input' : state === 'dormant_recovery' ? 'manual_external' : 'internal_route',
      actionTarget: state === 'quality_decay' ? 'actions' : state === 'diagnosis_required' ? 'supplemental' : state === 'dormant_recovery' ? 'seller_center' : state === 'healthy_hold' ? 'none' : state === 'growth_ceiling' || state === 'competitive_decay' ? 'creatives' : 'actions',
      currentValue: input.matureAssessment.recent7d.roi,
      targetValue: input.targetRoi,
      evidenceSource: input.matureAssessment.dataSources.performance,
      steps: ['review_mature_evidence', 'keep_single_variable', 'observe_three_delivery_days'],
      approvalRequired: state === 'quality_decay',
      rollbackSupported: state === 'quality_decay',
      manualCompletionAllowed: false,
    })
  }

  if (input.instance.track === 'live' && !input.hasLiveMetrics) {
    push('live_metrics_missing', { resolutionMode: 'manual_input', actionTarget: 'supplemental', currentValue: 'missing', targetValue: 'LIVE metrics', steps: ['open_supplemental', 'enter_live_metrics', 'save_and_recalculate'] })
  }

  if (activeIntervention?.status === 'observing') {
    push('observation_active', {
      severity: 'observing', resolutionMode: 'wait_sync', actionTarget: 'audit', interventionId: activeIntervention.id,
      currentValue: String(activeIntervention.observedDeliveryDays), targetValue: String(activeIntervention.requiredDeliveryDays),
      steps: ['sync_data', 'observe_three_delivery_days'], manualCompletionAllowed: false,
    })
  }

  if (activeIntervention?.status === 'pending_verification') {
    push('external_verification_pending', {
      severity: 'must_fix', resolutionMode: 'manual_external', actionTarget: 'seller_center', interventionId: activeIntervention.id,
      currentValue: activeIntervention.actualValue, targetValue: activeIntervention.proposedValue || 'verified platform value',
      evidenceSource: 'Seller Center evidence', steps: ['open_seller_center', 'review_failure', 'record_external_change'], manualCompletionAllowed: false,
    })
  }

  for (const recommendation of input.recommendations.filter((item) => item.status === 'pending' || item.status === 'failed')) {
    push(recommendation.status === 'failed' ? 'recommendation_failed' : 'approval_pending', {
      severity: 'must_fix', resolutionMode: 'approval', actionTarget: 'actions', recommendationId: recommendation.id,
      currentValue: recommendation.status, targetValue: recommendation.status === 'failed' ? 'verified recovery' : 'approved or rejected',
      evidenceSource: recommendation.evidence.dataFreshness, steps: ['open_actions', recommendation.status === 'failed' ? 'review_failure' : 'review_approval'],
      approvalRequired: recommendation.status === 'pending', rollbackSupported: Boolean(recommendation.reversible), manualCompletionAllowed: false,
    })
  }

  for (const task of input.tasks.filter((item) => item.status === 'pending' && item.executionMode === 'manual_external' && isGmvMaxSopTaskApplicable(item, input.instance))) {
    const code = inferGmvMaxExternalResolutionCode(task)
    const intervention = input.interventions.find((item) => item.taskId === task.id)
    push(code, {
      resolutionMode: 'manual_external', actionTarget: 'seller_center', taskId: task.id, interventionId: intervention?.id,
      currentValue: intervention?.beforeValue, targetValue: intervention?.proposedValue, evidenceSource: 'Seller Center',
      steps: ['open_seller_center', 'change_one_variable', 'record_external_change'], manualCompletionAllowed: true,
    })
  }

  if (input.latestSyncJob?.status === 'interrupted') {
    push('sync_interrupted', { resolutionMode: 'wait_sync', actionTarget: 'sync', currentValue: input.latestSyncJob.phase, targetValue: 'completed', steps: ['review_sync_error', 'retry_sync'], manualCompletionAllowed: false })
  }

  const severityRank = { must_fix: 0, recommended: 1, observing: 2, resolved: 3 }
  return result.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.code.localeCompare(b.code))
}
