import { randomUUID } from 'node:crypto'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion } from '../clone/unifiedChat'
import { contentIndex } from './contentIndex'
import { getHealthReport } from './healthCheck'
import { buildInsights } from './insights'
import { reviewInbox } from './reviewInbox'
import { briefStore } from './stores'
import type { Brief, BriefItem } from './types'
import { BRIEF_SUMMARY_SYSTEM, dailyBriefItems, dailyHeadline, dayKey, weekKey, weeklyBrief } from '../../../shared/contentReports'

async function dailyItems(): Promise<BriefItem[]> {
  const [counts, all, health] = await Promise.all([reviewInbox.counts(), contentIndex.listAll(), getHealthReport(30 * 60_000)])
  return dailyBriefItems({ pendingReviews: counts.pending, items: all, health: health.items }) as BriefItem[]
}

async function summarize(brief: Brief): Promise<string | undefined> {
  try {
    const credentials = await cloneRepo.getCredentials()
    const response = await generateChatCompletion({
      credentials,
      timeoutMs: 20_000,
      system: BRIEF_SUMMARY_SYSTEM,
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
    const brief: Brief = {
      id: randomUUID(),
      kind: 'daily',
      periodKey,
      createdAt: Date.now(),
      headline: dailyHeadline(items),
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
    const weekly = weeklyBrief(insights)
    const items = weekly.items as BriefItem[]
    const brief: Brief = {
      id: randomUUID(),
      kind: 'weekly',
      periodKey,
      createdAt: Date.now(),
      headline: weekly.headline,
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
