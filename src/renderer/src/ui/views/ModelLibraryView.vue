<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Download,
  Grid2x2,
  HelpCircle,
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

type LibraryStatusFilter = 'done' | 'all' | 'generating' | 'failed'
type SortMode = 'latest' | 'name' | 'status'
type ViewMode = 'grid' | 'list'
type DropdownKey = 'status' | 'project' | 'productType' | 'sort' | 'pageSize' | null
type ModelActionMenuKey = string | null
type ModelDialogMode = 'rename' | 'delete' | null

const router = useRouter()
const busy = ref(false)
const message = ref('')
const library = ref<ModelIdentityLibraryItem[]>([])
const projects = ref<CloneProject[]>([])
const search = ref('')
const statusFilter = ref<LibraryStatusFilter>('done')
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
const imageProviderPrimary = ref<'openai' | 'kling' | 'grsai'>('openai')

const viewMode = ref<ViewMode>('grid')
const sortMode = ref<SortMode>('latest')
const page = ref(1)
const pageSize = ref(6)
const openDropdown = ref<DropdownKey>(null)
const openActionMenu = ref<ModelActionMenuKey>(null)
const dialogMode = ref<ModelDialogMode>(null)
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
      : Boolean(openaiKey.value.trim()),
)

const counts = computed(() => ({
  all: library.value.length,
  done: library.value.filter((item) => item.status === 'done').length,
  generating: library.value.filter((item) => item.status === 'generating').length,
  failed: library.value.filter((item) => item.status === 'failed').length,
}))

const statsCards = computed(() => [
  { label: '全部', value: counts.value.all },
  { label: '可用', value: counts.value.done },
  { label: '生成中', value: counts.value.generating },
  { label: '失败', value: counts.value.failed },
])

const projectOptions = computed(() =>
  projects.value.map((project) => ({
    id: project.id,
    label: project.referenceVideoName || project.referenceVideoPath || project.id,
  })),
)

const statusOptions = [
  { value: 'done' as const, label: '可用' },
  { value: 'all' as const, label: '全部' },
  { value: 'generating' as const, label: '生成中' },
  { value: 'failed' as const, label: '失败' },
]

const productTypeOptions = [
  { value: 'earrings' as const, label: '耳环' },
  { value: 'phone_case' as const, label: '手机壳' },
  { value: 'clothes' as const, label: '服饰' },
  { value: 'toy' as const, label: '玩具' },
  { value: 'general' as const, label: '通用' },
]

const sortOptions = [
  { value: 'latest' as const, label: '最新' },
  { value: 'name' as const, label: '名称' },
  { value: 'status' as const, label: '状态' },
]

const pageSizeOptions = [
  { value: 6, label: '每页 6 条' },
  { value: 8, label: '每页 8 条' },
  { value: 10, label: '每页 10 条' },
]

const statusFilterLabel = computed(() => statusOptions.find((item) => item.value === statusFilter.value)?.label ?? '可用')
const productTypeLabel = computed(() => productTypeOptions.find((item) => item.value === productType.value)?.label ?? '耳环')
const sortModeLabel = computed(() => sortOptions.find((item) => item.value === sortMode.value)?.label ?? '最新')
const pageSizeLabel = computed(() => pageSizeOptions.find((item) => item.value === pageSize.value)?.label ?? '每页 6 条')
const sourceProjectLabel = computed(() => projectOptions.value.find((item) => item.id === sourceProjectId.value)?.label ?? '选择来源项目')

const filteredLibrary = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return library.value.filter((item) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
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
  if (sortMode.value === 'name') {
    rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    return rows
  }
  if (sortMode.value === 'status') {
    const order: Record<string, number> = { done: 0, generating: 1, failed: 2, idle: 3 }
    rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
    return rows
  }
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
  const raw = String(v ?? '').trim().replace(/\/+$/, '')
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
  if (status === 'done') return '可用'
  if (status === 'generating') return '生成中'
  if (status === 'failed') return '失败'
  return '未完成'
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

function modelSummary(item: ModelIdentityLibraryItem) {
  return [item.market || 'Southeast Asian market', item.gender || 'female', item.ageRange || '20-28']
    .filter(Boolean)
    .join(' • ')
}

function modelDescriptionPreview(text?: string) {
  const content = String(text || '').replace(/\s+/g, ' ').trim()
  if (!content) return 'clean background with gentle greenery or neutral wall'
  return content.length > 110 ? `${content.slice(0, 110)}...` : content
}

function productTypeTag(type: ModelIdentityLibraryItem['productType']) {
  if (type === 'earrings') return 'earrings'
  if (type === 'phone_case') return 'phone_case'
  if (type === 'clothes') return 'clothes'
  if (type === 'toy') return 'toy'
  return 'general'
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
    message.value = '请先在左侧选择来源项目'
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
  qiniuAccessKey.value = String((c as any)?.qiniuAccessKey ?? '')
  qiniuSecretKey.value = String((c as any)?.qiniuSecretKey ?? '')
  qiniuBucket.value = String((c as any)?.qiniuBucket ?? '')
  qiniuDomain.value = String((c as any)?.qiniuDomain ?? '')
  qiniuUploadHost.value = String((c as any)?.qiniuUploadHost ?? 'https://upload.qiniup.com')
  qiniuPrefix.value = String((c as any)?.qiniuPrefix ?? 'videogenerate/clone')
  imageProviderPrimary.value =
    (c as any)?.imageProviderPrimary === 'kling' || (c as any)?.imageProviderPrimary === 'grsai'
      ? (c as any).imageProviderPrimary
      : 'openai'
}

async function saveCredentials() {
  await window.api.clone.setModelCredentials({
    openaiApiKey: openaiKey.value.trim() || undefined,
    openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
    openaiImageQuality: openaiImageQuality.value,
    imageProviderPrimary: imageProviderPrimary.value,
    klingApiKey: klingKey.value.trim() || undefined,
    klingHost: normalizeAtlasCloudHost(klingHost.value),
    klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
    grsaiApiKey: grsaiKey.value.trim() || undefined,
    grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
    grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
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
    message.value = '新模特已加入全局模特库'
  } catch (e: any) {
    message.value = `生成失败：${String(e?.message ?? e)}`
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    busy.value = false
  }
}

function goClone() {
  void router.push('/clone')
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
            <div class="models-hero__eyebrow">GLOBAL MODEL LIBRARY</div>
            <h1>AI 模特库</h1>
            <p>独立管理全局可复用模特资产。复刻项目只负责选择，不再在项目内维护角色库。</p>
          </div>
          <div class="models-hero__visual">
            <div class="models-hero__orb"></div>
            <div class="models-hero__ring"></div>
            <div class="models-hero__ring models-hero__ring--secondary"></div>
            <div class="models-hero__beam models-hero__beam--one"></div>
            <div class="models-hero__beam models-hero__beam--two"></div>
            <div class="models-hero__figure"></div>
            <button type="button" class="models-hero__action" @click="goClone">
              <span>前往复刻项目选择</span>
              <ArrowRight class="h-4 w-4" />
            </button>
          </div>
        </section>

        <section class="models-layout">
          <aside class="models-panel models-filter-panel">
            <div class="models-panel__head">
              <h2>筛选与资源</h2>
              <p>生成新模特时，需要一个复刻项目作为产品上下文来源。</p>
            </div>

            <label class="models-field">
              <span>搜索关键词</span>
              <div class="models-input">
                <Search class="h-4 w-4" />
                <input v-model="search" type="text" placeholder="搜索名称、描述、市场、风格" />
              </div>
            </label>

            <label class="models-field">
              <span>状态筛选</span>
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
            </label>

            <div class="models-stats-grid">
              <div v-for="item in statsCards" :key="item.label" class="models-stat-card">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>

            <div class="models-divider"></div>

            <div class="models-panel__subhead">
              <h3>生成新模特</h3>
              <p>来源复刻项目</p>
            </div>

            <label class="models-field">
              <div class="models-custom-select" :class="{ 'is-open': openDropdown === 'project' }">
                <button type="button" class="models-select models-select-trigger" @click.stop="toggleDropdown('project')">
                  <span class="models-select-trigger__label models-select-trigger__label--truncate">{{ sourceProjectLabel }}</span>
                  <ChevronDown class="h-4 w-4" />
                </button>
                <div v-if="openDropdown === 'project'" class="models-select-menu models-select-menu--scroll">
                  <button
                    type="button"
                    class="models-select-option"
                    :class="{ active: sourceProjectId === '' }"
                    @click="sourceProjectId = ''; closeDropdown()"
                  >
                    选择来源项目
                  </button>
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
              <span>产品卖点（可选）</span>
              <textarea v-model="productPoints" placeholder="例如：轻盈、通勤、礼盒包装、细节质感"></textarea>
            </label>

            <div class="models-upload-grid">
              <button type="button" @click="pickImageGroup('main')"><ImagePlus class="h-4 w-4" />主图</button>
              <button type="button" @click="pickImageGroup('detail')"><ImagePlus class="h-4 w-4" />细节图</button>
              <button type="button" @click="pickImageGroup('usage')"><ImagePlus class="h-4 w-4" />佩戴图</button>
              <button type="button" @click="pickImageGroup('style')"><ImagePlus class="h-4 w-4" />风格图</button>
            </div>

            <div v-if="productDiagnosis" class="models-hint">{{ productDiagnosis }}</div>

            <button class="models-primary-button" type="button" :disabled="busy || !sourceProjectId || !hasProductInput || !imageProviderReady" @click="generateModel">
              <LoaderCircle v-if="busy" class="h-4 w-4 animate-spin" />
              <Wand2 v-else class="h-4 w-4" />
              <span>{{ busy ? '正在生成模特' : '生成新模特' }}</span>
            </button>
          </aside>

          <main class="models-panel models-catalog-panel">
            <div class="models-catalog-head">
              <div>
                <h2>模特卡片库</h2>
                <p>默认展示可用角色，失败项可通过状态筛选查看。</p>
              </div>
              <div class="models-catalog-tools">
                <span class="models-catalog-tools__count">共 {{ counts.all }} 个模特</span>
                <div class="models-custom-select models-custom-select--compact" :class="{ 'is-open': openDropdown === 'sort' }">
                  <button type="button" class="models-select models-select--compact models-select-trigger" @click.stop="toggleDropdown('sort')">
                    <span class="models-select-trigger__label">{{ sortModeLabel }}</span>
                    <ChevronDown class="h-4 w-4" />
                  </button>
                  <div v-if="openDropdown === 'sort'" class="models-select-menu models-select-menu--compact">
                    <button
                      v-for="option in sortOptions"
                      :key="option.value"
                      type="button"
                      class="models-select-option"
                      :class="{ active: sortMode === option.value }"
                      @click="sortMode = option.value; closeDropdown()"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <div class="models-view-switch">
                  <button type="button" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'"><Grid2x2 class="h-4 w-4" /></button>
                  <button type="button" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'"><LayoutList class="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            <div v-if="pagedLibrary.length" class="models-card-grid" :class="{ 'is-list': viewMode === 'list' }">
              <button
                v-for="(item, index) in pagedLibrary"
                :key="item.id"
                type="button"
                class="models-library-card"
                :class="{ active: selectedId === item.id }"
                @click="selectedId = item.id"
              >
                <div v-if="selectedId === item.id" class="models-library-card__check">
                  <Check class="h-3.5 w-3.5" />
                </div>

                <div class="models-library-card__media">
                  <img v-if="item.coverImagePath || item.imagePaths?.[0]" :src="mediaUrl(item.coverImagePath || item.imagePaths?.[0])" :alt="item.name" />
                  <div v-else class="models-library-card__fallback">AI</div>
                </div>

                <div class="models-library-card__body">
                  <div class="models-library-card__head">
                    <div class="models-library-card__title-wrap">
                      <h3>{{ modelTitle(item, index) }}</h3>
                      <p class="models-library-card__meta">{{ modelSummary(item) }}</p>
                    </div>
                    <div class="models-library-card__head-actions">
                      <span class="models-status-chip" :class="modelStatusTone(item.status)">{{ modelStatusText(item.status) }}</span>
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
                  </div>

                  <p class="models-library-card__desc">{{ modelDescriptionPreview(item.description) }}</p>

                  <div class="models-tag-row">
                    <span>{{ productTypeTag(item.productType) }}</span>
                    <span>{{ item.gender || 'female' }}</span>
                    <span>{{ item.ageRange || '20-28' }}</span>
                  </div>
                </div>
              </button>
            </div>
            <div v-else class="models-empty-state">当前筛选条件下没有模特</div>

            <div class="models-pagination">
              <div class="models-pagination__nav">
                <button type="button" :disabled="page <= 1" @click="prevPage"><ArrowLeft class="h-4 w-4" /></button>
                <button v-for="n in pages" :key="n" type="button" :class="{ active: page === n }" @click="setPage(n)">{{ n }}</button>
                <button type="button" :disabled="page >= totalPages" @click="nextPage"><ArrowRight class="h-4 w-4" /></button>
              </div>
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
          </main>
        </section>
      </div>

      <aside v-if="selectedModel" class="models-panel models-detail-panel">
        <div class="models-detail-head">
          <div>
            <h2>模特详情</h2>
            <p>查看封面、标签和状态，完整管理都在这里完成。</p>
          </div>
          <span class="models-status-chip" :class="modelStatusTone(selectedModel.status)">{{ modelStatusText(selectedModel.status) }}</span>
        </div>

        <div class="models-detail-image">
          <img v-if="selectedModel.coverImagePath || selectedModel.imagePaths?.[0]" :src="mediaUrl(selectedModel.coverImagePath || selectedModel.imagePaths?.[0])" :alt="selectedModel.name" />
        </div>

        <div class="models-detail-actions">
          <button type="button" title="复制模特名称" @click="copyText(selectedModel.name || 'AI模特', '模特名称已复制')"><Star class="h-4 w-4" /></button>
          <button type="button" title="打开封面图" @click="openModelImage(selectedModel)"><Download class="h-4 w-4" /></button>
          <div class="models-action-menu">
            <button type="button" title="更多操作" @click.stop="toggleActionMenu(`detail:${selectedModel.id}`)"><MoreHorizontal class="h-4 w-4" /></button>
            <div v-if="openActionMenu === `detail:${selectedModel.id}`" class="models-action-menu__panel models-action-menu__panel--detail">
              <button type="button" @click="assignModelToProject(selectedModel)">设为当前项目模特</button>
              <button type="button" @click="openRenameDialog(selectedModel)">重命名</button>
              <button type="button" @click="revealModelImage(selectedModel)">定位封面文件</button>
              <button type="button" class="is-danger" @click="openDeleteDialog(selectedModel)">删除模特</button>
            </div>
          </div>
        </div>

        <div class="models-detail-title">
          <h3>{{ selectedModel.name }}</h3>
        </div>

        <p class="models-detail-summary">{{ modelSummary(selectedModel) }} • {{ selectedModel.sceneStyle || 'soft daylight' }}</p>
        <p class="models-detail-desc">{{ modelDescriptionPreview(selectedModel.description) }}</p>

        <div class="models-tag-row">
          <span>{{ productTypeTag(selectedModel.productType) }}</span>
          <span>{{ selectedModel.gender || 'female' }}</span>
          <span>{{ selectedModel.ageRange || '20-28' }}</span>
        </div>

        <div class="models-detail-time">
          <div>
            <span>创建时间</span>
            <strong>{{ formatDate(selectedModel.createdAt) }}</strong>
          </div>
          <div>
            <span>更新时间</span>
            <strong>{{ formatDate(selectedModel.updatedAt) }}</strong>
          </div>
        </div>

        <div v-if="selectedModel.error" class="models-hint is-error">{{ selectedModel.error }}</div>

        <div class="models-detail-footer">
          <button type="button" class="models-primary-button models-primary-button--inline" @click="openCloneWithModel(selectedModel)">查看详情</button>
          <button type="button" class="models-secondary-button" @click.stop="toggleActionMenu(`footer:${selectedModel.id}`)">
            <span>更多操作</span>
            <ChevronDown class="h-4 w-4" />
          </button>
          <div v-if="openActionMenu === `footer:${selectedModel.id}`" class="models-action-menu__panel models-action-menu__panel--footer">
            <button type="button" @click="assignModelToProject(selectedModel)">设为当前项目模特</button>
            <button type="button" @click="openModelImage(selectedModel)">打开封面图</button>
            <button type="button" @click="revealModelImage(selectedModel)">定位封面文件</button>
            <button type="button" @click="openRenameDialog(selectedModel)">重命名</button>
            <button type="button" class="is-danger" @click="openDeleteDialog(selectedModel)">删除模特</button>
          </div>
        </div>
      </aside>
    </section>

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
            <p class="models-dialog__desc">
              确认删除模特“{{ dialogTarget.name || '未命名模特' }}”吗？这会删除角色库记录和素材目录，但不会删除历史项目产物。
            </p>
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
            <button
              v-else
              type="button"
              class="models-danger-button"
              :disabled="dialogBusy"
              @click="deleteModel(dialogTarget)"
            >
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
  gap: 14px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  align-content: start;
  color: #f4f8ff;
}

.models-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 346px;
  gap: 12px;
  align-items: start;
  min-height: 0;
}

.models-shell__main {
  display: grid;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.models-hero,
.models-panel {
  border: 1px solid rgba(108, 128, 158, 0.14);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(17, 28, 44, 0.98), rgba(11, 19, 33, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025), 0 14px 40px rgba(0, 0, 0, 0.18);
}

.models-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  align-items: center;
  min-height: 142px;
  padding: 18px 28px 18px 30px;
  background:
    radial-gradient(circle at 76% 46%, rgba(116, 88, 255, 0.15), transparent 22%),
    linear-gradient(180deg, rgba(17, 28, 44, 0.98), rgba(11, 19, 33, 0.98));
}

.models-hero__eyebrow {
  color: #9e8cff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.models-hero h1 {
  margin-top: 6px;
  font-size: 31px;
  font-weight: 800;
  color: #ffffff;
}

.models-hero p {
  max-width: 660px;
  margin-top: 9px;
  color: #9aa9bb;
  font-size: 13px;
  line-height: 1.62;
}

.models-hero__visual {
  position: relative;
  min-height: 106px;
  overflow: hidden;
}

.models-hero__orb {
  position: absolute;
  inset: 2px 54px 4px 74px;
  border-radius: 999px;
  background:
    radial-gradient(circle at 45% 42%, rgba(150, 126, 255, 0.34), transparent 26%),
    radial-gradient(circle at center, rgba(113, 83, 255, 0.28), transparent 62%);
  filter: blur(20px);
}

.models-hero__ring {
  position: absolute;
  top: 14px;
  left: 104px;
  width: 184px;
  height: 62px;
  border: 1px solid rgba(139, 111, 255, 0.34);
  border-radius: 999px;
  transform: rotate(8deg);
  box-shadow: 0 0 24px rgba(109, 90, 247, 0.1);
}

.models-hero__ring--secondary {
  top: 10px;
  left: 88px;
  width: 206px;
  height: 70px;
  opacity: 0.4;
  transform: rotate(-7deg);
}

.models-hero__beam {
  position: absolute;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(161, 136, 255, 0.84), transparent);
  box-shadow: 0 0 20px rgba(126, 99, 255, 0.24);
}

.models-hero__beam--one {
  top: 36px;
  left: 116px;
  width: 156px;
  transform: rotate(14deg);
}

.models-hero__beam--two {
  top: 49px;
  left: 124px;
  width: 142px;
  transform: rotate(-24deg);
  opacity: 0.72;
}

.models-hero__figure {
  position: absolute;
  top: -10px;
  left: 156px;
  width: 84px;
  height: 114px;
  border-radius: 999px 999px 30px 30px;
  background:
    radial-gradient(circle at 48% 18%, rgba(230, 236, 255, 0.86), transparent 14%),
    radial-gradient(circle at 50% 48%, rgba(171, 148, 255, 0.24), transparent 42%),
    linear-gradient(180deg, rgba(168, 145, 255, 0.98) 0%, rgba(84, 56, 208, 0.98) 100%);
  box-shadow: 0 0 58px rgba(110, 87, 245, 0.4);
}

.models-hero__figure::before,
.models-hero__figure::after {
  content: '';
  position: absolute;
  background: linear-gradient(180deg, rgba(175, 157, 255, 0.8), rgba(88, 58, 212, 0.76));
}

.models-hero__figure::before {
  top: 9px;
  left: 31px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
}

.models-hero__figure::after {
  top: 32px;
  left: 12px;
  width: 58px;
  height: 52px;
  border-radius: 28px 28px 18px 18px;
  clip-path: polygon(0 14%, 100% 14%, 84% 100%, 16% 100%);
}

.models-hero__action {
  position: absolute;
  right: 8px;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px 0 18px;
  border: 1px solid rgba(112, 125, 164, 0.16);
  border-radius: 13px;
  background: linear-gradient(180deg, rgba(38, 48, 70, 0.94), rgba(26, 36, 58, 0.94));
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.models-layout {
  display: grid;
  grid-template-columns: 276px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  min-height: 0;
}

.models-panel {
  padding: 16px;
}

.models-filter-panel {
  padding: 14px 14px 14px;
}

.models-catalog-panel {
  padding: 14px 14px 12px;
  min-height: 0;
  overflow: visible;
}

.models-detail-panel {
  padding: 14px 14px 16px;
  position: sticky;
  top: 0;
}

.models-detail-head {
  align-items: flex-start;
}

.models-detail-head .models-status-chip {
  margin-top: 2px;
}

.models-panel__head h2,
.models-panel__subhead h3,
.models-catalog-head h2,
.models-detail-head h2 {
  color: #ffffff;
  font-size: 17px;
  font-weight: 800;
}

.models-detail-head h2 {
  font-size: 16px;
  line-height: 1.1;
}

.models-panel__head p,
.models-panel__subhead p,
.models-catalog-head p,
.models-detail-head p {
  margin-top: 6px;
  color: #7f93aa;
  font-size: 11px;
  line-height: 1.55;
}

.models-detail-head p {
  max-width: 220px;
  font-size: 10px;
  line-height: 1.5;
}

.models-field {
  display: grid;
  gap: 6px;
  margin-top: 9px;
}

.models-field span {
  color: #9caec3;
  font-size: 12px;
  font-weight: 700;
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
  border: 1px solid rgba(108, 128, 158, 0.12);
  border-radius: 14px;
  background: rgba(12, 21, 35, 0.92);
  color: #eef4ff;
}

.models-input,
.models-select {
  height: 38px;
  padding: 0 12px;
}

.models-input {
  overflow: hidden;
}

.models-input svg {
  flex: 0 0 auto;
  color: #a6b5c8;
}

.models-select {
  justify-content: space-between;
}

.models-select-trigger {
  cursor: pointer;
}

.models-select-trigger svg {
  flex: 0 0 auto;
  color: #d8e1ed;
}

.models-select-trigger__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #edf4ff;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.models-select-trigger__label--truncate {
  max-width: 100%;
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
  border: 1px solid rgba(108, 128, 158, 0.16);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(17, 28, 44, 0.99), rgba(11, 19, 33, 0.99));
  box-shadow: 0 18px 48px rgba(2, 6, 14, 0.38);
}

.models-select-menu--compact {
  min-width: 116px;
}

.models-select-menu--align-right {
  left: auto;
  min-width: 132px;
}

.models-select-menu--scroll {
  max-height: 260px;
  overflow-y: auto;
}

.models-select-option {
  width: 100%;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #dce6f3;
  font-size: 12px;
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
}

.models-select-option:hover {
  background: rgba(99, 78, 223, 0.16);
}

.models-select-option.active {
  background: linear-gradient(135deg, rgba(110, 87, 245, 0.92), rgba(139, 99, 255, 0.92));
  color: #ffffff;
}

.models-select-option--multiline {
  min-height: 42px;
  line-height: 1.4;
  white-space: normal;
}

.models-input input,
.models-select select,
.models-field textarea {
  width: 100%;
  background: transparent;
  outline: none;
}

.models-input input {
  min-width: 0;
  flex: 1;
}

.models-field textarea {
  min-height: 74px;
  padding: 10px 12px;
  resize: none;
  font-size: 12px;
  line-height: 1.5;
}

.models-select--compact {
  min-width: 104px;
  height: 34px;
}

.models-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 12px;
}

.models-stat-card {
  border: 1px solid rgba(108, 128, 158, 0.12);
  border-radius: 12px;
  background: rgba(20, 31, 48, 0.76);
  padding: 10px 11px;
}

.models-stat-card span {
  display: block;
  color: #95a9c0;
  font-size: 12px;
}

.models-stat-card strong {
  display: block;
  margin-top: 7px;
  color: #ffffff;
  font-size: 17px;
  font-weight: 800;
}

.models-divider {
  height: 1px;
  margin: 10px 0 0;
  background: rgba(108, 128, 158, 0.12);
}

.models-upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.models-upload-grid button,
.models-view-switch button,
.models-pagination__nav button,
.models-detail-actions > button,
.models-detail-actions > .models-action-menu > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(108, 128, 158, 0.12);
  border-radius: 12px;
  background: rgba(17, 29, 46, 0.88);
  color: #dbe4f0;
}

.models-upload-grid button {
  height: 32px;
  font-size: 12px;
  font-weight: 700;
}

.models-hint {
  margin-top: 12px;
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

.models-primary-button,
.models-secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 800;
}

.models-primary-button {
  width: 100%;
  height: 42px;
  margin-top: 10px;
  border: 1px solid rgba(157, 132, 255, 0.28);
  background: linear-gradient(135deg, #6e57f5, #8b63ff);
  color: #ffffff;
  box-shadow: 0 12px 28px rgba(89, 64, 216, 0.26);
}

.models-primary-button--inline {
  width: auto;
  min-width: 168px;
  margin-top: 0;
}

.models-secondary-button {
  height: 46px;
  min-width: 142px;
  padding: 0 18px;
  border: 1px solid rgba(108, 128, 158, 0.12);
  background: rgba(21, 33, 50, 0.94);
  color: #dbe4f0;
}

.models-secondary-button--dialog,
.models-primary-button--dialog,
.models-danger-button {
  min-width: 118px;
  height: 40px;
  margin-top: 0;
  border-radius: 12px;
}

.models-danger-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 18px;
  border: 1px solid rgba(235, 98, 128, 0.26);
  background: linear-gradient(135deg, rgba(169, 36, 67, 0.94), rgba(208, 62, 92, 0.94));
  color: #fff6f8;
  font-size: 13px;
  font-weight: 800;
}

.models-catalog-head,
.models-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.models-catalog-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8ea0b7;
  font-size: 11px;
  font-weight: 600;
}

.models-catalog-tools__count {
  max-width: 74px;
  color: #9cade0;
  font-size: 11px;
  line-height: 1.25;
  white-space: normal;
  text-align: right;
}

.models-view-switch {
  display: inline-flex;
  gap: 6px;
}

.models-view-switch button {
  width: 34px;
  height: 34px;
}

.models-view-switch button.active,
.models-pagination__nav button.active {
  border-color: rgba(157, 132, 255, 0.34);
  background: linear-gradient(135deg, rgba(110, 87, 245, 0.96), rgba(139, 99, 255, 0.96));
  color: #ffffff;
}

.models-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.models-card-grid.is-list {
  grid-template-columns: 1fr;
}

.models-library-card {
  position: relative;
  display: grid;
  grid-template-columns: 102px minmax(0, 1fr);
  gap: 12px;
  min-height: 170px;
  border: 1px solid rgba(108, 128, 158, 0.12);
  border-radius: 15px;
  background: rgba(16, 28, 44, 0.82);
  padding: 10px;
  text-align: left;
}

.models-library-card.active {
  border-color: rgba(138, 104, 255, 0.5);
  background:
    radial-gradient(circle at right top, rgba(110, 87, 245, 0.22), transparent 28%),
    linear-gradient(135deg, rgba(98, 72, 222, 0.28), rgba(16, 28, 44, 0.94));
  box-shadow:
    inset 0 0 0 1px rgba(161, 138, 255, 0.18),
    0 0 0 1px rgba(103, 77, 240, 0.16),
    0 10px 24px rgba(67, 45, 162, 0.16);
}

.models-library-card__check {
  position: absolute;
  top: 0;
  left: 0;
  width: 28px;
  height: 28px;
  border-top-left-radius: 16px;
  border-bottom-right-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #6f58f6, #8e63ff);
  color: #fff;
}

.models-library-card__media {
  overflow: hidden;
  width: 102px;
  height: 140px;
  border-radius: 11px;
  background: rgba(8, 16, 28, 0.92);
}

.models-library-card__media img,
.models-detail-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.models-library-card__fallback {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  font-size: 30px;
  font-weight: 800;
  color: rgba(226, 235, 244, 0.38);
}

.models-library-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.models-library-card__title-wrap {
  display: grid;
  gap: 4px;
}

.models-library-card__title-wrap h3,
.models-detail-title h3 {
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.15;
}

.models-library-card__head-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
}

.models-action-menu {
  position: relative;
  flex: 0 0 auto;
}

.models-library-card__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(108, 128, 158, 0.12);
  background: rgba(38, 50, 72, 0.98);
  color: #d2deea;
  flex: 0 0 auto;
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
  border: 1px solid rgba(108, 128, 158, 0.16);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(17, 28, 44, 0.99), rgba(11, 19, 33, 0.99));
  box-shadow: 0 18px 48px rgba(2, 6, 14, 0.4);
}

.models-action-menu__panel--detail {
  top: calc(100% + 10px);
  right: 0;
}

.models-action-menu__panel--footer {
  bottom: calc(100% + 8px);
  right: 0;
  top: auto;
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

.models-action-menu__panel button.is-danger:hover {
  background: rgba(152, 34, 58, 0.22);
}

.models-library-card__meta {
  color: #c5d1df;
  font-size: 10px;
  line-height: 1.28;
  opacity: 0.88;
}

.models-library-card__desc,
.models-detail-desc {
  margin-top: 6px;
  color: #9eb1c4;
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.models-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.models-tag-row span {
  border: 1px solid rgba(108, 128, 158, 0.12);
  border-radius: 999px;
  background: rgba(23, 36, 55, 0.88);
  padding: 3px 8px;
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 700;
}

.models-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 9px;
  font-weight: 800;
}

.models-status-chip.is-done {
  background: rgba(34, 197, 94, 0.18);
  color: #aaf0c1;
}

.models-status-chip.is-generating {
  background: rgba(110, 87, 245, 0.18);
  color: #d8cdff;
}

.models-status-chip.is-failed {
  background: rgba(239, 68, 68, 0.18);
  color: #ffc6ca;
}

.models-status-chip.is-idle {
  background: rgba(59, 130, 246, 0.18);
  color: #bed4ff;
}

.models-empty-state {
  display: grid;
  place-items: center;
  min-height: 420px;
  margin-top: 14px;
  border: 1px dashed rgba(108, 128, 158, 0.16);
  border-radius: 18px;
  color: #7d90a8;
}

.models-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.models-pagination__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.models-pagination__nav button {
  width: 38px;
  height: 38px;
  font-size: 13px;
  font-weight: 800;
}

.models-detail-image {
  overflow: hidden;
  margin-top: 10px;
  border-radius: 14px;
  aspect-ratio: 1 / 1.14;
  background: rgba(8, 16, 28, 0.92);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 10px 30px rgba(3, 8, 15, 0.18);
}

.models-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: -42px;
  padding-right: 12px;
  position: relative;
  z-index: 2;
}

.models-detail-actions > button,
.models-detail-actions > .models-action-menu > button {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(33, 41, 58, 0.94);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 18px rgba(3, 8, 15, 0.28);
}

.models-detail-title {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  margin-top: 18px;
  padding-top: 6px;
  border-top: 1px solid rgba(108, 128, 158, 0.1);
}

.models-detail-summary {
  margin-top: 6px;
  color: #bcc9d7;
  font-size: 11px;
  line-height: 1.55;
  opacity: 0.92;
}

.models-detail-desc {
  -webkit-line-clamp: 4;
}

.models-detail-time {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  padding-top: 15px;
  border-top: 1px solid rgba(108, 128, 158, 0.12);
}

.models-detail-time div {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.models-detail-time span {
  color: #8397b0;
  font-size: 10px;
}

.models-detail-time strong {
  color: #f3f7ff;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
}

.models-detail-footer {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  position: relative;
}

.models-detail-footer .models-primary-button--inline {
  min-width: 136px;
  height: 40px;
  border-radius: 12px;
}

.models-detail-footer .models-secondary-button {
  flex: 0 0 132px;
  min-width: 132px;
  height: 40px;
  border-radius: 12px;
  padding: 0 16px;
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
  background: rgba(3, 8, 15, 0.54);
  backdrop-filter: blur(10px);
}

.models-dialog {
  width: min(420px, calc(100vw - 32px));
  border: 1px solid rgba(108, 128, 158, 0.16);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(17, 28, 44, 0.99), rgba(11, 19, 33, 0.99));
  box-shadow: 0 24px 60px rgba(2, 6, 14, 0.42);
  padding: 18px;
}

.models-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.models-dialog__head h3 {
  color: #ffffff;
  font-size: 18px;
  font-weight: 800;
}

.models-dialog__close {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(108, 128, 158, 0.12);
  border-radius: 12px;
  background: rgba(21, 33, 50, 0.94);
  color: #dbe4f0;
}

.models-dialog__body {
  margin-top: 16px;
}

.models-dialog__desc {
  color: #9fb1c7;
  font-size: 12px;
  line-height: 1.6;
}

.models-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
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

@media (max-width: 1400px) {
  .models-shell {
    grid-template-columns: minmax(0, 1fr) 320px;
  }

  .models-layout {
    grid-template-columns: 260px minmax(0, 1fr);
  }
}

@media (max-width: 1240px) {
  .models-hero {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .models-shell,
  .models-layout {
    grid-template-columns: 1fr;
  }

  .models-detail-panel {
    position: static;
  }

  .models-card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
