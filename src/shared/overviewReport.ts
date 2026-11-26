/**
 * Business overview: one page that answers "what grew, what broke, what needs me" across the whole system.
 *
 * Pure calculation only. The desktop main process gathers the raw numbers (content index, GMV Max,
 * creator hub, inventory, product spine, health checks) and the web version can pass whatever subset
 * it has; any source left null simply drops out of the report instead of showing zeros.
 * Thresholds are fixed rules so the same data always produces the same warnings.
 */
import { computeInsights, type BriefItem, type InsightsReport, type ReportFeedback, type ReportItem, type ReportReview } from './contentReports'

export type OverviewArea = 'ads' | 'content' | 'creators' | 'inventory' | 'product' | 'system'
export type OverviewKind = 'problem' | 'growth' | 'todo'
export type OverviewLevel = 'error' | 'warning' | 'success' | 'info'

export type OverviewSignal = {
  id: string
  kind: OverviewKind
  level: OverviewLevel
  area: OverviewArea
  title: string
  detail: string
  route?: string
  aiPrompt?: string
}

export type OverviewKpi = {
  key: 'gmv' | 'spend' | 'roi' | 'orders' | 'creatorGmv' | 'produced' | 'approvalRate' | 'published'
  area: OverviewArea
  format: 'money' | 'number' | 'percent' | 'roi'
  value: number | null
  previous: number | null
  /** Relative change in percent; for rates (approval rate) the change in percentage points. */
  change: number | null
  /** true: up is good, false: up is bad, null: neutral (spend). */
  goodWhenUp: boolean | null
  currency?: string
  /** false when the source is not connected yet; the UI shows a "connect" hint instead of 0. */
  available: boolean
  route: string
}

export type OverviewFunnelStep = { key: 'produced' | 'approved' | 'published' | 'orders'; value: number; rate: number | null; route: string }

export type OverviewReport = {
  generatedAt: number
  rangeDays: number
  headline: string
  kpis: OverviewKpi[]
  problems: OverviewSignal[]
  growth: OverviewSignal[]
  todos: OverviewSignal[]
  funnel: OverviewFunnelStep[]
  sources: { ads: boolean; creators: boolean; inventory: boolean }
  /** Ad accounts in another currency than the one shown; their money is not in the totals. */
  adsOtherCurrencies: string[]
  /** Ads totals per day (GMV MAX), null when no ad account is connected. */
  trend?: OverviewTrend | null
  /** Recent ads ROI per library product (product spine window), for the top products list. */
  productRoi?: Record<string, number>
}

export type AdsTotals = { spend: number; revenue: number; orders: number }
export type OverviewAdsInput = {
  currency: string
  current: AdsTotals
  previous: AdsTotals
  campaigns: Array<{ id: string; name: string; current: AdsTotals; previous: AdsTotals }>
  pendingActions: number
  otherCurrencies?: string[]
  /** Day by day totals for the trend chart; previous[i] is the same weekday position one range earlier. */
  trend?: OverviewTrend
}
/** hasCurrent / hasPrevious: false when no ad data has been synced for that day yet (the totals are then 0, not real zeros). */
export type OverviewTrendDay = { date: string; current: AdsTotals; previous: AdsTotals; hasCurrent?: boolean; hasPrevious?: boolean }
/** lastDataDate: the newest day that has synced ad data, so the UI can say how far the numbers go. */
export type OverviewTrend = { currency: string; days: OverviewTrendDay[]; lastDataDate?: string }
export type OverviewCreatorsInput = {
  gmv: number
  previousGmv?: number
  orders: number
  previousOrders?: number
  awaitingContent: number
  overdueSamples: number
  pendingReview: number
  productsMissingCost: number
}
export type OverviewInventoryInput = Array<{ sku: string; risk: string; daysToStockout?: number; averageDaily: number }>
export type OverviewProductInput = {
  productId: string
  productName: string
  adsSpend: number
  newContent: number
  /** Recent ads ROI of the product, when it has ad spend. */
  adsRoi?: number | null
  signals: Array<{ key: string; params: Record<string, string | number> }>
}
export type OverviewHealthInput = Array<{ level: 'ok' | 'warning' | 'error'; title: string; detail: string; route?: string }>

export type OverviewInput = {
  rangeDays?: number
  now?: number
  content: { items: ReportItem[]; reviews: Record<string, ReportReview>; feedback: ReportFeedback[]; pendingReviews: number }
  ads?: OverviewAdsInput | null
  creators?: OverviewCreatorsInput | null
  inventory?: OverviewInventoryInput | null
  products?: OverviewProductInput[] | null
  health?: OverviewHealthInput | null
}

export const OVERVIEW_ROUTES = {
  ads: '/plugins/tiktok-gmv-max-optimizer',
  creators: '/plugins/tiktok-creator-hub',
  inventory: '/plugins/dianxiaomi-inventory',
  review: '/inbox',
  publish: '/publish',
  tasks: '/tasks',
  home: '/',
  product: (id: string) => `/products/${id}`,
}

/** Rules. A change counts once it moves this much against the previous period of the same length. */
export const OVERVIEW_THRESHOLDS = {
  gmvChange: 20,
  roiChange: 15,
  spendUpOrdersFlat: 20,
  approvalPoints: 15,
  approvalMinDecided: 5,
  campaignRoiDrop: 30,
  campaignMinSpendShare: 0.05,
  creatorGmvChange: 20,
}

const DAY = 86_400_000

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return round(((current - previous) / Math.abs(previous)) * 100, 1)
}

function roiOf(totals: AdsTotals) {
  return totals.spend > 0 ? round(totals.revenue / totals.spend) : null
}

function money(value: number, currency?: string) {
  const text = Math.abs(value) >= 1000 ? Math.round(value).toLocaleString('en-US') : String(round(value))
  return currency ? `${text} ${currency}` : text
}

/** GMV Max names product-card traffic "product-card:<id>"; that id means nothing to a reader. */
export function creativeLabel(name: unknown) {
  const text = String(name ?? '').trim()
  return /^\[?product-card:\d+\]?$/.test(text) ? '商品卡' : text
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value}%`
}

/** Content insights for the window that ended `rangeDays` ago, for period-over-period comparison. */
function previousInsights(input: OverviewInput['content'], rangeDays: number, now: number): InsightsReport {
  const cutoff = now - rangeDays * DAY
  const reviews: Record<string, ReportReview> = {}
  for (const [key, record] of Object.entries(input.reviews)) if ((record.decidedAt || 0) < cutoff) reviews[key] = record
  return computeInsights({
    items: input.items.filter((item) => item.updatedAt < cutoff),
    reviews,
    feedback: input.feedback.filter((entry) => entry.createdAt < cutoff),
    rangeDays,
    now: cutoff,
  })
}

function contentTotals(report: InsightsReport) {
  const produced = report.lines.reduce((sum, row) => sum + row.produced, 0)
  const approved = report.lines.reduce((sum, row) => sum + row.approved, 0)
  const decided = report.lines.reduce((sum, row) => sum + row.approved + row.redo + row.discarded, 0)
  return { produced, approved, decided, approvalRate: decided ? Math.round((approved / decided) * 100) : null, published: report.publish.published }
}

export function computeOverview(input: OverviewInput): OverviewReport {
  const rangeDays = input.rangeDays ?? 7
  const now = input.now ?? Date.now()
  const since = now - rangeDays * DAY
  const signals: OverviewSignal[] = []
  const push = (signal: OverviewSignal) => signals.push(signal)

  // ---------- content
  const current = computeInsights({ items: input.content.items, reviews: input.content.reviews, feedback: input.content.feedback, rangeDays, now })
  const previous = previousInsights(input.content, rangeDays, now)
  const nowContent = contentTotals(current)
  const beforeContent = contentTotals(previous)

  const failed = input.content.items.filter((item) => item.status === 'failed' && item.line !== 'publish' && item.updatedAt >= since)
  if (failed.length) {
    push({ id: 'content.failed', kind: 'problem', level: 'warning', area: 'content', title: `${failed.length} 条内容生成失败`, detail: failed.slice(0, 3).map((item) => item.productName || item.error || item.ref).join('、'), route: OVERVIEW_ROUTES.home, aiPrompt: '帮我检查最近生成失败的内容，找出原因并重新生成能救回来的' })
  }
  if (current.publish.failed) {
    push({ id: 'publish.failed', kind: 'problem', level: 'warning', area: 'content', title: `${current.publish.failed} 个发布任务失败`, detail: '发布没成功的视频不会进入投放和出单。', route: OVERVIEW_ROUTES.publish })
  }
  if (nowContent.approvalRate !== null && beforeContent.approvalRate !== null && nowContent.decided >= OVERVIEW_THRESHOLDS.approvalMinDecided && beforeContent.decided >= OVERVIEW_THRESHOLDS.approvalMinDecided) {
    const delta = nowContent.approvalRate - beforeContent.approvalRate
    if (delta <= -OVERVIEW_THRESHOLDS.approvalPoints) {
      const reason = current.topRedoReasons[0]
      push({ id: 'content.approval.down', kind: 'problem', level: 'warning', area: 'content', title: `审核通过率降到 ${nowContent.approvalRate}%`, detail: `上一期 ${beforeContent.approvalRate}%${reason ? `，最常见的重做原因是「${reason.reason}」` : ''}。`, route: '/settings?section=brand', aiPrompt: '最近审核通过率下降了，帮我分析重做原因，并更新品牌记忆避免再犯' })
    } else if (delta >= OVERVIEW_THRESHOLDS.approvalPoints) {
      push({ id: 'content.approval.up', kind: 'growth', level: 'success', area: 'content', title: `审核通过率升到 ${nowContent.approvalRate}%`, detail: `上一期 ${beforeContent.approvalRate}%，现在的做法有效。` })
    }
  }
  const produceChange = percentChange(nowContent.produced, beforeContent.produced)
  if (produceChange !== null && produceChange >= 30 && nowContent.produced >= 5) {
    push({ id: 'content.produced.up', kind: 'growth', level: 'success', area: 'content', title: `素材产出 ${signed(produceChange)}`, detail: `本期产出 ${nowContent.produced} 条，上一期 ${beforeContent.produced} 条。` })
  }
  if (input.content.pendingReviews > 0) {
    push({ id: 'content.review', kind: 'todo', level: 'info', area: 'content', title: `${input.content.pendingReviews} 条内容等你审核`, detail: '审核通过后才能发布。', route: OVERVIEW_ROUTES.review })
  }
  const unpublished = nowContent.approved - current.lines.reduce((sum, row) => sum + row.published, 0)
  if (unpublished > 0) {
    push({ id: 'content.unpublished', kind: 'todo', level: 'info', area: 'content', title: `${unpublished} 条已通过的内容还没发布`, detail: '可以交给 AI 制片人生成发布草稿。', route: OVERVIEW_ROUTES.publish, aiPrompt: '把最近已经审核通过但还没发布的内容整理成发布草稿' })
  }

  // ---------- ads (GMV Max)
  const ads = input.ads || null
  const adsRoi = ads ? roiOf(ads.current) : null
  const adsRoiBefore = ads ? roiOf(ads.previous) : null
  if (ads) {
    const cur = ads.currency
    const gmvChange = percentChange(ads.current.revenue, ads.previous.revenue)
    if (gmvChange !== null && gmvChange <= -OVERVIEW_THRESHOLDS.gmvChange) {
      push({ id: 'ads.gmv.down', kind: 'problem', level: 'error', area: 'ads', title: `投放 GMV 下滑 ${gmvChange}%`, detail: `本期 ${money(ads.current.revenue, cur)}，上一期 ${money(ads.previous.revenue, cur)}。`, route: OVERVIEW_ROUTES.ads, aiPrompt: '投放 GMV 比上一期明显下滑，帮我找出是哪些计划和素材拖累的，并给出调整建议' })
    } else if (gmvChange !== null && gmvChange >= OVERVIEW_THRESHOLDS.gmvChange) {
      push({ id: 'ads.gmv.up', kind: 'growth', level: 'success', area: 'ads', title: `投放 GMV 增长 ${signed(gmvChange)}`, detail: `本期 ${money(ads.current.revenue, cur)}，上一期 ${money(ads.previous.revenue, cur)}。`, route: OVERVIEW_ROUTES.ads })
    }
    const roiChange = percentChange(adsRoi, adsRoiBefore)
    if (roiChange !== null && roiChange <= -OVERVIEW_THRESHOLDS.roiChange) {
      push({ id: 'ads.roi.down', kind: 'problem', level: 'warning', area: 'ads', title: `ROI 从 ${adsRoiBefore} 降到 ${adsRoi}`, detail: `下降 ${Math.abs(roiChange)}%，同样的花费换回的成交变少了。`, route: OVERVIEW_ROUTES.ads })
    } else if (roiChange !== null && roiChange >= OVERVIEW_THRESHOLDS.roiChange) {
      push({ id: 'ads.roi.up', kind: 'growth', level: 'success', area: 'ads', title: `ROI 从 ${adsRoiBefore} 升到 ${adsRoi}`, detail: `提升 ${roiChange}%。`, route: OVERVIEW_ROUTES.ads })
    }
    const spendChange = percentChange(ads.current.spend, ads.previous.spend)
    const orderChange = percentChange(ads.current.orders, ads.previous.orders)
    if (spendChange !== null && spendChange >= OVERVIEW_THRESHOLDS.spendUpOrdersFlat && (orderChange === null ? ads.current.orders <= ads.previous.orders : orderChange <= 0)) {
      push({ id: 'ads.spend.noorders', kind: 'problem', level: 'error', area: 'ads', title: `花费涨了 ${spendChange}%，订单没涨`, detail: `订单 ${ads.previous.orders} → ${ads.current.orders}，多花的钱没有换来成交。`, route: OVERVIEW_ROUTES.ads })
    }
    const minSpend = ads.current.spend * OVERVIEW_THRESHOLDS.campaignMinSpendShare
    const burning = ads.campaigns.filter((row) => row.current.spend > 0 && row.current.spend >= minSpend && row.current.orders === 0).sort((a, b) => b.current.spend - a.current.spend)
    if (burning.length) {
      push({ id: 'ads.campaign.noorders', kind: 'problem', level: 'warning', area: 'ads', title: `${burning.length} 个计划在花钱但没出单`, detail: burning.slice(0, 3).map((row) => `${row.name}（${money(row.current.spend, cur)}）`).join('、'), route: OVERVIEW_ROUTES.ads })
    }
    const sliding = ads.campaigns
      .map((row) => ({ row, before: roiOf(row.previous), now: roiOf(row.current) }))
      .filter((entry) => entry.row.current.spend >= minSpend && entry.before && entry.now !== null && entry.now < entry.before * (1 - OVERVIEW_THRESHOLDS.campaignRoiDrop / 100))
      .sort((a, b) => b.row.current.spend - a.row.current.spend)
    if (sliding.length) {
      push({ id: 'ads.campaign.roi', kind: 'problem', level: 'warning', area: 'ads', title: `${sliding.length} 个计划 ROI 大幅下降`, detail: sliding.slice(0, 3).map((entry) => `${entry.row.name}（${entry.before} → ${entry.now}）`).join('、'), route: OVERVIEW_ROUTES.ads })
    }
    if (ads.pendingActions > 0) {
      push({ id: 'ads.actions', kind: 'todo', level: 'info', area: 'ads', title: `${ads.pendingActions} 条投放调整建议待处理`, detail: '加预算、降出价、换素材等建议，确认后才会执行。', route: OVERVIEW_ROUTES.ads })
    }
  }

  // ---------- creators
  const creators = input.creators || null
  if (creators) {
    const change = percentChange(creators.gmv, creators.previousGmv ?? null)
    if (change !== null && change <= -OVERVIEW_THRESHOLDS.creatorGmvChange) {
      push({ id: 'creators.gmv.down', kind: 'problem', level: 'warning', area: 'creators', title: `达人带货 GMV 下滑 ${change}%`, detail: `本期 ${money(creators.gmv)}，上一期 ${money(creators.previousGmv || 0)}。`, route: OVERVIEW_ROUTES.creators })
    } else if (change !== null && change >= OVERVIEW_THRESHOLDS.creatorGmvChange) {
      push({ id: 'creators.gmv.up', kind: 'growth', level: 'success', area: 'creators', title: `达人带货 GMV 增长 ${signed(change)}`, detail: `本期 ${money(creators.gmv)}，上一期 ${money(creators.previousGmv || 0)}。`, route: OVERVIEW_ROUTES.creators })
    }
    if (creators.overdueSamples > 0) {
      push({ id: 'creators.overdue', kind: 'problem', level: 'warning', area: 'creators', title: `${creators.overdueSamples} 个寄样超期没出视频`, detail: '样品已经寄出，达人还没履约，需要催一下或停止合作。', route: OVERVIEW_ROUTES.creators })
    }
    if (creators.pendingReview > 0) {
      push({ id: 'creators.pending', kind: 'todo', level: 'info', area: 'creators', title: `${creators.pendingReview} 个寄样申请待审核`, detail: '达人申请了样品，等你决定发不发。', route: OVERVIEW_ROUTES.creators })
    }
    if (creators.productsMissingCost > 0) {
      push({ id: 'creators.cost', kind: 'todo', level: 'info', area: 'creators', title: `${creators.productsMissingCost} 个商品缺成本`, detail: '补上成本才能算出达人合作是否赚钱。', route: OVERVIEW_ROUTES.creators })
    }
  }

  // ---------- inventory
  const inventory = input.inventory || null
  if (inventory) {
    const out = inventory.filter((row) => row.risk === 'out_of_stock').sort((a, b) => b.averageDaily - a.averageDaily)
    const low = inventory.filter((row) => row.risk === 'reorder').sort((a, b) => (a.daysToStockout ?? 999) - (b.daysToStockout ?? 999))
    if (out.length) {
      push({ id: 'inventory.out', kind: 'problem', level: 'error', area: 'inventory', title: `${out.length} 个 SKU 已断货`, detail: out.slice(0, 4).map((row) => row.sku).join('、'), route: OVERVIEW_ROUTES.inventory })
    }
    if (low.length) {
      push({ id: 'inventory.reorder', kind: 'problem', level: 'warning', area: 'inventory', title: `${low.length} 个 SKU 快断货`, detail: low.slice(0, 4).map((row) => (row.daysToStockout !== undefined ? `${row.sku}（约 ${Math.max(0, Math.floor(row.daysToStockout))} 天）` : row.sku)).join('、'), route: OVERVIEW_ROUTES.inventory })
    }
  }

  // ---------- per product (ads x content x creators)
  for (const product of input.products || []) {
    const route = OVERVIEW_ROUTES.product(product.productId)
    const name = product.productName
    if (product.adsSpend > 0 && product.newContent === 0) {
      push({ id: `product.${product.productId}.stale`, kind: 'problem', level: 'warning', area: 'product', title: `「${name}」在投放但没有新素材`, detail: `近 ${rangeDays} 天没有产出新内容，素材会越跑越疲劳。`, route, aiPrompt: `为商品「${name}」规划并生成一批新素材，参考它投放里表现最好的视频` })
    }
    for (const signal of product.signals) {
      const p: Record<string, string | number> = { ...signal.params, name: creativeLabel(signal.params.name) }
      if (signal.key === 'ads_winner') push({ id: `product.${product.productId}.winner`, kind: 'growth', level: 'success', area: 'product', title: `「${name}」跑出爆款素材`, detail: `「${p.name}」ROI ${p.roi}，高于平均 ${p.avgRoi}，${p.orders} 单。照着它多做几条变体。`, route, aiPrompt: `商品「${name}」的素材「${p.name}」ROI 很高，照着它做几条变体` })
      else if (signal.key === 'creator_winner') push({ id: `product.${product.productId}.creator`, kind: 'growth', level: 'success', area: 'product', title: `「${name}」有达人视频在出单`, detail: `@${p.creator} 的视频带来 ${p.orders} 单，可以参考它做自有素材。`, route })
      else if (signal.key === 'ads_fatigue') push({
        id: `product.${product.productId}.fatigue.${p.creativeId || ''}`,
        kind: 'problem',
        level: p.daysLeft !== undefined && Number(p.daysLeft) <= 1 ? 'error' : 'warning',
        area: 'product',
        title: p.daysLeft === undefined ? `「${name}」主力素材疲劳` : Number(p.daysLeft) === 0 ? `「${name}」主力素材已跌破${p.floorKind === 'break_even' ? '保本线' : '平均线'}` : `「${name}」主力素材约 ${p.daysLeft} 天后撑不住`,
        detail: `「${p.name}」占 ${p.share}% 花费，ROI 从 ${p.previousRoi} 掉到 ${p.recentRoi}${p.daysLeft === undefined ? '' : `，${p.floorKind === 'break_even' ? '保本' : '平均线'} ROI ${p.floor}`}。照它补一批变体顶上。`,
        route,
        aiPrompt: `商品「${name}」的主力素材「${p.name}」开始疲劳${p.daysLeft !== undefined ? `，预计 ${p.daysLeft} 天后跌破底线` : ''}，照着它的结构补一批变体顶上，做完送审`,
      })
      else if (signal.key === 'ads_unprofitable') push({ id: `product.${product.productId}.loss`, kind: 'problem', level: 'error', area: 'product', title: `「${name}」投放在亏钱`, detail: `ROI ${p.roi}，低于保本 ROI ${p.breakEvenRoi}。`, route: OVERVIEW_ROUTES.ads })
      else if (signal.key === 'ads_need_creatives') push({ id: `product.${product.productId}.few`, kind: 'todo', level: 'info', area: 'product', title: `「${name}」在投素材太少`, detail: `只有 ${p.active} 条在跑，建议至少 ${p.target} 条。`, route, aiPrompt: `给商品「${name}」补几条投放素材` })
    }
  }

  // ---------- system health
  // One line for all setup issues, so a fresh install does not bury the business problems.
  const unhealthy = (input.health || []).filter((item) => item.level !== 'ok')
  if (unhealthy.length === 1) {
    const item = unhealthy[0]!
    push({ id: 'system.health', kind: 'problem', level: item.level === 'error' ? 'error' : 'warning', area: 'system', title: item.title, detail: item.detail, route: item.route })
  } else if (unhealthy.length > 1) {
    const hasError = unhealthy.some((item) => item.level === 'error')
    push({ id: 'system.health', kind: 'problem', level: hasError ? 'error' : 'warning', area: 'system', title: `${unhealthy.length} 项系统设置需要处理`, detail: unhealthy.map((item) => item.title).join('、'), route: unhealthy.find((item) => item.level === 'error')?.route || unhealthy[0]!.route || '/settings' })
  }

  // ---------- KPIs and funnel
  const creatorsOrders = creators?.orders ?? 0
  const kpis: OverviewKpi[] = [
    { key: 'gmv', area: 'ads', format: 'money', value: ads ? round(ads.current.revenue) : null, previous: ads ? round(ads.previous.revenue) : null, change: ads ? percentChange(ads.current.revenue, ads.previous.revenue) : null, goodWhenUp: true, currency: ads?.currency, available: !!ads, route: OVERVIEW_ROUTES.ads },
    { key: 'spend', area: 'ads', format: 'money', value: ads ? round(ads.current.spend) : null, previous: ads ? round(ads.previous.spend) : null, change: ads ? percentChange(ads.current.spend, ads.previous.spend) : null, goodWhenUp: null, currency: ads?.currency, available: !!ads, route: OVERVIEW_ROUTES.ads },
    { key: 'roi', area: 'ads', format: 'roi', value: adsRoi, previous: adsRoiBefore, change: percentChange(adsRoi, adsRoiBefore), goodWhenUp: true, available: !!ads, route: OVERVIEW_ROUTES.ads },
    { key: 'orders', area: 'ads', format: 'number', value: ads ? ads.current.orders : null, previous: ads ? ads.previous.orders : null, change: ads ? percentChange(ads.current.orders, ads.previous.orders) : null, goodWhenUp: true, available: !!ads, route: OVERVIEW_ROUTES.ads },
    { key: 'creatorGmv', area: 'creators', format: 'money', value: creators ? round(creators.gmv) : null, previous: creators?.previousGmv ?? null, change: creators ? percentChange(creators.gmv, creators.previousGmv ?? null) : null, goodWhenUp: true, available: !!creators, route: OVERVIEW_ROUTES.creators },
    { key: 'produced', area: 'content', format: 'number', value: nowContent.produced, previous: beforeContent.produced, change: percentChange(nowContent.produced, beforeContent.produced), goodWhenUp: true, available: true, route: OVERVIEW_ROUTES.home },
    { key: 'approvalRate', area: 'content', format: 'percent', value: nowContent.approvalRate, previous: beforeContent.approvalRate, change: nowContent.approvalRate !== null && beforeContent.approvalRate !== null ? nowContent.approvalRate - beforeContent.approvalRate : null, goodWhenUp: true, available: true, route: OVERVIEW_ROUTES.review },
    { key: 'published', area: 'content', format: 'number', value: nowContent.published, previous: beforeContent.published, change: percentChange(nowContent.published, beforeContent.published), goodWhenUp: true, available: true, route: OVERVIEW_ROUTES.publish },
  ]

  const totalOrders = (ads?.current.orders ?? 0) + creatorsOrders
  const rate = (value: number, base: number) => (base > 0 ? Math.round((value / base) * 100) : null)
  const funnel: OverviewFunnelStep[] = [
    { key: 'produced', value: nowContent.produced, rate: null, route: OVERVIEW_ROUTES.home },
    { key: 'approved', value: nowContent.approved, rate: rate(nowContent.approved, nowContent.produced), route: OVERVIEW_ROUTES.review },
    { key: 'published', value: nowContent.published, rate: rate(nowContent.published, nowContent.approved), route: OVERVIEW_ROUTES.publish },
    { key: 'orders', value: totalOrders, rate: null, route: ads ? OVERVIEW_ROUTES.ads : OVERVIEW_ROUTES.creators },
  ]

  const levelRank: Record<OverviewLevel, number> = { error: 0, warning: 1, success: 2, info: 3 }
  const byLevel = (a: OverviewSignal, b: OverviewSignal) => levelRank[a.level] - levelRank[b.level]
  const problems = signals.filter((item) => item.kind === 'problem').sort(byLevel)
  const growth = signals.filter((item) => item.kind === 'growth')
  const todos = signals.filter((item) => item.kind === 'todo')

  return {
    generatedAt: now,
    rangeDays,
    headline: overviewHeadline({ rangeDays, ads, problems, growth, todos }),
    kpis,
    problems,
    growth,
    todos,
    funnel,
    sources: { ads: !!ads, creators: !!creators, inventory: !!inventory },
    adsOtherCurrencies: ads?.otherCurrencies || [],
    productRoi: Object.fromEntries((input.products || []).filter((row) => row.adsSpend > 0 && typeof row.adsRoi === 'number').map((row) => [row.productId, row.adsRoi as number])),
  }
}

function overviewHeadline(input: { rangeDays: number; ads: OverviewAdsInput | null; problems: OverviewSignal[]; growth: OverviewSignal[]; todos: OverviewSignal[] }) {
  const parts: string[] = []
  if (input.ads) {
    const change = percentChange(input.ads.current.revenue, input.ads.previous.revenue)
    parts.push(`近 ${input.rangeDays} 天投放 GMV ${money(input.ads.current.revenue, input.ads.currency)}${change !== null ? `（${signed(change)}）` : ''}`)
  }
  const errors = input.problems.filter((item) => item.level === 'error').length
  if (errors) parts.push(`${errors} 个严重问题要先处理`)
  else if (input.problems.length) parts.push(`${input.problems.length} 个问题值得看一下`)
  if (input.growth.length) parts.push(`${input.growth.length} 处在增长`)
  if (input.todos.length) parts.push(`${input.todos.length} 件事等你处理`)
  if (!input.problems.length && !input.growth.length && !input.todos.length) parts.push('一切正常，没有发现异常')
  return parts.join('，') + '。'
}

// ---------- daily brief

/** Areas the content-only daily brief can't see; their signals are added on top of it. */
const BUSINESS_AREAS = new Set<OverviewArea>(['ads', 'creators', 'inventory', 'product'])

/**
 * Adds the overview's business signals (ads / creators / inventory / products) to the daily brief items.
 * Business problems go first (that's where money is lost), up to two growth signals go last.
 * Content and system signals are skipped: the daily brief already lists them.
 */
export function withBusinessSignals(items: BriefItem[], report: OverviewReport | null): BriefItem[] {
  if (!report) return items
  const toItem = (signal: OverviewSignal, level: BriefItem['level'], kind: BriefItem['kind']): BriefItem => ({ kind, level, title: signal.title, detail: signal.detail, route: signal.route, aiPrompt: signal.aiPrompt })
  const business = (signal: OverviewSignal) => BUSINESS_AREAS.has(signal.area)
  const problems = report.problems.filter(business).map((signal) => toItem(signal, signal.level === 'error' ? 'error' : 'warning', 'business'))
  const todos = report.todos.filter(business).map((signal) => toItem(signal, 'warning', 'business'))
  const growth = report.growth.slice(0, 2).map((signal) => toItem(signal, 'ok', 'growth'))
  // "一切正常" is wrong once the business side has something to handle.
  const content = problems.length || todos.length ? items.filter((item) => item.kind !== 'suggestion') : items
  return [...problems, ...content, ...todos, ...growth]
}

/** One line of business numbers for the brief, e.g. "近 7 天投放 GMV 1,820 USD（-35%）· ROI 1.73（-56.7%）". Empty when nothing is connected. */
export function overviewMetricsLine(report: OverviewReport | null) {
  if (!report) return ''
  const parts: string[] = []
  for (const key of ['gmv', 'roi', 'orders', 'creatorGmv'] as const) {
    const kpi = report.kpis.find((entry) => entry.key === key)
    if (!kpi?.available || kpi.value === null) continue
    const label = { gmv: '投放 GMV', roi: 'ROI', orders: '投放订单', creatorGmv: '达人带货 GMV' }[key]
    const value = kpi.format === 'money' ? money(kpi.value, kpi.currency) : kpi.format === 'roi' ? kpi.value.toFixed(2) : String(kpi.value)
    parts.push(`${label} ${value}${kpi.change !== null ? `（${signed(kpi.change)}）` : ''}`)
  }
  return parts.length ? `近 ${report.rangeDays} 天${parts.join(' · ')}` : ''
}
