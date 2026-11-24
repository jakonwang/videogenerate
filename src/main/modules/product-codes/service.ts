import { join } from 'node:path'
import {
  codePrefixes,
  compareCodes,
  isValidProductCode,
  matchStoreSku,
  nextCodes,
  normalizeProductCode,
  type ProductCodeLink,
  type ProductCodeOverview,
} from '../../../shared/productCode'
import type { SiPlatformSku } from '../../../shared/sellerInventory'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { CodeStatsDetail, CodeStatsOverview } from '../../../shared/productCodeStats'
import { buildCodeDetail, buildCodeStats, type StatsInput } from './stats'
import { productsRepo } from '../products/repo'

export type StoreData = { skus: SiPlatformSku[]; mappings: Map<string, string>; shopNames: Map<string, string> }

type StatsSource = Pick<StatsInput, 'all' | 'byShop' | 'cards' | 'currency'> & { feeRates: Map<string, number> }

type Deps = {
  store: () => Promise<StoreData>
  /** 按 SKU → 款号归好的销量、商品卡漏斗和平台费率 */
  stats: (skuCodes: Map<string, string>) => Promise<StatsSource>
  dataVersion: () => Promise<number>
  researchCodes: () => Promise<string[]>
}

const defaultDeps: Deps = {
  async store() {
    const { sellerInventoryRepo } = await import('../seller-inventory/repo')
    const { sellerInventoryService } = await import('../seller-inventory/service')
    return {
      skus: sellerInventoryRepo.listPlatformSkus(),
      mappings: sellerInventoryRepo.listMappings(),
      shopNames: new Map(sellerInventoryService.listShops().map((shop) => [shop.shopKey, shop.name])),
    }
  },
  async stats(skuCodes) {
    const { sellerInventoryService } = await import('../seller-inventory/service')
    const shops = sellerInventoryService.listShops()
    const feeRates = new Map<string, number>()
    for (const shop of shops) {
      const rate = sellerInventoryService.getShopProfit({ shopKey: shop.shopKey, days: 30 }).feeRate
      if (rate !== undefined) feeRates.set(shop.shopKey, rate)
    }
    const currencies = new Set(shops.map((shop) => REGION_CURRENCY[shop.region.toUpperCase()] || ''))
    return { ...sellerInventoryService.getCodeDashboards(skuCodes), cards: sellerInventoryService.getProductCards({ days: 30 }).products, currency: currencies.size === 1 ? [...currencies][0] : '', feeRates }
  },
  async dataVersion() {
    return (await import('../seller-inventory/repo')).sellerInventoryRepo.version()
  },
  async researchCodes() {
    const { productResearchService } = await import('../product-research/service')
    return productResearchService.listCodes()
  },
}
const REGION_CURRENCY: Record<string, string> = { VN: 'VND', TH: 'THB', MY: 'MYR', PH: 'PHP', ID: 'IDR', SG: 'SGD', US: 'USD', GB: 'GBP' }
let deps: Deps = defaultDeps
export function setProductCodesTestDependencies(next?: Partial<Deps>) {
  deps = { ...defaultDeps, ...next }
}

/** 曾经用过的款号：商品删了号也不再发给别的款 */
const historyPath = () => join(getAppPaths().dbDir, 'product-codes.json')
async function readHistory() {
  const data = await readJsonFile<{ used: string[] }>(historyPath(), { used: [] })
  return Array.isArray(data.used) ? data.used : []
}
async function remember(codes: string[]) {
  const before = await readHistory()
  const next = [...new Set([...before, ...codes])]
  if (next.length !== before.length) await writeJsonFile(historyPath(), { used: next.sort(compareCodes) })
}

async function safeStore(): Promise<StoreData> {
  try {
    return await deps.store()
  } catch {
    return { skus: [], mappings: new Map(), shopNames: new Map() }
  }
}

async function safeResearchCodes() {
  try {
    return (await deps.researchCodes()).map(normalizeProductCode).filter(Boolean)
  } catch {
    return []
  }
}

type Matched = { links: Map<string, ProductCodeLink[]>; conflicts: ProductCodeOverview['conflicts']; unmatched: ProductCodeOverview['unmatched']; products: number; matched: number }

/** 店铺每个规格 → 款号 */
export function matchSkuCodes(store: StoreData, known: ReadonlySet<string>): Map<string, string> {
  const sizes = new Map<string, number>()
  for (const sku of store.skus) sizes.set(`${sku.shopKey}:${sku.productId}`, (sizes.get(`${sku.shopKey}:${sku.productId}`) || 0) + 1)
  const out = new Map(store.mappings)
  for (const sku of store.skus) {
    const { code } = matchStoreSku({ title: sku.productName, sellerSku: sku.sellerSku, singleSku: sizes.get(`${sku.shopKey}:${sku.productId}`) === 1, manual: store.mappings.get(sku.id), known })
    if (code) out.set(sku.id, code)
  }
  return out
}

export function matchStore(store: StoreData, known: ReadonlySet<string>): Matched {
  const byProduct = new Map<string, SiPlatformSku[]>()
  for (const sku of store.skus) {
    const key = `${sku.shopKey}:${sku.productId}`
    byProduct.set(key, [...(byProduct.get(key) || []), sku])
  }
  const links = new Map<string, ProductCodeLink[]>()
  const conflicts: Matched['conflicts'] = []
  const unmatched: Matched['unmatched'] = []
  let matched = 0
  for (const skus of byProduct.values()) {
    const first = skus[0]
    const shopName = store.shopNames.get(first.shopKey) || first.shopKey
    const own = new Map<string, ProductCodeLink>()
    let conflict = false
    for (const sku of skus) {
      const hit = matchStoreSku({ title: sku.productName, sellerSku: sku.sellerSku, singleSku: skus.length === 1, manual: store.mappings.get(sku.id), known })
      if (hit.conflict && !conflict) {
        conflict = true
        conflicts.push({ shopName, productId: sku.productId, title: sku.productName, titleCode: hit.conflict.title, sellerSku: hit.conflict.sellerSku, image: sku.image })
      }
      if (!hit.code || !hit.via) continue
      const link = own.get(hit.code)
      if (link) {
        link.skuCount += 1
        link.stock += Math.max(0, sku.stockAvailable)
      } else {
        own.set(hit.code, { shopKey: sku.shopKey, shopName, productId: sku.productId, title: sku.productName, image: sku.image, skuCount: 1, shared: false, price: sku.price, stock: Math.max(0, sku.stockAvailable), via: hit.via })
      }
    }
    if (!own.size) {
      unmatched.push({ shopName, productId: first.productId, title: first.productName, image: first.image })
      continue
    }
    matched += 1
    for (const [code, link] of own) {
      link.shared = own.size > 1
      links.set(code, [...(links.get(code) || []), link])
    }
  }
  return { links, conflicts, unmatched, products: byProduct.size, matched }
}

async function libraryCodes() {
  return (await productsRepo.list()).map((item) => normalizeProductCode(item.code)).filter(Boolean)
}

async function load() {
  const [products, store, research] = await Promise.all([productsRepo.list(), safeStore(), safeResearchCodes()])
  const library = products.map((item) => normalizeProductCode(item.code)).filter(Boolean)
  return { products, store, research, library, match: matchStore(store, new Set([...library, ...research])) }
}

let statsCache: { key: string; at: number; input: StatsInput & { feeRates: Map<string, number> } } | null = null
async function statsInput() {
  const { store, library, research } = await load()
  const known = new Set([...library, ...research])
  const key = `${await deps.dataVersion()}|${[...known].sort().join(',')}`
  // 数据没变就复用；一分钟后重算，跨天也不会用旧的
  if (statsCache?.key === key && Date.now() - statsCache.at < 60_000) return statsCache.input
  const input = { store, known, ...(await deps.stats(matchSkuCodes(store, known))) }
  statsCache = { key, at: Date.now(), input }
  return input
}

export const productCodesService = {
  /** 款号看板：每个款的销量、库存、爆款建议，以及跨店补位 */
  async stats(): Promise<CodeStatsOverview> {
    return buildCodeStats(await statsInput())
  },

  async detail(code: string): Promise<CodeStatsDetail | null> {
    return buildCodeDetail({ ...(await statsInput()), code })
  },

  /** 店铺商品和已知款号，给直播数据归款用 */
  async matchContext() {
    const { store, library, research } = await load()
    return { store, known: new Set([...library, ...research]) as ReadonlySet<string> }
  },

  /** 款号 → 店铺标题（判断商品类型用） */
  async storeTitles(): Promise<{ titles: Map<string, string> }> {
    const { match } = await load()
    return { titles: new Map([...match.links].map(([code, list]) => [code, list[0]?.title || ''])) }
  },

  async overview(): Promise<ProductCodeOverview> {
    const { products, research, library, match } = await load()
    const used = [...new Set([...library, ...research, ...match.links.keys(), ...(await readHistory())])].sort(compareCodes)
    const owners = new Map<string, Array<{ id: string; name: string }>>()
    for (const item of products) {
      const code = normalizeProductCode(item.code)
      if (code) owners.set(code, [...(owners.get(code) || []), { id: item.id, name: item.name }])
    }
    const candidates = products.filter((item) => !normalizeProductCode(item.code) && isValidProductCode(item.name))
    const nameCount = new Map<string, number>()
    for (const item of candidates) {
      const code = normalizeProductCode(item.name)
      nameCount.set(code, (nameCount.get(code) || 0) + 1)
    }
    return {
      used,
      prefixes: codePrefixes(used),
      suggestions: candidates.map((item) => {
        const code = normalizeProductCode(item.name)
        return { productId: item.id, name: item.name, code, duplicate: owners.has(code) || (nameCount.get(code) || 0) > 1 }
      }),
      duplicates: [...owners].filter(([, list]) => list.length > 1).map(([code, list]) => ({ code, products: list })),
      conflicts: match.conflicts,
      unmatched: match.unmatched,
      notListed: [...owners.keys()].filter((code) => !match.links.has(code)).sort(compareCodes),
      storeProducts: match.products,
      matchedProducts: match.matched,
    }
  },

  /** 一个款号在各店铺的商品 */
  async links(code: string): Promise<ProductCodeLink[]> {
    const key = normalizeProductCode(code)
    if (!key) return []
    return (await load()).match.links.get(key) || []
  },

  /** 全部款号 → 店铺商品 ID（跨店合并），给广告、达人数据用；只含单独成款的商品，避免混入别的款 */
  async storeProductIds(): Promise<Map<string, string[]>> {
    const { match } = await load()
    return new Map([...match.links].map(([code, list]) => [code, [...new Set(list.filter((item) => !item.shared).map((item) => item.productId))]]))
  },

  async next(input: { start: string; count?: number; reserved?: string[] }): Promise<string[]> {
    const { research, library, match } = await load()
    const count = Math.min(500, Math.max(1, Math.trunc(Number(input.count) || 1)))
    return nextCodes(input.start, count, [...library, ...research, ...match.links.keys(), ...(await readHistory()), ...(input.reserved || [])])
  },

  /** 保存前检查：格式不对或被别的商品用了就报错，返回统一写法；空表示清除款号 */
  async prepare(code: unknown, productId?: string): Promise<string> {
    const next = normalizeProductCode(code)
    if (!next) return ''
    const products = await productsRepo.list()
    const current = products.find((item) => item.id === productId)
    if (current && normalizeProductCode(current.code) === next) return next
    if (!isValidProductCode(next)) throw new Error('PRODUCT_CODE_INVALID')
    const owner = products.find((item) => item.id !== productId && normalizeProductCode(item.code) === next)
    if (owner) throw new Error(`PRODUCT_CODE_TAKEN:${owner.name}`)
    return next
  },

  async remember(codes: string[]) {
    await remember(codes.map(normalizeProductCode).filter(Boolean))
  },

  /** 一键把「名称就是款号」的旧商品补上款号；重复的跳过，由人决定 */
  async applySuggestions(): Promise<{ applied: number; skipped: number }> {
    const { suggestions } = await this.overview()
    const ready = suggestions.filter((item) => !item.duplicate)
    const products = await productsRepo.list()
    for (const item of ready) {
      const product = products.find((entry) => entry.id === item.productId)
      if (product) await productsRepo.upsert({ id: product.id, name: product.name, type: product.type, code: item.code })
    }
    await remember([...(await libraryCodes())])
    return { applied: ready.length, skipped: suggestions.length - ready.length }
  },
}
