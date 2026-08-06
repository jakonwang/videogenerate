import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { buildAdvancedSearchPayload, DianxiaomiClient, type DianxiaomiClientLike } from './client'
import { buildZeroFilledShipments, computeInventorySkuSummary, inclusiveDayCount, normalizeDateInput, todayLocalDate } from './calculator'
import { dianxiaomiInventoryRepo } from './repo'
import { aggregateShipmentLines, parseDianxiaomiShipmentLines, responseRecordCount, responseTotalCount } from './parser'
import type {
  InventoryDashboard,
  InventoryDetail,
  ParsedShipmentLine,
  InventorySku,
  InventorySyncResult,
  SaveInventorySkuInput,
} from './types'

type ServiceDependencies = {
  now: () => number
  client: DianxiaomiClientLike
}

const defaultDependencies: ServiceDependencies = {
  now: () => Date.now(),
  client: new DianxiaomiClient(() => null),
}

let dependencies: ServiceDependencies = defaultDependencies

export function configureDianxiaomiInventoryService(getMainWindow: () => BrowserWindow | null) {
  dependencies = {
    ...dependencies,
    client: new DianxiaomiClient(getMainWindow),
  }
}

export function setDianxiaomiInventoryDependenciesForTest(next: Partial<ServiceDependencies>) {
  dependencies = {
    ...dependencies,
    ...next,
  }
}

function integer(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function validateInput(input: SaveInventorySkuInput) {
  const sku = String(input?.sku || '').trim()
  if (!sku) throw new Error('SKU is required')
  if (sku.length > 120) throw new Error('SKU is too long')
  const baselineDate = normalizeDateInput(input?.baselineDate)
  if (!baselineDate) throw new Error('A valid baseline date is required')
  const baselineStock = integer(input?.baselineStock, -1)
  if (baselineStock < 0) throw new Error('Baseline stock must be a non-negative integer')
  const forecastWindowDays = integer(input?.forecastWindowDays, 30)
  if (forecastWindowDays < 1 || forecastWindowDays > 365) throw new Error('Forecast window must be between 1 and 365 days')
  const warningDays = integer(input?.warningDays, 7)
  if (warningDays < 0 || warningDays > 365) throw new Error('Warning days must be between 0 and 365 days')
  return { sku, baselineDate, baselineStock, forecastWindowDays, warningDays }
}

function isAuthRequired(error: unknown) {
  return String(error instanceof Error ? error.message : error || '').includes('DIANXIAOMI_AUTH_REQUIRED')
}

function isTransient(error: unknown) {
  return /429|5\d\d|timeout|timed out|network|net::|connection/i.test(String(error instanceof Error ? error.message : error || ''))
}

async function wait(milliseconds: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function searchWithRetry(payload: ReturnType<typeof buildAdvancedSearchPayload>) {
  try {
    return await dependencies.client.search(payload)
  } catch (error) {
    if (!isTransient(error)) throw error
    await wait(250)
    return await dependencies.client.search(payload)
  }
}

async function syncOneSku(sku: InventorySku, syncAt: number) {
  const endDate = todayLocalDate(syncAt)
  const totalDays = inclusiveDayCount(sku.baselineDate, endDate)
  if (totalDays <= 0) throw new Error('Baseline date is after today')
  const history = totalDays > 120
  const pageSize = 100
  const lines: ParsedShipmentLine[] = []
  let pageNo = 1

  while (pageNo <= 1000) {
    const request = buildAdvancedSearchPayload({
      sku: sku.sku,
      startDate: sku.baselineDate,
      endDate,
      pageNo,
      pageSize,
      history,
    })
    const response = await searchWithRetry(request)
    lines.push(...parseDianxiaomiShipmentLines(response, sku.sku))
    const recordCount = responseRecordCount(response)
    const totalCount = responseTotalCount(response)
    if (recordCount <= 0 || recordCount < pageSize || (totalCount > 0 && pageNo * pageSize >= totalCount)) break
    pageNo += 1
  }

  if (pageNo > 1000) throw new Error('Dianxiaomi pagination exceeded the safety limit')
  const quantities = aggregateShipmentLines(lines)
  const imageUrl = lines.find((line) => line.imageUrl)?.imageUrl || sku.imageUrl
  const imageFallbackUrl = lines.find((line) => line.imageFallbackUrl)?.imageFallbackUrl || sku.imageFallbackUrl
  const rows = buildZeroFilledShipments({
    skuId: sku.id,
    startDate: sku.baselineDate,
    endDate,
    quantities,
    syncedAt: syncAt,
  })
  await dianxiaomiInventoryRepo.replaceShipments(sku.id, sku.baselineDate, endDate, rows)
  await dianxiaomiInventoryRepo.upsertSku({
    ...sku,
    imageUrl,
    imageFallbackUrl,
    updatedAt: syncAt,
    lastSyncAt: syncAt,
    lastSyncError: undefined,
  })
}

async function buildSummary(sku: InventorySku) {
  const shipments = await dianxiaomiInventoryRepo.listShipments(sku.id, sku.baselineDate, todayLocalDate(dependencies.now()))
  return computeInventorySkuSummary(sku, shipments, dependencies.now())
}

export const dianxiaomiInventoryService = {
  async getDashboard(): Promise<InventoryDashboard> {
    const [skus, auth] = await Promise.all([
      dianxiaomiInventoryRepo.listSkus(),
      dependencies.client.getAuthStatus(),
    ])
    const items = await Promise.all(skus.map((sku) => buildSummary(sku)))
    const lastSyncAt = items.reduce<number | undefined>((latest, item) => Math.max(latest || 0, item.lastSyncAt || 0) || undefined, undefined)
    return {
      items,
      auth,
      summary: {
        skuCount: items.length,
        outOfStockCount: items.filter((item) => item.risk === 'out_of_stock').length,
        reorderCount: items.filter((item) => item.risk === 'reorder').length,
        windowShipmentQuantity: items.reduce((total, item) => total + item.windowShipmentQuantity, 0),
        lastSyncAt,
      },
    }
  },

  async getDetail(input: { skuId: string; startDate?: string; endDate?: string }): Promise<InventoryDetail> {
    const sku = await dianxiaomiInventoryRepo.getSku(input?.skuId)
    if (!sku) throw new Error('Inventory SKU does not exist')
    const startDate = normalizeDateInput(input?.startDate) || sku.baselineDate
    const endDate = normalizeDateInput(input?.endDate) || todayLocalDate(dependencies.now())
    if (endDate < startDate) throw new Error('Detail date range is invalid')
    const shipments = await dianxiaomiInventoryRepo.listShipments(sku.id, startDate, endDate)
    const allShipments = await dianxiaomiInventoryRepo.listShipments(sku.id, sku.baselineDate, endDate)
    return {
      sku: computeInventorySkuSummary(sku, allShipments, dependencies.now()),
      shipments,
      baselineChanges: await dianxiaomiInventoryRepo.listBaselineChanges(sku.id),
    }
  },

  async saveSku(input: SaveInventorySkuInput) {
    const normalized = validateInput(input)
    const skus = await dianxiaomiInventoryRepo.listSkus()
    const existing = input?.id ? skus.find((item) => item.id === String(input.id).trim()) : undefined
    if (input?.id && !existing) throw new Error('Inventory SKU does not exist')
    const duplicate = skus.find((item) => item.id !== existing?.id && item.sku.toLowerCase() === normalized.sku.toLowerCase())
    if (duplicate) throw new Error('This SKU is already being tracked')
    const timestamp = dependencies.now()
    const next: InventorySku = {
      ...(existing || {
        id: randomUUID(),
        createdAt: timestamp,
      }),
      ...normalized,
      updatedAt: timestamp,
      ...(existing && existing.baselineDate !== normalized.baselineDate
        ? { lastSyncAt: undefined, lastSyncError: undefined }
        : {}),
    }
    if (existing && (existing.baselineDate !== next.baselineDate || existing.baselineStock !== next.baselineStock)) {
      await dianxiaomiInventoryRepo.appendBaselineChange({
        id: randomUUID(),
        skuId: existing.id,
        previousDate: existing.baselineDate,
        previousStock: existing.baselineStock,
        nextDate: next.baselineDate,
        nextStock: next.baselineStock,
        changedAt: timestamp,
      })
    }
    return await dianxiaomiInventoryRepo.upsertSku(next)
  },

  async removeSku(id: string) {
    return await dianxiaomiInventoryRepo.removeSku(id)
  },

  async sync(input?: { skuId?: string }): Promise<InventorySyncResult> {
    const auth = await dependencies.client.getAuthStatus()
    const requestedId = String(input?.skuId || '').trim()
    const allSkus = await dianxiaomiInventoryRepo.listSkus()
    const skus = requestedId ? allSkus.filter((item) => item.id === requestedId) : allSkus
    if (requestedId && !skus.length) throw new Error('Inventory SKU does not exist')
    if (!auth.authenticated) {
      return { ok: false, authRequired: true, syncedSkuIds: [], failed: [] }
    }
    const startedAt = dependencies.now()
    const syncedSkuIds: string[] = []
    const failed: Array<{ skuId: string; message: string }> = []
    let authRequired = false
    for (const sku of skus) {
      try {
        await syncOneSku(sku, dependencies.now())
        syncedSkuIds.push(sku.id)
      } catch (error) {
        const message = isAuthRequired(error) ? 'Dianxiaomi login expired' : (error instanceof Error ? error.message : String(error))
        failed.push({ skuId: sku.id, message })
        authRequired = authRequired || isAuthRequired(error)
        await dianxiaomiInventoryRepo.upsertSku({ ...sku, updatedAt: dependencies.now(), lastSyncError: message })
        if (authRequired) break
      }
    }
    const finishedAt = dependencies.now()
    await dianxiaomiInventoryRepo.appendSyncRun({
      id: randomUUID(),
      startedAt,
      finishedAt,
      skuIds: skus.map((item) => item.id),
      syncedSkuIds,
      failed,
    })
    return {
      ok: failed.length === 0,
      authRequired,
      syncedSkuIds,
      failed,
      ...(syncedSkuIds.length ? { syncedAt: finishedAt } : {}),
    }
  },

  async getAuthStatus() {
    return await dependencies.client.getAuthStatus()
  },

  async openLogin() {
    return await dependencies.client.openLogin()
  },

  async logout() {
    return await dependencies.client.logout()
  },

  close() {
    dependencies.client.close()
  },
}
