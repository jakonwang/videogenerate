import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { PoolClip, PoolSource } from '../../../shared/mixPool'

type DbShape = { version: 1; sources: PoolSource[]; clips: PoolClip[] }

const filePath = () => join(getAppPaths().dbDir, 'mix-pool.json')

export function mixPoolFramesDir(productId: string, sourceId: string) {
  return join(getAppPaths().dataDir, 'mix-pool', 'frames', productId, sourceId)
}

export function normalizePathKey(p: string) {
  const s = String(p ?? '').replace(/\\/g, '/').trim()
  return process.platform === 'win32' ? s.toLowerCase() : s
}

/** Serialises read-modify-write cycles so concurrent split/tag jobs don't clobber each other. */
let chain: Promise<unknown> = Promise.resolve()

async function load(): Promise<DbShape> {
  const db = await readJsonFile<DbShape>(filePath(), { version: 1, sources: [], clips: [] })
  return { version: 1, sources: Array.isArray(db.sources) ? db.sources : [], clips: Array.isArray(db.clips) ? db.clips : [] }
}

function mutate<T>(fn: (db: DbShape) => T | Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const db = await load()
    const out = await fn(db)
    await writeJsonFile(filePath(), db)
    return out
  })
  chain = next.catch(() => undefined)
  return next
}

export const mixPoolRepo = {
  async listByProduct(productId: string) {
    await chain.catch(() => undefined)
    const db = await load()
    return {
      sources: db.sources.filter((s) => s.productId === productId),
      clips: db.clips.filter((c) => c.productId === productId),
    }
  },

  async getClips(ids: string[]) {
    const want = new Set(ids)
    const db = await load()
    return db.clips.filter((c) => want.has(c.id))
  },

  /** Adds sources whose file path is not yet in this product's pool. Returns the newly added ones. */
  addSources(productId: string, incoming: PoolSource[]) {
    return mutate((db) => {
      const known = new Set(db.sources.filter((s) => s.productId === productId).map((s) => normalizePathKey(s.filePath)))
      const added: PoolSource[] = []
      for (const src of incoming) {
        const key = normalizePathKey(src.filePath)
        if (!key || known.has(key)) continue
        known.add(key)
        db.sources.push(src)
        added.push(src)
      }
      return added
    })
  },

  patchSource(id: string, patch: Partial<PoolSource>) {
    return mutate((db) => {
      const src = db.sources.find((s) => s.id === id)
      if (src) Object.assign(src, patch, { updatedAt: Date.now() })
      return src ?? null
    })
  },

  /** Replaces all clips of a source (re-split) and marks it ready. */
  replaceSourceClips(sourceId: string, clips: PoolClip[], sourcePatch: Partial<PoolSource>) {
    return mutate((db) => {
      db.clips = db.clips.filter((c) => c.sourceId !== sourceId).concat(clips)
      const src = db.sources.find((s) => s.id === sourceId)
      if (src) Object.assign(src, sourcePatch, { clipCount: clips.length, updatedAt: Date.now() })
    })
  },

  patchClips(patches: Array<{ id: string; patch: Partial<PoolClip> }>) {
    return mutate((db) => {
      const byId = new Map(db.clips.map((c) => [c.id, c]))
      const now = Date.now()
      const out: PoolClip[] = []
      for (const { id, patch } of patches) {
        const clip = byId.get(id)
        if (!clip) continue
        Object.assign(clip, patch, { updatedAt: now })
        out.push(clip)
      }
      return out
    })
  },

  removeSource(id: string) {
    return mutate((db) => {
      const src = db.sources.find((s) => s.id === id)
      db.sources = db.sources.filter((s) => s.id !== id)
      db.clips = db.clips.filter((c) => c.sourceId !== id)
      return src ?? null
    })
  },

  /** Clips left mid-run by a crash/quit go back to the queue. */
  resetStuck() {
    return mutate((db) => {
      for (const s of db.sources) if (s.status === 'splitting') s.status = 'pending'
      for (const c of db.clips) if (c.tagStatus === 'tagging') c.tagStatus = 'untagged'
    })
  },
}
