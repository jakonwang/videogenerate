/**
 * 第四阶段：经营数据在电脑端（持有 TikTok 授权），通过云端同步给手机看。
 *
 * GMV Max：电脑端每次同步时发布一份摘要（gmv-digest/current）；手机上对 AI 建议点「批准 / 拒绝」
 * 写进 gmv-decisions（记录 id = 建议 id），电脑端下次同步时按原有流程执行（含急停、动作锁等保护），
 * 再把执行结果写回同一条记录。手机永远不直接操作 TikTok。
 */

export const GMV_DIGEST_ID = 'current'
export const GMV_DIGEST_MAX_CAMPAIGNS = 20
export const GMV_DIGEST_MAX_RECOMMENDATIONS = 25

export type GmvDigestTotals = { spend: number; gmv: number; orders: number; roi: number }

export type GmvDigestCampaign = {
  id: string
  name: string
  type: 'PRODUCT' | 'LIVE'
  status: string
  budget: string
  roasBid: string
} & GmvDigestTotals

export type GmvDigestRecommendation = {
  id: string
  campaignId: string
  campaignName: string
  kind: 'scale_up' | 'scale_down'
  actionType: string
  risk: 'low' | 'medium' | 'high'
  currentBudget: string
  proposedBudget: string
  currentRoasBid: string
  proposedRoasBid: string
  reason: string
  projectedGmvDelta?: string
  confidence?: number
  createdAt: number
}

export type SyncGmvDigest = {
  /** 电脑端生成摘要的时间 */
  generatedAt: number
  connected: boolean
  accountName?: string
  emergencyStopped: boolean
  range: { startDate: string; endDate: string }
  totals: GmvDigestTotals
  /** 按花费排序的前 20 个计划 */
  campaigns: GmvDigestCampaign[]
  pending: GmvDigestRecommendation[]
  pendingCount: number
}

export type SyncGmvDecision = {
  decision: 'approve' | 'reject'
  decidedAt: number
  /** 电脑端执行后写回 */
  result?: 'executed' | 'rejected' | 'failed' | 'skipped'
  resultAt?: number
  error?: string
  campaignName?: string
  summary?: string
}

export function numberOf(value: unknown) {
  const num = Number(String(value ?? '').replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(num) ? num : 0
}

/* ------------------------------------------------------------------ 经营摘要（数据复盘 / 达人 / 库存 / 创意室） */

export const BUSINESS_DIGEST_ID = 'current'

/** 数据复盘：内容生产线近 N 天的产出、通过、发布 */
export type BusinessInsights = {
  rangeDays: number
  lines: Array<{ line: string; produced: number; approved: number; redo: number; published: number; approvalRate: number }>
  topProducts: Array<{ productName: string; produced: number; approved: number; published: number }>
  topRedoReasons: Array<{ reason: string; count: number }>
  publish: { total: number; published: number; failed: number; draft: number }
  recommendations: string[]
}

/** 达人中心：联盟带货概况（所有店铺合计） */
export type BusinessCreators = {
  shopCount: number
  gmv: number
  previousGmv?: number
  commission: number
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
  fulfillmentRate?: number
  sampleFunnel: { applications: number; shipped: number; fulfilled: number; withSales: number }
}

/** 店小秘库存：缺货 / 需补货的 SKU */
export type BusinessInventory = {
  skuCount: number
  outOfStockCount: number
  reorderCount: number
  lastSyncAt?: number
  authenticated: boolean
  atRisk: Array<{ sku: string; imageUrl?: string; currentStock: number; averageDaily: number; daysToStockout?: number; risk: 'out_of_stock' | 'reorder' }>
}

/** tk创意室：创意视频任务进度 */
export type BusinessCreative = {
  total: number
  running: number
  needsAttention: number
  completed: number
  recent: Array<{ id: string; productName: string; status: string; totalShots: number; completedShots: number; failedShots: number; lastError?: string; createdAt: number }>
}

export type SyncBusinessDigest = {
  generatedAt: number
  insights?: BusinessInsights
  creators?: BusinessCreators
  inventory?: BusinessInventory
  creative?: BusinessCreative
}


/* ------------------------------------------------------------------ tk创意室（网页 / 手机下单，电脑代跑） */

/** 网页或手机提交的 tk创意室任务；电脑端用自己的 TikTok 创意账号执行并把结果回传 */
export type SyncCreativeRequest = {
  /** 云端商品记录 id（products 集合） */
  productId: string
  productName?: string
  /** 参考场景图（云端文件 id），每张出一条视频 */
  referenceFileIds: string[]
  mode?: 'reference_to_video' | 'image_to_video'
  /**
   * 同款参考视频（云端文件 id）：有它时电脑先分析这条视频，再出一条同款视频，referenceFileIds 为空。
   * 不认识这个字段的旧版电脑端会因「没有参考图」直接报失败，不会拿错素材出片。
   */
  styleVideoFileId?: string
  styleVideoName?: string
  /** 同款参考视频的封面（云端文件 id），网页列表里显示 */
  styleVideoPosterFileId?: string
  createdAt: number
  /** pending = 等电脑接单；running = 电脑在出片；completed / failed / skipped 为最终状态 */
  state: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  /** 电脑端 tk创意室任务 id */
  taskId?: string
  shots?: Array<{ status: 'running' | 'completed' | 'failed'; outputFileId?: string; error?: string }>
  error?: string
  /** 电脑端最后一次回报的时间 */
  reportedAt?: number
}

export const CREATIVE_REQUEST_MAX_IMAGES = 6
