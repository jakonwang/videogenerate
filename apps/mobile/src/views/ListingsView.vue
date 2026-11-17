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

<style scoped>
.intro { display: flex; align-items: center; gap: 14px; padding: 16px; background: linear-gradient(140deg, color-mix(in srgb, var(--m-accent) 14%, var(--theme-panel)), var(--theme-panel) 70%); }
.intro__icon { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--m-accent-soft); color: var(--m-accent-2); }
.intro strong { font-size: 16px; }
.intro p { margin: 4px 0 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.5; }
.thumb { flex: none; width: 52px; height: 52px; border-radius: 10px; overflow: hidden; }
.small { font-size: 12px; }
.m-fab--no-tabs { bottom: calc(var(--m-safe-bottom) + 24px); }
</style>
