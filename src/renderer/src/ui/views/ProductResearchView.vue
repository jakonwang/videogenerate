<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Archive, ArrowDownUp, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Copy, Eye, FolderOpen, List, Loader2,
  MoreHorizontal, Package, Pencil, Play, Plus, RefreshCw, Search, ShoppingBag, ShoppingCart, Smartphone, Star,
  Trash2, TrendingUp, X,
} from 'lucide-vue-next'
import type {
  ProductResearchScheme,
  ProductResearchSchemeState,
  ProductResearchSnapshot,
  ProductResearchTask,
} from '@/../../shared/productResearch'
import PrPager from './product-research/PrPager.vue'
import PrToast from './product-research/PrToast.vue'
import PrConfirmDialog from './product-research/PrConfirmDialog.vue'
import PrPairingDialog from './product-research/PrPairingDialog.vue'
import PrSchemeFormDialog from './product-research/PrSchemeFormDialog.vue'
import {
  MARKET_OPTIONS, SCHEME_STATUS_OPTIONS, SOP_STEPS, TASK_STATUS_LABEL, formatDate, formatDuration, formatNumber, marketOf,
  ratio, schemeStatusLabel, stageLabel, type SchemeFormValue,
} from './product-research/productResearchUtils'
import './product-research/product-research.css'

type Tab = 'schemes' | 'tasks' | 'analytics'
type SortKey = 'name' | 'updatedAt'

const router = useRouter()

const tab = ref<Tab>('schemes')
const schemes = ref<ProductResearchScheme[]>([])
const loading = ref(true)
const loadError = ref('')
const snapshot = ref<ProductResearchSnapshot | null>(null)
const schemeStates = ref<Record<string, ProductResearchSchemeState | null>>({})
const analyticsLoading = ref(false)

const filters = reactive({ q: '', status: 'all', market: 'all', stage: 'all', time: 'all' })
const sort = reactive<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'updatedAt', dir: 'desc' })
const page = ref(1)
const pageSize = ref(10)
const selected = ref<string[]>([])
const menuFor = ref('')

const formOpen = ref(false)
const formBusy = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formInitial = ref<Partial<SchemeFormValue> | null>(null)
const editingId = ref('')
const pairingOpen = ref(false)
const sopGuideOpen = ref(false)
const confirmState = ref<{ title: string; message: string; confirmText: string; action: () => Promise<void> } | null>(null)
const confirmBusy = ref(false)
const toast = ref<{ id: number; text: string; tone: 'info' | 'success' | 'error' } | null>(null)

let toastTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function notify(text: string, tone: 'info' | 'success' | 'error' = 'info') {
  toast.value = { id: Date.now(), text, tone }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error)
}

// ===== Data =====
async function loadSchemes() {
  loadError.value = ''
  try {
    schemes.value = await window.api.productResearch.listSchemes()
    const ids = new Set(schemes.value.map((item) => item.id))
    selected.value = selected.value.filter((id) => ids.has(id))
  } catch (error) {
    loadError.value = errorText(error)
  } finally {
    loading.value = false
  }
}

async function loadSnapshot() {
  try { snapshot.value = await window.api.productResearch.snapshot() } catch { /* server may be starting */ }
}

async function loadSchemeStates() {
  analyticsLoading.value = true
  try {
    const entries = await Promise.all(schemes.value.map(async (scheme) => [scheme.id, await window.api.productResearch.getSchemeState(scheme.id)] as const))
    schemeStates.value = Object.fromEntries(entries)
  } finally {
    analyticsLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadSchemes(), loadSnapshot()])
  if (tab.value === 'analytics') await loadSchemeStates()
}

const onlineDevices = computed(() => snapshot.value?.devices.filter((item) => item.connected).length || 0)

// ===== Filtering =====
function withinTime(ts: number) {
  if (filters.time === 'all') return true
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (filters.time === '7d') start.setDate(start.getDate() - 6)
  if (filters.time === '30d') start.setDate(start.getDate() - 29)
  return ts >= start.getTime()
}

const filteredSchemes = computed(() => {
  const q = filters.q.trim().toLowerCase()
  const list = schemes.value.filter((scheme) => {
    if (q && !`${scheme.name} ${scheme.need} ${scheme.note || ''}`.toLowerCase().includes(q)) return false
    if (filters.status !== 'all' && scheme.status !== filters.status) return false
    if (filters.market !== 'all' && scheme.market !== filters.market) return false
    if (filters.stage !== 'all' && scheme.sopStage !== Number(filters.stage)) return false
    return withinTime(scheme.createdAt)
  })
  const dir = sort.dir === 'asc' ? 1 : -1
  return list.sort((a, b) => {
    if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1
    if (sort.key === 'name') return a.name.localeCompare(b.name, 'zh-CN') * dir
    return (a.updatedAt - b.updatedAt) * dir
  })
})

const pagedSchemes = computed(() => filteredSchemes.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const hasFilters = computed(() => Boolean(filters.q.trim()) || filters.status !== 'all' || filters.market !== 'all' || filters.stage !== 'all' || filters.time !== 'all')
const pageAllSelected = computed(() => pagedSchemes.value.length > 0 && pagedSchemes.value.every((item) => selected.value.includes(item.id)))

watch(filters, () => { page.value = 1 })

function toggleSort(key: SortKey) {
  if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
  else { sort.key = key; sort.dir = key === 'name' ? 'asc' : 'desc' }
}

function togglePageSelection() {
  const ids = pagedSchemes.value.map((item) => item.id)
  selected.value = pageAllSelected.value ? selected.value.filter((id) => !ids.includes(id)) : [...new Set([...selected.value, ...ids])]
}

function resetFilters() {
  Object.assign(filters, { q: '', status: 'all', market: 'all', stage: 'all', time: 'all' })
}

function statusTone(status: string) {
  return status === 'active' ? 'green' : status === 'pending' ? 'amber' : status === 'completed' ? 'blue' : ''
}

// ===== Scheme actions =====
function openScheme(id: string) {
  router.push({ name: 'product-research-detail', params: { schemeId: id } })
}

function openCreate() {
  formMode.value = 'create'
  formInitial.value = null
  editingId.value = ''
  formOpen.value = true
}

function openEdit(scheme: ProductResearchScheme) {
  menuFor.value = ''
  formMode.value = 'edit'
  formInitial.value = { name: scheme.name, need: scheme.need, market: scheme.market, note: scheme.note || '' }
  editingId.value = scheme.id
  formOpen.value = true
}

async function submitForm(value: SchemeFormValue, asDraft: boolean) {
  formBusy.value = true
  try {
    if (formMode.value === 'edit') {
      await window.api.productResearch.updateScheme(editingId.value, { name: value.name, need: value.need, market: value.market, note: value.note })
      formOpen.value = false
      notify('方案已更新', 'success')
      await loadSchemes()
      return
    }
    const scheme = await window.api.productResearch.createScheme({ name: value.name, need: value.need, market: value.market, keywords: value.keywords, note: value.note || undefined })
    formOpen.value = false
    if (asDraft) {
      notify('草稿已保存', 'success')
      await loadSchemes()
    } else {
      await window.api.productResearch.updateScheme(scheme.id, { status: 'active' })
      openScheme(scheme.id)
    }
  } catch (error) {
    notify(`保存失败：${errorText(error)}`, 'error')
  } finally {
    formBusy.value = false
  }
}

async function toggleStar(scheme: ProductResearchScheme) {
  const next = !scheme.starred
  scheme.starred = next
  try { await window.api.productResearch.updateScheme(scheme.id, { starred: next }) }
  catch (error) { scheme.starred = !next; notify(errorText(error), 'error') }
}

async function copyScheme(scheme: ProductResearchScheme) {
  menuFor.value = ''
  try {
    const state = await window.api.productResearch.getSchemeState(scheme.id)
    await window.api.productResearch.createScheme({
      name: `${scheme.name}（副本）`.slice(0, 50),
      need: scheme.need,
      market: scheme.market,
      keywords: (state?.keywords || []).map((item) => item.value),
      note: scheme.note,
    })
    notify('已复制方案（含搜索词，不含采集数据）', 'success')
    await loadSchemes()
  } catch (error) {
    notify(`复制失败：${errorText(error)}`, 'error')
  }
}

async function setStatus(ids: string[], status: ProductResearchScheme['status']) {
  menuFor.value = ''
  try {
    await Promise.all(ids.map((id) => window.api.productResearch.updateScheme(id, { status })))
    notify(status === 'completed' ? `已归档 ${ids.length} 个方案` : '状态已更新', 'success')
    await loadSchemes()
  } catch (error) {
    notify(errorText(error), 'error')
  }
}

function askDelete(ids: string[]) {
  menuFor.value = ''
  if (!ids.length) return
  const name = ids.length === 1 ? `「${schemes.value.find((item) => item.id === ids[0])?.name || ''}」` : `选中的 ${ids.length} 个方案`
  confirmState.value = {
    title: '删除选品方案',
    message: `确定删除${name}吗？方案内的搜索词、采集任务、商品图片与测试记录将一并删除，且无法恢复。`,
    confirmText: '确认删除',
    action: async () => {
      await Promise.all(ids.map((id) => window.api.productResearch.deleteScheme(id)))
      selected.value = selected.value.filter((id) => !ids.includes(id))
      notify(`已删除 ${ids.length} 个方案`, 'success')
      await loadSchemes()
    },
  }
}

async function runConfirm() {
  if (!confirmState.value) return
  confirmBusy.value = true
  try { await confirmState.value.action(); confirmState.value = null }
  catch (error) { notify(errorText(error), 'error') }
  finally { confirmBusy.value = false }
}

function onDocumentClick() { menuFor.value = '' }

// ===== Tasks tab =====
const schemeNameMap = computed(() => new Map(schemes.value.map((item) => [item.id, item.name])))
const deviceNameMap = computed(() => new Map((snapshot.value?.devices || []).map((item) => [item.id, item.name])))
const taskFilter = ref<'all' | 'active' | 'failed' | 'completed'>('all')
const taskPage = ref(1)
const taskPageSize = ref(20)
const allTasks = computed(() => snapshot.value?.tasks || [])
const taskCounts = computed(() => ({
  all: allTasks.value.length,
  active: allTasks.value.filter((item) => item.status === 'queued' || item.status === 'running').length,
  failed: allTasks.value.filter((item) => item.status === 'failed').length,
  completed: allTasks.value.filter((item) => item.status === 'completed').length,
}))
const filteredTasks = computed(() => allTasks.value.filter((task) => {
  if (taskFilter.value === 'active') return task.status === 'queued' || task.status === 'running'
  if (taskFilter.value === 'all') return true
  return task.status === taskFilter.value
}))
const pagedTasks = computed(() => filteredTasks.value.slice((taskPage.value - 1) * taskPageSize.value, taskPage.value * taskPageSize.value))
watch(taskFilter, () => { taskPage.value = 1 })

function taskTone(status: string) {
  return status === 'completed' ? 'green' : status === 'running' ? 'blue' : status === 'failed' ? 'red' : status === 'queued' ? 'amber' : ''
}
function taskProgress(task: ProductResearchTask) {
  return task.targetCount ? Math.min(100, Math.round((task.collectedCount / task.targetCount) * 100)) : 0
}

async function cancelTask(task: ProductResearchTask) {
  try { await window.api.productResearch.cancelTask(task.id); await loadSnapshot() } catch (error) { notify(errorText(error), 'error') }
}
async function retryTask(task: ProductResearchTask) {
  try {
    await window.api.productResearch.createTask({ keyword: task.keyword, schemeId: task.schemeId, sort: task.sort, targetCount: task.targetCount })
    notify(`已重新提交「${task.keyword}」`, 'success')
    await loadSnapshot()
  } catch (error) {
    notify(/No paired phone/i.test(errorText(error)) ? '没有在线的采集手机，请先连接手机' : errorText(error), 'error')
  }
}
async function removeTask(task: ProductResearchTask) {
  try { await window.api.productResearch.removeTask(task.id); await loadSnapshot(); await loadSchemes() } catch (error) { notify(errorText(error), 'error') }
}

// ===== Analytics tab =====
const analytics = computed(() => {
  const rows = schemes.value.map((scheme) => {
    const state = schemeStates.value[scheme.id]
    const records = state?.liveTestRecords || []
    const candidateSet = new Set(state?.candidateIds || [])
    const kept = (state?.productEdits || []).filter((item) => item.kept && candidateSet.has(item.resultId)).length
    const tested = new Set(records.map((item) => item.resultId)).size
    const winners = records.filter((item) => item.conclusion === 'excellent').length
    const revenue = records.reduce((sum, item) => sum + (item.revenue || 0), 0)
    return { scheme, collected: scheme.resultCount, candidates: scheme.candidateCount, kept, tested, winners, revenue }
  })
  const sum = (key: 'collected' | 'candidates' | 'kept' | 'tested' | 'winners' | 'revenue') => rows.reduce((total, row) => total + row[key], 0)
  const stageCounts = SOP_STEPS.map((_, index) => schemes.value.filter((item) => item.sopStage === index + 1).length)
  return {
    rows: rows.sort((a, b) => b.collected - a.collected),
    total: schemes.value.length,
    active: schemes.value.filter((item) => item.status === 'active' || item.status === 'pending').length,
    completed: schemes.value.filter((item) => item.status === 'completed').length,
    keywords: schemes.value.reduce((total, item) => total + item.keywordCount, 0),
    collected: sum('collected'),
    candidates: sum('candidates'),
    kept: sum('kept'),
    tested: sum('tested'),
    winners: sum('winners'),
    revenue: sum('revenue'),
    stageCounts,
    maxStage: Math.max(1, ...stageCounts),
  }
})

const funnel = computed(() => {
  const steps = [
    { label: '已采集商品', value: analytics.value.collected },
    { label: '候选商品', value: analytics.value.candidates },
    { label: '确定保留', value: analytics.value.kept },
    { label: '直播测试', value: analytics.value.tested },
    { label: '爆款商品', value: analytics.value.winners },
  ]
  const max = Math.max(1, steps[0].value)
  return steps.map((step) => ({ ...step, width: Math.max(4, (step.value / max) * 100) }))
})

watch(() => taskCounts.value.active, (count, previous) => {
  // A task just finished: refresh scheme counters (已采集商品).
  if (previous > count) void loadSchemes()
})

watch(tab, (value) => {
  if (value === 'analytics') void loadSchemeStates()
  if (value === 'tasks') void loadSnapshot()
})

onMounted(() => {
  void refreshAll()
  document.addEventListener('click', onDocumentClick)
  let tick = 0
  pollTimer = setInterval(() => {
    tick += 1
    // Tasks tab / running tasks refresh every 3s; otherwise only the phone status every ~12s.
    if (tab.value === 'tasks' || taskCounts.value.active > 0 || tick % 4 === 0) void loadSnapshot()
  }, 3000)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  if (pollTimer) clearInterval(pollTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="prd-page pr-list">
    <!-- Hero -->
    <header class="pr-hero">
      <div class="pr-hero__icon"><ShoppingCart :size="34" /></div>
      <div class="pr-hero__copy">
        <h1>选品中心</h1>
        <p>管理选品方案，按标准 SOP 完成从需求收集、采集、筛选到输出的全流程选品。</p>
      </div>
      <div class="pr-hero__side">
        <button class="pr-phone-chip" :class="{ 'is-online': onlineDevices > 0 }" title="连接采集手机" @click="pairingOpen = true">
          <Smartphone :size="15" /><span class="pr-phone-chip__dot" />手机连接：{{ onlineDevices }} 台在线
        </button>
        <button class="prd-btn prd-btn--outline prd-btn--sm" title="刷新" @click="refreshAll"><RefreshCw :size="13" />刷新</button>
      </div>
      <div class="pr-hero__art" aria-hidden="true">
        <span class="pr-hero__bars"><i /><i /><i /></span>
        <ShoppingBag :size="96" :stroke-width="1.2" />
        <TrendingUp class="pr-hero__trend" :size="34" />
      </div>
    </header>

    <!-- Tabs -->
    <nav class="pr-tabs" role="tablist">
      <button class="pr-tab" :class="{ 'is-active': tab === 'schemes' }" role="tab" @click="tab = 'schemes'"><List :size="17" />方案列表</button>
      <button class="pr-tab" :class="{ 'is-active': tab === 'tasks' }" role="tab" @click="tab = 'tasks'">
        <Play :size="16" />任务执行<span v-if="taskCounts.active" class="prd-seg__count pr-tab__badge">{{ taskCounts.active }}</span>
      </button>
      <button class="pr-tab" :class="{ 'is-active': tab === 'analytics' }" role="tab" @click="tab = 'analytics'"><BarChart3 :size="17" />数据分析</button>
    </nav>

    <!-- ===== 方案列表 ===== -->
    <template v-if="tab === 'schemes'">
      <div class="pr-toolbar">
        <div class="prd-search pr-toolbar__search">
          <Search :size="15" />
          <input v-model="filters.q" class="prd-input" placeholder="搜索方案名称、客户需求或搜索词…" />
        </div>
        <select v-model="filters.status" class="prd-select">
          <option value="all">全部状态</option>
          <option v-for="option in SCHEME_STATUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <select v-model="filters.market" class="prd-select">
          <option value="all">全部市场</option>
          <option v-for="option in MARKET_OPTIONS" :key="option.value" :value="option.value">{{ option.flag }} {{ option.label }}</option>
        </select>
        <select v-model="filters.stage" class="prd-select">
          <option value="all">全部SOP阶段</option>
          <option v-for="(step, index) in SOP_STEPS" :key="step.name" :value="String(index + 1)">{{ index + 1 }} {{ step.name }}</option>
        </select>
        <label class="pr-time">
          <CalendarDays :size="15" />
          <select v-model="filters.time" class="prd-select">
            <option value="all">创建时间</option>
            <option value="today">今天</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </select>
        </label>
        <button class="prd-btn prd-btn--primary pr-toolbar__create" @click="openCreate"><Plus :size="16" />新建选品方案</button>
      </div>

      <div v-if="selected.length" class="pr-batchbar">
        <span>已选 <b>{{ selected.length }}</b> 个方案</span>
        <button class="prd-btn prd-btn--sm" @click="setStatus(selected, 'completed')"><Archive :size="13" />批量归档</button>
        <button class="prd-btn prd-btn--sm prd-btn--danger" @click="askDelete(selected)"><Trash2 :size="13" />批量删除</button>
        <button class="prd-link prd-link--muted" @click="selected = []">取消选择</button>
      </div>

      <section class="prd-card prd-card--flush pr-table-card">
        <div v-if="loading" class="prd-empty"><Loader2 :size="24" class="prd-spin" /><p>正在加载方案…</p></div>
        <div v-else-if="loadError" class="prd-empty">
          <h3>方案加载失败</h3><p>{{ loadError }}</p>
          <button class="prd-btn prd-btn--sm" @click="refreshAll"><RefreshCw :size="13" />重新加载</button>
        </div>
        <template v-else-if="filteredSchemes.length">
          <div class="pr-table-scroll">
            <table class="prd-table pr-table">
              <thead>
                <tr>
                  <th class="chk"><input type="checkbox" :checked="pageAllSelected" aria-label="全选本页" @change="togglePageSelection" /></th>
                  <th><span class="prd-th-sort" :class="{ 'is-active': sort.key === 'name' }" @click="toggleSort('name')">方案名称<ArrowDownUp :size="12" /></span></th>
                  <th>客户需求摘要</th>
                  <th>目标市场</th>
                  <th class="center">搜索词数量</th>
                  <th class="center">已采集商品</th>
                  <th class="center">候选商品</th>
                  <th>当前 SOP 阶段</th>
                  <th><span class="prd-th-sort" :class="{ 'is-active': sort.key === 'updatedAt' }" @click="toggleSort('updatedAt')">最近更新时间<ArrowDownUp :size="12" /></span></th>
                  <th>方案状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="scheme in pagedSchemes" :key="scheme.id" :class="{ 'is-selected': selected.includes(scheme.id) }" @dblclick="openScheme(scheme.id)">
                  <td class="chk"><input v-model="selected" type="checkbox" :value="scheme.id" /></td>
                  <td>
                    <div class="pr-name">
                      <button class="pr-name__text" :title="scheme.name" @click="openScheme(scheme.id)">{{ scheme.name }}</button>
                      <button class="prd-icon-btn pr-name__star" :class="{ 'prd-icon-btn--on': scheme.starred }" :title="scheme.starred ? '取消星标' : '星标置顶'" @click="toggleStar(scheme)">
                        <Star :size="14" :fill="scheme.starred ? 'currentColor' : 'none'" />
                      </button>
                    </div>
                  </td>
                  <td><span class="pr-need" :title="scheme.need">{{ scheme.need || '-' }}</span></td>
                  <td class="nowrap">{{ marketOf(scheme.market).flag }} {{ marketOf(scheme.market).label }}</td>
                  <td class="center"><span class="prd-num-blue">{{ scheme.keywordCount }}</span></td>
                  <td class="center">{{ formatNumber(scheme.resultCount) }}</td>
                  <td class="center">{{ formatNumber(scheme.candidateCount) }}</td>
                  <td><span class="prd-stage"><b>{{ scheme.sopStage }}</b>{{ stageLabel(scheme.sopStage) }}</span></td>
                  <td class="nowrap muted">{{ formatDate(scheme.updatedAt) }}</td>
                  <td><span class="prd-pill prd-pill--dot" :class="statusTone(scheme.status) && `prd-pill--${statusTone(scheme.status)}`">{{ schemeStatusLabel(scheme.status) }}</span></td>
                  <td>
                    <div class="pr-actions">
                      <button class="prd-btn prd-btn--xs" :class="scheme.status === 'completed' ? 'prd-btn--outline' : 'prd-btn--soft'" @click="openScheme(scheme.id)">
                        <Eye v-if="scheme.status === 'completed'" :size="12" /><Play v-else :size="12" />
                        {{ scheme.status === 'completed' ? '查看方案' : '继续方案' }}
                      </button>
                      <button class="prd-icon-btn" title="查看" @click="openScheme(scheme.id)"><Eye :size="15" /></button>
                      <button class="prd-icon-btn" title="复制方案" @click="copyScheme(scheme)"><Copy :size="15" /></button>
                      <button class="prd-icon-btn" title="归档" :disabled="scheme.status === 'completed'" @click="setStatus([scheme.id], 'completed')"><Archive :size="15" /></button>
                      <div class="prd-menu-wrap" @click.stop>
                        <button class="prd-icon-btn" title="更多" @click="menuFor = menuFor === scheme.id ? '' : scheme.id"><MoreHorizontal :size="15" /></button>
                        <div v-if="menuFor === scheme.id" class="prd-menu">
                          <button @click="openEdit(scheme)"><Pencil :size="13" />编辑方案</button>
                          <button @click="toggleStar(scheme); menuFor = ''"><Star :size="13" />{{ scheme.starred ? '取消星标' : '星标置顶' }}</button>
                          <button v-if="scheme.status === 'completed'" @click="setStatus([scheme.id], 'active')"><FolderOpen :size="13" />取消归档</button>
                          <button class="danger" @click="askDelete([scheme.id])"><Trash2 :size="13" />删除方案</button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pr-pager-wrap">
            <PrPager v-model:page="page" v-model:page-size="pageSize" :total="filteredSchemes.length" unit="条方案" :page-sizes="[10, 20, 50]" />
          </div>
        </template>
        <div v-else-if="hasFilters" class="prd-empty">
          <div class="prd-empty__icon"><Search :size="24" /></div>
          <h3>没有符合条件的方案</h3>
          <p>试试调整搜索词或筛选条件。</p>
          <button class="prd-btn prd-btn--sm" @click="resetFilters"><RefreshCw :size="13" />重置筛选</button>
        </div>
        <div v-else class="prd-empty pr-empty">
          <div class="pr-empty__art"><Package :size="46" :stroke-width="1.4" /></div>
          <h3>暂无选品方案</h3>
          <p>还没有创建任何选品方案，立即新建开始选品流程吧！</p>
          <button class="prd-btn prd-btn--primary prd-btn--lg" @click="openCreate"><Plus :size="17" />新建选品方案</button>
          <button class="prd-link pr-empty__link" @click="sopGuideOpen = true"><Play :size="13" />查看选品 SOP 流程</button>
        </div>
      </section>
    </template>

    <!-- ===== 任务执行 ===== -->
    <template v-else-if="tab === 'tasks'">
      <div class="pr-toolbar">
        <div class="prd-seg">
          <button class="prd-seg__btn" :class="{ 'is-active': taskFilter === 'all' }" @click="taskFilter = 'all'">全部任务<span class="prd-seg__count">{{ taskCounts.all }}</span></button>
          <button class="prd-seg__btn" :class="{ 'is-active': taskFilter === 'active' }" @click="taskFilter = 'active'">执行中<span class="prd-seg__count">{{ taskCounts.active }}</span></button>
          <button class="prd-seg__btn" :class="{ 'is-active': taskFilter === 'failed' }" @click="taskFilter = 'failed'">失败<span class="prd-seg__count">{{ taskCounts.failed }}</span></button>
          <button class="prd-seg__btn" :class="{ 'is-active': taskFilter === 'completed' }" @click="taskFilter = 'completed'">已完成<span class="prd-seg__count">{{ taskCounts.completed }}</span></button>
        </div>
        <div class="pr-toolbar__spacer" />
        <span class="pr-server" :class="{ 'is-on': snapshot?.serverRunning }">
          <span class="pr-phone-chip__dot" />局域网服务 {{ snapshot?.serverRunning ? '运行中' : '未启动' }}
          <code v-if="snapshot?.endpoint">{{ snapshot.endpoint }}</code>
        </span>
        <button class="prd-btn prd-btn--outline" @click="loadSnapshot"><RefreshCw :size="14" />刷新</button>
        <button class="prd-btn prd-btn--primary" @click="pairingOpen = true"><Smartphone :size="15" />连接手机</button>
      </div>
      <section class="prd-card prd-card--flush pr-table-card">
        <div class="pr-table-scroll">
          <table class="prd-table pr-table">
            <thead>
              <tr><th>#</th><th>所属方案</th><th>搜索词</th><th>状态</th><th>进度</th><th class="num">目标/已采集</th><th>排序</th><th>执行设备</th><th>创建时间</th><th>耗时</th><th>失败原因</th><th>操作</th></tr>
            </thead>
            <tbody>
              <tr v-if="!pagedTasks.length"><td colspan="12" class="prd-empty-cell">暂无采集任务。进入方案详情的「商品采集」步骤即可创建任务。</td></tr>
              <tr v-for="(task, index) in pagedTasks" :key="task.id">
                <td class="muted">{{ (taskPage - 1) * taskPageSize + index + 1 }}</td>
                <td>
                  <button v-if="task.schemeId && schemeNameMap.get(task.schemeId)" class="prd-link" @click="openScheme(task.schemeId!)">{{ schemeNameMap.get(task.schemeId) }}</button>
                  <span v-else class="muted">未关联方案</span>
                </td>
                <td><b>{{ task.keyword }}</b></td>
                <td><span class="prd-pill" :class="taskTone(task.status) && `prd-pill--${taskTone(task.status)}`"><Loader2 v-if="task.status === 'running'" :size="11" class="prd-spin" />{{ TASK_STATUS_LABEL[task.status] }}</span></td>
                <td><div class="prd-progress"><div class="prd-progress__bar"><div class="prd-progress__fill" :class="{ 'prd-progress__fill--fail': task.status === 'failed' }" :style="{ width: `${taskProgress(task)}%` }" /></div><span>{{ taskProgress(task) }}%</span></div></td>
                <td class="num">{{ task.targetCount }} / <b>{{ task.collectedCount }}</b></td>
                <td>{{ task.sort === 'sales' ? '销量排序' : '综合排序' }}</td>
                <td class="nowrap">{{ (task.deviceId && deviceNameMap.get(task.deviceId)) || '-' }}</td>
                <td class="nowrap muted">{{ formatDate(task.createdAt) }}</td>
                <td class="nowrap">{{ task.startedAt ? formatDuration((task.completedAt || Date.now()) - task.startedAt) : '-' }}</td>
                <td><span v-if="task.error" class="prd-num-red pr-err" :title="task.error">{{ task.error }}</span><span v-else class="muted">-</span></td>
                <td>
                  <div class="pr-actions">
                    <button v-if="task.status === 'queued' || task.status === 'running'" class="prd-btn prd-btn--xs prd-btn--danger" @click="cancelTask(task)">取消</button>
                    <button v-if="task.status === 'failed' || task.status === 'cancelled'" class="prd-btn prd-btn--xs" @click="retryTask(task)"><RefreshCw :size="11" />重试</button>
                    <button v-if="task.status !== 'queued' && task.status !== 'running'" class="prd-icon-btn prd-icon-btn--danger" title="删除任务及其采集结果" @click="removeTask(task)"><Trash2 :size="14" /></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pr-pager-wrap"><PrPager v-model:page="taskPage" v-model:page-size="taskPageSize" :total="filteredTasks.length" unit="个任务" /></div>
      </section>
    </template>

    <!-- ===== 数据分析 ===== -->
    <template v-else>
      <div class="prd-stats">
        <div class="prd-stat"><span class="prd-stat__icon"><List :size="17" /></span><div><div class="prd-stat__label">选品方案</div><div class="prd-stat__value">{{ analytics.total }}<small>个</small></div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Play :size="17" /></span><div><div class="prd-stat__label">进行中 / 已完成</div><div class="prd-stat__value">{{ analytics.active }}<small>/ {{ analytics.completed }}</small></div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Search :size="17" /></span><div><div class="prd-stat__label">搜索词</div><div class="prd-stat__value">{{ formatNumber(analytics.keywords) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Package :size="17" /></span><div><div class="prd-stat__label">已采集商品</div><div class="prd-stat__value">{{ formatNumber(analytics.collected) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><CheckCircle2 :size="17" /></span><div><div class="prd-stat__label">候选 / 保留</div><div class="prd-stat__value">{{ formatNumber(analytics.candidates) }}<small>/ {{ formatNumber(analytics.kept) }}</small></div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><TrendingUp :size="17" /></span><div><div class="prd-stat__label">爆款商品</div><div class="prd-stat__value prd-num-green">{{ analytics.winners }}</div></div></div>
      </div>

      <div class="pr-analytics-grid">
        <section class="prd-card">
          <div class="prd-card__head"><div class="prd-card__title"><BarChart3 :size="16" />选品转化漏斗<small>全部方案汇总</small></div><Loader2 v-if="analyticsLoading" :size="15" class="prd-spin" /></div>
          <div class="pr-funnel">
            <div v-for="(step, index) in funnel" :key="step.label" class="pr-funnel__row">
              <span class="pr-funnel__label">{{ step.label }}</span>
              <div class="pr-funnel__track"><div class="pr-funnel__bar" :style="{ width: `${step.width}%`, opacity: 1 - index * 0.13 }" /></div>
              <b>{{ formatNumber(step.value) }}</b>
              <small>{{ index === 0 ? '100%' : `${ratio(step.value, funnel[0].value).toFixed(1)}%` }}</small>
            </div>
          </div>
        </section>
        <section class="prd-card">
          <div class="prd-card__head"><div class="prd-card__title"><List :size="16" />方案阶段分布</div></div>
          <div class="pr-funnel">
            <div v-for="(step, index) in SOP_STEPS" :key="step.name" class="pr-funnel__row">
              <span class="pr-funnel__label"><span class="prd-stage"><b>{{ index + 1 }}</b>{{ step.name }}</span></span>
              <div class="pr-funnel__track"><div class="pr-funnel__bar pr-funnel__bar--blue" :style="{ width: `${Math.max(3, (analytics.stageCounts[index] / analytics.maxStage) * 100)}%` }" /></div>
              <b>{{ analytics.stageCounts[index] }}</b><small>个方案</small>
            </div>
          </div>
        </section>
      </div>

      <section class="prd-card prd-card--flush pr-table-card">
        <div class="prd-card__head"><div class="prd-card__title"><TrendingUp :size="16" />方案效果对比</div></div>
        <div class="pr-table-scroll">
          <table class="prd-table pr-table">
            <thead>
              <tr><th>方案名称</th><th>市场</th><th>当前阶段</th><th class="num">已采集</th><th class="num">候选</th><th class="num">保留</th><th class="num">测试商品</th><th class="num">爆款</th><th class="num">测试成交额</th><th class="num">采集→候选</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-if="!analytics.rows.length"><td colspan="11" class="prd-empty-cell">暂无方案数据</td></tr>
              <tr v-for="row in analytics.rows" :key="row.scheme.id">
                <td><b>{{ row.scheme.name }}</b></td>
                <td class="nowrap">{{ marketOf(row.scheme.market).flag }} {{ marketOf(row.scheme.market).label }}</td>
                <td><span class="prd-stage"><b>{{ row.scheme.sopStage }}</b>{{ stageLabel(row.scheme.sopStage) }}</span></td>
                <td class="num">{{ formatNumber(row.collected) }}</td>
                <td class="num">{{ formatNumber(row.candidates) }}</td>
                <td class="num">{{ formatNumber(row.kept) }}</td>
                <td class="num">{{ formatNumber(row.tested) }}</td>
                <td class="num prd-num-green">{{ row.winners }}</td>
                <td class="num">{{ formatNumber(row.revenue) }}</td>
                <td class="num">{{ ratio(row.candidates, row.collected).toFixed(1) }}%</td>
                <td><button class="prd-icon-btn" title="打开方案" @click="openScheme(row.scheme.id)"><ChevronRight :size="15" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- Dialogs -->
    <PrSchemeFormDialog :open="formOpen" :mode="formMode" :initial="formInitial" :busy="formBusy" @close="formOpen = false" @submit="submitForm" />
    <PrPairingDialog :open="pairingOpen" @close="pairingOpen = false" @paired="(name) => { notify(`${name} 已连接`, 'success'); loadSnapshot() }" />
    <PrConfirmDialog
      :open="Boolean(confirmState)"
      :title="confirmState?.title || ''"
      :message="confirmState?.message || ''"
      :confirm-text="confirmState?.confirmText"
      :busy="confirmBusy"
      @close="confirmState = null"
      @confirm="runConfirm"
    />
    <Teleport to="body">
      <div v-if="sopGuideOpen" class="prd-backdrop" @click.self="sopGuideOpen = false">
        <div class="prd-dialog prd-dialog--wide">
          <div class="prd-dialog__head">
            <div><h2>选品 SOP 流程</h2><p>每个方案独立维护数据，按 5 个阶段推进，任意阶段都可以回退调整。</p></div>
            <button class="prd-icon-btn" aria-label="关闭" @click="sopGuideOpen = false"><X :size="16" /></button>
          </div>
          <div class="prd-dialog__body">
            <ol class="pr-sop">
              <li v-for="(step, index) in SOP_STEPS" :key="step.name"><b>{{ index + 1 }}</b><div><strong>{{ step.name }}</strong><span>{{ step.hint }}</span></div></li>
            </ol>
          </div>
          <div class="prd-dialog__foot"><div class="prd-dialog__foot-actions"><button class="prd-btn prd-btn--primary" @click="sopGuideOpen = false; openCreate()"><Plus :size="15" />新建选品方案</button></div></div>
        </div>
      </div>
    </Teleport>
    <PrToast :toast="toast" />
  </div>
</template>

<style scoped>
.pr-hero { position: relative; display: flex; align-items: center; gap: 16px; padding: 18px 22px; min-height: 96px; border-radius: 12px; border: 1px solid var(--theme-border); background: linear-gradient(110deg, var(--theme-panel) 45%, color-mix(in srgb, var(--theme-accent) 16%, var(--theme-panel))); overflow: hidden; }
.pr-hero__icon { color: var(--theme-accent); flex-shrink: 0; }
.pr-hero__copy { position: relative; z-index: 1; }
.pr-hero__copy h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: .5px; }
.pr-hero__copy p { margin: 0; color: var(--theme-text-secondary); font-size: 13px; }
.pr-hero__side { position: relative; z-index: 1; margin-left: auto; margin-right: 160px; display: inline-flex; align-items: center; gap: 8px; }
.pr-hero__art { position: absolute; right: 26px; bottom: -10px; display: flex; align-items: flex-end; color: color-mix(in srgb, var(--theme-accent) 75%, transparent); pointer-events: none; }
.pr-hero__bars { display: inline-flex; align-items: flex-end; gap: 6px; margin-right: -14px; }
.pr-hero__bars i { width: 14px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--theme-accent) 22%, transparent); }
.pr-hero__bars i:nth-child(1) { height: 26px; } .pr-hero__bars i:nth-child(2) { height: 40px; } .pr-hero__bars i:nth-child(3) { height: 56px; }
.pr-hero__trend { position: absolute; right: 6px; bottom: 30px; color: var(--theme-accent); }
.pr-phone-chip { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--theme-border); background: var(--theme-panel); color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; font-family: inherit; }
.pr-phone-chip:hover { border-color: var(--theme-accent); color: var(--theme-text); }
.pr-phone-chip svg { color: var(--theme-accent); }
.pr-phone-chip__dot { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; }
.pr-phone-chip.is-online .pr-phone-chip__dot, .pr-server.is-on .pr-phone-chip__dot { background: var(--theme-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 25%, transparent); }

.pr-tabs { display: inline-flex; align-self: flex-start; gap: 4px; padding: 4px; border-radius: 11px; border: 1px solid var(--theme-border); background: var(--theme-panel); }
.pr-tab { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-width: 176px; height: 40px; padding: 0 18px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--theme-text-secondary); font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .15s; }
.pr-tab:hover { color: var(--theme-text); }
.pr-tab.is-active { background: color-mix(in srgb, var(--theme-accent) 18%, transparent); border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent); color: var(--theme-text); }
.pr-tab__badge { background: var(--theme-accent) !important; color: var(--theme-on-accent, #04120d) !important; }

.pr-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pr-toolbar .prd-input, .pr-toolbar .prd-select { height: 40px; }
.pr-toolbar > .prd-select { min-width: 150px; }
.pr-toolbar__search { flex: 1 1 280px; max-width: 440px; }
.pr-toolbar__spacer { flex: 1; }
.pr-toolbar__create { height: 40px; margin-left: auto; padding: 0 18px; }
.pr-time { position: relative; display: inline-flex; align-items: center; }
.pr-time > svg { position: absolute; left: 11px; color: var(--theme-text-muted); pointer-events: none; }
.pr-time .prd-select { padding-left: 34px; min-width: 160px; }
.pr-server { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--theme-text-secondary); }
.pr-server code { padding: 3px 7px; border-radius: 6px; background: var(--theme-panel); border: 1px solid var(--theme-border); font-size: 11px; }

.pr-batchbar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 9px; border: 1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent); background: color-mix(in srgb, var(--theme-accent) 8%, transparent); font-size: 13px; }
.pr-batchbar b { color: var(--theme-accent); }

.pr-table-card { display: flex; flex-direction: column; }
.pr-table-scroll { overflow-x: auto; }
.pr-table th { background: transparent; border-bottom-color: var(--theme-divider); }
.pr-table td { padding-top: 11px; padding-bottom: 11px; }
.pr-pager-wrap { padding: 4px 16px 12px; border-top: 1px solid var(--theme-divider); }
.pr-name { display: inline-flex; align-items: center; gap: 4px; max-width: 240px; }
.pr-name__text { border: 0; background: none; padding: 0; color: var(--theme-text); font-weight: 700; font-size: 13px; cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: inherit; }
.pr-name__text:hover { color: var(--theme-accent); }
.pr-name__star { width: 24px; height: 24px; }
.pr-need { display: block; max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--theme-text-secondary); font-size: 12px; }
.pr-actions { display: inline-flex; align-items: center; gap: 4px; }
.pr-err { display: inline-block; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }

.pr-empty { border: 1px dashed color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border)); border-radius: 12px; margin: 14px; padding: 36px 16px; }
.pr-empty__art { width: 84px; height: 84px; border-radius: 22px; display: inline-flex; align-items: center; justify-content: center; color: var(--theme-accent); background: radial-gradient(circle, color-mix(in srgb, var(--theme-accent) 22%, transparent), transparent 70%); }
.pr-empty__link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--theme-text-secondary); margin-top: 4px; }

.pr-analytics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.pr-funnel { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
.pr-funnel__row { display: grid; grid-template-columns: 120px minmax(0, 1fr) 64px 56px; align-items: center; gap: 10px; }
.pr-funnel__label { font-size: 12px; color: var(--theme-text-secondary); }
.pr-funnel__track { height: 12px; border-radius: 999px; background: var(--theme-panel-soft); overflow: hidden; }
.pr-funnel__bar { height: 100%; border-radius: inherit; background: var(--theme-accent); transition: width .4s; }
.pr-funnel__bar--blue { background: #60a5fa; }
.pr-funnel__row b { text-align: right; font-variant-numeric: tabular-nums; }
.pr-funnel__row small { color: var(--theme-text-muted); font-size: 11px; }

.pr-sop { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.pr-sop li { display: flex; gap: 10px; align-items: center; padding: 12px; border-radius: 10px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.pr-sop li > b { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--theme-accent); color: var(--theme-on-accent, #04120d); flex-shrink: 0; }
.pr-sop li div { display: flex; flex-direction: column; gap: 2px; }
.pr-sop li span { font-size: 11px; color: var(--theme-text-muted); }

@media (max-width: 1100px) {
  .pr-hero__side { margin-right: 0; }
  .pr-hero__art { display: none; }
  .pr-analytics-grid { grid-template-columns: 1fr; }
  .pr-sop { grid-template-columns: 1fr; }
  .pr-tab { min-width: 0; }
}
</style>
