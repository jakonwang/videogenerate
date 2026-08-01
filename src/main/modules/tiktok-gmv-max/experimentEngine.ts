import { createHash } from 'node:crypto'
import { resolveGmvMaxDecisionRules } from './decisionEngine'
import type { GmvMaxDailyMetric, GmvMaxDecisionRuleConfig, GmvMaxExperiment } from './types'

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function decimal(value: number, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '') : '0'
}

function aggregate(metrics: GmvMaxDailyMetric[]) {
  const spend = metrics.reduce((sum, item) => sum + number(item.cost), 0)
  const gmv = metrics.reduce((sum, item) => sum + number(item.grossRevenue), 0)
  const days = metrics.length
  return {
    spend: days ? spend / days : 0,
    gmv: days ? gmv / days : 0,
    roi: spend > 0 ? gmv / spend : 0,
  }
}

function changePercent(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export function buildGmvMaxRoiUnlockExperiment(input: {
  sopInstanceId: string
  campaignId: string
  productId?: string
  currentTargetRoi: number
  profitFloor: number
  baselineTargetRoi?: number
  existingCumulativeReductionPercent?: number
  actionDate?: string
  ruleOverride?: Partial<GmvMaxDecisionRuleConfig>
  now?: number
}): GmvMaxExperiment | null {
  const rules = resolveGmvMaxDecisionRules(input.ruleOverride)
  const step = Math.max(rules.roiExperiment.minimumStepPercent, Math.min(rules.roiExperiment.maximumStepPercent, rules.roiExperiment.stepReductionPercent))
  const currentReduction = Math.max(0, input.existingCumulativeReductionPercent || 0)
  const remainingReduction = Math.max(0, rules.roiExperiment.maximumTotalReductionPercent - currentReduction)
  const appliedStep = Math.min(step, remainingReduction)
  if (appliedStep < rules.roiExperiment.minimumStepPercent || input.currentTargetRoi <= input.profitFloor) return null
  const proposed = Math.max(input.profitFloor, input.currentTargetRoi * (1 - appliedStep / 100))
  if (proposed >= input.currentTargetRoi) return null
  const now = input.now ?? Date.now()
  const id = createHash('sha256').update([input.sopInstanceId, input.campaignId, decimal(input.currentTargetRoi), decimal(proposed), rules.version].join(':')).digest('hex').slice(0, 32)
  return {
    id,
    sopInstanceId: input.sopInstanceId,
    campaignId: input.campaignId,
    productId: input.productId,
    state: 'pending_approval',
    ruleVersion: rules.version,
    baselineTargetRoi: decimal(input.baselineTargetRoi || input.currentTargetRoi),
    currentTargetRoi: decimal(input.currentTargetRoi),
    proposedTargetRoi: decimal(proposed),
    cumulativeReductionPercent: decimal(currentReduction + appliedStep, 2),
    observationDeliveryDays: rules.roiExperiment.observationDeliveryDays,
    neutralExtensionDays: 0,
    actionDate: input.actionDate,
    resultReasonCodes: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function evaluateGmvMaxRoiUnlockExperiment(input: {
  experiment: GmvMaxExperiment
  metrics: GmvMaxDailyMetric[]
  actionDate: string
  profitFloor: number
  ruleOverride?: Partial<GmvMaxDecisionRuleConfig>
  now?: number
}): GmvMaxExperiment {
  const rules = resolveGmvMaxDecisionRules(input.ruleOverride)
  const complete = [...input.metrics].sort((left, right) => left.statDate.localeCompare(right.statDate))
  const beforeRows = complete.filter((item) => item.statDate < input.actionDate).slice(-rules.roiExperiment.observationDeliveryDays)
  const requiredAfterDays = rules.roiExperiment.observationDeliveryDays + input.experiment.neutralExtensionDays
  const afterRows = complete.filter((item) => item.statDate > input.actionDate).slice(0, requiredAfterDays)
  if (beforeRows.length < rules.roiExperiment.observationDeliveryDays || afterRows.length < requiredAfterDays) return input.experiment
  const before = aggregate(beforeRows)
  const after = aggregate(afterRows)
  const spendGrowth = changePercent(after.spend, before.spend)
  const gmvGrowth = changePercent(after.gmv, before.gmv)
  const incrementalSpend = after.spend - before.spend
  const marginalRoi = incrementalSpend > 0 ? (after.gmv - before.gmv) / incrementalSpend : undefined
  const failed = after.roi < input.profitFloor
    || (incrementalSpend > 0 && marginalRoi !== undefined && marginalRoi < input.profitFloor)
    || (spendGrowth >= 10 && gmvGrowth < 5)
  const successful = !failed && spendGrowth >= 10 && gmvGrowth >= 10 && marginalRoi !== undefined && marginalRoi >= input.profitFloor
  const resultReasonCodes = successful
    ? ['incremental_spend_healthy', 'incremental_gmv_healthy', 'marginal_roi_profitable']
    : failed
      ? [after.roi < input.profitFloor ? 'post_roi_below_profit_floor' : '', marginalRoi !== undefined && marginalRoi < input.profitFloor ? 'marginal_roi_below_profit_floor' : '', spendGrowth >= 10 && gmvGrowth < 5 ? 'spend_increased_without_gmv' : ''].filter(Boolean)
      : ['insufficient_incremental_change']
  const canExtend = !successful && !failed && input.experiment.neutralExtensionDays < rules.roiExperiment.maximumNeutralExtensionDays
  const now = input.now ?? Date.now()
  return {
    ...input.experiment,
    state: successful ? 'success' : failed ? 'rollback_pending' : 'neutral',
    neutralExtensionDays: canExtend ? input.experiment.neutralExtensionDays + 1 : input.experiment.neutralExtensionDays,
    preStartDate: beforeRows[0].statDate,
    preEndDate: beforeRows.at(-1)?.statDate,
    postStartDate: afterRows[0].statDate,
    postEndDate: afterRows.at(-1)?.statDate,
    preSpend: decimal(before.spend, 2),
    postSpend: decimal(after.spend, 2),
    preGmv: decimal(before.gmv, 2),
    postGmv: decimal(after.gmv, 2),
    preRoi: decimal(before.roi),
    postRoi: decimal(after.roi),
    marginalRoi: marginalRoi === undefined ? undefined : decimal(marginalRoi),
    resultReasonCodes,
    updatedAt: now,
    completedAt: successful || failed || !canExtend ? now : undefined,
  }
}
