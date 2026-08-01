import type { GmvMaxActionType } from './types'

export type GmvMaxRemoteCampaignState = {
  budget?: string
  roasBid?: string
  operationStatus?: string
}

function findField(value: unknown, keys: Set<string>, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findField(item, keys, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof value !== 'object') return undefined
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key.toLowerCase())) return item
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    const found = findField(item, keys, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function decimal(value: unknown) {
  const source = String(value ?? '').trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(source)) return undefined
  const negative = source.startsWith('-')
  const unsigned = negative ? source.slice(1) : source
  const [whole, fraction = ''] = unsigned.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0'
  const normalizedFraction = fraction.replace(/0+$/, '')
  const normalized = `${negative && (normalizedWhole !== '0' || normalizedFraction) ? '-' : ''}${normalizedWhole}`
  return normalizedFraction ? `${normalized}.${normalizedFraction}` : normalized
}

export function parseGmvMaxRemoteCampaignState(value: unknown): GmvMaxRemoteCampaignState {
  const explicitStatus = findField(value, new Set(['operation_status', 'campaign_status']))
  return {
    budget: decimal(findField(value, new Set(['budget', 'daily_budget']))),
    roasBid: decimal(findField(value, new Set(['roas_bid', 'target_roi', 'target_roas']))),
    operationStatus: String(explicitStatus ?? findField(value, new Set(['status'])) ?? '').trim().toUpperCase() || undefined,
  }
}

export function assertGmvMaxRemoteCampaignState(input: {
  actionType: GmvMaxActionType
  actual: GmvMaxRemoteCampaignState
  expectedBudget?: string
  expectedRoasBid?: string
  expectedOperationStatus?: string
  phase: 'before' | 'after'
}) {
  const label = input.phase === 'before' ? 'precondition' : 'verification'
  if (input.actionType === 'budget' || input.actionType === 'roi') {
    const expectedBudget = decimal(input.expectedBudget)
    const expectedRoasBid = decimal(input.expectedRoasBid)
    if (!input.actual.budget || !input.actual.roasBid) {
      throw new Error(`TikTok campaign ${label} did not return budget and target ROI.`)
    }
    if (input.actual.budget !== expectedBudget || input.actual.roasBid !== expectedRoasBid) {
      throw new Error(`TikTok campaign ${label} failed because budget or target ROI changed.`)
    }
  }
  if (input.actionType === 'status') {
    const expectedStatus = String(input.expectedOperationStatus || '').trim().toUpperCase()
    if (!input.actual.operationStatus) throw new Error(`TikTok campaign ${label} did not return operation status.`)
    if (!expectedStatus || input.actual.operationStatus !== expectedStatus) {
      throw new Error(`TikTok campaign ${label} failed because operation status changed.`)
    }
  }
}

export function matchesGmvMaxRemoteCampaignState(input: Parameters<typeof assertGmvMaxRemoteCampaignState>[0]) {
  try {
    assertGmvMaxRemoteCampaignState(input)
    return true
  } catch {
    return false
  }
}
