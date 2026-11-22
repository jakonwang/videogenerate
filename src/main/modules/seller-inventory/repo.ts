import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import {
  isCountedStatus,
  SI_DEFAULT_SETTINGS,
  SI_ORDER_STATUS,
  type SiCompassRow,
  type SiDailyRow,
  type SiOrderLine,
  type SiPlatformSku,
  type SiSettings,
  type SiShopDay,
  type SiShopState,
  type SiSkuSettings,
  type SiStockMove,
} from '../../../shared/sellerInventory'
import type { ShopAdLink, SiSettlement } from '../../../shared/shopProfit'
import { DEFAULT_REPORT_SETTINGS, type MorningReport, type ReportSettings, type ShopHealth } from '../../../shared/shopAnalysis'

type Statement = { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] }
type Database = { exec(sql: string): unknown; prepare(sql: string): Statement; close?: () => unknown }
type DatabaseCtor = new (path: string) => Database

const schema = `
CREATE TABLE IF NOT EXISTS si_platform_skus (id TEXT PRIMARY KEY, shop_key TEXT NOT NULL, sku_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_si_platform_skus_shop ON si_platform_skus(shop_key);
CREATE TABLE IF NOT EXISTS si_order_lines (
  id TEXT PRIMARY KEY, shop_key TEXT NOT NULL, order_id TEXT NOT NULL, sku_id TEXT NOT NULL, seller_sku TEXT NOT NULL,
  date TEXT NOT NULL, created_at INTEGER NOT NULL, quantity INTEGER NOT NULL, amount REAL NOT NULL, status INTEGER NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_si_order_lines_date ON si_order_lines(shop_key, date);
CREATE TABLE IF NOT EXISTS si_compass (
  id TEXT PRIMARY KEY, shop_key TEXT NOT NULL, sku_id TEXT NOT NULL, date TEXT NOT NULL,
  gmv REAL NOT NULL, orders INTEGER NOT NULL, units INTEGER NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_si_compass_date ON si_compass(shop_key, date);
CREATE TABLE IF NOT EXISTS si_compass_fetch (id TEXT PRIMARY KEY, shop_key TEXT NOT NULL, date TEXT NOT NULL, fetched_at INTEGER NOT NULL, rows INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS si_shop_state (shop_key TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS si_mappings (sku_key TEXT PRIMARY KEY, code TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS si_sku_settings (code TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS si_moves (id TEXT PRIMARY KEY, code TEXT NOT NULL, date TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_si_moves_code ON si_moves(code, date);
CREATE TABLE IF NOT EXISTS si_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS si_shop_daily (id TEXT PRIMARY KEY, shop_key TEXT NOT NULL, date TEXT NOT NULL, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_si_shop_daily ON si_shop_daily(shop_key, date);
CREATE TABLE IF NOT EXISTS si_settlements (id TEXT PRIMARY KEY, shop_key TEXT NOT NULL, status TEXT NOT NULL, placed_date TEXT NOT NULL, settled_at INTEGER, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_si_settlements ON si_settlements(shop_key, placed_date);
CREATE TABLE IF NOT EXISTS si_ad_links (shop_key TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS si_shop_health (shop_key TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS si_reports (id TEXT PRIMARY KEY, date TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_si_reports_date ON si_reports(date, created_at);
`

let database: Database | null = null
let databasePath = ''
/** Bumped on every write; computed views are cached until it changes. */
let dataVersion = 0

/** Counts writes: any statement run through `run` changes the data. */
function tracked(handle: Database): Database {
  // Prepared once per SQL text; preparing on every call showed up in profiles.
  const statements = new Map<string, Statement>()
  return {
    exec: (sql: string) => handle.exec(sql),
    close: handle.close?.bind(handle),
    prepare(sql: string) {
      let statement = statements.get(sql)
      if (!statement) {
        statement = handle.prepare(sql)
        statements.set(sql, statement)
      }
      const prepared = statement
      return {
        run: (...params: unknown[]) => { dataVersion += 1; return prepared.run(...params) },
        get: (...params: unknown[]) => prepared.get(...params),
        all: (...params: unknown[]) => prepared.all(...params),
      }
    },
  }
}

function db() {
  // Resolving the app paths on every call cost ~20 ms per query; the handle is reused until close().
  if (database) return database
  const dbDir = getAppPaths().dbDir
  const path = join(dbDir, 'seller-inventory.sqlite')
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  let DatabaseSync: DatabaseCtor
  try {
    DatabaseSync = (require('node:sqlite') as { DatabaseSync: DatabaseCtor }).DatabaseSync
  } catch {
    DatabaseSync = require('better-sqlite3') as DatabaseCtor
  }
  database = tracked(new DatabaseSync(path))
  databasePath = path
  dataVersion += 1
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA synchronous = NORMAL;')
  database.exec(schema)
  return database
}

function parse<T>(row: unknown): T {
  return JSON.parse(String((row as { payload: string }).payload)) as T
}

function transaction(run: () => void) {
  const handle = db()
  handle.exec('BEGIN')
  try {
    run()
    handle.exec('COMMIT')
  } catch (error) {
    handle.exec('ROLLBACK')
    throw error
  }
}

export const sellerInventoryRepo = {
  version() {
    return dataVersion
  },

  /** Closes the handle; tests point the data dir somewhere else between runs. */
  close() {
    database?.close?.()
    database = null
    databasePath = ''
  },

  // ===== Platform SKUs =====
  upsertPlatformSkus(rows: SiPlatformSku[]) {
    const statement = db().prepare('INSERT OR REPLACE INTO si_platform_skus (id, shop_key, sku_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)')
    transaction(() => {
      for (const row of rows) statement.run(row.id, row.shopKey, row.skuId, row.updatedAt, JSON.stringify(row))
    })
  },

  /** Drops SKUs of a shop that the latest full product sync no longer returned. */
  prunePlatformSkus(shopKey: string, keepIds: Set<string>) {
    const rows = db().prepare('SELECT id FROM si_platform_skus WHERE shop_key = ?').all(shopKey) as Array<{ id: string }>
    const remove = db().prepare('DELETE FROM si_platform_skus WHERE id = ?')
    transaction(() => {
      for (const row of rows) if (!keepIds.has(row.id)) remove.run(row.id)
    })
  },

  listPlatformSkus(shopKeys?: string[]): SiPlatformSku[] {
    const rows = db().prepare('SELECT payload FROM si_platform_skus').all().map((row) => parse<SiPlatformSku>(row))
    return shopKeys ? rows.filter((row) => shopKeys.includes(row.shopKey)) : rows
  },

  // ===== Orders =====
  upsertOrderLines(rows: SiOrderLine[]) {
    const statement = db().prepare('INSERT OR REPLACE INTO si_order_lines (id, shop_key, order_id, sku_id, seller_sku, date, created_at, quantity, amount, status, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    transaction(() => {
      for (const row of rows) {
        statement.run(row.id, row.shopKey, row.orderId, row.skuId, row.sellerSku, row.date, row.createdAt, row.quantity, row.amount, row.status, JSON.stringify(row))
      }
    })
  },

  /** Order-based daily rows for one shop from `fromDate` on. Unpaid lines are left out; cancelled ones only count as cancelled units. */
  dailyFromOrders(shopKey: string, fromDate: string): SiDailyRow[] {
    const rows = db().prepare(`
      SELECT sku_id, MAX(seller_sku) AS seller_sku, date, status, SUM(quantity) AS units, SUM(amount) AS amount, COUNT(DISTINCT order_id) AS orders
      FROM si_order_lines WHERE shop_key = ? AND date >= ? GROUP BY sku_id, date, status
    `).all(shopKey, fromDate) as Array<{ sku_id: string; seller_sku: string; date: string; status: number; units: number; amount: number; orders: number }>
    const merged = new Map<string, SiDailyRow>()
    for (const row of rows) {
      const key = `${row.sku_id}|${row.date}`
      const current = merged.get(key) || { shopKey, skuId: row.sku_id, sellerSku: row.seller_sku || '', date: row.date, units: 0, amount: 0, orders: 0, cancelledUnits: 0 }
      if (!current.sellerSku && row.seller_sku) current.sellerSku = row.seller_sku
      const status = Number(row.status)
      if (isCountedStatus(status)) {
        current.units += Number(row.units) || 0
        current.amount += Number(row.amount) || 0
        current.orders += Number(row.orders) || 0
      } else if (status === SI_ORDER_STATUS.cancelled) {
        current.cancelledUnits += Number(row.units) || 0
      }
      merged.set(key, current)
    }
    return [...merged.values()]
  },

  // ===== Compass =====
  replaceCompassDay(shopKey: string, date: string, rows: SiCompassRow[], fetchedAt: number) {
    const remove = db().prepare('DELETE FROM si_compass WHERE shop_key = ? AND date = ?')
    const insert = db().prepare('INSERT OR REPLACE INTO si_compass (id, shop_key, sku_id, date, gmv, orders, units, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const mark = db().prepare('INSERT OR REPLACE INTO si_compass_fetch (id, shop_key, date, fetched_at, rows) VALUES (?, ?, ?, ?, ?)')
    transaction(() => {
      remove.run(shopKey, date)
      for (const row of rows) insert.run(`${shopKey}:${row.skuId}:${date}`, shopKey, row.skuId, date, row.gmv, row.orders, row.units, JSON.stringify(row))
      mark.run(`${shopKey}:${date}`, shopKey, date, fetchedAt, rows.length)
    })
  },

  compassFetchedDates(shopKey: string) {
    const rows = db().prepare('SELECT date, fetched_at FROM si_compass_fetch WHERE shop_key = ?').all(shopKey) as Array<{ date: string; fetched_at: number }>
    return new Map(rows.map((row) => [row.date, Number(row.fetched_at)]))
  },

  dailyFromCompass(shopKey: string, fromDate: string, beforeDate: string): SiDailyRow[] {
    // Columns only: parsing the JSON payload of every row was the slowest part of the dashboards.
    const rows = db().prepare('SELECT sku_id, date, gmv, orders, units FROM si_compass WHERE shop_key = ? AND date >= ? AND date < ?').all(shopKey, fromDate, beforeDate) as Array<{ sku_id: string; date: string; gmv: number; orders: number; units: number }>
    return rows.map((row) => ({ shopKey, skuId: row.sku_id, sellerSku: '', date: row.date, units: Number(row.units) || 0, amount: Number(row.gmv) || 0, orders: Number(row.orders) || 0, cancelledUnits: 0 }))
  },

  // ===== Shop daily metrics (Data Compass) =====
  upsertShopDays(rows: SiShopDay[]) {
    const statement = db().prepare('INSERT OR REPLACE INTO si_shop_daily (id, shop_key, date, fetched_at, payload) VALUES (?, ?, ?, ?, ?)')
    transaction(() => {
      for (const row of rows) statement.run(`${row.shopKey}:${row.date}`, row.shopKey, row.date, row.fetchedAt, JSON.stringify(row))
    })
  },

  listShopDays(shopKey: string, fromDate: string, toDate: string): SiShopDay[] {
    return db().prepare('SELECT payload FROM si_shop_daily WHERE shop_key = ? AND date >= ? AND date <= ? ORDER BY date').all(shopKey, fromDate, toDate).map((row) => parse<SiShopDay>(row))
  },

  shopDayFetchedAt(shopKey: string) {
    const rows = db().prepare('SELECT date, fetched_at FROM si_shop_daily WHERE shop_key = ?').all(shopKey) as Array<{ date: string; fetched_at: number }>
    return new Map(rows.map((row) => [row.date, Number(row.fetched_at)]))
  },

  // ===== Settlements =====
  /** Pending records are replaced as a whole each sync (they move to settled or change amount). */
  replacePendingSettlements(shopKey: string, records: SiSettlement[]) {
    const remove = db().prepare("DELETE FROM si_settlements WHERE shop_key = ? AND status = 'pending'")
    const insert = db().prepare('INSERT OR REPLACE INTO si_settlements (id, shop_key, status, placed_date, settled_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
    transaction(() => {
      remove.run(shopKey)
      for (const record of records) insert.run(record.id, shopKey, 'pending', record.placedDate, null, JSON.stringify(record))
    })
  },

  upsertSettled(records: SiSettlement[]) {
    const insert = db().prepare('INSERT OR REPLACE INTO si_settlements (id, shop_key, status, placed_date, settled_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
    transaction(() => {
      for (const record of records) insert.run(record.id, record.shopKey, 'settled', record.placedDate, record.settledAt ?? null, JSON.stringify(record))
    })
  },

  knownSettlementIds(ids: string[]) {
    if (!ids.length) return new Set<string>()
    const rows = db().prepare(`SELECT id FROM si_settlements WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Array<{ id: string }>
    return new Set(rows.map((row) => row.id))
  },

  listSettlements(shopKey: string, fromPlacedDate?: string): SiSettlement[] {
    const rows = fromPlacedDate
      ? db().prepare('SELECT payload FROM si_settlements WHERE shop_key = ? AND placed_date >= ?').all(shopKey, fromPlacedDate)
      : db().prepare('SELECT payload FROM si_settlements WHERE shop_key = ?').all(shopKey)
    return rows.map((row) => parse<SiSettlement>(row))
  },

  // ===== Ad account links (one GMV Max store per shop) =====
  getAdLink(shopKey: string): ShopAdLink | undefined {
    const row = db().prepare('SELECT payload FROM si_ad_links WHERE shop_key = ?').get(shopKey)
    return row ? parse<ShopAdLink>(row) : undefined
  },

  saveAdLink(link: ShopAdLink | null, shopKey: string) {
    if (!link) db().prepare('DELETE FROM si_ad_links WHERE shop_key = ?').run(shopKey)
    else db().prepare('INSERT OR REPLACE INTO si_ad_links (shop_key, payload) VALUES (?, ?)').run(shopKey, JSON.stringify(link))
  },

  // ===== Shop health =====
  saveShopHealth(health: ShopHealth) {
    db().prepare('INSERT OR REPLACE INTO si_shop_health (shop_key, fetched_at, payload) VALUES (?, ?, ?)').run(health.shopKey, health.fetchedAt, JSON.stringify(health))
  },

  getShopHealth(shopKey: string): ShopHealth | undefined {
    const row = db().prepare('SELECT payload FROM si_shop_health WHERE shop_key = ?').get(shopKey)
    return row ? parse<ShopHealth>(row) : undefined
  },

  // ===== Morning reports =====
  saveReport(report: MorningReport) {
    db().prepare('INSERT OR REPLACE INTO si_reports (id, date, created_at, payload) VALUES (?, ?, ?, ?)').run(report.id, report.date, report.createdAt, JSON.stringify(report))
    return report
  },

  listReports(limit = 14): MorningReport[] {
    return db().prepare('SELECT payload FROM si_reports ORDER BY created_at DESC LIMIT ?').all(limit).map((row) => parse<MorningReport>(row))
  },

  getReportSettings(): ReportSettings {
    const row = db().prepare('SELECT value FROM si_settings WHERE key = ?').get('report') as { value: string } | undefined
    try {
      return { ...DEFAULT_REPORT_SETTINGS, ...(row ? (JSON.parse(row.value) as Partial<ReportSettings>) : {}) }
    } catch {
      return { ...DEFAULT_REPORT_SETTINGS }
    }
  },

  saveReportSettings(settings: ReportSettings) {
    db().prepare('INSERT OR REPLACE INTO si_settings (key, value) VALUES (?, ?)').run('report', JSON.stringify(settings))
    return settings
  },

  // ===== Shop state =====
  getShopState(shopKey: string): SiShopState {
    const row = db().prepare('SELECT payload FROM si_shop_state WHERE shop_key = ?').get(shopKey)
    return row ? parse<SiShopState>(row) : { shopKey }
  },

  saveShopState(state: SiShopState) {
    db().prepare('INSERT OR REPLACE INTO si_shop_state (shop_key, payload) VALUES (?, ?)').run(state.shopKey, JSON.stringify(state))
    return state
  },

  // ===== Mappings =====
  listMappings() {
    const rows = db().prepare('SELECT sku_key, code FROM si_mappings').all() as Array<{ sku_key: string; code: string }>
    return new Map(rows.map((row) => [row.sku_key, row.code]))
  },

  setMappings(entries: Array<{ skuKey: string; code: string }>) {
    const upsert = db().prepare('INSERT OR REPLACE INTO si_mappings (sku_key, code, updated_at) VALUES (?, ?, ?)')
    const remove = db().prepare('DELETE FROM si_mappings WHERE sku_key = ?')
    transaction(() => {
      for (const entry of entries) {
        if (entry.code) upsert.run(entry.skuKey, entry.code, Date.now())
        else remove.run(entry.skuKey)
      }
    })
  },

  // ===== SKU settings =====
  listSkuSettings(): SiSkuSettings[] {
    return db().prepare('SELECT payload FROM si_sku_settings').all().map((row) => parse<SiSkuSettings>(row))
  },

  saveSkuSettings(settings: SiSkuSettings) {
    db().prepare('INSERT OR REPLACE INTO si_sku_settings (code, payload) VALUES (?, ?)').run(settings.code, JSON.stringify(settings))
    return settings
  },

  // ===== Stock moves =====
  listMoves(code?: string): SiStockMove[] {
    const rows = code
      ? db().prepare('SELECT payload FROM si_moves WHERE code = ? ORDER BY date DESC, created_at DESC').all(code)
      : db().prepare('SELECT payload FROM si_moves ORDER BY date DESC, created_at DESC').all()
    return rows.map((row) => parse<SiStockMove>(row))
  },

  addMove(move: SiStockMove) {
    db().prepare('INSERT INTO si_moves (id, code, date, created_at, payload) VALUES (?, ?, ?, ?, ?)').run(move.id, move.code, move.date, move.createdAt, JSON.stringify(move))
    return move
  },

  removeMove(id: string) {
    db().prepare('DELETE FROM si_moves WHERE id = ?').run(id)
  },

  // ===== Settings =====
  getSettings(): SiSettings {
    const row = db().prepare('SELECT value FROM si_settings WHERE key = ?').get('settings') as { value: string } | undefined
    if (!row) return { ...SI_DEFAULT_SETTINGS }
    try {
      return { ...SI_DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<SiSettings>) }
    } catch {
      return { ...SI_DEFAULT_SETTINGS }
    }
  },

  saveSettings(settings: SiSettings) {
    db().prepare('INSERT OR REPLACE INTO si_settings (key, value) VALUES (?, ?)').run('settings', JSON.stringify(settings))
    return settings
  },
}
