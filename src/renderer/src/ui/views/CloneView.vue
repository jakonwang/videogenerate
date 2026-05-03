<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

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
  shotId: string
  source: 'generated' | 'uploaded_replacement'
  videoPath?: string
  provider?: string
  model?: string
  durationSec?: number
  status: string
  error?: string
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

const historySorted = computed(() => [...histories.value].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)))
const currentModel = computed(() => models.value.find((item) => item.id === selectedModelId.value) || null)
const modelSnapshot = computed(() => currentModel.value || current.value?.selectedModelIdentitySnapshot || null)
const storyBeats = computed(() => current.value?.blueprint?.storyBeats ?? [])
const scriptVariants = computed(() => current.value?.scriptVariantCandidates ?? [])
const storyboardBatches = computed(() => current.value?.storyboardGridBatches ?? [])
const storyboardFrames = computed(() => current.value?.storyboardFrames ?? [])
const shotVideoOutputs = computed(() => current.value?.shotVideoOutputs ?? [])
const finalOutputPath = computed(() => current.value?.finalCompose?.outputPath || current.value?.previewPipeline?.previewOutputPath || '')
const pipelineErrorContext = computed(() => current.value?.pipelineStatus?.errorContext || null)
const workflowStep = computed(() => current.value?.workflowV2?.currentStep || 'upload_analyze_script')
const selectedVariantId = computed(() => current.value?.selectedScriptVariantId || scriptVariants.value.find((item) => item.selected)?.id || '')
const referenceSourcePath = computed(() => current.value?.referenceVideoPath || referenceVideoPath.value)
const visibleProductThumbs = computed(() => productRefs.value.slice(0, 9))
const visibleHistory = computed(() => historySorted.value.slice(0, 8))
const isDraftingNewProject = computed(() => Boolean(referenceVideoPath.value.trim()) && !current.value?.id)
const failedShotOutputs = computed(() => shotVideoOutputs.value.filter((item) => item.status === 'failed' || Boolean(item.error)))
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
const canRetryShotVideos = computed(() => Boolean(current.value?.id && storyboardFrames.value.length))

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
const finalButtonLabel = computed(() => {
  if (loading.value && workflowStep.value === 'compose_final_video') return '正在合成'
  return shotVideoOutputs.value.length ? '重新合成成片' : '合成最终成片'
})

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
  setStageLog('已切换到新建模式，请上传新的参考视频。')
}

function shotLabel(shotId: string) {
  const beat = storyBeats.value.find((item) => item.id === shotId)
  if (beat) return beat.purpose
  const frame = storyboardFrames.value.find((item) => item.shotId === shotId)
  return `分镜 ${Number(frame?.frameIndex ?? 0) + 1}`
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
  const next = (await window.api.clone.getProject({ cloneProjectId: current.value.id })) as CloneProject
  applyProject(next)
}

async function refreshProjectAfterFailure() {
  try {
    await refreshCurrentProject()
  } catch (error) {
    pushRuntimeLog(`刷新失败状态失败：${safeText((error as Error)?.message ?? error, '未知错误')}`, 'error')
  }
}

async function loadProject(projectId: string, options: { updateStageLog?: boolean } = {}) {
  const next = (await window.api.clone.getProject({ cloneProjectId: projectId })) as CloneProject
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
  if (!referenceVideoPath.value.trim()) {
    markError('请先上传参考视频。', '请先上传参考视频。')
    return
  }
  loading.value = true
  errorText.value = ''
  setStageLog('正在分析参考视频脚本与分镜结构。')
  try {
    const res = (await window.api.clone.createBlueprint({
      videoPath: referenceVideoPath.value.trim(),
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
    })) as { project?: CloneProject; queueSummary?: { total: number; done: number; failed: number; skipped: number } }
    applyProject(res.project || current.value)
    const summary = res.queueSummary
    if (summary?.failed) {
      setStageLog(`分镜视频已按顺序执行完成：成功 ${summary.done} 条，失败 ${summary.failed} 条。失败分镜已跳过，可点击重新生成分镜视频或单镜重试。`, 'error')
    } else {
      setStageLog('分镜视频已按脚本顺序全部生成完成，可在合成前检查区替换个别分镜。', 'success')
    }
  } catch (error: any) {
    markError(error?.message ?? error, '分镜视频生成失败。')
    await refreshProjectAfterFailure()
    setStageLog('分镜视频生成失败，请根据右侧提示修正后点击重新生成。', 'error')
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
  setStageLog(`正在重新生成 ${shotLabel(shotId)}。`)
  try {
    const res = (await window.api.clone.generateShotClip({
      cloneProjectId: current.value.id,
      shotId,
    })) as { project?: CloneProject }
    applyProject(res.project || current.value)
    setStageLog(`${shotLabel(shotId)} 重新生成完成。`, 'success')
  } catch (error: any) {
    markError(error?.message ?? error, `${shotLabel(shotId)} 重新生成失败。`)
    await refreshProjectAfterFailure()
    setStageLog(`${shotLabel(shotId)} 重新生成失败，请检查右侧错误上下文。`, 'error')
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
      <div class="hero-main">
        <div class="hero-copy">
          <span class="eyebrow">Clone Production Line</span>
          <h1>TikTok 爆款复刻</h1>
          <p>脚本变体、分镜拼图、分镜视频、替换合成，围绕一条参考视频快速完成复刻成片。</p>
        </div>
        <div class="hero-status">
          <button class="ghost-button hero-lite-action" type="button" @click="startNewDraft">新建复刻</button>
          <span class="status-pill" :class="statusTone">{{ humanStatus(current?.finalCompose?.status || current?.previewPipeline?.status || 'idle') }}</span>
          <button class="primary-button hero-action" type="button" :disabled="loading || !current?.id" @click="composeFinalVideo">
            {{ finalButtonLabel }}
          </button>
        </div>
      </div>

      <div class="stage-strip">
        <div v-for="item in stageItems" :key="item.key" class="stage-card" :class="{ done: item.done, active: item.active }">
          <div class="stage-index">{{ item.done ? '✓' : '•' }}</div>
          <div class="stage-body">
            <strong>{{ item.title }}</strong>
            <span>{{ item.desc }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="workspace-grid">
      <div class="main-column">
        <article class="panel panel-reference">
          <div class="panel-head">
            <div>
              <span class="panel-tag">参考视频</span>
              <h2>{{ safeText(isDraftingNewProject ? shortPath(referenceVideoPath) : current?.referenceVideoName, safeText(shortPath(referenceVideoPath), '上传一条参考视频开始复刻')) }}</h2>
            </div>
            <div class="panel-actions">
              <button class="ghost-button small" type="button" @click="pickReferenceVideo">上传视频</button>
              <button class="primary-button small" type="button" :disabled="loading" @click="createBlueprint">分析脚本</button>
            </div>
          </div>

          <div class="reference-layout">
            <div class="video-shell tall-video">
              <video v-if="referenceSourcePath" :src="mediaUrl(referenceSourcePath)" controls preload="metadata"></video>
              <div v-else class="empty-state">上传一条竖版或横版参考视频后，系统会先分析整条脚本结构。</div>
            </div>

            <div class="reference-side">
              <div class="meta-grid">
                <div class="meta-card">
                  <span>标题</span>
                  <strong>{{ safeText(current?.blueprint?.title, '--') }}</strong>
                </div>
                <div class="meta-card">
                  <span>市场</span>
                  <strong>{{ safeText(current?.blueprint?.market, '--') }}</strong>
                </div>
                <div class="meta-card">
                  <span>语言</span>
                  <strong>{{ safeText(current?.blueprint?.localization?.language, '--') }}</strong>
                </div>
                <div class="meta-card">
                  <span>节奏</span>
                  <strong>{{ safeText(current?.blueprint?.renderHints?.pacing, '--') }}</strong>
                </div>
              </div>

              <div class="beats-grid">
                <div v-for="item in storyBeats.slice(0, 6)" :key="item.id" class="beat-card">
                  <strong>{{ safeText(item.purpose, 'beat') }}</strong>
                  <span>{{ safeText(item.shotType || item.productRole, 'story beat') }}</span>
                </div>
                <div v-if="!storyBeats.length" class="empty-state small-empty">完成脚本分析后，这里会展示参考视频的核心结构。</div>
              </div>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <span class="panel-tag">脚本变体</span>
              <h2>生成多个相似脚本并评分，单选 1 条继续</h2>
            </div>
            <div class="panel-actions">
              <input v-model.number="variantCount" class="count-input" type="number" min="1" max="6" />
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="generateScriptVariants">生成脚本</button>
            </div>
          </div>

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
            <div v-if="!scriptVariants.length" class="empty-state section-empty">分析完成后点击“生成脚本”，系统会给出多条候选脚本并评分。</div>
          </div>
        </article>

        <div class="asset-grid">
          <article class="panel">
            <div class="panel-head">
              <div>
                <span class="panel-tag">模特</span>
                <h2>弹窗选择可复用模特</h2>
              </div>
              <div class="panel-actions">
                <button class="ghost-button small" type="button" :disabled="modelLoading" @click="refreshModels">刷新</button>
                <button class="primary-button small" type="button" @click="modelModalOpen = true">选择模特</button>
              </div>
            </div>

            <div class="selected-model">
              <div class="model-cover">
                <img v-if="modelPreview(modelSnapshot)" :src="modelPreview(modelSnapshot)" alt="model-preview" />
                <div v-else class="empty-state small-empty">未选择模特</div>
              </div>
              <div class="selected-model-copy">
                <strong>{{ safeText(modelSnapshot?.name, '等待选择模特') }}</strong>
                <span>{{ safeText(modelSnapshot?.model || modelSnapshot?.id, '当前项目还未绑定模特身份') }}</span>
              </div>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <div>
                <span class="panel-tag">商品图</span>
                <h2>上传商品参考图</h2>
              </div>
              <div class="panel-actions">
                <button class="primary-button small" type="button" @click="pickProductImages">上传图片</button>
              </div>
            </div>

            <div class="product-grid">
              <div v-for="item in visibleProductThumbs" :key="item" class="product-thumb">
                <img :src="previewImage(item)" alt="product-reference" />
              </div>
              <button v-if="visibleProductThumbs.length < 9" class="product-thumb add-thumb" type="button" @click="pickProductImages">+</button>
            </div>
            <div class="panel-tip">每行 3 个，最多显示 3 行。当前 {{ productRefs.length }} 张。</div>
          </article>
        </div>

        <article class="panel">
          <div class="panel-head">
            <div>
              <span class="panel-tag">分镜拼图</span>
              <h2>6/9 宫格拼图与自动裁切</h2>
            </div>
            <div class="panel-actions">
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="generateStoryboardGrids">生成拼图</button>
            </div>
          </div>

          <div class="storyboard-layout">
            <div class="storyboard-batch-list">
              <div v-for="batch in storyboardBatches" :key="batch.id" class="storyboard-batch-card">
                <div class="batch-cover">
                  <img v-if="batch.imagePath" :src="previewImage(batch.imagePath)" alt="storyboard-grid" />
                  <div v-else class="empty-state small-empty">等待拼图</div>
                </div>
                <div class="batch-meta">
                  <strong>{{ batch.gridType }} / {{ batch.frameCount }} 格</strong>
                  <span>{{ humanStatus(batch.status) }}</span>
                </div>
              </div>
              <div v-if="!storyboardBatches.length" class="empty-state section-empty">选择脚本、模特和商品图后，即可生成分镜拼图。</div>
            </div>

            <div class="frame-grid">
              <div v-for="frame in storyboardFrames" :key="frame.id" class="frame-card">
                <img v-if="frame.imagePath" :src="previewImage(frame.imagePath)" alt="frame" />
                <div v-else class="empty-state small-empty">待裁切</div>
                <strong>{{ safeText(shotLabel(frame.shotId), '分镜') }}</strong>
                <span>{{ humanStatus(frame.status) }}</span>
              </div>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <span class="panel-tag">分镜视频</span>
              <h2>根据分镜图和脚本生成视频片段</h2>
            </div>
            <div class="panel-actions">
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="generateShotVideos">继续生成剩余分镜视频</button>
            </div>
          </div>

          <div class="shot-video-grid">
            <div v-for="item in shotVideoOutputs" :key="item.shotId" class="shot-card">
              <div class="shot-card-top">
                <strong>{{ safeText(shotLabel(item.shotId), '分镜') }}</strong>
                <span class="mini-pill" :class="{ replaced: item.source === 'uploaded_replacement' }">
                  {{ item.source === 'uploaded_replacement' ? '已替换' : humanStatus(item.status) }}
                </span>
              </div>
              <div class="video-shell shot-shell">
                <video v-if="item.videoPath" :src="mediaUrl(item.videoPath)" controls preload="metadata"></video>
                <div v-else class="empty-state small-empty">待生成</div>
              </div>
              <div class="shot-meta">
                <span>{{ safeText(item.provider, '--') }} / {{ safeText(item.model, '--') }}</span>
                <span>{{ formatDuration(item.durationSec) }}</span>
              </div>
              <div v-if="item.error" class="shot-error">{{ safeText(item.error, '生成失败') }}</div>
              <button
                v-if="item.status === 'failed' || item.error"
                class="primary-button small full-width"
                type="button"
                :disabled="loading"
                @click="regenerateShotClip(item.shotId)"
              >
                重新生成该分镜
              </button>
            </div>
            <div v-if="!shotVideoOutputs.length" class="empty-state section-empty">拼图裁切完成后，这里会按分镜顺序展示视频生成结果。</div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <span class="panel-tag">合成前检查</span>
              <h2>支持替换个别分镜视频后重新合成</h2>
            </div>
            <div class="panel-actions">
              <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="composeFinalVideo">{{ finalButtonLabel }}</button>
            </div>
          </div>

          <div class="review-grid">
            <div v-for="item in shotVideoOutputs" :key="`${item.shotId}-review`" class="review-card">
              <div class="review-head">
                <strong>{{ safeText(shotLabel(item.shotId), '分镜') }}</strong>
                <span class="mini-pill" :class="{ replaced: item.source === 'uploaded_replacement' }">
                  {{ item.source === 'uploaded_replacement' ? '替换片段' : '生成片段' }}
                </span>
              </div>
              <div class="video-shell review-shell">
                <video v-if="item.videoPath" :src="mediaUrl(item.videoPath)" controls preload="metadata"></video>
                <div v-else class="empty-state small-empty">无可用视频</div>
              </div>
              <div v-if="item.error" class="shot-error">{{ safeText(item.error, '生成失败') }}</div>
              <button
                v-if="item.status === 'failed' || item.error"
                class="primary-button small full-width"
                type="button"
                :disabled="loading"
                @click="regenerateShotClip(item.shotId)"
              >
                重新生成该分镜
              </button>
              <button class="ghost-button small full-width" type="button" :disabled="loading" @click="replaceShotVideo(item.shotId)">上传替换视频</button>
            </div>
            <div v-if="!shotVideoOutputs.length" class="empty-state section-empty">分镜视频生成完成后，这里可以逐个替换镜头再重新合成。</div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <span class="panel-tag">最终成片</span>
              <h2>最终输出</h2>
            </div>
          </div>

          <div class="final-layout">
            <div class="video-shell final-video">
              <video v-if="finalOutputPath" :src="mediaUrl(finalOutputPath)" controls preload="metadata"></video>
              <div v-else class="empty-state">完成前面步骤后，这里会显示最终合成成片。</div>
            </div>

            <div class="final-side">
              <div class="meta-card large-card">
                <span>当前阶段</span>
                <strong>{{ safeText(currentStageTitle, '等待继续') }}</strong>
                <em>{{ safeText(stageLog, '--') }}</em>
              </div>
              <div class="meta-card">
                <span>工作流</span>
                <strong>{{ safeText(humanWorkflowStep(workflowStep), '--') }}</strong>
              </div>
              <div class="meta-card">
                <span>输出文件</span>
                <strong>{{ safeText(shortPath(finalOutputPath), '--') }}</strong>
              </div>
              <div v-if="errorText" class="meta-card danger-card">
                <span>错误信息</span>
                <strong>{{ safeText(errorText, '未知错误') }}</strong>
              </div>
              <div v-if="pipelineErrorContext" class="meta-card context-card">
                <span>调用上下文</span>
                <strong>{{ safeText(pipelineErrorContext.provider, '--') }} / {{ safeText(pipelineErrorContext.model, '--') }}</strong>
                <em>接口格式：{{ safeText(pipelineErrorContext.endpointStyle, '--') }}</em>
                <em>请求能力：{{ safeText(pipelineErrorContext.requestCapability, '--') }}</em>
                <em>任务 ID：{{ safeText(pipelineErrorContext.taskId, '--') }}</em>
                <em>Base URL：{{ safeText(pipelineErrorContext.baseUrl, '--') }}</em>
                <em v-if="pipelineErrorContext.responseSnippet">响应片段：{{ safeText(pipelineErrorContext.responseSnippet, '--') }}</em>
              </div>
            </div>
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

      <aside class="side-column">
        <article class="panel sticky-panel">
          <div class="panel-head">
            <div>
              <span class="panel-tag">运行反馈</span>
              <h2>当前信息</h2>
            </div>
          </div>

          <div class="feedback-stack">
            <div class="meta-card">
              <span>下一步</span>
              <strong>{{ safeText(nextStageTitle, '可继续复用历史项目') }}</strong>
            </div>
            <div class="meta-card">
              <span>模特</span>
              <strong>{{ safeText(modelSnapshot?.name, '待选择') }}</strong>
            </div>
            <div class="meta-card">
              <span>商品图</span>
              <strong>{{ productRefs.length ? `${productRefs.length} 张` : '待上传' }}</strong>
            </div>
            <div class="meta-card">
              <span>参考视频</span>
              <strong>{{ safeText(shortPath(referenceSourcePath), '--') }}</strong>
            </div>
            <div v-if="hasGenerationFailure" class="meta-card danger-card failure-card">
              <span>生成失败</span>
              <strong>{{ safeText(generationFailureText, '任务失败') }}</strong>
              <em>请检查右侧调用上下文后重新生成。</em>
              <button class="primary-button small full-width failure-action" type="button" :disabled="loading || !canRetryShotVideos" @click="generateShotVideos">
                重新生成分镜视频
              </button>
            </div>
            <div class="runtime-log-panel">
              <div class="runtime-log-head">
                <span>实时日志</span>
                <small>{{ runtimeLogs.length }} 条</small>
              </div>
              <div ref="logListRef" class="runtime-log-list">
                <div v-for="item in runtimeLogs" :key="item.id" class="runtime-log-item" :class="item.level">
                  <strong>{{ new Date(item.time).toLocaleTimeString('zh-CN', { hour12: false }) }}</strong>
                  <span>{{ item.message }}</span>
                </div>
                <div v-if="!runtimeLogs.length" class="empty-state small-empty log-empty">暂无实时日志</div>
              </div>
            </div>
          </div>
        </article>

        <article class="panel sticky-panel">
          <div class="panel-head">
            <div>
              <span class="panel-tag">历史记录</span>
              <h2>最近生成</h2>
            </div>
            <div class="panel-actions">
              <button class="ghost-button small" type="button" @click="refreshHistory">{{ historyLoading ? '刷新中' : '刷新' }}</button>
            </div>
          </div>

          <div class="history-list">
            <button v-for="item in visibleHistory" :key="item.id" class="history-item" type="button" @click="loadProject(item.id)">
              <div class="history-thumb">
                <video v-if="item.previewOutputPath" :src="mediaUrl(item.previewOutputPath)" muted preload="metadata"></video>
                <div v-else class="history-fallback">{{ item.title.slice(0, 1) }}</div>
              </div>
              <div class="history-copy">
                <strong>{{ safeText(item.title, '未命名项目') }}</strong>
                <span>{{ formatTime(item.updatedAt) }}</span>
                <small>{{ humanStatus(item.status) }} · {{ safeText(shortPath(item.referenceVideoPath), '--') }}</small>
              </div>
            </button>
            <div v-if="!visibleHistory.length" class="empty-state small-empty">暂无历史记录</div>
          </div>
        </article>
      </aside>
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
          <button v-for="item in models" :key="item.id" class="model-card" type="button" @click="selectModel(item)">
            <div class="model-card-cover">
              <img v-if="modelPreview(item)" :src="modelPreview(item)" alt="model-preview" />
              <div v-else class="empty-state small-empty">无图</div>
            </div>
            <div class="model-card-copy">
              <strong>{{ safeText(item.name, '未命名模特') }}</strong>
              <span>{{ safeText(item.sceneStyle || item.model, 'AI 模特') }}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clone-page {
  min-height: 100%;
  padding: 16px 18px 28px;
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
.shot-video-grid,
.review-grid,
.final-layout,
.feedback-stack,
.history-list,
.model-grid,
.stage-strip {
  display: grid;
}

.hero-shell {
  gap: 12px;
}

.hero-main,
.panel-head,
.panel-actions,
.selected-model,
.shot-card-top,
.review-head,
.advanced-toggle {
  display: flex;
}

.hero-main {
  justify-content: space-between;
  align-items: stretch;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid rgba(124, 141, 210, 0.12);
  background: linear-gradient(135deg, rgba(35, 45, 89, 0.96), rgba(15, 22, 37, 0.98));
  box-shadow: 0 20px 54px rgba(0, 0, 0, 0.24);
}

.hero-copy {
  display: grid;
  gap: 8px;
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

.hero-copy h1,
.panel h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.15;
  font-weight: 800;
}

.hero-copy p {
  margin: 0;
  max-width: 760px;
  color: #95a3c3;
  font-size: 13px;
  line-height: 1.65;
}

.hero-status {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
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

.hero-action {
  min-width: 148px;
}

.hero-lite-action {
  min-width: 110px;
}

.stage-strip {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
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
.shot-card,
.review-card,
.advanced-toggle {
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: rgba(12, 19, 34, 0.94);
  border-radius: 18px;
}

.stage-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
}

.stage-card.done {
  border-color: rgba(88, 214, 154, 0.22);
}

.stage-card.active {
  background: rgba(17, 28, 49, 0.98);
  box-shadow: 0 0 0 1px rgba(133, 153, 255, 0.22) inset;
}

.stage-index {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.05);
  color: #89f1ca;
  font-weight: 800;
}

.stage-body {
  display: grid;
  gap: 6px;
}

.stage-body strong,
.meta-card strong,
.variant-copy strong,
.batch-meta strong,
.selected-model-copy strong,
.shot-card strong,
.review-head strong,
.history-copy strong {
  display: block;
  font-size: 14px;
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
  font-size: 12px;
  line-height: 1.55;
}

.meta-card em {
  display: block;
  font-style: normal;
  margin-top: 6px;
}

.workspace-grid {
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 14px;
  align-items: start;
  margin-top: 14px;
}

.main-column,
.side-column {
  display: grid;
  gap: 14px;
}

.panel {
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

.panel-actions {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
  padding: 11px 13px;
  background: rgba(255, 255, 255, 0.035);
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
  min-height: 92px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.beat-card strong {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
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
  padding: 13px;
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
  gap: 14px;
  align-items: center;
  margin-top: 14px;
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
  gap: 8px;
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
  border-radius: 18px;
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
  padding: 11px;
}

.batch-meta {
  display: grid;
  gap: 4px;
  margin-top: 10px;
}

.frame-grid,
.shot-video-grid,
.review-grid,
.model-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.frame-card img {
  aspect-ratio: 9 / 16;
  border-radius: 14px;
  margin-bottom: 8px;
}

.frame-card strong {
  display: block;
  margin-bottom: 2px;
  font-size: 13px;
}

.shot-card,
.review-card {
  display: grid;
  gap: 10px;
}

.shot-card-top,
.review-head {
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.shot-shell {
  aspect-ratio: 9 / 16;
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

.shot-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
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

.final-layout {
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 12px;
  margin-top: 12px;
}

.final-video {
  min-height: 420px;
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

.history-item {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  padding: 11px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
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

.panel-tip {
  margin-top: 10px;
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

  .side-column {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
  .shot-video-grid,
  .review-grid,
  .model-grid {
    grid-template-columns: 1fr 1fr;
  }

  .stage-strip {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .clone-page {
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
  .side-column,
  .meta-grid,
  .beats-grid,
  .variant-grid,
  .frame-grid,
  .shot-video-grid,
  .review-grid,
  .model-grid,
  .product-grid {
    grid-template-columns: 1fr;
  }

  .hero-main,
  .panel-head,
  .advanced-toggle {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-status,
  .panel-actions {
    justify-content: flex-start;
  }

  .tall-video,
  .final-video {
    min-height: 320px;
  }
}
</style>
