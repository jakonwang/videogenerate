import { createHash } from 'node:crypto'
import type { GmvMaxCampaignType, GmvMaxCreativeMetric, GmvMaxCreativeSource } from './types'

export const GMV_MAX_CREATIVE_REPORT_DIMENSIONS = [
  'campaign_id',
  'item_group_id',
  'item_id',
  'stat_time_day',
] as const

export const GMV_MAX_CREATIVE_REPORT_METRICS = [
  'creative_delivery_status',
  'cost',
  'orders',
  'cost_per_order',
  'gross_revenue',
  'roi',
  'product_impressions',
  'product_clicks',
  'product_click_rate',
  'ad_click_rate',
  'ad_conversion_rate',
  'ad_video_view_rate_2s',
  'ad_video_view_rate_6s',
  'ad_video_view_rate_p25',
  'ad_video_view_rate_p50',
  'ad_video_view_rate_p75',
  'ad_video_view_rate_p100',
] as const

export const GMV_MAX_PRODUCT_REPORT_DIMENSIONS = ['campaign_id', 'item_group_id'] as const
export const GMV_MAX_PRODUCT_REPORT_METRICS = ['orders', 'gross_revenue'] as const

export function hasNextGmvMaxPage(input: unknown, currentPage: number, pageSize: number, rowCount: number, maxPages = 100) {
  if (currentPage >= maxPages) return false
  let response: any = input
  for (let index = 0; index < 4; index += 1) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) break
    if ('data' in response && Object.keys(response).length <= 5) response = response.data
    else break
  }
  const pageInfo = response?.page_info || response?.pageInfo || response?.data?.page_info || response?.data?.pageInfo || {}
  const totalPages = Number(pageInfo.total_page ?? pageInfo.totalPage)
  if (Number.isFinite(totalPages) && totalPages > 0) return currentPage < Math.min(maxPages, Math.trunc(totalPages))
  const totalCount = Number(pageInfo.total_number ?? pageInfo.totalNumber ?? pageInfo.total_count ?? pageInfo.totalCount)
  if (Number.isFinite(totalCount) && totalCount >= 0) return currentPage * pageSize < totalCount
  return rowCount >= pageSize
}

type CreativeReportRequestInput = {
  advertiserId: string
  storeId: string
  campaignIds: string[]
  itemGroupIds: string[]
  campaignType: GmvMaxCampaignType
  startDate: string
  endDate: string
  page: number
}

export function buildGmvMaxCreativeReportRequest(input: CreativeReportRequestInput) {
  return {
    advertiser_id: input.advertiserId,
    store_ids: [input.storeId],
    start_date: input.startDate,
    end_date: input.endDate,
    metrics: [...GMV_MAX_CREATIVE_REPORT_METRICS],
    dimensions: [...GMV_MAX_CREATIVE_REPORT_DIMENSIONS],
    filtering: {
      campaign_ids: input.campaignIds,
      item_group_ids: input.itemGroupIds,
    },
    page: input.page,
    page_size: 1000,
  }
}

export function buildGmvMaxProductReportRequest(input: Omit<CreativeReportRequestInput, 'itemGroupIds'>) {
  return {
    advertiser_id: input.advertiserId,
    store_ids: [input.storeId],
    start_date: input.startDate,
    end_date: input.endDate,
    metrics: [...GMV_MAX_PRODUCT_REPORT_METRICS],
    dimensions: [...GMV_MAX_PRODUCT_REPORT_DIMENSIONS],
    filtering: {
      campaign_ids: input.campaignIds,
    },
    page: input.page,
    page_size: 1000,
  }
}

export function parseGmvMaxProductReportIds(row: Record<string, any>) {
  const dimensions = row.dimensions || row.dimension || {}
  const campaignId = valueText(dimensions.campaign_id || row.campaign_id)
  const itemGroupId = valueText(dimensions.item_group_id || row.item_group_id)
  return campaignId && itemGroupId ? { campaignId, itemGroupId } : null
}

function valueText(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function decimalText(value: unknown, fallback = '0') {
  const normalized = valueText(value, fallback)
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : fallback
}

export function normalizeGmvMaxReportRate(value: unknown, fallback = '0') {
  const normalized = decimalText(value, fallback)
  const ratio = Number(normalized) / 100
  if (!Number.isFinite(ratio)) return fallback
  return ratio.toFixed(8).replace(/\.?0+$/, '') || '0'
}

function creativeSource(shopContentType: string, authorizationType: string): GmvMaxCreativeSource {
  if (shopContentType === 'PRODUCT_CARD') return 'product_card'
  if (authorizationType === 'AFFILIATE') return 'affiliate'
  return 'owned'
}

export function parseGmvMaxCreativeReportRow(
  row: Record<string, any>,
  storeId: string,
  syncedAt: number,
): Omit<GmvMaxCreativeMetric, 'id'> | null {
  const dimensions = row.dimensions || row.dimension || {}
  const metrics = row.metrics || row.metric || row
  const campaignId = valueText(dimensions.campaign_id || row.campaign_id)
  const itemGroupId = valueText(dimensions.item_group_id || row.item_group_id)
  const itemId = valueText(dimensions.item_id || row.item_id)
  const statDate = valueText(dimensions.stat_time_day || row.stat_time_day || row.stat_date)
  if (!campaignId || !itemId || !statDate) return null

  const shopContentType = valueText(metrics.shop_content_type || row.shop_content_type, itemId === '-1' ? 'PRODUCT_CARD' : '').toUpperCase()
  const authorizationType = valueText(metrics.tt_account_authorization_type || row.tt_account_authorization_type).toUpperCase()
  const creativeId = itemId === '-1' && itemGroupId ? `product-card:${itemGroupId}` : itemId

  return {
    campaignId,
    storeId,
    creativeId,
    itemId,
    itemGroupId: itemGroupId || undefined,
    creativeName: valueText(metrics.title || row.title) || undefined,
    source: creativeSource(shopContentType, authorizationType),
    statDate,
    cost: decimalText(metrics.cost),
    grossRevenue: decimalText(metrics.gross_revenue),
    roi: decimalText(metrics.roi),
    orders: decimalText(metrics.orders),
    cpa: decimalText(metrics.cost_per_order),
    ctr: normalizeGmvMaxReportRate(metrics.product_click_rate || metrics.ad_click_rate),
    conversionRate: normalizeGmvMaxReportRate(metrics.ad_conversion_rate),
    productImpressions: decimalText(metrics.product_impressions),
    productClicks: decimalText(metrics.product_clicks),
    play2sRate: normalizeGmvMaxReportRate(metrics.ad_video_view_rate_2s),
    playDepth: normalizeGmvMaxReportRate(metrics.ad_video_view_rate_6s),
    play25Rate: normalizeGmvMaxReportRate(metrics.ad_video_view_rate_p25),
    play50Rate: normalizeGmvMaxReportRate(metrics.ad_video_view_rate_p50),
    play75Rate: normalizeGmvMaxReportRate(metrics.ad_video_view_rate_p75),
    play100Rate: normalizeGmvMaxReportRate(metrics.ad_video_view_rate_p100),
    status: valueText(metrics.creative_delivery_status || row.creative_delivery_status) || undefined,
    raw: { ...row, ...dimensions, ...metrics },
    syncedAt,
  }
}

export function buildGmvMaxCreativeMetricId(metric: Pick<GmvMaxCreativeMetric, 'campaignId' | 'creativeId' | 'itemGroupId' | 'statDate'>) {
  return createHash('sha256')
    .update([metric.campaignId, metric.itemGroupId || 'unscoped', metric.creativeId, metric.statDate].join(':'))
    .digest('hex')
    .slice(0, 32)
}
