import { productCodesService } from '../product-codes/service'
import { contentIndex } from './contentIndex'
import { getHealthReport } from './healthCheck'
import { createSpineReads, productSpine } from './productSpine'
import { reviewInbox } from './reviewInbox'
import { brandMemoryStore, reviewStore } from './stores'
import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { creatorHubRepo } from '../tiktok-creator-hub/repo'
import { dianxiaomiInventoryRepo } from '../dianxiaomi-inventory/repo'
import { computeInventorySkuSummary, todayLocalDate } from '../dianxiaomi-inventory/calculator'
import { buildOverview as buildCreatorOverview } from '../../../shared/creatorHubAnalytics'
import {
  computeOverview,
  type AdsTotals,
  type OverviewAdsInput,
  type OverviewCreatorsInput,
  type OverviewInventoryInput,
  type OverviewProductInput,
  type OverviewReport,
} from '../../../shared/overviewReport'
import type { ReportFeedback, ReportItem, ReportReview } from '../../../shared/contentReports'

/**
 * Gathers every module's numbers for the business overview. Each source is optional: a module the
 * user never set up (or one that fails to read) is reported as "not connected", never as zero.
 */

const DAY = 86_400_000
/** Product spine reads several stores per product; cap the work for very large catalogues. */
const MAX_PRODUCTS = 40

function localDate(time: number) {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function emptyTotals(): AdsTotals {
  return { spend: 0, revenue: 0, orders: 0 }
}

function addTo(totals: AdsTotals, row: { cost: unknown; grossRevenue: unknown; orders: unknown }) {
  totals.spend += num(row.cost)
  totals.revenue += num(row.grossRevenue)
  totals.orders += num(row.orders)
}

/**
 * Most sources are synchronous SQLite reads on the main process. Running them back to back froze
 * the whole app for about a second whenever the home page opened; yielding between them lets
 * clicks, window moves and other IPC through.
 */
function yieldToEventLoop() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

async function safely<T>(read: () => T | Promise<T>, fallback: T): Promise<T> {
  await yieldToEventLoop()
  try {
    return await read()
  } catch {
    return fallback
  }
}

export function readAdsInput(rangeDays: number, now: number): OverviewAdsInput | null {
  const currentStart = localDate(now - (rangeDays - 1) * DAY)
  const previousStart = localDate(now - (rangeDays * 2 - 1) * DAY)
  const end = localDate(now)
  const metrics = gmvMaxRepo.listMetricsRange(previousStart, end)
  if (!metrics.length && !gmvMaxRepo.listBindings().length) return null

  const currencyByAdvertiser = new Map(gmvMaxRepo.listBindings().map((binding) => [String(binding.advertiserId), String(binding.currency || '').toUpperCase()]))
  const names = new Map(gmvMaxRepo.listCampaigns().map((campaign) => [campaign.id, campaign.name]))
  const revenueByCurrency = new Map<string, number>()
  for (const row of metrics) {
    const currency = currencyByAdvertiser.get(String(row.advertiserId)) || ''
    revenueByCurrency.set(currency, (revenueByCurrency.get(currency) || 0) + num(row.grossRevenue))
  }
  // Money in different currencies cannot be added up: show the biggest one, list the rest.
  const ranked = [...revenueByCurrency.entries()].sort((a, b) => b[1] - a[1]).map(([currency]) => currency)
  const currency = ranked[0] ?? ''

  const current = emptyTotals()
  const previous = emptyTotals()
  const campaigns = new Map<string, { id: string; name: string; current: AdsTotals; previous: AdsTotals }>()
  for (const row of metrics) {
    if ((currencyByAdvertiser.get(String(row.advertiserId)) || '') !== currency) continue
    const isCurrent = String(row.statDate).slice(0, 10) >= currentStart
    const entry = campaigns.get(row.campaignId) || { id: row.campaignId, name: names.get(row.campaignId) || row.campaignId, current: emptyTotals(), previous: emptyTotals() }
    addTo(isCurrent ? current : previous, row)
    addTo(isCurrent ? entry.current : entry.previous, row)
    campaigns.set(row.campaignId, entry)
  }
  let pendingActions = 0
  for (const count of gmvMaxRepo.pendingRecommendationCountsByCampaign().values()) pendingActions += count
  return {
    currency,
    current,
    previous,
    campaigns: [...campaigns.values()],
    pendingActions,
    otherCurrencies: ranked.slice(1).filter(Boolean),
  }
}

export function readCreatorsInput(now: number): OverviewCreatorsInput | null {
  const shops = creatorHubRepo.listShops()
  if (!shops.length) return null
  const settings = creatorHubRepo.getSettings()
  const { totals } = buildCreatorOverview({
    shopIds: shops.map((shop) => shop.id),
    perf: creatorHubRepo.listCreatorPerf(),
    samples: creatorHubRepo.listSamples(),
    costs: creatorHubRepo.listCosts(),
    orders: creatorHubRepo.listOrders(undefined, now - settings.orderWindowDays * DAY),
    settings,
    now,
  })
  return {
    gmv: totals.gmv,
    previousGmv: totals.previousGmv,
    orders: totals.orders,
    previousOrders: totals.previousOrders,
    awaitingContent: totals.awaitingContent,
    overdueSamples: totals.overdueSamples,
    pendingReview: totals.pendingReview,
    productsMissingCost: totals.productsMissingCost,
  }
}

export async function readInventoryInput(now: number): Promise<OverviewInventoryInput | null> {
  const skus = await dianxiaomiInventoryRepo.listSkus()
  if (!skus.length) return null
  const today = todayLocalDate(now)
  return await Promise.all(skus.map(async (sku) => {
    const summary = computeInventorySkuSummary(sku, await dianxiaomiInventoryRepo.listShipments(sku.id, sku.baselineDate, today), now)
    return { sku: summary.sku, risk: summary.risk, daysToStockout: summary.daysToStockout, averageDaily: summary.averageDaily }
  }))
}

async function readProductsInput(items: ReportItem[], rangeDays: number, now: number): Promise<OverviewProductInput[]> {
  const since = now - rangeDays * DAY
  const products = (await productCodesService.linkedProducts())
    .filter((product) => (product.tiktokProductIds || []).length > 0)
    .slice(0, MAX_PRODUCTS)
  const rows: OverviewProductInput[] = []
  const reads = createSpineReads()
  for (const product of products) {
    const spine = await safely(() => productSpine.build(product.id, now, reads), null)
    if (!spine) continue
    rows.push({
      productId: product.id,
      productName: product.name,
      adsSpend: spine.ads?.spend || 0,
      newContent: items.filter((item) => item.productId === product.id && item.line !== 'publish' && item.status === 'ready' && item.updatedAt >= since).length,
      signals: spine.signals.map((signal) => ({ key: signal.key, params: signal.params })),
    })
  }
  return rows
}

export async function buildBusinessOverview(rangeDays = 7, now = Date.now()): Promise<OverviewReport> {
  const days = [7, 14, 30, 90].includes(rangeDays) ? rangeDays : 7
  const [items, reviewDb, memory, counts] = await Promise.all([
    contentIndex.listAll() as Promise<unknown> as Promise<ReportItem[]>,
    reviewStore.read(),
    brandMemoryStore.read(),
    safely(() => reviewInbox.counts(), { pending: 0 } as { pending: number }),
  ])
  const ads = await safely(() => readAdsInput(days, now), null)
  const creators = await safely(() => readCreatorsInput(now), null)
  const inventory = await safely(() => readInventoryInput(now), null)
  const products = await safely(() => readProductsInput(items, days, now), [])
  const health = await safely(async () => (await getHealthReport(30 * 60_000)).items, [])
  return computeOverview({
    rangeDays: days,
    now,
    content: {
      items,
      reviews: reviewDb.records as unknown as Record<string, ReportReview>,
      feedback: memory.feedback as unknown as ReportFeedback[],
      pendingReviews: counts.pending,
    },
    ads,
    creators,
    inventory,
    products,
    health,
  })
}

/** How long a built overview is reused. Ads and creator syncs land in their own stores, so a short
 * expiry keeps the numbers fresh; content changes clear it straight away (invalidateBusinessOverview). */
const OVERVIEW_TTL_MS = 60_000
const overviewCache = new Map<number, { at: number; report: Promise<OverviewReport> }>()

/**
 * The overview for the home page and the daily brief. Calls that arrive together (the home page
 * asks for the overview and the brief at the same time) share one build, and reopening the page
 * within a minute reuses it instead of reading every store again.
 */
export function getBusinessOverview(rangeDays = 7): Promise<OverviewReport> {
  const now = Date.now()
  const cached = overviewCache.get(rangeDays)
  if (cached && now - cached.at < OVERVIEW_TTL_MS) return cached.report
  const report = buildBusinessOverview(rangeDays, now)
  overviewCache.set(rangeDays, { at: now, report })
  report.catch(() => {
    if (overviewCache.get(rangeDays)?.report === report) overviewCache.delete(rangeDays)
  })
  return report
}

export function invalidateBusinessOverview() {
  overviewCache.clear()
}
