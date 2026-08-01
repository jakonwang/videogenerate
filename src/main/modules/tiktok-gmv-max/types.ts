export const GMV_MAX_SERVER_URL = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat'
export const GMV_MAX_CALLBACK_URL = 'http://127.0.0.1:17863/tiktok-gmv-max/oauth/callback'

export const GMV_MAX_REQUIRED_TOOLS = [
  'auth_advertiser_get',
  'gmv_max_store_list_get',
  'gmv_max_campaign_get',
  'campaign_gmv_max_info_get',
  'gmv_max_bid_recommend_get',
  'gmv_max_report_get',
  'gmv_max_identity_get',
  'gmv_max_video_get',
  'campaign_gmv_max_update',
] as const

export const GMV_MAX_CAPABILITY_TOOLS = {
  core_read: [
    'auth_advertiser_get',
    'gmv_max_store_list_get',
    'gmv_max_campaign_get',
    'campaign_gmv_max_info_get',
    'gmv_max_bid_recommend_get',
    'gmv_max_report_get',
  ],
  campaign_write: ['campaign_gmv_max_update'],
  product_read: ['store_product_get'],
  creative_read: ['gmv_max_identity_get', 'gmv_max_video_get'],
  creative_write: ['gmv_max_creative_update'],
  status_write: ['campaign_status_update'],
  session_read: ['campaign_gmv_max_session_list_get'],
  session_write: [
    'campaign_gmv_max_session_create',
    'campaign_gmv_max_session_update',
    'campaign_gmv_max_session_delete',
  ],
} as const

export const GMV_MAX_ALL_TOOLS = [...new Set(Object.values(GMV_MAX_CAPABILITY_TOOLS).flat())] as string[]

export type GmvMaxRequiredTool = (typeof GMV_MAX_REQUIRED_TOOLS)[number]
export type GmvMaxCampaignType = 'PRODUCT' | 'LIVE'
export type GmvMaxPolicyPreset = 'roi_guard' | 'balanced_growth' | 'gmv_growth'
export type GmvMaxConnectionState = 'disconnected' | 'authorizing' | 'connected' | 'expired' | 'error'
export type GmvMaxRecommendationStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed' | 'expired'
export type GmvMaxRecommendationKind = 'scale_up' | 'scale_down'
export type GmvMaxActionType = 'budget' | 'roi' | 'creative' | 'status' | 'session'
export type GmvMaxCapability = keyof typeof GMV_MAX_CAPABILITY_TOOLS
export type GmvMaxListMode = 'allow' | 'deny'
export type GmvMaxCreativeSource = 'owned' | 'affiliate' | 'product_card'
export type GmvMaxLifecycleStage = 'cold_start' | 'exploration' | 'validation' | 'scaling' | 'mature' | 'declining' | 'blocked'
export type GmvMaxCreativeState = 'new' | 'testing' | 'winner' | 'stable' | 'fatigued' | 'waste' | 'blocked'
export type GmvMaxSopTrack = 'new_product' | 'mature_product' | 'live'
export type GmvMaxMatureState = 'dormant_recovery' | 'diagnosis_required' | 'velocity_constrained' | 'scale_ready' | 'quality_decay' | 'competitive_decay' | 'growth_ceiling' | 'healthy_hold'
export type GmvMaxSopPhase = 'preparation' | 'cold_start' | 'scaling' | 'matrix' | 'factory' | 'steady' | 'recovery_diagnosis' | 'single_variable_repair' | 'controlled_scaling' | 'second_generation_creatives' | 'traffic_pool_expansion' | 'stable_operations'
export type GmvMaxSopStatus = 'active' | 'blocked' | 'paused' | 'completed'
export type GmvMaxSopTaskStatus = 'pending' | 'completed' | 'blocked' | 'superseded'
export type GmvMaxSyncAction = 'data' | 'catalog'
export type GmvMaxSyncStatus = 'running' | 'completed' | 'failed' | 'interrupted'
export type GmvMaxDecisionStatus = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7'
export type GmvMaxDecisionLifecycle = 'cold_start' | 'mature' | 'declining'
export type GmvMaxDecisionPriority = 'P0' | 'P1' | 'P2'
export type GmvMaxDecisionAction = 'collect_data' | 'hold' | 'roi_unlock' | 'stop_scaling' | 'creative_expansion' | 'conversion_repair' | 'product_expansion' | 'auto_budget' | 'max_delivery' | 'profit_protection' | 'rollback_roi'
export type GmvMaxExperimentState = 'draft' | 'pending_approval' | 'executing' | 'observing' | 'success' | 'failed' | 'neutral' | 'rollback_pending' | 'rolled_back' | 'cancelled'

export type GmvMaxDecisionRuleConfig = {
  version: string
  highRoiMultiplier: number
  lowBudgetUtilization: number
  scalingBudgetUtilization: number
  gmvPlateauPercent: number
  roiDecayPercent: number
  creativeConcentrationPercent: number
  healthWeights: {
    gmvGrowth: number
    roiHealth: number
    spendVelocity: number
    conversionRate: number
    creativeHealth: number
    budgetUtilization: number
  }
  roiExperiment: {
    stepReductionPercent: number
    minimumStepPercent: number
    maximumStepPercent: number
    maximumTotalReductionPercent: number
    observationDeliveryDays: number
    maximumNeutralExtensionDays: number
    cooldownHours: number
  }
}

export type GmvMaxDecisionSnapshot = {
  id: string
  sopInstanceId: string
  campaignId: string
  storeId: string
  productId?: string
  productName?: string
  productImageUrl?: string
  lifecycle: GmvMaxDecisionLifecycle
  status: GmvMaxDecisionStatus
  priority: GmvMaxDecisionPriority
  healthScore?: string
  healthCoverage: string
  targetRoi: string
  actualRoi: string
  breakEvenRoi: string
  marginalRoi?: string
  spend: string
  grossRevenue: string
  budgetUtilization?: string
  spendVelocity?: string
  creativeConcentration?: string
  recommendedAction: GmvMaxDecisionAction
  reasonCodes: string[]
  evidence: Record<string, string | number | boolean | undefined>
  confidence: number
  risk: 'low' | 'medium' | 'high'
  ruleVersion: string
  writeAllowed: boolean
  blockedReasons: string[]
  evaluatedAt: number
}

export type GmvMaxExperiment = {
  id: string
  sopInstanceId: string
  campaignId: string
  productId?: string
  recommendationId?: string
  rollbackRecommendationId?: string
  state: GmvMaxExperimentState
  ruleVersion: string
  baselineTargetRoi: string
  currentTargetRoi: string
  proposedTargetRoi: string
  cumulativeReductionPercent: string
  observationDeliveryDays: number
  neutralExtensionDays: number
  actionDate?: string
  preStartDate?: string
  preEndDate?: string
  postStartDate?: string
  postEndDate?: string
  preSpend?: string
  postSpend?: string
  preGmv?: string
  postGmv?: string
  preRoi?: string
  postRoi?: string
  marginalRoi?: string
  resultReasonCodes: string[]
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export type GmvMaxSopInstance = {
  id: string
  bindingId: string
  campaignId: string
  storeId: string
  campaignType: GmvMaxCampaignType
  productId?: string
  productName?: string
  startDate: string
  phase: GmvMaxSopPhase
  status: GmvMaxSopStatus
  currentDay: number
  blockers: string[]
  track?: GmvMaxSopTrack
  trackSource?: 'auto' | 'manual'
  trackOverrideReason?: string
  trackEvidence?: GmvMaxSopTrackEvidence
  matureState?: GmvMaxMatureState
  lastDeliveryDate?: string
  dataFreshness?: 'fresh' | 'stale' | 'missing'
  observationLockUntil?: string
  observationStartedDate?: string
  automationEnabled?: boolean
  automationMode?: 'diagnostic_only' | 'draft_actions'
  creationSource?: 'manual' | 'automatic'
  autoStartEvidence?: {
    reason: 'top_sales_product' | 'live_campaign'
    productId?: string
    grossRevenue?: string
    orders?: string
    spend?: string
    firstStatDate?: string
    lastStatDate?: string
    reportedDays?: number
  }
  lastAutomationAt?: number
  nextAutomationAt?: number
  lastAutomationResult?: string
  viewSnapshot?: {
    metrics: GmvMaxSopMetricSummary
    profitFloor: string
    targetRoi: string
    creativeGradeSummary: Record<'S' | 'A' | 'B' | 'C', number>
    updatedAt: number
  }
  createdAt: number
  updatedAt: number
}

export type GmvMaxSopTrackEvidence = {
  productAgeDays: number
  activeDeliveryDays: number
  cumulativeOrders: number
  matchedRules: Array<'age_30_days' | 'delivery_14_days' | 'orders_100'>
}

export type GmvMaxMatureBaseline = {
  startDate?: string
  endDate?: string
  reportedDays: number
  deliveryDays: number
  missingDays: number
  spend: string
  gmv: string
  orders: string
  roi: string
  cvr?: string
}

export type GmvMaxMatureAssessment = {
  id: string
  sopInstanceId: string
  campaignId: string
  productId?: string
  statDate: string
  state: GmvMaxMatureState
  lastReportDate?: string
  lastDeliveryDate?: string
  dataFreshness: 'fresh' | 'stale' | 'missing'
  reasons: string[]
  baseline30d: GmvMaxMatureBaseline
  recent7d: GmvMaxMatureBaseline
  previous7d: GmvMaxMatureBaseline
  healthScore?: string
  healthCoverage: string
  dataCoverage: string
  budgetUtilization?: string
  velocityIndex?: string
  recommendedAction: string
  writeActionsAllowed: boolean
  dataSources: Record<string, 'api' | 'csv' | 'manual' | 'derived' | 'missing'>
  createdAt: number
  updatedAt: number
}

export type GmvMaxSopIntervention = {
  id: string
  sopInstanceId: string
  campaignId: string
  productId?: string
  kind: 'budget' | 'roi' | 'creative' | 'status' | 'auto_budget' | 'max_delivery' | 'second_campaign' | 'promotion_schedule' | 'other'
  variable: string
  beforeValue?: string
  proposedValue?: string
  recommendationId?: string
  taskId?: string
  executionMode: 'approval' | 'manual_external'
  status: 'draft' | 'pending_verification' | 'observing' | 'completed' | 'cancelled'
  startedDate?: string
  requiredDeliveryDays: number
  observedDeliveryDays: number
  actualValue?: string
  completedAt?: number
  evidenceNote?: string
  screenshotRef?: string
  evidenceAttachment?: GmvMaxEvidenceAttachment
  verificationStatus?: 'pending' | 'verified' | 'mismatch'
  verificationSource?: 'api' | 'manual'
  verificationNote?: string
  verificationError?: string
  verifiedAt?: number
  outcome?: string
  outcomeMetrics?: GmvMaxSopInterventionOutcomeMetrics
  rollbackOfInterventionId?: string
  rollbackInterventionId?: string
  rollbackRecommendationId?: string
  rollbackTaskId?: string
  createdAt: number
  updatedAt: number
}

export type GmvMaxEvidenceAttachment = {
  path: string
  name: string
  size: number
  sha256: string
  importedAt: number
}

export type GmvMaxSopInterventionOutcomeMetrics = {
  before: GmvMaxSopInterventionPeriodMetrics
  after: GmvMaxSopInterventionPeriodMetrics
  roiChangePercent?: string
  spendChangePercent?: string
  orderChangePercent?: string
  verdict: 'improved' | 'stable' | 'declined' | 'measured'
}

export type GmvMaxSopInterventionPeriodMetrics = {
  deliveryDays: number
  spend: string
  gmv: string
  orders: string
  roi: string
}

export type GmvMaxSopTask = {
  id: string
  sopInstanceId: string
  campaignId: string
  localDate: string
  scheduledTime: string
  kind: 'data_review' | 'creative_review' | 'winner_variations' | 'ad_adjustment' | 'live_review' | 'daily_close' | 'external_operation' | 'sop_automation'
  title: string
  description: string
  executionMode: 'internal' | 'review' | 'manual_external'
  status: GmvMaxSopTaskStatus
  resolutionCode?: string
  evidence?: string
  priority?: GmvMaxDecisionPriority
  decisionSnapshotId?: string
  experimentId?: string
  recommendedAction?: GmvMaxDecisionAction
  completedAt?: number
  createdAt: number
  updatedAt: number
}

export type GmvMaxSopIssueResolution = {
  id: string
  sopInstanceId: string
  campaignId: string
  productId?: string
  code: string
  severity: 'must_fix' | 'recommended' | 'observing' | 'resolved'
  resolutionMode: 'internal_route' | 'approval' | 'manual_external' | 'manual_input' | 'wait_sync'
  actionTarget: 'profit' | 'supplemental' | 'creatives' | 'actions' | 'sync' | 'audit' | 'seller_center' | 'none'
  currentValue?: string
  targetValue?: string
  evidenceSource?: string
  taskId?: string
  interventionId?: string
  recommendationId?: string
  steps: string[]
  approvalRequired: boolean
  rollbackSupported: boolean
  manualCompletionAllowed: boolean
  priorityScore?: number
  productName?: string
  campaignName?: string
  storeName?: string
}

export type GmvMaxSopAutomationRun = {
  id: string
  sopInstanceId: string
  campaignId: string
  localDate: string
  state: string
  action: string
  decision?: string
  decisionContext?: string
  status: 'completed' | 'skipped' | 'failed'
  taskId?: string
  interventionId?: string
  recommendationId?: string
  message: string
  attempt?: number
  nextRetryAt?: number
  createdAt: number
  updatedAt: number
}

export type GmvMaxSupplementalMetric = {
  id: string
  campaignId: string
  storeId: string
  statDate: string
  productId?: string
  source: 'manual' | 'csv' | 'api'
  refundAmount?: string
  netGmv?: string
  liveUv?: string
  liveStayRate?: string
  productClicks?: string
  addToCart?: string
  orders?: string
  paidOrders?: string
  productBudget?: string
  targetRoi?: string
  intradaySpend?: string
  deliveryMode?: string
  autoBudgetEnabled?: boolean
  inventoryReady?: boolean
  liveReady?: boolean
  sourceUpdatedAt?: number
  staleAt?: number
  freshness?: 'fresh' | 'stale'
  updatedAt: number
}

export type GmvMaxSopEffectivenessSummary = {
  completed: number
  improved: number
  stable: number
  declined: number
  measured: number
  improvementRate: number
}

export type GmvMaxSopReminder = {
  id: string
  kind: 'verification' | 'observation' | 'stale_data'
  sopInstanceId: string
  campaignId: string
  message: string
  dueAt?: number
}

export type GmvMaxWinnerDna = {
  id: string
  sopInstanceId: string
  campaignId: string
  creativeId: string
  grade: 'S' | 'A' | 'B' | 'C'
  hook: string
  opening: string
  model: string
  scene: string
  product: string
  pacing: string
  offer: string
  cta: string
  sourceName?: string
  draftProjectId?: string
  draftStatus: 'pending' | 'created' | 'failed'
  draftError?: string
  draftAttempts?: number
  nextDraftRetryAt?: number
  createdAt: number
  updatedAt: number
}

export type GmvMaxSopCreativeVideo = {
  id: string
  sopInstanceId: string
  campaignId: string
  creativeId: string
  productId?: string
  name: string
  grade: 'S' | 'A' | 'B' | 'C'
  source: GmvMaxCreativeSource
  authorizationType?: string
  authorizationStatus?: string
  deliveryStatus?: string
  coverUrl?: string
  videoUrl?: string
  embedUrl?: string
  externalUrl?: string
  durationSeconds?: number
  reportingStartDate?: string
  reportingEndDate?: string
  freshness: 'fresh' | 'stale' | 'missing'
  syncedAt?: number
  performance: {
    available: boolean
    samples: number
    days: number
    spend?: string
    gmv?: string
    roi?: string
    orders?: string
    ctr?: string
    cvr?: string
    cpa?: string
    play2sRate?: string
    playDepth?: string
  }
  intelligence: {
    state: GmvMaxCreativeState
    score: number
    roiTrendPercent?: string
    ctrTrendPercent?: string
    signals: string[]
  }
  analysisCodes: string[]
}

export type GmvMaxSopMetricSummary = {
  spend: string
  gmv: string
  roi: string
  orders: string
  aov: string
  costPerOrder: string
  ctr: string
  cvr: string
  creativeExplorationRate: string
  winningCreativeCount: number
  liveUvToOrderCvr: string
  netGmv: string
  netRoi: string
  estimatedNetProfit: string
  liveScore?: string
  completeDays: number
  consecutiveProfitableDays: number
}

export type GmvMaxSopInstanceView = GmvMaxSopInstance & {
  metrics: GmvMaxSopMetricSummary
  campaignName: string
  campaignOperationStatus: string
  storeName: string
  productImageUrl?: string
  productCatalogStatus?: string
  profitFloor: string
  targetRoi: string
  creativeGradeSummary: Record<'S' | 'A' | 'B' | 'C', number>
  matureAssessment?: GmvMaxMatureAssessment
  activeIntervention?: GmvMaxSopIntervention
  protectedWinnerCount: number
  observationDaysRemaining: number
  issueResolutions: GmvMaxSopIssueResolution[]
}

export type GmvMaxSopWorkspace = {
  instances: GmvMaxSopInstanceView[]
  tasks: GmvMaxSopTask[]
  supplementalMetrics: GmvMaxSupplementalMetric[]
  winnerDna: GmvMaxWinnerDna[]
  creativeVideos: GmvMaxSopCreativeVideo[]
  matureAssessments: GmvMaxMatureAssessment[]
  interventions: GmvMaxSopIntervention[]
  automationRuns: GmvMaxSopAutomationRun[]
  latestSyncJob?: GmvMaxSyncProgress
  issueQueue: GmvMaxSopIssueResolution[]
  effectivenessSummary: GmvMaxSopEffectivenessSummary
  reminders: GmvMaxSopReminder[]
  freshnessSummary: { fresh: number; stale: number; missing: number }
  decisions: GmvMaxDecisionSnapshot[]
  experiments: GmvMaxExperiment[]
  decisionSummary: { total: number; p0: number; p1: number; p2: number; writeBlocked: number; activeExperiments: number }
  generatedAt: number
}

export type GmvMaxSyncProgress = {
  jobId: string
  action: GmvMaxSyncAction
  status: GmvMaxSyncStatus
  phase: string
  message: string
  current: number
  total: number
  progress: number
  error?: string
  startedAt: number
  updatedAt: number
}

export type GmvMaxOAuthSecrets = {
  clientInformation?: Record<string, unknown>
  tokens?: Record<string, unknown>
  codeVerifier?: string
  discoveryState?: Record<string, unknown>
  state?: string
}

export type GmvMaxConnection = {
  id: string
  name: string
  state: GmvMaxConnectionState
  serverUrl: string
  expiresAt?: number
  lastConnectedAt?: number
  lastError?: string
  missingTools: string[]
  capabilities?: Record<GmvMaxCapability, boolean>
  createdAt: number
  updatedAt: number
}

export type GmvMaxAccountBinding = {
  id: string
  connectionId: string
  advertiserId: string
  advertiserName: string
  currency?: string
  timezone?: string
  storeId: string
  storeName: string
  businessCenterId?: string
  campaignType: GmvMaxCampaignType
  active: boolean
  updatedAt: number
}

export type GmvMaxCampaign = {
  id: string
  bindingId: string
  advertiserId: string
  storeId: string
  name: string
  campaignType: GmvMaxCampaignType
  operationStatus: string
  budget: string
  roasBid: string
  promotionDaysEnabled: boolean
  scheduleStartTime?: string
  scheduleEndTime?: string
  lastSyncedAt: number
  raw: Record<string, unknown>
}

export type GmvMaxDailyMetric = {
  id: string
  campaignId: string
  advertiserId: string
  storeId: string
  campaignType: GmvMaxCampaignType
  statDate: string
  cost: string
  grossRevenue: string
  roi: string
  orders: string
  budgetUtilization: string
  raw: Record<string, unknown>
  syncedAt: number
}

export type GmvMaxPolicy = {
  campaignId: string
  preset: GmvMaxPolicyPreset
  automationEnabled: boolean
  minRoi: string
  minOrders: number
  minCompleteDays: number
  cooldownHours: number
  dailyBudgetChangeLimitPercent: number
  promotionAutoExecutionEnabled: boolean
  targetCpa: string
  creativeTestBudget: string
  creativeExplorationSharePercent: number
  minExplorationCreatives: number
  winnerTrafficCapPercent: number
  profitSafetyMarginPercent: number
  budgetPermission: boolean
  roiPermission: boolean
  statusPermission: boolean
  creativePermission: boolean
  sessionPermission: boolean
  shadowMode: boolean
  shadowStartedAt?: number
  pilotEnabled: boolean
  pauseOnZeroOrders: boolean
  decisionRules?: Partial<GmvMaxDecisionRuleConfig>
  updatedAt: number
}

export type GmvMaxCostInput = {
  purchaseCost: string
  firstMileCost: string
  lastMileCost: string
  warehousingCost: string
  platformCommissionRate: string
  creatorCommissionRate: string
  expectedReturnRate: string
  returnLossRate: string
}

export type GmvMaxStoreCost = GmvMaxCostInput & {
  id: string
  connectionId: string
  advertiserId: string
  storeId: string
  currency?: string
  timezone?: string
  cnyExchangeRate?: string
  exchangeRateUpdatedAt?: number
  exchangeRateSource?: string
  exchangeRateError?: string
  updatedAt: number
}

export type GmvMaxProductVariant = GmvMaxCostInput & {
  id: string
  name: string
  skuId?: string
  sellerSku?: string
  sellingPrice: string
  currency?: string
  inventory?: string
}

export type GmvMaxProductCost = GmvMaxCostInput & {
  id: string
  storeId: string
  campaignId?: string
  productId: string
  productName?: string
  imageUrl?: string
  categoryName?: string
  inventory?: string
  skuCount?: number
  sellingPrice: string
  catalogMinPrice?: string
  catalogMaxPrice?: string
  variants?: GmvMaxProductVariant[]
  currency?: string
  catalogStatus?: string
  gmvMaxAdsStatus?: string
  catalogSyncedAt?: number
  updatedAt: number
}

export type GmvMaxProfitGuard = {
  complete: boolean
  sellingPrice?: string
  sellingPriceSource?: 'product' | 'campaign' | 'observed'
  contributionMarginRate: string
  breakEvenRoi: string
  effectiveRoiFloor: string
  productCount?: number
  coveredProductCount?: number
  productCoveragePercent?: number
  uncoveredSpendShare?: string
  variantCount?: number
  coveredVariantCount?: number
  priceRangeMin?: string
  priceRangeMax?: string
  reason?: string
}

export type GmvMaxCreativeMetric = {
  id: string
  campaignId: string
  storeId: string
  creativeId: string
  itemId?: string
  itemGroupId?: string
  creativeName?: string
  source: GmvMaxCreativeSource
  statDate: string
  cost: string
  grossRevenue: string
  roi: string
  orders: string
  cpa: string
  ctr: string
  conversionRate?: string
  productImpressions?: string
  productClicks?: string
  play2sRate?: string
  playDepth: string
  play25Rate?: string
  play50Rate?: string
  play75Rate?: string
  play100Rate?: string
  status?: string
  raw: Record<string, unknown>
  syncedAt: number
}

export type GmvMaxCreativeAsset = {
  id: string
  campaignId?: string
  storeId: string
  creativeId: string
  kind: 'identity' | 'video' | 'product_card'
  name?: string
  status?: string
  raw: Record<string, unknown>
  syncedAt: number
}

export type GmvMaxRealtimeSample = {
  id: string
  campaignId: string
  statDate: string
  cost: string
  orders: string
  grossRevenue: string
  syncedAt: number
}

export type GmvMaxPacingState = 'normal' | 'overspend' | 'underspend' | 'unstable'

export type GmvMaxPacingDiagnostic = {
  campaignId: string
  timezone: string
  localDate: string
  localTime: string
  expectedSpendRatio: string
  actualSpendRatio: string
  paceRatio: string
  currentCost: string
  currentOrders: string
  currentGrossRevenue: string
  currentRoi: string
  state: GmvMaxPacingState
  dataStable: boolean
  reason: 'insufficient_samples' | 'sample_date_mismatch' | 'metrics_regressed' | 'sample_interval_invalid' | 'ahead_of_curve' | 'behind_curve' | 'within_curve'
  evaluatedAt: number
}

export type GmvMaxRuleGroup = {
  id: string
  name: string
  storeId?: string
  preset: GmvMaxPolicyPreset
  minRoi: string
  targetCpa: string
  creativeTestBudget: string
  profitSafetyMarginPercent: number
  decisionRules?: Partial<GmvMaxDecisionRuleConfig>
  updatedAt: number
}

export type GmvMaxRuleBinding = { id: string; ruleGroupId: string; campaignId: string; updatedAt: number }
export type GmvMaxListEntry = {
  id: string
  storeId: string
  campaignId?: string
  entityType: 'creative' | 'product'
  entityId: string
  label?: string
  mode: GmvMaxListMode
  updatedAt: number
}

export type GmvMaxSessionSnapshot = {
  id: string
  campaignId: string
  sessionId: string
  status: string
  budget: string
  startTime?: string
  endTime?: string
  raw: Record<string, unknown>
  syncedAt: number
}

export type GmvMaxActionLock = { campaignId: string; actionType: GmvMaxActionType; idempotencyKey: string; expiresAt: number; updatedAt: number }
export type GmvMaxBacktestResult = {
  id: string
  campaignId?: string
  startDate: string
  endDate: string
  actionCount: number
  scaleUpCount?: number
  scaleDownCount?: number
  holdCount?: number
  blockedCount: number
  startingBudget?: string
  endingBudget?: string
  stageTransitions?: number
  productGateBlockCount?: number
  productQualifiedDays?: number
  productTestingDays?: number
  productRiskDays?: number
  productCostBlockedDays?: number
  productEvidenceMissingDays?: number
  projectedProfitDelta: string
  method?: 'walk_forward_simulation'
  simulationOnly?: boolean
  details: Record<string, unknown>
  createdAt: number
}
export type GmvMaxStoreProfitSummary = {
  storeId: string
  startDate: string
  endDate: string
  campaignCount: number
  coveredCampaignCount: number
  coveragePercent: number
  spendCoveragePercent: number
  exchangeRateCoveragePercent: number
  spend: string
  grossRevenue: string
  orders: string
  roi: string
  profitEstimateAvailable: boolean
  profitSource: 'estimated' | 'settled' | 'unavailable'
  estimatedNetProfit: string
  settledNetProfit?: string
  profitMarginRate: string
  capitalEfficiency: string
  atRiskSpend: string
  testSpend: string
  scaleReadyCampaigns: number
  blockedReasons: string[]
}
export type GmvMaxLearningSnapshot = {
  id: string
  campaignId: string
  stage: GmvMaxLifecycleStage
  previousStage?: GmvMaxLifecycleStage
  confidence: number
  score: number
  daysObserved: number
  recentOrders: string
  recentRoi: string
  roiTrendPercent: string
  budgetUtilization: string
  profitFloor: string
  creativeCount: number
  winningCreativeCount: number
  measuredOutcomeCount: number
  successfulOutcomeCount: number
  signals: string[]
  recommendedFocus: 'collect_data' | 'test_creatives' | 'validate_profit' | 'scale_budget' | 'hold_efficiency' | 'recover_efficiency' | 'complete_costs'
  analyzedAt: number
}
export type GmvMaxActionOutcome = {
  id: string
  recommendationId: string
  campaignId: string
  actionType: 'budget' | 'roi' | 'creative'
  kind: GmvMaxRecommendationKind
  preStartDate: string
  preEndDate: string
  postStartDate: string
  postEndDate: string
  preRoi: string
  postRoi: string
  preRevenue: string
  postRevenue: string
  preSpend: string
  postSpend: string
  preEstimatedProfit: string
  postEstimatedProfit: string
  roiDeltaPercent: string
  profitDeltaPercent: string
  successful: boolean
  operation?: 'ADD' | 'REMOVE' | 'ROTATE'
  primaryCreativeId?: string
  comparisonCreativeId?: string
  preOrders?: string
  postOrders?: string
  preCtr?: string
  postCtr?: string
  preConversionRate?: string
  postConversionRate?: string
  prePlayDepth?: string
  postPlayDepth?: string
  measuredAt: number
}
export type GmvMaxStrategyCalibration = {
  campaignId: string
  kind: GmvMaxRecommendationKind
  source: 'campaign' | 'store' | 'preset' | 'none'
  sampleCount: number
  successCount: number
  successRate: number
  averageProfitDeltaPercent: string
  budgetStepMultiplier: number
  confidence: number
  state: 'learning' | 'conservative' | 'neutral' | 'accelerating'
  reason: 'insufficient_outcomes' | 'profit_feedback_positive' | 'profit_feedback_negative' | 'mixed_feedback'
  analyzedAt: number
}
export type GmvMaxCreativeInsight = {
  id: string
  campaignId: string
  storeId: string
  creativeId: string
  itemId?: string
  itemGroupId?: string
  creativeName?: string
  source: GmvMaxCreativeSource
  state: GmvMaxCreativeState
  score: number
  daysObserved: number
  lastActiveDate: string
  spend: string
  orders: string
  recentRoi: string
  previousRoi: string
  roiTrendPercent: string
  ctrTrendPercent: string
  signals: string[]
  analyzedAt: number
}
export type GmvMaxCreativeExperiment = {
  campaignId: string
  state: 'blocked' | 'supply_needed' | 'testing' | 'ready' | 'rotation_pending'
  measuredCreativeCount: number
  activeCreativeCount: number
  winnerCount: number
  testingCount: number
  fatiguedCount: number
  wasteCount: number
  targetPoolSize: number
  missingCreativeCount: number
  availableCandidateCount: number
  testBudget: string
  explorationBudget: string
  explorationSharePercent: number
  winnerTrafficCapPercent: number
  candidate?: { creativeId: string; name?: string; status?: string; syncedAt: number }
  retiring?: { creativeId: string; name?: string; state: GmvMaxCreativeState; score: number; recentRoi: string }
  pendingActionId?: string
  signals: string[]
  evaluatedAt: number
}
export type GmvMaxProductState = 'blocked' | 'cold_start' | 'testing' | 'winner' | 'scale_ready' | 'stable' | 'declining' | 'losing'
export type GmvMaxProductInsight = {
  id: string
  campaignId: string
  storeId: string
  productId: string
  productName?: string
  imageUrl?: string
  categoryName?: string
  inventory?: string
  skuCount?: number
  sellingPrice?: string
  actualSellingPriceMin?: string
  actualSellingPriceMax?: string
  currency?: string
  catalogStatus?: string
  gmvMaxAdsStatus?: string
  state: GmvMaxProductState
  score: number
  daysObserved: number
  creativeCount: number
  spend: string
  grossRevenue: string
  orders: string
  roi: string
  recentRoi: string
  previousRoi: string
  roiTrendPercent: string
  profitEstimateAvailable: boolean
  estimatedProfit: string
  profitFloor: string
  spendShare: string
  revenueShare: string
  allocationState: 'starved' | 'balanced' | 'overfunded' | 'blocked'
  recommendedAction: 'complete_costs' | 'collect_data' | 'test_creatives' | 'scale' | 'hold' | 'reduce' | 'exclude'
  protected: boolean
  signals: string[]
  analyzedAt: number
}
export type GmvMaxPortfolioPlan = {
  id: string
  storeId: string
  donorCampaignId?: string
  receiverCampaignId?: string
  status: 'proposed' | 'approved' | 'executing' | 'executed' | 'failed' | 'rejected' | 'blocked'
  transferAmount: string
  donorBudgetBefore: string
  donorBudgetAfter: string
  receiverBudgetBefore: string
  receiverBudgetAfter: string
  projectedProfitDelta: string
  confidence: number
  budgetConserved: boolean
  donorRoi?: string
  receiverRoi?: string
  receiverWinningCreatives?: number
  receiverFatiguedCreatives?: number
  evidenceEndDate: string
  reason: string
  autoExecutable: boolean
  analyzedAt: number
  updatedAt: number
  executedAt?: number
  lastError?: string
  rollbackApplied?: boolean
  remoteRequestIds?: string[]
}
export type GmvMaxNotificationConfig = { id: string; enabled: boolean; platform: 'feishu'; target?: string; dailySummaryEnabled: boolean; updatedAt: number }
export type GmvMaxNotificationRecord = { id: string; eventType: string; status: 'succeeded' | 'failed'; target?: string; message: string; error?: string; createdAt: number }

export type GmvMaxRecommendationEvidence = {
  startDate: string
  endDate: string
  metricIds: string[]
  consecutiveDays: number
  totalOrders: string
  averageRoi: string
  averageBudgetUtilization: string
  targetRoi: string
  recommendedBudget?: string
  recommendedRoasBid?: string
  dataFreshness: 'complete' | 'preliminary'
}

export type GmvMaxRecommendation = {
  id: string
  campaignId: string
  bindingId: string
  kind: GmvMaxRecommendationKind
  actionType?: GmvMaxActionType
  status: GmvMaxRecommendationStatus
  risk: 'low' | 'medium' | 'high'
  preset: GmvMaxPolicyPreset
  currentBudget: string
  proposedBudget: string
  currentRoasBid: string
  proposedRoasBid: string
  reason: string
  projectedGmvDelta?: string
  projectedNetProfitDelta?: string
  projectionSource?: 'modeled' | 'unavailable'
  confidence?: number
  blockedReasons?: string[]
  profitGuard?: GmvMaxProfitGuard
  lifecycle?: GmvMaxLearningSnapshot
  calibration?: GmvMaxStrategyCalibration
  actionPayload?: Record<string, unknown>
  reversible?: boolean
  rollbackPayload?: Record<string, unknown>
  shadow?: boolean
  originatedFromShadow?: boolean
  evidence: GmvMaxRecommendationEvidence
  autoExecutable: boolean
  idempotencyKey: string
  createdAt: number
  updatedAt: number
  executedAt?: number
  lastError?: string
  writeAttempted?: boolean
  platformStateVerified?: boolean
  retryAllowed?: boolean
  remoteRequestId?: string
}

export type GmvMaxSchedulerState = {
  running: boolean
  emergencyStopped: boolean
  pausedReason?: string
  lastRunAt?: number
  lastSuccessfulRunAt?: number
  nextRunAt?: number
  consecutiveFailures: number
  recoveryTaskCount: number
  lastError?: string
  updatedAt: number
}

export type GmvMaxAuditRecord = {
  id: string
  connectionId: string
  bindingId?: string
  campaignId?: string
  recommendationId?: string
  action: string
  status: 'started' | 'succeeded' | 'failed'
  requestSummary: Record<string, unknown>
  responseSummary?: Record<string, unknown>
  beforeSnapshot?: Record<string, unknown>
  afterSnapshot?: Record<string, unknown>
  remoteRequestId?: string
  error?: string
  createdAt: number
  completedAt?: number
}

export type GmvMaxDashboard = {
  connection: GmvMaxConnection | null
  connections: GmvMaxConnection[]
  bindings: GmvMaxAccountBinding[]
  campaigns: GmvMaxCampaign[]
  dailyMetrics: GmvMaxDailyMetric[]
  recommendations: GmvMaxRecommendation[]
  policies: GmvMaxPolicy[]
  audits: GmvMaxAuditRecord[]
  storeCosts: GmvMaxStoreCost[]
  productCosts: GmvMaxProductCost[]
  creativeMetrics: GmvMaxCreativeMetric[]
  creativeAssets: GmvMaxCreativeAsset[]
  realtimeSamples: GmvMaxRealtimeSample[]
  pacingDiagnostics: GmvMaxPacingDiagnostic[]
  ruleGroups: GmvMaxRuleGroup[]
  ruleBindings: GmvMaxRuleBinding[]
  listEntries: GmvMaxListEntry[]
  sessions: GmvMaxSessionSnapshot[]
  backtests: GmvMaxBacktestResult[]
  learningSnapshots: GmvMaxLearningSnapshot[]
  actionOutcomes: GmvMaxActionOutcome[]
  strategyCalibrations: GmvMaxStrategyCalibration[]
  creativeInsights: GmvMaxCreativeInsight[]
  creativeInsightSummary?: { total: number; winners: number; fatigued: number; waste: number }
  productInsights: GmvMaxProductInsight[]
  profitGuards: Record<string, GmvMaxProfitGuard>
  portfolioPlans: GmvMaxPortfolioPlan[]
  storeProfitSummaries: GmvMaxStoreProfitSummary[]
  notifications: GmvMaxNotificationRecord[]
  notificationConfig: GmvMaxNotificationConfig | null
  scheduler: GmvMaxSchedulerState
}

export type GmvMaxOptimizationInput = {
  campaign: GmvMaxCampaign
  policy: GmvMaxPolicy
  metrics: GmvMaxDailyMetric[]
  lastExecutedAt?: number
  pendingChange?: boolean
  dailyBudgetChangePercent?: number
  expectedEndDate?: string
  now?: number
  profitGuard?: GmvMaxProfitGuard
  lifecycle?: GmvMaxLearningSnapshot
  calibrations?: GmvMaxStrategyCalibration[]
  productInsights?: GmvMaxProductInsight[]
}

export type GmvMaxOptimizationRun = {
  id: string
  bindingId: string
  localDate: string
  status: 'started' | 'succeeded' | 'failed'
  createdAt: number
  completedAt?: number
  error?: string
}
