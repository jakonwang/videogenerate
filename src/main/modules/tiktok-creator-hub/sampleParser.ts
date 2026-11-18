// Maps the affiliate `sample/group/list` (view_type 2) payload to CreatorHubSample rows.
// Pure module so it can be unit tested without Electron.
import type { CreatorHubSample, CreatorHubSampleStage } from '../../../shared/creatorHub'

export function stageOf(status: number): CreatorHubSampleStage {
  if (status === 10) return 'pending_review'
  if (status === 20) return 'ready_to_ship'
  if (status === 30) return 'shipped'
  if (status === 40) return 'awaiting_content'
  if (status === 100) return 'completed'
  // 5x: cancelled / rejected / expired; 6x: closed after shipping (seen as 61 on long-expired samples).
  if (status >= 50 && status < 70) return 'cancelled'
  return 'unknown'
}

function num(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function percent(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const parsed = Number(text.replace('%', '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return undefined
  return text.includes('%') || parsed > 1 ? parsed / 100 : parsed
}

function timestamp(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed < 1e12 ? parsed * 1000 : parsed
}

export type SamplePage = { rows: Omit<CreatorHubSample, 'firstSeenAt' | 'costOverride' | 'note'>[]; hasMore: boolean; total?: number }

export function parseSamplePage(payload: any, shopId: string, syncedAt = Date.now()): SamplePage {
  if (!payload || Number(payload.code) !== 0) throw new Error(`CREATOR_HUB_SAMPLE_API_ERROR:${payload?.code ?? 'empty'}:${String(payload?.message || '').slice(0, 120)}`)
  const rows: SamplePage['rows'] = []
  for (const item of Array.isArray(payload.agg_info) ? payload.agg_info : []) {
    const detail = item?.apply_deatil || item?.apply_detail
    const apply = detail?.apply_info
    const creator = detail?.creator_info || item?.apply_group?.creator_info || {}
    if (!apply?.apply_id) continue
    const status = Number(apply.curr_status) || 0
    const orderId = String(apply.main_order_id || '')
    const hasSampleOrder = Boolean(orderId && orderId !== '0')
    const commission = apply.standard_commission?.fixed_commission_rate ?? apply.commission_rate
    rows.push({
      id: `${shopId}:${apply.apply_id}`,
      shopId,
      applyId: String(apply.apply_id),
      creatorId: String(creator.creator_id || creator.tt_uid || ''),
      creatorHandle: String(creator.name || ''),
      creatorNickname: String(creator.nick_name || creator.name || ''),
      creatorAvatar: creator.avatar_url ? String(creator.avatar_url) : undefined,
      followers: num(creator.follower_num),
      creatorGmvText: creator.gmv ? String(creator.gmv) : undefined,
      platformFulfillmentRate: percent(creator.fulfillment_rate),
      productId: String(apply.product_id || ''),
      productTitle: String(apply.product_title || ''),
      skuId: String(apply.sku_id || ''),
      skuDesc: apply.sku_desc ? String(apply.sku_desc) : undefined,
      skuImage: apply.sku_image ? String(apply.sku_image) : undefined,
      // 1000 = 10.00%
      commissionRate: commission == null || commission === '' ? undefined : num(commission) / 10000,
      status,
      stage: stageOf(status),
      sampleOrderId: hasSampleOrder ? orderId : undefined,
      hasSampleOrder,
      sourceType: apply.source_type == null ? undefined : Number(apply.source_type),
      contentType: apply.fulfillment_content_type == null ? undefined : Number(apply.fulfillment_content_type),
      createdAt: timestamp(apply.create_time) || syncedAt,
      fulfillmentExpireAt: timestamp(apply.fulfillment_expire_time),
      platformOverdue: Boolean(apply.overdue),
      syncedAt,
    })
  }
  return { rows, hasMore: Boolean(payload.has_more), total: payload.total_count == null ? undefined : Number(payload.total_count) }
}
