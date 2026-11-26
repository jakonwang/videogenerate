<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronLeft, ExternalLink, ImageIcon, LoaderCircle, RefreshCcw } from 'lucide-vue-next'
import { dateRange, shiftDate, type ShopMetricKey, type ShopReport, type SiShopDay, type SiSyncStage } from '../../../../shared/sellerInventory'
import { freshnessText, friendlyStageError, friendlySyncError } from '../../../../shared/sellerSyncText'
import { useSyncWatcher } from './shops/useSyncWatcher'
import ShopTrendChart from './shops/ShopTrendChart.vue'
import ShopFindings from './shops/ShopFindings.vue'
import ShopHealthCard from './shops/ShopHealthCard.vue'
import ShopProfitCard from './shops/ShopProfitCard.vue'
import { change, fmtChange, fmtMetric, fmtMoney, fmtNumber, fmtPercent } from './shops/shopFormat'

/** One shop's business day by day: KPIs, trend, funnel, where GMV comes from, products. */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const api = window.api.sellerInventory
const shopKey = computed(() => String(route.params.shopKey || ''))
const days = ref(30)
const metric = ref<ShopMetricKey>('gmv')
const report = ref<ShopReport | null>(null)
const loading = ref(false)
const errorText = ref('')
const doneText = ref('')
const now = ref(Date.now())
const clock = setInterval(() => { now.value = Date.now() }, 30_000)

const KPIS: ShopMetricKey[] = ['gmv', 'orders', 'itemsSold', 'buyers', 'visitors', 'conversion', 'aov', 'impressions']
const TODAY: ShopMetricKey[] = ['gmv', 'orders', 'visitors', 'conversion']
const todayItems = TODAY.map((key) => ({ key }))

const region = computed(() => report.value?.shop.region)
const { progress, started, markLoaded } = useSyncWatcher({
  refresh: () => load(),
  onFinished: (jobs) => {
    const job = jobs.find((item) => item.shopKey === shopKey.value)
    if (job && !job.automatic && job.status === 'done' && !job.stageErrors) {
      doneText.value = t('shops.syncDone')
      setTimeout(() => { doneText.value = '' }, 4000)
    }
  },
})
const running = computed(() => progress.value.find((item) => item.status === 'running' && item.shopKey === shopKey.value))
const syncing = computed(() => Boolean(running.value))
const freshness = computed(() => freshnessText(report.value?.shop.state.lastSyncAt, now.value, locale.value))
const stageProblems = computed(() => Object.entries(report.value?.shop.state.stageErrors || {}).map(([stage, error]) => friendlyStageError(stage as SiSyncStage, error, locale.value)))
const byDate = computed(() => new Map((report.value?.days || []).map((day) => [day.date, day])))
const prevByDate = computed(() => new Map((report.value?.previous || []).map((day) => [day.date, day])))
const allDates = computed(() => (report.value ? dateRange(report.value.start, report.value.end) : []))
const todayRow = computed(() => byDate.value.get(report.value?.today || ''))
const yesterdayRow = computed(() => byDate.value.get(shiftDate(report.value?.today || '2000-01-01', -1)))

function fmt(key: ShopMetricKey, value: number | undefined, compact = false) {
  return fmtMetric(key, value, locale.value, region.value, compact)
}

/** Up, down, or flat when the change rounds to 0.0% (shown neutral, not as a red drop). */
function direction(current: number, previous: number) {
  const value = change(current, previous)
  if (value === undefined || Math.abs(value) < 0.0005) return 'flat'
  return value > 0 ? 'up' : 'down'
}

function value(day: SiShopDay | undefined, key: ShopMetricKey) {
  return day ? Number(day[key]) || 0 : 0
}

const trendPoints = computed(() => allDates.value.map((date) => ({ date, value: value(byDate.value.get(date), metric.value) })))
const trendPrevious = computed(() => allDates.value.map((date) => value(prevByDate.value.get(shiftDate(date, -days.value)), metric.value)))

const funnel = computed(() => {
  const totals = report.value?.totals
  if (!totals) return []
  return [
    { key: 'uniqueImpressions', label: t('shops.metric.uniqueImpressions'), value: totals.uniqueImpressions, rate: undefined as number | undefined },
    { key: 'visitors', label: t('shops.metric.visitors'), value: totals.visitors, rate: totals.uniqueImpressions ? totals.visitors / totals.uniqueImpressions : undefined },
    { key: 'buyers', label: t('shops.metric.buyers'), value: totals.buyers, rate: totals.visitors ? totals.buyers / totals.visitors : undefined },
  ]
})
const funnelMax = computed(() => Math.max(1, ...funnel.value.map((step) => step.value)))

const channels = computed(() => {
  const totals = report.value?.totals
  const previous = report.value?.previousTotals
  if (!totals || !previous) return []
  const rows = [
    { key: 'live', label: t('shops.channel.live'), value: totals.liveGmv, prev: previous.liveGmv, split: [{ label: t('shops.channel.affiliate'), value: totals.affiliateLiveGmv }, { label: t('shops.channel.seller'), value: totals.sellerLiveGmv }] },
    { key: 'video', label: t('shops.channel.video'), value: totals.videoGmv, prev: previous.videoGmv, split: [{ label: t('shops.channel.affiliate'), value: totals.affiliateVideoGmv }, { label: t('shops.channel.seller'), value: totals.sellerVideoGmv }] },
    { key: 'card', label: t('shops.channel.card'), value: totals.cardGmv, prev: previous.cardGmv, split: [] as Array<{ label: string; value: number }> },
  ]
  return rows.map((row) => ({ ...row, share: totals.gmv ? row.value / totals.gmv : 0 }))
})

/** Calendar: one column per week (Mon–Sun), darker = more GMV. */
const calendar = computed(() => {
  const dates = allDates.value
  if (!dates.length) return { weeks: [] as Array<Array<{ date: string; gmv: number; inRange: boolean } | null>>, max: 1, min: 0 }
  const first = new Date(`${dates[0]}T00:00:00Z`).getUTCDay()
  const offset = (first + 6) % 7
  const cells: Array<{ date: string; gmv: number; inRange: boolean } | null> = Array.from({ length: offset }, () => null)
  for (const date of dates) cells.push({ date, gmv: value(byDate.value.get(date), 'gmv'), inRange: true })
  const weeks = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))
  const values = cells.filter((cell) => cell && cell.gmv > 0).map((cell) => cell!.gmv)
  const max = Math.max(1, ...values)
  const min = values.length ? Math.min(...values) : 0
  return { weeks, max, min }
})

/** Lowest day pale, best day strongest; a day with no sales stays empty. */
function shade(gmv: number) {
  if (!gmv) return 0
  const span = calendar.value.max - calendar.value.min
  return Math.round(10 + (span > 0 ? (gmv - calendar.value.min) / span : 1) * 50)
}

/** Mon … Sun in the user's language. 2024-01-01 was a Monday. */
const weekdayNames = computed(() => {
  const format = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(Date.UTC(2024, 0, 1 + index))))
})

const tableRows = computed(() => [...allDates.value].reverse().map((date) => ({ date, day: byDate.value.get(date) })))

async function load() {
  if (!shopKey.value) return
  loading.value = true
  try {
    report.value = await api.getShopReport({ shopKey: shopKey.value, days: days.value })
    errorText.value = ''
    void markLoaded()
  } catch (error) {
    errorText.value = friendlySyncError(error, locale.value)
  } finally {
    loading.value = false
  }
}

async function sync() {
  doneText.value = ''
  const result = await api.sync({ shopKey: shopKey.value })
  if (!result.started) doneText.value = friendlySyncError('SELLER_INVENTORY_SYNC_RUNNING', locale.value)
  await started()
}

watch([days, shopKey], () => { void load() })
onMounted(() => { void load() })
onBeforeUnmount(() => clearInterval(clock))
</script>

<template>
  <main class="vg-scope vg-page vg-dash shop-detail" data-testid="shop-detail">
    <header class="vg-page-head">
      <button type="button" class="vg-icon-btn" :title="t('shops.backToShops')" @click="router.push('/shops')"><ChevronLeft :size="18" /></button>
      <div class="vg-page-head__text">
        <h1>{{ report?.shop.name || '…' }}</h1>
        <p>{{ t('shops.detailSubtitle', { region: report?.shop.region || '' }) }} · <span :class="{ 'shop-detail__stale': freshness.stale }" data-testid="shop-detail-fresh">{{ freshness.text }}</span></p>
      </div>
      <div class="vg-page-head__actions">
        <div class="vg-seg vg-seg--sm">
          <button v-for="n in [7, 30, 90]" :key="n" type="button" class="vg-seg__btn" :class="{ 'is-active': days === n }" @click="days = n">{{ t('sellerInv.days', { n }) }}</button>
        </div>
        <button type="button" class="vg-btn vg-btn--sm" @click="api.openSellerCenter(shopKey)"><ExternalLink :size="13" />{{ t('shops.openSeller') }}</button>
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="syncing" data-testid="shop-sync" @click="sync"><RefreshCcw :size="13" :class="{ 'vg-spin': syncing }" />{{ t('sellerInv.sync') }}</button>
      </div>
    </header>

    <div v-if="running" class="vg-notice vg-notice--accent"><LoaderCircle :size="15" class="vg-spin" /><span>{{ t(`sellerInv.stage.${running.stage || 'account'}`, { detail: running.detail || '' }) }}</span></div>
    <div v-if="doneText" class="vg-notice vg-notice--accent"><CheckCircle2 :size="15" /><span>{{ doneText }}</span></div>
    <div v-if="errorText" class="vg-notice vg-notice--danger"><AlertTriangle :size="15" /><span>{{ errorText }}</span></div>
    <div v-if="!syncing && (report?.shop.state.lastSyncError || stageProblems.length)" class="vg-notice vg-notice--warning shop-detail__status" data-testid="shop-detail-sync-error">
      <AlertTriangle :size="15" />
      <ul>
        <li v-if="report?.shop.state.lastSyncError">{{ friendlySyncError(report.shop.state.lastSyncError, locale) }}</li>
        <li v-for="(problem, index) in stageProblems" :key="index">{{ problem }}</li>
      </ul>
      <button v-if="String(report?.shop.state.lastSyncError || '').includes('LOGIN')" type="button" class="vg-btn vg-btn--sm" @click="router.push({ path: '/shops', query: { tab: 'accounts' } })">{{ t('shops.updateCookie') }}</button>
      <button v-else type="button" class="vg-btn vg-btn--sm" @click="sync">{{ t('sellerInv.syncAgain') }}</button>
    </div>

    <template v-if="report">
      <section class="vg-card shop-detail__today" data-testid="shop-today">
        <div class="shop-detail__today-title"><span class="shop-detail__live"></span>{{ t('shops.todaySoFar') }}</div>
        <div class="shop-detail__today-grid">
          <div v-for="item in todayItems" :key="item.key" class="shop-detail__today-item">
            <span>{{ t(`shops.metric.${item.key}`) }}</span>
            <strong>{{ fmt(item.key, todayRow?.[item.key]) }}</strong>
            <small>{{ t('shops.vsYesterday', { value: fmt(item.key, yesterdayRow?.[item.key], true) }) }}</small>
          </div>
        </div>
      </section>

      <div class="shop-detail__two">
        <section class="vg-card shop-detail__analysis" data-testid="shop-analysis">
          <header class="shop-detail__card-title">
            <h2 class="vg-section-title">{{ t('shops.analysisTitle') }}</h2>
            <p class="shop-detail__hint">{{ t('shops.analysisHint') }}</p>
          </header>
          <ShopFindings :findings="report.analysis.findings" grouped :per-group="5" />
        </section>
        <ShopHealthCard :health="report.health" @open="(path) => api.openSellerCenter(shopKey, path)" />
      </div>

      <section class="vg-card shop-detail__perf">
        <header class="shop-detail__card-head">
          <div class="shop-detail__card-title">
            <h2 class="vg-section-title">{{ t('shops.kpiTitle') }}</h2>
            <p class="shop-detail__hint">{{ t('shops.periodLabel', { n: days }) }}</p>
          </div>
          <p class="shop-detail__legend"><span class="legend-line"></span>{{ t('shops.legendCurrent') }} <span class="legend-line legend-line--prev"></span>{{ t('shops.legendPrevious') }}</p>
        </header>
        <div class="shop-detail__kpis" data-testid="shop-kpis">
          <button v-for="key in KPIS" :key="key" type="button" class="shop-kpi" :class="{ 'is-active': metric === key }" @click="metric = key">
            <span class="shop-kpi__label">{{ t(`shops.metric.${key}`) }}</span>
            <strong class="shop-kpi__value">{{ fmt(key, report.totals[key], true) }}</strong>
            <small v-if="change(report.totals[key], report.previousTotals[key]) !== undefined" class="shop-kpi__chg" :class="direction(report.totals[key], report.previousTotals[key])">
              <ArrowUpRight v-if="direction(report.totals[key], report.previousTotals[key]) === 'up'" :size="11" /><ArrowDownRight v-else-if="direction(report.totals[key], report.previousTotals[key]) === 'down'" :size="11" />
              {{ direction(report.totals[key], report.previousTotals[key]) === 'flat' ? t('shops.unchanged') : fmtChange(change(report.totals[key], report.previousTotals[key])) }}
            </small>
            <small v-else class="shop-kpi__chg flat">—</small>
          </button>
        </div>
        <ShopTrendChart :points="trendPoints" :previous="trendPrevious" :format="(v: number) => fmt(metric, v)" />
      </section>

      <ShopProfitCard :shop-key="shopKey" :days="days" :region="region" />

      <div class="shop-detail__two">
        <section class="vg-card" data-testid="shop-funnel">
          <h2 class="vg-section-title">{{ t('shops.funnel') }}</h2>
          <div v-for="step in funnel" :key="step.key" class="funnel-step">
            <div class="funnel-step__label"><span>{{ step.label }}</span><strong>{{ fmtNumber(step.value, locale) }}</strong></div>
            <div class="funnel-step__bar"><span :style="{ width: `${Math.max(2, (step.value / funnelMax) * 100)}%` }"></span></div>
            <small v-if="step.rate !== undefined" class="vg-muted">{{ t(step.key === 'buyers' ? 'shops.rateConversion' : 'shops.rateVisit', { value: fmtPercent(step.rate, locale, 2) }) }}</small>
          </div>
        </section>
        <section class="vg-card" data-testid="shop-channels">
          <h2 class="vg-section-title">{{ t('shops.channels') }}</h2>
          <div v-for="row in channels" :key="row.key" class="channel">
            <div class="channel__head">
              <span>{{ row.label }}</span>
              <strong>{{ fmtMoney(row.value, locale, region, true) }}</strong>
              <span class="vg-muted">{{ fmtPercent(row.share, locale, 1) }}</span>
              <span v-if="change(row.value, row.prev) !== undefined" class="shop-kpi__chg" :class="(change(row.value, row.prev) || 0) >= 0 ? 'up' : 'down'">{{ fmtChange(change(row.value, row.prev)) }}</span>
            </div>
            <div class="channel__bar"><span :style="{ width: `${row.share * 100}%` }"></span></div>
            <small v-if="row.split.length" class="vg-muted">{{ row.split.map((part) => `${part.label} ${fmtMoney(part.value, locale, region, true)}`).join(' · ') }}</small>
          </div>
        </section>
      </div>

      <section class="vg-card shop-detail__calendar" data-testid="shop-calendar">
        <header class="shop-detail__card-head">
          <h2 class="vg-section-title">{{ t('shops.calendar') }}</h2>
          <span class="calendar-scale">{{ t('shops.calendarLess') }}<i v-for="step in [10, 22, 35, 48, 60]" :key="step" :style="{ background: `color-mix(in srgb, var(--vg-accent) ${step}%, transparent)` }"></i>{{ t('shops.calendarMore') }}</span>
        </header>
        <div class="calendar">
          <span v-for="name in weekdayNames" :key="name" class="calendar__weekday">{{ name }}</span>
          <template v-for="(week, wi) in calendar.weeks" :key="wi">
            <span
              v-for="(cell, ci) in week"
              :key="`${wi}-${ci}`"
              class="calendar__cell"
              :class="{ empty: !cell, 'is-today': cell?.date === report.today }"
              :style="cell ? { background: `color-mix(in srgb, var(--vg-accent) ${shade(cell.gmv)}%, transparent)` } : {}"
              :title="cell ? `${cell.date}  ${fmt('gmv', cell.gmv)}` : ''"
            >
              <template v-if="cell">
                <small>{{ Number(cell.date.slice(8)) === 1 ? cell.date.slice(5).replace('-', '/') : Number(cell.date.slice(8)) }}</small>
                <b v-if="cell.gmv">{{ fmt('gmv', cell.gmv, true) }}</b>
              </template>
            </span>
          </template>
        </div>
      </section>

      <section class="vg-card vg-card--flush" data-testid="shop-skus">
        <div class="vg-card__head shop-detail__card-head">
          <h2 class="vg-card__title">{{ t('shops.topSkus') }}</h2>
          <span class="shop-detail__small">{{ t('shops.stockSummary', { out: report.outOfStock, reorder: report.reorder }) }}</span>
          <button type="button" class="vg-btn vg-btn--sm" @click="router.push('/plugins/seller-inventory')">{{ t('shops.openSales') }}</button>
        </div>
        <div class="vg-table-wrap shop-detail__table">
          <table class="vg-table vg-table--compact">
            <thead><tr><th>SKU</th><th class="num">{{ t('sellerInv.table.today') }}</th><th class="num">{{ t('sellerInv.table.units7') }}</th><th class="num">{{ t('sellerInv.table.growth') }}</th><th class="num">{{ t('sellerInv.table.amount7') }}</th><th class="num">{{ t('sellerInv.table.stock') }}</th><th>{{ t('sellerInv.table.status') }}</th></tr></thead>
            <tbody>
              <tr v-if="!report.topSkus.length"><td colspan="7" class="vg-table__empty">{{ t('sellerInv.table.empty') }}</td></tr>
              <tr v-for="item in report.topSkus" :key="item.key">
                <td>
                  <div class="sku-cell">
                    <span class="vg-thumb vg-thumb--sm sku-cell__thumb"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><ImageIcon v-else :size="13" /></span>
                    <span class="sku-cell__text"><strong>{{ item.mapped ? item.key : t('sellerInv.table.unmappedBadge') }}</strong><small class="vg-muted vg-ellipsis">{{ item.name }}</small></span>
                    <span v-if="item.tag !== 'none'" class="sku-tag" :class="`sku-tag--${item.tag}`">{{ t(`sellerInv.tag.${item.tag}`) }}</span>
                  </div>
                </td>
                <td class="num">{{ fmtNumber(item.unitsToday, locale) }}</td>
                <td class="num"><strong>{{ fmtNumber(item.units7, locale) }}</strong></td>
                <td class="num" :class="item.growth7 === undefined ? 'sku-new' : item.growth7 > 0 ? 'sku-up' : item.growth7 < 0 ? 'sku-down' : ''">{{ item.growth7 === undefined ? 'NEW' : fmtChange(item.growth7) }}</td>
                <td class="num">{{ fmtMoney(item.amount7, locale, region) }}</td>
                <td class="num">{{ fmtNumber(item.stock, locale) }}</td>
                <td><span v-if="item.risk !== 'unknown'" class="sku-risk" :class="`sku-risk--${item.risk}`"><i></i>{{ t(`sellerInv.risk.${item.risk}`) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="vg-card vg-card--flush" data-testid="shop-daily-table">
        <div class="vg-card__head"><h2 class="vg-card__title">{{ t('shops.dailyTable') }}</h2></div>
        <div class="vg-table-wrap shop-detail__table">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('sellerInv.stock.date') }}</th>
                <th v-for="key in (['gmv', 'orders', 'itemsSold', 'buyers', 'visitors', 'conversion', 'aov', 'liveGmv', 'videoGmv', 'cardGmv'] as ShopMetricKey[])" :key="key" class="num">{{ t(`shops.metric.${key}`) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.date" :class="{ 'is-muted': !row.day }">
                <td>{{ row.date }}<small v-if="row.date === report.today" class="vg-muted"> · {{ t('shops.todayTag') }}</small></td>
                <td v-for="key in (['gmv', 'orders', 'itemsSold', 'buyers', 'visitors', 'conversion', 'aov', 'liveGmv', 'videoGmv', 'cardGmv'] as ShopMetricKey[])" :key="key" class="num">{{ row.day ? fmt(key, row.day[key]) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
    <section v-else-if="loading" class="vg-empty"><LoaderCircle :size="22" class="vg-spin" /></section>
  </main>
</template>

<style scoped>
.shop-detail { display: flex; flex-direction: column; gap: 16px; }
.shop-detail .num, .vg-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.shop-detail__status { align-items: flex-start; }
.shop-detail__status ul { flex: 1; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
.shop-detail__stale { color: var(--vg-amber); font-weight: 600; }

.shop-detail__today { display: flex; flex-direction: column; gap: 12px; }
.shop-detail__today-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--theme-text-muted); }
.shop-detail__live { width: 7px; height: 7px; border-radius: 50%; background: var(--vg-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-accent) 22%, transparent); }
.shop-detail__today-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.shop-detail__today-item { display: flex; flex-direction: column; gap: 3px; padding: 0 20px; border-left: 1px solid var(--theme-divider); min-width: 0; }
.shop-detail__today-item:first-child { padding-left: 0; border-left: 0; }
.shop-detail__today-item span { font-size: 12px; color: var(--theme-text-muted); }
.shop-detail__today-item strong { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; }
.shop-detail__today-item:first-child strong { font-size: 28px; }
.shop-detail__today-item small { font-size: 11.5px; color: var(--theme-text-muted); }

.shop-detail__card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.shop-detail__card-title { display: flex; flex-direction: column; gap: 3px; }
.shop-detail__hint { margin: 0; font-size: 12px; color: var(--theme-text-muted); line-height: 1.5; }

.shop-detail__perf { display: flex; flex-direction: column; gap: 14px; }
.shop-detail__kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.shop-kpi { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 0; border-left: 1px solid var(--theme-divider); border-top: 1px solid var(--theme-divider); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; min-width: 0; transition: background .15s; }
.shop-kpi:nth-child(4n + 1) { border-left: 0; }
.shop-kpi:nth-child(-n + 4) { border-top: 0; }
.shop-kpi:hover { background: var(--theme-panel-soft); }
.shop-kpi.is-active { background: color-mix(in srgb, var(--vg-accent) 9%, transparent); }
.shop-kpi.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--vg-accent); }
.shop-kpi__label { font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; }
.shop-kpi.is-active .shop-kpi__label { color: var(--vg-accent); }
.shop-kpi__value { font-size: 20px; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; white-space: nowrap; }
.shop-kpi__chg { display: inline-flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.shop-kpi__chg.up { color: var(--vg-green, #16a34a); }
.shop-kpi__chg.down { color: var(--vg-red); }
.shop-kpi__chg.flat { color: var(--theme-text-muted); font-weight: 500; }
.shop-detail__legend { display: flex; align-items: center; gap: 6px; font-size: 11.5px; margin: 0; color: var(--theme-text-muted); }
.legend-line { display: inline-block; width: 16px; height: 0; border-top: 2px solid var(--vg-accent); }
.legend-line--prev { border-top: 2px dashed var(--theme-text-muted); margin-left: 10px; }

.shop-detail__two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.shop-detail__two > section { display: flex; flex-direction: column; gap: 14px; }
.shop-detail__analysis { gap: 14px; }

.funnel-step, .channel { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-top: 1px solid var(--theme-divider); }
.funnel-step:first-of-type, .channel:first-of-type { border-top: 0; padding-top: 0; }
.funnel-step__label, .channel__head { display: flex; align-items: baseline; gap: 10px; font-size: 13px; }
.funnel-step__label span, .channel__head > span:first-child { flex: 1; color: var(--theme-text-secondary); }
.funnel-step__label strong, .channel__head strong { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.channel__head .vg-muted { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 44px; text-align: right; }
.funnel-step__bar, .channel__bar { height: 6px; border-radius: 3px; background: var(--theme-panel-soft); overflow: hidden; }
.funnel-step__bar span, .channel__bar span { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, color-mix(in srgb, var(--vg-accent) 65%, transparent), var(--vg-accent)); }
.funnel-step small, .channel small { font-size: 11.5px; color: var(--theme-text-muted); }

.shop-detail__calendar { display: flex; flex-direction: column; gap: 12px; }
.calendar-scale { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--theme-text-muted); }
.calendar-scale i { width: 12px; height: 12px; border-radius: 3px; }
.calendar-scale i:first-of-type { margin-left: 4px; }
.calendar-scale i:last-of-type { margin-right: 4px; }
.calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.calendar__weekday { padding: 0 6px 2px; font-size: 11px; color: var(--theme-text-muted); }
.calendar__cell { position: relative; display: flex; flex-direction: column; justify-content: space-between; height: 46px; padding: 5px 7px; border-radius: 6px; border: 1px solid var(--theme-divider); min-width: 0; }
.calendar__cell.empty { border-color: transparent; background: transparent; }
.calendar__cell.is-today { border-color: var(--vg-accent); }
.calendar__cell small { font-size: 10.5px; color: var(--theme-text); opacity: .7; }
.calendar__cell b { align-self: flex-end; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--theme-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.calendar__cell:not(.empty):hover { outline: 1px solid var(--vg-accent); }
.shop-detail__table { border: 0; border-radius: 0; max-height: 420px; }
.shop-detail__small { font-size: 12px; flex: 1; }
.sku-cell { display: flex; align-items: center; gap: 8px; min-width: 220px; max-width: 360px; }
.sku-cell__thumb { overflow: hidden; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sku-cell__thumb img { width: 100%; height: 100%; object-fit: cover; }
.sku-cell__text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.is-muted td { color: var(--theme-text-muted); }
.shop-detail__small { color: var(--theme-text-muted); }
.sku-tag { flex-shrink: 0; padding: 1px 6px; border-radius: 4px; border: 1px solid currentColor; font-size: 10.5px; font-weight: 600; line-height: 15px; opacity: .9; }
.sku-tag--hot { color: var(--vg-red); }
.sku-tag--rising { color: var(--vg-green, #16a34a); }
.sku-tag--declining { color: var(--vg-amber); }
.sku-tag--slow { color: var(--theme-text-muted); }
.sku-up { color: var(--vg-green, #16a34a); }
.sku-down { color: var(--vg-red); }
.sku-new { color: var(--vg-accent); font-size: 11px; font-weight: 700; }
.sku-risk { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; color: var(--theme-text-secondary); }
.sku-risk i { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-text-muted); }
.sku-risk--out i, .sku-risk--urgent i { background: var(--vg-red); }
.sku-risk--out, .sku-risk--urgent { color: var(--theme-text); font-weight: 600; }
.sku-risk--reorder i { background: var(--vg-amber); }
.sku-risk--healthy i { background: var(--vg-green, #16a34a); }
.sku-risk--overstock i { background: #8b5cf6; }
@media (max-width: 960px) {
  .shop-detail__two { grid-template-columns: 1fr; }
  .shop-detail__today-grid { grid-template-columns: repeat(2, 1fr); row-gap: 14px; }
  .shop-detail__today-item:nth-child(3) { padding-left: 0; border-left: 0; }
  .shop-detail__kpis { grid-template-columns: repeat(2, 1fr); }
  .shop-kpi:nth-child(4n + 1) { border-left: 1px solid var(--theme-divider); }
  .shop-kpi:nth-child(2n + 1) { border-left: 0; }
  .shop-kpi:nth-child(3), .shop-kpi:nth-child(4) { border-top: 1px solid var(--theme-divider); }
}
</style>
