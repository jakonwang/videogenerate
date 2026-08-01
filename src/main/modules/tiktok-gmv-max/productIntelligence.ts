import { createHash } from 'node:crypto'
import { gmvMaxDecimal } from './optimizer'
import { calculateGmvMaxConfiguredProductProfitGuard, estimateGmvMaxNetProfit } from './profit'
import type {
  GmvMaxCampaign,
  GmvMaxCreativeMetric,
  GmvMaxListEntry,
  GmvMaxPolicy,
  GmvMaxProductCost,
  GmvMaxProductInsight,
  GmvMaxStoreCost,
} from './types'

const SCALE = 10_000n

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n)
}

function ratio(numerator: bigint, denominator: bigint) {
  return denominator > 0n ? (numerator * SCALE) / denominator : 0n
}

function percent(value: bigint, amount: number) {
  return (value * BigInt(Math.round(amount * 100))) / SCALE
}

function deltaPercent(current: bigint, previous: bigint) {
  return previous > 0n ? ((current - previous) * 100n * SCALE) / previous : 0n
}

function stableId(parts: unknown[]) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join(':')).digest('hex').slice(0, 32)
}

function observedSellingPrice(metrics: GmvMaxCreativeMetric[]) {
  const revenue = sum(metrics.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
  const orders = sum(metrics.map((item) => gmvMaxDecimal.parse(item.orders)))
  return orders > 0n && revenue > 0n ? gmvMaxDecimal.format((revenue * SCALE) / orders) : ''
}

function productName(metrics: GmvMaxCreativeMetric[], configured?: GmvMaxProductCost) {
  if (configured?.productName) return configured.productName
  for (const metric of [...metrics].reverse()) {
    const raw = metric.raw || {}
    const name = raw.product_name || raw.product_title || raw.item_group_name || raw.item_name
    if (name !== undefined && String(name).trim()) return String(name).trim()
  }
  return undefined
}

function configuredSellingPriceRange(configured?: GmvMaxProductCost) {
  const prices = (configured?.variants || [])
    .map((variant) => variant.sellingPrice)
    .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    .sort((left, right) => Number(left) - Number(right))
  const fallback = configured?.sellingPrice && Number(configured.sellingPrice) > 0 ? configured.sellingPrice : undefined
  return {
    actualSellingPriceMin: prices[0] || fallback,
    actualSellingPriceMax: prices.at(-1) || fallback,
  }
}

export function analyzeGmvMaxProductIntelligence(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  metrics: GmvMaxCreativeMetric[]
  productCosts: GmvMaxProductCost[]
  storeCost?: GmvMaxStoreCost
  listEntries: GmvMaxListEntry[]
  currency?: string
  now?: number
}): GmvMaxProductInsight[] {
  if (input.campaign.campaignType !== 'PRODUCT') return []
  const grouped = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of input.metrics) {
    if (!metric.itemGroupId) continue
    grouped.set(metric.itemGroupId, [...(grouped.get(metric.itemGroupId) || []), metric])
  }
  const totalSpend = sum(input.metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
  const totalRevenue = sum(input.metrics.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
  const testBudget = gmvMaxDecimal.parse(input.policy.creativeTestBudget)
  const analyzedAt = input.now ?? Date.now()

  return [...grouped.entries()].map(([productId, values]) => {
    const metrics = [...values].sort((a, b) => a.statDate.localeCompare(b.statDate))
    const configured = input.productCosts.find((item) => item.storeId === input.campaign.storeId
      && item.productId === productId
      && item.campaignId === input.campaign.id)
      || input.productCosts.find((item) => item.storeId === input.campaign.storeId
        && item.productId === productId
        && !item.campaignId)
    const currencyMismatch = Boolean(configured?.currency && input.currency && configured.currency !== input.currency)
    const guard = currencyMismatch
      ? { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: input.policy.minRoi, reason: 'Product cost currency does not match the advertiser currency.' }
      : calculateGmvMaxConfiguredProductProfitGuard({
        product: configured,
        storeCost: input.storeCost,
        fallbackSellingPrice: observedSellingPrice(metrics),
        fallbackSellingPriceSource: 'observed',
        minRoi: input.policy.minRoi,
        safetyMarginPercent: input.policy.profitSafetyMarginPercent,
      })
    const recentDates = [...new Set(metrics.map((item) => item.statDate))].slice(-2)
    const previousDates = [...new Set(metrics.map((item) => item.statDate))].slice(-4, -2)
    const recent = metrics.filter((item) => recentDates.includes(item.statDate))
    const previous = metrics.filter((item) => previousDates.includes(item.statDate))
    const spend = sum(metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
    const revenue = sum(metrics.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
    const orders = sum(metrics.map((item) => gmvMaxDecimal.parse(item.orders)))
    const roi = ratio(revenue, spend)
    const recentSpend = sum(recent.map((item) => gmvMaxDecimal.parse(item.cost)))
    const recentRevenue = sum(recent.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
    const recentOrders = sum(recent.map((item) => gmvMaxDecimal.parse(item.orders)))
    const recentRoi = ratio(recentRevenue, recentSpend)
    const previousSpend = sum(previous.map((item) => gmvMaxDecimal.parse(item.cost)))
    const previousRevenue = sum(previous.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
    const previousRoi = ratio(previousRevenue, previousSpend)
    const roiTrend = deltaPercent(recentRoi, previousRoi)
    const floor = gmvMaxDecimal.parse(guard.effectiveRoiFloor)
    const recentDirectionConsistent = recentDates.length === 2 && recentDates.every((date) => {
      const daily = recent.filter((item) => item.statDate === date)
      const dailySpend = sum(daily.map((item) => gmvMaxDecimal.parse(item.cost)))
      const dailyRevenue = sum(daily.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
      return dailySpend > 0n && ratio(dailyRevenue, dailySpend) >= percent(floor, 110)
    })
    const spendShare = ratio(spend, totalSpend)
    const revenueShare = ratio(revenue, totalRevenue)
    const creativeCount = new Set(metrics.map((item) => item.creativeId)).size
    const daysObserved = new Set(metrics.map((item) => item.statDate)).size
    const listEntry = input.listEntries.find((item) => item.entityType === 'product'
      && item.entityId === productId
      && item.storeId === input.campaign.storeId
      && (!item.campaignId || item.campaignId === input.campaign.id))
    const protectedProduct = listEntry?.mode === 'allow'
    const denied = listEntry?.mode === 'deny'
    const signals: string[] = []
    let state: GmvMaxProductInsight['state'] = 'stable'

    if (denied) {
      state = 'blocked'
      signals.push('product_denied')
    } else if (!guard.complete) {
      state = 'blocked'
      signals.push('cost_data_incomplete')
    } else if (daysObserved <= 1 || spend <= 0n) {
      state = 'cold_start'
      signals.push('product_new')
    } else if (recentOrders === 0n && testBudget > 0n && recentSpend >= testBudget) {
      state = 'losing'
      signals.push('test_budget_exhausted')
    } else if (orders >= 3n * SCALE && roi < percent(floor, 70)) {
      state = 'losing'
      signals.push('profit_floor_severely_breached')
    } else if (previous.length > 0 && previousRoi >= floor && (recentRoi < percent(floor, 90) || roiTrend <= gmvMaxDecimal.parse('-30'))) {
      state = 'declining'
      signals.push('product_roi_decay')
    } else if (recentDirectionConsistent
      && recentOrders >= BigInt(input.policy.minOrders) * SCALE
      && creativeCount >= 2) {
      state = 'scale_ready'
      signals.push('profit_and_creative_proof')
    } else if (orders >= 3n * SCALE && recentRoi >= floor) {
      state = 'winner'
      signals.push('product_profit_winner')
    } else if (orders < 3n * SCALE && (testBudget <= 0n || spend < testBudget)) {
      state = 'testing'
      signals.push('sample_building')
    } else if (recentRoi < floor) {
      signals.push('below_profit_floor')
    } else {
      signals.push('performance_stable')
    }
    if (protectedProduct) signals.push('product_protected')

    let allocationState: GmvMaxProductInsight['allocationState'] = 'balanced'
    if (state === 'blocked') allocationState = 'blocked'
    else if (['winner', 'scale_ready'].includes(state) && revenueShare > percent(spendShare, 125)) allocationState = 'starved'
    else if (['losing', 'declining'].includes(state) || (spend > testBudget && spendShare > percent(revenueShare, 150))) allocationState = 'overfunded'

    const recommendedAction: GmvMaxProductInsight['recommendedAction'] = state === 'blocked'
      ? guard.complete ? 'exclude' : 'complete_costs'
      : state === 'cold_start' ? 'collect_data'
        : state === 'testing' ? 'test_creatives'
          : state === 'scale_ready' || allocationState === 'starved' ? 'scale'
            : state === 'losing' ? protectedProduct ? 'hold' : 'exclude'
              : state === 'declining' || allocationState === 'overfunded' ? 'reduce'
                : 'hold'

    let score = 50
    if (guard.complete) score += 10
    if (recentRoi >= floor) score += 15
    if (recentRoi >= percent(floor, 110)) score += 10
    if (creativeCount >= 2) score += 8
    if (recentOrders >= BigInt(input.policy.minOrders) * SCALE) score += 7
    if (roiTrend >= gmvMaxDecimal.parse('15')) score += 5
    if (state === 'declining') score -= 20
    if (state === 'losing' || state === 'blocked') score -= 35
    score = Math.max(0, Math.min(100, score))
    const profitEstimateAvailable = guard.complete
    return {
      id: stableId([input.campaign.id, productId, metrics.at(-1)?.statDate]),
      campaignId: input.campaign.id,
      storeId: input.campaign.storeId,
      productId,
      productName: productName(metrics, configured),
      imageUrl: configured?.imageUrl,
      categoryName: configured?.categoryName,
      inventory: configured?.inventory,
      skuCount: configured?.skuCount,
      sellingPrice: configured?.sellingPrice,
      ...configuredSellingPriceRange(configured),
      currency: configured?.currency,
      catalogStatus: configured?.catalogStatus,
      gmvMaxAdsStatus: configured?.gmvMaxAdsStatus,
      state,
      score,
      daysObserved,
      creativeCount,
      spend: gmvMaxDecimal.format(spend),
      grossRevenue: gmvMaxDecimal.format(revenue),
      orders: gmvMaxDecimal.format(orders, 0),
      roi: gmvMaxDecimal.format(roi, 4),
      recentRoi: gmvMaxDecimal.format(recentRoi, 4),
      previousRoi: gmvMaxDecimal.format(previousRoi, 4),
      roiTrendPercent: gmvMaxDecimal.format(roiTrend, 2),
      profitEstimateAvailable,
      estimatedProfit: profitEstimateAvailable
        ? estimateGmvMaxNetProfit({ cost: gmvMaxDecimal.format(spend), grossRevenue: gmvMaxDecimal.format(revenue), contributionMarginRate: guard.contributionMarginRate })
        : '-',
      profitFloor: guard.effectiveRoiFloor,
      spendShare: gmvMaxDecimal.format(spendShare, 4),
      revenueShare: gmvMaxDecimal.format(revenueShare, 4),
      allocationState,
      recommendedAction,
      protected: protectedProduct,
      signals,
      analyzedAt,
    }
  }).sort((a, b) => b.score - a.score)
}
