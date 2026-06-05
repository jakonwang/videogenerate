import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../../lib/paths'

type PromptConsistencyStatement = {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

type PromptConsistencyDb = {
  exec(sql: string): unknown
  prepare(sql: string): PromptConsistencyStatement
}

type SqliteCtor = new (path: string) => PromptConsistencyDb

let db: PromptConsistencyDb | null = null
let nodeSqliteCtor: SqliteCtor | null | undefined
let betterSqliteCtor: SqliteCtor | null | undefined
let unavailableReason = ''

function schemaPath() {
  return join(__dirname, 'schema.sql')
}

function dbFilePath() {
  return join(getAppPaths().dbDir, 'prompt-consistency.sqlite')
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

export function getPromptConsistencyDbUnavailableReason() {
  return unavailableReason
}

export function canInitializePromptConsistencyDb() {
  return Boolean(loadNodeSqliteCtor() || loadBetterSqliteCtor())
}

export function getPromptConsistencyDb() {
  if (db) return db
  const dir = getAppPaths().dbDir
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const DatabaseSync = loadNodeSqliteCtor() || loadBetterSqliteCtor()
  if (!DatabaseSync) {
    throw new Error(`SQLite unavailable: ${unavailableReason || 'unknown'}`)
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
