import { createHash } from 'node:crypto'
import { getGmvMaxShadowReadiness, gmvMaxDecimal } from './optimizer'
import type {
  GmvMaxCampaign,
  GmvMaxCreativeInsight,
  GmvMaxCreativeMetric,
  GmvMaxDailyMetric,
  GmvMaxLearningSnapshot,
  GmvMaxPolicy,
  GmvMaxPortfolioPlan,
  GmvMaxProductInsight,
  GmvMaxProfitGuard,
} from './types'

const SCALE = 10_000n

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n)
}

function average(values: bigint[]) {
  return values.length ? sum(values) / BigInt(values.length) : 0n
}

function percent(value: bigint, amount: number) {
  return (value * BigInt(Math.round(amount * 100))) / SCALE
}

function ratio(numerator: bigint, denominator: bigint) {
  return denominator > 0n ? (numerator * SCALE) / denominator : 0n
}

function deltaPercent(current: bigint, previous: bigint) {
  return previous > 0n ? ((current - previous) * 100n * SCALE) / previous : 0n
}

function stableId(parts: unknown[]) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join(':')).digest('hex').slice(0, 32)
}

function aggregate(metrics: GmvMaxDailyMetric[]) {
  const spend = sum(metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
  const revenue = sum(metrics.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
  return {
    spend,
    revenue,
    roi: ratio(revenue, spend),
    orders: sum(metrics.map((item) => gmvMaxDecimal.parse(item.orders))),
    utilization: average(metrics.map((item) => gmvMaxDecimal.parse(item.budgetUtilization))),
  }
}

export function analyzeGmvMaxCreativeIntelligence(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  profitGuard: GmvMaxProfitGuard
  metrics: GmvMaxCreativeMetric[]
  now?: number
}): GmvMaxCreativeInsight[] {
  const grouped = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of input.metrics) {
    const key = `${metric.creativeId}:${metric.itemGroupId || 'unscoped'}`
    grouped.set(key, [...(grouped.get(key) || []), metric])
  }
  const floor = gmvMaxDecimal.parse(input.profitGuard.effectiveRoiFloor)
  const testBudget = gmvMaxDecimal.parse(input.policy.creativeTestBudget)
  const analyzedAt = input.now ?? Date.now()
  return [...grouped.values()].map((values) => {
    const creativeId = values[0].creativeId
    const itemId = values[0].itemId
    const itemGroupId = values[0].itemGroupId
    const metrics = [...values].sort((a, b) => a.statDate.localeCompare(b.statDate))
    const recent = metrics.slice(-2)
    const previous = metrics.slice(-4, -2)
    const recentSpend = sum(recent.map((item) => gmvMaxDecimal.parse(item.cost)))
    const recentRevenue = sum(recent.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
    const recentOrders = sum(recent.map((item) => gmvMaxDecimal.parse(item.orders)))
    const recentRoi = ratio(recentRevenue, recentSpend)
    const previousSpend = sum(previous.map((item) => gmvMaxDecimal.parse(item.cost)))
    const previousRevenue = sum(previous.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
    const previousRoi = ratio(previousRevenue, previousSpend)
    const recentCtr = average(recent.map((item) => gmvMaxDecimal.parse(item.ctr)))
    const previousCtr = average(previous.map((item) => gmvMaxDecimal.parse(item.ctr)))
    const recentPlayDepth = average(recent.map((item) => gmvMaxDecimal.parse(item.playDepth || '0')))
    const previousPlayDepth = average(previous.map((item) => gmvMaxDecimal.parse(item.playDepth || '0')))
    const recentConversionRate = average(recent.map((item) => gmvMaxDecimal.parse(item.conversionRate || '0')))
    const previousConversionRate = average(previous.map((item) => gmvMaxDecimal.parse(item.conversionRate || '0')))
    const roiTrend = deltaPercent(recentRoi, previousRoi)
    const ctrTrend = deltaPercent(recentCtr, previousCtr)
    const playDepthTrend = deltaPercent(recentPlayDepth, previousPlayDepth)
    const conversionTrend = deltaPercent(recentConversionRate, previousConversionRate)
    const totalSpend = sum(metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
    const totalOrders = sum(metrics.map((item) => gmvMaxDecimal.parse(item.orders)))
    const signals: string[] = []
    let state: GmvMaxCreativeInsight['state'] = 'stable'

    if (!input.profitGuard.complete) {
      state = 'blocked'
      signals.push('cost_data_incomplete')
    } else if (metrics.length <= 1) {
      state = 'new'
      signals.push('creative_new')
    } else if (recentOrders === 0n && testBudget > 0n && recentSpend >= testBudget) {
      state = 'waste'
      signals.push('test_budget_exhausted')
    } else if (previous.length === 2
      && previousRoi >= percent(floor, 110)
      && ((roiTrend <= gmvMaxDecimal.parse('-30') && recentRoi < floor)
        || (roiTrend <= gmvMaxDecimal.parse('-20') && ctrTrend <= gmvMaxDecimal.parse('-30'))
        || (playDepthTrend <= gmvMaxDecimal.parse('-25') && conversionTrend <= gmvMaxDecimal.parse('-20')))) {
      state = 'fatigued'
      signals.push('roi_decay', playDepthTrend <= gmvMaxDecimal.parse('-25') ? 'play_depth_decay' : ctrTrend <= gmvMaxDecimal.parse('-30') ? 'ctr_decay' : 'profit_floor_breached')
    } else if (totalOrders >= 3n * SCALE && recentRoi >= percent(floor, 110)) {
      state = 'winner'
      signals.push('profit_winner')
    } else if (totalOrders < 3n * SCALE && (testBudget <= 0n || totalSpend < testBudget)) {
      state = 'testing'
      signals.push('sample_building')
    } else if (recentRoi < floor) {
      signals.push('below_profit_floor')
    } else {
      signals.push('performance_stable')
    }

    let score = 50
    if (state === 'winner') score += 35
    if (state === 'stable') score += 15
    if (state === 'fatigued') score -= 25
    if (state === 'waste' || state === 'blocked') score -= 40
    if (roiTrend > 0n) score += 5
    if (ctrTrend > 0n) score += 5
    if (playDepthTrend > 0n) score += 4
    if (conversionTrend > 0n) score += 4
    if (playDepthTrend < gmvMaxDecimal.parse('-25')) score -= 8
    score = Math.max(0, Math.min(100, score))
    return {
      id: stableId([input.campaign.id, creativeId, itemGroupId || 'unscoped', metrics.at(-1)?.statDate]),
      campaignId: input.campaign.id,
      storeId: input.campaign.storeId,
      creativeId,
      itemId,
      itemGroupId,
      creativeName: metrics.at(-1)?.creativeName,
      source: metrics.at(-1)?.source || 'owned',
      state,
      score,
      daysObserved: new Set(metrics.map((item) => item.statDate)).size,
      lastActiveDate: metrics.at(-1)?.statDate || '',
      spend: gmvMaxDecimal.format(totalSpend),
      orders: gmvMaxDecimal.format(totalOrders, 0),
      recentRoi: gmvMaxDecimal.format(recentRoi, 4),
      previousRoi: gmvMaxDecimal.format(previousRoi, 4),
      roiTrendPercent: gmvMaxDecimal.format(roiTrend, 2),
      ctrTrendPercent: gmvMaxDecimal.format(ctrTrend, 2),
      signals,
      analyzedAt,
    }
  })
}

export function buildGmvMaxPortfolioPlans(input: {
  storeId: string
  campaigns: GmvMaxCampaign[]
  policies: Record<string, GmvMaxPolicy>
  learning: Record<string, GmvMaxLearningSnapshot>
  creativeInsights: GmvMaxCreativeInsight[]
  productInsights?: GmvMaxProductInsight[]
  metrics: GmvMaxDailyMetric[]
  profitGuards: Record<string, GmvMaxProfitGuard>
  pendingCampaignIds?: Set<string>
  now?: number
}): GmvMaxPortfolioPlan[] {
  const analyzedAt = input.now ?? Date.now()
  const candidates = input.campaigns.filter((campaign) => campaign.storeId === input.storeId).map((campaign) => {
    const metrics = input.metrics.filter((item) => item.campaignId === campaign.id).sort((a, b) => a.statDate.localeCompare(b.statDate)).slice(-3)
    const performance = aggregate(metrics)
    const guard = input.profitGuards[campaign.id]
    const lifecycle = input.learning[campaign.id]
    const policy = input.policies[campaign.id]
    const winners = input.creativeInsights.filter((item) => item.campaignId === campaign.id && item.state === 'winner').length
    const fatigued = input.creativeInsights.filter((item) => item.campaignId === campaign.id && item.state === 'fatigued').length
    return { campaign, metrics, performance, guard, lifecycle, policy, winners, fatigued }
  })
  const complete = candidates.filter((item) => item.guard?.complete && item.metrics.length >= 3 && item.lifecycle && item.policy)
  if (complete.length < 2) {
    return [{
      id: stableId([input.storeId, 'portfolio', 'blocked', new Date(analyzedAt).toISOString().slice(0, 10)]),
      storeId: input.storeId,
      status: 'blocked',
      transferAmount: '0',
      donorBudgetBefore: '0', donorBudgetAfter: '0', receiverBudgetBefore: '0', receiverBudgetAfter: '0',
      projectedProfitDelta: '0', confidence: 0, budgetConserved: true,
      evidenceEndDate: '', reason: 'insufficient_profit_coverage', analyzedAt,
      autoExecutable: false, updatedAt: analyzedAt,
    }]
  }

  const donors = complete.filter((item) => item.lifecycle.stage === 'declining'
    && item.performance.roi < gmvMaxDecimal.parse(item.guard.effectiveRoiFloor)
    && !input.pendingCampaignIds?.has(item.campaign.id))
    .sort((a, b) => a.lifecycle.score - b.lifecycle.score)
  const receivers = complete.filter((item) => ['scaling', 'mature'].includes(item.lifecycle.stage)
    && item.performance.roi >= percent(gmvMaxDecimal.parse(item.guard.effectiveRoiFloor), 110)
    && item.performance.utilization >= gmvMaxDecimal.parse('0.8')
    && item.metrics.slice(-2).length === 2
    && item.metrics.slice(-2).every((metric) => gmvMaxDecimal.parse(metric.roi) >= percent(gmvMaxDecimal.parse(item.guard.effectiveRoiFloor), 110)
      && gmvMaxDecimal.parse(metric.budgetUtilization) >= gmvMaxDecimal.parse('0.8'))
    && item.winners > 0
    && (item.campaign.campaignType !== 'PRODUCT'
      || input.productInsights?.some((product) => product.campaignId === item.campaign.id && product.state === 'scale_ready'))
    && !input.pendingCampaignIds?.has(item.campaign.id))
    .sort((a, b) => b.lifecycle.score - a.lifecycle.score)

  if (!donors.length || !receivers.length) {
    return [{
      id: stableId([input.storeId, 'portfolio', donors.length ? 'receiver' : 'donor', new Date(analyzedAt).toISOString().slice(0, 10)]),
      storeId: input.storeId,
      status: 'blocked',
      transferAmount: '0',
      donorBudgetBefore: '0', donorBudgetAfter: '0', receiverBudgetBefore: '0', receiverBudgetAfter: '0',
      projectedProfitDelta: '0', confidence: 0, budgetConserved: true,
      evidenceEndDate: complete.flatMap((item) => item.metrics).sort((a, b) => b.statDate.localeCompare(a.statDate))[0]?.statDate || '',
      reason: donors.length ? 'no_scale_ready_receiver' : 'no_eligible_donor', analyzedAt,
      autoExecutable: false, updatedAt: analyzedAt,
    }]
  }

  const plans: GmvMaxPortfolioPlan[] = []
  const usedReceivers = new Set<string>()
  for (const donor of donors) {
    const receiver = receivers.find((item) => item.campaign.id !== donor.campaign.id && !usedReceivers.has(item.campaign.id))
    if (!receiver) break
    const donorBudget = gmvMaxDecimal.parse(donor.campaign.budget)
    const receiverBudget = gmvMaxDecimal.parse(receiver.campaign.budget)
    const amount = percent(donorBudget, 10) < percent(receiverBudget, 20) ? percent(donorBudget, 10) : percent(receiverBudget, 20)
    if (amount <= 0n) continue
    const donorRate = ratio(donor.performance.roi, gmvMaxDecimal.parse(donor.guard.breakEvenRoi)) - SCALE
    const receiverRate = ratio(receiver.performance.roi, gmvMaxDecimal.parse(receiver.guard.breakEvenRoi)) - SCALE
    const projectedProfitDelta = (amount * (receiverRate - donorRate)) / SCALE
    const permissionsReady = donor.policy.budgetPermission && receiver.policy.budgetPermission
      && !donor.campaign.promotionDaysEnabled && !receiver.campaign.promotionDaysEnabled
    const donorEvidenceEndDate = donor.metrics.at(-1)?.statDate || ''
    const receiverEvidenceEndDate = receiver.metrics.at(-1)?.statDate || ''
    const evidenceAligned = Boolean(donorEvidenceEndDate && donorEvidenceEndDate === receiverEvidenceEndDate)
    const status = permissionsReady && projectedProfitDelta > 0n && evidenceAligned ? 'proposed' : 'blocked'
    const shadowComplete = [donor.policy, receiver.policy].every((policy) => !policy.shadowMode
      && getGmvMaxShadowReadiness(policy, analyzedAt).ready)
    const autoExecutable = status === 'proposed'
      && shadowComplete
      && donor.policy.automationEnabled && receiver.policy.automationEnabled
      && donor.policy.pilotEnabled && receiver.policy.pilotEnabled
    const donorAfter = donorBudget - amount
    const receiverAfter = receiverBudget + amount
    const evidenceEndDate = evidenceAligned ? donorEvidenceEndDate : ''
    plans.push({
      id: stableId([input.storeId, donor.campaign.id, receiver.campaign.id, evidenceEndDate, gmvMaxDecimal.format(amount)]),
      storeId: input.storeId,
      donorCampaignId: donor.campaign.id,
      receiverCampaignId: receiver.campaign.id,
      status,
      transferAmount: gmvMaxDecimal.format(amount),
      donorBudgetBefore: donor.campaign.budget,
      donorBudgetAfter: gmvMaxDecimal.format(donorAfter),
      receiverBudgetBefore: receiver.campaign.budget,
      receiverBudgetAfter: gmvMaxDecimal.format(receiverAfter),
      projectedProfitDelta: gmvMaxDecimal.format(projectedProfitDelta),
      confidence: Math.min(donor.lifecycle.confidence, receiver.lifecycle.confidence),
      budgetConserved: donorBudget + receiverBudget === donorAfter + receiverAfter,
      donorRoi: gmvMaxDecimal.format(donor.performance.roi, 4),
      receiverRoi: gmvMaxDecimal.format(receiver.performance.roi, 4),
      receiverWinningCreatives: receiver.winners,
      receiverFatiguedCreatives: receiver.fatigued,
      evidenceEndDate,
      reason: status === 'proposed'
        ? 'profit_pool_reallocation'
        : !evidenceAligned
          ? 'no_compatible_pair'
          : projectedProfitDelta <= 0n
            ? 'projected_profit_not_positive'
            : 'portfolio_permission_required',
      autoExecutable, analyzedAt, updatedAt: analyzedAt,
    })
    usedReceivers.add(receiver.campaign.id)
  }
  return plans.length ? plans : [{
    id: stableId([input.storeId, 'portfolio', 'empty', new Date(analyzedAt).toISOString().slice(0, 10)]),
    storeId: input.storeId, status: 'blocked', transferAmount: '0', donorBudgetBefore: '0', donorBudgetAfter: '0', receiverBudgetBefore: '0', receiverBudgetAfter: '0',
    projectedProfitDelta: '0', confidence: 0, budgetConserved: true, evidenceEndDate: '', reason: 'no_compatible_pair', analyzedAt,
    autoExecutable: false, updatedAt: analyzedAt,
  }]
}
