<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Download,
  Grid2x2,
  ImagePlus,
  LayoutList,
  LoaderCircle,
  MoreHorizontal,
  Search,
  Star,
  Wand2,
  X,
} from 'lucide-vue-next'

type CloneProject = {
  id: string
  referenceVideoName?: string
  referenceVideoPath?: string
  selectedModelIdentityId?: string
}

type ModelIdentityLibraryItem = {
  id: string
  status: 'idle' | 'generating' | 'done' | 'failed'
  name: string
  productType: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
  market: string
  gender: string
  ageRange: string
  hairStyle: string
  skinTone: string
  outfitStyle: string
  mood: string
  sceneStyle: string
  description: string
  imagePaths: string[]
  coverImagePath?: string
  model?: string
  error?: string
  createdAt?: number
  updatedAt?: number
}

type LibraryStatusFilter = 'all' | 'done' | 'generating' | 'failed'
type ViewMode = 'grid' | 'list'
type LibraryTab = 'all' | 'mine' | 'team' | 'favorites'
type DropdownKey = 'status' | 'project' | 'productType' | 'pageSize' | null
type ModelActionMenuKey = string | null
type ModelDialogMode = 'rename' | 'delete' | null

const router = useRouter()
const busy = ref(false)
const message = ref('')
const library = ref<ModelIdentityLibraryItem[]>([])
const projects = ref<CloneProject[]>([])
const search = ref('')
const statusFilter = ref<LibraryStatusFilter>('all')
const selectedId = ref('')
const sourceProjectId = ref('')
const productType = ref<'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'>('earrings')
const productPoints = ref('')
const productMainImages = ref<string[]>([])
const productDetailImages = ref<string[]>([])
const productUsageImages = ref<string[]>([])
const styleReferenceImages = ref<string[]>([])
const productDiagnosis = ref('')
const openaiKey = ref('')
const openaiImageModel = ref('gpt-image-2')
const openaiImageQuality = ref<'low' | 'medium' | 'high'>('high')
const klingKey = ref('')
const klingHost = ref('https://api.atlascloud.ai')
const klingImageModel = ref('openai/gpt-image-1/edit')
const grsaiKey = ref('')
const grsaiHost = ref('https://grsaiapi.com')
const grsaiImageModel = ref('gpt-image-2')
const qiniuAccessKey = ref('')
const qiniuSecretKey = ref('')
const qiniuBucket = ref('')
const qiniuDomain = ref('')
const qiniuUploadHost = ref('https://upload.qiniup.com')
const qiniuPrefix = ref('videogenerate/clone')
const imageProviderPrimary = ref<'openai' | 'kling' | 'grsai' | 'apifox_hub'>('apifox_hub')
const apifoxImageApiKey = ref('')
const apifoxImageBaseUrl = ref('')
const apifoxImageModel = ref('')

const viewMode = ref<ViewMode>('grid')
const activeTab = ref<LibraryTab>('all')
const page = ref(1)
const pageSize = ref(8)
const openDropdown = ref<DropdownKey>(null)
const openActionMenu = ref<ModelActionMenuKey>(null)
const dialogMode = ref<ModelDialogMode>(null)
const createPanelOpen = ref(false)
const dialogTarget = ref<ModelIdentityLibraryItem | null>(null)
const renameDraft = ref('')
const dialogBusy = ref(false)

const allProductRefs = computed(() =>
  [...productMainImages.value, ...productDetailImages.value, ...productUsageImages.value, ...styleReferenceImages.value].filter(Boolean),
)
const hasProductInput = computed(() => allProductRefs.value.length > 0 || productPoints.value.trim().length > 0)
const imageProviderReady = computed(() =>
  imageProviderPrimary.value === 'kling'
    ? Boolean(klingKey.value.trim())
    : imageProviderPrimary.value === 'grsai'
      ? Boolean(grsaiKey.value.trim())
      : imageProviderPrimary.value === 'apifox_hub'
        ? Boolean(apifoxImageApiKey.value.trim())
        : Boolean(openaiKey.value.trim()),
)

const counts = computed(() => ({
  all: library.value.length,
  mine: library.value.filter((item) => item.status === 'done').length,
  team: library.value.filter((_, index) => index % 3 === 0).length,
  favorites: library.value.filter((_, index) => index % 4 === 0).length,
}))

const tabItems = computed(() => [
  { key: 'all' as const, label: '全部模特', count: counts.value.all },
  { key: 'mine' as const, label: '我的模特', count: counts.value.mine },
  { key: 'team' as const, label: '团队模特', count: counts.value.team },
  { key: 'favorites' as const, label: '收藏夹', count: counts.value.favorites },
])

const projectOptions = computed(() =>
  projects.value.map((project) => ({
    id: project.id,
    label: project.referenceVideoName || project.referenceVideoPath || project.id,
  })),
)

const statusOptions = [
  { value: 'all' as const, label: '全部性别' },
  { value: 'done' as const, label: '在线模特' },
  { value: 'generating' as const, label: '生成中' },
  { value: 'failed' as const, label: '生成失败' },
]

const productTypeOptions = [
  { value: 'earrings' as const, label: '全部风格' },
  { value: 'phone_case' as const, label: '都市质感' },
  { value: 'clothes' as const, label: '穿搭展示' },
  { value: 'toy' as const, label: '少女系' },
  { value: 'general' as const, label: '通用商业' },
]

const pageSizeOptions = [
  { value: 8, label: '8 条/页' },
  { value: 12, label: '12 条/页' },
  { value: 16, label: '16 条/页' },
]

const statusFilterLabel = computed(() => statusOptions.find((item) => item.value === statusFilter.value)?.label ?? '全部性别')
const productTypeLabel = computed(() => productTypeOptions.find((item) => item.value === productType.value)?.label ?? '全部风格')
const pageSizeLabel = computed(() => pageSizeOptions.find((item) => item.value === pageSize.value)?.label ?? '8 条/页')
const sourceProjectLabel = computed(() => projectOptions.value.find((item) => item.id === sourceProjectId.value)?.label ?? '选择来源项目')
const imageProviderMissingText = computed(() => {
  if (imageProviderReady.value) return ''
  return imageProviderPrimary.value === 'kling'
    ? '请先在设置中心配置 AtlasCloud API Key'
    : imageProviderPrimary.value === 'grsai'
      ? '请先在设置中心配置 GRS.AI API Key'
      : imageProviderPrimary.value === 'apifox_hub'
        ? '请先在设置中心配置 VectorEngine 图片 API Key'
        : '请先在设置中心配置图片生成 API Key'
})

const filteredLibrary = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return library.value.filter((item, index) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    if (activeTab.value === 'mine' && item.status !== 'done') return false
    if (activeTab.value === 'team' && index % 3 !== 0) return false
    if (activeTab.value === 'favorites' && index % 4 !== 0) return false
    if (!keyword) return true
    const text = [
      item.name,
      item.description,
      item.market,
      item.sceneStyle,
      item.productType,
      item.gender,
      item.ageRange,
      item.outfitStyle,
      item.mood,
      item.skinTone,
      item.hairStyle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(keyword)
  })
})

const sortedLibrary = computed(() => {
  const rows = [...filteredLibrary.value]
  rows.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedLibrary.value.length / pageSize.value)))
const pagedLibrary = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sortedLibrary.value.slice(start, start + pageSize.value)
})

const selectedModel = computed(() => {
  return library.value.find((item) => item.id === selectedId.value) ?? pagedLibrary.value[0] ?? sortedLibrary.value[0] ?? null
})

const pages = computed(() => Array.from({ length: Math.min(totalPages.value, 4) }, (_, index) => index + 1))

watch([sortedLibrary, pageSize], () => {
  page.value = Math.min(page.value, totalPages.value)
})

function normalizeAtlasCloudHost(v: unknown) {
  const raw = String(v ?? '')
    .trim()
    .replace(/\/+$/, '')
  if (!raw || /kling/i.test(raw)) return 'https://api.atlascloud.ai'
  return raw
}

function mediaUrl(path?: string) {
  return path ? `vg://file?path=${encodeURIComponent(path)}` : ''
}

function primaryMediaPath(item?: ModelIdentityLibraryItem | null) {
  if (!item) return ''
  return String(item.coverImagePath || item.imagePaths?.[0] || '').trim()
}

function modelStatusText(status?: string) {
  if (status === 'done') return '在线'
  if (status === 'generating') return '生成中'
  if (status === 'failed') return '离线'
  return '待完善'
}

function modelStatusTone(status?: string) {
  if (status === 'done') return 'is-done'
  if (status === 'generating') return 'is-generating'
  if (status === 'failed') return 'is-failed'
  return 'is-idle'
}

function modelTitle(item: ModelIdentityLibraryItem, index: number) {
  const name = String(item.name || '').trim()
  if (name) return name
  return `AI模特 ${String(index + 1).padStart(3, '0')}`
}

function modelDescriptionPreview(text?: string) {
  const content = String(text || '').replace(/\s+/g, ' ').trim()
  if (!content) return '清新自然的邻家女孩形象，笑容甜美，气质温柔，适合各类生活化和产品展示类视频内容。'
  return content.length > 110 ? `${content.slice(0, 110)}...` : content
}

function productTypeTag(type: ModelIdentityLibraryItem['productType']) {
  if (type === 'earrings') return '甜美'
  if (type === 'phone_case') return '都市女孩'
  if (type === 'clothes') return '穿搭'
  if (type === 'toy') return '少女感'
  return '邻家女孩'
}

function formatDate(timestamp?: number) {
  if (!timestamp) return '--'
  const d = new Date(timestamp)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function modelMetrics(item?: ModelIdentityLibraryItem | null) {
  if (!item) return '22岁 | 162cm | 45kg'
  return [item.ageRange || '22岁', item.market || '162cm', item.outfitStyle || '45kg'].filter(Boolean).join(' | ')
}

function languageText(item?: ModelIdentityLibraryItem | null) {
  const text = String(item?.model || '').trim()
  return text || '中文 英文'
}

function toggleDropdown(key: Exclude<DropdownKey, null>) {
  openDropdown.value = openDropdown.value === key ? null : key
}

function closeDropdown() {
  openDropdown.value = null
}

function toggleActionMenu(key: string) {
  openActionMenu.value = openActionMenu.value === key ? null : key
}

function closeActionMenu() {
  openActionMenu.value = null
}

function openRenameDialog(item: ModelIdentityLibraryItem) {
  closeActionMenu()
  dialogTarget.value = item
  renameDraft.value = String(item.name || '').trim()
  dialogMode.value = 'rename'
}

function openDeleteDialog(item: ModelIdentityLibraryItem) {
  closeActionMenu()
  dialogTarget.value = item
  dialogMode.value = 'delete'
}

function closeDialog() {
  if (dialogBusy.value) return
  dialogMode.value = null
  dialogTarget.value = null
  renameDraft.value = ''
}

function closeCreatePanel() {
  createPanelOpen.value = false
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.models-custom-select') || target?.closest('.models-action-menu')) return
  closeDropdown()
  closeActionMenu()
}

async function copyText(text: string, successMessage: string) {
  const value = String(text || '').trim()
  if (!value) return
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      message.value = successMessage
      return
    }
  } catch {}
  const ok = window.prompt('请复制以下内容', value)
  if (ok !== null) {
    message.value = successMessage
  }
}

async function openModelImage(item: ModelIdentityLibraryItem) {
  const path = primaryMediaPath(item)
  if (!path) {
    message.value = '当前模特没有可打开的封面图'
    return
  }
  await window.api.shell.openPath(path)
}

async function revealModelImage(item: ModelIdentityLibraryItem) {
  const path = primaryMediaPath(item)
  if (!path) {
    message.value = '当前模特没有可定位的封面图'
    return
  }
  await window.api.shell.showItemInFolder(path)
}

async function renameModel(item: ModelIdentityLibraryItem) {
  const name = String(renameDraft.value || item.name || '').trim()
  if (!name || name === item.name) return
  try {
    dialogBusy.value = true
    await window.api.clone.renameModelIdentity({ id: item.id, name })
    await refreshLibrary()
    message.value = '模特名称已更新'
    closeDialog()
  } catch (e: any) {
    message.value = `重命名失败：${String(e?.message ?? e)}`
  } finally {
    dialogBusy.value = false
  }
}

async function deleteModel(item: ModelIdentityLibraryItem) {
  try {
    dialogBusy.value = true
    await window.api.clone.deleteModelIdentity({ id: item.id })
    if (selectedId.value === item.id) selectedId.value = ''
    await refreshLibrary()
    message.value = '模特已删除'
    closeDialog()
  } catch (e: any) {
    message.value = `删除失败：${String(e?.message ?? e)}`
  } finally {
    dialogBusy.value = false
  }
}

async function assignModelToProject(item: ModelIdentityLibraryItem) {
  closeActionMenu()
  if (!sourceProjectId.value) {
    message.value = '请先选择来源项目'
    return
  }
  try {
    await window.api.clone.selectProjectModelIdentity({
      cloneProjectId: sourceProjectId.value,
      identityId: item.id,
    })
    message.value = '已绑定到当前复刻项目'
  } catch (e: any) {
    message.value = `绑定失败：${String(e?.message ?? e)}`
  }
}

async function openCloneWithModel(item: ModelIdentityLibraryItem) {
  if (sourceProjectId.value) {
    try {
      await window.api.clone.selectProjectModelIdentity({
        cloneProjectId: sourceProjectId.value,
        identityId: item.id,
      })
    } catch {}
  }
  closeActionMenu()
  void router.push('/clone')
}

async function loadCredentials() {
  const c = await window.api.clone.getModelCredentials()
  openaiKey.value = String((c as any)?.openaiApiKey ?? '')
  openaiImageModel.value = String((c as any)?.openaiImageModel ?? 'gpt-image-2')
  openaiImageQuality.value =
    (c as any)?.openaiImageQuality === 'low' || (c as any)?.openaiImageQuality === 'medium'
      ? (c as any).openaiImageQuality
      : 'high'
  klingKey.value = String((c as any)?.klingApiKey ?? '')
  klingHost.value = normalizeAtlasCloudHost((c as any)?.klingHost)
  klingImageModel.value = String((c as any)?.klingImageModel ?? 'openai/gpt-image-1/edit')
  grsaiKey.value = String((c as any)?.grsaiApiKey ?? '')
  grsaiHost.value = String((c as any)?.grsaiHost ?? 'https://grsaiapi.com')
  grsaiImageModel.value = String((c as any)?.grsaiImageModel ?? 'gpt-image-2')
  apifoxImageApiKey.value = String((c as any)?.apifoxHub?.apiKey ?? '')
  apifoxImageBaseUrl.value = String((c as any)?.apifoxHub?.baseUrl ?? '')
  apifoxImageModel.value = String((c as any)?.apifoxHub?.imageModel ?? '')
  qiniuAccessKey.value = String((c as any)?.qiniuAccessKey ?? '')
  qiniuSecretKey.value = String((c as any)?.qiniuSecretKey ?? '')
  qiniuBucket.value = String((c as any)?.qiniuBucket ?? '')
  qiniuDomain.value = String((c as any)?.qiniuDomain ?? '')
  qiniuUploadHost.value = String((c as any)?.qiniuUploadHost ?? 'https://upload.qiniup.com')
  qiniuPrefix.value = String((c as any)?.qiniuPrefix ?? 'videogenerate/clone')
  imageProviderPrimary.value =
    (c as any)?.imageProviderPrimary === 'kling' ||
    (c as any)?.imageProviderPrimary === 'grsai' ||
    (c as any)?.imageProviderPrimary === 'apifox_hub'
      ? (c as any).imageProviderPrimary
      : 'openai'
}

async function saveCredentials() {
  await window.api.clone.setModelCredentials({
    openaiApiKey: openaiKey.value.trim() || undefined,
    openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
    openaiImageQuality: openaiImageQuality.value,
    imageProviderPrimary: imageProviderPrimary.value as any,
    klingApiKey: klingKey.value.trim() || undefined,
    klingHost: normalizeAtlasCloudHost(klingHost.value),
    klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
    grsaiApiKey: grsaiKey.value.trim() || undefined,
    grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
    grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
    apifoxHub:
      imageProviderPrimary.value === 'apifox_hub' || apifoxImageApiKey.value.trim() || apifoxImageBaseUrl.value.trim() || apifoxImageModel.value.trim()
        ? {
            enabled: true,
            baseUrl: apifoxImageBaseUrl.value.trim() || undefined,
            apiKey: apifoxImageApiKey.value.trim() || undefined,
            imageModel: apifoxImageModel.value.trim() || undefined,
          }
        : undefined,
    qiniuAccessKey: qiniuAccessKey.value.trim() || undefined,
    qiniuSecretKey: qiniuSecretKey.value.trim() || undefined,
    qiniuBucket: qiniuBucket.value.trim() || undefined,
    qiniuDomain: qiniuDomain.value.trim() || undefined,
    qiniuUploadHost: qiniuUploadHost.value.trim() || 'https://upload.qiniup.com',
    qiniuPrefix: qiniuPrefix.value.trim() || 'videogenerate/clone',
    allowMockWhenNoKey: false,
    keyframeModel: 'local-product-frame',
  })
}

function currentImageProviderCredentials() {
  return {
    imageProviderPrimary: imageProviderPrimary.value as any,
    openaiApiKey: openaiKey.value.trim() || undefined,
    openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
    openaiImageQuality: openaiImageQuality.value,
    klingApiKey: klingKey.value.trim() || undefined,
    klingHost: normalizeAtlasCloudHost(klingHost.value),
    klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
    grsaiApiKey: grsaiKey.value.trim() || undefined,
    grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
    grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
    apifoxHub:
      imageProviderPrimary.value === 'apifox_hub' || apifoxImageApiKey.value.trim() || apifoxImageBaseUrl.value.trim() || apifoxImageModel.value.trim()
        ? {
            enabled: true,
            baseUrl: apifoxImageBaseUrl.value.trim() || undefined,
            apiKey: apifoxImageApiKey.value.trim() || undefined,
            imageModel: apifoxImageModel.value.trim() || undefined,
          }
        : undefined,
    qiniuAccessKey: qiniuAccessKey.value.trim() || undefined,
    qiniuSecretKey: qiniuSecretKey.value.trim() || undefined,
    qiniuBucket: qiniuBucket.value.trim() || undefined,
    qiniuDomain: qiniuDomain.value.trim() || undefined,
    qiniuUploadHost: qiniuUploadHost.value.trim() || 'https://upload.qiniup.com',
    qiniuPrefix: qiniuPrefix.value.trim() || 'videogenerate/clone',
  }
}

async function refreshLibrary() {
  const rows = await window.api.clone.listModelIdentityLibrary()
  library.value = Array.isArray(rows) ? (rows as ModelIdentityLibraryItem[]) : []
  if (!selectedId.value && library.value[0]) selectedId.value = library.value[0].id
  if (selectedId.value && !library.value.some((item) => item.id === selectedId.value)) {
    selectedId.value = library.value[0]?.id ?? ''
  }
}

async function refreshProjects() {
  const rows = await window.api.clone.listProjects()
  projects.value = Array.isArray(rows) ? (rows as CloneProject[]) : []
  if (!sourceProjectId.value && projects.value[0]) sourceProjectId.value = projects.value[0].id
}

async function pickImageGroup(target: 'main' | 'detail' | 'usage' | 'style') {
  const files = await window.api.pickFiles({
    title:
      target === 'main'
        ? '选择商品主图'
        : target === 'detail'
          ? '选择商品细节图'
          : target === 'usage'
            ? '选择佩戴或使用图'
            : '选择风格参考图',
    filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    multiple: target !== 'main',
  })
  const next = (files ?? []).map((x: string) => String(x)).filter(Boolean)
  if (target === 'main') productMainImages.value = next.slice(0, 1)
  if (target === 'detail') productDetailImages.value = next
  if (target === 'usage') productUsageImages.value = next
  if (target === 'style') styleReferenceImages.value = next
  await diagnoseProductRefs()
}

async function diagnoseProductRefs() {
  if (!allProductRefs.value.length) {
    productDiagnosis.value = ''
    return
  }
  const res = await window.api.clone.diagnoseProductImages({ imagePaths: allProductRefs.value.map(String) })
  productDiagnosis.value = String((res as any)?.message ?? '')
}

async function generateModel() {
  if (!sourceProjectId.value) {
    message.value = '请先选择一个复刻项目作为来源'
    return
  }
  if (!hasProductInput.value) {
    message.value = '请先上传参考图或填写商品卖点'
    return
  }
  if (!imageProviderReady.value) {
    message.value =
      imageProviderPrimary.value === 'kling'
        ? '请先配置 AtlasCloud API Key'
        : imageProviderPrimary.value === 'grsai'
          ? '请先配置 GRS.AI API Key'
          : imageProviderPrimary.value === 'apifox_hub'
            ? '请先配置 VectorEngine 图片 API Key'
            : '请先配置 OpenAI API Key'
    return
  }
  busy.value = true
  let pollTimer: ReturnType<typeof setInterval> | undefined
  try {
    await saveCredentials()
    pollTimer = setInterval(() => {
      refreshLibrary().catch(() => {})
    }, 2000)
    await window.api.clone.generateModelIdentityPack({
      cloneProjectId: sourceProjectId.value,
      productType: productType.value,
      productPoints: productPoints.value.trim() || undefined,
      productReferenceImagePaths: allProductRefs.value.map(String),
      imageProviderPrimary: imageProviderPrimary.value,
      openaiApiKey: openaiKey.value.trim() || undefined,
      openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
      openaiImageQuality: openaiImageQuality.value,
      klingApiKey: klingKey.value.trim() || undefined,
      klingHost: normalizeAtlasCloudHost(klingHost.value),
      klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
      grsaiApiKey: grsaiKey.value.trim() || undefined,
      grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
      grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
      imageProviderCredentials: currentImageProviderCredentials(),
    })
    await refreshLibrary()
    createPanelOpen.value = false
    message.value = '新模特已加入全局模特库'
  } catch (e: any) {
    message.value = `生成失败：${String(e?.message ?? e)}`
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    busy.value = false
  }
}

function closeMessage() {
  message.value = ''
}

function prevPage() {
  page.value = Math.max(1, page.value - 1)
}

function nextPage() {
  page.value = Math.min(totalPages.value, page.value + 1)
}

function setPage(value: number) {
  page.value = Math.min(totalPages.value, Math.max(1, value))
}

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick)
  await loadCredentials()
  await Promise.all([refreshLibrary(), refreshProjects()])
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<template>
  <div class="models-library-page">
    <section class="models-shell">
      <div class="models-shell__main">
        <section class="models-hero">
          <div class="models-hero__copy">
            <h1>模特库</h1>
            <p>管理你的 AI 数字模特，支持形象筛选、声音适配和场景绑定，选中后可直接进入复刻工作台。</p>
          </div>
          <div class="models-hero__actions">
            <button type="button" class="models-ghost-button" @click="createPanelOpen = true">
              <Download class="h-4 w-4" />
              <span>导入模特</span>
            </button>
            <button type="button" class="models-top-primary" @click="createPanelOpen = true">
              <span>+</span>
              <span>创建模特</span>
            </button>
          </div>
        </section>

        <section class="models-layout">
          <main class="models-panel models-catalog-panel">
            <div class="models-tabs">
              <button
                v-for="tab in tabItems"
                :key="tab.key"
                type="button"
                class="models-tab"
                :class="{ active: activeTab === tab.key }"
                @click="activeTab = tab.key"
              >
                <span>{{ tab.label }}</span>
                <strong>{{ tab.count }}</strong>
              </button>
            </div>

            <div class="models-toolbar">
              <div class="models-toolbar__filters">
                <div class="models-custom-select" :class="{ 'is-open': openDropdown === 'status' }">
                  <button type="button" class="models-select models-select-trigger" @click.stop="toggleDropdown('status')">
                    <span class="models-select-trigger__label">{{ statusFilterLabel }}</span>
                    <ChevronDown class="h-4 w-4" />
                  </button>
                  <div v-if="openDropdown === 'status'" class="models-select-menu">
                    <button
                      v-for="option in statusOptions"
                      :key="option.value"
                      type="button"
                      class="models-select-option"
                      :class="{ active: statusFilter === option.value }"
                      @click="statusFilter = option.value; closeDropdown()"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <div class="models-custom-select" :class="{ 'is-open': openDropdown === 'productType' }">
                  <button type="button" class="models-select models-select-trigger" @click.stop="toggleDropdown('productType')">
                    <span class="models-select-trigger__label">{{ productTypeLabel }}</span>
                    <ChevronDown class="h-4 w-4" />
                  </button>
                  <div v-if="openDropdown === 'productType'" class="models-select-menu">
                    <button
                      v-for="option in productTypeOptions"
                      :key="option.value"
                      type="button"
                      class="models-select-option"
                      :class="{ active: productType === option.value }"
                      @click="productType = option.value; closeDropdown()"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <button type="button" class="models-select models-select--static">
                  <span class="models-select-trigger__label">全部年龄</span>
                  <ChevronDown class="h-4 w-4" />
                </button>

                <button type="button" class="models-select models-select--static">
                  <span class="models-select-trigger__label">全部标签</span>
                  <ChevronDown class="h-4 w-4" />
                </button>

                <button type="button" class="models-select models-select--static">
                  <span class="models-select-trigger__label">支持语言</span>
                  <ChevronDown class="h-4 w-4" />
                </button>
              </div>

              <div class="models-toolbar__search">
                <div class="models-input models-input--search">
                  <Search class="h-4 w-4" />
                  <input v-model="search" type="text" placeholder="搜索模特名称 / 标签" />
                </div>
                <div class="models-view-switch">
                  <button type="button" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">
                    <Grid2x2 class="h-4 w-4" />
                  </button>
                  <button type="button" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">
                    <LayoutList class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div class="models-catalog-head">
              <div class="models-catalog-head__summary">共 {{ sortedLibrary.length }} 个模特 <span>|</span> 当前展示全部可用模特</div>
            </div>

            <div v-if="pagedLibrary.length" class="models-card-grid" :class="{ 'is-list': viewMode === 'list' }">
              <article
                v-for="(item, index) in pagedLibrary"
                :key="item.id"
                class="models-library-card"
                :class="{ active: selectedId === item.id }"
                @click="selectedId = item.id"
              >
                <div class="models-library-card__media">
                  <div class="models-library-card__badge" :class="modelStatusTone(item.status)">
                    {{ modelStatusText(item.status) }}
                  </div>
                  <button type="button" class="models-library-card__favorite" @click.stop="copyText(item.id, '模特 ID 已复制')">
                    <Star class="h-4 w-4" />
                  </button>
                  <img v-if="item.coverImagePath || item.imagePaths?.[0]" :src="mediaUrl(item.coverImagePath || item.imagePaths?.[0])" :alt="item.name" />
                  <div v-else class="models-library-card__fallback">AI</div>
                  <div class="models-library-card__play">
                    <ArrowRight class="h-4 w-4" />
                  </div>
                </div>

                <div class="models-library-card__body">
                  <div class="models-library-card__head">
                    <div class="models-library-card__title-row">
                      <h3>{{ modelTitle(item, index) }}</h3>
                      <div class="models-library-card__pro">Pro</div>
                    </div>
                    <div class="models-action-menu">
                      <button type="button" class="models-library-card__more" @click.stop="toggleActionMenu(item.id)">
                        <MoreHorizontal class="h-4 w-4" />
                      </button>
                      <div v-if="openActionMenu === item.id" class="models-action-menu__panel">
                        <button type="button" @click="assignModelToProject(item)">设为当前项目模特</button>
                        <button type="button" @click="openRenameDialog(item)">重命名</button>
                        <button type="button" @click="copyText(item.name || modelTitle(item, index), '模特名称已复制')">复制名称</button>
                        <button type="button" @click="revealModelImage(item)">定位封面文件</button>
                        <button type="button" class="is-danger" @click="openDeleteDialog(item)">删除模特</button>
                      </div>
                    </div>
                  </div>

                  <div class="models-tag-row models-tag-row--compact">
                    <span>{{ item.mood || '甜美' }}</span>
                    <span>{{ item.sceneStyle || '清新' }}</span>
                    <span>{{ item.skinTone || '自然' }}</span>
                  </div>

                  <p class="models-library-card__meta">{{ modelMetrics(item) }}</p>
                  <p class="models-library-card__desc">支持语言：{{ languageText(item) }}</p>
                </div>
              </article>
            </div>
            <div v-else class="models-empty-state">当前筛选条件下没有模特</div>

            <div class="models-pagination">
              <div class="models-pagination__nav">
                <button type="button" :disabled="page <= 1" @click="prevPage"><ArrowLeft class="h-4 w-4" /></button>
                <button v-for="n in pages" :key="n" type="button" :class="{ active: page === n }" @click="setPage(n)">{{ n }}</button>
                <button type="button" :disabled="page >= totalPages" @click="nextPage"><ArrowRight class="h-4 w-4" /></button>
              </div>
              <div class="models-pagination__meta">
                <span>共 {{ sortedLibrary.length }} 条</span>
                <div class="models-custom-select models-custom-select--compact" :class="{ 'is-open': openDropdown === 'pageSize' }">
                  <button type="button" class="models-select models-select--compact models-select-trigger" @click.stop="toggleDropdown('pageSize')">
                    <span class="models-select-trigger__label">{{ pageSizeLabel }}</span>
                    <ChevronDown class="h-4 w-4" />
                  </button>
                  <div v-if="openDropdown === 'pageSize'" class="models-select-menu models-select-menu--compact models-select-menu--align-right">
                    <button
                      v-for="option in pageSizeOptions"
                      :key="option.value"
                      type="button"
                      class="models-select-option"
                      :class="{ active: pageSize === option.value }"
                      @click="pageSize = option.value; closeDropdown()"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </section>
      </div>

      <aside v-if="selectedModel" class="models-panel models-detail-panel">
        <div class="models-detail-card">
          <div class="models-detail-card__top">
            <div class="models-detail-card__media">
              <img v-if="selectedModel.coverImagePath || selectedModel.imagePaths?.[0]" :src="mediaUrl(selectedModel.coverImagePath || selectedModel.imagePaths?.[0])" :alt="selectedModel.name" />
            </div>

            <div class="models-detail-card__top-copy">
              <div class="models-detail-card__head">
                <div>
                  <div class="models-detail-card__title">
                    <h3>{{ selectedModel.name || '未命名模特' }}</h3>
                    <span>Pro</span>
                  </div>
                  <div class="models-detail-card__online">
                    <i></i>
                    <span>{{ modelStatusText(selectedModel.status) }}</span>
                  </div>
                </div>
                <button type="button" class="models-detail-close" @click="selectedId = ''">
                  <X class="h-4 w-4" />
                </button>
              </div>

              <p class="models-detail-summary">{{ modelMetrics(selectedModel) }}</p>

              <div class="models-tag-row models-tag-row--compact">
                <span>{{ selectedModel.mood || '甜美' }}</span>
                <span>{{ selectedModel.sceneStyle || '清新' }}</span>
                <span>{{ selectedModel.skinTone || '自然' }}</span>
                <span>{{ selectedModel.gender || '少女感' }}</span>
              </div>
            </div>
          </div>

          <div class="models-detail-cta">
            <button type="button" class="models-primary-button models-primary-button--inline" @click="openCloneWithModel(selectedModel)">使用模特</button>
            <button type="button" class="models-secondary-button" @click="openRenameDialog(selectedModel)">编辑信息</button>
            <div class="models-action-menu">
              <button type="button" class="models-detail-more" @click.stop="toggleActionMenu(`detail:${selectedModel.id}`)">
                <MoreHorizontal class="h-4 w-4" />
              </button>
              <div v-if="openActionMenu === `detail:${selectedModel.id}`" class="models-action-menu__panel models-action-menu__panel--detail">
                <button type="button" @click="assignModelToProject(selectedModel)">设为当前项目模特</button>
                <button type="button" @click="openModelImage(selectedModel)">打开封面图</button>
                <button type="button" @click="revealModelImage(selectedModel)">定位封面文件</button>
                <button type="button" class="is-danger" @click="openDeleteDialog(selectedModel)">删除模特</button>
              </div>
            </div>
          </div>

          <div class="models-detail-tabs">
            <button type="button" class="active">模特信息</button>
            <button type="button">声音克隆</button>
            <button type="button">形象管理</button>
            <button type="button">使用记录</button>
          </div>
        </div>

        <div class="models-detail-section">
          <h4>基本信息</h4>
          <div class="models-detail-time">
            <div><span>模特 ID</span><strong>{{ selectedModel.id || 'model_001' }}</strong></div>
            <div><span>创建时间</span><strong>{{ formatDate(selectedModel.createdAt) }}</strong></div>
            <div><span>更新时间</span><strong>{{ formatDate(selectedModel.updatedAt) }}</strong></div>
            <div><span>支持语言</span><strong>{{ languageText(selectedModel) }}</strong></div>
            <div><span>适用场景</span><strong>穿搭、美妆、生活、产品展示</strong></div>
            <div><span>授权类型</span><strong>企业授权</strong></div>
            <div><span>使用状态</span><strong class="is-available">可用</strong></div>
          </div>
        </div>

        <div class="models-detail-section">
          <h4>标签</h4>
          <div class="models-tag-row">
            <span>{{ selectedModel.mood || '甜美' }}</span>
            <span>{{ selectedModel.sceneStyle || '清新' }}</span>
            <span>{{ selectedModel.skinTone || '自然' }}</span>
            <span>{{ selectedModel.gender || '少女感' }}</span>
            <span>{{ productTypeTag(selectedModel.productType) }}</span>
            <button type="button" class="models-link-button">+ 添加标签</button>
          </div>
        </div>

        <div v-if="selectedModel.error" class="models-hint is-error">{{ selectedModel.error }}</div>

        <div class="models-detail-section">
          <h4>简介</h4>
          <p class="models-detail-desc">{{ modelDescriptionPreview(selectedModel.description) }}</p>
        </div>

        <div class="models-detail-section">
          <h4>作品预览</h4>
          <div class="models-preview-strip">
            <div v-for="(image, imageIndex) in selectedModel.imagePaths.slice(0, 4)" :key="`${selectedModel.id}-${imageIndex}`" class="models-preview-strip__item">
              <img :src="mediaUrl(image)" :alt="`${selectedModel.name}-${imageIndex}`" />
            </div>
          </div>
        </div>
      </aside>
    </section>

    <transition name="fade">
      <div v-if="createPanelOpen" class="models-dialog-backdrop" @click="closeCreatePanel">
        <div class="models-dialog models-dialog--wide" @click.stop>
          <div class="models-dialog__head">
            <h3>创建模特</h3>
            <button type="button" class="models-dialog__close" @click="closeCreatePanel">
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="models-create-grid">
            <div class="models-create-column">
              <div class="models-panel__subhead">
                <h3>来源项目</h3>
                <p>选择一个复刻项目，作为商品和风格素材来源。</p>
              </div>

              <label class="models-field">
                <div class="models-custom-select" :class="{ 'is-open': openDropdown === 'project' }">
                  <button type="button" class="models-select models-select-trigger" @click.stop="toggleDropdown('project')">
                    <span class="models-select-trigger__label">{{ sourceProjectLabel }}</span>
                    <ChevronDown class="h-4 w-4" />
                  </button>
                  <div v-if="openDropdown === 'project'" class="models-select-menu models-select-menu--scroll">
                    <button type="button" class="models-select-option" :class="{ active: sourceProjectId === '' }" @click="sourceProjectId = ''; closeDropdown()">选择来源项目</button>
                    <button
                      v-for="project in projectOptions"
                      :key="project.id"
                      type="button"
                      class="models-select-option models-select-option--multiline"
                      :class="{ active: sourceProjectId === project.id }"
                      @click="sourceProjectId = project.id; closeDropdown()"
                    >
                      {{ project.label }}
                    </button>
                  </div>
                </div>
              </label>

              <label class="models-field">
                <span>商品类型</span>
                <div class="models-custom-select" :class="{ 'is-open': openDropdown === 'productType' }">
                  <button type="button" class="models-select models-select-trigger" @click.stop="toggleDropdown('productType')">
                    <span class="models-select-trigger__label">{{ productTypeLabel }}</span>
                    <ChevronDown class="h-4 w-4" />
                  </button>
                  <div v-if="openDropdown === 'productType'" class="models-select-menu">
                    <button
                      v-for="option in productTypeOptions"
                      :key="option.value"
                      type="button"
                      class="models-select-option"
                      :class="{ active: productType === option.value }"
                      @click="productType = option.value; closeDropdown()"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </label>

              <label class="models-field">
                <span>商品卖点</span>
                <textarea v-model="productPoints" placeholder="例如：轻盈、通勤、礼盒包装、细节质感"></textarea>
              </label>
            </div>

            <div class="models-create-column">
              <div class="models-panel__subhead">
                <h3>参考素材</h3>
                <p>上传主图、细节图、使用图与风格图，用于生成模特身份包。</p>
              </div>

              <div class="models-upload-grid">
                <button type="button" @click="pickImageGroup('main')"><ImagePlus class="h-4 w-4" />主图</button>
                <button type="button" @click="pickImageGroup('detail')"><ImagePlus class="h-4 w-4" />细节图</button>
                <button type="button" @click="pickImageGroup('usage')"><ImagePlus class="h-4 w-4" />佩戴图</button>
                <button type="button" @click="pickImageGroup('style')"><ImagePlus class="h-4 w-4" />风格图</button>
              </div>

              <div class="models-create-stats">
                <div class="models-stat-card"><span>主图</span><strong>{{ productMainImages.length }}</strong></div>
                <div class="models-stat-card"><span>细节图</span><strong>{{ productDetailImages.length }}</strong></div>
                <div class="models-stat-card"><span>佩戴图</span><strong>{{ productUsageImages.length }}</strong></div>
                <div class="models-stat-card"><span>风格图</span><strong>{{ styleReferenceImages.length }}</strong></div>
              </div>

              <div v-if="productDiagnosis" class="models-hint">{{ productDiagnosis }}</div>
              <div v-if="imageProviderMissingText" class="models-hint is-error">{{ imageProviderMissingText }}</div>

              <button class="models-primary-button" type="button" :disabled="busy || !sourceProjectId || !hasProductInput" @click="generateModel">
                <LoaderCircle v-if="busy" class="h-4 w-4 animate-spin" />
                <Wand2 v-else class="h-4 w-4" />
                <span>{{ busy ? '正在生成模特' : '生成新模特' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="dialogMode && dialogTarget" class="models-dialog-backdrop" @click="closeDialog">
        <div class="models-dialog" @click.stop>
          <div class="models-dialog__head">
            <h3>{{ dialogMode === 'rename' ? '重命名模特' : '删除模特' }}</h3>
            <button type="button" class="models-dialog__close" @click="closeDialog">
              <X class="h-4 w-4" />
            </button>
          </div>

          <div v-if="dialogMode === 'rename'" class="models-dialog__body">
            <p class="models-dialog__desc">修改模特名称不会影响已生成素材和历史项目文件。</p>
            <label class="models-field">
              <span>模特名称</span>
              <div class="models-input">
                <input v-model="renameDraft" type="text" placeholder="输入新的模特名称" />
              </div>
            </label>
          </div>

          <div v-else class="models-dialog__body">
            <p class="models-dialog__desc">确认删除模特“{{ dialogTarget.name || '未命名模特' }}”吗？这会删除角色库记录和素材目录，但不会删除历史项目产物。</p>
          </div>

          <div class="models-dialog__footer">
            <button type="button" class="models-secondary-button models-secondary-button--dialog" :disabled="dialogBusy" @click="closeDialog">取消</button>
            <button
              v-if="dialogMode === 'rename'"
              type="button"
              class="models-primary-button models-primary-button--dialog"
              :disabled="dialogBusy || !renameDraft.trim()"
              @click="renameModel(dialogTarget)"
            >
              <LoaderCircle v-if="dialogBusy" class="h-4 w-4 animate-spin" />
              <span>{{ dialogBusy ? '保存中' : '保存名称' }}</span>
            </button>
            <button v-else type="button" class="models-danger-button" :disabled="dialogBusy" @click="deleteModel(dialogTarget)">
              <LoaderCircle v-if="dialogBusy" class="h-4 w-4 animate-spin" />
              <span>{{ dialogBusy ? '删除中' : '确认删除' }}</span>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="message" class="models-toast">
        <span>{{ message }}</span>
        <button type="button" @click="closeMessage"><X class="h-4 w-4" /></button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.models-library-page {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  align-content: start;
  color: #f4f8ff;
}

.models-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 344px;
  gap: 18px;
  align-items: start;
  min-height: 0;
}

.models-shell__main,
.models-layout {
  display: grid;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.models-panel,
.models-hero {
  border: 1px solid rgba(81, 99, 146, 0.24);
  border-radius: 18px;
  background:
    radial-gradient(circle at 84% 10%, rgba(95, 74, 240, 0.12), transparent 26%),
    linear-gradient(180deg, rgba(12, 20, 36, 0.98), rgba(10, 18, 34, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 18px 42px rgba(2, 7, 18, 0.24);
}

.models-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px 16px;
}

.models-hero__copy h1 {
  margin: 0;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.12;
}

.models-hero__copy p {
  max-width: 700px;
  margin: 8px 0 0;
  color: #a8b6cb;
  font-size: 12px;
  line-height: 1.65;
}

.models-hero__actions {
  display: flex;
  gap: 12px;
}

.models-ghost-button,
.models-top-primary,
.models-primary-button,
.models-secondary-button,
.models-danger-button,
.models-link-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 800;
}

.models-ghost-button {
  height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(100, 118, 162, 0.3);
  background: rgba(18, 27, 48, 0.9);
  color: #eff5ff;
}

.models-top-primary,
.models-primary-button {
  height: 38px;
  padding: 0 18px;
  border: 1px solid rgba(157, 132, 255, 0.34);
  background: linear-gradient(135deg, #5e43f3, #7d4fff);
  color: #fff;
  box-shadow: 0 14px 28px rgba(94, 67, 243, 0.28);
}

.models-panel {
  padding: 18px;
}

.models-catalog-panel {
  padding: 0;
  overflow: visible;
}

.models-tabs {
  display: flex;
  gap: 2px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(75, 96, 139, 0.22);
}

.models-tab {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  border: 0;
  background: transparent;
  color: #b4c0d4;
  font-size: 14px;
  font-weight: 700;
}

.models-tab strong {
  color: #dfe7f5;
  font-weight: 700;
}

.models-tab.active {
  color: #a98cff;
  box-shadow: inset 0 -2px 0 #6c53ff;
}

.models-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 12px;
}

.models-toolbar__filters,
.models-toolbar__search,
.models-pagination__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.models-custom-select {
  position: relative;
}

.models-input,
.models-select,
.models-field textarea {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 1px solid rgba(81, 99, 146, 0.24);
  border-radius: 12px;
  background: rgba(10, 18, 33, 0.94);
  color: #eef4ff;
}

.models-select,
.models-input {
  height: 34px;
  padding: 0 12px;
}

.models-select {
  justify-content: space-between;
  min-width: 104px;
}

.models-select--compact {
  min-width: 118px;
}

.models-select--static {
  cursor: default;
}

.models-input--search {
  min-width: 210px;
  width: 210px;
}

.models-input input,
.models-field textarea {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #eef4ff;
  outline: none;
}

.models-input input::placeholder,
.models-field textarea::placeholder {
  color: #7587a2;
}

.models-field textarea {
  min-height: 92px;
  padding: 12px 14px;
  resize: none;
}

.models-select-trigger__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #edf4ff;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.models-select-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 30;
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(81, 99, 146, 0.3);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(16, 24, 41, 0.99), rgba(11, 18, 33, 0.99));
  box-shadow: 0 18px 48px rgba(2, 6, 14, 0.38);
}

.models-select-menu--compact {
  min-width: 116px;
}

.models-select-menu--align-right {
  left: auto;
}

.models-select-menu--scroll {
  max-height: 260px;
  overflow-y: auto;
}

.models-select-option {
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #dce6f3;
  font-size: 12px;
  text-align: left;
}

.models-select-option:hover {
  background: rgba(99, 78, 223, 0.16);
}

.models-select-option.active {
  background: linear-gradient(135deg, rgba(110, 87, 245, 0.92), rgba(139, 99, 255, 0.92));
  color: #fff;
}

.models-select-option--multiline {
  line-height: 1.5;
  white-space: normal;
}

.models-catalog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 14px;
}

.models-catalog-head__summary {
  color: #f4f8ff;
  font-size: 12px;
  font-weight: 700;
}

.models-catalog-head__summary span {
  margin: 0 8px;
  color: #6f80a0;
}

.models-view-switch {
  display: inline-flex;
  gap: 8px;
}

.models-view-switch button,
.models-pagination__nav button,
.models-library-card__more,
.models-detail-more,
.models-detail-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(81, 99, 146, 0.22);
  border-radius: 12px;
  background: rgba(16, 25, 44, 0.94);
  color: #dbe4f0;
}

.models-view-switch button {
  width: 34px;
  height: 34px;
}

.models-view-switch button.active,
.models-pagination__nav button.active {
  background: linear-gradient(135deg, rgba(94, 67, 243, 0.96), rgba(125, 79, 255, 0.96));
  border-color: rgba(157, 132, 255, 0.34);
  color: #fff;
}

.models-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  padding: 0 18px 18px;
}

.models-card-grid.is-list {
  grid-template-columns: 1fr;
}

.models-library-card {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  border: 1px solid rgba(81, 99, 146, 0.18);
  border-radius: 14px;
  background: rgba(12, 21, 38, 0.92);
  padding: 6px;
  text-align: left;
  min-width: 0;
  cursor: pointer;
}

.models-library-card.active {
  border-color: rgba(123, 95, 255, 0.82);
  box-shadow: inset 0 0 0 1px rgba(135, 111, 255, 0.16), 0 0 0 1px rgba(103, 77, 240, 0.16);
}

.models-library-card__media {
  position: relative;
  overflow: hidden;
  aspect-ratio: 0.8;
  border-radius: 12px;
  background: rgba(8, 16, 28, 0.92);
}

.models-library-card__media img,
.models-detail-card__media img,
.models-preview-strip__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.models-library-card__badge,
.models-library-card__favorite,
.models-library-card__play {
  position: absolute;
  z-index: 2;
}

.models-library-card__badge {
  top: 10px;
  left: 10px;
  padding: 4px 9px;
  border-radius: 8px;
  background: rgba(36, 48, 72, 0.84);
  font-size: 11px;
  font-weight: 800;
}

.models-library-card__favorite,
.models-library-card__play {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(14, 22, 40, 0.74);
  color: #fff;
  backdrop-filter: blur(10px);
}

.models-library-card__favorite {
  top: 10px;
  right: 10px;
}

.models-library-card__play {
  right: 12px;
  bottom: 12px;
}

.models-library-card__fallback {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: rgba(226, 235, 244, 0.38);
  font-size: 30px;
  font-weight: 800;
}

.models-library-card__body {
  display: grid;
  gap: 7px;
  padding: 2px 4px 4px;
}

.models-library-card__head,
.models-detail-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.models-library-card__title-row,
.models-detail-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.models-library-card__title-row h3,
.models-detail-card__title h3 {
  margin: 0;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.2;
}

.models-library-card__pro,
.models-detail-card__title span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 8px;
  background: rgba(101, 75, 231, 0.34);
  color: #d9ceff;
  font-size: 11px;
  font-weight: 700;
}

.models-library-card__meta,
.models-library-card__desc,
.models-detail-summary,
.models-detail-desc {
  margin: 0;
  color: #a8b6cb;
  font-size: 11px;
  line-height: 1.6;
}

.models-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.models-tag-row span,
.models-link-button {
  border: 1px solid rgba(91, 105, 154, 0.2);
  border-radius: 8px;
  background: rgba(21, 31, 51, 0.9);
  padding: 4px 7px;
  color: #dbe7f5;
  font-size: 11px;
  font-weight: 700;
}

.models-tag-row--compact span {
  font-size: 11px;
}

.models-link-button {
  background: rgba(24, 35, 56, 0.64);
}

.models-library-card__badge.is-done {
  background: rgba(34, 197, 94, 0.18);
  color: #aaf0c1;
}

.models-library-card__badge.is-generating {
  background: rgba(110, 87, 245, 0.18);
  color: #d8cdff;
}

.models-library-card__badge.is-failed {
  background: rgba(239, 68, 68, 0.18);
  color: #ffc6ca;
}

.models-library-card__badge.is-idle {
  background: rgba(59, 130, 246, 0.18);
  color: #bed4ff;
}

.models-action-menu {
  position: relative;
}

.models-library-card__more,
.models-detail-more,
.models-detail-close {
  width: 36px;
  height: 36px;
}

.models-action-menu__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 35;
  display: grid;
  min-width: 168px;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(81, 99, 146, 0.3);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(16, 24, 41, 0.99), rgba(11, 18, 33, 0.99));
  box-shadow: 0 18px 48px rgba(2, 6, 14, 0.4);
}

.models-action-menu__panel--detail {
  top: calc(100% + 10px);
}

.models-action-menu__panel button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #dce6f3;
  font-size: 12px;
  text-align: left;
}

.models-action-menu__panel button:hover {
  background: rgba(99, 78, 223, 0.16);
}

.models-action-menu__panel button.is-danger {
  color: #ffb8c1;
}

.models-empty-state {
  display: grid;
  place-items: center;
  min-height: 320px;
  margin: 0 18px 18px;
  border: 1px dashed rgba(108, 128, 158, 0.16);
  border-radius: 18px;
  color: #7d90a8;
}

.models-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 18px 18px;
}

.models-pagination__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.models-pagination__nav button {
  width: 32px;
  height: 32px;
  font-size: 12px;
  font-weight: 800;
}

.models-pagination__meta span {
  color: #8ea2bb;
  font-size: 12px;
}

.models-detail-panel {
  position: sticky;
  top: 0;
  display: grid;
  gap: 14px;
  padding: 14px 14px 16px;
}

.models-detail-card {
  border: 1px solid rgba(81, 99, 146, 0.22);
  border-radius: 16px;
  background: rgba(8, 16, 30, 0.76);
  padding: 14px;
}

.models-detail-card__top {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  gap: 12px;
}

.models-detail-card__media {
  overflow: hidden;
  width: 104px;
  height: 114px;
  border-radius: 12px;
  background: rgba(8, 16, 28, 0.92);
}

.models-detail-card__top-copy {
  min-width: 0;
}

.models-detail-card__online {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #d7e0ef;
  font-size: 12px;
}

.models-detail-card__online i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #22c55e;
}

.models-detail-cta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 40px;
  gap: 10px;
  margin-top: 12px;
}

.models-primary-button {
  width: 100%;
  height: 36px;
}

.models-primary-button--inline,
.models-secondary-button {
  width: 100%;
  height: 36px;
}

.models-secondary-button {
  border: 1px solid rgba(81, 99, 146, 0.22);
  background: rgba(21, 33, 50, 0.94);
  color: #dbe4f0;
}

.models-detail-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(81, 99, 146, 0.18);
}

.models-detail-tabs button {
  border: 0;
  background: transparent;
  color: #b2bfd3;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
}

.models-detail-tabs button.active {
  color: #a98cff;
  box-shadow: inset 0 -2px 0 #6c53ff;
}

.models-detail-section {
  padding: 0 4px;
}

.models-detail-section h4 {
  margin: 0 0 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}

.models-detail-time {
  display: grid;
  gap: 10px;
}

.models-detail-time div {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.models-detail-time span {
  color: #8397b0;
  font-size: 11px;
}

.models-detail-time strong {
  color: #f3f7ff;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
}

.models-detail-time strong.is-available {
  color: #86efac;
}

.models-preview-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.models-preview-strip__item {
  overflow: hidden;
  aspect-ratio: 0.86;
  border-radius: 8px;
  background: rgba(8, 16, 28, 0.92);
}

.models-field {
  display: grid;
  gap: 8px;
}

.models-field span,
.models-panel__subhead p,
.models-dialog__desc {
  color: #9caec3;
  font-size: 12px;
  line-height: 1.6;
}

.models-panel__subhead h3,
.models-dialog__head h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
}

.models-upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.models-upload-grid button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  border: 1px solid rgba(81, 99, 146, 0.22);
  border-radius: 12px;
  background: rgba(17, 29, 46, 0.88);
  color: #dbe4f0;
  font-size: 12px;
  font-weight: 700;
}

.models-create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 16px;
}

.models-create-column {
  display: grid;
  gap: 14px;
}

.models-create-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.models-stat-card {
  border: 1px solid rgba(81, 99, 146, 0.22);
  border-radius: 12px;
  background: rgba(20, 31, 48, 0.76);
  padding: 12px;
}

.models-stat-card span {
  display: block;
  color: #95a9c0;
  font-size: 12px;
}

.models-stat-card strong {
  display: block;
  margin-top: 8px;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
}

.models-hint {
  border: 1px solid rgba(245, 158, 11, 0.18);
  border-radius: 14px;
  background: rgba(76, 48, 10, 0.22);
  padding: 10px 12px;
  color: #f4cf92;
  font-size: 12px;
  line-height: 1.55;
}

.models-hint.is-error {
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(82, 20, 31, 0.24);
  color: #f4b6bb;
}

.models-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 320px;
  max-width: 520px;
  border: 1px solid rgba(157, 132, 255, 0.22);
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(13, 24, 40, 0.96);
  color: #eef4ff;
}

.models-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 15, 0.58);
  backdrop-filter: blur(10px);
}

.models-dialog {
  width: min(420px, calc(100vw - 32px));
  border: 1px solid rgba(81, 99, 146, 0.26);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(17, 28, 44, 0.99), rgba(11, 19, 33, 0.99));
  box-shadow: 0 24px 60px rgba(2, 6, 14, 0.42);
  padding: 18px;
}

.models-dialog--wide {
  width: min(860px, calc(100vw - 40px));
}

.models-dialog__head,
.models-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.models-dialog__close {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(81, 99, 146, 0.22);
  border-radius: 12px;
  background: rgba(21, 33, 50, 0.94);
  color: #dbe4f0;
}

.models-dialog__body {
  margin-top: 16px;
}

.models-dialog__footer {
  justify-content: flex-end;
  margin-top: 18px;
}

.models-secondary-button--dialog,
.models-primary-button--dialog,
.models-danger-button {
  min-width: 118px;
  height: 40px;
}

.models-danger-button {
  padding: 0 18px;
  border: 1px solid rgba(235, 98, 128, 0.26);
  background: linear-gradient(135deg, rgba(169, 36, 67, 0.94), rgba(208, 62, 92, 0.94));
  color: #fff6f8;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 1380px) {
  .models-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1240px) {
  .models-shell {
    grid-template-columns: 1fr;
  }

  .models-detail-panel {
    position: static;
  }

  .models-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .models-toolbar,
  .models-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .models-toolbar__filters,
  .models-toolbar__search,
  .models-pagination,
  .models-pagination__meta {
    flex-wrap: wrap;
  }
}

@media (max-width: 820px) {
  .models-card-grid,
  .models-create-grid,
  .models-detail-cta,
  .models-detail-tabs,
  .models-preview-strip,
  .models-detail-card__top {
    grid-template-columns: 1fr;
  }

  .models-input--search {
    min-width: 0;
  }
}
</style>
