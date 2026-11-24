import type { SyncFileRef } from '@shared/cloud/sync'
import { cloud } from './session'

/**
 * 云端文件：上传前在本机压缩图片；下载需要带登录令牌，所以用 fetch 取回后转成 blob: 地址显示。
 * 已下载的文件存进 Cache Storage，按内容 hash 寻址，下次打开直接读本地。
 */

const CACHE_NAME = 'tiktokcut-files-v1'
const objectUrls = new Map<string, Promise<string>>()
const MAX_IMAGE_EDGE = 1600

async function cache() {
  return 'caches' in window ? caches.open(CACHE_NAME) : null
}

function cacheKey(fileId: string) {
  return `https://files.local/${fileId}`
}

export function fileUrl(fileId: string | undefined | null): Promise<string> {
  if (!fileId) return Promise.resolve('')
  let url = objectUrls.get(fileId)
  if (!url) {
    url = (async () => {
      const store = await cache()
      const hit = await store?.match(cacheKey(fileId))
      if (hit) return URL.createObjectURL(await hit.blob())
      const blob = await cloud.sync.downloadFile(fileId)
      await store?.put(cacheKey(fileId), new Response(blob, { headers: { 'Content-Type': blob.type } }))
      return URL.createObjectURL(blob)
    })()
    url.catch(() => objectUrls.delete(fileId))
    objectUrls.set(fileId, url)
  }
  return url
}

/** 把手机里选的图片缩到最长边 1600px、转 JPEG 后上传，返回云端引用 */
export async function uploadImage(file: Blob, options: { maxEdge?: number; quality?: number } = {}): Promise<SyncFileRef> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, (options.maxEdge ?? MAX_IMAGE_EDGE) / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('图片处理失败'))), 'image/jpeg', options.quality ?? 0.86),
  )
  const result = await cloud.sync.uploadFile(blob, 'image/jpeg')
  // Seed the cache so the new image shows without a round trip.
  const store = await cache()
  await store?.put(cacheKey(result.fileId), new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }))
  return { fileId: result.fileId, mime: 'image/jpeg', width, height }
}

/** 原样上传（不压缩、不转格式，例如带透明的 PNG 水印模板） */
export async function uploadRaw(blob: Blob, mime: string): Promise<SyncFileRef> {
  const result = await cloud.sync.uploadFile(blob, mime)
  const store = await cache()
  await store?.put(cacheKey(result.fileId), new Response(blob, { headers: { 'Content-Type': mime } }))
  return { fileId: result.fileId, mime }
}

/** 取回云端文件的二进制（优先本地缓存） */
export async function fileBlob(fileId: string): Promise<Blob> {
  const url = await fileUrl(fileId)
  return (await fetch(url)).blob()
}

export async function clearFileCache() {
  objectUrls.forEach((url) => void url.then((value) => URL.revokeObjectURL(value)).catch(() => undefined))
  objectUrls.clear()
  if ('caches' in window) await caches.delete(CACHE_NAME)
}

export const uploadImageBlob = uploadImage
