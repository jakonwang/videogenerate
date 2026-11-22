/** 发布中心利润报表（主进程算，界面显示）。金额是广告账户币种。 */
export type TaskProfit = { creativeId: string; creativeName: string; spend: number; revenue: number; orders: number; roi: number; profit?: number }

export type AccountProfit = {
  uid: string
  name: string
  published: number
  matched: number
  spend: number
  revenue: number
  orders: number
  roi: number
  /** 只有所有对上的素材都有成本时才有 */
  profit?: number
  /** 对上了但商品没填成本的条数 */
  missingCost: number
}

export type PublishProfitReport = { windowDays: number; byTask: Record<string, TaskProfit>; byAccount: AccountProfit[] }

/** 利润的显示：+12.3 / -5.0；没有成本时显示「未填成本」 */
export function formatProfit(value?: number) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '未填成本'
  const text = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Math.abs(value))
  return value < 0 ? `-${text}` : `+${text}`
}
