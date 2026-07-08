<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import RuntimeLogDialog from '../components/RuntimeLogDialog.vue'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock3,
  FileImage,
  Filter,
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
  Play,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
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
  usageStatus: 'unused' | 'used'
  boundProductId?: string
  createdAt: number
}

type CloneProjectSummary = {
  id: string
  title: string
  updatedAt: number
}

type CloneProjectDetail = {
  id: string
  title: string
  storyboardFrames?: Array<{ shotId: string; imagePath?: string }>
  shotVideoOutputs?: Array<{ shotId: string; videoPath?: string; localPath?: string }>
  blueprint?: { shots?: Array<{ id: string; scriptText?: string; scriptRole?: string }> }
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
  workflow?: {
    currentStep: 'queued' | 'image_generation' | 'video_generation' | 'live_photo_packaging' | 'completed'
    stepStatus: Record<
      'queued' | 'image_generation' | 'video_generation' | 'live_photo_packaging' | 'completed',
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
    currentStage: 'queued' | 'image_generation' | 'video_generation' | 'live_photo_packaging' | 'completed'
    lastStartedAt?: number
    lastCompletedAt?: number
    lastError?: string
  }
  logs?: Array<{ id: string; level: 'info' | 'success' | 'error'; message: string; time: number }>
  error?: string
  updatedAt: number
}

type LivePhotoSettings = {
  referenceMotionTemplate: 'push_in' | 'push_out' | 'ambient_sway'
  cloneMotionTemplate: 'push_in' | 'push_out' | 'ambient_sway'
  outputResolution: '1080x1440' | '2160x2880' | '3024x4032'
  frameRate: '24' | '30'
  quality: 'medium' | 'high'
  updatedAt: number
}

const router = useRouter()
const { t } = useI18n()

const uiText = {
  heroTitle: '\u4ece\u5546\u54c1\u53c2\u8003\u56fe\u6216\u590d\u523b\u955c\u5934\u751f\u6210\u53ef\u76f4\u63a5\u5bfc\u51fa\u7684\u52a8\u6001\u7167\u7247\u7d20\u6750',
  heroDesc:
    '\u652f\u6301\u53c2\u8003\u56fe\u6279\u91cf\u5efa\u4efb\u52a1\u3001\u81ea\u52a8\u53d6\u6570\u3001\u81ea\u52a8\u751f\u6210\u89c6\u9891\u5e76\u7ee7\u7eed\u5199\u51fa\u52a8\u6001\u7167\u7247\u7d20\u6750\uff0c\u5c06\u53c2\u8003\u56fe\u3001\u590d\u523b\u955c\u5934\u4e0e\u5e93\u5bfc\u51fa\u96c6\u4e2d\u5728\u4e00\u4e2a\u9875\u9762\u5b8c\u6210\u3002',
  completed: '\u5df2\u5b8c\u6210',
  tabReference: '\u4ece\u53c2\u8003\u56fe\u521b\u5efa',
  tabClone: '\u4ece\u590d\u523b\u955c\u5934\u521b\u5efa',
  tabLibrary: '\u5e93 / \u5bfc\u51fa',
  referenceTitle: '\u53c2\u8003\u56fe\u66ff\u6362',
  referenceNote: '\u6309\u8bbe\u8ba1\u7a3f\u6bd4\u4f8b\u8fdb\u884c\u6279\u91cf\u5efa\u4efb\u52a1',
  referenceImage: '\u53c2\u8003\u56fe\u7247',
  referenceUploadTitle: '\u70b9\u51fb\u4e0a\u4f20\u6216\u62d6\u62fd\u56fe\u7247\u5230\u6b64\u5904',
  referenceUploadDesc:
    '\u652f\u6301 JPG\u3001PNG\u3001WEBP\uff0c\u5efa\u8bae 2000px \u4ee5\u4e0a\uff0c\u53ef\u8fde\u7eed\u8ffd\u52a0\u591a\u5f20\u53c2\u8003\u56fe\u3002',
  materialLibraryOption: '\u6216\u4ece\u5546\u54c1\u56fe\u7247\u7d20\u6750\u5e93\u6279\u91cf\u9009\u62e9\u672a\u7ed1\u5b9a\u5546\u54c1\u7684\u56fe\u7247',
  materialLibrarySelect: '\u4ece\u7d20\u6750\u5e93\u9009\u56fe',
  materialLibraryCollapse: '\u6536\u8d77\u7d20\u6750\u9009\u56fe',
  materialLibraryEmpty: '\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7684\u672a\u7ed1\u5b9a\u5546\u54c1\u7d20\u6750\u56fe\u7247\u3002',
  materialLibrarySelected: '\u5df2\u9009',
  materialLibraryAddSelected: '\u52a0\u5165\u53c2\u8003\u56fe',
  materialLibrarySelectAll: '\u5168\u9009',
  materialLibraryClear: '\u6e05\u7a7a',
  referenceQueuedSuffix:
    '\u5f20\u56fe\u7247\u5f85\u521b\u5efa\u4efb\u52a1\uff0c\u7ee7\u7eed\u70b9\u51fb\u53ef\u8ffd\u52a0\u66f4\u591a\u53c2\u8003\u56fe\u3002',
  pendingTasks: '\u5f85\u521b\u5efa\u4efb\u52a1',
  referenceTaskList: '\u53c2\u8003\u56fe\u4efb\u52a1\u5217\u8868',
  missingImage: '\u56fe\u7247\u5df2\u4e0d\u5b58\u5728',
  product: '\u5546\u54c1',
  delete: '\u5220\u9664',
  createTaskPrefix: '\u521b\u5efa\u52a8\u6001\u7167\u7247\u4efb\u52a1',
  referenceSafe:
    '\u7cfb\u7edf\u4f1a\u81ea\u52a8\u83b7\u53d6\u5546\u54c1\u53c2\u8003\u6570\u636e\uff0c\u751f\u6210\u66ff\u6362\u56fe\u540e\u7ee7\u7eed\u81ea\u52a8\u751f\u6210\u89c6\u9891\u4e0e\u52a8\u6001\u7167\u7247\u7d20\u6750\u3002',
  rulesTitle: '\u6267\u884c\u89c4\u5219',
  rulesVersion: 'V1 \u9ed8\u8ba4',
  ruleIdentity: '\u4fdd\u6301\u76f8\u540c\u7684\u4eba\u7269\u8eab\u4efd\u3001\u59ff\u6001\u3001\u6784\u56fe\u3001\u5149\u7ebf\u548c\u573a\u666f\u5e03\u5c40\u3002',
  ruleReplace: '\u4ec5\u4f7f\u7528\u6240\u9009\u5546\u54c1\u5feb\u7167\u66ff\u6362\u5546\u54c1\u672c\u8eab\u3002',
  ruleMotion:
    '\u5148\u8c03\u7528 AI \u89c6\u9891\u6a21\u578b\u751f\u6210\u5bf9\u5e94\u89c6\u9891\u7247\u6bb5\uff0c\u518d\u81ea\u52a8\u5199\u51fa\u52a8\u6001\u7167\u7247\u8d44\u6e90\u3002',
  rulePackage: '\u5bfc\u51fa\u5185\u5bb9\u4f1a\u6574\u7406\u4e3a\u56fe\u7247\u3001\u89c6\u9891\u548c\u6e05\u5355\u6587\u4ef6\uff0c\u6253\u5305\u8f93\u51fa\u5230\u53ef\u91cd\u590d\u8f93\u51fa\u76ee\u5f55\u4e2d\u3002',
  outputTitle: '\u8f93\u51fa\u8bf4\u660e',
  outputDesc:
    '\u53c2\u8003\u56fe\u4efb\u52a1\u4f1a\u81ea\u52a8\u751f\u6210\u66ff\u6362\u56fe\u3001\u52a8\u6001\u9884\u89c8\u89c6\u9891\u4e0e\u52a8\u6001\u7167\u7247\u7ed3\u679c\uff0c\u5b8c\u6210\u540e\u53ef\u76f4\u63a5\u5728\u5e93\u91cc\u7edf\u4e00\u5bfc\u51fa\u3002',
  cloneProject: '\u53c2\u8003\u9879\u76ee',
  cloneReadonly: '\u53ea\u8bfb\u7d20\u6750\u5bfc\u5165',
  cloneCreateSelected: '+ \u4ece\u9009\u4e2d\u955c\u5934\u521b\u5efa',
  previewStats: '\u9884\u89c8\u4e0e\u7edf\u8ba1',
  summary: '\u9879\u76ee\u6458\u8981',
  eligibleShots: '\u53ef\u7528\u955c\u5934',
  selectedShots: '\u5df2\u9009\u62e9',
  settingsTitle: '\u751f\u6210\u8bbe\u7f6e',
  standardPackage: 'Apple \u52a8\u6001\u7167\u7247\u6807\u51c6\u5305',
  recommended: '\u63a8\u8350',
  standardPackageDesc:
    '\u751f\u6210\u7b26\u5408 Apple \u52a8\u6001\u7167\u7247\u6807\u51c6\u7684 JPG\u3001MOV \u4e0e\u6e05\u5355\u6253\u5305\u6587\u4ef6\uff0c\u53ef\u76f4\u63a5\u5728 iOS \u8bbe\u5907\u4e2d\u9884\u89c8\u4e0e\u4f7f\u7528\u3002',
  customFormat: '\u81ea\u5b9a\u4e49\u683c\u5f0f',
  customFormatDesc:
    '\u81ea\u5b9a\u4e49\u8f93\u51fa\u5206\u8fa8\u7387\u3001\u5e27\u7387\u548c\u7f16\u7801\u8bbe\u7f6e\uff0c\u9002\u7528\u4e8e\u9ad8\u7ea7\u7528\u6237\u7684\u4e2a\u6027\u5316\u9700\u6c42\u3002',
  resolution: '\u5206\u8fa8\u7387',
  frameRate: '\u5e27\u7387',
  quality: '\u8d28\u91cf',
  highRecommended: '\u9ad8 (\u63a8\u8350)',
  cloneRuleReuse:
    '\u4f18\u5148\u590d\u7528\u590d\u523b\u4efb\u52a1\u91cc\u7684\u7ed3\u6784\u548c\u955c\u5934\u4fe1\u606f\uff0c\u81ea\u52a8\u751f\u6210\u52a8\u6001\u89c6\u9891\u7d20\u6750\u3002',
  cloneRuleAutoLive:
    '\u751f\u6210\u89c6\u9891\u540e\u81ea\u52a8\u7ee7\u7eed\u5199\u51fa\u52a8\u6001\u7167\u7247\u8d44\u6e90\uff0c\u5b8c\u6210\u540e\u8fdb\u5165\u5e93\u4e0e\u5bfc\u51fa\u3002',
  createNow: '\u7acb\u5373\u751f\u6210\u52a8\u6001\u7167\u7247',
  cloneSafe:
    '\u590d\u523b\u955c\u5934\u4efb\u52a1\u4f1a\u81ea\u52a8\u8bfb\u53d6\u5df2\u6709\u5206\u955c\u548c\u89c6\u9891\u6570\u636e\uff0c\u5b8c\u6210\u540e\u76f4\u63a5\u8fdb\u5165\u52a8\u56fe\u8d44\u6e90\u8f93\u51fa\u94fe\u8def\u3002',
  libraryTitle: '\u5e93\u4e0e\u5bfc\u51fa',
  itemUnit: '\u9879\u76ee',
  filter: '\u7b5b\u9009',
  exportSelectedPrefix: '\u5bfc\u51fa\u9009\u4e2d\u9879',
  packagingMetadata: '\u6253\u5305\u5143\u6570\u636e',
  preview: '\u9884\u89c8',
  metadata: '\u5143\u6570\u636e',
  reveal: '\u6253\u5f00\u76ee\u5f55',
  regenerate: '\u91cd\u65b0\u751f\u6210',
  tipTitle: '\u5c0f\u8d34\u58eb',
  tipDesc:
    '\u53c2\u8003\u56fe\u53ef\u4ee5\u8fde\u7eed\u8ffd\u52a0\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u4e3a\u6bcf\u5f20\u56fe\u521b\u5efa\u4efb\u52a1\uff0c\u5e76\u5728\u89c6\u9891\u751f\u6210\u5b8c\u6210\u540e\u7ee7\u7eed\u81ea\u52a8\u4ea7\u51fa\u52a8\u56fe\u8d44\u6e90\u3002',
  guide: '\u67e5\u770b\u4f7f\u7528\u6307\u5357',
  referenceCreatedPrefix: '\u5df2\u521b\u5efa',
  referenceCreatedSuffix: '\u4e2a\u53c2\u8003\u56fe\u4efb\u52a1\u3002',
  runtimeLogTitlePrefix: '\u8fd0\u884c\u65e5\u5fd7',
} as const

const loading = ref(false)
const creatingReference = ref(false)
const creatingCloneShots = ref(false)
const exporting = ref(false)
const notice = ref('')
const errorText = ref('')
const activeTab = ref<'reference' | 'clone' | 'library'>('reference')
const items = ref<LivePhotoItem[]>([])
const libraryPage = ref(1)
const libraryPageSize = ref(24)
const libraryTotal = ref(0)
const libraryTotalPages = ref(1)
const products = ref<Product[]>([])
const productImageMaterials = ref<ProductImageMaterialOption[]>([])
const cloneProjects = ref<CloneProjectSummary[]>([])
const libraryFilter = ref<'all' | 'failed' | 'running' | 'paused'>('all')
const selectedProductId = ref('')
const referenceImagePaths = ref<string[]>([])
const referenceMissingPaths = ref<string[]>([])
const materialPickerOpen = ref(false)
const selectedMaterialImageIds = ref<string[]>([])
const materialPickerPage = ref(1)
const materialPickerPageSize = ref(12)
const selectedCloneProjectId = ref('')
const cloneProjectDetail = ref<CloneProjectDetail | null>(null)
const selectedShotIds = ref<string[]>([])
const selectedLibraryIds = ref<string[]>([])
const runtimeDialogOpen = ref(false)
const runtimeLogs = ref<Array<{ id: string; level: 'info' | 'success' | 'error'; message: string; time: number }>>([])
const runtimeDialogTitle = ref('运行日志')
const detailDialogOpen = ref(false)
const detailDialogItem = ref<LivePhotoItem | null>(null)
const livePhotoSettingsBusy = ref(false)
const livePhotoSettings = ref<LivePhotoSettings>({
  referenceMotionTemplate: 'push_in',
  cloneMotionTemplate: 'ambient_sway',
  outputResolution: '2160x2880',
  frameRate: '30',
  quality: 'high',
  updatedAt: 0,
})

const resolutionOptions = [
  { value: '1080x1440', label: '1080 x 1440', note: '轻量导出，适合快速预览与批量出图' },
  { value: '2160x2880', label: '2160 x 2880', note: '默认推荐，质量与体积更均衡' },
  { value: '3024x4032', label: '3024 x 4032', note: '最高规格，适合最终成片与精细展示' },
] as const

const frameRateOptions = [
  { value: '24', label: '24 fps', note: '更电影感，文件更轻' },
  { value: '30', label: '30 fps', note: '更流畅，适合作为默认导出' },
] as const

const qualityOptions = [
  { value: 'medium', label: '标准质量', note: '压缩更高，导出更快' },
  { value: 'high', label: '高质量', note: '保留更多细节，适合作为默认导出' },
] as const

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
  productImageMaterials.value.filter((item) => !String(item.boundProductId || '').trim() && String(item.localImagePath || '').trim()),
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

const cloneShotRows = computed(() => {
  const project = cloneProjectDetail.value
  if (!project) return []
  const shots = Array.isArray(project.blueprint?.shots) ? project.blueprint.shots : []
  const frames = Array.isArray(project.storyboardFrames) ? project.storyboardFrames : []
  const videos = Array.isArray(project.shotVideoOutputs) ? project.shotVideoOutputs : []
  return shots
    .map((shot) => {
      const frame = frames.find((item) => item.shotId === shot.id)
      const video = videos.find((item) => item.shotId === shot.id)
      const imagePath = String(frame?.imagePath || '').trim()
      const videoPath = String(video?.videoPath || video?.localPath || '').trim()
      return {
        shotId: shot.id,
        label: [String(shot.scriptRole || '').trim(), String(shot.scriptText || '').trim()].filter(Boolean).join(' - ') || shot.id,
        imagePath,
        videoPath,
        eligible: Boolean(imagePath || videoPath),
      }
    })
    .filter((item) => item.eligible)
})

const todayCreatedCount = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return items.value.filter((item) => Number(item.updatedAt || 0) >= start.getTime()).length
})

const filteredLibraryItems = computed(() => items.value)

const selectedCloneRows = computed(() => cloneShotRows.value.filter((item) => selectedShotIds.value.includes(item.shotId)))
const featuredCloneRow = computed(() => selectedCloneRows.value[0] || cloneShotRows.value[0] || null)
const livePhotoSteps = ['queued', 'image_generation', 'video_generation', 'live_photo_packaging', 'completed'] as const
const livePhotoRetryLimitFallback = 2
const selectedLibraryItems = computed(() => filteredLibraryItems.value.filter((item) => selectedLibraryIds.value.includes(item.id)))
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

const cloneProjectUpdatedText = computed(() => {
  const hit = cloneProjects.value.find((item) => item.id === selectedCloneProjectId.value)
  if (!hit?.updatedAt) return '--'
  const date = new Date(hit.updatedAt)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
})

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
  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
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
  if (step === 'image_generation') return '图片生成'
  if (step === 'video_generation') return '视频生成'
  if (step === 'live_photo_packaging') return '动态照片打包'
  if (step === 'completed') return '已完成'
  return '排队中'
}

function workflowStepIndex(step?: LivePhotoItem['workflow']['currentStep']) {
  const index = livePhotoSteps.findIndex((item) => item === step)
  return index >= 0 ? index : 0
}

function liveTaskStatusLabel(item: LivePhotoItem) {
  const autoStatus = String(item.autoFlowStatus?.status || '').trim()
  if (item.packagingStatus === 'completed' || autoStatus === 'done') return '已完成'
  if (autoStatus === 'failed_terminal') return '失败'
  if (autoStatus === 'failed_retryable') return '可重试失败'
  if (item.packagingStatus === 'failed') return '失败'
  if (item.packagingStatus === 'processing' || autoStatus === 'running') return '运行中'
  return '排队中'
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

function liveTaskStepTone(step?: LivePhotoItem['workflow']['currentStep']) {
  if (step === 'image_generation') return 'tone-image'
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
  return `重试 ${retryCount} / ${retryLimit || livePhotoRetryLimitFallback}`
}

function liveTaskErrorSummary(item: LivePhotoItem) {
  const text = String(item.error || item.autoFlowStatus?.lastError || '').trim()
  if (!text) return ''
  if (text.includes('[remote_pending]')) {
    const taskId = extractLivePhotoTaskId(item)
    return taskId ? `已提交远端，等待结果查询。taskId=${taskId}` : '已提交远端，等待结果查询。'
  }
  return sanitizeVisibleText(text, '任务错误信息不可读')
}

function liveTaskAutoSummary(item: LivePhotoItem) {
  if (item.autoFlowStatus?.paused) return '已暂停'
  if (String(item.autoFlowStatus?.lastError || item.error || '').includes('[remote_pending]')) return '等待远程结果'
  if (item.autoFlowStatus?.status === 'failed_retryable') return '可重试失败'
  if (item.autoFlowStatus?.status === 'failed_terminal') return '已达到重试上限'
  if (item.autoFlowStatus?.status === 'running') return '自动流程运行中'
  if (item.autoFlowStatus?.status === 'done') return '自动流程完成'
  if (item.autoFlowStatus?.status === 'idle') return '等待执行'
  if (item.packagingStatus === 'processing') return '处理中'
  if (item.packagingStatus === 'completed') return '已完成'
  if (item.packagingStatus === 'failed') return '失败'
  return '待处理'
}

function isWaitingRemoteResult(item: LivePhotoItem) {
  return String(item.autoFlowStatus?.lastError || item.error || '').includes('[remote_pending]')
}

function liveTaskWaitingHint(item: LivePhotoItem) {
  if (isWaitingRemoteResult(item)) {
    return `已等待 ${formatElapsed(item.autoFlowStatus?.lastStartedAt || item.workflow?.updatedAt || item.updatedAt)}`
  }
  if (item.autoFlowStatus?.status === 'running') {
    return `本轮运行 ${formatElapsed(item.autoFlowStatus?.lastStartedAt || item.workflow?.updatedAt || item.updatedAt)}`
  }
  return ''
}

function workflowStepStatusText(item: LivePhotoItem, step: (typeof livePhotoSteps)[number]) {
  const status = String(item.workflow?.stepStatus?.[step]?.status || 'idle').trim()
  const errorText = String(item.workflow?.stepStatus?.[step]?.error || '').trim()
  if (status === 'failed' && errorText.includes('[remote_pending]')) return '等待远程结果'
  if (status === 'done') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'running') return '运行中'
  return '等待中'
}

function workflowStepErrorText(item: LivePhotoItem, step: (typeof livePhotoSteps)[number]) {
  const text = String(item.workflow?.stepStatus?.[step]?.error || '').trim()
  if (!text) return ''
  if (text.includes('[remote_pending]')) {
    const taskId = extractLivePhotoTaskId(item)
    return taskId ? `已提交远端，等待结果查询。taskId=${taskId}` : '已提交远端，等待结果查询。'
  }
  return sanitizeVisibleText(text, '阶段错误信息不可读')
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
          stage: '图片生成',
          provider: String(item.imageTaskProvider || '').trim() || '--',
          model: String(item.imageTaskModel || '').trim() || '--',
          taskId: String(item.imageTaskId || '').trim(),
        }
      : null,
    String(item.videoTaskId || '').trim()
      ? {
          stage: '视频生成',
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
    return taskId ? `已提交远端，等待结果查询。taskId=${taskId}` : '已提交远端，等待结果查询。'
  }
  if (item.autoFlowStatus?.status === 'running') {
    return taskId ? `自动流程运行中，当前远端任务 taskId=${taskId}` : '自动流程运行中'
  }
  if (item.packagingStatus === 'completed') {
    return taskId ? `任务已完成，最近远端任务 taskId=${taskId}` : '任务已完成'
  }
  if (item.packagingStatus === 'failed') {
    return taskId ? `当前任务失败，但保留了远端 taskId=${taskId}` : '当前任务失败'
  }
  return taskId ? `当前已记录远端 taskId=${taskId}` : '当前还没有可展示的远端任务号'
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
    return item.sourceProjectTitle ? `来源项目：${item.sourceProjectTitle}` : '来源项目：复刻镜头'
  }
  return item.productSnapshot?.name ? `绑定商品：${item.productSnapshot.name}` : '绑定商品：参考图替换'
}

function hasExportArtifacts(item: LivePhotoItem) {
  return Boolean(item.exportBundlePath || item.packagingMetadataBridgePath || item.packagingAssetIdentifier)
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
  if (/[�]/.test(text)) return fallback
  if (/[鍙鎏鏃鐢绋璇褰鍥瀹诲竷镞冨欧锟]/.test(text)) return fallback
  return text
}

function openTaskDetail(item: LivePhotoItem) {
  void (async () => {
    detailDialogItem.value = await loadLivePhotoItemDetail(item)
    detailDialogOpen.value = true
  })()
}

function closeTaskDetail() {
  detailDialogOpen.value = false
  detailDialogItem.value = null
}

function referenceMotionTemplateLabel(value: LivePhotoSettings['referenceMotionTemplate']) {
  if (value === 'push_out') return '轻微移动'
  if (value === 'ambient_sway') return '轻微摆动'
  return '轻微移动'
}

function cloneMotionTemplateLabel(value: LivePhotoSettings['cloneMotionTemplate']) {
  if (value === 'push_in') return '轻微移动'
  if (value === 'push_out') return '轻微移动'
  return '轻微摆动'
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

async function saveLivePhotoSettings() {
  livePhotoSettingsBusy.value = true
  errorText.value = ''
  try {
    const next = await window.api.livePhoto.saveSettings(livePhotoSettings.value)
    livePhotoSettings.value = {
      ...livePhotoSettings.value,
      ...next,
    }
    notice.value = '动态照片设置已保存到数据库。'
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    livePhotoSettingsBusy.value = false
  }
}

function openRuntimeLogs(item: LivePhotoItem) {
  void (async () => {
    const detailedItem = await loadLivePhotoItemDetail(item)
    const targetLabel = sanitizeVisibleText(String(detailedItem.sourceShotLabel || detailedItem.productSnapshot?.name || detailedItem.id || ''), detailedItem.id)
    runtimeDialogTitle.value = `${uiText.runtimeLogTitlePrefix} · ${targetLabel}`
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
  items.value = Array.from(map.values()).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
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

async function refreshLibraryItems() {
  const nowTs = Date.now()
  if (nowTs - lastLibraryRefreshAt < LIBRARY_REFRESH_DEDUP_WINDOW_MS) return
  try {
    lastLibraryRefreshAt = nowTs
    const nextPage = await loadWithTimeout(
      window.api.livePhoto.listSummaries({
        page: libraryPage.value,
        pageSize: libraryPageSize.value,
        filter: libraryFilter.value,
      }) as Promise<{ items: LivePhotoItem[]; filter: 'all' | 'failed' | 'running' | 'paused'; page: number; pageSize: number; total: number; totalPages: number }>,
      4000,
    )
    const normalizedItems = Array.isArray(nextPage?.items) ? nextPage.items : []
    items.value = normalizedItems
    libraryPage.value = Math.max(1, Number(nextPage?.page || 1) || 1)
    libraryPageSize.value = Math.max(1, Number(nextPage?.pageSize || 24) || 24)
    libraryTotal.value = Math.max(0, Number(nextPage?.total || 0) || 0)
    libraryTotalPages.value = Math.max(1, Number(nextPage?.totalPages || 1) || 1)
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
  void refreshLibraryItems()
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
      const nextProjects = await loadWithTimeout(window.api.clone.listProjectSummaries() as Promise<CloneProjectSummary[]>, 4000)
      cloneProjects.value = Array.isArray(nextProjects) ? nextProjects : []
    } catch {
      // Keep previous project summaries when the companion query is slow.
    }
    try {
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
    } catch {
      // Keep previous material options when the companion query is slow.
    }
    if (!selectedProductId.value && products.value[0]) selectedProductId.value = products.value[0].id
    if (!selectedCloneProjectId.value && cloneProjects.value[0]) selectedCloneProjectId.value = cloneProjects.value[0].id
  } finally {
    loading.value = false
  }
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
    notice.value = `已跳过 ${missingPaths.length} 张不存在的参考图。`
  }
}

function toggleMaterialPicker() {
  materialPickerOpen.value = !materialPickerOpen.value
  if (materialPickerOpen.value) materialPickerPage.value = 1
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

async function appendMaterialImagesAsReferences() {
  const selectedPaths = selectedMaterialOptions.value.map((item) => String(item.localImagePath || '').trim()).filter(Boolean)
  if (!selectedPaths.length) return
  const mergedPaths = dedupePaths([...referenceImagePaths.value, ...selectedPaths])
  const { existingPaths, missingPaths } = await splitExistingReferencePaths(mergedPaths)
  referenceImagePaths.value = mergedPaths
  referenceMissingPaths.value = missingPaths
  selectedMaterialImageIds.value = []
  materialPickerOpen.value = false
  if (!existingPaths.length && mergedPaths.length) {
    notice.value = ''
  } else if (missingPaths.length) {
    notice.value = `已跳过 ${missingPaths.length} 张不存在的参考图。`
  }
}

function removeReferenceImage(path: string) {
  referenceImagePaths.value = referenceImagePaths.value.filter((item) => item !== path)
  referenceMissingPaths.value = referenceMissingPaths.value.filter((item) => item !== path)
}

async function createReferenceItem() {
  if (!referenceImagePaths.value.length || !selectedProductId.value) return
  if (!selectedProductReadyForLivePhoto.value) {
    errorText.value = '请先在商品详情中设置 Live Photo 主图，再创建任务。'
    notice.value = ''
    return
  }
  creatingReference.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const { existingPaths, missingPaths } = await splitExistingReferencePaths(referenceImagePaths.value)
    if (!existingPaths.length) {
      throw new Error('所选参考图已不存在，请重新选择。')
    }
    if (missingPaths.length) {
      notice.value = `已跳过 ${missingPaths.length} 张不存在的参考图。`
      referenceImagePaths.value = existingPaths
      referenceMissingPaths.value = missingPaths
    }
    activeTab.value = 'library'
    await nextTick()
    const referencePathsSnapshot = [...existingPaths]
    const selectedProductIdSnapshot = selectedProductId.value
    notice.value =
      existingPaths.length > 1
        ? `${uiText.referenceCreatedPrefix} ${existingPaths.length} ${uiText.referenceCreatedSuffix}`
        : t('livePhoto.messages.referenceCreated')
    referenceImagePaths.value = []
    referenceMissingPaths.value = []
    creatingReference.value = false
    void (async () => {
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
        void refreshLibraryItems()
      })
    return
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
  creatingReference.value = false
}

async function loadCloneProjectDetail() {
  const cloneProjectId = String(selectedCloneProjectId.value || '').trim()
  if (!cloneProjectId) {
    cloneProjectDetail.value = null
    selectedShotIds.value = []
    return
  }
  cloneProjectDetail.value = (await window.api.clone.getProject({ cloneProjectId })) as CloneProjectDetail
  selectedShotIds.value = cloneShotRows.value.slice(0, 1).map((item) => item.shotId)
}

async function createCloneShotItems() {
  if (!selectedCloneProjectId.value || !selectedShotIds.value.length) return
  creatingCloneShots.value = true
  errorText.value = ''
  notice.value = ''
  try {
    activeTab.value = 'library'
    await nextTick()
    const cloneProjectIdSnapshot = selectedCloneProjectId.value
    const shotIdsSnapshot = [...selectedShotIds.value]
    notice.value = t('livePhoto.messages.cloneCreated')
    await loadCloneProjectDetail()
    creatingCloneShots.value = false
    void (async () => {
      const created = await window.api.livePhoto.enqueueClone({
        cloneProjectId: cloneProjectIdSnapshot,
        shotIds: shotIdsSnapshot,
        motionTemplate: livePhotoSettings.value.cloneMotionTemplate,
      })
      const createdItems = (Array.isArray(created) ? created : []).filter(Boolean) as LivePhotoItem[]
      mergeLivePhotoItems(createdItems)
      await window.api.livePhoto.startClone({
        ids: createdItems.map((item) => item.id),
        motionTemplate: livePhotoSettings.value.cloneMotionTemplate,
      })
    })()
      .catch((error: any) => {
        errorText.value = error?.message ?? String(error)
      })
      .finally(() => {
        void refreshLibraryItems()
      })
    return
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
  creatingCloneShots.value = false
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
      notice.value = '已取消导出。'
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
      notice.value = reasonText ? `没有可导出的 Live Photo。${reasonText}` : '没有可导出的 Live Photo。'
    } else {
      notice.value = t('livePhoto.messages.exportedCount', { count: exportedCount })
      if (skipped.length) {
        notice.value += `，跳过 ${skipped.length} 项`
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

async function retryItem(item: LivePhotoItem) {
  if (!item?.id) return
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.livePhoto.retry({
      id: item.id,
      motionTemplate: item.sourceType === 'clone_shot' ? livePhotoSettings.value.cloneMotionTemplate : livePhotoSettings.value.referenceMotionTemplate,
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
          motionTemplate: item.sourceType === 'clone_shot' ? livePhotoSettings.value.cloneMotionTemplate : livePhotoSettings.value.referenceMotionTemplate,
        }),
      ),
    )
    notice.value = `已重试 ${targets.length} 个失败任务。`
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
    notice.value = `已暂停 ${targets.length} 个运行中的任务。`
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
          motionTemplate: item.sourceType === 'clone_shot' ? livePhotoSettings.value.cloneMotionTemplate : livePhotoSettings.value.referenceMotionTemplate,
        }),
      ),
    )
    notice.value = `已恢复 ${targets.length} 个暂停任务。`
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
      motionTemplate: item.sourceType === 'clone_shot' ? livePhotoSettings.value.cloneMotionTemplate : livePhotoSettings.value.referenceMotionTemplate,
    })
    await refreshLibraryItems()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

function toggleLibrarySelection(id: string) {
  if (selectedLibraryIds.value.includes(id)) selectedLibraryIds.value = selectedLibraryIds.value.filter((item) => item !== id)
  else selectedLibraryIds.value = [...selectedLibraryIds.value, id]
}

function toggleShot(shotId: string) {
  if (selectedShotIds.value.includes(shotId)) selectedShotIds.value = selectedShotIds.value.filter((item) => item !== shotId)
  else selectedShotIds.value = [...selectedShotIds.value, shotId]
}

onMounted(async () => {
  await loadAll()
  await loadLivePhotoSettings()
  await loadCloneProjectDetail()
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
  if (tab === 'clone') {
    await loadCloneProjectDetail()
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
  <div class="live-photo-page" data-testid="live-photo-page">
    <section class="hero-shell">
      <div class="hero-toolbar">
        <button class="ghost-button back-button" data-testid="live-photo-back" type="button" @click="router.push('/plugins?tab=installed&plugin=live-photo-generator')">
          <ChevronLeft class="h-4 w-4" />
          {{ t('livePhoto.hero.back') }}
        </button>
        <button class="ghost-button refresh-button" data-testid="live-photo-refresh" type="button" :disabled="loading" @click="loadAll">
          <RefreshCcw class="h-4 w-4" />
          {{ t('livePhoto.hero.refresh') }}
        </button>
      </div>

      <section class="hero-card">
        <div class="hero-copy">
          <div class="hero-headline">
            <h1>{{ uiText.heroTitle }}</h1>
            <p class="hero-desc">{{ uiText.heroDesc }}</p>
          </div>
        </div>
        <div class="hero-stats">
          <div class="stat-card">
            <span>{{ uiText.completed }}</span>
            <strong>{{ todayCreatedCount }}</strong>
          </div>
        </div>
      </section>
    </section>

    <div v-if="notice" class="banner banner-success" data-testid="live-photo-notice">{{ notice }}</div>
    <div v-if="errorText" class="banner banner-error" data-testid="live-photo-error">{{ errorText }}</div>

    <section class="tab-bar">
      <button class="tab-button" data-testid="live-photo-tab-reference" :class="{ active: activeTab === 'reference' }" type="button" @click="activeTab = 'reference'">{{ uiText.tabReference }}</button>
      <button class="tab-button" data-testid="live-photo-tab-clone" :class="{ active: activeTab === 'clone' }" type="button" @click="activeTab = 'clone'">{{ uiText.tabClone }}</button>
      <button class="tab-button" data-testid="live-photo-tab-library" :class="{ active: activeTab === 'library' }" type="button" @click="activeTab = 'library'">{{ uiText.tabLibrary }}</button>
    </section>

    <section v-if="activeTab === 'reference'" class="workspace-grid">
      <article class="panel-card reference-card">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <div class="step-badge">1</div>
            <strong>{{ uiText.referenceTitle }}</strong>
          </div>
          <span class="panel-head-note">{{ uiText.referenceNote }}</span>
        </div>

        <div class="field-stack">
          <label class="field">
            <span>{{ uiText.referenceImage }}</span>
            <button class="upload-surface" data-testid="live-photo-pick-reference" type="button" @click="pickReferenceImage">
              <template v-if="primaryReferenceImage">
                <img class="upload-preview" :src="previewSrc(primaryReferenceImage)" alt="reference preview" />
                <div class="upload-copy">
                  <strong>{{ fileNameOf(primaryReferenceImage) }}</strong>
                  <small>{{ referenceImagePaths.length }} {{ uiText.referenceQueuedSuffix }}</small>
                </div>
              </template>
              <template v-else>
                <div class="upload-icon">
                  <ImagePlus class="h-8 w-8" />
                </div>
                <div class="upload-copy">
                  <strong>{{ uiText.referenceUploadTitle }}</strong>
                  <small>{{ uiText.referenceUploadDesc }}</small>
                </div>
              </template>
            </button>
            <input :value="primaryReferenceImage" data-testid="live-photo-reference-path" class="sr-only" readonly />
          </label>

          <div v-if="unboundMaterialOptions.length" class="field">
            <span>{{ uiText.materialLibraryOption }}</span>
            <div class="reference-material-bar">
              <button class="ghost-button small" type="button" @click="toggleMaterialPicker">
                <LayoutGrid class="h-4 w-4" />
                {{ materialPickerOpen ? uiText.materialLibraryCollapse : uiText.materialLibrarySelect }}
              </button>
              <small>{{ unboundMaterialOptions.length }} {{ uiText.itemUnit }}</small>
            </div>

            <div v-if="materialPickerOpen" class="reference-material-picker">
              <div class="reference-material-picker__hero">
                <div class="reference-material-picker__hero-copy">
                  <strong>{{ uiText.materialLibrarySelect }}</strong>
                  <small>共 {{ unboundMaterialOptions.length }} 张，当前页已选 {{ selectedPagedMaterialCount }} 张</small>
                </div>
                <button class="primary-button small" type="button" :disabled="!selectedMaterialImageIds.length" @click="appendMaterialImagesAsReferences">
                  <ImagePlus class="h-4 w-4" />
                  {{ uiText.materialLibraryAddSelected }} ({{ selectedMaterialImageIds.length }})
                </button>
              </div>

              <div class="reference-material-picker__toolbar">
                <div class="reference-material-picker__actions">
                  <button class="ghost-button small" type="button" @click="selectAllMaterialImages">{{ uiText.materialLibrarySelectAll }}</button>
                  <button class="ghost-button small" type="button" @click="clearMaterialImageSelection">{{ uiText.materialLibraryClear }}</button>
                </div>
                <div class="reference-material-picker__pager">
                  <button class="ghost-button small" type="button" :disabled="materialPickerPage <= 1" @click="materialPickerPage -= 1">上一页</button>
                  <span>{{ materialPickerPage }} / {{ materialPickerTotalPages }}</span>
                  <button class="ghost-button small" type="button" :disabled="materialPickerPage >= materialPickerTotalPages" @click="materialPickerPage += 1">下一页</button>
                  <select v-model.number="materialPickerPageSize" class="field-select-mini">
                    <option :value="8">8 / 页</option>
                    <option :value="12">12 / 页</option>
                    <option :value="16">16 / 页</option>
                  </select>
                </div>
              </div>

              <div class="reference-material-grid">
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
                  <img :src="material.qiniuUrl" alt="material option" />
                  <div class="reference-material-card__copy">
                    <strong>{{ fileNameOf(material.localImagePath) }}</strong>
                    <small>{{ material.usageStatus === 'used' ? '已使用' : '未使用' }}</small>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div v-if="referenceTaskRows.length" class="field">
            <span>{{ uiText.pendingTasks }}</span>
            <div class="clone-shot-list">
              <div v-for="row in referenceTaskRows" :key="row.id" class="clone-shot-row active reference-task-row" :class="{ missing: row.missing }">
                <div class="clone-shot-copy">
                  <strong>{{ row.fileName }}</strong>
                  <small>{{ row.path }}</small>
                  <span v-if="row.missing" class="missing-pill">{{ uiText.missingImage }}</span>
                </div>
                <button class="ghost-button small danger" type="button" @click="removeReferenceImage(row.path)">
                  <Trash2 class="h-4 w-4" />
                  {{ uiText.delete }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="referenceCreatedItems.length" class="field">
            <span>{{ uiText.referenceTaskList }}</span>
            <div class="reference-status-list">
              <article v-for="item in referenceCreatedItems" :key="item.id" class="reference-status-card">
                <div class="reference-status-top">
                  <strong>{{ referenceTaskTitle(item) }}</strong>
                  <span class="status-pill" :class="`status-${item.packagingStatus}`">{{ itemStatusLabel(item.packagingStatus) }}</span>
                </div>
                <div class="reference-status-meta">
                  <span>{{ item.productSnapshot?.name || '--' }}</span>
                  <span>{{ formatTime(item.updatedAt) }}</span>
                </div>
                <small>{{ liveTaskMetaSummary(item) }}</small>
              </article>
            </div>
          </div>

          <label class="field">
            <span>{{ uiText.product }}</span>
            <div class="product-picker">
              <div v-if="selectedProduct?.coverImagePath" class="product-thumb">
                <img :src="previewSrc(selectedProduct.coverImagePath)" alt="product cover" />
              </div>
              <div v-else class="product-thumb product-thumb-fallback">
                <Package class="h-4 w-4" />
              </div>
              <select v-model="selectedProductId" data-testid="live-photo-product-select">
                <option v-for="product in products" :key="product.id" :value="product.id">{{ product.name }}</option>
              </select>
              <ChevronDown class="picker-arrow h-4 w-4" />
            </div>
          </label>

          <div class="field">
            <span>Live Photo 主图</span>
            <div v-if="selectedProductLivePhotoRef" class="live-photo-master-ref">
              <button class="live-photo-master-ref__preview" type="button" @click="openPath(selectedProductLivePhotoRef)">
                <img :src="previewSrc(selectedProductLivePhotoRef)" alt="live photo master reference" />
              </button>
              <div class="live-photo-master-ref__copy">
                <strong>{{ fileNameOf(selectedProductLivePhotoRef) }}</strong>
                <small>{{ selectedProductLivePhotoRef }}</small>
              </div>
            </div>
            <div v-else class="live-photo-master-ref live-photo-master-ref--missing">
              <AlertTriangle class="h-4 w-4" />
              <span>当前商品还没有设置 Live Photo 主图，不能创建参考图替换任务。</span>
            </div>
          </div>

          <button class="primary-button create-button" data-testid="live-photo-create-reference" type="button" :disabled="creatingReference || !referenceImagePaths.length || !selectedProductId || !selectedProductReadyForLivePhoto" @click="createReferenceItem">
            <Sparkles class="h-4 w-4" />
            {{ creatingReference ? t('livePhoto.actions.creating') : `${uiText.createTaskPrefix} (${referenceImagePaths.length || 0})` }}
          </button>

          <div class="safe-note">
            <ShieldCheck class="h-4 w-4" />
            <span>{{ uiText.referenceSafe }}</span>
          </div>
        </div>
      </article>

      <article class="panel-card rules-card">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <div class="step-badge">2</div>
            <strong>{{ uiText.rulesTitle }}</strong>
          </div>
          <span class="panel-head-note">{{ uiText.rulesVersion }}</span>
        </div>
        <div class="rules-box">
          <div class="rule-row">
            <div class="rule-icon">A</div>
            <p>{{ uiText.ruleIdentity }}</p>
          </div>
          <div class="rule-row">
            <div class="rule-icon">+</div>
            <p>{{ uiText.ruleReplace }}</p>
          </div>
          <div class="rule-row">
            <div class="rule-icon">O</div>
            <p>{{ uiText.ruleMotion }}</p>
          </div>
          <div class="rule-row">
            <div class="rule-icon">*</div>
            <p>{{ uiText.rulePackage }}</p>
          </div>
        </div>
        <div class="output-note">
          <div class="output-note-head">{{ uiText.outputTitle }}</div>
          <p>{{ uiText.outputDesc }}</p>
        </div>
      </article>
    </section>

    <section v-else-if="activeTab === 'clone'" class="clone-layout">
      <div class="clone-top-grid">
        <article class="panel-card clone-project-card">
          <div class="panel-head">
            <div class="panel-title-wrap">
              <div class="step-badge">1</div>
              <strong>{{ uiText.cloneProject }}</strong>
            </div>
            <span class="panel-head-note">{{ uiText.cloneReadonly }}</span>
          </div>
          <div class="field-stack">
            <label class="field">
              <span>{{ t('livePhoto.clone.project') }}</span>
              <div class="project-picker">
                <select v-model="selectedCloneProjectId" data-testid="live-photo-clone-project-select" @change="loadCloneProjectDetail">
                  <option v-for="project in cloneProjects" :key="project.id" :value="project.id">{{ project.title }}</option>
                </select>
                <ChevronDown class="picker-arrow h-4 w-4" />
              </div>
            </label>
            <div class="clone-shot-list">
              <label v-for="row in cloneShotRows" :key="row.shotId" class="clone-shot-row" :class="{ active: selectedShotIds.includes(row.shotId) }" :data-testid="`live-photo-shot-${row.shotId}`">
                <input type="checkbox" :checked="selectedShotIds.includes(row.shotId)" @change="toggleShot(row.shotId)" />
                <div class="clone-shot-copy">
                  <strong>{{ row.label }}</strong>
                  <small>{{ row.videoPath || row.imagePath }}</small>
                </div>
              </label>
            </div>
            <button class="secondary-create-button" data-testid="live-photo-create-clone-top" type="button" :disabled="creatingCloneShots || !selectedShotIds.length" @click="createCloneShotItems">
              {{ uiText.cloneCreateSelected }}
            </button>
          </div>
        </article>

        <article class="panel-card clone-preview-card">
          <div class="panel-head">
            <div class="panel-title-wrap">
              <div class="step-badge">2</div>
              <strong>{{ uiText.previewStats }}</strong>
            </div>
            <div class="clone-summary-head">
              <span class="panel-head-note">{{ uiText.summary }}</span>
              <strong>{{ cloneProjectUpdatedText }}</strong>
            </div>
          </div>
          <div class="clone-preview-main">
            <div class="clone-preview-frame">
              <img v-if="featuredCloneRow?.imagePath" :src="previewSrc(featuredCloneRow.imagePath)" alt="selected shot preview" />
              <div v-else class="preview-fallback clone-fallback">
                <Play class="h-6 w-6" />
              </div>
              <button class="preview-play" type="button" :disabled="!featuredCloneRow?.videoPath" @click="openPath(featuredCloneRow?.videoPath)">
                <Play class="h-4 w-4" />
              </button>
            </div>
            <div class="clone-stat-stack">
              <div class="clone-stat-card">
                <span>{{ uiText.eligibleShots }}</span>
                <strong>{{ cloneShotRows.length }}</strong>
              </div>
              <div class="clone-stat-card">
                <span>{{ uiText.selectedShots }}</span>
                <strong>{{ selectedShotIds.length }}</strong>
              </div>
            </div>
          </div>
          <div class="clone-thumb-section">
            <div class="clone-thumb-head">
              <strong>{{ uiText.eligibleShots }}</strong>
              <div class="clone-thumb-tools">
                <button class="thumb-tool" type="button"><List class="h-4 w-4" /></button>
                <button class="thumb-tool" type="button"><LayoutGrid class="h-4 w-4" /></button>
              </div>
            </div>
            <div class="clone-thumb-grid">
              <button v-for="(row, index) in cloneShotRows" :key="`thumb-${row.shotId}`" class="clone-thumb-card" :class="{ active: selectedShotIds.includes(row.shotId) }" type="button" @click="toggleShot(row.shotId)">
                <img v-if="row.imagePath" :src="previewSrc(row.imagePath)" :alt="row.label" />
                <div v-else class="clone-thumb-fallback">{{ String(index + 1).padStart(2, '0') }}</div>
                <span class="clone-thumb-index">{{ String(index + 1).padStart(2, '0') }}</span>
              </button>
            </div>
          </div>
          <div class="clone-selected-section">
            <strong>{{ uiText.selectedShots }}</strong>
            <div class="clone-selected-grid">
              <article v-for="row in selectedCloneRows" :key="`selected-${row.shotId}`" class="clone-selected-card">
                <img v-if="row.imagePath" :src="previewSrc(row.imagePath)" :alt="row.label" />
                <div class="clone-selected-meta">
                  <span>{{ String(cloneShotRows.findIndex((item) => item.shotId === row.shotId) + 1).padStart(2, '0') }}</span>
                  <small>{{ row.label }}</small>
                </div>
              </article>
            </div>
          </div>
        </article>
      </div>

      <div class="clone-bottom-grid">
        <article class="panel-card clone-settings-card">
          <div class="panel-head">
            <div class="panel-title-wrap">
              <div class="step-badge">3</div>
              <strong>{{ uiText.settingsTitle }}</strong>
            </div>
          </div>
          <div class="settings-grid">
            <div class="format-card format-card-active">
              <div class="format-card-head">
                <div class="format-card-title">
                  <Sparkles class="h-4 w-4" />
                  <strong>{{ uiText.standardPackage }}</strong>
                </div>
                <span class="format-tag">{{ uiText.recommended }}</span>
              </div>
              <p>{{ uiText.standardPackageDesc }}</p>
            </div>
            <div class="format-card">
              <div class="format-card-head">
                <div class="format-card-title">
                  <Settings class="h-4 w-4" />
                  <strong>动作策略</strong>
                </div>
              </div>
              <p>这两项会真实写入数据库，并直接作用于参考图任务、复刻镜头任务、失败重试和恢复执行。</p>
              <div class="field-stack">
                <label class="field">
                  <span>参考图默认动作</span>
                  <select v-model="livePhotoSettings.referenceMotionTemplate">
                    <option value="push_in">{{ referenceMotionTemplateLabel('push_in') }}</option>
                    <option value="push_out">{{ referenceMotionTemplateLabel('push_out') }}</option>
                    <option value="ambient_sway">{{ referenceMotionTemplateLabel('ambient_sway') }}</option>
                  </select>
                </label>
                <label class="field">
                  <span>复刻镜头默认动作</span>
                  <select v-model="livePhotoSettings.cloneMotionTemplate">
                    <option value="ambient_sway">{{ cloneMotionTemplateLabel('ambient_sway') }}</option>
                    <option value="push_in">{{ cloneMotionTemplateLabel('push_in') }}</option>
                    <option value="push_out">{{ cloneMotionTemplateLabel('push_out') }}</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div class="export-grid">
            <label class="metadata-card metadata-card-select">
              <strong>{{ uiText.resolution }}</strong>
              <select v-model="livePhotoSettings.outputResolution">
                <option v-for="option in resolutionOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <small>{{ resolutionOptions.find((item) => item.value === livePhotoSettings.outputResolution)?.note }}</small>
            </label>
            <label class="metadata-card metadata-card-select">
              <strong>{{ uiText.frameRate }}</strong>
              <select v-model="livePhotoSettings.frameRate">
                <option v-for="option in frameRateOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <small>{{ frameRateOptions.find((item) => item.value === livePhotoSettings.frameRate)?.note }}</small>
            </label>
            <label class="metadata-card metadata-card-select">
              <strong>{{ uiText.quality }}</strong>
              <select v-model="livePhotoSettings.quality">
                <option v-for="option in qualityOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <small>{{ qualityOptions.find((item) => item.value === livePhotoSettings.quality)?.note }}</small>
            </label>
          </div>
          <div class="panel-head">
            <span class="panel-head-note">当前导出规格会写入数据库，并在导出阶段真实参与分辨率、帧率和压缩质量处理。</span>
            <button class="ghost-button small" type="button" :disabled="livePhotoSettingsBusy" @click="saveLivePhotoSettings">
              {{ livePhotoSettingsBusy ? '保存中...' : '保存动态照片设置' }}
            </button>
          </div>
        </article>

        <article class="panel-card clone-rule-card">
          <div class="panel-head">
            <strong>{{ uiText.rulesTitle }}</strong>
          </div>
          <div class="rules-compact">
            <div class="compact-row"><span class="compact-dot">1</span><p>{{ uiText.ruleIdentity }}</p></div>
            <div class="compact-row"><span class="compact-dot">2</span><p>{{ uiText.ruleReplace }}</p></div>
            <div class="compact-row"><span class="compact-dot">3</span><p>{{ uiText.cloneRuleReuse }}</p></div>
            <div class="compact-row"><span class="compact-dot">4</span><p>{{ uiText.cloneRuleAutoLive }}</p></div>
          </div>
        </article>
      </div>

      <div class="clone-footer-actions">
        <button class="primary-button clone-generate-button" data-testid="live-photo-create-clone" type="button" :disabled="creatingCloneShots || !selectedShotIds.length" @click="createCloneShotItems">
          <Sparkles class="h-4 w-4" />
          {{ creatingCloneShots ? t('livePhoto.actions.creating') : uiText.createNow }}
        </button>
        <div class="safe-note clone-safe-note">
          <ShieldCheck class="h-4 w-4" />
          <span>{{ uiText.cloneSafe }}</span>
        </div>
      </div>
    </section>

    <section v-else class="library-layout">
      <div class="library-headline">
        <div class="library-title-row">
          <strong>{{ uiText.libraryTitle }}</strong>
          <span class="library-count">{{ libraryTotal }} {{ uiText.itemUnit }}</span>
        </div>
        <div class="library-overview">
          <div class="library-overview__card">
            <span>运行中</span>
            <strong>{{ runningLibraryItems.length }}</strong>
          </div>
          <div class="library-overview__card">
            <span>失败</span>
            <strong>{{ failedLibraryItems.length }}</strong>
          </div>
          <div class="library-overview__card">
            <span>暂停</span>
            <strong>{{ pausedLibraryItems.length }}</strong>
          </div>
          <div class="library-overview__card">
            <span>已选</span>
            <strong>{{ selectedLibraryItems.length }}</strong>
          </div>
        </div>
        <div class="library-toolbar">
          <button class="toolbar-button" type="button" @click="libraryFilter = libraryFilter === 'all' ? 'failed' : libraryFilter === 'failed' ? 'running' : libraryFilter === 'running' ? 'paused' : 'all'">
            <Filter class="h-4 w-4" />
            {{ uiText.filter }} {{ libraryFilter === 'all' ? '全部' : libraryFilter === 'failed' ? '失败' : libraryFilter === 'running' ? '运行中' : '暂停' }}
          </button>
          <button class="toolbar-button" type="button" :disabled="!filteredLibraryItems.length" @click="toggleSelectAllFiltered">
            <CheckCircle2 class="h-4 w-4" />
            {{ selectedLibraryItems.length && selectedLibraryItems.length === filteredLibraryItems.length ? '取消当前筛选' : '选择当前筛选' }}
          </button>
          <button class="toolbar-button" type="button" :disabled="!retryableFailedLibraryItems.length" @click="retryFailedItems">
            <RefreshCcw class="h-4 w-4" />
            重试失败任务 {{ retryableFailedLibraryItems.length ? `(${retryableFailedLibraryItems.length})` : '' }}
          </button>
          <button class="toolbar-button" type="button" :disabled="!pausedLibraryItems.length" @click="resumePausedItems">
            <Play class="h-4 w-4" />
            恢复暂停 {{ pausedLibraryItems.length ? `(${pausedLibraryItems.length})` : '' }}
          </button>
          <button class="toolbar-button" type="button" :disabled="!runningLibraryItems.length" @click="pauseRunningItems">
            <LoaderCircle class="h-4 w-4" />
            暂停运行中 {{ runningLibraryItems.length ? `(${runningLibraryItems.length})` : '' }}
          </button>
          <button class="toolbar-icon active" type="button">
            <Grid2x2 class="h-4 w-4" />
          </button>
          <button class="toolbar-icon" type="button">
            <List class="h-4 w-4" />
          </button>
          <button class="primary-button export-selected-button" data-testid="live-photo-export-selected" type="button" :disabled="exporting || !selectedLibraryIds.length" @click="exportSelected">
            <Package class="h-4 w-4" />
            {{ exporting ? t('livePhoto.actions.exporting') : `${uiText.exportSelectedPrefix} (${selectedLibraryIds.length})` }}
          </button>
        </div>
        <div class="library-pagination">
          <button class="toolbar-button" type="button" :disabled="libraryPage <= 1" @click="goToLibraryPage(libraryPage - 1)">上一页</button>
          <span class="library-pagination__text">第 {{ libraryPage }} / {{ libraryTotalPages }} 页</span>
          <button class="toolbar-button" type="button" :disabled="libraryPage >= libraryTotalPages" @click="goToLibraryPage(libraryPage + 1)">下一页</button>
        </div>
      </div>

      <div v-if="!filteredLibraryItems.length" class="panel-card empty-card" data-testid="live-photo-empty">
        <strong>{{ t('livePhoto.library.emptyTitle') }}</strong>
        <p>{{ t('livePhoto.library.emptyDesc') }}</p>
      </div>

      <div v-else class="live-console-list">
        <article v-for="item in filteredLibraryItems" :key="item.id" class="live-console-row" :class="{ selected: selectedLibraryIds.includes(item.id) }" :data-testid="`live-photo-item-${item.id}`">
          <label class="live-console-row__check">
            <input :data-testid="`live-photo-select-${item.id}`" type="checkbox" :checked="selectedLibraryIds.includes(item.id)" @change="toggleLibrarySelection(item.id)" />
            <span></span>
          </label>

          <div class="live-console-row__preview">
            <div class="live-console-row__thumb">
              <img v-if="item.posterPath" :src="previewSrc(item.posterPath)" alt="poster" />
              <div v-else class="live-console-row__thumb-empty">
                <FileImage class="h-5 w-5" />
              </div>
            </div>
          </div>

          <div class="live-console-row__main">
            <div class="live-console-row__task">
              <div class="live-console-row__titleline">
                <h3>{{ item.sourceShotLabel || item.productSnapshot?.name || item.id }}</h3>
                <span class="live-console-row__source">{{ item.sourceType === 'clone_shot' ? '复刻镜头' : '参考图替换' }}</span>
              </div>
              <div class="live-console-row__meta">
                <span class="live-console-row__text">{{ taskSourceSummary(item) }}</span>
                <span class="live-console-row__dot"></span>
                <span class="live-console-row__text">{{ metadataModeLabel(item) }}</span>
                <span v-if="item.autoFlowStatus" class="live-console-row__dot"></span>
                <span v-if="item.autoFlowStatus" class="live-console-row__text">{{ liveTaskRetryText(item) || '自动流程' }}</span>
              </div>
              <div class="live-console-row__subtitle">
                <span>{{ fileNameOf(item.referenceImagePath) || item.sourceShotLabel || '--' }}</span>
              </div>
              <div v-if="liveTaskErrorSummary(item)" class="live-console-row__error">
                <AlertTriangle class="h-3.5 w-3.5" />
                <span class="live-console-row__error-text">{{ liveTaskErrorSummary(item) }}</span>
              </div>
            </div>

            <div class="live-console-row__side">
              <div class="live-console-row__statuswrap">
                <span class="live-console-row__status" :class="liveTaskStatusTone(item)">{{ liveTaskStatusLabel(item) }}</span>
                <span class="live-console-row__stepbadge" :class="liveTaskStepTone(item.workflow?.currentStep)">{{ workflowStepLabel(item.workflow?.currentStep) }}</span>
              </div>
              <div class="live-console-row__updated-inline">
                <Clock3 class="h-3.5 w-3.5" />
                <span>{{ formatTime(item.updatedAt) }}</span>
              </div>
            </div>
          </div>

          <div class="live-console-row__bottom">
            <div class="live-console-row__quickrefs">
              <span class="live-console-row__quickchip">图片参考 {{ item.imagePromptPreview?.referenceImagePaths?.length || 0 }}</span>
              <span class="live-console-row__quickchip">视频参考 {{ item.videoPromptPreview?.referenceImagePaths?.length || 0 }}</span>
              <span class="live-console-row__quickchip">{{ liveTaskProgressPercent(item) }}%</span>
              <span class="live-console-row__quickchip">{{ liveTaskAutoSummary(item) }}</span>
              <span class="live-console-row__quickchip">当前阶段 {{ workflowStepLabel(item.workflow?.currentStep) }}</span>
              <span v-if="extractLivePhotoTaskId(item)" class="live-console-row__quickchip">任务号 {{ extractLivePhotoTaskId(item) }}</span>
              <span v-if="liveTaskWaitingHint(item)" class="live-console-row__quickchip live-console-row__quickchip--accent">{{ liveTaskWaitingHint(item) }}</span>
            </div>

            <div class="live-console-row__actions">
              <button class="live-console-row__link live-console-row__link--primary" type="button" @click="openTaskDetail(item)">
                <PanelBottomOpen class="h-4 w-4" />
                查看详情
              </button>
              <button class="live-console-row__link" type="button" @click="openRuntimeLogs(item)">
                <Logs class="h-4 w-4" />
                查看日志
              </button>
              <button
                :data-testid="`live-photo-preview-${item.id}`"
                class="live-console-row__action live-console-row__action--play"
                type="button"
                :disabled="!item.previewVideoPath"
                @click="openPath(item.previewVideoPath)"
              >
                <Play class="h-4 w-4" />
              </button>
              <button
                :data-testid="`live-photo-metadata-${item.id}`"
                class="live-console-row__action"
                type="button"
                :disabled="!item.packagingMetadataBridgePath"
                @click="openPath(item.packagingMetadataBridgePath)"
              >
                <Package class="h-4 w-4" />
              </button>
              <button
                :data-testid="`live-photo-reveal-${item.id}`"
                class="live-console-row__action"
                type="button"
                :disabled="!item.exportBundlePath"
                @click="showPath(item.exportBundlePath)"
              >
                <FolderOpen class="h-4 w-4" />
              </button>
              <button
                :data-testid="`live-photo-retry-${item.id}`"
                class="live-console-row__action"
                type="button"
                :disabled="item.packagingStatus === 'processing'"
                @click="retryItem(item)"
              >
                <RefreshCcw class="h-4 w-4" />
              </button>
              <button
                class="live-console-row__action"
                type="button"
                :disabled="item.packagingStatus === 'completed'"
                @click="item.autoFlowStatus?.paused ? resumeItemAutoFlow(item) : pauseItemAutoFlow(item)"
              >
                <component :is="item.autoFlowStatus?.paused ? Play : LoaderCircle" class="h-4 w-4" />
              </button>
              <button
                :data-testid="`live-photo-remove-${item.id}`"
                class="live-console-row__action live-console-row__action--danger"
                type="button"
                @click="removeItem(item.id)"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <div v-if="detailDialogOpen && detailDialogItem" class="live-detail-dialog" @click.self="closeTaskDetail">
      <div class="live-detail-dialog__panel">
        <div class="live-detail-dialog__head">
          <div class="live-detail-dialog__title">
            <strong>{{ detailDialogItem.sourceShotLabel || detailDialogItem.productSnapshot?.name || detailDialogItem.id }}</strong>
            <p>{{ detailDialogItem.sourceType === 'clone_shot' ? '复刻镜头任务详情' : '参考图替换任务详情' }}</p>
          </div>
          <button class="live-detail-dialog__close" type="button" @click="closeTaskDetail">关闭</button>
        </div>

        <div class="live-detail-dialog__summary">
          <div class="live-detail-dialog__summary-card">
            <span>状态</span>
            <strong>{{ liveTaskStatusLabel(detailDialogItem) }}</strong>
            <small>{{ liveTaskAutoSummary(detailDialogItem) }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>当前阶段</span>
            <strong>{{ workflowStepLabel(detailDialogItem.workflow?.currentStep) }}</strong>
            <small>{{ formatTime(detailDialogItem.updatedAt) }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>参考数量</span>
            <strong>{{ detailDialogItem.imagePromptPreview?.referenceImagePaths?.length || 0 }} / {{ detailDialogItem.videoPromptPreview?.referenceImagePaths?.length || 0 }}</strong>
            <small>图片参考 / 视频参考</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>等待时长</span>
            <strong>{{ liveTaskWaitingHint(detailDialogItem) || '--' }}</strong>
            <small>{{ isWaitingRemoteResult(detailDialogItem) ? '当前更像远程结果等待，不是本地立即失败。' : '显示当前自动流程最近一次运行时长。' }}</small>
          </div>
          <div class="live-detail-dialog__summary-card">
            <span>远端任务号</span>
            <strong>{{ extractLivePhotoTaskId(detailDialogItem) || '--' }}</strong>
            <small>{{ liveTaskRemoteStateText(detailDialogItem) }}</small>
          </div>
        </div>

        <div class="live-detail-dialog__hero">
          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>任务概览</strong>
              <span>{{ detailDialogItem.sourceProjectTitle || detailDialogItem.productSnapshot?.name || '--' }}</span>
            </div>
            <div class="live-detail-dialog__hero-grid">
              <div class="live-detail-dialog__metric">
                <span>任务类型</span>
                <strong>{{ detailDialogItem.sourceType === 'clone_shot' ? '复刻镜头' : '参考图替换' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>自动流程</span>
                <strong>{{ liveTaskAutoSummary(detailDialogItem) }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>最近更新时间</span>
                <strong>{{ formatTime(detailDialogItem.updatedAt) }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>重试状态</span>
                <strong>{{ liveTaskRetryText(detailDialogItem) || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>远端状态</span>
                <strong>{{ extractLivePhotoTaskId(detailDialogItem) || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>状态说明</span>
                <strong>{{ liveTaskRemoteStateText(detailDialogItem) }}</strong>
              </div>
            </div>
          </section>

          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>导出摘要</strong>
              <span>{{ hasExportArtifacts(detailDialogItem) ? '已生成导出产物' : '尚未导出' }}</span>
            </div>
            <div class="live-detail-dialog__hero-grid">
              <div class="live-detail-dialog__metric">
                <span>最近导出规格</span>
                <strong>{{ latestExportSettingsText(detailDialogItem) || '--' }}</strong>
              </div>
              <div class="live-detail-dialog__metric">
                <span>资源标识</span>
                <strong>{{ detailDialogItem.packagingAssetIdentifier || '--' }}</strong>
              </div>
            </div>
            <div class="live-detail-dialog__artifact-actions">
              <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.previewVideoPath" @click="openPath(detailDialogItem.previewVideoPath)">
                打开预览视频
              </button>
              <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.packagingMetadataBridgePath" @click="openPath(detailDialogItem.packagingMetadataBridgePath)">
                打开元数据桥接文件
              </button>
              <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.exportBundlePath" @click="showPath(detailDialogItem.exportBundlePath)">
                打开导出目录
              </button>
            </div>
          </section>

          <section class="live-detail-dialog__hero-card live-detail-dialog__hero-card--wide">
            <div class="live-detail-dialog__hero-head">
              <strong>生成结果</strong>
              <span>{{ hasImageResult(detailDialogItem) || hasVideoResult(detailDialogItem) ? '可直接查看图片与视频结果' : '当前还没有可展示的生成结果' }}</span>
            </div>
            <div class="live-result-grid">
              <article class="live-result-card">
                <div class="live-result-card__head">
                  <strong>生成图片</strong>
                  <span>{{ detailDialogItem.generatedStillPath ? fileNameOf(detailDialogItem.generatedStillPath) : '未生成' }}</span>
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
                  <span>图片结果将在图片生成完成后显示</span>
                </div>
                <div class="live-result-card__actions">
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.generatedStillPath" @click="openPath(detailDialogItem.generatedStillPath)">
                    打开图片
                  </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.generatedStillPath" @click="showPath(detailDialogItem.generatedStillPath)">
                    打开目录
                  </button>
                </div>
              </article>

              <article class="live-result-card">
                <div class="live-result-card__head">
                  <strong>生成视频</strong>
                  <span>{{ detailDialogItem.motionVideoPath ? fileNameOf(detailDialogItem.motionVideoPath) : detailDialogItem.previewVideoPath ? fileNameOf(detailDialogItem.previewVideoPath) : '未生成' }}</span>
                </div>
                <video
                  v-if="detailDialogItem.previewVideoPath"
                  class="live-result-card__video"
                  :src="previewSrc(detailDialogItem.previewVideoPath)"
                  controls
                  playsinline
                  preload="metadata"
                ></video>
                <div v-else class="live-result-card__empty">
                  <Play class="h-5 w-5" />
                  <span>视频结果将在视频生成完成后显示</span>
                </div>
                <div class="live-result-card__actions">
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.motionVideoPath" @click="openPath(detailDialogItem.motionVideoPath)">
                    打开视频
                  </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.previewVideoPath" @click="openPath(detailDialogItem.previewVideoPath)">
                    打开预览
                  </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.motionVideoPath" @click="showPath(detailDialogItem.motionVideoPath)">
                    打开目录
                  </button>
                </div>
              </article>

              <article class="live-result-card">
                <div class="live-result-card__head">
                  <strong>动态照片导出</strong>
                  <span>{{ detailDialogItem.exportBundlePath ? fileNameOf(detailDialogItem.exportBundlePath) : '未导出' }}</span>
                </div>
                <button
                  v-if="detailDialogItem.posterPath"
                  class="live-result-card__frame"
                  type="button"
                  @click="openPath(detailDialogItem.previewVideoPath || detailDialogItem.exportBundlePath)"
                >
                  <img :src="previewSrc(detailDialogItem.posterPath)" alt="live photo poster" />
                </button>
                <div v-else class="live-result-card__empty">
                  <Package class="h-5 w-5" />
                  <span>导出完成后会在这里展示最终封面</span>
                </div>
                <div class="live-result-card__actions">
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.exportBundlePath" @click="showPath(detailDialogItem.exportBundlePath)">
                    打开导出目录
                  </button>
                  <button class="live-detail-dialog__ghost" type="button" :disabled="!detailDialogItem.packagingMetadataBridgePath" @click="openPath(detailDialogItem.packagingMetadataBridgePath)">
                    打开桥接文件
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>最近日志预览</strong>
              <button class="live-detail-dialog__ghost" type="button" @click="openRuntimeLogs(detailDialogItem)">查看完整日志</button>
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
            <div v-else class="live-detail-dialog__log-empty">当前还没有可显示的任务日志。</div>
          </section>

          <section class="live-detail-dialog__hero-card">
            <div class="live-detail-dialog__hero-head">
              <strong>远端任务详情</strong>
              <span>{{ liveTaskRemoteEntries(detailDialogItem).length ? '已记录远端任务' : '当前没有远端任务号' }}</span>
            </div>
            <div v-if="liveTaskRemoteEntries(detailDialogItem).length" class="live-detail-dialog__hero-grid">
              <div v-for="entry in liveTaskRemoteEntries(detailDialogItem)" :key="entry.stage + entry.taskId" class="live-detail-dialog__metric">
                <span>{{ entry.stage }}</span>
                <strong>{{ entry.taskId }}</strong>
                <small>{{ entry.provider }} / {{ entry.model }}</small>
              </div>
            </div>
            <div v-else class="live-detail-dialog__log-empty">当前还没有持久化的图片或视频远端任务号。</div>
          </section>
        </div>

        <div class="live-console-row__detail-grid">
          <section class="live-console-row__detail-card">
            <div class="live-console-row__detail-head">
              <strong>当前流程</strong>
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
              <strong>图片请求</strong>
              <span>{{ detailDialogItem.imagePromptPreview?.provider || '--' }} / {{ detailDialogItem.imagePromptPreview?.model || '--' }}</span>
            </div>
            <div class="live-console-row__detail-block">
              <label>参考图绑定</label>
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
              <label>请求提示词</label>
              <pre>{{ detailDialogItem.imagePromptPreview?.prompt || detailDialogItem.promptPreview?.instructions?.join('\n') || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>负向提示词</label>
              <pre>{{ detailDialogItem.imagePromptPreview?.negativePrompt || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>完整参考</label>
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
              <strong>视频请求</strong>
              <span>{{ detailDialogItem.videoPromptPreview?.provider || '--' }} / {{ detailDialogItem.videoPromptPreview?.model || '--' }}</span>
            </div>
            <div class="live-console-row__detail-block">
              <label>请求提示词</label>
              <pre>{{ detailDialogItem.videoPromptPreview?.prompt || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>负向提示词</label>
              <pre>{{ detailDialogItem.videoPromptPreview?.negativePrompt || '--' }}</pre>
            </div>
            <div class="live-console-row__detail-block">
              <label>完整参考</label>
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

    <section v-if="activeTab === 'reference'" class="tip-strip">
      <div class="tip-copy">
        <div class="tip-badge">{{ uiText.tipTitle }}</div>
        <p>{{ uiText.tipDesc }}</p>
      </div>
      <button class="guide-link" type="button">{{ uiText.guide }}</button>
    </section>

    <RuntimeLogDialog
      v-model="runtimeDialogOpen"
      :logs="runtimeLogs"
      :title="runtimeDialogTitle"
      :description="'查看 Live Photo 单任务自动流程的阶段切换、请求准备、重试和失败信息。'"
      :hint="'这里只显示当前任务自己的运行日志。'"
      :fab-label="'任务日志'"
    />
  </div>
</template>

<style scoped>
.live-photo-page { display: grid; gap: 10px; padding: 10px; color: #f8fbff; background: radial-gradient(circle at top left, rgba(83, 58, 152, 0.12), transparent 28%), linear-gradient(180deg, #111521 0%, #171a29 42%, #111624 100%); }
.hero-shell, .panel-card, .library-export-card, .tip-strip { border: 1px solid rgba(111, 123, 170, 0.2); border-radius: 16px; background: linear-gradient(180deg, rgba(17, 21, 35, 0.98), rgba(13, 17, 30, 0.98)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03); }
.hero-shell { display: grid; gap: 8px; padding: 10px 12px; }
.hero-toolbar { display: flex; justify-content: space-between; gap: 8px; }
.hero-card { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 12px; padding-top: 10px; border-top: 1px solid rgba(111, 123, 170, 0.12); }
.hero-copy { min-width: 0; }
.hero-headline h1 { margin: 0; font-size: 18px; line-height: 1.28; font-weight: 800; letter-spacing: -0.02em; }
.hero-desc { margin: 6px 0 0; max-width: 900px; font-size: 12px; line-height: 1.6; color: rgba(197, 205, 225, 0.82); }
.stat-card { min-height: 82px; padding: 10px 12px; border-radius: 16px; background: linear-gradient(180deg, rgba(56, 28, 98, 0.62), rgba(27, 21, 42, 0.96)); display: grid; gap: 4px; }
.stat-card span { font-size: 12px; color: rgba(232, 236, 249, 0.86); }
.stat-card strong { font-size: 40px; line-height: 1; color: #b573ff; }
.banner { padding: 10px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; }
.banner-success { border: 1px solid rgba(34, 197, 94, 0.2); background: rgba(34, 197, 94, 0.12); color: #d1fae5; }
.banner-error { border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.12); color: #fecaca; }
.tab-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-button, .primary-button, .ghost-button, .toolbar-button, .toolbar-icon { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 14px; border-radius: 12px; font-size: 12px; font-weight: 700; }
.tab-button, .ghost-button, .toolbar-button, .toolbar-icon { border: 1px solid rgba(111, 123, 170, 0.2); background: rgba(18, 23, 38, 0.8); color: #eef5ff; }
.tab-button.active, .toolbar-icon.active { border-color: rgba(119, 92, 255, 0.38); background: linear-gradient(180deg, rgba(85, 68, 167, 0.78), rgba(67, 49, 138, 0.78)); box-shadow: 0 10px 28px rgba(81, 54, 167, 0.22); }
.primary-button { border: 1px solid rgba(145, 106, 255, 0.4); background: linear-gradient(90deg, #6d5cff 0%, #9b52ff 100%); color: #fff; box-shadow: 0 12px 28px rgba(126, 82, 255, 0.22); }
.ghost-button.small { min-height: 32px; font-size: 12px; padding: 0 10px; border-radius: 10px; }
.ghost-button.danger { border-color: rgba(239, 68, 68, 0.2); color: #fecaca; }
.refresh-button { min-width: 84px; }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(330px, 0.92fr); gap: 10px; align-items: start; }
.panel-card { display: grid; gap: 10px; padding: 12px; }
.reference-card, .rules-card { min-height: 372px; }
.panel-head, .library-toolbar, .clone-thumb-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.panel-title-wrap { display: flex; align-items: center; gap: 10px; }
.panel-title-wrap strong, .panel-head > strong { font-size: 18px; line-height: 1.2; }
.live-photo-master-ref { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 10px; align-items: center; padding: 10px; border: 1px solid rgba(111, 123, 170, 0.2); border-radius: 12px; background: rgba(18, 23, 38, 0.72); }
.live-photo-master-ref--missing { grid-template-columns: 16px minmax(0, 1fr); color: #fecaca; }
.live-photo-master-ref__preview { width: 88px; height: 88px; padding: 0; overflow: hidden; border: 0; border-radius: 12px; background: rgba(255, 255, 255, 0.04); }
.live-photo-master-ref__preview img { width: 100%; height: 100%; object-fit: cover; }
.live-photo-master-ref__copy { display: grid; gap: 4px; min-width: 0; }
.live-photo-master-ref__copy strong { color: #eef5ff; }
.live-photo-master-ref__copy small { color: #9fb1d8; font-size: 11px; word-break: break-all; }
.live-console-row__binding-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.live-console-row__binding-card { display: grid; gap: 4px; padding: 12px; text-align: left; border: 1px solid rgba(111, 123, 170, 0.2); border-radius: 12px; background: rgba(18, 23, 38, 0.8); color: #eef5ff; }
.live-console-row__binding-card span { color: rgba(197, 205, 225, 0.82); font-size: 12px; }
.live-console-row__binding-card small { color: #9fb1d8; font-size: 11px; word-break: break-all; }
.panel-head-note { color: #9097bd; font-size: 12px; }
.step-badge { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(180deg, #7568e8, #5a4fd0); color: #fff; font-size: 14px; font-weight: 700; box-shadow: 0 8px 18px rgba(98, 79, 210, 0.28); }
.field-stack, .field, .clone-shot-list, .library-layout, .library-grid-six, .export-copy, .clone-selected-grid, .settings-grid, .export-grid, .rules-compact { display: grid; gap: 10px; }
.field > span { font-size: 13px; font-weight: 700; color: rgba(240, 243, 255, 0.96); }
.field input, .field select { width: 100%; min-height: 40px; padding: 0 12px; border: 1px solid rgba(111, 123, 170, 0.24); border-radius: 12px; background: rgba(19, 24, 38, 0.92); color: #fff; font-size: 13px; }
.upload-surface { min-height: 164px; border-radius: 16px; border: 1px solid rgba(111, 123, 170, 0.22); background: linear-gradient(180deg, rgba(18, 23, 38, 0.82), rgba(14, 19, 31, 0.92)); display: grid; place-items: center; gap: 10px; padding: 16px; color: #eef5ff; text-align: center; cursor: pointer; }
.upload-copy strong { font-size: 15px; line-height: 1.35; }
.upload-copy small { font-size: 12px; line-height: 1.6; color: rgba(197, 205, 225, 0.76); word-break: break-all; }
.upload-preview { width: 100%; max-height: 132px; object-fit: contain; border-radius: 10px; }
.reference-material-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.reference-material-bar small { color: #9fb1d8; font-size: 11px; }
.reference-material-picker { display: grid; gap: 12px; padding: 12px; border: 1px solid rgba(111, 123, 170, 0.18); border-radius: 16px; background: linear-gradient(180deg, rgba(20, 26, 43, 0.96), rgba(13, 18, 31, 0.96)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
.reference-material-picker__hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 2px 0; }
.reference-material-picker__hero-copy { display: grid; gap: 4px; }
.reference-material-picker__hero-copy strong { color: #f3f6ff; font-size: 14px; }
.reference-material-picker__hero-copy small { color: #9fb1d8; font-size: 11px; }
.reference-material-picker__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0 2px; border-top: 1px solid rgba(111, 123, 170, 0.14); }
.reference-material-picker__actions { display: inline-flex; align-items: center; gap: 8px; }
.reference-material-picker__pager { display: inline-flex; align-items: center; gap: 8px; color: #9fb1d8; font-size: 11px; }
.reference-material-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; max-height: 420px; overflow: auto; padding-right: 2px; }
.reference-material-card { display: grid; gap: 8px; padding: 8px; border-radius: 14px; border: 1px solid rgba(111, 123, 170, 0.18); background: rgba(14, 19, 32, 0.92); cursor: pointer; transition: border-color .16s ease, transform .16s ease, box-shadow .16s ease; }
.reference-material-card.active { border-color: rgba(124, 92, 255, 0.72); box-shadow: inset 0 0 0 1px rgba(124, 92, 255, 0.38); }
.reference-material-card:hover { transform: translateY(-1px); border-color: rgba(148, 160, 255, 0.34); }
.reference-material-card input { margin: 0; }
.reference-material-card img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px; background: rgba(255, 255, 255, 0.04); }
.reference-material-card__copy { display: grid; gap: 4px; min-width: 0; }
.reference-material-card__copy strong { color: #eef5ff; font-size: 12px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reference-material-card__copy small { color: #9fb1d8; font-size: 10px; }
.field-select-mini { min-height: 30px; padding: 0 10px; border: 1px solid rgba(111, 123, 170, 0.24); border-radius: 10px; background: rgba(19, 24, 38, 0.92); color: #fff; font-size: 11px; }
.product-picker { position: relative; display: grid; grid-template-columns: 42px minmax(0, 1fr) 16px; gap: 10px; align-items: center; min-height: 50px; padding: 0 12px; border: 1px solid rgba(111, 123, 170, 0.22); border-radius: 14px; background: rgba(19, 24, 38, 0.92); }
.product-picker select { appearance: none; border: 0; background: transparent; min-height: 50px; padding: 0; font-size: 14px; }
.project-picker { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 10px; align-items: center; min-height: 50px; padding: 0 16px; border: 1px solid rgba(111, 123, 170, 0.22); border-radius: 14px; background: rgba(19, 24, 38, 0.92); }
.project-picker select { appearance: none; border: 0; background: transparent; min-height: 50px; padding: 0; font-size: 14px; color: #fff; }
.picker-arrow { color: rgba(214, 223, 246, 0.76); pointer-events: none; }
.product-thumb { width: 42px; height: 42px; border-radius: 11px; overflow: hidden; background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; }
.product-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.product-thumb-fallback { color: rgba(214, 223, 246, 0.82); }
.create-button { min-height: 48px; border-radius: 14px; font-size: 15px; font-weight: 800; }
.safe-note { display: flex; align-items: center; justify-content: center; gap: 8px; color: rgba(214, 223, 246, 0.78); font-size: 12px; line-height: 1.55; }
.rules-box { display: grid; border: 1px solid rgba(111, 123, 170, 0.2); border-radius: 16px; overflow: hidden; background: linear-gradient(180deg, rgba(18, 22, 36, 0.86), rgba(15, 18, 31, 0.9)); }
.rule-row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; padding: 12px 14px; border-bottom: 1px solid rgba(111, 123, 170, 0.14); }
.rule-row:last-child { border-bottom: 0; }
.rule-icon { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: #c39bff; border: 1px solid rgba(164, 115, 255, 0.34); background: rgba(122, 82, 255, 0.1); font-size: 13px; font-weight: 700; }
.rule-row p, .compact-row p { margin: 0; line-height: 1.55; font-size: 13px; color: rgba(233, 238, 251, 0.9); }
.output-note { padding: 14px; border-radius: 14px; background: linear-gradient(180deg, rgba(72, 54, 133, 0.82), rgba(58, 44, 108, 0.94)); border: 1px solid rgba(135, 102, 255, 0.24); }
.output-note-head { margin-bottom: 8px; font-size: 15px; font-weight: 700; color: #dfd5ff; }
.output-note p { margin: 0; font-size: 12px; line-height: 1.6; color: rgba(220, 228, 246, 0.84); }
.clone-layout { display: grid; gap: 10px; align-content: start; }
.clone-top-grid, .clone-bottom-grid { display: grid; gap: 10px; }
.clone-top-grid { grid-template-columns: minmax(360px, 0.8fr) minmax(0, 1.2fr); }
.clone-bottom-grid { grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.75fr); gap: 12px; }
.clone-footer-actions { display: grid; grid-template-columns: minmax(0, 1fr) 274px; gap: 10px; align-items: center; }
.clone-project-card, .clone-preview-card, .clone-settings-card, .clone-rule-card { min-height: 0; align-content: start; }
.clone-project-card { grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
.clone-preview-card { gap: 12px; }
.clone-shot-list { max-height: 420px; overflow: auto; padding-right: 2px; align-content: start; }
.clone-shot-row { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; padding: 12px; border-radius: 12px; border: 1px solid rgba(111, 123, 170, 0.18); background: rgba(18, 23, 38, 0.74); }
.clone-shot-row.active { border-color: rgba(126, 96, 255, 0.42); box-shadow: inset 0 0 0 1px rgba(126, 96, 255, 0.18); }
.reference-task-row.missing { border-color: rgba(239, 68, 68, 0.34); box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.12); }
.reference-task-row { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.clone-shot-copy { min-width: 0; }
.clone-shot-copy strong { font-size: 13px; line-height: 1.42; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.clone-shot-copy small { font-size: 10px; color: rgba(197, 205, 225, 0.74); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.missing-pill { margin-top: 6px; min-height: 20px; width: fit-content; padding: 0 8px; border-radius: 999px; background: rgba(239, 68, 68, 0.16); color: #fecaca; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; }
.secondary-create-button { min-height: 40px; border-radius: 12px; border: 1px solid rgba(124, 96, 255, 0.36); background: rgba(75, 54, 143, 0.2); color: #d9d3ff; font-size: 13px; font-weight: 700; }
.clone-summary-head { display: grid; gap: 4px; justify-items: end; }
.clone-summary-head strong { font-size: 13px; font-weight: 600; color: rgba(231, 235, 248, 0.9); }
.clone-preview-main { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 12px; align-items: start; }
.clone-preview-frame { position: relative; height: 288px; border-radius: 16px; overflow: hidden; border: 1px solid rgba(111, 123, 170, 0.18); background: linear-gradient(180deg, rgba(14, 18, 30, 0.92), rgba(11, 14, 24, 0.96)); display: flex; align-items: center; justify-content: center; }
.clone-preview-frame img { width: auto; height: 100%; max-width: 100%; object-fit: contain; display: block; }
.clone-fallback { width: 100%; height: 100%; min-height: 288px; }
.preview-play { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.52); background: rgba(10, 14, 25, 0.58); color: #fff; display: grid; place-items: center; }
.clone-stat-stack { display: grid; gap: 8px; }
.clone-stat-card { min-height: 64px; border-radius: 14px; border: 1px solid rgba(111, 123, 170, 0.16); background: rgba(18, 23, 38, 0.76); padding: 10px; display: grid; gap: 4px; }
.clone-stat-card span { font-size: 12px; }
.clone-stat-card strong { font-size: 28px; line-height: 1; }
.clone-thumb-head strong, .clone-selected-section strong { font-size: 15px; }
.clone-thumb-tools { display: flex; gap: 6px; }
.thumb-tool { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(111, 123, 170, 0.18); background: rgba(18, 23, 38, 0.7); color: rgba(214, 223, 246, 0.82); display: grid; place-items: center; }
.clone-thumb-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; }
.clone-thumb-card, .clone-selected-card { position: relative; overflow: hidden; border-radius: 10px; border: 1px solid rgba(111, 123, 170, 0.18); background: rgba(18, 23, 38, 0.74); min-height: 54px; aspect-ratio: 0.72 / 1; }
.clone-thumb-card.active { border-color: rgba(126, 96, 255, 0.48); }
.clone-thumb-card img, .clone-selected-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.clone-thumb-index { position: absolute; left: 6px; bottom: 6px; min-width: 22px; height: 18px; padding: 0 5px; border-radius: 999px; background: rgba(6, 10, 18, 0.72); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; }
.clone-thumb-fallback { min-height: 54px; display: grid; place-items: center; color: rgba(214, 223, 246, 0.78); font-weight: 700; font-size: 10px; }
.clone-selected-grid { grid-template-columns: repeat(auto-fit, minmax(66px, 84px)); gap: 5px; }
.clone-selected-card { min-height: 58px; }
.clone-selected-meta { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px; background: linear-gradient(180deg, transparent, rgba(5, 8, 14, 0.88)); display: grid; gap: 2px; }
.clone-selected-meta span { font-size: 10px; font-weight: 700; }
.clone-selected-meta small { font-size: 9px; color: rgba(226, 232, 248, 0.82); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.clone-settings-card { gap: 12px; }
.clone-rule-card { gap: 12px; padding-top: 14px; }
.settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.format-card { border-radius: 16px; border: 1px solid rgba(111, 123, 170, 0.18); background: rgba(18, 23, 38, 0.72); padding: 14px 16px; display: grid; gap: 8px; min-height: 108px; align-content: start; }
.format-card-active { border-color: rgba(126, 96, 255, 0.42); background: linear-gradient(180deg, rgba(52, 39, 108, 0.48), rgba(24, 28, 46, 0.86)); }
.format-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.format-card-title { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.format-card-title strong { font-size: 15px; line-height: 1.25; }
.format-tag { min-height: 22px; padding: 0 9px; border-radius: 999px; background: rgba(255, 171, 76, 0.18); color: #ffcf92; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; }
.format-card p { margin: 0; font-size: 12px; line-height: 1.75; color: rgba(197, 205, 225, 0.8); }
.export-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.rules-compact { gap: 14px; padding-top: 2px; }
.compact-row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; }
.compact-dot { width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(111, 123, 170, 0.26); color: rgba(221, 228, 246, 0.86); display: grid; place-items: center; font-size: 13px; }
.clone-generate-button { min-height: 46px; border-radius: 14px; font-size: 15px; font-weight: 800; padding: 0 20px; justify-self: start; min-width: 320px; }
.clone-safe-note { justify-content: flex-start; align-items: flex-start; border: 1px solid rgba(111, 123, 170, 0.18); border-radius: 16px; background: rgba(18, 23, 38, 0.72); padding: 14px 16px; }
.clone-safe-note span { display: block; font-size: 12px; line-height: 1.7; }
.reference-status-list { display: grid; gap: 8px; max-height: 240px; overflow: auto; padding-right: 2px; }
.reference-status-card { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(111, 123, 170, 0.18); background: rgba(18, 23, 38, 0.74); }
.reference-status-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.reference-status-top strong { min-width: 0; font-size: 13px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reference-status-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: rgba(215, 223, 243, 0.72); font-size: 11px; }
.reference-status-card small { font-size: 10px; color: rgba(197, 205, 225, 0.68); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-pill.status-processing { background: rgba(91, 118, 255, 0.18); color: #cfd8ff; }
.status-pill.status-failed { background: rgba(239, 68, 68, 0.18); color: #fecaca; }
.status-pill.status-draft { background: rgba(148, 163, 184, 0.18); color: #e2e8f0; }
.status-pill.status-completed { background: rgba(16, 101, 78, 0.18); color: #68f0b9; }
.library-layout { display: grid; gap: 10px; }
.library-headline { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.library-title-row { display: flex; align-items: center; gap: 10px; }
.library-title-row strong { font-size: 18px; line-height: 1.1; }
.library-count { min-height: 30px; padding: 0 11px; border-radius: 999px; border: 1px solid rgba(111, 123, 170, 0.2); background: rgba(18, 23, 38, 0.7); color: rgba(225, 231, 247, 0.8); display: inline-flex; align-items: center; font-weight: 700; font-size: 12px; }
.library-toolbar { display: flex; align-items: center; gap: 8px; }
.library-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.library-pagination__text { min-width: 110px; text-align: center; font-size: 12px; color: #9fb2d8; }
.library-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.library-overview__card {
  display: grid;
  gap: 4px;
  min-height: 74px;
  padding: 10px 12px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(18, 23, 38, 0.8), rgba(13, 18, 30, 0.88));
}
.library-overview__card span { font-size: 11px; color: #8ea3c9; }
.library-overview__card strong { font-size: 24px; line-height: 1; color: #f8fbff; }
.toolbar-button { min-width: 84px; padding: 0 14px; }
.toolbar-icon { width: 38px; padding: 0; }
.export-selected-button { min-width: 164px; }
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
  border: 1px solid rgba(111, 123, 170, 0.24);
  background: rgba(19, 24, 38, 0.92);
  color: #fff;
  font-size: 13px;
}
.metadata-card-select small {
  color: rgba(197, 205, 225, 0.72);
  font-size: 11px;
  line-height: 1.5;
}
.live-console-list { display: grid; gap: 10px; }
.live-console-list { display: grid; gap: 10px; }
.live-console-row {
  display: grid;
  grid-template-columns: 28px 104px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  background:
    radial-gradient(circle at top right, rgba(120, 96, 255, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(17, 21, 35, 0.98), rgba(13, 17, 30, 0.98));
  box-shadow: 0 18px 40px rgba(6, 10, 20, 0.22);
}
.live-console-row.selected { border-color: rgba(126, 96, 255, 0.46); box-shadow: inset 0 0 0 1px rgba(126, 96, 255, 0.18); }
.live-console-row__check { display: grid; place-items: center; }
.live-console-row__check input { position: absolute; opacity: 0; pointer-events: none; }
.live-console-row__check span {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.03);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.live-console-row__check input:checked + span {
  background: linear-gradient(90deg, #6d5cff 0%, #9b52ff 100%);
  border-color: transparent;
}
.live-console-row__check input:checked + span::after {
  content: '';
  width: 6px;
  height: 10px;
  border: solid #fff;
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}
.live-console-row__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.live-console-row__thumb-empty {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: rgba(214, 223, 246, 0.72);
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
  color: #f5f8ff;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.live-console-row__source {
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(130, 108, 255, 0.12);
  color: #ddd5ff;
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
}
.live-console-row__meta { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.live-console-row__dot { width: 4px; height: 4px; border-radius: 999px; background: rgba(143, 164, 206, 0.7); }
.live-console-row__text { color: #8ea3c9; font-size: 11px; }
.live-console-row__subtitle {
  color: rgba(197, 205, 225, 0.74);
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
  color: #fca5a5;
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
  border-top: 1px solid rgba(111, 123, 170, 0.12);
}
.live-console-row__quickrefs { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.live-console-row__quickchip {
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(113, 130, 168, 0.22);
  background: rgba(255, 255, 255, 0.04);
  color: #cedcff;
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.live-console-row__quickchip--accent {
  border-color: rgba(250, 204, 21, 0.24);
  background: rgba(250, 204, 21, 0.1);
  color: #fde68a;
}
.live-console-row__link {
  border: 0;
  padding: 0;
  background: transparent;
  color: #98b9ff;
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
  background: rgba(95, 78, 255, 0.16);
  border: 1px solid rgba(126, 96, 255, 0.28);
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
  border: 1px solid rgba(111, 123, 170, 0.16);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}
.live-console-row__detail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(111, 123, 170, 0.14);
}
.live-console-row__detail-head strong { font-size: 13px; color: #f4f7ff; }
.live-console-row__detail-head span { font-size: 11px; color: #9cb1da; }
.live-console-row__detail-block { display: grid; gap: 6px; }
.live-console-row__detail-block label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #8ea8d7;
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
  border: 1px solid rgba(111, 123, 170, 0.14);
  background: rgba(7, 11, 20, 0.56);
  color: #e8eefc;
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
  border: 1px solid rgba(111, 123, 170, 0.14);
  background: rgba(7, 11, 20, 0.42);
  border-radius: 14px;
  padding: 8px;
  display: grid;
  gap: 8px;
  text-align: left;
  color: #d4dff8;
}
.live-console-row__ref-preview img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  background: rgba(255, 255, 255, 0.04);
}
.live-console-row__ref-preview span {
  font-size: 10px;
  line-height: 1.4;
  word-break: break-all;
  color: #c9d7f5;
}
.live-console-row__path-list li {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(111, 123, 170, 0.14);
  background: rgba(7, 11, 20, 0.42);
  color: #d4dff8;
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
  border: 1px solid rgba(111, 123, 170, 0.14);
  background: rgba(8, 12, 22, 0.42);
}
.live-console-row__timeline-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.live-console-row__timeline-main strong { font-size: 12px; color: #f4f7ff; }
.live-console-row__timeline-main span { font-size: 11px; color: #9dc0ff; }
.live-console-row__timeline-item small { font-size: 10px; color: #8295ba; }
.live-console-row__timeline-error {
  margin: 0;
  color: #fecaca;
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
.live-console-row__status.is-success { background: rgba(16, 185, 129, 0.14); color: #86efac; }
.live-console-row__status.is-danger { background: rgba(248, 113, 113, 0.14); color: #fca5a5; }
.live-console-row__status.is-warning { background: rgba(251, 191, 36, 0.16); color: #fde68a; }
.live-console-row__status.is-draft { background: rgba(148, 163, 184, 0.14); color: #cbd5e1; }
.live-console-row__status.is-running { background: rgba(59, 130, 246, 0.14); color: #93c5fd; }
.live-console-row__stepbadge { border: 1px solid rgba(255, 255, 255, 0.06); background: rgba(255, 255, 255, 0.035); color: #d8e5ff; }
.live-console-row__stepbadge.tone-queue { color: #d8e5ff; }
.live-console-row__stepbadge.tone-image { color: #f9a8d4; }
.live-console-row__stepbadge.tone-video { color: #93c5fd; }
.live-console-row__stepbadge.tone-package { color: #fcd34d; }
.live-console-row__stepbadge.tone-done { color: #86efac; }
.live-console-row__updated-inline { display: flex; align-items: center; gap: 6px; color: #92a5ca; font-size: 11px; }
.live-console-row__actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.live-console-row__action {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #dce7ff;
}
.live-console-row__action--play { background: rgba(109, 92, 255, 0.14); }
.live-console-row__action--danger { color: #fca5a5; }
.live-detail-dialog {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 28px;
}
.live-detail-dialog::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 16, 0.72);
  backdrop-filter: blur(12px);
  z-index: -1;
}
.live-detail-dialog__panel {
  width: min(1380px, 100%);
  max-height: calc(100vh - 56px);
  overflow: auto;
  border-radius: 24px;
  border: 1px solid rgba(111, 123, 170, 0.22);
  background:
    radial-gradient(circle at top right, rgba(110, 93, 255, 0.16), transparent 24%),
    linear-gradient(180deg, rgba(18, 23, 38, 0.98), rgba(12, 16, 28, 0.98));
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
.live-detail-dialog__title strong { font-size: 22px; line-height: 1.2; color: #f8fbff; }
.live-detail-dialog__title p { margin: 0; font-size: 12px; line-height: 1.6; color: #92a5ca; }
.live-detail-dialog__close {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(111, 123, 170, 0.22);
  background: rgba(255, 255, 255, 0.04);
  color: #eef5ff;
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
  border: 1px solid rgba(111, 123, 170, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}
.live-detail-dialog__summary-card span { font-size: 11px; color: #8ea3c9; }
.live-detail-dialog__summary-card strong { font-size: 20px; line-height: 1.15; color: #f8fbff; }
.live-detail-dialog__summary-card small { font-size: 11px; color: #9cb1da; }
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
  border: 1px solid rgba(111, 123, 170, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}
.live-detail-dialog__hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.live-detail-dialog__hero-head strong { font-size: 14px; color: #f4f7ff; }
.live-detail-dialog__hero-head span { font-size: 11px; color: #92a5ca; }
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
  background: rgba(8, 12, 22, 0.42);
  border: 1px solid rgba(111, 123, 170, 0.14);
}
.live-detail-dialog__metric span { font-size: 10px; color: #8ea3c9; }
.live-detail-dialog__metric strong { font-size: 13px; line-height: 1.5; color: #f8fbff; }
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
  border: 1px solid rgba(111, 123, 170, 0.18);
  background: rgba(7, 12, 22, 0.5);
}
.live-result-card__head {
  display: grid;
  gap: 4px;
}
.live-result-card__head strong {
  font-size: 14px;
  color: #f8fbff;
}
.live-result-card__head span {
  font-size: 11px;
  color: #8ea3c9;
  line-height: 1.5;
  word-break: break-all;
}
.live-result-card__frame,
.live-result-card__video {
  width: 100%;
  min-height: 220px;
  max-height: 280px;
  border-radius: 16px;
  border: 1px solid rgba(111, 123, 170, 0.16);
  background: linear-gradient(180deg, rgba(9, 14, 24, 0.94), rgba(7, 11, 20, 0.98));
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
  border: 1px dashed rgba(123, 138, 186, 0.28);
  color: #8fa4cb;
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
  border: 1px solid rgba(126, 96, 255, 0.24);
  background: rgba(95, 78, 255, 0.12);
  color: #d8d2ff;
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
  border: 1px solid rgba(111, 123, 170, 0.14);
  background: rgba(8, 12, 22, 0.42);
}
.live-detail-dialog__log-item.is-success { border-color: rgba(16, 185, 129, 0.22); }
.live-detail-dialog__log-item.is-error { border-color: rgba(248, 113, 113, 0.22); }
.live-detail-dialog__log-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #92a5ca;
  font-size: 11px;
}
.live-detail-dialog__log-meta strong {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #d9e3ff;
  font-size: 10px;
}
.live-detail-dialog__log-item p {
  margin: 0;
  color: #e7eefc;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}
.live-detail-dialog__log-empty {
  min-height: 132px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  border: 1px dashed rgba(111, 123, 170, 0.2);
  color: #92a5ca;
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
  .library-headline, .hero-toolbar, .tip-strip { flex-direction: column; align-items: stretch; }
  .library-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .library-toolbar { flex-wrap: wrap; }
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
  .reference-material-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .reference-material-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
