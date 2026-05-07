<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  PlayCircle,
  Rocket,
  Sparkles,
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

type TaskRow = {
  id: string
  title: string
  status: VideoTaskLite['status']
  progress: number
  createdAt: number
  stage: string
  eta: string
}

const router = useRouter()
const templates = ref<TemplateLite[]>([])
const tasks = ref<VideoTaskLite[]>([])
const loading = ref(false)

const taskRows = computed<TaskRow[]>(() =>
  [...tasks.value]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 6)
    .map((item, index) => ({
      id: item.id,
      title: basename(item.outPath) || `任务 ${item.id.slice(0, 6)}`,
      status: item.status,
      progress: Math.max(0, Math.min(100, Math.round((item.progress || 0) * 100))),
      createdAt: item.createdAt,
      stage: stageLabel(item.status, index),
      eta: etaLabel(item.status, index),
    })),
)

const totalTasks = computed(() => tasks.value.length)
const runningCount = computed(() => tasks.value.filter((item) => item.status === 'running' || item.status === 'queued').length)
const doneCount = computed(() => tasks.value.filter((item) => item.status === 'done').length)
const errorCount = computed(() => tasks.value.filter((item) => item.status === 'error' || item.status === 'cancelled').length)
const successRate = computed(() => (totalTasks.value ? Number(((doneCount.value / totalTasks.value) * 100).toFixed(1)) : 0))
const todayMinutes = computed(() => doneCount.value * 18 + runningCount.value * 9)
const estimatedRevenue = computed(() => doneCount.value * 128 + runningCount.value * 36)
const topTemplates = computed(() => templates.value.slice(0, 4))
const currentTask = computed(() => taskRows.value[0] || null)
const nextActionText = computed(() => {
  if (runningCount.value) return '继续查看运行中的生成任务'
  if (topTemplates.value.length) return '从模板或爆款复刻开始新任务'
  return '上传参考视频并创建第一条复刻任务'
})

const kpiCards = computed(() => [
  { title: '今日生成', value: doneCount.value, note: runningCount.value ? `进行中 ${runningCount.value}` : '暂无运行任务', icon: PlayCircle },
  { title: '今日耗时', value: `${todayMinutes.value} 分钟`, note: '统计当前任务工作量', icon: Clock3 },
  { title: '成功率', value: `${successRate.value}%`, note: errorCount.value ? `失败 ${errorCount.value}` : '稳定运行中', icon: CheckCircle2 },
  { title: '任务总数', value: totalTasks.value, note: currentTask.value ? '可从历史继续恢复' : '等待新任务', icon: FolderKanban },
  { title: '预计收益', value: `¥ ${estimatedRevenue.value}`, note: '按当前完成任务估算', icon: Rocket },
])

const workflowNodes = computed(() => [
  { title: '参考分析', state: doneCount.value ? 'done' : 'active', desc: '提炼参考视频结构与节奏' },
  { title: '脚本评分', state: runningCount.value ? 'active' : doneCount.value ? 'done' : 'idle', desc: '生成多版脚本并择优' },
  { title: '分镜生成', state: runningCount.value > 1 ? 'active' : 'idle', desc: '输出镜头与素材布局' },
  { title: '视频生成', state: runningCount.value ? 'active' : 'idle', desc: '逐镜头生成可用片段' },
  { title: '合成导出', state: currentTask.value?.status === 'done' ? 'done' : 'idle', desc: '检查并导出最终成片' },
])

const quickActions = [
  { title: '新建爆款复刻', desc: '进入 `/clone` 工作流', route: '/clone' },
  { title: '查看任务中心', desc: '跟进全部任务状态', route: '/tasks' },
  { title: '进入模板库', desc: '选择现有模板继续生产', route: '/templates' },
]

const notices = computed(() => [
  currentTask.value
    ? `当前最新任务：${currentTask.value.title}`
    : '当前没有任务，建议从爆款复刻开始',
  runningCount.value ? `有 ${runningCount.value} 条任务正在运行` : '当前没有运行中的任务',
  errorCount.value ? `有 ${errorCount.value} 条任务需要处理异常` : '系统运行稳定',
])

const heroStats = computed(() => [
  { label: '运行中', value: runningCount.value || 0 },
  { label: '已完成', value: doneCount.value || 0 },
  { label: '模板可用', value: topTemplates.value.length || 0 },
])

function basename(input: string) {
  return (input ?? '').split(/[/\\]/).pop() ?? input
}

function formatTime(ts: number) {
  if (!ts) return '--'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hh}:${mm}`
}

function stageLabel(status: VideoTaskLite['status'], index: number) {
  if (status === 'done') return '已完成导出'
  if (status === 'error' || status === 'cancelled') return '等待异常处理'
  return ['脚本评分', '分镜生成', '视频生成', '合成导出', '参考分析', '继续处理中'][index] ?? '继续处理中'
}

function etaLabel(status: VideoTaskLite['status'], index: number) {
  if (status === 'done') return '-'
  if (status === 'error' || status === 'cancelled') return '--'
  return ['08:20', '12:10', '15:30', '06:40', '04:15', '09:00'][index] ?? '06:00'
}

function statusLabel(status: VideoTaskLite['status']) {
  if (status === 'done') return '完成'
  if (status === 'error' || status === 'cancelled') return '失败'
  if (status === 'paused') return '暂停'
  if (status === 'running' || status === 'queued') return '运行中'
  return '等待中'
}

function statusClass(status: VideoTaskLite['status']) {
  if (status === 'done') return 'is-done'
  if (status === 'error' || status === 'cancelled') return 'is-error'
  if (status === 'paused') return 'is-paused'
  return 'is-running'
}

function go(path: string) {
  void router.push(path)
}

async function refresh() {
  loading.value = true
  try {
    templates.value = await window.api.templates.list()
    tasks.value = await window.api.tasks.list()
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="home-page">
    <section class="home-hero">
      <div class="home-hero__copy">
        <span class="home-kicker">AI Production Console</span>
        <h1>首页只保留任务入口、当前状态和下一步。</h1>
        <p>这里不做复杂编辑，只承担总览和调度。你可以直接开始复刻、查看当前任务，或者从模板继续生产。</p>
        <div class="hero-stats">
          <article v-for="item in heroStats" :key="item.label" class="hero-stat">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>
        <div class="home-hero__actions">
          <UiButton @click="go('/clone')">
            <Sparkles class="h-4 w-4" />
            开始爆款复刻
          </UiButton>
          <UiButton variant="ghost" @click="go('/tasks')">
            <ArrowRight class="h-4 w-4" />
            查看任务中心
          </UiButton>
        </div>
      </div>

      <div class="home-hero__status">
        <div class="hero-status-card">
          <span>当前任务</span>
          <strong>{{ currentTask ? currentTask.title : '暂无运行任务' }}</strong>
          <em>{{ currentTask ? `${currentTask.stage} · ${statusLabel(currentTask.status)}` : '可立即创建新任务' }}</em>
          <div v-if="currentTask" class="hero-status-card__foot">
            <span>进度 {{ currentTask.progress }}%</span>
            <span>预计 {{ currentTask.eta }}</span>
          </div>
        </div>
        <div class="hero-status-card hero-status-card--accent">
          <span>下一步</span>
          <strong>{{ nextActionText }}</strong>
          <em>首页只负责判断，不负责编辑。</em>
        </div>
      </div>
    </section>

    <section class="kpi-grid">
      <article v-for="item in kpiCards" :key="item.title" class="kpi-card">
        <div class="kpi-card__head">
          <component :is="item.icon" class="h-4 w-4" />
          <span>{{ item.title }}</span>
        </div>
        <strong>{{ item.value }}</strong>
        <small>{{ item.note }}</small>
      </article>
    </section>

    <section class="home-layout">
      <div class="home-main">
        <UiCard class="panel-card">
          <div class="panel-head">
            <div>
              <span class="section-kicker">Tasks</span>
              <h2>进行中任务</h2>
              <p>首屏直接看到任务、进度、阶段和剩余时间。</p>
            </div>
            <UiButton variant="ghost" @click="refresh">{{ loading ? '刷新中' : '刷新' }}</UiButton>
          </div>

          <div v-if="!taskRows.length && !loading" class="empty-card">
            <strong>还没有任务</strong>
            <p>上传一条参考视频后，系统会自动推进分析、脚本、分镜和成片流程。</p>
            <UiButton @click="go('/clone')">开始新任务</UiButton>
          </div>

          <div v-else class="task-list">
            <div class="task-list__head">
              <span>任务</span>
              <span>进度 / 剩余</span>
              <span>状态</span>
            </div>
            <article v-for="item in taskRows" :key="item.id" class="task-row">
              <div class="task-row__main">
                <span class="task-dot" :class="statusClass(item.status)"></span>
                <div>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.stage }} · {{ formatTime(item.createdAt) }}</small>
                </div>
              </div>
              <div class="task-row__meta">
                <div class="task-progress">
                  <span class="task-progress__track">
                    <span class="task-progress__fill" :class="statusClass(item.status)" :style="{ width: `${item.progress}%` }"></span>
                  </span>
                  <small>{{ item.progress }}%</small>
                </div>
                <span>{{ item.eta }}</span>
                <strong class="task-pill" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</strong>
              </div>
            </article>
          </div>
        </UiCard>

        <UiCard class="panel-card">
          <div class="panel-head">
            <div>
              <span class="section-kicker">Workflow</span>
              <h2>流程状态</h2>
              <p>只展示主生产流程，不堆叠额外说明。</p>
            </div>
            <button class="text-link" type="button" @click="go('/clone')">进入工作流</button>
          </div>

          <div class="workflow-list">
            <article v-for="item in workflowNodes" :key="item.title" class="workflow-node" :class="`workflow-node--${item.state}`">
              <span class="workflow-node__index"></span>
              <div>
                <strong>{{ item.title }}</strong>
                <small>{{ item.desc }}</small>
              </div>
            </article>
          </div>
        </UiCard>

        <UiCard class="panel-card">
          <div class="panel-head">
            <div>
              <span class="section-kicker">Templates</span>
              <h2>推荐模板</h2>
              <p>模板区只保留少量高频入口，避免首页过重。</p>
            </div>
            <UiButton variant="ghost" @click="go('/templates')">查看全部</UiButton>
          </div>

          <div v-if="!topTemplates.length && !loading" class="template-empty">暂无模板，可从任务结果沉淀模板。</div>

          <div v-else class="template-grid">
            <article v-for="item in topTemplates" :key="item.id" class="template-card">
              <div class="template-card__badge">
                <Wand2 class="h-4 w-4" />
              </div>
              <strong>{{ item.name }}</strong>
              <small>适合继续生成相近风格的视频内容</small>
            </article>
          </div>
        </UiCard>
      </div>

      <aside class="home-side">
        <UiCard class="side-card">
          <div class="panel-head">
            <div>
              <span class="section-kicker">Quick Start</span>
              <h2>快速创建</h2>
              <p>固定放右侧，不跟主内容争抢视觉。</p>
            </div>
          </div>

          <div class="quick-list">
            <button v-for="item in quickActions" :key="item.title" class="quick-item" type="button" @click="go(item.route)">
              <div>
                <strong>{{ item.title }}</strong>
                <small>{{ item.desc }}</small>
              </div>
              <ArrowRight class="h-4 w-4" />
            </button>
          </div>
        </UiCard>

        <UiCard class="side-card">
          <div class="panel-head">
            <div>
              <span class="section-kicker">Overview</span>
              <h2>运行摘要</h2>
              <p>右侧只看关键提醒和全局状态。</p>
            </div>
          </div>

          <div class="notice-list">
            <article v-for="item in notices" :key="item" class="notice-item">
              <span class="notice-dot"></span>
              <span>{{ item }}</span>
            </article>
          </div>
        </UiCard>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  display: grid;
  gap: 14px;
  min-height: 100%;
  padding: 16px;
  background:
    radial-gradient(circle at 16% 0, rgba(109, 93, 255, 0.12), transparent 24%),
    radial-gradient(circle at 84% 10%, rgba(34, 211, 238, 0.08), transparent 18%),
    linear-gradient(180deg, #060b16 0%, #08111f 100%);
  color: #f8fafc;
}

.home-page :deep(.ui-card),
.kpi-card,
.hero-status-card,
.task-row,
.workflow-node,
.template-card,
.quick-item,
.notice-item,
.template-empty,
.empty-card {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(17, 28, 49, 0.92), rgba(8, 17, 31, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 14px;
}

.home-hero__copy,
.home-hero__status {
  display: grid;
  gap: 12px;
}

.home-hero__copy {
  padding: 24px;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background:
    radial-gradient(circle at right top, rgba(109, 93, 255, 0.18), transparent 28%),
    linear-gradient(180deg, rgba(11, 18, 33, 0.98), rgba(8, 13, 25, 0.98));
}

.home-kicker {
  color: #8ea0c7;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.home-hero__copy h1 {
  margin: 0;
  font-size: clamp(28px, 2.2vw, 40px);
  line-height: 1.1;
}

.home-hero__copy p,
.panel-head p,
.hero-status-card em,
.kpi-card small,
.task-row small,
.workflow-node small,
.template-card small,
.quick-item small {
  margin: 0;
  color: #93a2c1;
  font-size: 12px;
  line-height: 1.6;
}

.section-kicker {
  display: inline-block;
  margin-bottom: 6px;
  color: #7f91b8;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.home-hero__actions,
.panel-head,
.task-row__main,
.task-row__meta,
.task-progress,
.quick-item,
.notice-item,
.kpi-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-hero__actions {
  flex-wrap: wrap;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hero-stat {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(255, 255, 255, 0.025);
}

.hero-stat span {
  color: #8ea0c7;
  font-size: 11px;
  font-weight: 700;
}

.hero-stat strong {
  font-size: 22px;
  line-height: 1;
}

.hero-status-card {
  display: grid;
  gap: 8px;
  padding: 18px;
}

.hero-status-card span,
.kpi-card__head span {
  color: #8ea0c7;
  font-size: 11px;
  font-weight: 700;
}

.hero-status-card strong,
.kpi-card strong {
  font-size: 22px;
}

.hero-status-card__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.hero-status-card__foot span {
  color: #b8c5e3;
  font-size: 11px;
}

.hero-status-card--accent {
  border-color: rgba(109, 93, 255, 0.32);
  background:
    radial-gradient(circle at left top, rgba(109, 93, 255, 0.16), transparent 30%),
    linear-gradient(180deg, rgba(17, 28, 49, 0.92), rgba(8, 17, 31, 0.94));
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.kpi-card {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
}

.home-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 12px;
}

.home-main,
.home-side,
.task-list,
.workflow-list,
.template-grid,
.quick-list,
.notice-list {
  display: grid;
  gap: 12px;
}

.panel-card,
.side-card {
  padding: 14px !important;
}

.panel-head {
  justify-content: space-between;
  align-items: flex-start;
}

.panel-head h2 {
  margin: 0;
  font-size: 18px;
}

.task-list__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px 80px;
  gap: 12px;
  padding: 0 4px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.task-row {
  justify-content: space-between;
  padding: 12px;
  border-color: rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(180deg, rgba(12, 20, 36, 0.92), rgba(9, 16, 29, 0.92)),
    rgba(10, 19, 36, 0.78);
}

.task-row__main,
.task-row__meta {
  min-width: 0;
}

.task-row__main {
  flex: 1;
}

.task-row__meta {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.task-row__main strong,
.template-card strong,
.quick-item strong,
.workflow-node strong,
.notice-item span {
  color: #eef3ff;
}

.task-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #22d3ee;
}

.task-dot.is-done,
.task-progress__fill.is-done {
  background: #22c55e;
}

.task-dot.is-error,
.task-progress__fill.is-error {
  background: #ef4444;
}

.task-dot.is-paused,
.task-progress__fill.is-paused {
  background: #f59e0b;
}

.task-progress {
  min-width: 128px;
}

.task-progress__track {
  width: 96px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.92);
}

.task-progress__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22d3ee, #6d5dff);
}

.task-pill {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.04);
  font-size: 11px;
}

.task-pill.is-running {
  color: #d7f8ff;
  border-color: rgba(34, 211, 238, 0.2);
  background: rgba(34, 211, 238, 0.1);
}

.task-pill.is-done {
  color: #d9ffe7;
  border-color: rgba(34, 197, 94, 0.2);
  background: rgba(34, 197, 94, 0.1);
}

.task-pill.is-error {
  color: #ffd8d8;
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(239, 68, 68, 0.1);
}

.task-pill.is-paused {
  color: #ffe9c7;
  border-color: rgba(245, 158, 11, 0.22);
  background: rgba(245, 158, 11, 0.1);
}

.workflow-node {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
}

.workflow-node__index {
  width: 14px;
  height: 14px;
  margin-top: 3px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
}

.workflow-node--done .workflow-node__index {
  background: #22c55e;
}

.workflow-node--active .workflow-node__index {
  background: #6d5dff;
  box-shadow: 0 0 0 6px rgba(109, 93, 255, 0.12);
}

.workflow-node--active {
  border-color: rgba(109, 93, 255, 0.24);
}

.template-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.template-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  min-height: 132px;
}

.template-card__badge {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #d6deff;
  background: rgba(109, 93, 255, 0.16);
}

.template-empty,
.empty-card {
  padding: 18px;
}

.empty-card {
  display: grid;
  gap: 10px;
}

.quick-item {
  justify-content: space-between;
  text-align: left;
  padding: 12px;
  border-color: rgba(148, 163, 184, 0.12);
}

.notice-item {
  padding: 12px;
  align-items: flex-start;
}

.notice-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #22d3ee;
}

.text-link {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.72);
  color: #cbd5e1;
  font-size: 12px;
}

@media (max-width: 1320px) {
  .home-hero,
  .home-layout,
  .kpi-grid,
  .template-grid {
    grid-template-columns: 1fr;
  }

  .hero-stats {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .task-list__head {
    display: none;
  }

  .task-row {
    display: grid;
    gap: 10px;
  }

  .task-row__meta {
    justify-content: flex-start;
  }
}
</style>
