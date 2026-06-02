<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  CopyPlus,
  FolderKanban,
  LayoutTemplate,
  MessageCircleMore,
  Play,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-vue-next'
import UiButton from '../components/UiButton.vue'
import UiCard from '../components/UiCard.vue'

type TemplateLite = {
  id: string
  name: string
}

type VideoTaskLite = {
  id: string
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'
  outPath: string
  progress: number
  createdAt: number
}

type TaskStatLite = {
  total?: number
  running?: number
  queued?: number
  done?: number
  failed?: number
}

type MetricCard = {
  label: string
  value: string
  suffix: string
  icon: unknown
  tone: 'violet' | 'green' | 'blue' | 'orange'
}

type QuickStartCard = {
  title: string
  desc: string
  icon: unknown
  route: string
}

type TemplateCard = {
  id: string
  title: string
  subtitle: string
  thumb: string
}

type OperationCard = {
  title: string
  desc: string
  icon: unknown
  tone: 'violet' | 'blue'
  route: string
}

const router = useRouter()
const loading = ref(false)
const templates = ref<TemplateLite[]>([])
const tasks = ref<VideoTaskLite[]>([])
const taskStats = ref<TaskStatLite | null>(null)

const staticTemplateThumbs = [
  'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
]

const fallbackTemplateCards = [
  { title: '产品种草', subtitle: '15.6 万人在用' },
  { title: '口播讲解', subtitle: '32.1 万人在用' },
  { title: '旅行记录', subtitle: '8.7 万人在用' },
  { title: '美食探店', subtitle: '12.4 万人在用' },
]

const quickStartCards: QuickStartCard[] = [
  {
    title: 'AI 脚本',
    desc: '快速生成创意脚本',
    icon: Wand2,
    route: '/production',
  },
  {
    title: '爆款复刻',
    desc: '一键复刻热门视频',
    icon: CopyPlus,
    route: '/clone',
  },
  {
    title: '批量创作',
    desc: '高效生成多条视频',
    icon: FolderKanban,
    route: '/production',
  },
  {
    title: '智能剪辑',
    desc: '自动整理精彩片段',
    icon: Clapperboard,
    route: '/live-slicer',
  },
]

const operationCards: OperationCard[] = [
  {
    title: '开始复刻',
    desc: '上传参考视频，进入完整复刻流程',
    icon: CopyPlus,
    tone: 'violet',
    route: '/clone',
  },
  {
    title: '进入任务中心',
    desc: '查看进度、失败原因和输出状态',
    icon: FolderKanban,
    tone: 'violet',
    route: '/production',
  },
  {
    title: '模板中心',
    desc: '挑选可复用模板，快速起稿',
    icon: LayoutTemplate,
    tone: 'blue',
    route: '/production',
  },
]

const runningCount = computed(
  () =>
    taskStats.value?.running ??
    tasks.value.filter((item) => item.status === 'running' || item.status === 'queued').length,
)

const doneCount = computed(
  () => taskStats.value?.done ?? tasks.value.filter((item) => item.status === 'done').length,
)

const totalTaskCount = computed(() => {
  const statsTotal = taskStats.value?.total
  if (typeof statsTotal === 'number') return statsTotal
  return tasks.value.length
})

const failedCount = computed(
  () => taskStats.value?.failed ?? tasks.value.filter((item) => item.status === 'error').length,
)

const metricCards = computed<MetricCard[]>(() => [
  {
    label: '进行中',
    value: String(runningCount.value),
    suffix: '项目',
    icon: FolderKanban,
    tone: 'violet',
  },
  {
    label: '已完成',
    value: String(doneCount.value),
    suffix: '项目',
    icon: CheckCircle2,
    tone: 'green',
  },
  {
    label: '模板数量',
    value: String(templates.value.length || 1),
    suffix: '套',
    icon: LayoutTemplate,
    tone: 'blue',
  },
  {
    label: '异常任务',
    value: String(failedCount.value),
    suffix: '条',
    icon: Sparkles,
    tone: 'orange',
  },
])

const templateCards = computed<TemplateCard[]>(() =>
  Array.from({ length: 4 }, (_, index) => {
    const item = templates.value[index]
    const fallback = fallbackTemplateCards[index]
    return {
      id: item?.id || `fallback-${index + 1}`,
      title: item?.name || fallback.title,
      subtitle: fallback.subtitle,
      thumb: staticTemplateThumbs[index],
    }
  }),
)

function go(path: string) {
  void router.push(path)
}

async function refresh() {
  loading.value = true
  try {
    const [templateRows, taskRows, statsRows] = await Promise.all([
      window.api.templates.list(),
      window.api.tasks.list(),
      window.api.tasks.stats(),
    ])
    templates.value = Array.isArray(templateRows) ? (templateRows as TemplateLite[]) : []
    tasks.value = Array.isArray(taskRows) ? (taskRows as VideoTaskLite[]) : []
    taskStats.value = (statsRows || null) as TaskStatLite | null
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="home-dashboard-refined">
    <section class="home-dashboard-refined__main">
      <UiCard class="hero-card">
        <div class="hero-card__copy">
          <span class="hero-card__eyebrow">VideoGen Studio</span>
          <h1>用 AI 创作精彩视频</h1>
          <p>从灵感、脚本到复刻和导出，首页只保留最核心的创作入口。</p>

          <div class="hero-card__actions">
            <UiButton @click="go('/clone')">
              <Sparkles class="h-4 w-4" />
              开始创作
            </UiButton>
            <UiButton variant="ghost" @click="go('/production')">
              <Upload class="h-4 w-4" />
              查看任务
            </UiButton>
          </div>

          <div class="hero-card__summary">
            <span>总任务 {{ totalTaskCount }}</span>
            <span>运行中 {{ runningCount }}</span>
            <span>已完成 {{ doneCount }}</span>
          </div>
        </div>

        <div class="hero-card__visual">
          <div class="hero-card__orbit hero-card__orbit--large"></div>
          <div class="hero-card__orbit hero-card__orbit--small"></div>
          <div class="hero-card__spark hero-card__spark--a"></div>
          <div class="hero-card__spark hero-card__spark--b"></div>
          <div class="hero-card__visual-card">
            <div class="hero-card__visual-badge">AI Video</div>
            <div class="hero-card__play-shell">
              <Play class="h-12 w-12 fill-current" />
            </div>
          </div>
        </div>
      </UiCard>

      <section class="metric-grid">
        <UiCard v-for="item in metricCards" :key="item.label" class="metric-card">
          <div class="metric-card__icon" :class="`is-${item.tone}`">
            <component :is="item.icon" class="h-5 w-5" />
          </div>
          <div class="metric-card__copy">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.suffix }}</small>
          </div>
        </UiCard>
      </section>

      <UiCard class="quick-start-panel">
        <div class="panel-head">
          <h2>快速开始</h2>
        </div>
        <div class="quick-start-grid">
          <button
            v-for="item in quickStartCards"
            :key="item.title"
            class="quick-start-card"
            type="button"
            @click="go(item.route)"
          >
            <div class="quick-start-card__icon">
              <component :is="item.icon" class="h-4 w-4" />
            </div>
            <div class="quick-start-card__copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.desc }}</span>
            </div>
            <ArrowRight class="quick-start-card__arrow h-4 w-4" />
          </button>
        </div>
      </UiCard>

      <UiCard class="template-panel">
        <div class="panel-head">
          <h2>推荐模板</h2>
          <button class="panel-link" type="button" @click="go('/production')">查看全部</button>
        </div>
        <div class="template-grid">
          <button
            v-for="item in templateCards"
            :key="item.id"
            class="template-card"
            type="button"
            @click="go('/production')"
          >
            <img :src="item.thumb" :alt="item.title" />
            <div class="template-card__overlay"></div>
            <div class="template-card__copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.subtitle }}</span>
            </div>
            <ArrowRight class="template-card__arrow h-4 w-4" />
          </button>
        </div>
      </UiCard>
    </section>

    <aside class="home-dashboard-refined__side">
      <UiCard class="side-panel">
        <div class="panel-head">
          <h2>快捷操作</h2>
        </div>
        <div class="operation-list">
          <button
            v-for="item in operationCards"
            :key="item.title"
            class="operation-card"
            type="button"
            @click="go(item.route)"
          >
            <div class="operation-card__icon" :class="`is-${item.tone}`">
              <component :is="item.icon" class="h-4 w-4" />
            </div>
            <div class="operation-card__copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.desc }}</span>
            </div>
            <ArrowRight class="operation-card__arrow h-4 w-4" />
          </button>
        </div>
      </UiCard>

      <UiCard class="side-panel assistant-shell">
        <div class="panel-head panel-head--stack">
          <h2>AI 助手</h2>
          <p>你的智能创作助手</p>
        </div>

        <div class="assistant-shell__visual">
          <div class="assistant-shell__avatar">
            <MessageCircleMore class="h-8 w-8" />
          </div>
        </div>

        <div class="assistant-shell__copy">
          <strong>需要脚本、模板还是复刻建议？</strong>
          <span>从这里进入下一步创作动作。</span>
        </div>

        <button class="assistant-shell__cta" type="button">
          开始对话
        </button>
      </UiCard>
    </aside>
  </div>
</template>

<style scoped>
.home-dashboard-refined {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 276px;
  gap: 14px;
  min-height: 0;
  padding: 2px 0 8px;
  color: #f8fafc;
}

.home-dashboard-refined__main,
.home-dashboard-refined__side,
.metric-grid,
.quick-start-grid,
.template-grid,
.operation-list {
  display: grid;
  gap: 14px;
}

.hero-card,
.metric-card,
.quick-start-panel,
.template-panel,
.side-panel {
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background:
    linear-gradient(180deg, rgba(11, 17, 30, 0.98), rgba(8, 14, 26, 0.98)),
    radial-gradient(circle at 20% 0, rgba(109, 93, 255, 0.1), transparent 28%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 30px 70px rgba(0, 0, 0, 0.24);
}

.hero-card,
.quick-start-panel,
.template-panel,
.side-panel {
  padding: 16px !important;
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(240px, 0.72fr);
  min-height: 188px;
  overflow: hidden;
}

.hero-card__copy {
  display: grid;
  align-content: center;
  gap: 10px;
}

.hero-card__eyebrow {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(123, 97, 255, 0.12);
  color: #c8bcff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.hero-card__copy h1 {
  margin: 0;
  font-size: clamp(30px, 2.6vw, 38px);
  line-height: 1.08;
  letter-spacing: -0.04em;
  font-weight: 800;
}

.hero-card__copy p {
  max-width: 520px;
  margin: 0;
  color: #92a2c7;
  font-size: 14px;
  line-height: 1.45;
}

.hero-card__actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.hero-card__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-card__summary span {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #c6d1eb;
  font-size: 12px;
}

.hero-card__visual {
  position: relative;
  min-height: 172px;
}

.hero-card__visual-card {
  position: absolute;
  inset: 50% auto auto 50%;
  display: grid;
  place-items: center;
  width: 164px;
  height: 164px;
  border-radius: 34px;
  transform: translate(-50%, -50%) rotate(-12deg);
  background:
    radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.3), transparent 24%),
    linear-gradient(180deg, #8e6fff 0%, #6f55ff 58%, #5e45ec 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.36),
    0 42px 90px rgba(93, 62, 255, 0.34);
}

.hero-card__visual-badge {
  position: absolute;
  top: 16px;
  left: 16px;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.92);
  font-size: 11px;
  font-weight: 700;
  line-height: 26px;
}

.hero-card__play-shell {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(6px);
}

.hero-card__orbit {
  position: absolute;
  inset: 50% auto auto 50%;
  border-radius: 999px;
  border: 1px solid rgba(123, 97, 255, 0.22);
  transform: translate(-50%, -50%);
}

.hero-card__orbit--large {
  width: 260px;
  height: 102px;
}

.hero-card__orbit--small {
  width: 196px;
  height: 74px;
  border-color: rgba(255, 255, 255, 0.1);
}

.hero-card__spark {
  position: absolute;
  border-radius: 999px;
  background: rgba(164, 145, 255, 0.95);
  box-shadow: 0 0 20px rgba(123, 97, 255, 0.42);
}

.hero-card__spark--a {
  top: 30px;
  right: 24px;
  width: 7px;
  height: 7px;
}

.hero-card__spark--b {
  left: 34px;
  bottom: 24px;
  width: 8px;
  height: 8px;
}

.metric-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 80px;
  padding: 14px 16px !important;
}

.metric-card__icon,
.quick-start-card__icon,
.operation-card__icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 16px;
}

.metric-card__icon {
  width: 36px;
  height: 36px;
}

.metric-card__icon.is-violet,
.quick-start-card__icon,
.operation-card__icon.is-violet {
  background: linear-gradient(135deg, rgba(120, 95, 255, 0.34), rgba(93, 69, 224, 0.22));
  color: #a998ff;
}

.metric-card__icon.is-green {
  background: linear-gradient(135deg, rgba(64, 189, 126, 0.28), rgba(38, 104, 73, 0.22));
  color: #7ae1a8;
}

.metric-card__icon.is-blue,
.operation-card__icon.is-blue {
  background: linear-gradient(135deg, rgba(73, 126, 255, 0.28), rgba(38, 65, 129, 0.22));
  color: #7eb1ff;
}

.metric-card__icon.is-orange {
  background: linear-gradient(135deg, rgba(255, 149, 76, 0.26), rgba(114, 64, 36, 0.22));
  color: #ffb178;
}

.metric-card__copy {
  display: grid;
  gap: 4px;
}

.metric-card__copy span,
.metric-card__copy small {
  color: #8ea0c7;
  font-size: 13px;
}

.metric-card__copy strong {
  color: #f8fafc;
  font-size: 18px;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.panel-head--stack {
  align-items: flex-start;
  flex-direction: column;
  justify-content: flex-start;
}

.panel-head h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 17px;
  font-weight: 700;
}

.panel-head p {
  margin: 0;
  color: #8ea0c7;
  font-size: 14px;
}

.panel-link {
  color: #96a8d1;
  font-size: 14px;
  font-weight: 600;
}

.quick-start-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.quick-start-card,
.operation-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(255, 255, 255, 0.025);
  text-align: left;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.quick-start-card:hover,
.operation-card:hover,
.template-card:hover {
  transform: translateY(-2px);
  border-color: rgba(123, 97, 255, 0.26);
  background: rgba(255, 255, 255, 0.04);
}

.quick-start-card__icon,
.operation-card__icon {
  width: 34px;
  height: 34px;
}

.quick-start-card__copy,
.operation-card__copy {
  display: grid;
  gap: 2px;
  flex: 1;
}

.quick-start-card__copy strong,
.operation-card__copy strong {
  color: #f8fafc;
  font-size: 14px;
}

.quick-start-card__copy span,
.operation-card__copy span {
  color: #8ea0c7;
  font-size: 12px;
}

.quick-start-card__arrow,
.operation-card__arrow {
  color: #7f91be;
}

.template-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.template-card {
  position: relative;
  min-height: 104px;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(255, 255, 255, 0.03);
  text-align: left;
}

.template-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.template-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(7, 12, 22, 0.08), rgba(7, 12, 22, 0.78));
}

.template-card__copy,
.template-card__arrow {
  position: absolute;
  z-index: 1;
}

.template-card__copy {
  left: 14px;
  right: 34px;
  bottom: 12px;
  display: grid;
  gap: 6px;
}

.template-card__copy strong {
  color: #ffffff;
  font-size: 14px;
}

.template-card__copy span {
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
}

.template-card__arrow {
  right: 14px;
  bottom: 14px;
  color: rgba(255, 255, 255, 0.88);
}

.operation-list {
  gap: 8px;
}

.assistant-shell {
  display: grid;
  gap: 14px;
  align-content: start;
}

.assistant-shell__visual {
  display: grid;
  place-items: center;
  padding-top: 4px;
}

.assistant-shell__avatar {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.22), transparent 28%),
    linear-gradient(135deg, rgba(122, 97, 255, 0.92), rgba(78, 59, 198, 0.78));
  color: #f4f3ff;
  box-shadow:
    0 0 0 14px rgba(123, 97, 255, 0.08),
    0 26px 54px rgba(87, 58, 244, 0.28);
}

.assistant-shell__copy {
  display: grid;
  gap: 6px;
}

.assistant-shell__copy strong {
  color: #d8def0;
  font-size: 14px;
  font-weight: 600;
}

.assistant-shell__copy span {
  color: #8ea0c7;
  font-size: 12px;
  line-height: 1.6;
}

.assistant-shell__cta {
  min-height: 48px;
  border-radius: 16px;
  border: 1px solid rgba(123, 97, 255, 0.28);
  background: linear-gradient(180deg, rgba(49, 37, 118, 0.42), rgba(37, 27, 93, 0.4));
  color: #f4f0ff;
  font-size: 14px;
  font-weight: 700;
}

@media (max-width: 1280px) {
  .home-dashboard-refined {
    grid-template-columns: 1fr;
  }

  .home-dashboard-refined__side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1200px) {
  .hero-card {
    grid-template-columns: 1fr;
  }

  .metric-grid,
  .quick-start-grid,
  .template-grid,
  .home-dashboard-refined__side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .home-dashboard-refined {
    padding: 4px 0 16px;
  }

  .metric-grid,
  .quick-start-grid,
  .template-grid,
  .home-dashboard-refined__side {
    grid-template-columns: 1fr;
  }
}
</style>
