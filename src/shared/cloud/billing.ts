/**
 * 点数计费：套餐规则、模型价目、点数钱包。电脑端、网页、手机和云端共用这份定义。
 *
 * - 计费按「一次 AI 生成」算：一次视频生成 / 一次图片生成。对话（文案、拆解）暂不计费。
 * - 每次生成前先向云端「冻结」点数，成功后确认，失败自动退回。
 * - 套餐决定每种生成怎么算：不限 / 每月免费 N 次后扣点 / 只扣点 / 不可用。
 */

export const BILLING_CAPABILITIES = ['video', 'image'] as const
export type BillingCapability = (typeof BILLING_CAPABILITIES)[number]

export const BILLING_CAPABILITY_LABELS: Record<BillingCapability, string> = {
  video: '视频生成',
  image: '图片生成',
}

/** unlimited：不限次数不扣点；free_then_credits：每月前 N 次免费，之后扣点；credits：每次扣点；disabled：不可用 */
export type BillingMode = 'unlimited' | 'free_then_credits' | 'credits' | 'disabled'

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  unlimited: '不限次数',
  free_then_credits: '每月免费 N 次，超出扣点',
  credits: '每次扣点',
  disabled: '不可用',
}

export type BillingRule = { mode: BillingMode; freePerMonth: number }
export type PlanQuotas = Record<BillingCapability, BillingRule>

/** 新建套餐默认扣点：「不限」要由管理员明确选择 */
export function newPlanQuotas(): PlanQuotas {
  return { video: { mode: 'credits', freePerMonth: 0 }, image: { mode: 'credits', freePerMonth: 0 } }
}

/** 老套餐没有配置时按「不限」处理，升级后已付费用户的使用方式不变 */
export function defaultPlanQuotas(): PlanQuotas {
  return { video: { mode: 'unlimited', freePerMonth: 0 }, image: { mode: 'unlimited', freePerMonth: 0 } }
}

export function normalizePlanQuotas(input: unknown): PlanQuotas {
  const base = defaultPlanQuotas()
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  for (const cap of BILLING_CAPABILITIES) {
    const rule = src[cap]
    if (!rule || typeof rule !== 'object') continue
    const mode: BillingMode = ['unlimited', 'free_then_credits', 'credits', 'disabled'].includes(rule.mode) ? rule.mode : base[cap].mode
    const free = Math.max(0, Math.min(100_000, Math.floor(Number(rule.freePerMonth) || 0)))
    base[cap] = { mode, freePerMonth: mode === 'free_then_credits' ? free : 0 }
  }
  return base
}

/** 模型价目：后台维护，按「能力 + 平台 + 模型 ID」匹配；平台填 * 表示任意平台 */
export type AiModelEntry = {
  id: string
  capability: BillingCapability
  platform: string
  model: string
  label: string
  /** 每次生成扣多少点 */
  points: number
  /** 平台每次实际收我们多少钱（分，可带小数）；0 = 没填，用默认成本。只在后台可见 */
  costFen: number
  enabled: boolean
  /** 允许使用的套餐编码，空数组表示全部套餐 */
  planCodes: string[]
  sort: number
  note: string
  updatedAt: number
}

export type BillingDefaults = {
  /** 没有在模型列表里的模型，按这个价格扣点 */
  points: Record<BillingCapability, number>
  /** 每个账号 24 小时内最多自动退还多少次失败生成（防止滥用退款），超出后失败不再退点 */
  refundPerDay: number
  /** 「不限次数」套餐每个账号 24 小时内最多生成几次，0 = 不封顶（不建议） */
  includedPerDay: Record<BillingCapability, number>
  /** 没有单独填成本的模型，每次按多少分算成本，0 = 未知 */
  costFen: Record<BillingCapability, number>
  /** 1 点卖多少分，用来估算收入和判断模型是否亏本，0 = 未填 */
  pointFen: number
}

/** 只给后台看的字段不能出现在公开价目里 */
export type PublicBillingDefaults = Pick<BillingDefaults, 'points' | 'refundPerDay'>

export function defaultBillingDefaults(): BillingDefaults {
  return { points: { video: 10, image: 2 }, refundPerDay: 50, includedPerDay: { video: 20, image: 60 }, costFen: { video: 0, image: 0 }, pointFen: 0 }
}

/** 金额（分），保留两位小数：单张图的成本可能不到 1 分 */
export function normalizeFen(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(10_000_000, Math.round(n * 100) / 100)) : 0
}

export function normalizeBillingDefaults(input: unknown): BillingDefaults {
  const base = defaultBillingDefaults()
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  for (const cap of BILLING_CAPABILITIES) {
    const value = Number(src.points?.[cap])
    if (Number.isFinite(value)) base.points[cap] = Math.max(0, Math.min(1_000_000, Math.floor(value)))
  }
  for (const cap of BILLING_CAPABILITIES) {
    const perDay = Number(src.includedPerDay?.[cap])
    if (src.includedPerDay?.[cap] !== undefined && Number.isFinite(perDay)) base.includedPerDay[cap] = Math.max(0, Math.min(100_000, Math.floor(perDay)))
    base.costFen[cap] = normalizeFen(src.costFen?.[cap])
  }
  base.pointFen = normalizeFen(src.pointFen)
  const refund = Number(src.refundPerDay)
  if (Number.isFinite(refund)) base.refundPerDay = Math.max(0, Math.min(10_000, Math.floor(refund)))
  return base
}

export type UsageHoldSource = 'unlimited' | 'included' | 'free' | 'credits'
export type UsageHoldStatus = 'held' | 'committed' | 'released'
export type UsageClient = 'desktop' | 'web' | 'mobile' | 'server'

export type UsageHoldRequest = {
  capability: BillingCapability
  platform: string
  model: string
  client?: UsageClient
  /** 哪个功能发起的（复刻、图生视频……），只用于统计 */
  feature?: string
}

export type UsageHold = {
  id: string
  capability: BillingCapability
  platform: string
  model: string
  source: UsageHoldSource
  points: number
  status: UsageHoldStatus
  client: UsageClient
  feature: string
  createdAt: number
  settledAt: number | null
  reason: string
}

export type CreditLedgerKind = 'order' | 'redeem' | 'admin' | 'charge' | 'refund' | 'order_refund'

export const CREDIT_LEDGER_LABELS: Record<CreditLedgerKind, string> = {
  order: '购买套餐',
  redeem: '兑换卡密',
  admin: '后台调整',
  charge: '生成扣点',
  refund: '失败退回',
  order_refund: '订单退款',
}

export type CreditLedgerEntry = {
  id: number
  delta: number
  balance: number
  kind: CreditLedgerKind
  ref: string
  note: string
  createdAt: number
}

export type CapabilityUsage = {
  capability: BillingCapability
  rule: BillingRule
  /** 本月已用免费次数 */
  freeUsed: number
  /** 本月总生成次数（不含失败退回的） */
  usedThisMonth: number
  /** 默认模型的每次价格（没有配置时按默认价） */
  points: number
}

export type CreditsSummary = {
  balance: number
  unlimited: boolean
  /** 本月统计周期，北京时间 YYYY-MM */
  month: string
  usage: CapabilityUsage[]
}

export type CreditsResponse = CreditsSummary & {
  ledger: { items: CreditLedgerEntry[]; total: number; page: number; pageSize: number }
}

export type PricingResponse = {
  defaults: PublicBillingDefaults
  models: Array<Pick<AiModelEntry, 'capability' | 'platform' | 'model' | 'label' | 'points' | 'enabled'>>
}

/** 北京时间的月份，用于每月免费次数 */
export function billingMonth(at: number): string {
  const d = new Date(at + 8 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export type CloudRedeemKind = 'plan' | 'credits'
