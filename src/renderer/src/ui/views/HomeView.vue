<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  BarChart3,
  Captions,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Clapperboard,
  ClipboardList,
  Download,
  Eye,
  FolderPlus,
  Images,
  Infinity as InfinityIcon,
  Inbox,
  Layers,
  LayoutGrid,
  LineChart,
  Loader2,
  Music2,
  Package,
  Rocket,
  Scissors,
  Search,
  SendHorizontal,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  Wand2,
  XCircle,
  AlertTriangle,
  CheckCircle,
  ShoppingCart,
} from 'lucide-vue-next'
import heroImage from '@/assets/home-hero.png'
import { thumbnailUrl } from '@/lib/localMedia'
import { useAiProducerStore } from '@/stores/aiProducer'
import AutopilotDailyPanel from '../components/ai/AutopilotDailyPanel.vue'
import TrendChart from '../components/home/TrendChart.vue'
import { formatKpi, kpiDeltaText, kpiDeltaTone } from '@/lib/overviewFormat'
import type { AdsTotals, OverviewKpi, OverviewReport, OverviewSignal, OverviewTrend } from '../../../../shared/overviewReport'

type BriefItem = { kind: string; level: 'ok' | 'warning' | 'error'; title: string; detail: string; route?: string; aiPrompt?: string; count?: number }
type Brief = { headline: string; summary?: string; items: BriefItem[]; createdAt: number }
type Project = { ref: string; line: string; title: string; productName?: string; status: string; stage?: string; progress?: number; readyCount: number; failedCount: number; route: string; previewPath?: string; updatedAt: number }

const { t, locale } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()

const brief = ref<Brief | null>(null)
const projects = ref<Project[]>([])
const overview = ref<OverviewReport | null>(null)
const loading = ref(false)
let unsubscribe: (() => void) | null = null

// ── KPI strip ────────────────────────────────────────────────────────────────
// One colored tile per headline number, in the order of the design.
const KPI_TILES = [
  { key: 'gmv', tone: 'violet', icon: ShoppingBag },
  { key: 'creatorGmv', tone: 'teal', icon: Layers },
  { key: 'roi', tone: 'blue', icon: LineChart },
  { key: 'orders', tone: 'orange', icon: ClipboardList },
  { key: 'produced', tone: 'pink', icon: Music2 },
] as const
const kpiTiles = computed(() => {
  const kpis = overview.value?.kpis.filter((kpi) => kpi.available) || []
  return KPI_TILES.flatMap((tile) => {
    const kpi = kpis.find((item) => item.key === tile.key)
    return kpi ? [{ ...tile, kpi }] : []
  })
})
/** The amount without its currency; the label names the currency. */
function kpiAmount(kpi: OverviewKpi) {
  return formatKpi({ ...kpi, currency: undefined }, locale.value)
}
/** Short form for the "previous period" note under a KPI ("281.9M"), so it never gets cut off. */
function compactAmount(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
/** Signals quote internal ids like "「product-card:1733996111234893594」"; they mean nothing to a reader. */
function readable(text: string | undefined) {
  return (text || '').replace(/[「[]\s*product-card:\d+\s*[」\]]\s*/g, '').replace(/^[\s,，·]+/, '')
}
function deltaArrow(kpi: OverviewKpi) {
  return (kpi.change ?? 0) < 0 ? '▼' : '▲'
}
function deltaText(kpi: OverviewKpi) {
  return kpiDeltaText(kpi, t).replace(/^[+-]/, '')
}

// ── Trend chart ──────────────────────────────────────────────────────────────
type TrendMetric = 'gmv' | 'roi' | 'orders' | 'spend'
const TREND_METRICS: TrendMetric[] = ['gmv', 'roi', 'orders', 'spend']
const trendMetric = ref<TrendMetric>('gmv')
const trendRange = ref<7 | 30>(7)
const trend30 = ref<OverviewTrend | null>(null)
const trendLoading = ref(false)

const activeTrend = computed(() => trendRange.value === 30 ? trend30.value : overview.value?.trend ?? null)

function metricValue(totals: AdsTotals, metric: TrendMetric) {
  if (metric === 'gmv') return totals.revenue
  if (metric === 'spend') return totals.spend
  if (metric === 'orders') return totals.orders
  return totals.spend > 0 ? totals.revenue / totals.spend : 0
}
const trendPoints = computed(() => (activeTrend.value?.days || []).map((day) => ({
  label: day.date.slice(5),
  // A day the ad data has not reached yet is a gap, not a real zero.
  current: day.hasCurrent === false ? null : metricValue(day.current, trendMetric.value),
  previous: day.hasPrevious === false ? null : metricValue(day.previous, trendMetric.value),
})))
const trendHasData = computed(() => trendPoints.value.some((point) => (point.current ?? 0) > 0 || (point.previous ?? 0) > 0))
/** "MM-DD" of the newest synced day, when the data stops before the end of the range. */
const trendSyncedTo = computed(() => {
  const trend = activeTrend.value
  const last = trend?.lastDataDate
  const end = trend?.days[trend.days.length - 1]?.date
  return last && end && last < end ? last.slice(5) : ''
})

function formatTrend(value: number) {
  if (trendMetric.value === 'roi') return value.toFixed(2)
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

watch(trendRange, async (range) => {
  if (range !== 30 || trend30.value) return
  trendLoading.value = true
  try {
    const report = (await window.api.contentHub.overview(30)) as OverviewReport | null
    trend30.value = report?.trend ?? null
  } catch {
    trend30.value = null
  } finally {
    trendLoading.value = false
  }
})

// ── Funnel and risk radar ────────────────────────────────────────────────────
const FUNNEL_ICONS = { produced: Eye, approved: CheckCircle, published: SendHorizontal, orders: ShoppingCart } as const
/** Each step as a share of the first one (orders can be far above 100%: they count the whole shop). */
const funnel = computed(() => {
  const steps = overview.value?.funnel || []
  const first = steps[0]?.value || 0
  return steps.map((step) => ({
    ...step,
    icon: FUNNEL_ICONS[step.key],
    share: first > 0 ? (step.value / first) * 100 : null,
  }))
})
function formatShare(value: number | null) {
  if (value === null) return '—'
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value)}%`
}
const problems = computed(() => overview.value?.problems.slice(0, 3) || [])
const moreProblems = computed(() => Math.max(0, (overview.value?.problems.length || 0) - problems.value.length))
function openSignal(signal: OverviewSignal) {
  void router.push(signal.route || '/insights')
}

// ── Autopilot pipeline ───────────────────────────────────────────────────────
// Stations of the autopilot pipeline; each one opens the workspace where that stage can be done by hand.
const autopilotStages = computed(() => [
  { key: 'research', icon: Search, to: '/product-research' },
  { key: 'product', icon: Package, to: '/products' },
  { key: 'reference', icon: Download, to: '/plugins/video-parser-download' },
  { key: 'video', icon: Clapperboard, to: '/clone' },
  { key: 'review', icon: ShieldCheck, to: '/inbox' },
  { key: 'publish', icon: SendHorizontal, to: '/publish' },
  { key: 'insights', icon: BarChart3, to: '/insights' },
].map((stage) => ({ ...stage, title: t(`ai.home.autopilot.stages.${stage.key}.title`), sub: t(`ai.home.autopilot.stages.${stage.key}.sub`) })))

// ── Bottom row ───────────────────────────────────────────────────────────────
const tools = computed(() => [
  { key: 'parser', to: '/plugins/video-parser-download', icon: Download, tone: 'teal' },
  { key: 'subtitle', to: '/plugins/video-batch-subtitle', icon: Captions, tone: 'indigo' },
  { key: 'materials', to: '/plugins/product-image-materials', icon: Images, tone: 'blue' },
  { key: 'production', to: '/production', icon: Scissors, tone: 'violet' },
  { key: 'creators', to: '/plugins/tiktok-creator-hub', icon: Users, tone: 'violet' },
  { key: 'gmv', to: '/plugins/tiktok-gmv-max-optimizer', icon: BarChart3, tone: 'orange' },
  { key: 'inventory', to: '/plugins/dianxiaomi-inventory', icon: Package, tone: 'blue' },
  { key: 'all', to: '/plugins', icon: LayoutGrid, tone: 'slate' },
].map((tool) => ({ ...tool, title: t(`ai.home.tools.${tool.key}`) })))

const BRIEF_ROWS = 4
const PROJECT_ROWS = 4
const LEVEL_RANK = { error: 0, warning: 1, ok: 2 }
const briefExpanded = ref(false)
const briefItems = computed(() => [...(brief.value?.items || [])].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]))
const shownBriefItems = computed(() => briefExpanded.value ? briefItems.value : briefItems.value.slice(0, BRIEF_ROWS))

// A live-photo batch yields one project per photo; show one row per product and status, opening the newest.
const projectRows = computed(() => {
  const rows = new Map<string, { project: Project; count: number }>()
  for (const project of projects.value) {
    const key = project.line === 'livephoto' && project.productName ? `${project.line}:${project.productName}:${project.status}` : project.ref
    const row = rows.get(key)
    if (row) row.count += 1
    else rows.set(key, { project, count: 1 })
  }
  return [...rows.values()].slice(0, PROJECT_ROWS).map(({ project, count }) => ({
    ...project,
    count,
    title: count > 1 ? project.productName || project.title : project.title,
  }))
})

async function load() {
  loading.value = true
  try {
    const [briefs, recent, report] = await Promise.all([
      window.api.contentHub.latestBriefs(),
      window.api.contentHub.recentProjects(60),
      window.api.contentHub.overview(7).catch(() => null),
    ])
    brief.value = (briefs as { daily: Brief | null }).daily
    projects.value = recent as Project[]
    overview.value = report as OverviewReport | null
    trend30.value = null
    if (trendRange.value === 30) {
      const longer = (await window.api.contentHub.overview(30).catch(() => null)) as OverviewReport | null
      trend30.value = longer?.trend ?? null
    }
  } catch {
    // Home must render even if the hub is unavailable.
  } finally {
    loading.value = false
  }
}

function briefAction(item: BriefItem) {
  if (item.aiPrompt) void ai.open({ fresh: true, prompt: item.aiPrompt, send: true })
  else if (item.route) void router.push(item.route)
}

function formatTime(value: number) {
  return new Date(value).toLocaleString(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  void load()
  unsubscribe = window.api.contentHub.onChanged(() => void load())
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <main class="vg-scope vg-page home" data-testid="home-view">
    <!-- Banner -->
    <section class="home-hero" :style="{ '--hero-image': `url(${heroImage})` }">
      <div class="home-hero__copy">
        <h1><em>AI</em>{{ t('ai.home.platformTitle') }}</h1>
        <p>{{ t('ai.home.platformSub') }}</p>
        <div class="home-hero__actions">
          <button type="button" class="home-hero__primary" data-testid="home-quick-generate" @click="ai.open({ fresh: true })">
            <Wand2 :size="18" /> {{ t('ai.home.quickGenerate') }} <ChevronRight :size="16" />
          </button>
          <button type="button" class="home-hero__secondary" data-testid="home-new-task" @click="router.push('/clone')">
            <FolderPlus :size="16" /> {{ t('ai.home.newTask') }} <ChevronRight :size="15" />
          </button>
        </div>
      </div>
      <div class="home-hero__slogan" aria-hidden="true"><span>{{ t('ai.home.slogan') }}</span><span>{{ t('ai.home.slogan2') }}</span></div>
    </section>

    <!-- KPI strip -->
    <section v-if="kpiTiles.length" class="home-kpis" :style="{ '--kpi-count': kpiTiles.length }" data-testid="home-pulse">
      <button v-for="tile in kpiTiles" :key="tile.key" type="button" class="home-kpi" :class="`home-kpi--${tile.tone}`" @click="router.push(tile.kpi.route)">
        <span class="home-kpi__icon"><component :is="tile.icon" :size="26" /></span>
        <span class="home-kpi__copy">
          <span class="home-kpi__label">{{ t(`ai.insights.overview.kpi.${tile.key}`) }}<template v-if="tile.kpi.currency"> ({{ tile.kpi.currency }})</template></span>
          <strong class="home-kpi__value vg-num" :title="formatKpi(tile.kpi, locale)">{{ kpiAmount(tile.kpi) }}</strong>
          <span class="home-kpi__foot">
            <span v-if="deltaText(tile.kpi)" class="home-kpi__delta vg-num" :class="kpiDeltaTone(tile.kpi) && `home-kpi__delta--${kpiDeltaTone(tile.kpi)}`">{{ deltaArrow(tile.kpi) }} {{ deltaText(tile.kpi) }}</span>
            <span v-if="tile.key === 'gmv' && tile.kpi.previous !== null" class="home-kpi__prev vg-num">{{ t('ai.home.previousShort', { value: compactAmount(tile.kpi.previous) }) }}</span>
          </span>
        </span>
      </button>
    </section>

    <!-- Trend · funnel · radar -->
    <section class="home-row home-row--data">
      <div class="home-panel home-trend">
        <header class="home-panel__head">
          <span class="home-panel__title"><Sparkles :size="18" /> {{ t('ai.home.trend.title') }}</span>
          <div class="home-seg">
            <button v-for="metric in TREND_METRICS" :key="metric" type="button" :class="{ 'is-active': trendMetric === metric }" @click="trendMetric = metric">{{ t(`ai.home.trend.${metric}`) }}</button>
          </div>
          <div class="home-seg home-seg--range">
            <button type="button" :class="{ 'is-active': trendRange === 7 }" @click="trendRange = 7">{{ t('ai.home.trend.range7') }}</button>
            <button type="button" :class="{ 'is-active': trendRange === 30 }" @click="trendRange = 30">{{ t('ai.home.trend.range30') }}</button>
          </div>
        </header>
        <div class="home-trend__chart">
          <TrendChart
            v-if="trendHasData"
            :points="trendPoints"
            :format="formatTrend"
            :current-label="t('ai.home.trend.current', { metric: t(`ai.home.trend.${trendMetric}`) })"
            :previous-label="t('ai.home.trend.previous', { metric: t(`ai.home.trend.${trendMetric}`) })"
            :no-data-label="t('ai.home.trend.noData')"
          />
          <div v-else class="home-trend__empty">
            <Loader2 v-if="loading || trendLoading" :size="18" class="vg-spin" />
            <template v-else><LineChart :size="22" /> {{ t('ai.home.trend.empty') }}</template>
          </div>
        </div>
        <footer v-if="trendHasData" class="home-trend__legend">
          <span><i class="home-trend__swatch"></i>{{ t('ai.home.trend.current', { metric: t(`ai.home.trend.${trendMetric}`) }) }}</span>
          <span><i class="home-trend__swatch home-trend__swatch--prev"></i>{{ t('ai.home.trend.previous', { metric: t(`ai.home.trend.${trendMetric}`) }) }}</span>
          <span v-if="trendSyncedTo" class="home-trend__synced"><Clock3 :size="12" /> {{ t('ai.home.trend.syncedTo', { date: trendSyncedTo }) }}</span>
        </footer>
      </div>

      <div class="home-panel home-funnel">
        <header class="home-panel__head">
          <span class="home-panel__title"><Sparkles :size="18" /> {{ t('ai.home.funnelTitle') }}</span>
        </header>
        <div v-if="funnel.length" class="home-funnel__steps">
          <button v-for="(step, index) in funnel" :key="step.key" type="button" class="home-funnel__step" :style="{ '--step': index }" @click="router.push(step.route)">
            <span class="home-funnel__shape">
              <component :is="step.icon" :size="16" />
              <span class="home-funnel__name">{{ t(`ai.insights.overview.step.${step.key}`) }}</span>
            </span>
            <strong class="home-funnel__value vg-num">{{ new Intl.NumberFormat(locale).format(step.value) }}</strong>
            <span class="home-funnel__rate vg-num">{{ formatShare(step.share) }}</span>
          </button>
        </div>
        <div v-else class="home-trend__empty"><Loader2 v-if="loading" :size="18" class="vg-spin" /></div>
      </div>

      <div class="home-panel home-radar">
        <header class="home-panel__head">
          <span class="home-panel__title"><ShieldCheck :size="18" /> {{ t('ai.home.pulse.radar') }}</span>
          <span v-if="overview?.problems.length" class="home-radar__count vg-num">{{ overview.problems.length }}</span>
        </header>
        <div class="home-radar__list">
          <button v-for="signal in problems" :key="signal.id" type="button" class="home-radar__item" :class="`home-radar__item--${signal.level}`" @click="openSignal(signal)">
            <strong>{{ readable(signal.title) }}</strong>
            <small :title="signal.detail">{{ readable(signal.detail) }}</small>
          </button>
          <p v-if="overview && !problems.length" class="home-radar__ok"><CheckCircle2 :size="16" /> {{ t('ai.home.pulse.allGood') }}</p>
        </div>
        <button v-if="moreProblems" type="button" class="home-link" data-testid="home-pulse-all" @click="router.push('/insights')">{{ t('ai.home.pulse.more', { count: moreProblems }) }} <ChevronRight :size="14" /></button>
      </div>
    </section>

    <!-- Autopilot pipeline -->
    <section class="home-pipe" data-testid="home-autopilot">
      <div class="home-pipe__intro">
        <span class="home-pipe__logo"><InfinityIcon :size="30" /></span>
        <span class="home-pipe__copy">
          <strong>{{ t('ai.home.autopilot.title') }}</strong>
          <small>{{ t('ai.home.autopilot.desc') }}</small>
        </span>
      </div>
      <ol class="home-pipe__stages">
        <li v-for="(stage, index) in autopilotStages" :key="stage.key" class="home-pipe__stage">
          <button type="button" class="home-pipe__stop" :data-testid="`home-autopilot-stage-${stage.key}`" @click="router.push(stage.to)">
            <span class="home-pipe__dot"><component :is="stage.icon" :size="18" /></span>
            <strong>{{ index + 1 }}. {{ stage.title }}</strong>
            <small>{{ stage.sub }}</small>
          </button>
          <ArrowRight v-if="index < autopilotStages.length - 1" :size="16" class="home-pipe__arrow" />
        </li>
      </ol>
      <button type="button" class="home-pipe__start" data-testid="home-autopilot-start" @click="ai.open({ recipeId: 'autopilot' })">
        <Rocket :size="17" /> {{ t('ai.home.autopilot.cta') }}
      </button>
    </section>
    <!-- The daily plan is the pipeline's schedule, so it hangs off the pipeline as one block. -->
    <AutopilotDailyPanel class="home-pipe-daily" />

    <!-- Brief · quick tools · continue -->
    <section class="home-row home-row--lower">
      <div class="home-panel home-brief" data-testid="home-brief">
        <header class="home-panel__head">
          <span class="home-panel__title"><Sparkles :size="18" /> {{ t('ai.home.brief') }}</span>
          <small class="home-panel__sub">{{ brief?.headline }}</small>
        </header>
        <div class="home-brief__list">
          <button v-for="item in shownBriefItems" :key="item.kind + item.title" type="button" class="home-brief__item" @click="briefAction(item)">
            <span class="home-brief__status" :class="`home-brief__status--${item.level}`">
              <CheckCircle2 v-if="item.level === 'ok'" :size="15" />
              <AlertTriangle v-else-if="item.level === 'warning'" :size="15" />
              <XCircle v-else :size="15" />
            </span>
            <span class="home-brief__copy" :title="item.detail">
              <strong>{{ readable(item.title) }}</strong>
              <small>{{ readable(item.detail) }}</small>
            </span>
            <span v-if="item.aiPrompt" class="home-brief__ai"><Wand2 :size="12" /> {{ t('ai.home.handToAi') }}</span>
            <ChevronRight v-else :size="15" class="home-brief__arrow" />
          </button>
          <div v-if="!brief && loading" class="home-trend__empty"><Loader2 :size="16" class="vg-spin" /></div>
        </div>
        <button v-if="briefItems.length > BRIEF_ROWS" type="button" class="home-link" data-testid="home-brief-more" @click="briefExpanded = !briefExpanded">
          {{ briefExpanded ? t('ai.home.briefCollapse') : t('ai.home.briefMore', { count: briefItems.length - BRIEF_ROWS }) }} <ChevronRight :size="14" />
        </button>
      </div>

      <div class="home-panel home-quick">
        <header class="home-panel__head">
          <span class="home-panel__title"><LayoutGrid :size="18" /> {{ t('ai.home.quickTools') }}</span>
        </header>
        <div class="home-quick__grid">
          <button v-for="tool in tools" :key="tool.key" type="button" class="home-quick__tool" :class="`home-quick__tool--${tool.tone}`" :title="t(`ai.home.toolDesc.${tool.key}`)" @click="router.push(tool.to)">
            <component :is="tool.icon" :size="24" />
            <span>{{ tool.title }}</span>
          </button>
        </div>
      </div>

      <div class="home-panel home-continue">
        <header class="home-panel__head">
          <span class="home-panel__title"><Inbox :size="18" /> {{ t('ai.home.continue') }}</span>
          <button type="button" class="home-continue__inbox" @click="router.push('/inbox')">
            {{ t('ai.nav.inbox') }} <strong v-if="ai.pendingReviews" class="vg-num">{{ ai.pendingReviews }}</strong> <ChevronRight :size="13" />
          </button>
        </header>
        <div v-if="projectRows.length" class="home-continue__list">
          <button v-for="project in projectRows" :key="project.ref" type="button" class="home-continue__item" @click="router.push(project.route)">
            <img v-if="project.previewPath" class="home-continue__thumb" :src="thumbnailUrl(project.previewPath, 120)" alt="" loading="lazy" />
            <span v-else class="home-continue__thumb"><Clapperboard :size="18" /></span>
            <span class="home-continue__copy">
              <strong>{{ project.title }}</strong>
              <small>{{ t(`ai.line.${project.line}`) }}<template v-if="project.count > 1"> · {{ t('ai.home.projectCount', { count: project.count }) }}</template> · {{ formatTime(project.updatedAt) }}</small>
            </span>
            <span class="home-continue__status" :class="`home-continue__status--${project.status}`">
              <CheckCircle2 v-if="project.status === 'ready'" :size="13" />
              <Loader2 v-else-if="project.status === 'running'" :size="13" class="vg-spin" />
              <XCircle v-else-if="project.status === 'failed'" :size="13" />
              {{ t(`ai.contentStatus.${project.status}`) }}
            </span>
          </button>
          <!-- Fills the card when there are only a few projects, and is the natural next step anyway. -->
          <button v-if="projectRows.length < PROJECT_ROWS" type="button" class="home-continue__new" @click="router.push('/clone')">
            <FolderPlus :size="16" /> {{ t('ai.home.newTask') }}
          </button>
        </div>
        <div v-else class="vg-empty">
          <span class="vg-empty__icon"><Clapperboard :size="22" /></span>
          <h3>{{ t('ai.home.noProjects') }}</h3>
          <p>{{ t('ai.home.noProjectsHint') }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home {
  --home-violet: #8b5cf6;
  --home-teal: #14b8a6;
  --home-blue: #3b82f6;
  --home-indigo: #6366f1;
  --home-orange: #f97316;
  --home-pink: #ec4899;
  --home-slate: #64748b;
  --home-glass: color-mix(in srgb, var(--theme-panel) 82%, transparent);
  --home-line: color-mix(in srgb, var(--vg-accent) 16%, var(--theme-border));
  width: min(1480px, 100%);
  margin: 0 auto;
  gap: 14px;
}

/* ── Banner ── */
.home-hero {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 160px;
  overflow: hidden;
  border: 1px solid var(--home-line);
  border-radius: 18px;
  background:
    linear-gradient(90deg, var(--theme-panel) 0%, color-mix(in srgb, var(--theme-panel) 92%, transparent) 34%, color-mix(in srgb, var(--theme-panel) 10%, transparent) 62%, transparent 100%),
    radial-gradient(90% 160% at 0% 0%, color-mix(in srgb, var(--vg-accent) 22%, transparent), transparent 55%),
    var(--hero-image) 72% center / cover no-repeat,
    var(--theme-panel);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--vg-accent) 30%, transparent);
}
.home-hero::after { content: ''; position: absolute; inset: auto 0 0; height: 2px; background: linear-gradient(90deg, transparent, var(--vg-accent), transparent); opacity: .6; }
.home-hero__copy { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 10px; padding: 26px 48px; }
.home-hero h1 { margin: 0; font-size: clamp(24px, 2.4vw, 34px); font-weight: 900; letter-spacing: .02em; line-height: 1.15; color: var(--theme-text); text-shadow: 0 2px 18px rgba(0, 0, 0, .35); transform: skewX(-8deg); transform-origin: left bottom; }
.home-hero h1 em { margin-right: 6px; background: linear-gradient(100deg, #5eead4, var(--vg-accent) 55%, #22d3ee); -webkit-background-clip: text; background-clip: text; color: transparent; font-style: italic; }
.home-hero p { margin: 0; font-size: 15px; letter-spacing: .06em; color: var(--theme-text-secondary); }
.home-hero__actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; }
.home-hero__primary, .home-hero__secondary { display: inline-flex; align-items: center; gap: 10px; height: 44px; padding: 0 22px; border-radius: 12px; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; transition: transform .15s, box-shadow .15s, background .15s; }
.home-hero__primary { min-width: 240px; justify-content: center; border: 0; background: linear-gradient(100deg, #5eead4, var(--vg-accent)); color: #04221b; box-shadow: 0 8px 26px color-mix(in srgb, var(--vg-accent) 45%, transparent), inset 0 1px 0 rgba(255, 255, 255, .45); }
.home-hero__primary:hover { transform: translateY(-1px); box-shadow: 0 12px 32px color-mix(in srgb, var(--vg-accent) 55%, transparent), inset 0 1px 0 rgba(255, 255, 255, .45); }
.home-hero__secondary { border: 1px solid color-mix(in srgb, var(--theme-text) 28%, transparent); background: color-mix(in srgb, var(--theme-panel) 40%, transparent); color: var(--theme-text); backdrop-filter: blur(6px); font-weight: 600; }
.home-hero__secondary:hover { border-color: var(--vg-accent); background: color-mix(in srgb, var(--vg-accent) 10%, transparent); }
.home-hero__slogan { position: absolute; right: 44px; top: 50%; z-index: 1; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin: 0; transform: translateY(-50%) rotate(-6deg); font-family: 'STXingkai', '华文行楷', 'KaiTi', 'STKaiti', cursive; font-size: clamp(20px, 2vw, 30px); color: #fff; text-shadow: 0 2px 12px rgba(0, 0, 0, .55); pointer-events: none; }
.home-hero__slogan span:last-child { margin-right: -14px; padding-bottom: 6px; border-bottom: 2px solid color-mix(in srgb, #fff 70%, transparent); border-radius: 0 0 60% 0; }

/* ── KPI strip ── */
.home-kpis { display: grid; grid-template-columns: repeat(var(--kpi-count, 5), minmax(0, 1fr)); gap: 14px; }
.home-kpi {
  --tone: var(--home-teal);
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px 14px;
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
.home-kpi:hover { transform: translateY(-2px); box-shadow: 0 14px 36px color-mix(in srgb, var(--tone) 34%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 24%, transparent); }
.home-kpi--violet { --tone: var(--home-violet); }
.home-kpi--teal { --tone: var(--home-teal); }
.home-kpi--blue { --tone: var(--home-blue); }
.home-kpi--orange { --tone: var(--home-orange); }
.home-kpi--pink { --tone: var(--home-pink); }
.home-kpi__icon { display: inline-flex; align-items: center; justify-content: center; width: clamp(40px, 3.2vw, 54px); height: clamp(40px, 3.2vw, 54px); flex-shrink: 0; border-radius: 14px; background: color-mix(in srgb, #fff 16%, transparent); border: 1px solid color-mix(in srgb, #fff 22%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 25%, transparent); }
.home-kpi__copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.home-kpi__label { font-size: 12.5px; color: color-mix(in srgb, #fff 80%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-kpi__value { font-size: clamp(18px, 1.55vw, 26px); font-weight: 800; letter-spacing: -.01em; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-kpi__foot { display: flex; align-items: baseline; gap: 10px; min-width: 0; font-size: 12.5px; white-space: nowrap; }
.home-kpi__delta { font-weight: 700; color: color-mix(in srgb, #fff 80%, transparent); }
.home-kpi__delta--green { color: #6ee7b7; }
.home-kpi__delta--red { color: #fca5a5; }
.home-kpi__prev { overflow: hidden; text-overflow: ellipsis; color: color-mix(in srgb, #fff 70%, transparent); }

/* ── Shared panel ── */
.home-row { display: grid; gap: 14px; align-items: stretch; }
.home-row--data { grid-template-columns: minmax(0, 2.15fr) minmax(0, 1fr) minmax(0, 1.1fr); }
.home-row--lower { grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr) minmax(0, 0.9fr); }
.home-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px 18px;
  overflow: hidden;
  border: 1px solid var(--home-line);
  border-radius: 16px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--vg-accent) 5%, var(--theme-panel)), var(--theme-panel));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--vg-accent) 14%, transparent);
}
.home-panel__head { display: flex; align-items: center; gap: 12px; min-width: 0; flex-wrap: wrap; }
.home-panel__title { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; letter-spacing: .01em; white-space: nowrap; }
.home-panel__title svg { color: var(--vg-accent); }
.home-panel__sub { font-size: 12.5px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.home-link { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; margin-top: auto; padding: 0; border: 0; background: none; color: var(--vg-accent); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.home-link:hover { text-decoration: underline; }

/* ── Trend ── */
.home-seg { display: inline-flex; padding: 3px; border: 1px solid var(--theme-border); border-radius: 10px; background: color-mix(in srgb, var(--theme-text) 4%, transparent); }
.home-seg button { height: 26px; padding: 0 14px; border: 0; border-radius: 7px; background: transparent; color: var(--theme-text-secondary); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s; }
.home-seg button:hover { color: var(--theme-text); }
.home-seg button.is-active { background: var(--vg-accent); color: #04221b; box-shadow: 0 2px 10px color-mix(in srgb, var(--vg-accent) 45%, transparent); }
.home-seg--range { margin-left: auto; }
.home-trend__chart { position: relative; flex: 1; min-height: 210px; }
.home-trend__empty { display: flex; flex: 1; align-items: center; justify-content: center; gap: 8px; min-height: 120px; color: var(--theme-text-muted); font-size: 13px; text-align: center; }
.home-trend__chart .home-trend__empty { position: absolute; inset: 0; }
.home-trend__legend { display: flex; justify-content: center; gap: 22px; font-size: 12px; color: var(--theme-text-secondary); }
.home-trend__swatch { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--vg-accent); }
.home-trend__swatch--prev { background: var(--vg-violet); }
.home-trend__synced { display: inline-flex; align-items: center; gap: 5px; color: var(--vg-amber); }

/* ── Funnel ── */
.home-funnel__steps { display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: space-evenly; }
.home-funnel__step { display: grid; grid-template-columns: minmax(0, 1fr) auto 58px; align-items: center; gap: 12px; padding: 0; border: 0; background: none; color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; }
/* Each step is a trapezoid a little narrower than the one above, so the column reads as a funnel. */
.home-funnel__shape {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: calc(100% - var(--step) * 6%);
  height: 40px;
  margin-left: calc(var(--step) * 3%);
  padding: 0 12px;
  clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 100%, 12px 100%);
  background: linear-gradient(90deg, color-mix(in srgb, var(--vg-accent) calc(78% - var(--step) * 14%), var(--home-blue)), color-mix(in srgb, var(--home-blue) calc(40% + var(--step) * 12%), var(--vg-accent)));
  color: #fff;
  transition: filter .15s;
}
.home-funnel__step:hover .home-funnel__shape { filter: brightness(1.2); }
.home-funnel__name { min-width: 0; font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-funnel__value { font-size: 16px; font-weight: 800; text-align: right; }
.home-funnel__rate { font-size: 12px; color: var(--theme-text-muted); text-align: right; }

/* ── Radar ── */
.home-radar__count { margin-left: auto; min-width: 26px; padding: 2px 8px; border-radius: 8px; background: var(--vg-red); color: #fff; font-size: 13px; font-weight: 800; text-align: center; box-shadow: 0 4px 14px color-mix(in srgb, var(--vg-red) 45%, transparent); }
.home-radar__list { display: flex; flex-direction: column; gap: 8px; }
.home-radar__item { --level: var(--vg-amber); display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 9px 12px; border: 0; border-left: 3px solid var(--level); border-radius: 4px 10px 10px 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--level) 13%, transparent), color-mix(in srgb, var(--theme-text) 3%, transparent)); color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; transition: background .15s; }
.home-radar__item:hover { background: linear-gradient(90deg, color-mix(in srgb, var(--level) 22%, transparent), color-mix(in srgb, var(--theme-text) 5%, transparent)); }
.home-radar__item--error { --level: var(--vg-red); }
.home-radar__item { overflow: hidden; }
.home-radar__item strong { display: block; width: 100%; font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-radar__item small { display: block; width: 100%; font-size: 12px; color: var(--theme-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-radar__ok { display: flex; align-items: center; gap: 8px; margin: 0; padding: 12px; border-radius: 10px; background: color-mix(in srgb, var(--vg-green) 10%, transparent); color: var(--vg-green); font-size: 13px; }

/* ── Pipeline ── */
.home-pipe {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 16px 22px;
  border: 1px solid color-mix(in srgb, var(--vg-accent) 35%, var(--theme-border));
  border-radius: 16px;
  background:
    radial-gradient(60% 200% at 0% 50%, color-mix(in srgb, var(--vg-accent) 20%, transparent), transparent 60%),
    radial-gradient(50% 200% at 100% 50%, color-mix(in srgb, var(--home-blue) 16%, transparent), transparent 60%),
    var(--theme-panel);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--vg-accent) 25%, transparent);
}
/* Pipeline and daily plan read as one block: square seam, no gap, shared border. */
.home-pipe:has(+ .home-pipe-daily) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.home-pipe-daily {
  margin-top: -14px;
  padding: 12px 22px 14px;
  border: 1px solid color-mix(in srgb, var(--vg-accent) 35%, var(--theme-border));
  border-top: 1px dashed color-mix(in srgb, var(--vg-accent) 22%, transparent);
  border-radius: 0 0 16px 16px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--vg-accent) 6%, var(--theme-panel)), var(--theme-panel));
  box-shadow: none;
}
.home-pipe__intro { display: flex; align-items: center; gap: 14px; flex: 0 1 320px; min-width: 0; }
.home-pipe__logo { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; flex-shrink: 0; border-radius: 14px; background: color-mix(in srgb, var(--vg-accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--vg-accent) 35%, transparent); color: var(--vg-accent); }
.home-pipe__copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.home-pipe__copy strong { font-size: 19px; font-weight: 900; letter-spacing: .02em; }
.home-pipe__copy small { font-size: 12px; line-height: 1.5; color: var(--theme-text-secondary); }
.home-pipe__stages { display: flex; align-items: flex-start; flex: 1; min-width: 0; margin: 0; padding: 0; list-style: none; }
.home-pipe__stage { display: flex; align-items: flex-start; flex: 1; min-width: 0; }
.home-pipe__stop { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 0; padding: 0 2px; border: 0; background: none; color: var(--theme-text); font: inherit; text-align: center; cursor: pointer; }
.home-pipe__dot { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; margin-bottom: 4px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--vg-accent) 55%, #fff 10%), color-mix(in srgb, var(--vg-accent) 25%, var(--theme-panel))); border: 1px solid color-mix(in srgb, var(--vg-accent) 60%, transparent); color: #fff; box-shadow: 0 0 16px color-mix(in srgb, var(--vg-accent) 35%, transparent); transition: transform .15s, box-shadow .15s; }
.home-pipe__stop:hover .home-pipe__dot { transform: translateY(-2px); box-shadow: 0 0 24px color-mix(in srgb, var(--vg-accent) 60%, transparent); }
.home-pipe__stop strong { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.home-pipe__stop small { font-size: 11.5px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.home-pipe__arrow { flex-shrink: 0; margin-top: 12px; color: var(--theme-text-muted); }
.home-pipe__start { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; height: 44px; padding: 0 26px; border: 0; border-radius: 12px; background: linear-gradient(100deg, #5eead4, var(--vg-accent)); color: #04221b; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 8px 24px color-mix(in srgb, var(--vg-accent) 40%, transparent), inset 0 1px 0 rgba(255, 255, 255, .45); transition: transform .15s; }
.home-pipe__start:hover { transform: translateY(-1px); }

/* ── Brief ── */
.home-brief__list { display: flex; flex-direction: column; }
.home-brief__item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 4px; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--theme-text) 7%, transparent); background: none; color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; }
.home-brief__item:last-child { border-bottom: 0; }
.home-brief__item:hover .home-brief__copy strong { color: var(--vg-accent); }
.home-brief__status { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; }
.home-brief__status--error { background: color-mix(in srgb, var(--vg-red) 14%, transparent); color: var(--vg-red); }
.home-brief__status--warning { background: color-mix(in srgb, var(--vg-amber) 14%, transparent); color: var(--vg-amber); }
.home-brief__status--ok { background: color-mix(in srgb, var(--vg-green) 14%, transparent); color: var(--vg-green); }
.home-brief__copy { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.home-brief__copy strong { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color .15s; }
.home-brief__copy small { font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-brief__ai { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; height: 26px; padding: 0 10px; border: 1px solid color-mix(in srgb, var(--vg-accent) 40%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--vg-accent) 12%, transparent); color: var(--vg-accent); font-size: 12px; font-weight: 700; }
.home-brief__arrow { flex-shrink: 0; color: var(--theme-text-muted); }

/* ── Quick tools ── */
.home-quick__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(72px, 1fr); gap: 10px; flex: 1; }
.home-quick__tool {
  --tone: var(--home-teal);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  padding: 8px 3px 6px;
  border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
  border-radius: 12px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--tone) 38%, var(--theme-panel)), color-mix(in srgb, var(--tone) 12%, var(--theme-panel)));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
  color: #fff;
  font: inherit;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}
.home-quick__tool:hover { transform: translateY(-2px); box-shadow: 0 8px 22px color-mix(in srgb, var(--tone) 30%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 20%, transparent); }
.home-quick__tool span { max-width: 100%; overflow: hidden; font-size: 11px; font-weight: 700; letter-spacing: -.01em; white-space: nowrap; text-overflow: ellipsis; }
.home-quick__tool--teal { --tone: var(--home-teal); }
.home-quick__tool--indigo { --tone: var(--home-indigo); }
.home-quick__tool--blue { --tone: var(--home-blue); }
.home-quick__tool--violet { --tone: var(--home-violet); }
.home-quick__tool--orange { --tone: var(--home-orange); }
.home-quick__tool--slate { --tone: var(--home-slate); }

/* ── Continue ── */
.home-continue__inbox { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; height: 28px; padding: 0 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: color-mix(in srgb, var(--theme-text) 4%, transparent); color: var(--theme-text); font: inherit; font-size: 12.5px; cursor: pointer; }
.home-continue__inbox:hover { border-color: var(--vg-accent); }
.home-continue__list { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.home-continue__new { display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; min-height: 64px; border: 1px dashed color-mix(in srgb, var(--vg-accent) 35%, var(--theme-border)); border-radius: 12px; background: color-mix(in srgb, var(--vg-accent) 4%, transparent); color: var(--theme-text-secondary); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: border-color .15s, color .15s, background .15s; }
.home-continue__new:hover { border-color: var(--vg-accent); background: color-mix(in srgb, var(--vg-accent) 9%, transparent); color: var(--vg-accent); }
.home-continue__item { display: flex; align-items: center; gap: 14px; width: 100%; padding: 8px 10px; border: 1px solid transparent; border-radius: 12px; background: color-mix(in srgb, var(--theme-text) 3%, transparent); color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s; }
.home-continue__item:hover { border-color: color-mix(in srgb, var(--vg-accent) 40%, transparent); }
.home-continue__thumb { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; flex-shrink: 0; border-radius: 10px; object-fit: cover; background: color-mix(in srgb, var(--theme-text) 8%, transparent); color: var(--theme-text-muted); }
.home-continue__copy { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.home-continue__copy strong { font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-continue__copy small { font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-continue__status { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; height: 26px; padding: 0 10px; border-radius: 99px; background: color-mix(in srgb, var(--theme-text) 8%, transparent); color: var(--theme-text-secondary); font-size: 12px; font-weight: 700; }
.home-continue__status--ready { background: color-mix(in srgb, var(--vg-green) 16%, transparent); color: var(--vg-green); }
.home-continue__status--running { background: color-mix(in srgb, var(--vg-blue) 16%, transparent); color: var(--vg-blue); }
.home-continue__status--failed { background: color-mix(in srgb, var(--vg-red) 16%, transparent); color: var(--vg-red); }

/* ── Responsive ── */
@media (max-width: 1360px) {
  .home-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .home-row--data { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .home-trend { grid-column: 1 / -1; }
  .home-pipe { flex-wrap: wrap; }
  .home-pipe__intro { flex-basis: 100%; }
  .home-pipe__stages { flex-basis: calc(100% - 200px); }
}
@media (max-width: 1120px) {
  .home-row--lower { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .home-continue { grid-column: 1 / -1; }
  .home-hero__slogan { display: none; }
}
@media (max-width: 860px) {
  .home-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .home-row--data, .home-row--lower { grid-template-columns: minmax(0, 1fr); }
  .home-hero__copy { padding: 22px; }
  .home-pipe__stages { flex-basis: 100%; overflow-x: auto; }
  .home-pipe__stage { min-width: 92px; }
}
</style>
