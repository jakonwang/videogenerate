<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Ban,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  ExternalLink,
  Hourglass,
  Images,
  Rocket,
  Search,
  ShieldCheck,
  TrendingDown,
  XOctagon,
} from 'lucide-vue-next'
import GmvV2Lesson from './GmvV2Lesson.vue'
import GmvV2LineChart from './GmvV2LineChart.vue'
import GmvV2Sparkline from './GmvV2Sparkline.vue'
import './gmv-v2-viz.css'
import { CODE_ORDER, CODE_STATUS, emptyWorkspace, openTikTokAdsManager, useGmvV2Text, type DiagnosisCode, type V2Diagnosis, type V2Workspace } from './useGmvV2'

/** `simple` = beginner mode: fewer, plain-language columns and click-by-click steps. */
const props = defineProps<{ storeId: string; loading: boolean; initialCode?: DiagnosisCode | ''; simple?: boolean }>()
const { t, money, percent, roi, headline, reason, actionText, timingText, changeKindFor, friendlyError, stepsFor } = useGmvV2Text()

const STATUS_ICON: Record<DiagnosisCode, any> = {
  losing: XOctagon,
  blocked: Ban,
  underspend: TrendingDown,
  creatives: Images,
  scale: Rocket,
  healthy: CheckCircle2,
  learning: Hourglass,
  collecting: CircleDot,
}

type SortKey = 'status' | 'cost' | 'gmv' | 'roi' | 'utilization' | 'orders' | 'profit'
const workspace = ref<V2Workspace>(emptyWorkspace())
const filter = ref<DiagnosisCode | ''>(props.initialCode || '')
const keyword = ref('')
const expanded = ref<string | null>(null)
const lesson = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const sortKey = ref<SortKey>('status')
const sortDesc = ref(false)

const currency = computed(() => workspace.value.currency)
const moneyShort = (value: number) => money(value, currency.value)
const roiShort = (value: number) => value.toFixed(2)
const compactMoney = (value: number) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.value || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
  } catch {
    return String(Math.round(value))
  }
}

function sortValue(item: V2Diagnosis, key: SortKey): number {
  switch (key) {
    case 'status': return CODE_ORDER.indexOf(item.code)
    case 'cost': return item.window.cost
    case 'gmv': return item.window.grossRevenue
    case 'roi': return item.lines.actualRoi7d ?? -1
    case 'utilization': return item.window.avgUtilization
    case 'orders': return item.window.orders
    case 'profit': return item.window.profit ?? Number.NEGATIVE_INFINITY
  }
}

const rows = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  const direction = sortDesc.value ? -1 : 1
  return workspace.value.diagnoses
    .filter((item) => !filter.value || item.code === filter.value)
    .filter((item) => !needle || item.campaignName.toLowerCase().includes(needle) || item.campaignId.includes(needle))
    .sort((a, b) => direction * (sortValue(a, sortKey.value) - sortValue(b, sortKey.value)) || b.window.cost - a.window.cost)
})
const codes = computed(() => CODE_ORDER.filter((code) => workspace.value.summary.counts[code] > 0))
const totals = computed(() => {
  const list = rows.value
  const cost = list.reduce((sum, item) => sum + item.window.cost, 0)
  const gmv = list.reduce((sum, item) => sum + item.window.grossRevenue, 0)
  const orders = list.reduce((sum, item) => sum + item.window.orders, 0)
  const profits = list.map((item) => item.window.profit).filter((value): value is number => value !== null)
  return { cost, gmv, orders, roi: cost > 0 ? gmv / cost : null, profit: profits.length ? profits.reduce((sum, value) => sum + value, 0) : null }
})

const columns: Array<{ key: SortKey; label: string; num?: boolean }> = [
  { key: 'status', label: 'gmvV2.dash.cols.status' },
  { key: 'cost', label: 'gmvV2.campaigns.cols.spend', num: true },
  { key: 'gmv', label: 'gmvV2.campaigns.kv.gmv', num: true },
  { key: 'roi', label: 'gmvV2.dash.cols.roi', num: true },
  { key: 'utilization', label: 'gmvV2.campaigns.cols.utilization' },
  { key: 'profit', label: 'gmvV2.campaigns.cols.profit', num: true },
]

function sortBy(key: SortKey) {
  if (sortKey.value === key) sortDesc.value = !sortDesc.value
  else {
    sortKey.value = key
    sortDesc.value = key !== 'status'
  }
}

function roiTone(item: V2Diagnosis) {
  const actual = item.lines.actualRoi7d
  if (actual === null || item.lines.breakEvenRoi === null) return 'neutral'
  if (actual < item.lines.breakEvenRoi) return 'critical'
  if (item.lines.targetRoi !== null && actual >= item.lines.targetRoi) return 'good'
  return 'warning'
}

async function load() {
  busy.value = true
  error.value = ''
  try {
    workspace.value = (await window.api.tiktokGmvMax.getV2Workspace({ storeId: props.storeId })) as V2Workspace
  } catch (cause) {
    error.value = friendlyError(cause)
  } finally {
    busy.value = false
  }
}

async function markDone(item: V2Diagnosis) {
  try {
    await window.api.tiktokGmvMax.recordV2Change({ campaignId: item.campaignId, kind: changeKindFor(item), from: item.action.from, to: item.action.to })
  } catch (cause) {
    error.value = friendlyError(cause)
    return
  }
  await load()
}

watch(() => props.storeId, () => void load())
watch(() => props.initialCode, (value) => { filter.value = value || '' })
watch(() => props.loading, (now, before) => {
  if (before && !now) void load()
})
onMounted(load)
</script>

<template>
  <div class="vg-scope gv-viz camp" data-testid="gmv-v2-campaigns">
    <div v-if="error" class="vg-notice vg-notice--danger" data-testid="gmv-v2-error">{{ error }}</div>
    <div class="vg-toolbar">
      <div class="camp__filters" role="group" :aria-label="t('gmvV2.dash.cols.status')">
        <button type="button" class="camp__chip" :class="{ 'is-active': !filter }" @click="filter = ''">{{ t('gmvV2.campaigns.all') }} <b>{{ workspace.diagnoses.length }}</b></button>
        <button v-for="code in codes" :key="code" type="button" class="camp__chip" :class="{ 'is-active': filter === code }" @click="filter = code">
          <span class="camp__status" :class="`gvt-${CODE_STATUS[code]}`"><component :is="STATUS_ICON[code]" :size="13" /></span>{{ t(`gmvV2.codes.${code}.short`) }} <b>{{ workspace.summary.counts[code] }}</b>
        </button>
      </div>
      <span class="vg-toolbar__spacer"></span>
      <label class="vg-search camp__search"><Search :size="14" /><input v-model="keyword" class="vg-input vg-input--sm" :placeholder="t('gmvV2.campaigns.search')" /></label>
    </div>

    <div class="vg-card vg-card--flush camp__card">
      <div class="camp__scroll">
        <div class="camp__table" :class="{ 'is-simple': simple }" role="table">
          <div v-if="simple" class="camp__head" role="row">
            <span role="columnheader" class="camp__namehead">{{ t('gmvV2.campaigns.cols.campaign') }}</span>
            <span role="columnheader">{{ t('gmvV2.simple.campaigns.verdict') }}</span>
            <span role="columnheader">{{ t('gmvV2.simple.campaigns.next') }}</span>
            <button type="button" role="columnheader" class="camp__sort is-num" :class="{ 'is-active': sortKey === 'cost' }" @click="sortBy('cost')">{{ t('gmvV2.campaigns.cols.spend') }}</button>
            <button type="button" role="columnheader" class="camp__sort is-num" :class="{ 'is-active': sortKey === 'roi' }" :title="t('gmvV2.simple.campaigns.roiHelp')" @click="sortBy('roi')">{{ t('gmvV2.simple.campaigns.roi') }}</button>
          </div>
          <div v-else class="camp__head" role="row">
            <span role="columnheader" class="camp__namehead">{{ t('gmvV2.campaigns.cols.campaign') }}</span>
            <button v-for="col in columns" :key="col.key" type="button" role="columnheader" class="camp__sort" :class="{ 'is-num': col.num, 'is-active': sortKey === col.key }" :aria-sort="sortKey === col.key ? (sortDesc ? 'descending' : 'ascending') : 'none'" @click="sortBy(col.key)">
              {{ t(col.label) }}
              <ArrowDown v-if="sortKey === col.key && sortDesc" :size="12" /><ArrowUp v-else-if="sortKey === col.key" :size="12" />
            </button>
            <span role="columnheader" class="camp__trendhead">{{ t('gmvV2.dash.cols.trend') }}</span>
          </div>

          <template v-for="item in rows" :key="item.campaignId">
            <div
              class="camp__row"
              role="row"
              tabindex="0"
              :class="{ 'is-open': expanded === item.campaignId }"
              :aria-expanded="expanded === item.campaignId"
              data-testid="gmv-v2-campaign-row"
              @click="expanded = expanded === item.campaignId ? null : item.campaignId"
              @keydown.enter.prevent="expanded = expanded === item.campaignId ? null : item.campaignId"
            >
              <span class="camp__name">
                <strong class="camp__title"><span class="camp__chev"><ChevronDown v-if="expanded === item.campaignId" :size="14" /><ChevronRight v-else :size="14" /></span><span class="vg-ellipsis">{{ item.campaignName }}</span></strong>
                <small>{{ item.campaignType === 'LIVE' ? t('gmvV2.campaigns.live') : t('gmvV2.campaigns.product') }} · {{ t('gmvV2.campaigns.target', { value: roi(item.lines.targetRoi) }) }}</small>
              </span>
              <span class="camp__diag">
                <span class="camp__status" :class="`gvt-${CODE_STATUS[item.code]}`"><component :is="STATUS_ICON[item.code]" :size="14" /> {{ headline(item) }}</span>
                <small v-if="item.learning.active"><Clock3 :size="11" /> {{ t('gmvV2.today.daysLeft', { days: item.learning.daysLeft }) }}</small>
              </span>
              <span v-if="simple" class="camp__next">{{ item.action.kind === 'none' ? t('gmvV2.simple.campaigns.nothing') : actionText(item, currency) }}</span>
              <span class="is-num">{{ money(item.window.cost, currency) }}</span>
              <span v-if="!simple" class="is-num">{{ money(item.window.grossRevenue, currency) }}</span>
              <span class="is-num camp__roi">
                <span class="camp__roi-value"><i :class="`gvt-${roiTone(item)}`"></i>{{ roi(item.lines.actualRoi7d) }}</span>
                <small v-if="simple">{{ item.lines.breakEvenRoi ? t('gmvV2.simple.campaigns.roiVs', { breakEven: roi(item.lines.breakEvenRoi) }) : t('gmvV2.simple.kpi.roiNoMargin') }}</small>
                <small v-else>{{ t('gmvV2.dash.roiVs', { target: roi(item.lines.targetRoi), breakEven: roi(item.lines.breakEvenRoi) }) }}</small>
              </span>
              <span v-if="!simple" class="camp__util">
                <span class="camp__util-bar"><i :style="{ width: `${Math.min(100, Math.max(2, item.window.avgUtilization * 100))}%` }"></i></span>
                <small>{{ percent(item.window.avgUtilization) }}</small>
              </span>
              <span v-if="!simple" class="is-num camp__profit" :class="{ 'is-negative': (item.window.profit ?? 0) < 0 }">{{ item.window.profit === null ? '—' : money(item.window.profit, currency) }}</span>
              <span v-if="!simple" class="camp__trend"><GmvV2Sparkline :values="item.series.map((point) => point.roi)" :reference="item.lines.breakEvenRoi" :width="84" :height="26" :label="t('gmvV2.dash.sparkAria', { name: item.campaignName })" /></span>
            </div>

            <div v-if="expanded === item.campaignId" class="camp__detail">
              <div class="camp__panel">
                <div class="camp__action">
                  <span class="camp__status" :class="`gvt-${CODE_STATUS[item.code]}`"><component :is="STATUS_ICON[item.code]" :size="15" /> {{ headline(item) }}</span>
                  <strong>{{ actionText(item, currency) }}</strong>
                  <small v-if="timingText(item)">{{ timingText(item) }}</small>
                </div>
                <p class="camp__reason">{{ reason(item) }}</p>
                <ol v-if="simple && stepsFor(item, currency).length" class="camp__steps">
                  <li v-for="(step, stepIndex) in stepsFor(item, currency)" :key="stepIndex">{{ step }}</li>
                </ol>
                <p v-if="item.protection.note" class="camp__protect"><ShieldCheck :size="13" /> {{ t(`gmvV2.protection.${item.protection.note}`) }}</p>
                <p v-if="item.marginSource === 'missing'" class="camp__note">{{ t('gmvV2.campaigns.marginMissing') }}</p>
                <p v-else-if="item.marginSource === 'store'" class="camp__note">{{ t('gmvV2.campaigns.marginStore') }}</p>
                <dl class="camp__kv">
                  <div><dt>{{ t('gmvV2.campaigns.kv.orders') }}</dt><dd>{{ item.window.orders }}</dd></div>
                  <div><dt>{{ t('gmvV2.campaigns.kv.aov') }}</dt><dd>{{ money(item.window.aov, currency) }}</dd></div>
                  <div><dt>{{ t('gmvV2.campaigns.kv.netCost') }}</dt><dd>{{ money(item.window.netCost, currency) }}</dd></div>
                  <div v-if="item.creatives">
                    <dt>{{ t('gmvV2.campaigns.kv.creatives') }}</dt>
                    <dd>{{ t('gmvV2.campaigns.creativeLine', { delivering: item.creatives.delivering, learning: item.creatives.learning + item.creatives.inQueue, blocked: item.creatives.authorizationNeeded + item.creatives.rejected + item.creatives.unavailable }) }}</dd>
                  </div>
                </dl>
                <div class="camp__buttons">
                  <button v-if="item.action.kind !== 'none'" type="button" class="vg-btn vg-btn--sm vg-btn--primary" @click.stop="markDone(item)"><CheckCircle2 :size="14" /> {{ t('gmvV2.today.done') }}</button>
                  <button type="button" class="vg-btn vg-btn--sm" @click.stop="lesson = item.lessonId"><BookOpen :size="14" /> {{ t('gmvV2.today.why') }}</button>
                  <button type="button" class="vg-btn vg-btn--sm" @click.stop="openTikTokAdsManager"><ExternalLink :size="14" /> {{ t('gmvV2.today.openTikTok') }}</button>
                </div>
              </div>
              <div class="camp__charts camp__chart">
                <div>
                  <h4>{{ t('gmvV2.dash.trendTitle') }}</h4>
                  <GmvV2LineChart
                    :dates="item.series.map((point) => point.date)"
                    :series="[
                      { key: 'gmv', label: t('gmvV2.dash.tiles.gmv'), color: 'series-1', values: item.series.map((point) => point.grossRevenue) },
                      { key: 'cost', label: t('gmvV2.dash.tiles.spend'), color: 'series-2', values: item.series.map((point) => point.cost) },
                    ]"
                    :format="moneyShort"
            :axis-format="compactMoney"
                    :height="170"
                    :aria-label="t('gmvV2.dash.trendAria')"
                  />
                </div>
                <div>
                  <h4>{{ t('gmvV2.dash.roiTitle') }}</h4>
                  <GmvV2LineChart
                    :dates="item.series.map((point) => point.date)"
                    :series="[{ key: 'roi', label: t('gmvV2.dash.tiles.roi'), color: 'series-1', values: item.series.map((point) => point.roi) }]"
                    :ref-lines="[
                      ...(item.lines.targetRoi ? [{ label: t('gmvV2.lines.target'), value: item.lines.targetRoi, tone: 'neutral' as const }] : []),
                      ...(item.lines.breakEvenRoi ? [{ label: t('gmvV2.lines.breakEven'), value: item.lines.breakEvenRoi, tone: 'critical' as const }] : []),
                    ]"
                    :format="roiShort"
                    :height="170"
                    :aria-label="t('gmvV2.dash.roiAria')"
                  />
                </div>
              </div>
            </div>
          </template>

          <div v-if="rows.length > 1" class="camp__row camp__total" role="row">
            <span class="camp__name camp__name--total"><strong>{{ t('gmvV2.dash.total', { count: rows.length }) }}</strong></span>
            <span></span>
            <span v-if="simple"></span>
            <span class="is-num">{{ money(totals.cost, currency) }}</span>
            <span v-if="!simple" class="is-num">{{ money(totals.gmv, currency) }}</span>
            <span class="is-num">{{ roi(totals.roi) }}</span>
            <template v-if="!simple">
              <span></span>
              <span class="is-num" :class="{ 'is-negative': (totals.profit ?? 0) < 0 }">{{ totals.profit === null ? '—' : money(totals.profit, currency) }}</span>
              <span></span>
            </template>
          </div>
        </div>
      </div>
      <div v-if="!rows.length" class="vg-empty camp__empty"><p>{{ busy ? t('gmvV2.campaigns.loading') : t('gmvV2.campaigns.empty') }}</p></div>
    </div>

    <GmvV2Lesson :lesson-id="lesson" @close="lesson = null" />
  </div>
</template>

<style scoped>
.camp { display: flex; flex-direction: column; gap: 12px; container-type: inline-size; }
.camp__search { width: 220px; }
.camp__filters { display: flex; flex-wrap: wrap; gap: 6px; }
.camp__chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 1px solid var(--theme-border); border-radius: 999px; background: var(--surface-1); color: var(--text-secondary); font-size: 12.5px; cursor: pointer; }
.camp__chip b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.camp__chip:hover { color: var(--text-primary); }
.camp__chip.is-active { border-color: var(--text-primary); color: var(--text-primary); background: color-mix(in srgb, var(--text-primary) 6%, var(--surface-1)); }

/* status: icon carries the colour, label stays in text ink */
.camp__status { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; color: var(--text-primary); white-space: nowrap; }
.camp__status svg { flex-shrink: 0; color: var(--status-neutral); }
.camp__status.gvt-critical svg { color: var(--status-critical); }
.camp__status.gvt-serious svg { color: var(--status-serious); }
.camp__status.gvt-warning svg { color: var(--status-warning); }
.camp__status.gvt-good svg { color: var(--status-good); }

.camp__card { overflow: hidden; }
.camp__scroll { overflow-x: auto; }
.camp__table { min-width: 840px; }
.camp__head, .camp__row { display: grid; grid-template-columns: minmax(140px, 1.5fr) minmax(96px, 1fr) 84px 88px 96px 92px 88px 76px; gap: 10px; align-items: center; padding: 10px 12px; }
.camp__head { position: sticky; top: 0; font-size: 11.5px; color: var(--text-muted); border-bottom: 1px solid var(--grid); background: var(--surface-1); }
.camp__sort { display: inline-flex; align-items: center; gap: 3px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.camp__sort.is-num { justify-content: flex-end; }
.camp__sort:hover, .camp__sort.is-active { color: var(--text-primary); }
.camp__trendhead { text-align: right; }
.camp__table.is-simple { min-width: 680px; }
.camp__table.is-simple .camp__head, .camp__table.is-simple .camp__row { grid-template-columns: minmax(140px, 1.3fr) minmax(110px, 1fr) minmax(200px, 2.2fr) 96px 130px; }
.camp__next { font-size: 13px; font-weight: 600; color: var(--text-primary); line-height: 1.45; }
.camp__steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; line-height: 1.6; color: var(--text-secondary); }
.camp__row { border-bottom: 1px solid var(--grid); color: var(--text-primary); font-size: 13px; cursor: pointer; }
.camp__row:hover, .camp__row.is-open { background: color-mix(in srgb, var(--text-primary) 3%, transparent); }
.camp__row:focus-visible { outline: 2px solid var(--series-1); outline-offset: -2px; }
.is-num { text-align: right; font-variant-numeric: tabular-nums; }
.camp__chev { color: var(--text-muted); display: inline-flex; flex-shrink: 0; margin-left: -2px; }
.camp__title { display: flex; align-items: center; gap: 4px; min-width: 0; }
.camp__name > small { padding-left: 16px; }
.camp__namehead, .camp__name--total { padding-left: 16px; }
.camp__name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.camp__name small { font-size: 11.5px; color: var(--text-muted); }
.camp__diag { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; min-width: 0; }
.camp__diag small { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; color: var(--text-muted); }
.camp__roi { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.camp__roi-value { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.camp__roi-value i { width: 7px; height: 7px; border-radius: 50%; background: var(--status-neutral); }
.camp__roi-value i.gvt-critical { background: var(--status-critical); }
.camp__roi-value i.gvt-warning { background: var(--status-warning); }
.camp__roi-value i.gvt-good { background: var(--status-good); }
.camp__roi small { font-size: 11px; color: var(--text-muted); text-align: right; }
.camp__util { display: flex; align-items: center; gap: 8px; }
.camp__util-bar { flex: 1; height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--text-primary) 8%, transparent); overflow: hidden; }
.camp__util-bar i { display: block; height: 100%; border-radius: 999px; background: var(--series-1); }
.camp__util small { width: 34px; text-align: right; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.camp__profit { font-weight: 600; }
.camp__profit.is-negative::before, .camp__total .is-negative::before { content: '▼ '; font-size: 9px; color: var(--status-critical); }
.camp__trend { display: flex; justify-content: flex-end; }
.camp__total { cursor: default; font-weight: 600; background: color-mix(in srgb, var(--text-primary) 2.5%, transparent); border-bottom: 0; }
.camp__total:hover { background: color-mix(in srgb, var(--text-primary) 2.5%, transparent); }

.camp__detail { display: flex; flex-direction: column; gap: 18px; padding: 16px 18px 20px 28px; border-bottom: 1px solid var(--grid); background: color-mix(in srgb, var(--text-primary) 2%, transparent); }
.camp__panel { display: grid; grid-template-columns: minmax(240px, 380px) minmax(0, 1fr); gap: 8px 20px; align-items: start; min-width: 0; }
.camp__panel > .camp__action { grid-row: span 6; }
.camp__panel > :not(.camp__action) { grid-column: 2; }
.camp__action { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--grid); border-radius: var(--vg-radius-sm); background: var(--surface-1); }
.camp__action strong { font-size: 14px; color: var(--text-primary); }
.camp__action small { font-size: 12px; color: var(--text-secondary); }
.camp__reason { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--text-secondary); }
.camp__protect { display: flex; gap: 6px; margin: 0; font-size: 12.5px; color: var(--text-secondary); }
.camp__protect svg { color: var(--status-warning); flex-shrink: 0; margin-top: 2px; }
.camp__note { margin: 0; font-size: 12px; color: var(--text-muted); }
.camp__kv { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 0; }
.camp__kv div { display: flex; flex-direction: column; gap: 1px; }
.camp__kv dt { font-size: 11px; color: var(--text-muted); }
.camp__kv dd { margin: 0; font-size: 13px; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.camp__buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.camp__charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; min-width: 0; }
.camp__charts h4 { margin: 0 0 6px; font-size: 12.5px; color: var(--text-secondary); font-weight: 600; }
.camp__empty { padding: 30px 0; }
@container (max-width: 720px) {
  .camp__panel { grid-template-columns: minmax(0, 1fr); }
  .camp__panel > :not(.camp__action) { grid-column: 1; }
  .camp__panel > .camp__action { grid-row: auto; }
}
@container (max-width: 640px) {
  .camp__charts { grid-template-columns: minmax(0, 1fr); }
}

.camp__steps { list-style: none !important; padding-left: 0 !important; counter-reset: gvstep; }
.camp__steps li { position: relative; padding-left: 28px; counter-increment: gvstep; }
.camp__steps li::before { content: counter(gvstep); position: absolute; left: 0; top: 2px; width: 19px; height: 19px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--text-primary) 10%, transparent); color: var(--text-primary); font-size: 11px; font-weight: 700; }
</style>
