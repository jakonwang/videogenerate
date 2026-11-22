import assert from 'node:assert/strict'
import { analyzeShop, decomposeGmv, indicatorPasses, type ShopHealth } from '../src/shared/shopAnalysis'
import { buildReportCard, findingText, reportNotification } from '../src/shared/shopReportText'
import { shiftDate, type SiCodeSummary, type SiShopDay } from '../src/shared/sellerInventory'
import { parseShopHealth } from '../src/main/modules/seller-inventory/parser'
import { buildProfitDays, learnFeeRate, profitTotals } from '../src/shared/shopProfit'

const TODAY = '2026-11-22'

function day(date: string, gmv: number, visitors: number, buyers: number, extra: Partial<SiShopDay> = {}): SiShopDay {
  return { shopKey: 's', date, fetchedAt: 1, gmv, visitors, buyers, orders: buyers, skuOrders: buyers, itemsSold: buyers, impressions: visitors * 30, uniqueImpressions: visitors * 20, conversion: buyers / visitors, aov: gmv / buyers, liveGmv: gmv * 0.1, videoGmv: gmv * 0.8, cardGmv: gmv * 0.1, affiliateLiveGmv: gmv * 0.1, sellerLiveGmv: 0, affiliateVideoGmv: gmv * 0.8, sellerVideoGmv: 0, ...extra }
}

function sku(partial: Partial<SiCodeSummary>): SiCodeSummary {
  return { key: 'A-1', mapped: true, name: 'A', skuKeys: [], unitsToday: 0, amountToday: 0, unitsYesterday: 0, units7: 0, unitsPrev7: 0, amount7: 0, units30: 0, amount30: 0, orders7: 0, avgDaily: 0, stockSource: 'platform', platformStock: 0, reorderPoint: 0, suggestQty: 0, leadDays: 7, safetyDays: 7, risk: 'healthy', tag: 'stable', shops: [], ...partial }
}

function testDecompose() {
  // Visitors halve, conversion and spend per buyer unchanged: the drop is all traffic.
  const split = decomposeGmv({ gmv: 500, visitors: 50, buyers: 5 }, { gmv: 1000, visitors: 100, buyers: 10 })
  assert.ok(split)
  assert.equal(split.driver, 'visitors')
  assert.ok(Math.abs(split.terms.visitors + split.terms.conversion + split.terms.perBuyer - split.total) < 1e-9, 'the three factors add up to the GMV change')
  // Same traffic, fewer buyers: conversion.
  assert.equal(decomposeGmv({ gmv: 600, visitors: 100, buyers: 6 }, { gmv: 1000, visitors: 100, buyers: 10 })?.driver, 'conversion')
  assert.equal(decomposeGmv({ gmv: 0, visitors: 1, buyers: 1 }, { gmv: 1, visitors: 1, buyers: 1 }), null)
}

function testAnalyze() {
  const days: SiShopDay[] = []
  for (let i = 1; i <= 14; i += 1) {
    const date = shiftDate(TODAY, -i)
    // Last 7 days: visitors -40%, conversion stable.
    days.push(i <= 7 ? day(date, 600_000, 600, 30) : day(date, 1_000_000, 1000, 50))
  }
  const health: ShopHealth = {
    shopKey: 's', fetchedAt: 1,
    indicators: [
      { key: 'user_12h_valid_mcs_reply_rate_30d', title: 'Tỷ lệ trả lời trong 12 giờ', value: 0.82, target: 0.85, operator: 'ge', unit: 101, defective: 0 },
      { key: 'IMART_hour_30d', title: 'Thời gian phản hồi trung bình', value: 2.99, target: 1, operator: 'lt', unit: 202, defective: 0 },
      { key: 'compute_non_fbt_late_dispatch_s7d_e1d', title: 'x', value: 0.004, target: 0.04, operator: 'le', unit: 101, defective: 14 },
    ],
    todo: { toShip: 445, urgentToShip: 2, returns: 92, urgentReturns: 3, negativeReviews: 4, outOfStock: 358, rejectedProducts: 0 },
    violationScore: 0, violations: [], warnings: 2,
  }
  const analysis = analyzeShop({
    shopKey: 's', today: TODAY, days, health,
    skus: [sku({ key: 'A-152', risk: 'out', units30: 300, amount30: 3_000_000 }), sku({ key: 'B-2', tag: 'hot', units7: 90, growth7: 1.2 })],
  })
  const keys = analysis.findings.map((item) => item.key)
  assert.ok(keys.includes('gmvDayDown') && keys.includes('gmvWeekDown'))
  assert.equal(analysis.findings.find((item) => item.key === 'gmvWeekDown')?.params.driver, 'visitors')
  assert.equal(analysis.findings.find((item) => item.key === 'gmvWeekDown')?.action, 'traffic')
  assert.ok(keys.includes('affiliateHeavy'), '90% creator GMV')
  assert.equal(analysis.findings.filter((item) => item.key === 'healthFail').length, 2, 'two indicators below target, the passing one is ignored')
  assert.ok(keys.includes('skuOut') && keys.includes('skuHot') && keys.includes('urgentShip') && keys.includes('negativeReviews'))
  assert.equal(analysis.findings[0].level, 'error', 'most severe first')
  assert.match(findingText(analysis.findings.find((item) => item.key === 'skuOut')!, 'zh-CN'), /A-152 已售罄，按之前的销量每天少卖约 100,000/)
  assert.match(findingText(analysis.findings.find((item) => item.key === 'gmvWeekDown')!, 'zh-CN'), /近 7 天 GMV 比前 7 天 -40%，主要是访客 -40%/)
  assert.match(findingText(analysis.findings.find((item) => item.params.indicator === 'IMART_hour_30d')!, 'zh-CN'), /平均回复时长 不达标：3\.0 小时，要求 1\.0 小时/)
  assert.match(findingText(analysis.findings.find((item) => item.params.indicator === 'IMART_hour_30d')!, 'vi-VN'), /Thời gian phản hồi trung bình/)

  const quiet = analyzeShop({ shopKey: 's', today: TODAY, days: days.map((item) => day(item.date, 1_000_000, 1000, 50, { sellerVideoGmv: 400_000, affiliateVideoGmv: 400_000 })), skus: [] })
  assert.deepEqual(quiet.findings.map((item) => item.key), ['allGood'])

  const report = { id: 'r', date: TODAY, createdAt: 1, delivered: {}, shops: [{ shopKey: 's', name: 'ARUA VN', region: 'VN', analysis }] }
  const card = buildReportCard(report, 'zh-CN', '₫')
  const content = JSON.stringify(card)
  assert.match(content, /Klipmill 店铺早报/)
  assert.match(content, /ARUA VN\*\* · 昨天 GMV 600,000₫（比上周同日 -40%）/)
  assert.doesNotMatch(content, /短视频 GMV/, "a channel moving with the whole shop is not repeated")
  assert.match(content, /→ 流量少了/)
  assert.equal(card.card.header.template, 'orange')
  assert.match(reportNotification(report).body, /1 个店铺，\d+ 件事要处理/)

  assert.equal(indicatorPasses({ key: 'k', title: '', target: 1, operator: 'lt', unit: 202, defective: 0 }), true, 'no value yet counts as passing')
}

function testParseHealth() {
  const health = parseShopHealth({
    homeTask: { code: 0, data: { home_cards: [
      { card_title: 'home_task_orders_to_ship_title', card_value: '445', urgent_list: [{ card_value: '2' }] },
      { card_title: 'home_task_pending_return_title', card_value: '92', urgent_list: [{ card_value: '3' }] },
      { card_title: 'home_task_low_stock_title', card_value: '0', urgent_list: [{ card_value: '358' }] },
      { card_title: 'home_task_negative_review_title', card_value: '4' },
    ] } },
    performance: { code: 0, data: { indicators: [{ name: 'a.b.user_12h_valid_mcs_reply_rate_30d', title: 'T', target_value: 0.85, operator: 'ge', value: 0.82, unit: 101 }, { name: 'x.compute_shop_gne_pre_cot_fast_dispatch_rate_s37d_e8d', title: 'no value', target_value: 0.9, operator: 'ge', unit: 101 }] } },
    violation: { code: 0, data: { violation_score: 0, violation_points_v2: [{ violation_type_key: 'k', violation_type_str: 'Tuân thủ', count: 6, violation_score: 0 }], action_needed: { items: [{ title: 'Cảnh báo', num: 2 }] } } },
  }, 's', 5)
  assert.deepEqual(health.todo, { toShip: 445, urgentToShip: 2, returns: 92, urgentReturns: 3, negativeReviews: 4, outOfStock: 358, rejectedProducts: 0 })
  assert.equal(health.indicators[0].key, 'user_12h_valid_mcs_reply_rate_30d')
  assert.equal(health.indicators[1].value, undefined)
  assert.equal(health.warnings, 2)
}

function testProfit() {
  const fee = learnFeeRate(Array.from({ length: 25 }, (_, index) => ({ id: String(index), shopKey: 's', orderId: '', placedAt: 1, placedDate: TODAY, status: 'pending' as const, tradeType: 1, revenue: 200, fees: -50, settlement: 150, shipping: 0 })))
  assert.equal(fee.rate, 0.25)
  assert.equal(learnFeeRate([]).rate, undefined, 'too few orders: no fee rate')
  const days = buildProfitDays({ start: '2026-11-20', end: '2026-11-21', shopDays: [day('2026-11-20', 1000, 100, 10), day('2026-11-21', 2000, 100, 10)], unitsByCode: new Map([['A', new Map([['2026-11-20', 4], ['2026-11-21', 2]])], ['B', new Map([['2026-11-21', 2]])]]), costs: new Map([['A', 50]]), adSpend: new Map([['2026-11-21', 10]]), adRate: 25, feeRate: 0.25 })
  assert.deepEqual(days.map((item) => item.profit), [1000 * 0.75 - 200, 2000 * 0.75 - 100 - 250])
  const totals = profitTotals(days)
  assert.equal(totals.costCoverage, 6 / 8, 'B has no cost: coverage shows it')
  assert.equal(totals.margin, totals.profit / 3000)
  const negative = analyzeShop({ shopKey: 's', today: TODAY, days: [], skus: [], profit: { profit7: -500, margin7: -0.1, adShare7: 0.3, costCoverage: 0.9 } })
  assert.equal(negative.findings[0].key, 'profitNegative')
  assert.equal(negative.findings[0].action, 'adCost')
  const unknownCost = analyzeShop({ shopKey: 's', today: TODAY, days: [], skus: [], profit: { profit7: -500, margin7: -0.1, costCoverage: 0.2 } })
  assert.ok(!unknownCost.findings.some((item) => item.key.startsWith('profit')), 'no profit verdict while most costs are missing')
}

testDecompose()
testProfit()
testAnalyze()
testParseHealth()
console.log('shop-analysis smoke: ok')
