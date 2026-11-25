<script setup lang="ts">
import { thumbnailUrl } from '@/lib/localMedia'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Dna,
  FileImage,
  FolderOpen,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  Upload,
  X, Boxes
} from 'lucide-vue-next'
import type { CodeImportPreview, CodeStats } from '../../../../shared/productCodeStats'
import ProductCodeImportDialog from '../components/product/ProductCodeImportDialog.vue'
import ProductCodesDialog from '../components/product/ProductCodesDialog.vue'
import CategorySelect from '../components/product/CategorySelect.vue'
import { productCategoryLabel, productCategoryOptions } from '../../../../shared/productCategories'
import { productCodeError } from '../components/product/productCodeText'

type ProductType = string
type ProductStatusFilter = 'all' | 'pending' | 'processing' | 'done' | 'failed'
type ViewMode = 'grid' | 'list'
type SortMode = 'updated_desc' | 'sales_desc' | 'name_asc' | 'analysis_board_status'

type PromptVersion = {
  id: string
  name: string
  version: number
  prompt: string
  active: boolean
}

type ProductImageAsset = {
  id: string
  productId: string
  filePath: string
  isCover?: boolean
}

type ProductAnalysis = {
  category?: string
  summary?: string
  coreSubject?: string
}

type Product = {
  id: string
  name: string
  type: ProductType
  code?: string
  hotType?: string
  images?: ProductImageAsset[]
  coverImagePath?: string
  analysisBoardPath?: string
  analysisBoardStatus?: 'idle' | 'processing' | 'done' | 'failed'
  analysisBoardUpdatedAt?: number
  canonicalSourceStatus?: 'idle' | 'processing' | 'done' | 'failed'
  canonicalSourceUpdatedAt?: number
  productAnalysis?: ProductAnalysis
  assets?: Record<string, Array<{ filePath?: string }>>
  createdAt: number
  updatedAt: number
}

const router = useRouter()
const { t, locale } = useI18n()
const list = ref<Product[]>([])
const query = ref('')
const sortMode = ref<SortMode>('updated_desc')
const typeFilter = ref<'all' | ProductType>('all')
const statusFilter = ref<ProductStatusFilter>('all')
const viewMode = ref<ViewMode>('grid')
const currentPage = ref(1)
const pageSize = ref(12)
const creating = reactive({ name: '', code: '', type: 'general' as ProductType })
const createError = ref('')
const codesOpen = ref(false)
const codeMenuOpen = ref(false)
const codeMessage = ref('')
const importPreview = ref<CodeImportPreview | null>(null)
const hotFilter = ref('all')
const codeStats = ref(new Map<string, CodeStats>())
const statOf = (product: Product) => (product.code ? codeStats.value.get(product.code) : undefined)
const hotOf = (product: Product) => product.hotType || statOf(product)?.suggestion || ''
const hotTypes = computed(() => [...new Set(list.value.map(hotOf).filter(Boolean))])

async function loadCodeStats() {
  if (!window.api.productCodes || !list.value.some((item) => item.code)) return
  const result = await window.api.productCodes.stats().catch(() => null)
  if (result) codeStats.value = new Map(result.items.map((item) => [item.code, item]))
}
async function runCodeAction(action: () => Promise<string>) {
  codeMenuOpen.value = false
  codeMessage.value = ''
  try {
    codeMessage.value = await action()
  } catch (error) {
    codeMessage.value = error instanceof Error ? error.message : String(error)
  }
  if (codeMessage.value) window.setTimeout(() => { codeMessage.value = '' }, 6000)
}
const pickImport = () => runCodeAction(async () => {
  importPreview.value = await window.api.productCodes.importPreview()
  return ''
})
const exportSheet = () => runCodeAction(async () => {
  const result = await window.api.productCodes.exportSheet()
  if (!result.count) return t('productLibrary.sheet.nothing')
  return result.path ? t('productLibrary.sheet.exported', { count: result.count }) : ''
})
const hasCodes = Boolean(window.api.productCodes)
const actionMenuOpenId = ref('')
const createOpen = ref(false)
const createNameInput = ref<HTMLInputElement | null>(null)
const promptDialogOpen = ref(false)
const promptVersions = ref<PromptVersion[]>([])
const selectedPromptVersionId = ref('')
const promptVersionName = ref('')
const promptText = ref('')
const promptBusy = ref(false)
const promptError = ref('')

const usedTypes = computed(() => list.value.map((item) => item.type))
const productTypeOptionsV2 = computed(() => productCategoryOptions(usedTypes.value).map((value) => ({ value, label: productTypeLabelV2(value) })))

const analysisBoardStatusRank: Record<'idle' | 'processing' | 'done' | 'failed', number> = {
  done: 0,
  processing: 1,
  failed: 2,
  idle: 3,
}

const readyCount = computed(() => list.value.filter((item) => (item.analysisBoardStatus || item.canonicalSourceStatus) === 'done').length)
const processingCount = computed(() => list.value.filter((item) => (item.analysisBoardStatus || item.canonicalSourceStatus) === 'processing').length)
const issueOnlyCount = computed(() =>
  list.value.filter((item) => productImageCount(item) === 0 || (item.analysisBoardStatus || item.canonicalSourceStatus) === 'failed').length,
)
const pendingCount = computed(
  () =>
    list.value.filter((item) => productImageCount(item) > 0 && !(item.analysisBoardStatus || item.canonicalSourceStatus)).length +
    list.value.filter((item) => productImageCount(item) > 0 && (item.analysisBoardStatus || item.canonicalSourceStatus) === 'idle').length,
)
const statusTabs = computed(() => [
  { key: 'all' as ProductStatusFilter, label: t('common.all'), count: list.value.length },
  { key: 'pending' as ProductStatusFilter, label: t('productLibrary.status.pending'), count: pendingCount.value },
  { key: 'processing' as ProductStatusFilter, label: t('productLibrary.status.processing'), count: processingCount.value },
  { key: 'done' as ProductStatusFilter, label: t('productLibrary.status.done'), count: readyCount.value },
  { key: 'failed' as ProductStatusFilter, label: t('productLibrary.status.failed'), count: issueOnlyCount.value },
])

const filteredProducts = computed(() => {
  const q = query.value.trim().toLowerCase()
  const filtered = list.value.filter((item) => {
    const hitQuery =
      !q ||
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.code || '').toLowerCase().includes(q) ||
      String(item.id || '').toLowerCase().includes(q) ||
      productTypeLabelV2(item.type).toLowerCase().includes(q) ||
      productBusinessStatusLabel(item).toLowerCase().includes(q)
    const hitType = typeFilter.value === 'all' || item.type === typeFilter.value
    const hitStatus = statusFilter.value === 'all' || matchStatusFilter(item, statusFilter.value)
    const hitHot = hotFilter.value === 'all' || hotOf(item) === hotFilter.value
    return hitQuery && hitType && hitStatus && hitHot
  })

  return filtered.sort((a, b) => {
    if (sortMode.value === 'sales_desc') return (statOf(b)?.units7 || 0) - (statOf(a)?.units7 || 0) || (statOf(b)?.units30 || 0) - (statOf(a)?.units30 || 0)
    if (sortMode.value === 'name_asc') {
      return String(a.name || '').localeCompare(String(b.name || ''), locale.value)
    }
    if (sortMode.value === 'analysis_board_status') {
      const rankDiff =
        analysisBoardStatusRank[(a.analysisBoardStatus || a.canonicalSourceStatus || 'idle')] -
        analysisBoardStatusRank[(b.analysisBoardStatus || b.canonicalSourceStatus || 'idle')]
      if (rankDiff !== 0) return rankDiff
    }
    const aTime = Number(a.analysisBoardUpdatedAt ?? a.canonicalSourceUpdatedAt ?? a.updatedAt ?? a.createdAt ?? 0)
    const bTime = Number(b.analysisBoardUpdatedAt ?? b.canonicalSourceUpdatedAt ?? b.updatedAt ?? b.createdAt ?? 0)
    return bTime - aTime
  })
})

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredProducts.value.length / pageSize.value))
})

const pagedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredProducts.value.slice(start, start + pageSize.value)
})

const visiblePages = computed(() => {
  const total = totalPages.value
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1)

  let start = Math.max(1, currentPage.value - 2)
  let end = Math.min(total, start + 4)

  if (end - start < 4) {
    start = Math.max(1, end - 4)
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

watch([query, sortMode, typeFilter, hotFilter, statusFilter, pageSize], () => {
  currentPage.value = 1
})

watch(totalPages, (value) => {
  if (currentPage.value > value) currentPage.value = value
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

function productImageCount(product: Product) {
  if (Array.isArray(product.images) && product.images.length) return product.images.length
  const legacy = Object.values(product.assets ?? {}).flatMap((items) => items ?? [])
  return legacy.filter((item) => isImagePath(item?.filePath)).length
}

function productTypeLabelV2(type: ProductType) {
  return productCategoryLabel(type, locale.value)
}

function formatDateTime(ts?: number) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString(locale.value, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

function productBusinessStatusKey(product: Product): ProductStatusFilter {
  const status = product.analysisBoardStatus || product.canonicalSourceStatus
  if (productImageCount(product) === 0) return 'failed'
  if (status === 'failed') return 'failed'
  if (status === 'processing') return 'processing'
  if (status === 'done') return 'done'
  return 'pending'
}

function productBusinessStatusLabel(product: Product) {
  const key = productBusinessStatusKey(product)
  return t(`productLibrary.status.${key}`)
}

function matchStatusFilter(product: Product, filter: ProductStatusFilter) {
  if (filter === 'all') return true
  return productBusinessStatusKey(product) === filter
}

function productAnalysisSummary(product: Product) {
  return String(product.productAnalysis?.summary || product.productAnalysis?.coreSubject || '').trim()
}

function productAnalysisStatusLabel(product: Product) {
  return productAnalysisSummary(product) ? t('productLibrary.dna.done') : t('productLibrary.dna.pending')
}

function productUpdatedAt(product: Product) {
  return product.analysisBoardUpdatedAt ?? product.canonicalSourceUpdatedAt ?? product.updatedAt
}

async function refresh() {
  list.value = (await window.api.products.list()) as Product[]
  void loadCodeStats()
}

function selectPromptVersion() {
  const selected = promptVersions.value.find((item) => item.id === selectedPromptVersionId.value)
  promptVersionName.value = selected?.name || ''
  promptText.value = selected?.prompt || ''
}

async function loadPromptVersions(preferredId = '') {
  promptVersions.value = await window.api.products.listPromptVersions() as PromptVersion[]
  const selected = promptVersions.value.find((item) => item.id === preferredId)
    || promptVersions.value.find((item) => item.active)
    || promptVersions.value[0]
  selectedPromptVersionId.value = selected?.id || ''
  selectPromptVersion()
}

async function openPromptDialog() {
  promptDialogOpen.value = true
  promptError.value = ''
  promptBusy.value = true
  try {
    await loadPromptVersions()
  } catch (error: any) {
    promptError.value = String(error?.message || error)
  } finally {
    promptBusy.value = false
  }
}

async function savePromptVersion(asCopy = false) {
  promptBusy.value = true
  promptError.value = ''
  try {
    const saved = await window.api.products.savePromptVersion({
      id: asCopy ? undefined : selectedPromptVersionId.value,
      name: promptVersionName.value,
      prompt: promptText.value,
    }) as PromptVersion
    await loadPromptVersions(saved.id)
  } catch (error: any) {
    promptError.value = String(error?.message || error)
  } finally {
    promptBusy.value = false
  }
}

async function activatePromptVersion() {
  if (!selectedPromptVersionId.value) return
  promptBusy.value = true
  promptError.value = ''
  try {
    const active = await window.api.products.activatePromptVersion(selectedPromptVersionId.value) as PromptVersion
    await loadPromptVersions(active.id)
  } catch (error: any) {
    promptError.value = String(error?.message || error)
  } finally {
    promptBusy.value = false
  }
}

async function rollbackPromptVersion() {
  if (!selectedPromptVersionId.value) return
  promptBusy.value = true
  promptError.value = ''
  try {
    const active = await window.api.products.rollbackPromptVersion(selectedPromptVersionId.value) as PromptVersion
    await loadPromptVersions(active.id)
  } catch (error: any) {
    promptError.value = String(error?.message || error)
  } finally {
    promptBusy.value = false
  }
}

async function createProduct() {
  const fallbackName = `${t('productLibrary.unnamed')}_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
  const name = creating.name.trim() || creating.code.trim() || fallbackName
  createError.value = ''
  let created: Product
  try {
    created = (await window.api.products.upsert({
      name,
      type: creating.type,
      ...(creating.code.trim() ? { code: creating.code } : {}),
      images: [],
      remark: '',
    })) as Product
  } catch (error) {
    createError.value = productCodeError(error, t)
    return
  }
  creating.code = ''
  creating.name = ''
  creating.type = 'general'
  createOpen.value = false
  await refresh()
  void router.push(`/products/${created.id}`)
}

function openDetail(productId: string) {
  void router.push(`/products/${productId}`)
}

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
}

function prevPage() {
  setPage(currentPage.value - 1)
}

function nextPage() {
  setPage(currentPage.value + 1)
}

async function removeProduct(product: Product) {
  const confirmed = window.confirm(t('productLibrary.confirmDelete', { name: product.name }))
  if (!confirmed) return
  await window.api.products.remove(product.id)
  actionMenuOpenId.value = ''
  await refresh()
}

function toggleActionMenu(productId: string) {
  actionMenuOpenId.value = actionMenuOpenId.value === productId ? '' : productId
}

function openCreate() {
  createOpen.value = !createOpen.value
  if (createOpen.value) void nextTick(() => createNameInput.value?.focus())
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.pl-create')) createOpen.value = false
  if (target?.closest('.pl-card__more')) return
  actionMenuOpenId.value = ''
  codeMenuOpen.value = false
}

onMounted(() => {
  void refresh()
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<template>
  <div class="vg-scope vg-page pl" data-testid="product-library-page">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Boxes :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>
          {{ t('productLibrary.title') }}
          <span class="pl-head__count vg-num" data-testid="product-library-total">{{ list.length }}</span>
        </h1>
        <p>{{ t('productLibrary.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <div v-if="hasCodes" class="vg-menu-wrap pl-codes" @click.stop>
          <button class="vg-btn vg-btn--ghost" data-testid="product-codes-menu" type="button" :aria-expanded="codeMenuOpen" @click="codeMenuOpen = !codeMenuOpen"><Tag :size="15" /> {{ t('productLibrary.sheet.menu') }}</button>
          <div v-if="codeMenuOpen" class="vg-menu">
            <button type="button" data-testid="product-codes-open" @click="codeMenuOpen = false; codesOpen = true"><Tag :size="14" /> {{ t('productLibrary.code.check') }}</button>
            <button type="button" data-testid="product-codes-import" @click="pickImport"><Upload :size="14" /> {{ t('productLibrary.sheet.import') }}</button>
            <button type="button" data-testid="product-codes-export" @click="exportSheet"><Download :size="14" /> {{ t('productLibrary.sheet.export') }}</button>
          </div>
        </div>
        <button class="vg-btn vg-btn--ghost" data-testid="product-prompt-settings" type="button" @click="openPromptDialog">
          <SlidersHorizontal :size="15" /> {{ t('productLibrary.promptSettings.button') }}
        </button>
        <div class="pl-create">
          <button class="vg-btn vg-btn--primary" data-testid="product-create-open" type="button" :aria-expanded="createOpen" @click="openCreate">
            <Plus :size="15" /> {{ t('productLibrary.create') }}
          </button>
          <form v-show="createOpen" class="pl-create__pop" @submit.prevent="createProduct">
            <label class="vg-field">
              <span class="vg-field__label">{{ t('productLibrary.namePlaceholder') }}</span>
              <input
                ref="createNameInput"
                v-model="creating.name"
                class="vg-input"
                data-testid="product-create-name-input"
                type="text"
                maxlength="80"
                :placeholder="t('productLibrary.unnamed')"
                @keydown.esc="createOpen = false"
              />
            </label>
            <label class="vg-field">
              <span class="vg-field__label">{{ t('productLibrary.code.optional') }}</span>
              <input v-model="creating.code" class="vg-input" type="text" maxlength="80" :placeholder="t('productLibrary.code.placeholder')" data-testid="product-create-code-input" />
            </label>
            <p v-if="createError" class="pl-create__error" role="alert">{{ createError }}</p>
            <label class="vg-field">
              <span class="vg-field__label">{{ t('productLibrary.productType') }}</span>
              <CategorySelect v-model="creating.type" :used="usedTypes" data-testid="product-create-type-select" />
            </label>
            <button class="vg-btn vg-btn--primary vg-btn--block" data-testid="product-create-submit" type="submit">
              {{ t('productLibrary.create') }} <ArrowRight :size="14" />
            </button>
          </form>
        </div>
      </div>
    </header>

    <div class="pl-bar">
      <nav class="pl-tabs" role="tablist">
        <button
          v-for="tab in statusTabs"
          :key="tab.key"
          class="pl-tab"
          :class="{ 'is-active': statusFilter === tab.key }"
          type="button"
          role="tab"
          :aria-selected="statusFilter === tab.key"
          @click="statusFilter = tab.key"
        >
          <span v-if="tab.key !== 'all'" class="pl-dot" :class="`pl-dot--${tab.key}`"></span>
          {{ tab.label }}
          <span class="pl-tab__count vg-num">{{ tab.count }}</span>
        </button>
      </nav>
      <span class="vg-toolbar__spacer"></span>
      <label class="vg-search pl-search">
        <Search :size="14" />
        <input v-model="query" class="vg-input vg-input--sm" :placeholder="t('productLibrary.searchPlaceholder')" data-testid="product-library-search-input" />
      </label>
      <select v-model="typeFilter" class="vg-select vg-select--sm" :title="t('productLibrary.productType')" data-testid="product-library-type-filter-select">
        <option value="all">{{ t('productLibrary.allTypes') }}</option>
        <option v-for="option in productTypeOptionsV2" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <select v-if="hotTypes.length" v-model="hotFilter" class="vg-select vg-select--sm" :title="t('productLibrary.hot.label')" data-testid="product-library-hot-filter">
        <option value="all">{{ t('productLibrary.hot.all') }}</option>
        <option v-for="item in hotTypes" :key="item" :value="item">{{ item }}</option>
      </select>
      <select v-model="sortMode" class="vg-select vg-select--sm" data-testid="product-library-sort-select">
        <option value="updated_desc">{{ t('productLibrary.sort.updated') }}</option>
        <option v-if="codeStats.size" value="sales_desc">{{ t('productLibrary.hot.sales') }}</option>
        <option value="name_asc">{{ t('productLibrary.sort.name') }}</option>
        <option value="analysis_board_status">{{ t('productLibrary.sort.analysis') }}</option>
      </select>
      <div class="pl-view">
        <button type="button" :class="{ 'is-active': viewMode === 'grid' }" :aria-pressed="viewMode === 'grid'" @click="viewMode = 'grid'"><LayoutGrid :size="15" /></button>
        <button type="button" :class="{ 'is-active': viewMode === 'list' }" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'"><List :size="15" /></button>
      </div>
    </div>

    <div
      v-if="filteredProducts.length"
      class="pl-grid"
      :class="{ 'pl-grid--list': viewMode === 'list' }"
      data-testid="product-library-grid"
    >
      <article
        v-for="product in pagedProducts"
        :key="product.id"
        class="pl-card"
        :class="{ 'is-menu-open': actionMenuOpenId === product.id }"
        tabindex="0"
        :data-testid="`product-library-item-${product.id}`"
        @click="openDetail(product.id)"
        @keydown.enter.self="openDetail(product.id)"
      >
        <div class="pl-card__media">
          <img
            v-if="resolveProductCoverPath(product)"
            :src="thumbnailUrl(resolveProductCoverPath(product), 320)"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <FileImage v-else :size="26" />
          <span class="pl-status" :class="`pl-status--${productBusinessStatusKey(product)}`">
            <span class="pl-dot" :class="`pl-dot--${productBusinessStatusKey(product)}`"></span>{{ productBusinessStatusLabel(product) }}
          </span>
        </div>

        <div class="pl-card__body">
          <div class="pl-card__title">
            <strong :title="product.name">{{ product.name }}</strong>
            <span v-if="product.code" class="pl-card__code vg-num">{{ product.code }}</span>
            <span class="pl-card__type">{{ productTypeLabelV2(product.type) }}</span>
          </div>
          <p v-if="hotOf(product) || statOf(product)" class="pl-card__sales">
            <span v-if="hotOf(product)" class="pl-card__hot" :class="{ 'is-suggested': !product.hotType }" :title="product.hotType ? '' : statOf(product)?.reason">{{ hotOf(product) }}</span>
            <template v-if="statOf(product)"><span class="vg-num">{{ t('productLibrary.style.units7') }} {{ statOf(product)!.units7 }}</span><span v-if="statOf(product)!.stock !== undefined" class="vg-num">{{ t('productLibrary.style.stock') }} {{ statOf(product)!.stock }}</span></template>
          </p>
          <p class="pl-card__summary" :class="{ 'is-empty': !productAnalysisSummary(product) }" :title="productAnalysisSummary(product)">
            {{ productAnalysisSummary(product) || t('productLibrary.dna.pending') }}
          </p>
          <div class="pl-card__foot">
            <span class="pl-card__state"><span class="pl-dot" :class="`pl-dot--${productBusinessStatusKey(product)}`"></span>{{ productBusinessStatusLabel(product) }}</span>
            <span class="pl-card__dna" :class="{ 'is-done': productAnalysisSummary(product) }" :title="productAnalysisStatusLabel(product)"><Dna :size="13" /></span>
            <span class="vg-num"><FileImage :size="12" /> {{ productImageCount(product) }}</span>
            <span class="vg-num">{{ formatDateTime(productUpdatedAt(product)) }}</span>
            <span class="pl-card__id vg-num">#{{ product.id.slice(0, 8) }}</span>
            <div class="vg-menu-wrap pl-card__more" @click.stop>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" :aria-label="t('productLibrary.moreActions')" @click="toggleActionMenu(product.id)">
                <MoreHorizontal :size="15" />
              </button>
              <div v-if="actionMenuOpenId === product.id" class="vg-menu vg-menu--up">
                <button type="button" @click="openDetail(product.id)"><ArrowRight :size="14" /> {{ t('productLibrary.openDetail') }}</button>
                <button type="button" class="danger" @click="removeProduct(product)"><Trash2 :size="14" /> {{ t('productLibrary.delete') }}</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="vg-empty pl-empty" data-testid="product-library-empty">
      <span class="vg-empty__icon"><FolderOpen :size="24" /></span>
      <h3>{{ query ? t('productLibrary.empty.noMatch') : t('productLibrary.empty.title') }}</h3>
      <p>{{ query ? t('productLibrary.empty.noMatchDesc') : t('productLibrary.empty.desc') }}</p>
      <button class="vg-btn vg-btn--primary" type="button" @click.stop="openCreate"><Plus :size="15" /> {{ t('productLibrary.create') }}</button>
    </div>

    <footer v-if="filteredProducts.length > 12" class="vg-pager pl-pager">
      <div class="vg-pager__group">
        <select v-model.number="pageSize" class="vg-select vg-select--sm">
          <option :value="12">12</option>
          <option :value="24">24</option>
          <option :value="48">48</option>
        </select>
        <span>{{ t('productLibrary.perPage') }}</span>
      </div>
      <div class="vg-pager__group">
        <button class="vg-pg" type="button" :disabled="currentPage <= 1" :aria-label="t('productLibrary.previous')" @click="prevPage"><ChevronLeft :size="15" /></button>
        <button
          v-for="page in visiblePages"
          :key="page"
          class="vg-pg"
          :class="{ 'is-active': currentPage === page }"
          type="button"
          @click="setPage(page)"
        >
          {{ page }}
        </button>
        <button class="vg-pg" type="button" :disabled="currentPage >= totalPages" :aria-label="t('productLibrary.next')" @click="nextPage"><ChevronRight :size="15" /></button>
      </div>
    </footer>

    <p v-if="codeMessage" class="pl-toast" role="status">{{ codeMessage }}</p>
    <ProductCodeImportDialog :preview="importPreview" @close="importPreview = null" @done="refresh" />
    <ProductCodesDialog :open="codesOpen" @close="codesOpen = false" @changed="refresh" @open-product="codesOpen = false; openDetail($event)" />

    <Teleport to="body">
      <div v-if="promptDialogOpen" class="vg-scope vg-backdrop" data-testid="product-prompt-dialog" @click.self="promptDialogOpen = false">
        <section class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" :aria-label="t('productLibrary.promptSettings.title')">
          <header class="vg-dialog__head">
            <div class="vg-dialog__title">
              <span class="vg-dialog__title-icon"><SlidersHorizontal :size="19" /></span>
              <div>
                <h2>{{ t('productLibrary.promptSettings.title') }}</h2>
                <p>{{ t('productLibrary.promptSettings.desc') }}</p>
              </div>
            </div>
            <button class="vg-icon-btn" type="button" :aria-label="t('productLibrary.promptSettings.close')" @click="promptDialogOpen = false"><X :size="18" /></button>
          </header>
          <div class="vg-dialog__body">
            <div class="vg-form-grid">
              <div class="vg-field">
                <label for="pl-prompt-version">{{ t('productLibrary.promptSettings.version') }}</label>
                <select id="pl-prompt-version" v-model="selectedPromptVersionId" class="vg-select" data-testid="product-prompt-version-select" @change="selectPromptVersion">
                  <option v-for="version in promptVersions" :key="version.id" :value="version.id">
                    V{{ version.version }} - {{ version.name }}{{ version.active ? ` - ${t('productLibrary.promptSettings.active')}` : '' }}
                  </option>
                </select>
              </div>
              <div class="vg-field">
                <label for="pl-prompt-name">{{ t('productLibrary.promptSettings.name') }}</label>
                <input id="pl-prompt-name" v-model="promptVersionName" class="vg-input" data-testid="product-prompt-name-input" type="text" maxlength="120" />
              </div>
              <div class="vg-field span-all">
                <label for="pl-prompt-content">{{ t('productLibrary.promptSettings.content') }}</label>
                <textarea id="pl-prompt-content" v-model="promptText" class="vg-textarea pl-prompt__text" data-testid="product-prompt-content-input" rows="15" spellcheck="false"></textarea>
              </div>
            </div>
            <div v-if="promptError" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ promptError }}</span></div>
          </div>
          <footer class="vg-dialog__foot">
            <button class="vg-btn vg-btn--ghost" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="rollbackPromptVersion">{{ t('productLibrary.promptSettings.rollback') }}</button>
            <div class="vg-dialog__foot-actions">
              <button class="vg-btn" type="button" :disabled="promptBusy || !promptText.trim()" @click="savePromptVersion(true)">{{ t('productLibrary.promptSettings.copy') }}</button>
              <button class="vg-btn" type="button" :disabled="promptBusy || !selectedPromptVersionId || !promptText.trim()" @click="savePromptVersion(false)">{{ t('productLibrary.promptSettings.save') }}</button>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="promptBusy || !selectedPromptVersionId" @click="activatePromptVersion">{{ t('productLibrary.promptSettings.activate') }}</button>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pl-card__sales { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 12px; color: var(--theme-text-secondary); }
.pl-card__hot { flex: none; padding: 1px 7px; border-radius: 5px; font-size: 11px; font-weight: 700; color: #1b1206; background: #ffc48a; }
.pl-card__hot.is-suggested { color: var(--theme-tone-amber); background: transparent; box-shadow: inset 0 0 0 1px var(--theme-tone-amber); }
.pl-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); z-index: 2000; margin: 0; padding: 10px 18px; border-radius: 9px; font-size: 13px; background: var(--theme-panel); border: 1px solid var(--vg-accent-line); box-shadow: var(--theme-shadow-float, 0 10px 30px rgba(0, 0, 0, .35)); }
.pl-card__code { flex: none; padding: 1px 7px; border-radius: 5px; font-size: 11px; font-weight: 700; color: var(--vg-accent); background: var(--vg-accent-soft); }
.pl-create__error { margin: 0; font-size: 12px; color: var(--theme-tone-red); }
.pl { width: min(1440px, 100%); margin: 0 auto; gap: 16px; padding-top: 18px; }

/* Header */
.pl-head { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.pl-head__text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pl-head h1 { display: inline-flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
.pl-head__count { height: 20px; padding: 0 7px; border-radius: 6px; display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; color: var(--theme-text-secondary); background: var(--theme-panel-soft); border: 1px solid var(--theme-border); }
.pl-head p { font-size: 12.5px; color: var(--theme-text-muted); }
.pl-head__actions { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }

/* Create popover */
.pl-create { position: relative; }
.pl-create__pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; width: 280px; display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: var(--vg-radius); background: var(--theme-panel); border: 1px solid var(--theme-border-control); box-shadow: var(--theme-shadow-float); }

/* Filter bar */
.pl-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--theme-divider); }
.pl-tabs { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 9px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); }
.pl-tab { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); font-size: 12px; font-weight: 500; cursor: pointer; transition: color .15s, background .15s; }
.pl-tab:hover { color: var(--theme-text); }
.pl-tab.is-active { background: var(--theme-panel); color: var(--theme-text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--theme-border-control); }
.pl-tab__count { font-size: 11px; color: var(--theme-text-muted); font-weight: 500; }
.pl-tab.is-active .pl-tab__count { color: var(--vg-accent); }
.pl-search { flex: 0 1 260px; }
.pl-view { display: inline-flex; padding: 2px; border-radius: 8px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.pl-view button { width: 28px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.pl-view button:hover { color: var(--theme-text); }
.pl-view button.is-active { background: var(--theme-panel); color: var(--vg-accent); box-shadow: inset 0 0 0 1px var(--theme-border-control); }

/* Status dots */
.pl-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--vg-gray); }
.pl-dot--done { background: var(--vg-green); }
.pl-dot--processing { background: var(--vg-blue); }
.pl-dot--pending { background: var(--vg-amber); }
.pl-dot--failed { background: var(--vg-red); }

/* Grid */
.pl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 14px; }
.pl-card { position: relative; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); cursor: pointer; outline: none; transition: border-color .15s, box-shadow .15s; }
.pl-card:hover, .pl-card:focus-visible { border-color: var(--vg-accent-line); box-shadow: var(--theme-shadow-float); }
.pl-card.is-menu-open { z-index: 5; }
.pl-card__media { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; border-radius: calc(var(--vg-radius) - 1px) calc(var(--vg-radius) - 1px) 0 0; background: var(--theme-panel-soft); color: var(--theme-text-muted); overflow: hidden; }
.pl-card__media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s ease; }
.pl-card:hover .pl-card__media img { transform: scale(1.03); }
.pl-status { position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 500; color: #fff; background: rgb(10 12 16 / .62); backdrop-filter: blur(6px); }
/* "Done" is the normal state: only surface it on hover so problems stand out. */
.pl-status--done { opacity: 0; transition: opacity .15s; }
.pl-card:hover .pl-status--done { opacity: 1; }

.pl-card__body { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px 8px; flex: 1; min-width: 0; }
.pl-card__title { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.pl-card__title strong { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-card__type { flex-shrink: 0; font-size: 11px; color: var(--theme-text-muted); }
.pl-card__summary { font-size: 12px; line-height: 1.5; color: var(--theme-text-secondary); min-height: 36px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pl-card__summary.is-empty { color: var(--theme-text-muted); }
.pl-card__foot { display: flex; align-items: center; gap: 10px; margin-top: auto; padding-top: 7px; border-top: 1px solid var(--theme-divider); font-size: 11px; color: var(--theme-text-muted); }
.pl-card__foot > span { display: inline-flex; align-items: center; gap: 3px; }
.pl-card__foot > .pl-card__state { display: none; width: 64px; gap: 6px; color: var(--theme-text-secondary); }
.pl-card__dna { opacity: .5; }
.pl-card__dna.is-done { color: var(--vg-accent); opacity: 1; }
.pl-card__id { opacity: 0; transition: opacity .15s; }
.pl-card:hover .pl-card__id { opacity: .8; }
.pl-card__more { margin-left: auto; }
.pl-card__more .vg-icon-btn { opacity: .55; }
.pl-card:hover .pl-card__more .vg-icon-btn, .pl-card.is-menu-open .pl-card__more .vg-icon-btn { opacity: 1; }

/* List view */
.pl-grid--list { grid-template-columns: 1fr; gap: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); }
.pl-grid--list .pl-card { flex-direction: row; align-items: center; gap: 14px; padding: 8px 12px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.pl-grid--list .pl-card + .pl-card { border-top: 1px solid var(--theme-divider); }
.pl-grid--list .pl-card:hover { background: var(--theme-panel-soft); }
.pl-grid--list .pl-card:first-child { border-radius: var(--vg-radius) var(--vg-radius) 0 0; }
.pl-grid--list .pl-card:last-child { border-radius: 0 0 var(--vg-radius) var(--vg-radius); }
.pl-grid--list .pl-card__media { width: 44px; height: 44px; aspect-ratio: auto; border-radius: 8px; flex-shrink: 0; }
.pl-grid--list .pl-card:hover .pl-card__media img { transform: none; }
.pl-grid--list .pl-status { display: none; }
.pl-grid--list .pl-card__body { flex-direction: row; align-items: center; gap: 16px; padding: 0; }
.pl-grid--list .pl-card__title { flex: 0 0 200px; flex-direction: column; align-items: flex-start; gap: 1px; }
.pl-grid--list .pl-card__summary { flex: 1 1 auto; min-height: 0; -webkit-line-clamp: 1; }
.pl-grid--list .pl-card__foot { flex: 0 0 auto; margin: 0; padding: 0; border: 0; }
.pl-grid--list .pl-card__id { opacity: .8; }
.pl-grid--list .pl-card__foot > .pl-card__state { display: inline-flex; }

.pl-pager { padding-top: 4px; }
.pl-empty { padding: 56px 20px; border: 1px dashed var(--theme-border); border-radius: var(--vg-radius); }
.pl-prompt__text { min-height: 280px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }

@media (max-width: 900px) {
  .pl-search { flex: 1 1 100%; order: 10; }
  .pl-grid--list .pl-card__title { flex-basis: 140px; }
  .pl-grid--list .pl-card__summary { display: none; }
}
</style>
