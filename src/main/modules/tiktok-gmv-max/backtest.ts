import { analyzeGmvMaxLifecycle } from './learning'
import { evaluateGmvMaxCampaign, gmvMaxDecimal } from './optimizer'
import { analyzeGmvMaxProductIntelligence } from './productIntelligence'
import type {
  GmvMaxCampaign,
  GmvMaxCreativeMetric,
  GmvMaxDailyMetric,
  GmvMaxPolicy,
  GmvMaxProductCost,
  GmvMaxProfitGuard,
  GmvMaxStoreCost,
  GmvMaxStrategyCalibration,
  GmvMaxListEntry,
} from './types'

const SCALE = 10_000n

function reportDate(value: string) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] || ''
}

function modeledProfitDelta(currentBudget: string, proposedBudget: string, roi: string, marginRate: string) {
  const current = gmvMaxDecimal.parse(currentBudget)
  const proposed = gmvMaxDecimal.parse(proposedBudget)
  const profitPerSpend = (gmvMaxDecimal.parse(roi) * gmvMaxDecimal.parse(marginRate)) / SCALE - SCALE
  const budgetDelta = proposed - current
  if (budgetDelta > 0n) return profitPerSpend > 0n ? (budgetDelta * profitPerSpend) / SCALE : 0n
  if (budgetDelta < 0n) return profitPerSpend < 0n ? ((-budgetDelta) * (-profitPerSpend)) / SCALE : 0n
  return 0n
}

export function replayGmvMaxStrategy(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  metrics: GmvMaxDailyMetric[]
  creativeMetrics: GmvMaxCreativeMetric[]
  profitGuard: GmvMaxProfitGuard
  calibrations?: GmvMaxStrategyCalibration[]
  productCosts?: GmvMaxProductCost[]
  storeCost?: GmvMaxStoreCost
  listEntries?: GmvMaxListEntry[]
  currency?: string
  days: number
}) {
  const metrics = [...input.metrics].sort((a, b) => a.statDate.localeCompare(b.statDate)).slice(-input.days)
  const productEvidenceEnabled = input.productCosts !== undefined || input.storeCost !== undefined || input.listEntries !== undefined
  let simulatedCampaign = { ...input.campaign }
  let lastActionAt: number | undefined
  let previousStage: string | undefined
  let stageTransitions = 0
  let scaleUpCount = 0
  let scaleDownCount = 0
  let productGateBlockCount = 0
  let productQualifiedDays = 0
  let productTestingDays = 0
  let productRiskDays = 0
  let productCostBlockedDays = 0
  let productEvidenceMissingDays = 0
  let projectedProfitDelta = 0n
  const timeline: Array<Record<string, unknown>> = []

  for (let index = 0; index < metrics.length; index += 1) {
    const currentMetric = metrics[index]
    const currentDate = reportDate(currentMetric.statDate)
    if (!currentDate) continue
    const evidence = metrics.slice(0, index + 1)
    const now = Date.parse(`${currentDate}T12:30:00.000Z`)
    const creativeMetrics = input.creativeMetrics
      .filter((metric) => reportDate(metric.statDate) <= currentDate)
      .map((metric) => ({ ...metric, statDate: reportDate(metric.statDate) }))
    const productInsights = analyzeGmvMaxProductIntelligence({
      campaign: simulatedCampaign,
      policy: input.policy,
      metrics: creativeMetrics,
      productCosts: input.productCosts || [],
      storeCost: input.storeCost,
      listEntries: input.listEntries || [],
      currency: input.currency,
      now,
    })
    const qualifiedProducts = productInsights.filter((item) => item.state === 'scale_ready').length
    const testingProducts = productInsights.filter((item) => item.state === 'cold_start' || item.state === 'testing').length
    const riskProducts = productInsights.filter((item) => item.state === 'declining' || item.state === 'losing').length
    const costBlockedProducts = productInsights.filter((item) => item.state === 'blocked' && item.recommendedAction === 'complete_costs').length
    if (qualifiedProducts > 0) productQualifiedDays += 1
    else if (testingProducts > 0) productTestingDays += 1
    if (riskProducts > 0) productRiskDays += 1
    if (costBlockedProducts > 0) productCostBlockedDays += 1
    if (productEvidenceEnabled && input.campaign.campaignType === 'PRODUCT' && productInsights.length === 0) productEvidenceMissingDays += 1
    const lifecycle = analyzeGmvMaxLifecycle({
      campaign: simulatedCampaign,
      policy: input.policy,
      metrics: evidence,
      creativeMetrics,
      profitGuard: input.profitGuard,
      now,
    })
    if (previousStage && previousStage !== lifecycle.stage) stageTransitions += 1
    previousStage = lifecycle.stage
    const optimizationInput = {
      campaign: simulatedCampaign,
      policy: { ...input.policy, shadowMode: true },
      metrics: evidence,
      profitGuard: input.profitGuard,
      lifecycle,
      calibrations: input.calibrations,
      lastExecutedAt: lastActionAt,
      now,
    }
    const campaignLevelBaseline = evaluateGmvMaxCampaign({
      ...optimizationInput,
      campaign: input.campaign.campaignType === 'PRODUCT'
        ? { ...simulatedCampaign, campaignType: 'LIVE' }
        : simulatedCampaign,
    })
    const recommendation = productEvidenceEnabled
      ? evaluateGmvMaxCampaign({ ...optimizationInput, productInsights })
      : evaluateGmvMaxCampaign(optimizationInput)
    const productGateBlocked = campaignLevelBaseline?.kind === 'scale_up'
      && !recommendation
      && productEvidenceEnabled
      && input.campaign.campaignType === 'PRODUCT'
    if (productGateBlocked) productGateBlockCount += 1
    let decision = 'hold'
    let dailyProfitDelta = 0n
    if (recommendation) {
      decision = recommendation.kind
      if (recommendation.kind === 'scale_up') scaleUpCount += 1
      else scaleDownCount += 1
      dailyProfitDelta = modeledProfitDelta(
        recommendation.currentBudget,
        recommendation.proposedBudget,
        currentMetric.roi,
        input.profitGuard.contributionMarginRate,
      )
      projectedProfitDelta += dailyProfitDelta
      simulatedCampaign = {
        ...simulatedCampaign,
        budget: recommendation.proposedBudget,
        roasBid: recommendation.proposedRoasBid,
      }
      lastActionAt = now
    }
    timeline.push({
      statDate: currentDate,
      stage: lifecycle.stage,
      confidence: lifecycle.confidence,
      decision,
      budget: simulatedCampaign.budget,
      targetRoi: simulatedCampaign.roasBid,
      actualRoi: currentMetric.roi,
      qualifiedProducts,
      testingProducts,
      riskProducts,
      costBlockedProducts,
      productGateBlocked,
      projectedProfitDelta: gmvMaxDecimal.format(dailyProfitDelta),
      reason: recommendation?.reason || (productGateBlocked ? 'product_profit_proof_required' : lifecycle.recommendedFocus),
    })
  }

  return {
    actionCount: scaleUpCount + scaleDownCount,
    scaleUpCount,
    scaleDownCount,
    productGateBlockCount,
    productQualifiedDays,
    productTestingDays,
    productRiskDays,
    productCostBlockedDays,
    productEvidenceMissingDays,
    holdCount: metrics.length - scaleUpCount - scaleDownCount,
    blockedCount: input.profitGuard.complete ? 0 : 1,
    startingBudget: input.campaign.budget,
    endingBudget: simulatedCampaign.budget,
    stageTransitions,
    projectedProfitDelta: gmvMaxDecimal.format(projectedProfitDelta),
    timeline,
  }
}
