/**
 * Shop profit per day (by order date):
 *   payout  = GMV × (1 − platform fee rate)      fee rate learned from the shop's own settlements
 *   profit  = payout − product cost − ad spend   cost from SKU cost prices, ad spend from GMV Max
 * Everything here is an estimate until orders settle; the page says so.
 */
import { dateRange, type SiShopDay } from './sellerInventory'

export type SiSettlement = {
  /** statement_detail_id */
  id: string
  shopKey: string
  orderId: string
  placedAt: number
  placedDate: string
  settledAt?: number
  status: 'pending' | 'settled'
  /** 1 = order, 2 = adjustment */
  tradeType: number
  revenue: number
  /** Negative: platform commission, transaction and affiliate fees. */
  fees: number
  settlement: number
  shipping: number
}

export type ShopAdLink = {
  shopKey: string
  storeId: string
  /** 1 unit of the ad account currency in shop currency (1 when both are the same). */
  rate: number
  adCurrency?: string
  updatedAt: number
}

export type GmvStoreOption = { storeId: string; storeName: string; advertiserId: string; advertiserName: string; currency?: string; suggested?: boolean }

export type ProfitDay = {
  date: string
  gmv: number
  payout: number
  fees: number
  cogs: number
  adSpend: number
  profit: number
  units: number
  costedUnits: number
}

export type ProfitTotals = Omit<ProfitDay, 'date'> & { margin?: number; costCoverage?: number }

export type ShopProfit = {
  shopKey: string
  start: string
  end: string
  feeRate?: number
  feeSample: number
  days: ProfitDay[]
  totals: ProfitTotals
  previousTotals: ProfitTotals
  missingCost: Array<{ code: string; name: string; units: number; amount: number }>
  adLink?: ShopAdLink
  adStores: GmvStoreOption[]
  pending: { count: number; settlement: number }
  settledRecent: { count: number; settlement: number; since?: string }
}

/** Fee rate = fees / revenue over orders with revenue; null when there are too few to trust. */
export function learnFeeRate(records: SiSettlement[], minRecords = 20) {
  const orders = records.filter((record) => record.tradeType === 1 && record.revenue > 0)
  if (orders.length < minRecords) return { rate: undefined, sample: orders.length }
  const revenue = orders.reduce((total, record) => total + record.revenue, 0)
  const fees = orders.reduce((total, record) => total + Math.abs(Math.min(0, record.fees)), 0)
  return { rate: revenue > 0 ? fees / revenue : undefined, sample: orders.length }
}

export function profitTotals(days: ProfitDay[]): ProfitTotals {
  const totals: ProfitTotals = { gmv: 0, payout: 0, fees: 0, cogs: 0, adSpend: 0, profit: 0, units: 0, costedUnits: 0 }
  for (const day of days) {
    totals.gmv += day.gmv
    totals.payout += day.payout
    totals.fees += day.fees
    totals.cogs += day.cogs
    totals.adSpend += day.adSpend
    totals.profit += day.profit
    totals.units += day.units
    totals.costedUnits += day.costedUnits
  }
  totals.margin = totals.gmv > 0 ? totals.profit / totals.gmv : undefined
  totals.costCoverage = totals.units > 0 ? totals.costedUnits / totals.units : undefined
  return totals
}

/**
 * Builds daily profit. `unitsByCode` is the shop's units per unified code per date; codes without
 * a cost price add nothing to cost and lower the coverage figure instead of guessing.
 */
export function buildProfitDays(input: {
  start: string
  end: string
  shopDays: SiShopDay[]
  unitsByCode: Map<string, Map<string, number>>
  costs: Map<string, number>
  adSpend: Map<string, number>
  adRate: number
  feeRate?: number
}): ProfitDay[] {
  const byDate = new Map(input.shopDays.map((day) => [day.date, day]))
  return dateRange(input.start, input.end).map((date) => {
    const gmv = byDate.get(date)?.gmv || 0
    let units = 0
    let costedUnits = 0
    let cogs = 0
    for (const [code, perDate] of input.unitsByCode) {
      const count = perDate.get(date) || 0
      if (!count) continue
      units += count
      const cost = input.costs.get(code)
      if (cost !== undefined) {
        costedUnits += count
        cogs += count * cost
      }
    }
    const fees = input.feeRate === undefined ? 0 : gmv * input.feeRate
    const payout = gmv - fees
    const adSpend = (input.adSpend.get(date) || 0) * input.adRate
    return { date, gmv, payout, fees, cogs, adSpend, profit: payout - cogs - adSpend, units, costedUnits }
  })
}
