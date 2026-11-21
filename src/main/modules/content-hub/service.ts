import { join } from 'node:path'
import { Notification } from 'electron'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { agentOsService } from '../agent-os/service'
import { importProductFromLink } from '../agent-os/contentHubCapabilities'
import { briefs } from './briefs'
import { contentIndex } from './contentIndex'
import { runHealthCheck, getHealthReport } from './healthCheck'
import { buildInsights } from './insights'
import { getBusinessOverview, invalidateBusinessOverview } from './overview'
import { contentPerformance } from './performance'
import { DEFAULT_FEISHU_SETTINGS, buildBriefCard, normalizeFeishuSettings, pushBriefToFeishu, sendFeishuMessage, type FeishuPushSettings } from './feishuPush'
import { productSpine, readPublishTasks } from './productSpine'
import { reviewInbox } from './reviewInbox'
import { brandMemoryStore, lineage } from './stores'
import type { BrandProfile, ContentLine, ContentStatus, ProductMemory, ReviewDecision } from './types'

export type AutomationSettings = {
  dailyBrief: { enabled: boolean; hour: number }
  weeklyReview: { enabled: boolean; weekday: number; hour: number }
  aiSummary: boolean
  desktopNotifications: boolean
  feishu: FeishuPushSettings
}

const DEFAULT_SETTINGS: AutomationSettings = {
  dailyBrief: { enabled: true, hour: 8 },
  weeklyReview: { enabled: true, weekday: 1, hour: 9 },
  aiSummary: true,
  desktopNotifications: true,
  feishu: DEFAULT_FEISHU_SETTINGS,
}

function settingsPath() {
  return join(getAppPaths().dbDir, 'content-hub-settings.json')
}

function clampHour(value: unknown, fallback: number) {
  const hour = Number(value)
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback
}

async function readSettings(): Promise<AutomationSettings> {
  const raw = await readJsonFile<Partial<AutomationSettings>>(settingsPath(), {})
  return {
    dailyBrief: { enabled: raw.dailyBrief?.enabled ?? true, hour: clampHour(raw.dailyBrief?.hour, 8) },
    weeklyReview: {
      enabled: raw.weeklyReview?.enabled ?? true,
      weekday: Number.isInteger(raw.weeklyReview?.weekday) && raw.weeklyReview!.weekday >= 0 && raw.weeklyReview!.weekday <= 6 ? raw.weeklyReview!.weekday : 1,
      hour: clampHour(raw.weeklyReview?.hour, 9),
    },
    aiSummary: raw.aiSummary ?? DEFAULT_SETTINGS.aiSummary,
    desktopNotifications: raw.desktopNotifications ?? DEFAULT_SETTINGS.desktopNotifications,
    feishu: normalizeFeishuSettings(raw.feishu),
  }
}

async function pushBrief(settings: AutomationSettings, brief: Awaited<ReturnType<typeof briefs.generateDaily>>) {
  try {
    await pushBriefToFeishu(settings.feishu, brief)
  } catch (error) {
    console.warn('[content-hub] feishu push failed', error)
    notify('飞书推送失败', error instanceof Error ? error.message : String(error))
  }
}

type ChangeListener = (payload: { kind: string; counts?: Awaited<ReturnType<typeof reviewInbox.counts>> }) => void
const listeners = new Set<ChangeListener>()
let schedulerTimer: NodeJS.Timeout | null = null
let syncTimer: NodeJS.Timeout | null = null
let initialized = false

function notify(title: string, body: string) {
  void readSettings().then((settings) => {
    if (!settings.desktopNotifications || !Notification.isSupported()) return
    try {
      new Notification({ title, body, silent: false }).show()
    } catch {
      // Notifications are best-effort.
    }
  })
}

async function emitChange(kind: string) {
  contentIndex.invalidate()
  invalidateBusinessOverview()
  const counts = await reviewInbox.counts().catch(() => undefined)
  for (const listener of listeners) listener({ kind, counts })
}

async function runScheduledAutomations() {
  const settings = await readSettings()
  const now = new Date()
  try {
    if (settings.dailyBrief.enabled && now.getHours() >= settings.dailyBrief.hour) {
      const latest = await briefs.latest('daily')
      if (!latest || latest.periodKey !== briefs.dayKey(now)) {
        const brief = await briefs.generateDaily({ summarize: settings.aiSummary })
        const problems = brief.items.filter((item) => item.level !== 'ok').length
        if (problems) notify('Klipmill 每日简报', brief.headline)
        await pushBrief(settings, brief)
        await emitChange('brief')
      }
    }
    if (settings.weeklyReview.enabled && now.getDay() === settings.weeklyReview.weekday && now.getHours() >= settings.weeklyReview.hour) {
      const latest = await briefs.latest('weekly')
      if (!latest || latest.periodKey !== briefs.weekKey(now)) {
        const brief = await briefs.generateWeekly({ summarize: settings.aiSummary })
        notify('Klipmill 每周复盘', brief.headline)
        await pushBrief(settings, brief)
        await emitChange('brief')
      }
    }
  } catch (error) {
    console.warn('[content-hub] scheduled automation failed', error)
  }
}

export const contentHubService = {
  init() {
    if (initialized) return
    initialized = true
    agentOsService.subscribe((events) => {
      for (const event of events) {
        if (event.type === 'agent.run.completed' || event.type === 'agent.run.failed') {
          void reviewInbox.sync().then(() => emitChange('run'))
          if (event.type === 'agent.run.completed') notify('AI 制片人', '计划已执行完成，产出已进入审核收件箱。')
          else notify('AI 制片人', `计划执行失败：${String(event.payload?.error || '请打开 AI 制片人查看')}`)
        } else if (event.type === 'agent.step.awaiting_confirmation') {
          notify('AI 制片人需要你确认', String(event.payload?.title || '有一个步骤等待确认'))
        }
      }
    })
    // Pull finished work into the inbox periodically so badges stay fresh without user action.
    syncTimer = setInterval(() => {
      void reviewInbox.sync().then(({ added }) => {
        if (added) {
          notify('有新内容待审核', `${added} 条新产出进入审核收件箱`)
          void emitChange('inbox')
        }
      }).catch(() => undefined)
    }, 90_000)
    schedulerTimer = setInterval(() => void runScheduledAutomations(), 10 * 60_000)
    setTimeout(() => void runScheduledAutomations(), 20_000)
  },

  stop() {
    if (syncTimer) clearInterval(syncTimer)
    if (schedulerTimer) clearInterval(schedulerTimer)
    syncTimer = null
    schedulerTimer = null
  },

  subscribe(listener: ChangeListener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  // ---------- content index
  async listContent(filter?: { productId?: string; line?: ContentLine; status?: ContentStatus; limit?: number }) {
    return await contentIndex.list(filter)
  },
  async recentProjects(limit?: number) {
    return await contentIndex.recentProjects(limit)
  },
  async productOverview(productId: string) {
    const items = await contentIndex.list({ productId, limit: 1000 })
    const records = await reviewInbox.records()
    const byRef = new Map(records.map((record) => [record.ref, record]))
    const lines: ContentLine[] = ['clone', 'creative', 'livephoto', 'production', 'publish']
    const stats = Object.fromEntries(lines.map((line) => {
      const rows = items.filter((item) => item.line === line)
      return [line, {
        total: rows.length,
        ready: rows.filter((item) => item.status === 'ready').length,
        running: rows.filter((item) => item.status === 'running').length,
        failed: rows.filter((item) => item.status === 'failed').length,
        approved: rows.filter((item) => byRef.get(item.ref)?.decision === 'approved').length,
      }]
    }))
    const edges = await lineage.listByProduct(productId)
    const spine = await productSpine.build(productId)
    const performance = await contentPerformance.forProduct({ items, tiktokProductIds: spine.tiktokProductIds, publishTasks: await readPublishTasks() })
    return {
      items: items.map((item) => ({ ...item, review: byRef.get(item.ref), performance: performance.byRef[item.ref] })),
      stats,
      lineage: edges.slice(-200),
      memory: await brandMemoryStore.getProduct(productId),
      spine,
      performance: { ...performance, byRef: undefined },
    }
  },
  async linkContentPerformance(input: { ref: string; creativeId: string; creativeName?: string }) {
    const link = await contentPerformance.link(input)
    await emitChange('performance')
    return link
  },
  async unlinkContentPerformance(ref: string) {
    const result = await contentPerformance.unlink(ref)
    await emitChange('performance')
    return result
  },
  async linkProductChannels(input: { productId: string; tiktokProductIds: string[] }) {
    const tiktokProductIds = await productSpine.link(input)
    await emitChange('product')
    return { tiktokProductIds }
  },

  // ---------- review inbox
  async listReviews(filter?: { decision?: ReviewDecision | 'all'; line?: ContentLine; productId?: string }) {
    return await reviewInbox.list(filter)
  },
  async reviewCounts() {
    return await reviewInbox.counts()
  },
  async decideReview(input: { ref: string; decision: Exclude<ReviewDecision, 'pending'>; reason?: string; note?: string }) {
    const result = await reviewInbox.decide(input)
    await emitChange('review')
    return result
  },
  async reopenReview(ref: string) {
    const result = await reviewInbox.reopen(ref)
    await emitChange('review')
    return result
  },

  // ---------- lineage
  async lineageFor(ref: string) {
    return await lineage.listFor(ref)
  },

  // ---------- brand memory
  async getBrandMemory() {
    const db = await brandMemoryStore.read()
    return { brand: db.brand, feedback: db.feedback.slice(-100).reverse() }
  },
  async saveBrand(input: Partial<BrandProfile>) {
    return await brandMemoryStore.saveBrand(input)
  },
  async getProductMemory(productId: string) {
    return await brandMemoryStore.getProduct(productId)
  },
  async saveProductMemory(input: Partial<ProductMemory> & { productId: string }) {
    return await brandMemoryStore.saveProduct(input)
  },
  async removeFeedback(id: string) {
    return await brandMemoryStore.removeFeedback(id)
  },

  // ---------- health / insights / briefs
  async healthCheck(force = false) {
    return force ? await runHealthCheck() : await getHealthReport()
  },
  async insights(rangeDays = 7) {
    return await buildInsights(rangeDays)
  },
  async overview(rangeDays = 7) {
    return await getBusinessOverview(rangeDays)
  },
  async latestBriefs() {
    const settings = await readSettings()
    let daily = await briefs.latest('daily')
    if (!daily || daily.periodKey !== briefs.dayKey()) daily = await briefs.generateDaily({ summarize: false })
    const weekly = await briefs.latest('weekly')
    return { daily, weekly, settings }
  },
  async generateBrief(kind: 'daily' | 'weekly') {
    const settings = await readSettings()
    const brief = kind === 'weekly'
      ? await briefs.generateWeekly({ force: true, summarize: settings.aiSummary })
      : await briefs.generateDaily({ force: true, summarize: settings.aiSummary })
    await emitChange('brief')
    return brief
  },
  async listBriefs(limit?: number) {
    return await briefs.list(limit)
  },
  async getAutomationSettings() {
    return await readSettings()
  },
  async saveAutomationSettings(input: Partial<AutomationSettings>) {
    const current = await readSettings()
    const next: AutomationSettings = {
      dailyBrief: { ...current.dailyBrief, ...(input.dailyBrief || {}) },
      weeklyReview: { ...current.weeklyReview, ...(input.weeklyReview || {}) },
      aiSummary: input.aiSummary ?? current.aiSummary,
      desktopNotifications: input.desktopNotifications ?? current.desktopNotifications,
      feishu: { ...current.feishu, ...(input.feishu || {}) },
    }
    if (input.feishu?.webhookUrl !== undefined && String(input.feishu.webhookUrl).trim() && !normalizeFeishuSettings(next.feishu).webhookUrl) {
      throw new Error('飞书 Webhook 地址无效，请粘贴群机器人的完整 Webhook 地址（https://open.feishu.cn/open-apis/bot/v2/hook/...）')
    }
    next.feishu = normalizeFeishuSettings(next.feishu)
    next.dailyBrief.hour = clampHour(next.dailyBrief.hour, 8)
    next.weeklyReview.hour = clampHour(next.weeklyReview.hour, 9)
    await writeJsonFile(settingsPath(), next)
    return next
  },

  async testFeishuPush(input?: Partial<FeishuPushSettings>) {
    const current = await readSettings()
    const target = normalizeFeishuSettings({ ...current.feishu, ...(input || {}) })
    if (!target.webhookUrl) throw new Error('请先填写有效的飞书 Webhook 地址')
    await sendFeishuMessage(target, { msg_type: 'text', content: { text: 'Klipmill：飞书推送已连通，之后的每日简报和每周复盘会发到这个群。' } })
    return { ok: true }
  },
  async pushLatestBrief(kind: 'daily' | 'weekly') {
    const settings = await readSettings()
    if (!settings.feishu.webhookUrl) throw new Error('请先填写有效的飞书 Webhook 地址')
    const brief = kind === 'weekly' ? await briefs.latest('weekly') : await briefs.generateDaily({ summarize: settings.aiSummary })
    if (!brief) throw new Error('还没有每周复盘，可先在数据复盘页生成')
    await sendFeishuMessage(settings.feishu, buildBriefCard(brief))
    return { ok: true }
  },

  // ---------- products
  async importProductFromLink(input: { url: string; name?: string; type?: string }) {
    const result = await importProductFromLink(input)
    await lineage.record({ fromRef: `url:${input.url}`, toRef: `product:${result.product.id}`, relation: 'derived_from', productId: result.product.id })
    return result
  },
}
