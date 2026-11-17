import { productsRepo } from '../products/repo'
import { creatokPublisherRepo } from '../tiktok-publisher/repo'
import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { creatorHubRepo } from '../tiktok-creator-hub/repo'
import type { PublishTaskLike } from './performance'

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
  action: 'bind' | 'make_content' | 'make_variant' | 'open_ads' | 'open_creators'
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

async function inferredIdsFromPublishing(productId: string) {
  try {
    const tasks = await listPublishTasks()
    return uniqueIds(tasks.filter((task) => text(task.localProductId) === productId).map((task) => task.productId))
  } catch {
    return []
  }
}

export function summarizeAds(
  rows: Array<{ campaignId: string; creativeId: string; statDay: string; cost: number; grossRevenue: number; orders: number; creativeName: string }>,
  now = Date.now(),
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
    if (top && top.previousRoi > 0 && top.recentRoi > 0 && top.recentRoi < top.previousRoi * FATIGUE_ROI_DROP) {
      signals.push({ key: 'ads_fatigue', level: 'warning', action: 'make_content', params: { name: top.name, creativeId: top.creativeId, recentRoi: top.recentRoi, previousRoi: top.previousRoi, share: Math.round(top.spendShare * 100) } })
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

function readCreators(ids: Set<string>): SpineCreators | null {
  const samples = safely(() => creatorHubRepo.listSamples(), []).filter((item) => ids.has(text(item.productId)))
  const videos = safely(() => creatorHubRepo.listVideos(), []).filter((item) => (item.productIds || []).some((id) => ids.has(text(id))))
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
async function listChannelProducts(): Promise<ChannelProduct[]> {
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
  for (const item of safely(() => creatorHubRepo.listSamples(), [])) add(item.productId, item.productTitle, 'creators', item.skuImage)
  for (const item of safely(() => creatorHubRepo.listCosts(), [])) add(item.productId, item.productTitle, 'creators')
  try {
    for (const task of await listPublishTasks()) add(task.productId, task.productTitle, 'publish')
  } catch {
    // Publishing is optional.
  }
  return [...byId.values()].sort((a, b) => b.sources.length - a.sources.length || a.title.localeCompare(b.title))
}

export const productSpine = {
  listChannelProducts,

  async build(productId: string, now = Date.now()): Promise<ProductSpine> {
    const product = (await productsRepo.list()).find((item) => item.id === productId)
    const boundIds = uniqueIds(product?.tiktokProductIds || [])
    const inferredIds = (await inferredIdsFromPublishing(productId)).filter((id) => !boundIds.includes(id))
    const tiktokProductIds = [...boundIds, ...inferredIds]
    const channelProducts = await listChannelProducts()
    const idSet = new Set(tiktokProductIds)
    const ads = tiktokProductIds.length
      ? summarizeAds(safely(() => gmvMaxRepo.listCreativeDailyForProducts(tiktokProductIds, dayKey(SPINE_ADS_WINDOW_DAYS - 1, now), dayKey(0, now)), []), now)
      : null
    const creators = tiktokProductIds.length ? readCreators(idSet) : null
    return {
      boundIds,
      inferredIds,
      tiktokProductIds,
      channelProducts,
      ads,
      creators,
      signals: buildSignals({ tiktokProductIds, hasChannelData: channelProducts.length > 0, ads, creators }),
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
