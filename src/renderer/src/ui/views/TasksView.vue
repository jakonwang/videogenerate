<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiChip from '../components/UiChip.vue'

type VideoTask = {
  id: string
  createdAt: number
  productId: string
  templateId: string
  outPath: string
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'
  progress: number
  error?: string
}

type Product = { id: string; name: string }
type Template = { id: string; name: string }

const router = useRouter()
const { t, locale } = useI18n()
const tasks = ref<VideoTask[]>([])
const products = ref<Product[]>([])
const templates = ref<Template[]>([])
const stats = ref<{ concurrency: number; pending: number; size: number; paused: boolean } | null>(null)
const statusFilter = ref<'all' | 'running' | 'done' | 'error'>('all')
const loading = ref(false)

const productNameMap = computed(() => new Map(products.value.map((item) => [item.id, item.name])))
const templateNameMap = computed(() => new Map(templates.value.map((item) => [item.id, item.name])))

const filteredTasks = computed(() => {
  if (statusFilter.value === 'all') return tasks.value
  if (statusFilter.value === 'running') {
    return tasks.value.filter((item) => ['running', 'queued', 'paused'].includes(item.status))
  }
  return tasks.value.filter((item) => item.status === statusFilter.value)
})

const runningCount = computed(() => tasks.value.filter((item) => ['running', 'queued', 'paused'].includes(item.status)).length)
const doneCount = computed(() => tasks.value.filter((item) => item.status === 'done').length)
const failCount = computed(() => tasks.value.filter((item) => item.status === 'error').length)

function formatTime(ts: number) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

function statusLabel(status: VideoTask['status']) {
  return t(`production.tasks.status.${status}`)
}

function resolveProductName(productId: string) {
  return productNameMap.value.get(productId) ?? productId ?? '-'
}

function resolveTemplateName(templateId: string) {
  return templateNameMap.value.get(templateId) ?? templateId ?? '-'
}

async function refresh() {
  loading.value = true
  try {
    const [taskRows, productRows, templateRows, queueStats] = await Promise.all([
      window.api.tasks.list(),
      window.api.products.list(),
      window.api.templates.list(),
      window.api.tasks.stats(),
    ])
    tasks.value = taskRows as VideoTask[]
    products.value = productRows as Product[]
    templates.value = templateRows as Template[]
    stats.value = queueStats
  } finally {
    loading.value = false
  }
}

async function pause() {
  await window.api.tasks.pause()
  await refresh()
}

async function resume() {
  await window.api.tasks.resume()
  await refresh()
}

async function cancelAll() {
  await window.api.tasks.cancelAll()
  await refresh()
}

function openTask(taskId: string) {
  void router.push(`/production/tasks/${taskId}`)
}

onMounted(() => {
  void refresh()
  window.api.tasks.onEvent(() => {
    void refresh()
  })
})
</script>

<template>
  <div class="tasks-page">
    <section class="tasks-hero">
      <div class="tasks-hero__copy">
        <span class="tasks-hero__tag">{{ t('production.tasks.kicker') }}</span>
        <h1>{{ t('production.tasks.title') }}</h1>
        <p>{{ t('production.tasks.desc') }}</p>
      </div>
      <div class="tasks-hero__actions">
        <button class="app-primary px-4 py-2 text-sm" @click="router.push('/production/create')">{{ t('production.tasks.create') }}</button>
        <button class="app-ghost px-4 py-2 text-sm" :disabled="loading" @click="refresh">{{ t('common.refresh') }}</button>
      </div>
    </section>

    <section class="tasks-stats">
      <div class="tasks-stat"><span>{{ t('production.tasks.stats.total') }}</span><strong>{{ tasks.length }}</strong></div>
      <div class="tasks-stat"><span>{{ t('production.tasks.stats.running') }}</span><strong>{{ runningCount }}</strong></div>
      <div class="tasks-stat"><span>{{ t('production.tasks.stats.done') }}</span><strong>{{ doneCount }}</strong></div>
      <div class="tasks-stat"><span>{{ t('production.tasks.stats.failed') }}</span><strong>{{ failCount }}</strong></div>
    </section>

    <section class="tasks-panel">
      <div class="tasks-toolbar">
        <div class="tasks-filters">
          <button class="app-tab" :class="{ 'is-active': statusFilter === 'all' }" @click="statusFilter = 'all'">{{ t('common.all') }}</button>
          <button class="app-tab" :class="{ 'is-active': statusFilter === 'running' }" @click="statusFilter = 'running'">{{ t('production.tasks.stats.running') }}</button>
          <button class="app-tab" :class="{ 'is-active': statusFilter === 'done' }" @click="statusFilter = 'done'">{{ t('production.tasks.stats.done') }}</button>
          <button class="app-tab" :class="{ 'is-active': statusFilter === 'error' }" @click="statusFilter = 'error'">{{ t('production.tasks.stats.failed') }}</button>
        </div>
        <div class="tasks-batch-actions">
          <button class="app-ghost px-3 py-2 text-xs" :disabled="!runningCount || (stats?.paused ?? false)" @click="pause">{{ t('production.tasks.pause') }}</button>
          <button class="app-ghost px-3 py-2 text-xs" :disabled="!runningCount || !(stats?.paused ?? false)" @click="resume">{{ t('production.tasks.resume') }}</button>
          <button class="app-ghost px-3 py-2 text-xs" :disabled="!tasks.length" @click="cancelAll">{{ t('production.tasks.cancelAll') }}</button>
        </div>
      </div>

      <div v-if="!filteredTasks.length" class="tasks-empty">
        <strong>{{ t('production.tasks.emptyTitle') }}</strong>
        <p>{{ t('production.tasks.emptyDesc') }}</p>
      </div>

      <div v-else class="tasks-list">
        <button v-for="task in filteredTasks" :key="task.id" class="tasks-item" type="button" @click="openTask(task.id)">
          <div class="tasks-item__main">
            <div class="tasks-item__header">
              <strong>{{ task.id.slice(0, 8) }}</strong>
              <UiChip :tone="task.status === 'error' ? 'danger' : task.status === 'done' ? 'accent' : 'neutral'">
                {{ statusLabel(task.status) }}
              </UiChip>
            </div>
            <div class="tasks-item__meta-grid">
              <span>{{ t('production.tasks.product') }}: {{ resolveProductName(task.productId) }}</span>
              <span>{{ t('production.tasks.template') }}: {{ resolveTemplateName(task.templateId) }}</span>
              <span>{{ t('production.tasks.createdAt') }}: {{ formatTime(task.createdAt) }}</span>
              <span>{{ t('production.tasks.progress') }}: {{ Math.round((task.progress || 0) * 100) }}%</span>
            </div>
            <span class="tasks-item__path">{{ task.outPath || t('production.tasks.noOutput') }}</span>
            <span v-if="task.status === 'error' && task.error" class="tasks-item__error">{{ task.error }}</span>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tasks-page {
  display: grid;
  gap: 14px;
}

.tasks-hero,
.tasks-panel,
.tasks-stat {
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: rgba(10, 16, 29, 0.92);
  border-radius: 18px;
}

.tasks-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.tasks-hero__copy {
  display: grid;
  gap: 6px;
}

.tasks-hero__tag {
  color: #8ea6ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.tasks-hero__copy h1 {
  margin: 0;
  color: #f8fbff;
  font-size: 24px;
  font-weight: 800;
}

.tasks-hero__copy p,
.tasks-stat span,
.tasks-empty p,
.tasks-item__meta-grid span,
.tasks-item__path,
.tasks-item__error {
  margin: 0;
  color: #98a6c7;
  font-size: 12px;
  line-height: 1.5;
}

.tasks-hero__actions,
.tasks-batch-actions,
.tasks-filters {
  display: flex;
  gap: 8px;
}

.tasks-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.tasks-stat {
  display: grid;
  gap: 6px;
  padding: 14px;
}

.tasks-stat strong,
.tasks-empty strong,
.tasks-item__header strong {
  color: #eef3ff;
}

.tasks-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.tasks-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tasks-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 240px;
  border-radius: 16px;
  border: 1px dashed rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.02);
}

.tasks-list {
  display: grid;
  gap: 10px;
}

.tasks-item {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  text-align: left;
}

.tasks-item__main {
  display: grid;
  gap: 8px;
}

.tasks-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tasks-item__meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}

.tasks-item__path {
  color: #b6c2df;
}

.tasks-item__error {
  color: #fca5a5;
}

@media (max-width: 900px) {
  .tasks-hero,
  .tasks-toolbar,
  .tasks-stats,
  .tasks-item__header,
  .tasks-item__meta-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
