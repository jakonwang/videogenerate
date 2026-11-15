import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import {
  CREATOR_HUB_DEFAULT_SETTINGS,
  type CreatorHubCreatorPerf,
  type CreatorHubCreatorProfile,
  type CreatorHubOrder,
  type CreatorHubProductCost,
  type CreatorHubVideo,
  type CreatorHubSample,
  type CreatorHubSettings,
  type CreatorHubShop,
  type CreatorHubSyncJob,
} from '../../../shared/creatorHub'

type Statement = { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] }
type Database = { exec(sql: string): unknown; prepare(sql: string): Statement; close?: () => unknown }
type DatabaseCtor = new (path: string) => Database

/** Stored shop row: the public shape plus the encrypted cookie blob (never sent to the renderer). */
export type StoredShop = CreatorHubShop & { cookieEncrypted?: string }

const schema = `
CREATE TABLE IF NOT EXISTS ch_shops (id TEXT PRIMARY KEY, shop_id TEXT, updated_at INTEGER NOT NULL, cookie_encrypted TEXT, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_samples (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, product_id TEXT NOT NULL, status INTEGER NOT NULL, created_at INTEGER NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_product_costs (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, product_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_sync_jobs (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_videos (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, posted_at INTEGER NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_creator_perf (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_orders (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, created_at INTEGER NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_creator_profiles (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ch_schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ch_shops_shop_id ON ch_shops(shop_id) WHERE shop_id IS NOT NULL AND shop_id <> '';
CREATE INDEX IF NOT EXISTS idx_ch_samples_shop_created ON ch_samples(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_samples_shop_creator ON ch_samples(shop_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_ch_costs_shop_product ON ch_product_costs(shop_id, product_id);
CREATE INDEX IF NOT EXISTS idx_ch_videos_shop_posted ON ch_videos(shop_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_creator_perf_shop ON ch_creator_perf(shop_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_ch_orders_shop_created ON ch_orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_profiles_shop ON ch_creator_profiles(shop_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_ch_sync_jobs_shop ON ch_sync_jobs(shop_id, started_at DESC);
`

let database: Database | null = null

function db() {
  if (database) return database
  const dbDir = getAppPaths().dbDir
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  let DatabaseSync: DatabaseCtor
  try {
    DatabaseSync = (require('node:sqlite') as { DatabaseSync: DatabaseCtor }).DatabaseSync
  } catch {
    DatabaseSync = require('better-sqlite3') as DatabaseCtor
  }
  database = new DatabaseSync(join(dbDir, 'tiktok-creator-hub.sqlite'))
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

export const creatorHubRepo = {
  // ===== Shops =====
  listShops(): StoredShop[] {
    return db().prepare('SELECT payload, cookie_encrypted FROM ch_shops ORDER BY updated_at DESC').all().map((row: any) => ({ ...parse<CreatorHubShop>(row), cookieEncrypted: row.cookie_encrypted || undefined }))
  },
  getShop(id: string): StoredShop | undefined {
    const row = db().prepare('SELECT payload, cookie_encrypted FROM ch_shops WHERE id = ?').get(id) as any
    return row ? { ...parse<CreatorHubShop>(row), cookieEncrypted: row.cookie_encrypted || undefined } : undefined
  },
  findShopByShopId(shopId: string): StoredShop | undefined {
    const row = db().prepare('SELECT payload, cookie_encrypted FROM ch_shops WHERE shop_id = ?').get(shopId) as any
    return row ? { ...parse<CreatorHubShop>(row), cookieEncrypted: row.cookie_encrypted || undefined } : undefined
  },
  saveShop(shop: StoredShop) {
    const { cookieEncrypted, ...payload } = shop
    db().prepare(`INSERT INTO ch_shops (id, shop_id, updated_at, cookie_encrypted, payload) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET shop_id = excluded.shop_id, updated_at = excluded.updated_at, cookie_encrypted = excluded.cookie_encrypted, payload = excluded.payload`)
      .run(shop.id, shop.shopId || null, shop.updatedAt, cookieEncrypted || null, JSON.stringify(payload))
    return shop
  },
  removeShop(id: string) {
    transaction(() => {
      db().prepare('DELETE FROM ch_samples WHERE shop_id = ?').run(id)
      db().prepare('DELETE FROM ch_product_costs WHERE shop_id = ?').run(id)
      db().prepare('DELETE FROM ch_sync_jobs WHERE shop_id = ?').run(id)
      db().prepare('DELETE FROM ch_videos WHERE shop_id = ?').run(id)
      db().prepare('DELETE FROM ch_creator_perf WHERE shop_id = ?').run(id)
      db().prepare('DELETE FROM ch_orders WHERE shop_id = ?').run(id)
      db().prepare('DELETE FROM ch_creator_profiles WHERE shop_id = ?').run(id)
      db().prepare('DELETE FROM ch_shops WHERE id = ?').run(id)
    })
  },

  // ===== Samples =====
  listSamples(shopId?: string): CreatorHubSample[] {
    const rows = shopId
      ? db().prepare('SELECT payload FROM ch_samples WHERE shop_id = ? ORDER BY created_at DESC').all(shopId)
      : db().prepare('SELECT payload FROM ch_samples ORDER BY created_at DESC').all()
    return rows.map((row) => parse<CreatorHubSample>(row))
  },
  /** Upserts synced rows, keeping local fields (cost override, note, first seen). */
  upsertSamples(rows: Array<Omit<CreatorHubSample, 'firstSeenAt' | 'costOverride' | 'note'>>) {
    const select = db().prepare('SELECT payload FROM ch_samples WHERE id = ?')
    const write = db().prepare(`INSERT INTO ch_samples (id, shop_id, creator_id, product_id, status, created_at, synced_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET creator_id = excluded.creator_id, product_id = excluded.product_id, status = excluded.status, created_at = excluded.created_at, synced_at = excluded.synced_at, payload = excluded.payload`)
    transaction(() => {
      for (const row of rows) {
        const existing = select.get(row.id)
        const previous = existing ? parse<CreatorHubSample>(existing) : undefined
        const next: CreatorHubSample = { ...row, firstSeenAt: previous?.firstSeenAt || row.syncedAt, costOverride: previous?.costOverride, note: previous?.note }
        write.run(next.id, next.shopId, next.creatorId, next.productId, next.status, next.createdAt, next.syncedAt, JSON.stringify(next))
      }
    })
  },
  updateSampleLocal(id: string, patch: { costOverride?: number | null; note?: string | null }) {
    const row = db().prepare('SELECT payload FROM ch_samples WHERE id = ?').get(id)
    if (!row) throw new Error('CREATOR_HUB_SAMPLE_NOT_FOUND')
    const sample = parse<CreatorHubSample>(row)
    if ('costOverride' in patch) sample.costOverride = patch.costOverride == null ? undefined : Number(patch.costOverride)
    if ('note' in patch) sample.note = patch.note ? String(patch.note).slice(0, 500) : undefined
    db().prepare('UPDATE ch_samples SET payload = ? WHERE id = ?').run(JSON.stringify(sample), id)
    return sample
  },

  // ===== Product costs =====
  listCosts(shopId?: string): CreatorHubProductCost[] {
    const rows = shopId
      ? db().prepare('SELECT payload FROM ch_product_costs WHERE shop_id = ? ORDER BY updated_at DESC').all(shopId)
      : db().prepare('SELECT payload FROM ch_product_costs ORDER BY updated_at DESC').all()
    return rows.map((row) => parse<CreatorHubProductCost>(row))
  },
  saveCost(cost: CreatorHubProductCost) {
    db().prepare(`INSERT INTO ch_product_costs (id, shop_id, product_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`)
      .run(cost.id, cost.shopId, cost.productId, cost.updatedAt, JSON.stringify(cost))
    return cost
  },
  removeCost(id: string) {
    db().prepare('DELETE FROM ch_product_costs WHERE id = ?').run(id)
  },

  // ===== Analytics snapshots (window metrics: a full sync replaces the shop's rows) =====
  replaceVideos(shopId: string, rows: CreatorHubVideo[]) {
    transaction(() => {
      db().prepare('DELETE FROM ch_videos WHERE shop_id = ?').run(shopId)
      const write = db().prepare('INSERT OR REPLACE INTO ch_videos (id, shop_id, creator_id, posted_at, synced_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
      for (const row of rows) write.run(row.id, shopId, row.creatorId, row.postedAt, row.syncedAt, JSON.stringify(row))
    })
  },
  listVideos(shopId?: string): CreatorHubVideo[] {
    const rows = shopId
      ? db().prepare('SELECT payload FROM ch_videos WHERE shop_id = ? ORDER BY posted_at DESC').all(shopId)
      : db().prepare('SELECT payload FROM ch_videos ORDER BY posted_at DESC').all()
    return rows.map((row) => parse<CreatorHubVideo>(row))
  },
  replaceCreatorPerf(shopId: string, rows: CreatorHubCreatorPerf[]) {
    transaction(() => {
      db().prepare('DELETE FROM ch_creator_perf WHERE shop_id = ?').run(shopId)
      const write = db().prepare('INSERT OR REPLACE INTO ch_creator_perf (id, shop_id, creator_id, synced_at, payload) VALUES (?, ?, ?, ?, ?)')
      for (const row of rows) write.run(row.id, shopId, row.creatorId, row.syncedAt, JSON.stringify(row))
    })
  },
  listCreatorPerf(shopId?: string): CreatorHubCreatorPerf[] {
    const rows = shopId
      ? db().prepare('SELECT payload FROM ch_creator_perf WHERE shop_id = ?').all(shopId)
      : db().prepare('SELECT payload FROM ch_creator_perf').all()
    return rows.map((row) => parse<CreatorHubCreatorPerf>(row))
  },

  // ===== Orders (history is kept; re-synced rows are updated) =====
  upsertOrders(rows: CreatorHubOrder[]) {
    const write = db().prepare(`INSERT INTO ch_orders (id, shop_id, creator_id, created_at, synced_at, payload) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET creator_id = excluded.creator_id, created_at = excluded.created_at, synced_at = excluded.synced_at, payload = excluded.payload`)
    transaction(() => {
      for (const row of rows) write.run(row.id, row.shopId, row.creatorId, row.createdAt, row.syncedAt, JSON.stringify(row))
    })
  },
  listOrders(shopId?: string, since = 0): CreatorHubOrder[] {
    const rows = shopId
      ? db().prepare('SELECT payload FROM ch_orders WHERE shop_id = ? AND created_at >= ? ORDER BY created_at DESC').all(shopId, since)
      : db().prepare('SELECT payload FROM ch_orders WHERE created_at >= ? ORDER BY created_at DESC').all(since)
    return rows.map((row) => parse<CreatorHubOrder>(row))
  },

  // ===== Creator CRM profiles (local only) =====
  listProfiles(shopId?: string): CreatorHubCreatorProfile[] {
    const rows = shopId
      ? db().prepare('SELECT payload FROM ch_creator_profiles WHERE shop_id = ?').all(shopId)
      : db().prepare('SELECT payload FROM ch_creator_profiles').all()
    return rows.map((row) => parse<CreatorHubCreatorProfile>(row))
  },
  saveProfile(profile: CreatorHubCreatorProfile) {
    db().prepare(`INSERT INTO ch_creator_profiles (id, shop_id, creator_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`)
      .run(profile.id, profile.shopId, profile.creatorId, profile.updatedAt, JSON.stringify(profile))
    return profile
  },

  // ===== Sync jobs =====
  saveSyncJob(job: CreatorHubSyncJob) {
    db().prepare(`INSERT INTO ch_sync_jobs (id, shop_id, status, started_at, payload) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, payload = excluded.payload`)
      .run(job.id, job.shopId, job.status, job.startedAt, JSON.stringify(job))
    return job
  },
  listSyncJobs(shopId: string, limit = 10): CreatorHubSyncJob[] {
    return db().prepare('SELECT payload FROM ch_sync_jobs WHERE shop_id = ? ORDER BY started_at DESC LIMIT ?').all(shopId, limit).map((row) => parse<CreatorHubSyncJob>(row))
  },
  /** Jobs left "running" by a crash or quit are marked failed on startup. */
  failInterruptedJobs() {
    const rows = db().prepare("SELECT payload FROM ch_sync_jobs WHERE status = 'running'").all().map((row) => parse<CreatorHubSyncJob>(row))
    for (const job of rows) this.saveSyncJob({ ...job, status: 'failed', finishedAt: Date.now(), error: 'CREATOR_HUB_SYNC_INTERRUPTED' })
  },

  // ===== Settings =====
  getSettings(): CreatorHubSettings {
    const row = db().prepare("SELECT value FROM ch_settings WHERE key = 'settings'").get() as { value: string } | undefined
    if (!row) return { ...CREATOR_HUB_DEFAULT_SETTINGS }
    try { return { ...CREATOR_HUB_DEFAULT_SETTINGS, ...JSON.parse(row.value) } } catch { return { ...CREATOR_HUB_DEFAULT_SETTINGS } }
  },
  saveSettings(settings: CreatorHubSettings) {
    db().prepare("INSERT INTO ch_settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(settings))
    return settings
  },
}

export function closeCreatorHubDb() {
  try { database?.close?.() } catch { /* ignore */ }
  database = null
}
