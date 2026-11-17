/**
 * GMV MAX V2 diagnosis engine.
 *
 * One campaign → exactly one diagnosis and one action, based on official TikTok GMV Max guidance:
 *  - hold ROI changes for at least 3 full days (learning period)
 *  - budget not spent usually means the ROI target is too high → lower it gradually
 *  - budget utilisation ≥ 80–90% with ROI on target → raise budget, at most +30% per day
 *  - ROI protection: ROI < 90% of the daily target and > 20 orders → TikTok credits the gap; raising the
 *    target (or lowering it more than once) on that day voids the protection
 *  - creative supply: blocked creatives (authorization needed, rejected, unavailable) and too few delivering videos
 *
 * Pure functions only: no database or network access, so the rules are unit-testable.
 */

export type DiagnosisCode =
  | 'collecting'
  | 'learning'
  | 'blocked'
  | 'losing'
  | 'underspend'
  | 'scale'
  | 'creatives'
  | 'healthy'

export type DiagnosisActionKind =
  | 'none'
  | 'raise_roi'
  | 'lower_roi'
  | 'raise_budget'
  | 'fix_blocker'
  | 'fix_creatives'
  | 'review_offer'

export type DiagnosisSettings = {
  /** Store default contribution margin before ads, 0–1. */
  defaultMargin: number | null
  /** Target ROI = break-even ROI × (1 + safety). */
  safetyMargin: number
  learningDays: number
  underspendUtilization: number
  scaleUtilization: number
  roiStep: number
  budgetStep: number
  minDeliveringCreatives: number
  /** Orders in the 7-day window needed before calling a campaign unprofitable. */
  minOrdersForVerdict: number
}

export const DEFAULT_DIAGNOSIS_SETTINGS: DiagnosisSettings = {
  defaultMargin: null,
  safetyMargin: 0.15,
  learningDays: 3,
  underspendUtilization: 0.5,
  scaleUtilization: 0.8,
  roiStep: 0.1,
  budgetStep: 0.3,
  minDeliveringCreatives: 40,
  minOrdersForVerdict: 10,
}

export type DiagnosisDay = {
  date: string
  cost: number
  netCost?: number
  grossRevenue: number
  orders: number
  /** Target ROI in effect that day (report field `roas_bid`), when known. */
  targetRoi?: number
  budgetUtilization: number
}

export type DiagnosisChange = {
  kind: 'roi' | 'budget' | 'products' | 'status' | 'other'
  at: number
  from?: number
  to?: number
  source: 'manual' | 'system' | 'report'
}

export type CreativeStatusCounts = {
  total: number
  delivering: number
  learning: number
  inQueue: number
  notDelivering: number
  authorizationNeeded: number
  excluded: number
  unavailable: number
  rejected: number
  notActive: number
}

export type DiagnosisInput = {
  campaignId: string
  campaignName: string
  campaignType: 'PRODUCT' | 'LIVE'
  operationStatus: string
  budget: number
  targetRoi: number
  /** Max delivery campaigns have no ROI target. */
  maxDelivery: boolean
  /** Complete days, oldest first, excluding today. */
  days: DiagnosisDay[]
  today?: { cost: number; grossRevenue: number; orders: number; asOf: number }
  changes: DiagnosisChange[]
  creatives?: CreativeStatusCounts
  /** Margin from complete product costs (0–1); overrides the store default. */
  productMargin?: number | null
  currency?: string
  now: number
}

export type DiagnosisLines = {
  breakEvenRoi: number | null
  recommendedTargetRoi: number | null
  targetRoi: number | null
  actualRoi7d: number | null
}

export type CampaignDiagnosis = {
  campaignId: string
  campaignName: string
  campaignType: 'PRODUCT' | 'LIVE'
  code: DiagnosisCode
  severity: 'critical' | 'warning' | 'opportunity' | 'info' | 'ok'
  /** i18n params for the headline / reason / action. */
  params: Record<string, string | number>
  reasonKey: string
  action: {
    kind: DiagnosisActionKind
    from?: number
    to?: number
    /** When to do it: `morning` = first thing tomorrow (ROI raises void ROI protection for the day). */
    timing: 'now' | 'morning' | 'none'
  }
  lessonId: string
  lines: DiagnosisLines
  window: {
    days: number
    cost: number
    netCost: number
    grossRevenue: number
    orders: number
    avgUtilization: number
    aov: number | null
    profit: number | null
  }
  marginSource: 'product' | 'store' | 'missing'
  learning: { active: boolean; daysLeft: number; since?: number; changeKind?: DiagnosisChange['kind'] }
  protection: {
    /** Today so far meets the ROI-protection condition. */
    eligibleToday: boolean
    /** Estimated credit for yesterday (complete day), if it qualified. */
    yesterdayCredit: number
    note?: 'protected_today_wait' | 'raise_voids_today'
  }
  /** Rough money impact used to rank the daily checklist (currency units per day). */
  impactPerDay: number
  creatives?: CreativeStatusCounts
}

const DAY_MS = 24 * 60 * 60 * 1000

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function sum(days: DiagnosisDay[], pick: (day: DiagnosisDay) => number) {
  return days.reduce((total, day) => total + (Number.isFinite(pick(day)) ? pick(day) : 0), 0)
}

/** Most recent ROI/budget change: explicit changes plus day-over-day target ROI changes seen in the report. */
export function latestChange(input: Pick<DiagnosisInput, 'changes' | 'days'>): DiagnosisChange | null {
  const fromReport: DiagnosisChange[] = []
  for (let index = 1; index < input.days.length; index += 1) {
    const before = input.days[index - 1].targetRoi
    const after = input.days[index].targetRoi
    if (before && after && Math.abs(before - after) > 0.005) {
      fromReport.push({ kind: 'roi', at: Date.parse(`${input.days[index].date}T00:00:00Z`), from: before, to: after, source: 'report' })
    }
  }
  const relevant = [...input.changes, ...fromReport].filter((change) => change.kind === 'roi' || change.kind === 'budget' || change.kind === 'products')
  return relevant.sort((a, b) => b.at - a.at)[0] || null
}

export function estimateRoiProtectionCredit(day: { cost: number; grossRevenue: number; orders: number; targetRoi?: number }) {
  if (!day.targetRoi || day.targetRoi <= 0 || day.orders <= 20 || day.cost <= 0) return 0
  const roi = day.grossRevenue / day.cost
  if (roi >= day.targetRoi * 0.9) return 0
  return Math.max(0, round(day.cost - day.grossRevenue / (day.targetRoi * 0.9)))
}

export function diagnoseCampaign(input: DiagnosisInput, settings: DiagnosisSettings = DEFAULT_DIAGNOSIS_SETTINGS): CampaignDiagnosis {
  const window = input.days.slice(-7)
  const cost = sum(window, (day) => day.cost)
  const netCost = sum(window, (day) => (day.netCost ?? day.cost))
  const gmv = sum(window, (day) => day.grossRevenue)
  const orders = sum(window, (day) => day.orders)
  const activeDays = window.filter((day) => day.cost > 0)
  const avgUtilization = activeDays.length ? sum(activeDays, (day) => day.budgetUtilization) / activeDays.length : 0
  const actualRoi = cost > 0 ? gmv / cost : null
  const aov = orders > 0 ? gmv / orders : null

  const margin = input.productMargin && input.productMargin > 0 ? input.productMargin : settings.defaultMargin && settings.defaultMargin > 0 ? settings.defaultMargin : null
  const marginSource: CampaignDiagnosis['marginSource'] = input.productMargin && input.productMargin > 0 ? 'product' : margin ? 'store' : 'missing'
  const breakEven = margin ? 1 / margin : null
  const recommendedTarget = breakEven ? breakEven * (1 + settings.safetyMargin) : null
  const target = input.maxDelivery ? null : input.targetRoi > 0 ? input.targetRoi : null
  const profit = margin !== null ? gmv * margin - netCost : null

  // ROI protection
  const yesterday = input.days.at(-1)
  const yesterdayCredit = yesterday && !input.maxDelivery ? estimateRoiProtectionCredit({ ...yesterday, targetRoi: yesterday.targetRoi || target || undefined }) : 0
  const todayRoi = input.today && input.today.cost > 0 ? input.today.grossRevenue / input.today.cost : null
  const eligibleToday = Boolean(!input.maxDelivery && target && input.today && input.today.orders > 20 && todayRoi !== null && todayRoi < target * 0.9)

  // Learning period
  const change = latestChange(input)
  const firstActive = input.days.find((day) => day.cost > 0)
  const campaignAgeDays = firstActive ? Math.floor((input.now - Date.parse(`${firstActive.date}T00:00:00Z`)) / DAY_MS) : 0
  const sinceChangeDays = change ? (input.now - change.at) / DAY_MS : Infinity
  const learningFromChange = sinceChangeDays < settings.learningDays
  const learningFromAge = firstActive ? campaignAgeDays < settings.learningDays : false
  const learning = {
    active: learningFromChange || learningFromAge,
    daysLeft: learningFromChange ? Math.max(1, Math.ceil(settings.learningDays - sinceChangeDays)) : learningFromAge ? Math.max(1, settings.learningDays - campaignAgeDays) : 0,
    since: learningFromChange ? change?.at : undefined,
    changeKind: learningFromChange ? change?.kind : undefined,
  }

  const base = {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    campaignType: input.campaignType,
    lines: {
      breakEvenRoi: breakEven ? round(breakEven) : null,
      recommendedTargetRoi: recommendedTarget ? round(recommendedTarget) : null,
      targetRoi: target ? round(target) : null,
      actualRoi7d: actualRoi !== null ? round(actualRoi) : null,
    },
    window: {
      days: window.length,
      cost: round(cost),
      netCost: round(netCost),
      grossRevenue: round(gmv),
      orders,
      avgUtilization: round(avgUtilization, 3),
      aov: aov !== null ? round(aov) : null,
      profit: profit !== null ? round(profit) : null,
    },
    marginSource,
    learning,
    protection: { eligibleToday, yesterdayCredit },
    creatives: input.creatives,
  }
  const make = (partial: Pick<CampaignDiagnosis, 'code' | 'severity' | 'reasonKey' | 'action' | 'lessonId'> & { params?: Record<string, string | number>; impactPerDay?: number; protectionNote?: CampaignDiagnosis['protection']['note'] }): CampaignDiagnosis => ({
    ...base,
    code: partial.code,
    severity: partial.severity,
    reasonKey: partial.reasonKey,
    action: partial.action,
    lessonId: partial.lessonId,
    params: {
      roi: actualRoi !== null ? round(actualRoi) : '-',
      target: target ? round(target) : '-',
      breakEven: breakEven ? round(breakEven) : '-',
      utilization: Math.round(avgUtilization * 100),
      budget: round(input.budget),
      orders,
      ...partial.params,
    },
    impactPerDay: round(partial.impactPerDay || 0),
    protection: { ...base.protection, note: partial.protectionNote },
  })

  const enabled = !/disable|delete|pause|off/i.test(input.operationStatus || '')

  // 1. Blocked
  if (!enabled) {
    return make({ code: 'blocked', severity: 'critical', reasonKey: 'paused', action: { kind: 'fix_blocker', timing: 'now' }, lessonId: 'blockers' })
  }
  if (!input.days.length || (cost === 0 && !input.today?.cost)) {
    if (input.days.length >= settings.learningDays && input.budget > 0) {
      return make({ code: 'blocked', severity: 'critical', reasonKey: 'no_spend', action: { kind: 'fix_blocker', timing: 'now' }, lessonId: 'blockers', params: { days: input.days.length } })
    }
    return make({ code: 'collecting', severity: 'info', reasonKey: 'collecting', action: { kind: 'none', timing: 'none' }, lessonId: 'learning_period' })
  }
  if (input.creatives && input.creatives.total > 0 && input.creatives.delivering + input.creatives.learning + input.creatives.inQueue === 0) {
    return make({ code: 'blocked', severity: 'critical', reasonKey: 'no_creatives', action: { kind: 'fix_creatives', timing: 'now' }, lessonId: 'blockers', params: { blocked: input.creatives.authorizationNeeded + input.creatives.rejected + input.creatives.unavailable } })
  }

  // 0. Learning — never touch a campaign that is still learning (but blockers above still surface).
  if (learning.active) {
    return make({
      code: 'learning',
      severity: 'info',
      reasonKey: learningFromChange ? 'learning_after_change' : 'learning_new',
      action: { kind: 'none', timing: 'none' },
      lessonId: 'learning_period',
      params: { daysLeft: learning.daysLeft },
    })
  }

  const enoughEvidence = orders >= settings.minOrdersForVerdict || (aov !== null && cost >= aov * 5)

  // 2. Losing money
  if (breakEven && actualRoi !== null && enoughEvidence && actualRoi < breakEven) {
    const dailyLoss = profit !== null && profit < 0 ? -profit / Math.max(1, window.length) : 0
    if (eligibleToday) {
      return make({ code: 'losing', severity: 'critical', reasonKey: 'losing_protected', action: { kind: 'none', timing: 'morning' }, lessonId: 'roi_protection', impactPerDay: dailyLoss, protectionNote: 'protected_today_wait' })
    }
    if (input.maxDelivery) {
      return make({ code: 'losing', severity: 'critical', reasonKey: 'losing_max_delivery', action: { kind: 'raise_roi', to: recommendedTarget ? round(recommendedTarget) : undefined, timing: 'morning' }, lessonId: 'max_delivery', impactPerDay: dailyLoss })
    }
    if (target && recommendedTarget && target < recommendedTarget - 0.005) {
      return make({ code: 'losing', severity: 'critical', reasonKey: 'losing_target_low', action: { kind: 'raise_roi', from: round(target), to: round(recommendedTarget), timing: 'morning' }, lessonId: 'break_even', impactPerDay: dailyLoss, protectionNote: 'raise_voids_today', params: { to: round(recommendedTarget) } })
    }
    return make({ code: 'losing', severity: 'critical', reasonKey: 'losing_target_ok', action: { kind: 'review_offer', timing: 'now' }, lessonId: 'break_even', impactPerDay: dailyLoss })
  }

  const floor = breakEven ? breakEven * 1.05 : null
  const onTarget = actualRoi !== null && (target ? actualRoi >= target * 0.97 : floor ? actualRoi >= floor : true)

  // 3. Under-spending: ROI target too tight
  if (!input.maxDelivery && target && avgUtilization < settings.underspendUtilization && onTarget) {
    const next = target * (1 - settings.roiStep)
    const lowered = floor ? Math.max(next, floor) : next
    const unusedBudget = input.budget * (1 - avgUtilization)
    const unitProfit = margin && actualRoi ? Math.max(0, actualRoi * margin - 1) : 0
    if (lowered < target - 0.005) {
      return make({ code: 'underspend', severity: 'warning', reasonKey: 'underspend', action: { kind: 'lower_roi', from: round(target), to: round(lowered), timing: 'now' }, lessonId: 'underspend_roi', impactPerDay: unusedBudget * unitProfit * 0.5, params: { to: round(lowered) } })
    }
    return make({ code: 'creatives', severity: 'warning', reasonKey: 'underspend_at_floor', action: { kind: 'fix_creatives', timing: 'now' }, lessonId: 'creative_supply', impactPerDay: unusedBudget * unitProfit * 0.3 })
  }

  // 4. Ready to scale
  if (avgUtilization >= settings.scaleUtilization && onTarget && (!breakEven || (actualRoi !== null && actualRoi >= breakEven * 1.05))) {
    const nextBudget = input.budget * (1 + settings.budgetStep)
    const unitProfit = margin && actualRoi ? Math.max(0, actualRoi * margin - 1) : 0
    return make({ code: 'scale', severity: 'opportunity', reasonKey: input.maxDelivery ? 'scale_max_delivery' : 'scale', action: { kind: 'raise_budget', from: round(input.budget), to: round(nextBudget), timing: 'now' }, lessonId: 'scale_budget', impactPerDay: (nextBudget - input.budget) * unitProfit, params: { to: round(nextBudget) } })
  }

  // 5. Creative supply
  if (input.creatives && input.creatives.total > 0) {
    const blocked = input.creatives.authorizationNeeded + input.creatives.rejected + input.creatives.unavailable
    if (blocked > 0 || input.creatives.delivering < settings.minDeliveringCreatives) {
      return make({ code: 'creatives', severity: 'warning', reasonKey: blocked > 0 ? 'creatives_blocked' : 'creatives_few', action: { kind: 'fix_creatives', timing: 'now' }, lessonId: 'creative_supply', params: { blocked, delivering: input.creatives.delivering, need: settings.minDeliveringCreatives } })
    }
  }

  // 6. Healthy
  return make({ code: 'healthy', severity: 'ok', reasonKey: enoughEvidence ? 'healthy' : 'healthy_low_volume', action: { kind: 'none', timing: 'none' }, lessonId: 'learning_period', params: { profitPerDay: profit !== null ? round(profit / Math.max(1, window.length)) : '-' } })
}

export function countCreativeStatuses(statuses: Array<string | undefined>): CreativeStatusCounts {
  const counts: CreativeStatusCounts = { total: 0, delivering: 0, learning: 0, inQueue: 0, notDelivering: 0, authorizationNeeded: 0, excluded: 0, unavailable: 0, rejected: 0, notActive: 0 }
  for (const raw of statuses) {
    const status = String(raw || '').toUpperCase()
    if (!status) continue
    counts.total += 1
    if (status === 'DELIVERING') counts.delivering += 1
    else if (status === 'LEARNING') counts.learning += 1
    else if (status === 'IN_QUEUE') counts.inQueue += 1
    else if (status === 'NOT_DELIVERYING' || status === 'NOT_DELIVERING') counts.notDelivering += 1
    else if (status === 'AUTHORIZATION_NEEDED') counts.authorizationNeeded += 1
    else if (status === 'EXCLUDED') counts.excluded += 1
    else if (status === 'UNAVAILABLE') counts.unavailable += 1
    else if (status === 'REJECTED') counts.rejected += 1
    else if (status === 'NOT_ACTIVE') counts.notActive += 1
  }
  return counts
}

/** Blockers and losses always come first; the remaining actions are ranked purely by money impact. */
const CHECKLIST_ORDER: Record<DiagnosisCode, number> = { blocked: 0, losing: 1, scale: 2, underspend: 2, creatives: 2, learning: 9, collecting: 9, healthy: 9 }

/** The daily to-do list: actionable diagnoses only, blockers first, then by money impact. */
export function buildDailyChecklist(diagnoses: CampaignDiagnosis[], limit = 5) {
  return diagnoses
    .filter((item) => item.action.kind !== 'none' || item.code === 'losing')
    .sort((a, b) => CHECKLIST_ORDER[a.code] - CHECKLIST_ORDER[b.code] || b.impactPerDay - a.impactPerDay)
    .slice(0, limit)
}

export function summarizeAccount(diagnoses: CampaignDiagnosis[]) {
  const counts: Record<DiagnosisCode, number> = { collecting: 0, learning: 0, blocked: 0, losing: 0, underspend: 0, scale: 0, creatives: 0, healthy: 0 }
  let profit = 0
  let profitKnown = false
  let cost = 0
  let gmv = 0
  let credits = 0
  for (const item of diagnoses) {
    counts[item.code] += 1
    cost += item.window.cost
    gmv += item.window.grossRevenue
    credits += item.protection.yesterdayCredit
    if (item.window.profit !== null) {
      profit += item.window.profit
      profitKnown = true
    }
  }
  return {
    counts,
    cost7d: round(cost),
    grossRevenue7d: round(gmv),
    roi7d: cost > 0 ? round(gmv / cost) : null,
    profit7d: profitKnown ? round(profit) : null,
    yesterdayProtectionCredit: round(credits),
  }
}
