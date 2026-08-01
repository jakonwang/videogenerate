import { createHash } from 'node:crypto'
import { gmvMaxDecimal } from './optimizer'
import type { GmvMaxActionOutcome, GmvMaxCreativeMetric, GmvMaxDailyMetric, GmvMaxProfitGuard, GmvMaxRecommendation } from './types'

const SCALE = 10_000n

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n)
}

function aggregate(metrics: GmvMaxDailyMetric[], breakEvenRoi: bigint) {
  const spend = sum(metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
  const revenue = sum(metrics.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
  const roi = spend > 0n ? (revenue * SCALE) / spend : 0n
  const contribution = breakEvenRoi > 0n ? (revenue * SCALE) / breakEvenRoi : 0n
  return { spend, revenue, roi, profit: contribution - spend }
}

function average(values: bigint[]) {
  return values.length ? sum(values) / BigInt(values.length) : 0n
}

function aggregateCreative(metrics: GmvMaxCreativeMetric[]) {
  const spend = sum(metrics.map((item) => gmvMaxDecimal.parse(item.cost)))
  const revenue = sum(metrics.map((item) => gmvMaxDecimal.parse(item.grossRevenue)))
  return {
    spend,
    revenue,
    roi: spend > 0n ? (revenue * SCALE) / spend : 0n,
    orders: sum(metrics.map((item) => gmvMaxDecimal.parse(item.orders))),
    ctr: average(metrics.map((item) => gmvMaxDecimal.parse(item.ctr))),
    conversionRate: average(metrics.map((item) => gmvMaxDecimal.parse(item.conversionRate || '0'))),
    playDepth: average(metrics.map((item) => gmvMaxDecimal.parse(item.playDepth))),
  }
}

function deltaPercent(current: bigint, previous: bigint) {
  if (previous === 0n) return current === 0n ? 0n : current > 0n ? 100n * SCALE : -100n * SCALE
  const denominator = previous < 0n ? -previous : previous
  return ((current - previous) * 100n * SCALE) / denominator
}

export function measureGmvMaxActionOutcome(input: {
  recommendation: GmvMaxRecommendation
  metrics: GmvMaxDailyMetric[]
  creativeMetrics?: GmvMaxCreativeMetric[]
  actionDate: string
  profitGuard: GmvMaxProfitGuard
  now?: number
}): GmvMaxActionOutcome | null {
  const actionType = input.recommendation.actionType
  if (!input.profitGuard.complete || !actionType || !['budget', 'roi', 'creative'].includes(actionType)) return null
  const measuredActionType = actionType as GmvMaxActionOutcome['actionType']
  const sorted = [...input.metrics].sort((a, b) => a.statDate.localeCompare(b.statDate))
  const before = sorted.filter((item) => item.statDate < input.actionDate).slice(-3)
  const after = sorted.filter((item) => item.statDate > input.actionDate).slice(0, 3)
  if (before.length < 3 || after.length < 3) return null
  const breakEvenRoi = gmvMaxDecimal.parse(input.profitGuard.breakEvenRoi)
  if (breakEvenRoi <= 0n) return null
  const pre = aggregate(before, breakEvenRoi)
  const post = aggregate(after, breakEvenRoi)
  const floor = gmvMaxDecimal.parse(input.profitGuard.effectiveRoiFloor)
  let successful = input.recommendation.kind === 'scale_up'
    ? post.profit > pre.profit && post.revenue > pre.revenue && post.roi >= floor
    : post.profit > pre.profit || post.roi > pre.roi
  let creativeFields: Pick<GmvMaxActionOutcome, 'operation' | 'primaryCreativeId' | 'comparisonCreativeId' | 'preOrders' | 'postOrders' | 'preCtr' | 'postCtr' | 'preConversionRate' | 'postConversionRate' | 'prePlayDepth' | 'postPlayDepth'> = {}
  if (measuredActionType === 'creative') {
    const operationText = String(input.recommendation.actionPayload?.operation || '').toUpperCase()
    if (!['ADD', 'REMOVE', 'ROTATE'].includes(operationText)) return null
    const operation = operationText as 'ADD' | 'REMOVE' | 'ROTATE'
    const primaryCreativeId = String(operation === 'ROTATE' ? input.recommendation.actionPayload?.addCreativeId : input.recommendation.actionPayload?.creativeId || '')
    const comparisonCreativeId = String(operation === 'ROTATE' ? input.recommendation.actionPayload?.removeCreativeId : input.recommendation.actionPayload?.creativeId || '')
    if (!primaryCreativeId && operation !== 'REMOVE') return null
    const creativeMetrics = input.creativeMetrics || []
    const beforeDates = new Set(before.map((item) => item.statDate))
    const afterDates = new Set(after.map((item) => item.statDate))
    const preCreative = aggregateCreative(creativeMetrics.filter((item) => item.creativeId === comparisonCreativeId && beforeDates.has(item.statDate)))
    const postCreative = aggregateCreative(creativeMetrics.filter((item) => item.creativeId === primaryCreativeId && afterDates.has(item.statDate)))
    if (operation === 'ADD' || operation === 'ROTATE') {
      successful = postCreative.orders >= 3n * SCALE
        && postCreative.roi >= floor
        && post.profit >= pre.profit
    } else {
      successful = post.profit > pre.profit || post.roi > pre.roi
    }
    creativeFields = {
      operation,
      primaryCreativeId: primaryCreativeId || undefined,
      comparisonCreativeId: comparisonCreativeId || undefined,
      preOrders: gmvMaxDecimal.format(preCreative.orders, 0),
      postOrders: gmvMaxDecimal.format(postCreative.orders, 0),
      preCtr: gmvMaxDecimal.format(preCreative.ctr, 4),
      postCtr: gmvMaxDecimal.format(postCreative.ctr, 4),
      preConversionRate: gmvMaxDecimal.format(preCreative.conversionRate, 4),
      postConversionRate: gmvMaxDecimal.format(postCreative.conversionRate, 4),
      prePlayDepth: gmvMaxDecimal.format(preCreative.playDepth, 4),
      postPlayDepth: gmvMaxDecimal.format(postCreative.playDepth, 4),
    }
  }
  const id = createHash('sha256').update(`${input.recommendation.id}:${after[2].statDate}`).digest('hex').slice(0, 32)
  return {
    id,
    recommendationId: input.recommendation.id,
    campaignId: input.recommendation.campaignId,
    actionType: measuredActionType,
    kind: input.recommendation.kind,
    preStartDate: before[0].statDate,
    preEndDate: before[2].statDate,
    postStartDate: after[0].statDate,
    postEndDate: after[2].statDate,
    preRoi: gmvMaxDecimal.format(pre.roi, 4),
    postRoi: gmvMaxDecimal.format(post.roi, 4),
    preRevenue: gmvMaxDecimal.format(pre.revenue),
    postRevenue: gmvMaxDecimal.format(post.revenue),
    preSpend: gmvMaxDecimal.format(pre.spend),
    postSpend: gmvMaxDecimal.format(post.spend),
    preEstimatedProfit: gmvMaxDecimal.format(pre.profit),
    postEstimatedProfit: gmvMaxDecimal.format(post.profit),
    roiDeltaPercent: gmvMaxDecimal.format(deltaPercent(post.roi, pre.roi), 2),
    profitDeltaPercent: gmvMaxDecimal.format(deltaPercent(post.profit, pre.profit), 2),
    successful,
    ...creativeFields,
    measuredAt: input.now ?? Date.now(),
  }
}
