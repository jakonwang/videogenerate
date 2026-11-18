import { emptySyncBrand, type SyncBrand, type SyncProductMemory } from '../../../shared/cloud/sync'

/**
 * 品牌记忆在电脑和网页 / 手机之间双向同步（全账号一条记录）。
 * 电脑端的 brand-memory.json 仍是 AI 制片人读取的地方；这里只负责把两边对齐。
 */

export type ProductMemoryLocal = SyncProductMemory & { updatedAt: number }

export type BrandStore = {
  read: () => Promise<SyncBrand & { updatedAt: number }>
  save: (brand: SyncBrand) => Promise<{ updatedAt: number }>
  /** 商品记忆（本地商品 id → 记忆）；没有时不同步商品记忆 */
  readProducts?: () => Promise<Record<string, ProductMemoryLocal>>
  saveProduct?: (localProductId: string, memory: SyncProductMemory) => Promise<{ updatedAt: number }>
}

export type BrandLink = { cloudUpdatedAt: number; localUpdatedAt: number }

export const defaultBrandStore = async (): Promise<BrandStore> => {
  const { brandMemoryStore } = await import('../content-hub/stores')
  return {
    read: async () => {
      const brand = (await brandMemoryStore.read()).brand
      return { ...toSyncBrand(brand), updatedAt: Number(brand.updatedAt) || 0 }
    },
    save: async (brand) => ({ updatedAt: Number((await brandMemoryStore.saveBrand(brand)).updatedAt) || Date.now() }),
    readProducts: async () => {
      const products = (await brandMemoryStore.read()).products
      return Object.fromEntries(Object.entries(products).map(([id, m]) => [id, { sellingPoints: m.sellingPoints || '', audience: m.audience || '', avoid: m.avoid || '', notes: m.notes || '', updatedAt: Number(m.updatedAt) || 0 }]))
    },
    saveProduct: async (productId, memory) => ({ updatedAt: Number((await brandMemoryStore.saveProduct({ productId, ...memory })).updatedAt) || Date.now() }),
  }
}

export function toSyncBrand(input: Partial<SyncBrand> | null | undefined): SyncBrand {
  const base = emptySyncBrand()
  if (!input) return base
  const text = (value: unknown) => String(value ?? '')
  return {
    brandName: text(input.brandName ?? base.brandName),
    tone: text(input.tone ?? base.tone),
    audience: text(input.audience ?? base.audience),
    bannedWords: Array.isArray(input.bannedWords) ? input.bannedWords.map(String).filter(Boolean) : [],
    subtitleStyle: text(input.subtitleStyle ?? base.subtitleStyle),
    watermarkText: text(input.watermarkText ?? base.watermarkText),
    notes: text(input.notes ?? base.notes),
  }
}

/**
 * Decides which side wins. Returns 'pull' when the cloud copy changed since we last aligned and is not older
 * than a local edit, 'push' when only (or more recently) the local copy changed, otherwise 'none'.
 */
export function brandDirection(link: BrandLink, local: { updatedAt: number }, remote: { updatedAt: number } | null): 'pull' | 'push' | 'none' {
  const remoteChanged = Boolean(remote && remote.updatedAt > link.cloudUpdatedAt)
  const localChanged = local.updatedAt > link.localUpdatedAt
  if (remoteChanged && (!localChanged || remote!.updatedAt >= local.updatedAt)) return 'pull'
  if (localChanged) return 'push'
  return 'none'
}
