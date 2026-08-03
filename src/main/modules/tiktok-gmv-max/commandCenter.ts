import { gmvMaxDecimal } from './optimizer'
import type {
  GmvMaxAccountBinding,
  GmvMaxActionOutcome,
  GmvMaxCampaign,
  GmvMaxCommandCenter,
  GmvMaxCommandCenterAction,
  GmvMaxDecisionSnapshot,
  GmvMaxRecommendation,
  GmvMaxSopIssueResolution,
  GmvMaxSopWorkspace,
} from './types'

type CommandCenterInput = {
  workspace: GmvMaxSopWorkspace
  recommendations: GmvMaxRecommendation[]
  outcomes: GmvMaxActionOutcome[]
  campaigns: GmvMaxCampaign[]
  bindings: GmvMaxAccountBinding[]
}

const severityScore = { must_fix: 600, recommended: 300, observing: 100 } as const
const priorityScore = { P0: 120, P1: 60, P2: 0 } as const
const scaleActions = new Set(['auto_budget', 'max_delivery', 'product_expansion', 'roi_unlock'])
const staleCodes = new Set(['sync_interrupted', 'delivery_data_stale', 'delivery_missing'])

function recommendationTarget(item?: GmvMaxRecommendation): GmvMaxSopIssueResolution['actionTarget'] {
  if (item?.actionType === 'creative') return 'creatives'
  return 'actions'
}

function modeledImpact(item?: GmvMaxRecommendation) {
  return item?.projectionSource === 'modeled'
    ? {
        projectedGmvDelta: item.projectedGmvDelta,
        projectedNetProfitDelta: item.projectedNetProfitDelta,
        projectionSource: 'modeled' as const,
      }
    : { projectionSource: 'unavailable' as const }
}

function actionStatus(
  recommendation: GmvMaxRecommendation | undefined,
  decision: GmvMaxDecisionSnapshot | undefined,
  observing: boolean,
  completed: boolean,
): GmvMaxCommandCenterAction['status'] {
  if (recommendation?.status === 'failed') return 'failed'
  if (recommendation?.status === 'pending') return 'pending_approval'
  if (observing) return 'observing'
  if (completed) return 'completed'
  if (decision && (!decision.writeAllowed || decision.blockedReasons.length)) return 'blocked'
  return 'needs_action'
}

function actionScore(
  severity: GmvMaxCommandCenterAction['severity'],
  recommendation: GmvMaxRecommendation | undefined,
  decision: GmvMaxDecisionSnapshot | undefined,
  reasonCode: string,
  observingSoon: boolean,
) {
  return severityScore[severity]
    + (recommendation?.status === 'failed' ? 150 : 0)
    + (decision && (!decision.writeAllowed || decision.blockedReasons.length) ? 100 : 0)
    + (staleCodes.has(reasonCode) ? 80 : 0)
    + (decision ? priorityScore[decision.priority] : 0)
    + (recommendation?.status === 'pending' ? 60 : 0)
    + (observingSoon ? 40 : 0)
}

function compareActions(left: GmvMaxCommandCenterAction, right: GmvMaxCommandCenterAction) {
  if (left.score !== right.score) return right.score - left.score
  if (left.currency === right.currency) {
    const leftImpact = Number(left.projectedNetProfitDelta) || 0
    const rightImpact = Number(right.projectedNetProfitDelta) || 0
    if (leftImpact !== rightImpact) return rightImpact - leftImpact
  }
  if (left.evaluatedAt !== right.evaluatedAt) return right.evaluatedAt - left.evaluatedAt
  return left.id.localeCompare(right.id)
}

export function buildGmvMaxCommandCenter(input: CommandCenterInput): GmvMaxCommandCenter {
  const instanceById = new Map(input.workspace.instances.map((item) => [item.id, item]))
  const campaignById = new Map(input.campaigns.map((item) => [item.id, item]))
  const bindingById = new Map(input.bindings.map((item) => [item.id, item]))
  const decisionByInstance = new Map<string, GmvMaxDecisionSnapshot>()
  for (const item of [...input.workspace.decisions].sort((left, right) => right.evaluatedAt - left.evaluatedAt)) {
    if (!decisionByInstance.has(item.sopInstanceId)) decisionByInstance.set(item.sopInstanceId, item)
  }
  const recommendationById = new Map(input.recommendations.map((item) => [item.id, item]))
  const recommendationByCampaign = new Map<string, GmvMaxRecommendation>()
  for (const item of [...input.recommendations].sort((left, right) => right.updatedAt - left.updatedAt)) {
    if (!recommendationByCampaign.has(item.campaignId) && ['pending', 'failed', 'executed'].includes(item.status)) {
      recommendationByCampaign.set(item.campaignId, item)
    }
  }
  const outcomeByRecommendation = new Map<string, GmvMaxActionOutcome>()
  for (const item of [...input.outcomes].sort((left, right) => right.measuredAt - left.measuredAt)) {
    if (!outcomeByRecommendation.has(item.recommendationId)) outcomeByRecommendation.set(item.recommendationId, item)
  }
  const actions: GmvMaxCommandCenterAction[] = []
  const dedupeKeys = new Set<string>()

  const appendIssue = (issue: GmvMaxSopIssueResolution) => {
    if (issue.severity === 'resolved') return
    const instance = instanceById.get(issue.sopInstanceId)
    if (!instance) return
    const campaign = campaignById.get(issue.campaignId)
    const binding = campaign ? bindingById.get(campaign.bindingId) : undefined
    const decision = decisionByInstance.get(issue.sopInstanceId)
    const recommendation = (issue.recommendationId && recommendationById.get(issue.recommendationId))
      || recommendationByCampaign.get(issue.campaignId)
    const intervention = issue.interventionId
      ? input.workspace.interventions.find((item) => item.id === issue.interventionId)
      : instance.activeIntervention
    const outcome = recommendation ? outcomeByRecommendation.get(recommendation.id) : undefined
    const observing = intervention?.status === 'observing'
    const observingSoon = observing && instance.observationDaysRemaining <= 1
    const completed = Boolean(outcome || intervention?.status === 'completed')
    const actionTarget = issue.actionTarget
    const dedupeKey = `${issue.campaignId}:${actionTarget}`
    if (dedupeKeys.has(dedupeKey)) return
    dedupeKeys.add(dedupeKey)
    const category = issue.severity === 'must_fix'
      ? 'high_risk'
      : decision && scaleActions.has(decision.recommendedAction)
        ? 'high_opportunity'
        : issue.severity === 'observing'
          ? 'observing'
          : 'optimization'
    actions.push({
      id: issue.id,
      source: 'issue',
      campaignId: issue.campaignId,
      sopInstanceId: issue.sopInstanceId,
      storeId: instance.storeId,
      storeName: instance.storeName,
      currency: binding?.currency || 'CNY',
      campaignName: instance.campaignName,
      productId: issue.productId || instance.productId,
      productName: issue.productName || instance.productName,
      severity: issue.severity,
      category,
      priority: decision?.priority,
      score: actionScore(issue.severity, recommendation, decision, issue.code, observingSoon),
      reasonCode: issue.code,
      reason: recommendation?.reason || issue.code,
      actionTarget,
      currentValue: issue.currentValue,
      targetValue: issue.targetValue,
      ...modeledImpact(recommendation),
      confidence: recommendation?.confidence ?? decision?.confidence,
      status: actionStatus(recommendation, decision, Boolean(observing), completed),
      blockedReasons: [...new Set([...(decision?.blockedReasons || []), ...(recommendation?.blockedReasons || [])])],
      recommendationId: recommendation?.id || issue.recommendationId,
      taskId: issue.taskId,
      interventionId: intervention?.id || issue.interventionId,
      outcomeId: outcome?.id,
      observationDaysRemaining: instance.observationDaysRemaining,
      evaluatedAt: decision?.evaluatedAt || issue.priorityScore || input.workspace.generatedAt,
    })
  }

  input.workspace.issueQueue.forEach(appendIssue)

  for (const recommendation of input.recommendations) {
    if (!['pending', 'failed'].includes(recommendation.status)) continue
    const instance = input.workspace.instances.find((item) => item.campaignId === recommendation.campaignId)
    if (!instance) continue
    const actionTarget = recommendationTarget(recommendation)
    const dedupeKey = `${recommendation.campaignId}:${actionTarget}`
    if (dedupeKeys.has(dedupeKey)) continue
    dedupeKeys.add(dedupeKey)
    const decision = decisionByInstance.get(instance.id)
    const campaign = campaignById.get(recommendation.campaignId)
    const binding = campaign ? bindingById.get(campaign.bindingId) : undefined
    const severity = recommendation.status === 'failed' ? 'must_fix' : 'recommended'
    actions.push({
      id: recommendation.id,
      source: 'recommendation',
      campaignId: recommendation.campaignId,
      sopInstanceId: instance.id,
      storeId: instance.storeId,
      storeName: instance.storeName,
      currency: binding?.currency || 'CNY',
      campaignName: instance.campaignName,
      productId: instance.productId,
      productName: instance.productName,
      severity,
      category: recommendation.status === 'failed' ? 'high_risk' : decision && scaleActions.has(decision.recommendedAction) ? 'high_opportunity' : 'optimization',
      priority: decision?.priority,
      score: actionScore(severity, recommendation, decision, recommendation.kind, false),
      reasonCode: recommendation.kind,
      reason: recommendation.reason,
      actionTarget,
      currentValue: recommendation.actionType === 'roi' ? recommendation.currentRoasBid : recommendation.currentBudget,
      targetValue: recommendation.actionType === 'roi' ? recommendation.proposedRoasBid : recommendation.proposedBudget,
      ...modeledImpact(recommendation),
      confidence: recommendation.confidence,
      status: recommendation.status === 'failed' ? 'failed' : 'pending_approval',
      blockedReasons: [...new Set([...(decision?.blockedReasons || []), ...(recommendation.blockedReasons || [])])],
      recommendationId: recommendation.id,
      observationDaysRemaining: instance.observationDaysRemaining,
      evaluatedAt: recommendation.createdAt,
    })
  }

  actions.sort(compareActions)
  const impactByCurrency = new Map<string, { count: number; gmv: bigint; profit: bigint }>()
  for (const item of actions) {
    if (item.projectionSource !== 'modeled') continue
    const summary = impactByCurrency.get(item.currency) || { count: 0, gmv: 0n, profit: 0n }
    summary.count += 1
    summary.gmv += gmvMaxDecimal.parse(item.projectedGmvDelta || '0')
    summary.profit += gmvMaxDecimal.parse(item.projectedNetProfitDelta || '0')
    impactByCurrency.set(item.currency, summary)
  }
  const interventions = input.workspace.interventions
  const resultVerdicts = interventions.flatMap((item) => item.outcomeMetrics ? [item.outcomeMetrics.verdict] : [])

  return {
    stores: [...new Map(input.workspace.instances.map((item) => [item.storeId, item.storeName])).entries()].map(([id, name]) => ({ id, name })),
    decisions: input.workspace.decisions,
    decisionSummary: input.workspace.decisionSummary,
    freshness: input.workspace.freshnessSummary,
    latestSyncJob: input.workspace.latestSyncJob,
    topActions: actions.slice(0, 5),
    actionSummary: {
      mustFix: actions.filter((item) => item.severity === 'must_fix').length,
      recommended: actions.filter((item) => item.severity === 'recommended').length,
      observing: actions.filter((item) => item.severity === 'observing' || item.status === 'observing').length,
      pendingApproval: actions.filter((item) => item.status === 'pending_approval').length,
      failed: actions.filter((item) => item.status === 'failed').length,
      total: actions.length,
    },
    impactSummaryByCurrency: [...impactByCurrency.entries()].map(([currency, summary]) => ({
      currency,
      actionCount: summary.count,
      projectedGmvDelta: gmvMaxDecimal.format(summary.gmv),
      projectedNetProfitDelta: gmvMaxDecimal.format(summary.profit),
    })),
    resultSummary: {
      observing: interventions.filter((item) => item.status === 'observing').length,
      improved: resultVerdicts.filter((item) => item === 'improved').length,
      stable: resultVerdicts.filter((item) => item === 'stable').length,
      declined: resultVerdicts.filter((item) => item === 'declined').length,
      measured: resultVerdicts.filter((item) => item === 'measured').length,
      waitingData: actions.filter((item) => staleCodes.has(item.reasonCode)).length,
    },
    generatedAt: input.workspace.generatedAt,
  }
}
