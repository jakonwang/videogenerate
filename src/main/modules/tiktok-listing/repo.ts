import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { TiktokListingExportCategoryConfig, TiktokListingItem } from './types'

type DbShape = {
  items: TiktokListingItem[]
  exportCategoryConfigs: TiktokListingExportCategoryConfig[]
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
    return [...db.items].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async get(id: string): Promise<TiktokListingItem | null> {
    const items = await this.list()
    return items.find((item) => item.id === id) ?? null
  },

  async createOrUpdate(
    payload: Partial<TiktokListingItem> & {
      sourceImagePath: string
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
          analysisBoardImage: payload.analysisBoardImage ?? prev.analysisBoardImage,
          listingImages: payload.listingImages ?? prev.listingImages ?? [],
          updatedAt: ts,
        }
        db.items[idx] = next
        await writeJsonFile(dbPath(), db)
        return next
      }
    }

    const created: TiktokListingItem = {
      id: randomUUID(),
      sourceImagePath: payload.sourceImagePath,
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
    db.items.unshift(created)
    await writeJsonFile(dbPath(), db)
    return created
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
