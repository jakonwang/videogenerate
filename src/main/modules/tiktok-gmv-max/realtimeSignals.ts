import { gmvMaxDecimal } from './optimizer'
import type { GmvMaxRealtimeSample, GmvMaxRealtimeSignal, GmvMaxRealtimeWindowSummary } from './types'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const STALE_AFTER_MS = 90 * 60 * 1000

function ratio(value: bigint, baseline: bigint) {
  return baseline > 0n ? (value * 10_000n) / baseline : 0n
}

function average(values: bigint[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0n) / BigInt(values.length) : 0n
}

function sum(samples: GmvMaxRealtimeSample[], key: 'deltaCost' | 'deltaGrossRevenue' | 'deltaOrders') {
  return samples.reduce((total, sample) => total + gmvMaxDecimal.parse(sample[key] || '0'), 0n)
}

export function evaluateGmvMaxRealtimeSignal(input: {
  campaignId: string
  localDate: string
  windowKey: string
  windowIndex: 0 | 1 | 2 | 3
  windowStartAt: number
  now: number
  samples: GmvMaxRealtimeSample[]
  historicalSummaries: GmvMaxRealtimeWindowSummary[]
}): GmvMaxRealtimeSignal {
  const currentSamples = input.samples
    .filter((sample) => sample.localDate === input.localDate && sample.windowKey === input.windowKey)
    .sort((left, right) => (left.sampledAt || left.syncedAt) - (right.sampledAt || right.syncedAt))
  const historical = input.historicalSummaries.filter((summary) => summary.windowIndex === input.windowIndex && summary.localDate !== input.localDate && summary.dataFreshness === 'complete')
  const currentCost = sum(currentSamples, 'deltaCost')
  const currentRevenue = sum(currentSamples, 'deltaGrossRevenue')
  const currentOrders = sum(currentSamples, 'deltaOrders')
  const baselineCost = average(historical.map((item) => gmvMaxDecimal.parse(item.deltaCost)))
  const baselineRevenue = average(historical.map((item) => gmvMaxDecimal.parse(item.deltaGrossRevenue)))
  const baselineOrders = average(historical.map((item) => gmvMaxDecimal.parse(item.deltaOrders)))
  const currentRoi = currentCost > 0n ? (currentRevenue * 10_000n) / currentCost : 0n
  const baselineRoi = baselineCost > 0n ? (baselineRevenue * 10_000n) / baselineCost : 0n
  const elapsedRatio = BigInt(Math.max(0, Math.min(10_000, Math.round(((input.now - input.windowStartAt) / SIX_HOURS_MS) * 10_000))))
  const latestAt = currentSamples.at(-1)?.sampledAt || currentSamples.at(-1)?.syncedAt || 0
  const dataFreshness: GmvMaxRealtimeSignal['dataFreshness'] = !currentSamples.length ? 'missing' : input.now - latestAt > STALE_AFTER_MS ? 'stale' : 'fresh'
  const consecutiveSamples = currentSamples.length
  let state: GmvMaxRealtimeSignal['state'] = 'insufficient_data'
  if (dataFreshness === 'stale') state = 'stale_data'
  else if (currentSamples.length < 2 || historical.length < 1 || elapsedRatio === 0n) state = 'insufficient_data'
  else if (currentSamples.some((sample) => sample.dataFreshness === 'invalid')) state = 'single_point_anomaly'
  else {
    const spendPace = ratio(currentCost, (baselineCost * elapsedRatio) / 10_000n)
    const revenuePace = ratio(currentRevenue, (baselineRevenue * elapsedRatio) / 10_000n)
    if (spendPace < 7_000n && revenuePace < 7_000n) state = 'under_delivery'
    else if (spendPace > 13_000n && currentRoi < baselineRoi) state = 'over_delivery'
    else if (baselineRoi > 0n && currentRoi < (baselineRoi * 8_500n) / 10_000n) state = 'roi_decay'
    else if (baselineRoi > 0n && currentRoi > (baselineRoi * 11_000n) / 10_000n) state = 'recovering'
    else state = 'normal'
  }
  const confirmationRequired = ['under_delivery', 'over_delivery', 'roi_decay', 'recovering', 'single_point_anomaly'].includes(state) ? 3 : 1
  const stateConfirmed = currentSamples.length >= confirmationRequired && dataFreshness === 'fresh'
  const confirmedState = stateConfirmed ? state : state === 'insufficient_data' || state === 'stale_data' ? state : 'single_point_anomaly'
  return {
    campaignId: input.campaignId, localDate: input.localDate, windowKey: input.windowKey, windowIndex: input.windowIndex,
    elapsedRatio: gmvMaxDecimal.format(elapsedRatio, 4), currentCost: gmvMaxDecimal.format(currentCost, 4), currentGrossRevenue: gmvMaxDecimal.format(currentRevenue, 4), currentOrders: gmvMaxDecimal.format(currentOrders, 4), currentRoi: gmvMaxDecimal.format(currentRoi, 4),
    baselineCost: gmvMaxDecimal.format(baselineCost, 4), baselineGrossRevenue: gmvMaxDecimal.format(baselineRevenue, 4), baselineOrders: gmvMaxDecimal.format(baselineOrders, 4), baselineRoi: gmvMaxDecimal.format(baselineRoi, 4),
    spendPaceRatio: gmvMaxDecimal.format(ratio(currentCost, (baselineCost * elapsedRatio) / 10_000n), 4), revenuePaceRatio: gmvMaxDecimal.format(ratio(currentRevenue, (baselineRevenue * elapsedRatio) / 10_000n), 4), orderPaceRatio: gmvMaxDecimal.format(ratio(currentOrders, (baselineOrders * elapsedRatio) / 10_000n), 4),
    state, confirmedState, consecutiveSamples, confirmationRequired, stateConfirmed, dataFreshness, evaluatedAt: input.now,
  }
}
