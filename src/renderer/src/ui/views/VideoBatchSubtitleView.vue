<script setup lang="ts">
import { thumbnailUrl } from '@/lib/localMedia'
import { applySubtitlePreset, defaultSubtitleCaptionStyle, loadSubtitleSettings, saveSubtitleSettings, subtitlePresets, type SubtitlePresetId } from '@/lib/subtitleStyle'
import SubtitleLivePreview from '@/ui/components/subtitle/SubtitleLivePreview.vue'
import SubtitleStyleFields from '@/ui/components/subtitle/SubtitleStyleFields.vue'
import SubtitleTitleFields from '@/ui/components/subtitle/SubtitleTitleFields.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  CheckCircle2,
  Copy,
  Image as ImageIcon,
  Images,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  FolderOpen,
  ListChecks,
  LockKeyhole,
  Pause,
  Play,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  Save,
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
  type BatchSubtitleTitleStrategy,
  type CloneProjectSummary,
} from '@/lib/webApiClient'

const { t: tr } = useI18n()
const router = useRouter()

type SourceTab = 'upload' | 'clone'
type RightTab = 'content' | 'style'
type QueueTab = 'all' | 'processing' | 'completed'
type StepState = 'idle' | 'active' | 'done'
type CaptionTemplatePresetId = SubtitlePresetId
type PreviewMode = 'fast' | 'video'

/** 页面三个标签：制作（三栏工作台）/ 任务 / 成片 */
const studioTab = ref<'make' | 'jobs' | 'outputs'>('make')
const dragOver = ref(false)
const outputsShown = ref(60)
const sourceTab = ref<SourceTab>('upload')
const rightTab = ref<RightTab>('content')
const queueTab = ref<QueueTab>('all')
const loading = ref(false)
const pluginChecking = ref(true)
const pluginReady = ref(false)
const runningJob = ref(false)
const controllingJob = ref(false)
const showAllOutputs = ref(false)
const notice = ref('')
const errorText = ref('')
const previewVideoError = ref('')
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
const selectedTemplatePreset = ref<CaptionTemplatePresetId>('tiktok-native')
const previewMode = ref<PreviewMode>('fast')
const titleStrategy = ref<BatchSubtitleTitleStrategy>('single_for_all')
const titlePoolText = ref('')
let previewTimer: ReturnType<typeof setTimeout> | null = null
let queuePollTimer: ReturnType<typeof setInterval> | null = null
let previewRequestToken = 0
let previewQueued = false
let lastAppliedPreviewSignature = ''
let previewDirtySinceLastRender = false

function defaultCaptionStyle(): BatchSubtitleCaptionStyle {
  return defaultSubtitleCaptionStyle()
}

function defaultLayoutPolicy(): BatchSubtitleLayoutPolicy {
  return {
    maxLines: 2,
    maxWidthRatio: 0.7,
    reflowStrategy: 'balanced',
    avoidPosition: 'auto',
  }
}

/** 模板（和各模块的「批量添加字幕」弹窗共用，见 lib/subtitleStyle） */
const captionTemplatePresets = computed(() => subtitlePresets(tr))

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
  name: tr('autoUi.k_249cbc9f1c5b'),
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
const titlePoolItems = computed(() =>
  String(titlePoolText.value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean),
)
const hasDraftTitles = computed(() =>
  titleStrategy.value === 'random_pool' ? titlePoolItems.value.length > 0 : Boolean(String(draft.titleText || '').trim()),
)
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
const hasPreviewReady = computed(() => Boolean(previewSource.value && resolveTitleTextForSource(previewSource.value.id)))
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
      reason: String(item.error || tr('autoUi.k_b164ae2aaa3b')),
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
  config: hasDraftTitles.value ? 'done' : hasSources.value ? 'active' : 'idle',
  preview: hasPreviewReady.value && !previewVideoError.value ? 'done' : hasSources.value ? 'active' : 'idle',
  render: hasRenderedOutputs.value ? 'done' : hasPreviewReady.value ? 'active' : 'idle',
}))
const queueSummary = computed(() => [
  { label: tr('autoUi.k_54a1d655a4e8'), value: String(jobs.value.length).padStart(2, '0') },
  { label: tr('autoUi.k_fcb979ef0b91'), value: String(processingCount.value).padStart(2, '0') },
  { label: tr('autoUi.k_62f0ff0f782b'), value: String(successfulOutputs.value.length).padStart(2, '0') },
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
    titleStrategy: titleStrategy.value,
    titlePoolText: titlePoolText.value,
    titleText: draft.titleText,
    titleItems: draft.titleItems.map((item) => `${item.sourceItemId}:${item.text}`).join('|'),
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

// 样式改了就同步到渲染用的配置（整份复制，新增的字重 / 自定义位置等也带上）
watch(
  () => ({ ...draft.captionStyle }),
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
  () => {
    // 不再每改一次就渲染（每次都要起一个 Chrome，连着改会把软件拖垮）：页面上的实时预览即时更新，
    // 「生成真实画面」由用户手动点。
    previewDirtySinceLastRender = true
  },
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
  if (!runtime) return tr('autoUi.k_7e011d485110')
  const totalBatches = Math.max(0, Number(runtime.totalBatches || 0))
  const completedBatches = Math.max(0, Number(runtime.completedBatches || 0))
  const nextSourceIndex = Math.max(0, Number(runtime.nextSourceIndex || 0))
  if (!totalBatches) return tr('autoUi.k_f6f70c3bafc0')
  if (job.status === 'completed' || job.status === 'partial_failed') {
    return tr('autoUi.k_4400ca3308f1', { p0: completedBatches, p1: totalBatches })
  }
  return tr('autoUi.k_b21b0dec05ed', { p0: Math.min(totalBatches, completedBatches + 1), p1: totalBatches, p2: nextSourceIndex + 1 })
}

function applyCaptionTemplatePreset(presetId: CaptionTemplatePresetId) {
  const preset = captionTemplatePresets.value.find((item) => item.id === presetId)
  if (!preset) return
  selectedTemplatePreset.value = preset.id
  draft.captionStyle = applySubtitlePreset(draft.captionStyle, preset)
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
  if (status === 'processing') return tr('autoUi.k_fcb979ef0b91')
  if (status === 'queued') return tr('autoUi.k_4dcbbcfa6154')
  if (status === 'completed') return tr('autoUi.k_e99b48a29bdf')
  if (status === 'partial_failed') return tr('autoUi.k_7912043e5530')
  if (status === 'failed') return tr('autoUi.k_3e3c8068bb0e')
  if (status === 'paused') return tr('autoUi.k_130448bce675')
  return tr('autoUi.k_0f436818c0b4')
}

function buildTitleConfig() {
  if (titleStrategy.value === 'random_pool') {
    return {
      strategy: 'random_pool' as const,
      singleText: '',
      titlePool: [...titlePoolItems.value],
    }
  }
  const titleText = String(draft.titleText || '').trim()
  return {
    strategy: 'single_for_all' as const,
    singleText: titleText,
    titlePool: titleText ? [titleText] : [],
  }
}

function resolveTitleTextForSource(sourceItemId: string) {
  const activeTitleConfig = buildTitleConfig()
  const sourceIndex = Math.max(0, draft.sourceItems.findIndex((item) => item.id === sourceItemId))
  const fallbackTitle =
    activeTitleConfig.strategy === 'random_pool'
      ? activeTitleConfig.titlePool[sourceIndex % activeTitleConfig.titlePool.length] || activeTitleConfig.titlePool[0] || ''
      : activeTitleConfig.singleText
  const perItem =
    activeTitleConfig.strategy === 'single_for_all'
      ? draft.titleItems.find((item) => item.sourceItemId === sourceItemId)?.text?.trim()
      : ''
  if (perItem) return perItem
  return String(fallbackTitle || '').trim()
}

function syncDraftTitleSummary() {
  if (titleStrategy.value === 'random_pool') {
    draft.titleText = titlePoolItems.value[0] || ''
    return
  }
  const first = draft.sourceItems[0] ? resolveTitleTextForSource(draft.sourceItems[0].id) : ''
  draft.titleText = first
}

function buildTitleItems(): BatchSubtitleTitleItem[] {
  if (titleStrategy.value === 'random_pool') return []
  return draft.sourceItems.map((item) => ({
    sourceItemId: item.id,
    text: resolveTitleTextForSource(item.id),
    updatedAt: Date.now(),
  }))
}

function updateTitleItem(sourceItemId: string, text: string) {
  if (titleStrategy.value !== 'single_for_all') return
  const normalized = String(text || '').trim()
  const next = draft.titleItems.filter((item) => item.sourceItemId !== sourceItemId)
  // 和统一标题一样或留空 = 不单独设置（以后改统一标题时这条也跟着变）
  if (normalized && normalized !== String(draft.titleText || '').trim()) {
    next.push({ sourceItemId, text: normalized, updatedAt: Date.now() })
  }
  draft.titleItems = next
}

/** 这条视频单独设置的标题（没有单独设置时为空） */
function titleOverrideFor(sourceItemId: string) {
  const text = draft.titleItems.find((item) => item.sourceItemId === sourceItemId)?.text?.trim() || ''
  return text && text !== String(draft.titleText || '').trim() ? text : ''
}

function buildPreviewSignature() {
  return JSON.stringify({
    sourceItemId: previewSource.value?.id || '',
    titleText: previewSource.value ? resolveTitleTextForSource(previewSource.value.id) : '',
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
      fontWeight: draft.captionStyle.fontWeight,
      offsetYRatio: draft.captionStyle.offsetYRatio,
      offsetXRatio: draft.captionStyle.offsetXRatio,
      secondaryScale: draft.captionStyle.secondaryScale,
    },
  })
}

async function refreshAccuratePreview() {
  const previewTitle = previewSource.value ? resolveTitleTextForSource(previewSource.value.id) : ''
  if (!previewSource.value || !previewTitle) {
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
      titleConfig: buildTitleConfig(),
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
    previewDirtySinceLastRender = false
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
  }, 900)
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
  previewDirtySinceLastRender = true
}

async function refreshFontOptions() {
  void webApiClient
}

async function ensurePluginReady() {
  pluginChecking.value = true
  pluginReady.value = false
  try {
    let plugin = await webApiClient.getPlugin('video-batch-subtitle')
    // Built-in tool: silently activate it instead of sending the user to an install screen.
    if (plugin.status !== 'installed') plugin = (await webApiClient.installPlugin('video-batch-subtitle')).plugin
    if (plugin.runtimeState !== 'enabled') plugin = (await webApiClient.enablePlugin('video-batch-subtitle')).plugin
    pluginReady.value = plugin.status === 'installed' && plugin.runtimeState === 'enabled'
  } catch {
    pluginReady.value = false
  } finally {
    pluginChecking.value = false
  }
  return pluginReady.value
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
    if (selectedJobId.value && !jobItems.some((item) => item.id === selectedJobId.value)) {
      selectedJobId.value = ''
    }
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function pickUploadVideos(paths?: string[]) {
  const picked = paths ?? await window.api.pickFiles({
    title: tr('autoUi.k_f6bc7748ef45'),
    filters: [{ name: tr('autoUi.k_436893584feb'), extensions: ['mp4', 'mov', 'm4v', 'webm'] }],
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
  notice.value = tr('autoUi.k_5df58afa1877', { p0: items.length })
}

async function pickUploadVideosFromLibrary() {
  const selected = await openAssetLibraryPicker({ type: 'video', multiple: true })
  if (selected?.length) await pickUploadVideos(selected.map((item) => item.filePath))
}

function startQueuePolling() {
  if (queuePollTimer) clearInterval(queuePollTimer)
  queuePollTimer = setInterval(() => {
    if (document.hidden) return
    if (previewFrameLoading.value || controllingJob.value) return
    const hasActiveJob = jobs.value.some((item) => item.status === 'processing' || item.status === 'queued' || item.status === 'paused')
    if (!hasActiveJob) return
    void loadAll()
  }, 8000)
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
  notice.value = tr('autoUi.k_c2475b5d11a0', { p0: sourceItems.length })
  errorText.value = ''
}

function removeSourceItem(id: string) {
  draft.sourceItems = draft.sourceItems.filter((item) => item.id !== id)
  draft.titleItems = draft.titleItems.filter((item) => item.sourceItemId !== id)
  syncDraftTitleSummary()
}

async function saveCurrentDraft() {
  if (!draft.sourceItems.length) {
    errorText.value = tr('autoUi.k_690499d9b0d8')
    return null
  }
  const activeJobId =
    selectedJobId.value && jobs.value.some((item) => item.id === selectedJobId.value) ? selectedJobId.value : ''
  if (!activeJobId && selectedJobId.value) {
    selectedJobId.value = ''
  }
  const payload = {
    name: draft.name,
    subtitleMode: 'static_title' as const,
    subtitleSource: 'manual' as const,
    exportEngine: 'ass_fallback' as const,
    titleRenderMode: draft.titleRenderMode,
    sourceItems: draft.sourceItems,
    titleConfig: buildTitleConfig(),
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
    const result = activeJobId
      ? await webApiClient.updateBatchSubtitleDraft(activeJobId, payload)
      : await webApiClient.createBatchSubtitleJob(payload)
    loadJobIntoDraft(result)
    draftDirty.value = false
    notice.value = tr('autoUi.k_a2f12528a59d')
    await loadAll()
    return result
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    return null
  }
}

async function renderBatch() {
  if (!draft.sourceItems.length) {
    errorText.value = tr('autoUi.k_ba9e2b6d74e8')
    return
  }
  if (!hasDraftTitles.value) {
    errorText.value = titleStrategy.value === 'random_pool' ? tr('bsx.needPool') : tr('bsx.needTitle')
    return
  }
  runningJob.value = true
  errorText.value = ''
  notice.value = tr('autoUi.k_df4d23490b1b')
  // 每次开始都新建一条处理记录，不覆盖上一次的成片
  selectedJobId.value = ''
  try {
    const ensuredJob = selectedJobId.value ? { id: selectedJobId.value } : await saveCurrentDraft()
    const jobId = String(ensuredJob?.id || selectedJobId.value || '').trim()
    if (!jobId) {
      errorText.value = tr('autoUi.k_b7e96207dceb')
      return
    }
    await webApiClient.updateBatchSubtitleDraft(jobId, {
      sourceItems: draft.sourceItems,
      subtitleSource: 'manual',
      exportEngine: 'ass_fallback',
      titleRenderMode: draft.titleRenderMode,
      titleConfig: buildTitleConfig(),
      titleItems: buildTitleItems(),
      overlayImageConfig: draft.overlayImageConfig,
      captionStyle: draft.captionStyle,
      layoutPolicy: draft.layoutPolicy,
      subtitleMode: 'static_title',
    })
    const result = await webApiClient.runBatchSubtitleJob(jobId)
    loadJobIntoDraft(result)
    draftDirty.value = false
    // 网页版渲染在服务器后台进行，先返回「处理中」，底部渲染栏显示进度
    notice.value = result.status === 'processing' || result.status === 'queued' ? tr('bsx.renderStarted') : tr('autoUi.k_adb3a2a7ae93', { p0: result.outputCount })
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
    notice.value = tr('autoUi.k_fc125f7c529d')
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
    notice.value = retryFailedOnly ? tr('autoUi.k_c4069ac52051') : tr('autoUi.k_19b0831feeb0')
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
        ? tr('autoUi.k_852b54e4bf6b')
        : action === 'retry_failed'
          ? tr('autoUi.k_0da8369de465')
          : tr('autoUi.k_4794c9f36f26')
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    controllingJob.value = false
  }
}

function loadJobIntoDraft(job: BatchSubtitleJob) {
  draft.name = job.name
  draft.titleRenderMode = job.titleRenderMode || 'overlay_image'
  draft.sourceItems = [...job.sourceItems]
  titleStrategy.value = job.titleConfig?.strategy || 'single_for_all'
  draft.titleText = job.titleConfig?.singleText || ''
  titlePoolText.value = Array.isArray(job.titleConfig?.titlePool) ? job.titleConfig.titlePool.join('\n') : ''
  const sharedTitle = String(job.titleConfig?.singleText || '').trim()
  draft.titleItems = (job.titleItems || []).filter((item) => String(item.text || '').trim() && String(item.text || '').trim() !== sharedTitle)
  draft.overlayImageConfig = { ...defaultOverlayImageConfig(), ...(job.overlayImageConfig || {}) }
  draft.captionStyle = { ...defaultCaptionStyle(), ...(job.captionStyle || {}) }
  draft.layoutPolicy = { ...defaultLayoutPolicy(), ...(job.layoutPolicy || {}) }
  selectedJobId.value = job.id
  draftDirty.value = false
  // 上面改草稿会在下一拍触发「有修改」的监听，载入本身不算修改
  void nextTick(() => {
    draftDirty.value = false
  })
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

/* ---------------- 预览：实时画面在 SubtitleLivePreview 里画（和成片同一套排版），这里管「真实画面」 ---------------- */

const liveTitle = computed(() => (previewSource.value ? resolveTitleTextForSource(previewSource.value.id) : String(draft.titleText || titlePoolItems.value[0] || '').trim()))
const previewImageSrc = computed(() => {
  const source = previewSource.value
  const path = source ? source.coverImagePath || source.sourceVideoPath : ''
  return path && mediaUrl(path) ? thumbnailUrl(path, 640) : ''
})
/** 生成过的真实画面只在设置没再改动时显示，改了就回到实时预览 */
const realPreviewFresh = computed(() => Boolean(previewFrame.value && !previewFrameLoading.value && lastAppliedSignature.value === buildPreviewSignature()))
const lastAppliedSignature = ref('')
watch(previewFrame, () => {
  lastAppliedSignature.value = lastAppliedPreviewSignature
})

function renderRealPreview(mode: PreviewMode) {
  previewMode.value = mode
  lastAppliedPreviewSignature = ''
  void refreshAccuratePreview()
}

const missingTitleCount = computed(() => (titleStrategy.value === 'random_pool' ? 0 : draft.sourceItems.filter((item) => !resolveTitleTextForSource(item.id)).length))

/* ---------------- 记住上次的标题和样式（本机，和各模块的「批量添加字幕」弹窗共用） ---------------- */

function restoreSettings() {
  const saved = loadSubtitleSettings()
  draft.captionStyle = saved.captionStyle
  titleStrategy.value = saved.titleStrategy
  draft.titleText = saved.titleText
  titlePoolText.value = saved.titlePoolText
  selectedTemplatePreset.value = saved.preset
}
watch(
  () => [draft.captionStyle, titleStrategy.value, draft.titleText, titlePoolText.value, selectedTemplatePreset.value],
  () => saveSubtitleSettings({ captionStyle: draft.captionStyle, titleStrategy: titleStrategy.value, titleText: draft.titleText, titlePoolText: titlePoolText.value, preset: selectedTemplatePreset.value }),
  { deep: true },
)

/* ---------------- 处理记录 ---------------- */

const historyShown = ref(10)
const shownJobs = computed(() => jobs.value.filter((job) => job.status !== 'draft').slice(0, historyShown.value))
function jobDone(job: BatchSubtitleJob) {
  return job.outputs.filter((item) => item.renderStatus === 'success').length
}
function openJobFolder(job: BatchSubtitleJob) {
  const first = job.outputs.find((item) => item.renderStatus === 'success' && item.outputVideoPath)
  if (first) void showOutputInFolder(first)
}
/** 用这条记录的标题和样式（视频不变） */
function reuseJobSettings(job: BatchSubtitleJob) {
  const sources = draft.sourceItems
  loadJobIntoDraft(job)
  draft.sourceItems = sources.length ? sources : draft.sourceItems
  selectedJobId.value = ''
  notice.value = tr('bsx.reused')
}

function clearSources() {
  draft.sourceItems = []
  draft.titleItems = []
  selectedPreviewId.value = ''
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i
async function onDropVideos(event: DragEvent) {
  dragOver.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  const videos = files.filter((file) => file.type.startsWith('video/') || VIDEO_EXT.test(file.name))
  if (files.length && !videos.length) {
    errorText.value = tr('bsx.dropOnlyVideo')
    return
  }
  const paths = videos.map((file) => window.api.getPathForFile(file)).filter(Boolean)
  if (paths.length) await pickUploadVideos(paths)
}

function stepPreview(delta: number) {
  const count = draft.sourceItems.length
  if (!count) return
  const index = Math.max(0, selectedPreviewIndex.value)
  const next = draft.sourceItems[(index + delta + count) % count]
  if (next) selectedPreviewId.value = next.id
}

const activePresetName = computed(() => captionTemplatePresets.value.find((item) => item.id === selectedTemplatePreset.value)?.name || '')
const jobProgress = computed(() => Math.max(0, Math.min(100, Number(selectedJob.value?.progress || 0))))
const showJobBar = computed(() => Boolean(selectedJob.value && (runningJob.value || ['queued', 'processing', 'paused', 'failed', 'partial_failed'].includes(selectedJob.value.status))))
const shownOutputs = computed(() => outputs.value.slice(0, outputsShown.value))

function jobTone(status: BatchSubtitleJob['status']) {
  if (status === 'completed') return 'vg-pill--green'
  if (status === 'failed') return 'vg-pill--red'
  if (status === 'partial_failed' || status === 'paused') return 'vg-pill--amber'
  if (status === 'processing' || status === 'queued') return 'vg-pill--blue'
  return ''
}

function editJob(job: BatchSubtitleJob) {
  loadJobIntoDraft(job)
  studioTab.value = 'make'
}

function openGuide() {
  notice.value =
    tr('autoUi.k_6901d9336c6f')
}

onMounted(async () => {
  if (!(await ensurePluginReady())) return
  await refreshFontOptions()
  restoreSettings()
  await loadAll()
  startQueuePolling()
})

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
  if (queuePollTimer) clearInterval(queuePollTimer)
})
</script>

<template>
  <main class="vg-scope vg-page bsx">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="tr('ai.tools.back')" @click="router.push('/plugins')"><ChevronLeft :size="18" /></button>
      <span class="vg-page-head__icon"><Captions :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ tr('autoUi.k_3c2dba21dfac') }}</h1>
        <p>{{ tr('bsx.subtitle') }}</p>
      </div>
    </header>

    <div v-if="notice" class="vg-notice vg-notice--accent bsx-notice">
      <span>{{ notice }}</span>
      <button class="vg-icon-btn vg-icon-btn--sm" type="button" aria-label="close" @click="notice = ''"><X :size="13" /></button>
    </div>
    <div v-if="errorText" class="vg-notice vg-notice--danger bsx-notice">
      <span>{{ errorText }}</span>
      <button class="vg-icon-btn vg-icon-btn--sm" type="button" aria-label="close" @click="errorText = ''"><X :size="13" /></button>
    </div>

    <section v-if="pluginChecking" class="vg-card vg-empty">
      <LoaderCircle :size="22" class="vg-spin" />
      <p>{{ tr('autoUi.k_ab033e36c756') }}</p>
    </section>

    <section v-else-if="!pluginReady" class="vg-card vg-empty">
      <span class="vg-empty__icon"><LockKeyhole :size="22" /></span>
      <p><strong>{{ tr('autoUi.k_7659e21372a5') }}</strong></p>
      <p>{{ tr('autoUi.k_a27ab48c49f9') }}</p>
    </section>

    <div v-else class="vg-split bsx__layout">
      <div class="vg-stack">
        <!-- 1. 视频 -->
        <section
          class="vg-card bsx-videos"
          :class="{ 'is-dragover': dragOver }"
          @dragover.prevent="dragOver = true"
          @dragleave.self="dragOver = false"
          @drop.prevent="onDropVideos"
        >
          <div class="vg-card__head">
            <span class="vg-card__title">1. {{ tr('bsx.stepVideos') }} <small>{{ tr('bsx.selectedCount', { n: draft.sourceItems.length }) }}</small></span>
            <div class="vg-card__actions">
              <button v-if="draft.sourceItems.length" type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="clearSources">{{ tr('autoUi.k_84fcd70d4280') }}</button>
              <button type="button" class="vg-btn vg-btn--sm" @click="pickUploadVideosFromLibrary"><Images :size="14" />{{ tr('bsx.fromLibrary') }}</button>
              <button v-if="cloneProjects.length" type="button" class="vg-btn vg-btn--sm" :class="{ 'is-active': sourceTab === 'clone' }" @click="sourceTab = sourceTab === 'clone' ? 'upload' : 'clone'"><Film :size="14" />{{ tr('autoUi.k_8810731ffc4d') }}</button>
              <button type="button" class="vg-btn vg-btn--sm" @click="pickUploadVideos()"><FolderOpen :size="14" />{{ tr('bsx.fromDisk') }}</button>
            </div>
          </div>

          <div v-if="sourceTab === 'clone'" class="bsx-clone">
            <div class="bsx-clone__list">
              <label v-for="project in cloneProjects" :key="project.id" class="bsx-clone__item" :class="{ 'is-selected': selectedSourceIds.includes(project.id) }">
                <input type="checkbox" :checked="selectedSourceIds.includes(project.id)" @change="toggleCloneSource(project)" />
                <img v-if="mediaUrl(project.coverAssetPath)" :src="mediaUrl(project.coverAssetPath)" alt="" />
                <span class="vg-ellipsis">{{ project.title || tr('autoUi.k_d264f0c81078') }}</span>
              </label>
            </div>
            <button class="vg-btn vg-btn--sm vg-btn--soft" type="button" :disabled="!selectedSourceIds.length" @click="applyCloneSources(); sourceTab = 'upload'">{{ tr('autoUi.k_49e222b27db2') }}</button>
          </div>

          <button v-if="!draft.sourceItems.length" type="button" class="bsx-drop" @click="pickUploadVideos()">
            <Upload :size="22" />
            <strong>{{ tr('bsx.dropHint') }}</strong>
            <span>{{ tr('bsx.noVideosHint') }}</span>
          </button>

          <div v-else class="bsx-rows">
            <div
              v-for="item in sourcePageItems"
              :key="item.id"
              class="bsx-row"
              :class="{ 'is-active': previewSource?.id === item.id }"
              @click="selectedPreviewId = item.id"
            >
              <span class="bsx-row__thumb">
                <img
                  v-if="mediaUrl(item.coverImagePath || item.sourceVideoPath)"
                  :src="thumbnailUrl(item.coverImagePath || item.sourceVideoPath, 160)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span class="bsx-row__info">
                <strong class="vg-ellipsis" :title="item.fileName">{{ item.fileName }}</strong>
                <small>{{ formatDuration(item.durationSec) }}<template v-if="item.width && item.height"> · {{ item.width }}×{{ item.height }}</template></small>
              </span>
              <input
                v-if="titleStrategy === 'single_for_all'"
                class="vg-input vg-input--sm bsx-row__title"
                :value="titleOverrideFor(item.id)"
                :placeholder="draft.titleText ? tr('bsx.useShared') : tr('bsx.noTitle')"
                :class="{ 'is-missing': !resolveTitleTextForSource(item.id) }"
                @click.stop
                @focus="selectedPreviewId = item.id"
                @change="updateTitleItem(item.id, ($event.target as HTMLInputElement).value)"
              />
              <span v-else class="bsx-row__random vg-muted">{{ tr('bsx.randomTitle') }}</span>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="tr('autoUi.k_84fcd70d4280')" @click.stop="removeSourceItem(item.id)"><X :size="14" /></button>
            </div>
            <div v-if="draft.sourceItems.length > sourcePageSize" class="bsx-pager">
              <button class="vg-pg" type="button" :disabled="!canSourcePagePrev" @click="goSourcePagePrev"><ChevronLeft :size="14" /></button>
              <span class="vg-num">{{ sourcePage }} / {{ sourcePageCount }}</span>
              <button class="vg-pg" type="button" :disabled="!canSourcePageNext" @click="goSourcePageNext"><ChevronRight :size="14" /></button>
            </div>
          </div>
        </section>

        <!-- 2. 标题（和各模块的「批量添加字幕」弹窗同一个组件） -->
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">2. {{ tr('bsx.stepTitle') }}</span></div>
          <SubtitleTitleFields
            v-model:strategy="titleStrategy"
            v-model:title-text="draft.titleText"
            v-model:pool-text="titlePoolText"
            :hint="tr('bsx.sharedHint')"
            @error="errorText = $event"
            @notice="notice = $event"
          />
        </section>

        <!-- 3. 样式 -->
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">3. {{ tr('bsx.stepStyle') }}</span></div>
          <SubtitleStyleFields v-model="draft.captionStyle" v-model:preset="selectedTemplatePreset" :title="liveTitle" />
        </section>

        <!-- 4. 开始 -->
        <section class="vg-card bsx-start">
          <div class="bsx-start__summary">
            <span>{{ tr('bsx.summaryVideos', { n: draft.sourceItems.length }) }}</span>
            <span>{{ titleStrategy === 'random_pool' ? tr('bsx.summaryPool', { n: titlePoolItems.length }) : tr('autoUi.k_73e18b3f4a29') }}</span>
            <span v-if="missingTitleCount" class="bsx-help--warn">{{ tr('bsx.summaryMissing', { n: missingTitleCount }) }}</span>
          </div>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--lg vg-btn--block" :disabled="runningJob || !draft.sourceItems.length || !hasDraftTitles" @click="renderBatch">
            <LoaderCircle v-if="runningJob" :size="16" class="vg-spin" /><Play v-else :size="16" />
            {{ runningJob ? tr('autoUi.k_12fefde201ec') : tr('bsx.start', { n: draft.sourceItems.length }) }}
          </button>
        </section>
      </div>

      <aside class="vg-stack bsx-side">
        <!-- 效果预览 -->
        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title">{{ tr('bsx.preview') }}</span>
            <span class="vg-pill" :class="realPreviewFresh ? 'vg-pill--green' : ''">{{ realPreviewFresh ? tr('bsx.previewReal') : tr('bsx.previewLive') }}</span>
          </div>
          <SubtitleLivePreview v-model:caption-style="draft.captionStyle" :title="realPreviewFresh ? '' : liveTitle" :image-src="realPreviewFresh ? '' : previewImageSrc" :draggable="!realPreviewFresh" :empty-text="realPreviewFresh ? '' : tr('bsx.previewEmpty')" class="bsx-frame">
            <video
              v-if="realPreviewFresh && previewMode === 'video' && previewDynamicVideoUrl"
              :src="previewDynamicVideoUrl"
              :poster="previewPosterUrl || undefined"
              controls
              autoplay
              muted
              preload="metadata"
            ></video>
            <img v-else-if="realPreviewFresh && previewFrame?.previewImagePath" :src="mediaUrl(previewFrame.previewImagePath)" alt="" />
            <div v-if="previewFrameLoading" class="bsx-frame__loading"><LoaderCircle :size="14" class="vg-spin" />{{ tr('bsx.rendering') }}</div>
          </SubtitleLivePreview>
          <div class="bsx-nav">
            <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="draft.sourceItems.length < 2" :title="tr('bsx.prevVideo')" @click="stepPreview(-1)"><ChevronLeft :size="16" /></button>
            <span class="vg-ellipsis">{{ previewSource ? `${Math.max(0, selectedPreviewIndex) + 1}/${draft.sourceItems.length} · ${previewSource.fileName}` : tr('autoUi.k_4e810e74e284') }}</span>
            <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="draft.sourceItems.length < 2" :title="tr('bsx.nextVideo')" @click="stepPreview(1)"><ChevronRight :size="16" /></button>
          </div>
          <div class="bsx-real">
            <button type="button" class="vg-btn vg-btn--sm" :disabled="!previewSource || !liveTitle || previewFrameLoading" @click="renderRealPreview('fast')"><ImageIcon :size="14" />{{ tr('bsx.renderFrame') }}</button>
            <button type="button" class="vg-btn vg-btn--sm" :disabled="!previewSource || !liveTitle || previewFrameLoading" @click="renderRealPreview('video')"><Clapperboard :size="14" />{{ tr('bsx.renderClip') }}</button>
          </div>
          <p class="bsx-help">{{ tr('bsx.dragHint') }} {{ tr('bsx.previewHint') }}</p>
          <div v-if="previewVideoError" class="vg-notice vg-notice--danger">{{ previewVideoError }}</div>
        </section>

        <!-- 处理记录 -->
        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title">{{ tr('bsx.history') }}</span>
            <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="loading" @click="loadAll"><RefreshCcw :size="14" :class="{ 'vg-spin': loading }" /></button>
          </div>
          <p v-if="!shownJobs.length" class="vg-muted bsx-help">{{ tr('bsx.noHistory') }}</p>
          <div v-for="job in shownJobs" :key="job.id" class="bsx-batch">
            <div class="bsx-batch__head">
              <strong>{{ formatTime(job.createdAt) }}</strong>
              <span class="vg-muted">{{ jobDone(job) }}/{{ job.sourceItems.length }}</span>
              <span class="vg-pill" :class="jobTone(job.status)">{{ resolveJobStatusLabel(job.status) }}</span>
              <span class="vg-toolbar__spacer"></span>
              <button v-if="job.status === 'processing'" type="button" class="vg-icon-btn vg-icon-btn--sm" :disabled="controllingJob" :title="tr('autoUi.k_130448bce675')" @click="controlQueueJob(job, 'pause')"><Pause :size="14" /></button>
              <button v-if="job.status === 'paused' || job.status === 'failed'" type="button" class="vg-icon-btn vg-icon-btn--sm" :disabled="controllingJob" :title="tr('autoUi.k_1fc1afc5c55e')" @click="controlQueueJob(job, 'resume')"><Play :size="14" /></button>
              <button v-if="job.outputs.some((item) => item.renderStatus === 'failed')" type="button" class="vg-icon-btn vg-icon-btn--sm" :disabled="controllingJob" :title="tr('autoUi.k_8af761b2b4bf')" @click="controlQueueJob(job, 'retry_failed')"><RotateCcw :size="14" /></button>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :disabled="!jobDone(job)" :title="tr('autoUi.k_031c10557843')" @click="openJobFolder(job)"><FolderOpen :size="14" /></button>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="tr('bsx.reuse')" @click="reuseJobSettings(job)"><Copy :size="14" /></button>
            </div>
            <div v-if="job.status === 'processing' || job.status === 'queued'" class="vg-progress bsx-batch__progress">
              <span class="vg-progress__bar"><span class="vg-progress__fill" :style="{ width: `${job.progress || 0}%` }"></span></span>
              <span>{{ job.progress || 0 }}%</span>
            </div>
            <button
              v-for="item in job.outputs"
              :key="item.id"
              type="button"
              class="bsx-batch__item"
              :disabled="item.renderStatus !== 'success'"
              :title="item.error || item.selectedTitle"
              @click="openOutputVideo(item)"
            >
              <CheckCircle2 v-if="item.renderStatus === 'success'" :size="14" class="bsx-ok" />
              <XCircle v-else :size="14" class="bsx-err" />
              <span class="vg-ellipsis">{{ item.selectedTitle || shortFileName(item.sourceVideoPath) }}</span>
              <small v-if="item.error" class="bsx-err vg-ellipsis">{{ item.error }}</small>
            </button>
          </div>
          <button v-if="jobs.filter((job) => job.status !== 'draft').length > shownJobs.length" type="button" class="vg-btn vg-btn--sm vg-btn--ghost vg-btn--block" @click="historyShown += 10">{{ tr('bsx.moreHistory') }}</button>
        </section>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.bsx { width: min(1440px, 100%); margin: 0 auto; }
.bsx__layout { grid-template-columns: minmax(0, 1fr) 400px; align-items: start; }
.bsx-side { position: sticky; top: 12px; }
.bsx-notice { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.bsx-help { margin-top: 6px; font-size: 12px; color: var(--theme-text-muted); }
.bsx-help b { color: var(--theme-text); }
.bsx-help--warn { color: var(--vg-amber); }

/* 1. 视频 */
.bsx-videos.is-dragover { border-color: var(--vg-accent); box-shadow: 0 0 0 2px var(--vg-accent-soft); }
.bsx-videos .vg-btn.is-active { border-color: var(--vg-accent-line); color: var(--vg-accent); background: var(--vg-accent-soft); }
.bsx-drop { display: grid; justify-items: center; gap: 6px; width: 100%; padding: 26px 12px; border: 1px dashed var(--theme-border-control, var(--theme-border)); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); color: var(--theme-text-muted); cursor: pointer; text-align: center; transition: all .15s; }
.bsx-drop:hover, .bsx-videos.is-dragover .bsx-drop { border-color: var(--vg-accent); color: var(--vg-accent); background: var(--vg-accent-soft); }
.bsx-drop strong { font-size: 13px; color: var(--theme-text); }
.bsx-drop span { font-size: 12px; }
.bsx-rows { display: grid; gap: 4px; max-height: 420px; overflow-y: auto; margin: 0 -6px; padding: 0 6px; }
.bsx-row { display: grid; grid-template-columns: 32px minmax(120px, 1fr) minmax(160px, 1.4fr) 30px; align-items: center; gap: 10px; padding: 5px 6px; border: 1px solid transparent; border-radius: var(--vg-radius-sm); cursor: pointer; }
.bsx-row:hover { background: var(--theme-panel-soft); }
.bsx-row.is-active { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); }
.bsx-row__thumb { width: 32px; height: 56px; border-radius: 5px; overflow: hidden; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); }
.bsx-row__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bsx-row__info { display: grid; gap: 2px; min-width: 0; }
.bsx-row__info strong { font-size: 12.5px; font-weight: 600; color: var(--theme-text); }
.bsx-row__info small { font-size: 11px; color: var(--theme-text-muted); }
.bsx-row__title.is-missing { border-color: color-mix(in srgb, var(--vg-amber) 55%, transparent); }
.bsx-row__title.is-missing::placeholder { color: var(--vg-amber); }
.bsx-row__random { font-size: 12px; }
.bsx-pager { display: flex; align-items: center; justify-content: center; gap: 8px; padding-top: 6px; font-size: 12px; }
.bsx-clone { display: grid; gap: 8px; margin-bottom: 10px; padding: 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); }
.bsx-clone__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px; max-height: 200px; overflow-y: auto; }
.bsx-clone__item { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 7px; font-size: 12px; color: var(--theme-text); cursor: pointer; }
.bsx-clone__item:hover, .bsx-clone__item.is-selected { background: var(--vg-accent-soft); }
.bsx-clone__item img { width: 24px; height: 32px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }

/* 2. 标题 */

/* 3. 样式 */
.bsx-preset__sample { font-size: 20px; font-weight: 900; line-height: 1.1; paint-order: stroke fill; }

/* 4. 开始 */
.bsx-start { display: grid; gap: 10px; }
.bsx-start__summary { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--theme-text-secondary); }

/* 预览 */
.bsx-frame { position: relative; aspect-ratio: 9 / 16; max-height: 560px; margin: 0 auto; border-radius: var(--vg-radius-sm); overflow: hidden; background: #05070b; }
.bsx-frame > img, .bsx-frame > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.bsx-frame__empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: rgba(255, 255, 255, .6); font-size: 12.5px; }
.bsx-frame__loading { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: rgba(0, 0, 0, .65); color: #fff; font-size: 12px; white-space: nowrap; }
.bsx-nav { display: grid; grid-template-columns: 30px minmax(0, 1fr) 30px; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; color: var(--theme-text-secondary); text-align: center; }
.bsx-real { display: flex; gap: 6px; margin-top: 8px; }
.bsx-real .vg-btn { flex: 1; justify-content: center; }

/* 处理记录 */
.bsx-batch { padding: 8px 0; border-top: 1px solid var(--theme-divider); }
.bsx-batch:first-of-type { border-top: 0; }
.bsx-batch__head { display: flex; align-items: center; gap: 6px; font-size: 12.5px; margin-bottom: 4px; }
.bsx-batch__progress { margin: 4px 0 6px; }
.bsx-batch__item { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 2px 6px; align-items: center; width: 100%; padding: 3px 4px; border: 0; border-radius: 6px; background: transparent; font-size: 12px; color: var(--theme-text); text-align: left; cursor: pointer; }
.bsx-batch__item:hover:not(:disabled) { background: var(--theme-panel-soft); }
.bsx-batch__item:disabled { cursor: default; }
.bsx-batch__item small { grid-column: 2; }
.bsx-ok { color: var(--vg-green); }
.bsx-err { color: var(--vg-red); }

@media (max-width: 1100px) {
  .bsx__layout { grid-template-columns: minmax(0, 1fr); }
  .bsx-side { position: static; }
}
@media (max-width: 640px) {
  .bsx-row { grid-template-columns: 32px minmax(0, 1fr) 30px; }
  .bsx-row__title, .bsx-row__random { grid-column: 1 / -1; }
}
</style>
