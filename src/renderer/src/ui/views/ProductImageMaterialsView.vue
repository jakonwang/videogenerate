<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import {
  Check,
  Boxes,
  ChevronLeft,
  CircleCheck,
  CloudUpload,
  Copy,
  Download,
  Eye,
  FileVideo,
  Film,
  FolderOpen,
  History,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Layers,
  Link2,
  ListPlus,
  RefreshCcw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
  X,
} from 'lucide-vue-next'
import VideoPreviewModal from '../components/VideoPreviewModal.vue'
import MaterialPager from '../components/product-materials/MaterialPager.vue'
import MaterialTile from '../components/product-materials/MaterialTile.vue'

type Category = 'necklace' | 'ring' | 'earring' | 'bracelet'
type UsageStatus = 'unused' | 'used'

type BatchItem = {
  id: string
  category: Category
  status: 'queued' | 'processing' | 'completed' | 'partial_failed' | 'failed'
  totalVideos: number
  completedVideos: number
  failedVideos: number
  generatedImageCount: number
  currentSourceVideoPath?: string
  lastError?: string
  sourceItems: Array<{
    id: string
    sourceVideoPath: string
    sourceVideoName: string
    status: 'queued' | 'processing' | 'completed' | 'failed'
    generatedCount: number
    skippedCount: number
    error?: string
  }>
  updatedAt: number
}

type MaterialItem = {
  id: string
  category: Category
  sourceVideoName: string
  sourceVideoPath: string
  segmentIndex: number
  frameTimeSec: number
  localImagePath: string
  qiniuUrl: string
  materialOrigin?: 'original' | 'derived'
  derivedFromMaterialId?: string
  derivedVariantIndex?: number
  usageStatus: UsageStatus
  boundProductId?: string
  createdAt: number
}

type ProductItem = {
  id: string
  name: string
  type: string
}

type ParserVideoItem = {
  id: string
  shareUrl: string
  videoId: string
  title?: string
  author?: string
  localVideoPath?: string
  thumbnailPath?: string
  status: 'processing' | 'completed' | 'failed'
  error?: string
  usedStatus: 'unused' | 'used'
  updatedAt: number
}

const { locale } = useI18n()
const router = useRouter()
const DESKTOP_USER_ID = 'desktop-local'
const ASSET_USAGE_PLUGIN = 'product-image-materials'

type PromptVersion = { id: string; name: string; version: number; prompt: string; active: boolean }
const activeTab = ref<'batch' | 'image-to-image' | 'background' | 'library'>('batch')
const batchSourceMode = ref<'upload' | 'downloaded'>('upload')
const categories = ref<Category[]>(['necklace', 'ring', 'earring', 'bracelet'])
const selectedCategory = ref<Category>('necklace')
const pickedVideos = ref<string[]>([])
const parserVideos = ref<ParserVideoItem[]>([])
const selectedParserVideoIds = ref<string[]>([])
const batches = ref<BatchItem[]>([])
const materials = ref<MaterialItem[]>([])
const products = ref<ProductItem[]>([])
const filterCategory = ref<'all' | Category>('all')
const filterUsageStatus = ref<'all' | UsageStatus>('all')
const libraryPage = ref(1)
const backgroundPage = ref(1)
const parserVideoPage = ref(1)
const libraryPageSize = ref(24)
const parserVideoPageSize = ref(12)
const selectedMaterialIds = ref<string[]>([])
const backgroundMaterialCount = ref(3)
const imageVariantCount = ref(3)
const imageCategory = ref<Category>('necklace')
const sourceImagePaths = ref<string[]>([])
const imageGenerateProgress = ref({ done: 0, total: 0 })
function fileBaseName(path: string) { return path.split(/[\\/]/).pop() || '' }
function filePreviewSrc(path: string) { return `vg://file?path=${encodeURIComponent(path)}` }
const promptVersions = ref<PromptVersion[]>([])
const selectedPromptVersionId = ref('')
const promptVersionName = ref('')
const promptText = ref('')
const promptBusy = ref(false)
const imageGenerating = ref(false)
const selectedBackgroundMaterialIds = ref<string[]>([])
const loading = ref(false)
const submitting = ref(false)
const backgroundSubmitting = ref(false)
const actionBusyId = ref('')
const errorText = ref('')
const notice = ref('')
const previewOpen = ref(false)
const previewSrc = ref<string | null>(null)
const previewTitle = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null
let loadAllInFlight = false

const copy = computed(() => {
  if (locale.value === 'vi-VN') {
    return {
      pluginName: 'Tao anh tu anh',
      kicker: 'Kho vat lieu hinh anh san pham',
      title: 'Xu ly hang loat, quan ly hieu qua',
      subtitle: 'Tach video theo loat, lay khung hinh giua an toan, tai len Qiniu va duy tri thu vien anh co the tai su dung.',
      batches: 'Lo batch',
      materials: 'Vat lieu',
      processingCount: 'Dang xu ly',
      completedCount: 'Hoan thanh',
      workspace: 'Khong gian lam viec',
      workspaceHint: 'Chuyen nhanh giua xu ly batch va thu vien vat lieu',
      batchTab: 'Tach video',
      imageToImageTab: 'Anh sang anh',
      libraryTab: 'Thu vien vat lieu',
      createBatch: 'Tao batch',
      createBatchDesc: 'Chon danh muc co dinh va dua nhieu video vao hang doi xu ly.',
      queue: 'Hang doi xu ly',
      queueDesc: 'Tien trinh duoc tiep tuc tu dong va lam moi sau moi 4 giay.',
      category: 'Danh muc',
      uploadMyVideo: 'Tu tai video',
      chooseDownloadedVideo: 'Chon video da tai',
      pickZoneTitle: 'Chon tep video',
      pickZoneDesc: 'Ho tro chon nhieu tep hoac keo tha vao khu vuc nay.',
      pickZoneFormats: 'Ho tro MP4 / MOV / AVI va cac dinh dang pho bien.',
      pickVideos: 'Chon video',
      pickAssetVideos: 'Chon tu thu vien',
      queueBatch: 'Them vao hang doi',
      noVideosSelected: 'Chua chon video.',
      noDownloadedVideosSelected: 'Chua chon video da tai.',
      noDownloadedVideos: 'Chua co video da tai hoan tat. Hay dung plugin Tai video truoc.',
      downloadedVideo: 'Video da tai',
      backPlugin: 'Quay lai plugin',
      refresh: 'Lam moi',
      loadingBatches: 'Dang tai batch...',
      noBatches: 'Chua co batch.',
      total: 'Tong',
      done: 'Hoan thanh',
      failed: 'That bai',
      images: 'Anh',
      skipped: 'Bo qua',
      retryFailed: 'Thu lai muc loi',
      queueTip: 'Anh hoan thanh se duoc tai len Qiniu tu dong va co the quan ly tiep trong thu vien vat lieu.',
      materialLibrary: 'Thu vien vat lieu',
      materialLibraryDesc: 'Xem vat lieu theo dang album va quan ly nhanh tung anh.',
      materialLibraryHint: 'Man hinh rong hien 8 cot.',
      status: 'Trang thai',
      all: 'Tat ca',
      unused: 'Chua dung',
      used: 'Da dung',
      noMaterials: 'Khong co vat lieu nao phu hop bo loc hien tai.',
      segment: 'Canh',
      preview: 'Xem',
      openUrl: 'Mo lien ket',
      showFile: 'Hien tep',
      bindProduct: 'Lien ket san pham',
      unbound: 'Chua lien ket',
      deleteMaterial: 'Xoa',
      deleteConfirm: 'Ban chac chan muon xoa anh vat lieu nay?',
      deleted: 'Da xoa anh vat lieu.',
      createdQueued: 'Da tao batch va dua vao hang doi.',
      selectSourceVideos: 'Chon video nguon',
      videoFilter: 'Video',
      footer: 'On dinh / xu ly loat / tu dong tiep tuc / quan ly nhanh',
    }
  }

  if (locale.value === 'zh-CN') {
    return {
      pluginName: '图生图',
      kicker: '商品图片素材库',
      title: '批量处理，高效管理',
      subtitle: '批量拆分视频，提取安全中帧，上传到七牛，并维护可复用的图片素材库。',
      batches: '批次',
      materials: '素材',
      processingCount: '处理中',
      completedCount: '已完成',
      workspace: '工作区',
      workspaceHint: '在批次处理与素材相册之间快速切换',
      batchTab: '\u62c6\u89e3\u89c6\u9891',
      imageToImageTab: '\u56fe\u751f\u56fe',
      libraryTab: '素材库',
      createBatch: '创建批次',
      createBatchDesc: '选择固定分类后，将多个源视频加入处理队列。',
      queue: '处理队列',
      queueDesc: '应用启动后会自动续跑，每 4 秒刷新一次状态。',
      category: '分类',
      segmentTime: '分镜时长（秒）',
      segmentHint: '建议 2-5 秒，过短增加数量，过长影响节奏。',
      uploadMyVideo: '上传我的视频',
      chooseDownloadedVideo: '选择已下载视频',
      pickZoneTitle: '选择视频文件',
      pickZoneDesc: '支持批量选择，或将文件拖拽到此区域',
      pickZoneFormats: '支持 MP4 / MOV / AVI 等常见格式',
      pickVideos: '选择视频',
      pickAssetVideos: '从素材库选择',
      queueBatch: '加入队列',
      noVideosSelected: '暂未选择视频。',
      noDownloadedVideosSelected: '暂未选择已下载视频。',
      noDownloadedVideos: '暂无已完成下载的视频，请先使用视频解析下载插件。',
      downloadedVideo: '已下载视频',
      backPlugin: '返回插件',
      refresh: '刷新',
      loadingBatches: '正在加载批次...',
      noBatches: '暂无批次。',
      total: '总数',
      done: '完成',
      failed: '失败',
      images: '图片',
      skipped: '跳过',
      retryFailed: '重试失败项',
      queueTip: '提示：处理完成的图片已自动上传至七牛云，可在「素材库」中查看与管理。',
      materialLibrary: '素材库',
      materialLibraryDesc: '以相册墙方式浏览素材，并直接进行单张管理。',
      materialLibraryHint: '宽屏下按 8 列相册布局显示',
      status: '状态',
      all: '全部',
      unused: '未使用',
      used: '已使用',
      noMaterials: '当前筛选条件下没有素材。',
      segment: '分镜',
      preview: '查看',
      openUrl: '打开链接',
      showFile: '显示文件',
      bindProduct: '绑定商品',
      unbound: '未绑定',
      deleteMaterial: '删除',
      deleteConfirm: '确定要删除这张素材图片吗？',
      deleted: '素材已删除。',
      createdQueued: '批次已创建，并已加入处理队列。',
      selectSourceVideos: '选择源视频',
      videoFilter: '视频',
      footer: '安全稳定 / 批量处理 / 自动续跑 / 快速高效',
    }
  }

  return {
    pluginName: 'Image to Image',
    kicker: 'Product Image Materials',
    title: 'Batch processing, efficient management',
    subtitle: 'Split videos in batches, extract safe middle frames, upload to Qiniu, and maintain a reusable image-material library.',
    batches: 'Batches',
    materials: 'Materials',
    processingCount: 'Processing',
    completedCount: 'Completed',
    workspace: 'Workspace',
    workspaceHint: 'Switch quickly between batch processing and the material album',
    batchTab: 'Break Down Video',
    imageToImageTab: 'Image to Image',
    libraryTab: 'Material Library',
    createBatch: 'Create Batch',
    createBatchDesc: 'Choose a fixed category and queue multiple source videos.',
    queue: 'Processing Queue',
    queueDesc: 'Processing resumes automatically and refreshes every 4 seconds.',
    category: 'Category',
    segmentTime: 'Segment Time (sec)',
    segmentHint: 'Use 2-5 seconds to balance volume and pacing.',
    uploadMyVideo: 'Upload My Video',
    chooseDownloadedVideo: 'Choose Downloaded Video',
    pickZoneTitle: 'Select video files',
    pickZoneDesc: 'Supports multi-select or dragging files into this area.',
    pickZoneFormats: 'Supports MP4 / MOV / AVI and common formats.',
    pickVideos: 'Pick Videos',
    pickAssetVideos: 'Choose From Library',
    queueBatch: 'Queue Batch',
    noVideosSelected: 'No videos selected.',
    noDownloadedVideosSelected: 'No downloaded videos selected.',
    noDownloadedVideos: 'No completed downloaded videos yet. Use the Video Parser Download plugin first.',
    downloadedVideo: 'Downloaded video',
    backPlugin: 'Back to Plugins',
    refresh: 'Refresh',
    loadingBatches: 'Loading batches...',
    noBatches: 'No batches yet.',
    total: 'Total',
    done: 'Done',
    failed: 'Failed',
    images: 'Images',
    skipped: 'Skipped',
    retryFailed: 'Retry Failed',
    queueTip: 'Completed images are uploaded to Qiniu automatically and can be managed in the material library.',
    materialLibrary: 'Material Library',
    materialLibraryDesc: 'Browse materials like an album wall and manage each image inline.',
    materialLibraryHint: 'Shows 8 columns on wide screens.',
    status: 'Status',
    all: 'All',
    unused: 'Unused',
    used: 'Used',
    noMaterials: 'No materials matched the current filters.',
    segment: 'Segment',
    preview: 'View',
    openUrl: 'Open URL',
    showFile: 'Show File',
    bindProduct: 'Bind Product',
    unbound: 'Unbound',
    deleteMaterial: 'Delete',
    deleteConfirm: 'Delete this material image?',
    deleted: 'Material deleted.',
    createdQueued: 'Batch created and queued.',
    selectSourceVideos: 'Select source videos',
    videoFilter: 'Video',
    footer: 'Stable / Batch-ready / Auto-resume / High efficiency',
  }
})

const backgroundCopy = computed(() => {
  if (locale.value === 'vi-VN') return {
    tab: 'Tao nen', desc: 'Tao hang loat anh nen tu tai lieu goc va giu nguyen san pham.', hint: 'Anh phai sinh duoc danh dau ro rang va an khoi bo chon nguon.',
    materialCount: 'So anh moi nguon', generate: 'Tao bien the nen', sourceOnly: 'Chi xem anh goc', clearSelection: 'Bo chon', selected: 'Da chon', totalOutput: 'Tong dau ra',
    origin: 'Nguon', original: 'Anh goc', derived: 'Anh phai sinh', derivedFrom: 'Phai sinh tu', success: 'Da tao bien the nen.',
  }
  if (locale.value === 'zh-CN') return {
    tab: '\u80cc\u666f\u751f\u6210', desc: '\u9009\u62e9\u539f\u59cb\u7d20\u6750\uff0c\u6279\u91cf\u751f\u6210\u76f8\u4f3c\u80cc\u666f\u56fe\uff0c\u540c\u65f6\u4fdd\u6301\u4ea7\u54c1\u4e3b\u4f53\u4e0d\u53d8\u3002', hint: '\u884d\u751f\u56fe\u7247\u4f1a\u6e05\u6670\u6807\u8bb0\uff0c\u5e76\u9ed8\u8ba4\u4ece\u6765\u6e90\u9009\u62e9\u5668\u4e2d\u9690\u85cf\u3002',
    materialCount: '\u6bcf\u5f20\u751f\u6210\u6570\u91cf', generate: '\u751f\u6210\u80cc\u666f\u53d8\u4f53', sourceOnly: '\u4ec5\u770b\u539f\u56fe', clearSelection: '\u6e05\u7a7a\u9009\u62e9', selected: '\u5df2\u9009', totalOutput: '\u603b\u8f93\u51fa',
    origin: '\u6765\u6e90', original: '\u539f\u59cb', derived: '\u5df2\u884d\u751f', derivedFrom: '\u884d\u751f\u81ea', success: '\u80cc\u666f\u53d8\u4f53\u5df2\u751f\u6210\u3002',
  }
  return {
    tab: 'Background Generation', desc: 'Generate similar backgrounds in batches while keeping the product unchanged.', hint: 'Derived images are clearly marked and hidden from the source picker by default.',
    materialCount: 'Variants Per Source', generate: 'Generate Background Variants', sourceOnly: 'Original Images Only', clearSelection: 'Clear Selection', selected: 'Selected', totalOutput: 'Total Output',
    origin: 'Origin', original: 'Original', derived: 'Derived', derivedFrom: 'Derived From', success: 'Background variants generated.',
  }
})

const libraryBatchCopy = computed(() => {
  if (locale.value === 'vi-VN') {
    return {
      selectAll: 'Chon tat ca',
      clearSelection: 'Bo chon',
      selectedCount: 'Da chon',
      exportSelected: 'Xuat da chon',
      exportSuccess: 'Da xuat anh vat lieu.',
      exportPickDir: 'Chon thu muc xuat anh vat lieu',
    }
  }
  if (locale.value === 'zh-CN') {
    return {
      selectAll: '全选',
      clearSelection: '清空选择',
      selectedCount: '已选择',
      exportSelected: '批量导出',
      exportSuccess: '素材已导出。',
      exportPickDir: '选择素材导出文件夹',
    }
  }
  return {
    selectAll: 'Select All',
    clearSelection: 'Clear',
    selectedCount: 'Selected',
    exportSelected: 'Export Selected',
    exportSuccess: 'Materials exported.',
    exportPickDir: 'Choose material export folder',
  }
})

const batchDeleteCopy = computed(() => {
  if (locale.value === 'vi-VN') {
    return {
      action: 'Xoa da chon',
      confirm: 'Ban chac chan muon xoa cac anh vat lieu da chon?',
      success: 'Da xoa cac anh vat lieu da chon.',
    }
  }
  if (locale.value === 'zh-CN') {
    return {
      action: '批量删除',
      confirm: '确定要删除已选择的素材图片吗？',
      success: '已批量删除所选素材图片。',
    }
  }
  return {
    action: 'Delete Selected',
    confirm: 'Delete the selected material images?',
    success: 'Selected materials deleted.',
  }
})

const paginationCopy = computed(() => {
  if (locale.value === 'vi-VN') {
    return {
      prev: 'Trang truoc',
      next: 'Trang sau',
      perPage: 'Moi trang',
      items: 'muc',
    }
  }
  if (locale.value === 'zh-CN') {
    return {
      prev: '上一页',
      next: '下一页',
      perPage: '每页',
      items: '项',
    }
  }
  return {
    prev: 'Previous',
    next: 'Next',
    perPage: 'Per page',
    items: 'items',
  }
})

const libraryDisplayCopy = computed(() => {
  if (locale.value === 'vi-VN') {
    return {
      tab: 'Thu vien tach video',
      title: 'Thu vien anh phai sinh',
      desc: 'Chi hien thi anh phai sinh de duyet, xuat va quan ly nhanh.',
      hint: 'Chi hien thi ket qua anh phai sinh theo dang album.',
    }
  }
  if (locale.value === 'zh-CN') {
    return {
      tab: '\u884d\u751f\u56fe\u7d20\u6750',
      title: '\u884d\u751f\u56fe\u7d20\u6750\u5e93',
      desc: '\u53ea\u663e\u793a\u5df2\u884d\u751f\u51fa\u6765\u7684\u56fe\u7247\uff0c\u7528\u4e8e\u6d4f\u89c8\u3001\u5bfc\u51fa\u548c\u7ba1\u7406\u3002',
      hint: '\u5f53\u524d\u7d20\u6750\u5e93\u4ec5\u5c55\u793a\u884d\u751f\u56fe\u7ed3\u679c\u3002',
    }
  }
  return {
    tab: 'Derived Image Materials',
    title: 'Derived Library',
    desc: 'Only show derived images for browsing, export, and quick management.',
    hint: 'This library only displays derived image results.',
  }
})

const generationCopy = computed(() => {
  if (locale.value === 'vi-VN') {
    return {
      tab: 'Thu vien anh tach video',
      desc: 'Hien thi anh nguon va anh cat tu video de tiep tuc tao anh phai sinh hang loat.',
      hint: 'Anh duoc tao moi se vao thu vien anh phai sinh va khong tron vao danh sach anh nguon.',
      materialCount: 'So anh tao moi moi nguon',
      generate: 'Tao anh phai sinh',
      sourceOnly: 'Chon tat ca anh nguon hien tai',
      clearSelection: 'Bo chon',
      selected: 'Da chon',
      totalOutput: 'Tong dau ra',
      original: 'Anh nguon',
      derived: 'Anh phai sinh',
      derivedFrom: 'Tu nguon',
      success: 'Da tao anh phai sinh:',
    }
  }
  if (locale.value === 'zh-CN') {
    return {
      tab: '\u89c6\u9891\u62c6\u89e3\u56fe\u7247\u5e93',
      desc: '\u6d4f\u89c8\u89c6\u9891\u62c6\u89e3\u5f97\u5230\u7684\u6e90\u56fe\uff0c\u9009\u62e9\u7d20\u6750\u751f\u6210\u884d\u751f\u56fe\u3002',
      hint: '\u65b0\u751f\u6210\u7684\u56fe\u7247\u4f1a\u8fdb\u5165\u300c\u884d\u751f\u56fe\u7d20\u6750\u5e93\u300d\uff0c\u4e0d\u518d\u4e0e\u6e90\u56fe\u6df7\u663e\u3002',
      materialCount: '\u6bcf\u5f20\u6e90\u56fe\u751f\u6210\u6570\u91cf',
      generate: '\u751f\u6210\u884d\u751f\u56fe',
      sourceOnly: '\u5168\u9009\u5f53\u524d\u6e90\u56fe',
      clearSelection: '\u6e05\u7a7a\u9009\u62e9',
      selected: '\u5df2\u9009',
      totalOutput: '\u603b\u8f93\u51fa',
      original: '\u6e90\u56fe',
      derived: '\u884d\u751f\u56fe',
      derivedFrom: '\u884d\u751f\u81ea',
      success: '\u884d\u751f\u56fe\u5df2\u751f\u6210\uff1a',
    }
  }
  return {
    tab: 'Video Breakdown Image Library',
    desc: 'Show source images and video-cut frames here, then batch generate derived images from them.',
    hint: 'New outputs go into the derived library and no longer mix with source images.',
    materialCount: 'Variants per source image',
    generate: 'Generate Derived Images',
    sourceOnly: 'Select all visible source images',
    clearSelection: 'Clear Selection',
    selected: 'Selected',
    totalOutput: 'Total Output',
    original: 'Source Image',
    derived: 'Derived Image',
    derivedFrom: 'Derived From',
    success: 'Derived images generated:',
  }
})

const promptUi = computed(() => {
  if (locale.value === 'zh-CN') return {
    title: '\u751f\u6210\u63d0\u793a\u8bcd\u7248\u672c', version: '\u63d0\u793a\u8bcd\u7248\u672c', name: '\u7248\u672c\u540d\u79f0', content: '\u63d0\u793a\u8bcd\u5185\u5bb9', update: '\u4fdd\u5b58\u66f4\u65b0', copy: '\u590d\u5236\u4e3a\u65b0\u7248\u672c', activate: '\u542f\u7528\u7248\u672c', rollback: '\u56de\u6eda\u4e3a\u65b0\u7248\u672c', active: '\u5df2\u542f\u7528',
    source: '\u6e90\u56fe\u7247', assetLibrary: '\u4ece\u7d20\u6750\u5e93\u9009\u56fe', localUpload: '\u672c\u5730\u9009\u56fe', clearSource: '\u6e05\u9664\u6e90\u56fe', sourceHint: '\u652f\u6301 JPG\u3001PNG \u548c WEBP', category: '\u5546\u54c1\u5206\u7c7b', count: '\u751f\u6210\u6570\u91cf', generate: '\u751f\u6210\u884d\u751f\u56fe', empty: '\u5c1a\u672a\u9009\u62e9\u56fe\u7247',
    pickSourceTitle: '\u9009\u62e9\u6e90\u56fe\u7247', imageFilter: '\u56fe\u7247', saved: '\u63d0\u793a\u8bcd\u7248\u672c\u5df2\u4fdd\u5b58\u3002', activated: '\u63d0\u793a\u8bcd\u7248\u672c\u5df2\u542f\u7528\u3002', restored: '\u63d0\u793a\u8bcd\u7248\u672c\u5df2\u56de\u6eda\u4e3a\u65b0\u7684\u542f\u7528\u7248\u672c\u3002',
  }
  if (locale.value === 'vi-VN') return {
    title: 'Phien ban cau lenh', version: 'Phien ban', name: 'Ten phien ban', content: 'Noi dung cau lenh', update: 'Luu cap nhat', copy: 'Sao chep thanh phien ban moi', activate: 'Kich hoat', rollback: 'Khoi phuc thanh phien ban moi', active: 'Dang dung',
    source: 'Anh nguon', assetLibrary: 'Chon tu thu vien', localUpload: 'Chon anh tren may', clearSource: 'Xoa anh nguon', sourceHint: 'Ho tro JPG, PNG va WEBP', category: 'Danh muc san pham', count: 'So luong dau ra', generate: 'Tao anh phai sinh', empty: 'Chua chon anh',
    pickSourceTitle: 'Chon anh nguon', imageFilter: 'Hinh anh', saved: 'Da luu phien ban cau lenh.', activated: 'Da kich hoat phien ban cau lenh.', restored: 'Da khoi phuc thanh phien ban moi.',
  }
  return {
    title: 'Generation Prompt Versions', version: 'Prompt Version', name: 'Version Name', content: 'Prompt Content', update: 'Save Update', copy: 'Copy as New Version', activate: 'Activate Version', rollback: 'Rollback as New Version', active: 'Active',
    source: 'Source Image', assetLibrary: 'Choose From Asset Library', localUpload: 'Choose Local Image', clearSource: 'Clear Source Image', sourceHint: 'Supports JPG, PNG, and WEBP', category: 'Product Category', count: 'Output Count', generate: 'Generate Derived Images', empty: 'No image selected',
    pickSourceTitle: 'Select Source Image', imageFilter: 'Images', saved: 'Prompt version saved.', activated: 'Prompt version activated.', restored: 'Prompt version restored as a new active version.',
  }
})

/** Labels introduced by the redesigned layout. */
const uiText = computed(() => {
  if (locale.value === 'zh-CN') return {
    source: '视频来源', selected: '已选', videos: '个视频', remove: '移除', history: '最近批次', imagesUnit: '张图',
    queueEmpty: '在左侧选择视频并加入队列，处理进度会在这里实时更新。',
    promptDesc: '生成时使用当前选中的版本，可保存、复制或回滚。',
    sourceEmpty: '先在「拆解视频」中处理视频，拆解出的图片会出现在这里。',
    sourceCount: '已选 {n} 张源图', clearAll: '清空', addMore: '继续添加', sourceFailed: '部分源图生成失败：', sourceMultiHint: '可一次选择多张',
  }
  if (locale.value === 'vi-VN') return {
    source: 'Nguon video', selected: 'Da chon', videos: 'video', remove: 'Bo', history: 'Batch gan day', imagesUnit: 'anh',
    queueEmpty: 'Chon video ben trai va them vao hang doi; tien trinh se cap nhat tai day.',
    promptDesc: 'Phien ban dang chon se duoc dung khi tao anh.',
    sourceEmpty: 'Hay tach video truoc; anh tach ra se hien thi tai day.',
    sourceCount: 'Da chon {n} anh nguon', clearAll: 'Xoa het', addMore: 'Them anh', sourceFailed: 'Mot so anh nguon that bai:', sourceMultiHint: 'Co the chon nhieu anh',
  }
  return {
    source: 'Video source', selected: 'Selected', videos: 'videos', remove: 'Remove', history: 'Recent batches', imagesUnit: 'images',
    queueEmpty: 'Pick videos on the left and queue them; progress updates here automatically.',
    promptDesc: 'The selected version is used for generation. Save, copy or roll back anytime.',
    sourceEmpty: 'Break down a video first; extracted frames will show up here.',
    sourceCount: '{n} source images selected', clearAll: 'Clear all', addMore: 'Add more', sourceFailed: 'Some source images failed:', sourceMultiHint: 'Multiple images allowed',
  }
})

const promptPanelOpen = ref(false)
const activePromptLabel = computed(() => {
  const current = promptVersions.value.find((item) => item.id === selectedPromptVersionId.value)
  return current ? `V${current.version}` : '-'
})
const olderBatches = computed(() => batches.value.slice(1, 6))

function stateClass(status: BatchItem['status'] | BatchItem['sourceItems'][number]['status']) {
  if (status === 'completed') return 'pm-state--ok'
  if (status === 'failed') return 'pm-state--err'
  if (status === 'partial_failed') return 'pm-state--warn'
  if (status === 'processing') return 'pm-state--run'
  return ''
}

function batchProgress(batch: BatchItem) {
  if (!batch.totalVideos) return 0
  return Math.round(((batch.completedVideos + batch.failedVideos) / batch.totalVideos) * 100)
}

function fileName(path: string) {
  return String(path || '').split(/[\\/]/).pop() || path
}

function removePickedVideo(path: string) {
  pickedVideos.value = pickedVideos.value.filter((item) => item !== path)
}

function setLibraryCategory(value: 'all' | Category) {
  filterCategory.value = value
  void loadAll()
}

function setLibraryUsage(value: 'all' | UsageStatus) {
  filterUsageStatus.value = value
  void loadAll()
}

const canSubmit = computed(() => pickedVideos.value.length > 0 && !submitting.value)
const downloadableParserVideos = computed(() =>
  parserVideos.value.filter((item) => item.status === 'completed' && item.localVideoPath),
)
const parserVideoTotalPages = computed(() => Math.max(1, Math.ceil(downloadableParserVideos.value.length / parserVideoPageSize.value)))
const pagedDownloadableParserVideos = computed(() => {
  const start = (parserVideoPage.value - 1) * parserVideoPageSize.value
  return downloadableParserVideos.value.slice(start, start + parserVideoPageSize.value)
})
const canSubmitDownloadedBatch = computed(() => selectedParserVideoIds.value.length > 0 && !submitting.value)

const filteredMaterials = computed(() =>
  materials.value.filter((item) => {
    if (item.materialOrigin !== 'derived') return false
    if (filterCategory.value !== 'all' && item.category !== filterCategory.value) return false
    if (filterUsageStatus.value !== 'all' && item.usageStatus !== filterUsageStatus.value) return false
    return true
  }),
)
const derivedMaterialCount = computed(() => materials.value.filter((item) => item.materialOrigin === 'derived').length)
const backgroundSourceMaterials = computed(() => materials.value.filter((item) => item.materialOrigin !== 'derived'))
const libraryTotalPages = computed(() => Math.max(1, Math.ceil(filteredMaterials.value.length / libraryPageSize.value)))
const backgroundTotalPages = computed(() => Math.max(1, Math.ceil(backgroundSourceMaterials.value.length / libraryPageSize.value)))
const pagedMaterials = computed(() => {
  const start = (libraryPage.value - 1) * libraryPageSize.value
  return filteredMaterials.value.slice(start, start + libraryPageSize.value)
})
const pagedBackgroundMaterials = computed(() => {
  const start = (backgroundPage.value - 1) * libraryPageSize.value
  return backgroundSourceMaterials.value.slice(start, start + libraryPageSize.value)
})
const selectedVisibleCount = computed(() => pagedMaterials.value.filter((item) => selectedMaterialIds.value.includes(item.id)).length)
const allVisibleSelected = computed(() => pagedMaterials.value.length > 0 && selectedVisibleCount.value === pagedMaterials.value.length)
const selectedBackgroundVisibleCount = computed(() =>
  pagedBackgroundMaterials.value.filter((item) => selectedBackgroundMaterialIds.value.includes(item.id)).length,
)
const allBackgroundVisibleSelected = computed(
  () => pagedBackgroundMaterials.value.length > 0 && selectedBackgroundVisibleCount.value === pagedBackgroundMaterials.value.length,
)
const backgroundTotalOutput = computed(() => selectedBackgroundMaterialIds.value.length * Math.max(1, Math.floor(backgroundMaterialCount.value || 1)))
const selectedDownloadedVideos = computed(() =>
  downloadableParserVideos.value.filter((item) => selectedParserVideoIds.value.includes(item.id)),
)

const latestBatch = computed(() => batches.value[0] || null)

function formatDateTime(value: number) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function categoryLabel(value: Category | 'all') {
  if (locale.value === 'zh-CN') {
    if (value === 'all') return '全部'
    if (value === 'necklace') return '项链'
    if (value === 'ring') return '戒指'
    if (value === 'earring') return '耳环'
    return '手链'
  }
  if (locale.value === 'vi-VN') {
    if (value === 'all') return 'Tat ca'
    if (value === 'necklace') return 'Day chuyen'
    if (value === 'ring') return 'Nhan'
    if (value === 'earring') return 'Bong tai'
    return 'Vong tay'
  }
  if (value === 'all') return 'All'
  if (value === 'necklace') return 'Necklace'
  if (value === 'ring') return 'Ring'
  if (value === 'earring') return 'Earring'
  return 'Bracelet'
}

function batchStatusLabel(status: BatchItem['status']) {
  if (locale.value === 'zh-CN') {
    if (status === 'queued') return '排队中'
    if (status === 'processing') return '处理中'
    if (status === 'completed') return '已完成'
    if (status === 'partial_failed') return '部分失败'
    return '失败'
  }
  if (locale.value === 'vi-VN') {
    if (status === 'queued') return 'Dang doi'
    if (status === 'processing') return 'Dang xu ly'
    if (status === 'completed') return 'Hoan thanh'
    if (status === 'partial_failed') return 'Loi mot phan'
    return 'That bai'
  }
  if (status === 'queued') return 'Queued'
  if (status === 'processing') return 'Processing'
  if (status === 'completed') return 'Completed'
  if (status === 'partial_failed') return 'Partial Failed'
  return 'Failed'
}

function sourceStatusLabel(status: BatchItem['sourceItems'][number]['status']) {
  if (locale.value === 'zh-CN') {
    if (status === 'queued') return '排队中'
    if (status === 'processing') return '处理中'
    if (status === 'completed') return '已完成'
    return '失败'
  }
  if (locale.value === 'vi-VN') {
    if (status === 'queued') return 'Dang doi'
    if (status === 'processing') return 'Dang xu ly'
    if (status === 'completed') return 'Hoan thanh'
    return 'That bai'
  }
  if (status === 'queued') return 'Queued'
  if (status === 'processing') return 'Processing'
  if (status === 'completed') return 'Completed'
  return 'Failed'
}

function shortMaterialId(id: string) {
  const value = String(id || '').trim()
  if (!value) return '-'
  return value.length > 10 ? value.slice(0, 10) : value
}

function materialOriginLabel(value?: MaterialItem['materialOrigin']) {
  return value === 'derived' ? generationCopy.value.derived : generationCopy.value.original
}

function backgroundMaterialTitle(item: MaterialItem) {
  if (item.materialOrigin === 'derived') {
    const source = shortMaterialId(item.derivedFromMaterialId || '')
    return `${generationCopy.value.derivedFrom} ${source}`
  }
  return `${copy.value.segment} ${item.segmentIndex + 1}`
}

async function loadAll() {
  if (loadAllInFlight) return
  loadAllInFlight = true
  loading.value = true
  try {
    const [nextCategories, nextBatches, nextMaterials, nextProducts, nextParserVideos] = await Promise.all([
      window.api.productImageMaterials.listCategories() as Promise<Category[]>,
      window.api.productImageMaterials.listBatches({ userId: DESKTOP_USER_ID }) as Promise<BatchItem[]>,
      window.api.productImageMaterials.listMaterials({
        userId: DESKTOP_USER_ID,
        filters: {
          category: filterCategory.value,
          usageStatus: filterUsageStatus.value,
        },
      }) as Promise<MaterialItem[]>,
      window.api.productImageMaterials.listProducts() as Promise<ProductItem[]>,
      window.api.videoParserDownload.listItems({ userId: DESKTOP_USER_ID }) as Promise<ParserVideoItem[]>,
    ])
    categories.value = nextCategories
    batches.value = nextBatches
    materials.value = nextMaterials
    products.value = nextProducts
    parserVideos.value = nextParserVideos
    const validIds = new Set(nextMaterials.map((item) => item.id))
    selectedMaterialIds.value = selectedMaterialIds.value.filter((item) => validIds.has(item))
    selectedBackgroundMaterialIds.value = selectedBackgroundMaterialIds.value.filter((item) => validIds.has(item))
    const validParserIds = new Set(nextParserVideos.filter((item) => item.status === 'completed' && item.localVideoPath).map((item) => item.id))
    selectedParserVideoIds.value = selectedParserVideoIds.value.filter((item) => validParserIds.has(item))
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    loading.value = false
    loadAllInFlight = false
  }
}

async function loadPromptManagement() {
  const versions = await window.api.productImageMaterials.listPromptVersions() as PromptVersion[]
  promptVersions.value = Array.isArray(versions) ? versions : []
  const selected = promptVersions.value.find((item) => item.id === selectedPromptVersionId.value)
    || promptVersions.value.find((item) => item.active)
    || promptVersions.value[0]
  if (selected) {
    selectedPromptVersionId.value = selected.id
    promptVersionName.value = selected.name
    promptText.value = selected.prompt
  }
}

function selectPromptVersion() {
  const selected = promptVersions.value.find((item) => item.id === selectedPromptVersionId.value)
  if (!selected) return
  promptVersionName.value = selected.name
  promptText.value = selected.prompt
}

async function savePromptVersion(copyVersion = false) {
  promptBusy.value = true
  errorText.value = ''
  try {
    const selected = promptVersions.value.find((item) => item.id === selectedPromptVersionId.value)
    const saved = await window.api.productImageMaterials.savePromptVersion({
      id: copyVersion ? undefined : selected?.id,
      name: promptVersionName.value,
      prompt: promptText.value,
    }) as PromptVersion
    await loadPromptManagement()
    selectedPromptVersionId.value = saved.id
    selectPromptVersion()
    notice.value = `${promptUi.value.saved} V${saved.version}`
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    promptBusy.value = false
  }
}

async function activatePromptVersion() {
  if (!selectedPromptVersionId.value) return
  promptBusy.value = true
  try {
    await window.api.productImageMaterials.activatePromptVersion(selectedPromptVersionId.value)
    await loadPromptManagement()
    notice.value = promptUi.value.activated
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    promptBusy.value = false
  }
}

async function rollbackPromptVersion() {
  if (!selectedPromptVersionId.value) return
  promptBusy.value = true
  try {
    const saved = await window.api.productImageMaterials.rollbackPromptVersion(selectedPromptVersionId.value) as PromptVersion
    await loadPromptManagement()
    selectedPromptVersionId.value = saved.id
    selectPromptVersion()
    notice.value = `${promptUi.value.restored} V${saved.version}`
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    promptBusy.value = false
  }
}

async function pickSourceImage() {
  const paths = await window.api.pickFiles({
    title: promptUi.value.pickSourceTitle,
    filters: [{ name: promptUi.value.imageFilter, extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    multiple: true,
  })
  if (Array.isArray(paths)) addSourceImages(paths)
}

async function pickSourceImageFromAssetLibrary() {
  const selected = await openAssetLibraryPicker({ type: 'image', multiple: true, usagePlugin: ASSET_USAGE_PLUGIN })
  if (selected?.length) addSourceImages(selected.map((item) => item.filePath))
}

function addSourceImages(paths: string[]) {
  const next = [...sourceImagePaths.value]
  for (const path of paths) if (path && !next.includes(path)) next.push(path)
  sourceImagePaths.value = next
}

function removeSourceImage(path: string) {
  sourceImagePaths.value = sourceImagePaths.value.filter((item) => item !== path)
}

function clearSourceImage() {
  sourceImagePaths.value = []
}

async function generateFromUploadedImage() {
  if (!sourceImagePaths.value.length || imageGenerating.value) return
  const paths = [...sourceImagePaths.value]
  imageGenerating.value = true
  imageGenerateProgress.value = { done: 0, total: paths.length }
  errorText.value = ''
  notice.value = ''
  let generated = 0
  const failures: string[] = []
  try {
    for (const path of paths) {
      try {
        const result = await window.api.productImageMaterials.createImageVariants({
          userId: DESKTOP_USER_ID,
          sourceImagePath: path,
          category: imageCategory.value,
          variantCount: Math.max(1, Math.min(6, Math.floor(Number(imageVariantCount.value || 1)))),
          promptVersionId: selectedPromptVersionId.value,
          prompt: promptText.value,
        })
        generated += Number(result?.count || 0)
        // Successful sources leave the list, so a retry only re-runs the failed ones.
        removeSourceImage(path)
      } catch (error: any) {
        failures.push(`${fileBaseName(path)}: ${error?.message ?? String(error)}`)
      }
      imageGenerateProgress.value = { ...imageGenerateProgress.value, done: imageGenerateProgress.value.done + 1 }
    }
    if (generated) notice.value = `${generationCopy.value.success} ${generated}`
    if (failures.length) errorText.value = `${uiText.value.sourceFailed} ${failures.join('; ')}`
    await loadAll()
  } finally {
    imageGenerating.value = false
  }
}

function toggleMaterialSelection(materialId: string) {
  const next = new Set(selectedMaterialIds.value)
  if (next.has(materialId)) next.delete(materialId)
  else next.add(materialId)
  selectedMaterialIds.value = Array.from(next)
}

function toggleBackgroundMaterialSelection(materialId: string) {
  const next = new Set(selectedBackgroundMaterialIds.value)
  if (next.has(materialId)) next.delete(materialId)
  else next.add(materialId)
  selectedBackgroundMaterialIds.value = Array.from(next)
}

function toggleSelectAllVisible() {
  if (allVisibleSelected.value) {
    const visibleIds = new Set(pagedMaterials.value.map((item) => item.id))
    selectedMaterialIds.value = selectedMaterialIds.value.filter((item) => !visibleIds.has(item))
    return
  }
  const next = new Set(selectedMaterialIds.value)
  pagedMaterials.value.forEach((item) => next.add(item.id))
  selectedMaterialIds.value = Array.from(next)
}

function clearSelectedMaterials() {
  selectedMaterialIds.value = []
}

function toggleSelectAllBackgroundVisible() {
  if (allBackgroundVisibleSelected.value) {
    const visibleIds = new Set(pagedBackgroundMaterials.value.map((item) => item.id))
    selectedBackgroundMaterialIds.value = selectedBackgroundMaterialIds.value.filter((item) => !visibleIds.has(item))
    return
  }
  const next = new Set(selectedBackgroundMaterialIds.value)
  pagedBackgroundMaterials.value.forEach((item) => next.add(item.id))
  selectedBackgroundMaterialIds.value = Array.from(next)
}

function clearSelectedBackgroundMaterials() {
  selectedBackgroundMaterialIds.value = []
}

watch([filterCategory, filterUsageStatus], () => {
  libraryPage.value = 1
})

watch([filteredMaterials, libraryPageSize], () => {
  if (libraryPage.value > libraryTotalPages.value) {
    libraryPage.value = libraryTotalPages.value
  }
})

watch([backgroundSourceMaterials, libraryPageSize], () => {
  if (backgroundPage.value > backgroundTotalPages.value) {
    backgroundPage.value = backgroundTotalPages.value
  }
})

watch([downloadableParserVideos, parserVideoPageSize], () => {
  if (parserVideoPage.value > parserVideoTotalPages.value) {
    parserVideoPage.value = parserVideoTotalPages.value
  }
})

watch(batchSourceMode, (value) => {
  if (value === 'downloaded') {
    parserVideoPage.value = 1
  }
})

async function pickVideos() {
  const files = await window.api.pickFiles({
    title: copy.value.selectSourceVideos,
    multiple: true,
    filters: [{ name: copy.value.videoFilter, extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
  })
  pickedVideos.value = Array.from(new Set((files || []).map(String).filter(Boolean)))
}

async function pickVideosFromAssetLibrary() {
  const selected = await openAssetLibraryPicker({ type: 'video', multiple: true, usagePlugin: ASSET_USAGE_PLUGIN })
  if (!selected?.length) return
  pickedVideos.value = Array.from(new Set([...pickedVideos.value, ...selected.map((item) => item.filePath)]))
}

function toggleParserVideoSelection(videoId: string) {
  const next = new Set(selectedParserVideoIds.value)
  if (next.has(videoId)) next.delete(videoId)
  else next.add(videoId)
  selectedParserVideoIds.value = Array.from(next)
}

function parserVideoThumb(item: ParserVideoItem) {
  const text = String(item.thumbnailPath || '').trim()
  return text ? `vg://file?path=${encodeURIComponent(text)}` : ''
}

function parserVideoLabel(item: ParserVideoItem) {
  return String(item.title || item.author || item.videoId || copy.value.downloadedVideo).trim()
}

function materialPreviewSrc(item: MaterialItem) {
  const localPath = String(item.localImagePath || '').trim()
  if (localPath) return `vg://file?path=${encodeURIComponent(localPath)}`
  return String(item.qiniuUrl || '').trim()
}

function openMaterialPreview(item: MaterialItem) {
  const src = materialPreviewSrc(item)
  if (!src) return
  previewSrc.value = src
  previewTitle.value = `${categoryLabel(item.category)} · ${shortMaterialId(item.id)}`
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
  previewSrc.value = null
  previewTitle.value = ''
}

async function submitBatch() {
  const useDownloaded = batchSourceMode.value === 'downloaded'
  if ((useDownloaded && !canSubmitDownloadedBatch.value) || (!useDownloaded && !canSubmit.value)) return
  submitting.value = true
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.productImageMaterials.createBatch({
      userId: DESKTOP_USER_ID,
      category: selectedCategory.value,
      sourceVideoPaths: useDownloaded ? [] : Array.from(pickedVideos.value),
      parserVideoIds: useDownloaded ? Array.from(selectedParserVideoIds.value) : [],
    })
    pickedVideos.value = []
    selectedParserVideoIds.value = []
    notice.value = copy.value.createdQueued
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    submitting.value = false
  }
}

async function retryBatch(batchId: string) {
  actionBusyId.value = batchId
  errorText.value = ''
  try {
    await window.api.productImageMaterials.retryBatch({ userId: DESKTOP_USER_ID, batchId })
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusyId.value = ''
  }
}

async function setUsageStatus(materialId: string, usageStatus: UsageStatus) {
  actionBusyId.value = materialId
  errorText.value = ''
  try {
    await window.api.productImageMaterials.updateUsageStatus({
      userId: DESKTOP_USER_ID,
      materialId,
      usageStatus,
    })
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusyId.value = ''
  }
}

async function bindProduct(materialId: string, productId: string) {
  actionBusyId.value = materialId
  errorText.value = ''
  try {
    await window.api.productImageMaterials.bindProduct({
      userId: DESKTOP_USER_ID,
      materialId,
      productId: productId || undefined,
    })
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusyId.value = ''
  }
}

async function deleteMaterial(materialId: string) {
  if (!window.confirm(copy.value.deleteConfirm)) return
  actionBusyId.value = materialId
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.productImageMaterials.deleteMaterial({
      userId: DESKTOP_USER_ID,
      materialId,
    })
    selectedMaterialIds.value = selectedMaterialIds.value.filter((item) => item !== materialId)
    notice.value = copy.value.deleted
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusyId.value = ''
  }
}

async function deleteSelectedMaterials() {
  const materialIds = selectedMaterialIds.value.filter(Boolean)
  if (!materialIds.length) return
  if (!window.confirm(batchDeleteCopy.value.confirm)) return
  actionBusyId.value = 'delete-materials'
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.productImageMaterials.deleteMaterials({
      userId: DESKTOP_USER_ID,
      materialIds,
    })
    selectedMaterialIds.value = []
    notice.value = batchDeleteCopy.value.success
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusyId.value = ''
  }
}

async function exportSelectedMaterials() {
  const materialIds = selectedMaterialIds.value.filter(Boolean)
  if (!materialIds.length) return
  const outputDir = await window.api.pickDir({ title: libraryBatchCopy.value.exportPickDir })
  if (!outputDir) return
  actionBusyId.value = 'export-materials'
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.productImageMaterials.exportMaterials({
      userId: DESKTOP_USER_ID,
      materialIds,
      outputDir,
    })
    notice.value = libraryBatchCopy.value.exportSuccess
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusyId.value = ''
  }
}

async function exportSelectedBackgroundMaterials() {
  const materialIds = selectedBackgroundMaterialIds.value.filter(Boolean)
  if (!materialIds.length) return
  const outputDir = await window.api.pickDir({ title: libraryBatchCopy.value.exportPickDir })
  if (!outputDir) return
  actionBusyId.value = 'export-background-materials'
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.productImageMaterials.exportMaterials({
      userId: DESKTOP_USER_ID,
      materialIds,
      outputDir,
    })
    notice.value = libraryBatchCopy.value.exportSuccess
    selectedBackgroundMaterialIds.value = []
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusyId.value = ''
  }
}

async function generateBackgroundVariants() {
  const materialIds = selectedBackgroundMaterialIds.value.filter(Boolean)
  if (!materialIds.length) return
  backgroundSubmitting.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const result = await window.api.productImageMaterials.createBackgroundVariants({
      userId: DESKTOP_USER_ID,
      materialIds,
      variantCount: Math.max(1, Math.min(6, Math.floor(Number(backgroundMaterialCount.value || 1)))),
      promptVersionId: selectedPromptVersionId.value,
      prompt: promptText.value,
    })
    selectedBackgroundMaterialIds.value = []
    notice.value = `${generationCopy.value.success} ${result.count}`
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    backgroundSubmitting.value = false
  }
}

function openPublicUrl(url: string) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function showInFolder(path: string) {
  if (!path) return
  await window.api.shell.showItemInFolder(path)
}

onMounted(async () => {
  await loadAll()
  await loadPromptManagement().catch((error) => { errorText.value = error?.message ?? String(error) })
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'hidden' || loadAllInFlight) return
    const hasActiveWork = batches.value.some((item) => item.status === 'queued' || item.status === 'processing')
      || parserVideos.value.some((item) => item.status === 'processing')
    if (!hasActiveWork) return
    void loadAll()
  }, 8000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="vg-scope pm">
    <!-- ============ head + tabs ============ -->
    <section class="pm-top">
      <header class="pm-head">
        <div class="pm-head__icon"><Sparkles :size="20" /></div>
        <div class="pm-head__text">
          <h1 data-testid="product-image-materials-title">{{ copy.pluginName }}</h1>
          <p>{{ copy.workspaceHint }}</p>
        </div>
        <div class="pm-head__actions">
          <button class="vg-btn" data-testid="product-image-materials-back" type="button" @click="router.push('/plugins')">
            <ChevronLeft :size="15" />{{ copy.backPlugin }}
          </button>
          <button class="vg-btn" data-testid="product-image-materials-refresh" type="button" :disabled="loading" @click="loadAll">
            <RefreshCcw :size="14" :class="{ 'vg-spin': loading }" />{{ copy.refresh }}
          </button>
        </div>
      </header>

      <nav class="pm-tabs" role="tablist">
        <button class="pm-tab" :class="{ 'is-active': activeTab === 'batch' }" data-tab="batch" role="tab" type="button" @click="activeTab = 'batch'">
          <Film :size="15" />{{ copy.batchTab }}
        </button>
        <button class="pm-tab" :class="{ 'is-active': activeTab === 'image-to-image' }" data-tab="image-to-image" role="tab" type="button" @click="activeTab = 'image-to-image'">
          <Wand2 :size="15" />{{ copy.imageToImageTab }}
        </button>
        <button class="pm-tab" :class="{ 'is-active': activeTab === 'background' }" data-tab="background" role="tab" type="button" @click="activeTab = 'background'">
          <ImageIcon :size="15" />{{ generationCopy.tab }}<em>{{ backgroundSourceMaterials.length }}</em>
        </button>
        <button class="pm-tab" :class="{ 'is-active': activeTab === 'library' }" data-tab="library" role="tab" type="button" @click="activeTab = 'library'">
          <Layers :size="15" />{{ libraryDisplayCopy.tab }}<em>{{ derivedMaterialCount }}</em>
        </button>
      </nav>
    </section>

    <div v-if="notice" class="vg-notice vg-notice--accent pm-flash">
      <CircleCheck :size="15" /><span>{{ notice }}</span>
      <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="notice = ''"><X :size="13" /></button>
    </div>
    <div v-if="errorText" class="vg-notice vg-notice--danger pm-flash">
      <TriangleAlert :size="15" /><span>{{ errorText }}</span>
      <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="errorText = ''"><X :size="13" /></button>
    </div>

    <!-- ============ 拆解视频 ============ -->
    <div v-if="activeTab === 'batch'" class="pm-split">
      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">1</span>
          <div class="pm-card__title">
            <h2>{{ copy.createBatch }}</h2>
            <p>{{ copy.createBatchDesc }}</p>
          </div>
        </header>

        <div class="pm-field">
          <span class="pm-field__label">{{ copy.category }}</span>
          <div class="pm-seg pm-seg--full">
            <button v-for="item in categories" :key="item" type="button" :class="{ 'is-on': selectedCategory === item }" @click="selectedCategory = item">
              {{ categoryLabel(item) }}
            </button>
          </div>
        </div>

        <div class="pm-field">
          <span class="pm-field__label">{{ uiText.source }}</span>
          <div class="pm-source">
            <button class="pm-source__opt" :class="{ 'is-on': batchSourceMode === 'upload' }" type="button" @click="batchSourceMode = 'upload'">
              <CloudUpload :size="16" />
              <span>{{ copy.uploadMyVideo }}</span>
            </button>
            <button class="pm-source__opt" :class="{ 'is-on': batchSourceMode === 'downloaded' }" type="button" @click="batchSourceMode = 'downloaded'">
              <Download :size="16" />
              <span>{{ copy.chooseDownloadedVideo }}</span>
              <em>{{ downloadableParserVideos.length }}</em>
            </button>
          </div>
        </div>

        <template v-if="batchSourceMode === 'upload'">
          <button class="pm-drop" type="button" @click="pickVideos">
            <span class="pm-drop__icon"><CloudUpload :size="22" /></span>
            <strong>{{ copy.pickZoneTitle }}</strong>
            <span>{{ copy.pickZoneDesc }}</span>
            <small>{{ copy.pickZoneFormats }}</small>
          </button>

          <div class="pm-row">
            <button class="vg-btn" data-testid="product-image-materials-local-videos" type="button" @click="pickVideos">
              <FolderOpen :size="15" />{{ copy.pickVideos }}
            </button>
            <button class="vg-btn" data-testid="product-image-materials-library-videos" type="button" @click="pickVideosFromAssetLibrary">
              <Images :size="15" />{{ copy.pickAssetVideos }}
            </button>
          </div>

          <div class="pm-files" data-testid="product-image-materials-picked">
            <div v-if="!pickedVideos.length" class="pm-files__empty">{{ copy.noVideosSelected }}</div>
            <div v-for="item in pickedVideos" :key="item" class="pm-file">
              <FileVideo :size="15" class="pm-file__icon" />
              <button class="pm-file__name" type="button" :title="item" @click="showInFolder(item)">{{ fileName(item) }}</button>
              <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" :title="uiText.remove" :aria-label="uiText.remove" @click="removePickedVideo(item)">
                <X :size="13" />
              </button>
            </div>
          </div>

          <footer class="pm-card__foot">
            <span class="vg-muted">{{ uiText.selected }} <b class="vg-num">{{ pickedVideos.length }}</b> {{ uiText.videos }}</span>
            <button class="vg-btn vg-btn--primary" data-testid="product-image-materials-queue" type="button" :disabled="!canSubmit" @click="submitBatch">
              <RefreshCcw v-if="submitting" :size="15" class="vg-spin" />
              <ListPlus v-else :size="15" />
              {{ copy.queueBatch }}
            </button>
          </footer>
        </template>

        <template v-else>
          <div v-if="!downloadableParserVideos.length" class="vg-empty pm-empty">
            <span class="vg-empty__icon"><Download :size="22" /></span>
            <p>{{ copy.noDownloadedVideos }}</p>
          </div>
          <template v-else>
            <div class="pm-videos">
              <button
                v-for="item in pagedDownloadableParserVideos"
                :key="item.id"
                class="pm-video"
                :class="{ 'is-on': selectedParserVideoIds.includes(item.id) }"
                type="button"
                @click="toggleParserVideoSelection(item.id)"
              >
                <span class="pm-video__thumb">
                  <img v-if="parserVideoThumb(item)" :src="parserVideoThumb(item)" alt="" loading="lazy" decoding="async" />
                  <Film v-else :size="20" />
                  <span class="pm-video__check"><Check v-if="selectedParserVideoIds.includes(item.id)" :size="12" :stroke-width="3" /></span>
                  <span v-if="item.usedStatus === 'used'" class="pm-video__used">{{ copy.used }}</span>
                </span>
                <span class="pm-video__body">
                  <strong :title="parserVideoLabel(item)">{{ parserVideoLabel(item) }}</strong>
                  <small>{{ item.author || item.videoId }}</small>
                </span>
              </button>
            </div>
            <MaterialPager
              v-if="downloadableParserVideos.length > 8"
              v-model:page="parserVideoPage"
              v-model:page-size="parserVideoPageSize"
              :total-pages="parserVideoTotalPages"
              :total="downloadableParserVideos.length"
              :sizes="[8, 12, 16, 24]"
              :labels="paginationCopy"
            />
          </template>

          <footer class="pm-card__foot">
            <span class="vg-muted">{{ uiText.selected }} <b class="vg-num">{{ selectedDownloadedVideos.length }}</b> {{ uiText.videos }}</span>
            <div class="pm-row">
              <button v-if="selectedDownloadedVideos.length" class="vg-btn vg-btn--ghost" type="button" @click="selectedParserVideoIds = []">{{ libraryBatchCopy.clearSelection }}</button>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="!canSubmitDownloadedBatch" @click="submitBatch">
                <RefreshCcw v-if="submitting" :size="15" class="vg-spin" />
                <ListPlus v-else :size="15" />
                {{ copy.queueBatch }}
              </button>
            </div>
          </footer>
        </template>
      </section>

      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">2</span>
          <div class="pm-card__title">
            <h2>{{ copy.queue }}</h2>
            <p>{{ copy.queueDesc }}</p>
          </div>
          <button class="vg-icon-btn" type="button" :title="copy.refresh" :aria-label="copy.refresh" :disabled="loading" @click="loadAll">
            <RefreshCcw :size="15" :class="{ 'vg-spin': loading }" />
          </button>
        </header>

        <div v-if="loading && !batches.length" class="vg-empty pm-empty"><RefreshCcw :size="20" class="vg-spin" /><p>{{ copy.loadingBatches }}</p></div>
        <div v-else-if="!latestBatch" class="vg-empty pm-empty">
          <span class="vg-empty__icon"><Boxes :size="22" /></span>
          <h3>{{ copy.noBatches }}</h3>
          <p>{{ uiText.queueEmpty }}</p>
        </div>
        <template v-else>
          <article class="pm-batch">
            <div class="pm-batch__head">
              <div class="pm-batch__title">
                <span class="vg-chip">{{ categoryLabel(latestBatch.category) }}</span>
                <strong class="vg-num">{{ formatDateTime(latestBatch.updatedAt) }}</strong>
              </div>
              <span class="pm-state" :class="stateClass(latestBatch.status)"><i />{{ batchStatusLabel(latestBatch.status) }}</span>
            </div>

            <div class="vg-progress">
              <div class="vg-progress__bar">
                <div class="vg-progress__fill" :class="{ 'vg-progress__fill--fail': latestBatch.status === 'failed' }" :style="{ width: `${batchProgress(latestBatch)}%` }" />
              </div>
              <span>{{ batchProgress(latestBatch) }}%</span>
            </div>

            <div class="pm-metrics">
              <div class="pm-metric">
                <span>{{ copy.total }}</span>
                <strong>{{ latestBatch.totalVideos }}</strong>
              </div>
              <div class="pm-metric pm-metric--ok">
                <span>{{ copy.done }}</span>
                <strong>{{ latestBatch.completedVideos }}</strong>
              </div>
              <div class="pm-metric" :class="{ 'pm-metric--err': latestBatch.failedVideos > 0 }">
                <span>{{ copy.failed }}</span>
                <strong>{{ latestBatch.failedVideos }}</strong>
              </div>
              <div class="pm-metric">
                <span>{{ copy.images }}</span>
                <strong>{{ latestBatch.generatedImageCount }}</strong>
              </div>
            </div>

            <div class="pm-files pm-files--flat">
              <div v-for="item in latestBatch.sourceItems" :key="item.id" class="pm-file pm-file--queue">
                <FileVideo :size="15" class="pm-file__icon" />
                <div class="pm-file__main">
                  <span class="pm-file__text" :title="item.sourceVideoName">{{ item.sourceVideoName }}</span>
                  <small v-if="item.error" class="pm-file__err" :title="item.error">{{ item.error }}</small>
                  <small v-else class="vg-num">{{ copy.images }} {{ item.generatedCount }} · {{ copy.skipped }} {{ item.skippedCount }}</small>
                </div>
                <span class="pm-state" :class="stateClass(item.status)"><i />{{ sourceStatusLabel(item.status) }}</span>
              </div>
            </div>

            <div v-if="latestBatch.status === 'failed' || latestBatch.status === 'partial_failed'" class="pm-row pm-row--end">
              <button class="vg-btn vg-btn--sm vg-btn--danger" type="button" :disabled="actionBusyId === latestBatch.id" @click="retryBatch(latestBatch.id)">
                <RotateCcw :size="13" />{{ copy.retryFailed }}
              </button>
            </div>
          </article>

          <div v-if="olderBatches.length" class="pm-history">
            <div class="pm-history__title">{{ uiText.history }}</div>
            <div v-for="item in olderBatches" :key="item.id" class="pm-history__row">
              <span class="vg-chip">{{ categoryLabel(item.category) }}</span>
              <span class="vg-num pm-history__time">{{ formatDateTime(item.updatedAt) }}</span>
              <span class="vg-num vg-muted">{{ item.completedVideos }}/{{ item.totalVideos }} · {{ item.generatedImageCount }} {{ uiText.imagesUnit }}</span>
              <span class="pm-state" :class="stateClass(item.status)"><i />{{ batchStatusLabel(item.status) }}</span>
              <button v-if="item.status === 'failed' || item.status === 'partial_failed'" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="copy.retryFailed" :disabled="actionBusyId === item.id" @click="retryBatch(item.id)">
                <RotateCcw :size="13" />
              </button>
            </div>
          </div>

          <div class="vg-notice pm-tip">
            <ShieldCheck :size="15" />
            <span>{{ copy.queueTip }}</span>
          </div>
        </template>
      </section>
    </div>

    <!-- ============ 图生图 ============ -->
    <div v-else-if="activeTab === 'image-to-image'" class="pm-split pm-split--i2i">
      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">1</span>
          <div class="pm-card__title">
            <h2>{{ promptUi.source }}</h2>
            <p>{{ generationCopy.hint }}</p>
          </div>
        </header>

        <div class="pm-source-img" :class="{ 'has-image': sourceImagePaths.length }">
          <button v-if="!sourceImagePaths.length" class="pm-source-img__preview" data-testid="product-image-materials-source-preview" type="button" @click="pickSourceImage">
            <span class="pm-source-img__empty">
              <span class="pm-drop__icon"><ImagePlus :size="22" /></span>
              <strong>{{ promptUi.empty }}</strong>
              <small>{{ promptUi.sourceHint }} · {{ uiText.sourceMultiHint }}</small>
            </span>
          </button>
          <div v-else class="pm-source-grid" data-testid="product-image-materials-source-grid">
            <div v-for="path in sourceImagePaths" :key="path" class="pm-source-grid__item" :title="path">
              <img :src="filePreviewSrc(path)" :alt="fileBaseName(path)" />
              <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger pm-source-grid__remove" type="button" :disabled="imageGenerating" :title="uiText.remove" :aria-label="uiText.remove" @click="removeSourceImage(path)">
                <X :size="12" />
              </button>
            </div>
            <button class="pm-source-grid__add" type="button" :disabled="imageGenerating" :title="uiText.addMore" @click="pickSourceImage">
              <ImagePlus :size="18" /><small>{{ uiText.addMore }}</small>
            </button>
          </div>
          <div v-if="sourceImagePaths.length" class="pm-source-img__bar">
            <ImageIcon :size="14" />
            <span>{{ uiText.sourceCount.replace('{n}', String(sourceImagePaths.length)) }}</span>
            <button class="vg-btn vg-btn--sm vg-btn--ghost" data-testid="product-image-materials-clear-image" type="button" :disabled="imageGenerating" @click="clearSourceImage">
              <X :size="13" />{{ uiText.clearAll }}
            </button>
          </div>
        </div>

        <div class="pm-row pm-row--fill">
          <button class="vg-btn" data-testid="product-image-materials-local-image" type="button" @click="pickSourceImage">
            <CloudUpload :size="15" /><span>{{ promptUi.localUpload }}</span>
          </button>
          <button class="vg-btn" data-testid="product-image-materials-library-image" type="button" @click="pickSourceImageFromAssetLibrary">
            <Images :size="15" /><span>{{ promptUi.assetLibrary }}</span>
          </button>
        </div>

        <div class="pm-field">
          <span class="pm-field__label">{{ promptUi.category }}</span>
          <div class="pm-seg pm-seg--full">
            <button v-for="item in categories" :key="item" type="button" :class="{ 'is-on': imageCategory === item }" @click="imageCategory = item">{{ categoryLabel(item) }}</button>
          </div>
        </div>
        <div class="pm-field">
          <span class="pm-field__label">{{ promptUi.count }}</span>
          <div class="pm-seg pm-seg--full">
            <button v-for="n in 6" :key="n" type="button" :class="{ 'is-on': imageVariantCount === n }" @click="imageVariantCount = n">{{ n }}</button>
          </div>
        </div>

        <button class="vg-btn vg-btn--primary vg-btn--lg vg-btn--block" data-testid="product-image-materials-generate" type="button" :disabled="!sourceImagePaths.length || imageGenerating" @click="generateFromUploadedImage">
          <RefreshCcw v-if="imageGenerating" :size="16" class="vg-spin" />
          <Wand2 v-else :size="16" />
          {{ promptUi.generate }}
          <em v-if="imageGenerating" class="pm-btn-count">{{ imageGenerateProgress.done }}/{{ imageGenerateProgress.total }}</em>
          <em v-else class="pm-btn-count">{{ sourceImagePaths.length > 1 ? `${sourceImagePaths.length} × ` : '× ' }}{{ imageVariantCount }}</em>
        </button>
      </section>

      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">2</span>
          <div class="pm-card__title">
            <h2>{{ promptUi.title }}</h2>
            <p>{{ uiText.promptDesc }}</p>
          </div>
        </header>
        <div class="vg-form-grid">
          <label class="vg-field">
            <span class="vg-field__label">{{ promptUi.version }}</span>
            <select v-model="selectedPromptVersionId" class="vg-select" @change="selectPromptVersion">
              <option v-for="version in promptVersions" :key="version.id" :value="version.id">V{{ version.version }} · {{ version.name }}{{ version.active ? ` · ${promptUi.active}` : '' }}</option>
            </select>
          </label>
          <label class="vg-field">
            <span class="vg-field__label">{{ promptUi.name }}</span>
            <input v-model="promptVersionName" class="vg-input" type="text" />
          </label>
        </div>
        <label class="vg-field pm-grow">
          <span class="vg-field__label">{{ promptUi.content }}</span>
          <textarea v-model="promptText" class="vg-textarea pm-prompt" rows="12" spellcheck="false" />
        </label>
        <footer class="pm-card__foot">
          <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="rollbackPromptVersion"><History :size="13" />{{ promptUi.rollback }}</button>
          <div class="pm-row">
            <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !promptText.trim()" @click="savePromptVersion(true)"><Copy :size="13" />{{ promptUi.copy }}</button>
            <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="activatePromptVersion"><CircleCheck :size="13" />{{ promptUi.activate }}</button>
            <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="savePromptVersion()"><Save :size="13" />{{ promptUi.update }}</button>
          </div>
        </footer>
      </section>
    </div>

    <!-- ============ 视频拆解图片库 ============ -->
    <section v-else-if="activeTab === 'background'" class="pm-card pm-card--flush">
      <header class="pm-bar">
        <div class="pm-bar__title">
          <h2>{{ generationCopy.tab }}</h2>
          <p>{{ generationCopy.desc }}</p>
        </div>
        <div class="pm-bar__tools">
          <span class="pm-inline-label">{{ generationCopy.materialCount }}</span>
          <div class="pm-seg">
            <button v-for="n in 6" :key="n" type="button" :class="{ 'is-on': backgroundMaterialCount === n }" @click="backgroundMaterialCount = n">{{ n }}</button>
          </div>
          <button class="vg-btn vg-btn--sm" :class="{ 'is-active': promptPanelOpen }" type="button" @click="promptPanelOpen = !promptPanelOpen">
            <SlidersHorizontal :size="13" />{{ promptUi.version }}
            <em class="pm-btn-count">{{ activePromptLabel }}</em>
          </button>
        </div>
      </header>

      <div v-if="promptPanelOpen" class="pm-prompt-panel">
        <div class="vg-form-grid">
          <label class="vg-field">
            <span class="vg-field__label">{{ promptUi.version }}</span>
            <select v-model="selectedPromptVersionId" class="vg-select" @change="selectPromptVersion">
              <option v-for="version in promptVersions" :key="version.id" :value="version.id">V{{ version.version }} · {{ version.name }}{{ version.active ? ` · ${promptUi.active}` : '' }}</option>
            </select>
          </label>
          <label class="vg-field">
            <span class="vg-field__label">{{ promptUi.name }}</span>
            <input v-model="promptVersionName" class="vg-input" type="text" />
          </label>
        </div>
        <label class="vg-field">
          <span class="vg-field__label">{{ promptUi.content }}</span>
          <textarea v-model="promptText" class="vg-textarea pm-prompt" rows="5" spellcheck="false" />
        </label>
        <div class="pm-row pm-row--end">
          <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="rollbackPromptVersion"><History :size="13" />{{ promptUi.rollback }}</button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !promptText.trim()" @click="savePromptVersion(true)"><Copy :size="13" />{{ promptUi.copy }}</button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="activatePromptVersion"><CircleCheck :size="13" />{{ promptUi.activate }}</button>
          <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="savePromptVersion()"><Save :size="13" />{{ promptUi.update }}</button>
        </div>
      </div>

      <div v-if="backgroundSourceMaterials.length" class="pm-selbar" :class="{ 'is-live': selectedBackgroundMaterialIds.length }">
        <label class="pm-check">
          <input type="checkbox" :checked="allBackgroundVisibleSelected" @change="toggleSelectAllBackgroundVisible" />
          <span>{{ libraryBatchCopy.selectAll }}</span>
        </label>
        <span class="vg-muted">{{ generationCopy.selected }} <b class="vg-num">{{ selectedBackgroundMaterialIds.length }}</b> · {{ generationCopy.totalOutput }} <b class="vg-num">{{ backgroundTotalOutput }}</b></span>
        <button v-if="selectedBackgroundMaterialIds.length" class="vg-link vg-link--muted" type="button" @click="clearSelectedBackgroundMaterials">{{ generationCopy.clearSelection }}</button>
        <span class="vg-toolbar__spacer" />
        <button
          class="vg-btn vg-btn--sm"
          type="button"
          :disabled="!selectedBackgroundMaterialIds.length || backgroundSubmitting || actionBusyId === 'export-background-materials'"
          @click="exportSelectedBackgroundMaterials"
        >
          <Download :size="13" />{{ libraryBatchCopy.exportSelected }}
        </button>
        <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="!selectedBackgroundMaterialIds.length || backgroundSubmitting" @click="generateBackgroundVariants">
          <RefreshCcw v-if="backgroundSubmitting" :size="13" class="vg-spin" />
          <Wand2 v-else :size="13" />
          {{ generationCopy.generate }}
        </button>
      </div>

      <div v-if="!backgroundSourceMaterials.length" class="vg-empty pm-empty pm-empty--tall">
        <span class="vg-empty__icon"><ImageIcon :size="22" /></span>
        <h3>{{ copy.noMaterials }}</h3>
        <p>{{ uiText.sourceEmpty }}</p>
        <button class="vg-btn vg-btn--primary" type="button" @click="activeTab = 'batch'"><Film :size="15" />{{ copy.batchTab }}</button>
      </div>
      <div v-else class="pm-gallery-wrap">
        <div class="pm-gallery">
          <MaterialTile
            v-for="item in pagedBackgroundMaterials"
            :key="item.id"
            :src="item.qiniuUrl"
            :title="shortMaterialId(item.id)"
            :selected="selectedBackgroundMaterialIds.includes(item.id)"
            @toggle="toggleBackgroundMaterialSelection(item.id)"
            @preview="openMaterialPreview(item)"
          >
            <template #tools>
              <button class="pm-tool" type="button" :title="copy.preview" @click.stop="openMaterialPreview(item)"><Eye :size="13" /></button>
              <button class="pm-tool pm-tool--danger" type="button" :title="copy.deleteMaterial" :disabled="actionBusyId === item.id" @click.stop="deleteMaterial(item.id)"><Trash2 :size="13" /></button>
            </template>
            <template #aside><span class="vg-chip">{{ categoryLabel(item.category) }}</span></template>
            <div class="pm-tile__meta">{{ backgroundMaterialTitle(item) }} · <span class="vg-num">{{ item.frameTimeSec.toFixed(2) }}s</span></div>
          </MaterialTile>
        </div>
        <MaterialPager
          v-if="backgroundSourceMaterials.length > 24"
          v-model:page="backgroundPage"
          v-model:page-size="libraryPageSize"
          :total-pages="backgroundTotalPages"
          :total="backgroundSourceMaterials.length"
          :sizes="[24, 32, 48, 64]"
          :labels="paginationCopy"
        />
      </div>
    </section>

    <!-- ============ 衍生图素材 ============ -->
    <section v-else class="pm-card pm-card--flush">
      <header class="pm-bar">
        <div class="pm-bar__title">
          <h2>{{ libraryDisplayCopy.title }}</h2>
          <p>{{ libraryDisplayCopy.desc }}</p>
        </div>
        <div class="pm-bar__tools">
          <div class="pm-seg">
            <button type="button" :class="{ 'is-on': filterCategory === 'all' }" @click="setLibraryCategory('all')">{{ copy.all }}</button>
            <button v-for="item in categories" :key="item" type="button" :class="{ 'is-on': filterCategory === item }" @click="setLibraryCategory(item)">{{ categoryLabel(item) }}</button>
          </div>
          <div class="pm-seg">
            <button type="button" :class="{ 'is-on': filterUsageStatus === 'all' }" @click="setLibraryUsage('all')">{{ copy.all }}</button>
            <button type="button" :class="{ 'is-on': filterUsageStatus === 'unused' }" @click="setLibraryUsage('unused')">{{ copy.unused }}</button>
            <button type="button" :class="{ 'is-on': filterUsageStatus === 'used' }" @click="setLibraryUsage('used')">{{ copy.used }}</button>
          </div>
        </div>
      </header>

      <div v-if="filteredMaterials.length" class="pm-selbar" :class="{ 'is-live': selectedMaterialIds.length }">
        <label class="pm-check">
          <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAllVisible" />
          <span>{{ libraryBatchCopy.selectAll }}</span>
        </label>
        <span class="vg-muted">{{ libraryBatchCopy.selectedCount }} <b class="vg-num">{{ selectedMaterialIds.length }}</b></span>
        <button v-if="selectedMaterialIds.length" class="vg-link vg-link--muted" type="button" @click="clearSelectedMaterials">{{ libraryBatchCopy.clearSelection }}</button>
        <span class="vg-toolbar__spacer" />
        <button class="vg-btn vg-btn--sm vg-btn--danger" type="button" :disabled="!selectedMaterialIds.length || actionBusyId === 'delete-materials'" @click="deleteSelectedMaterials">
          <Trash2 :size="13" />{{ batchDeleteCopy.action }}
        </button>
        <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="!selectedMaterialIds.length || actionBusyId === 'export-materials'" @click="exportSelectedMaterials">
          <Download :size="13" />{{ libraryBatchCopy.exportSelected }}
        </button>
      </div>

      <div v-if="!filteredMaterials.length" class="vg-empty pm-empty pm-empty--tall">
        <span class="vg-empty__icon"><Layers :size="22" /></span>
        <h3>{{ copy.noMaterials }}</h3>
        <p>{{ libraryDisplayCopy.hint }}</p>
      </div>
      <div v-else class="pm-gallery-wrap">
        <div class="pm-gallery">
          <MaterialTile
            v-for="item in pagedMaterials"
            :key="item.id"
            :src="item.qiniuUrl"
            :title="shortMaterialId(item.id)"
            :selected="selectedMaterialIds.includes(item.id)"
            :flag="item.usageStatus === 'used' ? copy.used : undefined"
            flag-tone="warn"
            @toggle="toggleMaterialSelection(item.id)"
            @preview="openMaterialPreview(item)"
          >
            <template #tools>
              <button class="pm-tool" type="button" :title="copy.preview" @click.stop="openMaterialPreview(item)"><Eye :size="13" /></button>
              <button class="pm-tool" type="button" :title="copy.openUrl" @click.stop="openPublicUrl(item.qiniuUrl)"><Link2 :size="13" /></button>
              <button class="pm-tool" type="button" :title="copy.showFile" @click.stop="showInFolder(item.localImagePath)"><FolderOpen :size="13" /></button>
              <button class="pm-tool pm-tool--danger" type="button" :title="copy.deleteMaterial" :disabled="actionBusyId === item.id" @click.stop="deleteMaterial(item.id)"><Trash2 :size="13" /></button>
            </template>
            <template #aside><span class="vg-chip">{{ categoryLabel(item.category) }}</span></template>
            <div class="pm-tile__meta">{{ generationCopy.derivedFrom }} <span class="vg-num">{{ shortMaterialId(item.derivedFromMaterialId || '') }}</span></div>
            <div class="pm-tile__row">
              <button
                class="pm-usage"
                :class="{ 'is-used': item.usageStatus === 'used' }"
                type="button"
                :disabled="actionBusyId === item.id"
                :title="item.usageStatus === 'used' ? copy.unused : copy.used"
                @click="setUsageStatus(item.id, item.usageStatus === 'used' ? 'unused' : 'used')"
              >
                <i />{{ item.usageStatus === 'used' ? copy.used : copy.unused }}
              </button>
              <select
                class="vg-select vg-select--sm pm-tile__bind"
                :title="copy.bindProduct"
                :value="item.boundProductId || ''"
                @change="bindProduct(item.id, String(($event.target as HTMLSelectElement).value || ''))"
              >
                <option value="">{{ copy.bindProduct }} · {{ copy.unbound }}</option>
                <option v-for="product in products" :key="product.id" :value="product.id">{{ product.name }} ({{ product.type }})</option>
              </select>
            </div>
          </MaterialTile>
        </div>
        <MaterialPager
          v-if="filteredMaterials.length > 24"
          v-model:page="libraryPage"
          v-model:page-size="libraryPageSize"
          :total-pages="libraryTotalPages"
          :total="filteredMaterials.length"
          :sizes="[24, 32, 48, 64]"
          :labels="paginationCopy"
        />
      </div>
    </section>

    <VideoPreviewModal :open="previewOpen" :src="previewSrc" :title="previewTitle" media-type="image" @close="closePreview" />
  </div>
</template>
