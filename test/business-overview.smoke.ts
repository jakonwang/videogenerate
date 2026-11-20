import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { computeOverview, overviewMetricsLine, percentChange, withBusinessSignals, type OverviewInput } from '../src/shared/overviewReport'
import { dailyBriefItems, dailyHeadline, type ReportItem, type ReportReview } from '../src/shared/contentReports'
import { buildBriefCard } from '../src/main/modules/content-hub/feishuPush'

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 20, 12)

function item(ref: string, ageDays: number, extra: Partial<ReportItem> = {}): ReportItem {
  return { ref, line: 'clone', status: 'ready', route: '/clone', updatedAt: now - ageDays * DAY, ...extra }
}

function emptyContent(): OverviewInput['content'] {
  return { items: [], reviews: {}, feedback: [], pendingReviews: 0 }
}

function ids(list: Array<{ id: string }>) {
  return list.map((entry) => entry.id)
}

async function main() {
  // 1. percentChange guards against missing or zero baselines.
  assert.equal(percentChange(120, 100), 20)
  assert.equal(percentChange(80, 0), null)
  assert.equal(percentChange(null, 100), null)

  // 2. Nothing connected and nothing produced: quiet report, ads/creators/inventory marked unavailable.
  let report = computeOverview({ now, content: emptyContent() })
  assert.equal(report.problems.length + report.growth.length + report.todos.length, 0)
  assert.ok(report.headline.includes('一切正常'))
  assert.deepEqual(report.sources, { ads: false, creators: false, inventory: false })
  assert.equal(report.kpis.find((kpi) => kpi.key === 'gmv')!.available, false)
  assert.equal(report.kpis.find((kpi) => kpi.key === 'gmv')!.value, null)

  // 3. Ads: GMV down, spend up with flat orders, a campaign burning money, one with a ROI slide.
  report = computeOverview({
    now,
    content: emptyContent(),
    ads: {
      currency: 'USD',
      current: { spend: 1300, revenue: 1600, orders: 40 },
      previous: { spend: 1000, revenue: 2400, orders: 50 },
      campaigns: [
        { id: 'c1', name: '耳环主推', current: { spend: 1000, revenue: 1600, orders: 40 }, previous: { spend: 900, revenue: 2400, orders: 50 } },
        { id: 'c2', name: '项链测款', current: { spend: 300, revenue: 0, orders: 0 }, previous: { spend: 100, revenue: 0, orders: 0 } },
      ],
      pendingActions: 3,
    },
  })
  assert.deepEqual(ids(report.problems).slice(0, 2).sort(), ['ads.gmv.down', 'ads.spend.noorders'])
  assert.ok(ids(report.problems).includes('ads.roi.down'))
  assert.ok(ids(report.problems).includes('ads.campaign.noorders'))
  assert.ok(report.problems.find((entry) => entry.id === 'ads.campaign.noorders')!.detail.includes('项链测款'))
  assert.ok(ids(report.problems).includes('ads.campaign.roi'))
  assert.deepEqual(ids(report.todos), ['ads.actions'])
  const gmv = report.kpis.find((kpi) => kpi.key === 'gmv')!
  assert.equal(gmv.change, -33.3)
  assert.equal(gmv.currency, 'USD')
  assert.equal(report.kpis.find((kpi) => kpi.key === 'roi')!.value, 1.23)
  assert.ok(report.headline.includes('1,600 USD'))
  assert.ok(report.headline.includes('严重问题'))
  // Errors sort ahead of warnings.
  assert.equal(report.problems[0]!.level, 'error')

  // 4. Ads growing: growth signals, no problems.
  report = computeOverview({
    now,
    content: emptyContent(),
    ads: { currency: 'USD', current: { spend: 1000, revenue: 3000, orders: 90 }, previous: { spend: 1000, revenue: 2000, orders: 60 }, campaigns: [], pendingActions: 0 },
  })
  assert.deepEqual(ids(report.problems), [])
  assert.deepEqual(ids(report.growth).sort(), ['ads.gmv.up', 'ads.roi.up'])

  // 5. Content: approval rate drop against the previous window, failures, pending reviews, unpublished approvals.
  const items: ReportItem[] = []
  const reviews: Record<string, ReportReview> = {}
  for (let i = 0; i < 10; i += 1) {
    const ref = `old-${i}`
    items.push(item(ref, 10))
    reviews[ref] = { ref, line: 'clone', decision: i < 9 ? 'approved' : 'redo', decidedAt: now - 10 * DAY }
  }
  for (let i = 0; i < 10; i += 1) {
    const ref = `new-${i}`
    items.push(item(ref, 2))
    reviews[ref] = { ref, line: 'clone', decision: i < 5 ? 'approved' : 'redo', decidedAt: now - 2 * DAY }
  }
  items.push(item('broken', 1, { status: 'failed', productName: '珍珠耳环' }))
  report = computeOverview({ now, content: { items, reviews, feedback: [{ decision: 'redo', reason: 'product_mismatch', createdAt: now - DAY }], pendingReviews: 4 } })
  assert.ok(ids(report.problems).includes('content.approval.down'))
  assert.ok(ids(report.problems).includes('content.failed'))
  assert.ok(report.problems.find((entry) => entry.id === 'content.failed')!.detail.includes('珍珠耳环'))
  assert.ok(ids(report.todos).includes('content.review'))
  assert.ok(ids(report.todos).includes('content.unpublished'))
  const approval = report.kpis.find((kpi) => kpi.key === 'approvalRate')!
  assert.equal(approval.value, 50)
  assert.equal(approval.previous, 90)
  assert.equal(approval.change, -40)
  assert.deepEqual(report.funnel.map((step) => step.value), [10, 5, 0, 0])
  assert.equal(report.funnel[1]!.rate, 50)

  // 6. Creators, inventory, products, health.
  report = computeOverview({
    now,
    content: emptyContent(),
    creators: { gmv: 500, previousGmv: 1000, orders: 12, previousOrders: 20, awaitingContent: 2, overdueSamples: 3, pendingReview: 5, productsMissingCost: 1 },
    inventory: [
      { sku: 'EAR-01', risk: 'out_of_stock', averageDaily: 9 },
      { sku: 'NEC-02', risk: 'reorder', daysToStockout: 4.6, averageDaily: 3 },
      { sku: 'RING-03', risk: 'healthy', daysToStockout: 60, averageDaily: 1 },
    ],
    products: [
      { productId: 'p1', productName: '珍珠耳环', adsSpend: 200, newContent: 0, signals: [{ key: 'ads_winner', params: { name: '开箱', roi: 4.2, avgRoi: 2.1, orders: 9 } }, { key: 'ads_unprofitable', params: { roi: 1.1, breakEvenRoi: 1.8 } }] },
      { productId: 'p2', productName: '项链', adsSpend: 0, newContent: 0, signals: [] },
    ],
    health: [
      { level: 'ok', title: '模型配置', detail: '已配置' },
      { level: 'error', title: 'TikTok 创意账号', detail: '授权已过期', route: '/plugins/tiktok-creative-studio' },
    ],
  })
  const problemIds = ids(report.problems)
  for (const id of ['creators.gmv.down', 'creators.overdue', 'inventory.out', 'inventory.reorder', 'product.p1.stale', 'product.p1.loss', 'system.health']) {
    assert.ok(problemIds.includes(id), `missing problem ${id}`)
  }
  assert.equal(report.problems.find((entry) => entry.id === 'system.health')!.title, 'TikTok 创意账号')
  // Several setup issues collapse into one line so they don't bury business problems.
  const many = computeOverview({ now, content: emptyContent(), health: [{ level: 'warning', title: '磁盘', detail: '空间不足' }, { level: 'error', title: '模型配置', detail: '未配置', route: '/settings' }] })
  assert.equal(many.problems.length, 1)
  assert.equal(many.problems[0]!.title, '2 项系统设置需要处理')
  assert.equal(many.problems[0]!.level, 'error')
  assert.equal(many.problems[0]!.route, '/settings')
  assert.ok(!problemIds.some((id) => id.startsWith('product.p2')))
  assert.ok(report.problems.find((entry) => entry.id === 'inventory.reorder')!.detail.includes('NEC-02（约 4 天）'))
  assert.deepEqual(ids(report.growth), ['product.p1.winner'])
  assert.deepEqual(ids(report.todos).sort(), ['creators.cost', 'creators.pending'])
  assert.equal(report.kpis.find((kpi) => kpi.key === 'creatorGmv')!.change, -50)
  assert.equal(report.funnel[3]!.value, 12)
  assert.deepEqual(report.sources, { ads: false, creators: true, inventory: true })

  // 7. Daily brief: business problems go first, content items stay, "一切正常" disappears, growth goes last.
  const adsReport = computeOverview({
    now,
    content: emptyContent(),
    ads: { currency: 'USD', current: { spend: 1300, revenue: 1600, orders: 40 }, previous: { spend: 1000, revenue: 2400, orders: 50 }, campaigns: [], pendingActions: 2 },
    creators: { gmv: 900, previousGmv: 600, orders: 10, previousOrders: 6, awaitingContent: 0, overdueSamples: 0, pendingReview: 0, productsMissingCost: 0 },
    health: [{ level: 'error', title: '模型配置', detail: '未配置', route: '/settings' }],
  })
  const contentItems = dailyBriefItems({ pendingReviews: 2, items: [], health: [], now })
  const merged = withBusinessSignals(contentItems, adsReport)
  assert.equal(merged[0]!.kind, 'business')
  assert.equal(merged[0]!.level, 'error')
  assert.ok(merged.some((entry) => entry.kind === 'review_pending'))
  assert.ok(merged.some((entry) => entry.title.includes('投放调整建议')))
  assert.ok(!merged.some((entry) => entry.title === '模型配置'), 'system health is left to the content brief')
  assert.equal(merged.at(-1)!.kind, 'growth')
  assert.ok(merged.at(-1)!.title.includes('达人带货 GMV 增长'))
  const quiet = withBusinessSignals(dailyBriefItems({ pendingReviews: 0, items: [], health: [], now }), adsReport)
  assert.ok(!quiet.some((entry) => entry.kind === 'suggestion'))
  assert.deepEqual(withBusinessSignals(contentItems, null), contentItems)
  const metrics = overviewMetricsLine(adsReport)
  assert.equal(metrics, '近 7 天投放 GMV 1,600 USD（-33.3%） · ROI 1.23（-48.7%） · 投放订单 40（-20%） · 达人带货 GMV 900（+50%）')
  assert.equal(overviewMetricsLine(computeOverview({ now, content: emptyContent() })), '')

  const card = buildBriefCard({ kind: 'daily', periodKey: '2026-11-20', headline: dailyHeadline(merged), metrics, items: merged }) as any
  const cardText = JSON.stringify(card)
  assert.ok(cardText.includes('📊 近 7 天投放 GMV'))
  assert.ok(cardText.includes('📈 **达人带货 GMV 增长'))
  assert.equal(card.card.header.template, 'red')

  // 8. Gatherer on an empty data dir: no modules set up, still returns a report.
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-overview-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  try {
    const { configureAppPathRuntime } = await import('../src/main/lib/paths')
    configureAppPathRuntime({ dataDir: root, userDataDir: root })
    const { readAdsInput, readCreatorsInput, readInventoryInput } = await import('../src/main/modules/content-hub/overview')
    assert.equal(readAdsInput(7, now), null)
    assert.equal(readCreatorsInput(now), null)
    assert.equal(await readInventoryInput(now), null)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }

  console.log('business overview smoke ok')
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
