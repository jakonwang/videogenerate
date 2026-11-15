// Parsers for the affiliate "compass" analytics lists and the affiliate order list.
// Pure module (no electron) so it can be unit tested.
import type {
  CreatorHubContentType,
  CreatorHubCreatorPerf,
  CreatorHubOrder,
  CreatorHubPerfMetrics,
  CreatorHubVideo,
  CreatorHubWindow,
} from '../../../shared/creatorHub'

const DAY = 86_400_000

/** UTC offset (seconds) of each affiliate region, used by the compass time descriptor. */
const REGION_OFFSET: Record<string, number> = { VN: 25200, TH: 25200, ID: 25200, MY: 28800, PH: 28800, SG: 28800, UK: 0, US: -18000 }

export function regionOffsetSeconds(region: string) {
  return REGION_OFFSET[String(region || '').toUpperCase()] ?? 25200
}

/**
 * `days` full shop-local days ending before yesterday: [today - 1 - days, today - 1).
 * Compass figures settle with about a day of delay, so the most recent complete day is the day before yesterday.
 */
export function analyticsWindow(days: number, region: string, now = Date.now()): CreatorHubWindow {
  const offsetMs = regionOffsetSeconds(region) * 1000
  const localMidnight = Math.floor((now + offsetMs) / DAY) * DAY - offsetMs
  const end = localMidnight - DAY
  return { start: end - Math.max(1, days) * DAY, end }
}

export function timeDescriptor(window: CreatorHubWindow, region: string) {
  return { granularity_type: 1, timezone_offset: regionOffsetSeconds(region), start_time: Math.floor(window.start / 1000), end_time: Math.floor(window.end / 1000), time_option_type: 0 }
}

function num(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return num(record.amount ?? record.value)
  }
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalRate(value: unknown): number | undefined {
  if (value == null) return undefined
  const raw = typeof value === 'object' ? (value as Record<string, unknown>).value : value
  if (raw == null || raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function firstUrl(value: unknown): string | undefined {
  const list = (value as { thumb_url_list?: unknown[]; url_list?: unknown[] } | undefined)
  const url = list?.thumb_url_list?.[0] ?? list?.url_list?.[0]
  return url ? String(url) : undefined
}

function ms(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed < 1e12 ? parsed * 1000 : parsed
}

function assertOk(payload: any, scope: string) {
  if (!payload || Number(payload.code) !== 0) throw new Error(`CREATOR_HUB_API_${scope}:${payload?.code ?? 'empty'}:${String(payload?.message || '').slice(0, 120)}`)
}

export function videoListBody(window: CreatorHubWindow, region: string, page: number, pageSize = 50) {
  return {
    params: {
      detail_list_type: 3,
      video_list_params_v2: [{
        time_descriptor: timeDescriptor(window, region),
        metric_types: [1, 2, 5, 14, 15, 16, 7, 8, 9, 18, 19, 17, 3, 21, 22, 20, 11, 12],
        page_param: { page_no: page, page_size: pageSize },
        sorter: { sort_type: 1, order_type: 1 },
        filter: {},
      }],
    },
    module_type: 501,
    locale: 'vi-VN',
  }
}

export function creatorListBody(window: CreatorHubWindow, region: string, page: number, pageSize = 50) {
  const length = window.end - window.start
  const previous = { start: window.start - length, end: window.start }
  return {
    params: {
      detail_list_type: 1,
      creator_list_params: [{
        time_descriptor: timeDescriptor(window, region),
        metric_types: [2, 26, 27, 3, 5, 6, 7, 10, 28, 18, 9, 8, 17, 12, 24, 14, 15, 19, 20, 21, 4],
        page_param: { page_no: page, page_size: pageSize },
        sorter: { sort_type: 2, order_type: 1 },
        filter: {},
        previous_period_time_descriptor: { start_time: Math.floor(previous.start / 1000), end_time: Math.floor(previous.end / 1000), timezone_offset: regionOffsetSeconds(region), granularity_type: 1, time_option_type: 0 },
      }],
    },
    module_type: 103,
    locale: 'vi-VN',
  }
}

export function orderListBody(window: CreatorHubWindow, cursor?: string) {
  const body: Record<string, unknown> = {
    query_size: 50,
    page_size: 50,
    affiliate_seller_search_condition: { cod_type: 0, campaign_type: 1, op_assist_order_type: 2, order_create_time: { start_time: window.start, end_time: window.end - 1 } },
  }
  if (cursor) body.cursor = cursor
  return body
}

export function parseVideoPage(payload: any, shopId: string, window: CreatorHubWindow, syncedAt = Date.now()) {
  assertOk(payload, 'VIDEOS')
  const segment = payload.data?.video_list_segments_v2?.[0] || {}
  const rows: CreatorHubVideo[] = []
  for (const item of Array.isArray(segment.video_performances) ? segment.video_performances : []) {
    const info = item?.video_info || {}
    const itemId = String(info.item_id || '')
    if (!itemId) continue
    const creator = item.creator_base || {}
    const metrics = item.video_metrics || {}
    const products = Array.isArray(item.product_base_list) ? item.product_base_list : []
    rows.push({
      id: `${shopId}:${itemId}`,
      shopId,
      itemId,
      title: String(info.title || ''),
      cover: firstUrl(info.cover),
      postedAt: ms(info.create_time),
      creatorId: String(creator.oec_id || ''),
      creatorHandle: String(creator.handle_name || ''),
      creatorNickname: String(creator.nick_name || creator.handle_name || ''),
      creatorAvatar: firstUrl(creator.avatar),
      followers: num(creator.follower_cnt),
      productIds: (Array.isArray(item.product_ids) ? item.product_ids : products.map((product: any) => product?.id)).filter(Boolean).map(String),
      productTitles: products.map((product: any) => String(product?.title || '')).filter(Boolean),
      gmv: num(metrics.video_gmv),
      orders: num(metrics.video_orders_cnt),
      itemsSold: num(metrics.video_items_sold_cnt),
      views: num(metrics.video_views_cnt),
      likes: num(metrics.video_likes_cnt),
      comments: num(metrics.video_comments_cnt),
      shares: num(metrics.video_shares_cnt),
      refundedGmv: num(metrics.video_refunded_gmv),
      refundedItems: num(metrics.video_refunded_items_cnt),
      commission: num(metrics.video_estimated_commission),
      finishRate: optionalRate(metrics.video_finish_rate),
      ctr: optionalRate(metrics.video_distinct_product_ctr),
      gpm: num(metrics.video_distinct_gpm),
      aov: num(metrics.video_average_order_value),
      productImpressions: num(metrics.video_product_impressions_cnt),
      productClicks: num(metrics.video_product_clicks_cnt),
      window,
      syncedAt,
    })
  }
  return { rows, total: segment.total == null ? undefined : Number(segment.total) }
}

function perfMetrics(metrics: any): CreatorHubPerfMetrics {
  const m = metrics || {}
  return {
    gmv: num(m.creator_gmv),
    refundedGmv: num(m.creator_refunded_gmv),
    commission: num(m.creator_estimated_commission),
    orders: num(m.creator_orders_cnt),
    itemsSold: num(m.creator_items_sold_cnt),
    refundedItems: num(m.creator_refunded_items_cnt),
    videos: num(m.creator_video_cnt),
    lives: num(m.creator_live_cnt),
    samplesShipped: num(m.creator_samples_shipped_cnt),
    sampleContent: num(m.creator_sample_content_cnt),
    views: num(m.creator_video_views_cnt),
    videoGmv: num(m.video_gmv),
    liveGmv: num(m.live_gmv),
    productCardGmv: num(m.product_card_gmv),
  }
}

export function parseCreatorPage(payload: any, shopId: string, window: CreatorHubWindow, syncedAt = Date.now()) {
  assertOk(payload, 'CREATORS')
  const segment = payload.data?.creator_list_segments?.[0] || {}
  const rows: CreatorHubCreatorPerf[] = []
  for (const item of Array.isArray(segment.creator_performances) ? segment.creator_performances : []) {
    const creator = item?.creator_base || {}
    const creatorId = String(creator.oec_id || '')
    if (!creatorId) continue
    rows.push({
      id: `${shopId}:${creatorId}`,
      shopId,
      creatorId,
      creatorHandle: String(creator.handle_name || ''),
      creatorNickname: String(creator.nick_name || creator.handle_name || ''),
      creatorAvatar: firstUrl(creator.avatar),
      followers: num(creator.follower_cnt),
      metrics: perfMetrics(item.creator_metrics),
      previous: item.previous_period_creator_metrics ? perfMetrics(item.previous_period_creator_metrics) : undefined,
      window,
      syncedAt,
    })
  }
  return { rows, total: segment.total == null ? undefined : Number(segment.total) }
}

function contentTypeOf(promotionType: unknown): CreatorHubContentType {
  const value = Number(promotionType)
  if (value === 2) return 'video'
  if (value === 1 || value === 3) return 'live'
  if (value === 6) return 'showcase'
  return 'other'
}

export function parseOrderPage(payload: any, shopId: string, syncedAt = Date.now()) {
  assertOk(payload, 'ORDERS')
  const data = payload.data || {}
  const rows: CreatorHubOrder[] = []
  for (const item of Array.isArray(data.sku_order_list) ? data.sku_order_list : []) {
    const base = item?.sku_order_base_info_for_affiliate_seller || {}
    const sku = base.sku_order_info || {}
    const orderId = String(sku.main_order_id || '')
    const skuId = String(sku.sku_id || '')
    if (!orderId) continue
    const creator = base.creator_info || {}
    const product = base.product_info || {}
    const commission = item.sku_order_commission_info_for_affiliate_seller || {}
    const unitPrice = num(sku.sale_price)
    const quantity = num(sku.sale_quantity) || 1
    const promotion = sku.promotion_position_info || {}
    const rate = (value: unknown) => {
      const parsed = Number(String(value ?? '').replace('%', ''))
      if (value == null || value === '' || !Number.isFinite(parsed)) return undefined
      return String(value).includes('%') || parsed > 1 ? parsed / 100 : parsed
    }
    rows.push({
      id: `${shopId}:${orderId}:${skuId}`,
      shopId,
      orderId,
      skuId,
      productId: product.product_id ? String(product.product_id) : product.id ? String(product.id) : undefined,
      productTitle: product.product_name ? String(product.product_name) : product.title ? String(product.title) : product.name ? String(product.name) : undefined,
      creatorId: String(creator.creator_oec_id || creator.creator_id || ''),
      creatorHandle: String(creator.creator_username || ''),
      creatorNickname: String(creator.creator_nickname || creator.creator_username || ''),
      contentId: promotion.promotion_id && String(promotion.promotion_id) !== '0' ? String(promotion.promotion_id) : undefined,
      contentType: contentTypeOf(promotion.promotion_type),
      createdAt: ms(sku.create_time),
      unitPrice,
      quantity,
      amount: unitPrice * quantity,
      refundQuantity: num(sku.refund_number),
      returnQuantity: num(sku.return_number),
      settlementStatus: num(sku.settlement_status),
      settledAt: ms(sku.settlement_time) || undefined,
      commissionBase: num(commission.est_commission_base),
      actualCommissionBase: commission.actual_commission_base ? num(commission.actual_commission_base) : undefined,
      estCommission: num(commission.est_standard_commission),
      actualCommission: commission.actual_standard_commission ? num(commission.actual_standard_commission) : undefined,
      estAdsCommission: num(commission.est_shop_ads_commission),
      standardRate: rate(commission.standard_cos_ratio),
      adsRate: rate(commission.shop_ads_cos_ratio),
      currency: sku.sale_price?.currency ? String(sku.sale_price.currency) : undefined,
      syncedAt,
    })
  }
  return { rows, hasMore: Boolean(data.has_more), cursor: data.next_cursor ? String(data.next_cursor) : undefined, total: data.total_count == null ? undefined : Number(data.total_count) }
}
