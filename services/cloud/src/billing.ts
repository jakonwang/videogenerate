import { randomUUID } from 'node:crypto'
import {
  BILLING_CAPABILITIES,
  BILLING_CAPABILITY_LABELS,
  billingMonth,
  defaultPlanQuotas,
  normalizeBillingDefaults,
  type AiModelEntry,
  type BillingCapability,
  type BillingDefaults,
  type BillingRule,
  type CreditLedgerEntry,
  type CreditLedgerKind,
  type CreditsResponse,
  type CreditsSummary,
  type PricingResponse,
  type UsageClient,
  type UsageHold,
  type UsageHoldRequest,
  type UsageHoldSource,
} from '../../../src/shared/cloud/billing'
import type { CloudEntitlement } from '../../../src/shared/cloud/types'
import { transaction, type CloudDb } from './db'
import type { CloudRepo, UserRow } from './repo'
import { CloudError, badRequest, forbidden, notFound } from './security'

/**
 * 点数计费（云端是唯一账本）：
 * - 每次视频 / 图片生成前 hold：按套餐规则决定免费、包含还是扣点；扣点时立即从余额扣除并记流水。
 * - 生成成功 settle(ok)：确认；失败 settle(fail)：退回点数（每天有退还次数上限，防止刷退款）。
 * - 客户端崩溃没有回报的冻结，超过 HOLD_AUTO_COMMIT_MS 自动确认（不退）。
 */

export const BILLING_DEFAULTS_KEY = 'software.billing'
const HOLD_AUTO_COMMIT_MS = 12 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

type Row = Record<string, any>

const CLIENTS: UsageClient[] = ['desktop', 'web', 'mobile', 'server']

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return fallback
  }
}

function mapModel(row: Row): AiModelEntry {
  return {
    id: String(row.id),
    capability: row.capability as BillingCapability,
    platform: String(row.platform),
    model: String(row.model),
    label: String(row.label ?? ''),
    points: Number(row.points ?? 0),
    enabled: Number(row.enabled) === 1,
    planCodes: parseJson<string[]>(row.plan_codes, []),
    sort: Number(row.sort ?? 0),
    note: String(row.note ?? ''),
    updatedAt: Number(row.updated_at),
  }
}

function mapHold(row: Row): UsageHold {
  return {
    id: String(row.id),
    capability: row.capability as BillingCapability,
    platform: String(row.platform ?? ''),
    model: String(row.model ?? ''),
    source: row.source as UsageHoldSource,
    points: Number(row.points ?? 0),
    status: row.status,
    client: row.client as UsageClient,
    feature: String(row.feature ?? ''),
    createdAt: Number(row.created_at),
    settledAt: row.settled_at === null || row.settled_at === undefined ? null : Number(row.settled_at),
    reason: String(row.reason ?? ''),
  }
}

function mapLedger(row: Row): CreditLedgerEntry {
  return {
    id: Number(row.id),
    delta: Number(row.delta),
    balance: Number(row.balance),
    kind: row.kind as CreditLedgerKind,
    ref: String(row.ref ?? ''),
    note: String(row.note ?? ''),
    createdAt: Number(row.created_at),
  }
}

const clean = (value: unknown, max = 120) => String(value ?? '').trim().slice(0, max)

export function createBillingService(deps: {
  db: CloudDb
  repo: CloudRepo
  now: () => number
  entitlementFor: (user: UserRow) => CloudEntitlement
  /** 当前后台默认使用的模型（用于给用户显示「每次多少点」） */
  currentModel?: (capability: BillingCapability) => { platform: string; model: string } | null
}) {
  const { db, repo, now } = deps

  /* ---------------------------------------------------------------- 默认价格 */

  function readDefaults(): BillingDefaults {
    const entry = repo.listConfig('private').find((item) => item.key === BILLING_DEFAULTS_KEY)
    return normalizeBillingDefaults(entry?.value)
  }

  function saveDefaults(input: unknown, actorId: string): BillingDefaults {
    const value = normalizeBillingDefaults(input)
    repo.upsertConfig({ key: BILLING_DEFAULTS_KEY, value, scope: 'private', description: '点数计费默认价格', updatedBy: actorId, now: now() })
    return value
  }

  /* ---------------------------------------------------------------- 模型价目 */

  function listModels(): AiModelEntry[] {
    return (db.prepare('SELECT * FROM ai_models ORDER BY capability, sort, created_at').all() as Row[]).map(mapModel)
  }

  function upsertModel(input: Partial<AiModelEntry>): AiModelEntry {
    const capability = BILLING_CAPABILITIES.find((cap) => cap === input.capability)
    if (!capability) throw badRequest('请选择模型类型（视频 / 图片）')
    const model = clean(input.model)
    if (!model) throw badRequest('请填写模型 ID')
    const platform = clean(input.platform, 40) || '*'
    const points = Math.floor(Number(input.points))
    if (!Number.isFinite(points) || points < 0 || points > 1_000_000) throw badRequest('点数必须是 0 到 1000000 的整数')
    const planCodes = Array.isArray(input.planCodes) ? [...new Set(input.planCodes.map((code) => clean(code, 32)).filter(Boolean))] : []
    const t = now()
    const existing = input.id ? (db.prepare('SELECT * FROM ai_models WHERE id = ?').get(String(input.id)) as Row | undefined) : undefined
    const clash = db.prepare('SELECT id FROM ai_models WHERE capability = ? AND platform = ? AND model = ?').get(capability, platform, model) as Row | undefined
    if (clash && String(clash.id) !== String(existing?.id ?? '')) throw new CloudError('CONFLICT', '同一平台下这个模型已经在列表里了', 409)
    const id = existing ? String(existing.id) : `m_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const values = [capability, platform, model, clean(input.label, 60) || model, points, input.enabled === false ? 0 : 1, JSON.stringify(planCodes), Math.floor(Number(input.sort) || 0), clean(input.note, 200)]
    if (existing) {
      db.prepare('UPDATE ai_models SET capability = ?, platform = ?, model = ?, label = ?, points = ?, enabled = ?, plan_codes = ?, sort = ?, note = ?, updated_at = ? WHERE id = ?').run(...values, t, id)
    } else {
      db.prepare('INSERT INTO ai_models (capability, platform, model, label, points, enabled, plan_codes, sort, note, created_at, updated_at, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...values, t, t, id)
    }
    return mapModel(db.prepare('SELECT * FROM ai_models WHERE id = ?').get(id) as Row)
  }

  function deleteModel(id: string) {
    const result = db.prepare('DELETE FROM ai_models WHERE id = ?').run(id)
    if (!Number(result.changes)) throw notFound('模型不存在')
  }

  /** 先找同平台的精确配置，再找「任意平台」的配置 */
  function findModel(capability: BillingCapability, platform: string, model: string): AiModelEntry | null {
    if (!model) return null
    const row =
      (platform ? (db.prepare('SELECT * FROM ai_models WHERE capability = ? AND platform = ? AND model = ?').get(capability, platform, model) as Row | undefined) : undefined) ??
      (db.prepare("SELECT * FROM ai_models WHERE capability = ? AND platform = '*' AND model = ?").get(capability, model) as Row | undefined)
    return row ? mapModel(row) : null
  }

  function priceOf(capability: BillingCapability, platform: string, model: string, defaults = readDefaults()) {
    const entry = findModel(capability, platform, model)
    return entry ? entry.points : defaults.points[capability]
  }

  function pricing(): PricingResponse {
    return {
      defaults: readDefaults(),
      models: listModels().map(({ capability, platform, model, label, points, enabled }) => ({ capability, platform, model, label, points, enabled })),
    }
  }

  /* ---------------------------------------------------------------- 钱包 */

  function balance(userId: string): number {
    const row = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId) as Row | undefined
    return Number(row?.credits ?? 0)
  }

  /**
   * 改余额并记流水。必须在事务里调用（调用方负责开事务）。
   * clampAtZero：扣减超过余额时只扣到 0（订单退款、后台扣减用），否则余额不足直接报错。
   */
  function applyCreditsInTx(input: { userId: string; delta: number; kind: CreditLedgerKind; ref?: string; note?: string; actorUserId?: string | null; clampAtZero?: boolean }): number {
    let delta = Math.trunc(input.delta)
    const current = balance(input.userId)
    if (current + delta < 0) {
      if (!input.clampAtZero) throw new CloudError('INSUFFICIENT_CREDITS', `点数不足：需要 ${-delta} 点，当前剩余 ${current} 点`, 402)
      delta = -current
    }
    if (delta === 0) return current
    const next = current + delta
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(next, input.userId)
    db.prepare('INSERT INTO credit_ledger (user_id, delta, balance, kind, ref, note, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      input.userId,
      delta,
      next,
      input.kind,
      clean(input.ref, 80),
      clean(input.note, 200),
      input.actorUserId ?? null,
      now(),
    )
    return next
  }

  function ledger(userId: string, page = 1, pageSize = 20) {
    const total = Number((db.prepare('SELECT COUNT(*) AS n FROM credit_ledger WHERE user_id = ?').get(userId) as Row).n)
    const rows = db.prepare('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(userId, pageSize, (page - 1) * pageSize) as Row[]
    return { items: rows.map(mapLedger), total, page, pageSize }
  }

  /* ---------------------------------------------------------------- 规则 */

  function ruleFor(user: UserRow, capability: BillingCapability): BillingRule {
    const plan = user.planCode ? repo.getPlan(user.planCode) : null
    return (plan?.quotas ?? defaultPlanQuotas())[capability]
  }

  function countMonth(userId: string, capability: BillingCapability, month: string, source?: UsageHoldSource) {
    const row = (source
      ? db.prepare("SELECT COUNT(*) AS n FROM usage_holds WHERE user_id = ? AND month = ? AND capability = ? AND source = ? AND status != 'released'").get(userId, month, capability, source)
      : db.prepare("SELECT COUNT(*) AS n FROM usage_holds WHERE user_id = ? AND month = ? AND capability = ? AND status != 'released'").get(userId, month, capability)) as Row
    return Number(row.n)
  }

  function sweep() {
    db.prepare("UPDATE usage_holds SET status = 'committed', settled_at = ?, reason = '超时自动确认' WHERE status = 'held' AND created_at < ? AND id NOT IN (SELECT hold_id FROM scene_swap_items WHERE hold_id IS NOT NULL AND status IN ('queued', 'running', 'review'))").run(now(), now() - HOLD_AUTO_COMMIT_MS)
  }

  /* ---------------------------------------------------------------- 生成前冻结 / 生成后结算 */

  function hold(userId: string, request: UsageHoldRequest): UsageHold {
    const capability = BILLING_CAPABILITIES.find((cap) => cap === request?.capability)
    if (!capability) throw badRequest('不支持的计费类型')
    const platform = clean(request.platform, 40)
    const model = clean(request.model)
    const client: UsageClient = CLIENTS.includes(request.client as UsageClient) ? (request.client as UsageClient) : 'desktop'
    const feature = clean(request.feature, 40)
    const label = BILLING_CAPABILITY_LABELS[capability]
    sweep()
    return transaction(db, () => {
      const user = repo.getUserById(userId)
      if (!user) throw notFound('账号不存在')
      const entitlement = deps.entitlementFor(user)
      if (!entitlement.active) throw new CloudError('NO_ENTITLEMENT', '会员已过期，续费后才能继续生成', 402)
      const defaults = readDefaults()
      const entry = findModel(capability, platform, model)
      if (entry && !entry.enabled) throw forbidden(`模型「${entry.label}」已停用，请联系客服`)
      if (entry && entry.planCodes.length && !entitlement.unlimited && !entry.planCodes.includes(user.planCode ?? '')) {
        throw forbidden(`当前套餐不能使用模型「${entry.label}」，请升级套餐`)
      }
      const price = entry ? entry.points : defaults.points[capability]
      const month = billingMonth(now())
      let source: UsageHoldSource
      let points = 0
      if (entitlement.unlimited) {
        source = 'unlimited'
      } else {
        const rule = ruleFor(user, capability)
        if (rule.mode === 'disabled') throw forbidden(`当前套餐不包含${label}，请升级套餐`)
        if (rule.mode === 'unlimited') source = 'included'
        else if (rule.mode === 'free_then_credits' && countMonth(user.id, capability, month, 'free') < rule.freePerMonth) source = 'free'
        else {
          source = 'credits'
          points = price
        }
      }
      const id = `h_${randomUUID().replace(/-/g, '')}`
      if (points > 0) {
        const current = balance(user.id)
        if (current < points) {
          throw new CloudError('INSUFFICIENT_CREDITS', `点数不足：这次${label}需要 ${points} 点，当前剩余 ${current} 点。请购买套餐或兑换点数卡`, 402, { needed: points, balance: current })
        }
        applyCreditsInTx({ userId: user.id, delta: -points, kind: 'charge', ref: id, note: `${label} ${entry?.label || model || ''}`.trim() })
      }
      const t = now()
      db.prepare(
        'INSERT INTO usage_holds (id, user_id, capability, platform, model, client, feature, source, points, status, month, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(id, user.id, capability, platform, model, client, feature, source, points, 'held', month, t)
      return mapHold(db.prepare('SELECT * FROM usage_holds WHERE id = ?').get(id) as Row)
    })
  }

  /** ok=true 确认；ok=false 失败退回（受每日退还次数限制）。重复调用安全。userId 为 null 表示云端内部调用 */
  /** alwaysRefund：云端自己判定要退的（批量换景质检没过），不受、也不占每日退还次数 */
  function settle(userId: string | null, holdId: string, ok: boolean, reason = '', options: { alwaysRefund?: boolean } = {}): UsageHold {
    return transaction(db, () => {
      const row = db.prepare('SELECT * FROM usage_holds WHERE id = ?').get(String(holdId || '')) as Row | undefined
      if (!row || (userId !== null && row.user_id !== userId)) throw notFound('计费记录不存在')
      if (row.status !== 'held') return mapHold(row)
      const t = now()
      const why = clean(reason, 200)
      if (ok) {
        db.prepare("UPDATE usage_holds SET status = 'committed', settled_at = ? WHERE id = ?").run(t, row.id)
      } else {
        const points = Number(row.points)
        let refundable = true
        if (points > 0 && !options.alwaysRefund) {
          const limit = readDefaults().refundPerDay
          const used = Number(
            (db.prepare("SELECT COUNT(*) AS n FROM usage_holds WHERE user_id = ? AND status = 'released' AND points > 0 AND feature != 'scene-swap' AND settled_at >= ?").get(row.user_id, t - DAY) as Row).n,
          )
          refundable = used < limit
        }
        if (refundable) {
          if (points > 0) applyCreditsInTx({ userId: String(row.user_id), delta: points, kind: 'refund', ref: String(row.id), note: why || '生成失败退回' })
          db.prepare("UPDATE usage_holds SET status = 'released', settled_at = ?, reason = ? WHERE id = ?").run(t, why, row.id)
        } else {
          db.prepare("UPDATE usage_holds SET status = 'committed', settled_at = ?, reason = ? WHERE id = ?").run(t, `今天失败退还次数已达上限，未退点${why ? `：${why}` : ''}`, row.id)
        }
      }
      return mapHold(db.prepare('SELECT * FROM usage_holds WHERE id = ?').get(row.id) as Row)
    })
  }

  /* ---------------------------------------------------------------- 查询 */

  function summary(user: UserRow): CreditsSummary {
    const entitlement = deps.entitlementFor(user)
    const month = billingMonth(now())
    const defaults = readDefaults()
    return {
      balance: balance(user.id),
      unlimited: entitlement.unlimited,
      month,
      usage: BILLING_CAPABILITIES.map((capability) => {
        const current = deps.currentModel?.(capability)
        return {
          capability,
          rule: entitlement.unlimited ? { mode: 'unlimited', freePerMonth: 0 } : ruleFor(user, capability),
          freeUsed: countMonth(user.id, capability, month, 'free'),
          usedThisMonth: countMonth(user.id, capability, month),
          points: current ? priceOf(capability, current.platform, current.model, defaults) : defaults.points[capability],
        }
      }),
    }
  }

  function credits(user: UserRow, page = 1, pageSize = 20): CreditsResponse {
    return { ...summary(user), ledger: ledger(user.id, page, pageSize) }
  }

  function recentHolds(userId: string, limit = 50): UsageHold[] {
    return (db.prepare('SELECT * FROM usage_holds WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Row[]).map(mapHold)
  }

  /** 后台：近 N 天按模型统计生成次数与扣点 */
  function usageStats(days = 30) {
    const since = now() - days * DAY
    const rows = db
      .prepare(
        `SELECT capability, platform, model,
           SUM(CASE WHEN status != 'released' THEN 1 ELSE 0 END) AS calls,
           SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status != 'released' THEN points ELSE 0 END) AS points,
           COUNT(DISTINCT user_id) AS users
         FROM usage_holds WHERE created_at >= ? GROUP BY capability, platform, model ORDER BY calls DESC LIMIT 200`,
      )
      .all(since) as Row[]
    const totals = db.prepare('SELECT COALESCE(SUM(credits), 0) AS outstanding FROM users').get() as Row
    return {
      days,
      outstandingCredits: Number(totals.outstanding),
      models: rows.map((row) => ({
        capability: row.capability as BillingCapability,
        platform: String(row.platform),
        model: String(row.model),
        calls: Number(row.calls ?? 0),
        failed: Number(row.failed ?? 0),
        points: Number(row.points ?? 0),
        users: Number(row.users ?? 0),
      })),
    }
  }

  return {
    readDefaults,
    saveDefaults,
    listModels,
    upsertModel,
    deleteModel,
    pricing,
    balance,
    applyCreditsInTx,
    ledger,
    hold,
    settle,
    summary,
    credits,
    recentHolds,
    usageStats,
    sweep,
  }
}

export type BillingService = ReturnType<typeof createBillingService>
