// Creator hub analysis (pure, unit tested): sample <-> video linkage, creator CRM scoring and the overview.
import type {
  CreatorHubCreatorPerf,
  CreatorHubCreatorProfile,
  CreatorHubCrmRow,
  CreatorHubOrder,
  CreatorHubOverview,
  CreatorHubProductCost,
  CreatorHubSample,
  CreatorHubSettings,
  CreatorHubShopOverview,
  CreatorHubTier,
  CreatorHubVideo,
} from './creatorHub'
import { creatorStats, isShipped, classifySample } from './creatorHubFulfillment'

function creatorKey(shopId: string, creatorId: string, handle?: string) {
  return `${shopId}:${creatorId || handle || ''}`
}

/**
 * A video counts as sample content when the same creator posted it for a product they received
 * as a sample, on or after the application date. Returns video id -> sample id.
 */
export function linkVideosToSamples(videos: CreatorHubVideo[], samples: CreatorHubSample[]) {
  const byCreator = new Map<string, CreatorHubSample[]>()
  for (const sample of samples) {
    if (!isShipped(sample) && sample.stage !== 'completed') continue
    for (const key of new Set([creatorKey(sample.shopId, sample.creatorId), creatorKey(sample.shopId, '', sample.creatorHandle.toLowerCase())])) {
      const list = byCreator.get(key) || []
      list.push(sample)
      byCreator.set(key, list)
    }
  }
  const links = new Map<string, string>()
  for (const video of videos) {
    const candidates = byCreator.get(creatorKey(video.shopId, video.creatorId)) || byCreator.get(creatorKey(video.shopId, '', video.creatorHandle.toLowerCase())) || []
    const match = candidates
      .filter((sample) => video.productIds.includes(sample.productId) && sample.createdAt <= video.postedAt)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    if (match) links.set(video.id, match.id)
  }
  return links
}

export function tierOf(score: number): CreatorHubTier {
  if (score >= 75) return 'A'
  if (score >= 55) return 'B'
  if (score >= 35) return 'C'
  return 'D'
}

/**
 * Creator score (0-100), weights from the plan: fulfilment 40, output 30, posting stability 20, refunds 10.
 *  - fulfilment: our fulfilment rate (0.5 when nothing is due yet);
 *  - output: GMV rank among creators of the shop that sold anything (0 without sales);
 *  - stability: videos + LIVEs in the window, capped at 8;
 *  - refunds: 1 - 2 x refund rate (refunded GMV / GMV), floored at 0.
 */
export function creatorScore(input: { fulfillmentRate?: number; gmvRank?: number; posts: number; refundRate?: number }) {
  const fulfilment = input.fulfillmentRate ?? 0.5
  const output = input.gmvRank ?? 0
  const stability = Math.min(1, input.posts / 8)
  const refunds = 1 - Math.min(1, (input.refundRate ?? 0) * 2)
  return Math.round(fulfilment * 40 + output * 30 + stability * 20 + refunds * 10)
}

export function buildCrm(input: {
  perf: CreatorHubCreatorPerf[]
  samples: CreatorHubSample[]
  costs: CreatorHubProductCost[]
  profiles: CreatorHubCreatorProfile[]
  settings: CreatorHubSettings
  now?: number
}): CreatorHubCrmRow[] {
  const now = input.now ?? Date.now()
  const stats = new Map(creatorStats(input.samples, input.costs, input.settings, now).map((item) => [creatorKey(item.shopId, item.creatorId, item.creatorHandle), item]))
  const rows = new Map<string, CreatorHubCrmRow>()

  const byHandle = new Map<string, string>()
  const ensure = (shopId: string, creatorId: string, base: { handle: string; nickname: string; avatar?: string; followers: number }) => {
    const handleKey = base.handle ? `${shopId}:${base.handle.toLowerCase()}` : ''
    const key = rows.has(creatorKey(shopId, creatorId, base.handle)) ? creatorKey(shopId, creatorId, base.handle) : (handleKey && byHandle.get(handleKey)) || creatorKey(shopId, creatorId, base.handle)
    let row = rows.get(key)
    if (!row) {
      row = {
        key, shopId, creatorId, creatorHandle: base.handle, creatorNickname: base.nickname, creatorAvatar: base.avatar, followers: base.followers,
        gmv: 0, commission: 0, orders: 0, videos: 0, lives: 0, samplesShipped: 0, fulfilled: 0, overdue: 0, sampleCost: 0,
        score: 0, tier: 'D', tags: [], blocked: false,
      }
      rows.set(key, row)
      if (handleKey) byHandle.set(handleKey, key)
    }
    return row
  }

  for (const perf of input.perf) {
    const row = ensure(perf.shopId, perf.creatorId, { handle: perf.creatorHandle, nickname: perf.creatorNickname, avatar: perf.creatorAvatar, followers: perf.followers })
    row.gmv = perf.metrics.gmv
    row.commission = perf.metrics.commission
    row.orders = perf.metrics.orders
    row.videos = perf.metrics.videos
    row.lives = perf.metrics.lives
    row.refundRate = perf.metrics.gmv > 0 ? perf.metrics.refundedGmv / perf.metrics.gmv : undefined
  }
  for (const stat of stats.values()) {
    const row = ensure(stat.shopId, stat.creatorId, { handle: stat.creatorHandle, nickname: stat.creatorNickname, avatar: stat.creatorAvatar, followers: stat.followers })
    row.samplesShipped = stat.shipped
    row.fulfilled = stat.fulfilled
    row.overdue = stat.overdue
    row.fulfillmentRate = stat.fulfillmentRate
    row.sampleCost = stat.sampleCost
    row.lastAppliedAt = stat.lastAppliedAt
  }
  for (const profile of input.profiles) {
    const row = rows.get(creatorKey(profile.shopId, profile.creatorId))
    if (!row) continue
    row.tags = profile.tags
    row.note = profile.note
    row.blocked = profile.blocked
  }

  // GMV rank per shop among creators that sold something (1 = best).
  const byShop = new Map<string, CreatorHubCrmRow[]>()
  for (const row of rows.values()) {
    const list = byShop.get(row.shopId) || []
    list.push(row)
    byShop.set(row.shopId, list)
  }
  const ranks = new Map<string, number>()
  for (const list of byShop.values()) {
    const sellers = list.filter((row) => row.gmv > 0).sort((a, b) => a.gmv - b.gmv)
    sellers.forEach((row, index) => ranks.set(row.key, sellers.length === 1 ? 1 : (index + 1) / sellers.length))
  }
  for (const row of rows.values()) {
    row.sampleRoi = row.sampleCost > 0 ? row.gmv / row.sampleCost : undefined
    row.score = creatorScore({ fulfillmentRate: row.fulfillmentRate, gmvRank: ranks.get(row.key), posts: row.videos + row.lives, refundRate: row.refundRate })
    row.tier = tierOf(row.score)
  }
  return [...rows.values()]
}

function emptyShopOverview(shopId: string): CreatorHubShopOverview {
  return {
    shopId, gmv: 0, refundedGmv: 0, commission: 0, orders: 0, itemsSold: 0, videos: 0, lives: 0, creatorsWithSales: 0, creatorsPosting: 0,
    pendingReview: 0, awaitingContent: 0, overdueSamples: 0, productsMissingCost: 0, sampleFunnel: { applications: 0, shipped: 0, fulfilled: 0, withSales: 0 },
  }
}

export function buildOverview(input: {
  shopIds: string[]
  perf: CreatorHubCreatorPerf[]
  samples: CreatorHubSample[]
  costs: CreatorHubProductCost[]
  orders: CreatorHubOrder[]
  settings: CreatorHubSettings
  now?: number
}): CreatorHubOverview {
  const now = input.now ?? Date.now()
  const shops = new Map(input.shopIds.map((id) => [id, emptyShopOverview(id)]))
  const shopOf = (id: string) => {
    let entry = shops.get(id)
    if (!entry) { entry = emptyShopOverview(id); shops.set(id, entry) }
    return entry
  }
  const hasPrevious = new Set<string>()

  for (const perf of input.perf) {
    const shop = shopOf(perf.shopId)
    const m = perf.metrics
    shop.window = perf.window
    shop.gmv += m.gmv
    shop.refundedGmv += m.refundedGmv
    shop.commission += m.commission
    shop.orders += m.orders
    shop.itemsSold += m.itemsSold
    shop.videos += m.videos
    shop.lives += m.lives
    if (m.gmv > 0) shop.creatorsWithSales += 1
    if (m.videos + m.lives > 0) shop.creatorsPosting += 1
    if (perf.previous) {
      hasPrevious.add(perf.shopId)
      shop.previousGmv = (shop.previousGmv || 0) + perf.previous.gmv
      shop.previousCommission = (shop.previousCommission || 0) + perf.previous.commission
      shop.previousOrders = (shop.previousOrders || 0) + perf.previous.orders
    }
  }

  // Creator + product pairs that produced affiliate orders, to close the sample funnel.
  const sold = new Set(input.orders.filter((order) => order.productId).map((order) => `${order.shopId}:${order.creatorId}:${order.productId}`))
  const costKeys = new Set(input.costs.map((cost) => `${cost.shopId}:${cost.productId}`))
  const missingCost = new Map<string, Set<string>>()
  for (const sample of input.samples) {
    const shop = shopOf(sample.shopId)
    const state = classifySample(sample, input.settings, now)
    shop.sampleFunnel.applications += 1
    if (sample.stage === 'pending_review') shop.pendingReview += 1
    if (sample.stage === 'awaiting_content') shop.awaitingContent += 1
    if (state === 'overdue') shop.overdueSamples += 1
    if (state === 'fulfilled' || state === 'overdue' || state === 'pending') {
      shop.sampleFunnel.shipped += 1
      if (!costKeys.has(`${sample.shopId}:${sample.productId}`) && sample.costOverride == null) {
        const set = missingCost.get(sample.shopId) || new Set<string>()
        set.add(sample.productId)
        missingCost.set(sample.shopId, set)
      }
    }
    if (state === 'fulfilled') {
      shop.sampleFunnel.fulfilled += 1
      if (sold.has(`${sample.shopId}:${sample.creatorId}:${sample.productId}`)) shop.sampleFunnel.withSales += 1
    }
  }
  for (const [shopId, set] of missingCost) shopOf(shopId).productsMissingCost = set.size
  for (const shop of shops.values()) {
    const due = shop.sampleFunnel.fulfilled + shop.overdueSamples
    shop.fulfillmentRate = due ? shop.sampleFunnel.fulfilled / due : undefined
    if (!hasPrevious.has(shop.shopId)) { shop.previousGmv = undefined; shop.previousCommission = undefined; shop.previousOrders = undefined }
  }

  const list = [...shops.values()]
  const totals = emptyShopOverview('all')
  for (const shop of list) {
    totals.gmv += shop.gmv
    totals.refundedGmv += shop.refundedGmv
    totals.commission += shop.commission
    totals.orders += shop.orders
    totals.itemsSold += shop.itemsSold
    totals.videos += shop.videos
    totals.lives += shop.lives
    totals.creatorsWithSales += shop.creatorsWithSales
    totals.creatorsPosting += shop.creatorsPosting
    totals.pendingReview += shop.pendingReview
    totals.awaitingContent += shop.awaitingContent
    totals.overdueSamples += shop.overdueSamples
    totals.productsMissingCost += shop.productsMissingCost
    totals.sampleFunnel.applications += shop.sampleFunnel.applications
    totals.sampleFunnel.shipped += shop.sampleFunnel.shipped
    totals.sampleFunnel.fulfilled += shop.sampleFunnel.fulfilled
    totals.sampleFunnel.withSales += shop.sampleFunnel.withSales
    if (shop.previousGmv != null) totals.previousGmv = (totals.previousGmv || 0) + shop.previousGmv
    if (shop.previousCommission != null) totals.previousCommission = (totals.previousCommission || 0) + shop.previousCommission
    if (shop.previousOrders != null) totals.previousOrders = (totals.previousOrders || 0) + shop.previousOrders
    if (shop.window && (!totals.window || shop.window.end > totals.window.end)) totals.window = shop.window
  }
  const due = totals.sampleFunnel.fulfilled + totals.overdueSamples
  totals.fulfillmentRate = due ? totals.sampleFunnel.fulfilled / due : undefined
  return { totals, shops: list }
}

export function orderSummary(orders: CreatorHubOrder[]) {
  return orders.reduce((acc, order) => {
    acc.orders += 1
    acc.amount += order.amount
    acc.estCommission += order.estCommission
    acc.actualCommission += order.actualCommission || 0
    acc.adsCommission += order.estAdsCommission
    if (order.refundQuantity > 0 || order.returnQuantity > 0) acc.refunded += 1
    if (order.settledAt) acc.settled += 1
    return acc
  }, { orders: 0, amount: 0, estCommission: 0, actualCommission: 0, adsCommission: 0, refunded: 0, settled: 0 })
}
