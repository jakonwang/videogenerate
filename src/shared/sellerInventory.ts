/**
 * Sales & inventory (销售与库存): one unified SKU code merges sales from every TikTok Shop
 * seller backend the user has logged in to, and keeps a stock ledger per code.
 *
 * Data sources (all read-only, from the seller center):
 * - order list  -> exact per-line sales for the recent window (today included)
 * - compass SKU list -> per-day SKU sales for older history (T+1)
 * - product list -> platform stock and the SKU id -> seller SKU code map
 */

export type SiOrderStatus = number

/** TikTok Shop line status codes seen in the seller order list. */
export const SI_ORDER_STATUS = {
  unpaid: 100,
  onHold: 105,
  awaitingShipment: 111,
  awaitingCollection: 112,
  partiallyShipping: 114,
  inTransit: 121,
  delivered: 122,
  completed: 130,
  cancelled: 140,
} as const

/** A line counts as a sale unless it is unpaid or cancelled. */
export function isCountedStatus(status: number) {
  return status !== SI_ORDER_STATUS.unpaid && status !== SI_ORDER_STATUS.cancelled
}

export type SiPlatformSku = {
  /** `${shopKey}:${skuId}` */
  id: string
  shopKey: string
  skuId: string
  productId: string
  productName: string
  skuName: string
  sellerSku: string
  image?: string
  price?: number
  stockTotal: number
  stockAvailable: number
  updatedAt: number
}

export type SiOrderLine = {
  /** `${shopKey}:${orderId}:${skuId}` */
  id: string
  shopKey: string
  orderId: string
  skuId: string
  sellerSku: string
  productName: string
  skuName: string
  image?: string
  quantity: number
  amount: number
  status: number
  createdAt: number
  /** Shop-local calendar date of `createdAt`. */
  date: string
}

export type SiCompassRow = {
  shopKey: string
  skuId: string
  productId: string
  productName: string
  skuName: string
  image?: string
  date: string
  gmv: number
  orders: number
  units: number
}

/** One aggregated day for one platform SKU, already merged from orders or compass. */
export type SiDailyRow = {
  shopKey: string
  skuId: string
  sellerSku: string
  date: string
  units: number
  amount: number
  orders: number
  cancelledUnits: number
}

export type SiStockMoveKind = 'count' | 'inbound' | 'adjust'

export type SiStockMove = {
  id: string
  code: string
  date: string
  kind: SiStockMoveKind
  /** count: the absolute stock; inbound: units added (>0); adjust: signed change. */
  quantity: number
  /** For `count`: units of `date` already sold when the count was saved (so later sales still deduct). */
  soldAtSave?: number
  unitCost?: number
  note?: string
  createdAt: number
}

export type SiSkuSettings = {
  code: string
  name?: string
  /** Purchase cost per unit, in shop currency; used for profit. */
  cost?: number
  leadDays?: number
  safetyDays?: number
  updatedAt: number
}

export type SiSettings = {
  leadDays: number
  safetyDays: number
  coverDays: number
  historyDays: number
  orderWindowDays: number
}

export const SI_DEFAULT_SETTINGS: SiSettings = {
  leadDays: 7,
  safetyDays: 7,
  coverDays: 30,
  historyDays: 90,
  orderWindowDays: 3,
}

export type SiShopState = {
  shopKey: string
  sellerId?: string
  /** First shop-local date fully covered by synced orders. */
  ordersFrom?: string
  ordersSyncedTo?: number
  lastSyncAt?: number
  lastSyncError?: string
  /** Steps that failed in the last sync while the rest succeeded (e.g. settlements). */
  stageErrors?: Partial<Record<SiSyncStage, string>>
  productCount?: number
  skuCount?: number
}

export type SiShop = {
  shopKey: string
  name: string
  region: string
  loginState: string
  timezone: string
  state: SiShopState
}

export type SiSyncStage = 'account' | 'products' | 'orders' | 'compass' | 'productCard' | 'shopDaily' | 'health' | 'finance'

/**
 * Data Compass shop metric ids (us_overview_stats). Checked against the page and against each
 * other: live + video + product card = GMV, buyers / visitors = conversion, GMV / SKU orders = AOV.
 */
export const SHOP_METRIC_IDS = {
  gmv: 4024,
  itemsSold: 4027,
  skuOrders: 4035,
  orders: 4031,
  buyers: 4022,
  visitors: 6070,
  impressions: 8020,
  uniqueImpressions: 8015,
  conversion: 6072,
  aov: 8024,
  liveGmv: 4029,
  videoGmv: 4037,
  cardGmv: 4033,
  affiliateLiveGmv: 4042,
  sellerLiveGmv: 4043,
  affiliateVideoGmv: 4045,
  sellerVideoGmv: 4046,
} as const

export type ShopMetricKey = keyof typeof SHOP_METRIC_IDS
export const SHOP_CURRENCY_METRICS: ShopMetricKey[] = ['gmv', 'aov', 'liveGmv', 'videoGmv', 'cardGmv', 'affiliateLiveGmv', 'sellerLiveGmv', 'affiliateVideoGmv', 'sellerVideoGmv']

export type SiShopDay = { shopKey: string; date: string; fetchedAt: number } & Record<ShopMetricKey, number>

export type ShopTotals = Record<ShopMetricKey, number>

export type ShopCard = {
  shop: SiShop
  today?: SiShopDay
  yesterday?: SiShopDay
  gmv7: number
  gmvPrev7: number
  spark: Array<{ date: string; gmv: number }>
  outOfStock: number
  reorder: number
  alerts: Array<{ kind: 'login' | 'syncFailed' | 'gmvDrop' | 'stock' | 'noData' | 'health' | 'urgentShip'; value?: number }>
  profit7?: number
  margin7?: number
  /** The most important analysis finding, shown on the card. */
  topFinding?: import('./shopAnalysis').Finding
}

export type ShopsOverview = {
  today: string
  cards: ShopCard[]
  total: { todayGmv: number; todayOrders: number; todayVisitors: number; yesterdayGmv: number; gmv7: number; gmvPrev7: number }
  syncing: boolean
}

export type ShopReport = {
  shop: SiShop
  today: string
  start: string
  end: string
  days: SiShopDay[]
  previous: SiShopDay[]
  totals: ShopTotals
  previousTotals: ShopTotals
  topSkus: SiCodeSummary[]
  outOfStock: number
  reorder: number
  analysis: import('./shopAnalysis').ShopAnalysis
  health?: import('./shopAnalysis').ShopHealth
}

/** Sums additive metrics; rates (conversion, AOV) are recomputed from the sums. */
export function sumShopDays(days: SiShopDay[]): ShopTotals {
  const totals = Object.fromEntries(Object.keys(SHOP_METRIC_IDS).map((key) => [key, 0])) as ShopTotals
  for (const day of days) {
    for (const key of Object.keys(SHOP_METRIC_IDS) as ShopMetricKey[]) {
      if (key === 'conversion' || key === 'aov') continue
      totals[key] += Number(day[key]) || 0
    }
  }
  totals.conversion = totals.visitors > 0 ? totals.buyers / totals.visitors : 0
  totals.aov = totals.skuOrders > 0 ? totals.gmv / totals.skuOrders : 0
  return totals
}

export type SiSyncProgress = {
  shopKey: string
  status: 'running' | 'done' | 'failed'
  stage?: SiSyncStage
  detail?: string
  startedAt: number
  finishedAt?: number
  error?: string
  /** Steps that failed without stopping the sync. */
  stageErrors?: Partial<Record<SiSyncStage, string>>
  /** True for the automatic hourly update, so pages can stay quiet about it. */
  automatic?: boolean
}

export type SiRisk = 'out' | 'urgent' | 'reorder' | 'healthy' | 'overstock' | 'unknown'
export type SiTag = 'hot' | 'rising' | 'stable' | 'declining' | 'slow' | 'new' | 'none'

export type SiCodeSummary = {
  /** Unified code, or `#skuId` while the platform SKU is not mapped yet. */
  key: string
  mapped: boolean
  name: string
  image?: string
  skuKeys: string[]
  unitsToday: number
  amountToday: number
  unitsYesterday: number
  units7: number
  unitsPrev7: number
  amount7: number
  units30: number
  amount30: number
  orders7: number
  growth7?: number
  avgDaily: number
  stock?: number
  stockSource: 'ledger' | 'platform' | 'none'
  platformStock: number
  daysLeft?: number
  reorderPoint: number
  suggestQty: number
  leadDays: number
  safetyDays: number
  cost?: number
  risk: SiRisk
  tag: SiTag
  firstSaleDate?: string
  lastSaleDate?: string
  shops: Array<{ shopKey: string; units7: number }>
}

export type SiDashboard = {
  today: string
  rangeStart: string
  dates: string[]
  shops: SiShop[]
  items: SiCodeSummary[]
  kpi: {
    amountToday: number
    unitsToday: number
    ordersToday: number
    amountYesterday: number
    unitsYesterday: number
    amount7: number
    amountPrev7: number
    reorderCount: number
    outCount: number
    hotCount: number
    unmappedCount: number
  }
  /** key -> date -> units/amount, for the daily matrix and charts. */
  matrix: Record<string, Record<string, { units: number; amount: number }>>
  settings: SiSettings
  lastSyncAt?: number
}

export type SiMappingRow = {
  skuKey: string
  shopKey: string
  shopName: string
  skuId: string
  productName: string
  skuName: string
  image?: string
  sellerSku: string
  mappedCode?: string
  suggestion?: string
  units30: number
}

export type SiAddMoveInput = {
  code: string
  date: string
  kind: SiStockMoveKind
  quantity: number
  unitCost?: number
  note?: string
}

// ---------------------------------------------------------------------------
// Pure helpers (shared by main process and tests)
// ---------------------------------------------------------------------------

export function normalizeCode(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 80)
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + Math.trunc(days))
  return value.toISOString().slice(0, 10)
}

export function dateRange(start: string, end: string) {
  const out: string[] = []
  for (let day = start; day <= end && out.length < 1000; day = shiftDate(day, 1)) out.push(day)
  return out
}

export function isValidDate(value: unknown) {
  const text = String(value ?? '')
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text
}

/** Calendar date of an instant in an IANA time zone. */
const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** Calendar date of an instant in an IANA time zone. Formatters are reused: creating one is slow. */
export function zonedDate(ms: number, timeZone: string) {
  try {
    let formatter = dateFormatters.get(timeZone)
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      dateFormatters.set(timeZone, formatter)
    }
    const parts = formatter.formatToParts(new Date(ms))
    const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * Guesses a unified code for a platform SKU without a seller SKU: single-SKU products whose
 * title ends with a code such as "... A-152" get that code.
 */
export function suggestCode(input: { productName: string; sellerSku: string; singleSku: boolean }) {
  if (input.sellerSku) return normalizeCode(input.sellerSku)
  if (!input.singleSku) return undefined
  const match = /(?:^|\s)([A-Za-z]{1,4}-?\d{1,6}[A-Za-z]?)\s*$/.exec(String(input.productName || '').trim())
  return match ? normalizeCode(match[1]) : undefined
}

type CodeResolver = (shopKey: string, skuId: string, sellerSku: string) => { key: string; mapped: boolean }

export function makeCodeResolver(mappings: Map<string, string>): CodeResolver {
  const seen = new Map<string, { key: string; mapped: boolean }>()
  return (shopKey, skuId, sellerSku) => {
    const cacheKey = `${shopKey}|${skuId}|${sellerSku}`
    const hit = seen.get(cacheKey)
    if (hit) return hit
    const manual = mappings.get(`${shopKey}:${skuId}`)
    const code = manual ? '' : normalizeCode(sellerSku)
    const result = manual ? { key: manual, mapped: true } : code ? { key: code, mapped: true } : { key: `#${skuId}`, mapped: false }
    seen.set(cacheKey, result)
    return result
  }
}

/**
 * Current stock of one code from its ledger. The latest count resets the balance; inbound and
 * adjust moves after it change it; every unit sold after the count is deducted.
 */
export function ledgerStock(moves: SiStockMove[], unitsByDate: Map<string, number>) {
  const sorted = [...moves].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  let lastCountIndex = -1
  sorted.forEach((move, index) => { if (move.kind === 'count') lastCountIndex = index })
  if (lastCountIndex < 0) {
    // Without a count only inbound/adjust is known; that is not a full balance.
    return undefined
  }
  const count = sorted[lastCountIndex]
  let stock = count.quantity
  for (const move of sorted.slice(lastCountIndex + 1)) {
    stock += move.kind === 'inbound' ? Math.abs(move.quantity) : move.quantity
  }
  for (const [date, units] of unitsByDate) {
    if (date > count.date) stock -= units
    else if (date === count.date) stock -= Math.max(0, units - (count.soldAtSave ?? units))
  }
  return Math.round(stock)
}

function growth(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? undefined : 0
  return (current - previous) / previous
}

export function classifyTag(input: { units7: number; unitsPrev7: number; units14: number; stock?: number; firstSaleDate?: string; today: string; hotThreshold: number }): SiTag {
  const change = growth(input.units7, input.unitsPrev7)
  if (input.firstSaleDate && input.firstSaleDate > shiftDate(input.today, -14) && input.units7 > 0) {
    return input.units7 >= input.hotThreshold && input.units7 >= 20 ? 'hot' : 'new'
  }
  if (input.units14 === 0) return (input.stock ?? 0) > 0 ? 'slow' : 'none'
  if (input.units7 >= Math.max(20, input.hotThreshold) && (change === undefined || change >= 0.5)) return 'hot'
  if (input.units7 >= 5 && (change === undefined || change >= 0.3)) return 'rising'
  if (input.unitsPrev7 >= 10 && change !== undefined && change <= -0.3) return 'declining'
  return input.units7 > 0 ? 'stable' : 'none'
}

export function classifyRisk(input: { stock?: number; avgDaily: number; leadDays: number; reorderPoint: number; units30: number }): { risk: SiRisk; daysLeft?: number } {
  if (input.stock === undefined) return { risk: 'unknown' }
  if (input.stock <= 0) return { risk: input.units30 > 0 || input.avgDaily > 0 ? 'out' : 'unknown', daysLeft: 0 }
  if (input.avgDaily <= 0) return { risk: 'healthy' }
  const daysLeft = input.stock / input.avgDaily
  if (daysLeft <= input.leadDays) return { risk: 'urgent', daysLeft }
  if (input.stock <= input.reorderPoint) return { risk: 'reorder', daysLeft }
  if (daysLeft > 90) return { risk: 'overstock', daysLeft }
  return { risk: 'healthy', daysLeft }
}

export type BuildDashboardInput = {
  today: string
  days: number
  shops: SiShop[]
  platformSkus: SiPlatformSku[]
  daily: SiDailyRow[]
  mappings: Map<string, string>
  moves: SiStockMove[]
  skuSettings: SiSkuSettings[]
  settings: SiSettings
}

export function buildDashboard(input: BuildDashboardInput): SiDashboard {
  const resolve = makeCodeResolver(input.mappings)
  const today = input.today
  const yesterday = shiftDate(today, -1)
  const rangeStart = shiftDate(today, -(Math.max(7, Math.min(input.settings.historyDays, input.days)) - 1))
  // 7 / 14 / 30-day figures use complete days (up to yesterday): today is still running, and
  // comparing a partial day with full ones made everything look like it was shrinking.
  const d7 = shiftDate(today, -7)
  const d14 = shiftDate(today, -14)
  const d30 = shiftDate(today, -30)
  const prev7Start = shiftDate(today, -14)
  const prev7End = shiftDate(today, -8)
  const settingsByCode = new Map(input.skuSettings.map((item) => [item.code, item]))
  const movesByCode = new Map<string, SiStockMove[]>()
  for (const move of input.moves) movesByCode.set(move.code, [...(movesByCode.get(move.code) || []), move])

  type Acc = {
    key: string
    mapped: boolean
    name: string
    image?: string
    skuKeys: Set<string>
    unitsByDate: Map<string, number>
    amountByDate: Map<string, number>
    ordersByDate: Map<string, number>
    shopUnits7: Map<string, number>
    platformStock: number
    hasPlatform: boolean
  }
  const accs = new Map<string, Acc>()
  const ensure = (key: string, mapped: boolean) => {
    let acc = accs.get(key)
    if (!acc) {
      acc = { key, mapped, name: '', skuKeys: new Set(), unitsByDate: new Map(), amountByDate: new Map(), ordersByDate: new Map(), shopUnits7: new Map(), platformStock: 0, hasPlatform: false }
      accs.set(key, acc)
    }
    return acc
  }

  for (const sku of input.platformSkus) {
    const { key, mapped } = resolve(sku.shopKey, sku.skuId, sku.sellerSku)
    const acc = ensure(key, mapped)
    acc.skuKeys.add(sku.id)
    acc.hasPlatform = true
    acc.platformStock += Math.max(0, sku.stockAvailable)
    if (!acc.name) acc.name = sku.skuName && sku.skuName !== 'Mặc định' && sku.skuName !== 'Default' ? `${sku.productName} · ${sku.skuName}` : sku.productName
    if (!acc.image && sku.image) acc.image = sku.image
  }

  // Compass rows only carry the platform SKU id; the product list knows its seller SKU.
  const sellerSkuById = new Map(input.platformSkus.map((sku) => [sku.id, sku.sellerSku]))
  const kpi = { amountToday: 0, unitsToday: 0, ordersToday: 0, amountYesterday: 0, unitsYesterday: 0, amount7: 0, amountPrev7: 0, reorderCount: 0, outCount: 0, hotCount: 0, unmappedCount: 0 }
  for (const row of input.daily) {
    const { key, mapped } = resolve(row.shopKey, row.skuId, row.sellerSku || sellerSkuById.get(`${row.shopKey}:${row.skuId}`) || '')
    const acc = ensure(key, mapped)
    acc.skuKeys.add(`${row.shopKey}:${row.skuId}`)
    acc.unitsByDate.set(row.date, (acc.unitsByDate.get(row.date) || 0) + row.units)
    acc.amountByDate.set(row.date, (acc.amountByDate.get(row.date) || 0) + row.amount)
    acc.ordersByDate.set(row.date, (acc.ordersByDate.get(row.date) || 0) + row.orders)
    if (row.date >= d7 && row.date <= yesterday) acc.shopUnits7.set(row.shopKey, (acc.shopUnits7.get(row.shopKey) || 0) + row.units)
    if (row.date === today) { kpi.amountToday += row.amount; kpi.unitsToday += row.units; kpi.ordersToday += row.orders }
    if (row.date === yesterday) { kpi.amountYesterday += row.amount; kpi.unitsYesterday += row.units }
    if (row.date >= d7 && row.date <= yesterday) kpi.amount7 += row.amount
    else if (row.date >= prev7Start && row.date <= prev7End) kpi.amountPrev7 += row.amount
  }

  const sum = (map: Map<string, number>, from: string, to = yesterday) => {
    let total = 0
    for (const [date, value] of map) if (date >= from && date <= to) total += value
    return total
  }

  // Top-20% threshold of 7-day units among codes that sold.
  const sold7 = [...accs.values()].map((acc) => sum(acc.unitsByDate, d7)).filter((value) => value > 0).sort((a, b) => b - a)
  const hotThreshold = sold7.length ? sold7[Math.max(0, Math.ceil(sold7.length * 0.2) - 1)] : Infinity

  const items: SiCodeSummary[] = []
  const matrix: SiDashboard['matrix'] = {}
  for (const acc of accs.values()) {
    const own = acc.mapped ? settingsByCode.get(acc.key) : undefined
    const leadDays = Math.max(0, own?.leadDays ?? input.settings.leadDays)
    const safetyDays = Math.max(0, own?.safetyDays ?? input.settings.safetyDays)
    const units7 = sum(acc.unitsByDate, d7)
    const unitsPrev7 = sum(acc.unitsByDate, prev7Start, prev7End)
    const units14 = sum(acc.unitsByDate, d14)
    const units30 = sum(acc.unitsByDate, d30)
    const saleDates = [...acc.unitsByDate.entries()].filter(([, units]) => units > 0).map(([date]) => date).sort()
    const firstSaleDate = saleDates[0]
    // Average over the last 14 complete days, or since the first sale when the SKU is newer.
    const window = firstSaleDate && firstSaleDate > d14 ? Math.max(1, daysBetween(firstSaleDate, today)) : 14
    const avgDaily = units14 / window
    const moves = acc.mapped ? movesByCode.get(acc.key) || [] : []
    const ledger = ledgerStock(moves, acc.unitsByDate)
    const stockSource: SiCodeSummary['stockSource'] = ledger !== undefined ? 'ledger' : acc.hasPlatform ? 'platform' : 'none'
    const effectiveStock = ledger ?? (acc.hasPlatform ? acc.platformStock : undefined)
    const reorderPoint = Math.ceil(avgDaily * (leadDays + safetyDays))
    const suggestQty = Math.max(0, Math.ceil(avgDaily * (leadDays + safetyDays + input.settings.coverDays) - Math.max(0, effectiveStock ?? 0)))
    const { risk, daysLeft } = classifyRisk({ stock: effectiveStock, avgDaily, leadDays, reorderPoint, units30 })
    const tag = classifyTag({ units7, unitsPrev7, units14, stock: effectiveStock, firstSaleDate, today, hotThreshold })
    if (!acc.mapped) kpi.unmappedCount += 1
    if (risk === 'out') kpi.outCount += 1
    if (risk === 'urgent' || risk === 'reorder') kpi.reorderCount += 1
    if (tag === 'hot') kpi.hotCount += 1
    items.push({
      key: acc.key,
      mapped: acc.mapped,
      name: own?.name || acc.name || acc.key,
      image: acc.image,
      skuKeys: [...acc.skuKeys],
      unitsToday: acc.unitsByDate.get(today) || 0,
      amountToday: acc.amountByDate.get(today) || 0,
      unitsYesterday: acc.unitsByDate.get(yesterday) || 0,
      units7,
      unitsPrev7,
      amount7: sum(acc.amountByDate, d7),
      units30,
      amount30: sum(acc.amountByDate, d30),
      orders7: sum(acc.ordersByDate, d7),
      growth7: growth(units7, unitsPrev7),
      avgDaily,
      stock: effectiveStock,
      stockSource,
      platformStock: acc.platformStock,
      daysLeft,
      reorderPoint,
      suggestQty: risk === 'out' || risk === 'urgent' || risk === 'reorder' ? suggestQty : 0,
      leadDays,
      safetyDays,
      cost: own?.cost,
      risk,
      tag,
      firstSaleDate,
      lastSaleDate: saleDates[saleDates.length - 1],
      shops: [...acc.shopUnits7.entries()].map(([shopKey, units]) => ({ shopKey, units7: units })).sort((a, b) => b.units7 - a.units7),
    })
    const cells: Record<string, { units: number; amount: number }> = {}
    for (const [date, units] of acc.unitsByDate) {
      if (date >= rangeStart && date <= today) cells[date] = { units, amount: acc.amountByDate.get(date) || 0 }
    }
    matrix[acc.key] = cells
  }

  // Codes with neither sales nor stock in the window are noise for the list.
  const visible = items.filter((item) => item.units30 > 0 || (item.stock ?? 0) > 0 || item.stockSource === 'ledger')
  visible.sort((a, b) => b.amount7 - a.amount7 || b.units30 - a.units30 || a.key.localeCompare(b.key))
  const lastSyncAt = input.shops.reduce<number | undefined>((latest, shop) => Math.max(latest || 0, shop.state.lastSyncAt || 0) || latest, undefined)
  return {
    today,
    rangeStart,
    dates: dateRange(rangeStart, today),
    shops: input.shops,
    items: visible,
    kpi: { ...kpi, unmappedCount: visible.filter((item) => !item.mapped).length },
    matrix,
    settings: input.settings,
    lastSyncAt,
  }
}
