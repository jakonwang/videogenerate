<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Plus, Store } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncListing } from '@shared/cloud/sync'
import { TIKTOK_LISTING_CATEGORY_LABELS, TIKTOK_LISTING_LANGUAGE_LABELS } from '@shared/tiktokListingPrompts'
import CloudImage from '@/components/CloudImage.vue'
import PageHeader from '@/components/PageHeader.vue'
import { relativeTime } from '@/lib/library'
import { listRecords, syncState } from '@/lib/sync'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { computed } from 'vue'
import { Search } from 'lucide-vue-next'
const lsQuery = ref('')
const lsCategory = ref('all')
const lsStatus = ref('all')
const lsLanguage = ref('all')
function resetListingFilters() {
  lsQuery.value = ''
  lsCategory.value = 'all'
  lsStatus.value = 'all'
  lsLanguage.value = 'all'
}
const shownListings = computed(() => {
  const word = lsQuery.value.trim().toLowerCase()
  return items.value.filter((item) =>
    (lsCategory.value === 'all' || item.category === lsCategory.value) &&
    (lsLanguage.value === 'all' || item.language === lsLanguage.value) &&
    (lsStatus.value === 'all' || (lsStatus.value === 'done') === Boolean(item.title)) &&
    (!word || `${item.sku} ${item.title}`.toLowerCase().includes(word)),
  )
})
const inWebShell = useInWebShell()

const router = useRouter()
const items = ref<(SyncListing & { id: string; updatedAt: number })[]>([])

watch(
  () => syncState.version,
  async () => {
    const records = await listRecords<SyncListing>(SYNC_COLLECTIONS.listings)
    items.value = records
      .filter((record) => record.data)
      .map((record) => ({ ...(record.data as SyncListing), id: record.id, updatedAt: record.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },
  { immediate: true },
)
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="TikTok 上架助手" description="管理商品列表，AI 看商品图写标题和描述，支持中文、英文、越南语。">
      <template #actions>
        <button type="button" class="vg-btn" @click="router.push('/toolbox')">返回工具箱</button>
        <button type="button" class="vg-btn vg-btn--primary" data-testid="web-listing-new" @click="router.push('/listings/new')"><Plus :size="14" /> 添加商品</button>
      </template>
    </PageHeader>
    <main class="vg-page ls" data-testid="web-listings">
      <div class="ls-filters">
        <label class="vg-search ls-search"><Search :size="14" /><input v-model="lsQuery" class="vg-input vg-input--sm" placeholder="搜索 SKU、标题" /></label>
        <select v-model="lsCategory" class="vg-select vg-select--sm"><option value="all">全部分类</option><option v-for="(label, key) in TIKTOK_LISTING_CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option></select>
        <select v-model="lsStatus" class="vg-select vg-select--sm"><option value="all">全部状态</option><option value="done">已完成</option><option value="draft">草稿</option></select>
        <select v-model="lsLanguage" class="vg-select vg-select--sm"><option value="all">全部语言</option><option v-for="(label, key) in TIKTOK_LISTING_LANGUAGE_LABELS" :key="key" :value="key">{{ label }}</option></select>
        <button type="button" class="vg-btn vg-btn--sm" @click="resetListingFilters">重置</button>
      </div>
      <div class="ls-stats">
        <div class="ls-stat"><small>全部商品</small><strong>{{ items.length }}</strong></div>
        <div class="ls-stat"><small>已完成</small><strong>{{ items.filter((i) => i.title).length }}</strong></div>
        <div class="ls-stat"><small>草稿</small><strong>{{ items.filter((i) => !i.title).length }}</strong></div>
        <div class="ls-stat"><small>本周新增</small><strong>{{ items.filter((i) => Date.now() - i.createdAt < 7 * 86400000).length }}</strong></div>
      </div>
      <div v-if="shownListings.length" class="vg-table-wrap tk-table">
        <table class="vg-table">
          <thead><tr><th style="width: 64px">图片</th><th style="width: 140px">SKU</th><th>标题</th><th style="width: 90px">分类</th><th style="width: 90px">语言</th><th style="width: 90px">价格</th><th style="width: 90px">状态</th><th style="width: 110px">更新</th></tr></thead>
          <tbody>
            <tr v-for="item in shownListings" :key="item.id" class="ls-row" @click="router.push(`/listings/${item.id}`)">
              <td><span class="ls-thumb"><CloudImage :file-id="item.images[0]?.fileId" /></span></td>
              <td class="vg-num">{{ item.sku || '—' }}</td>
              <td class="ls-title">{{ item.title || '还没有生成文案' }}</td>
              <td>{{ TIKTOK_LISTING_CATEGORY_LABELS[item.category] }}</td>
              <td>{{ TIKTOK_LISTING_LANGUAGE_LABELS[item.language] }}</td>
              <td class="vg-num">{{ item.price || '—' }}</td>
              <td><span class="vg-pill vg-pill--dot" :class="item.title ? 'vg-pill--green' : 'vg-pill--amber'">{{ item.title ? '已完成' : '草稿' }}</span></td>
              <td class="vg-muted">{{ relativeTime(item.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="vg-empty tk-empty">
        <span class="vg-empty__icon"><Store :size="20" /></span>
        <h3>{{ items.length ? '没有符合条件的商品' : '暂无商品，先新建一条记录' }}</h3>
        <p>选一个商品或上传商品图，AI 按 TikTok 习惯写标题和描述。</p>
        <button v-if="!items.length" type="button" class="vg-btn vg-btn--primary" @click="router.push('/listings/new')"><Plus :size="14" /> 添加商品</button>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="上架助手" back="/create" />
  <main class="m-page m-page--no-tabs">
    <section class="intro m-card">
      <span class="intro__icon"><Store :size="24" /></span>
      <div>
        <strong>拍照就能写上架文案</strong>
        <p>AI 看商品图，按 TikTok 习惯写标题和描述，支持中文、英文、越南语。</p>
      </div>
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">我的文案</h2><span class="m-muted small">{{ items.length }} 条</span></div>
      <div v-if="items.length" class="m-card m-list">
        <button v-for="item in items" :key="item.id" type="button" class="m-row" @click="router.push(`/listings/${item.id}`)">
          <span class="thumb"><CloudImage :file-id="item.images[0]?.fileId" /></span>
          <span class="m-row__main">
            <span class="m-row__title">{{ item.title || '还没有生成文案' }}</span>
            <span class="m-row__sub">{{ TIKTOK_LISTING_CATEGORY_LABELS[item.category] }} · {{ TIKTOK_LISTING_LANGUAGE_LABELS[item.language] }} · {{ relativeTime(item.updatedAt) }}</span>
          </span>
          <ChevronRight :size="18" class="m-muted" />
        </button>
      </div>
      <div v-else class="m-card m-empty">
        <span class="m-empty__title">还没有上架文案</span>
        <span class="m-empty__text">点右下角 + 选一个商品，让 AI 帮你写</span>
      </div>
    </section>
  </main>
  <button type="button" class="m-fab m-fab--no-tabs" aria-label="新建上架文案" @click="router.push('/listings/new')"><Plus :size="26" :stroke-width="2.4" /></button>
  </template>
</template>

<style scoped>
.intro { display: flex; align-items: center; gap: 14px; padding: 16px; background: linear-gradient(140deg, color-mix(in srgb, var(--m-accent) 14%, var(--theme-panel)), var(--theme-panel) 70%); }
.intro__icon { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--m-accent-soft); color: var(--m-accent-2); }
.intro strong { font-size: 16px; }
.intro p { margin: 4px 0 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.5; }
.thumb { flex: none; width: 52px; height: 52px; border-radius: 10px; overflow: hidden; }
.small { font-size: 12px; }
.m-fab--no-tabs { bottom: calc(var(--m-safe-bottom) + 24px); }
</style>
