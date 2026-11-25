/**
 * 网页版的图生图素材接口：电脑端「商品图片素材」页面（ProductImageMaterialsView）在网页上原样显示，
 * 它调用的 window.api.productImageMaterials 由这里提供——流程和数据沿用网页原来的一套（lib/imageMaterials）：
 * 拆解视频在云端按镜头取帧，衍生图在云端生成，记录存 image-materials / image-material-batches（手机同一份）。
 *
 * - 素材图片：页面直接用 qiniuUrl 显示，这里给云端签名链接；localImagePath 是 cloudfile 路径（预览、打开用）。
 * - 生成中的衍生图不在列表里，做好后出现（页面自己定时刷新）。
 * - 「已下载视频」来自链接下载（parse-link）；拆过的会标记「已使用」。
 * - 导出：选目录在网页上就是浏览器下载。
 */
import { cloudFileRef } from '@shared/cloud/relay'
import { SYNC_COLLECTIONS, type SyncImageMaterial, type SyncImageMaterialBatch, type SyncProduct, type SyncVideoToolRun } from '@shared/cloud/sync'
import { DEFAULT_DERIVED_IMAGE_PROMPT, IMAGE_MATERIAL_CATEGORIES, upgradeDerivedPrompt, type ImageMaterialCategory } from '@shared/imageMaterials'
import { fileBlob } from '../files'
import { cachedFileLink, resolveFileLinks } from '../fileLinks'
import {
  batchState,
  bindProduct as bindMaterials,
  createBackgroundVariants as submitBackgroundVariants,
  createBatch as submitBatch,
  createImageVariants as submitImageVariants,
  removeMaterials,
  retryBatch as resubmitBatch,
  setUsage,
  startMaterialPolling,
  type ImageMaterialBatchItem,
  type ImageMaterialItem,
} from '../imageMaterials'
import { downloadBlob } from '../platform'
import { errorMessage } from '../session'
import { listRecords } from '../sync'
import { toast } from '../toast'
import { markRunUsed, type VideoToolRunItem } from '../videoTools'
import type { DesktopApi } from './contract'
import { cloudFileIdOf, fileNameOf, getPathForFile, pickFiles } from './files'
import { promptVersionApi } from './prompts'
import parserApi from './videoParserDownload'

const prompts = promptVersionApi(SYNC_COLLECTIONS.imageMaterialPrompts, 'Default Lifestyle', DEFAULT_DERIVED_IMAGE_PROMPT, upgradeDerivedPrompt)

/* ------------------------------------------------------------------ 读取 */

async function rowsOf<T>(collection: string) {
  return (await listRecords<T>(collection)).filter((record) => record.data).map((record) => ({ ...(record.data as T), id: record.id, updatedAt: record.updatedAt }))
}
const materialRows = () => rowsOf<SyncImageMaterial>(SYNC_COLLECTIONS.imageMaterials) as Promise<ImageMaterialItem[]>
const batchRows = () => rowsOf<SyncImageMaterialBatch>(SYNC_COLLECTIONS.imageMaterialBatches) as Promise<ImageMaterialBatchItem[]>

const SOURCE_STATUS = { queued: 'queued', running: 'processing', succeeded: 'completed', failed: 'failed' } as const

async function listBatches(_payload: { userId: string }) {
  const batches = (await batchRows()).sort((a, b) => b.createdAt - a.createdAt)
  if (batches.some((batch) => ['queued', 'processing'].includes(batchState(batch)))) startMaterialPolling()
  return batches.map((batch) => {
    const failed = batch.sources.filter((source) => source.status === 'failed')
    const running = batch.sources.find((source) => source.status === 'running')
    return {
      id: batch.id,
      category: batch.category,
      status: batchState(batch),
      segmentTimeSec: 0,
      totalVideos: batch.sources.length,
      completedVideos: batch.sources.filter((source) => source.status === 'succeeded').length,
      failedVideos: failed.length,
      generatedImageCount: batch.sources.reduce((sum, source) => sum + (source.generatedCount || 0), 0),
      currentSourceVideoPath: running ? cloudFileRef(running.fileId, running.name) : undefined,
      lastError: failed[0]?.error,
      sourceItems: batch.sources.map((source, index) => ({
        id: `${batch.id}-${index}`,
        sourceVideoPath: cloudFileRef(source.fileId, source.name),
        sourceVideoName: source.name,
        status: SOURCE_STATUS[source.status],
        generatedCount: source.generatedCount || 0,
        skippedCount: 0,
        error: source.error,
        updatedAt: batch.updatedAt,
      })),
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    }
  })
}

async function listMaterials(payload: { userId: string; filters?: { category?: ImageMaterialCategory | 'all'; usageStatus?: 'unused' | 'used' | 'all'; boundProductId?: string } }) {
  const f = payload.filters ?? {}
  const all = await materialRows()
  if (all.some((item) => item.status === 'queued' || item.status === 'running')) startMaterialPolling()
  const ready = all
    .filter((item) => item.fileId && item.status === 'succeeded')
    .filter((item) => !f.category || f.category === 'all' || item.category === f.category)
    .filter((item) => !f.usageStatus || f.usageStatus === 'all' || item.usage === f.usageStatus)
    .filter((item) => !f.boundProductId || item.boundProductId === f.boundProductId)
    .sort((a, b) => b.createdAt - a.createdAt || (a.atSec ?? 0) - (b.atSec ?? 0))
  await resolveFileLinks(ready.map((item) => item.fileId!)).catch(() => undefined)
  return ready.map((item, index) => {
    const name = `${(item.sourceName || 'material').replace(/\.[^.]+$/, '')}_${index + 1}.jpg`
    return {
      id: item.id,
      userId: 'web',
      batchId: item.batchId || '',
      category: item.category,
      sourceVideoPath: '',
      sourceVideoName: item.sourceName || '',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: item.atSec ?? 0,
      localImagePath: cloudFileRef(item.fileId!, name),
      qiniuUrl: cachedFileLink(item.fileId) || '',
      materialOrigin: item.origin,
      derivedFromMaterialId: item.derivedFromId,
      derivedVariantIndex: item.variantIndex,
      usageStatus: item.usage,
      boundProductId: item.boundProductId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
  })
}

async function listProducts() {
  return (await rowsOf<SyncProduct>(SYNC_COLLECTIONS.products)).map((product) => ({ id: product.id, name: product.name, type: product.type, coverImagePath: product.coverFileId ? cloudFileRef(product.coverFileId, `${product.name}.jpg`) : undefined }))
}

/** 选「已下载视频」时用：链接下载的记录，封面直接给链接 */
async function listParserVideos(payload: { userId: string }) {
  const items = await parserApi.videoParserDownload.listItems(payload)
  return items.map((item) => ({ ...item, thumbnailPath: item.coverUrl }))
}

/* ------------------------------------------------------------------ 拆解视频 / 衍生图 */

async function createBatch(payload: { userId: string; category: ImageMaterialCategory; sourceVideoPaths: string[]; parserVideoIds?: string[] }) {
  const videos: Array<{ name: string; fileId: string }> = []
  for (const path of payload.sourceVideoPaths ?? []) videos.push({ name: fileNameOf(path), fileId: await cloudFileIdOf(path) })
  const used: VideoToolRunItem[] = []
  if (payload.parserVideoIds?.length) {
    const wanted = new Set(payload.parserVideoIds)
    for (const record of await listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns)) {
      const run = record.data
      if (!run || !wanted.has(record.id) || !run.outputs[0]) continue
      videos.push({ name: run.title || run.label, fileId: run.outputs[0].fileId })
      used.push({ ...run, id: record.id })
    }
  }
  if (!videos.length) throw new Error('请先选择要拆解的视频')
  const id = await submitBatch(payload.category, videos)
  for (const run of used) await markRunUsed(run)
  return { id }
}

async function retryBatch(payload: { userId: string; batchId: string }) {
  const batch = (await batchRows()).find((item) => item.id === payload.batchId)
  if (batch) await resubmitBatch(batch)
  return { ok: true }
}

async function createImageVariants(payload: { userId: string; sourceImagePath: string; category: ImageMaterialCategory; variantCount: number; promptVersionId?: string; prompt?: string }) {
  const prompt = payload.prompt?.trim() || (await prompts.rows()).find((row) => row.id === payload.promptVersionId)?.prompt || DEFAULT_DERIVED_IMAGE_PROMPT
  const fileId = await cloudFileIdOf(payload.sourceImagePath)
  const count = await submitImageVariants([{ fileId, name: fileNameOf(payload.sourceImagePath) }], payload.category, Math.max(1, Math.min(6, payload.variantCount || 1)), prompt)
  return { count }
}

async function createBackgroundVariants(payload: { userId: string; materialIds: string[]; variantCount: number; promptVersionId?: string; prompt?: string }) {
  const wanted = new Set(payload.materialIds)
  const chosen = (await materialRows()).filter((item) => wanted.has(item.id))
  if (!chosen.length) throw new Error('请先选择素材')
  const template = payload.prompt?.trim() || (await prompts.rows()).find((row) => row.id === payload.promptVersionId)?.prompt || DEFAULT_DERIVED_IMAGE_PROMPT
  const count = await submitBackgroundVariants(chosen, Math.max(1, Math.min(6, payload.variantCount || 1)), template)
  return { count }
}

/* ------------------------------------------------------------------ 素材管理 */

const byIds = async (ids: string[]) => {
  const wanted = new Set(ids)
  return (await materialRows()).filter((item) => wanted.has(item.id))
}

async function exportMaterials(payload: { userId: string; materialIds: string[]; outputDir: string }) {
  const items = (await byIds(payload.materialIds)).filter((item) => item.fileId)
  let count = 0
  for (const [index, item] of items.entries()) {
    try {
      downloadBlob(await fileBlob(item.fileId!), `${(item.sourceName || 'material').replace(/\.[^.]+$/, '')}_${String(index + 1).padStart(2, '0')}.jpg`)
      count += 1
    } catch (error) {
      toast(errorMessage(error))
    }
  }
  return { count, outputDir: payload.outputDir }
}

const productImageMaterials = {
  listCategories: async () => [...IMAGE_MATERIAL_CATEGORIES],
  createBatch,
  listBatches,
  retryBatch,
  createBackgroundVariants,
  createImageVariants,
  listPromptVersions: prompts.listPromptVersions,
  savePromptVersion: prompts.savePromptVersion,
  activatePromptVersion: prompts.activatePromptVersion,
  rollbackPromptVersion: prompts.rollbackPromptVersion,
  listMaterials,
  resolveMaterialImages: async (payload: { userId: string; materialIds: string[] }) =>
    (await byIds(payload.materialIds)).filter((item) => item.fileId).map((item) => cloudFileRef(item.fileId!, `${item.id}.jpg`)),
  updateUsageStatus: async (payload: { userId: string; materialId: string; usageStatus: 'unused' | 'used' }) => {
    await setUsage(await byIds([payload.materialId]), payload.usageStatus)
    return { ok: true }
  },
  bindProduct: async (payload: { userId: string; materialId: string; productId?: string }) => {
    await bindMaterials(await byIds([payload.materialId]), payload.productId || '')
    return { ok: true }
  },
  deleteMaterial: async (payload: { userId: string; materialId: string }) => {
    await removeMaterials(await byIds([payload.materialId]))
    return { ok: true }
  },
  deleteMaterials: async (payload: { userId: string; materialIds: string[] }) => {
    await removeMaterials(await byIds(payload.materialIds))
    return { ok: true }
  },
  exportMaterials,
  listProducts,
} satisfies DesktopApi['productImageMaterials']

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  productImageMaterials,
  videoParserDownload: { listItems: listParserVideos },
  pickFiles,
  getPathForFile,
  pickDir: async () => '浏览器下载',
}
