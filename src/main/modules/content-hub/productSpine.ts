import { productsRepo } from '../products/repo'
import { creatokPublisherRepo } from '../tiktok-publisher/repo'
import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { creatorHubRepo } from '../tiktok-creator-hub/repo'
import type { PublishTaskLike } from './performance'
import { blendedMargin, profitOf, readProductMargins, type ProductMargin } from './productMargin'

/**
 * Product spine: joins a library product to its TikTok Shop product ids so ads (GMV Max)
 * and creator data hang off the same product as its content, and turns that data into
 * content directives ("which video to make next").
 */

export const SPINE_ADS_WINDOW_DAYS = 14
const RECENT_DAYS = 3
const MIN_ACTIVE_CREATIVES = 3
const WINNER_MIN_ORDERS = 3
const WINNER_ROI_LIFT = 1.3
const FATIGUE_ROI_DROP = 0.7
const MAIN_CREATIVE_SHARE = 0.15
const CONCENTRATION_SHARE = 0.6

export type SpineCreative = {
  creativeId: string
  name: string
  spend: number
  revenue: number
  orders: number
  roi: number
  recentRoi: number
  previousRoi: number
  spendShare: number
  /** 按近 7 天 ROI 下滑速度，约几天后跌破底线（保本 ROI，没填成本时用商品平均 ROI 的七成）；0 = 已经跌破；没在下滑时没有 */
  daysLeft?: number
}

export type SpineAds = {
  windowDays: number
  spend: number
  revenue: number
  orders: number
  roi: number
  campaignCount: number
  creativeCount: number
  activeCreativeCount: number
  topCreatives: SpineCreative[]
  /** 商品在 GMV MAX 填了成本才有：保本 ROI 和近 N 天利润（成交额 × 毛利率 − 花费） */
  breakEvenRoi?: number
  profit?: number
}

export type SpineCreators = {
  sampleCount: number
  pendingSampleCount: number
  awaitingContentCount: number
  creatorCount: number
  videoCount: number
  gmv: number
  orders: number
  topVideos: Array<{ id: string; title: string; creatorHandle: string; gmv: number; orders: number; views: number }>
}

export type SpineSignalKey =
  | 'bind_channel'
  | 'ads_need_creatives'
  | 'ads_winner'
  | 'ads_fatigue'
  | 'ads_concentration'
  | 'ads_unprofitable'
  | 'creator_winner'
  | 'creators_awaiting_content'

export type SpineSignal = {
  key: SpineSignalKey
  level: 'info' | 'warning' | 'success'
  /** What the signal asks the user to do next. */
  action: 'bind' | 'make_content' | 'make_variant' | 'replenish' | 'open_ads' | 'open_creators'
  params: Record<string, string | number>
}

export type ChannelProduct = { id: string; title: string; imageUrl?: string; sources: Array<'ads' | 'creators' | 'publish'> }

export type ProductSpine = {
  boundIds: string[]
  inferredIds: string[]
  tiktokProductIds: string[]
  channelProducts: ChannelProduct[]
  ads: SpineAds | null
  creators: SpineCreators | null
  signals: SpineSignal[]
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function uniqueIds(values: unknown[]) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function dayKey(offsetDays: number, now = Date.now()) {
  return new Date(now - offsetDays * 86_400_000).toISOString().slice(0, 10)
}

/** Module data is optional: a shop that never connected ads or creators must not break the product page. */
function safely<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

let listPublishTasks: () => Promise<PublishTaskLike[]> = () => creatokPublisherRepo.list()

/** The publisher store runs in a worker that only exists in the built app; tests swap it out. */
export function setProductSpineTestDependencies(deps: { listPublishTasks?: () => Promise<PublishTaskLike[]> }) {
  if (deps.listPublishTasks) listPublishTasks = deps.listPublishTasks
}

/** Publish tasks, or none when the publisher store is unavailable. */
export async function readPublishTasks(): Promise<PublishTaskLike[]> {
  try {
    return await listPublishTasks()
  } catch {
    return []
  }
}

/**
 * The whole-store reads one spine needs. Building spines for many products at once (the home
 * overview) shares one set, so each store is read once instead of once per product.
 */
export type SpineReads = {
  publishTasks: () => Promise<PublishTaskLike[]>
  samples: () => ReturnType<typeof creatorHubRepo.listSamples>
  videos: () => ReturnType<typeof creatorHubRepo.listVideos>
  channelProducts: () => Promise<ChannelProduct[]>
  /** 商品毛利率（GMV MAX 成本）；测试里可以换掉 */
  margins: (productIds: string[]) => Map<string, ProductMargin>
}

function once<T>(read: () => T): () => T {
  let done = false
  let value: T
  return () => {
    if (!done) {
      value = read()
      done = true
    }
    return value
  }
}

export function createSpineReads(): SpineReads {
  const reads: SpineReads = {
    publishTasks: once(() => listPublishTasks()),
    samples: once(() => safely(() => creatorHubRepo.listSamples(), [])),
    videos: once(() => safely(() => creatorHubRepo.listVideos(), [])),
    channelProducts: once(() => listChannelProducts(reads)),
    margins: (productIds) => readProductMargins(productIds),
  }
  return reads
}

async function inferredIdsFromPublishing(productId: string, reads: SpineReads) {
  try {
    const tasks = await reads.publishTasks()
    return uniqueIds(tasks.filter((task) => text(task.localProductId) === productId).map((task) => task.productId))
  } catch {
    return []
  }
}

/** 给广告汇总加上保本 ROI 和利润；有商品没填成本就不加（不猜）。 */
export function withProfit(
  ads: SpineAds | null,
  rows: Array<{ productId?: string; grossRevenue: number }>,
  margins: Map<string, ProductMargin>,
): SpineAds | null {
  if (!ads) return ads
  const revenueByProduct = new Map<string, number>()
  for (const row of rows) revenueByProduct.set(text(row.productId), (revenueByProduct.get(text(row.productId)) || 0) + (Number(row.grossRevenue) || 0))
  const margin = blendedMargin([...revenueByProduct].map(([productId, revenue]) => ({ productId, revenue })), margins)
  if (margin === null || margin <= 0) return ads
  return { ...ads, breakEvenRoi: round(1 / margin), profit: profitOf({ revenue: ads.revenue, spend: ads.spend, marginRate: margin }) }
}

const RUNWAY_DAYS = 7
const RUNWAY_MAX = 30
/** 补货提醒：主力素材预计几天内跌破底线就提醒 */
export const RUNWAY_ALERT_DAYS = 3

/**
 * 素材还能撑几天：用近 7 天每天的 ROI 做直线拟合，按下滑速度算到跌破底线还要几天。
 * 至少要 4 天有花费的数据；ROI 没在下滑就返回 undefined。
 */
export function predictRunway(daily: Array<{ statDay: string; cost: number; grossRevenue: number }>, floor: number, now = Date.now()): number | undefined {
  if (!(floor > 0)) return undefined
  const from = dayKey(RUNWAY_DAYS - 1, now)
  const byDay = new Map<string, { cost: number; revenue: number }>()
  for (const row of daily) {
    if (row.statDay < from) continue
    const entry = byDay.get(row.statDay) || { cost: 0, revenue: 0 }
    entry.cost += Number(row.cost) || 0
    entry.revenue += Number(row.grossRevenue) || 0
    byDay.set(row.statDay, entry)
  }
  const points = [...byDay.entries()]
    .filter(([, value]) => value.cost > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ x: Math.round((Date.parse(day) - Date.parse(from)) / 86_400_000), y: value.revenue / value.cost }))
  if (points.length < 4) return undefined
  const n = points.length
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n
  const sxx = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0)
  if (sxx === 0) return undefined
  const slope = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0) / sxx
  // 用拟合线上「最后一天」的值当现在的 ROI，比单天数字稳
  const lastX = points[n - 1]!.x
  const current = meanY + slope * (lastX - meanX)
  if (current <= floor) return 0
  if (slope >= 0) return undefined
  return Math.min(RUNWAY_MAX, Math.max(1, Math.round((current - floor) / -slope)))
}

export function summarizeAds(
  rows: Array<{ campaignId: string; creativeId: string; statDay: string; cost: number; grossRevenue: number; orders: number; creativeName: string }>,
  now = Date.now(),
  breakEvenRoi?: number,
): SpineAds | null {
  if (!rows.length) return null
  const recentFrom = dayKey(RECENT_DAYS - 1, now)
  const byCreative = new Map<string, SpineCreative & { recentSpend: number; recentRevenue: number; previousSpend: number; previousRevenue: number }>()
  for (const row of rows) {
    const cost = Number(row.cost) || 0
    const revenue = Number(row.grossRevenue) || 0
    const entry = byCreative.get(row.creativeId) || {
      creativeId: row.creativeId, name: '', spend: 0, revenue: 0, orders: 0, roi: 0, recentRoi: 0, previousRoi: 0, spendShare: 0,
      recentSpend: 0, recentRevenue: 0, previousSpend: 0, previousRevenue: 0,
    }
    entry.name = entry.name || text(row.creativeName)
    entry.spend += cost
    entry.revenue += revenue
    entry.orders += Number(row.orders) || 0
    if (row.statDay >= recentFrom) {
      entry.recentSpend += cost
      entry.recentRevenue += revenue
    } else {
      entry.previousSpend += cost
      entry.previousRevenue += revenue
    }
    byCreative.set(row.creativeId, entry)
  }
  const creatives = [...byCreative.values()]
  const spend = creatives.reduce((sum, item) => sum + item.spend, 0)
  const revenue = creatives.reduce((sum, item) => sum + item.revenue, 0)
  const orders = creatives.reduce((sum, item) => sum + item.orders, 0)
  const topCreatives = creatives
    .map((item) => ({
      creativeId: item.creativeId,
      name: item.name || item.creativeId,
      spend: round(item.spend),
      revenue: round(item.revenue),
      orders: item.orders,
      roi: round(ratio(item.revenue, item.spend)),
      recentRoi: round(ratio(item.recentRevenue, item.recentSpend)),
      previousRoi: round(ratio(item.previousRevenue, item.previousSpend)),
      spendShare: round(ratio(item.spend, spend), 3),
    }))
    .sort((a, b) => b.spend - a.spend)
  // 底线：有成本用保本 ROI，没有就用商品平均 ROI 的七成（「不出单」的线）
  const floor = breakEvenRoi && breakEvenRoi > 0 ? breakEvenRoi : ratio(revenue, spend) * FATIGUE_ROI_DROP
  for (const item of topCreatives.slice(0, 8)) {
    const daysLeft = predictRunway(rows.filter((row) => row.creativeId === item.creativeId), floor, now)
    if (daysLeft !== undefined) Object.assign(item, { daysLeft })
  }
  return {
    windowDays: SPINE_ADS_WINDOW_DAYS,
    spend: round(spend),
    revenue: round(revenue),
    orders,
    roi: round(ratio(revenue, spend)),
    campaignCount: new Set(rows.map((row) => row.campaignId)).size,
    creativeCount: creatives.length,
    activeCreativeCount: creatives.filter((item) => item.recentSpend > 0).length,
    topCreatives: topCreatives.slice(0, 8),
  }
}

/** Ad and creator performance → what content to make next. Deterministic so the advice is explainable. */
export function buildSignals(input: { tiktokProductIds: string[]; hasChannelData: boolean; ads: SpineAds | null; creators: SpineCreators | null; breakEvenRoi?: number }): SpineSignal[] {
  const signals: SpineSignal[] = []
  const { ads, creators } = input
  if (!input.tiktokProductIds.length) {
    if (input.hasChannelData) signals.push({ key: 'bind_channel', level: 'info', action: 'bind', params: {} })
    return signals
  }
  if (ads && ads.spend > 0) {
    const ranked = ads.topCreatives
    const top = ranked[0]
    const winner = ranked
      .filter((item) => item.orders >= WINNER_MIN_ORDERS && item.roi >= ads.roi * WINNER_ROI_LIFT && item.roi > 0)
      .sort((a, b) => b.roi - a.roi)[0]
    if (winner && ranked.length > 1) {
      signals.push({ key: 'ads_winner', level: 'success', action: 'make_variant', params: { name: winner.name, creativeId: winner.creativeId, roi: winner.roi, avgRoi: ads.roi, orders: winner.orders } })
    }
    // 主力素材（花费占比 ≥15%）在衰退：ROI 比前几天掉了三成，或预计 3 天内跌破底线 → 照它补一批变体顶上
    const tiring = ranked
      .filter((item, index) => (index === 0 || item.spendShare >= MAIN_CREATIVE_SHARE) && (
        (item.previousRoi > 0 && item.recentRoi > 0 && item.recentRoi < item.previousRoi * FATIGUE_ROI_DROP)
        || (item.daysLeft !== undefined && item.daysLeft <= RUNWAY_ALERT_DAYS)
      ))
      .slice(0, 2)
    for (const item of tiring) {
      signals.push({
        key: 'ads_fatigue',
        level: 'warning',
        action: 'replenish',
        params: {
          name: item.name, creativeId: item.creativeId, recentRoi: item.recentRoi, previousRoi: item.previousRoi, share: Math.round(item.spendShare * 100),
          ...(item.daysLeft !== undefined ? { daysLeft: item.daysLeft } : {}),
          floor: round(input.breakEvenRoi && input.breakEvenRoi > 0 ? input.breakEvenRoi : ads.roi * FATIGUE_ROI_DROP),
          floorKind: input.breakEvenRoi && input.breakEvenRoi > 0 ? 'break_even' : 'average',
        },
      })
    }
    if (top && ranked.length >= 2 && top.spendShare >= CONCENTRATION_SHARE) {
      signals.push({ key: 'ads_concentration', level: 'warning', action: 'make_content', params: { name: top.name, share: Math.round(top.spendShare * 100) } })
    }
    if (ads.activeCreativeCount < MIN_ACTIVE_CREATIVES) {
      signals.push({ key: 'ads_need_creatives', level: 'warning', action: 'make_content', params: { active: ads.activeCreativeCount, target: MIN_ACTIVE_CREATIVES } })
    }
    if (input.breakEvenRoi && input.breakEvenRoi > 0 && ads.roi < input.breakEvenRoi) {
      signals.push({ key: 'ads_unprofitable', level: 'warning', action: 'open_ads', params: { roi: ads.roi, breakEvenRoi: round(input.breakEvenRoi) } })
    }
  }
  if (creators) {
    const best = creators.topVideos[0]
    if (best && best.orders >= WINNER_MIN_ORDERS) {
      signals.push({ key: 'creator_winner', level: 'success', action: 'make_variant', params: { name: best.title || best.creatorHandle, creator: best.creatorHandle, orders: best.orders, gmv: best.gmv } })
    }
    if (creators.awaitingContentCount > 0) {
      signals.push({ key: 'creators_awaiting_content', level: 'info', action: 'open_creators', params: { count: creators.awaitingContentCount } })
    }
  }
  return signals
}

function readCreators(ids: Set<string>, reads: SpineReads): SpineCreators | null {
  const samples = reads.samples().filter((item) => ids.has(text(item.productId)))
  const videos = reads.videos().filter((item) => (item.productIds || []).some((id) => ids.has(text(id))))
  if (!samples.length && !videos.length) return null
  const liveSamples = samples.filter((item) => item.stage !== 'cancelled')
  return {
    sampleCount: liveSamples.length,
    pendingSampleCount: liveSamples.filter((item) => item.stage === 'pending_review' || item.stage === 'ready_to_ship').length,
    awaitingContentCount: liveSamples.filter((item) => item.stage === 'awaiting_content').length,
    creatorCount: new Set([...liveSamples.map((item) => item.creatorId), ...videos.map((item) => item.creatorId)].filter(Boolean)).size,
    videoCount: videos.length,
    gmv: round(videos.reduce((sum, item) => sum + (Number(item.gmv) || 0), 0)),
    orders: videos.reduce((sum, item) => sum + (Number(item.orders) || 0), 0),
    topVideos: videos
      .slice()
      .sort((a, b) => (Number(b.gmv) || 0) - (Number(a.gmv) || 0))
      .slice(0, 5)
      .map((item) => ({ id: item.id, title: text(item.title), creatorHandle: text(item.creatorHandle), gmv: round(Number(item.gmv) || 0), orders: Number(item.orders) || 0, views: Number(item.views) || 0 })),
  }
}

/** Every TikTok Shop product the app already knows about, for the binding picker. */
async function listChannelProducts(reads: SpineReads = createSpineReads()): Promise<ChannelProduct[]> {
  const byId = new Map<string, ChannelProduct>()
  const add = (id: unknown, title: unknown, source: ChannelProduct['sources'][number], imageUrl?: unknown) => {
    const key = text(id)
    if (!key) return
    const entry = byId.get(key) || { id: key, title: '', sources: [] }
    entry.title = entry.title || text(title)
    entry.imageUrl = entry.imageUrl || text(imageUrl) || undefined
    if (!entry.sources.includes(source)) entry.sources.push(source)
    byId.set(key, entry)
  }
  for (const item of safely(() => gmvMaxRepo.listProductCosts(), [])) add(item.productId, item.productName, 'ads', item.imageUrl)
  for (const item of reads.samples()) add(item.productId, item.productTitle, 'creators', item.skuImage)
  for (const item of safely(() => creatorHubRepo.listCosts(), [])) add(item.productId, item.productTitle, 'creators')
  try {
    for (const task of await reads.publishTasks()) add(task.productId, task.productTitle, 'publish')
  } catch {
    // Publishing is optional.
  }
  return [...byId.values()].sort((a, b) => b.sources.length - a.sources.length || a.title.localeCompare(b.title))
}

export const productSpine = {
  listChannelProducts: () => listChannelProducts(),

  /** `reads` lets a caller building many spines share the store reads (see createSpineReads). */
  async build(productId: string, now = Date.now(), reads: SpineReads = createSpineReads()): Promise<ProductSpine> {
    const product = (await productsRepo.list()).find((item) => item.id === productId)
    const boundIds = uniqueIds(product?.tiktokProductIds || [])
    const inferredIds = (await inferredIdsFromPublishing(productId, reads)).filter((id) => !boundIds.includes(id))
    const tiktokProductIds = [...boundIds, ...inferredIds]
    const channelProducts = await reads.channelProducts()
    const idSet = new Set(tiktokProductIds)
    const adRows = tiktokProductIds.length
      ? safely(() => gmvMaxRepo.listCreativeDailyForProducts(tiktokProductIds, dayKey(SPINE_ADS_WINDOW_DAYS - 1, now), dayKey(0, now)), [])
      : []
    const margins = tiktokProductIds.length ? reads.margins(tiktokProductIds) : new Map<string, ProductMargin>()
    const margin = blendedMargin(adRows.map((row) => ({ productId: text(row.productId), revenue: Number(row.grossRevenue) || 0 })), margins)
    const ads = tiktokProductIds.length ? withProfit(summarizeAds(adRows, now, margin && margin > 0 ? 1 / margin : undefined), adRows, margins) : null
    const creators = tiktokProductIds.length ? readCreators(idSet, reads) : null
    return {
      boundIds,
      inferredIds,
      tiktokProductIds,
      channelProducts,
      ads,
      creators,
      signals: buildSignals({ tiktokProductIds, hasChannelData: channelProducts.length > 0, ads, creators, breakEvenRoi: ads?.breakEvenRoi }),
    }
  },

  async link(input: { productId: string; tiktokProductIds: string[] }) {
    const product = (await productsRepo.list()).find((item) => item.id === text(input.productId))
    if (!product) throw new Error('PRODUCT_NOT_FOUND')
    const next = uniqueIds(Array.isArray(input.tiktokProductIds) ? input.tiktokProductIds : [])
    await productsRepo.upsert({ id: product.id, name: product.name, type: product.type, tiktokProductIds: next })
    return next
  },
}
