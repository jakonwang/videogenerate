import { createHash, randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
import { gmvMaxAuthStore } from './authStore'
import { gmvMaxMcpClient } from './mcpClient'
import { defaultGmvMaxPolicy, evaluateGmvMaxCampaign, gmvMaxDecimal } from './optimizer'
import { buildGmvMaxCreativeExperiment, evaluateGmvMaxCreativeGuard, evaluateGmvMaxCreativeRotationPlan, evaluateGmvMaxPacingDiagnostic, evaluateGmvMaxRealtimeGuard, evaluateGmvMaxSessionGuard } from './guards'
import { calculateGmvMaxCampaignProfitGuard, calculateGmvMaxConfiguredProductProfitGuard, deriveGmvMaxObservedSellingPrice, selectGmvMaxCampaignProductCosts } from './profit'
import { analyzeGmvMaxLifecycle } from './learning'
import { measureGmvMaxActionOutcome } from './outcomes'
import { analyzeGmvMaxCreativeIntelligence, buildGmvMaxPortfolioPlans } from './intelligence'
import { executeGmvMaxPortfolioTransfer, GmvMaxPortfolioExecutionError } from './portfolioExecutor'
import { executeGmvMaxCreativeRotation } from './creativeRotation'
import { buildGmvMaxCreativeMetricId, buildGmvMaxCreativeReportRequest, buildGmvMaxProductReportRequest, hasNextGmvMaxPage, parseGmvMaxCreativeReportRow, parseGmvMaxProductReportIds } from './reportContract'
import { buildGmvMaxStoreProfitSummaries } from './storeProfit'
import { replayGmvMaxStrategy } from './backtest'
import { mergeGmvMaxAccountMetadata, resolveGmvMaxAccountMetadata, resolveGmvMaxAccountMetadataRequest } from './accountMetadata'
import { convertGmvMaxMoneyToCny, createGmvMaxExchangeRateLoader, parseGmvMaxExchangeRate } from './exchangeRate'
import { buildGmvMaxStrategyCalibrations } from './calibration'
import { analyzeGmvMaxProductIntelligence } from './productIntelligence'
import { resolveGmvMaxProductCostScope, validateGmvMaxCostInput, validateGmvMaxOptionalCostInput, validateGmvMaxProductSellingPrice } from './costValidation'
import { buildGmvMaxVideoIdentity, resolveGmvMaxCreativeAsset } from './creativeAssets'
import { selectGmvMaxCampaignCandidate, selectGmvMaxCampaignCandidates } from './automation'
import { evaluateGmvMaxDecision, resolveGmvMaxDecisionRules } from './decisionEngine'
import { buildGmvMaxRoiUnlockExperiment, evaluateGmvMaxRoiUnlockExperiment } from './experimentEngine'
import { assertGmvMaxRemoteCampaignState, matchesGmvMaxRemoteCampaignState, parseGmvMaxRemoteCampaignState } from './executionState'
import { buildGmvMaxCreativeUpdateArgs, buildGmvMaxCreativeVerificationRequest, resolveGmvMaxCreativeTarget, verifyGmvMaxCreativeDelivery, type GmvMaxCreativeTarget } from './creativeContract'
import { buildGmvMaxSessionToolCall, isGmvMaxSessionInputRejection, refreshGmvMaxCreativeBoostSchedule, verifyGmvMaxSessionState } from './sessionContract'
import { assertGmvMaxPortfolioEvidenceFresh } from './portfolioFreshness'
import { gmvMaxRepo } from './sqlite'
import { sendHermesMessage } from '../hermes/messaging'
import { cloneService } from '../clone/service'
import { advanceGmvMaxSopInterventionObservation, buildGmvMaxAutomaticSopInstance, buildGmvMaxDailySopTasks, buildGmvMaxMatureAssessment, buildGmvMaxProductDailyMetrics, buildGmvMaxSopAutomationRunId, buildGmvMaxSopInterventionOutcome, buildGmvMaxSopMetricSummary, classifyGmvMaxCreativeGrade, completeEvidenceBackedGmvMaxSopTasks, countGmvMaxObservedDeliveryDays, detectGmvMaxSopTrack, evaluateGmvMaxSopInstance, GMV_MAX_SOP_AUTOMATION_RETRY_MS, GMV_MAX_WINNER_DRAFT_RETRY_MS, planGmvMaxSopAutomation, selectGmvMaxAutomaticSopProductCandidate, shouldCreateGmvMaxSopRollback, shouldRunGmvMaxSopAutomation, supersedeExpiredGmvMaxSopTasks, supersedeGmvMaxSopAutomationTasks } from './sop'
import { buildGmvMaxSopIssueResolutions, isGmvMaxSopTaskApplicable } from './resolutions'
import {
  GMV_MAX_SERVER_URL,
  type GmvMaxAccountBinding,
  type GmvMaxAuditRecord,
  type GmvMaxCampaign,
  type GmvMaxCampaignType,
  type GmvMaxConnection,
  type GmvMaxCreativeMetric,
  type GmvMaxDailyMetric,
  type GmvMaxPolicy,
  type GmvMaxPolicyPreset,
  type GmvMaxRecommendation,
  type GmvMaxActionType,
  type GmvMaxCostInput,
  type GmvMaxListEntry,
  type GmvMaxNotificationConfig,
  type GmvMaxProductCost,
  type GmvMaxRuleGroup,
  type GmvMaxStoreCost,
  type GmvMaxLearningSnapshot,
  type GmvMaxPortfolioPlan,
  type GmvMaxPacingDiagnostic,
  type GmvMaxProfitGuard,
  type GmvMaxSessionSnapshot,
  type GmvMaxSchedulerState,
  type GmvMaxSopInstance,
  type GmvMaxSopIntervention,
  type GmvMaxEvidenceAttachment,
  type GmvMaxSopReminder,
  type GmvMaxSopAutomationRun,
  type GmvMaxSopTrack,
  type GmvMaxSupplementalMetric,
  type GmvMaxSyncAction,
  type GmvMaxSyncProgress,
  type GmvMaxWinnerDna,
  type GmvMaxSopCreativeVideo,
  type GmvMaxDecisionSnapshot,
  type GmvMaxDecisionAction,
  type GmvMaxExperiment,
  type GmvMaxDecisionRuleConfig,
  type GmvMaxSopTask,
} from './types'

const REPORT_METRICS = ['cost', 'gross_revenue', 'roi', 'orders']
const executingRecommendationIds = new Set<string>()
const executingPortfolioIds = new Set<string>()
const actionLocks = new Set<string>()
const syncJobs = new Map<GmvMaxSyncAction, Promise<unknown>>()
let schedulerStateLoaded = false
let sopRecalculationPromise: Promise<void> | undefined
let sopRecalculationRequested = false

function initialSchedulerState(): GmvMaxSchedulerState {
  return {
    running: false,
    emergencyStopped: false,
    nextRunAt: undefined,
    consecutiveFailures: 0,
    recoveryTaskCount: 0,
    updatedAt: Date.now(),
  }
}

function ensureSchedulerStateLoaded(state: GmvMaxSchedulerState) {
  if (schedulerStateLoaded) return state
  const stored = gmvMaxRepo.getRuntimeState()
  if (stored) Object.assign(state, stored, { running: false, nextRunAt: undefined })
  state.recoveryTaskCount = gmvMaxRepo.listActionLocks().length
  schedulerStateLoaded = true
  return state
}

function saveSchedulerState(state: GmvMaxSchedulerState, patch: Partial<GmvMaxSchedulerState>) {
  ensureSchedulerStateLoaded(state)
  Object.assign(state, patch, { updatedAt: Date.now() })
  gmvMaxRepo.saveRuntimeState({ ...state, running: false, nextRunAt: undefined })
  return state
}

function recoverInterruptedSyncJobs(now = Date.now()) {
  const staleBefore = now - 2 * 60_000
  for (const job of gmvMaxRepo.listSyncJobs()) {
    if (job.status !== 'running' || syncJobs.has(job.action) || job.updatedAt > staleBefore) continue
    gmvMaxRepo.saveSyncJob({
      ...job,
      status: 'interrupted',
      message: 'Synchronization was interrupted before completion.',
      error: 'The application closed or lost the synchronization process. Review the last completed phase and retry.',
      updatedAt: now,
    })
  }
}

function hash(...parts: unknown[]) {
  return createHash('sha256').update(parts.map((item) => String(item ?? '')).join(':')).digest('hex').slice(0, 32)
}

function repeatedPage(rows: any[], fingerprints: Set<string>) {
  const fingerprint = hash(rows.length, JSON.stringify(rows[0] || null), JSON.stringify(rows.at(-1) || null))
  if (fingerprints.has(fingerprint)) return true
  fingerprints.add(fingerprint)
  return false
}

function unwrap(input: any): any {
  let current = input
  for (let index = 0; index < 4; index += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current
    if ('data' in current && Object.keys(current).length <= 5) current = current.data
    else break
  }
  return current
}

function findArray(input: any, keys: string[]): any[] {
  const value = unwrap(input)
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
    if (Array.isArray(value?.data?.[key])) return value.data[key]
  }
  return []
}

function findEntityArray(input: unknown, entityKeys: string[], depth = 0): any[] {
  if (depth > 6 || input === null || input === undefined) return []
  if (Array.isArray(input)) {
    if (input.some((item) => item && typeof item === 'object' && entityKeys.some((key) => key in item))) return input
    for (const item of input) {
      const found = findEntityArray(item, entityKeys, depth + 1)
      if (found.length) return found
    }
    return []
  }
  if (typeof input !== 'object') return []
  for (const value of Object.values(input as Record<string, unknown>)) {
    const found = findEntityArray(value, entityKeys, depth + 1)
    if (found.length) return found
  }
  return []
}

function text(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function numberText(value: unknown, fallback = '0') {
  const normalized = text(value, fallback)
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : fallback
}

function productImageUrl(row: any) {
  const direct = text(row?.main_image_url || row?.product_image_url || row?.image_url || row?.cover_url || row?.thumbnail_url)
  if (direct) return direct
  const image = Array.isArray(row?.images) ? row.images[0] : row?.image || row?.main_image
  return text(typeof image === 'string' ? image : image?.url || image?.image_url || image?.uri)
}

function productCategoryName(row: any) {
  return text(row?.category_name || row?.product_category_name || row?.category?.name || row?.category?.category_name)
}

function productInventory(row: any) {
  return numberText(row?.available_stock ?? row?.stock_count ?? row?.inventory ?? row?.stock, '')
}

function productSkuCount(row: any) {
  const value = Number(row?.sku_count ?? row?.variation_count ?? (Array.isArray(row?.skus) ? row.skus.length : 0))
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined
}

function isoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function zonedDateParts(timezone = 'UTC', now = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now))
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return {
      date: `${value.year}-${value.month}-${value.day}`,
      hour: Number(value.hour || 0),
      minute: Number(value.minute || 0),
    }
  } catch {
    return zonedDateParts('UTC', now)
  }
}

function completedReportRange(timezone = 'UTC', days = 7, now = Date.now()) {
  const local = zonedDateParts(timezone, now)
  const end = new Date(`${local.date}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1))
  return { startDate: isoDate(start.getTime()), endDate: isoDate(end.getTime()) }
}

function completedReportRangeForBindings(bindings: GmvMaxAccountBinding[], days: number, now = Date.now()) {
  const ranges = bindings.map((binding) => completedReportRange(binding.timezone, days, now))
  if (!ranges.length) return completedReportRange('UTC', days, now)
  return {
    startDate: ranges.reduce((earliest, range) => range.startDate < earliest ? range.startDate : earliest, ranges[0].startDate),
    endDate: ranges.reduce((latest, range) => range.endDate > latest ? range.endDate : latest, ranges[0].endDate),
  }
}

function summarizeResponse(value: Record<string, any>) {
  const unwrapped = unwrap(value)
  return {
    requestId: text(value?.request_id || value?.requestId || unwrapped?.request_id || unwrapped?.requestId) || undefined,
    code: value?.code ?? unwrapped?.code,
    message: text(value?.message || unwrapped?.message) || undefined,
    itemCount: findArray(unwrapped, ['list', 'campaigns', 'advertisers', 'stores']).length,
  }
}

function findDeepField(value: unknown, keys: Set<string>, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDeepField(item, keys, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof value !== 'object') return undefined
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key.toLowerCase())) return item
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    const found = findDeepField(item, keys, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function remoteCampaignBudget(value: Record<string, unknown>) {
  const budget = findDeepField(value, new Set(['budget', 'daily_budget']))
  const normalized = numberText(budget, '')
  if (!normalized) throw new Error('TikTok campaign detail did not include a verifiable budget.')
  return normalized
}

function creativeTargetsForAction(campaign: GmvMaxCampaign, actionPayload: Record<string, unknown> | undefined) {
  const operation = text(actionPayload?.operation).toUpperCase()
  const metrics = gmvMaxRepo.listCreativeMetrics().filter((item) => item.campaignId === campaign.id)
  const assets = gmvMaxRepo.listCreativeAssets().filter((item) => item.campaignId === campaign.id || (!item.campaignId && item.storeId === campaign.storeId))
  const resolve = (creativeId: string, action: 'ADD' | 'REMOVE') => resolveGmvMaxCreativeTarget({
    campaign,
    creativeId,
    operation: action,
    metrics,
    assets,
    explicitSpuIds: Array.isArray(actionPayload?.spuIds) ? actionPayload.spuIds.map((value) => text(value)).filter(Boolean) : undefined,
  })
  if (operation === 'ROTATE') {
    return [
      resolve(text(actionPayload?.addCreativeId), 'ADD'),
      resolve(text(actionPayload?.removeCreativeId), 'REMOVE'),
    ]
  }
  if (operation !== 'ADD' && operation !== 'REMOVE') throw new Error(`Unsupported TikTok creative operation: ${operation || 'missing'}`)
  return [resolve(text(actionPayload?.creativeId), operation)]
}

function sessionSnapshotsFromRows(campaignId: string, rows: any[], syncedAt: number): GmvMaxSessionSnapshot[] {
  const snapshots: GmvMaxSessionSnapshot[] = []
  for (const row of rows) {
    const sessionId = text(row.session_id || row.id)
    if (!sessionId) continue
    snapshots.push({
      id: hash(campaignId, sessionId),
      campaignId,
      sessionId,
      status: text(row.status, 'UNKNOWN'),
      budget: numberText(row.budget || row.session?.budget),
      startTime: text(row.start_time || row.session?.schedule_start_time) || undefined,
      endTime: text(row.end_time || row.session?.schedule_end_time) || undefined,
      raw: row,
      syncedAt,
    })
  }
  return snapshots
}

function matchingSessionId(rows: any[], actionPayload: Record<string, unknown> | undefined) {
  const explicit = text(actionPayload?.sessionId || actionPayload?.session_id)
  if (explicit) return explicit
  const expectedItemId = text(actionPayload?.itemId || actionPayload?.item_id || actionPayload?.creativeId)
  const expectedBudget = numberText(actionPayload?.budget, '')
  const matching = rows.find((row) => {
    const itemId = text(findDeepField(row, new Set(['item_id'])))
    const budget = numberText(findDeepField(row, new Set(['budget'])), '')
    return (!expectedItemId || itemId === expectedItemId) && (!expectedBudget || Number(budget) === Number(expectedBudget))
  })
  return text(matching?.session_id || matching?.id)
}

function connectionById(id: string) {
  return gmvMaxRepo.listConnections().find((item) => item.id === id) || null
}

function activeConnection() {
  return gmvMaxRepo.listConnections().find((item) => item.state === 'connected') || gmvMaxRepo.listConnections()[0] || null
}

async function saveConnectionState(id: string, patch: Partial<GmvMaxConnection>) {
  const current = connectionById(id)
  if (!current) throw new Error('GMV MAX connection does not exist.')
  return gmvMaxRepo.saveConnection({ ...current, ...patch, updatedAt: Date.now() })
}

async function refreshConnectionDiscovery(connection: GmvMaxConnection) {
  const runtime = await gmvMaxMcpClient.connect(connection.id, false)
  return await saveConnectionState(connection.id, {
    state: 'connected',
    expiresAt: runtime.provider.tokenExpiresAt(),
    missingTools: runtime.missingTools,
    capabilities: runtime.capabilities,
    lastError: runtime.capabilities.core_read ? undefined : `Missing core tools: ${runtime.missingTools.join(', ')}`,
  })
}

async function syncBindings(connection: GmvMaxConnection) {
  const runtime = await gmvMaxMcpClient.connect(connection.id, false)
  const advertiserResult = await gmvMaxMcpClient.call(connection.id, 'auth_advertiser_get', {})
  const advertisers = findArray(advertiserResult.data, ['list', 'advertisers', 'advertiser_list'])
  const saved: GmvMaxAccountBinding[] = []
  const storeErrors: Error[] = []
  for (const advertiser of advertisers) {
    const advertiserId = text(advertiser.advertiser_id || advertiser.advertiserId || advertiser.id)
    if (!advertiserId) continue
    const metadataRequest = resolveGmvMaxAccountMetadataRequest(runtime.toolSchemas, advertiserId)
    let advertiserMetadataSource = advertiser
    if (metadataRequest) {
      try {
        const metadataResult = await gmvMaxMcpClient.call(connection.id, metadataRequest.tool, metadataRequest.args)
        const metadataRows = findEntityArray(metadataResult.data, ['advertiser_id', 'currency', 'timezone'])
        const metadata = metadataRows.find((item) => text(item.advertiser_id || item.advertiserId || item.id) === advertiserId)
          || metadataRows[0]
          || unwrap(metadataResult.data)
        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
          advertiserMetadataSource = { ...advertiser, ...metadata }
        }
      } catch (error) {
        storeErrors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }
    const storeResult = await gmvMaxMcpClient.call(connection.id, 'gmv_max_store_list_get', {
      advertiser_id: advertiserId,
    }).catch((error) => {
      storeErrors.push(error instanceof Error ? error : new Error(String(error)))
      return null
    })
    if (!storeResult) continue
    const stores = findArray(storeResult.data, ['list', 'stores', 'store_list'])
    for (const store of stores) {
      if (store.is_gmv_max_available === false) continue
      const storeId = text(store.store_id || store.storeId || store.id)
      if (!storeId) continue
      const existingBinding = gmvMaxRepo.listBindings().find((item) => item.connectionId === connection.id
        && item.advertiserId === advertiserId
        && item.storeId === storeId)
      const existingStoreCost = gmvMaxRepo.listStoreCosts().find((item) => item.connectionId === connection.id
        && item.advertiserId === advertiserId
        && item.storeId === storeId)
      const accountMetadata = mergeGmvMaxAccountMetadata(
        resolveGmvMaxAccountMetadata(advertiserMetadataSource, store),
        existingBinding,
        existingStoreCost,
      )
      for (const campaignType of ['PRODUCT', 'LIVE'] as GmvMaxCampaignType[]) {
        const binding: GmvMaxAccountBinding = {
          id: hash(connection.id, advertiserId, storeId, campaignType),
          connectionId: connection.id,
          advertiserId,
          advertiserName: text(advertiser.advertiser_name || advertiser.name, advertiserId),
          currency: accountMetadata.currency,
          timezone: accountMetadata.timezone,
          storeId,
          storeName: text(store.store_name || store.name, storeId),
          businessCenterId: text(store.store_authorized_bc_id || store.business_center_id) || undefined,
          campaignType,
          active: true,
          updatedAt: Date.now(),
        }
        gmvMaxRepo.saveBinding(binding)
        saved.push(binding)
      }
    }
  }
  if (!saved.length && storeErrors.length) throw storeErrors[0]
  const loadExchangeRate = createGmvMaxExchangeRateLoader()
  const synchronizedStores = saved.filter((binding, index, items) => items.findIndex((item) => item.advertiserId === binding.advertiserId && item.storeId === binding.storeId) === index)
  for (const binding of synchronizedStores) {
    const currency = text(binding.currency).toUpperCase()
    const existing = gmvMaxRepo.listStoreCosts().find((item) => item.connectionId === binding.connectionId && item.advertiserId === binding.advertiserId && item.storeId === binding.storeId)
    if (!currency) {
      gmvMaxRepo.saveStoreCost({
        ...(existing || emptyGmvMaxStoreCost(binding)),
        currency: existing?.currency,
        timezone: binding.timezone || existing?.timezone,
        exchangeRateError: 'Account currency is unavailable.',
        updatedAt: Date.now(),
      })
      continue
    }
    const exchangeRate = await loadExchangeRate(currency)
    gmvMaxRepo.saveStoreCost({
      ...(existing || emptyGmvMaxStoreCost(binding)),
      currency,
      timezone: binding.timezone,
      cnyExchangeRate: exchangeRate.rate || existing?.cnyExchangeRate,
      exchangeRateUpdatedAt: exchangeRate.rate ? exchangeRate.updatedAt : existing?.exchangeRateUpdatedAt,
      exchangeRateSource: exchangeRate.source || existing?.exchangeRateSource,
      exchangeRateError: exchangeRate.error,
      updatedAt: Date.now(),
    })
  }
  return saved
}

function emptyGmvMaxStoreCost(binding: GmvMaxAccountBinding): GmvMaxStoreCost {
  return {
    id: hash(binding.connectionId, binding.advertiserId, binding.storeId),
    connectionId: binding.connectionId,
    advertiserId: binding.advertiserId,
    storeId: binding.storeId,
    currency: binding.currency,
    timezone: binding.timezone,
    purchaseCost: '',
    firstMileCost: '',
    lastMileCost: '',
    warehousingCost: '',
    platformCommissionRate: '',
    creatorCommissionRate: '',
    expectedReturnRate: '',
    returnLossRate: '',
    updatedAt: Date.now(),
  }
}

export function hasGmvMaxCampaignControlSnapshot(row: Record<string, unknown>) {
  const source = unwrap(row) || row
  const hasValue = (...keys: string[]) => keys.some((key) => source[key] !== undefined && source[key] !== null && source[key] !== '')
  return hasValue('budget', 'daily_budget')
    && hasValue('roas_bid', 'target_roas', 'roi_target')
    && hasValue('operation_status', 'status')
}

export function selectUniqueGmvMaxActiveBindings(bindings: GmvMaxAccountBinding[], includeCampaignType: boolean) {
  const unique = new Map<string, GmvMaxAccountBinding>()
  for (const binding of bindings) {
    if (!binding.active) continue
    const key = [binding.advertiserId, binding.storeId, includeCampaignType ? binding.campaignType : 'STORE'].join(':')
    if (!unique.has(key)) unique.set(key, binding)
  }
  return [...unique.values()]
}

async function syncCampaignsForBinding(binding: GmvMaxAccountBinding) {
  const pageSize = 100
  const rows: any[] = []
  const pageFingerprints = new Set<string>()
  let page = 1
  while (page <= 100) {
    const result = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_campaign_get', {
      advertiser_id: binding.advertiserId,
      filtering: {
        store_ids: [binding.storeId],
        gmv_max_promotion_types: [binding.campaignType === 'LIVE' ? 'LIVE_GMV_MAX' : 'PRODUCT_GMV_MAX'],
      },
      page,
      page_size: pageSize,
    })
    const currentRows = findArray(result.data, ['list', 'campaigns', 'campaign_list'])
    if (repeatedPage(currentRows, pageFingerprints)) break
    rows.push(...currentRows)
    if (!hasNextGmvMaxPage(result.data, page, pageSize, currentRows.length)) break
    page += 1
  }
  const bidResult = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_bid_recommend_get', {
    advertiser_id: binding.advertiserId,
    store_id: binding.storeId,
    shopping_ads_type: binding.campaignType,
    optimization_goal: 'VALUE',
  }).catch((error) => ({ data: { compatibilityError: error instanceof Error ? error.message : String(error) } }))
  const bidRecommendation = unwrap(bidResult.data) || {}
  const existingCampaigns = new Map(gmvMaxRepo.listCampaigns().map((campaign) => [campaign.id, campaign]))
  const saved: GmvMaxCampaign[] = []
  for (const row of rows) {
    const campaignId = text(row.campaign_id || row.id)
    if (!campaignId) continue
    const existing = existingCampaigns.get(campaignId)
    let detail: Record<string, unknown> = {}
    if (!hasGmvMaxCampaignControlSnapshot(row)) {
      const detailResult = await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_info_get', {
        advertiser_id: binding.advertiserId,
        campaign_id: campaignId,
      }).catch((error) => ({ data: { compatibilityError: error instanceof Error ? error.message : String(error) } }))
      detail = unwrap(detailResult.data) || {}
    }
    const previousSource = existing?.raw?.campaign && typeof existing.raw.campaign === 'object' ? existing.raw.campaign : {}
    const source = { ...previousSource, ...row, ...detail }
    const campaign: GmvMaxCampaign = {
      id: campaignId,
      bindingId: binding.id,
      advertiserId: binding.advertiserId,
      storeId: binding.storeId,
      name: text(source.campaign_name || source.name, campaignId),
      campaignType: (text(source.shopping_ads_type, binding.campaignType) === 'LIVE' ? 'LIVE' : 'PRODUCT'),
      operationStatus: text(source.operation_status || source.status, 'UNKNOWN'),
      budget: numberText(source.budget),
      roasBid: numberText(source.roas_bid, '1'),
      promotionDaysEnabled: Boolean(source.promotion_days?.is_enabled),
      scheduleStartTime: text(source.schedule_start_time) || undefined,
      scheduleEndTime: text(source.schedule_end_time) || undefined,
      lastSyncedAt: Date.now(),
      raw: {
        campaign: source,
        bidRecommendation,
        recommendedBudget: numberText(bidRecommendation.recommended_budget || bidRecommendation.budget, '') || undefined,
        recommendedRoasBid: numberText(bidRecommendation.recommended_roas_bid || bidRecommendation.roas_bid, '') || undefined,
      },
    }
    gmvMaxRepo.saveCampaign(campaign)
    if (!gmvMaxRepo.listPolicies().some((policy) => policy.campaignId === campaign.id)) {
      gmvMaxRepo.savePolicy(defaultGmvMaxPolicy(campaign.id))
    }
    saved.push(campaign)
  }
  return saved
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

async function syncMetricsForBinding(binding: GmvMaxAccountBinding, campaigns: GmvMaxCampaign[], realtime = false) {
  const now = Date.now()
  const range = realtime
    ? { startDate: zonedDateParts(binding.timezone, now).date, endDate: zonedDateParts(binding.timezone, now).date }
    : completedReportRange(binding.timezone, 30, now)
  const saved: GmvMaxDailyMetric[] = []
  for (const batch of chunks(campaigns, 100)) {
    if (!batch.length) continue
    const pageSize = 1000
    const pageFingerprints = new Set<string>()
    let page = 1
    while (page <= 100) {
      const result = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_report_get', {
        advertiser_id: binding.advertiserId,
        store_ids: [binding.storeId],
        start_date: range.startDate,
        end_date: range.endDate,
        metrics: REPORT_METRICS,
        dimensions: ['campaign_id', 'stat_time_day'],
        filtering: {
          campaign_ids: batch.map((campaign) => campaign.id),
          gmv_max_promotion_types: [binding.campaignType],
        },
        page,
        page_size: pageSize,
      })
      const rows = findArray(result.data, ['list', 'rows', 'report_list'])
      if (repeatedPage(rows, pageFingerprints)) break
      for (const row of rows) {
        const dimensions = row.dimensions || row.dimension || {}
        const metrics = row.metrics || row.metric || row
        const campaignId = text(dimensions.campaign_id || row.campaign_id)
        const campaign = batch.find((item) => item.id === campaignId)
        const statDate = text(dimensions.stat_time_day || row.stat_time_day || row.stat_date)
        if (!campaign || !statDate) continue
        const cost = numberText(metrics.cost)
        if (realtime) {
          gmvMaxRepo.saveRealtimeSample({
            id: hash(campaign.id, statDate, now), campaignId: campaign.id, statDate, cost,
            orders: numberText(metrics.orders), grossRevenue: numberText(metrics.gross_revenue), syncedAt: now,
          })
          continue
        }
        const budget = gmvMaxDecimal.parse(campaign.budget)
        const utilization = budget > 0n ? (gmvMaxDecimal.parse(cost) * 10_000n) / budget : 0n
        const metric: GmvMaxDailyMetric = {
          id: hash(campaign.id, statDate), campaignId: campaign.id, advertiserId: binding.advertiserId,
          storeId: binding.storeId, campaignType: campaign.campaignType, statDate, cost,
          grossRevenue: numberText(metrics.gross_revenue), roi: numberText(metrics.roi), orders: numberText(metrics.orders),
          budgetUtilization: gmvMaxDecimal.format(utilization, 4), raw: row, syncedAt: now,
        }
        gmvMaxRepo.saveMetric(metric)
        saved.push(metric)
      }
      if (!hasNextGmvMaxPage(result.data, page, pageSize, rows.length)) break
      page += 1
    }
  }
  return saved
}

function compatibilityAudit(binding: GmvMaxAccountBinding, action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  gmvMaxRepo.saveAudit({
    id: randomUUID(), connectionId: binding.connectionId, bindingId: binding.id, action, status: 'failed',
    requestSummary: { advertiserId: binding.advertiserId, storeId: binding.storeId }, error: message, createdAt: Date.now(), completedAt: Date.now(),
  })
}

async function syncProductsForBinding(binding: GmvMaxAccountBinding) {
  const runtime = await gmvMaxMcpClient.connect(binding.connectionId, false)
  if (!runtime.capabilities?.product_read) return
  try {
    const pageSize = 100
    const existing = new Map(gmvMaxRepo.listProductCosts()
      .filter((item) => item.storeId === binding.storeId && !item.campaignId)
      .map((item) => [item.productId, item]))
    const pageFingerprints = new Set<string>()
    let page = 1
    while (page <= 100) {
      const result = await gmvMaxMcpClient.call(binding.connectionId, 'store_product_get', {
        advertiser_id: binding.advertiserId,
        store_id: binding.storeId,
        bc_id: binding.businessCenterId,
        filtering: { ad_creation_eligible: 'GMV_MAX' },
        page,
        page_size: pageSize,
      })
      const rows = findArray(result.data, ['list', 'products', 'product_list'])
      const productRows = rows.length ? rows : findEntityArray(result.data, ['item_group_id', 'product_id', 'product_name'])
      if (repeatedPage(productRows, pageFingerprints)) break
      for (const row of productRows) {
        const productId = text(row.item_group_id || row.product_id || row.id)
        if (!productId) continue
        const current = existing.get(productId)
        const now = Date.now()
        const catalogMinPrice = numberText(row.min_price ?? row.price ?? row.sale_price, '')
        const catalogMaxPrice = numberText(row.max_price ?? row.price ?? row.sale_price, catalogMinPrice)
        gmvMaxRepo.saveProductCost({
          id: current?.id || hash(binding.storeId, productId), storeId: binding.storeId, productId,
          productName: text(row.product_name || row.title || row.name) || current?.productName,
          imageUrl: productImageUrl(row) || current?.imageUrl,
          categoryName: productCategoryName(row) || current?.categoryName,
          inventory: productInventory(row) || current?.inventory,
          skuCount: productSkuCount(row) || current?.skuCount,
          sellingPrice: current?.sellingPrice || (catalogMinPrice === catalogMaxPrice ? catalogMinPrice : ''),
          catalogMinPrice,
          catalogMaxPrice,
          variants: current?.variants || [],
          currency: current?.currency || binding.currency,
          catalogStatus: text(row.status) || current?.catalogStatus,
          gmvMaxAdsStatus: text(row.gmv_max_ads_status) || current?.gmvMaxAdsStatus,
          catalogSyncedAt: now,
          purchaseCost: current?.purchaseCost || '', firstMileCost: current?.firstMileCost || '', lastMileCost: current?.lastMileCost || '',
          warehousingCost: current?.warehousingCost || '', platformCommissionRate: current?.platformCommissionRate || '', creatorCommissionRate: current?.creatorCommissionRate || '',
          expectedReturnRate: current?.expectedReturnRate || '', returnLossRate: current?.returnLossRate || '', updatedAt: current?.updatedAt || now,
        })
      }
      if (!hasNextGmvMaxPage(result.data, page, pageSize, productRows.length)) break
      page += 1
    }
  } catch (error) { compatibilityAudit(binding, 'store_product_get', error) }
}

async function syncCreativeAssetsForBinding(binding: GmvMaxAccountBinding) {
  const runtime = await gmvMaxMcpClient.connect(binding.connectionId, false)
  if (!runtime.capabilities?.creative_read) return
  const identityRows: Record<string, any>[] = []
  try {
    const pageFingerprints = new Set<string>()
    let page = 1
    while (page <= 100) {
      const result = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_identity_get', {
        advertiser_id: binding.advertiserId,
        store_id: binding.storeId,
        store_authorized_bc_id: binding.businessCenterId,
        page,
        page_size: 100,
      })
      const rows = findArray(result.data, ['list', 'identities', 'identity_list'])
      const identities = rows.length ? rows : findEntityArray(result.data, ['identity_id'])
      if (repeatedPage(identities, pageFingerprints)) break
      identityRows.push(...identities)
      for (const row of identities) {
        const creativeId = text(row.identity_id || row.id)
        if (!creativeId) continue
        gmvMaxRepo.saveCreativeAsset({
          id: hash(binding.storeId, 'identity', creativeId), storeId: binding.storeId,
          creativeId, kind: 'identity', name: text(row.display_name || row.identity_name || row.name) || undefined,
          status: text(row.status || row.operation_status) || undefined, raw: row, syncedAt: Date.now(),
        })
      }
      if (!hasNextGmvMaxPage(result.data, page, 100, identities.length)) break
      page += 1
    }
  } catch (error) { compatibilityAudit(binding, 'gmv_max_identity_get', error) }

  const identityList = identityRows
    .map((row) => buildGmvMaxVideoIdentity(row, binding.storeId))
    .filter((item) => item.identity_id && item.identity_type)
  const savedVideoIds = new Set<string>()

  const syncVideoRequest = async (request: Record<string, unknown>) => {
    try {
      const pageFingerprints = new Set<string>()
      let page = 1
      while (page <= 100) {
        const result = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_video_get', {
          advertiser_id: binding.advertiserId,
          store_id: binding.storeId,
          store_authorized_bc_id: binding.businessCenterId,
          ...request,
          page,
          page_size: 50,
        })
        const rows = findArray(result.data, ['list', 'videos', 'video_list'])
        const videos = rows.length ? rows : findEntityArray(result.data, ['video_id', 'item_id'])
        if (repeatedPage(videos, pageFingerprints)) break
        for (const row of videos) {
          const creativeId = text(row.video_id || row.item_id || row.id)
          if (!creativeId || savedVideoIds.has(creativeId)) continue
          savedVideoIds.add(creativeId)
          gmvMaxRepo.saveCreativeAsset({
            id: hash(binding.storeId, 'video', creativeId), campaignId: text(row.campaign_id) || undefined, storeId: binding.storeId,
            creativeId, kind: 'video', name: text(row.video_name || row.item_name || row.name) || undefined,
            status: text(row.status || row.operation_status) || undefined, raw: row, syncedAt: Date.now(),
          })
        }
        if (!hasNextGmvMaxPage(result.data, page, 50, videos.length)) break
        page += 1
      }
    } catch (error) {
      const identities = Array.isArray(request.identity_list)
        ? request.identity_list as Array<Record<string, unknown>>
        : []
      if (identities.length > 1) {
        const middle = Math.ceil(identities.length / 2)
        await syncVideoRequest({ identity_list: identities.slice(0, middle) })
        await syncVideoRequest({ identity_list: identities.slice(middle) })
        return
      }
      compatibilityAudit(binding, 'gmv_max_video_get', error)
    }
  }

  for (const identities of chunks(identityList, 20)) {
    await syncVideoRequest({ identity_list: identities })
  }
  await syncVideoRequest({ need_auth_code_video: true })
}

async function syncCreativeMetricsForBinding(binding: GmvMaxAccountBinding, campaigns: GmvMaxCampaign[]) {
  const runtime = await gmvMaxMcpClient.connect(binding.connectionId, false)
  if (!runtime.capabilities?.core_read || binding.campaignType !== 'PRODUCT' || !campaigns.length) return
  const range = completedReportRange(binding.timezone, 30)
  try {
    for (const batch of chunks(campaigns, 100)) {
      const productPairs: Array<{ campaignId: string; itemGroupId: string }> = []
      const productPageFingerprints = new Set<string>()
      let productPage = 1
      while (productPage <= 100) {
        const productResult = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_report_get', buildGmvMaxProductReportRequest({
          advertiserId: binding.advertiserId,
          storeId: binding.storeId,
          campaignIds: batch.map((campaign) => campaign.id),
          campaignType: binding.campaignType,
          startDate: range.startDate,
          endDate: range.endDate,
          page: productPage,
        }))
        const productRows = findArray(productResult.data, ['list', 'rows', 'report_list'])
        if (repeatedPage(productRows, productPageFingerprints)) break
        for (const row of productRows) {
          const pair = parseGmvMaxProductReportIds(row)
          if (pair) productPairs.push(pair)
        }
        if (!hasNextGmvMaxPage(productResult.data, productPage, 1000, productRows.length)) break
        productPage += 1
      }
      const itemGroupIds = [...new Set(productPairs.map((pair) => pair.itemGroupId))]
      if (!itemGroupIds.length) continue
      for (const itemGroupBatch of chunks(itemGroupIds, 100)) {
        const pageFingerprints = new Set<string>()
        let page = 1
        while (page <= 100) {
          const result = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_report_get', buildGmvMaxCreativeReportRequest({
            advertiserId: binding.advertiserId,
            storeId: binding.storeId,
            campaignIds: batch.map((campaign) => campaign.id),
            itemGroupIds: itemGroupBatch,
            campaignType: binding.campaignType,
            startDate: range.startDate,
            endDate: range.endDate,
            page,
          }))
          const now = Date.now()
          const rows = findArray(result.data, ['list', 'rows', 'report_list'])
          if (repeatedPage(rows, pageFingerprints)) break
          for (const row of rows) {
            const metric = parseGmvMaxCreativeReportRow(row, binding.storeId, now)
            if (!metric) continue
            const legacyId = hash(metric.campaignId, metric.creativeId, metric.statDate)
            const id = buildGmvMaxCreativeMetricId(metric)
            if (legacyId !== id) gmvMaxRepo.removeCreativeMetric(legacyId)
            gmvMaxRepo.saveCreativeMetric({ ...metric, id })
          }
          if (!hasNextGmvMaxPage(result.data, page, 1000, rows.length)) break
          page += 1
        }
      }
    }
  } catch (error) { compatibilityAudit(binding, 'creative_report_sync', error) }
}

async function syncSessionsForBinding(binding: GmvMaxAccountBinding, campaigns: GmvMaxCampaign[]) {
  const runtime = await gmvMaxMcpClient.connect(binding.connectionId, false)
  if (!runtime.capabilities?.session_read) return
  for (const campaign of campaigns.filter((item) => policyFor(item.id).sessionPermission)) {
    try {
      const result = await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_session_list_get', { advertiser_id: binding.advertiserId, campaign_id: campaign.id })
      const syncedAt = Date.now()
      for (const session of sessionSnapshotsFromRows(campaign.id, findArray(result.data, ['list', 'sessions', 'session_list']), syncedAt)) gmvMaxRepo.saveSession(session)
    } catch (error) { compatibilityAudit(binding, 'campaign_gmv_max_session_list_get', error) }
  }
}

function latestExecutedAt(campaignId: string) {
  return gmvMaxRepo.listRecommendations()
    .filter((item) => item.campaignId === campaignId && item.status === 'executed')
    .reduce((latest, item) => Math.max(latest, Number(item.executedAt || 0)), 0) || undefined
}

function policyFor(campaignId: string) {
  return { ...defaultGmvMaxPolicy(campaignId), ...gmvMaxRepo.getPolicy(campaignId) }
}

function productIdsForCampaign(campaign: GmvMaxCampaign) {
  const source = campaign.raw?.campaign as Record<string, any> | undefined
  const values = source?.product_ids || source?.item_group_ids || source?.productIds || source?.products || []
  if (!Array.isArray(values)) return []
  return values.map((value) => text(typeof value === 'object' ? value.item_group_id || value.product_id || value.id : value)).filter(Boolean)
}

type GmvMaxProfitData = {
  productCosts: GmvMaxProductCost[]
  storeCosts: GmvMaxStoreCost[]
  bindingsById: Map<string, GmvMaxAccountBinding>
  creativeMetricsByCampaign: Map<string, GmvMaxCreativeMetric[]>
  dailyMetricsByCampaign: Map<string, GmvMaxDailyMetric[]>
  listEntries: GmvMaxListEntry[]
}

function aggregatedCreativeMetricsForProfit(range: { startDate: string; endDate: string }, campaignIds: string[]) {
  return gmvMaxRepo.listCreativeMetricAggregatesRange(range.startDate, range.endDate, { campaignIds }).map((item) => ({
    ...item.sample,
    cost: String(item.cost),
    grossRevenue: String(item.revenue),
    orders: String(item.orders),
    roi: String(item.cost > 0 ? item.revenue / item.cost : 0),
    cpa: String(item.orders > 0 ? item.cost / item.orders : 0),
    ctr: String(item.ctr),
    conversionRate: String(item.conversionRate),
    play2sRate: String(item.play2sRate),
    playDepth: String(item.playDepth),
  }))
}

function profitDataSnapshot(
  range?: { startDate: string; endDate: string },
  campaignIds?: string[],
  preloaded?: { creativeMetrics?: GmvMaxCreativeMetric[]; dailyMetrics?: GmvMaxDailyMetric[] },
): GmvMaxProfitData {
  const scopedCampaignIds = [...new Set((campaignIds || []).filter(Boolean))]
  const scopedCampaignIdSet = new Set(scopedCampaignIds)
  const scopedCampaigns = scopedCampaignIds.length ? gmvMaxRepo.listCampaignsByIds(scopedCampaignIds) : []
  const scopedStoreIds = [...new Set(scopedCampaigns.map((item) => item.storeId).filter(Boolean))]
  const scopedBindingIds = [...new Set(scopedCampaigns.map((item) => item.bindingId).filter(Boolean))]
  const creativeMetricsByCampaign = new Map<string, GmvMaxCreativeMetric[]>()
  const creativeMetrics = preloaded?.creativeMetrics
    ? preloaded.creativeMetrics.filter((item) => (!range || (item.statDate.slice(0, 10) >= range.startDate && item.statDate.slice(0, 10) <= range.endDate)) && (!scopedCampaignIds.length || scopedCampaignIdSet.has(item.campaignId)))
    : range ? gmvMaxRepo.listCreativeMetricsRange(range.startDate, range.endDate, { campaignIds: scopedCampaignIds }) : gmvMaxRepo.listCreativeMetrics()
  for (const metric of creativeMetrics) {
    creativeMetricsByCampaign.set(metric.campaignId, [...(creativeMetricsByCampaign.get(metric.campaignId) || []), metric])
  }
  const dailyMetricsByCampaign = new Map<string, GmvMaxDailyMetric[]>()
  const dailyMetrics = preloaded?.dailyMetrics
    ? preloaded.dailyMetrics.filter((item) => (!range || (item.statDate.slice(0, 10) >= range.startDate && item.statDate.slice(0, 10) <= range.endDate)) && (!scopedCampaignIds.length || scopedCampaignIdSet.has(item.campaignId)))
    : range ? gmvMaxRepo.listMetricsRange(range.startDate, range.endDate, scopedCampaignIds) : gmvMaxRepo.listMetrics()
  for (const metric of dailyMetrics) {
    dailyMetricsByCampaign.set(metric.campaignId, [...(dailyMetricsByCampaign.get(metric.campaignId) || []), metric])
  }
  const productCosts = scopedCampaignIds.length ? gmvMaxRepo.listProductCostsForScope(scopedStoreIds, scopedCampaignIds) : gmvMaxRepo.listProductCosts()
  const storeCosts = scopedCampaignIds.length ? gmvMaxRepo.listStoreCostsByStoreIds(scopedStoreIds) : gmvMaxRepo.listStoreCosts()
  const bindings = scopedCampaignIds.length ? gmvMaxRepo.listBindingsByIds(scopedBindingIds) : gmvMaxRepo.listBindings()
  const listEntries = scopedCampaignIds.length ? gmvMaxRepo.listListEntriesForScope(scopedStoreIds, scopedCampaignIds) : gmvMaxRepo.listListEntries()
  return {
    productCosts,
    storeCosts,
    bindingsById: new Map(bindings.map((item) => [item.id, item])),
    creativeMetricsByCampaign,
    dailyMetricsByCampaign,
    listEntries,
  }
}

function profitGuardFor(campaign: GmvMaxCampaign, policy = policyFor(campaign.id), data = profitDataSnapshot()) {
  const products = data.productCosts.filter((item) => item.storeId === campaign.storeId)
  const creativeMetrics = data.creativeMetricsByCampaign.get(campaign.id) || []
  const scopedProducts = selectGmvMaxCampaignProductCosts({
    campaignId: campaign.id,
    productIds: productIdsForCampaign(campaign),
    metrics: creativeMetrics,
    productCosts: products,
  })
  const productIds = scopedProducts.productIds
  const relevantProducts = scopedProducts.productCosts
  const store = data.storeCosts.find((item) => item.storeId === campaign.storeId)
  const binding = data.bindingsById.get(campaign.bindingId)
  const campaignPrice = text((campaign.raw?.campaign as any)?.average_order_value)
  const observedPrice = deriveGmvMaxObservedSellingPrice(data.dailyMetricsByCampaign.get(campaign.id) || [])
  if (campaign.campaignType === 'PRODUCT') {
    if (!productIds.length) {
      return {
        complete: false,
        contributionMarginRate: '0',
        breakEvenRoi: '0',
        effectiveRoiFloor: policy.minRoi,
        productCount: 0,
        coveredProductCount: 0,
        productCoveragePercent: 0,
        uncoveredSpendShare: '1',
        reason: 'Campaign product evidence is unavailable.',
      }
    }
    return calculateGmvMaxCampaignProfitGuard({
      minRoi: policy.minRoi,
      safetyMarginPercent: policy.profitSafetyMarginPercent,
      metrics: creativeMetrics,
      productCosts: relevantProducts,
      storeCost: store,
      currency: binding?.currency,
      fallbackSellingPrice: campaignPrice || observedPrice,
    })
  }
  const product = relevantProducts.find((item) => productIds.includes(item.productId)) || (relevantProducts.length === 1 ? relevantProducts[0] : undefined)
  if (product?.currency && binding?.currency && product.currency !== binding.currency) {
    return { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: policy.minRoi, reason: 'Product cost currency does not match the advertiser currency.' }
  }
  const fallbackSellingPrice = campaignPrice || observedPrice
  return calculateGmvMaxConfiguredProductProfitGuard({
    product,
    storeCost: store,
    fallbackSellingPrice,
    fallbackSellingPriceSource: campaignPrice ? 'campaign' : observedPrice ? 'observed' : undefined,
    minRoi: policy.minRoi,
    safetyMarginPercent: policy.profitSafetyMarginPercent,
  })
}

function profitGuardForSopProduct(
  campaign: GmvMaxCampaign,
  productId: string | undefined,
  policy: GmvMaxPolicy,
  data: ReturnType<typeof profitDataSnapshot>,
  dailyMetrics: GmvMaxDailyMetric[],
) {
  if (campaign.campaignType !== 'PRODUCT' || !productId) return profitGuardFor(campaign, policy, data)
  const product = data.productCosts.find((item) => item.storeId === campaign.storeId && item.productId === productId && item.campaignId === campaign.id)
    || data.productCosts.find((item) => item.storeId === campaign.storeId && item.productId === productId && !item.campaignId)
  const store = data.storeCosts.find((item) => item.storeId === campaign.storeId)
  const binding = data.bindingsById.get(campaign.bindingId)
  if (product?.currency && binding?.currency && product.currency !== binding.currency) {
    return { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: policy.minRoi, reason: 'Product cost currency does not match the advertiser currency.' } as GmvMaxProfitGuard
  }
  const observedPrice = deriveGmvMaxObservedSellingPrice(dailyMetrics)
  return calculateGmvMaxConfiguredProductProfitGuard({
    product,
    storeCost: store,
    fallbackSellingPrice: observedPrice,
    fallbackSellingPriceSource: observedPrice ? 'observed' : undefined,
    minRoi: policy.minRoi,
    safetyMarginPercent: policy.profitSafetyMarginPercent,
  })
}

function pacingDiagnostics(campaigns: GmvMaxCampaign[], now = Date.now()) {
  const bindings = new Map(gmvMaxRepo.listBindings().map((item) => [item.id, item]))
  return campaigns.map((campaign): GmvMaxPacingDiagnostic => {
    const binding = bindings.get(campaign.bindingId)
    const timezone = binding?.timezone || 'UTC'
    const local = zonedDateParts(timezone, now)
    return evaluateGmvMaxPacingDiagnostic({
      campaign,
      samples: gmvMaxRepo.listRealtimeSamples(campaign.id),
      timezone,
      localDate: local.date,
      localHour: local.hour,
      localMinute: local.minute,
      now,
    })
  })
}

function latestLearningSnapshots(campaignIds?: string[]) {
  const latest = new Map<string, GmvMaxLearningSnapshot>()
  const items = campaignIds?.length ? gmvMaxRepo.listLearningSnapshotsForCampaigns(campaignIds) : gmvMaxRepo.listLearningSnapshots()
  for (const item of items) {
    if (!latest.has(item.campaignId)) latest.set(item.campaignId, item)
  }
  return [...latest.values()]
}

function measureLearningOutcomes(
  now = Date.now(),
  targetCampaigns = gmvMaxRepo.listCampaigns(),
  profitData = profitDataSnapshot(),
) {
  const existing = new Set(gmvMaxRepo.listActionOutcomes().map((item) => item.recommendationId))
  const campaigns = new Map(targetCampaigns.map((item) => [item.id, item]))
  const bindings = new Map(gmvMaxRepo.listBindings().map((item) => [item.id, item]))
  const measured = []
  for (const recommendation of gmvMaxRepo.listRecommendations()) {
    if (recommendation.status !== 'executed' || !recommendation.executedAt || existing.has(recommendation.id)) continue
    const campaign = campaigns.get(recommendation.campaignId)
    const binding = campaign && bindings.get(campaign.bindingId)
    if (!campaign || !binding) continue
    const outcome = measureGmvMaxActionOutcome({
      recommendation,
      metrics: profitData.dailyMetricsByCampaign.get(campaign.id) || [],
      creativeMetrics: profitData.creativeMetricsByCampaign.get(campaign.id) || [],
      actionDate: zonedDateParts(binding.timezone, recommendation.executedAt).date,
      profitGuard: profitGuardFor(campaign, policyFor(campaign.id), profitData),
      now,
    })
    if (!outcome) continue
    measured.push(gmvMaxRepo.saveActionOutcome(outcome))
    existing.add(recommendation.id)
  }
  return measured
}

function analyzeGrowth(campaigns = gmvMaxRepo.listCampaigns(), now = Date.now(), profitData = profitDataSnapshot()) {
  const previous = new Map(latestLearningSnapshots().map((item) => [item.campaignId, item]))
  return campaigns.map((campaign) => {
    const policy = policyFor(campaign.id)
    const snapshot = analyzeGmvMaxLifecycle({
      campaign,
      policy,
      metrics: profitData.dailyMetricsByCampaign.get(campaign.id) || [],
      creativeMetrics: profitData.creativeMetricsByCampaign.get(campaign.id) || [],
      profitGuard: profitGuardFor(campaign, policy, profitData),
      previous: previous.get(campaign.id),
      actionOutcomes: gmvMaxRepo.listActionOutcomes(campaign.id),
      now,
    })
    return gmvMaxRepo.saveLearningSnapshot(snapshot)
  })
}

function latestCreativeInsights(campaignIds?: string[]) {
  const latest = new Map<string, ReturnType<typeof gmvMaxRepo.listCreativeInsights>[number]>()
  const items = campaignIds?.length ? gmvMaxRepo.listCreativeInsightsForCampaigns(campaignIds) : gmvMaxRepo.listCreativeInsights()
  for (const item of items) {
    const key = `${item.campaignId}:${item.creativeId}:${item.itemGroupId || 'unscoped'}`
    if (!latest.has(key)) latest.set(key, item)
  }
  return [...latest.values()]
}

function latestPortfolioPlans() {
  const plans = gmvMaxRepo.listPortfolioPlans()
  const latestByStore = new Map<string, number>()
  for (const item of plans) {
    if (!latestByStore.has(item.storeId)) latestByStore.set(item.storeId, item.analyzedAt)
  }
  return plans.filter((item) => latestByStore.get(item.storeId) === item.analyzedAt)
}

function catalogStatus() {
  const products = gmvMaxRepo.listProductCosts().filter((item) => !item.campaignId)
  const assets = gmvMaxRepo.listCreativeAssets()
  const identities = assets.filter((item) => item.kind === 'identity')
  const videos = assets.filter((item) => item.kind === 'video')
  return {
    products: products.length,
    configuredProducts: products.filter((item) => Boolean(item.purchaseCost || item.platformCommissionRate || item.creatorCommissionRate)).length,
    identities: identities.length,
    videos: videos.length,
    lastProductSyncedAt: Math.max(0, ...products.map((item) => Number(item.catalogSyncedAt || 0))) || undefined,
    lastCreativeSyncedAt: Math.max(0, ...assets.map((item) => Number(item.syncedAt || 0))) || undefined,
  }
}

function strategyCalibrations(now = Date.now()) {
  const campaigns = gmvMaxRepo.listCampaigns()
  return buildGmvMaxStrategyCalibrations({
    campaigns,
    policies: campaigns.map((campaign) => policyFor(campaign.id)),
    recommendations: gmvMaxRepo.listRecommendations(),
    outcomes: gmvMaxRepo.listActionOutcomes(),
    now,
  })
}

function dashboardDateRange(input?: { startDate?: string; endDate?: string }, fallbackDays = 30) {
  const fallback = completedReportRange('UTC', fallbackDays)
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.startDate || '')) ? String(input?.startDate) : fallback.startDate
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.endDate || '')) ? String(input?.endDate) : fallback.endDate
  return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate }
}

function dateRangeEpoch(range: { startDate: string; endDate: string }) {
  const startAt = Date.parse(`${range.startDate}T00:00:00.000Z`)
  const endAt = Date.parse(`${range.endDate}T23:59:59.999Z`)
  return { startAt, endAt }
}

function creativeField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return '-'
}

function creativePage(input?: {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  storeId?: string
  campaignId?: string
  source?: string
  state?: string
  search?: string
  minSpend?: number
  minOrders?: number
  minRoi?: number
  maxCpa?: number
  minCtr?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}) {
  const range = dashboardDateRange(input, 30)
  const page = Math.max(1, Math.trunc(Number(input?.page) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(input?.pageSize) || 25)))
  const aggregatePage = gmvMaxRepo.listCreativeMetricAggregatePage(range.startDate, range.endDate, {
    page,
    pageSize,
    campaignIds: input?.campaignId && input.campaignId !== 'all' ? [input.campaignId] : undefined,
    storeId: input?.storeId,
    source: input?.source,
    state: input?.state,
    search: input?.search,
    minSpend: input?.minSpend,
    minOrders: input?.minOrders,
    minRoi: input?.minRoi,
    maxCpa: input?.maxCpa,
    minCtr: input?.minCtr,
    sortBy: input?.sortBy,
    sortDirection: input?.sortDirection,
  })
  const grouped = aggregatePage.items
  const campaignIds = [...new Set(grouped.map((item) => item.sample.campaignId).filter(Boolean))]
  const storeIds = [...new Set(grouped.map((item) => item.sample.storeId).filter(Boolean))]
  const creativeIds = [...new Set(grouped.map((item) => item.sample.creativeId).filter(Boolean))]
  const campaigns = new Map(gmvMaxRepo.listCampaignsByIds(campaignIds).map((item) => [item.id, item]))
  const assets = gmvMaxRepo.listCreativeAssetsForScope({ storeIds, campaignIds, creativeIds })
  const insights = new Map(latestCreativeInsights(campaignIds).map((item) => [`${item.campaignId}:${item.creativeId}:${item.itemGroupId || 'unscoped'}`, item]))
  const learning = new Map(latestLearningSnapshots(campaignIds).map((item) => [item.campaignId, item]))
  const policies = new Map(campaignIds.map((campaignId) => [campaignId, policyFor(campaignId)]))

  const rows = grouped.map((group) => {
    const asset = resolveGmvMaxCreativeAsset(assets, group.sample)
    const raw = { ...(asset?.raw || {}), ...(group.sample.raw || {}) }
    const campaign = campaigns.get(group.sample.campaignId)
    const insight = insights.get(`${group.sample.campaignId}:${group.sample.creativeId}:${group.sample.itemGroupId || 'unscoped'}`)
    const policy = policies.get(group.sample.campaignId) || defaultGmvMaxPolicy(group.sample.campaignId)
    const roi = group.cost > 0 ? group.revenue / group.cost : 0
    const cpa = group.orders > 0 ? group.cost / group.orders : 0
    const testBudget = Number(policy.creativeTestBudget) || 0
    const profitFloor = Number(learning.get(group.sample.campaignId)?.profitFloor || policy.minRoi) || 0
    const label = group.orders >= 3 && roi >= profitFloor ? 'winner' : group.orders === 0 && testBudget > 0 && group.cost >= testBudget ? 'waste' : group.orders < 3 && (testBudget <= 0 || group.cost < testBudget) ? 'testing' : 'watch'
    return {
      ...group.sample,
      creativeName: group.sample.creativeName || asset?.name,
      campaignName: campaign?.name || group.sample.campaignId,
      cost: String(group.cost),
      grossRevenue: String(group.revenue),
      orders: String(group.orders),
      roi: roi.toFixed(4),
      cpa: cpa.toFixed(4),
      ctr: group.ctr.toFixed(4),
      conversionRate: group.conversionRate.toFixed(4),
      play2sRate: group.play2sRate.toFixed(4),
      playDepth: group.playDepth.toFixed(4),
      days: group.days,
      creatorName: creativeField(raw, ['creator_name', 'user_name', 'identity_name', 'display_name']),
      productName: creativeField(raw, ['product_name', 'product_title', 'item_name']) === '-'
        ? group.sample.itemGroupId || '-'
        : creativeField(raw, ['product_name', 'product_title', 'item_name']),
      authorizationType: creativeField(raw, ['authorization_type', 'identity_type', 'source']),
      authorizationStatus: creativeField(raw, ['authorization_status', 'status', 'operation_status']),
      label,
      intelligenceState: insight?.state || 'testing',
      intelligenceScore: insight?.score || 0,
      intelligenceRoiTrend: insight?.roiTrendPercent || '0',
      raw,
    }
  })
  const summary = aggregatePage.summary
  return {
    items: rows,
    total: aggregatePage.total,
    page,
    pageSize,
    startDate: range.startDate,
    endDate: range.endDate,
    summary: { ...summary, roi: summary.cost > 0 ? summary.revenue / summary.cost : 0 },
  }
}

function campaignDataPage(input?: {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  storeId?: string
  campaignType?: string
  status?: string
  pacingState?: string
  search?: string
  minSpend?: number
  minOrders?: number
  minRoi?: number
  minUtilization?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}) {
  const range = dashboardDateRange(input, 7)
  const page = Math.max(1, Math.trunc(Number(input?.page) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(input?.pageSize) || 20)))
  const campaigns = gmvMaxRepo.listCampaigns().filter((item) => {
    if (input?.storeId && input.storeId !== 'all' && item.storeId !== input.storeId) return false
    if (input?.campaignType && input.campaignType !== 'all' && item.campaignType !== input.campaignType) return false
    if (input?.status && input.status !== 'all' && item.operationStatus !== input.status) return false
    return true
  })
  const campaignIds = campaigns.map((item) => item.id)
  const metrics = gmvMaxRepo.listMetricsRange(range.startDate, range.endDate, campaignIds)
  const metricsByCampaign = new Map<string, { cost: number; revenue: number; orders: number; roi: number; utilization: number; samples: number }>()
  for (const metric of metrics) {
    const current = metricsByCampaign.get(metric.campaignId) || { cost: 0, revenue: 0, orders: 0, roi: 0, utilization: 0, samples: 0 }
    current.cost += Number(metric.cost) || 0
    current.revenue += Number(metric.grossRevenue) || 0
    current.orders += Number(metric.orders) || 0
    current.utilization += Number(metric.budgetUtilization) || 0
    current.samples += 1
    current.roi = current.cost > 0 ? current.revenue / current.cost : 0
    metricsByCampaign.set(metric.campaignId, current)
  }
  for (const value of metricsByCampaign.values()) value.utilization = value.samples ? value.utilization / value.samples : 0
  const pacingByCampaign = new Map(pacingDiagnostics(campaigns).map((item) => [item.campaignId, item]))
  const learningByCampaign = new Map(latestLearningSnapshots().map((item) => [item.campaignId, item]))
  const profitData = profitDataSnapshot(range, campaignIds, {
    creativeMetrics: aggregatedCreativeMetricsForProfit(range, campaignIds),
    dailyMetrics: metrics,
  })
  const recommendationCounts = gmvMaxRepo.pendingRecommendationCountsByCampaign()
  const query = String(input?.search || '').trim().toLowerCase()
  const rows = campaigns.map((campaign) => {
    const binding = profitData.bindingsById.get(campaign.bindingId) || null
    const summary = metricsByCampaign.get(campaign.id) || { cost: 0, revenue: 0, orders: 0, roi: 0, utilization: 0, samples: 0 }
    const pacing = pacingByCampaign.get(campaign.id) || null
    const utilization = pacing?.dataStable ? Number(pacing.actualSpendRatio) || 0 : summary.utilization
    const policy = policyFor(campaign.id)
    const profitGuard = profitGuardFor(campaign, policy, profitData)
    return {
      ...campaign,
      binding,
      metrics: { ...summary, utilization },
      pacing,
      policy,
      profitGuard,
      learning: learningByCampaign.get(campaign.id) || null,
      recommendationCount: recommendationCounts.get(campaign.id) || 0,
    }
  }).filter((item) => {
    if (input?.storeId && input.storeId !== 'all' && item.storeId !== input.storeId) return false
    if (input?.campaignType && input.campaignType !== 'all' && item.campaignType !== input.campaignType) return false
    if (input?.status && input.status !== 'all' && item.operationStatus !== input.status) return false
    if (input?.pacingState && input.pacingState !== 'all' && item.pacing?.state !== input.pacingState) return false
    if (query && !`${item.name} ${item.id} ${item.binding?.storeName || ''} ${item.binding?.advertiserName || ''}`.toLowerCase().includes(query)) return false
    if (Number(input?.minSpend) > 0 && item.metrics.cost < Number(input?.minSpend)) return false
    if (Number(input?.minOrders) > 0 && item.metrics.orders < Number(input?.minOrders)) return false
    if (Number(input?.minRoi) > 0 && item.metrics.roi < Number(input?.minRoi)) return false
    if (Number(input?.minUtilization) > 0 && item.metrics.utilization < Number(input?.minUtilization) / 100) return false
    return true
  })
  const direction = input?.sortDirection === 'asc' ? 1 : -1
  const sortBy = String(input?.sortBy || 'cost')
  rows.sort((left, right) => {
    if (sortBy === 'name') return direction * left.name.localeCompare(right.name)
    if (sortBy === 'budget') return direction * ((Number(left.budget) || 0) - (Number(right.budget) || 0))
    if (sortBy === 'profitFloor') return direction * ((Number(left.profitGuard.effectiveRoiFloor) || 0) - (Number(right.profitGuard.effectiveRoiFloor) || 0))
    const key = ['cost', 'orders', 'roi', 'utilization'].includes(sortBy) ? sortBy as 'cost' | 'orders' | 'roi' | 'utilization' : 'cost'
    return direction * (left.metrics[key] - right.metrics[key]) || left.id.localeCompare(right.id)
  })
  const items = rows.slice((page - 1) * pageSize, page * pageSize)
  return {
    items,
    total: rows.length,
    page,
    pageSize,
    startDate: range.startDate,
    endDate: range.endDate,
    summary: rows.reduce((result, item) => {
      result.cost += item.metrics.cost
      result.revenue += item.metrics.revenue
      result.orders += item.metrics.orders
      return result
    }, { cost: 0, revenue: 0, orders: 0 }),
  }
}

function analyzeProductIntelligence(campaigns: GmvMaxCampaign[], now = Date.now(), profitData = profitDataSnapshot()) {
  return campaigns.flatMap((campaign) => analyzeGmvMaxProductIntelligence({
    campaign,
    policy: policyFor(campaign.id),
    metrics: profitData.creativeMetricsByCampaign.get(campaign.id) || [],
    productCosts: profitData.productCosts,
    storeCost: profitData.storeCosts.find((item) => item.storeId === campaign.storeId),
    listEntries: profitData.listEntries,
    currency: profitData.bindingsById.get(campaign.bindingId)?.currency,
    now,
  }))
}

function productPage(input?: {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  storeId?: string
  campaignId?: string
  state?: string
  allocationState?: string
  search?: string
  minSpend?: number
  minOrders?: number
  minRoi?: number
  minScore?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}) {
  const range = dashboardDateRange(input, 30)
  const page = Math.max(1, Math.trunc(Number(input?.page) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(input?.pageSize) || 25)))
  const campaigns = gmvMaxRepo.listCampaigns().filter((item) => {
    if (input?.storeId && input.storeId !== 'all' && item.storeId !== input.storeId) return false
    if (input?.campaignId && input.campaignId !== 'all' && item.id !== input.campaignId) return false
    return true
  })
  const campaignMap = new Map(campaigns.map((item) => [item.id, item]))
  const profitData = profitDataSnapshot(range, campaigns.map((item) => item.id))
  const query = String(input?.search || '').trim().toLowerCase()
  const rows = analyzeProductIntelligence(campaigns, Date.now(), profitData).filter((item) => {
    const campaign = campaignMap.get(item.campaignId)
    const haystack = `${item.productName || ''} ${item.productId} ${item.categoryName || ''} ${item.catalogStatus || ''} ${item.gmvMaxAdsStatus || ''} ${campaign?.name || ''} ${item.campaignId} ${item.storeId}`.toLowerCase()
    if (query && !haystack.includes(query)) return false
    if (input?.state && input.state !== 'all' && item.state !== input.state) return false
    if (input?.allocationState && input.allocationState !== 'all' && item.allocationState !== input.allocationState) return false
    if (Number(input?.minSpend) > 0 && Number(item.spend) < Number(input?.minSpend)) return false
    if (Number(input?.minOrders) > 0 && Number(item.orders) < Number(input?.minOrders)) return false
    if (Number(input?.minRoi) > 0 && Number(item.roi) < Number(input?.minRoi)) return false
    if (Number(input?.minScore) > 0 && item.score < Number(input?.minScore)) return false
    return true
  })
  const sortBy = ['productName', 'sellingPrice', 'inventory', 'score', 'spend', 'grossRevenue', 'orders', 'roi', 'roiTrendPercent', 'estimatedProfit', 'creativeCount', 'daysObserved', 'spendShare'].includes(String(input?.sortBy)) ? String(input?.sortBy) : 'grossRevenue'
  const direction = input?.sortDirection === 'asc' ? 1 : -1
  rows.sort((left, right) => {
    if (sortBy === 'estimatedProfit' && left.profitEstimateAvailable !== right.profitEstimateAvailable) {
      return left.profitEstimateAvailable ? -1 : 1
    }
    if (sortBy === 'productName') return direction * String(left.productName || left.productId).localeCompare(String(right.productName || right.productId))
    return direction * ((Number((left as any)[sortBy]) || 0) - (Number((right as any)[sortBy]) || 0))
  })
  const summary = rows.reduce((result, item) => {
    result.spend += Number(item.spend) || 0
    result.revenue += Number(item.grossRevenue) || 0
    result.orders += Number(item.orders) || 0
    if (item.profitEstimateAvailable) result.estimatedProfit += Number(item.estimatedProfit) || 0
    result.scaleReady += Number(item.state === 'scale_ready')
    result.testing += Number(['cold_start', 'testing'].includes(item.state))
    result.atRisk += Number(['declining', 'losing'].includes(item.state))
    result.costBlocked += Number(item.state === 'blocked')
    return result
  }, { spend: 0, revenue: 0, orders: 0, estimatedProfit: 0, scaleReady: 0, testing: 0, atRisk: 0, costBlocked: 0 })
  const offset = (page - 1) * pageSize
  return {
    items: rows.slice(offset, offset + pageSize), total: rows.length, page, pageSize,
    startDate: range.startDate, endDate: range.endDate,
    summary: { ...summary, roi: summary.spend > 0 ? summary.revenue / summary.spend : 0 },
  }
}

function actionPage(input?: {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  storeId?: string
  campaignId?: string
  status?: string
  actionType?: string
  risk?: string
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}) {
  const range = dashboardDateRange(input, 30)
  const page = Math.max(1, Math.trunc(Number(input?.page) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(input?.pageSize) || 20)))
  const campaigns = new Map(gmvMaxRepo.listCampaigns().map((item) => [item.id, item]))
  const query = String(input?.search || '').trim().toLowerCase()
  const epoch = dateRangeEpoch(range)
  const auditsByRecommendation = new Map<string, GmvMaxAuditRecord>()
  for (const audit of gmvMaxRepo.listAuditsRange(epoch.startAt, epoch.endAt)) {
    if (audit.recommendationId && !auditsByRecommendation.has(audit.recommendationId)) auditsByRecommendation.set(audit.recommendationId, audit)
  }
  const rows = gmvMaxRepo.listRecommendationsRange(epoch.startAt, epoch.endAt).filter((item) => {
    const campaign = campaigns.get(item.campaignId)
    const createdDate = isoDate(item.createdAt)
    if (createdDate < range.startDate || createdDate > range.endDate) return false
    if (input?.storeId && input.storeId !== 'all' && campaign?.storeId !== input.storeId) return false
    if (input?.campaignId && input.campaignId !== 'all' && item.campaignId !== input.campaignId) return false
    if (input?.status && input.status !== 'all' && item.status !== input.status) return false
    if (input?.actionType && input.actionType !== 'all' && item.actionType !== input.actionType) return false
    if (input?.risk && input.risk !== 'all' && item.risk !== input.risk) return false
    if (query && !`${campaign?.name || ''} ${item.campaignId} ${item.reason} ${item.actionType || ''} ${item.kind}`.toLowerCase().includes(query)) return false
    return true
  }).map((item) => {
    const audit = auditsByRecommendation.get(item.id)
    const acceptedByTikTok = Boolean(audit?.remoteRequestId || audit?.responseSummary?.requestId)
    const verifiedByAudit = audit?.status === 'succeeded'
    return {
      ...item,
      writeAttempted: item.writeAttempted ?? acceptedByTikTok,
      platformStateVerified: item.platformStateVerified ?? verifiedByAudit,
      remoteRequestId: item.remoteRequestId || audit?.remoteRequestId || text(audit?.responseSummary?.requestId) || undefined,
    }
  })
  const sortBy = ['createdAt', 'risk', 'status', 'actionType', 'currentBudget', 'proposedBudget', 'projectedNetProfitDelta', 'confidence'].includes(String(input?.sortBy)) ? String(input?.sortBy) : 'projectedNetProfitDelta'
  const direction = input?.sortDirection === 'asc' ? 1 : -1
  const riskOrder: Record<string, number> = { low: 1, medium: 2, high: 3 }
  rows.sort((left, right) => {
    if (sortBy === 'risk') return direction * ((riskOrder[left.risk] || 0) - (riskOrder[right.risk] || 0))
    if (['status', 'actionType'].includes(sortBy)) return direction * String((left as any)[sortBy] || '').localeCompare(String((right as any)[sortBy] || ''))
    return direction * ((Number((left as any)[sortBy]) || 0) - (Number((right as any)[sortBy]) || 0))
  })
  const summary = rows.reduce((result, item) => {
    result.pending += Number(item.status === 'pending')
    result.executed += Number(item.status === 'executed')
    result.failed += Number(item.status === 'failed')
    result.shadow += Number(item.status === 'pending' && Boolean(item.shadow))
    return result
  }, { pending: 0, executed: 0, failed: 0, shadow: 0 })
  const offset = (page - 1) * pageSize
  return { items: rows.slice(offset, offset + pageSize), total: rows.length, page, pageSize, startDate: range.startDate, endDate: range.endDate, summary }
}

export function enrichRecommendationBusinessImpact(
  item: GmvMaxRecommendation,
  profitGuard?: GmvMaxProfitGuard,
) {
  const confidence = Math.max(0, Math.min(100, Math.round(
    item.lifecycle?.confidence
      ?? item.calibration?.confidence
      ?? 0,
  )))
  const blockedReasons = profitGuard?.complete === false && profitGuard.reason ? [profitGuard.reason] : []
  if (!['budget', 'roi'].includes(item.actionType || 'budget') || !profitGuard?.complete) {
    return { ...item, projectionSource: 'unavailable' as const, confidence, blockedReasons }
  }
  const scale = 10_000n
  const budgetDelta = gmvMaxDecimal.parse(item.proposedBudget) - gmvMaxDecimal.parse(item.currentBudget)
  const roi = gmvMaxDecimal.parse(item.evidence.averageRoi)
  const margin = gmvMaxDecimal.parse(profitGuard.contributionMarginRate)
  const projectedGmvDelta = (budgetDelta * roi) / scale
  const profitPerSpend = (roi * margin) / scale - scale
  const projectedNetProfitDelta = (budgetDelta * profitPerSpend) / scale
  return {
    ...item,
    projectedGmvDelta: gmvMaxDecimal.format(projectedGmvDelta),
    projectedNetProfitDelta: gmvMaxDecimal.format(projectedNetProfitDelta),
    projectionSource: 'modeled' as const,
    confidence,
    blockedReasons,
  }
}

function outcomePage(input?: {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  storeId?: string
  campaignId?: string
  successful?: boolean
  sortDirection?: 'asc' | 'desc'
}) {
  const range = dashboardDateRange(input, 30)
  const page = Math.max(1, Math.trunc(Number(input?.page) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(input?.pageSize) || 20)))
  const campaigns = new Map(gmvMaxRepo.listCampaigns().map((item) => [item.id, item]))
  const rows = gmvMaxRepo.listActionOutcomes().filter((item) => {
    const campaign = campaigns.get(item.campaignId)
    const measuredDate = isoDate(item.measuredAt)
    if (measuredDate < range.startDate || measuredDate > range.endDate) return false
    if (input?.storeId && input.storeId !== 'all' && campaign?.storeId !== input.storeId) return false
    if (input?.campaignId && input.campaignId !== 'all' && item.campaignId !== input.campaignId) return false
    if (typeof input?.successful === 'boolean' && item.successful !== input.successful) return false
    return true
  })
  const direction = input?.sortDirection === 'asc' ? 1 : -1
  rows.sort((left, right) => direction * (left.measuredAt - right.measuredAt))
  const summary = rows.reduce((result, item) => {
    result.successful += Number(item.successful)
    result.roiDelta += Number(item.roiDeltaPercent) || 0
    result.profitDelta += Number(item.profitDeltaPercent) || 0
    return result
  }, { successful: 0, roiDelta: 0, profitDelta: 0 })
  const offset = (page - 1) * pageSize
  return {
    items: rows.slice(offset, offset + pageSize), total: rows.length, page, pageSize,
    startDate: range.startDate, endDate: range.endDate,
    summary: {
      successful: summary.successful,
      successRate: rows.length ? summary.successful / rows.length : 0,
      averageRoiDeltaPercent: rows.length ? summary.roiDelta / rows.length : 0,
      averageProfitDeltaPercent: rows.length ? summary.profitDelta / rows.length : 0,
    },
  }
}

function auditPage(input?: {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  storeId?: string
  campaignId?: string
  status?: string
  action?: string
  search?: string
  sortDirection?: 'asc' | 'desc'
}) {
  const range = dashboardDateRange(input, 30)
  const page = Math.max(1, Math.trunc(Number(input?.page) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(input?.pageSize) || 25)))
  const campaigns = new Map(gmvMaxRepo.listCampaigns().map((item) => [item.id, item]))
  const query = String(input?.search || '').trim().toLowerCase()
  const epoch = dateRangeEpoch(range)
  const rows = gmvMaxRepo.listAuditsRange(epoch.startAt, epoch.endAt).filter((item) => {
    const campaign = item.campaignId ? campaigns.get(item.campaignId) : undefined
    const createdDate = isoDate(item.createdAt)
    if (createdDate < range.startDate || createdDate > range.endDate) return false
    if (input?.storeId && input.storeId !== 'all' && campaign?.storeId !== input.storeId) return false
    if (input?.campaignId && input.campaignId !== 'all' && item.campaignId !== input.campaignId) return false
    if (input?.status && input.status !== 'all' && item.status !== input.status) return false
    if (input?.action && input.action !== 'all' && item.action !== input.action) return false
    if (query && !`${campaign?.name || ''} ${item.campaignId || ''} ${item.action} ${item.status} ${item.remoteRequestId || ''} ${item.error || ''}`.toLowerCase().includes(query)) return false
    return true
  })
  const direction = input?.sortDirection === 'asc' ? 1 : -1
  rows.sort((left, right) => direction * (left.createdAt - right.createdAt))
  const summary = rows.reduce((result, item) => {
    result.succeeded += Number(item.status === 'succeeded')
    result.failed += Number(item.status === 'failed')
    result.started += Number(item.status === 'started')
    return result
  }, { succeeded: 0, failed: 0, started: 0 })
  const offset = (page - 1) * pageSize
  return { items: rows.slice(offset, offset + pageSize), total: rows.length, page, pageSize, startDate: range.startDate, endDate: range.endDate, summary }
}

function analyzeAdvancedIntelligence(campaigns: GmvMaxCampaign[], learning: GmvMaxLearningSnapshot[], now = Date.now(), profitData = profitDataSnapshot()) {
  gmvMaxRepo.clearCreativeInsights()
  const insights = campaigns.flatMap((campaign) => analyzeGmvMaxCreativeIntelligence({
    campaign,
    policy: policyFor(campaign.id),
    profitGuard: profitGuardFor(campaign, policyFor(campaign.id), profitData),
    metrics: profitData.creativeMetricsByCampaign.get(campaign.id) || [],
    now,
  })).map((item) => gmvMaxRepo.saveCreativeInsight(item))
  const policies = Object.fromEntries(campaigns.map((campaign) => [campaign.id, policyFor(campaign.id)]))
  const productInsights = analyzeProductIntelligence(campaigns, now, profitData)
  const learningByCampaign = Object.fromEntries(learning.map((item) => [item.campaignId, item]))
  const profitGuards = Object.fromEntries(campaigns.map((campaign) => [campaign.id, profitGuardFor(campaign, policies[campaign.id], profitData)]))
  const pendingCampaignIds = new Set(gmvMaxRepo.listRecommendations()
    .filter((item) => ['pending', 'approved', 'executing', 'failed'].includes(item.status))
    .map((item) => item.campaignId))
  const storeIds = [...new Set(campaigns.map((campaign) => campaign.storeId))]
  gmvMaxRepo.clearPortfolioDrafts()
  const plans = storeIds.flatMap((storeId) => buildGmvMaxPortfolioPlans({
    storeId,
    campaigns,
    policies,
    learning: learningByCampaign,
    creativeInsights: insights,
    productInsights,
    metrics: [...profitData.dailyMetricsByCampaign.values()].flat(),
    profitGuards,
    pendingCampaignIds,
    now,
  })).map((item) => gmvMaxRepo.savePortfolioPlan(item))
  return { insights, productInsights, plans }
}

async function sendGmvMaxNotification(eventType: string, message: string) {
  const config = gmvMaxRepo.listNotificationConfigs()[0]
  if (!config?.enabled) return
  const record = { id: randomUUID(), eventType, status: 'succeeded' as const, target: config.target, message, createdAt: Date.now() }
  try {
    await sendHermesMessage({ platform: 'feishu', target: config.target, message })
    gmvMaxRepo.saveNotification(record)
  } catch (error) {
    gmvMaxRepo.saveNotification({ ...record, status: 'failed', error: error instanceof Error ? error.message : String(error) })
  }
}

function hasPendingChange(campaignId: string) {
  return gmvMaxRepo.listRecommendations().some((item) => item.campaignId === campaignId
    && ['pending', 'approved', 'executing', 'failed'].includes(item.status))
}

function dailyBudgetChangePercent(binding: GmvMaxAccountBinding, campaignId: string, now = Date.now()) {
  const localDate = zonedDateParts(binding.timezone, now).date
  return gmvMaxRepo.listAudits()
    .filter((item) => item.bindingId === binding.id
      && item.campaignId === campaignId
      && ['campaign_gmv_max_update', 'budget', 'roi'].includes(item.action)
      && item.status === 'succeeded'
      && zonedDateParts(binding.timezone, item.createdAt).date === localDate)
    .reduce((total, item) => {
      const before = gmvMaxDecimal.parse(item.requestSummary.currentBudget)
      const after = gmvMaxDecimal.parse(item.requestSummary.budget)
      if (before <= 0n) return total
      const basisPoints = ((after >= before ? after - before : before - after) * 1_000_000n) / before
      return total + Number(basisPoints) / 10_000
    }, 0)
}

function evaluationDue(binding: GmvMaxAccountBinding, now = Date.now()) {
  const local = zonedDateParts(binding.timezone, now)
  if (local.hour < 12 || (local.hour === 12 && local.minute < 30)) return false
  return !gmvMaxRepo.listOptimizationRuns().some((item) => item.bindingId === binding.id
    && item.localDate === local.date
    && item.status === 'succeeded')
}

function startSopInterventionObservation(recommendationId: string, startedAt: number) {
  const intervention = gmvMaxRepo.listSopInterventions().find((item) => item.recommendationId === recommendationId && item.status === 'draft')
  if (!intervention) return
  const instance = gmvMaxRepo.getSopInstance(intervention.sopInstanceId)
  if (!instance) return
  const binding = gmvMaxRepo.listBindings().find((item) => item.id === instance.bindingId)
  const startedDate = zonedDateParts(binding?.timezone, startedAt).date
  gmvMaxRepo.saveSopIntervention({ ...intervention, status: 'observing', startedDate, observedDeliveryDays: 0, updatedAt: startedAt })
  gmvMaxRepo.saveSopInstance({ ...instance, observationStartedDate: startedDate, observationLockUntil: 'three_complete_delivery_days', updatedAt: startedAt })
  if (intervention.taskId) {
    const task = gmvMaxRepo.getSopTask(intervention.taskId)
    if (task) gmvMaxRepo.saveSopTask({ ...task, status: 'completed', updatedAt: startedAt })
  }
}

function cancelSopInterventionForRecommendation(recommendationId: string, cancelledAt: number) {
  const intervention = gmvMaxRepo.listSopInterventions().find((item) => item.recommendationId === recommendationId && item.status === 'draft')
  if (!intervention) return
  gmvMaxRepo.saveSopIntervention({ ...intervention, status: 'cancelled', outcome: 'The linked approval action was rejected.', updatedAt: cancelledAt })
}

export function promoteGmvMaxRecommendationToLive(item: GmvMaxRecommendation, now = Date.now()): GmvMaxRecommendation {
  return {
    ...item,
    status: 'approved',
    shadow: false,
    originatedFromShadow: item.originatedFromShadow || Boolean(item.shadow),
    lastError: undefined,
    writeAttempted: false,
    platformStateVerified: true,
    retryAllowed: false,
    updatedAt: now,
  }
}

async function executeRecommendation(item: GmvMaxRecommendation) {
  if (gmvMaxService.schedulerState.emergencyStopped) throw new Error('GMV MAX write operations are paused by the emergency stop.')
  if (executingRecommendationIds.has(item.id)) return gmvMaxRepo.getRecommendation(item.id) || item
  const actionType = item.actionType || 'budget'
  const lockKey = `${item.campaignId}:${actionType}`
  const persistedLock = gmvMaxRepo.getActionLock(item.campaignId, actionType)
  if (actionLocks.has(lockKey) || (persistedLock && (actionType === 'creative' || actionType === 'session' || persistedLock.expiresAt > Date.now()) && persistedLock.idempotencyKey !== item.idempotencyKey)) {
    throw new Error(`Another ${actionType} action is still pending verification.`)
  }
  executingRecommendationIds.add(item.id)
  actionLocks.add(lockKey)
  const verificationDelayMinutes = actionType === 'creative' ? 20 : actionType === 'session' ? 10 : 5
  gmvMaxRepo.saveActionLock({ campaignId: item.campaignId, actionType, idempotencyKey: item.idempotencyKey, expiresAt: Date.now() + verificationDelayMinutes * 60_000, updatedAt: Date.now() })
  let writeAttempted = false
  let retainLockForVerification = false
  let rejectedWithoutMutation = false
  try {
    const current = gmvMaxRepo.getRecommendation(item.id)
    if (!current) throw new Error('GMV MAX recommendation does not exist.')
    if (current.status === 'executed') return current
    if (current.shadow) throw new Error('Shadow recommendations require explicit approval before TikTok execution.')
    if (current.status !== 'pending' && current.status !== 'approved') {
      throw new Error(`Recommendation cannot be executed from status ${current.status}.`)
    }
    const campaign = gmvMaxRepo.listCampaigns().find((entry) => entry.id === current.campaignId)
    const binding = gmvMaxRepo.listBindings().find((entry) => entry.id === current.bindingId)
    if (!campaign || !binding) throw new Error('GMV MAX campaign binding is unavailable.')
    const runtime = await gmvMaxMcpClient.connect(binding.connectionId, false)
    const capability = actionType === 'status' ? 'status_write' : actionType === 'creative' ? 'creative_write' : actionType === 'session' ? 'session_write' : 'campaign_write'
    if (!runtime.capabilities?.[capability]) throw new Error(`TikTok MCP capability is unavailable: ${capability}`)

    const executing = gmvMaxRepo.saveRecommendation({ ...current, status: 'executing', updatedAt: Date.now() })
    const audit: GmvMaxAuditRecord = {
      id: randomUUID(),
      connectionId: binding.connectionId,
      bindingId: binding.id,
      campaignId: campaign.id,
      recommendationId: current.id,
      action: actionType,
      status: 'started',
      requestSummary: {
        advertiserId: binding.advertiserId,
        campaignId: campaign.id,
        currentBudget: current.currentBudget,
        budget: current.proposedBudget,
        currentRoasBid: current.currentRoasBid,
        roasBid: current.proposedRoasBid,
        actionPayload: current.actionPayload,
      },
      beforeSnapshot: campaign.raw,
      createdAt: Date.now(),
    }
    gmvMaxRepo.saveAudit(audit)
    try {
      const before = await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_info_get', {
        advertiser_id: binding.advertiserId,
        campaign_id: campaign.id,
      })
      const beforeState = parseGmvMaxRemoteCampaignState(before.data)
      assertGmvMaxRemoteCampaignState({
        actionType,
        actual: beforeState,
        expectedBudget: current.currentBudget,
        expectedRoasBid: current.currentRoasBid,
        expectedOperationStatus: text(current.rollbackPayload?.operationStatus, campaign.operationStatus),
        phase: 'before',
      })
      let tool = 'campaign_gmv_max_update'
      let args: Record<string, unknown> = {
        advertiser_id: binding.advertiserId, campaign_id: campaign.id,
        budget: Number(current.proposedBudget), roas_bid: Number(current.proposedRoasBid),
      }
      if (actionType === 'status') {
        tool = 'campaign_status_update'
        args = { advertiser_id: binding.advertiserId, campaign_ids: [campaign.id], operation_status: current.actionPayload?.operationStatus }
      } else if (actionType === 'creative') {
        tool = 'gmv_max_creative_update'
        const targets = creativeTargetsForAction(campaign, current.actionPayload)
        if (targets.length === 1) args = buildGmvMaxCreativeUpdateArgs({ advertiserId: binding.advertiserId, campaign, target: targets[0] })
      } else if (actionType === 'session') {
        const sessionCall = buildGmvMaxSessionToolCall({ advertiserId: binding.advertiserId, storeId: binding.storeId, campaign, actionPayload: current.actionPayload || {} })
        tool = sessionCall.tool
        args = sessionCall.args
      }
      let update: Awaited<ReturnType<typeof gmvMaxMcpClient.call>>
      let rotationResponseSummary: Record<string, unknown> | undefined
      if (actionType === 'creative' && text(current.actionPayload?.operation).toUpperCase() === 'ROTATE') {
        writeAttempted = true
        const targets = creativeTargetsForAction(campaign, current.actionPayload)
        const targetByOperation = new Map(targets.map((target) => [target.operation, target]))
        const rotation = await executeGmvMaxCreativeRotation({
          addCreativeId: text(current.actionPayload?.addCreativeId),
          removeCreativeId: text(current.actionPayload?.removeCreativeId),
          updateCreative: async (operation, creativeId) => {
            const target = targetByOperation.get(operation)
            if (!target || target.creativeId !== creativeId) throw new Error(`Creative rotation target is unavailable for ${operation}.`)
            return await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_creative_update', buildGmvMaxCreativeUpdateArgs({ advertiserId: binding.advertiserId, campaign, target }))
          },
        })
        const addSummary = summarizeResponse(rotation.addUpdate.data)
        const removeSummary = summarizeResponse(rotation.removeUpdate.data)
        update = rotation.removeUpdate
        rotationResponseSummary = { operation: 'ROTATE', add: addSummary, remove: removeSummary, requestId: removeSummary.requestId || addSummary.requestId }
      } else {
        writeAttempted = true
        update = await gmvMaxMcpClient.call(binding.connectionId, tool, args)
      }
      const after = await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_info_get', {
        advertiser_id: binding.advertiserId,
        campaign_id: campaign.id,
      })
      const afterState = parseGmvMaxRemoteCampaignState(after.data)
      assertGmvMaxRemoteCampaignState({
        actionType,
        actual: afterState,
        expectedBudget: current.proposedBudget,
        expectedRoasBid: current.proposedRoasBid,
        expectedOperationStatus: text(current.actionPayload?.operationStatus),
        phase: 'after',
      })
      const completedAt = Date.now()
      if (actionType === 'budget' || actionType === 'roi' || actionType === 'status') {
        gmvMaxRepo.saveCampaign({
          ...campaign,
          budget: afterState.budget || campaign.budget,
          roasBid: afterState.roasBid || campaign.roasBid,
          operationStatus: afterState.operationStatus || campaign.operationStatus,
          raw: unwrap(after.data),
          lastSyncedAt: completedAt,
        })
      }
      let completedRollbackPayload = current.rollbackPayload
      let completedActionPayload = current.actionPayload
      if (actionType === 'session' && text(current.actionPayload?.operation, 'create').toLowerCase() === 'create') {
        const sessionId = text(findDeepField(update.data, new Set(['session_id'])))
        if (sessionId) {
          completedActionPayload = { ...current.actionPayload, sessionId }
          completedRollbackPayload = { operation: 'delete', sessionId }
        }
      }
      const responseSummary = rotationResponseSummary || summarizeResponse(update.data)
      const remoteRequestId = text(responseSummary.requestId) || undefined
      const requiresDeferredVerification = actionType === 'creative' || actionType === 'session'
      const completed = gmvMaxRepo.saveRecommendation({
        ...executing,
        actionPayload: completedActionPayload,
        rollbackPayload: completedRollbackPayload,
        status: 'executed',
        writeAttempted: true,
        platformStateVerified: !requiresDeferredVerification,
        retryAllowed: false,
        remoteRequestId,
        executedAt: completedAt,
        updatedAt: completedAt,
      })
      gmvMaxRepo.saveAudit({
        ...audit,
        status: requiresDeferredVerification ? 'started' : 'succeeded',
        beforeSnapshot: unwrap(before.data),
        afterSnapshot: unwrap(after.data),
        responseSummary,
        remoteRequestId,
        completedAt: requiresDeferredVerification ? undefined : completedAt,
      })
      if (!requiresDeferredVerification) startSopInterventionObservation(completed.id, completedAt)
      const experimentId = text(current.actionPayload?.experimentId)
      if (experimentId) {
        const experiment = gmvMaxRepo.getExperiment(experimentId)
        if (experiment) {
          const rolledBack = Number(current.proposedRoasBid) === Number(experiment.baselineTargetRoi)
          gmvMaxRepo.saveExperiment({
            ...experiment,
            recommendationId: rolledBack ? experiment.recommendationId : completed.id,
            rollbackRecommendationId: rolledBack ? completed.id : experiment.rollbackRecommendationId,
            state: rolledBack ? 'rolled_back' : 'observing',
            actionDate: zonedDateParts(binding.timezone, completedAt).date,
            updatedAt: completedAt,
            completedAt: rolledBack ? completedAt : undefined,
          })
        }
      }
      if (current.risk === 'high' || actionType === 'creative') {
        void sendGmvMaxNotification(actionType, `GMV MAX ${actionType} action succeeded for ${campaign.name}.`)
      }
      return completed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      rejectedWithoutMutation = actionType === 'session' && isGmvMaxSessionInputRejection(message)
      retainLockForVerification = writeAttempted && !rejectedWithoutMutation
      gmvMaxRepo.saveRecommendation({
        ...executing,
        status: 'failed',
        lastError: message,
        writeAttempted,
        platformStateVerified: !writeAttempted || rejectedWithoutMutation,
        retryAllowed: !writeAttempted || rejectedWithoutMutation,
        updatedAt: Date.now(),
      })
      gmvMaxRepo.saveAudit({ ...audit, status: 'failed', error: message, completedAt: Date.now() })
      throw error
    }
  } finally {
    executingRecommendationIds.delete(item.id)
    actionLocks.delete(lockKey)
    if (rejectedWithoutMutation || (actionType !== 'creative' && actionType !== 'session' && !retainLockForVerification)) gmvMaxRepo.removeActionLock(item.campaignId, actionType)
  }
}

async function executePortfolioPlan(input: GmvMaxPortfolioPlan) {
  if (gmvMaxService.schedulerState.emergencyStopped) throw new Error('GMV MAX write operations are paused by the emergency stop.')
  if (executingPortfolioIds.has(input.id)) return gmvMaxRepo.getPortfolioPlan(input.id) || input
  const current = gmvMaxRepo.getPortfolioPlan(input.id)
  if (!current) throw new Error('GMV MAX portfolio plan does not exist.')
  if (current.status === 'executed') return current
  if (!['proposed', 'approved'].includes(current.status)) throw new Error(`Portfolio plan cannot be executed from status ${current.status}.`)
  if (!current.donorCampaignId || !current.receiverCampaignId || !current.budgetConserved) throw new Error('Portfolio plan does not contain a valid conserved transfer pair.')
  const campaigns = new Map(gmvMaxRepo.listCampaigns().map((item) => [item.id, item]))
  const bindings = new Map(gmvMaxRepo.listBindings().map((item) => [item.id, item]))
  const donor = campaigns.get(current.donorCampaignId)
  const receiver = campaigns.get(current.receiverCampaignId)
  const donorBinding = donor && bindings.get(donor.bindingId)
  const receiverBinding = receiver && bindings.get(receiver.bindingId)
  if (!donor || !receiver || !donorBinding || !receiverBinding) throw new Error('Portfolio campaign bindings are unavailable.')
  assertGmvMaxPortfolioEvidenceFresh({ plan: current, donorBinding, receiverBinding, now: Date.now() })
  if (donor.storeId !== current.storeId || receiver.storeId !== current.storeId) throw new Error('Portfolio campaigns no longer belong to the planned store.')
  if (gmvMaxDecimal.parse(donor.budget) !== gmvMaxDecimal.parse(current.donorBudgetBefore)
    || gmvMaxDecimal.parse(receiver.budget) !== gmvMaxDecimal.parse(current.receiverBudgetBefore)) {
    throw new Error('Local campaign budgets changed after portfolio analysis.')
  }
  const donorPolicy = policyFor(donor.id)
  const receiverPolicy = policyFor(receiver.id)
  if (!donorPolicy.budgetPermission || !receiverPolicy.budgetPermission) throw new Error('Budget permission is required for both portfolio campaigns.')
  if (donor.promotionDaysEnabled || receiver.promotionDaysEnabled) throw new Error('Portfolio execution is disabled during promotion mode.')
  if (hasPendingChange(donor.id) || hasPendingChange(receiver.id)) throw new Error('A portfolio campaign has another pending action.')
  const now = Date.now()
  if ([donor, receiver].some((campaign) => {
    const policy = campaign.id === donor.id ? donorPolicy : receiverPolicy
    const lastExecuted = latestExecutedAt(campaign.id)
    return lastExecuted && now - lastExecuted < policy.cooldownHours * 60 * 60 * 1000
  })) throw new Error('A portfolio campaign is still in its action cooldown period.')
  const donorChange = Math.abs(Number(current.donorBudgetAfter) - Number(current.donorBudgetBefore)) / Math.max(Number(current.donorBudgetBefore), 1) * 100
  const receiverChange = Math.abs(Number(current.receiverBudgetAfter) - Number(current.receiverBudgetBefore)) / Math.max(Number(current.receiverBudgetBefore), 1) * 100
  if (dailyBudgetChangePercent(donorBinding, donor.id, now) + donorChange > donorPolicy.dailyBudgetChangeLimitPercent
    || dailyBudgetChangePercent(receiverBinding, receiver.id, now) + receiverChange > receiverPolicy.dailyBudgetChangeLimitPercent) {
    throw new Error('Portfolio transfer exceeds a campaign daily budget change limit.')
  }

  const lockEntries = [donor, receiver].map((campaign) => ({ campaign, key: `${campaign.id}:budget`, persisted: gmvMaxRepo.getActionLock(campaign.id, 'budget') }))
  if (lockEntries.some((item) => actionLocks.has(item.key) || (item.persisted && item.persisted.expiresAt > now && item.persisted.idempotencyKey !== current.id))) {
    throw new Error('Another budget action is still pending for a portfolio campaign.')
  }
  executingPortfolioIds.add(current.id)
  for (const item of lockEntries) {
    actionLocks.add(item.key)
    gmvMaxRepo.saveActionLock({ campaignId: item.campaign.id, actionType: 'budget', idempotencyKey: current.id, expiresAt: now + 10 * 60_000, updatedAt: now })
  }

  const donorAudit: GmvMaxAuditRecord = {
    id: randomUUID(), connectionId: donorBinding.connectionId, bindingId: donorBinding.id, campaignId: donor.id, recommendationId: current.id,
    action: 'portfolio_budget_donor', status: 'started', requestSummary: { portfolioPlanId: current.id, currentBudget: current.donorBudgetBefore, budget: current.donorBudgetAfter }, beforeSnapshot: donor.raw, createdAt: now,
  }
  const receiverAudit: GmvMaxAuditRecord = {
    id: randomUUID(), connectionId: receiverBinding.connectionId, bindingId: receiverBinding.id, campaignId: receiver.id, recommendationId: current.id,
    action: 'portfolio_budget_receiver', status: 'started', requestSummary: { portfolioPlanId: current.id, currentBudget: current.receiverBudgetBefore, budget: current.receiverBudgetAfter }, beforeSnapshot: receiver.raw, createdAt: now,
  }
  gmvMaxRepo.saveAudit(donorAudit)
  gmvMaxRepo.saveAudit(receiverAudit)
  const executing = gmvMaxRepo.savePortfolioPlan({ ...current, status: 'executing', updatedAt: now })
  const snapshots = new Map<string, Record<string, unknown>>()
  try {
    for (const binding of [donorBinding, receiverBinding]) {
      const runtime = await gmvMaxMcpClient.connect(binding.connectionId, false)
      if (!runtime.capabilities?.campaign_write) throw new Error('TikTok MCP campaign write capability is unavailable.')
    }
    const campaignFor = (campaignId: string) => campaignId === donor.id ? donor : receiver
    const bindingFor = (campaignId: string) => campaignId === donor.id ? donorBinding : receiverBinding
    const result = await executeGmvMaxPortfolioTransfer({
      donorCampaignId: donor.id,
      receiverCampaignId: receiver.id,
      donorBudgetBefore: current.donorBudgetBefore,
      donorBudgetAfter: current.donorBudgetAfter,
      receiverBudgetBefore: current.receiverBudgetBefore,
      receiverBudgetAfter: current.receiverBudgetAfter,
      verifyBudget: async (campaignId, expectedBudget) => {
        const campaign = campaignFor(campaignId)
        const binding = bindingFor(campaignId)
        const detail = await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_info_get', { advertiser_id: binding.advertiserId, campaign_id: campaign.id })
        snapshots.set(campaignId, unwrap(detail.data))
        const actualBudget = remoteCampaignBudget(detail.data)
        if (gmvMaxDecimal.parse(actualBudget) !== gmvMaxDecimal.parse(expectedBudget)) throw new Error(`Remote budget verification failed for campaign ${campaignId}.`)
      },
      updateBudget: async (campaignId, budget) => {
        const campaign = campaignFor(campaignId)
        const binding = bindingFor(campaignId)
        return await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_update', {
          advertiser_id: binding.advertiserId,
          campaign_id: campaign.id,
          budget: Number(budget),
          roas_bid: Number(campaign.roasBid),
        })
      },
    })
    const donorSummary = summarizeResponse(result.donorUpdate.data)
    const receiverSummary = summarizeResponse(result.receiverUpdate.data)
    const completedAt = Date.now()
    gmvMaxRepo.saveCampaign({ ...donor, budget: current.donorBudgetAfter, raw: snapshots.get(donor.id) || donor.raw, lastSyncedAt: completedAt })
    gmvMaxRepo.saveCampaign({ ...receiver, budget: current.receiverBudgetAfter, raw: snapshots.get(receiver.id) || receiver.raw, lastSyncedAt: completedAt })
    gmvMaxRepo.saveAudit({ ...donorAudit, status: 'succeeded', afterSnapshot: snapshots.get(donor.id), responseSummary: donorSummary, remoteRequestId: donorSummary.requestId, completedAt })
    gmvMaxRepo.saveAudit({ ...receiverAudit, status: 'succeeded', afterSnapshot: snapshots.get(receiver.id), responseSummary: receiverSummary, remoteRequestId: receiverSummary.requestId, completedAt })
    const completed = gmvMaxRepo.savePortfolioPlan({
      ...executing, status: 'executed', executedAt: completedAt, updatedAt: completedAt,
      remoteRequestIds: [donorSummary.requestId, receiverSummary.requestId].filter((item): item is string => Boolean(item)),
      rollbackApplied: false,
    })
    void sendGmvMaxNotification('portfolio_transfer', `GMV MAX portfolio transfer succeeded for store ${current.storeId}.`)
    return completed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const rollbackApplied = error instanceof GmvMaxPortfolioExecutionError && error.rollbackApplied
    const failedAt = Date.now()
    gmvMaxRepo.savePortfolioPlan({ ...executing, status: 'failed', lastError: message, rollbackApplied, updatedAt: failedAt })
    gmvMaxRepo.saveAudit({ ...donorAudit, status: 'failed', afterSnapshot: snapshots.get(donor.id), responseSummary: { rollbackApplied }, error: message, completedAt: failedAt })
    gmvMaxRepo.saveAudit({ ...receiverAudit, status: 'failed', afterSnapshot: snapshots.get(receiver.id), error: message, completedAt: failedAt })
    void sendGmvMaxNotification('portfolio_transfer_failed', `GMV MAX portfolio transfer failed for store ${current.storeId}: ${message}`)
    throw error
  } finally {
    executingPortfolioIds.delete(current.id)
    for (const item of lockEntries) {
      actionLocks.delete(item.key)
      gmvMaxRepo.removeActionLock(item.campaign.id, 'budget')
    }
  }
}

const persistedSchedulerState = initialSchedulerState()

function sopField(raw: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = text(raw?.[key])
    if (value) return value
  }
  return ''
}

function validateSopDate(value: unknown, field: string) {
  const date = text(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))) throw new Error(`${field} must use YYYY-MM-DD.`)
  return date
}

function supplementalMetricFromInput(input: Partial<GmvMaxSupplementalMetric> & { campaignId: string; statDate: string }, source: 'manual' | 'csv' | 'api', now = Date.now()) {
  const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === text(input.campaignId))
  if (!campaign) throw new Error('GMV MAX campaign does not exist.')
  const statDate = validateSopDate(input.statDate, 'statDate')
  const productId = text(input.productId) || undefined
  const numericFields = ['refundAmount', 'netGmv', 'liveUv', 'liveStayRate', 'productClicks', 'addToCart', 'orders', 'paidOrders', 'productBudget', 'targetRoi', 'intradaySpend'] as const
  const values: Partial<GmvMaxSupplementalMetric> = {}
  for (const field of numericFields) {
    const value = input[field]
    if (value === undefined || value === null || text(value) === '') continue
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${field} must be a non-negative number.`)
    values[field] = String(Number(value))
  }
  if (values.liveStayRate !== undefined && Number(values.liveStayRate) > 100) throw new Error('liveStayRate cannot exceed 100 percent.')
  const hasControlValue = values.productBudget !== undefined || values.targetRoi !== undefined || values.intradaySpend !== undefined || input.deliveryMode !== undefined || input.autoBudgetEnabled !== undefined || input.inventoryReady !== undefined || input.liveReady !== undefined
  if (values.netGmv === undefined && values.refundAmount === undefined && values.liveUv === undefined && !hasControlValue) throw new Error('At least one supplemental metric is required.')
  return {
    ...values,
    id: hash(campaign.id, productId || '', statDate, source),
    campaignId: campaign.id,
    storeId: campaign.storeId,
    productId,
    statDate,
    source,
    deliveryMode: text(input.deliveryMode) || undefined,
    autoBudgetEnabled: input.autoBudgetEnabled === undefined ? undefined : Boolean(input.autoBudgetEnabled),
    inventoryReady: input.inventoryReady === undefined ? undefined : Boolean(input.inventoryReady),
    liveReady: input.liveReady === undefined ? undefined : Boolean(input.liveReady),
    sourceUpdatedAt: Number(input.sourceUpdatedAt) > 0 ? Number(input.sourceUpdatedAt) : now,
    staleAt: Number(input.staleAt) > now ? Number(input.staleAt) : now + 48 * 60 * 60 * 1000,
    freshness: 'fresh',
    updatedAt: now,
  } as GmvMaxSupplementalMetric
}

async function createWinnerDraft(dna: GmvMaxWinnerDna) {
  const now = Date.now()
  const pending = gmvMaxRepo.saveWinnerDna({ ...dna, draftStatus: 'pending', draftError: undefined, draftAttempts: (dna.draftAttempts || 0) + 1, nextDraftRetryAt: undefined, updatedAt: now })
  try {
    const instance = gmvMaxRepo.getSopInstance(dna.sopInstanceId)
    const variationMix = instance?.track === 'mature_product'
      ? 'Variation mix: 25 percent protected historical Winners, 55 percent Winner variations, 20 percent new concepts.'
      : 'Variation mix: 70 percent winner variations, 20 percent new scenes, 10 percent new concepts.'
    const result = await cloneService.createDraftProject({
      locale: 'vi-VN',
      strength: 'structure',
      runMode: 'manual',
      title: `GMV MAX Winner ${dna.sourceName || dna.creativeId}`,
      description: [
        `Source creative: ${dna.creativeId}`,
        `Hook: ${dna.hook || 'Pending review'}`,
        `Opening: ${dna.opening || 'Pending review'}`,
        `Model: ${dna.model || 'Pending review'}`,
        `Scene: ${dna.scene || 'Pending review'}`,
        `Product: ${dna.product || 'Pending review'}`,
        `Pacing: ${dna.pacing || 'Pending review'}`,
        `Offer: ${dna.offer || 'Pending review'}`,
        `CTA: ${dna.cta || 'Pending review'}`,
        variationMix,
      ].join('\n'),
    })
    return gmvMaxRepo.saveWinnerDna({ ...pending, draftProjectId: result.project.id, draftStatus: 'created', nextDraftRetryAt: undefined, updatedAt: Date.now() })
  } catch (error) {
    const failedAt = Date.now()
    return gmvMaxRepo.saveWinnerDna({ ...pending, draftStatus: 'failed', draftError: error instanceof Error ? error.message : String(error), nextDraftRetryAt: failedAt + GMV_MAX_WINNER_DRAFT_RETRY_MS, updatedAt: failedAt })
  }
}

function ensureDeclinedSopRollback(intervention: GmvMaxSopIntervention, localDate: string, now: number) {
  const outcome = intervention.outcomeMetrics
  if (!outcome || !shouldCreateGmvMaxSopRollback(intervention, outcome)) return undefined
  const rollbackInterventionId = hash(intervention.id, 'declined_rollback')
  const rollbackTaskId = hash(rollbackInterventionId, 'review_task')
  const existingRollback = gmvMaxRepo.getSopIntervention(rollbackInterventionId)
  if (existingRollback) {
    if (!intervention.rollbackInterventionId) {
      gmvMaxRepo.saveSopIntervention({
        ...intervention,
        rollbackInterventionId,
        rollbackRecommendationId: existingRollback.recommendationId,
        rollbackTaskId: existingRollback.taskId,
        updatedAt: now,
      })
    }
    return existingRollback
  }

  let rollbackRecommendationId: string | undefined
  if (intervention.executionMode === 'approval') {
    const source = intervention.recommendationId ? gmvMaxRepo.getRecommendation(intervention.recommendationId) : null
    if (!source || source.status !== 'executed' || !source.reversible || !source.rollbackPayload) {
      gmvMaxRepo.saveSopTask({
        id: rollbackTaskId,
        sopInstanceId: intervention.sopInstanceId,
        campaignId: intervention.campaignId,
        localDate,
        scheduledTime: '09:00',
        kind: 'sop_automation',
        title: 'Resolve unavailable intervention rollback',
        description: 'The intervention declined, but its executed rollback payload is unavailable. Verify the platform state before making another change.',
        executionMode: 'review',
        status: 'blocked',
        evidence: `ROI changed ${outcome.roiChangePercent || 'without a comparable baseline'} percent during observation.`,
        createdAt: now,
        updatedAt: now,
      })
      gmvMaxRepo.saveSopIntervention({ ...intervention, rollbackTaskId, updatedAt: now })
      return undefined
    }
    rollbackRecommendationId = hash(source.idempotencyKey, 'sop_declined_rollback')
    if (!gmvMaxRepo.getRecommendation(rollbackRecommendationId)) {
      const reverse: GmvMaxRecommendation = {
        ...source,
        id: rollbackRecommendationId,
        idempotencyKey: rollbackRecommendationId,
        kind: source.kind === 'scale_up' ? 'scale_down' : source.kind === 'scale_down' ? 'scale_up' : source.kind,
        status: 'pending',
        actionPayload: source.rollbackPayload,
        rollbackPayload: source.actionPayload || (source.actionType === 'budget' || source.actionType === 'roi' ? {} : undefined),
        currentBudget: source.proposedBudget,
        proposedBudget: source.currentBudget,
        currentRoasBid: source.proposedRoasBid,
        proposedRoasBid: source.currentRoasBid,
        reason: `SOP rollback review after declined intervention ${intervention.id}.`,
        autoExecutable: false,
        shadow: false,
        createdAt: now,
        updatedAt: now,
        executedAt: undefined,
        lastError: undefined,
      }
      gmvMaxRepo.saveRecommendation(reverse)
    }
  }

  const executionMode = intervention.executionMode === 'approval' ? 'review' as const : 'manual_external' as const
  gmvMaxRepo.saveSopTask({
    id: rollbackTaskId,
    sopInstanceId: intervention.sopInstanceId,
    campaignId: intervention.campaignId,
    localDate,
    scheduledTime: '09:00',
    kind: intervention.executionMode === 'approval' ? 'sop_automation' : 'external_operation',
    title: 'Review declined intervention rollback',
    description: intervention.executionMode === 'approval'
      ? 'Approve the prepared rollback before any new single-variable intervention is allowed.'
      : `Restore ${intervention.variable} to its prior Seller Center configuration, then record the rollback operation.`,
    executionMode,
    status: 'pending',
    evidence: `Observation declined: ROI ${outcome.before.roi} to ${outcome.after.roi}, orders ${outcome.before.orders} to ${outcome.after.orders}.`,
    createdAt: now,
    updatedAt: now,
  })
  const rollback = gmvMaxRepo.saveSopIntervention({
    id: rollbackInterventionId,
    sopInstanceId: intervention.sopInstanceId,
    campaignId: intervention.campaignId,
    productId: intervention.productId,
    kind: intervention.kind,
    variable: `${intervention.variable}_rollback`,
    beforeValue: intervention.proposedValue,
    proposedValue: intervention.beforeValue,
    recommendationId: rollbackRecommendationId,
    taskId: rollbackTaskId,
    executionMode: intervention.executionMode,
    status: 'draft',
    requiredDeliveryDays: 3,
    observedDeliveryDays: 0,
    rollbackOfInterventionId: intervention.id,
    createdAt: now,
    updatedAt: now,
  })
  gmvMaxRepo.saveSopIntervention({
    ...intervention,
    rollbackInterventionId,
    rollbackRecommendationId,
    rollbackTaskId,
    updatedAt: now,
  })
  return rollback
}

function ensureAutomaticSopInstances() {
  const existing = gmvMaxRepo.listSopInstances()
  const existingCampaignIds = new Set(existing.map((item) => item.campaignId))
  const activeBindingIds = new Set(gmvMaxRepo.listBindings().filter((item) => item.active).map((item) => item.id))
  const creativeMetrics = gmvMaxRepo.listCreativeMetrics()
  const productCosts = gmvMaxRepo.listProductCosts()
  let created = 0
  for (const campaign of gmvMaxRepo.listCampaigns()) {
    if (existingCampaignIds.has(campaign.id) || !activeBindingIds.has(campaign.bindingId)) continue
    const binding = gmvMaxRepo.listBindings().find((item) => item.id === campaign.bindingId)
    if (!binding) continue
    const now = Date.now()
    if (campaign.campaignType === 'LIVE') {
      const automatic = buildGmvMaxAutomaticSopInstance({ campaign, localDate: zonedDateParts(binding.timezone).date, now })
      if (automatic) gmvMaxRepo.saveSopInstance(automatic)
      existingCampaignIds.add(campaign.id)
      created += 1
      continue
    }
    const candidate = selectGmvMaxAutomaticSopProductCandidate(creativeMetrics.filter((item) => item.campaignId === campaign.id))
    if (!candidate) continue
    const product = productCosts.find((item) => item.storeId === campaign.storeId && item.productId === candidate.productId && item.campaignId === campaign.id)
      || productCosts.find((item) => item.storeId === campaign.storeId && item.productId === candidate.productId && !item.campaignId)
    const automatic = buildGmvMaxAutomaticSopInstance({ campaign, localDate: zonedDateParts(binding.timezone).date, candidate, productName: product?.productName || candidate.productName, now })
    if (automatic) gmvMaxRepo.saveSopInstance(automatic)
    existingCampaignIds.add(campaign.id)
    created += 1
  }
  return created
}

async function recalculateSopInternal(_createDrafts: boolean) {
  ensureAutomaticSopInstances()
  const instances = gmvMaxRepo.listSopInstances()
  if (!instances.length) return
  const instanceCampaignIds = [...new Set(instances.map((item) => item.campaignId))]
  const campaigns = new Map(gmvMaxRepo.listCampaigns().map((item) => [item.id, item]))
  const bindings = new Map(gmvMaxRepo.listBindings().map((item) => [item.id, item]))
  const supplemental = gmvMaxRepo.listSupplementalMetrics()
  const creativeMetrics = gmvMaxRepo.listCreativeMetrics()
  const insights = latestCreativeInsights(instances.map((item) => item.campaignId))
  const creativeMetricsByCampaign = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of creativeMetrics) creativeMetricsByCampaign.set(metric.campaignId, [...(creativeMetricsByCampaign.get(metric.campaignId) || []), metric])
  const insightsByCampaign = new Map<string, typeof insights>()
  for (const insight of insights) insightsByCampaign.set(insight.campaignId, [...(insightsByCampaign.get(insight.campaignId) || []), insight])
  const existingTasks = new Map(gmvMaxRepo.listSopTasks().map((item) => [item.id, item]))
  const existingDna = new Map(gmvMaxRepo.listWinnerDna().map((item) => [item.id, item]))
  const activeBindings = gmvMaxRepo.listBindings().filter((item) => item.active)
  const range = completedReportRangeForBindings(activeBindings, 40)
  const profitData = profitDataSnapshot(range, instanceCampaignIds, { creativeMetrics, dailyMetrics: gmvMaxRepo.listMetrics() })

  for (const instance of instances) {
    const campaign = campaigns.get(instance.campaignId)
    const binding = bindings.get(instance.bindingId)
    if (!campaign || !binding) {
      gmvMaxRepo.saveSopInstance({ ...instance, status: 'blocked', blockers: ['campaign_binding_missing'], updatedAt: Date.now() })
      continue
    }
    const policy = policyFor(campaign.id)
    const campaignInsights = (insightsByCampaign.get(campaign.id) || []).filter((item) => !instance.productId || item.itemGroupId === instance.productId)
    const campaignCreativeMetrics = (creativeMetricsByCampaign.get(campaign.id) || []).filter((item) => !instance.productId || item.itemGroupId === instance.productId)
    const dailyMetrics = instance.productId
      ? buildGmvMaxProductDailyMetrics({ campaignId: campaign.id, storeId: campaign.storeId, metrics: campaignCreativeMetrics })
      : gmvMaxRepo.listMetrics(campaign.id)
    const guard = profitGuardForSopProduct(campaign, instance.productId, policy, profitData, dailyMetrics)
    const summary = buildGmvMaxSopMetricSummary({
      dailyMetrics,
      creativeMetrics: campaignCreativeMetrics,
      creativeInsights: campaignInsights,
      supplementalMetrics: supplemental.filter((item) => item.campaignId === campaign.id && (!instance.productId || !item.productId || item.productId === instance.productId)),
      contributionMarginRate: guard.contributionMarginRate,
    })
    const localDate = zonedDateParts(binding.timezone).date
    const detection = detectGmvMaxSopTrack({ campaignType: instance.campaignType, localDate, startDate: instance.startDate, dailyMetrics, cumulativeOrders: Number(summary.orders) })
    const effectiveTrack = instance.trackSource === 'manual' && instance.track ? instance.track : detection.track
    const assessment = effectiveTrack === 'mature_product' ? buildGmvMaxMatureAssessment({
      instance, localDate, campaignStatus: campaign.operationStatus, dailyMetrics,
      supplementalMetrics: supplemental.filter((item) => item.campaignId === campaign.id && (!instance.productId || item.productId === instance.productId)),
      metrics: summary, profitFloor: Number(guard.effectiveRoiFloor), targetRoi: Number(campaign.roasBid) || Number(policy.minRoi),
    }) : undefined
    if (assessment) gmvMaxRepo.saveMatureAssessment(assessment)
    for (const task of supersedeExpiredGmvMaxSopTasks([...existingTasks.values()].filter((item) => item.sopInstanceId === instance.id), localDate, Date.now())) {
      gmvMaxRepo.saveSopTask(task)
      existingTasks.set(task.id, task)
    }
    let observationCompleted = false
    for (const intervention of gmvMaxRepo.listSopInterventions().filter((item) => item.sopInstanceId === instance.id && item.status === 'observing')) {
      const observedDeliveryDays = countGmvMaxObservedDeliveryDays(dailyMetrics, intervention.startedDate)
      const completed = observedDeliveryDays >= intervention.requiredDeliveryDays
      const advanced = advanceGmvMaxSopInterventionObservation(intervention, observedDeliveryDays, Date.now())
      const outcomeMetrics = completed ? buildGmvMaxSopInterventionOutcome(dailyMetrics, intervention.startedDate, intervention.requiredDeliveryDays) : undefined
      const savedIntervention = gmvMaxRepo.saveSopIntervention(outcomeMetrics ? {
        ...advanced,
        outcomeMetrics,
        outcome: `Observation ${outcomeMetrics.verdict}: ROI ${outcomeMetrics.before.roi} to ${outcomeMetrics.after.roi}, spend ${outcomeMetrics.before.spend} to ${outcomeMetrics.after.spend}, orders ${outcomeMetrics.before.orders} to ${outcomeMetrics.after.orders}.`,
      } : advanced)
      if (outcomeMetrics?.verdict === 'declined') ensureDeclinedSopRollback(savedIntervention, localDate, Date.now())
      observationCompleted ||= completed
    }
    const creativeMetricsByCreativeId = new Map<string, GmvMaxCreativeMetric[]>()
    for (const metric of campaignCreativeMetrics) {
      creativeMetricsByCreativeId.set(metric.creativeId, [...(creativeMetricsByCreativeId.get(metric.creativeId) || []), metric])
    }
    const creativeGradeSummary = { S: 0, A: 0, B: 0, C: 0 }
    for (const insight of campaignInsights) {
      const creativeRows = creativeMetricsByCreativeId.get(insight.creativeId) || []
      const latestMetric = [...creativeRows].sort((a, b) => b.statDate.localeCompare(a.statDate) || b.syncedAt - a.syncedAt)[0]
      const spend = creativeRows.reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
      const revenue = creativeRows.reduce((sum, item) => sum + (Number(item.grossRevenue) || 0), 0)
      const aggregateMetric = latestMetric ? {
        ...latestMetric,
        cost: String(spend),
        grossRevenue: String(revenue),
        orders: String(creativeRows.reduce((sum, item) => sum + (Number(item.orders) || 0), 0)),
        roi: spend > 0 ? String(revenue / spend) : '0',
        productImpressions: String(creativeRows.reduce((sum, item) => sum + (Number(item.productImpressions) || 0), 0)),
        productClicks: String(creativeRows.reduce((sum, item) => sum + (Number(item.productClicks) || 0), 0)),
      } : undefined
      const grade = classifyGmvMaxCreativeGrade({ insight, metric: aggregateMetric, targetRoi: Math.max(Number(policy.minRoi), Number(guard.effectiveRoiFloor)) })
      creativeGradeSummary[grade] += 1
    }
    const evaluated = evaluateGmvMaxSopInstance({ instance: observationCompleted ? { ...instance, observationStartedDate: undefined, observationLockUntil: undefined } : instance, localDate, policy, profitGuard: guard, metrics: summary, creativeCount: campaignInsights.length, trackDetection: detection, matureAssessment: assessment })
    const evaluatedWithSnapshot: GmvMaxSopInstance = {
      ...evaluated,
      viewSnapshot: {
        metrics: summary,
        profitFloor: guard.effectiveRoiFloor,
        targetRoi: campaign.roasBid || policy.minRoi,
        creativeGradeSummary,
        updatedAt: Date.now(),
      },
    }
    gmvMaxRepo.saveSopInstance(evaluatedWithSnapshot)
    const creativeSpendById = new Map<string, number>()
    for (const metric of campaignCreativeMetrics) creativeSpendById.set(metric.creativeId, (creativeSpendById.get(metric.creativeId) || 0) + (Number(metric.cost) || 0))
    const campaignProductIds = new Set(campaignCreativeMetrics.map((item) => item.itemGroupId).filter(Boolean))
    const activeExperiments = gmvMaxRepo.listExperiments().some((item) => item.campaignId === campaign.id && ['pending_approval', 'executing', 'observing', 'rollback_pending'].includes(item.state))
    const primaryCtrTrend = campaignInsights.length ? Number(campaignInsights.reduce((sum, item) => sum + (Number(item.ctrTrendPercent) || 0), 0) / campaignInsights.length) : undefined
    const primaryCvrTrend = campaignInsights.length ? Number(campaignInsights.reduce((sum, item) => sum + (Number(item.roiTrendPercent) || 0), 0) / campaignInsights.length) : undefined
    const decision = evaluateGmvMaxDecision({
      instance: {
        ...evaluatedWithSnapshot,
        metrics: summary,
        campaignName: campaign.name,
        campaignOperationStatus: campaign.operationStatus,
        storeName: binding.storeName,
        profitFloor: guard.effectiveRoiFloor,
        targetRoi: campaign.roasBid || policy.minRoi,
        creativeGradeSummary,
        protectedWinnerCount: creativeGradeSummary.S,
        observationDaysRemaining: 0,
        issueResolutions: [],
      },
      profitGuard: guard,
      creativeSpend: [...creativeSpendById.values()],
      ctrTrendPercent: primaryCtrTrend,
      cvrTrendPercent: primaryCvrTrend,
      campaignProductCount: Math.max(1, campaignProductIds.size),
      activeExperiment: activeExperiments,
      ruleOverride: policy.decisionRules,
    })
    gmvMaxRepo.saveDecisionSnapshot(decision)
    for (const experiment of gmvMaxRepo.listExperiments().filter((item) => item.campaignId === campaign.id && ['executing', 'observing', 'neutral'].includes(item.state))) {
      const evaluatedExperiment = evaluateGmvMaxRoiUnlockExperiment({
        experiment,
        metrics: dailyMetrics,
        actionDate: experiment.actionDate || localDate,
        profitFloor: Number(guard.effectiveRoiFloor),
        ruleOverride: policy.decisionRules,
      })
      if (evaluatedExperiment.state !== experiment.state || evaluatedExperiment.updatedAt !== experiment.updatedAt) {
        gmvMaxRepo.saveExperiment(evaluatedExperiment)
        if (evaluatedExperiment.state === 'rollback_pending') {
          const sourceRecommendation = evaluatedExperiment.recommendationId ? gmvMaxRepo.getRecommendation(evaluatedExperiment.recommendationId) : null
          const rollbackRecommendationId = hash(evaluatedExperiment.id, 'rollback_recommendation')
          if (sourceRecommendation && !gmvMaxRepo.getRecommendation(rollbackRecommendationId)) {
            gmvMaxRepo.saveRecommendation({
              ...sourceRecommendation,
              id: rollbackRecommendationId,
              idempotencyKey: rollbackRecommendationId,
              status: 'pending',
              risk: 'high',
              currentBudget: sourceRecommendation.proposedBudget,
              proposedBudget: sourceRecommendation.currentBudget,
              currentRoasBid: sourceRecommendation.proposedRoasBid,
              proposedRoasBid: evaluatedExperiment.baselineTargetRoi,
              reason: `ROI unlock experiment ${evaluatedExperiment.id} failed. Restore the protected baseline Target ROI.`,
              actionPayload: { ...(sourceRecommendation.rollbackPayload || {}), experimentId: evaluatedExperiment.id },
              rollbackPayload: sourceRecommendation.actionPayload,
              shadow: true,
              autoExecutable: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              executedAt: undefined,
              lastError: undefined,
              writeAttempted: false,
              platformStateVerified: false,
              retryAllowed: false,
            })
            gmvMaxRepo.saveExperiment({ ...evaluatedExperiment, rollbackRecommendationId, updatedAt: Date.now() })
          }
          const rollbackTaskId = hash(evaluatedExperiment.id, 'rollback')
          if (!existingTasks.has(rollbackTaskId)) {
            const rollbackTask = {
              id: rollbackTaskId,
              sopInstanceId: instance.id,
              campaignId: campaign.id,
              localDate,
              scheduledTime: '09:00',
              kind: 'ad_adjustment' as const,
              title: 'Approve ROI experiment rollback',
              description: `ROI unlock failed. Restore Target ROI to ${evaluatedExperiment.baselineTargetRoi} after reviewing marginal ROI ${evaluatedExperiment.marginalRoi || 'unavailable'}.`,
              executionMode: 'review' as const,
              status: 'pending' as const,
              priority: 'P0' as const,
              experimentId: evaluatedExperiment.id,
              recommendedAction: 'rollback_roi' as const,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            gmvMaxRepo.saveSopTask(rollbackTask)
            existingTasks.set(rollbackTaskId, rollbackTask)
          }
        }
      }
    }
    if (decision.recommendedAction === 'roi_unlock' && decision.writeAllowed && !activeExperiments) {
      const proposedExperiment = buildGmvMaxRoiUnlockExperiment({
        sopInstanceId: instance.id,
        campaignId: campaign.id,
        productId: instance.productId,
        currentTargetRoi: Number(campaign.roasBid || policy.minRoi),
        profitFloor: Number(guard.effectiveRoiFloor),
        actionDate: localDate,
        ruleOverride: policy.decisionRules,
      })
      if (proposedExperiment) {
        const existing = gmvMaxRepo.listExperiments().find((item) => item.id === proposedExperiment.id)
        if (!existing) {
          const recommendationId = hash(proposedExperiment.id, 'roi_unlock')
          const recommendation: GmvMaxRecommendation = {
            id: recommendationId,
            campaignId: campaign.id,
            bindingId: binding.id,
            kind: 'scale_up',
            actionType: 'roi',
            status: 'pending',
            risk: 'medium',
            preset: policy.preset,
            currentBudget: campaign.budget,
            proposedBudget: campaign.budget,
            currentRoasBid: proposedExperiment.currentTargetRoi,
            proposedRoasBid: proposedExperiment.proposedTargetRoi,
            reason: 'High ROI, low budget utilization, and flat GMV qualify for a controlled ROI unlock experiment.',
            profitGuard: guard,
            actionPayload: { budget: campaign.budget, roasBid: proposedExperiment.proposedTargetRoi, experimentId: proposedExperiment.id },
            reversible: true,
            rollbackPayload: { budget: campaign.budget, roasBid: proposedExperiment.baselineTargetRoi, experimentId: proposedExperiment.id },
            shadow: true,
            autoExecutable: false,
            evidence: {
              startDate: assessment?.recent7d.startDate || localDate,
              endDate: assessment?.recent7d.endDate || localDate,
              metricIds: dailyMetrics.slice(-7).map((item) => item.id),
              consecutiveDays: assessment?.recent7d.deliveryDays || 0,
              totalOrders: assessment?.recent7d.orders || summary.orders,
              averageRoi: decision.actualRoi,
              averageBudgetUtilization: decision.budgetUtilization || '0',
              targetRoi: decision.targetRoi,
              recommendedRoasBid: proposedExperiment.proposedTargetRoi,
              dataFreshness: 'complete',
            },
            idempotencyKey: recommendationId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          gmvMaxRepo.saveRecommendation(recommendation)
          gmvMaxRepo.saveExperiment({ ...proposedExperiment, recommendationId, updatedAt: Date.now() })
          const experimentTaskId = hash(proposedExperiment.id, 'approval_task')
          const experimentTask = {
            id: experimentTaskId,
            sopInstanceId: instance.id,
            campaignId: campaign.id,
            localDate,
            scheduledTime: '09:00',
            kind: 'ad_adjustment' as const,
            title: 'Approve ROI unlock experiment',
            description: `Target ROI ${proposedExperiment.currentTargetRoi} to ${proposedExperiment.proposedTargetRoi}. The system will observe ${proposedExperiment.observationDeliveryDays} complete delivery days and create a rollback task if marginal ROI is unprofitable.`,
            executionMode: 'review' as const,
            status: 'pending' as const,
            priority: 'P0' as const,
            decisionSnapshotId: decision.id,
            experimentId: proposedExperiment.id,
            recommendedAction: 'roi_unlock' as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          gmvMaxRepo.saveSopTask(experimentTask)
          existingTasks.set(experimentTaskId, experimentTask)
        }
      }
    }
    const decisionTaskPlans = {
      profit_protection: { kind: 'ad_adjustment' as const, title: 'Protect product profit', description: 'Review costs, the break-even ROI, and current delivery. Approve only one profit-protection change after confirming the evidence.' },
      stop_scaling: { kind: 'ad_adjustment' as const, title: 'Stop scaling and review efficiency', description: 'Pause further scaling, verify the ROI decline, and select one controlled recovery variable for review.' },
      creative_expansion: { kind: 'creative_review' as const, title: 'Prepare a creative expansion brief', description: 'Review creative concentration and fatigue evidence, then define new creative angles. This task does not start automatic creative cloning.' },
      conversion_repair: { kind: 'data_review' as const, title: 'Diagnose the conversion bottleneck', description: 'Review click-through and conversion evidence, then choose one product-page, offer, or checkout variable for repair.' },
      product_expansion: { kind: 'data_review' as const, title: 'Diagnose product expansion options', description: 'Review traffic-ceiling evidence and shortlist adjacent products. No campaign write is allowed from this task.' },
      auto_budget: { kind: 'ad_adjustment' as const, title: 'Review Auto Budget readiness', description: 'Confirm profit, marginal ROI, inventory, and delivery stability before approving an Auto Budget change.' },
    } satisfies Partial<Record<GmvMaxDecisionAction, { kind: GmvMaxSopTask['kind']; title: string; description: string }>>
    const decisionTaskPlan = decisionTaskPlans[decision.recommendedAction as keyof typeof decisionTaskPlans]
    if (decisionTaskPlan) {
      const decisionActions = new Set(Object.keys(decisionTaskPlans))
      for (const task of [...existingTasks.values()].filter((item) => item.sopInstanceId === instance.id && item.localDate === localDate && item.status === 'pending' && item.recommendedAction && decisionActions.has(item.recommendedAction) && item.recommendedAction !== decision.recommendedAction)) {
        const superseded = { ...task, status: 'superseded' as const, evidence: 'Superseded by a newer decision for the same operating day.', completedAt: Date.now(), updatedAt: Date.now() }
        gmvMaxRepo.saveSopTask(superseded)
        existingTasks.set(task.id, superseded)
      }
      const decisionTaskId = hash(instance.id, localDate, 'decision_task', decision.recommendedAction)
      if (!existingTasks.has(decisionTaskId)) {
        const decisionTask: GmvMaxSopTask = {
          id: decisionTaskId,
          sopInstanceId: instance.id,
          campaignId: campaign.id,
          localDate,
          scheduledTime: '09:00',
          kind: decisionTaskPlan.kind,
          title: decisionTaskPlan.title,
          description: decisionTaskPlan.description,
          executionMode: 'review',
          status: 'pending',
          priority: decision.priority,
          decisionSnapshotId: decision.id,
          recommendedAction: decision.recommendedAction,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        gmvMaxRepo.saveSopTask(decisionTask)
        existingTasks.set(decisionTaskId, decisionTask)
      }
    }
    for (const task of [...existingTasks.values()].filter((item) => item.sopInstanceId === instance.id && !isGmvMaxSopTaskApplicable(item, evaluatedWithSnapshot))) {
      const superseded = { ...task, status: 'superseded' as const, evidence: 'Superseded because the task no longer applies to the detected SOP track or phase.', completedAt: Date.now(), updatedAt: Date.now() }
      gmvMaxRepo.saveSopTask(superseded)
      existingTasks.set(task.id, superseded)
    }
    for (const task of buildGmvMaxDailySopTasks(evaluatedWithSnapshot, localDate)) {
      if (!existingTasks.has(task.id)) {
        gmvMaxRepo.saveSopTask(task)
        existingTasks.set(task.id, task)
      }
    }

    for (const insight of campaignInsights.filter((item) => item.state === 'winner')) {
      const dnaId = hash(instance.id, insight.creativeId)
      const currentDna = existingDna.get(dnaId)
      if (currentDna) continue
      const asset = gmvMaxRepo.listCreativeAssetsForScope({ storeIds: [campaign.storeId], campaignIds: [campaign.id], creativeIds: [insight.creativeId] })[0]
      const raw = asset?.raw || {}
      const metric = campaignCreativeMetrics.find((item) => item.creativeId === insight.creativeId)
      const dna: GmvMaxWinnerDna = {
        id: dnaId,
        sopInstanceId: instance.id,
        campaignId: campaign.id,
        creativeId: insight.creativeId,
        grade: classifyGmvMaxCreativeGrade({ insight, metric, targetRoi: Math.max(Number(policy.minRoi), Number(guard.effectiveRoiFloor)) }),
        hook: sopField(raw, ['hook', 'hook_text', 'opening_hook']),
        opening: sopField(raw, ['opening', 'opening_text', 'first_scene']),
        model: sopField(raw, ['model', 'model_name', 'creator_name']),
        scene: sopField(raw, ['scene', 'scene_name', 'background']),
        product: instance.productName || sopField(raw, ['product_name', 'item_name']),
        pacing: sopField(raw, ['pacing', 'edit_pacing', 'rhythm']),
        offer: sopField(raw, ['offer', 'offer_text', 'promotion']),
        cta: sopField(raw, ['cta', 'call_to_action', 'cta_text']),
        sourceName: insight.creativeName || asset?.name,
        draftStatus: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      gmvMaxRepo.saveWinnerDna(dna)
      existingDna.set(dnaId, dna)
    }
    const liveEvidenceDate = supplemental
      .filter((item) => item.campaignId === instance.campaignId && (!instance.productId || item.productId === instance.productId) && [item.liveUv, item.liveStayRate, item.productClicks, item.addToCart, item.paidOrders].some((value) => value !== undefined))
      .map((item) => item.statDate)
      .sort()
      .at(-1)
    const latestReportDate = dailyMetrics.map((item) => item.statDate).sort().at(-1)
    for (const task of completeEvidenceBackedGmvMaxSopTasks({
      tasks: [...existingTasks.values()].filter((item) => item.sopInstanceId === instance.id),
      localDate,
      latestReportDate,
      creativeInsightCount: campaignInsights.length,
      createdWinnerDraftCount: 0,
      liveEvidenceDate: evaluated.track === 'live' ? liveEvidenceDate : undefined,
      updatedAt: Date.now(),
    })) {
      gmvMaxRepo.saveSopTask(task)
      existingTasks.set(task.id, task)
    }
  }
}

async function recalculateSop(_createDrafts: boolean) {
  if (sopRecalculationPromise) sopRecalculationRequested = true
  if (!sopRecalculationPromise) {
    sopRecalculationPromise = (async () => {
      try {
        do {
          sopRecalculationRequested = false
          await recalculateSopInternal(false)
        } while (sopRecalculationRequested)
      } finally {
        sopRecalculationPromise = undefined
      }
    })()
  }
  await sopRecalculationPromise
}

function nestedSopCreativeValue(raw: Record<string, unknown>, keys: string[]) {
  const scopes = [raw, raw.video_info, raw.identity_info]
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }
  }
  return ''
}

function sopCreativeUrl(raw: Record<string, unknown>, keys: string[]) {
  const value = nestedSopCreativeValue(raw, keys)
  return /^https?:\/\//i.test(value) ? value : undefined
}

function buildSopCreativeVideos(
  instances: Array<GmvMaxSopInstance & { targetRoi: string; profitFloor: string }>,
): GmvMaxSopCreativeVideo[] {
  const metrics = gmvMaxRepo.listCreativeMetrics()
  const insights = latestCreativeInsights([...new Set(instances.map((item) => item.campaignId))])
  const assets = gmvMaxRepo.listCreativeAssets()
  const now = Date.now()
  const scopeKey = (campaignId: string, creativeId: string, productId?: string) => `${campaignId}:${creativeId}:${productId || 'unscoped'}`
  const metricsByScope = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of metrics) {
    const key = scopeKey(metric.campaignId, metric.creativeId, metric.itemGroupId)
    metricsByScope.set(key, [...(metricsByScope.get(key) || []), metric])
  }
  const insightsByCampaign = new Map<string, typeof insights>()
  for (const insight of insights) insightsByCampaign.set(insight.campaignId, [...(insightsByCampaign.get(insight.campaignId) || []), insight])
  const campaignAssets = new Map<string, (typeof assets)[number]>()
  const storeAssets = new Map<string, (typeof assets)[number]>()
  for (const asset of assets) {
    if (asset.campaignId) campaignAssets.set(`${asset.storeId}:${asset.campaignId}:${asset.creativeId}`, asset)
    else storeAssets.set(`${asset.storeId}:${asset.creativeId}`, asset)
  }
  const average = (items: GmvMaxCreativeMetric[], field: keyof GmvMaxCreativeMetric) => {
    const values = items.map((item) => Number(item[field])).filter(Number.isFinite)
    return values.length ? String(values.reduce((sum, value) => sum + value, 0) / values.length) : undefined
  }

  return instances.flatMap((instance) => (insightsByCampaign.get(instance.campaignId) || [])
    .filter((insight) => insight.source !== 'product_card'
      && !insight.creativeId.startsWith('product-card:')
      && insight.campaignId === instance.campaignId
      && (!instance.productId || insight.itemGroupId === instance.productId))
    .map((insight) => {
      const scopedMetrics = metricsByScope.get(scopeKey(instance.campaignId, insight.creativeId, insight.itemGroupId)) || []
      const latestMetric = [...scopedMetrics].sort((a, b) => b.statDate.localeCompare(a.statDate) || b.syncedAt - a.syncedAt)[0]
      const asset = campaignAssets.get(`${instance.storeId}:${instance.campaignId}:${insight.creativeId}`)
        || storeAssets.get(`${instance.storeId}:${insight.creativeId}`)
      const raw = { ...(asset?.raw || {}), ...(latestMetric?.raw || {}) }
      const spend = scopedMetrics.reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
      const gmv = scopedMetrics.reduce((sum, item) => sum + (Number(item.grossRevenue) || 0), 0)
      const orders = scopedMetrics.reduce((sum, item) => sum + (Number(item.orders) || 0), 0)
      const roi = spend > 0 ? gmv / spend : undefined
      const ctr = average(scopedMetrics, 'ctr')
      const cvr = average(scopedMetrics, 'conversionRate')
      const play2sRate = average(scopedMetrics, 'play2sRate')
      const playDepth = average(scopedMetrics, 'playDepth')
      const dates = [...new Set(scopedMetrics.map((item) => item.statDate.slice(0, 10)).filter(Boolean))].sort()
      const reportEnd = dates.at(-1)
      const freshnessAge = reportEnd ? Math.floor((now - Date.parse(`${reportEnd}T23:59:59.999Z`)) / 86_400_000) : Number.POSITIVE_INFINITY
      const freshness = !reportEnd ? 'missing' as const : freshnessAge > 2 ? 'stale' as const : 'fresh' as const
      const targetRoi = Math.max(Number(instance.targetRoi) || 0, Number(instance.profitFloor) || 0)
      const aggregateMetric = latestMetric ? {
        ...latestMetric,
        cost: String(spend),
        grossRevenue: String(gmv),
        orders: String(orders),
        roi: roi === undefined ? '0' : String(roi),
        productImpressions: String(scopedMetrics.reduce((sum, item) => sum + (Number(item.productImpressions) || 0), 0)),
        productClicks: String(scopedMetrics.reduce((sum, item) => sum + (Number(item.productClicks) || 0), 0)),
      } : undefined
      const grade = classifyGmvMaxCreativeGrade({ insight, metric: aggregateMetric, targetRoi })
      const deliveryStatus = latestMetric?.status || asset?.status || nestedSopCreativeValue(raw, ['creative_delivery_status', 'operation_status', 'status']) || undefined
      const videoId = nestedSopCreativeValue(raw, ['item_id', 'video_id']) || insight.creativeId
      const externalUrl = /^\d{10,24}$/.test(videoId) ? `https://www.tiktok.com/@_/video/${encodeURIComponent(videoId)}` : undefined
      const videoUrl = sopCreativeUrl(raw, ['preview_url', 'video_url', 'play_url', 'download_url'])
      const coverUrl = sopCreativeUrl(raw, ['video_cover_url', 'cover_url', 'thumbnail_url', 'poster_url', 'image_url'])
      const duration = Number(nestedSopCreativeValue(raw, ['duration']))
      const analysisCodes: string[] = []
      if (!scopedMetrics.length) analysisCodes.push('data_missing')
      if (!coverUrl && !videoUrl && !asset) analysisCodes.push('media_unavailable')
      if (freshness === 'stale') analysisCodes.push('data_stale')
      if (grade === 'S' && roi !== undefined && roi >= targetRoi) analysisCodes.push('profitable_winner')
      if (ctr !== undefined && Number(ctr) >= 0.01 && cvr !== undefined && Number(cvr) < 0.02) analysisCodes.push('conversion_gap')
      if (ctr !== undefined && Number(ctr) < 0.005) analysisCodes.push('opening_weak')
      if (playDepth !== undefined && Number(playDepth) < 0.1) analysisCodes.push('retention_weak')
      if (Number(insight.roiTrendPercent) <= -15) analysisCodes.push('fatigue_risk')
      if (String(deliveryStatus || '').toUpperCase().includes('NOT_DELIVERING')) analysisCodes.push('delivery_inactive')
      if (!analysisCodes.length) analysisCodes.push('stable_observation')
      const sourceText = nestedSopCreativeValue(raw, ['text', 'title'])
      const preferredName = [insight.creativeName, latestMetric?.creativeName, asset?.name, sourceText]
        .map((value) => text(value))
        .find((value) => value && value !== insight.creativeId && !/^\d+$/.test(value))

      return {
        id: hash(instance.id, insight.creativeId, insight.itemGroupId || 'unscoped'),
        sopInstanceId: instance.id,
        campaignId: instance.campaignId,
        creativeId: insight.creativeId,
        productId: insight.itemGroupId,
        name: preferredName || sourceText || insight.creativeId,
        grade,
        source: insight.source || latestMetric?.source || 'owned',
        authorizationType: nestedSopCreativeValue(raw, ['tt_account_authorization_type', 'authorization_type', 'identity_type']) || undefined,
        authorizationStatus: nestedSopCreativeValue(raw, ['authorization_status']) || (nestedSopCreativeValue(raw, ['identity_authorized_bc_id']) ? 'AUTHORIZED' : undefined),
        deliveryStatus,
        coverUrl,
        videoUrl,
        embedUrl: !videoUrl && /^\d{10,24}$/.test(videoId) ? `https://www.tiktok.com/player/v1/${encodeURIComponent(videoId)}?controls=1` : undefined,
        externalUrl,
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
        reportingStartDate: dates[0],
        reportingEndDate: reportEnd,
        freshness,
        syncedAt: Math.max(asset?.syncedAt || 0, ...scopedMetrics.map((item) => item.syncedAt || 0)) || undefined,
        performance: {
          available: scopedMetrics.length > 0,
          samples: scopedMetrics.length,
          days: dates.length,
          spend: scopedMetrics.length ? String(spend) : undefined,
          gmv: scopedMetrics.length ? String(gmv) : undefined,
          roi: roi === undefined ? undefined : String(roi),
          orders: scopedMetrics.length ? String(orders) : undefined,
          ctr,
          cvr,
          cpa: orders > 0 ? String(spend / orders) : undefined,
          play2sRate,
          playDepth,
        },
        intelligence: {
          state: insight.state,
          score: insight.score,
          roiTrendPercent: insight.roiTrendPercent,
          ctrTrendPercent: insight.ctrTrendPercent,
          signals: insight.signals,
        },
        analysisCodes,
      }
    })
    .sort((a, b) => {
      const mediaDifference = Number(Boolean(b.coverUrl || b.videoUrl)) - Number(Boolean(a.coverUrl || a.videoUrl))
      if (mediaDifference) return mediaDifference
      const gradeRank = { S: 4, A: 3, B: 2, C: 1 }
      const gradeDifference = gradeRank[b.grade] - gradeRank[a.grade]
      if (gradeDifference) return gradeDifference
      return (Number(b.performance.gmv) || 0) - (Number(a.performance.gmv) || 0)
    }))
}

async function sopWorkspace() {
  recoverInterruptedSyncJobs()
  const storedInstances = gmvMaxRepo.listSopInstances()
  const campaigns = new Map(gmvMaxRepo.listCampaigns().map((item) => [item.id, item]))
  const bindings = new Map(gmvMaxRepo.listBindings().map((item) => [item.id, item]))
  const productCosts = gmvMaxRepo.listProductCosts()
  const campaignProducts = new Map(productCosts.filter((item) => item.campaignId).map((item) => [`${item.campaignId}:${item.productId}`, item]))
  const storeProducts = new Map(productCosts.map((item) => [`${item.storeId}:${item.productId}`, item]))
  const supplemental = gmvMaxRepo.listSupplementalMetrics()
  const matureAssessments = gmvMaxRepo.listMatureAssessments()
  const decisionSnapshots = gmvMaxRepo.listDecisionSnapshots()
  const experiments = gmvMaxRepo.listExperiments()
  const interventions = gmvMaxRepo.listSopInterventions()
  const tasks = gmvMaxRepo.listSopTasks()
  const recommendations = gmvMaxRepo.listRecommendations()
  const latestSyncJob = gmvMaxRepo.listSyncJobs().sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const latestAssessmentByInstance = new Map<string, (typeof matureAssessments)[number]>()
  for (const item of matureAssessments) if (!latestAssessmentByInstance.has(item.sopInstanceId)) latestAssessmentByInstance.set(item.sopInstanceId, item)
  const activeInterventionByInstance = new Map<string, (typeof interventions)[number]>()
  for (const item of interventions) {
    if ((item.status === 'draft' || item.status === 'pending_verification' || item.status === 'observing') && !activeInterventionByInstance.has(item.sopInstanceId)) activeInterventionByInstance.set(item.sopInstanceId, item)
  }
  const instances = storedInstances.map((instance) => {
    const campaign = campaigns.get(instance.campaignId)
    const binding = bindings.get(instance.bindingId)
    const snapshot = instance.viewSnapshot || {
      metrics: { spend: '0', gmv: '0', roi: '0', orders: '0', aov: '0', costPerOrder: '0', ctr: '0', cvr: '0', creativeExplorationRate: '0', winningCreativeCount: 0, liveUvToOrderCvr: '0', netGmv: '0', netRoi: '0', estimatedNetProfit: '0', completeDays: 0, consecutiveProfitableDays: 0 },
      profitFloor: '0',
      targetRoi: campaign?.roasBid || '0',
      creativeGradeSummary: { S: 0, A: 0, B: 0, C: 0 },
      updatedAt: instance.updatedAt,
    }
    const matureAssessment = latestAssessmentByInstance.get(instance.id)
    const activeIntervention = activeInterventionByInstance.get(instance.id)
    const instanceTasks = tasks.filter((item) => item.sopInstanceId === instance.id)
    const instanceInterventions = interventions.filter((item) => item.sopInstanceId === instance.id)
    const instanceRecommendations = recommendations.filter((item) => item.campaignId === instance.campaignId)
    const instanceSupplemental = supplemental.filter((item) => item.campaignId === instance.campaignId && (!instance.productId || !item.productId || item.productId === instance.productId))
    const product = instance.productId
      ? campaignProducts.get(`${instance.campaignId}:${instance.productId}`) || storeProducts.get(`${instance.storeId}:${instance.productId}`)
      : undefined
    const issueResolutions = buildGmvMaxSopIssueResolutions({
      instance,
      metrics: snapshot.metrics,
      policy: policyFor(instance.campaignId),
      matureAssessment,
      tasks: instanceTasks,
      interventions: instanceInterventions,
      recommendations: instanceRecommendations,
      latestSyncJob,
      profitFloor: snapshot.profitFloor,
      targetRoi: campaign?.roasBid || snapshot.targetRoi,
      campaignOperationStatus: campaign?.operationStatus || 'UNKNOWN',
      creativeCount: Object.values(snapshot.creativeGradeSummary).reduce((sum, value) => sum + value, 0),
      hasLiveMetrics: instanceSupplemental.some((item) => [item.liveUv, item.liveStayRate, item.productClicks, item.addToCart, item.paidOrders].some((value) => value !== undefined)),
    })
    return {
      ...instance,
      metrics: snapshot.metrics,
      campaignName: campaign?.name || instance.campaignId,
      campaignOperationStatus: campaign?.operationStatus || 'UNKNOWN',
      storeName: binding?.storeName || instance.storeId,
      productImageUrl: product?.imageUrl,
      productCatalogStatus: product?.catalogStatus || product?.gmvMaxAdsStatus,
      profitFloor: snapshot.profitFloor,
      targetRoi: campaign?.roasBid || snapshot.targetRoi,
      creativeGradeSummary: snapshot.creativeGradeSummary,
      matureAssessment,
      activeIntervention,
      protectedWinnerCount: snapshot.creativeGradeSummary.S,
      observationDaysRemaining: activeIntervention ? Math.max(0, activeIntervention.requiredDeliveryDays - activeIntervention.observedDeliveryDays) : 0,
      issueResolutions,
    }
  })
  const creativeVideos = buildSopCreativeVideos(instances)
  const activeBindingIds = new Set(gmvMaxRepo.listBindings().filter((item) => item.active).map((item) => item.id))
  const eligibleCampaigns = [...campaigns.values()].filter((item) => activeBindingIds.has(item.bindingId))
  const managedCampaignIds = new Set(instances.map((item) => item.campaignId))
  const severityScore = { must_fix: 400, recommended: 200, observing: 100, resolved: 0 }
  const codeScore: Record<string, number> = {
    roi_below_profit_floor: 100, net_profit_negative: 95, recommendation_failed: 90, campaign_disabled: 85,
    sync_interrupted: 80, delivery_data_stale: 75, delivery_missing: 70, external_verification_pending: 68,
    approval_pending: 60, observation_active: 40,
  }
  const issueQueue = instances.flatMap((instance) => instance.issueResolutions.map((issue) => ({
    ...issue,
    productName: instance.productName || instance.productId,
    campaignName: instance.campaignName,
    storeName: instance.storeName,
    priorityScore: severityScore[issue.severity] + (codeScore[issue.code] || 0),
  }))).sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || a.id.localeCompare(b.id))
  const completedInterventions = interventions.filter((item) => item.status === 'completed' && item.outcomeMetrics)
  const verdictCount = (verdict: string) => completedInterventions.filter((item) => item.outcomeMetrics?.verdict === verdict).length
  const now = Date.now()
  const supplementalMetrics = supplemental.map((item) => ({ ...item, freshness: (item.staleAt || item.updatedAt + 48 * 60 * 60 * 1000) <= now ? 'stale' as const : 'fresh' as const }))
  const reminders = interventions.flatMap<GmvMaxSopReminder>((item) => {
    if (item.status === 'pending_verification') return [{ id: hash(item.id, 'verify'), kind: 'verification' as const, sopInstanceId: item.sopInstanceId, campaignId: item.campaignId, message: 'Verify the recorded Seller Center value before observation starts.' }]
    if (item.status === 'observing' && item.observedDeliveryDays >= item.requiredDeliveryDays - 1) return [{ id: hash(item.id, 'observe'), kind: 'observation' as const, sopInstanceId: item.sopInstanceId, campaignId: item.campaignId, message: 'Observation is nearly complete. Sync the latest full delivery day.' }]
    return []
  })
  const latestDecisionByInstance = new Map<string, (typeof decisionSnapshots)[number]>()
  for (const item of decisionSnapshots) if (!latestDecisionByInstance.has(item.sopInstanceId)) latestDecisionByInstance.set(item.sopInstanceId, item)
  const latestDecisions = [...latestDecisionByInstance.values()]
  return {
    instances,
    tasks,
    supplementalMetrics,
    winnerDna: gmvMaxRepo.listWinnerDna(),
    creativeVideos,
    matureAssessments,
    interventions,
    automationRuns: gmvMaxRepo.listSopAutomationRuns(),
    latestSyncJob,
    issueQueue,
    effectivenessSummary: {
      completed: completedInterventions.length,
      improved: verdictCount('improved'),
      stable: verdictCount('stable'),
      declined: verdictCount('declined'),
      measured: verdictCount('measured'),
      improvementRate: completedInterventions.length ? verdictCount('improved') / completedInterventions.length : 0,
    },
    reminders,
    freshnessSummary: {
      fresh: supplementalMetrics.filter((item) => item.freshness === 'fresh').length,
      stale: supplementalMetrics.filter((item) => item.freshness === 'stale').length,
      missing: instances.filter((instance) => !supplementalMetrics.some((item) => item.campaignId === instance.campaignId && (!instance.productId || !item.productId || item.productId === instance.productId))).length,
    },
    decisions: latestDecisions,
    experiments,
    decisionSummary: {
      total: latestDecisions.length,
      p0: latestDecisions.filter((item) => item.priority === 'P0').length,
      p1: latestDecisions.filter((item) => item.priority === 'P1').length,
      p2: latestDecisions.filter((item) => item.priority === 'P2').length,
      writeBlocked: latestDecisions.filter((item) => !item.writeAllowed).length,
      activeExperiments: experiments.filter((item) => ['pending_approval', 'executing', 'observing', 'rollback_pending'].includes(item.state)).length,
    },
    autoOnboarding: {
      eligibleCampaigns: eligibleCampaigns.length,
      managedCampaigns: eligibleCampaigns.filter((item) => managedCampaignIds.has(item.id)).length,
      automaticInstances: instances.filter((item) => item.creationSource === 'automatic').length,
      waitingForSalesData: eligibleCampaigns.filter((item) => item.campaignType === 'PRODUCT' && !managedCampaignIds.has(item.id)).length,
    },
    generatedAt: Date.now(),
  }
}

export const gmvMaxService = {
  schedulerState: persistedSchedulerState,

  updateSchedulerState(input: Partial<GmvMaxSchedulerState>) {
    return saveSchedulerState(this.schedulerState, input)
  },

  async setEmergencyStop(input: { stopped: boolean; reason?: string }) {
    const stopped = Boolean(input?.stopped)
    const state = this.updateSchedulerState({
      emergencyStopped: stopped,
      pausedReason: stopped ? text(input?.reason, 'Manually paused by the operator.') : undefined,
    })
    await sendGmvMaxNotification(
      stopped ? 'emergency_stop_enabled' : 'emergency_stop_disabled',
      stopped ? `GMV MAX write operations paused: ${state.pausedReason}` : 'GMV MAX write operations resumed.',
    )
    return state
  },

  async connect(input?: { name?: string }) {
    if (!gmvMaxAuthStore.encryptionAvailable()) throw new Error('Secure credential storage is required for TikTok OAuth.')
    const now = Date.now()
    const connection: GmvMaxConnection = {
      id: randomUUID(), name: text(input?.name, `TikTok GMV MAX ${new Date(now).toLocaleDateString()}`), state: 'authorizing',
      serverUrl: GMV_MAX_SERVER_URL, missingTools: [], createdAt: now, updatedAt: now,
    }
    gmvMaxRepo.saveConnection(connection)
    try {
      const runtime = await gmvMaxMcpClient.connect(connection.id, true)
      const connected = await saveConnectionState(connection.id, {
        state: 'connected', lastConnectedAt: Date.now(), expiresAt: runtime.provider.tokenExpiresAt(),
        missingTools: runtime.missingTools, capabilities: runtime.capabilities,
        lastError: runtime.capabilities.core_read ? undefined : `Missing core tools: ${runtime.missingTools.join(', ')}`,
      })
      await syncBindings(connected)
      return connected
    } catch (error) {
      await saveConnectionState(connection.id, { state: 'error', lastError: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  async disconnect(connectionId: string) {
    await gmvMaxMcpClient.disconnect(connectionId)
    await gmvMaxAuthStore.remove(connectionId)
    return await saveConnectionState(connectionId, { state: 'disconnected', expiresAt: undefined, missingTools: [] })
  },

  async reconnect(connectionId: string) {
    const connection = connectionById(connectionId)
    if (!connection) throw new Error('GMV MAX connection does not exist.')
    await saveConnectionState(connectionId, { state: 'authorizing', lastError: undefined })
    try {
      const runtime = await gmvMaxMcpClient.connect(connectionId, false)
      const connected = await saveConnectionState(connectionId, {
        state: 'connected',
        lastConnectedAt: Date.now(),
        expiresAt: runtime.provider.tokenExpiresAt(),
        missingTools: runtime.missingTools,
        capabilities: runtime.capabilities,
        lastError: runtime.capabilities.core_read ? undefined : `Missing core tools: ${runtime.missingTools.join(', ')}`,
      })
      await syncBindings(connected)
      return connected
    } catch (error) {
      await saveConnectionState(connectionId, {
        state: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  async getSopWorkspace() {
    return await sopWorkspace()
  },

  async runSopAutomation(input?: { sopInstanceId?: string; force?: boolean }) {
    await recalculateSop(true)
    const workspace = await sopWorkspace()
    const instances = workspace.instances.filter((item) => (!input?.sopInstanceId || item.id === text(input.sopInstanceId)) && item.status !== 'paused' && item.status !== 'completed' && item.automationEnabled !== false)
    const results: GmvMaxSopAutomationRun[] = []
    for (const instance of instances) {
      const binding = gmvMaxRepo.listBindings().find((item) => item.id === instance.bindingId)
      const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === instance.campaignId)
      const localDate = zonedDateParts(binding?.timezone).date
      const state = instance.matureAssessment?.state || instance.phase
      const action = instance.matureAssessment?.recommendedAction || `monitor_${instance.phase}`
      const assessment = instance.matureAssessment
      const automationPlan = instance.track === 'mature_product' && assessment
        ? planGmvMaxSopAutomation({
            track: instance.track,
            phase: instance.phase,
            matureState: assessment.state,
            automationMode: instance.automationMode || 'draft_actions',
            writeActionsAllowed: assessment.writeActionsAllowed,
            consecutiveProfitableDays: instance.metrics.consecutiveProfitableDays,
            blockers: instance.blockers,
          })
        : planGmvMaxSopAutomation({
            track: instance.track || (instance.campaignType === 'LIVE' ? 'live' : 'new_product'),
            phase: instance.phase,
            automationMode: instance.automationMode || 'draft_actions',
            writeActionsAllowed: false,
            consecutiveProfitableDays: instance.metrics.consecutiveProfitableDays,
            blockers: instance.blockers,
          })
      const decision = instance.activeIntervention ? 'observe_intervention' : automationPlan.kind
      const decisionContext = instance.activeIntervention
        ? `${instance.activeIntervention.id}:${instance.activeIntervention.observedDeliveryDays}:${instance.activeIntervention.status}`
        : automationPlan.kind === 'profit_observation_task'
          ? String(instance.metrics.consecutiveProfitableDays)
          : automationPlan.kind === 'controls_task' || automationPlan.kind === 'recovery_task' || automationPlan.kind === 'blocker_resolution_task'
            ? `${assessment?.dataCoverage || '0'}:${(assessment?.reasons || instance.blockers || []).slice().sort().join(',')}`
            : automationPlan.kind === 'roi_approval_draft'
              ? String(campaign?.roasBid || '')
              : instance.phase
      const runId = buildGmvMaxSopAutomationRunId({ instanceId: instance.id, localDate, state, decision, decisionContext })
      const previous = gmvMaxRepo.listSopAutomationRuns().find((item) => item.id === runId)
      const now = Date.now()
      if (previous && !shouldRunGmvMaxSopAutomation({ previous, now, force: input?.force })) {
        results.push(previous)
        continue
      }
      const currentTaskId = hash(instance.id, localDate, 'sop_automation', decision, decisionContext)
      for (const task of supersedeGmvMaxSopAutomationTasks(workspace.tasks.filter((item) => item.sopInstanceId === instance.id), currentTaskId, now, instance.activeIntervention?.taskId ? [instance.activeIntervention.taskId] : [])) {
        gmvMaxRepo.saveSopTask(task)
      }
      const saveRun = (values: Partial<GmvMaxSopAutomationRun>) => {
        const status = values.status || 'completed'
        const nextRetryAt = status === 'failed' ? now + GMV_MAX_SOP_AUTOMATION_RETRY_MS : undefined
        const run = gmvMaxRepo.saveSopAutomationRun({
          id: runId, sopInstanceId: instance.id, campaignId: instance.campaignId, localDate, state, action, decision, decisionContext,
          status, message: values.message || action, taskId: values.taskId, interventionId: values.interventionId,
          recommendationId: values.recommendationId, attempt: (previous?.attempt || 0) + 1, nextRetryAt, createdAt: previous?.createdAt || now, updatedAt: now,
        })
        gmvMaxRepo.saveSopInstance({
          ...instance, automationEnabled: instance.automationEnabled !== false, automationMode: instance.automationMode || 'draft_actions',
          lastAutomationAt: now, nextAutomationAt: nextRetryAt || now + (30 * 60 * 1000), lastAutomationResult: run.message, updatedAt: now,
        })
        results.push(run)
        return run
      }
      const ensureTask = (title: string, description: string, executionMode: 'review' | 'internal' | 'manual_external' = 'review', resolutionCode?: string) => {
        const taskId = currentTaskId
        const existing = gmvMaxRepo.getSopTask(taskId)
        const createdDrafts = workspace.winnerDna.filter((item) => item.sopInstanceId === instance.id && item.draftStatus === 'created')
        const automaticallyCompleted = executionMode === 'internal' && createdDrafts.length > 0
        if (!existing) gmvMaxRepo.saveSopTask({
          id: taskId, sopInstanceId: instance.id, campaignId: instance.campaignId, localDate, scheduledTime: '09:00', kind: executionMode === 'manual_external' ? 'external_operation' : 'sop_automation',
          title, description, resolutionCode, executionMode, status: automaticallyCompleted ? 'completed' : 'pending', evidence: automaticallyCompleted ? `${createdDrafts.length} Winner draft projects are available.` : undefined, completedAt: automaticallyCompleted ? now : undefined, createdAt: now, updatedAt: now,
        })
        else if (automaticallyCompleted && existing.status === 'pending') gmvMaxRepo.saveSopTask({ ...existing, status: 'completed', evidence: `${createdDrafts.length} Winner draft projects are available.`, completedAt: now, updatedAt: now })
        return taskId
      }
      try {
        if (instance.activeIntervention) {
          saveRun({ status: 'skipped', message: 'An intervention is awaiting approval or under observation.', interventionId: instance.activeIntervention.id, recommendationId: instance.activeIntervention.recommendationId })
          continue
        }
        const automaticTaskPlans: Record<string, { title: string; description: string; executionMode?: 'review' | 'internal' }> = {
          blocker_resolution_task: { title: 'Resolve current SOP evidence blockers', description: `Resolve the current blockers before advancing: ${instance.blockers.join(', ') || 'missing operating evidence'}.` },
          new_product_readiness_task: { title: 'Complete new-product launch readiness', description: 'Confirm costs, profit floor, Hero SKU, target ROI, inventory, and minimum creative supply.' },
          new_product_cold_start_task: { title: 'Run protected new-product cold start', description: 'Monitor complete delivery days, orders, ROI, conversion, and the first proven Winner without increasing risk.' },
          new_product_scaling_task: { title: 'Review protected new-product scaling', description: 'Confirm three profitable delivery days and stable conversion before creating any budget or ROI approval draft.' },
          new_product_matrix_task: { title: 'Prepare the product and creative matrix', description: 'Expand profitable product angles, Winner variations, LIVE support, and creator coverage without changing multiple variables.' },
          new_product_factory_task: { title: 'Refresh the new-product creative factory', description: 'Generate Winner variation briefs and replenish creative supply using the protected 70/20/10 mix.', executionMode: 'internal' },
          new_product_steady_task: { title: 'Maintain steady new-product operations', description: 'Review the latest seven complete days, profitability, creative supply, and delivery stability.' },
          live_readiness_task: { title: 'Complete LIVE launch readiness', description: 'Confirm the LIVE campaign, schedule, inventory, offer, product links, hosts, and conversion measurement.' },
          live_cold_start_task: { title: 'Run protected LIVE cold start', description: 'Review LIVE UV, stay rate, product clicks, orders, paid orders, spend, and Net ROI before scaling.' },
          live_growth_task: { title: 'Optimize the LIVE growth loop', description: 'Prioritize sessions by LIVE Score and prepare one-variable budget, offer, host, or product-order experiments.' },
          live_steady_task: { title: 'Maintain steady LIVE operations', description: 'Review the latest seven complete LIVE days, conversion quality, profitability, inventory, and creative support.' },
        }
        const automaticTaskPlan = automaticTaskPlans[automationPlan.kind]
        if (automaticTaskPlan) {
          const taskId = ensureTask(automaticTaskPlan.title, automaticTaskPlan.description, automaticTaskPlan.executionMode)
          saveRun({ taskId, message: automaticTaskPlan.title })
          continue
        }
        if (instance.track !== 'mature_product' || !assessment) {
          const taskId = ensureTask('Automatic SOP phase review', `The SOP automatically evaluated ${instance.phase} and refreshed its daily tasks.`)
          saveRun({ taskId, message: `Automatically evaluated ${instance.phase}.` })
          continue
        }
        if (automationPlan.kind === 'recovery_task') {
          const taskId = ensureTask('Verify mature product recovery readiness', 'Confirm the disabled reason, inventory, costs, product status, LIVE support, and target ROI source before resuming delivery.')
          saveRun({ taskId, message: 'Created the recovery readiness diagnosis task.' })
          continue
        }
        if (automationPlan.kind === 'controls_task') {
          const taskId = ensureTask('Complete product-level operating controls', 'Add product budget, target ROI, intraday spend, inventory readiness, and LIVE readiness. No write action will be created before coverage reaches 80 percent.')
          saveRun({ taskId, message: 'Created the product-control completion task.' })
          continue
        }
        if (automationPlan.kind === 'creative_task') {
          const taskId = ensureTask('Create second-generation creative drafts', 'Use the protected mature mix: 25 percent historical Winners, 55 percent Winner variations, and 20 percent new concepts.', 'internal')
          saveRun({ taskId, message: 'Created the second-generation creative task and refreshed Winner drafts.' })
          continue
        }
        if (automationPlan.kind === 'hold') {
          saveRun({ status: 'skipped', message: 'Settings remain unchanged because the mature product is healthy.' })
          continue
        }
        if (automationPlan.kind === 'diagnostic_task') {
          const taskId = ensureTask('Review the recommended single-variable action', `Review ${assessment.recommendedAction}. Automatic action drafting is disabled for this SOP.`)
          saveRun({ taskId, message: 'Created a diagnostic review task without an action draft.' })
          continue
        }
        if (automationPlan.kind === 'product_budget_external') {
          const intervention = await this.createSopInterventionDraft({ sopInstanceId: instance.id, kind: 'other', variable: 'product_budget', beforeValue: '', proposedValue: '', taskId: ensureTask('Review product-level budget increase', 'Change only the product budget in Seller Center, then record the operation to start the three-delivery-day observation.', 'manual_external', 'external_manual_intervention') })
          saveRun({ interventionId: intervention.id, taskId: intervention.taskId, message: 'Created a product-budget external intervention draft.' })
          continue
        }
        if (automationPlan.kind === 'profit_observation_task') {
          const taskId = ensureTask('Wait for three profitable delivery days', 'Do not enable Auto Budget until ROI, spend growth, and conversion remain stable for three complete delivery days.')
          saveRun({ status: 'skipped', taskId, message: 'Scaling remains locked until three profitable delivery days are complete.' })
          continue
        }
        if (automationPlan.kind === 'auto_budget_external') {
          const intervention = await this.createSopInterventionDraft({ sopInstanceId: instance.id, kind: 'auto_budget', variable: 'auto_budget', taskId: ensureTask('Review Auto Budget eligibility', 'Enable Auto Budget manually only after confirming inventory and LIVE support.', 'manual_external', 'external_auto_budget') })
          saveRun({ interventionId: intervention.id, taskId: intervention.taskId, message: 'Created an Auto Budget external intervention draft.' })
          continue
        }
        if (automationPlan.kind === 'roi_approval_draft' && campaign) {
          const before = Number(campaign.roasBid)
          const proposed = before > 0 ? before * 1.05 : before
          const intervention = await this.createSopInterventionDraft({ sopInstanceId: instance.id, kind: 'roi', variable: 'target_roi', beforeValue: String(before), proposedValue: proposed.toFixed(4) })
          saveRun({ interventionId: intervention.id, recommendationId: intervention.recommendationId, message: 'Created a protected 5 percent ROI adjustment for approval.' })
          continue
        }
        const taskId = ensureTask('Review the recommended mature-product action', `Review ${assessment.recommendedAction} and keep the single-variable rule.`)
        saveRun({ taskId, message: 'Created the recommended mature-product review task.' })
      } catch (error) {
        saveRun({ status: 'failed', message: error instanceof Error ? error.message : String(error) })
      }
    }
    return results
  },

  async startSop(input: { campaignId: string; productId?: string; productName?: string; startDate?: string; track?: GmvMaxSopTrack; trackOverrideReason?: string }) {
    const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === text(input?.campaignId))
    if (!campaign) throw new Error('GMV MAX campaign does not exist.')
    const binding = gmvMaxRepo.listBindings().find((item) => item.id === campaign.bindingId)
    if (!binding) throw new Error('GMV MAX campaign binding does not exist.')
    const productId = text(input?.productId) || undefined
    if (campaign.campaignType === 'PRODUCT' && !productId) throw new Error('A Hero SKU is required for a Product SOP.')
    const duplicate = gmvMaxRepo.listSopInstances().find((item) => item.campaignId === campaign.id && (item.productId || '') === (productId || '') && item.status !== 'completed')
    if (duplicate) return duplicate
    const now = Date.now()
    const manualTrack = input.track
    if (manualTrack && !text(input.trackOverrideReason)) throw new Error('A track override reason is required.')
    const instance: GmvMaxSopInstance = {
      id: hash(campaign.id, productId || 'live'),
      bindingId: campaign.bindingId,
      campaignId: campaign.id,
      storeId: campaign.storeId,
      campaignType: campaign.campaignType,
      productId,
      productName: text(input?.productName) || undefined,
      startDate: input?.startDate ? validateSopDate(input.startDate, 'startDate') : zonedDateParts(binding.timezone).date,
      phase: 'preparation',
      status: 'active',
      currentDay: 0,
      blockers: [],
      track: manualTrack,
      trackSource: manualTrack ? 'manual' : 'auto',
      trackOverrideReason: manualTrack ? text(input.trackOverrideReason) : undefined,
      automationEnabled: true,
      automationMode: 'draft_actions',
      creationSource: 'manual',
      createdAt: now,
      updatedAt: now,
    }
    gmvMaxRepo.saveSopInstance(instance)
    await recalculateSop(true)
    return gmvMaxRepo.getSopInstance(instance.id) || instance
  },

  async updateSop(input: { id: string; status?: 'active' | 'paused' | 'completed'; productName?: string; track?: GmvMaxSopTrack; trackOverrideReason?: string; clearTrackOverride?: boolean; automationEnabled?: boolean; automationMode?: 'diagnostic_only' | 'draft_actions' }) {
    const current = gmvMaxRepo.getSopInstance(text(input?.id))
    if (!current) throw new Error('GMV MAX SOP instance does not exist.')
    const status = input?.status && ['active', 'paused', 'completed'].includes(input.status) ? input.status : current.status
    if (input.track && !text(input.trackOverrideReason)) throw new Error('A track override reason is required.')
    const updated = gmvMaxRepo.saveSopInstance({ ...current, status, productName: text(input?.productName) || current.productName,
      track: input.clearTrackOverride ? undefined : input.track || current.track,
      trackSource: input.clearTrackOverride ? 'auto' : input.track ? 'manual' : current.trackSource || 'auto',
      trackOverrideReason: input.clearTrackOverride ? undefined : input.track ? text(input.trackOverrideReason) : current.trackOverrideReason,
      automationEnabled: input.automationEnabled === undefined ? current.automationEnabled : Boolean(input.automationEnabled),
      automationMode: input.automationMode || current.automationMode || 'draft_actions',
      updatedAt: Date.now() })
    if (status === 'active') await recalculateSop(true)
    return updated
  },

  async completeSopTask(input: { id: string; evidence?: string }) {
    const current = gmvMaxRepo.getSopTask(text(input?.id))
    if (!current) throw new Error('GMV MAX SOP task does not exist.')
    if (current.executionMode === 'manual_external') throw new Error('External SOP tasks must be completed with the recorded Seller Center value and evidence.')
    if (current.status === 'blocked') throw new Error('Blocked SOP tasks can only be completed after their evidence condition is resolved.')
    const now = Date.now()
    return gmvMaxRepo.saveSopTask({ ...current, status: 'completed', evidence: text(input?.evidence) || current.evidence, completedAt: now, updatedAt: now })
  },

  async saveSupplementalMetrics(input: Partial<GmvMaxSupplementalMetric> & { campaignId: string; statDate: string }) {
    const metric = supplementalMetricFromInput(input, 'manual')
    gmvMaxRepo.saveSupplementalMetric(metric)
    await recalculateSop(true)
    return metric
  },

  async exportSupplementalMetricsTemplate() {
    return 'campaignId,productId,statDate,refundAmount,netGmv,liveUv,liveStayRate,productClicks,addToCart,orders,paidOrders,productBudget,targetRoi,intradaySpend,deliveryMode,autoBudgetEnabled,inventoryReady,liveReady\r\n'
  },

  async importSupplementalMetrics(input: { csv: string }) {
    const csv = String(input?.csv || '')
    if (!csv.trim()) throw new Error('GMV MAX supplemental metric import is empty.')
    if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024) throw new Error('GMV MAX supplemental metric import exceeds 5 MB.')
    const workbook = XLSX.read(csv, { type: 'string' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('GMV MAX supplemental metric import does not contain a worksheet.')
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false })
    if (!rows.length) throw new Error('GMV MAX supplemental metric import does not contain data rows.')
    if (rows.length > 10_000) throw new Error('GMV MAX supplemental metric import exceeds 10000 rows.')
    const now = Date.now()
    const items = rows.map((row, index) => supplementalMetricFromInput({
      campaignId: text(row.campaignId),
      productId: text(row.productId) || undefined,
      statDate: text(row.statDate),
      refundAmount: text(row.refundAmount) || undefined,
      netGmv: text(row.netGmv) || undefined,
      liveUv: text(row.liveUv) || undefined,
      liveStayRate: text(row.liveStayRate) || undefined,
      productClicks: text(row.productClicks) || undefined,
      addToCart: text(row.addToCart) || undefined,
      orders: text(row.orders) || undefined,
      paidOrders: text(row.paidOrders) || undefined,
      productBudget: text(row.productBudget) || undefined,
      targetRoi: text(row.targetRoi) || undefined,
      intradaySpend: text(row.intradaySpend) || undefined,
      deliveryMode: text(row.deliveryMode) || undefined,
      autoBudgetEnabled: text(row.autoBudgetEnabled) ? ['true', '1', 'yes'].includes(text(row.autoBudgetEnabled).toLowerCase()) : undefined,
      inventoryReady: text(row.inventoryReady) ? ['true', '1', 'yes'].includes(text(row.inventoryReady).toLowerCase()) : undefined,
      liveReady: text(row.liveReady) ? ['true', '1', 'yes'].includes(text(row.liveReady).toLowerCase()) : undefined,
    }, 'csv', now + index))
    const keys = new Set<string>()
    for (const item of items) {
      const key = `${item.campaignId}:${item.productId || ''}:${item.statDate}`
      if (keys.has(key)) throw new Error(`GMV MAX supplemental metric import contains duplicate row ${key}.`)
      keys.add(key)
    }
    gmvMaxRepo.saveSupplementalMetrics(items)
    await recalculateSop(true)
    return { imported: items.length }
  },

  async createSopInterventionDraft(input: { sopInstanceId: string; kind: GmvMaxSopIntervention['kind']; variable: string; beforeValue?: string; proposedValue?: string; taskId?: string; actionPayload?: Record<string, unknown> }) {
    const instance = gmvMaxRepo.getSopInstance(text(input.sopInstanceId))
    if (!instance) throw new Error('GMV MAX SOP instance does not exist.')
    const interventionId = hash(instance.id, input.kind, input.variable, input.proposedValue || '')
    const existing = gmvMaxRepo.getSopIntervention(interventionId)
    if (existing) return existing
    const active = gmvMaxRepo.listSopInterventions().find((item) => item.sopInstanceId === instance.id && (item.status === 'draft' || item.status === 'pending_verification' || item.status === 'observing'))
    if (active) throw new Error('Only one SOP intervention can be active during the observation window.')
    const assessment = gmvMaxRepo.listMatureAssessments().filter((item) => item.sopInstanceId === instance.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const internal = ['budget', 'roi', 'creative', 'status'].includes(input.kind)
    if (internal && !assessment?.writeActionsAllowed) throw new Error('Product-level controls and at least 80 percent data coverage are required before creating a write action.')
    if (input.kind === 'roi') {
      const before = Number(input.beforeValue)
      const proposed = Number(input.proposedValue)
      const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === instance.campaignId)
      const policy = policyFor(instance.campaignId)
      const binding = gmvMaxRepo.listBindings().find((item) => item.id === instance.bindingId)
      const range = binding ? completedReportRangeForBindings([binding], 40) : completedReportRangeForBindings([], 40)
      const guard = campaign ? profitGuardForSopProduct(campaign, instance.productId, policy, profitDataSnapshot(range, [instance.campaignId]), gmvMaxRepo.listMetrics(instance.campaignId)) : undefined
      if (!Number.isFinite(before) || before <= 0 || !Number.isFinite(proposed)) throw new Error('ROI intervention values are invalid.')
      if (Math.abs(proposed - before) / before > 0.05 + Number.EPSILON) throw new Error('ROI changes cannot exceed 5 percent per intervention.')
      if (guard && proposed < Number(guard.effectiveRoiFloor)) throw new Error('ROI cannot be set below the effective profit floor.')
    }
    const now = Date.now()
    let recommendationId: string | undefined
    if (internal) {
      const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === instance.campaignId)
      if (!campaign) throw new Error('GMV MAX campaign does not exist.')
      if ((input.kind === 'creative' || input.kind === 'status') && !input.actionPayload) throw new Error('The intervention action payload is required.')
      recommendationId = hash(interventionId, 'recommendation')
      const before = Number(input.beforeValue)
      const proposed = Number(input.proposedValue)
      const increasing = Number.isFinite(before) && Number.isFinite(proposed) ? proposed >= before : true
      gmvMaxRepo.saveRecommendation({
        id: recommendationId, campaignId: campaign.id, bindingId: campaign.bindingId, kind: increasing ? 'scale_up' : 'scale_down', actionType: input.kind as GmvMaxActionType,
        status: 'pending', risk: input.kind === 'creative' ? 'medium' : 'low', preset: policyFor(campaign.id).preset,
        currentBudget: campaign.budget, proposedBudget: input.kind === 'budget' ? String(input.proposedValue) : campaign.budget,
        currentRoasBid: campaign.roasBid, proposedRoasBid: input.kind === 'roi' ? String(input.proposedValue) : campaign.roasBid,
        reason: `SOP single-variable intervention: ${text(input.variable)}.`, projectionSource: 'unavailable', confidence: Number(assessment?.dataCoverage || 0),
        actionPayload: input.actionPayload, reversible: input.kind !== 'creative',
        rollbackPayload: input.kind === 'status' ? { operationStatus: campaign.operationStatus } : input.kind === 'creative' ? undefined : {},
        shadow: false,
        evidence: {
          startDate: assessment?.recent7d.startDate || assessment?.statDate || '', endDate: assessment?.recent7d.endDate || assessment?.statDate || '', metricIds: [],
          consecutiveDays: assessment?.recent7d.deliveryDays || 0, totalOrders: assessment?.recent7d.orders || '0', averageRoi: assessment?.recent7d.roi || '0',
          averageBudgetUtilization: assessment?.budgetUtilization || '0', targetRoi: campaign.roasBid,
          recommendedBudget: input.kind === 'budget' ? String(input.proposedValue) : undefined, recommendedRoasBid: input.kind === 'roi' ? String(input.proposedValue) : undefined,
          dataFreshness: assessment?.dataFreshness === 'fresh' ? 'complete' : 'preliminary',
        },
        autoExecutable: false, idempotencyKey: recommendationId, createdAt: now, updatedAt: now,
      })
    }
    const item: GmvMaxSopIntervention = {
      id: interventionId, sopInstanceId: instance.id, campaignId: instance.campaignId, productId: instance.productId,
      kind: input.kind, variable: text(input.variable), beforeValue: text(input.beforeValue) || undefined, proposedValue: text(input.proposedValue) || undefined, taskId: text(input.taskId) || undefined, recommendationId,
      executionMode: internal ? 'approval' : 'manual_external', status: 'draft', requiredDeliveryDays: 3, observedDeliveryDays: 0, createdAt: now, updatedAt: now,
    }
    const saved = gmvMaxRepo.saveSopIntervention(item)
    if (!internal && !input.taskId) {
      const binding = gmvMaxRepo.listBindings().find((entry) => entry.id === instance.bindingId)
      const localDate = zonedDateParts(binding?.timezone).date
      gmvMaxRepo.saveSopTask({
        id: hash(instance.id, interventionId, 'external_task'), sopInstanceId: instance.id, campaignId: instance.campaignId, localDate, scheduledTime: '14:00', kind: 'external_operation',
        title: 'Seller Center single-variable intervention', description: `Complete and record the ${input.kind} intervention in Seller Center.`, resolutionCode: 'external_manual_intervention', executionMode: 'manual_external', status: 'pending', createdAt: now, updatedAt: now,
      })
    }
    return saved
  },

  async recordExternalSopIntervention(input: { id: string; startedDate?: string; actualValue?: string; evidenceNote?: string; screenshotRef?: string; evidenceAttachment?: GmvMaxEvidenceAttachment; completedAt?: number }) {
    const current = gmvMaxRepo.getSopIntervention(text(input.id))
    if (!current) throw new Error('GMV MAX SOP intervention does not exist.')
    if (current.status === 'pending_verification' || current.status === 'observing' || current.status === 'completed') return current
    if (current.status !== 'draft') throw new Error(`SOP intervention cannot be recorded from status ${current.status}.`)
    const instance = gmvMaxRepo.getSopInstance(current.sopInstanceId)
    if (!instance) throw new Error('GMV MAX SOP instance does not exist.')
    const binding = gmvMaxRepo.listBindings().find((item) => item.id === instance.bindingId)
    const startedDate = input.startedDate ? validateSopDate(input.startedDate, 'startedDate') : zonedDateParts(binding?.timezone).date
    const actualValue = text(input.actualValue)
    const evidenceNote = text(input.evidenceNote)
    if (!actualValue) throw new Error('The actual Seller Center value is required.')
    if (!evidenceNote) throw new Error('External operation evidence is required.')
    const completedAt = Number(input.completedAt) > 0 ? Number(input.completedAt) : Date.now()
    const updated = gmvMaxRepo.saveSopIntervention({
      ...current,
      status: 'pending_verification',
      startedDate,
      actualValue,
      completedAt,
      evidenceNote,
      screenshotRef: text(input.screenshotRef) || undefined,
      evidenceAttachment: input.evidenceAttachment,
      verificationStatus: 'pending',
      outcome: evidenceNote,
      observedDeliveryDays: 0,
      updatedAt: Date.now(),
    })
    return updated
  },

  async verifyExternalSopIntervention(input: { id: string; verified: boolean; verificationNote?: string; platformValue?: string }) {
    const current = gmvMaxRepo.getSopIntervention(text(input.id))
    if (!current) throw new Error('GMV MAX SOP intervention does not exist.')
    if (current.status === 'observing' || current.status === 'completed') return current
    if (current.status !== 'pending_verification') throw new Error(`SOP intervention cannot be verified from status ${current.status}.`)
    const verificationNote = text(input.verificationNote)
    if (!verificationNote) throw new Error('Platform verification evidence is required.')
    const platformValue = text(input.platformValue)
    if (!input.verified) {
      return gmvMaxRepo.saveSopIntervention({ ...current, verificationStatus: 'mismatch', verificationSource: 'manual', verificationNote, verificationError: platformValue ? `Platform value: ${platformValue}` : 'The platform value does not match the recorded operation.', updatedAt: Date.now() })
    }
    const instance = gmvMaxRepo.getSopInstance(current.sopInstanceId)
    if (!instance) throw new Error('GMV MAX SOP instance does not exist.')
    const startedDate = current.startedDate || zonedDateParts(gmvMaxRepo.listBindings().find((item) => item.id === instance.bindingId)?.timezone).date
    const updated = gmvMaxRepo.saveSopIntervention({ ...current, status: 'observing', verificationStatus: 'verified', verificationSource: 'manual', verificationNote, verificationError: undefined, verifiedAt: Date.now(), startedDate, observedDeliveryDays: 0, updatedAt: Date.now() })
    gmvMaxRepo.saveSopInstance({ ...instance, observationStartedDate: startedDate, observationLockUntil: 'three_complete_delivery_days', updatedAt: Date.now() })
    for (const taskId of [current.taskId, hash(instance.id, current.id, 'external_task')].filter((item): item is string => Boolean(item))) {
      const task = gmvMaxRepo.getSopTask(taskId)
      if (task) gmvMaxRepo.saveSopTask({ ...task, status: 'completed', evidence: verificationNote, completedAt: Date.now(), updatedAt: Date.now() })
    }
    return updated
  },

  async retryWinnerDraft(input: { id: string }) {
    const dna = gmvMaxRepo.getWinnerDna(text(input?.id))
    if (!dna) throw new Error('GMV MAX Winner DNA does not exist.')
    if (dna.draftStatus === 'created' && dna.draftProjectId) return dna
    return await createWinnerDraft(dna)
  },

  async getSyncJob(input: { jobId: string }) {
    return gmvMaxRepo.getSyncJob(text(input?.jobId))
  },

  async runSyncJob(input: { action: GmvMaxSyncAction }, emit?: (progress: GmvMaxSyncProgress) => void) {
    const action: GmvMaxSyncAction = input?.action === 'catalog' ? 'catalog' : 'data'
    if (syncJobs.has(action)) throw new Error('A GMV MAX synchronization job is already running.')
    const jobId = randomUUID()
    const startedAt = Date.now()
    const publish = (patch: Partial<GmvMaxSyncProgress>) => {
      const previous = gmvMaxRepo.getSyncJob(jobId)
      const progress: GmvMaxSyncProgress = {
        jobId,
        action,
        status: patch.status || previous?.status || 'running',
        phase: patch.phase || previous?.phase || 'preparing',
        message: patch.message || previous?.message || 'Preparing synchronization.',
        current: patch.current ?? previous?.current ?? 0,
        total: patch.total ?? previous?.total ?? 4,
        progress: patch.progress ?? previous?.progress ?? 0,
        error: patch.error,
        startedAt,
        updatedAt: Date.now(),
      }
      gmvMaxRepo.saveSyncJob(progress)
      emit?.(progress)
      return progress
    }
    const job = (async () => {
      publish({ phase: 'preparing', message: 'Checking connections and synchronization scope.', current: 0, total: 4, progress: 5 })
      try {
        publish({ phase: action === 'catalog' ? 'catalog' : 'delivery', message: action === 'catalog' ? 'Synchronizing products and creatives.' : 'Synchronizing accounts, campaigns, reports, products, and creatives.', current: 1, progress: 20 })
        const onProgress = (completed: number, total: number) => {
          if (!total) return
          publish({
            phase: action === 'catalog' ? 'catalog' : 'delivery',
            current: 1,
            progress: 20 + Math.floor((Math.min(completed, total) / total) * 48),
          })
        }
        if (action === 'catalog') await this.syncCatalogs({ recalculateSop: false, onProgress })
        else await this.syncAll({ recalculateSop: false, onProgress })
        publish({ phase: 'sop', message: 'Recalculating SOP gates, daily tasks, and Winner DNA.', current: 2, progress: 70 })
        await recalculateSop(true)
        publish({ phase: 'refresh', message: 'Refreshing the local SOP workspace.', current: 3, progress: 90 })
        const workspace = await sopWorkspace()
        publish({ status: 'completed', phase: 'complete', message: 'Synchronization and SOP recalculation completed.', current: 4, progress: 100 })
        return workspace
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        publish({ status: 'failed', phase: 'failed', message: 'Synchronization failed.', error: message })
        throw error
      }
    })()
    syncJobs.set(action, job)
    try {
      return await job
    } finally {
      syncJobs.delete(action)
    }
  },

  async getDashboard(input?: { startDate?: string; endDate?: string; includeCreativeMetrics?: boolean }) {
    ensureSchedulerStateLoaded(this.schedulerState)
    const connections = gmvMaxRepo.listConnections()
    const campaigns = gmvMaxRepo.listCampaigns()
    const range = dashboardDateRange(input, 7)
    const campaignIds = campaigns.map((item) => item.id)
    const dailyMetrics = gmvMaxRepo.listMetricsRange(range.startDate, range.endDate, campaignIds)
    const profitData = profitDataSnapshot(range, campaignIds, {
      creativeMetrics: aggregatedCreativeMetricsForProfit(range, campaignIds),
      dailyMetrics,
    })
    const creativeMetrics = input?.includeCreativeMetrics === false ? [] : gmvMaxRepo.listCreativeMetricsRange(range.startDate, range.endDate, { campaignIds })
    const learningSnapshots = latestLearningSnapshots()
    const profitGuards = Object.fromEntries(campaigns.map((campaign) => [campaign.id, profitGuardFor(campaign, policyFor(campaign.id), profitData)]))
    const learningByCampaign = Object.fromEntries(learningSnapshots.map((item) => [item.campaignId, item]))
    const calibrations = strategyCalibrations()
    const creativeInsights = latestCreativeInsights()
    const recommendations = gmvMaxRepo.listRecentRecommendations(200)
    const recommendationCounts = gmvMaxRepo.recommendationStatusCounts()
    const pacing = pacingDiagnostics(campaigns)
    return {
      connection: activeConnection(), connections, bindings: [...profitData.bindingsById.values()], campaigns,
      dailyMetrics,
      recommendations, recommendationSummary: { pending: recommendationCounts.pending || 0, executed: recommendationCounts.executed || 0, failed: recommendationCounts.failed || 0 }, policies: campaigns.map((campaign) => policyFor(campaign.id)), audits: gmvMaxRepo.listRecentAudits(200),
      storeCosts: profitData.storeCosts, productCosts: [],
      creativeMetrics, creativeAssets: [], realtimeSamples: [], pacingDiagnostics: pacing,
      ruleGroups: gmvMaxRepo.listRuleGroups(), ruleBindings: gmvMaxRepo.listRuleBindings(), listEntries: [],
      sessions: [], backtests: gmvMaxRepo.listRecentBacktestSummaries(5), notifications: gmvMaxRepo.listRecentNotifications(100),
      learningSnapshots,
      actionOutcomes: [],
      strategyCalibrations: calibrations,
      creativeInsights: [],
      creativeInsightSummary: {
        total: creativeInsights.length,
        winners: creativeInsights.filter((item) => item.state === 'winner').length,
        fatigued: creativeInsights.filter((item) => item.state === 'fatigued').length,
        waste: creativeInsights.filter((item) => item.state === 'waste').length,
      },
      productInsights: [],
      profitGuards,
      portfolioPlans: latestPortfolioPlans(),
      storeProfitSummaries: buildGmvMaxStoreProfitSummaries({
        campaigns,
        metrics: dailyMetrics,
        profitGuards,
        learning: learningByCampaign,
        storeCosts: profitData.storeCosts,
        startDate: range.startDate,
        endDate: range.endDate,
      }),
      catalog: catalogStatus(),
      notificationConfig: gmvMaxRepo.listNotificationConfigs()[0] || null,
      scheduler: { ...this.schedulerState },
    }
  },

  async getCampaignWorkspace(input: { campaignId: string; startDate?: string; endDate?: string }) {
    const campaignId = text(input?.campaignId)
    const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === campaignId)
    if (!campaign) throw new Error('GMV MAX campaign does not exist.')
    const range = dashboardDateRange(input, 7)
    const profitData = profitDataSnapshot(range, [campaign.id])
    const policy = policyFor(campaign.id)
    const profitGuard = profitGuardFor(campaign, policy, profitData)
    const binding = profitData.bindingsById.get(campaign.bindingId) || null
    const learning = latestLearningSnapshots([campaign.id])[0] || null
    const pacing = pacingDiagnostics([campaign])[0] || null
    const creative = creativePage({ campaignId, startDate: range.startDate, endDate: range.endDate, page: 1, pageSize: 10, sortBy: 'grossRevenue', sortDirection: 'desc' })
    const products = productPage({ campaignId, startDate: range.startDate, endDate: range.endDate, page: 1, pageSize: 10, sortBy: 'grossRevenue', sortDirection: 'desc' })
    const productCosts = gmvMaxRepo.listProductCostsPage({ campaignId, page: 1, pageSize: 10, sortBy: 'productName', sortDirection: 'asc' })
    const actions = actionPage({ campaignId, startDate: range.startDate, endDate: range.endDate, page: 1, pageSize: 10, sortBy: 'createdAt', sortDirection: 'desc' })
    const creativeInsights = latestCreativeInsights([campaign.id])
    const recommendations = gmvMaxRepo.listRecommendations().filter((item) => item.campaignId === campaign.id)
    const creativeExperiment = buildGmvMaxCreativeExperiment({
      campaign,
      policy,
      profitGuard,
      insights: creativeInsights,
      assets: gmvMaxRepo.listCreativeAssetsForScope({ storeIds: [campaign.storeId], campaignIds: [campaign.id] }),
      recommendations,
      listEntries: gmvMaxRepo.listListEntriesForScope([campaign.storeId], [campaign.id]),
    })
    const creativeOutcomes = gmvMaxRepo.listActionOutcomes(campaign.id).filter((item) => item.actionType === 'creative').slice(0, 10)
    return {
      campaign,
      binding,
      policy,
      profitGuard,
      learning,
      pacing,
      dailyMetrics: (profitData.dailyMetricsByCampaign.get(campaign.id) || []).slice(-14),
      creative,
      products,
      productCosts,
      actions,
      creativeExperiment,
      creativeOutcomes,
    }
  },

  async getCampaignPage(input?: Parameters<typeof campaignDataPage>[0]) {
    return campaignDataPage(input)
  },

  async getCreativePage(input?: Parameters<typeof creativePage>[0]) {
    return creativePage(input)
  },

  async getProductPage(input?: Parameters<typeof productPage>[0]) {
    return productPage(input)
  },

  async getProductCostPage(input?: Parameters<typeof gmvMaxRepo.listProductCostsPage>[0]) {
    return gmvMaxRepo.listProductCostsPage(input)
  },

  async getListEntryPage(input?: Parameters<typeof gmvMaxRepo.listListEntriesPage>[0]) {
    return gmvMaxRepo.listListEntriesPage(input)
  },

  async getProductCost(input: { storeId: string; campaignId: string; productId: string }) {
    return gmvMaxRepo.resolveProductCost(text(input.storeId), text(input.campaignId), text(input.productId))
  },

  async exportProductCosts(input?: { storeId?: string; campaignId?: string; search?: string }) {
    const page = gmvMaxRepo.listProductCostsPage({ ...input, page: 1, pageSize: 100, sortBy: 'productName', sortDirection: 'asc' })
    const items = [...page.items]
    let currentPage = 2
    while (items.length < page.total) {
      const next = gmvMaxRepo.listProductCostsPage({ ...input, page: currentPage, pageSize: 100, sortBy: 'productName', sortDirection: 'asc' })
      if (!next.items.length) break
      items.push(...next.items)
      currentPage += 1
    }
    const header = ['storeId', 'campaignId', 'productId', 'productName', 'imageUrl', 'categoryName', 'inventory', 'skuCount', 'catalogMinPrice', 'catalogMaxPrice', 'sellingPrice', 'variants', 'currency', 'catalogStatus', 'gmvMaxAdsStatus', 'catalogSyncedAt', 'purchaseCost', 'firstMileCost', 'lastMileCost', 'warehousingCost', 'platformCommissionRate', 'creatorCommissionRate', 'expectedReturnRate', 'returnLossRate']
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    return [header.join(','), ...items.map((item) => header.map((key) => escape(key === 'variants' ? JSON.stringify(item.variants || []) : (item as any)[key])).join(','))].join('\r\n')
  },

  async importProductCosts(input: { csv: string; storeId?: string; campaignId?: string }) {
    const csv = String(input?.csv || '')
    if (!csv.trim()) throw new Error('GMV MAX product cost import is empty.')
    if (Buffer.byteLength(csv, 'utf8') > 10 * 1024 * 1024) throw new Error('GMV MAX product cost import exceeds 10 MB.')
    const workbook = XLSX.read(csv, { type: 'string' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('GMV MAX product cost import does not contain a worksheet.')
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false })
    if (!rows.length) throw new Error('GMV MAX product cost import does not contain data rows.')
    if (rows.length > 10_000) throw new Error('GMV MAX product cost import exceeds 10000 rows.')

    const campaigns = gmvMaxRepo.listCampaigns()
    const bindings = gmvMaxRepo.listBindings()
    const existingCosts = gmvMaxRepo.listProductCosts()
    const existingById = new Map(existingCosts.map((item) => [item.id, item]))
    const existingByScope = new Map(existingCosts.map((item) => [`${item.storeId}:${item.campaignId || 'store'}:${item.productId}`, item]))
    const now = Date.now()
    const items = rows.map((row, index): GmvMaxProductCost => {
      const rowNumber = index + 2
      const storeId = text(row.storeId) || text(input.storeId === 'all' ? '' : input.storeId)
      const campaignId = text(row.campaignId) || text(input.campaignId === 'all' ? '' : input.campaignId) || undefined
      const productId = text(row.productId)
      if (!storeId || !productId) throw new Error(`GMV MAX product cost row ${rowNumber} requires storeId and productId.`)
      const scope = resolveGmvMaxProductCostScope({ storeId, campaignId, campaigns, bindings })
      if (scope.error || !scope.binding) throw new Error(`GMV MAX product cost row ${rowNumber} is invalid: ${scope.error || 'scope is invalid.'}`)
      const cost: GmvMaxCostInput = {
        purchaseCost: text(row.purchaseCost),
        firstMileCost: text(row.firstMileCost),
        lastMileCost: text(row.lastMileCost),
        warehousingCost: text(row.warehousingCost),
        platformCommissionRate: text(row.platformCommissionRate),
        creatorCommissionRate: text(row.creatorCommissionRate),
        expectedReturnRate: text(row.expectedReturnRate),
        returnLossRate: text(row.returnLossRate),
      }
      const requestedId = text(row.id)
      const current = (requestedId ? existingById.get(requestedId) : undefined) || existingByScope.get(`${storeId}:${campaignId || 'store'}:${productId}`)
      let variants = current?.variants || []
      if (text(row.variants)) {
        let parsed: unknown
        try { parsed = JSON.parse(text(row.variants)) } catch { throw new Error(`GMV MAX product cost row ${rowNumber} contains invalid variants JSON.`) }
        if (!Array.isArray(parsed)) throw new Error(`GMV MAX product cost row ${rowNumber} variants must be a JSON array.`)
        variants = parsed.map((value, variantIndex) => {
          const variant = value && typeof value === 'object' ? value as Record<string, unknown> : {}
          const name = text(variant.name)
          const variantError = !name
            ? 'name is required.'
            : validateGmvMaxProductSellingPrice(variant.sellingPrice) || validateGmvMaxOptionalCostInput(variant as GmvMaxCostInput)
          if (variantError) throw new Error(`GMV MAX product cost row ${rowNumber} SKU ${variantIndex + 1} is invalid: ${variantError}`)
          return {
            id: text(variant.id) || hash(storeId, productId, name, variantIndex),
            name,
            skuId: text(variant.skuId) || undefined,
            sellerSku: text(variant.sellerSku) || undefined,
            sellingPrice: text(variant.sellingPrice),
            currency: text(variant.currency) || undefined,
            inventory: text(variant.inventory) || undefined,
            purchaseCost: text(variant.purchaseCost),
            firstMileCost: text(variant.firstMileCost),
            lastMileCost: text(variant.lastMileCost),
            warehousingCost: text(variant.warehousingCost),
            platformCommissionRate: text(variant.platformCommissionRate),
            creatorCommissionRate: text(variant.creatorCommissionRate),
            expectedReturnRate: text(variant.expectedReturnRate),
            returnLossRate: text(variant.returnLossRate),
          }
        })
      }
      const catalogMinPrice = text(row.catalogMinPrice) || current?.catalogMinPrice
      const catalogMaxPrice = text(row.catalogMaxPrice) || current?.catalogMaxPrice
      const skuCount = Number(row.skuCount) > 0 ? Math.trunc(Number(row.skuCount)) : current?.skuCount
      const hasMultipleSkus = Number(skuCount || 0) > 1
        || Boolean(catalogMinPrice && catalogMaxPrice && catalogMinPrice !== catalogMaxPrice)
      const costError = variants.length ? validateGmvMaxOptionalCostInput(cost) : validateGmvMaxCostInput(cost)
      const priceError = variants.length ? null : validateGmvMaxProductSellingPrice(row.sellingPrice)
      const validationError = costError || priceError
      if (validationError) throw new Error(`GMV MAX product cost row ${rowNumber} is invalid: ${validationError}`)
      if (hasMultipleSkus && !variants.length) throw new Error(`GMV MAX product cost row ${rowNumber} requires SKU-level discounted selling prices.`)
      const scopeChanged = current && (current.storeId !== storeId || current.productId !== productId || current.campaignId !== campaignId)
      return {
        ...cost,
        id: !scopeChanged && requestedId ? requestedId : hash(storeId, campaignId || 'store', productId),
        storeId,
        campaignId,
        productId,
        productName: text(row.productName) || current?.productName,
        imageUrl: text(row.imageUrl) || current?.imageUrl,
        categoryName: text(row.categoryName) || current?.categoryName,
        inventory: numberText(row.inventory, '') || current?.inventory,
        skuCount,
        catalogMinPrice,
        catalogMaxPrice,
        sellingPrice: text(row.sellingPrice),
        variants,
        currency: text(row.currency) || scope.binding.currency,
        catalogStatus: text(row.catalogStatus) || current?.catalogStatus,
        gmvMaxAdsStatus: text(row.gmvMaxAdsStatus) || current?.gmvMaxAdsStatus,
        catalogSyncedAt: Number(row.catalogSyncedAt) || current?.catalogSyncedAt,
        updatedAt: now + index,
      }
    })
    const duplicateKeys = new Set<string>()
    for (const item of items) {
      const key = `${item.storeId}:${item.campaignId || 'store'}:${item.productId}`
      if (duplicateKeys.has(key)) throw new Error(`GMV MAX product cost import contains a duplicate scope for product ${item.productId}.`)
      duplicateKeys.add(key)
    }
    gmvMaxRepo.saveProductCosts(items)
    return { imported: items.length }
  },

  async getActionPage(input?: Parameters<typeof actionPage>[0]) {
    return actionPage(input)
  },

  async getOutcomePage(input?: Parameters<typeof outcomePage>[0]) {
    return outcomePage(input)
  },

  async getAuditPage(input?: Parameters<typeof auditPage>[0]) {
    return auditPage(input)
  },

  async syncAll(options?: { recalculateSop?: boolean; onProgress?: (completed: number, total: number) => void }) {
    const connections = gmvMaxRepo.listConnections().filter((item) => item.state === 'connected')
    if (!connections.length) throw new Error('Connect TikTok for Business before syncing.')
    let successfulScopes = 0
    let successfulConnections = 0
    let firstError: unknown
    const discoveredBindings: GmvMaxAccountBinding[] = []
    for (const connection of connections) {
      try {
        const refreshedConnection = await refreshConnectionDiscovery(connection)
        discoveredBindings.push(...await syncBindings(refreshedConnection))
        successfulConnections += 1
      } catch (error) {
        firstError ||= error
        await saveConnectionState(connection.id, { lastError: error instanceof Error ? error.message : String(error) })
      }
    }
    const bindings = selectUniqueGmvMaxActiveBindings(discoveredBindings, true)
    if (!bindings.length && successfulConnections) successfulScopes = 1
    const synchronizedCatalogScopes = new Set<string>()
    let completedScopes = 0
    for (const binding of bindings) {
      try {
        const campaigns = await syncCampaignsForBinding(binding)
        await syncMetricsForBinding(binding, campaigns)
        const catalogScope = `${binding.advertiserId}:${binding.storeId}`
        if (!synchronizedCatalogScopes.has(catalogScope)) {
          await syncProductsForBinding(binding)
          await syncCreativeAssetsForBinding(binding)
          synchronizedCatalogScopes.add(catalogScope)
        }
        await syncCreativeMetricsForBinding(binding, campaigns)
        await syncSessionsForBinding(binding, campaigns)
        successfulScopes += 1
      } catch (error) {
        firstError ||= error
        compatibilityAudit(binding, 'full_sync', error)
      } finally {
        completedScopes += 1
        options?.onProgress?.(completedScopes, bindings.length)
      }
    }
    if (!successfulScopes && firstError) throw firstError
    const analyzedAt = Date.now()
    const campaigns = gmvMaxRepo.listCampaigns()
    const activeBindings = gmvMaxRepo.listBindings().filter((item) => item.active)
    const range = completedReportRangeForBindings(activeBindings, 30, analyzedAt)
    const profitData = profitDataSnapshot(range, campaigns.map((item) => item.id))
    measureLearningOutcomes(analyzedAt, campaigns, profitData)
    const learning = analyzeGrowth(campaigns, analyzedAt, profitData)
    analyzeAdvancedIntelligence(campaigns, learning, analyzedAt, profitData)
    if (options?.recalculateSop !== false) await recalculateSop(true)
    return await this.getDashboard()
  },

  async syncAccountsAndStores() {
    const connections = gmvMaxRepo.listConnections().filter((item) => item.state === 'connected')
    if (!connections.length) throw new Error('Connect TikTok for Business before syncing.')
    let successfulConnections = 0
    let firstError: unknown
    for (const connection of connections) {
      try {
        await syncBindings(await refreshConnectionDiscovery(connection))
        successfulConnections += 1
      } catch (error) {
        firstError ||= error
        await saveConnectionState(connection.id, { lastError: error instanceof Error ? error.message : String(error) })
      }
    }
    if (!successfulConnections && firstError) throw firstError
    return gmvMaxRepo.listBindings()
  },

  async syncCampaigns() {
    const bindings = gmvMaxRepo.listBindings().filter((item) => item.active)
    let synchronizedBindings = 0
    let firstError: unknown
    for (const binding of bindings) {
      try {
        await syncCampaignsForBinding(binding)
        synchronizedBindings += 1
      } catch (error) {
        firstError ||= error
        compatibilityAudit(binding, 'campaign_sync', error)
      }
    }
    if (!synchronizedBindings && firstError) throw firstError
    return gmvMaxRepo.listCampaigns()
  },

  async syncCatalogs(options?: { recalculateSop?: boolean; onProgress?: (completed: number, total: number) => void }) {
    const connectedIds = new Set(gmvMaxRepo.listConnections().filter((item) => item.state === 'connected').map((item) => item.id))
    const bindings = selectUniqueGmvMaxActiveBindings(gmvMaxRepo.listBindings().filter((item) => connectedIds.has(item.connectionId)), false)
    if (!bindings.length) throw new Error('Sync TikTok accounts and stores before syncing catalogs.')
    let synchronizedBindings = 0
    let firstError: unknown
    for (const [index, binding] of bindings.entries()) {
      try {
        await syncProductsForBinding(binding)
        await syncCreativeAssetsForBinding(binding)
        synchronizedBindings += 1
      } catch (error) {
        firstError ||= error
        compatibilityAudit(binding, 'catalog_sync', error)
      } finally {
        options?.onProgress?.(index + 1, bindings.length)
      }
    }
    if (!synchronizedBindings && firstError) throw firstError
    if (options?.recalculateSop !== false) await recalculateSop(true)
    return { ...catalogStatus(), synchronizedBindings, failedBindings: bindings.length - synchronizedBindings }
  },

  async getReport(campaignId: string) {
    if (!gmvMaxRepo.listCampaigns().some((item) => item.id === campaignId)) {
      throw new Error('GMV MAX campaign does not exist.')
    }
    return gmvMaxRepo.listMetrics(campaignId)
  },

  async syncRealtime() {
    const campaigns = gmvMaxRepo.listCampaigns()
    let synchronizedBindings = 0
    let firstError: unknown
    for (const binding of gmvMaxRepo.listBindings().filter((item) => item.active)) {
      try {
        await syncMetricsForBinding(binding, campaigns.filter((campaign) => campaign.bindingId === binding.id), true)
        synchronizedBindings += 1
      } catch (error) {
        firstError ||= error
        compatibilityAudit(binding, 'realtime_sync', error)
      }
    }
    if (!synchronizedBindings && firstError) throw firstError
    return await this.runRealtimeProtection()
  },

  async runRealtimeProtection(now = Date.now()) {
    const existing = new Set(gmvMaxRepo.listRecommendations().map((item) => item.id))
    const created: GmvMaxRecommendation[] = []
    const profitData = profitDataSnapshot()
    const bindings = new Map(gmvMaxRepo.listBindings().map((item) => [item.id, item]))
    const diagnostics = new Map(pacingDiagnostics(gmvMaxRepo.listCampaigns(), now).map((item) => [item.campaignId, item]))
    for (const campaign of gmvMaxRepo.listCampaigns()) {
      const policy = policyFor(campaign.id)
      const binding = bindings.get(campaign.bindingId)
      if (!binding) continue
      const lastExecuted = latestExecutedAt(campaign.id)
      if (lastExecuted && now - lastExecuted < policy.cooldownHours * 60 * 60 * 1000) continue
      const profitGuard = profitGuardFor(campaign, policy, profitData)
      const recommendation = evaluateGmvMaxRealtimeGuard({
        campaign,
        policy,
        samples: gmvMaxRepo.listRealtimeSamples(campaign.id),
        pacing: diagnostics.get(campaign.id),
        profitGuard,
        now,
      })
      if (!recommendation || existing.has(recommendation.id) || hasPendingChange(campaign.id)) continue
      if (recommendation.actionType === 'budget'
        && dailyBudgetChangePercent(binding, campaign.id, now) + 10 > policy.dailyBudgetChangeLimitPercent) continue
      const enriched = enrichRecommendationBusinessImpact(recommendation, profitGuard)
      gmvMaxRepo.saveRecommendation(enriched)
      created.push(enriched)
      if (enriched.autoExecutable && !this.schedulerState.emergencyStopped) await executeRecommendation(enriched)
    }
    return created
  },

  async verifyPendingActions(now = Date.now()) {
    for (const lock of gmvMaxRepo.listActionLocks().filter((item) => item.expiresAt <= now)) {
      const recommendation = gmvMaxRepo.listRecommendations().find((item) => item.idempotencyKey === lock.idempotencyKey)
      const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === lock.campaignId)
      const binding = campaign && gmvMaxRepo.listBindings().find((item) => item.id === campaign.bindingId)
      if (!recommendation || !campaign || !binding) { gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType); continue }
      if (['rejected', 'executed'].includes(recommendation.status) && lock.actionType !== 'creative' && lock.actionType !== 'session') {
        gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType)
        continue
      }
      try {
        if (lock.actionType === 'budget' || lock.actionType === 'roi' || lock.actionType === 'status') {
          const detail = await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_info_get', {
            advertiser_id: binding.advertiserId,
            campaign_id: campaign.id,
          })
          const actual = parseGmvMaxRemoteCampaignState(detail.data)
          const proposedMatches = matchesGmvMaxRemoteCampaignState({
            actionType: lock.actionType,
            actual,
            expectedBudget: recommendation.proposedBudget,
            expectedRoasBid: recommendation.proposedRoasBid,
            expectedOperationStatus: text(recommendation.actionPayload?.operationStatus),
            phase: 'after',
          })
          const originalMatches = matchesGmvMaxRemoteCampaignState({
            actionType: lock.actionType,
            actual,
            expectedBudget: recommendation.currentBudget,
            expectedRoasBid: recommendation.currentRoasBid,
            expectedOperationStatus: text(recommendation.rollbackPayload?.operationStatus, campaign.operationStatus),
            phase: 'before',
          })
          const audit = gmvMaxRepo.listAudits().find((item) => item.recommendationId === recommendation.id)
          if (proposedMatches) {
            const completedAt = Date.now()
            gmvMaxRepo.saveRecommendation({ ...recommendation, status: 'executed', writeAttempted: true, platformStateVerified: true, retryAllowed: false, remoteRequestId: recommendation.remoteRequestId || audit?.remoteRequestId, executedAt: completedAt, updatedAt: completedAt, lastError: undefined })
            gmvMaxRepo.saveCampaign({
              ...campaign,
              budget: actual.budget || campaign.budget,
              roasBid: actual.roasBid || campaign.roasBid,
              operationStatus: actual.operationStatus || campaign.operationStatus,
              raw: unwrap(detail.data),
              lastSyncedAt: completedAt,
            })
            if (audit) gmvMaxRepo.saveAudit({ ...audit, status: 'succeeded', afterSnapshot: unwrap(detail.data), responseSummary: { recoveredByVerification: true }, error: undefined, completedAt })
            startSopInterventionObservation(recommendation.id, completedAt)
            gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType)
            continue
          }
          if (originalMatches) {
            const message = recommendation.lastError || 'TikTok remote state remained unchanged after the write attempt.'
            gmvMaxRepo.saveRecommendation({ ...recommendation, status: 'failed', lastError: message, updatedAt: Date.now() })
            if (audit) gmvMaxRepo.saveAudit({ ...audit, status: 'failed', afterSnapshot: unwrap(detail.data), responseSummary: { remoteStateUnchanged: true }, error: message, completedAt: Date.now() })
            gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType)
            continue
          }
          gmvMaxRepo.saveRecommendation({ ...recommendation, status: 'failed', lastError: 'TikTok remote state diverged during action verification.', updatedAt: Date.now() })
          gmvMaxRepo.saveActionLock({ ...lock, expiresAt: now + 30 * 60_000, updatedAt: now })
          compatibilityAudit(binding, 'campaign_action_verification', new Error('TikTok remote state diverged during action verification.'))
          continue
        }
        const audit = gmvMaxRepo.listAudits().find((item) => item.recommendationId === recommendation.id)
        if (lock.actionType === 'creative') {
          const targets = creativeTargetsForAction(campaign, recommendation.actionPayload)
          const fallbackRange = completedReportRange(binding.timezone, 2, now)
          const currentLocalDate = zonedDateParts(binding.timezone, now).date
          const report = await gmvMaxMcpClient.call(binding.connectionId, 'gmv_max_report_get', buildGmvMaxCreativeVerificationRequest({
            advertiserId: binding.advertiserId,
            storeId: binding.storeId,
            campaign,
            targets,
            startDate: fallbackRange.endDate,
            endDate: currentLocalDate,
          }))
          const rows = findArray(report.data, ['list', 'rows', 'report_list'])
          const verification = verifyGmvMaxCreativeDelivery({ campaign, targets, rows, storeId: binding.storeId, now })
          if (verification.state === 'confirmed') {
            const verifiedAt = Date.now()
            gmvMaxRepo.saveRecommendation({ ...recommendation, platformStateVerified: true, retryAllowed: false, updatedAt: verifiedAt })
            if (audit) gmvMaxRepo.saveAudit({ ...audit, status: 'succeeded', responseSummary: { ...(audit.responseSummary || {}), deliveryVerification: verification }, error: undefined, completedAt: Date.now() })
            startSopInterventionObservation(recommendation.id, verifiedAt)
            gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType)
            continue
          }
          if (verification.state === 'pending' && now - recommendation.createdAt < 2 * 60 * 60_000) {
            gmvMaxRepo.saveActionLock({ ...lock, expiresAt: now + 10 * 60_000, updatedAt: now })
            if (audit) gmvMaxRepo.saveAudit({ ...audit, responseSummary: { ...(audit.responseSummary || {}), deliveryVerification: verification } })
            continue
          }
          const message = verification.state === 'pending' ? 'TikTok creative delivery status did not stabilize within two hours.' : verification.reason
          gmvMaxRepo.saveRecommendation({ ...recommendation, status: 'failed', lastError: message, updatedAt: now })
          if (audit) gmvMaxRepo.saveAudit({ ...audit, status: 'failed', responseSummary: { ...(audit.responseSummary || {}), deliveryVerification: verification }, error: message, completedAt: now })
          gmvMaxRepo.saveActionLock({ ...lock, expiresAt: now + 30 * 60_000, updatedAt: now })
          continue
        }
        if (lock.actionType === 'session') {
          const result = await gmvMaxMcpClient.call(binding.connectionId, 'campaign_gmv_max_session_list_get', { advertiser_id: binding.advertiserId, campaign_id: campaign.id })
          const rows = findArray(result.data, ['list', 'sessions', 'session_list'])
          const syncedAt = Date.now()
          const sessions = sessionSnapshotsFromRows(campaign.id, rows, syncedAt)
          for (const session of sessions) gmvMaxRepo.saveSession(session)
          const operation = text(recommendation.actionPayload?.operation, 'create').toLowerCase()
          const sessionId = matchingSessionId(rows, recommendation.actionPayload)
          const verification = verifyGmvMaxSessionState({ operation, sessionId, expectedBudget: text(recommendation.actionPayload?.budget), sessions })
          if (sessionId && !text(recommendation.actionPayload?.sessionId)) {
            recommendation.actionPayload = { ...recommendation.actionPayload, sessionId }
            if (operation === 'create') recommendation.rollbackPayload = { operation: 'delete', sessionId }
            gmvMaxRepo.saveRecommendation({ ...recommendation, updatedAt: syncedAt })
          }
          if (verification.state === 'confirmed') {
            gmvMaxRepo.saveRecommendation({ ...recommendation, platformStateVerified: true, retryAllowed: false, updatedAt: syncedAt })
            if (audit) gmvMaxRepo.saveAudit({ ...audit, status: 'succeeded', responseSummary: { ...(audit.responseSummary || {}), sessionVerification: verification, sessionId }, error: undefined, completedAt: syncedAt })
            startSopInterventionObservation(recommendation.id, syncedAt)
            gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType)
            continue
          }
          if (!sessionId && isGmvMaxSessionInputRejection(recommendation.lastError)) {
            const message = recommendation.lastError || verification.reason
            gmvMaxRepo.saveRecommendation({ ...recommendation, status: 'failed', platformStateVerified: true, retryAllowed: true, lastError: message, updatedAt: now })
            if (audit) gmvMaxRepo.saveAudit({ ...audit, status: 'failed', responseSummary: { ...(audit.responseSummary || {}), sessionVerification: verification, rejectedWithoutMutation: true }, error: message, completedAt: now })
            gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType)
            continue
          }
          if (verification.state === 'pending' && now - recommendation.createdAt < 60 * 60_000) {
            gmvMaxRepo.saveActionLock({ ...lock, expiresAt: now + 10 * 60_000, updatedAt: now })
            continue
          }
          gmvMaxRepo.saveRecommendation({ ...recommendation, status: 'failed', lastError: verification.reason, updatedAt: now })
          if (audit) gmvMaxRepo.saveAudit({ ...audit, status: 'failed', responseSummary: { ...(audit.responseSummary || {}), sessionVerification: verification, sessionId }, error: verification.reason, completedAt: now })
          gmvMaxRepo.saveActionLock({ ...lock, expiresAt: now + 30 * 60_000, updatedAt: now })
          continue
        }
        gmvMaxRepo.removeActionLock(lock.campaignId, lock.actionType)
      } catch (error) { compatibilityAudit(binding, `${lock.actionType}_action_verification`, error) }
    }
  },

  async runOptimization(now = Date.now(), force = false, campaignId?: string, scope: 'all' | 'creative' = 'all') {
    const campaigns = gmvMaxRepo.listCampaigns()
    if (campaignId && !campaigns.some((item) => item.id === campaignId)) throw new Error('GMV MAX campaign does not exist.')
    const scopedBindingIds = campaignId
      ? new Set(campaigns.filter((item) => item.id === campaignId).map((item) => item.bindingId))
      : undefined
    const activeBindings = gmvMaxRepo.listBindings().filter((item) => item.active && (!scopedBindingIds || scopedBindingIds.has(item.id)))
    const bindings = force ? activeBindings : activeBindings.filter((item) => evaluationDue(item, now))
    if (!bindings.length) return []
    const bindingIds = new Set(bindings.map((item) => item.id))
    const dueCampaigns = campaigns.filter((item) => bindingIds.has(item.bindingId) && (!campaignId || item.id === campaignId))
    const range = completedReportRangeForBindings(bindings, 30, now)
    const profitData = profitDataSnapshot(range, dueCampaigns.map((item) => item.id))
    measureLearningOutcomes(now, dueCampaigns, profitData)
    const learning = analyzeGrowth(dueCampaigns, now, profitData)
    const advanced = analyzeAdvancedIntelligence(dueCampaigns, learning, now, profitData)
    const policies = gmvMaxRepo.listPolicies()
    const calibrations = strategyCalibrations(now)
    const existing = new Set(gmvMaxRepo.listRecommendations().map((item) => item.id))
    const created: GmvMaxRecommendation[] = []
    let successfulBindings = 0
    let firstError: unknown
    for (const binding of bindings) {
      const localDate = zonedDateParts(binding.timezone, now).date
      const runId = hash(binding.id, localDate)
      gmvMaxRepo.saveOptimizationRun({ id: runId, bindingId: binding.id, localDate, status: 'started', createdAt: now })
      try {
        for (const campaign of dueCampaigns.filter((item) => item.bindingId === binding.id)) {
          const policy = { ...defaultGmvMaxPolicy(campaign.id), ...policies.find((item) => item.campaignId === campaign.id) }
          const profitGuard = profitGuardFor(campaign, policy, profitData)
          const lifecycle = analyzeGmvMaxLifecycle({
            campaign,
            policy,
            metrics: profitData.dailyMetricsByCampaign.get(campaign.id) || [],
            creativeMetrics: profitData.creativeMetricsByCampaign.get(campaign.id) || [],
            profitGuard,
            previous: latestLearningSnapshots().find((item) => item.campaignId === campaign.id),
            actionOutcomes: gmvMaxRepo.listActionOutcomes(campaign.id),
            now,
          })
          gmvMaxRepo.saveLearningSnapshot(lifecycle)
          if (!profitGuard.complete) {
            const alertId = hash(campaign.id, 'profit_guard', localDate)
            if (!gmvMaxRepo.listAudits().some((item) => item.id === alertId)) {
              gmvMaxRepo.saveAudit({
                id: alertId, connectionId: binding.connectionId, bindingId: binding.id, campaignId: campaign.id,
                action: 'profit_guard', status: 'failed', requestSummary: { effectiveRoiFloor: profitGuard.effectiveRoiFloor },
                error: profitGuard.reason || 'Profit guard is incomplete.', createdAt: now, completedAt: now,
              })
              void sendGmvMaxNotification('profit_guard', `GMV MAX profit automation is blocked for ${campaign.name}: ${profitGuard.reason || 'cost data is incomplete'}`)
            }
          }
          const pendingChange = hasPendingChange(campaign.id)
          const recommendation = evaluateGmvMaxCampaign({
            campaign,
            policy,
            metrics: profitData.dailyMetricsByCampaign.get(campaign.id) || [],
            expectedEndDate: completedReportRange(binding.timezone, 1, now).endDate,
            lastExecutedAt: latestExecutedAt(campaign.id),
            pendingChange,
            dailyBudgetChangePercent: dailyBudgetChangePercent(binding, campaign.id, now),
            now,
            profitGuard,
            lifecycle,
            calibrations: calibrations.filter((item) => item.campaignId === campaign.id),
            productInsights: advanced.productInsights.filter((item) => item.campaignId === campaign.id),
          })
          const creativeMetrics = profitData.creativeMetricsByCampaign.get(campaign.id) || []
          const rotationPlans = evaluateGmvMaxCreativeRotationPlan({
            campaign, policy, profitGuard, lifecycle,
            insights: advanced.insights.filter((item) => item.campaignId === campaign.id),
            assets: gmvMaxRepo.listCreativeAssetsForScope({ storeIds: [campaign.storeId], campaignIds: [campaign.id] }),
            listEntries: gmvMaxRepo.listListEntriesForScope([campaign.storeId], [campaign.id]), now,
          })
          const rotatingIds = new Set(rotationPlans.map((item) => text(item.actionPayload?.removeCreativeId)).filter(Boolean))
          const creativeGuards = evaluateGmvMaxCreativeGuard({
            campaign, policy, profitGuard,
            metrics: creativeMetrics,
            listEntries: gmvMaxRepo.listListEntriesForScope([campaign.storeId], [campaign.id]), now,
          }).filter((item) => !rotatingIds.has(text(item.actionPayload?.creativeId)))
          const creativeCandidates = [...rotationPlans, ...creativeGuards, evaluateGmvMaxSessionGuard({ campaign, policy, profitGuard, metrics: creativeMetrics, sessions: gmvMaxRepo.listSessions().filter((item) => item.campaignId === campaign.id), now })]
          const candidates = (scope === 'creative' ? creativeCandidates : [recommendation, ...creativeCandidates])
            .filter((item): item is GmvMaxRecommendation => Boolean(item))
            .filter((item) => !existing.has(item.id))
          const selectedCandidates = selectGmvMaxCampaignCandidates(candidates)
          if (!selectedCandidates.length) continue
          const enrichedCandidates = selectedCandidates.map((candidate) => enrichRecommendationBusinessImpact(candidate, profitGuard))
          for (const enriched of enrichedCandidates) {
            gmvMaxRepo.saveRecommendation(enriched)
            existing.add(enriched.id)
            created.push(enriched)
          }
          const primary = selectGmvMaxCampaignCandidate(enrichedCandidates)
          if (primary?.autoExecutable && !pendingChange && !this.schedulerState.emergencyStopped) await executeRecommendation(primary)
        }
        gmvMaxRepo.saveOptimizationRun({ id: runId, bindingId: binding.id, localDate, status: 'succeeded', createdAt: now, completedAt: Date.now() })
        successfulBindings += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        gmvMaxRepo.saveOptimizationRun({ id: runId, bindingId: binding.id, localDate, status: 'failed', createdAt: now, completedAt: Date.now(), error: message })
        firstError ||= error
      }
    }
    for (const plan of (scope === 'creative' ? [] : advanced.plans).filter((item) => item.autoExecutable && item.donorCampaignId && item.receiverCampaignId)) {
      if (this.schedulerState.emergencyStopped) break
      if (hasPendingChange(plan.donorCampaignId!) || hasPendingChange(plan.receiverCampaignId!)) continue
      await executePortfolioPlan(plan)
    }
    if (!successfulBindings && firstError) throw firstError
    return created
  },

  hasConnectedConnection() {
    return gmvMaxRepo.listConnections().some((item) => item.state === 'connected')
  },

  pendingRecoveryTaskCount() {
    return gmvMaxRepo.listActionLocks().length
  },

  async analyzeGrowth(now = Date.now()) {
    const campaigns = gmvMaxRepo.listCampaigns()
    const bindings = gmvMaxRepo.listBindings().filter((item) => item.active)
    const range = completedReportRangeForBindings(bindings, 30, now)
    const profitData = profitDataSnapshot(range, campaigns.map((item) => item.id))
    measureLearningOutcomes(now, campaigns, profitData)
    const learning = analyzeGrowth(campaigns, now, profitData)
    analyzeAdvancedIntelligence(campaigns, learning, now, profitData)
    return learning
  },

  async savePolicy(input: { campaignId: string; preset?: GmvMaxPolicyPreset; automationEnabled?: boolean; minRoi?: string; minOrders?: number; minCompleteDays?: number; cooldownHours?: number; dailyBudgetChangeLimitPercent?: number; promotionAutoExecutionEnabled?: boolean; targetCpa?: string; creativeTestBudget?: string; creativeExplorationSharePercent?: number; minExplorationCreatives?: number; winnerTrafficCapPercent?: number; profitSafetyMarginPercent?: number; budgetPermission?: boolean; roiPermission?: boolean; statusPermission?: boolean; creativePermission?: boolean; sessionPermission?: boolean; shadowMode?: boolean; pilotEnabled?: boolean; pauseOnZeroOrders?: boolean; decisionRules?: Partial<GmvMaxDecisionRuleConfig> }) {
    const current = policyFor(input.campaignId)
    if (input.shadowMode === false && Date.now() - Number(current.shadowStartedAt || Date.now()) < 7 * 24 * 60 * 60 * 1000) {
      throw new Error('Seven complete shadow days are required before live automation can be enabled.')
    }
    const next: GmvMaxPolicy = {
      ...current, ...input,
      minRoi: numberText(input.minRoi ?? current.minRoi, current.minRoi),
      minOrders: Math.max(1, Math.round(Number(input.minOrders ?? current.minOrders))),
      minCompleteDays: Math.max(3, Math.round(Number(input.minCompleteDays ?? current.minCompleteDays))),
      cooldownHours: Math.max(24, Math.round(Number(input.cooldownHours ?? current.cooldownHours))),
      dailyBudgetChangeLimitPercent: Math.max(1, Math.min(30, Math.round(Number(input.dailyBudgetChangeLimitPercent ?? current.dailyBudgetChangeLimitPercent)))),
      targetCpa: numberText(input.targetCpa ?? current.targetCpa, current.targetCpa),
      creativeTestBudget: numberText(input.creativeTestBudget ?? current.creativeTestBudget, current.creativeTestBudget),
      creativeExplorationSharePercent: Math.max(5, Math.min(30, Math.round(Number(input.creativeExplorationSharePercent ?? current.creativeExplorationSharePercent)))),
      minExplorationCreatives: Math.max(2, Math.min(10, Math.round(Number(input.minExplorationCreatives ?? current.minExplorationCreatives)))),
      winnerTrafficCapPercent: Math.max(50, Math.min(90, Math.round(Number(input.winnerTrafficCapPercent ?? current.winnerTrafficCapPercent)))),
      profitSafetyMarginPercent: Math.max(0, Math.min(100, Math.round(Number(input.profitSafetyMarginPercent ?? current.profitSafetyMarginPercent)))),
      automationEnabled: input.automationEnabled ?? current.automationEnabled,
      promotionAutoExecutionEnabled: input.promotionAutoExecutionEnabled ?? current.promotionAutoExecutionEnabled,
      budgetPermission: input.budgetPermission ?? current.budgetPermission,
      roiPermission: input.roiPermission ?? current.roiPermission,
      statusPermission: input.statusPermission ?? current.statusPermission,
      creativePermission: input.creativePermission ?? current.creativePermission,
      sessionPermission: input.sessionPermission ?? current.sessionPermission,
      shadowMode: input.shadowMode ?? current.shadowMode,
      pilotEnabled: input.pilotEnabled ?? current.pilotEnabled,
      pauseOnZeroOrders: input.pauseOnZeroOrders ?? current.pauseOnZeroOrders,
      decisionRules: input.decisionRules ? resolveGmvMaxDecisionRules(input.decisionRules) : current.decisionRules,
      updatedAt: Date.now(),
    }
    return gmvMaxRepo.savePolicy(next)
  },

  async saveStoreCost(input: Omit<GmvMaxStoreCost, 'id' | 'updatedAt'> & { id?: string }) {
    const binding = gmvMaxRepo.listBindings().find((item) => item.storeId === input.storeId && item.advertiserId === input.advertiserId)
    if (!binding) throw new Error('GMV MAX store binding does not exist.')
    const validationError = validateGmvMaxCostInput(input)
    if (validationError) throw new Error(`GMV MAX store cost is invalid: ${validationError}`)
    const currency = text(binding.currency).toUpperCase()
    const timezone = text(binding.timezone)
    if (!currency || !timezone) throw new Error('Synchronize the TikTok account currency and timezone before saving store costs.')
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    } catch {
      throw new Error('GMV MAX account timezone must be a valid IANA timezone.')
    }
    const existing = gmvMaxRepo.listStoreCosts().find((entry) => entry.id === input.id || (entry.storeId === input.storeId && entry.advertiserId === input.advertiserId))
    const normalizedCnyRate = ['CNY', 'RMB', 'CNH'].includes(text(currency).toUpperCase()) ? '1' : existing?.cnyExchangeRate
    if (normalizedCnyRate && parseGmvMaxExchangeRate(normalizedCnyRate) <= 0n) throw new Error('GMV MAX CNY exchange rate must be greater than zero.')
    const item: GmvMaxStoreCost = {
      ...input,
      currency,
      timezone,
      cnyExchangeRate: normalizedCnyRate,
      exchangeRateUpdatedAt: existing?.exchangeRateUpdatedAt,
      exchangeRateSource: existing?.exchangeRateSource,
      exchangeRateError: existing?.exchangeRateError,
      id: input.id || hash(input.connectionId, input.advertiserId, input.storeId),
      updatedAt: Date.now(),
    }
    const saved = gmvMaxRepo.saveStoreCost(item)
    return saved
  },

  async saveProductCost(input: Omit<GmvMaxProductCost, 'id' | 'updatedAt'> & { id?: string }) {
    if (!text(input.productId) || !text(input.storeId)) throw new Error('Store and product identifiers are required.')
    const campaignId = text(input.campaignId) || undefined
    const scope = resolveGmvMaxProductCostScope({
      storeId: text(input.storeId),
      campaignId,
      campaigns: gmvMaxRepo.listCampaigns(),
      bindings: gmvMaxRepo.listBindings(),
    })
    if (scope.error || !scope.binding) throw new Error(scope.error || 'GMV MAX product cost scope is invalid.')
    const variants = (input.variants || []).map((variant, index) => {
      const name = text(variant.name) || text(variant.sellerSku) || text(variant.skuId) || `SKU ${index + 1}`
      const sellingPrice = text(variant.sellingPrice)
      const validationError = (sellingPrice ? validateGmvMaxProductSellingPrice(sellingPrice) : null)
        || validateGmvMaxOptionalCostInput(variant)
      if (validationError) throw new Error(`GMV MAX product SKU ${index + 1} is invalid: ${validationError}`)
      return {
        ...variant,
        id: text(variant.id) || hash(input.storeId, input.productId, name, index),
        name,
        sellingPrice,
      }
    })
    const validationError = validateGmvMaxOptionalCostInput(input)
      || (text(input.sellingPrice) ? validateGmvMaxProductSellingPrice(input.sellingPrice) : null)
    if (validationError) throw new Error(`GMV MAX product cost is invalid: ${validationError}`)
    const existing = input.id ? gmvMaxRepo.listProductCosts().find((item) => item.id === input.id) : undefined
    const scopeChanged = existing && (existing.storeId !== input.storeId || existing.productId !== input.productId || existing.campaignId !== campaignId)
    const item: GmvMaxProductCost = {
      ...input,
      storeId: text(input.storeId),
      campaignId,
      productId: text(input.productId),
      productName: text(input.productName) || undefined,
      sellingPrice: text(input.sellingPrice),
      variants,
      currency: text(input.currency) || scope.binding.currency,
      id: !scopeChanged && input.id ? input.id : hash(input.storeId, campaignId || 'store', input.productId),
      updatedAt: Date.now(),
    }
    return gmvMaxRepo.saveProductCost(item)
  },

  async removeProductCost(id: string) { gmvMaxRepo.removeProductCost(id); return true },

  async saveRuleGroup(input: Partial<GmvMaxRuleGroup> & { name: string }) {
    const current = input.id ? gmvMaxRepo.listRuleGroups().find((item) => item.id === input.id) : undefined
    const item: GmvMaxRuleGroup = {
      id: current?.id || randomUUID(), name: text(input.name, 'Profit rule'), preset: input.preset || current?.preset || 'roi_guard',
      storeId: text(input.storeId || current?.storeId) || undefined,
      minRoi: numberText(input.minRoi ?? current?.minRoi, '1'), targetCpa: numberText(input.targetCpa ?? current?.targetCpa),
      creativeTestBudget: numberText(input.creativeTestBudget ?? current?.creativeTestBudget),
      profitSafetyMarginPercent: Math.max(0, Math.min(100, Math.round(Number(input.profitSafetyMarginPercent ?? current?.profitSafetyMarginPercent ?? 15)))), updatedAt: Date.now(),
      decisionRules: input.decisionRules ? resolveGmvMaxDecisionRules(input.decisionRules) : current?.decisionRules,
    }
    return gmvMaxRepo.saveRuleGroup(item)
  },

  async removeRuleGroup(id: string) { gmvMaxRepo.removeRuleGroup(id); return true },

  async bindRuleGroup(input: { campaignId: string; ruleGroupId: string }) {
    const group = gmvMaxRepo.listRuleGroups().find((item) => item.id === input.ruleGroupId)
    if (!group) throw new Error('GMV MAX rule group does not exist.')
    const campaign = gmvMaxRepo.listCampaigns().find((item) => item.id === input.campaignId)
    if (!campaign) throw new Error('GMV MAX campaign does not exist.')
    if (group.storeId && group.storeId !== campaign.storeId) throw new Error('GMV MAX rule group belongs to a different store.')
    gmvMaxRepo.removeRuleBindingsForCampaign(input.campaignId)
    const binding = gmvMaxRepo.saveRuleBinding({ id: hash(input.campaignId, input.ruleGroupId), campaignId: input.campaignId, ruleGroupId: input.ruleGroupId, updatedAt: Date.now() })
    await this.savePolicy({ campaignId: input.campaignId, preset: group.preset, minRoi: group.minRoi, targetCpa: group.targetCpa, creativeTestBudget: group.creativeTestBudget, profitSafetyMarginPercent: group.profitSafetyMarginPercent, decisionRules: group.decisionRules })
    return binding
  },

  async unbindRuleGroup(campaignId: string) {
    gmvMaxRepo.removeRuleBindingsForCampaign(campaignId)
    return true
  },

  async saveListEntry(input: Omit<GmvMaxListEntry, 'id' | 'updatedAt'> & { id?: string }) {
    for (const existing of gmvMaxRepo.listListEntries()) {
      if (existing.id !== input.id
        && existing.storeId === input.storeId
        && existing.campaignId === input.campaignId
        && existing.entityType === input.entityType
        && existing.entityId === input.entityId) {
        gmvMaxRepo.removeListEntry(existing.id)
      }
    }
    const item: GmvMaxListEntry = { ...input, id: input.id || hash(input.storeId, input.campaignId, input.entityType, input.entityId, input.mode), updatedAt: Date.now() }
    return gmvMaxRepo.saveListEntry(item)
  },

  async removeListEntry(id: string) { gmvMaxRepo.removeListEntry(id); return true },

  async runBacktest(input?: { campaignId?: string; days?: number }) {
    const days = Math.max(3, Math.min(30, Math.round(Number(input?.days || 30))))
    const campaigns = gmvMaxRepo.listCampaigns().filter((item) => !input?.campaignId || item.id === input.campaignId)
    const calibrations = strategyCalibrations()
    const profitData = profitDataSnapshot()
    let actionCount = 0
    let scaleUpCount = 0
    let scaleDownCount = 0
    let holdCount = 0
    let blockedCount = 0
    let stageTransitions = 0
    let productGateBlockCount = 0
    let productQualifiedDays = 0
    let productTestingDays = 0
    let productRiskDays = 0
    let productCostBlockedDays = 0
    let productEvidenceMissingDays = 0
    let projectedProfitDelta = 0n
    let startingBudget = '0'
    let endingBudget = '0'
    const details: Record<string, unknown> = {}
    for (const campaign of campaigns) {
      const policy = policyFor(campaign.id)
      const guard = profitGuardFor(campaign, policy, profitData)
      const metrics = (profitData.dailyMetricsByCampaign.get(campaign.id) || []).slice(-days)
      const binding = profitData.bindingsById.get(campaign.bindingId)
      const replay = replayGmvMaxStrategy({
        campaign,
        policy,
        metrics,
        creativeMetrics: profitData.creativeMetricsByCampaign.get(campaign.id) || [],
        profitGuard: guard,
        calibrations: calibrations.filter((item) => item.campaignId === campaign.id),
        productCosts: profitData.productCosts.filter((item) => item.storeId === campaign.storeId),
        storeCost: profitData.storeCosts.find((item) => item.storeId === campaign.storeId),
        listEntries: profitData.listEntries,
        currency: binding?.currency,
        days,
      })
      actionCount += replay.actionCount
      scaleUpCount += replay.scaleUpCount
      scaleDownCount += replay.scaleDownCount
      holdCount += replay.holdCount
      blockedCount += replay.blockedCount
      stageTransitions += replay.stageTransitions
      productGateBlockCount += replay.productGateBlockCount
      productQualifiedDays += replay.productQualifiedDays
      productTestingDays += replay.productTestingDays
      productRiskDays += replay.productRiskDays
      productCostBlockedDays += replay.productCostBlockedDays
      productEvidenceMissingDays += replay.productEvidenceMissingDays
      projectedProfitDelta += gmvMaxDecimal.parse(replay.projectedProfitDelta)
      if (campaigns.length === 1) {
        startingBudget = replay.startingBudget
        endingBudget = replay.endingBudget
      }
      details[campaign.id] = { profitGuard: guard, ...replay }
    }
    const endDate = isoDate(Date.now())
    const start = new Date(`${endDate}T00:00:00.000Z`); start.setUTCDate(start.getUTCDate() - days + 1)
    const result = {
      id: randomUUID(), campaignId: input?.campaignId, startDate: isoDate(start.getTime()), endDate,
      actionCount, scaleUpCount, scaleDownCount, holdCount, blockedCount, startingBudget, endingBudget,
      stageTransitions, productGateBlockCount, productQualifiedDays, productTestingDays, productRiskDays, productCostBlockedDays, productEvidenceMissingDays,
      projectedProfitDelta: gmvMaxDecimal.format(projectedProfitDelta), method: 'walk_forward_simulation' as const, simulationOnly: true, details, createdAt: Date.now(),
    }
    return gmvMaxRepo.saveBacktest(result)
  },

  async saveNotificationConfig(input: Partial<GmvMaxNotificationConfig>) {
    const current = gmvMaxRepo.listNotificationConfigs()[0]
    return gmvMaxRepo.saveNotificationConfig({ id: current?.id || 'default', enabled: input.enabled ?? current?.enabled ?? false, platform: 'feishu', target: text(input.target ?? current?.target) || undefined, dailySummaryEnabled: input.dailySummaryEnabled ?? current?.dailySummaryEnabled ?? true, updatedAt: Date.now() })
  },

  async sendDailySummary(now = Date.now()) {
    const config = gmvMaxRepo.listNotificationConfigs()[0]
    if (!config?.enabled || !config.dailySummaryEnabled) return false
    const bindings = gmvMaxRepo.listBindings().filter((item) => item.active)
    const campaigns = gmvMaxRepo.listCampaigns()
    const sentEvents = new Set(gmvMaxRepo.listNotifications().filter((item) => item.status === 'succeeded').map((item) => item.eventType))
    const stores = new Map<string, GmvMaxAccountBinding>()
    for (const binding of bindings) if (!stores.has(binding.storeId)) stores.set(binding.storeId, binding)
    let sent = false
    for (const [storeId, binding] of stores) {
      const local = zonedDateParts(binding.timezone, now)
      if (local.hour < 13) continue
      const eventType = `daily_summary:${storeId}:${local.date}`
      if (sentEvents.has(eventType)) continue
      const completedDate = completedReportRange(binding.timezone, 1, now).endDate
      const storeCampaigns = campaigns.filter((item) => item.storeId === storeId)
      const campaignIds = new Set(storeCampaigns.map((item) => item.id))
      const range = { startDate: completedDate, endDate: completedDate }
      const profitData = profitDataSnapshot(range, [...campaignIds])
      const profitGuards = Object.fromEntries(storeCampaigns.map((campaign) => [campaign.id, profitGuardFor(campaign, policyFor(campaign.id), profitData)]))
      const learning = Object.fromEntries(latestLearningSnapshots().filter((item) => campaignIds.has(item.campaignId)).map((item) => [item.campaignId, item]))
      const summary = buildGmvMaxStoreProfitSummaries({ campaigns: storeCampaigns, metrics: [...profitData.dailyMetricsByCampaign.values()].flat(), profitGuards, learning, storeCosts: profitData.storeCosts, days: 1 })[0]
      const storeCost = profitData.storeCosts.find((item) => item.storeId === storeId)
      const currency = text(storeCost?.currency || binding.currency).toUpperCase()
      const rate = ['CNY', 'RMB', 'CNH'].includes(currency) ? '1' : storeCost?.cnyExchangeRate
      const money = (value: string) => {
        const converted = convertGmvMaxMoneyToCny(value, rate)
        return converted === undefined ? 'CNY rate required' : `CNY ${converted}`
      }
      const actions = gmvMaxRepo.listRecommendations().filter((item) => campaignIds.has(item.campaignId) && zonedDateParts(binding.timezone, item.createdAt).date === local.date).length
      const failedActions = gmvMaxRepo.listAudits().filter((item) => item.campaignId && campaignIds.has(item.campaignId) && item.status === 'failed' && zonedDateParts(binding.timezone, item.createdAt).date === local.date).length
      const incompleteProfitGuards = Object.values(profitGuards).filter((item) => !item.complete).length
      const profit = summary?.profitEstimateAvailable && summary.coveragePercent === 100 ? money(summary.estimatedNetProfit) : 'unavailable until profit coverage is complete'
      await sendGmvMaxNotification(eventType, `GMV MAX daily summary for ${binding.storeName} on ${completedDate}: spend ${money(summary?.spend || '0')}, GMV ${money(summary?.grossRevenue || '0')}, profit ${profit}, ROI ${summary?.roi || '0'}, orders ${summary?.orders || '0'}, actions ${actions}, anomalies ${failedActions + incompleteProfitGuards}.`)
      sent = true
    }
    return sent
  },

  async rollbackAction(id: string) {
    const source = gmvMaxRepo.getRecommendation(id)
    if (!source?.reversible || !source.rollbackPayload) throw new Error('This action cannot be restored automatically.')
    if (source.status !== 'executed') throw new Error('Only an executed action can be restored.')
    const key = hash(source.idempotencyKey, 'rollback')
    const reverse: GmvMaxRecommendation = {
      ...source, id: key, idempotencyKey: key, status: 'approved', actionPayload: source.rollbackPayload,
      rollbackPayload: source.actionPayload, currentBudget: source.proposedBudget, proposedBudget: source.currentBudget,
      currentRoasBid: source.proposedRoasBid, proposedRoasBid: source.currentRoasBid,
      reason: `Restore action ${source.id}.`, autoExecutable: false, shadow: false, createdAt: Date.now(), updatedAt: Date.now(), executedAt: undefined, lastError: undefined,
    }
    gmvMaxRepo.saveRecommendation(reverse)
    return await executeRecommendation(reverse)
  },

  async approveRecommendation(id: string) {
    const item = gmvMaxRepo.getRecommendation(id)
    if (!item) throw new Error('GMV MAX recommendation does not exist.')
    if (item.status === 'executed') return item
    if (!['pending', 'approved'].includes(item.status) && !(item.status === 'failed' && item.retryAllowed)) throw new Error(`Recommendation cannot be approved from status ${item.status}.`)
    const now = Date.now()
    const campaign = gmvMaxRepo.listCampaigns().find((entry) => entry.id === item.campaignId)
    const actionPayload = item.actionType === 'session'
      && text(item.actionPayload?.operation, 'create').toLowerCase() === 'create'
      && campaign
      ? refreshGmvMaxCreativeBoostSchedule({ campaign, actionPayload: item.actionPayload || {}, now })
      : item.actionPayload
    const approved = gmvMaxRepo.saveRecommendation(promoteGmvMaxRecommendationToLive({ ...item, actionPayload }, now))
    return await executeRecommendation(approved)
  },

  async approveRecommendations(input: { ids: string[] }) {
    if (this.schedulerState.emergencyStopped) throw new Error('GMV MAX write operations are paused by the emergency stop.')
    const ids = [...new Set((input?.ids || []).map((item) => text(item)).filter(Boolean))]
    if (!ids.length || ids.length > 25) throw new Error('Select between 1 and 25 recommendations for batch approval.')
    const items = ids.map((id) => gmvMaxRepo.getRecommendation(id))
    if (items.some((item) => !item)) throw new Error('One or more GMV MAX recommendations do not exist.')
    const recommendations = items as GmvMaxRecommendation[]
    const risks = new Set(recommendations.map((item) => item.risk))
    if (risks.size !== 1) throw new Error('Batch approval requires recommendations with the same risk level.')
    if (recommendations.some((item) => !['pending', 'approved'].includes(item.status))) throw new Error('Batch approval only accepts pending recommendations.')
    const results: Array<{ id: string; status: 'succeeded' | 'failed'; error?: string }> = []
    for (const item of recommendations) {
      try {
        await this.approveRecommendation(item.id)
        results.push({ id: item.id, status: 'succeeded' })
      } catch (error) {
        results.push({ id: item.id, status: 'failed', error: error instanceof Error ? error.message : String(error) })
      }
    }
    return { total: results.length, succeeded: results.filter((item) => item.status === 'succeeded').length, failed: results.filter((item) => item.status === 'failed').length, items: results }
  },

  async rejectRecommendation(id: string) {
    const item = gmvMaxRepo.getRecommendation(id)
    if (!item) throw new Error('GMV MAX recommendation does not exist.')
    if (!['pending', 'failed'].includes(item.status)) return item
    gmvMaxRepo.removeActionLock(item.campaignId, item.actionType || 'budget')
    const rejectedAt = Date.now()
    const rejected = gmvMaxRepo.saveRecommendation({ ...item, status: 'rejected', updatedAt: rejectedAt })
    cancelSopInterventionForRecommendation(rejected.id, rejectedAt)
    return rejected
  },

  async approvePortfolioPlan(id: string) {
    const item = gmvMaxRepo.getPortfolioPlan(id)
    if (!item) throw new Error('GMV MAX portfolio plan does not exist.')
    if (item.status === 'executed') return item
    if (item.status !== 'proposed') throw new Error(`Portfolio plan cannot be approved from status ${item.status}.`)
    const approved = gmvMaxRepo.savePortfolioPlan({ ...item, status: 'approved', updatedAt: Date.now() })
    return await executePortfolioPlan(approved)
  },

  async rejectPortfolioPlan(id: string) {
    const item = gmvMaxRepo.getPortfolioPlan(id)
    if (!item) throw new Error('GMV MAX portfolio plan does not exist.')
    if (item.status !== 'proposed') return item
    return gmvMaxRepo.savePortfolioPlan({ ...item, status: 'rejected', updatedAt: Date.now() })
  },
}
