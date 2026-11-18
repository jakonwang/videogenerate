<script setup lang="ts">
/**
 * 商品库 for the web version — same layout as the desktop ProductLibraryView: header with count and
 * create popover, status tabs, search / type / sort, grid or list view, product cards with a menu.
 * Status is about content: does this product already have finished content, is something generating.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, FileImage, FolderOpen, LayoutGrid, List, MoreHorizontal, Plus, Search, Sparkles, Trash2 } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, SYNC_PRODUCT_TYPE_LABELS, type SyncProduct, type SyncProductType } from '@shared/cloud/sync'
import CloudImage from '@/components/CloudImage.vue'
import { useGenerations } from '@/lib/generate'
import { useCloneProjects } from '@/lib/clone'
import { coverOf, useProducts, type ProductItem } from '@/lib/library'
import { deleteRecord, newId, saveRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'

type StatusKey = 'all' | 'todo' | 'running' | 'done'
const router = useRouter()
const { items: products } = useProducts()
const generations = useGenerations()
const cloneProjects = useCloneProjects()

const query = ref('')
const typeFilter = ref<'all' | SyncProductType>('all')
const sortMode = ref<'updated' | 'name' | 'content'>('updated')
const statusFilter = ref<StatusKey>('all')
const viewMode = ref<'grid' | 'list'>('grid')
const menuOpenId = ref('')
const createOpen = ref(false)
const creating = ref<{ name: string; type: SyncProductType }>({ name: '', type: 'general' })
const createInput = ref<HTMLInputElement>()
const TYPES = Object.entries(SYNC_PRODUCT_TYPE_LABELS) as [SyncProductType, string][]

try {
  const saved = localStorage.getItem('tiktokcut:web-products-view')
  if (saved === 'list' || saved === 'grid') viewMode.value = saved
} catch {
  // ignore
}
watch(viewMode, (value) => {
  try {
    localStorage.setItem('tiktokcut:web-products-view', value)
  } catch {
    // ignore
  }
})

/** Finished / running content per product (AI results + clone projects). */
const contentByProduct = computed(() => {
  const map = new Map<string, { done: number; running: number; lastAt: number }>()
  const bump = (id: string | undefined, kind: 'done' | 'running', at: number) => {
    if (!id) return
    const row = map.get(id) || { done: 0, running: 0, lastAt: 0 }
    row[kind] += 1
    row.lastAt = Math.max(row.lastAt, at)
    map.set(id, row)
  }
  for (const item of generations.value) {
    if (item.status === 'succeeded') bump(item.productId, 'done', item.createdAt)
    else if (item.status === 'queued' || item.status === 'running') bump(item.productId, 'running', item.createdAt)
  }
  for (const project of cloneProjects.value) {
    if (project.finalFileId) bump(project.productId, 'done', project.updatedAt)
    else if (project.composeStatus === 'running' || project.composeStatus === 'queued' || project.analyzeStatus === 'running') bump(project.productId, 'running', project.updatedAt)
  }
  return map
})

function statusOf(product: ProductItem): Exclude<StatusKey, 'all'> {
  const row = contentByProduct.value.get(product.id)
  if (row?.running) return 'running'
  return row?.done ? 'done' : 'todo'
}
const STATUS_LABEL: Record<Exclude<StatusKey, 'all'>, string> = { todo: '待做内容', running: '生成中', done: '已有内容' }

const tabs = computed(() => {
  const count = (key: StatusKey) => (key === 'all' ? products.value.length : products.value.filter((item) => statusOf(item) === key).length)
  return (['all', 'todo', 'running', 'done'] as const).map((key) => ({ key, label: key === 'all' ? '全部' : STATUS_LABEL[key], count: count(key) }))
})

const filtered = computed(() => {
  const word = query.value.trim().toLowerCase()
  const list = products.value.filter((item) =>
    (statusFilter.value === 'all' || statusOf(item) === statusFilter.value) &&
    (typeFilter.value === 'all' || item.type === typeFilter.value) &&
    (!word || `${item.name} ${item.remark || ''} ${item.id} ${(item.tiktokProductIds || []).join(' ')}`.toLowerCase().includes(word)),
  )
  const sorted = [...list]
  if (sortMode.value === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  else if (sortMode.value === 'content') sorted.sort((a, b) => (contentByProduct.value.get(b.id)?.done || 0) - (contentByProduct.value.get(a.id)?.done || 0))
  else sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted
})

function formatDate(at: number) {
  const d = new Date(at)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function openCreate() {
  createOpen.value = !createOpen.value
  if (createOpen.value) {
    creating.value = { name: '', type: 'general' }
    await nextTick()
    createInput.value?.focus()
  }
}

async function createProduct() {
  const name = creating.value.name.trim()
  if (!name) {
    createInput.value?.focus()
    return
  }
  const id = newId('prod')
  await saveRecord<SyncProduct>(SYNC_COLLECTIONS.products, id, { name, type: creating.value.type, remark: '', tiktokProductIds: [], images: [], createdAt: Date.now() })
  createOpen.value = false
  toast('商品已创建，上传几张商品图吧')
  void router.push(`/library/products/${id}`)
}

async function removeProduct(product: ProductItem) {
  menuOpenId.value = ''
  if (!window.confirm(`删除商品「${product.name}」？已生成的内容不会被删除。`)) return
  await deleteRecord(SYNC_COLLECTIONS.products, product.id)
  toast('已删除')
}

function onDocClick() {
  menuOpenId.value = ''
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <main class="vg-page pl" data-testid="web-products">
    <header class="pl-head">
      <div class="pl-head__text">
        <h1>商品库 <span class="pl-head__count vg-num">{{ products.length }}</span></h1>
        <p>集中管理商品图片和资料，做内容时直接选用；与电脑端、手机端自动同步。</p>
      </div>
      <div class="pl-head__actions">
        <button class="vg-btn vg-btn--ghost" type="button" @click="router.push({ path: '/producer', query: { prompt: '看看商品库里哪些商品还没有内容，帮我挑一个做一套内容' } })">
          <Sparkles :size="15" /> 让 AI 挑商品做内容
        </button>
        <div class="pl-create" @click.stop>
          <button class="vg-btn vg-btn--primary" type="button" data-testid="web-product-create" :aria-expanded="createOpen" @click="openCreate"><Plus :size="15" /> 新建商品</button>
          <form v-show="createOpen" class="pl-create__pop" @submit.prevent="createProduct">
            <label class="vg-field">
              <span class="vg-field__label">商品名称</span>
              <input ref="createInput" v-model="creating.name" class="vg-input" type="text" maxlength="80" placeholder="例如：925 银珍珠耳环" @keydown.esc="createOpen = false" />
            </label>
            <label class="vg-field">
              <span class="vg-field__label">商品类型</span>
              <select v-model="creating.type" class="vg-select">
                <option v-for="[value, label] in TYPES" :key="value" :value="value">{{ label }}</option>
              </select>
            </label>
            <button class="vg-btn vg-btn--primary vg-btn--block" type="submit">新建并上传图片 <ArrowRight :size="14" /></button>
          </form>
        </div>
      </div>
    </header>

    <div class="pl-bar">
      <nav class="pl-tabs" role="tablist">
        <button v-for="tab in tabs" :key="tab.key" class="pl-tab" :class="{ 'is-active': statusFilter === tab.key }" type="button" role="tab" :aria-selected="statusFilter === tab.key" @click="statusFilter = tab.key">
          <span v-if="tab.key !== 'all'" class="pl-dot" :class="`pl-dot--${tab.key}`"></span>
          {{ tab.label }}
          <span class="pl-tab__count vg-num">{{ tab.count }}</span>
        </button>
      </nav>
      <span class="vg-toolbar__spacer"></span>
      <label class="vg-search pl-search">
        <Search :size="14" />
        <input v-model="query" class="vg-input vg-input--sm" placeholder="搜索商品名称、备注、ID 或 TikTok 商品号" />
      </label>
      <select v-model="typeFilter" class="vg-select vg-select--sm" title="商品类型">
        <option value="all">全部类型</option>
        <option v-for="[value, label] in TYPES" :key="value" :value="value">{{ label }}</option>
      </select>
      <select v-model="sortMode" class="vg-select vg-select--sm" title="排序">
        <option value="updated">按最近更新</option>
        <option value="name">按名称</option>
        <option value="content">按内容数量</option>
      </select>
      <div class="pl-view">
        <button type="button" title="网格" :class="{ 'is-active': viewMode === 'grid' }" :aria-pressed="viewMode === 'grid'" @click="viewMode = 'grid'"><LayoutGrid :size="15" /></button>
        <button type="button" title="列表" :class="{ 'is-active': viewMode === 'list' }" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'"><List :size="15" /></button>
      </div>
    </div>

    <div v-if="filtered.length" class="pl-grid" :class="{ 'pl-grid--list': viewMode === 'list' }" data-testid="web-products-grid">
      <article
        v-for="product in filtered"
        :key="product.id"
        class="pl-card"
        :class="{ 'is-menu-open': menuOpenId === product.id }"
        tabindex="0"
        @click="router.push(`/library/products/${product.id}`)"
        @keydown.enter.self="router.push(`/library/products/${product.id}`)"
      >
        <div class="pl-card__media">
          <CloudImage v-if="coverOf(product)" :file-id="coverOf(product)" :alt="product.name" />
          <FileImage v-else :size="26" />
          <span class="pl-status" :class="`pl-status--${statusOf(product)}`"><span class="pl-dot" :class="`pl-dot--${statusOf(product)}`"></span>{{ STATUS_LABEL[statusOf(product)] }}</span>
        </div>
        <div class="pl-card__body">
          <div class="pl-card__title">
            <strong :title="product.name">{{ product.name }}</strong>
            <span class="pl-card__type">{{ SYNC_PRODUCT_TYPE_LABELS[product.type] || '通用' }}</span>
          </div>
          <p class="pl-card__summary" :class="{ 'is-empty': !product.remark }" :title="product.remark">{{ product.remark || '还没有备注，补充卖点和材质能让 AI 做得更准' }}</p>
          <div class="pl-card__foot">
            <span class="pl-card__state"><span class="pl-dot" :class="`pl-dot--${statusOf(product)}`"></span>{{ STATUS_LABEL[statusOf(product)] }}</span>
            <span class="vg-num" title="商品图"><FileImage :size="12" /> {{ (product.images || []).length }}</span>
            <span class="vg-num" title="已完成的内容"><Sparkles :size="12" /> {{ contentByProduct.get(product.id)?.done || 0 }}</span>
            <span class="vg-num">{{ formatDate(product.updatedAt) }}</span>
            <span class="pl-card__id vg-num">#{{ product.id.slice(-8) }}</span>
            <div class="vg-menu-wrap pl-card__more" @click.stop>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" aria-label="更多操作" @click="menuOpenId = menuOpenId === product.id ? '' : product.id"><MoreHorizontal :size="15" /></button>
              <div v-if="menuOpenId === product.id" class="vg-menu vg-menu--up">
                <button type="button" @click="router.push(`/library/products/${product.id}`)"><ArrowRight :size="14" /> 打开详情</button>
                <button type="button" @click="router.push({ path: '/producer', query: { prompt: `为商品「${product.name}」做一套内容：主图、图生视频和一条复刻成片` } })"><Sparkles :size="14" /> 让 AI 做一套内容</button>
                <button type="button" class="danger" @click="removeProduct(product)"><Trash2 :size="14" /> 删除</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="vg-empty pl-empty">
      <span class="vg-empty__icon"><FolderOpen :size="24" /></span>
      <h3>{{ products.length ? '没有符合条件的商品' : '暂无商品数据' }}</h3>
      <p>{{ products.length ? '换个状态、类型或关键词试试' : '创建商品并上传图片，所有内容都会挂在商品下面。' }}</p>
      <button v-if="!products.length" class="vg-btn vg-btn--primary" type="button" @click.stop="openCreate"><Plus :size="15" /> 新建商品</button>
    </div>
  </main>
</template>

<style scoped>
/* Mirrors src/renderer/src/ui/views/ProductLibraryView.vue. */
.pl { width: min(1440px, 100%); margin: 0 auto; gap: 16px; padding-top: 18px; }
.pl-head { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.pl-head__text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pl-head h1 { display: inline-flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
.pl-head__count { height: 20px; padding: 0 7px; border-radius: 6px; display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; color: var(--theme-text-secondary); background: var(--theme-panel-soft); border: 1px solid var(--theme-border); }
.pl-head p { font-size: 12.5px; color: var(--theme-text-muted); }
.pl-head__actions { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
.pl-create { position: relative; }
.pl-create__pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; width: 280px; display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: var(--vg-radius); background: var(--theme-panel); border: 1px solid var(--theme-border-control); box-shadow: var(--theme-shadow-float); }

.pl-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--theme-divider); }
.pl-tabs { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 9px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); }
.pl-tab { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); font-size: 12px; font-weight: 500; cursor: pointer; transition: color .15s, background .15s; }
.pl-tab:hover { color: var(--theme-text); }
.pl-tab.is-active { background: var(--theme-panel); color: var(--theme-text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--theme-border-control); }
.pl-tab__count { font-size: 11px; color: var(--theme-text-muted); font-weight: 500; }
.pl-tab.is-active .pl-tab__count { color: var(--vg-accent); }
.pl-search { flex: 0 1 280px; }
.pl-view { display: inline-flex; padding: 2px; border-radius: 8px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.pl-view button { width: 28px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.pl-view button:hover { color: var(--theme-text); }
.pl-view button.is-active { background: var(--theme-panel); color: var(--vg-accent); box-shadow: inset 0 0 0 1px var(--theme-border-control); }

.pl-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--vg-gray); }
.pl-dot--done { background: var(--vg-green); }
.pl-dot--running { background: var(--vg-blue); }
.pl-dot--todo { background: var(--vg-amber); }

.pl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 14px; }
.pl-card { position: relative; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); cursor: pointer; outline: none; transition: border-color .15s, box-shadow .15s; }
.pl-card:hover, .pl-card:focus-visible { border-color: var(--vg-accent-line); box-shadow: var(--theme-shadow-float); }
.pl-card.is-menu-open { z-index: 5; }
.pl-card__media { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; border-radius: calc(var(--vg-radius) - 1px) calc(var(--vg-radius) - 1px) 0 0; background: var(--theme-panel-soft); color: var(--theme-text-muted); overflow: hidden; }
.pl-card__media :deep(img) { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s ease; }
.pl-card:hover .pl-card__media :deep(img) { transform: scale(1.03); }
.pl-status { position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 500; color: #fff; background: rgb(10 12 16 / .62); backdrop-filter: blur(6px); }
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
.pl-card__foot > .pl-card__state { display: none; width: 72px; gap: 6px; color: var(--theme-text-secondary); }
.pl-card__id { opacity: 0; transition: opacity .15s; }
.pl-card:hover .pl-card__id { opacity: .8; }
.pl-card__more { margin-left: auto; }
.pl-card__more .vg-icon-btn { opacity: .55; }
.pl-card:hover .pl-card__more .vg-icon-btn, .pl-card.is-menu-open .pl-card__more .vg-icon-btn { opacity: 1; }

.pl-grid--list { grid-template-columns: 1fr; gap: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); }
.pl-grid--list .pl-card { flex-direction: row; align-items: center; gap: 14px; padding: 8px 12px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.pl-grid--list .pl-card + .pl-card { border-top: 1px solid var(--theme-divider); }
.pl-grid--list .pl-card:hover { background: var(--theme-panel-soft); }
.pl-grid--list .pl-card__media { width: 44px; height: 44px; aspect-ratio: auto; border-radius: 8px; flex-shrink: 0; }
.pl-grid--list .pl-card:hover .pl-card__media :deep(img) { transform: none; }
.pl-grid--list .pl-status { display: none; }
.pl-grid--list .pl-card__body { flex-direction: row; align-items: center; gap: 16px; padding: 0; }
.pl-grid--list .pl-card__title { flex: 0 0 220px; flex-direction: column; align-items: flex-start; gap: 1px; }
.pl-grid--list .pl-card__summary { flex: 1 1 auto; min-height: 0; -webkit-line-clamp: 1; }
.pl-grid--list .pl-card__foot { flex: 0 0 auto; margin: 0; padding: 0; border: 0; }
.pl-grid--list .pl-card__id { opacity: .8; }
.pl-grid--list .pl-card__foot > .pl-card__state { display: inline-flex; }

.pl-empty { padding: 56px 20px; border: 1px dashed var(--theme-border); border-radius: var(--vg-radius); }
</style>
