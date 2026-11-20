import { ref, watch } from 'vue'
import { CREATIVE_REQUEST_MAX_IMAGES, type SyncCreativeRequest } from '@shared/cloud/selling'
import { SYNC_COLLECTIONS } from '@shared/cloud/sync'
import { listRecords, newId, saveRecord, syncState } from './sync'

/**
 * tk创意室 orders: the web / phone writes a pending order, the user's computer (which holds the TikTok
 * creative accounts) picks it up on its next sync, runs it and reports progress and videos back.
 */
export type CreativeOrder = SyncCreativeRequest & { id: string; updatedAt: number }

export function useCreativeOrders() {
  const items = ref<CreativeOrder[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncCreativeRequest>(SYNC_COLLECTIONS.creativeRequests)
      items.value = records
        .filter((record) => record.data)
        .map((record) => ({ ...(record.data as SyncCreativeRequest), id: record.id, updatedAt: record.updatedAt }))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

export async function submitCreativeOrder(input: { productId: string; productName?: string; referenceFileIds: string[]; mode: 'reference_to_video' | 'image_to_video' }) {
  if (!input.productId) throw new Error('请先选择商品')
  const referenceFileIds = [...new Set(input.referenceFileIds)].slice(0, CREATIVE_REQUEST_MAX_IMAGES)
  if (!referenceFileIds.length) throw new Error('至少上传一张场景图')
  const id = newId('creative')
  await saveRecord<SyncCreativeRequest>(SYNC_COLLECTIONS.creativeRequests, id, {
    productId: input.productId,
    productName: input.productName,
    referenceFileIds,
    mode: input.mode,
    createdAt: Date.now(),
    state: 'pending',
  })
  return id
}

/** 同款参考视频：每个商品一单，电脑分析这条视频后出一条同款视频 */
export async function submitCreativeStyleOrders(input: {
  products: Array<{ id: string; name?: string }>
  video: { fileId: string; name?: string; posterFileId?: string }
  mode: 'reference_to_video' | 'image_to_video'
}) {
  if (!input.video?.fileId) throw new Error('请先上传参考视频')
  if (!input.products.length) throw new Error('请至少选择一个商品')
  const ids: string[] = []
  for (const product of input.products) {
    const id = newId('creative')
    await saveRecord<SyncCreativeRequest>(SYNC_COLLECTIONS.creativeRequests, id, {
      productId: product.id,
      productName: product.name,
      referenceFileIds: [],
      mode: input.mode,
      styleVideoFileId: input.video.fileId,
      styleVideoName: input.video.name,
      styleVideoPosterFileId: input.video.posterFileId,
      createdAt: Date.now(),
      state: 'pending',
    })
    ids.push(id)
  }
  return ids
}

export const CREATIVE_STATE_LABEL: Record<SyncCreativeRequest['state'], string> = {
  pending: '等电脑接单',
  running: '电脑出片中',
  completed: '已完成',
  failed: '失败',
  skipped: '电脑未开启 tk创意室',
}

export { CREATIVE_REQUEST_MAX_IMAGES }
