<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  FolderOpen,
  Play,
  RefreshCcw,
  Sparkles,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-vue-next'
import RuntimeLogDialog from '../components/RuntimeLogDialog.vue'

type TaskStatus = 'draft' | 'running' | 'requires_manual' | 'completed' | 'failed'
type TaskLog = { id: string; level: 'info' | 'success' | 'error'; message: string; time: number }
type ShotTask = {
  id: string
  shotId: string
  shotIndex: number
  scriptText?: string
  imagePath: string
  prompt: string
  durationSec: number
  status: TaskStatus
  downloadDir?: string
  resultVideoPath?: string
  lastError?: string
  logs: TaskLog[]
  createdAt: number
  updatedAt: number
}
type TaskItem = {
  id: string
  sourceCloneProjectId?: string
  sourceCloneProjectTitle?: string
  status: TaskStatus
  totalShots: number
  completedShots: number
  failedShots: number
  waitingShots: number
  shots: ShotTask[]
  lastError?: string
  logs: TaskLog[]
  createdAt: number
  updatedAt: number
}
type CloneProjectSummary = {
  id: string
  title: string
  status: string
  updatedAt: number
  shotCount: number
}

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const importing = ref(false)
const runningShotId = ref('')
const runningQueue = ref(false)
const notice = ref('')
const errorText = ref('')
const projectLoadError = ref('')
const tasks = ref<TaskItem[]>([])
const cloneProjects = ref<CloneProjectSummary[]>([])
const selectedImportProjectIds = ref<string[]>([])
const selectedTaskId = ref('')
const selectedShotId = ref('')
const runtimeDialogOpen = ref(false)
const runtimeLogs = ref<TaskLog[]>([])
const cloneProjectIdInput = ref('')
const cloneProjectPage = ref(1)
const cloneProjectPageSize = 8

const currentCloneProjectId = computed(() => safeText(route.query.cloneProjectId, ''))
const selectedTask = computed(() => tasks.value.find((item) => item.id === selectedTaskId.value) || null)
const selectedShot = computed(() => selectedTask.value?.shots.find((item) => item.shotId === selectedShotId.value) || null)
const taskStats = computed(() => {
  const allProjects = tasks.value.length
  const allShots = tasks.value.reduce((sum, item) => sum + item.totalShots, 0)
  const completed = tasks.value.reduce((sum, item) => sum + item.completedShots, 0)
  const waiting = tasks.value.reduce((sum, item) => sum + item.waitingShots, 0)
  return { allProjects, allShots, completed, waiting }
})
const pendingShotCount = computed(() => {
  if (!selectedTask.value) return 0
  return selectedTask.value.shots.filter((item) => item.status === 'draft' || item.status === 'failed').length
})
const cloneProjectTotalPages = computed(() => Math.max(1, Math.ceil(cloneProjects.value.length / cloneProjectPageSize)))
const pagedCloneProjects = computed(() => {
  const start = (cloneProjectPage.value - 1) * cloneProjectPageSize
  return cloneProjects.value.slice(start, start + cloneProjectPageSize)
})

function safeText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function statusLabel(status: TaskStatus) {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'requires_manual') return '待人工处理'
  if (status === 'running') return '执行中'
  return '草稿'
}

function statusTone(status: TaskStatus) {
  if (status === 'completed') return 'is-success'
  if (status === 'failed') return 'is-danger'
  if (status === 'requires_manual') return 'is-warning'
  if (status === 'running') return 'is-info'
  return 'is-neutral'
}

function formatTime(value?: number) {
  if (!value) return '--'
  const date = new Date(value)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const ii = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${ii}`
}

function previewLabel(path: string) {
  const normalized = String(path || '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

async function withTimeout<T>(promise: Promise<T>, label: string, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function pushLogs(logs: TaskLog[]) {
  runtimeLogs.value = Array.isArray(logs) ? logs.slice().reverse().slice(0, 200) : []
}

function syncSelection(task?: TaskItem | null) {
  if (!task) return
  if (!selectedShotId.value || !task.shots.some((item) => item.shotId === selectedShotId.value)) {
    selectedShotId.value = task.shots[0]?.shotId || ''
  }
  pushLogs((task.shots.find((item) => item.shotId === selectedShotId.value)?.logs || task.logs || []) as TaskLog[])
}

async function loadCloneProjects() {
  projectLoadError.value = ''
  cloneProjects.value = []

  try {
    const summaries = ((await withTimeout(window.api.clone.listProjectSummaries(), 'listProjectSummaries')) as CloneProjectSummary[]) || []
    if (summaries.length) {
      cloneProjects.value = summaries.filter((item) => safeText(item.id, ''))
      return
    }
  } catch (error) {
    console.warn('[tiktok-creative] listProjectSummaries failed', error)
  }

  try {
    const projects = ((await withTimeout(window.api.clone.listProjects(), 'listProjects')) as any[]) || []
    cloneProjects.value = projects
      .map((item) => ({
        id: safeText(item?.id, ''),
        title: safeText(item?.title, '未命名复刻项目'),
        status: safeText(item?.status, 'draft'),
        updatedAt: Number(item?.updatedAt || item?.createdAt || Date.now()),
        shotCount: Number(item?.shotCount || item?.blueprint?.shots?.length || 0),
      }))
      .filter((item) => item.id)
  } catch (error: any) {
    const message = error?.message ?? String(error)
    projectLoadError.value = `读取复刻项目失败：${message}`
    return
  }

  if (!cloneProjects.value.length) {
    projectLoadError.value = '当前没有读取到可导入的复刻项目。请先确认复刻任务列表里已有项目。'
  }
  cloneProjectPage.value = 1
}

async function refresh() {
  loading.value = true
  try {
    tasks.value = (await window.api.tiktokCreative.list()) as TaskItem[]
    await loadCloneProjects()
    if (!selectedTaskId.value && tasks.value.length) {
      selectedTaskId.value = tasks.value[0].id
    }
    syncSelection(selectedTask.value)
  } finally {
    loading.value = false
  }
}

async function importFromCloneProject(cloneProjectId: string) {
  if (!cloneProjectId.trim()) return
  importing.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const task = (await window.api.tiktokCreative.createDraftFromCloneProject({ cloneProjectId })) as TaskItem
    selectedTaskId.value = task.id
    selectedShotId.value = task.shots[0]?.shotId || ''
    pushLogs(task.shots[0]?.logs || task.logs || [])
    notice.value = '已从复刻项目导入分镜图片和分镜视频提示词。'
    await refresh()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    importing.value = false
  }
}

async function importSelectedProjects() {
  const ids = [...selectedImportProjectIds.value]
  if (!ids.length) return
  importing.value = true
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.tiktokCreative.createDraftsFromCloneProjects({ cloneProjectIds: ids })
    notice.value = `已批量导入 ${ids.length} 个复刻项目。`
    selectedImportProjectIds.value = []
    await refresh()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    importing.value = false
  }
}

function toggleImportProject(projectId: string) {
  const id = safeText(projectId, '')
  if (!id) return
  if (selectedImportProjectIds.value.includes(id)) {
    selectedImportProjectIds.value = selectedImportProjectIds.value.filter((item) => item !== id)
  } else {
    selectedImportProjectIds.value = [...selectedImportProjectIds.value, id]
  }
}

function goCloneProjectPage(page: number) {
  cloneProjectPage.value = Math.min(Math.max(1, page), cloneProjectTotalPages.value)
}

async function startShot(shot: ShotTask) {
  if (!selectedTask.value) return
  runningShotId.value = shot.shotId
  errorText.value = ''
  notice.value = ''
  try {
    const updated = (await window.api.tiktokCreative.startShot({ id: selectedTask.value.id, shotId: shot.shotId })) as TaskItem
    tasks.value = tasks.value.map((item) => (item.id === updated.id ? updated : item))
    selectedTaskId.value = updated.id
    selectedShotId.value = shot.shotId
    syncSelection(updated)
    notice.value = `已启动第 ${shot.shotIndex + 1} 条分镜，请在 TikTok Creative Studio 中继续确认。`
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    runningShotId.value = ''
  }
}

async function startNextPendingShot() {
  if (!selectedTask.value) return
  runningQueue.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const updated = (await window.api.tiktokCreative.startNextPendingShot({ id: selectedTask.value.id })) as TaskItem
    tasks.value = tasks.value.map((item) => (item.id === updated.id ? updated : item))
    selectedTaskId.value = updated.id
    const current = updated.shots.find((item) => item.status === 'requires_manual' && !item.resultVideoPath)
    selectedShotId.value = current?.shotId || updated.shots[0]?.shotId || ''
    syncSelection(updated)
    notice.value = '已按顺序启动下一条待处理分镜。'
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    runningQueue.value = false
  }
}

async function markShotCompleted() {
  if (!selectedTask.value || !selectedShot.value) return
  const picked = await window.api.pickFiles({
    title: '选择已下载的分镜视频',
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm'] }],
    multiple: false,
  })
  const resultVideoPath = safeText(picked?.[0], '')
  if (!resultVideoPath) return
  const updated = (await window.api.tiktokCreative.markShotCompleted({
    id: selectedTask.value.id,
    shotId: selectedShot.value.shotId,
    resultVideoPath,
  })) as TaskItem
  tasks.value = tasks.value.map((item) => (item.id === updated.id ? updated : item))
  syncSelection(updated)
  notice.value = `第 ${selectedShot.value.shotIndex + 1} 条分镜已标记为完成。`
}

async function markShotFailed() {
  if (!selectedTask.value || !selectedShot.value) return
  const reason = window.prompt('请输入失败原因', selectedShot.value.lastError || 'Manual failure') || ''
  if (!reason.trim()) return
  const updated = (await window.api.tiktokCreative.markShotFailed({
    id: selectedTask.value.id,
    shotId: selectedShot.value.shotId,
    error: reason.trim(),
  })) as TaskItem
  tasks.value = tasks.value.map((item) => (item.id === updated.id ? updated : item))
  syncSelection(updated)
  notice.value = `第 ${selectedShot.value.shotIndex + 1} 条分镜已标记为失败。`
}

async function removeTask(task: TaskItem) {
  await window.api.tiktokCreative.remove(task.id)
  if (selectedTaskId.value === task.id) {
    selectedTaskId.value = ''
    selectedShotId.value = ''
    runtimeLogs.value = []
  }
  await refresh()
}

function selectTask(task: TaskItem) {
  selectedTaskId.value = task.id
  selectedShotId.value = task.shots[0]?.shotId || ''
  syncSelection(task)
}

function selectShot(shot: ShotTask) {
  selectedShotId.value = shot.shotId
  pushLogs(shot.logs || [])
}

async function openResultVideo() {
  const path = safeText(selectedShot.value?.resultVideoPath, '')
  if (!path) return
  await window.api.shell.openPath(path)
}

async function revealResultVideo() {
  const path = safeText(selectedShot.value?.resultVideoPath, '')
  if (!path) return
  await window.api.shell.showItemInFolder(path)
}

async function openDownloadDir() {
  const path = safeText(selectedShot.value?.downloadDir, '')
  if (!path) return
  await window.api.shell.openPath(path)
}

watch(selectedTask, (task) => {
  syncSelection(task)
})

watch(selectedShot, (shot) => {
  if (!shot) return
  pushLogs(shot.logs || [])
})

onMounted(async () => {
  await refresh()
  const cloneProjectId = safeText(route.query.cloneProjectId, '')
  cloneProjectIdInput.value = cloneProjectId
  const autoCreate = safeText(route.query.autoCreate, '')
  if (cloneProjectId && autoCreate === '1') {
    await importFromCloneProject(cloneProjectId)
    return
  }
  if (tasks.value.length) selectTask(tasks.value[0])
})
</script>

<template>
  <div class="creative-page">
    <section class="creative-shell">
      <header class="creative-hero">
        <div class="creative-hero__topline">
          <button class="back-link" type="button" @click="router.push('/plugins?tab=installed')">
            <ChevronLeft class="h-4 w-4" />
            返回插件中心
          </button>
          <div class="hero-badge">
            <Wand2 class="h-4 w-4" />
            复刻分镜执行台
          </div>
        </div>

        <div class="creative-hero__main">
          <div class="creative-hero__copy">
            <div class="creative-hero__eyebrow">
              <span class="eyebrow-chip">TikTok Creative Studio</span>
              <span class="eyebrow-text">桌面端批处理工作台</span>
            </div>
            <h1>直接读取复刻项目分镜，按顺序送入 TikTok 创意视频生成。</h1>
            <p>
              这里不会改动复刻页面本身，只读取现成的分镜图片和分镜视频提示词，在独立桌面工作台里逐条或顺序执行。
            </p>
          </div>

          <div class="creative-hero__actions">
            <button class="ghost-button hero-action" type="button" :disabled="loading" @click="refresh">
              <RefreshCcw class="h-4 w-4" />
              刷新
            </button>
            <button
              class="primary-button hero-action"
              type="button"
              :disabled="runningQueue || !selectedTask"
              @click="startNextPendingShot"
            >
              <Play class="h-4 w-4" />
              {{ runningQueue ? '启动中...' : '按顺序启动下一条' }}
            </button>
          </div>
        </div>

        <div class="hero-metrics">
          <div class="metric-card">
            <span>批次项目</span>
            <strong>{{ taskStats.allProjects }}</strong>
          </div>
          <div class="metric-card">
            <span>分镜总数</span>
            <strong>{{ taskStats.allShots }}</strong>
          </div>
          <div class="metric-card">
            <span>已完成</span>
            <strong>{{ taskStats.completed }}</strong>
          </div>
          <div class="metric-card">
            <span>待人工</span>
            <strong>{{ taskStats.waiting }}</strong>
          </div>
        </div>
      </header>

      <div v-if="notice" class="notice success">{{ notice }}</div>
      <div v-if="errorText" class="notice error">{{ errorText }}</div>

      <div class="creative-grid">
        <aside class="inbox-panel">
          <section class="panel-card panel-card--gradient">
            <div class="panel-head">
              <div>
                <span class="panel-tag">导入</span>
                <strong>从复刻项目导入</strong>
              </div>
              <span class="panel-side-note">不需要你手填项目 ID</span>
            </div>
            <p class="panel-copy">
              可以直接从下方复刻项目列表勾选批量导入，也支持手动输入 `cloneProjectId` 进行精确导入。
            </p>
            <div class="import-form">
              <input v-model="cloneProjectIdInput" type="text" placeholder="手动输入 cloneProjectId" />
              <button
                class="primary-button"
                type="button"
                :disabled="importing || !safeText(cloneProjectIdInput, '')"
                @click="importFromCloneProject(safeText(cloneProjectIdInput, ''))"
              >
                单个导入
              </button>
            </div>
            <div v-if="currentCloneProjectId" class="current-clone-hint">
              当前路由已带入 cloneProjectId：{{ currentCloneProjectId }}
            </div>
          </section>

          <section class="panel-card">
            <div class="panel-head">
              <div>
                <span class="panel-tag">项目列表</span>
                <strong>可批量选择导入</strong>
              </div>
              <span class="panel-side-note">已选 {{ selectedImportProjectIds.length }} 个</span>
            </div>

            <div v-if="projectLoadError" class="empty-inline-card">
              {{ projectLoadError }}
            </div>

            <div v-else-if="cloneProjects.length" class="project-pick-list">
              <label
                v-for="project in pagedCloneProjects"
                :key="project.id"
                class="project-pick-card"
                :class="{ active: selectedImportProjectIds.includes(project.id) }"
              >
                <input
                  type="checkbox"
                  :checked="selectedImportProjectIds.includes(project.id)"
                  @change="toggleImportProject(project.id)"
                />
                <div class="project-pick-card__body">
                  <strong>{{ safeText(project.title, '未命名复刻项目') }}</strong>
                  <p>{{ project.shotCount }} 条分镜 · {{ formatTime(project.updatedAt) }}</p>
                  <small>{{ project.id }}</small>
                </div>
              </label>
            </div>

            <div v-else class="empty-inline-card">
              正在尝试读取复刻项目列表。
            </div>

            <div v-if="cloneProjects.length" class="pagination-bar">
              <button class="ghost-button small" type="button" :disabled="cloneProjectPage <= 1" @click="goCloneProjectPage(cloneProjectPage - 1)">
                上一页
              </button>
              <span class="pagination-text">第 {{ cloneProjectPage }} / {{ cloneProjectTotalPages }} 页</span>
              <button
                class="ghost-button small"
                type="button"
                :disabled="cloneProjectPage >= cloneProjectTotalPages"
                @click="goCloneProjectPage(cloneProjectPage + 1)"
              >
                下一页
              </button>
            </div>

            <button
              class="primary-button"
              type="button"
              :disabled="importing || !selectedImportProjectIds.length"
              @click="importSelectedProjects"
            >
              {{ importing ? '导入中...' : '批量导入所选项目' }}
            </button>
          </section>

          <section class="panel-card">
            <div class="panel-head">
              <div>
                <span class="panel-tag">运行批次</span>
                <strong>独立运行列表</strong>
              </div>
              <span class="panel-side-note">与复刻主流程隔离</span>
            </div>

            <div v-if="tasks.length" class="task-list">
              <button
                v-for="task in tasks"
                :key="task.id"
                class="task-card"
                :class="{ active: selectedTaskId === task.id }"
                type="button"
                @click="selectTask(task)"
              >
                <div class="task-card__top">
                  <strong>{{ safeText(task.sourceCloneProjectTitle, '复刻批次任务') }}</strong>
                  <span class="status-pill" :class="statusTone(task.status)">{{ statusLabel(task.status) }}</span>
                </div>
                <p>{{ task.totalShots }} 条分镜，完成 {{ task.completedShots }} 条，待人工 {{ task.waitingShots }} 条。</p>
                <div class="task-card__meta">
                  <span>{{ formatTime(task.updatedAt) }}</span>
                </div>
              </button>
            </div>

            <div v-else class="empty-showcase">
              <div class="empty-showcase__orb"></div>
              <div class="empty-showcase__copy">
                <strong>还没有导入批次</strong>
                <p>从上方项目列表勾选复刻项目，即可快速创建多个分镜执行批次。</p>
              </div>
            </div>
          </section>
        </aside>

        <main class="editor-panel">
          <section v-if="selectedTask" class="panel-card panel-card--editor">
            <div class="panel-head">
              <div>
                <span class="panel-tag">工作区</span>
                <strong>{{ safeText(selectedTask.sourceCloneProjectTitle, '复刻批次任务') }}</strong>
              </div>
              <div class="panel-head__actions">
                <button class="ghost-button small" type="button" @click="runtimeDialogOpen = true">查看日志</button>
                <button class="ghost-button small is-danger" type="button" @click="removeTask(selectedTask)">
                  <Trash2 class="h-4 w-4" />
                  删除批次
                </button>
              </div>
            </div>

            <div class="editor-layout">
              <section class="editor-column">
                <div class="soft-block soft-block--accent">
                  <div class="soft-block__topline">
                    <span class="block-label">来源复刻项目</span>
                    <span class="mini-kicker">只读引用</span>
                  </div>
                  <strong>{{ safeText(selectedTask.sourceCloneProjectTitle, '未命名复刻项目') }}</strong>
                  <p>
                    当前批次共 {{ selectedTask.totalShots }} 条分镜，待继续处理 {{ pendingShotCount }} 条。这里的运行状态、日志和下载结果都只保存在插件自己的空间里。
                  </p>
                </div>

                <div class="soft-block">
                  <div class="block-head">
                    <div>
                      <span class="block-label">分镜队列</span>
                      <strong>{{ selectedTask.totalShots }} 条</strong>
                    </div>
                    <button
                      class="ghost-button small"
                      type="button"
                      :disabled="runningQueue"
                      @click="startNextPendingShot"
                    >
                      {{ runningQueue ? '启动中...' : '启动下一条' }}
                    </button>
                  </div>

                  <div class="shot-list">
                    <button
                      v-for="shot in selectedTask.shots"
                      :key="shot.shotId"
                      class="shot-card"
                      :class="{ active: selectedShotId === shot.shotId }"
                      type="button"
                      @click="selectShot(shot)"
                    >
                      <div class="shot-card__top">
                        <strong>第 {{ shot.shotIndex + 1 }} 条分镜</strong>
                        <span class="status-pill" :class="statusTone(shot.status)">{{ statusLabel(shot.status) }}</span>
                      </div>
                      <p>{{ safeText(shot.scriptText, previewLabel(shot.imagePath)) }}</p>
                      <div class="shot-card__meta">
                        <span>{{ shot.durationSec }} 秒</span>
                        <span>{{ previewLabel(shot.imagePath) }}</span>
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              <section v-if="selectedShot" class="editor-column editor-column--side">
                <div class="soft-block">
                  <span class="block-label">当前分镜</span>
                  <div class="status-hero" :class="statusTone(selectedShot.status)">
                    <div class="status-hero__icon">
                      <Sparkles class="h-5 w-5" />
                    </div>
                    <div class="status-hero__copy">
                      <strong>第 {{ selectedShot.shotIndex + 1 }} 条分镜</strong>
                      <p>{{ safeText(selectedShot.scriptText, '当前分镜没有可展示的脚本文案。') }}</p>
                    </div>
                  </div>
                </div>

                <div class="soft-block">
                  <span class="block-label">分镜图片</span>
                  <div class="preview-card">
                    <div class="preview-card__shine"></div>
                    <div class="preview-card__body">
                      <span class="preview-card__index">图片</span>
                      <strong>{{ previewLabel(selectedShot.imagePath) }}</strong>
                      <small>{{ selectedShot.imagePath }}</small>
                    </div>
                  </div>
                </div>

                <div class="soft-block">
                  <span class="block-label">分镜视频提示词</span>
                  <textarea :value="selectedShot.prompt" rows="10" readonly></textarea>
                </div>

                <div class="soft-block">
                  <span class="block-label">执行动作</span>
                  <div class="inline-actions">
                    <button
                      class="primary-button"
                      type="button"
                      :disabled="runningShotId === selectedShot.shotId"
                      @click="startShot(selectedShot)"
                    >
                      <Play class="h-4 w-4" />
                      {{ runningShotId === selectedShot.shotId ? '启动中...' : '启动当前分镜' }}
                    </button>
                    <button class="ghost-button" type="button" :disabled="!safeText(selectedShot.downloadDir, '')" @click="openDownloadDir">
                      <FolderOpen class="h-4 w-4" />
                      打开下载目录
                    </button>
                  </div>
                </div>

                <div v-if="safeText(selectedShot.resultVideoPath, '')" class="soft-block">
                  <span class="block-label">结果视频</span>
                  <strong>{{ selectedShot.resultVideoPath }}</strong>
                  <div class="inline-actions">
                    <button class="ghost-button small" type="button" @click="openResultVideo">打开视频</button>
                    <button class="ghost-button small" type="button" @click="revealResultVideo">打开位置</button>
                  </div>
                </div>

                <div class="action-bar">
                  <button class="ghost-button" type="button" @click="markShotCompleted">
                    <CheckCircle2 class="h-4 w-4" />
                    标记完成
                  </button>
                  <button class="ghost-button" type="button" @click="markShotFailed">
                    <XCircle class="h-4 w-4" />
                    标记失败
                  </button>
                  <button class="ghost-button" type="button" @click="runtimeDialogOpen = true">
                    <ExternalLink class="h-4 w-4" />
                    查看分镜日志
                  </button>
                </div>
              </section>
            </div>
          </section>

          <section v-else class="panel-card panel-card--editor">
            <div class="empty-showcase empty-showcase--wide">
              <div class="empty-showcase__orb"></div>
              <div class="empty-showcase__copy">
                <strong>先导入复刻项目</strong>
                <p>导入后，这里会展示该项目的分镜队列、提示词和逐条执行面板。</p>
              </div>
            </div>
          </section>
        </main>
      </div>

      <RuntimeLogDialog
        v-model="runtimeDialogOpen"
        :logs="runtimeLogs"
        :title="'运行日志'"
        :description="'查看当前分镜在 TikTok Creative Studio 独立执行链路中的详细日志。'"
        :hint="'这里只显示插件自己的日志，不会混入复刻主流程日志。'"
      />
    </section>
  </div>
</template>

<style scoped>
.creative-page {
  min-height: 100%;
  padding: 18px;
  color: #f7fbff;
  background:
    radial-gradient(circle at 0% 0%, rgba(26, 86, 219, 0.18), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(45, 212, 191, 0.14), transparent 24%),
    linear-gradient(180deg, #07111d 0%, #0a1626 42%, #0d1b2f 100%);
}

.creative-shell,
.panel-card,
.creative-hero,
.creative-hero__copy,
.metric-card,
.task-card,
.shot-card,
.soft-block,
.status-hero__copy,
.preview-card__body,
.empty-showcase__copy,
.project-pick-list {
  display: grid;
}

.creative-shell {
  gap: 18px;
}

.creative-hero {
  gap: 18px;
  padding: 24px 26px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 30px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(45, 212, 191, 0.14), transparent 28%),
    radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(8, 15, 28, 0.96), rgba(14, 23, 38, 0.94));
  box-shadow:
    0 26px 70px rgba(2, 6, 23, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.creative-hero__topline,
.creative-hero__main,
.creative-hero__eyebrow,
.creative-hero__actions,
.task-card__top,
.task-card__meta,
.shot-card__top,
.shot-card__meta,
.panel-head,
.panel-head__actions,
.inline-actions,
.action-bar,
.soft-block__topline,
.block-head,
.status-hero,
.project-pick-card {
  display: flex;
}

.creative-hero__topline,
.creative-hero__main,
.panel-head,
.block-head,
.task-card__top,
.shot-card__top,
.soft-block__topline {
  justify-content: space-between;
}

.creative-hero__topline,
.creative-hero__eyebrow,
.creative-hero__actions,
.task-card__top,
.task-card__meta,
.shot-card__top,
.shot-card__meta,
.panel-head,
.panel-head__actions,
.inline-actions,
.action-bar,
.soft-block__topline,
.block-head,
.status-hero,
.project-pick-card {
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.back-link,
.hero-badge,
.panel-tag,
.status-pill,
.mini-kicker,
.preview-card__index {
  display: inline-flex;
  align-items: center;
}

.back-link {
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(226, 232, 240, 0.92);
  font-size: 13px;
  font-weight: 700;
}

.hero-badge,
.eyebrow-chip,
.panel-tag,
.status-pill,
.mini-kicker,
.preview-card__index {
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
}

.hero-badge {
  gap: 8px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(45, 212, 191, 0.16);
  background: rgba(9, 24, 32, 0.72);
  color: #cffafe;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.creative-hero__copy {
  gap: 12px;
  max-width: 780px;
}

.eyebrow-chip {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(96, 165, 250, 0.2);
  color: #dbeafe;
  font-size: 12px;
  font-weight: 700;
}

.eyebrow-text,
.metric-card span,
.panel-side-note,
.panel-copy,
.current-clone-hint,
.task-card p,
.task-card__meta span,
.shot-card p,
.shot-card__meta span,
.soft-block p,
.preview-card small,
.empty-showcase__copy p,
.project-pick-card p,
.project-pick-card small,
.empty-inline-card {
  color: rgba(191, 219, 254, 0.76);
}

.eyebrow-text,
.metric-card span,
.panel-tag,
.mini-kicker,
.preview-card__index {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.creative-hero__copy h1,
.panel-head strong,
.empty-showcase__copy strong {
  margin: 0;
  color: #ffffff;
  letter-spacing: -0.04em;
}

.creative-hero__copy h1 {
  font-size: 40px;
  line-height: 1;
  font-weight: 900;
}

.creative-hero__copy p,
.panel-copy,
.soft-block p,
.empty-showcase__copy p,
textarea {
  line-height: 1.8;
}

.creative-hero__copy p {
  margin: 0;
  max-width: 760px;
  font-size: 15px;
}

.hero-metrics,
.creative-grid,
.import-form,
.task-list,
.editor-layout,
.editor-column,
.shot-list {
  display: grid;
}

.hero-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  gap: 10px;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
}

.metric-card strong,
.task-card__top strong,
.shot-card__top strong,
.soft-block strong,
.status-hero__copy strong,
.preview-card strong,
.empty-showcase__copy strong,
.project-pick-card strong {
  color: #ffffff;
}

.metric-card strong {
  font-size: 28px;
  font-weight: 800;
}

.creative-grid {
  grid-template-columns: 430px minmax(0, 1fr);
  gap: 18px;
}

.panel-card {
  gap: 16px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(8, 15, 28, 0.96), rgba(9, 17, 31, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 18px 48px rgba(2, 6, 23, 0.24);
}

.panel-card--gradient {
  background:
    radial-gradient(circle at top left, rgba(45, 212, 191, 0.16), transparent 34%),
    linear-gradient(180deg, rgba(10, 20, 35, 0.98), rgba(9, 16, 29, 0.98));
}

.panel-head strong {
  font-size: 22px;
  font-weight: 800;
}

.panel-tag {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(191, 219, 254, 0.82);
  font-weight: 700;
}

.panel-copy {
  margin: 0;
  font-size: 13px;
}

.import-form {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.import-form input,
textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(11, 22, 40, 0.74);
  color: #ffffff;
  padding: 13px 14px;
  outline: none;
  font-size: 14px;
}

.current-clone-hint {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px dashed rgba(45, 212, 191, 0.18);
  background: rgba(13, 32, 39, 0.54);
  font-size: 12px;
}

.project-pick-list,
.task-list,
.shot-list {
  gap: 12px;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pagination-text {
  color: rgba(191, 219, 254, 0.76);
  font-size: 12px;
}

.project-pick-card,
.task-card,
.shot-card {
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  text-align: left;
}

.project-pick-card.active,
.task-card.active,
.shot-card.active {
  border-color: rgba(45, 212, 191, 0.22);
  background:
    radial-gradient(circle at top right, rgba(45, 212, 191, 0.1), transparent 40%),
    linear-gradient(180deg, rgba(31, 49, 80, 0.3), rgba(19, 32, 54, 0.22));
}

.project-pick-card input {
  margin-top: 4px;
}

.project-pick-card__body {
  flex: 1;
  min-width: 0;
}

.project-pick-card p,
.project-pick-card small,
.task-card p,
.shot-card p {
  margin: 0;
}

.project-pick-card small {
  display: block;
  margin-top: 6px;
  word-break: break-all;
}

.status-pill.is-success,
.status-hero.is-success {
  background: rgba(16, 185, 129, 0.14);
  color: #bbf7d0;
}

.status-pill.is-danger,
.status-hero.is-danger {
  background: rgba(239, 68, 68, 0.14);
  color: #fecaca;
}

.status-pill.is-warning,
.status-hero.is-warning {
  background: rgba(245, 158, 11, 0.14);
  color: #fde68a;
}

.status-pill.is-info,
.status-hero.is-info {
  background: rgba(59, 130, 246, 0.14);
  color: #bfdbfe;
}

.status-pill.is-neutral,
.status-hero.is-neutral {
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
}

.editor-layout {
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.95fr);
  gap: 18px;
}

.editor-column {
  gap: 16px;
}

.soft-block {
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.018)),
    rgba(10, 20, 34, 0.9);
}

.soft-block--accent {
  background:
    radial-gradient(circle at top right, rgba(45, 212, 191, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(17, 29, 46, 0.94), rgba(10, 18, 31, 0.98));
}

.block-label {
  color: rgba(191, 219, 254, 0.68);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mini-kicker {
  background: rgba(45, 212, 191, 0.08);
  color: #ccfbf1;
  font-weight: 700;
}

.status-hero {
  gap: 14px;
  padding: 16px;
  border-radius: 22px;
}

.status-hero__icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.08);
}

.status-hero__copy {
  gap: 6px;
}

.preview-card {
  position: relative;
  overflow: hidden;
  min-height: 128px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(18, 31, 51, 0.9), rgba(9, 18, 33, 0.94));
}

.preview-card__shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(125, 211, 252, 0.08), transparent 54%);
}

.preview-card__body {
  position: relative;
  z-index: 1;
  gap: 6px;
  height: 100%;
  padding: 14px;
}

.preview-card__index {
  width: fit-content;
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 800;
}

.empty-inline-card {
  padding: 14px;
  border-radius: 16px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  background: rgba(11, 20, 34, 0.62);
  line-height: 1.75;
}

textarea {
  min-height: 220px;
  resize: vertical;
}

.primary-button,
.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 800;
}

.primary-button {
  border: 1px solid rgba(45, 212, 191, 0.18);
  background: linear-gradient(135deg, #1d4ed8, #14b8a6);
  color: #ffffff;
}

.ghost-button {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: #f8fbff;
}

.ghost-button.small {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 12px;
}

.ghost-button.is-danger {
  border-color: rgba(239, 68, 68, 0.18);
  color: #fecaca;
}

.notice {
  padding: 13px 15px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 700;
}

.notice.success {
  border: 1px solid rgba(16, 185, 129, 0.18);
  background: rgba(16, 185, 129, 0.12);
  color: #d1fae5;
}

.notice.error {
  border: 1px solid rgba(239, 68, 68, 0.18);
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
}

.empty-showcase {
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 28px;
  border-radius: 26px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(11, 22, 38, 0.76), rgba(8, 16, 29, 0.94));
}

.empty-showcase--wide {
  min-height: 420px;
}

.empty-showcase__orb {
  position: absolute;
  width: 280px;
  height: 280px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(45, 212, 191, 0.18), transparent 66%);
  filter: blur(12px);
}

.empty-showcase__copy {
  position: relative;
  z-index: 1;
  gap: 10px;
  text-align: center;
}

.empty-showcase__copy strong {
  font-size: 24px;
  font-weight: 800;
}

@media (max-width: 1320px) {
  .creative-grid,
  .editor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .creative-page {
    padding: 14px;
  }

  .creative-hero {
    padding: 20px;
  }

  .creative-hero__main {
    flex-direction: column;
  }

  .hero-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .import-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .hero-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
