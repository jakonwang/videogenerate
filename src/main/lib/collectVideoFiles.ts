import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v'])

/** 从拖入的根路径（文件或文件夹）递归收集视频绝对路径 */
export async function collectVideoFilesFromDropRoots(roots: string[]): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()

  async function walkDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = join(dir, ent.name)
      try {
        if (ent.isDirectory()) {
          await walkDir(full)
        } else if (ent.isFile()) {
          const ext = extname(ent.name).toLowerCase()
          if (VIDEO_EXT.has(ext) && !seen.has(full)) {
            seen.add(full)
            out.push(full)
          }
        }
      } catch {
        /* 跳过无权限等 */
      }
    }
  }

  for (const raw of roots) {
    const root = String(raw ?? '').trim()
    if (!root) continue
    try {
      const st = await stat(root)
      if (st.isDirectory()) {
        await walkDir(root)
      } else if (st.isFile()) {
        const ext = extname(root).toLowerCase()
        if (VIDEO_EXT.has(ext) && !seen.has(root)) {
          seen.add(root)
          out.push(root)
        }
      }
    } catch {
      /* skip */
    }
  }

  return out
}
