import { gmvMaxDecimal } from './optimizer'
import type { GmvMaxRealtimeSample, GmvMaxRealtimeWindowSummary } from './types'

export type GmvMaxSixHourWindow = {
  index: 0 | 1 | 2 | 3
  key: string
  startHour: number
  endHour: number
}

export type GmvMaxRealtimeTotals = {
  cost: string
  grossRevenue: string
  orders: string
}

export function getGmvMaxSixHourWindow(localDate: string, hour: number): GmvMaxSixHourWindow {
  const normalizedHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.trunc(hour))) : 0
  const index = Math.min(3, Math.floor(normalizedHour / 6)) as 0 | 1 | 2 | 3
  const startHour = index * 6
  return {
    index,
    key: `${localDate}:window-${index + 1}`,
    startHour,
    endHour: startHour + 6,
  }
}

function subtract(current: string, previous: string) {
  const currentValue = gmvMaxDecimal.parse(current)
  const previousValue = gmvMaxDecimal.parse(previous)
  return {
    value: gmvMaxDecimal.format(currentValue >= previousValue ? currentValue - previousValue : currentValue, 4),
    resetDetected: currentValue < previousValue,
  }
}

export function buildGmvMaxRealtimeDeltas(current: GmvMaxRealtimeTotals, previous?: GmvMaxRealtimeTotals) {
  const baseline = previous || { cost: '0', grossRevenue: '0', orders: '0' }
  const cost = subtract(current.cost, baseline.cost)
  const grossRevenue = subtract(current.grossRevenue, baseline.grossRevenue)
  const orders = subtract(current.orders, baseline.orders)
  return {
    deltaCost: cost.value,
    deltaGrossRevenue: grossRevenue.value,
    deltaOrders: orders.value,
    resetDetected: cost.resetDetected || grossRevenue.resetDetected || orders.resetDetected,
  }
}

export function buildGmvMaxRealtimeWindowSummary(samples: GmvMaxRealtimeSample[]): Omit<GmvMaxRealtimeWindowSummary, 'id' | 'createdAt'> | null {
  const eligible = samples.filter((sample) => sample.localDate && sample.windowKey && sample.windowIndex !== undefined)
  if (!eligible.length) return null
  const ordered = [...eligible].sort((left, right) => (left.sampledAt || left.syncedAt) - (right.sampledAt || right.syncedAt))
  const sum = (key: 'deltaCost' | 'deltaGrossRevenue' | 'deltaOrders') => ordered
    .reduce((total, sample) => total + gmvMaxDecimal.parse(sample[key] || '0'), 0n)
  const first = ordered[0]
  const last = ordered.at(-1) || first
  return {
    campaignId: first.campaignId,
    localDate: first.localDate!,
    windowKey: first.windowKey!,
    windowIndex: first.windowIndex!,
    sampleCount: ordered.length,
    firstSampleAt: first.sampledAt || first.syncedAt,
    lastSampleAt: last.sampledAt || last.syncedAt,
    deltaCost: gmvMaxDecimal.format(sum('deltaCost'), 4),
    deltaGrossRevenue: gmvMaxDecimal.format(sum('deltaGrossRevenue'), 4),
    deltaOrders: gmvMaxDecimal.format(sum('deltaOrders'), 4),
    dataFreshness: ordered.some((sample) => sample.dataFreshness === 'invalid') ? 'invalid' : 'complete',
  }
}
