<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Activity, AlertTriangle, ArrowLeft, FileOutput, FileText, FolderOpen, Gauge, RefreshCw, ScrollText, Search, SearchX } from 'lucide-vue-next'
import { taskStatusTone } from '@/lib/taskStatus'

type VideoTask = {
  id: string
  createdAt: number
  productId: string
  templateId: string
  outDir: string
  outPath: string
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'
  progress: number
  reportPath?: string
  error?: string
  logs: string[]
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const task = ref<VideoTask | null>(null)

const progressLabel = computed(() => `${Math.round(Number(task.value?.progress ?? 0) * 100)}%`)
const statusLabel = computed(() => task.value ? t(`production.tasks.status.${task.value.status}`) : '-')

async function refresh() {
  const taskId = String(route.params.taskId || '').trim()
  const list = (await window.api.tasks.list()) as VideoTask[]
  task.value = list.find((item) => item.id === taskId) ?? null
}

async function showInFolder(path: string) {
  if (!path) return
  await window.api.shell.showItemInFolder(path)
}

async function openPath(path: string) {
  if (!path) return
  await window.api.shell.openPath(path)
}

onMounted(refresh)
</script>

<template>
  <div class="vg-scope vg-page task-detail">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('production.detail.back')" @click="router.push('/production/tasks')">
        <ArrowLeft :size="18" />
      </button>
      <div class="vg-page-head__text">
        <h1>
          {{ task ? t('production.detail.taskTitle', { id: task.id.slice(0, 8) }) : t('production.detail.notFound') }}
          <span v-if="task" class="vg-pill vg-pill--dot" :class="`vg-pill--${taskStatusTone(task.status)}`">{{ statusLabel }}</span>
        </h1>
        <p>{{ t('production.detail.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn" type="button" @click="router.push('/production/tasks')">{{ t('production.detail.back') }}</button>
      </div>
    </header>

    <template v-if="task">
      <section class="vg-stats">
        <div class="vg-stat">
          <span class="vg-stat__icon"><Activity :size="17" /></span>
          <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.detail.status') }}</span><span class="vg-stat__value">{{ statusLabel }}</span></span>
        </div>
        <div class="vg-stat">
          <span class="vg-stat__icon vg-stat__icon--blue"><Gauge :size="17" /></span>
          <span class="vg-stat__body">
            <span class="vg-stat__label">{{ t('production.detail.progress') }}</span>
            <span class="vg-stat__value">{{ progressLabel }}</span>
          </span>
        </div>
        <div class="vg-stat task-detail__dir">
          <span class="vg-stat__icon vg-stat__icon--violet"><FolderOpen :size="17" /></span>
          <span class="vg-stat__body">
            <span class="vg-stat__label">{{ t('production.detail.outputDir') }}</span>
            <span class="task-detail__path" :title="task.outDir">{{ task.outDir || '-' }}</span>
          </span>
        </div>
      </section>

      <div v-if="task.error" class="vg-notice vg-notice--danger">
        <AlertTriangle :size="16" />
        <span><b>{{ t('production.detail.error') }}</b><br />{{ task.error }}</span>
      </div>

      <section class="vg-card">
        <div class="vg-card__head">
          <span class="vg-card__title"><FileOutput :size="16" /> {{ t('production.detail.outputDir') }}</span>
          <div class="vg-card__actions">
            <button class="vg-btn vg-btn--sm" type="button" :disabled="!task.outPath" @click="showInFolder(task.outPath)">
              <Search :size="14" /> {{ t('production.detail.locateOutput') }}
            </button>
            <button class="vg-btn vg-btn--sm" type="button" :disabled="!task.reportPath" @click="openPath(task.reportPath || '')">
              <FileText :size="14" /> {{ t('production.detail.openReport') }}
            </button>
            <button class="vg-btn vg-btn--soft vg-btn--sm" type="button" :disabled="!task.outDir" @click="openPath(task.outDir)">
              <FolderOpen :size="14" /> {{ t('production.detail.openOutputDir') }}
            </button>
          </div>
        </div>
        <div class="vg-progress">
          <span class="vg-progress__bar">
            <span class="vg-progress__fill" :class="{ 'vg-progress__fill--fail': task.status === 'error' }" :style="{ width: progressLabel }"></span>
          </span>
          <span>{{ progressLabel }}</span>
        </div>
      </section>

      <section class="vg-card vg-card--flush">
        <div class="vg-card__head">
          <span class="vg-card__title"><ScrollText :size="16" /> {{ t('production.detail.logs') }} <small>{{ task.logs.length }}</small></span>
          <button class="vg-btn vg-btn--sm" type="button" @click="refresh"><RefreshCw :size="14" /> {{ t('common.refresh') }}</button>
        </div>
        <div class="task-detail__logs">
          <div v-if="!task.logs.length" class="vg-empty"><p>{{ t('production.detail.noLogs') }}</p></div>
          <pre v-for="(log, index) in task.logs" :key="`${task.id}-${index}`" class="task-detail__log">{{ log }}</pre>
        </div>
      </section>
    </template>

    <section v-else class="vg-card">
      <div class="vg-empty">
        <span class="vg-empty__icon"><SearchX :size="24" /></span>
        <h3>{{ t('production.detail.notFound') }}</h3>
        <p>{{ t('production.detail.missing') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.task-detail { width: min(1180px, 100%); margin: 0 auto; }
.task-detail .vg-page-head h1 .vg-pill { font-size: 12px; }
.task-detail__dir { grid-column: span 2; }
.task-detail__path { display: block; font-size: 13px; font-weight: 600; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-detail__logs { max-height: 460px; overflow: auto; margin-top: 12px; padding: 4px 16px 14px; border-top: 1px solid var(--theme-divider); }
.task-detail__log { margin: 0; padding: 7px 0; border-bottom: 1px dashed var(--theme-divider); font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--theme-text-secondary); white-space: pre-wrap; word-break: break-all; }
.task-detail__log:last-child { border-bottom: 0; }
</style>
