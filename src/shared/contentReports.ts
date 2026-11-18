/**
 * 数据复盘和每日 / 每周简报的计算（电脑端内容中心和网页版共用）：
 * 输入是各条生产线的内容、审核记录和重做反馈，输出与电脑端 InsightsReport / Brief 相同的结构。
 */

export type ReportLine = 'clone' | 'creative' | 'livephoto' | 'production' | 'publish'
export type ReportStatus = 'running' | 'failed' | 'ready' | 'draft'
export type ReportLevel = 'ok' | 'warning' | 'error'

export type ReportItem = { ref: string; line: ReportLine; productId?: string; productName?: string; status: ReportStatus; error?: string; route: string; sourceRef?: string; updatedAt: number }
export type ReportReview = { ref: string; line: ReportLine; decision: 'pending' | 'approved' | 'redo' | 'discarded'; decidedAt?: number }
export type ReportFeedback = { decision: string; reason?: string; createdAt: number }

export type LineStats = { line: ReportLine; produced: number; approved: number; redo: number; discarded: number; published: number; approvalRate: number }
export type InsightsReport = {
  generatedAt: number
  rangeDays: number
  lines: LineStats[]
  topRedoReasons: Array<{ reason: string; count: number }>
  topProducts: Array<{ productId: string; productName: string; produced: number; approved: number; published: number }>
  publish: { total: number; published: number; failed: number; draft: number }
  recommendations: string[]
}
export type BriefItem = {
  kind: 'review_pending' | 'failed_work' | 'health' | 'publish_ready' | 'publish_failed' | 'running' | 'suggestion'
  level: ReportLevel
  title: string
  detail: string
  route?: string
  aiPrompt?: string
  count?: number
}
export type Brief = { id: string; kind: 'daily' | 'weekly'; periodKey: string; createdAt: number; headline: string; items: BriefItem[]; insights?: InsightsReport; summary?: string }

export const LINE_LABEL: Record<ReportLine, string> = { clone: '复刻', creative: 'tk创意室', livephoto: '图生视频', production: '批量混剪', publish: '发布' }

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
export function computeInsights(input: { items: ReportItem[]; reviews: Record<string, ReportReview>; feedback: ReportFeedback[]; rangeDays?: number; now?: number }): InsightsReport {
  const rangeDays = input.rangeDays ?? 7
  const now = input.now ?? Date.now()
  const since = now - rangeDays * 24 * 60 * 60 * 1000
  const items = input.items
  const records = Object.values(input.reviews)
  const lines: ReportLine[] = ['clone', 'creative', 'livephoto', 'production']
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
  for (const entry of input.feedback) {
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
    if (input.reviews[item.ref]?.decision === 'approved') row.approved += 1
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
    const best = reviewed.slice().sort((a, b) => b.approvalRate - a.approvalRate)[0]!
    const worstLine = reviewed.slice().sort((a, b) => a.approvalRate - b.approvalRate)[0]!
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

  return { generatedAt: now, rangeDays, lines: stats, topRedoReasons, topProducts, publish, recommendations }
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function weekKey(date = new Date()) {
  const monday = new Date(date)
  const offset = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - offset)
  return `W${dayKey(monday)}`
}

/** 每日简报的条目：待审核、失败任务、体检问题、生成中、发布失败 / 草稿 */
export function dailyBriefItems(input: { pendingReviews: number; items: ReportItem[]; health: Array<{ level: ReportLevel; title: string; detail: string; route?: string }>; now?: number; reviewRoute?: string; homeRoute?: string; publishRoute?: string }): BriefItem[] {
  const items: BriefItem[] = []
  const now = input.now ?? Date.now()
  const all = input.items
  if (input.pendingReviews) {
    items.push({ kind: 'review_pending', level: 'warning', title: `${input.pendingReviews} 条内容待你审核`, detail: 'AI 已完成生产，等待你通过 / 重做 / 丢弃。', route: input.reviewRoute ?? '/inbox', count: input.pendingReviews })
  }
  const since = now - 3 * 24 * 60 * 60 * 1000
  const failed = all.filter((item) => item.status === 'failed' && item.line !== 'publish' && item.updatedAt >= since)
  if (failed.length) {
    const byLine = new Map<string, number>()
    for (const item of failed) byLine.set(item.line, (byLine.get(item.line) || 0) + 1)
    items.push({
      kind: 'failed_work',
      level: 'error',
      title: `${failed.length} 个任务失败`,
      detail: [...byLine.entries()].map(([line, count]) => `${LINE_LABEL[line as ReportLine] || line} ${count}`).join(' · '),
      route: failed[0]!.route,
      count: failed.length,
      aiPrompt: '帮我检查最近失败的任务，说明失败原因，并给出重试方案。',
    })
  }
  for (const check of input.health.filter((item) => item.level !== 'ok')) {
    items.push({ kind: 'health', level: check.level, title: check.title, detail: check.detail, route: check.route })
  }
  const running = all.filter((item) => item.status === 'running' && item.line !== 'publish')
  if (running.length) {
    items.push({ kind: 'running', level: 'ok', title: `${running.length} 个任务正在生成`, detail: '后台运行中，完成后会自动进入审核收件箱。', route: input.homeRoute ?? '/home', count: running.length })
  }
  const publishFailed = all.filter((item) => item.line === 'publish' && item.status === 'failed' && item.updatedAt >= since)
  if (publishFailed.length) {
    items.push({ kind: 'publish_failed', level: 'error', title: `${publishFailed.length} 条发布失败`, detail: publishFailed[0]!.error || '请到发布中心查看原因。', route: input.publishRoute ?? '/publish', count: publishFailed.length })
  }
  const publishDrafts = all.filter((item) => item.line === 'publish' && item.status === 'draft')
  if (publishDrafts.length) {
    items.push({ kind: 'publish_ready', level: 'warning', title: `${publishDrafts.length} 条发布草稿待确认`, detail: '补充账号与商品后即可发布。', route: input.publishRoute ?? '/publish', count: publishDrafts.length })
  }
  if (!items.some((item) => item.level !== 'ok')) {
    items.push({ kind: 'suggestion', level: 'ok', title: '一切正常', detail: '可以给 AI 制片人一个新目标，比如为一个商品做一套内容。', aiPrompt: '看看商品库里哪些商品最近没有新内容，帮我挑一个做一套内容。' })
  }
  return items
}

export function dailyHeadline(items: BriefItem[]) {
  const problems = items.filter((item) => item.level !== 'ok').length
  return problems ? `今天有 ${problems} 件事需要你处理` : '今天一切就绪'
}

/** 每周简报：复盘建议 + 「生成下周内容计划」 */
export function weeklyBrief(insights: InsightsReport): { headline: string; items: BriefItem[] } {
  const produced = insights.lines.reduce((sum, row) => sum + row.produced, 0)
  const approved = insights.lines.reduce((sum, row) => sum + row.approved, 0)
  const items: BriefItem[] = insights.recommendations.map((text) => ({ kind: 'suggestion', level: 'ok', title: '建议', detail: text }))
  items.push({
    kind: 'suggestion',
    level: 'ok',
    title: '生成下周内容计划',
    detail: '让 AI 制片人根据本周复盘拟定下周计划，你审批后再执行。',
    aiPrompt: `根据本周复盘（产出 ${produced} 条，通过 ${approved} 条${insights.topProducts[0] ? `，表现最好的商品是「${insights.topProducts[0].productName}」` : ''}），帮我拟定下周的内容计划，优先使用通过率高的生产方式。`,
  })
  return { headline: `本周产出 ${produced} 条，通过 ${approved} 条`, items }
}

export const BRIEF_SUMMARY_SYSTEM = 'You are an AI content producer writing a short brief for a TikTok e-commerce content team. Reply in Simplified Chinese, at most 3 short sentences, concrete and actionable, no greetings.'
