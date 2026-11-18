<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Plus } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncResearchTask } from '@shared/cloud/sync'
import CloudImage from '@/components/CloudImage.vue'
import PageHeader from '@/components/PageHeader.vue'
import { addResearchToLibrary, formatSales, useResearchResults, type ResearchItem } from '@/lib/researchResults'
import { getRecord, syncState } from '@/lib/sync'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const taskId = String(route.params.id)
const task = ref<SyncResearchTask | null>(null)
const { results, sorted, sort } = useResearchResults(ref(taskId))
watch(() => syncState.version, async () => { task.value = (await getRecord<SyncResearchTask>(SYNC_COLLECTIONS.researchTasks, taskId))?.data ?? null }, { immediate: true })

/** 一键把采集到的商品存进商品库（带上主图），之后可用于复刻、生成素材 */
async function addToLibrary(item: ResearchItem) {
  const { productId, created } = await addResearchToLibrary(item)
  if (created) toast('已加入商品库')
  else router.push(`/library/products/${productId}`)
}
</script>

<template>
  <PageHeader :title="task ? `「${task.keyword}」` : '采集结果'" back="/research" />
  <main class="m-page m-page--no-tabs">
    <div class="summary">
      <span>共 {{ results.length }} 个商品</span>
      <div class="m-chips sorts">
        <button type="button" class="m-chip" :class="{ 'is-active': sort === 'rank' }" @click="sort = 'rank'">默认</button>
        <button type="button" class="m-chip" :class="{ 'is-active': sort === 'sales' }" @click="sort = 'sales'">销量</button>
        <button type="button" class="m-chip" :class="{ 'is-active': sort === 'price' }" @click="sort = 'price'">价格</button>
      </div>
    </div>

    <div v-if="sorted.length" class="m-card m-list">
      <div v-for="item in sorted" :key="item.id" class="m-row item">
        <span class="thumb"><CloudImage :file-id="item.image?.fileId" :alt="item.title" /></span>
        <span class="m-row__main">
          <span class="title">{{ item.title }}</span>
          <span class="meta">
            <b class="price">{{ item.priceText || '-' }}</b>
            <span>销量 <b class="sales">{{ formatSales(item.salesValue, item.salesText) }}</b></span>
          </span>
        </span>
        <button type="button" class="add" :class="{ 'is-added': item.productId }" :aria-label="item.productId ? '查看商品' : '加入商品库'" @click="addToLibrary(item)">
          <Check v-if="item.productId" :size="16" :stroke-width="2.6" /><Plus v-else :size="18" :stroke-width="2.4" />
        </button>
      </div>
    </div>
    <div v-else class="m-card m-empty">
      <span class="m-empty__title">{{ task?.status === 'running' ? '正在采集…' : '没有采集到商品' }}</span>
      <span class="m-empty__text">{{ task?.status === 'running' ? '采集完成后结果会出现在这里' : '换个关键词再试一次' }}</span>
    </div>
  </main>
</template>

<style scoped>
.summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 2px 2px 12px; color: var(--theme-text-muted); font-size: 13px; }
.sorts { margin: 0; padding: 0; }
.item { align-items: flex-start; padding: 12px 14px; }
.thumb { flex: none; width: 72px; height: 72px; border-radius: 10px; overflow: hidden; }
.title { display: -webkit-box; overflow: hidden; font-size: 14px; font-weight: 600; line-height: 1.4; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.meta { display: flex; align-items: baseline; gap: 12px; margin-top: 8px; color: var(--theme-text-muted); font-size: 12px; }
.price { color: var(--m-red); font-size: 15px; }
.sales { color: var(--m-green); }
.add { flex: none; display: grid; place-items: center; align-self: center; width: 36px; height: 36px; border: 1px solid var(--m-accent-line); border-radius: 12px; background: var(--m-accent-soft); color: var(--m-accent-2); }
.add.is-added { border-color: transparent; background: var(--m-accent); color: #04201c; }
</style>
