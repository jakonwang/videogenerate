import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { captionSimilarity } from '../mix-studio/insights'
import { profitOf, readProductMargins, type ProductMargin } from './productMargin'
import type { AccountProfit, PublishProfitReport, TaskProfit } from '../../../shared/publishProfit'

/**
 * 发布中心的利润：每条已发布的任务对上 GMV MAX 里的素材（TikTok 把发布时的标题当素材名），
 * 再按账号加总。矩阵发布每个号的文案不同，所以能一条对一条。
 * 只看近 30 天；对不上的任务不算进利润，界面单独显示「未匹配」条数。
 */

export const PUBLISH_PROFIT_WINDOW_DAYS = 30
const MIN_SIMILARITY = 0.6

export type PublishTaskForProfit = {
  id: string
  state?: string
  connectionUid?: string
  connectionName?: string
  productId?: string
  videoTitle?: string
  description?: string
}
export type CreativeForProfit = { creativeId: string; name: string; productId: string; spend: number; revenue: number; orders: number }
export type { TaskProfit, AccountProfit } from '../../../shared/publishProfit'

const round = (value: number) => Math.round(value * 100) / 100

/** 已发布任务 → 素材：同一商品内按标题相似度从高到低一对一配对。 */
export function matchTasksToCreatives(tasks: PublishTaskForProfit[], creatives: CreativeForProfit[]) {
  const candidates: Array<{ taskId: string; creativeId: string; score: number }> = []
  for (const task of tasks) {
    if (task.state !== 'published' || !task.productId) continue
    const captions = [task.videoTitle, task.description].map((value) => String(value || '').trim()).filter(Boolean)
    if (!captions.length) continue
    for (const creative of creatives) {
      if (creative.productId !== task.productId || !creative.name) continue
      const score = Math.max(...captions.map((caption) => captionSimilarity(caption, creative.name)))
      if (score >= MIN_SIMILARITY) candidates.push({ taskId: task.id, creativeId: creative.creativeId, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const usedTasks = new Set<string>()
  const usedCreatives = new Set<string>()
  const out = new Map<string, string>()
  for (const candidate of candidates) {
    if (usedTasks.has(candidate.taskId) || usedCreatives.has(candidate.creativeId)) continue
    usedTasks.add(candidate.taskId)
    usedCreatives.add(candidate.creativeId)
    out.set(candidate.taskId, candidate.creativeId)
  }
  return out
}

export function buildPublishProfit(input: { tasks: PublishTaskForProfit[]; creatives: CreativeForProfit[]; margins: Map<string, ProductMargin> }): PublishProfitReport {
  const match = matchTasksToCreatives(input.tasks, input.creatives)
  const creativeById = new Map(input.creatives.map((creative) => [creative.creativeId, creative]))
  const byTask: Record<string, TaskProfit> = {}
  for (const [taskId, creativeId] of match) {
    const creative = creativeById.get(creativeId)!
    const margin = input.margins.get(creative.productId)
    byTask[taskId] = {
      creativeId,
      creativeName: creative.name,
      spend: round(creative.spend),
      revenue: round(creative.revenue),
      orders: creative.orders,
      roi: creative.spend > 0 ? round(creative.revenue / creative.spend) : 0,
      ...(margin ? { profit: profitOf({ revenue: creative.revenue, spend: creative.spend, marginRate: margin.marginRate }) } : {}),
    }
  }
  const accounts = new Map<string, AccountProfit & { profitSum: number }>()
  for (const task of input.tasks) {
    if (task.state !== 'published' || !task.connectionUid) continue
    const row = accounts.get(task.connectionUid) || { uid: task.connectionUid, name: task.connectionName || task.connectionUid, published: 0, matched: 0, spend: 0, revenue: 0, orders: 0, roi: 0, missingCost: 0, profitSum: 0 }
    row.published += 1
    const profit = byTask[task.id]
    if (profit) {
      row.matched += 1
      row.spend += profit.spend
      row.revenue += profit.revenue
      row.orders += profit.orders
      if (profit.profit === undefined) row.missingCost += 1
      else row.profitSum += profit.profit
    }
    accounts.set(task.connectionUid, row)
  }
  const byAccount: AccountProfit[] = [...accounts.values()].map(({ profitSum, ...row }) => ({
    ...row,
    spend: round(row.spend),
    revenue: round(row.revenue),
    roi: row.spend > 0 ? round(row.revenue / row.spend) : 0,
    ...(row.matched > 0 && row.missingCost === 0 ? { profit: round(profitSum) } : {}),
  }))
  byAccount.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity) || b.revenue - a.revenue)
  return { windowDays: PUBLISH_PROFIT_WINDOW_DAYS, byTask, byAccount }
}

function dayKey(offsetDays: number, now: number) {
  return new Date(now - offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export function readCreativesForProducts(productIds: string[], now = Date.now()): CreativeForProfit[] {
  if (!productIds.length) return []
  let rows: ReturnType<typeof gmvMaxRepo.listCreativeDailyForProducts> = []
  try {
    rows = gmvMaxRepo.listCreativeDailyForProducts(productIds, dayKey(PUBLISH_PROFIT_WINDOW_DAYS - 1, now), dayKey(0, now))
  } catch {
    return []
  }
  const byId = new Map<string, CreativeForProfit>()
  for (const row of rows) {
    const entry = byId.get(row.creativeId) || { creativeId: row.creativeId, name: '', productId: String(row.productId || ''), spend: 0, revenue: 0, orders: 0 }
    entry.name = entry.name || String(row.creativeName || '').trim()
    entry.spend += Number(row.cost) || 0
    entry.revenue += Number(row.grossRevenue) || 0
    entry.orders += Number(row.orders) || 0
    byId.set(row.creativeId, entry)
  }
  return [...byId.values()]
}

export function publishProfitReport(tasks: PublishTaskForProfit[], now = Date.now()) {
  const productIds = [...new Set(tasks.filter((task) => task.state === 'published' && task.productId).map((task) => String(task.productId)))]
  return buildPublishProfit({ tasks, creatives: readCreativesForProducts(productIds, now), margins: readProductMargins(productIds) })
}
