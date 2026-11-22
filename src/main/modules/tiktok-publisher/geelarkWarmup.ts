/**
 * 云手机自动养号：账号规则里设了「养号到某天」的 GeeLark TikTok 账号，每天在 GeeLark 上建一个养号任务，
 * 单数天随机刷视频，双数天（填了关键词时）搜关键词刷相关视频。时间在账号的可发时段里随机挑，避免每天同一时刻。
 * 到期后不再养号；矩阵分发在养号期内本来就不排这个号。
 */
import { createJsonStore } from '../content-hub/stores'
import { geelarkPublisher, geelarkRequest } from './geelark'
import { publishMatrixService } from './matrix'
import { geelarkFailText, geelarkTaskState, parseGeelarkAccountUid } from '../../../shared/geelark'
import { WARMUP_MINUTES_DEFAULT, normalizeMatrixAccount, type MatrixAccountSettings } from '../../../shared/publishMatrix'

export type WarmupAction = 'browse video' | 'search video'
export type WarmupLog = {
  uid: string
  day: string
  phoneId: string
  action: WarmupAction
  keywords?: string[]
  minutes: number
  scheduleAt: number
  taskId?: string
  state: 'scheduled' | 'running' | 'done' | 'failed'
  error?: string
}
type WarmupDb = { schemaVersion: 1; logs: WarmupLog[] }
const store = createJsonStore<WarmupDb>('geelark-warmup.json', () => ({ schemaVersion: 1, logs: [] }), (db) => ({ schemaVersion: 1, logs: Array.isArray(db?.logs) ? db.logs : [] }))
const KEEP_DAYS = 30
const MINUTE = 60_000

export function localDay(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const atHour = (at: number, hour: number) => { const d = new Date(at); d.setHours(hour, 0, 0, 0); return d.getTime() }

/** 今天要给哪些号建养号任务（纯函数） */
export function planWarmup(input: { accounts: MatrixAccountSettings[]; logs: WarmupLog[]; now: number; random?: () => number }): Omit<WarmupLog, 'state'>[] {
  const random = input.random || Math.random
  const today = localDay(input.now)
  const out: Omit<WarmupLog, 'state'>[] = []
  for (const raw of input.accounts) {
    const account = normalizeMatrixAccount(raw.uid, raw)
    const target = parseGeelarkAccountUid(account.uid)
    // GeeLark 的养号任务只支持 TikTok
    if (!target || target.platform !== 'tiktok' || account.paused || !account.warmupUntil || account.warmupUntil < today) continue
    const todays = input.logs.filter((log) => log.uid === account.uid && log.day === today)
    // 今天已经安排过；或者连着失败了 2 次（比如手机没开、配置错），今天不再试，免得每 10 分钟刷一次
    if (todays.some((log) => log.state !== 'failed') || todays.length >= 2) continue
    const minutes = account.warmupMinutes || WARMUP_MINUTES_DEFAULT
    const open = Math.max(atHour(input.now, account.activeStartHour), input.now + 5 * MINUTE)
    const close = (account.activeEndHour >= 24 ? atHour(input.now, 0) + 24 * 60 * MINUTE : atHour(input.now, account.activeEndHour)) - (minutes + 5) * MINUTE
    if (close <= open) continue // 今天的时段已经过了，明天再养
    const scheduleAt = open + Math.floor(random() * ((close - open) / MINUTE)) * MINUTE
    const keywords = (account.warmupKeywords || '').split(',').map((item) => item.trim()).filter(Boolean)
    const dayNumber = Math.floor(atHour(input.now, 0) / (24 * 60 * MINUTE))
    const action: WarmupAction = keywords.length && dayNumber % 2 === 0 ? 'search video' : 'browse video'
    out.push({ uid: account.uid, day: today, phoneId: target.phoneId, action, ...(action === 'search video' ? { keywords } : {}), minutes, scheduleAt })
  }
  return out
}

type Deps = { now: () => number; request: typeof geelarkRequest; configured: () => Promise<boolean>; accounts: () => Promise<MatrixAccountSettings[]> }
let deps: Deps = {
  now: () => Date.now(),
  request: geelarkRequest,
  configured: async () => (await geelarkPublisher.status()).configured,
  accounts: () => publishMatrixService.accounts(),
}
export function setWarmupTestDependencies(next: Partial<Deps>) { deps = { ...deps, ...next } }

export const geelarkWarmup = {
  /** 建今天的养号任务（每个号每天一个）。没连接 GeeLark 时什么都不做。 */
  async run() {
    if (!(await deps.configured())) return { created: 0 }
    const now = deps.now()
    const plans = planWarmup({ accounts: await deps.accounts(), logs: (await store.read()).logs, now })
    if (!plans.length) return { created: 0 }
    let created = 0
    for (const plan of plans) {
      try {
        const data = await deps.request<{ taskIds?: string[] }>('/open/v1/task/add', {
          planName: 'Klipmill 养号',
          taskType: 2,
          list: [{ scheduleAt: Math.floor(plan.scheduleAt / 1000), envId: plan.phoneId, action: plan.action, ...(plan.keywords ? { keywords: plan.keywords } : {}), duration: plan.minutes }],
        })
        const taskId = String(data?.taskIds?.[0] || '')
        if (!taskId) throw new Error('GeeLark 没有返回任务 ID')
        await store.mutate((db) => { db.logs.push({ ...plan, taskId, state: 'scheduled' }) })
        created += 1
      } catch (error: any) {
        await store.mutate((db) => { db.logs.push({ ...plan, state: 'failed', error: String(error?.message || error).slice(0, 200) }) })
      }
    }
    await store.mutate((db) => {
      const cutoff = localDay(now - KEEP_DAYS * 24 * 60 * MINUTE)
      db.logs = db.logs.filter((log) => log.day >= cutoff)
    })
    return { created }
  },

  /** 查 GeeLark 上养号任务的结果 */
  async sync() {
    const pending = (await store.read()).logs.filter((log) => log.taskId && (log.state === 'scheduled' || log.state === 'running'))
    if (!pending.length || !(await deps.configured())) return
    const data = await deps.request<{ items?: any[] }>('/open/v1/task/query', { ids: pending.map((log) => log.taskId).slice(0, 100) })
    await store.mutate((db) => {
      for (const item of data?.items || []) {
        const log = db.logs.find((entry) => entry.taskId === String(item.id))
        const state = geelarkTaskState(item.status)
        if (!log || !state) continue
        if (state === 'published') log.state = 'done'
        else if (state === 'publishing') log.state = 'running'
        else if (state === 'failed' || state === 'cancelled') { log.state = 'failed'; log.error = geelarkFailText(Number(item.failCode) || undefined, String(item.failDesc || '') || undefined) }
      }
    })
  },

  /** 每个号今天（以及最近一次）的养号情况，给账号规则弹窗显示 */
  async status() {
    await this.sync().catch(() => undefined)
    const today = localDay(deps.now())
    const logs = (await store.read()).logs
    const byUid: Record<string, { today?: WarmupLog; doneDays: number }> = {}
    for (const log of logs) {
      const row = byUid[log.uid] || { doneDays: 0 }
      if (log.day === today && (!row.today || log.state !== 'failed')) row.today = log
      if (log.state === 'done') row.doneDays += 1
      byUid[log.uid] = row
    }
    return byUid
  },
}
