/**
 * 商品分析 (product card analysis): per-product funnel from Data Compass "Product card"
 * (`/api/v4/insights/seller/shop/product/card/list`, one request per shop-local day), and a
 * plain verdict per product so a seller sees at once which tests worked and what to restock.
 *
 * Rates are user based, like the seller center: viewers -> click users -> add-to-cart users -> buyers.
 */

export type PcDay = {
  shopKey: string
  productId: string
  date: string
  name: string
  image?: string
  views: number
  viewers: number
  clicks: number
  clickUsers: number
  cartAdds: number
  cartUsers: number
  buyers: number
  skuOrders: number
  gmv: number
}

export type PcTotals = Pick<PcDay, 'views' | 'viewers' | 'clicks' | 'clickUsers' | 'cartAdds' | 'cartUsers' | 'buyers' | 'skuOrders' | 'gmv'>

export type PcRates = {
  /** click users / viewers */
  ctr?: number
  /** add-to-cart users / click users */
  cartRate?: number
  /** buyers / add-to-cart users */
  cartToPay?: number
  /** buyers / click users */
  clickToPay?: number
  /** buyers / viewers */
  viewToPay?: number
  /** GMV per thousand viewers */
  gpm?: number
}

/**
 * winner: proven seller, restock and scale. potential: buyers like it, it needs more exposure.
 * leaky: people click but do not buy (price, images, reviews). weak: shown enough, nobody clicks.
 * steady: around the shop average. testing: not enough exposure to judge yet.
 */
export type PcVerdict = 'winner' | 'potential' | 'leaky' | 'weak' | 'steady' | 'testing'
export const PC_VERDICTS: PcVerdict[] = ['winner', 'potential', 'leaky', 'weak', 'steady', 'testing']

export type PcRestock = 'urgent' | 'soon' | 'ok' | 'unknown'

export type PcProduct = {
  key: string
  shopKey: string
  shopName: string
  productId: string
  name: string
  image?: string
  /** Unified SKU codes (seller SKU) of this product's variants. */
  codes: string[]
  totals: PcTotals
  rates: PcRates
  prevTotals: PcTotals
  prevRates: PcRates
  /** Change of viewers and GMV against the previous period. */
  viewersChange?: number
  gmvChange?: number
  /** Ratio to the shop average, 1 = average. */
  ctrIndex?: number
  clickToPayIndex?: number
  verdict: PcVerdict
  /** First day with exposure in the stored history; recent ones are new tests. */
  firstSeen?: string
  isNew: boolean
  stock?: number
  daysLeft?: number
  restock: PcRestock
  suggestQty: number
  /** Daily viewers and GMV over the period, for the sparkline and the detail chart. */
  daily: Array<{ date: string; viewers: number; clickUsers: number; cartUsers: number; buyers: number; gmv: number }>
}

export type PcOverview = {
  start: string
  end: string
  days: number
  shops: Array<{ shopKey: string; name: string; region: string }>
  totals: PcTotals
  rates: PcRates
  prevTotals: PcTotals
  prevRates: PcRates
  /** Shop-wide daily totals for the trend chart. */
  daily: Array<{ date: string; viewers: number; clickUsers: number; cartUsers: number; buyers: number; gmv: number }>
  products: PcProduct[]
  counts: Record<PcVerdict, number>
  /** Restock now: winners or potentials that run out within lead + safety days. */
  restockCount: number
  newCount: number
  lastFetchedAt?: number
  /** True when no product card data has been synced yet. */
  empty: boolean
}

/** Below this many viewers in the period a product is still "testing". */
export const PC_MIN_VIEWERS = 1000
/** "Clicks but no sales" needs at least this many buyers expected at the shop's conversion rate. */
export const PC_MIN_EXPECTED_BUYERS = 4
/** A product first seen within this many days counts as a new test. */
export const PC_NEW_DAYS = 14

export function emptyTotals(): PcTotals {
  return { views: 0, viewers: 0, clicks: 0, clickUsers: 0, cartAdds: 0, cartUsers: 0, buyers: 0, skuOrders: 0, gmv: 0 }
}

export function addTotals(target: PcTotals, row: PcTotals) {
  target.views += row.views
  target.viewers += row.viewers
  target.clicks += row.clicks
  target.clickUsers += row.clickUsers
  target.cartAdds += row.cartAdds
  target.cartUsers += row.cartUsers
  target.buyers += row.buyers
  target.skuOrders += row.skuOrders
  target.gmv += row.gmv
  return target
}

function ratio(part: number, whole: number) {
  return whole > 0 ? part / whole : undefined
}

export function ratesOf(totals: PcTotals): PcRates {
  return {
    ctr: ratio(totals.clickUsers, totals.viewers),
    cartRate: ratio(totals.cartUsers, totals.clickUsers),
    cartToPay: ratio(totals.buyers, totals.cartUsers),
    clickToPay: ratio(totals.buyers, totals.clickUsers),
    viewToPay: ratio(totals.buyers, totals.viewers),
    gpm: totals.viewers > 0 ? (totals.gmv / totals.viewers) * 1000 : undefined,
  }
}

function relative(value: number | undefined, base: number | undefined) {
  return value !== undefined && base ? value / base : undefined
}

/**
 * Verdict from the product's own funnel against its shop's average over the same days.
 * Rules are deliberately simple so the reason can be shown in one sentence.
 */
export function classifyProduct(totals: PcTotals, shop: PcRates): { verdict: PcVerdict; ctrIndex?: number; clickToPayIndex?: number } {
  const rates = ratesOf(totals)
  const ctrIndex = relative(rates.ctr, shop.ctr)
  const clickToPayIndex = relative(rates.clickToPay, shop.clickToPay)
  const cartIndex = relative(rates.cartRate, shop.cartRate)
  if (totals.viewers < PC_MIN_VIEWERS && totals.buyers < 3) return { verdict: 'testing', ctrIndex, clickToPayIndex }
  const ctr = ctrIndex ?? 0
  const pay = clickToPayIndex ?? 0
  // Buyers the product would have at the shop's own click-to-paid rate: below a few, 0 sales is not news.
  const expectedBuyers = totals.clickUsers * (shop.clickToPay ?? 0)
  if (totals.buyers >= 5 && pay >= 0.9 && ctr >= 0.8) return { verdict: 'winner', ctrIndex, clickToPayIndex }
  if (ctr < 0.7 && totals.buyers < 3) return { verdict: 'weak', ctrIndex, clickToPayIndex }
  if (expectedBuyers >= PC_MIN_EXPECTED_BUYERS && ctr >= 0.9 && pay < 0.6) return { verdict: 'leaky', ctrIndex, clickToPayIndex }
  if (ctr >= 1.15 && (pay >= 0.9 || (cartIndex ?? 0) >= 1)) return { verdict: 'potential', ctrIndex, clickToPayIndex }
  if (totals.buyers >= 3 && pay >= 1.2) return { verdict: 'potential', ctrIndex, clickToPayIndex }
  if (expectedBuyers < 3 && totals.buyers < 3) return { verdict: 'testing', ctrIndex, clickToPayIndex }
  return { verdict: 'steady', ctrIndex, clickToPayIndex }
}
