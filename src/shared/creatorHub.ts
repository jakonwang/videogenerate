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

// ===== Creator discovery (marketplace search -> local creator pool) =====

/** Level-1 product categories of the affiliate creator marketplace (id -> English name). */
export const CREATOR_HUB_MARKET_CATEGORIES: Array<{ id: string; name: string }> = [
  { id: '605248', name: 'Fashion Accessories' },
  { id: '953224', name: 'Jewelry Accessories & Derivatives' },
  { id: '601450', name: 'Beauty & Personal Care' },
  { id: '601152', name: 'Womenswear & Underwear' },
  { id: '824328', name: 'Menswear & Underwear' },
  { id: '601303', name: 'Muslim Fashion' },
  { id: '601352', name: 'Shoes' },
  { id: '824584', name: 'Luggage & Bags' },
  { id: '802184', name: "Kids' Fashion" },
  { id: '602284', name: 'Baby & Maternity' },
  { id: '700437', name: 'Food & Beverages' },
  { id: '700645', name: 'Health' },
  { id: '600001', name: 'Home Supplies' },
  { id: '600024', name: 'Kitchenware' },
  { id: '600154', name: 'Textiles & Soft Furnishings' },
  { id: '600942', name: 'Household Appliances' },
  { id: '604453', name: 'Furniture' },
  { id: '604968', name: 'Home Improvement' },
  { id: '604579', name: 'Tools & Hardware' },
  { id: '601739', name: 'Phones & Electronics' },
  { id: '601755', name: 'Computers & Office Equipment' },
  { id: '602118', name: 'Pet Supplies' },
  { id: '603014', name: 'Sports & Outdoor' },
  { id: '604206', name: 'Toys & Hobbies' },
  { id: '605196', name: 'Automotive & Motorcycle' },
  { id: '951432', name: 'Collectibles' },
  { id: '834312', name: 'Virtual Products' },
]

/** Bucket ids used by the marketplace filters (1-based, as the platform sends them). */
export const CREATOR_HUB_GMV_GROUPS = [
  { id: 1, label: '0-50K' },
  { id: 2, label: '50K-100K' },
  { id: 3, label: '100K-500K' },
  { id: 4, label: '500K-1M' },
  { id: 5, label: '1M+' },
] as const
export const CREATOR_HUB_UNITS_GROUPS = [
  { id: 1, label: '0-10' },
  { id: 2, label: '10-100' },
  { id: 3, label: '100-1,000' },
  { id: 4, label: '1,000+' },
] as const

/** One marketplace search: the filters map onto the platform's own `filter_params`. */
export type CreatorHubDiscoverQuery = {
  shopId: string
  keyword?: string
  categoryIds?: string[]
  followersMin?: number
  followersMax?: number
  gmvGroups?: number[]
  unitsGroups?: number[]
  starOnly?: boolean
  /** Pages of 20 creators to fetch (1-10). */
  pages?: number
}

export type CreatorHubDiscoverResult = { fetched: number; added: number; updated: number; pages: number; hasMore: boolean }

export type CreatorHubTopVideo = { itemId: string; title: string; plays: number; likes: number; comments: number; postedAt?: number; products: string[] }

/** A marketplace creator as last seen by a search (platform data only). */
export type CreatorHubPoolCreator = {
  id: string // `${shopId}:${creatorId}`
  shopId: string
  creatorId: string // creator_oecuid
  handle: string
  nickname: string
  avatar?: string
  region?: string
  followers: number
  level?: number
  categories: string[]
  /** Median monthly GMV when the platform discloses it (shop currency). */
  gmv?: number
  /** Platform GMV bucket text, e.g. "1M₫+". */
  gmvRange?: string
  videoGmv?: number
  liveGmv?: number
  unitsSold: number
  /** Average / median views of the creator's shoppable videos. */
  avgViews: number
  medianViews: number
  /** 0..1 */
  engagementRate?: number
  liveAvgViewers: number
  videoGpmMin?: number
  videoGpmMax?: number
  topGender?: { key: string; share?: number }
  topAges: string[]
  risingStar: boolean
  invitedIn90d: boolean
  collaborated: boolean
  blockedByShop: boolean
  topVideos: CreatorHubTopVideo[]
  /** Local fields. */
  starred: boolean
  sources: string[]
  firstSeenAt: number
  lastSeenAt: number
}

// ===== Creator contacts (Zalo outreach) =====

export type CreatorHubContactStatus = 'none' | 'contacted' | 'replied' | 'agreed' | 'declined'
export const CREATOR_HUB_CONTACT_STATUSES: CreatorHubContactStatus[] = ['none', 'contacted', 'replied', 'agreed', 'declined']
export type CreatorHubContactChannel = 'zalo' | 'email' | 'phone' | 'other'
export type CreatorHubContactLog = { at: number; channel: CreatorHubContactChannel; note?: string }

/** Contact details and outreach state of one creator in one shop (local only, never uploaded). */
export type CreatorHubContact = {
  id: string // `${shopId}:${creatorId}`
  shopId: string
  creatorId: string
  handle: string
  zalo?: string
  phone?: string
  email?: string
  /** TikTok bio as last read from the creator profile. */
  bio?: string
  /** The platform says the creator shared contact info (visible on the backend creator page). */
  contactInfoAvailable?: boolean
  bioFetchedAt?: number
  status: CreatorHubContactStatus
  lastContactAt?: number
  log: CreatorHubContactLog[]
  updatedAt: number
}

export type CreatorHubContactInput = {
  shopId: string
  creatorId: string
  handle: string
  zalo?: string | null
  phone?: string | null
  email?: string | null
  status?: CreatorHubContactStatus
}

export type CreatorHubFetchContactsResult = { checked: number; failed: number; withZalo: number; withPhone: number; withEmail: number; onBackend: number }

export type CreatorHubMessageTemplate = { id: string; name: string; body: string; updatedAt: number }

export type CreatorHubPoolScoreParts ={ sales: number; content: number; account: number; history: number }

/** Pool creator joined with this shop's own history and the local profile. */
export type CreatorHubPoolRow = CreatorHubPoolCreator & {
  score: number
  tier: CreatorHubTier
  parts: CreatorHubPoolScoreParts
  tags: string[]
  note?: string
  blocked: boolean
  ourSamples: number
  ourFulfilled: number
  ourOverdue: number
  ourFulfillmentRate?: number
  ourGmv: number
  ourVideos: number
  /** Sample-list fulfilment rate the platform shows for this creator (0..1). */
  platformFulfillmentRate?: number
  contact?: CreatorHubContact
}

export type CreatorHubCreatorDetail = {
  pool?: CreatorHubPoolRow
  crm?: CreatorHubCrmRow
  contact?: CreatorHubContact
  samples: CreatorHubSample[]
  videos: CreatorHubVideo[]
  orders: { count: number; amount: number; commission: number; refunded: number; lastAt?: number }
}
