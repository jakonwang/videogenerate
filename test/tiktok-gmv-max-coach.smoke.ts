import assert from 'node:assert/strict'
import { buildFallbackCoachDecision, buildGmvMaxProductProfile, validateCoachDecision } from '../src/main/modules/tiktok-gmv-max/coach'
import type { GmvMaxDailyMetric } from '../src/main/modules/tiktok-gmv-max/types'

const metric = (statDate: string, grossRevenue: number, cost: number, budgetUtilization: number): GmvMaxDailyMetric => ({
  id: statDate,
  campaignId: 'campaign-1',
  advertiserId: 'advertiser-1',
  storeId: 'store-1',
  campaignType: 'PRODUCT',
  statDate,
  cost: String(cost),
  grossRevenue: String(grossRevenue),
  roi: String(cost ? grossRevenue / cost : 0),
  orders: '10',
  budgetUtilization: String(budgetUtilization),
  raw: {},
  syncedAt: Date.now(),
})

const metrics = [
  metric('2026-07-20', 1000, 200, 0.45),
  metric('2026-07-21', 1100, 220, 0.5),
  metric('2026-07-22', 1200, 240, 0.52),
  metric('2026-07-23', 1300, 260, 0.55),
  metric('2026-07-24', 1400, 280, 0.58),
  metric('2026-07-25', 900, 240, 0.6),
  metric('2026-07-26', 950, 240, 0.62),
  metric('2026-07-27', 1050, 240, 0.65),
  metric('2026-07-28', 1150, 240, 0.68),
  metric('2026-07-29', 1250, 240, 0.7),
  metric('2026-07-30', 1350, 240, 0.72),
  metric('2026-07-31', 1450, 240, 0.74),
  metric('2026-08-01', 1500, 240, 0.75),
]

const profile = buildGmvMaxProductProfile({ campaignId: 'campaign-1', storeId: 'store-1', productId: 'product-1', productName: 'Cross earrings', metrics, breakEvenRoi: '2.5', now: Date.parse('2026-08-02T00:00:00Z') })
assert.equal(profile.stage, 'stable')
assert.equal(profile.historicalPeakGmv, '1500')
assert.ok(Number(profile.recoveryRate) > 80)
assert.equal(buildFallbackCoachDecision({ profile }).plan.length, 3)

const singleAnomalyProfile = buildGmvMaxProductProfile({
  campaignId: 'campaign-1',
  storeId: 'store-1',
  productId: 'product-1',
  metrics: [...metrics.slice(0, -1), metric('2026-08-01', 100, 240, 0.75)],
  breakEvenRoi: '2.5',
})
assert.notEqual(singleAnomalyProfile.stage, 'profit_protection')

assert.throws(() => validateCoachDecision({
  value: {
    diagnosis: 'Unsafe change',
    action: 'roi_change',
    targetRoi: '3.0',
    evidence: [{ metric: 'ROI', value: '4', comparison: 'target 4', meaning: 'test' }],
    plan: [{ day: 1, action: 'a', objective: 'b' }, { day: 2, action: 'a', objective: 'b' }, { day: 3, action: 'a', objective: 'b' }],
    guardrails: [],
  },
  profile,
  currentTargetRoi: '2.7',
  currentBudget: '1000',
}), /ROI change exceeds/)

assert.throws(() => validateCoachDecision({
  value: {
    diagnosis: 'Missing evidence',
    action: 'hold',
    plan: [{ day: 1, action: 'a', objective: 'b' }, { day: 2, action: 'a', objective: 'b' }, { day: 3, action: 'a', objective: 'b' }],
    guardrails: [],
  },
  profile,
  currentTargetRoi: '2.7',
  currentBudget: '1000',
}), /evidence is missing/)

assert.throws(() => validateCoachDecision({
  value: {
    diagnosis: 'Invalid evidence',
    action: 'hold',
    evidence: [{ metric: 'ROI', value: '', comparison: 'target', meaning: 'test' }],
    plan: [{ day: 1, action: 'a', objective: 'b' }, { day: 2, action: 'a', objective: 'b' }, { day: 3, action: 'a', objective: 'b' }],
    guardrails: [],
  },
  profile,
  currentTargetRoi: '2.7',
  currentBudget: '1000',
}), /evidence is invalid/)

console.log('TikTok GMV MAX coach smoke tests passed.')
