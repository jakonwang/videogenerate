import { contentIndex } from './contentIndex'
import { brandMemoryStore, reviewStore } from './stores'
import type { ContentLine, InsightsReport, LineStats } from './types'

const LINE_LABEL: Record<ContentLine, string> = {
  clone: '复刻',
  creative: 'tk创意室',
  livephoto: '图生视频',
  production: '批量混剪',
  publish: '发布',
}

export const REDO_REASON_LABEL: Record<string, string> = {
  product_mismatch: '商品不像',
  weird_motion: '动作别扭',
  blurry: '画面模糊',
  bad_composition: '构图不好',
  off_brand: '不符合品牌调性',
  subtitle_issue: '字幕问题',
  other: '其他',
}

/**
 * Feedback loop: production volume, review outcomes and publishing results per line and product.
 * Publishing performance (views / GMV) is not exposed by the current publishing channel, so the
 * "effect" signal here is the human approval rate plus publish success.
 */
export async function buildInsights(rangeDays = 7): Promise<InsightsReport> {
  const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000
  const [items, reviewDb, memory] = await Promise.all([contentIndex.listAll(), reviewStore.read(), brandMemoryStore.read()])
  const records = Object.values(reviewDb.records)
  const lines: ContentLine[] = ['clone', 'creative', 'livephoto', 'production']
  const publishItems = items.filter((item) => item.line === 'publish' && item.updatedAt >= since)
  const publishedSources = new Set(publishItems.filter((item) => item.status === 'ready').map((item) => item.sourceRef).filter(Boolean))

  const stats: LineStats[] = lines.map((line) => {
    const produced = items.filter((item) => item.line === line && item.status === 'ready' && item.updatedAt >= since)
    const decided = records.filter((record) => record.line === line && (record.decidedAt || 0) >= since)
    const approved = decided.filter((record) => record.decision === 'approved').length
    const redo = decided.filter((record) => record.decision === 'redo').length
    const discarded = decided.filter((record) => record.decision === 'discarded').length
    const total = approved + redo + discarded
    return {
      line,
      produced: produced.length,
      approved,
      redo,
      discarded,
      published: produced.filter((item) => publishedSources.has(item.ref)).length,
      approvalRate: total ? Math.round((approved / total) * 100) : 0,
    }
  })

  const reasonCounts = new Map<string, number>()
  for (const entry of memory.feedback) {
    if (entry.createdAt < since || entry.decision === 'approved' || !entry.reason) continue
    reasonCounts.set(entry.reason, (reasonCounts.get(entry.reason) || 0) + 1)
  }
  const topRedoReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason: REDO_REASON_LABEL[reason] || reason, count }))

  const productMap = new Map<string, { productId: string; productName: string; produced: number; approved: number; published: number }>()
  for (const item of items) {
    if (!item.productId || item.line === 'publish' || item.status !== 'ready' || item.updatedAt < since) continue
    const row = productMap.get(item.productId) || { productId: item.productId, productName: item.productName || item.productId, produced: 0, approved: 0, published: 0 }
    row.produced += 1
    if (reviewDb.records[item.ref]?.decision === 'approved') row.approved += 1
    if (publishedSources.has(item.ref)) row.published += 1
    productMap.set(item.productId, row)
  }
  const topProducts = [...productMap.values()].sort((a, b) => b.approved - a.approved || b.produced - a.produced).slice(0, 5)

  const publish = {
    total: publishItems.length,
    published: publishItems.filter((item) => item.status === 'ready').length,
    failed: publishItems.filter((item) => item.status === 'failed').length,
    draft: publishItems.filter((item) => item.status === 'draft').length,
  }

  const recommendations: string[] = []
  const reviewed = stats.filter((row) => row.approved + row.redo + row.discarded >= 3)
  if (reviewed.length >= 2) {
    const best = reviewed.slice().sort((a, b) => b.approvalRate - a.approvalRate)[0]
    const worstLine = reviewed.slice().sort((a, b) => a.approvalRate - b.approvalRate)[0]
    if (best.line !== worstLine.line && best.approvalRate - worstLine.approvalRate >= 15) {
      recommendations.push(`「${LINE_LABEL[best.line]}」通过率 ${best.approvalRate}%，高于「${LINE_LABEL[worstLine.line]}」的 ${worstLine.approvalRate}%，下周可多分配给前者。`)
    }
  }
  if (topRedoReasons[0] && topRedoReasons[0].count >= 3) {
    recommendations.push(`最常见的重做原因是「${topRedoReasons[0].reason}」（${topRedoReasons[0].count} 次），生成前可在品牌记忆中补充相关要求。`)
  }
  const unpublishedApproved = stats.reduce((sum, row) => sum + row.approved, 0) - stats.reduce((sum, row) => sum + row.published, 0)
  if (unpublishedApproved > 0) recommendations.push(`有 ${unpublishedApproved} 条已通过审核的内容还没有发布，可交给 AI 制片人生成发布草稿。`)
  if (topProducts[0]) recommendations.push(`「${topProducts[0].productName}」本周产出最多、通过最多，适合继续加量。`)
  const idle = stats.every((row) => row.produced === 0)
  if (idle) recommendations.push('本周期没有新产出，可以从「一个商品，一套内容」配方开始。')

  return { generatedAt: Date.now(), rangeDays, lines: stats, topRedoReasons, topProducts, publish, recommendations }
}
