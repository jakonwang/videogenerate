import { createHash } from 'node:crypto'
import { gmvMaxDecimal } from './optimizer'
import type {
  GmvMaxCampaign,
  GmvMaxActionOutcome,
  GmvMaxCreativeMetric,
  GmvMaxDailyMetric,
  GmvMaxLearningSnapshot,
  GmvMaxLifecycleStage,
  GmvMaxPolicy,
  GmvMaxProfitGuard,
} from './types'

const SCALE = 10_000n

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n)
}

function average(values: bigint[]) {
  return values.length ? sum(values) / BigInt(values.length) : 0n
}

function aggregateRoi(metrics: GmvMaxDailyMetric[]) {
  const cost = sum(metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
  const revenue = sum(metrics.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
  return cost > 0n ? (revenue * SCALE) / cost : 0n
}

function percent(value: bigint, amount: number) {
  return (value * BigInt(Math.round(amount * 100))) / SCALE
}

function trendPercent(current: bigint, previous: bigint) {
  return previous > 0n ? ((current - previous) * 100n * SCALE) / previous : 0n
}

function lifecycleId(campaignId: string, analyzedAt: number) {
  const date = new Date(analyzedAt).toISOString().slice(0, 10)
  return createHash('sha256').update(`${campaignId}:${date}`).digest('hex').slice(0, 32)
}

function metricDate(value: string) {
  return String(value || '').slice(0, 10)
}

export function analyzeGmvMaxLifecycle(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  metrics: GmvMaxDailyMetric[]
  creativeMetrics: GmvMaxCreativeMetric[]
  profitGuard: GmvMaxProfitGuard
  previous?: GmvMaxLearningSnapshot
  actionOutcomes?: GmvMaxActionOutcome[]
  now?: number
}): GmvMaxLearningSnapshot {
  const now = input.now ?? Date.now()
  const metrics = [...input.metrics].sort((a, b) => a.statDate.localeCompare(b.statDate))
  const recent = metrics.slice(-3)
  const previousWindow = metrics.slice(-6, -3)
  const recentRoi = aggregateRoi(recent)
  const previousRoi = aggregateRoi(previousWindow)
  const roiTrend = trendPercent(recentRoi, previousRoi)
  const recentOrders = sum(recent.map((item) => gmvMaxDecimal.parse(item.orders)))
  const utilization = average(recent.map((item) => gmvMaxDecimal.parse(item.budgetUtilization)))
  const profitFloor = gmvMaxDecimal.parse(input.profitGuard.effectiveRoiFloor)
  const totalCost = sum(metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
  const recentDates = new Set(recent.map((item) => metricDate(item.statDate)))
  const creatives = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of input.creativeMetrics) {
    if (!recentDates.has(metricDate(metric.statDate))) continue
    creatives.set(metric.creativeId, [...(creatives.get(metric.creativeId) || []), metric])
  }
  const winners = [...creatives.values()].filter((items) => {
    const cost = sum(items.map((item) => gmvMaxDecimal.parse(item.cost)))
    const revenue = sum(items.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
    const orders = sum(items.map((item) => gmvMaxDecimal.parse(item.orders)))
    const roi = cost > 0n ? (revenue * SCALE) / cost : 0n
    return orders >= 3n * SCALE && roi >= profitFloor
  }).length
  const outcomes = input.actionOutcomes || []
  const successfulOutcomes = outcomes.filter((item) => item.successful).length

  const signals: string[] = []
  if (!input.profitGuard.complete) signals.push('cost_data_incomplete')
  if (metrics.length < 3) signals.push('insufficient_complete_days')
  if (recentOrders < BigInt(input.policy.minOrders) * SCALE) signals.push('order_sample_small')
  if (recentRoi >= percent(profitFloor, 110)) signals.push('roi_above_scale_threshold')
  if (recentRoi < profitFloor) signals.push('roi_below_profit_floor')
  if (utilization >= gmvMaxDecimal.parse('0.75')) signals.push('budget_absorption_strong')
  if (utilization < gmvMaxDecimal.parse('0.45')) signals.push('budget_absorption_weak')
  if (roiTrend >= gmvMaxDecimal.parse('15')) signals.push('roi_trend_improving')
  if (roiTrend <= gmvMaxDecimal.parse('-20')) signals.push('roi_trend_declining')
  if (winners > 0) signals.push('winning_creative_found')
  if (creatives.size > 0 && winners === 0) signals.push('creative_winner_missing')
  if (outcomes.length >= 2 && successfulOutcomes / outcomes.length >= 0.6) signals.push('strategy_feedback_positive')
  if (outcomes.length >= 2 && successfulOutcomes / outcomes.length < 0.4) signals.push('strategy_feedback_negative')

  let stage: GmvMaxLifecycleStage
  let recommendedFocus: GmvMaxLearningSnapshot['recommendedFocus']
  if (!input.profitGuard.complete) {
    stage = 'blocked'
    recommendedFocus = 'complete_costs'
  } else if (metrics.length <= 1 || totalCost <= 0n) {
    stage = 'cold_start'
    recommendedFocus = 'collect_data'
  } else if (metrics.length < 3 || recentOrders < 3n * SCALE) {
    stage = 'exploration'
    recommendedFocus = 'test_creatives'
  } else if (recentRoi < percent(profitFloor, 80) || (roiTrend <= gmvMaxDecimal.parse('-25') && recentRoi < profitFloor)) {
    stage = 'declining'
    recommendedFocus = 'recover_efficiency'
  } else if (metrics.length < 5 || recentOrders < BigInt(input.policy.minOrders) * SCALE || winners === 0) {
    stage = 'validation'
    recommendedFocus = winners === 0 ? 'test_creatives' : 'validate_profit'
  } else if (recentRoi >= percent(profitFloor, 110) && utilization >= gmvMaxDecimal.parse('0.75') && roiTrend > gmvMaxDecimal.parse('-10') && winners > 0) {
    stage = 'scaling'
    recommendedFocus = 'scale_budget'
  } else if (metrics.length >= 7 && recentRoi >= profitFloor && roiTrend >= gmvMaxDecimal.parse('-15') && roiTrend <= gmvMaxDecimal.parse('15')) {
    stage = 'mature'
    recommendedFocus = 'hold_efficiency'
  } else {
    stage = 'validation'
    recommendedFocus = 'validate_profit'
  }

  let score = 50
  if (input.profitGuard.complete) score += 10
  if (recentRoi >= profitFloor) score += 15
  if (recentRoi >= percent(profitFloor, 110)) score += 10
  if (recentRoi < profitFloor) score -= 20
  if (utilization >= gmvMaxDecimal.parse('0.75')) score += 8
  if (utilization < gmvMaxDecimal.parse('0.45')) score -= 8
  if (roiTrend >= gmvMaxDecimal.parse('15')) score += 5
  if (roiTrend <= gmvMaxDecimal.parse('-20')) score -= 10
  if (winners > 0) score += 7
  if (outcomes.length >= 2) score += successfulOutcomes / outcomes.length >= 0.6 ? 6 : successfulOutcomes / outcomes.length < 0.4 ? -8 : 0
  score = Math.max(0, Math.min(100, score))

  const orderConfidence = Number(recentOrders / SCALE)
  const confidence = Math.max(0, Math.min(100, metrics.length * 10 + Math.min(30, orderConfidence * 2) + Math.min(20, creatives.size * 2) + Math.min(15, outcomes.length * 5)))
  return {
    id: lifecycleId(input.campaign.id, now),
    campaignId: input.campaign.id,
    stage,
    previousStage: input.previous && input.previous.stage !== stage ? input.previous.stage : undefined,
    confidence,
    score,
    daysObserved: metrics.length,
    recentOrders: gmvMaxDecimal.format(recentOrders, 0),
    recentRoi: gmvMaxDecimal.format(recentRoi, 4),
    roiTrendPercent: gmvMaxDecimal.format(roiTrend, 2),
    budgetUtilization: gmvMaxDecimal.format(utilization, 4),
    profitFloor: input.profitGuard.effectiveRoiFloor,
    creativeCount: creatives.size,
    winningCreativeCount: winners,
    measuredOutcomeCount: outcomes.length,
    successfulOutcomeCount: successfulOutcomes,
    signals,
    recommendedFocus,
    analyzedAt: now,
  }
}
