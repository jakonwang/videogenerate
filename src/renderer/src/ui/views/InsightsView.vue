<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  AlertTriangle, ArrowRight, ArrowUp, BarChart3, CalendarDays, CalendarRange, ChevronDown, ChevronRight, ClipboardList, Clapperboard, Factory,
  Filter, Layers, Lightbulb, PieChart, RefreshCcw, Send, ShieldCheck, ShoppingBag, Sparkles, TrendingUp, Trophy, Wand2, ChartNoAxesCombined, ClipboardCheck,
} from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'
import { cleanSignalText, compactChange, formatKpi as formatKpiValue, kpiDeltaTone } from '@/lib/overviewFormat'
import { thumbnailUrl } from '@/lib/localMedia'
import TrendChart from '../components/home/TrendChart.vue'
import ConversionFunnel, { type FunnelRow } from '../components/insights/ConversionFunnel.vue'
import OutputDonut, { type DonutSegment } from '../components/insights/OutputDonut.vue'
import Sparkline from '../components/insights/Sparkline.vue'
import { percentChange, type AdsTotals, type OverviewKpi, type OverviewReport, type OverviewSignal } from '../../../../shared/overviewReport'

type LineStats = { line: string; produced: number; approved: number; redo: number; discarded: number; published: number; approvalRate: number; daily?: number[] }
type Insights = {
  generatedAt: number
  rangeDays: number
  lines: LineStats[]
  topRedoReasons: Array<{ reason: string; count: number }>
  topProducts: Array<{ productId: string; productName: string; produced: number; approved: number; published: number }>
  publish: { total: number; published: number; failed: number; draft: number }
  recommendations: string[]
}
type Brief = { id: string; kind: 'daily' | 'weekly'; periodKey: string; headline: string; summary?: string; createdAt: number; items: Array<{ title: string; detail: string; aiPrompt?: string }> }
type ProductLite = { id: string; images?: Array<{ filePath?: string; isCover?: boolean }> }

const { t, locale } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()
const range = ref(7)
const data = ref<Insights | null>(null)
const overview = ref<OverviewReport | null>(null)
const history = ref<Brief[]>([])
const covers = ref<Record<string, string>>({})
const loading = ref(false)
const generating = ref(false)
const rangeMenu = ref(false)
const showAllSignals = ref(false)

const DAY = 86_400_000
const PRESETS = [1, 7, 30] as const
const CUSTOM = [14, 90] as const

async function load() {
  loading.value = true
  try {
    const [insights, briefs, report] = await Promise.all([
      window.api.contentHub.insights(range.value),
      window.api.contentHub.listBriefs(30),
      // A failing source must not blank the page: the content details below still render.
      window.api.contentHub.overview(range.value).catch(() => null),
    ])
    data.value = insights as Insights
    history.value = briefs as Brief[]
    overview.value = report as OverviewReport | null
  } finally {
    loading.value = false
  }
}

/** Cover images for the top products list; the page works without them. */
async function loadCovers() {
  try {
    const list = (await window.api.products.list()) as ProductLite[]
    covers.value = Object.fromEntries(list.map((product) => {
      const path = product.images?.find((image) => image.isCover)?.filePath || product.images?.[0]?.filePath || ''
      return [product.id, path]
    }).filter(([, path]) => path))
  } catch {
    covers.value = {}
  }
}

async function generateWeekly() {
  generating.value = true
  try {
    await window.api.contentHub.generateBrief('weekly')
    await load()
  } finally {
    generating.value = false
  }
}

function askAi(prompt: string) {
  void ai.open({ fresh: true, prompt, send: true })
}

function go(route?: string) {
  if (route) void router.push(route)
}

function pickRange(days: number) {
  range.value = days
  rangeMenu.value = false
}

// ── Header: range ────────────────────────────────────────────────────────────
function localDate(time: number) {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const dateSpan = computed(() => {
  const end = overview.value?.generatedAt || data.value?.generatedAt || Date.now()
  return `${localDate(end - (range.value - 1) * DAY)} – ${localDate(end)}`
})
const isCustom = computed(() => !(PRESETS as readonly number[]).includes(range.value))

// ── KPI tiles ────────────────────────────────────────────────────────────────
const kpiOf = (key: OverviewKpi['key']) => overview.value?.kpis.find((kpi) => kpi.key === key) || null

/** Ads GMV plus creator GMV, when at least one of them is connected. */
const totalGmv = computed<OverviewKpi | null>(() => {
  const ads = kpiOf('gmv')
  const creators = kpiOf('creatorGmv')
  const parts = [ads, creators].filter((kpi): kpi is OverviewKpi => !!kpi?.available && kpi.value !== null)
  if (!ads) return null
  if (!parts.length) return { ...ads, key: 'gmv', available: false }
  const value = parts.reduce((sum, kpi) => sum + (kpi.value || 0), 0)
  const previous = parts.every((kpi) => kpi.previous !== null) ? parts.reduce((sum, kpi) => sum + (kpi.previous || 0), 0) : null
  return { ...parts[0]!, value, previous, change: percentChange(value, previous), currency: ads.currency || parts[0]!.currency }
})

type Tile = { key: string; label: string; tone: string; icon: unknown; kpi: OverviewKpi; hero?: boolean; title?: string }
const tiles = computed<Tile[]>(() => {
  const list: Array<Tile | null> = [
    kpiOf('gmv') && { key: 'gmv', label: t('ai.insights.overview.kpi.gmv'), tone: 'violet', icon: ShoppingBag, kpi: kpiOf('gmv')!, hero: true },
    totalGmv.value && { key: 'total', label: t('ai.insights.dash.totalGmv'), tone: 'teal', icon: Layers, kpi: totalGmv.value, title: t('ai.insights.dash.totalGmvHint') },
    kpiOf('roi') && { key: 'roi', label: t('ai.insights.overview.kpi.roi'), tone: 'blue', icon: ChartNoAxesCombined, kpi: kpiOf('roi')! },
    kpiOf('orders') && { key: 'orders', label: t('ai.insights.dash.orders'), tone: 'orange', icon: ClipboardCheck, kpi: kpiOf('orders')! },
    kpiOf('produced') && { key: 'produced', label: t('ai.insights.overview.kpi.produced'), tone: 'pink', icon: Clapperboard, kpi: kpiOf('produced')! },
  ]
  return list.filter((tile): tile is Tile => !!tile)
})

function amount(kpi: OverviewKpi, value = kpi.value) {
  return formatKpiValue({ ...kpi, value, currency: undefined }, locale.value)
}
/** "54%" / "3.6%" / "75 倍"; empty when there is nothing to compare. Rates (percent KPIs) change in points. */
function deltaText(kpi: OverviewKpi) {
  if (kpi.change === null || kpi.change === 0) return ''
  if (kpi.format === 'percent') return t('ai.insights.overview.points', { value: Math.abs(kpi.change) })
  return compactChange(kpi.change, locale.value, t)
}
function deltaArrow(kpi: OverviewKpi) {
  return (kpi.change ?? 0) < 0 ? '▼' : '▲'
}

// ── Trend ────────────────────────────────────────────────────────────────────
type Metric = 'gmv' | 'roi' | 'orders' | 'spend'
const METRICS: Metric[] = ['gmv', 'roi', 'orders', 'spend']
const metric = ref<Metric>('gmv')
const metricLabel = (key: Metric) => key === 'gmv' ? 'GMV' : key === 'roi' ? 'ROI' : t(`ai.insights.dash.${key}`)

function metricValue(totals: AdsTotals, key: Metric) {
  if (key === 'gmv') return totals.revenue
  if (key === 'spend') return totals.spend
  if (key === 'orders') return totals.orders
  return totals.spend > 0 ? totals.revenue / totals.spend : 0
}
const trendPoints = computed(() => (overview.value?.trend?.days || []).map((day) => ({
  label: day.date.slice(5),
  // A day the ad data has not reached yet is a gap, not a real zero.
  current: day.hasCurrent === false ? null : metricValue(day.current, metric.value),
  previous: day.hasPrevious === false ? null : metricValue(day.previous, metric.value),
})))
const trendHasData = computed(() => trendPoints.value.some((point) => (point.current ?? 0) > 0 || (point.previous ?? 0) > 0))
/** "MM-DD" of the newest synced day, when the ad data stops before the end of the range. */
const trendSyncedTo = computed(() => {
  const trend = overview.value?.trend
  const last = trend?.lastDataDate
  const end = trend?.days[trend.days.length - 1]?.date
  return last && end && last < end ? last.slice(5) : ''
})
const trendCurrency = computed(() => overview.value?.trend?.currency || '')

function formatMetric(value: number) {
  if (metric.value === 'roi') return value.toFixed(2)
  const text = new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value)
  return metric.value === 'orders' || !trendCurrency.value ? text : `${text} ${trendCurrency.value}`
}
function formatAxis(value: number) {
  if (metric.value === 'roi') return value.toFixed(1)
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${+(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${+(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${+(value / 1e3).toFixed(1)}K`
  return String(Math.round(value))
}

// ── Funnel ───────────────────────────────────────────────────────────────────
const funnelRows = computed<FunnelRow[]>(() => {
  const steps = overview.value?.funnel || []
  const base = steps[0]?.value || 0
  return steps.map((step) => ({
    key: step.key,
    label: t(`ai.insights.overview.step.${step.key}`),
    value: step.value,
    // Orders also come from ads and creators, so "orders ÷ materials" is not a conversion rate.
    share: step.key !== 'orders' && base > 0 ? (step.value / base) * 100 : null,
    route: step.route,
  }))
})

// ── Output by line ───────────────────────────────────────────────────────────
const LINE_COLORS: Record<string, string> = { livephoto: '#14d3a8', clone: '#3b82f6', muse: '#8b5cf6', creative: '#38bdf8', production: '#ec4899' }
const LINE_ORDER = ['livephoto', 'clone', 'muse', 'creative', 'production']
const segments = computed<DonutSegment[]>(() => (data.value?.lines || [])
  .slice()
  .sort((a, b) => b.produced - a.produced || LINE_ORDER.indexOf(a.line) - LINE_ORDER.indexOf(b.line))
  .map((row) => ({ key: row.line, label: t(`ai.line.${row.line}`), value: row.produced, color: LINE_COLORS[row.line] || '#64748b' })))
const maxProduced = computed(() => Math.max(1, ...(data.value?.lines || []).map((row) => row.produced)))

// ── Diagnosis ────────────────────────────────────────────────────────────────
type Diagnosis = { id: string; tone: 'red' | 'green' | 'amber' | 'blue'; icon: unknown; title: string; detail: string; action: 'plan' | 'run' | 'detail'; signal?: OverviewSignal; prompt?: string }
const diagnosis = computed<Diagnosis[]>(() => {
  const report = overview.value
  const rows: Diagnosis[] = []
  const toRow = (signal: OverviewSignal): Diagnosis => {
    const tone = signal.kind === 'growth' ? 'green' : signal.kind === 'todo' ? 'blue' : signal.level === 'error' ? 'red' : 'amber'
    const icon = signal.kind === 'growth' ? ArrowUp : signal.kind === 'todo' ? ClipboardList : AlertTriangle
    const action = signal.aiPrompt ? 'run' : signal.kind === 'problem' ? 'plan' : 'detail'
    return { id: signal.id, tone, icon, title: cleanSignalText(signal.title), detail: cleanSignalText(signal.detail), action, signal, prompt: signal.aiPrompt }
  }
  if (report) {
    const first = report.problems[0]
    if (first) rows.push(toRow(first))
    if (report.growth[0]) rows.push(toRow(report.growth[0]))
    for (const signal of [...report.problems.slice(1), ...report.todos, ...report.growth.slice(1)]) {
      if (rows.length >= 3) break
      rows.push(toRow(signal))
    }
  }
  for (const text of data.value?.recommendations || []) {
    if (rows.length >= 3) break
    rows.push({ id: `rec.${text}`, tone: 'amber', icon: Lightbulb, title: text, detail: '', action: 'detail', prompt: text })
  }
  return rows
})
function runDiagnosis(row: Diagnosis) {
  if (row.action === 'run' && row.prompt) askAi(row.prompt)
  else if (row.signal?.route) go(row.signal.route)
  else if (row.prompt) askAi(row.prompt)
}

// ── Risk radar ───────────────────────────────────────────────────────────────
const radar = computed(() => {
  const problems = overview.value?.problems || []
  const high = problems.filter((signal) => signal.level === 'error').length
  const mid = problems.length - high
  const tip = overview.value?.todos.length || 0
  return { high, mid, tip, total: high + mid + tip }
})
const signalColumns = computed(() => [
  { key: 'problems', icon: AlertTriangle, tone: 'red', items: overview.value?.problems || [], empty: t('ai.insights.overview.noProblems') },
  { key: 'growth', icon: TrendingUp, tone: 'green', items: overview.value?.growth || [], empty: t('ai.insights.overview.noGrowth') },
  { key: 'todos', icon: ClipboardList, tone: 'blue', items: overview.value?.todos || [], empty: t('ai.insights.overview.noTodos') },
])

// ── Top products ─────────────────────────────────────────────────────────────
const topProducts = computed(() => (data.value?.topProducts || []).map((product) => ({
  ...product,
  cover: covers.value[product.productId] ? thumbnailUrl(covers.value[product.productId], 112) : '',
  roi: overview.value?.productRoi?.[product.productId],
})))

const weeklyBriefs = computed(() => history.value.filter((brief) => brief.kind === 'weekly'))

watch(range, () => void load())
onMounted(() => {
  void load()
  void loadCovers()
})
</script>

<template>
  <main class="vg-scope vg-page vg-dash dash" data-testid="insights-view">
    <!-- Header -->
    <header class="dash-head">
      <span class="dash-head__icon"><BarChart3 :size="22" /></span>
      <div class="dash-head__text">
        <h1>{{ t('ai.insights.title') }}</h1>
        <p>{{ t('ai.insights.dash.desc') }}</p>
      </div>
      <div class="dash-head__actions">
        <div class="dash-seg">
          <button v-for="days in PRESETS" :key="days" type="button" :class="{ 'is-active': range === days }" @click="pickRange(days)">
            {{ days === 1 ? t('ai.insights.dash.today') : days === 7 ? t('ai.insights.dash.last7') : t('ai.insights.dash.last30') }}
          </button>
          <button type="button" :class="{ 'is-active': isCustom }" @click="rangeMenu = !rangeMenu">
            {{ isCustom ? t('ai.insights.dash.lastDays', { count: range }) : t('ai.insights.dash.custom') }}
          </button>
        </div>
        <div class="dash-date">
          <button type="button" class="dash-date__btn" @click="rangeMenu = !rangeMenu">
            <CalendarDays :size="16" />
            <span class="vg-num">{{ dateSpan }}</span>
            <ChevronDown :size="15" />
          </button>
          <template v-if="rangeMenu">
            <div class="dash-date__backdrop" @click="rangeMenu = false"></div>
            <div class="dash-date__menu">
              <button v-for="days in [...PRESETS, ...CUSTOM].sort((a, b) => a - b)" :key="days" type="button" :class="{ 'is-active': range === days }" @click="pickRange(days)">
                {{ days === 1 ? t('ai.insights.dash.today') : t('ai.insights.dash.lastDays', { count: days }) }}
              </button>
            </div>
          </template>
        </div>
        <button type="button" class="dash-icon-btn" :title="t('ai.insights.dash.refresh')" :disabled="loading" @click="load"><RefreshCcw :size="15" :class="{ 'vg-spin': loading }" /></button>
      </div>
    </header>

    <!-- KPI tiles -->
    <section v-if="tiles.length" class="dash-kpis" data-testid="overview-kpis">
      <button
        v-for="tile in tiles"
        :key="tile.key"
        type="button"
        class="dash-kpi"
        :class="[`dash-kpi--${tile.tone}`, { 'dash-kpi--hero': tile.hero }]"
        :title="tile.title"
        @click="go(tile.kpi.route)"
      >
        <span class="dash-kpi__icon"><component :is="tile.icon" :size="tile.hero ? 30 : 26" /></span>
        <span class="dash-kpi__copy">
          <span class="dash-kpi__label">{{ tile.label }}<template v-if="tile.kpi.currency && tile.kpi.available"> ({{ tile.kpi.currency }})</template></span>
          <template v-if="tile.kpi.available">
            <strong class="dash-kpi__value vg-num" :style="{ '--chars': amount(tile.kpi).length }" :title="formatKpiValue(tile.kpi, locale)">{{ amount(tile.kpi) }}</strong>
            <span class="dash-kpi__foot">
              <span v-if="deltaText(tile.kpi)" class="dash-kpi__delta vg-num" :class="kpiDeltaTone(tile.kpi) && `dash-kpi__delta--${kpiDeltaTone(tile.kpi)}`">{{ deltaArrow(tile.kpi) }} {{ deltaText(tile.kpi) }}</span>
              <span v-if="tile.hero && tile.kpi.previous !== null" class="dash-kpi__prev vg-num" :title="formatKpiValue({ ...tile.kpi, value: tile.kpi.previous }, locale)">{{ t('ai.insights.dash.previous', { value: amount(tile.kpi, tile.kpi.previous) }) }}</span>
            </span>
          </template>
          <template v-else>
            <strong class="dash-kpi__value dash-kpi__value--off">{{ t('ai.insights.overview.notConnected') }}</strong>
            <span class="dash-kpi__foot">{{ t('ai.insights.overview.connect') }} <ChevronRight :size="12" /></span>
          </template>
        </span>
        <svg v-if="tile.hero" class="dash-kpi__wave" viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,70 C40,68 70,60 100,45 C130,30 150,10 200,4 L200,80 L0,80 Z" />
        </svg>
      </button>
    </section>
    <p v-if="overview?.adsOtherCurrencies.length" class="vg-field__hint dash-note">{{ t('ai.insights.overview.otherCurrencies', { list: overview.adsOtherCurrencies.join(' / ') }) }}</p>

    <!-- Trend · funnel · distribution -->
    <section class="dash-row dash-row--three">
      <div class="dash-panel dash-trend">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><BarChart3 :size="18" /> {{ t('ai.insights.dash.trend') }}</span>
          <div class="dash-seg dash-seg--sm dash-seg--end">
            <button v-for="key in METRICS" :key="key" type="button" :class="{ 'is-active': metric === key }" @click="metric = key">{{ metricLabel(key) }}</button>
          </div>
        </div>
        <div class="dash-trend__chart">
          <TrendChart
            v-if="trendHasData"
            :points="trendPoints"
            :format="formatMetric"
            :axis-format="formatAxis"
            :current-label="t('ai.insights.dash.current', { metric: metricLabel(metric) })"
            :previous-label="t('ai.insights.dash.prev', { metric: metricLabel(metric) })"
            :no-data-label="t('ai.home.trend.noData')"
          />
          <div v-else class="dash-empty"><TrendingUp :size="18" /> {{ t('ai.insights.dash.trendEmpty') }}</div>
        </div>
        <div v-if="trendHasData" class="dash-trend__legend">
          <span><i class="dash-dot"></i>{{ t('ai.insights.dash.current', { metric: metricLabel(metric) }) }}</span>
          <span><i class="dash-dot dash-dot--prev"></i>{{ t('ai.insights.dash.prev', { metric: metricLabel(metric) }) }}</span>
          <span v-if="trendSyncedTo" class="dash-trend__synced">{{ t('ai.home.trend.syncedTo', { date: trendSyncedTo }) }}</span>
        </div>
      </div>

      <div class="dash-panel">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><Filter :size="18" /> {{ t('ai.insights.dash.funnel') }}</span>
        </div>
        <ConversionFunnel :rows="funnelRows" :locale="locale" @open="go" />
      </div>

      <div class="dash-panel">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><PieChart :size="18" /> {{ t('ai.insights.dash.distribution') }}</span>
        </div>
        <OutputDonut :segments="segments" :total-label="t('ai.insights.dash.totalProduced')" :locale="locale" />
      </div>
    </section>

    <!-- Diagnosis · lines -->
    <section class="dash-row dash-row--two">
      <div class="dash-panel" data-testid="overview-headline">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><span class="dash-ai-badge">AI</span> {{ t('ai.insights.dash.diagnosis') }}</span>
          <button type="button" class="dash-link dash-link--end" @click="askAi(t('ai.insights.overview.askAiPrompt'))"><Wand2 :size="14" /> {{ t('ai.insights.overview.askAi') }}</button>
        </div>
        <ul v-if="diagnosis.length" class="dash-diag">
          <li v-for="row in diagnosis" :key="row.id" class="dash-diag__item" :class="`dash-diag__item--${row.tone}`">
            <span class="dash-diag__icon"><component :is="row.icon" :size="17" /></span>
            <span class="dash-diag__copy">
              <strong>{{ row.title }}</strong>
              <span v-if="row.detail">{{ row.detail }}</span>
            </span>
            <button type="button" class="dash-diag__btn" @click="runDiagnosis(row)">{{ t(`ai.insights.dash.${row.action === 'plan' ? 'viewPlan' : row.action === 'run' ? 'runNow' : 'viewDetail'}`) }}</button>
          </li>
        </ul>
        <div v-else class="dash-empty"><ShieldCheck :size="18" /> {{ t('ai.insights.dash.noDiagnosis') }}</div>
      </div>

      <div class="dash-panel">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><Factory :size="18" /> {{ t('ai.insights.dash.lines') }}</span>
        </div>
        <div class="dash-table-wrap">
          <table class="dash-table">
            <thead>
              <tr>
                <th>{{ t('ai.insights.line') }}</th>
                <th>{{ t('ai.insights.produced') }}</th>
                <th>{{ t('ai.insights.approved') }}</th>
                <th>{{ t('ai.insights.redo') }}</th>
                <th>{{ t('ai.insights.approvalRate') }}</th>
                <th>{{ t('ai.insights.published') }}</th>
                <th>{{ t('ai.insights.dash.trendCol') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data?.lines || []" :key="row.line">
                <td>
                  <span class="dash-table__line">{{ t(`ai.line.${row.line}`) }}</span>
                  <span class="dash-table__bar"><span :style="{ width: `${(row.produced / maxProduced) * 100}%` }"></span></span>
                </td>
                <td class="vg-num">{{ row.produced }}</td>
                <td class="vg-num">{{ row.approved }}</td>
                <td class="vg-num">{{ row.redo }}</td>
                <td class="vg-num">{{ row.approved + row.redo + row.discarded ? `${row.approvalRate}%` : '-' }}</td>
                <td class="vg-num">{{ row.published }}</td>
                <td><Sparkline :values="row.daily || []" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Risk radar · top products -->
    <section class="dash-row dash-row--bottom">
      <div class="dash-panel">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><ShieldCheck :size="18" /> {{ t('ai.insights.dash.radar', { count: radar.total }) }}</span>
        </div>
        <div class="dash-radar">
          <span class="dash-radar__chip dash-radar__chip--red"><strong class="vg-num">{{ radar.high }}</strong>{{ t('ai.insights.dash.high') }}</span>
          <span class="dash-radar__chip dash-radar__chip--amber"><strong class="vg-num">{{ radar.mid }}</strong>{{ t('ai.insights.dash.mid') }}</span>
          <span class="dash-radar__chip dash-radar__chip--blue"><strong class="vg-num">{{ radar.tip }}</strong>{{ t('ai.insights.dash.tip') }}</span>
          <button type="button" class="dash-diag__btn dash-radar__all" @click="showAllSignals = !showAllSignals">
            {{ showAllSignals ? t('ai.insights.dash.collapse') : t('ai.insights.dash.viewAll') }} <ArrowRight :size="14" />
          </button>
        </div>
      </div>

      <div class="dash-panel">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><Trophy :size="18" /> {{ t('ai.insights.dash.top') }}</span>
        </div>
        <div v-if="topProducts.length" class="dash-top">
          <button v-for="product in topProducts" :key="product.productId" type="button" class="dash-top__item" @click="go(`/products/${product.productId}`)">
            <span class="dash-top__cover">
              <img v-if="product.cover" :src="product.cover" alt="" loading="lazy" />
              <ShoppingBag v-else :size="22" />
            </span>
            <span class="dash-top__copy">
              <strong :title="product.productName">{{ product.productName }}</strong>
              <span>{{ t('ai.insights.dash.topLine', product) }}</span>
              <span v-if="typeof product.roi === 'number'" class="dash-top__roi">ROI <b class="vg-num">{{ product.roi.toFixed(2) }}</b></span>
              <span v-else>{{ t('ai.insights.published') }} {{ product.published }}</span>
            </span>
          </button>
        </div>
        <div v-else class="dash-empty">{{ t('ai.insights.noData') }}</div>
      </div>
    </section>

    <!-- All signals (risk radar → view all) -->
    <section v-if="showAllSignals && overview" class="dash-signals" data-testid="overview-signals">
      <div v-for="column in signalColumns" :key="column.key" class="dash-panel dash-signals__col" :class="`dash-signals__col--${column.tone}`">
        <div class="dash-panel__head">
          <span class="dash-panel__title"><component :is="column.icon" :size="16" /> {{ t(`ai.insights.overview.${column.key}`) }}</span>
          <span class="vg-count">{{ column.items.length }}</span>
        </div>
        <div class="dash-signals__list">
          <div v-for="signal in column.items" :key="signal.id" class="dash-signal" :class="`dash-signal--${signal.level}`">
            <span class="dash-signal__dot"></span>
            <button type="button" class="dash-signal__main" :disabled="!signal.route" @click="go(signal.route)">
              <strong>{{ cleanSignalText(signal.title) }}</strong>
              <span>{{ cleanSignalText(signal.detail) }}</span>
            </button>
            <button v-if="signal.aiPrompt" type="button" class="vg-btn vg-btn--xs vg-btn--ghost" :title="t('ai.insights.overview.askAiItem')" @click="askAi(signal.aiPrompt)"><Wand2 :size="13" /></button>
          </div>
          <p v-if="!column.items.length" class="dash-muted">{{ column.empty }}</p>
        </div>
      </div>
    </section>

    <!-- Less used details, folded away -->
    <details class="dash-more">
      <summary>
        <ChevronRight :size="16" class="dash-more__chevron" />
        <strong>{{ t('ai.insights.dash.more') }}</strong>
        <span>{{ t('ai.insights.dash.moreHint') }}</span>
      </summary>
      <div class="dash-more__grid">
        <section class="dash-panel">
          <div class="dash-panel__head"><span class="dash-panel__title"><Lightbulb :size="16" /> {{ t('ai.insights.recommendations') }}</span></div>
          <ul class="dash-recs">
            <li v-for="item in data?.recommendations || []" :key="item">{{ item }}</li>
          </ul>
          <button type="button" class="vg-btn vg-btn--soft vg-btn--block" @click="askAi(t('ai.insights.askPlan'))"><Wand2 :size="14" /> {{ t('ai.insights.askPlanButton') }}</button>
        </section>

        <section class="dash-panel">
          <div class="dash-panel__head"><span class="dash-panel__title">{{ t('ai.insights.redoReasons') }}</span></div>
          <div class="vg-list">
            <div v-for="item in data?.topRedoReasons || []" :key="item.reason" class="vg-list__item">
              <span class="vg-list__main"><span class="vg-list__title">{{ item.reason }}</span></span>
              <span class="vg-count">{{ item.count }}</span>
            </div>
            <p v-if="!data?.topRedoReasons.length" class="dash-muted">{{ t('ai.insights.noRedo') }}</p>
          </div>
          <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="go('/settings?section=brand')"><Sparkles :size="14" /> {{ t('ai.insights.editMemory') }}</button>
        </section>

        <section class="dash-panel">
          <div class="dash-panel__head"><span class="dash-panel__title"><Send :size="16" /> {{ t('ai.insights.publish') }}</span></div>
          <dl class="vg-kv">
            <dt>{{ t('ai.insights.publishTotal') }}</dt><dd>{{ data?.publish.total || 0 }}</dd>
            <dt>{{ t('ai.insights.publishDone') }}</dt><dd>{{ data?.publish.published || 0 }}</dd>
            <dt>{{ t('ai.insights.publishDraft') }}</dt><dd>{{ data?.publish.draft || 0 }}</dd>
            <dt>{{ t('ai.insights.publishFailed') }}</dt><dd>{{ data?.publish.failed || 0 }}</dd>
          </dl>
          <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="go('/publish')">{{ t('ai.insights.openPublish') }}</button>
        </section>

        <section class="dash-panel">
          <div class="dash-panel__head">
            <span class="dash-panel__title"><CalendarRange :size="16" /> {{ t('ai.insights.weeklyHistory') }}</span>
            <button type="button" class="vg-btn vg-btn--sm vg-btn--primary dash-link--end" :disabled="generating" @click="generateWeekly"><CalendarRange :size="14" /> {{ t('ai.insights.generateWeekly') }}</button>
          </div>
          <div class="vg-list">
            <div v-for="brief in weeklyBriefs" :key="brief.id" class="vg-list__item dash-brief">
              <span class="vg-list__main">
                <span class="vg-list__title">{{ brief.headline }}</span>
                <span class="vg-list__sub">{{ brief.periodKey.replace('W', '') }}{{ brief.summary ? ` · ${brief.summary}` : '' }}</span>
              </span>
            </div>
            <p v-if="!weeklyBriefs.length" class="dash-muted">{{ t('ai.insights.noWeekly') }}</p>
          </div>
        </section>
      </div>
      <p class="vg-field__hint">{{ t('ai.insights.dataNote') }}</p>
    </details>
  </main>
</template>

<style scoped>
.dash {
  /* Same tones as the home page's KPI strip and the shop totals. */
  --dash-violet: #8b5cf6;
  --dash-teal: #14b8a6;
  --dash-blue: #3b82f6;
  --dash-orange: #f97316;
  --dash-pink: #ec4899;
  --dash-line: color-mix(in srgb, var(--vg-accent) 16%, var(--theme-border));
  width: min(1480px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Header ── */
.dash-head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.dash-head__icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px; background: linear-gradient(145deg, color-mix(in srgb, var(--vg-accent) 62%, var(--theme-panel)), color-mix(in srgb, var(--vg-accent) 18%, var(--theme-panel))); border: 1px solid color-mix(in srgb, var(--vg-accent) 55%, transparent); color: #fff; box-shadow: 0 8px 24px color-mix(in srgb, var(--vg-accent) 25%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 25%, transparent); }
.dash-head__text { flex: 1; min-width: 220px; }
.dash-head__text h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: .01em; color: var(--theme-text); }
.dash-head__text p { margin: 4px 0 0; font-size: 13px; color: var(--theme-text-secondary); }
.dash-head__actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.dash-seg { display: inline-flex; padding: 4px; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-text) 4%, transparent); }
.dash-seg button { height: 32px; padding: 0 16px; border: 0; border-radius: 8px; background: transparent; color: var(--theme-text-secondary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s; }
.dash-seg button:hover { color: var(--theme-text); }
.dash-seg button.is-active { background: var(--vg-accent); color: #04221b; box-shadow: 0 2px 12px color-mix(in srgb, var(--vg-accent) 45%, transparent); }
.dash-seg--sm button { height: 28px; padding: 0 16px; font-size: 13.5px; }
.dash-seg--sm button.is-active { background: var(--vg-accent); color: #04221b; box-shadow: 0 2px 10px color-mix(in srgb, var(--vg-accent) 45%, transparent); }
.dash-seg--end { margin-left: auto; }

.dash-date { position: relative; }
.dash-date__btn { display: inline-flex; align-items: center; gap: 10px; height: 42px; padding: 0 14px; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-text) 4%, transparent); color: var(--theme-text); font: inherit; font-size: 14px; cursor: pointer; }
.dash-date__btn:hover { border-color: var(--vg-accent-line, var(--vg-accent)); }
.dash-date__backdrop { position: fixed; inset: 0; z-index: 20; }
.dash-date__menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 21; display: flex; flex-direction: column; min-width: 150px; padding: 6px; border: 1px solid var(--dash-line); border-radius: 12px; background: var(--theme-panel); box-shadow: 0 16px 40px rgba(0, 0, 0, .35); }
.dash-date__menu button { height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--theme-text); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
.dash-date__menu button:hover { background: color-mix(in srgb, var(--theme-text) 6%, transparent); }
.dash-date__menu button.is-active { color: var(--vg-accent); font-weight: 700; }
.dash-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-text) 4%, transparent); color: var(--theme-text-secondary); cursor: pointer; }
.dash-icon-btn:hover:not(:disabled) { color: var(--vg-accent); border-color: var(--vg-accent); }

/* ── KPI tiles ── */
.dash-kpis { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.2fr) repeat(3, minmax(0, 1fr)); gap: 14px; }
.dash-kpi {
  --tone: var(--dash-teal);
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  min-height: 106px;
  padding: 16px 16px 16px 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tone) 55%, transparent);
  border-radius: 14px;
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--tone) 55%, transparent), transparent 60%),
    linear-gradient(135deg, color-mix(in srgb, var(--tone) 42%, var(--theme-panel)), color-mix(in srgb, var(--tone) 14%, var(--theme-panel)));
  box-shadow: 0 10px 30px color-mix(in srgb, var(--tone) 22%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent);
  color: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform .18s, box-shadow .18s;
}
.dash-kpi:hover { transform: translateY(-2px); box-shadow: 0 14px 36px color-mix(in srgb, var(--tone) 34%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 24%, transparent); }
.dash-kpi--violet { --tone: var(--dash-violet); }
.dash-kpi--teal { --tone: var(--dash-teal); }
.dash-kpi--blue { --tone: var(--dash-blue); }
.dash-kpi--orange { --tone: var(--dash-orange); }
.dash-kpi--pink { --tone: var(--dash-pink); }
.dash-kpi--hero { background: radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--tone) 70%, transparent), transparent 60%), linear-gradient(120deg, color-mix(in srgb, var(--tone) 58%, var(--theme-panel)), color-mix(in srgb, var(--tone) 20%, var(--theme-panel))); }
.dash-kpi__icon { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px; background: color-mix(in srgb, #fff 16%, transparent); border: 1px solid color-mix(in srgb, #fff 22%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 25%, transparent); }
.dash-kpi--hero .dash-kpi__icon { width: 62px; height: 62px; }
.dash-kpi__copy { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; container-type: inline-size; }
.dash-kpi__label { font-size: 13px; color: color-mix(in srgb, #fff 82%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Shrinks with the card so the whole number always shows (digits are about 0.6em wide). */
.dash-kpi__value { --max: 28px; font-size: min(var(--max), calc(100cqi / (var(--chars, 8) * 0.6))); font-weight: 800; letter-spacing: -.01em; line-height: 1.2; white-space: nowrap; }
.dash-kpi--hero .dash-kpi__value { --max: 38px; }
.dash-kpi__value--off { font-size: 17px !important; color: color-mix(in srgb, #fff 75%, transparent); }
.dash-kpi__foot { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; white-space: nowrap; color: color-mix(in srgb, #fff 80%, transparent); }
.dash-kpi__delta { flex-shrink: 0; font-weight: 700; color: color-mix(in srgb, #fff 85%, transparent); }
.dash-kpi__delta--green { color: #6ee7b7; }
.dash-kpi__delta--red { color: #fca5a5; }
.dash-kpi__prev { overflow: hidden; text-overflow: ellipsis; color: color-mix(in srgb, #fff 72%, transparent); }
.dash-kpi__wave { position: absolute; right: 0; bottom: 0; width: 46%; height: 78%; opacity: .5; pointer-events: none; }
.dash-kpi__wave path { fill: color-mix(in srgb, #5eead4 55%, transparent); }
.dash-note { margin: -4px 0 0; }

/* ── Panels ── */
.dash-row { display: grid; gap: 14px; }
.dash-row--three { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.05fr); }
.dash-row--two { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); }
.dash-row--bottom { grid-template-columns: minmax(0, .78fr) minmax(0, 1.7fr); }
.dash-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--dash-line);
  border-radius: 16px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--vg-accent) 5%, var(--theme-panel)), var(--theme-panel));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--vg-accent) 14%, transparent);
}
.dash-panel__head { display: flex; align-items: center; gap: 12px; min-width: 0; flex-wrap: wrap; }
.dash-panel__title { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; letter-spacing: .01em; white-space: nowrap; color: var(--theme-text); }
.dash-panel__title > svg { color: var(--vg-accent); }
.dash-link { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; color: var(--vg-accent); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.dash-link:hover { text-decoration: underline; }
.dash-link--end { margin-left: auto; }
.dash-empty { display: flex; flex: 1; align-items: center; justify-content: center; gap: 8px; min-height: 110px; color: var(--theme-text-muted); font-size: 13px; text-align: center; }
.dash-muted { margin: 0; padding: 10px 4px; font-size: 12.5px; color: var(--theme-text-muted); }

/* ── Trend ── */
.dash-trend { min-height: 260px; }
.dash-trend__chart { position: relative; flex: 1; min-height: 190px; }
.dash-trend__chart .dash-empty { position: absolute; inset: 0; }
.dash-trend__legend { display: flex; justify-content: center; gap: 22px; font-size: 12.5px; color: var(--theme-text-secondary); }
.dash-trend__synced { color: var(--vg-amber); }
.dash-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--vg-accent); }
.dash-dot--prev { background: var(--vg-violet); }

/* ── Diagnosis ── */
.dash-ai-badge { display: inline-flex; align-items: center; justify-content: center; height: 20px; padding: 0 6px; border-radius: 6px; background: var(--vg-accent); color: #04221b; font-size: 11px; font-weight: 900; }
.dash-diag { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.dash-diag__item { --tone: var(--vg-accent); display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--theme-text) 7%, transparent); }
.dash-diag__item:first-child { border-top: 0; padding-top: 2px; }
.dash-diag__item--red { --tone: #ef4444; }
.dash-diag__item--green { --tone: var(--vg-accent); }
.dash-diag__item--amber { --tone: #f59e0b; }
.dash-diag__item--blue { --tone: #3b82f6; }
.dash-diag__icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex-shrink: 0; border-radius: 10px; background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--tone); }
.dash-diag__copy { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.dash-diag__copy strong { font-size: 14.5px; font-weight: 800; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dash-diag__copy span { font-size: 12.5px; color: var(--theme-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-diag__btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 92px; flex-shrink: 0; height: 32px; padding: 0 14px; border: 1px solid color-mix(in srgb, var(--vg-accent) 45%, transparent); border-radius: 9px; background: color-mix(in srgb, var(--vg-accent) 14%, transparent); color: var(--theme-text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s; }
.dash-diag__btn:hover { background: color-mix(in srgb, var(--vg-accent) 26%, transparent); }

/* ── Lines table ── */
.dash-table-wrap { overflow-x: auto; }
.dash-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.dash-table th { padding: 6px 8px; text-align: center; font-size: 12.5px; font-weight: 600; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-text) 4%, transparent); white-space: nowrap; }
.dash-table th:first-child { text-align: left; border-radius: 8px 0 0 8px; }
.dash-table th:last-child { border-radius: 0 8px 8px 0; }
.dash-table td { padding: 6px 8px; text-align: center; color: var(--theme-text); border-bottom: 1px solid color-mix(in srgb, var(--theme-text) 5%, transparent); }
.dash-table td:first-child { text-align: left; min-width: 150px; }
.dash-table td:last-child { width: 96px; }
.dash-table td:last-child svg { margin: 0 auto; }
.dash-table tr:last-child td { border-bottom: 0; }
.dash-table__line { display: block; font-weight: 700; white-space: nowrap; }
.dash-table__bar { display: block; width: 140px; height: 4px; margin-top: 4px; border-radius: 4px; background: color-mix(in srgb, var(--theme-text) 8%, transparent); overflow: hidden; }
.dash-table__bar span { display: block; height: 100%; border-radius: 4px; background: var(--vg-accent); box-shadow: 0 0 6px var(--vg-accent); }

/* ── Risk radar ── */
.dash-radar { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-content: center; flex: 1; }
.dash-radar__chip { --tone: #ef4444; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 72px; cursor: default; border: 1px solid color-mix(in srgb, var(--tone) 55%, transparent); border-radius: 10px; background: linear-gradient(160deg, color-mix(in srgb, var(--tone) 42%, var(--theme-panel)), color-mix(in srgb, var(--tone) 16%, var(--theme-panel))); color: #fff; font-size: 12.5px; }
.dash-radar__chip strong { font-size: 22px; font-weight: 800; line-height: 1.1; }
.dash-radar__chip--amber { --tone: #f59e0b; }
.dash-radar__chip--blue { --tone: #3b82f6; }
.dash-radar__all { grid-column: 1 / -1; justify-self: end; }

/* ── Top products ── */
.dash-top { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; flex: 1; align-items: center; }
.dash-top__item { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.dash-top__item:hover strong { color: var(--vg-accent); }
.dash-top__cover { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border: 1px solid color-mix(in srgb, var(--theme-text) 8%, transparent); flex-shrink: 0; overflow: hidden; border-radius: 10px; background: color-mix(in srgb, var(--theme-text) 6%, transparent); color: var(--theme-text-muted); }
.dash-top__cover img { width: 100%; height: 100%; object-fit: cover; }
.dash-top__copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12px; color: var(--theme-text-secondary); }
.dash-top__copy strong { font-size: 14px; font-weight: 800; color: var(--theme-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dash-top__copy span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dash-top__roi b { color: var(--vg-accent); font-weight: 800; }

/* ── All signals ── */
.dash-signals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.dash-signals__col { border-top: 3px solid var(--theme-border); }
.dash-signals__col--red { border-top-color: #ef4444; }
.dash-signals__col--green { border-top-color: var(--vg-accent); }
.dash-signals__col--blue { border-top-color: #3b82f6; }
.dash-signals__col .vg-count { margin-left: auto; }
.dash-signals__list { display: flex; flex-direction: column; max-height: 360px; overflow-y: auto; }
.dash-signal { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-top: 1px solid color-mix(in srgb, var(--theme-text) 6%, transparent); }
.dash-signal:first-child { border-top: 0; }
.dash-signal__dot { width: 8px; height: 8px; margin-top: 6px; flex-shrink: 0; border-radius: 50%; background: var(--theme-text-muted); }
.dash-signal--error .dash-signal__dot { background: #ef4444; }
.dash-signal--warning .dash-signal__dot { background: #f59e0b; }
.dash-signal--success .dash-signal__dot { background: var(--vg-accent); }
.dash-signal--info .dash-signal__dot { background: #3b82f6; }
.dash-signal__main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.dash-signal__main:disabled { cursor: default; }
.dash-signal__main strong { font-size: 13.5px; color: var(--theme-text); }
.dash-signal__main span { font-size: 12.5px; line-height: 1.5; color: var(--theme-text-secondary); }
.dash-signal__main:not(:disabled):hover strong { color: var(--vg-accent); }

/* ── More details ── */
.dash-more { border: 1px solid var(--dash-line); border-radius: 16px; background: color-mix(in srgb, var(--theme-panel) 70%, transparent); }
.dash-more > summary { display: flex; align-items: center; gap: 10px; padding: 14px 18px; cursor: pointer; list-style: none; color: var(--theme-text); }
.dash-more > summary::-webkit-details-marker { display: none; }
.dash-more > summary span { font-size: 12.5px; color: var(--theme-text-muted); }
.dash-more__chevron { color: var(--vg-accent); transition: transform .15s; }
.dash-more[open] .dash-more__chevron { transform: rotate(90deg); }
.dash-more__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding: 0 18px 12px; }
.dash-more > .vg-field__hint { padding: 0 18px 16px; margin: 0; }
.dash-recs { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.6; color: var(--theme-text); }
.dash-brief .vg-list__sub { white-space: normal; }

@media (max-width: 1280px) {
  .dash-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .dash-kpi--hero { grid-column: 1 / -1; }
  .dash-row--three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-row--three > .dash-trend { grid-column: 1 / -1; }
  .dash-top { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1000px) {
  .dash-row--two, .dash-row--bottom, .dash-signals, .dash-more__grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .dash-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-kpi--hero { grid-column: 1 / -1; }
  .dash-row--three { grid-template-columns: minmax(0, 1fr); }
  .dash-top { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-head__actions { width: 100%; }
  .dash-date__btn span { font-size: 12.5px; }
  :deep(.donut) { flex-direction: column; }
}
</style>
