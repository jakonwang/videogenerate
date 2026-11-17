import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncModel, type SyncProduct } from '@shared/cloud/sync'
import { listRecords, syncState } from './sync'

export type ProductItem = SyncProduct & { id: string; updatedAt: number; pending: boolean }
export type ModelItem = SyncModel & { id: string; updatedAt: number; pending: boolean }

/** 商品库 / 模特库列表（按更新时间倒序），本地或云端有改动时自动刷新 */
function useCollection<T>(collection: string) {
  const items = ref<(T & { id: string; updatedAt: number; pending: boolean })[]>([])
  const loading = ref(true)
  async function load() {
    const records = await listRecords<T>(collection)
    items.value = records
      .filter((record) => record.data)
      .map((record) => ({ ...(record.data as T), id: record.id, updatedAt: record.updatedAt, pending: record.dirty }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    loading.value = false
  }
  watch(() => syncState.version, load, { immediate: true })
  return { items, loading, reload: load }
}

export const useProducts = () => useCollection<SyncProduct>(SYNC_COLLECTIONS.products)
export const useModels = () => useCollection<SyncModel>(SYNC_COLLECTIONS.models)

export function coverOf(item: { coverFileId?: string; images?: { fileId: string }[] }) {
  return item.coverFileId || item.images?.[0]?.fileId || ''
}

export function relativeTime(at: number) {
  const diff = Date.now() - at
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  const d = new Date(at)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
