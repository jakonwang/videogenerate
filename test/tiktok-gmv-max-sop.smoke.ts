import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { advanceGmvMaxSopInterventionObservation, buildGmvMaxAutomaticSopInstance, buildGmvMaxDailySopTasks, buildGmvMaxMatureAssessment, buildGmvMaxProductDailyMetrics, buildGmvMaxSopAutomationRunId, buildGmvMaxSopInterventionOutcome, buildGmvMaxSopMetricSummary, calculateGmvMaxLiveScore, classifyGmvMaxCreativeGrade, completeEvidenceBackedGmvMaxSopTasks, countGmvMaxObservedDeliveryDays, detectGmvMaxSopTrack, evaluateGmvMaxSopInstance, GMV_MAX_MATURE_CREATIVE_MIX, GMV_MAX_SOP_AUTOMATION_RETRY_MS, GMV_MAX_WINNER_DRAFT_RETRY_MS, planGmvMaxSopAutomation, selectGmvMaxAutomaticSopProductCandidate, shouldCreateGmvMaxSopRollback, shouldRetryGmvMaxWinnerDraft, shouldRunGmvMaxSopAutomation, supersedeExpiredGmvMaxSopTasks, supersedeGmvMaxSopAutomationTasks } from '../src/main/modules/tiktok-gmv-max/sop'
import { defaultGmvMaxPolicy } from '../src/main/modules/tiktok-gmv-max/optimizer'
import { buildGmvMaxSopIssueResolutions, GMV_MAX_ISSUE_CODES, isGmvMaxSopTaskApplicable } from '../src/main/modules/tiktok-gmv-max/resolutions'
import type { GmvMaxCreativeInsight, GmvMaxDailyMetric, GmvMaxProfitGuard, GmvMaxSopInstance, GmvMaxSupplementalMetric } from '../src/main/modules/tiktok-gmv-max/types'

const campaignId = 'campaign-sop'
const dailyMetrics: GmvMaxDailyMetric[] = Array.from({ length: 7 }, (_, index) => ({
  id: `metric-${index}`,
  campaignId,
  advertiserId: 'advertiser-1',
  storeId: 'store-1',
  campaignType: 'PRODUCT',
  statDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
  cost: '50',
  grossRevenue: '200',
  roi: '4',
  orders: '5',
  budgetUtilization: '0.9',
  raw: {},
  syncedAt: Date.UTC(2026, 6, index + 2),
}))
const winner: GmvMaxCreativeInsight = {
  id: 'insight-1', campaignId, storeId: 'store-1', creativeId: 'creative-1', source: 'owned', state: 'winner', score: 90,
  daysObserved: 3, lastActiveDate: '2026-07-07', spend: '100', orders: '8', recentRoi: '4', previousRoi: '3.5', roiTrendPercent: '10', ctrTrendPercent: '5', signals: [], analyzedAt: Date.UTC(2026, 6, 8),
}
const supplemental: GmvMaxSupplementalMetric = {
  id: 'supplemental-1', campaignId, storeId: 'store-1', statDate: '2026-07-07', source: 'manual',
  refundAmount: '10', liveUv: '100', liveStayRate: '50', productClicks: '20', orders: '10', paidOrders: '8', updatedAt: Date.UTC(2026, 6, 8),
}
const profitGuard: GmvMaxProfitGuard = {
  complete: true, contributionMarginRate: '0.6', breakEvenRoi: '1.6667', effectiveRoiFloor: '2',
}

async function verifyDeclinedInterventionRollbackIntegration() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'gmv-max-sop-rollback-'))
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  const { gmvMaxRepo, closeGmvMaxSqlite } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  const { gmvMaxService } = await import('../src/main/modules/tiktok-gmv-max/service')
  const now = Date.UTC(2026, 6, 31, 12)
  try {
    gmvMaxRepo.saveBinding({ id: 'rollback-binding', connectionId: 'rollback-connection', advertiserId: 'rollback-advertiser', advertiserName: 'Rollback advertiser', timezone: 'UTC', storeId: 'rollback-store', storeName: 'Rollback store', campaignType: 'PRODUCT', active: true, updatedAt: now })
    gmvMaxRepo.saveCampaign({ id: 'rollback-campaign', bindingId: 'rollback-binding', advertiserId: 'rollback-advertiser', storeId: 'rollback-store', name: 'Rollback campaign', campaignType: 'PRODUCT', operationStatus: 'ACTIVE', budget: '100', roasBid: '2.1', promotionDaysEnabled: false, lastSyncedAt: now, raw: {} })
    gmvMaxRepo.saveSopInstance({ id: 'rollback-instance', bindingId: 'rollback-binding', campaignId: 'rollback-campaign', storeId: 'rollback-store', campaignType: 'PRODUCT', startDate: '2026-01-01', phase: 'single_variable_repair', status: 'active', currentDay: 200, blockers: [], track: 'mature_product', trackSource: 'manual', trackOverrideReason: 'Integration fixture', automationEnabled: true, automationMode: 'draft_actions', observationStartedDate: '2026-07-03', observationLockUntil: 'three_complete_delivery_days', createdAt: now, updatedAt: now })
    for (let index = 0; index < 6; index += 1) {
      const before = index < 3
      gmvMaxRepo.saveMetric({ id: `rollback-metric-${index}`, campaignId: 'rollback-campaign', advertiserId: 'rollback-advertiser', storeId: 'rollback-store', campaignType: 'PRODUCT', statDate: `2026-07-0${index + 1}`, cost: '50', grossRevenue: before ? '200' : '100', roi: before ? '4' : '2', orders: before ? '5' : '2', budgetUtilization: '0.9', raw: {}, syncedAt: now + index })
    }
    gmvMaxRepo.saveRecommendation({ id: 'rollback-source-recommendation', campaignId: 'rollback-campaign', bindingId: 'rollback-binding', kind: 'scale_up', actionType: 'roi', status: 'executed', risk: 'low', preset: 'balanced', currentBudget: '100', proposedBudget: '100', currentRoasBid: '2', proposedRoasBid: '2.1', reason: 'Integration source intervention.', projectionSource: 'unavailable', actionPayload: {}, reversible: true, rollbackPayload: {}, shadow: false, evidence: { startDate: '2026-07-01', endDate: '2026-07-03', metricIds: [], consecutiveDays: 3, totalOrders: '15', averageRoi: '4', averageBudgetUtilization: '0.9', targetRoi: '2' }, autoExecutable: false, idempotencyKey: 'rollback-source-recommendation', createdAt: now, updatedAt: now, executedAt: now })
    gmvMaxRepo.saveSopIntervention({ id: 'rollback-source-intervention', sopInstanceId: 'rollback-instance', campaignId: 'rollback-campaign', kind: 'roi', variable: 'target_roi', beforeValue: '2', proposedValue: '2.1', recommendationId: 'rollback-source-recommendation', executionMode: 'approval', status: 'observing', startedDate: '2026-07-03', requiredDeliveryDays: 3, observedDeliveryDays: 0, createdAt: now, updatedAt: now })

    await gmvMaxService.getSopWorkspace()
    await gmvMaxService.runSopAutomation({ sopInstanceId: 'rollback-instance' })
    await gmvMaxService.getSopWorkspace()
    const interventions = gmvMaxRepo.listSopInterventions()
    const source = interventions.find((item) => item.id === 'rollback-source-intervention')
    const rollback = interventions.find((item) => item.rollbackOfInterventionId === source?.id)
    assert.equal(source?.status, 'completed')
    assert.equal(source?.outcomeMetrics?.verdict, 'declined')
    assert.equal(rollback?.status, 'draft')
    assert.equal(rollback?.beforeValue, '2.1')
    assert.equal(rollback?.proposedValue, '2')
    assert.equal(interventions.filter((item) => item.rollbackOfInterventionId === source?.id).length, 1)
    const rollbackRecommendation = gmvMaxRepo.listRecommendations().find((item) => item.id === rollback?.recommendationId)
    assert.equal(rollbackRecommendation?.status, 'pending')
    assert.equal(rollbackRecommendation?.currentRoasBid, '2.1')
    assert.equal(rollbackRecommendation?.proposedRoasBid, '2')
    assert.equal(gmvMaxRepo.getSopTask(rollback?.taskId || '')?.status, 'pending')
  } finally {
    closeGmvMaxSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(dataDir, { recursive: true, force: true })
  }
}

async function verifyExternalOperationAndInterruptedSyncIntegration() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'gmv-max-sop-external-'))
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  const { gmvMaxRepo, closeGmvMaxSqlite } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  const { gmvMaxService } = await import('../src/main/modules/tiktok-gmv-max/service')
  const now = Date.now()
  try {
    gmvMaxRepo.saveBinding({ id: 'external-binding', connectionId: 'external-connection', advertiserId: 'external-advertiser', advertiserName: 'External advertiser', timezone: 'UTC', storeId: 'external-store', storeName: 'External store', campaignType: 'PRODUCT', active: true, updatedAt: now })
    gmvMaxRepo.saveCampaign({ id: 'external-campaign', bindingId: 'external-binding', advertiserId: 'external-advertiser', storeId: 'external-store', name: 'External campaign', campaignType: 'PRODUCT', operationStatus: 'ACTIVE', budget: '100', roasBid: '3', promotionDaysEnabled: false, lastSyncedAt: now, raw: {} })
    gmvMaxRepo.saveSopInstance({ id: 'external-instance', bindingId: 'external-binding', campaignId: 'external-campaign', storeId: 'external-store', campaignType: 'PRODUCT', productId: 'external-product', startDate: '2026-01-01', phase: 'recovery_diagnosis', status: 'active', currentDay: 180, blockers: [], track: 'mature_product', trackSource: 'manual', trackOverrideReason: 'Integration fixture', createdAt: now, updatedAt: now })
    gmvMaxRepo.saveSopTask({ id: 'external-task', sopInstanceId: 'external-instance', campaignId: 'external-campaign', localDate: '2026-07-31', scheduledTime: '14:00', kind: 'external_operation', title: 'Seller Center single-variable intervention', description: 'Record the product budget.', resolutionCode: 'external_manual_intervention', executionMode: 'manual_external', status: 'pending', createdAt: now, updatedAt: now })
    gmvMaxRepo.saveSopIntervention({ id: 'external-intervention', sopInstanceId: 'external-instance', campaignId: 'external-campaign', productId: 'external-product', kind: 'other', variable: 'product_budget', taskId: 'external-task', executionMode: 'manual_external', status: 'draft', requiredDeliveryDays: 3, observedDeliveryDays: 0, createdAt: now, updatedAt: now })
    await assert.rejects(() => gmvMaxService.completeSopTask({ id: 'external-task' }), /must be completed with the recorded Seller Center value/)
    await assert.rejects(() => gmvMaxService.recordExternalSopIntervention({ id: 'external-intervention', actualValue: '', evidenceNote: '' }), /actual Seller Center value is required/)
    const recorded = await gmvMaxService.recordExternalSopIntervention({ id: 'external-intervention', startedDate: '2026-07-31', actualValue: '120', evidenceNote: 'Seller Center product budget changed from 100 to 120.', screenshotRef: 'proof-1', evidenceAttachment: { path: 'managed-proof.png', name: 'proof.png', size: 42, sha256: 'proof-sha', importedAt: now } })
    assert.equal(recorded.status, 'pending_verification')
    assert.equal(recorded.actualValue, '120')
    assert.equal(recorded.evidenceNote, 'Seller Center product budget changed from 100 to 120.')
    assert.equal(recorded.evidenceAttachment?.sha256, 'proof-sha')
    assert.equal(gmvMaxRepo.getSopTask('external-task')?.status, 'pending')
    const pendingWorkspace = await gmvMaxService.getSopWorkspace()
    assert.ok(pendingWorkspace.issueQueue.some((item) => item.code === 'external_verification_pending'))
    assert.ok(pendingWorkspace.reminders.some((item) => item.kind === 'verification'))
    await assert.rejects(() => gmvMaxService.verifyExternalSopIntervention({ id: 'external-intervention', verified: true, verificationNote: '' }), /verification evidence is required/)
    const verified = await gmvMaxService.verifyExternalSopIntervention({ id: 'external-intervention', verified: true, platformValue: '120', verificationNote: 'Seller Center still shows product budget 120.' })
    assert.equal(verified.status, 'observing')
    assert.equal(verified.verificationStatus, 'verified')
    assert.equal(gmvMaxRepo.getSopTask('external-task')?.status, 'completed')
    assert.equal(gmvMaxRepo.getSopInstance('external-instance')?.observationLockUntil, 'three_complete_delivery_days')
    gmvMaxRepo.saveSyncJob({ jobId: 'stale-sync', action: 'data', status: 'running', phase: 'delivery', message: 'Running', current: 1, total: 4, progress: 20, startedAt: now - 600_000, updatedAt: now - 600_000 })
    const workspace = await gmvMaxService.getSopWorkspace()
    assert.equal(workspace.latestSyncJob?.status, 'interrupted')
  } finally {
    closeGmvMaxSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(dataDir, { recursive: true, force: true })
  }
}
const instance: GmvMaxSopInstance = {
  id: 'sop-1', bindingId: 'binding-1', campaignId, storeId: 'store-1', campaignType: 'PRODUCT', productId: 'hero-1', productName: 'Hero 1',
  startDate: '2026-07-01', phase: 'preparation', status: 'active', currentDay: 0, blockers: [], createdAt: Date.UTC(2026, 6, 1), updatedAt: Date.UTC(2026, 6, 1),
}

async function main() {
  assert.equal(calculateGmvMaxLiveScore(supplemental), '31')
  assert.equal(calculateGmvMaxLiveScore({ ...supplemental, liveUv: '0' }), undefined)

  const summary = buildGmvMaxSopMetricSummary({
    dailyMetrics,
    creativeMetrics: [{
      id: 'creative-metric-1', campaignId, storeId: 'store-1', creativeId: 'creative-1', source: 'owned', statDate: '2026-07-07', cost: '100', grossRevenue: '400', roi: '4', orders: '8', cpa: '12.5', ctr: '0.2', conversionRate: '0.4', productImpressions: '100', productClicks: '20', playDepth: '0.3', raw: {}, syncedAt: Date.UTC(2026, 6, 8),
    }],
    creativeInsights: [winner],
    supplementalMetrics: [supplemental],
    contributionMarginRate: profitGuard.contributionMarginRate,
  })
  assert.equal(summary.completeDays, 7)
  assert.equal(summary.consecutiveProfitableDays, 7)
  assert.equal(summary.winningCreativeCount, 1)
  assert.equal(summary.liveScore, '31')
  assert.equal(summary.netGmv, '1390')
  assert.equal(summary.netRoi, '3.9714')

  const zeroDeliverySummary = buildGmvMaxSopMetricSummary({
    dailyMetrics: [...dailyMetrics, { ...dailyMetrics[0], id: 'zero-1', statDate: '2026-07-08', cost: '0', grossRevenue: '0', orders: '0' }],
    creativeMetrics: [], creativeInsights: [], supplementalMetrics: [], contributionMarginRate: '0.6',
  })
  assert.equal(zeroDeliverySummary.consecutiveProfitableDays, 0)

  const productDaily = buildGmvMaxProductDailyMetrics({
    campaignId,
    storeId: 'store-1',
    metrics: [
      { id: 'product-a', campaignId, storeId: 'store-1', creativeId: 'creative-a', itemGroupId: 'hero-1', source: 'owned', statDate: '2026-07-01', cost: '20', grossRevenue: '80', roi: '4', orders: '2', cpa: '10', ctr: '0.1', playDepth: '0.2', raw: {}, syncedAt: 1 },
      { id: 'product-b', campaignId, storeId: 'store-1', creativeId: 'creative-b', itemGroupId: 'hero-1', source: 'owned', statDate: '2026-07-01', cost: '30', grossRevenue: '120', roi: '4', orders: '3', cpa: '10', ctr: '0.1', playDepth: '0.2', raw: {}, syncedAt: 2 },
    ],
  })
  assert.equal(productDaily.length, 1)
  assert.equal(productDaily[0].cost, '50')
  assert.equal(productDaily[0].grossRevenue, '200')
  assert.equal(productDaily[0].orders, '5')

  const policy = { ...defaultGmvMaxPolicy(campaignId), minCompleteDays: 3, minOrders: 3, minRoi: '2', minExplorationCreatives: 1 }
  const scaling = evaluateGmvMaxSopInstance({ instance, localDate: '2026-07-08', policy, profitGuard, metrics: summary, creativeCount: 1 })
  assert.equal(scaling.phase, 'scaling')
  assert.equal(scaling.status, 'active')
  assert.equal(scaling.currentDay, 8)

  const matureSummary = { ...summary, completeDays: 33, consecutiveProfitableDays: 33, orders: '1012', roi: '4.6', estimatedNetProfit: '4000', winningCreativeCount: 5 }
  const mature = evaluateGmvMaxSopInstance({ instance: { ...instance, startDate: '2026-07-31' }, localDate: '2026-07-31', policy, profitGuard, metrics: matureSummary, creativeCount: 5 })
  assert.equal(mature.currentDay, 33)
  assert.equal(mature.phase, 'steady')
  assert.equal(mature.status, 'active')

  const newProduct = evaluateGmvMaxSopInstance({ instance: { ...instance, startDate: '2026-07-31' }, localDate: '2026-07-31', policy, profitGuard, metrics: { ...summary, completeDays: 1, consecutiveProfitableDays: 1 }, creativeCount: 1 })
  assert.equal(newProduct.currentDay, 1)
  assert.equal(newProduct.phase, 'cold_start')

  const losingMature = evaluateGmvMaxSopInstance({ instance: { ...instance, startDate: '2026-07-31' }, localDate: '2026-07-31', policy, profitGuard, metrics: { ...matureSummary, roi: '1', netRoi: '1', estimatedNetProfit: '-100' }, creativeCount: 5 })
  assert.equal(losingMature.currentDay, 33)
  assert.equal(losingMature.status, 'blocked')
  assert.ok(losingMature.blockers.includes('roi_below_profit_floor'))

  const blocked = evaluateGmvMaxSopInstance({ instance, localDate: '2026-07-08', policy, profitGuard, metrics: { ...summary, winningCreativeCount: 0 }, creativeCount: 1 })
  assert.equal(blocked.phase, 'cold_start')
  assert.equal(blocked.status, 'blocked')
  assert.ok(blocked.blockers.includes('winner_missing'))

  const currentProductDaily: GmvMaxDailyMetric[] = Array.from({ length: 30 }, (_, index) => {
    const delivered = index < 16
    return {
      ...dailyMetrics[0], id: `current-${index}`, statDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
      cost: delivered ? String(9_351_330 / 16) : '0', grossRevenue: delivered ? String(43_028_065 / 16) : '0', orders: delivered ? String(1012 / 16) : '0',
    }
  })
  const currentSummary = buildGmvMaxSopMetricSummary({ dailyMetrics: currentProductDaily, creativeMetrics: [], creativeInsights: [winner], supplementalMetrics: [], contributionMarginRate: '0.6' })
  const detection = detectGmvMaxSopTrack({ campaignType: 'PRODUCT', localDate: '2026-07-31', startDate: '2026-07-01', dailyMetrics: currentProductDaily, cumulativeOrders: 1012 })
  assert.equal(detection.track, 'mature_product')
  assert.deepEqual(detection.evidence.matchedRules, ['age_30_days', 'delivery_14_days', 'orders_100'])
  const currentAssessment = buildGmvMaxMatureAssessment({ instance, localDate: '2026-07-31', campaignStatus: 'DISABLE', dailyMetrics: currentProductDaily, supplementalMetrics: [], metrics: currentSummary, profitFloor: 2.68, targetRoi: 6.6 })
  assert.equal(currentAssessment.state, 'dormant_recovery')
  assert.equal(currentAssessment.lastDeliveryDate, '2026-07-16')
  assert.equal(currentAssessment.writeActionsAllowed, false)
  const currentEvaluation = evaluateGmvMaxSopInstance({ instance, localDate: '2026-07-31', policy, profitGuard, metrics: currentSummary, creativeCount: 5, trackDetection: detection, matureAssessment: currentAssessment })
  assert.equal(currentEvaluation.track, 'mature_product')
  assert.equal(currentEvaluation.phase, 'recovery_diagnosis')
  assert.equal(currentEvaluation.matureState, 'dormant_recovery')
  assert.equal(GMV_MAX_MATURE_CREATIVE_MIX.protectedWinners, 0.25)
  assert.equal(planGmvMaxSopAutomation({ track: 'mature_product', phase: 'recovery_diagnosis', matureState: 'dormant_recovery', automationMode: 'draft_actions', writeActionsAllowed: false, consecutiveProfitableDays: 0 }).kind, 'recovery_task')
  assert.equal(planGmvMaxSopAutomation({ track: 'mature_product', phase: 'single_variable_repair', matureState: 'quality_decay', automationMode: 'draft_actions', writeActionsAllowed: true, consecutiveProfitableDays: 1 }).kind, 'roi_approval_draft')
  assert.equal(planGmvMaxSopAutomation({ track: 'mature_product', phase: 'controlled_scaling', matureState: 'scale_ready', automationMode: 'draft_actions', writeActionsAllowed: true, consecutiveProfitableDays: 2 }).kind, 'profit_observation_task')
  assert.equal(planGmvMaxSopAutomation({ track: 'mature_product', phase: 'controlled_scaling', matureState: 'scale_ready', automationMode: 'draft_actions', writeActionsAllowed: true, consecutiveProfitableDays: 3 }).kind, 'auto_budget_external')
  assert.equal(planGmvMaxSopAutomation({ track: 'mature_product', phase: 'single_variable_repair', matureState: 'velocity_constrained', automationMode: 'diagnostic_only', writeActionsAllowed: true, consecutiveProfitableDays: 3 }).kind, 'diagnostic_task')
  assert.equal(planGmvMaxSopAutomation({ track: 'new_product', phase: 'cold_start', automationMode: 'draft_actions', writeActionsAllowed: false, consecutiveProfitableDays: 0 }).kind, 'new_product_cold_start_task')
  assert.equal(planGmvMaxSopAutomation({ track: 'new_product', phase: 'scaling', automationMode: 'draft_actions', writeActionsAllowed: false, consecutiveProfitableDays: 2, blockers: ['three_profitable_days_required'] }).kind, 'blocker_resolution_task')
  assert.equal(planGmvMaxSopAutomation({ track: 'live', phase: 'scaling', automationMode: 'draft_actions', writeActionsAllowed: false, consecutiveProfitableDays: 3 }).kind, 'live_growth_task')
  const failedAt = Date.UTC(2026, 6, 31, 9)
  const supersededTasks = supersedeGmvMaxSopAutomationTasks([
    { id: 'old-task', sopInstanceId: instance.id, campaignId, localDate: '2026-07-31', scheduledTime: '09:00', kind: 'sop_automation', title: 'Old', description: 'Old', executionMode: 'review', status: 'pending', createdAt: failedAt, updatedAt: failedAt },
    { id: 'current-task', sopInstanceId: instance.id, campaignId, localDate: '2026-07-31', scheduledTime: '09:00', kind: 'sop_automation', title: 'Current', description: 'Current', executionMode: 'review', status: 'pending', createdAt: failedAt, updatedAt: failedAt },
    { id: 'daily-task', sopInstanceId: instance.id, campaignId, localDate: '2026-07-31', scheduledTime: '10:00', kind: 'creative_review', title: 'Daily', description: 'Daily', executionMode: 'review', status: 'pending', createdAt: failedAt, updatedAt: failedAt },
  ], 'current-task', failedAt + 1)
  assert.equal(supersededTasks.length, 1)
  assert.equal(supersededTasks[0].id, 'old-task')
  assert.equal(supersededTasks[0].status, 'superseded')
  assert.equal(supersedeGmvMaxSopAutomationTasks([
    { id: 'rollback-review', sopInstanceId: instance.id, campaignId, localDate: '2026-07-31', scheduledTime: '09:00', kind: 'sop_automation', title: 'Rollback', description: 'Rollback', executionMode: 'review', status: 'pending', createdAt: failedAt, updatedAt: failedAt },
  ], 'current-task', failedAt + 1, ['rollback-review']).length, 0)
  const expiredTasks = supersedeExpiredGmvMaxSopTasks([
    { id: 'expired-review', sopInstanceId: instance.id, campaignId, localDate: '2026-07-30', scheduledTime: '09:00', kind: 'data_review', title: 'Review', description: 'Review', executionMode: 'review', status: 'pending', createdAt: failedAt, updatedAt: failedAt },
    { id: 'kept-external', sopInstanceId: instance.id, campaignId, localDate: '2026-07-30', scheduledTime: '14:00', kind: 'external_operation', title: 'External', description: 'External', executionMode: 'manual_external', status: 'pending', createdAt: failedAt, updatedAt: failedAt },
  ], '2026-07-31', failedAt + 1)
  assert.equal(expiredTasks.length, 1)
  assert.equal(expiredTasks[0].id, 'expired-review')
  const interventionOutcome = buildGmvMaxSopInterventionOutcome(dailyMetrics.map((item, index) => index >= 3 && index <= 5 ? { ...item, grossRevenue: '250' } : item), '2026-07-03', 3)
  assert.equal(interventionOutcome?.before.deliveryDays, 3)
  assert.equal(interventionOutcome?.after.deliveryDays, 3)
  assert.equal(interventionOutcome?.verdict, 'improved')
  assert.equal(interventionOutcome?.roiChangePercent, '25.00')
  const duplicateDateOutcome = buildGmvMaxSopInterventionOutcome([
    ...dailyMetrics,
    { ...dailyMetrics[3], id: 'duplicate-delivery-date', grossRevenue: '50', cost: '25', orders: '1' },
  ], '2026-07-03', 3)
  assert.equal(duplicateDateOutcome?.after.deliveryDays, 3)
  assert.equal(duplicateDateOutcome?.after.gmv, '650.0000')
  assert.equal(duplicateDateOutcome?.after.spend, '175.0000')
  const stableOutcome = buildGmvMaxSopInterventionOutcome(dailyMetrics, '2026-07-03', 3)
  assert.equal(stableOutcome?.verdict, 'stable')
  const declinedOutcome = buildGmvMaxSopInterventionOutcome(dailyMetrics.map((item, index) => index >= 3 && index <= 5 ? { ...item, grossRevenue: '100', orders: '4' } : item), '2026-07-03', 3)
  assert.equal(declinedOutcome?.verdict, 'declined')
  const measuredOutcome = buildGmvMaxSopInterventionOutcome(dailyMetrics.slice(2), '2026-07-03', 3)
  assert.equal(measuredOutcome?.verdict, 'measured')
  const zeroDeliveryOutcome = buildGmvMaxSopInterventionOutcome([
    ...dailyMetrics,
    { ...dailyMetrics[0], id: 'zero-delivery-date', statDate: '2026-07-08', cost: '0', grossRevenue: '0', orders: '0' },
  ], '2026-07-04', 4)
  assert.equal(zeroDeliveryOutcome, undefined)
  const observationRunId = buildGmvMaxSopAutomationRunId({ instanceId: instance.id, localDate: '2026-07-31', state: 'scale_ready', decision: 'profit_observation_task', decisionContext: '2' })
  const autoBudgetRunId = buildGmvMaxSopAutomationRunId({ instanceId: instance.id, localDate: '2026-07-31', state: 'scale_ready', decision: 'auto_budget_external', decisionContext: 'controlled_scaling' })
  assert.notEqual(observationRunId, autoBudgetRunId)
  assert.equal(shouldRunGmvMaxSopAutomation({ previous: { status: 'failed', updatedAt: failedAt }, now: failedAt + GMV_MAX_SOP_AUTOMATION_RETRY_MS - 1 }), false)
  assert.equal(shouldRunGmvMaxSopAutomation({ previous: { status: 'failed', updatedAt: failedAt }, now: failedAt + GMV_MAX_SOP_AUTOMATION_RETRY_MS }), true)
  assert.equal(shouldRunGmvMaxSopAutomation({ previous: { status: 'completed', updatedAt: failedAt }, now: failedAt + GMV_MAX_SOP_AUTOMATION_RETRY_MS }), false)
  assert.equal(shouldRunGmvMaxSopAutomation({ previous: { status: 'completed', updatedAt: failedAt }, now: failedAt, force: true }), true)
  assert.equal(countGmvMaxObservedDeliveryDays([
    { ...dailyMetrics[0], id: 'observe-start', statDate: '2026-07-10', cost: '50' },
    { ...dailyMetrics[0], id: 'observe-zero', statDate: '2026-07-11', cost: '0', orders: '0' },
    { ...dailyMetrics[0], id: 'observe-one', statDate: '2026-07-12', cost: '50' },
    { ...dailyMetrics[0], id: 'observe-two', statDate: '2026-07-13', cost: '0', orders: '1' },
    { ...dailyMetrics[0], id: 'observe-three', statDate: '2026-07-14', cost: '50' },
  ], '2026-07-10'), 3)
  const completedObservation = advanceGmvMaxSopInterventionObservation({
    id: 'intervention-1', sopInstanceId: instance.id, campaignId, kind: 'roi', variable: 'target_roi', executionMode: 'approval', status: 'observing', startedDate: '2026-07-10', requiredDeliveryDays: 3, observedDeliveryDays: 0, createdAt: failedAt, updatedAt: failedAt,
  }, 3, failedAt + GMV_MAX_SOP_AUTOMATION_RETRY_MS)
  assert.equal(completedObservation.status, 'completed')
  assert.equal(completedObservation.observedDeliveryDays, 3)
  assert.equal(shouldCreateGmvMaxSopRollback(completedObservation, declinedOutcome!), true)
  assert.equal(shouldCreateGmvMaxSopRollback({ ...completedObservation, rollbackOfInterventionId: 'source-intervention' }, declinedOutcome!), false)
  assert.equal(shouldCreateGmvMaxSopRollback(completedObservation, stableOutcome!), false)
  const evidenceTasks = completeEvidenceBackedGmvMaxSopTasks({
    tasks: buildGmvMaxDailySopTasks(instance, '2026-07-31'),
    localDate: '2026-07-31',
    latestReportDate: '2026-07-30',
    creativeInsightCount: 8,
    createdWinnerDraftCount: 3,
    liveEvidenceDate: '2026-07-30',
    updatedAt: failedAt,
  })
  assert.deepEqual(evidenceTasks.map((item) => item.kind), ['data_review', 'creative_review', 'winner_variations', 'live_review'])
  assert.ok(evidenceTasks.every((item) => item.status === 'completed' && item.completedAt === failedAt && item.evidence))
  assert.equal(shouldRetryGmvMaxWinnerDraft({ draftStatus: 'created' }, failedAt), false)
  assert.equal(shouldRetryGmvMaxWinnerDraft({ draftStatus: 'failed', nextDraftRetryAt: failedAt + GMV_MAX_WINNER_DRAFT_RETRY_MS }, failedAt), false)
  assert.equal(shouldRetryGmvMaxWinnerDraft({ draftStatus: 'failed', nextDraftRetryAt: failedAt + GMV_MAX_WINNER_DRAFT_RETRY_MS }, failedAt + GMV_MAX_WINNER_DRAFT_RETRY_MS), true)
  const automaticCandidate = selectGmvMaxAutomaticSopProductCandidate([
    { id: 'auto-a-1', campaignId, storeId: 'store-1', creativeId: 'creative-a', itemGroupId: 'product-a', source: 'owned', statDate: '2026-07-01', cost: '50', grossRevenue: '200', roi: '4', orders: '4', cpa: '12.5', ctr: '0.1', playDepth: '0.2', raw: { product_name: 'Product A' }, syncedAt: 1 },
    { id: 'auto-a-2', campaignId, storeId: 'store-1', creativeId: 'creative-b', itemGroupId: 'product-a', source: 'owned', statDate: '2026-07-02', cost: '25', grossRevenue: '100', roi: '4', orders: '2', cpa: '12.5', ctr: '0.1', playDepth: '0.2', raw: {}, syncedAt: 2 },
    { id: 'auto-b-1', campaignId, storeId: 'store-1', creativeId: 'creative-c', itemGroupId: 'product-b', source: 'owned', statDate: '2026-07-02', cost: '60', grossRevenue: '250', roi: '4.1667', orders: '8', cpa: '7.5', ctr: '0.1', playDepth: '0.2', raw: { product_name: 'Product B' }, syncedAt: 2 },
  ])
  assert.equal(automaticCandidate?.productId, 'product-a')
  assert.equal(automaticCandidate?.productName, 'Product A')
  assert.equal(automaticCandidate?.grossRevenue, '300')
  assert.equal(automaticCandidate?.firstStatDate, '2026-07-01')
  assert.equal(automaticCandidate?.reportedDays, 2)
  assert.equal(selectGmvMaxAutomaticSopProductCandidate([{ ...dailyMetrics[0], creativeId: 'no-sale', itemGroupId: 'product-c', source: 'owned', grossRevenue: '0', orders: '0', cpa: '0', ctr: '0', playDepth: '0', raw: {} }]), undefined)
  const productCampaign = { id: campaignId, bindingId: 'binding-1', advertiserId: 'advertiser-1', storeId: 'store-1', name: 'Product campaign', campaignType: 'PRODUCT' as const, operationStatus: 'ENABLE', budget: '100', roasBid: '3', promotionDaysEnabled: false, lastSyncedAt: failedAt, raw: {} }
  const automaticallyStartedProduct = buildGmvMaxAutomaticSopInstance({ campaign: productCampaign, localDate: '2026-07-31', candidate: automaticCandidate, now: failedAt })
  assert.equal(automaticallyStartedProduct?.productId, 'product-a')
  assert.equal(automaticallyStartedProduct?.startDate, '2026-07-01')
  assert.equal(automaticallyStartedProduct?.creationSource, 'automatic')
  assert.equal(automaticallyStartedProduct?.autoStartEvidence?.reason, 'top_sales_product')
  assert.equal(buildGmvMaxAutomaticSopInstance({ campaign: productCampaign, localDate: '2026-07-31', now: failedAt }), undefined)
  const automaticallyStartedLive = buildGmvMaxAutomaticSopInstance({ campaign: { ...productCampaign, id: 'live-campaign', campaignType: 'LIVE' }, localDate: '2026-07-31', now: failedAt })
  assert.equal(automaticallyStartedLive?.track, 'live')
  assert.equal(automaticallyStartedLive?.autoStartEvidence?.reason, 'live_campaign')

  const tasks = buildGmvMaxDailySopTasks({ ...instance, currentDay: 1 }, '2026-07-01')
  assert.equal(tasks.length, 7)
  assert.equal(new Set(tasks.map((item) => item.id)).size, tasks.length)
  assert.equal(buildGmvMaxDailySopTasks({ ...instance, currentDay: 1 }, '2026-07-01')[0].id, tasks[0].id)
  assert.equal(tasks.at(-1)?.executionMode, 'manual_external')
  assert.equal(tasks.at(-1)?.resolutionCode, 'external_campaign_setup')
  const matureTasks = buildGmvMaxDailySopTasks({ ...instance, track: 'mature_product', phase: 'recovery_diagnosis', currentDay: 1 }, '2026-07-01')
  assert.equal(matureTasks.length, 6)
  assert.equal(isGmvMaxSopTaskApplicable(tasks.at(-1)!, { ...instance, track: 'mature_product', phase: 'recovery_diagnosis' }), false)
  const issueResolutions = buildGmvMaxSopIssueResolutions({
    instance: { ...instance, status: 'blocked', blockers: ['profit_model_incomplete', 'creative_supply_below_target', 'three_profitable_days_required'] },
    metrics: { ...summary, completeDays: 2, consecutiveProfitableDays: 1, winningCreativeCount: 0 },
    policy: defaultGmvMaxPolicy(campaignId),
    tasks: [], interventions: [], recommendations: [], profitFloor: '2.68', targetRoi: '3', campaignOperationStatus: 'ACTIVE', creativeCount: 1, hasLiveMetrics: false,
  })
  assert.deepEqual(issueResolutions.map((item) => item.code), ['creative_supply_below_target', 'profit_model_incomplete', 'three_profitable_days_required'])
  assert.equal(issueResolutions.find((item) => item.code === 'profit_model_incomplete')?.actionTarget, 'profit')
  assert.equal(issueResolutions.find((item) => item.code === 'three_profitable_days_required')?.manualCompletionAllowed, false)

  assert.equal(classifyGmvMaxCreativeGrade({ insight: winner, targetRoi: 2 }), 'S')
  assert.equal(classifyGmvMaxCreativeGrade({ targetRoi: 2, metric: { id: 'b', campaignId, storeId: 'store-1', creativeId: 'b', source: 'owned', statDate: '2026-07-07', cost: '2', grossRevenue: '0', roi: '0', orders: '0', cpa: '0', ctr: '0.02', productImpressions: '100', productClicks: '0', playDepth: '0', raw: {}, syncedAt: 1 } }), 'B')

  const sqliteSource = await readFile(path.join(process.cwd(), 'src/main/modules/tiktok-gmv-max/sqlite.ts'), 'utf8')
  for (const table of ['gmv_sop_instances', 'gmv_sop_tasks', 'gmv_supplemental_metrics', 'gmv_winner_dna', 'gmv_sync_jobs', 'gmv_mature_assessments', 'gmv_sop_interventions', 'gmv_sop_automation_runs']) assert.ok(sqliteSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`))
  const en = JSON.parse(await readFile(path.join(process.cwd(), 'src/renderer/src/locales/en-US.json'), 'utf8'))
  const zh = JSON.parse(await readFile(path.join(process.cwd(), 'src/renderer/src/locales/zh-CN.json'), 'utf8'))
  const vi = JSON.parse(await readFile(path.join(process.cwd(), 'src/renderer/src/locales/vi-VN.json'), 'utf8'))
  assert.equal(en.gmvMaxSop.phases.steady, 'Steady State')
  assert.equal(zh.gmvMaxSop.actions.start, '\u542f\u52a8 SOP')
  const structuredValueKeys = ['pending', 'approved_or_rejected', 'complete', 'incomplete', 'missing', 'derived', 'api', 'manual', 'csv', 'failed', 'completed', 'active', 'verified_recovery', 'verified_platform_value', 'latest_delivery_date', 'current_day_spend', 'live_metrics', 'seller_center', 'seller_center_evidence', 'preparing', 'sop', 'refresh', 'before', 'after', 'add', 'remove', 'rotate', 'allow', 'deny']
  for (const locale of [en, zh, vi]) {
    for (const code of GMV_MAX_ISSUE_CODES) {
      for (const field of ['title', 'reason', 'solution', 'completion']) assert.equal(typeof locale.gmvMaxIssueResolutions.items[code][field], 'string')
    }
    assert.equal(typeof locale.gmvMaxSopVideo.title, 'string')
    assert.equal(typeof locale.gmvMaxSopVideoWorkbench.gradeFilter, 'string')
    assert.equal(typeof locale.gmvMaxSopVideoWorkbench.sort.profit, 'string')
    assert.equal(typeof locale.gmvMaxSopVideoWorkbench.actions.heat, 'string')
    assert.equal(typeof locale.gmvMaxSopVideoWorkbench.actions.exclude, 'string')
    for (const key of ['shadowSuggestion', 'shadowApprovalHint', 'approveAndExecute', 'batchApproveAndExecute', 'platformAccepted', 'platformVerified', 'platformState', 'requestId']) {
      assert.equal(typeof locale.gmvMaxExecutionTruth[key], 'string')
    }
    assert.equal(typeof locale.gmvMaxStructuredValues.withinCompleteDays, 'string')
    for (const key of structuredValueKeys) assert.equal(typeof locale.gmvMaxStructuredValues.values[key], 'string')
    for (const code of ['data_missing', 'data_stale', 'profitable_winner', 'conversion_gap', 'opening_weak', 'retention_weak', 'fatigue_risk', 'delivery_inactive', 'stable_observation']) {
      assert.equal(typeof locale.gmvMaxSopVideo.analysis[code], 'string')
    }
  }
  const rendererSource = await readFile(path.join(process.cwd(), 'src/renderer/src/ui/views/TiktokGmvMaxOptimizerView.vue'), 'utf8')
  assert.match(rendererSource, /const sopCanStart = computed/)
  assert.match(rendererSource, /loadSopProductOptions[\s\S]*getProductPage/)
  assert.match(rendererSource, /data-testid="gmv-sop-start-button" :disabled="!sopCanStart/)
  assert.match(rendererSource, /Hero SKU is required[\s\S]*gmvMaxSop\.start\.hint/)
  assert.match(rendererSource, /data-testid="gmv-sop-video-preview-button"/)
  assert.match(rendererSource, /data-testid="gmv-sop-video-sort"/)
  assert.match(rendererSource, /:data-testid="`gmv-sop-video-grade-/)
  assert.match(rendererSource, /data-testid="gmv-sop-video-actions"/)
  assert.match(rendererSource, /function structuredValueLabel/)
  assert.match(rendererSource, /structuredValueLabel\(primarySopIssue\.currentValue\)/)
  assert.match(rendererSource, /structuredValueLabel\(primarySopIssue\.targetValue\)/)
  assert.match(rendererSource, /structuredValueLabel\(primarySopIssue\.evidenceSource\)/)
  assert.match(rendererSource, /gmvMaxExecutionTruth\.approveAndExecute/)
  assert.match(rendererSource, /item\.status === 'executed' && item\.platformStateVerified/)
  assert.match(rendererSource, /actionPayload: \{ operation, creativeId: item\.creativeId \}/)
  assert.doesNotMatch(rendererSource, /gmvMaxSop\.dna\.draft/)
  const serviceSource = await readFile(path.join(process.cwd(), 'src/main/modules/tiktok-gmv-max/service.ts'), 'utf8')
  assert.match(serviceSource, /Shadow recommendations require explicit approval before TikTok execution/)
  assert.match(serviceSource, /promoteGmvMaxRecommendationToLive/)
  const recalculationSource = serviceSource.slice(serviceSource.indexOf('async function recalculateSopInternal'), serviceSource.indexOf('function nestedSopCreativeValue'))
  assert.doesNotMatch(recalculationSource, /createWinnerDraft\(/)
  await verifyDeclinedInterventionRollbackIntegration()
  await verifyExternalOperationAndInterruptedSyncIntegration()
  console.log('TikTok GMV MAX SOP smoke tests passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
