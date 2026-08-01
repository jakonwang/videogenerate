import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { evaluateGmvMaxCampaign, defaultGmvMaxPolicy } from '../src/main/modules/tiktok-gmv-max/optimizer'
import { GMV_MAX_CAPABILITY_TOOLS, GMV_MAX_REQUIRED_TOOLS, type GmvMaxCampaign, type GmvMaxDailyMetric, type GmvMaxPolicyPreset, type GmvMaxProductInsight } from '../src/main/modules/tiktok-gmv-max/types'
import { validateGmvMaxOAuthCallback } from '../src/main/modules/tiktok-gmv-max/oauth'
import { createGmvMaxMcpClient, parseGmvMaxMcpContent } from '../src/main/modules/tiktok-gmv-max/mcpClient'
import { calculateGmvMaxCampaignProfitGuard, calculateGmvMaxConfiguredProductProfitGuard, calculateGmvMaxProfitGuard, deriveGmvMaxObservedSellingPrice, estimateGmvMaxNetProfit, resolveGmvMaxCost, selectGmvMaxCampaignProductCosts } from '../src/main/modules/tiktok-gmv-max/profit'
import { buildGmvMaxCreativeExperiment, evaluateGmvMaxCreativeGuard, evaluateGmvMaxCreativeRotationPlan, evaluateGmvMaxPacingDiagnostic, evaluateGmvMaxRealtimeGuard, evaluateGmvMaxSessionGuard } from '../src/main/modules/tiktok-gmv-max/guards'
import { analyzeGmvMaxLifecycle } from '../src/main/modules/tiktok-gmv-max/learning'
import { measureGmvMaxActionOutcome } from '../src/main/modules/tiktok-gmv-max/outcomes'
import { analyzeGmvMaxCreativeIntelligence, buildGmvMaxPortfolioPlans } from '../src/main/modules/tiktok-gmv-max/intelligence'
import { executeGmvMaxPortfolioTransfer, GmvMaxPortfolioExecutionError } from '../src/main/modules/tiktok-gmv-max/portfolioExecutor'
import { executeGmvMaxCreativeRotation, GmvMaxCreativeRotationError } from '../src/main/modules/tiktok-gmv-max/creativeRotation'
import { buildGmvMaxCreativeMetricId, buildGmvMaxCreativeReportRequest, buildGmvMaxProductReportRequest, hasNextGmvMaxPage, parseGmvMaxCreativeReportRow, parseGmvMaxProductReportIds } from '../src/main/modules/tiktok-gmv-max/reportContract'
import { buildGmvMaxStoreProfitSummaries } from '../src/main/modules/tiktok-gmv-max/storeProfit'
import { replayGmvMaxStrategy } from '../src/main/modules/tiktok-gmv-max/backtest'
import { buildGmvMaxStrategyCalibrations } from '../src/main/modules/tiktok-gmv-max/calibration'
import { analyzeGmvMaxProductIntelligence } from '../src/main/modules/tiktok-gmv-max/productIntelligence'
import { resolveGmvMaxProductCostScope, validateGmvMaxCostInput, validateGmvMaxOptionalCostInput, validateGmvMaxProductSellingPrice } from '../src/main/modules/tiktok-gmv-max/costValidation'
import { buildGmvMaxVideoIdentity, resolveGmvMaxCreativeAsset } from '../src/main/modules/tiktok-gmv-max/creativeAssets'
import { selectGmvMaxCampaignCandidate, selectGmvMaxCampaignCandidates } from '../src/main/modules/tiktok-gmv-max/automation'
import { assertGmvMaxRemoteCampaignState, matchesGmvMaxRemoteCampaignState, parseGmvMaxRemoteCampaignState } from '../src/main/modules/tiktok-gmv-max/executionState'
import { buildGmvMaxCreativeUpdateArgs, buildGmvMaxCreativeVerificationRequest, resolveGmvMaxCreativeTarget, verifyGmvMaxCreativeDelivery } from '../src/main/modules/tiktok-gmv-max/creativeContract'
import { buildGmvMaxSessionToolCall, buildGmvMaxSessionWindow, isGmvMaxSessionInputRejection, refreshGmvMaxCreativeBoostSchedule, verifyGmvMaxSessionState } from '../src/main/modules/tiktok-gmv-max/sessionContract'
import { assertGmvMaxPortfolioEvidenceFresh, previousCompleteDate } from '../src/main/modules/tiktok-gmv-max/portfolioFreshness'
import { mergeGmvMaxAccountMetadata, resolveGmvMaxAccountMetadata, resolveGmvMaxAccountMetadataRequest } from '../src/main/modules/tiktok-gmv-max/accountMetadata'
import { convertGmvMaxMoneyToCny, createGmvMaxExchangeRateLoader, fetchGmvMaxCnyExchangeRate, normalizeGmvMaxExchangeRate, parseGmvMaxExchangeRate } from '../src/main/modules/tiktok-gmv-max/exchangeRate'

const now = Date.UTC(2026, 6, 27, 12, 0, 0)

function campaign(type: 'PRODUCT' | 'LIVE' = 'PRODUCT'): GmvMaxCampaign {
  return {
    id: `campaign-${type.toLowerCase()}`,
    bindingId: 'binding-1',
    advertiserId: 'advertiser-1',
    storeId: 'store-1',
    name: `${type} campaign`,
    campaignType: type,
    operationStatus: 'ACTIVE',
    budget: '100',
    roasBid: '2',
    promotionDaysEnabled: false,
    lastSyncedAt: now,
    raw: {},
  }
}

function metrics(type: 'high' | 'low' | 'mixed', campaignType: 'PRODUCT' | 'LIVE' = 'PRODUCT'): GmvMaxDailyMetric[] {
  const roi = type === 'high' ? ['2.25', '2.3', '2.4'] : type === 'low' ? ['1.5', '1.4', '1.3'] : ['2.3', '1.3', '2.4']
  return roi.map((value, index) => ({
    id: `metric-${campaignType}-${index}`,
    campaignId: `campaign-${campaignType.toLowerCase()}`,
    advertiserId: 'advertiser-1',
    storeId: 'store-1',
    campaignType,
    statDate: `2026-07-${24 + index}`,
    cost: '90',
    grossRevenue: '210',
    roi: value,
    orders: '4',
    budgetUtilization: '0.9',
    raw: {},
    syncedAt: now,
  }))
}

function evaluate(preset: GmvMaxPolicyPreset, direction: 'high' | 'low', type: 'PRODUCT' | 'LIVE' = 'LIVE') {
  const item = campaign(type)
  const policy = { ...defaultGmvMaxPolicy(item.id), preset }
  return evaluateGmvMaxCampaign({ campaign: item, policy, metrics: metrics(direction, type), now })
}

async function main() {
  const remoteState = parseGmvMaxRemoteCampaignState({ data: { campaign: { budget: '0100.00', roas_bid: '2.5000', operation_status: 'ACTIVE' } }, status: 'success' })
  assert.deepEqual(remoteState, { budget: '100', roasBid: '2.5', operationStatus: 'ACTIVE' })
  assert.doesNotThrow(() => assertGmvMaxRemoteCampaignState({ actionType: 'budget', actual: remoteState, expectedBudget: '100.0', expectedRoasBid: '2.50', phase: 'before' }))
  assert.throws(
    () => assertGmvMaxRemoteCampaignState({ actionType: 'budget', actual: remoteState, expectedBudget: '120', expectedRoasBid: '2.5', phase: 'before' }),
    /precondition failed/,
  )
  assert.doesNotThrow(() => assertGmvMaxRemoteCampaignState({ actionType: 'status', actual: remoteState, expectedOperationStatus: 'active', phase: 'after' }))
  assert.equal(matchesGmvMaxRemoteCampaignState({ actionType: 'budget', actual: remoteState, expectedBudget: '100', expectedRoasBid: '2.5', phase: 'after' }), true)
  assert.equal(matchesGmvMaxRemoteCampaignState({ actionType: 'budget', actual: remoteState, expectedBudget: '101', expectedRoasBid: '2.5', phase: 'after' }), false)

  const candidateCampaign = campaign()
  const candidatePolicy = defaultGmvMaxPolicy(candidateCampaign.id)
  const candidateBase = evaluateGmvMaxRealtimeGuard({
    campaign: candidateCampaign,
    policy: { ...candidatePolicy, targetCpa: '10' },
    samples: [
      { id: 'priority-sample-1', campaignId: candidateCampaign.id, statDate: '2026-07-27', cost: '14', orders: '0', grossRevenue: '0', syncedAt: now - 30 * 60_000 },
      { id: 'priority-sample-2', campaignId: candidateCampaign.id, statDate: '2026-07-27', cost: '16', orders: '0', grossRevenue: '0', syncedAt: now },
    ],
    now,
  })!
  const sessionCandidate = { ...candidateBase, id: 'session-candidate', actionType: 'session' as const, kind: 'scale_up' as const, actionPayload: { operation: 'create' } }
  const creativeCandidate = { ...candidateBase, id: 'creative-candidate', actionType: 'creative' as const, actionPayload: { operation: 'REMOVE' } }
  assert.equal(selectGmvMaxCampaignCandidate([sessionCandidate, candidateBase, creativeCandidate]).id, candidateBase.id)
  assert.deepEqual(selectGmvMaxCampaignCandidates([sessionCandidate, candidateBase, creativeCandidate]).map((item) => item.id), [candidateBase.id, creativeCandidate.id, sessionCandidate.id])
  assert.equal(selectGmvMaxCampaignCandidates(Array.from({ length: 8 }, (_, index) => ({ ...creativeCandidate, id: `creative-candidate-${index}` }))).length, 5)

  const creativeReportRequest = buildGmvMaxCreativeReportRequest({
    advertiserId: 'advertiser-1',
    storeId: 'store-1',
    campaignIds: ['campaign-product'],
    itemGroupIds: ['product-1'],
    campaignType: 'PRODUCT',
    startDate: '2026-07-01',
    endDate: '2026-07-27',
    page: 1,
  })
  assert.deepEqual(creativeReportRequest.dimensions, ['campaign_id', 'item_group_id', 'item_id', 'stat_time_day'])
  assert.ok(creativeReportRequest.metrics.includes('cost_per_order'))
  assert.ok(creativeReportRequest.metrics.includes('ad_video_view_rate_6s'))
  assert.deepEqual(creativeReportRequest.filtering.item_group_ids, ['product-1'])
  assert.equal('gmv_max_promotion_types' in creativeReportRequest.filtering, false)
  assert.equal(creativeReportRequest.dimensions.includes('video_id' as never), false)
  assert.equal(creativeReportRequest.metrics.includes('cpa' as never), false)
  assert.equal(creativeReportRequest.metrics.includes('video_watched_6s_rate' as never), false)
  const productReportRequest = buildGmvMaxProductReportRequest({
    advertiserId: 'advertiser-1', storeId: 'store-1', campaignIds: ['campaign-product'], campaignType: 'PRODUCT',
    startDate: '2026-07-01', endDate: '2026-07-27', page: 1,
  })
  assert.deepEqual(productReportRequest.dimensions, ['campaign_id', 'item_group_id'])
  assert.equal('gmv_max_promotion_types' in productReportRequest.filtering, false)
  assert.deepEqual(parseGmvMaxProductReportIds({ dimensions: { campaign_id: 'campaign-product', item_group_id: 'product-1' } }), { campaignId: 'campaign-product', itemGroupId: 'product-1' })
  assert.equal(hasNextGmvMaxPage({ data: { page_info: { total_page: 3 } } }, 1, 100, 100), true)
  assert.equal(hasNextGmvMaxPage({ data: { page_info: { total_page: 3 } } }, 3, 100, 100), false)
  assert.equal(hasNextGmvMaxPage({ page_info: { total_count: 250 } }, 2, 100, 100), true)
  assert.equal(hasNextGmvMaxPage({}, 1, 100, 100), true)
  assert.equal(hasNextGmvMaxPage({}, 2, 100, 48), false)
  assert.equal(hasNextGmvMaxPage({ page_info: { total_page: 200 } }, 100, 100, 100), false)

  const creativeReportMetric = parseGmvMaxCreativeReportRow({
    dimensions: { campaign_id: 'campaign-product', item_group_id: 'product-1', item_id: 'video-1', stat_time_day: '2026-07-27' },
    metrics: {
      cost: '12.5', orders: '2', cost_per_order: '6.25', gross_revenue: '40', roi: '3.2',
      product_impressions: '1000', product_clicks: '50', product_click_rate: '5.00', ad_conversion_rate: '4.00',
      ad_video_view_rate_2s: '60.00', ad_video_view_rate_6s: '25.00', creative_delivery_status: 'DELIVERING',
    },
  }, 'store-1', now)
  assert.ok(creativeReportMetric)
  assert.equal(creativeReportMetric.creativeId, 'video-1')
  assert.equal(creativeReportMetric.cpa, '6.25')
  assert.equal(creativeReportMetric.ctr, '0.05')
  assert.equal(creativeReportMetric.conversionRate, '0.04')
  assert.equal(creativeReportMetric.play2sRate, '0.6')
  assert.equal(creativeReportMetric.playDepth, '0.25')
  assert.equal(creativeReportMetric.status, 'DELIVERING')
  const creativeTarget = resolveGmvMaxCreativeTarget({
    campaign: candidateCampaign,
    creativeId: 'video-1',
    operation: 'REMOVE',
    metrics: [{ ...creativeReportMetric, id: 'creative-contract-metric' }],
  })
  assert.deepEqual(creativeTarget, { creativeId: 'video-1', itemId: 'video-1', spuIds: ['product-1'], operation: 'REMOVE' })
  assert.deepEqual(buildGmvMaxCreativeUpdateArgs({ advertiserId: 'advertiser-1', campaign: candidateCampaign, target: creativeTarget }), {
    advertiser_id: 'advertiser-1', campaign_id: candidateCampaign.id, action: 'REMOVE', item_list: [{ item_id: 'video-1', spu_id_list: ['product-1'] }],
  })
  assert.throws(() => resolveGmvMaxCreativeTarget({ campaign: candidateCampaign, creativeId: 'video-missing-spu', operation: 'ADD', metrics: [] }), /SPU mapping/)
  const assetTarget = resolveGmvMaxCreativeTarget({
    campaign: candidateCampaign,
    creativeId: 'video-from-asset',
    operation: 'ADD',
    metrics: [],
    assets: [{ id: 'asset-with-spu', storeId: candidateCampaign.storeId, campaignId: candidateCampaign.id, creativeId: 'video-from-asset', kind: 'video', raw: { product_list: [{ spu_id: 'product-asset' }] }, syncedAt: now }],
  })
  assert.deepEqual(assetTarget.spuIds, ['product-asset'])
  const creativeVerificationRequest = buildGmvMaxCreativeVerificationRequest({
    advertiserId: 'advertiser-1', storeId: 'store-1', campaign: candidateCampaign, targets: [creativeTarget], startDate: '2026-07-26', endDate: '2026-07-27',
  })
  assert.deepEqual(creativeVerificationRequest.filtering.item_ids, ['video-1'])
  const creativeStatusRow = (status: string) => ({
    dimensions: { campaign_id: candidateCampaign.id, item_group_id: 'product-1', item_id: 'video-1', stat_time_day: '2026-07-27' },
    metrics: { creative_delivery_status: status, cost: '1', orders: '0', gross_revenue: '0', roi: '0' },
  })
  assert.equal(verifyGmvMaxCreativeDelivery({ campaign: candidateCampaign, targets: [creativeTarget], rows: [creativeStatusRow('EXCLUDED')], storeId: 'store-1' }).state, 'confirmed')
  assert.equal(verifyGmvMaxCreativeDelivery({ campaign: candidateCampaign, targets: [creativeTarget], rows: [creativeStatusRow('DELIVERING')], storeId: 'store-1' }).state, 'diverged')
  assert.equal(verifyGmvMaxCreativeDelivery({ campaign: candidateCampaign, targets: [{ ...creativeTarget, operation: 'ADD' }], rows: [], storeId: 'store-1' }).state, 'pending')
  assert.equal(verifyGmvMaxCreativeDelivery({ campaign: candidateCampaign, targets: [{ ...creativeTarget, operation: 'ADD' }], rows: [creativeStatusRow('')], storeId: 'store-1' }).state, 'pending')
  const sameVideoOtherProduct = { ...creativeReportMetric, itemGroupId: 'product-2' }
  assert.notEqual(
    buildGmvMaxCreativeMetricId(creativeReportMetric),
    buildGmvMaxCreativeMetricId(sameVideoOtherProduct),
  )
  assert.equal(
    buildGmvMaxCreativeMetricId(creativeReportMetric),
    buildGmvMaxCreativeMetricId({ ...creativeReportMetric }),
  )
  const productCardMetric = parseGmvMaxCreativeReportRow({
    dimensions: { campaign_id: 'campaign-product', item_group_id: 'product-2', item_id: '-1', stat_time_day: '2026-07-27' },
    metrics: { cost: '1', orders: '0', gross_revenue: '0', roi: '0' },
  }, 'store-1', now)
  assert.equal(productCardMetric?.creativeId, 'product-card:product-2')
  assert.equal(productCardMetric?.source, 'product_card')
  const sessionCampaign = { ...candidateCampaign, scheduleEndTime: '2026-07-29 00:00:00' }
  const sessionWindow = buildGmvMaxSessionWindow({ campaign: sessionCampaign, now })
  assert.equal(sessionWindow.startTime, '2026-07-27 12:00:00')
  assert.equal(sessionWindow.endTime, '2026-07-28 12:00:00')
  const sessionCall = buildGmvMaxSessionToolCall({
    advertiserId: 'advertiser-1', storeId: 'store-1', campaign: sessionCampaign,
    actionPayload: { operation: 'create', itemId: 'video-1', spuId: 'product-1', budget: '10', scheduleStartTime: sessionWindow.startTime, scheduleEndTime: sessionWindow.endTime },
  })
  assert.equal(sessionCall.tool, 'campaign_gmv_max_session_create')
  assert.deepEqual(sessionCall.args, {
    advertiser_id: 'advertiser-1', campaign_id: candidateCampaign.id, store_id: 'store-1',
    session: { bid_type: 'CREATIVE_NO_BID', product_list: [{ spu_id: 'product-1' }], item_id: 'video-1', budget: 10, schedule_type: 'SCHEDULE_START_END', schedule_end_time: sessionWindow.endTime },
  })
  assert.equal('schedule_start_time' in sessionCall.args.session, false)
  assert.deepEqual(buildGmvMaxSessionToolCall({ advertiserId: 'advertiser-1', storeId: 'store-1', campaign: sessionCampaign, actionPayload: { operation: 'delete', sessionId: 'session-1' } }), {
    tool: 'campaign_gmv_max_session_delete', args: { advertiser_id: 'advertiser-1', session_id: 'session-1' },
  })
  const sessionUpdateCall = buildGmvMaxSessionToolCall({
    advertiserId: 'advertiser-1', storeId: 'store-1', campaign: sessionCampaign,
    actionPayload: { operation: 'update', sessionId: 'session-1', itemId: 'video-1', spuId: 'product-1', budget: '12', scheduleStartTime: sessionWindow.startTime, scheduleEndTime: sessionWindow.endTime },
  })
  assert.equal(sessionUpdateCall.tool, 'campaign_gmv_max_session_update')
  assert.equal(sessionUpdateCall.args.campaign_id, candidateCampaign.id)
  assert.equal(sessionUpdateCall.args.store_id, 'store-1')
  assert.equal(sessionUpdateCall.args.session_id, 'session-1')
  assert.deepEqual(sessionUpdateCall.args.session, { budget: 12, schedule_type: 'SCHEDULE_START_END', schedule_end_time: sessionWindow.endTime })
  const continuousSessionCall = buildGmvMaxSessionToolCall({
    advertiserId: 'advertiser-1', storeId: 'store-1', campaign: sessionCampaign,
    actionPayload: { operation: 'create', itemId: 'video-1', spuId: 'product-1', budget: '10', scheduleType: 'SCHEDULE_FROM_NOW' },
  })
  assert.deepEqual(continuousSessionCall.args.session, { bid_type: 'CREATIVE_NO_BID', product_list: [{ spu_id: 'product-1' }], item_id: 'video-1', budget: 10, schedule_type: 'SCHEDULE_FROM_NOW' })
  assert.deepEqual(refreshGmvMaxCreativeBoostSchedule({
    campaign: sessionCampaign,
    actionPayload: { scheduleStartTime: '2026-07-20 00:00:00', scheduleEndTime: '2026-07-21 00:00:00', budget: '10' },
    now,
  }), {
    scheduleStartTime: '2026-07-27 12:00:00', scheduleEndTime: '2026-07-28 12:00:00', scheduleType: 'SCHEDULE_START_END', budget: '10',
  })
  assert.equal(isGmvMaxSessionInputRejection('TikTok MCP tool failed: campaign_gmv_max_session_create (code=40002, invalid field)'), true)
  assert.equal(isGmvMaxSessionInputRejection('TikTok MCP tool failed: campaign_gmv_max_session_create (code=429, rate limit)'), false)
  const activeSession = { id: 'snapshot-1', campaignId: candidateCampaign.id, sessionId: 'session-1', status: 'ACTIVE', budget: '10', raw: {}, syncedAt: now }
  assert.equal(verifyGmvMaxSessionState({ operation: 'create', sessionId: 'session-1', expectedBudget: '10', sessions: [activeSession] }).state, 'confirmed')
  assert.equal(verifyGmvMaxSessionState({ operation: 'delete', sessionId: 'session-1', sessions: [activeSession] }).state, 'diverged')
  const sessionRecommendation = evaluateGmvMaxSessionGuard({
    campaign: sessionCampaign,
    policy: { ...defaultGmvMaxPolicy(candidateCampaign.id), minOrders: 1, sessionPermission: true },
    profitGuard: { complete: true, contributionMarginRate: '0.5', breakEvenRoi: '2', effectiveRoiFloor: '2' },
    metrics: [
      { ...creativeReportMetric, id: 'session-metric-1', campaignId: candidateCampaign.id, statDate: '2026-07-26', orders: '2', roi: '3', grossRevenue: '30', cost: '10' },
      { ...creativeReportMetric, id: 'session-metric-2', campaignId: candidateCampaign.id, statDate: '2026-07-27', orders: '2', roi: '3', grossRevenue: '30', cost: '10' },
    ],
    sessions: [], now,
  })
  assert.equal(sessionRecommendation?.actionPayload?.spuId, 'product-1')
  assert.equal(sessionRecommendation?.actionPayload?.itemId, 'video-1')
  assert.equal(evaluateGmvMaxSessionGuard({ campaign: campaign('LIVE'), policy: defaultGmvMaxPolicy('campaign-live'), profitGuard: { complete: true, contributionMarginRate: '0.5', breakEvenRoi: '2', effectiveRoiFloor: '2' }, metrics: [], sessions: [], now }), null)

  const freshnessBinding = { id: 'fresh-binding', connectionId: 'connection-1', advertiserId: 'advertiser-1', advertiserName: 'Advertiser', storeId: 'store-1', storeName: 'Store', campaignType: 'PRODUCT' as const, active: true, timezone: 'Asia/Shanghai', updatedAt: now }
  const expectedCompleteDate = previousCompleteDate(freshnessBinding.timezone, now)
  const freshnessPlan = { id: 'fresh-plan', storeId: 'store-1', status: 'proposed' as const, transferAmount: '10', donorBudgetBefore: '100', donorBudgetAfter: '90', receiverBudgetBefore: '100', receiverBudgetAfter: '110', projectedProfitDelta: '5', confidence: 80, budgetConserved: true, evidenceEndDate: expectedCompleteDate, reason: 'profit_pool_reallocation', autoExecutable: true, analyzedAt: now, updatedAt: now }
  assert.equal(assertGmvMaxPortfolioEvidenceFresh({ plan: freshnessPlan, donorBinding: freshnessBinding, receiverBinding: freshnessBinding, now }), expectedCompleteDate)
  assert.throws(() => assertGmvMaxPortfolioEvidenceFresh({ plan: { ...freshnessPlan, evidenceEndDate: '2026-07-24' }, donorBinding: freshnessBinding, receiverBinding: freshnessBinding, now }), /stale/)
  const sharedCreativeAssets = [
    { id: 'asset-store-1', storeId: 'store-1', creativeId: 'shared-video', kind: 'video' as const, name: 'Store 1 video', raw: {}, syncedAt: now },
    { id: 'asset-store-2', storeId: 'store-2', creativeId: 'shared-video', kind: 'video' as const, name: 'Store 2 video', raw: {}, syncedAt: now },
    { id: 'asset-campaign-1', storeId: 'store-1', campaignId: 'campaign-product', creativeId: 'shared-video', kind: 'video' as const, name: 'Campaign video', raw: {}, syncedAt: now },
  ]
  assert.equal(resolveGmvMaxCreativeAsset(sharedCreativeAssets, { storeId: 'store-1', campaignId: 'campaign-product', creativeId: 'shared-video' })?.name, 'Campaign video')
  assert.equal(resolveGmvMaxCreativeAsset(sharedCreativeAssets, { storeId: 'store-2', campaignId: 'campaign-product', creativeId: 'shared-video' })?.name, 'Store 2 video')
  assert.deepEqual(buildGmvMaxVideoIdentity({ identity_id: 'shop-identity', identity_type: 'TTS_TT', store_id: 'shop-1' }, 'fallback-shop'), {
    identity_id: 'shop-identity',
    identity_type: 'TTS_TT',
    identity_authorized_shop_id: 'shop-1',
  })
  assert.deepEqual(buildGmvMaxVideoIdentity({ identity_id: 'bc-identity', identity_type: 'BC_AUTH_TT', identity_authorized_bc_id: 'bc-1' }, 'shop-1'), {
    identity_id: 'bc-identity',
    identity_type: 'BC_AUTH_TT',
    identity_authorized_bc_id: 'bc-1',
  })

  const roiGuardUp = evaluate('roi_guard', 'high')
  assert.equal(roiGuardUp?.proposedBudget, '110')
  assert.equal(roiGuardUp?.proposedRoasBid, '2')
  assert.equal(roiGuardUp?.kind, 'scale_up')

  const roiGuardDown = evaluate('roi_guard', 'low')
  assert.equal(roiGuardDown?.proposedBudget, '90')
  assert.equal(roiGuardDown?.proposedRoasBid, '2')

  const balancedUp = evaluate('balanced_growth', 'high')
  assert.equal(balancedUp?.proposedBudget, '115')
  assert.equal(balancedUp?.proposedRoasBid, '1.9')

  const balancedDown = evaluate('balanced_growth', 'low')
  assert.equal(balancedDown?.proposedBudget, '85')
  assert.equal(balancedDown?.proposedRoasBid, '2.1')

  const growth = evaluate('gmv_growth', 'high', 'LIVE')
  assert.equal(growth?.proposedBudget, '120')
  assert.equal(growth?.proposedRoasBid, '1.8')
  assert.equal(growth?.risk, 'medium')

  const baseCampaign = campaign()
  const basePolicy = defaultGmvMaxPolicy(baseCampaign.id)
  const scaleReadyProductEvidence = [{ state: 'scale_ready' }] as unknown as GmvMaxProductInsight[]
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high'), now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high').slice(0, 2), now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('mixed'), now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high').map((item) => ({ ...item, orders: '0' })), now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high'), lastExecutedAt: now - 23 * 60 * 60 * 1000, now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high'), pendingChange: true, now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high'), expectedEndDate: '2026-07-27', now }), null)
  assert.ok(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high'), productInsights: scaleReadyProductEvidence, expectedEndDate: '2026-07-26', now }))

  const dailyCapped = evaluateGmvMaxCampaign({
    campaign: baseCampaign,
    policy: { ...basePolicy, preset: 'balanced_growth' },
    metrics: metrics('high'),
    productInsights: scaleReadyProductEvidence,
    dailyBudgetChangePercent: 25,
    now,
  })
  assert.equal(dailyCapped?.proposedBudget, '105')

  const promotion = evaluateGmvMaxCampaign({
    campaign: { ...baseCampaign, promotionDaysEnabled: true },
    policy: { ...basePolicy, automationEnabled: true, promotionAutoExecutionEnabled: false },
    metrics: metrics('high'),
    productInsights: scaleReadyProductEvidence,
    now,
  })
  assert.ok(promotion)
  assert.equal(promotion.autoExecutable, false)

  const first = evaluate('roi_guard', 'high')
  const second = evaluate('roi_guard', 'high')
  assert.equal(first?.idempotencyKey, second?.idempotencyKey)

  const profitGuard = calculateGmvMaxProfitGuard({
    sellingPrice: '100', minRoi: '2', safetyMarginPercent: 15,
    cost: { purchaseCost: '40', firstMileCost: '5', lastMileCost: '5', warehousingCost: '0', platformCommissionRate: '0.1', creatorCommissionRate: '0', expectedReturnRate: '0', returnLossRate: '0' },
  })
  assert.equal(profitGuard.complete, true)
  assert.equal(profitGuard.breakEvenRoi, '2.5')
  assert.equal(profitGuard.effectiveRoiFloor, '2.875')
  assert.equal(deriveGmvMaxObservedSellingPrice(metrics('high')), '52.5')
  assert.equal(estimateGmvMaxNetProfit({ cost: '90', grossRevenue: '210', contributionMarginRate: '0.5' }), '15')
  const commissionGuard = calculateGmvMaxProfitGuard({
    sellingPrice: '100', minRoi: '2', safetyMarginPercent: 0,
    cost: { purchaseCost: '40', firstMileCost: '5', lastMileCost: '5', warehousingCost: '0', platformCommissionRate: '0.3', creatorCommissionRate: '0.1', expectedReturnRate: '0', returnLossRate: '0' },
  })
  assert.equal(commissionGuard.contributionMarginRate, '0.1')
  assert.equal(commissionGuard.breakEvenRoi, '10')
  assert.equal(calculateGmvMaxProfitGuard({ sellingPrice: '', minRoi: '2', cost: null }).complete, false)
  const validCostInput = { purchaseCost: '40', firstMileCost: '5', lastMileCost: '5', warehousingCost: '0', platformCommissionRate: '0.1', creatorCommissionRate: '0', expectedReturnRate: '0', returnLossRate: '0' }
  assert.equal(validateGmvMaxCostInput(validCostInput), null)
  assert.match(validateGmvMaxCostInput({ ...validCostInput, purchaseCost: '-1' }) || '', /purchaseCost/)
  assert.match(validateGmvMaxCostInput({ ...validCostInput, platformCommissionRate: '1.01' }) || '', /platformCommissionRate/)
  assert.equal(validateGmvMaxOptionalCostInput({ purchaseCost: '', platformCommissionRate: '0.1' }), null)
  assert.equal(validateGmvMaxProductSellingPrice('100'), null)
  assert.match(validateGmvMaxProductSellingPrice('0') || '', /sellingPrice/)
  assert.deepEqual(resolveGmvMaxCost(
    { purchaseCost: '42' },
    validCostInput,
  ), { ...validCostInput, purchaseCost: '42' })
  const rangedProduct = {
    id: 'multi-sku-product', storeId: 'store-1', productId: 'product-multi', sellingPrice: '100', catalogMinPrice: '100', catalogMaxPrice: '300', updatedAt: now,
    purchaseCost: '', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '',
  }
  const blockedRangedGuard = calculateGmvMaxConfiguredProductProfitGuard({ product: rangedProduct, storeCost: { ...validCostInput, id: 'store-cost', connectionId: 'connection-1', advertiserId: 'advertiser-1', storeId: 'store-1', updatedAt: now }, minRoi: '2' })
  assert.equal(blockedRangedGuard.complete, false)
  assert.match(blockedRangedGuard.reason || '', /SKU-level/)
  const blockedSkuCountGuard = calculateGmvMaxConfiguredProductProfitGuard({
    product: { ...rangedProduct, skuCount: 3, catalogMinPrice: '100', catalogMaxPrice: '100' },
    storeCost: { ...validCostInput, id: 'store-cost', connectionId: 'connection-1', advertiserId: 'advertiser-1', storeId: 'store-1', updatedAt: now },
    minRoi: '2',
  })
  assert.equal(blockedSkuCountGuard.complete, false)
  assert.match(blockedSkuCountGuard.reason || '', /SKU-level/)
  const variantGuard = calculateGmvMaxConfiguredProductProfitGuard({
    product: {
      ...rangedProduct,
      variants: [
        { id: 'sku-1', name: 'One pair', sellingPrice: '100', purchaseCost: '40', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '' },
        { id: 'sku-2', name: 'Two pairs', sellingPrice: '200', purchaseCost: '90', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '' },
        { id: 'sku-3', name: 'Three pairs', sellingPrice: '300', purchaseCost: '180', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '' },
      ],
    },
    storeCost: { ...validCostInput, id: 'store-cost', connectionId: 'connection-1', advertiserId: 'advertiser-1', storeId: 'store-1', updatedAt: now },
    minRoi: '2',
    safetyMarginPercent: 15,
  })
  assert.equal(variantGuard.complete, true)
  assert.equal(variantGuard.variantCount, 3)
  assert.equal(variantGuard.coveredVariantCount, 3)
  assert.equal(variantGuard.breakEvenRoi, '3.75')
  const costScopeBinding = { id: 'binding-1', connectionId: 'connection-1', advertiserId: 'advertiser-1', advertiserName: 'Advertiser', currency: 'USD', storeId: 'store-1', storeName: 'Store 1', campaignType: 'PRODUCT' as const, active: true, updatedAt: now }
  const validCostScope = resolveGmvMaxProductCostScope({ storeId: 'store-1', campaignId: baseCampaign.id, campaigns: [baseCampaign], bindings: [costScopeBinding] })
  assert.equal(validCostScope.binding?.id, 'binding-1')
  assert.match(resolveGmvMaxProductCostScope({ storeId: 'store-2', campaignId: baseCampaign.id, campaigns: [baseCampaign], bindings: [costScopeBinding] }).error || '', /does not match/)
  assert.match(resolveGmvMaxProductCostScope({ storeId: 'store-2', campaigns: [baseCampaign], bindings: [costScopeBinding] }).error || '', /binding does not exist/)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: basePolicy, metrics: metrics('high'), profitGuard: { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: '2', reason: 'missing' }, now }), null)

  const productPolicy = { ...basePolicy, creativeTestBudget: '30', minOrders: 10, minExplorationCreatives: 1 }
  const productCost = {
    id: 'product-cost-winner', storeId: baseCampaign.storeId, productId: 'product-winner', productName: 'Winning product', sellingPrice: '100', updatedAt: now,
    purchaseCost: '40', firstMileCost: '5', lastMileCost: '5', warehousingCost: '0', platformCommissionRate: '0.1', creatorCommissionRate: '0', expectedReturnRate: '0', returnLossRate: '0',
  }
  const losingProductCost = { ...productCost, id: 'product-cost-losing', productId: 'product-losing', productName: 'Losing product' }
  const storeCost = { ...productCost, id: 'store-cost', connectionId: 'connection-1', advertiserId: baseCampaign.advertiserId, productId: undefined, productName: undefined, sellingPrice: undefined }
  const productMetrics = [
    ...['2026-07-25', '2026-07-26'].flatMap((statDate, day) => ['winner-a', 'winner-b'].map((creativeId, creative) => ({
      id: `product-winner-${day}-${creative}`, campaignId: baseCampaign.id, storeId: baseCampaign.storeId, creativeId, itemGroupId: 'product-winner', source: 'owned' as const,
      statDate, cost: '10', grossRevenue: '35', roi: '3.5', orders: '3', cpa: '3.3333', ctr: '0.04', playDepth: '0.25', raw: {}, syncedAt: now,
    }))),
    ...['2026-07-25', '2026-07-26'].map((statDate, day) => ({
      id: `product-losing-${day}`, campaignId: baseCampaign.id, storeId: baseCampaign.storeId, creativeId: 'losing-a', itemGroupId: 'product-losing', source: 'owned' as const,
      statDate, cost: '20', grossRevenue: '0', roi: '0', orders: '0', cpa: '0', ctr: '0.01', playDepth: '0.08', raw: {}, syncedAt: now,
    })),
  ]
  const weightedProductMetrics = [
    { ...productMetrics[0], id: 'weighted-product-a', creativeId: 'weighted-a', itemGroupId: 'weighted-a', cost: '50', grossRevenue: '100', orders: '2', roi: '2' },
    { ...productMetrics[0], id: 'weighted-product-b', creativeId: 'weighted-b', itemGroupId: 'weighted-b', cost: '50', grossRevenue: '100', orders: '2', roi: '2' },
  ]
  const weightedCostA = { ...productCost, id: 'weighted-cost-a', productId: 'weighted-a', sellingPrice: '50', purchaseCost: '20', firstMileCost: '0', lastMileCost: '0', platformCommissionRate: '0.2' }
  const weightedCostB = { ...productCost, id: 'weighted-cost-b', productId: 'weighted-b', sellingPrice: '50', purchaseCost: '30', firstMileCost: '0', lastMileCost: '0', platformCommissionRate: '0.2' }
  const weightedCampaignGuard = calculateGmvMaxCampaignProfitGuard({
    minRoi: '2', safetyMarginPercent: 15, metrics: weightedProductMetrics, productCosts: [weightedCostA, weightedCostB],
  })
  assert.equal(weightedCampaignGuard.complete, true)
  assert.equal(weightedCampaignGuard.productCoveragePercent, 100)
  assert.equal(weightedCampaignGuard.contributionMarginRate, '0.3')
  assert.equal(weightedCampaignGuard.breakEvenRoi, '3.3333')
  assert.equal(weightedCampaignGuard.effectiveRoiFloor, '3.8332')
  const incompleteWeightedGuard = calculateGmvMaxCampaignProfitGuard({
    minRoi: '2', safetyMarginPercent: 15, metrics: weightedProductMetrics, productCosts: [weightedCostA],
  })
  assert.equal(incompleteWeightedGuard.complete, false)
  assert.equal(incompleteWeightedGuard.productCoveragePercent, 50)
  assert.equal(incompleteWeightedGuard.uncoveredSpendShare, '0.5')
  const scopedCampaignProducts = selectGmvMaxCampaignProductCosts({
    campaignId: baseCampaign.id,
    productIds: [],
    metrics: weightedProductMetrics.filter((item) => item.itemGroupId === 'weighted-a'),
    productCosts: [
      weightedCostA,
      { ...weightedCostA, id: 'other-campaign-cost', campaignId: 'other-campaign', purchaseCost: '49' },
      { ...weightedCostB, id: 'current-campaign-other-product', campaignId: baseCampaign.id, purchaseCost: '49' },
    ],
  })
  assert.deepEqual(scopedCampaignProducts.productIds, ['weighted-a'])
  assert.deepEqual(scopedCampaignProducts.productCosts.map((item) => item.id), ['weighted-cost-a'])
  const scopedCampaignGuard = calculateGmvMaxCampaignProfitGuard({
    minRoi: '2', safetyMarginPercent: 15,
    metrics: weightedProductMetrics.filter((item) => item.itemGroupId === 'weighted-a'),
    productCosts: scopedCampaignProducts.productCosts,
  })
  assert.equal(scopedCampaignGuard.effectiveRoiFloor, '2.875')
  assert.deepEqual(selectGmvMaxCampaignProductCosts({
    campaignId: baseCampaign.id,
    productIds: [],
    metrics: [],
    productCosts: [weightedCostA, weightedCostB],
  }), { productIds: [], productCosts: [] })
  const productInsights = analyzeGmvMaxProductIntelligence({
    campaign: baseCampaign, policy: productPolicy, metrics: productMetrics, productCosts: [productCost, losingProductCost], storeCost, listEntries: [], now,
  })
  const winningProduct = productInsights.find((item) => item.productId === 'product-winner')
  const losingProduct = productInsights.find((item) => item.productId === 'product-losing')
  assert.equal(winningProduct?.state, 'scale_ready')
  const inconsistentDirectionProduct = analyzeGmvMaxProductIntelligence({
    campaign: baseCampaign,
    policy: productPolicy,
    metrics: productMetrics.filter((item) => item.itemGroupId === 'product-winner').map((item) => item.statDate === '2026-07-25'
      ? { ...item, grossRevenue: '100', roi: '10' }
      : { ...item, grossRevenue: '20', roi: '2' }),
    productCosts: [productCost],
    storeCost,
    listEntries: [],
    now,
  })[0]
  assert.notEqual(inconsistentDirectionProduct.state, 'scale_ready')
  assert.equal(winningProduct?.allocationState, 'starved')
  assert.equal(winningProduct?.recommendedAction, 'scale')
  assert.equal(winningProduct?.profitEstimateAvailable, true)
  assert.ok(Number(winningProduct?.estimatedProfit) > 0)
  assert.equal(losingProduct?.state, 'losing')
  assert.equal(losingProduct?.allocationState, 'overfunded')
  assert.equal(losingProduct?.recommendedAction, 'exclude')
  const campaignCostOverride = { ...productCost, id: 'campaign-cost-override', campaignId: baseCampaign.id, purchaseCost: '10' }
  const unrelatedCampaignCost = { ...productCost, id: 'unrelated-campaign-cost', campaignId: 'other-campaign', purchaseCost: '90' }
  const scopedProductInsight = analyzeGmvMaxProductIntelligence({
    campaign: baseCampaign,
    policy: productPolicy,
    metrics: productMetrics.filter((item) => item.itemGroupId === 'product-winner'),
    productCosts: [unrelatedCampaignCost, productCost, campaignCostOverride],
    storeCost,
    listEntries: [],
    now,
  })[0]
  assert.equal(scopedProductInsight.profitFloor, '1.6427')
  assert.notEqual(scopedProductInsight.state, 'blocked')
  const defaultProductInsight = analyzeGmvMaxProductIntelligence({
    campaign: { ...baseCampaign, id: 'campaign-with-default-cost' },
    policy: { ...productPolicy, campaignId: 'campaign-with-default-cost' },
    metrics: productMetrics.filter((item) => item.itemGroupId === 'product-winner').map((item) => ({ ...item, campaignId: 'campaign-with-default-cost' })),
    productCosts: [unrelatedCampaignCost, productCost],
    storeCost,
    listEntries: [],
    now,
  })[0]
  assert.equal(defaultProductInsight.profitFloor, '2.875')
  assert.notEqual(defaultProductInsight.state, 'blocked')
  const deniedProductInsights = analyzeGmvMaxProductIntelligence({
    campaign: baseCampaign, policy: productPolicy, metrics: productMetrics, productCosts: [productCost, losingProductCost], storeCost,
    listEntries: [{ id: 'deny-product', storeId: baseCampaign.storeId, campaignId: baseCampaign.id, entityType: 'product', entityId: 'product-winner', mode: 'deny', updatedAt: now }], now,
  })
  assert.equal(deniedProductInsights.find((item) => item.productId === 'product-winner')?.state, 'blocked')
  const costBlockedProduct = analyzeGmvMaxProductIntelligence({
    campaign: baseCampaign, policy: productPolicy, metrics: productMetrics.filter((item) => item.itemGroupId === 'product-losing'), productCosts: [], storeCost, listEntries: [], now,
  })[0]
  assert.equal(costBlockedProduct.state, 'blocked')
  assert.equal(costBlockedProduct.recommendedAction, 'complete_costs')
  assert.equal(costBlockedProduct.profitEstimateAvailable, false)
  assert.equal(costBlockedProduct.estimatedProfit, '-')
  const productGateGuard = { complete: true, contributionMarginRate: '0.5', breakEvenRoi: '2', effectiveRoiFloor: '2' }
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: productPolicy, metrics: metrics('high'), profitGuard: productGateGuard, productInsights: [losingProduct!], now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: productPolicy, metrics: metrics('high'), profitGuard: productGateGuard, productInsights: [{ ...winningProduct!, state: 'winner' }], now }), null)
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: productPolicy, metrics: metrics('high'), profitGuard: productGateGuard, productInsights: [winningProduct!], now })?.kind, 'scale_up')

  const lifecycleGuard = { complete: true, contributionMarginRate: '0.5', breakEvenRoi: '2', effectiveRoiFloor: '2' }
  const lifecycleMetrics = Array.from({ length: 7 }, (_, index) => ({
    ...metrics('high')[0], id: `learning-${index}`, statDate: `2026-07-${20 + index}`,
    cost: '100', grossRevenue: '240', roi: '2.4', orders: '4', budgetUtilization: '0.9',
  }))
  const lifecycleCreatives = Array.from({ length: 3 }, (_, index) => ({
    id: `learning-creative-${index}`, campaignId: baseCampaign.id, storeId: baseCampaign.storeId, creativeId: 'winner-1', source: 'owned' as const,
    statDate: `2026-07-${24 + index}`, cost: '30', grossRevenue: '90', roi: '3', orders: '3', cpa: '10', ctr: '0.03', playDepth: '0.2', raw: {}, syncedAt: now,
  }))
  const scalingLifecycle = analyzeGmvMaxLifecycle({ campaign: baseCampaign, policy: basePolicy, metrics: lifecycleMetrics, creativeMetrics: lifecycleCreatives, profitGuard: lifecycleGuard, now })
  assert.equal(scalingLifecycle.stage, 'scaling')
  assert.equal(scalingLifecycle.recommendedFocus, 'scale_budget')
  const storeProfit = buildGmvMaxStoreProfitSummaries({
    campaigns: [baseCampaign],
    metrics: lifecycleMetrics,
    profitGuards: { [baseCampaign.id]: lifecycleGuard },
    learning: { [baseCampaign.id]: scalingLifecycle },
    storeCosts: [{ ...storeCost, currency: 'CNY' }],
    now,
  })
  assert.equal(storeProfit[0].coveragePercent, 100)
  assert.equal(storeProfit[0].spendCoveragePercent, 100)
  assert.equal(storeProfit[0].exchangeRateCoveragePercent, 100)
  assert.equal(storeProfit[0].profitEstimateAvailable, true)
  assert.equal(storeProfit[0].profitSource, 'estimated')
  assert.equal(storeProfit[0].estimatedNetProfit, '140')
  assert.equal(storeProfit[0].capitalEfficiency, '0.2')
  assert.equal(storeProfit[0].scaleReadyCampaigns, 1)
  const rangedStoreProfit = buildGmvMaxStoreProfitSummaries({
    campaigns: [baseCampaign],
    metrics: lifecycleMetrics,
    profitGuards: { [baseCampaign.id]: lifecycleGuard },
    learning: { [baseCampaign.id]: scalingLifecycle },
    storeCosts: [{ ...storeCost, currency: 'CNY' }],
    startDate: '2026-07-22',
    endDate: '2026-07-26',
    now,
  })
  assert.equal(rangedStoreProfit[0].startDate, '2026-07-22')
  assert.equal(rangedStoreProfit[0].endDate, '2026-07-26')
  assert.equal(rangedStoreProfit[0].spend, '500')
  assert.equal(rangedStoreProfit[0].grossRevenue, '1200')
  assert.equal(rangedStoreProfit[0].estimatedNetProfit, '100')
  const unavailableStoreProfit = buildGmvMaxStoreProfitSummaries({
    campaigns: [baseCampaign],
    metrics: lifecycleMetrics,
    profitGuards: { [baseCampaign.id]: { ...lifecycleGuard, complete: false } },
    learning: { [baseCampaign.id]: scalingLifecycle },
    storeCosts: [{ ...storeCost, currency: 'CNY' }],
    now,
  })
  assert.equal(unavailableStoreProfit[0].profitEstimateAvailable, false)
  assert.equal(unavailableStoreProfit[0].spendCoveragePercent, 0)
  const staleExchangeStoreProfit = buildGmvMaxStoreProfitSummaries({
    campaigns: [baseCampaign], metrics: lifecycleMetrics, profitGuards: { [baseCampaign.id]: lifecycleGuard },
    learning: { [baseCampaign.id]: scalingLifecycle },
    storeCosts: [{ ...storeCost, currency: 'USD', cnyExchangeRate: '7.2', exchangeRateUpdatedAt: now - 8 * 86_400_000 }],
    now,
  })
  assert.equal(staleExchangeStoreProfit[0].exchangeRateCoveragePercent, 0)
  assert.equal(staleExchangeStoreProfit[0].profitEstimateAvailable, false)
  assert.ok(staleExchangeStoreProfit[0].blockedReasons.includes('exchange_rate_missing_or_stale'))
  const strategyReplay = replayGmvMaxStrategy({
    campaign: { ...baseCampaign, campaignType: 'LIVE' },
    policy: { ...basePolicy, preset: 'balanced_growth', minExplorationCreatives: 1 },
    metrics: lifecycleMetrics,
    creativeMetrics: lifecycleCreatives,
    profitGuard: lifecycleGuard,
    days: 7,
  })
  assert.equal(strategyReplay.timeline.length, 7)
  assert.ok(strategyReplay.scaleUpCount > 0)
  assert.equal(strategyReplay.scaleDownCount, 0)
  assert.ok(Number(strategyReplay.endingBudget) > Number(strategyReplay.startingBudget))
  assert.ok(Number(strategyReplay.projectedProfitDelta) > 0)
  const futureCreativeReplay = replayGmvMaxStrategy({
    campaign: { ...baseCampaign, campaignType: 'LIVE' },
    policy: { ...basePolicy, preset: 'balanced_growth', minExplorationCreatives: 1 },
    metrics: lifecycleMetrics,
    creativeMetrics: [
      ...lifecycleCreatives,
      {
        ...lifecycleCreatives[0],
        id: 'future-creative-metric',
        statDate: '2099-01-01',
        grossRevenue: '999999',
        cost: '1',
        roi: '999999',
        orders: '999999',
      },
    ],
    profitGuard: lifecycleGuard,
    days: 7,
  })
  assert.deepEqual(futureCreativeReplay.timeline, strategyReplay.timeline)
  const creativeCoverageBlocked = evaluateGmvMaxCampaign({
    campaign: baseCampaign,
    policy: { ...basePolicy, minExplorationCreatives: 3 },
    metrics: lifecycleMetrics,
    profitGuard: lifecycleGuard,
    lifecycle: { ...scalingLifecycle, creativeCount: 2 },
    productInsights: scaleReadyProductEvidence,
    now,
  })
  assert.equal(creativeCoverageBlocked, null)
  const productBlockedReplay = replayGmvMaxStrategy({
    campaign: baseCampaign,
    policy: productPolicy,
    metrics: lifecycleMetrics,
    creativeMetrics: productMetrics.filter((item) => item.itemGroupId === 'product-losing'),
    profitGuard: productGateGuard,
    productCosts: [losingProductCost],
    storeCost,
    listEntries: [],
    days: 7,
  })
  assert.ok(productBlockedReplay.productRiskDays > 0)
  assert.equal(productBlockedReplay.scaleUpCount, 0)
  const productQualifiedReplay = replayGmvMaxStrategy({
    campaign: baseCampaign,
    policy: productPolicy,
    metrics: lifecycleMetrics,
    creativeMetrics: productMetrics.filter((item) => item.itemGroupId === 'product-winner'),
    profitGuard: productGateGuard,
    productCosts: [productCost],
    storeCost,
    listEntries: [],
    days: 7,
  })
  assert.ok(productQualifiedReplay.productQualifiedDays > 0)
  assert.ok(productQualifiedReplay.scaleUpCount > 0)
  assert.ok(productQualifiedReplay.productEvidenceMissingDays > 0)
  assert.ok(productQualifiedReplay.productGateBlockCount > 0)
  const adaptiveMetrics = metrics('high')
  const baselineAdaptiveRecommendation = evaluateGmvMaxCampaign({
    campaign: baseCampaign,
    policy: { ...basePolicy, preset: 'balanced_growth' },
    metrics: adaptiveMetrics,
    profitGuard: lifecycleGuard,
    productInsights: [winningProduct!],
    now,
  })
  assert.ok(baselineAdaptiveRecommendation)
  assert.equal(baselineAdaptiveRecommendation.kind, 'scale_up')
  assert.equal(baselineAdaptiveRecommendation.proposedBudget, '115')
  const calibrationRecommendations = Array.from({ length: 4 }, (_, index) => ({
    ...baselineAdaptiveRecommendation!,
    id: `calibration-recommendation-${index}`,
  }))
  const positiveCalibrations = buildGmvMaxStrategyCalibrations({
    campaigns: [baseCampaign],
    policies: [{ ...basePolicy, preset: 'balanced_growth' }],
    recommendations: calibrationRecommendations,
    outcomes: calibrationRecommendations.map((item, index) => ({
      id: `calibration-outcome-${index}`,
      recommendationId: item.id,
      campaignId: baseCampaign.id,
      actionType: 'budget' as const,
      kind: 'scale_up' as const,
      preStartDate: '2026-07-01', preEndDate: '2026-07-03', postStartDate: '2026-07-05', postEndDate: '2026-07-07',
      preRoi: '2', postRoi: '2.5', preRevenue: '100', postRevenue: '140', preSpend: '50', postSpend: '56',
      preEstimatedProfit: '20', postEstimatedProfit: '30', roiDeltaPercent: '25', profitDeltaPercent: '50', successful: true, measuredAt: now + index,
    })),
    now,
  })
  const positiveScaleCalibration = positiveCalibrations.find((item) => item.kind === 'scale_up')
  assert.equal(positiveScaleCalibration?.source, 'campaign')
  assert.equal(positiveScaleCalibration?.budgetStepMultiplier, 1.2)
  const adaptiveRecommendation = evaluateGmvMaxCampaign({
    campaign: baseCampaign,
    policy: { ...basePolicy, preset: 'balanced_growth' },
    metrics: adaptiveMetrics,
    profitGuard: lifecycleGuard,
    calibrations: positiveCalibrations,
    productInsights: [winningProduct!],
    now,
  })
  assert.ok(adaptiveRecommendation)
  assert.equal(adaptiveRecommendation.kind, 'scale_up')
  assert.equal(adaptiveRecommendation.proposedBudget, '118')
  assert.ok(Number(adaptiveRecommendation.proposedBudget) > Number(baselineAdaptiveRecommendation.proposedBudget))
  assert.equal(adaptiveRecommendation.calibration?.budgetStepMultiplier, 1.2)
  const timestampReplay = replayGmvMaxStrategy({
    campaign: baseCampaign,
    policy: basePolicy,
    metrics: lifecycleMetrics.map((item) => ({ ...item, statDate: `${item.statDate} 00:00:00` })),
    creativeMetrics: lifecycleCreatives.map((item) => ({ ...item, statDate: `${item.statDate} 00:00:00` })),
    profitGuard: lifecycleGuard,
    days: 7,
  })
  assert.equal(timestampReplay.timeline.length, 7)
  assert.match(String(timestampReplay.timeline[0].statDate), /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(scalingLifecycle.signals.includes('winning_creative_found'))
  const staleCreativeLifecycle = analyzeGmvMaxLifecycle({
    campaign: baseCampaign,
    policy: basePolicy,
    metrics: lifecycleMetrics,
    creativeMetrics: lifecycleCreatives.map((item, index) => ({ ...item, statDate: `2026-07-${20 + index}` })),
    profitGuard: lifecycleGuard,
    now,
  })
  assert.equal(staleCreativeLifecycle.winningCreativeCount, 0)
  assert.equal(staleCreativeLifecycle.stage, 'validation')
  assert.equal(analyzeGmvMaxLifecycle({ campaign: baseCampaign, policy: basePolicy, metrics: lifecycleMetrics.slice(0, 2), creativeMetrics: [], profitGuard: lifecycleGuard, now }).stage, 'exploration')
  assert.equal(analyzeGmvMaxLifecycle({ campaign: baseCampaign, policy: basePolicy, metrics: lifecycleMetrics, creativeMetrics: [], profitGuard: lifecycleGuard, now }).stage, 'validation')
  assert.equal(analyzeGmvMaxLifecycle({ campaign: baseCampaign, policy: basePolicy, metrics: lifecycleMetrics, creativeMetrics: lifecycleCreatives, profitGuard: { ...lifecycleGuard, complete: false }, now }).stage, 'blocked')
  const decliningLifecycle = analyzeGmvMaxLifecycle({ campaign: baseCampaign, policy: basePolicy, metrics: lifecycleMetrics.map((item, index) => index >= 4 ? { ...item, grossRevenue: '100', roi: '1' } : item), creativeMetrics: lifecycleCreatives, profitGuard: lifecycleGuard, now })
  assert.equal(decliningLifecycle.stage, 'declining')
  const validationLifecycle = analyzeGmvMaxLifecycle({ campaign: baseCampaign, policy: basePolicy, metrics: lifecycleMetrics, creativeMetrics: [], profitGuard: lifecycleGuard, now })
  assert.equal(evaluateGmvMaxCampaign({ campaign: baseCampaign, policy: { ...basePolicy, preset: 'balanced_growth' }, metrics: lifecycleMetrics, profitGuard: lifecycleGuard, lifecycle: validationLifecycle, now }), null)
  const validationStep = evaluateGmvMaxCampaign({
    campaign: baseCampaign,
    policy: { ...basePolicy, preset: 'balanced_growth' },
    metrics: lifecycleMetrics,
    profitGuard: lifecycleGuard,
    lifecycle: { ...validationLifecycle, creativeCount: 3, winningCreativeCount: 1 },
    productInsights: [winningProduct!],
    now,
  })
  assert.equal(validationStep?.proposedBudget, '105')
  assert.equal(validationStep?.proposedRoasBid, '2')

  const outcomeMetrics = [
    ...['2026-07-20', '2026-07-21', '2026-07-22'].map((statDate, index) => ({
      ...metrics('high')[0], id: `outcome-before-${index}`, statDate, cost: '100', grossRevenue: '220', roi: '2.2', orders: '5',
    })),
    ...['2026-07-24', '2026-07-25', '2026-07-26'].map((statDate, index) => ({
      ...metrics('high')[0], id: `outcome-after-${index}`, statDate, cost: '120', grossRevenue: '300', roi: '2.5', orders: '6',
    })),
  ]
  const executedScale = { ...evaluate('roi_guard', 'high')!, status: 'executed' as const, actionType: 'budget' as const, executedAt: now }
  const successfulOutcome = measureGmvMaxActionOutcome({ recommendation: executedScale, metrics: outcomeMetrics, actionDate: '2026-07-23', profitGuard: lifecycleGuard, now })
  assert.ok(successfulOutcome)
  assert.equal(successfulOutcome.successful, true)
  assert.equal(successfulOutcome.preRoi, '2.2')
  assert.equal(successfulOutcome.postRoi, '2.5')
  const failedOutcome = measureGmvMaxActionOutcome({
    recommendation: executedScale,
    metrics: outcomeMetrics.map((item) => item.statDate > '2026-07-23' ? { ...item, grossRevenue: '240', roi: '2' } : item),
    actionDate: '2026-07-23',
    profitGuard: { ...lifecycleGuard, effectiveRoiFloor: '2.2' },
    now,
  })
  assert.ok(failedOutcome)
  assert.equal(failedOutcome.successful, false)
  assert.equal(measureGmvMaxActionOutcome({ recommendation: executedScale, metrics: outcomeMetrics.slice(0, 5), actionDate: '2026-07-23', profitGuard: lifecycleGuard, now }), null)
  const executedRotation = {
    ...executedScale,
    id: 'executed-creative-rotation',
    actionType: 'creative' as const,
    actionPayload: { operation: 'ROTATE', addCreativeId: 'fresh-video', removeCreativeId: 'fatigue-video' },
  }
  const rotationMetrics = [
    ...['2026-07-20', '2026-07-21', '2026-07-22'].map((statDate, index) => ({
      id: `rotation-before-${index}`, campaignId: baseCampaign.id, storeId: baseCampaign.storeId, creativeId: 'fatigue-video', source: 'owned' as const,
      statDate, cost: '30', grossRevenue: '30', roi: '1', orders: '1', cpa: '30', ctr: '0.01', conversionRate: '0.01', playDepth: '0.1', raw: {}, syncedAt: now,
    })),
    ...['2026-07-24', '2026-07-25', '2026-07-26'].map((statDate, index) => ({
      id: `rotation-after-${index}`, campaignId: baseCampaign.id, storeId: baseCampaign.storeId, creativeId: 'fresh-video', source: 'owned' as const,
      statDate, cost: '30', grossRevenue: '90', roi: '3', orders: '2', cpa: '15', ctr: '0.04', conversionRate: '0.03', playDepth: '0.3', raw: {}, syncedAt: now,
    })),
  ]
  const rotationOutcome = measureGmvMaxActionOutcome({ recommendation: executedRotation, metrics: outcomeMetrics, creativeMetrics: rotationMetrics, actionDate: '2026-07-23', profitGuard: lifecycleGuard, now })
  assert.ok(rotationOutcome)
  assert.equal(rotationOutcome.actionType, 'creative')
  assert.equal(rotationOutcome.operation, 'ROTATE')
  assert.equal(rotationOutcome.primaryCreativeId, 'fresh-video')
  assert.equal(rotationOutcome.comparisonCreativeId, 'fatigue-video')
  assert.equal(rotationOutcome.preOrders, '3')
  assert.equal(rotationOutcome.postOrders, '6')
  assert.equal(rotationOutcome.successful, true)
  const failedRotationOutcome = measureGmvMaxActionOutcome({ recommendation: executedRotation, metrics: outcomeMetrics, creativeMetrics: rotationMetrics.map((item) => item.creativeId === 'fresh-video' ? { ...item, grossRevenue: '0', orders: '0' } : item), actionDate: '2026-07-23', profitGuard: lifecycleGuard, now })
  assert.equal(failedRotationOutcome?.successful, false)
  const feedbackLifecycle = analyzeGmvMaxLifecycle({
    campaign: baseCampaign,
    policy: basePolicy,
    metrics: lifecycleMetrics,
    creativeMetrics: lifecycleCreatives,
    profitGuard: lifecycleGuard,
    actionOutcomes: [successfulOutcome, { ...successfulOutcome, id: 'successful-outcome-2' }],
    now,
  })
  assert.equal(feedbackLifecycle.measuredOutcomeCount, 2)
  assert.equal(feedbackLifecycle.successfulOutcomeCount, 2)
  assert.ok(feedbackLifecycle.signals.includes('strategy_feedback_positive'))

  const fatigueMetrics = ['2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26'].map((statDate, index) => ({
    id: `fatigue-${index}`,
    campaignId: baseCampaign.id,
    storeId: baseCampaign.storeId,
    creativeId: 'fatigue-video',
    itemId: 'fatigue-video',
    itemGroupId: 'product-fatigue',
    source: 'owned' as const,
    statDate,
    cost: '30',
    grossRevenue: index < 2 ? '90' : '45',
    roi: index < 2 ? '3' : '1.5',
    orders: index < 2 ? '4' : '2',
    cpa: '10',
    ctr: index < 2 ? '0.04' : '0.02',
    playDepth: '0.2',
    raw: {},
    syncedAt: now,
  }))
  const fatigueInsight = analyzeGmvMaxCreativeIntelligence({ campaign: baseCampaign, policy: basePolicy, profitGuard: lifecycleGuard, metrics: fatigueMetrics, now })
  assert.equal(fatigueInsight.length, 1)
  assert.equal(fatigueInsight[0].state, 'fatigued')
  assert.equal(fatigueInsight[0].itemGroupId, 'product-fatigue')
  assert.ok(fatigueInsight[0].signals.includes('roi_decay'))
  assert.equal(analyzeGmvMaxCreativeIntelligence({ campaign: baseCampaign, policy: basePolicy, profitGuard: { ...lifecycleGuard, complete: false }, metrics: fatigueMetrics, now })[0].state, 'blocked')
  const sharedVideoMetrics = ['2026-07-25', '2026-07-26'].flatMap((statDate, index) => ([
    { ...fatigueMetrics[index], id: `shared-profit-${index}`, creativeId: 'shared-video', itemId: 'shared-video', itemGroupId: 'product-profit', statDate, cost: '10', grossRevenue: '30', roi: '3', orders: '2' },
    { ...fatigueMetrics[index], id: `shared-loss-${index}`, creativeId: 'shared-video', itemId: 'shared-video', itemGroupId: 'product-loss', statDate, cost: '30', grossRevenue: '0', roi: '0', orders: '0' },
  ]))
  const sharedVideoInsights = analyzeGmvMaxCreativeIntelligence({ campaign: baseCampaign, policy: { ...basePolicy, creativeTestBudget: '50' }, profitGuard: lifecycleGuard, metrics: sharedVideoMetrics, now })
  assert.equal(sharedVideoInsights.length, 2)
  assert.equal(sharedVideoInsights.find((item) => item.itemGroupId === 'product-profit')?.state, 'winner')
  assert.equal(sharedVideoInsights.find((item) => item.itemGroupId === 'product-loss')?.state, 'waste')
  const sharedVideoGuards = evaluateGmvMaxCreativeGuard({ campaign: baseCampaign, policy: { ...basePolicy, creativeTestBudget: '50' }, profitGuard: lifecycleGuard, metrics: sharedVideoMetrics, listEntries: [], now })
  assert.equal(sharedVideoGuards.length, 1)
  assert.deepEqual(sharedVideoGuards[0].actionPayload?.spuIds, ['product-loss'])
  const watchDepthFatigue = analyzeGmvMaxCreativeIntelligence({
    campaign: baseCampaign,
    policy: basePolicy,
    profitGuard: lifecycleGuard,
    metrics: fatigueMetrics.map((item, index) => ({
      ...item,
      grossRevenue: index < 2 ? '90' : '81',
      roi: index < 2 ? '3' : '2.7',
      ctr: index < 2 ? '0.04' : '0.035',
      conversionRate: index < 2 ? '0.08' : '0.03',
      playDepth: index < 2 ? '0.2' : '0.08',
    })),
    now,
  })
  assert.equal(watchDepthFatigue[0].state, 'fatigued')
  assert.ok(watchDepthFatigue[0].signals.includes('play_depth_decay'))

  const donorCampaign = { ...baseCampaign, id: 'donor-campaign', name: 'Donor', budget: '100' }
  const receiverCampaign = { ...baseCampaign, id: 'receiver-campaign', name: 'Receiver', budget: '100' }
  const donorMetrics = ['2026-07-24', '2026-07-25', '2026-07-26'].map((statDate, index) => ({
    ...metrics('low')[0], id: `donor-metric-${index}`, campaignId: donorCampaign.id, statDate, cost: '100', grossRevenue: '100', roi: '1', budgetUtilization: '0.5',
  }))
  const receiverMetrics = ['2026-07-24', '2026-07-25', '2026-07-26'].map((statDate, index) => ({
    ...metrics('high')[0], id: `receiver-metric-${index}`, campaignId: receiverCampaign.id, statDate, cost: '100', grossRevenue: '300', roi: '3', budgetUtilization: '0.9',
  }))
  const receiverInsights = analyzeGmvMaxCreativeIntelligence({
    campaign: receiverCampaign,
    policy: { ...basePolicy, creativeTestBudget: '50' },
    profitGuard: lifecycleGuard,
    metrics: lifecycleCreatives.map((item) => ({ ...item, campaignId: receiverCampaign.id })),
    now,
  })
  assert.equal(receiverInsights[0].state, 'winner')
  const portfolioPlans = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {
      [donorCampaign.id]: { ...basePolicy, campaignId: donorCampaign.id, budgetPermission: true },
      [receiverCampaign.id]: { ...basePolicy, campaignId: receiverCampaign.id, budgetPermission: true },
    },
    learning: {
      [donorCampaign.id]: { ...decliningLifecycle, campaignId: donorCampaign.id, stage: 'declining', score: 25, confidence: 80 },
      [receiverCampaign.id]: { ...scalingLifecycle, campaignId: receiverCampaign.id, stage: 'scaling', score: 90, confidence: 85 },
    },
    creativeInsights: receiverInsights,
    productInsights: [{ ...winningProduct!, campaignId: receiverCampaign.id }],
    metrics: [...donorMetrics, ...receiverMetrics],
    profitGuards: { [donorCampaign.id]: lifecycleGuard, [receiverCampaign.id]: lifecycleGuard },
    now,
  })
  assert.equal(portfolioPlans.length, 1)
  assert.equal(portfolioPlans[0].status, 'proposed')
  assert.equal(portfolioPlans[0].transferAmount, '10')
  assert.equal(portfolioPlans[0].projectedProfitDelta, '10')
  assert.equal(portfolioPlans[0].budgetConserved, true)
  assert.equal(Number(portfolioPlans[0].donorBudgetAfter) + Number(portfolioPlans[0].receiverBudgetAfter), 200)
  assert.equal(portfolioPlans[0].autoExecutable, false)
  const productEvidenceMissingPortfolio = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {
      [donorCampaign.id]: { ...basePolicy, campaignId: donorCampaign.id, budgetPermission: true },
      [receiverCampaign.id]: { ...basePolicy, campaignId: receiverCampaign.id, budgetPermission: true },
    },
    learning: {
      [donorCampaign.id]: { ...decliningLifecycle, campaignId: donorCampaign.id, stage: 'declining', score: 25, confidence: 80 },
      [receiverCampaign.id]: { ...scalingLifecycle, campaignId: receiverCampaign.id, stage: 'scaling', score: 90, confidence: 85 },
    },
    creativeInsights: receiverInsights,
    metrics: [...donorMetrics, ...receiverMetrics],
    profitGuards: { [donorCampaign.id]: lifecycleGuard, [receiverCampaign.id]: lifecycleGuard },
    now,
  })
  assert.equal(productEvidenceMissingPortfolio[0].status, 'blocked')
  assert.equal(productEvidenceMissingPortfolio[0].reason, 'no_scale_ready_receiver')
  const productBlockedPortfolio = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {
      [donorCampaign.id]: { ...basePolicy, campaignId: donorCampaign.id, budgetPermission: true },
      [receiverCampaign.id]: { ...basePolicy, campaignId: receiverCampaign.id, budgetPermission: true },
    },
    learning: {
      [donorCampaign.id]: { ...decliningLifecycle, campaignId: donorCampaign.id, stage: 'declining', score: 25, confidence: 80 },
      [receiverCampaign.id]: { ...scalingLifecycle, campaignId: receiverCampaign.id, stage: 'scaling', score: 90, confidence: 85 },
    },
    creativeInsights: receiverInsights,
    productInsights: [{ ...losingProduct!, campaignId: receiverCampaign.id }],
    metrics: [...donorMetrics, ...receiverMetrics],
    profitGuards: { [donorCampaign.id]: lifecycleGuard, [receiverCampaign.id]: lifecycleGuard },
    now,
  })
  assert.equal(productBlockedPortfolio[0].status, 'blocked')
  assert.equal(productBlockedPortfolio[0].reason, 'no_scale_ready_receiver')
  const productWinnerPortfolio = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {
      [donorCampaign.id]: { ...basePolicy, campaignId: donorCampaign.id, budgetPermission: true },
      [receiverCampaign.id]: { ...basePolicy, campaignId: receiverCampaign.id, budgetPermission: true },
    },
    learning: {
      [donorCampaign.id]: { ...decliningLifecycle, campaignId: donorCampaign.id, stage: 'declining', score: 25, confidence: 80 },
      [receiverCampaign.id]: { ...scalingLifecycle, campaignId: receiverCampaign.id, stage: 'scaling', score: 90, confidence: 85 },
    },
    creativeInsights: receiverInsights,
    productInsights: [{ ...winningProduct!, campaignId: receiverCampaign.id, state: 'winner' }],
    metrics: [...donorMetrics, ...receiverMetrics],
    profitGuards: { [donorCampaign.id]: lifecycleGuard, [receiverCampaign.id]: lifecycleGuard },
    now,
  })
  assert.equal(productWinnerPortfolio[0].status, 'blocked')
  assert.equal(productWinnerPortfolio[0].reason, 'no_scale_ready_receiver')
  const productReadyPortfolio = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {
      [donorCampaign.id]: { ...basePolicy, campaignId: donorCampaign.id, budgetPermission: true },
      [receiverCampaign.id]: { ...basePolicy, campaignId: receiverCampaign.id, budgetPermission: true },
    },
    learning: {
      [donorCampaign.id]: { ...decliningLifecycle, campaignId: donorCampaign.id, stage: 'declining', score: 25, confidence: 80 },
      [receiverCampaign.id]: { ...scalingLifecycle, campaignId: receiverCampaign.id, stage: 'scaling', score: 90, confidence: 85 },
    },
    creativeInsights: receiverInsights,
    productInsights: [{ ...winningProduct!, campaignId: receiverCampaign.id }],
    metrics: [...donorMetrics, ...receiverMetrics],
    profitGuards: { [donorCampaign.id]: lifecycleGuard, [receiverCampaign.id]: lifecycleGuard },
    now,
  })
  assert.equal(productReadyPortfolio[0].status, 'proposed')
  const inconsistentDirectionPortfolio = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {
      [donorCampaign.id]: { ...basePolicy, campaignId: donorCampaign.id, budgetPermission: true },
      [receiverCampaign.id]: { ...basePolicy, campaignId: receiverCampaign.id, budgetPermission: true },
    },
    learning: {
      [donorCampaign.id]: { ...decliningLifecycle, campaignId: donorCampaign.id, stage: 'declining', score: 25, confidence: 80 },
      [receiverCampaign.id]: { ...scalingLifecycle, campaignId: receiverCampaign.id, stage: 'scaling', score: 90, confidence: 85 },
    },
    creativeInsights: receiverInsights,
    productInsights: [{ ...winningProduct!, campaignId: receiverCampaign.id }],
    metrics: [...donorMetrics, ...receiverMetrics.map((item, index) => index === 2
      ? { ...item, grossRevenue: '100', roi: '1' }
      : { ...item, grossRevenue: '400', roi: '4' })],
    profitGuards: { [donorCampaign.id]: lifecycleGuard, [receiverCampaign.id]: lifecycleGuard },
    now,
  })
  assert.equal(inconsistentDirectionPortfolio[0].status, 'blocked')
  assert.equal(inconsistentDirectionPortfolio[0].reason, 'no_scale_ready_receiver')
  const automaticPortfolio = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {
      [donorCampaign.id]: { ...basePolicy, campaignId: donorCampaign.id, budgetPermission: true, automationEnabled: true, pilotEnabled: true, shadowMode: false, shadowStartedAt: now - 8 * 24 * 60 * 60 * 1000 },
      [receiverCampaign.id]: { ...basePolicy, campaignId: receiverCampaign.id, budgetPermission: true, automationEnabled: true, pilotEnabled: true, shadowMode: false, shadowStartedAt: now - 8 * 24 * 60 * 60 * 1000 },
    },
    learning: {
      [donorCampaign.id]: { ...decliningLifecycle, campaignId: donorCampaign.id, stage: 'declining', score: 25, confidence: 80 },
      [receiverCampaign.id]: { ...scalingLifecycle, campaignId: receiverCampaign.id, stage: 'scaling', score: 90, confidence: 85 },
    },
    creativeInsights: receiverInsights,
    productInsights: [{ ...winningProduct!, campaignId: receiverCampaign.id }],
    metrics: [...donorMetrics, ...receiverMetrics],
    profitGuards: { [donorCampaign.id]: lifecycleGuard, [receiverCampaign.id]: lifecycleGuard },
    now,
  })
  assert.equal(automaticPortfolio[0].autoExecutable, true)
  const blockedPortfolio = buildGmvMaxPortfolioPlans({
    storeId: baseCampaign.storeId,
    campaigns: [donorCampaign, receiverCampaign],
    policies: {}, learning: {}, creativeInsights: [], metrics: [], profitGuards: {}, now,
  })
  assert.equal(blockedPortfolio[0].status, 'blocked')
  assert.equal(blockedPortfolio[0].reason, 'insufficient_profit_coverage')

  const successfulBudgets = new Map([['donor-campaign', '100'], ['receiver-campaign', '100']])
  const successfulUpdates: string[] = []
  await executeGmvMaxPortfolioTransfer({
    donorCampaignId: 'donor-campaign', receiverCampaignId: 'receiver-campaign',
    donorBudgetBefore: '100', donorBudgetAfter: '90', receiverBudgetBefore: '100', receiverBudgetAfter: '110',
    verifyBudget: async (campaignId, expected) => assert.equal(successfulBudgets.get(campaignId), expected),
    updateBudget: async (campaignId, budget) => { successfulUpdates.push(`${campaignId}:${budget}`); successfulBudgets.set(campaignId, budget); return { campaignId, budget } },
  })
  assert.deepEqual(successfulUpdates, ['donor-campaign:90', 'receiver-campaign:110'])
  assert.deepEqual([...successfulBudgets.values()], ['90', '110'])

  const rollbackBudgets = new Map([['donor-campaign', '100'], ['receiver-campaign', '100']])
  await assert.rejects(async () => await executeGmvMaxPortfolioTransfer({
    donorCampaignId: 'donor-campaign', receiverCampaignId: 'receiver-campaign',
    donorBudgetBefore: '100', donorBudgetAfter: '90', receiverBudgetBefore: '100', receiverBudgetAfter: '110',
    verifyBudget: async (campaignId, expected) => assert.equal(rollbackBudgets.get(campaignId), expected),
    updateBudget: async (campaignId, budget) => {
      if (campaignId === 'receiver-campaign') throw new Error('receiver update failed')
      rollbackBudgets.set(campaignId, budget)
      return { campaignId, budget }
    },
  }), (error: unknown) => error instanceof GmvMaxPortfolioExecutionError && error.rollbackApplied)
  assert.deepEqual([...rollbackBudgets.values()], ['100', '100'])

  const failedRollbackBudgets = new Map([['donor-campaign', '100'], ['receiver-campaign', '100']])
  let donorUpdates = 0
  await assert.rejects(async () => await executeGmvMaxPortfolioTransfer({
    donorCampaignId: 'donor-campaign', receiverCampaignId: 'receiver-campaign',
    donorBudgetBefore: '100', donorBudgetAfter: '90', receiverBudgetBefore: '100', receiverBudgetAfter: '110',
    verifyBudget: async (campaignId, expected) => assert.equal(failedRollbackBudgets.get(campaignId), expected),
    updateBudget: async (campaignId, budget) => {
      if (campaignId === 'receiver-campaign') throw new Error('receiver update failed')
      donorUpdates += 1
      if (donorUpdates > 1) throw new Error('rollback update failed')
      failedRollbackBudgets.set(campaignId, budget)
      return { campaignId, budget }
    },
  }), (error: unknown) => error instanceof GmvMaxPortfolioExecutionError && !error.rollbackApplied && /rollback failed/.test(error.message))
  assert.equal(failedRollbackBudgets.get('donor-campaign'), '90')

  const realtime = evaluateGmvMaxRealtimeGuard({
    campaign: baseCampaign, policy: { ...basePolicy, targetCpa: '20' }, now,
    samples: [{ id: 'realtime-1', campaignId: baseCampaign.id, syncedAt: now - 1, cost: '29', orders: '0', grossRevenue: '0', statDate: '2026-07-27' }, { id: 'realtime-2', campaignId: baseCampaign.id, syncedAt: now, cost: '30', orders: '0', grossRevenue: '0', statDate: '2026-07-27' }],
  })
  assert.equal(realtime?.actionType, 'budget')
  assert.equal(realtime?.proposedBudget, '90')
  const pause = evaluateGmvMaxRealtimeGuard({
    campaign: baseCampaign, policy: { ...basePolicy, targetCpa: '20', pauseOnZeroOrders: true, statusPermission: true, pilotEnabled: true, shadowMode: false, automationEnabled: true }, now,
    samples: [{ id: 'pause-1', campaignId: baseCampaign.id, syncedAt: now - 1, cost: '59', orders: '0', grossRevenue: '0', statDate: '2026-07-27' }, { id: 'pause-2', campaignId: baseCampaign.id, syncedAt: now, cost: '60', orders: '0', grossRevenue: '0', statDate: '2026-07-27' }],
  })
  assert.equal(pause?.actionType, 'status')
  assert.equal(pause?.autoExecutable, true)

  const pacingSamples = [
    { id: 'pacing-1', campaignId: baseCampaign.id, syncedAt: now - 30 * 60 * 1000, cost: '54', orders: '0', grossRevenue: '0', statDate: '2026-07-27' },
    { id: 'pacing-2', campaignId: baseCampaign.id, syncedAt: now, cost: '58', orders: '0', grossRevenue: '0', statDate: '2026-07-27' },
  ]
  const pacing = evaluateGmvMaxPacingDiagnostic({ campaign: baseCampaign, samples: pacingSamples, timezone: 'Asia/Bangkok', localDate: '2026-07-27', localHour: 12, localMinute: 0, now })
  assert.equal(pacing.dataStable, true)
  assert.equal(pacing.state, 'overspend')
  assert.equal(pacing.expectedSpendRatio, '0.28')
  assert.equal(pacing.actualSpendRatio, '0.58')
  const timestampPacing = evaluateGmvMaxPacingDiagnostic({
    campaign: baseCampaign,
    samples: pacingSamples.map((item) => ({ ...item, statDate: `${item.statDate} 00:00:00` })),
    timezone: 'Asia/Bangkok',
    localDate: '2026-07-27',
    localHour: 12,
    localMinute: 0,
    now,
  })
  assert.equal(timestampPacing.dataStable, true)
  assert.equal(timestampPacing.state, 'overspend')
  const duplicateSyncPacing = evaluateGmvMaxPacingDiagnostic({
    campaign: baseCampaign,
    samples: [...pacingSamples, { ...pacingSamples[1], id: 'pacing-duplicate-sync', syncedAt: now + 2 * 60 * 1000, cost: '59' }],
    timezone: 'Asia/Bangkok',
    localDate: '2026-07-27',
    localHour: 12,
    localMinute: 2,
    now: now + 2 * 60 * 1000,
  })
  assert.equal(duplicateSyncPacing.dataStable, true)
  assert.equal(duplicateSyncPacing.currentCost, '59')
  const pacingRecommendation = evaluateGmvMaxRealtimeGuard({
    campaign: baseCampaign,
    policy: { ...basePolicy, targetCpa: '100' },
    profitGuard,
    pacing,
    samples: pacingSamples,
    now,
  })
  assert.equal(pacingRecommendation?.actionType, 'budget')
  assert.match(pacingRecommendation?.reason || '', /account-timezone pacing curve/)

  const unstablePacing = evaluateGmvMaxPacingDiagnostic({
    campaign: baseCampaign,
    samples: [{ ...pacingSamples[0], id: 'unstable-1', cost: '60' }, { ...pacingSamples[1], id: 'unstable-2', cost: '58' }],
    timezone: 'Asia/Bangkok',
    localDate: '2026-07-27',
    localHour: 12,
    localMinute: 0,
    now,
  })
  assert.equal(unstablePacing.state, 'unstable')
  assert.equal(unstablePacing.reason, 'metrics_regressed')

  const creativeMetrics = ['2026-07-25', '2026-07-26'].map((statDate, index) => ({
    id: `creative-${index}`, campaignId: baseCampaign.id, storeId: baseCampaign.storeId, creativeId: 'video-1', itemId: 'video-1', itemGroupId: 'product-1', source: 'owned' as const,
    statDate, cost: '30', grossRevenue: '0', roi: '0', orders: '0', cpa: '0', ctr: '0', playDepth: '0', raw: {}, syncedAt: now,
  }))
  assert.equal(evaluateGmvMaxCreativeGuard({ campaign: baseCampaign, policy: { ...basePolicy, creativeTestBudget: '50' }, profitGuard, metrics: creativeMetrics, listEntries: [], now }).length, 1)
  assert.equal(evaluateGmvMaxCreativeGuard({ campaign: baseCampaign, policy: { ...basePolicy, creativeTestBudget: '50' }, profitGuard: { ...profitGuard, complete: false }, metrics: creativeMetrics, listEntries: [], now }).length, 1)
  const zeroCostOrders = creativeMetrics.map((item, index) => ({ ...item, id: `zero-cost-orders-${index}`, cost: '0', grossRevenue: '60', orders: '2' }))
  assert.equal(evaluateGmvMaxCreativeGuard({ campaign: baseCampaign, policy: { ...basePolicy, creativeTestBudget: '50' }, profitGuard, metrics: zeroCostOrders, listEntries: [], now }).length, 0)
  assert.equal(evaluateGmvMaxCreativeGuard({ campaign: baseCampaign, policy: { ...basePolicy, creativeTestBudget: '50' }, profitGuard, metrics: creativeMetrics, listEntries: [{ id: 'allow-1', storeId: baseCampaign.storeId, entityType: 'creative', entityId: 'video-1', mode: 'allow', updatedAt: now }], now }).length, 0)
  const deniedCreative = evaluateGmvMaxCreativeGuard({
    campaign: baseCampaign,
    policy: { ...basePolicy, creativeTestBudget: '0' },
    profitGuard,
    metrics: [{ ...creativeMetrics[0], cost: '1', orders: '1', grossRevenue: '10' }],
    listEntries: [{ id: 'deny-1', storeId: baseCampaign.storeId, entityType: 'creative', entityId: 'video-1', mode: 'deny', updatedAt: now }],
    now,
  })
  assert.equal(deniedCreative.length, 1)
  assert.equal(deniedCreative[0].actionPayload?.operation, 'REMOVE')
  assert.match(deniedCreative[0].reason, /exclusion list/)
  assert.equal(evaluateGmvMaxCreativeGuard({
    campaign: baseCampaign,
    policy: { ...basePolicy, creativeTestBudget: '0' },
    profitGuard,
    metrics: [{ ...creativeMetrics[0], status: 'EXCLUDED' }],
    listEntries: [{ id: 'deny-2', storeId: baseCampaign.storeId, entityType: 'creative', entityId: 'video-1', mode: 'deny', updatedAt: now }],
    now,
  }).length, 0)
  assert.equal(evaluateGmvMaxCreativeGuard({
    campaign: baseCampaign,
    policy: { ...basePolicy, creativeTestBudget: '0' },
    profitGuard,
    metrics: [{ ...creativeMetrics[0], cost: '1', orders: '1', grossRevenue: '10' }],
    listEntries: [
      { id: 'deny-old', storeId: baseCampaign.storeId, entityType: 'creative', entityId: 'video-1', mode: 'deny', updatedAt: now - 1 },
      { id: 'allow-new', storeId: baseCampaign.storeId, entityType: 'creative', entityId: 'video-1', mode: 'allow', updatedAt: now },
    ],
    now,
  }).length, 0)
  const replacementAsset = { id: 'asset-fresh', storeId: baseCampaign.storeId, creativeId: 'fresh-video', kind: 'video' as const, status: 'AVAILABLE', raw: { item_group_id: 'product-fatigue' }, syncedAt: now }
  const otherCampaignAsset = { ...replacementAsset, id: 'asset-other-campaign', campaignId: 'other-campaign', creativeId: 'other-campaign-video' }
  const otherStoreAsset = { ...replacementAsset, id: 'asset-other-store', storeId: 'other-store', creativeId: 'other-store-video' }
  const rotationPlans = evaluateGmvMaxCreativeRotationPlan({
    campaign: baseCampaign, policy: basePolicy, profitGuard: lifecycleGuard, lifecycle: scalingLifecycle,
    insights: fatigueInsight, assets: [otherCampaignAsset, otherStoreAsset, replacementAsset], listEntries: [], now,
  })
  assert.equal(rotationPlans.length, 1)
  assert.equal(rotationPlans[0].actionPayload?.operation, 'ROTATE')
  assert.equal(rotationPlans[0].actionPayload?.addCreativeId, 'fresh-video')
  assert.equal(rotationPlans[0].actionPayload?.removeCreativeId, 'fatigue-video')
  assert.deepEqual(rotationPlans[0].actionPayload?.spuIds, ['product-fatigue'])
  assert.equal(rotationPlans[0].autoExecutable, false)
  assert.equal(evaluateGmvMaxCreativeRotationPlan({ campaign: baseCampaign, policy: basePolicy, profitGuard: lifecycleGuard, lifecycle: scalingLifecycle, insights: fatigueInsight, assets: [replacementAsset], listEntries: [{ id: 'protect-fatigue', storeId: baseCampaign.storeId, entityType: 'creative', entityId: 'fatigue-video', mode: 'allow', updatedAt: now }], now }).length, 0)
  const supplyPlans = evaluateGmvMaxCreativeRotationPlan({
    campaign: baseCampaign,
    policy: { ...basePolicy, automationEnabled: true, pilotEnabled: true, shadowMode: false, shadowStartedAt: now - 8 * 24 * 60 * 60 * 1000, creativePermission: true, creativeTestBudget: '50' },
    profitGuard: lifecycleGuard,
    lifecycle: { ...validationLifecycle, stage: 'validation', confidence: 75 },
    insights: [], assets: [replacementAsset], listEntries: [], now,
  })
  assert.equal(supplyPlans[0].actionPayload?.operation, 'ADD')
  assert.equal(supplyPlans[0].autoExecutable, true)
  const creativeExperiment = buildGmvMaxCreativeExperiment({
    campaign: baseCampaign,
    policy: { ...basePolicy, creativeTestBudget: '50', creativeExplorationSharePercent: 15, minExplorationCreatives: 3, winnerTrafficCapPercent: 70 },
    profitGuard: lifecycleGuard,
    insights: fatigueInsight,
    assets: [otherCampaignAsset, otherStoreAsset, replacementAsset],
    recommendations: rotationPlans,
    listEntries: [],
    now,
  })
  assert.equal(creativeExperiment.state, 'rotation_pending')
  assert.equal(creativeExperiment.explorationBudget, '15')
  assert.equal(creativeExperiment.candidate?.creativeId, 'fresh-video')
  assert.equal(creativeExperiment.retiring?.creativeId, 'fatigue-video')

  const rotationUpdates: string[] = []
  await executeGmvMaxCreativeRotation({
    addCreativeId: 'fresh-video', removeCreativeId: 'fatigue-video',
    updateCreative: async (operation, creativeId) => { rotationUpdates.push(`${operation}:${creativeId}`); return { operation, creativeId } },
  })
  assert.deepEqual(rotationUpdates, ['ADD:fresh-video', 'REMOVE:fatigue-video'])
  const compensatedUpdates: string[] = []
  await assert.rejects(async () => await executeGmvMaxCreativeRotation({
    addCreativeId: 'fresh-video', removeCreativeId: 'fatigue-video',
    updateCreative: async (operation, creativeId) => {
      compensatedUpdates.push(`${operation}:${creativeId}`)
      if (creativeId === 'fatigue-video') throw new Error('retire failed')
      return { operation, creativeId }
    },
  }), (error: unknown) => error instanceof GmvMaxCreativeRotationError && error.rollbackApplied)
  assert.deepEqual(compensatedUpdates, ['ADD:fresh-video', 'REMOVE:fatigue-video', 'REMOVE:fresh-video'])
  let failedRotationUpdates = 0
  await assert.rejects(async () => await executeGmvMaxCreativeRotation({
    addCreativeId: 'fresh-video', removeCreativeId: 'fatigue-video',
    updateCreative: async () => {
      failedRotationUpdates += 1
      if (failedRotationUpdates >= 2) throw new Error(failedRotationUpdates === 2 ? 'retire failed' : 'rollback failed')
      return { ok: true }
    },
  }), (error: unknown) => error instanceof GmvMaxCreativeRotationError && !error.rollbackApplied && /rollback failed/.test(error.message))
  assert.deepEqual(GMV_MAX_REQUIRED_TOOLS, [
    'auth_advertiser_get',
    'gmv_max_store_list_get',
    'gmv_max_campaign_get',
    'campaign_gmv_max_info_get',
    'gmv_max_bid_recommend_get',
    'gmv_max_report_get',
    'gmv_max_identity_get',
    'gmv_max_video_get',
    'campaign_gmv_max_update',
  ])
  assert.deepEqual(GMV_MAX_CAPABILITY_TOOLS.session_write, ['campaign_gmv_max_session_create', 'campaign_gmv_max_session_update', 'campaign_gmv_max_session_delete'])
  assert.deepEqual(resolveGmvMaxAccountMetadata(
    { currency_code: 'vnd', timezone_name: 'Asia/Ho_Chi_Minh' },
    {},
  ), { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' })
  assert.deepEqual(resolveGmvMaxAccountMetadata({}, { currency: 'USD', time_zone: 'America/Los_Angeles' }), { currency: 'USD', timezone: 'America/Los_Angeles' })
  assert.deepEqual(resolveGmvMaxAccountMetadata({ currency: 'USD', timezone: 'invalid' }), { currency: 'USD', timezone: undefined })
  assert.deepEqual(resolveGmvMaxAccountMetadata({ data: { advertiser: { currency_code: 'vnd', timezone_name: 'Asia/Ho_Chi_Minh' } } }), { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' })
  assert.deepEqual(
    mergeGmvMaxAccountMetadata(
      { currency: '', timezone: 'invalid' },
      { currency: 'vnd', timezone: 'Asia/Ho_Chi_Minh' },
    ),
    { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
  )
  assert.deepEqual(resolveGmvMaxAccountMetadataRequest({ advertiser_info_get: { properties: { advertiser_ids: { type: 'array' } } } }, 'advertiser-1'), {
    tool: 'advertiser_info_get', args: { advertiser_ids: ['advertiser-1'] },
  })
  assert.deepEqual(resolveGmvMaxAccountMetadataRequest({ advertiser_get: { properties: { advertiser_id: { type: 'string' } } } }, 'advertiser-1'), {
    tool: 'advertiser_get', args: { advertiser_id: 'advertiser-1' },
  })
  assert.deepEqual(resolveGmvMaxAccountMetadataRequest({ advertiser_account_info: { properties: { advertiser_id: { type: 'string' } } } }, 'advertiser-1'), {
    tool: 'advertiser_account_info', args: { advertiser_id: 'advertiser-1' },
  })
  assert.equal(resolveGmvMaxAccountMetadataRequest({ auth_advertiser_get: { properties: { advertiser_ids: { type: 'array' } } } }, 'advertiser-1'), null)
  assert.equal(resolveGmvMaxAccountMetadataRequest({}, 'advertiser-1'), null)
  assert.equal(normalizeGmvMaxExchangeRate(0.00028), '0.00028')
  assert.equal(parseGmvMaxExchangeRate('0.00028'), 280_000_000n)
  assert.equal(convertGmvMaxMoneyToCny('10000', '0.00028'), '2.8')
  const fetchedRate = await fetchGmvMaxCnyExchangeRate('VND', {
    now,
    fetchImpl: async () => new Response(JSON.stringify({ result: 'success', rates: { CNY: 0.000281234567 }, time_last_update_unix: now / 1_000 }), { status: 200 }),
  })
  assert.deepEqual(fetchedRate, { rate: '0.000281234567', source: 'ExchangeRate-API', updatedAt: now })
  const failedRate = await fetchGmvMaxCnyExchangeRate('USD', { fetchImpl: async () => new Response('{}', { status: 200 }) })
  assert.match(failedRate.error || '', /missing or invalid/)
  const timeoutRate = await fetchGmvMaxCnyExchangeRate('USD', {
    timeoutMs: 1,
    fetchImpl: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }),
  })
  assert.match(timeoutRate.error || '', /aborted/)
  let exchangeRateRequests = 0
  const loadExchangeRate = createGmvMaxExchangeRateLoader(async (currency) => {
    exchangeRateRequests += 1
    return { rate: currency === 'VND' ? '0.00028' : '1' }
  })
  await Promise.all([loadExchangeRate('vnd'), loadExchangeRate('VND')])
  assert.equal(exchangeRateRequests, 1)

  assert.deepEqual(validateGmvMaxOAuthCallback(new URL('http://127.0.0.1/callback?code=code-1&state=state-1'), 'state-1'), { code: 'code-1' })
  assert.throws(() => validateGmvMaxOAuthCallback(new URL('http://127.0.0.1/callback?code=code-1&state=wrong'), 'state-1'), /state validation failed/)
  assert.throws(() => validateGmvMaxOAuthCallback(new URL('http://127.0.0.1/callback?error=access_denied&state=state-1'), 'state-1'), /access_denied/)
  assert.deepEqual(parseGmvMaxMcpContent({ structuredContent: { value: 1 } }), { value: 1 })
  assert.deepEqual(parseGmvMaxMcpContent({ content: [{ type: 'text', text: '{"value":2}' }] }), { value: 2 })

  let runtimeCount = 0
  let closeCount = 0
  const reconnectingClient = createGmvMaxMcpClient(async () => {
    runtimeCount += 1
    const currentRuntime = runtimeCount
    return {
      missingTools: [],
      provider: { closeCallbackServer() {} },
      client: {
        async callTool() {
          if (currentRuntime === 1) throw new UnauthorizedError('expired')
          return { content: [{ type: 'text', text: '{"ok":true}' }] }
        },
        async close() { closeCount += 1 },
      },
    } as any
  })
  assert.deepEqual((await reconnectingClient.call('connection-1', 'auth_advertiser_get', {})).data, { ok: true })
  assert.equal(runtimeCount, 2)
  assert.equal(closeCount, 1)

  const incompatibleClient = createGmvMaxMcpClient(async () => ({
    missingTools: ['campaign_gmv_max_update'],
    provider: { closeCallbackServer() {} },
    client: { async callTool() { throw new Error('must not run') }, async close() {} },
  } as any))
  await assert.rejects(() => incompatibleClient.call('connection-2', 'campaign_gmv_max_update', {}), /tool is unavailable/)

  let rateLimitAttempts = 0
  const rateLimitedClient = createGmvMaxMcpClient(async () => ({
    missingTools: [],
    provider: { closeCallbackServer() {} },
    client: {
      async callTool() {
        rateLimitAttempts += 1
        if (rateLimitAttempts < 3) return { isError: true, content: [{ type: 'text', text: 'rate limit exceeded' }] }
        return { content: [{ type: 'text', text: '{"ok":true}' }] }
      },
      async close() {},
    },
  } as any), { minIntervalMs: 0, retryDelaysMs: [0, 0] })
  assert.deepEqual((await rateLimitedClient.call('connection-3', 'auth_advertiser_get', {})).data, { ok: true })
  assert.equal(rateLimitAttempts, 3)

  const businessErrorClient = createGmvMaxMcpClient(async () => ({
    missingTools: [],
    provider: { closeCallbackServer() {} },
    client: {
      async callTool() {
        return {
          isError: false,
          content: [{ type: 'text', text: '{"code":40002,"message":"filtering is required"}' }],
        }
      },
      async close() {},
    },
  } as any), { minIntervalMs: 0 })
  await assert.rejects(
    () => businessErrorClient.call('connection-4', 'gmv_max_campaign_get', {}),
    /code=40002, filtering is required/,
  )

  const serviceSource = await readFile(new URL('../src/main/modules/tiktok-gmv-max/service.ts', import.meta.url), 'utf8')
  const campaignQuerySource = serviceSource.slice(
    serviceSource.indexOf("gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_campaign_get'"),
    serviceSource.indexOf('const currentRows = findArray', serviceSource.indexOf("gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_campaign_get'")),
  )
  assert.match(campaignQuerySource, /store_ids: \[binding\.storeId\]/)
  assert.match(campaignQuerySource, /binding\.campaignType === 'LIVE' \? 'LIVE_GMV_MAX' : 'PRODUCT_GMV_MAX'/)
  assert.doesNotMatch(campaignQuerySource, /shopping_ads_type/)
  assert.match(serviceSource, /shopping_ads_type: binding\.campaignType/)
  assert.match(serviceSource, /optimization_goal: 'VALUE'/)
  assert.match(serviceSource, /campaign_ids: batch\.map\(\(campaign\) => campaign\.id\)/)
  assert.match(serviceSource, /chunks\(campaigns, 100\)/)
  assert.match(serviceSource, /hasNextGmvMaxPage/)
  assert.match(serviceSource, /repeatedPage/)
  assert.doesNotMatch(serviceSource, /\sfilters: \{/)
  assert.match(serviceSource, /item\.campaignId === campaignId/)
  assert.match(serviceSource, /executeGmvMaxPortfolioTransfer/)
  assert.match(serviceSource, /executeGmvMaxCreativeRotation/)
  assert.match(serviceSource, /buildGmvMaxCreativeMetricId\(metric\)/)
  assert.match(serviceSource, /removeCreativeMetric\(legacyId\)/)
  assert.match(serviceSource, /if \(!bindings\.length\) return \[\]/)
  assert.match(serviceSource, /measureLearningOutcomes\(now, campaigns, profitData\)/)
  const creativePageSource = serviceSource.slice(serviceSource.indexOf('function creativePage'), serviceSource.indexOf('function campaignDataPage'))
  assert.match(creativePageSource, /listCreativeMetricAggregatePage/)
  assert.doesNotMatch(creativePageSource, /listCreativeMetricsRange/)
  assert.doesNotMatch(creativePageSource, /rows\.slice/)

  const ipcSource = await readFile(new URL('../src/main/ipc/registerTiktokGmvMaxIpc.ts', import.meta.url), 'utf8')
  for (const channel of ['getDashboard', 'getCampaignPage', 'getCreativePage', 'getProductPage', 'getProductCostPage', 'getProductCost', 'exportProductCosts', 'importProductCosts', 'getListEntryPage', 'getActionPage', 'getAuditPage', 'connect', 'reconnect', 'disconnect', 'sync', 'syncAccounts', 'syncCampaigns', 'getReport', 'evaluate', 'analyzeGrowth', 'syncRealtime', 'savePolicy', 'approve', 'approveBatch', 'setEmergencyStop', 'reject', 'approvePortfolio', 'rejectPortfolio', 'saveStoreCost', 'saveProductCost', 'saveRuleGroup', 'bindRuleGroup', 'unbindRuleGroup', 'saveListEntry', 'backtest', 'rollback', 'saveNotificationConfig']) {
    assert.match(ipcSource, new RegExp(`plugin:tiktokGmvMax:${channel}`))
  }

  const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
  assert.match(preloadSource, /tiktokGmvMax:/)
  assert.match(preloadSource, /getCampaignPage:/)
  const rendererSource = await readFile(new URL('../src/renderer/src/ui/views/TiktokGmvMaxOptimizerView.vue', import.meta.url), 'utf8')
  const percentageInputSource = rendererSource.slice(
    rendererSource.indexOf('function percentInputValue'),
    rendererSource.indexOf('function campaignStoreId'),
  )
  assert.match(percentageInputSource, /parsed \* 100/)
  assert.match(percentageInputSource, /parsed \/ 100/)
  assert.match(rendererSource, /gmvMaxRateInput\.example/)
  assert.match(rendererSource, /max="100"/)
  const storeCostSaveSource = rendererSource.slice(
    rendererSource.indexOf('function saveStoreCost'),
    rendererSource.indexOf('function saveProductCost'),
  )
  assert.match(storeCostSaveSource, /const payload = \{ \.\.\.draft \}/)
  assert.match(storeCostSaveSource, /saveStoreCost\(payload as any\)/)
  assert.match(preloadSource, /getProductPage:/)
  assert.match(preloadSource, /importProductCosts:/)
  assert.doesNotMatch(preloadSource, /tiktokGmvMax[\s\S]{0,1000}(accessToken|refreshToken|authorizationHeader)/i)

  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'videogen-gmv-max-'))
  process.env.VIDEOGENERATE_DATA_DIR = dataRoot
  const legacyDbDir = path.join(dataRoot, 'db')
  await mkdir(legacyDbDir, { recursive: true })
  const legacyDb = new DatabaseSync(path.join(legacyDbDir, 'tiktok-gmv-max.sqlite'))
  legacyDb.exec('CREATE TABLE gmv_creative_metrics (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, stat_date TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL)')
  const legacyCreativeMetric = {
    id: 'legacy-rate-metric', campaignId: 'migration-campaign', storeId: 'store-1', creativeId: 'legacy-creative', source: 'owned',
    statDate: '2026-01-01', cost: '1', grossRevenue: '2', roi: '2', orders: '1', cpa: '1', ctr: '5.00', conversionRate: '4.00',
    play2sRate: '60.00', playDepth: '25.00', raw: { product_click_rate: '5.00', ad_conversion_rate: '4.00', ad_video_view_rate_2s: '60.00', ad_video_view_rate_6s: '25.00' }, syncedAt: now,
  }
  legacyDb.prepare('INSERT INTO gmv_creative_metrics (id, campaign_id, stat_date, synced_at, payload) VALUES (?, ?, ?, ?, ?)')
    .run(legacyCreativeMetric.id, legacyCreativeMetric.campaignId, legacyCreativeMetric.statDate, legacyCreativeMetric.syncedAt, JSON.stringify(legacyCreativeMetric))
  legacyDb.close()
  const { closeGmvMaxSqlite, gmvMaxRepo } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  try {
    const migratedCreativeMetric = gmvMaxRepo.listCreativeMetrics().find((item) => item.id === legacyCreativeMetric.id)
    assert.equal(migratedCreativeMetric?.ctr, '0.05')
    assert.equal(migratedCreativeMetric?.conversionRate, '0.04')
    assert.equal(migratedCreativeMetric?.play2sRate, '0.6')
    assert.equal(migratedCreativeMetric?.playDepth, '0.25')
    await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const timestamp = now + index
      gmvMaxRepo.saveConnection({
        id: `connection-${index}`,
        name: `Connection ${index}`,
        state: 'connected',
        serverUrl: 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat',
        missingTools: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }))
    assert.equal(gmvMaxRepo.listConnections().length, 20)
    const metricOne = { ...metrics('high')[0], id: 'paged-metric-one', campaignId: 'campaign-one', statDate: '2026-07-25' }
    const metricTwo = { ...metrics('high')[0], id: 'paged-metric-two', campaignId: 'campaign-two', statDate: '2026-07-25' }
    gmvMaxRepo.saveMetric(metricOne)
    gmvMaxRepo.saveMetric(metricTwo)
    assert.deepEqual(gmvMaxRepo.listMetricsRange('2026-07-20', '2026-07-27', ['campaign-one']).map((item) => item.id), ['paged-metric-one'])
    const metricEndDate = { ...metricOne, id: 'paged-metric-end-date', statDate: '2026-07-27 00:00:00' }
    gmvMaxRepo.saveMetric(metricEndDate)
    assert.deepEqual(gmvMaxRepo.listMetricsRange('2026-07-27', '2026-07-27', ['campaign-one']).map((item) => item.id), ['paged-metric-end-date'])
    const creativeOne = { ...productMetrics[0], id: 'paged-creative-one', campaignId: 'campaign-one', storeId: 'store-1', source: 'owned' as const }
    const creativeTwo = { ...productMetrics[0], id: 'paged-creative-two', campaignId: 'campaign-two', storeId: 'store-2', source: 'affiliate' as const }
    gmvMaxRepo.saveCreativeMetric(creativeOne)
    gmvMaxRepo.saveCreativeMetric(creativeTwo)
    assert.deepEqual(gmvMaxRepo.listCreativeMetricsRange('2026-07-20', '2026-07-27', { campaignIds: ['campaign-one'], storeId: 'store-1', source: 'owned' }).map((item) => item.id), ['paged-creative-one'])
    const creativeEndDate = { ...creativeOne, id: 'paged-creative-end-date', statDate: '2026-07-27 00:00:00', cost: '7', grossRevenue: '21', orders: '1' }
    gmvMaxRepo.saveCreativeMetric(creativeEndDate)
    assert.deepEqual(gmvMaxRepo.listCreativeMetricsRange('2026-07-27', '2026-07-27', { campaignIds: ['campaign-one'] }).map((item) => item.id), ['paged-creative-end-date'])
    const creativeAggregates = gmvMaxRepo.listCreativeMetricAggregatesRange('2026-07-20', '2026-07-27', { campaignIds: ['campaign-one'], storeId: 'store-1', source: 'owned' })
    assert.equal(creativeAggregates.length, 1)
    assert.equal(creativeAggregates[0].sample.id, 'paged-creative-end-date')
    assert.equal(creativeAggregates[0].cost, Number(creativeOne.cost) + 7)
    assert.equal(creativeAggregates[0].days, 2)
    const creativeAggregatePage = gmvMaxRepo.listCreativeMetricAggregatePage('2026-07-20', '2026-07-27', {
      page: 1, pageSize: 1, campaignIds: ['campaign-one'], storeId: 'store-1', source: 'owned', sortBy: 'cost', sortDirection: 'desc',
    })
    assert.equal(creativeAggregatePage.total, 1)
    assert.equal(creativeAggregatePage.items.length, 1)
    assert.equal(creativeAggregatePage.items[0].sample.id, 'paged-creative-end-date')
    assert.equal(creativeAggregatePage.summary.cost, Number(creativeOne.cost) + 7)
    assert.equal(gmvMaxRepo.listCreativeMetricAggregatePage('2026-07-20', '2026-07-27', { search: creativeOne.creativeId }).total, 2)
    assert.equal(gmvMaxRepo.listCreativeMetricAggregatePage('2026-07-20', '2026-07-27', { minOrders: 999 }).total, 0)
    const emptyCostFields = {
      purchaseCost: '', firstMileCost: '', lastMileCost: '', warehousingCost: '',
      platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '',
    }
    gmvMaxRepo.saveStoreCost({ ...storeCost, id: 'paged-store-cost', storeId: 'store-inherited' })
    gmvMaxRepo.saveProductCost({ ...productCost, id: 'paged-cost-complete', storeId: 'store-direct', campaignId: 'campaign-one', productId: 'complete-direct' })
    gmvMaxRepo.saveProductCost({ ...productCost, ...emptyCostFields, id: 'paged-cost-inherited', storeId: 'store-inherited', productId: 'complete-inherited' })
    gmvMaxRepo.saveProductCost({ ...productCost, ...emptyCostFields, id: 'paged-cost-incomplete', storeId: 'store-incomplete', productId: 'incomplete' })
    const costCoveragePage = gmvMaxRepo.listProductCostsPage({ page: 1, pageSize: 10, sortBy: 'completeness', sortDirection: 'asc' })
    assert.equal(costCoveragePage.summary.complete, 2)
    assert.equal(costCoveragePage.summary.incomplete, 1)
    assert.equal(costCoveragePage.summary.campaignOverrides, 1)
    assert.equal(costCoveragePage.summary.storeDefaults, 2)
    assert.equal(costCoveragePage.items[0].id, 'paged-cost-incomplete')
    const incompleteCostPage = gmvMaxRepo.listProductCostsPage({ page: 1, pageSize: 10, completeness: 'incomplete' })
    assert.equal(incompleteCostPage.total, 1)
    assert.equal(incompleteCostPage.items[0].id, 'paged-cost-incomplete')
    assert.equal(gmvMaxRepo.listProductCostsPage({ page: 1, pageSize: 10, completeness: 'complete' }).total, 2)
    gmvMaxRepo.saveBinding({
      id: 'import-binding', connectionId: 'connection-1', advertiserId: 'advertiser-1', advertiserName: 'Advertiser',
      currency: 'USD', timezone: 'Asia/Bangkok', storeId: 'import-store', storeName: 'Import store', campaignType: 'PRODUCT', active: true, updatedAt: now,
    })
    gmvMaxRepo.saveCampaign({ ...baseCampaign, id: 'import-campaign', bindingId: 'import-binding', storeId: 'import-store' })
    gmvMaxRepo.saveStoreCost({
      ...storeCost,
      id: 'import-store-cost',
      connectionId: 'connection-1',
      advertiserId: 'advertiser-1',
      storeId: 'import-store',
      currency: 'USD',
      timezone: 'Asia/Bangkok',
      cnyExchangeRate: '0.00028',
      exchangeRateUpdatedAt: now,
      exchangeRateSource: 'ExchangeRate-API',
    })
    const {
      enrichRecommendationBusinessImpact,
      gmvMaxService,
      hasGmvMaxCampaignControlSnapshot,
      promoteGmvMaxRecommendationToLive,
      selectUniqueGmvMaxActiveBindings,
    } = await import('../src/main/modules/tiktok-gmv-max/service')
    assert.equal(hasGmvMaxCampaignControlSnapshot({ budget: '100', roas_bid: '2', operation_status: 'ACTIVE' }), true)
    assert.equal(hasGmvMaxCampaignControlSnapshot({ budget: '100', operation_status: 'ACTIVE' }), false)
    const duplicateBinding = {
      id: 'duplicate-binding', connectionId: 'connection-2', advertiserId: 'advertiser-1', advertiserName: 'Advertiser',
      storeId: 'import-store', storeName: 'Import store', campaignType: 'PRODUCT' as const, active: true, updatedAt: now,
    }
    const liveBinding = { ...duplicateBinding, id: 'live-binding', campaignType: 'LIVE' as const }
    assert.equal(selectUniqueGmvMaxActiveBindings([duplicateBinding, { ...duplicateBinding, id: 'duplicate-binding-2' }, liveBinding], true).length, 2)
    assert.equal(selectUniqueGmvMaxActiveBindings([duplicateBinding, liveBinding], false).length, 1)
    const modeledProfitGuard = { ...profitGuard, contributionMarginRate: '0.5', effectiveRoiFloor: '2' }
    const modeledRecommendation = evaluateGmvMaxCampaign({ campaign: campaign('LIVE'), policy: defaultGmvMaxPolicy('campaign-live'), metrics: metrics('high', 'LIVE'), profitGuard: modeledProfitGuard, now })!
    const enrichedRecommendation = enrichRecommendationBusinessImpact(modeledRecommendation, modeledProfitGuard)
    assert.equal(enrichedRecommendation.projectionSource, 'modeled')
    assert.ok(Number(enrichedRecommendation.projectedGmvDelta) > 0)
    assert.ok(Number(enrichedRecommendation.projectedNetProfitDelta) > 0)
    const promotedRecommendation = promoteGmvMaxRecommendationToLive({ ...enrichedRecommendation, shadow: true }, now + 1)
    assert.equal(promotedRecommendation.status, 'approved')
    assert.equal(promotedRecommendation.shadow, false)
    assert.equal(promotedRecommendation.originatedFromShadow, true)
    assert.equal(promotedRecommendation.writeAttempted, false)
    await gmvMaxService.setEmergencyStop({ stopped: true, reason: 'Smoke test' })
    assert.equal(gmvMaxRepo.getRuntimeState()?.emergencyStopped, true)
    await gmvMaxService.setEmergencyStop({ stopped: false })
    assert.equal(gmvMaxRepo.getRuntimeState()?.emergencyStopped, false)
    gmvMaxRepo.saveRecommendation({ ...enrichedRecommendation, id: 'batch-low', idempotencyKey: 'batch-low', campaignId: 'import-campaign', bindingId: 'import-binding', risk: 'low' })
    gmvMaxRepo.saveRecommendation({ ...enrichedRecommendation, id: 'batch-high', idempotencyKey: 'batch-high', campaignId: 'import-campaign', bindingId: 'import-binding', risk: 'high' })
    await assert.rejects(() => gmvMaxService.approveRecommendations({ ids: ['batch-low', 'batch-high'] }), /same risk level/)
    const savedExchangeRate = await gmvMaxService.saveStoreCost({
      ...storeCost,
      id: 'import-store-cost',
      connectionId: 'connection-1',
      advertiserId: 'advertiser-1',
      storeId: 'import-store',
      currency: 'VND',
      timezone: 'UTC',
      cnyExchangeRate: '7.25',
    })
    assert.equal(savedExchangeRate.cnyExchangeRate, '0.00028')
    assert.equal(savedExchangeRate.currency, 'USD')
    assert.equal(savedExchangeRate.timezone, 'Asia/Bangkok')
    assert.equal(savedExchangeRate.exchangeRateUpdatedAt, now)
    assert.equal(savedExchangeRate.exchangeRateSource, 'ExchangeRate-API')
    assert.equal(gmvMaxRepo.listBindings().find((item) => item.id === 'import-binding')?.currency, 'USD')
    assert.equal(gmvMaxRepo.listBindings().find((item) => item.id === 'import-binding')?.timezone, 'Asia/Bangkok')
    const manualRateOverride = await gmvMaxService.saveStoreCost({ ...savedExchangeRate, cnyExchangeRate: '7.25' })
    assert.equal(manualRateOverride.cnyExchangeRate, '0.00028')
    const incompleteMultiSku = await gmvMaxService.saveProductCost({
      ...emptyCostFields,
      id: 'incomplete-multi-sku',
      storeId: 'import-store',
      campaignId: 'import-campaign',
      productId: 'incomplete-multi-sku',
      productName: 'Incomplete multi SKU product',
      skuCount: 3,
      catalogMinPrice: '9.9',
      catalogMaxPrice: '25.3',
      sellingPrice: '',
      variants: [],
      currency: 'USD',
    })
    assert.deepEqual(incompleteMultiSku.variants, [])
    const incompleteMultiSkuGuard = calculateGmvMaxConfiguredProductProfitGuard({ product: incompleteMultiSku, storeCost: savedExchangeRate, minRoi: '1' })
    assert.equal(incompleteMultiSkuGuard.complete, false)
    assert.match(incompleteMultiSkuGuard.reason || '', /SKU-level/)
    const partialMultiSku = await gmvMaxService.saveProductCost({
      ...incompleteMultiSku,
      variants: [{ ...emptyCostFields, id: 'incomplete-sku-1', name: '', sellingPrice: '' }],
    })
    assert.equal(partialMultiSku.variants?.[0]?.name, 'SKU 1')
    assert.equal(calculateGmvMaxConfiguredProductProfitGuard({ product: partialMultiSku, storeCost: savedExchangeRate, minRoi: '1' }).complete, false)
    gmvMaxRepo.removeProductCost(partialMultiSku.id)
    const scopedRule = await gmvMaxService.saveRuleGroup({
      name: 'Import store rule', storeId: 'import-store', preset: 'roi_guard', minRoi: '1.5', targetCpa: '10', creativeTestBudget: '20', profitSafetyMarginPercent: 15,
    })
    assert.equal(scopedRule.storeId, 'import-store')
    await gmvMaxService.bindRuleGroup({ campaignId: 'import-campaign', ruleGroupId: scopedRule.id })
    gmvMaxRepo.saveBinding({
      id: 'other-binding', connectionId: 'connection-1', advertiserId: 'advertiser-2', advertiserName: 'Other advertiser',
      currency: 'USD', storeId: 'other-store', storeName: 'Other store', campaignType: 'PRODUCT', active: true, updatedAt: now,
    })
    gmvMaxRepo.saveCampaign({ ...baseCampaign, id: 'other-campaign', bindingId: 'other-binding', storeId: 'other-store' })
    await assert.rejects(
      () => gmvMaxService.bindRuleGroup({ campaignId: 'other-campaign', ruleGroupId: scopedRule.id }),
      /different store/,
    )
    const importHeader = 'storeId,campaignId,productId,productName,sellingPrice,purchaseCost,firstMileCost,lastMileCost,warehousingCost,platformCommissionRate,creatorCommissionRate,expectedReturnRate,returnLossRate'
    const importRows = [
      'import-store,import-campaign,import-product-one,Product One,100,40,5,5,0,0.1,0,0,0',
      'import-store,import-campaign,import-product-two,Product Two,120,50,5,5,0,0.1,0,0,0',
    ]
    const imported = await gmvMaxService.importProductCosts({ csv: [importHeader, ...importRows].join('\n') })
    assert.equal(imported.imported, 2)
    assert.equal(gmvMaxRepo.listProductCostsPage({ campaignId: 'import-campaign', page: 1, pageSize: 10 }).total, 2)
    const importedProduct = gmvMaxRepo.resolveProductCost('import-store', 'import-campaign', 'import-product-one')
    assert.ok(importedProduct)
    gmvMaxRepo.saveProductCost({ ...importedProduct, imageUrl: 'https://example.com/product.jpg', categoryName: 'Accessories', inventory: '88', skuCount: 1 })
    await gmvMaxService.importProductCosts({ csv: [importHeader, importRows[0]].join('\n') })
    const preservedProduct = gmvMaxRepo.resolveProductCost('import-store', 'import-campaign', 'import-product-one')
    assert.equal(preservedProduct?.imageUrl, 'https://example.com/product.jpg')
    assert.equal(preservedProduct?.categoryName, 'Accessories')
    assert.equal(preservedProduct?.inventory, '88')
    assert.equal(preservedProduct?.skuCount, 1)
    const importedVariantProduct = gmvMaxRepo.saveProductCost({
      ...importedProduct,
      id: 'import-variant-product',
      productId: 'import-variant-product',
      productName: 'Import Variant Product',
      skuCount: 3,
      catalogMinPrice: '100',
      catalogMaxPrice: '300',
      sellingPrice: '',
      variants: [
        { id: 'import-sku-1', name: 'One pair', sellingPrice: '90', purchaseCost: '30', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '' },
        { id: 'import-sku-2', name: 'Two pairs', sellingPrice: '170', purchaseCost: '55', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '' },
        { id: 'import-sku-3', name: 'Three pairs', sellingPrice: '240', purchaseCost: '80', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '' },
      ],
    })
    const exportedVariants = await gmvMaxService.exportProductCosts({ search: 'import-variant-product' })
    assert.match(exportedVariants, /catalogMinPrice,catalogMaxPrice,sellingPrice,variants/)
    assert.match(exportedVariants, /One pair/)
    gmvMaxRepo.removeProductCost(importedVariantProduct.id)
    await gmvMaxService.importProductCosts({ csv: exportedVariants })
    const restoredVariants = gmvMaxRepo.resolveProductCost('import-store', 'import-campaign', 'import-variant-product')
    assert.equal(restoredVariants?.variants?.length, 3)
    assert.equal(restoredVariants?.variants?.[2]?.sellingPrice, '240')
    await assert.rejects(
      () => gmvMaxService.importProductCosts({ csv: [importHeader, importRows[0], importRows[0]].join('\n') }),
      /duplicate scope/,
    )
    assert.equal(gmvMaxRepo.listProductCostsPage({ campaignId: 'import-campaign', page: 1, pageSize: 10 }).total, 3)
    assert.deepEqual(gmvMaxRepo.listSessions(), [])
    assert.deepEqual(gmvMaxRepo.listCreativeAssets(), [])
    assert.deepEqual(gmvMaxRepo.listActionLocks(), [])
    gmvMaxRepo.saveCreativeAsset({ id: 'asset-name-search', storeId: 'store-1', campaignId: 'campaign-one', creativeId: creativeOne.creativeId, kind: 'video', name: 'Unique catalog asset', raw: {}, syncedAt: now })
    assert.equal(gmvMaxRepo.listCreativeMetricAggregatePage('2026-07-20', '2026-07-27', { search: 'unique catalog asset' }).total, 1)
    const scopedBindingOne = { ...costScopeBinding, id: 'scoped-binding-one', storeId: 'scoped-store-one' }
    const scopedBindingTwo = { ...costScopeBinding, id: 'scoped-binding-two', storeId: 'scoped-store-two' }
    const scopedCampaignOne = { ...baseCampaign, id: 'scoped-campaign-one', bindingId: scopedBindingOne.id, storeId: scopedBindingOne.storeId }
    const scopedCampaignTwo = { ...baseCampaign, id: 'scoped-campaign-two', bindingId: scopedBindingTwo.id, storeId: scopedBindingTwo.storeId }
    gmvMaxRepo.saveBinding(scopedBindingOne)
    gmvMaxRepo.saveBinding(scopedBindingTwo)
    gmvMaxRepo.saveCampaign(scopedCampaignOne)
    gmvMaxRepo.saveCampaign(scopedCampaignTwo)
    gmvMaxRepo.saveStoreCost({ ...storeCost, id: 'scoped-store-cost-one', storeId: scopedBindingOne.storeId })
    gmvMaxRepo.saveStoreCost({ ...storeCost, id: 'scoped-store-cost-two', storeId: scopedBindingTwo.storeId })
    gmvMaxRepo.saveProductCost({ ...productCost, id: 'scoped-product-default-one', storeId: scopedBindingOne.storeId, campaignId: undefined, productId: 'scoped-default-one' })
    gmvMaxRepo.saveProductCost({ ...productCost, id: 'scoped-product-campaign-one', storeId: scopedBindingOne.storeId, campaignId: scopedCampaignOne.id, productId: 'scoped-campaign-product-one' })
    gmvMaxRepo.saveProductCost({ ...productCost, id: 'scoped-product-campaign-two', storeId: scopedBindingTwo.storeId, campaignId: scopedCampaignTwo.id, productId: 'scoped-campaign-product-two' })
    gmvMaxRepo.saveCreativeAsset({ id: 'scoped-asset-default-one', storeId: scopedBindingOne.storeId, creativeId: 'scoped-video-one', kind: 'video', raw: {}, syncedAt: now })
    gmvMaxRepo.saveCreativeAsset({ id: 'scoped-asset-campaign-one', storeId: scopedBindingOne.storeId, campaignId: scopedCampaignOne.id, creativeId: 'scoped-video-one', kind: 'video', raw: {}, syncedAt: now })
    gmvMaxRepo.saveCreativeAsset({ id: 'scoped-asset-campaign-two', storeId: scopedBindingTwo.storeId, campaignId: scopedCampaignTwo.id, creativeId: 'scoped-video-two', kind: 'video', raw: {}, syncedAt: now })
    gmvMaxRepo.saveListEntry({ id: 'scoped-list-default-one', storeId: scopedBindingOne.storeId, entityType: 'creative', entityId: 'scoped-video-one', mode: 'allow', updatedAt: now })
    gmvMaxRepo.saveListEntry({ id: 'scoped-list-campaign-one', storeId: scopedBindingOne.storeId, campaignId: scopedCampaignOne.id, entityType: 'creative', entityId: 'scoped-video-one', mode: 'deny', updatedAt: now })
    gmvMaxRepo.saveListEntry({ id: 'scoped-list-campaign-two', storeId: scopedBindingTwo.storeId, campaignId: scopedCampaignTwo.id, entityType: 'creative', entityId: 'scoped-video-two', mode: 'deny', updatedAt: now })
    assert.deepEqual(gmvMaxRepo.listBindingsByIds([scopedBindingOne.id]).map((item) => item.id), [scopedBindingOne.id])
    assert.deepEqual(gmvMaxRepo.listCampaignsByIds([scopedCampaignOne.id]).map((item) => item.id), [scopedCampaignOne.id])
    assert.deepEqual(gmvMaxRepo.listStoreCostsByStoreIds([scopedBindingOne.storeId]).map((item) => item.id), ['scoped-store-cost-one'])
    assert.deepEqual(new Set(gmvMaxRepo.listProductCostsForScope([scopedBindingOne.storeId], [scopedCampaignOne.id]).map((item) => item.id)), new Set(['scoped-product-default-one', 'scoped-product-campaign-one']))
    assert.deepEqual(new Set(gmvMaxRepo.listCreativeAssetsForScope({ storeIds: [scopedBindingOne.storeId], campaignIds: [scopedCampaignOne.id], creativeIds: ['scoped-video-one'] }).map((item) => item.id)), new Set(['scoped-asset-default-one', 'scoped-asset-campaign-one']))
    assert.deepEqual(new Set(gmvMaxRepo.listListEntriesForScope([scopedBindingOne.storeId], [scopedCampaignOne.id]).map((item) => item.id)), new Set(['scoped-list-default-one', 'scoped-list-campaign-one']))
    gmvMaxRepo.saveLearningSnapshot({ ...scalingLifecycle, id: 'scoped-learning-one', campaignId: scopedCampaignOne.id })
    gmvMaxRepo.saveLearningSnapshot({ ...scalingLifecycle, id: 'scoped-learning-two', campaignId: scopedCampaignTwo.id })
    assert.deepEqual(gmvMaxRepo.listLearningSnapshotsForCampaigns([scopedCampaignOne.id]).map((item) => item.id), ['scoped-learning-one'])
    gmvMaxRepo.saveCreativeInsight({ ...fatigueInsight[0], id: 'scoped-insight-one', campaignId: scopedCampaignOne.id })
    gmvMaxRepo.saveCreativeInsight({ ...fatigueInsight[0], id: 'scoped-insight-two', campaignId: scopedCampaignTwo.id })
    assert.deepEqual(gmvMaxRepo.listCreativeInsightsForCampaigns([scopedCampaignOne.id]).map((item) => item.id), ['scoped-insight-one'])
    gmvMaxRepo.clearCreativeInsights()
    gmvMaxRepo.saveCreativeInsight(fatigueInsight[0])
    assert.equal(gmvMaxRepo.listCreativeInsights().length, 1)
    gmvMaxRepo.clearCreativeInsights()
    assert.deepEqual(gmvMaxRepo.listCreativeInsights(), [])
    gmvMaxRepo.savePortfolioPlan(portfolioPlans[0])
    assert.equal(gmvMaxRepo.listPortfolioPlans().length, 1)
    gmvMaxRepo.clearPortfolioPlans()
    assert.deepEqual(gmvMaxRepo.listPortfolioPlans(), [])
    closeGmvMaxSqlite()
    const database = new DatabaseSync(path.join(dataRoot, 'db', 'tiktok-gmv-max.sqlite'))
    assert.equal(String(database.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'wal')
    assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gmv_optimization_runs'").get())
    assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_gmv_metrics_normalized_date'").get())
    assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_gmv_creative_metrics_normalized_date'").get())
    for (const table of ['gmv_store_costs', 'gmv_product_costs', 'gmv_creative_metrics', 'gmv_creative_assets', 'gmv_realtime_samples', 'gmv_rule_groups', 'gmv_list_entries', 'gmv_session_snapshots', 'gmv_action_locks', 'gmv_backtest_results', 'gmv_notification_records', 'gmv_learning_snapshots', 'gmv_action_outcomes', 'gmv_creative_insights', 'gmv_portfolio_plans', 'gmv_runtime_state']) {
      assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table)
    }
    database.close()
  } finally {
    closeGmvMaxSqlite()
    await rm(dataRoot, { recursive: true, force: true })
  }

  console.log('[tiktok-gmv-max-optimizer] smoke test passed')
}

void main()
