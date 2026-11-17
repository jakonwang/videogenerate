<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, CheckCircle2, ListChecks, ListVideo, Loader, Pause, Play, Plus, RefreshCw, XCircle } from 'lucide-vue-next'
import { taskStatusTone } from '@/lib/taskStatus'

type VideoTask = {
  id: string
  createdAt: number
  productId: string
  templateId: string
  outPath: string
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'
  progress: number
  error?: string
  mix?: { formulaName: string; mode: 'auto' | 'ai'; title?: string }
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

function resolveTemplateName(task: VideoTask) {
  // Mix-studio tasks: the formula is what matters; the template (if any) only supplied finishing.
  if (task.mix?.formulaName) return `${task.mix.mode === 'ai' ? 'AI' : 'Auto'} · ${task.mix.formulaName}`
  return templateNameMap.value.get(task.templateId) ?? task.templateId ?? '-'
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

let unsubscribeTaskEvents: (() => void) | null = null

onMounted(() => {
  void refresh()
  // Keep the unsubscribe handle: previously every visit added another listener.
  unsubscribeTaskEvents = window.api.tasks.onEvent(() => {
    void refresh()
  })
})

onUnmounted(() => {
  unsubscribeTaskEvents?.()
  unsubscribeTaskEvents = null
})
</script>

<template>
  <div class="vg-scope vg-page tasks">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><ListVideo :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('production.tasks.title') }}</h1>
        <p>{{ t('production.tasks.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn" type="button" :disabled="loading" @click="refresh">
          <RefreshCw :size="15" :class="{ 'vg-spin': loading }" /> {{ t('common.refresh') }}
        </button>
        <button class="vg-btn vg-btn--primary" type="button" @click="router.push('/production/create')">
          <Plus :size="15" /> {{ t('production.tasks.create') }}
        </button>
      </div>
    </header>

    <section class="vg-stats">
      <div class="vg-stat">
        <span class="vg-stat__icon"><ListChecks :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.tasks.stats.total') }}</span><span class="vg-stat__value">{{ tasks.length }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--blue"><Loader :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.tasks.stats.running') }}</span><span class="vg-stat__value">{{ runningCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon"><CheckCircle2 :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.tasks.stats.done') }}</span><span class="vg-stat__value">{{ doneCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.tasks.stats.failed') }}</span><span class="vg-stat__value">{{ failCount }}</span></span>
      </div>
    </section>

    <section class="vg-card vg-card--flush">
      <div class="vg-card__head tasks__toolbar">
        <div class="vg-seg vg-seg--sm">
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'all' }" type="button" @click="statusFilter = 'all'">
            {{ t('common.all') }} <span class="vg-count">{{ tasks.length }}</span>
          </button>
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'running' }" type="button" @click="statusFilter = 'running'">
            {{ t('production.tasks.stats.running') }} <span class="vg-count">{{ runningCount }}</span>
          </button>
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'done' }" type="button" @click="statusFilter = 'done'">
            {{ t('production.tasks.stats.done') }} <span class="vg-count">{{ doneCount }}</span>
          </button>
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'error' }" type="button" @click="statusFilter = 'error'">
            {{ t('production.tasks.stats.failed') }} <span class="vg-count">{{ failCount }}</span>
          </button>
        </div>
        <div class="vg-card__actions">
          <span v-if="stats?.paused" class="vg-pill vg-pill--amber vg-pill--dot">{{ t('production.tasks.status.paused') }}</span>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="!runningCount || (stats?.paused ?? false)" @click="pause">
            <Pause :size="14" /> {{ t('production.tasks.pause') }}
          </button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="!runningCount || !(stats?.paused ?? false)" @click="resume">
            <Play :size="14" /> {{ t('production.tasks.resume') }}
          </button>
          <button class="vg-btn vg-btn--danger vg-btn--sm" type="button" :disabled="!tasks.length" @click="cancelAll">
            <XCircle :size="14" /> {{ t('production.tasks.cancelAll') }}
          </button>
        </div>
      </div>

      <div v-if="!filteredTasks.length" class="vg-empty">
        <span class="vg-empty__icon"><ListVideo :size="24" /></span>
        <h3>{{ t('production.tasks.emptyTitle') }}</h3>
        <p>{{ t('production.tasks.emptyDesc') }}</p>
      </div>

      <div v-else class="tasks__table">
        <table class="vg-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{{ t('production.tasks.product') }}</th>
              <th>{{ t('production.tasks.template') }}</th>
              <th>{{ t('production.tasks.progress') }}</th>
              <th>{{ t('production.tasks.createdAt') }}</th>
              <th>{{ t('production.tasks.statusColumn') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in filteredTasks" :key="task.id" class="tasks__row" @click="openTask(task.id)">
              <td class="vg-num tasks__id">#{{ task.id.slice(0, 8) }}</td>
              <td>
                <div class="tasks__product">{{ resolveProductName(task.productId) }}</div>
                <div class="tasks__path" :title="task.outPath">{{ task.outPath || t('production.tasks.noOutput') }}</div>
                <div v-if="task.status === 'error' && task.error" class="tasks__error">{{ task.error }}</div>
              </td>
              <td class="vg-secondary">{{ resolveTemplateName(task) }}</td>
              <td>
                <span class="vg-progress">
                  <span class="vg-progress__bar">
                    <span class="vg-progress__fill" :class="{ 'vg-progress__fill--fail': task.status === 'error' }" :style="{ width: `${Math.round((task.progress || 0) * 100)}%` }"></span>
                  </span>
                  <span>{{ Math.round((task.progress || 0) * 100) }}%</span>
                </span>
              </td>
              <td class="vg-secondary vg-num">{{ formatTime(task.createdAt) }}</td>
              <td><span class="vg-pill vg-pill--dot" :class="`vg-pill--${taskStatusTone(task.status)}`">{{ statusLabel(task.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tasks { width: min(1408px, 100%); margin: 0 auto; }
.tasks__toolbar { padding-bottom: 12px; margin-bottom: 0; border-bottom: 1px solid var(--theme-divider); }
.tasks__table { overflow: auto; }
.tasks__row { cursor: pointer; }
.tasks__id { color: var(--theme-text-secondary); white-space: nowrap; }
.tasks__product { font-weight: 600; }
.tasks__path { max-width: 420px; font-size: 11px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tasks__error { margin-top: 2px; font-size: 12px; color: var(--vg-red); }
.tasks .vg-progress { min-width: 140px; }
</style>
