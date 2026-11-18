import {
  SYNC_COLLECTIONS,
  type SyncCloneProject,
  type SyncGeneration,
  type SyncPublishRecord,
} from '@shared/cloud/sync'
import {
  BRIEF_SUMMARY_SYSTEM,
  computeInsights,
  dailyBriefItems,
  dailyHeadline,
  dayKey,
  weekKey,
  weeklyBrief,
  type Brief,
  type ReportItem,
  type ReportLine,
  type ReportReview,
} from '@shared/contentReports'
import { approve, reject, type GenerationItem } from './generate'
import { cloud } from './session'
import { cachedFileLink, resolveFileLinks } from './fileLinks'
import { listRecords, newId, saveRecord, syncState } from './sync'
import { watch } from 'vue'

/**
 * 网页版的 window.api.contentHub：电脑端的工作台、审核收件箱、数据复盘页面原样复用，
 * 数据来自网页同步的生成结果、复刻项目和发布记录；复盘和简报用和电脑端同一套计算（src/shared/contentReports.ts）。
 */

type Decision = 'pending' | 'approved' | 'redo' | 'discarded'
type Item = ReportItem & {
  projectRef: string
  title: string
  stage?: string
  progress?: number
  mediaPath?: string
  mediaType?: 'video' | 'image'
  previewPath?: string
  createdAt: number
}

/* ---------------------------------------------------------------- 文件链接（签名、12 小时，见 lib/fileLinks.ts） */
const resolveLinks = resolveFileLinks
const linkOf = cachedFileLink

/* ---------------------------------------------------------------- 内容 */
const LINE_OF: Record<string, ReportLine> = { clone: 'clone', creative: 'creative', 'image-to-video': 'livephoto' }
function lineOf(purpose: string): ReportLine {
  if (LINE_OF[purpose]) return LINE_OF[purpose]
  // 商品图、商品替换、水印、AI 模特等图片类结果归到「图生视频」这条线（电脑端同一类工具），视频工具 / 混剪归「批量混剪」
  return ['product-image', 'product-replace', 'product-watermark', 'model'].includes(purpose) ? 'livephoto' : 'production'
}
const ROUTE_OF: Record<ReportLine, string> = { clone: '/clone', creative: '/creative', livephoto: '/image-to-video', production: '/production', publish: '/publish' }
const STATUS_OF: Record<string, Item['status']> = { queued: 'running', running: 'running', succeeded: 'ready', failed: 'failed' }

type Snapshot = { items: Item[]; generations: Map<string, GenerationItem>; reviews: Record<string, ReportReview & { reason?: string; note?: string; firstSeenAt: number; productId?: string }> }

async function snapshot(withMedia = false): Promise<Snapshot> {
  const [gens, clones, pubs] = await Promise.all([
    listRecords<SyncGeneration>(SYNC_COLLECTIONS.generations),
    listRecords<SyncCloneProject>(SYNC_COLLECTIONS.cloneProjects),
    listRecords<SyncPublishRecord>(SYNC_COLLECTIONS.publishRecords),
  ])
  const generations = new Map<string, GenerationItem>()
  for (const r of gens) if (r.data) generations.set(r.id, { ...(r.data as SyncGeneration), id: r.id, updatedAt: r.updatedAt })
  if (withMedia) await resolveLinks([...generations.values()].map((g) => g.outputFileId || g.sourceFileId).filter(Boolean) as string[])

  const items: Item[] = []
  const reviews: Snapshot['reviews'] = {}
  for (const g of generations.values()) {
    const line = lineOf(g.purpose)
    const ref = `gen:${g.id}`
    const media = linkOf(g.outputFileId)
    const isVideo = g.kind === 'video' || /^video\//.test(g.outputMime || '')
    items.push({
      ref,
      line,
      projectRef: `${line}:${g.productId || g.id}`,
      productId: g.productId,
      productName: g.productName,
      title: g.label || '生成结果',
      status: STATUS_OF[g.status] ?? 'running',
      error: g.error,
      mediaPath: media,
      mediaType: isVideo ? 'video' : 'image',
      previewPath: isVideo ? undefined : media ?? linkOf(g.sourceFileId),
      route: ROUTE_OF[line],
      createdAt: g.createdAt,
      updatedAt: g.updatedAt || g.createdAt,
    })
    if (g.status === 'succeeded') {
      const decision: Decision = g.review === 'approved' ? 'approved' : g.review === 'rejected' ? (g.decision ?? 'discarded') : 'pending'
      reviews[ref] = { ref, line, productId: g.productId, decision, decidedAt: g.decidedAt, reason: g.reason, note: g.note, firstSeenAt: g.createdAt }
    }
  }
  // 复刻项目：进行中 / 失败的进度显示在「继续上次」里（成片本身已经是一条生成结果）
  for (const r of clones) {
    const p = r.data
    if (!p || p.finalFileId) continue
    const failed = p.analyzeStatus === 'failed'
    items.push({ ref: `cloneproj:${r.id}`, line: 'clone', projectRef: `clone:${r.id}`, productId: p.productId, title: p.name || '复刻项目', status: failed ? 'failed' : p.analysis ? 'running' : 'draft', route: `/clone/${r.id}`, createdAt: p.createdAt, updatedAt: r.updatedAt })
  }
  for (const r of pubs) {
    const p = r.data
    if (!p) continue
    items.push({ ref: `pub:${r.id}`, line: 'publish', projectRef: `publish:${r.id}`, title: p.label, status: 'ready', sourceRef: p.generationId ? `gen:${p.generationId}` : undefined, route: '/publish', createdAt: p.at, updatedAt: p.at })
  }
  return { items, generations, reviews }
}

/* ---------------------------------------------------------------- 简报（每日 / 每周，存同步集合 briefs） */
async function loadBriefs(): Promise<Brief[]> {
  return (await listRecords<Brief>(SYNC_COLLECTIONS.briefs)).map((r) => r.data).filter(Boolean).sort((a, b) => b!.createdAt - a!.createdAt) as Brief[]
}
async function summarize(brief: Brief) {
  try {
    const res = await cloud.ai.chat({ system: BRIEF_SUMMARY_SYSTEM, prompt: JSON.stringify({ kind: brief.kind, items: brief.items.map(({ title, detail }) => ({ title, detail })), insights: brief.insights }), purpose: 'brief-summary' })
    return String(res.content || '').trim().slice(0, 400) || undefined
  } catch {
    return undefined
  }
}
async function makeBrief(kind: 'daily' | 'weekly', withSummary: boolean): Promise<Brief> {
  const snap = await snapshot()
  const periodKey = kind === 'daily' ? dayKey() : weekKey()
  let brief: Brief
  if (kind === 'daily') {
    const pending = Object.values(snap.reviews).filter((r) => r.decision === 'pending').length
    const items = dailyBriefItems({ pendingReviews: pending, items: snap.items, health: [], reviewRoute: '/review', homeRoute: '/', publishRoute: '/publish' })
    brief = { id: newId('brief'), kind, periodKey, createdAt: Date.now(), headline: dailyHeadline(items), items }
  } else {
    const insights = computeInsights({ items: snap.items, reviews: snap.reviews, feedback: feedbackOf(snap), rangeDays: 7 })
    brief = { id: newId('brief'), kind, periodKey, createdAt: Date.now(), ...weeklyBrief(insights), insights }
  }
  if (withSummary) brief.summary = await summarize(brief)
  // 同一周期只留一条（id 用周期，网页和手机同时生成也不会重复）
  await saveRecord<Brief>(SYNC_COLLECTIONS.briefs, `${kind}_${periodKey}`, brief)
  return brief
}
const feedbackOf = (snap: Snapshot) =>
  Object.values(snap.reviews)
    .filter((r) => r.decision !== 'pending')
    .map((r) => ({ decision: r.decision, reason: r.reason, createdAt: r.decidedAt || r.firstSeenAt }))

/* ---------------------------------------------------------------- 变更通知（同步完成后通知页面刷新） */
const listeners = new Set<(payload: { kind: string }) => void>()
watch(
  () => syncState.version,
  () => listeners.forEach((fn) => fn({ kind: 'sync' })),
)
const emit = (kind: string) => listeners.forEach((fn) => fn({ kind }))

export function installContentHubApi() {
  const w = window as unknown as { api?: Record<string, unknown> }
  w.api ??= {}
  // 体检与自动化在电脑上运行：这几个方法经「电脑代办」交给电脑（relay 代理没有自己的属性，需要逐个转交）
  const relay = (w.api.contentHub as Record<string, (...args: unknown[]) => unknown> | undefined) ?? {}
  const viaDesktop = (method: string) => (...args: unknown[]) => relay[method]!(...args)
  w.api.contentHub = {
    getAutomationSettings: viaDesktop('getAutomationSettings'),
    saveAutomationSettings: viaDesktop('saveAutomationSettings'),
    testFeishuPush: viaDesktop('testFeishuPush'),
    healthCheck: viaDesktop('healthCheck'),
    async listReviews(filter: { decision?: Decision | 'all'; line?: ReportLine; productId?: string } = {}) {
      const snap = await snapshot(true)
      const byRef = new Map(snap.items.map((item) => [item.ref, item]))
      const decision = filter.decision || 'pending'
      return Object.values(snap.reviews)
        .filter((r) => (decision === 'all' || r.decision === decision) && (!filter.line || r.line === filter.line) && (!filter.productId || r.productId === filter.productId))
        .map((r) => ({ ...byRef.get(r.ref)!, review: r }))
        .filter((item) => item.ref)
        .sort((a, b) => (b.review.decidedAt || b.updatedAt) - (a.review.decidedAt || a.updatedAt))
    },
    async reviewCounts() {
      const counts = { pending: 0, approved: 0, redo: 0, discarded: 0 }
      for (const r of Object.values((await snapshot()).reviews)) counts[r.decision] += 1
      return counts
    },
    async decideReview(input: { ref: string; decision: Exclude<Decision, 'pending'>; reason?: string; note?: string }) {
      const snap = await snapshot()
      const gen = snap.generations.get(input.ref.replace(/^gen:/, ''))
      if (!gen) throw new Error('内容不存在或已被删除')
      const decidedAt = Date.now()
      const extra = { decidedAt, reason: input.reason?.trim() || undefined, note: input.note?.trim().slice(0, 500) || undefined }
      if (input.decision === 'approved') await approve({ ...gen, ...extra, decision: undefined })
      else await reject({ ...gen, ...extra, decision: input.decision })
      emit('review')
      return { ref: input.ref }
    },
    async reopenReview(ref: string) {
      const gen = (await snapshot()).generations.get(ref.replace(/^gen:/, ''))
      if (!gen) throw new Error('该内容不在审核收件箱中')
      const { id, updatedAt: _u, ...data } = gen
      await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, id, { ...data, review: 'pending', decision: undefined, decidedAt: undefined })
      emit('review')
      return { ref }
    },
    async recentProjects(limit = 8) {
      const { items } = await snapshot(true)
      const byProject = new Map<string, Item[]>()
      for (const item of items.filter((i) => i.line !== 'publish')) byProject.set(item.projectRef, [...(byProject.get(item.projectRef) ?? []), item])
      return [...byProject.entries()]
        .map(([ref, group]) => {
          const head = group.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]!
          const readyCount = group.filter((i) => i.status === 'ready').length
          const failedCount = group.filter((i) => i.status === 'failed').length
          const running = group.some((i) => i.status === 'running')
          return {
            ref,
            line: head.line,
            title: head.title,
            productId: head.productId,
            productName: head.productName,
            status: running ? 'running' : failedCount ? 'failed' : readyCount ? 'ready' : 'draft',
            stage: head.stage,
            progress: group.length > 1 ? Math.round((readyCount / group.length) * 100) : head.progress,
            readyCount,
            failedCount,
            route: head.route,
            previewPath: group.find((i) => i.previewPath)?.previewPath,
            updatedAt: head.updatedAt,
          }
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(1, limit))
    },
    async insights(rangeDays = 7) {
      const snap = await snapshot()
      return computeInsights({ items: snap.items, reviews: snap.reviews, feedback: feedbackOf(snap), rangeDays })
    },
    async latestBriefs() {
      const all = await loadBriefs()
      let daily = all.find((b) => b.kind === 'daily') ?? null
      if (!daily || daily.periodKey !== dayKey()) daily = await makeBrief('daily', false)
      return { daily, weekly: all.find((b) => b.kind === 'weekly') ?? null, settings: { aiSummary: true } }
    },
    async generateBrief(kind: 'daily' | 'weekly') {
      const brief = await makeBrief(kind, true)
      emit('brief')
      return brief
    },
    async listBriefs(limit = 20) {
      return (await loadBriefs()).slice(0, Math.max(1, Math.min(120, limit)))
    },
    onChanged(callback: (payload: { kind: string }) => void) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}
