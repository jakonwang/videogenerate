<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import UiCard from '../components/UiCard.vue'
import { FolderKanban, LayoutTemplate, PlayCircle, PlusCircle } from 'lucide-vue-next'

type TaskSummary = {
  id: string
  status?: string
}

type TemplateSummary = {
  id: string
}

const router = useRouter()
const tasks = ref<TaskSummary[]>([])
const templates = ref<TemplateSummary[]>([])
const loading = ref(false)

const totalTaskCount = computed(() => tasks.value.length)
const runningTaskCount = computed(() =>
  tasks.value.filter((item) => ['running', 'queued', 'paused'].includes(String(item.status || ''))).length,
)
const failedTaskCount = computed(() =>
  tasks.value.filter((item) => String(item.status || '') === 'error').length,
)
const templateCount = computed(() => templates.value.length)
const recentTasks = computed(() => tasks.value.slice(0, 6))

const entryCards = computed(() => [
  {
    title: '新建任务',
    desc: '从商品和模板创建新的生产任务。',
    metric: '进入新建页',
    route: '/production/create',
    icon: PlusCircle,
  },
  {
    title: '任务列表',
    desc: '查看任务队列、执行进度和最近结果。',
    metric: `${totalTaskCount.value} 个任务`,
    route: '/production/tasks',
    icon: FolderKanban,
  },
  {
    title: '模板中心',
    desc: '维护模板结构、字幕、音频和输出规则。',
    metric: `${templateCount.value} 个模板`,
    route: '/templates',
    icon: LayoutTemplate,
  },
])

function go(path: string) {
  void router.push(path)
}

async function refresh() {
  loading.value = true
  try {
    tasks.value = ((await window.api.tasks.list()) as TaskSummary[]) ?? []
    templates.value = ((await window.api.templates.list()) as TemplateSummary[]) ?? []
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="production-home-page">
    <section class="production-home-hero">
      <div class="production-home-hero__copy">
        <span class="production-home-hero__tag">生产模块</span>
        <h1>任务执行中心</h1>
        <p>生产模块统一收口为首页、新建任务、任务列表和任务详情，不再散落在旧入口里。</p>
      </div>
      <div class="production-home-hero__stats">
        <div class="production-home-stat">
          <span>任务总数</span>
          <strong>{{ totalTaskCount }}</strong>
        </div>
        <div class="production-home-stat">
          <span>运行中</span>
          <strong>{{ runningTaskCount }}</strong>
        </div>
        <div class="production-home-stat">
          <span>失败任务</span>
          <strong>{{ failedTaskCount }}</strong>
        </div>
        <div class="production-home-stat">
          <span>模板总数</span>
          <strong>{{ templateCount }}</strong>
        </div>
      </div>
    </section>

    <section class="production-home-grid">
      <button
        v-for="item in entryCards"
        :key="item.title"
        class="production-entry-card"
        type="button"
        @click="go(item.route)"
      >
        <div class="production-entry-card__icon">
          <component :is="item.icon" class="h-5 w-5" />
        </div>
        <div class="production-entry-card__copy">
          <strong>{{ item.title }}</strong>
          <p>{{ item.desc }}</p>
          <span>{{ item.metric }}</span>
        </div>
      </button>
    </section>

    <section class="production-home-detail">
      <UiCard class="production-home-panel">
        <div class="production-home-panel__head">
          <div>
            <strong>最近任务</strong>
            <span>从这里继续查看最近执行结果或失败任务。</span>
          </div>
          <PlayCircle class="h-5 w-5 text-emerald-200" />
        </div>
        <div v-if="recentTasks.length" class="production-home-task-list">
          <button
            v-for="task in recentTasks"
            :key="task.id"
            class="production-home-task-item"
            type="button"
            @click="go(`/production/tasks/${task.id}`)"
          >
            <strong>{{ task.id.slice(0, 8) }}</strong>
            <span>{{ task.status || 'queued' }}</span>
          </button>
        </div>
        <div v-else class="production-home-empty">还没有任务，先进入新建任务页。</div>
      </UiCard>

      <UiCard class="production-home-panel">
        <div class="production-home-panel__head">
          <div>
            <strong>模块边界</strong>
            <span>生产只管任务与模板，商品维护统一进入商品库。</span>
          </div>
          <FolderKanban class="h-5 w-5 text-violet-200" />
        </div>
        <div class="production-home-panel__list">
          <div>
            <strong>生产</strong>
            <p>首页、新建任务、任务列表、任务详情、模板配置。</p>
          </div>
          <div>
            <strong>商品库</strong>
            <p>商品事实源、商品图片、封面和产品标准源缓存。</p>
          </div>
        </div>
        <small v-if="loading">正在刷新生产摘要...</small>
      </UiCard>
    </section>
  </div>
</template>

<style scoped>
.production-home-page,
.production-home-grid,
.production-home-detail {
  display: grid;
  gap: 14px;
}

.production-home-hero,
.production-home-panel,
.production-entry-card {
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: rgba(10, 16, 29, 0.92);
  border-radius: 18px;
}

.production-home-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.production-home-hero__copy {
  display: grid;
  gap: 6px;
}

.production-home-hero__tag {
  color: #8ea6ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.production-home-hero__copy h1 {
  margin: 0;
  color: #f8fbff;
  font-size: 24px;
  font-weight: 800;
}

.production-home-hero__copy p,
.production-home-panel__head span,
.production-entry-card__copy p,
.production-home-panel__list p,
.production-home-panel small,
.production-home-empty {
  margin: 0;
  color: #98a6c7;
  font-size: 12px;
  line-height: 1.5;
}

.production-home-hero__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(112px, 1fr));
  gap: 10px;
  min-width: 480px;
}

.production-home-stat {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.production-home-stat span {
  color: #8fa1c6;
  font-size: 11px;
}

.production-home-stat strong,
.production-entry-card__copy strong,
.production-home-panel__head strong,
.production-home-panel__list strong,
.production-home-task-item strong {
  color: #eef3ff;
}

.production-home-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.production-entry-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  text-align: left;
}

.production-entry-card__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: rgba(109, 93, 255, 0.16);
  color: #e9e3ff;
}

.production-entry-card__copy {
  display: grid;
  gap: 5px;
}

.production-entry-card__copy span,
.production-home-task-item span {
  color: #b6c2df;
  font-size: 12px;
  font-weight: 700;
}

.production-home-detail {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.production-home-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.production-home-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.production-home-panel__list,
.production-home-task-list {
  display: grid;
  gap: 12px;
}

.production-home-task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  text-align: left;
}

@media (max-width: 1080px) {
  .production-home-hero,
  .production-home-grid,
  .production-home-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .production-home-hero__stats {
    min-width: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .production-home-hero__stats {
    grid-template-columns: 1fr;
  }
}
</style>
