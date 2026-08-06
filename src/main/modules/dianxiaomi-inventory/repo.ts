import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import {
  DIANXIAOMI_INVENTORY_SCHEMA_VERSION,
  type InventoryBaselineChange,
  type InventoryDailyShipment,
  type InventoryDb,
  type InventorySku,
  type InventorySyncRun,
} from './types'

function dbPath() {
  return join(getAppPaths().dbDir, 'dianxiaomi-inventory.json')
}

function now() {
  return Date.now()
}

function normalizeSku(item: InventorySku): InventorySku {
  const imageUrl = String(item.imageUrl || '').trim()
  const imageFallbackUrl = String(item.imageFallbackUrl || '').trim()
  return {
    ...item,
    id: String(item.id || '').trim() || randomUUID(),
    sku: String(item.sku || '').trim(),
    imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl.slice(0, 4096) : undefined,
    imageFallbackUrl: /^https?:\/\//i.test(imageFallbackUrl) ? imageFallbackUrl.slice(0, 4096) : undefined,
    baselineDate: String(item.baselineDate || '').trim(),
    baselineStock: Math.max(0, Math.trunc(Number(item.baselineStock) || 0)),
    forecastWindowDays: Math.min(365, Math.max(1, Math.trunc(Number(item.forecastWindowDays) || 30))),
    warningDays: Math.min(365, Math.max(0, Math.trunc(Number(item.warningDays) || 7))),
    createdAt: Number(item.createdAt || now()),
    updatedAt: Number(item.updatedAt || now()),
    lastSyncAt: Number(item.lastSyncAt || 0) || undefined,
    lastSyncError: String(item.lastSyncError || '').trim() || undefined,
  }
}

function normalizeShipment(item: InventoryDailyShipment): InventoryDailyShipment {
  return {
    ...item,
    id: String(item.id || '').trim() || randomUUID(),
    skuId: String(item.skuId || '').trim(),
    date: String(item.date || '').trim(),
    quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)),
    orderCount: Math.max(0, Math.trunc(Number(item.orderCount) || 0)),
    syncedAt: Number(item.syncedAt || now()),
  }
}

function normalizeBaselineChange(item: InventoryBaselineChange): InventoryBaselineChange {
  return {
    ...item,
    id: String(item.id || '').trim() || randomUUID(),
    skuId: String(item.skuId || '').trim(),
    previousDate: String(item.previousDate || '').trim(),
    previousStock: Math.max(0, Math.trunc(Number(item.previousStock) || 0)),
    nextDate: String(item.nextDate || '').trim(),
    nextStock: Math.max(0, Math.trunc(Number(item.nextStock) || 0)),
    changedAt: Number(item.changedAt || now()),
  }
}

function normalizeSyncRun(item: InventorySyncRun): InventorySyncRun {
  return {
    ...item,
    id: String(item.id || '').trim() || randomUUID(),
    startedAt: Number(item.startedAt || now()),
    finishedAt: Number(item.finishedAt || now()),
    skuIds: Array.isArray(item.skuIds) ? item.skuIds.map((value) => String(value || '').trim()).filter(Boolean) : [],
    syncedSkuIds: Array.isArray(item.syncedSkuIds) ? item.syncedSkuIds.map((value) => String(value || '').trim()).filter(Boolean) : [],
    failed: Array.isArray(item.failed)
      ? item.failed.map((entry) => ({ skuId: String(entry?.skuId || '').trim(), message: String(entry?.message || '').trim() })).filter((entry) => entry.skuId)
      : [],
  }
}

function emptyDb(): InventoryDb {
  return {
    version: DIANXIAOMI_INVENTORY_SCHEMA_VERSION,
    skus: [],
    baselineChanges: [],
    shipments: [],
    syncRuns: [],
  }
}

async function readDb() {
  const raw = await readJsonFile<Partial<InventoryDb>>(dbPath(), emptyDb())
  return {
    version: DIANXIAOMI_INVENTORY_SCHEMA_VERSION,
    skus: Array.isArray(raw.skus) ? raw.skus.map(normalizeSku).filter((item) => item.sku && item.baselineDate) : [],
    baselineChanges: Array.isArray(raw.baselineChanges) ? raw.baselineChanges.map(normalizeBaselineChange).filter((item) => item.skuId) : [],
    shipments: Array.isArray(raw.shipments) ? raw.shipments.map(normalizeShipment).filter((item) => item.skuId && item.date) : [],
    syncRuns: Array.isArray(raw.syncRuns) ? raw.syncRuns.map(normalizeSyncRun) : [],
  } satisfies InventoryDb
}

async function writeDb(db: InventoryDb) {
  await writeJsonFile(dbPath(), db)
}

export const dianxiaomiInventoryRepo = {
  async readDb() {
    return await readDb()
  },

  async listSkus() {
    const db = await readDb()
    return [...db.skus].sort((a, b) => a.sku.localeCompare(b.sku, 'en'))
  },

  async getSku(id: string) {
    const db = await readDb()
    return db.skus.find((item) => item.id === String(id || '').trim()) ?? null
  },

  async upsertSku(input: InventorySku) {
    const db = await readDb()
    const next = normalizeSku(input)
    const index = db.skus.findIndex((item) => item.id === next.id)
    if (index >= 0) db.skus[index] = next
    else db.skus.unshift(next)
    await writeDb(db)
    return next
  },

  async removeSku(id: string) {
    const db = await readDb()
    const skuId = String(id || '').trim()
    const existing = db.skus.find((item) => item.id === skuId)
    if (!existing) throw new Error('Inventory SKU does not exist')
    db.skus = db.skus.filter((item) => item.id !== skuId)
    db.baselineChanges = db.baselineChanges.filter((item) => item.skuId !== skuId)
    db.shipments = db.shipments.filter((item) => item.skuId !== skuId)
    await writeDb(db)
    return { ok: true as const }
  },

  async appendBaselineChange(input: InventoryBaselineChange) {
    const db = await readDb()
    db.baselineChanges.push(normalizeBaselineChange(input))
    db.baselineChanges = db.baselineChanges.slice(-5000)
    await writeDb(db)
  },

  async listBaselineChanges(skuId: string) {
    const db = await readDb()
    return db.baselineChanges
      .filter((item) => item.skuId === String(skuId || '').trim())
      .sort((a, b) => Number(b.changedAt || 0) - Number(a.changedAt || 0))
  },

  async listShipments(skuId: string, startDate?: string, endDate?: string) {
    const id = String(skuId || '').trim()
    const start = String(startDate || '').trim()
    const end = String(endDate || '').trim()
    const db = await readDb()
    return db.shipments
      .filter((item) => item.skuId === id && (!start || item.date >= start) && (!end || item.date <= end))
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  async replaceShipments(skuId: string, startDate: string, endDate: string, rows: InventoryDailyShipment[]) {
    const db = await readDb()
    const id = String(skuId || '').trim()
    const normalizedRows = rows.map(normalizeShipment).filter((item) => item.skuId === id && item.date >= startDate && item.date <= endDate)
    db.shipments = db.shipments.filter((item) => item.skuId !== id || item.date < startDate || item.date > endDate)
    db.shipments.push(...normalizedRows)
    db.shipments.sort((a, b) => a.skuId.localeCompare(b.skuId) || a.date.localeCompare(b.date))
    await writeDb(db)
  },

  async appendSyncRun(input: InventorySyncRun) {
    const db = await readDb()
    db.syncRuns.push(normalizeSyncRun(input))
    db.syncRuns = db.syncRuns.slice(-500)
    await writeDb(db)
  },
}
