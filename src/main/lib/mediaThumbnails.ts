import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAppPaths } from './paths'

/**
 * Resized, disk-cached thumbnails for the `vg://file?path=…&w=…` protocol.
 *
 * Grid/list views used to load original photos (often several megapixels) for
 * 100–300px cards; the renderer then decoded and downscaled every one of them
 * on its main thread. Serving a small WebP keeps scrolling and page switches
 * smooth and cuts renderer memory. sharp runs on the libuv thread pool, so the
 * Electron main thread is not blocked.
 */

const RESIZABLE = /\.(png|jpe?g|webp|bmp|gif|tiff?|avif)$/i
const ALLOWED_WIDTHS = [96, 160, 240, 320, 480, 640, 960]
const MAX_CONCURRENT = 4

type SharpFactory = typeof import('sharp')
let sharpPromise: Promise<SharpFactory | null> | null = null
const inFlight = new Map<string, Promise<Buffer | null>>()
let active = 0
const waiters: Array<() => void> = []

function loadSharp() {
  sharpPromise ??= import('sharp')
    .then((module) => ((module as any).default ?? module) as SharpFactory)
    .catch(() => null)
  return sharpPromise
}

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve))
  active++
  try {
    return await task()
  } finally {
    active--
    waiters.shift()?.()
  }
}

/** Snap requested width to a small set so the cache stays bounded. */
export function normalizeThumbnailWidth(raw: string | null): number | null {
  const requested = Number(raw)
  if (!Number.isFinite(requested) || requested <= 0) return null
  return ALLOWED_WIDTHS.find((width) => width >= requested) ?? ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1]
}

export function canThumbnail(filePath: string) {
  return RESIZABLE.test(filePath)
}

/**
 * Returns WebP bytes for `filePath` scaled down to `width` (never upscaled),
 * or null when the image cannot be processed (caller falls back to the original).
 */
export async function getThumbnail(filePath: string, width: number, mtimeMs: number, size: number): Promise<Buffer | null> {
  const key = createHash('sha1').update(`${filePath}|${mtimeMs}|${size}|${width}`).digest('hex')
  const cacheDir = join(getAppPaths().cacheDir, 'thumbnails', key.slice(0, 2))
  const cachePath = join(cacheDir, `${key}.webp`)
  try {
    return await readFile(cachePath)
  } catch {
    /* not cached yet */
  }
  const pending = inFlight.get(key)
  if (pending) return pending
  const job = withSlot(async () => {
    const sharp = await loadSharp()
    if (!sharp) return null
    try {
      const output = await sharp(filePath, { animated: false, failOn: 'none' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
      await mkdir(cacheDir, { recursive: true })
      const tmpPath = `${cachePath}.${process.pid}.tmp`
      await writeFile(tmpPath, output)
      await rename(tmpPath, cachePath).catch(() => undefined)
      return output
    } catch {
      return null
    }
  }).finally(() => inFlight.delete(key))
  inFlight.set(key, job)
  return job
}
