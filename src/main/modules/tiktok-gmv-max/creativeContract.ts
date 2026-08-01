import { buildGmvMaxCreativeReportRequest, parseGmvMaxCreativeReportRow } from './reportContract'
import type { GmvMaxCampaign, GmvMaxCreativeAsset, GmvMaxCreativeMetric } from './types'

export type GmvMaxCreativeOperation = 'ADD' | 'REMOVE'

export type GmvMaxCreativeTarget = {
  creativeId: string
  itemId: string
  spuIds: string[]
  operation: GmvMaxCreativeOperation
}

function valueText(value: unknown) {
  return String(value ?? '').trim()
}

function collectDeepValues(value: unknown, keys: Set<string>, output: Set<string>, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) collectDeepValues(item, keys, output, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key.toLowerCase())) {
      if (Array.isArray(item)) {
        for (const entry of item) {
          const normalized = valueText(typeof entry === 'object' && entry !== null
            ? (entry as Record<string, unknown>).spu_id || (entry as Record<string, unknown>).item_group_id || (entry as Record<string, unknown>).id
            : entry)
          if (normalized) output.add(normalized)
        }
      } else {
        const normalized = valueText(item)
        if (normalized) output.add(normalized)
      }
    }
    collectDeepValues(item, keys, output, depth + 1)
  }
}

export function resolveGmvMaxCreativeTarget(input: {
  campaign: GmvMaxCampaign
  creativeId: string
  operation: GmvMaxCreativeOperation
  metrics: GmvMaxCreativeMetric[]
  assets?: GmvMaxCreativeAsset[]
  explicitSpuIds?: string[]
}): GmvMaxCreativeTarget {
  const matchingMetrics = input.metrics.filter((item) => item.campaignId === input.campaign.id && item.creativeId === input.creativeId)
  const itemIds = [...new Set(matchingMetrics.map((item) => valueText(item.itemId)).filter(Boolean))]
  if (itemIds.length > 1) throw new Error(`Creative ${input.creativeId} maps to multiple TikTok item IDs.`)
  const itemId = itemIds[0] || input.creativeId
  if (!itemId) throw new Error('TikTok creative update requires an item ID.')

  const spuIds = new Set((input.explicitSpuIds || []).map(valueText).filter(Boolean))
  for (const metric of matchingMetrics) {
    const spuId = valueText(metric.itemGroupId)
    if (spuId) spuIds.add(spuId)
  }
  for (const asset of input.assets || []) {
    if (asset.creativeId !== input.creativeId) continue
    collectDeepValues(asset.raw, new Set(['spu_id', 'spu_id_list', 'item_group_id', 'item_group_ids']), spuIds)
  }
  const resolvedSpuIds = [...spuIds].sort()
  if (input.campaign.campaignType === 'PRODUCT' && !resolvedSpuIds.length) {
    throw new Error(`Product GMV MAX creative ${input.creativeId} does not have a verifiable SPU mapping.`)
  }
  return { creativeId: input.creativeId, itemId, spuIds: resolvedSpuIds, operation: input.operation }
}

export function buildGmvMaxCreativeUpdateArgs(input: {
  advertiserId: string
  campaign: GmvMaxCampaign
  target: GmvMaxCreativeTarget
}) {
  return {
    advertiser_id: input.advertiserId,
    campaign_id: input.campaign.id,
    action: input.target.operation,
    item_list: [{
      item_id: input.target.itemId,
      ...(input.target.spuIds.length ? { spu_id_list: input.target.spuIds } : {}),
    }],
  }
}

export function buildGmvMaxCreativeVerificationRequest(input: {
  advertiserId: string
  storeId: string
  campaign: GmvMaxCampaign
  targets: GmvMaxCreativeTarget[]
  startDate: string
  endDate: string
  page?: number
}) {
  const base = buildGmvMaxCreativeReportRequest({
    advertiserId: input.advertiserId,
    storeId: input.storeId,
    campaignIds: [input.campaign.id],
    itemGroupIds: [...new Set(input.targets.flatMap((item) => item.spuIds))],
    campaignType: input.campaign.campaignType,
    startDate: input.startDate,
    endDate: input.endDate,
    page: input.page || 1,
  })
  return {
    ...base,
    filtering: {
      ...base.filtering,
      item_ids: [...new Set(input.targets.map((item) => item.itemId))],
    },
  }
}

export type GmvMaxCreativeVerification = {
  state: 'confirmed' | 'pending' | 'diverged'
  statuses: Record<string, string[]>
  reason: string
}

export function verifyGmvMaxCreativeDelivery(input: {
  campaign: GmvMaxCampaign
  targets: GmvMaxCreativeTarget[]
  rows: Record<string, any>[]
  storeId: string
  now?: number
}): GmvMaxCreativeVerification {
  const metrics = input.rows
    .map((row) => parseGmvMaxCreativeReportRow(row, input.storeId, input.now || Date.now()))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const statuses: Record<string, string[]> = {}
  let pending = false
  let diverged = false
  for (const target of input.targets) {
    const matching = metrics.filter((metric) => metric.campaignId === input.campaign.id
      && valueText(metric.itemId) === target.itemId
      && (!target.spuIds.length || target.spuIds.includes(valueText(metric.itemGroupId))))
    const key = `${target.operation}:${target.itemId}`
    const targetStatuses = [...new Set(matching.map((metric) => valueText(metric.status).toUpperCase()).filter(Boolean))]
    statuses[key] = targetStatuses
    const coveredSpus = new Set(matching.map((metric) => valueText(metric.itemGroupId)).filter(Boolean))
    if (!matching.length || !targetStatuses.length || target.spuIds.some((spuId) => !coveredSpus.has(spuId))) {
      pending = true
      continue
    }
    const excluded = targetStatuses.every((status) => status === 'EXCLUDED')
    const included = targetStatuses.every((status) => status !== 'EXCLUDED')
    if ((target.operation === 'REMOVE' && !excluded) || (target.operation === 'ADD' && !included)) diverged = true
  }
  if (diverged) return { state: 'diverged', statuses, reason: 'TikTok creative delivery status contradicts the requested action.' }
  if (pending) return { state: 'pending', statuses, reason: 'TikTok creative delivery status has not stabilized yet.' }
  return { state: 'confirmed', statuses, reason: 'TikTok creative delivery status matches the requested action.' }
}
