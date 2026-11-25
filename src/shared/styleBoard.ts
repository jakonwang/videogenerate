import type { CodeGap, CodeStats } from './productCodeStats'
import { ratesOf, type PcRates, type PcTotals, type PcVerdict } from './productCards'
import type { LiveCodeTotals } from './liveAccounts'

/**
 * 款号闭环：把一个款在店铺、商品卡、直播、广告里的数据放在一起，给出下一步该做什么。
 * 全部是确定的规则，每条都带依据的数字；样本不够就不下结论。
 */

export type StyleAds = { spend: number; revenue: number; orders: number; creatives: number }

export const STYLE_ACTIONS = ['restock', 'cutAds', 'makeVideo', 'livePush', 'fixPrice', 'fixDetail', 'gap'] as const
export type StyleActionKind = (typeof STYLE_ACTIONS)[number]
export type StyleAction = { kind: StyleActionKind; reason: string; params: Record<string, number | string> }

export type StyleRow = {
  code: string
  name: string
  image?: string
  units7: number
  unitsPrev7: number
  units30: number
  amount30: number
  price?: number
  cost?: number
  stock?: number
  daysLeft?: number
  suggestQty: number
  risk: CodeStats['risk']
  verdict?: PcVerdict
  hotType?: string
  suggestion?: string
  /** 商品库里的档案 */
  productId?: string
  card?: PcTotals
  cardRates?: PcRates
  live?: Pick<LiveCodeTotals, 'sessions' | 'exposures' | 'clicks' | 'carts' | 'orders' | 'measuredOrders' | 'measuredGmv' | 'sales' | 'gmv' | 'estimated'>
  ads?: StyleAds
  missingIn?: string
  actions: StyleAction[]
}

export type StyleBaseline = { liveCtr?: number; liveCartRate?: number; liveCartToOrder?: number; liveCvr?: number; liveGpm?: number; liveExposures?: number; adsRoi?: number; adsSpend?: number }

export type StyleBoard = { items: StyleRow[]; counts: Record<StyleActionKind, number>; baseline: StyleBaseline; currency: string; days: number; lastSyncAt?: number; notArchived: number }

export type StyleBoardInput = {
  stats: CodeStats[]
  gaps: CodeGap[]
  currency: string
  lastSyncAt?: number
  cards: Map<string, PcTotals>
  live: LiveCodeTotals[]
  ads: Map<string, StyleAds>
  library: Map<string, { id: string; hotType?: string }>
}

const per = (part: number, whole: number) => (whole > 0 ? part / whole : undefined)
const EMPTY_OUT = new Set<CodeStats['risk']>(['out', 'urgent'])

export const STYLE_RULES = {
  restockUnits: 10,
  liveClicks: 50,
  liveOrders: 5,
  judgeClicks: 200,
  judgeCarts: 20,
  good: 1.3,
  bad: 0.6,
  fewCreatives: 3,
  adsOrders: 5,
} as const

export function styleBaseline(live: LiveCodeTotals[], ads: Iterable<StyleAds>): StyleBaseline {
  const sum = { exposures: 0, clicks: 0, carts: 0, orders: 0, gmv: 0, styles: 0 }
  for (const item of live) {
    if (!item.exposures) continue
    sum.styles += 1
    sum.exposures += item.exposures
    sum.clicks += item.clicks
    sum.carts += item.carts
    sum.orders += item.measuredOrders
    sum.gmv += item.measuredGmv
  }
  const money = { spend: 0, revenue: 0, count: 0 }
  for (const item of ads) {
    if (item.spend <= 0) continue
    money.count += 1
    money.spend += item.spend
    money.revenue += item.revenue
  }
  return {
    liveCtr: per(sum.clicks, sum.exposures),
    liveCartRate: per(sum.carts, sum.clicks),
    liveCartToOrder: per(sum.orders, sum.carts),
    liveCvr: per(sum.orders, sum.clicks),
    liveGpm: sum.exposures ? (sum.gmv / sum.exposures) * 1000 : undefined,
    liveExposures: per(sum.exposures, sum.styles),
    adsRoi: per(money.revenue, money.spend),
    adsSpend: per(money.spend, money.count),
  }
}

export function styleActions(row: Omit<StyleRow, 'actions'>, base: StyleBaseline): StyleAction[] {
  const rules = STYLE_RULES
  const out: StyleAction[] = []
  const lowStock = EMPTY_OUT.has(row.risk)
  if ((lowStock || row.risk === 'reorder') && row.units30 >= rules.restockUnits) {
    out.push({ kind: 'restock', reason: row.daysLeft === undefined ? 'restockStock' : 'restock', params: { stock: row.stock ?? 0, days: Math.max(0, Math.floor(row.daysLeft ?? 0)), qty: row.suggestQty } })
  }
  const roi = row.ads ? per(row.ads.revenue, row.ads.spend) : undefined
  const losing = roi !== undefined && base.adsRoi !== undefined && base.adsSpend !== undefined && row.ads!.spend >= base.adsSpend * 0.3 && roi <= base.adsRoi * rules.bad
  if (losing) out.push({ kind: 'cutAds', reason: 'cutAds', params: { roi: roi!, avg: base.adsRoi!, spend: row.ads!.spend } })

  const live = row.live
  const cvr = live ? per(live.measuredOrders, live.clicks) : undefined
  const ctr = live ? per(live.clicks, live.exposures) : undefined
  const gpm = live?.exposures ? (live.measuredGmv / live.exposures) * 1000 : undefined
  const liveProven = Boolean(live && live.clicks >= rules.liveClicks && live.measuredOrders >= rules.liveOrders && cvr !== undefined && base.liveCvr && cvr >= base.liveCvr * rules.good)
  const adsProven = roi !== undefined && base.adsRoi !== undefined && base.adsSpend !== undefined && row.ads!.spend >= base.adsSpend * 0.05 && row.ads!.orders >= rules.adsOrders && roi >= base.adsRoi * 1.2

  // 断货的款先补货，不再加素材、加曝光
  if (!lowStock && !losing && (row.ads?.creatives || 0) < rules.fewCreatives) {
    const creatives = row.ads?.creatives || 0
    if (liveProven) out.push({ kind: 'makeVideo', reason: 'makeVideoLive', params: { cvr: cvr!, avg: base.liveCvr!, creatives } })
    else if (adsProven) out.push({ kind: 'makeVideo', reason: 'makeVideoAds', params: { roi: roi!, avg: base.adsRoi!, creatives } })
    else if (row.verdict === 'winner' || row.verdict === 'potential') out.push({ kind: 'makeVideo', reason: 'makeVideoCard', params: { creatives } })
  }
  if (!lowStock && live && live.clicks >= rules.liveClicks && live.measuredOrders >= rules.liveOrders && gpm !== undefined && base.liveGpm && base.liveExposures && gpm >= base.liveGpm * rules.good && live.exposures < base.liveExposures) {
    out.push({ kind: 'livePush', reason: 'livePush', params: { gpm, avg: base.liveGpm, exposures: live.exposures, usual: Math.round(base.liveExposures) } })
  }
  if (live && live.clicks >= rules.judgeClicks && ctr !== undefined) {
    const cartRate = per(live.carts, live.clicks)
    const cartToOrder = per(live.measuredOrders, live.carts)
    if (live.carts >= rules.judgeCarts && cartRate !== undefined && base.liveCartRate && cartRate >= base.liveCartRate && cartToOrder !== undefined && base.liveCartToOrder && cartToOrder <= base.liveCartToOrder * rules.bad) {
      out.push({ kind: 'fixPrice', reason: 'fixPrice', params: { cartRate, cartToOrder, avg: base.liveCartToOrder } })
    } else if (base.liveCtr && ctr >= base.liveCtr && cartRate !== undefined && base.liveCartRate && cartRate <= base.liveCartRate * rules.bad && cvr !== undefined && base.liveCvr && cvr < base.liveCvr) {
      out.push({ kind: 'fixDetail', reason: 'fixDetail', params: { ctr, cartRate, avg: base.liveCartRate } })
    }
  }
  if (!out.some((item) => item.kind === 'fixPrice' || item.kind === 'fixDetail') && row.verdict === 'leaky') out.push({ kind: 'fixDetail', reason: 'fixDetailCard', params: {} })
  if (row.missingIn) out.push({ kind: 'gap', reason: 'gap', params: { shops: row.missingIn, units: row.units30 } })
  return out
}

export function buildStyleBoard(input: StyleBoardInput): StyleBoard {
  const live = new Map(input.live.filter((item) => item.currency === input.currency).map((item) => [item.code, item]))
  const base = styleBaseline([...live.values()], input.ads.values())
  const gaps = new Map(input.gaps.map((item) => [item.code, item.missingIn]))
  const counts = Object.fromEntries(STYLE_ACTIONS.map((kind) => [kind, 0])) as StyleBoard['counts']
  const items = input.stats.map((item): StyleRow => {
    const card = input.cards.get(item.code)
    const archive = input.library.get(item.code)
    const row: Omit<StyleRow, 'actions'> = {
      code: item.code,
      name: item.name,
      image: item.image,
      units7: item.units7,
      unitsPrev7: item.unitsPrev7,
      units30: item.units30,
      amount30: item.amount30,
      price: per(item.amount30, item.units30),
      cost: item.cost,
      stock: item.stock,
      daysLeft: item.daysLeft,
      suggestQty: item.suggestQty,
      risk: item.risk,
      verdict: item.verdict,
      suggestion: item.suggestion,
      hotType: archive?.hotType,
      productId: archive?.id,
      card,
      cardRates: card ? ratesOf(card) : undefined,
      live: live.get(item.code),
      ads: input.ads.get(item.code),
      missingIn: gaps.get(item.code),
    }
    const actions = styleActions(row, base)
    for (const action of actions) counts[action.kind] += 1
    return { ...row, actions }
  })
  // 有事要做、卖得多的在前
  items.sort((a, b) => Number(b.actions.length > 0) - Number(a.actions.length > 0) || b.amount30 - a.amount30)
  return { items, counts, baseline: base, currency: input.currency, days: 30, lastSyncAt: input.lastSyncAt, notArchived: items.filter((item) => item.units30 > 0 && !item.productId).length }
}

/* ------------------------------------------------------------------ 选品命中率 */

export type YieldSourceRow = { keyword: string; source: string; currency: string; price?: number; candidate: boolean; kept: boolean; code?: string; tested: boolean }
export type YieldBy = 'keyword' | 'source' | 'price'
export type YieldRow = { key: string; collected: number; candidates: number; kept: number; coded: number; listed: number; tested: number; sold: number; hot: number; units30: number; amount30: number }

const BANDS = [10, 20, 30, 50, 100]
export function priceBand(price: number | undefined, currency: string): string {
  if (price === undefined || !(price > 0)) return '—'
  const top = BANDS.findIndex((value) => price < value)
  const text = top === 0 ? `< ${BANDS[0]}` : top < 0 ? `≥ ${BANDS[BANDS.length - 1]}` : `${BANDS[top - 1]}–${BANDS[top]}`
  return `${text} ${currency}`
}

/** 采集 → 候选 → 确定 → 上架 → 出单 → 爆款；同一个款号只算一次销量 */
export function buildYield(rows: YieldSourceRow[], by: YieldBy, styles: Map<string, { listed: boolean; units30: number; amount30: number; hot: boolean }>): YieldRow[] {
  const map = new Map<string, YieldRow & { codes: Set<string> }>()
  for (const row of rows) {
    const key = by === 'keyword' ? row.keyword : by === 'source' ? row.source : priceBand(row.price, row.currency)
    const entry = map.get(key) || { key, collected: 0, candidates: 0, kept: 0, coded: 0, listed: 0, tested: 0, sold: 0, hot: 0, units30: 0, amount30: 0, codes: new Set<string>() }
    map.set(key, entry)
    entry.collected += 1
    if (row.candidate) entry.candidates += 1
    if (row.kept) entry.kept += 1
    if (row.tested) entry.tested += 1
    if (!row.code || !row.kept || entry.codes.has(row.code)) continue
    entry.codes.add(row.code)
    entry.coded += 1
    const style = styles.get(row.code)
    if (!style) continue
    if (style.listed) entry.listed += 1
    if (style.units30 > 0) entry.sold += 1
    if (style.hot) entry.hot += 1
    entry.units30 += style.units30
    entry.amount30 += style.amount30
  }
  return [...map.values()].map(({ codes: _codes, ...item }) => item).sort((a, b) => b.hot - a.hot || b.units30 - a.units30 || b.kept - a.kept || b.collected - a.collected)
}
