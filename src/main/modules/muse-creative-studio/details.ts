import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

export const IMAGE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.webp'])
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024
/** Product pictures next to the frames. muse.ai itself takes 10 files per message. */
export const MAX_DETAIL_IMAGES = 4

/** Pictures Muse would accept, the same picture stored twice only once. */
export async function usableImages(paths: string[], limit = Infinity) {
  const seen = new Set<string>()
  const out: Array<{ path: string; hash: string }> = []
  for (const path of paths) {
    if (out.length >= limit) break
    if (!path || !IMAGE_TYPES.has(extname(path).toLowerCase())) continue
    const info = await stat(path).catch(() => null)
    if (!info?.isFile() || !info.size || info.size > MAX_IMAGE_BYTES) continue
    const hash = createHash('sha256').update(await readFile(path)).digest('hex')
    if (seen.has(hash)) continue
    seen.add(hash)
    out.push({ path, hash })
  }
  return out
}

/** What the user added comes first, then the product library fills up the rest. Frames are never repeated. */
export async function detailImagePicker(manual: string[], library: string[]) {
  // Read once per batch; one spare, as one of them may be the frame itself.
  const pool = await usableImages([...manual, ...library], MAX_DETAIL_IMAGES + 1)
  return async (frame?: string) => {
    const taken = frame && pool.length ? (await usableImages([frame]))[0]?.hash : undefined
    return pool.filter((item) => item.hash !== taken).slice(0, MAX_DETAIL_IMAGES).map((item) => item.path)
  }
}
