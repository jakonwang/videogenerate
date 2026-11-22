import { randomUUID } from 'node:crypto'
import { creatorHubRepo } from '../tiktok-creator-hub/repo'
import {
  buildDashboard,
  dateRange,
  isValidDate,
  normalizeCode,
  shiftDate,
  suggestCode,
  zonedDate,
  makeCodeResolver,
  sumShopDays,
  type ShopCard,
  type ShopReport,
  type ShopsOverview,
  type SiAddMoveInput,
  type SiShopDay,
  type SiDailyRow,
  type SiMappingRow,
  type SiSettings,
  type SiShop,
  type SiShopState,
  type SiStockMove,
  type SiSyncProgress,
  type SiSyncStage,
} from '../../../shared/sellerInventory'
import { openSellerCenter, SellerSession } from './browser'
import { parseCompassPage, parseOrderPage, parseProductPage, parseProductSkus, parseSellerId, parseSettlementPage, parseShopHealth, parseShopStatsMulti, shopStatsBodyMulti, toPlatformSku } from './parser'
import { buildProfitDays, learnFeeRate, profitTotals, type GmvStoreOption, type ShopAdLink, type ShopProfit } from '../../../shared/shopProfit'
import { gmvAds } from './gmvAds'
import { analyzeShop, type MorningReport, type ReportSettings, type ShopAnalysis } from '../../../shared/shopAnalysis'
import { actionText, buildReportCard, findingText, reportNotification } from '../../../shared/shopReportText'
import type { BusinessShops } from '../../../shared/cloud/selling'
import { sellerInventoryRepo as repo } from './repo'

const DEFAULT_TZ = 'Asia/Ho_Chi_Minh'
const PRODUCT_PAGE_SIZE = 50
const ORDER_PAGE_SIZE = 100
const COMPASS_PAGE_SIZE = 100
const MAX_ORDER_PAGES = 800
const MAX_COMPASS_DAYS_PER_SYNC = 120
/** Recent orders are re-read on every sync so later cancellations are picked up. */
const ORDER_REFRESH_DAYS = 3
const API_DELAY_MS = 150
/** Seller-center calls run this many at a time per shop (measured: 8 in parallel take about as long as 1). */
const CONCURRENCY = 4
/** Days of shop stats per request: the stats API takes several query conditions at once. */
const SHOP_DAYS_PER_REQUEST = 30

/** Timeouts, network errors and server errors are retried (twice, with a short pause); a login problem is not. */
function withRetries<T extends Pick<SellerSession, 'open' | 'api' | 'close'>>(session: T): T {
  const transient = (error: unknown) => /SELLER_API_HTTP_(0|-1|429|5\d\d)|SELLER_API_BAD_JSON/.test(String((error as Error)?.message || error))
  return {
    ...session,
    open: session.open.bind(session),
    close: session.close.bind(session),
    api: async (input: Parameters<SellerSession['api']>[0]) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await session.api(input)
        } catch (error) {
          if (attempt >= 2 || !transient(error)) throw error
          await deps.delay(1000 * (attempt + 1))
        }
      }
    },
  }
}

/** Runs `task` over `items`, `limit` at a time, keeping the input order of results. */
async function pool<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

type ShopRecord = { id: string; name: string; region: string; loginState: string; timezone?: string; shopId?: string }

type Dependencies = {
  now: () => number
  listShops: () => ShopRecord[]
  createSession: (target: { shopKey: string; region: string }) => Pick<SellerSession, 'open' | 'api' | 'close'>
  delay: (ms: number) => Promise<void>
  /** The login is shared with the creator hub, so its status is updated there too. */
  markLogin: (shopKey: string, state: 'valid' | 'expired') => void
  /** Desktop notification and Feishu delivery for the morning report (shared app settings). */
  deliver: (report: MorningReport, settings: ReportSettings) => Promise<MorningReport['delivered']>
}

async function defaultDeliver(report: MorningReport, settings: ReportSettings): Promise<MorningReport['delivered']> {
  const { contentHubService } = await import('../content-hub/service')
  const { sendFeishuMessage } = await import('../content-hub/feishuPush')
  const automation = await contentHubService.getAutomationSettings()
  const delivered: MorningReport['delivered'] = {}
  if (settings.desktop && automation.desktopNotifications) {
    const { Notification, BrowserWindow } = await import('electron')
    if (Notification.isSupported()) {
      const message = reportNotification(report)
      const notification = new Notification({ title: message.title, body: message.body })
      notification.on('click', () => {
        const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
        if (!window) return
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
        void window.webContents.executeJavaScript("window.location.hash = '#/shops'").catch(() => undefined)
      })
      notification.show()
      delivered.desktop = true
    }
  }
  if (settings.feishu && automation.feishu.enabled && automation.feishu.webhookUrl) {
    try {
      const region = report.shops[0]?.region || 'VN'
      const currency = ({ VN: '₫', TH: '฿', MY: 'RM', PH: '₱', ID: 'Rp', SG: 'S$', US: '$', GB: '£' } as Record<string, string>)[region.toUpperCase()] || ''
      await sendFeishuMessage(automation.feishu, buildReportCard(report, 'zh-CN', currency))
      delivered.feishu = true
    } catch (error) {
      delivered.feishuError = error instanceof Error ? error.message : String(error)
    }
  }
  return delivered
}

let deps: Dependencies = {
  now: () => Date.now(),
  listShops: () => creatorHubRepo.listShops().map((shop) => ({ id: shop.id, name: shop.name, region: shop.region, loginState: shop.loginState, timezone: shop.timezone, shopId: shop.shopId })),
  createSession: (target) => new SellerSession(target),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  markLogin: (shopKey, state) => {
    const shop = creatorHubRepo.getShop(shopKey)
    if (shop) creatorHubRepo.saveShop({ ...shop, loginState: state, lastVerifiedAt: Date.now(), updatedAt: Date.now() })
  },
  deliver: defaultDeliver,
}

export function setSellerInventoryDependenciesForTest(next: Partial<Dependencies>) {
  deps = { ...deps, ...next }
}

const progress = new Map<string, SiSyncProgress>()
let schedulerTimer: ReturnType<typeof setInterval> | null = null
let reportRunning = false

function tzOf(shop: ShopRecord) {
  return shop.timezone || DEFAULT_TZ
}

function businessTimeZone(shops: ShopRecord[]) {
  return shops[0] ? tzOf(shops[0]) : DEFAULT_TZ
}

function requireShop(shopKey: string) {
  const shop = deps.listShops().find((item) => item.id === shopKey)
  if (!shop) throw new Error('SELLER_INVENTORY_SHOP_NOT_FOUND')
  return shop
}

function toShop(shop: ShopRecord): SiShop {
  return { shopKey: shop.id, name: shop.name, region: shop.region, loginState: shop.loginState, timezone: tzOf(shop), state: repo.getShopState(shop.id) }
}

function sellerQuery(state: SiShopState, shop: ShopRecord) {
  return {
    ...(state.sellerId ? { oec_seller_id: state.sellerId, seller_id: state.sellerId } : {}),
    timezone_name: tzOf(shop),
  }
}

/** Offset of `timeZone` from UTC at instant `ms`. */
function tzOffsetMs(ms: number, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(ms / 1000) * 1000
  } catch {
    return 0
  }
}

/** Start of the shop-local day `date`, as an instant. */
export function dayStartMs(date: string, timeZone: string) {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`)
  return utcMidnight - tzOffsetMs(utcMidnight, timeZone)
}

async function syncAccount(session: Pick<SellerSession, 'open' | 'api'>, shop: ShopRecord, state: SiShopState) {
  const json = await session.api({ method: 'POST', path: '/api/v1/seller/workbench/get_all_sellers', body: {} })
  const seller = parseSellerId(json, shop.region)
  if (!seller?.sellerId) throw new Error('SELLER_ACCOUNT_NOT_FOUND')
  state.sellerId = seller.sellerId
}

async function syncProducts(session: Pick<SellerSession, 'api'>, shop: ShopRecord, state: SiShopState, report: (detail: string) => void) {
  const now = deps.now()
  const rows = new Map<string, ReturnType<typeof toPlatformSku> & object>()
  const fetchPage = async (page: number) => parseProductPage(await session.api({
    method: 'GET',
    path: '/api/v1/product/local/products/list',
    query: { ...sellerQuery(state, shop), profile: '1', tab_id: '1', page_number: String(page), page_size: String(PRODUCT_PAGE_SIZE), sku_number: '1', product_sort_fields: '3', product_sort_types: '0' },
  }))
  const first = await fetchPage(1)
  const pageCount = Math.min(400, Math.max(1, Math.ceil(first.total / PRODUCT_PAGE_SIZE)))
  const rest = await pool(Array.from({ length: pageCount - 1 }, (_, index) => index + 2), CONCURRENCY, async (page) => {
    const parsed = await fetchPage(page)
    report(`${Math.min(first.total, page * PRODUCT_PAGE_SIZE)}/${first.total}`)
    return parsed
  })
  const products = [first, ...rest].flatMap((page) => page.products)
  report(`${products.length}/${first.total}`)
  // Products with more SKUs than the list shows are expanded, a few at a time.
  const expanded = await pool(products, CONCURRENCY, async ({ product, skus, totalSkuCount }) => {
    if (totalSkuCount <= skus.length) return skus
    return parseProductSkus(await session.api({
      method: 'GET',
      path: '/api/v1/product/local/product/skus/list',
      query: { ...sellerQuery(state, shop), product_id: String(product.product_id), tab_id: '1', is_online_version: 'true', need_dt_warehouse: 'false', sku_fetch_condition: '2' },
    }))
  })
  products.forEach(({ product }, index) => {
    for (const sku of expanded[index]) {
      const row = toPlatformSku(shop.id, product, sku, now)
      if (row) rows.set(row.id, row)
    }
  })
  repo.upsertPlatformSkus([...rows.values()])
  repo.prunePlatformSkus(shop.id, new Set(rows.keys()))
  state.productCount = products.length
  state.skuCount = rows.size
}

async function syncOrders(session: Pick<SellerSession, 'api'>, shop: ShopRecord, state: SiShopState, settings: SiSettings, report: (detail: string) => void) {
  const timeZone = tzOf(shop)
  const today = zonedDate(deps.now(), timeZone)
  const initialFrom = shiftDate(today, -(Math.max(1, settings.orderWindowDays) - 1))
  // Continue from where the last sync stopped, re-reading the last week for status changes.
  const lastCovered = state.ordersSyncedTo ? zonedDate(state.ordersSyncedTo, timeZone) : undefined
  const from = lastCovered ? shiftDate(lastCovered, -ORDER_REFRESH_DAYS) : initialFrom
  const fromMs = dayStartMs(from, timeZone)
  let lines = 0
  const startedAt = deps.now()
  const fetchPage = async (page: number) => parseOrderPage(await session.api({
    method: 'POST',
    path: '/api/fulfillment/order/list',
    query: sellerQuery(state, shop),
    // Newest first; offset paging lets several pages load at once.
    body: { search_condition: { condition_list: {} }, offset: page * ORDER_PAGE_SIZE, count: ORDER_PAGE_SIZE, sort_info: '6', search_cursor: '', pagination_type: 0 },
  }), shop.id, timeZone)
  for (let page = 0; page < MAX_ORDER_PAGES; page += CONCURRENCY) {
    const batch = await pool(Array.from({ length: CONCURRENCY }, (_, index) => page + index), CONCURRENCY, fetchPage)
    let done = false
    for (const parsed of batch) {
      const kept = parsed.lines.filter((line) => line.createdAt >= fromMs)
      repo.upsertOrderLines(kept)
      lines += kept.length
      if (!parsed.orderCount || parsed.orderCount < ORDER_PAGE_SIZE || (parsed.oldestCreatedAt !== undefined && parsed.oldestCreatedAt < fromMs)) done = true
    }
    report(`${lines}`)
    if (done) break
    await deps.delay(API_DELAY_MS)
  }
  // Coverage is continuous from the first synced day: later syncs always overlap the previous one.
  if (!state.ordersFrom) state.ordersFrom = from
  state.ordersSyncedTo = startedAt
}

async function syncCompass(session: Pick<SellerSession, 'api'>, shop: ShopRecord, state: SiShopState, settings: SiSettings, report: (detail: string) => void) {
  const timeZone = tzOf(shop)
  const today = zonedDate(deps.now(), timeZone)
  const historyStart = shiftDate(today, -(Math.max(7, settings.historyDays) - 1))
  // Compass only fills the days before order coverage starts.
  const end = state.ordersFrom ? shiftDate(state.ordersFrom, -1) : shiftDate(today, -1)
  if (end < historyStart) return
  const fetched = repo.compassFetchedDates(shop.id)
  // A day is final once it was fetched at least two days after it ended.
  const missing = dateRange(historyStart, end).filter((date) => {
    const at = fetched.get(date)
    return !at || zonedDate(at, timeZone) < shiftDate(date, 2)
  }).reverse().slice(0, MAX_COMPASS_DAYS_PER_SYNC)
  let done = 0
  await pool(missing, CONCURRENCY, async (date) => {
    const rows = []
    for (let page = 0; page < 50; page += 1) {
      const json = await session.api({
        method: 'POST',
        path: '/api/v2/insights/seller/ttp/product/sku/list',
        query: { ...sellerQuery(state, shop), use_content_type_definition: '1' },
        headers: { 'x-tt-oec-region': shop.region.toUpperCase() },
        // The end date is exclusive: one day is [date, date + 1).
        body: { request: { time_descriptor: { start: date, end: shiftDate(date, 1) }, search: {}, filter: {}, list_control: { rules: [{ direction: 2, field: 'sku_gmv' }], pagination: { size: COMPASS_PAGE_SIZE, page } } } },
      })
      const pageRows = parseCompassPage(json, shop.id, date)
      rows.push(...pageRows)
      if (pageRows.length < COMPASS_PAGE_SIZE) break
    }
    repo.replaceCompassDay(shop.id, date, rows, deps.now())
    done += 1
    report(`${done}/${missing.length}`)
  })
}

/** Shop KPIs per day from Data Compass. Today and yesterday are real time and are re-read on every sync. */
async function syncShopDaily(session: Pick<SellerSession, 'api'>, shop: ShopRecord, state: SiShopState, settings: SiSettings, report: (detail: string) => void) {
  const timeZone = tzOf(shop)
  const now = deps.now()
  const today = zonedDate(now, timeZone)
  const start = shiftDate(today, -(Math.max(7, settings.historyDays) - 1))
  const fetched = repo.shopDayFetchedAt(shop.id)
  const offsetMinutes = Math.round(tzOffsetMs(now, timeZone) / 60_000)
  const readyDate = shiftDate(today, -2)
  // Newest first, so a long first sync shows the recent days early.
  const dates = dateRange(start, today).filter((date) => {
    const at = fetched.get(date)
    return !at || zonedDate(at, timeZone) < shiftDate(date, 2)
  }).reverse()
  const chunks: string[][] = []
  for (let index = 0; index < dates.length; index += SHOP_DAYS_PER_REQUEST) chunks.push(dates.slice(index, index + SHOP_DAYS_PER_REQUEST))
  let done = 0
  await pool(chunks, CONCURRENCY, async (chunk) => {
    const json = await session.api({
      method: 'POST',
      path: '/api/v2/insights/seller/unified/query/us_overview_stats',
      query: { ...sellerQuery(state, shop), use_content_type_definition: '1' },
      headers: { 'x-tt-oec-region': shop.region.toUpperCase() },
      body: shopStatsBodyMulti(chunk, readyDate, offsetMinutes),
    })
    const days = parseShopStatsMulti(json, shop.id, chunk, deps.now())
    if (days.length) repo.upsertShopDays(days)
    done += chunk.length
    report(`${done}/${dates.length}`)
  })
}

const REGION_CURRENCY: Record<string, string> = { VN: 'VND', TH: 'THB', MY: 'MYR', PH: 'PHP', ID: 'IDR', SG: 'SGD', US: 'USD', GB: 'GBP' }
const SETTLEMENT_PAGE = 200
const MAX_PENDING_PAGES = 30
const MAX_SETTLED_PAGES = 12

/** Settlements: every pending record (they change), and settled ones until we reach what we already have. */
async function syncFinance(session: Pick<SellerSession, 'api'>, shop: ShopRecord, state: SiShopState, report: (detail: string) => void) {
  const timeZone = tzOf(shop)
  const base = { ...sellerQuery(state, shop), no_need_sku_record: 'true', pagination_type: '1', terminal_type: '1', statement_version: '0', need_total_amount: 'false', size: String(SETTLEMENT_PAGE) }
  const fetchPending = async (page: number) => parseSettlementPage(await session.api({ method: 'GET', path: '/api/v1/pay/statement/order/list', query: { ...base, from: String(page * SETTLEMENT_PAGE), page_type: '10', settlement_status: '1' } }), shop.id, 'pending', timeZone)
  const first = await fetchPending(0)
  const pageCount = Math.min(MAX_PENDING_PAGES, Math.max(1, Math.ceil((first.total || first.count) / SETTLEMENT_PAGE)))
  const rest = await pool(Array.from({ length: pageCount - 1 }, (_, index) => index + 1), CONCURRENCY, fetchPending)
  const pending = [first, ...rest].flatMap((page) => page.records)
  report(`${pending.length}`)
  repo.replacePendingSettlements(shop.id, pending)
  // Settled, newest first, a batch of pages at a time; stop once a batch is mostly records we already have.
  const fetchSettled = async (page: number) => parseSettlementPage(await session.api({ method: 'GET', path: '/api/v1/pay/statement/order/list', query: { ...base, from: String(page * SETTLEMENT_PAGE), page_type: '6', settlement_status: '2' } }), shop.id, 'settled', timeZone)
  for (let page = 0; page < MAX_SETTLED_PAGES; page += CONCURRENCY) {
    const batch = await pool(Array.from({ length: Math.min(CONCURRENCY, MAX_SETTLED_PAGES - page) }, (_, index) => page + index), CONCURRENCY, fetchSettled)
    const records = batch.flatMap((parsed) => parsed.records)
    const known = repo.knownSettlementIds(records.map((record) => record.id))
    repo.upsertSettled(records)
    report(`${pending.length} + ${Math.min(MAX_SETTLED_PAGES, page + CONCURRENCY) * SETTLEMENT_PAGE}`)
    if (batch.some((parsed) => parsed.count < SETTLEMENT_PAGE) || known.size >= records.length * 0.9) break
  }
}

/** Units sold per unified code per date for one shop, from the same daily rows as 销售与库存. */
function unitsByCodeForShop(shop: ShopRecord, today: string) {
  const settings = repo.getSettings()
  const resolve = makeCodeResolver(repo.listMappings())
  const sellerSkuById = new Map(repo.listPlatformSkus([shop.id]).map((sku) => [sku.id, sku.sellerSku]))
  const units = new Map<string, Map<string, number>>()
  for (const row of dailyRows([shop], today, settings)) {
    const { key, mapped } = resolve(row.shopKey, row.skuId, row.sellerSku || sellerSkuById.get(`${row.shopKey}:${row.skuId}`) || '')
    if (!mapped || !row.units) continue
    const perDate = units.get(key) || new Map<string, number>()
    perDate.set(row.date, (perDate.get(row.date) || 0) + row.units)
    units.set(key, perDate)
  }
  return units
}

function costMap() {
  return new Map(repo.listSkuSettings().filter((item) => typeof item.cost === 'number' && item.cost >= 0).map((item) => [item.code, item.cost as number]))
}

/** Suggests the GMV Max store of a shop: same id as the seller account or shop, or the same name. */
function suggestStore(shop: ShopRecord, stores: GmvStoreOption[]) {
  const state = repo.getShopState(shop.id)
  const shopId = (deps.listShops().find((item) => item.id === shop.id) as ShopRecord & { shopId?: string })?.shopId
  const byId = stores.filter((store) => store.storeId === state.sellerId || (shopId && store.storeId === shopId))
  if (byId.length === 1) return byId[0]
  const name = shop.name.trim().toLowerCase()
  const byName = stores.filter((store) => store.storeName.trim().toLowerCase() === name)
  return byName.length === 1 ? byName[0] : undefined
}

async function syncHealth(session: Pick<SellerSession, 'api'>, shop: ShopRecord, state: SiShopState) {
  const query = sellerQuery(state, shop)
  const [homeTask, performance, violation] = [
    await session.api({ method: 'GET', path: '/api/v1/seller/home_task/get', query }),
    await session.api({ method: 'GET', path: '/api/v1/seller/growth_center/performance/list', query }),
    await session.api({ method: 'GET', path: '/api/v1/seller/growth_center/violation/overview/get', query }),
  ]
  repo.saveShopHealth(parseShopHealth({ homeTask, performance, violation }, shop.id, deps.now()))
}

function dailyRows(shops: ShopRecord[], today: string, settings: SiSettings) {
  const rows: SiDailyRow[] = []
  const historyStart = shiftDate(today, -(Math.max(7, settings.historyDays) - 1))
  for (const shop of shops) {
    const state = repo.getShopState(shop.id)
    const ordersFrom = state.ordersFrom || shiftDate(today, 1)
    rows.push(...repo.dailyFromCompass(shop.id, historyStart, ordersFrom))
    if (state.ordersFrom) rows.push(...repo.dailyFromOrders(shop.id, ordersFrom > historyStart ? ordersFrom : historyStart))
  }
  return rows
}

function unitsByDateForCode(code: string, today: string) {
  const shops = deps.listShops()
  const dashboard = buildDashboard({
    today,
    days: repo.getSettings().historyDays,
    shops: shops.map(toShop),
    platformSkus: repo.listPlatformSkus(),
    daily: dailyRows(shops, today, repo.getSettings()),
    mappings: repo.listMappings(),
    moves: [],
    skuSettings: [],
    settings: repo.getSettings(),
  })
  const cells = dashboard.matrix[code] || {}
  return new Map(Object.entries(cells).map(([date, cell]) => [date, cell.units]))
}

export const sellerInventoryService = {
  listShops(): SiShop[] {
    return deps.listShops().map(toShop)
  },

  getDashboard(input?: { days?: number; shopKey?: string }) {
    const allShops = deps.listShops()
    const shops = input?.shopKey ? allShops.filter((shop) => shop.id === input.shopKey) : allShops
    const settings = repo.getSettings()
    const today = zonedDate(deps.now(), businessTimeZone(allShops))
    return buildDashboard({
      today,
      days: Math.min(settings.historyDays, Math.max(7, Math.trunc(Number(input?.days) || 30))),
      shops: shops.map(toShop),
      platformSkus: repo.listPlatformSkus(shops.map((shop) => shop.id)),
      daily: dailyRows(shops, today, settings),
      mappings: repo.listMappings(),
      moves: repo.listMoves(),
      skuSettings: repo.listSkuSettings(),
      settings,
    })
  },

  /** 店铺 page: one card per shop with today, yesterday, 7-day trend and alerts. */
  getShopsOverview(): ShopsOverview {
    const shops = deps.listShops()
    const today = zonedDate(deps.now(), businessTimeZone(shops))
    const cards: ShopCard[] = shops.map((record) => {
      const shop = toShop(record)
      const shopToday = zonedDate(deps.now(), tzOf(record))
      const days = repo.listShopDays(record.id, shiftDate(shopToday, -14), shopToday)
      const byDate = new Map(days.map((day) => [day.date, day]))
      const gmv7 = sumShopDays(days.filter((day) => day.date > shiftDate(shopToday, -7))).gmv
      const gmvPrev7 = sumShopDays(days.filter((day) => day.date <= shiftDate(shopToday, -7) && day.date > shiftDate(shopToday, -14))).gmv
      const shopDashboard = this.getDashboard({ shopKey: record.id, days: 30 })
      const stock = shopDashboard.kpi
      const health = repo.getShopHealth(record.id)
      const profit = this.profitSignal(record.id)
      const analysis = analyzeShop({ shopKey: record.id, today: shopToday, days, skus: shopDashboard.items, health, profit })
      const alerts: ShopCard['alerts'] = []
      if (record.loginState === 'expired' || String(shop.state.lastSyncError || '').includes('LOGIN')) alerts.push({ kind: 'login' })
      else if (shop.state.lastSyncError) alerts.push({ kind: 'syncFailed' })
      if (!days.length) alerts.push({ kind: 'noData' })
      // Today is still running, so the drop check compares the last 7 full days with the 7 before.
      const last7 = sumShopDays(days.filter((day) => day.date >= shiftDate(shopToday, -7) && day.date < shopToday)).gmv
      const before7 = sumShopDays(days.filter((day) => day.date >= shiftDate(shopToday, -14) && day.date < shiftDate(shopToday, -7))).gmv
      if (before7 > 0 && last7 < before7 * 0.8) alerts.push({ kind: 'gmvDrop', value: (last7 - before7) / before7 })
      if (stock.outCount + stock.reorderCount > 0) alerts.push({ kind: 'stock', value: stock.outCount + stock.reorderCount })
      if (health?.todo.urgentToShip) alerts.push({ kind: 'urgentShip', value: health.todo.urgentToShip })
      const failing = analysis.findings.filter((item) => item.key === 'healthFail').length
      if (failing) alerts.push({ kind: 'health', value: failing })
      return {
        shop,
        today: byDate.get(shopToday),
        yesterday: byDate.get(shiftDate(shopToday, -1)),
        gmv7,
        gmvPrev7,
        spark: dateRange(shiftDate(shopToday, -13), shopToday).map((date) => ({ date, gmv: byDate.get(date)?.gmv || 0 })),
        outOfStock: stock.outCount,
        reorder: stock.reorderCount,
        alerts,
        profit7: profit?.profit7,
        margin7: profit?.margin7,
        topFinding: analysis.findings.find((item) => item.level === 'error' || item.level === 'warning') || analysis.findings.find((item) => item.level === 'growth'),
      }
    })
    const total = { todayGmv: 0, todayOrders: 0, todayVisitors: 0, yesterdayGmv: 0, gmv7: 0, gmvPrev7: 0 }
    for (const card of cards) {
      total.todayGmv += card.today?.gmv || 0
      total.todayOrders += card.today?.orders || 0
      total.todayVisitors += card.today?.visitors || 0
      total.yesterdayGmv += card.yesterday?.gmv || 0
      total.gmv7 += card.gmv7
      total.gmvPrev7 += card.gmvPrev7
    }
    return { today, cards, total, syncing: this.isSyncing() }
  },

  /** One shop's daily metrics over `days`, the same span before it, and its best SKUs. */
  getShopReport(input: { shopKey: string; days?: number }): ShopReport {
    const record = requireShop(String(input?.shopKey || ''))
    const span = Math.min(365, Math.max(7, Math.trunc(Number(input?.days) || 30)))
    const today = zonedDate(deps.now(), tzOf(record))
    const start = shiftDate(today, -(span - 1))
    const prevStart = shiftDate(start, -span)
    const days = repo.listShopDays(record.id, start, today)
    const previous = repo.listShopDays(record.id, prevStart, shiftDate(start, -1))
    const dashboard = this.getDashboard({ shopKey: record.id, days: Math.min(span, 90) })
    const health = repo.getShopHealth(record.id)
    // Analysis always looks at yesterday and the last two weeks, whatever range the page shows.
    const recent = repo.listShopDays(record.id, shiftDate(today, -15), today)
    return {
      shop: toShop(record),
      today,
      start,
      end: today,
      days,
      previous,
      totals: sumShopDays(days),
      previousTotals: sumShopDays(previous),
      topSkus: [...dashboard.items].sort((a, b) => b.amount7 - a.amount7).slice(0, 15),
      outOfStock: dashboard.kpi.outCount,
      reorder: dashboard.kpi.reorderCount,
      analysis: analyzeShop({ shopKey: record.id, today, days: recent, skus: dashboard.items, health }),
      health,
    }
  },

  analyzeShop(shopKey: string): ShopAnalysis {
    const record = requireShop(shopKey)
    const today = zonedDate(deps.now(), tzOf(record))
    const dashboard = this.getDashboard({ shopKey, days: 30 })
    return analyzeShop({ shopKey, today, days: repo.listShopDays(shopKey, shiftDate(today, -15), today), skus: dashboard.items, health: repo.getShopHealth(shopKey), profit: this.profitSignal(shopKey) })
  },

  /** Last 7 full days of profit, for analysis and cards. */
  profitSignal(shopKey: string) {
    const profit = this.getShopProfit({ shopKey, days: 8 })
    const full = profit.days.filter((day) => day.date < profit.end)
    const totals = profitTotals(full)
    if (profit.feeRate === undefined || !totals.gmv) return undefined
    return { profit7: totals.profit, margin7: totals.margin, adShare7: totals.gmv ? totals.adSpend / totals.gmv : undefined, costCoverage: totals.costCoverage }
  },

  /** Daily profit of one shop: payout after platform fees − product cost − ad spend. */
  getShopProfit(input: { shopKey: string; days?: number }): ShopProfit {
    const record = requireShop(String(input?.shopKey || ''))
    const span = Math.min(365, Math.max(1, Math.trunc(Number(input?.days) || 30)))
    const today = zonedDate(deps.now(), tzOf(record))
    const start = shiftDate(today, -(span - 1))
    const prevStart = shiftDate(start, -span)
    const settlements = repo.listSettlements(record.id, shiftDate(today, -45))
    const fee = learnFeeRate(settlements)
    const units = unitsByCodeForShop(record, today)
    const costs = costMap()
    const stores = gmvAds.listStores()
    let link = repo.getAdLink(record.id)
    if (!link) {
      const suggested = suggestStore(record, stores)
      // Auto-link only when no exchange rate is needed; otherwise the page asks for the rate.
      if (suggested && (!suggested.currency || suggested.currency === REGION_CURRENCY[record.region.toUpperCase()])) link = { shopKey: record.id, storeId: suggested.storeId, rate: 1, adCurrency: suggested.currency, updatedAt: deps.now() }
    }
    const adSpend = link ? gmvAds.dailySpend(link.storeId, prevStart, today) : new Map<string, number>()
    const shopDays = repo.listShopDays(record.id, prevStart, today)
    const build = (from: string, to: string) => buildProfitDays({ start: from, end: to, shopDays, unitsByCode: units, costs, adSpend, adRate: link?.rate ?? 1, feeRate: fee.rate })
    const days = build(start, today)
    const previous = build(prevStart, shiftDate(start, -1))
    const dashboard = this.getDashboard({ shopKey: record.id, days: Math.min(span, 90) })
    const missingCost = dashboard.items
      .filter((item) => item.mapped && !costs.has(item.key) && item.units30 > 0)
      .sort((a, b) => b.amount30 - a.amount30)
      .slice(0, 30)
      .map((item) => ({ code: item.key, name: item.name, units: item.units30, amount: item.amount30 }))
    const pending = settlements.filter((item) => item.status === 'pending')
    const settledSince = shiftDate(today, -6)
    const settled = settlements.filter((item) => item.status === 'settled' && item.settledAt && zonedDate(item.settledAt, tzOf(record)) >= settledSince)
    const suggested = suggestStore(record, stores)
    return {
      shopKey: record.id,
      start,
      end: today,
      feeRate: fee.rate,
      feeSample: fee.sample,
      days,
      totals: profitTotals(days),
      previousTotals: profitTotals(previous),
      missingCost,
      adLink: link,
      adStores: stores.map((store) => ({ ...store, suggested: store.storeId === suggested?.storeId })),
      pending: { count: pending.length, settlement: pending.reduce((total, item) => total + item.settlement, 0) },
      settledRecent: { count: settled.length, settlement: settled.reduce((total, item) => total + item.settlement, 0), since: settledSince },
    }
  },

  setAdLink(input: { shopKey: string; storeId?: string; rate?: number }) {
    const record = requireShop(String(input?.shopKey || ''))
    if (!input?.storeId) {
      repo.saveAdLink(null, record.id)
      return { ok: true as const }
    }
    const store = gmvAds.listStores().find((item) => item.storeId === input.storeId)
    if (!store) throw new Error('SELLER_INVENTORY_AD_STORE_NOT_FOUND')
    const rate = Number(input.rate)
    const link: ShopAdLink = { shopKey: record.id, storeId: store.storeId, rate: Number.isFinite(rate) && rate > 0 ? rate : 1, adCurrency: store.currency, updatedAt: deps.now() }
    repo.saveAdLink(link, record.id)
    return { ok: true as const }
  },

  /** Phone summary (经营数据 → 店铺): today, yesterday, 7-day profit and the top findings, in Chinese. */
  businessDigest(): BusinessShops {
    const overview = this.getShopsOverview()
    const SYMBOL: Record<string, string> = { VN: '₫', TH: '฿', MY: 'RM', PH: '₱', ID: 'Rp', SG: 'S$', US: '$', GB: '£' }
    return {
      shops: overview.cards.map((card) => {
        const analysis = this.analyzeShop(card.shop.shopKey)
        return {
          shopKey: card.shop.shopKey,
          name: card.shop.name,
          region: card.shop.region,
          currency: SYMBOL[card.shop.region.toUpperCase()] || '',
          lastSyncAt: card.shop.state.lastSyncAt,
          loginExpired: card.alerts.some((alert) => alert.kind === 'login'),
          today: card.today ? { gmv: card.today.gmv, orders: card.today.orders, visitors: card.today.visitors, conversion: card.today.conversion } : undefined,
          yesterdayGmv: card.yesterday?.gmv,
          gmvChangeDay: analysis.gmvChangeDay,
          gmv7: card.gmv7,
          gmvChange7: card.gmvPrev7 ? (card.gmv7 - card.gmvPrev7) / card.gmvPrev7 : undefined,
          profit7: card.profit7,
          margin7: card.margin7,
          healthFailing: card.alerts.find((alert) => alert.kind === 'health')?.value || 0,
          urgentShip: card.alerts.find((alert) => alert.kind === 'urgentShip')?.value || 0,
          findings: analysis.findings.slice(0, 6).map((finding) => ({ level: finding.level, text: findingText(finding, 'zh-CN'), action: actionText(finding, 'zh-CN') || undefined })),
        }
      }),
    }
  },

  /** Builds the morning report for every shop and delivers it (desktop + Feishu, per settings). */
  async generateReport(input?: { deliver?: boolean }): Promise<MorningReport> {
    const shops = deps.listShops()
    const settings = repo.getReportSettings()
    const report: MorningReport = {
      id: randomUUID(),
      date: zonedDate(deps.now(), businessTimeZone(shops)),
      createdAt: deps.now(),
      shops: shops.map((shop) => ({ shopKey: shop.id, name: shop.name, region: shop.region, analysis: this.analyzeShop(shop.id) })),
      delivered: {},
    }
    if (input?.deliver !== false) report.delivered = await deps.deliver(report, settings)
    return repo.saveReport(report)
  },

  listReports() {
    return repo.listReports()
  },

  getReportSettings() {
    return repo.getReportSettings()
  },

  saveReportSettings(input: Partial<ReportSettings>) {
    const current = repo.getReportSettings()
    const hour = Number(input?.hour)
    return repo.saveReportSettings({
      enabled: input?.enabled ?? current.enabled,
      hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : current.hour,
      desktop: input?.desktop ?? current.desktop,
      feishu: input?.feishu ?? current.feishu,
    })
  },

  /**
   * Runs the morning report once a day after `hour` (business time zone): syncs every shop first so
   * yesterday is complete, then analyses and delivers. Called by the scheduler every few minutes.
   */
  async runScheduledReport() {
    const settings = repo.getReportSettings()
    const shops = deps.listShops()
    if (!settings.enabled || !shops.length || reportRunning) return null
    const timeZone = businessTimeZone(shops)
    const now = deps.now()
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)))
    const today = zonedDate(now, timeZone)
    if (hour < settings.hour || repo.listReports(1).some((item) => item.date === today)) return null
    reportRunning = true
    try {
      if (!this.isSyncing()) await this.sync()
      return await this.generateReport()
    } finally {
      reportRunning = false
    }
  },

  startScheduler() {
    if (schedulerTimer) return
    schedulerTimer = setInterval(() => { void this.runScheduledReport().catch((error) => console.warn('[seller-inventory] morning report failed', error)) }, 10 * 60_000)
    setTimeout(() => { void this.runScheduledReport().catch((error) => console.warn('[seller-inventory] morning report failed', error)) }, 60_000)
  },

  stopScheduler() {
    if (schedulerTimer) clearInterval(schedulerTimer)
    schedulerTimer = null
  },

  getProgress(): SiSyncProgress[] {
    return [...progress.values()]
  },

  isSyncing() {
    return [...progress.values()].some((item) => item.status === 'running')
  },

  /** Syncs one shop, or every shop side by side (each in its own window). Returns once all have finished. */
  async sync(input?: { shopKey?: string; stages?: SiSyncStage[] }) {
    const shops = input?.shopKey ? [requireShop(input.shopKey)] : deps.listShops()
    return await Promise.all(shops.map((shop) => this.syncShop(shop.id, input?.stages)))
  },

  async syncShop(shopKey: string, stages: SiSyncStage[] = ['account', 'products', 'orders', 'compass', 'health', 'finance', 'shopDaily']): Promise<SiSyncProgress> {
    const shop = requireShop(shopKey)
    if (progress.get(shopKey)?.status === 'running') throw new Error('SELLER_INVENTORY_SYNC_RUNNING')
    const job: SiSyncProgress = { shopKey, status: 'running', startedAt: deps.now() }
    progress.set(shopKey, job)
    const settings = repo.getSettings()
    const state = repo.getShopState(shopKey)
    const session = withRetries(deps.createSession({ shopKey, region: shop.region }))
    const report = (stage: SiSyncStage) => (detail: string) => { job.stage = stage; job.detail = detail }
    try {
      // Shop numbers first (店铺 fills in within a minute), then products, orders and history.
      job.stage = 'account'
      await session.open('/compass/data-overview')
      if (stages.includes('account') || !state.sellerId) await syncAccount(session, shop, state)
      if (stages.includes('shopDaily')) {
        job.stage = 'shopDaily'
        await syncShopDaily(session, shop, state, settings, report('shopDaily'))
      }
      if (stages.includes('health')) {
        job.stage = 'health'
        await syncHealth(session, shop, state)
      }
      if (stages.includes('products')) {
        job.stage = 'products'
        await session.open('/product/manage')
        await syncProducts(session, shop, state, report('products'))
        repo.saveShopState(state)
      }
      if (stages.includes('orders')) {
        job.stage = 'orders'
        await session.open('/order')
        await syncOrders(session, shop, state, settings, report('orders'))
        repo.saveShopState(state)
      }
      if (stages.includes('compass')) {
        job.stage = 'compass'
        await session.open('/compass/product-analysis')
        await syncCompass(session, shop, state, settings, report('compass'))
      }
      // Settlements are the slowest and only feed profit, so they come last.
      if (stages.includes('finance')) {
        job.stage = 'finance'
        await syncFinance(session, shop, state, report('finance'))
      }
      state.lastSyncAt = deps.now()
      state.lastSyncError = undefined
      job.status = 'done'
      deps.markLogin(shopKey, 'valid')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state.lastSyncError = message
      job.status = 'failed'
      job.error = message
      if (message.includes('SELLER_LOGIN_REQUIRED')) deps.markLogin(shopKey, 'expired')
      console.warn('[seller-inventory] sync failed', { shopKey, stage: job.stage, message })
    } finally {
      session.close()
      repo.saveShopState(state)
      job.finishedAt = deps.now()
    }
    return job
  },

  async openSellerCenter(shopKey: string, path?: string) {
    const shop = requireShop(shopKey)
    // Only seller-center paths of this site; never a full URL from elsewhere.
    const safePath = typeof path === 'string' && /^\/[A-Za-z0-9/_?&=%.,-]*$/.test(path) ? path : '/homepage'
    return await openSellerCenter({ shopKey, region: shop.region }, safePath)
  },

  listMappings(): SiMappingRow[] {
    const shops = new Map(deps.listShops().map((shop) => [shop.id, shop]))
    const mappings = repo.listMappings()
    const skus = repo.listPlatformSkus().filter((sku) => shops.has(sku.shopKey))
    const singleSku = new Map<string, number>()
    for (const sku of skus) singleSku.set(`${sku.shopKey}:${sku.productId}`, (singleSku.get(`${sku.shopKey}:${sku.productId}`) || 0) + 1)
    const dashboard = this.getDashboard({ days: 30 })
    const units30 = new Map<string, number>()
    for (const item of dashboard.items) for (const key of item.skuKeys) units30.set(key, item.units30)
    return skus.map((sku) => ({
      skuKey: sku.id,
      shopKey: sku.shopKey,
      shopName: shops.get(sku.shopKey)?.name || sku.shopKey,
      skuId: sku.skuId,
      productName: sku.productName,
      skuName: sku.skuName,
      image: sku.image,
      sellerSku: sku.sellerSku,
      mappedCode: mappings.get(sku.id),
      suggestion: suggestCode({ productName: sku.productName, sellerSku: sku.sellerSku, singleSku: singleSku.get(`${sku.shopKey}:${sku.productId}`) === 1 }),
      units30: units30.get(sku.id) || 0,
    })).sort((a, b) => Number(Boolean(a.sellerSku || a.mappedCode)) - Number(Boolean(b.sellerSku || b.mappedCode)) || b.units30 - a.units30)
  },

  setMapping(input: { skuKey: string; code: string }) {
    const skuKey = String(input?.skuKey || '').trim()
    if (!skuKey.includes(':')) throw new Error('SELLER_INVENTORY_SKU_REQUIRED')
    repo.setMappings([{ skuKey, code: normalizeCode(input?.code) }])
    return { ok: true as const }
  },

  /** Applies every suggestion to platform SKUs that have neither a seller SKU nor a manual code. */
  applySuggestions() {
    const entries = this.listMappings()
      .filter((row) => !row.sellerSku && !row.mappedCode && row.suggestion)
      .map((row) => ({ skuKey: row.skuKey, code: row.suggestion as string }))
    repo.setMappings(entries)
    return { applied: entries.length }
  },

  /** Saves the fields given; fields left out keep their value, null clears one. */
  saveSkuSettings(input: { code: string; name?: string | null; leadDays?: number | null; safetyDays?: number | null; cost?: number | null }) {
    const code = normalizeCode(input?.code)
    if (!code || code.startsWith('#')) throw new Error('SELLER_INVENTORY_CODE_REQUIRED')
    const current = repo.listSkuSettings().find((item) => item.code === code)
    const days = (value: unknown) => (value === '' || value == null || !Number.isFinite(Number(value)) ? undefined : Math.min(365, Math.max(0, Math.trunc(Number(value)))))
    const pick = <T>(key: keyof typeof input, parse: (value: unknown) => T | undefined, fallback: T | undefined) => (key in (input || {}) ? parse(input[key]) : fallback)
    const cost = (value: unknown) => (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 ? undefined : Number(value))
    return repo.saveSkuSettings({
      code,
      name: pick('name', (value) => String(value || '').trim().slice(0, 120) || undefined, current?.name),
      leadDays: pick('leadDays', days, current?.leadDays),
      safetyDays: pick('safetyDays', days, current?.safetyDays),
      cost: pick('cost', cost, current?.cost),
      updatedAt: deps.now(),
    })
  },

  listMoves(input?: { code?: string }) {
    return repo.listMoves(input?.code ? normalizeCode(input.code) : undefined)
  },

  addMove(input: SiAddMoveInput): SiStockMove {
    const code = normalizeCode(input?.code)
    if (!code || code.startsWith('#')) throw new Error('SELLER_INVENTORY_CODE_REQUIRED')
    if (!['count', 'inbound', 'adjust'].includes(input?.kind)) throw new Error('SELLER_INVENTORY_MOVE_KIND_INVALID')
    const shops = deps.listShops()
    const today = zonedDate(deps.now(), businessTimeZone(shops))
    const date = isValidDate(input?.date) ? String(input.date) : today
    if (date > today) throw new Error('SELLER_INVENTORY_DATE_IN_FUTURE')
    const quantity = Math.trunc(Number(input?.quantity))
    if (!Number.isFinite(quantity)) throw new Error('SELLER_INVENTORY_QUANTITY_INVALID')
    if (input.kind === 'count' && quantity < 0) throw new Error('SELLER_INVENTORY_QUANTITY_INVALID')
    if (input.kind === 'inbound' && quantity <= 0) throw new Error('SELLER_INVENTORY_QUANTITY_INVALID')
    if (input.kind === 'adjust' && quantity === 0) throw new Error('SELLER_INVENTORY_QUANTITY_INVALID')
    const unitCost = Number(input?.unitCost)
    const move: SiStockMove = {
      id: randomUUID(),
      code,
      date,
      kind: input.kind,
      quantity,
      // A count is the stock "now": sales of that day already synced must not be deducted again.
      soldAtSave: input.kind === 'count' ? unitsByDateForCode(code, today).get(date) || 0 : undefined,
      unitCost: Number.isFinite(unitCost) && unitCost > 0 ? unitCost : undefined,
      note: String(input?.note || '').trim().slice(0, 200) || undefined,
      createdAt: deps.now(),
    }
    return repo.addMove(move)
  },

  removeMove(id: string) {
    repo.removeMove(String(id || ''))
    return { ok: true as const }
  },

  getSettings() {
    return repo.getSettings()
  },

  saveSettings(input: Partial<SiSettings>) {
    const current = repo.getSettings()
    const clamp = (value: unknown, fallback: number, min: number, max: number) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.trunc(Number(value)))) : fallback)
    return repo.saveSettings({
      leadDays: clamp(input?.leadDays, current.leadDays, 0, 180),
      safetyDays: clamp(input?.safetyDays, current.safetyDays, 0, 180),
      coverDays: clamp(input?.coverDays, current.coverDays, 1, 365),
      historyDays: clamp(input?.historyDays, current.historyDays, 7, 365),
      orderWindowDays: clamp(input?.orderWindowDays, current.orderWindowDays, 1, 60),
    })
  },
}
