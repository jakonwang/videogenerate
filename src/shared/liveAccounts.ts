import { matchStoreSku, codeFromTitle } from './productCode'
import type { SiPlatformSku } from './sellerInventory'

/**
 * 直播账号：主播工作台（shop.tiktok.com/streamer）里的场次和每场的商品数据。
 * 和店铺是两套登录；同一款号在各账号、各店通用。
 */

export type LiveAccount = {
  id: string
  handle: string
  name: string
  region: string
  currency: string
  loginState: 'valid' | 'expired' | 'unknown'
  cookieImportedAt?: number
  cookieExpiresAt?: number
  lastVerifiedAt?: number
  lastSyncAt?: number
  lastSyncError?: string
  createdAt: number
}

export type LiveRoomProduct = {
  productId: string
  name: string
  image?: string
  /** 商品曝光、点击都是次数 */
  exposures: number
  clicks: number
  carts: number
  orders: number
  buyers: number
  sales: number
  gmv: number
}

export type LiveRoom = {
  id: string
  accountId: string
  title: string
  startAt: number
  endAt: number
  gmv: number
  sales: number
  views: number
  impressions: number
  currency: string
  products: LiveRoomProduct[]
  productsAt?: number
}

export type LiveSyncState = { accountId: string; status: 'running' | 'done' | 'failed'; done: number; total: number; error?: string }

/** 一行商品归到哪个款 */
export type LiveCodeShare = { code: string; sales: number; orders: number; gmv: number; exposures: number; clicks: number; buyers: number; estimated: boolean }

export type LiveRoomView = Omit<LiveRoom, 'products'> & { accountName: string; products: Array<LiveRoomProduct & { codes: LiveCodeShare[] }> }

export type LiveCodeTotals = { code: string; sessions: number; exposures: number; clicks: number; orders: number; buyers: number; sales: number; gmv: number; currency: string; lastAt: number; estimated: boolean }

export type LiveUnassigned = { productId: string; name: string; image?: string; sessions: number; sales: number; gmv: number; reason: 'noCode' | 'generic' }

export type LiveOverview = {
  accounts: LiveAccount[]
  rooms: LiveRoomView[]
  codes: LiveCodeTotals[]
  unassigned: LiveUnassigned[]
  totals: Array<{ currency: string; gmv: number; assignedGmv: number; sales: number; assignedSales: number }>
}

export type LiveOrderLine = { skuId: string; shopKey: string; orderId: string; quantity: number; amount: number; createdAt: number }

export type LiveMatchInput = {
  skus: SiPlatformSku[]
  mappings: Map<string, string>
  known: ReadonlySet<string>
  /** 直播时间段内、这些规格的订单行（只有多款共用的链接才用得到） */
  orders: (skuKeys: string[], from: number, to: number) => LiveOrderLine[]
}

/** 下播后这段时间内的付款仍算这一场 */
const ORDER_GRACE_MS = 10 * 60_000

type ProductCodes = { codes: Set<string>; skuCodes: Map<string, string>; skuKeys: string[] }

export function productCodesIndex(input: Pick<LiveMatchInput, 'skus' | 'mappings' | 'known'>): Map<string, ProductCodes> {
  const byProduct = new Map<string, SiPlatformSku[]>()
  for (const sku of input.skus) byProduct.set(sku.productId, [...(byProduct.get(sku.productId) || []), sku])
  const out = new Map<string, ProductCodes>()
  for (const [productId, skus] of byProduct) {
    const entry: ProductCodes = { codes: new Set(), skuCodes: new Map(), skuKeys: skus.map((sku) => sku.id) }
    for (const sku of skus) {
      const { code } = matchStoreSku({ title: sku.productName, sellerSku: sku.sellerSku, singleSku: skus.length === 1, manual: input.mappings.get(sku.id), known: input.known })
      if (!code) continue
      entry.codes.add(code)
      entry.skuCodes.set(sku.id, code)
    }
    out.set(productId, entry)
  }
  return out
}

/**
 * 一场里的一个商品归到款：
 * 直播商品的标题带款号，或所有规格同属一个款 → 整行归这个款（直播的真实数据）；
 * 一个链接有多个款（规格各填了款号）→ 成交按这段时间的订单拆（估算），曝光和点击拆不开，不给；
 * 认不出 → 空。
 */
export function shareRoomProduct(room: Pick<LiveRoom, 'startAt' | 'endAt'>, product: LiveRoomProduct, index: Map<string, ProductCodes>, input: LiveMatchInput): LiveCodeShare[] {
  const own = index.get(product.productId)
  const whole = (code: string): LiveCodeShare[] => [{ code, sales: product.sales, orders: product.orders, gmv: product.gmv, exposures: product.exposures, clicks: product.clicks, buyers: product.buyers, estimated: false }]
  if (!own) {
    const code = codeFromTitle(product.name, input.known)
    return code ? whole(code) : []
  }
  const complete = own.skuCodes.size === own.skuKeys.length
  if (own.codes.size === 1 && complete) return whole([...own.codes][0])
  const titleCode = codeFromTitle(product.name, input.known)
  if (own.codes.size <= 1 && titleCode) return whole(titleCode)
  if (!own.codes.size) return []
  const shares = new Map<string, LiveCodeShare>()
  for (const line of input.orders(own.skuKeys, room.startAt, room.endAt + ORDER_GRACE_MS)) {
    const code = own.skuCodes.get(`${line.shopKey}:${line.skuId}`)
    if (!code) continue
    const share = shares.get(code) || { code, sales: 0, orders: 0, gmv: 0, exposures: 0, clicks: 0, buyers: 0, estimated: true }
    share.sales += line.quantity
    share.orders += 1
    share.gmv += line.amount
    shares.set(code, share)
  }
  return [...shares.values()].sort((a, b) => b.sales - a.sales)
}

export function buildLiveOverview(accounts: LiveAccount[], rooms: LiveRoom[], input: LiveMatchInput, since = 0): LiveOverview {
  const index = productCodesIndex(input)
  const names = new Map(accounts.map((item) => [item.id, item.name || item.handle]))
  const codes = new Map<string, LiveCodeTotals & { rooms: Set<string> }>()
  const unassigned = new Map<string, LiveUnassigned & { rooms: Set<string> }>()
  const totals = new Map<string, LiveOverview['totals'][number]>()
  const views = rooms
    .filter((room) => names.has(room.accountId) && room.startAt >= since)
    .sort((a, b) => b.startAt - a.startAt)
    .map((room): LiveRoomView => {
      const total = totals.get(room.currency) || { currency: room.currency, gmv: 0, assignedGmv: 0, sales: 0, assignedSales: 0 }
      totals.set(room.currency, total)
      const products = room.products.map((product) => {
        const shares = shareRoomProduct(room, product, index, input)
        total.gmv += product.gmv
        total.sales += product.sales
        for (const share of shares) {
          const key = `${share.code}|${room.currency}`
          const entry = codes.get(key) || { code: share.code, sessions: 0, exposures: 0, clicks: 0, orders: 0, buyers: 0, sales: 0, gmv: 0, currency: room.currency, lastAt: 0, estimated: false, rooms: new Set<string>() }
          entry.rooms.add(room.id)
          entry.exposures += share.exposures
          entry.clicks += share.clicks
          entry.orders += share.orders
          entry.buyers += share.buyers
          entry.sales += share.sales
          entry.gmv += share.gmv
          entry.lastAt = Math.max(entry.lastAt, room.startAt)
          entry.estimated ||= share.estimated
          codes.set(key, entry)
        }
        // 按订单估算的可能比直播归因多，最多算到这一行的总数
        total.assignedGmv += Math.min(product.gmv, shares.reduce((sum, item) => sum + item.gmv, 0))
        total.assignedSales += Math.min(product.sales, shares.reduce((sum, item) => sum + item.sales, 0))
        if (!shares.length && !index.get(product.productId)?.codes.size) {
          const entry = unassigned.get(product.productId) || { productId: product.productId, name: product.name, image: product.image, sessions: 0, sales: 0, gmv: 0, reason: (index.get(product.productId)?.skuKeys.length || 0) > 1 ? 'generic' : 'noCode', rooms: new Set<string>() }
          entry.rooms.add(room.id)
          entry.sales += product.sales
          entry.gmv += product.gmv
          unassigned.set(product.productId, entry)
        }
        return { ...product, codes: shares }
      })
      return { ...room, accountName: names.get(room.accountId) || '', products }
    })
  const strip = <T extends { rooms: Set<string> }>({ rooms: set, ...rest }: T) => ({ ...rest, sessions: set.size })
  return {
    accounts,
    rooms: views,
    codes: [...codes.values()].map((item) => strip(item) as LiveCodeTotals).sort((a, b) => b.gmv - a.gmv),
    unassigned: [...unassigned.values()].map((item) => strip(item) as LiveUnassigned).sort((a, b) => b.gmv - a.gmv),
    totals: [...totals.values()],
  }
}

/* ------------------------------------------------------------------ 接口解析 */

const num = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const STATS = { gmv: 3, sales: 2, views: 20, impressions: 23 } as const

export function roomListBody(start: number, end: number, page: number, size: number) {
  return { time_selector: { time_range_period: 3, start_timestamp: String(start), end_timestamp: String(end), timezone: 'Asia/Bangkok' }, stats_types: Object.values(STATS), page_number: page, page_size: size, sort_key: 0, sort_order: 1 }
}

export function parseRoomList(json: unknown, accountId: string, currency: string): { rooms: LiveRoom[]; total: number } {
  const body = json as { code?: number; message?: string; data?: { room_level_detail_data?: Array<Record<string, unknown>>; total_count?: number } }
  if (Number(body?.code) !== 0) throw new Error(`LIVE_API_${body?.code ?? 'BAD'}:${String(body?.message || '').slice(0, 80)}`)
  const rooms = (body.data?.room_level_detail_data || []).map((item): LiveRoom => {
    const metric = (type: number) => num((item.analytics_metrics as Array<{ stats_type: number; raw_value: string }> | undefined)?.find((entry) => entry.stats_type === type)?.raw_value)
    return {
      id: String(item.room_id || ''),
      accountId,
      title: String(item.room_title || ''),
      startAt: num(item.room_create_timestamp),
      endAt: num(item.room_finish_timestamp),
      gmv: metric(STATS.gmv),
      sales: metric(STATS.sales),
      views: metric(STATS.views),
      impressions: metric(STATS.impressions),
      currency,
      products: [],
    }
  })
  return { rooms: rooms.filter((room) => room.id && room.startAt), total: num(body.data?.total_count) }
}

/** 商品 ID、名称、图、曝光、付款订单、GMV、点击、付款人数、加购、件数 */
const PRODUCT_STATS = [1, 2, 3, 10, 17, 21, 30, 41, 120, 345]

export function roomProductsBody(roomId: string) {
  return { request: { room_filter: { room_id: roomId }, stats_types: PRODUCT_STATS } }
}

export function parseRoomProducts(json: unknown): LiveRoomProduct[] {
  const body = json as { code?: number; message?: string; data?: { segments?: Array<{ stats?: Array<Record<string, unknown>> }> } }
  if (Number(body?.code) !== 0) throw new Error(`LIVE_API_${body?.code ?? 'BAD'}:${String(body?.message || '').slice(0, 80)}`)
  return (body.data?.segments || []).flatMap((segment) => segment.stats || []).map((item) => ({
    productId: String(item.id || ''),
    name: String(item.name || ''),
    image: item.cover_url ? String(item.cover_url) : undefined,
    exposures: num(item.exposure_cnt),
    clicks: num(item.total_click_cnt),
    carts: num(item.add_shop_cart_cnt),
    orders: num(item.paid_order_cnt),
    buyers: num(item.paid_user_cnt),
    sales: num(item.sales),
    gmv: num((item.gmv_local as { amount?: string } | undefined)?.amount),
  })).filter((item) => item.productId)
}

export function parseCreator(json: unknown): { handle: string; name: string; region: string; currency: string } | null {
  const body = json as { code?: number; data?: { handle?: { region?: string; currency_code?: string }; meta?: { handle?: string; alias?: string } } }
  const handle = String(body?.data?.meta?.handle || '').trim()
  if (Number(body?.code) !== 0 || !handle) return null
  return { handle, name: String(body.data?.meta?.alias || handle), region: String(body.data?.handle?.region || '').toUpperCase(), currency: String(body.data?.handle?.currency_code || '') }
}
