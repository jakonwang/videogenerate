import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { WebPlatformDb } from './types'

type SqliteStatement = {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

type SqliteDatabase = {
  exec(sql: string): unknown
  prepare(sql: string): SqliteStatement
}

type SqliteCtor = new (path: string) => SqliteDatabase

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS compute_price_rules (
  action TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_codes (
  phone TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plugins (
  user_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, plugin_id)
);
CREATE TABLE IF NOT EXISTS batch_subtitle_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
`

let db: SqliteDatabase | null = null
let nodeSqliteCtor: SqliteCtor | null | undefined
let betterSqliteCtor: SqliteCtor | null | undefined
let unavailableReason = ''

export function webPlatformSqlitePath() {
  return join(getAppPaths().dbDir, 'web-platform.sqlite')
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

export function canInitializeWebPlatformSqlite() {
  return Boolean(loadNodeSqliteCtor() || loadBetterSqliteCtor())
}

export function getWebPlatformSqliteUnavailableReason() {
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
  db = new DatabaseSync(webPlatformSqlitePath())
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  return db
}

export function initializeWebPlatformSqlite() {
  const database = getDatabase()
  database.exec(schemaSql)
  return database
}

function selectPayloads<T>(table: string, orderBy: string) {
  const database = getDatabase()
  const rows = database.prepare(`SELECT payload FROM ${table} ORDER BY ${orderBy}`).all() as Array<{ payload: string }>
  return rows.map((row) => JSON.parse(String(row.payload || '{}')) as T)
}

function clearTables(database: SqliteDatabase) {
  for (const table of [
    'users',
    'sessions',
    'subscriptions',
    'wallets',
    'wallet_transactions',
    'orders',
    'subscription_plans',
    'compute_price_rules',
    'login_codes',
    'plugins',
    'batch_subtitle_jobs',
  ]) {
    database.exec(`DELETE FROM ${table};`)
  }
}

export function isWebPlatformSqliteEmpty() {
  const database = getDatabase()
  for (const table of [
    'users',
    'sessions',
    'subscriptions',
    'wallets',
    'wallet_transactions',
    'orders',
    'subscription_plans',
    'compute_price_rules',
    'login_codes',
    'plugins',
    'batch_subtitle_jobs',
  ]) {
    const row = database.prepare(`SELECT COUNT(1) AS count FROM ${table}`).get() as { count?: number } | undefined
    if (Number(row?.count || 0) > 0) return false
  }
  return true
}

export function readWebPlatformDbFromSqlite(): WebPlatformDb {
  initializeWebPlatformSqlite()
  return {
    users: selectPayloads('users', 'updated_at DESC'),
    sessions: selectPayloads('sessions', 'updated_at DESC'),
    subscriptions: selectPayloads('subscriptions', 'updated_at DESC'),
    wallets: selectPayloads('wallets', 'updated_at DESC'),
    walletTransactions: selectPayloads('wallet_transactions', 'created_at DESC'),
    orders: selectPayloads('orders', 'created_at DESC'),
    subscriptionPlans: selectPayloads('subscription_plans', 'id ASC'),
    computePriceRules: selectPayloads('compute_price_rules', 'action ASC'),
    loginCodes: selectPayloads('login_codes', 'updated_at DESC'),
    plugins: selectPayloads('plugins', 'updated_at DESC'),
    batchSubtitleJobs: selectPayloads('batch_subtitle_jobs', 'updated_at DESC'),
  }
}

export function writeWebPlatformDbToSqlite(input: WebPlatformDb) {
  const database = initializeWebPlatformSqlite()
  const insertUser = database.prepare('INSERT INTO users (id, updated_at, payload) VALUES (?, ?, ?)')
  const insertSession = database.prepare('INSERT INTO sessions (token, user_id, expires_at, updated_at, payload) VALUES (?, ?, ?, ?, ?)')
  const insertSubscription = database.prepare('INSERT INTO subscriptions (user_id, updated_at, payload) VALUES (?, ?, ?)')
  const insertWallet = database.prepare('INSERT INTO wallets (user_id, updated_at, payload) VALUES (?, ?, ?)')
  const insertWalletTransaction = database.prepare('INSERT INTO wallet_transactions (id, user_id, created_at, payload) VALUES (?, ?, ?, ?)')
  const insertOrder = database.prepare('INSERT INTO orders (id, user_id, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
  const insertPlan = database.prepare('INSERT INTO subscription_plans (id, enabled, payload) VALUES (?, ?, ?)')
  const insertRule = database.prepare('INSERT INTO compute_price_rules (action, payload) VALUES (?, ?)')
  const insertLoginCode = database.prepare('INSERT INTO login_codes (phone, expires_at, updated_at, payload) VALUES (?, ?, ?, ?)')
  const insertPlugin = database.prepare('INSERT INTO plugins (user_id, plugin_id, updated_at, payload) VALUES (?, ?, ?, ?)')
  const insertBatchSubtitleJob = database.prepare(
    'INSERT INTO batch_subtitle_jobs (id, user_id, updated_at, payload) VALUES (?, ?, ?, ?)',
  )

  database.exec('BEGIN IMMEDIATE;')
  try {
    clearTables(database)
    for (const item of input.users) insertUser.run(item.id, Number(item.updatedAt || 0), JSON.stringify(item))
    for (const item of input.sessions) {
      insertSession.run(item.token, item.userId, Number(item.expiresAt || 0), Number(item.updatedAt || 0), JSON.stringify(item))
    }
    for (const item of input.subscriptions) insertSubscription.run(item.userId, Number(item.updatedAt || 0), JSON.stringify(item))
    for (const item of input.wallets) insertWallet.run(item.userId, Number(item.updatedAt || 0), JSON.stringify(item))
    for (const item of input.walletTransactions) {
      insertWalletTransaction.run(item.id, item.userId, Number(item.createdAt || 0), JSON.stringify(item))
    }
    for (const item of input.orders) {
      insertOrder.run(item.id, item.userId, item.status, Number(item.createdAt || 0), Number(item.updatedAt || 0), JSON.stringify(item))
    }
    for (const item of input.subscriptionPlans) insertPlan.run(item.id, item.enabled ? 1 : 0, JSON.stringify(item))
    for (const item of input.computePriceRules) insertRule.run(item.action, JSON.stringify(item))
    for (const item of input.loginCodes) {
      insertLoginCode.run(item.phone, Number(item.expiresAt || 0), Number(item.updatedAt || 0), JSON.stringify(item))
    }
    for (const item of input.plugins) insertPlugin.run(item.userId, item.pluginId, Number(item.updatedAt || 0), JSON.stringify(item))
    for (const item of input.batchSubtitleJobs || []) {
      insertBatchSubtitleJob.run(item.id, item.userId, Number(item.updatedAt || 0), JSON.stringify(item))
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
