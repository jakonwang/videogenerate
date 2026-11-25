import { ref, watch } from 'vue'
import {
  SYNC_COLLECTIONS,
  type SyncImageMaterial,
  type SyncImageMaterialBatch,
  type SyncJobState,
} from '@shared/cloud/sync'
import type { VideoJobResult } from '@shared/cloud/videoTools'
import {
  backgroundVariantNegativePrompt,
  buildBackgroundVariantPrompt,
  buildImageVariantPrompt,
  type ImageMaterialCategory,
} from '@shared/imageMaterials'
import { fileBlob } from './files'
import { closestAspect } from './generate'
import { cloud } from './session'
import { deleteRecord, listRecords, newId, saveRecord, syncState } from './sync'

/**
 * 图生图（商品图素材），和电脑端同一套流程：
 * 拆解视频（云端按镜头切换取帧）→ 视频拆解图片库 → AI 换背景 / 上传图片生成衍生图 → 衍生图素材（标记使用、绑定商品、导出）。
 * 记录走云同步，任务在云端执行；电脑端的同名插件仍各自独立。
 */

export type ImageMaterialItem = SyncImageMaterial & { id: string; updatedAt: number }
export type ImageMaterialBatchItem = SyncImageMaterialBatch & { id: string; updatedAt: number }

function useRows<T>(collection: string, sort: (a: T & { id: string; updatedAt: number }, b: T & { id: string; updatedAt: number }) => number) {
  const items = ref<(T & { id: string; updatedAt: number })[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<T>(collection)
      items.value = records
        .filter((record) => record.data)
        .map((record) => ({ ...(record.data as T), id: record.id, updatedAt: record.updatedAt }))
        .sort(sort)
    },
    { immediate: true },
  )
  return items
}

export const useImageMaterials = () => useRows<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials, (a, b) => b.createdAt - a.createdAt || (a.atSec ?? 0) - (b.atSec ?? 0))
export const useImageMaterialBatches = () => useRows<SyncImageMaterialBatch>(SYNC_COLLECTIONS.imageMaterialBatches, (a, b) => b.createdAt - a.createdAt)

/* ------------------------------------------------------------------ 批次状态（和电脑端一样的五种） */

export type BatchState = 'queued' | 'processing' | 'completed' | 'partial_failed' | 'failed'
export const BATCH_STATE_LABEL: Record<BatchState, string> = { queued: '排队中', processing: '处理中', completed: '已完成', partial_failed: '部分失败', failed: '失败' }

export function batchState(batch: SyncImageMaterialBatch): BatchState {
  const states = batch.sources.map((source) => source.status)
  if (states.some((state) => state === 'running')) return 'processing'
  if (states.some((state) => state === 'queued')) return states.some((state) => state !== 'queued') ? 'processing' : 'queued'
  const failed = states.filter((state) => state === 'failed').length
  if (!failed) return 'completed'
  return failed === states.length ? 'failed' : 'partial_failed'
}

/* ------------------------------------------------------------------ 拆解视频 */

export async function createBatch(category: ImageMaterialCategory, videos: Array<{ name: string; fileId: string }>) {
  const sources: SyncImageMaterialBatch['sources'] = []
  for (const video of videos) {
    const { job } = await cloud.ai.createJob({ kind: 'frames', videoFileId: video.fileId, purpose: 'frames' })
    sources.push({ name: video.name, fileId: video.fileId, jobId: job.id, status: job.status, generatedCount: 0 })
  }
  const id = newId('imb')
  await saveRecord<SyncImageMaterialBatch>(SYNC_COLLECTIONS.imageMaterialBatches, id, { category, sources, createdAt: Date.now() })
  startMaterialPolling()
  return id
}

/** 失败的视频重新拆一次 */
export async function retryBatch(batch: ImageMaterialBatchItem) {
  const sources = [...batch.sources]
  for (const [index, source] of sources.entries()) {
    if (source.status !== 'failed') continue
    const { job } = await cloud.ai.createJob({ kind: 'frames', videoFileId: source.fileId, purpose: 'frames' })
    sources[index] = { ...source, jobId: job.id, status: job.status, error: undefined, generatedCount: 0 }
  }
  const { id, updatedAt: _u, ...data } = batch
  await saveRecord<SyncImageMaterialBatch>(SYNC_COLLECTIONS.imageMaterialBatches, id, { ...data, sources })
  startMaterialPolling()
}

/* ------------------------------------------------------------------ 衍生图 */

async function aspectOf(fileId: string) {
  try {
    const bitmap = await createImageBitmap(await fileBlob(fileId))
    const aspect = closestAspect(bitmap.width, bitmap.height)
    bitmap.close()
    return aspect
  } catch {
    return '1:1' as const
  }
}

async function submitDerived(input: { category: ImageMaterialCategory; prompt: string; sourceFileId: string; derivedFromId?: string; sourceName?: string; variantIndex: number; aspect: '1:1' | '9:16' | '16:9' }) {
  const { job } = await cloud.ai.createJob({
    kind: 'image',
    prompt: input.prompt,
    negativePrompt: backgroundVariantNegativePrompt(),
    imageFileIds: [input.sourceFileId],
    aspectRatio: input.aspect,
    purpose: 'image-material',
  })
  await saveRecord<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials, newId('imm'), {
    category: input.category,
    origin: 'derived',
    jobId: job.id,
    status: job.status,
    sourceFileId: input.sourceFileId,
    derivedFromId: input.derivedFromId,
    sourceName: input.sourceName,
    variantIndex: input.variantIndex,
    usage: 'unused',
    createdAt: Date.now(),
  })
}

/** 视频拆解图片库 → 换背景：每张素材出 count 张，每张换一个日常场景 */
export async function createBackgroundVariants(materials: ImageMaterialItem[], count: number, template: string) {
  let total = 0
  for (const material of materials) {
    if (!material.fileId) continue
    const aspect = await aspectOf(material.fileId)
    for (let index = 0; index < count; index += 1) {
      await submitDerived({
        category: material.category,
        prompt: buildBackgroundVariantPrompt({ category: material.category, template }),
        sourceFileId: material.fileId,
        derivedFromId: material.id,
        sourceName: material.sourceName,
        variantIndex: index,
        aspect,
      })
      total += 1
    }
  }
  startMaterialPolling()
  return total
}

/** 图生图：上传的商品图，每张出 count 张 */
export async function createImageVariants(sources: Array<{ fileId: string; name: string }>, category: ImageMaterialCategory, count: number, prompt: string) {
  let total = 0
  for (const source of sources) {
    const aspect = await aspectOf(source.fileId)
    for (let index = 0; index < count; index += 1) {
      await submitDerived({ category, prompt: buildImageVariantPrompt({ category, template: prompt }), sourceFileId: source.fileId, sourceName: source.name, variantIndex: index, aspect })
      total += 1
    }
  }
  startMaterialPolling()
  return total
}

/* ------------------------------------------------------------------ 素材管理 */

async function patchMaterial(item: ImageMaterialItem, patch: Partial<SyncImageMaterial>) {
  const { id, updatedAt: _u, ...data } = item
  await saveRecord<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials, id, { ...data, ...patch })
}
export const setUsage = (items: ImageMaterialItem[], usage: 'unused' | 'used') => Promise.all(items.map((item) => patchMaterial(item, { usage })))
export const bindProduct = (items: ImageMaterialItem[], productId: string) => Promise.all(items.map((item) => patchMaterial(item, { boundProductId: productId || undefined })))
export const removeMaterials = (items: ImageMaterialItem[]) => Promise.all(items.map((item) => deleteRecord(SYNC_COLLECTIONS.imageMaterials, item.id)))

/* ------------------------------------------------------------------ 进度 */

let timer: ReturnType<typeof setTimeout> | null = null
export function startMaterialPolling() {
  if (timer) return
  const tick = async () => {
    timer = null
    const still = await refreshMaterials().catch(() => 1)
    if (still && document.visibilityState === 'visible') timer = setTimeout(tick, 4000)
  }
  timer = setTimeout(tick, 1500)
}

const isPending = (state: SyncJobState) => state === 'queued' || state === 'running'

/** 查一次云端任务：拆完的视频把每帧记成原图，生成好的衍生图填上文件 */
export async function refreshMaterials(): Promise<number> {
  const batches = (await listRecords<SyncImageMaterialBatch>(SYNC_COLLECTIONS.imageMaterialBatches)).filter((r) => r.data?.sources.some((s) => isPending(s.status)))
  const derived = (await listRecords<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials)).filter((r) => r.data?.origin === 'derived' && r.data.jobId && isPending(r.data.status))
  const jobIds = [...batches.flatMap((r) => r.data!.sources.filter((s) => isPending(s.status)).map((s) => s.jobId)), ...derived.map((r) => r.data!.jobId!)]
  if (!jobIds.length) return 0
  const { jobs } = await cloud.ai.listJobs(jobIds)
  const byId = new Map(jobs.map((job) => [job.id, job]))
  let still = 0
  for (const record of batches) {
    const batch = record.data!
    let changed = false
    const sources = [...batch.sources]
    for (const [index, source] of sources.entries()) {
      if (!isPending(source.status)) continue
      const job = byId.get(source.jobId)
      if (!job) continue
      if (isPending(job.status)) {
        still += 1
        if (job.status !== source.status) { sources[index] = { ...source, status: job.status }; changed = true }
        continue
      }
      const outputs = job.status === 'succeeded' ? ((job.result as VideoJobResult | undefined)?.outputs ?? []) : []
      const at = Date.now() // one time per video, so frames sort by their place in the video
      for (const [frame, output] of outputs.entries()) {
        await saveRecord<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials, `imm_${job.id}_${frame}`, {
          category: batch.category,
          origin: 'original',
          fileId: output.fileId,
          status: 'succeeded',
          batchId: record.id,
          sourceName: source.name,
          atSec: output.atSec,
          usage: 'unused',
          createdAt: at,
        })
      }
      sources[index] = { ...source, status: job.status, generatedCount: outputs.length, error: job.error }
      changed = true
    }
    if (changed) await saveRecord<SyncImageMaterialBatch>(SYNC_COLLECTIONS.imageMaterialBatches, record.id, { ...batch, sources })
  }
  for (const record of derived) {
    const item = record.data!
    const job = byId.get(item.jobId!)
    if (!job) continue
    if (isPending(job.status)) {
      still += 1
      if (job.status !== item.status) await saveRecord<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials, record.id, { ...item, status: job.status })
      continue
    }
    await saveRecord<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials, record.id, { ...item, status: job.status, fileId: job.outputFileId, error: job.error })
  }
  return still
}
