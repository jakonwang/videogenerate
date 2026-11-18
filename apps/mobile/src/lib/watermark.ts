import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncWatermarkTemplate } from '@shared/cloud/sync'
import { fileBlob, uploadRaw } from './files'
import { deleteRecord, listRecords, newId, saveRecord, syncState } from './sync'

/**
 * 商品图水印（与电脑端一致）：原图居中裁成正方形、白底，盖上同尺寸的透明 PNG 模板，导出 JPEG。
 * 在手机本地用 canvas 处理，不消耗 AI 额度。
 */

const MAX_EDGE = 2000
const TEMPLATE_KEY = 'product-watermark.templateFileId'

export function savedTemplate() {
  try {
    return localStorage.getItem(TEMPLATE_KEY) || ''
  } catch {
    return ''
  }
}

export function rememberTemplate(fileId: string) {
  try {
    localStorage.setItem(TEMPLATE_KEY, fileId)
  } catch {
    /* 下次重新选模板即可 */
  }
}

/** 检查模板：必须是正方形、带透明的 PNG / WebP */
export async function checkTemplate(file: File) {
  if (!/^image\/(png|webp)$/.test(file.type)) throw new Error('水印模板需要 PNG 或 WebP 格式')
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(width, 256)
  canvas.height = Math.min(height, 256)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  if (width !== height) throw new Error('水印模板需要是正方形')
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let transparent = false
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 250) {
      transparent = true
      break
    }
  }
  if (!transparent) throw new Error('水印模板需要带透明区域')
}

export async function uploadTemplate(file: File) {
  await checkTemplate(file)
  const ref = await uploadRaw(file, file.type)
  rememberTemplate(ref.fileId)
  return ref.fileId
}

/** 给一张图加水印，返回上传后的 fileId */
export async function applyWatermark(sourceFileId: string, templateFileId: string) {
  const [source, template] = await Promise.all([fileBlob(sourceFileId).then(createImageBitmap), fileBlob(templateFileId).then(createImageBitmap)])
  try {
    const side = Math.min(source.width, source.height)
    const size = Math.min(side, MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, size, size)
    ctx.drawImage(template, 0, 0, size, size)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('图片处理失败'))), 'image/jpeg', 0.92))
    return (await uploadRaw(blob, 'image/jpeg')).fileId
  } finally {
    source.close()
    template.close()
  }
}

/* ------------------------------------------------------------------ 保存的模板（和电脑端「选择已保存模板」一样，多端同步） */

export type WatermarkTemplateItem = SyncWatermarkTemplate & { id: string }

export function useWatermarkTemplates() {
  const items = ref<WatermarkTemplateItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncWatermarkTemplate>(SYNC_COLLECTIONS.watermarkTemplates)
      items.value = records.filter((r) => r.data).map((r) => ({ ...(r.data as SyncWatermarkTemplate), id: r.id })).sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

export async function saveWatermarkTemplate(name: string, fileId: string) {
  await saveRecord<SyncWatermarkTemplate>(SYNC_COLLECTIONS.watermarkTemplates, newId('wmt'), { name: name.trim().slice(0, 40) || '水印模板', fileId, createdAt: Date.now() })
}

export const removeWatermarkTemplate = (id: string) => deleteRecord(SYNC_COLLECTIONS.watermarkTemplates, id)
