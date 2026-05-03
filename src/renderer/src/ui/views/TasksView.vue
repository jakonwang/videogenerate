<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'
import UiChip from '../components/UiChip.vue'
import UiWorkspaceSidebar from '../components/UiWorkspaceSidebar.vue'
import ProductionTabs from '../components/ProductionTabs.vue'
import {
  CircleCheck,
  CircleX,
  Folder,
  Loader2,
  Pause,
  Play,
  Plus,
  Rocket,
  Smartphone,
  Square,
} from 'lucide-vue-next'
import QRCode from 'qrcode'

const { t } = useI18n()
const route = useRoute()

type Product = { id: string; name: string }
type Template = {
  id: string
  name: string
  bgm?: { filePaths?: string[]; volume?: number } | null
  audio?: { source?: 'keep' | 'mute'; ducking?: { enabled?: boolean; amountDb?: number } } | null
  titleOverlay?: { enabled?: boolean; textPool?: string[] } | null
  tts?: { enabled?: boolean; textPool?: string[]; voice?: string } | null
  transition?: { enabled?: boolean; pool?: string[]; durationSec?: { min?: number; max?: number } } | null
  colorGrade?: { enabled?: boolean } | null
  jitter?: { color?: { enabled?: boolean } | null } | null
}
type TasksWorkspace = 'media' | 'audio' | 'text_scripts' | 'effects' | 'transitions'
const TASKS_WORKSPACES: TasksWorkspace[] = ['media', 'audio', 'text_scripts', 'effects', 'transitions']
const TASKS_FORM_STORAGE_KEY = 'videogenerate-tasks-form'
type VideoTask = {
  id: string
  createdAt: number
  productId: string
  templateId: string
  outPath: string
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'
  progress: number
  error?: string
  logs: string[]
  reportPath?: string
}

const products = ref<Product[]>([])
const templates = ref<Template[]>([])
const tasks = ref<VideoTask[]>([])
const stats = ref<{ concurrency: number; pending: number; size: number; paused: boolean } | null>(null)
const showLogs = ref(false)
const maxShow = ref(200)
const lastAction = ref<{ type: 'info' | 'error'; message: string } | null>(null)
const starting = ref(false)
const batchSettingsOpen = ref(false)

const scanOpen = ref(false)
const scanLoading = ref(false)
const scanUrl = ref('')
const scanQrDataUrl = ref('')
const scanError = ref('')

const form = reactive<{ productId: string; templateId: string; count: number; outDir: string }>({
  productId: '',
  templateId: '',
  count: 5,
  outDir: '',
})
const workspace = ref<TasksWorkspace>('text_scripts')
const handledQuickStartToken = ref('')

function normalizeOutputDirFromDataDir(dataDir: string) {
  const base = String(dataDir ?? '').trim().replace(/[\\/]+$/, '')
  if (!base) return ''
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base}${sep}exports`
}

function restoreFormDraft() {
  try {
    const raw = localStorage.getItem(TASKS_FORM_STORAGE_KEY)
    if (!raw) return
    const payload = JSON.parse(raw) as Partial<{
      productId: string
      templateId: string
      count: number
      outDir: string
    }>
    form.productId = String(payload.productId ?? '').trim()
    form.templateId = String(payload.templateId ?? '').trim()
    form.count = Number(payload.count ?? 5) || 5
    form.outDir = String(payload.outDir ?? '').trim()
  } catch {
    // ignore invalid local storage
  }
}

function persistFormDraft() {
  try {
    const payload = {
      productId: String(form.productId ?? ''),
      templateId: String(form.templateId ?? ''),
      count: Math.max(1, Math.floor(Number(form.count) || 1)),
      outDir: String(form.outDir ?? ''),
    }
    localStorage.setItem(TASKS_FORM_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

const workspaceItems = computed(() => [
  { key: 'media', label: t('tasks.navMedia') },
  { key: 'audio', label: t('tasks.navAudio') },
  { key: 'text_scripts', label: t('tasks.navTextScripts') },
  { key: 'effects', label: t('tasks.navEffects') },
  { key: 'transitions', label: t('tasks.navTransitions') },
])

const running = computed(() => tasks.value.some((t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused'))
const total = computed(() => tasks.value.length)
const doneCount = computed(() => tasks.value.filter((t) => t.status === 'done').length)
const failCount = computed(() => tasks.value.filter((t) => t.status === 'error').length)
const activeCount = computed(() => tasks.value.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused').length)
const shownTasks = computed(() => tasks.value.slice(0, maxShow.value))
const latestReportPath = computed(() => {
  for (const tsk of tasks.value) {
    if (tsk.status === 'done' && tsk.reportPath) return tsk.reportPath
  }
  return ''
})
const activeTemplate = computed(() => templates.value.find((tpl) => tpl.id === form.templateId) ?? null)
const activeTemplateBgmCount = computed(() => activeTemplate.value?.bgm?.filePaths?.length ?? 0)
const activeTemplateDucking = computed(() => activeTemplate.value?.audio?.ducking ?? null)
const activeTemplateTransitionPool = computed(() => activeTemplate.value?.transition?.pool ?? [])
const workspaceHint = computed(() => {
  if (workspace.value === 'audio') return t('tasks.wsHintAudio')
  if (workspace.value === 'effects') return t('tasks.wsHintEffects')
  if (workspace.value === 'transitions') return t('tasks.wsHintTransitions')
  if (workspace.value === 'media') return t('tasks.wsHintMedia')
  return t('tasks.wsHintText')
})

function basename(p: string) {
  return (p ?? '').split(/[/\\\\]/).pop() ?? p
}

async function showInFolder(fullPath: string) {
  try {
    const fn = (window.api as any)?.shell?.showItemInFolder
    if (typeof fn !== 'function') {
      window.alert(t('tasks.shellNotReady'))
      return
    }
    await fn(fullPath)
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  }
}

async function openReport(fullPath: string) {
  try {
    const fn = (window.api as any)?.shell?.openPath
    if (typeof fn !== 'function') {
      window.alert(t('tasks.shellNotReady'))
      return
    }
    await fn(fullPath)
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  }
}

async function openOutDir() {
  if (!form.outDir) return
  try {
    const fn = (window.api as any)?.shell?.openPath
    if (typeof fn !== 'function') {
      window.alert(t('tasks.shellNotReady'))
      return
    }
    await fn(form.outDir)
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  }
}

function statusLabel(s: VideoTask['status']) {
  if (s === 'running' || s === 'queued') return t('tasks.statusRunning')
  if (s === 'done') return t('tasks.statusDone')
  if (s === 'error') return t('tasks.statusError')
  if (s === 'paused') return t('tasks.statusPaused')
  if (s === 'cancelled') return t('tasks.statusCancelled')
  return s
}

function statusTone(s: VideoTask['status']) {
  if (s === 'done') return 'accent'
  if (s === 'error') return 'danger'
  return 'neutral'
}

function applyWorkspaceFromRoute() {
  const q = String(route.query.ws ?? '').trim()
  if (!q) return
  if (TASKS_WORKSPACES.includes(q as TasksWorkspace)) {
    workspace.value = q as TasksWorkspace
  }
}

async function refresh() {
  try {
    await window.api.products.ensureSegmentBucketsFromTemplates()
  } catch {
    /* ignore */
  }
  products.value = await window.api.products.list()
  templates.value = await window.api.templates.list()
  tasks.value = await window.api.tasks.list()
  stats.value = await window.api.tasks.stats()

  if (!products.value.some((p) => p.id === form.productId)) {
    form.productId = products.value[0]?.id ?? ''
  }
  if (!templates.value.some((x) => x.id === form.templateId)) {
    form.templateId = templates.value[0]?.id ?? ''
  }
  form.count = Math.max(1, Math.floor(Number(form.count) || 1))
  if (!String(form.outDir ?? '').trim()) {
    try {
      const paths = await window.api.getPaths()
      const candidate = normalizeOutputDirFromDataDir((paths as any)?.dataDir ?? '')
      if (candidate) form.outDir = candidate
    } catch {
      // ignore
    }
  }
}

async function pickOutDir() {
  const dir = await window.api.pickDir({ title: t('dialog.pickOutputDir') })
  if (dir) form.outDir = dir
}

async function startBatch(opts?: { silent?: boolean }) {
  const silent = Boolean(opts?.silent)
  lastAction.value = null
  if (!form.productId) {
    lastAction.value = { type: 'error', message: t('tasks.pickProductFirst') }
    if (!silent) window.alert(lastAction.value.message)
    return false
  }
  if (!form.templateId) {
    lastAction.value = { type: 'error', message: t('tasks.pickTemplateFirst') }
    if (!silent) window.alert(lastAction.value.message)
    return false
  }
  if (!form.outDir) {
    lastAction.value = { type: 'error', message: t('tasks.pickOutDirFirst') }
    if (!silent) window.alert(lastAction.value.message)
    return false
  }

  starting.value = true
  try {
    const res = await window.api.tasks.enqueueBatch({
      productId: form.productId,
      templateId: form.templateId,
      count: Number(form.count) || 1,
      outDir: form.outDir,
    })
    const requested = Number((res as any)?.requested ?? form.count ?? 0)
    const enqueued = Number((res as any)?.enqueued ?? 0)
    const hintCode = String((res as any)?.hintCode ?? '')
    const missingSegs = (res as any)?.missingSegments
    const hintKeys: Record<string, string> = {
      missing_assets: 'tasks.queueHintMissingAssets',
      plan_build_failed: 'tasks.queueHintPlanBuildFailed',
      dedupe: 'tasks.queueHintDedupe',
      similarity: 'tasks.queueHintSimilarity',
      overuse: 'tasks.queueHintOveruse',
      generic: 'tasks.queueHintGeneric',
    }
    const legacyHint = (res as any)?.hint ? String((res as any).hint) : ''
    let hintMsg = hintCode && hintKeys[hintCode] ? t(hintKeys[hintCode]) : legacyHint
    if (
      hintCode === 'missing_assets' &&
      Array.isArray(missingSegs) &&
      missingSegs.length
    ) {
      hintMsg += t('tasks.queueHintMissingSegmentsList', { segments: missingSegs.join('、') })
    }
    const planErr = String((res as any)?.planError ?? '').trim()
    if (hintCode === 'plan_build_failed' && planErr) {
      hintMsg += t('tasks.queuePlanErrorDetail', { detail: planErr })
    }
    const hint = hintMsg ? t('tasks.hintWrap', { hint: hintMsg }) : ''
    lastAction.value = {
      type: enqueued < requested ? 'error' : 'info',
      message:
        enqueued < requested
          ? t('tasks.queuePartial', { enqueued, requested, hint })
          : t('tasks.queueDone', { enqueued }),
    }
    await refresh()
    return true
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    lastAction.value = { type: 'error', message: msg }
    if (!silent) window.alert(t('tasks.startFailed', { msg }))
    return false
  } finally {
    starting.value = false
  }
}

async function cancelAll() {
  await window.api.tasks.cancelAll()
  await refresh()
}

async function pause() {
  await window.api.tasks.pause()
  await refresh()
}

async function resume() {
  await window.api.tasks.resume()
  await refresh()
}

function closeScanModal() {
  scanOpen.value = false
  scanUrl.value = ''
  scanQrDataUrl.value = ''
  scanError.value = ''
  scanLoading.value = false
}

async function openScanModal(row: VideoTask) {
  if (row.status !== 'done') return
  scanOpen.value = true
  scanLoading.value = true
  scanUrl.value = ''
  scanQrDataUrl.value = ''
  scanError.value = ''
  try {
    const res = await window.api.preview.getMobilePlayUrl(row.id)
    if (!res.ok) {
      if (res.code === 'not_done') scanError.value = t('tasks.scanErrNotDone')
      else if (res.code === 'no_lan') scanError.value = t('tasks.scanErrNoLan')
      else scanError.value = res.detail ? `${t('tasks.scanErrServer')}: ${res.detail}` : t('tasks.scanErrServer')
      return
    }
    scanUrl.value = res.url
    scanQrDataUrl.value = await QRCode.toDataURL(res.url, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  } catch (e: any) {
    scanError.value = e?.message ?? String(e)
  } finally {
    scanLoading.value = false
  }
}

async function copyScanUrl() {
  const u = scanUrl.value
  if (!u) return
  try {
    await navigator.clipboard.writeText(u)
  } catch {
    window.prompt(t('tasks.scanCopyFallback'), u)
  }
}

async function handleQuickStartFromRoute() {
  const token = String(route.query.quickStart ?? '').trim()
  if (!token) return
  if (handledQuickStartToken.value === token) return
  handledQuickStartToken.value = token
  form.count = Math.max(1, Math.floor(Number(form.count) || 1))
  if (!form.productId && products.value[0]) form.productId = products.value[0].id
  if (!form.templateId && templates.value[0]) form.templateId = templates.value[0].id
  if (!String(form.outDir ?? '').trim()) {
    try {
      const paths = await window.api.getPaths()
      const candidate = normalizeOutputDirFromDataDir((paths as any)?.dataDir ?? '')
      if (candidate) form.outDir = candidate
    } catch {
      // ignore
    }
  }
  await startBatch({ silent: true })
}

onMounted(async () => {
  restoreFormDraft()
  applyWorkspaceFromRoute()
  await refresh()
  await handleQuickStartFromRoute()
  window.api.tasks.onEvent((evt) => {
    if (evt?.type === 'task:update') {
      const idx = tasks.value.findIndex((t) => t.id === evt.task.id)
      if (idx >= 0) tasks.value[idx] = evt.task
      else tasks.value.unshift(evt.task)
    } else if (evt?.type === 'queue:stats') {
      // 浠呮洿鏂拌交閲忕粺璁★紝閬垮厤棰戠箒鍒锋柊鏁翠釜鍒楄〃
      if (stats.value) stats.value = { ...stats.value, pending: evt.stats.pending, size: evt.stats.size }
    }
  })
})
watch(
  () => [form.productId, form.templateId, form.count, form.outDir] as const,
  () => {
    persistFormDraft()
  },
)
watch(
  () => route.query.ws,
  () => {
    applyWorkspaceFromRoute()
  },
)
watch(
  () => route.query.quickStart,
  () => {
    void handleQuickStartFromRoute()
  },
)
</script>

<template>
  <div class="app-page space-y-4">
    <ProductionTabs />
    <div class="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <aside class="app-card p-4">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-black text-white">任务列表</h2>
          <p class="mt-1 text-xs text-slate-500">全部 {{ total }} / 生成中 {{ activeCount }} / 失败 {{ failCount }}</p>
        </div>
        <button class="app-ghost px-3 py-2 text-xs" @click="batchSettingsOpen = !batchSettingsOpen">批量设置</button>
      </div>

      <div class="app-tabs mb-4">
        <button class="app-tab is-active">全部</button>
        <button class="app-tab">生成中</button>
        <button class="app-tab">已完成</button>
        <button class="app-tab">失败</button>
      </div>

      <div class="space-y-3">
        <div v-if="!shownTasks.length" class="app-soft-card p-5 text-sm text-slate-400">还没有生成任务。打开批量设置，选择产品和模板后开始生成。</div>
        <button v-for="row in shownTasks" :key="row.id" class="app-soft-card w-full p-3 text-left transition hover:bg-white/[0.06]" @click="row.status === 'done' ? openScanModal(row) : undefined">
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="min-w-0 truncate text-sm font-black text-white">{{ basename(row.outPath) || row.id }}</div>
            <span class="text-xs font-bold" :class="row.status === 'done' ? 'text-emerald-300' : row.status === 'error' ? 'text-red-300' : 'text-amber-300'">{{ statusLabel(row.status) }}</span>
          </div>
          <div class="app-progress h-1.5"><span :style="{ width: Math.round((row.progress || 0) * 100) + '%' }"></span></div>
          <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{{ Math.round((row.progress || 0) * 100) }}/100</span>
            <span>{{ row.error || '自动生成' }}</span>
          </div>
        </button>
      </div>
      </aside>

      <main class="app-card p-5">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-black text-white">任务详情</h1>
          <p class="mt-2 text-sm text-slate-400">当前批次进度与输出设置</p>
        </div>
        <div class="text-right">
          <div class="text-4xl font-black text-violet-300">{{ total === 0 ? 0 : Math.round((doneCount / total) * 100) }}%</div>
          <div class="mt-1 text-xs text-slate-500">{{ doneCount }} 完成 / {{ failCount }} 失败</div>
        </div>
      </div>

      <div class="app-progress mb-6 h-2"><span :style="{ width: (total === 0 ? 0 : Math.round((doneCount / total) * 100)) + '%' }"></span></div>

      <div class="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div class="overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10">
          <div class="grid aspect-video place-items-center bg-gradient-to-br from-slate-900 to-slate-950 text-slate-500">
            <ListVideo class="h-12 w-12" />
          </div>
        </div>
        <div class="app-soft-card space-y-3 p-4 text-sm text-slate-300">
          <div class="flex justify-between"><span class="text-slate-500">成功</span><b class="text-white">{{ doneCount }}</b></div>
          <div class="flex justify-between"><span class="text-slate-500">失败</span><b class="text-white">{{ failCount }}</b></div>
          <div class="flex justify-between"><span class="text-slate-500">剩余</span><b class="text-white">{{ Math.max(0, total - doneCount - failCount) }}</b></div>
          <div class="break-all pt-2 text-xs text-slate-500">{{ form.outDir || '未选择输出目录' }}</div>
        </div>
      </div>

      <details v-if="batchSettingsOpen" class="app-soft-card mb-5 p-4" open>
        <summary class="cursor-pointer text-sm font-black text-white">批量设置</summary>
        <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_120px]">
          <select v-model="form.productId" class="ui-select h-10"><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select>
          <select v-model="form.templateId" class="ui-select h-10"><option v-for="tpl in templates" :key="tpl.id" :value="tpl.id">{{ tpl.name }}</option></select>
          <input v-model.number="form.count" type="number" min="1" class="ui-input h-10" />
        </div>
        <div class="mt-3 flex gap-2">
          <input v-model="form.outDir" class="ui-input h-10 min-w-0 flex-1" :placeholder="t('tasks.outDirPh')" />
          <button class="app-ghost px-3 text-xs" @click="pickOutDir">选择目录</button>
        </div>
        <div v-if="lastAction" class="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">{{ lastAction.message }}</div>
      </details>

      <div class="flex flex-wrap gap-2">
        <button class="app-primary px-5 py-3 text-sm" :disabled="running || starting" @click="startBatch">{{ starting ? t('common.starting') : t('common.startGenerate') }}</button>
        <button class="app-ghost px-4 py-3 text-sm" :disabled="!running || (stats?.paused ?? false)" @click="pause">暂停</button>
        <button class="app-ghost px-4 py-3 text-sm" :disabled="!running || !(stats?.paused ?? false)" @click="resume">继续</button>
        <button class="rounded-lg border border-red-400/35 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-200" :disabled="!running" @click="cancelAll">停止</button>
        <button class="app-ghost px-4 py-3 text-sm" :disabled="!form.outDir" @click="openOutDir">打开输出目录</button>
        <button v-if="latestReportPath" class="app-ghost px-4 py-3 text-sm" @click="openReport(latestReportPath)">打开报告</button>
      </div>
      </main>
    </div>
  </div>

  <div
      v-if="scanOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      @click.self="closeScanModal"
    >
      <div
        class="w-full max-w-sm rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-2xl"
        @click.stop
      >
        <div class="text-sm font-semibold text-white/90">{{ t('tasks.scanQrTitle') }}</div>
        <div class="mt-1 text-[11px] leading-relaxed text-white/50">{{ t('tasks.scanQrHint') }}</div>
        <div class="mt-4 flex min-h-[200px] flex-col items-center justify-center gap-3">
          <Loader2 v-if="scanLoading" class="h-8 w-8 animate-spin text-teal-400/80" />
          <template v-else-if="scanQrDataUrl">
            <img :src="scanQrDataUrl" alt="QR" class="h-56 w-56 rounded-lg border border-white/10 bg-white p-2" />
            <div
              class="w-full break-all rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-teal-200/90"
            >
              {{ scanUrl }}
            </div>
            <UiButton class="h-8 px-3" variant="ghost" @click="copyScanUrl">{{ t('tasks.scanCopyLink') }}</UiButton>
          </template>
          <div v-else-if="scanError" class="text-center text-sm text-red-300/90">{{ scanError }}</div>
        </div>
        <div class="mt-4 flex justify-end">
          <UiButton variant="ghost" @click="closeScanModal">{{ t('common.cancel') }}</UiButton>
        </div>
      </div>
    </div>
</template>

