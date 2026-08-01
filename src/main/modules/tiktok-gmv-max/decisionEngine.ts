import { createHash } from 'node:crypto'
import type {
  GmvMaxDecisionRuleConfig,
  GmvMaxDecisionSnapshot,
  GmvMaxMatureAssessment,
  GmvMaxProductInsight,
  GmvMaxProfitGuard,
  GmvMaxSopInstanceView,
} from './types'

export const DEFAULT_GMV_MAX_DECISION_RULES: GmvMaxDecisionRuleConfig = {
  version: 'gmv-max-decision-v2.0.0',
  highRoiMultiplier: 1.15,
  lowBudgetUtilization: 0.7,
  scalingBudgetUtilization: 0.85,
  gmvPlateauPercent: 5,
  roiDecayPercent: 15,
  creativeConcentrationPercent: 80,
  healthWeights: {
    gmvGrowth: 20,
    roiHealth: 20,
    spendVelocity: 20,
    conversionRate: 15,
    creativeHealth: 15,
    budgetUtilization: 10,
  },
  roiExperiment: {
    stepReductionPercent: 8,
    minimumStepPercent: 5,
    maximumStepPercent: 10,
    maximumTotalReductionPercent: 20,
    observationDeliveryDays: 3,
    maximumNeutralExtensionDays: 2,
    cooldownHours: 72,
  },
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value))
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) return undefined
  return ((current - previous) / previous) * 100
}

function decimal(value: number, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '') : '0'
}

export function resolveGmvMaxDecisionRules(override?: Partial<GmvMaxDecisionRuleConfig>): GmvMaxDecisionRuleConfig {
  return {
    ...DEFAULT_GMV_MAX_DECISION_RULES,
    ...override,
    healthWeights: { ...DEFAULT_GMV_MAX_DECISION_RULES.healthWeights, ...(override?.healthWeights || {}) },
    roiExperiment: { ...DEFAULT_GMV_MAX_DECISION_RULES.roiExperiment, ...(override?.roiExperiment || {}) },
  }
}

function lifecycleFor(instance: GmvMaxSopInstanceView, product?: GmvMaxProductInsight) {
  if (instance.track === 'new_product') return 'cold_start' as const
  if (product && ['declining', 'losing'].includes(product.state)) return 'declining' as const
  if (instance.matureAssessment && ['quality_decay', 'competitive_decay', 'dormant_recovery'].includes(instance.matureAssessment.state)) return 'declining' as const
  return 'mature' as const
}

function healthScore(input: {
  assessment?: GmvMaxMatureAssessment
  actualRoi: number
  targetRoi: number
  profitFloor: number
  conversionRate?: number
  conversionBaseline?: number
  creativeConcentration?: number
  rules: GmvMaxDecisionRuleConfig
}) {
  const recent = input.assessment?.recent7d
  const previous = input.assessment?.previous7d
  const gmvGrowth = recent && previous ? percentChange(number(recent.gmv), number(previous.gmv)) : undefined
  const velocity = optionalNumber(input.assessment?.velocityIndex)
  const utilization = optionalNumber(input.assessment?.budgetUtilization)
  const weights = input.rules.healthWeights
  const dimensions = [
    { value: gmvGrowth === undefined ? undefined : clamp((gmvGrowth + 20) / 40), weight: weights.gmvGrowth },
    { value: input.actualRoi > 0 ? clamp(input.actualRoi / Math.max(input.targetRoi, input.profitFloor, 0.01)) : undefined, weight: weights.roiHealth },
    { value: velocity === undefined ? undefined : clamp(velocity), weight: weights.spendVelocity },
    { value: input.conversionRate === undefined ? undefined : clamp(input.conversionRate / Math.max(input.conversionBaseline || 0.05, 0.0001)), weight: weights.conversionRate },
    { value: input.creativeConcentration === undefined ? undefined : clamp(1 - input.creativeConcentration), weight: weights.creativeHealth },
    { value: utilization === undefined ? undefined : clamp(utilization), weight: weights.budgetUtilization },
  ]
  const presentWeight = dimensions.reduce((sum, item) => sum + (item.value === undefined ? 0 : item.weight), 0)
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0)
  const coverage = totalWeight > 0 ? presentWeight / totalWeight : 0
  const score = coverage >= 0.8
    ? dimensions.reduce((sum, item) => sum + (item.value === undefined ? 0 : item.value * item.weight), 0) / presentWeight * 100
    : undefined
  return { score, coverage, gmvGrowth }
}

export function evaluateGmvMaxDecision(input: {
  instance: GmvMaxSopInstanceView
  product?: GmvMaxProductInsight
  profitGuard: GmvMaxProfitGuard
  creativeSpend?: number[]
  ctrTrendPercent?: number
  cvrTrendPercent?: number
  clickThroughRate?: number
  clickThroughBaseline?: number
  conversionRate?: number
  conversionBaseline?: number
  campaignProductCount: number
  marginalRoi?: number
  activeExperiment?: boolean
  ruleOverride?: Partial<GmvMaxDecisionRuleConfig>
  now?: number
}): GmvMaxDecisionSnapshot {
  const rules = resolveGmvMaxDecisionRules(input.ruleOverride)
  const assessment = input.instance.matureAssessment
  const lifecycle = lifecycleFor(input.instance, input.product)
  const targetRoi = number(input.instance.targetRoi)
  const actualRoi = number(input.product?.recentRoi || assessment?.recent7d.roi || input.instance.metrics.roi)
  const profitFloor = number(input.profitGuard.effectiveRoiFloor || input.instance.profitFloor)
  const spend = number(input.product?.spend || assessment?.recent7d.spend || input.instance.metrics.spend)
  const grossRevenue = number(input.product?.grossRevenue || assessment?.recent7d.gmv || input.instance.metrics.gmv)
  const utilization = optionalNumber(assessment?.budgetUtilization)
  const velocity = optionalNumber(assessment?.velocityIndex)
  const creativeSpend = (input.creativeSpend || []).filter((value) => value > 0).sort((left, right) => right - left)
  const creativeTotal = creativeSpend.reduce((sum, value) => sum + value, 0)
  const creativeConcentration = creativeTotal > 0 ? creativeSpend.slice(0, 5).reduce((sum, value) => sum + value, 0) / creativeTotal : undefined
  const previousRoi = number(input.product?.previousRoi || assessment?.previous7d.roi)
  const roiChange = percentChange(actualRoi, previousRoi)
  const health = healthScore({ assessment, actualRoi, targetRoi, profitFloor, conversionRate: input.conversionRate, conversionBaseline: input.conversionBaseline, creativeConcentration, rules })
  const blockedReasons: string[] = []
  if (assessment?.dataFreshness !== 'fresh') blockedReasons.push('data_not_fresh')
  if (!input.profitGuard.complete) blockedReasons.push('profit_data_incomplete')
  if ((assessment ? number(assessment.dataCoverage) : 0) < 0.8) blockedReasons.push('data_coverage_below_80_percent')
  if (input.campaignProductCount !== 1) blockedReasons.push('multi_product_campaign')
  if (input.activeExperiment) blockedReasons.push('active_experiment')

  const profitRisk = input.profitGuard.complete && actualRoi > 0 && actualRoi < number(input.profitGuard.breakEvenRoi)
  const creativeFatigue = creativeConcentration !== undefined && creativeConcentration * 100 >= rules.creativeConcentrationPercent
    || (input.ctrTrendPercent !== undefined && input.cvrTrendPercent !== undefined && input.ctrTrendPercent <= -15 && input.cvrTrendPercent <= -10)
  const conversionBottleneck = input.clickThroughRate !== undefined && input.clickThroughBaseline !== undefined
    && input.conversionRate !== undefined && input.conversionBaseline !== undefined
    && input.clickThroughRate >= input.clickThroughBaseline * 0.9
    && input.conversionRate < input.conversionBaseline * 0.85
  const highSpendLowRoi = utilization !== undefined && utilization >= rules.scalingBudgetUtilization
    && ((roiChange !== undefined && roiChange <= -rules.roiDecayPercent) || actualRoi < profitFloor)
  const plateau = health.gmvGrowth !== undefined && Math.abs(health.gmvGrowth) <= rules.gmvPlateauPercent
  const highRoiLowVelocity = actualRoi >= targetRoi * rules.highRoiMultiplier
    && utilization !== undefined && utilization < rules.lowBudgetUtilization && plateau
  const trafficCeiling = plateau && actualRoi >= targetRoi
    && utilization !== undefined && utilization >= rules.lowBudgetUtilization
    && !creativeFatigue

  let status: GmvMaxDecisionSnapshot['status'] = lifecycle === 'cold_start' ? 'S1' : 'S2'
  let priority: GmvMaxDecisionSnapshot['priority'] = lifecycle === 'cold_start' ? 'P1' : 'P2'
  let recommendedAction: GmvMaxDecisionSnapshot['recommendedAction'] = lifecycle === 'cold_start' ? 'collect_data' : 'hold'
  let risk: GmvMaxDecisionSnapshot['risk'] = 'low'
  const reasonCodes: string[] = []

  if (profitRisk) {
    status = 'S4'; priority = 'P0'; recommendedAction = 'profit_protection'; risk = 'high'; reasonCodes.push('actual_roi_below_break_even')
  } else if (highSpendLowRoi) {
    status = 'S4'; priority = 'P0'; recommendedAction = 'stop_scaling'; risk = 'high'; reasonCodes.push('high_spend_low_roi')
  } else if (creativeFatigue) {
    status = 'S5'; priority = 'P1'; recommendedAction = 'creative_expansion'; risk = 'medium'; reasonCodes.push('creative_fatigue')
  } else if (conversionBottleneck) {
    status = 'S6'; priority = 'P1'; recommendedAction = 'conversion_repair'; risk = 'medium'; reasonCodes.push('conversion_bottleneck')
  } else if (highRoiLowVelocity) {
    status = 'S3'; priority = 'P0'; recommendedAction = 'roi_unlock'; risk = 'medium'; reasonCodes.push('high_roi_low_velocity', 'gmv_plateau')
  } else if (trafficCeiling) {
    status = 'S7'; priority = 'P1'; recommendedAction = 'product_expansion'; risk = 'medium'; reasonCodes.push('traffic_ceiling')
  } else if (lifecycle === 'mature' && utilization !== undefined && utilization >= rules.scalingBudgetUtilization && actualRoi >= targetRoi && (input.marginalRoi === undefined || input.marginalRoi >= profitFloor)) {
    status = 'S2'; priority = 'P2'; recommendedAction = 'auto_budget'; reasonCodes.push('scaling_candidate')
  } else if (lifecycle === 'cold_start') {
    reasonCodes.push('cold_start')
  } else {
    reasonCodes.push('stable_profitable')
  }

  const writeAllowed = blockedReasons.length === 0 && !['collect_data', 'hold', 'creative_expansion', 'conversion_repair', 'product_expansion'].includes(recommendedAction)
  const evaluatedAt = input.now ?? Date.now()
  const id = createHash('sha256').update([input.instance.id, input.instance.productId || 'campaign', rules.version, new Date(evaluatedAt).toISOString().slice(0, 10)].join(':')).digest('hex').slice(0, 32)
  return {
    id,
    sopInstanceId: input.instance.id,
    campaignId: input.instance.campaignId,
    storeId: input.instance.storeId,
    productId: input.instance.productId,
    productName: input.instance.productName,
    productImageUrl: input.instance.productImageUrl,
    lifecycle,
    status,
    priority,
    healthScore: health.score === undefined ? undefined : decimal(health.score, 2),
    healthCoverage: decimal(health.coverage, 4),
    targetRoi: decimal(targetRoi),
    actualRoi: decimal(actualRoi),
    breakEvenRoi: input.profitGuard.breakEvenRoi,
    marginalRoi: input.marginalRoi === undefined ? undefined : decimal(input.marginalRoi),
    spend: decimal(spend, 2),
    grossRevenue: decimal(grossRevenue, 2),
    budgetUtilization: utilization === undefined ? undefined : decimal(utilization, 4),
    spendVelocity: velocity === undefined ? undefined : decimal(velocity, 4),
    creativeConcentration: creativeConcentration === undefined ? undefined : decimal(creativeConcentration, 4),
    recommendedAction,
    reasonCodes,
    evidence: {
      gmvGrowthPercent: health.gmvGrowth,
      roiChangePercent: roiChange,
      ctrTrendPercent: input.ctrTrendPercent,
      cvrTrendPercent: input.cvrTrendPercent,
      campaignProductCount: input.campaignProductCount,
      profitDataComplete: input.profitGuard.complete,
      dataFreshness: assessment?.dataFreshness,
      dataCoverage: assessment?.dataCoverage,
    },
    confidence: Math.round(clamp(Math.min(health.coverage, number(assessment?.dataCoverage) || 0)) * 100),
    risk,
    ruleVersion: rules.version,
    writeAllowed,
    blockedReasons,
    evaluatedAt,
  }
}
