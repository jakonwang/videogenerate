import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'

type DbShape = { used: Record<string, { createdAt: number }> }
const filePath = () => join(getAppPaths().dbDir, 'dedupe.json')

let cache: Set<string> | null = null
let dirty = false
let flushTimer: NodeJS.Timeout | null = null

async function ensureLoaded() {
  if (cache) return
  const db = await readJsonFile<DbShape>(filePath(), { used: {} })
  cache = new Set(Object.keys(db.used))
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(async () => {
    flushTimer = null
    if (!dirty || !cache) return
    dirty = false
    const used: DbShape['used'] = {}
    // 仅存 key，value 用当前时间即可（去重目的为主）
    const ts = Date.now()
    for (const k of cache) used[k] = { createdAt: ts }
    await writeJsonFile(filePath(), { used })
  }, 1500)
}

export const dedupeRepo = {
  async has(hash: string) {
    await ensureLoaded()
    return cache!.has(hash)
  },

  async add(hash: string) {
    await ensureLoaded()
    cache!.add(hash)
    dirty = true
    scheduleFlush()
    return { ok: true as const }
  },
}

