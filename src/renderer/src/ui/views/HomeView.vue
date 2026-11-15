<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ListChecks,
  Loader,
  BarChart3,
  Captions,
  Download,
  Images,
  LayoutGrid,
  Package,
  PlaySquare,
  Plus,
  Sparkles,
  Users,
  WandSparkles,
} from 'lucide-vue-next'
import heroImage from '@/assets/home-hero.png'

const { t, locale } = useI18n()
const router = useRouter()

type ProductionTask = {
  id: string
  createdAt: number
  productId?: string
  status?: string
  progress?: number
}

type Product = { id: string; name?: string }

const tasks = ref<ProductionTask[]>([])
const products = ref<Product[]>([])
const loading = ref(false)
let unsubscribeTaskEvents: (() => void) | null = null

const tools = computed(() => [
  { to: '/plugins/tiktok-gmv-max-optimizer', icon: BarChart3, title: 'GMV MAX 优化器', description: '优化投放参数，提升 GMV 效果', tone: 'accent' },
  { to: '/plugins/product-image-materials', icon: Images, title: '商品图片素材', description: '批量处理商品图片素材', tone: 'blue' },
  { to: '/plugins/dianxiaomi-inventory', icon: Package, title: '店小秘库存分析', description: '跟踪 SKU 库存，预警风险', tone: 'amber' },
  { to: '/plugins/live-photo-generator', icon: PlaySquare, title: '动态照片生成器', description: '将静态图生成 Live Photo', tone: 'red' },
  { to: '/plugins/tiktok-creative-studio', icon: WandSparkles, title: 'TikTok 创意工作室', description: '一键生成创意视频脚本', tone: 'violet' },
  { to: '/plugins/tiktok-creator-hub', icon: Users, title: '达人管理', description: '寄样管理与达人履约率', tone: 'violet' },
  { to: '/plugins/tiktok-creator-outreach', icon: Users, title: 'TikTok Creator Outreach', description: '达人管理与邀约', tone: 'green' },
  { to: '/plugins/video-parser-download', icon: Download, title: '视频解析下载', description: '解析下载无水印视频', tone: 'blue' },
  { to: '/plugins/video-batch-subtitle', icon: Captions, title: '视频批量字幕', description: '自动识别并生成多语言字幕', tone: 'green' },
])

const productNameMap = computed(() => new Map(products.value.map((item) => [item.id, item.name || item.id])))
const recentTasks = computed(() => tasks.value.slice(0, 5))
const todayStart = computed(() => {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  return value.getTime()
})
const todayTasks = computed(() => tasks.value.filter((item) => Number(item.createdAt || 0) >= todayStart.value))
const runningTaskCount = computed(() => tasks.value.filter((item) => ['running', 'queued', 'paused'].includes(String(item.status || ''))).length)
const doneTaskCount = computed(() => todayTasks.value.filter((item) => item.status === 'done').length)
const failedTaskCount = computed(() => todayTasks.value.filter((item) => item.status === 'error').length)
const currentDateLabel = computed(() => new Date().toLocaleDateString(locale.value))
const stats = computed(() => [
  { value: todayTasks.value.length, label: '今日任务', trend: `${tasks.value.length} 总计`, tone: 'accent', icon: ListChecks },
  { value: runningTaskCount.value, label: '处理中', trend: '实时', tone: 'blue', icon: Loader },
  { value: doneTaskCount.value, label: '今日完成', trend: '已完成', tone: 'accent', icon: CheckCircle2 },
  { value: failedTaskCount.value, label: '今日失败', trend: '需处理', tone: 'red', icon: AlertTriangle },
])

function formatTime(timestamp: number) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function taskTitle(task: ProductionTask) {
  return task.productId ? (productNameMap.value.get(task.productId) || task.productId) : `任务 ${task.id.slice(0, 8)}`
}

function taskProgress(task: ProductionTask) {
  return Math.max(0, Math.min(100, Math.round(Number(task.progress || 0) * 100)))
}

function statusTone(status?: string) {
  if (status === 'done') return 'green'
  if (status === 'error') return 'red'
  if (status === 'paused') return 'amber'
  if (status === 'running') return 'blue'
  return 'gray'
}

function statusLabel(status?: string) {
  const value = String(status || 'queued')
  const translated = t(`production.tasks.status.${value}`)
  return translated === `production.tasks.status.${value}` ? value : translated
}

async function refresh() {
  loading.value = true
  try {
    const [taskRows, productRows] = await Promise.all([window.api.tasks.list(), window.api.products.list()])
    tasks.value = ((taskRows as ProductionTask[]) || []).slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    products.value = (productRows as Product[]) || []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
  unsubscribeTaskEvents = window.api.tasks.onEvent(() => void refresh())
})

onUnmounted(() => {
  unsubscribeTaskEvents?.()
  unsubscribeTaskEvents = null
})

function open(path: string) {
  void router.push(path)
}
</script>

<template>
  <main class="vg-scope vg-page home">
    <section class="home-hero" :style="{ '--hero-image': `url(${heroImage})` }">
      <div class="home-hero__copy">
        <span class="vg-pill vg-pill--accent">AI 驱动 · 高效 · 专业</span>
        <h1>一站式 <strong>TikTok</strong> 视频生产平台</h1>
        <p>从商品到成片，助你快速打造爆款视频</p>
        <div class="home-hero__actions">
          <button type="button" class="vg-btn vg-btn--primary vg-btn--lg" @click="open('/production/create')">
            开始创作 <ArrowRight :size="16" />
          </button>
          <span class="home-hero__feature"><Sparkles :size="15" /> AI 智能生成</span>
          <span class="home-hero__feature"><PlaySquare :size="15" /> 高质量视频</span>
          <span class="home-hero__feature"><Images :size="15" /> 批量高效处理</span>
        </div>
      </div>
    </section>

    <section class="vg-stack">
      <div class="vg-page-head">
        <h2 class="vg-section-title"><LayoutGrid :size="16" /> 常用工具 <small>快速进入你需要的功能，开始高效创作</small></h2>
        <div class="vg-page-head__actions">
          <button type="button" class="vg-btn vg-btn--sm" @click="open('/plugins')">插件中心 <ArrowRight :size="14" /></button>
        </div>
      </div>
      <div class="vg-grid home-tools">
        <button
          v-for="tool in tools"
          :key="tool.to"
          type="button"
          class="vg-card vg-card--interactive home-tool"
          :class="`home-tool--${tool.tone}`"
          @click="open(tool.to)"
        >
          <span class="home-tool__icon"><component :is="tool.icon" :size="20" /></span>
          <span class="home-tool__copy">
            <strong>{{ tool.title }}</strong>
            <small>{{ tool.description }}</small>
          </span>
          <ArrowRight class="home-tool__arrow" :size="16" />
        </button>
      </div>
    </section>

    <section class="home-lower">
      <div class="vg-card">
        <div class="vg-card__head">
          <span class="vg-card__title"><ListChecks :size="16" /> 最近任务 <small>最近 5 个生产任务</small></span>
          <div class="vg-card__actions">
            <button type="button" class="vg-btn vg-btn--sm" @click="open('/production/tasks')">全部任务</button>
            <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="open('/production/create')"><Plus :size="14" /> 新建项目</button>
          </div>
        </div>
        <div v-if="recentTasks.length" class="vg-list">
          <button
            v-for="task in recentTasks"
            :key="task.id"
            type="button"
            class="vg-list__item vg-list__item--button"
            @click="open(`/production/tasks/${task.id}`)"
          >
            <span class="vg-list__main">
              <span class="vg-list__title">{{ taskTitle(task) }}</span>
              <span class="vg-list__sub">{{ formatTime(task.createdAt) }}</span>
            </span>
            <span class="vg-progress home-task__progress">
              <span class="vg-progress__bar">
                <span class="vg-progress__fill" :class="{ 'vg-progress__fill--fail': task.status === 'error' }" :style="{ width: `${taskProgress(task)}%` }"></span>
              </span>
              <span>{{ taskProgress(task) }}%</span>
            </span>
            <span class="vg-pill vg-pill--dot" :class="`vg-pill--${statusTone(task.status)}`">{{ statusLabel(task.status) }}</span>
          </button>
        </div>
        <div v-else class="vg-empty">
          <span class="vg-empty__icon"><PlaySquare :size="24" /></span>
          <h3>{{ loading ? '正在加载任务...' : '暂无生产任务' }}</h3>
          <p v-if="!loading">开始创建你的第一个视频吧</p>
        </div>
      </div>

      <div class="vg-card">
        <div class="vg-card__head">
          <span class="vg-card__title"><BarChart3 :size="16" /> 今日数据</span>
          <span class="vg-chip">{{ currentDateLabel }}</span>
        </div>
        <div class="vg-grid vg-grid--2 home-stats">
          <div v-for="stat in stats" :key="stat.label" class="vg-stat">
            <span class="vg-stat__icon" :class="stat.tone !== 'accent' ? `vg-stat__icon--${stat.tone}` : ''"><component :is="stat.icon" :size="17" /></span>
            <span class="vg-stat__body">
              <span class="vg-stat__label">{{ stat.label }}</span>
              <span class="vg-stat__value">{{ stat.value }} <small>{{ stat.trend }}</small></span>
            </span>
          </div>
        </div>
        <button type="button" class="vg-btn vg-btn--soft vg-btn--block home-stats__link" @click="open('/production/tasks')">
          查看完整数据 <ArrowRight :size="14" />
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home { width: min(1408px, 100%); margin: 0 auto; gap: 18px; }

/* Hero: image on the right; a panel-coloured gradient keeps the copy readable in every theme. */
.home-hero {
  position: relative;
  overflow: hidden;
  min-height: 228px;
  border: 1px solid var(--vg-accent-line);
  border-radius: var(--vg-radius-lg);
  background:
    linear-gradient(90deg,
      var(--theme-panel) 0%,
      color-mix(in srgb, var(--theme-panel) 92%, transparent) 38%,
      color-mix(in srgb, var(--theme-panel) 20%, transparent) 72%,
      transparent 100%),
    radial-gradient(120% 140% at 0% 0%, var(--vg-accent-soft), transparent 60%),
    var(--hero-image) right center / cover no-repeat,
    var(--theme-panel);
}
.home-hero__copy {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  max-width: 640px;
  min-height: 228px;
  padding: 28px 36px;
}
.home-hero h1 { font-size: clamp(26px, 2.6vw, 36px); font-weight: 800; line-height: 1.2; color: var(--theme-text); }
.home-hero h1 strong { color: var(--vg-accent); }
.home-hero p { font-size: 15px; color: var(--theme-text-secondary); }
.home-hero__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; margin-top: 8px; }
.home-hero__feature { display: inline-flex; align-items: center; gap: 6px; color: var(--theme-text-secondary); font-size: 12px; }
.home-hero__feature svg { color: var(--vg-accent); }

/* Tools */
.home-tools { --vg-grid-min: 250px; }
.home-tool {
  --tone: var(--vg-accent);
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  color: var(--theme-text);
  text-align: left;
}
.home-tool--blue { --tone: var(--vg-blue); }
.home-tool--amber { --tone: var(--vg-amber); }
.home-tool--red { --tone: var(--vg-red); }
.home-tool--violet { --tone: var(--vg-violet); }
.home-tool--green { --tone: var(--vg-green); }
.home-tool__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
  color: var(--tone);
}
.home-tool__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.home-tool__copy strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-tool__copy small { font-size: 12px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-tool__arrow { color: var(--theme-text-muted); flex-shrink: 0; transition: transform .15s, color .15s; }
.home-tool:hover .home-tool__arrow { color: var(--tone); transform: translateX(2px); }

/* Lower panels */
.home-lower { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr); gap: 14px; align-items: start; }
.home-task__progress { width: 160px; flex: 0 0 auto; }
.home-stats .vg-stat { background: var(--theme-panel-soft); }
.home-stats__link { margin-top: 12px; }

@media (max-width: 1120px) {
  .home-lower { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .home-hero__copy { padding: 24px; }
  .home-hero__feature, .home-task__progress { display: none; }
}
</style>
