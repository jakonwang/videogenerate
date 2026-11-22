import type { ShopHealth, ShopHealthIndicator } from '../../../shared/shopAnalysis'
import type { SiSettlement } from '../../../shared/shopProfit'
import { SHOP_METRIC_IDS, zonedDate, type ShopMetricKey, type SiCompassRow, type SiOrderLine, type SiPlatformSku, type SiShopDay } from '../../../shared/sellerInventory'

type Json = Record<string, any>

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function num(value: unknown) {
  const parsed = Number(typeof value === 'string' ? value.replace(/,/g, '') : value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: unknown) {
  if (value && typeof value === 'object') {
    const object = value as Json
    return num(object.amount ?? object.price_val ?? object.sale_price)
  }
  return num(value)
}

function firstUrl(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value.slice(0, 2048) : undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstUrl(item)
      if (url) return url
    }
    return undefined
  }
  if (typeof value === 'object') {
    const object = value as Json
    return firstUrl(object.thumb_url_list) || firstUrl(object.url_list) || firstUrl(object.url)
  }
  return undefined
}

export class SellerApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

/** Throws unless the seller API answered `code: 0`. */
export function assertOk(json: unknown, label: string): Json {
  const object = (json || {}) as Json
  if (Number(object.code) !== 0) {
    throw new SellerApiError(String(object.code ?? 'none'), `${label}: code=${object.code ?? 'none'} ${text(object.message || object.msg).slice(0, 120)}`.trim())
  }
  return (object.data || {}) as Json
}

/** `/api/v1/seller/workbench/get_all_sellers` -> the seller id of the shop in `region`. */
export function parseSellerId(json: unknown, region: string) {
  const data = assertOk(json, 'sellers')
  const wanted = String(region || '').toUpperCase()
  const entries: Json[] = []
  for (const value of Object.values((data.sellers_data || {}) as Json)) {
    const map = (value as Json)?.global_seller?.seller_map
    if (Array.isArray(map)) entries.push(...map)
  }
  const match = entries.find((entry) => text(entry.region).toUpperCase() === wanted) || entries[0]
  return match ? { sellerId: text(match.seller_id), shopName: text(match.shop_name), shopCode: text(match.shop_code) } : null
}

function skuStock(sku: Json) {
  const quantities = Array.isArray(sku.quantities) ? sku.quantities : []
  let total = 0
  let available = 0
  for (const item of quantities) {
    total += num(item?.total_quantity)
    available += num(item?.available_quantity)
  }
  return { total, available }
}

function skuName(sku: Json) {
  const properties = Array.isArray(sku.properties) ? sku.properties : []
  return properties.map((item: Json) => text(item?.value_name)).filter(Boolean).join(' / ')
}

export function toPlatformSku(shopKey: string, product: Json, sku: Json, now: number): SiPlatformSku | null {
  const skuId = text(sku.id)
  if (!skuId) return null
  const stock = skuStock(sku)
  return {
    id: `${shopKey}:${skuId}`,
    shopKey,
    skuId,
    productId: text(product.product_id),
    productName: text(product.product_name),
    skuName: skuName(sku),
    sellerSku: text(sku.seller_sku),
    image: firstUrl(product.image) || firstUrl(product.images),
    price: money(sku.base_price?.sale_price) || undefined,
    stockTotal: stock.total,
    stockAvailable: stock.available,
    updatedAt: now,
  }
}

/** `/api/v1/product/local/products/list` page. */
export function parseProductPage(json: unknown) {
  const data = assertOk(json, 'products')
  const products: Json[] = Array.isArray(data.products) ? data.products : []
  return {
    total: num(data.total_product_count),
    products: products.map((product) => ({
      product,
      skus: (Array.isArray(product.skus) ? product.skus : []) as Json[],
      totalSkuCount: num(product.total_sku_count),
    })),
  }
}

/** `/api/v1/product/local/product/skus/list` returns the SKUs as an index-keyed object. */
export function parseProductSkus(json: unknown): Json[] {
  const data = assertOk(json, 'product skus') as unknown
  if (Array.isArray(data)) return data as Json[]
  return Object.values((data || {}) as Json).filter((item) => item && typeof item === 'object') as Json[]
}

function lineStatus(order: Json, lineIds: string[]) {
  const statuses = new Map<string, number>()
  for (const item of Array.isArray(order.order_status_module) ? order.order_status_module : []) {
    statuses.set(text(item?.order_line_id), num(item?.sku_display_status) || num(item?.main_order_status))
  }
  const values = lineIds.map((id) => statuses.get(id)).filter((value): value is number => Boolean(value))
  if (!values.length) return num(order.order_status_module?.[0]?.sku_display_status)
  // A SKU counts as cancelled only when every one of its lines is.
  return values.find((value) => value !== 140) ?? 140
}

/** `/api/fulfillment/order/list` page -> one line per order and SKU. */
export function parseOrderPage(json: unknown, shopKey: string, timeZone: string) {
  const data = assertOk(json, 'orders')
  const orders: Json[] = Array.isArray(data.main_orders) ? data.main_orders : []
  const lines: SiOrderLine[] = []
  let oldestCreatedAt = Number.POSITIVE_INFINITY
  for (const order of orders) {
    const orderId = text(order.main_order_id)
    const createdAt = num(order.trade_order_module?.create_time) * 1000
    if (!orderId || !createdAt) continue
    oldestCreatedAt = Math.min(oldestCreatedAt, createdAt)
    const date = zonedDate(createdAt, timeZone)
    const items: Json[] = Array.isArray(order.sku_module) ? order.sku_module : []
    for (const item of items) {
      const skuId = text(item.sku_id)
      if (!skuId) continue
      const lineIds = (Array.isArray(item.order_line_ids) ? item.order_line_ids : []).map(text)
      const quantity = Math.max(0, Math.trunc(num(item.quantity)))
      const id = `${shopKey}:${orderId}:${skuId}`
      const existing = lines.find((line) => line.id === id)
      if (existing) {
        existing.quantity += quantity
        existing.amount += money(item.sku_total_price)
        continue
      }
      lines.push({
        id,
        shopKey,
        orderId,
        skuId,
        sellerSku: text(item.seller_sku_name),
        productName: text(item.product_name),
        skuName: text(item.sku_name),
        image: firstUrl(item.product_image),
        quantity,
        amount: money(item.sku_total_price),
        status: lineStatus(order, lineIds),
        createdAt,
        date,
      })
    }
  }
  return {
    lines,
    orderCount: orders.length,
    oldestCreatedAt: Number.isFinite(oldestCreatedAt) ? oldestCreatedAt : undefined,
    nextCursor: text(data.search_next_cursor),
    hasMore: Boolean(data.search_next_has_more ?? data.has_more),
    total: num(data.total_count),
  }
}

/** `/api/v2/insights/seller/ttp/product/sku/list` page for a single day. */
export function parseCompassPage(json: unknown, shopKey: string, date: string): SiCompassRow[] {
  const data = assertOk(json, 'compass')
  const items: Json[] = Array.isArray(data.items) ? data.items : []
  const rows: SiCompassRow[] = []
  for (const item of items) {
    const meta = (item.meta || {}) as Json
    const stats = (item.stats || {}) as Json
    const skuId = text(meta.sku_id || stats.sku_id)
    if (!skuId) continue
    rows.push({
      shopKey,
      skuId,
      productId: text(meta.product_id || stats.product_id),
      productName: text(meta.product_name),
      skuName: text(meta.sku_property_value),
      image: firstUrl(meta.product_image),
      date,
      gmv: money(stats.sku_gmv),
      orders: Math.trunc(num(stats.sku_order_cnt)),
      units: Math.trunc(num(stats.sku_unit_sold_cnt)),
    })
  }
  return rows
}

/** Body for `/api/v2/insights/seller/unified/query/us_overview_stats` covering one shop-local day. */
export function shopStatsBody(date: string, readyDate: string, timezoneOffsetMinutes: number) {
  const currency = new Set<number>([SHOP_METRIC_IDS.gmv, SHOP_METRIC_IDS.aov, SHOP_METRIC_IDS.liveGmv, SHOP_METRIC_IDS.videoGmv, SHOP_METRIC_IDS.cardGmv, SHOP_METRIC_IDS.affiliateLiveGmv, SHOP_METRIC_IDS.sellerLiveGmv, SHOP_METRIC_IDS.affiliateVideoGmv, SHOP_METRIC_IDS.sellerVideoGmv])
  return {
    query_condition: [{
      // start === end selects exactly that day.
      query_time: { start: date, end: date, timezone_offset: timezoneOffsetMinutes },
      metrics: Object.values(SHOP_METRIC_IDS).map((id) => ({ metric_id: id, metric_type: currency.has(id) ? 201 : 1 })),
      date_completion: { enabled: true, granularity: 0 },
      where_filter: { ready_time: { value_list: [readyDate] } },
      group_by: [],
    }],
  }
}

function metricValue(raw: unknown) {
  if (raw == null) return 0
  if (typeof raw === 'number') return raw
  try {
    const parsed = JSON.parse(String(raw)) as unknown
    if (typeof parsed === 'number') return parsed
    if (parsed && typeof parsed === 'object') return num((parsed as Json).value ?? (parsed as Json).amount)
    return num(parsed)
  } catch {
    return num(raw)
  }
}

/** One day of shop metrics, or null when Data Compass has nothing for that day. */
export function parseShopStats(json: unknown, shopKey: string, date: string, fetchedAt: number): SiShopDay | null {
  const data = assertOk(json, 'shop stats') as unknown
  const first = Array.isArray(data) ? (data[0] as Json) : undefined
  const values = first?.intervals?.[0]?.rows?.[0]?.values as Json | undefined
  if (!values) return null
  const day = { shopKey, date, fetchedAt } as SiShopDay
  for (const [key, id] of Object.entries(SHOP_METRIC_IDS) as Array<[ShopMetricKey, number]>) day[key] = metricValue(values[String(id)])
  return day
}

/** Seller center health: service indicators, to-do counts on the homepage, violation points. */
export function parseShopHealth(input: { homeTask: unknown; performance: unknown; violation: unknown }, shopKey: string, fetchedAt: number): ShopHealth {
  const tasks = assertOk(input.homeTask, 'home tasks')
  const performance = assertOk(input.performance, 'performance')
  const violation = assertOk(input.violation, 'violations')
  const cards: Json[] = Array.isArray(tasks.home_cards) ? tasks.home_cards : []
  const card = (pattern: RegExp) => cards.find((item) => pattern.test(text(item.card_title)))
  const value = (item?: Json) => Math.trunc(num(item?.card_value))
  const urgent = (item?: Json) => (Array.isArray(item?.urgent_list) ? item!.urgent_list.reduce((total: number, entry: Json) => total + Math.trunc(num(entry?.card_value)), 0) : 0)
  const toShip = card(/orders_to_ship/)
  const returns = card(/pending_return/)
  const stock = card(/low_stock/)
  const indicators: ShopHealthIndicator[] = (Array.isArray(performance.indicators) ? performance.indicators : []).map((item: Json) => ({
    key: text(item.name).split('.').pop() || text(item.name),
    title: text(item.title),
    value: item.value === undefined || item.value === null ? undefined : num(item.value),
    target: num(item.target_value),
    operator: (['ge', 'gt', 'le', 'lt'].includes(text(item.operator)) ? text(item.operator) : 'ge') as ShopHealthIndicator['operator'],
    unit: Math.trunc(num(item.unit)) || 101,
    defective: Math.trunc(num(item.defective_order_count)),
  }))
  const points: Json[] = Array.isArray(violation.violation_points_v2) ? violation.violation_points_v2 : []
  const actions: Json[] = Array.isArray(violation.action_needed?.items) ? violation.action_needed.items : []
  return {
    shopKey,
    fetchedAt,
    indicators,
    todo: {
      toShip: value(toShip),
      urgentToShip: urgent(toShip),
      returns: value(returns),
      urgentReturns: urgent(returns),
      negativeReviews: value(card(/negative_review/)),
      outOfStock: urgent(stock),
      rejectedProducts: value(card(/rejected_products/)),
    },
    violationScore: num(violation.violation_score),
    violations: points.map((item) => ({ key: text(item.violation_type_key), title: text(item.violation_type_str), count: Math.trunc(num(item.count)), score: num(item.violation_score) })),
    warnings: actions.reduce((total, item) => total + Math.trunc(num(item.num)), 0),
  }
}

/** `/api/v1/pay/statement/order/list` page: one record per order or adjustment. */
export function parseSettlementPage(json: unknown, shopKey: string, status: SiSettlement['status'], timeZone: string) {
  const data = assertOk(json, 'settlements')
  const rows: Json[] = Array.isArray(data.order_records) ? data.order_records : []
  const records: SiSettlement[] = []
  for (const row of rows) {
    const id = text(row.statement_detail_id) || text(row.reference_id)
    const placedAt = num(row.placed_time)
    if (!id || !placedAt) continue
    const settledAt = num(row.settlement_time) || undefined
    records.push({
      id,
      shopKey,
      orderId: text(row.trade_order_id),
      placedAt,
      placedDate: zonedDate(placedAt, timeZone),
      settledAt: status === 'settled' ? settledAt : undefined,
      status,
      tradeType: Math.trunc(num(row.trade_type)) || 1,
      revenue: money(row.earning_amount),
      fees: money(row.fees),
      settlement: money(row.settlement_amount),
      shipping: money(row.shipping_amount),
    })
  }
  return { records, count: rows.length, total: num(data.total_record) }
}

/** Several days in one request: one query condition per day, answered in the same order. */
export function shopStatsBodyMulti(dates: string[], readyDate: string, timezoneOffsetMinutes: number) {
  return { query_condition: dates.map((date) => shopStatsBody(date, readyDate, timezoneOffsetMinutes).query_condition[0]) }
}

export function parseShopStatsMulti(json: unknown, shopKey: string, dates: string[], fetchedAt: number): SiShopDay[] {
  const data = assertOk(json, 'shop stats') as unknown
  const results = Array.isArray(data) ? data : []
  const days: SiShopDay[] = []
  dates.forEach((date, index) => {
    const result = results[index] as Json | undefined
    // Each answer carries its own date range; trust it over the position when present.
    const answered = text(result?.intervals?.[0]?.start_date)
    const day = parseShopStats({ code: 0, data: [result] }, shopKey, answered && /^\d{4}-\d{2}-\d{2}$/.test(answered) ? answered : date, fetchedAt)
    if (day) days.push(day)
  })
  return days
}
