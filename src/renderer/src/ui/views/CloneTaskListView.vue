<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, FolderOpen, LoaderCircle, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, Video, Wand2 } from 'lucide-vue-next'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'
import RuntimeLogDialog from '../components/RuntimeLogDialog.vue'

type CloneProjectSummary = {
  id: string
  title: string
  description?: string
  groupId?: string
  groupName?: string
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
  subtitleOverlayActive?: boolean
  subtitleOriginalOutputPath?: string
  subtitleOutputPath?: string
  selectedModelIdentityName: string
  productReferenceImageCount: number
  shotCount: number
  generatedImageCount: number
  generatedVideoCount: number
  lastError: string
}

type CloneTaskGroup = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sortOrder: number
  taskCount: number
}

type RuntimeLogItem = {
  id: string
  level: 'info' | 'success' | 'error'
  message: string
  time: number
}

type SubtitlePresetId = 'viral-hook' | 'deal-punch' | 'premium-drop'

type SubtitleCaptionStyle = {
  fontName: string
  fontSize: number
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  position: 'top' | 'center' | 'bottom'
  textAlign: 'left' | 'center' | 'right'
  safeMargin: number
  maxLines: number
  maxWidthRatio: number
  lineGap: number
  bottomMargin: number
}

const router = useRouter()
const { t, locale } = useI18n()
const loading = ref(false)
const creating = ref(false)
const removingId = ref('')
const exporting = ref(false)
const rows = ref<CloneProjectSummary[]>([])
const groups = ref<CloneTaskGroup[]>([])
const query = ref('')
const selectedIds = ref<string[]>([])
const activeGroupId = ref<'__all__' | '__ungrouped__' | string>('__all__')
const errorDialogOpen = ref(false)
const errorDialogTitle = ref('')
const errorDialogMessage = ref('')
const renameDialogOpen = ref(false)
const renameDraft = ref('')
const renamingId = ref('')
const savingRename = ref(false)
const groupDialogOpen = ref(false)
const groupDialogMode = ref<'create' | 'rename' | 'move_single' | 'move_batch'>('create')
const groupDraft = ref('')
const editingGroupId = ref('')
const movingProjectIds = ref<string[]>([])
const moveTargetGroupId = ref<'__ungrouped__' | string>('')
const savingGroup = ref(false)
const groupMenuOpenId = ref('')
const rowMoveMenuOpenId = ref('')
const assigningProjectId = ref('')
const rowActionMenuOpenId = ref('')
const batchExportMessage = ref('')
const createRunMode = ref<'auto' | 'manual' | ''>('')
const statusFilter = ref<'all' | 'draft' | 'running' | 'ready_for_review' | 'completed' | 'failed'>('all')
const sortOrder = ref<'created_desc' | 'created_asc'>('created_desc')
const currentPage = ref(1)
const pageSizeOptions = [10, 20, 50, 100] as const
const pageSize = ref<(typeof pageSizeOptions)[number]>(10)
const pageSizeMenuOpen = ref(false)
const viewMode = ref<'list' | 'grid'>('list')
const runtimeLogs = ref<RuntimeLogItem[]>([])
const runtimeDialogOpen = ref(false)
const videoPreviewDialogOpen = ref(false)
const videoPreviewItem = ref<CloneProjectSummary | null>(null)
const videoPreviewSaving = ref(false)
const subtitleFeatureReady = ref(false)
const subtitleDialogOpen = ref(false)
const subtitleDialogBusy = ref(false)
const subtitleDialogMode = ref<'batch' | 'single'>('batch')
const subtitleDialogTab = ref<'title' | 'template' | 'style'>('title')
const subtitleTargetIds = ref<string[]>([])
const subtitleTitleStrategy = ref<'single_for_all' | 'random_pool'>('single_for_all')
const subtitleTitleText = ref('')
const subtitleTitlePoolText = ref('')
const subtitleSelectedPreset = ref<SubtitlePresetId>('viral-hook')
const subtitleCaptionStyle = reactive<SubtitleCaptionStyle>(defaultSubtitleCaptionStyle())
let offRuntimeLog: (() => void) | undefined
const cloneApi = window.api.clone as any

const subtitlePresets = computed<Array<{
  id: SubtitlePresetId
  name: string
  summary: string
  style: Partial<SubtitleCaptionStyle>
}>>(() => [
  {
    id: 'viral-hook',
    name: t('autoUi.k_469e324ba51b'),
    summary: t('autoUi.k_4590ac4b0a19'),
    style: {
      fontName: 'SimHei',
      fontSize: 68,
      fontColor: '#FFFFFF',
      strokeColor: '#101116',
      strokeWidth: 8,
      shadowColor: 'rgba(0, 0, 0, 0.34)',
      shadowBlur: 10,
      position: 'bottom',
      textAlign: 'center',
      safeMargin: 10,
      maxLines: 2,
      maxWidthRatio: 0.8,
      lineGap: 6,
      bottomMargin: 188,
    },
  },
  {
    id: 'deal-punch',
    name: t('autoUi.k_16d824cf7aac'),
    summary: t('autoUi.k_e11f729375a4'),
    style: {
      fontName: 'Microsoft YaHei',
      fontSize: 64,
      fontColor: '#FFF7D6',
      strokeColor: '#17181F',
      strokeWidth: 6,
      shadowColor: 'rgba(4, 6, 12, 0.42)',
      shadowBlur: 12,
      position: 'bottom',
      textAlign: 'center',
      safeMargin: 11,
      maxLines: 2,
      maxWidthRatio: 0.76,
      lineGap: 6,
      bottomMargin: 194,
    },
  },
  {
    id: 'premium-drop',
    name: t('autoUi.k_f958549b03fe'),
    summary: t('autoUi.k_7d570b2ce11a'),
    style: {
      fontName: 'Noto Sans SC',
      fontSize: 58,
      fontColor: '#F8FAFF',
      strokeColor: '#12131A',
      strokeWidth: 2,
      shadowColor: 'rgba(5, 8, 16, 0.56)',
      shadowBlur: 16,
      position: 'bottom',
      textAlign: 'center',
      safeMargin: 14,
      maxLines: 2,
      maxWidthRatio: 0.68,
      lineGap: 8,
      bottomMargin: 212,
    },
  },
])

function defaultSubtitleCaptionStyle(): SubtitleCaptionStyle {
  return {
    fontName: 'SimHei',
    fontSize: 68,
    fontColor: '#FFFFFF',
    strokeColor: '#101116',
    strokeWidth: 8,
    shadowColor: 'rgba(0, 0, 0, 0.34)',
    shadowBlur: 10,
    position: 'bottom',
    textAlign: 'center',
    safeMargin: 10,
    maxLines: 2,
    maxWidthRatio: 0.8,
    lineGap: 6,
    bottomMargin: 188,
  }
}

function safeText(value: unknown, fallback = '') {
  const text = String(value ?? '').replace(/\uFFFD/g, '').trim()
  return text || fallback
}

function pushRuntimeLog(message: string, level: RuntimeLogItem['level'] = 'info') {
  const text = safeText(message, '')
  if (!text) return
  const last = runtimeLogs.value[0]
  if (last?.message === text && last.level === level) return
  runtimeLogs.value = [
    { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, level, message: text, time: Date.now() },
    ...runtimeLogs.value,
  ].slice(0, 200)
}

function hasCloneGroupApi(method: 'listCloneGroups' | 'createCloneGroup' | 'renameCloneGroup' | 'removeCloneGroup' | 'assignCloneProjectsToGroup') {
  return typeof cloneApi?.[method] === 'function'
}

const cloneGroupListReady = computed(() => hasCloneGroupApi('listCloneGroups'))
const cloneGroupCreateReady = computed(() => hasCloneGroupApi('createCloneGroup'))
const cloneGroupRenameReady = computed(() => hasCloneGroupApi('renameCloneGroup'))
const cloneGroupRemoveReady = computed(() => hasCloneGroupApi('removeCloneGroup'))
const cloneGroupAssignReady = computed(() => hasCloneGroupApi('assignCloneProjectsToGroup'))

const filteredRows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const list = rows.value.filter((item) => {
    const currentGroup = activeGroupId.value
    const itemGroupId = String(item.groupId || '').trim()
    if (currentGroup === '__ungrouped__' && itemGroupId) return false
    if (currentGroup !== '__all__' && currentGroup !== '__ungrouped__' && itemGroupId !== currentGroup) return false
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
    const delta = Number(b.createdAt || 0) - Number(a.createdAt || 0)
    return sortOrder.value === 'created_desc' ? delta : -delta
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
  pendingOutput: rows.value.filter((item) => !String(item.finalOutputPath || '').trim()).length,
}))

const overviewCards = computed(() => [
  { key: 'all', label: t('cloneTasks.stats.all'), helper: t('cloneTasks.stats.allDesc'), value: stats.value.all, tone: 'all', icon: Video },
  { key: 'draft', label: t('cloneTasks.stats.draft'), helper: t('cloneTasks.stats.draftDesc'), value: stats.value.draft, tone: 'muted', icon: FolderOpen },
  { key: 'running', label: t('cloneTasks.stats.running'), helper: t('cloneTasks.stats.runningDesc'), value: stats.value.running, tone: 'running', icon: LoaderCircle },
  { key: 'completed', label: t('cloneTasks.stats.completed'), helper: t('cloneTasks.stats.completedDesc'), value: stats.value.completed, tone: 'success', icon: CheckCircle2 },
  { key: 'failed', label: t('cloneTasks.stats.failed'), helper: t('cloneTasks.stats.failedDesc'), value: stats.value.failed, tone: 'danger', icon: AlertTriangle },
  { key: 'pending-output', label: t('cloneTasks.stats.pendingOutput'), helper: t('cloneTasks.stats.pendingOutputDesc'), value: stats.value.pendingOutput, tone: 'muted', icon: FolderOpen },
])

const groupSidebarItems = computed(() => {
  const ungroupedCount = rows.value.filter((item) => !String(item.groupId || '').trim()).length
  const dynamicGroups = groups.value.filter((item) => item.id !== '__ungrouped__')
  return [
    { id: '__all__', name: t('cloneTasks.groups.all'), taskCount: rows.value.length, system: true },
    { id: '__ungrouped__', name: t('cloneTasks.groups.ungrouped'), taskCount: ungroupedCount, system: true },
    ...dynamicGroups.map((item) => ({ id: item.id, name: item.name, taskCount: item.taskCount, system: false })),
  ]
})
const visibleGroupLimit = 4
const visibleGroupItems = computed(() => groupSidebarItems.value.slice(0, visibleGroupLimit))
const overflowGroupItems = computed(() => groupSidebarItems.value.slice(visibleGroupLimit))
const hasOverflowGroups = computed(() => overflowGroupItems.value.length > 0)
const activeOverflowGroup = computed(() => overflowGroupItems.value.find((item) => item.id === activeGroupId.value) || null)

const activeGroupLabel = computed(() => {
  const current = groupSidebarItems.value.find((item) => item.id === activeGroupId.value)
  return current?.name || t('cloneTasks.groups.all')
})

const selectedSet = computed(() => new Set(selectedIds.value))
const selectedRows = computed(() => filteredRows.value.filter((item) => selectedSet.value.has(item.id)))
const exportableSelectedCount = computed(() => selectedRows.value.filter((item) => String(item.finalOutputPath || '').trim()).length)
const subtitleEligibleSelectedRows = computed(() => selectedRows.value.filter((item) => String(item.finalOutputPath || '').trim()))
const subtitleEligibleSelectedCount = computed(() => subtitleEligibleSelectedRows.value.length)
const runningSelectedCount = computed(() => selectedRows.value.filter((item) => isRunningTask(item)).length)
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)))
const pagedRows = computed(() => {
  const page = Math.max(1, Math.min(currentPage.value, pageCount.value))
  const start = (page - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})
const allCurrentPageSelected = computed(() => pagedRows.value.length > 0 && pagedRows.value.every((item) => selectedSet.value.has(item.id)))
const currentPageStart = computed(() => {
  if (!filteredRows.value.length) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})
const currentPageEnd = computed(() => Math.min(currentPage.value * pageSize.value, filteredRows.value.length))
const visiblePageNumbers = computed(() => {
  const total = pageCount.value
  const page = Math.max(1, Math.min(currentPage.value, total))
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1)
  if (page <= 3) return [1, 2, 3, 4, 5]
  if (page >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total]
  return [page - 2, page - 1, page, page + 1, page + 2]
})

function humanStep(step?: string) {
  if (step === 'reference_analysis') return t('cloneTasks.steps.reference')
  if (step === 'script_generation') return t('cloneTasks.steps.script')
  if (step === 'identity_grid') return t('cloneTasks.steps.identity')
  if (step === 'storyboard_design') return t('cloneTasks.steps.storyboard')
  if (step === 'storyboard_videos') return t('cloneTasks.steps.videos')
  if (step === 'final_compose') return t('cloneTasks.steps.compose')
  return t('cloneTasks.steps.pending')
}

function humanStatus(status?: string) {
  const text = String(status || '').toLowerCase()
  if (text === 'draft') return t('cloneTasks.status.draft')
  if (text.includes('done') || text.includes('complete')) return t('cloneTasks.status.completed')
  if (text.includes('fail') || text.includes('error')) return t('cloneTasks.status.failed')
  if (text.includes('running') || text.includes('generating') || text === 'analyzed' || text === 'materials_ready') return t('cloneTasks.status.running')
  if (text === 'ready_for_review') return t('cloneTasks.status.review')
  return t('cloneTasks.status.running')
}

function humanRunMode(runMode?: 'auto' | 'manual') {
  return runMode === 'auto' ? t('cloneTasks.runMode.auto') : t('cloneTasks.runMode.manual')
}

function statusTone(status?: string) {
  const text = String(status || '').toLowerCase()
  if (text.includes('done') || text.includes('complete')) return 'is-success'
  if (text.includes('fail') || text.includes('error')) return 'is-danger'
  if (text === 'draft') return 'is-draft'
  return 'is-running'
}

function stepTone(step?: string) {
  if (step === 'reference_analysis') return 'tone-analyze'
  if (step === 'script_generation') return 'tone-script'
  if (step === 'identity_grid') return 'tone-storyboard'
  if (step === 'storyboard_design') return 'tone-storyboard'
  if (step === 'storyboard_videos') return 'tone-video'
  if (step === 'final_compose') return 'tone-compose'
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
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function toFileSrc(input?: string, version?: string | number) {
  const text = String(input || '').trim()
  if (!text) return ''
  if (/^(https?:|data:|vg:|file:)/i.test(text)) return text
  const versionText = String(version ?? '').trim()
  return versionText
    ? `vg://file?path=${encodeURIComponent(text)}&v=${encodeURIComponent(versionText)}`
    : `vg://file?path=${encodeURIComponent(text)}`
}

function itemPlayableVideoPath(item?: CloneProjectSummary | null) {
  if (!item) return ''
  return String(item.finalOutputPath || item.previewOutputPath || '').trim()
}

function itemHasAppliedSubtitle(item?: CloneProjectSummary | null) {
  return Boolean(item?.subtitleOverlayActive && String(item?.subtitleOutputPath || '').trim())
}

function itemCoverSrc(item: CloneProjectSummary) {
  return toFileSrc(
    item.coverAssetPath ||
      item.previewOutputPath ||
      item.finalOutputPath ||
      item.referenceVideoPath ||
      '',
  )
}

function formatTime(value?: number) {
  if (!value) return '--'
  return new Date(value).toLocaleString(locale.value)
}

function formatDateOnly(value?: number) {
  if (!value) return '--'
  return new Date(value).toLocaleDateString(locale.value)
}

function formatClockOnly(value?: number) {
  if (!value) return '--'
  const d = new Date(value)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function pseudoDurationLabel(item: CloneProjectSummary) {
  const basis = Math.max(4, Math.min(12, Number(item.generatedVideoCount || item.shotCount || 0) + 2))
  return `00:0${Math.min(9, basis)}`
}

function stepIndex(step?: string) {
  if (step === 'reference_analysis') return 0
  if (step === 'script_generation') return 1
  if (step === 'identity_grid') return 2
  if (step === 'storyboard_design') return 3
  if (step === 'storyboard_videos') return 4
  if (step === 'final_compose') return 5
  return 0
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'created_desc' ? 'created_asc' : 'created_desc'
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

function toggleSelectCurrentPage() {
  if (!pagedRows.value.length) return
  if (allCurrentPageSelected.value) {
    const currentPageIdSet = new Set(pagedRows.value.map((item) => item.id))
    selectedIds.value = selectedIds.value.filter((id) => !currentPageIdSet.has(id))
    return
  }
  const merged = new Set(selectedIds.value)
  for (const item of pagedRows.value) merged.add(item.id)
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

function togglePageSizeMenu() {
  pageSizeMenuOpen.value = !pageSizeMenuOpen.value
}

function selectPageSize(nextSize: (typeof pageSizeOptions)[number]) {
  if (pageSize.value !== nextSize) {
    pageSize.value = nextSize
    currentPage.value = 1
  }
  pageSizeMenuOpen.value = false
}

async function exportSelectedFinalVideos() {
  if (exporting.value) return
  if (!selectedIds.value.length) {
    window.alert(t('autoUi.k_ef895767d0b6'))
    return
  }
  const dir = await window.api.pickDir({ title: t('autoUi.k_202d29a7c806') })
  if (!dir) return
  exporting.value = true
  batchExportMessage.value = ''
  pushRuntimeLog(`[clone-task-list] export selected count=${selectedIds.value.length}`, 'info')
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
      ? t('autoUi.k_9d347860fb9d', { p0: exportedCount, p1: skippedCount })
      : t('autoUi.k_c9833ddf9991', { p0: exportedCount })
    pushRuntimeLog(`[clone-task-list] export completed exported=${exportedCount} skipped=${skippedCount}`, skippedCount ? 'info' : 'success')
    if (exportedCount > 0) {
      await window.api.shell.openPath(result.outputDir)
    } else {
      window.alert(t('autoUi.k_7741dce6b726'))
    }
  } catch (error: any) {
    const message = String(error?.message ?? error ?? t('autoUi.k_40d21428a00a'))
    batchExportMessage.value = message
    pushRuntimeLog(`[clone-task-list] export failed message=${safeText(message, 'unknown error')}`, 'error')
    window.alert(message)
  } finally {
    exporting.value = false
  }
}

async function refresh() {
  loading.value = true
  pushRuntimeLog('[clone-task-list] refresh list', 'info')
  try {
    rows.value = (await window.api.clone.listProjectSummaries()) as CloneProjectSummary[]
    if (cloneGroupListReady.value) {
      groups.value = (await cloneApi.listCloneGroups()) as CloneTaskGroup[]
    } else {
      groups.value = []
    }
    const availableGroupIds = new Set([
      '__all__',
      '__ungrouped__',
      ...groups.value.map((item) => String(item.id || '').trim()).filter(Boolean),
    ])
    if (!availableGroupIds.has(String(activeGroupId.value || '').trim())) {
      activeGroupId.value = '__all__'
    }
    if (videoPreviewItem.value?.id) {
      videoPreviewItem.value = rows.value.find((item) => item.id === videoPreviewItem.value?.id) || null
      if (!videoPreviewItem.value) {
        videoPreviewDialogOpen.value = false
      }
    }
    syncSelectionWithRows(rows.value)
    goToPage(currentPage.value)
    pushRuntimeLog(`[clone-task-list] refresh completed total=${rows.value.length}`, 'success')
  } finally {
    loading.value = false
  }
}

async function ensureSubtitleFeatureReady() {
  try {
    subtitleFeatureReady.value = true
    return true
  } catch {
    subtitleFeatureReady.value = false
    return false
  }
}

function resetSubtitleDialog() {
  subtitleDialogOpen.value = false
  subtitleDialogBusy.value = false
  subtitleDialogMode.value = 'batch'
  subtitleDialogTab.value = 'title'
  subtitleTargetIds.value = []
  subtitleTitleStrategy.value = 'single_for_all'
  subtitleTitleText.value = ''
  subtitleTitlePoolText.value = ''
  subtitleSelectedPreset.value = 'viral-hook'
  Object.assign(subtitleCaptionStyle, defaultSubtitleCaptionStyle())
}

function applySubtitlePreset(presetId: SubtitlePresetId) {
  const preset = subtitlePresets.value.find((item) => item.id === presetId)
  if (!preset) return
  subtitleSelectedPreset.value = preset.id
  Object.assign(subtitleCaptionStyle, defaultSubtitleCaptionStyle(), preset.style)
}

function openBatchSubtitleDialog() {
  if (!subtitleEligibleSelectedCount.value) {
    window.alert(t('autoUi.k_edebd6eca212'))
    return
  }
  applySubtitlePreset(subtitleSelectedPreset.value)
  subtitleDialogMode.value = 'batch'
  subtitleDialogTab.value = 'title'
  subtitleTargetIds.value = subtitleEligibleSelectedRows.value.map((item) => item.id)
  subtitleDialogOpen.value = true
}

function openSingleSubtitleDialog(item: CloneProjectSummary) {
  if (!String(item.finalOutputPath || '').trim()) {
    window.alert(t('autoUi.k_611c5541cc75'))
    return
  }
  applySubtitlePreset(subtitleSelectedPreset.value)
  subtitleDialogMode.value = 'single'
  subtitleDialogTab.value = 'title'
  subtitleTargetIds.value = [item.id]
  subtitleDialogOpen.value = true
}

function closeSubtitleDialog() {
  if (subtitleDialogBusy.value) return
  resetSubtitleDialog()
}

function buildSubtitleTitleConfig() {
  const pool = subtitleTitlePoolText.value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (subtitleTitleStrategy.value === 'random_pool') {
    if (!pool.length) throw new Error(t('autoUi.k_83cd75f8d97e'))
    return {
      strategy: 'random_pool' as const,
      singleText: '',
      titlePool: pool,
    }
  }
  const singleText = String(subtitleTitleText.value || '').trim()
  if (!singleText) throw new Error(t('autoUi.k_7c43db8ada86'))
  return {
    strategy: 'single_for_all' as const,
    singleText,
    titlePool: [],
  }
}

async function submitSubtitleDialog() {
  if (subtitleDialogBusy.value) return
  const targets = rows.value.filter((item) => subtitleTargetIds.value.includes(item.id) && String(item.finalOutputPath || '').trim())
  if (!targets.length) {
    window.alert(t('autoUi.k_30b14820e92b'))
    return
  }
  subtitleDialogBusy.value = true
  try {
    const ready = await ensureSubtitleFeatureReady()
    if (!ready) throw new Error(t('autoUi.k_4e5144b22529'))
    const titleConfig = buildSubtitleTitleConfig()
    const sourceItems = targets.map((item) => ({
      id: `clone-${item.id}`,
      sourceType: 'clone_final' as const,
      sourceVideoPath: String(item.finalOutputPath || '').trim(),
      sourceProjectId: item.id,
      sourceProjectTitle: item.title,
      fileName: item.title || item.referenceVideoName || item.id,
      coverImagePath: item.coverAssetPath || undefined,
    }))
    pushRuntimeLog(`[clone-task-list] subtitle submit count=${targets.length}`, 'info')
    const result = await window.api.clone.generateSubtitleVideosForProjects({
      name: t('autoUi.k_f5cd5ed7c729', { p0: new Date().toLocaleString('zh-CN') }),
      subtitleMode: 'static_title',
      subtitleSource: 'manual',
      exportEngine: 'ass_fallback',
      titleRenderMode: 'overlay_image',
      sourceItems,
      titleConfig,
      titleItems: [],
      overlayImageConfig: {
        canvasWidth: 1080,
        canvasHeight: 1920,
        ...subtitleCaptionStyle,
      },
      captionStyle: {
        ...subtitleCaptionStyle,
      },
      layoutPolicy: {
        maxLines: subtitleCaptionStyle.maxLines,
        maxWidthRatio: subtitleCaptionStyle.maxWidthRatio,
        reflowStrategy: 'balanced',
        avoidPosition: 'auto',
      },
    })
    const sourceById = new Map((result.sourceItems || []).map((item) => [item.id, item] as const))
    const targetBySourceItemId = new Map(targets.map((item) => [`clone-${item.id}`, item.id] as const))
    const appliedProjectIds = new Set<string>()
    for (const output of result.outputs || []) {
      if (output.renderStatus !== 'success' || !String(output.outputVideoPath || '').trim()) continue
      const source = sourceById.get(output.sourceItemId)
      const cloneProjectId =
        String(source?.sourceProjectId || '').trim() ||
        String(targetBySourceItemId.get(String(output.sourceItemId || '').trim()) || '').trim() ||
        String(output.sourceItemId || '')
          .trim()
          .replace(/^clone-/, '')
      if (!cloneProjectId) continue
      await window.api.clone.applySubtitleVideoToProject({
        cloneProjectId,
        subtitleVideoPath: String(output.outputVideoPath || '').trim(),
        subtitleCoverImagePath: String(output.coverImagePath || '').trim() || undefined,
      })
      appliedProjectIds.add(cloneProjectId)
    }
    await refresh()
    pushRuntimeLog(`[clone-task-list] subtitle applied count=${appliedProjectIds.size}`, 'success')
    if (!appliedProjectIds.size) {
      window.alert(t('autoUi.k_af898b777e0a'))
      return
    }
    resetSubtitleDialog()
  } catch (error: any) {
    const message = String(error?.message ?? error ?? t('autoUi.k_7666d6b95883'))
    pushRuntimeLog(`[clone-task-list] subtitle failed message=${safeText(message, 'unknown error')}`, 'error')
    window.alert(message)
  } finally {
    subtitleDialogBusy.value = false
  }
}

async function revertSubtitleFromPreview() {
  const item = videoPreviewItem.value
  if (!item?.id) return
  if (!itemHasAppliedSubtitle(item)) {
    window.alert(t('autoUi.k_21f9743c8890'))
    return
  }
  const ok = window.confirm(t('autoUi.k_3fd479589dc0'))
  if (!ok) return
  videoPreviewSaving.value = true
  try {
    await window.api.clone.revertSubtitleVideoFromProject({ cloneProjectId: item.id })
    await refresh()
    pushRuntimeLog(`[clone-task-list] subtitle reverted id=${item.id}`, 'success')
  } catch (error: any) {
    const message = String(error?.message ?? error ?? t('autoUi.k_cd66ecbed04b'))
    pushRuntimeLog(`[clone-task-list] subtitle revert failed message=${safeText(message, 'unknown error')}`, 'error')
    window.alert(message)
  } finally {
    videoPreviewSaving.value = false
  }
}

watch([query, statusFilter], () => {
  currentPage.value = 1
  pageSizeMenuOpen.value = false
})

watch(filteredRows, () => {
  if (currentPage.value > pageCount.value) {
    currentPage.value = pageCount.value
  }
})

watch(pageSize, () => {
  if (currentPage.value > pageCount.value) {
    currentPage.value = pageCount.value
  }
})

async function createTask(runModeOverride?: 'auto' | 'manual') {
  if (creating.value) return
  const nextRunMode = runModeOverride || createRunMode.value
  if (!nextRunMode) return
  creating.value = true
  pushRuntimeLog(`[clone-task-list] create task mode=${nextRunMode}`, 'info')
  try {
    const res = (await window.api.clone.createDraftProject({
      locale: 'zh-CN',
      strength: 'structure',
      runMode: nextRunMode,
    })) as { project?: { id?: string } }
    const id = String(res?.project?.id || '').trim()
    if (id) {
      pushRuntimeLog(`[clone-task-list] create task completed id=${id}`, 'success')
      if (!runModeOverride) createRunMode.value = ''
      void router.push(`/clone/${id}`)
      return
    }
    pushRuntimeLog('[clone-task-list] create task missing project id', 'error')
    console.error('[clone-task-list] create-task-missing-id', res)
  } catch (error) {
    pushRuntimeLog(`[clone-task-list] create task failed message=${safeText((error as any)?.message ?? error, 'unknown error')}`, 'error')
    console.error('[clone-task-list] create-task-error', error)
  } finally {
    creating.value = false
  }
}

async function removeTask(id: string) {
  await removeTaskWithMode(id, false)
}

async function removeTaskWithMode(id: string, force = false) {
  if (!id) return
  removingId.value = id
  pushRuntimeLog(`[clone-task-list] remove task id=${id} force=${force ? 'true' : 'false'}`, 'info')
  try {
    await window.api.clone.removeProject({ cloneProjectId: id, force })
    await refresh()
    pushRuntimeLog(`[clone-task-list] remove task completed id=${id}`, 'success')
  } finally {
    removingId.value = ''
  }
}

function isRunningTask(item: CloneProjectSummary) {
  const statusText = String(item?.status || '').trim().toLowerCase()
  return statusText.includes('running') || statusText.includes('generating') || statusText === 'analyzed' || statusText === 'materials_ready'
}

async function confirmRemoveTask(item: CloneProjectSummary) {
  if (!item?.id) return
  const title = item.title || item.id
  const running = isRunningTask(item)
  const ok = window.confirm(
    running
      ? t('autoUi.k_99c39b2e596c', { p0: title })
      : t('autoUi.k_359076513d55', { p0: title }),
  )
  if (!ok) return
  await removeTaskWithMode(item.id, running)
}

async function confirmBatchRemoveTasks() {
  if (removingId.value) return
  if (!selectedRows.value.length) {
    window.alert(t('autoUi.k_5b94c8359e3c'))
    return
  }
  const total = selectedRows.value.length
  const runningCount = runningSelectedCount.value
  const message = runningCount
    ? t('autoUi.k_341eddf3a668', { p0: total, p1: runningCount })
    : t('autoUi.k_c2fe11a9ecb4', { p0: total })
  const ok = window.confirm(message)
  if (!ok) return
  batchExportMessage.value = ''
  pushRuntimeLog(`[clone-task-list] batch remove selected count=${total} running=${runningCount}`, 'info')
  try {
    for (const item of selectedRows.value) {
      await removeTaskWithMode(item.id, isRunningTask(item))
    }
    selectedIds.value = []
    pushRuntimeLog(`[clone-task-list] batch remove completed count=${total}`, 'success')
  } catch (error: any) {
    const messageText = String(error?.message ?? error ?? t('autoUi.k_b59edb270d91'))
    pushRuntimeLog(`[clone-task-list] batch remove failed message=${safeText(messageText, 'unknown error')}`, 'error')
    window.alert(messageText)
  }
}

function openRenameDialog(item: CloneProjectSummary) {
  if (!item?.id) return
  renamingId.value = item.id
  renameDraft.value = String(item.title || '').trim()
  renameDialogOpen.value = true
}

function closeRenameDialog() {
  if (savingRename.value) return
  renameDialogOpen.value = false
  renamingId.value = ''
  renameDraft.value = ''
}

async function submitRename() {
  const cloneProjectId = String(renamingId.value || '').trim()
  const title = String(renameDraft.value || '').trim()
  if (!cloneProjectId) return
  if (!title) {
    window.alert(t('autoUi.k_95b1ba060985'))
    return
  }
  savingRename.value = true
  try {
    await window.api.clone.updateProjectMeta({ cloneProjectId, title })
    await refresh()
    closeRenameDialog()
  } catch (error: any) {
    window.alert(t('autoUi.k_9910887469a0', { p0: String(error?.message ?? error ?? t('autoUi.k_5f76edc5de7b')) }))
  } finally {
    savingRename.value = false
  }
}

function openCreateGroupDialog() {
  if (!cloneGroupCreateReady.value) return
  groupMenuOpenId.value = ''
  groupDialogMode.value = 'create'
  groupDraft.value = ''
  editingGroupId.value = ''
  movingProjectIds.value = []
  moveTargetGroupId.value = ''
  groupDialogOpen.value = true
}

async function renameGroupByPrompt(group: CloneTaskGroup) {
  if (!group?.id || group.id === '__ungrouped__' || !cloneGroupRenameReady.value) return
  const name = String(window.prompt(t('autoUi.k_e877b7afbc3e'), String(group.name || '').trim()) || '').trim()
  if (!name) return
  try {
    groupMenuOpenId.value = ''
    await cloneApi.renameCloneGroup({ groupId: group.id, name })
    await refresh()
  } catch (error: any) {
    window.alert(String(error?.message ?? error ?? t('autoUi.k_e007e1f404fc')))
  }
}

function openRenameGroupDialog(group: CloneTaskGroup) {
  if (!group?.id || group.id === '__ungrouped__' || !cloneGroupRenameReady.value) return
  groupMenuOpenId.value = ''
  groupDialogMode.value = 'rename'
  groupDraft.value = String(group.name || '').trim()
  editingGroupId.value = group.id
  movingProjectIds.value = []
  moveTargetGroupId.value = ''
  groupDialogOpen.value = true
}

function openMoveSingleDialog(item: CloneProjectSummary) {
  if (!item?.id) return
  if (!hasCloneGroupApi('assignCloneProjectsToGroup')) return
  rowMoveMenuOpenId.value = item.id
  groupDialogMode.value = 'move_single'
  movingProjectIds.value = [item.id]
  moveTargetGroupId.value = String(item.groupId || '').trim() || '__ungrouped__'
  groupDraft.value = ''
  editingGroupId.value = ''
  groupDialogOpen.value = true
}

function openMoveBatchDialog() {
  if (!hasCloneGroupApi('assignCloneProjectsToGroup')) return
  if (!selectedIds.value.length) {
    window.alert(t('autoUi.k_e0461d4f37a4'))
    return
  }
  groupDialogMode.value = 'move_batch'
  movingProjectIds.value = [...selectedIds.value]
  moveTargetGroupId.value = '__ungrouped__'
  groupDraft.value = ''
  editingGroupId.value = ''
  groupDialogOpen.value = true
}

function closeGroupDialog() {
  if (savingGroup.value) return
  groupDialogOpen.value = false
  groupDialogMode.value = 'create'
  groupDraft.value = ''
  editingGroupId.value = ''
  movingProjectIds.value = []
  moveTargetGroupId.value = ''
}

function toggleGroupMenu(groupId: string) {
  if (!groupId) return
  groupMenuOpenId.value = groupMenuOpenId.value === groupId ? '' : groupId
}

function toggleRowMoveMenu(projectId: string) {
  if (!projectId) return
  rowMoveMenuOpenId.value = rowMoveMenuOpenId.value === projectId ? '' : projectId
}

function toggleRowActionMenu(projectId: string) {
  if (!projectId) return
  rowActionMenuOpenId.value = rowActionMenuOpenId.value === projectId ? '' : projectId
}

async function assignProjectToGroup(projectId: string, groupId?: string) {
  const cloneProjectId = String(projectId || '').trim()
  if (!cloneProjectId || assigningProjectId.value) return
  if (!hasCloneGroupApi('assignCloneProjectsToGroup')) return
  assigningProjectId.value = cloneProjectId
  try {
    await cloneApi.assignCloneProjectsToGroup({
      cloneProjectIds: [cloneProjectId],
      groupId: groupId ? String(groupId).trim() : undefined,
    })
    rowMoveMenuOpenId.value = ''
    rowActionMenuOpenId.value = ''
    await refresh()
  } catch (error: any) {
    window.alert(String(error?.message ?? error ?? t('autoUi.k_4f0a25b5ebe5')))
  } finally {
    assigningProjectId.value = ''
  }
}

async function submitGroupDialog() {
  savingGroup.value = true
  try {
    if (groupDialogMode.value === 'create') {
      if (!hasCloneGroupApi('createCloneGroup')) return
      const name = String(groupDraft.value || '').trim()
      if (!name) {
        window.alert(t('autoUi.k_c8f0c4c18bb0'))
        return
      }
      await cloneApi.createCloneGroup({ name })
    } else if (groupDialogMode.value === 'rename') {
      if (!hasCloneGroupApi('renameCloneGroup')) return
      const groupId = String(editingGroupId.value || '').trim()
      const name = String(groupDraft.value || '').trim()
      if (!groupId) return
      if (!name) {
        window.alert(t('autoUi.k_c8f0c4c18bb0'))
        return
      }
      await cloneApi.renameCloneGroup({ groupId, name })
    } else {
      if (!hasCloneGroupApi('assignCloneProjectsToGroup')) return
      const groupId = moveTargetGroupId.value === '__ungrouped__' ? undefined : String(moveTargetGroupId.value || '').trim() || undefined
      if (!movingProjectIds.value.length) return
      await cloneApi.assignCloneProjectsToGroup({
        cloneProjectIds: movingProjectIds.value,
        groupId,
      })
    }
    await refresh()
    closeGroupDialog()
  } catch (error: any) {
    window.alert(String(error?.message ?? error ?? t('autoUi.k_09e424b5e896')))
  } finally {
    savingGroup.value = false
  }
}

async function confirmRemoveGroup(group: CloneTaskGroup) {
  if (!group?.id || group.id === '__ungrouped__') return
  if (!cloneGroupRemoveReady.value) return
  const ok = window.confirm(t('autoUi.k_c751ada771d4', { p0: group.name }))
  if (!ok) return
  try {
    groupMenuOpenId.value = ''
    await cloneApi.removeCloneGroup({ groupId: group.id })
    if (activeGroupId.value === group.id) activeGroupId.value = '__ungrouped__'
    await refresh()
  } catch (error: any) {
    window.alert(String(error?.message ?? error ?? t('autoUi.k_3e61ca4d78d6')))
  }
}

function openTask(id: string) {
  if (!id) return
  void router.push(`/clone/${id}`)
}

function openVideoPreview(item: CloneProjectSummary) {
  if (!itemPlayableVideoPath(item)) {
    openTask(item.id)
    return
  }
  videoPreviewItem.value = item
  videoPreviewDialogOpen.value = true
}

function closeVideoPreview() {
  if (videoPreviewSaving.value) return
  videoPreviewDialogOpen.value = false
  videoPreviewItem.value = null
}

async function savePreviewVideo() {
  const sourcePath = itemPlayableVideoPath(videoPreviewItem.value)
  if (!sourcePath || videoPreviewSaving.value) return
  videoPreviewSaving.value = true
  try {
    const result = await window.api.saveFileAs({
      sourcePath,
      defaultFileName: sourcePath.split(/[\\/]/).pop() || 'video.mp4',
      title: t('autoUi.k_c9c7b18b7dc3'),
    })
    if (result?.ok && !result?.canceled) {
      pushRuntimeLog(`[clone-task-list] save preview video success path=${safeText(result.filePath, '')}`, 'success')
    }
  } catch (error: any) {
    const message = String(error?.message ?? error ?? t('autoUi.k_48e14333c941'))
    pushRuntimeLog(`[clone-task-list] save preview video failed message=${safeText(message, 'unknown error')}`, 'error')
    window.alert(message)
  } finally {
    videoPreviewSaving.value = false
  }
}

async function revealPreviewVideo() {
  const sourcePath = itemPlayableVideoPath(videoPreviewItem.value)
  if (!sourcePath) return
  await window.api.shell.showItemInFolder(sourcePath)
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

function handlePointerDown(event: Event) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.clone-group-menu')) groupMenuOpenId.value = ''
  if (!target?.closest('.clone-row-move-menu')) rowMoveMenuOpenId.value = ''
  if (!target?.closest('.clone-row-action-menu')) rowActionMenuOpenId.value = ''
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  offRuntimeLog = window.api.clone.onRuntimeLog?.((payload) => {
    const message = safeText(payload?.message ?? payload, '')
    if (!message) return
    const level = payload?.level === 'error' || payload?.level === 'success' ? payload.level : 'info'
    pushRuntimeLog(message, level)
  })
  void ensureSubtitleFeatureReady()
  void refresh()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  offRuntimeLog?.()
  offRuntimeLog = undefined
})
</script>

<template>
  <div class="clone-task-list-page">
    <section class="clone-task-list-shell">
      <div class="clone-task-list-main">
        <section class="clone-console-panel">
          <header class="clone-console-hero">
            <div class="clone-console-hero__copy">
              <div class="clone-console-hero__title-row">
                <h1>{{ t('cloneTasks.title') }}</h1>
                <span class="clone-console-hero__spark">✦</span>
              </div>
              <p>{{ t('cloneTasks.desc') }}</p>
            </div>

            <div class="clone-console-hero__actions">
              <UiButton class="clone-console-hero__button" variant="secondary" :disabled="exporting || !selectedIds.length" @click="exportSelectedFinalVideos">
                {{ exporting ? t('cloneTasks.actions.exporting') : t('cloneTasks.actions.batchExport') }}
              </UiButton>
              <div class="clone-console-run-mode">
                <button class="clone-console-run-mode__option" :class="{ 'is-active': createRunMode === 'auto' }" type="button" @click="createRunMode = 'auto'">
                  {{ t('cloneTasks.runMode.auto') }}
                </button>
                <button class="clone-console-run-mode__option" :class="{ 'is-active': createRunMode === 'manual' }" type="button" @click="createRunMode = 'manual'">
                  {{ t('cloneTasks.runMode.manual') }}
                </button>
              </div>
              <UiButton class="clone-console-hero__button clone-console-hero__button--primary" :disabled="creating || !createRunMode" @click="createTask">
                <Plus class="h-4 w-4" />
                {{ creating ? t('cloneTasks.actions.creating') : t('cloneTasks.actions.create') }}
              </UiButton>
            </div>
          </header>

          <section class="clone-console-overview">
            <div class="clone-console-overview__cards">
              <button
                v-for="card in overviewCards"
                :key="card.key"
                type="button"
                class="clone-console-stat"
                :class="[`tone-${card.tone}`, { 'is-active': statusFilter === card.key || (card.key === 'pending-output' && statusFilter === 'all') }]"
                @click="statusFilter = card.key === 'pending-output' ? 'all' : card.key"
              >
                <span class="clone-console-stat__icon">
                  <component :is="card.icon" class="h-4 w-4" />
                </span>
                <div class="clone-console-stat__copy">
                  <strong>{{ card.label }}</strong>
                  <span>{{ card.helper }}</span>
                </div>
                <b>{{ card.value }}</b>
              </button>
            </div>
          </section>
        </section>

        <div v-if="selectedIds.length || batchExportMessage" class="clone-list-batch-bar">
          <div class="clone-list-batch-bar__summary">
            <strong>{{ t('cloneTasks.selectedCount', { count: selectedIds.length }) }}</strong>
            <div class="clone-list-batch-bar__stats">
              <span class="clone-list-batch-bar__stat">
                <em>{{ exportableSelectedCount }}</em>
                <small>{{ t('cloneTasks.selection.exportable') }}</small>
              </span>
              <span class="clone-list-batch-bar__stat">
                <em>{{ subtitleEligibleSelectedCount }}</em>
                <small>{{ t('cloneTasks.selection.subtitleReady') }}</small>
              </span>
            </div>
          </div>
          <div class="clone-list-batch-bar__actions">
            <button
              v-if="selectedIds.length"
              class="clone-list-batch-action clone-list-batch-action--danger"
              type="button"
              :disabled="Boolean(removingId)"
              @click="confirmBatchRemoveTasks"
            >
              {{ removingId ? t('cloneTasks.actions.deleting') : t('cloneTasks.actions.batchDelete') }}
            </button>
            <button
              v-if="selectedIds.length"
              class="clone-list-batch-action"
              type="button"
              :disabled="exporting"
              @click="exportSelectedFinalVideos"
            >
              {{ exporting ? t('cloneTasks.actions.exporting') : t('cloneTasks.actions.exportFinals') }}
            </button>
            <button v-if="selectedIds.length && cloneGroupAssignReady" class="clone-list-batch-action" type="button" @click="openMoveBatchDialog">{{ t('cloneTasks.actions.moveToGroup') }}</button>
            <button
              v-if="subtitleFeatureReady && subtitleEligibleSelectedCount"
              class="clone-list-batch-action clone-list-batch-action--accent"
              type="button"
              @click="openBatchSubtitleDialog"
            >
              {{ t('cloneTasks.actions.batchSubtitle') }}
            </button>
            <span v-if="batchExportMessage" class="clone-list-batch-bar__message">{{ batchExportMessage }}</span>
          </div>
        </div>

        <section class="clone-console-table">
          <div class="clone-console-table__groupbar">
            <div class="clone-console-table__groupbar-tabs">
              <div
                v-for="group in visibleGroupItems"
                :key="group.id"
                class="clone-console-group"
                :class="{ 'is-active': activeGroupId === group.id }"
              >
                <button type="button" class="clone-console-group__main" @click="activeGroupId = group.id as any">
                  <span>{{ group.name }}</span>
                  <em>{{ group.taskCount }}</em>
                </button>
                <div v-if="!group.system && (cloneGroupRenameReady || cloneGroupRemoveReady)" class="clone-group-menu">
                  <button type="button" class="clone-console-group__more" :aria-label="t('cloneTasks.actions.more')" @click.stop="toggleGroupMenu(group.id)">
                    <MoreHorizontal class="h-3.5 w-3.5" />
                  </button>
                  <div v-if="groupMenuOpenId === group.id" class="clone-group-menu__dropdown">
                    <button v-if="cloneGroupRenameReady" type="button" class="clone-group-menu__item" @click.stop="openRenameGroupDialog(group as CloneTaskGroup)">{{ t('cloneTasks.actions.rename') }}</button>
                    <button v-if="cloneGroupRemoveReady" type="button" class="clone-group-menu__item clone-group-menu__item--danger" @click.stop="confirmRemoveGroup(group as CloneTaskGroup)">{{ t('cloneTasks.actions.delete') }}</button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="hasOverflowGroups" class="clone-console-group clone-console-group--overflow" :class="{ 'is-active': Boolean(activeOverflowGroup) }">
              <button type="button" class="clone-console-group__main" @click.stop="toggleGroupMenu('__overflow__')">
                <span>{{ activeOverflowGroup ? activeOverflowGroup.name : t('cloneTasks.groups.more') }}</span>
                <em>{{ activeOverflowGroup ? activeOverflowGroup.taskCount : overflowGroupItems.length }}</em>
              </button>
              <div class="clone-group-menu">
                <button type="button" class="clone-console-group__more" :aria-label="t('autoUi.k_02965f90784d')" @click.stop="toggleGroupMenu('__overflow__')">
                  <MoreHorizontal class="h-3.5 w-3.5" />
                </button>
                <div v-if="groupMenuOpenId === '__overflow__'" class="clone-group-menu__dropdown">
                  <button
                    v-for="group in overflowGroupItems"
                    :key="`overflow-${group.id}`"
                    type="button"
                    class="clone-group-menu__item"
                    :class="{ 'is-active': activeGroupId === group.id }"
                    @click.stop="activeGroupId = group.id as any; groupMenuOpenId = ''"
                  >
                    <span>{{ group.name }}</span>
                    <em>{{ group.taskCount }}</em>
                  </button>
                </div>
              </div>
            </div>

            <div class="clone-console-table__groupbar-tools">
              <button v-if="cloneGroupCreateReady" type="button" class="clone-console-group__create" @click="openCreateGroupDialog">
                <Plus class="h-3.5 w-3.5" />
                <span>{{ t('cloneTasks.groups.create') }}</span>
              </button>
              <button class="clone-console-overview__tool" type="button" @click="toggleSortOrder">
                {{ sortOrder === 'created_desc' ? t('cloneTasks.sort.newest') : t('cloneTasks.sort.oldest') }}
                <ChevronDown class="h-4 w-4" />
              </button>
              <button class="clone-console-overview__tool" type="button">
                {{ t('cloneTasks.allMaterials') }}
                <ChevronDown class="h-4 w-4" />
              </button>
              <button class="clone-console-overview__icon" type="button" :aria-label="t('autoUi.k_a6156a9057ee')" @click="toggleSelectCurrentPage">
                <span class="clone-console-overview__icon-bars"></span>
              </button>
              <button
                class="clone-console-table__viewtool"
                :class="{ 'is-active': viewMode === 'list' }"
                type="button"
                :aria-label="t('autoUi.k_1fd2104d08a1')"
                @click="viewMode = 'list'"
              >
                <span class="clone-console-table__viewtool-bars"></span>
              </button>
              <button
                class="clone-console-table__viewtool"
                :class="{ 'is-active': viewMode === 'grid' }"
                type="button"
                :aria-label="t('autoUi.k_63a3454ede3c')"
                @click="viewMode = 'grid'"
              >
                <span class="clone-console-table__viewtool-grid"></span>
              </button>
              <button class="clone-console-table__viewtool" type="button" :aria-label="t('autoUi.k_7debf9cb0372')">
                <span class="clone-console-table__viewtool-dot"></span>
              </button>
            </div>
          </div>

          <div v-if="filteredRows.length && viewMode === 'list'" class="clone-console-table__body">
            <div class="clone-console-table__head">
              <label class="clone-console-table__check" :aria-label="t('autoUi.k_a6156a9057ee')">
                <input
                  type="checkbox"
                  :checked="allCurrentPageSelected"
                  @change="toggleSelectCurrentPage"
                />
                <span></span>
              </label>
              <span class="clone-console-table__headcell">{{ t('cloneTasks.columns.preview') }}</span>
              <span class="clone-console-table__headcell">{{ t('cloneTasks.columns.task') }}</span>
              <span class="clone-console-table__headcell">{{ t('cloneTasks.columns.stage') }}</span>
              <span class="clone-console-table__headcell">{{ t('cloneTasks.columns.materials') }}</span>
              <span class="clone-console-table__headcell">{{ t('cloneTasks.columns.progress') }}</span>
              <span class="clone-console-table__headcell">{{ t('cloneTasks.columns.updated') }}</span>
              <span class="clone-console-table__headcell">{{ t('cloneTasks.columns.actions') }}</span>
            </div>

            <article v-for="item in pagedRows" :key="item.id" class="clone-console-row">
              <label class="clone-console-row__check">
                <input
                  type="checkbox"
                  :checked="selectedSet.has(item.id)"
                  @change="toggleSelected(item.id)"
                />
                <span></span>
              </label>

              <div class="clone-console-row__preview">
                <div class="clone-console-row__thumb" :data-duration="pseudoDurationLabel(item)">
                  <img v-if="itemCoverSrc(item)" :src="itemCoverSrc(item)" :alt="item.title" />
                  <div v-else class="clone-console-row__thumb-empty">
                    <Video class="h-5 w-5" />
                  </div>
                </div>
              </div>

              <div class="clone-console-row__task">
                <div class="clone-console-row__titleline">
                  <h3>{{ item.title }}</h3>
                  <button class="clone-console-row__rename" type="button" :aria-label="t('autoUi.k_29f5ec945b98')" @click="openRenameDialog(item)">
                    <Pencil class="h-3.5 w-3.5" />
                  </button>
                </div>
                <div class="clone-console-row__meta">
                  <span class="clone-console-row__mode">{{ humanRunMode(item.runMode) }}</span>
                  <span class="clone-console-row__dot"></span>
                  <span class="clone-console-row__text">{{ item.selectedModelIdentityName || '--' }}</span>
                  <span class="clone-console-row__dot"></span>
                  <span class="clone-console-row__text">Ref {{ shortPath(item.referenceVideoName || item.referenceVideoPath) }}</span>
                </div>
                <div v-if="item.lastError" class="clone-console-row__error">
                  <span class="clone-console-row__error-text">{{ compactError(item.lastError, 72) }}</span>
                  <button class="clone-console-row__error-link" type="button" @click.stop="openErrorDialog(item)">{{ t('cloneTasks.actions.viewError') }}</button>
                </div>
              </div>

              <div class="clone-console-row__stage">
                <div class="clone-console-row__statuswrap">
                  <span class="clone-console-row__status" :class="statusTone(item.status)">{{ humanStatus(item.status) }}</span>
                  <span class="clone-console-row__stepbadge" :class="stepTone(item.currentStep)">{{ humanStep(item.currentStep) }}</span>
                </div>
                <div v-if="cloneGroupAssignReady" class="clone-row-move-menu clone-row-move-menu--inline">
                  <button class="clone-console-row__groupmove" type="button" @click.stop="toggleRowMoveMenu(item.id)">
                    <span>{{ item.groupName || t('cloneTasks.actions.moveToGroup') }}</span>
                    <ChevronDown class="h-3.5 w-3.5" />
                  </button>
                  <div v-if="rowMoveMenuOpenId === item.id" class="clone-row-move-menu__dropdown">
                    <button
                      type="button"
                      class="clone-row-move-menu__item"
                      :class="{ 'is-active': !item.groupId }"
                      :disabled="assigningProjectId === item.id"
                      @click.stop="assignProjectToGroup(item.id)"
                    >
                      {{ t('cloneTasks.groups.ungrouped') }}
                    </button>
                    <button
                      v-for="group in groups.filter((entry) => entry.id !== '__ungrouped__')"
                      :key="`${item.id}-${group.id}`"
                      type="button"
                      class="clone-row-move-menu__item"
                      :class="{ 'is-active': item.groupId === group.id }"
                      :disabled="assigningProjectId === item.id"
                      @click.stop="assignProjectToGroup(item.id, group.id)"
                    >
                      {{ group.name }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="clone-console-row__assets">
                <strong>{{ t('cloneTasks.materialCount', { images: item.productReferenceImageCount, videos: item.generatedVideoCount || 0 }) }}</strong>
                <span>{{ item.finalOutputPath ? 'Output Ready' : 'Output Pending' }}</span>
              </div>

              <div class="clone-console-row__progress">
                <div class="clone-console-row__progress-copy">
                  <strong>{{ item.progressPercent }}%</strong>
                </div>
                <div class="clone-console-row__progress-track">
                  <span :style="{ width: `${item.progressPercent}%` }"></span>
                </div>
                <div class="clone-console-row__progress-steps">
                  <span
                    v-for="(_, index) in 5"
                    :key="`${item.id}-${index}`"
                    class="clone-console-row__progress-step"
                    :class="{ 'is-active': index === Math.max(0, Math.min(4, stepIndex(item.currentStep))), 'is-done': index < stepIndex(item.currentStep) }"
                  >
                    {{ index + 1 }}
                  </span>
                </div>
              </div>

              <div class="clone-console-row__updated">
                <Clock3 class="h-4 w-4" />
                <div class="clone-console-row__updated-copy">
                  <span>{{ formatDateOnly(item.updatedAt) }}</span>
                  <strong>{{ formatClockOnly(item.updatedAt) }}</strong>
                </div>
              </div>

              <div class="clone-console-row__actions">
                <button class="clone-console-row__action clone-console-row__action--edit" type="button" :title="t('autoUi.k_67659ba581ad')" @click="openTask(item.id)">
                  <Pencil class="h-4 w-4" />
                </button>
                <button class="clone-console-row__action clone-console-row__action--play" type="button" @click="openVideoPreview(item)">
                  <Play class="h-4 w-4" />
                </button>
                <button class="clone-console-row__action clone-console-row__action--danger" type="button" :disabled="removingId === item.id" @click="confirmRemoveTask(item)">
                  <Trash2 class="h-4 w-4" />
                </button>
                <div class="clone-row-action-menu">
                  <button class="clone-console-row__action" type="button" :aria-label="t('autoUi.k_77836d3a9942')" @click.stop="toggleRowActionMenu(item.id)">
                    <MoreHorizontal class="h-4 w-4" />
                  </button>
                  <div v-if="rowActionMenuOpenId === item.id" class="clone-group-menu__dropdown clone-row-action-menu__dropdown">
                    <button type="button" class="clone-group-menu__item" @click.stop="openRenameDialog(item)">{{ t('cloneTasks.actions.rename') }}</button>
                    <button type="button" class="clone-group-menu__item clone-group-menu__item--danger" @click.stop="confirmRemoveTask(item)">{{ t('cloneTasks.actions.delete') }}</button>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div v-else-if="filteredRows.length && viewMode === 'grid'" class="clone-console-grid">
            <article v-for="item in pagedRows" :key="item.id" class="clone-console-card">
              <div class="clone-console-card__head">
                <label class="clone-console-row__check">
                  <input
                    type="checkbox"
                    :checked="selectedSet.has(item.id)"
                    @change="toggleSelected(item.id)"
                  />
                  <span></span>
                </label>
                <span class="clone-console-row__status" :class="statusTone(item.status)">{{ humanStatus(item.status) }}</span>
              </div>

              <button class="clone-console-card__preview" type="button" @click="openVideoPreview(item)">
                <img v-if="itemCoverSrc(item)" :src="itemCoverSrc(item)" :alt="item.title" />
                <div v-else class="clone-console-row__thumb-empty">
                  <Video class="h-5 w-5" />
                </div>
              </button>

              <div class="clone-console-card__body">
                <div class="clone-console-row__titleline">
                  <h3>{{ item.title }}</h3>
                  <button class="clone-console-row__rename" type="button" :aria-label="t('autoUi.k_29f5ec945b98')" @click="openRenameDialog(item)">
                    <Pencil class="h-3.5 w-3.5" />
                  </button>
                </div>
                <div class="clone-console-row__meta">
                  <span class="clone-console-row__mode">{{ humanRunMode(item.runMode) }}</span>
                  <span class="clone-console-row__dot"></span>
                  <span class="clone-console-row__text">{{ item.selectedModelIdentityName || '--' }}</span>
                </div>
                <div class="clone-console-row__stage">
                  <span class="clone-console-row__stepbadge" :class="stepTone(item.currentStep)">{{ humanStep(item.currentStep) }}</span>
                  <span class="clone-console-row__text">Ref {{ shortPath(item.referenceVideoName || item.referenceVideoPath) }}</span>
                </div>
                <div class="clone-console-row__assets">
                  <strong>{{ t('cloneTasks.materialCount', { images: item.productReferenceImageCount, videos: item.generatedVideoCount || 0 }) }}</strong>
                  <span>{{ item.finalOutputPath ? 'Output Ready' : 'Output Pending' }}</span>
                </div>
                <div v-if="item.lastError" class="clone-console-row__error">
                  <span class="clone-console-row__error-text">{{ compactError(item.lastError, 72) }}</span>
                  <button class="clone-console-row__error-link" type="button" @click.stop="openErrorDialog(item)">{{ t('cloneTasks.actions.viewError') }}</button>
                </div>
              </div>

              <div class="clone-console-card__footer">
                <div class="clone-console-row__progress">
                  <div class="clone-console-row__progress-copy">
                    <strong>{{ item.progressPercent }}%</strong>
                  </div>
                  <div class="clone-console-row__progress-track">
                    <span :style="{ width: `${item.progressPercent}%` }"></span>
                  </div>
                </div>
                <div class="clone-console-row__updated">
                  <Clock3 class="h-4 w-4" />
                  <div class="clone-console-row__updated-copy">
                    <span>{{ formatDateOnly(item.updatedAt) }}</span>
                    <strong>{{ formatClockOnly(item.updatedAt) }}</strong>
                  </div>
                </div>
              </div>

              <div class="clone-console-card__actions">
                <button class="clone-console-row__action clone-console-row__action--edit" type="button" :title="t('autoUi.k_67659ba581ad')" @click="openTask(item.id)">
                  <Pencil class="h-4 w-4" />
                </button>
                <button class="clone-console-row__action clone-console-row__action--play" type="button" @click="openVideoPreview(item)">
                  <Play class="h-4 w-4" />
                </button>
                <button class="clone-console-row__action clone-console-row__action--danger" type="button" :disabled="removingId === item.id" @click="confirmRemoveTask(item)">
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            </article>
          </div>
          <div v-else class="clone-list-empty">
            <LoaderCircle v-if="loading" class="h-5 w-5 is-spinning" />
            <Wand2 v-else class="h-5 w-5" />
            <strong>{{ loading ? t('cloneTasks.empty.loading') : t('cloneTasks.empty.title') }}</strong>
            <span>{{ loading ? t('cloneTasks.empty.wait') : t('cloneTasks.empty.desc') }}</span>
          </div>

          <div class="clone-list-pagination">
            <span class="clone-list-pagination__summary">{{ t('cloneTasks.pagination.summary', { count: filteredRows.length, start: currentPageStart, end: currentPageEnd }) }}</span>
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
              <div class="clone-list-page-size-wrap">
                <button type="button" class="clone-list-page-size" :aria-expanded="pageSizeMenuOpen" @click="togglePageSizeMenu">
                  {{ pageSize }} {{ t('autoUi.k_2189643c968f') }} <ChevronDown class="h-3.5 w-3.5" />
                </button>
                <div v-if="pageSizeMenuOpen" class="clone-list-page-size-menu">
                  <button
                    v-for="option in pageSizeOptions"
                    :key="option"
                    type="button"
                    :class="{ 'is-active': pageSize === option }"
                    @click="selectPageSize(option)"
                  >
                    {{ option }} {{ t('autoUi.k_2189643c968f') }} </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>

    <div v-if="errorDialogOpen" class="clone-error-dialog-mask" @click.self="closeErrorDialog">
      <div class="clone-error-dialog" @click.stop>
        <div class="clone-error-dialog__head">
          <div class="clone-error-dialog__copy">
            <strong>{{ t('autoUi.k_6bd471fe24ae') }}</strong>
            <span>{{ errorDialogTitle }}</span>
          </div>
          <UiButton variant="ghost" @click="closeErrorDialog">{{ t('autoUi.k_6c14bd7f6f9e') }}</UiButton>
        </div>
        <div class="clone-error-dialog__body">
          {{ errorDialogMessage }}
        </div>
      </div>
    </div>

    <div v-if="renameDialogOpen" class="clone-error-dialog-mask" @click.self="closeRenameDialog">
      <div class="clone-error-dialog clone-rename-dialog" @click.stop>
        <div class="clone-error-dialog__head">
          <div class="clone-error-dialog__copy">
            <strong>{{ t('autoUi.k_29f5ec945b98') }}</strong>
            <span>{{ t('autoUi.k_cf099d4c47c6') }}</span>
          </div>
          <UiButton variant="ghost" :disabled="savingRename" @click="closeRenameDialog">{{ t('autoUi.k_6c14bd7f6f9e') }}</UiButton>
        </div>
        <div class="clone-rename-dialog__body">
          <label class="clone-rename-dialog__field">
            <span>{{ t('autoUi.k_2e3046989973') }}</span>
            <input v-model.trim="renameDraft" type="text" maxlength="80" :placeholder="t('autoUi.k_5169b9ecce30')" @keydown.enter.prevent="submitRename" />
          </label>
          <div class="clone-rename-dialog__actions">
            <UiButton variant="secondary" :disabled="savingRename" @click="closeRenameDialog">{{ t('autoUi.k_4d0b4688c787') }}</UiButton>
            <UiButton :disabled="savingRename || !renameDraft.trim()" @click="submitRename">
              {{ savingRename ? t('autoUi.k_d70d425039f2') : t('autoUi.k_fadf24dbc5a9') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="videoPreviewDialogOpen && videoPreviewItem" class="clone-error-dialog-mask" @click.self="closeVideoPreview">
      <div class="clone-error-dialog clone-video-preview-dialog" @click.stop>
        <div class="clone-error-dialog__head">
          <div class="clone-error-dialog__copy">
            <strong>{{ videoPreviewItem.title || t('autoUi.k_891a69798937') }}</strong>
            <span>{{ safeText(shortPath(itemPlayableVideoPath(videoPreviewItem)), t('autoUi.k_b31b6e8ace7e')) }}</span>
          </div>
          <div class="clone-video-preview-dialog__head-actions">
            <UiButton variant="ghost" :disabled="videoPreviewSaving" @click="closeVideoPreview">{{ t('autoUi.k_6c14bd7f6f9e') }}</UiButton>
          </div>
        </div>
        <div class="clone-video-preview-dialog__body">
          <div class="clone-video-preview-dialog__player">
            <video
              v-if="itemPlayableVideoPath(videoPreviewItem)"
              :src="toFileSrc(itemPlayableVideoPath(videoPreviewItem), videoPreviewItem.updatedAt)"
              controls
              preload="metadata"
              autoplay
            ></video>
            <div v-else class="clone-video-preview-dialog__empty">{{ t('autoUi.k_7422247d9267') }}</div>
          </div>
          <div class="clone-video-preview-dialog__meta">
            <div class="clone-video-preview-dialog__meta-copy">
              <span>{{ t('autoUi.k_2b43bab7b2d0') }}{{ videoPreviewItem.selectedModelIdentityName || t('autoUi.k_9e035909e964') }}</span>
              <span>{{ t('autoUi.k_32d77333df9b') }}{{ formatTime(videoPreviewItem.updatedAt) }}</span>
            </div>
          </div>
          <div class="clone-rename-dialog__actions clone-video-preview-dialog__actions">
            <UiButton variant="secondary" :disabled="!itemPlayableVideoPath(videoPreviewItem)" @click="revealPreviewVideo">{{ t('autoUi.k_1213bb4b8d53') }}</UiButton>
            <UiButton variant="secondary" :disabled="!itemPlayableVideoPath(videoPreviewItem) || videoPreviewSaving" @click="savePreviewVideo">
              {{ videoPreviewSaving ? t('autoUi.k_d70d425039f2') : t('autoUi.k_1ec4db03f027') }}
            </UiButton>
            <UiButton
              v-if="subtitleFeatureReady && !itemHasAppliedSubtitle(videoPreviewItem)"
              class="clone-video-preview-dialog__subtitle-button"
              variant="secondary"
              :disabled="!itemPlayableVideoPath(videoPreviewItem) || videoPreviewSaving"
              @click="openSingleSubtitleDialog(videoPreviewItem)"
            > {{ t('autoUi.k_6e4c3e5ffee8') }} </UiButton>
            <UiButton
              v-if="itemHasAppliedSubtitle(videoPreviewItem)"
              class="clone-video-preview-dialog__revert-button"
              variant="secondary"
              :disabled="videoPreviewSaving"
              @click="revertSubtitleFromPreview"
            >
              {{ videoPreviewSaving ? t('autoUi.k_ecd814390988') : t('autoUi.k_5d2a55f19c91') }}
            </UiButton>
            <UiButton :disabled="!videoPreviewItem.id" @click="openTask(videoPreviewItem.id)">{{ t('autoUi.k_0d428278d9d4') }}</UiButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="subtitleDialogOpen" class="clone-error-dialog-mask" @click.self="closeSubtitleDialog">
      <div class="clone-error-dialog clone-rename-dialog clone-subtitle-dialog" @click.stop>
        <div class="clone-error-dialog__head clone-subtitle-dialog__head">
          <div class="clone-error-dialog__copy clone-subtitle-dialog__copy">
            <strong>{{ subtitleDialogMode === 'batch' ? t('autoUi.k_c6f0209a1cfa') : t('autoUi.k_6e4c3e5ffee8') }}</strong>
            <span>{{ t('autoUi.k_b7a385ec00d6') }} {{ subtitleTargetIds.length }} {{ t('autoUi.k_23be11c82f2f') }}</span>
          </div>
          <UiButton variant="ghost" :disabled="subtitleDialogBusy" @click="closeSubtitleDialog">{{ t('autoUi.k_6c14bd7f6f9e') }}</UiButton>
        </div>
        <div class="clone-rename-dialog__body clone-subtitle-dialog__body">
          <div class="clone-subtitle-dialog__summary">
            <div class="clone-subtitle-dialog__summary-item">
              <span>{{ t('autoUi.k_11a2736ed3c4') }}</span>
              <strong>{{ subtitleDialogMode === 'batch' ? t('autoUi.k_50e078e7f961', { p0: subtitleTargetIds.length }) : t('autoUi.k_bda3ae2da55b') }}</strong>
            </div>
            <div class="clone-subtitle-dialog__summary-item">
              <span>{{ t('autoUi.k_5d9ef99b61c5') }}</span>
              <strong>{{ subtitlePresets.find((preset) => preset.id === subtitleSelectedPreset)?.name || t('autoUi.k_469e324ba51b') }}</strong>
            </div>
          </div>
          <div class="clone-subtitle-dialog__tabs">
            <button :class="{ 'is-active': subtitleDialogTab === 'title' }" type="button" @click="subtitleDialogTab = 'title'">{{ t('autoUi.k_748d7dc7e321') }}</button>
            <button :class="{ 'is-active': subtitleDialogTab === 'template' }" type="button" @click="subtitleDialogTab = 'template'">{{ t('autoUi.k_06d0f38dd26c') }}</button>
            <button :class="{ 'is-active': subtitleDialogTab === 'style' }" type="button" @click="subtitleDialogTab = 'style'">{{ t('autoUi.k_393a6c9117bc') }}</button>
          </div>
          <section v-if="subtitleDialogTab === 'title'" class="clone-subtitle-dialog__section">
            <div class="clone-subtitle-dialog__section-head">
              <span class="clone-subtitle-dialog__kicker">Title Mode</span>
              <strong>{{ t('autoUi.k_7f39a0d9ffad') }}</strong>
            </div>
            <div class="clone-subtitle-dialog__mode-pills">
              <button :class="{ 'is-active': subtitleTitleStrategy === 'single_for_all' }" type="button" @click="subtitleTitleStrategy = 'single_for_all'"> {{ t('autoUi.k_73e18b3f4a29') }} </button>
              <button :class="{ 'is-active': subtitleTitleStrategy === 'random_pool' }" type="button" @click="subtitleTitleStrategy = 'random_pool'"> {{ t('autoUi.k_84ba3e6f5cfb') }} </button>
            </div>
            <label v-if="subtitleTitleStrategy === 'single_for_all'" class="clone-rename-dialog__field">
              <span>{{ t('autoUi.k_7e33e07fd936') }}</span>
              <input v-model.trim="subtitleTitleText" type="text" maxlength="120" :placeholder="t('autoUi.k_169a71f2d82c')" @keydown.enter.prevent="submitSubtitleDialog" />
            </label>
            <label v-else class="clone-rename-dialog__field">
              <span>{{ t('autoUi.k_84ba3e6f5cfb') }}</span>
              <textarea v-model.trim="subtitleTitlePoolText" class="clone-subtitle-dialog__textarea" :placeholder="t('autoUi.k_60e49a8dd0a0')"></textarea>
            </label>
            <div class="clone-subtitle-dialog__inline-tip">
              {{ subtitleTitleStrategy === 'single_for_all' ? t('autoUi.k_fb5b47107a9b') : t('autoUi.k_70164720b604') }}
            </div>
          </section>
          <section v-else-if="subtitleDialogTab === 'template'" class="clone-subtitle-dialog__section">
            <div class="clone-subtitle-dialog__section-head">
              <span class="clone-subtitle-dialog__kicker">Template</span>
              <strong>{{ t('autoUi.k_f84c2e382440') }}</strong>
            </div>
            <div class="clone-subtitle-dialog__preset-grid">
              <button
                v-for="preset in subtitlePresets"
                :key="preset.id"
                class="clone-subtitle-dialog__preset"
                :class="{ 'is-active': subtitleSelectedPreset === preset.id }"
                type="button"
                @click="applySubtitlePreset(preset.id)"
              >
                <strong>{{ preset.name }}</strong>
                <span>{{ preset.summary }}</span>
              </button>
            </div>
            <div class="clone-subtitle-dialog__preset-note">{{ t('autoUi.k_6bf2c4d17ccd') }}</div>
          </section>
          <section v-else class="clone-subtitle-dialog__section">
            <div class="clone-subtitle-dialog__section-head">
              <span class="clone-subtitle-dialog__kicker">Style</span>
              <strong>{{ t('autoUi.k_856e405fcf39') }}</strong>
            </div>
            <div class="clone-subtitle-dialog__style-panel clone-subtitle-dialog__style-panel--full">
              <div class="clone-subtitle-dialog__form-grid clone-subtitle-dialog__form-grid--compact">
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_b50d4d8352f5') }}</span>
                  <input v-model.trim="subtitleCaptionStyle.fontName" type="text" :placeholder="t('autoUi.k_9567b9609e02')" />
                </label>
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_576ccdb1f1c7') }}</span>
                  <input v-model.number="subtitleCaptionStyle.fontSize" type="number" min="18" max="120" />
                </label>
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_a48b15a6de71') }}</span>
                  <input v-model.number="subtitleCaptionStyle.strokeWidth" type="number" min="0" max="16" />
                </label>
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_3ca120ca0195') }}</span>
                  <input v-model.number="subtitleCaptionStyle.maxLines" type="number" min="1" max="6" />
                </label>
              </div>
              <div class="clone-subtitle-dialog__form-grid clone-subtitle-dialog__form-grid--dual">
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_07f568dada4d') }}</span>
                  <div class="clone-subtitle-dialog__color-field">
                    <input v-model.trim="subtitleCaptionStyle.fontColor" type="text" />
                    <input v-model="subtitleCaptionStyle.fontColor" type="color" />
                  </div>
                </label>
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_eaa98f95ba53') }}</span>
                  <div class="clone-subtitle-dialog__color-field">
                    <input v-model.trim="subtitleCaptionStyle.strokeColor" type="text" />
                    <input v-model="subtitleCaptionStyle.strokeColor" type="color" />
                  </div>
                </label>
              </div>
              <div class="clone-subtitle-dialog__form-grid clone-subtitle-dialog__form-grid--compact">
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_88c34452cc46') }}</span>
                  <select v-model="subtitleCaptionStyle.position" class="clone-group-select">
                    <option value="top">{{ t('autoUi.k_a9d35ab0a675') }}</option>
                    <option value="center">{{ t('autoUi.k_910253ea0c16') }}</option>
                    <option value="bottom">{{ t('autoUi.k_435b2d8982fd') }}</option>
                  </select>
                </label>
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_6ff4e8934c7f') }}</span>
                  <select v-model="subtitleCaptionStyle.textAlign" class="clone-group-select">
                    <option value="left">{{ t('autoUi.k_413f8db65f69') }}</option>
                    <option value="center">{{ t('autoUi.k_5009324782b9') }}</option>
                    <option value="right">{{ t('autoUi.k_70fe40dec2fa') }}</option>
                  </select>
                </label>
                <label class="clone-rename-dialog__field">
                  <span>{{ t('autoUi.k_fa0119023442') }}</span>
                  <input v-model.number="subtitleCaptionStyle.bottomMargin" type="number" min="48" max="600" />
                </label>
              </div>
            </div>
          </section>
          <div class="clone-rename-dialog__actions">
            <UiButton variant="secondary" :disabled="subtitleDialogBusy" @click="closeSubtitleDialog">{{ t('autoUi.k_4d0b4688c787') }}</UiButton>
            <UiButton class="clone-subtitle-dialog__submit" :disabled="subtitleDialogBusy" @click="submitSubtitleDialog">
              {{ subtitleDialogBusy ? t('autoUi.k_dde1db57718c') : t('autoUi.k_9ca6795dd07f') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="groupDialogOpen" class="clone-error-dialog-mask" @click.self="closeGroupDialog">
      <div class="clone-error-dialog clone-rename-dialog" @click.stop>
        <div class="clone-error-dialog__head">
          <div class="clone-error-dialog__copy">
            <strong>
              {{
                groupDialogMode === 'create'
                  ? t('autoUi.k_fa4ff6b10e32')
                  : groupDialogMode === 'rename'
                    ? t('autoUi.k_8f62b6b255c3')
                    : groupDialogMode === 'move_batch'
                      ? t('autoUi.k_b6c2525a1fb6')
                      : t('autoUi.k_fe238ad8bfec')
              }}
            </strong>
            <span>
              {{
                groupDialogMode === 'move_batch'
                  ? t('autoUi.k_dcf7ccbc9a09', { p0: movingProjectIds.length })
                  : groupDialogMode === 'move_single'
                    ? t('autoUi.k_5cbed79340b3')
                    : t('autoUi.k_905f3ead8016')
              }}
            </span>
          </div>
          <UiButton variant="ghost" :disabled="savingGroup" @click="closeGroupDialog">{{ t('autoUi.k_6c14bd7f6f9e') }}</UiButton>
        </div>
        <div class="clone-rename-dialog__body">
          <label v-if="groupDialogMode === 'create' || groupDialogMode === 'rename'" class="clone-rename-dialog__field">
            <span>{{ t('autoUi.k_65731c12ae52') }}</span>
            <input v-model.trim="groupDraft" type="text" maxlength="40" :placeholder="t('autoUi.k_5b44baabf1b4')" @keydown.enter.prevent="submitGroupDialog" />
          </label>
          <label v-else class="clone-rename-dialog__field">
            <span>{{ t('autoUi.k_b8fdfa5a79c0') }}</span>
            <select v-model="moveTargetGroupId" class="clone-group-select">
              <option value="__ungrouped__">{{ t('autoUi.k_8de957a7b7a2') }}</option>
              <option v-for="group in groups.filter((item) => item.id !== '__ungrouped__')" :key="group.id" :value="group.id">
                {{ group.name }}
              </option>
            </select>
          </label>
          <div class="clone-rename-dialog__actions">
            <UiButton variant="secondary" :disabled="savingGroup" @click="closeGroupDialog">{{ t('autoUi.k_4d0b4688c787') }}</UiButton>
            <UiButton
              :disabled="savingGroup || ((groupDialogMode === 'create' || groupDialogMode === 'rename') ? !groupDraft.trim() : false)"
              @click="submitGroupDialog"
            >
              {{ savingGroup ? t('autoUi.k_d70d425039f2') : t('autoUi.k_fadf24dbc5a9') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <RuntimeLogDialog
      v-model="runtimeDialogOpen"
      :logs="runtimeLogs"
      :title="t('autoUi.k_a8ce402665f3')"
      :description="t('autoUi.k_ae7c05c666c4')"
      :hint="t('autoUi.k_cae376183ef8')"
      :empty-description="t('autoUi.k_f8ea28d7b865')"
    />
  </div>
</template>

<style scoped>
.clone-task-list-page {
  --clone-accent: var(--ds-primary, #22d3ee);
  --clone-panel-border: rgba(98, 118, 168, 0.18);
  --clone-panel-bg: linear-gradient(180deg, rgba(11, 18, 31, 0.985), rgba(7, 12, 22, 0.99));
  --clone-card-bg: linear-gradient(180deg, rgba(17, 26, 42, 0.96), rgba(10, 17, 29, 0.96));
  min-height: 100%;
  padding: 6px 20px 18px;
  color: #eef3ff;
  background: transparent;
}

.clone-task-list-shell {
  background: transparent;
}

.clone-task-list-main {
  display: grid;
  gap: 14px;
  padding: 8px 2px 16px;
}

.clone-console-panel {
  position: relative;
  display: grid;
  gap: 18px;
  padding: 24px;
  border-radius: 28px;
  border: 1px solid var(--clone-panel-border);
  background:
    radial-gradient(circle at 88% -12%, rgba(34, 211, 238, 0.22), transparent 32%),
    radial-gradient(circle at 0% 0%, rgba(96, 165, 250, 0.16), transparent 28%),
    var(--clone-panel-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 24px 52px rgba(0, 0, 0, 0.28);
}

.clone-console-hero,
.clone-console-hero__actions,
.clone-console-overview,
.clone-console-overview__tools,
.clone-list-batch-bar,
.clone-list-batch-bar__actions,
.clone-console-table__groupbar,
.clone-console-table__groupbar-tabs,
.clone-console-table__groupbar-tools,
.clone-console-table__head,
.clone-console-row__statuswrap,
.clone-console-row__meta,
.clone-console-row__updated,
.clone-console-row__actions,
.clone-list-pagination,
.clone-list-pagination__controls,
.clone-side-card__row {
  display: flex;
}

.clone-console-hero {
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.clone-console-hero__copy {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.clone-console-hero__title-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.clone-console-hero__title-row h1 {
  margin: 0;
  color: #f8fbff;
  font-size: 31px;
  line-height: 1.02;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.clone-console-hero__copy p {
  margin: 0;
  color: #96a9cc;
  font-size: 14px;
  line-height: 1.65;
}

.clone-console-hero__spark {
  color: #81e6ff;
  font-size: 15px;
  opacity: 0.9;
}

.clone-console-hero__actions {
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.clone-console-hero__button {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  font-weight: 700;
}

.clone-console-hero__button--primary {
  gap: 8px;
}

.clone-console-run-mode {
  display: inline-flex;
  align-items: center;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.clone-console-run-mode__option {
  min-width: 92px;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #97abd1;
  font-size: 12px;
  font-weight: 700;
}

.clone-console-run-mode__option.is-active {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.05));
  color: #f8fbff;
}

.clone-console-overview {
  display: grid;
  gap: 0;
}

.clone-console-overview__cards {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.clone-console-stat {
  min-height: 78px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--clone-card-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.clone-console-stat.is-active {
  border-color: rgba(113, 92, 255, 0.58);
  box-shadow: 0 0 0 1px rgba(113, 92, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transform: translateY(-1px);
}

.clone-console-stat.tone-all {
  background: radial-gradient(circle at top right, rgba(34, 211, 238, 0.18), transparent 34%), var(--clone-card-bg);
}

.clone-console-stat.tone-running {
  background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.22), transparent 34%), var(--clone-card-bg);
}

.clone-console-stat.tone-success {
  background: radial-gradient(circle at top right, rgba(16, 185, 129, 0.18), transparent 34%), var(--clone-card-bg);
}

.clone-console-stat.tone-danger {
  background: radial-gradient(circle at top right, rgba(248, 113, 113, 0.18), transparent 34%), var(--clone-card-bg);
}

.clone-console-stat.tone-muted {
  background: radial-gradient(circle at top right, rgba(148, 163, 184, 0.16), transparent 34%), var(--clone-card-bg);
}

.clone-console-stat__icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.08);
  color: #e8f6ff;
}

.clone-console-stat__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  align-content: center;
  justify-items: start;
}

.clone-console-stat__copy strong {
  color: #f8fbff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  word-break: keep-all;
  white-space: nowrap;
}

.clone-console-stat__copy span {
  color: #91a5ca;
  font-size: 10px;
  line-height: 1;
  word-break: keep-all;
  white-space: nowrap;
}

.clone-console-stat b {
  color: #ffffff;
  font-size: 22px;
  line-height: 1;
  font-weight: 700;
  justify-self: end;
  text-align: right;
}

.clone-console-overview__tools {
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.clone-console-overview__tool,
.clone-console-overview__icon,
.clone-console-table__viewtool,
.clone-console-row__rename,
.clone-console-row__action,
.clone-console-group__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.035);
  color: #c7d6f7;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.clone-console-overview__tool {
  height: 38px;
  gap: 8px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}

.clone-console-overview__icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  padding: 0;
  background: linear-gradient(180deg, rgba(19, 32, 49, 0.96), rgba(14, 24, 40, 0.96));
  border-color: rgba(86, 105, 149, 0.24);
  color: #dbe7ff;
}

.clone-console-overview__icon-bars,
.clone-console-table__viewtool-bars,
.clone-console-table__viewtool-grid,
.clone-console-table__viewtool-dot {
  position: relative;
  display: inline-block;
}

.clone-console-overview__icon-bars,
.clone-console-table__viewtool-bars {
  width: 14px;
  height: 12px;
  background: linear-gradient(currentColor, currentColor) left 0 top 5px / 100% 2px no-repeat;
}

.clone-console-overview__icon-bars::before,
.clone-console-overview__icon-bars::after,
.clone-console-table__viewtool-bars::before,
.clone-console-table__viewtool-bars::after {
  content: '';
  position: absolute;
  left: 0;
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.clone-console-overview__icon-bars::before,
.clone-console-table__viewtool-bars::before {
  top: 0;
}

.clone-console-overview__icon-bars::after,
.clone-console-table__viewtool-bars::after {
  top: 10px;
}

.clone-list-batch-bar {
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 58px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(96, 116, 168, 0.18);
  background:
    radial-gradient(circle at top right, rgba(73, 121, 255, 0.12), transparent 26%),
    linear-gradient(180deg, rgba(12, 20, 34, 0.98), rgba(8, 14, 25, 0.96));
  color: #d9e4ff;
  font-size: 13px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-list-batch-bar__summary {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.clone-list-batch-bar__summary strong {
  color: #f5f8ff;
  font-size: 16px;
  line-height: 1.1;
}

.clone-list-batch-bar__stats {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.clone-list-batch-bar__stat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.clone-list-batch-bar__stat em {
  color: #ffffff;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
}

.clone-list-batch-bar__stat small {
  color: #97a9cf;
  font-size: 11px;
}

.clone-list-batch-bar__message {
  color: #9fb0d8;
  text-align: right;
}

.clone-list-batch-bar__actions {
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.clone-list-batch-action {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.2);
  background: rgba(10, 17, 28, 0.94);
  color: #edf4ff;
  font-size: 12px;
  font-weight: 700;
}

.clone-list-batch-action:hover {
  border-color: rgba(130, 104, 255, 0.4);
  background: rgba(21, 31, 50, 0.98);
}

.clone-list-batch-action--accent {
  border-color: rgba(126, 102, 255, 0.4);
  background: linear-gradient(135deg, rgba(85, 62, 212, 0.86), rgba(115, 93, 240, 0.86));
  box-shadow: 0 10px 22px rgba(82, 64, 203, 0.18);
}

.clone-list-batch-action--accent:hover {
  border-color: rgba(146, 126, 255, 0.48);
  background: linear-gradient(135deg, rgba(92, 68, 226, 0.92), rgba(124, 101, 247, 0.92));
}

.clone-list-batch-action--danger {
  border-color: rgba(255, 120, 120, 0.32);
  background: rgba(61, 17, 24, 0.92);
  color: #ffd7dc;
}

.clone-list-batch-action--danger:hover {
  border-color: rgba(255, 144, 144, 0.46);
  background: rgba(84, 21, 31, 0.96);
}

.clone-console-table {
  overflow: visible;
  border-radius: 28px;
  border: 1px solid var(--clone-panel-border);
  background: linear-gradient(180deg, rgba(11, 19, 32, 0.98), rgba(7, 12, 21, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 20px 44px rgba(0, 0, 0, 0.22);
}

.clone-console-table__groupbar {
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(57, 73, 111, 0.24);
  min-width: 0;
  flex-wrap: nowrap;
  position: relative;
  z-index: 3;
  overflow: visible;
}

.clone-console-table__groupbar-tabs {
  align-items: center;
  gap: 8px;
  flex: 1 1 0;
  min-width: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 6px;
  margin-bottom: -6px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.clone-console-table__groupbar-tabs::-webkit-scrollbar {
  display: none;
}

.clone-console-group {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 38px;
  padding-right: 0;
  border-radius: 14px;
  border: 1px solid transparent;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.clone-console-group.is-active {
  background: linear-gradient(180deg, rgba(24, 36, 58, 0.96), rgba(16, 25, 43, 0.96));
  border-color: rgba(94, 116, 164, 0.22);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.clone-console-group:hover {
  background: rgba(255, 255, 255, 0.028);
  border-color: rgba(148, 163, 184, 0.08);
}

.clone-console-group__main {
  flex: 0 0 auto;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: #97abd1;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.clone-console-group.is-active .clone-console-group__main {
  color: #f8fbff;
}

.clone-console-group__main span {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clone-console-group__main em {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #8fa5cf;
  font-style: normal;
  font-size: 10px;
  line-height: 1;
}

.clone-console-group.is-active .clone-console-group__main em {
  background: rgba(115, 132, 255, 0.18);
  color: #dfe8ff;
}

.clone-console-group__more {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 9px;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease, background 160ms ease;
}

.clone-console-group:hover .clone-console-group__more,
.clone-console-group.is-active .clone-console-group__more,
.clone-group-menu__dropdown + .clone-console-group__more,
.clone-group-menu:focus-within .clone-console-group__more {
  opacity: 1;
  pointer-events: auto;
}

.clone-console-group__create {
  flex: 0 0 auto;
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #dce7ff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.clone-console-group--overflow .clone-group-menu__dropdown {
  min-width: 180px;
  max-height: min(320px, calc(100vh - 220px));
  overflow-y: auto;
}

.clone-console-group--overflow .clone-console-group__main {
  color: #b2c4e8;
}

.clone-console-group--overflow {
  flex: 0 0 auto;
}

.clone-group-menu__item.is-active {
  background: rgba(109, 93, 255, 0.16);
  color: #f8fbff;
}

.clone-group-menu__item em {
  margin-left: auto;
  color: #8ea3ca;
  font-style: normal;
  font-size: 11px;
}

.clone-console-table__groupbar-tools {
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  min-width: fit-content;
  padding-left: 12px;
  border-left: 1px solid rgba(57, 73, 111, 0.2);
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.clone-console-table__viewtool {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  padding: 0;
  background: linear-gradient(180deg, rgba(20, 31, 48, 0.94), rgba(14, 24, 39, 0.94));
  border-color: rgba(88, 105, 145, 0.22);
  color: #9fb3db;
}

.clone-console-table__viewtool.is-active {
  border-color: rgba(108, 88, 255, 0.42);
  color: #eef2ff;
  background: linear-gradient(180deg, rgba(55, 66, 135, 0.72), rgba(35, 42, 92, 0.84));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 0 1px rgba(109, 93, 255, 0.08);
}

.clone-console-table__viewtool-grid {
  width: 14px;
  height: 14px;
  background:
    linear-gradient(currentColor, currentColor) left top / 5px 5px no-repeat,
    linear-gradient(currentColor, currentColor) right top / 5px 5px no-repeat,
    linear-gradient(currentColor, currentColor) left bottom / 5px 5px no-repeat,
    linear-gradient(currentColor, currentColor) right bottom / 5px 5px no-repeat;
}

.clone-console-table__viewtool-dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: -6px 0 0 currentColor, 6px 0 0 currentColor;
}

.clone-console-table__body {
  display: grid;
  gap: 10px;
  padding: 12px 14px 16px;
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
}

.clone-console-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 12px;
  padding: 12px 14px 16px;
}

.clone-console-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid rgba(57, 73, 111, 0.24);
  background: linear-gradient(180deg, rgba(12, 20, 34, 0.98), rgba(8, 14, 25, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-console-card__head,
.clone-console-card__footer,
.clone-console-card__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.clone-console-card__head,
.clone-console-card__footer {
  justify-content: space-between;
}

.clone-console-card__preview {
  height: 180px;
  overflow: hidden;
  padding: 0;
  border-radius: 14px;
  border: 1px solid rgba(57, 73, 111, 0.18);
  background: rgba(9, 16, 28, 0.84);
}

.clone-console-card__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clone-console-card__body {
  display: grid;
  gap: 8px;
}

.clone-console-card__actions {
  justify-content: flex-end;
}

.clone-console-table__head {
  align-items: center;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.024);
  color: #7f96c1;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.clone-console-table__head,
.clone-console-row {
  display: grid;
  grid-template-columns: 28px 96px minmax(260px, 1.58fr) 164px 118px 176px 104px 108px;
  column-gap: 14px;
}

.clone-console-table__check,
.clone-console-row__check {
  width: 18px;
  height: 18px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
}

.clone-console-table__check input,
.clone-console-row__check input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.clone-console-table__check span,
.clone-console-row__check span {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  border: 1px solid rgba(139, 155, 196, 0.32);
  background: rgba(255, 255, 255, 0.02);
}

.clone-console-table__check input:checked + span,
.clone-console-row__check input:checked + span {
  border-color: color-mix(in srgb, var(--clone-accent) 48%, transparent);
  background: color-mix(in srgb, var(--clone-accent) 28%, rgba(255, 255, 255, 0.03));
}

.clone-console-table__check input:checked + span::after,
.clone-console-row__check input:checked + span::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: #ffffff;
}

.clone-console-row {
  position: relative;
  align-items: center;
  min-height: 112px;
  padding: 0 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(16, 24, 40, 0.96), rgba(9, 15, 26, 0.96));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025), 0 10px 28px rgba(0, 0, 0, 0.18);
}

.clone-console-row:hover {
  border-color: rgba(133, 154, 208, 0.18);
}

.clone-console-row__preview,
.clone-console-row__task,
.clone-console-row__stage,
.clone-console-row__assets,
.clone-console-row__progress,
.clone-console-row__updated,
.clone-console-row__actions {
  min-width: 0;
  align-self: center;
}

.clone-console-row__thumb {
  position: relative;
  width: 96px;
  height: 72px;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.clone-console-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clone-console-row__thumb::after {
  content: attr(data-duration);
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-width: 40px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(4, 8, 16, 0.78);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
}

.clone-console-row__thumb-empty {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: #7f91b4;
}

.clone-console-row__task {
  display: grid;
  gap: 8px;
  align-content: center;
  padding-block: 14px;
}

.clone-console-row__titleline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.clone-console-row__titleline h3 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f7fbff;
  font-size: 15px;
  font-weight: 700;
}

.clone-console-row__rename {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 8px;
  padding: 0;
}

.clone-console-row__meta {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #8fa3ca;
  font-size: 11px;
  font-weight: 600;
}

.clone-console-row__mode {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
  color: #dce8ff;
}

.clone-console-row__dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgba(149, 166, 204, 0.58);
}

.clone-console-row__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-console-row__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 38px;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid rgba(161, 62, 74, 0.34);
  background: linear-gradient(180deg, rgba(72, 24, 34, 0.34), rgba(54, 18, 28, 0.28));
  box-shadow: inset 0 1px 0 rgba(255, 214, 214, 0.04);
}

.clone-console-row__error-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f7c1c8;
  font-size: 11px;
  line-height: 1.35;
}

.clone-console-row__error-link {
  flex: 0 0 auto;
  color: #ffd6db;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.clone-console-row__stage {
  display: grid;
  gap: 10px;
  align-content: center;
}

.clone-console-row__statuswrap {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.clone-console-row__status,
.clone-console-row__stepbadge {
  min-height: 27px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.clone-console-row__status.is-success {
  background: rgba(16, 185, 129, 0.14);
  color: #86efac;
}

.clone-console-row__status.is-danger {
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
}

.clone-console-row__status.is-draft {
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
}

.clone-console-row__status.is-running {
  background: rgba(59, 130, 246, 0.14);
  color: #93c5fd;
}

.clone-console-row__stepbadge {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.035);
  color: #d8e5ff;
}

.clone-console-row__stepbadge.tone-analyze {
  color: #67e8f9;
}

.clone-console-row__stepbadge.tone-script {
  color: #c4b5fd;
}

.clone-console-row__stepbadge.tone-storyboard {
  color: #f9a8d4;
}

.clone-console-row__stepbadge.tone-video {
  color: #93c5fd;
}

.clone-console-row__stepbadge.tone-compose {
  color: #86efac;
}

.clone-console-row__groupmove {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: #dce7ff;
  font-size: 11px;
  font-weight: 700;
}

.clone-console-row__assets {
  display: grid;
  gap: 4px;
  align-content: center;
}

.clone-console-row__assets strong {
  color: #eef4ff;
  font-size: 12px;
  font-weight: 700;
}

.clone-console-row__assets span {
  color: #8ea3c9;
  font-size: 11px;
}

.clone-console-row__progress {
  display: grid;
  gap: 8px;
  align-content: center;
}

.clone-console-row__progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.clone-console-row__progress-copy strong {
  color: #f8fbff;
  font-size: 18px;
  font-weight: 700;
}

.clone-console-row__progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.clone-console-row__progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22d3ee, #60a5fa);
}

.clone-console-row__progress-steps {
  display: flex;
  align-items: center;
  gap: 7px;
}

.clone-console-row__progress-step {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #7f93b8;
  font-size: 10px;
  font-weight: 700;
}

.clone-console-row__progress-step.is-active {
  border-color: color-mix(in srgb, var(--clone-accent) 40%, transparent);
  background: color-mix(in srgb, var(--clone-accent) 18%, rgba(255, 255, 255, 0.04));
  color: #ffffff;
}

.clone-console-row__progress-step.is-done {
  background: rgba(255, 255, 255, 0.07);
  color: #eef4ff;
}

.clone-console-row__updated {
  align-items: center;
  gap: 10px;
  color: #a4b3cf;
  justify-self: start;
}

.clone-console-row__updated-copy {
  display: grid;
  gap: 2px;
}

.clone-console-row__updated-copy span {
  color: #92a5ca;
  font-size: 11px;
}

.clone-console-row__updated-copy strong {
  color: #eff4ff;
  font-size: 13px;
  font-weight: 700;
}

.clone-console-row__actions {
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  justify-self: end;
}

.clone-console-row__action {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  padding: 0;
}

.clone-console-row__action--play {
  color: #dff9ff;
}

.clone-console-row__action--edit {
  color: #a9bdf8;
}

.clone-console-row__action--danger {
  color: #ffb4bc;
}

.clone-row-action-menu,
.clone-group-menu,
.clone-row-move-menu {
  position: relative;
}

.clone-group-menu__dropdown,
.clone-row-move-menu__dropdown {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  min-width: 150px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.14);
  background: linear-gradient(180deg, rgba(15, 24, 39, 0.99), rgba(8, 14, 24, 0.99));
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
}

.clone-group-menu__dropdown,
.clone-row-action-menu__dropdown {
  right: 0;
  min-width: 132px;
}

.clone-row-move-menu__dropdown {
  left: 0;
  right: auto;
  max-height: 220px;
  overflow: auto;
}

.clone-group-menu__item,
.clone-row-move-menu__item {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #dbe7ff;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
}

.clone-group-menu__item:hover,
.clone-row-move-menu__item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.clone-group-menu__item--danger {
  color: #ffb4bc;
}

.clone-row-move-menu__item.is-active {
  background: color-mix(in srgb, var(--clone-accent) 16%, transparent);
  color: #ffffff;
}

.clone-row-move-menu__item:disabled {
  opacity: 0.6;
  cursor: wait;
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

.clone-rename-dialog {
  width: min(520px, 100%);
}

.clone-video-preview-dialog {
  width: min(860px, 100%);
  border-color: rgba(118, 136, 196, 0.16);
}

.clone-video-preview-dialog__body {
  display: grid;
  gap: 16px;
}

.clone-video-preview-dialog__head-actions,
.clone-video-preview-dialog__meta-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.clone-video-preview-dialog__head-actions {
  justify-content: flex-end;
}

.clone-video-preview-dialog__player {
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(118, 136, 196, 0.16);
  background: rgba(3, 8, 18, 0.94);
}

.clone-video-preview-dialog__player video {
  width: 100%;
  max-height: 72vh;
  display: block;
  background: #02060f;
}

.clone-video-preview-dialog__empty {
  min-height: 260px;
  display: grid;
  place-items: center;
  color: #95a3c3;
  font-size: 13px;
}

.clone-video-preview-dialog__meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  color: #98a6c3;
  font-size: 12px;
}

.clone-video-preview-dialog__head-actions :deep(.ds-button) {
  min-height: 36px;
  border-radius: 11px !important;
  padding: 0 14px !important;
}

.clone-video-preview-dialog__actions {
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.clone-video-preview-dialog__actions :deep(.ds-button),
.clone-video-preview-dialog__actions:deep(.ds-button) {
  min-height: 38px;
  border-radius: 12px !important;
  padding: 0 14px !important;
}

.clone-video-preview-dialog__head-actions :deep(.clone-video-preview-dialog__subtitle-button.ds-button),
.clone-video-preview-dialog__head-actions :deep(.clone-video-preview-dialog__subtitle-button .ds-button),
.clone-subtitle-dialog :deep(.clone-subtitle-dialog__submit.ds-button),
.clone-subtitle-dialog :deep(.clone-subtitle-dialog__submit .ds-button) {
  border-color: rgba(241, 178, 92, 0.58) !important;
  background: linear-gradient(135deg, rgba(186, 112, 34, 0.98), rgba(228, 154, 62, 0.98)) !important;
  color: #ffffff !important;
  box-shadow:
    0 16px 34px rgba(176, 106, 32, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.clone-video-preview-dialog__head-actions :deep(.clone-video-preview-dialog__subtitle-button.ds-button:hover),
.clone-video-preview-dialog__head-actions :deep(.clone-video-preview-dialog__subtitle-button .ds-button:hover),
.clone-subtitle-dialog :deep(.clone-subtitle-dialog__submit.ds-button:hover),
.clone-subtitle-dialog :deep(.clone-subtitle-dialog__submit .ds-button:hover) {
  border-color: rgba(248, 196, 118, 0.72) !important;
  background: linear-gradient(135deg, rgba(198, 120, 38, 1), rgba(236, 166, 76, 1)) !important;
  transform: translateY(-1px);
}

.clone-video-preview-dialog__head-actions :deep(.clone-video-preview-dialog__revert-button.ds-button),
.clone-video-preview-dialog__head-actions :deep(.clone-video-preview-dialog__revert-button .ds-button) {
  border-color: rgba(255, 184, 108, 0.34) !important;
  background: linear-gradient(135deg, rgba(125, 87, 35, 0.92), rgba(181, 120, 40, 0.92)) !important;
  box-shadow: 0 12px 26px rgba(168, 114, 37, 0.22);
}

.clone-subtitle-dialog {
  width: min(660px, calc(100vw - 24px));
  max-height: calc(100vh - 28px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.clone-subtitle-dialog__head {
  align-items: flex-start;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(118, 136, 196, 0.12);
}

.clone-subtitle-dialog__copy strong {
  font-size: 18px;
}

.clone-subtitle-dialog__copy span {
  font-size: 13px;
  line-height: 1.55;
  color: #9eb0d6;
}

.clone-subtitle-dialog__body {
  gap: 10px;
  overflow: auto;
  padding-right: 2px;
}

.clone-subtitle-dialog__tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
}

.clone-subtitle-dialog__tabs button {
  flex: 1 1 0;
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #9daed3;
  font-size: 12px;
  font-weight: 700;
}

.clone-subtitle-dialog__tabs button.is-active {
  color: #ffffff;
  background: linear-gradient(180deg, rgba(116, 94, 255, 0.42), rgba(92, 74, 214, 0.42));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.clone-subtitle-dialog__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.clone-subtitle-dialog__summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(120, 138, 198, 0.12);
  border-radius: 12px;
  background: rgba(11, 18, 30, 0.72);
}

.clone-subtitle-dialog__summary-item span {
  color: #8ca0d3;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.clone-subtitle-dialog__summary-item strong {
  color: #f7faff;
  font-size: 13px;
  line-height: 1.2;
  text-align: right;
}

.clone-subtitle-dialog__section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(118, 136, 196, 0.12);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(15, 23, 38, 0.92), rgba(11, 17, 29, 0.94));
}

.clone-subtitle-dialog__section-head {
  display: grid;
  gap: 4px;
}

.clone-subtitle-dialog__kicker {
  color: #8fa2d8;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.clone-subtitle-dialog__section-head strong {
  color: #f3f6ff;
  font-size: 15px;
}

.clone-subtitle-dialog__strategy-grid,
.clone-subtitle-dialog__preset-grid,
.clone-subtitle-dialog__form-grid {
  display: grid;
  gap: 10px;
}

.clone-subtitle-dialog__strategy-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.clone-subtitle-dialog__mode-pills {
  display: flex;
  gap: 8px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.clone-subtitle-dialog__mode-pills button {
  flex: 1 1 0;
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #9caed4;
  font-size: 12px;
  font-weight: 700;
}

.clone-subtitle-dialog__mode-pills button.is-active {
  color: #ffffff;
  background: linear-gradient(180deg, rgba(116, 94, 255, 0.38), rgba(92, 74, 214, 0.38));
}

.clone-subtitle-dialog__preset-grid {
  grid-template-columns: 1fr;
}

.clone-subtitle-dialog__form-grid--dual {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.clone-subtitle-dialog__form-grid--compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.clone-subtitle-dialog__style-panel {
  display: grid;
  gap: 10px;
  padding: 11px;
  border-radius: 12px;
  border: 1px solid rgba(118, 136, 196, 0.12);
  background: rgba(8, 14, 24, 0.55);
}

.clone-subtitle-dialog__style-panel--full {
  gap: 9px;
}

.clone-subtitle-dialog__mini-title {
  color: #dde6fb;
  font-size: 11px;
  font-weight: 700;
}

.clone-subtitle-dialog__inline-tip {
  color: #8fa3d4;
  font-size: 11px;
  line-height: 1.5;
}

.clone-subtitle-dialog__preset-note {
  color: #8fa3d4;
  font-size: 11px;
  line-height: 1.5;
}

.clone-subtitle-dialog__strategy-card,
.clone-subtitle-dialog__preset {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(118, 136, 196, 0.16);
  background: rgba(9, 15, 27, 0.9);
  color: #eef4ff;
  text-align: left;
  min-height: 62px;
}

.clone-subtitle-dialog__strategy-card strong,
.clone-subtitle-dialog__preset strong {
  font-size: 13px;
}

.clone-subtitle-dialog__strategy-card small,
.clone-subtitle-dialog__preset span {
  color: #98a9cf;
  font-size: 12px;
  line-height: 1.45;
}

.clone-subtitle-dialog__strategy-card.is-active,
.clone-subtitle-dialog__preset.is-active {
  border-color: rgba(126, 102, 255, 0.56);
  background: linear-gradient(180deg, rgba(47, 36, 98, 0.62), rgba(18, 19, 44, 0.92));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 28px rgba(61, 46, 151, 0.18);
}

.clone-subtitle-dialog__color-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 54px;
  gap: 8px;
}

.clone-subtitle-dialog__color-field input[type='color'] {
  width: 54px;
  min-height: 38px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.18);
  background: rgba(10, 18, 30, 0.96);
}

.clone-subtitle-dialog__color-field input[type='text'] {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.18);
  background: rgba(10, 18, 30, 0.96);
  color: #eef4ff;
  font-size: 12px;
  outline: none;
}

.clone-rename-dialog__body {
  display: grid;
  gap: 16px;
}

.clone-rename-dialog__field {
  display: grid;
  gap: 6px;
}

.clone-rename-dialog__field span {
  color: #d8e3fb;
  font-size: 11px;
  font-weight: 600;
}

.clone-rename-dialog__field input,
.clone-subtitle-dialog__textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.18);
  background: rgba(10, 18, 30, 0.96);
  color: #eef4ff;
  font-size: 13px;
  outline: none;
}

.clone-rename-dialog__field input {
  min-height: 38px;
  padding: 0 12px;
}

.clone-subtitle-dialog__textarea {
  min-height: 104px;
  padding: 10px 12px;
  resize: vertical;
  line-height: 1.55;
}

.clone-group-select {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.18);
  background: rgba(10, 18, 30, 0.96);
  color: #eef4ff;
  font-size: 12px;
  outline: none;
}

.clone-rename-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 2px;
}

@media (max-width: 900px) {
  .clone-subtitle-dialog__summary,
  .clone-subtitle-dialog__form-grid--dual,
  .clone-subtitle-dialog__form-grid--compact {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .clone-subtitle-dialog {
    width: min(100vw - 18px, 620px);
    max-height: calc(100vh - 16px);
  }

  .clone-subtitle-dialog__strategy-grid {
    grid-template-columns: 1fr;
  }

  .clone-video-preview-dialog__actions {
    justify-content: stretch;
  }

  .clone-video-preview-dialog__actions > * {
    flex: 1 1 100%;
  }
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
  min-height: 60px;
  padding: 0 22px 6px;
  color: #93a2c0;
  font-size: 13px;
  border-top: 1px solid rgba(54, 69, 108, 0.16);
  background: rgba(8, 15, 29, 0.55);
}

.clone-list-pagination {
  align-items: center;
}

.clone-list-pagination__summary {
  color: #a6b6d6;
  font-weight: 600;
}

.clone-list-pagination__controls {
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.clone-list-pagination__controls button {
  min-width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(89, 106, 147, 0.12);
  background: rgba(9, 17, 28, 0.96);
  color: #c9d4f2;
}

.clone-list-pagination__controls button.is-active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--clone-accent) 84%, #0f172a), color-mix(in srgb, var(--clone-accent) 60%, #07111d));
  color: #fff;
}

.clone-list-page-size {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

.clone-list-page-size-wrap {
  position: relative;
}

.clone-list-page-size-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  display: grid;
  gap: 6px;
  min-width: 132px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(89, 106, 147, 0.18);
  background: rgba(9, 17, 28, 0.98);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
  z-index: 20;
}

.clone-list-page-size-menu button {
  justify-content: flex-start;
  width: 100%;
  padding: 0 12px;
}

.clone-list-page-size-menu button.is-active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--clone-accent) 84%, #0f172a), color-mix(in srgb, var(--clone-accent) 60%, #07111d));
  color: #fff;
}

.clone-side-card {
  padding: 18px;
  border-radius: 8px;
  border: 1px solid rgba(118, 136, 196, 0.14);
  background: linear-gradient(180deg, rgba(11, 20, 35, 0.98), rgba(8, 15, 27, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-side-card__row strong {
  font-size: 13px;
  color: #f4f7ff;
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

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1480px) {
  .clone-console-table__head,
  .clone-console-row {
    grid-template-columns: 28px 88px minmax(220px, 1.4fr) 154px 108px 164px 96px 100px;
  }
}

@media (max-width: 1260px) {
  .clone-console-hero,
  .clone-list-pagination,
  .clone-list-batch-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .clone-console-hero__actions,
  .clone-list-batch-bar__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .clone-console-overview__cards {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .clone-console-table__groupbar {
    flex-wrap: wrap;
  }

  .clone-console-table__groupbar-tabs {
    min-width: 100%;
    flex-wrap: wrap;
  }

  .clone-console-table__groupbar-tools {
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

@media (max-width: 1120px) {
  .clone-console-table__head {
    display: none;
  }

  .clone-console-row {
    grid-template-columns: 28px 88px minmax(0, 1fr);
    align-items: start;
    row-gap: 12px;
  }

  .clone-console-row__task,
  .clone-console-row__stage,
  .clone-console-row__assets,
  .clone-console-row__progress,
  .clone-console-row__updated,
  .clone-console-row__actions {
    grid-column: 3;
  }

  .clone-console-row__preview {
    grid-row: span 2;
  }

  .clone-console-row__updated,
  .clone-console-row__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 860px) {
  .clone-task-list-page {
    padding-inline: 12px;
  }

  .clone-console-panel,
  .clone-console-table {
    border-radius: 22px;
  }

  .clone-console-overview__cards {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .clone-console-table__groupbar {
    flex-direction: column;
    align-items: stretch;
  }

  .clone-console-table__groupbar-tabs {
    min-width: 0;
  }

  .clone-console-table__groupbar-tools {
    justify-content: flex-end;
  }

  .clone-console-row {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .clone-console-row__preview {
    display: none;
  }

  .clone-console-row__task,
  .clone-console-row__stage,
  .clone-console-row__assets,
  .clone-console-row__progress,
  .clone-console-row__updated,
  .clone-console-row__actions {
    grid-column: 2;
  }
}
</style>
