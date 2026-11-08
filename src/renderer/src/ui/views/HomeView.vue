<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  BarChart3,
  Captions,
  Download,
  Images,
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
  { to: '/plugins/tiktok-gmv-max-optimizer', icon: BarChart3, title: 'GMV MAX 优化器', description: '优化投放参数，提升 GMV 效果', tone: 'teal' },
  { to: '/plugins/product-image-materials', icon: Images, title: '商品图片素材', description: '批量处理商品图片素材', tone: 'blue' },
  { to: '/plugins/dianxiaomi-inventory', icon: Package, title: '店小秘库存分析', description: '跟踪 SKU 库存，预警风险', tone: 'gold' },
  { to: '/plugins/live-photo-generator', icon: PlaySquare, title: '动态照片生成器', description: '将静态图生成 Live Photo', tone: 'pink' },
  { to: '/plugins/tiktok-creative-studio', icon: WandSparkles, title: 'TikTok 创意工作室', description: '一键生成创意视频脚本', tone: 'purple' },
  { to: '/plugins/tiktok-creator-outreach', icon: Users, title: 'TikTok Creator Outreach', description: '达人管理与邀约', tone: 'mint' },
  { to: '/plugins/video-parser-download', icon: Download, title: '视频解析下载', description: '解析下载无水印视频', tone: 'cyan' },
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
  { value: todayTasks.value.length, label: '今日任务', trend: `${tasks.value.length} 总计`, tone: 'teal' },
  { value: runningTaskCount.value, label: '处理中', trend: '实时', tone: 'purple' },
  { value: doneTaskCount.value, label: '今日完成', trend: '已完成', tone: 'gold' },
  { value: failedTaskCount.value, label: '今日失败', trend: '需处理', tone: 'pink' },
])

function formatTime(timestamp: number) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function taskTitle(task: ProductionTask) {
  return task.productId ? (productNameMap.value.get(task.productId) || task.productId) : `任务 ${task.id.slice(0, 8)}`
}

function taskStatus(task: ProductionTask) {
  return `${task.status || 'queued'} ${Math.round(Number(task.progress || 0) * 100)}%`
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
  <main class="home-page">
    <section class="home-hero" :style="{ '--hero-image': `url(${heroImage})` }">
      <div class="home-hero__copy">
        <span class="home-hero__badge">AI 驱动 · 高效 · 专业</span>
        <h1>一站式 <strong>TikTok</strong> 视频生产平台</h1>
        <p>从商品到成片，助你快速打造爆款视频</p>
        <div class="home-hero__actions">
          <button type="button" class="home-hero__button" @click="open('/production/create')">
            <span>开始创作</span><ArrowRight class="h-4 w-4" />
          </button>
          <span class="home-hero__feature"><Sparkles class="h-4 w-4" /> AI 智能生成</span>
          <span class="home-hero__feature"><PlaySquare class="h-4 w-4" /> 高质量视频</span>
          <span class="home-hero__feature"><Images class="h-4 w-4" /> 批量高效处理</span>
        </div>
      </div>
    </section>

    <section class="home-section home-section--tools">
      <div class="home-section__heading">
        <div>
          <h2><span class="home-section__mark"></span>常用工具</h2>
          <p>快速进入你需要的功能，开始高效创作</p>
        </div>
        <button type="button" class="home-section__link" @click="open('/plugins')">插件中心 <ArrowRight class="h-4 w-4" /></button>
      </div>
      <div class="tool-grid">
        <button v-for="tool in tools" :key="tool.to" type="button" class="tool-card" :class="`tool-card--${tool.tone}`" @click="open(tool.to)">
          <span class="tool-card__icon"><component :is="tool.icon" class="h-6 w-6" /></span>
          <span class="tool-card__copy"><strong>{{ tool.title }}</strong><small>{{ tool.description }}</small></span>
          <span class="tool-card__arrow"><ArrowRight class="h-4 w-4" /></span>
        </button>
      </div>
    </section>

    <section class="home-lower">
      <div class="projects-panel home-panel">
        <div class="home-panel__heading">
          <h2><span class="home-section__mark"></span>我的项目</h2>
          <div class="project-tabs"><button class="is-active" type="button">全部</button><button type="button">视频</button><button type="button">图片</button><button type="button">草稿</button></div>
          <button type="button" class="new-project" @click="open('/production/create')"><Plus class="h-4 w-4" />新建项目</button>
        </div>
        <div v-if="recentTasks.length" class="project-grid">
          <button v-for="(task, index) in recentTasks" :key="task.id" type="button" class="project-card" @click="open(`/production/tasks/${task.id}`)">
            <span class="project-card__image" :style="{ backgroundImage: `url(${heroImage})`, backgroundPosition: `${index * 25}% center` }"><span>{{ statusLabel(task.status) }}</span></span>
            <strong>{{ taskTitle(task) }}</strong>
            <small>{{ formatTime(task.createdAt) }} · {{ taskStatus(task) }}</small>
          </button>
        </div>
        <div v-else class="project-empty">{{ loading ? '正在加载任务...' : '暂无生产任务，开始创建你的第一个视频吧' }}</div>
      </div>

      <div class="stats-panel home-panel">
        <div class="home-panel__heading"><h2><span class="home-section__mark"></span>今日数据</h2><time>{{ currentDateLabel }}</time></div>
        <div class="stats-grid">
          <div v-for="stat in stats" :key="stat.label" class="stat-card" :class="`stat-card--${stat.tone}`"><strong>{{ stat.value }}</strong><small>{{ stat.label }}</small><em>{{ stat.trend }}</em></div>
        </div>
        <button type="button" class="stats-link" @click="open('/production/tasks')"><BarChart3 class="h-4 w-4" />查看完整数据 <ArrowRight class="h-4 w-4" /></button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-page { width: min(1408px, 100%); margin: 0 auto; padding: 10px 8px 34px; color: var(--theme-text); }
.home-hero { position: relative; min-height: 274px; overflow: hidden; border: 1px solid rgba(20, 184, 166, 0.7); border-radius: 18px; background: linear-gradient(90deg, rgba(3, 31, 32, 0.98) 0%, rgba(2, 48, 49, 0.87) 46%, rgba(2, 48, 49, 0.15) 100%), var(--hero-image) right center / cover no-repeat; box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.22); }
.home-hero__copy { position: relative; z-index: 1; display: grid; align-content: center; max-width: 740px; min-height: 274px; padding: 28px 48px; }
.home-hero__badge { width: fit-content; padding: 5px 12px; border: 1px solid #10cbb9; border-radius: 999px; color: #31e5d2; font-size: 12px; font-weight: 700; }
.home-hero h1 { margin: 20px 0 8px; font-size: clamp(28px, 3vw, 44px); font-weight: 800; line-height: 1.15; letter-spacing: 0; }
.home-hero h1 strong { color: #13dcc9; }
.home-hero p { margin: 0; color: #c6d7dc; font-size: 17px; }
.home-hero__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; margin-top: 22px; }
.home-hero__button { display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 22px; border: 0; border-radius: 12px; background: #d7fff9; color: #073e3b; font-size: 15px; font-weight: 800; cursor: pointer; }
.home-hero__feature { display: inline-flex; align-items: center; gap: 7px; color: #b8d7d8; font-size: 12px; }
.home-hero__feature svg { color: #14d9c5; }
.home-section { margin-top: 22px; }
.home-section__heading, .home-panel__heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.home-section__heading h2, .home-panel__heading h2 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 20px; font-weight: 800; }
.home-section__heading p { margin: 4px 0 0 18px; color: var(--theme-text-muted); font-size: 12px; }
.home-section__mark { width: 5px; height: 25px; border-radius: 99px; background: #16d5c4; box-shadow: 0 0 14px rgba(22, 213, 196, 0.48); }
.home-section__link { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border: 1px solid var(--theme-accent); border-radius: 10px; background: transparent; color: var(--theme-control-selected-text); font-size: 12px; font-weight: 700; cursor: pointer; }
.tool-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.tool-card { display: flex; align-items: center; gap: 13px; min-width: 0; min-height: 96px; padding: 14px; border: 1px solid var(--tool-border, #274b56); border-radius: 13px; background: var(--tool-bg, #10252e); color: var(--theme-text); text-align: left; cursor: pointer; transition: transform 160ms ease, border-color 160ms ease; }
.tool-card:hover { border-color: #24d8c4; transform: translateY(-2px); }
.tool-card__icon { display: grid; flex: 0 0 auto; width: 62px; height: 62px; place-items: center; border-radius: 14px; background: var(--tool-icon, #0f9d91); color: #fff; }
.tool-card__copy { display: grid; min-width: 0; flex: 1 1 auto; gap: 6px; }
.tool-card__copy strong { overflow: hidden; font-size: 14px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.tool-card__copy small { overflow: hidden; color: var(--theme-text-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.tool-card__arrow { display: grid; flex: 0 0 auto; width: 30px; height: 30px; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--theme-accent) 12%, transparent); color: var(--theme-text-secondary); }
.tool-card--teal { --tool-bg: #0f2c34; --tool-border: #176c73; --tool-icon: #18b7a9; }
.tool-card--blue { --tool-bg: #14243e; --tool-border: #38547e; --tool-icon: #5757dd; }
.tool-card--gold { --tool-bg: #292c27; --tool-border: #695e3e; --tool-icon: #c28b20; }
.tool-card--pink { --tool-bg: #2b202b; --tool-border: #654a5a; --tool-icon: #c34d82; }
.tool-card--purple { --tool-bg: #201b3a; --tool-border: #59458e; --tool-icon: #7545c9; }
.tool-card--mint { --tool-bg: #10302f; --tool-border: #176c67; --tool-icon: #16b89c; }
.tool-card--cyan { --tool-bg: #112a3b; --tool-border: #28617f; --tool-icon: #129dca; }
.tool-card--green { --tool-bg: #102e31; --tool-border: #176b65; --tool-icon: #13b974; }
.home-lower { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(320px, 0.8fr); gap: 14px; margin-top: 18px; }
.home-panel { padding: 16px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.project-tabs { display: flex; gap: 4px; margin-right: auto; }
.project-tabs button { padding: 7px 11px; border: 0; border-radius: 999px; background: transparent; color: var(--theme-text-muted); font-size: 11px; cursor: pointer; }
.project-tabs button.is-active, .project-tabs button:hover { background: var(--theme-control-selected); color: var(--theme-control-selected-text); }
.new-project { display: inline-flex; align-items: center; gap: 6px; padding: 9px 13px; border: 0; border-radius: 10px; background: var(--theme-accent); color: var(--theme-on-accent); font-size: 12px; font-weight: 800; cursor: pointer; }
.project-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
.project-card { min-width: 0; padding: 0; border: 0; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; }
.project-card__image { position: relative; display: block; aspect-ratio: 1.16; overflow: hidden; border-radius: 10px; background-color: #17343a; background-size: 220%; }
.project-card__image span { position: absolute; right: 6px; bottom: 6px; padding: 3px 5px; border-radius: 5px; background: rgba(0, 0, 0, 0.72); color: #fff; font-size: 10px; }
.project-card strong { display: block; overflow: hidden; margin-top: 8px; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.project-card small { display: block; margin-top: 5px; color: var(--theme-text-muted); font-size: 10px; }
.project-empty { display: grid; min-height: 118px; place-items: center; color: var(--theme-text-muted); font-size: 12px; }
.stats-panel .home-panel__heading time { padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: 9px; color: var(--theme-text-secondary); font-size: 11px; }
.stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
.stat-card { position: relative; min-height: 76px; overflow: hidden; padding: 11px 12px; border: 1px solid var(--stat-border); border-radius: 11px; background: var(--stat-bg); color: var(--theme-text); }
.stat-card strong, .stat-card small { display: block; }
.stat-card strong { font-size: 19px; }
.stat-card small { margin-top: 4px; color: var(--theme-text-secondary); font-size: 10px; }
.stat-card em { position: absolute; top: 11px; right: 10px; color: var(--stat-color); font-size: 10px; font-style: normal; }
.stat-card--teal { --stat-bg: #102f35; --stat-border: #255b69; --stat-color: #18d3be; }
.stat-card--purple { --stat-bg: #25203d; --stat-border: #554b7a; --stat-color: #ac8cff; }
.stat-card--gold { --stat-bg: #302b21; --stat-border: #6c5933; --stat-color: #ffc344; }
.stat-card--pink { --stat-bg: #30202d; --stat-border: #70435a; --stat-color: #ff7ab0; }
.stat-bars { position: absolute; right: 10px; bottom: 9px; display: flex; align-items: end; gap: 3px; height: 22px; }
.stat-bars i { display: block; width: 4px; border-radius: 2px 2px 0 0; background: var(--stat-color); opacity: 0.8; }
.stats-link { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 40px; margin-top: 12px; border: 0; border-radius: 9px; background: var(--theme-accent); color: var(--theme-on-accent); font-size: 12px; font-weight: 800; cursor: pointer; }
:global(html[data-app-theme='light-teal']) .home-panel,
:global(html[data-app-theme='mono']) .home-panel { background: var(--theme-panel); }
:global(html[data-app-theme='light-teal']) .tool-card,
:global(html[data-app-theme='mono']) .tool-card { --tool-bg: var(--theme-panel-soft); --tool-border: var(--theme-border); color: var(--theme-text); }
:global(html[data-app-theme='light-teal']) .tool-card__copy small,
:global(html[data-app-theme='mono']) .tool-card__copy small { color: var(--theme-text-secondary); }
:global(html[data-app-theme='light-teal']) .stat-card,
:global(html[data-app-theme='mono']) .stat-card { --stat-bg: var(--theme-panel-soft); --stat-border: var(--theme-border); --stat-color: var(--theme-accent); }
:global(html[data-app-theme='light-teal']) .stat-card em,
:global(html[data-app-theme='mono']) .stat-card em { color: var(--theme-accent); }
@media (max-width: 1120px) { .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .project-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .home-lower { grid-template-columns: 1fr; } }
@media (max-width: 680px) { .home-page { padding-inline: 2px; } .home-hero__copy { padding: 24px; } .home-hero h1 { font-size: 30px; } .home-hero__feature { display: none; } .tool-grid, .project-grid { grid-template-columns: 1fr; } .home-section__heading, .home-panel__heading { align-items: flex-start; flex-wrap: wrap; } .project-tabs { order: 3; width: 100%; } }
</style>
