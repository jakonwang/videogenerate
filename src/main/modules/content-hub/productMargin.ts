import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { calculateGmvMaxConfiguredProductProfitGuard } from '../tiktok-gmv-max/profit'
import type { GmvMaxProductCost, GmvMaxStoreCost } from '../tiktok-gmv-max/types'

/**
 * 利润视角：用 GMV MAX 里填的商品成本 / 店铺默认成本，算每个 TikTok 商品卖一单能剩下几成（贡献毛利率）。
 * 素材利润 = 成交额 × 毛利率 − 广告花费。没填成本的商品不算利润（返回里没有它），界面显示「未填成本」。
 * 毛利率已经扣掉采购、头程尾程、仓储、平台和达人佣金、退货损失。
 */

export type ProductMargin = { marginRate: number; breakEvenRoi: number }

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

export function computeProductMargins(input: { productIds: string[]; productCosts: GmvMaxProductCost[]; storeCosts: GmvMaxStoreCost[] }): Map<string, ProductMargin> {
  const out = new Map<string, ProductMargin>()
  for (const productId of new Set(input.productIds.map((id) => String(id || '').trim()).filter(Boolean))) {
    // 店铺通用的成本优先于某个计划专用的
    const candidates = input.productCosts.filter((item) => item.productId === productId)
    const product = candidates.find((item) => !item.campaignId) || candidates[0]
    if (!product) continue
    const storeCost = input.storeCosts.find((item) => item.storeId === product.storeId)
    const guard = calculateGmvMaxConfiguredProductProfitGuard({ product, storeCost, minRoi: '0', safetyMarginPercent: 0 })
    const marginRate = Number(guard.contributionMarginRate)
    const breakEvenRoi = Number(guard.breakEvenRoi)
    if (guard.complete && marginRate > 0 && breakEvenRoi > 0) out.set(productId, { marginRate, breakEvenRoi })
  }
  return out
}

export function readProductMargins(productIds: string[]): Map<string, ProductMargin> {
  if (!productIds.length) return new Map()
  return computeProductMargins({
    productIds,
    productCosts: safely(() => gmvMaxRepo.listProductCosts(), [] as GmvMaxProductCost[]),
    storeCosts: safely(() => gmvMaxRepo.listStoreCosts(), [] as GmvMaxStoreCost[]),
  })
}

export function profitOf(input: { revenue: number; spend: number; marginRate: number }) {
  return Math.round((input.revenue * input.marginRate - input.spend) * 100) / 100
}

/** 一组素材共用一个毛利率时（同一商品），按成交额加权；有商品没填成本就返回 null。 */
export function blendedMargin(rows: Array<{ productId: string; revenue: number }>, margins: Map<string, ProductMargin>): number | null {
  let revenue = 0
  let weighted = 0
  for (const row of rows) {
    const margin = margins.get(row.productId)
    if (!margin) return null
    revenue += row.revenue
    weighted += row.revenue * margin.marginRate
  }
  if (revenue > 0) return weighted / revenue
  const first = rows[0] && margins.get(rows[0].productId)
  return first ? first.marginRate : null
}
