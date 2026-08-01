import { gmvMaxProfitDecimal } from './profit'
import type {
  GmvMaxCampaign,
  GmvMaxDailyMetric,
  GmvMaxLearningSnapshot,
  GmvMaxProfitGuard,
  GmvMaxStoreCost,
  GmvMaxStoreProfitSummary,
} from './types'

const SCALE = 10_000n

function format(value: bigint, digits = 2) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const whole = absolute / SCALE
  const fraction = String(absolute % SCALE).padStart(4, '0').slice(0, digits).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

function ratio(numerator: bigint, denominator: bigint) {
  return denominator > 0n ? (numerator * SCALE) / denominator : 0n
}

function exchangeRateReady(cost: GmvMaxStoreCost | undefined, now: number) {
  const currency = String(cost?.currency || '').trim().toUpperCase()
  if (['CNY', 'CNH', 'RMB'].includes(currency)) return true
  const rate = Number(cost?.cnyExchangeRate || 0)
  const updatedAt = Number(cost?.exchangeRateUpdatedAt || 0)
  return Number.isFinite(rate) && rate > 0 && updatedAt > 0 && now - updatedAt <= 7 * 86_400_000
}

export function buildGmvMaxStoreProfitSummaries(input: {
  campaigns: GmvMaxCampaign[]
  metrics: GmvMaxDailyMetric[]
  profitGuards: Record<string, GmvMaxProfitGuard>
  learning: Record<string, GmvMaxLearningSnapshot>
  storeCosts?: GmvMaxStoreCost[]
  startDate?: string
  endDate?: string
  days?: number
  now?: number
}): GmvMaxStoreProfitSummary[] {
  const storeIds = [...new Set(input.campaigns.map((campaign) => campaign.storeId))]
  return storeIds.map((storeId) => {
    const campaigns = input.campaigns.filter((campaign) => campaign.storeId === storeId)
    const ids = new Set(campaigns.map((campaign) => campaign.id))
    const allMetrics = input.metrics.filter((metric) => ids.has(metric.campaignId))
    const hasExplicitRange = Boolean(input.startDate || input.endDate)
    const metricsInRange = hasExplicitRange
      ? allMetrics.filter((metric) => {
        const statDate = metric.statDate.slice(0, 10)
        if (input.startDate && statDate < input.startDate) return false
        if (input.endDate && statDate > input.endDate) return false
        return true
      })
      : allMetrics
    const availableDates = [...new Set(metricsInRange.map((metric) => metric.statDate))].sort()
    const dates = hasExplicitRange ? availableDates : availableDates.slice(-Math.max(1, input.days || 7))
    const dateSet = new Set(dates)
    const metrics = metricsInRange.filter((metric) => dateSet.has(metric.statDate))
    let spend = 0n
    let revenue = 0n
    let orders = 0n
    let estimatedNetProfit = 0n
    let coveredRevenue = 0n
    let coveredSpend = 0n
    let atRiskSpend = 0n
    let testSpend = 0n

    for (const campaign of campaigns) {
      const campaignMetrics = metrics.filter((metric) => metric.campaignId === campaign.id)
      const campaignSpend = campaignMetrics.reduce((total, metric) => total + (gmvMaxProfitDecimal.parse(metric.cost) || 0n), 0n)
      const campaignRevenue = campaignMetrics.reduce((total, metric) => total + (gmvMaxProfitDecimal.parse(metric.grossRevenue) || 0n), 0n)
      const campaignOrders = campaignMetrics.reduce((total, metric) => total + (gmvMaxProfitDecimal.parse(metric.orders) || 0n), 0n)
      const guard = input.profitGuards[campaign.id]
      const lifecycle = input.learning[campaign.id]
      spend += campaignSpend
      revenue += campaignRevenue
      orders += campaignOrders
      if (guard?.complete) {
        const margin = gmvMaxProfitDecimal.parse(guard.contributionMarginRate) || 0n
        estimatedNetProfit += (campaignRevenue * margin) / SCALE - campaignSpend
        coveredRevenue += campaignRevenue
        coveredSpend += campaignSpend
        const campaignRoi = ratio(campaignRevenue, campaignSpend)
        if (campaignSpend > 0n && campaignRoi < (gmvMaxProfitDecimal.parse(guard.effectiveRoiFloor) || 0n)) atRiskSpend += campaignSpend
      }
      if (lifecycle && ['cold_start', 'exploration', 'validation'].includes(lifecycle.stage)) testSpend += campaignSpend
    }

    const coveredCampaignCount = campaigns.filter((campaign) => input.profitGuards[campaign.id]?.complete).length
    const spendCoveragePercent = spend > 0n ? Number((coveredSpend * 100n) / spend) : coveredCampaignCount === campaigns.length && campaigns.length > 0 ? 100 : 0
    const storeCost = input.storeCosts?.filter((item) => item.storeId === storeId).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const exchangeRateCoveragePercent = exchangeRateReady(storeCost, input.now ?? Date.now()) ? 100 : 0
    const blockedReasons: string[] = []
    if (spendCoveragePercent < 95) blockedReasons.push('profit_spend_coverage_below_95')
    if (exchangeRateCoveragePercent < 100) blockedReasons.push('exchange_rate_missing_or_stale')
    const profitEstimateAvailable = coveredCampaignCount > 0 && spendCoveragePercent >= 95 && exchangeRateCoveragePercent === 100
    const profitMargin = ratio(estimatedNetProfit, coveredRevenue)
    return {
      storeId,
      startDate: dates[0] || '',
      endDate: dates.at(-1) || '',
      campaignCount: campaigns.length,
      coveredCampaignCount,
      coveragePercent: campaigns.length ? Math.round((coveredCampaignCount / campaigns.length) * 100) : 0,
      spendCoveragePercent,
      exchangeRateCoveragePercent,
      spend: format(spend),
      grossRevenue: format(revenue),
      orders: format(orders, 0),
      roi: format(ratio(revenue, spend), 4),
      profitEstimateAvailable,
      profitSource: profitEstimateAvailable ? 'estimated' : 'unavailable',
      estimatedNetProfit: format(estimatedNetProfit),
      profitMarginRate: format(profitMargin, 4),
      capitalEfficiency: format(ratio(estimatedNetProfit, spend), 4),
      atRiskSpend: format(atRiskSpend),
      testSpend: format(testSpend),
      scaleReadyCampaigns: campaigns.filter((campaign) => input.learning[campaign.id]?.stage === 'scaling').length,
      blockedReasons,
    }
  })
}
