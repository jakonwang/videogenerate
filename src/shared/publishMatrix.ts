/**
 * 矩阵发布：账号设置 + 错峰排期（纯函数，主进程建任务和界面预览共用）。
 *
 * 账号本身由 CreatOK 管登录（connection uid），这里只存每个号的发布规则：
 * 分组、每天最多几条、两条之间至少隔多久、几点到几点能发、养号到哪天、是否暂停。
 * 时间都按电脑本地时间算。
 */

export type MatrixAccountSettings = {
  uid: string
  group?: string
  /** 每天最多发几条（含已排上的） */
  dailyLimit: number
  /** 同一个号两条之间至少隔多少分钟 */
  minGapMinutes: number
  /** 每天几点开始可以发（0-23，含） */
  activeStartHour: number
  /** 每天几点之后不发（1-24，不含） */
  activeEndHour: number
  /** 养号到这一天（YYYY-MM-DD，含），之前不排发布 */
  warmupUntil?: string
  /** 云手机自动养号：搜索用的关键词（逗号分隔，比如 耳环, jewelry） */
  warmupKeywords?: string
  /** 云手机自动养号：每天刷多少分钟 */
  warmupMinutes?: number
  paused?: boolean
  updatedAt?: number
}

export const WARMUP_MINUTES_DEFAULT = 20

export const MATRIX_ACCOUNT_DEFAULTS: Omit<MatrixAccountSettings, 'uid'> = {
  dailyLimit: 3,
  minGapMinutes: 120,
  activeStartHour: 9,
  activeEndHour: 23,
}

export function normalizeMatrixAccount(uid: string, input: Partial<MatrixAccountSettings> = {}): MatrixAccountSettings {
  const int = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Math.round(Number(value))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }
  const start = int(input.activeStartHour, MATRIX_ACCOUNT_DEFAULTS.activeStartHour, 0, 23)
  const end = int(input.activeEndHour, MATRIX_ACCOUNT_DEFAULTS.activeEndHour, 1, 24)
  const warmup = String(input.warmupUntil || '').trim()
  const group = String(input.group || '').trim().slice(0, 40)
  const keywords = String(input.warmupKeywords || '').split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 8).join(', ').slice(0, 120)
  return {
    uid,
    ...(group ? { group } : {}),
    dailyLimit: int(input.dailyLimit, MATRIX_ACCOUNT_DEFAULTS.dailyLimit, 1, 50),
    minGapMinutes: int(input.minGapMinutes, MATRIX_ACCOUNT_DEFAULTS.minGapMinutes, 10, 24 * 60),
    activeStartHour: start,
    activeEndHour: end > start ? end : Math.min(24, start + 1),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(warmup) ? { warmupUntil: warmup } : {}),
    ...(keywords ? { warmupKeywords: keywords } : {}),
    // 留空 = 用默认 20 分钟
    ...(input.warmupMinutes !== undefined && input.warmupMinutes !== null && String(input.warmupMinutes).trim() !== '' && Number.isFinite(Number(input.warmupMinutes)) ? { warmupMinutes: int(input.warmupMinutes, WARMUP_MINUTES_DEFAULT, 5, 60) } : {}),
    ...(input.paused ? { paused: true } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  }
}

export type MatrixScheduleItem = { key: string; uid: string }
export type MatrixScheduleSlot = { key: string; uid: string; at: number }
export type MatrixScheduleSkip = { key: string; uid: string; reason: 'paused' | 'no_slot' }

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const MAX_DAYS_AHEAD = 60

function dayKey(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function atHour(at: number, hour: number) {
  const d = new Date(at)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}
function startOfWarmupEnd(warmupUntil?: string) {
  if (!warmupUntil) return 0
  const [y, m, d] = warmupUntil.split('-').map(Number)
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime()
}

/**
 * 给每条任务排一个发布时间：
 * - 暂停的号不排；养号期内不排
 * - 只排在号的活跃时段里；当天满额就顺延到第二天
 * - 同一号两条之间至少隔 minGapMinutes（也会避开已排上的任务）
 * - 不同号之间错开几分钟，再加一点随机抖动，避免整点齐发
 */
export function planMatrixSchedule(input: {
  items: MatrixScheduleItem[]
  accounts: MatrixAccountSettings[]
  /** 这些号已经排上 / 已发的时间，用来算当天额度和间隔 */
  existing?: Array<{ uid: string; at: number }>
  startAt: number
  /** 每条往后随机抖动的最大分钟数 */
  jitterMinutes?: number
  random?: () => number
}): { slots: MatrixScheduleSlot[]; skipped: MatrixScheduleSkip[] } {
  const random = input.random || Math.random
  const jitter = Math.max(0, input.jitterMinutes ?? 12)
  const byUid = new Map(input.accounts.map((a) => [a.uid, normalizeMatrixAccount(a.uid, a)]))
  const order = [...new Set(input.items.map((item) => item.uid))]
  const taken = new Map<string, number[]>()
  for (const entry of input.existing || []) {
    if (!Number.isFinite(entry.at)) continue
    const list = taken.get(entry.uid) || []
    list.push(entry.at)
    taken.set(entry.uid, list)
  }
  const cursor = new Map<string, number>()
  const slots: MatrixScheduleSlot[] = []
  const skipped: MatrixScheduleSkip[] = []

  for (const item of input.items) {
    const account = byUid.get(item.uid) || normalizeMatrixAccount(item.uid)
    if (account.paused) { skipped.push({ ...item, reason: 'paused' }); continue }
    const gap = account.minGapMinutes * MINUTE
    const list = taken.get(item.uid) || []
    const stagger = order.indexOf(item.uid) * 7 * MINUTE
    let t = cursor.get(item.uid) ?? Math.max(input.startAt + stagger, startOfWarmupEnd(account.warmupUntil))
    const limitAt = input.startAt + MAX_DAYS_AHEAD * DAY
    let placed: number | null = null
    while (t <= limitAt) {
      const open = atHour(t, account.activeStartHour)
      const close = account.activeEndHour >= 24 ? atHour(t, 0) + DAY : atHour(t, account.activeEndHour)
      if (t < open) { t = open + stagger; continue }
      if (t >= close) { t = atHour(t, 0) + DAY + account.activeStartHour * 60 * MINUTE + stagger; continue }
      const today = dayKey(t)
      if (list.filter((at) => dayKey(at) === today).length >= account.dailyLimit) {
        t = atHour(t, 0) + DAY + account.activeStartHour * 60 * MINUTE + stagger
        continue
      }
      const clash = list.find((at) => Math.abs(at - t) < gap)
      if (clash !== undefined) { t = clash + gap; continue }
      const at = Math.min(close - MINUTE, t + Math.floor(random() * jitter) * MINUTE)
      if (list.some((other) => Math.abs(other - at) < gap)) { t += MINUTE; continue }
      placed = at
      break
    }
    if (placed === null) { skipped.push({ ...item, reason: 'no_slot' }); continue }
    list.push(placed)
    taken.set(item.uid, list)
    cursor.set(item.uid, placed + gap)
    slots.push({ ...item, at: placed })
  }
  return { slots, skipped }
}

/** 把一批源视频摊到多个号上：每个视频发到每个选中的号（第 0 个号用原版，其余用变体）。 */
export function expandMatrixItems(sourceIds: string[], uids: string[]) {
  const items: Array<MatrixScheduleItem & { sourceId: string; variantIndex: number }> = []
  // 按视频轮流排，让同一个视频在各号的发布时间也错开
  for (const sourceId of sourceIds) {
    uids.forEach((uid, index) => items.push({ key: `${sourceId}:${uid}`, uid, sourceId, variantIndex: index }))
  }
  return items
}

/** 发布失败原因翻成大白话 + 下一步怎么做。 */
export function friendlyPublishError(message?: string): string {
  const text = String(message || '')
  const rules: Array<[RegExp, string]> = [
    [/外语版/, '这条的外语版没生成成功，选中它点「重新生成外语版」。如果是识别不到语音或 AI 没配置，先检查设置里的 AI 对话平台。'],
    [/variant|变体/i, '这条的变体视频没生成成功，可以点「重新生成变体」或关掉变体直接发原片。'],
    [/api key is not configured/i, '还没连接 CreatOK，先点右上角「去连接」填好密钥。'],
    [/account is not selected|connection/i, '没选发布账号，或者账号授权失效了。先给这条选账号；还不行就到 CreatOK 重新授权这个号。'],
    [/product is not selected|product title is required/i, '还没关联商品。选中这条，在右边「关联商品」里选一个。'],
    [/offensive language/i, '商品链接文字被 TikTok 判为违规词，在「关联商品 → 商品链接文字」里换个说法。'],
    [/定时发布时间|schedule/i, '发布时间太近或已经过了，改到 2 分钟以后再提交。'],
    [/video source is not available|not available/i, '找不到视频文件，可能被移动或删除了。重新导入这个视频。'],
    [/timeout|timed out|ECONN|network|fetch failed/i, '网络不稳定，稍后点「重试失败的」再发一次。'],
    [/rate limit|too many/i, '提交太频繁被限流了，等几分钟再重试。'],
  ]
  for (const [pattern, hint] of rules) if (pattern.test(text)) return hint
  return text ? `发布失败：${text}` : '发布失败，原因未知，可以先重试一次。'
}
