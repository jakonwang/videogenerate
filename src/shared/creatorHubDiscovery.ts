// Creator discovery (pure, unit tested): pool scoring and the join with the shop's own history.
import type {
  CreatorHubContact,
  CreatorHubCreatorProfile,
  CreatorHubCrmRow,
  CreatorHubPoolCreator,
  CreatorHubPoolRow,
  CreatorHubPoolScoreParts,
  CreatorHubSample,
} from './creatorHub'
import { tierOf } from './creatorHubAnalytics'

/** Discovery score weights (sum 100). */
export const POOL_WEIGHTS = { sales: 35, content: 25, account: 15, history: 25 } as const

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

/** 0 at or below `low`, 1 at or above `high`, logarithmic in between. */
export function logScale(value: number | undefined, low: number, high: number) {
  if (!value || value <= low) return 0
  if (value >= high) return 1
  return Math.log10(value / low) / Math.log10(high / low)
}

/**
 * Lower bound of a platform money / count bucket such as "1M₫+", "100K₫-500K₫", "11,4Tr ₫" or "1.2K".
 * Vietnamese "Tr" (triệu) is a million and "Tỷ" a billion; a comma is the decimal separator there.
 */
export function bucketLowerBound(text?: string) {
  if (!text) return undefined
  const match = String(text).replace(/\s+/g, '').match(/^([0-9]+(?:[.,][0-9]+)?)(K|M|B|Tr|Tỷ|N)?/i)
  if (!match) return undefined
  const base = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(base)) return undefined
  const unit = (match[2] || '').toLowerCase()
  const factor = unit === 'k' || unit === 'n' ? 1e3 : unit === 'm' || unit === 'tr' ? 1e6 : unit === 'b' || unit === 'tỷ' ? 1e9 : 1
  return base * factor
}

export type PoolHistory = {
  ourFulfilled: number
  ourOverdue: number
  ourGmv: number
  platformFulfillmentRate?: number
}

/**
 * Discovery score (0-100):
 *  - sales 35: median GMV (or the bucket's lower bound) 60% + items sold 40%, both log-scaled;
 *  - content 25: average shoppable-video views 60% (log) + engagement rate 40% (3% = full);
 *  - account 15: creator level 60% (Lv.6 = full) + followers 40% (log, 1K-1M);
 *  - history 25: our fulfilment rate when a sample came due, else the platform's sample-list rate
 *    (x0.9), else neutral 50%; a creator who already sold for us gets +20%, capped at 100%.
 */
export function poolScore(creator: Pick<CreatorHubPoolCreator, 'gmv' | 'gmvRange' | 'unitsSold' | 'avgViews' | 'engagementRate' | 'level' | 'followers'>, history: PoolHistory) {
  const gmv = creator.gmv ?? bucketLowerBound(creator.gmvRange)
  const sales = 0.6 * logScale(gmv, 1e5, 5e8) + 0.4 * logScale(creator.unitsSold, 10, 2e4)
  const content = 0.6 * logScale(creator.avgViews, 200, 2e5) + 0.4 * clamp01((creator.engagementRate ?? 0) / 0.03)
  const account = 0.6 * clamp01((creator.level ?? 0) / 6) + 0.4 * logScale(creator.followers, 1e3, 1e6)
  const due = history.ourFulfilled + history.ourOverdue
  let historyPart = due ? history.ourFulfilled / due : history.platformFulfillmentRate != null ? history.platformFulfillmentRate * 0.9 : 0.5
  if (history.ourGmv > 0) historyPart = Math.min(1, historyPart + 0.2)
  const parts: CreatorHubPoolScoreParts = {
    sales: Math.round(clamp01(sales) * POOL_WEIGHTS.sales),
    content: Math.round(clamp01(content) * POOL_WEIGHTS.content),
    account: Math.round(clamp01(account) * POOL_WEIGHTS.account),
    history: Math.round(clamp01(historyPart) * POOL_WEIGHTS.history),
  }
  return { score: parts.sales + parts.content + parts.account + parts.history, parts }
}

/** Joins pool creators with CRM rows (our samples, sales, profile) and scores them. */
export function buildPool(input: { pool: CreatorHubPoolCreator[]; crm: CreatorHubCrmRow[]; profiles: CreatorHubCreatorProfile[]; samples: CreatorHubSample[]; contacts?: CreatorHubContact[] }): CreatorHubPoolRow[] {
  const contactIndex = new Map((input.contacts || []).map((contact) => [contact.id, contact]))
  const crmIndex = new Map<string, CreatorHubCrmRow>()
  for (const row of input.crm) {
    if (row.creatorId) crmIndex.set(`${row.shopId}:id:${row.creatorId}`, row)
    if (row.creatorHandle) crmIndex.set(`${row.shopId}:h:${row.creatorHandle.toLowerCase()}`, row)
  }
  const profileIndex = new Map(input.profiles.map((profile) => [`${profile.shopId}:${profile.creatorId}`, profile]))
  const platformRate = new Map<string, number>()
  for (const sample of input.samples) {
    if (sample.platformFulfillmentRate == null) continue
    platformRate.set(`${sample.shopId}:${sample.creatorHandle.toLowerCase()}`, sample.platformFulfillmentRate)
    if (sample.creatorId) platformRate.set(`${sample.shopId}:${sample.creatorId}`, sample.platformFulfillmentRate)
  }

  return input.pool.map((creator) => {
    const handleKey = creator.handle.toLowerCase()
    const crm = crmIndex.get(`${creator.shopId}:id:${creator.creatorId}`) || crmIndex.get(`${creator.shopId}:h:${handleKey}`)
    const profile = profileIndex.get(`${creator.shopId}:${creator.creatorId}`) || (crm ? profileIndex.get(`${crm.shopId}:${crm.creatorId}`) : undefined)
    const platformFulfillmentRate = platformRate.get(`${creator.shopId}:${creator.creatorId}`) ?? platformRate.get(`${creator.shopId}:${handleKey}`)
    const history: PoolHistory = { ourFulfilled: crm?.fulfilled || 0, ourOverdue: crm?.overdue || 0, ourGmv: crm?.gmv || 0, platformFulfillmentRate }
    const { score, parts } = poolScore(creator, history)
    return {
      ...creator,
      score,
      tier: tierOf(score),
      parts,
      tags: profile?.tags || crm?.tags || [],
      note: profile?.note ?? crm?.note,
      blocked: profile?.blocked ?? crm?.blocked ?? false,
      ourSamples: crm?.samplesShipped || 0,
      ourFulfilled: history.ourFulfilled,
      ourOverdue: history.ourOverdue,
      ourFulfillmentRate: crm?.fulfillmentRate,
      ourGmv: history.ourGmv,
      ourVideos: crm?.videos || 0,
      platformFulfillmentRate,
      contact: contactIndex.get(creator.id),
    }
  })
}
