import assert from 'node:assert/strict'
import { buildGmvMaxCommandCenter } from '../src/main/modules/tiktok-gmv-max/commandCenter'

const now = 1_700_000_000_000

function instance(index: number) {
  return {
    id: `instance-${index}`,
    campaignId: `campaign-${index}`,
    storeId: index === 1 ? 'store-us' : 'store-cn',
    storeName: index === 1 ? 'US Store' : 'CN Store',
    campaignName: `Campaign ${index}`,
    productId: `product-${index}`,
    productName: `Product ${index}`,
    observationDaysRemaining: index === 4 ? 1 : 3,
  }
}

function issue(index: number, severity: 'must_fix' | 'recommended' | 'observing' = 'recommended') {
  return {
    id: `issue-${index}`,
    sopInstanceId: `instance-${index}`,
    campaignId: `campaign-${index}`,
    code: index === 3 ? 'delivery_data_stale' : `issue_${index}`,
    severity,
    actionTarget: 'actions',
    currentValue: '1.8',
    targetValue: '2.0',
  }
}

function recommendation(index: number, status: 'pending' | 'failed' | 'executed' = 'pending') {
  return {
    id: `recommendation-${index}`,
    campaignId: `campaign-${index}`,
    bindingId: `binding-${index}`,
    kind: 'scale_up',
    actionType: 'roi',
    status,
    risk: status === 'failed' ? 'high' : 'medium',
    currentBudget: '100',
    proposedBudget: '120',
    currentRoasBid: '1.8',
    proposedRoasBid: '2.0',
    reason: `Recommendation ${index}`,
    projectedGmvDelta: index === 1 ? '30' : '20',
    projectedNetProfitDelta: index === 1 ? '9' : '5',
    projectionSource: 'modeled',
    confidence: 0.8,
    blockedReasons: [],
    evidence: {},
    createdAt: now + index,
    updatedAt: now + index,
  }
}

const instances = Array.from({ length: 7 }, (_, index) => instance(index))
const issues = [
  issue(0, 'must_fix'),
  issue(1, 'must_fix'),
  issue(2),
  issue(3),
  issue(4, 'observing'),
  issue(5),
  issue(6),
  { ...issue(0), id: 'duplicate-issue-0' },
]
issues[4] = { ...issues[4], interventionId: 'intervention-4' }
const recommendations = [recommendation(0), recommendation(1, 'failed'), recommendation(5, 'executed')]
const commandCenter = buildGmvMaxCommandCenter({
  workspace: {
    instances,
    issueQueue: issues,
    decisions: [
      {
        sopInstanceId: 'instance-0',
        priority: 'P0',
        recommendedAction: 'profit_protection',
        writeAllowed: false,
        blockedReasons: ['profit_guard'],
        confidence: 0.9,
        evaluatedAt: now + 100,
      },
    ],
    interventions: [
      {
        id: 'intervention-4',
        sopInstanceId: 'instance-4',
        status: 'observing',
      },
    ],
    decisionSummary: { total: 1, p0: 1, p1: 0, p2: 0, writeBlocked: 1, activeExperiments: 0 },
    freshnessSummary: { fresh: 6, stale: 1, missing: 0 },
    generatedAt: now,
  } as any,
  recommendations: recommendations as any,
  outcomes: [
    {
      id: 'outcome-5',
      recommendationId: 'recommendation-5',
      campaignId: 'campaign-5',
      measuredAt: now + 200,
      successful: true,
    },
  ] as any,
  campaigns: instances.map((item, index) => ({ id: item.campaignId, bindingId: `binding-${index}` })) as any,
  bindings: instances.map((_, index) => ({ id: `binding-${index}`, currency: index === 1 ? 'USD' : 'CNY' })) as any,
})

assert.equal(commandCenter.topActions.length, 5)
assert.equal(commandCenter.actionSummary.total, 7, 'duplicate campaign and target must be removed')
assert.equal(commandCenter.topActions[0].id, 'issue-0', 'blocked P0 must-fix action must rank first')
assert.ok(commandCenter.topActions.find((item) => item.id === 'issue-1')?.score === 750)
assert.ok(commandCenter.topActions.find((item) => item.id === 'issue-3')?.score === 380)
assert.equal(commandCenter.actionSummary.observing, 1)
assert.equal(commandCenter.resultSummary.observing, 1)
assert.equal(commandCenter.topActions.find((item) => item.id === 'issue-5')?.outcomeId, 'outcome-5')
assert.deepEqual(commandCenter.impactSummaryByCurrency.map((item) => item.currency).sort(), ['CNY', 'USD'])
assert.equal(commandCenter.topActions.find((item) => item.id === 'issue-2')?.projectionSource, 'unavailable')

console.log('[tiktok-gmv-max-command-center] passed', {
  total: commandCenter.actionSummary.total,
  topActions: commandCenter.topActions.length,
  currencies: commandCenter.impactSummaryByCurrency.length,
})
