import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type {
  ProductImageMaterialBatch,
  ProductImageMaterialDb,
  ProductImageMaterialItem,
  ProductImageMaterialListFilters,
  ProductImageMaterialUsageStatus,
} from './types'

function dbPath() {
  return join(getAppPaths().dbDir, 'product-image-materials.json')
}

function now() {
  return Date.now()
}

function emptyDb(): ProductImageMaterialDb {
  return {
    batches: [],
    materials: [],
  }
}

function normalizeBatch(batch: ProductImageMaterialBatch): ProductImageMaterialBatch {
  return {
    ...batch,
    totalVideos: Number(batch.totalVideos || batch.sourceItems.length || 0),
    completedVideos: Number(batch.completedVideos || 0),
    failedVideos: Number(batch.failedVideos || 0),
    generatedImageCount: Number(batch.generatedImageCount || 0),
    createdAt: Number(batch.createdAt || now()),
    updatedAt: Number(batch.updatedAt || now()),
    sourceItems: Array.isArray(batch.sourceItems)
      ? batch.sourceItems.map((item) => ({
          ...item,
          generatedCount: Number(item.generatedCount || 0),
          skippedCount: Number(item.skippedCount || 0),
          updatedAt: Number(item.updatedAt || now()),
        }))
      : [],
  }
}

function normalizeMaterial(item: ProductImageMaterialItem): ProductImageMaterialItem {
  return {
    ...item,
    usageStatus: item.usageStatus === 'used' ? 'used' : 'unused',
    materialOrigin: item.materialOrigin === 'derived' ? 'derived' : 'original',
    derivedVariantIndex: Number.isFinite(Number(item.derivedVariantIndex)) ? Number(item.derivedVariantIndex) : undefined,
    createdAt: Number(item.createdAt || now()),
    updatedAt: Number(item.updatedAt || now()),
  }
}

export const productImageMaterialsRepo = {
  async readDb() {
    const raw = await readJsonFile<ProductImageMaterialDb>(dbPath(), emptyDb())
    return {
      batches: Array.isArray(raw.batches) ? raw.batches.map(normalizeBatch) : [],
      materials: Array.isArray(raw.materials) ? raw.materials.map(normalizeMaterial) : [],
    }
  },

  async writeDb(db: ProductImageMaterialDb) {
    await writeJsonFile(dbPath(), db)
  },

  async listBatches(userId: string) {
    const db = await this.readDb()
    return db.batches
      .filter((item) => item.userId === userId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async getBatch(userId: string, batchId: string) {
    const list = await this.listBatches(userId)
    return list.find((item) => item.id === batchId) ?? null
  },

  async upsertBatch(input: ProductImageMaterialBatch) {
    const db = await this.readDb()
    const next = normalizeBatch({
      ...input,
      updatedAt: now(),
    })
    const index = db.batches.findIndex((item) => item.userId === next.userId && item.id === next.id)
    if (index >= 0) db.batches[index] = next
    else db.batches.unshift(next)
    await this.writeDb(db)
    return next
  },

  async listMaterials(userId: string, filters?: ProductImageMaterialListFilters) {
    const db = await this.readDb()
    return db.materials
      .filter((item) => {
        if (item.userId !== userId) return false
        if (filters?.category && filters.category !== 'all' && item.category !== filters.category) return false
        if (filters?.usageStatus && filters.usageStatus !== 'all' && item.usageStatus !== filters.usageStatus) return false
        if (String(filters?.boundProductId || '').trim() && String(item.boundProductId || '').trim() !== String(filters?.boundProductId || '').trim()) {
          return false
        }
        return true
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
  },

  async listAllMaterials(filters?: ProductImageMaterialListFilters) {
    const db = await this.readDb()
    return db.materials
      .filter((item) => {
        if (filters?.category && filters.category !== 'all' && item.category !== filters.category) return false
        if (filters?.usageStatus && filters.usageStatus !== 'all' && item.usageStatus !== filters.usageStatus) return false
        if (String(filters?.boundProductId || '').trim() && String(item.boundProductId || '').trim() !== String(filters?.boundProductId || '').trim()) {
          return false
        }
        return true
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
  },

  async getMaterial(userId: string, materialId: string) {
    const list = await this.listMaterials(userId)
    return list.find((item) => item.id === materialId) ?? null
  },

  async getMaterialAny(materialId: string) {
    const list = await this.listAllMaterials()
    return list.find((item) => item.id === materialId) ?? null
  },

  async upsertMaterial(input: ProductImageMaterialItem) {
    const db = await this.readDb()
    const next = normalizeMaterial({
      ...input,
      updatedAt: now(),
    })
    const index = db.materials.findIndex((item) => item.userId === next.userId && item.id === next.id)
    if (index >= 0) db.materials[index] = next
    else db.materials.unshift(next)
    await this.writeDb(db)
    return next
  },

  async setMaterialUsageStatus(userId: string, materialId: string, usageStatus: ProductImageMaterialUsageStatus) {
    const current = await this.getMaterial(userId, materialId)
    if (!current) throw new Error('Material does not exist')
    return await this.upsertMaterial({
      ...current,
      usageStatus,
    })
  },

  async bindMaterialProduct(userId: string, materialId: string, productId?: string) {
    const current = await this.getMaterial(userId, materialId)
    if (!current) throw new Error('Material does not exist')
    return await this.upsertMaterial({
      ...current,
      boundProductId: String(productId || '').trim() || undefined,
    })
  },

  async removeMaterial(userId: string, materialId: string) {
    const db = await this.readDb()
    const index = db.materials.findIndex((item) => item.userId === userId && item.id === materialId)
    if (index < 0) throw new Error('Material does not exist')
    const removed = db.materials[index]
    db.materials.splice(index, 1)
    await this.writeDb(db)
    return removed
  },

  async removeMaterialAny(materialId: string) {
    const db = await this.readDb()
    const index = db.materials.findIndex((item) => item.id === materialId)
    if (index < 0) throw new Error('Material does not exist')
    const removed = db.materials[index]
    db.materials.splice(index, 1)
    await this.writeDb(db)
    return removed
  },

  async setMaterialUsageStatusAny(materialId: string, usageStatus: ProductImageMaterialUsageStatus) {
    const current = await this.getMaterialAny(materialId)
    if (!current) throw new Error('Material does not exist')
    return await this.upsertMaterial({
      ...current,
      usageStatus,
    })
  },
}
