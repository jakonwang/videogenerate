<script setup lang="ts">
import { thumbnailUrl } from '@/lib/localMedia'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileImage,
  FolderOpen,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-vue-next'

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
type ProductStatusFilter = 'all' | 'pending' | 'processing' | 'done' | 'failed'
type ViewMode = 'grid' | 'list'
type SortMode = 'updated_desc' | 'name_asc' | 'analysis_board_status'

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
const creating = reactive({ name: '', type: 'phone_case' as ProductType })
const actionMenuOpenId = ref('')
const promptDialogOpen = ref(false)
const promptVersions = ref<PromptVersion[]>([])
const selectedPromptVersionId = ref('')
const promptVersionName = ref('')
const promptText = ref('')
const promptBusy = ref(false)
const promptError = ref('')

const productTypeOptionsV2 = computed<Array<{ value: ProductType; label: string }>>(() =>
  (['phone_case', 'earring', 'necklace', 'ring', 'bracelet', 'clothes', 'bag', 'shoes', 'toy', 'general'] as ProductType[])
    .map((value) => ({ value, label: t(`productLibrary.types.${value}`) })),
)

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
const recentCount = computed(() =>
  list.value.filter((item) => Date.now() - Number(item.updatedAt || 0) < 7 * 24 * 3600 * 1000).length,
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
      String(item.id || '').toLowerCase().includes(q) ||
      productTypeLabelV2(item.type).toLowerCase().includes(q) ||
      productBusinessStatusLabel(item).toLowerCase().includes(q)
    const hitType = typeFilter.value === 'all' || item.type === typeFilter.value
    const hitStatus = statusFilter.value === 'all' || matchStatusFilter(item, statusFilter.value)
    return hitQuery && hitType && hitStatus
  })

  return filtered.sort((a, b) => {
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

watch([query, sortMode, typeFilter, statusFilter, pageSize], () => {
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
  return productTypeOptionsV2.value.find((item) => item.value === type)?.label ?? t('productLibrary.types.general')
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

function productBusinessStatusTone(product: Product) {
  const key = productBusinessStatusKey(product)
  if (key === 'done') return 'success'
  if (key === 'processing') return 'info'
  if (key === 'failed') return 'danger'
  return 'warning'
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

/** Map legacy chip tones to vg-pill tones. */
function chipTone(tone: string) {
  if (tone === 'success') return 'green'
  if (tone === 'info') return 'blue'
  if (tone === 'danger') return 'red'
  if (tone === 'warning') return 'amber'
  return 'gray'
}

function productAnalysisTone(product: Product) {
  return productAnalysisSummary(product) ? 'success' : 'warning'
}

async function refresh() {
  list.value = (await window.api.products.list()) as Product[]
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
  const name = creating.name.trim() || fallbackName
  const created = (await window.api.products.upsert({
    name,
    type: creating.type,
    images: [],
    remark: '',
  })) as Product
  creating.name = ''
  creating.type = 'phone_case'
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

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.product-card__menu')) return
  actionMenuOpenId.value = ''
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
        <h1>{{ t('productLibrary.title') }}</h1>
        <p>{{ t('productLibrary.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn" data-testid="product-prompt-settings" type="button" @click="openPromptDialog">
          <Settings2 :size="15" /> {{ t('productLibrary.promptSettings.button') }}
        </button>
      </div>
    </header>

    <!-- Quick create -->
    <section class="vg-card pl-create">
      <span class="pl-create__icon"><Plus :size="18" /></span>
      <input
        v-model="creating.name"
        class="vg-input pl-create__name"
        data-testid="product-create-name-input"
        type="text"
        maxlength="80"
        :placeholder="t('productLibrary.namePlaceholder')"
        @keydown.enter.prevent="createProduct"
      />
      <label class="pl-create__type">
        <span class="vg-muted">{{ t('productLibrary.productType') }}</span>
        <select v-model="creating.type" class="vg-select" data-testid="product-create-type-select">
          <option v-for="option in productTypeOptionsV2" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <button class="vg-btn vg-btn--primary" data-testid="product-create-submit" type="button" @click="createProduct">
        <Plus :size="15" /> {{ t('productLibrary.create') }}
      </button>
    </section>

    <section class="vg-stats">
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--violet"><Boxes :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('productLibrary.stats.total') }}</span><span class="vg-stat__value" data-testid="product-library-total">{{ list.length }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--amber"><Clock3 :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('productLibrary.status.pending') }}</span><span class="vg-stat__value">{{ pendingCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon"><CheckCircle2 :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('productLibrary.status.done') }}</span><span class="vg-stat__value">{{ readyCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('productLibrary.status.failed') }}</span><span class="vg-stat__value">{{ issueOnlyCount }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--blue"><RefreshCw :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('productLibrary.stats.recent') }}</span><span class="vg-stat__value">{{ recentCount }}</span></span>
      </div>
    </section>

    <section class="vg-card pl-board">
      <div class="vg-toolbar">
        <label class="vg-search pl-search">
          <Search :size="15" />
          <input v-model="query" class="vg-input" :placeholder="t('productLibrary.searchPlaceholder')" data-testid="product-library-search-input" />
        </label>
        <select v-model="typeFilter" class="vg-select" :title="t('productLibrary.productType')" data-testid="product-library-type-filter-select">
          <option value="all">{{ t('productLibrary.allTypes') }}</option>
          <option v-for="option in productTypeOptionsV2" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <span class="vg-toolbar__spacer"></span>
        <select v-model="sortMode" class="vg-select" data-testid="product-library-sort-select">
          <option value="updated_desc">{{ t('productLibrary.sort.updated') }}</option>
          <option value="name_asc">{{ t('productLibrary.sort.name') }}</option>
          <option value="analysis_board_status">{{ t('productLibrary.sort.analysis') }}</option>
        </select>
        <div class="vg-seg">
          <button type="button" class="vg-icon-btn" :class="{ 'is-active': viewMode === 'grid' }" :aria-pressed="viewMode === 'grid'" @click="viewMode = 'grid'"><Grid2X2 :size="16" /></button>
          <button type="button" class="vg-icon-btn" :class="{ 'is-active': viewMode === 'list' }" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'"><List :size="16" /></button>
        </div>
      </div>

      <div class="vg-seg vg-seg--sm pl-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.key"
          class="vg-seg__btn"
          :class="{ 'is-active': statusFilter === tab.key }"
          type="button"
          @click="statusFilter = tab.key"
        >
          {{ tab.label }} <span class="vg-count">{{ tab.count }}</span>
        </button>
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
          :data-testid="`product-library-item-${product.id}`"
        >
          <button class="pl-card__media" type="button" @click="openDetail(product.id)">
            <img
              v-if="resolveProductCoverPath(product)"
              :src="thumbnailUrl(resolveProductCoverPath(product), 320)"
              alt=""
              loading="lazy"
              decoding="async"
            />
            <FileImage v-else :size="30" />
          </button>

          <div class="pl-card__body">
            <div class="pl-card__title">
              <strong :title="product.name">{{ product.name }}</strong>
              <span class="vg-muted vg-num">ID {{ product.id.slice(0, 8) }}</span>
            </div>

            <div class="vg-row pl-card__chips">
              <span class="vg-chip">{{ productTypeLabelV2(product.type) }}</span>
              <span class="vg-pill vg-pill--dot" :class="`vg-pill--${chipTone(productBusinessStatusTone(product))}`">{{ productBusinessStatusLabel(product) }}</span>
              <span class="vg-pill" :class="`vg-pill--${chipTone(productAnalysisTone(product))}`">{{ productAnalysisStatusLabel(product) }}</span>
            </div>

            <div class="pl-card__analysis">
              <span>{{ t('productLibrary.analysisSummary') }}</span>
              <p>{{ productAnalysisSummary(product) || t('productLibrary.analysisEmpty') }}</p>
            </div>

            <div class="pl-card__meta">
              <span><FileImage :size="13" /> {{ t('productLibrary.imageCount', { count: productImageCount(product) }) }}</span>
              <span><Clock3 :size="13" /> {{ formatDateTime(product.analysisBoardUpdatedAt ?? product.canonicalSourceUpdatedAt ?? product.updatedAt) }}</span>
            </div>

            <div class="pl-card__actions">
              <button class="vg-btn vg-btn--primary vg-btn--sm" type="button" @click="openDetail(product.id)">{{ t('productLibrary.openDetail') }}</button>
              <button class="vg-btn vg-btn--sm" type="button" @click="openDetail(product.id)">{{ t('productLibrary.continue') }}</button>
              <div class="vg-menu-wrap pl-card__more">
                <button class="vg-icon-btn" type="button" :aria-label="t('productLibrary.moreActions')" @click.stop="toggleActionMenu(product.id)">
                  <MoreHorizontal :size="16" />
                </button>
                <div v-if="actionMenuOpenId === product.id" class="vg-menu vg-menu--up">
                  <button type="button" @click.stop="openDetail(product.id)">{{ t('productLibrary.openDetail') }}</button>
                  <button type="button" class="danger" @click.stop="removeProduct(product)"><Trash2 :size="14" /> {{ t('productLibrary.delete') }}</button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="vg-empty" data-testid="product-library-empty">
        <span class="vg-empty__icon"><FolderOpen :size="24" /></span>
        <h3>{{ query ? t('productLibrary.empty.noMatch') : t('productLibrary.empty.title') }}</h3>
        <p>{{ query ? t('productLibrary.empty.noMatchDesc') : t('productLibrary.empty.desc') }}</p>
        <button class="vg-btn vg-btn--primary" type="button" @click="createProduct"><Plus :size="15" /> {{ t('productLibrary.create') }}</button>
      </div>

      <footer v-if="filteredProducts.length" class="vg-pager">
        <div class="vg-pager__group">
          <span>{{ t('productLibrary.perPage') }}</span>
          <select v-model.number="pageSize" class="vg-select vg-select--sm">
            <option :value="12">12</option>
            <option :value="24">24</option>
            <option :value="48">48</option>
          </select>
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
    </section>

    <Teleport to="body">
      <div v-if="promptDialogOpen" class="vg-scope vg-backdrop" data-testid="product-prompt-dialog" @click.self="promptDialogOpen = false">
        <section class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" :aria-label="t('productLibrary.promptSettings.title')">
          <header class="vg-dialog__head">
            <div class="vg-dialog__title">
              <span class="vg-dialog__title-icon"><Settings2 :size="19" /></span>
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
.pl { width: min(1408px, 100%); margin: 0 auto; }

/* Quick create bar */
.pl-create { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; }
.pl-create__icon { width: 34px; height: 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--vg-accent-soft); color: var(--vg-accent); flex-shrink: 0; }
.pl-create__name { flex: 1 1 260px; }
.pl-create__type { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; }

/* Board */
.pl-board { display: flex; flex-direction: column; gap: 12px; }
.pl-search { flex: 1 1 280px; max-width: 420px; }
.pl-tabs { padding-bottom: 12px; border-bottom: 1px solid var(--theme-divider); }

/* Grid */
.pl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.pl-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); transition: border-color .15s, box-shadow .15s; }
.pl-card:hover { border-color: var(--vg-accent-line); box-shadow: var(--theme-shadow-float); }
.pl-card__media { display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 10; padding: 0; border: 0; border-bottom: 1px solid var(--theme-border); background: var(--theme-panel-soft); color: var(--theme-text-muted); cursor: pointer; overflow: hidden; }
.pl-card__media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s; }
.pl-card:hover .pl-card__media img { transform: scale(1.03); }
.pl-card__body { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 14px; flex: 1; min-width: 0; }
.pl-card__title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
.pl-card__title strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-card__title span { font-size: 11px; flex-shrink: 0; }
.pl-card__chips { gap: 6px; }
.pl-card__analysis { padding: 8px 10px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.pl-card__analysis span { font-size: 11px; font-weight: 600; color: var(--theme-text-muted); }
.pl-card__analysis p { margin-top: 2px; font-size: 12px; line-height: 1.5; color: var(--theme-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pl-card__meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--theme-text-muted); }
.pl-card__meta span { display: inline-flex; align-items: center; gap: 4px; }
.pl-card__actions { display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--theme-divider); }
.pl-card__more { margin-left: auto; }

/* List view */
.pl-grid--list { grid-template-columns: 1fr; gap: 8px; }
.pl-grid--list .pl-card { flex-direction: row; }
.pl-grid--list .pl-card__media { width: 168px; aspect-ratio: auto; border-bottom: 0; border-right: 1px solid var(--theme-border); flex-shrink: 0; }
.pl-grid--list .pl-card__body { flex-direction: row; flex-wrap: wrap; align-items: center; }
.pl-grid--list .pl-card__title { flex: 1 1 220px; flex-direction: column; align-items: flex-start; gap: 2px; }
.pl-grid--list .pl-card__analysis { flex: 1 1 100%; order: 5; }
.pl-grid--list .pl-card__actions { margin-top: 0; padding-top: 0; border-top: 0; }

.pl-prompt__text { min-height: 280px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
</style>
