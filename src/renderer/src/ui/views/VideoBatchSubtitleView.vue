<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  CheckCircle2,
  FolderOpen,
  LoaderCircle,
  Play,
  Sparkles,
  Upload,
  X,
} from 'lucide-vue-next'
import {
  webApiClient,
  type BatchSubtitleCaptionStyle,
  type BatchSubtitleJob,
  type BatchSubtitleLayoutPolicy,
  type BatchSubtitleOverlayImageConfig,
  type BatchSubtitleOutputItem,
  type BatchSubtitlePreviewResult,
  type BatchSubtitleSourceItem,
  type BatchSubtitleTitleItem,
  type BatchSubtitleTitleRenderMode,
  type CloneProjectSummary,
} from '@/lib/webApiClient'

type SourceTab = 'upload' | 'clone'
type RightTab = 'content' | 'style'
type QueueTab = 'all' | 'processing' | 'completed'
type StepState = 'idle' | 'active' | 'done'
type CaptionTemplatePresetId = 'viral-hook' | 'deal-punch' | 'premium-drop'
type PreviewMode = 'fast' | 'video'

const sourceTab = ref<SourceTab>('upload')
const rightTab = ref<RightTab>('content')
const queueTab = ref<QueueTab>('all')
const loading = ref(false)
const runningJob = ref(false)
const controllingJob = ref(false)
const generatingTitles = ref(false)
const pushingToGeelark = ref(false)
const showAllOutputs = ref(false)
const notice = ref('')
const errorText = ref('')
const previewVideoError = ref('')
const aiPrompt = ref('')
const jobs = ref<BatchSubtitleJob[]>([])
const outputs = ref<BatchSubtitleOutputItem[]>([])
const cloneProjects = ref<CloneProjectSummary[]>([])
const selectedSourceIds = ref<string[]>([])
const selectedPreviewId = ref('')
const selectedJobId = ref('')
const draftDirty = ref(false)
const previewFrame = ref<BatchSubtitlePreviewResult | null>(null)
const previewFrameLoading = ref(false)
const previewThumbStart = ref(0)
const previewThumbPageSize = 5
const sourcePage = ref(1)
const sourcePageSize = 12
const selectedTemplatePreset = ref<CaptionTemplatePresetId>('viral-hook')
const previewMode = ref<PreviewMode>('fast')
let previewTimer: ReturnType<typeof setTimeout> | null = null
let queuePollTimer: ReturnType<typeof setInterval> | null = null
let previewRequestToken = 0
let previewQueued = false
let lastAppliedPreviewSignature = ''

function defaultCaptionStyle(): BatchSubtitleCaptionStyle {
  return {
    fontName: 'Noto Sans SC',
    fontSize: 64,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 6,
    shadowColor: '#000000',
    shadowBlur: 12,
    position: 'bottom',
    safeMargin: 12,
    textAlign: 'center',
    maxLines: 2,
    maxWidthRatio: 0.7,
    lineGap: 8,
    bottomMargin: 220,
  }
}

function defaultLayoutPolicy(): BatchSubtitleLayoutPolicy {
  return {
    maxLines: 2,
    maxWidthRatio: 0.7,
    reflowStrategy: 'balanced',
    avoidPosition: 'auto',
  }
}

const captionTemplatePresets: Array<{
  id: CaptionTemplatePresetId
  name: string
  summary: string
  style: Partial<BatchSubtitleCaptionStyle>
}> = [
  {
    id: 'viral-hook',
    name: '爆款钩子款',
    summary: '适合前 3 秒抓停留，强对比、强情绪、强记忆点标题。',
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
    name: '促单成交款',
    summary: '适合价格利益点、限时优惠、爆点卖点，电商转化感更强。',
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
    name: '高客单精致款',
    summary: '适合饰品、美妆、质感单品，视觉更高级，更像高客单种草标题。',
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
]

function defaultOverlayImageConfig(): BatchSubtitleOverlayImageConfig {
  const style = defaultCaptionStyle()
  return {
    canvasWidth: 1080,
    canvasHeight: 1920,
    fontName: style.fontName,
    fontSize: style.fontSize,
    fontColor: style.fontColor,
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
    shadowColor: style.shadowColor,
    shadowBlur: style.shadowBlur,
    position: style.position,
    safeMargin: style.safeMargin,
    textAlign: style.textAlign,
    maxLines: style.maxLines,
    maxWidthRatio: style.maxWidthRatio,
    lineGap: style.lineGap,
    bottomMargin: style.bottomMargin,
  }
}

const draft = reactive<{
  name: string
  titleRenderMode: BatchSubtitleTitleRenderMode
  sourceItems: BatchSubtitleSourceItem[]
  titleText: string
  titleItems: BatchSubtitleTitleItem[]
  overlayImageConfig: BatchSubtitleOverlayImageConfig
  captionStyle: BatchSubtitleCaptionStyle
  layoutPolicy: BatchSubtitleLayoutPolicy
}>({
  name: 'TikTok 批量字幕任务',
  titleRenderMode: 'overlay_image',
  sourceItems: [],
  titleText: '',
  titleItems: [],
  overlayImageConfig: defaultOverlayImageConfig(),
  captionStyle: defaultCaptionStyle(),
  layoutPolicy: defaultLayoutPolicy(),
})

const previewSource = computed(
  () => draft.sourceItems.find((item) => item.id === selectedPreviewId.value) || draft.sourceItems[0] || null,
)
const previewDynamicVideoUrl = computed(() => mediaUrl(previewFrame.value?.previewVideoPath))
const previewPosterUrl = computed(
  () => mediaUrl(previewFrame.value?.previewPosterPath || previewFrame.value?.previewImagePath),
)
const hasSources = computed(() => draft.sourceItems.length > 0)
const selectedPreviewIndex = computed(() =>
  draft.sourceItems.findIndex((item) => item.id === selectedPreviewId.value),
)
const visiblePreviewThumbs = computed(() =>
  draft.sourceItems.slice(previewThumbStart.value, previewThumbStart.value + previewThumbPageSize),
)
const previewThumbRemaining = computed(() =>
  Math.max(0, draft.sourceItems.length - (previewThumbStart.value + previewThumbPageSize)),
)
const canPreviewThumbPrev = computed(() => previewThumbStart.value > 0)
const canPreviewThumbNext = computed(
  () => previewThumbStart.value + previewThumbPageSize < draft.sourceItems.length,
)
const hasPreviewReady = computed(() => Boolean(previewSource.value && draft.titleText.trim()))
const successfulOutputs = computed(() =>
  outputs.value.filter((item) => item.renderStatus === 'success' && String(item.outputVideoPath || '').trim()),
)
const hasRenderedOutputs = computed(() => successfulOutputs.value.length > 0)
const visibleOutputs = computed(() => (showAllOutputs.value ? outputs.value : outputs.value.slice(0, 6)))
const visibleJobs = computed(() => {
  if (queueTab.value === 'processing') {
    return jobs.value.filter((item) => item.status === 'queued' || item.status === 'processing')
  }
  if (queueTab.value === 'completed') {
    return jobs.value.filter((item) => item.status === 'completed' || item.status === 'partial_failed')
  }
  return jobs.value
})
const selectedCloneCandidates = computed(() =>
  cloneProjects.value.filter((item) => selectedSourceIds.value.includes(item.id) && item.finalOutputPath),
)
const processingCount = computed(
  () => jobs.value.filter((item) => item.status === 'queued' || item.status === 'processing').length,
)
const completedCount = computed(
  () => jobs.value.filter((item) => item.status === 'completed' || item.status === 'partial_failed').length,
)
const selectedJob = computed(() => jobs.value.find((item) => item.id === selectedJobId.value) || null)
const selectedJobBatchSummary = computed(() => {
  const runtime = selectedJob.value?.batchRuntime
  if (!runtime) return null
  const batchSize = Math.max(1, Number(runtime.batchSize || 0))
  const totalBatches = Math.max(0, Number(runtime.totalBatches || 0))
  const completedBatches = Math.max(0, Number(runtime.completedBatches || 0))
  const nextSourceIndex = Math.max(0, Number(runtime.nextSourceIndex || 0))
  const totalSources = selectedJob.value?.sourceItems.length || 0
  const currentBatch = totalBatches > 0 ? Math.min(totalBatches, completedBatches + 1) : 0
  const rangeStart = totalSources ? Math.min(totalSources, nextSourceIndex + 1) : 0
  const rangeEnd = totalSources ? Math.min(totalSources, nextSourceIndex + batchSize) : 0
  const remaining = Math.max(0, totalSources - nextSourceIndex)
  return {
    batchSize,
    totalBatches,
    completedBatches,
    currentBatch,
    rangeStart,
    rangeEnd,
    remaining,
  }
})
const canPauseSelectedJob = computed(() => selectedJob.value?.status === 'processing')
const canResumeSelectedJob = computed(
  () => selectedJob.value?.status === 'paused' || selectedJob.value?.status === 'failed',
)
const canRetryFailedOnly = computed(() => {
  if (!selectedJob.value) return false
  return selectedJob.value.outputs.some((item) => item.renderStatus === 'failed')
})
const failedOutputs = computed(() => outputs.value.filter((item) => item.renderStatus === 'failed'))
const failedOutputSummary = computed(() =>
  failedOutputs.value
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      fileName: shortFileName(item.sourceVideoPath),
      reason: String(item.error || '渲染失败'),
    })),
)
const sourcePageCount = computed(() => Math.max(1, Math.ceil(draft.sourceItems.length / sourcePageSize)))
const sourcePageItems = computed(() => {
  const start = (sourcePage.value - 1) * sourcePageSize
  return draft.sourceItems.slice(start, start + sourcePageSize)
})
const sourcePageRange = computed(() => {
  if (!draft.sourceItems.length) return '0-0'
  const start = (sourcePage.value - 1) * sourcePageSize + 1
  const end = Math.min(draft.sourceItems.length, start + sourcePageSize - 1)
  return `${start}-${end}`
})
const canSourcePagePrev = computed(() => sourcePage.value > 1)
const canSourcePageNext = computed(() => sourcePage.value < sourcePageCount.value)
const sourceUsagePercent = computed(() => {
  if (!draft.sourceItems.length) return 0
  return Math.min(100, (sourcePageItems.value.length / sourcePageSize) * 100)
})
const stepStates = computed<Record<'source' | 'config' | 'preview' | 'render', StepState>>(() => ({
  source: hasSources.value ? 'done' : 'active',
  config: draft.titleText.trim() ? 'done' : hasSources.value ? 'active' : 'idle',
  preview: hasPreviewReady.value && !previewVideoError.value ? 'done' : hasSources.value ? 'active' : 'idle',
  render: hasRenderedOutputs.value ? 'done' : hasPreviewReady.value ? 'active' : 'idle',
}))
const queueSummary = computed(() => [
  { label: '草稿 / 全部任务', value: String(jobs.value.length).padStart(2, '0') },
  { label: '处理中', value: String(processingCount.value).padStart(2, '0') },
  { label: '成功输出', value: String(successfulOutputs.value.length).padStart(2, '0') },
])

watch(
  () => draft.sourceItems,
  (items) => {
    if (!items.length) {
      previewThumbStart.value = 0
      sourcePage.value = 1
      selectedPreviewId.value = ''
      return
    }
    const maxPage = Math.max(1, Math.ceil(items.length / sourcePageSize))
    if (sourcePage.value > maxPage) {
      sourcePage.value = maxPage
    }
    const maxStart = Math.max(0, items.length - previewThumbPageSize)
    if (previewThumbStart.value > maxStart) {
      previewThumbStart.value = maxStart
    }
    if (!items.some((item) => item.id === selectedPreviewId.value)) {
      selectedPreviewId.value = items[0].id
    }
  },
  { deep: true, immediate: true },
)

watch(
  () => ({
    sourceItems: draft.sourceItems.map((item) => item.id).join('|'),
    titleText: draft.titleText,
    fontName: draft.captionStyle.fontName,
    fontSize: draft.captionStyle.fontSize,
    fontColor: draft.captionStyle.fontColor,
    strokeColor: draft.captionStyle.strokeColor,
    strokeWidth: draft.captionStyle.strokeWidth,
    shadowColor: draft.captionStyle.shadowColor,
    shadowBlur: draft.captionStyle.shadowBlur,
    position: draft.captionStyle.position,
    safeMargin: draft.captionStyle.safeMargin,
    textAlign: draft.captionStyle.textAlign,
    maxLines: draft.captionStyle.maxLines,
    maxWidthRatio: draft.captionStyle.maxWidthRatio,
    bottomMargin: draft.captionStyle.bottomMargin,
  }),
  () => {
    draftDirty.value = true
  },
  { deep: true },
)

watch(
  () => selectedPreviewIndex.value,
  (index) => {
    if (index < 0) return
    if (index < previewThumbStart.value) {
      previewThumbStart.value = index
      return
    }
    if (index >= previewThumbStart.value + previewThumbPageSize) {
      previewThumbStart.value = Math.max(0, index - previewThumbPageSize + 1)
    }
  },
  { immediate: true },
)

watch(
  () => ({
    fontName: draft.captionStyle.fontName,
    fontSize: draft.captionStyle.fontSize,
    fontColor: draft.captionStyle.fontColor,
    strokeColor: draft.captionStyle.strokeColor,
    strokeWidth: draft.captionStyle.strokeWidth,
    shadowColor: draft.captionStyle.shadowColor,
    shadowBlur: draft.captionStyle.shadowBlur,
    position: draft.captionStyle.position,
    safeMargin: draft.captionStyle.safeMargin,
    textAlign: draft.captionStyle.textAlign,
    maxLines: draft.captionStyle.maxLines,
    maxWidthRatio: draft.captionStyle.maxWidthRatio,
    lineGap: draft.captionStyle.lineGap,
    bottomMargin: draft.captionStyle.bottomMargin,
  }),
  (style) => {
    draft.overlayImageConfig = {
      ...draft.overlayImageConfig,
      ...style,
    }
  },
  { deep: true, immediate: true },
)

watch(
  () => [
    selectedPreviewId.value,
    draft.titleText,
    draft.captionStyle.fontName,
    draft.captionStyle.fontSize,
    draft.captionStyle.fontColor,
    draft.captionStyle.strokeColor,
    draft.captionStyle.strokeWidth,
    draft.captionStyle.shadowColor,
    draft.captionStyle.shadowBlur,
    draft.captionStyle.position,
    draft.captionStyle.safeMargin,
    draft.captionStyle.textAlign,
    draft.captionStyle.maxLines,
    draft.captionStyle.maxWidthRatio,
    draft.captionStyle.lineGap,
    draft.captionStyle.bottomMargin,
  ],
  () => scheduleAccuratePreview(),
)

function mediaUrl(path?: string) {
  const text = String(path || '').trim()
  if (!text) return ''
  return `vg://file?path=${encodeURIComponent(text)}`
}

function shortFileName(path?: string) {
  const text = String(path || '').trim()
  if (!text) return '--'
  return text.split(/[\\/]/).filter(Boolean).pop() || text
}

function formatDuration(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--:--'
  const sec = Math.max(0, Math.round(value))
  const mm = String(Math.floor(sec / 60)).padStart(2, '0')
  const ss = String(sec % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function formatTime(value?: number) {
  if (!value) return '--'
  const date = new Date(value)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${d} ${hh}:${mm}`
}

function describeJobBatchRuntime(job: BatchSubtitleJob) {
  const runtime = job.batchRuntime
  if (!runtime) return '未启用批次调度'
  const totalBatches = Math.max(0, Number(runtime.totalBatches || 0))
  const completedBatches = Math.max(0, Number(runtime.completedBatches || 0))
  const nextSourceIndex = Math.max(0, Number(runtime.nextSourceIndex || 0))
  if (!totalBatches) return '等待批次启动'
  if (job.status === 'completed' || job.status === 'partial_failed') {
    return `已完成 ${completedBatches}/${totalBatches} 批`
  }
  return `第 ${Math.min(totalBatches, completedBatches + 1)}/${totalBatches} 批 · 下一批从第 ${nextSourceIndex + 1} 条开始`
}

function applyCaptionTemplatePreset(presetId: CaptionTemplatePresetId) {
  const preset = captionTemplatePresets.find((item) => item.id === presetId)
  if (!preset) return
  selectedTemplatePreset.value = preset.id
  draft.captionStyle = {
    ...draft.captionStyle,
    ...preset.style,
  }
  scheduleAccuratePreview()
}

function goPreviewThumbPrev() {
  if (!canPreviewThumbPrev.value) return
  previewThumbStart.value = Math.max(0, previewThumbStart.value - previewThumbPageSize)
}

function goPreviewThumbNext() {
  if (!canPreviewThumbNext.value) return
  const maxStart = Math.max(0, draft.sourceItems.length - previewThumbPageSize)
  previewThumbStart.value = Math.min(maxStart, previewThumbStart.value + previewThumbPageSize)
}

function goSourcePagePrev() {
  if (!canSourcePagePrev.value) return
  sourcePage.value -= 1
}

function goSourcePageNext() {
  if (!canSourcePageNext.value) return
  sourcePage.value += 1
}

function resolveJobStatusLabel(status: BatchSubtitleJob['status']) {
  if (status === 'processing') return '处理中'
  if (status === 'queued') return '排队中'
  if (status === 'completed') return '已完成'
  if (status === 'partial_failed') return '部分失败'
  if (status === 'failed') return '失败'
  return '草稿'
}

function buildTitleItems(): BatchSubtitleTitleItem[] {
  const text = String(draft.titleText || '').trim()
  return draft.sourceItems.map((item) => ({
    sourceItemId: item.id,
    text,
    updatedAt: Date.now(),
  }))
}

function buildPreviewSignature() {
  return JSON.stringify({
    sourceItemId: previewSource.value?.id || '',
    titleText: String(draft.titleText || '').trim(),
    previewMode: previewMode.value,
    titleRenderMode: draft.titleRenderMode,
    style: {
      fontName: draft.captionStyle.fontName,
      fontSize: draft.captionStyle.fontSize,
      fontColor: draft.captionStyle.fontColor,
      strokeColor: draft.captionStyle.strokeColor,
      strokeWidth: draft.captionStyle.strokeWidth,
      shadowColor: draft.captionStyle.shadowColor,
      shadowBlur: draft.captionStyle.shadowBlur,
      position: draft.captionStyle.position,
      safeMargin: draft.captionStyle.safeMargin,
      textAlign: draft.captionStyle.textAlign,
      maxLines: draft.captionStyle.maxLines,
      maxWidthRatio: draft.captionStyle.maxWidthRatio,
      lineGap: draft.captionStyle.lineGap,
      bottomMargin: draft.captionStyle.bottomMargin,
    },
  })
}

async function refreshAccuratePreview() {
  if (!previewSource.value || !draft.titleText.trim()) {
    previewFrame.value = null
    previewFrameLoading.value = false
    lastAppliedPreviewSignature = ''
    return
  }
  const signature = buildPreviewSignature()
  if (previewFrameLoading.value) {
    previewQueued = true
    return
  }
  if (signature === lastAppliedPreviewSignature && previewFrame.value && !previewVideoError.value) {
    previewFrameLoading.value = false
    return
  }
  const requestToken = ++previewRequestToken
  previewFrameLoading.value = true
  previewQueued = false
  try {
    const result = await webApiClient.previewBatchSubtitleFrame({
      sourceItem: previewSource.value,
      subtitleMode: 'static_title',
      titleConfig: {
        strategy: 'single_for_all',
        singleText: draft.titleText,
        titlePool: draft.titleText ? [draft.titleText] : [],
      },
      titleItems: buildTitleItems(),
      titleRenderMode: draft.titleRenderMode,
      overlayImageConfig: draft.overlayImageConfig,
      styleConfig: {
        ...draft.captionStyle,
        lineMode: 'multi',
      },
      captionStyle: draft.captionStyle,
      layoutPolicy: draft.layoutPolicy,
      includeVideo: previewMode.value === 'video',
    })
    if (requestToken !== previewRequestToken) return
    previewFrame.value = result
    previewVideoError.value = ''
    lastAppliedPreviewSignature = signature
  } catch (error: any) {
    if (requestToken !== previewRequestToken) return
    previewFrame.value = null
    previewVideoError.value = error?.message ?? String(error)
  } finally {
    if (requestToken !== previewRequestToken) return
    previewFrameLoading.value = false
    if (previewQueued) {
      previewQueued = false
      scheduleAccuratePreview()
    }
  }
}

function scheduleAccuratePreview() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    void refreshAccuratePreview()
  }, 560)
}

function setPreviewMode(mode: PreviewMode) {
  if (previewMode.value === mode) return
  previewMode.value = mode
  if (mode === 'fast' && previewFrame.value) {
    previewFrame.value = {
      ...previewFrame.value,
      previewVideoPath: undefined,
    }
  }
  lastAppliedPreviewSignature = ''
  scheduleAccuratePreview()
}

async function refreshFontOptions() {
  void webApiClient
}

async function ensurePluginReady() {
  const plugin = await webApiClient.getPlugin('video-batch-subtitle')
  if (plugin.status !== 'installed') await webApiClient.installPlugin('video-batch-subtitle')
  const latest = await webApiClient.getPlugin('video-batch-subtitle')
  if (!latest.enabled) await webApiClient.enablePlugin('video-batch-subtitle')
}

async function loadAll() {
  loading.value = true
  errorText.value = ''
  try {
    const [jobItems, outputItems, projects] = await Promise.all([
      webApiClient.listBatchSubtitleJobs(),
      webApiClient.listBatchSubtitleOutputs(),
      webApiClient.listCloneProjects(),
    ])
    jobs.value = jobItems
    outputs.value = outputItems
    cloneProjects.value = projects.filter((item) => item.finalOutputPath)
    if (!selectedJobId.value && !draftDirty.value && !draft.sourceItems.length && jobItems[0]) loadJobIntoDraft(jobItems[0])
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function pickUploadVideos() {
  const picked = await window.api.pickFiles({
    title: '选择视频',
    filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'm4v', 'webm'] }],
    multiple: true,
  })
  const unique = Array.from(new Set((picked || []).map((item: string) => String(item).trim()).filter(Boolean)))
  if (!unique.length) return
  const items = await Promise.all(
    unique.map(async (filePath) => {
      let info: any = null
      try {
        info = await window.api.media.getInfo(filePath)
      } catch {
        info = null
      }
      return {
        id: `upload-${filePath}`,
        sourceType: 'upload' as const,
        sourceVideoPath: filePath,
        fileName: shortFileName(filePath),
        coverImagePath: info?.thumbnailPath || undefined,
        durationSec: info?.durationSec,
        width: info?.width,
        height: info?.height,
      } satisfies BatchSubtitleSourceItem
    }),
  )
  draft.sourceItems = [
    ...draft.sourceItems,
    ...items.filter((item) => !draft.sourceItems.some((entry) => entry.id === item.id)),
  ]
  if (items[0]) selectedPreviewId.value = items[0].id
  selectedJobId.value = ''
  sourcePage.value = sourcePageCount.value
  notice.value = `已添加 ${items.length} 条本地素材。`
}

function startQueuePolling() {
  if (queuePollTimer) clearInterval(queuePollTimer)
  queuePollTimer = setInterval(() => {
    const hasActiveJob = jobs.value.some((item) => item.status === 'processing' || item.status === 'queued' || item.status === 'paused')
    if (!hasActiveJob) return
    void loadAll()
  }, 3500)
}

function toggleCloneSource(project: CloneProjectSummary) {
  const id = project.id
  if (selectedSourceIds.value.includes(id)) {
    selectedSourceIds.value = selectedSourceIds.value.filter((item) => item !== id)
  } else {
    selectedSourceIds.value = [...selectedSourceIds.value, id]
  }
}

function applyCloneSources() {
  const sourceItems = selectedCloneCandidates.value.map(
    (item) =>
      ({
        id: `clone-${item.id}`,
        sourceType: 'clone_final',
        sourceVideoPath: item.finalOutputPath,
        sourceProjectId: item.id,
        sourceProjectTitle: item.title,
        fileName: item.title || item.referenceVideoName || item.id,
        coverImagePath: item.coverAssetPath || undefined,
      }) satisfies BatchSubtitleSourceItem,
  )
  const uploadItems = draft.sourceItems.filter((item) => item.sourceType === 'upload')
  draft.sourceItems = [...uploadItems, ...sourceItems]
  if (sourceItems[0]) selectedPreviewId.value = sourceItems[0].id
  selectedJobId.value = ''
  sourcePage.value = sourcePageCount.value
  notice.value = `已加入 ${sourceItems.length} 条成片库素材。`
  errorText.value = ''
}

function removeSourceItem(id: string) {
  draft.sourceItems = draft.sourceItems.filter((item) => item.id !== id)
}

async function runGenerateTitles() {
  if (!aiPrompt.value.trim()) {
    errorText.value = '请先输入标题生成提示词。'
    return
  }
  generatingTitles.value = true
  errorText.value = ''
  try {
    const result = await webApiClient.generateBatchSubtitleTitles({
      prompt: aiPrompt.value.trim(),
      count: 1,
      contentLanguage: 'zh-CN',
    })
    draft.titleText = result.titles[0] || ''
    notice.value = 'AI 标题生成完成。'
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    generatingTitles.value = false
  }
}

async function saveCurrentDraft() {
  if (!draft.sourceItems.length) {
    errorText.value = '请先添加至少一条素材视频。'
    return
  }
  const payload = {
    name: draft.name,
    subtitleMode: 'static_title' as const,
    subtitleSource: 'manual' as const,
    exportEngine: 'ass_fallback' as const,
    titleRenderMode: draft.titleRenderMode,
    sourceItems: draft.sourceItems,
    titleConfig: {
      strategy: 'single_for_all' as const,
      singleText: draft.titleText,
      titlePool: draft.titleText ? [draft.titleText] : [],
    },
    titleItems: buildTitleItems(),
    overlayImageConfig: draft.overlayImageConfig,
    styleConfig: {
      ...draft.captionStyle,
      lineMode: 'multi' as const,
    },
    captionStyle: draft.captionStyle,
    layoutPolicy: draft.layoutPolicy,
  }
  try {
    const result = selectedJobId.value
      ? await webApiClient.updateBatchSubtitleDraft(selectedJobId.value, payload)
      : await webApiClient.createBatchSubtitleJob(payload)
    loadJobIntoDraft(result)
    draftDirty.value = false
    notice.value = '当前草稿已保存。'
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

async function renderBatch() {
  if (!draft.sourceItems.length) {
    errorText.value = '请先添加素材视频。'
    return
  }
  if (!draft.titleText.trim()) {
    errorText.value = '请先输入标题内容。'
    return
  }
  runningJob.value = true
  errorText.value = ''
  notice.value = '正在准备批量渲染任务…'
  try {
    if (!selectedJobId.value) await saveCurrentDraft()
    if (!selectedJobId.value) {
      errorText.value = '保存任务失败，未生成可执行任务，请先点击保存配置后重试。'
      return
    }
    await webApiClient.updateBatchSubtitleDraft(selectedJobId.value, {
      sourceItems: draft.sourceItems,
      subtitleSource: 'manual',
      exportEngine: 'ass_fallback',
      titleRenderMode: draft.titleRenderMode,
      titleItems: buildTitleItems(),
      overlayImageConfig: draft.overlayImageConfig,
      captionStyle: draft.captionStyle,
      layoutPolicy: draft.layoutPolicy,
      subtitleMode: 'static_title',
      titleConfig: {
        strategy: 'single_for_all',
        singleText: draft.titleText,
        titlePool: draft.titleText ? [draft.titleText] : [],
      },
    })
    const result = await webApiClient.runBatchSubtitleJob(selectedJobId.value)
    loadJobIntoDraft(result)
    draftDirty.value = false
    notice.value = `批量渲染完成，共输出 ${result.outputCount} 条结果。`
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    runningJob.value = false
  }
}

async function pauseCurrentJob() {
  if (!selectedJobId.value) return
  controllingJob.value = true
  errorText.value = ''
  try {
    const result = await webApiClient.pauseBatchSubtitleJob(selectedJobId.value)
    loadJobIntoDraft(result)
    notice.value = '任务已暂停，当前批次结束后停止继续处理。'
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    controllingJob.value = false
  }
}

async function resumeCurrentJob(retryFailedOnly = false) {
  if (!selectedJobId.value) return
  runningJob.value = true
  controllingJob.value = true
  errorText.value = ''
  try {
    const result = await webApiClient.resumeBatchSubtitleJob(selectedJobId.value, { retryFailedOnly })
    loadJobIntoDraft(result)
    notice.value = retryFailedOnly ? '失败项重试完成。' : '任务已继续执行。'
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    runningJob.value = false
    controllingJob.value = false
  }
}

async function controlQueueJob(job: BatchSubtitleJob, action: 'pause' | 'resume' | 'retry_failed') {
  controllingJob.value = true
  errorText.value = ''
  try {
    const result =
      action === 'pause'
        ? await webApiClient.pauseBatchSubtitleJob(job.id)
        : await webApiClient.resumeBatchSubtitleJob(job.id, { retryFailedOnly: action === 'retry_failed' })
    if (selectedJobId.value === job.id) {
      loadJobIntoDraft(result)
    }
    notice.value =
      action === 'pause'
        ? '队列任务已暂停。'
        : action === 'retry_failed'
          ? '队列任务失败项已开始重试。'
          : '队列任务已继续执行。'
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    controllingJob.value = false
  }
}

async function pushToGeelark() {
  if (!selectedJobId.value) {
    errorText.value = '请先选择一个已渲染完成的任务。'
    return
  }
  pushingToGeelark.value = true
  errorText.value = ''
  try {
    const result = await webApiClient.pushBatchSubtitleOutputsToGeelarkPool(selectedJobId.value)
    notice.value = `已将 ${result.outputCount} 条结果加入 GeeLark 发布池。`
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    pushingToGeelark.value = false
  }
}

function loadJobIntoDraft(job: BatchSubtitleJob) {
  draft.name = job.name
  draft.titleRenderMode = job.titleRenderMode || 'overlay_image'
  draft.sourceItems = [...job.sourceItems]
  draft.titleText = job.titleConfig?.singleText || ''
  draft.titleItems = [...(job.titleItems || [])]
  draft.overlayImageConfig = { ...defaultOverlayImageConfig(), ...(job.overlayImageConfig || {}) }
  draft.captionStyle = { ...defaultCaptionStyle(), ...(job.captionStyle || {}) }
  draft.layoutPolicy = { ...defaultLayoutPolicy(), ...(job.layoutPolicy || {}) }
  selectedJobId.value = job.id
  draftDirty.value = false
  if (job.sourceItems[0]) selectedPreviewId.value = job.sourceItems[0].id
}

async function openOutputVideo(item: BatchSubtitleOutputItem) {
  const outputPath = String(item.outputVideoPath || '').trim()
  if (!outputPath) return
  await window.api.shell.openPath(outputPath)
}

async function showOutputInFolder(item: BatchSubtitleOutputItem) {
  const outputPath = String(item.outputVideoPath || '').trim()
  if (!outputPath) return
  await window.api.shell.showItemInFolder(outputPath)
}

function openGuide() {
  notice.value =
    '工作顺序：添加素材 -> 配置标题与样式 -> 预览真实叠加效果 -> 保存草稿 -> 批量渲染 -> 推入 GeeLark。'
}

onMounted(async () => {
  await ensurePluginReady()
  await refreshFontOptions()
  await loadAll()
  startQueuePolling()
  scheduleAccuratePreview()
})

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
  if (queuePollTimer) clearInterval(queuePollTimer)
})
</script>

<template>
  <div class="subtitle-workbench-page">
    <section class="hero-panel glass-panel hero-panel--compact">
      <div class="hero-copy hero-copy--compact">
        <h1>视频批量加字幕</h1>
        <p>批量导入素材，实时预览字幕效果并输出可发布成片。</p>
      </div>

      <div class="hero-actions hero-actions--compact">
        <div class="hero-kpis hero-kpis--compact">
          <div v-for="item in queueSummary" :key="item.label" class="hero-kpi hero-kpi--compact">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </div>
        </div>
        <button class="ghost-button ghost-button--compact" type="button" @click="openGuide">
          <FolderOpen class="h-4 w-4" />
          <span>教程与示例</span>
        </button>
      </div>
    </section>

    <section class="stepbar-panel glass-panel stepbar-panel--compact">
      <button class="step-chip step-chip--compact" :class="[`is-${stepStates.source}`]" type="button">
        <span class="step-chip__index">1</span>
        <span class="step-chip__copy">
          <strong>选择素材</strong>
        </span>
        <CheckCircle2 v-if="stepStates.source === 'done'" class="step-chip__done h-4 w-4" />
      </button>
      <button class="step-chip step-chip--compact" :class="[`is-${stepStates.config}`]" type="button">
        <span class="step-chip__index">2</span>
        <span class="step-chip__copy">
          <strong>配置标题</strong>
        </span>
        <CheckCircle2 v-if="stepStates.config === 'done'" class="step-chip__done h-4 w-4" />
      </button>
      <button class="step-chip step-chip--compact" :class="[`is-${stepStates.preview}`]" type="button">
        <span class="step-chip__index">3</span>
        <span class="step-chip__copy">
          <strong>实时预览</strong>
        </span>
        <CheckCircle2 v-if="stepStates.preview === 'done'" class="step-chip__done h-4 w-4" />
      </button>
      <button class="step-chip step-chip--compact" :class="[`is-${stepStates.render}`]" type="button">
        <span class="step-chip__index">4</span>
        <span class="step-chip__copy">
          <strong>批量渲染</strong>
        </span>
        <CheckCircle2 v-if="stepStates.render === 'done'" class="step-chip__done h-4 w-4" />
      </button>
    </section>

    <div v-if="notice" class="page-message page-message--success">{{ notice }}</div>
    <div v-if="errorText" class="page-message page-message--error">{{ errorText }}</div>

    <section class="workspace-grid">
      <article class="glass-panel work-card sources-card">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Source Intake</span>
            <strong>素材选择</strong>
          </div>
          <span class="section-note">支持大批量导入，首屏仅展示当前页素材</span>
        </div>

        <div class="segmented-tabs">
          <button :class="{ 'is-active': sourceTab === 'upload' }" type="button" @click="sourceTab = 'upload'">
            本地上传
          </button>
          <button :class="{ 'is-active': sourceTab === 'clone' }" type="button" @click="sourceTab = 'clone'">
            成片库选择
          </button>
        </div>

        <div v-if="sourceTab === 'upload'" class="upload-zone" @click="pickUploadVideos">
          <div class="upload-zone__icon">
            <Upload class="h-7 w-7" />
          </div>
          <strong>点击或拖拽视频到这里</strong>
          <span>支持 mp4 / mov / m4v / webm，Windows 开发与 Linux 部署同链路可用</span>
        </div>

        <div v-else class="clone-picker">
          <div class="picker-tip">
            <p>从现有成片库复用素材，适合批量做统一封面标题字幕。</p>
            <button class="minor-button minor-button--full" type="button" @click="applyCloneSources">
              应用已选成片到当前任务
            </button>
          </div>
          <div class="clone-picker__list">
            <button
              v-for="project in cloneProjects"
              :key="project.id"
              class="clone-picker__item"
              :class="{ 'is-selected': selectedSourceIds.includes(project.id) }"
              type="button"
              @click="toggleCloneSource(project)"
            >
              <img v-if="mediaUrl(project.coverAssetPath)" :src="mediaUrl(project.coverAssetPath)" :alt="project.title" />
              <div class="clone-picker__copy">
                <strong>{{ project.title }}</strong>
                <small>{{ project.referenceVideoName || '未命名成片' }}</small>
              </div>
            </button>
          </div>
        </div>

        <div class="card-head">
          <strong>已选视频 {{ draft.sourceItems.length }}</strong>
          <button class="text-button" type="button" @click="draft.sourceItems = []; selectedPreviewId = ''">
            清空
          </button>
        </div>

        <div class="sources-list">
          <button
            v-for="item in sourcePageItems"
            :key="item.id"
            class="source-list-item"
            :class="{ 'is-active': selectedPreviewId === item.id }"
            type="button"
            @click="selectedPreviewId = item.id"
          >
            <img
              v-if="mediaUrl(item.coverImagePath || item.sourceVideoPath)"
              :src="mediaUrl(item.coverImagePath || item.sourceVideoPath)"
              :alt="item.fileName"
            />
            <div class="source-list-item__copy">
              <strong>{{ item.fileName }}</strong>
              <small>{{ formatDuration(item.durationSec) }} · {{ item.width || 1080 }}×{{ item.height || 1920 }}</small>
            </div>
            <span class="source-list-item__remove" @click.stop="removeSourceItem(item.id)">
              <X class="h-4 w-4" />
            </span>
          </button>
        </div>

        <div v-if="draft.sourceItems.length > sourcePageSize" class="source-pager">
          <div class="source-pager__meta">
            <span>当前显示 {{ sourcePageRange }}</span>
            <strong>第 {{ sourcePage }} / {{ sourcePageCount }} 页</strong>
          </div>
          <div class="source-pager__actions">
            <button class="toolbar-pill" type="button" :disabled="!canSourcePagePrev" @click="goSourcePagePrev">
              上一页
            </button>
            <button class="toolbar-pill" type="button" :disabled="!canSourcePageNext" @click="goSourcePageNext">
              下一页
            </button>
          </div>
        </div>

        <div class="capacity-card">
          <div class="capacity-head">
            <span>素材队列概览</span>
            <strong>{{ draft.sourceItems.length }} 条</strong>
          </div>
          <div class="sources-progress__bar">
            <div class="sources-progress__fill" :style="{ width: `${sourceUsagePercent}%` }"></div>
          </div>
          <p>预览与列表都只聚焦当前页和当前选中项，适合几百条素材连续排队渲染，避免界面一次性吃满资源。</p>
          <div v-if="selectedJobBatchSummary" class="batch-runtime-card">
            <div class="batch-runtime-card__head">
              <span>批次进度</span>
              <strong>{{ selectedJobBatchSummary.totalBatches ? `${selectedJobBatchSummary.currentBatch} / ${selectedJobBatchSummary.totalBatches}` : '--' }}</strong>
            </div>
            <div class="batch-runtime-card__meta">
              <span>当前范围 {{ selectedJobBatchSummary.rangeStart }}-{{ selectedJobBatchSummary.rangeEnd }}</span>
              <span>剩余 {{ selectedJobBatchSummary.remaining }} 条</span>
              <span>每批 {{ selectedJobBatchSummary.batchSize }} 条</span>
            </div>
          </div>
        </div>
      </article>

      <article class="glass-panel work-card preview-card">
        <div class="card-head">
          <div>
            <span class="section-kicker">Live Preview</span>
            <strong>9:16 预览舞台</strong>
          </div>
          <div class="preview-toolbar">
            <span class="toolbar-pill is-active">9:16</span>
            <button class="toolbar-pill" :class="{ 'is-active': previewMode === 'fast' }" type="button" @click="setPreviewMode('fast')">
              快速预览
            </button>
            <button class="toolbar-pill" :class="{ 'is-active': previewMode === 'video' }" type="button" @click="setPreviewMode('video')">
              真实视频预览
            </button>
          </div>
        </div>

        <div class="preview-stage">
          <div class="preview-stage__frame">
            <video
              v-if="previewMode === 'video' && previewDynamicVideoUrl"
              :key="previewFrame?.generatedAt"
              :src="previewDynamicVideoUrl"
              :poster="previewPosterUrl || undefined"
              controls
              preload="metadata"
              class="preview-stage__video"
            ></video>
            <img
              v-else-if="previewFrame?.previewImagePath"
              :src="mediaUrl(previewFrame.previewImagePath)"
              alt="字幕预览"
              class="preview-stage__video"
            />
            <div v-else class="preview-stage__empty">
              <strong>等待生成预览</strong>
              <span>先选中一个视频并输入标题，默认只生成轻量静帧预览，减少机器压力。</span>
            </div>
            <div v-if="previewFrameLoading" class="preview-stage__loading">
              <LoaderCircle class="h-4 w-4 animate-spin" />
              <span>{{ previewMode === 'video' ? '正在生成真实视频预览…' : '正在生成快速预览…' }}</span>
            </div>
          </div>
        </div>

        <div class="preview-playerbar">
          <Play class="h-4 w-4" />
          <span>{{ previewSource ? '00:03' : '--:--' }} / {{ formatDuration(previewSource?.durationSec) }}</span>
          <div class="preview-playerbar__track">
            <div class="preview-playerbar__progress"></div>
          </div>
        </div>

        <div class="preview-strip">
          <button class="preview-strip__nav" type="button" :disabled="!canPreviewThumbPrev" @click="goPreviewThumbPrev">
            ‹
          </button>
          <div class="preview-thumbs">
            <button
              v-for="item in visiblePreviewThumbs"
              :key="item.id"
              class="preview-thumbs__item"
              :class="{ 'is-active': selectedPreviewId === item.id }"
              type="button"
              @click="selectedPreviewId = item.id"
            >
              <img
                v-if="mediaUrl(item.coverImagePath || item.sourceVideoPath)"
                :src="mediaUrl(item.coverImagePath || item.sourceVideoPath)"
                :alt="item.fileName"
              />
              <span class="preview-thumbs__overlay"></span>
              <span class="preview-thumbs__label">{{ shortFileName(item.fileName) }}</span>
            </button>
            <button v-if="previewThumbRemaining > 0" class="preview-thumbs__more" type="button" @click="goPreviewThumbNext">
              +{{ previewThumbRemaining }}
            </button>
          </div>
          <button class="preview-strip__nav" type="button" :disabled="!canPreviewThumbNext" @click="goPreviewThumbNext">
            ›
          </button>
        </div>

        <div class="preview-meta">
          <div>
            <span class="section-kicker">Preview Status</span>
            <strong>{{ previewSource?.fileName || '尚未选择视频' }}</strong>
          </div>
          <p>{{ previewMode === 'video' ? '当前为真实视频预览，仅在手动切换后生成，适合确认最终运动与封装效果。' : '当前为快速预览，优先保证大批量任务下的页面流畅度。' }}</p>
        </div>

        <div v-if="previewVideoError" class="preview-error">{{ previewVideoError }}</div>

        <div class="preview-footer">
          <div class="preview-footer__actions">
            <button class="minor-button" type="button" @click="saveCurrentDraft">保存配置</button>
            <button class="minor-button" type="button" :disabled="!canPauseSelectedJob || controllingJob" @click="pauseCurrentJob">
              暂停
            </button>
            <button class="minor-button" type="button" :disabled="!canResumeSelectedJob || controllingJob" @click="resumeCurrentJob(false)">
              继续
            </button>
            <button class="minor-button" type="button" :disabled="!canRetryFailedOnly || controllingJob" @click="resumeCurrentJob(true)">
              重试失败
            </button>
          </div>
          <button class="primary-button" type="button" :disabled="runningJob" @click="renderBatch">
            <LoaderCircle v-if="runningJob" class="h-4 w-4 animate-spin" />
            <Sparkles v-else class="h-4 w-4" />
            <span>{{ runningJob ? '批量渲染中…' : `开始批量渲染（${draft.sourceItems.length || 0} 条）` }}</span>
          </button>
        </div>
      </article>

      <article class="glass-panel work-card config-card">
        <div class="card-head">
          <div>
            <span class="section-kicker">Caption Control</span>
            <strong>标题与样式面板</strong>
          </div>
        </div>

        <div class="segmented-tabs">
          <button :class="{ 'is-active': rightTab === 'content' }" type="button" @click="rightTab = 'content'">
            字幕内容
          </button>
          <button :class="{ 'is-active': rightTab === 'style' }" type="button" @click="rightTab = 'style'">
            样式设置
          </button>
        </div>

        <template v-if="rightTab === 'content'">
          <section class="form-section">
            <div class="section-heading">
              <div>
                <span class="section-kicker">Strategy</span>
                <strong>标题策略</strong>
              </div>
            </div>
            <div class="strategy-grid">
              <button class="strategy-card is-active" type="button">
                <strong>单标题应用全部</strong>
                <small>适合批量电商素材，统一表达、统一风格、统一输出。</small>
              </button>
              <button class="strategy-card" type="button" disabled>
                <strong>随机标题池</strong>
                <small>本轮保留入口，不作为主链路信息架构重点。</small>
              </button>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <div>
                <span class="section-kicker">Title Content</span>
                <strong>标题文案</strong>
              </div>
              <span class="section-note">{{ draft.titleText.length }} / 100</span>
            </div>
            <textarea
              v-model="draft.titleText"
              class="dark-textarea"
              placeholder="旅行的意义&#10;就是去更美的地方 😌"
            ></textarea>
            <div class="action-row">
              <button class="minor-button" type="button" :disabled="generatingTitles" @click="runGenerateTitles">
                <LoaderCircle v-if="generatingTitles" class="h-4 w-4 animate-spin" />
                <Sparkles v-else class="h-4 w-4" />
                <span>{{ generatingTitles ? 'AI 生成中…' : 'AI 生成文案' }}</span>
              </button>
              <button class="minor-button" type="button" @click="draft.titleText += ' ✨'">插入强调符号</button>
              <button class="minor-button" type="button" @click="draft.titleText += '\n点击收藏同款'">追加转化尾句</button>
            </div>
            <input
              v-model="aiPrompt"
              class="dark-input"
              type="text"
              placeholder="输入 AI 提示词，例如：TikTok 电商饰品展示、情绪感文案、适合竖屏封面大字"
            />
          </section>

          <section class="form-section">
            <div class="section-heading">
              <div>
                <span class="section-kicker">Render Mode</span>
                <strong>当前渲染模式</strong>
              </div>
            </div>
            <div class="mode-pills">
              <button type="button" class="is-active">透明图层贴片</button>
              <button type="button" class="is-active">预览与导出一致</button>
            </div>
            <p class="helper-copy">
              当前主打静态标题批量贴片，优先保证 Windows 开发预览与 Linux 导出的一致性。
            </p>
          </section>
        </template>

        <template v-else>
          <section class="form-section">
            <div class="section-heading">
              <div>
                <span class="section-kicker">Typeface</span>
                <strong>字体与模板</strong>
              </div>
            </div>

            <div class="template-preset-grid">
              <button
                v-for="preset in captionTemplatePresets"
                :key="preset.id"
                class="template-preset"
                :class="{ 'is-active': selectedTemplatePreset === preset.id }"
                type="button"
                @click="applyCaptionTemplatePreset(preset.id)"
              >
                <strong>{{ preset.name }}</strong>
                <span>{{ preset.summary }}</span>
              </button>
            </div>
            <p class="helper-copy">这 3 套是偏热门 TikTok 标题的安全款：种草感、强卖点、商务转化。静态标题现已统一走 React + Remotion 渲染。</p>
          </section>

          <section class="form-section">
            <div class="form-grid form-grid--triple">
              <label class="field-block field-block--wide">
                <span>字体</span>
                <input v-model="draft.captionStyle.fontName" class="dark-input" type="text" placeholder="例如：Noto Sans SC" />
              </label>
              <label class="field-block">
                <span>字号</span>
                <input v-model.number="draft.captionStyle.fontSize" class="dark-input" type="number" min="18" max="120" />
              </label>
              <label class="field-block">
                <span>描边</span>
                <input v-model.number="draft.captionStyle.strokeWidth" class="dark-input" type="number" min="0" max="12" />
              </label>
            </div>

            <div class="form-grid form-grid--dual">
              <label class="field-block">
                <span>文字颜色</span>
                <div class="color-field">
                  <input v-model="draft.captionStyle.fontColor" class="dark-input dark-input--text" type="text" />
                  <input v-model="draft.captionStyle.fontColor" class="dark-input dark-input--color" type="color" />
                </div>
              </label>
              <label class="field-block">
                <span>描边颜色</span>
                <div class="color-field">
                  <input v-model="draft.captionStyle.strokeColor" class="dark-input dark-input--text" type="text" />
                  <input v-model="draft.captionStyle.strokeColor" class="dark-input dark-input--color" type="color" />
                </div>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-grid form-grid--dual">
              <label class="field-block">
                <span>阴影颜色</span>
                <div class="color-field">
                  <input v-model="draft.captionStyle.shadowColor" class="dark-input dark-input--text" type="text" />
                  <input v-model="draft.captionStyle.shadowColor" class="dark-input dark-input--color" type="color" />
                </div>
              </label>
              <label class="field-block">
                <span>阴影模糊</span>
                <input v-model.number="draft.captionStyle.shadowBlur" class="dark-input" type="number" min="0" max="40" />
              </label>
            </div>

            <div class="form-grid form-grid--quad">
              <label class="field-block">
                <span>位置</span>
                <select v-model="draft.captionStyle.position" class="dark-input">
                  <option value="top">顶部</option>
                  <option value="center">居中</option>
                  <option value="bottom">底部</option>
                </select>
              </label>
              <label class="field-block">
                <span>安全边距</span>
                <input v-model.number="draft.captionStyle.safeMargin" class="dark-input" type="number" min="0" max="40" />
              </label>
              <label class="field-block">
                <span>最大行数</span>
                <input v-model.number="draft.captionStyle.maxLines" class="dark-input" type="number" min="1" max="6" />
              </label>
              <label class="field-block">
                <span>对齐方式</span>
                <div class="align-segment">
                  <button type="button" :class="{ 'is-active': draft.captionStyle.textAlign === 'left' }" @click="draft.captionStyle.textAlign = 'left'">
                    左
                  </button>
                  <button type="button" :class="{ 'is-active': draft.captionStyle.textAlign === 'center' }" @click="draft.captionStyle.textAlign = 'center'">
                    中
                  </button>
                  <button type="button" :class="{ 'is-active': draft.captionStyle.textAlign === 'right' }" @click="draft.captionStyle.textAlign = 'right'">
                    右
                  </button>
                </div>
              </label>
            </div>

            <div class="form-grid form-grid--dual">
              <label class="field-block">
                <span>最大宽度比例</span>
                <input v-model.number="draft.captionStyle.maxWidthRatio" class="dark-input" type="number" min="0.4" max="0.92" step="0.02" />
              </label>
              <label class="field-block">
                <span>底部偏移</span>
                <input v-model.number="draft.captionStyle.bottomMargin" class="dark-input" type="number" min="48" max="600" />
              </label>
            </div>
          </section>
        </template>
      </article>
    </section>

    <section class="bottom-grid">
      <article class="glass-panel work-card queue-card">
        <div class="card-head">
          <div>
            <span class="section-kicker">Render Queue</span>
            <strong>任务队列</strong>
          </div>
          <div class="segmented-tabs segmented-tabs--queue">
            <button :class="{ 'is-active': queueTab === 'all' }" type="button" @click="queueTab = 'all'">
              全部 {{ jobs.length }}
            </button>
            <button :class="{ 'is-active': queueTab === 'processing' }" type="button" @click="queueTab = 'processing'">
              处理中 {{ processingCount }}
            </button>
            <button :class="{ 'is-active': queueTab === 'completed' }" type="button" @click="queueTab = 'completed'">
              已完成 {{ completedCount }}
            </button>
          </div>
        </div>

        <div class="queue-table queue-table--cards">
          <article v-for="job in visibleJobs" :key="job.id" class="queue-card-item">
            <div class="queue-card-item__top">
              <div class="queue-card-item__title">
                <strong>{{ job.name }}</strong>
                <small>{{ job.titleConfig?.singleText ? '单标题应用全部' : job.subtitleMode }}</small>
              </div>
              <em class="status-chip" :class="`status-chip--${job.status}`">{{ resolveJobStatusLabel(job.status) }}</em>
            </div>

            <div class="queue-card-item__meta">
              <span>素材 {{ job.sourceItems.length }}</span>
              <span>输出 {{ job.outputCount }} / {{ job.sourceItems.length }}</span>
              <span>{{ formatTime(job.createdAt) }}</span>
            </div>

            <div class="queue-card-item__progress">
              <div class="progress-cell">
                <div class="progress-cell__bar">
                  <div class="progress-cell__fill" :style="{ width: `${job.progress || 0}%` }"></div>
                </div>
                <strong>{{ job.progress || 0 }}%</strong>
              </div>
              <small class="queue-batch-note">{{ describeJobBatchRuntime(job) }}</small>
            </div>

            <div class="queue-card-item__actions">
              <button class="row-action" type="button" @click="loadJobIntoDraft(job)">载入</button>
              <button class="row-action" type="button" :disabled="job.status !== 'processing' || controllingJob" @click="controlQueueJob(job, 'pause')">
                暂停
              </button>
              <button class="row-action" type="button" :disabled="!(job.status === 'paused' || job.status === 'failed') || controllingJob" @click="controlQueueJob(job, 'resume')">
                继续
              </button>
              <button
                class="row-action"
                type="button"
                :disabled="!job.outputs.some((item) => item.renderStatus === 'failed') || controllingJob"
                @click="controlQueueJob(job, 'retry_failed')"
              >
                重试失败
              </button>
            </div>
          </article>
        </div>
      </article>

      <article class="glass-panel work-card results-card">
        <div class="card-head">
          <div>
            <span class="section-kicker">Outputs</span>
            <strong>输出结果</strong>
          </div>
          <button class="text-button" type="button" @click="showAllOutputs = !showAllOutputs">
            {{ showAllOutputs ? '收起' : '全部查看' }}
          </button>
        </div>

        <div class="results-strip">
          <article
            v-for="item in visibleOutputs"
            :key="item.id"
            class="result-thumb"
            :class="{ 'is-failed': item.renderStatus === 'failed' }"
          >
            <div class="result-thumb__media">
              <video
                v-if="item.renderStatus === 'success' && mediaUrl(item.outputVideoPath)"
                :src="mediaUrl(item.outputVideoPath)"
                muted
                playsinline
                preload="metadata"
              ></video>
              <img
                v-else-if="mediaUrl(item.coverImagePath || item.outputVideoPath || item.sourceVideoPath)"
                :src="mediaUrl(item.coverImagePath || item.outputVideoPath || item.sourceVideoPath)"
                :alt="item.selectedTitle || '输出结果'"
              />
              <span class="result-thumb__badge" :class="{ 'is-failed': item.renderStatus === 'failed' }">
                {{ item.renderStatus === 'success' ? '视频成片' : '失败' }}
              </span>
            </div>
            <div class="result-thumb__copy">
              <strong>{{ shortFileName(item.outputVideoPath || item.sourceVideoPath) }}</strong>
              <small>{{ item.selectedTitle || '未设置标题' }}</small>
            </div>
            <div class="result-thumb__actions">
              <button class="row-action" type="button" :disabled="item.renderStatus !== 'success'" @click="openOutputVideo(item)">
                查看视频
              </button>
              <button class="row-action" type="button" :disabled="item.renderStatus !== 'success'" @click="showOutputInFolder(item)">
                打开目录
              </button>
            </div>
          </article>
        </div>

        <button class="publish-button" type="button" :disabled="pushingToGeelark" @click="pushToGeelark">
          <LoaderCircle v-if="pushingToGeelark" class="h-4 w-4 animate-spin" />
          <Play v-else class="h-4 w-4" />
          <span>{{ pushingToGeelark ? '推送中…' : `进入 GeeLark 发布池（${successfulOutputs.length}）` }}</span>
        </button>

        <section v-if="failedOutputSummary.length" class="failed-summary">
          <div class="section-heading">
            <div>
              <span class="section-kicker">Failure Summary</span>
              <strong>失败项汇总</strong>
            </div>
            <span class="section-note">共 {{ failedOutputs.length }} 条</span>
          </div>
          <div class="failed-summary__list">
            <article v-for="item in failedOutputSummary" :key="item.id" class="failed-summary__item">
              <strong>{{ item.fileName }}</strong>
              <small>{{ item.reason }}</small>
            </article>
          </div>
        </section>
      </article>
    </section>

    <div v-if="loading" class="page-loading">
      <LoaderCircle class="h-4 w-4 animate-spin" />
      <span>正在加载批量字幕工作台…</span>
    </div>
  </div>
</template>

<style scoped>
.subtitle-workbench-page {
  --bg: #070d18;
  --panel-bg: linear-gradient(180deg, rgba(17, 23, 38, 0.88), rgba(11, 15, 25, 0.94));
  --panel-edge: rgba(255, 255, 255, 0.08);
  --panel-edge-strong: rgba(142, 122, 255, 0.34);
  --panel-shadow: 0 30px 80px rgba(0, 0, 0, 0.28);
  --text-main: #f6f7fb;
  --text-soft: rgba(230, 235, 247, 0.72);
  --text-faint: rgba(207, 214, 230, 0.48);
  --accent: #7a63f7;
  --accent-soft: rgba(122, 99, 247, 0.22);
  display: grid;
  gap: 14px;
  min-height: calc(100vh - 120px);
  padding: 14px 16px 22px;
  color: var(--text-main);
  background:
    radial-gradient(circle at top right, rgba(122, 99, 247, 0.18), transparent 24%),
    radial-gradient(circle at 15% 18%, rgba(75, 127, 255, 0.12), transparent 22%),
    linear-gradient(180deg, #09111f 0%, #070d18 100%);
  overflow-y: auto;
}

.subtitle-workbench-page * {
  box-sizing: border-box;
}

.glass-panel {
  border: 1px solid var(--panel-edge);
  border-radius: 20px;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(18px);
}

.hero-panel {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  padding: 20px 22px;
}

.hero-panel--compact {
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
}

.eyebrow,
.section-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(193, 180, 255, 0.88);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero-copy {
  display: grid;
  gap: 8px;
  max-width: 780px;
}

.hero-copy--compact {
  gap: 4px;
  max-width: 520px;
}

.hero-copy h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.08;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.hero-copy--compact h1 {
  font-size: 18px;
  line-height: 1.15;
}

.hero-copy p {
  margin: 0;
  max-width: 680px;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.hero-copy--compact p {
  font-size: 11px;
  line-height: 1.4;
}

.hero-actions {
  display: grid;
  gap: 12px;
  justify-items: end;
  min-width: 300px;
}

.hero-actions--compact {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.hero-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.hero-kpis--compact {
  display: flex;
  width: auto;
  gap: 8px;
}

.hero-kpi {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.hero-kpi--compact {
  gap: 2px;
  min-width: 88px;
  padding: 8px 10px;
  border-radius: 12px;
}

.hero-kpi strong {
  font-size: 20px;
  letter-spacing: -0.03em;
}

.hero-kpi--compact strong {
  font-size: 12px;
  letter-spacing: 0;
}

.hero-kpi span {
  color: var(--text-soft);
  font-size: 11px;
}

.hero-kpi--compact span {
  font-size: 10px;
}

.stepbar-panel {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 10px;
}

.stepbar-panel--compact {
  gap: 8px;
  padding: 8px 10px;
}

.step-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 72px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 18px;
  color: var(--text-soft);
  background: linear-gradient(180deg, rgba(24, 29, 44, 0.72), rgba(18, 21, 34, 0.72));
  text-align: left;
  cursor: default;
}

.step-chip--compact {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 14px;
}

.step-chip.is-active,
.step-chip.is-done {
  border-color: rgba(150, 131, 255, 0.28);
  background: linear-gradient(180deg, rgba(58, 43, 114, 0.86), rgba(34, 27, 70, 0.9));
  color: #fff;
}

.step-chip__index {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 700;
}

.step-chip--compact .step-chip__index {
  width: 22px;
  height: 22px;
  border-radius: 8px;
  font-size: 11px;
}

.step-chip__copy {
  display: grid;
  gap: 3px;
}

.step-chip__copy strong {
  font-size: 14px;
}

.step-chip--compact .step-chip__copy strong {
  font-size: 12px;
}

.step-chip__copy small {
  color: inherit;
  opacity: 0.74;
  font-size: 11px;
  line-height: 1.4;
}

.step-chip--compact .step-chip__copy small {
  display: none;
}

.step-chip__done {
  margin-left: auto;
}

.page-message {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 13px;
}

.page-message--success {
  border: 1px solid rgba(72, 193, 125, 0.16);
  background: rgba(47, 129, 79, 0.15);
  color: #cff3da;
}

.page-message--error {
  border: 1px solid rgba(244, 114, 114, 0.16);
  background: rgba(127, 29, 29, 0.18);
  color: #ffd0d0;
}

.workspace-grid,
.bottom-grid {
  display: grid;
  gap: 14px;
}

.workspace-grid {
  grid-template-columns: minmax(320px, 0.92fr) minmax(460px, 1.14fr) minmax(360px, 0.96fr);
}

.bottom-grid {
  grid-template-columns: minmax(0, 1.5fr) minmax(360px, 1fr);
}

.work-card {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 16px;
  min-width: 0;
}

.section-heading,
.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-heading strong,
.card-head strong {
  display: block;
  margin-top: 4px;
  font-size: 16px;
  letter-spacing: -0.02em;
}

.section-note {
  color: var(--text-faint);
  font-size: 12px;
}

.segmented-tabs {
  display: flex;
  gap: 8px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.02);
}

.segmented-tabs button,
.ghost-button,
.minor-button,
.primary-button,
.text-button,
.strategy-card,
.template-preset,
.clone-picker__item,
.source-list-item,
.preview-thumbs__item,
.preview-thumbs__more,
.row-action,
.publish-button,
.align-segment button,
.mode-pills button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.segmented-tabs button {
  flex: 1 1 0;
  min-height: 38px;
  border-radius: 12px;
  color: var(--text-soft);
  background: transparent;
  transition: background 0.22s ease, color 0.22s ease;
}

.segmented-tabs button.is-active {
  color: #fff;
  background: linear-gradient(180deg, rgba(116, 94, 255, 0.44), rgba(92, 74, 214, 0.44));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.ghost-button,
.minor-button,
.row-action,
.toolbar-pill,
.template-preset,
.mode-pills button,
.align-segment button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-main);
  transition: background 0.2s ease, border-color 0.2s ease;
}

.ghost-button--compact {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 12px;
}

.ghost-button,
.toolbar-pill,
.template-preset,
.mode-pills button,
.align-segment button,
.row-action,
.minor-button {
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.ghost-button:hover,
.minor-button:hover,
.row-action:hover,
.template-preset:hover,
.align-segment button:hover,
.mode-pills button:hover,
.source-list-item:hover,
.clone-picker__item:hover,
.preview-thumbs__item:hover {
  background: rgba(255, 255, 255, 0.07);
}

.primary-button,
.publish-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 42px;
  border-radius: 14px;
  padding: 0 16px;
  color: #fff;
  font-weight: 600;
}

.primary-button {
  background: linear-gradient(90deg, #6c58f4 0%, #8a6ef8 100%);
  box-shadow: 0 18px 40px rgba(108, 88, 244, 0.28);
}

.publish-button {
  width: 100%;
  background: linear-gradient(90deg, rgba(80, 60, 183, 0.92), rgba(120, 88, 236, 0.96));
  box-shadow: 0 18px 40px rgba(89, 66, 209, 0.24);
}

.primary-button:disabled,
.publish-button:disabled,
.minor-button:disabled,
.row-action:disabled,
.strategy-card:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.upload-zone {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 156px;
  padding: 18px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(17, 22, 33, 0.72), rgba(10, 13, 22, 0.88));
  text-align: center;
  cursor: pointer;
}

.upload-zone__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(122, 99, 247, 0.14);
  color: #a99aff;
}

.upload-zone strong {
  font-size: 16px;
}

.upload-zone span,
.helper-copy,
.picker-tip p,
.capacity-card p {
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.clone-picker,
.clone-picker__list,
.sources-list,
.results-strip {
  display: grid;
  gap: 10px;
}

.source-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.source-pager__meta {
  display: grid;
  gap: 2px;
  color: var(--text-soft);
  font-size: 12px;
}

.source-pager__meta strong {
  color: var(--text-main);
  font-size: 12px;
}

.source-pager__actions {
  display: inline-flex;
  gap: 8px;
}

.picker-tip {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.025);
}

.minor-button--full {
  width: 100%;
}

.clone-picker__item,
.source-list-item {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 24px;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid transparent;
  text-align: left;
}

.clone-picker__item.is-selected,
.source-list-item.is-active {
  border-color: var(--panel-edge-strong);
  background: rgba(122, 99, 247, 0.12);
}

.clone-picker__item img,
.source-list-item img,
.preview-thumbs__item img,
.result-thumb__media img,
.result-thumb__media video {
  width: 54px;
  height: 72px;
  border-radius: 10px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.04);
}

.clone-picker__copy,
.source-list-item__copy,
.result-thumb__copy,
.preview-meta {
  display: grid;
  gap: 2px;
}

.clone-picker__copy strong,
.source-list-item__copy strong,
.result-thumb__copy strong {
  font-size: 12px;
  line-height: 1.35;
}

.clone-picker__copy small,
.source-list-item__copy small,
.result-thumb__copy small,
.font-meta,
.font-help,
.font-status {
  color: var(--text-soft);
  font-size: 11px;
  line-height: 1.35;
}

.source-list-item__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: var(--text-soft);
}

.text-button {
  padding: 0;
  color: #bcaeff;
  background: transparent;
}

.capacity-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.025);
}

.batch-runtime-card {
  display: grid;
  gap: 6px;
  padding-top: 4px;
}

.batch-runtime-card__head,
.batch-runtime-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.batch-runtime-card__head span,
.batch-runtime-card__meta span {
  color: var(--text-soft);
  font-size: 11px;
}

.batch-runtime-card__head strong {
  font-size: 12px;
  color: var(--text-main);
}

.capacity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.capacity-head span {
  color: var(--text-soft);
  font-size: 13px;
}

.capacity-head strong {
  font-size: 16px;
}

.sources-progress__bar,
.progress-cell__bar,
.preview-playerbar__track {
  width: 100%;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.sources-progress__bar {
  height: 10px;
}

.sources-progress__fill,
.progress-cell__fill,
.preview-playerbar__progress {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6c58f4, #9274ff);
}

.preview-card {
  gap: 12px;
}

.preview-toolbar {
  display: flex;
  gap: 10px;
}

.toolbar-pill {
  min-width: 72px;
  min-height: 38px;
  border-radius: 14px;
  color: var(--text-soft);
}

.toolbar-pill.is-active {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.1);
}

.preview-stage {
  display: grid;
}

.preview-stage__frame {
  position: relative;
  min-height: 410px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background:
    radial-gradient(circle at top, rgba(122, 99, 247, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(10, 12, 21, 0.98), rgba(6, 8, 16, 0.98));
  overflow: hidden;
}

.preview-stage__frame::before {
  content: '';
  position: absolute;
  width: 232px;
  aspect-ratio: 9 / 16;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.preview-stage__video {
  position: relative;
  z-index: 1;
  width: 232px;
  aspect-ratio: 9 / 16;
  object-fit: cover;
  border-radius: 18px;
  background: #05070c;
  box-shadow: 0 20px 56px rgba(0, 0, 0, 0.34);
}

.preview-stage__empty,
.preview-stage__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 0 90px;
  text-align: center;
  color: var(--text-soft);
}

.preview-stage__empty strong {
  font-size: 16px;
}

.preview-playerbar {
  display: grid;
  grid-template-columns: 18px auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  color: var(--text-soft);
  font-size: 12px;
}

.preview-playerbar__track {
  height: 4px;
}

.preview-playerbar__progress {
  width: 22%;
}

.preview-strip {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 10px;
}

.preview-strip__nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 64px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.028);
  color: rgba(233, 238, 250, 0.72);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.preview-strip__nav:hover:not(:disabled) {
  border-color: rgba(123, 97, 255, 0.22);
  background: rgba(123, 97, 255, 0.08);
  color: #f5f7fd;
  transform: translateY(-1px);
}

.preview-strip__nav:disabled {
  opacity: 0.32;
  cursor: default;
}

.preview-thumbs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr)) 38px;
  gap: 7px;
  min-width: 0;
  padding: 4px 0;
}

.preview-thumbs__item,
.preview-thumbs__more {
  position: relative;
  display: grid;
  min-height: 64px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.022);
  border: 1px solid rgba(255, 255, 255, 0.055);
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.preview-thumbs__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-thumbs__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(6, 10, 18, 0.02), rgba(6, 10, 18, 0.58) 100%);
}

.preview-thumbs__label {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 7px;
  overflow: hidden;
  color: #f5f7fd;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.preview-thumbs__item:hover {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  transform: translateY(-1px);
}

.preview-thumbs__item.is-active {
  border-color: rgba(123, 97, 255, 0.88);
  background: rgba(123, 97, 255, 0.08);
  box-shadow:
    0 0 0 1px rgba(123, 97, 255, 0.34),
    0 10px 24px rgba(10, 10, 18, 0.22);
}

.preview-thumbs__more {
  place-items: center;
  color: var(--text-soft);
  font-size: 11px;
  cursor: pointer;
}

.preview-meta {
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
}

.preview-meta strong {
  font-size: 13px;
}

.preview-meta p,
.preview-error {
  margin: 0;
  color: var(--text-soft);
  font-size: 11px;
  line-height: 1.45;
}

.preview-error {
  color: #ffbdbd;
}

.preview-footer,
.action-row,
.mode-pills,
.result-thumb__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.preview-footer__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-footer .minor-button {
  min-width: auto;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 12px;
}

.preview-footer .primary-button {
  min-width: 220px;
}

.config-card {
  gap: 14px;
}

.form-section {
  display: grid;
  gap: 12px;
}

.strategy-grid,
.template-preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.template-preset-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.strategy-card,
.template-preset {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text-main);
  text-align: left;
}

.template-preset {
  align-content: start;
  min-height: 72px;
}

.template-preset strong {
  font-size: 14px;
  line-height: 1.2;
  font-weight: 700;
  color: #f7f8fc;
}

.template-preset span {
  color: rgba(214, 220, 234, 0.68);
  font-size: 11px;
  line-height: 1.45;
}

.strategy-card.is-active,
.template-preset.is-active,
.mode-pills button.is-active,
.align-segment button.is-active {
  border-color: var(--panel-edge-strong);
  background: rgba(122, 99, 247, 0.16);
}

.template-preset.is-active span,
.template-preset:hover span {
  color: rgba(237, 240, 248, 0.86);
}

.strategy-card small {
  color: var(--text-soft);
  line-height: 1.6;
}

.dark-input,
.dark-textarea {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  outline: none;
  background: rgba(6, 8, 14, 0.72);
  color: var(--text-main);
  font: inherit;
}

.dark-input:focus,
.dark-textarea:focus {
  border-color: rgba(122, 99, 247, 0.62);
  box-shadow: 0 0 0 1px rgba(122, 99, 247, 0.22);
}

.dark-textarea {
  min-height: 144px;
  resize: vertical;
  line-height: 1.7;
}

.dark-input--color {
  min-height: 46px;
  padding: 5px;
}

.section-heading .section-note,
.section-heading .section-note strong {
  align-self: center;
}

.form-grid {
  display: grid;
  gap: 10px;
}

.form-grid--triple {
  grid-template-columns: 1.6fr 0.8fr 0.8fr;
}

.form-grid--dual {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-grid--quad {
  grid-template-columns: 1.05fr 0.9fr 0.8fr 1.05fr;
}

.field-block {
  display: grid;
  gap: 8px;
}

.field-block span {
  color: var(--text-soft);
  font-size: 12px;
}

.field-block--wide {
  min-width: 0;
}

.color-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px;
  gap: 10px;
}

.align-segment {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.queue-card,
.results-card {
  gap: 12px;
}

.segmented-tabs--queue {
  min-width: 360px;
}

.queue-table {
  display: grid;
  gap: 10px;
  padding-bottom: 2px;
}

.queue-table--cards {
  gap: 12px;
}

.queue-card-item {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.026);
}

.queue-card-item__top,
.queue-card-item__meta,
.queue-card-item__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.queue-card-item__title {
  display: grid;
  gap: 3px;
}

.queue-card-item__title strong {
  font-size: 14px;
}

.queue-card-item__title small,
.queue-card-item__meta span {
  color: var(--text-soft);
  font-size: 11px;
}

.queue-card-item__progress {
  display: grid;
  gap: 6px;
}

.queue-batch-note {
  display: block;
  margin-top: 4px;
  color: var(--text-soft);
  font-size: 10px;
  line-height: 1.4;
}

.failed-summary {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.failed-summary__list {
  display: grid;
  gap: 8px;
}

.failed-summary__item {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(244, 114, 114, 0.12);
  background: rgba(127, 29, 29, 0.12);
}

.failed-summary__item strong {
  font-size: 12px;
}

.failed-summary__item small {
  color: var(--text-soft);
  font-size: 11px;
  line-height: 1.45;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-style: normal;
  font-size: 12px;
}

.status-chip--queued,
.status-chip--draft {
  color: #d8e0f4;
}

.status-chip--processing {
  color: #c4b8ff;
  background: rgba(122, 99, 247, 0.2);
}

.status-chip--completed {
  color: #baf8cb;
  background: rgba(56, 161, 105, 0.18);
}

.status-chip--partial_failed,
.status-chip--failed {
  color: #ffc5c5;
  background: rgba(220, 38, 38, 0.16);
}

.progress-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.progress-cell__bar {
  height: 8px;
}

.results-strip {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.result-thumb {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.025);
}

.result-thumb__media {
  position: relative;
}

.result-thumb__media img,
.result-thumb__media video {
  width: 100%;
  height: 144px;
  border-radius: 14px;
  object-fit: cover;
}

.result-thumb__badge {
  position: absolute;
  left: 10px;
  top: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(56, 161, 105, 0.92);
  color: #fff;
  font-size: 11px;
}

.result-thumb__badge.is-failed {
  background: rgba(220, 38, 38, 0.92);
}

.result-thumb__actions {
  justify-content: space-between;
}

.page-loading {
  position: sticky;
  bottom: 14px;
  justify-self: center;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(8, 11, 18, 0.86);
  color: var(--text-soft);
  backdrop-filter: blur(18px);
}

@media (max-width: 1680px) {
  .workspace-grid {
    grid-template-columns: minmax(300px, 0.9fr) minmax(400px, 1.05fr) minmax(340px, 0.95fr);
  }
}

@media (max-width: 1440px) {
  .hero-panel,
  .workspace-grid,
  .bottom-grid,
  .form-grid--triple,
  .form-grid--dual,
  .form-grid--quad,
  .results-strip {
    grid-template-columns: 1fr;
  }

  .hero-panel,
  .hero-actions {
    min-width: 0;
    justify-items: stretch;
  }

  .stepbar-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1080px) {
  .subtitle-workbench-page {
    padding: 12px;
  }

  .hero-panel,
  .work-card {
    padding: 14px;
  }

  .stepbar-panel {
    grid-template-columns: 1fr;
  }

  .preview-stage__frame {
    min-height: 440px;
  }

  .preview-stage__frame::before,
  .preview-stage__video {
    width: 248px;
  }

  .strategy-grid,
  .template-preset-grid,
  .hero-kpis,
  .preview-thumbs {
    grid-template-columns: 1fr;
  }

  .segmented-tabs--queue {
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 760px) {
  .hero-copy h1 {
    font-size: 24px;
  }

  .preview-stage__frame {
    min-height: 360px;
  }

  .preview-stage__frame::before,
  .preview-stage__video {
    width: min(100%, 240px);
  }

  .preview-strip {
    grid-template-columns: 1fr;
  }

  .preview-strip__nav {
    display: none;
  }

  .preview-playerbar {
    grid-template-columns: 18px 1fr;
  }

  .preview-playerbar__track {
    grid-column: 1 / -1;
  }

  .preview-footer .minor-button,
  .preview-footer .primary-button {
    width: 100%;
  }
}
</style>
