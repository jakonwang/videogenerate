<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertTriangle, ArrowRight, BarChart3, CalendarRange, ChevronRight, ClipboardList, Lightbulb, RefreshCcw, Send, Sparkles, TrendingUp, Wand2 } from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'
import { formatKpi as formatKpiValue, kpiDeltaText, kpiDeltaTone as deltaTone } from '@/lib/overviewFormat'
import type { OverviewKpi, OverviewReport, OverviewSignal } from '../../../../shared/overviewReport'

type LineStats = { line: string; produced: number; approved: number; redo: number; discarded: number; published: number; approvalRate: number }
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

const { t, locale } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()
const range = ref(7)
const data = ref<Insights | null>(null)
const overview = ref<OverviewReport | null>(null)
const history = ref<Brief[]>([])
const loading = ref(false)
const generating = ref(false)

const totals = computed(() => {
  const lines = data.value?.lines || []
  const produced = lines.reduce((sum, row) => sum + row.produced, 0)
  const approved = lines.reduce((sum, row) => sum + row.approved, 0)
  const decided = lines.reduce((sum, row) => sum + row.approved + row.redo + row.discarded, 0)
  return { produced, approved, rate: decided ? Math.round((approved / decided) * 100) : 0, published: data.value?.publish.published || 0 }
})
const maxProduced = computed(() => Math.max(1, ...(data.value?.lines || []).map((row) => row.produced)))
const weeklyBriefs = computed(() => history.value.filter((brief) => brief.kind === 'weekly'))

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

const signalColumns = computed(() => [
  { key: 'problems', icon: AlertTriangle, tone: 'red', items: overview.value?.problems || [], empty: t('ai.insights.overview.noProblems') },
  { key: 'growth', icon: TrendingUp, tone: 'green', items: overview.value?.growth || [], empty: t('ai.insights.overview.noGrowth') },
  { key: 'todos', icon: ClipboardList, tone: 'blue', items: overview.value?.todos || [], empty: t('ai.insights.overview.noTodos') },
])

function formatKpi(kpi: OverviewKpi) {
  return formatKpiValue(kpi, locale.value)
}

function deltaText(kpi: OverviewKpi) {
  return kpiDeltaText(kpi, t)
}

function openSignal(signal: OverviewSignal) {
  if (signal.route) void router.push(signal.route)
}

watch(range, () => void load())
onMounted(load)
</script>

<template>
  <main class="vg-scope vg-page insights" data-testid="insights-view">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><BarChart3 :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('ai.insights.title') }}</h1>
        <p>{{ t('ai.insights.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <div class="vg-seg vg-seg--sm">
          <button v-for="days in [7, 30, 90]" :key="days" type="button" class="vg-seg__btn" :class="{ 'is-active': range === days }" @click="range = days">{{ t('ai.insights.days', { count: days }) }}</button>
        </div>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="loading" @click="load"><RefreshCcw :size="14" :class="{ 'vg-spin': loading }" /></button>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="generating" @click="generateWeekly"><CalendarRange :size="14" /> {{ t('ai.insights.generateWeekly') }}</button>
      </div>
    </header>

    <template v-if="overview">
      <section class="vg-notice vg-notice--accent overview__headline" data-testid="overview-headline">
        <Sparkles :size="16" />
        <span class="overview__headline-text">{{ overview.headline }}</span>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="askAi(t('ai.insights.overview.askAiPrompt'))"><Wand2 :size="14" /> {{ t('ai.insights.overview.askAi') }}</button>
      </section>

      <section class="overview__kpis" data-testid="overview-kpis">
        <button v-for="kpi in overview.kpis" :key="kpi.key" type="button" class="vg-stat overview__kpi" :class="{ 'is-off': !kpi.available }" @click="router.push(kpi.route)">
          <span class="vg-stat__body">
            <span class="vg-stat__label">{{ t(`ai.insights.overview.kpi.${kpi.key}`) }}</span>
            <template v-if="kpi.available">
              <span class="vg-stat__value">{{ formatKpi(kpi) }}</span>
              <span class="overview__delta">
                <span v-if="deltaText(kpi)" class="vg-pill" :class="deltaTone(kpi) ? `vg-pill--${deltaTone(kpi)}` : ''">{{ deltaText(kpi) }}</span>
                <span v-if="deltaText(kpi)" class="vg-muted">{{ t('ai.insights.overview.vsPrev') }}</span>
              </span>
            </template>
            <template v-else>
              <span class="vg-stat__value vg-muted">{{ t('ai.insights.overview.notConnected') }}</span>
              <span class="overview__delta vg-link">{{ t('ai.insights.overview.connect') }} <ChevronRight :size="12" /></span>
            </template>
          </span>
        </button>
      </section>
      <p v-if="overview.adsOtherCurrencies.length" class="vg-field__hint overview__note">{{ t('ai.insights.overview.otherCurrencies', { list: overview.adsOtherCurrencies.join(' / ') }) }}</p>

      <section class="overview__signals" data-testid="overview-signals">
        <div v-for="column in signalColumns" :key="column.key" class="vg-card overview__column" :class="`overview__column--${column.tone}`">
          <div class="vg-card__head">
            <span class="vg-card__title"><component :is="column.icon" :size="16" /> {{ t(`ai.insights.overview.${column.key}`) }}</span>
            <span class="vg-count">{{ column.items.length }}</span>
          </div>
          <div class="vg-list">
            <div v-for="signal in column.items" :key="signal.id" class="vg-list__item overview__signal" :class="`overview__signal--${signal.level}`">
              <span class="overview__dot"></span>
              <button type="button" class="vg-list__main overview__signal-main" :disabled="!signal.route" @click="openSignal(signal)">
                <span class="vg-list__title">{{ signal.title }}</span>
                <span class="vg-list__sub">{{ signal.detail }}</span>
              </button>
              <button v-if="signal.aiPrompt" type="button" class="vg-btn vg-btn--xs vg-btn--ghost" :title="t('ai.insights.overview.askAiItem')" @click="askAi(signal.aiPrompt)"><Wand2 :size="13" /></button>
            </div>
            <p v-if="!column.items.length" class="vg-muted insights__empty">{{ column.empty }}</p>
          </div>
        </div>
      </section>

      <section class="vg-card overview__funnel-card">
        <div class="vg-card__head">
          <span class="vg-card__title">{{ t('ai.insights.overview.funnel') }}</span>
          <span class="vg-muted overview__hint">{{ t('ai.insights.overview.funnelHint') }}</span>
        </div>
        <div class="overview__funnel">
          <template v-for="(step, index) in overview.funnel" :key="step.key">
            <span v-if="index > 0" class="overview__arrow">
              <ArrowRight :size="14" />
              <span v-if="step.rate !== null" class="overview__rate">{{ step.rate }}%</span>
            </span>
            <button type="button" class="overview__step" @click="router.push(step.route)">
              <span class="overview__step-value vg-num">{{ step.value }}</span>
              <span class="overview__step-label">{{ t(`ai.insights.overview.step.${step.key}`) }}</span>
            </button>
          </template>
        </div>
      </section>

      <h2 class="overview__section">{{ t('ai.insights.overview.detail') }}</h2>
    </template>

    <section class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.produced') }}</span><span class="vg-stat__value">{{ totals.produced }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.approved') }}</span><span class="vg-stat__value">{{ totals.approved }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.approvalRate') }}</span><span class="vg-stat__value">{{ totals.rate }}%</span></span></div>
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.published') }}</span><span class="vg-stat__value">{{ totals.published }}</span></span></div>
    </section>

    <div class="insights__grid">
      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.insights.byLine') }}</span></div>
        <table class="vg-table vg-table--compact">
          <thead>
            <tr>
              <th>{{ t('ai.insights.line') }}</th>
              <th>{{ t('ai.insights.produced') }}</th>
              <th>{{ t('ai.insights.approved') }}</th>
              <th>{{ t('ai.insights.redo') }}</th>
              <th>{{ t('ai.insights.approvalRate') }}</th>
              <th>{{ t('ai.insights.published') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data?.lines || []" :key="row.line">
              <td>
                <span class="insights__line">{{ t(`ai.line.${row.line}`) }}</span>
                <span class="insights__bar"><span :style="{ width: `${(row.produced / maxProduced) * 100}%` }"></span></span>
              </td>
              <td class="vg-num">{{ row.produced }}</td>
              <td class="vg-num">{{ row.approved }}</td>
              <td class="vg-num">{{ row.redo }}</td>
              <td class="vg-num">{{ row.approved + row.redo + row.discarded ? `${row.approvalRate}%` : '-' }}</td>
              <td class="vg-num">{{ row.published }}</td>
            </tr>
          </tbody>
        </table>
        <p class="vg-field__hint insights__hint">{{ t('ai.insights.dataNote') }}</p>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title"><Lightbulb :size="16" /> {{ t('ai.insights.recommendations') }}</span></div>
        <ul class="insights__recs">
          <li v-for="item in data?.recommendations || []" :key="item">{{ item }}</li>
        </ul>
        <button type="button" class="vg-btn vg-btn--soft vg-btn--block" @click="askAi(t('ai.insights.askPlan'))"><Wand2 :size="14" /> {{ t('ai.insights.askPlanButton') }}</button>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.insights.topProducts') }}</span></div>
        <div class="vg-list">
          <button v-for="product in data?.topProducts || []" :key="product.productId" type="button" class="vg-list__item vg-list__item--button" @click="router.push(`/products/${product.productId}`)">
            <span class="vg-list__main">
              <span class="vg-list__title">{{ product.productName }}</span>
              <span class="vg-list__sub">{{ t('ai.insights.productLine', product) }}</span>
            </span>
          </button>
          <p v-if="!data?.topProducts.length" class="vg-muted insights__empty">{{ t('ai.insights.noData') }}</p>
        </div>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.insights.redoReasons') }}</span></div>
        <div class="vg-list">
          <div v-for="item in data?.topRedoReasons || []" :key="item.reason" class="vg-list__item">
            <span class="vg-list__main"><span class="vg-list__title">{{ item.reason }}</span></span>
            <span class="vg-count">{{ item.count }}</span>
          </div>
          <p v-if="!data?.topRedoReasons.length" class="vg-muted insights__empty">{{ t('ai.insights.noRedo') }}</p>
        </div>
        <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="router.push('/settings?section=brand')"><Sparkles :size="14" /> {{ t('ai.insights.editMemory') }}</button>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title"><Send :size="16" /> {{ t('ai.insights.publish') }}</span></div>
        <dl class="vg-kv">
          <dt>{{ t('ai.insights.publishTotal') }}</dt><dd>{{ data?.publish.total || 0 }}</dd>
          <dt>{{ t('ai.insights.publishDone') }}</dt><dd>{{ data?.publish.published || 0 }}</dd>
          <dt>{{ t('ai.insights.publishDraft') }}</dt><dd>{{ data?.publish.draft || 0 }}</dd>
          <dt>{{ t('ai.insights.publishFailed') }}</dt><dd>{{ data?.publish.failed || 0 }}</dd>
        </dl>
        <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="router.push('/publish')">{{ t('ai.insights.openPublish') }}</button>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title"><CalendarRange :size="16" /> {{ t('ai.insights.weeklyHistory') }}</span></div>
        <div class="vg-list">
          <div v-for="brief in weeklyBriefs" :key="brief.id" class="vg-list__item insights__brief">
            <span class="vg-list__main">
              <span class="vg-list__title">{{ brief.headline }}</span>
              <span class="vg-list__sub">{{ brief.periodKey.replace('W', '') }}{{ brief.summary ? ` · ${brief.summary}` : '' }}</span>
            </span>
          </div>
          <p v-if="!weeklyBriefs.length" class="vg-muted insights__empty">{{ t('ai.insights.noWeekly') }}</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.insights { width: min(1400px, 100%); margin: 0 auto; }
.insights__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.insights__grid > .vg-card:first-child { grid-column: 1 / -1; }
.insights__line { display: block; font-weight: 600; }
.insights__bar { display: block; height: 4px; margin-top: 4px; border-radius: 4px; background: var(--theme-panel-soft); overflow: hidden; width: 140px; }
.insights__bar span { display: block; height: 100%; background: var(--vg-accent); border-radius: 4px; }
.insights__hint { margin-top: 8px; }
.insights__recs { margin: 0 0 12px; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.6; }
.insights__empty { padding: 12px 4px; font-size: 12.5px; }
.insights__brief .vg-list__sub { white-space: normal; }
.overview__headline { align-items: center; margin-bottom: 14px; font-size: 13.5px; color: var(--theme-text); }
.overview__headline-text { flex: 1; min-width: 0; font-weight: 600; line-height: 1.6; }
.overview__kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.overview__kpi { text-align: left; cursor: pointer; font: inherit; transition: border-color 0.15s; }
.overview__kpi:hover { border-color: var(--vg-accent-line); }
.overview__kpi.is-off .vg-stat__value { font-size: 15px; font-weight: 600; color: var(--theme-text-muted); }
.overview__delta { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11.5px; }
.overview__delta .vg-pill { height: 19px; padding: 0 7px; font-size: 11.5px; }
.overview__note { margin: -6px 0 14px; }
.overview__signals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
.overview__column { border-top: 3px solid var(--vg-gray); }
.overview__column--red { border-top-color: var(--vg-red); }
.overview__column--green { border-top-color: var(--vg-green); }
.overview__column--blue { border-top-color: var(--vg-blue); }
.overview__column .vg-list { max-height: 360px; overflow-y: auto; }
.overview__signal { align-items: flex-start; gap: 8px; }
.overview__signal .vg-list__sub { white-space: normal; line-height: 1.5; }
.overview__signal-main { flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.overview__signal-main:disabled { cursor: default; }
.overview__signal-main:not(:disabled):hover .vg-list__title { color: var(--vg-accent); }
.overview__dot { width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; flex-shrink: 0; background: var(--vg-gray); }
.overview__signal--error .overview__dot { background: var(--vg-red); }
.overview__signal--warning .overview__dot { background: var(--vg-amber); }
.overview__signal--success .overview__dot { background: var(--vg-green); }
.overview__signal--info .overview__dot { background: var(--vg-blue); }
.overview__hint { font-size: 12px; }
.overview__funnel-card { margin-bottom: 18px; }
.overview__funnel { display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; }
.overview__step { flex: 1; min-width: 110px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 8px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel-soft); cursor: pointer; font: inherit; color: inherit; }
.overview__step:hover { border-color: var(--vg-accent-line); }
.overview__step-value { font-size: 20px; font-weight: 800; color: var(--theme-text); }
.overview__step-label { font-size: 12px; color: var(--theme-text-muted); }
.overview__arrow { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--theme-text-muted); font-size: 11.5px; }
.overview__rate { font-weight: 700; color: var(--theme-text-secondary); }
.overview__section { margin: 4px 0 12px; font-size: 15px; font-weight: 700; color: var(--theme-text); }
@media (max-width: 1100px) {
  .insights__grid { grid-template-columns: minmax(0, 1fr); }
  .overview__kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview__signals { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .overview__headline { flex-wrap: wrap; }
  .overview__arrow { display: none; }
  .overview__step { min-width: calc(50% - 4px); }
}
</style>
