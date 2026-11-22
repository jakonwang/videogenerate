/**
 * Plain-language analysis of one shop's business: why GMV moved, where it comes from, what
 * stock and service problems need attention. Pure functions, shared by the 店铺 page and the
 * morning report. Texts are built from message keys + params so every language can render them.
 */
import { shiftDate, sumShopDays, type SiCodeSummary, type SiShopDay } from './sellerInventory'

export type ShopHealthIndicator = {
  /** Stable platform key, e.g. `user_12h_valid_mcs_reply_rate_30d`. */
  key: string
  /** Platform title in the backend language, used when no translation exists. */
  title: string
  value?: number
  target: number
  operator: 'ge' | 'gt' | 'le' | 'lt'
  /** 101 = ratio, 202 = hours. */
  unit: number
  defective: number
}

export type ShopHealth = {
  shopKey: string
  fetchedAt: number
  indicators: ShopHealthIndicator[]
  todo: { toShip: number; urgentToShip: number; returns: number; urgentReturns: number; negativeReviews: number; outOfStock: number; rejectedProducts: number }
  violationScore: number
  violations: Array<{ key: string; title: string; count: number; score: number }>
  warnings: number
}

export type FindingLevel = 'error' | 'warning' | 'ok' | 'growth'
export type Finding = {
  id: string
  level: FindingLevel
  /** i18n key under `shops.finding.*`, with params. */
  key: string
  params: Record<string, string | number>
  /** Optional follow-up hint key under `shops.action.*`. */
  action?: string
}

export type ShopAnalysis = {
  shopKey: string
  date: string
  yesterday?: SiShopDay
  lastWeekSameDay?: SiShopDay
  gmvChangeDay?: number
  gmv7: number
  gmvPrev7: number
  gmvChange7?: number
  /** Estimated profit over the last 7 full days, when cost prices and fees are known. */
  profit7?: number
  margin7?: number
  findings: Finding[]
}

export function indicatorPasses(indicator: ShopHealthIndicator) {
  if (indicator.value === undefined || !Number.isFinite(indicator.value)) return true
  switch (indicator.operator) {
    case 'ge': return indicator.value >= indicator.target
    case 'gt': return indicator.value > indicator.target
    case 'le': return indicator.value <= indicator.target
    case 'lt': return indicator.value < indicator.target
    default: return true
  }
}

function rel(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : undefined
}

export type GmvDriver = 'visitors' | 'conversion' | 'perBuyer'

/**
 * Splits a GMV change into its three factors: GMV = visitors × (buyers / visitors) × (GMV / buyers).
 * In log space the three terms add up exactly, so each share says how much of the move it explains.
 */
export function decomposeGmv(current: Pick<SiShopDay, 'gmv' | 'visitors' | 'buyers'>, previous: Pick<SiShopDay, 'gmv' | 'visitors' | 'buyers'>) {
  if (!(current.gmv > 0 && previous.gmv > 0 && current.visitors > 0 && previous.visitors > 0 && current.buyers > 0 && previous.buyers > 0)) return null
  const terms: Record<GmvDriver, number> = {
    visitors: Math.log(current.visitors / previous.visitors),
    conversion: Math.log((current.buyers / current.visitors) / (previous.buyers / previous.visitors)),
    perBuyer: Math.log((current.gmv / current.buyers) / (previous.gmv / previous.buyers)),
  }
  const total = Math.log(current.gmv / previous.gmv)
  const direction = Math.sign(total) || 1
  // The driver is the factor that moved most in the same direction as GMV.
  const driver = (Object.keys(terms) as GmvDriver[]).sort((a, b) => terms[b] * direction - terms[a] * direction)[0]
  return {
    total,
    terms,
    driver,
    change: {
      visitors: current.visitors / previous.visitors - 1,
      conversion: (current.buyers / current.visitors) / (previous.buyers / previous.visitors) - 1,
      perBuyer: (current.gmv / current.buyers) / (previous.gmv / previous.buyers) - 1,
    } as Record<GmvDriver, number>,
  }
}

const DRIVER_ACTION: Record<GmvDriver, { down: string; up: string }> = {
  visitors: { down: 'traffic', up: 'keepTraffic' },
  conversion: { down: 'conversion', up: 'keepConversion' },
  perBuyer: { down: 'perBuyer', up: 'keepPerBuyer' },
}

function pct(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 1000) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

/** A readable name for a SKU: its code, or a short product name / id while it has no code. */
export function skuLabel(sku: Pick<SiCodeSummary, 'key' | 'mapped' | 'name'>) {
  if (sku.mapped) return sku.key
  const name = sku.name && !sku.name.startsWith('#') ? sku.name : ''
  if (name) return name.length > 18 ? `${name.slice(0, 18)}…` : name
  return `ID …${sku.key.replace('#', '').slice(-6)}`
}

export type AnalyzeInput = {
  shopKey: string
  today: string
  days: SiShopDay[]
  skus: SiCodeSummary[]
  health?: ShopHealth
  profit?: { profit7: number; margin7?: number; adShare7?: number; costCoverage?: number }
  /** Currency symbol of the shop, for money in the wording. */
  currency?: string
  /** Thresholds; defaults suit most shops. */
  moveThreshold?: number
}

export function analyzeShop(input: AnalyzeInput): ShopAnalysis {
  const threshold = input.moveThreshold ?? 0.2
  const byDate = new Map(input.days.map((day) => [day.date, day]))
  const yesterdayDate = shiftDate(input.today, -1)
  const yesterday = byDate.get(yesterdayDate)
  const lastWeekSameDay = byDate.get(shiftDate(yesterdayDate, -7))
  const findings: Finding[] = []

  // 1. Yesterday vs the same weekday last week (removes the weekday effect).
  let gmvChangeDay: number | undefined
  if (yesterday && lastWeekSameDay) {
    gmvChangeDay = rel(yesterday.gmv, lastWeekSameDay.gmv)
    const split = decomposeGmv(yesterday, lastWeekSameDay)
    if (gmvChangeDay !== undefined && Math.abs(gmvChangeDay) >= threshold && split) {
      const down = gmvChangeDay < 0
      findings.push({
        id: 'gmv-day',
        level: down ? (gmvChangeDay <= -0.35 ? 'error' : 'warning') : 'growth',
        key: down ? 'gmvDayDown' : 'gmvDayUp',
        params: { change: pct(gmvChangeDay), driver: split.driver, driverChange: pct(split.change[split.driver]) },
        action: DRIVER_ACTION[split.driver][down ? 'down' : 'up'],
      })
    }
  }

  // 2. Last 7 full days vs the 7 before.
  const last7 = input.days.filter((day) => day.date >= shiftDate(input.today, -7) && day.date < input.today)
  const prev7 = input.days.filter((day) => day.date >= shiftDate(input.today, -14) && day.date < shiftDate(input.today, -7))
  const now7 = sumShopDays(last7)
  const before7 = sumShopDays(prev7)
  const gmvChange7 = rel(now7.gmv, before7.gmv)
  if (last7.length >= 5 && prev7.length >= 5 && gmvChange7 !== undefined && Math.abs(gmvChange7) >= threshold) {
    const split = decomposeGmv(now7, before7)
    const down = gmvChange7 < 0
    findings.push({
      id: 'gmv-week',
      level: down ? 'warning' : 'growth',
      key: down ? 'gmvWeekDown' : 'gmvWeekUp',
      params: { change: pct(gmvChange7), driver: split?.driver || 'visitors', driverChange: pct(split ? split.change[split.driver] : undefined) },
      action: split ? DRIVER_ACTION[split.driver][down ? 'down' : 'up'] : undefined,
    })
  }

  // 3. Conversion fell while traffic held: usually price, reviews or a best seller out of stock.
  if (now7.visitors > 0 && before7.visitors > 0) {
    const conv = rel(now7.conversion, before7.conversion)
    const visitors = rel(now7.visitors, before7.visitors)
    if (conv !== undefined && conv <= -0.15 && (visitors === undefined || visitors > -0.1)) {
      findings.push({ id: 'conversion', level: 'warning', key: 'conversionDown', params: { change: pct(conv), value: pct(now7.conversion).replace('+', '') }, action: 'conversion' })
    }
  }

  // 4. Where GMV comes from.
  if (now7.gmv > 0) {
    const affiliate = (now7.affiliateLiveGmv + now7.affiliateVideoGmv) / now7.gmv
    const own = (now7.sellerLiveGmv + now7.sellerVideoGmv) / now7.gmv
    if (affiliate >= 0.7) findings.push({ id: 'affiliate-share', level: 'warning', key: 'affiliateHeavy', params: { share: pct(affiliate).replace('+', ''), own: pct(own).replace('+', '') }, action: 'ownContent' })
    for (const channel of ['liveGmv', 'videoGmv', 'cardGmv'] as const) {
      const share = now7[channel] / now7.gmv
      const change = rel(now7[channel], before7[channel])
      // Only when the channel moved differently from the shop as a whole; otherwise it repeats the GMV finding.
      if (share >= 0.15 && change !== undefined && Math.abs(change) >= 0.3 && Math.abs(change - (gmvChange7 ?? 0)) >= 0.2) {
        findings.push({ id: `channel-${channel}`, level: change < 0 ? 'warning' : 'growth', key: change < 0 ? 'channelDown' : 'channelUp', params: { channel, change: pct(change), share: pct(share).replace('+', '') } })
      }
    }
  }

  // 5. Stock: best sellers that are out or about to run out, with the sales at risk per day.
  const selling = input.skus.filter((sku) => sku.mapped && sku.units30 > 0)
  const out = selling.filter((sku) => sku.risk === 'out').sort((a, b) => b.amount30 - a.amount30)
  for (const sku of out.slice(0, 3)) {
    const perDay = sku.amount30 / 30
    findings.push({ id: `out-${sku.key}`, level: 'error', key: 'skuOut', params: { code: skuLabel(sku), perDay: Math.round(perDay), currency: input.currency || '' }, action: 'restock' })
  }
  const urgent = selling.filter((sku) => sku.risk === 'urgent').sort((a, b) => b.amount30 - a.amount30)
  for (const sku of urgent.slice(0, 3)) {
    findings.push({ id: `urgent-${sku.key}`, level: 'warning', key: 'skuUrgent', params: { code: skuLabel(sku), days: Math.max(0, Math.round((sku.daysLeft ?? 0) * 10) / 10), qty: sku.suggestQty }, action: 'restock' })
  }
  for (const sku of input.skus.filter((item) => item.tag === 'hot').slice(0, 3)) {
    findings.push({ id: `hot-${sku.key}`, level: 'growth', key: 'skuHot', params: { code: skuLabel(sku), units: sku.units7, change: sku.growth7 === undefined ? '' : pct(sku.growth7) }, action: 'pushHot' })
  }

  // 6. Service health and to-dos from the seller center.
  const health = input.health
  if (health) {
    for (const indicator of health.indicators.filter((item) => !indicatorPasses(item))) {
      findings.push({ id: `health-${indicator.key}`, level: 'warning', key: 'healthFail', params: { indicator: indicator.key, title: indicator.title, value: indicator.value ?? 0, target: indicator.target, unit: indicator.unit } })
    }
    if (health.violationScore > 0) findings.push({ id: 'violations', level: 'error', key: 'violationScore', params: { score: health.violationScore } })
    if (health.todo.urgentToShip > 0) findings.push({ id: 'urgent-ship', level: 'error', key: 'urgentShip', params: { n: health.todo.urgentToShip, total: health.todo.toShip } })
    if (health.todo.urgentReturns > 0) findings.push({ id: 'urgent-returns', level: 'warning', key: 'urgentReturns', params: { n: health.todo.urgentReturns, total: health.todo.returns } })
    if (health.todo.negativeReviews > 0) findings.push({ id: 'negative-reviews', level: 'warning', key: 'negativeReviews', params: { n: health.todo.negativeReviews } })
  }

  // 7. Profit, once cost prices cover most of what sold.
  const profit = input.profit
  if (profit && profit.margin7 !== undefined && (profit.costCoverage ?? 0) >= 0.7) {
    if (profit.profit7 < 0) findings.push({ id: 'profit-negative', level: 'error', key: 'profitNegative', params: { profit: Math.round(profit.profit7), margin: pct(profit.margin7) }, action: (profit.adShare7 ?? 0) >= 0.2 ? 'adCost' : 'margin' })
    else if (profit.margin7 < 0.05) findings.push({ id: 'profit-low', level: 'warning', key: 'profitLow', params: { margin: pct(profit.margin7).replace('+', '') }, action: (profit.adShare7 ?? 0) >= 0.2 ? 'adCost' : 'margin' })
  }

  const order: Record<FindingLevel, number> = { error: 0, warning: 1, growth: 2, ok: 3 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  if (!findings.some((item) => item.level === 'error' || item.level === 'warning')) {
    findings.push({ id: 'all-good', level: 'ok', key: 'allGood', params: {} })
  }
  return { shopKey: input.shopKey, date: input.today, yesterday, lastWeekSameDay, gmvChangeDay, gmv7: now7.gmv, gmvPrev7: before7.gmv, gmvChange7, profit7: profit?.profit7, margin7: profit?.margin7, findings }
}

export type MorningReport = {
  id: string
  date: string
  createdAt: number
  shops: Array<{ shopKey: string; name: string; region: string; analysis: ShopAnalysis }>
  delivered: { desktop?: boolean; feishu?: boolean; feishuError?: string }
}

export type ReportSettings = {
  enabled: boolean
  hour: number
  desktop: boolean
  feishu: boolean
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = { enabled: true, hour: 9, desktop: true, feishu: true }
