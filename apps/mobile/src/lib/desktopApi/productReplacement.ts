/**
 * 网页版的商品替换接口：电脑端「商品替换」页面（ProductReplacementView）在网页上原样显示，
 * 它调用的 window.api.productReplacement / products.list 由这里提供——方法、参数、返回格式和电脑端一样，
 * 但在云端生成，数据存在同步记录里（replace-batches、replace-prompts、generations），手机 App 也能看到。
 *
 * 页面里的「文件路径」在网页上都是 `cloudfile:<fileId>/<文件名>`（显示、打开由 desktopShims/localMedia 处理）。
 * 只在这个页面打开期间生效（router 的 desktopPage 第二个参数），不影响其他页面的 window.api。
 */
import { cloudFileRef, parseCloudFileRef } from '@shared/cloud/relay'
import { SYNC_COLLECTIONS, type SyncGeneration, type SyncProduct, type SyncReplaceBatch } from '@shared/cloud/sync'
import { PRODUCT_REPLACEMENT_PROMPT } from '@shared/productReplacementPrompt'
import { fileBlob, uploadImage } from '../files'
import { closestAspect, startPolling, type GenerationItem } from '../generate'
import { downloadBlob } from '../platform'
import { createReplaceBatch, markExported, replaceBatchStatus, retryFailedItems, type ReplaceBatchItem } from '../replace'
import { errorMessage } from '../session'
import { listRecords } from '../sync'
import { toast } from '../toast'
import type { DesktopApi } from './contract'
import { promptVersionApi } from './prompts'

const PROMPTS = SYNC_COLLECTIONS.replacePrompts
const DEFAULT_PROMPT_NAME = 'Basic Product Replacement'

/* ------------------------------------------------------------------ 文件：上传、尺寸 */

type Aspect = '1:1' | '9:16' | '16:9'
/** 上传时已知的图片尺寸（决定生成的画面比例），没有的再下载量一下 */
const aspects = new Map<string, Aspect>()

async function aspectOf(fileId: string): Promise<Aspect> {
  const known = aspects.get(fileId)
  if (known) return known
  try {
    const bitmap = await createImageBitmap(await fileBlob(fileId))
    const aspect = closestAspect(bitmap.width, bitmap.height)
    bitmap.close()
    aspects.set(fileId, aspect)
    return aspect
  } catch {
    return '1:1'
  }
}

async function uploadFiles(files: File[]): Promise<Array<{ path: string; name: string }>> {
  const images = files.filter((file) => file.type.startsWith('image/'))
  if (!images.length) return []
  toast(`正在上传 ${images.length} 张图片…`)
  const out: Array<{ path: string; name: string }> = []
  for (const file of images) {
    try {
      const ref = await uploadImage(file)
      aspects.set(ref.fileId, closestAspect(ref.width, ref.height))
      out.push({ path: cloudFileRef(ref.fileId, file.name), name: file.name })
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    }
  }
  return out
}

function chooseImages(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

/** 拖进页面的文件：电脑端用 getPathForFile 取本地路径，网页上先发一个临时标记，importPaths 时再上传 */
const dropped = new Map<string, File>()
function getPathForFile(file: File) {
  const token = URL.createObjectURL(file)
  dropped.set(token, file)
  return token
}

function fileIdOf(path: string) {
  const ref = parseCloudFileRef(String(path || ''))
  if (!ref) throw new Error('这张图片不在云端，请重新上传')
  return ref.fileId
}

/* ------------------------------------------------------------------ 商品（云端商品库，和电脑端同步） */

async function listProducts() {
  const records = await listRecords<SyncProduct>(SYNC_COLLECTIONS.products)
  return records
    .filter((record) => record.data)
    .map((record) => {
      const product = record.data as SyncProduct
      const images = product.images.map((image, index) => {
        const fileName = `${product.name || 'product'}-${index + 1}.jpg`
        return { filePath: cloudFileRef(image.fileId, fileName), fileName }
      })
      const coverId = product.coverFileId || product.images[0]?.fileId
      // Same string as the matching image's path: the page de-duplicates cover + images by path.
      const coverIndex = product.images.findIndex((image) => image.fileId === coverId)
      const coverImagePath = coverIndex >= 0 ? images[coverIndex]!.filePath : coverId ? cloudFileRef(coverId, `${product.name || 'product'}.jpg`) : undefined
      return { id: record.id, name: product.name, coverImagePath, images }
    })
}

/* ------------------------------------------------------------------ 提示词版本 */

const prompts = promptVersionApi(PROMPTS, DEFAULT_PROMPT_NAME, PRODUCT_REPLACEMENT_PROMPT)
const promptRows = prompts.rows

/* ------------------------------------------------------------------ 批次 */

async function generationsById() {
  const records = await listRecords<SyncGeneration>(SYNC_COLLECTIONS.generations)
  return new Map(
    records
      .filter((record) => record.data && (record.data as SyncGeneration).purpose === 'product-replace')
      .map((record) => [record.id, { ...(record.data as SyncGeneration), id: record.id, updatedAt: record.updatedAt } as GenerationItem]),
  )
}

async function batchRows(): Promise<ReplaceBatchItem[]> {
  return (await listRecords<SyncReplaceBatch>(SYNC_COLLECTIONS.replaceBatches))
    .filter((record) => record.data)
    .map((record) => ({ ...(record.data as SyncReplaceBatch), id: record.id, updatedAt: record.updatedAt }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

const ITEM_STATUS: Record<SyncGeneration['status'], string> = { queued: 'queued', running: 'processing', succeeded: 'completed', failed: 'failed' }
const extOf = (mime?: string) => (mime?.includes('jpeg') ? 'jpg' : mime?.includes('webp') ? 'webp' : 'png')

async function listBatches() {
  const [batches, generations] = await Promise.all([batchRows(), generationsById()])
  if (batches.some((batch) => batch.items.some((item) => ['queued', 'running'].includes(generations.get(item.generationId)?.status ?? 'queued')))) startPolling()
  return batches.map((batch) => ({
    id: batch.id,
    status: replaceBatchStatus(batch, generations),
    productId: batch.productId,
    productName: batch.productName,
    promptVersion: batch.promptVersion,
    prompt: batch.prompt,
    productImagePaths: batch.productFileIds.map((fileId) => cloudFileRef(fileId, `${batch.productName || 'product'}.jpg`)),
    variantCount: batch.variantCount,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    items: batch.items.map((item) => {
      const gen = generations.get(item.generationId)
      const base = item.sourceName.replace(/\.[^.]+$/, '')
      return {
        id: item.generationId,
        sourcePath: cloudFileRef(item.sourceFileId, item.sourceName),
        sourceName: item.sourceName,
        status: ITEM_STATUS[gen?.status ?? 'queued'],
        outputPath: gen?.outputFileId ? cloudFileRef(gen.outputFileId, `${batch.productName || 'product'}_${base}.${extOf(gen.outputMime)}`) : undefined,
        exportedAt: item.exportedAt,
        error: gen?.status === 'failed' ? gen.error || '生成失败' : undefined,
        updatedAt: gen?.updatedAt ?? batch.updatedAt,
      }
    }),
  }))
}

async function createBatch(payload: { productId?: string; productName: string; productImagePaths: string[]; sourceImages: Array<{ path: string; name: string }>; variantCount: number; promptVersionId?: string }) {
  const rows = await promptRows()
  const version = rows.find((row) => row.id === payload.promptVersionId) ?? rows.find((row) => row.active) ?? rows[0]
  if (!version) throw new Error('请先保存一个提示词版本')
  const scenes = []
  for (const image of payload.sourceImages) {
    const fileId = fileIdOf(image.path)
    scenes.push({ fileId, name: image.name, aspectRatio: await aspectOf(fileId) })
  }
  const id = await createReplaceBatch({
    productId: payload.productId,
    productName: payload.productName,
    productFileIds: payload.productImagePaths.map(fileIdOf),
    scenes,
    prompt: version.prompt,
    promptVersion: version.version,
    variantCount: Math.min(4, Math.max(1, Math.round(payload.variantCount) || 1)),
  })
  startPolling()
  return { id }
}

/** 页面调用重试时不接错误（电脑端本地重试不会失败），这里把原因提示出来 */
async function retryFailed(id: string) {
  const batch = (await batchRows()).find((row) => row.id === id)
  if (!batch) return
  try {
    await retryFailedItems(batch, await generationsById())
    startPolling()
  } catch (error) {
    toast(`重试失败：${errorMessage(error)}`)
  }
}

/** 云端生成提交后不能暂停 / 取消：提示一下，页面照常刷新 */
async function notPausable() {
  toast('网页版在云端生成，提交后不能暂停或取消，会继续生成完')
}

async function exportResults(paths: string[]) {
  const wanted = new Set(paths.map((path) => parseCloudFileRef(path)?.fileId).filter(Boolean))
  if (!wanted.size) return { canceled: true }
  const [batches, generations] = await Promise.all([batchRows(), generationsById()])
  let index = 0
  for (const path of paths) {
    const ref = parseCloudFileRef(path)
    if (!ref) continue
    try {
      index += 1
      downloadBlob(await fileBlob(ref.fileId), `${String(index).padStart(2, '0')}_${ref.name}`)
    } catch (error) {
      toast(errorMessage(error))
    }
  }
  for (const batch of batches) {
    const ids = batch.items.filter((item) => wanted.has(generations.get(item.generationId)?.outputFileId)).map((item) => item.generationId)
    if (ids.length) await markExported(batch, ids)
  }
  if (index) toast(`已导出 ${index} 张`)
  return { canceled: false, exported: index }
}

const productReplacement = {
  listProducts,
  pickImages: async () => uploadFiles(await chooseImages()),
  importPaths: async (paths: string[]) => {
    const files = paths.map((path) => dropped.get(path)).filter((file): file is File => Boolean(file))
    paths.forEach((path) => {
      dropped.delete(path)
      if (path.startsWith('blob:')) URL.revokeObjectURL(path)
    })
    return uploadFiles(files)
  },
  listBatches,
  createBatch,
  pauseBatch: notPausable,
  resumeBatch: notPausable,
  cancelBatch: notPausable,
  retryFailed,
  listPromptVersions: prompts.listPromptVersions,
  savePromptVersion: prompts.savePromptVersion,
  activatePromptVersion: prompts.activatePromptVersion,
  rollbackPromptVersion: prompts.rollbackPromptVersion,
  exportResults,
} satisfies DesktopApi['productReplacement']

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  productReplacement,
  products: { list: listProducts },
  getPathForFile,
}
