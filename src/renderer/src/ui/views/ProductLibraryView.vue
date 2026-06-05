<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileImage,
  FolderOpen,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-vue-next'
import UiChip from '../components/UiChip.vue'

type ProductType = 'phone_case' | 'earring'
type ProductStatusFilter = 'all' | 'pending' | 'processing' | 'done' | 'failed'
type ViewMode = 'grid' | 'list'
type SortMode = 'updated_desc' | 'name_asc' | 'analysis_board_status'

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
const list = ref<Product[]>([])
const query = ref('')
const sortMode = ref<SortMode>('updated_desc')
const typeFilter = ref<'all' | ProductType>('all')
const statusFilter = ref<ProductStatusFilter>('all')
const viewMode = ref<ViewMode>('grid')
const creating = reactive({ name: '', type: 'phone_case' as ProductType })
const actionMenuOpenId = ref('')

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
  { key: 'all' as ProductStatusFilter, label: '全部', count: list.value.length },
  { key: 'pending' as ProductStatusFilter, label: '待处理', count: pendingCount.value },
  { key: 'processing' as ProductStatusFilter, label: '生成中', count: processingCount.value },
  { key: 'done' as ProductStatusFilter, label: '已完成', count: readyCount.value },
  { key: 'failed' as ProductStatusFilter, label: '异常', count: issueOnlyCount.value },
])

const filteredProducts = computed(() => {
  const q = query.value.trim().toLowerCase()
  const filtered = list.value.filter((item) => {
    const hitQuery =
      !q ||
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.id || '').toLowerCase().includes(q) ||
      productTypeLabel(item.type).toLowerCase().includes(q) ||
      productBusinessStatusLabel(item).toLowerCase().includes(q)
    const hitType = typeFilter.value === 'all' || item.type === typeFilter.value
    const hitStatus = statusFilter.value === 'all' || matchStatusFilter(item, statusFilter.value)
    return hitQuery && hitType && hitStatus
  })

  return filtered.sort((a, b) => {
    if (sortMode.value === 'name_asc') {
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
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

function productTypeLabel(type: ProductType) {
  return type === 'earring' ? '耳环' : '手机壳'
}

function formatDateTime(ts?: number) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString('zh-CN', {
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
  if (key === 'done') return '已完成'
  if (key === 'processing') return '生成中'
  if (key === 'failed') return '异常'
  return '待处理'
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
  return productAnalysisSummary(product) ? 'DNA 已生成' : 'DNA 未生成'
}

function productAnalysisTone(product: Product) {
  return productAnalysisSummary(product) ? 'success' : 'warning'
}

async function refresh() {
  list.value = (await window.api.products.list()) as Product[]
}

async function createProduct() {
  const name = creating.name.trim() || `未命名商品_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
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

async function removeProduct(product: Product) {
  const confirmed = window.confirm(`确认删除商品「${product.name}」吗？`)
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
  <div class="products-page" data-testid="product-library-page">
    <section class="products-shell">
      <header class="products-hero">
        <div class="products-hero__copy">
          <h1>商品库</h1>
          <p>集中管理商品图片、分析画板与基础资料，保持后续生成链路素材一致。</p>
        </div>
        <div class="products-create-card">
          <div class="products-create-card__fields">
            <input
              v-model="creating.name"
              class="products-create-card__input"
              data-testid="product-create-name-input"
              type="text"
              maxlength="80"
              placeholder="输入商品名称"
              @keydown.enter.prevent="createProduct"
            />
            <label class="products-create-card__type">
              <span>商品类型</span>
              <select v-model="creating.type" data-testid="product-create-type-select">
                <option value="phone_case">手机壳</option>
                <option value="earring">耳饰</option>
              </select>
              <ChevronDown class="products-create-card__icon h-4 w-4" />
            </label>
          </div>
          <button class="products-hero__create" data-testid="product-create-submit" type="button" @click="createProduct">
            <Plus class="h-4 w-4" />
            <span>新建商品</span>
          </button>
        </div>
      </header>

      <section class="stats-grid">
        <article class="stat-card">
          <div class="stat-card__icon stat-card__icon--purple"><Boxes class="h-5 w-5" /></div>
          <div class="stat-card__body">
            <span>商品总数</span>
            <strong data-testid="product-library-total">{{ list.length }}</strong>
            <small>全部商品</small>
          </div>
        </article>
        <article class="stat-card">
          <div class="stat-card__icon stat-card__icon--amber"><Clock3 class="h-5 w-5" /></div>
          <div class="stat-card__body">
            <span>待处理</span>
            <strong>{{ pendingCount }}</strong>
            <small>待生成或处理中</small>
          </div>
        </article>
        <article class="stat-card">
          <div class="stat-card__icon stat-card__icon--green"><CheckCircle2 class="h-5 w-5" /></div>
          <div class="stat-card__body">
            <span>已完成</span>
            <strong>{{ readyCount }}</strong>
            <small>生成完成</small>
          </div>
        </article>
        <article class="stat-card">
          <div class="stat-card__icon stat-card__icon--red"><Boxes class="h-5 w-5" /></div>
          <div class="stat-card__body">
            <span>异常</span>
            <strong>{{ issueOnlyCount }}</strong>
            <small>生成失败或异常</small>
          </div>
        </article>
        <article class="stat-card">
          <div class="stat-card__icon stat-card__icon--blue"><RefreshCw class="h-5 w-5" /></div>
          <div class="stat-card__body">
            <span>最近更新</span>
            <strong>{{ recentCount }}</strong>
            <small>7 天内有编辑行为的商品</small>
          </div>
        </article>
      </section>

      <section class="board-card">
        <div class="filters-row">
          <div class="search-field">
            <Search class="h-4 w-4" />
            <input
              v-model="query"
              class="search-field__input"
              placeholder="搜索商品名称、ID、类型或状态"
              data-testid="product-library-search-input"
            />
          </div>

          <label class="select-field">
            <span>商品类型</span>
            <select v-model="typeFilter" data-testid="product-library-type-filter-select">
              <option value="all">全部类型</option>
              <option value="phone_case">手机壳</option>
              <option value="earring">耳环</option>
            </select>
            <ChevronDown class="select-field__icon h-4 w-4" />
          </label>

          <label class="select-field">
            <span>状态</span>
            <select v-model="statusFilter">
              <option value="all">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processing">生成中</option>
              <option value="done">已完成</option>
              <option value="failed">异常</option>
            </select>
            <ChevronDown class="select-field__icon h-4 w-4" />
          </label>

          <button class="filter-button" type="button">
            <SlidersHorizontal class="h-4 w-4" />
            <span>筛选</span>
          </button>

          <div class="toolbar-right">
            <div class="view-toggle">
              <button
                type="button"
                class="view-toggle__button"
                :class="{ 'view-toggle__button--active': viewMode === 'grid' }"
                @click="viewMode = 'grid'"
              >
                <Grid2X2 class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="view-toggle__button"
                :class="{ 'view-toggle__button--active': viewMode === 'list' }"
                @click="viewMode = 'list'"
              >
                <List class="h-4 w-4" />
              </button>
            </div>

            <label class="sort-field">
              <select v-model="sortMode" data-testid="product-library-sort-select">
                <option value="updated_desc">按最近更新</option>
                <option value="name_asc">按商品名称</option>
                <option value="analysis_board_status">按分析画板状态</option>
              </select>
              <ChevronDown class="sort-field__icon h-4 w-4" />
            </label>
          </div>
        </div>

        <div class="tabs-row">
          <button
            v-for="tab in statusTabs"
            :key="tab.key"
            class="tab-chip"
            :class="{ 'tab-chip--active': statusFilter === tab.key }"
            type="button"
            @click="statusFilter = tab.key"
          >
            <span>{{ tab.label }}</span>
            <em>{{ tab.count }}</em>
          </button>
        </div>

        <div
          v-if="filteredProducts.length"
          class="products-grid"
          :class="{ 'products-grid--list': viewMode === 'list' }"
          data-testid="product-library-grid"
        >
          <article
            v-for="product in filteredProducts"
            :key="product.id"
            class="product-card"
            :data-testid="`product-library-item-${product.id}`"
          >
            <button class="product-card__preview" type="button" @click="openDetail(product.id)">
              <img
                v-if="resolveProductCoverPath(product)"
                :src="toFileUrl(resolveProductCoverPath(product))"
                class="product-card__image"
              />
              <div v-else class="product-card__empty">
                <FileImage class="h-8 w-8" />
              </div>
            </button>

            <div class="product-card__body">
              <div class="product-card__title-wrap">
                <strong class="product-card__title">{{ product.name }}</strong>
                <span class="product-card__id">ID: {{ product.id.slice(0, 8) }}</span>
              </div>

              <div class="product-card__chips">
                <UiChip tone="neutral">{{ productTypeLabel(product.type) }}</UiChip>
                <UiChip :tone="productBusinessStatusTone(product)">{{ productBusinessStatusLabel(product) }}</UiChip>
                <UiChip :tone="productAnalysisTone(product)">{{ productAnalysisStatusLabel(product) }}</UiChip>
              </div>

              <div class="product-card__analysis">
                <span>联合商品分析</span>
                <p>{{ productAnalysisSummary(product) || '标准图与多角度图尚未生成，完成商品建模后会在这里显示 Product DNA 摘要。' }}</p>
              </div>

              <div class="product-card__meta">
                <span><FileImage class="h-3.5 w-3.5" /> {{ productImageCount(product) }} 张图片</span>
                <span><Clock3 class="h-3.5 w-3.5" /> {{ formatDateTime(product.analysisBoardUpdatedAt ?? product.canonicalSourceUpdatedAt ?? product.updatedAt) }}</span>
              </div>

              <div class="product-card__actions">
                <button class="product-card__primary" type="button" @click="openDetail(product.id)">进入详情</button>
                <button class="product-card__secondary" type="button" @click="openDetail(product.id)">生成</button>
                <div class="product-card__menu">
                  <button class="product-card__ghost" type="button" aria-label="更多操作" @click.stop="toggleActionMenu(product.id)">
                    <MoreHorizontal class="h-4 w-4" />
                  </button>
                  <div v-if="actionMenuOpenId === product.id" class="product-card__menu-panel">
                    <button type="button" @click.stop="openDetail(product.id)">进入详情</button>
                    <button type="button" class="is-danger" @click.stop="removeProduct(product)">
                      <Trash2 class="h-4 w-4" />
                      <span>删除商品</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-else class="products-empty" data-testid="product-library-empty">
          <div class="products-empty__icon"><FolderOpen class="h-8 w-8" /></div>
          <div class="products-empty__copy">
            <strong>{{ query ? '没有匹配的商品数据' : '暂无商品数据' }}</strong>
            <p>{{ query ? '可以调整搜索词或筛选条件后重试。' : '创建商品并上传图片，开始进入商品详情维护。' }}</p>
          </div>
          <button class="products-empty__create" type="button" @click="createProduct">
            <Plus class="h-4 w-4" />
            <span>新建商品</span>
          </button>
        </div>

        <footer class="pagination-row">
          <div class="pagination-nav">
            <button class="pagination-button" type="button">‹</button>
            <button class="pagination-button pagination-button--active" type="button">1</button>
            <button class="pagination-button" type="button">2</button>
            <button class="pagination-button" type="button">›</button>
          </div>
          <button class="page-size-button" type="button">
            <span>12 条 / 页</span>
            <ChevronDown class="h-4 w-4" />
          </button>
        </footer>
      </section>

    </section>
  </div>
</template>

<style scoped>
.products-page {
  display: grid;
  gap: 14px;
  padding: 4px 6px 20px;
}

.products-shell {
  display: grid;
  gap: 16px;
  border: 1px solid rgba(111, 130, 193, 0.14);
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(95, 83, 190, 0.1), transparent 28%),
    rgba(13, 20, 38, 0.96);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 20px 48px rgba(2, 6, 20, 0.28);
  padding: 14px;
}

.products-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.products-hero__copy {
  display: grid;
  gap: 6px;
}

.products-hero__copy h1 {
  margin: 0;
  color: #ffffff;
  font-size: 26px;
  line-height: 1.04;
  font-weight: 900;
}

.products-hero__copy p {
  margin: 0;
  color: #99abd4;
  font-size: 13px;
  line-height: 1.4;
}

.products-create-card {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  min-width: 520px;
}

.products-create-card__fields {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 148px;
  gap: 10px;
  flex: 1 1 auto;
}

.products-create-card__input,
.products-create-card__type select {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(123, 142, 201, 0.16);
  border-radius: 14px;
  background: rgba(18, 25, 45, 0.94);
  padding: 0 14px;
  color: #eef3ff;
  font-size: 13px;
  outline: none;
}

.products-create-card__input::placeholder {
  color: #7f93bf;
}

.products-create-card__type {
  position: relative;
  display: grid;
  gap: 4px;
}

.products-create-card__type span {
  color: #9cb0da;
  font-size: 10px;
  font-weight: 700;
}

.products-create-card__type select {
  appearance: none;
  padding-right: 38px;
}

.products-create-card__icon {
  position: absolute;
  right: 14px;
  bottom: 11px;
  color: #8ea4d7;
  pointer-events: none;
}

.products-hero__create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 168px;
  min-height: 42px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #795dff, #9b6cff);
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  box-shadow: 0 14px 34px rgba(90, 63, 255, 0.28);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.stat-card,
.board-card,
.product-card,
.products-empty,
.pagination-row {
  border: 1px solid rgba(111, 130, 193, 0.14);
  background: rgba(18, 25, 45, 0.94);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 82px;
  padding: 14px 16px;
  border-radius: 16px;
}

.stat-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.stat-card__icon--purple {
  background: rgba(103, 79, 255, 0.14);
  color: #896fff;
}

.stat-card__icon--amber {
  background: rgba(255, 181, 64, 0.14);
  color: #ffbc45;
}

.stat-card__icon--green {
  background: rgba(54, 212, 118, 0.14);
  color: #41d87a;
}

.stat-card__icon--red {
  background: rgba(255, 100, 100, 0.14);
  color: #ff7474;
}

.stat-card__icon--blue {
  background: rgba(70, 125, 255, 0.14);
  color: #5e96ff;
}

.stat-card__body {
  display: grid;
  gap: 3px;
}

.stat-card__body span,
.stat-card__body small {
  color: #99abd4;
  font-size: 11px;
  line-height: 1.2;
}

.stat-card__body strong {
  color: #ffffff;
  font-size: 26px;
  line-height: 1;
  font-weight: 900;
}

.board-card {
  display: grid;
  gap: 16px;
  border-radius: 20px;
  padding: 14px;
}

.filters-row {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) 216px 216px 110px minmax(0, 292px);
  gap: 12px;
  align-items: end;
}

.search-field,
.select-field,
.filter-button,
.sort-field,
.view-toggle,
.pagination-button,
.page-size-button,
.product-card__primary,
.product-card__secondary,
.product-card__ghost,
.products-empty__create {
  border: 1px solid rgba(123, 142, 201, 0.16);
  background: rgba(15, 22, 41, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 14px;
  color: #93a6d0;
}

.search-field__input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  color: #ffffff;
  font-size: 14px;
}

.search-field__input::placeholder {
  color: #7c8eb8;
}

.select-field,
.sort-field {
  position: relative;
  display: grid;
  align-content: center;
  gap: 2px;
  min-height: 46px;
  padding: 6px 14px;
  border-radius: 14px;
}

.select-field span {
  color: #93a6d0;
  font-size: 11px;
}

.select-field select,
.sort-field select {
  width: 100%;
  appearance: none;
  border: 0;
  outline: none;
  background: transparent;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
}

.select-field__icon,
.sort-field__icon {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #90a4cf;
  pointer-events: none;
}

.filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  border-radius: 14px;
  color: #eef2ff;
  font-size: 14px;
  font-weight: 700;
}

.toolbar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.view-toggle {
  display: inline-flex;
  align-items: center;
  padding: 4px;
  border-radius: 14px;
}

.view-toggle__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #9cb0da;
}

.view-toggle__button--active {
  background: linear-gradient(135deg, #6d52ff, #8d66ff);
  color: #ffffff;
}

.tabs-row {
  display: flex;
  align-items: center;
  gap: 26px;
  padding: 2px 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #b1bddd;
  font-size: 14px;
  font-weight: 700;
}

.tab-chip em {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #d9e2ff;
  font-size: 12px;
  font-style: normal;
}

.tab-chip--active {
  color: #9d80ff;
}

.tab-chip--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -15px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #7c5cff, #9d72ff);
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.products-grid--list {
  grid-template-columns: 1fr;
}

.product-card {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 14px;
  border-radius: 18px;
  padding: 10px;
}

.product-card__preview {
  width: 130px;
  height: 118px;
  border: 0;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.product-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-card__empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #8fa2cc;
}

.product-card__body {
  display: grid;
  gap: 10px;
  min-width: 0;
  align-content: start;
}

.product-card__title-wrap {
  display: grid;
  gap: 6px;
}

.product-card__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  color: #ffffff;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 800;
}

.product-card__id {
  color: #9eb1db;
  font-size: 12px;
}

.product-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.product-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #b8c6e5;
  font-size: 12px;
}

.product-card__analysis {
  display: grid;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid rgba(123, 142, 201, 0.12);
  border-radius: 12px;
  background: rgba(13, 20, 37, 0.72);
}

.product-card__analysis span {
  color: #93a6d0;
  font-size: 11px;
}

.product-card__analysis p {
  margin: 0;
  color: #e8efff;
  font-size: 12px;
  line-height: 1.55;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.product-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.product-card__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 46px;
  gap: 8px;
}

.product-card__menu {
  position: relative;
}

.product-card__primary,
.product-card__secondary,
.product-card__ghost,
.products-empty__create,
.pagination-button,
.page-size-button {
  min-height: 40px;
  border-radius: 12px;
  color: #eef2ff;
  font-size: 13px;
  font-weight: 700;
}

.product-card__primary,
.products-empty__create,
.pagination-button--active {
  border-color: transparent;
  background: linear-gradient(135deg, #6d52ff, #8d66ff);
  color: #ffffff;
}

.product-card__menu-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 20;
  display: grid;
  gap: 4px;
  min-width: 138px;
  padding: 6px;
  border: 1px solid rgba(123, 142, 201, 0.18);
  border-radius: 14px;
  background: rgba(13, 20, 37, 0.98);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
}

.product-card__menu-panel button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  padding: 0 10px;
  color: #edf2ff;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
}

.product-card__menu-panel button.is-danger {
  color: #ff9999;
}

.products-empty {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 42px 20px;
  border-radius: 18px;
}

.products-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 70px;
  height: 70px;
  border-radius: 999px;
  background: rgba(103, 79, 255, 0.1);
  color: #9075ff;
}

.products-empty__copy {
  display: grid;
  gap: 6px;
  text-align: center;
}

.products-empty__copy strong {
  color: #ffffff;
  font-size: 20px;
  font-weight: 800;
}

.products-empty__copy p {
  margin: 0;
  color: #99abd4;
  font-size: 13px;
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  border-radius: 18px;
  padding: 14px 18px 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.pagination-nav {
  display: inline-flex;
  gap: 8px;
}

.pagination-button {
  min-width: 40px;
}

.page-size-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

.products-create-draft {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 1600px) {
  .products-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1360px) {
  .filters-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar-right {
    justify-content: flex-start;
  }

  .products-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .products-hero,
  .filters-row,
  .toolbar-right,
  .tabs-row,
  .stats-grid,
  .products-grid {
    grid-template-columns: 1fr;
    display: grid;
  }

  .product-card {
    grid-template-columns: 1fr;
  }

  .product-card__preview {
    width: 100%;
    height: 220px;
  }
}
</style>
