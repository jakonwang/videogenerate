<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Captions,
  CheckCircle2,
  Clapperboard,
  Download,
  Images,
  Inbox,
  LayoutGrid,
  Loader2,
  Package,
  PlaySquare,
  RefreshCcw,
  Rocket,
  Scissors,
  Search,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
  XCircle,
} from 'lucide-vue-next'
import heroImage from '@/assets/home-hero.png'
import { thumbnailUrl } from '@/lib/localMedia'
import { useAiProducerStore } from '@/stores/aiProducer'
import AutopilotDailyPanel from '../components/ai/AutopilotDailyPanel.vue'
import { formatKpi, kpiDeltaText, kpiDeltaTone } from '@/lib/overviewFormat'
import type { OverviewReport, OverviewSignal } from '../../../../shared/overviewReport'

type BriefItem = { kind: string; level: 'ok' | 'warning' | 'error'; title: string; detail: string; route?: string; aiPrompt?: string; count?: number }
type Brief = { headline: string; summary?: string; items: BriefItem[]; createdAt: number }
type Project = { ref: string; line: string; title: string; productName?: string; status: string; stage?: string; progress?: number; readyCount: number; failedCount: number; route: string; previewPath?: string; updatedAt: number }

const { t, locale } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()

const brief = ref<Brief | null>(null)
const projects = ref<Project[]>([])
const overview = ref<OverviewReport | null>(null)
const goal = ref('')
const loading = ref(false)
const regenerating = ref(false)
let unsubscribe: (() => void) | null = null

const lines = computed(() => [
  { key: 'clone', icon: Clapperboard, tone: 'accent', title: t('ai.home.lines.clone.title'), desc: t('ai.home.lines.clone.desc'), to: '/clone', recipe: 'product-content-pack' },
  { key: 'creative', icon: Wand2, tone: 'violet', title: t('ai.home.lines.creative.title'), desc: t('ai.home.lines.creative.desc'), to: '/plugins/tiktok-creative-studio', recipe: 'scene-images' },
  { key: 'muse', icon: Sparkles, tone: 'blue', title: t('ai.home.lines.muse.title'), desc: t('ai.home.lines.muse.desc'), to: '/plugins/muse-creative-studio', recipe: 'scene-images' },
  { key: 'livephoto', icon: PlaySquare, tone: 'red', title: t('ai.home.lines.livephoto.title'), desc: t('ai.home.lines.livephoto.desc'), to: '/plugins/live-photo-generator', recipe: 'scene-images' },
])

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

const tools = computed(() => [
  { to: '/plugins/video-parser-download', icon: Download, title: t('ai.home.tools.parser'), tone: 'blue' },
  { to: '/plugins/video-batch-subtitle', icon: Captions, title: t('ai.home.tools.subtitle'), tone: 'green' },
  { to: '/plugins/product-image-materials', icon: Images, title: t('ai.home.tools.materials'), tone: 'blue' },
  { to: '/production', icon: Scissors, title: t('ai.home.tools.production'), tone: 'amber' },
  { to: '/plugins/tiktok-creator-hub', icon: Users, title: t('ai.home.tools.creators'), tone: 'violet' },
  { to: '/plugins/tiktok-gmv-max-optimizer', icon: BarChart3, title: t('ai.home.tools.gmv'), tone: 'accent' },
  { to: '/plugins/dianxiaomi-inventory', icon: Package, title: t('ai.home.tools.inventory'), tone: 'amber' },
  { to: '/plugins', icon: LayoutGrid, title: t('ai.home.tools.all'), tone: 'gray' },
])

// Home shows a short version of 数据概览: the four most telling numbers and the three most urgent problems.
const PULSE_KPIS = ['gmv', 'roi', 'creatorGmv', 'produced', 'approvalRate', 'published']
const pulseKpis = computed(() => {
  const kpis = overview.value?.kpis.filter((kpi) => kpi.available) || []
  return PULSE_KPIS.map((key) => kpis.find((kpi) => kpi.key === key)).filter((kpi) => !!kpi).slice(0, 4)
})
const pulseProblems = computed(() => overview.value?.problems.slice(0, 3) || [])
const moreProblems = computed(() => Math.max(0, (overview.value?.problems.length || 0) - pulseProblems.value.length))

function openSignal(signal: OverviewSignal) {
  void router.push(signal.route || '/insights')
}

// Both lower cards show the same number of rows so they end at the same height.
const LOWER_ROWS = 6
const LEVEL_RANK = { error: 0, warning: 1, ok: 2 }
const briefExpanded = ref(false)
const briefItems = computed(() => [...(brief.value?.items || [])].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]))
const shownBriefItems = computed(() => briefExpanded.value ? briefItems.value : briefItems.value.slice(0, LOWER_ROWS))

// A live-photo batch yields one project per photo; show one row per product and status, opening the newest.
const projectRows = computed(() => {
  const rows = new Map<string, { project: Project; count: number }>()
  for (const project of projects.value) {
    const key = project.line === 'livephoto' && project.productName ? `${project.line}:${project.productName}:${project.status}` : project.ref
    const row = rows.get(key)
    if (row) row.count += 1
    else rows.set(key, { project, count: 1 })
  }
  return [...rows.values()].slice(0, LOWER_ROWS).map(({ project, count }) => ({
    ...project,
    count,
    title: count > 1 ? project.productName || project.title : project.title,
  }))
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return t('ai.home.greeting.night')
  if (hour < 12) return t('ai.home.greeting.morning')
  if (hour < 18) return t('ai.home.greeting.afternoon')
  return t('ai.home.greeting.evening')
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
  } catch {
    // Home must render even if the hub is unavailable.
  } finally {
    loading.value = false
  }
}

async function regenerate() {
  regenerating.value = true
  try {
    brief.value = (await window.api.contentHub.generateBrief('daily')) as Brief
  } finally {
    regenerating.value = false
  }
}

function askGoal() {
  const text = goal.value.trim()
  if (!text) {
    void ai.open()
    return
  }
  goal.value = ''
  void ai.open({ fresh: true, prompt: text, send: true })
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
    <section class="home-hero" :style="{ '--hero-image': `url(${heroImage})` }">
      <div class="home-hero__copy">
        <span class="vg-pill vg-pill--accent"><Sparkles :size="12" /> {{ t('ai.home.kicker') }}</span>
        <h1>{{ greeting }}<strong>{{ t('ai.home.headline') }}</strong></h1>
        <p>{{ t('ai.home.sub') }}</p>
        <form class="home-goal" @submit.prevent="askGoal">
          <Wand2 :size="16" class="home-goal__icon" />
          <input v-model="goal" class="home-goal__input" data-testid="home-goal-input" :placeholder="t('ai.home.goalPlaceholder')" />
          <button type="submit" class="vg-btn vg-btn--primary vg-btn--sm" data-testid="home-goal-submit">{{ t('ai.home.goalSubmit') }} <ArrowRight :size="14" /></button>
        </form>
      </div>
    </section>

    <section v-if="overview" class="vg-card home-pulse" data-testid="home-pulse">
      <div class="vg-card__head">
        <span class="vg-card__title"><BarChart3 :size="16" /> {{ t('ai.home.pulse.title') }} <small>{{ t('ai.home.pulse.range') }}</small></span>
        <div class="vg-card__actions">
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" data-testid="home-pulse-all" @click="router.push('/insights')">{{ t('ai.home.pulse.all') }} <ChevronRight :size="14" /></button>
        </div>
      </div>
      <div class="home-pulse__body">
        <div class="home-pulse__kpis">
          <button v-for="kpi in pulseKpis" :key="kpi.key" type="button" class="home-pulse__kpi" @click="router.push(kpi.route)">
            <span class="home-pulse__label">{{ t(`ai.insights.overview.kpi.${kpi.key}`) }}</span>
            <strong class="home-pulse__value vg-num" :title="formatKpi(kpi, locale)">{{ formatKpi(kpi, locale) }}</strong>
            <span v-if="kpiDeltaText(kpi, t)" class="vg-pill home-pulse__delta" :class="kpiDeltaTone(kpi) ? `vg-pill--${kpiDeltaTone(kpi)}` : ''">{{ kpiDeltaText(kpi, t) }}</span>
          </button>
        </div>
        <div class="home-pulse__problems">
          <button v-for="signal in pulseProblems" :key="signal.id" type="button" class="home-pulse__problem" :class="`home-pulse__problem--${signal.level}`" @click="openSignal(signal)">
            <span class="home-pulse__dot"></span>
            <span class="home-pulse__problem-copy">
              <strong>{{ signal.title }}</strong>
              <small>{{ signal.detail }}</small>
            </span>
            <ArrowRight :size="14" class="home-brief__arrow" />
          </button>
          <button v-if="moreProblems" type="button" class="vg-link home-pulse__more" @click="router.push('/insights')">{{ t('ai.home.pulse.more', { count: moreProblems }) }}</button>
          <p v-if="!pulseProblems.length" class="home-pulse__ok"><CheckCircle2 :size="16" /> {{ t('ai.home.pulse.allGood') }}</p>
        </div>
      </div>
    </section>

    <section class="vg-card home-auto" data-testid="home-autopilot">
      <div class="home-auto__head">
        <span class="home-auto__icon"><Rocket :size="20" /></span>
        <div class="home-auto__copy">
          <strong>{{ t('ai.home.autopilot.title') }} <span class="vg-pill vg-pill--accent">{{ t('ai.home.autopilot.badge') }}</span></strong>
          <small>{{ t('ai.home.autopilot.desc') }}</small>
        </div>
        <button type="button" class="vg-btn vg-btn--primary" data-testid="home-autopilot-start" @click="ai.open({ recipeId: 'autopilot' })">
          <Rocket :size="15" /> {{ t('ai.home.autopilot.cta') }}
        </button>
      </div>
      <ol class="home-auto__stages">
        <li v-for="(stage, index) in autopilotStages" :key="stage.key" class="home-auto__stage">
          <button type="button" class="home-auto__stop" :data-testid="`home-autopilot-stage-${stage.key}`" @click="router.push(stage.to)">
            <span class="home-auto__dot"><component :is="stage.icon" :size="16" /></span>
            <span class="home-auto__label">
              <strong>{{ index + 1 }}. {{ stage.title }}</strong>
              <small>{{ stage.sub }}</small>
            </span>
          </button>
        </li>
      </ol>
    </section>

    <AutopilotDailyPanel />

    <section class="home-lines">
      <article v-for="line in lines" :key="line.key" class="vg-card home-line" :class="`home-line--${line.tone}`" :data-testid="`home-line-${line.key}`">
        <span class="home-line__icon"><component :is="line.icon" :size="20" /></span>
        <div class="home-line__copy">
          <strong>{{ line.title }}</strong>
          <small>{{ line.desc }}</small>
        </div>
        <div class="home-line__actions">
          <button type="button" class="vg-btn vg-btn--sm" @click="router.push(line.to)">{{ t('ai.home.openWorkspace') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="ai.open({ recipeId: line.recipe, context: line.key === 'livephoto' ? { recipePreset: { engine: 'livephoto' } } : undefined })"><Wand2 :size="13" /> {{ t('ai.home.letAi') }}</button>
        </div>
      </article>
    </section>

    <section class="home-lower">
      <div class="vg-card home-brief" data-testid="home-brief">
        <div class="vg-card__head">
          <span class="vg-card__title"><Sparkles :size="16" /> {{ t('ai.home.brief') }} <small>{{ brief?.headline }}</small></span>
          <div class="vg-card__actions">
            <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" :disabled="regenerating" :title="t('ai.home.refreshBrief')" @click="regenerate"><RefreshCcw :size="14" :class="{ 'vg-spin': regenerating }" /></button>
          </div>
        </div>
        <p v-if="brief?.summary" class="home-brief__summary">{{ brief.summary }}</p>
        <div class="vg-list">
          <button v-for="item in shownBriefItems" :key="item.kind + item.title" type="button" class="vg-list__item vg-list__item--button" @click="briefAction(item)">
            <CheckCircle2 v-if="item.level === 'ok'" :size="16" class="home-brief__ok" />
            <AlertTriangle v-else-if="item.level === 'warning'" :size="16" class="home-brief__warn" />
            <XCircle v-else :size="16" class="home-brief__err" />
            <span class="vg-list__main" :title="item.detail">
              <span class="vg-list__title">{{ item.title }}</span>
              <span class="vg-list__sub">{{ item.detail }}</span>
            </span>
            <span v-if="item.aiPrompt" class="vg-pill vg-pill--accent"><Wand2 :size="11" /> {{ t('ai.home.handToAi') }}</span>
            <ArrowRight v-else :size="14" class="home-brief__arrow" />
          </button>
          <div v-if="!brief && loading" class="home-brief__loading"><Loader2 :size="16" class="vg-spin" /></div>
        </div>
        <button v-if="briefItems.length > LOWER_ROWS" type="button" class="vg-link home-brief__more" data-testid="home-brief-more" @click="briefExpanded = !briefExpanded">{{ briefExpanded ? t('ai.home.briefCollapse') : t('ai.home.briefMore', { count: briefItems.length - LOWER_ROWS }) }}</button>
      </div>

      <div class="vg-card home-continue">
        <div class="vg-card__head">
          <span class="vg-card__title"><Inbox :size="16" /> {{ t('ai.home.continue') }}</span>
          <div class="vg-card__actions">
            <button type="button" class="vg-btn vg-btn--sm" @click="router.push('/inbox')">{{ t('ai.nav.inbox') }} <span v-if="ai.pendingReviews" class="vg-count">{{ ai.pendingReviews }}</span></button>
          </div>
        </div>
        <div v-if="projectRows.length" class="vg-list">
          <button v-for="project in projectRows" :key="project.ref" type="button" class="vg-list__item vg-list__item--button" @click="router.push(project.route)">
            <img v-if="project.previewPath" class="vg-thumb" :src="thumbnailUrl(project.previewPath, 88)" alt="" loading="lazy" />
            <span v-else class="vg-thumb"><Clapperboard :size="16" /></span>
            <span class="vg-list__main">
              <span class="vg-list__title">{{ project.title }}</span>
              <span class="vg-list__sub">{{ t(`ai.line.${project.line}`) }}<template v-if="project.count > 1"> · {{ t('ai.home.projectCount', { count: project.count }) }}</template><template v-if="project.productName && project.productName !== project.title"> · {{ project.productName }}</template> · {{ formatTime(project.updatedAt) }}</span>
            </span>
            <span class="vg-pill vg-pill--dot" :class="{ 'vg-pill--green': project.status === 'ready', 'vg-pill--blue': project.status === 'running', 'vg-pill--red': project.status === 'failed' }">
              {{ t(`ai.contentStatus.${project.status}`) }}
            </span>
          </button>
        </div>
        <div v-else class="vg-empty">
          <span class="vg-empty__icon"><Clapperboard :size="22" /></span>
          <h3>{{ t('ai.home.noProjects') }}</h3>
          <p>{{ t('ai.home.noProjectsHint') }}</p>
        </div>
      </div>
    </section>

    <section class="vg-stack">
      <div class="vg-page-head">
        <h2 class="vg-section-title"><LayoutGrid :size="16" /> {{ t('ai.home.toolsTitle') }}</h2>
      </div>
      <div class="vg-grid home-tools">
        <button v-for="tool in tools" :key="tool.to" type="button" class="vg-card vg-card--interactive home-tool" :class="`home-tool--${tool.tone}`" @click="router.push(tool.to)">
          <span class="home-tool__icon"><component :is="tool.icon" :size="18" /></span>
          <span class="home-tool__copy"><strong>{{ tool.title }}</strong></span>
          <ArrowRight class="home-tool__arrow" :size="16" />
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home { width: min(1408px, 100%); margin: 0 auto; gap: 16px; }

.home-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--vg-accent-line);
  border-radius: var(--vg-radius-lg);
  background:
    linear-gradient(90deg,
      var(--theme-panel) 0%,
      color-mix(in srgb, var(--theme-panel) 94%, transparent) 46%,
      color-mix(in srgb, var(--theme-panel) 25%, transparent) 78%,
      transparent 100%),
    radial-gradient(120% 140% at 0% 0%, var(--vg-accent-soft), transparent 60%),
    var(--hero-image) right center / cover no-repeat,
    var(--theme-panel);
}
.home-hero__copy { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; max-width: 720px; padding: 26px 32px; }
.home-hero h1 { font-size: clamp(22px, 2.3vw, 30px); font-weight: 800; line-height: 1.25; color: var(--theme-text); }
.home-hero h1 strong { color: var(--vg-accent); }
.home-hero p { font-size: 14px; color: var(--theme-text-secondary); }
.home-goal { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 6px; padding: 6px 6px 6px 12px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-shell); box-shadow: 0 6px 20px rgba(0, 0, 0, .08); }
.home-goal:focus-within { border-color: var(--vg-accent-line); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.home-goal__icon { color: var(--vg-accent); flex-shrink: 0; }
.home-goal__input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--theme-text); font-size: 14px; }

.home-auto { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px; border-color: var(--vg-accent-line); background: linear-gradient(180deg, var(--vg-accent-soft), transparent 70%), var(--theme-panel); }
.home-auto__head { display: flex; align-items: center; gap: 14px; }
.home-auto__icon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: 12px; background: var(--vg-accent); color: #fff; box-shadow: 0 6px 16px color-mix(in srgb, var(--vg-accent) 35%, transparent); }
.home-auto__copy { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.home-auto__copy strong { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 16px; font-weight: 700; }
.home-auto__copy small { font-size: 12.5px; line-height: 1.55; color: var(--theme-text-secondary); }
.home-auto__stages { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0; margin: 0; padding: 0; list-style: none; }
.home-auto__stage { position: relative; min-width: 0; }
/* Connector between two stations, drawn from this dot to the next one. */
.home-auto__stage:not(:last-child)::after { content: ''; position: absolute; top: 17px; left: calc(50% + 22px); right: calc(-50% + 22px); height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--vg-accent-line), color-mix(in srgb, var(--vg-accent-line) 35%, transparent)); }
.home-auto__stop { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; padding: 0 4px; border: 0; background: transparent; color: var(--theme-text); cursor: pointer; text-align: center; }
.home-auto__dot { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--vg-accent-line); background: var(--theme-panel); color: var(--vg-accent); transition: background .15s, color .15s, transform .15s; }
.home-auto__stop:hover .home-auto__dot, .home-auto__stop:focus-visible .home-auto__dot { background: var(--vg-accent); color: #fff; transform: translateY(-1px); }
.home-auto__stop:focus-visible { outline: none; }
.home-auto__label { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 100%; }
.home-auto__label strong { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-auto__label small { font-size: 11.5px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.home-pulse__body { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.home-pulse__kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
.home-pulse__kpi { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 4px; min-width: 0; padding: 12px 16px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel-soft); color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s; }
.home-pulse__kpi:hover { border-color: var(--vg-accent-line); }
.home-pulse__label { font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.home-pulse__value { font-size: 18px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.home-pulse__delta { height: 19px; padding: 0 7px; font-size: 11.5px; }
.home-pulse__problems { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.home-pulse__problem { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: transparent; color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; }
.home-pulse__problem:hover { border-color: var(--vg-accent-line); }
.home-pulse__dot { width: 8px; height: 8px; margin-top: 6px; flex-shrink: 0; border-radius: 50%; background: var(--vg-amber); }
.home-pulse__problem--error .home-pulse__dot { background: var(--vg-red); }
.home-pulse__problem-copy { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.home-pulse__problem-copy strong { font-size: 13px; font-weight: 600; }
.home-pulse__problem-copy small { font-size: 12px; color: var(--theme-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-pulse__more { align-self: flex-start; font-size: 12px; background: none; border: 0; padding: 2px 0; cursor: pointer; }
.home-pulse__ok { display: flex; align-items: center; gap: 8px; margin: 0; padding: 12px; border-radius: var(--vg-radius-sm); background: color-mix(in srgb, var(--vg-green) 10%, transparent); color: var(--vg-green); font-size: 13px; }

.home-lines { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.home-line { --tone: var(--vg-accent); display: flex; flex-direction: column; gap: 10px; padding: 16px; }
.home-line--violet { --tone: var(--vg-violet); }
.home-line--red { --tone: var(--vg-red); }
.home-line__icon { width: 40px; height: 40px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); color: var(--tone); }
.home-line__copy { display: flex; flex-direction: column; gap: 4px; }
.home-line__copy strong { font-size: 15px; }
.home-line__copy small { font-size: 12.5px; color: var(--theme-text-secondary); line-height: 1.55; }
.home-line__actions { display: flex; gap: 8px; margin-top: auto; }

.home-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.home-lower .vg-list__item { min-height: 65px; }
.home-brief__more { margin-top: 8px; padding: 4px 12px; border: 0; background: none; font-size: 12px; cursor: pointer; }
.home-brief__summary { margin: 0 0 10px; padding: 10px 12px; border-radius: var(--vg-radius-sm); background: var(--vg-accent-soft); font-size: 13px; line-height: 1.6; }
.home-brief__ok { color: var(--vg-green); flex-shrink: 0; }
.home-brief__warn { color: var(--vg-amber); flex-shrink: 0; }
.home-brief__err { color: var(--vg-red); flex-shrink: 0; }
.home-brief__arrow { color: var(--theme-text-muted); flex-shrink: 0; }
.home-brief__loading { display: flex; justify-content: center; padding: 20px; color: var(--theme-text-muted); }

.home-tools { --vg-grid-min: 210px; }
.home-tool { --tone: var(--vg-accent); display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; color: var(--theme-text); text-align: left; }
.home-tool--blue { --tone: var(--vg-blue); }
.home-tool--amber { --tone: var(--vg-amber); }
.home-tool--violet { --tone: var(--vg-violet); }
.home-tool--green { --tone: var(--vg-green); }
.home-tool--gray { --tone: var(--vg-gray); }
.home-tool__icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; background: color-mix(in srgb, var(--tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); color: var(--tone); }
.home-tool__copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.home-tool__copy strong { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-tool__arrow { color: var(--theme-text-muted); flex-shrink: 0; transition: transform .15s, color .15s; }
.home-tool:hover .home-tool__arrow { color: var(--tone); transform: translateX(2px); }

@media (max-width: 1120px) {
  .home-lower { grid-template-columns: minmax(0, 1fr); }
  .home-pulse__body { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 860px) {
  .home-auto__head { flex-wrap: wrap; }
  .home-auto__stages { grid-template-columns: repeat(4, minmax(0, 1fr)); row-gap: 14px; }
  .home-auto__stage::after { display: none; }
  .home-lines { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .home-hero__copy { padding: 20px; }
  .home-pulse__kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
