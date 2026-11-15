// Shared contract for the TikTok creator hub plugin (main <-> renderer).

export type CreatorHubLoginState = 'none' | 'valid' | 'expired'

export type CreatorHubShop = {
  id: string
  name: string
  region: string
  shopId: string
  shopCode?: string
  sellerName?: string
  timezone?: string
  loginState: CreatorHubLoginState
  cookieImportedAt?: number
  cookieExpiresAt?: number
  lastVerifiedAt?: number
  lastSyncAt?: number
  lastSyncError?: string
  createdAt: number
  updatedAt: number
}

/** Platform tab ids of the affiliate sample request list. */
export const CREATOR_HUB_SAMPLE_TABS = {
  all: 0,
  pendingReview: 10,
  readyToShip: 20,
  shipped: 30,
  inProgress: 40,
  cancelled: 50,
  completed: 100,
} as const

/** Normalised sample stage derived from the platform `curr_status`. */
export type CreatorHubSampleStage = 'pending_review' | 'ready_to_ship' | 'shipped' | 'awaiting_content' | 'completed' | 'cancelled' | 'unknown'

export type CreatorHubSample = {
  id: string // `${shopId}:${applyId}`
  shopId: string // internal shop id (CreatorHubShop.id)
  applyId: string
  creatorId: string
  creatorHandle: string
  creatorNickname: string
  creatorAvatar?: string
  followers: number
  creatorGmvText?: string
  platformFulfillmentRate?: number // 0..1, as shown by TikTok
  productId: string
  productTitle: string
  skuId: string
  skuDesc?: string
  skuImage?: string
  commissionRate?: number // 0..1
  status: number // platform curr_status
  stage: CreatorHubSampleStage
  sampleOrderId?: string
  hasSampleOrder: boolean
  sourceType?: number
  contentType?: number
  createdAt: number
  fulfillmentExpireAt?: number
  platformOverdue: boolean
  /** Per-sample cost override (shop currency). */
  costOverride?: number
  note?: string
  firstSeenAt: number
  syncedAt: number
}

export type CreatorHubProductCost = {
  id: string // `${shopId}:${productId}:${skuId || '*'}`
  shopId: string
  productId: string
  skuId?: string
  productTitle?: string
  unitCost: number
  shippingCost: number
  updatedAt: number
}

export type CreatorHubSettings = {
  /** Days a creator has to post content after receiving the sample. */
  fulfillmentWindowDays: number
  /** Days assumed between the application and the sample arriving (no delivery time is exposed). */
  logisticsBufferDays: number
  /** Days of creator / video performance pulled per sync (ends yesterday, shop time). */
  analyticsWindowDays: number
  /** Days of affiliate orders pulled per sync. */
  orderWindowDays: number
}

export const CREATOR_HUB_DEFAULT_SETTINGS: CreatorHubSettings = { fulfillmentWindowDays: 30, logisticsBufferDays: 7, analyticsWindowDays: 28, orderWindowDays: 30 }

export type CreatorHubSampleFulfillment = 'fulfilled' | 'overdue' | 'pending' | 'not_shipped' | 'excluded'

export type CreatorHubCreatorStat = {
  shopId: string
  creatorId: string
  creatorHandle: string
  creatorNickname: string
  creatorAvatar?: string
  followers: number
  platformFulfillmentRate?: number
  applications: number
  shipped: number
  fulfilled: number
  overdue: number
  pending: number
  /** fulfilled / (fulfilled + overdue); undefined while nothing is due yet. */
  fulfillmentRate?: number
  sampleCost: number
  missingCost: number
  lastAppliedAt: number
}

export type CreatorHubFulfillmentSummary = {
  creators: number
  applications: number
  shipped: number
  fulfilled: number
  overdue: number
  pending: number
  sampleCost: number
  fulfillmentRate?: number
}

export type CreatorHubFulfillmentReport = { settings: CreatorHubSettings; creators: CreatorHubCreatorStat[]; summary: CreatorHubFulfillmentSummary }

export type CreatorHubSyncStage = 'samples' | 'creators' | 'videos' | 'orders'
export const CREATOR_HUB_SYNC_STAGES: CreatorHubSyncStage[] = ['samples', 'creators', 'videos', 'orders']

export type CreatorHubSyncJob = {
  id: string
  shopId: string
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  finishedAt?: number
  /** Stage currently running (or the last one reached). */
  stage?: CreatorHubSyncStage
  pages: number
  rows: number
  total?: number
  /** Rows saved per stage. */
  stageRows?: Partial<Record<CreatorHubSyncStage, number>>
  /** Stages that failed without stopping the others (e.g. a page the account cannot open). */
  stageErrors?: Partial<Record<CreatorHubSyncStage, string>>
  error?: string
}

export type CreatorHubSyncProgress = {
  shopId: string
  stage?: CreatorHubSyncStage
  pages: number
  rows: number
  total?: number
  status: CreatorHubSyncJob['status']
  stageErrors?: CreatorHubSyncJob['stageErrors']
  error?: string
}

/** Time window a performance snapshot covers (ms, shop-local day boundaries). */
export type CreatorHubWindow = { start: number; end: number }

export type CreatorHubVideo = {
  id: string // `${shopId}:${itemId}`
  shopId: string
  itemId: string
  title: string
  cover?: string
  postedAt: number
  creatorId: string
  creatorHandle: string
  creatorNickname: string
  creatorAvatar?: string
  followers: number
  productIds: string[]
  productTitles: string[]
  gmv: number
  orders: number
  itemsSold: number
  views: number
  likes: number
  comments: number
  shares: number
  refundedGmv: number
  refundedItems: number
  commission: number
  /** 0..1 */
  finishRate?: number
  /** 0..1 product click-through rate */
  ctr?: number
  gpm: number
  aov: number
  productImpressions: number
  productClicks: number
  window: CreatorHubWindow
  syncedAt: number
}

export type CreatorHubPerfMetrics = {
  gmv: number
  refundedGmv: number
  commission: number
  orders: number
  itemsSold: number
  refundedItems: number
  videos: number
  lives: number
  samplesShipped: number
  sampleContent: number
  views: number
  videoGmv: number
  liveGmv: number
  productCardGmv: number
}

export type CreatorHubCreatorPerf = {
  id: string // `${shopId}:${creatorId}`
  shopId: string
  creatorId: string
  creatorHandle: string
  creatorNickname: string
  creatorAvatar?: string
  followers: number
  metrics: CreatorHubPerfMetrics
  previous?: CreatorHubPerfMetrics
  window: CreatorHubWindow
  syncedAt: number
}

export type CreatorHubContentType = 'video' | 'live' | 'showcase' | 'other'

export type CreatorHubOrder = {
  id: string // `${shopId}:${orderId}:${skuId}`
  shopId: string
  orderId: string
  skuId: string
  productId?: string
  productTitle?: string
  creatorId: string
  creatorHandle: string
  creatorNickname: string
  contentId?: string
  contentType: CreatorHubContentType
  createdAt: number
  unitPrice: number
  quantity: number
  /** unitPrice x quantity */
  amount: number
  refundQuantity: number
  returnQuantity: number
  settlementStatus: number
  settledAt?: number
  commissionBase: number
  actualCommissionBase?: number
  estCommission: number
  actualCommission?: number
  estAdsCommission: number
  standardRate?: number
  adsRate?: number
  currency?: string
  syncedAt: number
}

export type CreatorHubCreatorProfile = {
  id: string // `${shopId}:${creatorId}`
  shopId: string
  creatorId: string
  tags: string[]
  note?: string
  blocked: boolean
  updatedAt: number
}

export type CreatorHubTier = 'A' | 'B' | 'C' | 'D'

/** One row of the creator CRM: platform performance + sample fulfilment + local profile. */
export type CreatorHubCrmRow = {
  key: string // `${shopId}:${creatorId}`
  shopId: string
  creatorId: string
  creatorHandle: string
  creatorNickname: string
  creatorAvatar?: string
  followers: number
  gmv: number
  commission: number
  orders: number
  videos: number
  lives: number
  refundRate?: number
  samplesShipped: number
  fulfilled: number
  overdue: number
  fulfillmentRate?: number
  sampleCost: number
  /** GMV in the window per unit of sample cost. */
  sampleRoi?: number
  score: number
  tier: CreatorHubTier
  tags: string[]
  note?: string
  blocked: boolean
  lastAppliedAt?: number
}

export type CreatorHubShopOverview = {
  shopId: string
  window?: CreatorHubWindow
  gmv: number
  previousGmv?: number
  refundedGmv: number
  commission: number
  previousCommission?: number
  orders: number
  previousOrders?: number
  itemsSold: number
  videos: number
  lives: number
  creatorsWithSales: number
  creatorsPosting: number
  pendingReview: number
  awaitingContent: number
  overdueSamples: number
  productsMissingCost: number
  fulfillmentRate?: number
  sampleFunnel: { applications: number; shipped: number; fulfilled: number; withSales: number }
}

export type CreatorHubOverview = { totals: CreatorHubShopOverview; shops: CreatorHubShopOverview[] }

export type CreatorHubImportCookiesInput = { cookieJson: string; shopId?: string; name?: string }
