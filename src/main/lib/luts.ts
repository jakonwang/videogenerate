import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export type LutEntry = { fileName: string; displayName: string; absPath: string }

function existsDir(p: string): boolean {
  try {
    return existsSync(p)
  } catch {
    return false
  }
}

function isCube(n: string): boolean {
  return /\.cube$/i.test(n) && !n.startsWith('.')
}

/** 主进程 out/main/resources/luts、或项目根 resources/luts（开发 cwd） */
export function findBundledLutsDir(): string | null {
  const candidates = [join(__dirname, 'resources', 'luts'), join(process.cwd(), 'resources', 'luts')]
  for (const d of candidates) {
    if (!existsDir(d)) continue
    try {
      const names = readdirSync(d)
      if (names.some(isCube) || existsSync(join(d, 'README.md'))) return d
    } catch {
      // ignore
    }
  }
  return null
}

export function listBundledLuts(): LutEntry[] {
  const dir = findBundledLutsDir()
  if (!dir) return []
  try {
    const names = readdirSync(dir).filter(isCube).sort((a, b) => a.localeCompare(b, 'en'))
    return names.map((fileName) => {
      const displayName = fileName.replace(/\.cube$/i, '')
      return { fileName, displayName, absPath: join(dir, fileName) }
    })
  } catch {
    return []
  }
}

export function resolveBundledLutPath(fileName: string): string | null {
  const target = String(fileName ?? '').trim()
  if (!target) return null
  const dir = findBundledLutsDir()
  if (!dir) return null
  const abs = join(dir, target)
  try {
    if (existsSync(abs) && isCube(target)) return abs
  } catch {
    // ignore
  }
  return null
}

