<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import {
  AlertCircle, ArrowRight, Battery, CheckCircle2, ChevronDown, CircleDot, Clock3, Copy, Download, ExternalLink, Filter, Info,
  Layers, ListChecks, Loader2, Package, Pencil, Play, Plus, RefreshCw, Search, Settings2, Smartphone, Trash2, Upload, XCircle,
} from 'lucide-vue-next'
import type { ProductResearchTask } from '../../../../../shared/productResearch'
import { translateError, useSchemeWorkspace } from './useSchemeWorkspace'
import PrPager from './PrPager.vue'
import PrThumb from './PrThumb.vue'
import PrPairingDialog from './PrPairingDialog.vue'
import PrConfirmDialog from './PrConfirmDialog.vue'
import {
  KEYWORD_STATUS_LABEL, TASK_STATUS_LABEL, downloadCsv, formatDate, formatDuration, formatNumber, marketOf, pickFile,
  platformLabel, ratingOf, readKeywordFile, safeFileName, schemeStatusLabel, shortSku, splitKeywords,
} from './productResearchUtils'

const ws = useSchemeWorkspace()
const { scheme, keywords, tasks, results, devices, endpoint, serverRunning, connectedDevices, activeTasks, failedTasks } = ws

// ===== Keywords =====
const selectedKw = ref<string[]>([])
const addingKw = ref(false)
const newKw = ref('')
const editingKw = ref('')
const editingKwValue = ref('')
const addInput = ref<HTMLInputElement | null>(null)
let selectionSeeded = false

watch(keywords, (list) => {
  const ids = new Set(list.map((item) => item.id))
  selectedKw.value = selectedKw.value.filter((id) => ids.has(id))
  if (!selectionSeeded && list.length) {
    selectionSeeded = true
    selectedKw.value = list.filter((item) => item.status !== 'collected').map((item) => item.id)
  }
}, { immediate: true, deep: true })

const kwAllSelected = computed(() => keywords.value.length > 0 && selectedKw.value.length === keywords.value.length)

function toggleAllKw() {
  selectedKw.value = kwAllSelected.value ? [] : keywords.value.map((item) => item.id)
}

async function openAdd() {
  addingKw.value = true
  await nextTick()
  addInput.value?.focus()
}

function submitAdd() {
  const values = splitKeywords(newKw.value)
  if (!values.length) return
  const before = new Set(keywords.value.map((item) => item.id))
  const added = ws.addKeywords(values)
  selectedKw.value.push(...keywords.value.filter((item) => !before.has(item.id)).map((item) => item.id))
  newKw.value = ''
  if (added < values.length) ws.notify(`已添加 ${added} 个，${values.length - added} 个重复已忽略`)
}

async function importKw() {
  const file = await pickFile('.txt,.csv,.xlsx,.xls')
  if (!file) return
  try {
    const values = await readKeywordFile(file)
    const before = new Set(keywords.value.map((item) => item.id))
    const added = ws.addKeywords(values)
    selectedKw.value.push(...keywords.value.filter((item) => !before.has(item.id)).map((item) => item.id))
    ws.notify(`从 ${file.name} 导入 ${added} 个搜索词${values.length > added ? `（${values.length - added} 个重复已忽略）` : ''}`, added ? 'success' : 'info')
  } catch (error) {
    ws.notify(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function startEditKw(id: string, value: string) {
  editingKw.value = id
  editingKwValue.value = value
}

function commitEditKw() {
  if (editingKw.value && ws.renameKeyword(editingKw.value, editingKwValue.value)) editingKw.value = ''
}

const confirmDeleteKw = ref(false)
function deleteSelectedKw() {
  ws.removeKeywords(selectedKw.value)
  selectedKw.value = []
  confirmDeleteKw.value = false
}

function kwTone(status: string) {
  return status === 'collected' ? 'green' : status === 'running' ? 'blue' : status === 'failed' ? 'red' : ''
}

// ===== Collection settings =====
const settings = reactive({ sort: 'sales' as 'sales' | 'comprehensive', targetCount: 100, mode: 'batch' as 'batch' | 'supplement' })
const starting = ref(false)
const pairingOpen = ref(false)

const collectTargets = computed(() => {
  const chosen = keywords.value.filter((item) => selectedKw.value.includes(item.id))
  if (settings.mode === 'supplement') return chosen.filter((item) => item.status === 'collected' && ws.collectedFor(item.value) < settings.targetCount)
  return chosen.filter((item) => item.status !== 'running' && item.status !== 'collected')
})

const collectBlocker = computed(() => {
  if (!keywords.value.length) return '请先添加搜索词'
  if (!selectedKw.value.length) return '请勾选要采集的搜索词'
  if (!devices.value.length) return '还没有连接过采集手机'
  if (!collectTargets.value.length) return settings.mode === 'supplement' ? '所选搜索词无需补采' : '所选搜索词已采集或采集中'
  return ''
})

async function startCollect() {
  if (collectBlocker.value) {
    ws.notify(collectBlocker.value, 'error')
    if (!devices.value.length) pairingOpen.value = true
    return
  }
  starting.value = true
  settings.targetCount = Math.min(1000, Math.max(1, Math.round(settings.targetCount || 100)))
  await ws.startCollection({
    keywordIds: collectTargets.value.map((item) => item.id),
    sort: settings.sort,
    targetCount: settings.targetCount,
    supplementOnly: settings.mode === 'supplement',
  })
  starting.value = false
}

// ===== Devices =====
const deviceMenu = ref('')
function copyText(text: string, label = '已复制') {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => ws.notify(label, 'success')).catch(() => {})
}

// ===== Tasks =====
function taskTone(status: string) {
  return status === 'completed' ? 'green' : status === 'running' ? 'blue' : status === 'failed' ? 'red' : status === 'queued' ? 'amber' : ''
}
function progress(task: ProductResearchTask) {
  return task.targetCount ? Math.min(100, Math.round((task.collectedCount / task.targetCount) * 100)) : 0
}
const taskPage = ref(1)
const taskPageSize = ref(10)
const pagedTasks = computed(() => tasks.value.slice((taskPage.value - 1) * taskPageSize.value, taskPage.value * taskPageSize.value))

// ===== Results =====
const resultQuery = ref('')
const filterOpen = ref(false)
const resultFilter = reactive({ keyword: '', min: '', max: '' })
const resultPage = ref(1)
const resultPageSize = ref(10)
const selectedResults = ref<string[]>([])
const batchMenu = ref(false)
const confirmDeleteResults = ref(false)

const filteredResults = computed(() => {
  const q = resultQuery.value.trim().toLowerCase()
  const min = Number(resultFilter.min) || 0
  const max = Number(resultFilter.max) || 0
  return results.value.filter((item) => {
    if (q && !`${item.title} ${item.id} ${item.productId || ''} ${item.shopName}`.toLowerCase().includes(q)) return false
    if (resultFilter.keyword && item.keyword !== resultFilter.keyword) return false
    if (min && (item.priceValue || 0) < min) return false
    if (max && (item.priceValue || 0) > max) return false
    return true
  })
})
const pagedResults = computed(() => filteredResults.value.slice((resultPage.value - 1) * resultPageSize.value, resultPage.value * resultPageSize.value))
const pageAllSelected = computed(() => pagedResults.value.length > 0 && pagedResults.value.every((item) => selectedResults.value.includes(item.id)))
const activeFilterCount = computed(() => [resultFilter.keyword, resultFilter.min, resultFilter.max].filter(Boolean).length)

watch([resultQuery, resultFilter], () => { resultPage.value = 1 })
watch(results, (list) => {
  const ids = new Set(list.map((item) => item.id))
  selectedResults.value = selectedResults.value.filter((id) => ids.has(id))
})

function togglePageResults() {
  const ids = pagedResults.value.map((item) => item.id)
  selectedResults.value = pageAllSelected.value ? selectedResults.value.filter((id) => !ids.includes(id)) : [...new Set([...selectedResults.value, ...ids])]
}

function addSelectedToCandidates() {
  batchMenu.value = false
  const added = ws.addCandidates(selectedResults.value)
  ws.notify(`已加入候选 ${added} 个商品`, 'success')
}

async function deleteSelectedResults() {
  confirmDeleteResults.value = false
  batchMenu.value = false
  await ws.removeResults(selectedResults.value)
  selectedResults.value = []
}

function exportResults(onlySelected = false) {
  batchMenu.value = false
  const list = onlySelected ? results.value.filter((item) => selectedResults.value.includes(item.id)) : filteredResults.value
  if (!list.length) { ws.notify('没有可导出的商品'); return }
  downloadCsv(`${safeFileName(scheme.value?.name || '选品')}_采集结果`, ['序号', '商品名称', '搜索词', '店铺', '价格', '价格数值', '销量', '销量数值', '评分', '排名', '商品链接', '采集时间'],
    list.map((item, index) => [index + 1, item.title, item.keyword, item.shopName, item.priceText, item.priceValue ?? '', item.salesText, item.salesValue ?? '', ratingOf(item) ?? '', item.rank, item.productUrl || '', formatDate(item.capturedAt)]))
}

function openLink(url?: string) {
  if (!url) return
  void window.api.shell.openExternal(url)
}

// ===== Footer =====
const lastError = computed(() => failedTasks.value[0]?.error || '')
const canNext = computed(() => results.value.length > 0)
const market = computed(() => marketOf(scheme.value?.market))
</script>

<template>
  <div class="sc">
    <div class="sc-row sc-row--top">
      <!-- 方案摘要 -->
      <section class="prd-card">
        <div class="prd-card__head"><div class="prd-card__title"><Layers :size="17" />方案摘要</div></div>
        <dl class="sc-summary">
          <dt>方案名称</dt><dd>{{ scheme?.name }}<button class="prd-icon-btn sc-inline-btn" title="复制方案名称" @click="copyText(scheme?.name || '')"><Copy :size="12" /></button></dd>
          <dt>客户需求</dt><dd class="sc-summary__need" :title="scheme?.need">{{ scheme?.need || '-' }}</dd>
          <dt>目标市场</dt><dd>{{ market.flag }} {{ market.label }}（TikTok Shop）</dd>
          <dt>创建时间</dt><dd>{{ formatDate(scheme?.createdAt) }}</dd>
          <dt>方案状态</dt><dd><span class="prd-pill prd-pill--green">{{ schemeStatusLabel(scheme?.status) }}</span></dd>
        </dl>
        <div class="sc-summary__stats">
          <span>搜索词 <b>{{ keywords.length }}</b></span>
          <span>已采集 <b>{{ formatNumber(results.length) }}</b></span>
          <span>候选 <b>{{ ws.candidateIds.value.length }}</b></span>
        </div>
      </section>

      <!-- 手机连接状态 -->
      <section class="prd-card">
        <div class="prd-card__head"><div class="prd-card__title"><Smartphone :size="17" />手机连接状态</div></div>
        <div class="sc-phone">
          <div class="sc-phone__status" :class="{ 'is-on': serverRunning }">
            <CheckCircle2 v-if="serverRunning" :size="26" /><AlertCircle v-else :size="26" />
            <div><b>{{ serverRunning ? '运行中' : '未运行' }}</b><small>在线设备：{{ connectedDevices.length }} 台</small></div>
          </div>
          <div class="sc-phone__endpoint">
            <small>服务地址</small>
            <div class="sc-copy-field"><span>{{ endpoint || '服务启动中…' }}</span><button class="prd-icon-btn" title="复制服务地址" :disabled="!endpoint" @click="copyText(endpoint, '服务地址已复制')"><Copy :size="13" /></button></div>
          </div>
          <div class="sc-phone__actions">
            <button class="prd-btn prd-btn--primary" @click="pairingOpen = true"><Smartphone :size="15" />连接手机</button>
            <button class="prd-btn prd-btn--outline" @click="ws.refreshSnapshot(false)"><RefreshCw :size="14" />刷新状态</button>
          </div>
        </div>
        <div class="prd-table-wrap sc-devices">
          <table class="prd-table prd-table--compact">
            <thead><tr><th>设备名称</th><th>设备型号</th><th>连接状态</th><th>电量</th><th>最近在线</th><th class="center">操作</th></tr></thead>
            <tbody>
              <tr v-if="!devices.length"><td colspan="6" class="prd-empty-cell">暂无已配对设备，点击「连接手机」扫码配对</td></tr>
              <tr v-for="device in devices" :key="device.id">
                <td><span class="sc-device"><Smartphone :size="15" />{{ device.name }}</span></td>
                <td class="muted">{{ device.model || device.id.slice(0, 12) }}</td>
                <td><span class="prd-pill" :class="device.connected ? 'prd-pill--green' : ''">{{ device.connected ? '在线' : '离线' }}</span></td>
                <td><span v-if="device.batteryLevel !== undefined" class="sc-battery"><Battery :size="15" />{{ device.batteryLevel }}%</span><span v-else class="muted">-</span></td>
                <td class="muted nowrap">{{ formatDate(device.lastSeenAt) }}</td>
                <td class="center">
                  <div class="prd-menu-wrap">
                    <button class="prd-icon-btn" title="更多" @click="deviceMenu = deviceMenu === device.id ? '' : device.id"><ChevronDown :size="14" /></button>
                    <div v-if="deviceMenu === device.id" class="prd-menu" @click="deviceMenu = ''">
                      <button @click="copyText(device.id, '设备 ID 已复制')"><Copy :size="13" />复制设备 ID</button>
                      <button @click="pairingOpen = true"><RefreshCw :size="13" />重新配对</button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="sc-row sc-row--mid">
      <!-- 搜索词列表 -->
      <section class="prd-card">
        <div class="prd-card__head">
          <div class="prd-card__title"><Search :size="17" />搜索词列表<small>（共 {{ keywords.length }} 个）</small></div>
          <div class="prd-card__actions">
            <button class="prd-btn prd-btn--sm" @click="openAdd"><Plus :size="13" />新增</button>
            <button class="prd-btn prd-btn--sm" @click="importKw"><Upload :size="13" />导入（TXT/CSV/Excel）</button>
            <button class="prd-btn prd-btn--sm prd-btn--danger" :disabled="!selectedKw.length" @click="confirmDeleteKw = true"><Trash2 :size="13" />删除</button>
          </div>
        </div>
        <div v-if="addingKw" class="sc-kw-add">
          <input ref="addInput" v-model="newKw" class="prd-input prd-input--sm" placeholder="输入搜索词，多个用逗号分隔，回车添加" @keyup.enter="submitAdd" @keyup.esc="addingKw = false" />
          <button class="prd-btn prd-btn--sm prd-btn--primary" :disabled="!newKw.trim()" @click="submitAdd">添加</button>
          <button class="prd-btn prd-btn--sm prd-btn--ghost" @click="addingKw = false; newKw = ''">取消</button>
        </div>
        <div class="prd-table-wrap sc-kw-table">
          <table class="prd-table prd-table--compact">
            <thead><tr><th class="chk"><input type="checkbox" :checked="kwAllSelected" aria-label="全选搜索词" @change="toggleAllKw" /></th><th>#</th><th>搜索词</th><th class="num">已采集</th><th>状态</th><th class="center">操作</th></tr></thead>
            <tbody>
              <tr v-if="!keywords.length"><td colspan="6" class="prd-empty-cell">暂无搜索词，点击「新增」或「导入」添加</td></tr>
              <tr v-for="(kw, index) in keywords" :key="kw.id" :class="{ 'is-selected': selectedKw.includes(kw.id) }">
                <td class="chk"><input v-model="selectedKw" type="checkbox" :value="kw.id" /></td>
                <td class="muted">{{ index + 1 }}</td>
                <td>
                  <input v-if="editingKw === kw.id" v-model="editingKwValue" class="prd-input prd-input--sm" @keyup.enter="commitEditKw" @keyup.esc="editingKw = ''" @blur="commitEditKw" />
                  <span v-else>{{ kw.value }}</span>
                </td>
                <td class="num">{{ ws.collectedFor(kw.value) }}</td>
                <td>
                  <span class="prd-pill" :class="kwTone(kw.status) && `prd-pill--${kwTone(kw.status)}`">
                    <Loader2 v-if="kw.status === 'running'" :size="11" class="prd-spin" /><CheckCircle2 v-else-if="kw.status === 'collected'" :size="11" /><XCircle v-else-if="kw.status === 'failed'" :size="11" /><CircleDot v-else :size="11" />
                    {{ KEYWORD_STATUS_LABEL[kw.status] }}
                  </span>
                </td>
                <td class="center nowrap">
                  <button class="prd-icon-btn" title="编辑" :disabled="kw.status === 'running'" @click="startEditKw(kw.id, kw.value)"><Pencil :size="13" /></button>
                  <button class="prd-icon-btn prd-icon-btn--danger" title="删除" :disabled="kw.status === 'running'" @click="ws.removeKeywords([kw.id])"><Trash2 :size="13" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="sc-kw-foot">
          <label><input type="checkbox" :checked="kwAllSelected" @change="toggleAllKw" /> 全选（{{ selectedKw.length }}/{{ keywords.length }}）</label>
          <button class="prd-link prd-link--muted" :disabled="!selectedKw.length" @click="selectedKw = []">清空已选</button>
        </div>
      </section>

      <!-- 采集设置 -->
      <section class="prd-card sc-settings">
        <div class="prd-card__head"><div class="prd-card__title"><Settings2 :size="17" />采集设置</div></div>
        <div class="sc-settings__grid">
          <div class="sc-settings__fields">
            <label class="sc-field"><span>排序方式</span>
              <select v-model="settings.sort" class="prd-select"><option value="sales">销量排序</option><option value="comprehensive">综合排序</option></select>
            </label>
            <label class="sc-field"><span>每个搜索词目标采集数量</span>
              <input v-model.number="settings.targetCount" type="number" min="1" max="1000" class="prd-input sc-num" />
            </label>
            <div class="sc-switches">
              <label class="prd-switch" :class="{ 'prd-switch--on': settings.mode === 'batch' }" @click.prevent="settings.mode = 'batch'">
                <span class="prd-switch__track" />批量采集<small>（依次采集选中的搜索词）</small>
              </label>
              <label class="prd-switch" :class="{ 'prd-switch--on': settings.mode === 'supplement' }" @click.prevent="settings.mode = settings.mode === 'supplement' ? 'batch' : 'supplement'">
                <span class="prd-switch__track" />单个补采<small>（仅针对已采集且数量不足的搜索词）</small>
              </label>
            </div>
          </div>
          <div class="sc-settings__go">
            <button class="prd-btn prd-btn--primary prd-btn--lg sc-start" :disabled="starting" @click="startCollect">
              <Loader2 v-if="starting" :size="18" class="prd-spin" /><Play v-else :size="18" fill="currentColor" />开始采集
            </button>
            <span class="sc-settings__hint" :class="{ 'is-warn': collectBlocker }">
              <Info :size="12" />{{ collectBlocker || `将采集 ${collectTargets.length} 个搜索词，每词 ${settings.targetCount} 个商品` }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- 采集任务记录 -->
    <section class="prd-card">
      <div class="prd-card__head"><div class="prd-card__title"><ListChecks :size="17" />采集任务记录<small>（当前方案）</small></div></div>
      <div class="prd-table-wrap">
        <table class="prd-table prd-table--compact">
          <thead><tr><th>#</th><th>搜索词</th><th>状态</th><th>进度</th><th class="num">目标数量</th><th class="num">已采集</th><th>开始时间</th><th>耗时</th><th>失败原因</th><th class="center">操作</th></tr></thead>
          <tbody>
            <tr v-if="!tasks.length"><td colspan="10" class="prd-empty-cell">暂无采集任务，勾选搜索词后点击「开始采集」</td></tr>
            <tr v-for="(task, index) in pagedTasks" :key="task.id">
              <td class="muted">{{ (taskPage - 1) * taskPageSize + index + 1 }}</td>
              <td><b>{{ task.keyword }}</b></td>
              <td>
                <span class="prd-pill" :class="taskTone(task.status) && `prd-pill--${taskTone(task.status)}`">
                  <Loader2 v-if="task.status === 'running'" :size="11" class="prd-spin" /><Clock3 v-else-if="task.status === 'queued'" :size="11" /><CheckCircle2 v-else-if="task.status === 'completed'" :size="11" /><XCircle v-else-if="task.status === 'failed'" :size="11" />
                  {{ TASK_STATUS_LABEL[task.status] }}
                </span>
              </td>
              <td><div class="prd-progress"><div class="prd-progress__bar"><div class="prd-progress__fill" :class="{ 'prd-progress__fill--fail': task.status === 'failed' }" :style="{ width: `${progress(task)}%` }" /></div><span>{{ progress(task) }}%</span></div></td>
              <td class="num">{{ task.targetCount }}</td>
              <td class="num">{{ task.collectedCount }}</td>
              <td class="nowrap muted">{{ formatDate(task.startedAt || task.dispatchedAt) }}</td>
              <td class="nowrap">{{ task.startedAt ? formatDuration((task.completedAt || Date.now()) - task.startedAt) : '-' }}</td>
              <td><span v-if="task.error" class="prd-num-red sc-err" :title="task.error">{{ translateError(task.error) }}</span><span v-else class="muted">-</span></td>
              <td class="center nowrap">
                <button v-if="task.collectedCount > 0" class="prd-btn prd-btn--xs" @click="resultFilter.keyword = task.keyword; filterOpen = true">查看结果</button>
                <button v-if="task.status === 'queued' || task.status === 'running'" class="prd-btn prd-btn--xs prd-btn--danger" @click="ws.cancelTask(task.id)">取消</button>
                <button v-if="task.status === 'failed' || task.status === 'cancelled'" class="prd-btn prd-btn--xs" @click="ws.retryTask(task)"><RefreshCw :size="11" />重试</button>
                <button v-if="task.status !== 'queued' && task.status !== 'running'" class="prd-icon-btn prd-icon-btn--danger" title="删除任务（含采集结果）" @click="ws.removeTask(task.id)"><Trash2 :size="13" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PrPager v-if="tasks.length > taskPageSize" v-model:page="taskPage" v-model:page-size="taskPageSize" :total="tasks.length" unit="个任务" :page-sizes="[10, 20, 50]" />
    </section>

    <!-- 采集商品结果 -->
    <section class="prd-card">
      <div class="prd-card__head">
        <div class="prd-card__title"><Package :size="17" />采集商品结果<small>（共 {{ formatNumber(filteredResults.length) }} 条）</small></div>
        <div class="prd-card__actions">
          <div class="prd-search"><Search :size="14" /><input v-model="resultQuery" class="prd-input prd-input--sm sc-search" placeholder="搜索商品名称或ID" /></div>
          <button class="prd-btn prd-btn--sm" :class="{ 'prd-btn--soft': filterOpen || activeFilterCount }" @click="filterOpen = !filterOpen"><Filter :size="13" />筛选<template v-if="activeFilterCount">（{{ activeFilterCount }}）</template></button>
          <button class="prd-btn prd-btn--sm" @click="exportResults()"><Download :size="13" />导出</button>
        </div>
      </div>
      <div v-if="filterOpen" class="sc-filter">
        <label>来源搜索词
          <select v-model="resultFilter.keyword" class="prd-select prd-select--sm"><option value="">全部</option><option v-for="kw in keywords" :key="kw.id" :value="kw.value">{{ kw.value }}</option></select>
        </label>
        <label>价格（{{ market.currency || '本币' }}）
          <input v-model="resultFilter.min" type="number" class="prd-input prd-input--sm sc-price" placeholder="最低" />—<input v-model="resultFilter.max" type="number" class="prd-input prd-input--sm sc-price" placeholder="最高" />
        </label>
        <button class="prd-link" @click="Object.assign(resultFilter, { keyword: '', min: '', max: '' })">清除筛选</button>
      </div>
      <div class="prd-table-wrap">
        <table class="prd-table">
          <thead>
            <tr>
              <th class="chk"><input type="checkbox" :checked="pageAllSelected" aria-label="全选本页" @change="togglePageResults" /></th>
              <th>#</th><th>商品信息</th><th>平台</th><th class="num">价格（{{ market.currency || '-' }}）</th><th class="num">销量</th><th>评价</th><th class="center">商品链接</th><th>采集时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!pagedResults.length"><td colspan="9" class="prd-empty-cell">{{ results.length ? '没有符合条件的商品' : '暂无采集数据，请设置搜索词并开始采集' }}</td></tr>
            <tr v-for="(item, index) in pagedResults" :key="item.id" :class="{ 'is-selected': selectedResults.includes(item.id) }">
              <td class="chk"><input v-model="selectedResults" type="checkbox" :value="item.id" /></td>
              <td class="muted">{{ (resultPage - 1) * resultPageSize + index + 1 }}</td>
              <td>
                <div class="prd-product">
                  <PrThumb :result="item" />
                  <div class="prd-product__meta">
                    <span class="prd-product__name" :title="item.title">{{ item.title }}</span>
                    <span class="prd-product__sub">{{ item.keyword }} | SKU: {{ shortSku(item) }}<template v-if="item.shopName"> | {{ item.shopName }}</template></span>
                  </div>
                </div>
              </td>
              <td class="nowrap"><span class="sc-platform">♪</span>{{ platformLabel(scheme?.market) }}</td>
              <td class="num">{{ item.priceValue !== undefined ? formatNumber(item.priceValue) : item.priceText || '-' }}</td>
              <td class="num prd-num-green">{{ item.salesValue !== undefined ? formatNumber(item.salesValue) : item.salesText || '-' }}</td>
              <td class="nowrap"><template v-if="ratingOf(item) !== undefined"><span class="prd-star">★</span> {{ ratingOf(item)!.toFixed(1) }}</template><span v-else class="muted">-</span></td>
              <td class="center">
                <button v-if="item.productUrl" class="prd-icon-btn" title="打开商品链接" @click="openLink(item.productUrl)"><ExternalLink :size="14" /></button>
                <button v-else class="prd-icon-btn" title="复制商品名称" @click="copyText(item.title, '商品名称已复制')"><Copy :size="14" /></button>
              </td>
              <td class="nowrap muted">{{ formatDate(item.capturedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PrPager v-model:page="resultPage" v-model:page-size="resultPageSize" :total="filteredResults.length">
        <template #left>
          <span>已选择 <b class="prd-num-green">{{ selectedResults.length }}</b> 个商品</span>
          <div class="prd-menu-wrap">
            <button class="prd-btn prd-btn--sm" :disabled="!selectedResults.length" @click="batchMenu = !batchMenu">批量操作<ChevronDown :size="13" /></button>
            <div v-if="batchMenu" class="prd-menu prd-menu--up prd-menu--left">
              <button @click="addSelectedToCandidates"><Plus :size="13" />加入候选</button>
              <button @click="exportResults(true)"><Download :size="13" />导出选中</button>
              <button class="danger" @click="batchMenu = false; confirmDeleteResults = true"><Trash2 :size="13" />删除选中</button>
            </div>
          </div>
        </template>
      </PrPager>
    </section>

    <!-- Footer -->
    <footer class="prd-footer">
      <div class="prd-footer__left">
        <div v-if="activeTasks.length" class="prd-status-box prd-status-box--running"><Loader2 :size="18" class="prd-spin" /><div><b>采集中…（{{ tasks.length - activeTasks.length }}/{{ tasks.length }}）</b><small>完成后自动刷新结果</small></div></div>
        <div v-else-if="!results.length" class="prd-status-box"><AlertCircle :size="18" /><div><b>暂无采集数据</b><small>请先设置搜索词并开始采集</small></div></div>
        <div v-else class="prd-status-box prd-status-box--running"><CheckCircle2 :size="18" /><div><b>已采集 {{ formatNumber(results.length) }} 个商品</b><small>可进入下一步分析商品</small></div></div>
        <div v-if="lastError" class="prd-status-box prd-status-box--error"><XCircle :size="18" /><div><b>采集失败：{{ lastError }}</b><small>请检查手机网络与服务地址</small></div></div>
      </div>
      <div class="prd-footer__right">
        <span v-if="!canNext" class="prd-footer__hint">未满足条件：请先完成商品采集<br />（至少采集 1 个商品）</span>
        <button class="prd-btn prd-btn--primary prd-btn--lg" :disabled="!canNext" @click="ws.goStep(2)">下一步：分析商品<ArrowRight :size="17" /></button>
      </div>
    </footer>

    <PrPairingDialog :open="pairingOpen" @close="pairingOpen = false" @paired="(name) => { ws.notify(`${name} 已连接`, 'success'); ws.refreshSnapshot() }" />
    <PrConfirmDialog :open="confirmDeleteKw" title="删除搜索词" :message="`确定删除选中的 ${selectedKw.length} 个搜索词吗？已采集的商品会保留。`" confirm-text="删除" @close="confirmDeleteKw = false" @confirm="deleteSelectedKw" />
    <PrConfirmDialog :open="confirmDeleteResults" title="删除采集商品" :message="`确定删除选中的 ${selectedResults.length} 个商品吗？对应的候选与编辑信息也会一并移除。`" confirm-text="删除" @close="confirmDeleteResults = false" @confirm="deleteSelectedResults" />
  </div>
</template>

<style scoped>
.sc { display: flex; flex-direction: column; gap: 12px; }
.sc-row { display: grid; gap: 12px; }
.sc-row--top { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); }
.sc-row--mid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); }
.sc-summary { display: grid; grid-template-columns: 82px minmax(0, 1fr); margin: 0; border: 1px solid var(--theme-border); border-radius: 8px; overflow: hidden; }
.sc-summary dt, .sc-summary dd { margin: 0; padding: 7px 12px; border-bottom: 1px solid var(--theme-divider); font-size: 12px; display: flex; align-items: center; gap: 6px; min-width: 0; }
.sc-summary dt { color: var(--theme-text-muted); background: var(--theme-panel-soft); }
.sc-summary dt:nth-last-of-type(1), .sc-summary dd:last-of-type { border-bottom: 0; }
.sc-summary__need { display: block !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-inline-btn { width: 22px; height: 22px; }
.sc-summary__stats { display: flex; gap: 18px; margin-top: 10px; font-size: 12px; color: var(--theme-text-muted); }
.sc-summary__stats b { color: var(--theme-accent); font-size: 14px; margin-left: 3px; }
.sc-phone { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; margin-bottom: 10px; }
.sc-phone__status { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 10px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); color: #9ca3af; }
.sc-phone__status.is-on { color: var(--theme-accent); border-color: color-mix(in srgb, var(--theme-accent) 35%, transparent); }
.sc-phone__status b { display: block; color: var(--theme-text); font-size: 15px; }
.sc-phone__status small { color: var(--theme-text-muted); font-size: 11px; }
.sc-phone__endpoint { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sc-phone__endpoint small { font-size: 11px; color: var(--theme-text-muted); }
.sc-copy-field { display: flex; align-items: center; justify-content: space-between; gap: 6px; height: 32px; padding: 0 4px 0 10px; border-radius: 7px; background: var(--theme-input); border: 1px solid var(--theme-border); font-size: 12px; min-width: 0; }
.sc-copy-field span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-phone__actions { display: inline-flex; gap: 8px; }
.sc-devices { max-height: 150px; }
.sc-device { display: inline-flex; align-items: center; gap: 7px; }
.sc-device svg, .sc-battery svg { color: var(--theme-accent); }
.sc-battery { display: inline-flex; align-items: center; gap: 5px; }
.sc-kw-add { display: flex; gap: 8px; margin-bottom: 8px; }
.sc-kw-add .prd-input { flex: 1; }
.sc-kw-table { max-height: 236px; }
.sc-kw-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; color: var(--theme-text-secondary); }
.sc-kw-foot label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.sc-settings__grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; }
.sc-settings__fields { display: flex; flex-direction: column; gap: 14px; }
.sc-field { display: grid; grid-template-columns: 170px minmax(0, 220px); align-items: center; gap: 10px; font-size: 13px; color: var(--theme-text-secondary); }
.sc-num { width: 120px; }
.sc-switches { display: flex; flex-direction: column; gap: 12px; }
.sc-settings__go { display: flex; flex-direction: column; align-items: stretch; gap: 8px; min-width: 200px; }
.sc-start { height: 46px; font-size: 16px; }
.sc-settings__hint { display: inline-flex; align-items: flex-start; gap: 5px; font-size: 11px; color: var(--theme-text-muted); line-height: 1.4; max-width: 220px; }
.sc-settings__hint.is-warn { color: #fbbf24; }
.sc-err { display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.sc-search { width: 200px; }
.sc-filter { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 10px; border-radius: 8px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); font-size: 12px; color: var(--theme-text-secondary); }
.sc-filter label { display: inline-flex; align-items: center; gap: 8px; }
.sc-price { width: 100px; }
.sc-platform { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-right: 6px; border-radius: 5px; background: #111; color: #fff; font-size: 11px; font-weight: 800; box-shadow: -1px -1px 0 #25f4ee, 1px 1px 0 #fe2c55; }
@media (max-width: 1280px) {
  .sc-row--top, .sc-row--mid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .sc-phone, .sc-settings__grid { grid-template-columns: 1fr; }
  .sc-field { grid-template-columns: 1fr; }
}
</style>
