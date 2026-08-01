import { gmvMaxDecimal } from './optimizer'
import type {
  GmvMaxActionOutcome,
  GmvMaxCampaign,
  GmvMaxPolicy,
  GmvMaxRecommendation,
  GmvMaxRecommendationKind,
  GmvMaxStrategyCalibration,
} from './types'

const SCALE = 10_000n

type CalibrationObservation = {
  campaignId: string
  storeId: string
  preset: GmvMaxPolicy['preset']
  kind: GmvMaxRecommendationKind
  successful: boolean
  profitDeltaPercent: string
  measuredAt: number
}

function average(values: bigint[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0n) / BigInt(values.length) : 0n
}

function selectObservations(input: {
  campaign: GmvMaxCampaign
  preset: GmvMaxPolicy['preset']
  kind: GmvMaxRecommendationKind
  observations: CalibrationObservation[]
}) {
  const campaign = input.observations.filter((item) => item.campaignId === input.campaign.id && item.kind === input.kind)
  if (campaign.length >= 4) return { source: 'campaign' as const, items: campaign }
  const store = input.observations.filter((item) => item.storeId === input.campaign.storeId && item.preset === input.preset && item.kind === input.kind)
  if (store.length >= 6) return { source: 'store' as const, items: store }
  const preset = input.observations.filter((item) => item.preset === input.preset && item.kind === input.kind)
  if (preset.length >= 8) return { source: 'preset' as const, items: preset }
  return { source: 'none' as const, items: campaign }
}

function calibrate(input: {
  campaign: GmvMaxCampaign
  preset: GmvMaxPolicy['preset']
  kind: GmvMaxRecommendationKind
  observations: CalibrationObservation[]
  now: number
}): GmvMaxStrategyCalibration {
  const selected = selectObservations(input)
  const items = [...selected.items].sort((a, b) => b.measuredAt - a.measuredAt).slice(0, 20)
  const successCount = items.filter((item) => item.successful).length
  const successRate = items.length ? Math.round((successCount / items.length) * 100) : 0
  const averageProfitDelta = average(items.map((item) => gmvMaxDecimal.parse(item.profitDeltaPercent)))
  let budgetStepMultiplier = 1
  let state: GmvMaxStrategyCalibration['state'] = 'learning'
  let reason: GmvMaxStrategyCalibration['reason'] = 'insufficient_outcomes'
  if (selected.source !== 'none') {
    if (successRate >= 75 && averageProfitDelta >= 10n * SCALE) {
      budgetStepMultiplier = 1.2
      state = 'accelerating'
      reason = 'profit_feedback_positive'
    } else if (successRate >= 60 && averageProfitDelta > 0n) {
      budgetStepMultiplier = 1.1
      state = 'accelerating'
      reason = 'profit_feedback_positive'
    } else if (successRate < 35 || averageProfitDelta <= -10n * SCALE) {
      budgetStepMultiplier = 0.5
      state = 'conservative'
      reason = 'profit_feedback_negative'
    } else if (successRate < 50 || averageProfitDelta < 0n) {
      budgetStepMultiplier = 0.75
      state = 'conservative'
      reason = 'profit_feedback_negative'
    } else {
      state = 'neutral'
      reason = 'mixed_feedback'
    }
  }
  const sourceWeight = selected.source === 'campaign' ? 1 : selected.source === 'store' ? 0.85 : selected.source === 'preset' ? 0.7 : 0
  const confidence = Math.min(100, Math.round(items.length * 8 * sourceWeight))
  return {
    campaignId: input.campaign.id,
    kind: input.kind,
    source: selected.source,
    sampleCount: items.length,
    successCount,
    successRate,
    averageProfitDeltaPercent: gmvMaxDecimal.format(averageProfitDelta, 2),
    budgetStepMultiplier,
    confidence,
    state,
    reason,
    analyzedAt: input.now,
  }
}

export function buildGmvMaxStrategyCalibrations(input: {
  campaigns: GmvMaxCampaign[]
  policies: GmvMaxPolicy[]
  recommendations: GmvMaxRecommendation[]
  outcomes: GmvMaxActionOutcome[]
  now?: number
}) {
  const campaigns = new Map(input.campaigns.map((item) => [item.id, item]))
  const recommendations = new Map(input.recommendations.map((item) => [item.id, item]))
  const observations = input.outcomes.flatMap((outcome): CalibrationObservation[] => {
    if (outcome.actionType === 'creative') return []
    const campaign = campaigns.get(outcome.campaignId)
    const recommendation = recommendations.get(outcome.recommendationId)
    if (!campaign || !recommendation) return []
    return [{
      campaignId: campaign.id,
      storeId: campaign.storeId,
      preset: recommendation.preset,
      kind: outcome.kind,
      successful: outcome.successful,
      profitDeltaPercent: outcome.profitDeltaPercent,
      measuredAt: outcome.measuredAt,
    }]
  })
  const now = input.now ?? Date.now()
  return input.campaigns.flatMap((campaign) => {
    const preset = input.policies.find((item) => item.campaignId === campaign.id)?.preset || 'roi_guard'
    return (['scale_up', 'scale_down'] as const).map((kind) => calibrate({ campaign, preset, kind, observations, now }))
  })
}
