import { reactive } from 'vue'
import { CloudClientError } from '@shared/cloud/client'
import { SYNC_COLLECTIONS, SYNC_MAX_PUSH, type SyncChange } from '@shared/cloud/sync'
import { dirtyRecords, getMeta, getRecord, listRecords, putRecords, setMeta, type LocalRecord } from './localDb'
import { cloud, session } from './session'

/**
 * 同步引擎：本地先写（离线可用），再把 dirty 记录推到云端，然后按游标增量拉取其他端的改动。
 * 冲突时云端较新的版本覆盖本地（最后写入者胜，与云端规则一致）。
 */

const COLLECTIONS = Object.values(SYNC_COLLECTIONS)
const CURSOR_KEY = 'sync.cursor'

export const syncState = reactive({
  running: false,
  lastSyncedAt: 0,
  error: '',
  /** 每次有数据变化 +1，列表页据此刷新 */
  version: 0,
})

let pending: Promise<void> | null = null
let again = false

export function requestSync(): Promise<void> {
  if (pending) {
    again = true
    return pending
  }
  pending = (async () => {
    do {
      again = false
      await runOnce()
    } while (again)
  })().finally(() => {
    pending = null
  })
  return pending
}

async function runOnce() {
  if (!session.token || !session.baseUrl) return
  syncState.running = true
  try {
    let changed = await pushDirty()
    changed = (await pullRemote()) || changed
    syncState.lastSyncedAt = Date.now()
    syncState.error = ''
    if (changed) syncState.version += 1
  } catch (error) {
    syncState.error = error instanceof CloudClientError && error.code === 'NETWORK' ? '网络不可用，改动会在联网后自动同步' : (error as Error).message
  } finally {
    syncState.running = false
  }
}

async function pushDirty(): Promise<boolean> {
  const dirty = await dirtyRecords()
  let changed = false
  for (let index = 0; index < dirty.length; index += SYNC_MAX_PUSH) {
    const batch = dirty.slice(index, index + SYNC_MAX_PUSH)
    const result = await cloud.sync.push(
      batch.map((record) => ({ collection: record.collection, id: record.id, updatedAt: record.updatedAt, deleted: record.deleted, data: record.data })),
    )
    const cleaned: LocalRecord[] = []
    for (const change of result.applied) {
      const local = batch.find((record) => record.collection === change.collection && record.id === change.id)
      // Only clear the flag if nothing was edited locally while the push was in flight.
      const current = await getRecord(change.collection, change.id)
      if (local && current && current.updatedAt === local.updatedAt) cleaned.push({ ...current, dirty: false })
    }
    const remoteWins = result.conflicts.map(fromRemote)
    if (remoteWins.length) changed = true
    await putRecords([...cleaned, ...remoteWins])
  }
  return changed
}

async function pullRemote(): Promise<boolean> {
  let cursor = (await getMeta<number>(CURSOR_KEY)) || 0
  let changed = false
  for (;;) {
    const page = await cloud.sync.pull(cursor, COLLECTIONS)
    const incoming: LocalRecord[] = []
    for (const change of page.changes) {
      const local = await getRecord(change.collection, change.id)
      // A local edit that is newer than the remote one is kept and will be pushed next round.
      if (local?.dirty && local.updatedAt > change.updatedAt) continue
      incoming.push(fromRemote(change))
    }
    await putRecords(incoming)
    if (incoming.length) changed = true
    cursor = page.cursor
    await setMeta(CURSOR_KEY, cursor)
    if (!page.hasMore) break
  }
  return changed
}

function fromRemote(change: SyncChange): LocalRecord {
  return { collection: change.collection, id: change.id, data: change.data, updatedAt: change.updatedAt, deleted: change.deleted, dirty: false }
}

/* ------------------------------------------------------------------ 本地读写（页面使用） */

export function newId(prefix: string) {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${Date.now().toString(36)}${random}`
}

export async function saveRecord<T>(collection: string, id: string, data: T) {
  await putRecords([{ collection, id, data, updatedAt: Date.now(), deleted: false, dirty: true }])
  syncState.version += 1
  void requestSync()
}

export async function deleteRecord(collection: string, id: string) {
  await putRecords([{ collection, id, data: null, updatedAt: Date.now(), deleted: true, dirty: true }])
  syncState.version += 1
  void requestSync()
}

export { getRecord, listRecords }
