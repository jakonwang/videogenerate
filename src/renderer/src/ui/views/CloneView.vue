<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CloneConsoleSidebar from '../components/clone/CloneConsoleSidebar.vue'
import CloneDataCard from '../components/clone/CloneDataCard.vue'
import CloneMediaCard from '../components/clone/CloneMediaCard.vue'
import CloneStageHeader from '../components/clone/CloneStageHeader.vue'
import CloneStateCard from '../components/clone/CloneStateCard.vue'

const { t: tr } = useI18n()

type ProjectSummary = {
  id: string
  title: string
  status: string
  updatedAt: number
  referenceVideoName: string
  referenceVideoPath: string
  previewOutputPath: string
  previewReportPath: string
  outputDir: string
  modelName: string
  lastError: string
}

type StoryBeat = {
  id: string
  purpose: string
  shotType: string
  productRole: string
}

type ScriptVariantCandidate = {
  id: string
  title: string
  summary: string
  fullScript: string
  score: number
  reason: string
  selected?: boolean
}

type StoryboardGridBatch = {
  id: string
  frameCount: number
  gridType: 'grid-6' | 'grid-9'
  imagePath?: string
  croppedFramePaths: string[]
  status: string
}

type StoryboardFrame = {
  id: string
  shotId: string
  batchId: string
  frameIndex: number
  imagePath?: string
  status: string
}

type ShotVideoOutput = {
  segmentId?: string
  index?: number
  shotId: string
  source: 'generated' | 'uploaded_replacement'
  videoPath?: string
  localPath?: string
  videoUrl?: string
  taskId?: string
  previousTaskIds?: string[]
  provider?: string
  model?: string
  requestCapability?: string
  endpointStyle?: string
  remoteStatus?: string
  remoteRaw?: unknown
  durationSec?: number
  status: string
  error?: string
  retryCount?: number
  lastPollAt?: number
  completedAt?: number
}

type FinalCompose = {
  status: string
  outputPath?: string
  error?: string
}

type CloneProject = {
  id: string
  status: string
  referenceVideoPath: string
  referenceVideoName: string
  selectedModelIdentitySnapshot?: {
    id: string
    name?: string
    model?: string
    imagePaths?: string[]
    coverImagePath?: string
  }
  blueprint?: {
    title?: string
    scriptAnalysisError?: string
    duration?: number
    category?: string
    market?: string
    localization?: { language?: string }
    renderHints?: { pacing?: string; resolution?: string }
    storyBeats?: StoryBeat[]
  } | null
  scriptVariantCandidates?: ScriptVariantCandidate[]
  selectedScriptVariantId?: string
  storyboardGridBatches?: StoryboardGridBatch[]
  storyboardFrames?: StoryboardFrame[]
  shotVideoOutputs?: ShotVideoOutput[]
  finalCompose?: FinalCompose
  lastError?: string
  workflowV2?: {
    currentStep?: string
  }
  previewPipeline?: {
    status?: 'idle' | 'running' | 'preview_ready' | 'background_running' | 'done' | 'failed'
    previewOutputPath?: string
    previewReportPath?: string
    lastError?: string
  }
  pipelineStatus?: {
    errorContext?: {
      provider?: string
      model?: string
      endpointStyle?: string
      baseUrl?: string
      requestCapability?: string
      taskId?: string
      responseSnippet?: string
      action?: string
      message?: string
    }
  }
}

type ModelItem = {
  id: string
  name: string
  status: string
  model?: string
  imagePaths?: string[]
  coverImagePath?: string
  gender?: string
  ageRange?: string
  sceneStyle?: string
}

type StageItem = {
  key: string
  title: string
  desc: string
  done: boolean
  active: boolean
}

type RuntimeLogItem = {
  id: string
  level: 'info' | 'success' | 'error'
  message: string
  time: number
}

const current = ref<CloneProject | null>(null)
const histories = ref<ProjectSummary[]>([])
const models = ref<ModelItem[]>([])
const loading = ref(false)
const historyLoading = ref(false)
const modelLoading = ref(false)
const referenceVideoPath = ref('')
const productRefs = ref<string[]>([])
const selectedModelId = ref('')
const errorText = ref('')
const stageLog = ref('等待上传参考视频并开始分析')
const runtimeLogs = ref<RuntimeLogItem[]>([])
const logListRef = ref<HTMLElement | null>(null)
const modelModalOpen = ref(false)
const advancedOpen = ref(false)
const variantCount = ref(3)
const selectedStageKey = ref<StageItem['key'] | ''>('')
const selectedShotId = ref('')
const selectedShotFilter = ref<'all' | 'ready' | 'failed' | 'pending'>('all')

const historySorted = computed(() => [...histories.value].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)))
const currentModel = computed(() => models.value.find((item) => item.id === selectedModelId.value) || null)
const modelSnapshot = computed(() => currentModel.value || current.value?.selectedModelIdentitySnapshot || null)
const storyBeats = computed(() => current.value?.blueprint?.storyBeats ?? [])
const scriptVariants = computed(() => current.value?.scriptVariantCandidates ?? [])
const storyboardBatches = computed(() => current.value?.storyboardGridBatches ?? [])
const storyboardFrames = computed(() => current.value?.storyboardFrames ?? [])
const shotVideoOutputs = computed(() => current.value?.shotVideoOutputs ?? [])
const filteredShotOutputs = computed(() => {
  switch (selectedShotFilter.value) {
    case 'ready':
      return shotVideoOutputs.value.filter((item) => Boolean(item.videoPath))
    case 'failed':
      return shotVideoOutputs.value.filter((item) => item.status === 'failed' || item.status === 'polling_timeout' || Boolean(item.error))
    case 'pending':
      return shotVideoOutputs.value.filter((item) => !item.videoPath && !(item.status === 'failed' || item.status === 'polling_timeout' || Boolean(item.error)))
    default:
      return shotVideoOutputs.value
  }
})
const selectedShotOutput = computed<ShotVideoOutput | null>(
  () => shotVideoOutputs.value.find((item) => item.shotId === selectedShotId.value) || shotVideoOutputs.value[0] || null,
)
const selectedShotIndex = computed(() => shotVideoOutputs.value.findIndex((item) => item.shotId === selectedShotOutput.value?.shotId))
const selectedStoryBeat = computed<StoryBeat | null>(
  () => storyBeats.value.find((item) => item.id === selectedShotOutput.value?.shotId) || null,
)
const finalOutputPath = computed(() => current.value?.finalCompose?.outputPath || current.value?.previewPipeline?.previewOutputPath || '')
const pipelineErrorContext = computed(() => current.value?.pipelineStatus?.errorContext || null)
const workflowStep = computed(() => current.value?.workflowV2?.currentStep || 'upload_analyze_script')
const selectedVariantId = computed(() => current.value?.selectedScriptVariantId || scriptVariants.value.find((item) => item.selected)?.id || '')
const referenceSourcePath = computed(() => current.value?.referenceVideoPath || referenceVideoPath.value)
const visibleProductThumbs = computed(() => productRefs.value.slice(0, 9))
const visibleHistory = computed(() => historySorted.value.slice(0, 8))
const isDraftingNewProject = computed(() => Boolean(referenceVideoPath.value.trim()) && !current.value?.id)
const failedShotOutputs = computed(() =>
  shotVideoOutputs.value.filter((item) => item.status === 'failed' || item.status === 'polling_timeout' || Boolean(item.error)),
)
const retryableShotOutputs = computed(() =>
  shotVideoOutputs.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status === 'failed' || status === 'pending' || status === 'idle' || status === 'polling_timeout' || status === 'remote_running'
  }),
)
const generationFailureText = computed(
  () =>
    errorText.value ||
    failedShotOutputs.value[0]?.error ||
    current.value?.finalCompose?.error ||
    current.value?.previewPipeline?.lastError ||
    current.value?.lastError ||
    '',
)
const hasGenerationFailure = computed(() => Boolean(generationFailureText.value || failedShotOutputs.value.length))
const canRetryShotVideos = computed(() => Boolean(current.value?.id && retryableShotOutputs.value.length))
const completedShotCount = computed(() => shotVideoOutputs.value.filter((item) => Boolean(item.videoPath)).length)
const pendingShotCount = computed(
  () =>
    shotVideoOutputs.value.filter(
      (item) => !item.videoPath && !(item.status === 'failed' || item.status === 'polling_timeout' || Boolean(item.error)),
    ).length,
)
const processingShotCount = computed(
  () =>
    shotVideoOutputs.value.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      return !item.videoPath && !item.error && (status.includes('running') || status.includes('processing') || status.includes('pending'))
    }).length,
)
const shotProgressPercent = computed(() => {
  const total = shotVideoOutputs.value.length
  if (!total) return 0
  return Math.round((completedShotCount.value / total) * 100)
})

const statusTone = computed(() => {
  if (errorText.value) return 'danger'
  if (finalOutputPath.value) return 'success'
  if (loading.value) return 'working'
  return 'idle'
})

const stageItems = computed<StageItem[]>(() => {
  const hasBlueprint = Boolean(current.value?.blueprint)
  const hasVariants = scriptVariants.value.length > 0
  const hasSelectedVariant = Boolean(selectedVariantId.value)
  const hasFrames = storyboardFrames.value.some((item) => item.imagePath)
  const hasVideos = shotVideoOutputs.value.some((item) => item.videoPath)
  const hasFinal = Boolean(finalOutputPath.value)
  return [
    {
      key: 'analyze',
      title: '分析参考视频',
      desc: hasBlueprint ? '脚本与基础分镜结构已生成' : '上传参考视频并提炼爆款脚本',
      done: hasBlueprint,
      active: workflowStep.value === 'upload_analyze_script',
    },
    {
      key: 'variant',
      title: '脚本变体评分',
      desc: hasVariants
        ? hasSelectedVariant
          ? '已选择高分脚本，准备进入拼图阶段'
          : `已生成 ${scriptVariants.value.length} 条候选脚本`
        : '生成多个脚本版本并按商业潜力评分',
      done: hasVariants && hasSelectedVariant,
      active: workflowStep.value === 'generate_script_variants' || workflowStep.value === 'select_script_variant',
    },
    {
      key: 'grid',
      title: '分镜拼图裁切',
      desc: hasFrames ? '拼图已生成并裁切成独立 9:16 分镜图' : '上传商品图并选择模特后生成 6/9 宫格拼图',
      done: hasFrames,
      active: workflowStep.value === 'generate_storyboard_grids',
    },
    {
      key: 'video',
      title: '分镜视频生成',
      desc: hasVideos ? '分镜视频已生成，可替换个别镜头' : '根据分镜图与对应脚本生成视频片段',
      done: hasVideos,
      active: workflowStep.value === 'generate_shot_videos' || workflowStep.value === 'review_replace_shots',
    },
    {
      key: 'compose',
      title: '合成最终成片',
      desc: hasFinal ? '完整视频已输出并保存到历史记录' : '在合成前检查区替换分镜后输出成片',
      done: hasFinal,
      active: workflowStep.value === 'compose_final_video',
    },
  ]
})

const currentStageTitle = computed(() => stageItems.value.find((item) => item.active)?.title || stageItems.value.find((item) => !item.done)?.title || '等待继续')
const nextStageTitle = computed(() => stageItems.value.find((item) => !item.done)?.title || '可继续复用历史项目')
const workflowStageKey = computed<StageItem['key']>(() => {
  if (workflowStep.value === 'generate_script_variants' || workflowStep.value === 'select_script_variant') return 'variant'
  if (workflowStep.value === 'generate_storyboard_grids') return 'grid'
  if (workflowStep.value === 'generate_shot_videos' || workflowStep.value === 'review_replace_shots') return 'video'
  if (workflowStep.value === 'compose_final_video') return 'compose'
  return 'analyze'
})
const visibleStageKey = computed<StageItem['key']>(() => (selectedStageKey.value || workflowStageKey.value) as StageItem['key'])
const finalButtonLabel = computed(() => {
  if (loading.value && workflowStep.value === 'compose_final_video') return '正在合成'
  return shotVideoOutputs.value.length ? '重新合成成片' : '合成最终成片'
})

watch(
  shotVideoOutputs,
  (items) => {
    if (!items.length) {
      selectedShotId.value = ''
      return
    }
    const exists = items.some((item) => item.shotId === selectedShotId.value)
    if (!exists) {
      selectedShotId.value = items.find((item) => item.videoPath)?.shotId || items[0]?.shotId || ''
    }
  },
  { immediate: true },
)

function mediaUrl(filePath?: string) {
  const normalized = String(filePath || '').trim()
  return normalized ? `vg://file?path=${encodeURIComponent(normalized)}` : ''
}

function previewImage(path?: string) {
  return mediaUrl(path || '')
}

function modelPreview(item?: { coverImagePath?: string; imagePaths?: string[] } | null) {
  return previewImage(item?.coverImagePath || item?.imagePaths?.[0] || '')
}

function shortPath(value: string) {
  const text = String(value || '').trim()
  if (!text) return '--'
  const parts = text.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
}

function formatTime(ts: number) {
  if (!ts) return '--'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(value?: number) {
  const duration = Number(value || 0)
  if (!duration) return '--'
  if (duration < 60) return `${duration.toFixed(1)}s`
  const minutes = Math.floor(duration / 60)
  const seconds = Math.round(duration % 60)
  return `${minutes}m ${seconds}s`
}

function humanWorkflowStep(step: string) {
  switch (step) {
    case 'upload_analyze_script':
      return '分析参考视频'
    case 'generate_script_variants':
      return '生成脚本变体'
    case 'select_script_variant':
      return '确认脚本变体'
    case 'generate_storyboard_grids':
      return '生成分镜拼图'
    case 'generate_shot_videos':
      return '生成分镜视频'
    case 'review_replace_shots':
      return '合成前检查'
    case 'compose_final_video':
      return '输出最终成片'
    default:
      return step || '--'
  }
}

function humanStatus(status?: string) {
  switch (status) {
    case 'idle':
      return '待开始'
    case 'running':
      return '执行中'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
    case 'background_running':
      return '后台处理中'
    case 'preview_ready':
      return '预览已就绪'
    case 'cropped':
      return '已裁切'
    case 'generating':
      return '生成中'
    case 'creating':
      return '创建任务中'
    case 'remote_running':
      return '云端生成中'
    case 'polling_timeout':
      return '待继续查询'
    case 'downloading':
      return '下载中'
    case 'ready':
      return '已就绪'
    case 'composing':
      return '合成中'
    case 'uploaded_replacement':
      return '已替换'
    default:
      return status || '--'
  }
}

function safeText(value: unknown, fallback: string) {
  const text = String(value ?? '').replace(/\uFFFD/g, '').trim()
  return text || fallback
}

function pushRuntimeLog(message: string, level: RuntimeLogItem['level'] = 'info') {
  const text = safeText(message, '')
  if (!text) return
  const last = runtimeLogs.value[0]
  if (last?.message === text && last.level === level) return
  runtimeLogs.value = [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, level, message: text, time: Date.now() }, ...runtimeLogs.value].slice(0, 80)
  void nextTick(() => {
    if (logListRef.value) logListRef.value.scrollTop = 0
  })
}

function setStageLog(message: string, level: RuntimeLogItem['level'] = 'info') {
  stageLog.value = message
  pushRuntimeLog(message, level)
}

function markError(message: unknown, fallback: string) {
  errorText.value = safeText(message, fallback)
  pushRuntimeLog(errorText.value, 'error')
}

function applyProject(next: CloneProject | null) {
  current.value = next
  if (next?.referenceVideoPath) {
    referenceVideoPath.value = next.referenceVideoPath
  } else if (next?.referenceVideoPath === '' && next?.id) {
    referenceVideoPath.value = ''
  }
  errorText.value = next?.finalCompose?.error || next?.previewPipeline?.lastError || next?.blueprint?.scriptAnalysisError || next?.lastError || ''
  if (next?.selectedModelIdentitySnapshot?.id) {
    selectedModelId.value = next.selectedModelIdentitySnapshot.id
  }
}

function startNewDraft() {
  current.value = null
  referenceVideoPath.value = ''
  errorText.value = ''
  selectedStageKey.value = ''
  setStageLog('已切换到新建模式，请上传新的参考视频。')
}

function selectStage(key: StageItem['key']) {
  selectedStageKey.value = key
}

function shotLabel(shotId: string) {
  const beat = storyBeats.value.find((item) => item.id === shotId)
  if (beat) return beat.purpose
  const frame = storyboardFrames.value.find((item) => item.shotId === shotId)
  return `分镜 ${Number(frame?.frameIndex ?? 0) + 1}`
}

function localizeShotField(value?: string) {
  const text = String(value || '').trim()
  if (!text) return '--'
  const normalized = text.toLowerCase()
  const map: Record<string, string> = {
    'close-up': '特写',
    closeup: '特写',
    'medium shot': '中景',
    medium: '中景',
    'wide shot': '远景',
    wide: '远景',
    'top shot': '俯拍',
    top: '俯拍',
    'tracking shot': '跟拍',
    tracking: '跟拍',
    pan: '平移',
    tilt: '俯仰',
    dolly: '推拉',
    zoom: '变焦',
    hook: '钩子镜头',
    demo: '演示镜头',
    product: '产品主体',
    model: '模特主体',
    hand: '手部展示',
  }
  return map[normalized] || text
}

function shotScriptSummary(shotId?: string) {
  const beat = storyBeats.value.find((item) => item.id === shotId)
  if (!beat) return '当前镜头还没有可用的分镜脚本摘要。'
  const parts = [beat.purpose, localizeShotField(beat.shotType), localizeShotField(beat.productRole)].map((item) => String(item || '').trim()).filter(Boolean)
  return parts.join(' · ') || '当前镜头还没有可用的分镜脚本摘要。'
}

function selectAdjacentShot(offset: number) {
  if (!shotVideoOutputs.value.length) return
  const currentIndex = selectedShotIndex.value >= 0 ? selectedShotIndex.value : 0
  const nextIndex = Math.min(Math.max(currentIndex + offset, 0), shotVideoOutputs.value.length - 1)
  selectedShotId.value = shotVideoOutputs.value[nextIndex]?.shotId || selectedShotId.value
}

async function refreshHistory() {
  historyLoading.value = true
  try {
    histories.value = (await window.api.clone.listProjects()) as ProjectSummary[]
  } finally {
    historyLoading.value = false
  }
}

async function refreshModels() {
  modelLoading.value = true
  try {
    models.value = (await window.api.clone.listModelIdentityLibrary()) as ModelItem[]
  } finally {
    modelLoading.value = false
  }
}

async function refreshCurrentProject() {
  if (!current.value?.id) return
  const res = (await window.api.clone.refreshProjectStatus({ cloneProjectId: current.value.id })) as { project?: CloneProject }
  applyProject(res.project || current.value)
}

async function refreshProjectAfterFailure() {
  try {
    await refreshCurrentProject()
  } catch (error) {
    pushRuntimeLog(`刷新失败状态失败：${safeText((error as Error)?.message ?? error, '未知错误')}`, 'error')
  }
}

async function loadProject(projectId: string, options: { updateStageLog?: boolean } = {}) {
  const res = (await window.api.clone.refreshProjectStatus({ cloneProjectId: projectId })) as { project?: CloneProject }
  const next = res.project
  if (!next?.id) {
    pushRuntimeLog('历史项目同步后没有返回有效项目，请刷新历史记录后重试。', 'error')
    return
  }
  applyProject(next)
  if (options.updateStageLog !== false) {
    setStageLog(next.finalCompose?.outputPath ? '历史项目已载入，可直接查看结果或替换分镜重新合成。' : '历史项目已载入，可从当前阶段继续推进。')
  }
}

async function pickReferenceVideo() {
  const files = await window.api.pickFiles({
    title: '选择参考视频',
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
    multiple: false,
  })
  const file = String(files?.[0] || '')
  if (!file) return
  current.value = null
  referenceVideoPath.value = file
  errorText.value = ''
  setStageLog('参考视频已选择，可以开始脚本分析。')
}

async function pickProductImages() {
  const files = await window.api.pickFiles({
    title: '选择商品参考图',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    multiple: true,
  })
  const next = (files || []).map(String).filter(Boolean)
  if (!next.length) return
  productRefs.value = Array.from(new Set([...productRefs.value, ...next])).slice(0, 9)
  setStageLog(`已上传 ${productRefs.value.length} 张商品图，可继续生成分镜拼图。`)
}

async function createBlueprint() {
  const sourcePath = safeText(referenceSourcePath.value, '')
  if (!sourcePath) {
    markError('请先上传参考视频。', '请先上传参考视频。')
    return
  }
  loading.value = true
  errorText.value = ''
  setStageLog('正在分析参考视频脚本与分镜结构。')
  try {
    const res = (await window.api.clone.createBlueprint({
      videoPath: sourcePath,
      locale: 'zh-CN',
      strength: 'structure',
    })) as { project?: CloneProject }
    applyProject(res.project || null)
    await refreshHistory()
    setStageLog('脚本分析完成，可以继续生成脚本变体。', 'success')
  } catch (error: any) {
    markError(error?.message ?? error, '参考视频分析失败。')
    await refreshProjectAfterFailure()
    setStageLog('参考视频分析失败，请检查错误信息后重试。', 'error')
  } finally {
    loading.value = false
  }
}

async function generateScriptVariants() {
  if (!current.value?.id) {
    markError('请先完成参考视频分析。', '请先完成参考视频分析。')
    return
  }
  loading.value = true
  errorText.value = ''
  setStageLog('正在生成脚本变体并进行评分。')
  try {
    const res = (await window.api.clone.generateScriptVariants({
      cloneProjectId: current.value.id,
      variantCount: Math.max(1, Math.min(6, Number(variantCount.value || 3))),
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    setStageLog(
      res.project?.lastError ? '脚本变体已生成，部分候选使用了本地兜底逻辑，请直接选择一条继续。' : '脚本变体生成完成，请选择一条高分脚本继续。',
      res.project?.lastError ? 'info' : 'success',
    )
  } catch (error: any) {
    markError(error?.message ?? error, '脚本变体生成失败。')
    await refreshProjectAfterFailure()
    setStageLog('脚本变体生成失败，请检查错误信息后重试。', 'error')
  } finally {
    loading.value = false
  }
}

async function selectScriptVariant(variantId: string) {
  if (!current.value?.id) return
  loading.value = true
  errorText.value = ''
  setStageLog('正在应用选中的脚本变体。')
  try {
    const res = (await window.api.clone.selectScriptVariant({
      cloneProjectId: current.value.id,
      variantId,
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    setStageLog('脚本变体已确认，可以继续选择模特并上传商品图。', 'success')
  } catch (error: any) {
    markError(error?.message ?? error, '脚本变体选择失败。')
    await refreshProjectAfterFailure()
    setStageLog('脚本变体选择失败，请重试。', 'error')
  } finally {
    loading.value = false
  }
}

async function selectModel(item: ModelItem) {
  selectedModelId.value = item.id
  modelModalOpen.value = false
  if (!current.value?.id) {
    setStageLog('模特已选中，完成参考视频分析后会自动绑定到当前项目。')
    return
  }
  loading.value = true
  errorText.value = ''
  setStageLog('正在绑定模特。')
  try {
    const next = (await window.api.clone.selectProjectModelIdentity({
      cloneProjectId: current.value.id,
      identityId: item.id,
    })) as CloneProject
    applyProject(next)
    setStageLog('模特已绑定，可以继续生成分镜拼图。', 'success')
  } catch (error: any) {
    markError(error?.message ?? error, '模特绑定失败。')
    await refreshProjectAfterFailure()
    setStageLog('模特绑定失败，请重试。', 'error')
  } finally {
    loading.value = false
  }
}

async function generateStoryboardGrids() {
  if (!current.value?.id) {
    markError('请先完成参考视频分析。', '请先完成参考视频分析。')
    return
  }
  if (!selectedVariantId.value) {
    markError('请先选择一条脚本变体。', '请先选择一条脚本变体。')
    return
  }
  if (!productRefs.value.length) {
    markError('请先上传商品图。', '请先上传商品图。')
    return
  }
  if (!(selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id)) {
    markError('请先选择模特。', '请先选择模特。')
    return
  }
  loading.value = true
  errorText.value = ''
  setStageLog('正在生成分镜拼图并自动裁切。')
  try {
    const res = (await window.api.clone.generateStoryboardGrids({
      cloneProjectId: current.value.id,
      productReferenceImagePaths: [...productRefs.value],
      selectedModelIdentityId: selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id,
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    setStageLog('拼图与裁切完成，可以开始生成分镜视频。', 'success')
  } catch (error: any) {
    markError(error?.message ?? error, '分镜拼图生成失败。')
    await refreshProjectAfterFailure()
    setStageLog('分镜拼图生成失败，请检查错误信息后重试。', 'error')
  } finally {
    loading.value = false
  }
}

async function generateShotVideos() {
  if (!current.value?.id) {
    markError('请先完成前面的步骤。', '请先完成前面的步骤。')
    return
  }
  loading.value = true
  errorText.value = ''
  setStageLog('正在根据分镜图和脚本生成视频片段。')
  try {
    const res = (await window.api.clone.generateShotVideosFromStoryboard({
      cloneProjectId: current.value.id,
    })) as { project?: CloneProject; queueSummary?: { total: number; done: number; failed: number; skipped: number; pending?: number; timeout?: number } }
    applyProject(res.project || current.value)
    const summary = res.queueSummary
    if (summary?.failed || summary?.pending || summary?.timeout) {
      setStageLog(`分镜视频已继续执行：成功 ${summary.done || 0} 条，失败 ${summary.failed || 0} 条，云端待同步 ${summary.pending || 0} 条。失败或超时分镜可继续查询结果，不会重新扣费生成。`, 'error')
    } else {
      setStageLog('分镜视频已按脚本顺序全部生成完成，可在合成前检查区替换个别分镜。', 'success')
    }
  } catch (error: any) {
    markError(error?.message ?? error, '分镜视频生成失败。')
    await refreshProjectAfterFailure()
    setStageLog('分镜视频生成失败，请先继续查询结果，不要直接重新生成。', 'error')
  } finally {
    loading.value = false
  }
}

async function syncFailedShotVideo(shotId: string) {
  if (!current.value?.id) return
  loading.value = true
  errorText.value = ''
  setStageLog(`正在继续查询 ${shotLabel(shotId)} 的云端任务结果。`)
  try {
    const res = (await window.api.clone.syncShotVideoTask({
      cloneProjectId: current.value.id,
      shotId,
    })) as { project?: CloneProject; task?: { taskId?: string; status?: string; errorMessage?: string }; synced?: boolean }
    applyProject(res.project || current.value)
    const taskId = String(res.task?.taskId || current.value?.shotVideoOutputs?.find((item) => item.shotId === shotId)?.taskId || '').trim()
    if (res.synced) {
      setStageLog(`${shotLabel(shotId)} 已从云端同步成功。${taskId ? ` taskId=${taskId}` : ''}`, 'success')
    } else if (res.task?.status === 'failed') {
      setStageLog(`${shotLabel(shotId)} 云端仍然失败。${taskId ? ` taskId=${taskId}` : ''}`, 'error')
    } else {
      setStageLog(`${shotLabel(shotId)} 暂未拿到最终结果，保留 taskId 继续查询。${taskId ? ` taskId=${taskId}` : ''}`, 'info')
    }
  } catch (error: any) {
    markError(error?.message ?? error, `${shotLabel(shotId)} 云端状态同步失败。`)
    await refreshProjectAfterFailure()
    setStageLog(`${shotLabel(shotId)} 云端状态同步失败，请检查 taskId 后继续查询。`, 'error')
  } finally {
    loading.value = false
  }
}

async function replaceShotVideo(shotId: string) {
  if (!current.value?.id) return
  const files = await window.api.pickFiles({
    title: '选择替换分镜视频',
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
    multiple: false,
  })
  const file = String(files?.[0] || '')
  if (!file) return
  loading.value = true
  errorText.value = ''
  setStageLog(`正在替换 ${shotLabel(shotId)}。`)
  try {
    const res = (await window.api.clone.replaceShotVideo({
      cloneProjectId: current.value.id,
      shotId,
      videoPath: file,
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    setStageLog(`${shotLabel(shotId)} 已替换，可重新合成最终成片。`, 'success')
  } catch (error: any) {
    markError(error?.message ?? error, '分镜替换失败。')
    await refreshProjectAfterFailure()
    setStageLog('分镜替换失败，请重试。', 'error')
  } finally {
    loading.value = false
  }
}

async function regenerateShotClip(shotId: string) {
  if (!current.value?.id) return
  loading.value = true
  errorText.value = ''
  setStageLog(`正在放弃旧任务并强制重新生成 ${shotLabel(shotId)}。`)
  try {
    const res = (await window.api.clone.generateShotClip({
      cloneProjectId: current.value.id,
      shotId,
      forceRegenerate: true,
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    setStageLog(`${shotLabel(shotId)} 强制重新生成已提交。`, 'success')
  } catch (error: any) {
    markError(error?.message ?? error, `${shotLabel(shotId)} 强制重新生成失败。`)
    await refreshProjectAfterFailure()
    setStageLog(`${shotLabel(shotId)} 强制重新生成失败，请检查右侧错误上下文。`, 'error')
  } finally {
    loading.value = false
  }
}

async function refreshRemoteStatus() {
  if (!current.value?.id) return
  loading.value = true
  errorText.value = ''
  setStageLog('正在同步所有云端分镜任务状态。')
  try {
    const res = (await window.api.clone.refreshProjectStatus({
      cloneProjectId: current.value.id,
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    setStageLog('云端状态同步完成。', 'success')
  } catch (error: any) {
    markError(error?.message ?? error, '云端状态同步失败。')
    setStageLog('云端状态同步失败，请稍后再试。', 'error')
  } finally {
    loading.value = false
  }
}

async function composeFinalVideo() {
  if (!current.value?.id) {
    markError('请先完成前面的步骤。', '请先完成前面的步骤。')
    return
  }
  loading.value = true
  errorText.value = ''
  setStageLog('正在合成最终成片。')
  try {
    const res = (await window.api.clone.composeCloneVideo({
      cloneProjectId: current.value.id,
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    await refreshHistory()
    setStageLog(finalOutputPath.value ? '最终视频已合成并写入历史记录。' : '合成已结束，等待结果回写。', finalOutputPath.value ? 'success' : 'info')
  } catch (error: any) {
    markError(error?.message ?? error, '最终成片合成失败。')
    await refreshProjectAfterFailure()
    setStageLog('最终成片合成失败，请检查错误信息后重试。', 'error')
  } finally {
    loading.value = false
  }
}

let timer: number | null = null

onMounted(async () => {
  pushRuntimeLog(stageLog.value)
  await refreshHistory()
  await refreshModels()
  const first = historySorted.value[0]
  if (first?.id) {
    await loadProject(first.id)
  }
  timer = window.setInterval(() => {
    void refreshHistory()
    if (current.value?.id && !isDraftingNewProject.value) {
      void loadProject(current.value.id, { updateStageLog: false })
    }
  }, 4000)
})

watch(
  pipelineErrorContext,
  (next, prev) => {
    const text = [next?.provider, next?.model, next?.requestCapability, next?.responseSnippet].filter(Boolean).join(' / ')
    const prevText = [prev?.provider, prev?.model, prev?.requestCapability, prev?.responseSnippet].filter(Boolean).join(' / ')
    if (text && text !== prevText) pushRuntimeLog(`云端调用上下文：${text}`, 'error')
  },
  { deep: true },
)

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="clone-page">
    <section class="hero-shell">
      <div class="stage-strip">
        <button
          v-for="item in stageItems"
          :key="item.key"
          class="stage-card"
          :class="{ done: item.done, active: visibleStageKey === item.key }"
          type="button"
          @click="selectStage(item.key)"
        >
          <div class="stage-index">{{ item.done ? '✓' : '•' }}</div>
          <div class="stage-body">
            <strong>{{ item.title }}</strong>
            <span>{{ item.desc }}</span>
          </div>
        </button>
      </div>
    </section>

    <section class="workspace-grid">
      <div class="main-column">
        <article v-if="visibleStageKey === 'analyze'" class="panel panel-reference">
          <CloneStageHeader
            tag="参考视频"
            :title="safeText(isDraftingNewProject ? shortPath(referenceVideoPath) : current?.referenceVideoName, safeText(shortPath(referenceVideoPath), '上传一条参考视频开始复刻'))"
            description="先锁定参考素材，再提炼脚本结构、节奏与可复刻信息。"
          >
            <template #actions>
              <button class="primary-button small" type="button" :disabled="loading" @click="createBlueprint">分析脚本</button>
            </template>
            <template #aux>
              <button class="ghost-button small secondary-action" type="button" @click="pickReferenceVideo">上传视频</button>
              <span>状态：{{ safeText(humanWorkflowStep(workflowStep), '--') }}</span>
              <span>参考视频：{{ safeText(shortPath(referenceSourcePath), '--') }}</span>
            </template>
          </CloneStageHeader>

          <div class="reference-layout">
            <div class="video-shell tall-video">
              <video v-if="referenceSourcePath" :src="mediaUrl(referenceSourcePath)" controls preload="metadata"></video>
              <CloneStateCard
                v-else
                class="empty-state"
                title="等待参考视频"
                description="上传一条竖版或横版参考视频后，系统会先分析整条脚本结构。"
              />
            </div>

            <div class="reference-side">
              <div class="meta-grid">
                <CloneDataCard class="meta-card">
                  <span>标题</span>
                  <strong>{{ safeText(current?.blueprint?.title, '--') }}</strong>
                </CloneDataCard>
                <CloneDataCard class="meta-card">
                  <span>市场</span>
                  <strong>{{ safeText(current?.blueprint?.market, '--') }}</strong>
                </CloneDataCard>
                <CloneDataCard class="meta-card">
                  <span>语言</span>
                  <strong>{{ safeText(current?.blueprint?.localization?.language, '--') }}</strong>
                </CloneDataCard>
                <CloneDataCard class="meta-card">
                  <span>节奏</span>
                  <strong>{{ safeText(current?.blueprint?.renderHints?.pacing, '--') }}</strong>
                </CloneDataCard>
              </div>

              <div class="beats-grid">
                <CloneDataCard v-for="item in storyBeats.slice(0, 6)" :key="item.id" class="beat-card">
                  <strong>{{ safeText(item.purpose, 'beat') }}</strong>
                  <span>{{ safeText(item.shotType || item.productRole, 'story beat') }}</span>
                </CloneDataCard>
                <CloneStateCard
                  v-if="!storyBeats.length"
                  class="empty-state small-empty"
                  title="等待分析结果"
                  description="完成脚本分析后，这里会展示参考视频的核心结构。"
                />
              </div>
            </div>
          </div>
        </article>

        <article v-if="visibleStageKey === 'variant'" class="panel">
          <CloneStageHeader tag="脚本变体" title="生成多个相似脚本并评分，单选 1 条继续" description="保持参考逻辑不变，但提高脚本可用性与商业转化潜力。">
            <template #actions>
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="generateScriptVariants">生成脚本</button>
            </template>
            <template #aux>
              <label class="inline-control">
                <span>数量</span>
                <input v-model.number="variantCount" class="count-input" type="number" min="1" max="6" />
              </label>
              <span>候选数：{{ scriptVariants.length }}</span>
              <span>已选脚本：{{ selectedVariantId ? '已选择' : '未选择' }}</span>
            </template>
          </CloneStageHeader>

          <div class="variant-grid">
            <button
              v-for="item in scriptVariants"
              :key="item.id"
              class="variant-card"
              :class="{ selected: selectedVariantId === item.id }"
              type="button"
              @click="selectScriptVariant(item.id)"
            >
              <div class="variant-score">{{ item.score.toFixed(1) }}</div>
              <div class="variant-copy">
                <strong>{{ item.title }}</strong>
                <p>{{ item.summary }}</p>
                <span>{{ item.reason }}</span>
              </div>
            </button>
            <CloneStateCard
              v-if="!scriptVariants.length"
              class="empty-state section-empty"
              title="等待脚本候选"
              description="分析完成后点击“生成脚本”，系统会给出多条候选脚本并评分。"
            />
          </div>
        </article>

        <div v-if="visibleStageKey === 'grid'" class="asset-grid">
          <article class="panel">
            <CloneStageHeader tag="模特" title="弹窗选择可复用模特" description="绑定当前分镜流程所需的固定人物身份与视觉风格。">
              <template #actions>
                <button class="primary-button small" type="button" @click="modelModalOpen = true">选择模特</button>
              </template>
              <template #aux>
                <button class="ghost-button small secondary-action" type="button" :disabled="modelLoading" @click="refreshModels">刷新模特库</button>
                <span>当前模特：{{ safeText(modelSnapshot?.name, '待选择') }}</span>
              </template>
            </CloneStageHeader>

            <CloneDataCard class="selected-model">
              <div class="model-cover">
                <img v-if="modelPreview(modelSnapshot)" :src="modelPreview(modelSnapshot)" alt="model-preview" />
                <CloneStateCard
                  v-else
                  class="empty-state small-empty"
                  title="未选择模特"
                  description="先从模特库绑定一个可复用身份。"
                />
              </div>
              <div class="selected-model-copy data-card-copy">
                <strong>{{ safeText(modelSnapshot?.name, '等待选择模特') }}</strong>
                <span>{{ safeText(modelSnapshot?.model || modelSnapshot?.id, '当前项目还未绑定模特身份') }}</span>
              </div>
            </CloneDataCard>
          </article>

          <article class="panel">
            <CloneStageHeader tag="商品图" title="上传商品参考图" description="控制商品主体、细节与卖点镜头所需的核心资产。">
              <template #actions>
                <button class="primary-button small" type="button" @click="pickProductImages">上传图片</button>
              </template>
              <template #aux>
                <span>已上传：{{ productRefs.length }} 张</span>
                <span>建议：3-9 张商品图</span>
              </template>
            </CloneStageHeader>

            <div class="product-grid">
              <CloneMediaCard v-for="item in visibleProductThumbs" :key="item" class="product-thumb">
                <img :src="previewImage(item)" alt="product-reference" />
              </CloneMediaCard>
              <CloneMediaCard v-if="visibleProductThumbs.length < 9" as="button" class="product-thumb add-thumb" type="button" @click="pickProductImages">+</CloneMediaCard>
            </div>
            <div class="panel-tip">每行 3 个，最多显示 3 行。当前 {{ productRefs.length }} 张。</div>
          </article>
        </div>

        <article v-if="visibleStageKey === 'grid'" class="panel">
          <CloneStageHeader tag="分镜拼图" title="6/9 宫格拼图与自动裁切" description="把脚本结构、模特身份和商品图压缩成可直接进入视频生成的镜头素材。">
            <template #actions>
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="generateStoryboardGrids">生成拼图</button>
            </template>
            <template #aux>
              <span>拼图批次：{{ storyboardBatches.length }}</span>
              <span>裁切分镜：{{ storyboardFrames.length }}</span>
            </template>
          </CloneStageHeader>

          <div class="storyboard-layout">
            <div class="storyboard-batch-list">
              <CloneMediaCard v-for="batch in storyboardBatches" :key="batch.id" class="storyboard-batch-card">
                <div class="batch-cover">
                  <img v-if="batch.imagePath" :src="previewImage(batch.imagePath)" alt="storyboard-grid" />
                  <CloneStateCard
                    v-else
                    class="empty-state small-empty"
                    title="等待拼图"
                    description="满足条件后会在这里显示分镜拼图。"
                  />
                </div>
                <div class="batch-meta data-card-copy">
                  <strong>{{ batch.gridType }} / {{ batch.frameCount }} 格</strong>
                  <span>{{ humanStatus(batch.status) }}</span>
                </div>
              </CloneMediaCard>
              <CloneStateCard
                v-if="!storyboardBatches.length"
                class="empty-state section-empty"
                title="等待生成拼图"
                description="选择脚本、模特和商品图后，即可生成分镜拼图。"
              />
            </div>

            <div class="frame-grid">
              <CloneMediaCard v-for="frame in storyboardFrames" :key="frame.id" class="frame-card">
                <img v-if="frame.imagePath" :src="previewImage(frame.imagePath)" alt="frame" />
                <CloneStateCard
                  v-else
                  class="empty-state small-empty"
                  tone="pending"
                  title="待裁切"
                  description="该分镜还没有裁切结果。"
                />
                <strong>{{ safeText(shotLabel(frame.shotId), '分镜') }}</strong>
                <span>{{ humanStatus(frame.status) }}</span>
              </CloneMediaCard>
            </div>
          </div>
        </article>

        <article v-if="visibleStageKey === 'video'" class="panel panel-video-stage">
          <CloneStageHeader
            class="video-stage-header"
            tag=""
            :title="tr('cloneView.videoStage.title')"
            :description="tr('cloneView.videoStage.description')"
          >
            <template #actions>
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="generateShotVideos">{{ tr('cloneView.videoStage.primaryAction') }}</button>
              <button class="ghost-button small" type="button" :disabled="loading" @click="selectStage('compose')">进入最终成片</button>
            </template>
            <template #aux>
              <span>当前分镜：{{ shotVideoOutputs.length }}</span>
              <span>失败分镜：{{ failedShotOutputs.length }}</span>
              <span>当前项目：{{ safeText(current?.title, '未选择项目') }}</span>
            </template>
          </CloneStageHeader>

          <div v-if="shotVideoOutputs.length" class="shot-workbench shot-workbench--reference">
            <div class="video-stage-layout video-stage-layout--workarea">
              <div class="video-stage-main">
                <div class="shot-reference-layout">
                  <section class="shot-table-panel">
                    <div class="shot-table-head">
                      <div class="shot-table-tabs">
                        <button class="shot-table-tab shot-table-tab--active" type="button">{{ tr('cloneView.videoStage.listTab') }}</button>
                        <button class="shot-table-tab" type="button">{{ tr('cloneView.videoStage.settingsTab') }}</button>
                      </div>
                      <div class="shot-table-actions">
                        <button class="ghost-button small" type="button" :disabled="loading || !failedShotOutputs.length" @click="syncFailedShotVideo(failedShotOutputs[0].shotId)">
                          {{ tr('cloneView.videoStage.retryFailed') }}
                        </button>
                        <button class="ghost-button small" type="button" :disabled="loading || !current?.id" @click="refreshRemoteStatus">{{ tr('cloneView.videoStage.refreshStatus') }}</button>
                      </div>
                    </div>

                    <div class="shot-table-toolbar">
                      <div class="shot-table-summary">
                        <button class="shot-summary-link" :class="{ active: selectedShotFilter === 'all' }" type="button" @click="selectedShotFilter = 'all'">{{ tr('cloneView.videoStage.filters.all') }} {{ shotVideoOutputs.length }}</button>
                        <button class="shot-summary-link" :class="{ active: selectedShotFilter === 'ready' }" type="button" @click="selectedShotFilter = 'ready'">{{ tr('cloneView.videoStage.filters.ready') }} {{ completedShotCount }}</button>
                        <button class="shot-summary-link" :class="{ active: selectedShotFilter === 'failed' }" type="button" @click="selectedShotFilter = 'failed'">{{ tr('cloneView.videoStage.filters.failed') }} {{ failedShotOutputs.length }}</button>
                        <button class="shot-summary-link" :class="{ active: selectedShotFilter === 'pending' }" type="button" @click="selectedShotFilter = 'pending'">{{ tr('cloneView.videoStage.filters.pending') }} {{ pendingShotCount }}</button>
                      </div>
                      <div class="shot-table-stats">
                        <span>{{ tr('cloneView.videoStage.stats.ordered') }}</span>
                        <span>{{ tr('cloneView.videoStage.stats.failedPending') }}：{{ failedShotOutputs.length }}</span>
                      </div>
                    </div>

                    <div class="shot-reference-header" role="row">
                      <span>{{ tr('cloneView.videoStage.columns.shot') }}</span>
                      <span>{{ tr('cloneView.videoStage.columns.frame') }}</span>
                      <span>{{ tr('cloneView.videoStage.columns.script') }}</span>
                      <span>{{ tr('cloneView.videoStage.columns.duration') }}</span>
                      <span>{{ tr('cloneView.videoStage.columns.motion') }}</span>
                      <span>{{ tr('cloneView.videoStage.columns.status') }}</span>
                      <span>{{ tr('cloneView.videoStage.columns.actions') }}</span>
                    </div>

                    <div class="shot-table-body shot-table-body--reference">
                      <button
                        v-for="item in filteredShotOutputs"
                        :key="item.shotId"
                        class="shot-reference-row"
                        :class="{
                          active: selectedShotOutput?.shotId === item.shotId,
                          ready: Boolean(item.videoPath),
                          failed: item.status === 'failed' || item.status === 'polling_timeout' || Boolean(item.error),
                        }"
                        type="button"
                        @click="selectedShotId = item.shotId"
                      >
                        <span class="shot-reference-cell shot-reference-cell--index">
                          <strong>{{ safeText(item.index ? String(item.index).padStart(2, '0') : '', String(shotVideoOutputs.findIndex((entry) => entry.shotId === item.shotId) + 1).padStart(2, '0')) }}</strong>
                          <small>{{ `脚本-${shotVideoOutputs.findIndex((entry) => entry.shotId === item.shotId) + 1}` }}</small>
                        </span>
                        <span class="shot-reference-cell shot-reference-cell--thumb">
                          <span v-if="storyboardFrames.find((frame) => frame.shotId === item.shotId)?.imagePath" class="shot-thumb shot-thumb--large">
                            <img
                              :src="previewImage(storyboardFrames.find((frame) => frame.shotId === item.shotId)?.imagePath)"
                              :alt="safeText(shotLabel(item.shotId), '分镜')"
                            />
                          </span>
                          <span v-else class="shot-thumb shot-thumb--large shot-thumb--empty">{{ tr('cloneView.videoStage.noFrame') }}</span>
                        </span>
                        <span class="shot-reference-cell shot-reference-cell--copy">
                          <strong>{{ shotScriptSummary(item.shotId) }}</strong>
                          <small>{{ safeText(shotLabel(item.shotId), '分镜') }}</small>
                        </span>
                        <span class="shot-reference-cell shot-reference-cell--metric">
                          <strong>{{ formatDuration(item.durationSec) }}</strong>
                        </span>
                        <span class="shot-reference-cell shot-reference-cell--metric">
                          <strong>{{ localizeShotField(storyBeats.find((beat) => beat.id === item.shotId)?.shotType) }}</strong>
                        </span>
                        <span class="shot-reference-cell shot-reference-cell--status">
                          <span class="queue-dot" :class="`queue-dot--${item.videoPath ? 'success' : item.error ? 'danger' : loading ? 'working' : 'idle'}`"></span>
                          <span class="shot-reference-status-copy">
                            <strong>{{ humanStatus(item.status) }}</strong>
                            <small>{{ safeText(item.remoteStatus, item.videoPath ? tr('cloneView.videoStage.filters.ready') : tr('cloneView.videoStage.filters.pending')) }}</small>
                          </span>
                        </span>
                        <span class="shot-reference-cell shot-reference-cell--actions">
                          <button class="ghost-button small icon-button" type="button" @click.stop="selectedShotId = item.shotId" :title="tr('cloneView.videoStage.actionPreview')">▶</button>
                          <button
                            class="ghost-button small icon-button"
                            type="button"
                            :disabled="loading || !current?.id"
                            :title="tr('cloneView.videoStage.actionRegenerate')"
                            @click.stop="regenerateShotClip(item.shotId)"
                          >
                            ↻
                          </button>
                          <button
                            v-if="item.status === 'failed' || item.status === 'polling_timeout' || item.error"
                            class="ghost-button small icon-button"
                            type="button"
                            :disabled="loading"
                            :title="tr('cloneView.videoStage.actionRetryQuery')"
                            @click.stop="syncFailedShotVideo(item.shotId)"
                          >
                            ⟳
                          </button>
                        </span>
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              <div class="video-stage-preview">
                <CloneConsoleSidebar :tag="tr('cloneView.videoStage.previewTag')" :title="tr('cloneView.videoStage.previewTitle')">
                  <div class="feedback-stack feedback-stack--preview">
                    <section class="sidebar-section sidebar-section--preview">
                      <div class="sidebar-section__head">
                        <strong>{{ tr('cloneView.videoStage.previewTag') }}</strong>
                        <small>{{ safeText(stageItems.find((item) => item.key === visibleStageKey)?.title, '--') }}</small>
                      </div>
                      <div class="sidebar-preview-shell">
                        <div v-if="selectedShotOutput" class="sidebar-preview-shell__hud">
                          <span>{{ `${tr('cloneView.videoStage.columns.shot')} ${String((selectedShotIndex >= 0 ? selectedShotIndex : 0) + 1).padStart(2, '0')}` }}</span>
                          <span>{{ formatDuration(selectedShotOutput?.durationSec) }}</span>
                        </div>
                        <video v-if="selectedShotOutput?.videoPath" :src="mediaUrl(selectedShotOutput.videoPath)" controls preload="metadata"></video>
                        <CloneStateCard
                          v-else
                          class="empty-state small-empty"
                          tone="pending"
                          :title="tr('cloneView.videoStage.emptyPreviewTitle')"
                          :description="tr('cloneView.videoStage.emptyPreviewDescription')"
                        />
                      </div>
                      <CloneDataCard class="meta-card" size="large">
                        <span>{{ tr('cloneView.videoStage.currentShot') }}</span>
                        <strong>{{ safeText(shotLabel(selectedShotOutput?.shotId || ''), tr('cloneView.videoStage.notSelected')) }}</strong>
                        <em>{{ shotScriptSummary(selectedShotOutput?.shotId) }}</em>
                      </CloneDataCard>
                      <CloneDataCard class="meta-card sidebar-script-card">
                        <span>{{ tr('cloneView.videoStage.scriptTitle') }}</span>
                        <strong>{{ safeText(selectedStoryBeat?.purpose, tr('cloneView.videoStage.noScript')) }}</strong>
                        <em>{{ tr('cloneView.videoStage.motionLabel') }}：{{ localizeShotField(selectedStoryBeat?.shotType) }} · {{ tr('cloneView.videoStage.productRoleLabel') }}：{{ localizeShotField(selectedStoryBeat?.productRole) }}</em>
                      </CloneDataCard>
                      <CloneDataCard class="meta-card sidebar-frame-card">
                        <span>{{ tr('cloneView.videoStage.referenceFrame') }}</span>
                        <div
                          v-if="selectedShotOutput && storyboardFrames.find((frame) => frame.shotId === selectedShotOutput.shotId)?.imagePath"
                          class="sidebar-frame-thumb"
                        >
                          <img
                            :src="previewImage(storyboardFrames.find((frame) => frame.shotId === selectedShotOutput.shotId)?.imagePath)"
                            :alt="safeText(shotLabel(selectedShotOutput.shotId), '参考分镜')"
                          />
                        </div>
                        <div v-else class="sidebar-frame-thumb sidebar-frame-thumb--empty">{{ tr('cloneView.videoStage.noReferenceFrame') }}</div>
                      </CloneDataCard>
                      <CloneDataCard class="meta-card compact-meta-grid">
                        <span>{{ tr('cloneView.videoStage.columns.status') }}</span>
                        <strong>{{ safeText(selectedShotOutput ? humanStatus(selectedShotOutput.status) : '--', '--') }}</strong>
                        <span>{{ tr('cloneView.videoStage.modelLabel') }}</span>
                        <strong>{{ safeText(selectedShotOutput?.provider, '--') }} / {{ safeText(selectedShotOutput?.model, '--') }}</strong>
                        <span>{{ tr('cloneView.videoStage.taskIdLabel') }}</span>
                        <strong>{{ safeText(selectedShotOutput?.taskId, '--') }}</strong>
                      </CloneDataCard>
                    </section>
                  </div>
                </CloneConsoleSidebar>
              </div>
            </div>

            <div class="compose-fallback-bar">
              <div class="compose-fallback-copy">
                <strong>下一步：合成最终成片</strong>
                <span>如果右上角步骤无法点击，可直接从这里进入。</span>
              </div>
              <button
                class="primary-button small"
                type="button"
                :disabled="loading"
                @click.stop="selectStage('compose')"
              >
                前往合成最终成片
              </button>
            </div>
          </div>

          <CloneStateCard
            v-else
            class="empty-state section-empty"
            title="等待视频结果"
            description="拼图裁切完成后，这里会进入镜头队列工作区，并按镜头顺序查看生成结果。"
          />
        </article>

        <article v-if="visibleStageKey === 'compose'" class="panel panel-compose-stage">
          <CloneStageHeader tag="合成检查" title="检查片段后输出成片" description="确认片段无误后再合成。">
            <template #actions>
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="composeFinalVideo">{{ finalButtonLabel }}</button>
            </template>
            <template #aux>
              <span>可检查片段：{{ shotVideoOutputs.length }} 条</span>
              <span>输出状态：{{ finalOutputPath ? '已有成片' : '待合成' }}</span>
            </template>
          </CloneStageHeader>

          <div class="compose-workbench">
            <section class="compose-list-panel">
              <div class="compose-list-head">
                <div class="compose-list-copy">
                  <span class="panel-tag">分镜列表</span>
                  <strong>选择并替换需要重做的片段</strong>
                </div>
                <span class="mini-pill mini-pill--ghost">{{ shotVideoOutputs.length }} 条</span>
              </div>

              <div v-if="shotVideoOutputs.length" class="compose-shot-list">
                <div
                  v-for="item in shotVideoOutputs"
                  :key="`${item.shotId}-review`"
                  class="compose-shot-row"
                  :class="{ active: selectedShotOutput?.shotId === item.shotId }"
                  @click="selectedShotId = item.shotId"
                  @keydown.enter.prevent="selectedShotId = item.shotId"
                  @keydown.space.prevent="selectedShotId = item.shotId"
                  role="button"
                  tabindex="0"
                >
                  <div class="compose-shot-thumb">
                    <video v-if="item.videoPath" :src="mediaUrl(item.videoPath)" preload="metadata" muted></video>
                    <img v-else-if="shotFrameMap[item.shotId]?.imagePath" :src="previewImage(shotFrameMap[item.shotId]?.imagePath)" alt="shot-frame" />
                    <span v-else>无预览</span>
                  </div>

                  <div class="compose-shot-main">
                    <div class="compose-shot-main__head">
                      <strong>{{ safeText(shotLabel(item.shotId), '分镜') }}</strong>
                      <span class="mini-pill" :class="{ replaced: item.source === 'uploaded_replacement' }">
                        {{ item.source === 'uploaded_replacement' ? '替换片段' : '生成片段' }}
                      </span>
                    </div>
                    <p>{{ safeText(storyBeatMap[item.shotId]?.visualDescription || storyBeatMap[item.shotId]?.scriptSegment, '当前分镜暂无描述') }}</p>
                    <div class="compose-shot-meta">
                      <span>{{ humanStatus(item.status) }}</span>
                      <span>{{ formatDuration(item.durationSec) }}</span>
                    </div>
                  </div>

                  <div class="compose-shot-actions">
                    <button
                      v-if="item.status === 'failed' || item.status === 'polling_timeout' || item.error"
                      class="primary-button small"
                      type="button"
                      :disabled="loading"
                      @click.stop="syncFailedShotVideo(item.shotId)"
                    >
                      继续查询
                    </button>
                    <button class="ghost-button small" type="button" :disabled="loading" @click.stop="replaceShotVideo(item.shotId)">替换视频</button>
                  </div>
                </div>
              </div>

              <CloneStateCard
                v-else
                class="empty-state section-empty"
                title="等待检查片段"
                description="分镜视频生成完成后，这里可以逐个替换镜头再重新合成。"
              />
            </section>

            <aside class="final-side final-delivery-side">
              <div class="final-preview-panel">
                <div class="final-preview-head">
                  <div class="final-preview-copy">
                    <span class="panel-tag">最终成片</span>
                    <strong>{{ finalOutputPath ? '当前输出预览' : '等待输出结果' }}</strong>
                  </div>
                  <span class="mini-pill" :class="finalOutputPath ? '' : 'mini-pill--ghost'">
                    {{ finalOutputPath ? '已输出' : '未完成' }}
                  </span>
                </div>

                <div class="video-shell final-video">
                  <video v-if="finalOutputPath" :src="mediaUrl(finalOutputPath)" controls preload="metadata"></video>
                  <CloneStateCard v-else class="empty-state" title="等待成片" description="合成完成后显示。" />
                </div>
              </div>

              <CloneDataCard class="meta-card final-summary-card" size="large">
                <span>交付状态</span>
                <strong>{{ finalOutputPath ? '成片已输出' : '等待合成' }}</strong>
                <em>{{ safeText(stageLog, '--') }}</em>
              </CloneDataCard>

              <div class="final-summary-grid">
                <CloneDataCard class="meta-card final-stat-card">
                  <span>当前阶段</span>
                  <strong>{{ safeText(currentStageTitle, '等待继续') }}</strong>
                </CloneDataCard>
                <CloneDataCard class="meta-card final-stat-card">
                  <span>片段数量</span>
                  <strong>{{ shotVideoOutputs.length }} 条</strong>
                </CloneDataCard>
              </div>

              <CloneDataCard class="meta-card final-output-card">
                <span>输出文件</span>
                <strong>{{ safeText(shortPath(finalOutputPath), '--') }}</strong>
                <em>工作流：{{ safeText(humanWorkflowStep(workflowStep), '--') }}</em>
              </CloneDataCard>

              <CloneDataCard v-if="errorText" class="meta-card" tone="danger">
                <span>错误信息</span>
                <strong>{{ safeText(errorText, '未知错误') }}</strong>
              </CloneDataCard>

              <CloneDataCard v-if="pipelineErrorContext" class="meta-card" tone="context">
                <span>调用上下文</span>
                <strong>{{ safeText(pipelineErrorContext.provider, '--') }} / {{ safeText(pipelineErrorContext.model, '--') }}</strong>
                <em>接口格式：{{ safeText(pipelineErrorContext.endpointStyle, '--') }}</em>
                <em>请求能力：{{ safeText(pipelineErrorContext.requestCapability, '--') }}</em>
                <em>任务 ID：{{ safeText(pipelineErrorContext.taskId, '--') }}</em>
                <em>Base URL：{{ safeText(pipelineErrorContext.baseUrl, '--') }}</em>
                <em v-if="pipelineErrorContext.responseSnippet">响应片段：{{ safeText(pipelineErrorContext.responseSnippet, '--') }}</em>
              </CloneDataCard>
            </aside>
          </div>
        </article>

        <article class="panel advanced-panel">
          <button class="advanced-toggle" type="button" @click="advancedOpen = !advancedOpen">
            <span>高级模式</span>
            <strong>{{ advancedOpen ? '收起' : '展开' }}</strong>
          </button>
          <div v-if="advancedOpen" class="advanced-copy">
            旧分镜池、旧方案池、批量工作台与单镜重跑能力仍保留在内部链路中，当前默认界面只保留复刻主流程。
          </div>
        </article>
      </div>

    </section>

    <div v-if="modelModalOpen" class="modal-mask" @click.self="modelModalOpen = false">
      <div class="modal-panel">
        <div class="panel-head">
          <div>
            <span class="panel-tag">模特库</span>
            <h2>选择可复用模特</h2>
          </div>
          <div class="panel-actions">
            <button class="ghost-button small" type="button" @click="modelModalOpen = false">关闭</button>
          </div>
        </div>

        <div class="model-grid">
          <CloneMediaCard v-for="item in models" :key="item.id" as="button" class="model-card" type="button" @click="selectModel(item)">
            <div class="model-card-cover">
              <img v-if="modelPreview(item)" :src="modelPreview(item)" alt="model-preview" />
              <div v-else class="empty-state small-empty">无图</div>
            </div>
            <div class="model-card-copy data-card-copy">
              <strong>{{ safeText(item.name, '未命名模特') }}</strong>
              <span>{{ safeText(item.sceneStyle || item.model, 'AI 模特') }}</span>
            </div>
          </CloneMediaCard>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clone-page {
  min-height: 100%;
  padding: 8px 18px 20px;
  background:
    radial-gradient(circle at top left, rgba(85, 99, 198, 0.12), transparent 22%),
    radial-gradient(circle at top right, rgba(28, 155, 138, 0.08), transparent 18%),
    linear-gradient(180deg, #0d1528 0%, #09101e 100%);
  color: #eef3ff;
}

.hero-shell,
.workspace-grid,
.reference-layout,
.meta-grid,
.beats-grid,
.asset-grid,
.storyboard-layout,
.storyboard-batch-list,
.frame-grid,
.review-grid,
.final-layout,
.feedback-stack,
.history-list,
.model-grid,
.stage-strip {
  display: grid;
}

.hero-shell {
  position: relative;
  z-index: 50;
  isolation: isolate;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid rgba(119, 137, 198, 0.14);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(12, 19, 34, 0.96), rgba(9, 15, 27, 0.98));
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.22);
}

.panel-head,
.panel-actions,
.selected-model,
.review-head,
.advanced-toggle {
  display: flex;
}

.eyebrow,
.panel-tag {
  display: inline-block;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8ea6ff;
  font-weight: 700;
}

.panel h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.15;
  font-weight: 800;
}

.status-pill,
.mini-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #d8e2ff;
  font-size: 13px;
  font-weight: 700;
}

.status-pill.success {
  color: #9df0ce;
  border-color: rgba(81, 206, 149, 0.28);
  background: rgba(81, 206, 149, 0.12);
}

.status-pill.danger {
  color: #ffbcbc;
  border-color: rgba(255, 120, 120, 0.28);
  background: rgba(255, 120, 120, 0.1);
}

.status-pill.working {
  color: #dfe6ff;
  border-color: rgba(142, 166, 255, 0.26);
  background: rgba(142, 166, 255, 0.12);
}

.stage-strip {
  position: relative;
  z-index: 2;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.stage-card,
.panel,
.meta-card,
.ghost-button,
.primary-button,
.count-input,
.variant-card,
.storyboard-batch-card,
.frame-card,
.review-card,
.advanced-toggle {
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: rgba(12, 19, 34, 0.94);
  border-radius: 18px;
}

.stage-card {
  position: relative;
  z-index: 5;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  padding: 8px 12px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 1px solid rgba(119, 137, 198, 0.14);
  border-radius: 16px;
  background: rgba(12, 19, 34, 0.36);
  box-shadow: none;
  min-height: 60px;
}

.stage-card.done {
  color: #dff8ed;
}

.stage-card.active {
  border-color: rgba(142, 166, 255, 0.26);
  background: linear-gradient(180deg, rgba(27, 39, 68, 0.92), rgba(16, 24, 43, 0.56));
  box-shadow: inset 0 0 0 1px rgba(142, 166, 255, 0.1);
  z-index: 6;
}

.stage-index {
  position: relative;
  z-index: 1;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.04);
  color: #8ea6ff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 800;
}

.stage-body {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}

.stage-body strong,
.meta-card strong,
.variant-copy strong,
.batch-meta strong,
.selected-model-copy strong,
.review-head strong,
.history-copy strong {
  display: block;
  font-size: 13px;
  line-height: 1.35;
}

.stage-body span,
.meta-card span,
.meta-card em,
.variant-copy span,
.variant-copy p,
.batch-meta span,
.panel-tip,
.selected-model-copy span,
.shot-meta span,
.history-copy span,
.history-copy small,
.frame-card span {
  color: #93a2c1;
  font-size: 11px;
  line-height: 1.55;
}

.stage-card.done .stage-index {
  color: #89f1ca;
  border-color: rgba(88, 214, 154, 0.26);
  background: rgba(88, 214, 154, 0.12);
}

.stage-card.active .stage-index {
  color: #f3f6ff;
  border-color: rgba(142, 166, 255, 0.34);
  background: linear-gradient(135deg, rgba(111, 88, 255, 0.96), rgba(89, 182, 255, 0.88));
  box-shadow: 0 0 0 4px rgba(111, 88, 255, 0.12);
}

.stage-card.active .stage-body strong {
  color: #f5f7ff;
}

.stage-card.active .stage-body span {
  color: #bcc8e8;
}

.stage-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 2px 2px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.stage-summary-copy {
  display: grid;
  gap: 4px;
}

.stage-summary-copy strong {
  color: #f0f4ff;
  font-size: 14px;
  font-weight: 700;
}

.stage-summary-copy span:last-child,
.stage-summary-meta span {
  color: #8fa0c4;
  font-size: 12px;
  line-height: 1.5;
}

.stage-summary-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.meta-card em {
  display: block;
  font-style: normal;
  margin-top: 6px;
}

.workspace-grid {
  position: relative;
  z-index: 1;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  margin-top: 14px;
}

.main-column {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 14px;
}

.panel {
  position: relative;
  z-index: 1;
  padding: 15px;
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(12px);
}

.panel-reference {
  background:
    linear-gradient(180deg, rgba(15, 22, 38, 0.98), rgba(10, 16, 29, 0.98)),
    radial-gradient(circle at top left, rgba(84, 101, 194, 0.12), transparent 28%);
}

.panel-head {
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.panel-head > div:first-child {
  display: grid;
  gap: 8px;
}

.stage-head {
  margin-bottom: 10px;
}

.stage-head__main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.stage-head__aux {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 34px;
  padding: 0 2px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stage-head__aux span {
  color: #8fa0c4;
  font-size: 11px;
  line-height: 1.4;
}

.panel-actions {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.inline-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.inline-control span {
  color: #93a2c1;
  font-size: 11px;
  font-weight: 700;
}

.reference-layout {
  grid-template-columns: minmax(320px, 0.92fr) minmax(320px, 1.08fr);
  gap: 14px;
  margin-top: 12px;
}

.video-shell {
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03);
}

.video-shell video,
.product-thumb img,
.model-cover img,
.model-card-cover img,
.batch-cover img,
.frame-card img,
.history-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tall-video {
  max-height: 600px;
  min-height: 420px;
}

.reference-side,
.final-side {
  display: grid;
  gap: 12px;
}

.meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.meta-card {
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}

.data-card {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}

.data-card-copy {
  display: grid;
  gap: 6px;
}

.media-card {
  border-radius: 18px;
  border: 1px solid rgba(134, 149, 205, 0.18);
  background:
    linear-gradient(180deg, rgba(17, 24, 40, 0.96), rgba(12, 19, 34, 0.96)),
    rgba(12, 19, 34, 0.94);
}

.large-card {
  min-height: 132px;
}

.danger-card {
  border-color: rgba(255, 120, 120, 0.28);
  background: rgba(120, 22, 22, 0.12);
}

.context-card {
  border-color: rgba(120, 144, 255, 0.2);
  background: rgba(36, 54, 105, 0.18);
}

.failure-card {
  display: grid;
  gap: 8px;
}

.failure-card strong,
.failure-card em {
  word-break: break-word;
}

.failure-card em {
  font-style: normal;
}

.failure-action {
  min-width: 0;
}

.secondary-action {
  opacity: 0.9;
}

.runtime-log-panel {
  display: grid;
  gap: 10px;
  min-height: 0;
}

.runtime-log-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #93a2c1;
  font-size: 12px;
  font-weight: 700;
}

.runtime-log-list {
  max-height: 260px;
  overflow: auto;
  display: grid;
  gap: 8px;
  padding-right: 4px;
  scroll-behavior: smooth;
}

.runtime-log-item {
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.runtime-log-item strong {
  font-size: 11px;
  color: #7e90bb;
}

.runtime-log-item span {
  color: #edf2ff;
  font-size: 12px;
  line-height: 1.55;
}

.runtime-log-item.success {
  border-color: rgba(88, 214, 154, 0.18);
  background: rgba(88, 214, 154, 0.08);
}

.runtime-log-item.error {
  border-color: rgba(255, 120, 120, 0.22);
  background: rgba(255, 120, 120, 0.08);
}

.runtime-log-item.info {
  border-color: rgba(142, 166, 255, 0.16);
}

.beats-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.beat-card {
  min-height: 88px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.beat-card strong {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  text-transform: lowercase;
}

.variant-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.variant-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
}

.variant-card.selected {
  border-color: rgba(138, 156, 255, 0.34);
  box-shadow: 0 0 0 1px rgba(138, 156, 255, 0.26) inset;
}

.variant-score {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(111, 88, 255, 0.94), rgba(89, 182, 255, 0.84));
  color: #fff;
  font-weight: 800;
  font-size: 18px;
}

.variant-copy p {
  margin: 6px 0 0;
}

.asset-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.selected-model {
  gap: 12px;
  align-items: center;
  margin-top: 12px;
}

.model-cover,
.model-card-cover {
  width: 116px;
  height: 116px;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.selected-model-copy {
  display: grid;
  gap: 6px;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-top: 12px;
}

.product-thumb {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.add-thumb {
  display: grid;
  place-items: center;
  color: #8ea6ff;
  font-size: 32px;
  cursor: pointer;
}

.storyboard-layout {
  grid-template-columns: minmax(280px, 0.42fr) minmax(0, 0.58fr);
  gap: 12px;
  margin-top: 12px;
}

.storyboard-batch-list,
.frame-grid,
.shot-video-grid,
.review-grid,
.feedback-stack,
.history-list,
.model-grid {
  gap: 10px;
}

.batch-cover {
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
}

.storyboard-batch-card,
.frame-card,
.shot-card,
.review-card {
  padding: 12px;
}

.batch-meta {
  display: grid;
  gap: 3px;
  margin-top: 8px;
}

.batch-meta strong,
.selected-model-copy strong,
.data-card strong,
.meta-card strong {
  color: #eef3ff;
}

.panel-tip {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.frame-grid,
.review-grid,
.model-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.frame-card img {
  aspect-ratio: 9 / 16;
  border-radius: 14px;
  margin-bottom: 10px;
}

.frame-card strong {
  display: block;
  margin-bottom: 2px;
  font-size: 13px;
}

.review-card {
  display: grid;
  grid-template-rows: auto auto auto auto auto 1fr;
  gap: 10px;
  align-content: start;
  min-width: 0;
  overflow: hidden;
  min-height: 452px;
}

.review-head {
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  min-height: 40px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.review-shell {
  aspect-ratio: 9 / 16;
}

.mini-pill {
  min-height: 28px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
}

.mini-pill.replaced {
  color: #cae0ff;
  background: rgba(118, 145, 255, 0.16);
  border-color: rgba(118, 145, 255, 0.22);
}

.mini-pill--ghost {
  color: #9db1d8;
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

.review-card .mini-pill {
  justify-self: end;
}

.shot-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
}

.task-meta {
  padding-top: 6px;
  border-top: 1px dashed rgba(255, 255, 255, 0.05);
}

.task-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-error {
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(255, 120, 120, 0.18);
  background: rgba(255, 120, 120, 0.08);
  color: #ffd2d2;
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.shot-workbench {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}

.shot-workbench--reference {
  gap: 10px;
}

.panel-video-stage {
  position: relative;
  z-index: 0;
  padding: 6px;
}

.panel-video-stage :deep(.clone-stage-header) {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 6px 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.panel-video-stage :deep(.stage-head) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  margin: 0;
}

.panel-video-stage :deep(.stage-head__main) {
  display: grid;
  gap: 8px;
  padding: 4px 0 2px;
}

.panel-video-stage :deep(.stage-head__main h2) {
  font-size: 20px;
  line-height: 1.15;
  letter-spacing: 0.01em;
}

.panel-video-stage :deep(.stage-head__main p) {
  max-width: 560px;
  color: #8fa1c6;
  font-size: 12px;
  line-height: 1.6;
}

.panel-video-stage :deep(.stage-head__actions) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  align-self: center;
  min-height: 100%;
  margin-left: 0;
  padding: 0 0 0 24px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-video-stage :deep(.stage-head__actions .primary-button) {
  min-width: 220px;
  height: 42px;
  padding: 0 18px;
}

.panel-video-stage :deep(.stage-head__aux) {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 36px;
  padding: 10px 0 0;
  border-bottom: 0;
}

.panel-video-stage :deep(.stage-head__aux span) {
  color: #8ea0c5;
  font-size: 11px;
  line-height: 1.4;
}

.video-stage-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 268px;
  gap: 16px;
  align-items: start;
}

.video-stage-layout--workarea {
  gap: 14px;
  padding: 8px;
  border-radius: 0;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background:
    linear-gradient(180deg, rgba(11, 18, 32, 0.96), rgba(9, 15, 27, 0.98)),
    rgba(255, 255, 255, 0.015);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 16px 42px rgba(0, 0, 0, 0.18);
}

.video-stage-main {
  min-width: 0;
  display: grid;
  gap: 0;
}

.video-stage-preview {
  min-width: 0;
  min-height: 100%;
  max-width: 268px;
}

.compose-fallback-bar {
  position: relative;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background: linear-gradient(180deg, rgba(12, 19, 34, 0.92), rgba(8, 13, 24, 0.96));
}

.compose-fallback-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  pointer-events: none;
}

.compose-fallback-copy strong {
  color: #eef3ff;
  font-size: 13px;
  line-height: 1.35;
}

.compose-fallback-copy span {
  color: #8fa0c4;
  font-size: 11px;
  line-height: 1.4;
}

.video-stage-preview :deep(.console-sidebar) {
  position: relative;
  top: auto;
  min-height: 100%;
  z-index: 0;
}

.shot-overview-panel,
.shot-table-panel {
  min-width: 0;
  min-height: 0;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    linear-gradient(180deg, rgba(15, 24, 42, 0.98), rgba(9, 15, 28, 0.96)),
    rgba(255, 255, 255, 0.02);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.shot-overview-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(4, minmax(0, 0.7fr)) auto;
  gap: 10px;
  padding: 14px 16px;
  align-items: center;
  border-color: rgba(133, 149, 196, 0.1);
  background:
    linear-gradient(180deg, rgba(17, 25, 43, 0.98), rgba(10, 16, 29, 0.96)),
    rgba(255, 255, 255, 0.02);
}

.shot-overview-progress {
  display: grid;
  gap: 10px;
}

.shot-overview-progress__copy {
  display: grid;
  gap: 4px;
}

.shot-overview-progress__copy strong {
  color: #eef3ff;
  font-size: 16px;
}

.shot-overview-progress__copy small {
  color: #8fa1c6;
  font-size: 11px;
}

.shot-overview-progress__meter {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.shot-progress-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.shot-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #6d5dff, #8b5cf6);
  box-shadow: 0 0 20px rgba(109, 93, 255, 0.35);
}

.shot-overview-progress__meter strong {
  color: #eef3ff;
  font-size: 14px;
}

.shot-overview-stats {
  display: contents;
}

.shot-stat-card {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
}

.shot-stat-card span {
  color: #8fa1c6;
  font-size: 10px;
  text-transform: uppercase;
}

.shot-stat-card strong {
  color: #eef3ff;
  font-size: 15px;
}

.shot-stat-card--danger strong {
  color: #ffb7b7;
}

.shot-overview-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.shot-reference-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  min-height: min(57vh, 780px);
}

.shot-table-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  overflow: hidden;
  min-height: 100%;
  border-color: rgba(133, 149, 196, 0.1);
  padding-top: 4px;
  background:
    linear-gradient(180deg, rgba(16, 24, 42, 0.98), rgba(10, 16, 29, 0.98)),
    rgba(255, 255, 255, 0.018);
}

.shot-table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.shot-table-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
}

.shot-table-tab {
  min-height: 40px;
  padding: 0 18px;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.035);
  color: #9fb0d5;
  font-size: 14px;
  font-weight: 700;
}

.shot-table-tab--active {
  color: #f4f7ff;
  border-color: rgba(109, 93, 255, 0.36);
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.42), rgba(109, 93, 255, 0.18));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.shot-table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shot-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.01);
}

.shot-table-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: #e9efff;
  font-size: 14px;
  font-weight: 700;
}

.shot-summary-link {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #b8c6e5;
  font-size: 13px;
  font-weight: 700;
}

.shot-summary-link.active {
  color: #ffffff;
  border-color: rgba(109, 93, 255, 0.26);
  background: rgba(109, 93, 255, 0.14);
}

.shot-reference-header,
.shot-reference-row {
  display: grid;
  grid-template-columns: 64px 96px minmax(160px, 1.7fr) 58px 64px 104px 118px;
  gap: 8px;
  align-items: center;
}

.shot-reference-header {
  padding: 10px 12px;
  color: #8fa1c6;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  white-space: nowrap;
}

.shot-reference-header > span:nth-child(2) {
  justify-self: center;
}

.shot-reference-header > span:nth-child(4),
.shot-reference-header > span:nth-child(5) {
  justify-self: start;
}

.shot-reference-header > span:nth-child(6) {
  justify-self: start;
}

.shot-reference-header > span:nth-child(7) {
  justify-self: end;
}

.shot-table-body--reference {
  padding: 0;
  gap: 0;
  overflow: auto;
}

.shot-reference-row {
  width: 100%;
  padding: 10px 12px;
  color: #eef3ff;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: transparent;
  transition: background 160ms ease, border-color 160ms ease;
}

.shot-reference-row:hover {
  background: rgba(255, 255, 255, 0.028);
}

.shot-reference-row.active {
  background: linear-gradient(90deg, rgba(84, 74, 168, 0.34), rgba(84, 74, 168, 0.16));
  box-shadow:
    inset 3px 0 0 rgba(74, 230, 158, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.shot-reference-row.failed {
  box-shadow: inset 2px 0 0 rgba(239, 68, 68, 0.8);
}

.shot-reference-row.ready:not(.failed) {
  box-shadow: none;
}

.shot-reference-cell {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.shot-reference-cell--metric strong {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.05);
  color: #dfe7fb;
  font-size: 11px;
  font-weight: 700;
}

.shot-reference-cell--thumb {
  justify-items: center;
}

.shot-reference-cell:not(.shot-reference-cell--copy):not(.shot-reference-cell--status):not(.shot-reference-cell--actions) {
  white-space: nowrap;
}

.shot-reference-cell--index strong {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.shot-reference-cell--index small,
.shot-reference-cell--copy small,
.shot-reference-status-copy small {
  color: #8fa1c6;
  font-size: 10px;
  line-height: 1.45;
}

.shot-reference-cell--copy strong,
.shot-reference-status-copy strong {
  color: #eef3ff;
  font-size: 12px;
  line-height: 1.45;
}

.shot-reference-cell--copy strong,
.shot-reference-cell--copy small {
  min-width: 0;
}

.shot-reference-cell--copy strong {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shot-reference-cell--copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-reference-cell--status {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.shot-reference-status-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.shot-reference-status-copy strong,
.shot-reference-status-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-reference-cell--actions {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
  white-space: nowrap;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: visible;
}

.shot-thumb--large {
  width: 84px;
  height: 52px;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.icon-button {
  min-width: 32px;
  min-height: 32px;
  flex: 0 0 32px;
  padding: 0;
  border-radius: 0;
  border-color: rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: #d9e3fb;
}

.icon-button:hover:not(:disabled) {
  border-color: rgba(109, 93, 255, 0.22);
  background: rgba(109, 93, 255, 0.12);
}

.shot-preview-side {
  min-width: 0;
}

.shot-preview-card {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    linear-gradient(180deg, rgba(15, 24, 42, 0.98), rgba(9, 15, 28, 0.96)),
    rgba(255, 255, 255, 0.02);
}

.shot-preview-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.shot-preview-card__title {
  display: grid;
  gap: 4px;
}

.shot-preview-card__head strong {
  color: #eef3ff;
  font-size: 15px;
}

.shot-preview-card__title small {
  color: #8fa1c6;
  font-size: 11px;
}

.shot-preview-card__shell {
  position: relative;
  aspect-ratio: 9 / 16;
}

.shot-preview-card__shell video {
  background: #060b16;
  object-fit: cover;
}

.shot-preview-card__hud {
  position: absolute;
  inset: 10px 10px auto 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  pointer-events: none;
}

.shot-preview-card__hud span {
  padding: 6px 10px;
  border-radius: 999px;
  color: #eef3ff;
  font-size: 10px;
  background: rgba(6, 11, 22, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
}

.shot-preview-empty {
  min-height: 100%;
}

.shot-preview-card__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.018);
}

.shot-preview-card__status-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shot-preview-card__status-copy {
  display: grid;
  gap: 2px;
}

.shot-preview-card__status-copy strong {
  color: #eef3ff;
  font-size: 12px;
}

.shot-preview-card__status-copy small {
  color: #8fa1c6;
  font-size: 10px;
}

.shot-preview-card__meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.014);
}

.shot-preview-card__meta span {
  color: #8fa1c6;
  font-size: 10px;
  text-transform: uppercase;
}

.shot-preview-card__meta strong {
  color: #eef3ff;
  font-size: 11px;
  line-height: 1.55;
  word-break: break-word;
}

.shot-thumb {
  width: 72px;
  height: 56px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(10, 19, 36, 0.95), rgba(7, 13, 24, 0.95));
}

.shot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.shot-thumb--empty {
  display: grid;
  place-items: center;
  color: #7f92b8;
  font-size: 9px;
  letter-spacing: 0.08em;
}

.queue-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.03);
}

.queue-dot--success {
  background: #22c55e;
}

.queue-dot--danger {
  background: #ef4444;
}

.queue-dot--working {
  background: #38bdf8;
}

.queue-dot--idle {
  background: #64748b;
}

.state-card {
  display: grid;
  align-content: center;
  gap: 6px;
}

.state-card strong {
  color: #eef3ff;
  font-size: 13px;
  font-weight: 700;
}

.state-card span {
  color: #93a2c1;
  font-size: 12px;
  line-height: 1.6;
}

.state-card--empty {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.015)),
    rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(142, 166, 255, 0.18);
}

.state-card--pending {
  background: rgba(142, 166, 255, 0.08);
  border: 1px solid rgba(142, 166, 255, 0.16);
}

.state-card--danger {
  background: rgba(255, 120, 120, 0.08);
  border: 1px solid rgba(255, 120, 120, 0.18);
}

.final-layout {
  grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
  gap: 14px;
  margin-top: 10px;
  align-items: start;
}

.final-preview-panel {
  display: grid;
  gap: 10px;
  align-content: start;
}

.final-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background: linear-gradient(180deg, rgba(12, 19, 34, 0.94), rgba(8, 13, 24, 0.98));
}

.final-preview-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.final-preview-copy strong {
  color: #eef3ff;
  font-size: 13px;
  line-height: 1.35;
}

.final-video {
  min-height: 0;
  max-width: 360px;
  aspect-ratio: 9 / 16;
  justify-self: start;
  border-radius: 0;
  overflow: hidden;
  border: 1px solid rgba(133, 149, 196, 0.14);
  background:
    radial-gradient(circle at top, rgba(109, 93, 255, 0.14), transparent 36%),
    linear-gradient(180deg, rgba(10, 16, 29, 0.96), rgba(6, 10, 18, 0.98));
}

.final-video video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.final-side {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.final-delivery-side {
  align-content: start;
}

.final-summary-card,
.final-output-card,
.final-stat-card {
  border-radius: 0;
}

.final-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.final-stat-card strong,
.final-summary-card strong,
.final-output-card strong {
  line-height: 1.35;
}

.panel-compose-stage :deep(.stage-head__main p),
.panel-final-stage :deep(.stage-head__main p) {
  max-width: 420px;
}

.panel-compose-stage :deep(.stage-head__main h2),
.panel-final-stage :deep(.stage-head__main h2) {
  font-size: 18px;
}

.panel-compose-stage :deep(.stage-head__aux),
.panel-final-stage :deep(.stage-head__aux) {
  gap: 12px;
}

.compose-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 14px;
  margin-top: 10px;
  align-items: start;
}

.compose-list-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.compose-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background: linear-gradient(180deg, rgba(12, 19, 34, 0.94), rgba(8, 13, 24, 0.98));
}

.compose-list-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.compose-list-copy strong {
  color: #eef3ff;
  font-size: 13px;
  line-height: 1.35;
}

.compose-shot-list {
  display: grid;
  gap: 8px;
}

.compose-shot-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid rgba(133, 149, 196, 0.1);
  background: linear-gradient(180deg, rgba(15, 24, 42, 0.96), rgba(9, 15, 28, 0.98));
  text-align: left;
}

.compose-shot-row.active {
  border-color: rgba(109, 93, 255, 0.42);
  box-shadow: inset 0 0 0 1px rgba(109, 93, 255, 0.18);
}

.compose-shot-thumb {
  width: 88px;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.compose-shot-thumb video,
.compose-shot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.compose-shot-thumb span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #8fa1c6;
  font-size: 11px;
}

.compose-shot-main {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.compose-shot-main__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.compose-shot-main__head strong {
  color: #eef3ff;
  font-size: 13px;
  line-height: 1.35;
}

.compose-shot-main p {
  margin: 0;
  color: #8fa1c6;
  font-size: 12px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.compose-shot-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #8fa1c6;
  font-size: 11px;
}

.compose-shot-actions {
  display: grid;
  gap: 8px;
  min-width: 112px;
}

.compose-shot-actions .primary-button,
.compose-shot-actions .ghost-button {
  width: 100%;
}

.advanced-panel {
  padding: 0;
  overflow: hidden;
}

.advanced-toggle {
  width: 100%;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  color: #eef3ff;
  cursor: pointer;
}

.advanced-copy {
  padding: 0 18px 18px;
  color: #93a2c1;
  font-size: 13px;
  line-height: 1.7;
}

.sticky-panel {
  position: sticky;
  top: 10px;
}

.console-sidebar {
  padding: 14px;
  background: linear-gradient(180deg, rgba(13, 20, 36, 0.98), rgba(9, 15, 27, 0.98));
}

.console-sidebar .panel-head {
  margin-bottom: 2px;
}

.feedback-stack--preview {
  display: grid;
}

.sidebar-section--preview {
  gap: 7px;
}

.video-stage-preview :deep(.console-sidebar__body) {
  gap: 8px;
}

.video-stage-preview :deep(.console-sidebar .panel-head) {
  padding-bottom: 4px;
}

.sidebar-preview-shell {
  position: relative;
  min-height: 0;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border-radius: 0;
  border: 1px solid rgba(133, 149, 196, 0.14);
  background:
    radial-gradient(circle at top, rgba(109, 93, 255, 0.16), transparent 34%),
    linear-gradient(180deg, rgba(8, 14, 27, 0.96), rgba(5, 10, 19, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.video-stage-preview :deep(.console-sidebar) {
  padding: 9px;
  border-radius: 0;
  border: 1px solid rgba(133, 149, 196, 0.1);
  background:
    linear-gradient(180deg, rgba(16, 24, 42, 0.98), rgba(10, 16, 29, 0.98)),
    rgba(255, 255, 255, 0.018);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.sidebar-preview-shell video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #060b16;
}

.sidebar-preview-shell__hud {
  position: absolute;
  inset: 10px 10px auto 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  pointer-events: none;
}

.sidebar-preview-shell__hud span {
  padding: 4px 8px;
  border-radius: 0;
  color: #eef3ff;
  font-size: 9px;
  background: rgba(6, 11, 22, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
}

.sidebar-section {
  display: grid;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar-section:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.sidebar-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sidebar-section__head strong {
  color: #eef3ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.sidebar-section__head small {
  color: #7e90bb;
  font-size: 9px;
}

.compact-meta-grid {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 10px;
  align-items: center;
}

.compact-meta-grid span {
  margin: 0;
}

.compact-meta-grid strong {
  margin: 0;
  text-align: right;
  word-break: break-word;
}

.sidebar-script-card,
.sidebar-frame-card {
  gap: 5px;
}

.sidebar-script-card strong {
  line-height: 1.55;
}

.sidebar-frame-thumb {
  width: 100%;
  aspect-ratio: 16 / 7;
  overflow: hidden;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.sidebar-frame-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sidebar-frame-thumb--empty {
  display: grid;
  place-items: center;
  color: #95a3c3;
  font-size: 12px;
}

.console-sidebar--history {
  padding-top: 12px;
}

.history-item {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  padding: 11px;
  text-align: left;
  cursor: pointer;
}

.history-thumb {
  width: 68px;
  height: 88px;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.history-fallback,
.empty-state {
  display: grid;
  place-items: center;
  color: #95a3c3;
  text-align: center;
}

.history-copy {
  display: grid;
  gap: 4px;
}

.model-card {
  padding: 11px;
  text-align: left;
  cursor: pointer;
}

.model-card-copy {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.empty-state {
  min-height: 100%;
  padding: 20px;
  font-size: 13px;
  line-height: 1.7;
}

.small-empty {
  min-height: 116px;
}

.section-empty {
  min-height: 150px;
  border-radius: 18px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.025);
}

.ghost-button,
.primary-button,
.count-input {
  min-height: 42px;
  padding: 0 14px;
  color: #eef3ff;
}

.count-input {
  width: 84px;
  text-align: center;
  background: rgba(255, 255, 255, 0.03);
}

.ghost-button,
.primary-button,
.history-item,
.variant-card,
.model-card,
.add-thumb {
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.ghost-button:hover,
.primary-button:hover,
.history-item:hover,
.variant-card:hover,
.model-card:hover,
.add-thumb:hover {
  transform: translateY(-1px);
}

.primary-button {
  cursor: pointer;
  background: linear-gradient(135deg, #eef3ff, #c8d6ff);
  color: #111827;
  font-weight: 800;
}

.ghost-button {
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
}

.small {
  min-height: 38px;
  font-size: 12px;
}

.full-width {
  width: 100%;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(3, 7, 16, 0.74);
  padding: 24px;
}

.modal-panel {
  width: min(1120px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, #111a2c, #0b1323);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
}

@media (max-width: 1460px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .sticky-panel {
    position: static;
  }
}

@media (max-width: 1220px) {
  .reference-layout,
  .storyboard-layout,
  .final-layout,
  .asset-grid,
  .variant-grid,
  .frame-grid,
  .review-grid,
  .model-grid {
    grid-template-columns: 1fr 1fr;
  }

  .shot-overview-panel {
    grid-template-columns: 1fr 1fr 1fr;
    align-items: stretch;
  }

  .shot-overview-progress,
  .shot-overview-actions {
    grid-column: 1 / -1;
  }

  .shot-reference-layout {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .video-stage-layout {
    grid-template-columns: 1fr;
  }

  .video-stage-preview :deep(.console-sidebar) {
    position: static;
  }

  .shot-reference-header,
  .shot-reference-row {
    grid-template-columns: 58px 88px minmax(0, 1.1fr) 54px 60px 100px 112px;
  }

  .stage-strip {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

@media (max-width: 860px) {
  .clone-page {
    padding: 12px;
  }

  .hero-shell {
    padding: 12px;
  }

  .hero-main,
  .panel-head,
  .selected-model,
  .workspace-grid,
  .reference-layout,
  .storyboard-layout,
  .final-layout,
  .asset-grid,
  .meta-grid,
  .beats-grid,
  .variant-grid,
  .frame-grid,
  .review-grid,
  .model-grid,
  .product-grid {
    grid-template-columns: 1fr;
  }

  .panel-head,
  .advanced-toggle {
    flex-direction: column;
    align-items: stretch;
  }

  .panel-actions {
    justify-content: flex-start;
  }

  .review-head {
    flex-direction: column;
    align-items: stretch;
  }

  .shot-overview-panel,
  .shot-reference-layout,
  .shot-reference-row {
    grid-template-columns: 1fr;
  }

  .panel-video-stage {
    padding: 10px;
  }

  .panel-video-stage :deep(.clone-stage-header) {
    padding: 2px 2px 10px;
  }

  .panel-video-stage :deep(.stage-head) {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .panel-video-stage :deep(.stage-head__actions) {
    justify-content: flex-start;
    padding-left: 0;
    border-left: 0;
  }

  .panel-video-stage :deep(.stage-head__actions .primary-button) {
    min-width: 0;
    width: 100%;
  }

  .panel-video-stage :deep(.stage-head__aux) {
    gap: 10px 14px;
    padding-top: 8px;
  }

  .video-stage-layout {
    gap: 12px;
  }

  .shot-table-toolbar,
  .shot-table-head,
  .shot-overview-panel {
    padding-left: 12px;
    padding-right: 12px;
  }

  .shot-overview-actions {
    justify-content: flex-start;
  }

  .shot-reference-header {
    display: none;
  }

  .shot-table-body--reference {
    padding: 8px;
    gap: 8px;
  }

  .shot-reference-row {
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 14px;
  }

  .shot-reference-cell--actions {
    justify-content: flex-start;
  }

  .shot-thumb--large {
    width: 100%;
    max-width: 180px;
  }

  .tall-video,
  .final-video {
    min-height: 320px;
  }
}
</style>
