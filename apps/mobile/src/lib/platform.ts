import { Capacitor } from '@capacitor/core'

/**
 * The same Vue app ships as the Android App (Capacitor) and as the web version (static files at /app/).
 * Code that needs native features checks these flags and uses a browser fallback on the web.
 */
export const isNative = Capacitor.isNativePlatform()
export const isWeb = !isNative

/** Save a blob as a file through the browser's download. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function fileNameFor(label: string, mime: string | undefined) {
  const base = (label || 'TiktokCut').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'TiktokCut'
  return `${base}.${EXT_BY_MIME[String(mime || '').toLowerCase()] || (String(mime || '').startsWith('image/') ? 'jpg' : 'mp4')}`
}
