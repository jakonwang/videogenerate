import { constants, existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import { getCloudSyncSession } from '../../lib/cloudLicense'
import { getAppPaths } from '../../lib/paths'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MAX_EDGE = 2048
const MAX_FILES = 100

function session() {
  const current = getCloudSyncSession()
  if (!current) throw new Error('请先登录账号再使用批量换景')
  return current
}

const pending = new Map<string, Promise<string>>()

export const sceneSwapService = {
  client: () => session().client.sceneSwap,

  /** 文件夹展开成里面的图片（不进子文件夹），按文件名排序 */
  async expandPaths(paths: string[]): Promise<Array<{ path: string; name: string }>> {
    const out: string[] = []
    for (const path of paths) {
      const info = await stat(path).catch(() => null)
      if (info?.isDirectory()) {
        const names = (await readdir(path)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        out.push(...names.map((name) => join(path, name)))
      } else if (info?.isFile()) out.push(path)
    }
    return out.filter((path) => IMAGE_EXT.has(extname(path).toLowerCase())).slice(0, MAX_FILES).map((path) => ({ path, name: basename(path) }))
  },

  /** 上传一张：转正、最长边 2048、高质量 JPEG（和云端处理的尺寸一致，不损失细节） */
  async upload(path: string): Promise<{ fileId: string }> {
    if (!IMAGE_EXT.has(extname(path).toLowerCase())) throw new Error('只支持 JPG、PNG、WEBP 图片')
    const body = await sharp(path).rotate().flatten({ background: '#ffffff' }).resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
    const { fileId } = await session().client.sync.uploadFile(body, 'image/jpeg')
    return { fileId }
  },

  /** 云端图片的本机缓存路径（页面显示用） */
  async imagePath(fileId: string): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(fileId)) throw new Error('图片编号不正确')
    const { client, userId } = session()
    const dir = join(getAppPaths().dataDir, 'scene-swap', userId.replace(/[^a-zA-Z0-9_-]/g, '_'))
    const path = join(dir, `${fileId}.jpg`)
    if (existsSync(path)) return path
    let job = pending.get(path)
    if (!job) {
      job = (async () => {
        const body = Buffer.from(await (await client.sync.downloadFile(fileId)).arrayBuffer())
        await mkdir(dir, { recursive: true })
        const temp = `${path}.${randomUUID()}.tmp`
        await writeFile(temp, body)
        await rename(temp, path)
        return path
      })().finally(() => pending.delete(path))
      pending.set(path, job)
    }
    return job
  },

  /** 导出：沿用原文件名，重名自动加序号，不覆盖用户已有的文件 */
  async exportTo(directory: string, files: Array<{ fileId: string; name: string }>): Promise<number> {
    let count = 0
    for (const file of files) {
      const source = await sceneSwapService.imagePath(file.fileId)
      const base = file.name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 100) || 'image'
      for (let n = 1; ; n += 1) {
        try {
          await copyFile(source, join(directory, `${base}${n > 1 ? `_${n}` : ''}.jpg`), constants.COPYFILE_EXCL)
          count += 1
          break
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
      }
    }
    return count
  },
}
