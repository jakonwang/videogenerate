import { reactive } from 'vue'
import { fileLink } from '@/lib/fileLinks'

/**
 * 网页版替身：电脑端页面里的 localMediaUrl / thumbnailUrl（原来是电脑本地的 vg:// 地址）。
 * 本地路径经「电脑代办」请电脑把文件（带宽度时是缩略图 / 视频封面）传到云端，再用签名链接显示。
 * 第一次返回空字符串，拿到链接后页面自动刷新；同一路径只请求一次。
 */

const PASSTHROUGH = /^(https?:|data:|blob:)/i
const urls = reactive<Record<string, string>>({})
const queued: Array<{ key: string; path: string; width?: number }> = []
const requested = new Set<string>()
let active = 0
const MAX_PARALLEL = 4

type MediaApi = { publish: (input: { path: string; width?: number }) => Promise<{ fileId: string; mime: string }> }
const media = () => (window as unknown as { api?: { media?: MediaApi } }).api?.media

function pump() {
  while (active < MAX_PARALLEL && queued.length) {
    const job = queued.shift()!
    active += 1
    void (async () => {
      try {
        const published = await media()?.publish({ path: job.path, width: job.width })
        if (published) urls[job.key] = await fileLink(published.fileId)
      } catch {
        // 电脑不在线 / 文件不在数据目录：保持空白，下次进入页面再试
        requested.delete(job.key)
      } finally {
        active -= 1
        pump()
      }
    })()
  }
}

export function localMediaUrl(path?: string | null, options: { width?: number } = {}): string {
  const text = String(path || '').trim()
  if (!text) return ''
  if (PASSTHROUGH.test(text)) return text
  if (/^vg:/i.test(text)) {
    const inner = new URL(text).searchParams.get('path')
    return inner ? localMediaUrl(inner, options) : ''
  }
  const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1))
  const width = options.width ? Math.round(options.width * ratio) : undefined
  const key = `${text}|${width ?? ''}`
  const hit = urls[key]
  if (hit) return hit
  if (!requested.has(key)) {
    requested.add(key)
    queued.push({ key, path: text, width })
    pump()
  }
  return ''
}

/** Shorthand for card/grid thumbnails. */
export function thumbnailUrl(path?: string | null, width = 320): string {
  return localMediaUrl(path, { width })
}

/** 网页版的「打开文件」：电脑上的文件传到云端后在新标签页打开 */
export async function openDesktopFile(path: string) {
  const text = String(path || '').trim()
  if (!text) return
  const published = await media()?.publish({ path: text })
  if (!published) throw new Error('电脑端不在线')
  window.open(await fileLink(published.fileId), '_blank', 'noopener')
}

/* ------------------------------------------------------------------ vg:// 地址改写 */

/** 电脑端有些页面直接拼 `vg://file?path=…` 地址：网页上把这些地址换成云端链接（拿到后再替换，Vue 不会改回去） */
const vgResolved = new Map<string, Promise<string>>()
function resolveVg(value: string): Promise<string> {
  let hit = vgResolved.get(value)
  if (!hit) {
    hit = resolveVgNow(value)
    vgResolved.set(value, hit)
    // 失败的（电脑不在线等）下次再试
    hit.then((url) => !url && vgResolved.delete(value)).catch(() => vgResolved.delete(value))
  }
  return hit
}
async function resolveVgNow(value: string): Promise<string> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return ''
  }
  const path = url.searchParams.get('path')
  if (!path) return ''
  const width = Number(url.searchParams.get('w')) || undefined
  const published = await media()?.publish({ path, width })
  return published ? await fileLink(published.fileId) : ''
}

const MEDIA_ATTRS = ['src', 'poster']

function rewriteElement(el: Element) {
  for (const attr of MEDIA_ATTRS) {
    const value = el.getAttribute(attr)
    if (!value || !/^vg:/i.test(value)) continue
    void resolveVg(value)
      .then((url) => {
        if (url && el.getAttribute(attr) === value) el.setAttribute(attr, url)
      })
      .catch(() => undefined)
  }
  const style = el.getAttribute('style')
  const match = style?.match(/url\((['"]?)(vg:[^'")]+)\1\)/i)
  if (style && match) {
    void resolveVg(match[2]!)
      .then((url) => {
        const current = el.getAttribute('style')
        if (url && current?.includes(match[2]!)) el.setAttribute('style', current.split(match[2]!).join(url))
      })
      .catch(() => undefined)
  }
}

let observer: MutationObserver | null = null
export function installDesktopMediaRewriter() {
  if (observer || typeof MutationObserver === 'undefined') return
  const scan = (root: Element) => {
    rewriteElement(root)
    root.querySelectorAll('[src^="vg:"],[poster^="vg:"],[style*="vg:"]').forEach(rewriteElement)
  }
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') rewriteElement(record.target as Element)
      else record.addedNodes.forEach((node) => node instanceof Element && scan(node))
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: [...MEDIA_ATTRS, 'style'] })
  scan(document.body)
}
