/**
 * 模板「参考分镜」缩略图（数据目录 template-refs/<导入任务>/）的清理。
 *
 * 每次「导入视频 → AI 识别模板」都会留一个目录；模板删掉、或者识别完没保存，
 * 目录就没人用了。删模板时顺手删它独占的目录；没保存的草稿留一天再清
 * （用户可能还停在确认页上）。
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { Template } from './types'

export const DRAFT_KEEP_MS = 24 * 60 * 60 * 1000

export function templateRefsRoot() {
  return join(getAppPaths().dataDir, 'template-refs')
}

/** 模板用到的 template-refs 子目录名 */
export function refDirsOf(template: Pick<Template, 'meta'> | null | undefined, root = templateRefsRoot()): Set<string> {
  const dirs = new Set<string>()
  for (const shot of template?.meta?.referenceShots ?? []) {
    const rel = relative(root, String(shot?.thumbnailPath || ''))
    if (!rel || rel.startsWith('..') || rel.includes(':')) continue
    const dir = rel.split(sep)[0]!
    if (dir && dir !== '..') dirs.add(dir)
  }
  return dirs
}

async function removeDir(root: string, dir: string) {
  await rm(join(root, dir), { recursive: true, force: true }).catch(() => undefined)
}

/** 删模板后：删掉只有它在用的缩略图目录 */
export async function removeRefDirsOfTemplate(removed: Template | undefined, remaining: Template[]) {
  if (!removed) return
  const root = templateRefsRoot()
  const stillUsed = new Set(remaining.flatMap((t) => [...refDirsOf(t, root)]))
  for (const dir of refDirsOf(removed, root)) if (!stillUsed.has(dir)) await removeDir(root, dir)
}

/** 清掉没有任何模板在用、且超过保留期的目录（没保存的草稿） */
export async function sweepUnusedRefDirs(templates: Template[], keepMs = DRAFT_KEEP_MS, now = Date.now()) {
  const root = templateRefsRoot()
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return { removed: 0 }
  }
  const used = new Set(templates.flatMap((t) => [...refDirsOf(t, root)]))
  let removed = 0
  for (const dir of entries) {
    if (used.has(dir)) continue
    try {
      const info = await stat(join(root, dir))
      if (now - info.mtimeMs < keepMs) continue
    } catch {
      continue
    }
    await removeDir(root, dir)
    removed++
  }
  return { removed }
}
