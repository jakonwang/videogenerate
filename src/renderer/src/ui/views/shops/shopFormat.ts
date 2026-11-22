import { SHOP_CURRENCY_METRICS, type ShopMetricKey } from '../../../../../shared/sellerInventory'

const CURRENCY: Record<string, string> = { VN: '₫', TH: '฿', MY: 'RM', PH: '₱', ID: 'Rp', SG: 'S$', US: '$', GB: '£' }

export function currencyOf(region?: string) {
  return CURRENCY[String(region || '').toUpperCase()] || ''
}

export function fmtNumber(value: number | undefined, locale: string, digits = 0) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)
}

/** Large amounts read better shortened: 12.6M, 980K. */
export function fmtMoney(value: number | undefined, locale: string, region?: string, compact = false) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const text = compact && Math.abs(value) >= 10_000
    ? new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat(locale, { maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value)
  return `${text}${currencyOf(region)}`
}

export function fmtPercent(value: number | undefined, locale: string, digits = 1) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(value)
}

export function fmtMetric(key: ShopMetricKey, value: number | undefined, locale: string, region?: string, compact = false) {
  if (key === 'conversion') return fmtPercent(value, locale, 2)
  if (SHOP_CURRENCY_METRICS.includes(key)) return fmtMoney(value, locale, region, compact)
  return fmtNumber(value, locale)
}

/** Relative change, or undefined when there is nothing to compare with. */
export function change(current: number, previous: number) {
  if (!previous) return undefined
  return (current - previous) / previous
}

export function fmtChange(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return ''
  const pct = Math.round(value * 1000) / 10
  return `${pct > 0 ? '+' : ''}${pct}%`
}
