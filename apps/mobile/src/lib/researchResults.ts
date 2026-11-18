import { computed, ref, watch, type Ref } from 'vue'
import { SYNC_COLLECTIONS, type SyncProduct, type SyncResearchResult } from '@shared/cloud/sync'
import { listRecords, newId, saveRecord, syncState } from './sync'

/** 一次采集的结果列表（手机采集页、网页选品页共用） */
export type ResearchItem = SyncResearchResult & { id: string }
export type ResearchSort = 'rank' | 'sales' | 'price'

export function useResearchResults(taskId: Ref<string | null>) {
  const results = ref<ResearchItem[]>([])
  const sort = ref<ResearchSort>('rank')
  async function load() {
    if (!taskId.value) {
      results.value = []
      return
    }
    const records = await listRecords<SyncResearchResult>(SYNC_COLLECTIONS.researchResults)
    results.value = records.filter((r) => r.data?.taskId === taskId.value).map((r) => ({ ...(r.data as SyncResearchResult), id: r.id }))
  }
  watch([() => syncState.version, taskId], load, { immediate: true })
  const sorted = computed(() => {
    const list = [...results.value]
    if (sort.value === 'sales') return list.sort((a, b) => (b.salesValue ?? -1) - (a.salesValue ?? -1))
    if (sort.value === 'price') return list.sort((a, b) => (a.priceValue ?? Infinity) - (b.priceValue ?? Infinity))
    return list.sort((a, b) => a.rank - b.rank)
  })
  return { results, sorted, sort }
}

export function formatSales(value?: number, text?: string) {
  if (value === undefined) return text || '-'
  return value >= 10000 ? `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万` : String(value)
}

/** 把采集到的商品存进商品库（带主图），返回商品 id；已加过的直接返回原 id */
export async function addResearchToLibrary(item: ResearchItem): Promise<{ productId: string; created: boolean }> {
  if (item.productId) return { productId: item.productId, created: false }
  const productId = newId('prod')
  const remark = [item.priceText && `价格 ${item.priceText}`, item.salesText && `销量 ${item.salesText}`, `来自选品「${item.keyword}」`].filter(Boolean).join(' · ')
  await saveRecord<SyncProduct>(SYNC_COLLECTIONS.products, productId, {
    name: item.title.slice(0, 80),
    type: 'general',
    remark,
    images: item.image ? [item.image] : [],
    coverFileId: item.image?.fileId,
    createdAt: Date.now(),
  })
  const { id, ...data } = item
  await saveRecord<SyncResearchResult>(SYNC_COLLECTIONS.researchResults, id, { ...data, productId })
  return { productId, created: true }
}
