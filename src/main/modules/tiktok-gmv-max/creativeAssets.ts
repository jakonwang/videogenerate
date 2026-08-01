import type { GmvMaxCreativeAsset, GmvMaxCreativeMetric } from './types'

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

export function resolveGmvMaxCreativeAsset(assets: GmvMaxCreativeAsset[], metric: Pick<GmvMaxCreativeMetric, 'campaignId' | 'storeId' | 'creativeId'>) {
  return assets.find((item) => item.storeId === metric.storeId
    && item.creativeId === metric.creativeId
    && item.campaignId === metric.campaignId)
    || assets.find((item) => item.storeId === metric.storeId
      && item.creativeId === metric.creativeId
      && !item.campaignId)
}
