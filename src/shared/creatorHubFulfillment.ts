// Per-creator sample fulfilment (pure, unit tested).
//
// Definition agreed with the user (docs/creator-management-plan.md):
//  - a sample counts once it was shipped (platform sample order exists, or it reached shipped / awaiting content / completed);
//  - it is fulfilled when the creator posted content (platform status "completed");
//  - deadline = application time + logistics buffer + fulfilment window (TikTok exposes no delivery time);
//  - shipped samples past the deadline without content are overdue;
//  - fulfilment rate = fulfilled / (fulfilled + overdue). Samples still inside the window are "pending".
import type {
  CreatorHubCreatorStat,
  CreatorHubProductCost,
  CreatorHubSample,
  CreatorHubSampleFulfillment,
  CreatorHubSettings,
} from './creatorHub'

const DAY = 86_400_000

export function sampleDeadline(sample: Pick<CreatorHubSample, 'createdAt'>, settings: CreatorHubSettings) {
  return sample.createdAt + (settings.logisticsBufferDays + settings.fulfillmentWindowDays) * DAY
}

export function isShipped(sample: Pick<CreatorHubSample, 'stage' | 'hasSampleOrder'>) {
  return sample.hasSampleOrder || sample.stage === 'shipped' || sample.stage === 'awaiting_content' || sample.stage === 'completed'
}

export function classifySample(sample: CreatorHubSample, settings: CreatorHubSettings, now = Date.now()): CreatorHubSampleFulfillment {
  if (sample.stage === 'completed') return 'fulfilled'
  if (!isShipped(sample)) return sample.stage === 'cancelled' ? 'excluded' : 'not_shipped'
  return sampleDeadline(sample, settings) <= now ? 'overdue' : 'pending'
}

export function costKey(shopId: string, productId: string, skuId?: string) {
  return `${shopId}:${productId}:${skuId || '*'}`
}

export function sampleCost(sample: CreatorHubSample, costs: Map<string, CreatorHubProductCost>) {
  if (sample.costOverride != null) return sample.costOverride
  const cost = costs.get(costKey(sample.shopId, sample.productId, sample.skuId)) || costs.get(costKey(sample.shopId, sample.productId))
  return cost ? cost.unitCost + cost.shippingCost : undefined
}

export function creatorStats(samples: CreatorHubSample[], costList: CreatorHubProductCost[], settings: CreatorHubSettings, now = Date.now()): CreatorHubCreatorStat[] {
  const costs = new Map(costList.map((item) => [item.id, item]))
  const byCreator = new Map<string, CreatorHubCreatorStat>()
  const latest = new Map<string, number>()
  for (const sample of samples) {
    const key = `${sample.shopId}:${sample.creatorId || sample.creatorHandle}`
    let stat = byCreator.get(key)
    if (!stat) {
      stat = {
        shopId: sample.shopId,
        creatorId: sample.creatorId,
        creatorHandle: sample.creatorHandle,
        creatorNickname: sample.creatorNickname,
        creatorAvatar: sample.creatorAvatar,
        followers: sample.followers,
        platformFulfillmentRate: sample.platformFulfillmentRate,
        applications: 0,
        shipped: 0,
        fulfilled: 0,
        overdue: 0,
        pending: 0,
        sampleCost: 0,
        missingCost: 0,
        lastAppliedAt: 0,
      }
      byCreator.set(key, stat)
    }
    stat.applications += 1
    // Keep creator profile fields from the most recent application.
    if (sample.createdAt >= (latest.get(key) || 0)) {
      latest.set(key, sample.createdAt)
      stat.followers = sample.followers
      stat.creatorNickname = sample.creatorNickname
      stat.creatorAvatar = sample.creatorAvatar
      if (sample.platformFulfillmentRate != null) stat.platformFulfillmentRate = sample.platformFulfillmentRate
    }
    stat.lastAppliedAt = Math.max(stat.lastAppliedAt, sample.createdAt)
    const state = classifySample(sample, settings, now)
    if (state === 'fulfilled' || state === 'overdue' || state === 'pending') {
      stat.shipped += 1
      if (state === 'fulfilled') stat.fulfilled += 1
      if (state === 'overdue') stat.overdue += 1
      if (state === 'pending') stat.pending += 1
      const cost = sampleCost(sample, costs)
      if (cost == null) stat.missingCost += 1
      else stat.sampleCost += cost
    }
  }
  for (const stat of byCreator.values()) {
    const due = stat.fulfilled + stat.overdue
    stat.fulfillmentRate = due ? stat.fulfilled / due : undefined
  }
  return [...byCreator.values()]
}

export function summarize(stats: CreatorHubCreatorStat[]) {
  const total = stats.reduce((acc, item) => {
    acc.applications += item.applications
    acc.shipped += item.shipped
    acc.fulfilled += item.fulfilled
    acc.overdue += item.overdue
    acc.pending += item.pending
    acc.sampleCost += item.sampleCost
    return acc
  }, { applications: 0, shipped: 0, fulfilled: 0, overdue: 0, pending: 0, sampleCost: 0 })
  const due = total.fulfilled + total.overdue
  return { ...total, creators: stats.length, fulfillmentRate: due ? total.fulfilled / due : undefined }
}
