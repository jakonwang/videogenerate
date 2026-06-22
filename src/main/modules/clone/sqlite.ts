import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { CloneProject, CloneProjectGroup, ModelIdentityLibraryItem, ModelTask } from './types'

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

type CloneSqliteDbShape = {
  projects: CloneProject[]
  projectGroups: CloneProjectGroup[]
  modelIdentityLibrary: ModelIdentityLibraryItem[]
  modelTasks: ModelTask[]
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
CREATE TABLE IF NOT EXISTS clone_model_tasks (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clone_projects_updated_at
ON clone_projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clone_projects_user_updated_at
ON clone_projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clone_project_groups_sort_created_at
ON clone_project_groups(sort_order ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_clone_model_identities_updated_at
ON clone_model_identities(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clone_model_tasks_updated_at
ON clone_model_tasks(updated_at DESC);
`

let db: SqliteDatabase | null = null
let nodeSqliteCtor: SqliteCtor | null | undefined
let betterSqliteCtor: SqliteCtor | null | undefined
let unavailableReason = ''

export function cloneSqlitePath() {
  return join(getAppPaths().dbDir, 'clone-projects.sqlite')
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

export function canInitializeCloneSqlite() {
  return Boolean(loadNodeSqliteCtor() || loadBetterSqliteCtor())
}

export function getCloneSqliteUnavailableReason() {
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

function selectPayloadById<T>(table: string, id: string) {
  const database = getDatabase()
  const row = database.prepare(`SELECT payload FROM ${table} WHERE id = ? LIMIT 1`).get(id) as { payload?: string } | undefined
  if (!row?.payload) return null
  return JSON.parse(String(row.payload || '{}')) as T
}

export function isCloneSqliteEmpty() {
  const database = getDatabase()
  for (const table of ['clone_projects', 'clone_model_identities', 'clone_project_groups', 'clone_model_tasks']) {
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
    modelTasks: selectPayloads('clone_model_tasks', 'updated_at DESC, created_at DESC'),
  }
}

export function readCloneProjectsFromSqlite(): CloneProject[] {
  initializeCloneSqlite()
  return selectPayloads('clone_projects', 'updated_at DESC, created_at DESC')
}

export function readCloneProjectByIdFromSqlite(id: string): CloneProject | null {
  initializeCloneSqlite()
  return selectPayloadById<CloneProject>('clone_projects', String(id || '').trim())
}

export function upsertCloneProjectInSqlite(input: CloneProject) {
  const database = initializeCloneSqlite()
  database
    .prepare('INSERT OR REPLACE INTO clone_projects (id, user_id, updated_at, created_at, payload) VALUES (?, ?, ?, ?, ?)')
    .run(
      input.id,
      String(input.userId || '').trim() || null,
      Number(input.updatedAt || 0),
      Number(input.createdAt || 0),
      JSON.stringify(input),
    )
}

export function removeCloneProjectFromSqlite(id: string) {
  const database = initializeCloneSqlite()
  database.prepare('DELETE FROM clone_projects WHERE id = ?').run(String(id || '').trim())
}

export function writeCloneDbToSqlite(input: CloneSqliteDbShape) {
  const database = initializeCloneSqlite()
  const replaceProject = database.prepare(
    'INSERT OR REPLACE INTO clone_projects (id, user_id, updated_at, created_at, payload) VALUES (?, ?, ?, ?, ?)',
  )
  const replaceIdentity = database.prepare(
    'INSERT OR REPLACE INTO clone_model_identities (id, updated_at, created_at, payload) VALUES (?, ?, ?, ?)',
  )
  const replaceGroup = database.prepare(
    'INSERT OR REPLACE INTO clone_project_groups (id, updated_at, created_at, sort_order, payload) VALUES (?, ?, ?, ?, ?)',
  )
  const replaceModelTask = database.prepare(
    'INSERT OR REPLACE INTO clone_model_tasks (id, updated_at, created_at, payload) VALUES (?, ?, ?, ?)',
  )
  const existingProjectIds = new Set(
    (database.prepare('SELECT id FROM clone_projects').all() as Array<{ id?: string }>).map((item) => String(item.id || '')),
  )
  const existingIdentityIds = new Set(
    (database.prepare('SELECT id FROM clone_model_identities').all() as Array<{ id?: string }>).map((item) => String(item.id || '')),
  )
  const existingGroupIds = new Set(
    (database.prepare('SELECT id FROM clone_project_groups').all() as Array<{ id?: string }>).map((item) => String(item.id || '')),
  )
  const existingModelTaskIds = new Set(
    (database.prepare('SELECT id FROM clone_model_tasks').all() as Array<{ id?: string }>).map((item) => String(item.id || '')),
  )
  const nextProjectIds = new Set(input.projects.map((item) => String(item.id || '')))
  const nextIdentityIds = new Set(input.modelIdentityLibrary.map((item) => String(item.id || '')))
  const nextGroupIds = new Set(input.projectGroups.map((item) => String(item.id || '')))
  const nextModelTaskIds = new Set(input.modelTasks.map((item) => String(item.id || '')))
  const deleteProject = database.prepare('DELETE FROM clone_projects WHERE id = ?')
  const deleteIdentity = database.prepare('DELETE FROM clone_model_identities WHERE id = ?')
  const deleteGroup = database.prepare('DELETE FROM clone_project_groups WHERE id = ?')
  const deleteModelTask = database.prepare('DELETE FROM clone_model_tasks WHERE id = ?')

  database.exec('BEGIN IMMEDIATE;')
  try {
    for (const item of input.projects) {
      replaceProject.run(item.id, String(item.userId || '').trim() || null, Number(item.updatedAt || 0), Number(item.createdAt || 0), JSON.stringify(item))
    }
    for (const item of input.modelIdentityLibrary) {
      replaceIdentity.run(item.id, Number(item.updatedAt || 0), Number(item.createdAt || 0), JSON.stringify(item))
    }
    for (const item of input.projectGroups) {
      replaceGroup.run(item.id, Number(item.updatedAt || 0), Number(item.createdAt || 0), Number(item.sortOrder || 0), JSON.stringify(item))
    }
    for (const item of input.modelTasks) {
      replaceModelTask.run(item.id, Number(item.updatedAt || 0), Number(item.createdAt || 0), JSON.stringify(item))
    }
    for (const id of existingProjectIds) {
      if (id && !nextProjectIds.has(id)) deleteProject.run(id)
    }
    for (const id of existingIdentityIds) {
      if (id && !nextIdentityIds.has(id)) deleteIdentity.run(id)
    }
    for (const id of existingGroupIds) {
      if (id && !nextGroupIds.has(id)) deleteGroup.run(id)
    }
    for (const id of existingModelTaskIds) {
      if (id && !nextModelTaskIds.has(id)) deleteModelTask.run(id)
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function closeCloneSqlite() {
  if (!db) return
  try {
    db.close?.()
  } finally {
    db = null
  }
}
