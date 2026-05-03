import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getAppPaths } from './paths'

export type UserFontFile = { fileName: string; absPath: string }

const FONT_EXT = /\.(woff2|otf|ttf|ttc)$/i

export function userFontsDir(): string {
  const { dataDir } = getAppPaths()
  return join(dataDir, 'fonts')
}

export async function ensureUserFontsDir() {
  await mkdir(userFontsDir(), { recursive: true })
}

export async function listUserFontFiles(): Promise<UserFontFile[]> {
  try {
    const dir = userFontsDir()
    const names = (await readdir(dir)).filter((n) => FONT_EXT.test(n) && !n.startsWith('.'))
    names.sort((a, b) => a.localeCompare(b, 'en'))
    return names.map((fileName) => ({ fileName, absPath: join(dir, fileName) }))
  } catch {
    return []
  }
}

/** 导入字体文件到 userData/videogenerate/fonts/（同名覆盖） */
export async function importUserFonts(srcPaths: string[]): Promise<{ imported: string[] }> {
  await ensureUserFontsDir()
  const imported: string[] = []
  for (const p of srcPaths ?? []) {
    const src = String(p ?? '').trim()
    if (!src) continue
    const name = basename(src)
    if (!FONT_EXT.test(name)) continue
    const dest = join(userFontsDir(), name)
    try {
      await copyFile(src, dest)
      imported.push(name)
    } catch {
      // ignore single file error
    }
  }
  return { imported }
}

