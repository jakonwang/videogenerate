import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { userStickersDir } from './userStickers'

export type StickerEntry = { fileName: string; displayName: string; absPath: string }
export type StickerScope = 'bundled' | 'user'
export type StickerRef = `${StickerScope}:${string}`

export function toStickerRef(scope: StickerScope, fileName: string): StickerRef {
  return `${scope}:${fileName}` as StickerRef
}

function isSticker(n: string): boolean {
  return /\.(png|webp)$/i.test(n) && !n.startsWith('.')
}

function existsDir(p: string): boolean {
  try {
    return existsSync(p)
  } catch {
    return false
  }
}

/** 主进程 out/main/resources/stickers、或项目根 resources/stickers（开发 cwd） */
export function findBundledStickersDir(): string | null {
  const candidates = [join(__dirname, 'resources', 'stickers'), join(process.cwd(), 'resources', 'stickers')]
  for (const d of candidates) {
    if (!existsDir(d)) continue
    try {
      const names = readdirSync(d)
      if (names.some(isSticker) || existsSync(join(d, 'README.md'))) return d
    } catch {
      // ignore
    }
  }
  return null
}

export function listBundledStickers(): StickerEntry[] {
  const dir = findBundledStickersDir()
  if (!dir) return []
  try {
    const names = readdirSync(dir).filter(isSticker).sort((a, b) => a.localeCompare(b, 'en'))
    return names.map((fileName) => {
      const displayName = fileName.replace(/\.(png|webp)$/i, '')
      return { fileName, displayName, absPath: join(dir, fileName) }
    })
  } catch {
    return []
  }
}

export function resolveBundledStickerPath(fileName: string): string | null {
  const target = String(fileName ?? '').trim()
  if (!target) return null
  const dir = findBundledStickersDir()
  if (!dir) return null
  const abs = join(dir, target)
  try {
    if (existsSync(abs) && isSticker(target)) return abs
  } catch {
    // ignore
  }
  return null
}

export function resolveUserStickerPath(fileName: string): string | null {
  const target = String(fileName ?? '').trim()
  if (!target) return null
  const dir = userStickersDir()
  const abs = join(dir, target)
  try {
    if (existsSync(abs) && isSticker(target)) return abs
  } catch {
    // ignore
  }
  return null
}

export function parseStickerRef(input: string): { scope: StickerScope; fileName: string } | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const idx = raw.indexOf(':')
  if (idx <= 0) return null
  const scope = raw.slice(0, idx).trim() as StickerScope
  const fileName = raw.slice(idx + 1).trim()
  if (!fileName || !isSticker(fileName)) return null
  if (scope !== 'bundled' && scope !== 'user') return null
  return { scope, fileName }
}

/**
 * 兼容策略：
 * 1) 新字段 ref：按 scope 精确解析；
 * 2) 旧字段 fileName：优先 user，再 bundled（避免用户导入同名贴纸被内置覆盖）。
 */
export function resolveStickerByRefOrFileName(input: {
  ref?: string | null
  fileName?: string | null
}): { filePath: string; scope: StickerScope; fileName: string } | null {
  const parsed = parseStickerRef(String(input.ref ?? ''))
  if (parsed) {
    const abs =
      parsed.scope === 'user'
        ? resolveUserStickerPath(parsed.fileName)
        : resolveBundledStickerPath(parsed.fileName)
    if (abs) return { filePath: abs, scope: parsed.scope, fileName: parsed.fileName }
  }

  const legacyName = String(input.fileName ?? '').trim()
  if (!legacyName || !isSticker(legacyName)) return null
  const userAbs = resolveUserStickerPath(legacyName)
  if (userAbs) return { filePath: userAbs, scope: 'user', fileName: legacyName }
  const bundledAbs = resolveBundledStickerPath(legacyName)
  if (bundledAbs) return { filePath: bundledAbs, scope: 'bundled', fileName: legacyName }
  return null
}

