import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

/**
 * 电脑代办：网页上显示电脑端页面里的本地图片 / 视频（复刻等页面）。
 * 网页请求一个本地路径 → 电脑把文件（或缩略图）传到云端，返回文件 id，网页用签名链接显示。
 * 只允许软件自己的数据目录，网页拿不到电脑上的其它文件；同一个文件不重复上传。
 */

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v'])
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.m4v': 'video/mp4' }
/** 网页上直接看原视频时的大小上限（缩略图不受限） */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

export type RelayMediaDeps = {
  roots: () => string[]
  upload: (body: Buffer, mime: string) => Promise<{ fileId: string }>
  readFile: (path: string) => Promise<Buffer>
  /** 图片缩略图（webp）/ 视频封面（jpg），返回本地文件路径 */
  imageThumb: (path: string, width: number) => Promise<string | null>
  videoPoster: (path: string, width: number) => Promise<string | null>
}

const cache = new Map<string, { fileId: string; mime: string }>()

function inside(path: string, roots: string[]) {
  const full = resolve(path).toLowerCase()
  return roots.some((root) => {
    const base = resolve(root).toLowerCase()
    return full === base || full.startsWith(base.endsWith(sep) ? base : base + sep)
  })
}

export async function publishLocalMedia(deps: RelayMediaDeps, input: { path?: string; width?: number }) {
  const path = String(input?.path || '').trim()
  if (!path) throw new Error('缺少文件路径')
  if (!inside(path, deps.roots())) throw new Error('网页只能查看软件数据目录里的文件')
  const ext = extname(path).toLowerCase()
  const isImage = IMAGE_EXT.has(ext)
  const isVideo = VIDEO_EXT.has(ext)
  if (!isImage && !isVideo) throw new Error('只能查看图片或视频')
  const info = await stat(path)
  const width = Math.max(0, Math.min(2000, Math.round(Number(input?.width) || 0)))
  const key = `${path}|${info.size}|${info.mtimeMs}|${width}`
  const hit = cache.get(key)
  if (hit) return hit
  let source = path
  let mime = MIME[ext] || 'application/octet-stream'
  if (width && isImage) {
    const thumb = await deps.imageThumb(path, width).catch(() => null)
    if (thumb) {
      source = thumb
      mime = thumb.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'
    }
  } else if (width && isVideo) {
    // 卡片里的视频缩略图：给一帧封面，不传整段视频
    const poster = await deps.videoPoster(path, width).catch(() => null)
    if (poster) {
      source = poster
      mime = 'image/jpeg'
    }
  }
  if (source === path && info.size > MAX_UPLOAD_BYTES) throw new Error('文件太大，请在电脑上查看')
  const { fileId } = await deps.upload(await deps.readFile(source), mime)
  const result = { fileId, mime }
  cache.set(key, result)
  if (cache.size > 2000) cache.delete(cache.keys().next().value!)
  return result
}

export async function defaultRelayMediaDeps(): Promise<RelayMediaDeps> {
  const [{ getAppPaths }, fs, { generateThumbnailJpg }] = await Promise.all([
    import('../../lib/paths'),
    import('node:fs/promises'),
    import('../media/thumbnail'),
  ])
  return {
    roots: () => {
      const paths = getAppPaths()
      return [paths.dataDir, paths.userData]
    },
    upload: async (body, mime) => {
      const { getCloudSyncSession } = await import('../../lib/cloudLicense')
      const session = await getCloudSyncSession()
      if (!session) throw new Error('电脑端没有登录')
      return await session.client.sync.uploadFile(new Blob([new Uint8Array(body)], { type: mime }), mime)
    },
    readFile: (path) => fs.readFile(path),
    imageThumb: async (path, width) => {
      const sharp = (await import('sharp')).default
      const { join } = await import('node:path')
      const target = join(getAppPaths().cacheDir, 'relay-thumbs', `${Buffer.from(path).toString('base64url').slice(-80)}_${width}.webp`)
      await fs.mkdir(join(getAppPaths().cacheDir, 'relay-thumbs'), { recursive: true })
      await sharp(path).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(target)
      return target
    },
    // JPEG frames need even sizes.
    videoPoster: (path, width) => generateThumbnailJpg({ filePath: path, width: Math.round(width / 2) * 2, height: Math.round((width * 16) / 9 / 2) * 2 }),
  }
}
