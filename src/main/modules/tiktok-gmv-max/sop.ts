import { createHash } from 'node:crypto'
import type {
  GmvMaxCreativeInsight,
  GmvMaxCreativeMetric,
  GmvMaxCampaign,
  GmvMaxDailyMetric,
  GmvMaxPolicy,
  GmvMaxProfitGuard,
  GmvMaxMatureAssessment,
  GmvMaxMatureBaseline,
  GmvMaxSopInstance,
  GmvMaxSopIntervention,
  GmvMaxSopInterventionOutcomeMetrics,
  GmvMaxSopMetricSummary,
  GmvMaxSopPhase,
  GmvMaxSopTask,
  GmvMaxSupplementalMetric,
  GmvMaxWinnerDna,
} from './types'

const DAY_MS = 86_400_000
const PHASE_RANK: Record<GmvMaxSopPhase, number> = {
  preparation: 0,
  cold_start: 1,
  scaling: 2,
  matrix: 3,
  factory: 4,
  steady: 5,
  recovery_diagnosis: 0,
  single_variable_repair: 1,
  controlled_scaling: 2,
  second_generation_creatives: 3,
  traffic_pool_expansion: 4,
  stable_operations: 5,
}

export const GMV_MAX_MATURE_CREATIVE_MIX = { protectedWinners: 0.25, winnerVariations: 0.55, newConcepts: 0.2 } as const
export const GMV_MAX_SOP_AUTOMATION_RETRY_MS = 30 * 60 * 1000
export const GMV_MAX_WINNER_DRAFT_RETRY_MS = 6 * 60 * 60 * 1000

export function planGmvMaxSopAutomation(input: {
  track: 'new_product' | 'mature_product' | 'live'
  phase: GmvMaxSopPhase
  matureState?: GmvMaxMatureAssessment['state']
  automationMode: 'diagnostic_only' | 'draft_actions'
  writeActionsAllowed: boolean
  consecutiveProfitableDays: number
  blockers?: string[]
}) {
  if (input.track === 'new_product') {
    if (input.blockers?.length) return { kind: 'blocker_resolution_task' as const }
    if (input.phase === 'preparation') return { kind: 'new_product_readiness_task' as const }
    if (input.phase === 'cold_start') return { kind: 'new_product_cold_start_task' as const }
    if (input.phase === 'scaling') return { kind: 'new_product_scaling_task' as const }
    if (input.phase === 'matrix') return { kind: 'new_product_matrix_task' as const }
    if (input.phase === 'factory') return { kind: 'new_product_factory_task' as const }
    return { kind: 'new_product_steady_task' as const }
  }
  if (input.track === 'live') {
    if (input.blockers?.length) return { kind: 'blocker_resolution_task' as const }
    if (input.phase === 'preparation') return { kind: 'live_readiness_task' as const }
    if (input.phase === 'cold_start') return { kind: 'live_cold_start_task' as const }
    if (input.phase === 'steady') return { kind: 'live_steady_task' as const }
    return { kind: 'live_growth_task' as const }
  }
  if (!input.matureState) return { kind: 'phase_review' as const }
  if (input.matureState === 'dormant_recovery') return { kind: 'recovery_task' as const }
  if (input.matureState === 'diagnosis_required') return { kind: 'controls_task' as const }
  if (input.matureState === 'competitive_decay' || input.matureState === 'growth_ceiling') return { kind: 'creative_task' as const }
  if (input.matureState === 'healthy_hold') return { kind: 'hold' as const }
  if (input.automationMode === 'diagnostic_only') return { kind: 'diagnostic_task' as const }
  if (input.matureState === 'velocity_constrained') return { kind: 'product_budget_external' as const }
  if (input.matureState === 'scale_ready') return input.consecutiveProfitableDays >= 3 ? { kind: 'auto_budget_external' as const } : { kind: 'profit_observation_task' as const }
  if (input.matureState === 'quality_decay' && input.writeActionsAllowed) return { kind: 'roi_approval_draft' as const }
  return { kind: 'diagnostic_task' as const }
}

function id(...parts: unknown[]) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join(':')).digest('hex').slice(0, 32)
}

export function buildGmvMaxSopAutomationRunId(input: { instanceId: string; localDate: string; state: string; decision: string; decisionContext: string }) {
  return id(input.instanceId, input.localDate, input.state, input.decision, input.decisionContext)
}

export function shouldRunGmvMaxSopAutomation(input: { previous?: { status: 'completed' | 'skipped' | 'failed'; updatedAt: number; nextRetryAt?: number }; now: number; force?: boolean }) {
  if (!input.previous || input.force) return true
  if (input.previous.status !== 'failed') return false
  return (input.previous.nextRetryAt || input.previous.updatedAt + GMV_MAX_SOP_AUTOMATION_RETRY_MS) <= input.now
}

export function shouldRetryGmvMaxWinnerDraft(dna: Pick<GmvMaxWinnerDna, 'draftStatus' | 'nextDraftRetryAt'>, now: number) {
  return dna.draftStatus !== 'created' && (!dna.nextDraftRetryAt || dna.nextDraftRetryAt <= now)
}

export function supersedeGmvMaxSopAutomationTasks(tasks: GmvMaxSopTask[], activeTaskId: string, updatedAt: number, preserveTaskIds: string[] = []) {
  const preserved = new Set(preserveTaskIds)
  return tasks
    .filter((task) => task.kind === 'sop_automation' && task.status === 'pending' && task.id !== activeTaskId && !preserved.has(task.id))
    .map((task) => ({
      ...task,
      status: 'superseded' as const,
      evidence: 'Superseded by a newer automatic SOP decision.',
      completedAt: updatedAt,
      updatedAt,
    }))
}

export function supersedeExpiredGmvMaxSopTasks(tasks: GmvMaxSopTask[], localDate: string, updatedAt: number) {
  return tasks
    .filter((task) => task.status === 'pending' && task.localDate < localDate && task.executionMode !== 'manual_external')
    .map((task) => ({
      ...task,
      status: 'superseded' as const,
      evidence: `Expired when the ${localDate} operating day started.`,
      completedAt: updatedAt,
      updatedAt,
    }))
}

export function shouldCreateGmvMaxSopRollback(intervention: GmvMaxSopIntervention, outcome: GmvMaxSopInterventionOutcomeMetrics) {
  return outcome.verdict === 'declined'
    && !intervention.rollbackOfInterventionId
    && !intervention.rollbackInterventionId
    && intervention.status === 'completed'
}

export function completeEvidenceBackedGmvMaxSopTasks(input: {
  tasks: GmvMaxSopTask[]
  localDate: string
  latestReportDate?: string
  creativeInsightCount: number
  createdWinnerDraftCount: number
  liveEvidenceDate?: string
  updatedAt: number
}) {
  const evidenceByKind = new Map<GmvMaxSopTask['kind'], string>()
  if (input.latestReportDate) evidenceByKind.set('data_review', `System analysis completed using report data through ${input.latestReportDate}.`)
  if (input.creativeInsightCount > 0) evidenceByKind.set('creative_review', `${input.creativeInsightCount} creative insights were analyzed automatically.`)
  if (input.createdWinnerDraftCount > 0) evidenceByKind.set('winner_variations', `${input.createdWinnerDraftCount} Winner draft projects are available.`)
  if (input.liveEvidenceDate) evidenceByKind.set('live_review', `LIVE conversion evidence is available through ${input.liveEvidenceDate}.`)
  return input.tasks
    .filter((task) => task.localDate === input.localDate && task.status === 'pending' && evidenceByKind.has(task.kind))
    .map((task) => ({
      ...task,
      status: 'completed' as const,
      evidence: evidenceByKind.get(task.kind),
      completedAt: input.updatedAt,
      updatedAt: input.updatedAt,
    }))
}

function interventionPeriodMetrics(items: GmvMaxDailyMetric[]) {
  const spend = items.reduce((sum, item) => sum + number(item.cost), 0)
  const gmv = items.reduce((sum, item) => sum + number(item.grossRevenue), 0)
  const orders = items.reduce((sum, item) => sum + number(item.orders), 0)
  return {
    deliveryDays: items.length,
    spend: spend.toFixed(4),
    gmv: gmv.toFixed(4),
    orders: orders.toFixed(4),
    roi: (spend > 0 ? gmv / spend : 0).toFixed(4),
  }
}

function aggregateInterventionDeliveryDays(dailyMetrics: GmvMaxDailyMetric[]) {
  const byDate = new Map<string, GmvMaxDailyMetric>()
  for (const item of dailyMetrics) {
    const current = byDate.get(item.statDate)
    if (!current) {
      byDate.set(item.statDate, { ...item })
      continue
    }
    const cost = number(current.cost) + number(item.cost)
    const grossRevenue = number(current.grossRevenue) + number(item.grossRevenue)
    byDate.set(item.statDate, {
      ...current,
      cost: cost.toFixed(4),
      grossRevenue: grossRevenue.toFixed(4),
      orders: (number(current.orders) + number(item.orders)).toFixed(4),
      roi: (cost > 0 ? grossRevenue / cost : 0).toFixed(4),
    })
  }
  return [...byDate.values()]
    .filter((item) => number(item.cost) > 0 || number(item.orders) > 0)
    .sort((a, b) => a.statDate.localeCompare(b.statDate))
}

function changePercent(before: number, after: number) {
  if (before <= 0) return undefined
  return (((after - before) / before) * 100).toFixed(2)
}

export function buildGmvMaxSopInterventionOutcome(dailyMetrics: GmvMaxDailyMetric[], startedDate: string | undefined, requiredDeliveryDays: number): GmvMaxSopInterventionOutcomeMetrics | undefined {
  if (!startedDate || requiredDeliveryDays <= 0) return undefined
  const deliveryDays = aggregateInterventionDeliveryDays(dailyMetrics)
  const beforeItems = deliveryDays.filter((item) => item.statDate <= startedDate).slice(-requiredDeliveryDays)
  const afterItems = deliveryDays.filter((item) => item.statDate > startedDate).slice(0, requiredDeliveryDays)
  if (afterItems.length < requiredDeliveryDays) return undefined
  const before = interventionPeriodMetrics(beforeItems)
  const after = interventionPeriodMetrics(afterItems)
  const beforeRoi = number(before.roi)
  const afterRoi = number(after.roi)
  const beforeSpend = number(before.spend)
  const afterSpend = number(after.spend)
  const beforeOrders = number(before.orders)
  const afterOrders = number(after.orders)
  const verdict = beforeItems.length < requiredDeliveryDays || beforeSpend <= 0
    ? 'measured' as const
    : afterRoi >= beforeRoi * 1.05 && afterOrders >= beforeOrders * 0.9
      ? 'improved' as const
      : afterRoi < beforeRoi * 0.9 || afterOrders < beforeOrders * 0.8
        ? 'declined' as const
        : 'stable' as const
  return {
    before,
    after,
    roiChangePercent: changePercent(beforeRoi, afterRoi),
    spendChangePercent: changePercent(beforeSpend, afterSpend),
    orderChangePercent: changePercent(beforeOrders, afterOrders),
    verdict,
  }
}

export function countGmvMaxObservedDeliveryDays(dailyMetrics: GmvMaxDailyMetric[], startedDate?: string) {
  if (!startedDate) return 0
  return new Set(dailyMetrics
    .filter((item) => item.statDate > startedDate && (number(item.cost) > 0 || number(item.orders) > 0))
    .map((item) => item.statDate)).size
}

export function advanceGmvMaxSopInterventionObservation(intervention: GmvMaxSopIntervention, observedDeliveryDays: number, updatedAt: number) {
  const completed = observedDeliveryDays >= intervention.requiredDeliveryDays
  return {
    ...intervention,
    observedDeliveryDays,
    status: completed ? 'completed' as const : 'observing' as const,
    outcome: completed ? intervention.outcome || 'Observation completed after three delivery days.' : intervention.outcome,
    updatedAt,
  }
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export type GmvMaxAutomaticSopProductCandidate = {
  productId: string
  productName?: string
  grossRevenue: string
  orders: string
  spend: string
  firstStatDate?: string
  lastStatDate?: string
  reportedDays: number
}

export function selectGmvMaxAutomaticSopProductCandidate(metrics: GmvMaxCreativeMetric[]): GmvMaxAutomaticSopProductCandidate | undefined {
  const products = new Map<string, { productId: string; productName?: string; grossRevenue: number; orders: number; spend: number; dates: Set<string> }>()
  for (const metric of metrics) {
    const productId = String(metric.itemGroupId || '').trim()
    if (!productId) continue
    const current = products.get(productId) || { productId, grossRevenue: 0, orders: 0, spend: 0, dates: new Set<string>() }
    current.grossRevenue += number(metric.grossRevenue)
    current.orders += number(metric.orders)
    current.spend += number(metric.cost)
    current.dates.add(metric.statDate.slice(0, 10))
    if (!current.productName) {
      for (const key of ['product_name', 'product_title', 'item_name']) {
        const value = String(metric.raw?.[key] || '').trim()
        if (value) {
          current.productName = value
          break
        }
      }
    }
    products.set(productId, current)
  }
  const candidate = [...products.values()]
    .filter((item) => item.grossRevenue > 0 || item.orders > 0)
    .sort((left, right) => right.grossRevenue - left.grossRevenue
      || right.orders - left.orders
      || right.spend - left.spend
      || right.productId.localeCompare(left.productId))[0]
  if (!candidate) return undefined
  const dates = [...candidate.dates].sort()
  return {
    productId: candidate.productId,
    productName: candidate.productName,
    grossRevenue: decimal(candidate.grossRevenue),
    orders: decimal(candidate.orders),
    spend: decimal(candidate.spend),
    firstStatDate: dates[0],
    lastStatDate: dates.at(-1),
    reportedDays: dates.length,
  }
}

export function buildGmvMaxAutomaticSopInstance(input: { campaign: GmvMaxCampaign; localDate: string; candidate?: GmvMaxAutomaticSopProductCandidate; productName?: string; now: number }): GmvMaxSopInstance | undefined {
  const { campaign, candidate, localDate, now } = input
  if (campaign.campaignType === 'PRODUCT' && !candidate) return undefined
  const productId = campaign.campaignType === 'PRODUCT' ? candidate?.productId : undefined
  return {
    id: id(campaign.id, productId || 'live'),
    bindingId: campaign.bindingId,
    campaignId: campaign.id,
    storeId: campaign.storeId,
    campaignType: campaign.campaignType,
    productId,
    productName: input.productName || candidate?.productName,
    startDate: candidate?.firstStatDate || localDate,
    phase: 'preparation',
    status: 'active',
    currentDay: 0,
    blockers: [],
    track: campaign.campaignType === 'LIVE' ? 'live' : undefined,
    trackSource: 'auto',
    automationEnabled: true,
    automationMode: 'draft_actions',
    creationSource: 'automatic',
    autoStartEvidence: campaign.campaignType === 'LIVE'
      ? { reason: 'live_campaign' }
      : { reason: 'top_sales_product', ...candidate },
    createdAt: now,
    updatedAt: now,
  }
}

function decimal(value: number) {
  return Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') || '0' : '0'
}

function ratio(value: number) {
  return Math.max(0, Math.min(1, value))
}

function dateValue(date: string) {
  const parsed = Date.parse(`${String(date).slice(0, 10)}T00:00:00.000Z`)
  return Number.isFinite(parsed) ? parsed : 0
}

function preferredSupplementalMetrics(items: GmvMaxSupplementalMetric[]) {
  const priority = { manual: 1, csv: 2, api: 3 }
  const selected = new Map<string, GmvMaxSupplementalMetric>()
  for (const item of items) {
    const key = `${item.productId || ''}:${item.statDate}`
    const current = selected.get(key)
    if (!current || priority[item.source] > priority[current.source] || (priority[item.source] === priority[current.source] && item.updatedAt > current.updatedAt)) {
      selected.set(key, item)
    }
  }
  return selected
}

export function calculateGmvMaxLiveScore(metric?: GmvMaxSupplementalMetric) {
  if (!metric) return undefined
  const uv = number(metric.liveUv)
  const clicks = number(metric.productClicks)
  const orders = number(metric.orders)
  const paidOrders = number(metric.paidOrders)
  if (uv <= 0 || metric.liveStayRate === undefined) return undefined
  const clickRate = ratio(clicks / uv)
  const orderRate = ratio(orders / uv)
  const paymentRate = orders > 0 ? ratio(paidOrders / orders) : 0
  const stayRate = ratio(number(metric.liveStayRate) > 1 ? number(metric.liveStayRate) / 100 : number(metric.liveStayRate))
  return decimal((clickRate * 30) + (orderRate * 40) + (paymentRate * 20) + (stayRate * 10))
}

export function classifyGmvMaxCreativeGrade(input: {
  insight?: GmvMaxCreativeInsight
  metric?: GmvMaxCreativeMetric
  targetRoi: number
}) {
  const orders = number(input.metric?.orders)
  const impressions = number(input.metric?.productImpressions)
  const clicks = number(input.metric?.productClicks)
  const roiValue = number(input.metric?.roi)
  if (input.insight?.state === 'winner' || (orders > 0 && roiValue >= input.targetRoi && String(input.metric?.status || '').toUpperCase() !== 'NOT_DELIVERING')) return 'S' as const
  if (orders > 0 || clicks > 0) return 'A' as const
  if (impressions > 0 && input.insight?.state !== 'waste') return 'B' as const
  return 'C' as const
}

export function buildGmvMaxProductDailyMetrics(input: {
  campaignId: string
  advertiserId?: string
  storeId: string
  metrics: GmvMaxCreativeMetric[]
}): GmvMaxDailyMetric[] {
  const grouped = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of input.metrics) {
    const statDate = metric.statDate.slice(0, 10)
    grouped.set(statDate, [...(grouped.get(statDate) || []), metric])
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([statDate, metrics]) => {
      const cost = metrics.reduce((sum, item) => sum + number(item.cost), 0)
      const grossRevenue = metrics.reduce((sum, item) => sum + number(item.grossRevenue), 0)
      const orders = metrics.reduce((sum, item) => sum + number(item.orders), 0)
      return {
        id: id(input.campaignId, 'product', statDate),
        campaignId: input.campaignId,
        advertiserId: input.advertiserId || '',
        storeId: input.storeId,
        campaignType: 'PRODUCT' as const,
        statDate,
        cost: decimal(cost),
        grossRevenue: decimal(grossRevenue),
        roi: decimal(cost > 0 ? grossRevenue / cost : 0),
        orders: decimal(orders),
        budgetUtilization: '0',
        raw: { source: 'product_creative_metrics', metricCount: metrics.length },
        syncedAt: Math.max(...metrics.map((item) => item.syncedAt)),
      }
    })
}

export function buildGmvMaxSopMetricSummary(input: {
  dailyMetrics: GmvMaxDailyMetric[]
  creativeMetrics: GmvMaxCreativeMetric[]
  creativeInsights: GmvMaxCreativeInsight[]
  supplementalMetrics: GmvMaxSupplementalMetric[]
  contributionMarginRate: string
}): GmvMaxSopMetricSummary {
  const daily = [...input.dailyMetrics].sort((a, b) => a.statDate.localeCompare(b.statDate))
  const supplemental = preferredSupplementalMetrics(input.supplementalMetrics)
  let spend = 0
  let gmv = 0
  let orders = 0
  let netGmv = 0
  let consecutiveProfitableDays = 0
  const marginRate = ratio(number(input.contributionMarginRate))
  for (const metric of daily) {
    const date = metric.statDate.slice(0, 10)
    const fallbackOrders = number(metric.orders)
    const extra = supplemental.get(`:${date}`) || [...supplemental.values()].find((item) => item.statDate === date)
    const dailySpend = number(metric.cost)
    const dailyGmv = number(metric.grossRevenue)
    const dailyNetGmv = extra?.netGmv !== undefined
      ? number(extra.netGmv)
      : Math.max(0, dailyGmv - number(extra?.refundAmount))
    const dailyProfit = (dailyNetGmv * marginRate) - dailySpend
    spend += dailySpend
    gmv += dailyGmv
    orders += extra?.orders !== undefined ? number(extra.orders) : fallbackOrders
    netGmv += dailyNetGmv
    const delivered = dailySpend > 0 || number(extra?.orders) > 0 || fallbackOrders > 0
    consecutiveProfitableDays = delivered && dailyProfit >= 0 ? consecutiveProfitableDays + 1 : 0
  }

  const productImpressions = input.creativeMetrics.reduce((sum, item) => sum + number(item.productImpressions), 0)
  const productClicks = input.creativeMetrics.reduce((sum, item) => sum + number(item.productClicks), 0)
  const creativeOrders = input.creativeMetrics.reduce((sum, item) => sum + number(item.orders), 0)
  const latestLive = [...supplemental.values()].sort((a, b) => b.statDate.localeCompare(a.statDate))[0]
  const liveUv = number(latestLive?.liveUv)
  const liveOrders = latestLive?.orders === undefined ? 0 : number(latestLive.orders)
  const uniqueInsights = new Map(input.creativeInsights.map((item) => [item.creativeId, item]))
  const winningCreativeCount = [...uniqueInsights.values()].filter((item) => item.state === 'winner').length
  const exploringCount = [...uniqueInsights.values()].filter((item) => item.state === 'new' || item.state === 'testing').length
  const estimatedNetProfit = (netGmv * marginRate) - spend

  return {
    spend: decimal(spend),
    gmv: decimal(gmv),
    roi: decimal(spend > 0 ? gmv / spend : 0),
    orders: decimal(orders),
    aov: decimal(orders > 0 ? gmv / orders : 0),
    costPerOrder: decimal(orders > 0 ? spend / orders : 0),
    ctr: decimal(productImpressions > 0 ? productClicks / productImpressions : 0),
    cvr: decimal(productClicks > 0 ? creativeOrders / productClicks : 0),
    creativeExplorationRate: decimal(uniqueInsights.size > 0 ? exploringCount / uniqueInsights.size : 0),
    winningCreativeCount,
    liveUvToOrderCvr: decimal(liveUv > 0 ? liveOrders / liveUv : 0),
    netGmv: decimal(netGmv),
    netRoi: decimal(spend > 0 ? netGmv / spend : 0),
    estimatedNetProfit: decimal(estimatedNetProfit),
    liveScore: calculateGmvMaxLiveScore(latestLive),
    completeDays: daily.length,
    consecutiveProfitableDays,
  }
}

function dateOffset(date: string, offset: number) {
  return new Date(dateValue(date) + (offset * DAY_MS)).toISOString().slice(0, 10)
}

function percentChange(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : undefined
}

function buildBaseline(dailyMetrics: GmvMaxDailyMetric[], endDate: string, days: number): GmvMaxMatureBaseline {
  const startDate = dateOffset(endDate, -(days - 1))
  const rows = dailyMetrics.filter((item) => item.statDate >= startDate && item.statDate <= endDate)
  const spend = rows.reduce((sum, item) => sum + number(item.cost), 0)
  const gmv = rows.reduce((sum, item) => sum + number(item.grossRevenue), 0)
  const orders = rows.reduce((sum, item) => sum + number(item.orders), 0)
  return {
    startDate,
    endDate,
    reportedDays: new Set(rows.map((item) => item.statDate)).size,
    deliveryDays: new Set(rows.filter((item) => number(item.cost) > 0 || number(item.orders) > 0).map((item) => item.statDate)).size,
    missingDays: Math.max(0, days - new Set(rows.map((item) => item.statDate)).size),
    spend: decimal(spend),
    gmv: decimal(gmv),
    orders: decimal(orders),
    roi: decimal(spend > 0 ? gmv / spend : 0),
  }
}

export function detectGmvMaxSopTrack(input: {
  campaignType: 'PRODUCT' | 'LIVE'
  localDate: string
  startDate: string
  dailyMetrics: GmvMaxDailyMetric[]
  cumulativeOrders?: number
}) {
  if (input.campaignType === 'LIVE') return { track: 'live' as const, evidence: { productAgeDays: 0, activeDeliveryDays: 0, cumulativeOrders: 0, matchedRules: [] } }
  const dates = input.dailyMetrics.map((item) => item.statDate).filter(Boolean).sort()
  const firstDate = dates[0] || input.startDate
  const productAgeDays = Math.max(0, Math.floor((dateValue(input.localDate) - dateValue(firstDate)) / DAY_MS) + 1)
  const activeDeliveryDays = new Set(input.dailyMetrics.filter((item) => number(item.cost) > 0 || number(item.orders) > 0).map((item) => item.statDate)).size
  const cumulativeOrders = input.cumulativeOrders ?? input.dailyMetrics.reduce((sum, item) => sum + number(item.orders), 0)
  const matchedRules: Array<'age_30_days' | 'delivery_14_days' | 'orders_100'> = []
  if (productAgeDays >= 30) matchedRules.push('age_30_days')
  if (activeDeliveryDays >= 14) matchedRules.push('delivery_14_days')
  if (cumulativeOrders >= 100) matchedRules.push('orders_100')
  return { track: matchedRules.length ? 'mature_product' as const : 'new_product' as const, evidence: { productAgeDays, activeDeliveryDays, cumulativeOrders, matchedRules } }
}

export function buildGmvMaxMatureAssessment(input: {
  instance: GmvMaxSopInstance
  localDate: string
  campaignStatus: string
  dailyMetrics: GmvMaxDailyMetric[]
  supplementalMetrics: GmvMaxSupplementalMetric[]
  metrics: GmvMaxSopMetricSummary
  profitFloor: number
  targetRoi: number
}): GmvMaxMatureAssessment {
  const completeEnd = dateOffset(input.localDate, -1)
  const recent7d = buildBaseline(input.dailyMetrics, completeEnd, 7)
  const previous7d = buildBaseline(input.dailyMetrics, dateOffset(completeEnd, -7), 7)
  const baseline30d = buildBaseline(input.dailyMetrics, completeEnd, 30)
  const normalizedDaily = input.dailyMetrics.map((item) => ({ ...item, statDate: item.statDate.slice(0, 10) }))
  const delivered = normalizedDaily.filter((item) => number(item.cost) > 0 || number(item.orders) > 0).sort((a, b) => a.statDate.localeCompare(b.statDate))
  const lastReportDate = normalizedDaily.map((item) => item.statDate).sort().at(-1)
  const lastDeliveryDate = delivered.at(-1)?.statDate
  const staleDays = lastReportDate ? Math.floor((dateValue(input.localDate) - dateValue(lastReportDate)) / DAY_MS) - 1 : Number.POSITIVE_INFINITY
  const preferred = [...preferredSupplementalMetrics(input.supplementalMetrics).values()].filter((item) => !input.instance.productId || item.productId === input.instance.productId).sort((a, b) => b.statDate.localeCompare(a.statDate))[0]
  const productBudget = preferred?.productBudget === undefined ? undefined : number(preferred.productBudget)
  const utilization = productBudget && productBudget > 0 && recent7d.deliveryDays > 0 ? number(recent7d.spend) / recent7d.deliveryDays / productBudget : undefined
  const currentHour = Math.max(1, new Date().getHours())
  const historicHourlySpend = recent7d.deliveryDays > 0 ? number(recent7d.spend) / recent7d.deliveryDays / 24 : 0
  const velocity = preferred?.intradaySpend !== undefined && historicHourlySpend > 0 ? (number(preferred.intradaySpend) / currentHour) / historicHourlySpend : undefined
  const roiChange = percentChange(number(recent7d.roi), number(previous7d.roi))
  const gmvGrowth = percentChange(number(recent7d.gmv), number(previous7d.gmv))
  const reportCoverage = recent7d.reportedDays / 7
  const dataCoverage = [recent7d.reportedDays > 0, previous7d.reportedDays > 0, productBudget !== undefined, preferred?.targetRoi !== undefined, preferred?.intradaySpend !== undefined].filter(Boolean).length / 5
  const disabled = !['ENABLE', 'ACTIVE'].includes(String(input.campaignStatus).toUpperCase())
  const stale = staleDays > 2
  const reasons: string[] = []
  let state: GmvMaxMatureAssessment['state'] = 'healthy_hold'

  if (disabled || stale || !lastDeliveryDate) {
    state = 'dormant_recovery'
    if (disabled) reasons.push('campaign_disabled')
    if (stale) reasons.push('delivery_data_stale')
    if (!lastDeliveryDate) reasons.push('delivery_missing')
  } else if (dataCoverage < 0.8 || utilization === undefined || velocity === undefined) {
    state = 'diagnosis_required'
    if (productBudget === undefined) reasons.push('product_budget_missing')
    if (preferred?.intradaySpend === undefined) reasons.push('intraday_spend_missing')
    if (reportCoverage < 0.8) reasons.push('report_coverage_low')
  } else if (((roiChange ?? 0) <= -0.15 || number(recent7d.roi) < input.profitFloor) && utilization >= 0.85) {
    state = 'quality_decay'
  } else if (((roiChange ?? 0) < 0 || number(recent7d.roi) < input.targetRoi) && utilization < 0.85) {
    state = 'competitive_decay'
  } else if (number(recent7d.roi) >= input.targetRoi * 1.05 && utilization < 0.8) {
    state = 'velocity_constrained'
  } else if (roiChange !== undefined && gmvGrowth !== undefined && Math.abs(roiChange) <= 0.1 && gmvGrowth <= 0.05) {
    state = 'growth_ceiling'
  } else if (number(recent7d.roi) >= input.targetRoi && utilization >= 0.9) {
    state = 'scale_ready'
  }

  const dimensions: Array<number | undefined> = [
    gmvGrowth === undefined ? undefined : ratio((gmvGrowth + 0.2) / 0.4),
    number(recent7d.roi) > 0 ? ratio(number(recent7d.roi) / Math.max(input.targetRoi, input.profitFloor, 0.01)) : undefined,
    velocity === undefined ? undefined : ratio(velocity),
    input.metrics.cvr ? ratio(number(input.metrics.cvr) / 0.05) : undefined,
    input.metrics.winningCreativeCount >= 0 ? ratio(input.metrics.winningCreativeCount / 3) : undefined,
    utilization === undefined ? undefined : ratio(utilization),
  ]
  const weights = [0.3, 0.25, 0.2, 0.1, 0.1, 0.05]
  const presentWeight = dimensions.reduce<number>((sum, value, index) => sum + (value === undefined ? 0 : (weights[index] ?? 0)), 0)
  const healthScore = presentWeight >= 0.8 ? dimensions.reduce<number>((sum, value, index) => sum + (value === undefined ? 0 : value * (weights[index] ?? 0)), 0) / presentWeight * 100 : undefined
  const recommendedActions: Record<GmvMaxMatureAssessment['state'], string> = {
    dormant_recovery: 'verify_recovery_readiness', diagnosis_required: 'complete_product_controls', velocity_constrained: 'review_single_budget_increase', scale_ready: 'prepare_controlled_scaling', quality_decay: 'review_traffic_quality', competitive_decay: 'refresh_offer_or_creative', growth_ceiling: 'prepare_second_generation_creatives', healthy_hold: 'keep_current_settings',
  }
  const now = Date.now()
  return {
    id: id(input.instance.id, input.localDate, 'mature_assessment'), sopInstanceId: input.instance.id, campaignId: input.instance.campaignId, productId: input.instance.productId,
    statDate: input.localDate, state, lastReportDate, lastDeliveryDate, dataFreshness: !lastReportDate ? 'missing' : stale ? 'stale' : 'fresh', reasons, baseline30d, recent7d, previous7d,
    healthScore: healthScore === undefined ? undefined : decimal(healthScore), healthCoverage: decimal(presentWeight), dataCoverage: decimal(dataCoverage),
    budgetUtilization: utilization === undefined ? undefined : decimal(utilization), velocityIndex: velocity === undefined ? undefined : decimal(velocity),
    recommendedAction: recommendedActions[state], writeActionsAllowed: dataCoverage >= 0.8 && utilization !== undefined && velocity !== undefined && state !== 'dormant_recovery',
    dataSources: { performance: 'api', productBudget: preferred?.productBudget === undefined ? 'missing' : preferred.source, targetRoi: preferred?.targetRoi === undefined ? 'missing' : preferred.source, intradaySpend: preferred?.intradaySpend === undefined ? 'missing' : preferred.source },
    createdAt: now, updatedAt: now,
  }
}

export function evaluateGmvMaxSopInstance(input: {
  instance: GmvMaxSopInstance
  localDate: string
  policy: GmvMaxPolicy
  profitGuard: GmvMaxProfitGuard
  metrics: GmvMaxSopMetricSummary
  creativeCount: number
  trackDetection?: ReturnType<typeof detectGmvMaxSopTrack>
  matureAssessment?: GmvMaxMatureAssessment
}) {
  if (input.instance.status === 'paused' || input.instance.status === 'completed') return input.instance
  const detected = input.trackDetection
  const track = input.instance.trackSource === 'manual' && input.instance.track ? input.instance.track : detected?.track || input.instance.track || (input.instance.campaignType === 'LIVE' ? 'live' : 'new_product')
  if (track === 'mature_product' && input.matureAssessment) {
    const phaseByState: Record<GmvMaxMatureAssessment['state'], GmvMaxSopPhase> = {
      dormant_recovery: 'recovery_diagnosis', diagnosis_required: 'recovery_diagnosis', velocity_constrained: 'single_variable_repair', quality_decay: 'single_variable_repair', competitive_decay: 'single_variable_repair', scale_ready: 'controlled_scaling', growth_ceiling: 'second_generation_creatives', healthy_hold: 'stable_operations',
    }
    return {
      ...input.instance,
      track,
      trackSource: input.instance.trackSource || 'auto' as const,
      trackEvidence: detected?.evidence || input.instance.trackEvidence,
      matureState: input.matureAssessment.state,
      lastDeliveryDate: input.matureAssessment.lastDeliveryDate,
      dataFreshness: input.matureAssessment.dataFreshness,
      phase: phaseByState[input.matureAssessment.state],
      status: input.matureAssessment.reasons.length ? 'blocked' as const : 'active' as const,
      currentDay: detected?.evidence.productAgeDays || input.instance.currentDay,
      blockers: input.matureAssessment.reasons,
      updatedAt: Date.now(),
    }
  }
  const calendarDay = Math.max(0, Math.floor((dateValue(input.localDate) - dateValue(input.instance.startDate)) / DAY_MS) + 1)
  const currentDay = input.instance.campaignType === 'PRODUCT'
    ? Math.max(calendarDay, input.metrics.completeDays)
    : calendarDay
  const blockers: string[] = []
  const floor = Math.max(number(input.policy.minRoi), number(input.profitGuard.effectiveRoiFloor))
  const targetRoi = Math.max(floor, number(input.policy.minRoi))

  if (!input.profitGuard.complete) blockers.push('profit_model_incomplete')
  if (targetRoi <= 0) blockers.push('target_roi_missing')
  if (input.creativeCount < input.policy.minExplorationCreatives) blockers.push('creative_supply_below_target')

  let candidate: GmvMaxSopPhase = currentDay <= 0 ? 'preparation' : 'cold_start'
  if (!blockers.length && currentDay >= 8) {
    if (input.metrics.completeDays < input.policy.minCompleteDays) blockers.push('complete_days_below_target')
    if (number(input.metrics.orders) < input.policy.minOrders) blockers.push('orders_below_target')
    if (number(input.metrics.roi) < floor) blockers.push('roi_below_profit_floor')
    if (number(input.metrics.estimatedNetProfit) < 0) blockers.push('net_profit_negative')
    if (input.metrics.winningCreativeCount < 1) blockers.push('winner_missing')
    if (!blockers.length) candidate = 'scaling'
  }
  if (!blockers.length && currentDay >= 15) {
    if (input.metrics.consecutiveProfitableDays < 3) blockers.push('three_profitable_days_required')
    else candidate = 'matrix'
  }
  if (!blockers.length && currentDay >= 22) candidate = 'factory'
  if (!blockers.length && currentDay >= 31) {
    if (input.metrics.consecutiveProfitableDays < 7) blockers.push('seven_profitable_days_required')
    else candidate = 'steady'
  }

  const phase = PHASE_RANK[candidate] >= PHASE_RANK[input.instance.phase] ? candidate : input.instance.phase
  return {
    ...input.instance,
    track,
    trackSource: input.instance.trackSource || 'auto' as const,
    trackEvidence: detected?.evidence || input.instance.trackEvidence,
    phase,
    status: blockers.length ? 'blocked' as const : 'active' as const,
    currentDay,
    blockers,
    updatedAt: Date.now(),
  }
}

const DAILY_TASKS: Array<Pick<GmvMaxSopTask, 'scheduledTime' | 'kind' | 'title' | 'description' | 'executionMode'>> = [
  { scheduledTime: '09:00', kind: 'data_review', title: 'Daily data review', description: 'Review GMV, spend, ROI, orders, AOV, and Net GMV.', executionMode: 'review' },
  { scheduledTime: '10:00', kind: 'creative_review', title: 'Creative supply review', description: 'Review exploration, new creatives, winners, and delivery blockers.', executionMode: 'review' },
  { scheduledTime: '11:00', kind: 'winner_variations', title: 'Winner variation brief', description: 'Prepare 5 to 10 drafts using the 70/20/10 variation mix.', executionMode: 'internal' },
  { scheduledTime: '14:00', kind: 'ad_adjustment', title: 'Protected adjustment window', description: 'Review spend, ROI, budget use, creatives, and orders before approving changes.', executionMode: 'review' },
  { scheduledTime: '18:00', kind: 'live_review', title: 'LIVE conversion review', description: 'Review LIVE UV, product clicks, conversion, and GMV.', executionMode: 'review' },
  { scheduledTime: '23:00', kind: 'daily_close', title: 'Daily close', description: 'Record final GMV, ad cost, ROI, orders, refunds, and Net ROI.', executionMode: 'review' },
]

export function buildGmvMaxDailySopTasks(instance: GmvMaxSopInstance, localDate: string) {
  const tasks: GmvMaxSopTask[] = DAILY_TASKS.map((task) => ({
    ...task,
    id: id(instance.id, localDate, task.scheduledTime, task.kind),
    sopInstanceId: instance.id,
    campaignId: instance.campaignId,
    localDate,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }))
  const externalByDay: Record<number, { description: string; resolutionCode: string }> = {
    1: { description: 'Confirm campaign creation and Max Delivery in Seller Center.', resolutionCode: 'external_campaign_setup' },
    5: { description: 'Review Max Delivery versus Target ROI mode in Seller Center.', resolutionCode: 'external_delivery_mode' },
    8: { description: 'Review Auto Budget eligibility in Seller Center.', resolutionCode: 'external_auto_budget' },
    22: { description: 'Prepare Promotion Days settings in Seller Center when applicable.', resolutionCode: 'external_promotion_schedule' },
  }
  const external = instance.track === 'mature_product' ? undefined : externalByDay[instance.currentDay]
  if (external) {
    tasks.push({
      id: id(instance.id, localDate, 'external_operation'),
      sopInstanceId: instance.id,
      campaignId: instance.campaignId,
      localDate,
      scheduledTime: '14:00',
      kind: 'external_operation',
      title: 'Seller Center operation',
      description: external.description,
      resolutionCode: external.resolutionCode,
      executionMode: 'manual_external',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }
  return tasks
}
