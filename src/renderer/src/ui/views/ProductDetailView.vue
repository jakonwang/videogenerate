<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  Edit3,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  LayoutList,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import VideoPreviewModal from '../components/VideoPreviewModal.vue'

type ProductType =
  | 'phone_case'
  | 'earring'
  | 'necklace'
  | 'ring'
  | 'bracelet'
  | 'clothes'
  | 'bag'
  | 'shoes'
  | 'toy'
  | 'general'
type GalleryViewMode = 'grid' | 'list'

type ProductImageAsset = {
  id: string
  productId: string
  filePath: string
  fileName: string
  fileSize: number
  width?: number
  height?: number
  thumbnailPath?: string | null
  createdAt: number
  updatedAt: number
  isCover?: boolean
}

type ProductCanonicalDiagnostic = {
  originalPath: string
  sanitizedPath?: string
  status: 'kept' | 'sanitized' | 'failed'
  note?: string
  prompt?: string
  fallbackToOriginal?: boolean
}

type ProductAnalysis = {
  category?: string
  summary?: string
  coreSubject?: string
  connectionStructure?: string
  materialDetails?: string
  wearingPosition?: string
  surfaceDetails?: string
  colorDetails?: string
  geometryDetails?: string
  sizeScale?: string
  matchingRules?: string[]
}

type Product = {
  id: string
  name: string
  type: ProductType
  images?: ProductImageAsset[]
  coverImagePath?: string
  livePhotoReferenceImagePath?: string
  remark?: string
  analysisBoardPath?: string
  analysisBoardStatus?: 'idle' | 'processing' | 'done' | 'failed'
  analysisBoardPrompt?: string
  analysisBoardDiagnostics?: ProductCanonicalDiagnostic[]
  analysisBoardUpdatedAt?: number
  canonicalSourcePath?: string
  canonicalSourceStatus?: 'idle' | 'processing' | 'done' | 'failed'
  canonicalSourcePrompt?: string
  canonicalSourceDiagnostics?: ProductCanonicalDiagnostic[]
  canonicalSourceUpdatedAt?: number
  productAnalysis?: ProductAnalysis
  assets?: Record<string, Array<{ filePath?: string }>>
  createdAt: number
  updatedAt: number
}

type FeedbackTone = 'info' | 'success' | 'error'

const route = useRoute()
const router = useRouter()
const list = ref<Product[]>([])
const previewOpen = ref(false)
const previewSrc = ref<string | null>(null)
const previewTitle = ref('')
const editingName = ref(false)
const editingType = ref(false)
const nameDraft = ref('')
const typeDraft = ref<ProductType>('phone_case')
const remarkDraft = ref('')
const savingName = ref(false)
const savingType = ref(false)
const savingRemark = ref(false)
const uploading = ref(false)
const refreshingAnalysisBoard = ref(false)
const refreshingProductAnalysis = ref(false)
const analysisBoardPollTimer = ref<ReturnType<typeof window.setInterval> | null>(null)
const feedback = ref('')
const feedbackTone = ref<FeedbackTone>('info')
const galleryViewMode = ref<GalleryViewMode>('grid')

const productTypeOptionsV2: Array<{ value: ProductType; label: string }> = [
  { value: 'phone_case', label: '手机壳' },
  { value: 'earring', label: '耳环' },
  { value: 'necklace', label: '项链' },
  { value: 'ring', label: '戒指' },
  { value: 'bracelet', label: '手链' },
  { value: 'clothes', label: '服饰' },
  { value: 'bag', label: '包袋' },
  { value: 'shoes', label: '鞋靴' },
  { value: 'toy', label: '玩具' },
  { value: 'general', label: '通用商品' },
]

const productId = computed(() => String(route.params.productId || '').trim())
const selected = computed(() => list.value.find((item) => item.id === productId.value) ?? null)
const selectedImages = computed(() => (selected.value?.images ?? []).slice(0, 1))
const hasImages = computed(() => selectedImages.value.length > 0)
const livePhotoReferenceImagePath = computed(() => String(selected.value?.livePhotoReferenceImagePath || '').trim())
const canonicalSourcePath = computed(() => String(selected.value?.canonicalSourcePath || '').trim())
const analysisBoardPath = computed(() => String(selected.value?.analysisBoardPath || '').trim())
const analysisBoardDiagnostics = computed(() => selected.value?.analysisBoardDiagnostics ?? selected.value?.canonicalSourceDiagnostics ?? [])
const selectedImageCount = computed(() => selectedImages.value.length)
const analysisBoardReady = computed(() => selected.value?.analysisBoardStatus === 'done' || Boolean(analysisBoardPath.value))
const canonicalSourceReady = computed(() => selected.value?.canonicalSourceStatus === 'done' || Boolean(canonicalSourcePath.value))
const canonicalStageStatus = computed<Product['canonicalSourceStatus']>(() => {
  if (canonicalSourcePath.value) return 'done'
  return selected.value?.canonicalSourceStatus ?? 'idle'
})
const analysisBoardStageStatus = computed<Product['analysisBoardStatus']>(() => {
  if (analysisBoardPath.value) return 'done'
  return selected.value?.analysisBoardStatus ?? 'idle'
})
const productAnalysisSnapshot = computed(() => {
  const analysis = selected.value?.productAnalysis
  if (!analysis) return null
  return {
    category: String(analysis.category || '').trim(),
    summary: String(analysis.summary || '').trim(),
    coreSubject: String(analysis.coreSubject || '').trim(),
    connectionStructure: String(analysis.connectionStructure || '').trim(),
    materialDetails: String(analysis.materialDetails || '').trim(),
    wearingPosition: String(analysis.wearingPosition || '').trim(),
    surfaceDetails: String(analysis.surfaceDetails || '').trim(),
    colorDetails: String(analysis.colorDetails || '').trim(),
    geometryDetails: String(analysis.geometryDetails || '').trim(),
    sizeScale: String(analysis.sizeScale || '').trim(),
    matchingRules: Array.isArray(analysis.matchingRules)
      ? analysis.matchingRules.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  }
})
const productAnalysisSections = computed(() => {
  const analysis = productAnalysisSnapshot.value
  if (!analysis) return []
  return [
    { key: 'coreSubject', title: 'Core Subject', desc: analysis.coreSubject },
    { key: 'connectionStructure', title: 'Connection Structure', desc: analysis.connectionStructure },
    { key: 'materialDetails', title: 'Material Details', desc: analysis.materialDetails },
    { key: 'colorDetails', title: 'Color Details', desc: analysis.colorDetails },
    { key: 'geometryDetails', title: 'Geometry Details', desc: analysis.geometryDetails },
    { key: 'surfaceDetails', title: 'Surface Details', desc: analysis.surfaceDetails },
    { key: 'wearingPosition', title: 'Wearing / Display Position', desc: analysis.wearingPosition },
    { key: 'sizeScale', title: 'Size / Scale', desc: analysis.sizeScale },
  ].filter((item) => item.desc)
})
const productAnalysisPrimarySections = computed(() =>
  productAnalysisSections.value.filter((item) => item.key === 'coreSubject' || item.key === 'geometryDetails'),
)
const productAnalysisSecondarySections = computed(() =>
  productAnalysisSections.value.filter((item) => item.key !== 'coreSubject' && item.key !== 'geometryDetails'),
)
const productFlowActiveStep = computed(() => {
  if (!hasImages.value) return 1
  if (!canonicalSourceReady.value) return 2
  if (!analysisBoardReady.value) return 3
  if (analysisBoardReady.value) return 4
  return 2
})

const pageTitle = computed(() => selected.value?.name || '未找到商品')
const pageSubtitle = computed(() => {
  if (!selected.value) return '\u5f53\u524d\u5546\u54c1\u4e0d\u5b58\u5728\uff0c\u53ef\u80fd\u5df2\u7ecf\u88ab\u5220\u9664\u3002'
  if (!hasImages.value) return '\u8bf7\u5148\u4e0a\u4f20 1 \u5f20\u767d\u5e95\u3001\u65e0\u906e\u6321\u7684\u5546\u54c1\u56fe\u3002'
  if (refreshingAnalysisBoard.value) return '系统正在生成深层多角度图，并会在完成后自动补齐 Product DNA。'
  if (refreshingProductAnalysis.value) return '系统正在分析商品结构并提取 Product DNA，不会重新生成深层多角度图。'
  if (analysisBoardReady.value) return '深层多角度图与 Product DNA 已生成，可继续进入 /clone。'
  if (analysisBoardStageStatus.value === 'processing') return '系统正在生成深层多角度图，请稍后刷新查看结果。'
  if (analysisBoardStageStatus.value === 'failed') return '深层多角度图生成失败：仅支持白底纯商品单图，请更换图片后重试。'
  if (canonicalStageStatus.value === 'processing') return '\u7cfb\u7edf\u6b63\u5728\u6821\u9a8c\u767d\u5e95\u7eaf\u5546\u54c1\u56fe\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0\u67e5\u770b\u7ed3\u679c\u3002'
  if (canonicalStageStatus.value === 'failed') return '\u767d\u5e95\u7eaf\u5546\u54c1\u56fe\u6821\u9a8c\u672a\u901a\u8fc7\uff1a\u8bf7\u66f4\u6362\u767d\u5e95\u3001\u65e0\u906e\u6321\u3001\u7eaf\u5546\u54c1\u5355\u56fe\u3002'
  return '商品图已上传。点击“重新生成深层多角度图”开始手动生成。'
})
const stepItems = computed(() => [
  { number: 1, title: '\u4e0a\u4f20\u5355\u56fe', desc: hasImages.value ? '\u5df2\u5b8c\u6210' : '\u5f85\u5904\u7406' },
  { number: 2, title: '\u767d\u5e95\u6821\u9a8c', desc: canonicalStatusLabel(canonicalStageStatus.value) },
  { number: 3, title: '深层多角度图 + Product DNA', desc: canonicalStatusLabel(analysisBoardStageStatus.value) },
  { number: 4, title: '\u751f\u6210\u5b8c\u6210', desc: analysisBoardReady.value ? '\u53ef\u590d\u7528' : '\u5f85\u5904\u7406' },
])
const actionStatusText = computed(() => {
  if (refreshingAnalysisBoard.value) return '正在生成深层多角度图并同步补齐 DNA'
  if (refreshingProductAnalysis.value) return '正在获取 Product DNA'
  if (feedback.value) return feedback.value
  if (analysisBoardStageStatus.value === 'processing') return '深层多角度图任务进行中'
  if (analysisBoardStageStatus.value === 'failed') return '深层多角度图生成失败，可查看下方诊断'
  if (productAnalysisSnapshot.value) return '深层多角度图与 Product DNA 已可复用'
  return '等待手动触发生成'
})

function toFileUrl(filePath: string) {
  return `vg://file?path=${encodeURIComponent(filePath)}`
}

function isImagePath(filePath?: string) {
  return /\.(png|jpe?g|webp|bmp|gif)$/i.test(String(filePath || '').trim())
}

function resolveProductCoverPath(product: Product | null | undefined) {
  if (!product) return ''
  const explicit = String(product.coverImagePath || '').trim()
  if (explicit) return explicit
  const coverFromImages = String(
    product.images?.find((item) => item.isCover)?.filePath || product.images?.[0]?.filePath || '',
  ).trim()
  if (coverFromImages) return coverFromImages
  const legacy = Object.values(product.assets ?? {}).flatMap((items) => items ?? [])
  return String(legacy.find((item) => isImagePath(item?.filePath))?.filePath || '').trim()
}

function canonicalStatusLabel(status?: Product['canonicalSourceStatus']) {
  if (status === 'done') return '\u5df2\u5b8c\u6210'
  if (status === 'processing') return '\u5904\u7406\u4e2d'
  if (status === 'failed') return '\u5931\u8d25'
  return '\u5f85\u5904\u7406'
}
function canonicalStatusValue(status?: Product['canonicalSourceStatus']) {
  if (status === 'done') return '\u5df2\u5b8c\u6210'
  if (status === 'processing') return '\u5904\u7406\u4e2d'
  if (status === 'failed') return '\u5931\u8d25'
  return '\u5f85\u5904\u7406'
}
function canonicalStatusHint(status?: Product['canonicalSourceStatus']) {
  if (status === 'done') return '\u767d\u5e95\u7eaf\u5546\u54c1\u56fe\u6821\u9a8c\u901a\u8fc7\uff0c\u53ef\u7ee7\u7eed\u751f\u6210\u591a\u89d2\u5ea6\u5206\u6790\u753b\u677f\u3002'
  if (status === 'processing') return '\u7cfb\u7edf\u6b63\u5728\u6821\u9a8c\u767d\u5e95\u7eaf\u5546\u54c1\u56fe\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0\u3002'
  if (status === 'failed') return '\u767d\u5e95\u7eaf\u5546\u54c1\u56fe\u6821\u9a8c\u672a\u901a\u8fc7\uff0c\u8bf7\u66f4\u6362\u767d\u5e95\u3001\u65e0\u906e\u6321\u3001\u7eaf\u5546\u54c1\u5355\u56fe\u3002'
  return '\u5148\u4e0a\u4f20\u5355\u5f20\u5546\u54c1\u56fe\uff0c\u518d\u624b\u52a8\u70b9\u51fb\u751f\u6210\u3002'
}

function canonicalDiagnosticStatusLabel(status: ProductCanonicalDiagnostic['status']) {
  if (status === 'sanitized') return '已生成深层多角度图'
  if (status === 'kept') return '保留原图'
  return '处理失败'
}

function productTypeLabel(type: ProductType) {
  return productTypeOptionsV2.find((item) => item.value === type)?.label ?? '通用商品'
}

function shortFileName(filePath?: string) {
  const value = String(filePath || '').trim()
  if (!value) return '-'
  return value.split(/[/\\]/).pop() || value
}

function formatDateTime(ts?: number) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

function toPlainProduct(product: Product): Product {
  const raw = toRaw(product) as Product
  return {
    ...raw,
    assets: raw.assets ? Object.fromEntries(Object.entries(raw.assets).map(([key, items]) => [key, [...items]])) : undefined,
    images: (raw.images ?? []).map((item) => ({ ...item })),
    canonicalSourceDiagnostics: (raw.canonicalSourceDiagnostics ?? []).map((item) => ({ ...item })),
  }
}

async function saveProductPatch(patch: Partial<Product>) {
  if (!selected.value) return
  const base = toPlainProduct(selected.value)
  await window.api.products.upsert({
    ...base,
    ...patch,
  })
  await refresh()
}

async function refresh() {
  list.value = (await window.api.products.list()) as Product[]
  if (!selected.value) return
  nameDraft.value = selected.value.name ?? ''
  typeDraft.value = selected.value.type ?? 'phone_case'
  remarkDraft.value = selected.value.remark ?? ''
}

function stopCanonicalPolling() {
  if (analysisBoardPollTimer.value) {
    window.clearInterval(analysisBoardPollTimer.value)
    analysisBoardPollTimer.value = null
  }
}

function startCanonicalPolling() {
  stopCanonicalPolling()
  analysisBoardPollTimer.value = window.setInterval(async () => {
    await refresh()
    const status = selected.value?.analysisBoardStatus || selected.value?.canonicalSourceStatus
    if (status !== 'processing') {
      stopCanonicalPolling()
    }
  }, 1200)
}

async function saveProductName() {
  if (!selected.value) return
  const nextName = nameDraft.value.trim()
  if (!nextName) {
    feedbackTone.value = 'error'
    feedback.value = '商品名称不能为空'
    return
  }
  if (nextName === selected.value.name) {
    editingName.value = false
    return
  }
  savingName.value = true
  feedback.value = ''
  feedbackTone.value = 'info'
  try {
    await saveProductPatch({ name: nextName })
    editingName.value = false
    feedbackTone.value = 'success'
    feedback.value = '商品名称已更新。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '修改商品名称失败')
  } finally {
    savingName.value = false
  }
}

function startEditName() {
  if (!selected.value) return
  nameDraft.value = selected.value.name ?? ''
  editingName.value = true
}

function cancelEditName() {
  nameDraft.value = selected.value?.name ?? ''
  editingName.value = false
}

function startEditType() {
  if (!selected.value) return
  typeDraft.value = selected.value.type ?? 'phone_case'
  editingType.value = true
}

function cancelEditType() {
  typeDraft.value = selected.value?.type ?? 'phone_case'
  editingType.value = false
}

async function saveProductType() {
  if (!selected.value) return
  if (typeDraft.value === selected.value.type) {
    editingType.value = false
    return
  }
  savingType.value = true
  feedback.value = ''
  feedbackTone.value = 'info'
  try {
    await saveProductPatch({ type: typeDraft.value })
    editingType.value = false
    feedbackTone.value = 'success'
    feedback.value = '商品类型已更新。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '修改商品类型失败')
  } finally {
    savingType.value = false
  }
}

async function removeProduct() {
  if (!selected.value) return
  await window.api.products.remove(selected.value.id)
  void router.push('/products')
}

async function uploadImages() {
  if (!selected.value) return
  feedback.value = ''
  feedbackTone.value = 'info'
  uploading.value = true
  try {
    const pickFilesOverride = (window as any).__VG_TEST_pickFiles as
      | ((input: { title: string; multiple: boolean; filters: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>)
      | undefined
    const pickFiles = pickFilesOverride ?? window.api.pickFiles
    const paths = (await pickFiles({
      title: '选择商品图片素材',
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
    })) as string[]
    if (!paths.length) return

    const current = toPlainProduct(selected.value)
    const nextImages: ProductImageAsset[] = []
    for (const filePath of paths) {
      let fileSize = 0
      let width: number | undefined
      let height: number | undefined
      try {
        const info = await window.api.media.getInfo(filePath)
        fileSize = Number(info.fileSize ?? 0)
        width = typeof info.width === 'number' ? info.width : undefined
        height = typeof info.height === 'number' ? info.height : undefined
      } catch {
        // ignore local probe failure
      }
      nextImages.push({
        id: crypto.randomUUID(),
        productId: current.id,
        filePath,
        fileName: filePath.split(/[/\\]/).pop() ?? filePath,
        fileSize,
        width,
        height,
        thumbnailPath: filePath,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isCover: false,
      })
    }

    const merged = nextImages.slice(0, 1).map((item, index) => ({
      ...item,
      isCover: index === 0,
    }))

    await window.api.products.upsert({
      ...current,
      images: merged,
      coverImagePath: resolveProductCoverPath({ ...current, images: merged }) || merged[0]?.filePath || '',
      livePhotoReferenceImagePath: merged[0]?.filePath || '',
    })
    await refresh()
    feedbackTone.value = 'success'
    feedback.value = `已上传 ${nextImages.length} 张图片。`
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '上传图片失败')
  } finally {
    uploading.value = false
  }
}

async function setCover(imageId: string) {
  if (!selected.value) return
  const nextImages = (selected.value.images ?? []).map((item) => ({
    ...item,
    isCover: item.id === imageId,
    updatedAt: Date.now(),
  }))
  const cover = nextImages.find((item) => item.id === imageId)
  try {
    feedback.value = ''
    feedbackTone.value = 'info'
    await saveProductPatch({
      images: nextImages,
      coverImagePath: cover?.filePath,
      livePhotoReferenceImagePath: selected.value.livePhotoReferenceImagePath || cover?.filePath,
    })
    feedbackTone.value = 'success'
    feedback.value = '封面已更新。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '设置封面失败')
  }
}

async function removeImage(imageId: string) {
  if (!selected.value) return
  const nextImages: ProductImageAsset[] = []
  try {
    feedback.value = ''
    feedbackTone.value = 'info'
    await saveProductPatch({
      images: nextImages,
      coverImagePath: '',
      livePhotoReferenceImagePath: '',
    })
    feedbackTone.value = 'success'
    feedback.value = '标准原图已删除。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '删除图片失败')
  }
}

async function saveRemark() {
  if (!selected.value) return
  savingRemark.value = true
  feedback.value = ''
  feedbackTone.value = 'info'
  try {
    await saveProductPatch({ remark: remarkDraft.value })
    feedbackTone.value = 'success'
    feedback.value = '备注已保存。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '保存备注失败')
  } finally {
    savingRemark.value = false
  }
}

async function setLivePhotoReferenceImage(imageId: string) {
  if (!selected.value) return
  const target = (selected.value.images ?? []).find((item) => item.id === imageId)
  if (!target?.filePath) return
  try {
    feedback.value = ''
    feedbackTone.value = 'info'
    await saveProductPatch({
      livePhotoReferenceImagePath: target.filePath,
    })
    feedbackTone.value = 'success'
    feedback.value = 'Live Photo 产品主参考图已更新。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '设置 Live Photo 产品主参考图失败')
  }
}

async function refreshAnalysisBoard() {
  if (!selected.value) return
  feedbackTone.value = 'info'
  feedback.value = '已开始生成深层多角度图，完成后会自动补齐 Product DNA。'
  refreshingAnalysisBoard.value = true
  try {
    list.value = list.value.map((item) =>
      item.id === selected.value?.id
        ? {
            ...item,
            analysisBoardStatus: 'processing',
            analysisBoardUpdatedAt: Date.now(),
            canonicalSourceStatus: 'processing',
            canonicalSourceUpdatedAt: Date.now(),
          }
        : item,
    )
    await window.api.products.refreshCanonicalSource({ productId: selected.value.id, force: true })
    startCanonicalPolling()
    await refresh()
    feedbackTone.value = 'success'
    feedback.value = '深层多角度图任务已提交，请等待处理完成后自动刷新结果。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? '深层多角度图生成失败')
  } finally {
    refreshingAnalysisBoard.value = false
  }
}

async function refreshProductAnalysis() {
  if (!selected.value) return
  feedbackTone.value = 'info'
  feedback.value = '已开始获取 Product DNA，系统会直接分析当前商品图片与已有结果，不会重生成深层多角度图。'
  refreshingProductAnalysis.value = true
  try {
    await window.api.products.refreshProductAnalysis({ productId: selected.value.id })
    await refresh()
    feedbackTone.value = 'success'
    feedback.value = 'Product DNA 已刷新。'
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? 'Product DNA 获取失败')
  } finally {
    refreshingProductAnalysis.value = false
  }
}

function openPreview(filePath: string, title: string) {
  previewSrc.value = toFileUrl(filePath)
  previewTitle.value = title
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
  previewSrc.value = null
  previewTitle.value = ''
}

onMounted(refresh)
onMounted(startCanonicalPolling)
watch(productId, () => {
  stopCanonicalPolling()
  void refresh()
  startCanonicalPolling()
})
</script>

<template>
  <div class="product-detail-page" data-testid="product-detail-page">
    <section v-if="selected" class="detail-shell">
      <div class="top-area">
        <button class="back-button" data-testid="product-detail-back" type="button" @click="router.push('/products')">
          <ArrowLeft class="h-4 w-4" />
          <span>返回商品列表</span>
        </button>

        <div class="title-row">
          <div class="title-block">
            <template v-if="editingName">
              <div class="name-editor">
                <input
                  v-model="nameDraft"
                  class="name-editor__input"
                  data-testid="product-name-input"
                  type="text"
                  maxlength="80"
                  @keydown.enter.prevent="saveProductName"
                  @keydown.esc.prevent="cancelEditName"
                />
                <button class="name-editor__button name-editor__button--primary" :disabled="savingName" data-testid="product-name-save-button" type="button" @click="saveProductName">
                  {{ savingName ? '保存中...' : '保存' }}
                </button>
                <button class="name-editor__button" type="button" @click="cancelEditName">取消</button>
              </div>
            </template>
            <template v-else>
              <div class="title-inline">
                <h1 data-testid="product-detail-name">{{ pageTitle }}</h1>
                <button class="title-inline__edit" data-testid="product-name-edit-button" type="button" @click="startEditName">
                  <Edit3 class="h-4 w-4" />
                </button>
              </div>
            </template>
            <p>{{ pageSubtitle }}</p>
          </div>

          <div class="hero-actions">
            <button class="hero-button" :disabled="uploading" data-testid="product-upload-button" type="button" @click="uploadImages">
              <Upload class="h-4 w-4" />
              <span>{{ uploading ? '上传中...' : '上传标准原图' }}</span>
            </button>
            <button class="hero-button" :disabled="refreshingAnalysisBoard || !hasImages" data-testid="product-refresh-canonical-button" type="button" @click="refreshAnalysisBoard">
              <Sparkles class="h-4 w-4" />
              <span>{{ refreshingAnalysisBoard ? '生成中...' : '生成深层多角度图' }}</span>
            </button>
            <button class="hero-button hero-button--danger" data-testid="product-delete-button" type="button" @click="removeProduct">
              <Trash2 class="h-4 w-4" />
              <span>删除商品</span>
            </button>
          </div>
        </div>

        <div class="summary-strip">
          <div class="summary-item">
            <span>商品类型</span>
            <template v-if="editingType">
              <div class="type-editor">
                <label class="type-editor__field">
                  <select v-model="typeDraft" data-testid="product-type-select">
                    <option v-for="option in productTypeOptionsV2" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <div class="type-editor__actions">
                  <button
                    class="name-editor__button name-editor__button--primary"
                    :disabled="savingType"
                    data-testid="product-type-save-button"
                    type="button"
                    @click="saveProductType"
                  >
                    {{ savingType ? '保存中...' : '保存' }}
                  </button>
                  <button class="name-editor__button" type="button" @click="cancelEditType">取消</button>
                </div>
              </div>
            </template>
            <template v-else>
              <strong class="summary-item__inline">
                {{ productTypeLabel(selected.type) }}
                <button class="summary-item__edit" data-testid="product-type-edit-button" type="button" @click="startEditType">
                  <Edit3 class="h-3.5 w-3.5" />
                </button>
              </strong>
            </template>
          </div>
          <div class="summary-item">
            <span>图片资产</span>
            <strong>{{ selectedImageCount }} 张</strong>
          </div>
          <div class="summary-item">
            <span>分析状态</span>
            <strong class="summary-item__status">
              <i :class="`status-dot status-dot--${analysisBoardStageStatus || canonicalStageStatus || 'idle'}`"></i>
              {{ `深层多角度图 ${canonicalStatusValue(analysisBoardStageStatus)} / Product DNA ${productAnalysisSnapshot ? '已生成' : '待生成'}` }}
            </strong>
          </div>
          <div class="summary-item">
            <span>更新时间</span>
            <strong>{{ formatDateTime(selected.analysisBoardUpdatedAt ?? selected.canonicalSourceUpdatedAt ?? selected.updatedAt) }}</strong>
          </div>
          <div class="summary-item">
            <span>创建时间</span>
            <strong>{{ formatDateTime(selected.createdAt) }}</strong>
          </div>
          <div class="summary-item">
            <span>ID</span>
            <strong class="summary-item__id">
              {{ selected.id.slice(0, 8) }}
              <Copy class="h-4 w-4" />
            </strong>
          </div>
        </div>
      </div>

      <div class="action-banner" :class="`action-banner--${feedbackTone}`">
        <div class="action-banner__main">
          <strong>当前操作</strong>
          <p>{{ actionStatusText }}</p>
        </div>
        <span v-if="refreshingAnalysisBoard" class="action-banner__tag">画板生成中</span>
        <span v-else-if="refreshingProductAnalysis" class="action-banner__tag">DNA 分析中</span>
      </div>

      <p v-if="feedback" class="detail-feedback" :class="`detail-feedback--${feedbackTone}`" data-testid="product-detail-feedback">{{ feedback }}</p>

      <div class="content-grid">
        <div class="left-column">
          <article class="panel-card image-panel">
            <div class="panel-head">
              <strong>商品图片 ({{ selectedImageCount }})</strong>
              <div class="panel-head__tools">
                <div class="view-toggle">
                  <button
                    type="button"
                    class="view-toggle__button"
                    :class="{ 'view-toggle__button--active': galleryViewMode === 'grid' }"
                    @click="galleryViewMode = 'grid'"
                  >
                    <Grid2X2 class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="view-toggle__button"
                    :class="{ 'view-toggle__button--active': galleryViewMode === 'list' }"
                    @click="galleryViewMode = 'list'"
                  >
                    <LayoutList class="h-4 w-4" />
                  </button>
                </div>
                <button class="ghost-pill" type="button">单图模式</button>
              </div>
            </div>

            <div v-if="selectedImages.length" class="image-stage" :class="{ 'image-stage--list': galleryViewMode === 'list' }" data-testid="product-images-grid">
              <article
                v-for="image in selectedImages"
                :key="image.id"
                class="preview-card"
                :data-testid="`product-image-card-${image.id}`"
              >
                <button class="preview-card__media" type="button" @click="openPreview(image.filePath, image.fileName)">
                  <img :src="toFileUrl(image.filePath)" class="preview-card__img" />
                  <span v-if="image.isCover" class="preview-card__badge">封面</span>
                  <span v-if="livePhotoReferenceImagePath === image.filePath" class="preview-card__badge preview-card__badge--accent">Live Photo 主图</span>
                </button>
                <div class="preview-card__actions">
                  <button class="preview-card__action" :disabled="image.isCover" :data-testid="`product-set-cover-${image.id}`" type="button" @click.stop="setCover(image.id)">
                    设为封面
                  </button>
                  <button
                    class="preview-card__action"
                    :disabled="livePhotoReferenceImagePath === image.filePath"
                    :data-testid="`product-set-live-photo-ref-${image.id}`"
                    type="button"
                    @click.stop="setLivePhotoReferenceImage(image.id)"
                  >
                    设为 Live Photo 主图
                  </button>
                  <button class="preview-card__action preview-card__action--danger" :data-testid="`product-delete-image-${image.id}`" type="button" @click.stop="removeImage(image.id)">
                    删除
                  </button>
                </div>
              </article>

              <button class="upload-card" type="button" @click="uploadImages">
                <Plus class="h-11 w-11" />
                <strong>拖拽图片到此处</strong>
                <span>或点击上传图片</span>
              </button>
            </div>

            <div v-else class="empty-card" data-testid="product-images-empty">
              <ImageIcon class="h-10 w-10" />
              <strong>当前商品还没有图片</strong>
              <p>先上传商品图片，再继续生成深层多角度图与后续链路。</p>
              <button class="empty-card__button" type="button" @click="uploadImages">
                <Plus class="h-4 w-4" />
                <span>上传图片</span>
              </button>
            </div>
          </article>

          <article class="panel-card flow-panel">
            <div class="panel-head">
              <strong>生成流程</strong>
            </div>
            <div class="flow-strip">
              <div v-for="(step, index) in stepItems" :key="step.number" class="flow-step">
                <div
                  class="flow-step__num"
                  :class="{
                    'flow-step__num--done': step.number < productFlowActiveStep,
                    'flow-step__num--active': step.number === productFlowActiveStep,
                  }"
                >
                  {{ step.number }}
                </div>
                <div class="flow-step__copy">
                  <strong>{{ step.title }}</strong>
                  <span>{{ step.desc }}</span>
                </div>
                <div v-if="index < stepItems.length - 1" class="flow-step__line"></div>
              </div>
            </div>
          </article>

          <article class="panel-card canonical-panel" data-testid="product-canonical-source-panel">
            <div class="panel-head">
              <strong>商品深层多角度图</strong>
            </div>

            <div v-if="analysisBoardPath" class="canonical-result">
              <button class="canonical-result__media" data-testid="product-canonical-preview" type="button" @click="openPreview(analysisBoardPath, '商品深层多角度图')">
                <img :src="toFileUrl(analysisBoardPath)" alt="Product Analysis Board" />
              </button>
              <div class="canonical-result__body">
                <div class="canonical-result__meta">
                  <span>结果文件</span>
                  <strong>{{ shortFileName(analysisBoardPath) }}</strong>
                </div>
                <div class="canonical-result__meta">
                  <span>生成时间</span>
                  <strong>{{ formatDateTime(selected.analysisBoardUpdatedAt || selected.canonicalSourceUpdatedAt) }}</strong>
                </div>
                <div class="canonical-result__actions">
                  <button class="ghost-pill ghost-pill--accent" type="button" @click="openPreview(analysisBoardPath, '商品深层多角度图')">
                    查看深层多角度图
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="canonical-placeholder" :class="{ 'canonical-placeholder--danger': analysisBoardStageStatus === 'failed' }">
              <strong>{{ canonicalStatusValue(analysisBoardStageStatus) }}</strong>
              <p>{{ analysisBoardStageStatus === 'failed' ? '深层多角度图生成失败，可直接重试当前阶段。' : canonicalStatusHint(analysisBoardStageStatus) }}</p>
            </div>

            <div v-if="analysisBoardDiagnostics.length" class="diagnostic-list">
              <div v-for="(item, index) in analysisBoardDiagnostics" :key="`${item.originalPath}-${index}`" class="diagnostic-item">
                <div class="diagnostic-item__row">
                  <span>处理状态</span>
                  <strong>{{ canonicalDiagnosticStatusLabel(item.status) }}</strong>
                </div>
                <div class="diagnostic-item__row">
                  <span>原图</span>
                  <strong>{{ shortFileName(item.originalPath) }}</strong>
                </div>
                <div v-if="item.sanitizedPath" class="diagnostic-item__row">
                  <span>输出</span>
                  <strong>{{ shortFileName(item.sanitizedPath) }}</strong>
                </div>
                <p v-if="item.note">{{ item.note }}</p>
              </div>
            </div>
          </article>
        </div>

        <div class="right-column">
          <article class="panel-card status-panel">
            <div class="panel-head">
              <strong>状态与深层多角度图</strong>
            </div>
            <div class="status-banner">
              <div class="status-banner__head">
                <div class="status-banner__icon" :class="`status-banner__icon--${analysisBoardStageStatus || canonicalStageStatus || 'idle'}`">
                <Check v-if="analysisBoardReady" class="h-6 w-6" />
                  <Sparkles v-else class="h-6 w-6" />
                </div>
                <div class="status-banner__copy">
                  <strong>{{ `深层多角度图 ${canonicalStatusValue(analysisBoardStageStatus)} / Product DNA ${productAnalysisSnapshot ? '已生成' : '待生成'}` }}</strong>
                  <p v-if="refreshingAnalysisBoard">正在生成深层多角度图，完成后自动补 Product DNA。</p>
                  <p v-else-if="refreshingProductAnalysis">正在单独分析 Product DNA，本次不会重生成深层多角度图。</p>
                  <p v-else-if="analysisBoardStageStatus === 'failed'">深层多角度图生成失败，可直接重试当前阶段。</p>
                  <p v-else>{{ canonicalStatusHint(analysisBoardStageStatus || canonicalStageStatus) }}</p>
                </div>
              </div>
              <button class="status-banner__button" :disabled="refreshingAnalysisBoard || refreshingProductAnalysis || !hasImages" type="button" @click="refreshAnalysisBoard">
                {{ refreshingAnalysisBoard ? '重新生成中...' : '重新生成深层多角度图' }}
              </button>
            </div>

            <div class="status-meta">
              <div class="status-meta__item">
                <span>更新时间</span>
                <strong>{{ canonicalStatusValue(canonicalStageStatus) }}</strong>
              </div>
              <div class="status-meta__item">
                <span>结果文件</span>
                <strong>{{ canonicalStatusValue(analysisBoardStageStatus) }}</strong>
              </div>
            </div>
          </article>

          <div class="bottom-right-grid">
            <article class="panel-card log-panel">
              <div class="panel-head">
                <strong>操作日志</strong>
              </div>
              <div class="log-list">
                <div class="log-row log-row--green">
                  <i></i>
                  <span>{{ formatDateTime(selected.updatedAt) }}</span>
                  <p>图片已同步，共 {{ selectedImageCount }} 张。</p>
                </div>
                <div class="log-row log-row--cyan">
                  <i></i>
                  <span>{{ formatDateTime(selected.createdAt) }}</span>
                  <p>商品已创建。</p>
                </div>
                <div class="log-row log-row--yellow">
                  <i></i>
                  <span>{{ formatDateTime(selected.analysisBoardUpdatedAt || selected.canonicalSourceUpdatedAt || selected.createdAt) }}</span>
                  <p>深层多角度图状态：{{ canonicalStatusValue(selected.analysisBoardStatus || selected.canonicalSourceStatus) }}。</p>
                </div>
                <div class="log-row log-row--red">
                  <i></i>
                  <span>{{ formatDateTime(selected.createdAt) }}</span>
                  <p>商品信息可继续编辑和补充备注。</p>
                </div>
              </div>
              <button class="text-link" type="button">查看全部日志</button>
            </article>

            <div class="stack-panel">
              <article class="panel-card remark-panel">
                <div class="panel-head">
                  <strong>商品说明</strong>
                  <button class="head-icon" type="button">
                    <Edit3 class="h-4 w-4" />
                  </button>
                </div>
                <div class="remark-box">
                  <textarea
                    v-model="remarkDraft"
                    class="remark-box__input"
                    placeholder="记录商品卖点、来源说明或选图备注..."
                    data-testid="product-remark-input"
                  ></textarea>
                  <button class="remark-box__button" :disabled="savingRemark" data-testid="product-remark-save-button" type="button" @click="saveRemark">
                    {{ savingRemark ? '保存中...' : '保存备注' }}
                  </button>
                </div>
              </article>

              <article class="panel-card rule-panel">
                <div class="panel-head">
                  <strong>使用规则</strong>
                </div>
                <div class="rule-row">
                  <div class="rule-row__head">
                    <FileText class="h-4 w-4" />
                    <span>当前链路说明</span>
                  </div>
                  <p>商品图片是主事实源，深层多角度图用于沉淀多角度结构共识，并辅助后续 AI 提示词描述。</p>
                </div>
              </article>
            </div>
          </div>

          <article class="panel-card analysis-panel" data-testid="product-analysis-panel">
            <div class="panel-head">
              <div class="analysis-panel__head">
                <strong>商品描述 / Product DNA</strong>
                <span>{{ productAnalysisSections.length ? '基于深层多角度图生成' : '等待深层多角度图生成后分析' }}</span>
              </div>
              <button class="ghost-pill ghost-pill--accent" :disabled="refreshingProductAnalysis || refreshingAnalysisBoard || !hasImages" type="button" @click="refreshProductAnalysis">
                {{ refreshingProductAnalysis ? '获取中...' : '获取产品 DNA' }}
              </button>
            </div>
            <div v-if="productAnalysisSnapshot" class="product-analysis-card">
              <div class="product-analysis-card__top">
                <div class="product-analysis-card__summary">
                  <span>Summary</span>
                  <p v-if="productAnalysisSnapshot.summary" class="product-analysis-card__summary-text">{{ productAnalysisSnapshot.summary }}</p>
                  <span>Category</span>
                  <strong>{{ productAnalysisSnapshot.category || '未识别' }}</strong>
                </div>
                <div v-if="productAnalysisSnapshot.matchingRules.length" class="product-analysis-card__rules">
                  <span>Matching Rules</span>
                  <div class="product-analysis-card__rule-list">
                    <em v-for="rule in productAnalysisSnapshot.matchingRules" :key="rule">{{ rule }}</em>
                  </div>
                </div>
              </div>
              <div v-if="productAnalysisPrimarySections.length" class="product-analysis-card__hero-grid">
                <div
                  v-for="item in productAnalysisPrimarySections"
                  :key="item.key"
                  class="product-analysis-card__item product-analysis-card__item--hero"
                >
                  <span>{{ item.title }}</span>
                  <p>{{ item.desc }}</p>
                </div>
              </div>
              <div class="product-analysis-card__grid">
                <div v-for="item in productAnalysisSecondarySections" :key="item.key" class="product-analysis-card__item">
                  <span>{{ item.title }}</span>
                  <p>{{ item.desc }}</p>
                </div>
              </div>
            </div>
            <div v-else class="canonical-placeholder">
              <strong>联合分析尚未生成</strong>
              <p>生成或刷新商品深层多角度图后，系统会同步调用商品结构分析模型，并在这里显示基于上传图片归纳出的商品结构、材质、颜色、几何和匹配规则，供商品库与 /clone 直接复用。</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-else class="missing-card">
      <p>当前商品不存在，可能已经被删除。</p>
    </section>
  </div>

  <VideoPreviewModal :open="previewOpen" :src="previewSrc" :title="previewTitle" media-type="image" @close="closePreview" />
</template>

<style scoped>
.product-detail-page {
  display: grid;
  gap: 12px;
  padding: 4px 6px 20px;
}

.detail-shell,
.missing-card,
.detail-feedback {
  border: 1px solid rgba(111, 130, 193, 0.14);
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(95, 83, 190, 0.1), transparent 28%),
    rgba(13, 20, 38, 0.96);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 20px 48px rgba(2, 6, 20, 0.28);
}

.detail-shell {
  display: grid;
  gap: 12px;
  padding: 10px;
}

.action-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(111, 130, 193, 0.18);
  border-radius: 18px;
  background: rgba(18, 27, 49, 0.88);
}

.action-banner--info {
  border-color: rgba(92, 164, 255, 0.26);
  background: rgba(17, 39, 72, 0.88);
}

.action-banner--success {
  border-color: rgba(53, 215, 119, 0.24);
  background: rgba(17, 43, 33, 0.9);
}

.action-banner--error {
  border-color: rgba(255, 114, 114, 0.24);
  background: rgba(55, 24, 31, 0.9);
}

.action-banner__main {
  display: grid;
  gap: 3px;
}

.action-banner__main strong {
  color: #edf3ff;
  font-size: 12px;
  font-weight: 800;
}

.action-banner__main p {
  margin: 0;
  color: #b6c6ea;
  font-size: 12px;
  line-height: 1.5;
}

.action-banner__tag {
  flex-shrink: 0;
  min-height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #f4f7ff;
  font-size: 11px;
  font-weight: 700;
}

.top-area {
  display: grid;
  gap: 10px;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  border: 0;
  background: transparent;
  color: #eef3ff;
  font-size: 13px;
  font-weight: 700;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title-block {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.title-inline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-inline h1 {
  margin: 0;
  color: #ffffff;
  font-size: 24px;
  line-height: 1.08;
  font-weight: 900;
}

.title-inline__edit,
.head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(114, 96, 255, 0.24);
  border-radius: 10px;
  background: rgba(108, 85, 255, 0.16);
  color: #b59cff;
}

.title-block p {
  margin: 0;
  color: #9aadd6;
  font-size: 12px;
}

.name-editor {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.name-editor__input {
  min-width: min(460px, 100%);
  height: 44px;
  border: 1px solid rgba(123, 142, 201, 0.2);
  border-radius: 12px;
  background: rgba(20, 28, 49, 0.92);
  padding: 0 14px;
  color: #ffffff;
  font-size: 21px;
  font-weight: 900;
  outline: none;
}

.name-editor__button {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid rgba(123, 142, 201, 0.16);
  border-radius: 10px;
  background: rgba(18, 25, 45, 0.92);
  color: #eef2ff;
  font-size: 12px;
  font-weight: 700;
}

.name-editor__button--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #795dff, #9b6cff);
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 136px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid rgba(111, 90, 255, 0.46);
  border-radius: 14px;
  background: rgba(22, 28, 52, 0.96);
  color: #f3f6ff;
  font-size: 13px;
  font-weight: 800;
}

.hero-button:disabled {
  opacity: 0.6;
}

.hero-button--danger {
  border-color: rgba(255, 105, 105, 0.28);
  background: rgba(47, 20, 29, 0.96);
  color: #ff7e7e;
}

.summary-strip {
  display: grid;
  grid-template-columns: 0.95fr 0.82fr 0.95fr 1.18fr 1.18fr 0.8fr;
  border: 1px solid rgba(123, 142, 201, 0.12);
  border-radius: 16px;
  overflow: hidden;
  background: rgba(21, 28, 49, 0.92);
}

.summary-item {
  display: grid;
  gap: 6px;
  min-height: 76px;
  padding: 14px 18px;
}

.summary-item + .summary-item {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.summary-item span {
  color: #98aad2;
  font-size: 11px;
}

.summary-item strong {
  color: #ffffff;
  font-size: 15px;
  line-height: 1.2;
  font-weight: 800;
}

.summary-item__inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.summary-item__status,
.summary-item__id {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.summary-item__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(114, 96, 255, 0.24);
  border-radius: 8px;
  background: rgba(108, 85, 255, 0.12);
  color: #c7b6ff;
}

.type-editor {
  display: grid;
  gap: 8px;
}

.type-editor__field {
  display: block;
}

.type-editor__field select {
  width: 100%;
  min-height: 40px;
  border: 1px solid rgba(123, 142, 201, 0.2);
  border-radius: 12px;
  background: rgba(20, 28, 49, 0.92);
  padding: 0 14px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  outline: none;
}

.type-editor__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.status-dot--done {
  background: #37d978;
}

.status-dot--processing {
  background: #5ca4ff;
}

.status-dot--failed {
  background: #ff6f6f;
}

.status-dot--idle {
  background: #9aabd4;
}

.detail-feedback {
  padding: 10px 14px;
  color: #dde6ff;
  font-size: 12px;
  line-height: 1.5;
}

.detail-feedback--info {
  border-color: rgba(92, 164, 255, 0.2);
  color: #cfe4ff;
}

.detail-feedback--success {
  border-color: rgba(53, 215, 119, 0.2);
  color: #c8f5d9;
}

.detail-feedback--error {
  border-color: rgba(255, 114, 114, 0.2);
  color: #ffd1d1;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.16fr) minmax(400px, 0.84fr);
  gap: 12px;
}

.left-column,
.right-column,
.stack-panel {
  display: grid;
  gap: 12px;
}

.panel-card {
  border: 1px solid rgba(111, 130, 193, 0.14);
  border-radius: 16px;
  background: rgba(17, 24, 43, 0.94);
  padding: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.panel-head strong {
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
}

.panel-head__tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  border: 1px solid rgba(123, 142, 201, 0.14);
  border-radius: 12px;
  background: rgba(27, 34, 56, 0.96);
}

.view-toggle__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #96a8d0;
}

.view-toggle__button--active {
  background: linear-gradient(135deg, #6d52ff, #8d66ff);
  color: #ffffff;
}

.ghost-pill {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(123, 142, 201, 0.16);
  border-radius: 12px;
  background: rgba(27, 34, 56, 0.96);
  color: #eef2ff;
  font-size: 11px;
  font-weight: 700;
}

.ghost-pill--accent {
  border-color: rgba(108, 85, 255, 0.28);
  background: rgba(48, 37, 106, 0.84);
  color: #d6c7ff;
}

.image-stage {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: start;
}

.image-stage--list {
  grid-template-columns: 1fr;
}

.preview-card,
.upload-card,
.status-banner,
.status-meta__item,
.canonical-result,
.canonical-placeholder,
.diagnostic-item,
.rule-row {
  border: 1px solid rgba(123, 142, 201, 0.12);
  border-radius: 14px;
  background: rgba(21, 29, 52, 0.92);
}

.preview-card {
  display: grid;
  gap: 7px;
  padding: 7px;
}

.preview-card__media {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.preview-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-card__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 8px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.66);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
}

.preview-card__badge--accent {
  left: auto;
  right: 8px;
  background: rgba(68, 174, 109, 0.9);
}

.preview-card__actions {
  display: flex;
  gap: 6px;
}

.preview-card__action {
  flex: 1;
  min-height: 30px;
  border: 1px solid rgba(123, 142, 201, 0.14);
  border-radius: 10px;
  background: rgba(17, 24, 43, 0.96);
  color: #eef2ff;
  font-size: 11px;
  font-weight: 700;
}

.preview-card__action--danger {
  color: #ff9595;
}

.upload-card {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  min-height: 204px;
  border-style: dashed;
  color: #9db0d9;
}

.upload-card strong {
  color: #edf3ff;
  font-size: 14px;
}

.upload-card span {
  font-size: 12px;
}

.empty-card,
.missing-card {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 34px 18px;
  text-align: center;
}

.empty-card strong,
.missing-card p {
  margin: 0;
  color: #ffffff;
  font-size: 16px;
}

.empty-card p {
  margin: 0;
  color: #98aad2;
  font-size: 12px;
}

.empty-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #795dff, #9b6cff);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.flow-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.flow-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

.flow-step__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #d8e0ff;
  font-size: 20px;
  font-weight: 900;
}

.flow-step__num--active {
  background: linear-gradient(135deg, #744fff, #925fff);
  box-shadow: 0 12px 26px rgba(101, 77, 255, 0.28);
}

.flow-step__num--done {
  background: linear-gradient(135deg, #31ca74, #49de92);
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(53, 215, 119, 0.2);
}

.flow-step__copy {
  display: grid;
  gap: 3px;
}

.flow-step__copy strong {
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
}

.flow-step__copy span {
  color: #99abd4;
  font-size: 11px;
}

.flow-step__line {
  position: absolute;
  top: 50%;
  left: calc(100% - 18px);
  width: 26px;
  height: 1px;
  background: rgba(255, 255, 255, 0.18);
}

.canonical-result {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 8px;
  padding: 6px;
}

.canonical-result__media {
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  aspect-ratio: 1 / 1;
}

.canonical-result__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.canonical-result__body {
  display: grid;
  gap: 6px;
  align-content: start;
  min-width: 0;
}

.canonical-result__meta,
.diagnostic-item__row {
  display: grid;
  gap: 3px;
}

.canonical-result__meta span,
.diagnostic-item__row span,
.status-meta__item span,
.log-row span,
.rule-row span {
  color: #98aad2;
  font-size: 11px;
}

.canonical-result__meta strong,
.diagnostic-item__row strong,
.status-meta__item strong {
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.canonical-result__actions {
  display: flex;
  justify-content: flex-end;
}

.canonical-placeholder {
  display: grid;
  gap: 6px;
  padding: 14px;
}

.canonical-placeholder strong {
  color: #ffffff;
  font-size: 15px;
}

.canonical-placeholder p,
.diagnostic-item p,
.status-banner__copy p,
.rule-row p {
  margin: 0;
  color: #9db0d9;
  font-size: 12px;
  line-height: 1.55;
}

.canonical-placeholder--danger {
  border-color: rgba(255, 105, 105, 0.24);
  background: rgba(48, 21, 30, 0.92);
}

.diagnostic-list {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.diagnostic-item {
  display: grid;
  gap: 5px;
  padding: 8px;
}

.diagnostic-item p {
  font-size: 11px;
  line-height: 1.4;
}

.diagnostic-item__row strong {
  white-space: normal;
}

.status-banner {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.status-banner__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-banner__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 999px;
  border: 2px solid currentColor;
}

.status-banner__icon--done {
  color: #35d777;
}

.status-banner__icon--processing {
  color: #5ca4ff;
}

.status-banner__icon--failed {
  color: #ff7272;
}

.status-banner__icon--idle {
  color: #9aabd4;
}

.status-banner__copy {
  display: grid;
  gap: 3px;
}

.status-banner__copy strong {
  color: #33d873;
  font-size: 16px;
  font-weight: 900;
}

.status-banner__button,
.remark-box__button {
  min-height: 38px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #795dff, #9b6cff);
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

.status-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.status-meta__item {
  display: grid;
  gap: 5px;
  min-height: 74px;
  padding: 10px;
}

.bottom-right-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(260px, 0.98fr);
  gap: 12px;
  align-items: stretch;
}

.analysis-panel {
  display: grid;
  gap: 10px;
}

.log-panel,
.remark-panel,
.rule-panel {
  height: 100%;
}

.stack-panel {
  grid-template-rows: minmax(0, 1fr) auto;
}

.log-list {
  display: grid;
  gap: 10px;
}

.log-row {
  display: grid;
  grid-template-columns: 8px 112px 1fr;
  gap: 8px;
  align-items: start;
}

.log-row i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-top: 4px;
}

.log-row p {
  margin: 0;
  color: #cfdbff;
  font-size: 11px;
}

.log-row--green i {
  background: #35d777;
}

.log-row--cyan i {
  background: #56d3ff;
}

.log-row--yellow i {
  background: #ffc84d;
}

.log-row--red i {
  background: #ff6565;
}

.text-link {
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: #8f74ff;
  font-size: 11px;
  font-weight: 700;
}

.remark-box {
  display: grid;
  gap: 10px;
}

.remark-box__input {
  min-height: 82px;
  border: 1px solid rgba(123, 142, 201, 0.14);
  border-radius: 12px;
  background: rgba(14, 21, 39, 0.94);
  padding: 10px 12px;
  color: #ecf2ff;
  font-size: 12px;
  resize: vertical;
  outline: none;
}

.rule-row {
  display: grid;
  gap: 6px;
  padding: 10px;
}

.rule-row__head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #d4ddff;
}

.analysis-panel__head {
  display: grid;
  gap: 4px;
}

.analysis-panel__head span,
.product-analysis-card__summary span,
.product-analysis-card__rules span,
.product-analysis-card__item span {
  color: #98aad2;
  font-size: 11px;
}

.product-analysis-card {
  display: grid;
  gap: 10px;
}

.product-analysis-card__top {
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
  gap: 10px;
}

.product-analysis-card__hero-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.product-analysis-card__summary,
.product-analysis-card__rules,
.product-analysis-card__item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid rgba(123, 142, 201, 0.12);
  border-radius: 14px;
  background: rgba(21, 29, 52, 0.92);
}

.product-analysis-card__summary strong {
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
}

.product-analysis-card__summary-text {
  margin: 0;
  color: #ecf2ff;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.product-analysis-card__rule-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.product-analysis-card__rule-list em {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(108, 85, 255, 0.14);
  color: #dccfff;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}

.product-analysis-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.product-analysis-card__item--hero {
  background:
    linear-gradient(180deg, rgba(108, 85, 255, 0.12), rgba(21, 29, 52, 0.92)),
    rgba(21, 29, 52, 0.92);
  border-color: rgba(140, 118, 255, 0.22);
}

.product-analysis-card__item--hero span {
  color: #cbbcff;
  font-size: 11px;
  letter-spacing: 0.02em;
}

.product-analysis-card__item--hero p {
  color: #ffffff;
  font-size: 13px;
}

.product-analysis-card__item p {
  margin: 0;
  color: #ecf2ff;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
  overflow-wrap: anywhere;
}

@media (max-width: 1600px) {
  .summary-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1360px) {
  .content-grid,
  .bottom-right-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1080px) {
  .title-row,
  .hero-actions,
  .status-meta,
  .flow-strip,
  .image-stage {
    grid-template-columns: 1fr;
    display: grid;
  }

  .summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .product-analysis-card__top,
  .product-analysis-card__hero-grid,
  .product-analysis-card__grid {
    grid-template-columns: 1fr;
  }

  .summary-item + .summary-item {
    border-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .canonical-result {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .summary-strip,
  .log-row {
    grid-template-columns: 1fr;
  }

  .log-row p {
    grid-column: auto;
  }
}
</style>
