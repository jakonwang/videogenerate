import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { link, lstat, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

/**
 * 同一张图 / 视频在服务器上会存几份：实况图任务目录里 2–3 份，同步到云端文件库又 1 份。
 * 这里把内容相同的合并成硬链接（路径都不变，删其中一个不影响别的）。
 *
 * 硬链接的前提是没有人原地改写文件，所以只处理：
 * - files/<用户>/<sha256>：按内容命名，写临时文件再改名，从不改写
 * - 实况图任务目录里的下列文件：live-photo/service.ts 写之前先删旧文件（见 replaceWithLink），生成结果每次都是新文件名
 * 以后要加目录，先确认写它的代码不会原地覆盖。
 */
const ROOT_FILES = /^(still\.(png|jpe?g|webp)|motion\.(mp4|mov)|live-photo\.(jpg|mov))$/
const GENERATED_DIRS = ['generated-still', 'generated-video']
const GENERATED_FILES = /\d{13}.*\.(png|jpe?g|webp|mp4|mov)$/
const MIN_SIZE = 50 * 1024

type Entry = { path: string; dev: number; ino: number; size: number; mtimeMs: number }

const names = (dir: string) => readdir(dir).catch(() => [] as string[])

async function entryOf(path: string, settledBefore: number): Promise<Entry | null> {
  const info = await lstat(path).catch(() => null)
  if (!info?.isFile() || info.size < MIN_SIZE || info.mtimeMs > settledBefore) return null
  return { path, dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs }
}

async function hashOf(path: string) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

async function unchanged(e: Entry) {
  const info = await lstat(e.path).catch(() => null)
  return Boolean(info?.isFile() && info.ino === e.ino && info.size === e.size && info.mtimeMs === e.mtimeMs)
}

async function collect(dataDir: string, user: string, settledBefore: number) {
  const paths: string[] = []
  const blobs = join(dataDir, 'files', user)
  for (const name of await names(blobs)) if (/^[a-f0-9]{64}$/.test(name)) paths.push(join(blobs, name))
  const tasks = join(dataDir, 'clone-engine', user, 'data', 'plugin-live-photo')
  for (const task of await names(tasks)) {
    const root = join(tasks, task)
    for (const name of await names(root)) if (ROOT_FILES.test(name)) paths.push(join(root, name))
    for (const sub of GENERATED_DIRS) {
      for (const name of await names(join(root, sub))) if (GENERATED_FILES.test(name)) paths.push(join(root, sub, name))
    }
  }
  const entries: Entry[] = []
  for (const path of paths) {
    const found = await entryOf(path, settledBefore)
    if (found) entries.push(found)
  }
  return entries
}

/** 只在同一个用户内合并。settleMs 内改过的文件可能还在写，先不动 */
export async function dedupeUserFiles(dataDir: string, options: { settleMs?: number; now?: number } = {}) {
  const settledBefore = (options.now ?? Date.now()) - (options.settleMs ?? 60 * 60_000)
  let merged = 0
  let bytes = 0
  for (const user of await names(join(dataDir, 'clone-engine'))) {
    const bySize = new Map<number, Entry[]>()
    for (const e of await collect(dataDir, user, settledBefore)) bySize.set(e.size, [...(bySize.get(e.size) ?? []), e])
    for (const group of bySize.values()) {
      const inodes = new Map<string, Entry[]>()
      for (const e of group) inodes.set(`${e.dev}:${e.ino}`, [...(inodes.get(`${e.dev}:${e.ino}`) ?? []), e])
      if (inodes.size < 2) continue
      // 云端文件库排在最前面，作为保留的那份
      const kept = new Map<string, Entry>()
      for (const entries of inodes.values()) {
        const first = entries[0]!
        const hash = await hashOf(first.path).catch(() => '')
        if (!hash) continue
        const keep = kept.get(hash)
        if (!keep) {
          kept.set(hash, first)
          continue
        }
        let done = 0
        for (const e of entries) {
          const temp = `${e.path}.${randomUUID()}.dedupe`
          try {
            await link(keep.path, temp)
            // 比对之后两边都没变过才替换
            if ((await unchanged(keep)) && (await unchanged(e))) {
              await rename(temp, e.path)
              done += 1
            }
          } catch {
            // 不支持硬链接、文件刚被删：保持原样
          } finally {
            await rm(temp, { force: true }).catch(() => undefined)
          }
        }
        merged += done
        if (done === entries.length) bytes += first.size
      }
    }
  }
  return { merged, bytes }
}
