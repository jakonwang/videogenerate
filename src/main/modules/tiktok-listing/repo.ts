import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { TiktokListingExportCategoryConfig, TiktokListingItem } from './types'

type DbShape = {
  items: TiktokListingItem[]
  exportCategoryConfigs: TiktokListingExportCategoryConfig[]
}

function normalizeReferenceImagePaths(sourceImagePath: string, referenceImagePaths?: string[]) {
  const ordered = [sourceImagePath, ...(Array.isArray(referenceImagePaths) ? referenceImagePaths : [])]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return Array.from(new Set(ordered))
}

function normalizeItem(item: TiktokListingItem): TiktokListingItem {
  return {
    ...item,
    referenceImagePaths: normalizeReferenceImagePaths(item.sourceImagePath, item.referenceImagePaths),
  }
}

const dbPath = () => join(getAppPaths().dbDir, 'tiktok-listing.json')

function now() {
  return Date.now()
}

function defaultDb(): DbShape {
  return {
    items: [],
    exportCategoryConfigs: [],
  }
}

export const tiktokListingRepo = {
  async list(): Promise<TiktokListingItem[]> {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    return [...db.items].map(normalizeItem).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async get(id: string): Promise<TiktokListingItem | null> {
    const items = await this.list()
    return items.find((item) => item.id === id) ?? null
  },

  async createOrUpdate(
    payload: Partial<TiktokListingItem> & {
      sourceImagePath: string
      referenceImagePaths?: string[]
      category: TiktokListingItem['category']
      sku: string
      localDisplayPrice: string
      titleLanguage: TiktokListingItem['titleLanguage']
    },
  ): Promise<TiktokListingItem> {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    const ts = now()
    if (payload.id) {
      const idx = db.items.findIndex((item) => item.id === payload.id)
      if (idx >= 0) {
        const prev = db.items[idx]
        const next: TiktokListingItem = {
          ...prev,
          ...payload,
          referenceImagePaths: normalizeReferenceImagePaths(payload.sourceImagePath, payload.referenceImagePaths ?? prev.referenceImagePaths),
          analysisBoardImage: payload.analysisBoardImage ?? prev.analysisBoardImage,
          listingImages: payload.listingImages ?? prev.listingImages ?? [],
          updatedAt: ts,
        }
        db.items[idx] = normalizeItem(next)
        await writeJsonFile(dbPath(), db)
        return normalizeItem(next)
      }
    }

    const created: TiktokListingItem = {
      id: randomUUID(),
      sourceImagePath: payload.sourceImagePath,
      referenceImagePaths: normalizeReferenceImagePaths(payload.sourceImagePath, payload.referenceImagePaths),
      category: payload.category,
      sku: payload.sku,
      localDisplayPrice: payload.localDisplayPrice,
      titleLanguage: payload.titleLanguage,
      generatedTitle: payload.generatedTitle,
      generatedDescription: payload.generatedDescription,
      analysisBoardImage: payload.analysisBoardImage,
      listingImages: payload.listingImages ?? [],
      generationStatus: payload.generationStatus ?? 'idle',
      generationError: payload.generationError,
      generatedAt: payload.generatedAt,
      createdAt: ts,
      updatedAt: ts,
    }
    db.items.unshift(normalizeItem(created))
    await writeJsonFile(dbPath(), db)
    return normalizeItem(created)
  },

  async remove(id: string) {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    db.items = db.items.filter((item) => item.id !== id)
    await writeJsonFile(dbPath(), db)
    return { ok: true as const }
  },

  async getExportCategoryConfigs(): Promise<TiktokListingExportCategoryConfig[]> {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    return [...(db.exportCategoryConfigs || [])]
  },

  async saveExportCategoryConfigs(configs: TiktokListingExportCategoryConfig[]) {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    db.exportCategoryConfigs = [...configs]
    await writeJsonFile(dbPath(), db)
    return db.exportCategoryConfigs
  },
}
