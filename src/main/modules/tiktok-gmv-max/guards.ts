import { createHash } from 'node:crypto'
import { getGmvMaxShadowReadiness, gmvMaxDecimal } from './optimizer'
import type {
  GmvMaxCampaign,
  GmvMaxCreativeAsset,
  GmvMaxCreativeExperiment,
  GmvMaxCreativeInsight,
  GmvMaxCreativeMetric,
  GmvMaxLearningSnapshot,
  GmvMaxListEntry,
  GmvMaxPolicy,
  GmvMaxPacingDiagnostic,
  GmvMaxProfitGuard,
  GmvMaxRealtimeSample,
  GmvMaxRecommendation,
  GmvMaxSessionSnapshot,
} from './types'
import { buildGmvMaxSessionWindow } from './sessionContract'

function idempotency(parts: unknown[]) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join(':')).digest('hex')
}

function percent(value: bigint, amount: number) {
  return (value * BigInt(Math.round(amount * 100))) / 10_000n
}

function normalizedStatDate(value: string) {
  return String(value || '').slice(0, 10)
}

const PACING_CURVE = [
  { minute: 0, ratio: 0 },
  { minute: 360, ratio: 400 },
  { minute: 540, ratio: 1200 },
  { minute: 720, ratio: 2800 },
  { minute: 900, ratio: 4800 },
  { minute: 1080, ratio: 7000 },
  { minute: 1260, ratio: 9000 },
  { minute: 1440, ratio: 10000 },
] as const

function expectedPacingRatio(localMinute: number) {
  const minute = Math.max(0, Math.min(1440, Math.round(localMinute)))
  const upperIndex = PACING_CURVE.findIndex((point) => point.minute >= minute)
  if (upperIndex <= 0) return BigInt(PACING_CURVE[0].ratio)
  const lower = PACING_CURVE[upperIndex - 1]
  const upper = PACING_CURVE[upperIndex]
  const elapsed = minute - lower.minute
  const duration = upper.minute - lower.minute
  return BigInt(lower.ratio + Math.round(((upper.ratio - lower.ratio) * elapsed) / duration))
}

export function evaluateGmvMaxPacingDiagnostic(input: {
  campaign: GmvMaxCampaign
  samples: GmvMaxRealtimeSample[]
  timezone?: string
  localDate: string
  localHour: number
  localMinute: number
  now?: number
}): GmvMaxPacingDiagnostic {
  const now = input.now ?? Date.now()
  const daySamples = [...input.samples]
    .filter((item) => normalizedStatDate(item.statDate) === input.localDate)
    .sort((left, right) => left.syncedAt - right.syncedAt)
  const latest = daySamples.at(-1)
  const comparable = latest
    ? [...daySamples.slice(0, -1)].reverse().find((item) => latest.syncedAt - item.syncedAt >= 5 * 60 * 1000)
    : undefined
  const samples = comparable && latest ? [comparable, latest] : daySamples.slice(-2)
  const current = samples.at(-1)
  const budget = gmvMaxDecimal.parse(input.campaign.budget)
  const cost = gmvMaxDecimal.parse(current?.cost || '0')
  const orders = gmvMaxDecimal.parse(current?.orders || '0')
  const revenue = gmvMaxDecimal.parse(current?.grossRevenue || '0')
  const expectedRatio = expectedPacingRatio((input.localHour * 60) + input.localMinute)
  const actualRatio = budget > 0n ? (cost * 10_000n) / budget : 0n
  const paceRatio = expectedRatio > 0n ? (actualRatio * 10_000n) / expectedRatio : 0n
  const currentRoi = cost > 0n ? (revenue * 10_000n) / cost : 0n
  let dataStable = false
  let state: GmvMaxPacingDiagnostic['state'] = 'unstable'
  let reason: GmvMaxPacingDiagnostic['reason'] = 'insufficient_samples'

  if (samples.length >= 2) {
    const [previous, latest] = samples
    const interval = latest.syncedAt - previous.syncedAt
    if (normalizedStatDate(previous.statDate) !== normalizedStatDate(latest.statDate)
      || normalizedStatDate(latest.statDate) !== input.localDate) {
      reason = 'sample_date_mismatch'
    } else if (gmvMaxDecimal.parse(latest.cost) < gmvMaxDecimal.parse(previous.cost)
      || gmvMaxDecimal.parse(latest.orders) < gmvMaxDecimal.parse(previous.orders)
      || gmvMaxDecimal.parse(latest.grossRevenue) < gmvMaxDecimal.parse(previous.grossRevenue)) {
      reason = 'metrics_regressed'
    } else if (interval < 5 * 60 * 1000 || interval > 3 * 60 * 60 * 1000) {
      reason = 'sample_interval_invalid'
    } else {
      dataStable = true
      if (actualRatio >= expectedRatio + 1000n && paceRatio >= 13_500n) {
        state = 'overspend'
        reason = 'ahead_of_curve'
      } else if (expectedRatio >= 1500n && actualRatio + 1200n < expectedRatio && paceRatio <= 6500n) {
        state = 'underspend'
        reason = 'behind_curve'
      } else {
        state = 'normal'
        reason = 'within_curve'
      }
    }
  }

  return {
    campaignId: input.campaign.id,
    timezone: input.timezone || 'UTC',
    localDate: input.localDate,
    localTime: `${String(input.localHour).padStart(2, '0')}:${String(input.localMinute).padStart(2, '0')}`,
    expectedSpendRatio: gmvMaxDecimal.format(expectedRatio, 4),
    actualSpendRatio: gmvMaxDecimal.format(actualRatio, 4),
    paceRatio: gmvMaxDecimal.format(paceRatio, 4),
    currentCost: gmvMaxDecimal.format(cost),
    currentOrders: gmvMaxDecimal.format(orders, 0),
    currentGrossRevenue: gmvMaxDecimal.format(revenue),
    currentRoi: gmvMaxDecimal.format(currentRoi, 4),
    state,
    dataStable,
    reason,
    evaluatedAt: now,
  }
}

export function evaluateGmvMaxRealtimeGuard(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  samples: GmvMaxRealtimeSample[]
  pacing?: GmvMaxPacingDiagnostic
  profitGuard?: GmvMaxProfitGuard
  now?: number
}): GmvMaxRecommendation | null {
  const samples = [...input.samples].sort((a, b) => a.syncedAt - b.syncedAt).slice(-2)
  if (samples.length < 2) return null
  const [previous, current] = samples
  const previousCost = gmvMaxDecimal.parse(previous.cost)
  const currentCost = gmvMaxDecimal.parse(current.cost)
  if (normalizedStatDate(current.statDate) !== normalizedStatDate(previous.statDate) || currentCost < previousCost) return null
  const currentOrders = gmvMaxDecimal.parse(current.orders)
  const targetCpa = gmvMaxDecimal.parse(input.policy.targetCpa)
  const zeroOrderCpaRisk = currentOrders === 0n && targetCpa > 0n && currentCost >= percent(targetCpa, 150)
  const profitFloor = input.profitGuard?.complete ? gmvMaxDecimal.parse(input.profitGuard.effectiveRoiFloor) : 0n
  const currentRevenue = gmvMaxDecimal.parse(current.grossRevenue)
  const currentRoi = currentCost > 0n ? (currentRevenue * 10_000n) / currentCost : 0n
  const pacingRisk = input.pacing?.dataStable === true
    && input.pacing.state === 'overspend'
    && (currentOrders === 0n || (profitFloor > 0n && currentRoi < profitFloor))
  if (!zeroOrderCpaRisk && !pacingRisk) return null

  const pause = currentOrders === 0n
    && targetCpa > 0n
    && currentCost >= percent(targetCpa, 300)
    && input.policy.pauseOnZeroOrders
    && input.policy.statusPermission
    && input.policy.pilotEnabled
  const actionType = pause ? 'status' : 'budget'
  const currentBudget = gmvMaxDecimal.parse(input.campaign.budget)
  const proposedBudget = pause ? currentBudget : currentBudget - percent(currentBudget, 10)
  const key = idempotency([input.campaign.id, actionType, current.statDate, current.cost])
  const now = input.now ?? Date.now()
  return {
    id: key.slice(0, 32),
    campaignId: input.campaign.id,
    bindingId: input.campaign.bindingId,
    kind: 'scale_down',
    actionType,
    status: 'pending',
    risk: pause ? 'high' : 'medium',
    preset: input.policy.preset,
    currentBudget: input.campaign.budget,
    proposedBudget: gmvMaxDecimal.format(proposedBudget),
    currentRoasBid: input.campaign.roasBid,
    proposedRoasBid: input.campaign.roasBid,
    reason: pause
      ? 'Spend reached three target CPA units with zero orders.'
      : pacingRisk
        ? 'Intraday spend is materially ahead of the account-timezone pacing curve while efficiency is below the protected threshold.'
        : 'Spend reached 1.5 target CPA units with zero orders.',
    evidence: {
      startDate: current.statDate,
      endDate: current.statDate,
      metricIds: [],
      consecutiveDays: 0,
      totalOrders: current.orders,
      averageRoi: gmvMaxDecimal.format(currentRoi, 4),
      averageBudgetUtilization: input.pacing?.actualSpendRatio || '0',
      targetRoi: input.profitGuard?.effectiveRoiFloor || input.campaign.roasBid,
      dataFreshness: 'preliminary',
    },
    actionPayload: pause ? { operationStatus: 'DISABLE' } : { budget: gmvMaxDecimal.format(proposedBudget) },
    rollbackPayload: pause ? { operationStatus: input.campaign.operationStatus } : { budget: input.campaign.budget },
    reversible: true,
    shadow: input.policy.shadowMode || !input.policy.pilotEnabled,
    autoExecutable: input.policy.automationEnabled
      && input.policy.pilotEnabled
      && !input.policy.shadowMode
      && (pause ? input.policy.statusPermission : input.policy.budgetPermission),
    idempotencyKey: key,
    createdAt: now,
    updatedAt: now,
  }
}

export function evaluateGmvMaxCreativeGuard(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  profitGuard: GmvMaxProfitGuard
  metrics: GmvMaxCreativeMetric[]
  listEntries: GmvMaxListEntry[]
  now?: number
}): GmvMaxRecommendation[] {
  const grouped = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of input.metrics) {
    const key = `${metric.creativeId}:${metric.itemGroupId || 'unscoped'}`
    grouped.set(key, [...(grouped.get(key) || []), metric])
  }
  const testBudget = gmvMaxDecimal.parse(input.policy.creativeTestBudget)
  const floor = gmvMaxDecimal.parse(input.profitGuard.effectiveRoiFloor)
  const now = input.now ?? Date.now()
  const recommendations: GmvMaxRecommendation[] = []
  for (const values of grouped.values()) {
    const creativeId = values[0].creativeId
    const itemGroupId = values[0].itemGroupId
    if (input.campaign.campaignType === 'PRODUCT' && !itemGroupId) continue
    const listMode = input.listEntries
      .filter((entry) => entry.entityType === 'creative' && entry.entityId === creativeId)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.mode
    if (listMode === 'allow') continue
    const denied = listMode === 'deny'
    const complete = [...values].sort((a, b) => a.statDate.localeCompare(b.statDate)).slice(-2)
    if (!complete.length || (!denied && complete.length < 2)) continue
    if (denied && complete.every((item) => String(item.status || '').toUpperCase() === 'EXCLUDED')) continue
    const cost = complete.reduce((sum, item) => sum + gmvMaxDecimal.parse(item.cost), 0n)
    const orders = complete.reduce((sum, item) => sum + gmvMaxDecimal.parse(item.orders), 0n)
    const revenue = complete.reduce((sum, item) => sum + gmvMaxDecimal.parse(item.grossRevenue), 0n)
    const roi = cost > 0n ? (revenue * 10_000n) / cost : 0n
    const exhaustedWithoutOrders = orders === 0n && testBudget > 0n && cost >= testBudget
    const lowProfitRoi = input.profitGuard.complete && cost > 0n && orders >= 30_000n && roi < percent(floor, 70)
    const shouldRemove = denied || exhaustedWithoutOrders || lowProfitRoi
    if (!shouldRemove) continue
    const key = idempotency([input.campaign.id, 'creative', creativeId, itemGroupId || 'unscoped', complete.at(-1)!.statDate, 'REMOVE'])
    recommendations.push({
      id: key.slice(0, 32), campaignId: input.campaign.id, bindingId: input.campaign.bindingId,
      kind: 'scale_down', actionType: 'creative', status: 'pending', risk: 'medium', preset: input.policy.preset,
      currentBudget: input.campaign.budget, proposedBudget: input.campaign.budget,
      currentRoasBid: input.campaign.roasBid, proposedRoasBid: input.campaign.roasBid,
      reason: denied ? 'Creative is on the campaign exclusion list.' : orders === 0n ? 'Creative exhausted its test budget with zero orders for two complete days.' : 'Creative ROI remained below 70 percent of the profit floor after at least three orders.',
      evidence: { startDate: complete[0].statDate, endDate: complete.at(-1)!.statDate, metricIds: complete.map((item) => item.id), consecutiveDays: complete.length, totalOrders: gmvMaxDecimal.format(orders, 0), averageRoi: gmvMaxDecimal.format(roi, 4), averageBudgetUtilization: '0', targetRoi: input.profitGuard.effectiveRoiFloor, dataFreshness: 'complete' },
      profitGuard: input.profitGuard,
      actionPayload: { creativeId, operation: 'REMOVE', ...(itemGroupId ? { spuIds: [itemGroupId] } : {}) },
      rollbackPayload: { creativeId, operation: 'ADD', ...(itemGroupId ? { spuIds: [itemGroupId] } : {}) },
      reversible: true,
      shadow: input.policy.shadowMode || !input.policy.pilotEnabled,
      autoExecutable: input.policy.automationEnabled && input.policy.pilotEnabled && !input.policy.shadowMode && input.policy.creativePermission,
      idempotencyKey: key, createdAt: now, updatedAt: now,
    })
  }
  return recommendations
}

export function evaluateGmvMaxCreativeRotationPlan(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  profitGuard: GmvMaxProfitGuard
  lifecycle: GmvMaxLearningSnapshot
  insights: GmvMaxCreativeInsight[]
  assets: GmvMaxCreativeAsset[]
  listEntries: GmvMaxListEntry[]
  now?: number
}): GmvMaxRecommendation[] {
  if (!input.profitGuard.complete || input.lifecycle.stage === 'blocked') return []
  const measuredIds = new Set(input.insights.map((item) => item.creativeId))
  const allowIds = new Set(input.listEntries.filter((item) => item.entityType === 'creative' && item.mode === 'allow').map((item) => item.entityId))
  const denyIds = new Set(input.listEntries.filter((item) => item.entityType === 'creative' && item.mode === 'deny').map((item) => item.entityId))
  const usableStatuses = new Set(['', 'ACTIVE', 'AVAILABLE', 'AUTHORIZED', 'ENABLED', 'READY'])
  const replacements = input.assets.filter((item) => item.storeId === input.campaign.storeId
    && (!item.campaignId || item.campaignId === input.campaign.id)
    && item.kind === 'video'
    && !measuredIds.has(item.creativeId)
    && !denyIds.has(item.creativeId)
    && usableStatuses.has(String(item.status || '').toUpperCase()))
    .sort((left, right) => right.syncedAt - left.syncedAt || left.creativeId.localeCompare(right.creativeId))
  if (!replacements.length) return []

  const now = input.now ?? Date.now()
  const replacement = replacements[0]
  const autoExecutable = input.policy.automationEnabled
    && input.policy.pilotEnabled
    && !input.policy.shadowMode
    && getGmvMaxShadowReadiness(input.policy, now).ready
    && input.policy.creativePermission
    && input.lifecycle.confidence >= 60
  const retiring = [...input.insights]
    .filter((item) => ['fatigued', 'waste'].includes(item.state)
      && !allowIds.has(item.creativeId)
      && (input.campaign.campaignType !== 'PRODUCT' || Boolean(item.itemGroupId)))
    .sort((a, b) => a.score - b.score)[0]

  if (retiring) {
    const key = idempotency([input.campaign.id, 'creative', retiring.creativeId, replacement.creativeId, retiring.lastActiveDate, 'ROTATE'])
    return [{
      id: key.slice(0, 32), campaignId: input.campaign.id, bindingId: input.campaign.bindingId,
      kind: 'scale_down', actionType: 'creative', status: 'pending', risk: 'medium', preset: input.policy.preset,
      currentBudget: input.campaign.budget, proposedBudget: input.campaign.budget,
      currentRoasBid: input.campaign.roasBid, proposedRoasBid: input.campaign.roasBid,
      reason: 'Add a fresh replacement before removing a fatigued or waste creative.',
      evidence: { startDate: retiring.lastActiveDate, endDate: retiring.lastActiveDate, metricIds: [], consecutiveDays: 2, totalOrders: retiring.orders, averageRoi: retiring.recentRoi, averageBudgetUtilization: input.lifecycle.budgetUtilization, targetRoi: input.profitGuard.effectiveRoiFloor, dataFreshness: 'complete' },
      profitGuard: input.profitGuard, lifecycle: input.lifecycle,
      actionPayload: { operation: 'ROTATE', addCreativeId: replacement.creativeId, removeCreativeId: retiring.creativeId, ...(retiring.itemGroupId ? { spuIds: [retiring.itemGroupId] } : {}) },
      rollbackPayload: { operation: 'ROTATE', addCreativeId: retiring.creativeId, removeCreativeId: replacement.creativeId, ...(retiring.itemGroupId ? { spuIds: [retiring.itemGroupId] } : {}) },
      reversible: true, shadow: input.policy.shadowMode || !input.policy.pilotEnabled, autoExecutable,
      idempotencyKey: key, createdAt: now, updatedAt: now,
    }]
  }

  const activeCreativeCount = input.insights.filter((item) => !['fatigued', 'waste', 'blocked'].includes(item.state)).length
  if (!['cold_start', 'exploration', 'validation'].includes(input.lifecycle.stage) || activeCreativeCount >= input.policy.minExplorationCreatives) return []
  const evidenceDate = input.insights.reduce((latest, item) => item.lastActiveDate > latest ? item.lastActiveDate : latest, '') || new Date(now).toISOString().slice(0, 10)
  const key = idempotency([input.campaign.id, 'creative', replacement.creativeId, evidenceDate, 'ADD_TEST'])
  return [{
    id: key.slice(0, 32), campaignId: input.campaign.id, bindingId: input.campaign.bindingId,
    kind: 'scale_up', actionType: 'creative', status: 'pending', risk: 'low', preset: input.policy.preset,
    currentBudget: input.campaign.budget, proposedBudget: input.campaign.budget,
    currentRoasBid: input.campaign.roasBid, proposedRoasBid: input.campaign.roasBid,
    reason: 'Supply a fresh creative to complete the exploration test pool.',
    evidence: { startDate: evidenceDate, endDate: evidenceDate, metricIds: [], consecutiveDays: 0, totalOrders: '0', averageRoi: '0', averageBudgetUtilization: input.lifecycle.budgetUtilization, targetRoi: input.profitGuard.effectiveRoiFloor, dataFreshness: 'complete' },
    profitGuard: input.profitGuard, lifecycle: input.lifecycle,
    actionPayload: { operation: 'ADD', creativeId: replacement.creativeId },
    rollbackPayload: { operation: 'REMOVE', creativeId: replacement.creativeId }, reversible: true,
    shadow: input.policy.shadowMode || !input.policy.pilotEnabled,
    autoExecutable: autoExecutable && gmvMaxDecimal.parse(input.policy.creativeTestBudget) > 0n,
    idempotencyKey: key, createdAt: now, updatedAt: now,
  }]
}

export function buildGmvMaxCreativeExperiment(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  profitGuard: GmvMaxProfitGuard
  insights: GmvMaxCreativeInsight[]
  assets: GmvMaxCreativeAsset[]
  recommendations: GmvMaxRecommendation[]
  listEntries: GmvMaxListEntry[]
  now?: number
}): GmvMaxCreativeExperiment {
  const now = input.now ?? Date.now()
  const allowIds = new Set(input.listEntries.filter((item) => item.entityType === 'creative' && item.mode === 'allow').map((item) => item.entityId))
  const denyIds = new Set(input.listEntries.filter((item) => item.entityType === 'creative' && item.mode === 'deny').map((item) => item.entityId))
  const measuredIds = new Set(input.insights.map((item) => item.creativeId))
  const usableStatuses = new Set(['', 'ACTIVE', 'AVAILABLE', 'AUTHORIZED', 'ENABLED', 'READY'])
  const candidates = input.assets.filter((item) => item.storeId === input.campaign.storeId
    && (!item.campaignId || item.campaignId === input.campaign.id)
    && item.kind === 'video'
    && !measuredIds.has(item.creativeId)
    && !denyIds.has(item.creativeId)
    && usableStatuses.has(String(item.status || '').toUpperCase()))
    .sort((left, right) => right.syncedAt - left.syncedAt || left.creativeId.localeCompare(right.creativeId))
  const active = new Set(input.insights.filter((item) => !['fatigued', 'waste', 'blocked'].includes(item.state)).map((item) => item.creativeId))
  const retiring = [...input.insights]
    .filter((item) => ['fatigued', 'waste'].includes(item.state)
      && !allowIds.has(item.creativeId)
      && (input.campaign.campaignType !== 'PRODUCT' || Boolean(item.itemGroupId)))
    .sort((left, right) => left.score - right.score || left.creativeId.localeCompare(right.creativeId))[0]
  const pendingAction = input.recommendations.find((item) => item.actionType === 'creative'
    && ['pending', 'approved', 'executing'].includes(item.status))
  const targetPoolSize = Math.max(1, input.policy.minExplorationCreatives)
  const missingCreativeCount = Math.max(0, targetPoolSize - active.size)
  const explorationBudget = percent(gmvMaxDecimal.parse(input.campaign.budget), input.policy.creativeExplorationSharePercent)
  const signals: string[] = []
  if (!input.profitGuard.complete) signals.push('profit_guard_incomplete')
  if (missingCreativeCount > 0) signals.push('exploration_pool_incomplete')
  if (missingCreativeCount > 0 && !candidates.length) signals.push('candidate_supply_missing')
  if (retiring) signals.push(retiring.state === 'fatigued' ? 'fatigued_replacement_ready' : 'waste_replacement_ready')
  if (input.insights.some((item) => item.state === 'winner')) signals.push('winner_protected')
  if (gmvMaxDecimal.parse(input.policy.creativeTestBudget) <= 0n) signals.push('test_budget_missing')
  let state: GmvMaxCreativeExperiment['state'] = 'testing'
  if (!input.profitGuard.complete) state = 'blocked'
  else if (pendingAction) state = 'rotation_pending'
  else if (missingCreativeCount > 0 && !candidates.length) state = 'supply_needed'
  else if (missingCreativeCount === 0 && input.insights.some((item) => item.state === 'winner')) state = 'ready'
  return {
    campaignId: input.campaign.id,
    state,
    measuredCreativeCount: new Set(input.insights.map((item) => item.creativeId)).size,
    activeCreativeCount: active.size,
    winnerCount: new Set(input.insights.filter((item) => item.state === 'winner').map((item) => item.creativeId)).size,
    testingCount: new Set(input.insights.filter((item) => ['new', 'testing'].includes(item.state)).map((item) => item.creativeId)).size,
    fatiguedCount: new Set(input.insights.filter((item) => item.state === 'fatigued').map((item) => item.creativeId)).size,
    wasteCount: new Set(input.insights.filter((item) => item.state === 'waste').map((item) => item.creativeId)).size,
    targetPoolSize,
    missingCreativeCount,
    availableCandidateCount: candidates.length,
    testBudget: input.policy.creativeTestBudget,
    explorationBudget: gmvMaxDecimal.format(explorationBudget),
    explorationSharePercent: input.policy.creativeExplorationSharePercent,
    winnerTrafficCapPercent: input.policy.winnerTrafficCapPercent,
    candidate: candidates[0] ? { creativeId: candidates[0].creativeId, name: candidates[0].name, status: candidates[0].status, syncedAt: candidates[0].syncedAt } : undefined,
    retiring: retiring ? { creativeId: retiring.creativeId, name: retiring.creativeName, state: retiring.state, score: retiring.score, recentRoi: retiring.recentRoi } : undefined,
    pendingActionId: pendingAction?.id,
    signals,
    evaluatedAt: now,
  }
}

export function evaluateGmvMaxSessionGuard(input: {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  profitGuard: GmvMaxProfitGuard
  metrics: GmvMaxCreativeMetric[]
  assets?: GmvMaxCreativeAsset[]
  sessions: GmvMaxSessionSnapshot[]
  now?: number
}): GmvMaxRecommendation | null {
  if (input.campaign.campaignType !== 'PRODUCT'
    || !input.profitGuard.complete
    || input.sessions.some((item) => ['ACTIVE', 'SCHEDULED', 'PENDING'].includes(item.status.toUpperCase()))) return null
  const floor = gmvMaxDecimal.parse(input.profitGuard.effectiveRoiFloor)
  const grouped = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of input.metrics) {
    if (!metric.itemId || metric.itemId === '-1' || metric.creativeId.startsWith('product-card:') || !metric.itemGroupId) continue
    const key = `${metric.creativeId}:${metric.itemGroupId}`
    grouped.set(key, [...(grouped.get(key) || []), metric])
  }
  const winner = [...grouped.values()].map((values) => {
    const recent = [...values].sort((a, b) => a.statDate.localeCompare(b.statDate)).slice(-2)
    const cost = recent.reduce((sum, item) => sum + gmvMaxDecimal.parse(item.cost), 0n)
    const revenue = recent.reduce((sum, item) => sum + gmvMaxDecimal.parse(item.grossRevenue), 0n)
    const orders = recent.reduce((sum, item) => sum + gmvMaxDecimal.parse(item.orders), 0n)
    return {
      creativeId: values[0].creativeId,
      itemId: values[0].itemId!,
      spuId: values[0].itemGroupId!,
      recent,
      roi: cost > 0n ? (revenue * 10_000n) / cost : 0n,
      orders,
    }
  }).filter((item) => item.recent.length === 2
      && item.recent[0].statDate !== item.recent[1].statDate
      && item.roi >= percent(floor, 120)
      && item.orders >= BigInt(input.policy.minOrders) * 10_000n)
    .sort((a, b) => a.roi === b.roi ? 0 : a.roi > b.roi ? -1 : 1)[0]
  if (!winner) return null
  const videoAsset = input.assets?.find((asset) => asset.kind === 'video'
    && (asset.creativeId === winner.itemId || String(asset.raw.item_id || '').trim() === winner.itemId))
  const identityInfo = videoAsset?.raw.identity_info
  if (!identityInfo || typeof identityInfo !== 'object' || Array.isArray(identityInfo)) return null
  const identity = identityInfo as Record<string, unknown>
  const identityId = String(identity.identity_id || '').trim()
  const identityType = String(identity.identity_type || '').trim()
  if (!identityId || !identityType) return null
  const identityAsset = input.assets?.find((asset) => asset.kind === 'identity'
    && String(asset.raw.identity_id || '').trim() === identityId)
  const identityAuthorizedBcId = String(identity.identity_authorized_bc_id || identityAsset?.raw.identity_authorized_bc_id || '').trim()
  const now = input.now ?? Date.now()
  let window: ReturnType<typeof buildGmvMaxSessionWindow>
  try {
    window = buildGmvMaxSessionWindow({ campaign: input.campaign, now })
  } catch {
    return null
  }
  const budget = gmvMaxDecimal.parse(input.campaign.budget)
  const sessionBudget = percent(budget, 10)
  if (sessionBudget <= 0n) return null
  const key = idempotency([input.campaign.id, 'session', winner.creativeId, winner.spuId, winner.recent[1].statDate])
  return {
    id: key.slice(0, 32), campaignId: input.campaign.id, bindingId: input.campaign.bindingId, kind: 'scale_up', actionType: 'session',
    status: 'pending', risk: 'medium', preset: input.policy.preset, currentBudget: input.campaign.budget, proposedBudget: input.campaign.budget,
    currentRoasBid: input.campaign.roasBid, proposedRoasBid: input.campaign.roasBid,
    reason: 'Creative ROI exceeded 120 percent of the profit floor and met the order threshold.',
    evidence: { startDate: winner.recent[0].statDate, endDate: winner.recent[1].statDate, metricIds: winner.recent.map((item) => item.id), consecutiveDays: 2, totalOrders: gmvMaxDecimal.format(winner.orders, 0), averageRoi: gmvMaxDecimal.format(winner.roi, 4), averageBudgetUtilization: '0', targetRoi: input.profitGuard.effectiveRoiFloor, dataFreshness: 'complete' },
    profitGuard: input.profitGuard,
    actionPayload: {
      operation: 'create',
      creativeId: winner.creativeId,
      itemId: winner.itemId,
      spuId: winner.spuId,
      itemIdentity: {
        identityId,
        identityType,
        ...(identityAuthorizedBcId ? { identityAuthorizedBcId } : {}),
      },
      budget: gmvMaxDecimal.format(sessionBudget),
      scheduleStartTime: window.startTime,
      scheduleEndTime: window.endTime,
    },
    reversible: true,
    rollbackPayload: { operation: 'delete' }, shadow: input.policy.shadowMode || !input.policy.pilotEnabled,
    autoExecutable: input.policy.automationEnabled && input.policy.pilotEnabled && !input.policy.shadowMode && input.policy.sessionPermission
      && (!input.campaign.promotionDaysEnabled || input.policy.promotionAutoExecutionEnabled),
    idempotencyKey: key, createdAt: now, updatedAt: now,
  }
}
