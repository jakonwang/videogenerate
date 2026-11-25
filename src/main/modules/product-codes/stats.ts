import { compareCodes, isValidProductCode, normalizeProductCode } from '../../../shared/productCode'
import { bestVerdict, suggestHotType, type CodeGap, type CodeStats, type CodeStatsDetail, type CodeStatsOverview } from '../../../shared/productCodeStats'
import { addTotals, emptyTotals, type PcProduct, type PcTotals } from '../../../shared/productCards'
import { shiftDate, type SiDashboard } from '../../../shared/sellerInventory'
import { matchSkuCodes, type StoreData } from './service'

/** 跨店补位：近 30 天至少卖这么多件才值得提醒 */
const GAP_MIN_UNITS = 20

export type StatsInput = {
  store: StoreData
  known: ReadonlySet<string>
  /** 按款号归好的看板：全部店 + 每家店 */
  all: SiDashboard
  byShop: Map<string, SiDashboard>
  cards: PcProduct[]
  currency: string
}

/** 每个款号一行，卖得多的在前 */
export function buildCodeStats(input: StatsInput): CodeStatsOverview {
  const { all } = input
  const shops = [...input.byShop.keys()].map((shopKey) => ({ shopKey, name: input.store.shopNames.get(shopKey) || shopKey }))
  const skuCodes = matchSkuCodes(input.store, input.known)
  const listed = new Map<string, Set<string>>()
  const codesByProduct = new Map<string, Set<string>>()
  for (const sku of input.store.skus) {
    const code = skuCodes.get(sku.id)
    if (!code) continue
    listed.set(code, (listed.get(code) || new Set()).add(sku.shopKey))
    const key = `${sku.shopKey}:${sku.productId}`
    codesByProduct.set(key, (codesByProduct.get(key) || new Set()).add(code))
  }
  const verdicts = new Map<string, NonNullable<CodeStats['verdict']>[]>()
  for (const card of input.cards) {
    const codes = codesByProduct.get(card.key)
    if (!codes || codes.size !== 1) continue
    const [code] = codes
    verdicts.set(code, [...(verdicts.get(code) || []), card.verdict])
  }
  const d30 = shiftDate(all.today, -30)
  const perShop = new Map([...input.byShop].map(([shopKey, board]) => [shopKey, new Map(board.items.map((item) => [item.key, item]))]))
  const total30 = all.items.reduce((sum, item) => sum + item.units30, 0)
  const items = all.items
    .filter((item) => item.mapped && isValidProductCode(item.key))
    .map((item): CodeStats => {
      const activeDays30 = Object.entries(all.matrix[item.key] || {}).filter(([date, cell]) => date >= d30 && date < all.today && cell.units > 0).length
      const share30 = total30 ? item.units30 / total30 : 0
      const verdict = bestVerdict(verdicts.get(item.key) || [])
      return {
        code: item.key,
        name: item.name,
        image: item.image,
        units7: item.units7,
        unitsPrev7: item.unitsPrev7,
        units30: item.units30,
        amount7: item.amount7,
        amount30: item.amount30,
        activeDays30,
        share30,
        stock: item.stock,
        daysLeft: item.daysLeft,
        suggestQty: item.suggestQty,
        risk: item.risk,
        cost: item.cost,
        shops: shops.map((shop) => {
          const own = perShop.get(shop.shopKey)?.get(item.key)
          return { shopKey: shop.shopKey, shopName: shop.name, listed: listed.get(item.key)?.has(shop.shopKey) || false, stock: own && own.stockSource !== 'none' ? own.platformStock : undefined, units7: own?.units7 || 0, units30: own?.units30 || 0, amount30: own?.amount30 || 0 }
        }),
        verdict,
        ...suggestHotType({ units30: item.units30, units7: item.units7, unitsPrev7: item.unitsPrev7, activeDays30, share30, verdict }),
      }
    })
    .sort((a, b) => b.units30 - a.units30 || compareCodes(a.code, b.code))
  items.forEach((item, index) => { if (item.units30 > 0) item.rank30 = index + 1 })

  const gaps: CodeGap[] = []
  for (const item of items) {
    if (item.units30 < GAP_MIN_UNITS) continue
    const missing = item.shops.filter((shop) => !shop.listed)
    const sold = item.shops.filter((shop) => shop.units30 > 0)
    if (!missing.length || !sold.length) continue
    gaps.push({ code: item.code, name: item.name, image: item.image, units30: item.units30, soldIn: sold.map((shop) => shop.shopName).join('、'), missingIn: missing.map((shop) => shop.shopName).join('、'), stock: item.stock, suggestion: item.suggestion })
  }
  return { items, gaps, shops, currency: input.currency, lastSyncAt: all.lastSyncAt }
}

/** 款号 → 商品卡漏斗（只含单独成款的链接） */
export function codeCards(input: Pick<StatsInput, 'store' | 'known' | 'cards'>): Map<string, PcTotals> {
  const skuCodes = matchSkuCodes(input.store, input.known)
  const byProduct = new Map<string, Set<string>>()
  for (const sku of input.store.skus) {
    const key = `${sku.shopKey}:${sku.productId}`
    byProduct.set(key, (byProduct.get(key) || new Set()).add(skuCodes.get(sku.id) || `#${sku.id}`))
  }
  const out = new Map<string, PcTotals>()
  for (const card of input.cards) {
    const codes = byProduct.get(card.key)
    if (!codes || codes.size !== 1) continue
    const [code] = codes
    out.set(code, addTotals(out.get(code) || emptyTotals(), card.totals))
  }
  return out
}

export function buildCodeDetail(input: StatsInput & { code: string; feeRates: Map<string, number> }): CodeStatsDetail | null {
  const code = normalizeProductCode(input.code)
  const stats = buildCodeStats(input).items.find((item) => item.code === code)
  if (!stats) return null
  const skuCodes = matchSkuCodes(input.store, input.known)
  const codesByProduct = new Map<string, Set<string>>()
  for (const sku of input.store.skus) {
    const key = `${sku.shopKey}:${sku.productId}`
    codesByProduct.set(key, (codesByProduct.get(key) || new Set()).add(skuCodes.get(sku.id) || `#${sku.id}`))
  }
  const own = input.cards.filter((card) => {
    const codes = codesByProduct.get(card.key)
    return codes?.size === 1 && codes.has(code)
  })
  const funnel = own.length ? own.reduce((sum, card) => addTotals(sum, card.totals), emptyTotals()) : undefined
  // 平台费率按各店 30 天销售额加权；有店没学到费率就不算毛利
  let fee = 0
  let covered = 0
  for (const shop of stats.shops) {
    const rate = input.feeRates.get(shop.shopKey)
    if (rate === undefined || !shop.amount30) continue
    fee += rate * shop.amount30
    covered += shop.amount30
  }
  const soldAmount = stats.shops.reduce((sum, shop) => sum + shop.amount30, 0)
  const feeRate = covered > 0 && covered >= soldAmount * 0.95 ? fee / covered : undefined
  return {
    ...stats,
    currency: input.currency,
    daily: input.all.dates.map((date) => ({ date, units: input.all.matrix[code]?.[date]?.units || 0, amount: input.all.matrix[code]?.[date]?.amount || 0 })),
    funnel,
    feeRate,
    profit30: feeRate !== undefined && stats.cost !== undefined ? stats.amount30 * (1 - feeRate) - stats.cost * stats.units30 : undefined,
  }
}
