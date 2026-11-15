<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import BatchDeleteDialog from '../components/BatchDeleteDialog.vue'
import ProductSelectDialog from '../components/ProductSelectDialog.vue'
import RuntimeLogDialog from '../components/RuntimeLogDialog.vue'
import { webApiClient } from '@/lib/webApiClient'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileImage,
  FolderOpen,
  Grid2x2,
  ImagePlus,
  LayoutGrid,
  List,
  LoaderCircle,
  Logs,
  MoreHorizontal,
  PanelBottomOpen,
  PanelTopOpen,
  Package,
  Pause,
  Play,
  RefreshCcw,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-vue-next'

type ProductImageAsset = {
  id: string
  productId: string
  filePath: string
  isCover?: boolean
}

type Product = {
  id: string
  name: string
  type: string
  coverImagePath?: string
  livePhotoReferenceImagePath?: string
  images?: ProductImageAsset[]
}

type ProductImageMaterialOption = {
  id: string
  category: 'necklace' | 'ring' | 'earring' | 'bracelet'
  localImagePath: string
  qiniuUrl: string
  materialOrigin?: 'original' | 'derived'
  usageStatus: 'unused' | 'used'
  boundProductId?: string
  derivedFromMaterialId?: string
  createdAt: number
}

type LivePhotoItem = {
  id: string
  sourceType: 'reference_replace' | 'clone_shot'
  sourceProjectTitle?: string
  sourceShotLabel?: string
  productSnapshot?: {
    id: string
    name: string
    type: string
    coverImagePath?: string
    authoritativeProductReferencePath?: string
    imagePaths: string[]
  }
  referenceImagePath?: string
  packagingStatus: 'draft' | 'processing' | 'completed' | 'failed'
  generatedStillPath?: string
  motionVideoPath?: string
  previewVideoPath?: string
  posterPath?: string
  exportBundlePath?: string
  packagingMetadataBridgePath?: string
  packagingAssetIdentifier?: string
  videoMetadataMode?: 'quicktime_mdta' | 'copied_fallback'
  imageMetadataMode?: 'copied_pending_native_metadata'
  promptPreview?: { title: string; instructions: string[] }
  imagePromptPreview?: {
    provider?: string
    model?: string
    prompt: string
    negativePrompt?: string
    referenceImagePaths: string[]
  }
  videoPromptPreview?: {
    provider?: string
    model?: string
    prompt: string
    negativePrompt?: string
    referenceImagePaths: string[]
  }
  imageTaskId?: string
  imageTaskProvider?: string
  imageTaskModel?: string
  imageTaskBaseUrl?: string
  imageTaskEndpointStyle?: string
  videoTaskId?: string
  videoTaskProvider?: string
  videoTaskModel?: string
  videoTaskBaseUrl?: string
  videoTaskEndpointStyle?: string
  subtitleOverlay?: {
    active: boolean
    originalOutputPath: string
    originalCoverImagePath?: string
    subtitleOutputPath: string
    subtitleCoverImagePath?: string
    appliedAt: number
  }
  workflow?: {
    currentStep: 'queued' | 'image_generation' | 'image_validation' | 'video_generation' | 'live_photo_packaging' | 'completed'
    stepStatus: Record<
      'queued' | 'image_generation' | 'image_validation' | 'video_generation' | 'live_photo_packaging' | 'completed',
      { status: 'idle' | 'running' | 'done' | 'failed'; updatedAt: number; error?: string }
    >
    updatedAt: number
  }
  autoFlowStatus?: {
    enabled: boolean
    status: 'idle' | 'running' | 'done' | 'failed_retryable' | 'failed_terminal'
    paused?: boolean
    retryLimit: number
    retryCount: number
    imageRetryMode?: 'auto' | 'manual_once'
    currentStage: 'queued' | 'image_generation' | 'image_validation' | 'video_generation' | 'live_photo_packaging' | 'completed'
    lastStartedAt?: number
    lastCompletedAt?: number
    lastError?: string
    imageValidationBypassed?: boolean
  }
  promptVersionId?: string
  promptVersion?: number
  promptHash?: string
  cacheHit?: boolean
  checkerFallbackReason?: string
  qualityReport?: LivePhotoQualityReport
  replacementRegion?: {
    x: number
    y: number
    width: number
    height: number
    source: 'auto' | 'manual'
    confidence?: number
    revision: number
    updatedAt: number
  }
  generationAttempts?: Array<{
    id: string
    index: number
    outputPath: string
    provider?: string
    model?: string
    strategy?: string
    cacheHit: boolean
    quality?: LivePhotoQualityReport
    createdAt: number
  }>
  logs?: Array<{ id: string; level: 'info' | 'success' | 'error'; message: string; time: number }>
  error?: string
  updatedAt: number
}

type LivePhotoSettings = {
  referenceMotionTemplate: 'push_in' | 'push_out' | 'ambient_sway'
  outputResolution: '1080x1440' | '2160x2880' | '3024x4032'
  frameRate: '24' | '30'
  quality: 'medium' | 'high'
  qualityCheckerEnabled?: boolean
  qualityPassThreshold?: number
  qualityRetryFloor?: number
  retryLimit?: number
  updatedAt: number
}

type LivePhotoQualityReport = {
  checkerVersion: string
  mode: 'local_python' | 'remote_fallback'
  decision: 'pass' | 'retry' | 'reject'
  score: number
  threshold: number
  retryFloor: number
  components: Record<string, number>
  hardFailures: string[]
  notes: string[]
  fallbackReason?: string
  durationMs: number
  checkedAt: number
}

type LivePhotoPromptVersion = {
  id: string
  name: string
  version: number
  prompt: string
  promptHash: string
  active: boolean
  createdAt: number
  updatedAt: number
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

const uiText = computed(() => ({
  workspaceTitle: 'Live Photo',
  workspaceHint: t('livePhoto.workspace.hint'),
  heroTitle: t('livePhoto.hero.title'),
  heroDesc: t('livePhoto.hero.desc'),
  completed: t('livePhoto.hero.completed'),
  tabReference: t('livePhoto.tabs.reference'),
  tabLibrary: t('livePhoto.tabs.library'),
  referenceTitle: t('livePhoto.reference.title'),
  referenceNote: t('livePhoto.workspace.referenceNote'),
  referenceImage: t('livePhoto.reference.referenceImage'),
  referenceUploadTitle: t('livePhoto.workspace.referenceUploadTitle'),
  referenceUploadDesc: t('livePhoto.workspace.referenceUploadDesc'),
  materialLibrarySelect: t('livePhoto.workspace.materialLibrarySelect'),
  materialLibraryDesc: t('livePhoto.workspace.materialLibraryDesc'),
  materialLibraryClose: t('common.close'),
  materialLibraryEmpty: t('livePhoto.workspace.materialLibraryEmpty'),
  materialLibrarySelected: t('livePhoto.workspace.selected'),
  materialLibraryAddSelected: t('livePhoto.workspace.materialLibraryAddSelected'),
  materialLibrarySelectAll: t('livePhoto.workspace.selectAll'),
  materialLibraryClear: t('livePhoto.workspace.clear'),
  previousPage: t('livePhoto.workspace.previousPage'),
  nextPage: t('livePhoto.workspace.nextPage'),
  perPage: t('livePhoto.workspace.perPage'),
  referenceQueuedSuffix: t('livePhoto.workspace.referenceQueuedSuffix'),
  pendingTasks: t('livePhoto.workspace.pendingTasks'),
  referenceTaskList: t('livePhoto.workspace.referenceTaskList'),
  missingImage: t('livePhoto.workspace.missingImage'),
  product: t('livePhoto.reference.product'),
  delete: t('common.remove'),
  createTaskPrefix: t('livePhoto.workspace.createTaskPrefix'),
  referenceSafe: t('livePhoto.workspace.referenceSafe'),
  rulesTitle: t('livePhoto.rules.title'),
  rulesVersion: t('livePhoto.rules.version'),
  ruleIdentity: t('livePhoto.rules.items.identity'),
  ruleReplace: t('livePhoto.rules.items.replaceOnly'),
  ruleMotion: t('livePhoto.rules.items.motion'),
  rulePackage: t('livePhoto.rules.items.package'),
  outputTitle: t('livePhoto.workspace.outputTitle'),
  outputDesc: t('livePhoto.workspace.outputDesc'),
  settingsTitle: t('livePhoto.workspace.settingsTitle'),
  standardPackage: t('livePhoto.workspace.standardPackage'),
  recommended: t('livePhoto.workspace.recommended'),
  standardPackageDesc: t('livePhoto.workspace.standardPackageDesc'),
  resolution: t('livePhoto.workspace.resolution'),
  frameRate: t('livePhoto.workspace.frameRate'),
  quality: t('livePhoto.workspace.quality'),
  libraryTitle: t('livePhoto.library.title'),
  itemUnit: t('livePhoto.workspace.itemUnit'),
  filter: t('livePhoto.workspace.filter'),
  exportSelectedPrefix: t('livePhoto.actions.exportSelected'),
  packagingMetadata: t('livePhoto.library.packagingMetadata'),
  preview: t('livePhoto.library.preview'),
  metadata: t('livePhoto.library.metadata'),
  reveal: t('livePhoto.library.reveal'),
  regenerate: t('livePhoto.library.regenerate'),
  referenceCreatedPrefix: t('livePhoto.workspace.referenceCreatedPrefix'),
  referenceCreatedSuffix: t('livePhoto.workspace.referenceCreatedSuffix'),
  runtimeLogTitlePrefix: t('livePhoto.workspace.runtimeLogTitle'),
}))

/** Short labels for the reference-source buttons (previously hard-coded Chinese). */
const lpText = computed(() => {
  if (locale.value === 'en-US') return { localPick: 'Upload images', assetLibrary: 'From asset library' }
  if (locale.value === 'vi-VN') return { localPick: 'Tai anh len', assetLibrary: 'Tu thu vien' }
  return { localPick: '继续添加', assetLibrary: '从素材库选择' }
})

const loading = ref(false)
const creatingReference = ref(false)
const exporting = ref(false)
const notice = ref('')
const errorText = ref('')
const activeTab = ref<'reference' | 'library'>('reference')
const items = ref<LivePhotoItem[]>([])
const libraryPage = ref(1)
const libraryPageSize = ref(24)
const libraryTotal = ref(0)
const libraryTotalPages = ref(1)
const libraryStats = ref({ total: 0, running: 0, failed: 0, paused: 0 })
const libraryViewMode = ref<'grid' | 'list'>('grid')
const products = ref<Product[]>([])
const productImageMaterials = ref<ProductImageMaterialOption[]>([])
const libraryFilter = ref<'all' | 'failed' | 'running' | 'paused' | 'success_not_exported' | 'success_exported' | 'success_not_subtitled'>('all')
function setLibraryFilter(value: string) { if (['all', 'failed', 'running', 'paused', 'success_not_exported', 'success_exported', 'success_not_subtitled'].includes(value)) libraryFilter.value = value as typeof libraryFilter.value }
const libraryStatusFilters = computed(() => [
  { key: 'all', label: t('common.all') },
  { key: 'running', label: t('livePhoto.workspace.running') },
  { key: 'failed', label: t('livePhoto.status.failed') },
  { key: 'paused', label: t('livePhoto.workspace.paused') },
  { key: 'success_not_exported', label: t('livePhoto.workspace.successNotExported') },
  { key: 'success_exported', label: t('livePhoto.workspace.successExported') },
  { key: 'success_not_subtitled', label: t('livePhoto.workspace.successNotSubtitled') },
])
const selectedProductId = ref('')
const productPickerOpen = ref(false)
const referenceImagePaths = ref<string[]>([])
const referenceMissingPaths = ref<string[]>([])
const referenceMaterialIds = ref<string[]>([])
const materialPickerOpen = ref(false)
const livePhotoRetrySettingsOpen = ref(false)
const selectedMaterialImageIds = ref<string[]>([])
const materialPickerPage = ref(1)
const materialPickerPageSize = ref(12)
const selectedLibraryIds = ref<string[]>([])
const batchDeleteOpen = ref(false)
const batchDeleteBusy = ref(false)
const runtimeDialogOpen = ref(false)
const runtimeLogs = ref<Array<{ id: string; level: 'info' | 'success' | 'error'; message: string; time: number }>>([])
const runtimeDialogTitle = ref('')
const detailDialogOpen = ref(false)
const detailDialogItem = ref<LivePhotoItem | null>(null)
const replacementRegionDialogOpen = ref(false)
const replacementRegionDialogItem = ref<LivePhotoItem | null>(null)
const replacementRegionStage = ref<HTMLElement | null>(null)
const replacementRegionBusy = ref(false)
const replacementRegionDraft = reactive({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
const replacementRegionCorners = ['nw', 'ne', 'sw', 'se'] as const
const replacementRegionInteraction = ref<{
  mode: 'draw' | 'move' | 'resize'
  corner?: 'nw' | 'ne' | 'sw' | 'se'
  startX: number
  startY: number
  initial: { x: number; y: number; width: number; height: number }
} | null>(null)
const livePhotoSettingsBusy = ref(false)
const promptVersions = ref<LivePhotoPromptVersion[]>([])
const promptKind = ref<'image' | 'video'>('image')
const selectedPromptVersionId = ref('')
const promptEditorName = ref('')
const promptEditorText = ref('')
const promptDrafts = reactive<Record<'image' | 'video', { versionId: string; name: string; text: string }>>({
  image: { versionId: '', name: '', text: '' },
  video: { versionId: '', name: '', text: '' },
})
let promptVersionLoadSequence = 0
const promptVersionBusy = ref(false)
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
const subtitleDialogItem = ref<LivePhotoItem | null>(null)
const videoDialogItemId = ref('')
const livePhotoSettings = ref<LivePhotoSettings>({
  referenceMotionTemplate: 'push_in',
  outputResolution: '2160x2880',
  frameRate: '30',
  quality: 'high',
  qualityCheckerEnabled: true,
  qualityPassThreshold: 0.88,
  qualityRetryFloor: 0.65,
  retryLimit: 2,
  updatedAt: 0,
})

const resolutionOptions = computed(() => [
  { value: '1080x1440', label: '1080 x 1440', note: t('autoUi.k_881de32901d5') },
  { value: '2160x2880', label: '2160 x 2880', note: t('autoUi.k_4ef41efedb3c') },
  { value: '3024x4032', label: '3024 x 4032', note: t('autoUi.k_83fb35964da6') },
] as const)

const frameRateOptions = computed(() => [
  { value: '24', label: '24 fps', note: t('autoUi.k_219a6464c9db') },
  { value: '30', label: '30 fps', note: t('autoUi.k_e162faa756b1') },
] as const)

const qualityOptions = computed(() => [
  { value: 'medium', label: t('autoUi.k_1ec9333876bf'), note: t('autoUi.k_9ca96203a16a') },
  { value: 'high', label: t('autoUi.k_491e64d88f53'), note: t('autoUi.k_2b90e9f980de') },
] as const)

const selectedProduct = computed(() => products.value.find((item) => item.id === selectedProductId.value) || null)
const selectedProductAnalysisBoardRef = computed(() => String(selectedProduct.value?.analysisBoardPath || '').trim())
const selectedProductLivePhotoRef = computed(() => {
  const analysisBoardRef = selectedProductAnalysisBoardRef.value
  if (analysisBoardRef) return analysisBoardRef
  return String(selectedProduct.value?.livePhotoReferenceImagePath || '').trim()
})
const selectedProductReadyForLivePhoto = computed(() => Boolean(selectedProductLivePhotoRef.value))
const primaryReferenceImage = computed(() => referenceImagePaths.value[0] || '')
const referenceTaskRows = computed(() =>
  referenceImagePaths.value.map((path, index) => ({
    id: `${index}-${path}`,
    path,
    fileName: fileNameOf(path),
    missing: referenceMissingPaths.value.includes(path),
  })),
)
const referenceCreatedItems = computed(() =>
  items.value.filter((item) => item.sourceType === 'reference_replace').slice(0, 8),
)
const unboundMaterialOptions = computed(() =>
  productImageMaterials.value.filter((item) => item.materialOrigin === 'derived' && String(item.localImagePath || '').trim()),
)
const materialPickerTotalPages = computed(() => Math.max(1, Math.ceil(unboundMaterialOptions.value.length / materialPickerPageSize.value)))
const pagedMaterialOptions = computed(() => {
  const start = (materialPickerPage.value - 1) * materialPickerPageSize.value
  return unboundMaterialOptions.value.slice(start, start + materialPickerPageSize.value)
})
const selectedPagedMaterialCount = computed(() => pagedMaterialOptions.value.filter((item) => selectedMaterialImageIds.value.includes(item.id)).length)
const selectedMaterialOptions = computed(() =>
  unboundMaterialOptions.value.filter((item) => selectedMaterialImageIds.value.includes(item.id)),
)

const filteredLibraryItems = computed(() => items.value)

const livePhotoSteps = ['queued', 'image_generation', 'image_validation', 'video_generation', 'live_photo_packaging', 'completed'] as const
const livePhotoRetryLimitFallback = 2
const selectedLibraryItems = computed(() => filteredLibraryItems.value.filter((item) => selectedLibraryIds.value.includes(item.id)))
const subtitleEligibleSelectedItems = computed(() => selectedLibraryItems.value.filter((item) => Boolean(livePhotoDisplayVideoPath(item))))
const subtitleEligibleSelectedCount = computed(() => subtitleEligibleSelectedItems.value.length)
const subtitleRevertEligibleSelectedCount = computed(() =>
  selectedLibraryItems.value.filter((item) => Boolean(item.subtitleOverlay?.active)).length,
)
const videoDialogItem = computed(() => items.value.find((item) => item.id === videoDialogItemId.value) || null)
const pagedLibraryItems = computed(() => filteredLibraryItems.value)
const runningLibraryItems = computed(() =>
  items.value.filter((item) => item.packagingStatus === 'processing' || item.autoFlowStatus?.status === 'running'),
)
const failedLibraryItems = computed(() =>
  items.value.filter(
    (item) =>
      item.packagingStatus === 'failed' ||
      item.autoFlowStatus?.status === 'failed_retryable' ||
      item.autoFlowStatus?.status === 'failed_terminal',
  ),
)
const pausedLibraryItems = computed(() => items.value.filter((item) => Boolean(item.autoFlowStatus?.paused)))
const retryableFailedLibraryItems = computed(() =>
  failedLibraryItems.value.filter(
    (item) => item.autoFlowStatus?.status === 'failed_retryable' || item.autoFlowStatus?.status === 'failed_terminal',
  ),
)

let libraryAutoRefreshTimer: ReturnType<typeof setInterval> | null = null
let pageVisibleRefreshTimer: ReturnType<typeof setTimeout> | null = null
let lastLibraryRefreshAt = 0

const LIBRARY_REFRESH_INTERVAL_MS = 6000
const LIBRARY_REFRESH_DEDUP_WINDOW_MS = 1500

function formatTime(value?: number) {
  if (!value) return '--'
  const date = new Date(value)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const ii = String(date.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${ii}`
}

function formatDate(value?: number) {
  if (!value) return '--'
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatElapsed(value?: number) {
  const startedAt = Number(value || 0)
  if (!startedAt) return '--'
  const diffMs = Math.max(0, Date.now() - startedAt)
  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return t('autoUi.k_a407dd94a3c0', { p0: hours, p1: minutes })
  if (minutes > 0) return t('autoUi.k_b54206bf2a1c', { p0: minutes, p1: seconds })
  return t('autoUi.k_ad7dee82f450', { p0: seconds })
}

function previewSrc(path?: string) {
  const value = String(path || '').trim()
  if (!value) return ''
  return `vg://file?path=${encodeURIComponent(value)}`
}

function fileNameOf(path?: string) {
  const value = String(path || '').trim()
  if (!value) return ''
  const normalized = value.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || value
}

function livePhotoImageBaseRef(item: LivePhotoItem) {
  return String(item.referenceImagePath || item.imagePromptPreview?.referenceImagePaths?.[0] || '').trim()
}

function livePhotoImageProductRef(item: LivePhotoItem) {
  return String(
    item.productSnapshot?.authoritativeProductReferencePath ||
      item.productSnapshot?.coverImagePath ||
      item.imagePromptPreview?.referenceImagePaths?.[1] ||
      '',
  ).trim()
}

function dedupePaths(paths: string[]) {
  return Array.from(new Set(paths.map((item) => String(item || '').trim()).filter(Boolean)))
}

async function splitExistingReferencePaths(paths: string[]) {
  const checks = await Promise.all(
    dedupePaths(paths).map(async (item) => ({
      path: item,
      exists: await window.api.pathExists({ path: item }),
    })),
  )
  return {
    existingPaths: checks.filter((item) => item.exists).map((item) => item.path),
    missingPaths: checks.filter((item) => !item.exists).map((item) => item.path),
  }
}

function itemStatusLabel(status: LivePhotoItem['packagingStatus']) {
  if (status === 'completed') return t('livePhoto.status.completed')
  if (status === 'failed') return t('livePhoto.status.failed')
  if (status === 'processing') return t('livePhoto.status.processing')
  return t('livePhoto.status.draft')
}

function metadataModeLabel(item: LivePhotoItem) {
  if (item.videoMetadataMode === 'quicktime_mdta') return t('livePhoto.metadata.videoTagged')
  if (item.videoMetadataMode === 'copied_fallback') return t('livePhoto.metadata.videoFallback')
  return t('livePhoto.metadata.pending')
}

function workflowStepLabel(step?: LivePhotoItem['workflow']['currentStep']) {
  if (step === 'image_generation') return t('autoUi.k_1f6a9dab8b96')
  if (step === 'image_validation') return t('autoUi.k_6e03657a1a84')
  if (step === 'video_generation') return t('autoUi.k_19978a8da5e2')
  if (step === 'live_photo_packaging') return t('autoUi.k_089c8515d929')
  if (step === 'completed') return t('autoUi.k_e99b48a29bdf')
  return t('autoUi.k_4dcbbcfa6154')
}

function workflowStepIndex(step?: LivePhotoItem['workflow']['currentStep']) {
  const index = livePhotoSteps.findIndex((item) => item === step)
  return index >= 0 ? index : 0
}

function liveTaskStatusLabel(item: LivePhotoItem) {
  const autoStatus = String(item.autoFlowStatus?.status || '').trim()
  if (item.packagingStatus === 'completed' || autoStatus === 'done') return t('autoUi.k_e99b48a29bdf')
  if (autoStatus === 'failed_terminal') return t('autoUi.k_3e3c8068bb0e')
  if (autoStatus === 'failed_retryable') return t('autoUi.k_26c89557cf8f')
  if (item.packagingStatus === 'failed') return t('autoUi.k_3e3c8068bb0e')
  if (item.packagingStatus === 'processing' || autoStatus === 'running') return t('autoUi.k_594249700590')
  return t('autoUi.k_4dcbbcfa6154')
}

function liveTaskStatusTone(item: LivePhotoItem) {
  const autoStatus = String(item.autoFlowStatus?.status || '').trim()
  if (item.packagingStatus === 'completed' || autoStatus === 'done') return 'is-success'
  if (autoStatus === 'failed_terminal') return 'is-danger'
  if (autoStatus === 'failed_retryable') return 'is-warning'
  if (item.packagingStatus === 'failed') return 'is-danger'
  if (item.packagingStatus === 'processing' || autoStatus === 'running') return 'is-running'
  return 'is-draft'
}

/** Status dot class for the redesigned workspace (`.lp-state--*`). */
function lpTone(item: LivePhotoItem) {
  const tone = liveTaskStatusTone(item)
  if (tone === 'is-success') return 'lp-state--ok'
  if (tone === 'is-danger') return 'lp-state--err'
  if (tone === 'is-warning') return 'lp-state--warn'
  if (tone === 'is-running') return 'lp-state--run'
  return ''
}

function liveTaskStepTone(step?: LivePhotoItem['workflow']['currentStep']) {
  if (step === 'image_generation') return 'tone-image'
  if (step === 'image_validation') return 'tone-validation'
  if (step === 'video_generation') return 'tone-video'
  if (step === 'live_photo_packaging') return 'tone-package'
  if (step === 'completed') return 'tone-done'
  return 'tone-queue'
}

function liveTaskProgressPercent(item: LivePhotoItem) {
  return Math.round(((workflowStepIndex(item.workflow?.currentStep) + (item.packagingStatus === 'completed' ? 1 : 0)) / livePhotoSteps.length) * 100)
}

function liveTaskRetryText(item: LivePhotoItem) {
  const retryCount = Number(item.autoFlowStatus?.retryCount ?? 0)
  const retryLimit = Number(item.autoFlowStatus?.retryLimit ?? 0)
  if (!retryCount && !retryLimit) return ''
  return t('autoUi.k_1e7e6cda0875', { p0: retryCount, p1: retryLimit || livePhotoRetryLimitFallback })
}

function liveTaskErrorSummary(item: LivePhotoItem) {
  const text = String(item.error || item.autoFlowStatus?.lastError || '').trim()
  if (!text) return ''
  if (text.includes('[remote_pending]')) {
    const taskId = extractLivePhotoTaskId(item)
    return taskId ? t('autoUi.k_2f271848d90e', { p0: taskId }) : t('autoUi.k_c350ef6948db')
  }
  const stage = item.autoFlowStatus?.failedStage === 'video'
    ? 'video_generation'
    : item.autoFlowStatus?.failedStage === 'image'
      ? 'image_validation'
      : item.workflow?.currentStep
  const summary = sanitizeVisibleText(text, t('autoUi.k_160f09e2ed5d'))
  return stage === 'video_generation' || stage === 'image_validation'
    ? `${workflowStepLabel(stage)}: ${summary}`
    : summary
}

function liveTaskAutoSummary(item: LivePhotoItem) {
  if (item.autoFlowStatus?.paused) return t('autoUi.k_fcbae46bf890')
  if (String(item.autoFlowStatus?.lastError || item.error || '').includes('[remote_pending]')) return t('autoUi.k_f5903c87b0f8')
  if (item.autoFlowStatus?.status === 'failed_retryable') return t('autoUi.k_26c89557cf8f')
  if (item.autoFlowStatus?.status === 'failed_terminal') return t('autoUi.k_cd2eb05a80ae')
  if (item.autoFlowStatus?.status === 'running') return t('autoUi.k_dc8ac053db7a')
  if (item.autoFlowStatus?.status === 'done') return t('autoUi.k_69f8125c3ccb')
  if (item.autoFlowStatus?.status === 'idle') return t('autoUi.k_d0de7734364c')
  if (item.packagingStatus === 'processing') return t('autoUi.k_fcb979ef0b91')
  if (item.packagingStatus === 'completed') return t('autoUi.k_e99b48a29bdf')
  if (item.packagingStatus === 'failed') return t('autoUi.k_3e3c8068bb0e')
  return t('autoUi.k_59a9eb4e6574')
}

function isWaitingRemoteResult(item: LivePhotoItem) {
  return String(item.autoFlowStatus?.lastError || item.error || '').includes('[remote_pending]')
}

function liveTaskWaitingHint(item: LivePhotoItem) {
  if (isWaitingRemoteResult(item)) {
    return t('autoUi.k_1b935b669e03', { p0: formatElapsed(item.autoFlowStatus?.lastStartedAt || item.workflow?.updatedAt || item.updatedAt) })
  }
  if (item.autoFlowStatus?.status === 'running') {
    return t('autoUi.k_d7dd8a9ea2b3', { p0: formatElapsed(item.autoFlowStatus?.lastStartedAt || item.workflow?.updatedAt || item.updatedAt) })
  }
  return ''
}

function workflowStepStatusText(item: LivePhotoItem, step: (typeof livePhotoSteps)[number]) {
  const status = String(item.workflow?.stepStatus?.[step]?.status || 'idle').trim()
  const errorText = String(item.workflow?.stepStatus?.[step]?.error || '').trim()
  if (status === 'failed' && errorText.includes('[remote_pending]')) return t('autoUi.k_f5903c87b0f8')
  if (status === 'done') return t('autoUi.k_e99b48a29bdf')
  if (status === 'failed') return t('autoUi.k_3e3c8068bb0e')
  if (status === 'running') return t('autoUi.k_594249700590')
  return t('autoUi.k_bd3488d0a929')
}

function workflowStepErrorText(item: LivePhotoItem, step: (typeof livePhotoSteps)[number]) {
  const text = String(item.workflow?.stepStatus?.[step]?.error || '').trim()
  if (!text) return ''
  if (text.includes('[remote_pending]')) {
    const taskId = extractLivePhotoTaskId(item)
    return taskId ? t('autoUi.k_2f271848d90e', { p0: taskId }) : t('autoUi.k_c350ef6948db')
  }
  return sanitizeVisibleText(text, t('autoUi.k_543156065601'))
}

function liveTaskMetaSummary(item: LivePhotoItem) {
  const errorText = String(item.error || '').trim()
  if (errorText) return liveTaskErrorSummary(item)
  return sanitizeVisibleText(item.referenceImagePath || item.sourceType, '--')
}

function extractLivePhotoTaskId(item: LivePhotoItem) {
  if (String(item.videoTaskId || '').trim()) return String(item.videoTaskId || '').trim()
  if (String(item.imageTaskId || '').trim()) return String(item.imageTaskId || '').trim()
  const candidates = [
    String(item.error || '').trim(),
    String(item.autoFlowStatus?.lastError || '').trim(),
    ...(Array.isArray(item.logs) ? item.logs.map((log) => String(log.message || '').trim()) : []),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const match = candidate.match(/(?:taskId|askId)=([^\s,]+)/i)
    if (match?.[1]) return match[1]
  }
  return ''
}

function liveTaskRemoteEntries(item: LivePhotoItem) {
  const entries = [
    String(item.imageTaskId || '').trim()
      ? {
          stage: t('autoUi.k_1f6a9dab8b96'),
          provider: String(item.imageTaskProvider || '').trim() || '--',
          model: String(item.imageTaskModel || '').trim() || '--',
          taskId: String(item.imageTaskId || '').trim(),
        }
      : null,
    String(item.videoTaskId || '').trim()
      ? {
          stage: t('autoUi.k_19978a8da5e2'),
          provider: String(item.videoTaskProvider || '').trim() || '--',
          model: String(item.videoTaskModel || '').trim() || '--',
          taskId: String(item.videoTaskId || '').trim(),
        }
      : null,
  ].filter(Boolean) as Array<{ stage: string; provider: string; model: string; taskId: string }>
  return entries
}

function liveTaskRemoteStateText(item: LivePhotoItem) {
  const taskId = extractLivePhotoTaskId(item)
  if (isWaitingRemoteResult(item)) {
    return taskId ? t('autoUi.k_2f271848d90e', { p0: taskId }) : t('autoUi.k_c350ef6948db')
  }
  if (item.autoFlowStatus?.status === 'running') {
    return taskId ? t('autoUi.k_b9ee7fea6250', { p0: taskId }) : t('autoUi.k_dc8ac053db7a')
  }
  if (item.packagingStatus === 'completed') {
    return taskId ? t('autoUi.k_8c525989d330', { p0: taskId }) : t('autoUi.k_f2741315f7aa')
  }
  if (item.packagingStatus === 'failed') {
    return taskId ? t('autoUi.k_351dc1e7178c', { p0: taskId }) : t('autoUi.k_2d46ca36d22b')
  }
  return taskId ? t('autoUi.k_ccfe4619ca2d', { p0: taskId }) : t('autoUi.k_c786d2a74dc5')
}

function detailLogPreview(item: LivePhotoItem) {
  return Array.isArray(item.logs) ? [...item.logs].slice(-6).reverse() : []
}

function latestExportSettingsText(item: LivePhotoItem) {
  const logs = Array.isArray(item.logs) ? [...item.logs].slice().reverse() : []
  const hit = logs.find((log) => String(log.message || '').includes('export settings used:'))
  if (!hit) return ''
  const match = String(hit.message).match(/resolution=([^\s]+)\s+frameRate=([^\s]+)\s+quality=([^\s]+)/i)
  if (!match) return ''
  return `${match[1]} / ${match[2]} fps / ${match[3]}`
}

function taskSourceSummary(item: LivePhotoItem) {
  if (item.sourceType === 'clone_shot') {
    return item.sourceProjectTitle ? t('autoUi.k_cdef37d90bbe', { p0: item.sourceProjectTitle }) : t('autoUi.k_aef9fefe3e16')
  }
  return item.productSnapshot?.name ? t('autoUi.k_bb63a465143b', { p0: item.productSnapshot.name }) : t('autoUi.k_34f1f7105b38')
}

function hasExportArtifacts(item: LivePhotoItem) {
  return Boolean(item.exportBundlePath || item.packagingAssetIdentifier)
}

function hasImageResult(item: LivePhotoItem) {
  return Boolean(String(item.generatedStillPath || '').trim())
}

function hasVideoResult(item: LivePhotoItem) {
  return Boolean(String(item.motionVideoPath || item.previewVideoPath || '').trim())
}

function sanitizeVisibleText(value: string, fallback = '--') {
  const text = String(value || '').trim()
  if (!text) return fallback
  if (/\uFFFD/.test(text)) return fallback
  if (/[\u9359\u938f\u93c3\u9422\u7ecb\u7487\u8930\u9365\u7039\u8bf2\u7af7\u955e\u51a8\u6b27\u951f]/.test(text)) return fallback
  return text
}

function livePhotoSubtitleOverlay(item: LivePhotoItem) {
  const overlay = item.subtitleOverlay
  if (!overlay || !overlay.active) return null
  const subtitleOutputPath = String(overlay.subtitleOutputPath || '').trim()
  if (!subtitleOutputPath) return null
  return {
    ...overlay,
    subtitleOutputPath,
  }
}

function isPlayableVideoPath(path?: string) {
  const value = String(path || '').trim()
  if (!value) return false
  const normalized = value.replace(/\\/g, '/').toLowerCase()
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(normalized)
}

function livePhotoDisplayVideoPath(item: LivePhotoItem) {
  const overlay = livePhotoSubtitleOverlay(item)
  if (overlay && isPlayableVideoPath(overlay.subtitleOutputPath)) return overlay.subtitleOutputPath
  return (
    [
      String(item.livePhotoVideoPath || '').trim(),
      String(item.previewVideoPath || '').trim(),
      String(item.motionVideoPath || '').trim(),
    ].find((path) => isPlayableVideoPath(path)) || ''
  )
}

function livePhotoThumbnailPath(item: LivePhotoItem) {
  return (
    [
      String(item.posterPath || '').trim(),
      String(item.livePhotoImagePath || '').trim(),
      String(item.generatedStillPath || '').trim(),
      String(item.referenceImagePath || '').trim(),
    ].find(Boolean) || ''
  )
}

function itemHasSubtitle(item: LivePhotoItem) {
  return Boolean(livePhotoSubtitleOverlay(item))
}

function itemHasAppliedSubtitle(item: LivePhotoItem) {
  return Boolean(item.subtitleOverlayActive && String(item.subtitleOutputPath || '').trim())
}

function resetSubtitleDialog() {
  subtitleDialogOpen.value = false
  subtitleDialogBusy.value = false
  subtitleDialogMode.value = 'batch'
  subtitleDialogTab.value = 'title'
  subtitleTargetIds.value = []
  subtitleDialogItem.value = null
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

function defaultSubtitleTitleForItems(items: LivePhotoItem[]) {
  return (
    items
      .map((item) => String(item.sourceShotLabel || item.sourceProjectTitle || item.productSnapshot?.name || item.id || '').trim())
      .find(Boolean) || 'Live Photo'
  )
}

function openBatchSubtitleDialog() {
  const targets = subtitleEligibleSelectedItems.value
  if (!targets.length) {
    window.alert(t('autoUi.k_e151dcc1a8d1'))
    return
  }
  applySubtitlePreset(subtitleSelectedPreset.value)
  subtitleDialogMode.value = 'batch'
  subtitleDialogTab.value = 'title'
  subtitleTargetIds.value = targets.map((item) => item.id)
  if (subtitleTitleStrategy.value === 'single_for_all' && !String(subtitleTitleText.value || '').trim()) {
    subtitleTitleText.value = defaultSubtitleTitleForItems(targets)
  }
  subtitleDialogOpen.value = true
}

function openSingleSubtitleDialog(item: LivePhotoItem) {
  if (!livePhotoDisplayVideoPath(item)) {
    window.alert(t('autoUi.k_ecd306161e2b'))
    return
  }
  applySubtitlePreset(subtitleSelectedPreset.value)
  subtitleDialogMode.value = 'single'
  subtitleDialogTab.value = 'title'
  subtitleTargetIds.value = [item.id]
  subtitleDialogItem.value = item
  if (subtitleTitleStrategy.value === 'single_for_all' && !String(subtitleTitleText.value || '').trim()) {
    subtitleTitleText.value = defaultSubtitleTitleForItems([item])
  }
  subtitleDialogOpen.value = true
}
async function revertSelectedSubtitles() { const ids = subtitleEligibleSelectedItems.value.filter(itemHasAppliedSubtitle).map((item) => item.id); if (!ids.length || !window.confirm(t('autoUi.k_ceb6710c577d'))) return; subtitleDialogBusy.value = true; try { const result = await window.api.livePhoto.revertSubtitleVideosFromItems({ ids }); selectedLibraryIds.value = selectedLibraryIds.value.filter((id) => !ids.includes(id)); await loadAll(); notice.value = `${Number(result?.reverted || 0)} subtitles reverted` } catch (error: any) { errorText.value = error?.message ?? String(error) } finally { subtitleDialogBusy.value = false } }

async function revertSubtitleFromItem(item: LivePhotoItem) {
  if (!item?.id) return
  if (!itemHasAppliedSubtitle(item)) {
    window.alert(t('autoUi.k_21f9743c8890'))
    return
  }
  const ok = window.confirm(t('autoUi.k_ceb6710c577d'))
  if (!ok) return
  subtitleDialogBusy.value = true
  try {
    await window.api.livePhoto.revertSubtitleVideoFromItem({ id: item.id })
    await loadAll()
    notice.value = t('autoUi.k_b3b598ffcdd4')
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    subtitleDialogBusy.value = false
  }
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
  const targets = filteredLibraryItems.value.filter((item) => subtitleTargetIds.value.includes(item.id) && Boolean(livePhotoDisplayVideoPath(item)))
  if (!targets.length) {
    window.alert(t('autoUi.k_0fd62a176bf0'))
    return
  }
  subtitleDialogBusy.value = true
  try {
    notice.value = t('autoUi.k_3e3db9ad55d3')
    const titleConfig = buildSubtitleTitleConfig()
    const sourceItems = targets.map((item) => ({
      id: `live-photo-${item.id}`,
      sourceType: 'upload' as const,
      sourceVideoPath: livePhotoDisplayVideoPath(item),
      sourceProjectId: item.id,
      sourceProjectTitle: item.sourceProjectTitle || item.productSnapshot?.name,
      fileName: item.sourceShotLabel || item.productSnapshot?.name || item.id,
      coverImagePath: item.posterPath || undefined,
    }))
    const result = await window.api.livePhoto.generateSubtitleVideosForItems({
      name: t('autoUi.k_af6e189c6973', { p0: new Date().toLocaleString('zh-CN') }),
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
    const failedOutputs = (result.outputs || []).filter((item) => item.renderStatus === 'failed')
    const sourceById = new Map((result.sourceItems || []).map((item) => [item.id, item] as const))
    const targetBySourceItemId = new Map(targets.map((item) => [`live-photo-${item.id}`, item.id] as const))
    let appliedCount = 0
    for (const output of result.outputs || []) {
      if (output.renderStatus !== 'success' || !String(output.outputVideoPath || '').trim()) continue
      const source = sourceById.get(output.sourceItemId)
      const livePhotoId =
        String(source?.sourceProjectId || '').trim() ||
        String(targetBySourceItemId.get(String(output.sourceItemId || '').trim()) || '').trim() ||
        String(output.sourceItemId || '')
          .trim()
          .replace(/^live-photo-/, '')
      if (!livePhotoId) continue
      await window.api.livePhoto.applySubtitleVideoToItem({
        id: livePhotoId,
        subtitleVideoPath: String(output.outputVideoPath || '').trim(),
        subtitleCoverImagePath: String(output.coverImagePath || '').trim() || undefined,
      })
      appliedCount += 1
    }
    await loadAll()
    if (!appliedCount) {
      const firstError = String(failedOutputs[0]?.error || '').trim()
      window.alert(firstError || t('autoUi.k_b6c2689e5042'))
      return
    }
    resetSubtitleDialog()
    notice.value = t('autoUi.k_960abbf38680', { p0: appliedCount })
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    window.alert(errorText.value)
  } finally {
    subtitleDialogBusy.value = false
  }
}

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

function openTaskDetail(item: LivePhotoItem) {
  void (async () => {
    detailDialogItem.value = await loadLivePhotoItemDetail(item)
    detailDialogOpen.value = true
  })()
}

function openVideoDialog(item: LivePhotoItem) {
  if (!livePhotoDisplayVideoPath(item)) return
  videoDialogItemId.value = item.id
}

function closeVideoDialog() {
  if (subtitleDialogBusy.value) return
  videoDialogItemId.value = ''
}

function closeTaskDetail() {
  detailDialogOpen.value = false
  detailDialogItem.value = null
}

function referenceMotionTemplateLabel(value: LivePhotoSettings['referenceMotionTemplate']) {
  if (value === 'push_out') return t('autoUi.k_1e4c40cf5d5f')
  if (value === 'ambient_sway') return t('autoUi.k_e95355896fde')
  return t('autoUi.k_1e4c40cf5d5f')
}

async function loadLivePhotoSettings() {
  try {
    const next = await window.api.livePhoto.getSettings()
    if (next && typeof next === 'object') {
      livePhotoSettings.value = {
        ...livePhotoSettings.value,
        ...next,
      }
    }
  } catch {
    // Keep in-memory defaults when settings are temporarily unavailable.
  }
}

async function saveLivePhotoSettings(closeRetrySettings = false) {
  livePhotoSettingsBusy.value = true
  errorText.value = ''
  try {
    livePhotoSettings.value.retryLimit = Math.max(0, Math.min(20, Math.floor(Number(livePhotoSettings.value.retryLimit) || 0)))
    const settingsSnapshot: LivePhotoSettings = {
      referenceMotionTemplate: livePhotoSettings.value.referenceMotionTemplate,
      outputResolution: livePhotoSettings.value.outputResolution,
      frameRate: livePhotoSettings.value.frameRate,
      quality: livePhotoSettings.value.quality,
      qualityCheckerEnabled: livePhotoSettings.value.qualityCheckerEnabled,
      qualityPassThreshold: livePhotoSettings.value.qualityPassThreshold,
      qualityRetryFloor: livePhotoSettings.value.qualityRetryFloor,
      retryLimit: livePhotoSettings.value.retryLimit,
      updatedAt: livePhotoSettings.value.updatedAt,
    }
    const next = await window.api.livePhoto.saveSettings(settingsSnapshot)
    livePhotoSettings.value = {
      ...livePhotoSettings.value,
      ...next,
    }
    notice.value = closeRetrySettings
      ? t('livePhoto.workspace.retrySettingsSaved')
      : t('autoUi.k_9e5018e7d5b4')
    if (closeRetrySettings) livePhotoRetrySettingsOpen.value = false
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    livePhotoSettingsBusy.value = false
  }
}

function formatQualityScore(value?: number) {
  const score = Number(value || 0)
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
}

function selectPromptVersion(id: string) {
  selectedPromptVersionId.value = id
  const selected = promptVersions.value.find((item) => item.id === id)
  promptEditorName.value = selected?.name || ''
  promptEditorText.value = selected?.prompt || ''
  savePromptDraft()
}

function savePromptDraft() {
  promptDrafts[promptKind.value] = {
    versionId: selectedPromptVersionId.value,
    name: promptEditorName.value,
    text: promptEditorText.value,
  }
}

watch([selectedPromptVersionId, promptEditorName, promptEditorText], savePromptDraft, { flush: 'sync' })

async function loadPromptManagement(kind: 'image' | 'video' = promptKind.value) {
  if (promptKind.value !== kind) return
  const requestId = ++promptVersionLoadSequence
  const versions = await window.api.livePhoto.listPromptVersions(kind) as LivePhotoPromptVersion[]
  if (requestId !== promptVersionLoadSequence || promptKind.value !== kind) return
  promptVersions.value = Array.isArray(versions) ? versions : []
  const draft = { ...promptDrafts[kind] }
  const selected = promptVersions.value.find((item) => item.id === draft.versionId)
    || promptVersions.value.find((item) => item.active)
    || promptVersions.value[0]
  if (!selected) {
    selectedPromptVersionId.value = ''
    promptEditorName.value = ''
    promptEditorText.value = ''
    savePromptDraft()
    return
  }
  selectedPromptVersionId.value = selected.id
  promptEditorName.value = draft.versionId === selected.id ? draft.name : selected.name
  promptEditorText.value = draft.versionId === selected.id ? draft.text : selected.prompt
  savePromptDraft()
}

async function createPromptVersion() {
  promptVersionBusy.value = true
  errorText.value = ''
  try {
    const created = await window.api.livePhoto.createPromptVersion({
      name: String(promptEditorName.value || '').trim() || 'Live Photo Product Replacement',
      prompt: promptEditorText.value,
      kind: promptKind.value,
    }) as LivePhotoPromptVersion
    await loadPromptManagement()
    selectPromptVersion(created.id)
    notice.value = t('autoUi.k_dc9af490c182', { p0: created.version })
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    promptVersionBusy.value = false
  }
}

async function updatePromptVersion() {
  if (!selectedPromptVersionId.value) return
  promptVersionBusy.value = true
  errorText.value = ''
  try {
    const updated = await window.api.livePhoto.updatePromptVersion({
      id: selectedPromptVersionId.value,
      name: promptEditorName.value,
      prompt: promptEditorText.value,
      kind: promptKind.value,
    }) as LivePhotoPromptVersion
    await loadPromptManagement()
    await refreshLibraryItems(true)
    notice.value = updated.active
      ? t('autoUi.k_4016d80ac671')
      : t('autoUi.k_5384b125af47')
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    promptVersionBusy.value = false
  }
}

async function activatePromptVersion() {
  if (!selectedPromptVersionId.value) return
  promptVersionBusy.value = true
  try {
    await window.api.livePhoto.activatePromptVersion({ id: selectedPromptVersionId.value, kind: promptKind.value })
    await loadPromptManagement()
    await refreshLibraryItems(true)
    notice.value = t('autoUi.k_975c2f826062')
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    promptVersionBusy.value = false
  }
}

async function rollbackPromptVersion() {
  if (!selectedPromptVersionId.value) return
  promptVersionBusy.value = true
  try {
    const next = await window.api.livePhoto.rollbackPromptVersion({ id: selectedPromptVersionId.value, kind: promptKind.value }) as LivePhotoPromptVersion
    await loadPromptManagement()
    await refreshLibraryItems(true)
    selectPromptVersion(next.id)
    notice.value = t('autoUi.k_3c2338025732', { p0: next.version })
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    promptVersionBusy.value = false
  }
}

async function switchPromptKind(kind: 'image' | 'video') {
  if (promptKind.value === kind) return
  savePromptDraft()
  const draft = { ...promptDrafts[kind] }
  promptKind.value = kind
  selectedPromptVersionId.value = draft.versionId
  promptEditorName.value = draft.name
  promptEditorText.value = draft.text
  await loadPromptManagement(kind)
}

function openRuntimeLogs(item: LivePhotoItem) {
  void (async () => {
    const detailedItem = await loadLivePhotoItemDetail(item)
    const targetLabel = sanitizeVisibleText(String(detailedItem.sourceShotLabel || detailedItem.productSnapshot?.name || detailedItem.id || ''), detailedItem.id)
    runtimeDialogTitle.value = `${uiText.value.runtimeLogTitlePrefix} · ${targetLabel}`
    runtimeLogs.value = Array.isArray(detailedItem.logs) ? [...detailedItem.logs].slice().reverse() : []
    runtimeDialogOpen.value = true
  })()
}

function referenceTaskTitle(item: LivePhotoItem) {
  return fileNameOf(item.referenceImagePath) || item.productSnapshot?.name || item.id
}

function mergeLivePhotoItems(nextItems: LivePhotoItem[]) {
  const map = new Map<string, LivePhotoItem>()
  for (const item of items.value) {
    if (item?.id) map.set(item.id, item)
  }
  for (const item of nextItems) {
    if (item?.id) map.set(item.id, item)
  }
  items.value = Array.from(map.values()).sort(
    (a, b) =>
      Number(b.createdAt || 0) - Number(a.createdAt || 0) ||
      String(b.id).localeCompare(String(a.id)),
  )
}

async function loadWithTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`load timeout after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function refreshLibraryItems(force = false) {
  const nowTs = Date.now()
  if (!force && nowTs - lastLibraryRefreshAt < LIBRARY_REFRESH_DEDUP_WINDOW_MS) return
  try {
    lastLibraryRefreshAt = nowTs
    const nextPage = await loadWithTimeout(
      window.api.livePhoto.listSummaries({
        page: libraryPage.value,
        pageSize: libraryPageSize.value,
        filter: libraryFilter.value,
      }) as Promise<{
        items: LivePhotoItem[]
        filter: string
        page: number
        pageSize: number
        total: number
        totalPages: number
        stats?: { total?: number; running?: number; failed?: number; paused?: number }
      }>,
      4000,
    )
    const normalizedItems = Array.isArray(nextPage?.items) ? nextPage.items : []
    items.value = normalizedItems
    libraryPage.value = Math.max(1, Number(nextPage?.page || 1) || 1)
    libraryPageSize.value = Math.max(1, Number(nextPage?.pageSize || 24) || 24)
    libraryTotal.value = Math.max(0, Number(nextPage?.total || 0) || 0)
    libraryTotalPages.value = Math.max(1, Number(nextPage?.totalPages || 1) || 1)
    libraryStats.value = {
      total: Math.max(0, Number(nextPage?.stats?.total || 0) || 0),
      running: Math.max(0, Number(nextPage?.stats?.running || 0) || 0),
      failed: Math.max(0, Number(nextPage?.stats?.failed || 0) || 0),
      paused: Math.max(0, Number(nextPage?.stats?.paused || 0) || 0),
    }
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

async function loadLivePhotoItemDetail(item: LivePhotoItem) {
  const itemId = String(item?.id || '').trim()
  if (!itemId) return item
  try {
    const detailed = await loadWithTimeout(window.api.livePhoto.get(itemId) as Promise<LivePhotoItem | null>, 4000)
    if (detailed && typeof detailed === 'object') {
      items.value = items.value.map((entry) => (entry.id === detailed.id ? { ...entry, ...detailed } : entry))
      return detailed
    }
  } catch {
    // Keep current summary item when detail loading is temporarily unavailable.
  }
  return item
}

async function refreshLibraryItemsWithWarmup() {
  await refreshLibraryItems()
  if (items.value.length) return
  if (pageVisibleRefreshTimer) {
    clearTimeout(pageVisibleRefreshTimer)
    pageVisibleRefreshTimer = null
  }
  pageVisibleRefreshTimer = setTimeout(() => {
    void refreshLibraryItems()
  }, 1200)
}

function goToLibraryPage(nextPage: number) {
  const safePage = Math.max(1, Math.min(libraryTotalPages.value || 1, Number(nextPage || 1) || 1))
  if (safePage === libraryPage.value) return
  libraryPage.value = safePage
  void refreshLibraryItems(true)
}

watch(libraryFilter, () => {
  libraryPage.value = 1
  void refreshLibraryItems()
})

async function loadAll() {
  loading.value = true
  try {
    await refreshLibraryItems()
    try {
      const nextProducts = await loadWithTimeout(window.api.products.list() as Promise<Product[]>, 4000)
      products.value = Array.isArray(nextProducts) ? nextProducts : []
    } catch {
      // Keep previous products when the companion query is slow.
    }
    try {
      await refreshProductImageMaterials()
    } catch {
      // Keep previous material options when the companion query is slow.
    }
    if (!selectedProductId.value && products.value[0]) selectedProductId.value = products.value[0].id
    try {
      await loadPromptManagement()
    } catch {
      // Prompt management is optional for older installations.
    }
  } finally {
    loading.value = false
  }
}

async function refreshProductImageMaterials() {
  const nextMaterials = await loadWithTimeout(
    window.api.productImageMaterials.listMaterials({
      userId: 'desktop-local',
      filters: { category: 'all', usageStatus: 'all' },
    }) as Promise<ProductImageMaterialOption[]>,
    4000,
  )
  productImageMaterials.value = Array.isArray(nextMaterials) ? nextMaterials : []
  const validMaterialIds = new Set(productImageMaterials.value.map((item) => item.id))
  selectedMaterialImageIds.value = selectedMaterialImageIds.value.filter((item) => validMaterialIds.has(item))
}

async function pickReferenceImage() {
  const pickFilesOverride = (window as any).__VG_TEST_pickFiles as
    | ((payload: {
        title?: string
        filters?: Array<{ name: string; extensions: string[] }>
        multiple?: boolean
      }) => Promise<string[]>)
    | undefined
  const paths = await (pickFilesOverride ?? window.api.pickFiles)({
    title: t('livePhoto.pickers.referenceImageTitle'),
    filters: [{ name: t('livePhoto.pickers.imagesFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    multiple: true,
  })
  const mergedPaths = dedupePaths([...referenceImagePaths.value, ...(Array.isArray(paths) ? paths : [])])
  const { existingPaths, missingPaths } = await splitExistingReferencePaths(mergedPaths)
  referenceImagePaths.value = mergedPaths
  referenceMissingPaths.value = missingPaths
  if (!existingPaths.length && mergedPaths.length) {
    notice.value = ''
  } else if (missingPaths.length) {
    notice.value = t('autoUi.k_74cad9baa9fd', { p0: missingPaths.length })
  }
}

async function pickReferenceImageFromLibrary() {
  const selected = await openAssetLibraryPicker({ type: 'image', multiple: true })
  if (!selected?.length) return
  const mergedPaths = dedupePaths([...referenceImagePaths.value, ...selected.map((item) => item.filePath)])
  const { existingPaths, missingPaths } = await splitExistingReferencePaths(mergedPaths)
  referenceImagePaths.value = mergedPaths
  referenceMissingPaths.value = missingPaths
  if (!existingPaths.length && mergedPaths.length) notice.value = ''
  else if (missingPaths.length) notice.value = t('autoUi.k_74cad9baa9fd', { p0: missingPaths.length })
}

function openMaterialPicker() {
  materialPickerPage.value = 1
  materialPickerOpen.value = true
}

function closeMaterialPicker() {
  materialPickerOpen.value = false
}

function toggleMaterialImageSelection(materialId: string) {
  const next = new Set(selectedMaterialImageIds.value)
  if (next.has(materialId)) next.delete(materialId)
  else next.add(materialId)
  selectedMaterialImageIds.value = Array.from(next)
}

function selectAllMaterialImages() {
  selectedMaterialImageIds.value = pagedMaterialOptions.value.map((item) => item.id)
}

function clearMaterialImageSelection() {
  const pagedIds = new Set(pagedMaterialOptions.value.map((item) => item.id))
  selectedMaterialImageIds.value = selectedMaterialImageIds.value.filter((item) => !pagedIds.has(item))
}

function materialIdsFromPaths(paths: string[]) {
  const pathSet = new Set((paths || []).map((item) => String(item || '').trim()).filter(Boolean))
  return productImageMaterials.value
    .filter((item) => pathSet.has(String(item.localImagePath || '').trim()))
    .map((item) => item.id)
}

async function appendMaterialImagesAsReferences() {
  const selectedIds = selectedMaterialOptions.value.map((item) => item.id)
  if (!selectedIds.length) return
  const resolved = await window.api.productImageMaterials.resolveMaterialImages({
    userId: 'desktop-local',
    materialIds: selectedIds,
  }) as ProductImageMaterialOption[]
  const resolvedById = new Map(resolved.map((item) => [item.id, item]))
  productImageMaterials.value = productImageMaterials.value.map((item) => resolvedById.get(item.id) || item)
  const selectedPaths = selectedIds.map((id) => String(resolvedById.get(id)?.localImagePath || '').trim()).filter(Boolean)
  if (!selectedPaths.length) return
  const mergedPaths = dedupePaths([...referenceImagePaths.value, ...selectedPaths])
  const { existingPaths, missingPaths } = await splitExistingReferencePaths(mergedPaths)
  referenceImagePaths.value = mergedPaths
  referenceMissingPaths.value = missingPaths
  referenceMaterialIds.value = dedupePaths([...referenceMaterialIds.value, ...selectedMaterialOptions.value.map((item) => item.id)])
  selectedMaterialImageIds.value = []
  closeMaterialPicker()
  await Promise.all(selectedIds.map((materialId) =>
    window.api.productImageMaterials.updateUsageStatus({
      userId: 'desktop-local',
      materialId,
      usageStatus: 'used',
    }).catch(() => null),
  ))
  productImageMaterials.value = productImageMaterials.value.map((item) =>
    selectedIds.includes(item.id) ? { ...item, usageStatus: 'used' } : item,
  )
  if (!existingPaths.length && mergedPaths.length) {
    notice.value = ''
  } else if (missingPaths.length) {
    notice.value = t('autoUi.k_74cad9baa9fd', { p0: missingPaths.length })
  }
}

function removeReferenceImage(path: string) {
  referenceImagePaths.value = referenceImagePaths.value.filter((item) => item !== path)
  referenceMissingPaths.value = referenceMissingPaths.value.filter((item) => item !== path)
  const removedMaterialIds = new Set(materialIdsFromPaths([path]))
  if (removedMaterialIds.size) {
    referenceMaterialIds.value = referenceMaterialIds.value.filter((item) => !removedMaterialIds.has(item))
  }
}

async function createReferenceItem() {
  if (!referenceImagePaths.value.length || !selectedProductId.value) return
  if (!selectedProductReadyForLivePhoto.value) {
    errorText.value = t('autoUi.k_df905e7370e1')
    notice.value = ''
    return
  }
  creatingReference.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const { existingPaths, missingPaths } = await splitExistingReferencePaths(referenceImagePaths.value)
    if (!existingPaths.length) {
      throw new Error(t('autoUi.k_35ccc4d3cae8'))
    }
    if (missingPaths.length) {
      notice.value = t('autoUi.k_74cad9baa9fd', { p0: missingPaths.length })
      referenceImagePaths.value = existingPaths
      referenceMissingPaths.value = missingPaths
    }
    activeTab.value = 'library'
    await nextTick()
    const referencePathsSnapshot = [...existingPaths]
    const referenceMaterialIdsSnapshot = [...new Set(referenceMaterialIds.value.filter((materialId) =>
      existingPaths.some((path) => materialIdsFromPaths([path]).includes(materialId)),
    ))]
    const selectedProductIdSnapshot = selectedProductId.value
    notice.value =
      existingPaths.length > 1
        ? `${uiText.value.referenceCreatedPrefix} ${existingPaths.length} ${uiText.value.referenceCreatedSuffix}`
        : t('livePhoto.messages.referenceCreated')
    referenceImagePaths.value = []
    referenceMissingPaths.value = []
    referenceMaterialIds.value = []
    creatingReference.value = false
    void (async () => {
      if (referenceMaterialIdsSnapshot.length) {
        await Promise.all(
          referenceMaterialIdsSnapshot.map((materialId) =>
            window.api.productImageMaterials.updateUsageStatus({
              userId: 'desktop-local',
              materialId,
              usageStatus: 'used',
            }).catch(() => null),
          ),
        )
      }
      const created = await window.api.livePhoto.enqueueReference({
        referenceImagePaths: referencePathsSnapshot,
        productId: selectedProductIdSnapshot,
        motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
      })
      const createdItems = (Array.isArray(created) ? created : [created]).filter(Boolean) as LivePhotoItem[]
      mergeLivePhotoItems(createdItems)
      await window.api.livePhoto.startReference({
        ids: createdItems.map((item) => item.id),
        motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
      })
    })()
      .catch((error: any) => {
        errorText.value = error?.message ?? String(error)
      })
      .finally(() => {
        void refreshProductImageMaterials().catch(() => null)
        void refreshLibraryItems()
      })
    return
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
  creatingReference.value = false
}

async function exportSelected() {
  if (!selectedLibraryIds.value.length) return
  exporting.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const pickDirOverride = (window as any).__VG_TEST_pickDir as
      | ((payload: { title?: string }) => Promise<string>)
      | undefined
    const pickedDir = await (pickDirOverride ?? window.api.pickDir)({ title: t('livePhoto.pickers.exportDirectoryTitle') })
    const outputDir = String(pickedDir || '').trim()
    if (!outputDir) {
      notice.value = t('autoUi.k_94870c503eed')
      return
    }
    const result = await window.api.livePhoto.exportItems({
      ids: [...selectedLibraryIds.value],
      outputDir,
      settings: {
        ...livePhotoSettings.value,
      },
    })
    const exportedCount = Number(result?.exported?.length || 0)
    const skipped = Array.isArray(result?.skipped) ? result.skipped : []
    if (!exportedCount && skipped.length) {
      const reasonText = skipped
        .map((item: { id?: string; reason?: string }) => String(item?.reason || '').trim())
        .filter(Boolean)
        .slice(0, 3)
        .join('；')
      notice.value = reasonText ? t('autoUi.k_0e2d25ce06fd', { p0: reasonText }) : t('autoUi.k_b737560f461e')
    } else {
      notice.value = t('livePhoto.messages.exportedCount', { count: exportedCount })
      if (skipped.length) {
        notice.value += t('autoUi.k_ffb217ae79d6', { p0: skipped.length })
      }
    }
    selectedLibraryIds.value = selectedLibraryIds.value.filter((id) => !result?.exported?.some((item: { id: string }) => item.id === id))
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    exporting.value = false
  }
}

async function openPath(path?: string) {
  const value = String(path || '').trim()
  if (!value) return
  await window.api.shell.openPath(value)
}

async function showPath(path?: string) {
  const value = String(path || '').trim()
  if (!value) return
  await window.api.shell.showItemInFolder(value)
}

async function removeItem(id: string) {
  await window.api.livePhoto.remove(id)
  selectedLibraryIds.value = selectedLibraryIds.value.filter((item) => item !== id)
  await loadAll()
}

function openBatchDelete() {
  if (selectedLibraryIds.value.length) batchDeleteOpen.value = true
}

async function confirmBatchDelete() {
  if (!selectedLibraryIds.value.length || batchDeleteBusy.value) return
  batchDeleteBusy.value = true
  errorText.value = ''
  notice.value = ''
  const ids = [...selectedLibraryIds.value]
  const failedIds: string[] = []
  let deletedCount = 0
  try {
    for (const id of ids) {
      try {
        await window.api.livePhoto.remove(id)
        deletedCount += 1
      } catch {
        failedIds.push(id)
      }
    }
    selectedLibraryIds.value = failedIds
    batchDeleteOpen.value = false
    await loadAll()
    if (deletedCount) notice.value = t('autoUi.k_e988f0111f99', { p0: deletedCount })
    if (failedIds.length) errorText.value = t('autoUi.k_2e4898151fcc', { p0: failedIds.length })
  } finally {
    batchDeleteBusy.value = false
  }
}

function clampRegionValue(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function canCorrectReplacementRegion(item: LivePhotoItem) {
  return item.sourceType === 'reference_replace' && Boolean(String(item.referenceImagePath || '').trim()) && item.packagingStatus !== 'processing'
}

function replacementRegionStyle() {
  return {
    left: `${replacementRegionDraft.x * 100}%`,
    top: `${replacementRegionDraft.y * 100}%`,
    width: `${replacementRegionDraft.width * 100}%`,
    height: `${replacementRegionDraft.height * 100}%`,
  }
}

async function openReplacementRegionEditor(item: LivePhotoItem) {
  const detail = await loadLivePhotoItemDetail(item)
  const region = detail.replacementRegion
  replacementRegionDraft.x = Number(region?.x ?? 0.25)
  replacementRegionDraft.y = Number(region?.y ?? 0.25)
  replacementRegionDraft.width = Number(region?.width ?? 0.5)
  replacementRegionDraft.height = Number(region?.height ?? 0.5)
  replacementRegionDialogItem.value = detail
  replacementRegionDialogOpen.value = true
}

function closeReplacementRegionEditor() {
  if (replacementRegionBusy.value) return
  replacementRegionInteraction.value = null
  replacementRegionDialogOpen.value = false
  replacementRegionDialogItem.value = null
}

function normalizedRegionPointer(event: PointerEvent) {
  const stage = replacementRegionStage.value
  if (!stage) return { x: 0, y: 0 }
  const bounds = stage.getBoundingClientRect()
  return {
    x: clampRegionValue((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1),
    y: clampRegionValue((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1),
  }
}

function beginReplacementRegionInteraction(event: PointerEvent, mode: 'draw' | 'move' | 'resize', corner?: 'nw' | 'ne' | 'sw' | 'se') {
  const point = normalizedRegionPointer(event)
  replacementRegionStage.value?.setPointerCapture(event.pointerId)
  const initial = { ...replacementRegionDraft }
  if (mode === 'draw') {
    replacementRegionDraft.x = point.x
    replacementRegionDraft.y = point.y
    replacementRegionDraft.width = 0.02
    replacementRegionDraft.height = 0.02
  }
  replacementRegionInteraction.value = {
    mode,
    corner,
    startX: point.x,
    startY: point.y,
    initial: mode === 'draw' ? { x: point.x, y: point.y, width: 0, height: 0 } : initial,
  }
}

function updateReplacementRegionInteraction(event: PointerEvent) {
  const interaction = replacementRegionInteraction.value
  if (!interaction) return
  const point = normalizedRegionPointer(event)
  const dx = point.x - interaction.startX
  const dy = point.y - interaction.startY
  const initial = interaction.initial
  if (interaction.mode === 'draw') {
    replacementRegionDraft.x = Math.min(initial.x, point.x)
    replacementRegionDraft.y = Math.min(initial.y, point.y)
    replacementRegionDraft.width = Math.max(0.02, Math.abs(point.x - initial.x))
    replacementRegionDraft.height = Math.max(0.02, Math.abs(point.y - initial.y))
    return
  }
  if (interaction.mode === 'move') {
    replacementRegionDraft.x = clampRegionValue(initial.x + dx, 0, 1 - initial.width)
    replacementRegionDraft.y = clampRegionValue(initial.y + dy, 0, 1 - initial.height)
    return
  }
  let left = initial.x
  let top = initial.y
  let right = initial.x + initial.width
  let bottom = initial.y + initial.height
  if (interaction.corner?.includes('w')) left = clampRegionValue(initial.x + dx, 0, right - 0.02)
  if (interaction.corner?.includes('e')) right = clampRegionValue(initial.x + initial.width + dx, left + 0.02, 1)
  if (interaction.corner?.includes('n')) top = clampRegionValue(initial.y + dy, 0, bottom - 0.02)
  if (interaction.corner?.includes('s')) bottom = clampRegionValue(initial.y + initial.height + dy, top + 0.02, 1)
  replacementRegionDraft.x = left
  replacementRegionDraft.y = top
  replacementRegionDraft.width = right - left
  replacementRegionDraft.height = bottom - top
}

function endReplacementRegionInteraction(event: PointerEvent) {
  replacementRegionInteraction.value = null
  if (replacementRegionStage.value?.hasPointerCapture(event.pointerId)) {
    replacementRegionStage.value.releasePointerCapture(event.pointerId)
  }
}

async function saveReplacementRegionAndRetry() {
  const item = replacementRegionDialogItem.value
  if (!item?.id) return
  replacementRegionBusy.value = true
  errorText.value = ''
  try {
    await window.api.livePhoto.retry({
      id: item.id,
      motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
      retryMode: 'manual_once',
      replacementRegion: { ...replacementRegionDraft },
    })
    notice.value = t('autoUi.k_24ad33fba50a')
    replacementRegionBusy.value = false
    closeReplacementRegionEditor()
    closeTaskDetail()
    await refreshLibraryItemsWithWarmup()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    replacementRegionBusy.value = false
  }
}

async function retryItem(item: LivePhotoItem) {
  if (!item?.id) return
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.livePhoto.retry({
      id: item.id,
      motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
      retryMode: 'manual_once',
    })
    notice.value = item.packagingStatus === 'failed' ? t('livePhoto.messages.retried') : t('livePhoto.messages.regenerated')
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

async function retryFailedItems() {
  const targets = retryableFailedLibraryItems.value
  if (!targets.length) return
  errorText.value = ''
  notice.value = ''
  try {
    await Promise.all(
      targets.map((item) =>
        window.api.livePhoto.retry({
          id: item.id,
          motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
          retryMode: 'manual_once',
        }),
      ),
    )
    notice.value = t('autoUi.k_b6ae72694d09', { p0: targets.length })
    await refreshLibraryItemsWithWarmup()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

async function pauseRunningItems() {
  const targets = runningLibraryItems.value.filter((item) => !item.autoFlowStatus?.paused)
  if (!targets.length) return
  errorText.value = ''
  try {
    await Promise.all(targets.map((item) => window.api.livePhoto.pauseAutoFlow({ id: item.id })))
    notice.value = t('autoUi.k_ab2158ab7049', { p0: targets.length })
    await refreshLibraryItemsWithWarmup()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

async function resumePausedItems() {
  const targets = pausedLibraryItems.value
  if (!targets.length) return
  errorText.value = ''
  try {
    await Promise.all(
      targets.map((item) =>
        window.api.livePhoto.resumeAutoFlow({
          id: item.id,
          motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
        }),
      ),
    )
    notice.value = t('autoUi.k_4562082cd7d4', { p0: targets.length })
    await refreshLibraryItemsWithWarmup()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

function toggleSelectAllFiltered() {
  const currentIds = filteredLibraryItems.value.map((item) => item.id)
  const allSelected = currentIds.length > 0 && currentIds.every((id) => selectedLibraryIds.value.includes(id))
  if (allSelected) {
    selectedLibraryIds.value = selectedLibraryIds.value.filter((id) => !currentIds.includes(id))
    return
  }
  selectedLibraryIds.value = Array.from(new Set([...selectedLibraryIds.value, ...currentIds]))
}

async function pauseItemAutoFlow(item: LivePhotoItem) {
  errorText.value = ''
  try {
    await window.api.livePhoto.pauseAutoFlow({ id: item.id })
    await refreshLibraryItems()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

async function resumeItemAutoFlow(item: LivePhotoItem) {
  errorText.value = ''
  try {
    await window.api.livePhoto.resumeAutoFlow({
      id: item.id,
      motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
    })
    await refreshLibraryItems()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

function canContinueWithVideo(item: LivePhotoItem) {
  const status = item.autoFlowStatus
  const reason = String(status?.lastError || item.error || '')
  return Boolean(
      item.sourceType === 'reference_replace' &&
      status?.failedStage !== 'video' &&
      status?.retryScope !== 'video' &&
      status?.paused &&
      status.status === 'failed_terminal' &&
      (status.imageRetryMode === 'manual_once' || Number(status.retryCount || 0) >= Number(status.retryLimit || 0)) &&
      reason.includes('[image_validation_failed]') &&
      item.generatedStillPath,
  )
}

function canRetryImageOnce(item: LivePhotoItem) {
  const status = item.autoFlowStatus
  const reason = String(status?.lastError || item.error || '')
  return Boolean(item.sourceType === 'reference_replace' && status?.failedStage !== 'video' && status?.retryScope !== 'video' && status?.paused && status.status === 'failed_terminal' && reason.includes('[image_validation_failed]') && item.referenceImagePath)
}

async function continueWithVideo(item: LivePhotoItem) {
  errorText.value = ''
  try {
    await window.api.livePhoto.continueWithVideo({
      id: item.id,
      motionTemplate: livePhotoSettings.value.referenceMotionTemplate,
    })
    notice.value = t('livePhoto.workspace.continueWithVideoStarted')
    await refreshLibraryItemsWithWarmup()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

function toggleLibrarySelection(id: string) {
  if (selectedLibraryIds.value.includes(id)) selectedLibraryIds.value = selectedLibraryIds.value.filter((item) => item !== id)
  else selectedLibraryIds.value = [...selectedLibraryIds.value, id]
}

onMounted(async () => {
  await loadAll()
  await loadLivePhotoSettings()
  window.addEventListener('focus', refreshLibraryItemsWithWarmup)
  document.addEventListener('visibilitychange', handleVisibilityRefresh)
})

onBeforeUnmount(() => {
  if (libraryAutoRefreshTimer) {
    clearInterval(libraryAutoRefreshTimer)
    libraryAutoRefreshTimer = null
  }
  if (pageVisibleRefreshTimer) {
    clearTimeout(pageVisibleRefreshTimer)
    pageVisibleRefreshTimer = null
  }
  window.removeEventListener('focus', refreshLibraryItemsWithWarmup)
  document.removeEventListener('visibilitychange', handleVisibilityRefresh)
})

function handleVisibilityRefresh() {
  if (document.visibilityState === 'visible') {
    void refreshLibraryItemsWithWarmup()
  }
}

watch(activeTab, async (tab) => {
  if (tab === 'library') {
    await refreshLibraryItemsWithWarmup()
    return
  }
})

watch(
  activeTab,
  (tab) => {
    if (libraryAutoRefreshTimer) {
      clearInterval(libraryAutoRefreshTimer)
      libraryAutoRefreshTimer = null
    }
    if (tab === 'library') {
      libraryAutoRefreshTimer = setInterval(() => {
        void refreshLibraryItemsWithWarmup()
      }, LIBRARY_REFRESH_INTERVAL_MS)
    }
  },
  { immediate: true },
)

watch([unboundMaterialOptions, materialPickerPageSize], () => {
  if (materialPickerPage.value > materialPickerTotalPages.value) {
    materialPickerPage.value = materialPickerTotalPages.value
  }
})
</script>

<template>
  <div class="live-photo-page lp" data-testid="live-photo-page">
    <div class="vg-scope lp-main">
      <!-- ============ head + tabs ============ -->
      <section class="lp-top">
        <header class="lp-head">
          <div class="lp-head__icon"><Sparkles :size="20" /></div>
          <div class="lp-head__text">
            <h1>{{ uiText.workspaceTitle }}</h1>
            <p>{{ uiText.workspaceHint }}</p>
          </div>
          <div class="lp-head__actions">
            <button class="vg-btn" data-testid="live-photo-back" type="button" @click="router.push('/plugins?tab=installed&plugin=live-photo-generator')">
              <ChevronLeft :size="15" />{{ t('livePhoto.hero.back') }}
            </button>
            <button class="vg-btn" data-testid="live-photo-refresh" type="button" :disabled="loading" @click="loadAll">
              <RefreshCcw :size="14" :class="{ 'vg-spin': loading }" />{{ t('livePhoto.hero.refresh') }}
            </button>
          </div>
        </header>

        <nav class="lp-tabs" role="tablist">
          <button class="lp-tab" data-testid="live-photo-tab-reference" :class="{ 'is-active': activeTab === 'reference' }" role="tab" type="button" @click="activeTab = 'reference'">
            <ImagePlus :size="15" />{{ uiText.tabReference }}
          </button>
          <button class="lp-tab" data-testid="live-photo-tab-library" :class="{ 'is-active': activeTab === 'library' }" role="tab" type="button" @click="activeTab = 'library'">
            <FolderOpen :size="15" />{{ uiText.tabLibrary }}<em>{{ libraryStats.total }}</em>
          </button>
          <span class="lp-tabs__spacer" />
          <button class="lp-util" data-testid="live-photo-open-retry-settings" type="button" @click="livePhotoRetrySettingsOpen = true">
            <Settings :size="14" />{{ t('livePhoto.workspace.retryGuard') }}<em>{{ livePhotoSettings.retryLimit ?? 0 }}</em>
          </button>
        </nav>
      </section>

      <div v-if="notice" class="vg-notice vg-notice--accent lp-flash" data-testid="live-photo-notice">
        <CheckCircle2 :size="15" /><span>{{ notice }}</span>
        <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="notice = ''"><X :size="13" /></button>
      </div>
      <div v-if="errorText" class="vg-notice vg-notice--danger lp-flash" data-testid="live-photo-error">
        <AlertTriangle :size="15" /><span>{{ errorText }}</span>
        <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="errorText = ''"><X :size="13" /></button>
      </div>

      <!-- ============ 从参考图创建 ============ -->
      <section v-if="activeTab === 'reference'" class="lp-create">
        <div class="lp-col">
          <article class="lp-card">
            <header class="lp-card__head">
              <span class="lp-num">1</span>
              <div class="lp-card__title">
                <h2>{{ uiText.referenceTitle }}</h2>
                <p>{{ uiText.referenceNote }}</p>
              </div>
            </header>

            <div class="lp-field">
              <div class="lp-field__label">
                <span>{{ uiText.referenceImage }}</span>
                <small v-if="referenceImagePaths.length" class="vg-num">{{ referenceImagePaths.length }} {{ uiText.referenceQueuedSuffix }}</small>
              </div>

              <div v-if="referenceTaskRows.length" class="lp-refs">
                <div v-for="row in referenceTaskRows" :key="row.id" class="lp-ref" :class="{ 'is-missing': row.missing }" :title="row.path">
                  <img v-if="!row.missing" :src="previewSrc(row.path)" alt="" loading="lazy" decoding="async" />
                  <span v-else class="lp-ref__missing"><AlertTriangle :size="16" />{{ uiText.missingImage }}</span>
                  <span class="lp-ref__name">{{ row.fileName }}</span>
                  <button class="lp-ref__remove" type="button" :title="uiText.delete" :aria-label="uiText.delete" @click="removeReferenceImage(row.path)"><X :size="12" /></button>
                </div>
                <button class="lp-ref lp-ref--add" type="button" @click="pickReferenceImage"><ImagePlus :size="18" /></button>
              </div>
              <button v-else class="lp-drop" data-testid="live-photo-pick-reference" type="button" @click="pickReferenceImage">
                <span class="lp-drop__icon"><ImagePlus :size="22" /></span>
                <strong>{{ uiText.referenceUploadTitle }}</strong>
                <small>{{ uiText.referenceUploadDesc }}</small>
              </button>

              <div class="lp-row lp-row--fill">
                <button v-if="referenceTaskRows.length" class="vg-btn" data-testid="live-photo-pick-reference" type="button" @click="pickReferenceImage">
                  <ImagePlus :size="15" />{{ lpText.localPick }}
                </button>
                <button class="vg-btn" type="button" @click="pickReferenceImageFromLibrary">
                  <FolderOpen :size="15" />{{ lpText.assetLibrary }}
                </button>
                <button class="vg-btn" data-testid="live-photo-open-material-picker" type="button" @click="openMaterialPicker">
                  <LayoutGrid :size="15" />{{ uiText.materialLibrarySelect }}<em class="lp-btn-count">{{ unboundMaterialOptions.length }}</em>
                </button>
              </div>
              <input :value="primaryReferenceImage" data-testid="live-photo-reference-path" class="sr-only" readonly />
            </div>

            <div class="lp-field">
              <div class="lp-field__label"><span>{{ uiText.product }}</span></div>
              <div class="lp-product">
                <button class="lp-product__pick" data-testid="live-photo-product-select" type="button" @click="productPickerOpen = true">
                  <span class="lp-product__thumb">
                    <img v-if="selectedProduct?.coverImagePath" :src="previewSrc(selectedProduct.coverImagePath)" alt="" />
                    <Package v-else :size="16" />
                  </span>
                  <span class="lp-product__name">
                    <strong>{{ selectedProduct?.name || t('livePhoto.workspace.selectProduct') }}</strong>
                    <small v-if="selectedProduct">{{ selectedProduct.type }}</small>
                  </span>
                  <ChevronDown :size="15" class="lp-product__chev" />
                </button>
                <div class="lp-master" :class="{ 'is-missing': !selectedProductLivePhotoRef }">
                  <button v-if="selectedProductLivePhotoRef" class="lp-master__thumb" type="button" :title="selectedProductLivePhotoRef" @click="openPath(selectedProductLivePhotoRef)">
                    <img :src="previewSrc(selectedProductLivePhotoRef)" alt="" />
                  </button>
                  <span v-else class="lp-master__thumb"><AlertTriangle :size="15" /></span>
                  <span class="lp-master__text">
                    <small>{{ t('livePhoto.workspace.primaryImage') }}</small>
                    <strong v-if="selectedProductLivePhotoRef" :title="selectedProductLivePhotoRef">{{ fileNameOf(selectedProductLivePhotoRef) }}</strong>
                    <strong v-else>{{ t('livePhoto.workspace.primaryImageRequired') }}</strong>
                  </span>
                </div>
              </div>
            </div>

            <footer class="lp-card__foot">
              <span class="lp-safe"><ShieldCheck :size="14" />{{ uiText.referenceSafe }}</span>
              <button class="vg-btn vg-btn--primary vg-btn--lg" data-testid="live-photo-create-reference" type="button" :disabled="creatingReference || !referenceImagePaths.length || !selectedProductId || !selectedProductReadyForLivePhoto" @click="createReferenceItem">
                <LoaderCircle v-if="creatingReference" :size="16" class="vg-spin" />
                <Sparkles v-else :size="16" />
                {{ creatingReference ? t('livePhoto.actions.creating') : `${uiText.createTaskPrefix} (${referenceImagePaths.length || 0})` }}
              </button>
            </footer>
          </article>

          <article v-if="referenceCreatedItems.length" class="lp-card lp-card--flush">
            <header class="lp-card__bar">
              <h3>{{ uiText.referenceTaskList }}<em>{{ referenceCreatedItems.length }}</em></h3>
              <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" @click="activeTab = 'library'">{{ uiText.tabLibrary }}<ChevronRight :size="14" /></button>
            </header>
            <div class="lp-recent">
              <div v-for="item in referenceCreatedItems" :key="item.id" class="lp-recent__row">
                <span class="lp-recent__thumb">
                  <img v-if="livePhotoThumbnailPath(item)" :src="previewSrc(livePhotoThumbnailPath(item))" alt="" loading="lazy" decoding="async" />
                  <FileImage v-else :size="15" />
                </span>
                <div class="lp-recent__main">
                  <strong :title="referenceTaskTitle(item)">{{ referenceTaskTitle(item) }}</strong>
                  <small>{{ item.productSnapshot?.name || '--' }} · {{ liveTaskMetaSummary(item) }}</small>
                </div>
                <span class="vg-num lp-recent__time">{{ formatTime(item.updatedAt) }}</span>
                <span class="lp-state" :class="lpTone(item)"><i />{{ itemStatusLabel(item.packagingStatus) }}</span>
              </div>
            </div>
          </article>
        </div>

        <div class="lp-col">
          <article class="lp-card">
            <header class="lp-card__head">
              <span class="lp-num">2</span>
              <div class="lp-card__title">
                <h2>{{ uiText.rulesTitle }}</h2>
                <p>{{ uiText.outputDesc }}</p>
              </div>
              <span class="vg-chip">{{ uiText.rulesVersion }}</span>
            </header>
            <ol class="lp-rules">
              <li><span>1</span>{{ uiText.ruleIdentity }}</li>
              <li><span>2</span>{{ uiText.ruleReplace }}</li>
              <li><span>3</span>{{ uiText.ruleMotion }}</li>
              <li><span>4</span>{{ uiText.rulePackage }}</li>
            </ol>
          </article>

          <article class="lp-card">
            <header class="lp-card__head">
              <span class="lp-num">3</span>
              <div class="lp-card__title">
                <h2>{{ t('livePhoto.workspace.promptVersion') }}</h2>
              </div>
              <div class="lp-seg" role="tablist">
                <button :class="{ 'is-on': promptKind === 'image' }" type="button" role="tab" :aria-selected="promptKind === 'image'" :disabled="promptVersionBusy" @click="switchPromptKind('image')">{{ t('promptKind.image') }}</button>
                <button :class="{ 'is-on': promptKind === 'video' }" type="button" role="tab" :aria-selected="promptKind === 'video'" :disabled="promptVersionBusy" @click="switchPromptKind('video')">{{ t('promptKind.video') }}</button>
              </div>
            </header>
            <div class="vg-form-grid">
              <label class="vg-field">
                <span class="vg-field__label">{{ t('livePhoto.workspace.promptVersion') }}</span>
                <select v-model="selectedPromptVersionId" class="vg-select" @change="selectPromptVersion(selectedPromptVersionId)">
                  <option v-for="version in promptVersions" :key="version.id" :value="version.id">
                    V{{ version.version }} · {{ version.name }}{{ version.active ? ` · ${t('livePhoto.workspace.activeVersion')}` : '' }}
                  </option>
                </select>
              </label>
              <label class="vg-field">
                <span class="vg-field__label">{{ t('livePhoto.workspace.versionName') }}</span>
                <input v-model="promptEditorName" class="vg-input" type="text" placeholder="Live Photo Product Replacement" />
              </label>
            </div>
            <label class="vg-field">
              <span class="vg-field__label">{{ t('livePhoto.workspace.promptContent') }}</span>
              <textarea v-model="promptEditorText" class="vg-textarea lp-prompt" rows="10" spellcheck="false" />
            </label>
            <footer class="lp-card__foot">
              <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="promptVersionBusy || !selectedPromptVersionId" @click="rollbackPromptVersion"><RefreshCcw :size="13" />{{ t('livePhoto.workspace.rollbackVersion') }}</button>
              <div class="lp-row">
                <button class="vg-btn vg-btn--sm" type="button" :disabled="promptVersionBusy || !promptEditorText.trim()" @click="createPromptVersion">{{ t('livePhoto.workspace.copyVersion') }}</button>
                <button class="vg-btn vg-btn--sm" type="button" :disabled="promptVersionBusy || !selectedPromptVersionId" @click="activatePromptVersion">{{ t('livePhoto.workspace.activateVersion') }}</button>
                <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="promptVersionBusy || !selectedPromptVersionId" @click="updatePromptVersion">{{ t('livePhoto.workspace.updateVersion') }}</button>
              </div>
            </footer>
          </article>
        </div>
      </section>

      <!-- ============ 库 / 导出 ============ -->
      <section v-else class="lp-card lp-card--flush lp-library">
        <header class="lp-bar">
          <div class="lp-bar__title">
            <h2>{{ uiText.libraryTitle }}<em class="vg-num">{{ libraryStats.total }} {{ uiText.itemUnit }}</em></h2>
            <div class="lp-stats">
              <span class="lp-stat lp-stat--run"><i />{{ t('livePhoto.workspace.running') }} <b class="vg-num">{{ libraryStats.running }}</b></span>
              <span class="lp-stat lp-stat--err"><i />{{ t('livePhoto.status.failed') }} <b class="vg-num">{{ libraryStats.failed }}</b></span>
              <span class="lp-stat lp-stat--warn"><i />{{ t('livePhoto.workspace.paused') }} <b class="vg-num">{{ libraryStats.paused }}</b></span>
            </div>
          </div>
          <div class="lp-bar__tools">
            <div class="lp-seg">
              <button v-for="filterItem in libraryStatusFilters" :key="filterItem.key" type="button" :class="{ 'is-on': libraryFilter === filterItem.key }" @click="setLibraryFilter(filterItem.key)">{{ filterItem.label }}</button>
            </div>
            <div class="lp-seg" :aria-label="t('livePhoto.workspace.viewMode')">
              <button :class="{ 'is-on': libraryViewMode === 'grid' }" type="button" :aria-label="t('livePhoto.workspace.gridView')" :aria-pressed="libraryViewMode === 'grid'" @click="libraryViewMode = 'grid'"><Grid2x2 :size="14" /></button>
              <button :class="{ 'is-on': libraryViewMode === 'list' }" type="button" :aria-label="t('livePhoto.workspace.listView')" :aria-pressed="libraryViewMode === 'list'" @click="libraryViewMode = 'list'"><List :size="14" /></button>
            </div>
          </div>
        </header>

        <div class="lp-selbar" :class="{ 'is-live': selectedLibraryIds.length }">
          <label class="lp-check">
            <input type="checkbox" :disabled="!filteredLibraryItems.length" :checked="!!selectedLibraryItems.length && selectedLibraryItems.length === filteredLibraryItems.length" @change="toggleSelectAllFiltered" />
            <span>{{ t('livePhoto.workspace.selectFiltered') }}</span>
          </label>
          <span class="vg-muted">{{ t('livePhoto.workspace.selected') }} <b class="vg-num">{{ selectedLibraryIds.length }}</b></span>
          <template v-if="retryableFailedLibraryItems.length || pausedLibraryItems.length || runningLibraryItems.length">
            <span class="lp-selbar__sep" />
            <button v-if="retryableFailedLibraryItems.length" class="vg-btn vg-btn--sm vg-btn--ghost" type="button" @click="retryFailedItems">
              <RefreshCcw :size="13" />{{ t('livePhoto.workspace.retryFailed') }} ({{ retryableFailedLibraryItems.length }})
            </button>
            <button v-if="pausedLibraryItems.length" class="vg-btn vg-btn--sm vg-btn--ghost" type="button" @click="resumePausedItems">
              <Play :size="13" />{{ t('livePhoto.workspace.resumePaused') }} ({{ pausedLibraryItems.length }})
            </button>
            <button v-if="runningLibraryItems.length" class="vg-btn vg-btn--sm vg-btn--ghost" type="button" @click="pauseRunningItems">
              <Pause :size="13" />{{ t('livePhoto.workspace.pauseRunning') }} ({{ runningLibraryItems.length }})
            </button>
          </template>
          <span class="vg-toolbar__spacer" />
          <template v-if="selectedLibraryIds.length">
            <button v-if="subtitleRevertEligibleSelectedCount" class="vg-btn vg-btn--sm" type="button" @click="revertSelectedSubtitles">{{ t('livePhoto.workspace.revertSubtitles') }}</button>
            <button v-if="subtitleEligibleSelectedCount" class="vg-btn vg-btn--sm" type="button" @click="openBatchSubtitleDialog">
              <Captions :size="13" />{{ t('livePhoto.workspace.batchSubtitles') }} ({{ subtitleEligibleSelectedCount }})
            </button>
            <button class="vg-btn vg-btn--sm vg-btn--danger" type="button" @click="openBatchDelete">
              <Trash2 :size="13" />{{ t('livePhoto.workspace.batchDelete') }} ({{ selectedLibraryIds.length }})
            </button>
          </template>
          <button class="vg-btn vg-btn--sm vg-btn--primary" data-testid="live-photo-export-selected" type="button" :disabled="exporting || !selectedLibraryIds.length" @click="exportSelected">
            <Package :size="13" />{{ exporting ? t('livePhoto.actions.exporting') : `${uiText.exportSelectedPrefix} (${selectedLibraryIds.length})` }}
          </button>
        </div>

        <div v-if="!filteredLibraryItems.length" class="vg-empty lp-empty" data-testid="live-photo-empty">
          <span class="vg-empty__icon"><FolderOpen :size="22" /></span>
          <h3>{{ t('livePhoto.library.emptyTitle') }}</h3>
          <p>{{ t('livePhoto.library.emptyDesc') }}</p>
          <button class="vg-btn vg-btn--primary" type="button" @click="activeTab = 'reference'"><ImagePlus :size="15" />{{ uiText.tabReference }}</button>
        </div>

        <div v-else class="lp-items" :class="libraryViewMode === 'list' ? 'lp-items--list' : 'lp-items--grid'">
          <article v-for="item in pagedLibraryItems" :key="item.id" class="lp-item" :class="{ 'is-on': selectedLibraryIds.includes(item.id) }" :data-testid="`live-photo-item-${item.id}`">
            <div class="lp-item__media">
              <button
                class="lp-item__thumb"
                type="button"
                :aria-label="livePhotoDisplayVideoPath(item) ? t('autoUi.k_2d9aa5320638', { p0: item.sourceShotLabel || item.productSnapshot?.name || 'Live Photo' }) : t('autoUi.k_fe0ccc53ab2b')"
                @click="livePhotoDisplayVideoPath(item) ? openVideoDialog(item) : openTaskDetail(item)"
              >
                <img v-if="livePhotoThumbnailPath(item)" :src="previewSrc(livePhotoThumbnailPath(item))" alt="" loading="lazy" decoding="async" />
                <FileImage v-else :size="22" />
                <span v-if="livePhotoDisplayVideoPath(item)" class="preview-play" aria-hidden="true"><Play :size="16" /></span>
              </button>
              <label class="lp-item__check">
                <input :data-testid="`live-photo-select-${item.id}`" type="checkbox" :checked="selectedLibraryIds.includes(item.id)" @change="toggleLibrarySelection(item.id)" />
              </label>
            </div>

            <div class="lp-item__body">
              <div class="lp-item__titleline">
                <h3 :title="item.sourceShotLabel || item.productSnapshot?.name || item.id">{{ item.sourceShotLabel || item.productSnapshot?.name || item.id }}</h3>
                <span class="lp-state" :class="lpTone(item)"><i />{{ liveTaskStatusLabel(item) }}</span>
              </div>
              <div class="lp-item__meta">
                <span class="vg-chip">{{ item.sourceType === 'clone_shot' ? t('autoUi.k_3ce078e030c3') : t('autoUi.k_eff304ed9436') }}</span>
                <span v-if="itemHasSubtitle(item)" class="vg-chip">{{ t('autoUi.k_83e422384f7f') }}</span>
                <span class="lp-item__text">{{ taskSourceSummary(item) }} · {{ metadataModeLabel(item) }}</span>
              </div>
              <div v-if="liveTaskErrorSummary(item)" class="lp-item__error" :title="liveTaskErrorSummary(item)">
                <AlertTriangle :size="13" /><span>{{ liveTaskErrorSummary(item) }}</span>
              </div>
              <div v-else-if="liveTaskWaitingHint(item)" class="lp-item__hint">{{ liveTaskWaitingHint(item) }}</div>
              <div class="lp-item__progress">
                <div class="vg-progress">
                  <div class="vg-progress__bar"><div class="vg-progress__fill" :class="{ 'vg-progress__fill--fail': lpTone(item) === 'lp-state--err' }" :style="{ width: `${liveTaskProgressPercent(item)}%` }" /></div>
                </div>
                <span class="lp-item__step">{{ workflowStepLabel(item.workflow?.currentStep) }}</span>
                <span class="vg-num lp-item__time"><Clock3 :size="12" />{{ formatTime(item.updatedAt) }}</span>
              </div>
            </div>

            <div class="lp-item__actions">
              <div v-if="canContinueWithVideo(item) || canRetryImageOnce(item)" class="image-retry-decision">
                <button
                  v-if="canRetryImageOnce(item)"
                  :data-testid="`live-photo-retry-${item.id}`"
                  class="vg-btn vg-btn--xs"
                  :title="t('autoUi.k_031c7e12ddae')"
                  type="button"
                  :disabled="item.packagingStatus === 'processing'"
                  @click.stop="retryItem(item)"
                >
                  <RefreshCcw :size="12" />{{ t('autoUi.k_031c7e12ddae') }}
                </button>
                <button
                  v-if="canContinueWithVideo(item)"
                  class="vg-btn vg-btn--xs vg-btn--primary"
                  :title="t('livePhoto.workspace.continueWithVideo')"
                  type="button"
                  @click.stop="continueWithVideo(item)"
                >
                  <Play :size="12" />{{ t('livePhoto.workspace.continueWithVideoShort') }}
                </button>
              </div>
              <div class="lp-item__icons">
                <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('autoUi.k_faea8c1db9cc')" @click.stop="openTaskDetail(item)"><PanelBottomOpen :size="14" /></button>
                <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('autoUi.k_b923b26d335a')" @click.stop="openRuntimeLogs(item)"><Logs :size="14" /></button>
                <button :data-testid="`live-photo-preview-${item.id}`" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="uiText.preview" :disabled="!livePhotoDisplayVideoPath(item)" @click.stop="openVideoDialog(item)"><Play :size="14" /></button>
                <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('autoUi.k_aaa5f2e9f006')" :disabled="!livePhotoDisplayVideoPath(item)" @click.stop="openSingleSubtitleDialog(item)"><Captions :size="14" /></button>
                <button v-if="itemHasAppliedSubtitle(item)" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('autoUi.k_6d32dea55ea6')" :disabled="subtitleDialogBusy" @click.stop="revertSubtitleFromItem(item)"><RefreshCcw :size="14" /></button>
                <button :data-testid="`live-photo-metadata-${item.id}`" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="uiText.metadata" :disabled="!item.packagingMetadataBridgePath" @click.stop="openPath(item.packagingMetadataBridgePath)"><Package :size="14" /></button>
                <button :data-testid="`live-photo-reveal-${item.id}`" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="uiText.reveal" :disabled="!livePhotoDisplayVideoPath(item)" @click.stop="showPath(livePhotoDisplayVideoPath(item))"><FolderOpen :size="14" /></button>
                <button v-if="canCorrectReplacementRegion(item)" :data-testid="`live-photo-region-${item.id}`" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('autoUi.k_329d5e81ce23')" @click.stop="openReplacementRegionEditor(item)"><ScanLine :size="14" /></button>
                <button v-if="!canRetryImageOnce(item)" :data-testid="`live-photo-retry-${item.id}`" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="uiText.regenerate" :disabled="item.packagingStatus === 'processing'" @click.stop="retryItem(item)"><RefreshCcw :size="14" /></button>
                <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="item.autoFlowStatus?.paused ? t('livePhoto.workspace.resumePaused') : t('livePhoto.workspace.pauseRunning')" :disabled="item.packagingStatus === 'completed'" @click.stop="item.autoFlowStatus?.paused ? resumeItemAutoFlow(item) : pauseItemAutoFlow(item)">
                  <component :is="item.autoFlowStatus?.paused ? Play : Pause" :size="14" />
                </button>
                <button :data-testid="`live-photo-remove-${item.id}`" class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" :title="uiText.delete" @click.stop="removeItem(item.id)"><Trash2 :size="14" /></button>
              </div>
            </div>
          </article>
        </div>

        <footer v-if="filteredLibraryItems.length" class="vg-pager lp-pager">
          <span class="vg-num">{{ libraryTotal || filteredLibraryItems.length }} {{ uiText.itemUnit }}</span>
          <div class="vg-pager__group">
            <button class="vg-pg" type="button" :aria-label="t('livePhoto.workspace.previousPage')" :disabled="libraryPage <= 1" @click="goToLibraryPage(libraryPage - 1)"><ChevronLeft :size="14" /></button>
            <span class="vg-num lp-pager__pos">{{ libraryPage }} / {{ libraryTotalPages }}</span>
            <button class="vg-pg" type="button" :aria-label="t('livePhoto.workspace.nextPage')" :disabled="libraryPage >= libraryTotalPages" @click="goToLibraryPage(libraryPage + 1)"><ChevronRight :size="14" /></button>
          </div>
        </footer>
      </section>
    </div>

    <div
      v-if="materialPickerOpen"
      class="reference-material-dialog"
      data-testid="live-photo-material-picker-dialog"
      role="dialog"
      aria-modal="true"
      @click.self="closeMaterialPicker"
    >
      <div class="reference-material-dialog__panel">
        <div class="reference-material-dialog__head">
          <div class="reference-material-dialog__title">
            <strong>{{ uiText.materialLibrarySelect }}</strong>
            <p>
              {{ unboundMaterialOptions.length }} {{ uiText.itemUnit }}
              · {{ uiText.materialLibrarySelected }} {{ selectedMaterialImageIds.length }}
            </p>
          </div>
          <button class="ghost-button small" data-testid="live-photo-close-material-picker" type="button" @click="closeMaterialPicker">
            {{ uiText.materialLibraryClose }}
          </button>
        </div>

        <div class="reference-material-picker__toolbar">
          <div class="reference-material-picker__actions">
            <button class="ghost-button small" type="button" @click="selectAllMaterialImages">{{ uiText.materialLibrarySelectAll }}</button>
            <button class="ghost-button small" type="button" @click="clearMaterialImageSelection">{{ uiText.materialLibraryClear }}</button>
          </div>
          <div class="reference-material-picker__pager">
            <button class="ghost-button small" type="button" :disabled="materialPickerPage <= 1" @click="materialPickerPage -= 1">
              {{ uiText.previousPage }}
            </button>
            <span>{{ materialPickerPage }} / {{ materialPickerTotalPages }}</span>
            <button class="ghost-button small" type="button" :disabled="materialPickerPage >= materialPickerTotalPages" @click="materialPickerPage += 1">
              {{ uiText.nextPage }}
            </button>
            <select v-model.number="materialPickerPageSize" class="field-select-mini">
              <option :value="8">8 / {{ uiText.perPage }}</option>
              <option :value="12">12 / {{ uiText.perPage }}</option>
              <option :value="16">16 / {{ uiText.perPage }}</option>
            </select>
          </div>
        </div>

        <div v-if="unboundMaterialOptions.length" class="reference-material-grid">
          <label
            v-for="material in pagedMaterialOptions"
            :key="material.id"
            class="reference-material-card"
            :class="{ active: selectedMaterialImageIds.includes(material.id) }"
          >
            <input
              type="checkbox"
              :checked="selectedMaterialImageIds.includes(material.id)"
              @change="toggleMaterialImageSelection(material.id)"
            />
            <img :src="material.qiniuUrl" alt="material option" loading="lazy" decoding="async" />
            <div class="reference-material-card__copy">
              <strong>{{ fileNameOf(material.localImagePath) }}</strong>
              <small>
                {{ material.usageStatus === 'used' ? t('livePhoto.workspace.materialUsed') : t('livePhoto.workspace.materialUnused') }}
                <span v-if="material.materialOrigin === 'derived'"> · {{ t('livePhoto.workspace.materialDerived') }}</span>
              </small>
            </div>
          </label>
        </div>
        <div v-else class="reference-material-dialog__empty">{{ uiText.materialLibraryEmpty }}</div>

        <div class="reference-material-dialog__footer">
          <button class="ghost-button" type="button" @click="closeMaterialPicker">{{ uiText.materialLibraryClose }}</button>
          <button
            class="primary-button"
            data-testid="live-photo-confirm-material-picker"
            type="button"
            :disabled="!selectedMaterialImageIds.length"
            @click="appendMaterialImagesAsReferences"
          >
            <ImagePlus class="h-4 w-4" />
            {{ uiText.materialLibraryAddSelected }} ({{ selectedMaterialImageIds.length }})
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="livePhotoRetrySettingsOpen"
      class="live-subtitle-dialog"
      @click.self="!livePhotoSettingsBusy && (livePhotoRetrySettingsOpen = false)"
    >
      <section class="live-subtitle-dialog__panel live-photo-retry-settings-panel" role="dialog" aria-modal="true" aria-labelledby="live-photo-retry-settings-title">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong id="live-photo-retry-settings-title">{{ t('livePhoto.workspace.retrySettingsTitle') }}</strong>
            <p>{{ t('livePhoto.workspace.retrySettingsDesc') }}</p>
          </div>
          <button class="live-subtitle-dialog__close" type="button" :disabled="livePhotoSettingsBusy" :aria-label="t('common.close')" @click="livePhotoRetrySettingsOpen = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="live-photo-retry-settings-hero">
          <div class="live-photo-retry-settings-icon"><RefreshCcw class="h-5 w-5" /></div>
          <div>
            <span>{{ t('livePhoto.workspace.retryAutomaticRecovery') }}</span>
            <strong>{{ livePhotoSettings.retryLimit ?? 0 }} {{ t('livePhoto.workspace.retryAttemptUnit') }}</strong>
            <small>{{ t('livePhoto.workspace.retryManualOnly') }}</small>
          </div>
        </div>
        <label class="live-photo-retry-settings-field">
          <div>
            <span>{{ t('livePhoto.workspace.retryMaximum') }}</span>
            <small>{{ t('livePhoto.workspace.retryRangeHint') }}</small>
          </div>
          <div class="live-photo-retry-settings-input">
            <input v-model.number="livePhotoSettings.retryLimit" type="number" min="0" max="20" step="1" inputmode="numeric" />
            <span>{{ t('livePhoto.workspace.retryAttemptUnit') }}</span>
          </div>
        </label>
        <div class="live-subtitle-dialog__actions live-photo-retry-settings-actions">
          <button class="ghost-button" type="button" :disabled="livePhotoSettingsBusy" @click="livePhotoRetrySettingsOpen = false">{{ t('common.cancel') }}</button>
          <button class="primary-button" type="button" :disabled="livePhotoSettingsBusy" @click="saveLivePhotoSettings(true)">
            {{ livePhotoSettingsBusy ? t('livePhoto.workspace.saving') : t('livePhoto.workspace.retrySave') }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="detailDialogOpen && detailDialogItem" class="live-detail-dialog" @click.self="closeTaskDetail">
      <div class="live-detail-dialog__panel">
        <div class="live-detail-dialog__head">
          <div class="live-detail-dialog__title">
            <strong>{{ detailDialogItem.sourceShotLabel || detailDialogItem.productSnapshot?.name || detailDialogItem.id }}</strong>
            <p>{{ detailDialogItem.sourceType === 'clone_shot' ? t('autoUi.k_d44b948f06f0') : t('autoUi.k_a09de3d53e0c') }}</p>
          </div>
          <button class="live-detail-dialog__close" type="button" @click="closeTaskDetail">{{ t('autoUi.k_6c14bd7f6f9e') }}</button>
        </div>

        <div class="live-detail-dialog__summary">
          <div class="live-detail-dialog__summary-card">
            <span>{{ t('autoUi.k_62e951a692ff') }}</span>
            <strong>{{ liveTaskStatusLabel(detailDialogItem) }}</strong>
            <small>{{ liveTaskAutoSummary(detailDialogItem) }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>{{ t('autoUi.k_0a2489f651ae') }}</span>
            <strong>{{ workflowStepLabel(detailDialogItem.workflow?.currentStep) }}</strong>
            <small>{{ formatTime(detailDialogItem.updatedAt) }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>{{ t('autoUi.k_8edafb8f44a9') }}</span>
            <strong>{{ detailDialogItem.imagePromptPreview?.referenceImagePaths?.length || 0 }} / {{ detailDialogItem.videoPromptPreview?.referenceImagePaths?.length || 0 }}</strong>
            <small>{{ t('autoUi.k_c1f18a2af6b4') }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>{{ t('autoUi.k_7df7698e6ee4') }}</span>
            <strong>{{ liveTaskWaitingHint(detailDialogItem) || '--' }}</strong>
            <small>{{ isWaitingRemoteResult(detailDialogItem) ? t('autoUi.k_156f1ffe8947') : t('autoUi.k_a08e8ea14d74') }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>{{ t('autoUi.k_aa35ad90c049') }}</span>
            <strong>{{ extractLivePhotoTaskId(detailDialogItem) || '--' }}</strong>
            <small>{{ liveTaskRemoteStateText(detailDialogItem) }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>{{ t('autoUi.k_47928c96a42e') }}</span>
            <strong>{{ detailDialogItem.qualityReport ? formatQualityScore(detailDialogItem.qualityReport.score) : '--' }}</strong>
            <small>{{ detailDialogItem.qualityReport?.mode === 'local_python' ? t('autoUi.k_3743ca161582') : detailDialogItem.qualityReport ? t('autoUi.k_94209efc6e97') : t('autoUi.k_0399892b3886') }}</small>
          </div>
        </div>

        <div class="live-detail-dialog__hero">
          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>{{ t('autoUi.k_7ebfc7c126cc') }}</strong>
              <span>{{ detailDialogItem.sourceProjectTitle || detailDialogItem.productSnapshot?.name || '--' }}</span>
            </div>
            <div class="live-detail-dialog__hero-grid">
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_4a6f4156fc71') }}</span>
                <strong>{{ detailDialogItem.sourceType === 'clone_shot' ? t('autoUi.k_3ce078e030c3') : t('autoUi.k_eff304ed9436') }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_2a83614918bc') }}</span>
                <strong>{{ liveTaskAutoSummary(detailDialogItem) }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_71df90260b2b') }}</span>
                <strong>{{ formatTime(detailDialogItem.updatedAt) }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_e53fc9418478') }}</span>
                <strong>{{ liveTaskRetryText(detailDialogItem) || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_4659062eaa91') }}</span>
                <strong>{{ extractLivePhotoTaskId(detailDialogItem) || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_68e297c888ef') }}</span>
                <strong>{{ liveTaskRemoteStateText(detailDialogItem) }}</strong>
              </div>
            </div>
          </section>

          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>{{ t('autoUi.k_046e015ff882') }}</strong>
              <span>{{ detailDialogItem.qualityReport?.checkerVersion || '--' }}</span>
            </div>
            <div class="live-detail-dialog__hero-grid">
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_462f8a61da1f') }}</span>
                <strong>{{ detailDialogItem.qualityReport?.decision || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_e3ba534bb0ab') }}</span>
                <strong>{{ detailDialogItem.promptVersion ? `V${detailDialogItem.promptVersion}` : '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_2acbed5a521e') }}</span>
                <strong>{{ detailDialogItem.generationAttempts?.length || 0 }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_6cdba4aad0c1') }}</span>
                <strong>{{ detailDialogItem.cacheHit ? t('autoUi.k_7a130d7fde44') : t('autoUi.k_786d17cf29be') }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_33d863c412e8') }}</span>
                <strong>{{ detailDialogItem.checkerFallbackReason || detailDialogItem.qualityReport?.fallbackReason || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_7f879a128512') }}</span>
                <strong>{{ detailDialogItem.qualityReport?.hardFailures?.join(', ') || '--' }}</strong>
              </div>
            </div>
          </section>

          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>{{ t('autoUi.k_fb5212190a9a') }}</strong>
              <span>{{ hasExportArtifacts(detailDialogItem) ? t('autoUi.k_d3eaaf60ed1c') : t('autoUi.k_792405ac8c02') }}</span>
            </div>
            <div class="live-detail-dialog__hero-grid">
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_8d3692399f98') }}</span>
                <strong>{{ latestExportSettingsText(detailDialogItem) || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>{{ t('autoUi.k_0579bf571dd0') }}</span>
                <strong>{{ detailDialogItem.packagingAssetIdentifier || '--' }}</strong>
              </div>
            </div>
            <div class="live-detail-dialog__artifact-actions">
              <button
                v-if="canCorrectReplacementRegion(detailDialogItem)"
                class="live-detail-dialog__ghost"
                type="button"
                @click="openReplacementRegionEditor(detailDialogItem)"
              >
                <ScanLine class="h-4 w-4" /> {{ t('autoUi.k_329d5e81ce23') }} </button>
              <button class="live-detail-dialog__ghost" type="button" :disabled="!livePhotoDisplayVideoPath(detailDialogItem)" @click="openVideoDialog(detailDialogItem)"> {{ t('autoUi.k_441a7a4e66da') }} </button>
              <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.packagingMetadataBridgePath" @click="openPath(detailDialogItem.packagingMetadataBridgePath)"> {{ t('autoUi.k_721f98528d0c') }} </button>
              <button class="live-detail-dialog__ghost" type="button" :disabled="!livePhotoDisplayVideoPath(detailDialogItem)" @click="openVideoDialog(detailDialogItem)"> {{ t('autoUi.k_f7fa88a1d462') }} </button>
              <button class="live-detail-dialog__ghost" type="button" :disabled="!livePhotoDisplayVideoPath(detailDialogItem)" @click="openSingleSubtitleDialog(detailDialogItem)"> {{ t('autoUi.k_6e4c3e5ffee8') }} </button>
              <button v-if="itemHasAppliedSubtitle(detailDialogItem)" class="live-detail-dialog__ghost" type="button" :disabled="subtitleDialogBusy" @click="revertSubtitleFromItem(detailDialogItem)"> {{ t('autoUi.k_5d2a55f19c91') }} </button>
            </div>
          </section>

          <section class="live-detail-dialog__hero-card live-detail-dialog__hero-card--wide">
            <div class="live-detail-dialog__hero-head">
              <strong>{{ t('autoUi.k_99045f8ee1cd') }}</strong>
              <span>{{ hasImageResult(detailDialogItem) || hasVideoResult(detailDialogItem) ? t('autoUi.k_99f31f48079b') : t('autoUi.k_b05d19807150') }}</span>
            </div>
            <div class="live-result-grid">
              <article class="live-result-card">
                <div class="live-result-card__head">
                  <strong>{{ t('autoUi.k_55e7017a46b1') }}</strong>
                  <span>{{ detailDialogItem.generatedStillPath ? fileNameOf(detailDialogItem.generatedStillPath) : t('autoUi.k_3c04f9eb8b65') }}</span>
                </div>
                <button
                  v-if="detailDialogItem.generatedStillPath"
                  class="live-result-card__frame"
                  type="button"
                  @click="openPath(detailDialogItem.generatedStillPath)"
                >
                  <img :src="previewSrc(detailDialogItem.generatedStillPath)" alt="generated still" />
                </button>
                <div v-else class="live-result-card__empty">
                  <FileImage class="h-5 w-5" />
                  <span>{{ t('autoUi.k_01916819b0dd') }}</span>
                </div>
                <div class="live-result-card__actions">
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.generatedStillPath" @click="openPath(detailDialogItem.generatedStillPath)"> {{ t('autoUi.k_e77f787d2a02') }} </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.generatedStillPath" @click="showPath(detailDialogItem.generatedStillPath)"> {{ t('autoUi.k_031c10557843') }} </button>
                </div>
              </article>

              <article class="live-result-card">
                <div class="live-result-card__head">
                  <strong>{{ t('autoUi.k_d7bf85820488') }}</strong>
                  <span>{{ livePhotoDisplayVideoPath(detailDialogItem) ? fileNameOf(livePhotoDisplayVideoPath(detailDialogItem)) : t('autoUi.k_3c04f9eb8b65') }}</span>
                </div>
                <video
                  v-if="livePhotoDisplayVideoPath(detailDialogItem)"
                  class="live-result-card__video"
                  :src="previewSrc(livePhotoDisplayVideoPath(detailDialogItem))"
                  controls
                  playsinline
                  preload="metadata"
                ></video>
                <div v-else class="live-result-card__empty">
                  <Play class="h-5 w-5" />
                  <span>{{ t('autoUi.k_895c04381433') }}</span>
                </div>
                <div class="live-result-card__actions">
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!livePhotoDisplayVideoPath(detailDialogItem)" @click="openVideoDialog(detailDialogItem)"> {{ t('autoUi.k_af7d6e03da10') }} </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!livePhotoDisplayVideoPath(detailDialogItem)" @click="openVideoDialog(detailDialogItem)"> {{ t('autoUi.k_200787975353') }} </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!livePhotoDisplayVideoPath(detailDialogItem)" @click="showPath(livePhotoDisplayVideoPath(detailDialogItem))"> {{ t('autoUi.k_031c10557843') }} </button>
                </div>
              </article>

              <article class="live-result-card">
                <div class="live-result-card__head">
                  <strong>{{ t('autoUi.k_107deff0eeb2') }}</strong>
                  <span>{{ livePhotoDisplayVideoPath(detailDialogItem) ? fileNameOf(livePhotoDisplayVideoPath(detailDialogItem)) : t('autoUi.k_3875de324c45') }}</span>
                </div>
                <button
                  v-if="livePhotoThumbnailPath(detailDialogItem)"
                  class="live-result-card__frame"
                  type="button"
                  @click="openVideoDialog(detailDialogItem)"
                >
                  <img :src="previewSrc(livePhotoThumbnailPath(detailDialogItem))" alt="live photo poster" />
                </button>
                <div v-else class="live-result-card__empty">
                  <Package class="h-5 w-5" />
                  <span>{{ t('autoUi.k_a42b18cc7f5c') }}</span>
                </div>
                <div class="live-result-card__actions">
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!livePhotoDisplayVideoPath(detailDialogItem)" @click="openVideoDialog(detailDialogItem)"> {{ t('autoUi.k_f7fa88a1d462') }} </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.packagingMetadataBridgePath" @click="openPath(detailDialogItem.packagingMetadataBridgePath)"> {{ t('autoUi.k_62de58ce6175') }} </button>
                </div>
              </article>
            </div>
          </section>

          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>{{ t('autoUi.k_9e8cf3077f3f') }}</strong>
              <button class="live-detail-dialog__ghost" type="button" @click="openRuntimeLogs(detailDialogItem)">{{ t('autoUi.k_d13c118628a2') }}</button>
            </div>
            <div v-if="detailLogPreview(detailDialogItem).length" class="live-detail-dialog__log-list">
              <article v-for="log in detailLogPreview(detailDialogItem)" :key="log.id" class="live-detail-dialog__log-item" :class="`is-${log.level}`">
                <div class="live-detail-dialog__log-meta">
                  <span>{{ formatTime(log.time) }}</span>
                  <strong>{{ log.level }}</strong>
                </div>
                <p>{{ log.message }}</p>
              </article>
            </div>
            <div v-else class="live-detail-dialog__log-empty">{{ t('autoUi.k_a53be4ed9948') }}</div>
          </section>

          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>{{ t('autoUi.k_2677be45ab9e') }}</strong>
              <span>{{ liveTaskRemoteEntries(detailDialogItem).length ? t('autoUi.k_ba8faa42e939') : t('autoUi.k_9971be8eec5e') }}</span>
            </div>
            <div v-if="liveTaskRemoteEntries(detailDialogItem).length" class="live-detail-dialog__hero-grid">
              <div v-for="entry in liveTaskRemoteEntries(detailDialogItem)" :key="entry.stage + entry.taskId" class="live-detail-dialog__metric">
                <span>{{ entry.stage }}</span>
                <strong>{{ entry.taskId }}</strong>
                <small>{{ entry.provider }} / {{ entry.model }}</small>
              </div>
            </div>
            <div v-else class="live-detail-dialog__log-empty">{{ t('autoUi.k_a130784863c0') }}</div>
          </section>
        </div>

        <div class="live-console-row__detail-grid">
          <section class="live-console-row__detail-card">
            <div class="live-console-row__detail-head">
              <strong>{{ t('autoUi.k_ac8056850c8e') }}</strong>
              <span>{{ workflowStepLabel(detailDialogItem.workflow?.currentStep) }}</span>
            </div>
            <div class="live-console-row__timeline">
              <div v-for="step in livePhotoSteps" :key="detailDialogItem.id + '-detail-' + step" class="live-console-row__timeline-item">
                <div class="live-console-row__timeline-main">
                  <strong>{{ workflowStepLabel(step) }}</strong>
                  <span>{{ workflowStepStatusText(detailDialogItem, step) }}</span>
                </div>
                <small>{{ formatTime(detailDialogItem.workflow?.stepStatus?.[step]?.updatedAt) }}</small>
                <p v-if="workflowStepErrorText(detailDialogItem, step)" class="live-console-row__timeline-error">{{ workflowStepErrorText(detailDialogItem, step) }}</p>
              </div>
            </div>
          </section>

          <section class="live-console-row__detail-card">
            <div class="live-console-row__detail-head">
              <strong>{{ t('autoUi.k_d5d2753e959d') }}</strong>
              <span>{{ detailDialogItem.imagePromptPreview?.provider || '--' }} / {{ detailDialogItem.imagePromptPreview?.model || '--' }}</span>
            </div>
            <div class="live-console-row__detail-block">
              <label>{{ t('autoUi.k_1f1359c9a86e') }}</label>
              <div class="live-console-row__binding-grid">
                <button class="live-console-row__binding-card" type="button" :disabled="!livePhotoImageBaseRef(detailDialogItem)" @click="openPath(livePhotoImageBaseRef(detailDialogItem))">
                  <strong>Image 1</strong>
                  <span>Base reference</span>
                  <small>{{ fileNameOf(livePhotoImageBaseRef(detailDialogItem)) || '--' }}</small>
                </button>
                <button class="live-console-row__binding-card" type="button" :disabled="!livePhotoImageProductRef(detailDialogItem)" @click="openPath(livePhotoImageProductRef(detailDialogItem))">
                  <strong>Image 2</strong>
                  <span>Product reference</span>
                  <small>{{ fileNameOf(livePhotoImageProductRef(detailDialogItem)) || '--' }}</small>
                </button>
              </div>
            </div>
            <div class="live-console-row__detail-block">
              <label>{{ t('autoUi.k_ce74779d621a') }}</label>
              <pre>{{ detailDialogItem.imagePromptPreview?.prompt || detailDialogItem.promptPreview?.instructions?.join('\n') || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>{{ t('autoUi.k_0156a9ed0adc') }}</label>
              <pre>{{ detailDialogItem.imagePromptPreview?.negativePrompt || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>{{ t('autoUi.k_75e8e161c9b0') }}</label>
              <div v-if="detailDialogItem.imagePromptPreview?.referenceImagePaths?.length" class="live-console-row__ref-preview-grid">
                <button
                  v-for="refPath in detailDialogItem.imagePromptPreview?.referenceImagePaths || []"
                  :key="detailDialogItem.id + '-image-preview-' + refPath"
                  class="live-console-row__ref-preview"
                  type="button"
                  @click="openPath(refPath)"
                >
                  <img :src="previewSrc(refPath)" :alt="fileNameOf(refPath)" />
                  <span>{{ fileNameOf(refPath) }}</span>
                </button>
              </div>
              <ul class="live-console-row__path-list">
                <li v-for="refPath in detailDialogItem.imagePromptPreview?.referenceImagePaths || []" :key="detailDialogItem.id + '-image-ref-' + refPath">{{ refPath }}</li>
              </ul>
            </div>
          </section>

          <section class="live-console-row__detail-card">
            <div class="live-console-row__detail-head">
              <strong>{{ t('autoUi.k_fecc5ce7de5a') }}</strong>
              <span>{{ detailDialogItem.videoPromptPreview?.provider || '--' }} / {{ detailDialogItem.videoPromptPreview?.model || '--' }}</span>
            </div>
            <div class="live-console-row__detail-block">
              <label>{{ t('autoUi.k_ce74779d621a') }}</label>
              <pre>{{ detailDialogItem.videoPromptPreview?.prompt || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>{{ t('autoUi.k_0156a9ed0adc') }}</label>
              <pre>{{ detailDialogItem.videoPromptPreview?.negativePrompt || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>{{ t('autoUi.k_75e8e161c9b0') }}</label>
              <div v-if="detailDialogItem.videoPromptPreview?.referenceImagePaths?.length" class="live-console-row__ref-preview-grid">
                <button
                  v-for="refPath in detailDialogItem.videoPromptPreview?.referenceImagePaths || []"
                  :key="detailDialogItem.id + '-video-preview-' + refPath"
                  class="live-console-row__ref-preview"
                  type="button"
                  @click="openPath(refPath)"
                >
                  <img :src="previewSrc(refPath)" :alt="fileNameOf(refPath)" />
                  <span>{{ fileNameOf(refPath) }}</span>
                </button>
              </div>
              <ul class="live-console-row__path-list">
                <li v-for="refPath in detailDialogItem.videoPromptPreview?.referenceImagePaths || []" :key="detailDialogItem.id + '-video-ref-' + refPath">{{ refPath }}</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div v-if="videoDialogItem" class="live-subtitle-dialog" @click.self="closeVideoDialog">
      <div class="live-subtitle-dialog__panel live-photo-video-dialog" role="dialog" aria-modal="true" :aria-label="t('autoUi.k_1bb36d91a68c')">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{ videoDialogItem.sourceShotLabel || videoDialogItem.productSnapshot?.name || t('autoUi.k_9609fccf1585') }}</strong>
            <p>{{ itemHasAppliedSubtitle(videoDialogItem) ? t('autoUi.k_6d27a746c36c') : t('autoUi.k_1a73a0bbb20c') }} · {{ formatTime(videoDialogItem.createdAt) }}</p>
          </div>
          <button class="live-subtitle-dialog__close" type="button" :disabled="subtitleDialogBusy" :aria-label="t('autoUi.k_03a55b6d4114')" @click="closeVideoDialog">
            <X class="h-4 w-4" />
          </button>
        </div>
        <video
          class="live-photo-video-dialog__player"
          controls
          autoplay
          playsinline
          preload="metadata"
          :src="previewSrc(livePhotoDisplayVideoPath(videoDialogItem))"
        ></video>
        <div class="live-photo-video-dialog__meta">
          <span>{{ fileNameOf(livePhotoDisplayVideoPath(videoDialogItem)) }}</span>
          <span>{{ liveTaskStatusLabel(videoDialogItem) }}</span>
        </div>
        <div class="live-subtitle-dialog__actions">
          <button class="ghost-button" type="button" :disabled="subtitleDialogBusy" @click="openSingleSubtitleDialog(videoDialogItem)">
            <Captions class="h-4 w-4" /> {{ t('autoUi.k_9475af4a63e9') }} </button>
          <button
            v-if="itemHasAppliedSubtitle(videoDialogItem)"
            class="ghost-button"
            type="button"
            :disabled="subtitleDialogBusy"
            @click="revertSubtitleFromItem(videoDialogItem)"
          >
            <RefreshCcw class="h-4 w-4" /> {{ t('autoUi.k_6d32dea55ea6') }} </button>
          <button class="primary-button" type="button" :disabled="subtitleDialogBusy" @click="closeVideoDialog">{{ t('autoUi.k_6c14bd7f6f9e') }}</button>
        </div>
      </div>
    </div>

    <div v-if="subtitleDialogOpen" class="live-subtitle-dialog" @click.self="closeSubtitleDialog">
      <div class="live-subtitle-dialog__panel">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{ subtitleDialogMode === 'batch' ? t('autoUi.k_c6f0209a1cfa') : t('autoUi.k_6e4c3e5ffee8') }}</strong>
            <p>{{ t('autoUi.k_b7a385ec00d6') }} {{ subtitleTargetIds.length }} {{ t('autoUi.k_f2b41b9c6a9c') }}</p>
          </div>
          <button class="live-subtitle-dialog__close" type="button" :disabled="subtitleDialogBusy" @click="closeSubtitleDialog">{{ t('autoUi.k_6c14bd7f6f9e') }}</button>
        </div>

        <div class="live-subtitle-dialog__summary">
          <div class="live-subtitle-dialog__summary-item">
            <span>{{ t('autoUi.k_11a2736ed3c4') }}</span>
            <strong>{{ subtitleDialogMode === 'batch' ? t('autoUi.k_50e078e7f961', { p0: subtitleTargetIds.length }) : t('autoUi.k_bda3ae2da55b') }}</strong>
          </div>
          <div class="live-subtitle-dialog__summary-item">
            <span>{{ t('autoUi.k_5d9ef99b61c5') }}</span>
            <strong>{{ subtitlePresets.find((preset) => preset.id === subtitleSelectedPreset)?.name || t('autoUi.k_469e324ba51b') }}</strong>
          </div>
        </div>

        <div class="live-subtitle-dialog__tabs">
          <button type="button" :class="{ active: subtitleDialogTab === 'title' }" @click="subtitleDialogTab = 'title'">{{ t('autoUi.k_748d7dc7e321') }}</button>
          <button type="button" :class="{ active: subtitleDialogTab === 'template' }" @click="subtitleDialogTab = 'template'">{{ t('autoUi.k_06d0f38dd26c') }}</button>
          <button type="button" :class="{ active: subtitleDialogTab === 'style' }" @click="subtitleDialogTab = 'style'">{{ t('autoUi.k_393a6c9117bc') }}</button>
        </div>

        <section v-if="subtitleDialogTab === 'title'" class="live-subtitle-dialog__section">
          <div class="live-subtitle-dialog__section-head">
            <span class="live-subtitle-dialog__kicker">Title Mode</span>
            <strong>{{ t('autoUi.k_7f39a0d9ffad') }}</strong>
          </div>
          <div class="live-subtitle-dialog__mode-pills">
            <button :class="{ 'is-active': subtitleTitleStrategy === 'single_for_all' }" type="button" @click="subtitleTitleStrategy = 'single_for_all'"> {{ t('autoUi.k_73e18b3f4a29') }} </button>
            <button :class="{ 'is-active': subtitleTitleStrategy === 'random_pool' }" type="button" @click="subtitleTitleStrategy = 'random_pool'"> {{ t('autoUi.k_84ba3e6f5cfb') }} </button>
          </div>
          <label v-if="subtitleTitleStrategy === 'single_for_all'" class="live-subtitle-dialog__field">
            <span>{{ t('autoUi.k_7e33e07fd936') }}</span>
            <input v-model.trim="subtitleTitleText" type="text" maxlength="120" :placeholder="t('autoUi.k_169a71f2d82c')" @keydown.enter.prevent="submitSubtitleDialog" />
          </label>
          <label v-else class="live-subtitle-dialog__field">
            <span>{{ t('autoUi.k_84ba3e6f5cfb') }}</span>
            <textarea v-model.trim="subtitleTitlePoolText" class="live-subtitle-dialog__textarea" :placeholder="t('autoUi.k_60e49a8dd0a0')"></textarea>
          </label>
          <div class="live-subtitle-dialog__inline-tip">
            {{ subtitleTitleStrategy === 'single_for_all' ? t('autoUi.k_fb5b47107a9b') : t('autoUi.k_70164720b604') }}
          </div>
        </section>

        <section v-else-if="subtitleDialogTab === 'template'" class="live-subtitle-dialog__section">
          <div class="live-subtitle-dialog__section-head">
            <span class="live-subtitle-dialog__kicker">Template</span>
            <strong>{{ t('autoUi.k_f84c2e382440') }}</strong>
          </div>
          <div class="live-subtitle-dialog__preset-grid">
            <button
              v-for="preset in subtitlePresets"
              :key="preset.id"
              class="live-subtitle-dialog__preset"
              :class="{ active: subtitleSelectedPreset === preset.id }"
              type="button"
              @click="applySubtitlePreset(preset.id)"
            >
              <strong>{{ preset.name }}</strong>
              <span>{{ preset.summary }}</span>
            </button>
          </div>
          <div class="live-subtitle-dialog__preset-note">{{ t('autoUi.k_6bf2c4d17ccd') }}</div>
        </section>

        <section v-else class="live-subtitle-dialog__section">
          <div class="live-subtitle-dialog__section-head">
            <span class="live-subtitle-dialog__kicker">Style</span>
            <strong>{{ t('autoUi.k_856e405fcf39') }}</strong>
          </div>
          <div class="live-subtitle-dialog__style-panel">
            <div class="live-subtitle-dialog__form-grid live-subtitle-dialog__form-grid--compact">
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_b50d4d8352f5') }}</span>
                <input v-model.trim="subtitleCaptionStyle.fontName" type="text" :placeholder="t('autoUi.k_9567b9609e02')" />
              </label>
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_576ccdb1f1c7') }}</span>
                <input v-model.number="subtitleCaptionStyle.fontSize" type="number" min="18" max="120" />
              </label>
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_a48b15a6de71') }}</span>
                <input v-model.number="subtitleCaptionStyle.strokeWidth" type="number" min="0" max="16" />
              </label>
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_3ca120ca0195') }}</span>
                <input v-model.number="subtitleCaptionStyle.maxLines" type="number" min="1" max="6" />
              </label>
            </div>
            <div class="live-subtitle-dialog__form-grid live-subtitle-dialog__form-grid--dual">
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_07f568dada4d') }}</span>
                <div class="live-subtitle-dialog__color-field">
                  <input v-model.trim="subtitleCaptionStyle.fontColor" type="text" />
                  <input v-model="subtitleCaptionStyle.fontColor" type="color" />
                </div>
              </label>
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_eaa98f95ba53') }}</span>
                <div class="live-subtitle-dialog__color-field">
                  <input v-model.trim="subtitleCaptionStyle.strokeColor" type="text" />
                  <input v-model="subtitleCaptionStyle.strokeColor" type="color" />
                </div>
              </label>
            </div>
            <div class="live-subtitle-dialog__form-grid live-subtitle-dialog__form-grid--compact">
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_88c34452cc46') }}</span>
                <select v-model="subtitleCaptionStyle.position">
                  <option value="top">{{ t('autoUi.k_a9d35ab0a675') }}</option>
                  <option value="center">{{ t('autoUi.k_910253ea0c16') }}</option>
                  <option value="bottom">{{ t('autoUi.k_435b2d8982fd') }}</option>
                </select>
              </label>
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_6ff4e8934c7f') }}</span>
                <select v-model="subtitleCaptionStyle.textAlign">
                  <option value="left">{{ t('autoUi.k_413f8db65f69') }}</option>
                  <option value="center">{{ t('autoUi.k_5009324782b9') }}</option>
                  <option value="right">{{ t('autoUi.k_70fe40dec2fa') }}</option>
                </select>
              </label>
              <label class="live-subtitle-dialog__field">
                <span>{{ t('autoUi.k_fa0119023442') }}</span>
                <input v-model.number="subtitleCaptionStyle.bottomMargin" type="number" min="48" max="600" />
              </label>
            </div>
          </div>
        </section>

        <div class="live-subtitle-dialog__actions">
          <button
            v-if="subtitleDialogMode === 'single' && subtitleDialogItem && itemHasAppliedSubtitle(subtitleDialogItem)"
            type="button"
            class="ghost-button"
            :disabled="subtitleDialogBusy"
            @click="revertSubtitleFromItem(subtitleDialogItem)"
          > {{ t('autoUi.k_5d2a55f19c91') }} </button>
          <button type="button" class="ghost-button" :disabled="subtitleDialogBusy" @click="closeSubtitleDialog">{{ t('autoUi.k_4d0b4688c787') }}</button>
          <button type="button" class="primary-button" :disabled="subtitleDialogBusy" @click="submitSubtitleDialog">
            {{ subtitleDialogBusy ? t('autoUi.k_dde1db57718c') : t('autoUi.k_c0b013507133') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="replacementRegionDialogOpen && replacementRegionDialogItem" class="replacement-region-dialog" @click.self="closeReplacementRegionEditor">
      <div class="replacement-region-dialog__panel">
        <div class="replacement-region-dialog__head">
          <div>
            <strong>{{ t('autoUi.k_329d5e81ce23') }}</strong>
            <span>{{ replacementRegionDialogItem.productSnapshot?.name || replacementRegionDialogItem.id }}</span>
          </div>
          <button type="button" :disabled="replacementRegionBusy" @click="closeReplacementRegionEditor">{{ t('autoUi.k_6c14bd7f6f9e') }}</button>
        </div>
        <div
          ref="replacementRegionStage"
          class="replacement-region-stage"
          @pointerdown.self="beginReplacementRegionInteraction($event, 'draw')"
          @pointermove="updateReplacementRegionInteraction"
          @pointerup="endReplacementRegionInteraction"
          @pointercancel="endReplacementRegionInteraction"
        >
          <img :src="previewSrc(replacementRegionDialogItem.referenceImagePath)" alt="replacement region source" draggable="false" />
          <div
            class="replacement-region-box"
            :style="replacementRegionStyle()"
            @pointerdown.stop="beginReplacementRegionInteraction($event, 'move')"
          >
            <span
              v-for="corner in replacementRegionCorners"
              :key="corner"
              class="replacement-region-handle"
              :class="`is-${corner}`"
              @pointerdown.stop="beginReplacementRegionInteraction($event, 'resize', corner)"
            ></span>
          </div>
        </div>
        <div class="replacement-region-dialog__meta">
          <span>{{ t('autoUi.k_223bacf5d4b9') }} {{ replacementRegionDialogItem.replacementRegion?.revision || 0 }}</span>
          <span>{{ Math.round(replacementRegionDraft.width * 100) }}% x {{ Math.round(replacementRegionDraft.height * 100) }}%</span>
        </div>
        <div class="replacement-region-dialog__actions">
          <button type="button" class="ghost-button" :disabled="replacementRegionBusy" @click="closeReplacementRegionEditor">{{ t('autoUi.k_4d0b4688c787') }}</button>
          <button type="button" class="primary-button" :disabled="replacementRegionBusy" @click="saveReplacementRegionAndRetry">
            <ScanLine class="h-4 w-4" />
            {{ replacementRegionBusy ? t('autoUi.k_d70d425039f2') : t('autoUi.k_c33516da3121') }}
          </button>
        </div>
      </div>
    </div>

    <BatchDeleteDialog
      :open="batchDeleteOpen"
      :count="selectedLibraryIds.length"
      :busy="batchDeleteBusy"
      @close="batchDeleteOpen = false"
      @confirm="confirmBatchDelete"
    />

    <ProductSelectDialog
      :open="productPickerOpen"
      :products="products"
      :selected-id="selectedProductId"
      @close="productPickerOpen = false"
      @select="selectedProductId = $event"
    />

    <RuntimeLogDialog
      v-model="runtimeDialogOpen"
      :logs="runtimeLogs"
      :title="runtimeDialogTitle || t('autoUi.k_a8ce402665f3')"
      :description="t('autoUi.k_bd11660cb06b')"
      :hint="t('autoUi.k_7ca26501dd28')"
      :fab-label="t('autoUi.k_e29c909bf39f')"
    />
  </div>
</template>

<style scoped>
.live-photo-page {
  display: grid;
  gap: 10px;
  min-height: 100vh;
  padding: 10px;
  box-sizing: border-box;
  align-content: start;
  color: var(--theme-text);
  background: radial-gradient(circle at top left, color-mix(in srgb, var(--theme-tone-violet) 12%, transparent), transparent 28%), linear-gradient(180deg, var(--theme-panel) 0%, var(--theme-panel-soft) 42%, var(--theme-panel) 100%);
}
.sr-only { position: absolute !important; width: 1px !important; height: 1px !important; min-height: 0 !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
.hero-shell, .panel-card, .library-export-card { border: 1px solid var(--theme-border); border-radius: 16px; background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03); }
.hero-shell { display: grid; gap: 8px; padding: 10px 12px; }
.hero-toolbar { display: flex; justify-content: space-between; gap: 8px; }
.hero-card { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 12px; padding-top: 10px; border-top: 1px solid var(--theme-border); }
.hero-copy { min-width: 0; }
.hero-headline h1 { margin: 0; font-size: 18px; line-height: 1.28; font-weight: 800; letter-spacing: -0.02em; }
.hero-desc { margin: 6px 0 0; max-width: 900px; font-size: 12px; line-height: 1.6; color: var(--theme-text); }
.stat-card { min-height: 82px; padding: 10px 12px; border-radius: 16px; background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-violet) 62%, transparent), color-mix(in srgb, var(--theme-panel-soft) 96%, transparent)); display: grid; gap: 4px; }
.stat-card span { font-size: 12px; color: var(--theme-text); }
.stat-card strong { font-size: 40px; line-height: 1; color: var(--theme-tone-violet); }
.banner { padding: 10px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; }
.banner-success { border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent); background: color-mix(in srgb, var(--theme-accent) 12%, transparent); color: var(--theme-accent); }
.banner-error { border: 1px solid color-mix(in srgb, var(--theme-tone-red) 20%, transparent); background: color-mix(in srgb, var(--theme-tone-red) 12%, transparent); color: var(--theme-tone-red); }
.tab-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-button, .primary-button, .ghost-button, .toolbar-button, .toolbar-icon { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 14px; border-radius: 12px; font-size: 12px; font-weight: 700; }
.tab-button, .ghost-button, .toolbar-button, .toolbar-icon { border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 80%, transparent); color: var(--theme-text); }
.tab-button.active, .toolbar-icon.active { border-color: color-mix(in srgb, var(--theme-tone-blue) 38%, transparent); background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-violet) 78%, transparent), color-mix(in srgb, var(--theme-tone-violet) 78%, transparent)); box-shadow: 0 10px 28px rgba(81, 54, 167, 0.22); }
.primary-button { border: 1px solid color-mix(in srgb, var(--theme-tone-violet) 40%, transparent); background: linear-gradient(90deg, var(--theme-tone-blue) 0%, var(--theme-tone-violet) 100%); color: var(--theme-text); box-shadow: 0 12px 28px rgba(126, 82, 255, 0.22); }
.ghost-button.small { min-height: 32px; font-size: 12px; padding: 0 10px; border-radius: 10px; }
.ghost-button.danger { border-color: color-mix(in srgb, var(--theme-tone-red) 20%, transparent); color: var(--theme-tone-red); }
.refresh-button { min-width: 84px; }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(330px, 0.92fr); gap: 10px; align-items: start; }
.panel-card { display: grid; gap: 10px; padding: 12px; }
.reference-card, .rules-card { min-height: 372px; }
.panel-head, .library-toolbar, .clone-thumb-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.panel-title-wrap { display: flex; align-items: center; gap: 10px; }
.panel-title-wrap strong, .panel-head > strong { font-size: 18px; line-height: 1.2; }
.live-photo-master-ref { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-panel-soft) 72%, transparent); }
.live-photo-master-ref--missing { grid-template-columns: 16px minmax(0, 1fr); color: var(--theme-tone-red); }
.live-photo-master-ref__preview { width: 88px; height: 88px; padding: 0; overflow: hidden; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--theme-text) 4%, transparent); }
.live-photo-master-ref__preview img { width: 100%; height: 100%; object-fit: cover; }
.live-photo-master-ref__copy { display: grid; gap: 4px; min-width: 0; }
.live-photo-master-ref__copy strong { color: var(--theme-text); }
.live-photo-master-ref__copy small { color: var(--theme-tone-blue); font-size: 11px; word-break: break-all; }
.live-console-row__binding-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.live-console-row__binding-card { display: grid; gap: 4px; padding: 12px; text-align: left; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-panel-soft) 80%, transparent); color: var(--theme-text); }
.live-console-row__binding-card span { color: var(--theme-text); font-size: 12px; }
.live-console-row__binding-card small { color: var(--theme-tone-blue); font-size: 11px; word-break: break-all; }
.panel-head-note { color: var(--theme-text-secondary); font-size: 12px; }
.step-badge { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(180deg, var(--theme-tone-blue), var(--theme-tone-blue)); color: var(--theme-text); font-size: 14px; font-weight: 700; box-shadow: 0 8px 18px rgba(98, 79, 210, 0.28); }
.field-stack, .field, .clone-shot-list, .library-layout, .library-grid-six, .export-copy, .clone-selected-grid, .settings-grid, .export-grid, .rules-compact { display: grid; gap: 10px; }
.field > span { font-size: 13px; font-weight: 700; color: var(--theme-text); }
.field input, .field select { width: 100%; min-height: 40px; padding: 0 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-panel-soft) 92%, transparent); color: var(--theme-text); font-size: 13px; }
.upload-surface { min-height: 164px; border-radius: 16px; border: 1px solid var(--theme-border); background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 82%, transparent), color-mix(in srgb, var(--theme-panel) 92%, transparent)); display: grid; place-items: center; gap: 10px; padding: 16px; color: var(--theme-text); text-align: center; cursor: pointer; }
.upload-copy strong { font-size: 15px; line-height: 1.35; }
.upload-copy small { font-size: 12px; line-height: 1.6; color: var(--theme-text); word-break: break-all; }
.upload-preview { width: 100%; max-height: 132px; object-fit: contain; border-radius: 10px; }
.reference-source-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.reference-source-card { min-width: 0; min-height: 164px; display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-panel-soft) 82%, transparent); color: var(--theme-text); text-align: left; cursor: pointer; }
.reference-source-card__icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 10px; background: color-mix(in srgb, var(--theme-tone-violet) 48%, transparent); color: var(--theme-text); }
.reference-source-card__preview { width: 64px; height: 96px; object-fit: cover; border-radius: 8px; }
.reference-source-card__copy { min-width: 0; display: grid; gap: 6px; }
.reference-source-card__copy strong { font-size: 15px; line-height: 1.35; }
.reference-source-card__copy small { color: var(--theme-tone-blue); font-size: 11px; line-height: 1.55; }
.reference-source-card__copy span { color: var(--theme-tone-blue); font-size: 11px; }
.reference-material-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.reference-material-bar small { color: var(--theme-tone-blue); font-size: 11px; }
.reference-material-picker { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 16px; background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-blue) 96%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
.reference-material-dialog { position: fixed; inset: var(--app-titlebar-height, 62px) 0 0; z-index: 90; display: grid; place-items: center; padding: 18px; background: var(--theme-panel); }
.reference-material-dialog__panel { width: min(980px, 100%); max-height: min(calc(100vh - var(--app-titlebar-height, 62px) - 36px), 820px); display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 12px; overflow: hidden; padding: 16px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.reference-material-dialog__head, .reference-material-dialog__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.reference-material-dialog__title { display: grid; gap: 4px; }
.reference-material-dialog__title strong { font-size: 18px; }
.reference-material-dialog__title p { margin: 0; color: var(--theme-tone-blue); font-size: 12px; }
.reference-material-dialog__empty { min-height: 260px; display: grid; place-items: center; color: var(--theme-tone-blue); font-size: 13px; }
.reference-material-dialog__footer { padding-top: 12px; border-top: 1px solid var(--theme-border); }
.reference-material-picker__hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 2px 0; }
.reference-material-picker__hero-copy { display: grid; gap: 4px; }
.reference-material-picker__hero-copy strong { color: var(--theme-text); font-size: 14px; }
.reference-material-picker__hero-copy small { color: var(--theme-tone-blue); font-size: 11px; }
.reference-material-picker__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0 2px; border-top: 1px solid var(--theme-border); }
.reference-material-picker__actions { display: inline-flex; align-items: center; gap: 8px; }
.reference-material-picker__pager { display: inline-flex; align-items: center; gap: 8px; color: var(--theme-tone-blue); font-size: 11px; }
.reference-material-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; max-height: 420px; overflow: auto; padding-right: 2px; }
.reference-material-card { display: grid; gap: 8px; padding: 8px; border-radius: 14px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel) 92%, transparent); cursor: pointer; transition: border-color .16s ease, transform .16s ease, box-shadow .16s ease; }
.reference-material-card.active { border-color: color-mix(in srgb, var(--theme-tone-violet) 72%, transparent); box-shadow: inset 0 0 0 1px rgba(124, 92, 255, 0.38); }
.reference-material-card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--theme-tone-blue) 34%, transparent); }
.reference-material-card input { margin: 0; }
.reference-material-card img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px; background: color-mix(in srgb, var(--theme-text) 4%, transparent); }
.reference-material-card__copy { display: grid; gap: 4px; min-width: 0; }
.reference-material-card__copy strong { color: var(--theme-text); font-size: 12px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reference-material-card__copy small { color: var(--theme-tone-blue); font-size: 10px; }
.field-select-mini { min-height: 30px; padding: 0 10px; border: 1px solid var(--theme-border); border-radius: 10px; background: color-mix(in srgb, var(--theme-panel-soft) 92%, transparent); color: var(--theme-text); font-size: 11px; }
.live-subtitle-dialog {
  position: fixed;
  inset: var(--app-titlebar-height, 62px) 0 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--theme-input) 72%, transparent);
  backdrop-filter: blur(8px);
}
.live-subtitle-dialog__panel {
  width: min(760px, 100%);
  max-height: min(calc(100vh - var(--app-titlebar-height, 62px) - 32px), 760px);
  overflow: auto;
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--theme-border);
  border-radius: 16px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 99%, transparent));
}

.live-photo-video-dialog {
  width: min(900px, 100%);
}

.live-photo-video-dialog__player {
  display: block;
  width: 100%;
  min-height: 280px;
  max-height: 68vh;
  border-radius: 12px;
  background: var(--theme-input);
  object-fit: contain;
}

.live-photo-video-dialog__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: color-mix(in srgb, var(--theme-tone-blue) 78%, transparent);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.live-subtitle-dialog__head, .live-subtitle-dialog__actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.live-subtitle-dialog__titleblock { display: grid; gap: 4px; }
.live-subtitle-dialog__head strong { font-size: 20px; line-height: 1.1; }
.live-subtitle-dialog__head p { margin: 0; color: var(--theme-tone-blue); font-size: 12px; line-height: 1.5; }
.live-subtitle-dialog__close { min-height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 92%, transparent); color: var(--theme-text); }
.live-subtitle-dialog__summary { display: flex; gap: 12px; }
.live-subtitle-dialog__summary-item { flex: 1; display: grid; gap: 4px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: color-mix(in srgb, var(--theme-panel-soft) 72%, transparent); }
.live-subtitle-dialog__summary-item span, .live-subtitle-dialog__field span { color: var(--theme-tone-blue); font-size: 12px; }
.live-subtitle-dialog__summary-item strong { font-size: 14px; color: var(--theme-text); }
.live-subtitle-dialog__tabs {
  display: inline-flex;
  gap: 4px;
  width: fit-content;
  padding: 4px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-panel-soft) 82%, transparent);
  border: 1px solid var(--theme-border);
}
.live-subtitle-dialog__tabs button {
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-tone-blue);
}
.live-subtitle-dialog__tabs button.active {
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-tone-blue) 24%, transparent);
}
.live-subtitle-dialog__section { display: grid; gap: 12px; }
.live-subtitle-dialog__section-head { display: grid; gap: 4px; }
.live-subtitle-dialog__kicker { color: var(--theme-tone-blue); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.live-subtitle-dialog__section-head strong { color: var(--theme-text); font-size: 14px; }
.live-subtitle-dialog__mode-pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.live-subtitle-dialog__mode-pills button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel-soft) 72%, transparent);
  color: var(--theme-text);
}
.live-subtitle-dialog__mode-pills button.is-active {
  border-color: color-mix(in srgb, var(--theme-tone-violet) 60%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
}
.live-subtitle-dialog__field {
  display: grid;
  gap: 6px;
}
.live-subtitle-dialog__section textarea,
.live-subtitle-dialog__section input,
.live-subtitle-dialog__section select {
  width: 100%;
  min-height: 38px;
  padding: 10px 12px;
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-panel-soft) 92%, transparent);
  color: var(--theme-text);
}
.live-subtitle-dialog__textarea { min-height: 120px; resize: vertical; }
.live-subtitle-dialog__inline-tip {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-panel-soft) 68%, transparent);
  color: var(--theme-tone-blue);
  font-size: 12px;
  line-height: 1.55;
}
.live-subtitle-dialog__preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.live-subtitle-dialog__preset {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-panel-soft) 70%, transparent);
  color: var(--theme-text);
}
.live-subtitle-dialog__preset.active {
  border-color: color-mix(in srgb, var(--theme-tone-violet) 60%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
}
.live-subtitle-dialog__preset span { color: var(--theme-tone-blue); font-size: 11px; line-height: 1.45; }
.live-subtitle-dialog__preset-note { color: var(--theme-tone-blue); font-size: 11px; line-height: 1.5; }
.live-subtitle-dialog__style-panel { display: grid; gap: 12px; }
.live-subtitle-dialog__form-grid { display: grid; gap: 10px; }
.live-subtitle-dialog__form-grid--compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.live-subtitle-dialog__form-grid--dual { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.live-subtitle-dialog__color-field { display: grid; grid-template-columns: minmax(0, 1fr) 42px; gap: 8px; align-items: center; }
.live-subtitle-dialog__actions {
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid var(--theme-border);
}
.live-subtitle-dialog__actions .ghost-button, .live-subtitle-dialog__actions .primary-button { min-width: 124px; }
.live-photo-retry-settings-panel {
  width: min(460px, 100%);
  gap: 18px;
}
.live-photo-retry-settings-hero {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-panel-soft) 62%, transparent);
}
.live-photo-retry-settings-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
}
.live-photo-retry-settings-hero div:nth-child(2) {
  display: grid;
  gap: 2px;
}
.live-photo-retry-settings-hero span,
.live-photo-retry-settings-hero small,
.live-photo-retry-settings-field small {
  color: var(--theme-tone-blue);
  font-size: 11px;
}
.live-photo-retry-settings-hero strong {
  color: var(--theme-text);
  font-size: 15px;
}
.live-photo-retry-settings-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border: 1px solid var(--theme-border);
  border-width: 1px 0;
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 700;
}
.live-photo-retry-settings-field > div:first-child {
  display: grid;
  gap: 4px;
}
.live-photo-retry-settings-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  color: var(--theme-tone-blue);
  font-size: 12px;
}
.live-photo-retry-settings-field input {
  width: 88px;
  box-sizing: border-box;
  min-height: 40px;
  padding: 7px 10px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  outline: 0;
  background: color-mix(in srgb, var(--theme-panel) 90%, transparent);
  color: var(--theme-text);
  font-size: 15px;
  font-weight: 700;
}
.live-photo-retry-settings-field input:focus {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(112, 226, 208, 0.12);
}
.live-photo-retry-settings-actions {
  padding-top: 0;
}
.product-picker { position: relative; display: grid; grid-template-columns: 42px minmax(0, 1fr) 16px; gap: 10px; align-items: center; min-height: 50px; padding: 0 12px; border: 1px solid var(--theme-border); border-radius: 14px; background: color-mix(in srgb, var(--theme-panel-soft) 92%, transparent); }
.product-picker select { appearance: none; border: 0; background: transparent; min-height: 50px; padding: 0; font-size: 14px; }
.project-picker { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 10px; align-items: center; min-height: 50px; padding: 0 16px; border: 1px solid var(--theme-border); border-radius: 14px; background: color-mix(in srgb, var(--theme-panel-soft) 92%, transparent); }
.project-picker select { appearance: none; border: 0; background: transparent; min-height: 50px; padding: 0; font-size: 14px; color: var(--theme-text); }
.picker-arrow { color: var(--theme-text); pointer-events: none; }
.product-thumb { width: 42px; height: 42px; border-radius: 11px; overflow: hidden; background: color-mix(in srgb, var(--theme-text) 6%, transparent); display: grid; place-items: center; }
.product-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.product-thumb-fallback { color: var(--theme-text); }
.create-button { min-height: 48px; border-radius: 14px; font-size: 15px; font-weight: 800; }
.safe-note { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--theme-text); font-size: 12px; line-height: 1.55; }
.rules-box { display: grid; border: 1px solid var(--theme-border); border-radius: 16px; overflow: hidden; background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 86%, transparent), color-mix(in srgb, var(--theme-panel) 90%, transparent)); }
.rule-row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; padding: 12px 14px; border-bottom: 1px solid var(--theme-border); }
.rule-row:last-child { border-bottom: 0; }
.rule-icon { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: var(--theme-tone-violet); border: 1px solid color-mix(in srgb, var(--theme-tone-violet) 34%, transparent); background: color-mix(in srgb, var(--theme-tone-violet) 10%, transparent); font-size: 13px; font-weight: 700; }
.rule-row p, .compact-row p { margin: 0; line-height: 1.55; font-size: 13px; color: var(--theme-text); }
.output-note { padding: 14px; border-radius: 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-violet) 82%, transparent), color-mix(in srgb, var(--theme-tone-violet) 94%, transparent)); border: 1px solid color-mix(in srgb, var(--theme-tone-violet) 24%, transparent); }
.output-note-head { margin-bottom: 8px; font-size: 15px; font-weight: 700; color: var(--theme-text); }
.output-note p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--theme-text); }
.quality-control-card { display: grid; gap: 12px; padding: 14px; border-radius: 16px; border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent); background: linear-gradient(180deg, color-mix(in srgb, var(--theme-accent) 36%, transparent), color-mix(in srgb, var(--theme-panel-soft) 60%, transparent)); }
.quality-control-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; color: var(--theme-accent); }
.quality-control-card__head strong { display: block; color: var(--theme-text); font-size: 14px; }
.quality-control-card__head small { display: block; margin-top: 5px; color: var(--theme-accent); font-size: 11px; line-height: 1.5; }
.quality-metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.quality-metric-grid > div { display: grid; gap: 3px; padding: 9px; border-radius: 11px; background: color-mix(in srgb, var(--theme-panel) 30%, transparent); border: 1px solid color-mix(in srgb, var(--theme-accent) 12%, transparent); }
.quality-metric-grid span { color: var(--theme-text-secondary); font-size: 10px; }
.quality-metric-grid strong { color: var(--theme-text); font-size: 15px; }
.prompt-version-editor { display: grid; gap: 9px; }
.prompt-kind-tabs { display: inline-flex; width: fit-content; gap: 4px; padding: 4px; border: 1px solid var(--theme-border); border-radius: 9px; background: var(--theme-surface-muted); }
.prompt-kind-tabs .ghost-button { min-width: 72px; border: 1px solid transparent; background: transparent; color: var(--theme-text-secondary); }
.prompt-kind-tabs .ghost-button { position: relative; }
.prompt-kind-tabs .ghost-button.active,
.prompt-kind-tabs .ghost-button[aria-selected='true'] { position: relative; border-color: var(--theme-accent) !important; background: var(--theme-accent-soft) !important; color: var(--theme-accent) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 18%, transparent) !important; }
.prompt-kind-tabs .ghost-button.active::after,
.prompt-kind-tabs .ghost-button[aria-selected='true']::after { position: absolute; right: 10px; bottom: 2px; left: 10px; height: 2px; border-radius: 2px; background: var(--theme-accent); content: ''; }
.prompt-kind-tabs .ghost-button:not(.active):hover { background: var(--theme-control); color: var(--theme-text); }
.prompt-version-editor__prompt textarea { min-height: 138px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.5; }
.prompt-version-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.clone-layout { display: grid; gap: 10px; align-content: start; }
.clone-top-grid, .clone-bottom-grid { display: grid; gap: 10px; }
.clone-top-grid { grid-template-columns: minmax(360px, 0.8fr) minmax(0, 1.2fr); }
.clone-bottom-grid { grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.75fr); gap: 12px; }
.clone-footer-actions { display: grid; grid-template-columns: minmax(0, 1fr) 274px; gap: 10px; align-items: center; }
.clone-project-card, .clone-preview-card, .clone-settings-card, .clone-rule-card { min-height: 0; align-content: start; }
.clone-project-card { grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
.clone-preview-card { gap: 12px; }
.clone-shot-list { max-height: 420px; overflow: auto; padding-right: 2px; align-content: start; }
.clone-shot-row { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; padding: 12px; border-radius: 12px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 74%, transparent); }
.clone-shot-row.active { border-color: color-mix(in srgb, var(--theme-tone-violet) 42%, transparent); box-shadow: inset 0 0 0 1px rgba(126, 96, 255, 0.18); }
.reference-task-row.missing { border-color: color-mix(in srgb, var(--theme-tone-red) 34%, transparent); box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.12); }
.reference-task-row { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.clone-shot-copy { min-width: 0; }
.clone-shot-copy strong { font-size: 13px; line-height: 1.42; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.clone-shot-copy small { font-size: 10px; color: var(--theme-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.missing-pill { margin-top: 6px; min-height: 20px; width: fit-content; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--theme-tone-red) 16%, transparent); color: var(--theme-tone-red); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; }
.secondary-create-button { min-height: 40px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--theme-tone-violet) 36%, transparent); background: color-mix(in srgb, var(--theme-tone-violet) 20%, transparent); color: var(--theme-text); font-size: 13px; font-weight: 700; }
.clone-summary-head { display: grid; gap: 4px; justify-items: end; }
.clone-summary-head strong { font-size: 13px; font-weight: 600; color: var(--theme-text); }
.clone-preview-main { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 12px; align-items: start; }
.clone-preview-frame { position: relative; height: 288px; border-radius: 16px; overflow: hidden; border: 1px solid var(--theme-border); background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 92%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent)); display: flex; align-items: center; justify-content: center; }
.clone-preview-frame img { width: auto; height: 100%; max-width: 100%; object-fit: contain; display: block; }
.clone-fallback { width: 100%; height: 100%; min-height: 288px; }
.preview-play { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel) 58%, transparent); color: var(--theme-text); display: grid; place-items: center; }
.clone-stat-stack { display: grid; gap: 8px; }
.clone-stat-card { min-height: 64px; border-radius: 14px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 76%, transparent); padding: 10px; display: grid; gap: 4px; }
.clone-stat-card span { font-size: 12px; }
.clone-stat-card strong { font-size: 28px; line-height: 1; }
.clone-thumb-head strong, .clone-selected-section strong { font-size: 15px; }
.clone-thumb-tools { display: flex; gap: 6px; }
.thumb-tool { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 70%, transparent); color: var(--theme-text); display: grid; place-items: center; }
.clone-thumb-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; }
.clone-thumb-card, .clone-selected-card { position: relative; overflow: hidden; border-radius: 10px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 74%, transparent); min-height: 54px; aspect-ratio: 0.72 / 1; }
.clone-thumb-card.active { border-color: color-mix(in srgb, var(--theme-tone-violet) 48%, transparent); }
.clone-thumb-card img, .clone-selected-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.clone-thumb-index { position: absolute; left: 6px; bottom: 6px; min-width: 22px; height: 18px; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--theme-panel) 72%, transparent); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--theme-text); }
.clone-thumb-fallback { min-height: 54px; display: grid; place-items: center; color: var(--theme-text); font-weight: 700; font-size: 10px; }
.clone-selected-grid { grid-template-columns: repeat(auto-fit, minmax(66px, 84px)); gap: 5px; }
.clone-selected-card { min-height: 58px; }
.clone-selected-meta { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--theme-input) 88%, transparent)); display: grid; gap: 2px; }
.clone-selected-meta span { font-size: 10px; font-weight: 700; }
.clone-selected-meta small { font-size: 9px; color: var(--theme-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.clone-settings-card { gap: 12px; }
.clone-rule-card { gap: 12px; padding-top: 14px; }
.settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.format-card { border-radius: 16px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 72%, transparent); padding: 14px 16px; display: grid; gap: 8px; min-height: 108px; align-content: start; }
.format-card-active { border-color: color-mix(in srgb, var(--theme-tone-violet) 42%, transparent); background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-violet) 48%, transparent), color-mix(in srgb, var(--theme-panel-soft) 86%, transparent)); }
.format-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.format-card-title { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.format-card-title strong { font-size: 15px; line-height: 1.25; }
.format-tag { min-height: 22px; padding: 0 9px; border-radius: 999px; background: color-mix(in srgb, var(--theme-tone-amber) 18%, transparent); color: var(--theme-tone-amber); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; }
.format-card p { margin: 0; font-size: 12px; line-height: 1.75; color: var(--theme-text); }
.export-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.rules-compact { gap: 14px; padding-top: 2px; }
.compact-row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; }
.compact-dot { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--theme-border); color: var(--theme-text); display: grid; place-items: center; font-size: 13px; }
.clone-generate-button { min-height: 46px; border-radius: 14px; font-size: 15px; font-weight: 800; padding: 0 20px; justify-self: start; min-width: 320px; }
.clone-safe-note { justify-content: flex-start; align-items: flex-start; border: 1px solid var(--theme-border); border-radius: 16px; background: color-mix(in srgb, var(--theme-panel-soft) 72%, transparent); padding: 14px 16px; }
.clone-safe-note span { display: block; font-size: 12px; line-height: 1.7; }
.reference-status-list { display: grid; gap: 8px; max-height: 240px; overflow: auto; padding-right: 2px; }
.reference-status-card { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-panel-soft) 74%, transparent); }
.reference-status-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.reference-status-top strong { min-width: 0; font-size: 13px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reference-status-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: color-mix(in srgb, var(--theme-tone-blue) 72%, transparent); font-size: 11px; }
.reference-status-card small { font-size: 10px; color: var(--theme-text); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-pill.status-processing { background: color-mix(in srgb, var(--theme-tone-blue) 18%, transparent); color: var(--theme-text); }
.status-pill.status-failed { background: color-mix(in srgb, var(--theme-tone-red) 18%, transparent); color: var(--theme-tone-red); }
.status-pill.status-draft { background: color-mix(in srgb, var(--theme-control-hover) 18%, transparent); color: var(--theme-text); }
.status-pill.status-completed { background: color-mix(in srgb, var(--theme-accent) 18%, transparent); color: var(--theme-accent); }
.library-layout { display: grid; gap: 14px; }
.library-headline {
  display: grid;
  gap: 12px;
  padding: 8px 0 14px;
  border-bottom: 1px solid var(--theme-border);
}
.library-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-width: 0;
}
.library-heading-cluster {
  display: flex;
  align-items: center;
  gap: 22px;
  min-width: 0;
}
.library-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 0 0 auto;
}
.library-title-row strong {
  display: inline-flex;
  align-items: center;
  font-size: 18px;
  line-height: 1.2;
  white-space: nowrap;
}
.library-count {
  min-height: 27px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 24%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  color: var(--theme-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;
  line-height: 1;
}
.library-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 44px;
  padding-top: 10px;
  border-top: 1px solid var(--theme-border);
}
.status-filter-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  width: max-content;
  max-width: 100%;
  padding: 3px;
  overflow-x: auto;
  border: 1px solid var(--theme-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-control-hover) 5%, transparent);
}
.status-filter-tabs button {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  transition: background-color 160ms ease, color 160ms ease;
}
.status-filter-tabs button:hover { color: var(--theme-text); background: color-mix(in srgb, var(--theme-control-hover) 8%, transparent); }
.status-filter-tabs button.active { background: color-mix(in srgb, var(--theme-accent) 20%, transparent); color: var(--theme-accent); }
.library-action-group,
.library-output-actions,
.library-head-tools,
.library-view-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}
.library-output-actions {
  margin-left: auto;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.library-head-tools {
  flex: 0 0 auto;
  margin-left: auto;
}
.library-view-toggle {
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-control-hover) 8%, transparent);
}
.library-pagination {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  min-height: 32px;
  padding: 2px;
}
.library-pagination__text {
  min-width: 58px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--theme-tone-blue);
  font-variant-numeric: tabular-nums;
}
.library-page-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--theme-tone-blue);
}
.library-page-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-control-hover) 14%, transparent);
  color: var(--theme-text);
}
.library-page-button:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}
.library-overview {
  display: flex;
  gap: 18px;
  min-width: 0;
}
.library-overview__card {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0;
}
.library-overview__card span { font-size: 12px; line-height: 1; color: var(--theme-text-secondary); }
.library-overview__card strong { display: inline-flex; align-items: center; font-size: 12px; line-height: 1; color: var(--theme-text); font-variant-numeric: tabular-nums; }
.library-overview__card.is-running strong { color: var(--theme-accent); }
.library-overview__card.is-failed strong { color: var(--theme-tone-red); }
.library-overview__card.is-paused strong { color: var(--theme-tone-amber); }
.library-overview__card.is-selected strong { color: var(--theme-accent); }
.toolbar-button {
  min-width: 0;
  padding: 0 11px;
  min-height: 34px;
  white-space: nowrap;
  border-color: var(--theme-border);
  background: color-mix(in srgb, var(--theme-control-hover) 7%, transparent);
}
.library-toolbar .toolbar-button:disabled,
.library-toolbar .primary-button:disabled {
  opacity: 0.38;
}
.toolbar-icon { width: 28px; height: 28px; min-height: 28px; padding: 0; border: 0; border-radius: 5px; background: transparent; }
.toolbar-icon:hover { background: color-mix(in srgb, var(--theme-control-hover) 12%, transparent); }
.toolbar-icon.active { background: color-mix(in srgb, var(--theme-accent) 20%, transparent); color: var(--theme-accent); }
.export-selected-button { min-width: 132px; min-height: 36px; }
.empty-card { min-height: 140px; place-items: center; text-align: center; }
.metadata-card-select {
  align-content: start;
  gap: 8px;
  cursor: default;
}
.metadata-card-select select {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel-soft) 92%, transparent);
  color: var(--theme-text);
  font-size: 13px;
}
.metadata-card-select small {
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.5;
}
.live-console-list { display: grid; gap: 10px; }
.live-console-list { display: grid; gap: 10px; }
.live-console-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.live-console-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid var(--theme-border);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--theme-tone-blue) 12%, transparent), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
  box-shadow: 0 18px 40px rgba(6, 10, 20, 0.22);
}

.live-console-card.selected {
  border-color: color-mix(in srgb, var(--theme-tone-violet) 46%, transparent);
  box-shadow: inset 0 0 0 1px rgba(126, 96, 255, 0.18);
}

.live-console-card__head,
.live-console-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.live-console-card__preview {
  padding: 0;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 84%, transparent);
}

.live-console-card__body {
  display: grid;
  gap: 8px;
}

.live-console-card__footer {
  margin-top: 2px;
}

.live-console-row {
  display: grid;
  grid-template-columns: 28px 104px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid var(--theme-border);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--theme-tone-blue) 12%, transparent), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
  box-shadow: 0 18px 40px rgba(6, 10, 20, 0.22);
}
.live-console-row.selected { border-color: color-mix(in srgb, var(--theme-tone-violet) 46%, transparent); box-shadow: inset 0 0 0 1px rgba(126, 96, 255, 0.18); }
.live-console-row__check {
  position: relative;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
}
.live-console-row__check input {
  position: absolute;
  inset: 0;
  width: 16px;
  height: 16px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.live-console-row__check span {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.live-console-row__check input:checked + span {
  background: linear-gradient(90deg, var(--theme-tone-blue) 0%, var(--theme-tone-violet) 100%);
  border-color: transparent;
}
.live-console-row__check input:checked + span::after {
  content: '';
  width: 6px;
  height: 10px;
  border: solid var(--theme-border);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.live-console-row__preview,
.live-console-row__task,
.live-console-row__main,
.live-console-row__side,
.live-console-row__bottom,
.live-console-row__actions { min-width: 0; }
.live-console-row__thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}
.live-console-row__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.live-console-row__thumb-empty {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--theme-text);
}
.live-console-row__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
}
.live-console-row__task { display: grid; gap: 8px; }
.live-console-row__titleline { display: flex; align-items: center; gap: 8px; min-width: 0; }
.live-console-row__titleline h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
  color: var(--theme-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.live-console-row__source {
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-tone-blue) 12%, transparent);
  color: var(--theme-text);
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
}
.live-console-row__meta { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.live-console-row__dot { width: 4px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--theme-tone-blue) 70%, transparent); }
.live-console-row__text { color: var(--theme-tone-blue); font-size: 11px; }
.live-console-row__subtitle {
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.live-console-row__error {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--theme-tone-red);
  font-size: 11px;
}
.live-console-row__error-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.live-console-row__side {
  display: grid;
  gap: 10px;
  justify-items: end;
  align-content: start;
}
.live-console-row__bottom {
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-border);
}
.live-console-row__quickrefs { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.live-console-row__quickchip {
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.live-console-row__quickchip--accent {
  border-color: color-mix(in srgb, var(--theme-tone-amber) 24%, transparent);
  background: color-mix(in srgb, var(--theme-tone-amber) 10%, transparent);
  color: var(--theme-tone-amber);
}
.live-console-row__link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--theme-tone-blue);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
}
.live-console-row__link--primary {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-tone-blue) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-tone-violet) 28%, transparent);
}
.live-console-row__detail-grid {
  display: grid;
  grid-template-columns: minmax(240px, 0.92fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}
.live-console-row__detail-card {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
}
.live-console-row__detail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--theme-border);
}
.live-console-row__detail-head strong { font-size: 13px; color: var(--theme-text); }
.live-console-row__detail-head span { font-size: 11px; color: var(--theme-tone-blue); }
.live-console-row__detail-block { display: grid; gap: 6px; }
.live-console-row__detail-block label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-tone-blue);
}
.live-console-row__detail-block pre {
  margin: 0;
  min-height: 72px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 56%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.6;
}
.live-console-row__path-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.live-console-row__ref-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}
.live-console-row__ref-preview {
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 42%, transparent);
  border-radius: 14px;
  padding: 8px;
  display: grid;
  gap: 8px;
  text-align: left;
  color: var(--theme-text);
}
.live-console-row__ref-preview img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}
.live-console-row__ref-preview span {
  font-size: 10px;
  line-height: 1.4;
  word-break: break-all;
  color: var(--theme-tone-blue);
}
.live-console-row__path-list li {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 42%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-all;
}
.live-console-row__timeline { display: grid; gap: 10px; }
.live-console-row__timeline-item {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 42%, transparent);
}
.live-console-row__timeline-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.live-console-row__timeline-main strong { font-size: 12px; color: var(--theme-text); }
.live-console-row__timeline-main span { font-size: 11px; color: var(--theme-tone-blue); }
.live-console-row__timeline-item small { font-size: 10px; color: var(--theme-text-secondary); }
.live-console-row__timeline-error {
  margin: 0;
  color: var(--theme-tone-red);
  font-size: 11px;
  line-height: 1.5;
}
.live-console-row__statuswrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.live-console-row__status,
.live-console-row__stepbadge {
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
.live-console-row__status.is-success { background: color-mix(in srgb, var(--theme-accent) 14%, transparent); color: var(--theme-accent); }
.live-console-row__status.is-danger { background: color-mix(in srgb, var(--theme-tone-red) 14%, transparent); color: var(--theme-tone-red); }
.live-console-row__status.is-warning { background: color-mix(in srgb, var(--theme-tone-amber) 16%, transparent); color: var(--theme-tone-amber); }
.live-console-row__status.is-draft { background: color-mix(in srgb, var(--theme-control-hover) 14%, transparent); color: var(--theme-text); }
.live-console-row__status.is-running { background: color-mix(in srgb, var(--theme-tone-blue) 14%, transparent); color: var(--theme-tone-blue); }
.live-console-row__stepbadge { border: 1px solid var(--theme-border); background: color-mix(in srgb, var(--theme-text) 4%, transparent); color: var(--theme-text); }
.live-console-row__stepbadge.tone-queue { color: var(--theme-text); }
.live-console-row__stepbadge.tone-image { color: var(--theme-tone-red); }
.live-console-row__stepbadge.tone-validation { color: var(--theme-tone-amber); }
.live-console-row__stepbadge.tone-video { color: var(--theme-tone-blue); }
.live-console-row__stepbadge.tone-package { color: var(--theme-tone-amber); }
.live-console-row__stepbadge.tone-done { color: var(--theme-accent); }
.live-console-row__updated-inline { display: flex; align-items: center; gap: 6px; color: var(--theme-text-secondary); font-size: 11px; }
.live-console-row__actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.image-retry-decision {
  display: flex;
  gap: 0;
  width: 100%;
  min-height: 34px;
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-panel) 72%, transparent);
}
.image-retry-decision__button {
  display: inline-flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  transition: background 150ms ease, color 150ms ease;
}
.image-retry-decision__button:only-child {
  flex-basis: 100%;
}
.image-retry-decision__button:hover {
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
}
.image-retry-decision__button--primary {
  flex-grow: 1.12;
  border-left: 1px solid var(--theme-border);
  background: linear-gradient(90deg, color-mix(in srgb, var(--theme-accent) 10%, transparent), color-mix(in srgb, var(--theme-accent) 18%, transparent));
  color: var(--theme-accent);
}
.image-retry-decision__button--primary:hover {
  background: linear-gradient(90deg, color-mix(in srgb, var(--theme-accent) 16%, transparent), color-mix(in srgb, var(--theme-accent) 25%, transparent));
  color: var(--theme-accent);
}
.live-console-grid .image-retry-decision {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 7px;
  min-height: 38px;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.live-console-grid .image-retry-decision__button {
  min-height: 38px;
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-tone-blue) 80%, transparent);
}
.live-console-grid .image-retry-decision__button:not(.image-retry-decision__button--primary) {
  padding: 0;
  font-size: 0;
}
.live-console-grid .image-retry-decision__button--primary {
  border: 1px solid color-mix(in srgb, var(--theme-accent) 42%, transparent);
  background: linear-gradient(135deg, var(--theme-accent), var(--theme-accent));
  box-shadow: 0 7px 18px rgba(5, 57, 52, 0.22), inset 0 1px 0 rgba(210, 255, 247, 0.1);
  color: var(--theme-text);
}
.live-console-grid .image-retry-decision__button--primary:hover {
  background: linear-gradient(135deg, var(--theme-accent), var(--theme-accent));
  color: var(--theme-text);
}
.live-console-grid .live-console-row__actions {
  width: 100%;
}
.live-console-row__action {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  color: var(--theme-text);
}
.live-console-row__action--play { background: color-mix(in srgb, var(--theme-tone-blue) 14%, transparent); }
.live-console-row__action--danger { color: var(--theme-tone-red); }
.replacement-region-dialog {
  position: fixed;
  inset: var(--app-titlebar-height, 62px) 0 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--theme-input) 78%, transparent);
  backdrop-filter: blur(10px);
}
.replacement-region-dialog__panel {
  width: min(980px, 100%);
  max-height: calc(100vh - var(--app-titlebar-height, 62px) - 48px);
  display: grid;
  gap: 14px;
  overflow: auto;
  padding: 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.replacement-region-dialog__head,
.replacement-region-dialog__actions,
.replacement-region-dialog__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.replacement-region-dialog__head > div { display: grid; gap: 4px; }
.replacement-region-dialog__head strong { color: var(--theme-text); font-size: 18px; }
.replacement-region-dialog__head span,
.replacement-region-dialog__meta { color: var(--theme-text-secondary); font-size: 12px; }
.replacement-region-dialog__head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
}
.replacement-region-stage {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
  user-select: none;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.replacement-region-stage img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(68vh, 720px);
  pointer-events: none;
}
.replacement-region-box {
  position: absolute;
  border: 0;
  background: transparent;
  box-shadow: none;
  cursor: move;
}
.replacement-region-handle {
  position: absolute;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.replacement-region-handle::before,
.replacement-region-handle::after {
  content: '';
  position: absolute;
  display: block;
  background: var(--theme-accent);
  box-shadow: 0 0 0 1px rgba(7, 18, 14, 0.72);
}
.replacement-region-handle::before {
  width: 2px;
  height: 14px;
}
.replacement-region-handle::after {
  width: 14px;
  height: 2px;
}
.replacement-region-handle.is-nw::before { left: 0; top: 0; }
.replacement-region-handle.is-nw::after { left: 0; top: 0; }
.replacement-region-handle.is-ne::before { right: 0; top: 0; }
.replacement-region-handle.is-ne::after { right: 0; top: 0; }
.replacement-region-handle.is-sw::before { left: 0; bottom: 0; }
.replacement-region-handle.is-sw::after { left: 0; bottom: 0; }
.replacement-region-handle.is-se::before { right: 0; bottom: 0; }
.replacement-region-handle.is-se::after { right: 0; bottom: 0; }
.replacement-region-handle.is-nw,
.replacement-region-handle.is-ne,
.replacement-region-handle.is-sw,
.replacement-region-handle.is-se {
  border-radius: 0;
}
.replacement-region-handle.is-nw { left: -9px; top: -9px; cursor: nwse-resize; }
.replacement-region-handle.is-ne { right: -9px; top: -9px; cursor: nesw-resize; }
.replacement-region-handle.is-sw { left: -9px; bottom: -9px; cursor: nesw-resize; }
.replacement-region-handle.is-se { right: -9px; bottom: -9px; cursor: nwse-resize; }
.replacement-region-dialog__actions { justify-content: flex-end; }
.replacement-region-dialog__actions .primary-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.live-detail-dialog {
  position: fixed;
  inset: var(--app-titlebar-height, 62px) 0 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 28px;
}
.live-detail-dialog::before {
  content: '';
  position: fixed;
  inset: var(--app-titlebar-height, 62px) 0 0;
  background: color-mix(in srgb, var(--theme-input) 72%, transparent);
  backdrop-filter: blur(12px);
  z-index: -1;
}
.live-detail-dialog__panel {
  width: min(1380px, 100%);
  max-height: calc(100vh - var(--app-titlebar-height, 62px) - 56px);
  overflow: auto;
  border-radius: 24px;
  border: 1px solid var(--theme-border);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--theme-tone-blue) 16%, transparent), transparent 24%),
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
  padding: 18px;
}
.live-detail-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.live-detail-dialog__title { display: grid; gap: 6px; }
.live-detail-dialog__title strong { font-size: 22px; line-height: 1.2; color: var(--theme-text); }
.live-detail-dialog__title p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--theme-text-secondary); }
.live-detail-dialog__close {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 700;
}
.live-detail-dialog__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.live-detail-dialog__summary-card {
  display: grid;
  gap: 4px;
  min-height: 88px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
}
.live-detail-dialog__summary-card span { font-size: 11px; color: var(--theme-tone-blue); }
.live-detail-dialog__summary-card strong { font-size: 20px; line-height: 1.15; color: var(--theme-text); }
.live-detail-dialog__summary-card small { font-size: 11px; color: var(--theme-tone-blue); }
.live-detail-dialog__hero {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.live-detail-dialog__hero-card--wide { grid-column: 1 / -1; }
.live-detail-dialog__hero-card {
  display: grid;
  gap: 12px;
  min-height: 0;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
}
.live-detail-dialog__hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.live-detail-dialog__hero-head strong { font-size: 14px; color: var(--theme-text); }
.live-detail-dialog__hero-head span { font-size: 11px; color: var(--theme-text-secondary); }
.live-detail-dialog__hero-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.live-detail-dialog__metric {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-panel) 42%, transparent);
  border: 1px solid var(--theme-border);
}
.live-detail-dialog__metric span { font-size: 10px; color: var(--theme-tone-blue); }
.live-detail-dialog__metric strong { font-size: 13px; line-height: 1.5; color: var(--theme-text); }
.live-result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.live-result-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 50%, transparent);
}
.live-result-card__head {
  display: grid;
  gap: 4px;
}
.live-result-card__head strong {
  font-size: 14px;
  color: var(--theme-text);
}
.live-result-card__head span {
  font-size: 11px;
  color: var(--theme-tone-blue);
  line-height: 1.5;
  word-break: break-all;
}
.live-result-card__frame,
.live-result-card__video {
  width: 100%;
  min-height: 220px;
  max-height: 280px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 94%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
}
.live-result-card__frame {
  padding: 0;
  overflow: hidden;
  cursor: pointer;
}
.live-result-card__frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.live-result-card__empty {
  min-height: 220px;
  border-radius: 16px;
  border: 1px dashed var(--theme-border);
  color: var(--theme-tone-blue);
  display: grid;
  place-items: center;
  gap: 8px;
  text-align: center;
  padding: 18px;
}
.live-result-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.live-detail-dialog__ghost {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-violet) 24%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 12%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  font-weight: 700;
}
.live-detail-dialog__log-list {
  display: grid;
  gap: 10px;
  max-height: 248px;
  overflow: auto;
  padding-right: 2px;
}
.live-detail-dialog__log-item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 42%, transparent);
}
.live-detail-dialog__log-item.is-success { border-color: color-mix(in srgb, var(--theme-accent) 22%, transparent); }
.live-detail-dialog__log-item.is-error { border-color: color-mix(in srgb, var(--theme-tone-red) 22%, transparent); }
.live-detail-dialog__log-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.live-detail-dialog__log-meta strong {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--theme-text);
  font-size: 10px;
}
.live-detail-dialog__log-item p {
  margin: 0;
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}
.live-detail-dialog__log-empty {
  min-height: 132px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  border: 1px dashed var(--theme-border);
  color: var(--theme-text-secondary);
  font-size: 12px;
  text-align: center;
  padding: 16px;
}
.live-detail-dialog__artifact-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 1200px) {
  .workspace-grid,
  .clone-top-grid,
  .clone-bottom-grid,
  .clone-footer-actions,
  .clone-preview-main,
  .settings-grid,
  .export-grid,
  .library-grid-six,
  .hero-card { grid-template-columns: 1fr; }
  .hero-toolbar { flex-direction: column; align-items: stretch; }
  .library-summary-row { flex-wrap: nowrap; }
  .library-heading-cluster { flex-wrap: wrap; row-gap: 8px; }
  .library-head-tools { margin-left: auto; }
  .library-output-actions { width: auto; }
  .clone-thumb-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .clone-generate-button { min-width: 0; width: 100%; justify-self: stretch; }
  .live-console-row__main {
    grid-template-columns: 1fr;
  }
  .live-console-row__side {
    justify-items: start;
  }
  .live-console-row__bottom {
    flex-direction: column;
    align-items: stretch;
  }
  .live-console-row__actions { justify-content: flex-start; }
  .live-console-row__detail-grid { grid-template-columns: 1fr; }
  .live-detail-dialog {
    padding: 14px;
  }
  .live-detail-dialog__summary {
    grid-template-columns: 1fr;
  }
  .live-detail-dialog__hero {
    grid-template-columns: 1fr;
  }
  .quality-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .live-result-grid {
    grid-template-columns: 1fr;
  }
  .reference-material-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .reference-material-picker__hero,
  .reference-material-picker__toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .reference-material-picker__pager {
    justify-content: space-between;
  }
}
@media (max-width: 720px) {
  .library-headline { padding: 6px 0 14px; }
  .library-summary-row { align-items: flex-start; flex-wrap: wrap; }
  .library-heading-cluster { width: 100%; }
  .library-title-row { width: 100%; }
  .library-head-tools { width: 100%; margin-left: 0; justify-content: space-between; }
  .library-toolbar { align-items: stretch; }
  .library-action-group,
  .library-task-actions,
  .library-output-actions { width: 100%; }
  .library-action-group { flex-wrap: wrap; }
  .library-output-actions { margin-left: 0; justify-content: flex-start; }
  .reference-source-grid { grid-template-columns: 1fr; }
  .live-console-row {
    grid-template-columns: 26px minmax(0, 1fr);
  }
  .live-console-row__preview,
  .live-console-row__main,
  .live-console-row__bottom {
    grid-column: 2 / -1;
  }
  .live-console-row__quickrefs { gap: 8px; }
  .live-console-row__detail-head,
  .live-console-row__timeline-main,
  .live-detail-dialog__head,
  .live-detail-dialog__hero-head,
  .live-detail-dialog__log-meta {
    flex-direction: column;
    align-items: flex-start;
  }
  .live-console-row__detail-card { padding: 12px; }
  .live-detail-dialog__hero-grid {
    grid-template-columns: 1fr;
  }
  .quality-metric-grid { grid-template-columns: 1fr 1fr; }
  .reference-material-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .reference-material-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
.product-picker-button { width: 100%; color: var(--theme-text); text-align: left; cursor: pointer; }
.product-picker-button:hover { border-color: color-mix(in srgb, var(--theme-accent) 44%, transparent); }
.product-picker-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.batch-delete-button { color: var(--theme-tone-red); border-color: color-mix(in srgb, var(--theme-tone-red) 24%, transparent); }
</style>
