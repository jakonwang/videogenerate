<script setup lang="ts">
/**
 * TikTok 上架助手（网页版，按电脑端 TiktokListingHelperView）：商品列表 / 商品编辑两个分区，
 * 导出配置、批量导出店小秘 Excel。生成 = 1 条标题 + 5 张商品图（云端），描述是商品图的 <img> 标签。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckCircle2, ChevronDown, ChevronLeft, CircleAlert, Download, Eye, Grid2X2, ImagePlus, List, Pencil, Plus, RefreshCcw, Sparkles, Trash2, Upload, X } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncListing } from '@shared/cloud/sync'
import { TIKTOK_LISTING_CATEGORY_LABELS, TIKTOK_LISTING_LANGUAGE_LABELS, type TiktokListingCategory, type TiktokListingLanguage } from '@shared/tiktokListingPrompts'
import { LISTING_EXPORT_HEADERS, buildListingDescriptionFromUrls, buildListingExportRow, type ListingExportCategoryConfig } from '@shared/tiktokListingExport'
import CloudImage from '@/components/CloudImage.vue'
import { uploadImage } from '@/lib/files'
import { LISTING_IMAGE_COUNT, generateListing, loadExportConfigs, saveExportConfigs, startListingPolling } from '@/lib/listing'
import { downloadBlob } from '@/lib/platform'
import { cloud, errorMessage } from '@/lib/session'
import { deleteRecord, listRecords, newId, saveRecord, syncState } from '@/lib/sync'
import { toast } from '@/lib/toast'

type Item = SyncListing & { id: string; updatedAt: number }
type Status = NonNullable<SyncListing['generationStatus']>

const route = useRoute()
const router = useRouter()
const items = ref<Item[]>([])
const loading = ref(true)
watch(
  () => syncState.version,
  async () => {
    const records = await listRecords<SyncListing>(SYNC_COLLECTIONS.listings)
    items.value = records.filter((r) => r.data).map((r) => ({ ...(r.data as SyncListing), id: r.id, updatedAt: r.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt)
    loading.value = false
  },
  { immediate: true },
)
onMounted(() => startListingPolling())

const activeTab = ref<'list' | 'editor'>('list')
const categoryOptions = Object.entries(TIKTOK_LISTING_CATEGORY_LABELS).map(([value, label]) => ({ value: value as TiktokListingCategory, label }))
const languageOptions = Object.entries(TIKTOK_LISTING_LANGUAGE_LABELS).map(([value, label]) => ({ value: value as TiktokListingLanguage, label }))
const categoryLabel = (c?: string) => TIKTOK_LISTING_CATEGORY_LABELS[c as TiktokListingCategory] ?? c ?? '--'
const languageLabel = (l?: string) => TIKTOK_LISTING_LANGUAGE_LABELS[l as TiktokListingLanguage] ?? l ?? '--'
const statusOf = (item: Partial<SyncListing>): Status => item.generationStatus ?? (item.title ? 'done' : 'idle')
const STATUS_LABEL: Record<Status, string> = { done: '已完成', generating: '生成中', failed: '失败', idle: '草稿' }
const statusTone = (s: Status) => `is-${s}`
const imageCount = (item: Partial<SyncListing>) => (item.listingImages ?? []).filter((img) => img.fileId).length
const refCount = (item: Partial<SyncListing>) => (item.images ?? []).length
const previewTitle = (item?: Partial<SyncListing> | null) => String(item?.title || '').trim() || '尚未生成标题'
const formatPrice = (item: Partial<SyncListing>) => (item.price ? item.price : '--')
const formatDate = (at?: number) => (at ? new Date(at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--')

/* ================================================================ 商品列表 */
const searchKeyword = ref('')
const categoryFilter = ref<'all' | TiktokListingCategory>('all')
const statusFilter = ref<'all' | Status>('all')
const languageFilter = ref<'all' | TiktokListingLanguage>('all')
const listViewMode = ref<'table' | 'grid'>('table')
const selectedIds = ref<string[]>([])
const currentPage = ref(1)
const pageSize = ref(10)
function resetFilters() {
  searchKeyword.value = ''
  categoryFilter.value = 'all'
  statusFilter.value = 'all'
  languageFilter.value = 'all'
}
const filteredItems = computed(() => {
  const word = searchKeyword.value.trim().toLowerCase()
  return items.value.filter(
    (item) =>
      (categoryFilter.value === 'all' || item.category === categoryFilter.value) &&
      (statusFilter.value === 'all' || statusOf(item) === statusFilter.value) &&
      (languageFilter.value === 'all' || item.language === languageFilter.value) &&
      (!word || `${item.sku} ${item.title} ${categoryLabel(item.category)}`.toLowerCase().includes(word)),
  )
})
watch([searchKeyword, categoryFilter, statusFilter, languageFilter, pageSize], () => (currentPage.value = 1))
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)))
const pagedItems = computed(() => filteredItems.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, i) => i + 1).slice(Math.max(0, currentPage.value - 3), Math.max(5, currentPage.value + 2)))
const stats = computed(() => ({
  all: items.value.length,
  done: items.value.filter((i) => statusOf(i) === 'done').length,
  generating: items.value.filter((i) => statusOf(i) === 'generating').length,
  failed: items.value.filter((i) => statusOf(i) === 'failed').length,
  draft: items.value.filter((i) => statusOf(i) === 'idle').length,
}))
const pageAllSelected = computed(() => pagedItems.value.length > 0 && pagedItems.value.every((i) => selectedIds.value.includes(i.id)))
function toggleCurrentPageSelection() {
  const ids = pagedItems.value.map((i) => i.id)
  selectedIds.value = pageAllSelected.value ? selectedIds.value.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds.value, ...ids])]
}
function toggleSelection(id: string) {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((x) => x !== id) : [...selectedIds.value, id]
}

/* ================================================================ 商品编辑 */
const editingId = ref('')
const blank = (): SyncListing => ({ images: [], category: 'earring', language: 'en-US', sku: '', price: '', title: '', description: '', createdAt: Date.now() })
const form = reactive<SyncListing>(blank())
const current = computed<Partial<Item>>(() => items.value.find((i) => i.id === editingId.value) ?? form)
const saving = ref(false)
const generating = ref(false)
const mainInput = ref<HTMLInputElement>()
const refInput = ref<HTMLInputElement>()

function openCreate() {
  editingId.value = ''
  Object.assign(form, blank())
  activeTab.value = 'editor'
}
function editItem(item: Item) {
  editingId.value = item.id
  const { id: _id, updatedAt: _u, ...data } = item
  Object.assign(form, blank(), JSON.parse(JSON.stringify(data)))
  activeTab.value = 'editor'
}
// 生成进度从同步记录回来时，编辑中的商品跟着更新结果（不动正在填的字段）
watch(items, () => {
  const live = items.value.find((i) => i.id === editingId.value)
  if (!live) return
  form.title = live.title
  form.listingImages = live.listingImages
  form.generationStatus = live.generationStatus
  form.generationError = live.generationError
})
onMounted(() => {
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  if (!id) return
  if (id === 'new') return openCreate()
  const stop = watch(items, (list) => {
    const hit = list.find((i) => i.id === id)
    if (hit) {
      editItem(hit)
      stop()
    }
  }, { immediate: true })
})
function resetForm() {
  const live = items.value.find((i) => i.id === editingId.value)
  if (live) editItem(live)
  else Object.assign(form, blank())
  activeTab.value = 'list'
}

async function uploadTo(files: File[], main: boolean) {
  for (const file of files.filter((f) => f.type.startsWith('image/'))) {
    try {
      const image = await uploadImage(file)
      form.images = main ? [image, ...form.images.slice(1)] : [...form.images, image]
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    }
  }
}
function onMainFile(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, 1)
  ;(event.target as HTMLInputElement).value = ''
  void uploadTo(files, true)
}
function onRefFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  ;(event.target as HTMLInputElement).value = ''
  if (!form.images.length) return toast('请先上传商品图片')
  void uploadTo(files, false)
}
const extraRefs = computed(() => form.images.slice(1))
function removeRef(fileId: string) {
  form.images = form.images.filter((img, i) => i === 0 || img.fileId !== fileId)
}

function validate() {
  if (!form.images.length) return '请先上传商品图片'
  if (!form.sku.trim()) return '请输入 SKU'
  if (!form.price.trim()) return '请输入本地展示价'
  return ''
}
async function saveItem(silent = false) {
  const problem = validate()
  if (problem) {
    toast(problem)
    return ''
  }
  saving.value = true
  try {
    const id = editingId.value || newId('listing')
    await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, id, { ...JSON.parse(JSON.stringify(form)), sku: form.sku.trim(), price: form.price.trim() })
    editingId.value = id
    if (!silent) toast('商品已保存')
    return id
  } finally {
    saving.value = false
  }
}
async function generate(item?: Item) {
  generating.value = true
  try {
    let id = item?.id ?? ''
    let data: SyncListing
    if (item) {
      const { id: _i, updatedAt: _u, ...rest } = item
      data = rest
    } else {
      id = await saveItem(true)
      if (!id) return
      data = JSON.parse(JSON.stringify(form))
    }
    await generateListing(id, data)
    toast(`已触发生成：${data.sku || '当前商品'}`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    generating.value = false
  }
}
const descriptionPreview = computed(() => {
  const ready = (current.value.listingImages ?? []).filter((img) => img.fileId)
  return ready.length ? ready.map((_, i) => `<img src="商品图 ${i + 1}" />`).join('\n') : '尚未生成图片描述 HTML，先保存商品后再生成。'
})
async function removeListingImage(index: number) {
  if (!editingId.value) return
  const live = items.value.find((i) => i.id === editingId.value)
  if (!live) return
  const { id, updatedAt: _u, ...data } = live
  await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, id, { ...data, listingImages: (data.listingImages ?? []).filter((_, i) => i !== index) })
}

/* ================================================================ 删除 */
const deleteTarget = ref<Item | null>(null)
const deleteBusy = ref(false)
async function confirmRemoveItem() {
  if (!deleteTarget.value) return
  deleteBusy.value = true
  try {
    await deleteRecord(SYNC_COLLECTIONS.listings, deleteTarget.value.id)
    toast(`商品已删除：${deleteTarget.value.sku || '未命名商品'}`)
    selectedIds.value = selectedIds.value.filter((id) => id !== deleteTarget.value!.id)
    if (editingId.value === deleteTarget.value.id) openCreate()
    deleteTarget.value = null
  } finally {
    deleteBusy.value = false
  }
}

/* ================================================================ 导出配置 / Excel */
const exportConfigDialogOpen = ref(false)
const exportConfigs = ref<ListingExportCategoryConfig[]>([])
const exportConfigSaving = ref(false)
async function openExportConfigDialog() {
  try {
    exportConfigs.value = await loadExportConfigs()
    exportConfigDialogOpen.value = true
  } catch (error) {
    toast(`导出配置加载失败：${errorMessage(error)}`)
  }
}
async function saveConfigs() {
  exportConfigSaving.value = true
  try {
    await saveExportConfigs(exportConfigs.value)
    exportConfigDialogOpen.value = false
    toast('导出分类配置已保存')
  } finally {
    exportConfigSaving.value = false
  }
}
const exporting = ref(false)
async function exportExcel() {
  const chosen = items.value.filter((i) => selectedIds.value.includes(i.id))
  if (!chosen.length) return toast('请先选择要导出的商品')
  for (const item of chosen) {
    if (!item.sku.trim()) return toast(`SKU 为空：${item.id}`)
    if (!item.price.trim()) return toast(`价格为空：${item.sku}`)
    if (!item.title.trim()) return toast(`标题未生成：${item.sku}`)
    if (imageCount(item) < LISTING_IMAGE_COUNT) return toast(`商品图不足 5 张：${item.sku}`)
  }
  exporting.value = true
  try {
    const fileIds = chosen.flatMap((item) => (item.listingImages ?? []).map((img) => img.fileId!).filter(Boolean))
    const { urls } = await cloud.ai.publicUrls(fileIds, 30)
    const configs = new Map((await loadExportConfigs()).map((c) => [c.category, c]))
    const rows = chosen.map((item) => {
      const imageUrls = (item.listingImages ?? []).map((img) => urls[img.fileId!] || '')
      return buildListingExportRow({ category: item.category, title: item.title, description: buildListingDescriptionFromUrls(imageUrls), sku: item.sku, price: item.price, imageUrls }, configs.get(item.category))
    })
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: LISTING_EXPORT_HEADERS }), 'Sheet1')
    const array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const name = `tiktok-listing-${Date.now()}.xlsx`
    downloadBlob(new Blob([array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
    toast(`Excel 已导出：${name}`)
  } catch (error) {
    console.error('[listing-export]', error)
    toast(errorMessage(error) || '导出失败')
  } finally {
    exporting.value = false
  }
}

const previewFile = ref('')
</script>

<template>
  <div class="listing-page" data-testid="web-listings">
    <section class="listing-shell">
      <div class="page-top">
        <div class="crumb-row">
          <button class="back-link" type="button" @click="router.push('/toolbox')"><ChevronLeft :size="16" /> 返回工具箱</button>
          <span>/</span>
          <strong>TikTok 上架助手</strong>
        </div>
        <div class="page-top__main">
          <div class="hero-copy">
            <h1>{{ activeTab === 'list' ? '商品列表' : '添加 / 编辑商品' }}</h1>
            <p>{{ activeTab === 'list' ? '管理您的商品，批量导出店小秘 Excel 模板' : '上传商品图、维护价格与语言，并生成 TikTok 标题与商品图片 HTML 描述' }}</p>
          </div>
          <div class="hero-actions">
            <button class="hero-ghost-button" type="button" data-testid="listing-export-config" @click="openExportConfigDialog"><Pencil :size="16" /> 导出配置</button>
            <button class="hero-ghost-button" type="button" data-testid="listing-add" @click="openCreate"><Plus :size="16" /> {{ activeTab === 'list' ? '添加商品' : '新建商品' }}</button>
            <button class="hero-primary-button" type="button" :disabled="exporting" data-testid="listing-export" @click="exportExcel"><Download :size="16" /> {{ exporting ? '导出中...' : '批量导出 Excel' }}</button>
          </div>
        </div>
      </div>

      <div class="tab-bar">
        <button class="tab-button" :class="{ active: activeTab === 'list' }" type="button" @click="activeTab = 'list'">商品列表</button>
        <button class="tab-button" :class="{ active: activeTab === 'editor' }" type="button" @click="activeTab = 'editor'">商品编辑</button>
      </div>

      <!-- ============ 商品列表 ============ -->
      <section v-if="activeTab === 'list'" class="workspace-card list-stage">
        <div class="filter-board">
          <label class="field-shell field-shell--search"><span class="field-icon">⌕</span><input v-model="searchKeyword" type="text" placeholder="搜索 SKU、标题、分类" /></label>
          <label class="field-shell"><select v-model="categoryFilter"><option value="all">全部分类</option><option v-for="o in categoryOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select><ChevronDown :size="16" /></label>
          <label class="field-shell"><select v-model="statusFilter"><option value="all">全部状态</option><option value="done">已完成</option><option value="generating">生成中</option><option value="failed">失败</option><option value="idle">草稿</option></select><ChevronDown :size="16" /></label>
          <label class="field-shell"><select v-model="languageFilter"><option value="all">全部语言</option><option v-for="o in languageOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select><ChevronDown :size="16" /></label>
          <button class="toolbar-button" type="button" @click="resetFilters">重置</button>
        </div>
        <div class="stats-grid">
          <article class="stat-card"><div><span>全部商品</span><strong>{{ stats.all }}</strong></div><div class="stat-icon stat-icon--violet"><List :size="20" /></div></article>
          <article class="stat-card"><div><span>已完成</span><strong>{{ stats.done }}</strong></div><div class="stat-icon stat-icon--green"><CheckCircle2 :size="20" /></div></article>
          <article class="stat-card"><div><span>生成中</span><strong>{{ stats.generating }}</strong></div><div class="stat-icon stat-icon--blue"><Sparkles :size="20" /></div></article>
          <article class="stat-card"><div><span>失败</span><strong>{{ stats.failed }}</strong></div><div class="stat-icon stat-icon--amber"><CircleAlert :size="20" /></div></article>
          <article class="stat-card"><div><span>草稿</span><strong>{{ stats.draft }}</strong></div><div class="stat-icon stat-icon--slate"><Pencil :size="20" /></div></article>
        </div>
        <div class="table-card">
          <div class="table-header">
            <label class="check-label"><input type="checkbox" :checked="pageAllSelected" @change="toggleCurrentPageSelection" /><span>当前页全选</span></label>
            <div class="table-header__right">
              <button class="icon-button" :class="{ active: listViewMode === 'table' }" type="button" @click="listViewMode = 'table'"><List :size="16" /></button>
              <button class="icon-button" :class="{ active: listViewMode === 'grid' }" type="button" @click="listViewMode = 'grid'"><Grid2X2 :size="16" /></button>
            </div>
          </div>
          <div v-if="loading" class="empty-state">正在加载商品列表...</div>
          <div v-else-if="!filteredItems.length" class="empty-state">暂无商品，先新建一条记录。</div>
          <template v-else-if="listViewMode === 'table'">
            <div class="product-table">
              <div class="product-table__head"><span></span><span>商品</span><span>SKU</span><span>分类</span><span>价格</span><span>状态</span><span>语言</span><span>更新时间</span><span>操作</span></div>
              <div v-for="item in pagedItems" :key="item.id" class="product-row" data-testid="listing-row">
                <label class="row-check"><input :checked="selectedIds.includes(item.id)" type="checkbox" @change="toggleSelection(item.id)" /></label>
                <div class="product-info" @click="editItem(item)">
                  <span class="product-cover"><CloudImage :file-id="item.images[0]?.fileId" /></span>
                  <div class="product-copy">
                    <strong>{{ previewTitle(item) }}</strong>
                    <div class="product-copy__meta">
                      <span class="mini-pill" :class="statusTone(statusOf(item))">{{ STATUS_LABEL[statusOf(item)] }}</span>
                      <span class="mini-pill mini-pill--neutral"><ImagePlus :size="13" /> {{ imageCount(item) }}</span>
                      <span class="mini-pill mini-pill--neutral">Ref {{ refCount(item) }}</span>
                    </div>
                  </div>
                </div>
                <span>{{ item.sku || '--' }}</span>
                <span>{{ categoryLabel(item.category) }}</span>
                <span>{{ formatPrice(item) }}</span>
                <span class="status-pill" :class="statusTone(statusOf(item))">{{ STATUS_LABEL[statusOf(item)] }}</span>
                <span>{{ languageLabel(item.language) }}</span>
                <span>{{ formatDate(item.updatedAt) }}</span>
                <div class="row-actions">
                  <button class="row-action" type="button" title="查看" @click="editItem(item)"><Eye :size="16" /></button>
                  <button class="row-action" type="button" title="编辑" @click="editItem(item)"><Pencil :size="16" /></button>
                  <button class="row-action" type="button" :title="statusOf(item) === 'failed' ? '重新生成' : '生成素材'" :disabled="statusOf(item) === 'generating'" @click="generate(item)"><Sparkles :size="16" /></button>
                  <button class="row-action" type="button" title="删除" @click="deleteTarget = item"><Trash2 :size="16" /></button>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="grid-cards">
            <article v-for="item in pagedItems" :key="item.id" class="grid-card">
              <div class="grid-card__top">
                <label class="check-label"><input :checked="selectedIds.includes(item.id)" type="checkbox" @change="toggleSelection(item.id)" /><span>{{ item.sku || '--' }}</span></label>
                <span class="status-pill" :class="statusTone(statusOf(item))">{{ STATUS_LABEL[statusOf(item)] }}</span>
              </div>
              <span class="grid-card__image"><CloudImage :file-id="item.listingImages?.find((img) => img.fileId)?.fileId || item.images[0]?.fileId" /></span>
              <strong>{{ previewTitle(item) }}</strong>
              <div class="grid-card__meta"><span>{{ categoryLabel(item.category) }}</span><span>{{ formatPrice(item) }}</span><span>Ref {{ refCount(item) }}</span></div>
              <div class="grid-card__actions">
                <button class="row-action" type="button" @click="editItem(item)"><Pencil :size="16" /></button>
                <button class="row-action" type="button" :disabled="statusOf(item) === 'generating'" @click="generate(item)"><Sparkles :size="16" /></button>
                <button class="row-action" type="button" @click="deleteTarget = item"><Trash2 :size="16" /></button>
              </div>
            </article>
          </div>
          <div v-if="filteredItems.length" class="table-footer">
            <div>已选择 {{ selectedIds.length }} 项</div>
            <div class="table-footer__meta">
              <span>共 {{ filteredItems.length }} 条</span>
              <label class="page-size"><select v-model.number="pageSize"><option :value="10">10 条/页</option><option :value="20">20 条/页</option><option :value="50">50 条/页</option></select><ChevronDown :size="16" /></label>
              <div class="pagination">
                <button class="page-btn" type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">上一页</button>
                <button v-for="page in pageNumbers" :key="page" class="page-btn" :class="{ active: page === currentPage }" type="button" @click="currentPage = page">{{ page }}</button>
                <button class="page-btn" type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">下一页</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 商品编辑 ============ -->
      <section v-else class="editor-stage">
        <aside class="editor-card editor-side">
          <div class="panel-head"><strong>基本信息</strong><ChevronDown :size="16" /></div>
          <div class="upload-box">
            <div v-if="form.images[0]" class="upload-preview"><CloudImage :file-id="form.images[0].fileId" /></div>
            <button class="upload-trigger" type="button" data-testid="listing-main-upload" @click="mainInput?.click()"><Upload :size="16" /> {{ form.images[0] ? '更换图片' : '上传图片' }}</button>
            <input ref="mainInput" type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="listing-main-input" @change="onMainFile" />
            <small>支持 png/jpg/jpeg/webp，建议 1:1 比例</small>
          </div>
          <label class="editor-field"><span>商品分类 <em>*</em></span><div class="select-shell"><select v-model="form.category"><option v-for="o in categoryOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select><ChevronDown :size="16" /></div></label>
          <div class="upload-box">
            <div class="panel-head panel-head--compact"><strong>辅助参考图</strong><span>{{ extraRefs.length }} 张</span></div>
            <button class="upload-trigger" type="button" @click="refInput?.click()"><Upload :size="16" /> 添加辅图</button>
            <input ref="refInput" type="file" accept="image/*" multiple hidden @change="onRefFiles" />
            <div v-if="extraRefs.length" class="reference-thumb-strip">
              <button v-for="img in extraRefs" :key="img.fileId" class="reference-thumb" type="button" @click="previewFile = img.fileId">
                <CloudImage :file-id="img.fileId" />
                <span class="reference-thumb__remove" @click.stop="removeRef(img.fileId)"><Trash2 :size="13" /></span>
              </button>
            </div>
            <small>辅图会与主图一起作为商品图的参考</small>
          </div>
          <label class="editor-field"><span>SKU <em>*</em></span><input v-model="form.sku" type="text" placeholder="例如 ER-20250601-001" data-testid="listing-sku" /></label>
          <label class="editor-field"><span>本地展示价 <em>*</em></span><input v-model="form.price" type="text" placeholder="29.90" data-testid="listing-price" /></label>
          <label class="editor-field"><span>标题语言 <em>*</em></span><div class="select-shell"><select v-model="form.language"><option v-for="o in languageOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select><ChevronDown :size="16" /></div></label>
          <div class="generate-box">
            <div class="panel-head panel-head--compact"><strong>生成素材</strong><ChevronDown :size="16" /></div>
            <button class="hero-primary-button hero-primary-button--full" type="button" :disabled="generating || statusOf(current) === 'generating' || !form.images.length" @click="generate()">
              <Sparkles :size="16" /> {{ generating || statusOf(current) === 'generating' ? '生成中...' : statusOf(current) === 'failed' ? '重新生成' : '生成素材' }}
            </button>
            <p>生成 1 条标题、5 张商品图，并自动拼接 HTML img 描述（在云端生成，可以先离开）</p>
          </div>
        </aside>

        <section class="editor-card editor-main">
          <div class="result-topbar">
            <div class="result-head"><strong>生成结果</strong><span class="status-pill" :class="statusTone(statusOf(current))">{{ STATUS_LABEL[statusOf(current)] }}</span></div>
            <span>{{ formatDate(current.generatedAt || current.updatedAt) }}</span>
          </div>
          <div class="result-block">
            <div class="result-label">商品标题</div>
            <div class="result-box"><div>{{ previewTitle(current) }}</div><span>{{ previewTitle(current).length }}/200</span></div>
          </div>
          <div class="result-block">
            <div class="result-label">商品描述 HTML</div>
            <div class="result-box result-box--multi"><div>{{ descriptionPreview }}</div><span>导出时换成图片链接</span></div>
          </div>
          <div v-if="current.generationError" class="result-block">
            <div class="result-label">生成失败原因</div>
            <div class="result-box result-box--error"><div>{{ current.generationError }}</div><button class="toolbar-button" type="button" :disabled="generating" @click="generate()"><RefreshCcw :size="16" /> 重新生成</button></div>
          </div>
          <div class="result-block">
            <div class="result-label">参考图（共 {{ refCount(form) }} 张）</div>
            <div class="result-image-strip">
              <article v-for="(img, index) in form.images" :key="img.fileId" class="result-thumb-card">
                <CloudImage :file-id="img.fileId" />
                <div class="result-thumb-card__overlay"><div class="thumb-tools"><button class="thumb-tool" type="button" @click="previewFile = img.fileId"><Eye :size="14" /></button></div></div>
                <div v-if="index === 0" class="primary-mark">主图</div>
              </article>
            </div>
          </div>
          <div class="result-block">
            <div class="result-label">商品图片（共 {{ imageCount(current) }} 张）</div>
            <div class="result-image-strip">
              <article v-for="(img, index) in current.listingImages ?? []" :key="img.jobId || index" class="result-thumb-card" :class="{ primary: index === 0 }">
                <CloudImage v-if="img.fileId" :file-id="img.fileId" />
                <span v-else class="thumb-pending"><RefreshCcw v-if="img.status !== 'failed'" :size="16" class="vg-spin" /><X v-else :size="16" /></span>
                <div class="result-thumb-card__overlay">
                  <span class="thumb-index">{{ index + 1 }}</span>
                  <div class="thumb-tools">
                    <button v-if="img.fileId" class="thumb-tool" type="button" @click="previewFile = img.fileId"><Eye :size="14" /></button>
                    <button class="thumb-tool" type="button" @click="removeListingImage(index)"><Trash2 :size="14" /></button>
                  </div>
                </div>
                <div v-if="index === 0" class="primary-mark">主图</div>
              </article>
              <button class="regenerate-tile" type="button" :disabled="generating || statusOf(current) === 'generating' || !form.images.length" @click="generate()"><Plus :size="20" /> 重新生成图片</button>
            </div>
          </div>
          <div class="editor-footer">
            <button class="toolbar-button" type="button" @click="resetForm">取消</button>
            <button class="hero-primary-button" type="button" :disabled="saving" data-testid="listing-save" @click="saveItem()">{{ saving ? '保存中...' : '保存商品' }}</button>
          </div>
        </section>

        <aside class="editor-card preview-side">
          <strong class="preview-side__title">商品预览</strong>
          <div class="preview-card">
            <span v-if="current.listingImages?.[0]?.fileId || form.images[0]" class="preview-card__image"><CloudImage :file-id="current.listingImages?.[0]?.fileId || form.images[0]?.fileId" /></span>
            <div v-else class="preview-card__placeholder">暂无商品图片</div>
            <strong>{{ previewTitle(current) }}</strong>
            <dl class="preview-meta">
              <div><dt>SKU</dt><dd>{{ form.sku || '--' }}</dd></div>
              <div><dt>本地展示价</dt><dd>{{ form.price || '--' }}</dd></div>
              <div><dt>分类</dt><dd>{{ categoryLabel(form.category) }}</dd></div>
              <div><dt>标题语言</dt><dd>{{ languageLabel(form.language) }}</dd></div>
              <div><dt>生成状态</dt><dd><span class="status-pill" :class="statusTone(statusOf(current))">{{ STATUS_LABEL[statusOf(current)] }}</span></dd></div>
              <div><dt>参考图</dt><dd>{{ refCount(form) }} 张</dd></div>
              <div><dt>更新时间</dt><dd>{{ formatDate(current.updatedAt) }}</dd></div>
            </dl>
          </div>
        </aside>
      </section>
    </section>

    <!-- 导出配置 -->
    <div v-if="exportConfigDialogOpen" class="dialog-mask" @click.self="exportConfigDialogOpen = false">
      <div class="dialog">
        <div class="dialog__head"><div><strong>导出分类配置</strong><p>提前维护 5 个分类各自的分类 ID 和产品属性，批量导出时将直接使用这里的配置。</p></div><button type="button" class="dialog__close" @click="exportConfigDialogOpen = false">×</button></div>
        <div class="dialog__body">
          <article v-for="config in exportConfigs" :key="config.category" class="export-config-card">
            <strong>{{ categoryLabel(config.category) }}</strong>
            <label class="editor-field"><span>分类 ID</span><input v-model="config.categoryId" type="text" placeholder="请输入分类 ID" /></label>
            <label class="editor-field"><span>产品属性 JSON</span><textarea v-model="config.productAttributes" rows="5" placeholder="请输入产品属性 JSON"></textarea></label>
          </article>
        </div>
        <div class="dialog__foot"><button type="button" class="toolbar-button" :disabled="exportConfigSaving" @click="exportConfigDialogOpen = false">取消</button><button type="button" class="hero-primary-button" :disabled="exportConfigSaving" @click="saveConfigs">{{ exportConfigSaving ? '保存中...' : '保存配置' }}</button></div>
      </div>
    </div>

    <!-- 删除 -->
    <div v-if="deleteTarget" class="dialog-mask" @click.self="deleteTarget = null">
      <div class="dialog dialog--small">
        <div class="dialog__head"><div><strong>删除商品</strong><p>确认删除商品“{{ deleteTarget.sku || '未命名商品' }}”吗？删除后无法恢复，请谨慎操作。</p></div><button type="button" class="dialog__close" :disabled="deleteBusy" @click="deleteTarget = null">×</button></div>
        <div class="delete-body"><span class="delete-icon"><Trash2 :size="20" /></span><div><strong>{{ deleteTarget.sku || '未命名商品' }}</strong><span>{{ previewTitle(deleteTarget) }}</span></div></div>
        <div class="dialog__foot"><button type="button" class="toolbar-button" :disabled="deleteBusy" @click="deleteTarget = null">取消</button><button type="button" class="hero-primary-button danger" :disabled="deleteBusy" @click="confirmRemoveItem">{{ deleteBusy ? '删除中...' : '确认删除' }}</button></div>
      </div>
    </div>

    <div v-if="previewFile" class="dialog-mask" @click.self="previewFile = ''">
      <div class="dialog image-preview"><button type="button" class="dialog__close" @click="previewFile = ''">×</button><CloudImage :file-id="previewFile" /></div>
    </div>
  </div>
</template>

<style scoped>
.listing-page { --line: var(--theme-border); --muted: var(--theme-text-muted); --wash: var(--theme-panel-soft); --accent: var(--vg-accent); padding: 12px 16px 40px; color: var(--theme-text); }
.listing-shell { display: flex; flex-direction: column; gap: 14px; }
.page-top { padding: 14px 6px 4px; }
.crumb-row { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.crumb-row strong { color: var(--theme-text); }
.back-link { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; color: var(--theme-text); font-weight: 700; cursor: pointer; }
.page-top__main { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 10px; }
.hero-copy h1 { margin: 0; font-size: 26px; font-weight: 800; }
.hero-copy p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.hero-ghost-button, .hero-primary-button, .toolbar-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); color: var(--theme-text); font-size: 13.5px; font-weight: 700; cursor: pointer; }
.hero-primary-button { border-color: var(--line); background: var(--theme-panel); }
.hero-primary-button--full { width: 100%; border-color: var(--accent); background: var(--accent); color: #fff; }
.editor-footer .hero-primary-button, .dialog__foot .hero-primary-button { border-color: var(--accent); background: var(--accent); color: #fff; }
.hero-primary-button.danger { border-color: #ef4444; background: #ef4444; }
.hero-ghost-button:disabled, .hero-primary-button:disabled, .toolbar-button:disabled { opacity: .5; cursor: not-allowed; }
.tab-bar { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--theme-panel); }
.tab-button { min-width: 140px; height: 40px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-size: 14px; font-weight: 700; cursor: pointer; }
.tab-button.active { background: var(--vg-accent-soft); color: var(--accent); }
.workspace-card { display: flex; flex-direction: column; gap: 14px; padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--theme-panel); }
.filter-board { display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) auto; gap: 10px; }
.field-shell { position: relative; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); }
.field-shell input, .field-shell select { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--theme-text); font-size: 14px; outline: none; appearance: none; }
.field-shell select option { background: var(--theme-panel); }
.field-shell svg { color: var(--muted); pointer-events: none; }
.field-icon { color: var(--muted); }
.stats-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.stat-card { display: flex; align-items: center; justify-content: space-between; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.stat-card span { color: var(--muted); font-size: 13px; }
.stat-card strong { display: block; margin-top: 8px; font-size: 20px; font-weight: 800; }
.stat-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; }
.stat-icon--violet { background: rgba(139, 92, 246, .22); color: #a78bfa; }
.stat-icon--green { background: rgba(16, 185, 129, .2); color: #34d399; }
.stat-icon--blue { background: rgba(59, 130, 246, .22); color: #60a5fa; }
.stat-icon--amber { background: rgba(245, 158, 11, .25); color: #fbbf24; }
.stat-icon--slate { background: rgba(148, 163, 184, .18); color: #cbd5e1; }
.table-card { border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.table-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.check-label { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.table-header__right { display: flex; gap: 8px; }
.icon-button { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--line); border-radius: 9px; background: var(--theme-panel); color: var(--muted); cursor: pointer; }
.icon-button.active { border-color: var(--accent); background: var(--vg-accent-soft); color: var(--accent); }
.empty-state { padding: 28px 16px; color: var(--accent); font-size: 13px; }
.product-table__head, .product-row { display: grid; grid-template-columns: 28px minmax(220px, 2.4fr) 1fr .8fr .7fr .8fr .9fr 1.1fr 150px; align-items: center; gap: 10px; padding: 10px 12px; }
.product-table__head { color: var(--muted); font-size: 12px; font-weight: 700; border-bottom: 1px solid var(--line); }
.product-row { border-bottom: 1px solid var(--line); font-size: 13px; }
.product-info { display: flex; align-items: center; gap: 10px; min-width: 0; cursor: pointer; }
.product-cover { width: 48px; height: 48px; flex-shrink: 0; overflow: hidden; border-radius: 8px; background: var(--theme-panel); }
.product-cover :deep(img), .grid-card__image :deep(img), .upload-preview :deep(img), .reference-thumb :deep(img), .result-thumb-card :deep(img), .preview-card__image :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.product-copy { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.product-copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.product-copy__meta { display: flex; gap: 6px; }
.mini-pill, .status-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; background: var(--theme-panel); color: var(--muted); font-size: 11.5px; font-weight: 700; width: fit-content; }
.is-done { background: rgba(16, 185, 129, .16); color: #34d399; }
.is-generating { background: rgba(59, 130, 246, .18); color: #60a5fa; }
.is-failed { background: rgba(239, 68, 68, .16); color: #f87171; }
.is-idle { background: rgba(148, 163, 184, .16); color: #cbd5e1; }
.row-actions, .grid-card__actions { display: flex; gap: 6px; }
.row-action { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: var(--theme-panel); color: var(--muted); cursor: pointer; }
.row-action:hover { border-color: var(--accent); color: var(--theme-text); }
.row-action:disabled { opacity: .4; cursor: not-allowed; }
.grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 12px; }
.grid-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--theme-panel); }
.grid-card__top { display: flex; align-items: center; justify-content: space-between; }
.grid-card__image { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 10px; background: var(--wash); }
.grid-card strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.grid-card__meta { display: flex; gap: 10px; color: var(--muted); font-size: 12px; }
.table-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; color: var(--muted); font-size: 13px; }
.table-footer__meta { display: flex; align-items: center; gap: 12px; }
.page-size { position: relative; display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; }
.page-size select { border: 0; background: transparent; color: var(--theme-text); appearance: none; }
.pagination { display: flex; gap: 6px; }
.page-btn { min-width: 32px; height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--theme-panel); color: var(--theme-text); cursor: pointer; }
.page-btn.active { border-color: var(--accent); color: var(--accent); }
.page-btn:disabled { opacity: .4; }
.editor-stage { display: grid; grid-template-columns: 300px minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
.editor-card { display: flex; flex-direction: column; gap: 14px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--theme-panel); }
.panel-head { display: flex; align-items: center; justify-content: space-between; }
.panel-head span { color: var(--muted); font-size: 12px; }
.upload-box { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px dashed var(--line); border-radius: 12px; background: var(--wash); }
.upload-box small, .generate-box p { color: var(--muted); font-size: 12px; line-height: 1.5; }
.upload-preview { aspect-ratio: 1; overflow: hidden; border-radius: 10px; }
.upload-trigger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 38px; border: 1px solid var(--line); border-radius: 9px; background: var(--theme-panel); color: var(--theme-text); font-weight: 700; cursor: pointer; }
.reference-thumb-strip { display: flex; flex-wrap: wrap; gap: 6px; }
.reference-thumb { position: relative; width: 54px; height: 54px; overflow: hidden; padding: 0; border: 1px solid var(--line); border-radius: 8px; cursor: zoom-in; }
.reference-thumb__remove { position: absolute; top: 2px; right: 2px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 5px; background: rgba(0, 0, 0, .6); color: #fff; }
.editor-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; }
.editor-field em { color: #f87171; font-style: normal; }
.editor-field input, .editor-field textarea, .select-shell select { width: 100%; min-height: 40px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--wash); color: var(--theme-text); font-size: 13px; font-weight: 500; outline: none; appearance: none; }
.select-shell { position: relative; }
.select-shell svg { position: absolute; top: 50%; right: 10px; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.generate-box { display: flex; flex-direction: column; gap: 10px; }
.result-topbar { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 12px; }
.result-head { display: flex; align-items: center; gap: 10px; color: var(--theme-text); font-size: 15px; }
.result-block { display: flex; flex-direction: column; gap: 8px; }
.result-label { color: var(--muted); font-size: 12.5px; font-weight: 700; }
.result-box { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); font-size: 13px; line-height: 1.6; }
.result-box > div { white-space: pre-wrap; overflow-wrap: anywhere; }
.result-box > span { flex-shrink: 0; color: var(--muted); font-size: 11.5px; }
.result-box--multi > div { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.result-box--error { border-color: rgba(239, 68, 68, .4); color: #f87171; }
.result-image-strip { display: flex; flex-wrap: wrap; gap: 10px; }
.result-thumb-card { position: relative; width: 104px; height: 104px; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); }
.result-thumb-card.primary { border-color: var(--accent); }
.thumb-pending { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); }
.result-thumb-card__overlay { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: space-between; padding: 6px; opacity: 0; transition: opacity .15s; background: linear-gradient(rgba(0, 0, 0, .45), transparent 60%); }
.result-thumb-card:hover .result-thumb-card__overlay { opacity: 1; }
.thumb-index { color: #fff; font-size: 12px; font-weight: 800; }
.thumb-tools { display: flex; gap: 4px; margin-left: auto; }
.thumb-tool { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: rgba(0, 0, 0, .6); color: #fff; cursor: pointer; }
.primary-mark { position: absolute; bottom: 6px; left: 6px; padding: 1px 6px; border-radius: 5px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; }
.regenerate-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 104px; height: 104px; border: 1px dashed var(--line); border-radius: 10px; background: var(--wash); color: var(--accent); font-size: 12px; font-weight: 700; cursor: pointer; }
.regenerate-tile:disabled { opacity: .5; cursor: not-allowed; }
.editor-footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 6px; border-top: 1px solid var(--line); }
.preview-side__title { font-size: 15px; }
.preview-card { display: flex; flex-direction: column; gap: 10px; }
.preview-card__image { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: var(--wash); }
.preview-card__placeholder { display: grid; place-items: center; aspect-ratio: 1; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); font-size: 13px; }
.preview-card > strong { font-size: 14px; line-height: 1.5; }
.preview-meta { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.preview-meta > div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.preview-meta dt { color: var(--muted); }
.preview-meta dd { margin: 0; text-align: right; }
.dialog-mask { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, .55); }
.dialog { display: flex; flex-direction: column; gap: 14px; width: min(880px, 100%); max-height: calc(100vh - 40px); overflow: auto; padding: 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--theme-panel); }
.dialog--small { width: min(480px, 100%); }
.dialog__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dialog__head strong { font-size: 17px; }
.dialog__head p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.dialog__close { border: 0; background: none; color: var(--muted); font-size: 22px; cursor: pointer; }
.dialog__body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.export-config-card { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.dialog__foot { display: flex; justify-content: flex-end; gap: 10px; }
.delete-body { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.delete-body > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 13px; }
.delete-body span:last-child { overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.delete-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: rgba(239, 68, 68, .16); color: #f87171; }
.image-preview { position: relative; align-items: center; width: auto; }
.image-preview .dialog__close { position: absolute; top: 6px; right: 10px; }
.image-preview :deep(img) { max-width: min(80vw, 900px); max-height: 80vh; object-fit: contain; }
@media (max-width: 1280px) { .editor-stage { grid-template-columns: 280px minmax(0, 1fr); } .preview-side { display: none; } }
@media (max-width: 1100px) { .filter-board { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .product-table__head { display: none; } .product-row { grid-template-columns: 28px minmax(0, 1fr) auto; } .product-row > span { display: none; } .editor-stage { grid-template-columns: minmax(0, 1fr); } .dialog__body { grid-template-columns: minmax(0, 1fr); } }
</style>
