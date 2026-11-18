import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncReplaceBatch } from '@shared/cloud/sync'
import { submitGeneration, type GenerationItem } from './generate'
import { listRecords, newId, saveRecord, syncState } from './sync'

/**
 * 商品替换（网页版，按电脑端 ProductReplacementView）：目标商品参考图（最多 4 张）+ 场景图 × 每张生成数量。
 * 每个结果是一条 generations 记录（进审核收件箱），批次记录把它们按一次提交归在一起。
 */

export const MAX_PRODUCT_REFS = 4
export type ReplaceBatchItem = SyncReplaceBatch & { id: string; updatedAt: number }

export function useReplaceBatches() {
  const items = ref<ReplaceBatchItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncReplaceBatch>(SYNC_COLLECTIONS.replaceBatches)
      items.value = records
        .filter((record) => record.data)
        .map((record) => ({ ...(record.data as SyncReplaceBatch), id: record.id, updatedAt: record.updatedAt }))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

/** 第一张是场景图，其余是商品参考图 */
async function submitOne(input: { productId?: string; productName: string; prompt: string; sceneFileId: string; aspectRatio: '1:1' | '9:16' | '16:9'; productFileIds: string[]; label: string }) {
  return submitGeneration(
    { kind: 'image', prompt: input.prompt, imageFileIds: [input.sceneFileId, ...input.productFileIds.slice(0, MAX_PRODUCT_REFS)], aspectRatio: input.aspectRatio, purpose: 'product-replace' },
    { kind: 'image', purpose: 'product-replace', productId: input.productId, productName: input.productName, sourceFileId: input.sceneFileId, label: input.label },
  )
}

export async function createReplaceBatch(input: {
  productId?: string
  productName: string
  productFileIds: string[]
  scenes: Array<{ fileId: string; name: string; aspectRatio: '1:1' | '9:16' | '16:9' }>
  prompt: string
  promptVersion: number
  variantCount: number
}) {
  const items: SyncReplaceBatch['items'] = []
  for (const [index, scene] of input.scenes.entries()) {
    for (let variant = 0; variant < input.variantCount; variant += 1) {
      const label = `替换 ${index + 1}${input.variantCount > 1 ? `-${variant + 1}` : ''}`
      const generationId = await submitOne({ productId: input.productId, productName: input.productName, prompt: input.prompt, sceneFileId: scene.fileId, aspectRatio: scene.aspectRatio, productFileIds: input.productFileIds, label })
      items.push({ generationId, sourceName: scene.name, sourceFileId: scene.fileId, aspectRatio: scene.aspectRatio })
    }
  }
  const id = newId('rpb')
  await saveRecord<SyncReplaceBatch>(SYNC_COLLECTIONS.replaceBatches, id, {
    productId: input.productId,
    productName: input.productName,
    promptVersion: input.promptVersion,
    prompt: input.prompt,
    productFileIds: input.productFileIds.slice(0, MAX_PRODUCT_REFS),
    variantCount: input.variantCount,
    items,
    createdAt: Date.now(),
  })
  return id
}

/** 重试失败项：失败的结果用同样的提示词和参考图各重新提交一次 */
export async function retryFailedItems(batch: ReplaceBatchItem, generations: Map<string, GenerationItem>) {
  const items = [...batch.items]
  for (const [index, item] of items.entries()) {
    const gen = generations.get(item.generationId)
    if (gen?.status !== 'failed') continue
    const generationId = await submitOne({ productId: batch.productId, productName: batch.productName, prompt: batch.prompt, sceneFileId: item.sourceFileId, aspectRatio: item.aspectRatio, productFileIds: batch.productFileIds, label: gen.label })
    items[index] = { ...item, generationId }
  }
  const { id, updatedAt: _u, ...data } = batch
  await saveRecord<SyncReplaceBatch>(SYNC_COLLECTIONS.replaceBatches, id, { ...data, items })
}

export async function markExported(batch: ReplaceBatchItem, generationIds: string[]) {
  const at = Date.now()
  const { id, updatedAt: _u, ...data } = batch
  await saveRecord<SyncReplaceBatch>(SYNC_COLLECTIONS.replaceBatches, id, { ...data, items: data.items.map((item) => (generationIds.includes(item.generationId) ? { ...item, exportedAt: at } : item)) })
}

/** 批次状态（和电脑端一样） */
export function replaceBatchStatus(batch: SyncReplaceBatch, generations: Map<string, GenerationItem>) {
  const states = batch.items.map((item) => generations.get(item.generationId)?.status ?? 'queued')
  if (states.some((s) => s === 'running')) return 'processing'
  if (states.some((s) => s === 'queued')) return states.some((s) => s !== 'queued') ? 'processing' : 'queued'
  const failed = states.filter((s) => s === 'failed').length
  return !failed ? 'completed' : failed === states.length ? 'failed' : 'partial_failed'
}
