<script setup lang="ts">
import SubtitleStudioDialog, { type SubtitleDialogSubmit } from '@/ui/components/subtitle/SubtitleStudioDialog.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Captions, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Download, ExternalLink, FileVideo, FolderInput, FolderOpen, Hand, Image as ImageIcon, LayoutGrid, List, LoaderCircle, MoreHorizontal, Pencil, Play, Plus, Search, Sparkles, Trash2, Video, Wand2, X } from 'lucide-vue-next'
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
const createMenuOpen = ref(false)
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

/** 新弹窗交来的标题和样式，放进原来的变量后走原来的提交 */
function onSubtitleDialogSubmit(payload: SubtitleDialogSubmit) {
  subtitleTitleStrategy.value = payload.titleStrategy
  subtitleTitleText.value = payload.titleText
  subtitleTitlePoolText.value = payload.titlePoolText
  Object.assign(subtitleCaptionStyle, payload.captionStyle)
  void submitSubtitleDialog()
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
  if (!target?.closest('.ctl-create')) createMenuOpen.value = false
  if (!target?.closest('.clone-list-page-size-wrap')) pageSizeMenuOpen.value = false
}

function startTask(mode: 'auto' | 'manual') {
  createMenuOpen.value = false
  void createTask(mode)
}

const activeStatusCard = computed(() => overviewCards.value.find((card) => card.key === statusFilter.value && card.key !== 'all') || null)

function clearFilters() {
  statusFilter.value = 'all'
  query.value = ''
}

function statusDotTone(status?: string) {
  return statusTone(status).replace('is-', '')
}

const brokenCovers = ref(new Set<string>())
function isVideoSrc(src: string) {
  return /\.(mp4|mov|webm|mkv|m4v)(?:$|[?&#])/i.test(decodeURIComponent(src))
}
function coverKind(item: CloneProjectSummary): 'image' | 'video' | 'none' {
  const src = itemCoverSrc(item)
  if (!src || brokenCovers.value.has(item.id)) return 'none'
  return isVideoSrc(src) ? 'video' : 'image'
}
function markCoverBroken(id: string) {
  const next = new Set(brokenCovers.value)
  next.add(id)
  brokenCovers.value = next
}

function onRowDblClick(event: MouseEvent, id: string) {
  if ((event.target as HTMLElement | null)?.closest('button, input, label, .clone-row-move-menu')) return
  openTask(id)
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
  <div class="vg-scope ctl-page">
    <!-- ============ Head ============ -->
    <header class="ctl-head">
      <div class="ctl-head__icon"><Copy :size="22" /></div>
      <div class="ctl-head__text">
        <h1>{{ t('cloneTasks.title') }}</h1>
        <p>{{ t('cloneTasks.desc') }}</p>
      </div>
      <div class="ctl-head__actions">
        <div class="ctl-create">
          <button type="button" class="vg-btn vg-btn--primary ctl-create-btn" data-testid="clone-create-task" :disabled="creating" @click="startTask('auto')">
            <LoaderCircle v-if="creating" :size="16" class="vg-spin" /><Plus v-else :size="16" />
            {{ creating ? t('cloneTasks.actions.creating') : t('cloneTasks.actions.create') }}
            <span class="ctl-create-btn__more" role="button" tabindex="0" data-testid="clone-create-task-more" :title="t('cloneUi.createTitle')" :aria-label="t('cloneUi.createTitle')" @click.stop="createMenuOpen = !createMenuOpen" @keydown.enter.stop.prevent="createMenuOpen = !createMenuOpen">
              <ChevronDown :size="14" class="ctl-create-btn__caret" />
            </span>
          </button>
          <div v-if="createMenuOpen" class="ctl-create__menu" role="menu">
            <div class="ctl-create__title">{{ t('cloneUi.createTitle') }}</div>
            <button type="button" class="ctl-create__option" role="menuitem" @click="startTask('auto')">
              <span class="ctl-create__icon is-auto"><Sparkles :size="18" /></span>
              <span class="ctl-create__copy"><strong>{{ t('cloneTasks.runMode.auto') }}</strong><small>{{ t('cloneUi.autoDesc') }}</small></span>
            </button>
            <button type="button" class="ctl-create__option" role="menuitem" @click="startTask('manual')">
              <span class="ctl-create__icon is-manual"><Hand :size="18" /></span>
              <span class="ctl-create__copy"><strong>{{ t('cloneTasks.runMode.manual') }}</strong><small>{{ t('cloneUi.manualDesc') }}</small></span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- ============ Stats ============ -->
    <section class="ctl-stats" aria-label="overview">
      <button
        v-for="card in overviewCards"
        :key="card.key"
        type="button"
        class="ctl-stat"
        :class="[`tone-${card.tone}`, { 'is-active': card.key !== 'pending-output' && statusFilter === card.key }]"
        :disabled="card.key === 'pending-output'"
        @click="statusFilter = card.key as typeof statusFilter"
      >
        <span class="ctl-stat__label"><i class="ctl-stat__dot" />{{ card.label }}</span>
        <b class="ctl-stat__value">{{ card.value }}</b>
        <small class="ctl-stat__helper">{{ card.helper }}</small>
      </button>
    </section>

    <!-- ============ Workbench ============ -->
    <section class="ctl-bench">
      <div class="ctl-toolbar">
        <nav class="ctl-tabs" aria-label="groups">
          <div v-for="group in visibleGroupItems" :key="group.id" class="ctl-tab clone-group-menu" :class="{ 'is-active': activeGroupId === group.id }">
            <button type="button" class="ctl-tab__main" @click="activeGroupId = group.id as any">
              <span>{{ group.name }}</span><em>{{ group.taskCount }}</em>
            </button>
            <button v-if="!group.system && (cloneGroupRenameReady || cloneGroupRemoveReady)" type="button" class="ctl-tab__more" :aria-label="t('cloneTasks.actions.more')" @click.stop="toggleGroupMenu(group.id)">
              <MoreHorizontal :size="14" />
            </button>
            <div v-if="groupMenuOpenId === group.id" class="vg-menu vg-menu--left ctl-menu">
              <button v-if="cloneGroupRenameReady" type="button" @click.stop="openRenameGroupDialog(group as CloneTaskGroup); groupMenuOpenId = ''"><Pencil :size="14" />{{ t('cloneTasks.actions.rename') }}</button>
              <button v-if="cloneGroupRemoveReady" type="button" class="danger" @click.stop="confirmRemoveGroup(group as CloneTaskGroup); groupMenuOpenId = ''"><Trash2 :size="14" />{{ t('cloneTasks.actions.delete') }}</button>
            </div>
          </div>
          <div v-if="hasOverflowGroups" class="ctl-tab clone-group-menu" :class="{ 'is-active': Boolean(activeOverflowGroup) }">
            <button type="button" class="ctl-tab__main" @click.stop="toggleGroupMenu('__overflow__')">
              <span>{{ activeOverflowGroup ? activeOverflowGroup.name : t('cloneTasks.groups.more') }}</span>
              <em>{{ activeOverflowGroup ? activeOverflowGroup.taskCount : overflowGroupItems.length }}</em>
              <ChevronDown :size="13" />
            </button>
            <div v-if="groupMenuOpenId === '__overflow__'" class="vg-menu vg-menu--left ctl-menu ctl-menu--groups">
              <button
                v-for="group in overflowGroupItems"
                :key="`overflow-${group.id}`"
                type="button"
                :class="{ 'is-checked': activeGroupId === group.id }"
                @click.stop="activeGroupId = group.id as any; groupMenuOpenId = ''"
              >
                <FolderOpen :size="14" /><span class="ctl-menu__label">{{ group.name }}</span><em>{{ group.taskCount }}</em>
              </button>
            </div>
          </div>
          <button v-if="cloneGroupCreateReady" type="button" class="ctl-tab-add" :title="t('cloneTasks.groups.create')" @click="openCreateGroupDialog">
            <Plus :size="14" /><span>{{ t('cloneTasks.groups.create') }}</span>
          </button>
        </nav>

        <div class="ctl-toolbar__tools">
          <label class="vg-search ctl-search">
            <Search :size="15" />
            <input v-model="query" class="vg-input vg-input--sm" :placeholder="t('cloneUi.search')" />
            <button v-if="query" type="button" class="ctl-search__clear" :aria-label="t('cloneUi.clearFilter')" @click="query = ''"><X :size="12" /></button>
          </label>
          <button class="vg-btn vg-btn--sm" type="button" @click="toggleSortOrder">
            <ArrowDownWideNarrow v-if="sortOrder === 'created_desc'" :size="14" /><ArrowUpNarrowWide v-else :size="14" />
            {{ sortOrder === 'created_desc' ? t('cloneTasks.sort.newest') : t('cloneTasks.sort.oldest') }}
          </button>
          <div class="ctl-viewtoggle" role="group">
            <button type="button" :class="{ active: viewMode === 'list' }" :title="t('cloneUi.listView')" :aria-label="t('cloneUi.listView')" @click="viewMode = 'list'"><List :size="15" /></button>
            <button type="button" data-view="grid" :class="{ active: viewMode === 'grid' }" :title="t('cloneUi.gridView')" :aria-label="t('cloneUi.gridView')" @click="viewMode = 'grid'"><LayoutGrid :size="15" /></button>
          </div>
        </div>
      </div>

      <div v-if="activeStatusCard || query" class="ctl-filterbar">
        <span>{{ t('cloneUi.filtering', { name: [activeStatusCard?.label, query ? `“${query}”` : ''].filter(Boolean).join(' · ') }) }}</span>
        <button type="button" class="vg-link" @click="clearFilters">{{ t('cloneUi.clearFilter') }}</button>
      </div>

      <!-- ---------- List ---------- -->
      <div v-if="filteredRows.length && viewMode === 'list'" class="ctl-table">
        <div class="ctl-table__head ctl-grid-cols">
          <label class="ctl-check" :title="t('cloneUi.selectPage')">
            <input type="checkbox" :checked="allCurrentPageSelected" @change="toggleSelectCurrentPage" /><span />
          </label>
          <span>{{ t('cloneTasks.columns.task') }}</span>
          <span>{{ t('cloneTasks.columns.stage') }}</span>
          <span>{{ t('cloneTasks.columns.progress') }}</span>
          <span>{{ t('cloneTasks.columns.materials') }}</span>
          <span>{{ t('cloneTasks.columns.updated') }}</span>
          <span class="ctl-right">{{ t('cloneTasks.columns.actions') }}</span>
        </div>

        <article
          v-for="item in pagedRows"
          :key="item.id"
          :data-project-id="item.id"
          class="ctl-row ctl-grid-cols"
          :class="{ 'is-selected': selectedSet.has(item.id), 'is-failed': statusTone(item.status) === 'is-danger' }"
          @dblclick="onRowDblClick($event, item.id)"
        >
          <label class="ctl-check">
            <input type="checkbox" :checked="selectedSet.has(item.id)" @change="toggleSelected(item.id)" /><span />
          </label>

          <div class="ctl-task">
            <button type="button" class="ctl-thumb" :title="t('cloneUi.play')" @click="openVideoPreview(item)">
              <img v-if="coverKind(item) === 'image'" :src="itemCoverSrc(item)" alt="" loading="lazy" decoding="async" @error="markCoverBroken(item.id)" />
              <video v-else-if="coverKind(item) === 'video'" :src="`${itemCoverSrc(item)}#t=0.5`" muted preload="metadata" @error="markCoverBroken(item.id)" />
              <Video v-else :size="18" />
              <span v-if="itemPlayableVideoPath(item)" class="ctl-thumb__play"><Play :size="14" /></span>
            </button>
            <div class="ctl-task__copy">
              <div class="ctl-task__title">
                <button type="button" class="ctl-task__name" :title="item.title" @click="openTask(item.id)">{{ item.title }}</button>
                <button type="button" class="ctl-task__rename" :aria-label="t('cloneTasks.actions.rename')" @click="openRenameDialog(item)"><Pencil :size="13" /></button>
              </div>
              <div class="ctl-task__meta">
                <span class="ctl-mode" :class="item.runMode === 'auto' ? 'is-auto' : 'is-manual'">
                  <Sparkles v-if="item.runMode === 'auto'" :size="11" /><Hand v-else :size="11" />{{ humanRunMode(item.runMode) }}
                </span>
                <span v-if="item.selectedModelIdentityName" class="ctl-task__chip">{{ item.selectedModelIdentityName }}</span>
                <span class="ctl-task__ref" :title="item.referenceVideoName || item.referenceVideoPath"><FileVideo :size="12" />{{ shortPath(item.referenceVideoName || item.referenceVideoPath) }}</span>
              </div>
              <div v-if="item.lastError" class="ctl-task__error">
                <AlertTriangle :size="12" /><span>{{ compactError(item.lastError, 64) }}</span>
                <button type="button" @click.stop="openErrorDialog(item)">{{ t('cloneTasks.actions.viewError') }}</button>
              </div>
            </div>
          </div>

          <div class="ctl-stage">
            <span class="ctl-status" :class="`tone-${statusDotTone(item.status)}`"><i />{{ humanStatus(item.status) }}</span>
            <div v-if="cloneGroupAssignReady" class="clone-row-move-menu ctl-groupmove">
              <button type="button" class="ctl-groupchip" @click.stop="toggleRowMoveMenu(item.id)">
                <FolderOpen :size="12" /><span>{{ item.groupName || t('cloneTasks.groups.ungrouped') }}</span><ChevronDown :size="12" />
              </button>
              <div v-if="rowMoveMenuOpenId === item.id" class="vg-menu vg-menu--left ctl-menu ctl-menu--groups">
                <button type="button" :class="{ 'is-checked': !item.groupId }" :disabled="assigningProjectId === item.id" @click.stop="assignProjectToGroup(item.id)">
                  <FolderOpen :size="14" /><span class="ctl-menu__label">{{ t('cloneTasks.groups.ungrouped') }}</span>
                </button>
                <button
                  v-for="group in groups.filter((entry) => entry.id !== '__ungrouped__')"
                  :key="`${item.id}-${group.id}`"
                  type="button"
                  :class="{ 'is-checked': item.groupId === group.id }"
                  :disabled="assigningProjectId === item.id"
                  @click.stop="assignProjectToGroup(item.id, group.id)"
                >
                  <FolderOpen :size="14" /><span class="ctl-menu__label">{{ group.name }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="ctl-progress">
            <div class="ctl-progress__top">
              <strong>{{ item.progressPercent }}%</strong>
              <span>{{ t('cloneUi.stepOf', { n: Math.min(6, stepIndex(item.currentStep) + 1) }) }} · {{ humanStep(item.currentStep) }}</span>
            </div>
            <div class="ctl-steps" :class="`tone-${statusDotTone(item.status)}`">
              <i
                v-for="index in 6"
                :key="`${item.id}-${index}`"
                :class="{ 'is-done': index - 1 < stepIndex(item.currentStep) || item.progressPercent >= 100, 'is-current': index - 1 === stepIndex(item.currentStep) && item.progressPercent < 100 }"
              />
            </div>
          </div>

          <div class="ctl-assets">
            <span class="ctl-assets__counts"><ImageIcon :size="12" />{{ item.productReferenceImageCount || 0 }}<Video :size="12" />{{ item.generatedVideoCount || 0 }}</span>
            <span class="ctl-assets__output" :class="{ 'is-ready': item.finalOutputPath }">
              <CheckCircle2 v-if="item.finalOutputPath" :size="12" /><Clock3 v-else :size="12" />
              {{ item.finalOutputPath ? t('cloneUi.outputReady') : t('cloneUi.outputPending') }}
            </span>
          </div>

          <div class="ctl-updated" :title="formatTime(item.updatedAt)">
            <strong>{{ formatClockOnly(item.updatedAt) }}</strong>
            <span>{{ formatDateOnly(item.updatedAt) }}</span>
          </div>

          <div class="ctl-actions">
            <button type="button" class="vg-btn vg-btn--sm ctl-open" @click="openTask(item.id)">{{ t('cloneUi.open') }}<ChevronRight :size="14" /></button>
            <button type="button" class="vg-icon-btn" :title="t('cloneUi.play')" :disabled="!itemPlayableVideoPath(item)" @click="openVideoPreview(item)"><Play :size="15" /></button>
            <div class="clone-row-action-menu ctl-more">
              <button type="button" class="vg-icon-btn" :aria-label="t('cloneTasks.actions.more')" @click.stop="toggleRowActionMenu(item.id)"><MoreHorizontal :size="16" /></button>
              <div v-if="rowActionMenuOpenId === item.id" class="vg-menu ctl-menu">
                <button type="button" @click.stop="openRenameDialog(item); rowActionMenuOpenId = ''"><Pencil :size="14" />{{ t('cloneTasks.actions.rename') }}</button>
                <button v-if="cloneGroupAssignReady" type="button" @click.stop="openMoveSingleDialog(item); rowActionMenuOpenId = ''"><FolderInput :size="14" />{{ t('cloneUi.move') }}</button>
                <button v-if="subtitleFeatureReady && item.finalOutputPath && !itemHasAppliedSubtitle(item)" type="button" @click.stop="openSingleSubtitleDialog(item); rowActionMenuOpenId = ''"><Captions :size="14" />{{ t('cloneUi.subtitle') }}</button>
                <div class="ctl-menu__divider" />
                <button type="button" class="danger" :disabled="removingId === item.id" @click.stop="confirmRemoveTask(item); rowActionMenuOpenId = ''"><Trash2 :size="14" />{{ t('cloneTasks.actions.delete') }}</button>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- ---------- Grid ---------- -->
      <div v-else-if="filteredRows.length && viewMode === 'grid'" class="ctl-cards">
        <article
          v-for="item in pagedRows"
          :key="item.id"
          :data-project-id="item.id"
          class="ctl-card"
          :class="{ 'is-selected': selectedSet.has(item.id) }"
          @dblclick="onRowDblClick($event, item.id)"
        >
          <div class="ctl-card__media">
            <img v-if="coverKind(item) === 'image'" :src="itemCoverSrc(item)" alt="" loading="lazy" decoding="async" @error="markCoverBroken(item.id)" />
            <video v-else-if="coverKind(item) === 'video'" :src="`${itemCoverSrc(item)}#t=0.5`" muted preload="metadata" @error="markCoverBroken(item.id)" />
            <Video v-else :size="26" />
            <label class="ctl-check ctl-card__check"><input type="checkbox" :checked="selectedSet.has(item.id)" @change="toggleSelected(item.id)" /><span /></label>
            <span class="ctl-status ctl-card__status" :class="`tone-${statusDotTone(item.status)}`"><i />{{ humanStatus(item.status) }}</span>
            <button v-if="itemPlayableVideoPath(item)" type="button" class="ctl-card__play" :title="t('cloneUi.play')" @click="openVideoPreview(item)"><Play :size="18" /></button>
          </div>
          <div class="ctl-card__body">
            <div class="ctl-task__title">
              <button type="button" class="ctl-task__name" :title="item.title" @click="openTask(item.id)">{{ item.title }}</button>
            </div>
            <div class="ctl-task__meta">
              <span class="ctl-mode" :class="item.runMode === 'auto' ? 'is-auto' : 'is-manual'">{{ humanRunMode(item.runMode) }}</span>
              <span v-if="item.selectedModelIdentityName" class="ctl-task__chip">{{ item.selectedModelIdentityName }}</span>
            </div>
            <div class="ctl-progress">
              <div class="ctl-progress__top"><strong>{{ item.progressPercent }}%</strong><span>{{ humanStep(item.currentStep) }}</span></div>
              <div class="ctl-steps" :class="`tone-${statusDotTone(item.status)}`">
                <i v-for="index in 6" :key="`${item.id}-g-${index}`" :class="{ 'is-done': index - 1 < stepIndex(item.currentStep) || item.progressPercent >= 100, 'is-current': index - 1 === stepIndex(item.currentStep) && item.progressPercent < 100 }" />
              </div>
            </div>
            <div v-if="item.lastError" class="ctl-task__error">
              <AlertTriangle :size="12" /><span>{{ compactError(item.lastError, 40) }}</span>
              <button type="button" @click.stop="openErrorDialog(item)">{{ t('cloneTasks.actions.viewError') }}</button>
            </div>
          </div>
          <footer class="ctl-card__foot">
            <span class="ctl-card__time"><Clock3 :size="12" />{{ formatDateOnly(item.updatedAt) }} {{ formatClockOnly(item.updatedAt) }}</span>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('cloneTasks.actions.rename')" @click="openRenameDialog(item)"><Pencil :size="14" /></button>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" :title="t('cloneTasks.actions.delete')" :disabled="removingId === item.id" @click="confirmRemoveTask(item)"><Trash2 :size="14" /></button>
            <button type="button" class="vg-btn vg-btn--sm" @click="openTask(item.id)">{{ t('cloneUi.open') }}</button>
          </footer>
        </article>
      </div>

      <!-- ---------- Empty ---------- -->
      <div v-else class="ctl-empty">
        <div class="ctl-empty__art"><LoaderCircle v-if="loading" :size="26" class="vg-spin" /><Wand2 v-else :size="26" /></div>
        <template v-if="loading">
          <strong>{{ t('cloneTasks.empty.loading') }}</strong><span>{{ t('cloneTasks.empty.wait') }}</span>
        </template>
        <template v-else-if="rows.length">
          <strong>{{ t('cloneUi.noMatch') }}</strong><span>{{ t('cloneUi.noMatchDesc') }}</span>
          <button type="button" class="vg-btn vg-btn--sm" @click="clearFilters(); activeGroupId = '__all__'">{{ t('cloneUi.clearFilter') }}</button>
        </template>
        <template v-else>
          <strong>{{ t('cloneTasks.empty.title') }}</strong><span>{{ t('cloneTasks.empty.desc') }}</span>
          <div class="ctl-empty__actions">
            <button type="button" class="vg-btn vg-btn--primary" :disabled="creating" @click="startTask('auto')"><Sparkles :size="16" />{{ t('cloneTasks.runMode.auto') }}</button>
            <button type="button" class="vg-btn" :disabled="creating" @click="startTask('manual')"><Hand :size="16" />{{ t('cloneTasks.runMode.manual') }}</button>
          </div>
        </template>
      </div>

      <!-- ---------- Footer / pagination ---------- -->
      <footer v-if="filteredRows.length" class="ctl-pager">
        <span class="ctl-pager__summary">{{ t('cloneTasks.pagination.summary', { count: filteredRows.length, start: currentPageStart, end: currentPageEnd }) }}</span>
        <div class="ctl-pager__controls">
          <button type="button" class="ctl-pagebtn" :disabled="currentPage <= 1" @click="goToPrevPage"><ChevronLeft :size="15" /></button>
          <button v-for="page in visiblePageNumbers" :key="page" type="button" class="ctl-pagebtn" :class="{ 'is-active': currentPage === page }" @click="goToPage(page)">{{ page }}</button>
          <button type="button" class="ctl-pagebtn" :disabled="currentPage >= pageCount" @click="goToNextPage"><ChevronRight :size="15" /></button>
          <div class="clone-list-page-size-wrap ctl-pagesize">
            <button type="button" class="vg-btn vg-btn--sm" :aria-expanded="pageSizeMenuOpen" @click="togglePageSizeMenu">{{ t('cloneUi.perPage', { n: pageSize }) }}<ChevronDown :size="13" /></button>
            <div v-if="pageSizeMenuOpen" class="vg-menu vg-menu--up ctl-menu">
              <button v-for="option in pageSizeOptions" :key="option" type="button" :class="{ 'is-checked': pageSize === option }" @click="selectPageSize(option)">{{ t('cloneUi.perPage', { n: option }) }}</button>
            </div>
          </div>
        </div>
      </footer>
    </section>

    <!-- ============ Floating selection bar ============ -->
    <transition name="ctl-bar">
      <div v-if="selectedIds.length" class="ctl-selbar">
        <span class="ctl-selbar__count"><b>{{ selectedIds.length }}</b>{{ t('cloneTasks.selectedCount', { count: selectedIds.length }) }}</span>
        <span class="ctl-selbar__meta">{{ t('cloneTasks.selection.exportable') }} {{ exportableSelectedCount }} · {{ t('cloneTasks.selection.subtitleReady') }} {{ subtitleEligibleSelectedCount }}</span>
        <span class="ctl-selbar__sep" />
        <button type="button" :disabled="exporting || !exportableSelectedCount" @click="exportSelectedFinalVideos"><Download :size="14" />{{ exporting ? t('cloneTasks.actions.exporting') : t('cloneUi.exportFinals') }}</button>
        <button v-if="cloneGroupAssignReady" type="button" @click="openMoveBatchDialog"><FolderInput :size="14" />{{ t('cloneUi.move') }}</button>
        <button v-if="subtitleFeatureReady" type="button" :disabled="!subtitleEligibleSelectedCount" @click="openBatchSubtitleDialog"><Captions :size="14" />{{ t('cloneUi.subtitle') }}</button>
        <button type="button" class="danger" :disabled="Boolean(removingId)" @click="confirmBatchRemoveTasks"><Trash2 :size="14" />{{ removingId ? t('cloneTasks.actions.deleting') : t('cloneUi.delete') }}</button>
        <button type="button" class="ctl-selbar__close" :title="t('cloneUi.clearSelection')" @click="selectedIds = []"><X :size="15" /></button>
      </div>
    </transition>
    <transition name="vg-toast">
      <div v-if="batchExportMessage && !selectedIds.length" class="vg-toast vg-toast--success ctl-toast">
        <CheckCircle2 :size="16" /><span>{{ batchExportMessage }}</span>
        <button type="button" class="vg-icon-btn vg-icon-btn--sm" @click="batchExportMessage = ''"><X :size="14" /></button>
      </div>
    </transition>

    <!-- ============ Dialogs ============ -->
    <div v-if="errorDialogOpen" class="vg-backdrop" @click.self="closeErrorDialog">
      <section class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" @click.stop>
        <header class="vg-dialog__head">
          <div class="vg-dialog__title"><span class="vg-dialog__title-icon ctl-icon-danger"><AlertTriangle :size="20" /></span><div><h2>{{ t('autoUi.k_6bd471fe24ae') }}</h2><p>{{ errorDialogTitle }}</p></div></div>
          <button type="button" class="vg-icon-btn" :aria-label="t('cloneUi.close')" @click="closeErrorDialog"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body"><pre class="ctl-error-text">{{ errorDialogMessage }}</pre></div>
      </section>
    </div>

    <div v-if="renameDialogOpen" class="vg-backdrop" @click.self="closeRenameDialog">
      <form class="vg-dialog ctl-dialog-sm" role="dialog" aria-modal="true" @click.stop @submit.prevent="submitRename">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><Pencil :size="20" /></span><div><h2>{{ t('autoUi.k_29f5ec945b98') }}</h2><p>{{ t('autoUi.k_cf099d4c47c6') }}</p></div></div>
          <button type="button" class="vg-icon-btn" :disabled="savingRename" @click="closeRenameDialog"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body">
          <label class="vg-field"><span class="vg-field__label">{{ t('autoUi.k_2e3046989973') }}</span><input v-model.trim="renameDraft" class="vg-input" type="text" maxlength="80" autofocus :placeholder="t('autoUi.k_5169b9ecce30')" /></label>
        </div>
        <footer class="vg-dialog__foot"><div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" :disabled="savingRename" @click="closeRenameDialog">{{ t('autoUi.k_4d0b4688c787') }}</button>
          <button type="submit" class="vg-btn vg-btn--primary" :disabled="savingRename || !renameDraft.trim()">{{ savingRename ? t('autoUi.k_d70d425039f2') : t('autoUi.k_fadf24dbc5a9') }}</button>
        </div></footer>
      </form>
    </div>

    <div v-if="videoPreviewDialogOpen && videoPreviewItem" class="vg-backdrop" @click.self="closeVideoPreview">
      <section class="vg-dialog vg-dialog--wide ctl-preview" role="dialog" aria-modal="true" @click.stop>
        <header class="vg-dialog__head">
          <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><Play :size="20" /></span><div><h2>{{ videoPreviewItem.title || t('autoUi.k_891a69798937') }}</h2><p>{{ safeText(shortPath(itemPlayableVideoPath(videoPreviewItem)), t('autoUi.k_b31b6e8ace7e')) }}</p></div></div>
          <button type="button" class="vg-icon-btn" :disabled="videoPreviewSaving" @click="closeVideoPreview"><X :size="18" /></button>
        </header>
        <div class="ctl-preview__body">
          <div class="ctl-preview__player">
            <video v-if="itemPlayableVideoPath(videoPreviewItem)" :src="toFileSrc(itemPlayableVideoPath(videoPreviewItem), videoPreviewItem.updatedAt)" controls preload="metadata" autoplay />
            <div v-else class="ctl-preview__empty"><Video :size="28" />{{ t('autoUi.k_7422247d9267') }}</div>
          </div>
          <aside class="ctl-preview__side">
            <dl class="ctl-kv">
              <div><dt>{{ t('cloneTasks.columns.stage') }}</dt><dd><span class="ctl-status" :class="`tone-${statusDotTone(videoPreviewItem.status)}`"><i />{{ humanStatus(videoPreviewItem.status) }}</span></dd></div>
              <div><dt>{{ t('autoUi.k_2b43bab7b2d0').replace(/[:：]\s*$/, '') }}</dt><dd>{{ videoPreviewItem.selectedModelIdentityName || t('autoUi.k_9e035909e964') }}</dd></div>
              <div><dt>{{ t('cloneUi.updated') }}</dt><dd>{{ formatTime(videoPreviewItem.updatedAt) }}</dd></div>
            </dl>
            <div class="ctl-preview__actions">
              <button type="button" class="vg-btn vg-btn--primary" :disabled="!videoPreviewItem.id" @click="openTask(videoPreviewItem.id)"><ExternalLink :size="15" />{{ t('autoUi.k_0d428278d9d4') }}</button>
              <button type="button" class="vg-btn" :disabled="!itemPlayableVideoPath(videoPreviewItem) || videoPreviewSaving" @click="savePreviewVideo"><Download :size="15" />{{ videoPreviewSaving ? t('autoUi.k_d70d425039f2') : t('autoUi.k_1ec4db03f027') }}</button>
              <button type="button" class="vg-btn" :disabled="!itemPlayableVideoPath(videoPreviewItem)" @click="revealPreviewVideo"><FolderOpen :size="15" />{{ t('autoUi.k_1213bb4b8d53') }}</button>
              <button v-if="subtitleFeatureReady && !itemHasAppliedSubtitle(videoPreviewItem)" type="button" class="vg-btn" :disabled="!itemPlayableVideoPath(videoPreviewItem) || videoPreviewSaving" @click="openSingleSubtitleDialog(videoPreviewItem)"><Captions :size="15" />{{ t('autoUi.k_6e4c3e5ffee8') }}</button>
              <button v-if="itemHasAppliedSubtitle(videoPreviewItem)" type="button" class="vg-btn" :disabled="videoPreviewSaving" @click="revertSubtitleFromPreview">{{ videoPreviewSaving ? t('autoUi.k_ecd814390988') : t('autoUi.k_5d2a55f19c91') }}</button>
            </div>
          </aside>
        </div>
      </section>
    </div>

    <!-- 批量添加字幕：和「视频批量字幕」同一套标题 / 样式 / 实时预览 -->
    <SubtitleStudioDialog
      :open="subtitleDialogOpen"
      :mode="subtitleDialogMode"
      :count="subtitleTargetIds.length"
      :busy="subtitleDialogBusy"
      :preview-image="rows.find((item) => subtitleTargetIds.includes(item.id))?.coverAssetPath || ''"
      @close="closeSubtitleDialog"
      @submit="onSubtitleDialogSubmit"
    />

    <div v-if="groupDialogOpen" class="vg-backdrop" @click.self="closeGroupDialog">
      <form class="vg-dialog ctl-dialog-sm" role="dialog" aria-modal="true" @click.stop @submit.prevent="submitGroupDialog">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><FolderInput :size="20" /></span>
            <div>
              <h2>{{ groupDialogMode === 'create' ? t('autoUi.k_fa4ff6b10e32') : groupDialogMode === 'rename' ? t('autoUi.k_8f62b6b255c3') : groupDialogMode === 'move_batch' ? t('autoUi.k_b6c2525a1fb6') : t('autoUi.k_fe238ad8bfec') }}</h2>
              <p>{{ groupDialogMode === 'move_batch' ? t('autoUi.k_dcf7ccbc9a09', { p0: movingProjectIds.length }) : groupDialogMode === 'move_single' ? t('autoUi.k_5cbed79340b3') : t('autoUi.k_905f3ead8016') }}</p>
            </div>
          </div>
          <button type="button" class="vg-icon-btn" :disabled="savingGroup" @click="closeGroupDialog"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body">
          <label v-if="groupDialogMode === 'create' || groupDialogMode === 'rename'" class="vg-field">
            <span class="vg-field__label">{{ t('autoUi.k_65731c12ae52') }}</span>
            <input v-model.trim="groupDraft" class="vg-input" type="text" maxlength="40" autofocus :placeholder="t('autoUi.k_5b44baabf1b4')" />
          </label>
          <label v-else class="vg-field">
            <span class="vg-field__label">{{ t('autoUi.k_b8fdfa5a79c0') }}</span>
            <select v-model="moveTargetGroupId" class="vg-input vg-select">
              <option value="__ungrouped__">{{ t('autoUi.k_8de957a7b7a2') }}</option>
              <option v-for="group in groups.filter((item) => item.id !== '__ungrouped__')" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
          </label>
        </div>
        <footer class="vg-dialog__foot"><div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" :disabled="savingGroup" @click="closeGroupDialog">{{ t('autoUi.k_4d0b4688c787') }}</button>
          <button type="submit" class="vg-btn vg-btn--primary" :disabled="savingGroup || ((groupDialogMode === 'create' || groupDialogMode === 'rename') ? !groupDraft.trim() : false)">{{ savingGroup ? t('autoUi.k_d70d425039f2') : t('autoUi.k_fadf24dbc5a9') }}</button>
        </div></footer>
      </form>
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
/* Clone task list — vg design language, theme tokens only. */
.ctl-page { display: flex; flex-direction: column; gap: 14px; min-height: 100%; padding: 16px 20px 96px; }

/* ---------- head ---------- */
.ctl-head { display: flex; align-items: center; gap: 14px; }
.ctl-head__icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); flex-shrink: 0; }
.ctl-head__text { flex: 1; min-width: 0; }
.ctl-head__text h1 { font-size: 20px; font-weight: 800; line-height: 1.25; }
.ctl-head__text p { margin-top: 2px; font-size: 13px; color: var(--theme-text-muted); }
.ctl-head__actions { display: flex; align-items: center; gap: 8px; }
.ctl-count { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--vg-accent-soft); color: var(--vg-accent); font-size: 11px; font-weight: 700; }
.ctl-create { position: relative; }
.ctl-create-btn__more { display: inline-flex; align-items: center; align-self: stretch; margin: 0 -6px 0 0; padding: 0 2px; cursor: pointer; }
.ctl-create-btn__caret { margin-left: 2px; padding-left: 6px; border-left: 1px solid color-mix(in srgb, var(--theme-on-accent) 35%, transparent); box-sizing: content-box; }
.ctl-create__menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; width: 320px; padding: 6px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel); box-shadow: var(--theme-shadow-dialog); }
.ctl-create__title { padding: 6px 10px 6px; font-size: 11px; font-weight: 600; color: var(--theme-text-muted); }
.ctl-create__option { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 10px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; transition: background .12s, border-color .12s; }
.ctl-create__option:hover { background: var(--theme-panel-soft); border-color: var(--theme-border); }
.ctl-create__icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; }
.ctl-create__icon.is-auto { background: var(--vg-accent-soft); color: var(--vg-accent); }
.ctl-create__icon.is-manual { background: color-mix(in srgb, var(--vg-blue) 14%, transparent); color: var(--vg-blue); }
.ctl-create__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ctl-create__copy strong { font-size: 13px; }
.ctl-create__copy small { font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); }

/* ---------- stats ---------- */
.ctl-stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg); background: var(--theme-panel); }
.ctl-stat { position: relative; display: grid; grid-template-columns: 1fr auto; grid-template-areas: "label label" "value value" "helper helper"; align-items: end; gap: 2px 8px; padding: 14px 18px 13px; border: 0; border-left: 1px solid var(--theme-divider); background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; transition: background .15s; }
.ctl-stat:first-child { border-left: 0; }
.ctl-stat:hover:not(:disabled) { background: var(--theme-panel-soft); }
.ctl-stat:disabled { cursor: default; }
.ctl-stat::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: 0; height: 2px; border-radius: 2px 2px 0 0; background: transparent; transition: background .15s; }
.ctl-stat.is-active { background: color-mix(in srgb, var(--vg-accent) 6%, transparent); }
.ctl-stat.is-active::after { background: var(--stat-color, var(--vg-accent)); }
.ctl-stat__label { grid-area: label; display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--theme-text-secondary); }
.ctl-stat__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--stat-color, var(--theme-text-muted)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--stat-color, transparent) 18%, transparent); }
.ctl-stat__value { grid-area: value; margin-top: 4px; font-size: 26px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.ctl-stat__helper { grid-area: helper; font-size: 11px; color: var(--theme-text-muted); }
.ctl-stat.tone-all { --stat-color: var(--vg-accent); }
.ctl-stat.tone-running { --stat-color: var(--vg-blue); }
.ctl-stat.tone-success { --stat-color: var(--vg-green, var(--vg-accent)); }
.ctl-stat.tone-danger { --stat-color: var(--vg-red); }
.ctl-stat.tone-muted { --stat-color: var(--theme-text-muted); }
.ctl-stat:last-child { --stat-color: var(--vg-amber); }

/* ---------- workbench ---------- */
.ctl-bench { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg); background: var(--theme-panel); }
.ctl-toolbar { display: flex; align-items: center; gap: 12px; padding: 0 14px; min-height: 52px; border-bottom: 1px solid var(--theme-divider); }
.ctl-tabs { display: flex; align-items: stretch; align-self: stretch; gap: 2px; flex: 1; min-width: 0; }
.ctl-tab { position: relative; display: flex; align-items: center; }
.ctl-tab::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px 2px 0 0; background: transparent; }
.ctl-tab.is-active::after { background: var(--vg-accent); }
.ctl-tab__main { display: inline-flex; align-items: center; gap: 6px; height: 100%; padding: 0 10px; border: 0; background: transparent; color: var(--theme-text-muted); font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.ctl-tab__main:hover { color: var(--theme-text); }
.ctl-tab.is-active .ctl-tab__main { color: var(--theme-text); font-weight: 700; }
.ctl-tab__main em { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-style: normal; font-size: 11px; font-weight: 600; line-height: 18px; text-align: center; font-variant-numeric: tabular-nums; }
.ctl-tab.is-active .ctl-tab__main em { background: var(--vg-accent-soft); color: var(--vg-accent); }
.ctl-tab__main span { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.ctl-tab__more { display: grid; place-items: center; width: 22px; height: 22px; margin-left: -6px; margin-right: 2px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; opacity: 0; transition: opacity .12s; }
.ctl-tab:hover .ctl-tab__more, .ctl-tab.is-active .ctl-tab__more { opacity: 1; }
.ctl-tab__more:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.ctl-tab-add { display: inline-flex; align-items: center; gap: 4px; align-self: center; height: 28px; margin-left: 6px; padding: 0 10px; border: 1px dashed var(--theme-border-control); border-radius: 7px; background: transparent; color: var(--theme-text-muted); font-size: 12px; white-space: nowrap; cursor: pointer; }
.ctl-tab-add:hover { border-color: var(--vg-accent); color: var(--vg-accent); }
.ctl-toolbar__tools { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.ctl-search { width: 240px; }
.ctl-search .vg-input { padding-right: 26px; }
.ctl-search__clear { position: absolute; right: 6px; display: grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: var(--theme-control); color: var(--theme-text-muted); cursor: pointer; }
.ctl-viewtoggle { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); }
.ctl-viewtoggle button { display: grid; place-items: center; width: 28px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.ctl-viewtoggle button:hover { color: var(--theme-text); }
.ctl-viewtoggle button.active { background: var(--theme-panel); color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent-line); }
.ctl-filterbar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--theme-divider); background: color-mix(in srgb, var(--vg-accent) 5%, transparent); font-size: 12px; color: var(--theme-text-secondary); }

/* menus */
.ctl-menu { z-index: 45; min-width: 180px; }
.ctl-menu--groups { max-height: 320px; overflow-y: auto; }
.ctl-menu button svg { color: var(--theme-text-muted); }
.ctl-menu button.is-checked { color: var(--vg-accent); font-weight: 600; }
.ctl-menu button.is-checked svg { color: var(--vg-accent); }
.ctl-menu button.danger svg { color: var(--vg-red); }
.ctl-menu__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ctl-menu em { font-style: normal; font-size: 11px; color: var(--theme-text-muted); }
.ctl-menu__divider { height: 1px; margin: 4px 6px; background: var(--theme-divider); }

/* ---------- table ---------- */
.ctl-grid-cols { display: grid; grid-template-columns: 32px minmax(260px, 2.4fr) minmax(120px, .9fr) minmax(170px, 1.2fr) minmax(110px, .8fr) 92px 168px; align-items: center; gap: 16px; }
.ctl-table { display: flex; flex-direction: column; padding: 4px 8px 8px; }
.ctl-table__head { height: 38px; padding: 0 12px; font-size: 11px; font-weight: 600; letter-spacing: .02em; color: var(--theme-text-muted); }
.ctl-right { text-align: right; }
.ctl-row { position: relative; min-height: 84px; padding: 10px 12px; border: 1px solid transparent; border-radius: 10px; transition: background .12s, border-color .12s; }
.ctl-row + .ctl-row::before { content: ''; position: absolute; left: 12px; right: 12px; top: -1px; height: 1px; background: var(--theme-divider); }
.ctl-row:hover, .ctl-row:hover + .ctl-row { --row-divider: transparent; }
.ctl-row:hover { background: var(--theme-panel-soft); }
.ctl-row:hover::before, .ctl-row:hover + .ctl-row::before, .ctl-row.is-selected::before, .ctl-row.is-selected + .ctl-row::before { background: transparent; }
.ctl-row.is-selected { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); }

.ctl-check { position: relative; display: inline-grid; place-items: center; width: 18px; height: 18px; cursor: pointer; }
.ctl-check input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.ctl-check span { width: 16px; height: 16px; border: 1.5px solid var(--theme-border-control); border-radius: 4px; background: var(--theme-input); transition: background .12s, border-color .12s; }
.ctl-check input:checked + span { border-color: var(--vg-accent); background: var(--vg-accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.5l3 3 6-7'/%3E%3C/svg%3E") center / 12px no-repeat; }
.ctl-check input:focus-visible + span { box-shadow: 0 0 0 3px var(--vg-accent-soft); }

.ctl-task { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ctl-thumb { position: relative; display: grid; place-items: center; width: 48px; height: 64px; flex-shrink: 0; overflow: hidden; padding: 0; border: 0; border-radius: 8px; background: var(--theme-panel-soft); color: var(--theme-text-muted); box-shadow: inset 0 0 0 1px var(--theme-border); cursor: pointer; }
.ctl-thumb img, .ctl-thumb video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.ctl-thumb__play { position: absolute; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; opacity: 0; transition: opacity .15s; }
.ctl-thumb__play svg { margin-left: 2px; fill: currentColor; }
.ctl-thumb:hover .ctl-thumb__play { opacity: 1; }
.ctl-task__copy { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ctl-task__title { display: flex; align-items: center; gap: 4px; min-width: 0; }
.ctl-task__name { min-width: 0; padding: 0; border: 0; background: transparent; color: var(--theme-text); font-size: 14px; font-weight: 700; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.ctl-task__name:hover { color: var(--vg-accent); }
.ctl-task__rename { display: grid; place-items: center; width: 22px; height: 22px; flex-shrink: 0; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; opacity: 0; transition: opacity .12s; }
.ctl-row:hover .ctl-task__rename { opacity: 1; }
.ctl-task__rename:hover { background: var(--theme-control-hover); color: var(--theme-text); }
.ctl-task__meta { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; font-size: 12px; color: var(--theme-text-muted); }
.ctl-mode { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.ctl-mode.is-auto { background: var(--vg-accent-soft); color: var(--vg-accent); }
.ctl-mode.is-manual { background: color-mix(in srgb, var(--vg-blue) 14%, transparent); color: var(--vg-blue); }
.ctl-task__chip { height: 20px; padding: 0 7px; border: 1px solid var(--theme-border); border-radius: 6px; color: var(--theme-text-secondary); font-size: 11px; line-height: 18px; white-space: nowrap; }
.ctl-task__ref { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-task__ref svg { flex-shrink: 0; }
.ctl-task__error { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--vg-red); }
.ctl-task__error svg { flex-shrink: 0; }
.ctl-task__error span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-task__error button { flex-shrink: 0; padding: 0; border: 0; background: transparent; color: var(--vg-red); font-size: 12px; font-weight: 600; text-decoration: underline; cursor: pointer; }

.ctl-stage { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
.ctl-status { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--st) 14%, transparent); color: var(--st); font-size: 12px; font-weight: 600; white-space: nowrap; --st: var(--theme-text-muted); }
.ctl-status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ctl-status.tone-success { --st: var(--vg-green, var(--vg-accent)); }
.ctl-status.tone-running { --st: var(--vg-blue); }
.ctl-status.tone-running i { animation: ctl-pulse 1.4s ease-in-out infinite; }
.ctl-status.tone-danger { --st: var(--vg-red); }
.ctl-status.tone-draft { --st: var(--theme-text-muted); }
@keyframes ctl-pulse { 50% { opacity: .35; } }
.ctl-groupmove { position: relative; max-width: 100%; }
.ctl-groupchip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; height: 24px; padding: 0 8px; border: 1px solid var(--theme-border); border-radius: 7px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.ctl-groupchip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-groupchip:hover { border-color: var(--theme-border-control); color: var(--theme-text); }

.ctl-progress { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.ctl-progress__top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.ctl-progress__top strong { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ctl-progress__top span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--theme-text-muted); }
.ctl-steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; --sc: var(--vg-accent); }
.ctl-steps.tone-danger { --sc: var(--vg-red); }
.ctl-steps.tone-running { --sc: var(--vg-blue); }
.ctl-steps i { height: 5px; border-radius: 3px; background: var(--theme-panel-soft); box-shadow: inset 0 0 0 1px var(--theme-border); }
.ctl-steps i.is-done { background: var(--sc); box-shadow: none; }
.ctl-steps i.is-current { background: color-mix(in srgb, var(--sc) 45%, transparent); box-shadow: none; animation: ctl-pulse 1.6s ease-in-out infinite; }

.ctl-assets { display: flex; flex-direction: column; gap: 5px; min-width: 0; font-size: 12px; }
.ctl-assets__counts { display: inline-flex; align-items: center; gap: 4px; color: var(--theme-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.ctl-assets__counts svg { color: var(--theme-text-muted); }
.ctl-assets__counts svg + svg, .ctl-assets__counts svg:nth-of-type(2) { margin-left: 6px; }
.ctl-assets__output { display: inline-flex; align-items: center; gap: 4px; color: var(--theme-text-muted); white-space: nowrap; }
.ctl-assets__output.is-ready { color: var(--vg-green, var(--vg-accent)); }

.ctl-updated { display: flex; flex-direction: column; gap: 2px; font-variant-numeric: tabular-nums; }
.ctl-updated strong { font-size: 13px; }
.ctl-updated span { font-size: 11px; color: var(--theme-text-muted); }

.ctl-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.ctl-open { padding-right: 6px; }
.ctl-more { position: relative; }
.vg-icon-btn:disabled { opacity: .35; cursor: not-allowed; }

/* ---------- grid ---------- */
.ctl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; padding: 14px; }
.ctl-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); transition: border-color .15s, box-shadow .15s, transform .15s; }
.ctl-card:hover { border-color: var(--theme-border-control); box-shadow: var(--theme-shadow-float); }
.ctl-card.is-selected { border-color: var(--vg-accent); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.ctl-card__media { position: relative; display: grid; place-items: center; aspect-ratio: 4 / 5; overflow: hidden; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.ctl-card__media img, .ctl-card__media video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.ctl-card__media::after { content: ''; position: absolute; inset: auto 0 0 0; height: 40%; background: linear-gradient(to top, rgba(0, 0, 0, .45), transparent); pointer-events: none; }
.ctl-card__check { position: absolute; top: 10px; left: 10px; z-index: 2; }
.ctl-card__status { position: absolute; top: 8px; right: 8px; z-index: 2; background: rgba(0, 0, 0, .55); backdrop-filter: blur(4px); }
.ctl-card__play { position: absolute; z-index: 2; display: grid; place-items: center; width: 46px; height: 46px; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .5); color: #fff; backdrop-filter: blur(4px); cursor: pointer; opacity: 0; transition: opacity .15s, background .15s; }
.ctl-card__play svg { margin-left: 3px; fill: currentColor; }
.ctl-card:hover .ctl-card__play { opacity: 1; }
.ctl-card__play:hover { background: var(--vg-accent); color: var(--theme-on-accent); }
.ctl-card__body { display: flex; flex-direction: column; gap: 9px; padding: 12px 12px 10px; min-width: 0; }
.ctl-card__foot { display: flex; align-items: center; gap: 4px; padding: 8px 10px 10px 12px; border-top: 1px solid var(--theme-divider); }
.ctl-card__time { display: inline-flex; align-items: center; gap: 5px; flex: 1; min-width: 0; overflow: hidden; font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.ctl-card__time svg { flex-shrink: 0; }

/* ---------- empty ---------- */
.ctl-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 320px; padding: 40px 16px; text-align: center; font-size: 13px; color: var(--theme-text-muted); }
.ctl-empty__art { display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 6px; border-radius: 18px; background: var(--vg-accent-soft); border: 1px dashed var(--vg-accent-line); color: var(--vg-accent); }
.ctl-empty strong { font-size: 16px; color: var(--theme-text); }
.ctl-empty__actions { display: flex; gap: 8px; margin-top: 8px; }

/* ---------- pager ---------- */
.ctl-pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--theme-divider); }
.ctl-pager__summary { font-size: 12px; color: var(--theme-text-muted); }
.ctl-pager__controls { display: flex; align-items: center; gap: 4px; }
.ctl-pagebtn { display: grid; place-items: center; min-width: 30px; height: 30px; padding: 0 6px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; font-variant-numeric: tabular-nums; }
.ctl-pagebtn:hover:not(:disabled) { background: var(--theme-panel-soft); color: var(--theme-text); }
.ctl-pagebtn.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); color: var(--vg-accent); }
.ctl-pagebtn:disabled { opacity: .35; cursor: not-allowed; }
.ctl-pagesize { position: relative; margin-left: 8px; }

/* ---------- selection bar ---------- */
.ctl-selbar { position: fixed; z-index: 60; left: calc(50% + var(--vg-sidebar-width, 240px) / 2); bottom: 26px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 6px 6px 6px 14px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel); box-shadow: var(--theme-shadow-dialog); white-space: nowrap; }
.ctl-selbar__count { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; }
.ctl-selbar__count b { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--vg-accent); color: var(--theme-on-accent); font-size: 12px; }
.ctl-selbar__meta { margin-left: 8px; font-size: 11px; color: var(--theme-text-muted); }
.ctl-selbar__sep { width: 1px; height: 18px; margin: 0 8px; background: var(--theme-divider); }
.ctl-selbar button { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; }
.ctl-selbar button:hover:not(:disabled) { background: var(--theme-panel-soft); color: var(--theme-text); }
.ctl-selbar button:disabled { opacity: .4; cursor: not-allowed; }
.ctl-selbar button.danger { color: var(--vg-red); }
.ctl-selbar button.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--vg-red) 12%, transparent); color: var(--vg-red); }
.ctl-selbar__close { width: 30px; justify-content: center; padding: 0 !important; margin-left: 4px; }
.ctl-bar-enter-active, .ctl-bar-leave-active { transition: opacity .16s, transform .16s; }
.ctl-bar-enter-from, .ctl-bar-leave-to { opacity: 0; transform: translate(-50%, 8px); }
.ctl-toast { gap: 10px; }

/* ---------- dialogs ---------- */
.ctl-dialog-sm { max-width: 460px; }
.ctl-icon-danger { background: color-mix(in srgb, var(--vg-red) 14%, transparent) !important; border-color: color-mix(in srgb, var(--vg-red) 35%, transparent) !important; color: var(--vg-red) !important; }
.ctl-error-text { max-height: 50vh; overflow: auto; margin: 0; padding: 12px 14px; border: 1px solid var(--theme-border); border-radius: 9px; background: var(--theme-panel-soft); color: var(--theme-text-secondary); font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
.ctl-preview { max-width: 960px; }
.ctl-preview__body { display: grid; grid-template-columns: minmax(0, 1fr) 280px; min-height: 0; }
.ctl-preview__player { display: grid; place-items: center; min-height: 420px; max-height: 72vh; padding: 16px; background: #000; }
.ctl-preview__player video { max-width: 100%; max-height: calc(72vh - 32px); border-radius: 6px; }
.ctl-preview__empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: rgba(255, 255, 255, .6); font-size: 13px; }
.ctl-preview__side { display: flex; flex-direction: column; gap: 16px; padding: 16px; border-left: 1px solid var(--theme-divider); }
.ctl-preview__actions { display: flex; flex-direction: column; gap: 8px; }
.ctl-preview__actions .vg-btn { justify-content: flex-start; }
.ctl-kv { display: flex; flex-direction: column; margin: 0; }
.ctl-kv > div { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--theme-divider); font-size: 12px; }
.ctl-kv dt { color: var(--theme-text-muted); }
.ctl-kv dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.ctl-subtitle { max-width: 760px; }
.ctl-subtitle__summary { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ctl-subtitle__summary > div { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 9px; background: var(--theme-panel-soft); }
.ctl-subtitle__summary span { font-size: 11px; color: var(--theme-text-muted); }
.ctl-subtitle__summary strong { font-size: 13px; }
.ctl-subtitle__section { display: flex; flex-direction: column; gap: 12px; }
.ctl-subtitle__heading { font-size: 13px; }
.ctl-subtitle__textarea { min-height: 120px; }
.ctl-subtitle__presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.ctl-preset { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; transition: border-color .12s, background .12s; }
.ctl-preset span { font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); }
.ctl-preset:hover { border-color: var(--theme-border-control); }
.ctl-preset.is-active { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.ctl-preset.is-active strong { color: var(--vg-accent); }
.ctl-subtitle__grid4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ctl-color { display: flex; gap: 8px; }
.ctl-color input[type='color'] { width: 40px; height: 34px; flex-shrink: 0; padding: 2px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-input); cursor: pointer; }

/* ---------- responsive ---------- */
@media (max-width: 1500px) {
  .ctl-open { display: none; }
  .ctl-grid-cols { gap: 12px; grid-template-columns: 32px minmax(240px, 2.4fr) minmax(110px, .9fr) minmax(150px, 1.2fr) minmax(104px, .8fr) 84px 72px; }
}
@media (max-width: 1240px) {
  .ctl-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ctl-stat:nth-child(4) { border-left: 0; }
  .ctl-stat:nth-child(n + 4) { border-top: 1px solid var(--theme-divider); }
  .ctl-grid-cols { grid-template-columns: 32px minmax(220px, 2fr) minmax(110px, 1fr) minmax(140px, 1.2fr) 72px; }
  .ctl-assets, .ctl-updated, .ctl-table__head > span:nth-child(5), .ctl-table__head > span:nth-child(6) { display: none; }
  .ctl-search { width: 180px; }
}
</style>
