import { createHash } from 'node:crypto'
import type {
  GmvMaxDailyMetric,
  GmvMaxOptimizationInput,
  GmvMaxPolicy,
  GmvMaxRecommendation,
  GmvMaxPolicyPreset,
} from './types'

const SCALE = 10_000n

function decimal(value: unknown): bigint {
  const text = String(value ?? '0').trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return 0n
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole, fraction = ''] = unsigned.split('.')
  const scaled = BigInt(whole || '0') * SCALE + BigInt((fraction + '0000').slice(0, 4))
  return negative ? -scaled : scaled
}

function format(value: bigint, digits = 2) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const whole = absolute / SCALE
  const fraction = String(absolute % SCALE).padStart(4, '0').slice(0, digits).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

function multiplyPercent(value: bigint, percent: number) {
  return (value * BigInt(Math.round(percent * 100))) / 10_000n
}

function average(items: bigint[]) {
  return items.length ? items.reduce((sum, item) => sum + item, 0n) / BigInt(items.length) : 0n
}

function statDate(value: string) {
  return String(value || '').slice(0, 10)
}

function presetLimits(preset: GmvMaxPolicyPreset) {
  if (preset === 'balanced_growth') return { increase: 15, decrease: 15, roasStep: decimal('0.1') }
  if (preset === 'gmv_growth') return { increase: 20, decrease: 10, roasStep: decimal('0.2') }
  return { increase: 10, decrease: 10, roasStep: 0n }
}

export function defaultGmvMaxPolicy(campaignId: string): GmvMaxPolicy {
  return {
    campaignId,
    preset: 'roi_guard',
    automationEnabled: false,
    minRoi: '1',
    minOrders: 10,
    minCompleteDays: 3,
    cooldownHours: 24,
    dailyBudgetChangeLimitPercent: 30,
    promotionAutoExecutionEnabled: false,
    targetCpa: '0',
    creativeTestBudget: '0',
    creativeExplorationSharePercent: 15,
    minExplorationCreatives: 3,
    winnerTrafficCapPercent: 70,
    profitSafetyMarginPercent: 15,
    budgetPermission: false,
    roiPermission: false,
    statusPermission: false,
    creativePermission: false,
    sessionPermission: false,
    shadowMode: true,
    shadowStartedAt: Date.now(),
    pilotEnabled: false,
    pauseOnZeroOrders: false,
    updatedAt: Date.now(),
  }
}

export function evaluateGmvMaxCampaign(input: GmvMaxOptimizationInput): GmvMaxRecommendation | null {
  const now = input.now ?? Date.now()
  if (input.pendingChange) return null
  if (input.lastExecutedAt && now - input.lastExecutedAt < input.policy.cooldownHours * 60 * 60 * 1000) return null

  const metrics = [...input.metrics].sort((a, b) => a.statDate.localeCompare(b.statDate))
  if (metrics.length < input.policy.minCompleteDays) return null
  if (input.expectedEndDate && statDate(metrics.at(-1)?.statDate || '') !== statDate(input.expectedEndDate)) return null
  const window = metrics.slice(-Math.max(input.policy.minCompleteDays, 3))
  const recent = window.slice(-2)
  const totalOrders = window.reduce((sum, item) => sum + decimal(item.orders), 0n)
  if (totalOrders < BigInt(input.policy.minOrders) * SCALE) return null

  const targetRoi = decimal(input.campaign.roasBid)
  const profitFloor = decimal(input.profitGuard?.effectiveRoiFloor || input.policy.minRoi)
  if (input.profitGuard && !input.profitGuard.complete) {
    const recentRoi = recent.map((item) => decimal(item.roi))
    if (recentRoi.every((roi) => roi >= multiplyPercent(targetRoi, 110))) return null
  }
  const highThreshold = multiplyPercent(targetRoi, 110)
  const lowThreshold = multiplyPercent(targetRoi > profitFloor ? targetRoi : profitFloor, 80)
  const high = input.profitGuard?.complete !== false
    && recent.every((item) => decimal(item.roi) >= highThreshold && decimal(item.roi) >= profitFloor && decimal(item.budgetUtilization) >= decimal('0.8'))
  const low = recent.every((item) => decimal(item.roi) < profitFloor || decimal(item.roi) < lowThreshold)
  if (!high && !low) return null
  if (high && input.lifecycle && !['validation', 'scaling', 'mature'].includes(input.lifecycle.stage)) return null
  if (high && input.lifecycle && input.lifecycle.winningCreativeCount < 1) return null
  if (high && input.lifecycle && input.lifecycle.creativeCount < input.policy.minExplorationCreatives) return null
  if (high
    && input.campaign.campaignType === 'PRODUCT'
    && !input.productInsights?.some((item) => item.state === 'scale_ready')) return null

  const limits = presetLimits(input.policy.preset)
  const currentBudget = decimal(input.campaign.budget)
  const kind = high ? 'scale_up' : 'scale_down'
  const calibration = input.calibrations?.find((item) => item.kind === kind)
  const multiplier = Math.max(0.5, Math.min(1.2, calibration?.budgetStepMultiplier || 1))
  const lifecycleIncreaseLimit = input.lifecycle?.stage === 'validation' ? 5 : 20
  const baseMagnitude = high ? Math.min(limits.increase, lifecycleIncreaseLimit) : limits.decrease
  const calibratedMagnitude = Math.max(1, Math.round(baseMagnitude * multiplier))
  const budgetPercent = high
    ? Math.min(lifecycleIncreaseLimit, calibratedMagnitude)
    : -calibratedMagnitude
  const dailyRemaining = Math.max(0, input.policy.dailyBudgetChangeLimitPercent - Math.abs(input.dailyBudgetChangePercent || 0))
  const cappedPercent = Math.max(-20, Math.min(20, Math.max(-dailyRemaining, Math.min(dailyRemaining, budgetPercent))))
  if (cappedPercent === 0) return null
  const proposedBudget = currentBudget + multiplyPercent(currentBudget, cappedPercent)
  let proposedRoas = targetRoi
  if (input.policy.preset !== 'roi_guard' && input.lifecycle?.stage !== 'validation') {
    if (high) proposedRoas = targetRoi - limits.roasStep
    if (low) proposedRoas = targetRoi + limits.roasStep
  }
  const minRoi = profitFloor > decimal(input.policy.minRoi) ? profitFloor : decimal(input.policy.minRoi)
  if (proposedRoas < minRoi) proposedRoas = minRoi

  const evidence = {
    startDate: statDate(window[0].statDate),
    endDate: statDate(window[window.length - 1].statDate),
    metricIds: window.map((item) => item.id),
    consecutiveDays: 2,
    totalOrders: format(totalOrders, 0),
    averageRoi: format(average(window.map((item) => decimal(item.roi))), 4),
    averageBudgetUtilization: format(average(window.map((item) => decimal(item.budgetUtilization))), 4),
    targetRoi: format(targetRoi, 4),
    recommendedBudget: typeof input.campaign.raw?.recommendedBudget === 'string'
      ? input.campaign.raw.recommendedBudget
      : undefined,
    recommendedRoasBid: typeof input.campaign.raw?.recommendedRoasBid === 'string'
      ? input.campaign.raw.recommendedRoasBid
      : undefined,
    dataFreshness: 'complete' as const,
  }
  const idempotencyKey = createHash('sha256')
    .update([input.campaign.id, kind, evidence.endDate, format(proposedBudget), format(proposedRoas)].join(':'))
    .digest('hex')
  return {
    id: idempotencyKey.slice(0, 32),
    campaignId: input.campaign.id,
    bindingId: input.campaign.bindingId,
    kind,
    status: 'pending',
    risk: input.policy.preset === 'gmv_growth' ? 'medium' : 'low',
    preset: input.policy.preset,
    currentBudget: format(currentBudget),
    proposedBudget: format(proposedBudget),
    currentRoasBid: format(targetRoi, 4),
    proposedRoasBid: format(proposedRoas, 4),
    reason: high
      ? input.lifecycle?.stage === 'validation'
        ? 'Validation passed the profit and pacing thresholds; use a five percent learning step before full scaling.'
        : 'ROI and budget utilization exceeded the scale threshold for two complete days.'
      : 'ROI remained below the protection threshold for two complete days.',
    actionType: proposedRoas !== targetRoi ? 'roi' : 'budget',
    profitGuard: input.profitGuard,
    lifecycle: input.lifecycle,
    calibration,
    actionPayload: { budget: format(proposedBudget), roasBid: format(proposedRoas, 4) },
    reversible: true,
    rollbackPayload: { budget: format(currentBudget), roasBid: format(targetRoi, 4) },
    shadow: input.policy.shadowMode || !input.policy.pilotEnabled,
    evidence,
    autoExecutable: input.policy.automationEnabled
      && input.policy.budgetPermission
      && (proposedRoas === targetRoi || input.policy.roiPermission)
      && !input.policy.shadowMode
      && input.policy.pilotEnabled
      && (!input.campaign.promotionDaysEnabled || input.policy.promotionAutoExecutionEnabled),
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  }
}

export const gmvMaxDecimal = { parse: decimal, format }
