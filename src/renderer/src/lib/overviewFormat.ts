import type { OverviewKpi } from '../../../shared/overviewReport'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Display value of a KPI tile ("1,820 USD", "1.23", "50%"). */
export function formatKpi(kpi: OverviewKpi, locale: string) {
  if (kpi.value === null) return '—'
  if (kpi.format === 'percent') return `${kpi.value}%`
  if (kpi.format === 'roi') return kpi.value.toFixed(2)
  if (kpi.format === 'money') {
    const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: kpi.value >= 1000 ? 0 : 2 }).format(kpi.value)
    return kpi.currency ? `${amount} ${kpi.currency}` : amount
  }
  return new Intl.NumberFormat(locale).format(kpi.value)
}

/** "+20%" against the previous period; rates are shown as points. Empty when there is nothing to compare. */
export function kpiDeltaText(kpi: OverviewKpi, t: Translate) {
  if (kpi.change === null) return ''
  const sign = kpi.change > 0 ? '+' : ''
  return kpi.format === 'percent' ? t('ai.insights.overview.points', { value: `${sign}${kpi.change}` }) : `${sign}${kpi.change}%`
}

/** green = good news, red = bad news, '' = neutral (spend) or flat. */
export function kpiDeltaTone(kpi: OverviewKpi) {
  if (kpi.change === null || kpi.change === 0 || kpi.goodWhenUp === null) return ''
  return (kpi.change > 0) === kpi.goodWhenUp ? 'green' : 'red'
}

/** Signals built before ids were cleaned may still quote "「product-card:123」"; show it as 商品卡. */
export function cleanSignalText(text?: string) {
  return (text || '').replace(/[「[]\s*product-card:\d+\s*[」\]]/g, '「商品卡」')
}

/**
 * Change against the previous period for KPI tiles: "3.6%", "54%", and for jumps of 10x or more "75 倍"
 * (a "+7400%" is hard to read). Sign is left to the caller's arrow.
 */
export function compactChange(change: number, locale: string, t: Translate) {
  const abs = Math.abs(change)
  if (change > 0 && abs >= 900) return t('ai.insights.dash.times', { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(1 + change / 100) })
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: abs >= 100 ? 0 : 1 }).format(abs)}%`
}
