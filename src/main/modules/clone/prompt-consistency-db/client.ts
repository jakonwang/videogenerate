import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../../lib/paths'

type PromptConsistencyDb = {
  exec(sql: string): unknown
  prepare(sql: string): PromptConsistencyStatement
}

type PromptConsistencyStatement = {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

type SqliteModule = {
  DatabaseSync: new (path: string) => PromptConsistencyDb
}

let db: PromptConsistencyDb | null = null
let databaseSyncCtor: SqliteModule['DatabaseSync'] | null | undefined
let sqliteUnavailableReason = ''

function schemaPath() {
  return join(__dirname, 'schema.sql')
}

function dbFilePath() {
  return join(getAppPaths().dbDir, 'prompt-consistency.sqlite')
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
    return databaseSyncCtor
  }
  return databaseSyncCtor
}

export function getPromptConsistencyDbUnavailableReason() {
  return sqliteUnavailableReason
}

export function canInitializePromptConsistencyDb() {
  return Boolean(getDatabaseSyncCtor())
}

export function getPromptConsistencyDb() {
  if (db) return db
  const dir = getAppPaths().dbDir
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const DatabaseSync = getDatabaseSyncCtor()
  if (!DatabaseSync) {
    throw new Error('当前运行环境不支持可用的 SQLite 运行时')
  }
  db = new DatabaseSync(dbFilePath())
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = OFF;')
  db.exec('PRAGMA synchronous = NORMAL;')
  return db
}

export function initializePromptConsistencyDb() {
  const database = getPromptConsistencyDb()
  const schema = readFileSync(schemaPath(), 'utf8')
  database.exec(schema)
  return database
}
