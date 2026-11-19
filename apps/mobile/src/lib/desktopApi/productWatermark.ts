/**
 * 网页版的商品图水印接口：电脑端「商品图水印」页面（ProductWatermarkView）在网页上原样显示，
 * 它调用的 window.api.productWatermark 由这里提供。
 *
 * - 模板存在 watermark-templates（和手机 App 同一份）；保存前和手机端一样检查：正方形、带透明的 PNG / WebP。
 * - 处理在浏览器里用 canvas 做（和电脑端一样：居中裁正方形、白底、盖模板、导出 JPEG），不消耗 AI 额度；
 *   每张结果记进作品库 / 审核收件箱，并下载到本机（网页上的「输出文件夹」就是浏览器下载）。
 */
import { cloudFileRef } from '@shared/cloud/relay'
import { SYNC_COLLECTIONS, type SyncWatermarkTemplate } from '@shared/cloud/sync'
import { fileBlob } from '../files'
import { saveLocalResult } from '../generate'
import { downloadBlob } from '../platform'
import { errorMessage } from '../session'
import { getRecord, listRecords, newId, saveRecord } from '../sync'
import { toast } from '../toast'
import { applyWatermark, checkTemplate, rememberTemplate, removeWatermarkTemplate } from '../watermark'
import type { DesktopApi } from './contract'
import { cloudFileIdOf, fileNameOf, getPathForFile, pickFiles } from './files'

/** 网页上「选择输出文件夹」的结果：处理完的图由浏览器下载 */
const BROWSER_DOWNLOADS = '浏览器下载（处理完自动下载到本机）'

/* ------------------------------------------------------------------ 模板 */

const sizes = new Map<string, { width: number; height: number }>()
async function sizeOf(fileId: string) {
  let size = sizes.get(fileId)
  if (!size) {
    const bitmap = await createImageBitmap(await fileBlob(fileId))
    size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    sizes.set(fileId, size)
  }
  return size
}

async function templateRows() {
  return (await listRecords<SyncWatermarkTemplate>(SYNC_COLLECTIONS.watermarkTemplates))
    .filter((record) => record.data)
    .map((record) => ({ ...(record.data as SyncWatermarkTemplate), id: record.id }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

async function toDesktopTemplate(row: SyncWatermarkTemplate & { id: string }) {
  const size = await sizeOf(row.fileId).catch(() => ({ width: 0, height: 0 }))
  return { id: row.id, name: row.name, ...size, filePath: cloudFileRef(row.fileId, `${row.name || 'template'}.png`) }
}

async function listTemplates() {
  return Promise.all((await templateRows()).map(toDesktopTemplate))
}

async function saveTemplate(payload: { filePath: string; name: string }) {
  const fileId = await cloudFileIdOf(payload.filePath)
  const blob = await fileBlob(fileId)
  await checkTemplate(new File([blob], fileNameOf(payload.filePath), { type: blob.type || 'image/png' }))
  const id = newId('wmt')
  const row: SyncWatermarkTemplate = { name: payload.name.trim().slice(0, 40) || '水印模板', fileId, createdAt: Date.now() }
  await saveRecord<SyncWatermarkTemplate>(SYNC_COLLECTIONS.watermarkTemplates, id, row)
  rememberTemplate(fileId)
  return toDesktopTemplate({ ...row, id })
}

async function renameTemplate(payload: { id: string; name: string }) {
  const record = await getRecord<SyncWatermarkTemplate>(SYNC_COLLECTIONS.watermarkTemplates, payload.id)
  if (!record?.data) throw new Error('模板不存在，请刷新后重试')
  const row = { ...record.data, name: payload.name.trim().slice(0, 40) || record.data.name }
  await saveRecord<SyncWatermarkTemplate>(SYNC_COLLECTIONS.watermarkTemplates, payload.id, row)
  return toDesktopTemplate({ ...row, id: payload.id })
}

async function deleteTemplate(id: string) {
  await removeWatermarkTemplate(id)
  return { ok: true }
}

/* ------------------------------------------------------------------ 批量处理 */

async function processBatch(payload: { templateId: string; sourcePaths: string[]; outputDir: string }) {
  const template = (await templateRows()).find((row) => row.id === payload.templateId)
  if (!template) throw new Error('模板不存在，请重新选择')
  const success: string[] = []
  const failed: Array<{ name: string; reason: string }> = []
  for (const [index, path] of payload.sourcePaths.entries()) {
    const name = fileNameOf(path)
    try {
      const sourceFileId = await cloudFileIdOf(path)
      const output = await applyWatermark(sourceFileId, template.fileId)
      await saveLocalResult({ kind: 'image', purpose: 'product-watermark', sourceFileId, outputFileId: output, outputMime: 'image/jpeg', label: `水印 ${index + 1}` })
      const outName = `${name.replace(/\.[^.]+$/, '')}_watermark.jpg`
      downloadBlob(await fileBlob(output), outName)
      success.push(cloudFileRef(output, outName))
    } catch (error) {
      failed.push({ name, reason: errorMessage(error) })
    }
  }
  if (success.length) toast(`已下载 ${success.length} 张，结果也在作品库和审核收件箱`)
  return { successCount: success.length, failedCount: failed.length, success, failed }
}

const productWatermark = { listTemplates, saveTemplate, renameTemplate, deleteTemplate, processBatch } satisfies DesktopApi['productWatermark']

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  productWatermark,
  pickFiles,
  getPathForFile,
  pickDir: async () => BROWSER_DOWNLOADS,
}
