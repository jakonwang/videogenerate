<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, Clock3, LoaderCircle, MoreVertical, Play, Plus, Search, Trash2, Video, Wand2 } from 'lucide-vue-next'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'

type CloneProjectSummary = {
  id: string
  title: string
  description?: string
  archived?: boolean
  status: string
  runMode: 'auto' | 'manual'
  createdAt: number
  updatedAt: number
  currentStep: string
  progressPercent: number
  referenceVideoName: string
  referenceVideoPath: string
  coverAssetPath: string
  previewOutputPath: string
  previewReportPath: string
  outputDir: string
  finalOutputPath: string
  selectedModelIdentityName: string
  productReferenceImageCount: number
  shotCount: number
  generatedImageCount: number
  generatedVideoCount: number
  lastError: string
}

const router = useRouter()
const loading = ref(false)
const creating = ref(false)
const removingId = ref('')
const exporting = ref(false)
const rows = ref<CloneProjectSummary[]>([])
const query = ref('')
const selectedIds = ref<string[]>([])
const errorDialogOpen = ref(false)
const errorDialogTitle = ref('')
const errorDialogMessage = ref('')
const batchExportMessage = ref('')
const createRunMode = ref<'auto' | 'manual' | ''>('')
const statusFilter = ref<'all' | 'draft' | 'running' | 'ready_for_review' | 'completed' | 'failed'>('all')
const sortOrder = ref<'updated_desc' | 'updated_asc'>('updated_desc')
const currentPage = ref(1)
const pageSize = 12

const filteredRows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const list = rows.value.filter((item) => {
    const statusText = String(item.status || '').toLowerCase()
    if (statusFilter.value === 'draft' && statusText !== 'draft') return false
    if (statusFilter.value === 'running' && !(statusText.includes('running') || statusText.includes('generating') || statusText === 'analyzed' || statusText === 'materials_ready')) return false
    if (statusFilter.value === 'ready_for_review' && statusText !== 'ready_for_review') return false
    if (statusFilter.value === 'completed' && !(statusText.includes('done') || statusText.includes('complete') || statusText === 'completed')) return false
    if (statusFilter.value === 'failed' && !(statusText.includes('fail') || statusText.includes('error'))) return false
    if (!keyword) return true
    const haystack = [item.title, item.description, item.referenceVideoName, item.selectedModelIdentityName, item.lastError].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
  return list.sort((a, b) => {
    const delta = Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    return sortOrder.value === 'updated_desc' ? delta : -delta
  })
})

const stats = computed(() => ({
  all: rows.value.length,
  draft: rows.value.filter((item) => String(item.status || '').toLowerCase() === 'draft').length,
  running: rows.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status.includes('running') || status.includes('generating') || status === 'analyzed' || status === 'materials_ready'
  }).length,
  completed: rows.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status.includes('done') || status.includes('complete') || status === 'completed'
  }).length,
  failed: rows.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status.includes('fail') || status.includes('error')
  }).length,
}))

const statusTabs = computed(() => [
  { key: 'all' as const, label: `全部 (${stats.value.all})` },
  { key: 'draft' as const, label: `草稿 (${stats.value.draft})` },
  { key: 'running' as const, label: `进行中 (${stats.value.running})` },
  { key: 'completed' as const, label: `已完成 (${stats.value.completed})` },
  { key: 'failed' as const, label: `失败 (${stats.value.failed})` },
])

const recentRows = computed(() => rows.value.slice().sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 4))
const selectedSet = computed(() => new Set(selectedIds.value))
const selectedRows = computed(() => filteredRows.value.filter((item) => selectedSet.value.has(item.id)))
const exportableSelectedCount = computed(() => selectedRows.value.filter((item) => String(item.finalOutputPath || '').trim()).length)
const allFilteredSelected = computed(() => filteredRows.value.length > 0 && filteredRows.value.every((item) => selectedSet.value.has(item.id)))
const statusSummaryLabel = computed(() => {
  const current = statusTabs.value.find((tab) => tab.key === statusFilter.value)
  return current ? current.label.replace(/\s*\(\d+\)\s*$/, '') : '全部'
})
const sortSummaryLabel = computed(() => sortOrder.value === 'updated_desc' ? '最近更新优先' : '最早更新优先')
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize)))
const pagedRows = computed(() => {
  const page = Math.max(1, Math.min(currentPage.value, pageCount.value))
  const start = (page - 1) * pageSize
  return filteredRows.value.slice(start, start + pageSize)
})
const currentPageStart = computed(() => {
  if (!filteredRows.value.length) return 0
  return (currentPage.value - 1) * pageSize + 1
})
const currentPageEnd = computed(() => Math.min(currentPage.value * pageSize, filteredRows.value.length))
const visiblePageNumbers = computed(() => {
  const total = pageCount.value
  const page = Math.max(1, Math.min(currentPage.value, total))
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1)
  if (page <= 3) return [1, 2, 3, 4, 5]
  if (page >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total]
  return [page - 2, page - 1, page, page + 1, page + 2]
})

function humanStep(step?: string) {
  if (step === 'upload_analyze_script') return '分析参考视频'
  if (step === 'generate_script_variants' || step === 'select_script_variant') return '脚本生成'
  if (step === 'generate_storyboard_grids') return '分镜图片生成'
  if (step === 'generate_shot_videos' || step === 'review_replace_shots') return '分镜视频生成'
  if (step === 'compose_final_video' || step === 'export_final') return '成片合成'
  return '待开始'
}

function humanStatus(status?: string) {
  const text = String(status || '').toLowerCase()
  if (text === 'draft') return '草稿'
  if (text.includes('done') || text.includes('complete')) return '完成'
  if (text.includes('fail') || text.includes('error')) return '失败'
  if (text.includes('running') || text.includes('generating') || text === 'analyzed' || text === 'materials_ready') return '进行中'
  if (text === 'ready_for_review') return '待检查'
  return '进行中'
}

function humanRunMode(runMode?: 'auto' | 'manual') {
  return runMode === 'auto' ? '自动运行' : '手动运行'
}

function statusTone(status?: string) {
  const text = String(status || '').toLowerCase()
  if (text.includes('done') || text.includes('complete')) return 'is-success'
  if (text.includes('fail') || text.includes('error')) return 'is-danger'
  if (text === 'draft') return 'is-draft'
  return 'is-running'
}

function stepTone(step?: string) {
  if (step === 'upload_analyze_script') return 'tone-analyze'
  if (step === 'generate_script_variants' || step === 'select_script_variant') return 'tone-script'
  if (step === 'generate_storyboard_grids') return 'tone-storyboard'
  if (step === 'generate_shot_videos' || step === 'review_replace_shots') return 'tone-video'
  if (step === 'compose_final_video' || step === 'export_final') return 'tone-compose'
  return 'tone-neutral'
}

function shortPath(input?: string) {
  const text = String(input || '').trim()
  if (!text) return '--'
  const parts = text.split(/[/\\]/).filter(Boolean)
  return parts.slice(-1)[0] || '--'
}

function compactError(input?: string, max = 44) {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function compactDescription(input?: string, max = 40) {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return '从参考视频到成片输出，当前任务正在等待推进。'
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function toFileSrc(input?: string) {
  const text = String(input || '').trim()
  if (!text) return ''
  if (/^(https?:|data:|vg:|file:)/i.test(text)) return text
  return `vg://file?path=${encodeURIComponent(text)}`
}

function itemCoverSrc(item: CloneProjectSummary) {
  return toFileSrc(item.coverAssetPath || item.previewOutputPath || item.finalOutputPath || item.referenceVideoPath || '')
}

function formatTime(value?: number) {
  if (!value) return '--'
  const d = new Date(value)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function stepIndex(step?: string) {
  if (step === 'upload_analyze_script') return 0
  if (step === 'generate_script_variants' || step === 'select_script_variant') return 1
  if (step === 'generate_storyboard_grids') return 2
  if (step === 'generate_shot_videos' || step === 'review_replace_shots') return 3
  if (step === 'compose_final_video' || step === 'export_final') return 4
  return 0
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'updated_desc' ? 'updated_asc' : 'updated_desc'
  currentPage.value = 1
}

function syncSelectionWithRows(list: CloneProjectSummary[]) {
  const available = new Set(list.map((item) => item.id))
  selectedIds.value = selectedIds.value.filter((id) => available.has(id))
}

function toggleSelected(id: string) {
  if (!id) return
  if (selectedSet.value.has(id)) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id)
    return
  }
  selectedIds.value = [...selectedIds.value, id]
}

function toggleSelectAllFiltered() {
  if (!filteredRows.value.length) return
  if (allFilteredSelected.value) {
    const filteredIdSet = new Set(filteredRows.value.map((item) => item.id))
    selectedIds.value = selectedIds.value.filter((id) => !filteredIdSet.has(id))
    return
  }
  const merged = new Set(selectedIds.value)
  for (const item of filteredRows.value) merged.add(item.id)
  selectedIds.value = Array.from(merged)
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, pageCount.value))
}

function goToPrevPage() {
  goToPage(currentPage.value - 1)
}

function goToNextPage() {
  goToPage(currentPage.value + 1)
}

async function exportSelectedFinalVideos() {
  if (exporting.value) return
  if (!selectedIds.value.length) {
    window.alert('请先选择要导出的任务。')
    return
  }
  const dir = await window.api.pickDir({ title: '选择批量导出目录' })
  if (!dir) return
  exporting.value = true
  batchExportMessage.value = ''
  try {
    const cloneProjectIds = selectedIds.value.map((id) => String(id || '').trim()).filter(Boolean)
    const result = await window.api.clone.exportFinalVideos({
      cloneProjectIds,
      outputDir: String(dir || '').trim(),
    }) as {
      outputDir: string
      total: number
      exported: Array<{ cloneProjectId: string; title: string; sourcePath: string; targetPath: string }>
      skipped: Array<{ cloneProjectId: string; title: string; reason: string }>
    }
    const exportedCount = result.exported.length
    const skippedCount = result.skipped.length
    batchExportMessage.value = skippedCount
      ? `已导出 ${exportedCount} 个成片，跳过 ${skippedCount} 个未出片或文件缺失任务。`
      : `已导出 ${exportedCount} 个成片。`
    if (exportedCount > 0) {
      await window.api.shell.openPath(result.outputDir)
    } else {
      window.alert('所选任务中没有可导出的成片。')
    }
  } catch (error: any) {
    const message = String(error?.message ?? error ?? '批量导出失败。')
    batchExportMessage.value = message
    window.alert(message)
  } finally {
    exporting.value = false
  }
}

async function refresh() {
  loading.value = true
  try {
    rows.value = (await window.api.clone.listProjectSummaries()) as CloneProjectSummary[]
    syncSelectionWithRows(rows.value)
    goToPage(currentPage.value)
  } finally {
    loading.value = false
  }
}

watch([query, statusFilter], () => {
  currentPage.value = 1
})

watch(filteredRows, () => {
  if (currentPage.value > pageCount.value) {
    currentPage.value = pageCount.value
  }
})

async function createTask() {
  if (creating.value) return
  if (!createRunMode.value) return
  creating.value = true
  try {
    const res = (await window.api.clone.createDraftProject({
      locale: 'zh-CN',
      strength: 'structure',
      runMode: createRunMode.value,
    })) as { project?: { id?: string } }
    const id = String(res?.project?.id || '').trim()
    if (id) {
      createRunMode.value = ''
      void router.push(`/clone/${id}`)
      return
    }
    console.error('[clone-task-list] create-task-missing-id', res)
  } catch (error) {
    console.error('[clone-task-list] create-task-error', error)
  } finally {
    creating.value = false
  }
}

async function removeTask(id: string) {
  if (!id) return
  removingId.value = id
  try {
    await window.api.clone.removeProject({ cloneProjectId: id })
    await refresh()
  } finally {
    removingId.value = ''
  }
}

async function confirmRemoveTask(item: CloneProjectSummary) {
  if (!item?.id) return
  const title = item.title || item.id
  const ok = window.confirm(`确认删除「${title}」吗？删除后无法恢复。`)
  if (!ok) return
  await removeTask(item.id)
}

function openTask(id: string) {
  if (!id) return
  void router.push(`/clone/${id}`)
}

function openErrorDialog(item: CloneProjectSummary) {
  const text = String(item.lastError || '').trim()
  if (!text) return
  errorDialogTitle.value = item.title || item.id
  errorDialogMessage.value = text
  errorDialogOpen.value = true
}

function closeErrorDialog() {
  errorDialogOpen.value = false
  errorDialogTitle.value = ''
  errorDialogMessage.value = ''
}

onMounted(refresh)
</script>

<template>
  <div class="clone-task-list-page">
    <section class="clone-task-list-shell">
      <div class="clone-task-list-main">
        <header class="clone-list-head">
          <div class="clone-list-head__copy">
            <div class="clone-list-head__title">
              <h1>爆款视频复刻</h1>
              <span class="clone-list-head__spark">✦</span>
            </div>
            
          </div>
          <div class="clone-list-head__actions">
            <UiButton variant="secondary" :disabled="exporting || !selectedIds.length" @click="exportSelectedFinalVideos">
              {{ exporting ? '导出中...' : `批量导出${selectedIds.length ? ` (${selectedIds.length})` : ''}` }}
            </UiButton>
            <div class="clone-list-run-mode">
              <button class="clone-list-run-mode__option" :class="{ 'is-active': createRunMode === 'auto' }" type="button" @click="createRunMode = 'auto'">
                自动运行
              </button>
              <button class="clone-list-run-mode__option" :class="{ 'is-active': createRunMode === 'manual' }" type="button" @click="createRunMode = 'manual'">
                手动运行
              </button>
            </div>
            <UiButton :disabled="creating || !createRunMode" @click="createTask">
              <Plus class="h-4 w-4" />
              {{ creating ? '创建中...' : '新建任务' }}
            </UiButton>
          </div>
        </header>
        <section class="clone-list-overview">
          <article class="clone-overview-card">
            <span>全部任务</span>
            <strong>{{ stats.all }}</strong>
            <small>当前列表总量</small>
          </article>
          <article class="clone-overview-card">
            <span>进行中</span>
            <strong>{{ stats.running }}</strong>
            <small>仍在推进主链路</small>
          </article>
          <article class="clone-overview-card">
            <span>已完成</span>
            <strong>{{ stats.completed }}</strong>
            <small>已有成片或流程完成</small>
          </article>
          <article class="clone-overview-card">
            <span>失败任务</span>
            <strong>{{ stats.failed }}</strong>
            <small>需要回看错误详情</small>
          </article>
        </section>
        <section class="clone-list-filters">
          <div class="clone-list-tabs">
            <button
              v-for="tab in statusTabs"
              :key="tab.key"
              class="clone-list-tab"
              :class="{ 'is-active': statusFilter === tab.key }"
              type="button"
              @click="statusFilter = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          <div class="clone-list-toolbar">
            <button class="clone-list-sort" type="button" @click="toggleSelectAllFiltered">
              {{ allFilteredSelected ? '取消全选' : '全选当前列表' }}
            </button>
            <label class="clone-list-search" aria-label="搜索任务">
              <Search class="h-4 w-4" />
              <input v-model.trim="query" type="text" placeholder="搜索任务名称、模特或错误信息" />
            </label>
            <button class="clone-list-sort" type="button" @click="toggleSortOrder">
              {{ sortOrder === 'updated_desc' ? '最近更新' : '最早更新' }}
              <ChevronDown class="h-4 w-4" />
            </button>
          </div>
        </section>

        <div v-if="selectedIds.length || batchExportMessage" class="clone-list-batch-bar">
          <span class="clone-list-batch-bar__summary">已选 {{ selectedIds.length }} 个任务，可导出 {{ exportableSelectedCount }} 个成片</span>
          <span v-if="batchExportMessage" class="clone-list-batch-bar__message">{{ batchExportMessage }}</span>
        </div>

        <section class="clone-content-grid">
          <div class="clone-grid-main">
            <div v-if="filteredRows.length" class="clone-task-grid">
              <article v-for="item in pagedRows" :key="item.id" class="clone-task-card">
                <label class="clone-task-card__select">
                  <input
                    type="checkbox"
                    :checked="selectedSet.has(item.id)"
                    @change="toggleSelected(item.id)"
                  />
                  <span>选择</span>
                </label>
                <div class="clone-task-card__top">
                  <div class="clone-task-card__cover">
                    <img v-if="itemCoverSrc(item)" :src="itemCoverSrc(item)" :alt="item.title" />
                    <div v-else class="clone-task-card__cover-empty">
                      <Video class="h-7 w-7" />
                    </div>
                    <div class="clone-task-card__cover-overlay">
                      <span class="clone-task-card__cover-stage">{{ humanStep(item.currentStep) }}</span>
                      <span class="clone-task-card__cover-progress">{{ item.progressPercent }}%</span>
                    </div>
                  </div>
                  <div class="clone-task-card__top-right">
                    <span class="clone-task-card__status" :class="statusTone(item.status)">{{ humanStatus(item.status) }}</span>
                    <button class="clone-task-card__more" type="button" aria-label="更多操作" disabled>
                      <MoreVertical class="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div class="clone-task-card__body">
                  <div class="clone-task-card__head">
                    <h3>{{ item.title }}</h3>
                    <span class="clone-task-card__step-tag" :class="stepTone(item.currentStep)">{{ humanStep(item.currentStep) }}</span>
                  </div>

                  <p class="clone-task-card__description">{{ compactDescription(item.description) }}</p>
                  <div class="clone-task-card__meta-pills">
                    <span class="clone-task-card__meta-pill">{{ humanRunMode(item.runMode) }}</span>
                    <span class="clone-task-card__meta-pill">{{ item.selectedModelIdentityName || '未绑模特' }}</span>
                    <span class="clone-task-card__meta-pill">{{ item.productReferenceImageCount }} 图 / {{ item.generatedVideoCount || 0 }} 视频</span>
                  </div>

                  <div class="clone-task-card__summary">
                    <span class="clone-task-card__summary-item">
                      <strong>Ref</strong>
                      <em>{{ shortPath(item.referenceVideoName || item.referenceVideoPath) }}</em>
                    </span>
                    <span class="clone-task-card__summary-item">
                      <strong>Output</strong>
                      <em>{{ item.finalOutputPath ? 'Ready' : 'Pending' }}</em>
                    </span>
                  </div>

                  <div class="clone-task-card__progress">
                    <strong>{{ item.progressPercent }}%</strong>
                    <span>{{ item.finalOutputPath ? '可导出' : '继续推进中' }}</span>
                  </div>
                  <div class="clone-task-card__track">
                    <span :style="{ width: `${item.progressPercent}%` }"></span>
                  </div>

                  <div class="clone-task-card__steps">
                    <span
                      v-for="(_, index) in 5"
                      :key="`${item.id}-${index}`"
                      class="clone-task-card__step"
                      :class="{ 'is-active': index === Math.max(0, Math.min(4, stepIndex(item.currentStep))), 'is-done': index < stepIndex(item.currentStep) }"
                    >
                      {{ index + 1 }}
                    </span>
                  </div>

                  <div class="clone-task-card__footer">
                    <div class="clone-task-card__time">
                      <Clock3 class="h-4 w-4" />
                      <span>{{ formatTime(item.updatedAt) }}</span>
                    </div>
                    <div class="clone-task-card__actions">
                      <button class="clone-task-card__action clone-task-card__action--play" type="button" @click="openTask(item.id)">
                        <Play class="h-4 w-4" />
                      </button>
                      <button class="clone-task-card__action clone-task-card__action--danger" type="button" :disabled="removingId === item.id" @click="confirmRemoveTask(item)">
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div v-if="item.lastError" class="clone-task-card__error">
                    <span class="clone-task-card__error-text">错误：{{ compactError(item.lastError) }}</span>
                    <button class="clone-task-card__error-link" type="button" @click.stop="openErrorDialog(item)">查看错误</button>
                  </div>
                </div>
              </article>
            </div>

            <div v-else class="clone-list-empty">
              <LoaderCircle v-if="loading" class="h-5 w-5 is-spinning" />
              <Wand2 v-else class="h-5 w-5" />
              <strong>{{ loading ? '正在读取任务列表' : '还没有复刻任务' }}</strong>
              <span>{{ loading ? '请稍候...' : '点击右上角“新建任务”，创建第一个复刻项目。' }}</span>
            </div>

            <div class="clone-list-pagination">
              <span class="clone-list-pagination__summary">当前显示 {{ currentPageStart }} - {{ currentPageEnd }} / {{ filteredRows.length }}，第 {{ currentPage }} / {{ pageCount }} 页</span>
              <div class="clone-list-pagination__controls">
                <button type="button" :disabled="currentPage <= 1" @click="goToPrevPage">‹</button>
                <button
                  v-for="page in visiblePageNumbers"
                  :key="page"
                  type="button"
                  :class="{ 'is-active': currentPage === page }"
                  @click="goToPage(page)"
                >
                  {{ page }}
                </button>
                <button type="button" :disabled="currentPage >= pageCount" @click="goToNextPage">›</button>
                <button type="button" class="clone-list-page-size" disabled>{{ pageSize }} 条/页</button>
              </div>
            </div>
          </div>

          <aside class="clone-task-list-side">
            <UiCard class="clone-side-card clone-side-card--summary">
              <div class="clone-side-card__row">
                <strong>当前筛选</strong>
                <span class="clone-side-clear">实时摘要</span>
              </div>
              <div class="clone-side-summary-list">
                <div class="clone-side-summary-item clone-side-summary-item--primary">
                  <span>状态</span>
                  <strong>{{ statusSummaryLabel }}</strong>
                </div>
                <div class="clone-side-summary-item clone-side-summary-item--primary">
                  <span>排序</span>
                  <strong>{{ sortSummaryLabel }}</strong>
                </div>
                <div class="clone-side-summary-item clone-side-summary-item--secondary">
                  <span>关键词</span>
                  <strong>{{ query || '全部任务' }}</strong>
                </div>
                <div class="clone-side-summary-item clone-side-summary-item--secondary">
                  <span>已选</span>
                  <strong>{{ selectedIds.length }} 个任务</strong>
                </div>
              </div>
            </UiCard>
            <UiCard class="clone-side-card">
              <div class="clone-side-card__head">
                <strong>任务说明</strong>
                <small>右侧只保留轻量提示和最近切换列表，不再占用主业务高度。</small>
              </div>
              <div class="clone-side-feature-list">
                <article class="clone-side-feature">
                  <div class="clone-side-feature__icon tone-violet">◈</div>
                  <div>
                    <strong>后台持续运行</strong>
                    <span>任务在后台执行，离开列表页不会中断。</span>
                  </div>
                </article>
                <article class="clone-side-feature">
                  <div class="clone-side-feature__icon tone-purple">⌘</div>
                  <div>
                    <strong>详情页职责</strong>
                    <span>详情页负责脚本、分镜、视频、查错日志。</span>
                  </div>
                </article>
                <article class="clone-side-feature">
                  <div class="clone-side-feature__icon tone-cyan">⬢</div>
                  <div>
                    <strong>快捷入口</strong>
                    <span>状态筛选和最近切换可以快速回到待推进项目。</span>
                  </div>
                </article>
              </div>
            </UiCard>

            <UiCard class="clone-side-card clone-side-card--recent">
              <div class="clone-side-card__row">
                <strong>最近更新</strong>
                <span class="clone-side-clear">按更新时间展示</span>
              </div>
              <div class="clone-recent-list">
                <button v-for="item in recentRows" :key="item.id" type="button" class="clone-recent-item" @click="openTask(item.id)">
                  <span class="clone-recent-item__thumb">
                    <img v-if="itemCoverSrc(item)" :src="itemCoverSrc(item)" :alt="item.title" />
                    <Video v-else class="h-4 w-4" />
                  </span>
                  <span class="clone-recent-item__copy">
                    <strong>{{ item.title }}</strong>
                    <em>{{ formatTime(item.updatedAt) }}</em>
                  </span>
                </button>
              </div>
              <button type="button" class="clone-side-all" @click="statusFilter = 'all'">查看全部任务 →</button>
            </UiCard>
          </aside>
        </section>
      </div>
    </section>

    <div v-if="errorDialogOpen" class="clone-error-dialog-mask" @click.self="closeErrorDialog">
      <div class="clone-error-dialog" @click.stop>
        <div class="clone-error-dialog__head">
          <div class="clone-error-dialog__copy">
            <strong>任务错误详情</strong>
            <span>{{ errorDialogTitle }}</span>
          </div>
          <UiButton variant="ghost" @click="closeErrorDialog">关闭</UiButton>
        </div>
        <div class="clone-error-dialog__body">
          {{ errorDialogMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clone-task-list-page {
  --clone-accent: var(--ds-primary, #22d3ee);
  min-height: 100%;
  padding: 18px 18px 24px;
  color: #eef3ff;
  background: transparent;
}

.clone-task-list-shell {
  background: transparent;
}

.clone-task-list-shell,
.clone-task-list-main,
.clone-list-head__copy,
.clone-content-grid,
.clone-grid-main,
.clone-side-feature-list,
.clone-recent-list {
  display: grid;
}

.clone-task-list-main {
  gap: 14px;
}

.clone-list-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-top: 0;
}

.clone-list-head__copy {
  gap: 4px;
}

.clone-list-head__eyebrow {
  display: none;
  align-items: center;
  width: fit-content;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(129, 140, 248, 0.22);
  background: rgba(99, 102, 241, 0.1);
  color: #b8c7ff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.clone-list-head__title {
  display: flex;
  align-items: center;
  gap: 0;
}

.clone-list-head__title h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.1;
  font-weight: 800;
}

.clone-list-head__spark {
  display: none;
}

.clone-list-head__copy p {
  display: none;
}

.clone-list-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 8px 0 0;
  border: 0;
  border-bottom: 0;
  border-radius: 0;
  background: transparent;
}

.clone-overview-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 52px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--clone-accent) 14%, rgba(255, 255, 255, 0.08));
  background: rgba(8, 16, 27, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.02),
    inset 2px 0 0 color-mix(in srgb, var(--clone-accent) 58%, transparent);
}

.clone-overview-card span {
  color: color-mix(in srgb, var(--clone-accent) 56%, #d9e5ff);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.clone-overview-card strong {
  font-size: 16px;
  line-height: 1;
  color: #f7faff;
}

.clone-overview-card small {
  display: none;
}

.clone-list-head__actions,
.clone-list-filters,
.clone-list-tabs,
.clone-list-toolbar,
.clone-task-card__top,
.clone-task-card__top-right,
.clone-task-card__head,
.clone-task-card__footer,
.clone-task-card__actions,
.clone-list-pagination,
.clone-list-pagination__controls,
.clone-side-card__row,
.clone-recent-item {
  display: flex;
}

.clone-list-head__actions {
  align-items: center;
  gap: 12px;
}

.clone-list-run-mode {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 6px;
  min-height: 50px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(10, 18, 30, 0.98), rgba(8, 14, 24, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-list-run-mode__option {
  min-width: 112px;
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #9fb0d8;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.clone-list-run-mode__option:hover {
  color: #eef3ff;
  border-color: rgba(129, 140, 248, 0.24);
  background: rgba(99, 102, 241, 0.08);
}

.clone-list-run-mode__option.is-active {
  color: #ffffff;
  border-color: color-mix(in srgb, var(--clone-accent) 38%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--clone-accent) 82%, #0f172a), color-mix(in srgb, var(--clone-accent) 56%, #07111d));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--clone-accent) 24%, transparent);
}

.clone-list-run-mode__option:active {
  transform: translateY(1px);
}

.clone-list-run-mode__hint {
  display: none;
}

.clone-list-filters {
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: -1px;
  padding: 14px 18px 18px;
  border-radius: 0 0 10px 10px;
  border: 1px solid rgba(118, 136, 196, 0.12);
  background: linear-gradient(180deg, rgba(9, 17, 28, 0.96), rgba(6, 12, 22, 0.94));
}

.clone-list-tabs {
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.clone-list-tab {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(13, 22, 35, 0.96);
  color: #cad5f3;
  font-size: 14px;
}

.clone-list-tab.is-active {
  border-color: color-mix(in srgb, var(--clone-accent) 46%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--clone-accent) 22%, rgba(8, 17, 29, 0.96)), rgba(10, 18, 30, 0.98));
  color: #fff;
  box-shadow: inset 2px 0 0 var(--clone-accent);
}

.clone-list-toolbar {
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.clone-list-search,
.clone-list-sort,
.clone-list-view {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 20, 32, 0.96);
  color: #d2dcf6;
  font-size: 14px;
}

.clone-list-search {
  justify-content: flex-start;
  min-width: 280px;
  padding-right: 12px;
  color: #8fa1c8;
}

.clone-list-search input {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: #eef3ff;
  font-size: 13px;
}

.clone-list-search input::placeholder {
  color: #7e90bb;
}

.clone-content-grid {
  grid-template-columns: minmax(0, 1fr) 256px;
  gap: 16px;
  align-items: start;
  background: transparent;
}

.clone-grid-main {
  gap: 18px;
  padding: 18px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.1);
  background: linear-gradient(180deg, rgba(8, 17, 29, 0.98), rgba(4, 10, 18, 0.99));
}

.clone-task-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.clone-task-card {
  position: relative;
  display: grid;
  gap: 12px;
  min-height: 336px;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid rgba(118, 136, 196, 0.12);
  background:
    linear-gradient(180deg, rgba(15, 24, 39, 0.98), rgba(9, 16, 28, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.clone-task-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--clone-accent) 26%, transparent);
  box-shadow:
    0 14px 28px rgba(4, 10, 22, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-task-card__top {
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.clone-task-card__cover {
  position: relative;
  width: 100%;
  height: 164px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  flex: 1 1 auto;
  border: 1px solid rgba(255, 255, 255, 0.03);
}

.clone-task-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clone-task-card__cover-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #89a0c8;
}

.clone-task-card__cover-overlay {
  position: absolute;
  inset: auto 10px 10px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(6, 10, 20, 0.18), rgba(6, 10, 20, 0.88));
  backdrop-filter: blur(6px);
}

.clone-task-card__cover-stage,
.clone-task-card__cover-progress {
  color: #f7faff;
  font-size: 11px;
  font-weight: 700;
}

.clone-task-card__top-right {
  align-items: flex-start;
  justify-content: flex-end;
  gap: 6px;
  position: absolute;
  top: 14px;
  left: 14px;
  right: 54px;
  pointer-events: none;
}

.clone-task-card__step-tag,
.clone-task-card__status {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.clone-task-card__step-tag.tone-analyze {
  background: color-mix(in srgb, var(--clone-accent) 16%, transparent);
  color: color-mix(in srgb, var(--clone-accent) 74%, white);
}

.clone-task-card__step-tag.tone-script {
  background: rgba(52, 211, 153, 0.14);
  color: #8ce6bb;
}

.clone-task-card__step-tag.tone-storyboard {
  background: rgba(59, 130, 246, 0.16);
  color: #8cd2ff;
}

.clone-task-card__step-tag.tone-video {
  background: color-mix(in srgb, var(--clone-accent) 18%, transparent);
  color: color-mix(in srgb, var(--clone-accent) 78%, white);
}

.clone-task-card__step-tag.tone-compose {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}

.clone-task-card__status.is-running {
  background: rgba(59, 130, 246, 0.16);
  color: #a9c6ff;
}

.clone-task-card__status.is-draft {
  background: rgba(148, 163, 184, 0.14);
  color: #d3d9e6;
}

.clone-task-card__status.is-success {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}

.clone-task-card__status.is-danger {
  background: rgba(239, 68, 68, 0.16);
  color: #fda4af;
}

.clone-task-card__more {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(8, 16, 27, 0.7);
  color: color-mix(in srgb, var(--clone-accent) 58%, #d7e4ff);
  pointer-events: auto;
}

.clone-task-card__more:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.clone-task-card__body {
  display: grid;
  gap: 10px;
  align-content: start;
}

.clone-task-card__meta-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.clone-task-card__meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(255, 255, 255, 0.02);
  color: #cad6f4;
  font-size: 11px;
  font-weight: 600;
}

.clone-list-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 0 16px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clone-accent) 18%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--clone-accent) 10%, rgba(8, 17, 29, 0.98)), rgba(7, 13, 24, 0.96));
  color: #d9e4ff;
  font-size: 13px;
}

.clone-list-batch-bar__summary {
  color: #eef4ff;
  font-weight: 600;
}

.clone-list-batch-bar__message {
  color: #9fb0d8;
  text-align: right;
}

.clone-task-card__select {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  background: rgba(7, 12, 24, 0.82);
  color: #d8e2f5;
  font-size: 11px;
  font-weight: 600;
}

.clone-task-card__select input {
  margin: 0;
}

.clone-task-card__description {
  margin: -2px 0 0;
  color: #9fb0d8;
  font-size: 13px;
  line-height: 1.5;
}

.clone-task-card__head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.clone-task-card__head h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
  font-weight: 800;
}

.clone-task-card__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.clone-task-card__summary-item {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 4px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.clone-task-card__summary-item strong {
  color: #91a6d1;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.clone-task-card__summary-item em {
  color: #edf2ff;
  font-size: 12px;
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-task-card__progress {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.clone-task-card__progress strong {
  font-size: 26px;
  line-height: 1;
}

.clone-task-card__progress span {
  color: #9fb0d8;
  font-size: 12px;
}

.clone-task-card__track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.clone-task-card__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--clone-accent) 70%, white) 0%, var(--clone-accent) 100%);
}

.clone-task-card__steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.clone-task-card__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin: 0 auto;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #98a6c3;
  font-size: 12px;
}

.clone-task-card__step.is-active {
  border-color: rgba(109, 93, 255, 0.52);
  color: #fff;
  box-shadow: 0 0 0 3px rgba(109, 93, 255, 0.15);
}

.clone-task-card__step.is-done {
  border-color: rgba(34, 197, 94, 0.36);
  color: #86efac;
}

.clone-task-card__footer {
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.clone-task-card__time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #9aa7c4;
  font-size: 12px;
}

.clone-task-card__actions {
  align-items: center;
  gap: 6px;
}

.clone-task-card__action {
  width: 36px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(9, 17, 28, 0.92);
}

.clone-task-card__action--play {
  color: color-mix(in srgb, var(--clone-accent) 72%, white);
}

.clone-task-card__action--danger {
  color: #ffb3bb;
}

.clone-task-card__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.clone-task-card__error-text {
  min-width: 0;
  color: #ffb1b8;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-task-card__error-link {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.22);
  background: rgba(239, 68, 68, 0.1);
  color: #fecaca;
  font-size: 11px;
  font-weight: 700;
}

.clone-error-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 8, 18, 0.72);
}

.clone-error-dialog {
  width: min(720px, 100%);
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(248, 113, 113, 0.18);
  background: linear-gradient(180deg, rgba(17, 25, 42, 0.98), rgba(11, 17, 30, 0.98));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
}

.clone-error-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.clone-error-dialog__copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.clone-error-dialog__copy strong {
  color: #f8fafc;
  font-size: 15px;
}

.clone-error-dialog__copy span {
  color: #98a6c3;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.clone-error-dialog__body {
  max-height: 52vh;
  overflow: auto;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(248, 113, 113, 0.14);
  background: rgba(0, 0, 0, 0.22);
  color: #fecdd3;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.clone-list-empty {
  min-height: 320px;
  display: grid;
  place-items: center;
  gap: 6px;
  color: #97a5c4;
  text-align: center;
}

.clone-list-empty strong {
  color: #eef3ff;
  font-size: 14px;
}

.clone-list-pagination {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 14px 16px 0;
  color: #93a2c0;
  font-size: 13px;
}

.clone-list-pagination__summary {
  color: #a6b6d6;
  font-weight: 600;
}

.clone-list-pagination__controls {
  align-items: center;
  gap: 8px;
}

.clone-list-pagination__controls button {
  min-width: 40px;
  height: 40px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(9, 17, 28, 0.96);
  color: #c9d4f2;
}

.clone-list-pagination__controls button.is-active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--clone-accent) 84%, #0f172a), color-mix(in srgb, var(--clone-accent) 60%, #07111d));
  color: #fff;
}

.clone-list-page-size {
  padding: 0 14px;
}

.clone-task-list-side {
  display: grid;
  gap: 18px;
  align-content: start;
  position: sticky;
  top: 18px;
}

.clone-side-summary-list {
  display: grid;
  gap: 10px;
}

.clone-side-summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.clone-side-summary-item--primary {
  border-color: color-mix(in srgb, var(--clone-accent) 18%, rgba(255, 255, 255, 0.06));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--clone-accent) 8%, rgba(255, 255, 255, 0.02)), rgba(255, 255, 255, 0.02));
}

.clone-side-summary-item--secondary {
  min-height: 42px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.018);
}

.clone-side-summary-item span {
  color: #96a6c5;
  font-size: 12px;
}

.clone-side-summary-item--primary span {
  color: color-mix(in srgb, var(--clone-accent) 54%, #d9e5ff);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.clone-side-summary-item strong {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #eef3ff;
  font-size: 12px;
}

.clone-side-summary-item--primary strong {
  font-size: 13px;
}

.clone-side-summary-item--secondary strong {
  color: #d6e0f5;
}

.clone-side-card {
  padding: 18px;
  border-radius: 8px;
  border: 1px solid rgba(118, 136, 196, 0.14);
  background: linear-gradient(180deg, rgba(11, 20, 35, 0.98), rgba(8, 15, 27, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-side-card__head {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.clone-side-card__head strong,
.clone-side-card__row strong {
  font-size: 13px;
  color: #f4f7ff;
}

.clone-side-card__head small {
  color: color-mix(in srgb, var(--clone-accent) 42%, #c9d6f2);
  font-size: 12px;
  line-height: 1.6;
}

.clone-side-feature-list {
  gap: 14px;
}

.clone-side-feature {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.clone-side-feature__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 2px;
  font-size: 12px;
  border: 1px solid color-mix(in srgb, var(--clone-accent) 20%, rgba(255, 255, 255, 0.08));
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 0 0 1px rgba(6, 10, 18, 0.35);
}

.clone-side-feature__icon.tone-violet {
  color: color-mix(in srgb, var(--clone-accent) 72%, white);
  background: linear-gradient(180deg, color-mix(in srgb, var(--clone-accent) 10%, transparent), transparent);
}

.clone-side-feature__icon.tone-purple {
  color: color-mix(in srgb, var(--clone-accent) 62%, #dfe8ff);
  background: linear-gradient(180deg, color-mix(in srgb, var(--clone-accent) 8%, transparent), transparent);
}

.clone-side-feature__icon.tone-cyan {
  color: color-mix(in srgb, var(--clone-accent) 80%, white);
  background: linear-gradient(180deg, color-mix(in srgb, var(--clone-accent) 12%, transparent), transparent);
}

.clone-side-feature strong {
  display: block;
  font-size: 12px;
  margin-bottom: 3px;
}

.clone-side-feature span {
  color: #96a6c5;
  font-size: 11px;
  line-height: 1.45;
}

.clone-side-card__row {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.clone-side-clear {
  color: color-mix(in srgb, var(--clone-accent) 52%, #d8e4ff);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.clone-recent-list {
  gap: 8px;
}

.clone-recent-item {
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.018);
  text-align: left;
}

.clone-recent-item__thumb {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  color: #8fa1c8;
  flex: 0 0 auto;
}

.clone-recent-item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clone-recent-item__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.clone-recent-item__copy strong,
.clone-recent-item__copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-recent-item__copy strong {
  color: #eef3ff;
  font-size: 12px;
  font-style: normal;
}

.clone-recent-item__copy em {
  color: #96a6c5;
  font-size: 11px;
  font-style: normal;
}

.clone-side-all {
  width: 100%;
  min-height: 44px;
  margin-top: 12px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(12, 20, 32, 0.96);
  color: #d8e0f1;
  font-size: 14px;
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1500px) {
  .clone-list-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .clone-task-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1320px) {
  .clone-content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .clone-task-list-side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    position: static;
  }
}

@media (max-width: 1180px) {
  .clone-list-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .clone-list-toolbar {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .clone-task-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .clone-list-overview {
    grid-template-columns: minmax(0, 1fr);
  }

  .clone-list-head,
  .clone-list-head__actions,
  .clone-list-pagination,
  .clone-list-batch-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .clone-task-grid,
  .clone-task-list-side {
    grid-template-columns: minmax(0, 1fr);
  }

  .clone-task-card__summary {
    grid-template-columns: minmax(0, 1fr);
  }

  .clone-task-card__cover {
    height: 148px;
  }
}
</style>
