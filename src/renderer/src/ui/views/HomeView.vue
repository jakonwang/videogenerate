<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  CopyPlus,
  FolderKanban,
  Library,
  MessageCircleMore,
  ScanSearch,
  Search,
  Sparkles,
  Upload,
  Video,
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

type CloneProjectLite = {
  id: string
  title?: string
  status?: string
  updatedAt?: number
  coverAssetPath?: string
  referenceVideoName?: string
  referenceVideoPath?: string
  previewOutputPath?: string
  finalOutputPath?: string
  outputDir?: string
  modelName?: string
  lastError?: string
}

type TaskStatLite = {
  total?: number
  running?: number
  queued?: number
  done?: number
  failed?: number
}

type RecentTaskCard = {
  id: string
  title: string
  thumb: string
  progress: number
  statusLabel: string
  statusTone: 'running' | 'done' | 'error'
}

type TemplateCard = {
  id: string
  title: string
  subtitle: string
  thumb: string
}

const router = useRouter()
const loading = ref(false)
const templates = ref<TemplateLite[]>([])
const tasks = ref<VideoTaskLite[]>([])
const cloneProjects = ref<CloneProjectLite[]>([])
const taskStats = ref<TaskStatLite | null>(null)

const staticTemplateThumbs = [
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=640&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=640&q=80',
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=640&q=80',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=640&q=80',
]

const quickCreateItems = [
  {
    title: '爆款复刻',
    desc: '上传参考视频，AI 分析生成',
    icon: CopyPlus,
    route: '/clone',
  },
  {
    title: '批量生成',
    desc: '批量生成多个视频任务',
    icon: FolderKanban,
    route: '/tasks',
  },
  {
    title: '直播切片',
    desc: '智能切片直播长视频',
    icon: Clapperboard,
    route: '/live-slicer',
  },
  {
    title: '模板应用',
    desc: '使用模板快速生成视频',
    icon: Library,
    route: '/templates',
  },
]

const assistantPrompts = [
  '分析参考视频，生成爆款脚本',
  '推荐适合当前内容的模板',
  '优化视频节奏和转化点',
]

const sortedTasks = computed(() =>
  [...tasks.value].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)),
)

const sortedCloneProjects = computed(() =>
  [...cloneProjects.value].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
)

const runningCount = computed(
  () =>
    taskStats.value?.running ??
    tasks.value.filter((item) => item.status === 'running' || item.status === 'queued').length,
)

const doneCount = computed(
  () =>
    taskStats.value?.done ??
    tasks.value.filter((item) => item.status === 'done').length,
)

const failedCount = computed(
  () =>
    taskStats.value?.failed ??
    tasks.value.filter((item) => item.status === 'error' || item.status === 'cancelled').length,
)

const recentTasks = computed<RecentTaskCard[]>(() => {
  const cloneRows = sortedCloneProjects.value.slice(0, 4)
  return cloneRows.map((item, index) => {
    const status = normalizeProjectStatus(item.status)
    return {
      id: item.id,
      title: item.title || basename(item.referenceVideoName || item.referenceVideoPath || item.outputDir || `项目 ${index + 1}`),
      thumb: previewImageFor(item, index),
      progress: projectProgress(status, index),
      statusLabel: status.label,
      statusTone: status.tone,
    }
  })
})

const templateCards = computed<TemplateCard[]>(() =>
  templates.value.slice(0, 4).map((item, index) => ({
    id: item.id,
    title: item.name || `模板 ${index + 1}`,
    subtitle: `使用 ${(12.5 - index * 1.4).toFixed(1)}w`,
    thumb: staticTemplateThumbs[index % staticTemplateThumbs.length],
  })),
)

const currentWorkflowStep = computed(() => {
  if (doneCount.value) return 5
  if (runningCount.value >= 3) return 4
  if (runningCount.value >= 2) return 3
  if (runningCount.value >= 1) return 2
  return 1
})

const workflowNodes = computed(() => [
  { key: 1, title: '参考分析' },
  { key: 2, title: '脚本生成' },
  { key: 3, title: '分镜设计' },
  { key: 4, title: '分镜视频' },
  { key: 5, title: '成片合成' },
  { key: 6, title: '发布导出' },
])

function basename(input: string) {
  return (input ?? '').split(/[/\\]/).pop() ?? input
}

function previewImageFor(item: CloneProjectLite, index: number) {
  const path = item.coverAssetPath || item.finalOutputPath || item.previewOutputPath || item.referenceVideoPath || ''
  if (path) return `file:///${path.replace(/\\/g, '/')}`
  return staticTemplateThumbs[index % staticTemplateThumbs.length]
}

function normalizeProjectStatus(status?: string) {
  const text = String(status || '').toLowerCase()
  if (text.includes('done') || text.includes('complete') || text.includes('success')) {
    return { label: '已完成', tone: 'done' as const }
  }
  if (text.includes('fail') || text.includes('error') || text.includes('cancel')) {
    return { label: '异常', tone: 'error' as const }
  }
  return { label: '生成中', tone: 'running' as const }
}

function projectProgress(status: { tone: 'running' | 'done' | 'error' }, index: number) {
  if (status.tone === 'done') return 100
  if (status.tone === 'error') return 38
  return Math.max(22, Math.min(92, 72 - index * 18))
}

function go(path: string) {
  void router.push(path)
}

async function refresh() {
  loading.value = true
  try {
    const [templateRows, taskRows, statsRows, cloneRows] = await Promise.all([
      window.api.templates.list(),
      window.api.tasks.list(),
      window.api.tasks.stats(),
      window.api.clone.listProjects(),
    ])
    templates.value = Array.isArray(templateRows) ? (templateRows as TemplateLite[]) : []
    tasks.value = Array.isArray(taskRows) ? (taskRows as VideoTaskLite[]) : []
    taskStats.value = (statsRows || null) as TaskStatLite | null
    cloneProjects.value = Array.isArray(cloneRows) ? (cloneRows as CloneProjectLite[]) : []
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="home-page">
    <section class="home-grid">
      <div class="home-main">
        <UiCard class="hero-card">
          <div class="hero-card__copy">
            <h1>
              让 AI 帮你批量生产
              <span>高质量短视频</span>
            </h1>
            <p>从灵感到爆款，只需 7 步自动完成</p>
            <div class="hero-card__actions">
              <UiButton @click="go('/clone')">
                <Sparkles class="h-4 w-4" />
                开始新任务
              </UiButton>
              <UiButton variant="ghost" @click="go('/clone')">
                <Upload class="h-4 w-4" />
                导入参考视频
              </UiButton>
            </div>
          </div>

          <div class="hero-card__visual">
            <div class="hero-orbit hero-orbit--left top-4">智能分析</div>
            <div class="hero-orbit hero-orbit--left mid-1">脚本生成</div>
            <div class="hero-orbit hero-orbit--left mid-2">分镜设计</div>
            <div class="hero-cube">
              <span>AI</span>
            </div>
            <div class="hero-orbit hero-orbit--right top-4">分镜视频</div>
            <div class="hero-orbit hero-orbit--right mid-1">成片合成</div>
            <div class="hero-orbit hero-orbit--right mid-2">发布导出</div>
          </div>
        </UiCard>

        <div class="content-grid">
          <UiCard class="section-card recent-card">
            <div class="section-head">
              <strong>最近任务</strong>
              <button class="section-link" type="button" @click="go('/tasks')">
                查看全部
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>

            <div class="recent-list">
              <article v-for="item in recentTasks" :key="item.id" class="recent-row">
                <img :src="item.thumb" alt="task-preview" />
                <div class="recent-row__main">
                  <strong>{{ item.title }}</strong>
                  <div class="recent-progress">
                    <span class="recent-progress__track">
                      <span class="recent-progress__fill" :style="{ width: `${item.progress}%` }"></span>
                    </span>
                    <em v-if="item.statusTone === 'running'">{{ item.progress }}%</em>
                    <em v-else-if="item.statusTone === 'done'" class="is-success">已完成</em>
                    <em v-else class="is-error">异常</em>
                  </div>
                </div>
              </article>
            </div>
          </UiCard>

          <UiCard class="section-card template-card-panel">
            <div class="section-head">
              <strong>推荐模板</strong>
              <button class="section-link" type="button" @click="go('/templates')">
                更多模板
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>

            <div class="template-strip">
              <article v-for="item in templateCards" :key="item.id" class="template-tile">
                <img :src="item.thumb" alt="template-preview" />
                <div class="template-tile__copy">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.subtitle }}</span>
                </div>
              </article>
            </div>
          </UiCard>
        </div>

        <UiCard class="section-card workflow-card">
          <div class="section-head">
            <strong>生产流程</strong>
          </div>

          <div class="workflow-track">
            <div
              v-for="node in workflowNodes"
              :key="node.key"
              class="workflow-step"
              :class="{
                'is-done': node.key < currentWorkflowStep,
                'is-active': node.key === currentWorkflowStep,
                'is-next': node.key > currentWorkflowStep,
              }"
            >
              <div class="workflow-step__dot">
                <CheckCircle2 v-if="node.key < currentWorkflowStep" class="h-4 w-4" />
                <span v-else>{{ node.key }}</span>
              </div>
              <strong>{{ node.title }}</strong>
            </div>
          </div>
        </UiCard>
      </div>

      <aside class="home-side">
        <UiCard class="side-card">
          <div class="section-head">
            <strong>快速创建</strong>
          </div>

          <div class="quick-create-list">
            <button v-for="item in quickCreateItems" :key="item.title" class="quick-create-item" type="button" @click="go(item.route)">
              <div class="quick-create-item__icon">
                <component :is="item.icon" class="h-4 w-4" />
              </div>
              <div class="quick-create-item__copy">
                <strong>{{ item.title }}</strong>
                <span>{{ item.desc }}</span>
              </div>
            </button>
          </div>
        </UiCard>

        <UiCard class="side-card assistant-card">
          <div class="section-head">
            <strong>AI 助手</strong>
          </div>

          <div class="assistant-visual">
            <div class="assistant-avatar">
              <MessageCircleMore class="h-9 w-9" />
            </div>
          </div>

          <div class="assistant-panel">
            <span>你好！我可以帮你：</span>
            <button v-for="item in assistantPrompts" :key="item" class="assistant-suggestion" type="button">
              <ScanSearch class="h-4 w-4" />
              <strong>{{ item }}</strong>
            </button>
          </div>

          <div class="assistant-input">
            <input type="text" placeholder="输入你的问题..." />
            <button type="button">
              <Sparkles class="h-4 w-4" />
            </button>
          </div>
        </UiCard>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  display: grid;
  gap: 0;
  min-height: 100%;
  padding: 0 2px 8px;
  color: #f8fafc;
}

.section-head,
.hero-card__actions,
.assistant-input,
.section-link,
.quick-create-item,
.workflow-track,
.workflow-step {
  display: flex;
  align-items: center;
}

.section-head strong,
.quick-create-item__copy strong,
.template-tile__copy strong,
.recent-row__main strong,
.workflow-step strong {
  color: #eef3ff;
}

.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 14px;
  margin-top: 2px;
}

.home-main,
.home-side,
.content-grid,
.recent-list,
.quick-create-list,
.assistant-panel {
  display: grid;
  gap: 14px;
}

.hero-card,
.section-card,
.side-card {
  padding: 18px !important;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    radial-gradient(circle at top left, rgba(109, 93, 255, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(11, 18, 33, 0.98), rgba(8, 13, 25, 0.98));
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(420px, 0.8fr);
  gap: 20px;
  min-height: 352px;
}

.hero-card__copy {
  display: grid;
  align-content: center;
  gap: 18px;
  padding: 8px 10px;
}

.hero-card__copy h1 {
  margin: 0;
  font-size: clamp(40px, 4vw, 58px);
  line-height: 1.08;
  letter-spacing: -0.02em;
}

.hero-card__copy h1 span {
  display: block;
  color: #7d6bff;
}

.hero-card__copy p,
.quick-create-item__copy span,
.template-tile__copy span,
.assistant-panel span {
  margin: 0;
  color: #95a5c8;
  font-size: 14px;
  line-height: 1.6;
}

.hero-card__visual {
  position: relative;
  min-height: 300px;
}

.hero-cube {
  position: absolute;
  inset: 50% auto auto 50%;
  width: 168px;
  height: 168px;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  border-radius: 32px;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.36), transparent 24%),
    linear-gradient(135deg, rgba(81, 112, 255, 0.9), rgba(148, 90, 255, 0.72));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.16),
    0 20px 80px rgba(109, 93, 255, 0.42),
    inset 0 1px 18px rgba(255, 255, 255, 0.26);
}

.hero-cube::before,
.hero-cube::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(109, 93, 255, 0.24);
}

.hero-cube::before {
  width: 280px;
  height: 280px;
}

.hero-cube::after {
  width: 360px;
  height: 360px;
}

.hero-cube span {
  color: #f8faff;
  font-size: 64px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.hero-orbit {
  position: absolute;
  min-height: 42px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(12, 20, 36, 0.84);
  color: #dce5ff;
  font-size: 13px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
}

.hero-orbit--left.top-4 {
  top: 10px;
  left: 24px;
}

.hero-orbit--left.mid-1 {
  top: 96px;
  left: -4px;
}

.hero-orbit--left.mid-2 {
  bottom: 42px;
  left: 26px;
}

.hero-orbit--right.top-4 {
  top: 8px;
  right: 24px;
}

.hero-orbit--right.mid-1 {
  top: 96px;
  right: -2px;
}

.hero-orbit--right.mid-2 {
  bottom: 22px;
  right: 20px;
}

.content-grid {
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.35fr);
}

.section-head {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.section-head strong {
  font-size: 18px;
}

.section-link {
  gap: 4px;
  color: #8ea0c7;
  font-size: 13px;
}

.recent-list {
  gap: 12px;
}

.recent-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.recent-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.recent-row img,
.template-tile img {
  width: 100%;
  display: block;
  object-fit: cover;
  border-radius: 14px;
}

.recent-row img {
  height: 60px;
}

.recent-row__main {
  display: grid;
  gap: 10px;
}

.recent-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.recent-progress__track {
  flex: 1;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.recent-progress__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7d6bff, #59a7ff);
}

.recent-progress em {
  color: #cfd8ef;
  font-size: 12px;
  font-style: normal;
}

.recent-progress em.is-success {
  color: #53d08f;
}

.recent-progress em.is-error {
  color: #ff7d7d;
}

.template-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.template-tile {
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.template-tile img {
  height: 210px;
}

.template-tile__copy {
  display: grid;
  gap: 4px;
  padding: 12px;
}

.workflow-card {
  gap: 18px;
}

.workflow-track {
  justify-content: space-between;
  gap: 10px;
}

.workflow-step {
  flex: 1;
  gap: 10px;
  justify-content: center;
  color: #8698bf;
}

.workflow-step__dot {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.03);
}

.workflow-step.is-done .workflow-step__dot {
  color: #53d08f;
  border-color: rgba(83, 208, 143, 0.26);
}

.workflow-step.is-active .workflow-step__dot {
  color: #fff;
  border-color: rgba(125, 107, 255, 0.4);
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.94), rgba(133, 92, 246, 0.82));
  box-shadow: 0 0 0 8px rgba(109, 93, 255, 0.12);
}

.workflow-step strong {
  font-size: 16px;
}

.quick-create-item {
  justify-content: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(255, 255, 255, 0.03);
  text-align: left;
}

.quick-create-item__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.94), rgba(133, 92, 246, 0.78));
  color: #fff;
}

.quick-create-item__copy {
  display: grid;
  gap: 4px;
}

.assistant-card {
  gap: 16px;
}

.assistant-visual {
  display: grid;
  place-items: center;
  padding: 10px 0 2px;
}

.assistant-avatar {
  width: 108px;
  height: 108px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #9ab7ff;
  background:
    radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.22), transparent 26%),
    linear-gradient(135deg, rgba(109, 93, 255, 0.84), rgba(78, 160, 255, 0.54));
  box-shadow:
    0 0 0 10px rgba(109, 93, 255, 0.08),
    0 20px 56px rgba(109, 93, 255, 0.28);
}

.assistant-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #d8e1f7;
  text-align: left;
}

.assistant-input {
  gap: 10px;
  min-height: 50px;
  padding: 0 10px 0 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.assistant-input input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #eef3ff;
  font-size: 14px;
}

.assistant-input button {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.94), rgba(133, 92, 246, 0.78));
  color: #fff;
}

@media (max-width: 1400px) {
  .hero-card {
    grid-template-columns: 1fr;
  }

  .content-grid,
  .home-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .workflow-track {
    flex-wrap: wrap;
  }

  .template-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .home-page {
    padding: 0 0 8px;
  }

  .template-strip {
    grid-template-columns: 1fr;
  }

  .recent-row {
    grid-template-columns: 1fr;
  }
}
</style>
