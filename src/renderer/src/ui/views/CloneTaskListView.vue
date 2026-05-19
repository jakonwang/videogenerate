<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, FolderOpen, LoaderCircle, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, Video, Wand2 } from 'lucide-vue-next'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'

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
const cloneApi = window.api.clone as any

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
  archived: rows.value.filter((item) => Boolean(item.archived)).length,
}))

const overviewCards = computed(() => [
  { key: 'all', label: '全部任务', value: stats.value.all, tone: 'all', icon: Video },
  { key: 'running', label: '进行中', value: stats.value.running, tone: 'running', icon: LoaderCircle },
  { key: 'completed', label: '已完成', value: stats.value.completed, tone: 'success', icon: CheckCircle2 },
  { key: 'failed', label: '失败任务', value: stats.value.failed, tone: 'danger', icon: AlertTriangle },
  { key: 'archived', label: '草稿箱', value: stats.value.archived, tone: 'muted', icon: FolderOpen },
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
  return toFileSrc(item.coverAssetPath || item.previewOutputPath || item.finalOutputPath || item.referenceVideoPath || '')
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
  void refresh()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
})
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
            <label class="clone-list-search clone-list-search--head" aria-label="搜索任务">
              <Search class="h-4 w-4" />
              <input v-model.trim="query" type="text" placeholder="搜索任务名称、素材或错误信息" />
              <span class="clone-list-search__shortcut">⌘K</span>
            </label>
            <UiButton variant="secondary" :disabled="exporting || !selectedIds.length" @click="exportSelectedFinalVideos">
              {{ exporting ? '导出中...' : '批量导出' }}
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

        <section class="clone-overview-panel">
          <div class="clone-overview-cards">
            <article v-for="card in overviewCards" :key="card.key" class="clone-overview-card" :class="`tone-${card.tone}`">
              <div class="clone-overview-card__head">
                <span class="clone-overview-card__icon">
                  <component :is="card.icon" class="h-4 w-4" />
                </span>
                <div class="clone-overview-card__label">{{ card.label }}</div>
                <strong>{{ card.value }}</strong>
              </div>
            </article>
          </div>
          <div class="clone-overview-filters">
            <button class="clone-list-sort clone-list-sort--panel" type="button" @click="toggleSortOrder">
              {{ sortOrder === 'updated_desc' ? '最近更新' : '最早更新' }}
              <ChevronDown class="h-4 w-4" />
            </button>
            <button class="clone-list-sort clone-list-sort--panel" type="button">
              全部素材
              <ChevronDown class="h-4 w-4" />
            </button>
            <button class="clone-list-icon-filter" type="button" @click="toggleSelectAllFiltered">⌯</button>
          </div>
        </section>

        <div v-if="selectedIds.length || batchExportMessage" class="clone-list-batch-bar">
          <span class="clone-list-batch-bar__summary">已选 {{ selectedIds.length }} 个任务，可导出 {{ exportableSelectedCount }} 个成片</span>
          <div class="clone-list-batch-bar__actions">
            <button v-if="selectedIds.length && cloneGroupAssignReady" class="clone-list-batch-action" type="button" @click="openMoveBatchDialog">移动到分组</button>
            <span v-if="batchExportMessage" class="clone-list-batch-bar__message">{{ batchExportMessage }}</span>
          </div>
        </div>

        <section class="clone-content-grid">
          <div class="clone-grid-main clone-grid-main--board">
            <div class="clone-group-strip">
              <div class="clone-group-strip__tabs">
                <div
                  v-for="group in groupSidebarItems"
                  :key="group.id"
                  class="clone-group-tab"
                  :class="{ 'is-active': activeGroupId === group.id }"
                >
                  <button type="button" class="clone-group-tab__main" @click="activeGroupId = group.id as any">
                    <span>{{ group.name }}</span>
                    <em>({{ group.taskCount }})</em>
                  </button>
                  <div v-if="!group.system && (cloneGroupRenameReady || cloneGroupRemoveReady)" class="clone-group-menu">
                    <button type="button" class="clone-group-tab__more" aria-label="更多操作" @click.stop="toggleGroupMenu(group.id)">
                      <MoreHorizontal class="h-3.5 w-3.5" />
                    </button>
                    <div v-if="groupMenuOpenId === group.id" class="clone-group-menu__dropdown">
                      <button v-if="cloneGroupRenameReady" type="button" class="clone-group-menu__item" @click.stop="openRenameGroupDialog(group as CloneTaskGroup)">重命名</button>
                      <button v-if="cloneGroupRemoveReady" type="button" class="clone-group-menu__item clone-group-menu__item--danger" @click.stop="confirmRemoveGroup(group as CloneTaskGroup)">删除</button>
                    </div>
                  </div>
                </div>
                <button v-if="cloneGroupCreateReady" type="button" class="clone-group-create" @click="openCreateGroupDialog">
                  <Plus class="h-3.5 w-3.5" />
                  <span>新建分组</span>
                </button>
              </div>
              <div class="clone-group-strip__tools">
                <button class="clone-group-strip__tool is-active" type="button" aria-label="列表视图">
                  <span class="clone-group-strip__tool-bars"></span>
                </button>
                <button class="clone-group-strip__tool" type="button" aria-label="网格视图">
                  <span class="clone-group-strip__tool-grid"></span>
                </button>
                <button class="clone-group-strip__tool" type="button" aria-label="设置">
                  ⚙
                </button>
              </div>
            </div>

            <div v-if="filteredRows.length" class="clone-task-list">
              <div class="clone-task-table-head">
                <label class="clone-task-table-head__cell cell-select clone-task-table-head__check" aria-label="全选当前筛选任务">
                  <input
                    type="checkbox"
                    :checked="allFilteredSelected"
                    @change="toggleSelectAllFiltered"
                  />
                  <span></span>
                </label>
                <span class="clone-task-table-head__cell cell-preview">预览</span>
                <span class="clone-task-table-head__cell cell-task">任务信息</span>
                <span class="clone-task-table-head__cell cell-stage">阶段</span>
                <span class="clone-task-table-head__cell cell-assets">素材</span>
                <span class="clone-task-table-head__cell cell-progress">进度</span>
                <span class="clone-task-table-head__cell cell-updated">更新时间</span>
                <span class="clone-task-table-head__cell cell-actions">操作</span>
              </div>

              <article v-for="item in pagedRows" :key="item.id" class="clone-task-row">
                <label class="clone-task-row__select">
                  <input
                    type="checkbox"
                    :checked="selectedSet.has(item.id)"
                    @change="toggleSelected(item.id)"
                  />
                  <span></span>
                </label>

                <div class="clone-task-row__thumb" :data-duration="pseudoDurationLabel(item)">
                  <img v-if="itemCoverSrc(item)" :src="itemCoverSrc(item)" :alt="item.title" />
                  <div v-else class="clone-task-row__thumb-empty">
                    <Video class="h-5 w-5" />
                  </div>
                </div>

                <div class="clone-task-row__main">
                  <div class="clone-task-row__title-wrap clone-task-row__cell clone-task-row__cell--task">
                    <div class="clone-task-row__title-line">
                      <h3>{{ item.title }}</h3>
                      <button class="clone-task-row__rename" type="button" aria-label="修改任务名称" @click="openRenameDialog(item)">
                        <Pencil class="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p v-if="compactDescription(item.description)">{{ compactDescription(item.description) }}</p>
                    <div class="clone-task-row__meta">
                      <span class="clone-task-row__meta-pill">{{ humanRunMode(item.runMode) }}</span>
                      <span class="clone-task-row__meta-pill">{{ item.selectedModelIdentityName || '未绑模特' }}</span>
                      <span class="clone-task-row__meta-pill">Ref {{ shortPath(item.referenceVideoName || item.referenceVideoPath) }}</span>
                    </div>
                  </div>

                  <div class="clone-task-row__head-side clone-task-row__cell clone-task-row__cell--stage">
                    <span class="clone-task-card__status" :class="statusTone(item.status)">{{ humanStatus(item.status) }}</span>
                    <span class="clone-task-card__step-tag" :class="stepTone(item.currentStep)">{{ humanStep(item.currentStep) }}</span>
                    <div v-if="cloneGroupAssignReady" class="clone-row-move-menu">
                      <button class="clone-task-row__group-link" type="button" @click.stop="toggleRowMoveMenu(item.id)">
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

                  <div class="clone-task-row__facts clone-task-row__cell clone-task-row__cell--assets">
                    <strong>{{ item.productReferenceImageCount }} 图 / {{ item.generatedVideoCount || 0 }} 视频</strong>
                    <span>{{ item.finalOutputPath ? 'Output Ready' : 'Output Pending' }}</span>
                  </div>

                  <div class="clone-task-row__progress clone-task-row__cell clone-task-row__cell--progress">
                    <div class="clone-task-row__progress-copy">
                      <strong>{{ item.progressPercent }}%</strong>
                    </div>
                    <div class="clone-task-row__track">
                      <span :style="{ width: `${item.progressPercent}%` }"></span>
                    </div>
                    <div class="clone-task-row__steps">
                      <span
                        v-for="(_, index) in 5"
                        :key="`${item.id}-${index}`"
                        class="clone-task-row__step"
                        :class="{ 'is-active': index === Math.max(0, Math.min(4, stepIndex(item.currentStep))), 'is-done': index < stepIndex(item.currentStep) }"
                      >
                        {{ index + 1 }}
                      </span>
                    </div>
                  </div>

                  <div class="clone-task-row__updated clone-task-row__cell clone-task-row__cell--updated">
                    <Clock3 class="h-4 w-4" />
                    <div class="clone-task-row__updated-copy">
                      <span>{{ formatDateOnly(item.updatedAt) }}</span>
                      <strong>{{ formatClockOnly(item.updatedAt) }}</strong>
                    </div>
                  </div>

                  <div class="clone-task-row__actions clone-task-row__cell clone-task-row__cell--actions">
                    <button class="clone-task-row__action clone-task-row__action--play" type="button" @click="openTask(item.id)">
                      <Play class="h-4 w-4" />
                    </button>
                    <button class="clone-task-row__action clone-task-row__action--danger" type="button" :disabled="removingId === item.id" @click="confirmRemoveTask(item)">
                      <Trash2 class="h-4 w-4" />
                    </button>
                    <div class="clone-row-action-menu">
                      <button class="clone-task-row__action" type="button" aria-label="更多操作" @click.stop="toggleRowActionMenu(item.id)">
                        <MoreHorizontal class="h-4 w-4" />
                      </button>
                      <div v-if="rowActionMenuOpenId === item.id" class="clone-group-menu__dropdown clone-row-action-menu__dropdown">
                        <button type="button" class="clone-group-menu__item" @click.stop="openRenameDialog(item)">重命名</button>
                        <button type="button" class="clone-group-menu__item clone-group-menu__item--danger" @click.stop="confirmRemoveTask(item)">删除</button>
                      </div>
                    </div>
                  </div>

                  <div v-if="item.lastError" class="clone-task-row__error">
                    <span class="clone-task-row__error-text">错误：{{ compactError(item.lastError) }}</span>
                    <button class="clone-task-row__error-link" type="button" @click.stop="openErrorDialog(item)">查看错误</button>
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
  </div>
</template>

<style scoped>
.clone-task-list-page {
  --clone-accent: var(--ds-primary, #22d3ee);
  min-height: 100%;
  padding: 4px 20px 16px;
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
  gap: 10px;
}

.clone-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 0;
}

.clone-list-head__copy {
  gap: 2px;
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
  font-size: 22px;
  line-height: 1.1;
  font-weight: 800;
}

.clone-list-head__spark {
  display: inline-flex;
  margin-left: 3px;
  color: #8b5cf6;
  font-size: 13px;
}

.clone-list-head__copy p {
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
  gap: 10px;
  flex-wrap: wrap;
}

.clone-list-search--head {
  min-width: 344px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(11, 18, 32, 0.94);
  border: 1px solid rgba(91, 107, 153, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.clone-list-search__shortcut {
  flex: 0 0 auto;
  min-width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.05);
  color: #7e90bb;
  font-size: 10px;
  font-weight: 700;
}

.clone-overview-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 15px 16px 15px 16px;
  border-radius: 20px;
  border: 1px solid rgba(54, 69, 108, 0.24);
  background: linear-gradient(180deg, rgba(10, 18, 34, 0.98), rgba(8, 15, 29, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.018),
    0 10px 24px rgba(3, 8, 20, 0.12);
}

.clone-overview-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
  align-items: center;
}

.clone-overview-card {
  display: block;
  min-height: 60px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(69, 85, 127, 0.14);
  background: linear-gradient(180deg, rgba(17, 25, 43, 0.96), rgba(12, 19, 34, 0.96));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.012);
}

.clone-overview-card__head {
  min-height: 60px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.clone-overview-card__icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.clone-overview-card__label {
  color: #c8d5f0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.clone-overview-card strong {
  color: #f8fbff;
  margin-left: auto;
  font-size: 15px;
  line-height: 1;
  font-weight: 800;
  min-width: 18px;
  text-align: right;
  white-space: nowrap;
}

.clone-overview-card.tone-all {
  box-shadow: inset 0 0 0 1px rgba(123, 92, 255, 0.1);
}

.clone-overview-card.tone-running {
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.1);
}

.clone-overview-card.tone-success {
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.1);
}

.clone-overview-card.tone-danger {
  box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.1);
}

.clone-overview-card.tone-muted {
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
}

.clone-overview-filters {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: center;
  min-height: 60px;
  padding-top: 1px;
}

.clone-list-sort--panel {
  min-width: 144px;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 13px;
  border-color: rgba(89, 106, 147, 0.12);
  align-self: center;
}

.clone-list-icon-filter {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  border: 1px solid rgba(89, 106, 147, 0.12);
  background: rgba(13, 22, 38, 0.94);
  color: #d2dcf6;
  font-size: 18px;
  align-self: center;
}

.clone-list-run-mode {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 4px;
  border-radius: 13px;
  border: 1px solid rgba(89, 106, 147, 0.1);
  background: linear-gradient(180deg, rgba(10, 18, 30, 0.98), rgba(8, 14, 24, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-list-run-mode__option {
  min-width: 104px;
  min-height: 30px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: 10px;
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

.clone-list-search,
.clone-list-sort,
.clone-list-view {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid rgba(89, 106, 147, 0.14);
  background: rgba(13, 22, 38, 0.94);
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
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  align-items: start;
  background: transparent;
}

.clone-grid-main {
  gap: 16px;
  min-width: 0;
  padding: 0;
  border-radius: 20px;
  border: 1px solid rgba(54, 69, 108, 0.24);
  background: linear-gradient(180deg, rgba(9, 17, 32, 0.99), rgba(8, 15, 29, 0.995));
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 12px 24px rgba(2, 6, 23, 0.16);
}

.clone-grid-main--board {
  gap: 0;
  padding: 0;
}

.clone-group-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 60px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(54, 69, 108, 0.22);
  background: linear-gradient(180deg, rgba(9, 17, 32, 0.99), rgba(8, 15, 29, 0.99));
}

.clone-group-strip__tabs {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.clone-group-strip__tabs::-webkit-scrollbar {
  display: none;
}

.clone-group-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-height: 60px;
}

.clone-group-tab::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 999px;
  background: transparent;
}

.clone-group-tab.is-active::after {
  background: linear-gradient(90deg, #7c5cff, #8b5cf6);
}

.clone-group-tab__main {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #c4d0ec;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.clone-group-tab.is-active .clone-group-tab__main {
  color: #f4f7ff;
}

.clone-group-tab__main em {
  color: #a9b5d0;
  font-style: normal;
}

.clone-group-tab.is-active .clone-group-tab__main em {
  color: #aab7d7;
}

.clone-group-tab__more {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(16, 24, 41, 0.84);
  color: #8ca0c8;
}

.clone-group-create {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 16px;
  border-radius: 13px;
  border: 1px solid rgba(96, 116, 178, 0.14);
  background: rgba(16, 24, 41, 0.7);
  color: #dce7ff;
  font-size: 12px;
  font-weight: 600;
}

.clone-group-strip__tools {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  margin-right: 2px;
}

.clone-group-strip__tool {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid rgba(89, 106, 147, 0.12);
  background: rgba(16, 24, 41, 0.72);
  color: #8fa4cc;
}

.clone-group-strip__tool.is-active {
  color: #dfe7ff;
  border-color: rgba(123, 92, 255, 0.26);
  background: rgba(64, 45, 132, 0.34);
}

.clone-group-strip__tool-bars {
  position: relative;
  width: 13px;
  height: 11px;
  display: inline-block;
}

.clone-group-strip__tool-bars::before,
.clone-group-strip__tool-bars::after,
.clone-group-strip__tool-bars {
  background:
    linear-gradient(#aab7d7, #aab7d7) 0 0 / 14px 2px no-repeat,
    linear-gradient(#aab7d7, #aab7d7) 0 5px / 14px 2px no-repeat,
    linear-gradient(#aab7d7, #aab7d7) 0 10px / 14px 2px no-repeat;
}

.clone-group-strip__tool-grid {
  width: 13px;
  height: 13px;
  display: inline-block;
  background:
    linear-gradient(#aab7d7, #aab7d7) 0 0 / 5px 5px no-repeat,
    linear-gradient(#aab7d7, #aab7d7) 9px 0 / 5px 5px no-repeat,
    linear-gradient(#aab7d7, #aab7d7) 0 9px / 5px 5px no-repeat,
    linear-gradient(#aab7d7, #aab7d7) 9px 9px / 5px 5px no-repeat;
}

.clone-task-list {
  display: grid;
  gap: 0;
  min-width: 0;
  padding: 2px 8px 10px;
}

.clone-task-table-head {
  display: grid;
  grid-template-columns: 32px 104px minmax(220px, 1.7fr) 148px 126px 174px 118px 116px;
  gap: 10px;
  align-items: center;
  min-height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(54, 69, 108, 0.18);
  color: #7f92bb;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.clone-task-table-head__cell {
  min-width: 0;
  align-self: center;
  line-height: 1;
}

.clone-task-table-head .cell-select,
.clone-task-table-head .cell-preview {
  text-align: left;
  padding-left: 1px;
}

.clone-task-table-head__check,
.clone-task-row__select {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.clone-task-table-head__check input,
.clone-task-row__select input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.clone-task-table-head__check span,
.clone-task-row__select span {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(140, 158, 196, 0.38);
  background: rgba(10, 18, 34, 0.96);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.clone-task-table-head__check input:checked + span,
.clone-task-row__select input:checked + span {
  border-color: color-mix(in srgb, var(--clone-accent) 56%, transparent);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--clone-accent) 85%, #0f172a), color-mix(in srgb, var(--clone-accent) 58%, #09111d));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),
    0 0 0 3px color-mix(in srgb, var(--clone-accent) 16%, transparent);
}

.clone-task-table-head__check input:checked + span::after,
.clone-task-row__select input:checked + span::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 3px;
  width: 4px;
  height: 8px;
  border-right: 2px solid #ffffff;
  border-bottom: 2px solid #ffffff;
  transform: rotate(45deg);
}

.clone-task-table-head .cell-task {
  text-align: left;
  padding-left: 0;
}

.clone-task-table-head .cell-stage,
.clone-task-table-head .cell-assets,
.clone-task-table-head .cell-progress {
  text-align: left;
  padding-left: 2px;
}

.clone-task-table-head .cell-updated {
  text-align: left;
  padding-left: 4px;
}

.clone-task-table-head .cell-actions {
  text-align: center;
  padding-right: 2px;
}

.clone-task-row {
  display: grid;
  grid-template-columns: 32px 104px minmax(220px, 1.7fr) 148px 126px 174px 118px 116px;
  gap: 10px;
  align-items: center;
  min-height: 104px;
  padding: 0 16px;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid rgba(40, 54, 90, 0.28);
  background: rgba(10, 18, 34, 0.34);
  box-shadow: none;
}

.clone-task-row:hover {
  background: rgba(15, 24, 41, 0.58);
}

.clone-task-row__select {
  place-self: start center;
  margin-top: 2px;
}

.clone-task-row__thumb {
  width: 92px;
  height: 78px;
  overflow: hidden;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.035);
  background: rgba(255, 255, 255, 0.03);
  position: relative;
}

.clone-task-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clone-task-row__thumb::after {
  content: attr(data-duration);
  position: absolute;
  right: 7px;
  bottom: 7px;
  min-height: 17px;
  padding: 0 5px;
  border-radius: 5px;
  background: rgba(3, 8, 18, 0.78);
  color: #f8fafc;
  font-size: 9px;
  line-height: 17px;
  font-weight: 700;
}

.clone-task-row__thumb-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #89a0c8;
}

.clone-task-row__main {
  display: contents;
}

.clone-task-row__cell {
  min-width: 0;
}

.clone-task-row__cell--task {
  padding-right: 4px;
  align-self: center;
}

.clone-task-row__title-wrap {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.clone-task-row__title-line {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.clone-task-row__title-wrap h3 {
  margin: 0;
  font-size: 13px;
  line-height: 1.25;
  font-weight: 700;
  color: #f4f7ff;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-task-row__rename {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(16, 25, 40, 0.92);
  color: #b7c7eb;
}

.clone-task-row__title-wrap p {
  margin: 0;
  color: #94a6cb;
  font-size: 12px;
  line-height: 1.4;
}

.clone-task-row__head-side {
  display: grid;
  gap: 4px;
  justify-items: start;
  align-content: center;
  padding-left: 2px;
}

.clone-task-row__meta {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  align-items: center;
}

.clone-task-row__meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(255, 255, 255, 0.02);
  color: #cad6f4;
  font-size: 10px;
  font-weight: 600;
}

.clone-task-row__facts {
  display: grid;
  gap: 3px;
  align-content: center;
  padding-left: 2px;
}

.clone-task-row__facts strong {
  color: #eef4ff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.clone-task-row__facts span {
  color: #91a5cc;
  font-size: 12px;
}

.clone-task-row__progress {
  display: grid;
  gap: 5px;
  align-content: center;
  padding-left: 2px;
}

.clone-task-row__progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.clone-task-row__progress-copy strong {
  font-size: 13px;
  line-height: 1;
  color: #f2f6ff;
}

.clone-task-row__progress-copy span {
  color: #98a6c3;
  font-size: 12px;
}

.clone-task-row__track {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.clone-task-row__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--clone-accent) 70%, white) 0%, var(--clone-accent) 100%);
}

.clone-task-row__steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 3px;
}

.clone-task-row__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin: 0 auto;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #98a6c3;
  font-size: 10px;
}

.clone-task-row__step.is-active {
  border-color: rgba(109, 93, 255, 0.52);
  color: #fff;
  box-shadow: 0 0 0 3px rgba(109, 93, 255, 0.12);
}

.clone-task-row__step.is-done {
  border-color: rgba(34, 197, 94, 0.36);
  color: #86efac;
}

.clone-task-row__updated {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #9aa7c4;
  font-size: 10px;
  justify-self: start;
  white-space: nowrap;
  padding-left: 4px;
}

.clone-task-row__updated-copy {
  display: grid;
  gap: 2px;
}

.clone-task-row__updated-copy strong {
  color: #d9e5ff;
  font-size: 11px;
  font-weight: 600;
}

.clone-task-row__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  justify-self: end;
  padding-right: 2px;
}

.clone-row-action-menu {
  position: relative;
  flex: 0 0 auto;
}

.clone-task-row__action {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(89, 106, 147, 0.1);
  background: rgba(9, 17, 28, 0.94);
}

.clone-task-row__action--play {
  color: color-mix(in srgb, var(--clone-accent) 72%, white);
}

.clone-task-row__action--danger {
  color: #ffb3bb;
}

.clone-task-row__group-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
  color: color-mix(in srgb, var(--clone-accent) 56%, #e4f1ff);
  font-size: 12px;
  font-weight: 700;
}

.clone-task-row__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.clone-task-row__error-text {
  min-width: 0;
  color: #ffb1b8;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-task-row__error-link {
  flex: 0 0 auto;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.22);
  background: rgba(239, 68, 68, 0.1);
  color: #fecaca;
  font-size: 11px;
  font-weight: 700;
}

.clone-task-row__error {
  grid-column: 3 / -1;
  margin-top: -2px;
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

.clone-list-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 10px;
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
  display: flex;
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

.clone-side-card--groups {
  padding: 16px;
}

.clone-group-list {
  display: grid;
  gap: 8px;
}

.clone-group-item {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.clone-group-item:hover {
  border-color: color-mix(in srgb, var(--clone-accent) 20%, transparent);
  background: rgba(255, 255, 255, 0.032);
}

.clone-group-item.is-active {
  border-color: color-mix(in srgb, var(--clone-accent) 40%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--clone-accent) 12%, rgba(255, 255, 255, 0.02)), rgba(255, 255, 255, 0.02));
  box-shadow: inset 2px 0 0 var(--clone-accent);
}

.clone-group-item__main {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.clone-group-item__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #edf3ff;
  font-size: 13px;
  font-weight: 600;
}

.clone-group-item__count {
  flex: 0 0 auto;
  min-width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #8fa5cd;
  font-size: 11px;
  font-weight: 700;
}

.clone-group-tool {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(9, 17, 28, 0.96);
  color: #b9caee;
  font-size: 11px;
  font-weight: 700;
}

.clone-group-menu {
  position: relative;
  flex: 0 0 auto;
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

.clone-group-menu__dropdown {
  right: 0;
  min-width: 132px;
}

.clone-row-action-menu__dropdown {
  right: 0;
  min-width: 132px;
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

.clone-row-move-menu {
  position: relative;
}

.clone-row-move-menu__dropdown {
  left: 0;
  right: auto;
  max-height: 220px;
  overflow: auto;
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

@media (max-width: 1380px) {
  .clone-content-grid {
    grid-template-columns: 204px minmax(0, 1fr);
  }

  .clone-task-table-head,
  .clone-task-row {
    grid-template-columns: 24px 76px minmax(180px, 1.3fr) 96px 90px 138px 84px 52px;
  }
}

@media (max-width: 1080px) {
  .clone-content-grid {
    grid-template-columns: 196px minmax(0, 1fr);
  }

  .clone-task-table-head {
    display: none;
  }

  .clone-task-row {
    grid-template-columns: 28px 104px minmax(0, 1fr);
    align-items: start;
  }

  .clone-task-row__main {
    display: grid;
    gap: 10px;
  }

  .clone-task-row__head-side {
    display: inline-flex;
    flex-wrap: wrap;
  }

  .clone-task-row__facts,
  .clone-task-row__updated,
  .clone-task-row__actions,
  .clone-task-row__progress {
    justify-self: stretch;
  }

  .clone-task-row__updated {
    justify-content: flex-start;
  }

  .clone-task-row__actions {
    justify-content: flex-start;
  }

  .clone-task-row__error {
    grid-column: auto;
  }
}

@media (max-width: 820px) {
  .clone-content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .clone-task-group-side {
    position: static;
  }

  .clone-task-row {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .clone-task-row__thumb {
    display: none;
  }
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

@media (max-width: 1320px) {
  .clone-content-grid {
    grid-template-columns: 196px minmax(0, 1fr);
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
}

@media (max-width: 860px) {
  .clone-list-head,
  .clone-list-head__actions,
  .clone-list-pagination,
  .clone-list-batch-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .clone-list-batch-bar__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
