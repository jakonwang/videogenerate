import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { CloneProject, CloneProjectGroup, ModelIdentityLibraryItem } from './types'

type SqliteStatement = {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

type SqliteDatabase = {
  exec(sql: string): unknown
  prepare(sql: string): SqliteStatement
}

type SqliteModule = {
  DatabaseSync: new (path: string) => SqliteDatabase
}

type CloneSqliteDbShape = {
  projects: CloneProject[]
  projectGroups: CloneProjectGroup[]
  modelIdentityLibrary: ModelIdentityLibraryItem[]
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS clone_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clone_model_identities (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clone_project_groups (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  payload TEXT NOT NULL
);
`

let db: SqliteDatabase | null = null
let databaseSyncCtor: SqliteModule['DatabaseSync'] | null | undefined
let sqliteUnavailableReason = ''

export function cloneSqlitePath() {
  return join(getAppPaths().dbDir, 'clone-projects.sqlite')
}

function getDatabaseSyncCtor() {
  if (databaseSyncCtor !== undefined) return databaseSyncCtor
  try {
    const sqliteModule = require('node:sqlite') as SqliteModule
    databaseSyncCtor = sqliteModule.DatabaseSync
    sqliteUnavailableReason = ''
  } catch (error) {
    databaseSyncCtor = null
    sqliteUnavailableReason = error instanceof Error ? error.message : String(error)
  }
  return databaseSyncCtor
}

export function canInitializeCloneSqlite() {
  return Boolean(getDatabaseSyncCtor())
}

export function getCloneSqliteUnavailableReason() {
  return sqliteUnavailableReason
}

function getDatabase() {
  if (db) return db
  const dir = getAppPaths().dbDir
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const DatabaseSync = getDatabaseSyncCtor()
  if (!DatabaseSync) {
    throw new Error(`当前运行环境不支持 SQLite：${sqliteUnavailableReason || 'unknown'}`)
  }
  db = new DatabaseSync(cloneSqlitePath())
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  return db
}

export function initializeCloneSqlite() {
  const database = getDatabase()
  database.exec(schemaSql)
  return database
}

function selectPayloads<T>(table: string, orderBy: string) {
  const database = getDatabase()
  const rows = database.prepare(`SELECT payload FROM ${table} ORDER BY ${orderBy}`).all() as Array<{ payload: string }>
  return rows.map((row) => JSON.parse(String(row.payload || '{}')) as T)
}

export function isCloneSqliteEmpty() {
  const database = getDatabase()
  const tables = ['clone_projects', 'clone_model_identities']
  tables.push('clone_project_groups')
  for (const table of tables) {
    const row = database.prepare(`SELECT COUNT(1) AS count FROM ${table}`).get() as { count?: number } | undefined
    if (Number(row?.count || 0) > 0) return false
  }
  return true
}

export function readCloneDbFromSqlite(): CloneSqliteDbShape {
  initializeCloneSqlite()
  return {
    projects: selectPayloads('clone_projects', 'updated_at DESC, created_at DESC'),
    projectGroups: selectPayloads('clone_project_groups', 'sort_order ASC, created_at ASC'),
    modelIdentityLibrary: selectPayloads('clone_model_identities', 'updated_at DESC, created_at DESC'),
  }
}

export function writeCloneDbToSqlite(input: CloneSqliteDbShape) {
  const database = initializeCloneSqlite()
  const insertProject = database.prepare(
    'INSERT INTO clone_projects (id, user_id, updated_at, created_at, payload) VALUES (?, ?, ?, ?, ?)',
  )
  const insertIdentity = database.prepare(
    'INSERT INTO clone_model_identities (id, updated_at, created_at, payload) VALUES (?, ?, ?, ?)',
  )
  const insertGroup = database.prepare(
    'INSERT INTO clone_project_groups (id, updated_at, created_at, sort_order, payload) VALUES (?, ?, ?, ?, ?)',
  )
  database.exec('BEGIN IMMEDIATE;')
  try {
    database.exec('DELETE FROM clone_projects;')
    database.exec('DELETE FROM clone_model_identities;')
    database.exec('DELETE FROM clone_project_groups;')
    for (const item of input.projects) {
      insertProject.run(
        item.id,
        String(item.userId || '').trim() || null,
        Number(item.updatedAt || 0),
        Number(item.createdAt || 0),
        JSON.stringify(item),
      )
    }
    for (const item of input.modelIdentityLibrary) {
      insertIdentity.run(
        item.id,
        Number(item.updatedAt || 0),
        Number(item.createdAt || 0),
        JSON.stringify(item),
      )
    }
    for (const item of input.projectGroups) {
      insertGroup.run(
        item.id,
        Number(item.updatedAt || 0),
        Number(item.createdAt || 0),
        Number(item.sortOrder || 0),
        JSON.stringify(item),
      )
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
