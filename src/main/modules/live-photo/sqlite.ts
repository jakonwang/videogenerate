import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { LivePhotoItem, LivePhotoSettings } from './types'

type SqliteStatement = {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

type SqliteDatabase = {
  exec(sql: string): unknown
  prepare(sql: string): SqliteStatement
  close?: () => unknown
}

type SqliteCtor = new (path: string) => SqliteDatabase

const schemaSql = `
CREATE TABLE IF NOT EXISTS live_photo_items (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_live_photo_items_updated_at
ON live_photo_items(updated_at DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS live_photo_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
`

let db: SqliteDatabase | null = null
let nodeSqliteCtor: SqliteCtor | null | undefined
let betterSqliteCtor: SqliteCtor | null | undefined
let unavailableReason = ''

export function livePhotoSqlitePath() {
  return join(getAppPaths().dbDir, 'live-photo.sqlite')
}

function loadNodeSqliteCtor() {
  if (nodeSqliteCtor !== undefined) return nodeSqliteCtor
  try {
    const sqliteModule = require('node:sqlite') as { DatabaseSync: SqliteCtor }
    nodeSqliteCtor = sqliteModule.DatabaseSync
    unavailableReason = ''
  } catch (error) {
    nodeSqliteCtor = null
    unavailableReason = error instanceof Error ? error.message : String(error)
  }
  return nodeSqliteCtor
}

function loadBetterSqliteCtor() {
  if (betterSqliteCtor !== undefined) return betterSqliteCtor
  try {
    const sqliteModule = require('better-sqlite3') as SqliteCtor
    betterSqliteCtor = sqliteModule
    unavailableReason = ''
  } catch (error) {
    betterSqliteCtor = null
    if (!unavailableReason) unavailableReason = error instanceof Error ? error.message : String(error)
  }
  return betterSqliteCtor
}

export function canInitializeLivePhotoSqlite() {
  return Boolean(loadNodeSqliteCtor() || loadBetterSqliteCtor())
}

export function getLivePhotoSqliteUnavailableReason() {
  return unavailableReason
}

function getDatabase() {
  if (db) return db
  const dir = getAppPaths().dbDir
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const DatabaseSync = loadNodeSqliteCtor() || loadBetterSqliteCtor()
  if (!DatabaseSync) {
    throw new Error(`SQLite unavailable: ${unavailableReason || 'unknown'}`)
  }
  db = new DatabaseSync(livePhotoSqlitePath())
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  return db
}

export function initializeLivePhotoSqlite() {
  const database = getDatabase()
  database.exec(schemaSql)
  return database
}

export function isLivePhotoSqliteEmpty() {
  const database = initializeLivePhotoSqlite()
  const row = database.prepare('SELECT COUNT(1) AS count FROM live_photo_items').get() as { count?: number } | undefined
  return Number(row?.count || 0) <= 0
}

export function readLivePhotoItemsFromSqlite(): LivePhotoItem[] {
  const database = initializeLivePhotoSqlite()
  const rows = database
    .prepare('SELECT payload FROM live_photo_items ORDER BY updated_at DESC, created_at DESC')
    .all() as Array<{ payload?: string }>
  return rows.map((row) => JSON.parse(String(row.payload || '{}')) as LivePhotoItem)
}

export function readLivePhotoItemByIdFromSqlite(id: string): LivePhotoItem | null {
  const database = initializeLivePhotoSqlite()
  const row = database.prepare('SELECT payload FROM live_photo_items WHERE id = ? LIMIT 1').get(String(id || '').trim()) as
    | { payload?: string }
    | undefined
  if (!row?.payload) return null
  return JSON.parse(String(row.payload || '{}')) as LivePhotoItem
}

export function upsertLivePhotoItemInSqlite(item: LivePhotoItem) {
  const database = initializeLivePhotoSqlite()
  database
    .prepare('INSERT OR REPLACE INTO live_photo_items (id, updated_at, created_at, payload) VALUES (?, ?, ?, ?)')
    .run(item.id, Number(item.updatedAt || 0), Number(item.createdAt || 0), JSON.stringify(item))
}

export function removeLivePhotoItemFromSqlite(id: string) {
  const database = initializeLivePhotoSqlite()
  database.prepare('DELETE FROM live_photo_items WHERE id = ?').run(String(id || '').trim())
}

export function writeLivePhotoItemsToSqlite(items: LivePhotoItem[]) {
  const database = initializeLivePhotoSqlite()
  const replaceItem = database.prepare(
    'INSERT OR REPLACE INTO live_photo_items (id, updated_at, created_at, payload) VALUES (?, ?, ?, ?)',
  )
  const existingIds = new Set(
    (database.prepare('SELECT id FROM live_photo_items').all() as Array<{ id?: string }>).map((item) => String(item.id || '')),
  )
  const nextIds = new Set(items.map((item) => String(item.id || '')))
  const deleteItem = database.prepare('DELETE FROM live_photo_items WHERE id = ?')

  database.exec('BEGIN IMMEDIATE;')
  try {
    for (const item of items) {
      replaceItem.run(item.id, Number(item.updatedAt || 0), Number(item.createdAt || 0), JSON.stringify(item))
    }
    for (const id of existingIds) {
      if (id && !nextIds.has(id)) deleteItem.run(id)
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function readLivePhotoSettingsFromSqlite(): LivePhotoSettings | null {
  const database = initializeLivePhotoSqlite()
  const row = database.prepare('SELECT payload FROM live_photo_settings WHERE id = 1 LIMIT 1').get() as
    | { payload?: string }
    | undefined
  if (!row?.payload) return null
  return JSON.parse(String(row.payload || '{}')) as LivePhotoSettings
}

export function writeLivePhotoSettingsToSqlite(settings: LivePhotoSettings) {
  const database = initializeLivePhotoSqlite()
  database
    .prepare('INSERT OR REPLACE INTO live_photo_settings (id, updated_at, payload) VALUES (1, ?, ?)')
    .run(Number(settings.updatedAt || 0), JSON.stringify(settings))
}

export function closeLivePhotoSqlite() {
  if (!db) return
  try {
    db.close?.()
  } catch {
    // Ignore close errors during tests and shutdown.
  }
  db = null
}
