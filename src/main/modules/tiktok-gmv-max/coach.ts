import { createHash } from 'node:crypto'
import type {
  GmvMaxChangeBudget,
  GmvMaxCoachAction,
  GmvMaxCoachDecision,
  GmvMaxCoachEvidence,
  GmvMaxCoachPlanDay,
  GmvMaxCoachStage,
  GmvMaxDailyMetric,
  GmvMaxProductProfile,
} from './types'

export const DEFAULT_GMV_MAX_CHANGE_BUDGET: GmvMaxChangeBudget = {
  maxRoiDelta: '0.2',
  maxBudgetIncreasePercent: '20',
  observationDays: 3,
}

const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const decimal = (value: number, digits = 2) => Number.isFinite(value)
  ? value.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '')
  : '0'

const percent = (value: number) => decimal(value, 1)

function average(rows: GmvMaxDailyMetric[]) {
  if (!rows.length) return { gmv: 0, roi: 0, spend: 0, budgetUtilization: 0 }
  const spend = rows.reduce((sum, row) => sum + number(row.cost), 0)
  const gmv = rows.reduce((sum, row) => sum + number(row.grossRevenue), 0)
  const utilization = rows.reduce((sum, row) => sum + number(row.budgetUtilization), 0) / rows.length
  return { gmv: gmv / rows.length, roi: spend > 0 ? gmv / spend : 0, spend: spend / rows.length, budgetUtilization: utilization }
}

function change(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

function stageFor(rows: GmvMaxDailyMetric[], recent: ReturnType<typeof average>, previous: ReturnType<typeof average>, breakEvenRoi: number): GmvMaxCoachStage {
  if (!rows.length) return 'new_product'
  const firstDate = rows[0].statDate.slice(0, 10)
  const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(firstDate)) / 86_400_000))
  if (ageDays < 7) return 'cold_start'
  if (recent.roi > 0 && recent.roi < breakEvenRoi) return 'profit_protection'
  if (previous.gmv > 0 && recent.gmv < previous.gmv * 0.85) return 'declining'
  if (previous.gmv > 0 && recent.gmv > previous.gmv * 1.15 && recent.gmv < Math.max(...rows.map((row) => number(row.grossRevenue))) * 0.9) return 'recovery'
  if (previous.gmv > 0 && recent.gmv > previous.gmv * 1.1 && recent.budgetUtilization < 0.8) return 'second_scale'
  if (recent.budgetUtilization >= 0.8 && recent.roi >= previous.roi) return 'scaling'
  return 'stable'
}

export function stageLabel(stage: GmvMaxCoachStage) {
  return {
    new_product: '新品冷启动',
    cold_start: '冷启动观察',
    stable: '稳定运营',
    declining: '老品衰退',
    recovery: '老品复苏',
    second_scale: '二次放量',
    scaling: '规模化',
    profit_protection: '利润保护',
  }[stage]
}

export function buildGmvMaxProductProfile(input: {
  campaignId: string
  storeId: string
  productId?: string
  productName?: string
  metrics: GmvMaxDailyMetric[]
  breakEvenRoi?: string
  now?: number
}): GmvMaxProductProfile {
  const rows = [...input.metrics].sort((left, right) => left.statDate.localeCompare(right.statDate))
  const recentRows = rows.slice(-7)
  const previousRows = rows.slice(-14, -7)
  const recent = average(recentRows)
  const previous = average(previousRows)
  const peakGmv = rows.reduce((max, row) => Math.max(max, number(row.grossRevenue)), 0)
  const peakRoi = rows.reduce((max, row) => Math.max(max, number(row.roi)), 0)
  const breakEvenRoi = number(input.breakEvenRoi)
  const stage = stageFor(rows, recent, previous, breakEvenRoi)
  const recoveryRate = peakGmv > 0 ? (recent.gmv / peakGmv) * 100 : undefined
  const baselineGmv = previous.gmv || recent.gmv
  const baselineRoi = previous.roi || recent.roi
  const roiTrend = baselineRoi > 0 ? change(recent.roi, baselineRoi) : undefined
  const stableDays = rows.slice().reverse().findIndex((row) => number(row.roi) < breakEvenRoi)
  const anomalyDays = rows.slice().reverse().findIndex((row) => number(row.roi) >= breakEvenRoi)
  const id = createHash('sha256').update(`${input.campaignId}:${input.productId || 'campaign'}`).digest('hex').slice(0, 32)
  return {
    id,
    campaignId: input.campaignId,
    storeId: input.storeId,
    productId: input.productId,
    productName: input.productName,
    firstDeliveryDate: rows[0]?.statDate.slice(0, 10),
    historicalPeakGmv: decimal(peakGmv),
    historicalPeakRoi: decimal(peakRoi),
    recentBaselineGmv: decimal(baselineGmv),
    recentBaselineRoi: decimal(baselineRoi),
    currentGmv: decimal(recent.gmv),
    currentRoi: decimal(recent.roi),
    breakEvenRoi: decimal(breakEvenRoi),
    stage,
    stageLabel: stageLabel(stage),
    recoveryRate: recoveryRate === undefined ? undefined : percent(recoveryRate),
    recoveryScore: recoveryRate === undefined ? undefined : percent(Math.max(0, Math.min(100, recoveryRate))),
    scalePotential: peakGmv > 0 ? percent(Math.max(0, (peakGmv - recent.gmv) / peakGmv * 100)) : undefined,
    budgetUtilization: recentRows.length ? percent(recent.budgetUtilization * 100) : undefined,
    roiTrendPercent: roiTrend === undefined ? undefined : percent(roiTrend),
    stableDays: stableDays < 0 ? rows.length : stableDays,
    anomalyDays: anomalyDays < 0 ? 0 : anomalyDays,
    declineDate: stage === 'declining' ? recentRows[0]?.statDate.slice(0, 10) : undefined,
    recoveryDate: stage === 'recovery' || stage === 'second_scale' ? recentRows[0]?.statDate.slice(0, 10) : undefined,
    source: 'derived',
    updatedAt: input.now ?? Date.now(),
  }
}

export function buildCoachEvidence(profile: GmvMaxProductProfile): GmvMaxCoachEvidence[] {
  return [
    { metric: 'Current GMV', value: profile.currentGmv, comparison: `baseline ${profile.recentBaselineGmv}`, meaning: 'Recent average revenue compared with the previous period.' },
    { metric: 'Current ROI', value: profile.currentRoi, comparison: `break-even ${profile.breakEvenRoi}`, meaning: 'Current efficiency compared with the configured profit floor.' },
    { metric: 'Recovery rate', value: profile.recoveryRate || '0', comparison: 'historical peak 100%', meaning: 'Recent GMV recovery against the historical peak.' },
    { metric: 'Budget utilization', value: profile.budgetUtilization || '0', comparison: 'scaling gate 80%', meaning: 'Whether budget consumption is currently limiting delivery.' },
  ]
}

export function buildFallbackCoachDecision(input: { profile: GmvMaxProductProfile; ruleDecisionId?: string; error?: string; now?: number }): GmvMaxCoachDecision {
  const profile = input.profile
  const action: GmvMaxCoachAction = profile.stage === 'profit_protection' ? 'profit_protection' : profile.stage === 'declining' ? 'creative_test' : 'hold'
  const guardrails = [
    'AI unavailable; use deterministic rule evidence only.',
    'All platform changes require approval.',
    `ROI change is limited to +/-${DEFAULT_GMV_MAX_CHANGE_BUDGET.maxRoiDelta}.`,
    `Budget increase is limited to ${DEFAULT_GMV_MAX_CHANGE_BUDGET.maxBudgetIncreasePercent}%.`,
  ]
  const plan: GmvMaxCoachPlanDay[] = [1, 2, 3].map((day) => ({
    day: day as 1 | 2 | 3,
    action: day === 1 ? (action === 'hold' ? '保持当前设置' : '完成风险处理') : '同步完整投放日并复核',
    objective: day === 1 ? '验证当前阶段和利润边界' : '用连续数据确认下一步动作',
    trigger: day === 3 ? '连续数据仍偏离目标时进入下一次审批' : undefined,
  }))
  return {
    diagnosis: input.error ? `规则判断可用, AI 判断不可用: ${input.error}` : '规则判断已生成, 等待 AI 解释。',
    stage: profile.stage,
    action,
    evidence: buildCoachEvidence(profile),
    plan,
    guardrails,
    aiAvailable: false,
    ruleDecisionId: input.ruleDecisionId,
    generatedAt: input.now ?? Date.now(),
  }
}

export function validateCoachDecision(input: {
  value: unknown
  profile: GmvMaxProductProfile
  currentTargetRoi: string
  currentBudget: string
  ruleDecisionId?: string
  now?: number
}) {
  const value = input.value as Record<string, unknown>
  const actions = new Set<GmvMaxCoachAction>(['hold', 'roi_change', 'budget_change', 'profit_protection', 'creative_test', 'manual_external'])
  if (!value || typeof value !== 'object') throw new Error('AI coach output must be an object.')
  if (typeof value.diagnosis !== 'string' || !value.diagnosis.trim()) throw new Error('AI coach diagnosis is missing.')
  if (!actions.has(String(value.action) as GmvMaxCoachAction)) throw new Error('AI coach action is invalid.')
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) throw new Error('AI coach evidence is missing.')
  if (value.evidence.some((item) => {
    const row = item as Record<string, unknown>
    return !row || typeof row !== 'object' || !String(row.metric || '').trim() || !String(row.value || '').trim() || !String(row.comparison || '').trim() || !String(row.meaning || '').trim()
  })) throw new Error('AI coach evidence is invalid.')
  if (!Array.isArray(value.plan) || value.plan.length !== 3) throw new Error('AI coach plan must contain three days.')
  const targetRoi = value.targetRoi === undefined ? undefined : decimal(number(value.targetRoi))
  const currentRoi = number(input.currentTargetRoi)
  if (targetRoi !== undefined && Math.abs(number(targetRoi) - currentRoi) > number(DEFAULT_GMV_MAX_CHANGE_BUDGET.maxRoiDelta)) throw new Error('AI coach ROI change exceeds the change budget.')
  const budget = value.budget === undefined ? undefined : decimal(number(value.budget))
  const currentBudget = number(input.currentBudget)
  if (budget !== undefined && currentBudget > 0 && number(budget) > currentBudget * 1.2) throw new Error('AI coach budget increase exceeds the change budget.')
  const plan = (value.plan as unknown[]).map((item, index) => {
    const row = item as Record<string, unknown>
    if (Number(row.day) !== index + 1 || typeof row.action !== 'string' || typeof row.objective !== 'string') throw new Error('AI coach plan day is invalid.')
    return { day: index + 1 as 1 | 2 | 3, action: row.action, objective: row.objective, targetRoi: row.targetRoi === undefined ? undefined : String(row.targetRoi), budget: row.budget === undefined ? undefined : String(row.budget), trigger: row.trigger === undefined ? undefined : String(row.trigger) }
  })
  return {
    diagnosis: String(value.diagnosis),
    stage: input.profile.stage,
    action: String(value.action) as GmvMaxCoachAction,
    targetRoi,
    budget,
    evidence: (value.evidence as unknown[]).map((item) => {
      const row = item as Record<string, unknown>
      return { metric: String(row.metric || ''), value: String(row.value || ''), comparison: String(row.comparison || ''), meaning: String(row.meaning || '') }
    }),
    plan,
    guardrails: Array.isArray(value.guardrails) ? value.guardrails.map(String) : [],
    aiAvailable: true,
    ruleDecisionId: input.ruleDecisionId,
    generatedAt: input.now ?? Date.now(),
  } satisfies GmvMaxCoachDecision
}

export function coachInputHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
