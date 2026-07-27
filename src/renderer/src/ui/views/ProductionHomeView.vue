<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()
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
    title: t('production.home.entries.create.title'),
    desc: t('production.home.entries.create.desc'),
    metric: t('production.home.entries.create.metric'),
    route: '/production/create',
    icon: PlusCircle,
  },
  {
    title: t('production.home.entries.tasks.title'),
    desc: t('production.home.entries.tasks.desc'),
    metric: t('production.home.taskCount', { count: totalTaskCount.value }),
    route: '/production/tasks',
    icon: FolderKanban,
  },
  {
    title: t('production.home.entries.templates.title'),
    desc: t('production.home.entries.templates.desc'),
    metric: t('production.home.templateCount', { count: templateCount.value }),
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
        <span class="production-home-hero__tag">{{ t('production.home.kicker') }}</span>
        <h1>{{ t('production.home.title') }}</h1>
        <p>{{ t('production.home.desc') }}</p>
      </div>
      <div class="production-home-hero__stats">
        <div class="production-home-stat">
          <span>{{ t('production.home.stats.totalTasks') }}</span>
          <strong>{{ totalTaskCount }}</strong>
        </div>
        <div class="production-home-stat">
          <span>{{ t('production.home.stats.running') }}</span>
          <strong>{{ runningTaskCount }}</strong>
        </div>
        <div class="production-home-stat">
          <span>{{ t('production.home.stats.failed') }}</span>
          <strong>{{ failedTaskCount }}</strong>
        </div>
        <div class="production-home-stat">
          <span>{{ t('production.home.stats.templates') }}</span>
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
            <strong>{{ t('production.home.recent.title') }}</strong>
            <span>{{ t('production.home.recent.desc') }}</span>
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
        <div v-else class="production-home-empty">{{ t('production.home.recent.empty') }}</div>
      </UiCard>

      <UiCard class="production-home-panel">
        <div class="production-home-panel__head">
          <div>
            <strong>{{ t('production.home.scope.title') }}</strong>
            <span>{{ t('production.home.scope.desc') }}</span>
          </div>
          <FolderKanban class="h-5 w-5 text-violet-200" />
        </div>
        <div class="production-home-panel__list">
          <div>
            <strong>{{ t('production.home.scope.productionTitle') }}</strong>
            <p>{{ t('production.home.scope.productionDesc') }}</p>
          </div>
          <div>
            <strong>{{ t('production.home.scope.productsTitle') }}</strong>
            <p>{{ t('production.home.scope.productsDesc') }}</p>
          </div>
        </div>
        <small v-if="loading">{{ t('production.home.refreshing') }}</small>
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
