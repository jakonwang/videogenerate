<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
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

const router = useRouter()
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
const sortOrder = ref<'updated_desc' | 'updated_asc'>('updated_desc')
const currentPage = ref(1)
const pageSize = 10
const runtimeLogs = ref<RuntimeLogItem[]>([])
const runtimeDialogOpen = ref(false)
let offRuntimeLog: (() => void) | undefined
const cloneApi = window.api.clone as any

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
  pendingOutput: rows.value.filter((item) => !String(item.finalOutputPath || '').trim()).length,
}))

const overviewCards = computed(() => [
  { key: 'all', label: '全部任务', helper: '总任务数', value: stats.value.all, tone: 'all', icon: Video },
  { key: 'running', label: '进行中', helper: '任务处理中', value: stats.value.running, tone: 'running', icon: LoaderCircle },
  { key: 'completed', label: '已完成', helper: '任务已完成', value: stats.value.completed, tone: 'success', icon: CheckCircle2 },
  { key: 'failed', label: '失败任务', helper: '任务失败', value: stats.value.failed, tone: 'danger', icon: AlertTriangle },
  { key: 'pending-output', label: '等待输出', helper: '草稿存储', value: stats.value.pendingOutput, tone: 'muted', icon: FolderOpen },
])

const groupSidebarItems = computed(() => {
  const ungroupedCount = rows.value.filter((item) => !String(item.groupId || '').trim()).length
  const dynamicGroups = groups.value.filter((item) => item.id !== '__ungrouped__')
  return [
    { id: '__all__', name: '全部任务', taskCount: rows.value.length, system: true },
    { id: '__ungrouped__', name: '未分组', taskCount: ungroupedCount, system: true },
    ...dynamicGroups.map((item) => ({ id: item.id, name: item.name, taskCount: item.taskCount, system: false })),
  ]
})

const activeGroupLabel = computed(() => {
  const current = groupSidebarItems.value.find((item) => item.id === activeGroupId.value)
  return current?.name || '全部任务'
})

const statusTabs = computed(() => [
  { key: 'all' as const, label: `全部 (${stats.value.all})` },
  { key: 'draft' as const, label: `草稿 (${stats.value.draft})` },
  { key: 'running' as const, label: `进行中 (${stats.value.running})` },
  { key: 'completed' as const, label: `已完成 (${stats.value.completed})` },
  { key: 'failed' as const, label: `失败 (${stats.value.failed})` },
])

const selectedSet = computed(() => new Set(selectedIds.value))
const selectedRows = computed(() => filteredRows.value.filter((item) => selectedSet.value.has(item.id)))
const exportableSelectedCount = computed(() => selectedRows.value.filter((item) => String(item.finalOutputPath || '').trim()).length)
const allFilteredSelected = computed(() => filteredRows.value.length > 0 && filteredRows.value.every((item) => selectedSet.value.has(item.id)))
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
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function toFileSrc(input?: string) {
  const text = String(input || '').trim()
  if (!text) return ''
  if (/^(https?:|data:|vg:|file:)/i.test(text)) return text
  return `vg://file?path=${encodeURIComponent(text)}`
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
  const d = new Date(value)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDateOnly(value?: number) {
  if (!value) return '--'
  const d = new Date(value)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
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
      ? `已导出 ${exportedCount} 个成片，跳过 ${skippedCount} 个未出片或文件缺失任务。`
      : `已导出 ${exportedCount} 个成片。`
    pushRuntimeLog(`[clone-task-list] export completed exported=${exportedCount} skipped=${skippedCount}`, skippedCount ? 'info' : 'success')
    if (exportedCount > 0) {
      await window.api.shell.openPath(result.outputDir)
    } else {
      window.alert('所选任务中没有可导出的成片。')
    }
  } catch (error: any) {
    const message = String(error?.message ?? error ?? '批量导出失败。')
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
    syncSelectionWithRows(rows.value)
    goToPage(currentPage.value)
    pushRuntimeLog(`[clone-task-list] refresh completed total=${rows.value.length}`, 'success')
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
  if (!id) return
  removingId.value = id
  pushRuntimeLog(`[clone-task-list] remove task id=${id}`, 'info')
  try {
    await window.api.clone.removeProject({ cloneProjectId: id })
    await refresh()
    pushRuntimeLog(`[clone-task-list] remove task completed id=${id}`, 'success')
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
    window.alert('请输入任务名称。')
    return
  }
  savingRename.value = true
  try {
    await window.api.clone.updateProjectMeta({ cloneProjectId, title })
    await refresh()
    closeRenameDialog()
  } catch (error: any) {
    window.alert(`重命名失败：${String(error?.message ?? error ?? '未知错误')}`)
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
  const name = String(window.prompt('请输入新的分组名称', String(group.name || '').trim()) || '').trim()
  if (!name) return
  try {
    groupMenuOpenId.value = ''
    await cloneApi.renameCloneGroup({ groupId: group.id, name })
    await refresh()
  } catch (error: any) {
    window.alert(String(error?.message ?? error ?? '重命名分组失败'))
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
    window.alert('请先选择要移动的任务。')
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
    window.alert(String(error?.message ?? error ?? '移动分组失败'))
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
        window.alert('请输入分组名称。')
        return
      }
      await cloneApi.createCloneGroup({ name })
    } else if (groupDialogMode.value === 'rename') {
      if (!hasCloneGroupApi('renameCloneGroup')) return
      const groupId = String(editingGroupId.value || '').trim()
      const name = String(groupDraft.value || '').trim()
      if (!groupId) return
      if (!name) {
        window.alert('请输入分组名称。')
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
    window.alert(String(error?.message ?? error ?? '操作失败'))
  } finally {
    savingGroup.value = false
  }
}

async function confirmRemoveGroup(group: CloneTaskGroup) {
  if (!group?.id || group.id === '__ungrouped__') return
  if (!cloneGroupRemoveReady.value) return
  const ok = window.confirm(`确认删除分组「${group.name}」吗？该分组下任务会回到未分组。`)
  if (!ok) return
  try {
    groupMenuOpenId.value = ''
    await cloneApi.removeCloneGroup({ groupId: group.id })
    if (activeGroupId.value === group.id) activeGroupId.value = '__ungrouped__'
    await refresh()
  } catch (error: any) {
    window.alert(String(error?.message ?? error ?? '删除分组失败'))
  }
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
                <h1>爆款视频复刻</h1>
                <span class="clone-console-hero__spark">✦</span>
              </div>
              <p>智能复刻热门视频，快速生成优质内容</p>
            </div>

            <div class="clone-console-hero__actions">
              <UiButton class="clone-console-hero__button" variant="secondary" :disabled="exporting || !selectedIds.length" @click="exportSelectedFinalVideos">
                {{ exporting ? '导出中...' : '批量导出' }}
              </UiButton>
              <div class="clone-console-run-mode">
                <button class="clone-console-run-mode__option" :class="{ 'is-active': createRunMode === 'auto' }" type="button" @click="createRunMode = 'auto'">
                  自动运行
                </button>
                <button class="clone-console-run-mode__option" :class="{ 'is-active': createRunMode === 'manual' }" type="button" @click="createRunMode = 'manual'">
                  手动运行
                </button>
              </div>
              <UiButton class="clone-console-hero__button clone-console-hero__button--primary" :disabled="creating || !createRunMode" @click="createTask">
                <Plus class="h-4 w-4" />
                {{ creating ? '创建中...' : '新建任务' }}
              </UiButton>
            </div>
          </header>

          <section class="clone-console-overview">
            <div class="clone-console-overview__cards">
              <article v-for="card in overviewCards" :key="card.key" class="clone-console-stat" :class="`tone-${card.tone}`">
                <span class="clone-console-stat__icon">
                  <component :is="card.icon" class="h-4 w-4" />
                </span>
                <div class="clone-console-stat__copy">
                  <strong>{{ card.label }}</strong>
                  <span>{{ card.helper }}</span>
                </div>
                <b>{{ card.value }}</b>
              </article>
            </div>
          </section>
        </section>

        <div v-if="selectedIds.length || batchExportMessage" class="clone-list-batch-bar">
          <span class="clone-list-batch-bar__summary">已选 {{ selectedIds.length }} 个任务，可导出 {{ exportableSelectedCount }} 个成片</span>
          <div class="clone-list-batch-bar__actions">
            <button v-if="selectedIds.length && cloneGroupAssignReady" class="clone-list-batch-action" type="button" @click="openMoveBatchDialog">移动到分组</button>
            <span v-if="batchExportMessage" class="clone-list-batch-bar__message">{{ batchExportMessage }}</span>
          </div>
        </div>

        <section class="clone-console-table">
          <div class="clone-console-table__groupbar">
            <div class="clone-console-table__groupbar-tabs">
              <div
                v-for="group in groupSidebarItems"
                :key="group.id"
                class="clone-console-group"
                :class="{ 'is-active': activeGroupId === group.id }"
              >
                <button type="button" class="clone-console-group__main" @click="activeGroupId = group.id as any">
                  <span>{{ group.name }}</span>
                  <em>{{ group.taskCount }}</em>
                </button>
                <div v-if="!group.system && (cloneGroupRenameReady || cloneGroupRemoveReady)" class="clone-group-menu">
                  <button type="button" class="clone-console-group__more" aria-label="更多操作" @click.stop="toggleGroupMenu(group.id)">
                    <MoreHorizontal class="h-3.5 w-3.5" />
                  </button>
                  <div v-if="groupMenuOpenId === group.id" class="clone-group-menu__dropdown">
                    <button v-if="cloneGroupRenameReady" type="button" class="clone-group-menu__item" @click.stop="openRenameGroupDialog(group as CloneTaskGroup)">重命名</button>
                    <button v-if="cloneGroupRemoveReady" type="button" class="clone-group-menu__item clone-group-menu__item--danger" @click.stop="confirmRemoveGroup(group as CloneTaskGroup)">删除</button>
                  </div>
                </div>
              </div>

              <button v-if="cloneGroupCreateReady" type="button" class="clone-console-group__create" @click="openCreateGroupDialog">
                <Plus class="h-3.5 w-3.5" />
                <span>新建分组</span>
              </button>
            </div>

            <div class="clone-console-table__groupbar-tools">
              <button class="clone-console-overview__tool" type="button" @click="toggleSortOrder">
                {{ sortOrder === 'updated_desc' ? '最近更新' : '最早更新' }}
                <ChevronDown class="h-4 w-4" />
              </button>
              <button class="clone-console-overview__tool" type="button">
                全部素材
                <ChevronDown class="h-4 w-4" />
              </button>
              <button class="clone-console-overview__icon" type="button" aria-label="筛选并全选当前结果" @click="toggleSelectAllFiltered">
                <span class="clone-console-overview__icon-bars"></span>
              </button>
              <button class="clone-console-table__viewtool is-active" type="button" aria-label="列表视图">
                <span class="clone-console-table__viewtool-bars"></span>
              </button>
              <button class="clone-console-table__viewtool" type="button" aria-label="网格视图">
                <span class="clone-console-table__viewtool-grid"></span>
              </button>
              <button class="clone-console-table__viewtool" type="button" aria-label="设置">
                <span class="clone-console-table__viewtool-dot"></span>
              </button>
            </div>
          </div>

          <div v-if="filteredRows.length" class="clone-console-table__body">
            <div class="clone-console-table__head">
              <label class="clone-console-table__check" aria-label="全选当前筛选任务">
                <input
                  type="checkbox"
                  :checked="allFilteredSelected"
                  @change="toggleSelectAllFiltered"
                />
                <span></span>
              </label>
              <span class="clone-console-table__headcell">预览</span>
              <span class="clone-console-table__headcell">任务信息</span>
              <span class="clone-console-table__headcell">阶段</span>
              <span class="clone-console-table__headcell">素材</span>
              <span class="clone-console-table__headcell">进度</span>
              <span class="clone-console-table__headcell">更新时间</span>
              <span class="clone-console-table__headcell">操作</span>
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
                  <button class="clone-console-row__rename" type="button" aria-label="修改任务名称" @click="openRenameDialog(item)">
                    <Pencil class="h-3.5 w-3.5" />
                  </button>
                </div>
                <div class="clone-console-row__meta">
                  <span class="clone-console-row__mode">{{ humanRunMode(item.runMode) }}</span>
                  <span class="clone-console-row__dot"></span>
                  <span class="clone-console-row__text">{{ item.selectedModelIdentityName || 'AI模特 003' }}</span>
                  <span class="clone-console-row__dot"></span>
                  <span class="clone-console-row__text">Ref {{ shortPath(item.referenceVideoName || item.referenceVideoPath) }}</span>
                </div>
                <div v-if="item.lastError" class="clone-console-row__error">
                  <span class="clone-console-row__error-text">{{ compactError(item.lastError, 72) }}</span>
                  <button class="clone-console-row__error-link" type="button" @click.stop="openErrorDialog(item)">查看错误</button>
                </div>
              </div>

              <div class="clone-console-row__stage">
                <div class="clone-console-row__statuswrap">
                  <span class="clone-console-row__status" :class="statusTone(item.status)">{{ humanStatus(item.status) }}</span>
                  <span class="clone-console-row__stepbadge" :class="stepTone(item.currentStep)">{{ humanStep(item.currentStep) }}</span>
                </div>
                <div v-if="cloneGroupAssignReady" class="clone-row-move-menu clone-row-move-menu--inline">
                  <button class="clone-console-row__groupmove" type="button" @click.stop="toggleRowMoveMenu(item.id)">
                    <span>{{ item.groupName || '移动到分组' }}</span>
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
                      未分组
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
                <strong>{{ item.productReferenceImageCount }} 图 / {{ item.generatedVideoCount || 0 }} 视频</strong>
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
                <button class="clone-console-row__action clone-console-row__action--play" type="button" @click="openTask(item.id)">
                  <Play class="h-4 w-4" />
                </button>
                <button class="clone-console-row__action clone-console-row__action--danger" type="button" :disabled="removingId === item.id" @click="confirmRemoveTask(item)">
                  <Trash2 class="h-4 w-4" />
                </button>
                <div class="clone-row-action-menu">
                  <button class="clone-console-row__action" type="button" aria-label="更多操作" @click.stop="toggleRowActionMenu(item.id)">
                    <MoreHorizontal class="h-4 w-4" />
                  </button>
                  <div v-if="rowActionMenuOpenId === item.id" class="clone-group-menu__dropdown clone-row-action-menu__dropdown">
                    <button type="button" class="clone-group-menu__item" @click.stop="openRenameDialog(item)">重命名</button>
                    <button type="button" class="clone-group-menu__item clone-group-menu__item--danger" @click.stop="confirmRemoveTask(item)">删除</button>
                  </div>
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
            <span class="clone-list-pagination__summary">共 {{ filteredRows.length }} 条</span>
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
              <button type="button" class="clone-list-page-size" disabled>{{ pageSize }} 条/页 <ChevronDown class="h-3.5 w-3.5" /></button>
            </div>
          </div>
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

    <div v-if="renameDialogOpen" class="clone-error-dialog-mask" @click.self="closeRenameDialog">
      <div class="clone-error-dialog clone-rename-dialog" @click.stop>
        <div class="clone-error-dialog__head">
          <div class="clone-error-dialog__copy">
            <strong>修改任务名称</strong>
            <span>仅更新当前复刻任务标题，不影响详情内容和素材。</span>
          </div>
          <UiButton variant="ghost" :disabled="savingRename" @click="closeRenameDialog">关闭</UiButton>
        </div>
        <div class="clone-rename-dialog__body">
          <label class="clone-rename-dialog__field">
            <span>任务名称</span>
            <input v-model.trim="renameDraft" type="text" maxlength="80" placeholder="请输入任务名称" @keydown.enter.prevent="submitRename" />
          </label>
          <div class="clone-rename-dialog__actions">
            <UiButton variant="secondary" :disabled="savingRename" @click="closeRenameDialog">取消</UiButton>
            <UiButton :disabled="savingRename || !renameDraft.trim()" @click="submitRename">
              {{ savingRename ? '保存中...' : '保存' }}
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
                  ? '新建分组'
                  : groupDialogMode === 'rename'
                    ? '重命名分组'
                    : groupDialogMode === 'move_batch'
                      ? '批量移动到分组'
                      : '移动到分组'
              }}
            </strong>
            <span>
              {{
                groupDialogMode === 'move_batch'
                  ? `将 ${movingProjectIds.length} 个任务移动到指定分组。`
                  : groupDialogMode === 'move_single'
                    ? '为当前任务选择一个归属分组。'
                    : '分组仅用于列表归类与快速查找。'
              }}
            </span>
          </div>
          <UiButton variant="ghost" :disabled="savingGroup" @click="closeGroupDialog">关闭</UiButton>
        </div>
        <div class="clone-rename-dialog__body">
          <label v-if="groupDialogMode === 'create' || groupDialogMode === 'rename'" class="clone-rename-dialog__field">
            <span>分组名称</span>
            <input v-model.trim="groupDraft" type="text" maxlength="40" placeholder="请输入分组名称" @keydown.enter.prevent="submitGroupDialog" />
          </label>
          <label v-else class="clone-rename-dialog__field">
            <span>目标分组</span>
            <select v-model="moveTargetGroupId" class="clone-group-select">
              <option value="__ungrouped__">未分组</option>
              <option v-for="group in groups.filter((item) => item.id !== '__ungrouped__')" :key="group.id" :value="group.id">
                {{ group.name }}
              </option>
            </select>
          </label>
          <div class="clone-rename-dialog__actions">
            <UiButton variant="secondary" :disabled="savingGroup" @click="closeGroupDialog">取消</UiButton>
            <UiButton
              :disabled="savingGroup || ((groupDialogMode === 'create' || groupDialogMode === 'rename') ? !groupDraft.trim() : false)"
              @click="submitGroupDialog"
            >
              {{ savingGroup ? '保存中...' : '保存' }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <RuntimeLogDialog
      v-model="runtimeDialogOpen"
      :logs="runtimeLogs"
      title="运行日志"
      description="实时查看复刻任务列表的刷新、新建、删除、导出以及主进程桥接过来的 clone 运行日志。"
      hint="列表页会聚合 /clone 相关运行日志"
      empty-description="在任务列表执行刷新、新建、删除、打开任务或导出操作后，这里会显示最新运行记录。"
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.clone-console-stat {
  min-height: 110px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--clone-card-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
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
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #e8f6ff;
}

.clone-console-stat__copy {
  display: grid;
  gap: 6px;
  min-width: 0;
  align-content: center;
  justify-items: start;
}

.clone-console-stat__copy strong {
  color: #f8fbff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.1;
  word-break: keep-all;
  white-space: nowrap;
}

.clone-console-stat__copy span {
  color: #91a5ca;
  font-size: 12px;
  line-height: 1;
  word-break: keep-all;
  white-space: nowrap;
}

.clone-console-stat b {
  color: #ffffff;
  font-size: 30px;
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
  gap: 10px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--clone-accent) 15%, transparent);
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

.clone-list-batch-bar__actions {
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.clone-list-batch-action {
  min-height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--clone-accent) 18%, transparent);
  background: rgba(11, 19, 31, 0.92);
  color: #edf4ff;
  font-size: 11px;
  font-weight: 700;
}

.clone-console-table {
  overflow: hidden;
  border-radius: 28px;
  border: 1px solid var(--clone-panel-border);
  background: linear-gradient(180deg, rgba(11, 19, 32, 0.98), rgba(7, 12, 21, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 20px 44px rgba(0, 0, 0, 0.22);
}

.clone-console-table__groupbar {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid rgba(57, 73, 111, 0.24);
}

.clone-console-table__groupbar-tabs {
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
}

.clone-console-group {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 40px;
  padding-right: 4px;
  border-radius: 12px;
  border: 1px solid transparent;
}

.clone-console-group.is-active {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.05);
}

.clone-console-group__main {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
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

.clone-console-group__main em {
  color: #7d93bc;
  font-style: normal;
  font-size: 11px;
}

.clone-console-group.is-active .clone-console-group__main::after {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: -13px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--clone-accent), #60a5fa);
}

.clone-console-group__more {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 9px;
  padding: 0;
}

.clone-console-group__create {
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

.clone-console-table__groupbar-tools {
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
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

.clone-rename-dialog__body {
  display: grid;
  gap: 16px;
}

.clone-rename-dialog__field {
  display: grid;
  gap: 8px;
}

.clone-rename-dialog__field span {
  color: #d8e3fb;
  font-size: 12px;
  font-weight: 600;
}

.clone-rename-dialog__field input {
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.18);
  background: rgba(10, 18, 30, 0.96);
  color: #eef4ff;
  font-size: 13px;
  outline: none;
}

.clone-group-select {
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(118, 136, 196, 0.18);
  background: rgba(10, 18, 30, 0.96);
  color: #eef4ff;
  font-size: 14px;
  outline: none;
}

.clone-rename-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .clone-console-table__groupbar-tools {
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .clone-console-table__groupbar {
    flex-direction: column;
    align-items: stretch;
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
