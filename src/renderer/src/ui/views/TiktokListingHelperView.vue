<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Download,
  Eye,
  Grid2X2,
  ImagePlus,
  List,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import RuntimeLogDialog from '../components/RuntimeLogDialog.vue'

type Category = 'earring' | 'ring' | 'necklace' | 'phone_case' | 'bracelet'
type Language = 'zh-CN' | 'en-US' | 'vi-VN'
type GenerationStatus = 'idle' | 'generating' | 'done' | 'failed'
type WorkspaceTab = 'list' | 'editor'

type ListingImage = { id: string; filePath: string; publicUrl?: string }
type Item = {
  id: string
  sourceImagePath: string
  referenceImagePaths: string[]
  category: Category
  sku: string
  localDisplayPrice: string
  titleLanguage: Language
  generatedTitle?: string
  generatedDescription?: string
  analysisBoardImage?: ListingImage
  listingImages: ListingImage[]
  generationStatus: GenerationStatus
  generationError?: string
  generatedAt?: number
  createdAt: number
  updatedAt: number
}

type RuntimeLogItem = { id: string; level: 'info' | 'success' | 'error'; message: string; time: number }

type ExportCategoryConfig = {
  category: Category
  categoryId: string
  productAttributes: string
}

const router = useRouter()

const categoryOptions: Array<{ value: Category; label: string }> = [
  { value: 'earring', label: '耳环 (Earring)' },
  { value: 'ring', label: '戒指 (Ring)' },
  { value: 'necklace', label: '项链 (Necklace)' },
  { value: 'phone_case', label: '手机壳 (Phone Case)' },
  { value: 'bracelet', label: '手链 (Bracelet)' },
]

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: 'zh-CN', label: '简体中文 (zh-CN)' },
  { value: 'en-US', label: 'English (en-US)' },
  { value: 'vi-VN', label: 'Tiếng Việt (vi-VN)' },
]

const loading = ref(false)
const saving = ref(false)
const generating = ref(false)
const exporting = ref(false)
const exportConfigSaving = ref(false)
const items = ref<Item[]>([])
const selectedIds = ref<string[]>([])
const notice = ref('')
const errorText = ref('')
const activeTab = ref<WorkspaceTab>('list')
const searchKeyword = ref('')
const categoryFilter = ref<'all' | Category>('all')
const statusFilter = ref<'all' | GenerationStatus>('all')
const languageFilter = ref<'all' | Language>('all')
const listViewMode = ref<'table' | 'grid'>('table')
const currentPage = ref(1)
const pageSize = ref(10)
const runtimeLogs = ref<RuntimeLogItem[]>([])
const runtimeDialogOpen = ref(false)
const exportConfigDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const deleteBusy = ref(false)
const deleteTarget = ref<Item | null>(null)
const exportCategoryConfigs = ref<ExportCategoryConfig[]>(defaultExportCategoryConfigs())
let offRuntimeLog: (() => void) | undefined

const form = reactive({
  id: '',
  sourceImagePath: '',
  referenceImagePaths: [] as string[],
  category: 'earring' as Category,
  sku: '',
  localDisplayPrice: '',
  titleLanguage: 'zh-CN' as Language,
})

function defaultExportCategoryConfigs(): ExportCategoryConfig[] {
  return categoryOptions.map((item) => ({
    category: item.value,
    categoryId: '',
    productAttributes: '',
  }))
}

const selectedCount = computed(() => selectedIds.value.length)

function toFileUrl(filePath: string) {
  return `vg://file?path=${encodeURIComponent(filePath)}`
}

function categoryLabel(value: Category) {
  return categoryOptions.find((item) => item.value === value)?.label || value
}

function languageLabel(value: Language) {
  return languageOptions.find((item) => item.value === value)?.label || value
}

function statusLabel(value: GenerationStatus) {
  if (value === 'done') return '已完成'
  if (value === 'generating') return '生成中'
  if (value === 'failed') return '失败'
  return '草稿'
}

function statusTone(value: GenerationStatus) {
  if (value === 'done') return 'status--done'
  if (value === 'generating') return 'status--generating'
  if (value === 'failed') return 'status--failed'
  return 'status--idle'
}

function imageCount(item: Partial<Item> | null | undefined) {
  return Array.isArray(item?.listingImages) ? item!.listingImages.length : 0
}

function referenceImageCount(item: Partial<Item> | null | undefined) {
  const refs = Array.isArray(item?.referenceImagePaths) ? item!.referenceImagePaths : []
  if (refs.length) return refs.length
  return String(item?.sourceImagePath || '').trim() ? 1 : 0
}

function resolveReferenceImages(item: Partial<Item> | null | undefined) {
  const source = String(item?.sourceImagePath || '').trim()
  const refs = Array.isArray(item?.referenceImagePaths) ? item!.referenceImagePaths : []
  return Array.from(new Set([source, ...refs].map((entry) => String(entry || '').trim()).filter(Boolean)))
}

function extraReferenceImages(item: Partial<Item> | null | undefined) {
  const source = String(item?.sourceImagePath || '').trim()
  return resolveReferenceImages(item).filter((entry) => entry !== source)
}

function analysisBoardStatus(item?: Partial<Item> | null) {
  if (String(item?.generationStatus || '') === 'generating') return '生成中'
  if (String(item?.analysisBoardImage?.filePath || '').trim()) return '已生成'
  if (String(item?.generationStatus || '') === 'failed') return '失败'
  return '未生成'
}

function previewTitle(item?: Partial<Item> | null) {
  return String(item?.generatedTitle || '').trim() || '尚未生成标题'
}

function previewDescription(item?: Partial<Item> | null) {
  return String(item?.generatedDescription || '').trim() || '尚未生成图片描述 HTML，先保存商品后再生成。'
}

function generationErrorText(item?: Partial<Item> | null) {
  return String(item?.generationError || '').trim()
}

function formatPrice(item: Partial<Item>) {
  return String(item.localDisplayPrice || '').trim() || '0.00'
}

function formatDate(value?: number) {
  if (!value) return '--'
  const date = new Date(value)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const ii = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${ii}`
}

function safeText(value: unknown, fallback = '') {
  const text = String(value ?? '').replace(/\uFFFD/g, '').trim()
  return text || fallback
}

function isTiktokListingRuntimeMessage(message: string) {
  return String(message || '').toLowerCase().includes('tiktok-listing')
}

function pushRuntimeLog(message: string, level: RuntimeLogItem['level'] = 'info') {
  const text = safeText(message, '')
  if (!text) return
  const last = runtimeLogs.value[0]
  if (last?.message === text && last.level === level) return
  runtimeLogs.value = [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, level, message: text, time: Date.now() }, ...runtimeLogs.value].slice(0, 60)
}

const stats = computed(() => {
  const all = items.value.length
  const done = items.value.filter((item) => item.generationStatus === 'done').length
  const generatingCount = items.value.filter((item) => item.generationStatus === 'generating').length
  const failed = items.value.filter((item) => item.generationStatus === 'failed').length
  const draft = items.value.filter((item) => item.generationStatus === 'idle').length
  return { all, done, generating: generatingCount, failed, draft }
})

const filteredItems = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return items.value.filter((item) => {
    if (categoryFilter.value !== 'all' && item.category !== categoryFilter.value) return false
    if (statusFilter.value !== 'all' && item.generationStatus !== statusFilter.value) return false
    if (languageFilter.value !== 'all' && item.titleLanguage !== languageFilter.value) return false
    if (!keyword) return true
    return `${item.sku} ${previewTitle(item)} ${categoryLabel(item.category)} ${languageLabel(item.titleLanguage)}`.toLowerCase().includes(keyword)
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)))
const pagedItems = computed(() => filteredItems.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const selectedItem = computed(() => (form.id ? items.value.find((item) => item.id === form.id) || null : items.value[0] || null))

const currentEditorItem = computed<Partial<Item>>(
  () =>
    selectedItem.value || {
      generatedTitle: '',
      generatedDescription: '',
      listingImages: [],
      generationStatus: 'idle',
      updatedAt: 0,
      generatedAt: 0,
    },
)

const pageNumbers = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1)
  if (current <= 3) return [1, 2, 3, 4, total]
  if (current >= total - 2) return [1, total - 3, total - 2, total - 1, total]
  return [1, current - 1, current, current + 1, total]
})

watch(filteredItems, () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
})

async function refresh() {
  loading.value = true
  try {
    items.value = (await window.api.tiktokListing.list()) as Item[]
  } finally {
    loading.value = false
  }
}

async function loadExportCategoryConfigs() {
  const loader = window.api.tiktokListing?.getExportCategoryConfigs
  const configs = (typeof loader === 'function' ? await loader() : []) as ExportCategoryConfig[]
  exportCategoryConfigs.value = defaultExportCategoryConfigs().map((base) => {
    const current = configs.find((item) => item.category === base.category)
    return current
      ? {
          category: base.category,
          categoryId: safeText(current.categoryId, ''),
          productAttributes: String(current.productAttributes ?? ''),
        }
      : base
  })
}

async function openExportConfigDialog() {
  errorText.value = ''
  exportConfigDialogOpen.value = true
  if (!exportCategoryConfigs.value.length) exportCategoryConfigs.value = defaultExportCategoryConfigs()
  pushRuntimeLog('[tiktok-listing] open export config dialog', 'info')
  try {
    await loadExportCategoryConfigs()
  } catch (error: any) {
    errorText.value = `导出配置加载失败：${error?.message ?? String(error)}`
    pushRuntimeLog(`[tiktok-listing] load export category configs failed message=${safeText(error?.message ?? error, 'unknown error')}`, 'error')
  }
}

async function saveExportCategoryConfigs() {
  exportConfigSaving.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const saver = window.api.tiktokListing?.saveExportCategoryConfigs
    if (typeof saver !== 'function') throw new Error('当前桌面端实例尚未加载导出配置保存接口，请重启后重试')
    await saver(
      exportCategoryConfigs.value.map((item) => ({
        category: item.category,
        categoryId: safeText(item.categoryId, ''),
        productAttributes: String(item.productAttributes ?? ''),
      })),
    )
    notice.value = '导出分类配置已保存'
    exportConfigDialogOpen.value = false
    pushRuntimeLog('[tiktok-listing] save export category configs', 'success')
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    pushRuntimeLog(`[tiktok-listing] save export category configs failed message=${safeText(error?.message ?? error, 'unknown error')}`, 'error')
  } finally {
    exportConfigSaving.value = false
  }
}

async function pickImage() {
  const paths = await window.api.pickFiles({
    title: '选择商品实拍图',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    multiple: false,
  })
  form.sourceImagePath = String(paths?.[0] || '').trim()
  form.referenceImagePaths = resolveReferenceImages(form)
}

async function saveItem() {
  if (!form.sourceImagePath.trim()) {
    errorText.value = '请先上传商品图片'
    activeTab.value = 'editor'
    return
  }
  if (!form.sku.trim()) {
    errorText.value = '请输入 SKU'
    activeTab.value = 'editor'
    return
  }
  if (!form.localDisplayPrice.trim()) {
    errorText.value = '请输入本地展示价'
    activeTab.value = 'editor'
    return
  }

  saving.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const saved = (await window.api.tiktokListing.createOrUpdate({
      id: form.id || undefined,
      sourceImagePath: form.sourceImagePath,
      referenceImagePaths: resolveReferenceImages(form),
      category: form.category,
      sku: form.sku,
      localDisplayPrice: form.localDisplayPrice,
      titleLanguage: form.titleLanguage,
    })) as Item
    notice.value = '商品已保存'
    form.id = saved.id
    pushRuntimeLog(`[tiktok-listing] save item sku=${saved.sku}`, 'success')
    await refresh()
    editItem(items.value.find((item) => item.id === saved.id) || saved)
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    pushRuntimeLog(`[tiktok-listing] save item failed message=${safeText(error?.message ?? error, 'unknown error')}`, 'error')
  } finally {
    saving.value = false
  }
}

async function pickReferenceImages() {
  const paths = await window.api.pickFiles({
    title: '閫夋嫨鍟嗗搧杈呭姪鍙傝€冨浘',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    multiple: true,
  })
  form.referenceImagePaths = Array.from(
    new Set([...resolveReferenceImages(form), ...(Array.isArray(paths) ? paths : [])].map((entry) => String(entry || '').trim()).filter(Boolean)),
  )
}

function removeReferenceImage(filePath: string) {
  const target = String(filePath || '').trim()
  if (!target) return
  if (target === form.sourceImagePath) form.sourceImagePath = ''
  form.referenceImagePaths = resolveReferenceImages({
    sourceImagePath: form.sourceImagePath,
    referenceImagePaths: form.referenceImagePaths.filter((entry) => String(entry || '').trim() !== target),
  } as Partial<Item>)
}

async function generate(item: Item) {
  generating.value = true
  errorText.value = ''
  notice.value = ''
  pushRuntimeLog(`[tiktok-listing] start generate sku=${item.sku}`, 'info')
  pushRuntimeLog(`[tiktok-listing] stage title sku=${item.sku}`, 'info')
  try {
    const updated = (await window.api.tiktokListing.generate({ id: item.id })) as Item
    notice.value = `已触发生成，可在日志中查看标题与图片重试进度：${item.sku}`
    pushRuntimeLog(
      `[tiktok-listing] generate completed sku=${item.sku} status=${safeText(updated.generationStatus, 'done')} images=${Array.isArray(updated.listingImages) ? updated.listingImages.length : 0}`,
      updated.generationStatus === 'done' ? 'success' : 'error',
    )
    await refresh()
    editItem(items.value.find((entry) => entry.id === item.id) || updated)
    activeTab.value = 'editor'
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    pushRuntimeLog(`[tiktok-listing] generate failed sku=${item.sku} message=${safeText(error?.message ?? error, 'unknown error')}`, 'error')
  } finally {
    generating.value = false
  }
}

function deleteTargetLabel(item?: Item | null) {
  if (!item) return ''
  return safeText(item.sku, '') || safeText(item.generatedTitle, '') || '当前商品'
}

function openDeleteDialog(item: Item) {
  deleteTarget.value = item
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deleteBusy.value) return
  deleteDialogOpen.value = false
  deleteTarget.value = null
}

async function removeItem(item: Item) {
  errorText.value = ''
  notice.value = ''
  pushRuntimeLog(`[tiktok-listing] remove item sku=${item.sku}`, 'info')
  try {
    await window.api.tiktokListing.remove(item.id)
    selectedIds.value = selectedIds.value.filter((id) => id !== item.id)
    if (form.id === item.id) resetForm()
    notice.value = `商品已删除：${item.sku}`
    pushRuntimeLog(`[tiktok-listing] remove item completed sku=${item.sku}`, 'success')
    await refresh()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    pushRuntimeLog(`[tiktok-listing] remove item failed sku=${item.sku} message=${safeText(error?.message ?? error, 'unknown error')}`, 'error')
  }
}

async function confirmRemoveItem() {
  if (!deleteTarget.value || deleteBusy.value) return
  deleteBusy.value = true
  try {
    await removeItem(deleteTarget.value)
    deleteDialogOpen.value = false
    deleteTarget.value = null
  } finally {
    deleteBusy.value = false
  }
}

function viewItem(item: Item) {
  editItem(item)
  activeTab.value = 'editor'
  pushRuntimeLog(`[tiktok-listing] view item sku=${item.sku}`, 'info')
}

async function openExportFile(filePath: string) {
  const resolved = safeText(filePath, '')
  if (!resolved) return
  await window.api.shell.showItemInFolder(resolved)
}

async function previewImage(filePath: string) {
  const resolved = safeText(filePath, '')
  if (!resolved) return
  await window.api.shell.openPath(resolved)
}

async function removeListingImage(item: Item, imageId: string) {
  const nextImages = (item.listingImages || []).filter((image) => image.id !== imageId)
  const updated = (await window.api.tiktokListing.createOrUpdate({
    ...item,
    listingImages: nextImages,
  })) as Item
  pushRuntimeLog(`[tiktok-listing] remove listing image sku=${item.sku} remaining=${nextImages.length}`, 'info')
  await refresh()
  editItem(items.value.find((entry) => entry.id === updated.id) || updated)
}

async function exportExcel() {
  if (!selectedIds.value.length) {
    errorText.value = '请先选择要导出的商品'
    activeTab.value = 'list'
    return
  }
  exporting.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const result = await window.api.tiktokListing.exportExcel({ ids: [...selectedIds.value].map((id) => String(id)) })
    pushRuntimeLog(`[tiktok-listing] export excel path=${safeText((result as any).filePath, '')}`, 'success')
    await openExportFile(String((result as any).filePath || ''))
    notice.value = `Excel 已导出：${(result as any).filePath}`
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    pushRuntimeLog(`[tiktok-listing] export excel failed message=${safeText(error?.message ?? error, 'unknown error')}`, 'error')
  } finally {
    exporting.value = false
  }
}

function resetForm() {
  form.id = ''
  form.sourceImagePath = ''
  form.referenceImagePaths = []
  form.category = 'earring'
  form.sku = ''
  form.localDisplayPrice = ''
  form.titleLanguage = 'zh-CN'
  errorText.value = ''
}

function openCreate() {
  resetForm()
  activeTab.value = 'editor'
}

function editItem(item: Item) {
  form.id = item.id
  form.sourceImagePath = item.sourceImagePath
  form.referenceImagePaths = resolveReferenceImages(item)
  form.category = item.category
  form.sku = item.sku
  form.localDisplayPrice = item.localDisplayPrice
  form.titleLanguage = item.titleLanguage
  activeTab.value = 'editor'
}

function toggleSelection(id: string) {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id]
}

function toggleCurrentPageSelection() {
  const ids = pagedItems.value.map((item) => item.id)
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.value.includes(id))
  selectedIds.value = allSelected ? selectedIds.value.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds.value, ...ids])]
}

function resetFilters() {
  searchKeyword.value = ''
  categoryFilter.value = 'all'
  statusFilter.value = 'all'
  languageFilter.value = 'all'
  currentPage.value = 1
}

function goPage(page: number) {
  currentPage.value = Math.min(totalPages.value, Math.max(1, page))
}

onMounted(async () => {
  offRuntimeLog = window.api.clone.onRuntimeLog?.((payload) => {
    const text = safeText(payload?.message, '')
    if (!text || !isTiktokListingRuntimeMessage(text)) return
    pushRuntimeLog(text, payload?.level || 'info')
  })
  pushRuntimeLog('[tiktok-listing] runtime console ready', 'info')
  try {
    await loadExportCategoryConfigs()
  } catch (error: any) {
    pushRuntimeLog(`[tiktok-listing] initial export config load failed message=${safeText(error?.message ?? error, 'unknown error')}`, 'error')
  }
  await refresh()
})

onBeforeUnmount(() => {
  offRuntimeLog?.()
  offRuntimeLog = undefined
})
</script>

<template>
  <div class="listing-page">
    <section class="listing-shell">
      <div class="page-top">
        <div class="crumb-row">
          <button class="back-link" type="button" @click="router.push('/plugins?tab=installed')">
            <ChevronLeft class="h-4 w-4" />
            返回插件中心
          </button>
          <span>/</span>
          <strong>TikTok 商品上架助手</strong>
        </div>

        <div class="page-top__main">
          <div class="hero-copy">
            <div class="page-title-row">
              <h1>{{ activeTab === 'list' ? '商品列表' : '添加 / 编辑商品' }}</h1>
              <span class="official-badge">官方插件</span>
            </div>
            <p>
              {{
                activeTab === 'list'
                  ? '管理您的商品，批量导出店小秘 Excel 模板'
                  : '上传商品图、维护价格与语言，并生成 TikTok 标题与商品图片 HTML 描述'
              }}
            </p>
          </div>

          <div class="hero-actions">
            <button class="hero-ghost-button" type="button" @click="openExportConfigDialog">
              <Pencil class="h-4 w-4" />
              导出配置
            </button>
            <button class="hero-ghost-button" type="button" @click="openCreate">
              <Plus class="h-4 w-4" />
              {{ activeTab === 'list' ? '添加商品' : '新建商品' }}
            </button>
            <button class="hero-primary-button" type="button" :disabled="exporting" @click="exportExcel">
              <Download class="h-4 w-4" />
              {{ exporting ? '导出中...' : '批量导出 Excel' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="notice" class="notice success">{{ notice }}</div>
      <div v-if="errorText" class="notice error">{{ errorText }}</div>

      <div class="tab-bar">
        <button class="tab-button" :class="{ active: activeTab === 'list' }" type="button" @click="activeTab = 'list'">商品列表</button>
        <button class="tab-button" :class="{ active: activeTab === 'editor' }" type="button" @click="activeTab = 'editor'">商品编辑</button>
      </div>

      <template v-if="activeTab === 'list'">
        <section class="workspace-card list-stage">
          <div class="filter-board">
            <label class="field-shell field-shell--search">
              <Search class="h-4 w-4" />
              <input v-model="searchKeyword" type="text" placeholder="搜索 SKU、标题、分类" />
            </label>

            <label class="field-shell">
              <select v-model="categoryFilter">
                <option value="all">全部分类</option>
                <option v-for="option in categoryOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <ChevronDown class="h-4 w-4" />
            </label>

            <label class="field-shell">
              <select v-model="statusFilter">
                <option value="all">全部状态</option>
                <option value="done">已完成</option>
                <option value="generating">生成中</option>
                <option value="failed">失败</option>
                <option value="idle">草稿</option>
              </select>
              <ChevronDown class="h-4 w-4" />
            </label>

            <label class="field-shell">
              <select v-model="languageFilter">
                <option value="all">全部语言</option>
                <option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <ChevronDown class="h-4 w-4" />
            </label>

            <button class="toolbar-button toolbar-button--ghost" type="button" @click="resetFilters">重置</button>
          </div>

          <div class="stats-grid">
            <article class="stat-card">
              <div>
                <span>全部商品</span>
                <strong>{{ stats.all }}</strong>
              </div>
              <div class="stat-icon stat-icon--violet"><List class="h-5 w-5" /></div>
            </article>
            <article class="stat-card">
              <div>
                <span>已完成</span>
                <strong>{{ stats.done }}</strong>
              </div>
              <div class="stat-icon stat-icon--green"><CheckCircle2 class="h-5 w-5" /></div>
            </article>
            <article class="stat-card">
              <div>
                <span>生成中</span>
                <strong>{{ stats.generating }}</strong>
              </div>
              <div class="stat-icon stat-icon--blue"><Sparkles class="h-5 w-5" /></div>
            </article>
            <article class="stat-card">
              <div>
                <span>失败</span>
                <strong>{{ stats.failed }}</strong>
              </div>
              <div class="stat-icon stat-icon--amber"><CircleAlert class="h-5 w-5" /></div>
            </article>
            <article class="stat-card">
              <div>
                <span>草稿</span>
                <strong>{{ stats.draft }}</strong>
              </div>
              <div class="stat-icon stat-icon--slate"><Pencil class="h-5 w-5" /></div>
            </article>
          </div>

          <div class="table-card">
            <div class="table-header">
              <label class="check-label">
                <input type="checkbox" :checked="pagedItems.length > 0 && pagedItems.every((item) => selectedIds.includes(item.id))" @change="toggleCurrentPageSelection" />
                <span>当前页全选</span>
              </label>

              <div class="table-header__right">
                <button class="icon-button" :class="{ active: listViewMode === 'table' }" type="button" @click="listViewMode = 'table'">
                  <List class="h-4 w-4" />
                </button>
                <button class="icon-button" :class="{ active: listViewMode === 'grid' }" type="button" @click="listViewMode = 'grid'">
                  <Grid2X2 class="h-4 w-4" />
                </button>
              </div>
            </div>

            <template v-if="loading">
              <div class="empty-state">正在加载商品列表...</div>
            </template>

            <template v-else-if="!filteredItems.length">
              <div class="empty-state">暂无商品，先新建一条记录。</div>
            </template>

            <template v-else-if="listViewMode === 'table'">
              <div class="product-table">
                <div class="product-table__head">
                  <span></span>
                  <span>商品</span>
                  <span>SKU</span>
                  <span>分类</span>
                  <span>价格</span>
                  <span>状态</span>
                  <span>语言</span>
                  <span>更新时间</span>
                  <span>操作</span>
                </div>

                <div v-for="item in pagedItems" :key="item.id" class="product-row">
                  <label class="row-check">
                    <input :checked="selectedIds.includes(item.id)" type="checkbox" @change="toggleSelection(item.id)" />
                  </label>

                  <div class="product-info" @click="viewItem(item)">
                    <img :src="toFileUrl(item.sourceImagePath)" alt="product" class="product-cover" />
                    <div class="product-copy">
                      <strong>{{ previewTitle(item) }}</strong>
                      <div class="product-copy__meta">
                        <span class="mini-pill" :class="statusTone(item.generationStatus)">{{ statusLabel(item.generationStatus) }}</span>
                        <span class="mini-pill mini-pill--neutral">
                          <ImagePlus class="h-3.5 w-3.5" />
                          {{ imageCount(item) }}
                        </span>
                        <span class="mini-pill mini-pill--neutral">Ref {{ referenceImageCount(item) }}</span>
                      </div>
                    </div>
                  </div>

                  <span>{{ item.sku || '--' }}</span>
                  <span>{{ categoryLabel(item.category) }}</span>
                  <span>{{ formatPrice(item) }}</span>
                  <span class="status-pill" :class="statusTone(item.generationStatus)">{{ statusLabel(item.generationStatus) }}</span>
                  <span>{{ languageLabel(item.titleLanguage) }}</span>
                  <span>{{ formatDate(item.updatedAt || item.generatedAt) }}</span>

                  <div class="row-actions">
                    <button class="row-action" type="button" @click="viewItem(item)"><Eye class="h-4 w-4" /></button>
                    <button class="row-action" type="button" @click="editItem(item)"><Pencil class="h-4 w-4" /></button>
                    <button class="row-action" type="button" :title="item.generationStatus === 'failed' ? '重新生成' : '生成素材'" @click="generate(item)">
                      <Sparkles class="h-4 w-4" />
                    </button>
                    <button class="row-action" type="button" @click="openDeleteDialog(item)"><Trash2 class="h-4 w-4" /></button>
                  </div>
                </div>
              </div>

              <div class="table-footer">
                <div>已选择 {{ selectedCount }} 项</div>
                <div class="table-footer__meta">
                  <span>共 {{ filteredItems.length }} 条</span>
                  <label class="page-size">
                    <select v-model="pageSize">
                      <option :value="10">10 条/页</option>
                      <option :value="20">20 条/页</option>
                      <option :value="50">50 条/页</option>
                    </select>
                    <ChevronDown class="h-4 w-4" />
                  </label>
                  <div class="pagination">
                    <button class="page-btn" type="button" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">上一页</button>
                    <button v-for="page in pageNumbers" :key="page" class="page-btn" :class="{ active: page === currentPage }" type="button" @click="goPage(page)">
                      {{ page }}
                    </button>
                    <button class="page-btn" type="button" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">下一页</button>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="grid-cards">
                <article v-for="item in pagedItems" :key="item.id" class="grid-card">
                  <div class="grid-card__top">
                    <label class="check-label">
                      <input :checked="selectedIds.includes(item.id)" type="checkbox" @change="toggleSelection(item.id)" />
                      <span>{{ item.sku || '--' }}</span>
                    </label>
                    <span class="status-pill" :class="statusTone(item.generationStatus)">{{ statusLabel(item.generationStatus) }}</span>
                  </div>
                  <img :src="toFileUrl(item.sourceImagePath)" alt="product" class="grid-card__image" />
                  <strong>{{ previewTitle(item) }}</strong>
                  <p>{{ previewDescription(item) }}</p>
                  <div class="grid-card__meta">
                    <span>{{ categoryLabel(item.category) }}</span>
                    <span>{{ formatPrice(item) }}</span>
                    <span>Ref {{ referenceImageCount(item) }}</span>
                  </div>
                  <div class="grid-card__actions">
                    <button class="row-action" type="button" @click="editItem(item)"><Pencil class="h-4 w-4" /></button>
                    <button class="row-action" type="button" :title="item.generationStatus === 'failed' ? '重新生成' : '生成素材'" @click="generate(item)">
                      <Sparkles class="h-4 w-4" />
                    </button>
                    <button class="row-action" type="button" @click="openDeleteDialog(item)"><Trash2 class="h-4 w-4" /></button>
                  </div>
                </article>
              </div>
            </template>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="editor-stage">
          <aside class="editor-card editor-side">
            <div class="panel-head">
              <strong>基本信息</strong>
              <ChevronDown class="h-4 w-4" />
            </div>

            <div class="upload-box">
              <div v-if="form.sourceImagePath" class="upload-preview">
                <img :src="toFileUrl(form.sourceImagePath)" alt="source" />
              </div>
              <button class="upload-trigger" type="button" @click="pickImage">
                <Upload class="h-4 w-4" />
                {{ form.sourceImagePath ? '更换图片' : '上传图片' }}
              </button>
              <small>支持 png/jpg/jpeg/webp，建议 1:1 比例</small>
            </div>

            <label class="editor-field">
              <span>商品分类 <em>*</em></span>
              <div class="select-shell">
                <select v-model="form.category">
                  <option v-for="option in categoryOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <ChevronDown class="h-4 w-4" />
              </div>
            </label>

            <div class="upload-box">
              <div class="panel-head panel-head--compact">
                <strong>辅助参考图</strong>
                <span>{{ referenceImageCount(form) }} 张</span>
              </div>
              <button class="upload-trigger" type="button" @click="pickReferenceImages">
                <Upload class="h-4 w-4" />
                添加辅图
              </button>
              <div v-if="extraReferenceImages(form).length" class="reference-thumb-strip">
                <button
                  v-for="filePath in extraReferenceImages(form)"
                  :key="filePath"
                  class="reference-thumb"
                  type="button"
                  @click="previewImage(filePath)"
                >
                  <img :src="toFileUrl(filePath)" alt="reference" />
                  <span class="reference-thumb__remove" @click.stop="removeReferenceImage(filePath)">
                    <Trash2 class="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>
              <small>辅图会与主图一起作为深层结构分析依据</small>
            </div>

            <label class="editor-field">
              <span>SKU <em>*</em></span>
              <input v-model="form.sku" type="text" placeholder="例如 ER-20250601-001" />
            </label>

            <label class="editor-field">
              <span>本地展示价 <em>*</em></span>
              <div class="price-row">
                <input v-model="form.localDisplayPrice" type="text" placeholder="29.90" />
              </div>
            </label>

            <label class="editor-field">
              <span>标题语言 <em>*</em></span>
              <div class="select-shell">
                <select v-model="form.titleLanguage">
                  <option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <ChevronDown class="h-4 w-4" />
              </div>
            </label>

            <div class="generate-box">
              <div class="panel-head panel-head--compact">
                <strong>生成素材</strong>
                <ChevronDown class="h-4 w-4" />
              </div>
              <button class="hero-primary-button hero-primary-button--full" type="button" :disabled="generating || !selectedItem" @click="selectedItem && generate(selectedItem)">
                <Sparkles class="h-4 w-4" />
                {{ generating ? '生成中...' : ((currentEditorItem.generationStatus as GenerationStatus) === 'failed' ? '重新生成' : '生成素材') }}
              </button>
              <p>生成 1 条标题、5 张商品图，并自动拼接 HTML img 描述</p>
            </div>
          </aside>

          <section class="editor-card editor-main">
            <div class="result-topbar">
              <div class="result-head">
                <strong>生成结果</strong>
                <span class="status-pill" :class="statusTone((currentEditorItem.generationStatus as GenerationStatus) || 'idle')">
                  {{ statusLabel((currentEditorItem.generationStatus as GenerationStatus) || 'idle') }}
                </span>
              </div>
              <span>{{ formatDate(currentEditorItem.updatedAt || currentEditorItem.generatedAt) }}</span>
            </div>

            <div class="result-block">
              <div class="result-label">商品标题</div>
              <div class="result-box">
                <div>{{ previewTitle(currentEditorItem) }}</div>
                <span>{{ previewTitle(currentEditorItem).length }}/200</span>
              </div>
            </div>

            <div class="result-block">
              <div class="result-label">商品描述 HTML</div>
              <div class="result-box result-box--multi">
                <div>{{ previewDescription(currentEditorItem) }}</div>
                <span>{{ previewDescription(currentEditorItem).length }}/2000</span>
              </div>
            </div>

            <div v-if="generationErrorText(currentEditorItem)" class="result-block">
              <div class="result-label">生成失败原因</div>
              <div class="result-box result-box--error">
                <div>{{ generationErrorText(currentEditorItem) }}</div>
                <button class="toolbar-button toolbar-button--ghost" type="button" :disabled="!selectedItem || generating" @click="selectedItem && generate(selectedItem)">
                  <RefreshCcw class="h-4 w-4" />
                  重新生成
                </button>
              </div>
            </div>

            <div class="result-block">
              <div class="result-label">参考图（共 {{ referenceImageCount(currentEditorItem) }} 张）</div>
              <div class="result-image-strip">
                <article v-for="filePath in resolveReferenceImages(currentEditorItem)" :key="filePath" class="result-thumb-card">
                  <img :src="toFileUrl(filePath)" alt="reference" />
                  <div class="result-thumb-card__overlay">
                    <div class="thumb-tools">
                      <button class="thumb-tool" type="button" @click="previewImage(filePath)"><Eye class="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div v-if="filePath === currentEditorItem.sourceImagePath" class="primary-mark">主图</div>
                </article>
              </div>
            </div>

            <div class="result-block">
              <div class="result-label">临时多角度图</div>
              <div class="result-analysis-board">
                <button
                  v-if="currentEditorItem.analysisBoardImage?.filePath"
                  class="result-analysis-board__preview"
                  type="button"
                  @click="previewImage(currentEditorItem.analysisBoardImage.filePath)"
                >
                  <img :src="toFileUrl(currentEditorItem.analysisBoardImage.filePath)" alt="analysis board" />
                </button>
                <div v-else class="result-analysis-board__placeholder">本次生成会自动先产出临时多角度图</div>
                <div class="result-analysis-board__meta">
                  <strong>{{ analysisBoardStatus(currentEditorItem) }}</strong>
                  <p>系统会先结合 {{ referenceImageCount(currentEditorItem) }} 张参考图生成 product-only 的深层多角度图，再用它作为商品图主参考。</p>
                </div>
              </div>
            </div>

            <div class="result-block">
              <div class="result-label">商品图片（共 {{ imageCount(currentEditorItem) }} 张）</div>
              <div class="result-image-strip">
                <article v-for="(image, index) in currentEditorItem.listingImages || []" :key="image.id" class="result-thumb-card" :class="{ primary: index === 0 }">
                  <img :src="toFileUrl(image.filePath)" alt="listing" />
                  <div class="result-thumb-card__overlay">
                    <span class="thumb-index">{{ index + 1 }}</span>
                    <div class="thumb-tools">
                      <button class="thumb-tool" type="button" @click="previewImage(image.filePath)"><Eye class="h-3.5 w-3.5" /></button>
                      <button class="thumb-tool" type="button" @click="selectedItem && removeListingImage(selectedItem as Item, image.id)">
                        <Trash2 class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div v-if="index === 0" class="primary-mark">主图</div>
                </article>

                <button class="regenerate-tile" type="button" :disabled="!selectedItem || generating" @click="selectedItem && generate(selectedItem)">
                  <Plus class="h-5 w-5" />
                  重新生成图片
                </button>
              </div>
            </div>

            <div class="editor-footer">
              <button class="toolbar-button toolbar-button--ghost" type="button" @click="resetForm">取消</button>
              <button class="hero-primary-button" type="button" :disabled="saving" @click="saveItem">
                {{ saving ? '保存中...' : '保存商品' }}
              </button>
            </div>
          </section>

          <aside class="editor-card preview-side">
            <strong class="preview-side__title">商品预览</strong>
            <div class="preview-card">
              <img v-if="form.sourceImagePath" :src="toFileUrl(form.sourceImagePath)" alt="preview" class="preview-card__image" />
              <div v-else class="preview-card__placeholder">暂无商品图片</div>

              <strong>{{ previewTitle(currentEditorItem) }}</strong>
              <p>{{ previewDescription(currentEditorItem) }}</p>

              <dl class="preview-meta">
                <div>
                  <dt>SKU</dt>
                  <dd>{{ form.sku || '--' }}</dd>
                </div>
                <div>
                  <dt>本地展示价</dt>
                  <dd>{{ form.localDisplayPrice || '--' }}</dd>
                </div>
                <div>
                  <dt>分类</dt>
                  <dd>{{ categoryLabel(form.category) }}</dd>
                </div>
                <div>
                  <dt>标题语言</dt>
                  <dd>{{ languageLabel(form.titleLanguage) }}</dd>
                </div>
                <div>
                  <dt>生成状态</dt>
                  <dd>
                    <span class="status-pill" :class="statusTone((currentEditorItem.generationStatus as GenerationStatus) || 'idle')">
                      {{ statusLabel((currentEditorItem.generationStatus as GenerationStatus) || 'idle') }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>参考图</dt>
                  <dd>{{ referenceImageCount(currentEditorItem) }} 张</dd>
                </div>
                <div>
                  <dt>更新时间</dt>
                  <dd>{{ formatDate(currentEditorItem.updatedAt || currentEditorItem.generatedAt) }}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </section>
      </template>
    </section>

    <div v-if="exportConfigDialogOpen" class="export-config-dialog-mask" @click.self="exportConfigDialogOpen = false">
      <div class="export-config-dialog" @click.stop>
        <div class="export-config-dialog__head">
          <div class="export-config-dialog__copy">
            <strong>导出分类配置</strong>
            <p>提前维护 5 个分类各自的分类 ID 和产品属性，批量导出时将直接使用这里的配置。</p>
          </div>
          <button type="button" class="export-config-dialog__close" @click="exportConfigDialogOpen = false">×</button>
        </div>

        <div class="export-config-dialog__body">
          <article v-for="config in exportCategoryConfigs" :key="config.category" class="export-config-card">
            <div class="export-config-card__head">
              <strong>{{ categoryLabel(config.category) }}</strong>
            </div>
            <label class="export-config-field">
              <span>分类 ID</span>
              <input v-model="config.categoryId" type="text" placeholder="请输入分类 ID" />
            </label>
            <label class="export-config-field">
              <span>产品属性 JSON</span>
              <textarea v-model="config.productAttributes" rows="6" placeholder="请输入产品属性 JSON"></textarea>
            </label>
          </article>
        </div>

        <div class="export-config-dialog__footer">
          <button type="button" class="toolbar-button toolbar-button--ghost" :disabled="exportConfigSaving" @click="exportConfigDialogOpen = false">取消</button>
          <button type="button" class="hero-primary-button" :disabled="exportConfigSaving" @click="saveExportCategoryConfigs">
            {{ exportConfigSaving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteDialogOpen" class="export-config-dialog-mask" @click.self="closeDeleteDialog">
      <div class="export-config-dialog delete-dialog" @click.stop>
        <div class="export-config-dialog__head">
          <div class="export-config-dialog__copy">
            <strong>删除商品</strong>
            <p>确认删除商品“{{ deleteTargetLabel(deleteTarget) }}”吗？删除后无法恢复，请谨慎操作。</p>
          </div>
          <button type="button" class="export-config-dialog__close" :disabled="deleteBusy" @click="closeDeleteDialog">×</button>
        </div>

        <div class="delete-dialog__body">
          <div class="delete-dialog__icon">
            <Trash2 class="h-5 w-5" />
          </div>
          <div class="delete-dialog__content">
            <strong>{{ deleteTarget?.sku || '未命名商品' }}</strong>
            <span>{{ previewTitle(deleteTarget) }}</span>
          </div>
        </div>

        <div class="export-config-dialog__footer">
          <button type="button" class="toolbar-button toolbar-button--ghost" :disabled="deleteBusy" @click="closeDeleteDialog">取消</button>
          <button type="button" class="hero-primary-button delete-dialog__confirm" :disabled="deleteBusy" @click="confirmRemoveItem">
            {{ deleteBusy ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <RuntimeLogDialog
      v-model="runtimeDialogOpen"
      :logs="runtimeLogs"
      :title="'运行日志'"
      :description="'实时查看 TikTok 商品上架助手的提交日志、接口返回、阶段切换与错误信息。'"
      :hint="'仅显示 tiktok-listing 相关运行日志'"
      :empty-description="'在插件内执行保存、生成、导出等操作后，这里会显示最新运行信息。'"
    />
  </div>
</template>

<style scoped>
.listing-page {
  padding: 10px;
  color: #f7f8fc;
}

.listing-shell {
  display: grid;
  gap: 14px;
}

.page-top {
  display: grid;
  gap: 12px;
  padding: 6px 6px 0;
}

.crumb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(225, 232, 245, 0.82);
  font-size: 14px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(243, 246, 255, 0.92);
  font-weight: 600;
}

.page-top__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.hero-copy {
  display: grid;
  gap: 6px;
}

.page-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title-row h1 {
  margin: 0;
  color: #ffffff;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.hero-copy p {
  margin: 0;
  color: rgba(207, 215, 232, 0.78);
  font-size: 12px;
  line-height: 1.55;
}

.official-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(138, 92, 246, 0.42);
  background: rgba(98, 71, 179, 0.2);
  color: #c7b7ff;
  font-size: 12px;
  font-weight: 700;
}

.hero-actions {
  display: flex;
  gap: 12px;
  padding-top: 2px;
}

.hero-primary-button,
.hero-ghost-button,
.toolbar-button,
.icon-button,
.row-action,
.page-btn,
.upload-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 13px;
  font-weight: 700;
  transition: 0.2s ease;
}

.hero-primary-button {
  background: linear-gradient(135deg, #7c5cff, #5c6dff);
  color: #ffffff;
  box-shadow: 0 18px 38px rgba(100, 92, 255, 0.24);
}

.hero-primary-button--full {
  width: 100%;
  min-height: 46px;
}

.hero-ghost-button,
.toolbar-button,
.icon-button,
.row-action,
.page-btn,
.upload-trigger {
  background: rgba(255, 255, 255, 0.05);
  color: #f4f7ff;
}

.toolbar-button--ghost {
  min-height: 42px;
  padding: 0 16px;
}

.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-button {
  min-width: 142px;
  min-height: 42px;
  padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(203, 212, 228, 0.82);
  font-size: 13px;
  font-weight: 700;
}

.tab-button.active {
  border-color: rgba(104, 122, 255, 0.26);
  background: rgba(99, 94, 143, 0.18);
  color: #8f7dff;
  box-shadow: inset 0 -2px 0 #7c5cff;
}

.notice {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
}

.notice.success {
  border: 1px solid rgba(52, 211, 153, 0.18);
  background: rgba(16, 185, 129, 0.12);
  color: #d4ffec;
}

.notice.error {
  border: 1px solid rgba(248, 113, 113, 0.18);
  background: rgba(239, 68, 68, 0.12);
  color: #ffd4d4;
}

.export-config-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(3, 7, 18, 0.68);
  backdrop-filter: blur(12px);
}

.export-config-dialog {
  width: min(1100px, 100%);
  max-height: min(88vh, 920px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(10, 16, 30, 0.98), rgba(7, 12, 24, 0.98));
  box-shadow: 0 28px 70px rgba(3, 8, 18, 0.42);
  overflow: hidden;
}

.export-config-dialog__head,
.export-config-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.export-config-dialog__head {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.export-config-dialog__copy {
  display: grid;
  gap: 6px;
}

.export-config-dialog__copy strong {
  color: #ffffff;
  font-size: 16px;
}

.export-config-dialog__copy p {
  margin: 0;
  color: rgba(207, 215, 232, 0.72);
  font-size: 12px;
  line-height: 1.7;
}

.export-config-dialog__close {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #f8fbff;
  font-size: 18px;
}

.export-config-dialog__body {
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 18px 20px;
}

.export-config-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
}

.export-config-card__head strong {
  color: #ffffff;
  font-size: 14px;
}

.export-config-field {
  display: grid;
  gap: 6px;
}

.export-config-field span {
  color: #f5f7ff;
  font-size: 12px;
  font-weight: 700;
}

.export-config-field input,
.export-config-field textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(25, 32, 50, 0.82);
  color: #ffffff;
  padding: 12px 14px;
  outline: none;
  font-size: 13px;
  resize: vertical;
}

.export-config-dialog__footer {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  justify-content: flex-end;
}

.delete-dialog {
  width: min(520px, 100%);
  max-height: none;
}

.delete-dialog__body {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 20px 10px;
}

.delete-dialog__icon {
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.22), rgba(249, 115, 22, 0.18));
  color: #ffb4b4;
  border: 1px solid rgba(248, 113, 113, 0.22);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.delete-dialog__content {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.delete-dialog__content strong {
  color: #ffffff;
  font-size: 15px;
}

.delete-dialog__content span {
  color: rgba(207, 215, 232, 0.72);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.delete-dialog__confirm {
  border-color: rgba(248, 113, 113, 0.22);
  background: linear-gradient(135deg, #ef4444, #f97316);
  box-shadow: 0 18px 38px rgba(239, 68, 68, 0.24);
}

.workspace-card,
.editor-card {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(10, 16, 30, 0.98), rgba(7, 12, 24, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.list-stage {
  padding: 14px;
}

.filter-board {
  display: grid;
  grid-template-columns: minmax(320px, 2fr) repeat(3, minmax(150px, 1fr)) 110px;
  gap: 10px;
}

.field-shell,
.editor-field input,
.select-shell,
.price-row input,
.result-box {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(25, 32, 50, 0.78);
}

.field-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 12px;
  color: rgba(207, 215, 232, 0.76);
}

.field-shell--search {
  padding-inline: 14px;
}

.field-shell input,
.field-shell select,
.editor-field input,
.select-shell select,
.price-row input,
.page-size select {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: #ffffff;
  font-size: 14px;
}

.field-shell select,
.select-shell select,
.page-size select {
  appearance: none;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.stat-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
}

.stat-card span {
  color: rgba(204, 213, 229, 0.74);
  font-size: 12px;
}

.stat-card strong {
  display: block;
  margin-top: 6px;
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
}

.stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.stat-icon--violet {
  background: rgba(110, 73, 214, 0.28);
  color: #c6b1ff;
}

.stat-icon--green {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
}

.stat-icon--blue {
  background: rgba(37, 99, 235, 0.22);
  color: #93c5fd;
}

.stat-icon--amber {
  background: rgba(245, 158, 11, 0.24);
  color: #fcd34d;
}

.stat-icon--slate {
  background: rgba(100, 116, 139, 0.26);
  color: #d4dce8;
}

.table-card {
  margin-top: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  overflow: hidden;
  background: rgba(14, 20, 36, 0.9);
}

.table-header,
.table-footer,
.table-footer__meta,
.pagination,
.price-row,
.result-topbar,
.result-head,
.thumb-tools,
.editor-footer,
.hero-actions {
  display: flex;
  align-items: center;
}

.table-header,
.table-footer {
  justify-content: space-between;
  padding: 8px 12px;
  color: rgba(216, 223, 237, 0.78);
}

.table-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.table-header__right,
.row-actions,
.grid-card__actions,
.table-footer__meta,
.pagination,
.thumb-tools,
.editor-footer,
.price-row,
.result-head {
  display: flex;
  gap: 8px;
}

.check-label,
.row-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #ffffff;
}

.icon-button,
.row-action,
.page-btn {
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 12px;
}

.icon-button.active,
.page-btn.active {
  border-color: rgba(144, 102, 255, 0.52);
  color: #c8b6ff;
  box-shadow: inset 0 0 0 1px rgba(144, 102, 255, 0.18);
}

.empty-state {
  padding: 28px 18px;
  color: rgba(207, 215, 232, 0.74);
}

.product-table {
  width: 100%;
}

.product-table__head,
.product-row {
  display: grid;
  grid-template-columns: 34px minmax(300px, 2.3fr) 1.15fr 1.1fr 1fr 0.95fr 1.15fr 1.1fr 168px;
  gap: 12px;
  align-items: center;
  padding: 0 12px;
}

.product-table__head {
  min-height: 42px;
  color: rgba(193, 203, 223, 0.74);
  font-size: 12px;
}

.product-row {
  min-height: 68px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: #eef2ff;
}

.product-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  cursor: pointer;
}

.product-cover,
.grid-card__image,
.upload-preview img,
.result-thumb-card img,
.preview-card__image {
  object-fit: cover;
}

.product-cover {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.product-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.product-copy strong,
.grid-card strong,
.preview-card strong {
  color: #ffffff;
}

.product-copy strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.product-copy__meta,
.grid-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mini-pill,
.status-pill,
.primary-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  font-weight: 700;
}

.mini-pill--neutral {
  color: rgba(236, 242, 255, 0.88);
  background: rgba(255, 255, 255, 0.06);
}

.status--done {
  color: #34d399;
  background: rgba(16, 185, 129, 0.16);
}

.status--generating {
  color: #38bdf8;
  background: rgba(37, 99, 235, 0.16);
}

.status--failed {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.18);
}

.status--idle {
  color: #cbd5e1;
  background: rgba(148, 163, 184, 0.16);
}

.grid-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
}

.grid-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
}

.grid-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.grid-card__image {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.grid-card p,
.preview-card p {
  margin: 0;
  color: rgba(207, 215, 232, 0.74);
  line-height: 1.7;
}

.reference-thumb-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.reference-thumb {
  position: relative;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.reference-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.reference-thumb__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(7, 10, 20, 0.74);
  color: #ffffff;
}

.page-size {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.editor-stage {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr) 350px;
  gap: 12px;
}

.editor-card {
  padding: 14px;
}

.editor-side,
.editor-main,
.preview-side {
  display: grid;
  gap: 12px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #ffffff;
}

.panel-head strong,
.preview-side__title,
.result-label {
  font-size: 14px;
  font-weight: 800;
}

.panel-head--compact {
  margin-bottom: 4px;
}

.upload-box {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
}

.upload-preview {
  display: flex;
  justify-content: center;
}

.upload-preview img {
  width: 170px;
  height: 170px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.upload-trigger {
  width: 100%;
  min-height: 44px;
}

.upload-box small,
.generate-box p {
  color: rgba(195, 205, 224, 0.72);
  font-size: 12px;
  text-align: center;
}

.editor-field {
  display: grid;
  gap: 6px;
}

.editor-field span {
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.editor-field em {
  color: #f87171;
  font-style: normal;
}

.editor-field input,
.price-row input {
  min-height: 44px;
  padding: 0 14px;
}

.select-shell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
}

.generate-box {
  display: grid;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.result-topbar {
  justify-content: space-between;
  color: rgba(225, 232, 245, 0.8);
}

.result-block {
  display: grid;
  gap: 8px;
}

.result-box {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  color: rgba(242, 246, 255, 0.94);
}

.result-box span {
  color: rgba(148, 163, 184, 0.8);
  white-space: nowrap;
}

.result-box--error {
  border-color: rgba(248, 113, 113, 0.24);
  background: rgba(239, 68, 68, 0.1);
}

.result-box--error > div {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

.result-box--multi {
  min-height: 178px;
}

.result-analysis-board {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(25, 32, 50, 0.78);
}

.result-analysis-board__preview,
.result-analysis-board__placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.result-analysis-board__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-analysis-board__placeholder {
  display: grid;
  place-items: center;
  color: rgba(195, 205, 224, 0.66);
  font-size: 12px;
  text-align: center;
  padding: 14px;
}

.result-analysis-board__meta {
  display: grid;
  align-content: center;
  gap: 6px;
}

.result-analysis-board__meta strong {
  color: #ffffff;
  font-size: 14px;
}

.result-analysis-board__meta p {
  margin: 0;
  color: rgba(207, 215, 232, 0.76);
  font-size: 12px;
  line-height: 1.6;
}

.result-image-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.result-thumb-card,
.regenerate-tile {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.result-thumb-card img {
  width: 100%;
  height: 100%;
}

.result-thumb-card__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8px;
  background: linear-gradient(180deg, rgba(8, 12, 20, 0.56), rgba(8, 12, 20, 0.08) 38%, rgba(8, 12, 20, 0.48));
}

.thumb-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
}

.thumb-tool {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(7, 13, 22, 0.48);
  color: #ffffff;
}

.primary-mark {
  position: absolute;
  left: 8px;
  bottom: 8px;
  background: rgba(124, 92, 255, 0.94);
  color: #ffffff;
}

.regenerate-tile {
  display: grid;
  place-items: center;
  gap: 8px;
  border-style: dashed;
  color: rgba(228, 235, 248, 0.88);
}

.editor-footer {
  justify-content: flex-end;
  margin-top: 6px;
}

.preview-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
}

.preview-card__image,
.preview-card__placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
}

.preview-card__image {
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-card__placeholder {
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(195, 205, 224, 0.66);
}

.preview-meta {
  display: grid;
  gap: 8px;
  margin: 0;
}

.preview-meta div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.preview-meta dt {
  color: rgba(195, 205, 224, 0.72);
}

.preview-meta dd {
  margin: 0;
  color: #ffffff;
  text-align: right;
}

@media (max-width: 1600px) {
  .editor-stage {
    grid-template-columns: 340px minmax(0, 1fr);
  }

  .preview-side {
    grid-column: 1 / -1;
  }

  .filter-board {
    grid-template-columns: minmax(320px, 2fr) repeat(3, minmax(150px, 1fr)) 110px;
  }

  .stats-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 1280px) {
  .product-table__head,
  .product-row {
    grid-template-columns: 34px minmax(260px, 2fr) 1fr 1fr 1fr 1fr 1fr 148px;
  }

  .result-image-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .result-analysis-board {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .filter-board {
    grid-template-columns: minmax(240px, 2fr) repeat(2, minmax(150px, 1fr));
  }
}

@media (max-width: 1024px) {
  .export-config-dialog__body {
    grid-template-columns: 1fr;
  }

  .table-footer,
  .editor-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-board,
  .stats-grid,
  .editor-stage,
  .grid-cards,
  .result-image-strip {
    grid-template-columns: 1fr;
  }

  .product-table {
    overflow-x: auto;
  }

  .tab-button {
    min-width: 0;
    flex: 1;
  }
}

@media (max-width: 720px) {
  .page-title-row h1 {
    font-size: 28px;
  }

  .hero-actions,
  .tab-bar,
  .pagination,
  .table-footer__meta {
    flex-wrap: wrap;
  }
}
</style>
