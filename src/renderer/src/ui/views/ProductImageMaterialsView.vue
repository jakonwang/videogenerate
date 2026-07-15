<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Check,
  Boxes,
  CloudUpload,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Link2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  TriangleAlert,
} from 'lucide-vue-next'

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

const { locale } = useI18n()
const DESKTOP_USER_ID = 'desktop-local'

const activeTab = ref<'batch' | 'background' | 'library'>('batch')
const categories = ref<Category[]>(['necklace', 'ring', 'earring', 'bracelet'])
const selectedCategory = ref<Category>('necklace')
const pickedVideos = ref<string[]>([])
const batches = ref<BatchItem[]>([])
const materials = ref<MaterialItem[]>([])
const products = ref<ProductItem[]>([])
const filterCategory = ref<'all' | Category>('all')
const filterUsageStatus = ref<'all' | UsageStatus>('all')
const libraryPage = ref(1)
const backgroundPage = ref(1)
const libraryPageSize = ref(24)
const selectedMaterialIds = ref<string[]>([])
const backgroundMaterialCount = ref(3)
const selectedBackgroundMaterialIds = ref<string[]>([])
const loading = ref(false)
const submitting = ref(false)
const backgroundSubmitting = ref(false)
const actionBusyId = ref('')
const errorText = ref('')
const notice = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

const copy = computed(() => {
  if (locale.value === 'vi-VN') {
    return {
      kicker: 'Kho vat lieu hinh anh san pham',
      title: 'Xu ly hang loat, quan ly hieu qua',
      subtitle: 'Tach video theo loat, lay khung hinh giua an toan, tai len Qiniu va duy tri thu vien anh co the tai su dung cho Hermes.',
      batches: 'Lo batch',
      materials: 'Vat lieu',
      processingCount: 'Dang xu ly',
      completedCount: 'Hoan thanh',
      workspace: 'Khong gian lam viec',
      workspaceHint: 'Chuyen nhanh giua xu ly batch va thu vien vat lieu',
      batchTab: 'Tao batch',
      libraryTab: 'Thu vien vat lieu',
      createBatch: 'Tao batch',
      createBatchDesc: 'Chon danh muc co dinh va dua nhieu video vao hang doi xu ly.',
      queue: 'Hang doi xu ly',
      queueDesc: 'Tien trinh duoc tiep tuc tu dong va lam moi sau moi 4 giay.',
      category: 'Danh muc',
      pickZoneTitle: 'Chon tep video',
      pickZoneDesc: 'Ho tro chon nhieu tep hoac keo tha vao khu vuc nay.',
      pickZoneFormats: 'Ho tro MP4 / MOV / AVI va cac dinh dang pho bien.',
      pickVideos: 'Chon video',
      queueBatch: 'Them vao hang doi',
      noVideosSelected: 'Chua chon video.',
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
      kicker: '商品图片素材库',
      title: '批量处理，高效管理',
      subtitle: '批量拆分视频，提取安全中帧，上传到七牛，并维护可供 Hermes 复用的图片素材库。',
      batches: '批次',
      materials: '素材',
      processingCount: '处理中',
      completedCount: '已完成',
      workspace: '工作区',
      workspaceHint: '在批次处理与素材相册之间快速切换',
      batchTab: '创建批次',
      libraryTab: '素材库',
      createBatch: '创建批次',
      createBatchDesc: '选择固定分类后，将多个源视频加入处理队列。',
      queue: '处理队列',
      queueDesc: '应用启动后会自动续跑，每 4 秒刷新一次状态。',
      category: '分类',
      segmentTime: '分镜时长（秒）',
      segmentHint: '建议 2-5 秒，过短增加数量，过长影响节奏。',
      pickZoneTitle: '选择视频文件',
      pickZoneDesc: '支持批量选择，或将文件拖拽到此区域',
      pickZoneFormats: '支持 MP4 / MOV / AVI 等常见格式',
      pickVideos: '选择视频',
      queueBatch: '加入队列',
      noVideosSelected: '暂未选择视频。',
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
    kicker: 'Product Image Materials',
    title: 'Batch processing, efficient management',
    subtitle: 'Split videos in batches, extract safe middle frames, upload to Qiniu, and maintain a reusable image-material library for Hermes.',
    batches: 'Batches',
    materials: 'Materials',
    processingCount: 'Processing',
    completedCount: 'Completed',
    workspace: 'Workspace',
    workspaceHint: 'Switch quickly between batch processing and the material album',
    batchTab: 'Create Batch',
    libraryTab: 'Material Library',
    createBatch: 'Create Batch',
    createBatchDesc: 'Choose a fixed category and queue multiple source videos.',
    queue: 'Processing Queue',
    queueDesc: 'Processing resumes automatically and refreshes every 4 seconds.',
    category: 'Category',
    segmentTime: 'Segment Time (sec)',
    segmentHint: 'Use 2-5 seconds to balance volume and pacing.',
    pickZoneTitle: 'Select video files',
    pickZoneDesc: 'Supports multi-select or dragging files into this area.',
    pickZoneFormats: 'Supports MP4 / MOV / AVI and common formats.',
    pickVideos: 'Pick Videos',
    queueBatch: 'Queue Batch',
    noVideosSelected: 'No videos selected.',
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

const backgroundCopy = {
  tab: '背景生成',
  desc: '选择原始素材，批量生成相似背景图，同时保持产品主体不变。',
  hint: '衍生图片会清晰标记，并默认从来源选择器中隐藏。',
  materialCount: '每张生成数量',
  generate: '生成背景变体',
  sourceOnly: '仅看原图',
  clearSelection: '清空选择',
  selected: '已选',
  totalOutput: '总输出',
  origin: '来源',
  original: '原始',
  derived: '已衍生',
  derivedFrom: '衍生自',
  success: '背景变体已生成。',
} as const

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

const canSubmit = computed(() => pickedVideos.value.length > 0 && !submitting.value)

const filteredMaterials = computed(() =>
  materials.value.filter((item) => {
    if (filterCategory.value !== 'all' && item.category !== filterCategory.value) return false
    if (filterUsageStatus.value !== 'all' && item.usageStatus !== filterUsageStatus.value) return false
    return true
  }),
)
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
  return value === 'derived' ? backgroundCopy.derived : backgroundCopy.original
}

function backgroundMaterialTitle(item: MaterialItem) {
  if (item.materialOrigin === 'derived') {
    const source = shortMaterialId(item.derivedFromMaterialId || '')
    return `${backgroundCopy.derivedFrom} ${source}`
  }
  return `${copy.value.segment} ${item.segmentIndex + 1}`
}

async function loadAll() {
  loading.value = true
  try {
    const [nextCategories, nextBatches, nextMaterials, nextProducts] = await Promise.all([
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
    ])
    categories.value = nextCategories
    batches.value = nextBatches
    materials.value = nextMaterials
    products.value = nextProducts
    const validIds = new Set(nextMaterials.map((item) => item.id))
    selectedMaterialIds.value = selectedMaterialIds.value.filter((item) => validIds.has(item))
    selectedBackgroundMaterialIds.value = selectedBackgroundMaterialIds.value.filter((item) => validIds.has(item))
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    loading.value = false
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

async function pickVideos() {
  const files = await window.api.pickFiles({
    title: copy.value.selectSourceVideos,
    multiple: true,
    filters: [{ name: copy.value.videoFilter, extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
  })
  pickedVideos.value = Array.from(new Set((files || []).map(String).filter(Boolean)))
}

async function submitBatch() {
  if (!canSubmit.value) return
  submitting.value = true
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.productImageMaterials.createBatch({
      userId: DESKTOP_USER_ID,
      category: selectedCategory.value,
      sourceVideoPaths: Array.from(pickedVideos.value),
    })
    pickedVideos.value = []
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
    })
    selectedBackgroundMaterialIds.value = []
    notice.value = `${backgroundCopy.success} ${result.count}`
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
  refreshTimer = setInterval(() => {
    void loadAll()
  }, 4000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="materials-workbench">
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
          <div>
            <div class="workspace-card__title">{{ copy.workspace }}</div>
            <div class="workspace-card__hint">{{ copy.workspaceHint }}</div>
          </div>
        </div>

        <div class="tabs-shell">
          <button class="tab-button" :class="{ active: activeTab === 'batch' }" type="button" @click="activeTab = 'batch'">
            <Sparkles class="icon icon--small" />
            <span>{{ copy.batchTab }}</span>
          </button>
          <button class="tab-button" :class="{ active: activeTab === 'library' }" type="button" @click="activeTab = 'library'">
            <ImageIcon class="icon icon--small" />
            <span>{{ copy.libraryTab }}</span>
            <span class="tab-badge">{{ materials.length }}</span>
          </button>
          <button class="tab-button" :class="{ active: activeTab === 'background' }" type="button" @click="activeTab = 'background'">
            <ImageIcon class="icon icon--small" />
            <span>{{ backgroundCopy.tab }}</span>
            <span class="tab-badge">{{ backgroundSourceMaterials.length }}</span>
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

          <button class="upload-dropzone" type="button" @click="pickVideos">
            <CloudUpload class="icon upload-dropzone__icon" />
            <strong>{{ copy.pickZoneTitle }}</strong>
            <span>{{ copy.pickZoneDesc }}</span>
            <span>{{ copy.pickZoneFormats }}</span>
          </button>

          <div class="pick-row">
            <button class="primary-button" type="button" @click="pickVideos">
              <FolderOpen class="icon" />
              {{ copy.pickVideos }}
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

      <section v-else-if="activeTab === 'background'" class="panel panel--library">
        <div class="section-head section-head--library">
          <div class="section-head__lead">
            <div class="section-head__badge section-head__badge--image">
              <Sparkles class="icon icon--small" />
            </div>
            <div>
              <h2>{{ backgroundCopy.tab }}</h2>
              <p>{{ backgroundCopy.desc }}</p>
            </div>
          </div>
          <div class="panel__hint">
            <span>{{ backgroundCopy.hint }}</span>
            <Info class="icon icon--tiny" />
          </div>
        </div>

        <div class="filter-grid filter-grid--library">
          <label>
            <span>{{ backgroundCopy.materialCount }}</span>
            <input v-model.number="backgroundMaterialCount" class="input" type="number" min="1" max="6" step="1" />
          </label>
          <label>
            <span>{{ backgroundCopy.totalOutput }}</span>
            <input class="input" :value="backgroundTotalOutput" disabled />
          </label>
        </div>

        <div v-if="backgroundSourceMaterials.length" class="library-toolbar">
          <div class="library-toolbar__selection">
            <button class="ghost-button ghost-button--toolbar" type="button" @click="toggleSelectAllBackgroundVisible">
              {{ allBackgroundVisibleSelected ? backgroundCopy.clearSelection : backgroundCopy.sourceOnly }}
            </button>
            <span class="library-toolbar__count">{{ backgroundCopy.selected }} {{ selectedBackgroundMaterialIds.length }}</span>
          </div>
          <div class="library-toolbar__actions">
            <button
              class="ghost-button library-toolbar__delete"
              type="button"
              :disabled="!selectedBackgroundMaterialIds.length || backgroundSubmitting"
              @click="clearSelectedBackgroundMaterials"
            >
              <Trash2 class="icon" />
              {{ backgroundCopy.clearSelection }}
            </button>
            <button
              class="primary-button library-toolbar__export"
              type="button"
              :disabled="!selectedBackgroundMaterialIds.length || backgroundSubmitting"
              @click="generateBackgroundVariants"
            >
              <RefreshCcw class="icon" :class="{ spin: backgroundSubmitting }" />
              {{ backgroundCopy.generate }}
            </button>
          </div>
        </div>

        <div v-if="!backgroundSourceMaterials.length" class="empty-copy">{{ copy.noMaterials }}</div>
        <div v-else class="library-results">
          <div class="album-grid">
            <article v-for="item in pagedBackgroundMaterials" :key="item.id" class="album-card">
              <div class="album-card__media">
                <img class="album-thumb" :src="item.qiniuUrl" alt="material" />
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
              <h2>{{ copy.materialLibrary }}</h2>
              <p>{{ copy.materialLibraryDesc }}</p>
            </div>
          </div>
          <div class="panel__hint">
            <span>{{ copy.materialLibraryHint }}</span>
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
              <img class="album-thumb" :src="item.qiniuUrl" alt="material" />
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
                <span v-if="item.materialOrigin === 'derived'">{{ backgroundCopy.derivedFrom }} {{ shortMaterialId(item.derivedFromMaterialId || '') }}</span>
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
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
