import { randomUUID } from 'node:crypto'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion } from '../clone/unifiedChat'
import { contentIndex } from './contentIndex'
import { getHealthReport } from './healthCheck'
import { buildInsights } from './insights'
import { reviewInbox } from './reviewInbox'
import { briefStore } from './stores'
import type { Brief, BriefItem } from './types'

function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function weekKey(date = new Date()) {
  const monday = new Date(date)
  const offset = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - offset)
  return `W${dayKey(monday)}`
}

const LINE_LABEL: Record<string, string> = {
  clone: '复刻',
  creative: 'tk创意室',
  livephoto: '图生视频',
  production: '批量混剪',
  publish: '发布',
}

async function dailyItems(): Promise<BriefItem[]> {
  const items: BriefItem[] = []
  const [counts, all, health] = await Promise.all([reviewInbox.counts(), contentIndex.listAll(), getHealthReport(30 * 60_000)])
  if (counts.pending) {
    items.push({ kind: 'review_pending', level: 'warning', title: `${counts.pending} 条内容待你审核`, detail: 'AI 已完成生产，等待你通过 / 重做 / 丢弃。', route: '/inbox', count: counts.pending })
  }
  const since = Date.now() - 3 * 24 * 60 * 60 * 1000
  const failed = all.filter((item) => item.status === 'failed' && item.line !== 'publish' && item.updatedAt >= since)
  if (failed.length) {
    const byLine = new Map<string, number>()
    for (const item of failed) byLine.set(item.line, (byLine.get(item.line) || 0) + 1)
    items.push({
      kind: 'failed_work',
      level: 'error',
      title: `${failed.length} 个任务失败`,
      detail: [...byLine.entries()].map(([line, count]) => `${LINE_LABEL[line] || line} ${count}`).join(' · '),
      route: failed[0].route,
      count: failed.length,
      aiPrompt: '帮我检查最近失败的任务，说明失败原因，并给出重试方案。',
    })
  }
  for (const check of health.items.filter((item) => item.level !== 'ok')) {
    items.push({ kind: 'health', level: check.level, title: check.title, detail: check.detail, route: check.route })
  }
  const running = all.filter((item) => item.status === 'running' && item.line !== 'publish')
  if (running.length) {
    items.push({ kind: 'running', level: 'ok', title: `${running.length} 个任务正在生成`, detail: '后台运行中，完成后会自动进入审核收件箱。', route: '/home', count: running.length })
  }
  const publishFailed = all.filter((item) => item.line === 'publish' && item.status === 'failed' && item.updatedAt >= since)
  if (publishFailed.length) {
    items.push({ kind: 'publish_failed', level: 'error', title: `${publishFailed.length} 条发布失败`, detail: publishFailed[0].error || '请到发布中心查看原因。', route: '/publish', count: publishFailed.length })
  }
  const publishDrafts = all.filter((item) => item.line === 'publish' && item.status === 'draft')
  if (publishDrafts.length) {
    items.push({ kind: 'publish_ready', level: 'warning', title: `${publishDrafts.length} 条发布草稿待确认`, detail: '补充账号与商品后即可发布。', route: '/publish', count: publishDrafts.length })
  }
  if (!items.some((item) => item.level !== 'ok')) {
    items.push({ kind: 'suggestion', level: 'ok', title: '一切正常', detail: '可以给 AI 制片人一个新目标，比如为一个商品做一套内容。', aiPrompt: '看看商品库里哪些商品最近没有新内容，帮我挑一个做一套内容。' })
  }
  return items
}

async function summarize(brief: Brief): Promise<string | undefined> {
  try {
    const credentials = await cloneRepo.getCredentials()
    const response = await generateChatCompletion({
      credentials,
      timeoutMs: 20_000,
      system: 'You are an AI content producer writing a short brief for a TikTok e-commerce content team. Reply in Simplified Chinese, at most 3 short sentences, concrete and actionable, no greetings.',
      prompt: JSON.stringify({ kind: brief.kind, items: brief.items.map(({ title, detail }) => ({ title, detail })), insights: brief.insights }),
    })
    return String(response.content || '').trim().slice(0, 400) || undefined
  } catch {
    return undefined
  }
}

export const briefs = {
  async generateDaily(options: { force?: boolean; summarize?: boolean } = {}) {
    const periodKey = dayKey()
    if (!options.force) {
      const existing = (await briefStore.read()).briefs.find((item) => item.kind === 'daily' && item.periodKey === periodKey)
      if (existing) return existing
    }
    const items = await dailyItems()
    const problems = items.filter((item) => item.level !== 'ok').length
    const brief: Brief = {
      id: randomUUID(),
      kind: 'daily',
      periodKey,
      createdAt: Date.now(),
      headline: problems ? `今天有 ${problems} 件事需要你处理` : '今天一切就绪',
      items,
    }
    if (options.summarize) brief.summary = await summarize(brief)
    await this.save(brief)
    return brief
  },

  async generateWeekly(options: { force?: boolean; summarize?: boolean } = {}) {
    const periodKey = weekKey()
    if (!options.force) {
      const existing = (await briefStore.read()).briefs.find((item) => item.kind === 'weekly' && item.periodKey === periodKey)
      if (existing) return existing
    }
    const insights = await buildInsights(7)
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
    const brief: Brief = {
      id: randomUUID(),
      kind: 'weekly',
      periodKey,
      createdAt: Date.now(),
      headline: `本周产出 ${produced} 条，通过 ${approved} 条`,
      items,
      insights,
    }
    if (options.summarize) brief.summary = await summarize(brief)
    await this.save(brief)
    return brief
  },

  async save(brief: Brief) {
    await briefStore.mutate((db) => {
      db.briefs = db.briefs.filter((item) => !(item.kind === brief.kind && item.periodKey === brief.periodKey))
      db.briefs.push(brief)
      db.briefs.sort((a, b) => b.createdAt - a.createdAt)
      if (db.briefs.length > 120) db.briefs.length = 120
    })
  },

  async latest(kind?: 'daily' | 'weekly') {
    const db = await briefStore.read()
    return db.briefs.find((item) => !kind || item.kind === kind) || null
  },

  async list(limit = 20) {
    return (await briefStore.read()).briefs.slice(0, Math.max(1, Math.min(120, limit)))
  },

  dayKey,
  weekKey,
}
