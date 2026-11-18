import { useI18n } from 'vue-i18n'

export type DiagnosisCode = 'collecting' | 'learning' | 'blocked' | 'losing' | 'underspend' | 'scale' | 'creatives' | 'healthy'

export type CreativeCounts = {
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

export type V2Diagnosis = {
  campaignId: string
  campaignName: string
  campaignType: 'PRODUCT' | 'LIVE'
  code: DiagnosisCode
  severity: 'critical' | 'warning' | 'opportunity' | 'info' | 'ok'
  params: Record<string, string | number>
  reasonKey: string
  action: { kind: 'none' | 'raise_roi' | 'lower_roi' | 'raise_budget' | 'fix_blocker' | 'fix_creatives' | 'review_offer'; from?: number; to?: number; timing: 'now' | 'morning' | 'none' }
  lessonId: string
  lines: { breakEvenRoi: number | null; recommendedTargetRoi: number | null; targetRoi: number | null; actualRoi7d: number | null }
  window: { days: number; cost: number; netCost: number; grossRevenue: number; orders: number; avgUtilization: number; aov: number | null; profit: number | null }
  marginSource: 'product' | 'store' | 'missing'
  learning: { active: boolean; daysLeft: number; since?: number; changeKind?: string }
  protection: { eligibleToday: boolean; yesterdayCredit: number; note?: 'protected_today_wait' | 'raise_voids_today' }
  impactPerDay: number
  creatives?: CreativeCounts
  series: Array<{ date: string; cost: number; grossRevenue: number; roi: number | null; targetRoi: number | null }>
}

export type V2Workspace = {
  generatedAt: number
  lastSyncedAt: number | null
  currency?: string
  stores: Array<{ storeId: string; storeName: string; currency?: string; timezone?: string; marginPercent: number | null }>
  setupNeeded: string[]
  settings: { storeMargins: Record<string, number>; thresholds: Record<string, number>; updatedAt: number }
  summary: {
    counts: Record<DiagnosisCode, number>
    cost7d: number
    grossRevenue7d: number
    roi7d: number | null
    profit7d: number | null
    yesterdayProtectionCredit: number
  }
  checklist: V2Diagnosis[]
  diagnoses: V2Diagnosis[]
  observing: V2Diagnosis[]
  recentChanges: Array<{ id: string; campaignId: string; kind: string; at: number; from?: number; to?: number; note?: string }>
}

export const CODE_ORDER: DiagnosisCode[] = ['blocked', 'losing', 'underspend', 'scale', 'creatives', 'learning', 'healthy', 'collecting']

export const CODE_TONE: Record<DiagnosisCode, string> = {
  blocked: 'gray',
  losing: 'red',
  underspend: 'amber',
  scale: 'green',
  creatives: 'violet',
  learning: 'blue',
  healthy: 'accent',
  collecting: 'gray',
}

export const LESSON_IDS = [
  'daily_rhythm',
  'break_even',
  'learning_period',
  'underspend_roi',
  'scale_budget',
  'roi_protection',
  'creative_supply',
  'blockers',
  'max_delivery',
  'seven_day_rolling',
] as const

/** Status meaning of each diagnosis: fixed status colours, always shown with an icon + label. */
export const CODE_STATUS: Record<DiagnosisCode, 'critical' | 'serious' | 'warning' | 'good' | 'neutral'> = {
  losing: 'critical',
  blocked: 'serious',
  underspend: 'warning',
  creatives: 'warning',
  scale: 'good',
  healthy: 'good',
  learning: 'neutral',
  collecting: 'neutral',
}

export type AccountSeries = {
  dates: string[]
  cost: number[]
  grossRevenue: number[]
  roi: Array<number | null>
  /** Cost-weighted break-even / target ROI across campaigns that have one. */
  breakEvenRoi: number | null
  targetRoi: number | null
  current: { cost: number; grossRevenue: number; roi: number | null; profit: number | null }
  previous: { cost: number; grossRevenue: number; roi: number | null; profit: number | null }
  avgUtilization: number | null
}

/** Sums the per-campaign 14-day series into one account-level series and compares the last 7 days with the 7 before. */
export function aggregateAccount(diagnoses: V2Diagnosis[]): AccountSeries {
  const byDate = new Map<string, { cost: number; gmv: number }>()
  for (const item of diagnoses) {
    for (const point of item.series) {
      const row = byDate.get(point.date) || { cost: 0, gmv: 0 }
      row.cost += point.cost
      row.gmv += point.grossRevenue
      byDate.set(point.date, row)
    }
  }
  const dates = [...byDate.keys()].sort().slice(-14)
  const cost = dates.map((date) => Math.round(byDate.get(date)!.cost * 100) / 100)
  const grossRevenue = dates.map((date) => Math.round(byDate.get(date)!.gmv * 100) / 100)
  const roi = dates.map((_date, index) => (cost[index] > 0 ? Math.round((grossRevenue[index] / cost[index]) * 100) / 100 : null))
  const weighted = (pick: (item: V2Diagnosis) => number | null) => {
    let weight = 0
    let total = 0
    for (const item of diagnoses) {
      const value = pick(item)
      if (!value || item.window.cost <= 0) continue
      weight += item.window.cost
      total += value * item.window.cost
    }
    return weight > 0 ? Math.round((total / weight) * 100) / 100 : null
  }
  const breakEvenRoi = weighted((item) => item.lines.breakEvenRoi)
  const margin = breakEvenRoi ? 1 / breakEvenRoi : null
  const period = (from: number, to: number) => {
    const c = cost.slice(from, to).reduce((a, b) => a + b, 0)
    const g = grossRevenue.slice(from, to).reduce((a, b) => a + b, 0)
    return { cost: c, grossRevenue: g, roi: c > 0 ? g / c : null, profit: margin !== null ? g * margin - c : null }
  }
  const n = dates.length
  const utilized = diagnoses.filter((item) => item.window.cost > 0)
  return {
    dates,
    cost,
    grossRevenue,
    roi,
    breakEvenRoi,
    targetRoi: weighted((item) => item.lines.targetRoi),
    current: period(Math.max(0, n - 7), n),
    previous: period(Math.max(0, n - 14), Math.max(0, n - 7)),
    avgUtilization: utilized.length ? utilized.reduce((sum, item) => sum + item.window.avgUtilization, 0) / utilized.length : null,
  }
}

/** Relative change as a fraction, or null when there is no base to compare against. */
export function change(current: number | null, previous: number | null) {
  if (current === null || previous === null || !Number.isFinite(previous) || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

export function emptyWorkspace(): V2Workspace {
  return {
    generatedAt: 0,
    lastSyncedAt: null,
    stores: [],
    setupNeeded: [],
    settings: { storeMargins: {}, thresholds: {}, updatedAt: 0 },
    summary: { counts: { collecting: 0, learning: 0, blocked: 0, losing: 0, underspend: 0, scale: 0, creatives: 0, healthy: 0 }, cost7d: 0, grossRevenue7d: 0, roi7d: null, profit7d: null, yesterdayProtectionCredit: 0 },
    checklist: [],
    diagnoses: [],
    observing: [],
    recentChanges: [],
  }
}

export function useGmvV2Text() {
  const { t, tm, rt, locale } = useI18n()

  function money(value: number | null | undefined, currency?: string) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-'
    try {
      if (currency) return new Intl.NumberFormat(String(locale.value), { style: 'currency', currency, maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 }).format(value)
    } catch {
      // unknown currency code
    }
    return new Intl.NumberFormat(String(locale.value), { maximumFractionDigits: 2 }).format(value)
  }

  function percent(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-'
    return `${Math.round(value * 100)}%`
  }

  function roi(value: number | null | undefined) {
    return value === null || value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(2)
  }

  function headline(item: V2Diagnosis) {
    return t(`gmvV2.codes.${item.code}.title`)
  }

  function reason(item: V2Diagnosis) {
    return t(`gmvV2.reasons.${item.reasonKey}`, { ...item.params, roi: roi(item.lines.actualRoi7d), target: roi(item.lines.targetRoi), breakEven: roi(item.lines.breakEvenRoi) })
  }

  function actionText(item: V2Diagnosis, currency?: string) {
    const a = item.action
    switch (a.kind) {
      case 'raise_roi':
        return a.from !== undefined
          ? t('gmvV2.actions.raiseRoi', { from: roi(a.from), to: roi(a.to) })
          : t('gmvV2.actions.raiseRoiMaxDelivery', { to: roi(a.to) })
      case 'lower_roi':
        return t('gmvV2.actions.lowerRoi', { from: roi(a.from), to: roi(a.to) })
      case 'raise_budget':
        return t('gmvV2.actions.raiseBudget', { from: money(a.from, currency), to: money(a.to, currency) })
      case 'fix_blocker':
        return t(`gmvV2.actions.fixBlocker.${item.reasonKey}`, { ...item.params })
      case 'fix_creatives':
        return t('gmvV2.actions.fixCreatives', { blocked: item.creatives ? item.creatives.authorizationNeeded + item.creatives.rejected + item.creatives.unavailable : 0 })
      case 'review_offer':
        return t('gmvV2.actions.reviewOffer')
      default:
        return item.code === 'losing' && item.protection.note === 'protected_today_wait'
          ? t('gmvV2.actions.waitProtection')
          : item.code === 'learning'
            ? t('gmvV2.actions.waitLearning', { days: item.learning.daysLeft })
            : t('gmvV2.actions.keep')
    }
  }

  function timingText(item: V2Diagnosis) {
    if (item.action.timing === 'morning') return t('gmvV2.timing.morning')
    if (item.action.kind === 'lower_roi') return t('gmvV2.timing.onceToday')
    if (item.action.kind === 'raise_budget') return t('gmvV2.timing.oncePerDay')
    return ''
  }

  /** Change kind recorded when the user says "I already changed it". */
  function changeKindFor(item: V2Diagnosis): 'roi' | 'budget' | 'products' | 'other' {
    if (item.action.kind === 'raise_roi' || item.action.kind === 'lower_roi') return 'roi'
    if (item.action.kind === 'raise_budget') return 'budget'
    if (item.action.kind === 'review_offer') return 'products'
    return 'other'
  }

  /** Turns IPC errors into a sentence the user can act on. */
  function friendlyError(cause: unknown) {
    const raw = String((cause as Error)?.message || cause || '')
    if (/No handler registered/i.test(raw)) return t('gmvV2.errors.restart')
    return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || t('gmvV2.errors.unknown')
  }

  /** Plain click-by-click instructions for making the suggested change in TikTok Ads Manager. */
  function stepsFor(item: V2Diagnosis, currency: string): string[] {
    const kind = item.action.kind
    const fmt = (value?: number) => (value === undefined ? '' : kind === 'raise_budget' ? money(value, currency) : value.toFixed(2))
    const list = tm(`gmvV2.simple.steps.${kind}`) as unknown
    if (!Array.isArray(list)) return []
    return list.map((entry) => rt(entry as never, { name: item.campaignName, to: fmt(item.action.to), from: fmt(item.action.from) }))
  }

  return { t, money, percent, roi, headline, reason, actionText, timingText, changeKindFor, friendlyError, stepsFor }
}

/** Opens the GMV MAX pages of TikTok Ads Manager in the system browser. */
export function openTikTokAdsManager() {
  void window.api.shell.openExternal('https://ads.tiktok.com/')
}
