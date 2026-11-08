<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import {
  Check,
  Boxes,
  ChevronLeft,
  CloudUpload,
  Download,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Info,
  Link2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-vue-next'
import VideoPreviewModal from '../components/VideoPreviewModal.vue'

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
const sourceImagePath = ref('')
const sourceImageName = computed(() => sourceImagePath.value.split(/[\\/]/).pop() || '')
const sourceImagePreviewSrc = computed(() => sourceImagePath.value ? `vg://file?path=${encodeURIComponent(sourceImagePath.value)}` : '')
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
      pluginName: 'Tu lieu hinh anh san pham',
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
      pluginName: '\u5546\u54c1\u56fe\u7247\u7d20\u6750',
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
    pluginName: 'Product Image Materials',
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

function batchStatusTone(status: BatchItem['status']) {
  if (status === 'completed') return 'is-success'
  if (status === 'failed') return 'is-danger'
  if (status === 'partial_failed') return 'is-warning'
  return 'is-info'
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
    multiple: false,
  })
  if (Array.isArray(paths) && paths[0]) sourceImagePath.value = paths[0]
}

async function pickSourceImageFromAssetLibrary() {
  const selected = await openAssetLibraryPicker({ type: 'image', multiple: false, usagePlugin: ASSET_USAGE_PLUGIN })
  if (selected?.[0]) sourceImagePath.value = selected[0].filePath
}

function clearSourceImage() {
  sourceImagePath.value = ''
}

async function generateFromUploadedImage() {
  if (!sourceImagePath.value || imageGenerating.value) return
  imageGenerating.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const result = await window.api.productImageMaterials.createImageVariants({
      userId: DESKTOP_USER_ID,
      sourceImagePath: sourceImagePath.value,
      category: imageCategory.value,
      variantCount: Math.max(1, Math.min(6, Math.floor(Number(imageVariantCount.value || 1)))),
      promptVersionId: selectedPromptVersionId.value,
      prompt: promptText.value,
    })
    notice.value = `${generationCopy.value.success} ${result.count}`
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
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
  <div class="materials-workbench plugin-workspace-standard">
    <header class="hero-card">
      <div class="hero-card__content">
        <div class="hero-card__eyebrow">
          <div class="hero-card__eyebrow-icon">
            <Boxes class="icon icon--small" />
          </div>
          <span>{{ copy.kicker }}</span>
        </div>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.subtitle }}</p>
      </div>
    </header>

    <div v-if="notice" class="notice notice--success">{{ notice }}</div>
    <div v-if="errorText" class="notice notice--danger">{{ errorText }}</div>

    <section class="workspace-card">
      <div class="workspace-card__head">
        <div class="workspace-card__intro">
          <div class="workspace-card__icon">
            <Sparkles class="icon" />
          </div>
          <div class="workspace-card__copy">
            <div class="workspace-card__title" data-testid="product-image-materials-title">{{ copy.pluginName }}</div>
            <div class="workspace-card__hint">{{ copy.workspaceHint }}</div>
          </div>
          <div class="workspace-card__actions">
            <button class="ghost-button workspace-action-button" data-testid="product-image-materials-back" type="button" @click="router.push('/plugins?tab=installed&plugin=product-image-materials')">
              <ChevronLeft class="icon icon--small" />
              {{ copy.backPlugin }}
            </button>
            <button class="ghost-button workspace-action-button" data-testid="product-image-materials-refresh" type="button" :disabled="loading" @click="loadAll">
              <RefreshCcw class="icon icon--small" />
              {{ copy.refresh }}
            </button>
          </div>
        </div>

        <div class="tabs-shell">
          <button class="tab-button" :class="{ active: activeTab === 'batch' }" type="button" @click="activeTab = 'batch'">
            <Sparkles class="icon icon--small" />
            <span>{{ copy.batchTab }}</span>
          </button>
          <button class="tab-button" :class="{ active: activeTab === 'image-to-image' }" type="button" @click="activeTab = 'image-to-image'">
            <ImageIcon class="icon icon--small" />
            <span>{{ copy.imageToImageTab }}</span>
          </button>
          <button class="tab-button" :class="{ active: activeTab === 'background' }" type="button" @click="activeTab = 'background'">
            <ImageIcon class="icon icon--small" />
            <span>{{ generationCopy.tab }}</span>
            <span class="tab-badge">{{ backgroundSourceMaterials.length }}</span>
          </button>
          <button class="tab-button" :class="{ active: activeTab === 'library' }" type="button" @click="activeTab = 'library'">
            <ImageIcon class="icon icon--small" />
            <span>{{ libraryDisplayCopy.tab }}</span>
            <span class="tab-badge">{{ derivedMaterialCount }}</span>
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'batch'" class="workspace-grid">
        <section class="panel panel--feature">
          <div class="section-head">
            <div class="section-head__badge">1</div>
            <div>
              <h2>{{ copy.createBatch }}</h2>
              <p>{{ copy.createBatchDesc }}</p>
            </div>
          </div>

          <div class="form-grid form-grid--single">
            <label>
              <span>{{ copy.category }}</span>
              <select v-model="selectedCategory" class="input">
                <option v-for="item in categories" :key="item" :value="item">{{ categoryLabel(item) }}</option>
              </select>
              <small class="field-hint field-hint--placeholder" aria-hidden="true">.</small>
            </label>
          </div>

          <div class="tabs-shell tabs-shell--submode">
            <button class="tab-button" :class="{ active: batchSourceMode === 'upload' }" type="button" @click="batchSourceMode = 'upload'">
              <CloudUpload class="icon icon--small" />
              <span>{{ copy.uploadMyVideo }}</span>
            </button>
            <button class="tab-button" :class="{ active: batchSourceMode === 'downloaded' }" type="button" @click="batchSourceMode = 'downloaded'">
              <Download class="icon icon--small" />
              <span>{{ copy.chooseDownloadedVideo }}</span>
              <span class="tab-badge">{{ downloadableParserVideos.length }}</span>
            </button>
          </div>

          <template v-if="batchSourceMode === 'upload'">
            <button class="upload-dropzone" type="button" @click="pickVideos">
              <CloudUpload class="icon upload-dropzone__icon" />
              <strong>{{ copy.pickZoneTitle }}</strong>
              <span>{{ copy.pickZoneDesc }}</span>
              <span>{{ copy.pickZoneFormats }}</span>
            </button>

            <div class="pick-row pick-row--three">
              <button class="primary-button" data-testid="product-image-materials-local-videos" type="button" @click="pickVideos">
                <FolderOpen class="icon" />
                {{ copy.pickVideos }}
              </button>
              <button class="primary-button primary-button--soft" data-testid="product-image-materials-library-videos" type="button" @click="pickVideosFromAssetLibrary">
                <Images class="icon" />
                {{ copy.pickAssetVideos }}
              </button>
              <button class="primary-button primary-button--soft" type="button" :disabled="!canSubmit" @click="submitBatch">
                <RefreshCcw v-if="submitting" class="icon spin" />
                <Boxes v-else class="icon" />
                {{ copy.queueBatch }}
              </button>
            </div>

            <div class="picked-list">
              <div v-if="!pickedVideos.length" class="empty-copy">{{ copy.noVideosSelected }}</div>
              <button v-for="item in pickedVideos" :key="item" class="path-chip" type="button" @click="showInFolder(item)">
                {{ item }}
              </button>
            </div>
          </template>

          <template v-else>
            <div v-if="!downloadableParserVideos.length" class="empty-copy">
              {{ copy.noDownloadedVideos }}
            </div>
            <div v-else class="parser-video-grid">
              <article
                v-for="item in pagedDownloadableParserVideos"
                :key="item.id"
                class="parser-video-card"
                :class="{ 'is-selected': selectedParserVideoIds.includes(item.id) }"
                @click="toggleParserVideoSelection(item.id)"
              >
                <img v-if="parserVideoThumb(item)" :src="parserVideoThumb(item)" alt="video thumbnail" class="parser-video-card__thumb" loading="lazy" decoding="async" />
                <div v-else class="parser-video-card__placeholder">VIDEO</div>
                <div class="parser-video-card__body">
                  <strong>{{ parserVideoLabel(item) }}</strong>
                  <span>{{ item.author || item.videoId }}</span>
                  <span>{{ item.usedStatus === 'used' ? copy.used : copy.unused }}</span>
                </div>
              </article>
            </div>

            <div v-if="downloadableParserVideos.length > parserVideoPageSize" class="library-pagination">
              <div class="library-pagination__nav">
                <button class="ghost-button ghost-button--toolbar" type="button" :disabled="parserVideoPage <= 1" @click="parserVideoPage -= 1">
                  {{ paginationCopy.prev }}
                </button>
                <span class="library-pagination__text">{{ parserVideoPage }} / {{ parserVideoTotalPages }}</span>
                <button class="ghost-button ghost-button--toolbar" type="button" :disabled="parserVideoPage >= parserVideoTotalPages" @click="parserVideoPage += 1">
                  {{ paginationCopy.next }}
                </button>
              </div>
              <div class="library-pagination__size">
                <span>{{ paginationCopy.perPage }}</span>
                <select v-model.number="parserVideoPageSize" class="input input--compact library-pagination__select">
                  <option :value="8">8</option>
                  <option :value="12">12</option>
                  <option :value="16">16</option>
                  <option :value="24">24</option>
                </select>
                <span>{{ paginationCopy.items }}</span>
              </div>
            </div>

            <div class="pick-row">
              <button class="primary-button primary-button--soft" type="button" :disabled="!canSubmitDownloadedBatch" @click="submitBatch">
                <RefreshCcw v-if="submitting" class="icon spin" />
                <Boxes v-else class="icon" />
                {{ copy.queueBatch }}
              </button>
            </div>

            <div class="picked-list">
              <div v-if="!selectedDownloadedVideos.length" class="empty-copy">{{ copy.noDownloadedVideosSelected }}</div>
              <button
                v-for="item in selectedDownloadedVideos"
                :key="item.id"
                class="path-chip"
                type="button"
                @click.stop="showInFolder(item.localVideoPath || '')"
              >
                {{ item.localVideoPath || item.videoId }}
              </button>
            </div>
          </template>
        </section>

        <section class="panel panel--queue">
          <div class="section-head section-head--queue">
            <div class="section-head__badge">2</div>
            <div class="section-head__content">
              <h2>{{ copy.queue }}</h2>
              <p>{{ copy.queueDesc }}</p>
            </div>
            <button class="ghost-button ghost-button--inline" type="button" @click="loadAll">
              <RefreshCcw class="icon" />
              {{ copy.refresh }}
            </button>
          </div>

          <div v-if="loading && !batches.length" class="empty-copy">{{ copy.loadingBatches }}</div>
          <div v-else-if="!batches.length" class="empty-copy">{{ copy.noBatches }}</div>
          <template v-else-if="latestBatch">
            <article class="queue-card">
              <div class="queue-card__head">
                <div class="queue-card__title">
                  <span class="queue-card__type">{{ copy.batches }}</span>
                  <strong>{{ formatDateTime(latestBatch.updatedAt) }}</strong>
                </div>
                <span class="status-pill" :class="batchStatusTone(latestBatch.status)">{{ batchStatusLabel(latestBatch.status) }}</span>
              </div>

              <div class="queue-card__stats">
                <div class="queue-stat">
                  <div class="queue-stat__value">{{ latestBatch.totalVideos }}</div>
                  <div class="queue-stat__label">{{ copy.total }}</div>
                </div>
                <div class="queue-stat">
                  <div class="queue-stat__value">{{ latestBatch.completedVideos }}</div>
                  <div class="queue-stat__label">{{ copy.done }}</div>
                </div>
                <div class="queue-stat">
                  <div class="queue-stat__value">{{ latestBatch.failedVideos }}</div>
                  <div class="queue-stat__label">{{ copy.failed }}</div>
                </div>
                <div class="queue-stat">
                  <div class="queue-stat__value">{{ latestBatch.generatedImageCount }}</div>
                  <div class="queue-stat__label">{{ copy.images }}</div>
                </div>
              </div>

              <div class="queue-card__files">
                <div v-for="item in latestBatch.sourceItems" :key="item.id" class="queue-file">
                  <div class="queue-file__name">
                    <span>{{ item.sourceVideoName }}</span>
                    <span class="status-pill status-pill--small" :class="batchStatusTone(item.status === 'completed' ? 'completed' : item.status === 'failed' ? 'failed' : item.status === 'processing' ? 'processing' : 'queued')">
                      {{ sourceStatusLabel(item.status) }}
                    </span>
                  </div>
                  <div class="queue-file__meta">{{ copy.images }} {{ item.generatedCount }} / {{ copy.skipped }} {{ item.skippedCount }}</div>
                </div>
              </div>

              <button
                v-if="latestBatch.status === 'failed' || latestBatch.status === 'partial_failed'"
                class="ghost-button"
                type="button"
                :disabled="actionBusyId === latestBatch.id"
                @click="retryBatch(latestBatch.id)"
              >
                <TriangleAlert class="icon" />
                {{ copy.retryFailed }}
              </button>
            </article>

            <div class="queue-tip">
              <ShieldCheck class="icon icon--small" />
              <span>{{ copy.queueTip }}</span>
            </div>
          </template>
        </section>
      </div>

      <section v-else-if="activeTab === 'image-to-image'" class="panel panel--library">
        <div class="section-head section-head--library">
          <div class="section-head__lead">
            <div class="section-head__badge section-head__badge--image"><ImageIcon class="icon icon--small" /></div>
            <div><h2>{{ copy.imageToImageTab }}</h2><p>{{ generationCopy.hint }}</p></div>
          </div>
        </div>
        <div class="image-generation-grid">
          <div class="source-picker-panel" :class="{ 'source-picker-panel--selected': sourceImagePath }">
            <button class="source-picker-preview" data-testid="product-image-materials-source-preview" type="button" @click="pickSourceImage">
              <img v-if="sourceImagePreviewSrc" :src="sourceImagePreviewSrc" :alt="sourceImageName" />
              <span v-else class="source-picker-placeholder">
                <ImageIcon class="source-picker-placeholder__icon" />
              </span>
            </button>
            <div class="source-picker-content">
              <div class="source-picker-copy">
                <span>{{ promptUi.source }}</span>
                <strong :title="sourceImageName">{{ sourceImageName || promptUi.empty }}</strong>
                <small>{{ promptUi.sourceHint }}</small>
              </div>
              <button v-if="sourceImagePath" class="source-picker-clear" data-testid="product-image-materials-clear-image" type="button" :title="promptUi.clearSource" :aria-label="promptUi.clearSource" @click="clearSourceImage">
                <X class="icon icon--small" />
              </button>
              <div class="source-picker-actions">
                <button class="source-picker-action source-picker-action--local" data-testid="product-image-materials-local-image" style="background: #0d7568 !important; border-color: rgba(107, 235, 211, 0.32) !important; color: #ffffff !important;" type="button" @click="pickSourceImage">
                  <CloudUpload class="icon icon--small" style="color: #ffffff !important;" />
                  <span style="color: #ffffff !important; -webkit-text-fill-color: #ffffff !important;">{{ promptUi.localUpload }}</span>
                </button>
                <button class="ghost-button source-picker-action" data-testid="product-image-materials-library-image" type="button" @click="pickSourceImageFromAssetLibrary">
                  <Images class="icon icon--small" />
                  <span>{{ promptUi.assetLibrary }}</span>
                </button>
              </div>
            </div>
          </div>
          <div class="filter-grid">
            <label><span>{{ promptUi.category }}</span><select v-model="imageCategory" class="input"><option v-for="item in categories" :key="item" :value="item">{{ categoryLabel(item) }}</option></select></label>
            <label><span>{{ promptUi.count }}</span><input v-model.number="imageVariantCount" class="input" type="number" min="1" max="6" step="1" /></label>
          </div>
        </div>
        <div class="prompt-version-editor">
          <div class="prompt-version-meta">
            <label><span>{{ promptUi.version }}</span><select v-model="selectedPromptVersionId" class="input" @change="selectPromptVersion"><option v-for="version in promptVersions" :key="version.id" :value="version.id">V{{ version.version }} - {{ version.name }}{{ version.active ? ` - ${promptUi.active}` : '' }}</option></select></label>
            <label><span>{{ promptUi.name }}</span><input v-model="promptVersionName" class="input" type="text" /></label>
          </div>
          <label class="prompt-version-content"><span>{{ promptUi.content }}</span><textarea v-model="promptText" class="input prompt-textarea" rows="5" spellcheck="false"></textarea></label>
          <div class="prompt-version-actions">
            <button class="ghost-button" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="savePromptVersion()">{{ promptUi.update }}</button>
            <button class="ghost-button" type="button" :disabled="promptBusy || !promptText.trim()" @click="savePromptVersion(true)">{{ promptUi.copy }}</button>
            <button class="ghost-button" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="activatePromptVersion">{{ promptUi.activate }}</button>
            <button class="ghost-button" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="rollbackPromptVersion">{{ promptUi.rollback }}</button>
          </div>
        </div>
        <div class="library-toolbar__actions image-generation-actions">
          <button class="primary-button generate-button" type="button" :disabled="!sourceImagePath || imageGenerating" @click="generateFromUploadedImage"><span class="generate-button__icon"><RefreshCcw class="icon" :class="{ spin: imageGenerating }" /></span><span>{{ promptUi.generate }}</span><span class="generate-button__arrow">&#8594;</span></button>
        </div>
      </section>

      <section v-else-if="activeTab === 'background'" class="panel panel--library">
        <div class="section-head section-head--library">
          <div class="section-head__lead">
            <div class="section-head__badge section-head__badge--image">
              <Sparkles class="icon icon--small" />
            </div>
            <div>
              <h2>{{ generationCopy.tab }}</h2>
              <p>{{ generationCopy.desc }}</p>
            </div>
          </div>
          <div class="panel__hint">
            <span>{{ generationCopy.hint }}</span>
            <Info class="icon icon--tiny" />
          </div>
        </div>

        <div class="filter-grid filter-grid--library">
          <label>
            <span>{{ generationCopy.materialCount }}</span>
            <input v-model.number="backgroundMaterialCount" class="input" type="number" min="1" max="6" step="1" />
          </label>
          <label>
            <span>{{ generationCopy.totalOutput }}</span>
            <input class="input" :value="backgroundTotalOutput" disabled />
          </label>
        </div>

        <div class="prompt-version-editor">
          <div class="prompt-version-meta">
            <label><span>{{ promptUi.version }}</span><select v-model="selectedPromptVersionId" class="input" @change="selectPromptVersion"><option v-for="version in promptVersions" :key="version.id" :value="version.id">V{{ version.version }} - {{ version.name }}{{ version.active ? ` - ${promptUi.active}` : '' }}</option></select></label>
            <label><span>{{ promptUi.name }}</span><input v-model="promptVersionName" class="input" type="text" /></label>
          </div>
          <label class="prompt-version-content"><span>{{ promptUi.content }}</span><textarea v-model="promptText" class="input prompt-textarea" rows="5" spellcheck="false"></textarea></label>
          <div class="prompt-version-actions">
            <button class="ghost-button" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="savePromptVersion()">{{ promptUi.update }}</button>
            <button class="ghost-button" type="button" :disabled="promptBusy || !promptText.trim()" @click="savePromptVersion(true)">{{ promptUi.copy }}</button>
            <button class="ghost-button" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="activatePromptVersion">{{ promptUi.activate }}</button>
            <button class="ghost-button" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="rollbackPromptVersion">{{ promptUi.rollback }}</button>
          </div>
        </div>

        <div v-if="backgroundSourceMaterials.length" class="library-toolbar">
          <div class="library-toolbar__selection">
            <button class="ghost-button ghost-button--toolbar" type="button" @click="toggleSelectAllBackgroundVisible">
              {{ allBackgroundVisibleSelected ? generationCopy.clearSelection : generationCopy.sourceOnly }}
            </button>
            <span class="library-toolbar__count">{{ generationCopy.selected }} {{ selectedBackgroundMaterialIds.length }}</span>
          </div>
          <div class="library-toolbar__actions">
            <button
              class="ghost-button library-toolbar__delete"
              type="button"
              :disabled="!selectedBackgroundMaterialIds.length || backgroundSubmitting"
              @click="clearSelectedBackgroundMaterials"
            >
              <Trash2 class="icon" />
              {{ generationCopy.clearSelection }}
            </button>
            <button
              class="primary-button library-toolbar__export generate-button"
              type="button"
              :disabled="!selectedBackgroundMaterialIds.length || backgroundSubmitting"
              @click="generateBackgroundVariants"
            >
              <span class="generate-button__icon"><RefreshCcw class="icon" :class="{ spin: backgroundSubmitting }" /></span>
              <span>{{ generationCopy.generate }}</span>
              <span class="generate-button__arrow">&#8594;</span>
            </button>
            <button
              class="ghost-button library-toolbar__export"
              type="button"
              :disabled="!selectedBackgroundMaterialIds.length || backgroundSubmitting || actionBusyId === 'export-background-materials'"
              @click="exportSelectedBackgroundMaterials"
            >
              <Download class="icon" />
              {{ libraryBatchCopy.exportSelected }}
            </button>
          </div>
        </div>

        <div v-if="!backgroundSourceMaterials.length" class="empty-copy">{{ copy.noMaterials }}</div>
        <div v-else class="library-results">
          <div class="album-grid">
            <article v-for="item in pagedBackgroundMaterials" :key="item.id" class="album-card">
              <div class="album-card__media">
                <button class="album-thumb-button" type="button" @click="openMaterialPreview(item)">
                  <img class="album-thumb" :src="item.qiniuUrl" alt="material" loading="lazy" decoding="async" />
                </button>
                <button
                  class="select-checkbox"
                  :class="{ 'select-checkbox--active': selectedBackgroundMaterialIds.includes(item.id) }"
                  type="button"
                  @click="toggleBackgroundMaterialSelection(item.id)"
                >
                  <Check v-if="selectedBackgroundMaterialIds.includes(item.id)" class="icon icon--tiny" />
                </button>
                <div class="album-card__overlay">
                  <span class="status-pill" :class="item.materialOrigin === 'derived' ? 'is-warning' : 'is-success'">
                    {{ materialOriginLabel(item.materialOrigin) }}
                  </span>
                  <div class="album-card__actions-top">
                    <button class="icon-action" type="button" :title="copy.preview" @click.stop="openMaterialPreview(item)">
                      <Eye class="icon icon--tiny" />
                    </button>
                    <button class="icon-action icon-action--danger" type="button" :title="copy.deleteMaterial" :disabled="actionBusyId === item.id" @click.stop="deleteMaterial(item.id)">
                      <Trash2 class="icon icon--tiny" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="album-card__body">
                <div class="album-card__topline">
                  <strong>{{ shortMaterialId(item.id) }}</strong>
                  <span class="album-card__category">{{ categoryLabel(item.category) }}</span>
                </div>
                <div class="album-card__meta">
                  <span>{{ backgroundMaterialTitle(item) }}</span>
                  <span v-if="item.materialOrigin === 'derived'">{{ shortMaterialId(item.derivedFromMaterialId || '') }}</span>
                </div>
                <div class="album-card__status-row">
                  <span class="usage-chip usage-chip--unused">{{ materialOriginLabel(item.materialOrigin) }}</span>
                </div>
              </div>
            </article>
          </div>

          <div v-if="backgroundSourceMaterials.length > libraryPageSize" class="library-pagination">
            <div class="library-pagination__nav">
              <button class="ghost-button ghost-button--toolbar" type="button" :disabled="backgroundPage <= 1" @click="backgroundPage -= 1">
                {{ paginationCopy.prev }}
              </button>
              <span class="library-pagination__text">{{ backgroundPage }} / {{ backgroundTotalPages }}</span>
              <button class="ghost-button ghost-button--toolbar" type="button" :disabled="backgroundPage >= backgroundTotalPages" @click="backgroundPage += 1">
                {{ paginationCopy.next }}
              </button>
            </div>
            <div class="library-pagination__size">
              <span>{{ paginationCopy.perPage }}</span>
              <select v-model.number="libraryPageSize" class="input input--compact library-pagination__select">
                <option :value="24">24</option>
                <option :value="32">32</option>
                <option :value="48">48</option>
                <option :value="64">64</option>
              </select>
              <span>{{ paginationCopy.items }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="panel panel--library">
        <div class="section-head section-head--library">
          <div class="section-head__lead">
            <div class="section-head__badge section-head__badge--image">
              <ImageIcon class="icon icon--small" />
            </div>
            <div>
              <h2>{{ libraryDisplayCopy.title }}</h2>
              <p>{{ libraryDisplayCopy.desc }}</p>
            </div>
          </div>
          <div class="panel__hint">
            <span>{{ libraryDisplayCopy.hint }}</span>
            <Info class="icon icon--tiny" />
          </div>
        </div>

        <div class="filter-grid filter-grid--library">
          <label>
            <span>{{ copy.category }}</span>
            <select v-model="filterCategory" class="input" @change="loadAll">
              <option value="all">{{ copy.all }}</option>
              <option v-for="item in categories" :key="item" :value="item">{{ categoryLabel(item) }}</option>
            </select>
          </label>

          <label>
            <span>{{ copy.status }}</span>
            <select v-model="filterUsageStatus" class="input" @change="loadAll">
              <option value="all">{{ copy.all }}</option>
              <option value="unused">{{ copy.unused }}</option>
              <option value="used">{{ copy.used }}</option>
            </select>
          </label>
        </div>

        <div v-if="filteredMaterials.length" class="library-toolbar">
          <div class="library-toolbar__selection">
            <button class="ghost-button ghost-button--toolbar" type="button" @click="toggleSelectAllVisible">
              {{ allVisibleSelected ? libraryBatchCopy.clearSelection : libraryBatchCopy.selectAll }}
            </button>
            <span class="library-toolbar__count">{{ libraryBatchCopy.selectedCount }} {{ selectedMaterialIds.length }}</span>
          </div>
          <div class="library-toolbar__actions">
            <button
              class="ghost-button library-toolbar__delete"
              type="button"
              :disabled="!selectedMaterialIds.length || actionBusyId === 'delete-materials'"
              @click="deleteSelectedMaterials"
            >
              <Trash2 class="icon" />
              {{ batchDeleteCopy.action }}
            </button>
            <button
              class="primary-button library-toolbar__export"
              type="button"
              :disabled="!selectedMaterialIds.length || actionBusyId === 'export-materials'"
              @click="exportSelectedMaterials"
            >
              <Download class="icon" />
              {{ libraryBatchCopy.exportSelected }}
            </button>
          </div>
        </div>

        <div v-if="!filteredMaterials.length" class="empty-copy">{{ copy.noMaterials }}</div>
        <div v-else class="library-results">
          <div class="album-grid">
            <article v-for="item in pagedMaterials" :key="item.id" class="album-card">
            <div class="album-card__media">
              <button class="album-thumb-button" type="button" @click="openMaterialPreview(item)">
                <img class="album-thumb" :src="item.qiniuUrl" alt="material" loading="lazy" decoding="async" />
              </button>
              <button
                class="select-checkbox"
                :class="{ 'select-checkbox--active': selectedMaterialIds.includes(item.id) }"
                type="button"
                @click="toggleMaterialSelection(item.id)"
              >
                <Check v-if="selectedMaterialIds.includes(item.id)" class="icon icon--tiny" />
              </button>
              <div class="album-card__overlay">
                <span class="status-pill" :class="item.usageStatus === 'used' ? 'is-warning' : 'is-success'">
                  {{ item.usageStatus === 'used' ? copy.used : copy.unused }}
                </span>
                <div class="album-card__actions-top">
                  <button class="icon-action" type="button" :title="copy.preview" @click.stop="openMaterialPreview(item)">
                    <Eye class="icon icon--tiny" />
                  </button>
                  <button class="icon-action" type="button" :title="copy.openUrl" @click="openPublicUrl(item.qiniuUrl)">
                    <Link2 class="icon icon--tiny" />
                  </button>
                  <button class="icon-action" type="button" :title="copy.showFile" @click="showInFolder(item.localImagePath)">
                    <FolderOpen class="icon icon--tiny" />
                  </button>
                  <button class="icon-action icon-action--danger" type="button" :title="copy.deleteMaterial" :disabled="actionBusyId === item.id" @click="deleteMaterial(item.id)">
                    <Trash2 class="icon icon--tiny" />
                  </button>
                </div>
              </div>
            </div>

            <div class="album-card__body">
              <div class="album-card__topline">
                <strong>{{ shortMaterialId(item.id) }}</strong>
                <span class="album-card__category">{{ categoryLabel(item.category) }}</span>
                <span class="album-card__category" :class="{ 'album-card__category--derived': item.materialOrigin === 'derived' }">
                  {{ materialOriginLabel(item.materialOrigin) }}
                </span>
              </div>
              <div class="album-card__meta">
                <span>{{ copy.segment }} {{ item.segmentIndex + 1 }}</span>
                <span>{{ item.frameTimeSec.toFixed(2) }}s</span>
                <span v-if="item.materialOrigin === 'derived'">{{ generationCopy.derivedFrom }} {{ shortMaterialId(item.derivedFromMaterialId || '') }}</span>
              </div>
              <div class="album-card__status-row">
                <button
                  class="usage-chip"
                  :class="item.usageStatus === 'used' ? 'usage-chip--used' : 'usage-chip--unused'"
                  type="button"
                  :disabled="actionBusyId === item.id"
                  @click="setUsageStatus(item.id, item.usageStatus === 'used' ? 'unused' : 'used')"
                >
                  {{ item.usageStatus === 'used' ? copy.used : copy.unused }}
                </button>
                <button
                  class="ghost-chip ghost-chip--mini"
                  type="button"
                  :disabled="actionBusyId === item.id"
                  @click="setUsageStatus(item.id, item.usageStatus === 'used' ? 'unused' : 'used')"
                >
                  {{ item.usageStatus === 'used' ? copy.unused : copy.used }}
                </button>
              </div>
              <label class="album-card__select">
                <span><Tags class="icon icon--tiny" /> {{ copy.bindProduct }}</span>
                <select class="input input--compact" :value="item.boundProductId || ''" @change="bindProduct(item.id, String(($event.target as HTMLSelectElement).value || ''))">
                  <option value="">{{ copy.unbound }}</option>
                  <option v-for="product in products" :key="product.id" :value="product.id">
                    {{ product.name }} ({{ product.type }})
                  </option>
                </select>
              </label>
            </div>
            </article>
          </div>

          <div v-if="filteredMaterials.length > libraryPageSize" class="library-pagination">
            <div class="library-pagination__nav">
              <button class="ghost-button ghost-button--toolbar" type="button" :disabled="libraryPage <= 1" @click="libraryPage -= 1">
                {{ paginationCopy.prev }}
              </button>
              <span class="library-pagination__text">{{ libraryPage }} / {{ libraryTotalPages }}</span>
              <button class="ghost-button ghost-button--toolbar" type="button" :disabled="libraryPage >= libraryTotalPages" @click="libraryPage += 1">
                {{ paginationCopy.next }}
              </button>
            </div>
            <div class="library-pagination__size">
              <span>{{ paginationCopy.perPage }}</span>
              <select v-model.number="libraryPageSize" class="input input--compact library-pagination__select">
                <option :value="24">24</option>
                <option :value="32">32</option>
                <option :value="48">48</option>
                <option :value="64">64</option>
              </select>
              <span>{{ paginationCopy.items }}</span>
            </div>
          </div>
        </div>
      </section>
    </section>

    <footer class="footer-card">
      <ShieldCheck class="icon icon--small" />
      <span>{{ copy.footer }}</span>
    </footer>

    <VideoPreviewModal :open="previewOpen" :src="previewSrc" :title="previewTitle" media-type="image" @close="closePreview" />
  </div>
</template>

<style scoped>
.materials-workbench {
  display: grid;
  gap: 16px;
  color: #f3f6ff;
}

.hero-card,
.workspace-card,
.footer-card,
.panel {
  border: 1px solid rgba(110, 126, 255, 0.12);
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(91, 87, 255, 0.16), transparent 32%),
    linear-gradient(180deg, rgba(11, 18, 34, 0.98), rgba(10, 16, 30, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 55px rgba(0, 0, 0, 0.24);
}

.hero-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  padding: 18px 22px;
}

.hero-card__content {
  display: grid;
  gap: 10px;
  max-width: 620px;
}

.hero-card__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(228, 235, 255, 0.92);
  font-size: 12px;
  font-weight: 600;
}

.hero-card__eyebrow-icon,
.workspace-card__icon {
  width: 32px;
  height: 32px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(112, 85, 255, 0.84), rgba(67, 128, 255, 0.62));
  box-shadow: 0 12px 28px rgba(93, 93, 255, 0.22);
}

.hero-card h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.03em;
}

.hero-card p {
  margin: 0;
  max-width: 560px;
  color: rgba(224, 231, 255, 0.74);
  font-size: 12px;
  line-height: 1.55;
}

.hero-card__stats {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.metric-card {
  min-width: 132px;
  padding: 12px 14px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(20, 28, 48, 0.9), rgba(15, 22, 38, 0.86));
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: grid;
  gap: 8px;
}

.metric-card__icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}

.metric-card--violet .metric-card__icon {
  background: linear-gradient(135deg, rgba(156, 88, 255, 0.95), rgba(104, 76, 255, 0.72));
}

.metric-card--blue .metric-card__icon {
  background: linear-gradient(135deg, rgba(77, 154, 255, 0.95), rgba(58, 104, 255, 0.72));
}

.metric-card__value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.metric-card__label {
  font-size: 12px;
  font-weight: 600;
}

.metric-card__sub {
  color: rgba(197, 207, 240, 0.72);
  font-size: 11px;
}

.workspace-card {
  padding: 14px;
  display: grid;
  gap: 14px;
}

.workspace-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.workspace-card__intro {
  display: flex;
  align-items: center;
  gap: 10px;
}

.workspace-card__copy {
  min-width: 0;
  flex: 1;
}

.workspace-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.workspace-action-button {
  min-height: 38px;
  padding: 0 12px;
  white-space: nowrap;
}

.workspace-card__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.1;
}

.workspace-card__hint {
  margin-top: 4px;
  color: rgba(224, 231, 255, 0.7);
  font-size: 11px;
}

.tabs-shell {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(19, 28, 50, 0.88), rgba(12, 18, 33, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 16px 28px rgba(0, 0, 0, 0.16);
}

.tab-button {
  min-width: 118px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(230, 236, 255, 0.76);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-button.active {
  background: linear-gradient(135deg, rgba(111, 83, 255, 0.82), rgba(66, 125, 255, 0.34));
  border-color: rgba(142, 124, 255, 0.32);
  color: #ffffff;
  box-shadow: 0 16px 26px rgba(90, 77, 255, 0.2);
}

.tab-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.workspace-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.12fr);
}

.panel {
  min-width: 0;
  min-height: 100%;
  padding: 16px;
}

.panel--feature,
.panel--queue,
.panel--library {
  background:
    radial-gradient(circle at top left, rgba(84, 87, 255, 0.08), transparent 32%),
    linear-gradient(180deg, rgba(14, 22, 40, 0.98), rgba(10, 17, 31, 0.98));
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.section-head__content,
.section-head__lead {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.section-head__badge {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(127, 93, 255, 0.95), rgba(88, 82, 255, 0.72));
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  flex: 0 0 auto;
}

.section-head__badge--image {
  background: linear-gradient(135deg, rgba(81, 136, 255, 0.92), rgba(97, 92, 255, 0.68));
}

.section-head h2 {
  margin: 0 0 4px;
  font-size: 14px;
}

.section-head p {
  margin: 0;
  color: rgba(224, 231, 255, 0.72);
  font-size: 11px;
}

.section-head--queue {
  align-items: flex-start;
}

.section-head--library {
  justify-content: space-between;
  align-items: flex-start;
}

.ghost-button--inline {
  margin-left: auto;
}

.form-grid,
.filter-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.image-generation-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 1fr);
  gap: 12px;
  align-items: start;
  margin-bottom: 14px;
}

.source-picker-panel {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 14px;
  min-height: 152px;
  padding: 10px;
  border: 1px solid rgba(141, 169, 175, 0.16);
  border-radius: 14px;
  background: #0c1219;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.source-picker-panel--selected {
  border-color: rgba(76, 210, 188, 0.38);
  background: #0d171d;
}

.source-picker-preview {
  width: 132px;
  height: 132px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(141, 169, 175, 0.18);
  border-radius: 10px;
  background: #111a22;
  color: rgba(98, 224, 202, 0.82);
  cursor: pointer;
}

.source-picker-preview:hover {
  border-color: rgba(76, 210, 188, 0.58);
}

.source-picker-preview img,
.source-picker-placeholder {
  width: 100%;
  height: 100%;
}

.source-picker-preview img {
  display: block;
  object-fit: cover;
}

.source-picker-placeholder {
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, rgba(21, 52, 56, 0.72), rgba(13, 22, 29, 0.94));
}

.source-picker-placeholder__icon {
  width: 30px;
  height: 30px;
  stroke-width: 1.5;
}

.source-picker-content {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 4px 2px 2px 0;
}

.source-picker-copy {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding-right: 38px;
}

.source-picker-copy > span {
  color: #5cd3bf;
  font-size: 11px;
  font-weight: 700;
}

.source-picker-copy > strong {
  overflow: hidden;
  color: #eef8f6;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-picker-copy > small {
  color: rgba(210, 226, 227, 0.5);
  font-size: 11px;
}

.source-picker-clear {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(141, 169, 175, 0.14);
  border-radius: 8px;
  background: #141d25;
  color: rgba(224, 237, 237, 0.68);
  cursor: pointer;
}

.source-picker-clear:hover {
  border-color: rgba(255, 124, 124, 0.34);
  color: #ffb1b1;
}

.source-picker-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: auto;
}

.source-picker-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.source-picker-action span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-picker-action--local {
  border: 1px solid rgba(107, 235, 211, 0.32);
  background: #0d7568;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  box-shadow: 0 8px 18px rgba(8, 104, 92, 0.22);
}

.source-picker-action--local:hover {
  border-color: rgba(132, 244, 222, 0.52);
  background: #118b7c;
}

.prompt-version-editor {
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(0, 1.28fr);
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.prompt-version-meta {
  display: grid;
  gap: 10px;
  align-content: start;
}

.prompt-version-content {
  min-width: 0;
}

.prompt-version-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  grid-column: 1 / -1;
}

.prompt-textarea {
  min-height: 112px;
  height: 112px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  line-height: 1.5;
}

.image-generation-actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.form-grid--single {
  grid-template-columns: minmax(0, 1fr);
}

.filter-grid--library {
  margin-bottom: 12px;
}

.library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.library-toolbar__selection {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.library-toolbar__count {
  font-size: 11px;
  color: rgba(221, 228, 255, 0.72);
}

.library-toolbar__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.ghost-button--toolbar {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
}

.library-toolbar__delete {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  border-color: rgba(255, 120, 120, 0.18);
  color: #ffd4d4;
}

.library-toolbar__export {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 999px;
}

.library-results {
  display: grid;
  gap: 12px;
}

.library-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
}

.library-pagination__nav,
.library-pagination__size {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.library-pagination__text,
.library-pagination__size span {
  font-size: 12px;
  color: rgba(221, 228, 255, 0.76);
}

.library-pagination__select {
  width: 74px;
}

label {
  display: grid;
  gap: 8px;
}

label span {
  font-size: 12px;
  color: rgba(231, 237, 255, 0.9);
  font-weight: 600;
}

.input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid rgba(99, 118, 182, 0.28);
  background: rgba(13, 24, 44, 0.92);
  color: #f4f7ff;
  font-size: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.input--compact {
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
}

.field-hint {
  color: rgba(224, 231, 255, 0.5);
  font-size: 11px;
  line-height: 1.4;
  min-height: 16px;
}

.field-hint--placeholder {
  visibility: hidden;
}

.upload-dropzone {
  margin-top: 14px;
  width: 100%;
  min-height: 92px;
  border: 1px dashed rgba(123, 142, 255, 0.32);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(28, 37, 62, 0.74), rgba(16, 24, 43, 0.82));
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 14px 12px;
  text-align: center;
  color: rgba(229, 236, 255, 0.82);
  cursor: pointer;
}

.upload-dropzone strong {
  font-size: 13px;
}

.upload-dropzone span {
  font-size: 11px;
  color: rgba(205, 214, 243, 0.64);
}

.upload-dropzone__icon {
  width: 16px;
  height: 16px;
}

.pick-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.pick-row--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.primary-button,
.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.primary-button {
  background: linear-gradient(135deg, #8852ff, #6d7cff);
  color: #ffffff;
  box-shadow: 0 16px 30px rgba(106, 103, 255, 0.24);
}

.primary-button--soft,
.ghost-button {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
  color: #f3f6ff;
}

.primary-button:disabled,
.ghost-button:disabled,
.icon-action:disabled,
.ghost-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.picked-list {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.empty-copy {
  color: rgba(224, 231, 255, 0.72);
}

.path-chip,
.queue-file {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 10px;
  color: #f8fbff;
  font-size: 11px;
}

.path-chip {
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(30, 40, 64, 0.72), rgba(18, 26, 44, 0.86));
  overflow: hidden;
}

.queue-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 12px 0;
}

.queue-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.queue-card__type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(125, 99, 255, 0.24);
  color: #d8cfff;
  font-size: 11px;
  font-weight: 700;
}

.queue-card__title strong {
  font-size: 12px;
}

.queue-card__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 10px;
}

.queue-stat {
  padding: 12px 8px;
  text-align: center;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.queue-stat:last-child {
  border-right: 0;
}

.queue-stat__value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.queue-stat__label {
  margin-top: 6px;
  color: rgba(214, 223, 255, 0.74);
  font-size: 11px;
}

.queue-card__files {
  display: grid;
  gap: 6px;
  padding: 10px 12px 12px;
}

.queue-file {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.queue-file__name {
  display: flex;
  align-items: center;
  gap: 12px;
}

.queue-file__meta {
  color: rgba(214, 223, 255, 0.74);
  font-size: 11px;
}

.queue-tip {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(231, 237, 255, 0.82);
}

.status-pill {
  align-self: start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.status-pill--small {
  min-height: 20px;
  padding: 0 7px;
  font-size: 10px;
}

.status-pill.is-success {
  background: rgba(38, 201, 131, 0.14);
  color: #b7f4d7;
}

.status-pill.is-warning {
  background: rgba(255, 198, 92, 0.14);
  color: #ffd69f;
}

.status-pill.is-danger {
  background: rgba(255, 94, 94, 0.14);
  color: #ffb7b7;
}

.status-pill.is-info {
  background: rgba(98, 167, 255, 0.14);
  color: #c6e1ff;
}

.panel__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(224, 231, 255, 0.68);
  font-size: 10px;
}

.album-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(8, minmax(0, 1fr));
}

.parser-video-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.parser-video-card {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(20, 29, 50, 0.92), rgba(10, 17, 31, 0.92));
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.parser-video-card:hover,
.parser-video-card.is-selected {
  transform: translateY(-1px);
  border-color: rgba(106, 122, 255, 0.42);
  box-shadow: 0 14px 30px rgba(44, 72, 158, 0.22);
}

.parser-video-card__thumb,
.parser-video-card__placeholder {
  width: 100%;
  aspect-ratio: 9 / 16;
  border-radius: 14px;
  overflow: hidden;
}

.parser-video-card__thumb {
  object-fit: cover;
}

.parser-video-card__placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(227, 233, 255, 0.5);
  letter-spacing: 0.18em;
  font-size: 11px;
}

.parser-video-card__body {
  display: grid;
  gap: 4px;
}

.parser-video-card__body strong {
  font-size: 13px;
  line-height: 1.35;
}

.parser-video-card__body span {
  font-size: 11px;
  color: rgba(227, 233, 255, 0.72);
}

.album-card {
  min-width: 0;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(82, 102, 176, 0.24);
  background:
    linear-gradient(180deg, rgba(24, 34, 61, 0.98), rgba(17, 24, 44, 0.98)),
    rgba(12, 18, 33, 0.95);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 20px rgba(4, 10, 24, 0.24);
}

.album-card__media {
  position: relative;
  aspect-ratio: 0.98 / 1;
  overflow: hidden;
  border-bottom: 1px solid rgba(88, 108, 186, 0.16);
}

.album-thumb-button {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.select-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(10, 16, 30, 0.68);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}

.select-checkbox--active {
  background: linear-gradient(135deg, rgba(106, 82, 255, 0.94), rgba(62, 127, 255, 0.92));
  border-color: rgba(152, 137, 255, 0.5);
}

.album-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.25s ease;
}

.album-card:hover .album-thumb {
  transform: scale(1.04);
}

.album-card__overlay {
  position: absolute;
  inset: 0;
  padding: 8px 8px 8px 40px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: linear-gradient(180deg, rgba(7, 11, 20, 0.54), rgba(7, 11, 20, 0.02) 42%, rgba(7, 11, 20, 0.3));
}

.album-card__actions-top {
  display: flex;
  gap: 6px;
}

.album-card__body {
  display: grid;
  gap: 6px;
  padding: 12px;
}

.album-card__topline,
.album-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.album-card__topline strong {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-card__topline span,
.album-card__meta span {
  color: rgba(224, 231, 255, 0.72);
  font-size: 11px;
}

.album-card__category {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(232, 237, 255, 0.86);
}

.album-card__category--derived {
  background: rgba(244, 201, 93, 0.14);
  color: #f4c95d;
}

.album-card__status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.album-card__select {
  display: grid;
  gap: 6px;
  margin-top: 2px;
}

.album-card__select span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(224, 231, 255, 0.76);
}

.icon-action,
.ghost-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(26, 18, 33, 0.34);
  color: #f8fbff;
}

.icon-action {
  width: 26px;
  height: 26px;
  backdrop-filter: blur(10px);
}

.icon-action--danger {
  background: rgba(255, 94, 94, 0.18);
  border-color: rgba(255, 94, 94, 0.28);
}

.ghost-chip {
  padding: 5px 8px;
  font-size: 11px;
}

.ghost-chip--mini {
  min-height: 24px;
  padding: 0 8px;
  color: rgba(225, 231, 255, 0.78);
}

.usage-chip {
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.usage-chip--unused {
  background: rgba(118, 201, 151, 0.18);
  color: #e4fff2;
}

.usage-chip--used {
  background: rgba(52, 219, 180, 0.16);
  color: #79f4cf;
}

.footer-card {
  min-height: 50px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(231, 237, 255, 0.82);
}

.notice {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
}

.notice--success {
  background: rgba(38, 201, 131, 0.14);
  color: #b7f4d7;
}

.notice--danger {
  background: rgba(255, 94, 94, 0.14);
  color: #ffb7b7;
}

.icon {
  width: 16px;
  height: 16px;
}

.icon--small {
  width: 18px;
  height: 18px;
}

.icon--tiny {
  width: 14px;
  height: 14px;
}

.spin {
  animation: spin 1s linear infinite;
}

@media (max-width: 1600px) {
  .hero-card,
  .workspace-card__head {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-card__stats {
    width: 100%;
  }

  .metric-card {
    flex: 1;
  }

  .album-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

@media (max-width: 1280px) {
  .workspace-grid,
  .image-generation-grid,
  .prompt-version-editor,
  .form-grid,
  .filter-grid,
  .pick-row {
    grid-template-columns: 1fr;
  }

  .queue-card__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .album-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .hero-card {
    padding: 24px;
  }

  .hero-card h1 {
    font-size: 38px;
  }

  .metric-card {
    min-width: 0;
  }

  .tabs-shell {
    width: 100%;
    justify-content: stretch;
  }

  .tab-button {
    flex: 1;
    min-width: 0;
  }

  .album-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .hero-card__stats,
  .queue-card__stats {
    grid-template-columns: 1fr;
  }

  .hero-card__stats {
    display: grid;
  }

  .album-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .section-head--library,
  .section-head__lead,
  .queue-file,
  .queue-file__name {
    flex-direction: column;
    align-items: flex-start;
  }

  .library-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .library-toolbar__selection {
    justify-content: space-between;
    width: 100%;
  }

  .prompt-version-editor {
    grid-template-columns: 1fr;
  }

  .prompt-version-actions {
    grid-column: auto;
  }

  .source-picker-panel {
    grid-template-columns: 96px minmax(0, 1fr);
  }

  .source-picker-preview {
    width: 96px;
    height: 96px;
  }

  .source-picker-actions {
    grid-template-columns: 1fr;
    margin-top: 12px;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* Premium workspace treatment: restrained graphite surfaces with one clear accent. */
.materials-workbench {
  gap: 12px;
  color: #eef4f4;
}

.hero-card,
.workspace-card,
.footer-card,
.panel {
  border-color: rgba(141, 169, 175, 0.16);
  border-radius: 20px;
  background: #10151d;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.workspace-card {
  background: #0f141b;
}

.workspace-card__icon,
.hero-card__eyebrow-icon {
  background: #0c6d61;
  box-shadow: 0 8px 22px rgba(16, 185, 164, 0.16);
}

.tabs-shell {
  padding: 5px;
  border-radius: 14px;
  background: #0b1017;
  border-color: rgba(141, 169, 175, 0.13);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.tab-button {
  min-height: 38px;
  border-radius: 10px;
  color: rgba(226, 237, 238, 0.68);
}

.tab-button:hover {
  background: rgba(92, 211, 191, 0.08);
  color: #d8f7f1;
}

.tab-button.active {
  background: #0d5d55;
  border-color: rgba(91, 220, 199, 0.42);
  color: #ecfffb;
  box-shadow: 0 8px 20px rgba(11, 118, 103, 0.22);
}

.tab-badge {
  background: rgba(231, 255, 250, 0.12);
  color: #c9f2e9;
}

.panel--feature,
.panel--queue,
.panel--library {
  background: #111720;
}

.section-head {
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(141, 169, 175, 0.1);
}

.section-head__badge,
.section-head__badge--image {
  background: #0c6d61;
  box-shadow: 0 7px 18px rgba(16, 185, 164, 0.15);
}

.section-head h2 {
  font-size: 15px;
  letter-spacing: 0.01em;
}

.section-head p,
.workspace-card__hint {
  color: rgba(210, 226, 227, 0.6);
}

.image-generation-grid {
  gap: 16px;
  margin-bottom: 18px;
}

.upload-dropzone:hover {
  border-color: rgba(89, 225, 202, 0.72);
  background: #11272a;
}

.upload-dropzone__icon {
  color: #42cfb7;
}

.prompt-version-editor {
  padding: 16px 0 2px;
  border-top-color: rgba(141, 169, 175, 0.12);
}

.prompt-version-meta {
  padding: 12px;
  border: 1px solid rgba(141, 169, 175, 0.1);
  border-radius: 14px;
  background: #0d131a;
}

.prompt-version-content {
  padding: 12px;
  border: 1px solid rgba(141, 169, 175, 0.1);
  border-radius: 14px;
  background: #0d131a;
}

.prompt-version-actions {
  padding-top: 2px;
}

.input {
  border-color: rgba(141, 169, 175, 0.25);
  border-radius: 10px;
  background: #0a1016;
  color: #ecf8f6;
}

.input:hover,
.input:focus {
  border-color: rgba(76, 210, 188, 0.68);
  outline: none;
  box-shadow: 0 0 0 3px rgba(53, 186, 165, 0.1);
}

.primary-button,
.ghost-button {
  border-radius: 10px;
}

.primary-button {
  background: #0d7568;
  border-color: rgba(107, 235, 211, 0.32);
  box-shadow: 0 8px 18px rgba(8, 104, 92, 0.22);
}

.primary-button:hover:not(:disabled) {
  background: #118b7c;
}

.generate-button {
  min-height: 46px;
  min-width: 184px;
  padding: 0 14px 0 10px;
  border-radius: 13px;
  gap: 10px;
  background: linear-gradient(135deg, #119b87 0%, #087267 58%, #07564f 100%);
  border-color: rgba(135, 255, 227, 0.52);
  box-shadow: 0 10px 24px rgba(5, 121, 105, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.generate-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #18b79f 0%, #0b8c7c 58%, #07655d 100%);
  border-color: rgba(160, 255, 235, 0.78);
  box-shadow: 0 14px 28px rgba(5, 147, 127, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.generate-button:active:not(:disabled) {
  transform: translateY(0);
}

.generate-button:disabled {
  opacity: 0.48;
  box-shadow: none;
}

.generate-button__icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(2, 49, 45, 0.38);
  border: 1px solid rgba(179, 255, 239, 0.25);
}

.generate-button__arrow {
  margin-left: auto;
  font-size: 18px;
  line-height: 1;
  opacity: 0.82;
  transition: transform 0.2s ease;
}

.generate-button:hover:not(:disabled) .generate-button__arrow {
  transform: translateX(3px);
}

.image-generation-actions .generate-button {
  min-width: 208px;
}

.ghost-button {
  background: #171f29;
  border-color: rgba(141, 169, 175, 0.16);
  color: #dcebea;
}

.ghost-button:hover:not(:disabled) {
  background: #1c2b31;
  border-color: rgba(76, 210, 188, 0.42);
  color: #f0fffc;
}
</style>
