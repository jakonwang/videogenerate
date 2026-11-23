<script setup lang="ts">
import { useInWebShell } from '@/lib/layout'
import { isWeb } from '@/lib/platform'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Boxes, Plus, Search, Users } from 'lucide-vue-next'
import { SYNC_PRODUCT_TYPE_LABELS, type SyncProductType } from '@shared/cloud/sync'
import CloudImage from '@/components/CloudImage.vue'
import PageHeader from '@/components/PageHeader.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import { coverOf, relativeTime, useModels, useProducts } from '@/lib/library'

const route = useRoute()
const router = useRouter()
const inWebShell = useInWebShell()
const tab = ref<'products' | 'models'>(route.query.tab === 'models' ? 'models' : 'products')
// Sidebar links switch tabs on the same page (/library?tab=…): follow the URL.
watch(() => route.query.tab, (value) => {
  tab.value = value === 'models' ? 'models' : 'products'
})
watch(tab, (value) => router.replace({ query: { tab: value } }))

const { items: products, loading: productsLoading } = useProducts()
const { items: models, loading: modelsLoading } = useModels()
const keyword = ref('')
const typeFilter = ref<SyncProductType | 'all'>('all')

const productTypes = computed(() => {
  const present = new Set(products.value.map((p) => p.type))
  return (Object.keys(SYNC_PRODUCT_TYPE_LABELS) as SyncProductType[]).filter((type) => present.has(type))
})
const filteredProducts = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return products.value.filter((p) => (typeFilter.value === 'all' || p.type === typeFilter.value) && (!k || p.name.toLowerCase().includes(k) || (p.remark || '').toLowerCase().includes(k)))
})
const filteredModels = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return models.value.filter((m) => !k || m.name.toLowerCase().includes(k) || (m.tags || []).some((t) => t.toLowerCase().includes(k)))
})
const loading = computed(() => (tab.value === 'products' ? productsLoading.value : modelsLoading.value))

function create() {
  router.push(tab.value === 'products' ? '/library/products/new' : '/library/models/new')
}
</script>

<template>
  <!-- Web: never shown (the router sends /library to the desktop 商品库 / 模特库 pages) -->
  <template v-if="!inWebShell">
  <PageHeader title="素材库" />
  <main class="m-page">
    <div class="seg" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'products'" :class="{ 'is-active': tab === 'products' }" @click="tab = 'products'">
        商品库 <small>{{ products.length }}</small>
      </button>
      <button type="button" role="tab" :aria-selected="tab === 'models'" :class="{ 'is-active': tab === 'models' }" @click="tab = 'models'">
        模特库 <small>{{ models.length }}</small>
      </button>
    </div>

    <label class="m-search">
      <Search :size="18" />
      <input v-model="keyword" type="search" :placeholder="tab === 'products' ? '搜索商品名称或备注' : '搜索模特名称或标签'" />
    </label>
    <div v-if="tab === 'products' && productTypes.length > 1" class="m-chips">
      <button type="button" class="m-chip" :class="{ 'is-active': typeFilter === 'all' }" @click="typeFilter = 'all'">全部</button>
      <button v-for="type in productTypes" :key="type" type="button" class="m-chip" :class="{ 'is-active': typeFilter === type }" @click="typeFilter = type">
        {{ SYNC_PRODUCT_TYPE_LABELS[type] }}
      </button>
    </div>
    <div class="sync-line"><SyncStatus /></div>

    <template v-if="!loading">
      <div v-if="tab === 'products' && filteredProducts.length" class="cards">
        <button v-for="item in filteredProducts" :key="item.id" type="button" class="card" @click="router.push(`/library/products/${item.id}`)">
          <span class="card__img"><CloudImage :file-id="coverOf(item)" :alt="item.name" /><span v-if="item.images.length > 1" class="card__count">{{ item.images.length }}</span></span>
          <span class="card__body">
            <span class="card__name">{{ item.name }}</span>
            <span class="card__meta"><span class="m-tag">{{ SYNC_PRODUCT_TYPE_LABELS[item.type] || '通用' }}</span><span>{{ item.pending ? '待同步' : relativeTime(item.updatedAt) }}</span></span>
          </span>
        </button>
      </div>
      <div v-else-if="tab === 'models' && filteredModels.length" class="cards">
        <button v-for="item in filteredModels" :key="item.id" type="button" class="card" @click="router.push(`/library/models/${item.id}`)">
          <span class="card__img card__img--tall"><CloudImage :file-id="coverOf(item)" :alt="item.name" /></span>
          <span class="card__body">
            <span class="card__name">{{ item.name }}</span>
            <span class="card__meta"><span>{{ [item.gender, item.ageRange].filter(Boolean).join(' · ') || '未填写' }}</span><span>{{ item.pending ? '待同步' : '' }}</span></span>
          </span>
        </button>
      </div>
      <div v-else class="m-empty">
        <span class="m-empty__icon"><Boxes v-if="tab === 'products'" :size="28" /><Users v-else :size="28" /></span>
        <span class="m-empty__title">{{ keyword || typeFilter !== 'all' ? '没有符合条件的结果' : tab === 'products' ? '商品库是空的' : '模特库是空的' }}</span>
        <span class="m-empty__text">{{ keyword ? '换个关键词试试' : (isWeb ? '点右下角的 + 上传图片添加' : '点右下角的 + 拍照或从相册添加') }}</span>
      </div>
    </template>
  </main>
  <button type="button" class="m-fab" :aria-label="tab === 'products' ? '新建商品' : '新建模特'" @click="create"><Plus :size="26" :stroke-width="2.4" /></button>
  </template>
</template>

<style scoped>
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 12px; padding: 4px; border-radius: 14px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.seg button { height: 38px; border: 0; border-radius: 10px; background: none; color: var(--theme-text-muted); font-size: 14px; font-weight: 700; }
.seg button small { margin-left: 2px; font-size: 12px; font-weight: 600; opacity: .8; }
.seg button.is-active { background: var(--theme-control-hover); color: var(--theme-text); box-shadow: 0 1px 0 rgba(255, 255, 255, .04) inset; }
.sync-line { margin: 12px 2px 14px; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.card { display: flex; flex-direction: column; overflow: hidden; padding: 0; border: 1px solid var(--theme-border); border-radius: var(--m-radius); background: var(--theme-panel); text-align: left; }
.card:active { transform: scale(.98); }
.card__img { position: relative; aspect-ratio: 1; overflow: hidden; }
.card__img--tall { aspect-ratio: 3 / 4; }
.card__count { position: absolute; right: 8px; bottom: 8px; padding: 1px 7px; border-radius: 999px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 11px; font-weight: 700; }
.card__body { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; }
.card__name { display: -webkit-box; overflow: hidden; font-size: 14px; font-weight: 600; line-height: 1.35; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-height: 2.7em; }
.card__meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: var(--theme-text-muted); font-size: 11px; }
</style>
