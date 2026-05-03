import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getAppPaths } from './paths'

export type UserStickerFile = { fileName: string; absPath: string }

const STICKER_EXT = /\.(png|webp)$/i

export function userStickersDir(): string {
  const { dataDir } = getAppPaths()
  return join(dataDir, 'stickers')
}

export async function ensureUserStickersDir() {
  await mkdir(userStickersDir(), { recursive: true })
}

export async function listUserStickerFiles(): Promise<UserStickerFile[]> {
  try {
    const dir = userStickersDir()
    const names = (await readdir(dir)).filter((n) => STICKER_EXT.test(n) && !n.startsWith('.'))
    names.sort((a, b) => a.localeCompare(b, 'en'))
    return names.map((fileName) => ({ fileName, absPath: join(dir, fileName) }))
  } catch {
    return []
  }
}

/** 导入贴纸到 userData/videogenerate/stickers/（同名覆盖） */
export async function importUserStickers(srcPaths: string[]): Promise<{ imported: string[] }> {
  await ensureUserStickersDir()
  const imported: string[] = []
  for (const p of srcPaths ?? []) {
    const src = String(p ?? '').trim()
    if (!src) continue
    const name = basename(src)
    if (!STICKER_EXT.test(name)) continue
    const dest = join(userStickersDir(), name)
    try {
      await copyFile(src, dest)
      imported.push(name)
    } catch {
      // ignore
    }
  }
  return { imported }
}

