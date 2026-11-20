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
