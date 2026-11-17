/**
 * 本地数据：IndexedDB，按集合存记录，离线可读可写。
 * dirty=true 的记录是本机改过、还没推到云端的。
 */

export type LocalRecord<T = unknown> = {
  collection: string
  id: string
  data: T | null
  updatedAt: number
  deleted: boolean
  dirty: boolean
}

const DB_NAME = 'tiktokcut'
const DB_VERSION = 1
let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const records = db.createObjectStore('records', { keyPath: ['collection', 'id'] })
      records.createIndex('collection', 'collection')
      records.createIndex('dirty', 'dirtyKey')
      db.createObjectStore('meta')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// IndexedDB cannot index booleans; store a sortable flag next to the record.
type Stored = LocalRecord & { dirtyKey: number }

function strip(row: Stored): LocalRecord {
  const { dirtyKey: _ignored, ...record } = row
  return record
}

export async function listRecords<T>(collection: string): Promise<LocalRecord<T>[]> {
  const db = await open()
  const rows = (await done(db.transaction('records').objectStore('records').index('collection').getAll(collection))) as Stored[]
  return rows.filter((row) => !row.deleted).map((row) => strip(row) as LocalRecord<T>)
}

export async function getRecord<T>(collection: string, id: string): Promise<LocalRecord<T> | null> {
  const db = await open()
  const row = (await done(db.transaction('records').objectStore('records').get([collection, id]))) as Stored | undefined
  return row ? (strip(row) as LocalRecord<T>) : null
}

export async function putRecords(records: LocalRecord[]) {
  if (!records.length) return
  const db = await open()
  const tx = db.transaction('records', 'readwrite')
  const store = tx.objectStore('records')
  for (const record of records) {
    // Plain JSON copy: Vue reactive proxies cannot be structured-cloned into IndexedDB.
    const data = record.data === null || record.data === undefined ? null : JSON.parse(JSON.stringify(record.data))
    store.put({ ...record, data, dirtyKey: record.dirty ? 1 : 0 } satisfies Stored)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function dirtyRecords(): Promise<LocalRecord[]> {
  const db = await open()
  const rows = (await done(db.transaction('records').objectStore('records').index('dirty').getAll(1))) as Stored[]
  return rows.map(strip)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await open()
  return (await done(db.transaction('meta').objectStore('meta').get(key))) as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  const db = await open()
  await done(db.transaction('meta', 'readwrite').objectStore('meta').put(value, key))
}

/** 退出登录 / 换账号时清空，避免数据串号 */
export async function clearLocalData() {
  const db = await open()
  const tx = db.transaction(['records', 'meta'], 'readwrite')
  tx.objectStore('records').clear()
  tx.objectStore('meta').clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
