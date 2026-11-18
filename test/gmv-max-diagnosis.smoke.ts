import assert from 'node:assert/strict'
import {
  DEFAULT_DIAGNOSIS_SETTINGS,
  buildDailyChecklist,
  countCreativeStatuses,
  diagnoseCampaign,
  estimateRoiProtectionCredit,
  summarizeAccount,
  type DiagnosisDay,
  type DiagnosisInput,
} from '../src/main/modules/tiktok-gmv-max/diagnosis'

const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-11-15T10:00:00Z')
const settings = { ...DEFAULT_DIAGNOSIS_SETTINGS, defaultMargin: 0.4 } // break-even ROI 2.5, recommended target 2.875

function days(count: number, day: Partial<DiagnosisDay>): DiagnosisDay[] {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(now - (count - index) * DAY).toISOString().slice(0, 10),
    cost: 100,
    grossRevenue: 400,
    orders: 10,
    budgetUtilization: 0.6,
    targetRoi: 3,
    ...day,
  }))
}

function input(partial: Partial<DiagnosisInput>): DiagnosisInput {
  return {
    campaignId: 'c1',
    campaignName: 'Earrings',
    campaignType: 'PRODUCT',
    operationStatus: 'ENABLE',
    budget: 200,
    targetRoi: 3,
    maxDelivery: false,
    days: days(14, {}),
    changes: [],
    now,
    ...partial,
  }
}

// Three lines
const healthy = diagnoseCampaign(input({}), settings)
assert.equal(healthy.code, 'healthy')
assert.equal(healthy.lines.breakEvenRoi, 2.5)
assert.equal(healthy.lines.recommendedTargetRoi, 2.88)
assert.equal(healthy.lines.actualRoi7d, 4)
assert.equal(healthy.window.profit, 7 * 400 * 0.4 - 700)

// Paused campaign
assert.equal(diagnoseCampaign(input({ operationStatus: 'DISABLE' }), settings).code, 'blocked')

// No spend at all for days with budget → blocked
const noSpend = diagnoseCampaign(input({ days: days(5, { cost: 0, grossRevenue: 0, orders: 0, budgetUtilization: 0 }) }), settings)
assert.equal(noSpend.code, 'blocked')
assert.equal(noSpend.reasonKey, 'no_spend')

// Brand-new campaign → collecting / learning
assert.equal(diagnoseCampaign(input({ days: [] }), settings).code, 'collecting')
assert.equal(diagnoseCampaign(input({ days: days(2, {}) }), settings).code, 'learning')

// Learning after a manual change (2 days ago) — even if losing, don't touch
const learning = diagnoseCampaign(input({ days: days(14, { grossRevenue: 200 }), changes: [{ kind: 'roi', at: now - 2 * DAY, source: 'manual' }] }), settings)
assert.equal(learning.code, 'learning')
assert.equal(learning.learning.daysLeft, 1)

// Learning detected from the report's target ROI history (changed in TikTok directly)
const reportDays = days(14, {})
reportDays[12].targetRoi = 3.5
reportDays[13].targetRoi = 3.5
assert.equal(diagnoseCampaign(input({ days: reportDays }), settings).code, 'learning')

// Losing money with a target below the recommended → raise ROI tomorrow morning
const losing = diagnoseCampaign(input({ targetRoi: 2, days: days(14, { grossRevenue: 200, targetRoi: 2 }) }), settings)
assert.equal(losing.code, 'losing')
assert.equal(losing.action.kind, 'raise_roi')
assert.equal(losing.action.timing, 'morning')
assert.equal(losing.action.to, 2.88)
assert.equal(losing.protection.note, 'raise_voids_today')

// Losing but ROI protection applies today → wait
const protectedToday = diagnoseCampaign(input({ targetRoi: 2, days: days(14, { grossRevenue: 200, targetRoi: 2 }), today: { cost: 100, grossRevenue: 150, orders: 25, asOf: now } }), settings)
assert.equal(protectedToday.code, 'losing')
assert.equal(protectedToday.action.kind, 'none')
assert.equal(protectedToday.protection.note, 'protected_today_wait')

// Losing although the target is already high → review the offer, not the ROI
assert.equal(diagnoseCampaign(input({ targetRoi: 3, days: days(14, { grossRevenue: 200 }) }), settings).action.kind, 'review_offer')

// Not enough evidence to call losing → healthy (low volume)
assert.notEqual(diagnoseCampaign(input({ days: days(14, { grossRevenue: 200, orders: 0 }) }), { ...settings }).code, 'losing')

// Under-spend with ROI on target → lower ROI 10%, never below break-even × 1.05
const under = diagnoseCampaign(input({ days: days(14, { budgetUtilization: 0.3 }) }), settings)
assert.equal(under.code, 'underspend')
assert.equal(under.action.kind, 'lower_roi')
assert.equal(under.action.to, 2.7)
const underFloor = diagnoseCampaign(input({ targetRoi: 2.8, days: days(14, { budgetUtilization: 0.3, targetRoi: 2.8 }) }), settings)
assert.equal(underFloor.action.to, 2.63, 'never lower below break-even x 1.05')
const atFloor = diagnoseCampaign(input({ targetRoi: 2.6, days: days(14, { budgetUtilization: 0.3, targetRoi: 2.6 }) }), settings)
assert.equal(atFloor.reasonKey, 'underspend_at_floor', 'at the floor the answer is creatives, not a lower ROI')

// Budget almost fully used and ROI on target → +30% budget
const scale = diagnoseCampaign(input({ days: days(14, { budgetUtilization: 0.95 }) }), settings)
assert.equal(scale.code, 'scale')
assert.equal(scale.action.kind, 'raise_budget')
assert.equal(scale.action.to, 260)

// Creative supply: blocked creatives / too few delivering
const creatives = countCreativeStatuses(['DELIVERING', 'DELIVERING', 'AUTHORIZATION_NEEDED', 'REJECTED', 'NOT_DELIVERYING', 'LEARNING'])
assert.equal(creatives.authorizationNeeded, 1)
assert.equal(creatives.notDelivering, 1)
const creativeDiag = diagnoseCampaign(input({ creatives }), settings)
assert.equal(creativeDiag.code, 'creatives')
assert.equal(creativeDiag.reasonKey, 'creatives_blocked')
const noLive = diagnoseCampaign(input({ creatives: countCreativeStatuses(['REJECTED', 'UNAVAILABLE']) }), settings)
assert.equal(noLive.code, 'blocked')
assert.equal(noLive.reasonKey, 'no_creatives')

// Margin missing → no break-even line, no "losing" verdicts
const noMargin = diagnoseCampaign(input({ targetRoi: 2, days: days(14, { grossRevenue: 200, targetRoi: 2 }) }), DEFAULT_DIAGNOSIS_SETTINGS)
assert.equal(noMargin.marginSource, 'missing')
assert.notEqual(noMargin.code, 'losing')

// ROI protection credit (official worked example: targets 10/5 → daily 7.5, cost 60, GMV 300 → 15.56)
assert.equal(estimateRoiProtectionCredit({ cost: 60, grossRevenue: 300, orders: 30, targetRoi: 7.5 }), 15.56)
assert.equal(estimateRoiProtectionCredit({ cost: 60, grossRevenue: 300, orders: 20, targetRoi: 7.5 }), 0, 'needs more than 20 orders')

// Checklist ordering: blockers, losing, scale, under-spend; learning/healthy excluded
const list = buildDailyChecklist([healthy, scale, losing, under, learning, noSpend])
assert.deepEqual(list.map((item) => item.code).slice(0, 2), ['blocked', 'losing'])
assert.ok(list[2].impactPerDay >= list[3].impactPerDay, 'remaining actions ranked by money impact')
assert.deepEqual(new Set(list.slice(2).map((item) => item.code)), new Set(['scale', 'underspend']))
const summary = summarizeAccount([healthy, scale, losing])
assert.equal(summary.counts.losing, 1)
assert.ok(summary.profit7d !== null)

console.log('gmv-max diagnosis smoke: ok')
