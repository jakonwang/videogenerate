import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { GmvStoreOption } from '../../../shared/shopProfit'

/**
 * Read-only view of the GMV Max database: which ad stores exist and how much each spent per day.
 * Opened separately and read-only, so it never interferes with the GMV Max module's own writes.
 */

type Statement = { all(...params: unknown[]): unknown[] }
type Database = { prepare(sql: string): Statement; close?: () => unknown }

let handle: Database | null = null
let handlePath = ''

function db(): Database | null {
  const path = join(getAppPaths().dbDir, 'tiktok-gmv-max.sqlite')
  if (handle && handlePath === path) return handle
  if (!existsSync(path)) return null
  try {
    try {
      const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => Database }
      handle = new DatabaseSync(path, { readOnly: true })
    } catch {
      const BetterSqlite = require('better-sqlite3') as new (path: string, options?: { readonly?: boolean; fileMustExist?: boolean }) => Database
      handle = new BetterSqlite(path, { readonly: true, fileMustExist: true })
    }
    handlePath = path
    return handle
  } catch (error) {
    console.warn('[seller-inventory] GMV Max database unavailable', error instanceof Error ? error.message : error)
    return null
  }
}

export const gmvAds = {
  close() {
    handle?.close?.()
    handle = null
    handlePath = ''
  },

  listStores(): GmvStoreOption[] {
    const database = db()
    if (!database) return []
    try {
      const rows = database.prepare('SELECT payload FROM gmv_bindings').all() as Array<{ payload: string }>
      const stores = new Map<string, GmvStoreOption>()
      for (const row of rows) {
        const binding = JSON.parse(String(row.payload)) as Record<string, unknown>
        const storeId = String(binding.storeId || '')
        if (!storeId || stores.has(storeId)) continue
        stores.set(storeId, {
          storeId,
          storeName: String(binding.storeName || storeId),
          advertiserId: String(binding.advertiserId || ''),
          advertiserName: String(binding.advertiserName || ''),
          currency: binding.currency ? String(binding.currency).toUpperCase() : undefined,
        })
      }
      return [...stores.values()]
    } catch {
      return []
    }
  },

  /** Ad spend per day (ad account currency) for one store, summed over all its campaigns. */
  dailySpend(storeId: string, from: string, to: string) {
    const database = db()
    const spend = new Map<string, number>()
    if (!database || !storeId) return spend
    try {
      const rows = database.prepare(`
        SELECT substr(stat_date, 1, 10) AS day, SUM(CAST(json_extract(payload, '$.cost') AS REAL)) AS cost
        FROM gmv_metrics
        WHERE json_extract(payload, '$.storeId') = ? AND substr(stat_date, 1, 10) >= ? AND substr(stat_date, 1, 10) <= ?
        GROUP BY day
      `).all(storeId, from, to) as Array<{ day: string; cost: number }>
      for (const row of rows) spend.set(row.day, Number(row.cost) || 0)
    } catch {
      // A GMV Max schema change must not break the shop page; it just shows no ad spend.
    }
    return spend
  },
}
