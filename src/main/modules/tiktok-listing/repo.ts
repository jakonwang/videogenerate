import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { materializeManagedAsset, materializeManagedAssets } from '../managed-assets/service'
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

function remapSourceReferencePaths(originalSourcePath: string, managedSourcePath: string, referenceImagePaths?: string[]) {
  return normalizeReferenceImagePaths(originalSourcePath, referenceImagePaths)
    .map((item) => item === originalSourcePath ? managedSourcePath : item)
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
        const ownerId = String(payload.id)
        const sourceImagePath = await materializeManagedAsset({
          sourcePath: payload.sourceImagePath,
          module: 'tiktok-listing',
          ownerId,
          assetId: 'source-image',
        })
        const referenceImages = await materializeManagedAssets(
          remapSourceReferencePaths(
            payload.sourceImagePath,
            sourceImagePath,
            payload.referenceImagePaths ?? prev.referenceImagePaths,
          ),
          { module: 'tiktok-listing', ownerId, assetPrefix: 'reference-image' },
        )
        const next: TiktokListingItem = {
          ...prev,
          ...payload,
          sourceImagePath,
          referenceImagePaths: referenceImages.paths,
          analysisBoardImage: payload.analysisBoardImage ?? prev.analysisBoardImage,
          listingImages: payload.listingImages ?? prev.listingImages ?? [],
          updatedAt: ts,
        }
        db.items[idx] = normalizeItem(next)
        await writeJsonFile(dbPath(), db)
        return normalizeItem(next)
      }
    }

    const id = randomUUID()
    const sourceImagePath = await materializeManagedAsset({
      sourcePath: payload.sourceImagePath,
      module: 'tiktok-listing',
      ownerId: id,
      assetId: 'source-image',
    })
    const referenceImages = await materializeManagedAssets(
      remapSourceReferencePaths(payload.sourceImagePath, sourceImagePath, payload.referenceImagePaths),
      { module: 'tiktok-listing', ownerId: id, assetPrefix: 'reference-image' },
    )
    const created: TiktokListingItem = {
      id,
      sourceImagePath,
      referenceImagePaths: referenceImages.paths,
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

  async migrateExternalAssets(): Promise<{ migrated: number }> {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    let migrated = 0
    for (let index = 0; index < db.items.length; index += 1) {
      const current = normalizeItem(db.items[index])
      const sourceImagePath = await materializeManagedAsset({
        sourcePath: current.sourceImagePath,
        module: 'tiktok-listing',
        ownerId: current.id,
        assetId: 'source-image',
      })
      const referenceImages = await materializeManagedAssets(
        remapSourceReferencePaths(current.sourceImagePath, sourceImagePath, current.referenceImagePaths),
        { module: 'tiktok-listing', ownerId: current.id, assetPrefix: 'reference-image' },
      )
      const next = normalizeItem({
        ...current,
        sourceImagePath,
        referenceImagePaths: referenceImages.paths,
      })
      if (JSON.stringify(next) === JSON.stringify(current)) continue
      db.items[index] = next
      migrated += 1
    }
    if (migrated) await writeJsonFile(dbPath(), db)
    return { migrated }
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
