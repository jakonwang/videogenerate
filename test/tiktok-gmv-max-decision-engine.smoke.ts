import assert from 'node:assert/strict'
import { buildGmvMaxRoiUnlockExperiment, evaluateGmvMaxRoiUnlockExperiment } from '../src/main/modules/tiktok-gmv-max/experimentEngine'
import { evaluateGmvMaxDecision } from '../src/main/modules/tiktok-gmv-max/decisionEngine'
import type { GmvMaxDailyMetric, GmvMaxProfitGuard } from '../src/main/modules/tiktok-gmv-max/types'

const instance: any = {
  id: 'sop-1', campaignId: 'campaign-1', bindingId: 'binding-1', storeId: 'store-1', campaignType: 'PRODUCT', productId: 'product-1', productName: 'Cross earring', track: 'mature_product', targetRoi: '5', profitFloor: '3.2',
  metrics: { spend: '100', gmv: '600', roi: '6', orders: '20' },
  matureAssessment: { dataFreshness: 'fresh', dataCoverage: '1', budgetUtilization: '0.18', velocityIndex: '0.9', recent7d: { spend: '100', gmv: '600', roi: '6', orders: '20', deliveryDays: 7, reportedDays: 7 }, previous7d: { spend: '98', gmv: '588', roi: '6', orders: '20', deliveryDays: 7, reportedDays: 7 } },
}
const guard: GmvMaxProfitGuard = { complete: true, contributionMarginRate: '0.5', breakEvenRoi: '3.2', effectiveRoiFloor: '3.2' }

const unlock = evaluateGmvMaxDecision({ instance, profitGuard: guard, creativeSpend: [20, 15, 10, 8, 7, 6, 5, 4, 3, 2, 1], campaignProductCount: 1 })
assert.equal(unlock.status, 'S3')
assert.equal(unlock.recommendedAction, 'roi_unlock')
assert.equal(unlock.priority, 'P0')
assert.equal(unlock.writeAllowed, true)

const experiment = buildGmvMaxRoiUnlockExperiment({ sopInstanceId: 'sop-1', campaignId: 'campaign-1', currentTargetRoi: 6, profitFloor: 3.2, actionDate: '2026-08-01' })
assert.ok(experiment)
assert.equal(experiment?.state, 'pending_approval')
assert.equal(experiment?.proposedTargetRoi, '5.52')

const metrics = (rows: Array<[string, number, number]>): GmvMaxDailyMetric[] => rows.map(([statDate, cost, grossRevenue], index) => ({ id: `metric-${index}`, campaignId: 'campaign-1', advertiserId: 'adv-1', storeId: 'store-1', campaignType: 'PRODUCT', statDate, cost: String(cost), grossRevenue: String(grossRevenue), roi: String(cost ? grossRevenue / cost : 0), orders: '5', budgetUtilization: '0.5', raw: {}, syncedAt: Date.now() }))
const successful = evaluateGmvMaxRoiUnlockExperiment({ experiment: { ...experiment!, state: 'observing', actionDate: '2026-08-01' }, actionDate: '2026-08-01', profitFloor: 3.2, metrics: metrics([['2026-07-29', 100, 500], ['2026-07-30', 100, 500], ['2026-07-31', 100, 500], ['2026-08-02', 120, 700], ['2026-08-03', 120, 700], ['2026-08-04', 120, 700]]) })
assert.equal(successful.state, 'success')
assert.equal(successful.marginalRoi, '10')

const failed = evaluateGmvMaxRoiUnlockExperiment({ experiment: { ...experiment!, state: 'observing', actionDate: '2026-08-01' }, actionDate: '2026-08-01', profitFloor: 3.2, metrics: metrics([['2026-07-29', 100, 500], ['2026-07-30', 100, 500], ['2026-07-31', 100, 500], ['2026-08-02', 120, 510], ['2026-08-03', 120, 510], ['2026-08-04', 120, 510]]) })
assert.equal(failed.state, 'rollback_pending')
assert.ok(failed.resultReasonCodes.includes('spend_increased_without_gmv'))

const neutralRows = metrics([['2026-07-29', 100, 500], ['2026-07-30', 100, 500], ['2026-07-31', 100, 500], ['2026-08-02', 102, 510], ['2026-08-03', 102, 510], ['2026-08-04', 102, 510]])
const neutral = evaluateGmvMaxRoiUnlockExperiment({ experiment: { ...experiment!, state: 'observing', actionDate: '2026-08-01' }, actionDate: '2026-08-01', profitFloor: 3.2, metrics: neutralRows })
assert.equal(neutral.state, 'neutral')
assert.equal(neutral.neutralExtensionDays, 1)
const unchangedNeutral = evaluateGmvMaxRoiUnlockExperiment({ experiment: neutral, actionDate: '2026-08-01', profitFloor: 3.2, metrics: neutralRows })
assert.deepEqual(unchangedNeutral, neutral)
const extendedNeutral = evaluateGmvMaxRoiUnlockExperiment({ experiment: neutral, actionDate: '2026-08-01', profitFloor: 3.2, metrics: [...neutralRows, ...metrics([['2026-08-05', 102, 510]])] })
assert.equal(extendedNeutral.neutralExtensionDays, 2)

const multiProduct = evaluateGmvMaxDecision({ instance, profitGuard: guard, creativeSpend: [20, 15, 10, 8, 7, 6, 5, 4, 3, 2, 1], campaignProductCount: 2 })
assert.equal(multiProduct.status, 'S3')
assert.equal(multiProduct.writeAllowed, false)
assert.ok(multiProduct.blockedReasons.includes('multi_product_campaign'))

const profitRisk = evaluateGmvMaxDecision({ instance, profitGuard: { ...guard, breakEvenRoi: '6.5' }, creativeSpend: [20, 15, 10, 8, 7, 6, 5, 4, 3, 2, 1], campaignProductCount: 1 })
assert.equal(profitRisk.status, 'S4')
assert.equal(profitRisk.recommendedAction, 'profit_protection')
assert.equal(profitRisk.priority, 'P0')

console.log('tiktok-gmv-max-decision-engine smoke passed')
