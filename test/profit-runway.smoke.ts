import assert from 'node:assert/strict'
import { blendedMargin, computeProductMargins, profitOf } from '../src/main/modules/content-hub/productMargin'
import { buildPublishProfit, matchTasksToCreatives } from '../src/main/modules/content-hub/publishProfit'
import { buildSignals, predictRunway, summarizeAds, withProfit } from '../src/main/modules/content-hub/productSpine'
import { computeOverview } from '../src/shared/overviewReport'
import { formatProfit } from '../src/shared/publishProfit'
import type { GmvMaxProductCost, GmvMaxStoreCost } from '../src/main/modules/tiktok-gmv-max/types'

const NOW = Date.parse('2026-11-22T12:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10)

function marginTests() {
  const cost = { purchaseCost: '4', firstMileCost: '0.5', lastMileCost: '1', warehousingCost: '0.5', platformCommissionRate: '0.06', creatorCommissionRate: '0.1', expectedReturnRate: '0.05', returnLossRate: '0.5' }
  const product: GmvMaxProductCost = { id: 'c1', storeId: 's1', productId: 'P1', sellingPrice: '20', updatedAt: 0, ...cost }
  // multi-SKU product without SKU costs → no margin (do not guess)
  const multi: GmvMaxProductCost = { id: 'c2', storeId: 's1', productId: 'P2', sellingPrice: '20', skuCount: 3, catalogMinPrice: '10', catalogMaxPrice: '30', updatedAt: 0, ...cost }
  const store: GmvMaxStoreCost = { id: 'st', connectionId: 'x', advertiserId: 'a', storeId: 's1', updatedAt: 0, ...cost }
  const margins = computeProductMargins({ productIds: ['P1', 'P2', 'P3'], productCosts: [product, multi], storeCosts: [store] })
  assert.deepEqual([...margins.keys()], ['P1'])
  const m = margins.get('P1')!
  // 20 − 6 fixed − 20×(0.06+0.1+0.025) = 10.3 → margin 0.515, break-even 1.94
  assert.equal(m.marginRate, 0.515)
  assert.ok(Math.abs(m.breakEvenRoi - 1.9417) < 0.001)
  assert.equal(profitOf({ revenue: 100, spend: 40, marginRate: m.marginRate }), 11.5)
  assert.equal(profitOf({ revenue: 100, spend: 60, marginRate: m.marginRate }), -8.5)
  assert.equal(blendedMargin([{ productId: 'P1', revenue: 10 }, { productId: 'P3', revenue: 5 }], margins), null, 'one product without cost → no blended margin')
  assert.equal(formatProfit(-8.5), '-8.5')
  assert.equal(formatProfit(11.5), '+11.5')
  assert.equal(formatProfit(undefined), '未填成本')
  return margins
}

function publishProfitTests(margins: ReturnType<typeof computeProductMargins>) {
  const tasks = [
    { id: 't1', state: 'published', connectionUid: 'a', connectionName: 'A', productId: 'P1', videoTitle: 'Pearl earrings for every day' },
    { id: 't2', state: 'published', connectionUid: 'b', connectionName: 'B', productId: 'P1', videoTitle: 'Everyday pearl earrings she will love' },
    { id: 't3', state: 'published', connectionUid: 'b', connectionName: 'B', productId: 'P1', videoTitle: 'Totally unrelated words here' },
    { id: 't4', state: 'draft', connectionUid: 'a', productId: 'P1', videoTitle: 'Pearl earrings for every day' },
    { id: 't5', state: 'published', connectionUid: 'c', connectionName: 'C', productId: 'P9', videoTitle: 'Gold ring daily' },
  ]
  const creatives = [
    { creativeId: 'cr1', name: 'Pearl earrings for every day', productId: 'P1', spend: 40, revenue: 100, orders: 5 },
    { creativeId: 'cr2', name: 'Everyday pearl earrings she will love!', productId: 'P1', spend: 60, revenue: 100, orders: 4 },
    { creativeId: 'cr3', name: 'Gold ring daily', productId: 'P9', spend: 10, revenue: 30, orders: 1 },
  ]
  const match = matchTasksToCreatives(tasks, creatives)
  assert.equal(match.get('t1'), 'cr1')
  assert.equal(match.get('t2'), 'cr2')
  assert.equal(match.has('t3'), false)
  assert.equal(match.has('t4'), false, 'drafts are never matched')
  const report = buildPublishProfit({ tasks, creatives, margins })
  assert.equal(report.byTask.t1!.profit, 11.5)
  assert.equal(report.byTask.t2!.profit, -8.5)
  assert.equal(report.byTask.t5!.profit, undefined, 'product without cost has no profit')
  const a = report.byAccount.find((row) => row.uid === 'a')!
  const b = report.byAccount.find((row) => row.uid === 'b')!
  const c = report.byAccount.find((row) => row.uid === 'c')!
  assert.deepEqual([a.published, a.matched, a.profit], [1, 1, 11.5])
  assert.deepEqual([b.published, b.matched, b.profit], [2, 1, -8.5])
  assert.deepEqual([c.matched, c.profit, c.missingCost], [1, undefined, 1])
  assert.equal(report.byAccount[0]!.uid, 'a', 'most profitable account first')
}

function runwayTests() {
  // ROI falls 3.0 → 1.8 over 7 days (−0.2/day); floor 1.2 → ~3 days left
  const falling = [3, 2.8, 2.6, 2.4, 2.2, 2.0, 1.8].map((roi, i) => ({ statDay: day(6 - i), cost: 100, grossRevenue: roi * 100 }))
  assert.equal(predictRunway(falling, 1.2, NOW), 3)
  assert.equal(predictRunway(falling, 2.5, NOW), 0, 'already below the floor')
  const rising = falling.map((row, i) => ({ ...row, grossRevenue: (1.5 + i * 0.1) * 100 }))
  assert.equal(predictRunway(rising, 1.2, NOW), undefined)
  assert.equal(predictRunway(falling.slice(-3), 1.2, NOW), undefined, 'needs at least 4 days of spend')
  assert.equal(predictRunway(falling, 0, NOW), undefined)

  // Spine: the main creative is tiring → replenish signal with days left against break-even
  const rows = [
    ...falling.map((row) => ({ ...row, campaignId: 'c', creativeId: 'main', creativeName: 'Main hook', orders: 3, productId: 'P1' })),
    ...[1.6, 1.7, 1.6, 1.7, 1.6, 1.7, 1.6].map((roi, i) => ({ statDay: day(6 - i), cost: 30, grossRevenue: roi * 30, campaignId: 'c', creativeId: 'side', creativeName: 'Side', orders: 1, productId: 'P1' })),
  ]
  const ads = summarizeAds(rows, NOW, 1.2)!
  const main = ads.topCreatives.find((item) => item.creativeId === 'main')!
  assert.equal(main.daysLeft, 3)
  const signals = buildSignals({ tiktokProductIds: ['P1'], hasChannelData: true, ads, creators: null, breakEvenRoi: 1.2 })
  const fatigue = signals.find((signal) => signal.key === 'ads_fatigue')!
  assert.equal(fatigue.action, 'replenish')
  assert.equal(fatigue.params.creativeId, 'main')
  assert.equal(fatigue.params.daysLeft, 3)
  assert.equal(fatigue.params.floorKind, 'break_even')

  // Without costs the floor is 70% of the product's average ROI
  const noCost = summarizeAds(rows, NOW)!
  const noCostSignal = buildSignals({ tiktokProductIds: ['P1'], hasChannelData: true, ads: noCost, creators: null }).find((signal) => signal.key === 'ads_fatigue')!
  assert.equal(noCostSignal.params.floorKind, 'average')

  // Profit on the ads summary + the previously dead "losing money" signal now fires
  const margins = new Map([['P1', { marginRate: 0.4, breakEvenRoi: 2.5 }]])
  const withMargin = withProfit(summarizeAds(rows, NOW, 2.5), rows, margins)!
  assert.equal(withMargin.breakEvenRoi, 2.5)
  assert.ok(withMargin.profit! < 0)
  const loss = buildSignals({ tiktokProductIds: ['P1'], hasChannelData: true, ads: withMargin, creators: null, breakEvenRoi: withMargin.breakEvenRoi })
  assert.ok(loss.some((signal) => signal.key === 'ads_unprofitable'))

  // Workbench copy tells how long the creative lasts and asks the AI to replenish from it
  const overview = computeOverview({ rangeDays: 7, now: NOW, content: { items: [], reviews: {}, feedback: [], pendingReviews: 0 }, ads: null, creators: null, inventory: null, products: [{ productId: 'p1', productName: '珍珠耳环', adsSpend: 100, newContent: 1, signals: [{ key: fatigue.key, params: fatigue.params }] }], health: [] } as any)
  const item = overview.problems.find((entry: any) => String(entry.id).startsWith('product.p1.fatigue')) as any
  assert.ok(item, JSON.stringify(overview.problems.map((entry) => entry.id)))
  assert.match(item.title, /约 3 天后撑不住/)
  assert.match(item.aiPrompt, /Main hook/)
}

const margins = marginTests()
publishProfitTests(margins)
runwayTests()
console.log('profit-runway smoke passed')
