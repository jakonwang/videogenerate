/**
 * 每日自动驾驶（主进程）：
 *   生成：每天到点（或用户点「立即生成」）扫一遍在投放的商品，把信号变成「今日待批准」：
 *         止损提醒 / 补货（衰退素材）/ 放大爆款 / 补素材 / 送去发布
 *   执行：批准后交给 AI 制片人（同一套计划 → 生成 → 审核收件箱），这里只建计划并替用户批准。
 *   护栏：默认关闭、默认只建议；每天最多 N 个生成任务；亏钱的商品不放大、不补货；
 *         同一条素材 3 天内不重复补；发布只建草稿，不会自动提交。
 */
import { productCodesService } from '../product-codes/service'
import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { agentOsService } from '../agent-os/service'
import type { AgentIntentType } from '../agent-os/types'
import { createSpineReads, productSpine, readPublishTasks, type SpineSignal } from './productSpine'
import { performanceLinkStore, reviewStore, createJsonStore } from './stores'
import { publishSourceRef } from './performance'
import { downloadCreativeVideo } from './creativeVideo'
import {
  AUTOPILOT_PRIORITY,
  isPlanProposal,
  normalizeAutopilotSettings,
  type AutopilotDay,
  type AutopilotKind,
  type AutopilotProposal,
  type AutopilotSettings,
} from '../../../shared/autopilot'

type AutopilotDb = { schemaVersion: 1; settings: AutopilotSettings; days: AutopilotDay[] }
const store = createJsonStore<AutopilotDb>('autopilot.json', () => ({ schemaVersion: 1, settings: normalizeAutopilotSettings(), days: [] }), (db) => ({
  schemaVersion: 1,
  settings: normalizeAutopilotSettings(db?.settings),
  days: Array.isArray(db?.days) ? db.days : [],
}))

const KEEP_DAYS = 14
const MAX_PRODUCTS = 30
const NO_REPEAT_DAYS = 3
const VARIANT_PROJECTS = 2
const VARIANT_CLONES = 3
const PLAN_INTENTS: AgentIntentType[] = ['Intent.CommerceVideoCreate', 'Intent.ReviewSubmit']
const ADS_ROUTE = '/plugins/tiktok-gmv-max-optimizer'

type Deps = {
  now: () => number
  products: () => Promise<Array<{ id: string; name: string; tiktokProductIds?: string[] }>>
  signals: (productId: string, now: number) => Promise<SpineSignal[]>
  downloadCreative: (creativeId: string) => Promise<{ localVideoPath?: string; error?: string }>
  agent: Pick<typeof agentOsService, 'createConversation' | 'sendMessage' | 'approveRun' | 'getRun'>
}
const defaultDeps: Deps = {
  now: () => Date.now(),
  products: async () => (await productCodesService.linkedProducts()).map((item) => ({ id: item.id, name: item.name, tiktokProductIds: item.tiktokProductIds })),
  signals: async (productId, now) => {
    const reads = createSpineReads()
    return (await productSpine.build(productId, now, reads)).signals
  },
  downloadCreative: async (creativeId) => {
    const result = await downloadCreativeVideo({ creativeId, timeoutMs: 180_000 })
    return { localVideoPath: result.localVideoPath, error: result.error }
  },
  agent: agentOsService,
}
let deps: Deps = defaultDeps
export function setAutopilotTestDependencies(next: Partial<Deps>) { deps = { ...defaultDeps, ...next } }

export function autopilotDayKey(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const n = (value: unknown) => Number(value) || 0

/** 一条信号 → 一条建议（没有对应的就返回 null） */
export function proposalFromSignal(input: { product: { id: string; name: string }; signal: SpineSignal; projectByCreative: Map<string, string> }): Omit<AutopilotProposal, 'id' | 'status'> | null {
  const { product, signal } = input
  const p = signal.params
  const creativeId = String(p.creativeId || '')
  const variantAction = (): AutopilotProposal['action'] | null => {
    const projectId = creativeId ? input.projectByCreative.get(creativeId) : undefined
    if (projectId) return { type: 'plan', source: 'project', projectId }
    if (/^\d{8,25}$/.test(creativeId)) return { type: 'plan', source: 'creative' }
    return null
  }
  const base = { productId: product.id, productName: product.name, ...(creativeId ? { creativeId } : {}) }
  if (signal.key === 'ads_unprofitable') {
    return { ...base, kind: 'stop_loss', title: `「${product.name}」投放在亏钱`, reason: `近 14 天 ROI ${p.roi}，低于保本 ROI ${p.breakEvenRoi}。建议到 GMV MAX 降预算或停掉不出单的素材（自动驾驶不会替你改投放）。`, action: { type: 'route', route: ADS_ROUTE } }
  }
  if (signal.key === 'ads_fatigue') {
    const action = variantAction()
    if (!action) return null
    const runway = p.daysLeft === undefined ? '' : Number(p.daysLeft) === 0 ? '，已经跌破底线' : `，约 ${p.daysLeft} 天后撑不住`
    return { ...base, kind: 'replenish', title: `照「${p.name}」给「${product.name}」补一批变体`, reason: `主力素材「${p.name}」占 ${p.share}% 花费，ROI 从 ${p.previousRoi} 掉到 ${p.recentRoi}${runway}。`, action }
  }
  if (signal.key === 'ads_winner') {
    const action = variantAction()
    if (!action) return null
    return { ...base, kind: 'scale_winner', title: `照爆款「${p.name}」多做几条`, reason: `「${p.name}」ROI ${p.roi}，比商品平均 ${p.avgRoi} 高，已出 ${p.orders} 单。`, action }
  }
  return null
}

async function buildProjectIndex() {
  // 投放素材 → 软件里做的复刻项目（出单验证里关联过的）
  const links = (await performanceLinkStore.read()).links
  const map = new Map<string, string>()
  for (const link of Object.values(links)) if (link.ref.startsWith('clone:')) map.set(link.creativeId, link.ref.slice('clone:'.length))
  return map
}

/** 花费最高的视频素材：补素材时照它做 */
function topCreative(productIds: string[], now: number): { creativeId: string; name: string } | null {
  try {
    const from = new Date(now - 13 * 86_400_000).toISOString().slice(0, 10)
    const rows = gmvMaxRepo.listCreativeDailyForProducts(productIds, from, new Date(now).toISOString().slice(0, 10))
    const spend = new Map<string, { name: string; cost: number }>()
    for (const row of rows) {
      const entry = spend.get(row.creativeId) || { name: row.creativeName || row.creativeId, cost: 0 }
      entry.cost += n(row.cost)
      spend.set(row.creativeId, entry)
    }
    const best = [...spend.entries()].filter(([id]) => /^\d{8,25}$/.test(id)).sort((a, b) => b[1].cost - a[1].cost)[0]
    return best ? { creativeId: best[0], name: best[1].name } : null
  } catch {
    return null
  }
}

async function approvedUnpublishedCount() {
  const records = Object.values((await reviewStore.read()).records)
  const approved = new Set(records.filter((record) => record.decision === 'approved' && record.line !== 'livephoto').map((record) => record.ref))
  for (const task of await readPublishTasks()) approved.delete(publishSourceRef(task))
  return approved.size
}

export async function generateProposals(now = deps.now(), history: AutopilotDay[] = [], settings = normalizeAutopilotSettings()): Promise<AutopilotProposal[]> {
  const products = (await deps.products()).filter((item) => (item.tiktokProductIds || []).length).slice(0, MAX_PRODUCTS)
  const projectByCreative = await buildProjectIndex()
  // 最近几天已经补过 / 放大过的素材不重复
  const since = now - NO_REPEAT_DAYS * 86_400_000
  const recent = new Set(history.flatMap((day) => day.proposals)
    .filter((item) => item.creativeId && ['running', 'done'].includes(item.status) && (item.decidedAt || 0) >= since)
    .map((item) => `${item.kind}:${item.creativeId}`))
  const out: Array<Omit<AutopilotProposal, 'id' | 'status'>> = []
  for (const product of products) {
    const signals = await deps.signals(product.id, now).catch(() => [] as SpineSignal[])
    const losing = signals.some((signal) => signal.key === 'ads_unprofitable')
    const mine: Array<Omit<AutopilotProposal, 'id' | 'status'>> = []
    for (const signal of signals) {
      const proposal = proposalFromSignal({ product, signal, projectByCreative })
      if (!proposal) continue
      // 亏钱的商品先止损，不再加素材放大
      if (losing && proposal.kind !== 'stop_loss') continue
      if (proposal.creativeId && recent.has(`${proposal.kind}:${proposal.creativeId}`)) continue
      if (mine.some((item) => item.kind === proposal.kind)) continue
      mine.push(proposal)
    }
    const needsMore = signals.find((signal) => signal.key === 'ads_need_creatives')
    if (!losing && needsMore && !mine.some((item) => item.kind === 'replenish' || item.kind === 'scale_winner')) {
      const top = topCreative(product.tiktokProductIds || [], now)
      const projectId = top ? projectByCreative.get(top.creativeId) : undefined
      if (top && !recent.has(`more_content:${top.creativeId}`)) {
        mine.push({
          kind: 'more_content', productId: product.id, productName: product.name, creativeId: top.creativeId,
          title: `给「${product.name}」补几条投放素材`,
          reason: `近 3 天在投素材只有 ${needsMore.params.active} 条，少于 ${needsMore.params.target} 条，素材不够轮换。照花费最高的「${top.name}」做变体。`,
          action: projectId ? { type: 'plan', source: 'project', projectId } : { type: 'plan', source: 'creative' },
        })
      }
    }
    out.push(...mine)
  }
  if (settings.includePublish) {
    const count = await approvedUnpublishedCount()
    if (count > 0) out.push({ kind: 'publish_approved', title: `把 ${count} 条审核通过的成片送进发布中心`, reason: '这些成片已经审核通过但还没发布。会在发布中心建好草稿（不会自动提交），你可以再分发到多个号。', action: { type: 'plan', source: 'approved' } })
  }
  const day = autopilotDayKey(now)
  return out
    .sort((a, b) => AUTOPILOT_PRIORITY.indexOf(a.kind) - AUTOPILOT_PRIORITY.indexOf(b.kind))
    .map((item, index) => ({ ...item, id: `${day}:${index}:${item.kind}:${item.creativeId || item.productId || 'all'}`, status: 'pending' as const }))
}

// ---------- 执行 ----------
async function planFor(proposal: AutopilotProposal): Promise<{ content: string; context: Record<string, unknown>; intents: AgentIntentType[]; summary: string; attachments?: Array<{ id: string; name: string; path: string; mediaType: 'video' }> }> {
  if (proposal.action.type !== 'plan') throw new Error('这条是提醒，不需要执行')
  if (proposal.action.source === 'approved') {
    return { content: '把审核通过、还没发布的成片放进发布中心，建好发布草稿。', context: { useApproved: true, intervalHours: 4 }, intents: ['Intent.PublishDraft'], summary: proposal.title }
  }
  const productId = proposal.productId
  if (proposal.action.source === 'project' && proposal.action.projectId) {
    return {
      content: `${proposal.reason}用这条成片的参考视频、同一个商品和模特，再做 ${VARIANT_PROJECTS} 条脚本角度不同的变体，做完送审。`,
      context: { productId, variantOfProjectId: proposal.action.projectId, variantProjects: VARIANT_PROJECTS },
      intents: PLAN_INTENTS,
      summary: proposal.title,
    }
  }
  const video = await deps.downloadCreative(String(proposal.creativeId || ''))
  if (!video.localVideoPath) throw new Error(`投放素材的原视频下载失败：${video.error || '未知原因'}`)
  return {
    content: `${proposal.reason}我已下载这条投放素材的原视频（附件），请照着它的结构复刻 ${VARIANT_CLONES} 条同款变体，换成这个商品，做完送审。`,
    context: { productId, referenceVideoPath: video.localVideoPath, quantity: VARIANT_CLONES, sourceCreativeId: proposal.creativeId },
    intents: PLAN_INTENTS,
    summary: proposal.title,
    attachments: [{ id: `creative-${proposal.creativeId}`, name: `${proposal.creativeId}.mp4`, path: video.localVideoPath, mediaType: 'video' }],
  }
}

async function startRun(proposal: AutopilotProposal) {
  const plan = await planFor(proposal)
  const conversation = await deps.agent.createConversation({ title: `自动驾驶 · ${proposal.title}`.slice(0, 80), context: plan.context })
  const sent = await deps.agent.sendMessage({ conversationId: conversation.id, content: plan.content, context: plan.context, attachments: plan.attachments as any, plan: { intents: plan.intents, summary: plan.summary } })
  const run = (sent as any)?.run
  if (!run) throw new Error('AI 制片人没有生成计划')
  if (run.status === 'waiting_approval') {
    const revision = run.revisions.find((item: any) => item.version === run.activeRevision) || run.revisions[0]
    await deps.agent.approveRun({ runId: run.id, revision: revision.version, planHash: revision.hash })
  }
  return { runId: String(run.id), conversationId: conversation.id }
}

async function mutateProposal(id: string, fn: (proposal: AutopilotProposal) => void) {
  return store.mutate((db) => {
    for (const day of db.days) {
      const proposal = day.proposals.find((item) => item.id === id)
      if (proposal) { fn(proposal); return { ...proposal } }
    }
    throw new Error('这条建议不存在或已过期')
  })
}

function usedToday(day: AutopilotDay | undefined) {
  return (day?.proposals || []).filter((item) => isPlanProposal(item) && ['running', 'done', 'failed'].includes(item.status) && item.action.type === 'plan' && item.action.source !== 'approved').length
}

const running = new Set<string>()

export const autopilot = {
  async settings() { return (await store.read()).settings },

  async saveSettings(input: Partial<AutopilotSettings>) {
    return store.mutate((db) => {
      db.settings = normalizeAutopilotSettings({ ...db.settings, ...input })
      return db.settings
    })
  },

  /** 今天的计划（带最新的执行状态） */
  async today() {
    const now = deps.now()
    await this.syncRuns()
    const db = await store.read()
    const day = db.days.find((item) => item.day === autopilotDayKey(now)) || null
    return { settings: db.settings, day, used: usedToday(day || undefined) }
  },

  /** 生成今天的计划（已经生成过就保留已处理的，重新算待处理的） */
  async generate(options: { auto?: boolean } = {}) {
    const now = deps.now()
    const db = await store.read()
    const key = autopilotDayKey(now)
    const fresh = await generateProposals(now, db.days, db.settings)
    const day = await store.mutate((state) => {
      const existing = state.days.find((item) => item.day === key)
      const kept = (existing?.proposals || []).filter((item) => item.status !== 'pending')
      const keptKeys = new Set(kept.map((item) => `${item.kind}:${item.creativeId || item.productId || ''}`))
      const next: AutopilotDay = { day: key, generatedAt: now, proposals: [...kept, ...fresh.filter((item) => !keptKeys.has(`${item.kind}:${item.creativeId || item.productId || ''}`))] }
      state.days = [next, ...state.days.filter((item) => item.day !== key)].slice(0, KEEP_DAYS)
      return next
    })
    if (options.auto && db.settings.mode === 'auto') {
      for (const proposal of day.proposals.filter((item) => item.status === 'pending' && isPlanProposal(item))) {
        try {
          await this.approve(proposal.id, { auto: true })
        } catch {
          break // 额度用完或出错：剩下的留给用户
        }
      }
    }
    return this.today()
  },

  async approve(id: string, options: { auto?: boolean } = {}) {
    if (running.has(id)) throw new Error('这条正在执行')
    const db = await store.read()
    const day = db.days.find((item) => item.proposals.some((proposal) => proposal.id === id))
    const proposal = day?.proposals.find((item) => item.id === id)
    if (!proposal) throw new Error('这条建议不存在或已过期')
    if (proposal.status !== 'pending' && proposal.status !== 'failed') throw new Error('这条已经处理过了')
    if (!isPlanProposal(proposal)) {
      return mutateProposal(id, (item) => { item.status = 'acknowledged'; item.decidedAt = deps.now() })
    }
    if (proposal.action.type === 'plan' && proposal.action.source !== 'approved' && usedToday(day) >= db.settings.maxTasksPerDay) {
      throw new Error(`今天已经执行了 ${db.settings.maxTasksPerDay} 个生成任务，到了每日上限。可以在设置里调高，或明天再做`)
    }
    running.add(id)
    await mutateProposal(id, (item) => { item.status = 'running'; item.auto = Boolean(options.auto); item.decidedAt = deps.now(); item.error = undefined })
    try {
      const { runId, conversationId } = await startRun(proposal)
      return await mutateProposal(id, (item) => { item.runId = runId; item.conversationId = conversationId })
    } catch (error: any) {
      return await mutateProposal(id, (item) => { item.status = 'failed'; item.error = String(error?.message || error).slice(0, 300) })
    } finally {
      running.delete(id)
    }
  },

  async skip(id: string) {
    return mutateProposal(id, (item) => {
      if (item.status !== 'pending' && item.status !== 'failed') throw new Error('这条已经处理过了')
      item.status = 'skipped'
      item.decidedAt = deps.now()
    })
  },

  /** 执行中的计划：看 AI 制片人那边跑完没有 */
  async syncRuns() {
    const db = await store.read()
    const active = db.days.flatMap((day) => day.proposals).filter((item) => item.status === 'running' && item.runId)
    for (const proposal of active) {
      try {
        const detail: any = await deps.agent.getRun(proposal.runId!)
        const status = String(detail?.run?.status || '')
        if (status === 'completed') await mutateProposal(proposal.id, (item) => { item.status = 'done' })
        else if (['failed', 'cancelled'].includes(status)) await mutateProposal(proposal.id, (item) => { item.status = 'failed'; item.error = String(detail?.run?.error || '执行失败，打开 AI 制片人查看') })
      } catch {
        /* run removed: leave as is */
      }
    }
  },

  /** 到点了：生成今天的计划；自动模式在额度内直接执行。返回新生成的待批准条数（没生成返回 null）。 */
  async runDaily(now = deps.now()): Promise<{ pending: number; started: number } | null> {
    const db = await store.read()
    if (!db.settings.enabled || new Date(now).getHours() < db.settings.hour) return null
    if (db.days.some((item) => item.day === autopilotDayKey(now))) return null
    const result = await this.generate({ auto: true })
    const proposals = result.day?.proposals || []
    return { pending: proposals.filter((item) => item.status === 'pending').length, started: proposals.filter((item) => item.auto && item.status !== 'pending').length }
  },
}

export type { AutopilotKind }
