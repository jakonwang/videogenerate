/**
 * URLs for local media served by the main process `vg://` protocol.
 *
 * Pass `width` (CSS px) for images shown as cards/thumbnails: the main process
 * then returns a cached, downscaled WebP instead of the original file, so the
 * renderer does not decode multi-megapixel photos for 100–300px tiles.
 * Non-image paths (e.g. videos) and remote/data/blob URLs are returned as-is
 * apart from the usual `vg://` wrapping; the protocol falls back to the
 * original bytes whenever a thumbnail cannot be produced.
 */
const PASSTHROUGH = /^(https?:|data:|blob:|vg:)/i

export function localMediaUrl(path?: string | null, options: { width?: number } = {}): string {
  const text = String(path || '').trim()
  if (!text) return ''
  if (PASSTHROUGH.test(text)) return text
  const base = `vg://file?path=${encodeURIComponent(text)}`
  if (!options.width) return base
  const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1))
  return `${base}&w=${Math.round(options.width * ratio)}`
}

/** Shorthand for card/grid thumbnails. */
export function thumbnailUrl(path?: string | null, width = 320): string {
  return localMediaUrl(path, { width })
}
