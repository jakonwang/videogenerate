import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { getAppPaths } from '../../lib/paths'
import { runFfmpeg } from '../ffmpeg/runner'

const cache = new Map<string, Promise<string | null>>()

function hashKey(parts: string[]) {
  const h = createHash('sha1')
  for (const p of parts) h.update(p)
  return h.digest('hex')
}

export async function generateThumbnailJpg(input: { filePath: string; atSec?: number }): Promise<string | null> {
  const atSec = input.atSec ?? 0.5

  // 用 mtime/size 作为缓存因子，文件更新会自动生成新缩略图
  let size = 0
  let mtimeMs = 0
  try {
    const s = await stat(input.filePath)
    size = s.size
    mtimeMs = s.mtimeMs
  } catch {
    // 文件不存在或不可读
    return null
  }

  const key = hashKey([input.filePath, String(size), String(mtimeMs), String(atSec)])
  const existing = cache.get(key)
  if (existing) return existing

  const p = (async () => {
    const { cacheDir } = getAppPaths()
    const dir = join(cacheDir, 'thumbs')
    await mkdir(dir, { recursive: true })
    const outPath = join(dir, `${key}.jpg`)

    try {
      // 抽取 0.5s/1s 帧，输出 jpg；统一缩略图尺寸 240x426（9:16）
      await runFfmpeg({
        args: [
          '-y',
          '-ss',
          `${atSec}`,
          '-i',
          input.filePath,
          '-frames:v',
          '1',
          '-q:v',
          '3',
          '-vf',
          'scale=240:426:force_original_aspect_ratio=decrease,pad=240:426:(ow-iw)/2:(oh-ih)/2:color=black',
          outPath,
        ],
      })
      return outPath
    } catch {
      return null
    }
  })()

  cache.set(key, p)
  return p
}

