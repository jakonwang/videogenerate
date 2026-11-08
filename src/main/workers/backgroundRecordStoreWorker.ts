import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'

const Database = require('better-sqlite3')

type Request = {
  id: number
  action: 'migrate' | 'list' | 'get' | 'upsert' | 'upsertMany' | 'remove'
  namespace: string
  key?: string
  value?: Record<string, unknown>
  values?: Array<Record<string, unknown>>
  filePath?: string
  rootKey?: string
  offset?: number
  limit?: number
}

const database = new Database(String(workerData.databasePath))
database.pragma('journal_mode = WAL')
database.pragma('synchronous = NORMAL')
database.exec(`
  CREATE TABLE IF NOT EXISTS background_records (
    namespace TEXT NOT NULL,
    record_key TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (namespace, record_key)
  );
  CREATE INDEX IF NOT EXISTS idx_background_records_namespace_updated
  ON background_records(namespace, updated_at DESC, record_key ASC);
  CREATE TABLE IF NOT EXISTS background_record_migrations (
    namespace TEXT PRIMARY KEY,
    migrated_at INTEGER NOT NULL
  );
`)

const upsert = database.prepare(`
  INSERT INTO background_records(namespace, record_key, updated_at, payload)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(namespace, record_key) DO UPDATE SET
    updated_at = excluded.updated_at,
    payload = excluded.payload
`)

function recordKey(value: Record<string, unknown>) {
  const key = String(value.id || '').trim()
  if (!key) throw new Error('Background record id is required.')
  return key
}

async function migrate(request: Request) {
  const migrated = database.prepare('SELECT 1 FROM background_record_migrations WHERE namespace = ?').get(request.namespace)
  if (migrated) return { migrated: 0 }
  let values: Array<Record<string, unknown>> = []
  try {
    const raw = JSON.parse(await readFile(String(request.filePath || ''), 'utf8'))
    const candidate = request.rootKey ? raw?.[request.rootKey] : raw
    if (Array.isArray(candidate)) values = candidate.filter((item) => item && typeof item === 'object')
  } catch {
    values = []
  }
  const transaction = database.transaction(() => {
    for (const value of values) {
      const key = recordKey(value)
      upsert.run(request.namespace, key, Number(value.updatedAt || value.createdAt || Date.now()), JSON.stringify(value))
    }
    database.prepare('INSERT INTO background_record_migrations(namespace, migrated_at) VALUES (?, ?)').run(request.namespace, Date.now())
  })
  transaction()
  return { migrated: values.length }
}

function execute(request: Request) {
  if (request.action === 'migrate') return migrate(request)
  if (request.action === 'list') {
    const offset = Math.max(0, Math.trunc(Number(request.offset || 0)))
    const limit = Math.max(1, Math.min(10_000, Math.trunc(Number(request.limit || 100))))
    const rows = database.prepare(`
      SELECT payload FROM background_records
      WHERE namespace = ?
      ORDER BY updated_at DESC, record_key ASC
      LIMIT ? OFFSET ?
    `).all(request.namespace, limit, offset) as Array<{ payload: string }>
    const total = Number((database.prepare('SELECT COUNT(*) AS count FROM background_records WHERE namespace = ?').get(request.namespace) as { count: number }).count)
    return { items: rows.map((row) => JSON.parse(row.payload)), total, offset, limit }
  }
  if (request.action === 'get') {
    const row = database.prepare('SELECT payload FROM background_records WHERE namespace = ? AND record_key = ?').get(request.namespace, request.key) as { payload?: string } | undefined
    return row?.payload ? JSON.parse(row.payload) : null
  }
  if (request.action === 'upsert') {
    const value = request.value || {}
    upsert.run(request.namespace, recordKey(value), Number(value.updatedAt || value.createdAt || Date.now()), JSON.stringify(value))
    return value
  }
  if (request.action === 'upsertMany') {
    const values = request.values || []
    database.transaction(() => {
      for (const value of values) upsert.run(request.namespace, recordKey(value), Number(value.updatedAt || value.createdAt || Date.now()), JSON.stringify(value))
    })()
    return values
  }
  if (request.action === 'remove') {
    const result = database.prepare('DELETE FROM background_records WHERE namespace = ? AND record_key = ?').run(request.namespace, request.key)
    return { removed: result.changes > 0 }
  }
  throw new Error(`Unsupported background record action: ${request.action}`)
}

parentPort?.on('message', async (request: Request) => {
  try {
    parentPort?.postMessage({ id: request.id, result: await execute(request) })
  } catch (error) {
    parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) })
  }
})

parentPort?.on('close', () => database.close())
