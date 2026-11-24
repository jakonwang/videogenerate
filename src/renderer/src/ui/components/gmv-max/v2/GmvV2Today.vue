<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  ExternalLink,
  GraduationCap,
  CircleHelp,
  Hourglass,
  Link2,
  RefreshCw,
  Images,
  Lightbulb,
  Loader2,
  Minus,
  Percent,
  Rocket,
  ShieldCheck,
  TrendingDown,
  Undo2,
  Wand2,
  XOctagon,
} from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'
import GmvV2Lesson from './GmvV2Lesson.vue'
import GmvV2LineChart from './GmvV2LineChart.vue'
import GmvV2Sparkline from './GmvV2Sparkline.vue'
import './gmv-v2-viz.css'
import {
  CODE_ORDER,
  CODE_STATUS,
  LESSON_IDS,
  aggregateAccount,
  change,
  emptyWorkspace,
  openTikTokAdsManager,
  useGmvV2Text,
  type DiagnosisCode,
  type V2Diagnosis,
  type V2Workspace,
} from './useGmvV2'

/** `simple` = beginner mode: guided setup, three plain numbers and step-by-step task cards. */
const props = defineProps<{ storeId: string; connected: boolean; loading: boolean; simple?: boolean }>()
const emit = defineEmits<{ (e: 'open-campaigns', code?: DiagnosisCode): void; (e: 'sync'): void; (e: 'connect'): void }>()

const { t, money, roi, percent, headline, reason, actionText, timingText, changeKindFor, friendlyError, stepsFor: stepsForCurrency } = useGmvV2Text()
const stepsFor = (item: V2Diagnosis) => stepsForCurrency(item, currency.value)
const ai = useAiProducerStore()
const workspace = ref<V2Workspace>(emptyWorkspace())
const busy = ref(false)
const error = ref('')
const lesson = ref<string | null>(null)
const marginDraft = ref<Record<string, string>>({})
const savingMargin = ref(false)
const doneIds = ref<string[]>([])
const expanded = ref<string | null>(null)
const flash = ref('')
const showMore = ref(false)

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

const currency = computed(() => workspace.value.currency)
const setupStores = computed(() => workspace.value.stores.filter((store) => workspace.value.setupNeeded.includes(store.storeId)))
const checklist = computed(() => workspace.value.checklist.filter((item) => !doneIds.value.includes(item.campaignId)))
const lessonOfDay = computed(() => LESSON_IDS[new Date().getDate() % LESSON_IDS.length])
const hasData = computed(() => workspace.value.diagnoses.length > 0)
const account = computed(() => aggregateAccount(workspace.value.diagnoses))
const moneyShort = (value: number) => money(value, currency.value)
const roiShort = (value: number) => value.toFixed(2)
const compactMoney = (value: number) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.value || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
  } catch {
    return String(Math.round(value))
  }
}

// ---- beginner mode ----
const setupDone = computed(() => props.connected && hasData.value && !setupStores.value.length)
const stepsDone = computed(() => [props.connected, hasData.value, props.connected && hasData.value && !setupStores.value.length].filter(Boolean).length)
const simpleTiles = computed(() => {
  const s = workspace.value.summary
  const a = account.value
  return [
    {
      key: 'profit',
      label: t('gmvV2.simple.kpi.profit'),
      value: s.profit7d === null ? t('gmvV2.today.needMargin') : money(s.profit7d, currency.value),
      hint: s.profit7d === null ? t('gmvV2.simple.kpi.profitMissing') : t('gmvV2.simple.kpi.profitHint'),
      negative: (s.profit7d ?? 0) < 0,
      delta: change(a.current.profit, a.previous.profit),
      better: 'up' as const,
    },
    {
      key: 'spend',
      label: t('gmvV2.simple.kpi.spend'),
      value: money(s.cost7d, currency.value),
      hint: t('gmvV2.simple.kpi.spendHint', { gmv: money(s.grossRevenue7d, currency.value) }),
      negative: false,
      delta: change(a.current.cost, a.previous.cost),
      better: 'none' as const,
    },
    {
      key: 'roi',
      label: t('gmvV2.simple.kpi.roi'),
      value: s.roi7d === null ? '—' : s.roi7d.toFixed(2),
      hint: a.breakEvenRoi ? t('gmvV2.simple.kpi.roiHint', { value: a.breakEvenRoi.toFixed(2) }) : t('gmvV2.simple.kpi.roiNoMargin'),
      negative: !!(a.breakEvenRoi && s.roi7d !== null && s.roi7d < a.breakEvenRoi),
      delta: change(a.current.roi, a.previous.roi),
      better: 'up' as const,
    },
  ]
})

const statusRows = computed(() => {
  const total = Math.max(1, workspace.value.diagnoses.length)
  return CODE_ORDER.filter((code) => workspace.value.summary.counts[code] > 0).map((code) => ({
    code,
    count: workspace.value.summary.counts[code],
    share: workspace.value.summary.counts[code] / total,
  }))
})

type Tile = { key: string; label: string; value: string; delta: number | null; better: 'up' | 'down' | 'none'; series: Array<number | null>; reference?: number | null; note?: string }
const tiles = computed<Tile[]>(() => {
  const a = account.value
  const s = workspace.value.summary
  const margin = a.breakEvenRoi ? 1 / a.breakEvenRoi : null
  return [
    {
      key: 'profit',
      label: t('gmvV2.dash.tiles.profit'),
      value: s.profit7d === null ? t('gmvV2.today.needMargin') : money(s.profit7d, currency.value),
      delta: change(a.current.profit, a.previous.profit),
      better: 'up',
      series: margin !== null ? a.grossRevenue.map((gmv, index) => Math.round((gmv * margin - a.cost[index]) * 100) / 100) : [],
      note: s.profit7d !== null ? t('gmvV2.dash.estimated') : undefined,
    },
    { key: 'gmv', label: t('gmvV2.dash.tiles.gmv'), value: money(s.grossRevenue7d, currency.value), delta: change(a.current.grossRevenue, a.previous.grossRevenue), better: 'up', series: a.grossRevenue },
    { key: 'spend', label: t('gmvV2.dash.tiles.spend'), value: money(s.cost7d, currency.value), delta: change(a.current.cost, a.previous.cost), better: 'none', series: a.cost },
    {
      key: 'roi',
      label: t('gmvV2.dash.tiles.roi'),
      value: roi(s.roi7d),
      delta: change(a.current.roi, a.previous.roi),
      better: 'up',
      series: a.roi,
      reference: a.breakEvenRoi,
      note: a.breakEvenRoi ? t('gmvV2.dash.breakEvenNote', { value: a.breakEvenRoi.toFixed(2) }) : undefined,
    },
    {
      key: 'credit',
      label: t('gmvV2.dash.tiles.credit'),
      value: money(s.yesterdayProtectionCredit, currency.value),
      delta: null,
      better: 'none',
      series: [],
      note: t('gmvV2.dash.creditNote'),
    },
  ]
})

function deltaTone(tile: Tile) {
  if (tile.delta === null || tile.better === 'none' || Math.abs(tile.delta) < 0.005) return 'neutral'
  return (tile.delta > 0) === (tile.better === 'up') ? 'good' : 'critical'
}

async function load() {
  busy.value = true
  error.value = ''
  try {
    workspace.value = (await window.api.tiktokGmvMax.getV2Workspace({ storeId: props.storeId })) as V2Workspace
    for (const store of workspace.value.stores) {
      if (marginDraft.value[store.storeId] === undefined) marginDraft.value[store.storeId] = store.marginPercent !== null ? String(store.marginPercent) : ''
    }
  } catch (cause) {
    error.value = friendlyError(cause)
  } finally {
    busy.value = false
  }
}

async function saveMargin(storeId: string) {
  const value = Number(marginDraft.value[storeId])
  if (!Number.isFinite(value) || value <= 0 || value >= 100) {
    error.value = t('gmvV2.setup.invalid')
    return
  }
  savingMargin.value = true
  try {
    await window.api.tiktokGmvMax.saveV2Settings({ storeId, marginPercent: value })
    await load()
  } catch (cause) {
    error.value = friendlyError(cause)
  } finally {
    savingMargin.value = false
  }
}

async function markDone(item: V2Diagnosis) {
  try {
    await window.api.tiktokGmvMax.recordV2Change({ campaignId: item.campaignId, kind: changeKindFor(item), from: item.action.from, to: item.action.to })
  } catch (cause) {
    error.value = friendlyError(cause)
    return
  }
  doneIds.value = [...doneIds.value, item.campaignId]
  flash.value = t('gmvV2.today.recorded', { name: item.campaignName })
  window.setTimeout(() => (flash.value = ''), 3500)
  await load()
}

async function undo(id: string) {
  try {
    await window.api.tiktokGmvMax.undoV2Change({ id })
  } catch (cause) {
    error.value = friendlyError(cause)
    return
  }
  await load()
}

function askAiForCreatives(item: V2Diagnosis) {
  void ai.open({ fresh: true, send: true, prompt: t('gmvV2.today.aiCreativePrompt', { name: item.campaignName, need: item.params.need || 40 }) })
}

function campaignName(id: string) {
  return workspace.value.diagnoses.find((item) => item.campaignId === id)?.campaignName || id
}

watch(() => props.storeId, () => void load())
watch(() => props.loading, (now, before) => {
  if (before && !now) void load()
})
onMounted(load)
</script>

<template>
  <div class="vg-scope gv-viz dash" :class="{ 'is-refreshing': busy && hasData }" data-testid="gmv-v2-today">
    <div v-if="error" class="vg-notice vg-notice--danger" data-testid="gmv-v2-error">{{ error }}</div>
    <div v-if="flash" class="vg-notice vg-notice--accent">{{ flash }}</div>

    <section v-if="!simple && !connected && !hasData" class="vg-card dash-empty">
      <div class="vg-empty">
        <span class="vg-empty__icon"><ShieldCheck :size="24" /></span>
        <h3>{{ t('gmvV2.today.connectTitle') }}</h3>
        <p>{{ t('gmvV2.today.connectDesc') }}</p>
      </div>
    </section>

    <!-- One-time setup: margin -->
    <section v-if="!simple && setupStores.length" class="vg-card dash-setup" data-testid="gmv-v2-setup">
      <div class="dash-setup__copy">
        <span class="dash-setup__icon"><Percent :size="18" /></span>
        <div>
          <strong>{{ t('gmvV2.setup.title') }}</strong>
          <p>{{ t('gmvV2.setup.desc') }}</p>
        </div>
      </div>
      <div v-for="store in setupStores" :key="store.storeId" class="dash-setup__row">
        <span class="dash-setup__store">{{ store.storeName }}</span>
        <label class="dash-setup__input">
          <input v-model="marginDraft[store.storeId]" class="vg-input" type="number" min="1" max="99" step="1" :placeholder="t('gmvV2.setup.placeholder')" data-testid="gmv-v2-margin-input" />
          <span>%</span>
        </label>
        <span class="dash-setup__hint">{{ marginDraft[store.storeId] && Number(marginDraft[store.storeId]) > 0 ? t('gmvV2.setup.breakEvenPreview', { roi: (100 / Number(marginDraft[store.storeId])).toFixed(2) }) : '' }}</span>
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="savingMargin" data-testid="gmv-v2-margin-save" @click="saveMargin(store.storeId)">{{ t('common.save') }}</button>
        <button type="button" class="vg-link dash-setup__how" @click="lesson = 'break_even'"><BookOpen :size="13" /> {{ t('gmvV2.setup.how') }}</button>
      </div>
    </section>

    <!-- Beginner: three steps to get started -->
    <section v-if="simple && !setupDone" class="vg-card sim-start" data-testid="gmv-v2-start">
      <header class="sim-start__head">
        <div>
          <h3>{{ t('gmvV2.simple.start.title') }}</h3>
          <p>{{ t('gmvV2.simple.start.desc') }}</p>
        </div>
        <span class="sim-start__count">{{ t('gmvV2.simple.start.progress', { done: stepsDone }) }}</span>
      </header>
      <ol class="sim-start__steps">
        <li :class="{ 'is-done': connected, 'is-current': !connected }">
          <span class="sim-start__mark"><CheckCircle2 v-if="connected" :size="18" /><b v-else>1</b></span>
          <div>
            <strong>{{ t('gmvV2.simple.start.connect') }}</strong>
            <p>{{ connected ? t('gmvV2.simple.start.connectDone') : t('gmvV2.simple.start.connectDesc') }}</p>
          </div>
          <button v-if="!connected" type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="emit('connect')"><Link2 :size="14" /> {{ t('gmvV2.simple.start.connectBtn') }}</button>
        </li>
        <li :class="{ 'is-done': hasData, 'is-current': connected && !hasData, 'is-locked': !connected }">
          <span class="sim-start__mark"><CheckCircle2 v-if="hasData" :size="18" /><b v-else>2</b></span>
          <div>
            <strong>{{ t('gmvV2.simple.start.sync') }}</strong>
            <p>{{ hasData ? t('gmvV2.simple.start.syncDone') : t('gmvV2.simple.start.syncDesc') }}</p>
          </div>
          <button v-if="connected && !hasData" type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="busy || loading" @click="emit('sync')"><RefreshCw :size="14" /> {{ t('gmvV2.today.syncNow') }}</button>
        </li>
        <li :class="{ 'is-done': connected && hasData && !setupStores.length, 'is-current': hasData && setupStores.length > 0, 'is-locked': !hasData }" :data-testid="setupStores.length ? 'gmv-v2-setup' : undefined">
          <span class="sim-start__mark"><b>3</b></span>
          <div class="sim-start__body">
            <strong>{{ t('gmvV2.simple.start.margin') }}</strong>
            <p>{{ t('gmvV2.simple.start.marginDesc') }}</p>
            <div v-for="store in setupStores" :key="store.storeId" class="sim-start__margin">
              <span class="sim-start__store">{{ store.storeName }}</span>
              <label class="dash-setup__input">
                <input v-model="marginDraft[store.storeId]" class="vg-input" type="number" min="1" max="99" step="1" :placeholder="t('gmvV2.setup.placeholder')" data-testid="gmv-v2-margin-input" />
                <span>%</span>
              </label>
              <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="savingMargin" data-testid="gmv-v2-margin-save" @click="saveMargin(store.storeId)">{{ t('common.save') }}</button>
              <small class="sim-start__preview">{{ marginDraft[store.storeId] && Number(marginDraft[store.storeId]) > 0 ? t('gmvV2.simple.start.marginPreview', { roi: (100 / Number(marginDraft[store.storeId])).toFixed(2) }) : t('gmvV2.simple.start.marginExample') }}</small>
            </div>
          </div>
        </li>
      </ol>
    </section>

    <template v-if="hasData">
      <!-- Beginner: three plain numbers -->
      <section v-if="simple" class="sim-kpis" :aria-label="t('gmvV2.dash.kpiAria')">
        <article v-for="tile in simpleTiles" :key="tile.key" class="sim-kpi" :data-testid="`gmv-v2-tile-${tile.key}`">
          <span class="sim-kpi__label">{{ tile.label }}</span>
          <strong :class="{ 'is-negative': tile.negative }">{{ tile.value }}</strong>
          <small>{{ tile.hint }}</small>
          <span v-if="tile.delta !== null && Math.abs(tile.delta) >= 0.005" class="dash-delta" :class="`gvt-${tile.better === 'none' ? 'neutral' : (tile.delta > 0) === (tile.better === 'up') ? 'good' : 'critical'}`">
            <ArrowUpRight v-if="tile.delta > 0" :size="13" /><ArrowDownRight v-else :size="13" />
            {{ t('gmvV2.simple.kpi.vsLastWeek', { value: percent(Math.abs(tile.delta)) }) }}
          </span>
        </article>
      </section>

      <!-- Beginner: today's jobs, each with click-by-click steps -->
      <section v-if="simple" class="vg-card sim-tasks">
        <header class="sim-tasks__head">
          <h3>{{ checklist.length ? t('gmvV2.simple.tasks.title', { count: checklist.length }) : t('gmvV2.today.allGood') }}</h3>
          <p>{{ checklist.length ? t('gmvV2.simple.tasks.hint') : t('gmvV2.today.allGoodHint') }}</p>
        </header>
        <article v-for="(item, index) in checklist" :key="item.campaignId" class="sim-task" data-testid="gmv-v2-task">
          <div class="sim-task__head">
            <span class="sim-task__num">{{ index + 1 }}</span>
            <div class="sim-task__title">
              <strong>{{ item.campaignName }}</strong>
              <span class="dash-status" :class="`gvt-${CODE_STATUS[item.code]}`"><component :is="STATUS_ICON[item.code]" :size="14" /> {{ headline(item) }}</span>
            </div>
            <span v-if="item.impactPerDay > 0" class="sim-task__impact">{{ t('gmvV2.simple.tasks.impact', { value: money(item.impactPerDay, currency) }) }}</span>
          </div>
          <p class="sim-task__why"><b>{{ t('gmvV2.simple.tasks.whyLabel') }}</b>{{ reason(item) }}</p>
          <div class="sim-task__do">
            <b>{{ t('gmvV2.simple.tasks.doLabel') }}</b>
            <span>{{ actionText(item, currency) }}<em v-if="timingText(item)"> · {{ timingText(item) }}</em></span>
          </div>
          <ol v-if="stepsFor(item).length" class="sim-task__steps">
            <li v-for="(step, stepIndex) in stepsFor(item)" :key="stepIndex">{{ step }}</li>
          </ol>
          <p v-if="item.protection.note" class="dash-protect"><ShieldCheck :size="13" /> {{ t(`gmvV2.protection.${item.protection.note}`) }}</p>
          <div class="sim-task__actions">
            <button v-if="item.action.kind !== 'none'" type="button" class="vg-btn vg-btn--primary vg-btn--sm" data-testid="gmv-v2-done" @click="markDone(item)"><CheckCircle2 :size="14" /> {{ t('gmvV2.simple.tasks.done') }}</button>
            <button type="button" class="vg-btn vg-btn--sm" @click="openTikTokAdsManager"><ExternalLink :size="14" /> {{ t('gmvV2.today.openTikTok') }}</button>
            <button v-if="item.action.kind === 'fix_creatives'" type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="askAiForCreatives(item)"><Wand2 :size="14" /> {{ t('gmvV2.today.aiCreatives') }}</button>
            <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="lesson = item.lessonId"><CircleHelp :size="14" /> {{ t('gmvV2.simple.tasks.learn') }}</button>
          </div>
        </article>
        <div v-if="!checklist.length" class="dash-allgood">
          <CheckCircle2 :size="18" />
          <div><strong>{{ t('gmvV2.today.allGood') }}</strong></div>
        </div>
      </section>

      <button v-if="simple" type="button" class="vg-btn vg-btn--sm vg-btn--ghost sim-more" :aria-expanded="showMore" @click="showMore = !showMore">
        <ChevronDown v-if="showMore" :size="14" /><ChevronRight v-else :size="14" /> {{ showMore ? t('gmvV2.simple.lessData') : t('gmvV2.simple.moreData') }}
      </button>

      <!-- KPI tiles -->
      <section v-if="!simple" class="dash-tiles" :aria-label="t('gmvV2.dash.kpiAria')">
        <article v-for="tile in tiles" :key="tile.key" class="dash-tile" :data-testid="`gmv-v2-tile-${tile.key}`">
          <span class="dash-tile__label">{{ tile.label }}</span>
          <span class="dash-tile__value" :class="{ 'is-negative': tile.key === 'profit' && (workspace.summary.profit7d ?? 0) < 0 }">{{ tile.value }}</span>
          <div class="dash-tile__foot">
            <span v-if="tile.delta !== null" class="dash-delta" :class="`gvt-${deltaTone(tile)}`">
              <Minus v-if="Math.abs(tile.delta) < 0.005" :size="13" /><ArrowUpRight v-else-if="tile.delta > 0" :size="13" /><ArrowDownRight v-else :size="13" />
              <b>{{ percent(Math.abs(tile.delta)) }}</b>
              <small>{{ t('gmvV2.dash.vsPrev') }}</small>
            </span>
            <small v-else-if="tile.note" class="dash-tile__note">{{ tile.note }}</small>
            <GmvV2Sparkline v-if="tile.series.length > 1" :values="tile.series" :reference="tile.reference" :label="t('gmvV2.dash.sparkAria', { name: tile.label })" fluid :height="30" />
          </div>
          <small v-if="tile.delta !== null && tile.note" class="dash-tile__note">{{ tile.note }}</small>
        </article>
      </section>

      <div class="dash-grid">
        <!-- Must-do table -->
        <section v-if="!simple" class="vg-card dash-card dash-card--wide">
          <header class="dash-card__head">
            <div>
              <h3>{{ t('gmvV2.today.mustDo') }}</h3>
              <p>{{ t('gmvV2.today.mustDoHint') }}</p>
            </div>
            <span class="dash-count">{{ checklist.length }}</span>
          </header>
          <div v-if="checklist.length" class="dash-table" role="table">
            <div class="dash-table__head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">{{ t('gmvV2.dash.cols.status') }}</span>
              <span role="columnheader">{{ t('gmvV2.dash.cols.campaign') }}</span>
              <span role="columnheader">{{ t('gmvV2.dash.cols.action') }}</span>
              <span role="columnheader" class="is-num">{{ t('gmvV2.dash.cols.impact') }}</span>
              <span role="columnheader"></span>
            </div>
            <template v-for="(item, index) in checklist" :key="item.campaignId">
              <div class="dash-table__row" role="row" :class="{ 'is-open': expanded === item.campaignId }" data-testid="gmv-v2-task" @click="expanded = expanded === item.campaignId ? null : item.campaignId">
                <span class="dash-rank">{{ index + 1 }}</span>
                <span class="dash-status" :class="`gvt-${CODE_STATUS[item.code]}`"><component :is="STATUS_ICON[item.code]" :size="14" /> {{ headline(item) }}</span>
                <span class="dash-name vg-ellipsis">{{ item.campaignName }}</span>
                <span class="dash-action">
                  <strong>{{ actionText(item, currency) }}</strong>
                  <small v-if="timingText(item)">{{ timingText(item) }}</small>
                </span>
                <span class="is-num dash-impact">{{ item.impactPerDay > 0 ? t('gmvV2.dash.perDay', { value: money(item.impactPerDay, currency) }) : '—' }}</span>
                <span class="dash-row-actions" @click.stop>
                  <button v-if="item.action.kind !== 'none'" type="button" class="vg-btn vg-btn--xs vg-btn--primary" data-testid="gmv-v2-done" @click="markDone(item)"><CheckCircle2 :size="13" /> {{ t('gmvV2.today.done') }}</button>
                  <button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="t('gmvV2.today.why')" :title="t('gmvV2.today.why')" @click="lesson = item.lessonId"><BookOpen :size="14" /></button>
                  <button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="t('gmvV2.dash.details')" :aria-expanded="expanded === item.campaignId" @click="expanded = expanded === item.campaignId ? null : item.campaignId">
                    <ChevronDown v-if="expanded === item.campaignId" :size="15" /><ChevronRight v-else :size="15" />
                  </button>
                </span>
              </div>
              <div v-if="expanded === item.campaignId" class="dash-table__detail">
                <p>{{ reason(item) }}</p>
                <p v-if="item.protection.note" class="dash-protect"><ShieldCheck :size="13" /> {{ t(`gmvV2.protection.${item.protection.note}`) }}</p>
                <dl class="dash-kv">
                  <div><dt>{{ t('gmvV2.lines.actual') }}</dt><dd>{{ roi(item.lines.actualRoi7d) }}</dd></div>
                  <div><dt>{{ t('gmvV2.lines.target') }}</dt><dd>{{ roi(item.lines.targetRoi) }}</dd></div>
                  <div><dt>{{ t('gmvV2.lines.breakEven') }}</dt><dd>{{ roi(item.lines.breakEvenRoi) }}</dd></div>
                  <div><dt>{{ t('gmvV2.campaigns.cols.utilization') }}</dt><dd>{{ percent(item.window.avgUtilization) }}</dd></div>
                  <div><dt>{{ t('gmvV2.campaigns.cols.spend') }}</dt><dd>{{ money(item.window.cost, currency) }}</dd></div>
                </dl>
                <div class="dash-detail-actions">
                  <button v-if="item.action.kind === 'fix_creatives'" type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="askAiForCreatives(item)"><Wand2 :size="14" /> {{ t('gmvV2.today.aiCreatives') }}</button>
                  <button type="button" class="vg-btn vg-btn--sm" @click="openTikTokAdsManager"><ExternalLink :size="14" /> {{ t('gmvV2.today.openTikTok') }}</button>
                </div>
              </div>
            </template>
          </div>
          <div v-else class="dash-allgood">
            <CheckCircle2 :size="18" />
            <div>
              <strong>{{ t('gmvV2.today.allGood') }}</strong>
              <p>{{ t('gmvV2.today.allGoodHint') }}</p>
            </div>
          </div>
        </section>

        <!-- Status distribution -->
        <section v-if="!simple" class="vg-card dash-card dash-card--side">
          <header class="dash-card__head">
            <div>
              <h3>{{ t('gmvV2.dash.statusTitle') }}</h3>
              <p>{{ t('gmvV2.dash.statusHint', { count: workspace.diagnoses.length }) }}</p>
            </div>
          </header>
          <ul class="dash-statuslist">
            <li v-for="row in statusRows" :key="row.code">
              <button type="button" class="dash-statusrow" :aria-label="`${t(`gmvV2.codes.${row.code}.short`)} ${row.count}`" @click="emit('open-campaigns', row.code)">
                <span class="dash-status" :class="`gvt-${CODE_STATUS[row.code]}`"><component :is="STATUS_ICON[row.code]" :size="14" /> {{ t(`gmvV2.codes.${row.code}.short`) }}</span>
                <span class="dash-statusrow__bar"><i :class="`gvt-${CODE_STATUS[row.code]}`" :style="{ width: `${Math.max(4, row.share * 100)}%` }"></i></span>
                <b>{{ row.count }}</b>
              </button>
            </li>
          </ul>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost dash-viewall" @click="emit('open-campaigns')">{{ t('gmvV2.dash.viewAll') }} <ChevronRight :size="14" /></button>
        </section>

        <!-- Trend charts -->
        <section v-if="!simple || showMore" class="vg-card dash-card">
          <header class="dash-card__head">
            <div>
              <h3>{{ t('gmvV2.dash.trendTitle') }}</h3>
              <p>{{ t('gmvV2.dash.trendHint') }}</p>
            </div>
          </header>
          <GmvV2LineChart
            :dates="account.dates"
            :series="[
              { key: 'gmv', label: t('gmvV2.dash.tiles.gmv'), color: 'series-1', values: account.grossRevenue },
              { key: 'cost', label: t('gmvV2.dash.tiles.spend'), color: 'series-2', values: account.cost },
            ]"
            :format="moneyShort"
            :axis-format="compactMoney"
            :aria-label="t('gmvV2.dash.trendAria')"
          />
        </section>
        <section v-if="!simple || showMore" class="vg-card dash-card">
          <header class="dash-card__head">
            <div>
              <h3>{{ t('gmvV2.dash.roiTitle') }}</h3>
              <p>{{ t('gmvV2.dash.roiHint') }}</p>
            </div>
          </header>
          <GmvV2LineChart
            :dates="account.dates"
            :series="[{ key: 'roi', label: t('gmvV2.dash.tiles.roi'), color: 'series-1', values: account.roi }]"
            :ref-lines="[
              ...(account.targetRoi ? [{ label: t('gmvV2.lines.target'), value: account.targetRoi, tone: 'neutral' as const }] : []),
              ...(account.breakEvenRoi ? [{ label: t('gmvV2.lines.breakEven'), value: account.breakEvenRoi, tone: 'critical' as const }] : []),
            ]"
            :format="roiShort"
            :aria-label="t('gmvV2.dash.roiAria')"
          />
        </section>

        <!-- Observing -->
        <section class="vg-card dash-card">
          <header class="dash-card__head">
            <div>
              <h3><Hourglass :size="15" /> {{ t('gmvV2.today.observing') }}</h3>
            </div>
          </header>
          <div v-if="workspace.observing.length" class="dash-observe">
            <div v-for="item in workspace.observing" :key="item.campaignId" class="dash-observe__row">
              <span class="vg-ellipsis">{{ item.campaignName }}</span>
              <small>{{ t(`gmvV2.changeKinds.${item.learning.changeKind || 'other'}`) }}</small>
              <span class="dash-status gvt-neutral"><Clock3 :size="13" /> {{ t('gmvV2.today.daysLeft', { days: item.learning.daysLeft }) }}</span>
            </div>
          </div>
          <p v-else class="dash-muted">{{ t('gmvV2.today.noObserving') }}</p>
          <div v-if="workspace.recentChanges.length" class="dash-changes">
            <h4>{{ t('gmvV2.today.recentChanges') }}</h4>
            <div v-for="item in workspace.recentChanges.slice(0, 4)" :key="item.id" class="dash-change">
              <span class="vg-ellipsis">{{ campaignName(item.campaignId) }} · {{ t(`gmvV2.changeKinds.${item.kind}`) }}<template v-if="item.to !== undefined"> → {{ item.to }}</template></span>
              <small>{{ new Date(item.at).toLocaleString() }}</small>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('gmvV2.today.undo')" @click="undo(item.id)"><Undo2 :size="13" /></button>
            </div>
          </div>
        </section>

        <!-- Lesson of the day -->
        <section class="vg-card dash-card dash-learn">
          <header class="dash-card__head">
            <div><h3><GraduationCap :size="15" /> {{ t('gmvV2.today.lessonOfDay') }}</h3></div>
          </header>
          <strong>{{ t(`gmvV2.lessons.${lessonOfDay}.title`) }}</strong>
          <p>{{ t(`gmvV2.lessons.${lessonOfDay}.oneLine`) }}</p>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="lesson = lessonOfDay"><Lightbulb :size="14" /> {{ t('gmvV2.today.learnMore') }}</button>
        </section>
      </div>
    </template>

    <section v-if="!simple && !hasData && connected && !busy" class="vg-card dash-empty">
      <div class="vg-empty">
        <span class="vg-empty__icon"><Loader2 :size="24" /></span>
        <h3>{{ t('gmvV2.today.noDataTitle') }}</h3>
        <p>{{ t('gmvV2.today.noDataDesc') }}</p>
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="emit('sync')">{{ t('gmvV2.today.syncNow') }}</button>
      </div>
    </section>

    <GmvV2Lesson :lesson-id="lesson" @close="lesson = null" />
  </div>
</template>

<style scoped>
.dash { display: flex; flex-direction: column; gap: 14px; transition: opacity .2s; container-type: inline-size; }
.dash.is-refreshing { opacity: .6; }
.dash-empty { padding: 28px 0; }
.dash-muted { margin: 0; font-size: 12.5px; color: var(--text-muted); }

/* setup */
.dash-setup { display: flex; flex-direction: column; gap: 10px; border-color: color-mix(in srgb, var(--status-warning) 45%, var(--theme-border)); }
.dash-setup__copy { display: flex; gap: 12px; align-items: flex-start; }
.dash-setup__copy p { margin: 4px 0 0; font-size: 12.5px; color: var(--text-secondary); line-height: 1.6; }
.dash-setup__icon { width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--status-warning) 16%, transparent); color: var(--text-primary); }
.dash-setup__row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--grid); }
.dash-setup__store { font-weight: 600; min-width: 120px; }
.dash-setup__input { display: inline-flex; align-items: center; gap: 6px; }
.dash-setup__input .vg-input { width: 90px; }
.dash-setup__hint { font-size: 12.5px; color: var(--text-secondary); min-width: 150px; }
.dash-setup__how { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; }

/* KPI tiles */
.dash-tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
@container (max-width: 800px) { .dash-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (max-width: 600px) { .dash-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.dash-tile { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 12px 14px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--surface-1); }
.dash-tile__label { font-size: 12.5px; color: var(--text-secondary); }
.dash-tile__value { font-size: 22px; font-weight: 700; letter-spacing: -.01em; color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dash-tile__value.is-negative { color: var(--text-primary); }
.dash-tile__value.is-negative::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--status-critical); vertical-align: middle; }
.dash-tile__foot { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.dash-tile__foot .dash-delta, .dash-tile__foot .dash-tile__note { min-height: 18px; }
.dash-tile__note { font-size: 11.5px; color: var(--text-muted); }
.dash-delta { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
.dash-delta b { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.dash-delta small { color: var(--text-muted); }
.dash-delta svg { color: var(--status-neutral); }
.dash-delta.gvt-good svg { color: var(--status-good); }
.dash-delta.gvt-critical svg { color: var(--status-critical); }

/* layout */
.dash-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }
.dash-grid > .dash-card { grid-column: span 3; }
.dash-grid > .dash-card--wide { grid-column: span 4; }
.dash-grid > .dash-card--side { grid-column: span 2; }
.dash-card { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dash-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dash-card__head h3 { margin: 0; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; color: var(--text-primary); }
.dash-card__head p { margin: 3px 0 0; font-size: 12px; color: var(--text-muted); }
.dash-count { min-width: 26px; height: 22px; padding: 0 8px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: var(--theme-panel-soft); font-size: 12px; font-weight: 700; color: var(--text-primary); }

/* status pill: icon carries the status colour, text stays in text tokens */
.dash-status { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text-primary); white-space: nowrap; }
.dash-status svg { flex-shrink: 0; }
.dash-status.gvt-critical svg { color: var(--status-critical); }
.dash-status.gvt-serious svg { color: var(--status-serious); }
.dash-status.gvt-warning svg { color: var(--status-warning); }
.dash-status.gvt-good svg { color: var(--status-good); }
.dash-status.gvt-neutral svg { color: var(--status-neutral); }

/* must-do table */
.dash-table { display: flex; flex-direction: column; }
.dash-table__head, .dash-table__row { display: grid; grid-template-columns: 26px minmax(96px, auto) minmax(90px, 1fr) minmax(160px, 2fr) 92px auto; gap: 10px; align-items: center; padding: 9px 4px; }
.dash-table__head { font-size: 11.5px; color: var(--text-muted); border-bottom: 1px solid var(--grid); }
.dash-table__row { border-bottom: 1px solid var(--grid); font-size: 13px; cursor: pointer; }
.dash-table__row:hover, .dash-table__row.is-open { background: color-mix(in srgb, var(--text-primary) 3%, transparent); }
.is-num { text-align: right; font-variant-numeric: tabular-nums; }
.dash-rank { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--theme-panel-soft); font-size: 11.5px; font-weight: 700; color: var(--text-primary); }
.dash-name { font-weight: 600; color: var(--text-primary); }
.dash-action { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dash-action strong { font-weight: 600; color: var(--text-primary); }
.dash-action small { font-size: 11.5px; color: var(--text-muted); }
.dash-impact { color: var(--text-secondary); font-size: 12.5px; }
.dash-row-actions { display: inline-flex; align-items: center; gap: 4px; justify-content: flex-end; }
.dash-table__detail { padding: 10px 4px 14px 40px; border-bottom: 1px solid var(--grid); display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; }
.dash-table__detail p { margin: 0; color: var(--text-secondary); line-height: 1.6; }
.dash-protect { display: flex; gap: 6px; align-items: flex-start; }
.dash-protect svg { color: var(--status-warning); flex-shrink: 0; margin-top: 2px; }
.dash-kv { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 0; }
.dash-kv div { display: flex; flex-direction: column; gap: 1px; }
.dash-kv dt { font-size: 11px; color: var(--text-muted); }
.dash-kv dd { margin: 0; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.dash-detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dash-allgood { display: flex; gap: 10px; align-items: center; padding: 12px 4px; }
.dash-allgood svg { color: var(--status-good); flex-shrink: 0; }
.dash-allgood p { margin: 2px 0 0; font-size: 12.5px; color: var(--text-secondary); }

/* status distribution */
.dash-statuslist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dash-statusrow { width: 100%; display: grid; grid-template-columns: 110px minmax(0, 1fr) 32px; align-items: center; gap: 10px; padding: 8px 6px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; text-align: left; }
.dash-statusrow:hover { background: color-mix(in srgb, var(--text-primary) 4%, transparent); }
.dash-statusrow b { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.dash-statusrow__bar { height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--text-primary) 6%, transparent); overflow: hidden; }
.dash-statusrow__bar i { display: block; height: 100%; border-radius: 999px; background: var(--status-neutral); }
.dash-statusrow__bar i.gvt-critical { background: var(--status-critical); }
.dash-statusrow__bar i.gvt-serious { background: var(--status-serious); }
.dash-statusrow__bar i.gvt-warning { background: var(--status-warning); }
.dash-statusrow__bar i.gvt-good { background: var(--status-good); }
.dash-viewall { align-self: flex-start; }

/* observing + lesson */
.dash-observe { display: flex; flex-direction: column; }
.dash-observe__row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--grid); font-size: 13px; }
.dash-observe__row small { color: var(--text-muted); font-size: 12px; }
.dash-changes h4 { margin: 4px 0 6px; font-size: 12px; color: var(--text-secondary); }
.dash-change { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; font-size: 12.5px; padding: 2px 0; }
.dash-change small { color: var(--text-muted); }
.dash-learn strong { font-size: 13.5px; }
.dash-learn p { margin: 0; font-size: 12.5px; color: var(--text-secondary); line-height: 1.6; }
.dash-learn .vg-btn { align-self: flex-start; }

/* ---- beginner mode ---- */
.sim-start { display: flex; flex-direction: column; gap: 14px; }
.sim-start__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sim-start__head h3 { margin: 0; font-size: 16px; color: var(--text-primary); }
.sim-start__head p { margin: 4px 0 0; font-size: 13px; color: var(--text-secondary); }
.sim-start__count { flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
.sim-start__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.sim-start__steps > li { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; border: 1px solid var(--grid); border-radius: 10px; }
.sim-start__steps > li.is-current { border-color: color-mix(in srgb, var(--theme-accent) 55%, var(--grid)); background: color-mix(in srgb, var(--theme-accent) 6%, transparent); }
.sim-start__steps > li.is-locked { opacity: .55; }
.sim-start__steps strong { font-size: 14px; color: var(--text-primary); }
.sim-start__steps p { margin: 3px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--text-secondary); }
.sim-start__mark { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-primary); font-size: 13px; }
.is-done .sim-start__mark { background: transparent; color: var(--status-good); }
.is-current .sim-start__mark { background: var(--theme-accent); color: var(--theme-on-accent); }
.sim-start__body { display: flex; flex-direction: column; gap: 6px; }
.sim-start__margin { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
.sim-start__store { font-weight: 600; font-size: 13px; min-width: 100px; }
.sim-start__preview { font-size: 12px; color: var(--text-muted); }
.sim-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.sim-kpi { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--surface-1); min-width: 0; }
.sim-kpi__label { font-size: 13.5px; font-weight: 600; color: var(--text-secondary); }
.sim-kpi strong { font-size: 28px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.sim-kpi strong.is-negative::before { content: ''; display: inline-block; width: 9px; height: 9px; margin-right: 8px; border-radius: 50%; background: var(--status-critical); vertical-align: middle; }
.sim-kpi small { font-size: 12.5px; line-height: 1.5; color: var(--text-muted); }
.sim-kpi .dash-delta { align-self: flex-start; }
.sim-tasks { display: flex; flex-direction: column; gap: 12px; }
.sim-tasks__head h3 { margin: 0; font-size: 16px; color: var(--text-primary); }
.sim-tasks__head p { margin: 4px 0 0; font-size: 13px; color: var(--text-secondary); }
.sim-task { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--grid); border-radius: 10px; }
.sim-task__head { display: flex; align-items: center; gap: 12px; }
.sim-task__num { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--series-1); color: #fff; font-size: 13px; font-weight: 700; }
.sim-task__title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; flex: 1; }
.sim-task__title strong { font-size: 15px; color: var(--text-primary); }
.sim-task__impact { flex-shrink: 0; font-size: 12.5px; color: var(--text-secondary); }
.sim-task__why { margin: 0; font-size: 13px; line-height: 1.65; color: var(--text-secondary); }
.sim-task__why b, .sim-task__do b { margin-right: 6px; color: var(--text-primary); }
.sim-task__do { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--series-1) 9%, transparent); font-size: 14px; }
.sim-task__do span { font-weight: 600; color: var(--text-primary); }
.sim-task__do em { font-style: normal; font-weight: 400; font-size: 12.5px; color: var(--text-secondary); }
.sim-task__steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
.sim-task__steps li::marker { color: var(--text-muted); font-weight: 600; }
.sim-task__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.sim-more { align-self: flex-start; }
@container (max-width: 700px) {
  .sim-kpis { grid-template-columns: minmax(0, 1fr); }
  .sim-start__steps > li { grid-template-columns: 34px minmax(0, 1fr); }
  .sim-start__steps > li > .vg-btn { grid-column: 2; justify-self: start; }
}

@container (max-width: 1080px) {
  .dash-grid > .dash-card--wide, .dash-grid > .dash-card--side { grid-column: span 6; }
}
@container (max-width: 760px) {
  .dash-grid > .dash-card { grid-column: span 6; }
  .dash-table__head { display: none; }
  .dash-table__row { grid-template-columns: 26px minmax(0, 1fr) auto; }
  .dash-table__row > .dash-name, .dash-table__row > .dash-impact { display: none; }
  .dash-table__row > .dash-action { grid-column: 2 / 4; grid-row: 2; }
}

.sim-task__steps { list-style: none !important; padding-left: 0 !important; counter-reset: gvstep; }
.sim-task__steps li { position: relative; padding-left: 28px; counter-increment: gvstep; }
.sim-task__steps li::before { content: counter(gvstep); position: absolute; left: 0; top: 2px; width: 19px; height: 19px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--text-primary) 10%, transparent); color: var(--text-primary); font-size: 11px; font-weight: 700; }
</style>
