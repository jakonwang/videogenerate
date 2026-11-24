import type { PcTotals, PcVerdict } from './productCards'
import type { SiRisk } from './sellerInventory'

/** 款号看板：一个款号在各店的销量、漏斗、库存，以及爆款类型建议。 */

/** 爆款类型：表格里怎么写就怎么存，这几个是常用的 */
export const HOT_TYPES = ['大爆款', '畅销款', '潜力款', '清仓款'] as const

export type CodeShopStats = { shopKey: string; shopName: string; listed: boolean; stock?: number; units7: number; units30: number; amount30: number }

export type CodeStats = {
  code: string
  name: string
  image?: string
  units7: number
  unitsPrev7: number
  units30: number
  amount7: number
  amount30: number
  /** 近 30 天有出单的天数 */
  activeDays30: number
  /** 近 30 天销量占全部款的比例 */
  share30: number
  /** 近 30 天销量名次，从 1 开始；没出单为空 */
  rank30?: number
  stock?: number
  daysLeft?: number
  suggestQty: number
  risk: SiRisk
  cost?: number
  shops: CodeShopStats[]
  verdict?: PcVerdict
  /** 系统建议，人工填的优先 */
  suggestion?: string
  reason?: string
}

export type CodeStatsDetail = CodeStats & {
  currency: string
  daily: Array<{ date: string; units: number; amount: number }>
  /** 近 30 天商品卡漏斗（只含单独成款的链接） */
  funnel?: PcTotals
  /** 近 30 天毛利：扣平台费和成本，未扣广告 */
  profit30?: number
  feeRate?: number
}

export type CodeGap = { code: string; name: string; image?: string; units30: number; soldIn: string; missingIn: string; stock?: number; suggestion?: string }

export type CodeStatsOverview = { items: CodeStats[]; gaps: CodeGap[]; shops: Array<{ shopKey: string; name: string }>; currency: string; lastSyncAt?: number }

/**
 * 爆款类型建议，只看最近 30 天真实销量：
 * 大爆款 = 占全部销量 3% 以上、至少 300 件、20 天以上有出单；
 * 畅销款 = 占 0.3% 以上、至少 50 件、15 天以上有出单；
 * 潜力款 = 还没卖起来，但商品卡转化好于店铺均值，或近 7 天明显上涨。
 */
export function suggestHotType(input: { units30: number; units7: number; unitsPrev7: number; activeDays30: number; share30: number; verdict?: PcVerdict }): { suggestion?: string; reason?: string } {
  const percent = `${(input.share30 * 100).toFixed(input.share30 >= 0.1 ? 0 : 1)}%`
  if (input.units30 >= 300 && input.share30 >= 0.03 && input.activeDays30 >= 20) return { suggestion: '大爆款', reason: `近 30 天卖 ${input.units30} 件，占全店 ${percent}` }
  if (input.units30 >= 50 && input.share30 >= 0.003 && input.activeDays30 >= 15) return { suggestion: '畅销款', reason: `近 30 天卖 ${input.units30} 件，${input.activeDays30} 天有出单` }
  if (input.verdict === 'winner' || input.verdict === 'potential') return { suggestion: '潜力款', reason: '商品卡转化好于店铺平均' }
  if (input.units7 >= 10 && input.units7 >= input.unitsPrev7 * 1.5) return { suggestion: '潜力款', reason: `近 7 天 ${input.units7} 件，上周 ${input.unitsPrev7} 件` }
  return {}
}

export type CodeImportPreview = {
  token: string
  fileName: string
  sheets: string[]
  total: number
  create: number
  update: number
  /** 预留的空号，不导入 */
  reserved: number
  withImage: number
  inShop: number
  hotTypes: Array<{ name: string; count: number }>
  skipped: Array<{ sheet: string; row: number; value: string }>
  skippedCount: number
}

/** 同款多个链接的判断取最好的一个 */
const VERDICT_ORDER: PcVerdict[] = ['winner', 'potential', 'steady', 'leaky', 'weak', 'testing']
export function bestVerdict(list: PcVerdict[]): PcVerdict | undefined {
  return VERDICT_ORDER.find((item) => list.includes(item))
}
