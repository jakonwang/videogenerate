import type { GmvMaxCampaign, GmvMaxCreativeAsset, GmvMaxCreativeMetric } from './types'

export function buildGmvMaxVideoIdentity(row: Record<string, unknown>, storeId: string) {
  const value = (input: unknown) => String(input ?? '').trim()
  const identityType = value(row.identity_type || row.type)
  const authorizedShopId = value(row.identity_authorized_shop_id || row.store_id)
    || (identityType === 'TTS_TT' ? storeId : '')
  return {
    identity_id: value(row.identity_id || row.id),
    identity_type: identityType,
    ...(value(row.identity_authorized_bc_id) ? { identity_authorized_bc_id: value(row.identity_authorized_bc_id) } : {}),
    ...(authorizedShopId ? { identity_authorized_shop_id: authorizedShopId } : {}),
  }
}

export function extractGmvMaxCampaignIdentityRows(campaigns: GmvMaxCampaign[], storeId: string) {
  const rows: Record<string, unknown>[] = []
  for (const campaign of campaigns) {
    if (campaign.storeId !== storeId) continue
    const source = campaign.raw.campaign
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    const identities = (source as Record<string, unknown>).identity_list
    if (!Array.isArray(identities)) continue
    for (const identity of identities) {
      if (identity && typeof identity === 'object' && !Array.isArray(identity)) {
        rows.push(identity as Record<string, unknown>)
      }
    }
  }
  return rows
}

export function mergeGmvMaxIdentityRows(rows: Record<string, unknown>[]) {
  const merged = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const identityId = String(row.identity_id || row.id || '').trim()
    const identityType = String(row.identity_type || row.type || '').trim()
    if (!identityId || !identityType) continue
    const key = `${identityId}:${identityType}`
    merged.set(key, { ...(merged.get(key) || {}), ...row })
  }
  return [...merged.values()]
}

export function resolveGmvMaxCreativeAsset(assets: GmvMaxCreativeAsset[], metric: Pick<GmvMaxCreativeMetric, 'campaignId' | 'storeId' | 'creativeId'>) {
  return assets.find((item) => item.storeId === metric.storeId
    && item.creativeId === metric.creativeId
    && item.campaignId === metric.campaignId)
    || assets.find((item) => item.storeId === metric.storeId
      && item.creativeId === metric.creativeId
      && !item.campaignId)
}
