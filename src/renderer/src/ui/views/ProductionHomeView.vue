<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Clapperboard, Film, FolderKanban, LayoutTemplate, ListChecks, Loader, PlayCircle, PlusCircle, Sparkles } from 'lucide-vue-next'
import { taskStatusTone as statusTone } from '@/lib/taskStatus'

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
    title: t('production.home.entries.mix.title'),
    desc: t('production.home.entries.mix.desc'),
    metric: t('production.home.entries.mix.metric'),
    route: '/production/mix',
    icon: Sparkles,
  },
  {
    title: t('production.home.entries.pool.title'),
    desc: t('production.home.entries.pool.desc'),
    metric: t('production.home.entries.pool.metric'),
    route: '/production/pool',
    icon: Film,
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

function statusLabel(status?: string) {
  const value = String(status || 'queued')
  const key = `production.tasks.status.${value}`
  const label = t(key)
  return label === key ? value : label
}

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
  <div class="vg-scope vg-page prod-home">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Clapperboard :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('production.home.title') }}</h1>
        <p>{{ t('production.home.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn vg-btn--primary" type="button" @click="go('/production/mix')">
          <PlusCircle :size="15" /> {{ t('production.home.entries.create.title') }}
        </button>
      </div>
    </header>

    <section class="vg-stats">
      <div class="vg-stat">
        <span class="vg-stat__icon"><ListChecks :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.home.stats.totalTasks') }}</span><span class="vg-stat__value">{{ totalTaskCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--blue"><Loader :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.home.stats.running') }}</span><span class="vg-stat__value">{{ runningTaskCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.home.stats.failed') }}</span><span class="vg-stat__value">{{ failedTaskCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--violet"><LayoutTemplate :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.home.stats.templates') }}</span><span class="vg-stat__value">{{ templateCount }}</span></span>
      </div>
    </section>

    <section class="vg-grid vg-grid--4 prod-home__entries">
      <button
        v-for="item in entryCards"
        :key="item.title"
        class="vg-card vg-card--interactive prod-entry"
        type="button"
        @click="go(item.route)"
      >
        <span class="prod-entry__icon"><component :is="item.icon" :size="20" /></span>
        <span class="prod-entry__copy">
          <strong>{{ item.title }}</strong>
          <span>{{ item.desc }}</span>
        </span>
        <span class="vg-chip">{{ item.metric }}</span>
      </button>
    </section>

    <section class="prod-home__detail prod-home__detail--single">
      <div class="vg-card">
        <div class="vg-card__head">
          <span class="vg-card__title"><PlayCircle :size="16" /> {{ t('production.home.recent.title') }} <small>{{ t('production.home.recent.desc') }}</small></span>
          <button class="vg-btn vg-btn--sm" type="button" @click="go('/production/tasks')">{{ t('production.home.entries.tasks.title') }}</button>
        </div>
        <div v-if="recentTasks.length" class="vg-list">
          <button
            v-for="task in recentTasks"
            :key="task.id"
            class="vg-list__item vg-list__item--button"
            type="button"
            @click="go(`/production/tasks/${task.id}`)"
          >
            <span class="vg-list__main"><span class="vg-list__title vg-num">#{{ task.id.slice(0, 8) }}</span></span>
            <span class="vg-pill vg-pill--dot" :class="`vg-pill--${statusTone(task.status)}`">{{ statusLabel(task.status) }}</span>
          </button>
        </div>
        <div v-else class="vg-empty">
          <span class="vg-empty__icon"><PlayCircle :size="24" /></span>
          <p>{{ t('production.home.recent.empty') }}</p>
        </div>
      </div>

    </section>
  </div>
</template>

<style scoped>
.prod-home__detail--single { grid-template-columns: minmax(0, 1fr) !important; }
.prod-home { width: min(1408px, 100%); margin: 0 auto; }
.prod-entry { display: flex; align-items: center; gap: 12px; text-align: left; color: var(--theme-text); }
.prod-entry__icon { width: 44px; height: 44px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.prod-entry__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.prod-entry__copy strong { font-size: 14px; font-weight: 700; }
.prod-entry__copy span { font-size: 12px; color: var(--theme-text-muted); }
.prod-home__detail { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.prod-home__scope-desc { margin-bottom: 12px; font-size: 12px; }
@media (max-width: 1100px) {
  .prod-home__detail { grid-template-columns: 1fr; }
  .prod-home__entries { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
