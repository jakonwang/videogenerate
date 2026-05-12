<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import CloneConsoleSidebar from '../components/clone/CloneConsoleSidebar.vue'
import CloneDataCard from '../components/clone/CloneDataCard.vue'
import CloneMediaCard from '../components/clone/CloneMediaCard.vue'
import CloneStageHeader from '../components/clone/CloneStageHeader.vue'
import CloneStateCard from '../components/clone/CloneStateCard.vue'
import { useCloneProjectWorkspace } from '@/composables/useCloneProjectWorkspace'
import { useCloneRouteProject } from '@/composables/useCloneRouteProject'
import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const { routeProjectId, resolveActiveProjectId } = useCloneRouteProject()

type StoryBeat = {
  id: string
  purpose: string
  shotType: string
  productRole: string
  index?: number
  startSec?: number
  endSec?: number
  voiceover?: string
  onScreenText?: string
  visualDescription?: string
  scriptSegment?: string
}

type ScriptVariantCandidate = {
  id: string
  title: string
  summary: string
  fullScript: string
  shotScripts?: Array<{
    shotId: string
    shotIndex: number
    timeRange?: string
    scriptText: string
    scriptRole?: string
    visualDescription?: string
    actionDescription?: string
    cameraDescription?: string
    generationPrompt?: string
  }>
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
  batchId?: string
  frameIndex?: number
  imagePath?: string
  status: string
  error?: string
  updatedAt?: number
}

type BlueprintShot = {
  id: string
  index?: number
  startSec?: number
  endSec?: number
  durationSec?: number
  scriptRole?: string
  scriptText?: string
  generationPrompt?: string
  visualDescription?: string
  actionDescription?: string
  cameraDescription?: string
  shotType?: string
  purpose?: string
  status?: string
  error?: string
  gptFrameStatus?: string
  gptFrameError?: string
  gptFirstFramePath?: string
  gptLastFramePath?: string
  generatedFirstFramePath?: string
  generatedLastFramePath?: string
  locked?: boolean
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
    visualStyle?: string
    hookType?: string
    rhythm?: string
    globalScript?: {
      content?: string
      cameraMotion?: string
      shotScale?: string
      lighting?: string
      colorTone?: string
      subjectAction?: string
      environment?: string
      reversePrompt?: string
    }
    shots?: BlueprintShot[]
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
    activeProviderSummary?: {
      image?: {
        provider?: string
        model?: string
      }
    }
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

type ComposeAspectRatio = '9:16' | '1:1' | '16:9'
type ComposeQuality = 'hd' | 'standard' | 'ultra'
type ComposeStyle = 'default' | 'sharp' | 'cinematic'

const current = ref<CloneProject | null>(null)
const models = ref<ModelItem[]>([])
const loading = ref(false)
const modelLoading = ref(false)
const referenceVideoPath = ref('')
const productRefs = ref<string[]>([])
const productRefsDraft = ref<string[] | null>(null)
const selectedModelId = ref('')
const errorText = ref('')
const stageLog = ref('等待上传参考视频并开始分析')
const runtimeLogs = ref<RuntimeLogItem[]>([])
const logListRef = ref<HTMLElement | null>(null)
const consoleCollapsed = ref(false)
const storyboardBatchSummary = ref<{ total: number; done: number; failed: number; skipped: number } | null>(null)
const modelModalOpen = ref(false)
const framePreviewOpen = ref(false)
const framePreviewPath = ref('')
const framePreviewTitle = ref('')
const composeOutputDir = ref('')
const composeLocalError = ref('')
const variantCount = ref(3)
const selectedStageKey = ref<StageItem['key'] | ''>('')
const selectedShotId = ref('')
const selectedShotFilter = ref<'all' | 'ready' | 'failed' | 'pending'>('all')
const composeAspectRatio = ref<ComposeAspectRatio>('9:16')
const composeQuality = ref<ComposeQuality>('hd')
const composeStyle = ref<ComposeStyle>('default')

const currentModel = computed(() => models.value.find((item) => item.id === selectedModelId.value) || null)
const modelSnapshot = computed(() => currentModel.value || current.value?.selectedModelIdentitySnapshot || null)
const storyBeats = computed(() => current.value?.blueprint?.storyBeats ?? [])
const scriptVariants = computed(() => current.value?.scriptVariantCandidates ?? [])
const storyboardBatches = computed(() => current.value?.storyboardGridBatches ?? [])
const blueprintShots = computed<BlueprintShot[]>(() => current.value?.blueprint?.shots ?? [])
const storyboardFrames = computed<StoryboardFrame[]>(() => {
  const rawFrames = current.value?.storyboardFrames ?? []
  const rawMap = new Map(rawFrames.map((item) => [item.shotId, item]))
  const shots = [...blueprintShots.value].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  if (!shots.length) return rawFrames
  return shots.map((shot, index) => {
    const raw = rawMap.get(shot.id)
    const imagePath =
      safeText(shot.gptFirstFramePath, '') ||
      safeText(shot.generatedFirstFramePath, '') ||
      safeText(raw?.imagePath, '') ||
      undefined
    const error = imagePath
      ? undefined
      : safeText(shot.gptFrameError, '') ||
        safeText(shot.error, '') ||
        safeText(raw?.error, '') ||
        undefined
    const status = imagePath
      ? 'cropped'
      : safeText(shot.gptFrameStatus, '') || safeText(shot.status, '') || safeText(raw?.status, 'failed')
    return {
      id: raw?.id || `${shot.id}-${index}`,
      shotId: shot.id,
      batchId: raw?.batchId,
      frameIndex: typeof raw?.frameIndex === 'number' ? raw.frameIndex : index,
      imagePath,
      status,
      error,
      updatedAt: raw?.updatedAt,
    }
  })
})
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
const storyBeatMap = computed<Record<string, StoryBeat>>(() =>
  Object.fromEntries(storyBeats.value.map((item) => [item.id, item])),
)
const shotFrameMap = computed<Record<string, StoryboardFrame>>(() =>
  Object.fromEntries(storyboardFrames.value.map((item) => [item.shotId, item])),
)
const finalOutputPath = computed(() => current.value?.finalCompose?.outputPath || '')
const finalOutputDirText = computed(() => safeText(shortPath(composeOutputDir.value || current.value?.outputDir || ''), '默认项目输出目录'))
const localComposeErrorText = computed(() => safeText(current.value?.finalCompose?.error || composeLocalError.value, ''))
const pipelineErrorContext = computed(() => current.value?.pipelineStatus?.errorContext || null)
const activeImageProvider = computed(() => safeText(current.value?.pipelineStatus?.activeProviderSummary?.image?.provider, '--'))
const activeImageModel = computed(() => safeText(current.value?.pipelineStatus?.activeProviderSummary?.image?.model, '--'))
const workflowStep = computed(() => current.value?.workflowV2?.currentStep || 'upload_analyze_script')
const selectedVariantId = computed(() => current.value?.selectedScriptVariantId || scriptVariants.value.find((item) => item.selected)?.id || '')
const referenceSourcePath = computed(() => current.value?.referenceVideoPath || referenceVideoPath.value)
const effectiveProductRefs = computed(() => (productRefsDraft.value ? productRefsDraft.value : productRefs.value))
const visibleProductThumbs = computed(() => effectiveProductRefs.value.slice(0, 9))
const activeProjectId = computed(() => resolveActiveProjectId(current.value?.id))
const isDraftingNewProject = computed(() => Boolean(referenceVideoPath.value.trim()) && !current.value?.id)
const hasBoundModel = computed(() => Boolean(selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id))
const canGenerateStoryboardFrames = computed(
  () => Boolean(activeProjectId.value && selectedVariantId.value && effectiveProductRefs.value.length && hasBoundModel.value),
)
const storyboardFrameBlockReason = computed(() => {
  if (!activeProjectId.value) return '请先完成参考视频分析'
  if (!selectedVariantId.value) return '请先选择一条脚本候选'
  if (!effectiveProductRefs.value.length) return '请先上传并绑定商品图'
  if (!hasBoundModel.value) return '请先选择模特'
  return ''
})
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
const canRetryShotVideos = computed(() => Boolean(activeProjectId.value && retryableShotOutputs.value.length))
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
const composeTotalDuration = computed(() =>
  shotVideoOutputs.value.reduce((total, item) => total + Number(item.durationSec || 0), 0),
)
const composeAiScore = computed(() => {
  const total = Math.max(shotVideoOutputs.value.length, 1)
  const success = completedShotCount.value / total
  const failurePenalty = failedShotOutputs.value.length / total
  return Math.max(62, Math.min(98, Math.round(78 + success * 18 - failurePenalty * 12)))
})
const composeQualityLabel = computed(() => {
  if (composeAiScore.value >= 92) return '非常优秀'
  if (composeAiScore.value >= 84) return '质量良好'
  if (composeAiScore.value >= 76) return '可继续优化'
  return '建议调整'
})
const composeAspectClass = computed(() => {
  if (composeAspectRatio.value === '1:1') return 'is-square'
  if (composeAspectRatio.value === '16:9') return 'is-landscape'
  return 'is-portrait'
})
const composeEstimatedSize = computed(() => {
  const qualityFactorMap: Record<ComposeQuality, number> = {
    standard: 0.56,
    hd: 0.75,
    ultra: 1.08,
  }
  const aspectFactorMap: Record<ComposeAspectRatio, number> = {
    '9:16': 1,
    '1:1': 0.88,
    '16:9': 1.12,
  }
  const styleFactorMap: Record<ComposeStyle, number> = {
    default: 1,
    sharp: 1.04,
    cinematic: 1.12,
  }
  const size = composeTotalDuration.value * qualityFactorMap[composeQuality.value] * aspectFactorMap[composeAspectRatio.value] * styleFactorMap[composeStyle.value]
  return `${Math.max(8, Math.round(size))}MB`
})
const composePreviewPath = computed(() => finalOutputPath.value || selectedShotOutput.value?.videoPath || '')
const composeExportStatusLabel = computed(() => {
  if (finalOutputPath.value) return '已输出'
  if (loading.value) return '处理中'
  if (failedShotOutputs.value.length) return '待检查'
  return '待导出'
})
const composeExportSettingsSummary = computed(() => {
  const qualityLabelMap: Record<ComposeQuality, string> = {
    standard: '标准',
    hd: '高清',
    ultra: '超清',
  }
  const styleLabelMap: Record<ComposeStyle, string> = {
    default: '默认',
    sharp: '清晰',
    cinematic: '电影感',
  }
  return `${composeAspectRatio.value} · ${qualityLabelMap[composeQuality.value]} · ${styleLabelMap[composeStyle.value]}`
})
const composeExportTimeText = computed(() => {
  const totalSeconds = Math.max(20, Math.round(composeTotalDuration.value || 0))
  const qualityBaseMap: Record<ComposeQuality, number> = {
    standard: 0.9,
    hd: 1.2,
    ultra: 1.6,
  }
  const styleExtraMap: Record<ComposeStyle, number> = {
    default: 0,
    sharp: 0.2,
    cinematic: 0.45,
  }
  const minutes = Math.max(1, Math.round((totalSeconds / 30) * qualityBaseMap[composeQuality.value] + styleExtraMap[composeStyle.value]))
  return `约${minutes}分钟`
})
const analyzeStageProgress = computed(() => {
  if (loading.value && workflowStep.value === 'upload_analyze_script') return 72
  if (storyBeats.value.length) return 100
  if (current.value?.blueprint) return 82
  if (referenceSourcePath.value) return 28
  return 0
})
const analyzeSummaryCards = computed(() => [
  {
    key: 'structure',
    title: '脚本结构',
    desc: storyBeats.value.length ? `${storyBeats.value.length} 个主要片段，结构已识别` : '等待分析完成后生成结构拆解',
  },
  {
    key: 'style',
    title: '视觉风格',
    desc: safeText(current.value?.blueprint?.visualStyle || current.value?.blueprint?.renderHints?.resolution, '等待识别视觉风格'),
  },
  {
    key: 'hook',
    title: '爆款要素',
    desc: safeText(current.value?.blueprint?.hookType || current.value?.blueprint?.rhythm, '等待提炼爆款钩子与节奏'),
  },
])
const analyzeScriptPreview = computed(() => {
  const globalScript = String(current.value?.blueprint?.globalScript?.content || '').trim()
  if (globalScript) return globalScript
  const beatScript = storyBeats.value
    .map((item) => String(item.voiceover || item.onScreenText || item.purpose || '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('\n')
  return beatScript || '分析完成后，这里会显示节选脚本预览。'
})
const analyzeGlobalSections = computed(() => {
  const global = current.value?.blueprint?.globalScript
  if (!global) return []
  return [
    { key: 'cameraMotion', title: '镜头运动', desc: safeText(global.cameraMotion, '') },
    { key: 'shotScale', title: '景别变化', desc: safeText(global.shotScale, '') },
    { key: 'lighting', title: '光线分析', desc: safeText(global.lighting, '') },
    { key: 'colorTone', title: '色彩色调', desc: safeText(global.colorTone, '') },
    { key: 'subjectAction', title: '主体动作', desc: safeText(global.subjectAction, '') },
    { key: 'environment', title: '环境细节', desc: safeText(global.environment, '') },
  ].filter((item) => item.desc)
})
const analyzeReversePrompt = computed(() => safeText(current.value?.blueprint?.globalScript?.reversePrompt, ''))
const analyzeScriptLines = computed(() => {
  const globalScript = String(current.value?.blueprint?.globalScript?.content || '').trim()
  if (globalScript) {
    return globalScript
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  const blueprintShotLines = (current.value?.blueprint?.shots || [])
    .slice()
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((shot, index) => {
      const content = String(shot.scriptText || shot.generationPrompt || shot.visualDescription || '').trim()
      if (!content) return ''
      return `${String(index + 1).padStart(2, '0')}  ${content}`
    })
    .filter(Boolean)
  if (blueprintShotLines.length) return blueprintShotLines
  return storyBeats.value
    .map((item, index) => {
      const content = String(item.voiceover || item.onScreenText || item.scriptSegment || item.visualDescription || item.purpose || '').trim()
      if (!content) return ''
      return `${String(index + 1).padStart(2, '0')}  ${content}`
    })
    .filter(Boolean)
})
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
      title: '参考分析',
      desc: hasBlueprint ? '脚本结构与基础分镜已识别' : '上传参考视频并提炼可复刻结构',
      done: hasBlueprint,
      active: workflowStep.value === 'upload_analyze_script',
    },
    {
      key: 'variant',
      title: '脚本生成',
      desc: hasVariants
        ? hasSelectedVariant
          ? '已选定脚本，可进入分镜设计'
          : `已生成 ${scriptVariants.value.length} 条候选脚本`
        : '绑定模特和商品图后生成多条脚本候选',
      done: hasVariants && hasSelectedVariant,
      active: workflowStep.value === 'generate_script_variants' || workflowStep.value === 'select_script_variant',
    },
    {
      key: 'grid',
      title: '分镜设计',
      desc: hasFrames ? '分镜图片已生成，可继续进入视频阶段' : '根据已选脚本和素材生成逐镜头画面',
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
      title: '成片合成',
      desc: hasFinal ? '完整视频已输出并保存到历史记录' : '检查片段后合成并导出最终成片',
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
  return shotVideoOutputs.value.length ? '重新合成' : '开始合成'
})
const analyzePrimaryButtonLabel = computed(() => (referenceSourcePath.value ? '分析脚本' : '上传参考视频'))
const variantTopCandidate = computed(() => scriptVariants.value[0] || null)
const failedShotActionText = computed(() => (failedShotOutputs.value.length ? `重新生成失败项 ${failedShotOutputs.value.length}` : '重新生成失败项'))

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

watch(
  [selectedStageKey, workflowStageKey, visibleStageKey],
  ([selected, workflow, visible]) => {
    console.log('[clone-debug] stage-state', {
      selectedStageKey: selected || '',
      workflowStageKey: workflow,
      visibleStageKey: visible,
      workflowStep: workflowStep.value,
      currentId: current.value?.id || '',
      loading: loading.value,
    })
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
      return '参考分析'
    case 'generate_script_variants':
      return '生成脚本'
    case 'select_script_variant':
      return '确认脚本'
    case 'generate_storyboard_grids':
      return '分镜设计'
    case 'generate_shot_videos':
      return '分镜视频'
    case 'review_replace_shots':
      return '合成前检查'
    case 'compose_final_video':
      return '成片合成'
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
      return '已生成'
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

const applyRuntimePipelineStatus = (project: CloneProject, runtimeRes: { pipeline?: CloneProject['pipelineStatus'] }) => {
  const next = { ...project }
  if (runtimeRes?.pipeline) {
    next.pipelineStatus = runtimeRes.pipeline
  }
  return next
}

const {
  applyProject,
  refreshCurrentProject,
  ensureCurrentProjectReady,
  refreshProjectAfterFailure,
  loadProject,
  pickReferenceVideo: bindReferenceVideoToWorkspace,
  bindProductImages,
  bindModelIdentity,
  createBlueprint: createBlueprintInWorkspace,
  generateScriptVariants: generateScriptVariantsInWorkspace,
  selectScriptVariant: selectScriptVariantInWorkspace,
  syncProductImagesToProject: syncProductImagesToProjectInWorkspace,
  removeProductImage: removeProductImageInWorkspace,
  clearProductImages: clearProductImagesInWorkspace,
  generateStoryboardGrids: generateStoryboardGridsInWorkspace,
  regenerateStoryboardFrame: regenerateStoryboardFrameInWorkspace,
  generateShotVideos: generateShotVideosInWorkspace,
  syncFailedShotVideo: syncFailedShotVideoInWorkspace,
  replaceShotVideo: replaceShotVideoInWorkspace,
  regenerateShotClip: regenerateShotClipInWorkspace,
  refreshRemoteStatus: refreshRemoteStatusInWorkspace,
  composeFinalVideo: composeFinalVideoInWorkspace,
} = useCloneProjectWorkspace<CloneProject>({
  current,
  loading,
  referenceVideoPath,
  productRefs,
  productRefsDraft,
  selectedModelId,
  storyboardBatchSummary,
  variantCount,
  errorText,
  composeOutputDir,
  composeLocalError,
  modelModalOpen,
  markError,
  readFileAsBase64: (filePath) => window.api.readFileAsBase64({ path: filePath }) as Promise<string>,
  fileNameFromPath,
  mimeTypeFromPath,
  resolveActiveProjectId,
  applyPipelineStatus: applyRuntimePipelineStatus,
  getActiveImageProvider: () => activeImageProvider.value,
  getActiveImageModel: () => activeImageModel.value,
  shotLabel,
  getStoryboardFrameCount: () => storyboardFrames.value.length,
  getReadyVideoCount: () => shotVideoOutputs.value.filter((item) => Boolean(item.videoPath)).length,
  getShotVideoOutputCount: () => shotVideoOutputs.value.length,
  getFinalOutputPath: () => finalOutputPath.value,
  setStageLog,
  pushRuntimeLog,
})

function startNewDraft() {
  current.value = null
  referenceVideoPath.value = ''
  errorText.value = ''
  selectedStageKey.value = ''
  setStageLog('已切换到新建模式，请上传新的参考视频。')
}

function selectStage(key: StageItem['key']) {
  console.log('[clone-debug] select-stage-click', {
    targetStage: key,
    previousSelectedStageKey: selectedStageKey.value || '',
    workflowStageKey: workflowStageKey.value,
    visibleStageKey: visibleStageKey.value,
    workflowStep: workflowStep.value,
    currentId: current.value?.id || '',
    loading: loading.value,
  })
  selectedStageKey.value = key
}

function shotLabel(shotId: string) {
  const beat = storyBeats.value.find((item) => item.id === shotId)
  if (beat) return beat.purpose
  const frame = storyboardFrames.value.find((item) => item.shotId === shotId)
  return `分镜 ${Number(frame?.frameIndex ?? 0) + 1}`
}

function openFramePreview(frame: StoryboardFrame) {
  if (!frame.imagePath) return
  const shot = blueprintShots.value.find((item) => item.id === frame.shotId)
  framePreviewPath.value = frame.imagePath
  framePreviewTitle.value = `${safeText(shotLabel(frame.shotId), '分镜')} ${shot ? `· ${storyBeatRangeText(shot as StoryBeat, Number(frame.frameIndex ?? 0))}` : ''}`.trim()
  framePreviewOpen.value = true
}

async function toggleFrameLock(shotId: string) {
  if (!current.value?.id) return
  const shot = blueprintShots.value.find((item) => item.id === shotId)
  if (!shot) return
  loading.value = true
  errorText.value = ''
  setStageLog(`正在${shot.locked ? '解除锁定' : '锁定'} ${shotLabel(shotId)}。`)
  try {
    const project = hasStoredWebToken()
      ? (((await webApiClient.updateCloneShot(current.value.id, shotId, {
          locked: !shot.locked,
        }))?.project || current.value) as CloneProject)
      : ((await window.api.clone.updateShotEnhanced({
          cloneProjectId: current.value.id,
          shotId,
          locked: !shot.locked,
        })) as CloneProject)
    applyProject(project || current.value)
    setStageLog(`${shotLabel(shotId)} 已${shot.locked ? '解除锁定' : '锁定'}。`, 'success')
  } catch (error: any) {
    markError(error?.message ?? error, '分镜锁定失败。')
    await refreshProjectAfterFailure()
    setStageLog('分镜锁定失败，请重试。', 'error')
  } finally {
    loading.value = false
  }
}

function storyBeatDisplayIndex(beat: StoryBeat, fallbackIndex = 0) {
  if (Number.isFinite(beat.index)) return Number(beat.index) + 1
  const frame = storyboardFrames.value.find((item) => item.shotId === beat.id)
  if (typeof frame?.frameIndex === 'number') return frame.frameIndex + 1
  return fallbackIndex + 1
}

function storyBeatRangeText(beat: StoryBeat, fallbackIndex = 0) {
  const start = Number(beat.startSec)
  const end = Number(beat.endSec)
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return `${formatDuration(start)}-${formatDuration(end)}`
  }
  return `片段 ${String(storyBeatDisplayIndex(beat, fallbackIndex)).padStart(2, '0')}`
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

function fileNameFromPath(filePath: string) {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || normalized
}

function mimeTypeFromPath(filePath: string) {
  const normalized = String(filePath || '').toLowerCase()
  if (/\.(png)$/i.test(normalized)) return 'image/png'
  if (/\.(jpg|jpeg)$/i.test(normalized)) return 'image/jpeg'
  if (/\.(webp)$/i.test(normalized)) return 'image/webp'
  if (/\.(gif)$/i.test(normalized)) return 'image/gif'
  if (/\.(mov)$/i.test(normalized)) return 'video/quicktime'
  if (/\.(mkv)$/i.test(normalized)) return 'video/x-matroska'
  if (/\.(webm)$/i.test(normalized)) return 'video/webm'
  return 'video/mp4'
}

function localizePurpose(value?: string) {
  const text = String(value || '').trim()
  if (!text) return '内容片段'
  const normalized = text.toLowerCase()
  const map: Record<string, string> = {
    hook: '开场钩子',
    problem: '痛点引出',
    proof: '效果证明',
    offer: '卖点展示',
    cta: '转化收口',
    benefit: '卖点强化',
    demo: '产品演示',
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

async function refreshModels() {
  modelLoading.value = true
  try {
    models.value = (await window.api.clone.listModelIdentityLibrary()) as ModelItem[]
  } finally {
    modelLoading.value = false
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
  await bindReferenceVideoToWorkspace(file)
}

async function pickProductImages() {
  const files = await window.api.pickFiles({
    title: '选择商品参考图',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    multiple: true,
  })
  const next = (files || []).map(String).filter(Boolean)
  if (!next.length) return
  await bindProductImages(next, effectiveProductRefs.value)
}

async function removeProductImage(imagePath: string) {
  await removeProductImageInWorkspace(imagePath, effectiveProductRefs.value)
}

async function clearProductImages() {
  await clearProductImagesInWorkspace(effectiveProductRefs.value)
}

async function createBlueprint() {
  const sourcePath = safeText(referenceSourcePath.value, '')
  await createBlueprintInWorkspace(sourcePath)
}

async function generateScriptVariants() {
  console.log('[clone-debug] generate-script-click', {
    currentId: activeProjectId.value || '',
    effectiveProductRefs: [...effectiveProductRefs.value],
    savedProductRefs: [...productRefs.value],
    draftProductRefs: productRefsDraft.value ? [...productRefsDraft.value] : null,
    selectedModelId: selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id || '',
    variantCount: variantCount.value,
  })
  await generateScriptVariantsInWorkspace(effectiveProductRefs.value, hasBoundModel.value)
}

async function selectScriptVariant(variantId: string) {
  await selectScriptVariantInWorkspace(variantId)
}

async function selectModel(item: ModelItem) {
  await bindModelIdentity(item.id)
}

async function generateStoryboardGrids() {
  await generateStoryboardGridsInWorkspace({
    effectiveProductRefs: effectiveProductRefs.value,
    hasBoundModel: hasBoundModel.value,
    selectedVariantId: selectedVariantId.value,
  })
}

async function regenerateStoryboardFrame(shotId: string) {
  await regenerateStoryboardFrameInWorkspace(shotId, effectiveProductRefs.value)
}

async function regenerateUnlockedStoryboardFrames() {
  const targets = blueprintShots.value
    .filter((shot) => !shot.locked)
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  if (!targets.length) {
    setStageLog('没有可重新生成的未锁定分镜。')
    return
  }
  for (const shot of targets) {
    await regenerateStoryboardFrame(shot.id)
  }
}

async function generateShotVideos() {
  await generateShotVideosInWorkspace()
}

async function syncFailedShotVideo(shotId: string) {
  await syncFailedShotVideoInWorkspace(shotId)
}

async function replaceShotVideo(shotId: string) {
  const files = await window.api.pickFiles({
    title: '选择替换分镜视频',
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
    multiple: false,
  })
  const file = String(files?.[0] || '')
  if (!file) return
  await replaceShotVideoInWorkspace(shotId, file)
}

async function regenerateShotClip(shotId: string) {
  await regenerateShotClipInWorkspace(shotId)
}

async function regenerateFailedShotVideos() {
  if (!failedShotOutputs.value.length) return
  for (const item of failedShotOutputs.value) {
    await regenerateShotClip(item.shotId)
  }
}

async function refreshRemoteStatus() {
  await refreshRemoteStatusInWorkspace()
}

async function composeFinalVideo() {
  console.log('[clone-debug] compose-final-click', {
    visibleStageKey: visibleStageKey.value,
    selectedStageKey: selectedStageKey.value || '',
    workflowStageKey: workflowStageKey.value,
    workflowStep: workflowStep.value,
    currentId: current.value?.id || '',
    shotVideoCount: shotVideoOutputs.value.length,
    loading: loading.value,
  })
  await composeFinalVideoInWorkspace()
}

async function pickComposeOutputDir() {
  const dir = await window.api.pickDir({ title: '选择最终成片输出目录' })
  if (!dir) return
  composeOutputDir.value = dir
  composeLocalError.value = ''
  setStageLog(`已设置输出目录：${shortPath(dir)}`, 'success')
}

async function openFinalOutput() {
  if (!finalOutputPath.value) return
  await window.api.shell.openPath(finalOutputPath.value)
}

async function revealFinalOutput() {
  if (!finalOutputPath.value) return
  await window.api.shell.showItemInFolder(finalOutputPath.value)
}

let timer: number | null = null

onMounted(async () => {
  pushRuntimeLog(stageLog.value)
  await refreshModels()
  const projectId = routeProjectId.value
  if (!projectId) {
    void router.replace('/clone')
    return
  }
  try {
    await loadProject(projectId)
  } catch (error: any) {
    pushRuntimeLog(`任务载入失败：${safeText(error?.message ?? error, '未知错误')}`, 'error')
    void router.replace('/clone')
    return
  }
  timer = window.setInterval(() => {
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
    <section class="workflow-rail">
      <div class="workflow-rail__track">
        <button
          v-for="item in stageItems"
          :key="item.key"
          class="workflow-rail__step"
          :class="{ 'is-done': item.done, 'is-active': visibleStageKey === item.key }"
          type="button"
          @click="selectStage(item.key)"
        >
          <div class="workflow-rail__index">{{ stageItems.findIndex((stage) => stage.key === item.key) + 1 }}</div>
          <div class="workflow-rail__body">
            <strong>{{ item.title }}</strong>
            <span>{{ item.desc }}</span>
          </div>
        </button>
      </div>
    </section>

    <section class="workspace-grid">
      <div class="main-column">
        <article v-if="visibleStageKey === 'analyze'" class="panel panel-reference">
          <div class="analyze-workbench">
            <div class="analyze-topbar">
              <div class="analyze-breadcrumb">爆款复刻 / 项目详情</div>
              <div class="analyze-topbar__actions">
                <button class="ghost-button small secondary-action" type="button" @click="router.push('/clone')">
                  返回任务列表
                </button>
                <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="selectStage('variant')">下一步：脚本生成</button>
              </div>
            </div>

            <section class="analyze-hero-card">
              <div class="analyze-hero-card__head">
                <div class="analyze-hero-card__copy">
                  <span class="panel-tag">参考分析</span>
                  <h2>参考视频分析</h2>
                  <p>提取脚本结构、内容节奏与可复刻信息</p>
                </div>
                <div class="analyze-hero-card__controls">
                  <button
                    class="primary-button small"
                    type="button"
                    :disabled="loading"
                    @click="referenceSourcePath ? createBlueprint() : pickReferenceVideo()"
                  >
                    {{ analyzePrimaryButtonLabel }}
                  </button>
                </div>
              </div>

              <div class="analyze-main-grid">
                <div class="analyze-video-card">
                  <div class="analyze-video-card__head">
                    <strong>参考视频</strong>
                    <span>{{ safeText(isDraftingNewProject ? shortPath(referenceVideoPath) : current?.referenceVideoName, '等待上传参考视频') }}</span>
                  </div>
                  <div class="video-shell analyze-video-shell">
                    <video v-if="referenceSourcePath" :src="mediaUrl(referenceSourcePath)" controls preload="metadata"></video>
                    <CloneStateCard
                      v-else
                      class="empty-state"
                      title="等待参考视频"
                      description="上传一条参考视频后，系统会开始分析整条脚本结构。"
                    />
                  </div>
                  <div class="analyze-video-card__actions">
                    <button class="ghost-button small secondary-action" type="button" :disabled="loading" @click="pickReferenceVideo">
                      {{ referenceSourcePath ? '重新选择视频' : '上传参考视频' }}
                    </button>
                  </div>
                </div>

                <div class="analyze-structure-card">
                  <div class="analyze-structure-card__head">
                    <strong>内容结构<span>（已识别）</span></strong>
                  </div>
                  <div v-if="storyBeats.length" class="analyze-structure-track">
                    <div
                      v-for="(item, index) in storyBeats.slice(0, 5)"
                      :key="item.id"
                      class="analyze-structure-node"
                      :class="{ 'is-highlight': index === 0 }"
                    >
                      <span class="analyze-structure-node__index">{{ storyBeatDisplayIndex(item, index) }}</span>
                      <strong>{{ storyBeatRangeText(item, index) }}</strong>
                      <span>{{ localizePurpose(item.purpose) }}</span>
                      <small>{{ localizeShotField(item.shotType || item.productRole) }}</small>
                    </div>
                  </div>
                  <CloneStateCard
                    v-else
                    class="empty-state small-empty"
                    title="等待内容结构"
                    description="完成分析后，这里会展示参考视频的内容分段。"
                  />
                </div>
              </div>

              <div class="analyze-bottom-grid">
                <div class="analyze-panel-card analyze-insights-panel">
                  <div class="analyze-panel-card__head">
                    <strong>AI 分析结果</strong>
                  </div>
                  <div class="analyze-summary-grid">
                    <div v-for="item in analyzeSummaryCards" :key="item.key" class="analyze-summary-item">
                      <strong>{{ item.title }}</strong>
                      <span>{{ item.desc }}</span>
                    </div>
                  </div>
                  <div class="analyze-insights-layout">
                    <div class="analyze-script-card">
                      <div class="analyze-script-card__head">
                        <strong>识别脚本内容</strong>
                        <span>{{ analyzeScriptLines.length ? `${analyzeScriptLines.length} 段` : '等待分析' }}</span>
                      </div>
                      <div v-if="analyzeGlobalSections.length" class="analyze-global-sections">
                        <div v-for="item in analyzeGlobalSections" :key="item.key" class="analyze-global-section">
                          <strong>{{ item.title }}</strong>
                          <p>{{ item.desc }}</p>
                        </div>
                      </div>
                      <div v-if="analyzeScriptLines.length" class="analyze-script-lines">
                        <p v-for="(line, index) in analyzeScriptLines" :key="`${index}-${line}`">{{ line }}</p>
                      </div>
                      <p v-else>{{ analyzeScriptPreview }}</p>
                      <div v-if="analyzeReversePrompt" class="analyze-reverse-prompt">
                        <strong>反推提示词</strong>
                        <p>{{ analyzeReversePrompt }}</p>
                      </div>
                    </div>

                    <div class="analyze-structure-mini">
                      <div class="analyze-structure-mini__head">
                        <strong>结构片段</strong>
                        <span>{{ storyBeats.length ? `${storyBeats.length} 个镜头` : '等待识别' }}</span>
                      </div>
                      <div v-if="storyBeats.length" class="analyze-structure-mini__list">
                        <div v-for="(item, index) in storyBeats.slice(0, 5)" :key="item.id" class="analyze-structure-mini__item">
                          <span>{{ String(index + 1).padStart(2, '0') }}</span>
                          <div>
                            <strong>{{ localizePurpose(item.purpose) }}</strong>
                            <small>{{ storyBeatRangeText(item, index) }} · {{ localizeShotField(item.shotType || item.productRole) }}</small>
                          </div>
                        </div>
                      </div>
                      <p v-else class="analyze-structure-mini__empty">完成分析后，这里会显示结构片段摘要。</p>
                    </div>
                  </div>
                </div>

                <div class="analyze-panel-card analyze-engine-card">
                  <div class="analyze-panel-card__head">
                    <strong>AI 引擎状态</strong>
                  </div>
                  <div class="analyze-engine-ring">
                    <span>{{ analyzeStageProgress }}</span>
                  </div>
                  <strong class="analyze-engine-title">{{ analyzeStageProgress >= 100 ? '分析完成' : loading ? '分析中' : '待分析' }}</strong>
                  <span class="analyze-engine-meta">当前状态：{{ safeText(humanWorkflowStep(workflowStep), '--') }}</span>
                </div>
              </div>

              <div class="analyze-footer">
                <div class="analyze-project-card">
                  <div class="analyze-project-card__thumb">
                    <img v-if="referenceSourcePath" :src="mediaUrl(referenceSourcePath)" alt="project-preview" />
                    <span v-else>项目</span>
                  </div>
                  <div class="analyze-project-card__copy">
                    <strong>{{ safeText(current?.blueprint?.title || current?.referenceVideoName, '当前项目') }}</strong>
                    <span>项目进度 {{ analyzeStageProgress }}%</span>
                  </div>
                  <button class="ghost-button small secondary-action" type="button" @click="router.push('/clone')">返回任务列表</button>
                </div>
              </div>
            </section>
          </div>
        </article>

        <article v-if="visibleStageKey === 'variant'" class="panel">
          <div class="variant-workbench">
            <CloneStageHeader tag="脚本生成" title="绑定素材并生成脚本候选" description="先选择模特和商品图，再生成多条按时间段拆分的脚本候选。">
              <template #actions>
                <label class="inline-control">
                  <span>数量</span>
                  <input v-model.number="variantCount" class="count-input" type="number" min="1" max="6" />
                </label>
                <button class="primary-button small" type="button" :disabled="loading || !current?.id" @click="generateScriptVariants">生成候选脚本</button>
              </template>
              <template #aux>
                <span>当前候选：{{ scriptVariants.length }}</span>
                <span>当前选择：{{ selectedVariantId ? '已选脚本' : '未选脚本' }}</span>
                <span>商品图：{{ effectiveProductRefs.length }} 张</span>
              </template>
            </CloneStageHeader>

            <div class="variant-layout">
              <aside class="variant-summary-panel">
                <CloneDataCard class="variant-summary-card variant-summary-card--asset">
                  <div class="variant-asset-card">
                    <div class="variant-asset-card__media variant-asset-card__media--model">
                      <img v-if="modelPreview(modelSnapshot)" :src="modelPreview(modelSnapshot)" alt="model-preview" />
                      <span v-else>模特</span>
                    </div>
                    <div class="variant-summary-card__copy">
                      <span>当前模特</span>
                      <strong>{{ safeText(modelSnapshot?.name, '未选择') }}</strong>
                      <p>{{ modelSnapshot?.id ? '已绑定到当前项目' : '先选择模特后再生成候选' }}</p>
                    </div>
                  </div>
                  <button class="ghost-button small secondary-action" type="button" :disabled="modelLoading" @click="modelModalOpen = true">选择模特</button>
                </CloneDataCard>
                <CloneDataCard class="variant-summary-card variant-summary-card--asset">
                  <div class="variant-summary-card__copy">
                    <span>商品图片</span>
                    <strong>{{ effectiveProductRefs.length ? `已选 ${effectiveProductRefs.length} 张` : '未上传' }}</strong>
                    <p>{{ effectiveProductRefs.length ? '这些商品图已经绑定到当前项目' : '请先上传 3-9 张商品参考图' }}</p>
                  </div>
                  <div v-if="visibleProductThumbs.length" class="variant-product-strip">
                    <span v-for="item in visibleProductThumbs.slice(0, 4)" :key="item" class="variant-product-strip__item">
                      <img :src="previewImage(item)" alt="product-reference" />
                      <button class="variant-product-strip__remove" type="button" :disabled="loading" @click.stop.prevent="removeProductImage(item)">删除</button>
                    </span>
                  </div>
                  <div v-if="visibleProductThumbs.length" class="variant-product-meta">
                    <span>已绑定素材预览</span>
                    <strong>{{ safeText(visibleProductThumbs[0]?.split(/[/\\\\]/).pop(), '商品图') }}</strong>
                  </div>
                  <div class="variant-product-actions">
                    <button class="ghost-button small secondary-action" type="button" @click="pickProductImages">上传商品图</button>
                    <button v-if="effectiveProductRefs.length" class="ghost-button small danger-action" type="button" :disabled="loading" @click.stop.prevent="clearProductImages">清空重选</button>
                  </div>
                </CloneDataCard>
                <CloneDataCard class="variant-summary-card">
                  <div class="variant-summary-card__copy">
                    <span>当前候选</span>
                    <strong>{{ scriptVariants.length }}</strong>
                    <p>已生成 {{ scriptVariants.length }} 条脚本候选</p>
                  </div>
                </CloneDataCard>
                <CloneDataCard class="variant-summary-card">
                  <div class="variant-summary-card__copy">
                    <span>当前选择</span>
                    <strong>{{ selectedVariantId ? '已选中' : '未选择' }}</strong>
                    <p>{{ selectedVariantId ? '点击右侧卡片即可切换' : '先生成候选，再选择一条继续' }}</p>
                  </div>
                </CloneDataCard>
                <CloneDataCard class="variant-summary-card variant-summary-card--highlight">
                  <div class="variant-summary-card__copy">
                    <span>推荐脚本</span>
                    <strong>{{ safeText(variantTopCandidate?.title, '等待生成') }}</strong>
                    <p>{{ safeText(variantTopCandidate?.summary, '生成后会显示推荐理由') }}</p>
                  </div>
                </CloneDataCard>
              </aside>

              <section class="variant-main-panel">
                <div v-if="scriptVariants.length" class="variant-hero-card">
                  <div class="variant-hero-card__score">
                    <span>{{ variantTopCandidate?.score?.toFixed(1) || '0.0' }}</span>
                  </div>
                  <div class="variant-hero-card__copy">
                    <strong>{{ safeText(variantTopCandidate?.title, '等待候选脚本') }}</strong>
                    <p>{{ safeText(variantTopCandidate?.summary, '生成脚本后在这里显示最高分候选。') }}</p>
                    <small>{{ safeText(variantTopCandidate?.reason, '脚本推荐理由会显示在这里。') }}</small>
                  </div>
                  <button
                    class="ghost-button small secondary-action"
                    type="button"
                    :disabled="!variantTopCandidate"
                    @click="variantTopCandidate ? selectScriptVariant(variantTopCandidate.id) : undefined"
                  >
                    应用推荐
                  </button>
                </div>

                <div class="variant-list-panel">
                  <button
                    v-for="item in scriptVariants"
                    :key="item.id"
                    class="variant-card variant-card--row"
                    :class="{ selected: selectedVariantId === item.id }"
                    type="button"
                    @click="selectScriptVariant(item.id)"
                  >
                    <div class="variant-score">{{ item.score.toFixed(1) }}</div>
                    <div class="variant-copy">
                      <div class="variant-copy__head">
                        <strong>{{ item.title }}</strong>
                        <span>{{ selectedVariantId === item.id ? '已选中' : '可继续' }}</span>
                      </div>
                      <p>{{ item.summary }}</p>
                      <small>{{ item.reason }}</small>
                      <div v-if="item.shotScripts?.length" class="variant-shot-lines">
                        <div v-for="shot in item.shotScripts" :key="`${item.id}-${shot.shotId}`" class="variant-shot-line">
                          <strong>{{ safeText(shot.timeRange, `分镜 ${shot.shotIndex + 1}`) }}</strong>
                          <span>{{ shot.scriptText }}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                  <CloneStateCard
                    v-if="!scriptVariants.length"
                    class="empty-state section-empty"
                    title="等待脚本候选"
                    description="选择模特、上传商品图后点击“生成脚本”，系统会输出多条逐分镜候选脚本。"
                  />
                </div>
              </section>
            </div>
          </div>
        </article>

        <article v-if="visibleStageKey === 'grid'" class="panel">
          <CloneStageHeader tag="分镜设计" title="逐分镜图片生成" description="根据已选脚本、项目模特和商品图，为每个镜头生成独立分镜图片。">
            <template #actions>
              <button class="primary-button small" type="button" :disabled="loading || !canGenerateStoryboardFrames" @click="generateStoryboardGrids">开始生成分镜</button>
            </template>
            <template #aux>
              <span>图片结果：{{ storyboardFrames.length }}</span>
              <span>当前候选：{{ selectedVariantId ? '已选脚本' : '未选脚本' }}</span>
              <span>锁定分镜：{{ blueprintShots.filter((shot) => shot.locked).length }}</span>
              <span>图片供应商：{{ activeImageProvider }}</span>
              <span>图片模型：{{ activeImageModel }}</span>
              <span v-if="storyboardBatchSummary">
                批量结果：共 {{ storyboardBatchSummary.total }}，成功 {{ storyboardBatchSummary.done }}，失败 {{ storyboardBatchSummary.failed }}，跳过 {{ storyboardBatchSummary.skipped }}
              </span>
              <span>{{ storyboardFrameBlockReason || '所有前置条件已就绪' }}</span>
            </template>
          </CloneStageHeader>

          <div class="storyboard-layout">
            <section class="storyboard-column storyboard-column--batches">
              <div class="storyboard-column__head">
                <div class="storyboard-column__copy">
                  <strong>分镜脚本</strong>
                  <span>按脚本顺序检查每个分镜要生成的画面内容。</span>
                </div>
                <em>{{ (scriptVariants.find((item) => item.id === selectedVariantId)?.shotScripts || []).length }} 段</em>
              </div>

              <div class="storyboard-batch-list">
                <CloneMediaCard
                  v-for="shot in scriptVariants.find((item) => item.id === selectedVariantId)?.shotScripts || []"
                  :key="shot.shotId"
                  class="storyboard-batch-card"
                >
                  <div class="batch-meta data-card-copy">
                    <strong>{{ safeText(shot.timeRange, `分镜 ${shot.shotIndex + 1}`) }}</strong>
                    <span>{{ shot.scriptText }}</span>
                  </div>
                </CloneMediaCard>
                <CloneStateCard
                  v-if="!(scriptVariants.find((item) => item.id === selectedVariantId)?.shotScripts || []).length"
                  class="empty-state section-empty"
                  title="等待脚本候选"
                  description="先在上一步选择脚本候选，再进入逐分镜图片生成。"
                />
              </div>
            </section>

            <section class="storyboard-column storyboard-column--frames">
              <div class="storyboard-column__head">
                <div class="storyboard-column__copy">
                  <strong>分镜图片结果</strong>
                  <span>每个分镜生成一张独立图片，下一步将直接用于视频生成。</span>
                </div>
                <em>{{ storyboardFrames.length }} 张</em>
              </div>

              <div class="frame-grid">
                <CloneMediaCard v-for="frame in storyboardFrames" :key="frame.id" class="frame-card">
                  <div class="frame-card__media">
                    <img v-if="frame.imagePath" :src="previewImage(frame.imagePath)" alt="frame" />
                    <CloneStateCard
                      v-else
                      class="empty-state small-empty"
                      :tone="frame.error ? 'danger' : 'pending'"
                      :title="frame.error ? '生成失败' : '待生成'"
                      :description="frame.error || '该分镜还没有图片结果。'"
                    />
                  </div>
                  <div class="frame-card__copy">
                    <strong>{{ safeText(shotLabel(frame.shotId), '分镜') }}</strong>
                    <span>
                      {{ blueprintShots.find((shot) => shot.id === frame.shotId)?.locked ? '已锁定' : frame.imagePath ? '已生成' : humanStatus(frame.status) }}
                    </span>
                  </div>
                  <div class="frame-card__actions">
                    <button class="ghost-button small" type="button" :disabled="!frame.imagePath" @click="openFramePreview(frame)">
                      预览大图
                    </button>
                    <button class="ghost-button small" type="button" :disabled="loading" @click="toggleFrameLock(frame.shotId)">
                      {{ blueprintShots.find((shot) => shot.id === frame.shotId)?.locked ? '解除锁定' : '锁定分镜' }}
                    </button>
                    <button class="ghost-button small" type="button" :disabled="loading" @click="regenerateStoryboardFrame(frame.shotId)">
                      重新生成
                    </button>
                  </div>
                </CloneMediaCard>
              </div>
            </section>
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
              <span>当前项目：{{ safeText(current?.title || current?.blueprint?.title || current?.referenceVideoName || current?.id, '未选择项目') }}</span>
            </template>
          </CloneStageHeader>

          <div v-if="shotVideoOutputs.length" class="shot-workbench shot-workbench--reference">
            <div class="video-stage-layout video-stage-layout--workarea">
              <div class="video-stage-main">
                <div class="shot-reference-layout">
                  <section class="shot-table-panel">
                    <div class="shot-table-head">
                      <div class="shot-table-tabs">
                        <button class="shot-table-tab shot-table-tab--active" type="button">分镜列表</button>
                        <button class="shot-table-tab" type="button">{{ tr('cloneView.videoStage.settingsTab') }}</button>
                      </div>
                      <div class="shot-table-actions">
                        <button class="ghost-button small" type="button" :disabled="loading || !failedShotOutputs.length" @click="regenerateFailedShotVideos">
                          {{ failedShotActionText }}
                        </button>
                        <button class="ghost-button small" type="button" :disabled="loading || !current?.id" @click="refreshRemoteStatus">同步云端状态</button>
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
                      <div
                        v-for="item in filteredShotOutputs"
                        :key="item.shotId"
                        class="shot-reference-row"
                        :class="{
                          active: selectedShotOutput?.shotId === item.shotId,
                          ready: Boolean(item.videoPath),
                          failed: item.status === 'failed' || item.status === 'polling_timeout' || Boolean(item.error),
                        }"
                        @click="selectedShotId = item.shotId"
                        @keydown.enter.prevent="selectedShotId = item.shotId"
                        @keydown.space.prevent="selectedShotId = item.shotId"
                        role="button"
                        tabindex="0"
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
                          <button class="ghost-button small action-button" type="button" @click.stop="selectedShotId = item.shotId">预览</button>
                          <button
                            class="ghost-button small action-button"
                            type="button"
                            :disabled="loading || !current?.id"
                            @click.stop="regenerateShotClip(item.shotId)"
                          >
                            重新生成
                          </button>
                          <button
                            v-if="item.status === 'failed' || item.status === 'polling_timeout' || item.error"
                            class="ghost-button small action-button"
                            type="button"
                            :disabled="loading"
                            @click.stop="syncFailedShotVideo(item.shotId)"
                          >
                            继续查询
                          </button>
                        </span>
                      </div>
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
                <strong>下一步：成片合成</strong>
                <span>如果右上角步骤无法点击，可直接从这里进入。</span>
              </div>
              <button
                class="primary-button small"
                type="button"
                :disabled="loading"
                @click.stop="selectStage('compose')"
              >
                前往成片合成
              </button>
            </div>
          </div>

          <CloneStateCard
            v-else
            class="empty-state section-empty"
            title="等待视频结果"
            description="分镜图片生成完成后，这里会进入镜头队列工作区，并按镜头顺序查看生成结果。"
          />
        </article>

        <article v-if="visibleStageKey === 'compose'" class="panel panel-compose-stage">
          <CloneStageHeader tag="" title="成片合成" description="本地合成最终成片，预览结果并导出到目标文件夹">
            <template #actions>
              <button class="primary-button small" type="button" :disabled="loading" @click="composeFinalVideo">{{ finalButtonLabel }}</button>
            </template>
            <template #aux>
              <span>可检查片段：{{ shotVideoOutputs.length }} 条</span>
              <span>输出状态：{{ finalOutputPath ? '已有成片' : '待合成' }}</span>
            </template>
          </CloneStageHeader>

          <div class="compose-workbench">
            <section class="compose-main-stage">
              <div class="compose-canvas-panel">
                <div class="compose-canvas-shell">
                  <div
                    v-if="composePreviewPath"
                    class="compose-canvas-frame"
                    :class="composeAspectClass"
                    @contextmenu.prevent="finalOutputPath && revealFinalOutput()"
                  >
                    <video :src="mediaUrl(composePreviewPath)" controls preload="metadata"></video>
                  </div>
                  <CloneStateCard
                    v-else
                    class="empty-state"
                    title="等待成片"
                    description="合成完成后，这里会显示最终成片；未合成前会显示当前选中镜头预览。"
                  />
                </div>
                <div v-if="finalOutputPath" class="compose-preview-actions">
                  <button class="ghost-button small" type="button" @click="openFinalOutput">播放成片</button>
                  <button class="ghost-button small" type="button" @click="revealFinalOutput">在文件夹中显示</button>
                </div>
              </div>

              <div class="compose-timeline-panel">
                <div class="compose-list-head">
                  <div class="compose-list-copy">
                    <span class="panel-tag">镜头顺序</span>
                    <strong>选择并替换需要重做的片段</strong>
                  </div>
                  <span class="mini-pill mini-pill--ghost">{{ shotVideoOutputs.length }} 条</span>
                </div>

                <div v-if="shotVideoOutputs.length" class="compose-timeline-list">
                  <div
                    v-for="item in shotVideoOutputs"
                    :key="`${item.shotId}-review`"
                    class="compose-timeline-card"
                    :class="{ active: selectedShotOutput?.shotId === item.shotId }"
                    @click="selectedShotId = item.shotId"
                    @keydown.enter.prevent="selectedShotId = item.shotId"
                    @keydown.space.prevent="selectedShotId = item.shotId"
                    role="button"
                    tabindex="0"
                  >
                    <div class="compose-timeline-thumb">
                      <video v-if="item.videoPath" :src="mediaUrl(item.videoPath)" preload="metadata" muted></video>
                      <img v-else-if="shotFrameMap[item.shotId]?.imagePath" :src="previewImage(shotFrameMap[item.shotId]?.imagePath)" alt="shot-frame" />
                      <span v-else>无预览</span>
                    </div>

                    <div class="compose-timeline-overlay">
                      <span>{{ shotVideoOutputs.findIndex((entry) => entry.shotId === item.shotId) + 1 }}</span>
                      <strong>{{ formatDuration(item.durationSec) }}</strong>
                    </div>

                    <div class="compose-timeline-copy">
                      <div class="compose-timeline-copy__head">
                        <strong>{{ safeText(shotLabel(item.shotId), '分镜') }}</strong>
                        <span class="mini-pill" :class="{ replaced: item.source === 'uploaded_replacement' }">
                          {{ item.source === 'uploaded_replacement' ? '替换片段' : '生成片段' }}
                        </span>
                      </div>
                      <p>{{ safeText(storyBeatMap[item.shotId]?.visualDescription || storyBeatMap[item.shotId]?.scriptSegment, '当前分镜暂无描述') }}</p>
                    </div>

                    <div class="compose-timeline-actions">
                      <button class="ghost-button small icon-button" type="button" :disabled="loading" @click.stop="selectedShotId = item.shotId" title="预览">▶</button>
                      <button class="ghost-button small icon-button" type="button" :disabled="loading" @click.stop="replaceShotVideo(item.shotId)" title="替换">↺</button>
                      <button
                        v-if="item.status === 'failed' || item.status === 'polling_timeout' || item.error"
                        class="ghost-button small icon-button"
                        type="button"
                        :disabled="loading"
                        @click.stop="syncFailedShotVideo(item.shotId)"
                        title="继续查询"
                      >
                        ⟳
                      </button>
                    </div>
                  </div>
                </div>

                <CloneStateCard
                  v-else
                  class="empty-state section-empty"
                  title="等待检查片段"
                  description="分镜视频生成完成后，这里可以逐个替换镜头再重新合成。"
                />

                <div class="compose-bottom-actions">
                  <button class="ghost-button small" type="button" :disabled="loading || !selectedShotOutput" @click="replaceShotVideo(selectedShotOutput?.shotId || '')">替换当前镜头</button>
                  <button
                    class="ghost-button small"
                    type="button"
                    :disabled="loading || !(selectedShotOutput && (selectedShotOutput.status === 'failed' || selectedShotOutput.status === 'polling_timeout' || selectedShotOutput.error))"
                    @click="selectedShotOutput && syncFailedShotVideo(selectedShotOutput.shotId)"
                  >
                    继续查询当前镜头
                  </button>
                </div>
              </div>
            </section>

            <aside class="compose-side-rail">
              <section class="compose-side-card">
                <div class="compose-side-card__head">
                  <strong>本地导出</strong>
                  <small>仅显示本地合成与导出状态</small>
                </div>
                <div class="compose-option-group">
                  <span>输出目录</span>
                  <div class="compose-output-dir">
                    <strong>{{ finalOutputDirText }}</strong>
                    <button class="ghost-button small" type="button" :disabled="loading" @click="pickComposeOutputDir">选择文件夹</button>
                  </div>
                </div>
                <div class="compose-option-group">
                  <span>输出文件</span>
                  <strong>{{ safeText(shortPath(finalOutputPath), '等待生成') }}</strong>
                </div>
                <div class="compose-option-group">
                  <span>当前状态</span>
                  <strong>{{ composeExportStatusLabel }}</strong>
                </div>
                <div class="compose-option-group">
                  <span>导出规格</span>
                  <strong>{{ composeExportSettingsSummary }}</strong>
                </div>
                <div class="compose-option-group">
                  <span>总时长</span>
                  <strong>{{ formatDuration(composeTotalDuration) }}</strong>
                </div>
                <div class="compose-export-grid">
                  <div class="compose-export-stat">
                    <span>片段数</span>
                    <strong>{{ shotVideoOutputs.length }}</strong>
                  </div>
                  <div class="compose-export-stat">
                    <span>估算大小</span>
                    <strong>{{ composeEstimatedSize }}</strong>
                  </div>
                  <div class="compose-export-stat">
                    <span>预计耗时</span>
                    <strong>{{ composeExportTimeText }}</strong>
                  </div>
                </div>
                <div class="compose-side-actions">
                  <button class="primary-button compose-export-button" type="button" :disabled="loading" @click="composeFinalVideo">{{ finalButtonLabel }}</button>
                  <button class="ghost-button small" type="button" :disabled="!finalOutputPath" @click="openFinalOutput">播放成片</button>
                  <button class="ghost-button small" type="button" :disabled="!finalOutputPath" @click="revealFinalOutput">在文件夹中显示</button>
                </div>
              </section>

              <CloneDataCard v-if="localComposeErrorText" class="meta-card" tone="danger">
                <span>本地合成提示</span>
                <strong>{{ localComposeErrorText }}</strong>
              </CloneDataCard>
            </aside>
          </div>
        </article>

      </div>

    </section>

    <section class="runtime-console" :class="{ 'is-collapsed': consoleCollapsed }">
      <div class="runtime-log-head">
        <div>
          <strong>运行控制台</strong>
          <span>实时查看提交日志、接口返回、阶段切换与错误信息</span>
        </div>
        <div class="runtime-log-head__actions">
          <em>{{ runtimeLogs.length }} 条</em>
          <button class="ghost-button small" type="button" @click="consoleCollapsed = !consoleCollapsed">
            {{ consoleCollapsed ? '打开' : '关闭' }}
          </button>
        </div>
      </div>
      <div v-if="!consoleCollapsed" ref="logListRef" class="runtime-log-list">
        <article v-for="item in runtimeLogs" :key="item.id" class="runtime-log-item" :class="item.level">
          <strong>{{ item.level === 'error' ? '错误' : item.level === 'success' ? '成功' : '日志' }}</strong>
          <span>{{ item.message }}</span>
        </article>
      </div>
    </section>

    <button v-if="consoleCollapsed" class="runtime-console-toggle" type="button" @click="consoleCollapsed = false">
      打开运行控制台
    </button>

    <div v-if="framePreviewOpen" class="modal-mask" @click.self="framePreviewOpen = false">
      <div class="modal-panel modal-panel--frame-preview">
        <div class="panel-head">
          <div>
            <span class="panel-tag">分镜预览</span>
            <h2>{{ safeText(framePreviewTitle, '分镜大图预览') }}</h2>
          </div>
          <button class="ghost-button small" type="button" @click="framePreviewOpen = false">关闭</button>
        </div>
        <div class="frame-preview-shell">
          <img v-if="framePreviewPath" :src="previewImage(framePreviewPath)" alt="frame-preview" />
        </div>
      </div>
    </div>

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
  padding: 4px 12px 72px;
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
.workflow-rail__track {
  display: grid;
}

.workflow-rail {
  position: sticky;
  top: 0;
  z-index: 8;
  padding: 0 0 6px;
  background: linear-gradient(180deg, rgba(6, 11, 22, 0.98), rgba(6, 11, 22, 0.9) 66%, transparent);
}

.workflow-rail__track {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
  padding: 6px 8px;
  border: 1px solid rgba(119, 137, 198, 0.12);
  border-radius: 12px;
  background: rgba(8, 13, 24, 0.96);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
}

.panel-head,
.panel-actions,
.selected-model,
.review-head {
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
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #d8e2ff;
  font-size: 12px;
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

.workflow-rail__step,
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

.workflow-rail__step {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  padding: 6px 10px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 0;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  min-height: 50px;
  transition: background 0.16s ease, color 0.16s ease;
}

.workflow-rail__step::after {
  content: '';
  position: absolute;
  top: 20px;
  left: calc(50% + 22px);
  width: calc(100% - 44px);
  height: 1px;
  background: rgba(148, 163, 184, 0.18);
  pointer-events: none;
}

.workflow-rail__step:last-child::after {
  display: none;
}

.workflow-rail__step:hover {
  background: rgba(255, 255, 255, 0.025);
}

.workflow-rail__step.is-active {
  background: rgba(109, 93, 255, 0.08);
}

.workflow-rail__index {
  position: relative;
  z-index: 1;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #0c1423;
  color: #93a2c1;
  border: 1px solid rgba(148, 163, 184, 0.22);
  font-size: 13px;
  font-weight: 700;
}

.workflow-rail__body {
  display: grid;
  align-content: center;
  gap: 1px;
  min-width: 0;
}

.workflow-rail__body strong,
.meta-card strong,
.variant-copy strong,
.batch-meta strong,
.selected-model-copy strong,
.review-head strong,
.history-copy strong {
  display: block;
  font-size: 12px;
  line-height: 1.3;
}

.workflow-rail__body span,
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
  font-size: 10px;
  line-height: 1.3;
}

.workflow-rail__step.is-done .workflow-rail__index,
.workflow-rail__step.is-active .workflow-rail__index {
  color: #ffffff;
  border-color: rgba(109, 93, 255, 0.42);
  background: linear-gradient(135deg, rgba(111, 88, 255, 0.96), rgba(89, 182, 255, 0.88));
  box-shadow: 0 0 0 3px rgba(111, 88, 255, 0.1);
}

.workflow-rail__step.is-active .workflow-rail__body strong {
  color: #f5f7ff;
}

.workflow-rail__step.is-active .workflow-rail__body span {
  color: #bcc8e8;
}

.workflow-rail__step.is-done::after {
  background: rgba(109, 93, 255, 0.34);
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
  z-index: 5;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-top: 4px;
}

.main-column {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
}

.panel {
  position: relative;
  z-index: 1;
  padding: 10px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(10px);
}

.panel-reference {
  background:
    linear-gradient(180deg, rgba(15, 22, 38, 0.98), rgba(10, 16, 29, 0.98)),
    radial-gradient(circle at top left, rgba(84, 101, 194, 0.12), transparent 28%);
}

.analyze-workbench {
  display: grid;
  gap: 8px;
}

.analyze-topbar,
.analyze-topbar__actions,
.analyze-hero-card__head,
.analyze-hero-card__controls,
.analyze-footer,
.analyze-footer__actions,
.analyze-panel-card__head {
  display: flex;
  align-items: center;
}

.analyze-topbar,
.analyze-hero-card,
.analyze-panel-card,
.analyze-project-card {
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: rgba(10, 16, 29, 0.92);
}

.analyze-topbar {
  justify-content: space-between;
  gap: 10px;
  min-height: 42px;
  padding: 0 10px;
  border-radius: 14px;
}

.analyze-breadcrumb {
  color: #eef3ff;
  font-size: 14px;
  font-weight: 700;
}

.analyze-topbar__actions,
.analyze-hero-card__controls,
.analyze-footer__actions {
  gap: 8px;
}

.analyze-hero-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
}

.analyze-hero-card__head,
.analyze-panel-card__head,
.analyze-footer {
  justify-content: space-between;
  gap: 10px;
}

.analyze-hero-card__copy,
.analyze-project-card__copy {
  display: grid;
  gap: 4px;
}

.analyze-hero-card__copy h2 {
  margin: 0;
  color: #f8fbff;
  font-size: 20px;
  line-height: 1.2;
}

.analyze-hero-card__copy p,
.analyze-project-card__copy span,
.analyze-engine-meta,
.analyze-summary-item span,
.analyze-structure-node small,
.analyze-structure-node span,
.analyze-script-card p {
  color: #98a6c7;
  font-size: 12px;
  line-height: 1.5;
}

.analyze-main-grid,
.analyze-bottom-grid {
  display: grid;
  gap: 12px;
}

.analyze-main-grid {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
}

.analyze-bottom-grid {
  grid-template-columns: minmax(0, 1fr) 208px;
}

.analyze-video-card,
.analyze-structure-card,
.analyze-panel-card {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.analyze-video-card__head,
.analyze-structure-card__head {
  display: grid;
  gap: 4px;
}

.analyze-video-card__head strong,
.analyze-structure-card__head strong,
.analyze-panel-card__head strong,
.analyze-project-card__copy strong,
.analyze-engine-title,
.analyze-summary-item strong {
  color: #eef3ff;
}

.analyze-video-card__head span {
  color: #98a6c7;
  font-size: 13px;
  line-height: 1.5;
}

.analyze-video-shell {
  min-height: 260px;
  max-height: 320px;
}

.analyze-video-card__actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 8px;
}

.analyze-structure-card {
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.025);
}

.analyze-structure-card__head strong span {
  color: #95a3c3;
  font-weight: 500;
}

.analyze-structure-track {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
}

.analyze-structure-node {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background: rgba(12, 19, 34, 0.88);
}

.analyze-structure-node.is-highlight {
  border-color: rgba(109, 93, 255, 0.42);
  box-shadow: inset 0 0 0 1px rgba(109, 93, 255, 0.18);
}

.analyze-project-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.analyze-structure-node__index {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #eef3ff;
  font-size: 13px;
  font-weight: 800;
}

.analyze-structure-node strong {
  font-size: 13px;
}

.analyze-panel-card {
  padding: 12px;
  border-radius: 16px;
}

.analyze-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.analyze-summary-item {
  display: grid;
  gap: 4px;
  min-height: 76px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.025);
}

.analyze-insights-panel {
  gap: 12px;
}

.analyze-insights-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(280px, 0.82fr);
  gap: 10px;
  min-width: 0;
}

.analyze-script-card {
  display: grid;
  gap: 10px;
  min-height: 240px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.025);
}

.analyze-script-card__head,
.analyze-structure-mini__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.analyze-script-card__head span,
.analyze-structure-mini__head span,
.analyze-structure-mini__empty {
  color: #8fa1c6;
  font-size: 12px;
  line-height: 1.5;
}

.analyze-script-card p {
  margin: 0;
  white-space: pre-line;
}

.analyze-global-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.analyze-global-section,
.analyze-reverse-prompt {
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.02);
}

.analyze-global-section strong,
.analyze-reverse-prompt strong {
  color: #eef3ff;
  font-size: 13px;
}

.analyze-global-section p,
.analyze-reverse-prompt p {
  color: #9aa8c8;
  line-height: 1.62;
}

.analyze-script-lines {
  display: grid;
  gap: 6px;
  max-height: 320px;
  overflow: auto;
  padding-right: 4px;
}

.analyze-script-lines p {
  padding: 8px 9px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.02);
  line-height: 1.5;
}

.analyze-structure-mini {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.025);
}

.analyze-structure-mini__list {
  display: grid;
  gap: 6px;
}

.analyze-structure-mini__item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.02);
}

.analyze-structure-mini__item > span {
  display: grid;
  place-items: center;
  min-height: 32px;
  border: 1px solid rgba(133, 149, 196, 0.14);
  background: rgba(12, 19, 34, 0.88);
  color: #eef3ff;
  font-size: 12px;
  font-weight: 800;
}

.analyze-structure-mini__item div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.analyze-structure-mini__item strong {
  color: #eef3ff;
  font-size: 12px;
}

.analyze-structure-mini__item small {
  color: #8fa1c6;
  line-height: 1.45;
}

.analyze-engine-card {
  justify-items: center;
  align-content: center;
  text-align: center;
  min-width: 0;
}

.analyze-engine-ring {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 999px;
  border: 7px solid rgba(109, 93, 255, 0.18);
  border-top-color: rgba(109, 93, 255, 0.9);
  border-right-color: rgba(109, 93, 255, 0.64);
}

.analyze-engine-ring span {
  color: #f7faff;
  font-size: 22px;
  font-weight: 800;
}

.analyze-footer {
  align-items: stretch;
  gap: 10px;
}

.analyze-project-card {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 10px;
  border-radius: 14px;
}

.analyze-project-card__thumb {
  flex: 0 0 auto;
  width: 86px;
  height: 58px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.analyze-project-card__thumb span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #eef3ff;
  font-size: 12px;
}

.analyze-primary-button {
  min-width: 220px;
}

.analyze-secondary-button {
  min-width: 160px;
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
  margin-bottom: 6px;
}

.stage-head__main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.stage-head__aux {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 26px;
  padding: 0 2px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stage-head__aux span {
  color: #8fa0c4;
  font-size: 10px;
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
  min-height: 34px;
  padding: 0 9px;
  border-radius: 10px;
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
  gap: 10px;
  margin-top: 8px;
}

.video-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03);
}

.video-shell video {
  width: auto;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #060b16;
}

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

.history-thumb video {
  width: auto;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  margin: 0 auto;
  background: #060b16;
}

.reference-side,
.final-side {
  display: grid;
  gap: 12px;
}

.subtle-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}

.history-panel {
  margin-bottom: 2px;
}

.history-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-panel__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.history-panel__copy strong {
  color: #eef3ff;
  font-size: 13px;
  line-height: 1.35;
}

.history-panel__list {
  display: grid;
  gap: 8px;
}

.history-panel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(133, 149, 196, 0.1);
  background: rgba(255, 255, 255, 0.025);
  color: #dce6ff;
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.history-panel__item:hover {
  transform: translateY(-1px);
  border-color: rgba(109, 93, 255, 0.28);
  background: rgba(109, 93, 255, 0.08);
}

.history-panel__item.is-active {
  border-color: rgba(109, 93, 255, 0.42);
  background: rgba(109, 93, 255, 0.14);
  box-shadow: inset 0 0 0 1px rgba(109, 93, 255, 0.18);
}

.history-panel__item-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.history-panel__item-copy strong,
.history-panel__item-copy span,
.history-panel__item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-panel__item-copy strong {
  color: #eef3ff;
  font-size: 13px;
}

.history-panel__item-copy span,
.history-panel__item small {
  color: #95a3c3;
  font-size: 11px;
}

.meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.meta-card {
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}

.data-card {
  border-radius: 14px;
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

.runtime-console {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: grid;
  gap: 8px;
  min-height: 0;
  margin-top: 10px;
  padding: 8px 10px 10px;
  border: 1px solid rgba(119, 137, 198, 0.16);
  background: rgba(11, 17, 30, 0.94);
  backdrop-filter: blur(18px);
  box-shadow: 0 -8px 18px rgba(0, 0, 0, 0.14);
}

.runtime-console.is-collapsed {
  padding-bottom: 10px;
}

.runtime-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #93a2c1;
  font-size: 12px;
  font-weight: 700;
}

.runtime-log-head__actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.runtime-console-toggle {
  position: fixed;
  right: 12px;
  bottom: 10px;
  z-index: 41;
  height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(119, 137, 198, 0.18);
  background: rgba(11, 17, 30, 0.96);
  color: #eef3ff;
  font-size: 12px;
  cursor: pointer;
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

.variant-workbench {
  display: grid;
  gap: 10px;
}

.variant-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 10px;
}

.variant-summary-panel {
  display: grid;
  gap: 8px;
  align-content: start;
}

.variant-summary-card {
  padding: 12px;
}

.variant-summary-card__copy {
  display: grid;
  gap: 4px;
}

.variant-summary-card__copy span {
  color: #8ea6ff;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.variant-summary-card__copy strong {
  font-size: 24px;
  line-height: 1;
}

.variant-summary-card__copy p {
  margin: 0;
  color: #9aa9c9;
  font-size: 12px;
  line-height: 1.45;
}

.variant-summary-card--asset {
  gap: 12px;
}

.variant-asset-card {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.variant-asset-card__media {
  width: 88px;
  height: 112px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.variant-asset-card__media img,
.variant-product-strip__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.variant-asset-card__media span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #d9e3fb;
  font-size: 13px;
  font-weight: 700;
}

.variant-product-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding-top: 2px;
}

.variant-product-strip__item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.variant-product-strip__remove {
  position: absolute;
  right: 6px;
  top: 6px;
  border: 0;
  padding: 4px 8px;
  background: rgba(8, 12, 22, 0.88);
  color: #f4f7ff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.variant-product-meta {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.variant-product-meta span {
  color: #8fa0c3;
  font-size: 12px;
}

.variant-product-meta strong {
  color: #eef3ff;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-all;
}

.variant-product-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.danger-action {
  border-color: rgba(255, 120, 120, 0.26);
  color: #ffb3b3;
}

.variant-summary-card--highlight {
  background: linear-gradient(180deg, rgba(109, 93, 255, 0.18), rgba(12, 19, 34, 0.94));
  border-color: rgba(109, 93, 255, 0.22);
}

.variant-main-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.variant-hero-card {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid rgba(109, 93, 255, 0.18);
  background: linear-gradient(180deg, rgba(18, 25, 45, 0.98), rgba(10, 16, 29, 0.96));
}

.variant-hero-card__score {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(111, 88, 255, 0.96), rgba(89, 182, 255, 0.82));
  color: #fff;
  font-size: 22px;
  font-weight: 800;
}

.variant-hero-card__copy {
  display: grid;
  gap: 6px;
}

.variant-hero-card__copy strong {
  font-size: 16px;
  line-height: 1.25;
}

.variant-hero-card__copy p {
  margin: 0;
  color: #d7e0fb;
  line-height: 1.6;
}

.variant-hero-card__copy small {
  color: #8ea6ff;
}

.variant-list-panel {
  display: grid;
  gap: 8px;
}

.variant-card {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  border-radius: 14px;
  align-items: start;
}

.variant-card--row.selected {
  border-color: rgba(138, 156, 255, 0.38);
  box-shadow: 0 0 0 1px rgba(138, 156, 255, 0.22) inset;
}

.variant-score {
  width: 68px;
  height: 68px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(111, 88, 255, 0.94), rgba(89, 182, 255, 0.84));
  color: #fff;
  font-weight: 800;
  font-size: 20px;
}

.variant-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.variant-copy__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.variant-copy__head span {
  color: #8ea6ff;
  font-size: 12px;
}

.variant-shot-lines {
  display: grid;
  gap: 5px;
  margin-top: 4px;
}

.variant-shot-line {
  display: grid;
  grid-template-columns: 98px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px 9px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.02);
}

.variant-shot-line strong {
  color: #eef3ff;
  font-size: 12px;
  line-height: 1.45;
}

.variant-shot-line span {
  color: #97a6c6;
  font-size: 12px;
  line-height: 1.55;
}

.variant-copy p {
  margin: 0;
  color: #dbe4fb;
  line-height: 1.55;
}

.variant-copy small {
  color: #8fa0c3;
  line-height: 1.5;
}

.asset-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.selected-model {
  gap: 12px;
  align-items: center;
  margin-top: 12px;
  padding: 12px;
  min-height: 0;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin-top: 12px;
}

.product-thumb {
  aspect-ratio: 0.92;
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
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 10px;
  margin-top: 8px;
  align-items: start;
}

.storyboard-column {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.storyboard-column__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 2px 0;
}

.storyboard-column__copy {
  display: grid;
  gap: 3px;
}

.storyboard-column__copy strong {
  color: #eef3ff;
  font-size: 14px;
  line-height: 1.2;
}

.storyboard-column__copy span,
.storyboard-column__head em {
  color: #8fa1c6;
  font-size: 12px;
  line-height: 1.45;
  font-style: normal;
}

.storyboard-batch-list,
.frame-grid,
.shot-video-grid,
.review-grid,
.feedback-stack,
.history-list,
.model-grid {
  gap: 8px;
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
  padding: 10px;
}

.storyboard-batch-card {
  padding: 9px;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.frame-card {
  display: grid;
  gap: 8px;
}

.frame-card__media {
  min-width: 0;
}

.frame-card img {
  aspect-ratio: 9 / 16;
  border-radius: 14px;
  width: 100%;
  object-fit: cover;
}

.frame-card__copy {
  display: grid;
  gap: 2px;
}

.frame-card__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.frame-card__actions .ghost-button {
  min-width: 88px;
}

.modal-panel--frame-preview {
  width: min(1080px, calc(100vw - 40px));
}

.frame-preview-shell {
  display: grid;
  place-items: center;
  min-height: 520px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(6, 11, 22, 0.88);
}

.frame-preview-shell img {
  max-width: 100%;
  max-height: 76vh;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

.compose-preview-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 10px;
  flex-wrap: wrap;
}

.compose-side-card__head small {
  color: #7d8aa8;
  font-size: 11px;
  line-height: 1.4;
  min-width: 0;
  text-align: right;
}

.compose-output-dir {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.compose-output-dir strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-side-actions {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  min-width: 0;
}

.frame-card strong {
  display: block;
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
  font-size: 18px;
  line-height: 1.12;
  letter-spacing: 0.01em;
}

.panel-video-stage :deep(.stage-head__main p) {
  max-width: 560px;
  color: #8fa1c6;
  font-size: 11px;
  line-height: 1.5;
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
  min-height: 24px;
  padding: 6px 0 0;
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
  gap: 12px;
  align-items: start;
}

.video-stage-layout--workarea {
  gap: 10px;
  padding: 6px;
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
  overflow: hidden;
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
  min-width: 0;
  overflow: hidden;
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
  gap: 8px;
  padding: 12px 14px;
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
  padding: 14px 14px 12px;
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
  grid-template-columns: 64px 96px minmax(220px, 1.65fr) 72px 96px 116px 224px;
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
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
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
  gap: 4px;
  justify-content: flex-end;
  white-space: nowrap;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
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

.action-button {
  min-width: 58px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 0;
  white-space: nowrap;
  font-size: 12px;
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
  aspect-ratio: 9 / 16;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
}

.shot-preview-card__shell video {
  background: #060b16;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  min-height: 0;
}

.shot-preview-card__hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  pointer-events: none;
}

.shot-preview-card__hud span {
  padding: 6px 10px;
  border-radius: 0;
  color: #eef3ff;
  font-size: 10px;
  background: rgba(6, 11, 22, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
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

.panel-reference :deep(.stage-head__main p),
.variant-workbench :deep(.stage-head__main p),
.panel-compose-stage :deep(.stage-head__main p),
.panel-final-stage :deep(.stage-head__main p) {
  max-width: 520px;
  color: #8ea3ca;
  font-size: 11px;
  line-height: 1.5;
}

.panel-reference :deep(.stage-head__main h2),
.variant-workbench :deep(.stage-head__main h2),
.panel-compose-stage :deep(.stage-head__main h2),
.panel-final-stage :deep(.stage-head__main h2) {
  font-size: 18px;
  line-height: 1.12;
  letter-spacing: 0.01em;
}

.panel-compose-stage :deep(.stage-head__aux),
.panel-final-stage :deep(.stage-head__aux) {
  display: none;
}

.panel-reference :deep(.stage-head__main),
.variant-workbench :deep(.stage-head__main),
.panel-compose-stage :deep(.stage-head__main) {
  gap: 4px;
  padding: 0;
}

.panel-compose-stage :deep(.stage-head),
.panel-compose-stage :deep(.stage-head__actions),
.panel-compose-stage :deep(.stage-head__actions .primary-button) {
  position: relative;
  z-index: 20;
  pointer-events: auto;
}

.compose-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 316px);
  gap: 12px;
  margin-top: 4px;
  align-items: start;
  min-width: 0;
}

.compose-main-stage {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.compose-canvas-panel,
.compose-timeline-panel,
.compose-side-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background: linear-gradient(180deg, rgba(12, 19, 34, 0.94), rgba(8, 13, 24, 0.98));
  min-width: 0;
  overflow: hidden;
}

.compose-canvas-panel {
  align-items: center;
}

.compose-list-head,
.compose-side-card__head,
.compose-score-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.compose-list-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.compose-list-copy strong {
  color: #eef3ff;
  font-size: 14px;
  line-height: 1.35;
}

.compose-canvas-shell {
  position: relative;
  width: 100%;
  height: clamp(360px, 54vh, 560px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
  border: 1px solid rgba(133, 149, 196, 0.14);
  background:
    radial-gradient(circle at top, rgba(109, 93, 255, 0.18), transparent 38%),
    linear-gradient(180deg, rgba(10, 16, 29, 0.98), rgba(6, 10, 18, 1));
}

.compose-canvas-shell video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #060b16;
}

.compose-canvas-frame {
  width: auto;
  height: 100%;
  max-width: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(7, 12, 21, 0.98);
}

.compose-canvas-frame.is-portrait {
  aspect-ratio: 9 / 16;
}

.compose-canvas-frame.is-square {
  aspect-ratio: 1 / 1;
}

.compose-canvas-frame.is-landscape {
  aspect-ratio: 16 / 9;
}

.compose-timeline-list {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.compose-timeline-card {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background: linear-gradient(180deg, rgba(15, 24, 42, 0.88), rgba(9, 15, 28, 0.96));
  text-align: left;
  min-width: 0;
  transition: border-color 0.16s ease, transform 0.16s ease, background 0.16s ease;
}

.compose-timeline-card:hover {
  transform: translateY(-1px);
  border-color: rgba(109, 93, 255, 0.28);
}

.compose-timeline-card.active {
  border-color: rgba(109, 93, 255, 0.48);
  background: linear-gradient(180deg, rgba(37, 32, 70, 0.92), rgba(12, 18, 31, 0.98));
  box-shadow: 0 0 0 1px rgba(109, 93, 255, 0.18);
}

.compose-timeline-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.compose-timeline-thumb video {
  width: auto;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  margin: 0 auto;
  background: #060b16;
}

.compose-timeline-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.compose-timeline-thumb span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #8fa1c6;
  font-size: 11px;
}

.compose-timeline-overlay {
  position: absolute;
  top: 18px;
  left: 18px;
  right: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}

.compose-timeline-overlay span,
.compose-timeline-overlay strong {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0 8px;
  background: rgba(5, 9, 17, 0.68);
  color: #eef3ff;
  font-size: 11px;
  font-weight: 700;
}

.compose-timeline-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.compose-timeline-copy__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.compose-timeline-copy__head strong {
  color: #eef3ff;
  font-size: 13px;
  line-height: 1.35;
}

.compose-timeline-copy p {
  margin: 0;
  color: #8fa1c6;
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.compose-timeline-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.compose-timeline-actions .icon-button {
  min-width: 34px;
  height: 34px;
  padding: 0;
}

.compose-bottom-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.compose-side-rail,
.compose-score-copy,
.compose-check-list,
.compose-option-group {
  display: grid;
}

.compose-side-rail {
  gap: 10px;
  min-width: 0;
  width: 100%;
  max-width: 316px;
}

.compose-score-card {
  gap: 16px;
}

.compose-score-body {
  justify-content: flex-start;
}

.compose-score-ring {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  border-radius: 50%;
  border: 6px solid rgba(109, 93, 255, 0.88);
  box-shadow: 0 0 0 6px rgba(109, 93, 255, 0.08);
}

.compose-score-ring span {
  color: #f8fbff;
  font-size: 28px;
  font-weight: 700;
}

.compose-score-copy {
  gap: 6px;
}

.compose-score-copy span,
.compose-option-group > span,
.compose-export-stat span {
  color: #91a5cd;
  font-size: 12px;
}

.compose-score-copy strong {
  color: #8f7cff;
  font-size: 28px;
  line-height: 1.1;
}

.compose-check-list {
  gap: 10px;
}

.compose-check-list span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #d6e0f3;
  font-size: 13px;
}

.compose-check-list i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #51d08f;
  box-shadow: 0 0 0 4px rgba(81, 208, 143, 0.12);
}

.compose-side-button,
.compose-export-button {
  width: 100%;
}

.compose-option-group {
  gap: 8px;
  min-width: 0;
}

.compose-chip-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.compose-chip {
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid rgba(133, 149, 196, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #d6e0f3;
  font-size: 13px;
}

.compose-chip.is-active {
  border-color: rgba(109, 93, 255, 0.52);
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.9), rgba(133, 92, 246, 0.9));
  color: #fff;
}

.compose-export-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.compose-export-stat {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(133, 149, 196, 0.08);
  background: rgba(255, 255, 255, 0.02);
  min-width: 0;
  overflow: hidden;
}

.compose-export-stat strong {
  color: #eef3ff;
  font-size: 18px;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-height: 0;
  aspect-ratio: 9 / 16;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 10px 0;
  pointer-events: none;
  min-width: 0;
}

.sidebar-preview-shell__hud span {
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 0;
  color: #eef3ff;
  font-size: 9px;
  background: rgba(6, 11, 22, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-width: 0;
}

.sidebar-section__head strong {
  color: #eef3ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-section__head small {
  color: #7e90bb;
  font-size: 9px;
  flex: 0 0 auto;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-stage-preview :deep(.console-sidebar__title),
.video-stage-preview :deep(.console-sidebar__tag),
.video-stage-preview :deep(.console-sidebar .panel-head),
.video-stage-preview :deep(.console-sidebar .panel-head > div) {
  min-width: 0;
}

.video-stage-preview :deep(.console-sidebar__title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-stage-preview :deep(.console-sidebar__tag) {
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: 16px;
  font-size: 12px;
  line-height: 1.6;
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
  min-height: 38px;
  padding: 0 12px;
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
  background: linear-gradient(135deg, #7b6cff, #5aa8ff);
  color: #ffffff;
  font-weight: 800;
  box-shadow: 0 10px 24px rgba(96, 95, 255, 0.24);
}

.ghost-button {
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
}

.small {
  min-height: 34px;
  font-size: 11px;
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
  .frame-grid,
  .review-grid,
  .model-grid {
    grid-template-columns: 1fr 1fr;
  }

  .variant-layout {
    grid-template-columns: 1fr;
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
    grid-template-columns: 58px 88px minmax(180px, 1.25fr) 64px 84px 112px 196px;
  }

  .compose-workbench {
    grid-template-columns: 1fr;
  }

  .compose-timeline-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1280px) {
  .analyze-main-grid,
  .analyze-bottom-grid {
    grid-template-columns: 1fr;
  }

  .analyze-insights-layout,
  .analyze-structure-track {
    grid-template-columns: 1fr;
  }

  .analyze-summary-grid {
    grid-template-columns: 1fr;
  }

  .analyze-global-sections {
    grid-template-columns: 1fr;
  }

  .analyze-footer {
    flex-direction: column;
  }

  .analyze-footer__actions {
    width: 100%;
  }

  .analyze-primary-button,
  .analyze-secondary-button {
    min-width: 0;
    flex: 1 1 0;
  }
}

@media (max-width: 980px) {
  .analyze-topbar,
  .analyze-hero-card__head,
  .analyze-footer,
  .analyze-footer__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .analyze-structure-track,
  .analyze-summary-grid,
  .meta-grid,
  .beats-grid,
  .model-grid {
    grid-template-columns: 1fr;
  }

  .product-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
  .workspace-grid,
  .reference-layout,
  .storyboard-layout,
  .final-layout,
  .asset-grid,
  .meta-grid,
  .beats-grid,
  .frame-grid,
  .review-grid,
  .model-grid,
  .product-grid {
    grid-template-columns: 1fr;
  }

  .selected-model {
    flex-direction: column;
    align-items: stretch;
  }

  .frame-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .variant-hero-card,
  .variant-copy__head {
    flex-direction: column;
    align-items: stretch;
  }

  .variant-hero-card {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
    align-items: stretch;
  }

  .panel-actions {
    justify-content: flex-start;
  }

  .compose-canvas-panel,
  .compose-timeline-panel,
  .compose-side-card {
    padding: 12px;
  }

  .compose-timeline-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .compose-export-grid,
  .compose-chip-row {
    grid-template-columns: 1fr;
  }

  .compose-score-body,
  .compose-bottom-actions {
    flex-direction: column;
    align-items: stretch;
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
