import { createHash } from 'node:crypto'
import type { BusinessCreative, BusinessCreators, BusinessInsights, BusinessInventory, SyncBusinessDigest } from '../../../shared/cloud/selling'

/**
 * 经营摘要：把电脑端的数据复盘、达人中心、店小秘库存、tk创意室整理成一份小摘要给手机看。
 * 每个模块各自取数，没开通 / 出错的模块直接跳过，不影响其它模块。
 * 数据源以接口注入，测试时不用加载这些大模块。
 */

export type BusinessSources = {
  insights?: () => Promise<{
    rangeDays: number
    lines: Array<{ line: string; produced: number; approved: number; redo: number; published: number; approvalRate: number }>
    topProducts: Array<{ productName: string; produced: number; approved: number; published: number }>
    topRedoReasons: Array<{ reason: string; count: number }>
    publish: { total: number; published: number; failed: number; draft: number }
    recommendations: string[]
  }>
  creators?: () => Promise<{ totals: Omit<BusinessCreators, 'shopCount'> & Record<string, unknown>; shops: unknown[] }>
  inventory?: () => Promise<{
    items: Array<{ sku: string; imageUrl?: string; currentStock: number; averageDaily: number; daysToStockout?: number; risk: string }>
    auth: { authenticated: boolean }
    summary: { skuCount: number; outOfStockCount: number; reorderCount: number; lastSyncAt?: number }
  }>
  creative?: () => Promise<Array<{ id: string; productName?: string; status: string; totalShots: number; completedShots: number; failedShots: number; lastError?: string; createdAt: number }>>
}

async function safely<T>(load: (() => Promise<T>) | undefined): Promise<T | undefined> {
  if (!load) return undefined
  try {
    return await load()
  } catch {
    return undefined // module not set up on this computer
  }
}

export async function buildBusinessDigest(sources: BusinessSources, now = Date.now()): Promise<SyncBusinessDigest> {
  const [insights, creators, inventory, creative] = await Promise.all([
    safely(sources.insights),
    safely(sources.creators),
    safely(sources.inventory),
    safely(sources.creative),
  ])
  const digest: SyncBusinessDigest = { generatedAt: now }

  if (insights && (insights.lines.some((line) => line.produced > 0) || insights.publish.total > 0)) {
    digest.insights = {
      rangeDays: insights.rangeDays,
      lines: insights.lines.map(({ line, produced, approved, redo, published, approvalRate }) => ({ line, produced, approved, redo, published, approvalRate })),
      topProducts: insights.topProducts.slice(0, 8).map(({ productName, produced, approved, published }) => ({ productName, produced, approved, published })),
      topRedoReasons: insights.topRedoReasons.slice(0, 5),
      publish: insights.publish,
      recommendations: insights.recommendations.slice(0, 6),
    } satisfies BusinessInsights
  }

  if (creators && creators.shops.length) {
    const t = creators.totals
    digest.creators = {
      shopCount: creators.shops.length,
      gmv: t.gmv,
      previousGmv: t.previousGmv,
      commission: t.commission,
      orders: t.orders,
      previousOrders: t.previousOrders,
      itemsSold: t.itemsSold,
      videos: t.videos,
      lives: t.lives,
      creatorsWithSales: t.creatorsWithSales,
      creatorsPosting: t.creatorsPosting,
      pendingReview: t.pendingReview,
      awaitingContent: t.awaitingContent,
      overdueSamples: t.overdueSamples,
      fulfillmentRate: t.fulfillmentRate,
      sampleFunnel: t.sampleFunnel,
    } satisfies BusinessCreators
  }

  if (inventory && inventory.summary.skuCount > 0) {
    digest.inventory = {
      ...inventory.summary,
      authenticated: inventory.auth.authenticated,
      atRisk: inventory.items
        .filter((item) => item.risk === 'out_of_stock' || item.risk === 'reorder')
        .sort((a, b) => (a.daysToStockout ?? -1) - (b.daysToStockout ?? -1))
        .slice(0, 30)
        .map((item) => ({ sku: item.sku, imageUrl: item.imageUrl, currentStock: item.currentStock, averageDaily: Math.round(item.averageDaily * 10) / 10, daysToStockout: item.daysToStockout, risk: item.risk as 'out_of_stock' | 'reorder' })),
    } satisfies BusinessInventory
  }

  if (creative && creative.length) {
    const sorted = [...creative].sort((a, b) => b.createdAt - a.createdAt)
    digest.creative = {
      total: creative.length,
      running: creative.filter((task) => task.status === 'running').length,
      needsAttention: creative.filter((task) => task.status === 'requires_manual' || task.status === 'failed').length,
      completed: creative.filter((task) => task.status === 'completed').length,
      recent: sorted.slice(0, 15).map((task) => ({
        id: task.id,
        productName: task.productName || '未命名',
        status: task.status,
        totalShots: task.totalShots,
        completedShots: task.completedShots,
        failedShots: task.failedShots,
        lastError: task.lastError?.slice(0, 160),
        createdAt: task.createdAt,
      })),
    } satisfies BusinessCreative
  }
  return digest
}

export function businessFingerprint(digest: SyncBusinessDigest) {
  const { generatedAt: _generatedAt, ...content } = digest
  return createHash('sha1').update(JSON.stringify(content)).digest('hex')
}

export function isEmptyBusinessDigest(digest: SyncBusinessDigest) {
  return !digest.insights && !digest.creators && !digest.inventory && !digest.creative
}

/** 默认数据源：按需加载电脑端各模块（只在需要时才加载） */
export const DEFAULT_BUSINESS_SOURCES: BusinessSources = {
  insights: async () => (await import('../content-hub/service')).contentHubService.insights(7),
  creators: async () => (await import('../tiktok-creator-hub/service')).creatorHubService.getOverview() as any,
  inventory: async () => (await import('../dianxiaomi-inventory/service')).dianxiaomiInventoryService.getDashboard() as any,
  creative: async () => (await import('../tiktok-creative-studio/service')).tiktokCreativeStudioService.listSummary() as any,
}
