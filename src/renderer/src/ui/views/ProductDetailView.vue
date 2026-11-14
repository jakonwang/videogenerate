<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  FileText,
  Grid2X2,
  History,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  LayoutList,
  Loader,
  NotebookPen,
  Plus,
  ScanSearch,
  SearchX,
  Sparkles,
  Trash2,
  Upload,
  Workflow,
} from 'lucide-vue-next'
import { thumbnailUrl } from '@/lib/localMedia'
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
const { t: tr } = useI18n()
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

const productTypeOptionsV2 = computed<Array<{ value: ProductType; label: string }>>(() => [
  { value: 'phone_case', label: tr('autoUi.k_afabad5de2c2') },
  { value: 'earring', label: tr('autoUi.k_329e434a7323') },
  { value: 'necklace', label: tr('autoUi.k_cf7a4db3d465') },
  { value: 'ring', label: tr('autoUi.k_669d663512e8') },
  { value: 'bracelet', label: tr('autoUi.k_6e4748e0e92c') },
  { value: 'clothes', label: tr('autoUi.k_c430623070e3') },
  { value: 'bag', label: tr('autoUi.k_e71c5a827969') },
  { value: 'shoes', label: tr('autoUi.k_4c2e7ca1d1a3') },
  { value: 'toy', label: tr('autoUi.k_dc0613dae17b') },
  { value: 'general', label: tr('autoUi.k_3843dd0edcb0') },
])

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

const pageTitle = computed(() => selected.value?.name || tr('autoUi.k_b4b756c20051'))
const pageSubtitle = computed(() => {
  if (!selected.value) return tr('autoUi.k_c2dcc0b6ff43')
  if (!hasImages.value) return tr('autoUi.k_d96e8da326c5')
  if (refreshingAnalysisBoard.value) return tr('autoUi.k_63926f53edb4')
  if (refreshingProductAnalysis.value) return tr('autoUi.k_4583ae4129ac')
  if (analysisBoardReady.value) return tr('autoUi.k_a5fc269f8641')
  if (analysisBoardStageStatus.value === 'processing') return tr('autoUi.k_b702fef6a092')
  if (analysisBoardStageStatus.value === 'failed') return tr('autoUi.k_bb3e9fef9764')
  if (canonicalStageStatus.value === 'processing') return tr('autoUi.k_17851e29d573')
  if (canonicalStageStatus.value === 'failed') return tr('autoUi.k_648b525832b3')
  return tr('autoUi.k_5a9f669f486f')
})
const stepItems = computed(() => [
  { number: 1, title: tr('autoUi.k_376da9f72940'), desc: hasImages.value ? tr('autoUi.k_e99b48a29bdf') : tr('autoUi.k_59a9eb4e6574') },
  { number: 2, title: tr('autoUi.k_7cc234042ef7'), desc: canonicalStatusLabel(canonicalStageStatus.value) },
  { number: 3, title: tr('autoUi.k_dce511108f5c'), desc: canonicalStatusLabel(analysisBoardStageStatus.value) },
  { number: 4, title: tr('autoUi.k_2ff97308c65a'), desc: analysisBoardReady.value ? tr('autoUi.k_ec5baa1975a2') : tr('autoUi.k_59a9eb4e6574') },
])
const actionStatusText = computed(() => {
  if (refreshingAnalysisBoard.value) return tr('autoUi.k_7ac7d958f450')
  if (refreshingProductAnalysis.value) return tr('autoUi.k_169b2ea3be23')
  if (feedback.value) return feedback.value
  if (analysisBoardStageStatus.value === 'processing') return tr('autoUi.k_5e6d2d976a9f')
  if (analysisBoardStageStatus.value === 'failed') return tr('autoUi.k_d05c9b150d11')
  if (productAnalysisSnapshot.value) return tr('autoUi.k_733b1066d118')
  return tr('autoUi.k_624ee6312a09')
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
  if (status === 'done') return tr('autoUi.k_e99b48a29bdf')
  if (status === 'processing') return tr('autoUi.k_fcb979ef0b91')
  if (status === 'failed') return tr('autoUi.k_3e3c8068bb0e')
  return tr('autoUi.k_59a9eb4e6574')
}
/** Kit tone for a canonical / analysis-board stage status. */
function stageTone(status?: string | null) {
  if (status === 'done') return 'green'
  if (status === 'processing') return 'blue'
  if (status === 'failed') return 'red'
  return 'gray'
}
function canonicalStatusValue(status?: Product['canonicalSourceStatus']) {
  if (status === 'done') return tr('autoUi.k_e99b48a29bdf')
  if (status === 'processing') return tr('autoUi.k_fcb979ef0b91')
  if (status === 'failed') return tr('autoUi.k_3e3c8068bb0e')
  return tr('autoUi.k_59a9eb4e6574')
}
function canonicalStatusHint(status?: Product['canonicalSourceStatus']) {
  if (status === 'done') return tr('autoUi.k_594fa15cbdaa')
  if (status === 'processing') return tr('autoUi.k_f164b8f467c2')
  if (status === 'failed') return tr('autoUi.k_1d487b742dea')
  return tr('autoUi.k_750ec810852f')
}

function canonicalDiagnosticStatusLabel(status: ProductCanonicalDiagnostic['status']) {
  if (status === 'sanitized') return tr('autoUi.k_0601341b26ac')
  if (status === 'kept') return tr('autoUi.k_ef299d4cdd93')
  return tr('autoUi.k_763284f0fbc6')
}

function productTypeLabel(type: ProductType) {
  return productTypeOptionsV2.value.find((item) => item.value === type)?.label ?? tr('autoUi.k_3843dd0edcb0')
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
    feedback.value = tr('autoUi.k_b19642d6c9dd')
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
    feedback.value = tr('autoUi.k_2f0a28677465')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_3f51890ceb7e'))
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
    feedback.value = tr('autoUi.k_6b8c653a9458')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_4e0d70198039'))
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
      title: tr('autoUi.k_0f6e4fcf79f7'),
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
    feedback.value = tr('autoUi.k_ce0fd017d226', { p0: nextImages.length })
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_1d0e79b2f6d0'))
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
    feedback.value = tr('autoUi.k_efcd07809518')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_9b5c3c8f2f43'))
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
    feedback.value = tr('autoUi.k_b5d5bf6cbedf')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_d04f16a549c8'))
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
    feedback.value = tr('autoUi.k_856480e2c5e1')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_5a7a18ede132'))
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
    feedback.value = tr('autoUi.k_dbd461ea511f')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_035c205a5a4c'))
  }
}

async function refreshAnalysisBoard() {
  if (!selected.value) return
  feedbackTone.value = 'info'
  feedback.value = tr('autoUi.k_515bf9aa00f7')
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
    feedback.value = tr('autoUi.k_0690eb48f525')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_54dd3a1f97df'))
  } finally {
    refreshingAnalysisBoard.value = false
  }
}

async function refreshProductAnalysis() {
  if (!selected.value) return
  feedbackTone.value = 'info'
  feedback.value = tr('autoUi.k_e019fc9d00d7')
  refreshingProductAnalysis.value = true
  try {
    await window.api.products.refreshProductAnalysis({ productId: selected.value.id })
    await refresh()
    feedbackTone.value = 'success'
    feedback.value = tr('autoUi.k_ae9e8db6b394')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = String(error?.message ?? error ?? tr('autoUi.k_8689ec87d769'))
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
  <div class="vg-scope vg-page pd" data-testid="product-detail-page">
    <template v-if="selected">
      <!-- Header -->
      <header class="vg-page-head">
        <button class="vg-icon-btn" data-testid="product-detail-back" type="button" :title="tr('autoUi.k_cac1a287bf6d')" @click="router.push('/products')">
          <ArrowLeft :size="18" />
        </button>
        <div class="vg-page-head__text pd-title">
          <div v-if="editingName" class="vg-row pd-title__edit">
            <input
              v-model="nameDraft"
              class="vg-input"
              data-testid="product-name-input"
              type="text"
              maxlength="80"
              @keydown.enter.prevent="saveProductName"
              @keydown.esc.prevent="cancelEditName"
            />
            <button class="vg-btn vg-btn--primary vg-btn--sm" :disabled="savingName" data-testid="product-name-save-button" type="button" @click="saveProductName">
              {{ savingName ? tr('autoUi.k_d70d425039f2') : tr('autoUi.k_fadf24dbc5a9') }}
            </button>
            <button class="vg-btn vg-btn--sm" type="button" @click="cancelEditName">{{ tr('autoUi.k_4d0b4688c787') }}</button>
          </div>
          <h1 v-else>
            <span data-testid="product-detail-name">{{ pageTitle }}</span>
            <button class="vg-icon-btn vg-icon-btn--sm" data-testid="product-name-edit-button" type="button" @click="startEditName"><Edit3 :size="14" /></button>
          </h1>
          <p>{{ pageSubtitle }}</p>
        </div>
        <div class="vg-page-head__actions">
          <button class="vg-btn" :disabled="uploading" data-testid="product-upload-button" type="button" @click="uploadImages">
            <Upload :size="15" /> {{ uploading ? tr('autoUi.k_ba72be007133') : tr('autoUi.k_45bba1a10c73') }}
          </button>
          <button class="vg-btn vg-btn--soft" :disabled="refreshingAnalysisBoard || !hasImages" data-testid="product-refresh-canonical-button" type="button" @click="refreshAnalysisBoard">
            <Sparkles :size="15" :class="{ 'vg-spin': refreshingAnalysisBoard }" /> {{ refreshingAnalysisBoard ? tr('autoUi.k_26eab253a08e') : tr('autoUi.k_27a715d5991e') }}
          </button>
          <button class="vg-btn vg-btn--danger" data-testid="product-delete-button" type="button" @click="removeProduct">
            <Trash2 :size="15" /> {{ tr('autoUi.k_1c4e19354208') }}
          </button>
        </div>
      </header>

      <!-- Summary -->
      <section class="vg-card pd-summary">
        <div class="pd-summary__item">
          <span>{{ tr('autoUi.k_8c0e804b9002') }}</span>
          <div v-if="editingType" class="vg-row pd-summary__edit">
            <select v-model="typeDraft" class="vg-select vg-select--sm" data-testid="product-type-select">
              <option v-for="option in productTypeOptionsV2" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <button class="vg-btn vg-btn--primary vg-btn--xs" :disabled="savingType" data-testid="product-type-save-button" type="button" @click="saveProductType">
              {{ savingType ? tr('autoUi.k_d70d425039f2') : tr('autoUi.k_fadf24dbc5a9') }}
            </button>
            <button class="vg-btn vg-btn--xs" type="button" @click="cancelEditType">{{ tr('autoUi.k_4d0b4688c787') }}</button>
          </div>
          <strong v-else>
            {{ productTypeLabel(selected.type) }}
            <button class="vg-icon-btn vg-icon-btn--sm" data-testid="product-type-edit-button" type="button" @click="startEditType"><Edit3 :size="13" /></button>
          </strong>
        </div>
        <div class="pd-summary__item">
          <span>{{ tr('autoUi.k_604dfedb0ba5') }}</span>
          <strong>{{ selectedImageCount }} {{ tr('autoUi.k_9273cc90ea18') }}</strong>
        </div>
        <div class="pd-summary__item pd-summary__item--wide">
          <span>{{ tr('autoUi.k_98943466db66') }}</span>
          <strong>
            <span class="vg-pill vg-pill--dot" :class="`vg-pill--${stageTone(analysisBoardStageStatus || canonicalStageStatus)}`">
              {{ tr('autoUi.k_d64c41f40928', { p0: canonicalStatusValue(analysisBoardStageStatus), p1: productAnalysisSnapshot ? tr('autoUi.k_79c74f41ca9e') : tr('autoUi.k_aef4104370ae') }) }}
            </span>
          </strong>
        </div>
        <div class="pd-summary__item">
          <span>{{ tr('autoUi.k_093dea88c930') }}</span>
          <strong class="vg-num">{{ formatDateTime(selected.analysisBoardUpdatedAt ?? selected.canonicalSourceUpdatedAt ?? selected.updatedAt) }}</strong>
        </div>
        <div class="pd-summary__item">
          <span>{{ tr('autoUi.k_84e3802f60a7') }}</span>
          <strong class="vg-num">{{ formatDateTime(selected.createdAt) }}</strong>
        </div>
        <div class="pd-summary__item">
          <span>ID</span>
          <strong class="vg-num">{{ selected.id.slice(0, 8) }} <Copy :size="13" class="vg-muted" /></strong>
        </div>
      </section>

      <div class="vg-notice" :class="feedbackTone === 'success' ? 'vg-notice--accent' : feedbackTone === 'error' ? 'vg-notice--danger' : ''">
        <Info :size="16" />
        <span><b>{{ tr('autoUi.k_a30ab87b6869') }}</b> · {{ actionStatusText }}</span>
        <span v-if="refreshingAnalysisBoard" class="vg-pill vg-pill--blue pd-notice__tag"><Loader :size="12" class="vg-spin" /> {{ tr('autoUi.k_f5394c6ce4af') }}</span>
        <span v-else-if="refreshingProductAnalysis" class="vg-pill vg-pill--blue pd-notice__tag"><Loader :size="12" class="vg-spin" /> {{ tr('autoUi.k_403c4b72c90e') }}</span>
      </div>
      <div v-if="feedback" class="vg-notice" :class="feedbackTone === 'error' ? 'vg-notice--danger' : 'vg-notice--accent'" data-testid="product-detail-feedback">
        <span>{{ feedback }}</span>
      </div>

      <div class="pd-grid">
        <!-- Left column -->
        <div class="vg-stack pd-col">
          <article class="vg-card">
            <div class="vg-card__head">
              <span class="vg-card__title"><ImageIcon :size="16" /> {{ tr('autoUi.k_c2e3ab910df2') }}{{ selectedImageCount }})</span>
              <div class="vg-row pd-view">
                <button type="button" class="vg-icon-btn vg-icon-btn--sm" :class="{ 'is-active': galleryViewMode === 'grid' }" @click="galleryViewMode = 'grid'"><Grid2X2 :size="15" /></button>
                <button type="button" class="vg-icon-btn vg-icon-btn--sm" :class="{ 'is-active': galleryViewMode === 'list' }" @click="galleryViewMode = 'list'"><LayoutList :size="15" /></button>
              </div>
            </div>

            <div v-if="selectedImages.length" class="pd-images" :class="{ 'is-list': galleryViewMode === 'list' }" data-testid="product-images-grid">
              <article v-for="image in selectedImages" :key="image.id" class="pd-image" :data-testid="`product-image-card-${image.id}`">
                <button class="pd-image__media" type="button" @click="openPreview(image.filePath, image.fileName)">
                  <img :src="thumbnailUrl(image.filePath, 320)" alt="" loading="lazy" decoding="async" />
                  <span class="pd-image__badges">
                    <span v-if="image.isCover" class="vg-pill vg-pill--solid">{{ tr('autoUi.k_b8bb31e17014') }}</span>
                    <span v-if="livePhotoReferenceImagePath === image.filePath" class="vg-pill vg-pill--solid-blue">{{ tr('autoUi.k_43e228224b35') }}</span>
                  </span>
                </button>
                <div class="pd-image__actions">
                  <button class="vg-btn vg-btn--xs" :disabled="image.isCover" :data-testid="`product-set-cover-${image.id}`" type="button" @click.stop="setCover(image.id)">{{ tr('autoUi.k_b7607a6106bb') }}</button>
                  <button
                    class="vg-btn vg-btn--xs"
                    :disabled="livePhotoReferenceImagePath === image.filePath"
                    :data-testid="`product-set-live-photo-ref-${image.id}`"
                    type="button"
                    :title="tr('autoUi.k_5ea5cbe5b672')"
                    @click.stop="setLivePhotoReferenceImage(image.id)"
                  >Live Photo</button>
                  <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" :title="tr('autoUi.k_3755f56f2f83')" :data-testid="`product-delete-image-${image.id}`" type="button" @click.stop="removeImage(image.id)"><Trash2 :size="14" /></button>
                </div>
              </article>
              <button class="pd-upload" type="button" @click="uploadImages">
                <Plus :size="26" />
                <strong>{{ tr('autoUi.k_9eb26c4cb30b') }}</strong>
                <span>{{ tr('autoUi.k_f2190e39fc99') }}</span>
              </button>
            </div>

            <div v-else class="vg-empty" data-testid="product-images-empty">
              <span class="vg-empty__icon"><ImageIcon :size="24" /></span>
              <h3>{{ tr('autoUi.k_3ac724a49cd2') }}</h3>
              <p>{{ tr('autoUi.k_dfebb5a654b9') }}</p>
              <button class="vg-btn vg-btn--primary" type="button" @click="uploadImages"><Plus :size="15" /> {{ tr('autoUi.k_59b308c817cd') }}</button>
            </div>
          </article>

          <article class="vg-card">
            <div class="vg-card__head"><span class="vg-card__title"><Workflow :size="16" /> {{ tr('autoUi.k_83056258dd36') }}</span></div>
            <ol class="pd-flow">
              <li
                v-for="step in stepItems"
                :key="step.number"
                class="pd-flow__step"
                :class="{ 'is-done': step.number < productFlowActiveStep, 'is-active': step.number === productFlowActiveStep }"
              >
                <span class="pd-flow__num"><Check v-if="step.number < productFlowActiveStep" :size="13" /><template v-else>{{ step.number }}</template></span>
                <span class="pd-flow__copy"><strong>{{ step.title }}</strong><small>{{ step.desc }}</small></span>
              </li>
            </ol>
          </article>

          <article class="vg-card" data-testid="product-canonical-source-panel">
            <div class="vg-card__head"><span class="vg-card__title"><LayoutGrid :size="16" /> {{ tr('autoUi.k_ff7656c30444') }}</span></div>
            <div v-if="analysisBoardPath" class="pd-board">
              <button class="pd-board__media" data-testid="product-canonical-preview" type="button" @click="openPreview(analysisBoardPath, tr('autoUi.k_ff7656c30444'))">
                <img :src="thumbnailUrl(analysisBoardPath, 640)" alt="Product Analysis Board" decoding="async" />
              </button>
              <div class="vg-stack pd-board__body">
                <dl class="vg-kv">
                  <dt>{{ tr('autoUi.k_9190b6bf7713') }}</dt><dd>{{ shortFileName(analysisBoardPath) }}</dd>
                  <dt>{{ tr('autoUi.k_2213d2e64aff') }}</dt><dd class="vg-num">{{ formatDateTime(selected.analysisBoardUpdatedAt || selected.canonicalSourceUpdatedAt) }}</dd>
                </dl>
                <button class="vg-btn vg-btn--soft vg-btn--sm" type="button" @click="openPreview(analysisBoardPath, tr('autoUi.k_ff7656c30444'))">{{ tr('autoUi.k_552647d32c4b') }}</button>
              </div>
            </div>
            <div v-else class="vg-notice" :class="{ 'vg-notice--danger': analysisBoardStageStatus === 'failed' }">
              <Info :size="16" />
              <span><b>{{ canonicalStatusValue(analysisBoardStageStatus) }}</b><br />{{ analysisBoardStageStatus === 'failed' ? tr('autoUi.k_c90e34c224cb') : canonicalStatusHint(analysisBoardStageStatus) }}</span>
            </div>
            <div v-if="analysisBoardDiagnostics.length" class="vg-stack pd-diag">
              <div v-for="(item, index) in analysisBoardDiagnostics" :key="`${item.originalPath}-${index}`" class="vg-card vg-card--soft pd-diag__item">
                <dl class="vg-kv">
                  <dt>{{ tr('autoUi.k_8542beb99054') }}</dt><dd>{{ canonicalDiagnosticStatusLabel(item.status) }}</dd>
                  <dt>{{ tr('autoUi.k_cd0f3ad8ddd8') }}</dt><dd>{{ shortFileName(item.originalPath) }}</dd>
                  <template v-if="item.sanitizedPath"><dt>{{ tr('autoUi.k_ded698ae1e7e') }}</dt><dd>{{ shortFileName(item.sanitizedPath) }}</dd></template>
                </dl>
                <p v-if="item.note" class="vg-muted pd-diag__note">{{ item.note }}</p>
              </div>
            </div>
          </article>
        </div>

        <!-- Right column -->
        <div class="vg-stack pd-col">
          <article class="vg-card">
            <div class="vg-card__head"><span class="vg-card__title"><Activity :size="16" /> {{ tr('autoUi.k_b81634cd96ef') }}</span></div>
            <div class="pd-status">
              <span class="pd-status__icon" :class="`is-${stageTone(analysisBoardStageStatus || canonicalStageStatus)}`">
                <Check v-if="analysisBoardReady" :size="22" /><Sparkles v-else :size="22" />
              </span>
              <div class="pd-status__copy">
                <strong>{{ tr('autoUi.k_d64c41f40928', { p0: canonicalStatusValue(analysisBoardStageStatus), p1: productAnalysisSnapshot ? tr('autoUi.k_79c74f41ca9e') : tr('autoUi.k_aef4104370ae') }) }}</strong>
                <p v-if="refreshingAnalysisBoard">{{ tr('autoUi.k_c0b276ab6743') }}</p>
                <p v-else-if="refreshingProductAnalysis">{{ tr('autoUi.k_1e4ef108d9dc') }}</p>
                <p v-else-if="analysisBoardStageStatus === 'failed'">{{ tr('autoUi.k_c90e34c224cb') }}</p>
                <p v-else>{{ canonicalStatusHint(analysisBoardStageStatus || canonicalStageStatus) }}</p>
              </div>
            </div>
            <button class="vg-btn vg-btn--primary vg-btn--block" :disabled="refreshingAnalysisBoard || refreshingProductAnalysis || !hasImages" type="button" @click="refreshAnalysisBoard">
              {{ refreshingAnalysisBoard ? tr('autoUi.k_d4f52968578a') : tr('autoUi.k_dabe751bf59b') }}
            </button>
            <dl class="vg-kv pd-status__meta">
              <dt>{{ tr('autoUi.k_093dea88c930') }}</dt><dd>{{ canonicalStatusValue(canonicalStageStatus) }}</dd>
              <dt>{{ tr('autoUi.k_9190b6bf7713') }}</dt><dd>{{ canonicalStatusValue(analysisBoardStageStatus) }}</dd>
            </dl>
          </article>

          <article class="vg-card" data-testid="product-analysis-panel">
            <div class="vg-card__head">
              <span class="vg-card__title"><ScanSearch :size="16" /> {{ tr('autoUi.k_a63100cd721e') }} <small>{{ productAnalysisSections.length ? tr('autoUi.k_deb4673d0f5d') : tr('autoUi.k_aba8f1ef66ed') }}</small></span>
              <button class="vg-btn vg-btn--soft vg-btn--sm" :disabled="refreshingProductAnalysis || refreshingAnalysisBoard || !hasImages" type="button" @click="refreshProductAnalysis">
                {{ refreshingProductAnalysis ? tr('autoUi.k_e75aa98ee967') : tr('autoUi.k_bf0d744b504c') }}
              </button>
            </div>
            <div v-if="productAnalysisSnapshot" class="vg-stack pd-analysis">
              <div class="pd-analysis__summary">
                <p v-if="productAnalysisSnapshot.summary">{{ productAnalysisSnapshot.summary }}</p>
                <div class="vg-row">
                  <span class="vg-chip">Category · {{ productAnalysisSnapshot.category || tr('autoUi.k_face982a4aae') }}</span>
                  <span v-for="rule in productAnalysisSnapshot.matchingRules" :key="rule" class="vg-pill vg-pill--accent">{{ rule }}</span>
                </div>
              </div>
              <div v-if="productAnalysisPrimarySections.length" class="pd-analysis__grid pd-analysis__grid--hero">
                <div v-for="item in productAnalysisPrimarySections" :key="item.key" class="pd-analysis__item is-hero">
                  <span>{{ item.title }}</span>
                  <p>{{ item.desc }}</p>
                </div>
              </div>
              <div class="pd-analysis__grid">
                <div v-for="item in productAnalysisSecondarySections" :key="item.key" class="pd-analysis__item">
                  <span>{{ item.title }}</span>
                  <p>{{ item.desc }}</p>
                </div>
              </div>
            </div>
            <div v-else class="vg-notice">
              <Info :size="16" />
              <span><b>{{ tr('autoUi.k_233a0e76b7b5') }}</b><br />{{ tr('autoUi.k_9f3fe6cd1003') }}</span>
            </div>
          </article>

          <article class="vg-card">
            <div class="vg-card__head"><span class="vg-card__title"><NotebookPen :size="16" /> {{ tr('autoUi.k_5b4af310d47c') }}</span></div>
            <div class="vg-stack pd-remark">
              <textarea v-model="remarkDraft" class="vg-textarea" rows="4" :placeholder="tr('autoUi.k_4f0c7877ed93')" data-testid="product-remark-input"></textarea>
              <button class="vg-btn vg-btn--primary vg-btn--sm pd-remark__save" :disabled="savingRemark" data-testid="product-remark-save-button" type="button" @click="saveRemark">
                {{ savingRemark ? tr('autoUi.k_d70d425039f2') : tr('autoUi.k_606e82096d63') }}
              </button>
            </div>
            <div class="vg-notice pd-rule">
              <FileText :size="15" />
              <span><b>{{ tr('autoUi.k_84bd36a8dda3') }} · {{ tr('autoUi.k_5404b48fd379') }}</b><br />{{ tr('autoUi.k_df5b3cd5d128') }}</span>
            </div>
          </article>

          <article class="vg-card">
            <div class="vg-card__head"><span class="vg-card__title"><History :size="16" /> {{ tr('autoUi.k_f4bc877cd282') }}</span></div>
            <ol class="pd-log">
              <li class="is-green">
                <time>{{ formatDateTime(selected.updatedAt) }}</time>
                <p>{{ tr('autoUi.k_4146b80a32a5') }} {{ selectedImageCount }} {{ tr('autoUi.k_2d45b5becee8') }}</p>
              </li>
              <li class="is-amber">
                <time>{{ formatDateTime(selected.analysisBoardUpdatedAt || selected.canonicalSourceUpdatedAt || selected.createdAt) }}</time>
                <p>{{ tr('autoUi.k_adc25bacb2c8') }}{{ canonicalStatusValue(selected.analysisBoardStatus || selected.canonicalSourceStatus) }}。</p>
              </li>
              <li class="is-blue">
                <time>{{ formatDateTime(selected.createdAt) }}</time>
                <p>{{ tr('autoUi.k_003e7f8e23fa') }}</p>
              </li>
              <li class="is-gray">
                <time>{{ formatDateTime(selected.createdAt) }}</time>
                <p>{{ tr('autoUi.k_f7f2bec5ecdb') }}</p>
              </li>
            </ol>
          </article>
        </div>
      </div>
    </template>

    <section v-else class="vg-card">
      <div class="vg-empty">
        <span class="vg-empty__icon"><SearchX :size="24" /></span>
        <p>{{ tr('autoUi.k_c2dcc0b6ff43') }}</p>
        <button class="vg-btn" type="button" @click="router.push('/products')"><ArrowLeft :size="15" /> {{ tr('autoUi.k_cac1a287bf6d') }}</button>
      </div>
    </section>
  </div>

  <VideoPreviewModal :open="previewOpen" :src="previewSrc" :title="previewTitle" media-type="image" @close="closePreview" />
</template>

<style scoped>
.pd { width: min(1408px, 100%); margin: 0 auto; }
.pd-title h1 { display: inline-flex; align-items: center; gap: 6px; }
.pd-title__edit { flex-wrap: nowrap; }
.pd-title__edit .vg-input { width: min(360px, 50vw); }

/* Summary strip */
.pd-summary { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .7fr) minmax(0, 2.2fr) minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, .8fr); padding: 0; overflow: hidden; }
.pd-summary__item { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; min-width: 0; }
.pd-summary__item + .pd-summary__item { border-left: 1px solid var(--theme-divider); }
.pd-summary__item > span { font-size: 12px; color: var(--theme-text-muted); }
.pd-summary__item > strong { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: var(--theme-text); min-width: 0; }
.pd-summary__item > strong .vg-pill { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.pd-summary__edit { flex-wrap: nowrap; gap: 4px; }
.pd-notice__tag { margin-left: auto; flex-shrink: 0; }

/* Two columns */
.pd-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.pd-col { gap: 14px; }
.pd-view { gap: 2px; }

/* Images */
.pd-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.pd-image { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel); transition: border-color .15s; }
.pd-image:hover { border-color: var(--vg-accent-line); }
.pd-image__media { position: relative; aspect-ratio: 1; padding: 0; border: 0; border-bottom: 1px solid var(--theme-border); background: var(--theme-panel-soft); cursor: zoom-in; overflow: hidden; }
.pd-image__media img { width: 100%; height: 100%; object-fit: contain; display: block; }
.pd-image__badges { position: absolute; top: 6px; left: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.pd-image__badges .vg-pill { height: 20px; font-size: 11px; }
.pd-image__actions { display: flex; align-items: center; gap: 4px; padding: 6px; }
.pd-image__actions .vg-btn { flex: 1; padding: 0 4px; }
.pd-upload { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 190px; padding: 12px; border: 1px dashed var(--theme-border-control); border-radius: var(--vg-radius-sm); background: transparent; color: var(--theme-text-muted); cursor: pointer; transition: border-color .15s, color .15s, background .15s; }
.pd-upload:hover { border-color: var(--vg-accent); color: var(--vg-accent); background: var(--vg-accent-soft); }
.pd-upload strong { font-size: 13px; color: var(--theme-text); }
.pd-upload span { font-size: 11px; }
.pd-images.is-list { grid-template-columns: 1fr; }
.pd-images.is-list .pd-image { flex-direction: row; align-items: center; }
.pd-images.is-list .pd-image__media { width: 88px; border-bottom: 0; border-right: 1px solid var(--theme-border); flex-shrink: 0; }
.pd-images.is-list .pd-image__actions { flex: 1; justify-content: flex-end; }
.pd-images.is-list .pd-image__actions .vg-btn { flex: 0 0 auto; padding: 0 8px; }
.pd-images.is-list .pd-upload { min-height: 72px; flex-direction: row; }

/* Flow steps */
.pd-flow { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; counter-reset: none; }
.pd-flow__step { position: relative; display: flex; gap: 10px; padding: 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.pd-flow__step.is-active { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.pd-flow__num { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; background: var(--theme-panel); border: 1px solid var(--theme-border-control); color: var(--theme-text-muted); font-size: 12px; font-weight: 700; }
.pd-flow__step.is-done .pd-flow__num { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); color: var(--vg-accent); }
.pd-flow__step.is-active .pd-flow__num { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); }
.pd-flow__copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pd-flow__copy strong { font-size: 12px; font-weight: 700; }
.pd-flow__copy small { font-size: 11px; color: var(--theme-text-muted); line-height: 1.4; }

/* Analysis board */
.pd-board { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.pd-board__media { padding: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); overflow: hidden; cursor: zoom-in; }
.pd-board__media img { width: 100%; display: block; }
.pd-board__body { gap: 10px; }
.pd-board__body .vg-kv { font-size: 12px; }
.pd-board__body .vg-btn { align-self: flex-start; }
.pd-diag { margin-top: 12px; gap: 8px; }
.pd-diag__item { padding: 10px 12px; }
.pd-diag__item .vg-kv { font-size: 12px; }
.pd-diag__note { margin-top: 6px; font-size: 12px; }

/* Status */
.pd-status { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.pd-status__icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; background: color-mix(in srgb, var(--vg-gray) 14%, transparent); color: var(--vg-gray); }
.pd-status__icon.is-green { background: var(--vg-accent-soft); color: var(--vg-green); }
.pd-status__icon.is-blue { background: color-mix(in srgb, var(--vg-blue) 14%, transparent); color: var(--vg-blue); }
.pd-status__icon.is-red { background: color-mix(in srgb, var(--vg-red) 14%, transparent); color: var(--vg-red); }
.pd-status__icon.is-amber { background: color-mix(in srgb, var(--vg-amber) 14%, transparent); color: var(--vg-amber); }
.pd-status__copy strong { font-size: 15px; font-weight: 800; line-height: 1.35; }
.pd-status__copy p { margin-top: 4px; font-size: 12px; color: var(--theme-text-muted); }
.pd-status__meta { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--theme-divider); font-size: 12px; }

/* Product analysis */
.pd-analysis { gap: 10px; }
.pd-analysis__summary p { font-size: 13px; line-height: 1.6; color: var(--theme-text-secondary); margin-bottom: 8px; }
.pd-analysis__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.pd-analysis__item { padding: 10px 12px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); border: 1px solid var(--theme-border); min-width: 0; }
.pd-analysis__item.is-hero { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.pd-analysis__item span { font-size: 11px; font-weight: 700; color: var(--theme-text-muted); }
.pd-analysis__item.is-hero span { color: var(--vg-accent); }
.pd-analysis__item p { margin-top: 3px; font-size: 12px; line-height: 1.55; color: var(--theme-text); overflow-wrap: anywhere; }

/* Remark */
.pd-remark { gap: 8px; }
.pd-remark__save { align-self: flex-end; }
.pd-rule { margin-top: 12px; }

/* Log timeline */
.pd-log { position: relative; margin: 0; padding: 0 0 0 18px; list-style: none; display: flex; flex-direction: column; gap: 12px; }
.pd-log::before { content: ''; position: absolute; left: 4px; top: 6px; bottom: 6px; width: 1px; background: var(--theme-divider); }
.pd-log li { position: relative; display: flex; flex-direction: column; gap: 2px; }
.pd-log li::before { content: ''; position: absolute; left: -18px; top: 4px; width: 9px; height: 9px; border-radius: 50%; background: var(--vg-gray); box-shadow: 0 0 0 3px var(--theme-panel); }
.pd-log li.is-green::before { background: var(--vg-green); }
.pd-log li.is-amber::before { background: var(--vg-amber); }
.pd-log li.is-blue::before { background: var(--vg-blue); }
.pd-log time { font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.pd-log p { font-size: 12px; color: var(--theme-text); line-height: 1.5; }

@media (max-width: 1240px) {
  .pd-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pd-summary__item:nth-child(4) { border-left: 0; }
  .pd-summary__item { border-top: 1px solid var(--theme-divider); }
  .pd-grid { grid-template-columns: 1fr; }
}
</style>
