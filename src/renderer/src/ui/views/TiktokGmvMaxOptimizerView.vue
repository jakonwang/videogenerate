<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import GmvMaxHelpCenter from "../components/gmv-max/GmvMaxHelpCenter.vue";
import GmvMaxControlTowerNav, {
  type GmvMaxNavItem,
} from "../components/gmv-max/GmvMaxControlTowerNav.vue";
import {
  Activity,
  BarChart3,
  Check,
  ClipboardCheck,
  Link2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Store,
  Unlink,
  X,
  DollarSign,
  Film,
  Gavel,
  RotateCcw,
  Plus,
  Download,
  Upload,
  Search,
  SlidersHorizontal,
  Trash2,
  Pencil,
  ChevronRight,
  CircleDollarSign,
  Zap,
  PlayCircle,
  PauseCircle,
  LockKeyhole,
  Bell,
  Target,
  ShieldAlert,
  CheckCircle2,
  Filter,
  ArrowUpRight,
  Save,
  Gauge,
  TrendingUp,
  Users,
  Clock3,
  ArrowRightLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ImageOff,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  CalendarRange,
  FileSpreadsheet,
  Dna,
  Rocket,
  ExternalLink,
  ChevronDown,
  Copy,
  Package,
  BookOpen,
  Database,
} from "lucide-vue-next";

type TabId =
  | "overview"
  | "sop"
  | "campaigns"
  | "growth"
  | "rules"
  | "creatives"
  | "profit"
  | "actions"
  | "audit"
  | "settings"
  | "help";
type SyncActionId = "sync" | "sync-catalogs";
type SyncProgressState = {
  jobId?: string;
  action: "data" | "catalog";
  status: "running" | "completed" | "failed" | "interrupted";
  phase: string;
  message: string;
  current: number;
  total: number;
  progress: number;
  error?: string;
  startedAt?: number;
  updatedAt?: number;
};
type PolicyPreset = "roi_guard" | "balanced_growth" | "gmv_growth";
type Connection = {
  id: string;
  name: string;
  state: string;
  expiresAt?: number;
  missingTools: string[];
  capabilities?: Record<string, boolean>;
  lastError?: string;
};
type Binding = {
  id: string;
  connectionId: string;
  advertiserId: string;
  advertiserName: string;
  currency?: string;
  storeId: string;
  storeName: string;
  timezone?: string;
  campaignType: "PRODUCT" | "LIVE";
};
type Campaign = {
  id: string;
  bindingId: string;
  storeId: string;
  name: string;
  campaignType: "PRODUCT" | "LIVE";
  operationStatus: string;
  budget: string;
  roasBid: string;
  promotionDaysEnabled: boolean;
  lastSyncedAt: number;
};
type CampaignPageItem = Campaign & {
  binding: Binding | null;
  metrics: {
    cost: number;
    revenue: number;
    orders: number;
    roi: number;
    utilization: number;
    samples: number;
  };
  pacing: PacingDiagnostic | null;
  policy: Policy;
  profitGuard: ProfitGuard;
  learning: LearningSnapshot | null;
  recommendationCount: number;
};
type CampaignDataPage = {
  items: CampaignPageItem[];
  total: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  summary: { cost: number; revenue: number; orders: number };
};
type DailyMetric = {
  id: string;
  campaignId: string;
  storeId: string;
  statDate: string;
  cost: string;
  grossRevenue: string;
  roi: string;
  orders: string;
  budgetUtilization: string;
  syncedAt: number;
};
type PacingDiagnostic = {
  campaignId: string;
  timezone: string;
  localDate: string;
  localTime: string;
  expectedSpendRatio: string;
  actualSpendRatio: string;
  paceRatio: string;
  currentCost: string;
  currentOrders: string;
  currentGrossRevenue: string;
  currentRoi: string;
  state: "normal" | "overspend" | "underspend" | "unstable";
  dataStable: boolean;
  reason: string;
  evaluatedAt: number;
};
type Policy = {
  campaignId: string;
  preset: PolicyPreset;
  automationEnabled: boolean;
  minRoi: string;
  promotionAutoExecutionEnabled: boolean;
  targetCpa: string;
  creativeTestBudget: string;
  creativeExplorationSharePercent: number;
  minExplorationCreatives: number;
  winnerTrafficCapPercent: number;
  profitSafetyMarginPercent: number;
  budgetPermission: boolean;
  roiPermission: boolean;
  statusPermission: boolean;
  creativePermission: boolean;
  sessionPermission: boolean;
  shadowMode: boolean;
  pilotEnabled: boolean;
  pauseOnZeroOrders: boolean;
};
type CostFields = {
  purchaseCost: string;
  firstMileCost: string;
  lastMileCost: string;
  warehousingCost: string;
  platformCommissionRate: string;
  creatorCommissionRate: string;
  expectedReturnRate: string;
  returnLossRate: string;
};
type StoreCost = CostFields & {
  id: string;
  connectionId: string;
  advertiserId: string;
  storeId: string;
  currency?: string;
  timezone?: string;
  cnyExchangeRate?: string;
  exchangeRateUpdatedAt?: number;
  exchangeRateSource?: string;
  exchangeRateError?: string;
};
type ProductVariant = CostFields & {
  id: string;
  name: string;
  skuId?: string;
  sellerSku?: string;
  sellingPrice: string;
  currency?: string;
  inventory?: string;
};
type ProductCost = CostFields & {
  id: string;
  storeId: string;
  campaignId?: string;
  productId: string;
  productName?: string;
  imageUrl?: string;
  categoryName?: string;
  inventory?: string;
  skuCount?: number;
  sellingPrice: string;
  catalogMinPrice?: string;
  catalogMaxPrice?: string;
  variants?: ProductVariant[];
  currency?: string;
  catalogStatus?: string;
  gmvMaxAdsStatus?: string;
  catalogSyncedAt?: number;
};
type CreativeMetric = {
  id: string;
  campaignId: string;
  storeId: string;
  creativeId: string;
  itemId?: string;
  itemGroupId?: string;
  creativeName?: string;
  source: string;
  statDate: string;
  cost: string;
  grossRevenue: string;
  roi: string;
  orders: string;
  cpa: string;
  ctr: string;
  conversionRate?: string;
  productImpressions?: string;
  productClicks?: string;
  play2sRate?: string;
  playDepth: string;
  play25Rate?: string;
  play50Rate?: string;
  play75Rate?: string;
  play100Rate?: string;
  status?: string;
  raw?: Record<string, unknown>;
};
type CreativePerformance = CreativeMetric & {
  campaignName: string;
  days: number;
  creatorName: string;
  productName: string;
  authorizationType: string;
  authorizationStatus: string;
  conversionRate: string;
  play2sRate: string;
  label: "winner" | "testing" | "waste" | "watch";
  intelligenceState: CreativeInsight["state"];
  intelligenceScore: number;
  intelligenceRoiTrend: string;
};
type CreativePage = {
  items: CreativePerformance[];
  total: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  summary: { cost: number; revenue: number; orders: number; roi: number };
};
type CreativeInsight = {
  id: string;
  campaignId: string;
  creativeId: string;
  state:
    "new" | "testing" | "winner" | "stable" | "fatigued" | "waste" | "blocked";
  score: number;
  recentRoi: string;
  previousRoi: string;
  roiTrendPercent: string;
  ctrTrendPercent: string;
  signals: string[];
  analyzedAt: number;
};
type CreativeExperiment = {
  campaignId: string;
  state: "blocked" | "supply_needed" | "testing" | "ready" | "rotation_pending";
  measuredCreativeCount: number;
  activeCreativeCount: number;
  winnerCount: number;
  testingCount: number;
  fatiguedCount: number;
  wasteCount: number;
  targetPoolSize: number;
  missingCreativeCount: number;
  availableCandidateCount: number;
  testBudget: string;
  explorationBudget: string;
  explorationSharePercent: number;
  winnerTrafficCapPercent: number;
  candidate?: {
    creativeId: string;
    name?: string;
    status?: string;
    syncedAt: number;
  };
  retiring?: {
    creativeId: string;
    name?: string;
    state: CreativeInsight["state"];
    score: number;
    recentRoi: string;
  };
  pendingActionId?: string;
  signals: string[];
  evaluatedAt: number;
};
type ProductInsight = {
  id: string;
  campaignId: string;
  storeId: string;
  productId: string;
  productName?: string;
  imageUrl?: string;
  categoryName?: string;
  inventory?: string;
  skuCount?: number;
  sellingPrice?: string;
  actualSellingPriceMin?: string;
  actualSellingPriceMax?: string;
  currency?: string;
  catalogStatus?: string;
  gmvMaxAdsStatus?: string;
  state:
    | "blocked"
    | "cold_start"
    | "testing"
    | "winner"
    | "scale_ready"
    | "stable"
    | "declining"
    | "losing";
  score: number;
  daysObserved: number;
  creativeCount: number;
  spend: string;
  grossRevenue: string;
  orders: string;
  roi: string;
  recentRoi: string;
  previousRoi: string;
  roiTrendPercent: string;
  profitEstimateAvailable: boolean;
  estimatedProfit: string;
  profitFloor: string;
  spendShare: string;
  revenueShare: string;
  allocationState: "starved" | "balanced" | "overfunded" | "blocked";
  recommendedAction:
    | "complete_costs"
    | "collect_data"
    | "test_creatives"
    | "scale"
    | "hold"
    | "reduce"
    | "exclude";
  protected: boolean;
  signals: string[];
  analyzedAt: number;
};
type ProductPage = {
  items: ProductInsight[];
  total: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  summary: {
    spend: number;
    revenue: number;
    orders: number;
    estimatedProfit: number;
    roi: number;
    scaleReady: number;
    testing: number;
    atRisk: number;
    costBlocked: number;
  };
};
type ProductCostPage = {
  items: ProductCost[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    campaignOverrides: number;
    storeDefaults: number;
    complete: number;
    incomplete: number;
  };
};
type PortfolioPlan = {
  id: string;
  storeId: string;
  donorCampaignId?: string;
  receiverCampaignId?: string;
  status:
    | "proposed"
    | "approved"
    | "executing"
    | "executed"
    | "failed"
    | "rejected"
    | "blocked";
  transferAmount: string;
  donorBudgetBefore: string;
  donorBudgetAfter: string;
  receiverBudgetBefore: string;
  receiverBudgetAfter: string;
  projectedProfitDelta: string;
  confidence: number;
  budgetConserved: boolean;
  evidenceEndDate: string;
  reason: string;
  autoExecutable: boolean;
  analyzedAt: number;
  lastError?: string;
  rollbackApplied?: boolean;
};
type StoreProfitSummary = {
  storeId: string;
  startDate: string;
  endDate: string;
  campaignCount: number;
  coveredCampaignCount: number;
  coveragePercent: number;
  spendCoveragePercent: number;
  exchangeRateCoveragePercent: number;
  spend: string;
  grossRevenue: string;
  orders: string;
  roi: string;
  profitEstimateAvailable: boolean;
  profitSource: "estimated" | "settled" | "unavailable";
  estimatedNetProfit: string;
  settledNetProfit?: string;
  profitMarginRate: string;
  capitalEfficiency: string;
  atRiskSpend: string;
  testSpend: string;
  scaleReadyCampaigns: number;
  blockedReasons: string[];
};
type ProfitGuard = {
  complete: boolean;
  contributionMarginRate: string;
  breakEvenRoi: string;
  effectiveRoiFloor: string;
  productCount?: number;
  coveredProductCount?: number;
  productCoveragePercent?: number;
  uncoveredSpendShare?: string;
  reason?: string;
};
type Backtest = {
  id: string;
  campaignId?: string;
  startDate: string;
  endDate: string;
  actionCount: number;
  scaleUpCount?: number;
  scaleDownCount?: number;
  holdCount?: number;
  blockedCount: number;
  startingBudget?: string;
  endingBudget?: string;
  stageTransitions?: number;
  productGateBlockCount?: number;
  productQualifiedDays?: number;
  productTestingDays?: number;
  productRiskDays?: number;
  productCostBlockedDays?: number;
  productEvidenceMissingDays?: number;
  projectedProfitDelta: string;
  details?: Record<string, unknown>;
  createdAt: number;
};
type RuleGroup = {
  id: string;
  name: string;
  storeId?: string;
  preset: PolicyPreset;
  minRoi: string;
  targetCpa: string;
  creativeTestBudget: string;
  profitSafetyMarginPercent: number;
};
type ListEntry = {
  id: string;
  storeId: string;
  campaignId?: string;
  entityType: "creative" | "product";
  entityId: string;
  label?: string;
  mode: "allow" | "deny";
};
type ListEntryPage = {
  items: ListEntry[];
  total: number;
  page: number;
  pageSize: number;
};
type Recommendation = {
  id: string;
  campaignId: string;
  kind: "scale_up" | "scale_down";
  status: string;
  risk: string;
  currentBudget: string;
  proposedBudget: string;
  currentRoasBid: string;
  proposedRoasBid: string;
  reason: string;
  projectedGmvDelta?: string;
  projectedNetProfitDelta?: string;
  projectionSource?: "modeled" | "unavailable";
  confidence?: number;
  blockedReasons?: string[];
  autoExecutable: boolean;
  actionPayload?: Record<string, unknown>;
  evidence: {
    startDate: string;
    endDate: string;
    totalOrders: string;
    averageRoi: string;
    averageBudgetUtilization: string;
    targetRoi: string;
    dataFreshness: string;
  };
  createdAt: number;
  lastError?: string;
  writeAttempted?: boolean;
  platformStateVerified?: boolean;
  retryAllowed?: boolean;
  actionType?: string;
  shadow?: boolean;
  originatedFromShadow?: boolean;
  remoteRequestId?: string;
  reversible?: boolean;
  profitGuard?: {
    complete: boolean;
    breakEvenRoi: string;
    effectiveRoiFloor: string;
    reason?: string;
  };
  calibration?: StrategyCalibration;
};
const RECOMMENDATION_REASON_KEYS: Record<string, string> = {
  "Creative exhausted its test budget with zero orders for two complete days.":
    "creativeZeroOrders",
  "Creative ROI remained below 70 percent of the profit floor after at least three orders.":
    "creativeBelowProfitFloor",
  "Add a fresh replacement before removing a fatigued or waste creative.":
    "replacementRequired",
  "Supply a fresh creative to complete the exploration test pool.":
    "creativeSupplyRequired",
  "Creative ROI exceeded 120 percent of the profit floor and met the order threshold.":
    "creativeScaleReady",
  "Validation passed the profit and pacing thresholds; use a five percent learning step before full scaling.":
    "validationScaleReady",
  "ROI and budget utilization exceeded the scale threshold for two complete days.":
    "campaignScaleReady",
  "ROI remained below the protection threshold for two complete days.":
    "campaignBelowProtection",
  "Spend reached three target CPA units with zero orders.": "zeroOrderPause",
  "Intraday spend is materially ahead of the account-timezone pacing curve while efficiency is below the protected threshold.":
    "intradayOverspend",
  "Spend reached 1.5 target CPA units with zero orders.": "zeroOrderReduce",
};
type Audit = {
  id: string;
  action: string;
  status: string;
  campaignId?: string;
  remoteRequestId?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
};
type ActionPage = {
  items: Recommendation[];
  total: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  summary: {
    pending: number;
    executed: number;
    failed: number;
    shadow: number;
  };
};
type OutcomePage = {
  items: ActionOutcome[];
  total: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  summary: {
    successful: number;
    successRate: number;
    averageRoiDeltaPercent: number;
    averageProfitDeltaPercent: number;
  };
};
type AuditPage = {
  items: Audit[];
  total: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  summary: { succeeded: number; failed: number; started: number };
};
type CampaignWorkspace = {
  campaign: Campaign;
  binding: Binding | null;
  policy: Policy;
  profitGuard: ProfitGuard;
  learning: LearningSnapshot | null;
  pacing: PacingDiagnostic | null;
  dailyMetrics: DailyMetric[];
  creative: CreativePage;
  products: ProductPage;
  productCosts: ProductCostPage;
  actions: ActionPage;
  creativeExperiment: CreativeExperiment;
  creativeOutcomes: ActionOutcome[];
};
type LifecycleStage =
  | "cold_start"
  | "exploration"
  | "validation"
  | "scaling"
  | "mature"
  | "declining"
  | "blocked";
type LearningSnapshot = {
  id: string;
  campaignId: string;
  stage: LifecycleStage;
  previousStage?: LifecycleStage;
  confidence: number;
  score: number;
  daysObserved: number;
  recentOrders: string;
  recentRoi: string;
  roiTrendPercent: string;
  budgetUtilization: string;
  profitFloor: string;
  creativeCount: number;
  winningCreativeCount: number;
  measuredOutcomeCount: number;
  successfulOutcomeCount: number;
  signals: string[];
  recommendedFocus: string;
  analyzedAt: number;
};
type SopTrack = "new_product" | "mature_product" | "live";
type SopVideoGrade = "S" | "A" | "B" | "C";
type SopVideoSort =
  "profit" | "score" | "roi" | "gmv" | "spend" | "orders" | "latest";
type SopPhase =
  | "preparation"
  | "cold_start"
  | "scaling"
  | "matrix"
  | "factory"
  | "steady"
  | "recovery_diagnosis"
  | "single_variable_repair"
  | "controlled_scaling"
  | "second_generation_creatives"
  | "traffic_pool_expansion"
  | "stable_operations";
type SopTask = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  localDate: string;
  scheduledTime: string;
  kind: string;
  title: string;
  description: string;
  resolutionCode?: string;
  executionMode: "internal" | "review" | "manual_external";
  status: "pending" | "completed" | "blocked" | "superseded";
  priority?: "P0" | "P1" | "P2";
  decisionSnapshotId?: string;
  experimentId?: string;
  recommendedAction?: string;
  completedAt?: number;
};
type SopMetricSummary = {
  spend: string;
  gmv: string;
  roi: string;
  orders: string;
  aov: string;
  costPerOrder: string;
  ctr: string;
  cvr: string;
  creativeExplorationRate: string;
  winningCreativeCount: number;
  liveUvToOrderCvr: string;
  netGmv: string;
  netRoi: string;
  estimatedNetProfit: string;
  liveScore?: string;
  completeDays: number;
  consecutiveProfitableDays: number;
};
type MatureBaseline = {
  startDate?: string;
  endDate?: string;
  reportedDays: number;
  deliveryDays: number;
  missingDays: number;
  spend: string;
  gmv: string;
  orders: string;
  roi: string;
};
type MatureAssessment = {
  state: string;
  reasons: string[];
  lastReportDate?: string;
  lastDeliveryDate?: string;
  dataFreshness: "fresh" | "stale" | "missing";
  baseline30d: MatureBaseline;
  recent7d: MatureBaseline;
  previous7d: MatureBaseline;
  healthScore?: string;
  healthCoverage: string;
  dataCoverage: string;
  budgetUtilization?: string;
  velocityIndex?: string;
  recommendedAction: string;
  writeActionsAllowed: boolean;
  dataSources: Record<string, string>;
};
type SopIssueResolution = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  productId?: string;
  code: string;
  severity: "must_fix" | "recommended" | "observing" | "resolved";
  resolutionMode:
    | "internal_route"
    | "approval"
    | "manual_external"
    | "manual_input"
    | "wait_sync";
  actionTarget:
    | "profit"
    | "supplemental"
    | "creatives"
    | "actions"
    | "sync"
    | "audit"
    | "seller_center"
    | "none";
  currentValue?: string;
  targetValue?: string;
  evidenceSource?: string;
  taskId?: string;
  interventionId?: string;
  recommendationId?: string;
  steps: string[];
  approvalRequired: boolean;
  rollbackSupported: boolean;
  manualCompletionAllowed: boolean;
  priorityScore?: number;
  productName?: string;
  campaignName?: string;
  storeName?: string;
};
type EvidenceAttachment = {
  path: string;
  name: string;
  size: number;
  sha256: string;
  importedAt: number;
};
type SopIntervention = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  productId?: string;
  kind: string;
  variable: string;
  beforeValue?: string;
  proposedValue?: string;
  taskId?: string;
  recommendationId?: string;
  executionMode: "approval" | "manual_external";
  status:
    "draft" | "pending_verification" | "observing" | "completed" | "cancelled";
  startedDate?: string;
  requiredDeliveryDays: number;
  observedDeliveryDays: number;
  actualValue?: string;
  completedAt?: number;
  evidenceNote?: string;
  screenshotRef?: string;
  evidenceAttachment?: EvidenceAttachment;
  verificationStatus?: "pending" | "verified" | "mismatch";
  verificationNote?: string;
};
type SopInstance = {
  id: string;
  bindingId: string;
  campaignId: string;
  storeId: string;
  campaignType: "PRODUCT" | "LIVE";
  productId?: string;
  productName?: string;
  productImageUrl?: string;
  productCatalogStatus?: string;
  startDate: string;
  phase: SopPhase;
  status: "active" | "blocked" | "paused" | "completed";
  currentDay: number;
  blockers: string[];
  track?: SopTrack;
  trackSource?: "auto" | "manual";
  trackOverrideReason?: string;
  creationSource?: "manual" | "automatic";
  matureState?: string;
  lastDeliveryDate?: string;
  dataFreshness?: string;
  automationEnabled?: boolean;
  automationMode?: "diagnostic_only" | "draft_actions";
  lastAutomationAt?: number;
  nextAutomationAt?: number;
  lastAutomationResult?: string;
  campaignName: string;
  campaignOperationStatus: string;
  storeName: string;
  profitFloor: string;
  targetRoi: string;
  creativeGradeSummary: Record<"S" | "A" | "B" | "C", number>;
  metrics: SopMetricSummary;
  matureAssessment?: MatureAssessment;
  protectedWinnerCount: number;
  observationDaysRemaining: number;
  issueResolutions: SopIssueResolution[];
};
type SupplementalMetric = {
  id: string;
  campaignId: string;
  storeId: string;
  productId?: string;
  statDate: string;
  source: "manual" | "csv" | "api";
  refundAmount?: string;
  netGmv?: string;
  liveUv?: string;
  liveStayRate?: string;
  productClicks?: string;
  addToCart?: string;
  orders?: string;
  paidOrders?: string;
  productBudget?: string;
  targetRoi?: string;
  intradaySpend?: string;
  deliveryMode?: string;
  autoBudgetEnabled?: boolean;
  inventoryReady?: boolean;
  liveReady?: boolean;
  updatedAt: number;
};
type WinnerDna = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  creativeId: string;
  grade: "S" | "A" | "B" | "C";
  hook: string;
  opening: string;
  model: string;
  scene: string;
  product: string;
  pacing: string;
  offer: string;
  cta: string;
  sourceName?: string;
  draftProjectId?: string;
  draftStatus: "pending" | "created" | "failed";
  draftError?: string;
};
type SopCreativeVideo = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  creativeId: string;
  productId?: string;
  name: string;
  grade: "S" | "A" | "B" | "C";
  source: string;
  authorizationType?: string;
  authorizationStatus?: string;
  deliveryStatus?: string;
  coverUrl?: string;
  videoUrl?: string;
  embedUrl?: string;
  externalUrl?: string;
  durationSeconds?: number;
  reportingStartDate?: string;
  reportingEndDate?: string;
  freshness: "fresh" | "stale" | "missing";
  syncedAt?: number;
  performance: {
    available: boolean;
    samples: number;
    days: number;
    spend?: string;
    gmv?: string;
    roi?: string;
    orders?: string;
    ctr?: string;
    cvr?: string;
    cpa?: string;
    play2sRate?: string;
    playDepth?: string;
  };
  intelligence: {
    state: CreativeInsight["state"];
    score: number;
    roiTrendPercent?: string;
    ctrTrendPercent?: string;
    signals: string[];
  };
  analysisCodes: string[];
};
type SopAutomationRun = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  localDate: string;
  state: string;
  action: string;
  decision?: string;
  decisionContext?: string;
  status: "completed" | "skipped" | "failed";
  taskId?: string;
  interventionId?: string;
  recommendationId?: string;
  message: string;
  attempt?: number;
  nextRetryAt?: number;
  createdAt: number;
  updatedAt: number;
};
type DecisionSnapshot = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  storeId: string;
  productId?: string;
  productName?: string;
  productImageUrl?: string;
  lifecycle: "cold_start" | "mature" | "declining";
  status: "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
  priority: "P0" | "P1" | "P2";
  healthScore?: string;
  healthCoverage: string;
  targetRoi: string;
  actualRoi: string;
  breakEvenRoi: string;
  marginalRoi?: string;
  spend: string;
  grossRevenue: string;
  budgetUtilization?: string;
  spendVelocity?: string;
  creativeConcentration?: string;
  recommendedAction: string;
  reasonCodes: string[];
  confidence: number;
  risk: "low" | "medium" | "high";
  ruleVersion: string;
  writeAllowed: boolean;
  blockedReasons: string[];
  evaluatedAt: number;
};
type Experiment = {
  id: string;
  sopInstanceId: string;
  campaignId: string;
  productId?: string;
  recommendationId?: string;
  rollbackRecommendationId?: string;
  state: string;
  baselineTargetRoi: string;
  currentTargetRoi: string;
  proposedTargetRoi: string;
  marginalRoi?: string;
  updatedAt: number;
};
type CoachProfile = {
  id: string;
  campaignId: string;
  storeId: string;
  productId?: string;
  productName?: string;
  historicalPeakGmv: string;
  historicalPeakRoi: string;
  recentBaselineGmv: string;
  recentBaselineRoi: string;
  currentGmv: string;
  currentRoi: string;
  breakEvenRoi: string;
  stage: string;
  stageLabel: string;
  recoveryRate?: string;
  recoveryScore?: string;
  scalePotential?: string;
  budgetUtilization?: string;
  roiTrendPercent?: string;
  stableDays: number;
  anomalyDays: number;
  updatedAt: number;
};
type CoachEvidence = {
  metric: string;
  value: string;
  comparison: string;
  meaning: string;
};
type CoachDecision = {
  diagnosis: string;
  stage: string;
  action: string;
  targetRoi?: string;
  budget?: string;
  evidence: CoachEvidence[];
  plan: Array<{
    day: 1 | 2 | 3;
    action: string;
    objective: string;
    targetRoi?: string;
    budget?: string;
    trigger?: string;
  }>;
  guardrails: string[];
  aiAvailable: boolean;
  generatedAt: number;
};
type CoachRun = {
  id: string;
  campaignId: string;
  sopInstanceId?: string;
  productId?: string;
  status: string;
  model?: string;
  error?: string;
  decision?: CoachDecision;
  updatedAt: number;
};
type SopWorkspace = {
  instances: SopInstance[];
  tasks: SopTask[];
  supplementalMetrics: SupplementalMetric[];
  winnerDna: WinnerDna[];
  creativeVideos: SopCreativeVideo[];
  interventions: SopIntervention[];
  automationRuns: SopAutomationRun[];
  latestSyncJob?: SyncProgressState;
  issueQueue: SopIssueResolution[];
  effectivenessSummary: {
    completed: number;
    improved: number;
    stable: number;
    declined: number;
    measured: number;
    improvementRate: number;
  };
  reminders: Array<{
    id: string;
    kind: string;
    sopInstanceId: string;
    campaignId: string;
    message: string;
  }>;
  freshnessSummary: { fresh: number; stale: number; missing: number };
  autoOnboarding: {
    eligibleCampaigns: number;
    managedCampaigns: number;
    automaticInstances: number;
    waitingForSalesData: number;
  };
  decisions: DecisionSnapshot[];
  experiments: Experiment[];
  productProfiles: CoachProfile[];
  coachRuns: CoachRun[];
  coachSummary: {
    normal: number;
    observing: number;
    actionRequired: number;
    suggestedActions: number;
  };
  decisionSummary: {
    total: number;
    p0: number;
    p1: number;
    p2: number;
    writeBlocked: number;
    activeExperiments: number;
  };
  generatedAt: number;
};
type CommandCenterAction = {
  id: string;
  source: "issue" | "recommendation";
  campaignId: string;
  sopInstanceId?: string;
  storeId: string;
  storeName: string;
  currency: string;
  campaignName: string;
  productId?: string;
  productName?: string;
  severity: "must_fix" | "recommended" | "observing";
  category: "high_risk" | "high_opportunity" | "optimization" | "observing";
  priority?: "P0" | "P1" | "P2";
  score: number;
  reasonCode: string;
  reason: string;
  actionTarget: SopIssueResolution["actionTarget"];
  currentValue?: string;
  targetValue?: string;
  projectedGmvDelta?: string;
  projectedNetProfitDelta?: string;
  projectionSource: "modeled" | "unavailable";
  confidence?: number;
  status: "needs_action" | "pending_approval" | "failed" | "blocked" | "observing" | "completed";
  blockedReasons: string[];
  recommendationId?: string;
  taskId?: string;
  interventionId?: string;
  outcomeId?: string;
  observationDaysRemaining: number;
  evaluatedAt: number;
};
type CommandCenter = {
  stores: Array<{ id: string; name: string }>;
  topActions: CommandCenterAction[];
  actionSummary: {
    mustFix: number;
    recommended: number;
    observing: number;
    pendingApproval: number;
    failed: number;
    total: number;
  };
  impactSummaryByCurrency: Array<{
    currency: string;
    actionCount: number;
    projectedGmvDelta: string;
    projectedNetProfitDelta: string;
  }>;
  resultSummary: {
    observing: number;
    improved: number;
    stable: number;
    declined: number;
    measured: number;
    waitingData: number;
  };
  generatedAt: number;
};
type CockpitTodayPlanItem = {
  task: SopTask;
  instance: SopInstance;
  decision?: DecisionSnapshot;
};
type ActionOutcome = {
  id: string;
  recommendationId: string;
  campaignId: string;
  actionType: "budget" | "roi" | "creative";
  kind: string;
  preRoi: string;
  postRoi: string;
  preEstimatedProfit: string;
  postEstimatedProfit: string;
  roiDeltaPercent: string;
  profitDeltaPercent: string;
  successful: boolean;
  operation?: "ADD" | "REMOVE" | "ROTATE";
  primaryCreativeId?: string;
  comparisonCreativeId?: string;
  preOrders?: string;
  postOrders?: string;
  preCtr?: string;
  postCtr?: string;
  preConversionRate?: string;
  postConversionRate?: string;
  prePlayDepth?: string;
  postPlayDepth?: string;
  measuredAt: number;
};
type StrategyCalibration = {
  campaignId: string;
  kind: "scale_up" | "scale_down";
  source: "campaign" | "store" | "preset" | "none";
  sampleCount: number;
  successCount: number;
  successRate: number;
  averageProfitDeltaPercent: string;
  budgetStepMultiplier: number;
  confidence: number;
  state: "learning" | "conservative" | "neutral" | "accelerating";
  reason: string;
  analyzedAt: number;
};
type DrawerState = {
  kind:
    | "campaign"
    | "campaignRecommendations"
    | "policy"
    | "rule"
    | "product"
    | "store"
    | "action"
    | null;
  id?: string;
};
type Dashboard = {
  connection: Connection | null;
  connections: Connection[];
  bindings: Binding[];
  campaigns: Campaign[];
  dailyMetrics: DailyMetric[];
  pacingDiagnostics: PacingDiagnostic[];
  recommendations: Recommendation[];
  recommendationSummary?: { pending: number; executed: number; failed: number };
  policies: Policy[];
  audits: Audit[];
  storeCosts: StoreCost[];
  productCosts: ProductCost[];
  creativeMetrics: CreativeMetric[];
  creativeAssets: Array<{
    id: string;
    campaignId?: string;
    creativeId: string;
    kind: string;
    name?: string;
    status?: string;
    syncedAt: number;
    raw?: Record<string, unknown>;
  }>;
  ruleGroups: RuleGroup[];
  ruleBindings: Array<{ id: string; campaignId: string; ruleGroupId: string }>;
  listEntries: ListEntry[];
  sessions: unknown[];
  backtests: Backtest[];
  learningSnapshots: LearningSnapshot[];
  actionOutcomes: ActionOutcome[];
  strategyCalibrations: StrategyCalibration[];
  creativeInsights: CreativeInsight[];
  creativeInsightSummary?: {
    total: number;
    winners: number;
    fatigued: number;
    waste: number;
  };
  productInsights: ProductInsight[];
  profitGuards: Record<string, ProfitGuard>;
  portfolioPlans: PortfolioPlan[];
  storeProfitSummaries: StoreProfitSummary[];
  catalog: {
    products: number;
    configuredProducts: number;
    identities: number;
    videos: number;
    lastProductSyncedAt?: number;
    lastCreativeSyncedAt?: number;
  };
  notifications: Array<{
    id: string;
    eventType: string;
    status: string;
    error?: string;
    createdAt: number;
  }>;
  notificationConfig: {
    enabled: boolean;
    target?: string;
    dailySummaryEnabled: boolean;
  } | null;
  scheduler: {
    running: boolean;
    emergencyStopped: boolean;
    pausedReason?: string;
    lastRunAt?: number;
    lastSuccessfulRunAt?: number;
    nextRunAt?: number;
    consecutiveFailures: number;
    recoveryTaskCount: number;
    lastError?: string;
    updatedAt: number;
  };
};

const { t, te, locale } = useI18n();
const FILTER_STORAGE_KEY = "videogenerate:gmv-max:filters:v1";
const NAV_STORAGE_KEY = "videogenerate:gmv-max:nav-collapsed:v1";
const SOP_SELECTION_STORAGE_KEY = "videogenerate:gmv-max:sop-selection:v1";
const DECISION_PAGE_SIZE = 4;

type CoordinatedRequestResult<T> =
  | { status: "success"; value: T; current: boolean }
  | { status: "error"; error: unknown; current: boolean };

function createLatestRequestCoordinator() {
  let sequence = 0;
  const inFlight = new Map<string, Promise<CoordinatedRequestResult<unknown>>>();

  return {
    run<T>(key: string, request: () => Promise<T>) {
      const existing = inFlight.get(key);
      if (existing) return existing as Promise<CoordinatedRequestResult<T>>;

      const requestSequence = ++sequence;
      const pending = Promise.resolve().then(request).then<CoordinatedRequestResult<T>>(
        (value) => ({
          status: "success",
          value,
          current: requestSequence === sequence,
        }),
        (error) => ({
          status: "error",
          error,
          current: requestSequence === sequence,
        }),
      );
      inFlight.set(
        key,
        pending as Promise<CoordinatedRequestResult<unknown>>,
      );
      void pending.finally(() => {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      });
      return pending;
    },
    invalidate() {
      sequence += 1;
      inFlight.clear();
    },
  };
}

const activeTab = ref<TabId>("overview");
const globalFiltersExpanded = ref(false);
const decisionScopeExpanded = ref(false);
const todayDetailsExpanded = ref(false);
const helpFocusIssueCode = ref("");
const auditView = ref<"execution" | "results" | "exceptions">("execution");
const auditViews = ["execution", "results", "exceptions"] as const;
const featureNavCollapsed = ref(false);
const loading = ref(false);
const busyAction = ref("");
const syncProgress = ref<SyncProgressState | null>(null);
const syncDisplayProgress = ref(0);
const syncProgressDialog = ref<HTMLElement | null>(null);
const syncDetailsOpen = ref(false);
let syncProgressTimer: ReturnType<typeof setInterval> | null = null;
let syncProgressPollTimer: ReturnType<typeof setInterval> | null = null;
let syncProgressPollJobId = "";
let syncProgressPollInFlight = false;
let syncCompletionHandledJobId = "";
let removeSyncProgressListener: (() => void) | null = null;
const dashboardRequest = createLatestRequestCoordinator();
const campaignPageRequest = createLatestRequestCoordinator();
const creativePageRequest = createLatestRequestCoordinator();
const listEntryPageRequest = createLatestRequestCoordinator();
const productPageRequest = createLatestRequestCoordinator();
const productCostPageRequest = createLatestRequestCoordinator();
const actionPageRequest = createLatestRequestCoordinator();
const outcomePageRequest = createLatestRequestCoordinator();
const auditPageRequest = createLatestRequestCoordinator();
const notice = ref("");
const errorText = ref("");
const dashboard = ref<Dashboard>({
  connection: null,
  connections: [],
  bindings: [],
  campaigns: [],
  dailyMetrics: [],
  recommendations: [],
  policies: [],
  audits: [],
  storeCosts: [],
  productCosts: [],
  creativeMetrics: [],
  creativeAssets: [],
  pacingDiagnostics: [],
  ruleGroups: [],
  ruleBindings: [],
  listEntries: [],
  sessions: [],
  backtests: [],
  learningSnapshots: [],
  actionOutcomes: [],
  strategyCalibrations: [],
  creativeInsights: [],
  productInsights: [],
  profitGuards: {},
  portfolioPlans: [],
  storeProfitSummaries: [],
  catalog: { products: 0, configuredProducts: 0, identities: 0, videos: 0 },
  notifications: [],
  notificationConfig: null,
  scheduler: {
    running: false,
    emergencyStopped: false,
    consecutiveFailures: 0,
    recoveryTaskCount: 0,
    updatedAt: 0,
  },
});
const policyDrafts = ref<Record<string, Policy>>({});
const storeCostDrafts = ref<Record<string, StoreCost>>({});
const newProduct = ref<ProductCost>({
  id: "",
  storeId: "",
  campaignId: "",
  productId: "",
  productName: "",
  sellingPrice: "",
  variants: [],
  currency: "",
  purchaseCost: "",
  firstMileCost: "",
  lastMileCost: "",
  warehousingCost: "",
  platformCommissionRate: "",
  creatorCommissionRate: "",
  expectedReturnRate: "",
  returnLossRate: "",
});
const newRule = ref<RuleGroup>({
  id: "",
  name: "",
  storeId: "",
  preset: "roi_guard",
  minRoi: "1",
  targetCpa: "0",
  creativeTestBudget: "0",
  profitSafetyMarginPercent: 15,
});
const newListEntry = ref<ListEntry>({
  id: "",
  storeId: "",
  entityType: "creative",
  entityId: "",
  label: "",
  mode: "allow",
});
const notificationDraft = ref({
  enabled: false,
  target: "",
  dailySummaryEnabled: true,
});
const sopWorkspace = ref<SopWorkspace>({
  instances: [],
  tasks: [],
  supplementalMetrics: [],
  winnerDna: [],
  creativeVideos: [],
  interventions: [],
  automationRuns: [],
  issueQueue: [],
  effectivenessSummary: {
    completed: 0,
    improved: 0,
    stable: 0,
    declined: 0,
    measured: 0,
    improvementRate: 0,
  },
  reminders: [],
  freshnessSummary: { fresh: 0, stale: 0, missing: 0 },
  autoOnboarding: {
    eligibleCampaigns: 0,
    managedCampaigns: 0,
    automaticInstances: 0,
    waitingForSalesData: 0,
  },
  decisions: [],
  experiments: [],
  productProfiles: [],
  coachRuns: [],
  coachSummary: {
    normal: 0,
    observing: 0,
    actionRequired: 0,
    suggestedActions: 0,
  },
  decisionSummary: {
    total: 0,
    p0: 0,
    p1: 0,
    p2: 0,
    writeBlocked: 0,
    activeExperiments: 0,
  },
  generatedAt: 0,
});
const commandCenter = ref<CommandCenter>({
  stores: [],
  topActions: [],
  actionSummary: {
    mustFix: 0,
    recommended: 0,
    observing: 0,
    pendingApproval: 0,
    failed: 0,
    total: 0,
  },
  impactSummaryByCurrency: [],
  resultSummary: {
    observing: 0,
    improved: 0,
    stable: 0,
    declined: 0,
    measured: 0,
    waitingData: 0,
  },
  generatedAt: 0,
});
const sopLoading = ref(false);
const sopRefreshing = ref(false);
const decisionStoreFilter = ref("all");
const decisionTypeFilter = ref<"all" | "PRODUCT" | "LIVE">("all");
const decisionStatusFilter = ref<"all" | "enabled" | "disabled">("enabled");
const decisionLifecycleFilter = ref<
  "all" | "running" | "paused" | "closed" | "exception"
>("all");
const decisionPriorityFilter = ref<"all" | "P0" | "P1" | "P2">("all");
const decisionPage = ref(1);
let sopWorkspaceRequestId = 0;
let sopLoadingWatchdog = 0;
const sopProductLoading = ref(false);
const sopProductOptions = ref<ProductInsight[]>([]);
const selectedSopId = ref("");
const sopDetailOpen = ref(false);
const sopDetailTab = ref<
  "decision" | "tasks" | "metrics" | "creative" | "history"
>("decision");
const sopLaunchExpanded = ref(false);
const sopPickerOpen = ref(false);
const sopPickerQuery = ref("");
const sopPickerStore = ref("all");
const sopPickerDialog = ref<HTMLElement | null>(null);
const sopPickerSearch = ref<HTMLInputElement | null>(null);
let sopPickerTrigger: HTMLElement | null = null;
const sopAutomationSettingsExpanded = ref(false);
const sopHistoryExpanded = ref(false);
const sopMetricsExpanded = ref(false);
const sopSupplementalExpanded = ref(false);
const sopBulkToolsExpanded = ref(false);
const sopDnaExpanded = ref(true);
const selectedSopVideoId = ref("");
const selectedSopVideoGrade = ref<SopVideoGrade>("S");
const sopVideoSort = ref<SopVideoSort>("profit");
const sopVideoPage = ref(1);
const sopVideoPageSize = ref(6);
const sopCompletedTasksExpanded = ref(false);
const externalOperationIssue = ref<SopIssueResolution | null>(null);
const externalOperationDraft = ref<{
  actualValue: string;
  startedDate: string;
  evidenceNote: string;
  screenshotRef: string;
  evidenceAttachment?: EvidenceAttachment;
}>({
  actualValue: "",
  startedDate: new Date().toISOString().slice(0, 10),
  evidenceNote: "",
  screenshotRef: "",
});
const sopStartDraft = ref({
  campaignId: "",
  productId: "",
  productName: "",
  startDate: new Date().toISOString().slice(0, 10),
  track: "" as "" | SopTrack,
  trackOverrideReason: "",
});
const supplementalDraft = ref({
  campaignId: "",
  productId: "",
  statDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  refundAmount: "",
  netGmv: "",
  liveUv: "",
  liveStayRate: "",
  productClicks: "",
  addToCart: "",
  orders: "",
  paidOrders: "",
  productBudget: "",
  targetRoi: "",
  intradaySpend: "",
  deliveryMode: "",
  autoBudgetEnabled: "",
  inventoryReady: "",
  liveReady: "",
});
const selectedStore = ref("all");
const selectedType = ref("all");
const searchText = ref("");
const actionStatus = ref("pending");
const creativeSource = ref("all");
const creativeView = ref<"posts" | "creators">("posts");
const auditStatus = ref("all");
const drawer = ref<DrawerState>({ kind: null });
const campaignWorkspace = ref<CampaignWorkspace | null>(null);
const creativeExperimentWorkspace = ref<CampaignWorkspace | null>(null);
const campaignWorkspaceLoading = ref(false);
const campaignWorkspaceTab = ref<
  "overview" | "creatives" | "products" | "automation"
>("overview");
const ruleDraft = ref<RuleGroup>({ ...newRule.value });
const productDraft = ref<ProductCost>({ ...newProduct.value });
const moneyCostFields: Array<keyof CostFields> = [
  "purchaseCost",
  "firstMileCost",
  "lastMileCost",
  "warehousingCost",
];
const rateCostFields: Array<keyof CostFields> = [
  "platformCommissionRate",
  "creatorCommissionRate",
  "expectedReturnRate",
  "returnLossRate",
];
const completeEndDate = new Date(Date.now() - 86_400_000);
const completeStartDate = new Date(Date.now() - 7 * 86_400_000);
const startDate = ref(completeStartDate.toISOString().slice(0, 10));
const endDate = ref(completeEndDate.toISOString().slice(0, 10));
const campaignPage = ref(1);
const campaignPageSize = ref(20);
const campaignDataPage = ref<CampaignDataPage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  startDate: "",
  endDate: "",
  summary: { cost: 0, revenue: 0, orders: 0 },
});
const campaignDataLoading = ref(false);
const campaignSortBy = ref<
  "name" | "budget" | "cost" | "orders" | "roi" | "utilization" | "profitFloor"
>("cost");
const campaignSortDirection = ref<"asc" | "desc">("desc");
const campaignStatus = ref("all");
const campaignPacingState = ref("all");
const minCampaignSpend = ref<number | undefined>();
const minCampaignOrders = ref<number | undefined>();
const minCampaignRoi = ref<number | undefined>();
const minCampaignUtilization = ref<number | undefined>();
const creativePage = ref<CreativePage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  startDate: "",
  endDate: "",
  summary: { cost: 0, revenue: 0, orders: 0, roi: 0 },
});
const creativeLoading = ref(false);
const creativeCampaign = ref("all");
const creativeState = ref("all");
const creativeSortBy = ref("grossRevenue");
const creativeSortDirection = ref<"asc" | "desc">("desc");
const listEntryPage = ref<ListEntryPage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
});
const listEntryLoading = ref(false);
const listEntryMode = ref("all");
const listEntrySearch = ref("");
const minCreativeSpend = ref<number | undefined>();
const minCreativeOrders = ref<number | undefined>();
const minCreativeRoi = ref<number | undefined>();
const maxCreativeCpa = ref<number | undefined>();
const minCreativeCtr = ref<number | undefined>();
const productPage = ref<ProductPage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  startDate: "",
  endDate: "",
  summary: {
    spend: 0,
    revenue: 0,
    orders: 0,
    estimatedProfit: 0,
    roi: 0,
    scaleReady: 0,
    testing: 0,
    atRisk: 0,
    costBlocked: 0,
  },
});
const productLoading = ref(false);
const productCampaign = ref("all");
const productState = ref("all");
const productAllocation = ref("all");
const productSortBy = ref("grossRevenue");
const productSortDirection = ref<"asc" | "desc">("desc");
const minProductSpend = ref<number | undefined>();
const minProductOrders = ref<number | undefined>();
const minProductRoi = ref<number | undefined>();
const minProductScore = ref<number | undefined>();
const productCostPage = ref<ProductCostPage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  summary: {
    campaignOverrides: 0,
    storeDefaults: 0,
    complete: 0,
    incomplete: 0,
  },
});
const productCostLoading = ref(false);
const productCostCampaign = ref("all");
const productCostScope = ref("all");
const productCostCompleteness = ref("incomplete");
const productCostSearch = ref("");
const productCostSortBy = ref("updatedAt");
const productCostSortDirection = ref<"asc" | "desc">("desc");
const imagePreview = ref<{
  url: string;
  title: string;
  productId: string;
} | null>(null);
const creativeVideoPreview = ref<{
  url: string;
  externalUrl: string;
  title: string;
  creativeId: string;
  embedded: boolean;
} | null>(null);
const actionPage = ref<ActionPage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  startDate: "",
  endDate: "",
  summary: { pending: 0, executed: 0, failed: 0, shadow: 0 },
});
const outcomePage = ref<OutcomePage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  startDate: "",
  endDate: "",
  summary: {
    successful: 0,
    successRate: 0,
    averageRoiDeltaPercent: 0,
    averageProfitDeltaPercent: 0,
  },
});
const outcomeLoading = ref(false);
const actionLoading = ref(false);
const actionCampaign = ref("all");
const actionType = ref("all");
const actionRisk = ref("all");
const actionSortBy = ref("projectedNetProfitDelta");
const actionSortDirection = ref<"asc" | "desc">("desc");
const selectedActionIds = ref<string[]>([]);
const auditPage = ref<AuditPage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  startDate: "",
  endDate: "",
  summary: { succeeded: 0, failed: 0, started: 0 },
});
const auditLoading = ref(false);
const auditCampaign = ref("all");
const auditAction = ref("");
const auditSortDirection = ref<"asc" | "desc">("desc");

const workspaceNavigation = computed<GmvMaxNavItem[]>(() => [
  {
    id: "overview",
    label: t("gmvMaxV2.navigation.overview"),
    icon: BarChart3,
    tab: "overview",
  },
  {
    id: "operations",
    label: t("gmvMaxV2.navigation.operations"),
    icon: Package,
    children: [
      { id: "products", label: t("gmvMaxV2.navigation.products"), tab: "growth" },
      { id: "campaigns", label: t("gmvMaxV2.navigation.campaigns"), tab: "campaigns" },
      { id: "creatives", label: t("gmvMaxV2.navigation.creatives"), tab: "creatives" },
      { id: "profit", label: t("gmvMaxV2.navigation.profit"), tab: "profit" },
    ],
  },
  {
    id: "decisions",
    label: t("gmvMaxV2.navigation.decisions"),
    icon: ClipboardCheck,
    count: commandCenter.value.actionSummary.mustFix,
    children: [
      { id: "pending", label: t("gmvMaxV2.navigation.pending"), tab: "actions" },
      { id: "strategies", label: t("gmvMaxV2.navigation.strategies"), tab: "rules" },
    ],
  },
  {
    id: "growth",
    label: t("gmvMaxV2.navigation.growth"),
    icon: Rocket,
    tab: "sop",
  },
  {
    id: "audit",
    label: t("gmvMaxV2.navigation.audit"),
    icon: ShieldCheck,
    tab: "audit",
  },
  {
    id: "settings",
    label: t("gmvMaxV2.navigation.settings"),
    icon: Settings2,
    tab: "settings",
  },
]);
const activeNavigationLabel = computed(() => {
  for (const item of workspaceNavigation.value) {
    if (item.tab === activeTab.value) return item.label;
    const child = item.children?.find((entry) => entry.tab === activeTab.value);
    if (child) return `${item.label} / ${child.label}`;
  }
  return t("gmvMaxV2.navigation.help");
});
const activeNavigationIcon = computed(() => {
  for (const item of workspaceNavigation.value) {
    if (item.tab === activeTab.value) return item.icon;
    if (item.children?.some((entry) => entry.tab === activeTab.value))
      return item.icon;
  }
  return BookOpen;
});
const pageMeta = computed(() => ({
  title: activeNavigationLabel.value,
  subtitle:
    activeTab.value === "settings"
      ? t("gmvMaxV2.settings.subtitle")
      : t(`gmvMaxTaskUi.pages.${activeTab.value}.subtitle`),
}));
const selectedStoreLabel = computed(() =>
  selectedStore.value === "all"
    ? t("gmvMaxTaskUi.allStores")
    : uniqueStores.value.find((store) => store.storeId === selectedStore.value)
        ?.storeName || t("gmvMaxTaskUi.allStores"),
);
const workspaceFreshness = computed(() => {
  const updatedAt = Math.max(
    sopWorkspace.value.generatedAt || 0,
    dashboard.value.catalog.lastProductSyncedAt || 0,
    dashboard.value.catalog.lastCreativeSyncedAt || 0,
  );
  return updatedAt ? formatDate(updatedAt) : t("gmvMaxTaskUi.notSynced");
});
const taskSummary = computed(() => {
  if (activeTab.value === "growth")
    return [
      {
        label: t("gmvMaxTaskUi.summary.needsAction"),
        value:
          productPage.value.summary.atRisk +
          productPage.value.summary.costBlocked,
        hint: t("gmvMaxTaskUi.hints.productRisk"),
        tone: "danger",
      },
      {
        label: t("gmvMaxTaskUi.summary.growthOpportunity"),
        value: productPage.value.summary.scaleReady,
        hint: t("gmvMaxTaskUi.hints.scaleReady"),
        tone: "success",
      },
      {
        label: t("gmvMaxTaskUi.summary.testing"),
        value: productPage.value.summary.testing,
        hint: t("gmvMaxTaskUi.hints.collectEvidence"),
        tone: "warning",
      },
    ];
  if (activeTab.value === "creatives")
    return [
      {
        label: t("gmvMaxTaskUi.summary.costBlocked"),
        value: incompleteCreativeCostCount.value,
        hint: t("gmvMaxTaskUi.hints.completeProfit"),
        tone: "danger",
      },
      {
        label: t("gmvMaxTaskUi.summary.testBudgetMissing"),
        value: missingCreativeTestBudgetCount.value,
        hint: t("gmvMaxTaskUi.hints.testUnavailable"),
        tone: "warning",
      },
      {
        label: t("gmvMaxTaskUi.summary.fatiguedCreative"),
        value:
          creativeFunnel.value.find((item) => item.key === "fatigued")?.value ||
          0,
        hint: t("gmvMaxTaskUi.hints.replaceCreative"),
        tone: "danger",
      },
    ];
  if (activeTab.value === "profit")
    return [
      {
        label: t("gmvMaxTaskUi.summary.costIncomplete"),
        value: productCostPage.value.summary.incomplete,
        hint: t("gmvMaxTaskUi.hints.automationBlocked"),
        tone: "danger",
      },
      {
        label: t("gmvMaxTaskUi.summary.costComplete"),
        value: productCostPage.value.summary.complete,
        hint: t("gmvMaxTaskUi.hints.profitReady"),
        tone: "success",
      },
      {
        label: t("gmvMaxTaskUi.summary.storeDefaults"),
        value: productCostPage.value.summary.storeDefaults,
        hint: t("gmvMaxTaskUi.hints.costFallback"),
        tone: "neutral",
      },
    ];
  if (activeTab.value === "campaigns")
    return [
      {
        label: t("gmvMaxTaskUi.summary.needsAction"),
        value: pacingSummary.value.overspend + pacingSummary.value.unstable,
        hint: t("gmvMaxTaskUi.hints.pacingRisk"),
        tone: "danger",
      },
      {
        label: t("gmvMaxTaskUi.summary.observing"),
        value: pacingSummary.value.underspend,
        hint: t("gmvMaxTaskUi.hints.underspend"),
        tone: "warning",
      },
      {
        label: t("gmvMaxTaskUi.summary.normal"),
        value: pacingSummary.value.normal,
        hint: t("gmvMaxTaskUi.hints.noIntervention"),
        tone: "success",
      },
    ];
  return [];
});

const campaignWorkspaceTabs = [
  "overview",
  "creatives",
  "products",
  "automation",
] as const;
const pacingStates = ["normal", "overspend", "underspend", "unstable"] as const;

const connected = computed(() =>
  dashboard.value.connections.some((item) => item.state === "connected"),
);
const setupProgress = computed(
  () =>
    [
      connected.value,
      dashboard.value.campaigns.length > 0 &&
        dashboard.value.catalog.products > 0,
      dashboard.value.catalog.configuredProducts > 0,
      dashboard.value.backtests.length > 0,
    ].filter(Boolean).length,
);
const pendingRecommendationCount = computed(
  () =>
    dashboard.value.recommendationSummary?.pending ??
    dashboard.value.recommendations.filter((item) => item.status === "pending")
      .length,
);
const compatibilityError = computed(
  () =>
    dashboard.value.connections.find(
      (item) => item.capabilities?.core_read === false,
    )?.missingTools || [],
);
const uniqueStores = computed(() =>
  dashboard.value.bindings.filter(
    (item, index, values) =>
      values.findIndex((entry) => entry.storeId === item.storeId) === index,
  ),
);
const policyMap = computed(
  () =>
    new Map(dashboard.value.policies.map((item) => [item.campaignId, item])),
);
const learningMap = computed(
  () =>
    new Map(
      dashboard.value.learningSnapshots.map((item) => [item.campaignId, item]),
    ),
);
const pacingMap = computed(
  () =>
    new Map(
      dashboard.value.pacingDiagnostics.map((item) => [item.campaignId, item]),
    ),
);
const filteredCampaigns = computed(() =>
  dashboard.value.campaigns.filter((campaign) => {
    const binding = bindingForCampaign(campaign);
    const query = searchText.value.trim().toLowerCase();
    return (
      (selectedStore.value === "all" ||
        campaign.storeId === selectedStore.value) &&
      (selectedType.value === "all" ||
        campaign.campaignType === selectedType.value) &&
      (!query ||
        `${campaign.name} ${campaign.id} ${binding?.storeName || ""} ${binding?.advertiserName || ""}`
          .toLowerCase()
          .includes(query))
    );
  }),
);
const pacingSummary = computed(() => {
  const activeCampaignIds = new Set(
    filteredCampaigns.value
      .filter((campaign) =>
        ["ENABLE", "ACTIVE"].includes(
          String(campaign.operationStatus).toUpperCase(),
        ),
      )
      .map((campaign) => campaign.id),
  );
  const diagnostics = dashboard.value.pacingDiagnostics.filter((item) =>
    activeCampaignIds.has(item.campaignId),
  );
  return {
    normal: diagnostics.filter((item) => item.state === "normal").length,
    overspend: diagnostics.filter((item) => item.state === "overspend").length,
    underspend: diagnostics.filter((item) => item.state === "underspend")
      .length,
    unstable: diagnostics.filter((item) => item.state === "unstable").length,
  };
});
const incompleteCreativeCostCount = computed(
  () =>
    filteredCampaigns.value.filter(
      (campaign) =>
        dashboard.value.profitGuards[campaign.id]?.complete !== true,
    ).length,
);
const missingCreativeTestBudgetCount = computed(
  () =>
    filteredCampaigns.value.filter(
      (campaign) =>
        metricNumber(policyMap.value.get(campaign.id)?.creativeTestBudget) <= 0,
    ).length,
);
const campaignStatuses = computed(() => [
  ...new Set(dashboard.value.campaigns.map((item) => item.operationStatus)),
]);
const filteredDailyMetrics = computed(() => {
  const campaignIds = new Set(filteredCampaigns.value.map((item) => item.id));
  return dashboard.value.dailyMetrics.filter((item) =>
    campaignIds.has(item.campaignId),
  );
});
const selectedSop = computed(
  () =>
    sopWorkspace.value.instances.find(
      (item) => item.id === selectedSopId.value,
    ) ||
    sopWorkspace.value.instances[0] ||
    null,
);
const selectedCoachRun = computed(() =>
  selectedSop.value
    ? sopWorkspace.value.coachRuns.find(
        (item) => item.sopInstanceId === selectedSop.value?.id,
      )
    : undefined,
);
const selectedCoachProfile = computed(() =>
  selectedSop.value
    ? sopWorkspace.value.productProfiles.find(
        (item) =>
          item.campaignId === selectedSop.value?.campaignId &&
          item.productId === selectedSop.value?.productId,
      )
    : undefined,
);
const selectedCoachDecision = computed(() => selectedCoachRun.value?.decision);

function coachEvidenceMetricLabel(item: CoachDecision["evidence"][number]) {
  const keys: Record<string, string> = {
    "Current GMV": "currentGmv",
    "Current ROI": "currentRoi",
    "Recovery rate": "recoveryRate",
    "Budget utilization": "budgetUtilization",
    actual_roi: "actualRoi",
    break_even_roi: "breakEvenRoi",
    cvrTrendPercent: "cvrTrend",
    ctrTrendPercent: "ctrTrend",
  };
  const key = keys[item.metric];
  return key ? t(`gmvMaxCoach.evidenceMetrics.${key}`) : item.metric;
}

function coachPlanActionLabel(value: string) {
  const keys: Record<string, string> = {
    hold: "hold",
    roi_change: "roiChange",
    budget_change: "budgetChange",
    profit_protection: "profitProtection",
    creative_test: "creativeTest",
    manual_external: "manualExternal",
  };
  const key = keys[value];
  return key ? t(`gmvMaxCoach.actionLabels.${key}`) : value;
}

function coachEvidenceDetail(item: CoachDecision["evidence"][number]) {
  const keys: Record<string, string> = {
    "Current GMV": "currentGmv",
    "Current ROI": "currentRoi",
    "Recovery rate": "recoveryRate",
    "Budget utilization": "budgetUtilization",
  };
  const key = keys[item.metric];
  return key
    ? t(`gmvMaxCoach.evidenceDetails.${key}`, { comparison: item.comparison })
    : `${item.comparison}. ${item.meaning}`;
}

function coachGuardrailLabel(value: string) {
  if (value === "AI unavailable; use deterministic rule evidence only.")
    return t("gmvMaxCoach.guardrailValues.aiUnavailable");
  if (value === "All platform changes require approval.")
    return t("gmvMaxCoach.guardrailValues.approval");
  const roi = value.match(/^ROI change is limited to \+\/-([^.]*)\.$/);
  if (roi) return t("gmvMaxCoach.guardrailValues.roiLimit", { value: roi[1] });
  const budget = value.match(/^Budget increase is limited to ([^.]*)%\.$/);
  if (budget)
    return t("gmvMaxCoach.guardrailValues.budgetLimit", { value: budget[1] });
  return value;
}
const decisionRows = computed(() =>
  sopWorkspace.value.decisions
    .map((decision) => ({
      decision,
      instance: sopWorkspace.value.instances.find(
        (item) => item.id === decision.sopInstanceId,
      ),
    }))
    .filter(
      (item): item is { decision: DecisionSnapshot; instance: SopInstance } =>
        Boolean(item.instance),
    )
    .sort((left, right) => {
      const priority = { P0: 0, P1: 1, P2: 2 };
      return (
        priority[left.decision.priority] - priority[right.decision.priority] ||
        (left.decision.productName || "").localeCompare(
          right.decision.productName || "",
        )
      );
    }),
);
const decisionRowsByTypeAndStatus = computed(() =>
  decisionRows.value.filter((item) => {
    const enabled = isDecisionCampaignEnabled(
      item.instance.campaignOperationStatus,
    );
    const lifecycle = decisionLifecycle(item);
    return (
      (decisionTypeFilter.value === "all" ||
        item.instance.campaignType === decisionTypeFilter.value) &&
      (decisionStatusFilter.value === "all" ||
        (decisionStatusFilter.value === "enabled" ? enabled : !enabled)) &&
      (decisionLifecycleFilter.value === "all" ||
        lifecycle === decisionLifecycleFilter.value)
    );
  }),
);
const decisionLifecycleCounts = computed(() => ({
  running: decisionRows.value.filter(
    (item) => decisionLifecycle(item) === "running",
  ).length,
  paused: decisionRows.value.filter(
    (item) => decisionLifecycle(item) === "paused",
  ).length,
  closed: decisionRows.value.filter(
    (item) => decisionLifecycle(item) === "closed",
  ).length,
  exception: decisionRows.value.filter(
    (item) => decisionLifecycle(item) === "exception",
  ).length,
}));
const decisionStoreOptions = computed(() => {
  const stores = new Map<string, { id: string; name: string }>();
  decisionRows.value.forEach(({ instance }) => {
    if (!stores.has(instance.storeId))
      stores.set(instance.storeId, {
        id: instance.storeId,
        name: instance.storeName,
      });
  });
  return [...stores.values()]
    .map((store) => ({
      ...store,
      count: decisionRowsByTypeAndStatus.value.filter(
        (item) => item.instance.storeId === store.id,
      ).length,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
});
const scopedDecisionRows = computed(() =>
  decisionRowsByTypeAndStatus.value.filter(
    (item) =>
      decisionStoreFilter.value === "all" ||
      item.instance.storeId === decisionStoreFilter.value,
  ),
);
const filteredDecisionRows = computed(() =>
  decisionPriorityFilter.value === "all"
    ? scopedDecisionRows.value
    : scopedDecisionRows.value.filter(
        (item) => item.decision.priority === decisionPriorityFilter.value,
      ),
);
const scopedDecisionSummary = computed(() => {
  const instanceIds = new Set(
    scopedDecisionRows.value.map((item) => item.instance.id),
  );
  return {
    p0: scopedDecisionRows.value.filter(
      (item) => item.decision.priority === "P0",
    ).length,
    p1: scopedDecisionRows.value.filter(
      (item) => item.decision.priority === "P1",
    ).length,
    p2: scopedDecisionRows.value.filter(
      (item) => item.decision.priority === "P2",
    ).length,
    writeBlocked: scopedDecisionRows.value.filter(
      (item) => !item.decision.writeAllowed,
    ).length,
    activeExperiments: sopWorkspace.value.experiments.filter(
      (item) =>
        instanceIds.has(item.sopInstanceId) &&
        [
          "pending_approval",
          "executing",
          "observing",
          "rollback_pending",
        ].includes(item.state),
    ).length,
  };
});
const cockpitSummary = computed(() => ({
  pending: scopedDecisionRows.value.filter(
    (item) => item.decision.priority !== "P2",
  ).length,
  blocked: scopedDecisionRows.value.filter(
    (item) =>
      item.decision.blockedReasons.length > 0 || !item.decision.writeAllowed,
  ).length,
  scaleReady: scopedDecisionRows.value.filter((item) =>
    ["auto_budget", "max_delivery", "product_expansion", "roi_unlock"].includes(
      item.decision.recommendedAction,
    ),
  ).length,
  stale:
    sopWorkspace.value.freshnessSummary.stale +
    sopWorkspace.value.freshnessSummary.missing,
}));
const cockpitStoreSummary = computed(() =>
  decisionStoreOptions.value.map((store) => ({
    ...store,
    active: decisionRows.value.filter(
      (item) =>
        item.instance.storeId === store.id &&
        isDecisionCampaignEnabled(item.instance.campaignOperationStatus),
    ).length,
    paused: decisionRows.value.filter(
      (item) =>
        item.instance.storeId === store.id &&
        !isDecisionCampaignEnabled(item.instance.campaignOperationStatus),
    ).length,
  })),
);
const cockpitTodayPlan = computed<CockpitTodayPlanItem[]>(() => {
  const scopedInstanceIds = new Set(
    scopedDecisionRows.value.map((item) => item.instance.id),
  );
  const instanceMap = new Map(
    sopWorkspace.value.instances.map((item) => [item.id, item]),
  );
  const decisionMap = new Map(
    sopWorkspace.value.decisions.map((item) => [item.sopInstanceId, item]),
  );
  const tasks = sopWorkspace.value.tasks
    .filter(
      (task) =>
        task.status !== "superseded" &&
        scopedInstanceIds.has(task.sopInstanceId),
    )
    .map((task) => ({
      task,
      instance: instanceMap.get(task.sopInstanceId),
      decision: decisionMap.get(task.sopInstanceId),
    }))
    .filter((item): item is CockpitTodayPlanItem => Boolean(item.instance));
  const latestDate = tasks
    .map((item) => item.task.localDate)
    .sort()
    .at(-1);
  const priorityRank = { P0: 0, P1: 1, P2: 2 };
  return tasks
    .filter(
      (item) =>
        item.task.localDate === latestDate && item.task.status !== "completed",
    )
    .sort((left, right) => {
      const leftPriority =
        priorityRank[left.task.priority || left.decision?.priority || "P2"];
      const rightPriority =
        priorityRank[right.task.priority || right.decision?.priority || "P2"];
      return (
        Number(right.task.status === "blocked") -
          Number(left.task.status === "blocked") ||
        leftPriority - rightPriority ||
        left.task.scheduledTime.localeCompare(right.task.scheduledTime)
      );
    })
    .slice(0, 5);
});
const cockpitTodayPlanDate = computed(
  () => cockpitTodayPlan.value[0]?.task.localDate || "",
);
const selectedDecisionRow = computed(
  () =>
    decisionRows.value.find(
      (item) => item.instance.id === selectedSopId.value,
    ) || null,
);
const decisionPageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(filteredDecisionRows.value.length / DECISION_PAGE_SIZE),
  ),
);
const pagedDecisionRows = computed(() =>
  filteredDecisionRows.value.slice(
    (decisionPage.value - 1) * DECISION_PAGE_SIZE,
    decisionPage.value * DECISION_PAGE_SIZE,
  ),
);
watch(
  () => filteredDecisionRows.value.length,
  () => {
    decisionPage.value = Math.min(decisionPage.value, decisionPageCount.value);
  },
);

function setDecisionPriorityFilter(priority: "all" | "P0" | "P1" | "P2") {
  decisionPriorityFilter.value = priority;
  decisionPage.value = 1;
}

function setDecisionStoreFilter(storeId: string) {
  decisionStoreFilter.value = storeId;
  decisionPage.value = 1;
}

function setDecisionTypeFilter(type: "all" | "PRODUCT" | "LIVE") {
  decisionTypeFilter.value = type;
  decisionPage.value = 1;
}

function setDecisionStatusFilter(status: "all" | "enabled" | "disabled") {
  decisionStatusFilter.value = status;
  decisionPage.value = 1;
}

function isDecisionCampaignEnabled(status?: string) {
  return ["ENABLE", "ENABLED", "ACTIVE", "RUNNING", "LIVE"].includes(
    String(status || "")
      .trim()
      .toUpperCase(),
  );
}

function decisionLifecycle(item: {
  decision: DecisionSnapshot;
  instance: SopInstance;
}) {
  if (item.decision.blockedReasons.length || item.instance.status === "blocked")
    return "exception" as const;
  const status = String(item.instance.campaignOperationStatus || "")
    .trim()
    .toUpperCase();
  if (
    ["PAUSE", "PAUSED", "SUSPENDED"].includes(status) ||
    item.instance.status === "paused"
  )
    return "paused" as const;
  if (isDecisionCampaignEnabled(status)) return "running" as const;
  return "closed" as const;
}

function setDecisionLifecycleFilter(
  value: typeof decisionLifecycleFilter.value,
) {
  decisionLifecycleFilter.value = value;
  decisionPage.value = 1;
}

function changeDecisionPage(page: number) {
  decisionPage.value = Math.max(1, Math.min(page, decisionPageCount.value));
}
const selectedSopIssues = computed(
  () => selectedSop.value?.issueResolutions || [],
);
const helpCurrentObject = computed(() => ({
  product: selectedSop.value?.productName || selectedSop.value?.productId || "",
  campaign: selectedSop.value?.campaignName || "",
  store: selectedSop.value?.storeName || "",
}));
const primarySopIssue = computed(
  () =>
    selectedSopIssues.value.find((item) => item.severity === "must_fix") ||
    selectedSopIssues.value.find((item) => item.severity !== "resolved") ||
    selectedSopIssues.value[0],
);
const sopIssueSummary = computed(() => ({
  mustFix: selectedSopIssues.value.filter(
    (item) => item.severity === "must_fix",
  ).length,
  recommended: selectedSopIssues.value.filter(
    (item) => item.severity === "recommended",
  ).length,
  observing: selectedSopIssues.value.filter(
    (item) => item.severity === "observing",
  ).length,
  resolved: selectedSopIssues.value.filter(
    (item) => item.severity === "resolved",
  ).length,
}));
const groupedSopIssues = computed(() =>
  (["must_fix", "recommended", "observing", "resolved"] as const)
    .map((severity) => ({
      severity,
      items: selectedSopIssues.value.filter(
        (item) => item.severity === severity,
      ),
    }))
    .filter((group) => group.items.length),
);
const selectedSopTasks = computed(() =>
  selectedSop.value
    ? sopWorkspace.value.tasks
        .filter(
          (item) =>
            item.sopInstanceId === selectedSop.value?.id &&
            item.status !== "superseded",
        )
        .sort((a, b) =>
          `${b.localDate} ${b.scheduledTime}`.localeCompare(
            `${a.localDate} ${a.scheduledTime}`,
          ),
        )
    : [],
);
const selectedSopTaskDate = computed(
  () => selectedSopTasks.value[0]?.localDate || "",
);
const selectedSopPendingTasks = computed(() =>
  selectedSopTasks.value
    .filter(
      (item) =>
        item.localDate === selectedSopTaskDate.value &&
        ["pending", "blocked"].includes(item.status),
    )
    .sort(
      (a, b) =>
        Number(a.status !== "blocked") - Number(b.status !== "blocked") ||
        Number(a.executionMode !== "manual_external") -
          Number(b.executionMode !== "manual_external") ||
        a.scheduledTime.localeCompare(b.scheduledTime),
    ),
);
const selectedSopCompletedTasks = computed(() =>
  selectedSopTasks.value
    .filter(
      (item) =>
        item.localDate === selectedSopTaskDate.value &&
        item.status === "completed",
    )
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
);
const selectedSopCreativeVideos = computed(() =>
  selectedSop.value
    ? sopWorkspace.value.creativeVideos.filter(
        (item) => item.sopInstanceId === selectedSop.value?.id,
      )
    : [],
);
const selectedSopVideoGradeSummary = computed(() =>
  selectedSopCreativeVideos.value.reduce(
    (summary, item) => {
      summary[item.grade] += 1;
      return summary;
    },
    { S: 0, A: 0, B: 0, C: 0 },
  ),
);
const selectedSopVideoGradeItems = computed(() => {
  const profitFloor = metricNumber(selectedSop.value?.profitFloor || "0");
  const profitContribution = (item: SopCreativeVideo) => {
    const spend = metricNumber(item.performance.spend || "0");
    const gmv = metricNumber(item.performance.gmv || "0");
    return profitFloor > 0
      ? gmv / profitFloor - spend
      : item.intelligence.score;
  };
  const metric = (item: SopCreativeVideo) => {
    if (sopVideoSort.value === "profit") return profitContribution(item);
    if (sopVideoSort.value === "score") return item.intelligence.score;
    if (sopVideoSort.value === "latest") return item.syncedAt || 0;
    return metricNumber(item.performance[sopVideoSort.value] || "0");
  };
  return selectedSopCreativeVideos.value
    .filter((item) => item.grade === selectedSopVideoGrade.value)
    .sort(
      (a, b) =>
        metric(b) - metric(a) || a.creativeId.localeCompare(b.creativeId),
    );
});
const sopVideoPageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(selectedSopVideoGradeItems.value.length / sopVideoPageSize.value),
  ),
);
const pagedSopCreativeVideos = computed(() => {
  const start = (sopVideoPage.value - 1) * sopVideoPageSize.value;
  return selectedSopVideoGradeItems.value.slice(
    start,
    start + sopVideoPageSize.value,
  );
});
const selectedSopCreativeVideo = computed(
  () =>
    pagedSopCreativeVideos.value.find(
      (item) => item.id === selectedSopVideoId.value,
    ) ||
    pagedSopCreativeVideos.value[0] ||
    null,
);
const selectedSopCreativeIntervention = computed(() =>
  selectedSop.value && selectedSopCreativeVideo.value
    ? sopWorkspace.value.interventions.find(
        (item) =>
          item.sopInstanceId === selectedSop.value?.id &&
          item.kind === "creative" &&
          item.variable.includes(
            selectedSopCreativeVideo.value?.creativeId || "",
          ) &&
          ["draft", "pending_verification", "observing"].includes(item.status),
      )
    : undefined,
);
const sopCreativeActionBlocked = computed(() => {
  if (!selectedSop.value?.matureAssessment?.writeActionsAllowed)
    return t("gmvMaxSopVideoWorkbench.actions.dataBlocked");
  if (selectedSopCreativeVideo.value?.freshness !== "fresh")
    return t("gmvMaxSopVideoWorkbench.actions.staleBlocked");
  if (selectedSop.value.observationDaysRemaining > 0)
    return t("gmvMaxSopVideoWorkbench.actions.observationBlocked", {
      days: selectedSop.value.observationDaysRemaining,
    });
  if (selectedSopCreativeIntervention.value)
    return t("gmvMaxSopVideoWorkbench.actions.pendingBlocked");
  return "";
});
const selectedSopAutomationRun = computed(() =>
  selectedSop.value
    ? sopWorkspace.value.automationRuns
        .filter((item) => item.sopInstanceId === selectedSop.value?.id)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined,
);
const sopPickerStores = computed(() =>
  [...new Set(sopWorkspace.value.instances.map((item) => item.storeName))].sort(
    (a, b) => a.localeCompare(b),
  ),
);
const filteredSopInstances = computed(() => {
  const keyword = sopPickerQuery.value.trim().toLowerCase();
  return sopWorkspace.value.instances.filter((item) => {
    if (
      sopPickerStore.value !== "all" &&
      item.storeName !== sopPickerStore.value
    )
      return false;
    if (!keyword) return true;
    return `${item.productName || ""} ${item.productId || ""} ${item.campaignName} ${item.campaignId} ${item.storeName} ${item.track || ""} ${item.campaignOperationStatus || ""}`
      .toLowerCase()
      .includes(keyword);
  });
});
const sopCampaignOptions = computed(() =>
  dashboard.value.campaigns.filter(
    (campaign) =>
      (selectedStore.value === "all" ||
        campaign.storeId === selectedStore.value) &&
      (selectedType.value === "all" ||
        campaign.campaignType === selectedType.value),
  ),
);
const selectedSopCampaign = computed(
  () =>
    dashboard.value.campaigns.find(
      (item) => item.id === sopStartDraft.value.campaignId,
    ) || null,
);
const sopRequiresHeroSku = computed(
  () => selectedSopCampaign.value?.campaignType === "PRODUCT",
);
const sopCanStart = computed(() =>
  Boolean(
    selectedSopCampaign.value &&
    sopStartDraft.value.startDate &&
    (!sopRequiresHeroSku.value || sopStartDraft.value.productId.trim()) &&
    (!sopStartDraft.value.track ||
      sopStartDraft.value.trackOverrideReason.trim()),
  ),
);
const sopStartRequirement = computed(() => {
  if (!selectedSopCampaign.value) return t("gmvMaxSop.errors.campaignRequired");
  if (sopProductLoading.value) return t("gmvMaxData.loadingPage");
  if (sopRequiresHeroSku.value && !sopProductOptions.value.length)
    return t("gmvMaxCatalog.sync");
  if (sopRequiresHeroSku.value && !sopStartDraft.value.productId.trim())
    return t("gmvMaxSop.start.hint");
  if (sopRequiresHeroSku.value)
    return sopStartDraft.value.productName || sopStartDraft.value.productId;
  return t("gmvMaxSop.liveScope");
});
const sopPhases = computed(() => {
  const track =
    selectedSop.value?.track ||
    sopStartDraft.value.track ||
    (selectedSopCampaign.value?.campaignType === "LIVE"
      ? "live"
      : "new_product");
  const phases: SopPhase[] =
    track === "mature_product"
      ? [
          "recovery_diagnosis",
          "single_variable_repair",
          "controlled_scaling",
          "second_generation_creatives",
          "traffic_pool_expansion",
          "stable_operations",
        ]
      : ["preparation", "cold_start", "scaling", "matrix", "factory", "steady"];
  return phases.map((phase) => ({
    phase,
    label: t(
      track === "mature_product"
        ? `gmvMaxMaturePhases.names.${phase}`
        : `gmvMaxSop.phases.${phase}`,
    ),
    days: t(
      track === "mature_product"
        ? `gmvMaxMaturePhases.days.${phase}`
        : `gmvMaxSop.phaseDays.${phase}`,
    ),
  }));
});
const sopMetricCards = computed(() => {
  const item = selectedSop.value;
  if (!item) return [];
  const metrics = item.metrics;
  return [
    { key: "spend", value: formatCny(metrics.spend, item.storeId) },
    { key: "gmv", value: formatCny(metrics.gmv, item.storeId) },
    { key: "roi", value: formatRoi(metrics.roi) },
    { key: "orders", value: formatInteger(metrics.orders) },
    { key: "aov", value: formatCny(metrics.aov, item.storeId) },
    {
      key: "costPerOrder",
      value: formatCny(metrics.costPerOrder, item.storeId),
    },
    { key: "ctr", value: formatPercent(metrics.ctr) },
    { key: "cvr", value: formatPercent(metrics.cvr) },
    {
      key: "creativeExplorationRate",
      value: formatPercent(metrics.creativeExplorationRate),
    },
    {
      key: "winningCreativeCount",
      value: formatInteger(metrics.winningCreativeCount),
    },
    { key: "liveUvToOrderCvr", value: formatPercent(metrics.liveUvToOrderCvr) },
    { key: "netRoi", value: formatRoi(metrics.netRoi) },
  ];
});
const sopKeyMetricCards = computed(() => {
  const keys = new Set([
    "spend",
    "gmv",
    "roi",
    "orders",
    "winningCreativeCount",
    "netRoi",
  ]);
  return sopMetricCards.value.filter((item) => keys.has(item.key));
});
const supplementalMetricFields = computed(() =>
  selectedSop.value?.track === "live"
    ? [
        "refundAmount",
        "netGmv",
        "liveUv",
        "liveStayRate",
        "productClicks",
        "addToCart",
        "orders",
        "paidOrders",
      ]
    : [
        "refundAmount",
        "netGmv",
        "orders",
        "paidOrders",
        "productBudget",
        "targetRoi",
        "intradaySpend",
      ],
);
const filteredLearning = computed(() =>
  filteredCampaigns.value
    .map((campaign) => ({
      campaign,
      snapshot: learningMap.value.get(campaign.id),
    }))
    .filter(
      (item): item is { campaign: Campaign; snapshot: LearningSnapshot } =>
        Boolean(item.snapshot),
    ),
);
const lifecycleStages = computed(() =>
  (
    [
      "cold_start",
      "exploration",
      "validation",
      "scaling",
      "mature",
      "declining",
      "blocked",
    ] as LifecycleStage[]
  ).map((stage) => ({
    stage,
    count: filteredLearning.value.filter(
      (item) => item.snapshot.stage === stage,
    ).length,
  })),
);
const filteredOutcomes = computed(() => outcomePage.value.items);
const filteredCalibrations = computed(() => {
  const campaignIds = new Set(filteredCampaigns.value.map((item) => item.id));
  return dashboard.value.strategyCalibrations
    .filter((item) => campaignIds.has(item.campaignId))
    .sort(
      (a, b) =>
        Number(b.source !== "none") - Number(a.source !== "none") ||
        b.sampleCount - a.sampleCount,
    );
});
const activeCalibrations = computed(() =>
  filteredCalibrations.value.filter((item) => item.source !== "none"),
);
const filteredProductInsights = computed(() => productPage.value.items);
const filteredPortfolioPlans = computed(() =>
  dashboard.value.portfolioPlans.filter(
    (item) =>
      selectedStore.value === "all" || item.storeId === selectedStore.value,
  ),
);
const proposedPortfolioPlans = computed(() =>
  filteredPortfolioPlans.value.filter((item) => item.status === "proposed"),
);
const latestCampaignMetrics = computed(() => {
  const result = new Map<string, DailyMetric>();
  for (const item of dashboard.value.dailyMetrics) {
    const existing = result.get(item.campaignId);
    if (!existing || existing.statDate < item.statDate)
      result.set(item.campaignId, item);
  }
  return result;
});
const campaignMetricSummaries = computed(() => {
  const result = new Map<
    string,
    {
      cost: number;
      revenue: number;
      orders: number;
      roi: number;
      utilization: number;
      samples: number;
    }
  >();
  for (const item of dashboard.value.dailyMetrics) {
    const current = result.get(item.campaignId) || {
      cost: 0,
      revenue: 0,
      orders: 0,
      roi: 0,
      utilization: 0,
      samples: 0,
    };
    current.cost += metricNumber(item.cost);
    current.revenue += metricNumber(item.grossRevenue);
    current.orders += metricNumber(item.orders);
    current.utilization += metricNumber(item.budgetUtilization);
    current.samples += 1;
    current.roi = current.cost > 0 ? current.revenue / current.cost : 0;
    result.set(item.campaignId, current);
  }
  for (const value of result.values())
    value.utilization = value.samples ? value.utilization / value.samples : 0;
  return result;
});
const campaignPageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(campaignDataPage.value.total / campaignDataPage.value.pageSize),
  ),
);
const pagedCampaigns = computed(() => campaignDataPage.value.items);
const dailyFlow = computed(() => {
  const grouped = new Map<
    string,
    {
      date: string;
      cost: number;
      revenue: number;
      orders: number;
      utilization: number;
      samples: number;
      moneyReady: boolean;
    }
  >();
  for (const item of filteredDailyMetrics.value) {
    const current = grouped.get(item.statDate) || {
      date: item.statDate,
      cost: 0,
      revenue: 0,
      orders: 0,
      utilization: 0,
      samples: 0,
      moneyReady: true,
    };
    const cost = convertToCny(item.cost, item.storeId);
    const revenue = convertToCny(item.grossRevenue, item.storeId);
    current.cost += cost || 0;
    current.revenue += revenue || 0;
    current.moneyReady =
      current.moneyReady && cost !== null && revenue !== null;
    current.orders += metricNumber(item.orders);
    current.utilization += metricNumber(item.budgetUtilization);
    current.samples += 1;
    grouped.set(item.statDate, current);
  }
  return [...grouped.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)
    .map((item) => ({
      ...item,
      roi: item.cost > 0 ? item.revenue / item.cost : 0,
      utilization: item.samples ? item.utilization / item.samples : 0,
    }));
});
const maxDailyCost = computed(() =>
  Math.max(1, ...dailyFlow.value.map((item) => item.cost)),
);
const performanceSummary = computed(() =>
  filteredDailyMetrics.value.reduce(
    (result, item) => {
      const cost = convertToCny(item.cost, item.storeId);
      const revenue = convertToCny(item.grossRevenue, item.storeId);
      result.cost += cost || 0;
      result.revenue += revenue || 0;
      result.moneyReady =
        result.moneyReady && cost !== null && revenue !== null;
      result.orders += metricNumber(item.orders);
      result.utilization += metricNumber(item.budgetUtilization);
      result.samples += 1;
      return result;
    },
    {
      cost: 0,
      revenue: 0,
      orders: 0,
      utilization: 0,
      samples: 0,
      moneyReady: true,
    },
  ),
);
const executiveProfit = computed(() => {
  const summaries = dashboard.value.storeProfitSummaries.filter(
    (item) =>
      selectedStore.value === "all" || item.storeId === selectedStore.value,
  );
  let spend = 0;
  let netProfit = 0;
  let atRiskSpend = 0;
  let coveredSpend = 0;
  let moneyReady = summaries.length > 0;
  let profitReady = summaries.length > 0;
  for (const item of summaries) {
    const convertedSpend = convertToCny(item.spend, item.storeId);
    const convertedProfit = convertToCny(item.estimatedNetProfit, item.storeId);
    const convertedRisk = convertToCny(item.atRiskSpend, item.storeId);
    moneyReady =
      moneyReady &&
      convertedSpend !== null &&
      convertedProfit !== null &&
      convertedRisk !== null;
    profitReady = profitReady && item.profitEstimateAvailable;
    spend += convertedSpend || 0;
    netProfit += convertedProfit || 0;
    atRiskSpend += convertedRisk || 0;
    coveredSpend +=
      ((convertedSpend || 0) * (item.spendCoveragePercent || 0)) / 100;
  }
  return {
    spend,
    netProfit,
    atRiskSpend,
    capitalEfficiency: spend > 0 ? netProfit / spend : 0,
    spendCoveragePercent: spend > 0 ? (coveredSpend / spend) * 100 : 0,
    moneyReady,
    profitReady,
  };
});
const storeHealth = computed(() =>
  uniqueStores.value
    .filter(
      (store) =>
        selectedStore.value === "all" || selectedStore.value === store.storeId,
    )
    .map((store) => {
      const campaigns = filteredCampaigns.value.filter(
        (item) => item.storeId === store.storeId,
      );
      const ids = new Set(campaigns.map((item) => item.id));
      const metrics = dashboard.value.dailyMetrics.filter((item) =>
        ids.has(item.campaignId),
      );
      const moneyReady = storeCnyRate(store.storeId) !== null;
      const cost = metrics.reduce(
        (sum, item) => sum + (convertToCny(item.cost, store.storeId) || 0),
        0,
      );
      const revenue = metrics.reduce(
        (sum, item) =>
          sum + (convertToCny(item.grossRevenue, store.storeId) || 0),
        0,
      );
      return {
        ...store,
        campaigns: campaigns.length,
        automatic: campaigns.filter(
          (item) => policyMap.value.get(item.id)?.automationEnabled,
        ).length,
        cost,
        revenue,
        roi: cost > 0 ? revenue / cost : 0,
        moneyReady,
      };
    }),
);
const filteredCreatives = computed(() => creativePage.value.items);
const creatorPerformance = computed(() => {
  const grouped = new Map<
    string,
    {
      name: string;
      creatives: Set<string>;
      cost: number;
      revenue: number;
      orders: number;
      winners: number;
      moneyReady: boolean;
    }
  >();
  for (const item of filteredCreatives.value) {
    const name = item.creatorName || t("gmvMaxConsole.unknownCreator");
    const current = grouped.get(name) || {
      name,
      creatives: new Set<string>(),
      cost: 0,
      revenue: 0,
      orders: 0,
      winners: 0,
      moneyReady: true,
    };
    current.creatives.add(item.creativeId);
    const cost = convertToCny(item.cost, item.storeId);
    const revenue = convertToCny(item.grossRevenue, item.storeId);
    current.cost += cost || 0;
    current.revenue += revenue || 0;
    current.moneyReady =
      current.moneyReady && cost !== null && revenue !== null;
    current.orders += metricNumber(item.orders);
    if (item.label === "winner") current.winners += 1;
    grouped.set(name, current);
  }
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      creativeCount: item.creatives.size,
      roi: item.cost > 0 ? item.revenue / item.cost : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
});
const filteredActions = computed(() => actionPage.value.items);
const todayActions = computed(() =>
  dashboard.value.recommendations
    .filter(
      (item) =>
        item.status === "pending" &&
        filteredCampaigns.value.some(
          (campaign) => campaign.id === item.campaignId,
        ),
    )
    .sort(
      (left, right) =>
        metricNumber(right.projectedNetProfitDelta) -
          metricNumber(left.projectedNetProfitDelta) ||
        (right.confidence || 0) - (left.confidence || 0) ||
        right.createdAt - left.createdAt,
    )
    .slice(0, 3),
);
const selectedActions = computed(() =>
  filteredActions.value.filter((item) =>
    selectedActionIds.value.includes(item.id),
  ),
);
const batchRisk = computed(() =>
  new Set(selectedActions.value.map((item) => item.risk)).size === 1
    ? selectedActions.value[0]?.risk
    : undefined,
);
const creativeActionQueue = computed(() =>
  dashboard.value.recommendations
    .filter(
      (item) =>
        ["creative", "session"].includes(String(item.actionType)) &&
        filteredCampaigns.value.some(
          (campaign) => campaign.id === item.campaignId,
        ),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20),
);
const creativeFunnel = computed(() => {
  const items = filteredCreatives.value;
  const count = (states: CreativeInsight["state"][]) =>
    items.filter((item) => states.includes(item.intelligenceState)).length;
  return [
    { key: "measured", value: items.length },
    { key: "testing", value: count(["new", "testing"]) },
    { key: "productive", value: count(["winner", "stable"]) },
    { key: "fatigued", value: count(["fatigued"]) },
    { key: "waste", value: count(["waste", "blocked"]) },
  ];
});
const creativeSignalSummary = computed(() => {
  const items = filteredCreatives.value;
  const average = (field: keyof CreativePerformance) =>
    items.length
      ? items.reduce((sum, item) => sum + metricNumber(item[field]), 0) /
        items.length
      : 0;
  return {
    ctr: average("ctr"),
    conversionRate: average("conversionRate"),
    play2sRate: average("play2sRate"),
    playDepth: average("playDepth"),
  };
});
const filteredAudits = computed(() => auditPage.value.items);
const selectedAction = computed(
  () =>
    actionPage.value.items.find((item) => item.id === drawer.value.id) ||
    dashboard.value.recommendations.find((item) => item.id === drawer.value.id),
);
const selectedRecommendationCampaign = computed(() =>
  dashboard.value.campaigns.find((item) => item.id === drawer.value.id),
);
const selectedCampaignRecommendations = computed(() =>
  dashboard.value.recommendations
    .filter(
      (item) =>
        item.campaignId === drawer.value.id && item.status === "pending",
    )
    .sort((left, right) => right.createdAt - left.createdAt),
);
const selectedPolicyCampaign = computed(() =>
  dashboard.value.campaigns.find((item) => item.id === drawer.value.id),
);
function buildProductProfitPreview(
  priceValue: unknown,
  costSources: Array<Partial<CostFields> | undefined>,
) {
  const parse = (value: unknown) => {
    const normalized = String(value ?? "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const valueFor = (field: keyof CostFields) =>
    costSources
      .map((source) => String(source?.[field] ?? "").trim())
      .find(Boolean) || "";
  const price = parse(priceValue);
  const fixedValues = moneyCostFields.map((field) => parse(valueFor(field)));
  const rateValues = rateCostFields.map((field) => parse(valueFor(field)));
  if (
    price === null ||
    price <= 0 ||
    [...fixedValues, ...rateValues].some((value) => value === null)
  )
    return null;
  const [platformRate, creatorRate, returnRate, returnLossRate] =
    rateValues as number[];
  if (rateValues.some((value) => value! < 0 || value! > 1)) return null;
  const contribution =
    price -
    (fixedValues as number[]).reduce((sum, value) => sum + value, 0) -
    price * (platformRate + creatorRate + returnRate * returnLossRate);
  if (contribution <= 0)
    return {
      contributionMarginRate: 0,
      breakEvenRoi: 0,
      effectiveRoiFloor: 0,
      profitable: false,
    };
  const contributionMarginRate = contribution / price;
  const breakEvenRoi = price / contribution;
  const policy = policyMap.value.get(productDraft.value.campaignId || "");
  const protectedRoi =
    breakEvenRoi * (1 + (policy?.profitSafetyMarginPercent ?? 15) / 100);
  const effectiveRoiFloor = Math.max(
    metricNumber(policy?.minRoi || "0"),
    protectedRoi,
  );
  return {
    contributionMarginRate,
    breakEvenRoi,
    effectiveRoiFloor,
    profitable: true,
  };
}

const productHasMultipleSkus = computed(() => {
  const minimum = String(productDraft.value.catalogMinPrice || "").trim();
  const maximum = String(productDraft.value.catalogMaxPrice || "").trim();
  return (
    Number(productDraft.value.skuCount || 0) > 1 ||
    Boolean(minimum && maximum && minimum !== maximum)
  );
});

function variantDraftProfitPreview(variant: ProductVariant) {
  const draft = productDraft.value;
  return buildProductProfitPreview(variant.sellingPrice, [
    variant,
    draft,
    storeCostDrafts.value[draft.storeId],
  ]);
}

const productDraftProfitPreview = computed(() => {
  const draft = productDraft.value;
  const variants = draft.variants || [];
  if (variants.length) {
    const previews = variants.map(variantDraftProfitPreview);
    if (previews.some((preview) => !preview?.profitable)) return null;
    return (
      [...previews].sort(
        (left, right) =>
          (right?.effectiveRoiFloor || 0) - (left?.effectiveRoiFloor || 0),
      )[0] || null
    );
  }
  if (productHasMultipleSkus.value) return null;
  return buildProductProfitPreview(draft.sellingPrice, [
    draft,
    storeCostDrafts.value[draft.storeId],
  ]);
});
const capabilityRows = computed(() => {
  const connection =
    dashboard.value.connections.find((item) => item.state === "connected") ||
    dashboard.value.connections[0];
  return Object.entries(connection?.capabilities || {}).map(
    ([name, enabled]) => ({ name, enabled }),
  );
});
const campaignWorkspaceSummary = computed(() =>
  (campaignWorkspace.value?.dailyMetrics || []).reduce(
    (result, item) => {
      result.cost += metricNumber(item.cost);
      result.revenue += metricNumber(item.grossRevenue);
      result.orders += metricNumber(item.orders);
      result.utilization += metricNumber(item.budgetUtilization);
      result.samples += 1;
      return result;
    },
    { cost: 0, revenue: 0, orders: 0, utilization: 0, samples: 0 },
  ),
);

function bindingForCampaign(campaign: Campaign) {
  return dashboard.value.bindings.find(
    (item) => item.id === campaign.bindingId,
  );
}

function metricNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalMetricNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatInteger(value: unknown) {
  const parsed = optionalMetricNumber(value);
  return parsed === null
    ? "-"
    : new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(
        parsed,
      );
}

function formatRoi(value: unknown) {
  const parsed = optionalMetricNumber(value);
  return parsed === null ? "-" : `${parsed.toFixed(2)}x`;
}

function formatPercent(value: unknown, alreadyPercent = false) {
  const valueNumber = optionalMetricNumber(value);
  if (valueNumber === null) return "-";
  const parsed = valueNumber * (alreadyPercent ? 1 : 100);
  const precision = parsed !== 0 && Math.abs(parsed) < 0.1 ? 2 : 1;
  return `${new Intl.NumberFormat(locale.value, { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(parsed)}%`;
}

function actionTypeLabel(actionType?: string) {
  const key = [
    "budget",
    "roi",
    "creative",
    "status",
    "session",
    "portfolio",
  ].includes(String(actionType))
    ? String(actionType)
    : "other";
  return t(`gmvMaxRecommendationUi.actionTypes.${key}`);
}

function recommendationActionLabel(item: Recommendation) {
  if (item.actionType !== "creative") return actionTypeLabel(item.actionType);
  const operation = String(item.actionPayload?.operation || "").toUpperCase();
  if (operation === "REMOVE")
    return t("gmvMaxRecommendationUi.actions.removeCreative");
  if (operation === "ROTATE")
    return t("gmvMaxRecommendationUi.actions.rotateCreative");
  if (operation === "ADD")
    return t("gmvMaxRecommendationUi.actions.addCreative");
  return actionTypeLabel(item.actionType);
}

function recommendationReasonLabel(reason: string) {
  const key = RECOMMENDATION_REASON_KEYS[reason];
  if (key) return t(`gmvMaxRecommendationUi.reasons.${key}`);
  if (reason.startsWith("Restore action "))
    return t("gmvMaxRecommendationUi.reasons.restoreAction");
  return locale.value.startsWith("zh")
    ? t("gmvMaxRecommendationUi.reasons.fallback")
    : reason;
}

function formatEvidenceDate(value: string) {
  const date = String(value || "").slice(0, 10);
  return date ? date.replace(/-/g, "/") : "-";
}

function formatEvidenceRange(item: Recommendation) {
  const start = formatEvidenceDate(item.evidence.startDate);
  const end = formatEvidenceDate(item.evidence.endDate);
  return start === end
    ? start
    : `${start} ${t("gmvMaxRecommendationUi.dateTo")} ${end}`;
}

function recommendationProjectionLabel(value: unknown, item: Recommendation) {
  return item.projectionSource === "modeled"
    ? formatCny(value, campaignStoreId(item.campaignId))
    : t("gmvMaxRecommendationUi.notAvailable");
}

function recommendationConfidenceLabel(item: Recommendation) {
  return item.projectionSource === "modeled" &&
    optionalMetricNumber(item.confidence) !== null
    ? formatPercent(item.confidence, true)
    : t("gmvMaxRecommendationUi.notAvailable");
}

function storeCurrency(storeId?: string) {
  const configured = dashboard.value.storeCosts.find(
    (item) => item.storeId === storeId,
  );
  const binding = dashboard.value.bindings.find(
    (item) => item.storeId === storeId,
  );
  return String(configured?.currency || binding?.currency || "").toUpperCase();
}

function storeCnyRate(storeId?: string) {
  const currency = storeCurrency(storeId);
  if (["CNY", "RMB", "CNH"].includes(currency)) return 1;
  const configured = dashboard.value.storeCosts.find(
    (item) => item.storeId === storeId,
  );
  const rate = metricNumber(configured?.cnyExchangeRate);
  return currency && rate > 0 ? rate : null;
}

function convertToCny(value: unknown, storeId?: string) {
  const rate = storeCnyRate(storeId);
  return rate === null ? null : metricNumber(value) * rate;
}

function formatCny(value: unknown, storeId?: string, alreadyCny = false) {
  if (optionalMetricNumber(value) === null) return "-";
  const amount = alreadyCny
    ? metricNumber(value)
    : convertToCny(value, storeId);
  if (amount === null) return t("gmvMaxCurrency.pending");
  const compact = Math.abs(amount) >= 1_000_000;
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: "CNY",
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 1 : 2,
    maximumFractionDigits: compact ? 1 : 2,
  }).format(amount);
}

function decimalInput(value: number, maximumFractionDigits = 4) {
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits,
  });
}

function moneyInputValue(value: unknown, storeId?: string) {
  if (optionalMetricNumber(value) === null) return "";
  const converted = convertToCny(value, storeId);
  return converted === null ? "" : decimalInput(converted, 2);
}

function sourceMoneyValue(value: string, storeId?: string) {
  if (!value.trim()) return "";
  const rate = storeCnyRate(storeId);
  const parsed = optionalMetricNumber(value);
  return rate === null || parsed === null ? "" : decimalInput(parsed / rate);
}

function cnyFilterToSource(value?: number) {
  if (value === undefined || selectedStore.value === "all") return undefined;
  const rate = storeCnyRate(selectedStore.value);
  return rate === null ? undefined : value / rate;
}

function moneyFilterDisabled() {
  return (
    selectedStore.value === "all" || storeCnyRate(selectedStore.value) === null
  );
}

function percentInputValue(value: unknown) {
  const parsed = optionalMetricNumber(value);
  return parsed === null ? "" : decimalInput(parsed * 100, 2);
}

function inputText(event: Event) {
  return (event.target as HTMLInputElement).value;
}

function setMoneyField(
  target: Record<string, unknown>,
  field: string,
  event: Event,
  storeId?: string,
) {
  target[field] = sourceMoneyValue(inputText(event), storeId);
}

function setPercentField(
  target: Record<string, unknown>,
  field: string,
  event: Event,
) {
  const value = inputText(event);
  const parsed = optionalMetricNumber(value);
  target[field] = parsed === null ? "" : decimalInput(parsed / 100, 6);
}

function campaignStoreId(campaignId?: string) {
  return dashboard.value.campaigns.find((item) => item.id === campaignId)
    ?.storeId;
}

function backtestStoreId(item: Backtest) {
  if (item.campaignId) return campaignStoreId(item.campaignId);
  const storeIds = new Set(
    Object.keys(item.details || {})
      .map(campaignStoreId)
      .filter(Boolean),
  );
  return storeIds.size === 1 ? [...storeIds][0] : undefined;
}

function productCostComplete(item: ProductCost) {
  const fallback = dashboard.value.storeCosts.find(
    (cost) => cost.storeId === item.storeId,
  );
  const fields: Array<keyof CostFields> = [
    "purchaseCost",
    "firstMileCost",
    "lastMileCost",
    "warehousingCost",
    "platformCommissionRate",
    "creatorCommissionRate",
    "expectedReturnRate",
    "returnLossRate",
  ];
  const sourcesComplete = (variant?: ProductVariant) =>
    fields.every(
      (field) =>
        String(variant?.[field] ?? "").trim() ||
        String(item[field] ?? "").trim() ||
        String(fallback?.[field] ?? "").trim(),
    );
  const variants = item.variants || [];
  if (variants.length)
    return variants.every(
      (variant) =>
        metricNumber(variant.sellingPrice) > 0 && sourcesComplete(variant),
    );
  const hasMultipleSkus =
    Number(item.skuCount || 0) > 1 ||
    Boolean(
      item.catalogMinPrice &&
      item.catalogMaxPrice &&
      item.catalogMinPrice !== item.catalogMaxPrice,
    );
  return (
    !hasMultipleSkus && metricNumber(item.sellingPrice) > 0 && sourcesComplete()
  );
}

function actualSellingPriceLabel(item: ProductCost | ProductInsight) {
  const variants = "variants" in item ? item.variants || [] : [];
  const prices = variants
    .map((variant) => variant.sellingPrice)
    .filter((value) => metricNumber(value) > 0)
    .sort((left, right) => metricNumber(left) - metricNumber(right));
  const configuredMinimum =
    "actualSellingPriceMin" in item ? item.actualSellingPriceMin : undefined;
  const configuredMaximum =
    "actualSellingPriceMax" in item ? item.actualSellingPriceMax : undefined;
  const hasMultipleSkus =
    Number(item.skuCount || 0) > 1 ||
    ("catalogMinPrice" in item &&
      Boolean(
        item.catalogMinPrice &&
        item.catalogMaxPrice &&
        item.catalogMinPrice !== item.catalogMaxPrice,
      ));
  const fallback = hasMultipleSkus ? undefined : item.sellingPrice;
  const minimum = prices[0] || configuredMinimum || fallback;
  const maximum = prices.at(-1) || configuredMaximum || fallback;
  if (!minimum) return "-";
  if (maximum && metricNumber(maximum) !== metricNumber(minimum))
    return `${formatCny(minimum, item.storeId)} - ${formatCny(maximum, item.storeId)}`;
  return formatCny(minimum, item.storeId);
}

function flowDateLabel(value: string) {
  return value.split(/[ T]/, 1)[0].slice(5);
}

function learningSignalLabel(signal: string) {
  return signal.startsWith("strategy_feedback_")
    ? t(`gmvMaxLearningFeedback.signals.${signal}`)
    : t(`gmvMaxLearning.signals.${signal}`);
}

function flowLabel(utilization: string) {
  const value = metricNumber(utilization);
  if (value >= 1.1) return "fast";
  if (value > 0 && value < 0.55) return "slow";
  return "stable";
}

function percentage(value?: string) {
  return formatPercent(value);
}

function portfolioStatusLabel(status: PortfolioPlan["status"]) {
  return status === "proposed" || status === "blocked"
    ? t(`gmvMaxIntelligence.status.${status}`)
    : t(`gmvMax.status.${status}`);
}

function calibrationStateClass(state: StrategyCalibration["state"]) {
  if (state === "accelerating") return "is-success";
  if (state === "conservative") return "is-warning";
  if (state === "neutral") return "is-blue";
  return "is-neutral";
}

function productStateClass(state: ProductInsight["state"]) {
  if (state === "scale_ready" || state === "winner") return "is-success";
  if (state === "testing" || state === "cold_start") return "is-blue";
  if (state === "declining" || state === "losing") return "is-warning";
  if (state === "blocked") return "is-danger";
  return "is-neutral";
}

function campaignName(campaignId?: string) {
  return (
    dashboard.value.campaigns.find((item) => item.id === campaignId)?.name ||
    campaignId ||
    "-"
  );
}

function compactCampaignName(name?: string) {
  const value = String(name || "").trim();
  const timestamp = value.match(/^(.*?)(?:[_-]\d{10,})$/)?.[1];
  return (timestamp || value).replace(/\s+/g, " ").trim() || "-";
}

function campaignIdentityCode(name?: string) {
  const value = String(name || "").trim();
  return value.match(/(?:^|\s)(#\d+)\b/)?.[1] || value.slice(-12) || "-";
}

function campaignRecommendationCount(campaignId: string) {
  return dashboard.value.recommendations.filter(
    (item) => item.campaignId === campaignId && item.status === "pending",
  ).length;
}

function campaignProtectionState(campaignId: string) {
  const guard = dashboard.value.profitGuards[campaignId];
  const metrics = campaignMetricSummaries.value.get(campaignId);
  if (!guard?.complete) return "incomplete";
  return (metrics?.roi || 0) >= metricNumber(guard.effectiveRoiFloor)
    ? "eligible"
    : "risk";
}

function storeProfitSummary(storeId: string) {
  return dashboard.value.storeProfitSummaries.find(
    (item) => item.storeId === storeId,
  );
}

function storeProfitValue(item?: StoreProfitSummary) {
  return item?.profitEstimateAvailable
    ? formatCny(item.estimatedNetProfit, item.storeId)
    : "-";
}

function canExecute(item: Recommendation) {
  if (dashboard.value.scheduler.emergencyStopped) return false;
  const campaign = dashboard.value.campaigns.find(
    (entry) => entry.id === item.campaignId,
  );
  const binding =
    campaign &&
    dashboard.value.bindings.find((entry) => entry.id === campaign.bindingId);
  const connection =
    binding &&
    dashboard.value.connections.find(
      (entry) => entry.id === binding.connectionId,
    );
  const capability =
    item.actionType === "creative"
      ? "creative_write"
      : item.actionType === "status"
        ? "status_write"
        : item.actionType === "session"
          ? "session_write"
          : "campaign_write";
  return connection?.capabilities?.[capability] !== false;
}

function formatDate(value?: number) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sopAutomationResult(run?: SopAutomationRun) {
  if (!run) return t("gmvMaxSopAutomation.waiting");
  if (run.status === "failed") return run.message;
  const extendedKey = `gmvMaxSopAutomationExtended.results.${run.decision || "phase_review"}`;
  if (te(extendedKey)) return t(extendedKey);
  const key = `gmvMaxSopAutomation.results.${run.decision || "phase_review"}`;
  return te(key) ? t(key) : run.message;
}

function sopAutomationTaskCategory(task: SopTask) {
  const value = `${task.title} ${task.description}`.toLowerCase();
  if (value.includes("rollback")) return "rollback";
  if (value.includes("recovery") || value.includes("disabled reason"))
    return "recovery";
  if (value.includes("creative") || value.includes("winner")) return "creative";
  if (value.includes("budget")) return "budget";
  if (value.includes("roi") || value.includes("profit")) return "profit";
  if (value.includes("live")) return "live";
  return "review";
}

function sopTaskTitle(task: SopTask) {
  const externalCode = sopExternalTaskCode(task);
  if (externalCode && te(`gmvMaxIssueResolutions.items.${externalCode}.title`))
    return t(`gmvMaxIssueResolutions.items.${externalCode}.title`);
  return task.kind === "sop_automation"
    ? t(`gmvMaxSop.automationTasks.${sopAutomationTaskCategory(task)}.title`)
    : t(`gmvMaxSop.taskKinds.${task.kind}`);
}

function sopTaskDescription(task: SopTask) {
  const externalCode = sopExternalTaskCode(task);
  if (
    externalCode &&
    te(`gmvMaxIssueResolutions.items.${externalCode}.solution`)
  )
    return t(`gmvMaxIssueResolutions.items.${externalCode}.solution`);
  return task.kind === "sop_automation"
    ? t(
        `gmvMaxSop.automationTasks.${sopAutomationTaskCategory(task)}.description`,
      )
    : t(`gmvMaxSop.taskDescriptions.${task.kind}`);
}

function sopExternalTaskCode(task: SopTask) {
  if (task.executionMode !== "manual_external") return "";
  if (task.resolutionCode) return task.resolutionCode;
  const value = `${task.title} ${task.description}`.toLowerCase();
  if (value.includes("auto budget")) return "external_auto_budget";
  if (value.includes("promotion")) return "external_promotion_schedule";
  if (value.includes("max delivery") && value.includes("creation"))
    return "external_campaign_setup";
  if (value.includes("max delivery") || value.includes("target roi"))
    return "external_delivery_mode";
  return "external_manual_intervention";
}

function issueText(
  issue: SopIssueResolution,
  field: "title" | "reason" | "solution" | "completion",
) {
  if (issue.code === "external_verification_pending")
    return t(`gmvMaxOperations.verification.${field}`);
  const key = `gmvMaxIssueResolutions.items.${issue.code}.${field}`;
  return te(key) ? t(key) : issue.code;
}

function issueActionLabel(issue: SopIssueResolution) {
  return t(`gmvMaxIssueResolutions.actions.${issue.actionTarget}`);
}

function structuredValueLabel(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return t("gmvMaxSopUi.notAvailable");
  const completeDays = raw.match(/^<=\s*(\d+)\s+complete days$/i);
  if (completeDays)
    return t("gmvMaxStructuredValues.withinCompleteDays", {
      count: completeDays[1],
    });
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const valueKey = `gmvMaxStructuredValues.values.${normalized}`;
  if (normalized && te(valueKey)) return t(valueKey);
  const statusKey = `gmvMax.status.${normalized}`;
  if (normalized && te(statusKey)) return t(statusKey);
  const operationKey = `gmvMaxOperationStatus.${normalized}`;
  return normalized && te(operationKey) ? t(operationKey) : raw;
}

function issueForTask(task: SopTask) {
  return (
    selectedSopIssues.value.find((item) => item.taskId === task.id) ||
    selectedSopIssues.value.find((item) => item.code === task.resolutionCode)
  );
}

function openExternalOperation(issue: SopIssueResolution) {
  const intervention = sopWorkspace.value.interventions.find(
    (item) => item.id === issue.interventionId,
  );
  externalOperationIssue.value = issue;
  externalOperationDraft.value = {
    actualValue: intervention?.actualValue || issue.targetValue || "",
    startedDate:
      intervention?.startedDate || new Date().toISOString().slice(0, 10),
    evidenceNote: "",
    screenshotRef: intervention?.screenshotRef || "",
    evidenceAttachment: intervention?.evidenceAttachment,
  };
}

function closeExternalOperation() {
  if (busyAction.value) return;
  externalOperationIssue.value = null;
}

async function openSellerCenter() {
  await window.api.shell.openExternal("https://seller.tiktokglobalshop.com/");
}

async function copyExternalChecklist() {
  const issue = externalOperationIssue.value;
  if (!issue) return;
  const steps = issue.steps
    .map(
      (step, index) =>
        `${index + 1}. ${t(`gmvMaxIssueResolutions.steps.${step}`)}`,
    )
    .join("\n");
  await navigator.clipboard.writeText(`${issueText(issue, "title")}\n${steps}`);
  notice.value = t("gmvMaxIssueResolutions.checklistCopied");
}

async function selectExternalEvidence() {
  const attachment =
    (await window.api.tiktokGmvMax.selectEvidenceAttachment()) as EvidenceAttachment | null;
  if (attachment) externalOperationDraft.value.evidenceAttachment = attachment;
}

function evidencePreview(path?: string) {
  return path ? `vg://file?path=${encodeURIComponent(path)}` : "";
}

async function submitExternalOperation() {
  const issue = externalOperationIssue.value;
  const instance = selectedSop.value;
  if (
    !issue ||
    !instance ||
    !externalOperationDraft.value.actualValue.trim() ||
    !externalOperationDraft.value.evidenceNote.trim()
  )
    return;
  busyAction.value = `external-operation:${issue.id}`;
  errorText.value = "";
  try {
    let interventionId = issue.interventionId;
    if (issue.code === "external_verification_pending" && interventionId) {
      await window.api.tiktokGmvMax.verifyExternalSopIntervention({
        id: interventionId,
        verified: true,
        platformValue: externalOperationDraft.value.actualValue.trim(),
        verificationNote: externalOperationDraft.value.evidenceNote.trim(),
      });
      externalOperationIssue.value = null;
      notice.value = t("gmvMaxOperations.verificationStarted");
      await refreshWorkspace(false);
      return;
    }
    if (!interventionId) {
      const kindByCode: Record<string, string> = {
        external_campaign_setup: "max_delivery",
        external_delivery_mode: "max_delivery",
        external_auto_budget: "auto_budget",
        external_promotion_schedule: "promotion_schedule",
      };
      const intervention =
        (await window.api.tiktokGmvMax.createSopInterventionDraft({
          sopInstanceId: instance.id,
          kind: kindByCode[issue.code] || "other",
          variable: issue.code,
          beforeValue: issue.currentValue,
          proposedValue: externalOperationDraft.value.actualValue.trim(),
          taskId: issue.taskId,
        })) as SopIntervention;
      interventionId = intervention.id;
    }
    await window.api.tiktokGmvMax.recordExternalSopIntervention({
      id: interventionId,
      startedDate: externalOperationDraft.value.startedDate,
      actualValue: externalOperationDraft.value.actualValue.trim(),
      evidenceNote: externalOperationDraft.value.evidenceNote.trim(),
      screenshotRef:
        externalOperationDraft.value.screenshotRef.trim() || undefined,
      evidenceAttachment: externalOperationDraft.value.evidenceAttachment,
      completedAt: Date.now(),
    });
    externalOperationIssue.value = null;
    notice.value = t("gmvMaxOperations.awaitingVerification");
    await refreshWorkspace(false);
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

async function handleGlobalSopIssue(issue: SopIssueResolution) {
  selectedSopId.value = issue.sopInstanceId;
  localStorage.setItem(SOP_SELECTION_STORAGE_KEY, issue.sopInstanceId);
  await nextTick();
  await handleSopIssue(issue);
}

async function handleCommandCenterAction(item: CommandCenterAction) {
  if (item.recommendationId) {
    openAction(item.recommendationId);
    return;
  }
  const issue = sopWorkspace.value.issueQueue.find(
    (entry) => entry.id === item.id,
  );
  if (issue) {
    await handleGlobalSopIssue(issue);
    return;
  }
  if (item.actionTarget === "audit") {
    auditCampaign.value = item.campaignId;
    auditView.value = "exceptions";
    selectFeatureTab("audit");
  }
}

async function openProfitIssueEditor(issue: SopIssueResolution) {
  const storeId =
    selectedSop.value?.storeId ||
    dashboard.value.bindings.find(
      (item) => item.campaignId === issue.campaignId,
    )?.storeId ||
    "";
  const productId = issue.productId || "";
  const campaignId = issue.campaignId || "";
  productCostCampaign.value = campaignId || "all";
  productCostSearch.value = productId;
  productCostScope.value = "all";
  productCostCompleteness.value = "all";
  closeSopDetail();
  activeTab.value = "profit";
  await loadProductCostPage(1);
  const existing = productCostPage.value.items.find(
    (item) =>
      item.productId === productId &&
      (!campaignId || item.campaignId === campaignId),
  );
  if (existing) {
    openProduct(existing);
    return;
  }
  const fetched =
    storeId && productId
      ? ((await window.api.tiktokGmvMax.getProductCost({
          storeId,
          campaignId,
          productId,
        })) as ProductCost | null)
      : null;
  openProduct(
    fetched || {
      id: "",
      storeId,
      campaignId,
      productId,
      productName: issue.productName || "",
      sellingPrice: "",
      variants: [],
      currency: "",
      purchaseCost: "",
      firstMileCost: "",
      lastMileCost: "",
      warehousingCost: "",
      platformCommissionRate: "",
      creatorCommissionRate: "",
      expectedReturnRate: "",
      returnLossRate: "",
    },
  );
}

async function handleSopIssue(issue?: SopIssueResolution) {
  if (!issue) return;
  if (issue.actionTarget === "seller_center") {
    openExternalOperation(issue);
    return;
  }
  if (issue.actionTarget === "sync") {
    syncData();
    return;
  }
  if (issue.actionTarget === "supplemental") {
    sopSupplementalExpanded.value = true;
    await nextTick();
    document
      .querySelector<HTMLElement>(
        '[data-testid="gmv-sop-supplemental"] input, [data-testid="gmv-sop-supplemental"] select',
      )
      ?.focus();
    return;
  }
  if (issue.actionTarget === "profit") {
    await openProfitIssueEditor(issue);
    return;
  }
  if (issue.actionTarget === "creatives") {
    creativeCampaign.value = issue.campaignId;
    activeTab.value = "creatives";
    await loadCreativePage(1);
    return;
  }
  if (issue.actionTarget === "actions") {
    actionCampaign.value = issue.campaignId;
    actionStatus.value =
      issue.code === "recommendation_failed" ? "failed" : "pending";
    activeTab.value = "actions";
    await loadActionPage(1);
    if (issue.recommendationId) openAction(issue.recommendationId);
    return;
  }
  if (issue.actionTarget === "audit") {
    auditCampaign.value = issue.campaignId;
    activeTab.value = "audit";
    await loadAuditPage(1);
  }
}

function formatExchangeRate(value?: string) {
  const parsed = optionalMetricNumber(value);
  if (parsed === null || parsed <= 0) return "-";
  return new Intl.NumberFormat(locale.value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 12,
  }).format(parsed);
}

function statusClass(value: string) {
  if (
    ["connected", "executed", "succeeded", "ENABLE", "ACTIVE"].includes(value)
  )
    return "is-success";
  if (["failed", "error", "expired"].includes(value)) return "is-danger";
  if (["pending", "authorizing", "executing", "started"].includes(value))
    return "is-warning";
  return "is-neutral";
}

function operationStatusLabel(value?: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const key = `gmvMaxOperationStatus.${normalized}`;
  return normalized && te(key) ? t(key) : value || "-";
}

function sopPickerOperationTone(value?: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["enable", "enabled", "active", "running", "live"].includes(normalized))
    return "is-positive";
  if (
    [
      "disable",
      "disabled",
      "inactive",
      "paused",
      "stopped",
      "closed",
      "deleted",
    ].includes(normalized)
  )
    return "is-negative";
  if (["pending", "reviewing", "scheduled", "processing"].includes(normalized))
    return "is-warning";
  return "is-neutral";
}

function sopPickerStatusTone(value: SopInstance["status"]) {
  if (value === "active" || value === "completed") return "is-positive";
  if (value === "blocked") return "is-negative";
  if (value === "paused") return "is-warning";
  return "is-neutral";
}

function policyPresetLabel(value?: string) {
  const normalized = String(value || "roi_guard")
    .trim()
    .toLowerCase();
  const key = `gmvMax.presets.${normalized}`;
  return te(key) ? t(key) : value || "-";
}

function clearProductImage(item: { imageUrl?: string }) {
  item.imageUrl = undefined;
}

function openProductImage(item: {
  imageUrl?: string;
  productName?: string;
  productId: string;
}) {
  if (!item.imageUrl) return;
  imagePreview.value = {
    url: item.imageUrl,
    title: item.productName || item.productId,
    productId: item.productId,
  };
}

function closeProductImage() {
  imagePreview.value = null;
}

function creativeVideoSource(item: CreativePerformance) {
  const raw = item.raw || {};
  const videoInfo =
    raw.video_info && typeof raw.video_info === "object"
      ? (raw.video_info as Record<string, unknown>)
      : {};
  const directUrl = [
    raw.preview_url,
    raw.video_url,
    raw.play_url,
    raw.download_url,
    videoInfo.preview_url,
    videoInfo.video_url,
    videoInfo.play_url,
    videoInfo.download_url,
  ]
    .map((value) => String(value || "").trim())
    .find((value) => /^https?:\/\//i.test(value));
  const videoId = [
    raw.video_id,
    raw.item_id,
    videoInfo.item_id,
    item.itemId,
    item.creativeId,
  ]
    .map((value) => String(value || "").trim())
    .find((value) => /^\d{10,24}$/.test(value));
  const externalUrl = videoId
    ? `https://www.tiktok.com/@_/video/${encodeURIComponent(videoId)}`
    : directUrl || "";
  if (directUrl) return { url: directUrl, externalUrl, embedded: false };
  return videoId
    ? {
        url: `https://www.tiktok.com/player/v1/${encodeURIComponent(videoId)}?autoplay=1&controls=1`,
        externalUrl,
        embedded: true,
      }
    : null;
}

function creativeVideoAvailable(item: CreativePerformance) {
  return creativeVideoSource(item) !== null;
}

function openCreativeVideo(item: CreativePerformance) {
  const source = creativeVideoSource(item);
  if (!source) return;
  creativeVideoPreview.value = {
    ...source,
    title: item.creativeName || item.creativeId,
    creativeId: item.creativeId,
  };
}

function closeCreativeVideo() {
  creativeVideoPreview.value = null;
}

function resetSopPanels() {
  sopAutomationSettingsExpanded.value = false;
  sopHistoryExpanded.value = false;
  sopMetricsExpanded.value = false;
  sopSupplementalExpanded.value = false;
  sopBulkToolsExpanded.value = false;
  sopDnaExpanded.value = true;
  sopCompletedTasksExpanded.value = false;
}

function openSopPicker(event: MouseEvent) {
  sopPickerTrigger = event.currentTarget as HTMLElement;
  sopPickerQuery.value = "";
  sopPickerStore.value = "all";
  sopPickerOpen.value = true;
  void nextTick(() => sopPickerSearch.value?.focus());
}

function closeSopPicker() {
  sopPickerOpen.value = false;
  void nextTick(() => sopPickerTrigger?.focus());
}

function selectSopInstance(id: string, openDetail = true) {
  selectedSopId.value = id;
  if (openDetail) {
    sopDetailOpen.value = true;
    sopDetailTab.value = "decision";
  }
  closeSopPicker();
}

function closeSopDetail() {
  sopDetailOpen.value = false;
}

function focusSopDetailSection(tab: typeof sopDetailTab.value) {
  sopDetailTab.value = tab;
  void nextTick(() => {
    const target = document.querySelector<HTMLElement>(
      `[data-sop-detail-section="${tab}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function trapSopPickerFocus(event: KeyboardEvent) {
  if (event.key !== "Tab" || !sopPickerDialog.value) return;
  const focusable = [
    ...sopPickerDialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function copySopIdentifier(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return;
  await navigator.clipboard.writeText(normalized);
  notice.value = t("gmvMaxSopUi.identifierCopied");
}

function hideBrokenSopImage(event: Event) {
  (event.currentTarget as HTMLImageElement).hidden = true;
}

function shortSopIdentifier(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  return normalized.length > 14 ? `...${normalized.slice(-10)}` : normalized;
}

function sopVideoPlayable(item: SopCreativeVideo) {
  return Boolean(item.videoUrl || item.embedUrl);
}

function openSopCreativeVideo(item: SopCreativeVideo) {
  const url = item.videoUrl || item.embedUrl;
  if (!url) return;
  creativeVideoPreview.value = {
    url,
    externalUrl: item.externalUrl || item.videoUrl || "",
    title: item.name,
    creativeId: item.creativeId,
    embedded: !item.videoUrl && Boolean(item.embedUrl),
  };
}

function selectSopVideoGrade(grade: SopVideoGrade) {
  selectedSopVideoGrade.value = grade;
  sopVideoPage.value = 1;
  selectedSopVideoId.value = "";
}

function changeSopVideoPage(page: number) {
  sopVideoPage.value = Math.min(sopVideoPageCount.value, Math.max(1, page));
  selectedSopVideoId.value = "";
}

async function createSopCreativeAction(
  item: SopCreativeVideo,
  operation: "ADD" | "REMOVE",
) {
  if (!selectedSop.value || sopCreativeActionBlocked.value) return;
  busyAction.value = `sop-creative:${operation}:${item.creativeId}`;
  errorText.value = "";
  try {
    await window.api.tiktokGmvMax.createSopInterventionDraft({
      sopInstanceId: selectedSop.value.id,
      kind: "creative",
      variable: `creative_${operation.toLowerCase()}_${item.creativeId}`,
      beforeValue: item.deliveryStatus || "UNKNOWN",
      proposedValue: operation,
      actionPayload: { operation, creativeId: item.creativeId },
    });
    notice.value = t(
      operation === "ADD"
        ? "gmvMaxSopVideoWorkbench.actions.heatCreated"
        : "gmvMaxSopVideoWorkbench.actions.excludeCreated",
    );
    actionCampaign.value = item.campaignId;
    await refreshWorkspace(false);
    await loadActionPage(1);
    activeTab.value = "actions";
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

function hideBrokenSopVideoCover(item: SopCreativeVideo) {
  item.coverUrl = undefined;
}

function sopVideoDuration(value?: number) {
  if (!value || !Number.isFinite(value))
    return t("gmvMaxSopVideo.notAvailable");
  const seconds = Math.round(value);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : `${seconds}s`;
}

function sopVideoSource(value?: string) {
  const key = `gmvMaxSopVideo.sources.${String(value || "unknown").toLowerCase()}`;
  return te(key) ? t(key) : value || t("gmvMaxSopVideo.notAvailable");
}

function sopVideoAnalysis(code: string) {
  const key = `gmvMaxSopVideo.analysis.${code}`;
  return te(key) ? t(key) : code;
}

function formatMatureBaselineRoi(baseline: MatureBaseline) {
  return baseline.deliveryDays > 0
    ? formatRoi(baseline.roi)
    : t("gmvMaxSopUi.noActiveDelivery");
}

async function openCreativeVideoExternal() {
  if (!creativeVideoPreview.value?.externalUrl) return;
  await window.api.shell.openExternal(creativeVideoPreview.value.externalUrl);
}

function handleWorkspaceKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && syncDetailsOpen.value) {
    event.preventDefault();
    syncDetailsOpen.value = false;
    return;
  }
  if (event.key === "Escape" && sopDetailOpen.value) {
    event.preventDefault();
    closeSopDetail();
    return;
  }
  if (event.key === "Escape" && externalOperationIssue.value) {
    event.preventDefault();
    closeExternalOperation();
    return;
  }
  if (event.key === "Escape" && sopPickerOpen.value) {
    event.preventDefault();
    closeSopPicker();
    return;
  }
  if (event.key === "Escape" && imagePreview.value) closeProductImage();
  if (event.key === "Escape" && creativeVideoPreview.value)
    closeCreativeVideo();
}

function toggleFeatureNav() {
  featureNavCollapsed.value = !featureNavCollapsed.value;
  localStorage.setItem(NAV_STORAGE_KEY, String(featureNavCollapsed.value));
}

function selectFeatureTab(tabId: TabId) {
  activeTab.value = tabId;
  requestAnimationFrame(() =>
    document
      .querySelector(".ds-workspace")
      ?.scrollTo({ top: 0, behavior: "auto" }),
  );
}

function openHelpIssue(code: string) {
  helpFocusIssueCode.value = code;
  selectFeatureTab("help");
}

function syncPolicyDrafts() {
  const next: Record<string, Policy> = {};
  for (const campaign of dashboard.value.campaigns) {
    const existing = dashboard.value.policies.find(
      (item) => item.campaignId === campaign.id,
    );
    next[campaign.id] = existing
      ? { ...existing }
      : {
          campaignId: campaign.id,
          preset: "roi_guard",
          automationEnabled: false,
          minRoi: "1",
          promotionAutoExecutionEnabled: false,
          targetCpa: "0",
          creativeTestBudget: "0",
          creativeExplorationSharePercent: 15,
          minExplorationCreatives: 3,
          winnerTrafficCapPercent: 70,
          profitSafetyMarginPercent: 15,
          budgetPermission: false,
          roiPermission: false,
          statusPermission: false,
          creativePermission: false,
          sessionPermission: false,
          shadowMode: true,
          pilotEnabled: false,
          pauseOnZeroOrders: false,
        };
  }
  policyDrafts.value = next;
  storeCostDrafts.value = Object.fromEntries(
    dashboard.value.bindings
      .filter(
        (item, index, values) =>
          values.findIndex((entry) => entry.storeId === item.storeId) === index,
      )
      .map((binding) => {
        const existing = dashboard.value.storeCosts.find(
          (item) => item.storeId === binding.storeId,
        );
        const currency = binding.currency || existing?.currency || "";
        const timezone = binding.timezone || existing?.timezone || "";
        return [
          binding.storeId,
          existing
            ? { ...existing, currency, timezone }
            : {
                id: "",
                connectionId: binding.connectionId,
                advertiserId: binding.advertiserId,
                storeId: binding.storeId,
                currency,
                timezone,
                cnyExchangeRate: ["CNY", "RMB", "CNH"].includes(
                  String(currency).toUpperCase(),
                )
                  ? "1"
                  : "",
                purchaseCost: "",
                firstMileCost: "",
                lastMileCost: "",
                warehousingCost: "",
                platformCommissionRate: "",
                creatorCommissionRate: "",
                expectedReturnRate: "",
                returnLossRate: "",
              },
        ];
      }),
  );
  notificationDraft.value = {
    enabled: dashboard.value.notificationConfig?.enabled || false,
    target: dashboard.value.notificationConfig?.target || "",
    dailySummaryEnabled:
      dashboard.value.notificationConfig?.dailySummaryEnabled ?? true,
  };
}

async function loadDashboard() {
  loading.value = true;
  errorText.value = "";
  const input = {
    startDate: startDate.value,
    endDate: endDate.value,
    includeCreativeMetrics: false,
  };
  const result = await dashboardRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getDashboard(input) as Promise<Dashboard>,
  );
  if (!result.current) return;
  loading.value = false;
  if (result.status === "error") {
    errorText.value =
      (result.error as any)?.message || String(result.error);
    return;
  }
  dashboard.value = result.value;
  syncPolicyDrafts();
}

async function loadSopWorkspace() {
  if (sopLoading.value || sopRefreshing.value) return;
  const requestId = ++sopWorkspaceRequestId;
  const initialLoad = !sopWorkspace.value.instances.length;
  if (initialLoad) sopLoading.value = true;
  else sopRefreshing.value = true;
  errorText.value = "";
  let timeoutId = 0;
  try {
    const request = Promise.all([
      window.api.tiktokGmvMax.getCoachWorkspace() as Promise<SopWorkspace>,
      window.api.tiktokGmvMax.getCommandCenter() as Promise<CommandCenter>,
    ]);
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("GMV MAX SOP workspace request timed out.")),
        15_000,
      );
    });
    const [workspace, commandCenterWorkspace] = await Promise.race([
      request,
      timeout,
    ]);
    if (requestId !== sopWorkspaceRequestId) return;
    sopWorkspace.value = workspace;
    commandCenter.value = commandCenterWorkspace;
    const latestSyncJob = sopWorkspace.value.latestSyncJob;
    const latestSyncJobAge = latestSyncJob?.updatedAt
      ? Date.now() - latestSyncJob.updatedAt
      : Number.POSITIVE_INFINITY;
    const restoreSyncJob =
      latestSyncJob &&
      (latestSyncJob.status === "running" ||
        latestSyncJob.status === "failed" ||
        latestSyncJob.status === "interrupted" ||
        (latestSyncJob.status === "completed" &&
          latestSyncJobAge < 10 * 60_000));
    if (
      restoreSyncJob &&
      (!syncProgress.value || syncProgress.value.jobId !== latestSyncJob.jobId)
    ) {
      applySyncProgress(latestSyncJob);
      void nextTick(() => syncProgressDialog.value?.focus());
    }
    if (
      !selectedSopId.value ||
      !sopWorkspace.value.instances.some(
        (item) => item.id === selectedSopId.value,
      )
    ) {
      const storedSelection =
        localStorage.getItem(SOP_SELECTION_STORAGE_KEY) || "";
      selectedSopId.value = sopWorkspace.value.instances.some(
        (item) => item.id === storedSelection,
      )
        ? storedSelection
        : sopWorkspace.value.instances[0]?.id || "";
    }
    if (!sopStartDraft.value.campaignId)
      sopStartDraft.value.campaignId = sopCampaignOptions.value[0]?.id || "";
    if (!supplementalDraft.value.campaignId)
      supplementalDraft.value.campaignId =
        selectedSop.value?.campaignId || dashboard.value.campaigns[0]?.id || "";
  } catch (error: any) {
    if (requestId !== sopWorkspaceRequestId) return;
    errorText.value = error?.message || String(error);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    if (requestId === sopWorkspaceRequestId) {
      sopLoading.value = false;
      sopRefreshing.value = false;
    }
  }
}

async function loadCampaignPage(page = campaignPage.value) {
  campaignDataLoading.value = true;
  errorText.value = "";
  const input = {
    page,
    pageSize: campaignPageSize.value,
    startDate: startDate.value,
    endDate: endDate.value,
    storeId: selectedStore.value,
    campaignType: selectedType.value,
    status: campaignStatus.value,
    pacingState: campaignPacingState.value,
    search: searchText.value,
    minSpend: cnyFilterToSource(minCampaignSpend.value),
    minOrders: minCampaignOrders.value,
    minRoi: minCampaignRoi.value,
    minUtilization: minCampaignUtilization.value,
    sortBy: campaignSortBy.value,
    sortDirection: campaignSortDirection.value,
  };
  const result = await campaignPageRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getCampaignPage(input) as Promise<CampaignDataPage>,
  );
  if (!result.current) return;
  campaignDataLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  campaignDataPage.value = result.value;
  campaignPage.value = result.value.page;
}

async function loadCreativePage(page = creativePage.value.page) {
  creativeLoading.value = true;
  errorText.value = "";
  const input = {
    page,
    pageSize: creativePage.value.pageSize,
    startDate: startDate.value,
    endDate: endDate.value,
    storeId: selectedStore.value,
    campaignId: creativeCampaign.value,
    source: creativeSource.value,
    state: creativeState.value,
    search: searchText.value,
    minSpend: cnyFilterToSource(minCreativeSpend.value),
    minOrders: minCreativeOrders.value,
    minRoi: minCreativeRoi.value,
    maxCpa: cnyFilterToSource(maxCreativeCpa.value),
    minCtr: minCreativeCtr.value,
    sortBy: creativeSortBy.value,
    sortDirection: creativeSortDirection.value,
  };
  const result = await creativePageRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getCreativePage(input) as Promise<CreativePage>,
  );
  if (!result.current) return;
  creativeLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  creativePage.value = result.value;
}

async function loadListEntryPage(page = listEntryPage.value.page) {
  listEntryLoading.value = true;
  const input = {
    page,
    pageSize: listEntryPage.value.pageSize,
    storeId: selectedStore.value,
    campaignId: creativeCampaign.value,
    mode: listEntryMode.value,
    entityType: "creative" as const,
    search: listEntrySearch.value,
  };
  const result = await listEntryPageRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getListEntryPage(input) as Promise<ListEntryPage>,
  );
  if (!result.current) return;
  listEntryLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  listEntryPage.value = result.value;
}

async function loadProductPage(page = productPage.value.page) {
  productLoading.value = true;
  errorText.value = "";
  const input = {
    page,
    pageSize: productPage.value.pageSize,
    startDate: startDate.value,
    endDate: endDate.value,
    storeId: selectedStore.value,
    campaignId: productCampaign.value,
    state: productState.value,
    allocationState: productAllocation.value,
    search: searchText.value,
    minSpend: cnyFilterToSource(minProductSpend.value),
    minOrders: minProductOrders.value,
    minRoi: minProductRoi.value,
    minScore: minProductScore.value,
    sortBy: productSortBy.value,
    sortDirection: productSortDirection.value,
  };
  const result = await productPageRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getProductPage(input) as Promise<ProductPage>,
  );
  if (!result.current) return;
  productLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  productPage.value = result.value;
}

async function loadProductCostPage(page = productCostPage.value.page) {
  productCostLoading.value = true;
  const input = {
    page,
    pageSize: productCostPage.value.pageSize,
    storeId: selectedStore.value,
    campaignId: productCostCampaign.value,
    scope: productCostScope.value,
    completeness: productCostCompleteness.value,
    search: productCostSearch.value,
    sortBy: productCostSortBy.value,
    sortDirection: productCostSortDirection.value,
  };
  const result = await productCostPageRequest.run(
    JSON.stringify(input),
    () =>
      window.api.tiktokGmvMax.getProductCostPage(
        input,
      ) as Promise<ProductCostPage>,
  );
  if (!result.current) return;
  productCostLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  productCostPage.value = result.value;
}

async function loadActionPage(page = actionPage.value.page) {
  actionLoading.value = true;
  errorText.value = "";
  const input = {
    page,
    pageSize: actionPage.value.pageSize,
    startDate: startDate.value,
    endDate: endDate.value,
    storeId: selectedStore.value,
    campaignId: actionCampaign.value,
    status: actionStatus.value,
    actionType: actionType.value,
    risk: actionRisk.value,
    search: searchText.value,
    sortBy: actionSortBy.value,
    sortDirection: actionSortDirection.value,
  };
  const result = await actionPageRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getActionPage(input) as Promise<ActionPage>,
  );
  if (!result.current) return;
  actionLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  actionPage.value = result.value;
}

async function loadOutcomePage(page = outcomePage.value.page) {
  outcomeLoading.value = true;
  errorText.value = "";
  const input = {
    page,
    pageSize: outcomePage.value.pageSize,
    startDate: startDate.value,
    endDate: endDate.value,
    storeId: selectedStore.value,
    sortDirection: "desc" as const,
  };
  const result = await outcomePageRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getOutcomePage(input) as Promise<OutcomePage>,
  );
  if (!result.current) return;
  outcomeLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  outcomePage.value = result.value;
}

async function loadAuditPage(page = auditPage.value.page) {
  auditLoading.value = true;
  errorText.value = "";
  const input = {
    page,
    pageSize: auditPage.value.pageSize,
    startDate: startDate.value,
    endDate: endDate.value,
    storeId: selectedStore.value,
    campaignId: auditCampaign.value,
    status: auditStatus.value,
    action: auditAction.value,
    search: searchText.value,
    sortDirection: auditSortDirection.value,
  };
  const result = await auditPageRequest.run(JSON.stringify(input), () =>
    window.api.tiktokGmvMax.getAuditPage(input) as Promise<AuditPage>,
  );
  if (!result.current) return;
  auditLoading.value = false;
  if (result.status === "error") {
    errorText.value = (result.error as any)?.message || String(result.error);
    return;
  }
  auditPage.value = result.value;
}

function campaignScopeAvailable(campaignId: string) {
  if (campaignId === "all") return true;
  const campaign = dashboard.value.campaigns.find(
    (item) => item.id === campaignId,
  );
  return Boolean(
    campaign &&
    (selectedStore.value === "all" ||
      campaign.storeId === selectedStore.value) &&
    (selectedType.value === "all" ||
      campaign.campaignType === selectedType.value),
  );
}

function normalizeCampaignScopes() {
  if (!campaignScopeAvailable(creativeCampaign.value))
    creativeCampaign.value = "all";
  if (!campaignScopeAvailable(productCampaign.value))
    productCampaign.value = "all";
  if (!campaignScopeAvailable(productCostCampaign.value))
    productCostCampaign.value = "all";
  if (!campaignScopeAvailable(actionCampaign.value))
    actionCampaign.value = "all";
  if (!campaignScopeAvailable(auditCampaign.value)) auditCampaign.value = "all";
}

async function loadActiveData(resetPage: boolean) {
  if (activeTab.value === "sop") await loadSopWorkspace();
  if (activeTab.value === "campaigns")
    await loadCampaignPage(resetPage ? 1 : campaignPage.value);
  if (activeTab.value === "creatives")
    await loadCreativeContext(
      resetPage ? 1 : creativePage.value.page,
      resetPage ? 1 : listEntryPage.value.page,
    );
  if (activeTab.value === "growth")
    await Promise.all([
      loadProductPage(resetPage ? 1 : productPage.value.page),
      loadOutcomePage(resetPage ? 1 : outcomePage.value.page),
    ]);
  if (activeTab.value === "profit")
    await loadProductCostPage(resetPage ? 1 : productCostPage.value.page);
  if (activeTab.value === "actions")
    await loadActionPage(resetPage ? 1 : actionPage.value.page);
  if (activeTab.value === "audit")
    await loadAuditPage(resetPage ? 1 : auditPage.value.page);
}

async function refreshWorkspace(resetPage = false) {
  await loadDashboard();
  normalizeCampaignScopes();
  await loadActiveData(resetPage);
}

async function applyDataFilters() {
  await refreshWorkspace(true);
}

function toggleCampaignSort(field: typeof campaignSortBy.value) {
  if (campaignSortBy.value === field)
    campaignSortDirection.value =
      campaignSortDirection.value === "asc" ? "desc" : "asc";
  else {
    campaignSortBy.value = field;
    campaignSortDirection.value = field === "name" ? "asc" : "desc";
  }
  void loadCampaignPage(1);
}

function toggleCreativeSort(field: string) {
  if (creativeSortBy.value === field)
    creativeSortDirection.value =
      creativeSortDirection.value === "asc" ? "desc" : "asc";
  else {
    creativeSortBy.value = field;
    creativeSortDirection.value = field === "creativeName" ? "asc" : "desc";
  }
  void loadCreativePage(1);
}

function toggleProductSort(field: string) {
  if (productSortBy.value === field)
    productSortDirection.value =
      productSortDirection.value === "asc" ? "desc" : "asc";
  else {
    productSortBy.value = field;
    productSortDirection.value = field === "productName" ? "asc" : "desc";
  }
  void loadProductPage(1);
}

function toggleProductCostSort(field: string) {
  if (productCostSortBy.value === field)
    productCostSortDirection.value =
      productCostSortDirection.value === "asc" ? "desc" : "asc";
  else {
    productCostSortBy.value = field;
    productCostSortDirection.value = field === "productName" ? "asc" : "desc";
  }
  void loadProductCostPage(1);
}

function toggleActionSort(field: string) {
  if (actionSortBy.value === field)
    actionSortDirection.value =
      actionSortDirection.value === "asc" ? "desc" : "asc";
  else {
    actionSortBy.value = field;
    actionSortDirection.value =
      field === "status" || field === "actionType" ? "asc" : "desc";
  }
  void loadActionPage(1);
}

function toggleAuditSort() {
  auditSortDirection.value =
    auditSortDirection.value === "asc" ? "desc" : "asc";
  void loadAuditPage(1);
}

function sortMark(
  field: string,
  activeField: string,
  direction: "asc" | "desc",
) {
  if (field !== activeField) return "";
  return direction === "asc"
    ? t("gmvMaxActionData.ascending")
    : t("gmvMaxActionData.descending");
}

async function runAction(
  id: string,
  action: () => Promise<unknown>,
  message: string,
) {
  busyAction.value = id;
  notice.value = "";
  errorText.value = "";
  try {
    await action();
    notice.value = message;
    await refreshWorkspace(false);
    return true;
  } catch (error: any) {
    errorText.value = readableError(error);
    return false;
  } finally {
    busyAction.value = "";
  }
}

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const pendingVerification = message.match(/GMV_MAX_ACTION_PENDING_VERIFICATION:(\w+)/i);
  if (pendingVerification) {
    const actionType = pendingVerification[1].toLowerCase();
    const key = actionType === "creative"
      ? "gmvMaxRuntime.creativeVerificationPending"
      : actionType === "session"
        ? "gmvMaxRuntime.sessionVerificationPending"
        : "gmvMaxRuntime.actionVerificationPending";
    return t(key);
  }
  const shadowDays = message.match(/GMV_MAX_SHADOW_DAYS_REQUIRED:(\d+):(\d+)/i);
  if (shadowDays) {
    return t("gmvMaxRuntime.shadowDaysRequired", {
      completed: Number(shadowDays[1]),
      remaining: Number(shadowDays[2]),
    });
  }
  if (/Hero SKU is required/i.test(message)) return t("gmvMaxSop.start.hint");
  if (/campaign does not exist/i.test(message))
    return t("gmvMaxSop.errors.campaignRequired");
  return message.replace(
    /^Error invoking remote method '[^']+': Error:\s*/i,
    "",
  );
}

const syncProgressTitle = computed(() =>
  t(
    `gmvMaxSyncProgress.${syncProgress.value?.action === "catalog" ? "catalogTitle" : "dataTitle"}`,
  ),
);
const syncNeedsRecovery = computed(
  () =>
    syncProgress.value?.status === "failed" ||
    syncProgress.value?.status === "interrupted",
);
const syncProgressDescription = computed(() => {
  if (!syncProgress.value) return "";
  if (syncProgress.value.status === "interrupted")
    return t("gmvMaxIssueResolutions.items.sync_interrupted.reason");
  if (
    syncProgress.value.phase === "delivery" ||
    syncProgress.value.phase === "catalog"
  )
    return t(
      `gmvMaxSyncProgress.${syncProgress.value.action === "catalog" ? "catalogRunning" : "dataRunning"}`,
    );
  if (syncProgress.value.phase === "sop") return t("gmvMaxSyncProgress.sop");
  if (syncProgress.value.phase === "refresh")
    return t("gmvMaxSyncProgress.refreshing");
  return t(
    `gmvMaxSyncProgress.${syncProgress.value.phase}`,
    syncProgress.value.message,
  );
});
const syncProgressSteps = computed(() => [
  t("gmvMaxSyncProgress.steps.prepare"),
  t(
    `gmvMaxSyncProgress.steps.${syncProgress.value?.action === "catalog" ? "catalog" : "data"}`,
  ),
  t("gmvMaxSyncProgress.steps.sop"),
  t("gmvMaxSyncProgress.steps.refresh"),
]);

const syncVisibleProgress = computed(() =>
  Math.round(syncDisplayProgress.value),
);

function stopSyncProgressAnimation() {
  if (syncProgressTimer) clearInterval(syncProgressTimer);
  syncProgressTimer = null;
}

function stopSyncProgressPolling() {
  if (syncProgressPollTimer) clearInterval(syncProgressPollTimer);
  syncProgressPollTimer = null;
  syncProgressPollJobId = "";
  syncProgressPollInFlight = false;
}

function applySyncProgress(progress: SyncProgressState) {
  const previousJobId = syncProgress.value?.jobId;
  if (previousJobId && previousJobId !== progress.jobId)
    syncDisplayProgress.value = Number(progress.progress) || 0;
  syncProgress.value = progress;
  syncDisplayProgress.value = Math.max(
    syncDisplayProgress.value,
    Number(progress.progress) || 0,
  );
  if (progress.status === "running") {
    startSyncProgressAnimation();
    if (progress.jobId) startSyncProgressPolling(progress.jobId);
    return;
  }
  stopSyncProgressAnimation();
  stopSyncProgressPolling();
  if (
    progress.status === "completed" &&
    progress.jobId &&
    syncCompletionHandledJobId !== progress.jobId
  ) {
    syncCompletionHandledJobId = progress.jobId;
    void refreshWorkspace(false);
    window.setTimeout(() => {
      if (
        syncProgress.value?.jobId === progress.jobId &&
        !syncDetailsOpen.value
      ) {
        syncProgress.value = null;
        syncDisplayProgress.value = 0;
      }
    }, 2400);
  }
}

async function pollSyncProgress() {
  const jobId = syncProgress.value?.jobId;
  if (
    !jobId ||
    syncProgressPollInFlight ||
    syncProgress.value?.status !== "running"
  )
    return;
  syncProgressPollInFlight = true;
  try {
    const progress = (await window.api.tiktokGmvMax.getSyncJob({
      jobId,
    })) as SyncProgressState | null;
    if (progress?.jobId === jobId) applySyncProgress(progress);
  } catch {
    // The event channel remains authoritative when polling is temporarily unavailable.
  } finally {
    syncProgressPollInFlight = false;
  }
}

function startSyncProgressPolling(jobId: string) {
  if (!jobId) return;
  if (syncProgressPollJobId === jobId && syncProgressPollTimer) return;
  stopSyncProgressPolling();
  syncProgressPollJobId = jobId;
  void pollSyncProgress();
  syncProgressPollTimer = setInterval(() => {
    void pollSyncProgress();
  }, 900);
}

function syncProgressCeiling(progress: number) {
  if (progress >= 100) return 100;
  if (progress >= 90) return 98;
  if (progress >= 70) return 86;
  if (progress >= 20) return 64;
  return 18;
}

function startSyncProgressAnimation() {
  stopSyncProgressAnimation();
  syncProgressTimer = setInterval(() => {
    const state = syncProgress.value;
    if (!state || state.status !== "running") return;
    const ceiling = syncProgressCeiling(state.progress);
    if (syncDisplayProgress.value < ceiling)
      syncDisplayProgress.value = Math.min(
        ceiling,
        syncDisplayProgress.value + 1,
      );
  }, 450);
}

function syncStepClass(index: number) {
  const state = syncProgress.value;
  if (!state) return "";
  if (state.status === "completed" || index < state.current)
    return "is-complete";
  if (index === state.current)
    return state.status === "failed" || state.status === "interrupted"
      ? "is-failed"
      : "is-active";
  return "";
}

async function runSyncAction(actionId: SyncActionId, message: string) {
  if (busyAction.value) return false;
  busyAction.value = actionId;
  notice.value = "";
  errorText.value = "";
  const action = actionId === "sync-catalogs" ? "catalog" : "data";
  syncProgress.value = {
    action,
    status: "running",
    phase: "preparing",
    message: "",
    current: 0,
    total: 4,
    progress: 5,
  };
  syncDisplayProgress.value = 5;
  syncCompletionHandledJobId = "";
  startSyncProgressAnimation();
  try {
    const started = (await window.api.tiktokGmvMax.runSyncJob({ action })) as
      Partial<SyncProgressState> | undefined;
    if (started?.jobId)
      applySyncProgress({
        ...syncProgress.value,
        ...started,
        action,
      } as SyncProgressState);
    notice.value = message;
    return true;
  } catch (error: any) {
    errorText.value = error?.message || String(error);
    if (syncProgress.value)
      syncProgress.value = {
        ...syncProgress.value,
        status: "failed",
        phase: "failed",
        error: errorText.value,
      };
    stopSyncProgressAnimation();
    return false;
  } finally {
    busyAction.value = "";
  }
}

function dismissSyncFailure() {
  if (!syncNeedsRecovery.value) return;
  stopSyncProgressAnimation();
  stopSyncProgressPolling();
  syncProgress.value = null;
}

function retrySync() {
  const actionId: SyncActionId =
    syncProgress.value?.action === "catalog" ? "sync-catalogs" : "sync";
  stopSyncProgressAnimation();
  stopSyncProgressPolling();
  syncProgress.value = null;
  void runSyncAction(
    actionId,
    actionId === "sync-catalogs"
      ? t("gmvMaxCatalog.synced")
      : t("gmvMax.messages.synced"),
  );
}

function connect() {
  void runAction(
    "connect",
    () => window.api.tiktokGmvMax.connect(),
    t("gmvMax.messages.connected"),
  );
}

function disconnect(connectionId: string) {
  void runAction(
    "disconnect",
    () => window.api.tiktokGmvMax.disconnect({ connectionId }),
    t("gmvMax.messages.disconnected"),
  );
}

function reconnect(connectionId: string) {
  void runAction(
    "reconnect",
    () => window.api.tiktokGmvMax.reconnect({ connectionId }),
    t("gmvMax.messages.connected"),
  );
}

function syncData() {
  void runSyncAction("sync", t("gmvMax.messages.synced"));
}

function syncCatalogs() {
  void runSyncAction("sync-catalogs", t("gmvMaxCatalog.synced"));
}

function evaluate() {
  void runAction(
    "evaluate",
    () => window.api.tiktokGmvMax.evaluate(),
    t("gmvMax.messages.evaluated"),
  );
}

async function optimizeCreatives() {
  busyAction.value = "optimize-creatives";
  notice.value = "";
  errorText.value = "";
  try {
    const result = (await window.api.tiktokGmvMax.evaluate({
      campaignId:
        creativeCampaign.value === "all" ? undefined : creativeCampaign.value,
      scope: "creative",
    })) as Recommendation[];
    const count = result.filter((item) =>
      ["creative", "session"].includes(String(item.actionType)),
    ).length;
    notice.value = t("gmvMaxCreativeOptimize.completed", { count });
    await refreshWorkspace(false);
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

function analyzeGrowth() {
  void runAction(
    "analyze-growth",
    () => window.api.tiktokGmvMax.analyzeGrowth(),
    t("gmvMaxLearning.analyzed"),
  );
}

function approve(id: string) {
  void runAction(
    `approve:${id}`,
    () => window.api.tiktokGmvMax.approve({ id }),
    t("gmvMax.messages.approved"),
  );
}

function toggleActionSelection(item: Recommendation) {
  if (item.status !== "pending") return;
  selectedActionIds.value = selectedActionIds.value.includes(item.id)
    ? selectedActionIds.value.filter((id) => id !== item.id)
    : [...selectedActionIds.value, item.id];
}

function approveSelectedActions() {
  const ids = selectedActionIds.value;
  if (!ids.length || !batchRisk.value) return;
  void runAction(
    "approve-batch",
    async () => {
      await window.api.tiktokGmvMax.approveBatch({ ids });
      selectedActionIds.value = [];
    },
    t("gmvMaxOperations.batchApproved", { count: ids.length }),
  );
}

function setEmergencyStop(stopped: boolean) {
  void runAction(
    "emergency-stop",
    () => window.api.tiktokGmvMax.setEmergencyStop({ stopped }),
    stopped ? t("gmvMaxOperations.paused") : t("gmvMaxOperations.resumed"),
  );
}

function reject(id: string) {
  void runAction(
    `reject:${id}`,
    () => window.api.tiktokGmvMax.reject({ id }),
    t("gmvMax.messages.rejected"),
  );
}

function approvePortfolio(id: string) {
  void runAction(
    `approve-portfolio:${id}`,
    () => window.api.tiktokGmvMax.approvePortfolio({ id }),
    t("gmvMax.messages.approved"),
  );
}

function rejectPortfolio(id: string) {
  void runAction(
    `reject-portfolio:${id}`,
    () => window.api.tiktokGmvMax.rejectPortfolio({ id }),
    t("gmvMax.messages.rejected"),
  );
}

async function savePolicy(campaignId: string) {
  const draft = policyDrafts.value[campaignId];
  if (!draft) return;
  const saved = await runAction(
    `policy:${campaignId}`,
    () => window.api.tiktokGmvMax.savePolicy({ ...draft }),
    t("gmvMax.messages.policySaved"),
  );
  if (saved) closeDrawer();
}

function saveStoreCost(storeId: string) {
  const draft = storeCostDrafts.value[storeId];
  if (!draft) return;
  const payload = { ...draft };
  void runAction(
    `store-cost:${storeId}`,
    () => window.api.tiktokGmvMax.saveStoreCost(payload as any),
    t("gmvMax.messages.policySaved"),
  );
}
function saveProductCost() {
  if (!newProduct.value.storeId || !newProduct.value.productId) return;
  void runAction(
    "product-cost",
    () => window.api.tiktokGmvMax.saveProductCost(newProduct.value as any),
    t("gmvMax.messages.policySaved"),
  );
}
function saveRuleGroup() {
  if (!newRule.value.name) return;
  void runAction(
    "rule-group",
    () => window.api.tiktokGmvMax.saveRuleGroup(newRule.value as any),
    t("gmvMax.messages.policySaved"),
  );
}
function bindRule(campaignId: string, ruleGroupId: string) {
  if (ruleGroupId)
    void runAction(
      `bind:${campaignId}`,
      () => window.api.tiktokGmvMax.bindRuleGroup({ campaignId, ruleGroupId }),
      t("gmvMax.messages.policySaved"),
    );
}
function saveListEntry() {
  if (!newListEntry.value.storeId || !newListEntry.value.entityId) return;
  void runAction(
    "list-entry",
    () => window.api.tiktokGmvMax.saveListEntry(newListEntry.value as any),
    t("gmvMax.messages.policySaved"),
  );
}
async function runBacktest() {
  busyAction.value = "backtest";
  notice.value = "";
  errorText.value = "";
  try {
    const result = (await window.api.tiktokGmvMax.backtest({
      days: 30,
    })) as Backtest;
    dashboard.value = {
      ...dashboard.value,
      backtests: [
        result,
        ...dashboard.value.backtests.filter((item) => item.id !== result.id),
      ].slice(0, 20),
    };
    notice.value = t("gmvMax.messages.evaluated");
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    busyAction.value = "";
  }
}
function openSetupStep(step: "connect" | "sync" | "cost" | "shadow") {
  if (step === "connect") connect();
  else if (step === "sync") syncData();
  else if (step === "cost") activeTab.value = "profit";
  else activeTab.value = "rules";
}
function rollback(id: string) {
  void runAction(
    `rollback:${id}`,
    () => window.api.tiktokGmvMax.rollback({ id }),
    t("gmvMax.messages.approved"),
  );
}
function saveNotification() {
  void runAction(
    "notification",
    () =>
      window.api.tiktokGmvMax.saveNotificationConfig(notificationDraft.value),
    t("gmvMax.messages.policySaved"),
  );
}

function clearFilters() {
  selectedStore.value = "all";
  selectedType.value = "all";
  searchText.value = "";
  campaignStatus.value = "all";
  campaignPacingState.value = "all";
  minCampaignSpend.value = undefined;
  minCampaignOrders.value = undefined;
  minCampaignRoi.value = undefined;
  minCampaignUtilization.value = undefined;
  creativeCampaign.value = "all";
  creativeSource.value = "all";
  creativeState.value = "all";
  minCreativeSpend.value = undefined;
  minCreativeOrders.value = undefined;
  minCreativeRoi.value = undefined;
  maxCreativeCpa.value = undefined;
  minCreativeCtr.value = undefined;
  listEntryMode.value = "all";
  listEntrySearch.value = "";
  productCampaign.value = "all";
  productState.value = "all";
  productAllocation.value = "all";
  minProductSpend.value = undefined;
  minProductOrders.value = undefined;
  minProductRoi.value = undefined;
  minProductScore.value = undefined;
  productCostCampaign.value = "all";
  productCostScope.value = "all";
  productCostCompleteness.value = "all";
  productCostSearch.value = "";
  actionStatus.value = "all";
  actionCampaign.value = "all";
  actionType.value = "all";
  actionRisk.value = "all";
  auditStatus.value = "all";
  auditCampaign.value = "all";
  auditAction.value = "";
  void applyDataFilters();
}

function restoreSavedFilters() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FILTER_STORAGE_KEY) || "{}",
    ) as Record<string, unknown>;
    if (typeof saved.selectedStore === "string")
      selectedStore.value = saved.selectedStore;
    if (["all", "PRODUCT", "LIVE"].includes(String(saved.selectedType)))
      selectedType.value = String(saved.selectedType);
    if (typeof saved.searchText === "string")
      searchText.value = saved.searchText;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(saved.startDate || "")))
      startDate.value = String(saved.startDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(saved.endDate || "")))
      endDate.value = String(saved.endDate);
  } catch {
    localStorage.removeItem(FILTER_STORAGE_KEY);
  }
}

function openPolicy(campaignId: string) {
  drawer.value = { kind: "policy", id: campaignId };
}
async function openCampaignWorkspace(campaignId: string) {
  campaignWorkspaceLoading.value = true;
  campaignWorkspaceTab.value = "overview";
  drawer.value = { kind: "campaign", id: campaignId };
  try {
    campaignWorkspace.value =
      (await window.api.tiktokGmvMax.getCampaignWorkspace({
        campaignId,
        startDate: startDate.value,
        endDate: endDate.value,
      })) as CampaignWorkspace;
  } catch (error: any) {
    errorText.value = error?.message || String(error);
    closeDrawer();
  } finally {
    campaignWorkspaceLoading.value = false;
  }
}
function openCampaignCreatives(campaignId: string) {
  creativeCampaign.value = campaignId;
  activeTab.value = "creatives";
  void loadCreativeContext();
}

async function loadCreativeContext(page = 1, listPage = 1) {
  creativeExperimentWorkspace.value = null;
  const requests: Promise<unknown>[] = [
    loadCreativePage(page),
    loadListEntryPage(listPage),
  ];
  if (creativeCampaign.value !== "all") {
    requests.push(
      window.api.tiktokGmvMax
        .getCampaignWorkspace({
          campaignId: creativeCampaign.value,
          startDate: startDate.value,
          endDate: endDate.value,
        })
        .then((result) => {
          creativeExperimentWorkspace.value = result as CampaignWorkspace;
        }),
    );
  }
  await Promise.all(requests);
}
function openCampaignProducts(campaignId: string) {
  productCampaign.value = campaignId;
  activeTab.value = "growth";
  void loadProductPage(1);
}
function openAction(id: string) {
  drawer.value = { kind: "action", id };
}
function openCampaignRecommendations(campaignId: string) {
  drawer.value = { kind: "campaignRecommendations", id: campaignId };
}
function openStore(storeId: string) {
  drawer.value = { kind: "store", id: storeId };
}
function openRule(item?: RuleGroup) {
  const boundCampaignId = item
    ? dashboard.value.ruleBindings.find(
        (entry) => entry.ruleGroupId === item.id,
      )?.campaignId
    : undefined;
  const inferredStoreId = dashboard.value.campaigns.find(
    (campaign) => campaign.id === boundCampaignId,
  )?.storeId;
  const defaultStoreId =
    selectedStore.value !== "all"
      ? selectedStore.value
      : uniqueStores.value[0]?.storeId || "";
  ruleDraft.value = item
    ? { ...item, storeId: item.storeId || inferredStoreId || defaultStoreId }
    : {
        id: "",
        name: "",
        storeId: defaultStoreId,
        preset: "roi_guard",
        minRoi: "1",
        targetCpa: "0",
        creativeTestBudget: "0",
        profitSafetyMarginPercent: 15,
      };
  drawer.value = { kind: "rule", id: item?.id };
}
function openProduct(item?: ProductCost) {
  productDraft.value = item
    ? {
        ...item,
        variants: (item.variants || []).map((variant) => ({ ...variant })),
      }
    : {
        id: "",
        storeId: selectedStore.value === "all" ? "" : selectedStore.value,
        campaignId: "",
        productId: "",
        productName: "",
        sellingPrice: "",
        variants: [],
        currency: "",
        purchaseCost: "",
        firstMileCost: "",
        lastMileCost: "",
        warehousingCost: "",
        platformCommissionRate: "",
        creatorCommissionRate: "",
        expectedReturnRate: "",
        returnLossRate: "",
      };
  drawer.value = { kind: "product", id: item?.id };
}
async function openProductInsight(item: ProductInsight) {
  const existing = (await window.api.tiktokGmvMax.getProductCost({
    storeId: item.storeId,
    campaignId: item.campaignId,
    productId: item.productId,
  })) as ProductCost | null;
  openProduct(
    existing
      ? {
          ...existing,
          id: existing.campaignId === item.campaignId ? existing.id : "",
          campaignId: item.campaignId,
        }
      : {
          id: "",
          storeId: item.storeId,
          campaignId: item.campaignId,
          productId: item.productId,
          productName: item.productName || "",
          sellingPrice: "",
          currency: "",
          purchaseCost: "",
          firstMileCost: "",
          lastMileCost: "",
          warehousingCost: "",
          platformCommissionRate: "",
          creatorCommissionRate: "",
          expectedReturnRate: "",
          returnLossRate: "",
        },
  );
}
function closeDrawer() {
  drawer.value = { kind: null };
}

function addProductVariant() {
  const variants =
    productDraft.value.variants || (productDraft.value.variants = []);
  variants.push({
    id: `manual-${Date.now()}-${variants.length}`,
    name: "",
    sellingPrice: "",
    purchaseCost: "",
    firstMileCost: "",
    lastMileCost: "",
    warehousingCost: "",
    platformCommissionRate: "",
    creatorCommissionRate: "",
    expectedReturnRate: "",
    returnLossRate: "",
  });
}

function removeProductVariant(index: number) {
  productDraft.value.variants?.splice(index, 1);
}

function saveRuleDraft() {
  if (!ruleDraft.value.name.trim()) return;
  void runAction(
    "rule-draft",
    () => window.api.tiktokGmvMax.saveRuleGroup(ruleDraft.value as any),
    t("gmvMax.messages.policySaved"),
  ).then(closeDrawer);
}

async function saveProductDraft() {
  if (!productDraft.value.storeId || !productDraft.value.productId) return;
  const payload = {
    ...productDraft.value,
    variants: (productDraft.value.variants || []).map((variant) => ({
      ...variant,
    })),
  };
  const saved = await runAction(
    "product-draft",
    () => window.api.tiktokGmvMax.saveProductCost(payload as any),
    t("gmvMaxSku.saved"),
  );
  if (saved) closeDrawer();
}

function removeProduct(item: ProductCost) {
  if (!window.confirm("Remove this product cost override?")) return;
  void runAction(
    `remove-product:${item.id}`,
    () => window.api.tiktokGmvMax.removeProductCost({ id: item.id }),
    t("gmvMax.messages.policySaved"),
  );
}

function removeRule(item: RuleGroup) {
  if (!window.confirm("Remove this rule group and its bindings?")) return;
  void runAction(
    `remove-rule:${item.id}`,
    () => window.api.tiktokGmvMax.removeRuleGroup({ id: item.id }),
    t("gmvMax.messages.policySaved"),
  );
}

function removeListEntry(item: ListEntry) {
  void runAction(
    `remove-list:${item.id}`,
    () => window.api.tiktokGmvMax.removeListEntry({ id: item.id }),
    t("gmvMax.messages.policySaved"),
  );
}

function addCreativeToList(item: CreativeMetric, mode: "allow" | "deny") {
  const campaign = dashboard.value.campaigns.find(
    (entry) => entry.id === item.campaignId,
  );
  if (!campaign) return;
  void runAction(
    `list:${item.creativeId}:${mode}`,
    async () => {
      await window.api.tiktokGmvMax.saveListEntry({
        storeId: campaign.storeId,
        campaignId: campaign.id,
        entityType: "creative",
        entityId: item.creativeId,
        label: item.creativeName || item.creativeId,
        mode,
      });
      if (mode === "deny")
        await window.api.tiktokGmvMax.evaluate({
          campaignId: campaign.id,
          scope: "creative",
        });
    },
    mode === "deny"
      ? t("gmvMaxCreativeOptimize.exclusionQueued")
      : t("gmvMax.messages.policySaved"),
  );
}

function setRuleBinding(campaignId: string, ruleGroupId: string) {
  const action = ruleGroupId
    ? () => window.api.tiktokGmvMax.bindRuleGroup({ campaignId, ruleGroupId })
    : () => window.api.tiktokGmvMax.unbindRuleGroup({ campaignId });
  void runAction(
    `bind:${campaignId}`,
    action,
    t("gmvMax.messages.policySaved"),
  );
}

async function loadSopProductOptions(campaignId: string) {
  const campaign = dashboard.value.campaigns.find(
    (item) => item.id === campaignId,
  );
  sopProductOptions.value = [];
  if (!campaign || campaign.campaignType !== "PRODUCT") return;
  sopProductLoading.value = true;
  try {
    const result = (await window.api.tiktokGmvMax.getProductPage({
      page: 1,
      pageSize: 100,
      startDate: startDate.value,
      endDate: endDate.value,
      campaignId,
      sortBy: "grossRevenue",
      sortDirection: "desc",
    })) as ProductPage;
    sopProductOptions.value = result.items;
    const selected =
      result.items.find(
        (item) => item.productId === sopStartDraft.value.productId,
      ) || result.items[0];
    sopStartDraft.value.productId = selected?.productId || "";
    sopStartDraft.value.productName = selected?.productName || "";
  } catch (error) {
    errorText.value = readableError(error);
  } finally {
    sopProductLoading.value = false;
  }
}

function selectSopProduct() {
  const selected = sopProductOptions.value.find(
    (item) => item.productId === sopStartDraft.value.productId,
  );
  sopStartDraft.value.productName = selected?.productName || "";
  errorText.value = "";
}

async function startSop() {
  const campaign = selectedSopCampaign.value;
  if (!campaign) {
    errorText.value = t("gmvMaxSop.errors.campaignRequired");
    return;
  }
  if (
    campaign.campaignType === "PRODUCT" &&
    !sopStartDraft.value.productId.trim()
  ) {
    errorText.value = t("gmvMaxSop.start.hint");
    return;
  }
  const started = await runAction(
    "start-sop",
    () =>
      window.api.tiktokGmvMax.startSop({
        campaignId: campaign.id,
        productId:
          campaign.campaignType === "PRODUCT"
            ? sopStartDraft.value.productId.trim()
            : undefined,
        productName:
          campaign.campaignType === "PRODUCT"
            ? sopStartDraft.value.productName.trim()
            : undefined,
        startDate: sopStartDraft.value.startDate,
        track: sopStartDraft.value.track || undefined,
        trackOverrideReason: sopStartDraft.value.track
          ? sopStartDraft.value.trackOverrideReason.trim()
          : undefined,
      }),
    t("gmvMaxSop.messages.started"),
  );
  if (started) sopLaunchExpanded.value = false;
}

function overrideSopTrack(event: Event) {
  if (!selectedSop.value) return;
  const track = (event.target as HTMLSelectElement).value as SopTrack;
  if (!track || track === selectedSop.value.track) return;
  const reason = window.prompt(t("gmvMaxMature.overrideReason"))?.trim();
  if (!reason) {
    (event.target as HTMLSelectElement).value = selectedSop.value.track || "";
    return;
  }
  void runAction(
    "override-sop-track",
    () =>
      window.api.tiktokGmvMax.updateSop({
        id: selectedSop.value!.id,
        track,
        trackOverrideReason: reason,
      }),
    t("gmvMaxMature.overrideSaved"),
  );
}

function toggleSopStatus() {
  if (!selectedSop.value) return;
  const status = selectedSop.value.status === "paused" ? "active" : "paused";
  void runAction(
    "update-sop",
    () =>
      window.api.tiktokGmvMax.updateSop({ id: selectedSop.value!.id, status }),
    t(`gmvMaxSop.messages.${status}`),
  );
}

function toggleSopAutomation() {
  if (!selectedSop.value) return;
  const automationEnabled = selectedSop.value.automationEnabled === false;
  void runAction(
    "toggle-sop-automation",
    () =>
      window.api.tiktokGmvMax.updateSop({
        id: selectedSop.value!.id,
        automationEnabled,
      }),
    t(
      `gmvMaxSopAutomation.${automationEnabled ? "enabledMessage" : "disabledMessage"}`,
    ),
  );
}

function changeSopAutomationMode(event: Event) {
  if (!selectedSop.value) return;
  const automationMode = (event.target as HTMLSelectElement).value as
    "diagnostic_only" | "draft_actions";
  void runAction(
    "change-sop-automation-mode",
    () =>
      window.api.tiktokGmvMax.updateSop({
        id: selectedSop.value!.id,
        automationMode,
      }),
    t("gmvMaxSopAutomation.modeSaved"),
  );
}

function runSopAutomation() {
  if (!selectedSop.value) return;
  void runAction(
    "run-sop-automation",
    () =>
      window.api.tiktokGmvMax.runSopAutomation({
        sopInstanceId: selectedSop.value!.id,
        force: true,
      }),
    t("gmvMaxSopAutomation.runCompleted"),
  );
}

function refreshCoachDecision() {
  if (!selectedSop.value) return;
  void runAction(
    "refresh-coach",
    () =>
      window.api.tiktokGmvMax.refreshCoachDecision({
        sopInstanceId: selectedSop.value!.id,
        force: true,
      }),
    t("gmvMaxCoach.refreshed"),
  );
}

function completeSopTask(task: SopTask) {
  void runAction(
    `complete-sop:${task.id}`,
    () => window.api.tiktokGmvMax.completeSopTask({ id: task.id }),
    t("gmvMaxSop.messages.taskCompleted"),
  );
}

function approveExperimentTask(task: SopTask) {
  const experiment = sopWorkspace.value.experiments.find(
    (item) => item.id === task.experimentId,
  );
  const recommendationId =
    task.recommendedAction === "rollback_roi"
      ? experiment?.rollbackRecommendationId
      : experiment?.recommendationId;
  if (!recommendationId) return;
  void runAction(
    `approve-experiment:${task.id}`,
    async () => {
      await window.api.tiktokGmvMax.approve({ id: recommendationId });
      return await window.api.tiktokGmvMax.completeSopTask({ id: task.id });
    },
    t("gmvMax.messages.approved"),
  );
}

function saveSupplementalMetrics() {
  const values = Object.fromEntries(
    Object.entries(supplementalDraft.value).filter(([, value]) =>
      String(value).trim(),
    ),
  ) as Record<string, unknown>;
  for (const field of ["autoBudgetEnabled", "inventoryReady", "liveReady"]) {
    if (values[field] === "true") values[field] = true;
    if (values[field] === "false") values[field] = false;
  }
  void runAction(
    "save-supplemental",
    () => window.api.tiktokGmvMax.saveSupplementalMetrics(values),
    t("gmvMaxSop.messages.metricsSaved"),
  );
}

async function exportSupplementalTemplate() {
  const content =
    (await window.api.tiktokGmvMax.exportSupplementalMetricsTemplate()) as string;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  link.download = "gmv-max-sop-metrics-template.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importSupplementalMetrics(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busyAction.value = "import-supplemental";
  notice.value = "";
  errorText.value = "";
  try {
    const result = (await window.api.tiktokGmvMax.importSupplementalMetrics({
      csv: await file.text(),
    })) as { imported: number };
    notice.value = t("gmvMaxSop.messages.metricsImported", {
      count: result.imported,
    });
    await loadSopWorkspace();
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    input.value = "";
    busyAction.value = "";
  }
}

async function exportCosts() {
  const content = (await window.api.tiktokGmvMax.exportProductCosts({
    storeId: selectedStore.value,
    campaignId: productCostCampaign.value,
    search: productCostSearch.value,
  })) as string;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  link.download = "gmv-max-product-costs.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importCosts(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busyAction.value = "import-costs";
  notice.value = "";
  errorText.value = "";
  try {
    const result = (await window.api.tiktokGmvMax.importProductCosts({
      csv: await file.text(),
      storeId: selectedStore.value,
      campaignId: productCostCampaign.value,
    })) as { imported: number };
    notice.value = t("gmvMaxCostData.importSuccess", {
      count: result.imported,
    });
    await loadDashboard();
    await loadProductCostPage(1);
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    input.value = "";
    busyAction.value = "";
  }
}

watch(activeTab, (value) => {
  if (value === "sop") void loadSopWorkspace();
  if (value === "campaigns" && !campaignDataPage.value.items.length)
    void loadCampaignPage(1);
  if (value === "creatives" && !creativePage.value.items.length)
    void loadCreativePage(1);
  if (value === "creatives" && !listEntryPage.value.items.length)
    void loadListEntryPage(1);
  if (value === "growth" && !productPage.value.items.length)
    void loadProductPage(1);
  if (value === "growth" && !outcomePage.value.items.length)
    void loadOutcomePage(1);
  if (value === "profit" && !productCostPage.value.items.length)
    void loadProductCostPage(1);
  if (value === "actions" && !actionPage.value.items.length)
    void loadActionPage(1);
  if (value === "audit" && !auditPage.value.items.length) void loadAuditPage(1);
});
watch(
  [sopLoading, sopRefreshing],
  ([isLoading, isRefreshing]) => {
    if (sopLoadingWatchdog) window.clearTimeout(sopLoadingWatchdog);
    if (!isLoading && !isRefreshing) return;
    sopLoadingWatchdog = window.setTimeout(() => {
      sopLoading.value = false;
      sopRefreshing.value = false;
      errorText.value = t("gmvMaxRuntime.workspaceTimeout");
    }, 16_000);
  },
  { immediate: true },
);
watch(selectedSopId, () => {
  const item = selectedSop.value;
  if (!item) return;
  const statDate = supplementalDraft.value.statDate;
  supplementalDraft.value = {
    campaignId: item.campaignId,
    productId: item.productId || "",
    statDate,
    refundAmount: "",
    netGmv: "",
    liveUv: "",
    liveStayRate: "",
    productClicks: "",
    addToCart: "",
    orders: "",
    paidOrders: "",
    productBudget: "",
    targetRoi: "",
    intradaySpend: "",
    deliveryMode: "",
    autoBudgetEnabled: "",
    inventoryReady: "",
    liveReady: "",
  };
  selectedSopVideoId.value = "";
  selectedSopVideoGrade.value =
    (["S", "A", "B", "C"] as SopVideoGrade[]).find((grade) =>
      selectedSopCreativeVideos.value.some((video) => video.grade === grade),
    ) || "S";
  sopVideoPage.value = 1;
  resetSopPanels();
});
watch([sopVideoSort, sopVideoPageSize], () => {
  sopVideoPage.value = 1;
  selectedSopVideoId.value = "";
});
watch(sopVideoPageCount, (count) => {
  if (sopVideoPage.value > count) changeSopVideoPage(count);
});
watch(selectedSopId, (value) => {
  if (value) localStorage.setItem(SOP_SELECTION_STORAGE_KEY, value);
  else localStorage.removeItem(SOP_SELECTION_STORAGE_KEY);
});
watch(
  () => sopStartDraft.value.campaignId,
  (campaignId) => {
    const campaign = dashboard.value.campaigns.find(
      (item) => item.id === campaignId,
    );
    if (campaign?.campaignType !== "PRODUCT") {
      sopStartDraft.value.productId = "";
      sopStartDraft.value.productName = "";
      sopProductOptions.value = [];
    }
    errorText.value = "";
    void loadSopProductOptions(campaignId);
  },
);
watch(campaignPageSize, () => void loadCampaignPage(1));
watch([selectedStore, selectedType, searchText, startDate, endDate], () => {
  localStorage.setItem(
    FILTER_STORAGE_KEY,
    JSON.stringify({
      selectedStore: selectedStore.value,
      selectedType: selectedType.value,
      searchText: searchText.value,
      startDate: startDate.value,
      endDate: endDate.value,
    }),
  );
});
watch(
  () => productDraft.value.storeId,
  (storeId) => {
    if (!productDraft.value.campaignId) return;
    const campaign = dashboard.value.campaigns.find(
      (item) => item.id === productDraft.value.campaignId,
    );
    if (!campaign || campaign.storeId !== storeId)
      productDraft.value.campaignId = "";
  },
);
onMounted(() => {
  restoreSavedFilters();
  featureNavCollapsed.value = localStorage.getItem(NAV_STORAGE_KEY) === "true";
  window.addEventListener("keydown", handleWorkspaceKeydown);
  removeSyncProgressListener = window.api.tiktokGmvMax.onSyncProgress(
    (progress) => {
      applySyncProgress(progress as SyncProgressState);
    },
  );
  void loadDashboard();
  void loadSopWorkspace();
});
onUnmounted(() => {
  sopWorkspaceRequestId += 1;
  dashboardRequest.invalidate();
  campaignPageRequest.invalidate();
  creativePageRequest.invalidate();
  listEntryPageRequest.invalidate();
  productPageRequest.invalidate();
  productCostPageRequest.invalidate();
  actionPageRequest.invalidate();
  outcomePageRequest.invalidate();
  auditPageRequest.invalidate();
  if (sopLoadingWatchdog) window.clearTimeout(sopLoadingWatchdog);
  stopSyncProgressAnimation();
  stopSyncProgressPolling();
  window.removeEventListener("keydown", handleWorkspaceKeydown);
  removeSyncProgressListener?.();
  removeSyncProgressListener = null;
});
</script>

<template>
  <main class="gmv-workspace" data-testid="gmv-max-workspace">
    <div
      :class="[
        'gmv-feature-layout',
        { 'is-nav-collapsed': featureNavCollapsed },
      ]"
      data-testid="gmv-feature-layout"
    >
      <GmvMaxControlTowerNav
        :items="workspaceNavigation"
        :active-tab="activeTab"
        :collapsed="featureNavCollapsed"
        :connected="connected"
        :help-label="t('gmvMaxV2.navigation.help')"
        :connection-label="
          connected ? t('gmvMaxHelp.connected') : t('gmvMaxHelp.disconnected')
        "
        :collapse-label="t('gmvMaxHelp.collapse')"
        :expand-label="t('gmvMaxHelp.expand')"
        @select="selectFeatureTab($event as TabId)"
        @help="selectFeatureTab('help')"
        @toggle="toggleFeatureNav"
      />
      <div class="gmv-feature-content">
        <header v-if="activeTab !== 'help'" class="gmv-header gmv-task-header">
          <div class="gmv-task-header__identity">
            <div class="gmv-task-header__symbol" aria-hidden="true">
              <component :is="activeNavigationIcon" />
            </div>
            <div class="gmv-task-header__copy">
              <h1>{{ pageMeta.title }}</h1>
              <p>{{ pageMeta.subtitle }}</p>
            </div>
          </div>
          <div class="gmv-header__actions">
            <button
              type="button"
              class="gmv-v2-scope-button"
              data-testid="gmv-global-filter-toggle"
              :aria-expanded="globalFiltersExpanded"
              @click="globalFiltersExpanded = !globalFiltersExpanded"
            >
              <Store /><span
                ><small>{{ t("gmvMaxTaskUi.scope") }}</small
                ><strong>{{ selectedStoreLabel }}</strong></span
              ><ChevronDown :class="{ 'is-open': globalFiltersExpanded }" />
            </button>
            <div class="gmv-v2-freshness">
              <Clock3 /><span
                ><small>{{ t("gmvMaxTaskUi.updatedAt") }}</small
                ><strong>{{ workspaceFreshness }}</strong></span
              >
            </div>
            <button
              v-if="connected"
              :class="[
                'gmv-button',
                dashboard.scheduler.emergencyStopped
                  ? 'gmv-button--primary'
                  : 'gmv-button--secondary',
              ]"
              data-testid="gmv-emergency-stop"
              :disabled="!!busyAction"
              @click="setEmergencyStop(!dashboard.scheduler.emergencyStopped)"
            >
              <component
                :is="
                  dashboard.scheduler.emergencyStopped
                    ? PlayCircle
                    : ShieldAlert
                "
                class="gmv-icon"
              />{{
                dashboard.scheduler.emergencyStopped
                  ? t("gmvMaxOperations.resume")
                  : t("gmvMaxOperations.stop")
              }}
            </button>
            <button
              class="gmv-button gmv-button--secondary"
              data-testid="gmv-refresh-workspace"
              :disabled="loading"
              @click="refreshWorkspace(false)"
            >
              <RefreshCw :class="['gmv-icon', { spin: loading }]" />{{
                t("gmvMax.actions.refresh")
              }}
            </button>
            <button
              v-if="connected"
              class="gmv-button gmv-button--primary"
              data-testid="gmv-sync-data"
              :disabled="!!busyAction"
              @click="syncData"
            >
              <Activity class="gmv-icon" />{{ t("gmvMax.actions.sync") }}
            </button>
            <button
              v-else
              class="gmv-button gmv-button--primary"
              :disabled="!!busyAction"
              @click="connect"
            >
              <Link2 class="gmv-icon" />{{ t("gmvMax.actions.connect") }}
            </button>
          </div>
        </header>

        <div v-if="notice" class="gmv-alert gmv-alert--success">
          <Check class="gmv-icon" />{{ notice }}
        </div>
        <div v-if="errorText" class="gmv-alert gmv-alert--danger">
          <X class="gmv-icon" />{{ errorText }}
        </div>
        <div
          v-if="compatibilityError.length"
          class="gmv-alert gmv-alert--warning"
        >
          <ShieldCheck class="gmv-icon" />{{
            t("gmvMax.compatibilityError", {
              tools: compatibilityError.join(", "),
            })
          }}
        </div>
        <div
          v-if="dashboard.scheduler.emergencyStopped"
          class="gmv-alert gmv-alert--danger"
          data-testid="gmv-emergency-alert"
        >
          <ShieldAlert class="gmv-icon" />{{ t("gmvMaxOperations.stopActive") }}
          {{ dashboard.scheduler.pausedReason }}
        </div>

        <section
          v-if="activeTab === 'settings' && setupProgress < 4"
          class="gmv-setup-guide"
          data-testid="gmv-setup-guide"
        >
          <header>
            <div>
              <span>{{ t("gmvMaxGuide.kicker") }}</span
              ><strong>{{ t("gmvMaxGuide.title") }}</strong>
            </div>
            <small>{{ setupProgress }} / 4</small>
          </header>
          <div class="gmv-setup-guide__steps">
            <button
              :class="{ 'is-complete': connected }"
              :disabled="connected || !!busyAction"
              @click="openSetupStep('connect')"
            >
              <CheckCircle2 /><span
                ><strong>{{ t("gmvMaxGuide.connect") }}</strong
                ><small>{{
                  connected
                    ? t("gmvMaxGuide.done")
                    : t("gmvMaxGuide.connectAction")
                }}</small></span
              >
            </button>
            <button
              :class="{
                'is-complete':
                  dashboard.campaigns.length > 0 &&
                  dashboard.catalog.products > 0,
              }"
              :disabled="!connected || !!busyAction"
              @click="openSetupStep('sync')"
            >
              <CheckCircle2 /><span
                ><strong>{{ t("gmvMaxGuide.sync") }}</strong
                ><small>{{
                  dashboard.campaigns.length > 0 &&
                  dashboard.catalog.products > 0
                    ? t("gmvMaxGuide.done")
                    : t("gmvMaxGuide.syncAction")
                }}</small></span
              >
            </button>
            <button
              :class="{
                'is-complete': dashboard.catalog.configuredProducts > 0,
              }"
              :disabled="!connected"
              @click="openSetupStep('cost')"
            >
              <CheckCircle2 /><span
                ><strong>{{ t("gmvMaxGuide.cost") }}</strong
                ><small>{{
                  dashboard.catalog.configuredProducts > 0
                    ? t("gmvMaxGuide.done")
                    : t("gmvMaxGuide.costAction")
                }}</small></span
              >
            </button>
            <button
              :class="{ 'is-complete': dashboard.backtests.length > 0 }"
              :disabled="!connected"
              @click="openSetupStep('shadow')"
            >
              <CheckCircle2 /><span
                ><strong>{{ t("gmvMaxGuide.shadow") }}</strong
                ><small>{{
                  dashboard.backtests.length > 0
                    ? t("gmvMaxGuide.done")
                    : t("gmvMaxGuide.shadowAction")
                }}</small></span
              >
            </button>
          </div>
        </section>

        <section
          v-if="activeTab !== 'help' && globalFiltersExpanded"
          class="gmv-commandbar"
          data-testid="gmv-global-filters"
        >
          <div class="gmv-search">
            <Search class="gmv-icon" /><input
              v-model="searchText"
              :placeholder="t('gmvMaxConsole.search')"
            />
          </div>
          <select v-model="selectedStore">
            <option value="all">{{ t("gmvMaxConsole.allStores") }}</option>
            <option
              v-for="store in uniqueStores"
              :key="store.storeId"
              :value="store.storeId"
            >
              {{ store.storeName }}
            </option>
          </select>
          <label class="gmv-date-field"
            ><span>{{ t("gmvMaxData.startDate") }}</span
            ><input v-model="startDate" type="date" :max="endDate"
          /></label>
          <label class="gmv-date-field"
            ><span>{{ t("gmvMaxData.endDate") }}</span
            ><input v-model="endDate" type="date" :min="startDate"
          /></label>
          <div class="gmv-segments">
            <button
              :class="{ 'is-active': selectedType === 'all' }"
              @click="selectedType = 'all'"
            >
              {{ t("gmvMaxConsole.allTypes") }}</button
            ><button
              :class="{ 'is-active': selectedType === 'PRODUCT' }"
              @click="selectedType = 'PRODUCT'"
            >
              {{ t("gmvMax.types.product") }}</button
            ><button
              :class="{ 'is-active': selectedType === 'LIVE' }"
              @click="selectedType = 'LIVE'"
            >
              {{ t("gmvMax.types.live") }}
            </button>
          </div>
          <button
            class="gmv-button gmv-button--secondary"
            data-testid="gmv-apply-filters"
            :disabled="loading || creativeLoading"
            @click="applyDataFilters"
          >
            <Filter class="gmv-icon" />{{ t("gmvMaxData.applyFilters") }}
          </button>
          <button
            class="gmv-icon-button"
            data-testid="gmv-clear-filters"
            :title="t('gmvMaxConsole.clearFilters')"
            @click="clearFilters"
          >
            <Filter class="gmv-icon" />
          </button>
          <div class="gmv-live">
            <span></span
            >{{
              connected
                ? t("gmvMaxConsole.connectedLive")
                : t("gmvMax.status.disconnected")
            }}
          </div>
        </section>

        <details
          v-if="connected && activeTab === 'settings'"
          class="gmv-catalog-details"
          data-testid="gmv-catalog-strip"
        >
          <summary>
            <Database class="gmv-icon" /><span
              ><strong>{{ t("gmvMaxTaskUi.catalogDetails") }}</strong
              ><small>{{
                t("gmvMaxTaskUi.catalogSummary", {
                  products: dashboard.catalog.products,
                  videos: dashboard.catalog.videos,
                })
              }}</small></span
            ><ChevronDown class="gmv-icon" />
          </summary>
          <section class="gmv-catalog-strip">
            <div>
              <span>{{ t("gmvMaxCatalog.products") }}</span
              ><strong>{{ dashboard.catalog.products }}</strong>
            </div>
            <div>
              <span>{{ t("gmvMaxCatalog.configured") }}</span
              ><strong
                >{{ dashboard.catalog.configuredProducts }} /
                {{ dashboard.catalog.products }}</strong
              >
            </div>
            <div>
              <span>{{ t("gmvMaxCatalog.identities") }}</span
              ><strong>{{ dashboard.catalog.identities }}</strong>
            </div>
            <div>
              <span>{{ t("gmvMaxCatalog.videos") }}</span
              ><strong>{{ dashboard.catalog.videos }}</strong>
            </div>
            <div class="gmv-catalog-strip__time">
              <span>{{ t("gmvMaxCatalog.lastSync") }}</span
              ><strong>{{
                formatDate(
                  Math.max(
                    dashboard.catalog.lastProductSyncedAt || 0,
                    dashboard.catalog.lastCreativeSyncedAt || 0,
                  ),
                )
              }}</strong>
            </div>
            <button
              class="gmv-button gmv-button--secondary"
              data-testid="gmv-sync-catalogs"
              :disabled="!!busyAction"
              @click="syncCatalogs"
            >
              <Film class="gmv-icon" />{{ t("gmvMaxCatalog.sync") }}
            </button>
          </section>
        </details>

        <section
          v-if="taskSummary.length"
          class="gmv-task-summary"
          data-testid="gmv-task-summary"
        >
          <article
            v-for="item in taskSummary"
            :key="item.label"
            :class="`is-${item.tone}`"
          >
            <span>{{ item.label }}</span
            ><strong>{{ item.value }}</strong
            ><small>{{ item.hint }}</small>
          </article>
        </section>

        <section v-if="activeTab === 'overview'" class="gmv-section">
          <div class="gmv-v2-results" data-testid="gmv-control-strip">
            <article>
              <div class="gmv-metric-icon is-blue"><TrendingUp /></div>
              <span>{{ t("gmvMaxV2.overview.gmv") }}</span
              ><strong>{{
                performanceSummary.moneyReady
                  ? formatCny(performanceSummary.revenue, undefined, true)
                  : t("gmvMaxCurrency.pending")
              }}</strong
              ><small>{{ t("gmvMaxV2.overview.completeDataHint") }}</small>
            </article>
            <article>
              <div class="gmv-metric-icon is-red"><CircleDollarSign /></div>
              <span>{{ t("gmvMaxV2.overview.spend") }}</span
              ><strong>{{
                performanceSummary.moneyReady
                  ? formatCny(performanceSummary.cost, undefined, true)
                  : t("gmvMaxCurrency.pending")
              }}</strong
              ><small>{{ filteredDailyMetrics.length }} {{ t("gmvMaxV2.overview.completeRows") }}</small>
            </article>
            <article>
              <div class="gmv-metric-icon is-cyan"><Gauge /></div>
              <span>{{ t("gmvMaxV2.overview.actualRoi") }}</span
              ><strong>{{
                performanceSummary.cost > 0
                  ? `${(performanceSummary.revenue / performanceSummary.cost).toFixed(2)}x`
                  : "-"
              }}</strong
              ><small>{{ t("gmvMaxV2.overview.profitBoundaryHint") }}</small>
            </article>
            <article>
              <div class="gmv-metric-icon is-green"><CircleDollarSign /></div>
              <span>{{ t("gmvMaxV2.overview.estimatedProfit") }}</span
              ><strong>{{
                executiveProfit.profitReady && executiveProfit.moneyReady
                  ? formatCny(executiveProfit.netProfit, undefined, true)
                  : "-"
              }}</strong
              ><small>{{ t("gmvMaxV2.overview.estimatedHint") }}</small>
            </article>
          </div>
          <section class="gmv-v2-signals" data-testid="gmv-v2-signals">
            <article class="is-risk">
              <ShieldAlert />
              <div><span>{{ t("gmvMaxV2.overview.risk") }}</span><strong>{{ commandCenter.actionSummary.mustFix }}</strong><small>{{ t("gmvMaxV2.overview.riskHint", { spend: executiveProfit.moneyReady ? formatCny(executiveProfit.atRiskSpend, undefined, true) : "-" }) }}</small></div>
            </article>
            <article class="is-opportunity">
              <Rocket />
              <div><span>{{ t("gmvMaxV2.overview.opportunity") }}</span><strong>{{ commandCenter.actionSummary.recommended }}</strong><small>{{ t("gmvMaxV2.overview.opportunityHint") }}</small></div>
            </article>
            <article class="is-action">
              <ClipboardCheck />
              <div><span>{{ t("gmvMaxV2.overview.today") }}</span><strong>{{ commandCenter.topActions.length }}</strong><small>{{ t("gmvMaxV2.overview.totalHint", { total: commandCenter.actionSummary.total }) }}</small></div>
            </article>
          </section>
          <section
            class="gmv-panel gmv-priority-panel gmv-v2-priority-panel"
            data-testid="gmv-today-actions"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxV2.overview.topActions") }}</h2>
                <p>{{ t("gmvMaxV2.overview.topActionsHint") }}</p>
              </div>
              <button
                class="gmv-button gmv-button--ghost"
                @click="activeTab = 'actions'"
              >
                {{ t("gmvMaxConsole.viewAll")
                }}<ArrowUpRight class="gmv-icon" />
              </button>
            </div>
            <div v-if="commandCenter.topActions.length" class="gmv-v2-action-list">
              <button
                v-for="(item, index) in commandCenter.topActions"
                :key="item.id"
                @click="handleCommandCenterAction(item)"
              >
                <em>{{ index + 1 }}</em>
                <div class="gmv-v2-action-list__main">
                  <span :class="['gmv-status', item.category === 'high_risk' ? 'is-danger' : item.category === 'high_opportunity' ? 'is-success' : item.category === 'observing' ? 'is-blue' : 'is-warning']">{{ t(`gmvMaxV2.action.category.${item.category}`) }}</span>
                  <strong>{{ item.productName || item.campaignName }}</strong>
                  <small>{{ recommendationReasonLabel(item.reason) }}</small>
                </div>
                <div class="gmv-v2-action-list__impact">
                  <span>{{ t("gmvMaxV2.action.impact") }}</span>
                  <strong>{{ item.projectionSource === "modeled" ? formatCny(item.projectedNetProfitDelta, item.storeId) : t("gmvMaxV2.action.unavailable") }}</strong>
                  <small>{{ t(`gmvMaxV2.action.status.${item.status}`) }}</small>
                </div>
                <ArrowUpRight />
              </button>
            </div>
            <div v-else class="gmv-empty gmv-empty--small">
              {{ t("gmvMaxOperations.noTodayActions") }}
            </div>
          </section>
          <div class="gmv-ops-grid">
            <section class="gmv-panel gmv-flow-panel">
              <div class="gmv-panel__heading">
                <div>
                  <h2>{{ t("gmvMaxConsole.flowTitle") }}</h2>
                  <p>{{ t("gmvMaxConsole.flowSubtitle") }}</p>
                </div>
                <span class="gmv-status is-blue"
                  ><Clock3 class="gmv-icon" />{{
                    t("gmvMaxConsole.completeData")
                  }}</span
                >
              </div>
              <div v-if="dailyFlow.length" class="gmv-flow-chart">
                <div
                  v-for="item in dailyFlow"
                  :key="item.date"
                  class="gmv-flow-day"
                >
                  <div class="gmv-flow-bars">
                    <span
                      class="gmv-flow-bar is-cost"
                      :style="{
                        height: `${Math.max(5, (item.cost / maxDailyCost) * 100)}%`,
                      }"
                    ></span
                    ><span
                      class="gmv-flow-bar is-revenue"
                      :style="{
                        height: `${Math.max(5, (Math.min(item.revenue, maxDailyCost * 4) / (maxDailyCost * 4)) * 100)}%`,
                      }"
                    ></span>
                  </div>
                  <strong>{{ formatRoi(item.roi) }}</strong
                  ><small>{{ flowDateLabel(item.date) }}</small>
                </div>
              </div>
              <div v-else class="gmv-empty gmv-empty--small">
                {{ t("gmvMaxConsole.noFlowData") }}
              </div>
              <div class="gmv-chart-legend">
                <span
                  ><i class="is-cost"></i>{{ t("gmvMaxConsole.spend") }}</span
                ><span
                  ><i class="is-revenue"></i
                  >{{ t("gmvMaxConsole.grossRevenue") }}</span
                ><span>{{ t("gmvMaxConsole.barValueRoi") }}</span>
              </div>
            </section>
            <section class="gmv-panel gmv-store-panel">
              <div class="gmv-panel__heading">
                <div>
                  <h2>{{ t("gmvMaxConsole.storeControl") }}</h2>
                  <p>{{ t("gmvMaxConsole.storeControlSubtitle") }}</p>
                </div>
                <Store class="gmv-heading-icon" />
              </div>
              <div class="gmv-store-list">
                <button
                  v-for="store in storeHealth"
                  :key="store.storeId"
                  @click="selectedStore = store.storeId"
                >
                  <span class="gmv-store-avatar">{{
                    store.storeName.slice(0, 2).toUpperCase()
                  }}</span>
                  <span
                    ><strong>{{ store.storeName }}</strong
                    ><small
                      >{{
                        formatPercent(
                          storeProfitSummary(store.storeId)
                            ?.spendCoveragePercent ?? 0,
                          true,
                        )
                      }}
                      {{ t("gmvMaxOperations.spendCoverage") }} /
                      {{ formatInteger(store.automatic) }}
                      {{ t("gmvMaxConsole.automatic") }}</small
                    ></span
                  >
                  <span class="gmv-store-value"
                    ><strong
                      :class="
                        storeProfitSummary(store.storeId)
                          ?.profitEstimateAvailable
                          ? metricNumber(
                              storeProfitSummary(store.storeId)
                                ?.estimatedNetProfit,
                            ) >= 0
                            ? 'is-positive'
                            : 'is-negative'
                          : ''
                      "
                      >{{
                        storeProfitValue(storeProfitSummary(store.storeId))
                      }}</strong
                    ><small>{{ t("gmvMaxProfit.netProfit") }}</small></span
                  >
                  <ChevronRight class="gmv-icon" />
                </button>
              </div>
            </section>
          </div>
          <div class="gmv-grid gmv-grid--overview">
            <section class="gmv-panel">
              <div class="gmv-panel__heading">
                <div>
                  <h2>{{ t("gmvMax.connection.title") }}</h2>
                  <p>{{ t("gmvMax.connection.subtitle") }}</p>
                </div>
              </div>
              <div v-if="dashboard.connections.length" class="gmv-stack">
                <div
                  v-for="connection in dashboard.connections"
                  :key="connection.id"
                  class="gmv-row"
                >
                  <div>
                    <strong>{{ connection.name }}</strong
                    ><small>{{ formatDate(connection.expiresAt) }}</small>
                  </div>
                  <div class="gmv-row__actions">
                    <span
                      :class="['gmv-status', statusClass(connection.state)]"
                      >{{
                        t(`gmvMax.status.${connection.state}`, connection.state)
                      }}</span
                    >
                    <button
                      v-if="connection.state === 'error'"
                      class="gmv-icon-button"
                      :title="t('gmvMax.actions.refresh')"
                      :disabled="!!busyAction"
                      @click="reconnect(connection.id)"
                    >
                      <RefreshCw class="gmv-icon" />
                    </button>
                    <button
                      class="gmv-icon-button"
                      :title="t('gmvMax.actions.disconnect')"
                      :disabled="!!busyAction"
                      @click="disconnect(connection.id)"
                    >
                      <Unlink class="gmv-icon" />
                    </button>
                  </div>
                </div>
              </div>
              <div v-else class="gmv-empty">
                {{ t("gmvMax.empty.connections") }}
              </div>
            </section>
            <section class="gmv-panel">
              <div class="gmv-panel__heading">
                <div>
                  <h2>{{ t("gmvMax.scheduler.title") }}</h2>
                  <p>{{ t("gmvMax.scheduler.subtitle") }}</p>
                </div>
                <span
                  :class="[
                    'gmv-status',
                    dashboard.scheduler.running ? 'is-warning' : 'is-success',
                  ]"
                  >{{
                    dashboard.scheduler.running
                      ? t("gmvMax.status.running")
                      : t("gmvMax.status.ready")
                  }}</span
                >
              </div>
              <dl class="gmv-details">
                <div>
                  <dt>{{ t("gmvMax.scheduler.lastRun") }}</dt>
                  <dd>{{ formatDate(dashboard.scheduler.lastRunAt) }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxOperations.lastSuccess") }}</dt>
                  <dd>
                    {{ formatDate(dashboard.scheduler.lastSuccessfulRunAt) }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMax.scheduler.nextRun") }}</dt>
                  <dd>{{ formatDate(dashboard.scheduler.nextRunAt) }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxOperations.failures") }}</dt>
                  <dd>
                    {{ formatInteger(dashboard.scheduler.consecutiveFailures) }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxOperations.recoveryTasks") }}</dt>
                  <dd>
                    {{ formatInteger(dashboard.scheduler.recoveryTaskCount) }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMax.scheduler.dataCutoff") }}</dt>
                  <dd>{{ t("gmvMax.scheduler.previousDay") }}</dd>
                </div>
              </dl>
              <button
                class="gmv-button gmv-button--secondary"
                :disabled="!connected || !!busyAction"
                @click="evaluate"
              >
                <ClipboardCheck class="gmv-icon" />{{
                  t("gmvMax.actions.evaluate")
                }}
              </button>
            </section>
          </div>
          <section class="gmv-panel gmv-overview-table">
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxConsole.readiness") }}</h2>
                <p>{{ t("gmvMaxConsole.readinessSubtitle") }}</p>
              </div>
              <button
                class="gmv-button gmv-button--ghost"
                @click="activeTab = 'campaigns'"
              >
                {{ t("gmvMaxConsole.viewAll")
                }}<ArrowUpRight class="gmv-icon" />
              </button>
            </div>
            <div class="gmv-health-list">
              <button
                v-for="(campaign, index) in filteredCampaigns.slice(0, 8)"
                :key="campaign.id"
                class="gmv-health-row"
                @click="openPolicy(campaign.id)"
              >
                <span class="gmv-health-rank">{{
                  String(index + 1).padStart(2, "0")
                }}</span
                ><span
                  class="gmv-health-dot"
                  :class="
                    policyMap.get(campaign.id)?.automationEnabled ? 'is-on' : ''
                  "
                ></span
                ><span class="gmv-health-name"
                  ><strong :title="campaign.name">{{
                    compactCampaignName(campaign.name)
                  }}</strong
                  ><small
                    ><b>{{ campaignIdentityCode(campaign.name) }}</b
                    ><i>·</i
                    >{{
                      bindingForCampaign(campaign)?.storeName ||
                      t("gmvMaxSopUi.notAvailable")
                    }}</small
                  ></span
                ><span class="gmv-health-state"
                  ><strong>{{
                    policyMap.get(campaign.id)?.automationEnabled
                      ? t("gmvMaxConsole.automatic")
                      : t("gmvMaxConsole.manual")
                  }}</strong
                  ><small>{{
                    policyPresetLabel(policyMap.get(campaign.id)?.preset)
                  }}</small></span
                ><span class="gmv-health-metric"
                  ><small>{{ t("gmvMax.fields.budget") }}</small
                  ><strong>{{
                    formatCny(campaign.budget, campaign.storeId)
                  }}</strong></span
                ><span class="gmv-health-metric"
                  ><small>{{ t("gmvMax.fields.targetRoi") }}</small
                  ><strong>ROI {{ formatRoi(campaign.roasBid) }}</strong></span
                ><ChevronRight class="gmv-icon" />
              </button>
            </div>
          </section>
        </section>

        <section
          v-else-if="activeTab === 'sop'"
          class="gmv-section gmv-sop"
          data-testid="gmv-sop-workspace"
        >
          <div class="gmv-growth-cycle-actions">
            <div class="gmv-row__actions">
              <button
                v-if="selectedSop"
                class="gmv-button gmv-button--secondary"
                data-testid="gmv-sop-toggle-status"
                :title="
                  t(
                    `gmvMaxSopActionLabels.${selectedSop.status === 'paused' ? 'resumeCurrentHint' : 'pauseCurrentHint'}`,
                  )
                "
                :disabled="!!busyAction"
                @click="toggleSopStatus"
              >
                <component
                  :is="
                    selectedSop.status === 'paused' ? PlayCircle : PauseCircle
                  "
                  class="gmv-icon"
                />{{
                  t(
                    `gmvMaxSopActionLabels.${selectedSop.status === "paused" ? "resumeCurrent" : "pauseCurrent"}`,
                  )
                }}
              </button>
              <button
                v-if="selectedSop"
                class="gmv-button gmv-button--primary"
                data-testid="gmv-sop-toggle-start"
                :title="
                  t(
                    sopLaunchExpanded
                      ? 'common.cancel'
                      : 'gmvMaxSopActionLabels.startCycleHint',
                  )
                "
                :disabled="!!busyAction"
                @click="sopLaunchExpanded = !sopLaunchExpanded"
              >
                <component
                  :is="sopLaunchExpanded ? X : Plus"
                  class="gmv-icon"
                />{{
                  sopLaunchExpanded
                    ? t("common.cancel")
                    : t("gmvMaxSopActionLabels.startCycle")
                }}
              </button>
            </div>
          </div>

          <section
            class="gmv-decision-center"
            data-testid="gmv-decision-center"
          >
            <section
              class="gmv-decision-scope"
              data-testid="gmv-decision-scope"
            >
              <div class="gmv-decision-scope__stores">
                <div class="gmv-decision-scope__label">
                  <Store /><span
                    ><strong>{{ t("gmvMaxConsole.storeControl") }}</strong
                    ><small
                      >{{ decisionStoreOptions.length }}
                      {{ t("gmvMaxOfficial.storeCount") }}</small
                    ></span
                  >
                  <button
                    type="button"
                    class="gmv-icon-button"
                    data-testid="gmv-decision-scope-toggle"
                    :title="t('gmvMaxSimpleNav.filters')"
                    :aria-expanded="decisionScopeExpanded"
                    @click="decisionScopeExpanded = !decisionScopeExpanded"
                  >
                    <Filter class="gmv-icon" />
                  </button>
                </div>
                <div
                  class="gmv-decision-store-tabs"
                  role="tablist"
                  :aria-label="t('gmvMaxConsole.storeControl')"
                >
                  <button
                    type="button"
                    role="tab"
                    data-testid="gmv-decision-store-all"
                    :aria-selected="decisionStoreFilter === 'all'"
                    :class="{ 'is-active': decisionStoreFilter === 'all' }"
                    @click="setDecisionStoreFilter('all')"
                  >
                    <Store /><span
                      ><strong>{{ t("gmvMaxConsole.allStores") }}</strong
                      ><small
                        >{{ decisionRowsByTypeAndStatus.length }}
                        {{ t("gmvMax.metrics.campaigns") }}</small
                      ></span
                    >
                  </button>
                  <button
                    v-for="store in decisionStoreOptions"
                    :key="store.id"
                    type="button"
                    role="tab"
                    :data-store-id="store.id"
                    :aria-selected="decisionStoreFilter === store.id"
                    :class="{ 'is-active': decisionStoreFilter === store.id }"
                    @click="setDecisionStoreFilter(store.id)"
                  >
                    <Store /><span
                      ><strong>{{ store.name }}</strong
                      ><small
                        >{{ store.count }}
                        {{ t("gmvMax.metrics.campaigns") }}</small
                      ></span
                    >
                  </button>
                </div>
              </div>
              <div
                v-if="decisionScopeExpanded"
                class="gmv-decision-scope__filters"
                data-testid="gmv-decision-advanced-filters"
              >
                <div
                  class="gmv-decision-scope-filter"
                  data-testid="gmv-decision-type-filter"
                >
                  <span>{{ t("gmvMax.fields.type") }}</span>
                  <div role="group" :aria-label="t('gmvMax.fields.type')">
                    <button
                      type="button"
                      data-type="all"
                      :class="{ 'is-active': decisionTypeFilter === 'all' }"
                      @click="setDecisionTypeFilter('all')"
                    >
                      <Filter />{{ t("gmvMaxConsole.allTypes") }}
                    </button>
                    <button
                      type="button"
                      data-type="PRODUCT"
                      :class="{ 'is-active': decisionTypeFilter === 'PRODUCT' }"
                      @click="setDecisionTypeFilter('PRODUCT')"
                    >
                      <Package />{{ t("gmvMax.types.product") }}
                    </button>
                    <button
                      type="button"
                      data-type="LIVE"
                      :class="{ 'is-active': decisionTypeFilter === 'LIVE' }"
                      @click="setDecisionTypeFilter('LIVE')"
                    >
                      <Activity />{{ t("gmvMax.types.live") }}
                    </button>
                  </div>
                </div>
                <div
                  class="gmv-decision-scope-filter"
                  data-testid="gmv-decision-status-filter"
                >
                  <span>{{ t("gmvMax.fields.status") }}</span>
                  <div role="group" :aria-label="t('gmvMax.fields.status')">
                    <button
                      type="button"
                      data-status="all"
                      :class="{ 'is-active': decisionStatusFilter === 'all' }"
                      @click="setDecisionStatusFilter('all')"
                    >
                      {{ t("gmvMaxConsole.status.all") }}
                    </button>
                    <button
                      type="button"
                      data-status="enabled"
                      class="is-enabled"
                      :class="{
                        'is-active': decisionStatusFilter === 'enabled',
                      }"
                      @click="setDecisionStatusFilter('enabled')"
                    >
                      <CheckCircle2 />{{ t("gmvMaxConsole.enabled") }}
                    </button>
                    <button
                      type="button"
                      data-status="disabled"
                      class="is-disabled"
                      :class="{
                        'is-active': decisionStatusFilter === 'disabled',
                      }"
                      @click="setDecisionStatusFilter('disabled')"
                    >
                      <PauseCircle />{{ t("gmvMaxOperationStatus.disable") }}
                    </button>
                  </div>
                </div>
                <span class="gmv-decision-scope__total"
                  ><strong>{{ scopedDecisionRows.length }}</strong
                  >{{ t("gmvMax.metrics.campaigns") }}</span
                >
              </div>
            </section>
            <div
              class="gmv-today-status"
              data-testid="gmv-today-status-summary"
            >
              <article class="is-action">
                <span>{{ t("gmvMaxCoach.actionRequired") }}</span
                ><strong>{{ sopWorkspace.coachSummary.actionRequired }}</strong
                ><small>{{ t("gmvMaxDecision.priority.p0Hint") }}</small>
              </article>
              <article class="is-observing">
                <span>{{ t("gmvMaxCoach.observing") }}</span
                ><strong>{{ sopWorkspace.coachSummary.observing }}</strong
                ><small>{{ t("gmvMaxDecision.priority.p1Hint") }}</small>
              </article>
              <article class="is-normal">
                <span>{{ t("gmvMaxCoach.normal") }}</span
                ><strong>{{ sopWorkspace.coachSummary.normal }}</strong
                ><small>{{ t("gmvMaxDecision.priority.p2Hint") }}</small>
              </article>
              <article class="is-suggested">
                <span>{{ t("gmvMaxCoach.suggestedActions") }}</span
                ><strong>{{
                  sopWorkspace.coachSummary.suggestedActions
                }}</strong
                ><small>{{ t("gmvMaxOfficial.pendingSuggestions") }}</small>
              </article>
            </div>
            <div class="gmv-decision-workbench">
              <div class="gmv-panel gmv-decision-table-panel">
                <div class="gmv-decision-panel-heading">
                  <div>
                    <h2>{{ t("gmvMaxDecisionScope.queue") }}</h2>
                    <p>{{ t("gmvMaxDecisionScope.queueHint") }}</p>
                  </div>
                  <div
                    class="gmv-decision-filters"
                    role="group"
                    :aria-label="t('gmvMaxDecision.productDecisions')"
                  >
                    <button
                      type="button"
                      :class="{ 'is-active': decisionPriorityFilter === 'all' }"
                      @click="setDecisionPriorityFilter('all')"
                    >
                      {{ t("gmvMaxConsole.status.all") }}
                    </button>
                    <button
                      v-for="priority in ['P0', 'P1', 'P2'] as const"
                      :key="priority"
                      type="button"
                      :class="[
                        `is-${priority.toLowerCase()}`,
                        { 'is-active': decisionPriorityFilter === priority },
                      ]"
                      @click="setDecisionPriorityFilter(priority)"
                    >
                      {{ priority }}
                    </button>
                    <span
                      >{{ filteredDecisionRows.length }}
                      {{ t("gmvMaxDecisionScope.items") }}</span
                    >
                  </div>
                </div>
                <div
                  v-if="pagedDecisionRows.length"
                  class="gmv-decision-grid"
                  data-testid="gmv-decision-grid"
                >
                  <button
                    v-for="item in pagedDecisionRows"
                    :key="item.decision.id"
                    type="button"
                    :data-store-id="item.instance.storeId"
                    :data-campaign-type="item.instance.campaignType"
                    :data-campaign-enabled="
                      isDecisionCampaignEnabled(
                        item.instance.campaignOperationStatus,
                      )
                    "
                    :class="[
                      'gmv-decision-card',
                      `is-${item.decision.priority.toLowerCase()}`,
                      { 'is-selected': item.instance.id === selectedSopId },
                    ]"
                    :title="t('gmvMaxDecision.viewReason')"
                    @click="selectSopInstance(item.instance.id)"
                  >
                    <span class="gmv-decision-card__media">
                      <Package />
                      <img
                        v-if="item.decision.productImageUrl"
                        :src="item.decision.productImageUrl"
                        :alt="
                          item.decision.productName ||
                          item.decision.productId ||
                          item.instance.campaignName
                        "
                        loading="lazy"
                        @error="hideBrokenSopImage"
                      />
                      <i>{{ item.decision.priority }}</i>
                    </span>
                    <span class="gmv-decision-card__content">
                      <span class="gmv-decision-card__identity">
                        <span
                          :class="[
                            'gmv-decision-status',
                            `is-${item.decision.status.toLowerCase()}`,
                          ]"
                          >{{ item.decision.status }}
                          {{
                            t(`gmvMaxDecision.status.${item.decision.status}`)
                          }}</span
                        >
                        <span class="gmv-decision-card__scope">
                          <i class="is-type"
                            ><component
                              :is="
                                item.instance.campaignType === 'LIVE'
                                  ? Activity
                                  : Package
                              "
                            />{{
                              t(
                                `gmvMax.types.${item.instance.campaignType.toLowerCase()}`,
                              )
                            }}</i
                          >
                          <i
                            :class="
                              isDecisionCampaignEnabled(
                                item.instance.campaignOperationStatus,
                              )
                                ? 'is-enabled'
                                : 'is-disabled'
                            "
                            ><component
                              :is="
                                isDecisionCampaignEnabled(
                                  item.instance.campaignOperationStatus,
                                )
                                  ? CheckCircle2
                                  : PauseCircle
                              "
                            />{{
                              operationStatusLabel(
                                item.instance.campaignOperationStatus,
                              )
                            }}</i
                          >
                        </span>
                        <small><Store />{{ item.instance.storeName }}</small>
                      </span>
                      <strong class="gmv-decision-card__title">{{
                        item.decision.productName ||
                        item.decision.productId ||
                        item.instance.campaignName
                      }}</strong>
                      <span class="gmv-decision-card__metrics">
                        <span
                          ><small>ROI</small
                          ><strong>{{
                            formatRoi(item.decision.actualRoi)
                          }}</strong
                          ><em
                            >{{ formatRoi(item.decision.targetRoi) }} /
                            {{ formatRoi(item.decision.breakEvenRoi) }}</em
                          ></span
                        >
                        <span
                          ><small>{{ t("gmvMaxConsole.spend") }}</small
                          ><strong>{{
                            formatCny(
                              item.decision.spend,
                              item.decision.storeId,
                            )
                          }}</strong
                          ><em>{{
                            item.decision.budgetUtilization
                              ? formatPercent(item.decision.budgetUtilization)
                              : "-"
                          }}</em></span
                        >
                        <span
                          ><small>GMV</small
                          ><strong>{{
                            formatCny(
                              item.decision.grossRevenue,
                              item.decision.storeId,
                            )
                          }}</strong
                          ><em>{{
                            item.decision.spendVelocity
                              ? Number(item.decision.spendVelocity).toFixed(2)
                              : "-"
                          }}</em></span
                        >
                        <span
                          ><small>{{ t("gmvMax.fields.orders") }}</small
                          ><strong>{{
                            formatInteger(item.instance.metrics.orders)
                          }}</strong
                          ><em
                            >{{ t("gmvMaxDecision.health") }}
                            {{
                              item.decision.healthScore
                                ? formatInteger(item.decision.healthScore)
                                : "-"
                            }}</em
                          ></span
                        >
                      </span>
                      <span class="gmv-decision-card__action"
                        ><span
                          :class="[
                            'gmv-decision-action',
                            `is-${item.decision.priority.toLowerCase()}`,
                          ]"
                          >{{
                            t(
                              `gmvMaxDecision.actions.${item.decision.recommendedAction}`,
                            )
                          }}</span
                        ><small v-if="item.decision.blockedReasons.length">{{
                          t("gmvMaxDecision.diagnosisOnly")
                        }}</small></span
                      >
                    </span>
                    <ChevronRight class="gmv-decision-card__arrow" />
                  </button>
                </div>
                <div
                  v-if="filteredDecisionRows.length"
                  class="gmv-decision-pagination"
                >
                  <span>{{
                    t("gmvMaxData.pageSummary", {
                      current: decisionPage,
                      total: decisionPageCount,
                      count: filteredDecisionRows.length,
                    })
                  }}</span>
                  <div>
                    <button
                      type="button"
                      :title="t('gmvMaxData.previous')"
                      :disabled="decisionPage <= 1"
                      @click="changeDecisionPage(decisionPage - 1)"
                    >
                      <ChevronRight /></button
                    ><button
                      type="button"
                      :title="t('gmvMaxData.next')"
                      :disabled="decisionPage >= decisionPageCount"
                      @click="changeDecisionPage(decisionPage + 1)"
                    >
                      <ChevronRight />
                    </button>
                  </div>
                </div>
                <div v-else class="gmv-empty gmv-empty--small">
                  {{ t("gmvMaxDecision.empty") }}
                </div>
              </div>
              <aside
                class="gmv-panel gmv-today-plan"
                data-testid="gmv-today-plan"
              >
                <header class="gmv-today-plan__header">
                  <div>
                    <span class="gmv-kicker">{{
                      t("gmvMaxDetailDrawer.todayPlan")
                    }}</span>
                    <h2>
                      {{ cockpitTodayPlan.length }}
                      {{ t("gmvMaxSopUi.itemsPending") }}
                    </h2>
                    <p>{{ t("gmvMaxDecision.productDecisionsHint") }}</p>
                  </div>
                  <span class="gmv-today-plan__date"
                    ><CalendarRange />{{
                      cockpitTodayPlanDate || t("gmvMaxSopUi.notAvailable")
                    }}</span
                  >
                </header>
                <div
                  v-if="cockpitTodayPlan.length"
                  class="gmv-today-plan__list"
                >
                  <button
                    v-for="item in cockpitTodayPlan"
                    :key="item.task.id"
                    type="button"
                    :data-sop-instance-id="item.instance.id"
                    :class="[
                      `is-${item.task.priority || item.decision?.priority || 'P2'}`,
                    ]"
                    @click="selectSopInstance(item.instance.id)"
                  >
                    <span class="gmv-today-plan__priority">{{
                      item.task.priority || item.decision?.priority || "P2"
                    }}</span>
                    <span class="gmv-today-plan__copy"
                      ><small
                        >{{ item.task.scheduledTime }} /
                        {{ item.instance.storeName }}</small
                      ><strong>{{ sopTaskTitle(item.task) }}</strong
                      ><em>{{
                        item.instance.productName ||
                        item.instance.productId ||
                        item.instance.campaignName
                      }}</em></span
                    >
                    <ChevronRight />
                  </button>
                </div>
                <div v-else class="gmv-empty gmv-empty--small">
                  {{ t("gmvMaxSopUi.todayComplete") }}
                </div>
              </aside>
            </div>
          </section>

          <button
            v-if="selectedSop"
            type="button"
            class="gmv-today-details-toggle"
            data-testid="gmv-today-details-toggle"
            :aria-expanded="todayDetailsExpanded"
            @click="todayDetailsExpanded = !todayDetailsExpanded"
          >
            <span
              ><Settings2 /><strong>{{
                t("gmvMaxSimpleNav.fullWorkspace")
              }}</strong
              ><small>{{ t("gmvMaxSimpleNav.fullWorkspaceHint") }}</small></span
            ><ChevronDown :class="{ 'is-open': todayDetailsExpanded }" />
          </button>

          <Teleport to="body">
            <div
              v-if="selectedSop && sopDetailOpen"
              class="gmv-command-drawer-backdrop"
              data-testid="gmv-command-center-drawer-backdrop"
              @click.self="closeSopDetail"
            >
              <aside
                class="gmv-command-drawer"
                data-testid="gmv-command-center-drawer"
                role="dialog"
                aria-modal="true"
                :aria-label="t('gmvMaxDetailDrawer.title')"
              >
                <header class="gmv-command-drawer__header">
                  <div class="gmv-command-drawer__identity">
                    <span class="gmv-command-drawer__image"
                      ><Package /><img
                        v-if="selectedSop.productImageUrl"
                        :src="selectedSop.productImageUrl"
                        :alt="
                          selectedSop.productName ||
                          selectedSop.productId ||
                          selectedSop.campaignName
                        "
                        @error="hideBrokenSopImage"
                    /></span>
                    <span
                      ><small
                        >{{ selectedSop.storeName }} /
                        {{
                          t(
                            `gmvMax.types.${selectedSop.campaignType.toLowerCase()}`,
                          )
                        }}</small
                      ><strong
                        :title="
                          selectedSop.productName ||
                          selectedSop.productId ||
                          selectedSop.campaignName
                        "
                        >{{
                          selectedSop.productName ||
                          selectedSop.productId ||
                          t("gmvMaxSop.liveScope")
                        }}</strong
                      ><em :title="selectedSop.campaignName">{{
                        selectedSop.campaignName
                      }}</em></span
                    >
                  </div>
                  <button
                    type="button"
                    class="gmv-icon-button"
                    :title="t('gmvMaxDetailDrawer.close')"
                    @click="closeSopDetail"
                  >
                    <X />
                  </button>
                </header>
                <div class="gmv-command-drawer__context">
                  <span
                    :class="[
                      'gmv-status',
                      selectedSop.status === 'blocked'
                        ? 'is-danger'
                        : selectedSop.status === 'paused'
                          ? 'is-warning'
                          : 'is-success',
                    ]"
                    >{{ t(`gmvMaxSop.status.${selectedSop.status}`) }}</span
                  ><span
                    :class="[
                      'gmv-status',
                      isDecisionCampaignEnabled(
                        selectedSop.campaignOperationStatus,
                      )
                        ? 'is-success'
                        : 'is-neutral',
                    ]"
                    >{{
                      operationStatusLabel(selectedSop.campaignOperationStatus)
                    }}</span
                  ><span
                    >{{ t("gmvMaxSop.currentDay") }}
                    {{ selectedSop.currentDay }}</span
                  ><span
                    >{{ t("gmvMaxCockpit.freshness") }}
                    {{
                      selectedSop.dataFreshness || t("gmvMaxSopUi.notAvailable")
                    }}</span
                  >
                </div>
                <nav
                  class="gmv-command-drawer__tabs"
                  role="tablist"
                  :aria-label="t('gmvMaxDetailDrawer.tabsLabel')"
                >
                  <button
                    v-for="tab in [
                      ['decision', 'decision'],
                      ['tasks', 'tasks'],
                      ['metrics', 'metrics'],
                      ['creative', 'creative'],
                      ['history', 'history'],
                    ] as const"
                    :key="tab[0]"
                    type="button"
                    role="tab"
                    :aria-selected="sopDetailTab === tab[0]"
                    :class="{ 'is-active': sopDetailTab === tab[0] }"
                    @click="sopDetailTab = tab[0]"
                  >
                    {{ t(`gmvMaxDetailDrawer.tabs.${tab[1]}`) }}
                  </button>
                </nav>
                <div class="gmv-command-drawer__body">
                  <section
                    v-if="sopDetailTab === 'decision'"
                    class="gmv-command-drawer__section"
                  >
                    <span class="gmv-kicker">{{
                      t("gmvMaxDetailDrawer.systemJudgement")
                    }}</span>
                    <h3>
                      {{
                        selectedSop.track === "mature_product" &&
                        selectedSop.matureAssessment
                          ? t(
                              `gmvMaxMature.states.${selectedSop.matureAssessment.state}`,
                            )
                          : t(`gmvMaxSop.phases.${selectedSop.phase}`)
                      }}
                    </h3>
                    <p>
                      {{
                        primarySopIssue
                          ? issueText(primarySopIssue, "reason")
                          : t("gmvMaxDetailDrawer.noIssue")
                      }}
                    </p>
                    <div
                      v-if="primarySopIssue"
                      class="gmv-command-drawer__issue"
                    >
                      <ShieldAlert /><span
                        ><strong>{{
                          issueText(primarySopIssue, "title")
                        }}</strong
                        ><small>{{
                          primarySopIssue.blockedReasons?.join(" / ") ||
                          issueText(primarySopIssue, "solution")
                        }}</small></span
                      >
                    </div>
                    <div class="gmv-command-drawer__facts">
                      <span
                        ><small>ROI</small
                        ><strong>{{
                          formatRoi(selectedSop.metrics.roi)
                        }}</strong
                        ><em
                          >{{ t("gmvMaxDetailDrawer.target") }}
                          {{ formatRoi(selectedSop.targetRoi) }}</em
                        ></span
                      ><span
                        ><small>{{ t("gmvMaxSop.metrics.gmv") }}</small
                        ><strong>{{
                          formatCny(
                            selectedSop.metrics.gmv,
                            selectedSop.storeId,
                          )
                        }}</strong
                        ><em
                          >{{ t("gmvMaxSop.metrics.orders") }}
                          {{ selectedSop.metrics.orders }}</em
                        ></span
                      ><span
                        ><small>{{ t("gmvMaxSopUi.profitFloorLabel") }}</small
                        ><strong>{{
                          formatRoi(selectedSop.profitFloor)
                        }}</strong
                        ><em
                          >{{ t("gmvMaxDetailDrawer.freshness") }}
                          {{
                            selectedSop.dataFreshness ||
                            t("gmvMaxSopUi.notAvailable")
                          }}</em
                        ></span
                      >
                    </div>
                    <button
                      v-if="primarySopIssue"
                      type="button"
                      class="gmv-button gmv-button--primary gmv-command-drawer__primary"
                      :data-action-target="primarySopIssue.actionTarget"
                      @click="handleSopIssue(primarySopIssue)"
                    >
                      <ArrowUpRight class="gmv-icon" />{{
                        t("gmvMaxDetailDrawer.handleIssue")
                      }}
                    </button>
                    <section
                      class="gmv-command-coach"
                      data-testid="gmv-coach-panel"
                    >
                      <header class="gmv-command-coach__header">
                        <div>
                          <span class="gmv-kicker">{{
                            t("gmvMaxCoach.title")
                          }}</span>
                          <h3>{{ t("gmvMaxCoach.diagnosis") }}</h3>
                        </div>
                        <button
                          type="button"
                          class="gmv-icon-button"
                          :title="t('gmvMaxCoach.refresh')"
                          :disabled="!!busyAction"
                          @click="refreshCoachDecision"
                        >
                          <RefreshCw class="gmv-icon" />
                        </button>
                      </header>
                      <p class="gmv-command-coach__diagnosis">
                        {{
                          selectedCoachDecision?.diagnosis ||
                          t("gmvMaxCoach.unavailable")
                        }}
                      </p>
                      <div
                        v-if="selectedCoachProfile"
                        class="gmv-coach-profile"
                      >
                        <span
                          ><small>{{ t("gmvMaxCoach.stage") }}</small
                          ><strong>{{
                            selectedCoachProfile.stageLabel
                          }}</strong></span
                        >
                        <span
                          ><small>{{ t("gmvMaxCoach.historyPeak") }}</small
                          ><strong>{{
                            formatCny(
                              selectedCoachProfile.historicalPeakGmv,
                              selectedSop.storeId,
                            )
                          }}</strong></span
                        >
                        <span
                          ><small>{{ t("gmvMaxCoach.recentBaseline") }}</small
                          ><strong>{{
                            formatCny(
                              selectedCoachProfile.recentBaselineGmv,
                              selectedSop.storeId,
                            )
                          }}</strong></span
                        >
                        <span
                          ><small>{{ t("gmvMaxCoach.recovery") }}</small
                          ><strong
                            >{{
                              selectedCoachProfile.recoveryRate || "-"
                            }}%</strong
                          ></span
                        >
                        <span
                          ><small>ROI</small
                          ><strong>{{
                            formatRoi(selectedCoachProfile.currentRoi)
                          }}</strong
                          ><em>{{
                            formatRoi(selectedCoachProfile.breakEvenRoi)
                          }}</em></span
                        >
                        <span
                          ><small>{{
                            t("gmvMaxCoach.budgetUtilization")
                          }}</small
                          ><strong
                            >{{
                              selectedCoachProfile.budgetUtilization || "-"
                            }}%</strong
                          ></span
                        >
                      </div>
                      <div
                        v-if="selectedCoachDecision"
                        class="gmv-coach-detail"
                      >
                        <div>
                          <span class="gmv-kicker">{{
                            t("gmvMaxCoach.evidence")
                          }}</span>
                          <ul>
                            <li
                              v-for="item in selectedCoachDecision.evidence.slice(
                                0,
                                4,
                              )"
                              :key="item.metric"
                            >
                              <strong
                                >{{ coachEvidenceMetricLabel(item) }}
                                {{ item.value }}</strong
                              ><small>{{ coachEvidenceDetail(item) }}</small>
                            </li>
                          </ul>
                        </div>
                        <div>
                          <span class="gmv-kicker">{{
                            t("gmvMaxCoach.plan")
                          }}</span>
                          <ol>
                            <li
                              v-for="item in selectedCoachDecision.plan"
                              :key="item.day"
                            >
                              <strong
                                >{{
                                  t("gmvMaxCoach.dayLabel", { day: item.day })
                                }}：{{
                                  coachPlanActionLabel(item.action)
                                }}</strong
                              ><small
                                >{{ item.objective
                                }}<template v-if="item.trigger"
                                  >。{{ item.trigger }}</template
                                ></small
                              >
                            </li>
                          </ol>
                        </div>
                        <div v-if="selectedCoachDecision.guardrails.length">
                          <span class="gmv-kicker">{{
                            t("gmvMaxCoach.guardrails")
                          }}</span>
                          <ul>
                            <li
                              v-for="item in selectedCoachDecision.guardrails"
                              :key="item"
                            >
                              <small>{{ coachGuardrailLabel(item) }}</small>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </section>
                  </section>
                  <section
                    v-else-if="sopDetailTab === 'tasks'"
                    class="gmv-command-drawer__section"
                  >
                    <div class="gmv-command-drawer__section-heading">
                      <span
                        ><span class="gmv-kicker">{{
                          t("gmvMaxDetailDrawer.todayPlan")
                        }}</span>
                        <h3>
                          {{ selectedSopPendingTasks.length }}
                          {{ t("gmvMaxSopUi.itemsPending") }}
                        </h3></span
                      ><small>{{
                        selectedSopTaskDate || t("gmvMaxSopUi.notAvailable")
                      }}</small>
                    </div>
                    <div class="gmv-command-timeline">
                      <article
                        v-for="task in selectedSopTasks.slice(0, 8)"
                        :key="task.id"
                        :class="[`is-${task.status}`]"
                      >
                        <span class="gmv-command-timeline__dot"
                          ><Check v-if="task.status === 'completed'" /><Clock3
                            v-else
                        /></span>
                        <div>
                          <small
                            >{{ task.scheduledTime }} /
                            {{
                              task.executionMode === "manual_external"
                                ? t("gmvMaxSopUi.sellerCenterRequired")
                                : task.priority || "P2"
                            }}</small
                          ><strong>{{ sopTaskTitle(task) }}</strong>
                          <p>{{ sopTaskDescription(task) }}</p>
                          <button
                            v-if="['pending', 'blocked'].includes(task.status)"
                            type="button"
                            class="gmv-button gmv-button--secondary"
                            :disabled="!!busyAction"
                            @click="completeSopTask(task)"
                          >
                            {{ t("gmvMaxSopUi.markComplete") }}
                          </button>
                        </div>
                      </article>
                      <div
                        v-if="!selectedSopTasks.length"
                        class="gmv-empty gmv-empty--small"
                      >
                        {{ t("gmvMaxSopUi.todayComplete") }}
                      </div>
                    </div>
                  </section>
                  <section
                    v-else-if="sopDetailTab === 'metrics'"
                    class="gmv-command-drawer__section"
                  >
                    <span class="gmv-kicker">{{
                      t("gmvMaxDetailDrawer.metricsTitle")
                    }}</span>
                    <h3>{{ t("gmvMaxDetailDrawer.metricsSubtitle") }}</h3>
                    <div class="gmv-command-metrics">
                      <span
                        v-for="metric in sopKeyMetricCards"
                        :key="metric.key"
                        ><small>{{
                          te(`gmvMaxSop.metrics.${metric.key}`)
                            ? t(`gmvMaxSop.metrics.${metric.key}`)
                            : metric.key
                        }}</small
                        ><strong>{{ metric.value }}</strong
                        ><em>{{
                          t("gmvMaxDetailDrawer.metricSignal")
                        }}</em></span
                      >
                    </div>
                    <div class="gmv-command-drawer__freshness">
                      <Clock3 /><span
                        ><strong>{{
                          t("gmvMaxDetailDrawer.dataFreshness")
                        }}</strong
                        ><small
                          >{{
                            selectedSop.lastDeliveryDate ||
                            t("gmvMaxSopUi.noActiveDelivery")
                          }}
                          /
                          {{
                            selectedSop.dataFreshness ||
                            t("gmvMaxSopUi.notAvailable")
                          }}</small
                        ></span
                      >
                    </div>
                  </section>
                  <section
                    v-else-if="sopDetailTab === 'creative'"
                    class="gmv-command-drawer__section"
                  >
                    <span class="gmv-kicker">{{
                      t("gmvMaxDetailDrawer.creativeTitle")
                    }}</span>
                    <h3>
                      {{ selectedSopCreativeVideos.length }}
                      {{ t("gmvMaxSopVideo.videoList") }}
                    </h3>
                    <div class="gmv-command-creative-grid">
                      <article
                        v-for="video in selectedSopCreativeVideos.slice(0, 6)"
                        :key="video.id"
                      >
                        <span class="gmv-command-creative-grid__cover"
                          ><img
                            v-if="video.coverUrl"
                            :src="video.coverUrl"
                            :alt="video.name"
                            @error="hideBrokenSopVideoCover(video)"
                          /><Film v-else /><i v-if="!video.coverUrl">{{
                            t(`gmvMaxSopVideo.freshness.${video.freshness}`)
                          }}</i></span
                        ><strong :title="video.name">{{ video.name }}</strong
                        ><small
                          >{{ video.grade }} /
                          {{
                            video.performance.roi
                              ? formatRoi(video.performance.roi)
                              : t("gmvMaxSopVideo.noData")
                          }}</small
                        >
                      </article>
                      <div
                        v-if="!selectedSopCreativeVideos.length"
                        class="gmv-empty gmv-empty--small"
                      >
                        {{ t("gmvMaxSopVideo.empty") }}
                      </div>
                    </div>
                  </section>
                  <section v-else class="gmv-command-drawer__section">
                    <span class="gmv-kicker">{{
                      t("gmvMaxDetailDrawer.historyTitle")
                    }}</span>
                    <h3>{{ t("gmvMaxDetailDrawer.historySubtitle") }}</h3>
                    <div class="gmv-command-history">
                      <article
                        v-for="run in sopWorkspace.automationRuns
                          .filter(
                            (item) => item.sopInstanceId === selectedSop.id,
                          )
                          .slice(0, 8)"
                        :key="run.id"
                      >
                        <span>{{ formatDate(run.updatedAt) }}</span
                        ><strong>{{ run.action }}</strong
                        ><small>{{ run.message }}</small
                        ><b :class="`is-${run.status}`">{{ run.status }}</b>
                      </article>
                      <div
                        v-if="
                          !sopWorkspace.automationRuns.some(
                            (item) => item.sopInstanceId === selectedSop.id,
                          )
                        "
                        class="gmv-empty gmv-empty--small"
                      >
                        {{ t("gmvMaxDetailDrawer.noHistory") }}
                      </div>
                    </div>
                  </section>
                </div>
                <footer class="gmv-command-drawer__footer">
                  <button
                    type="button"
                    class="gmv-button gmv-button--secondary"
                    :disabled="!!busyAction"
                    @click="toggleSopStatus"
                  >
                    <component
                      :is="
                        selectedSop.status === 'paused'
                          ? PlayCircle
                          : PauseCircle
                      "
                      class="gmv-icon"
                    />{{
                      selectedSop.status === "paused"
                        ? t("gmvMaxSopActionLabels.resumeCurrent")
                        : t("gmvMaxSopActionLabels.pauseCurrent")
                    }}</button
                  ><button
                    type="button"
                    class="gmv-button gmv-button--primary"
                    :disabled="!!busyAction"
                    @click="
                      sopLaunchExpanded = true;
                      closeSopDetail();
                    "
                  >
                    <Plus class="gmv-icon" />{{
                      t("gmvMaxSopActionLabels.startCycle")
                    }}
                  </button>
                </footer>
              </aside>
            </div>
          </Teleport>

          <section
            v-if="selectedSop && todayDetailsExpanded"
            class="gmv-sop-object-bar"
            data-testid="gmv-sop-current-object"
          >
            <button
              type="button"
              class="gmv-sop-object-bar__selector"
              data-testid="gmv-sop-open-picker"
              @click="openSopPicker"
            >
              <span class="gmv-sop-object-bar__image">
                <Package />
                <img
                  v-if="selectedSop.productImageUrl"
                  :src="selectedSop.productImageUrl"
                  :alt="
                    selectedSop.productName ||
                    selectedSop.productId ||
                    selectedSop.campaignName
                  "
                  @error="hideBrokenSopImage"
                />
              </span>
              <span class="gmv-sop-object-bar__copy">
                <small>{{ t("gmvMaxSopUi.currentObject") }}</small>
                <strong
                  :title="
                    selectedSop.productName ||
                    selectedSop.productId ||
                    t('gmvMaxSop.liveScope')
                  "
                  >{{
                    selectedSop.productName ||
                    selectedSop.productId ||
                    t("gmvMaxSop.liveScope")
                  }}</strong
                >
                <span
                  ><b>{{ t("gmvMaxSopUi.campaignLabel") }}</b
                  ><em :title="selectedSop.campaignName">{{
                    selectedSop.campaignName
                  }}</em></span
                >
                <span class="gmv-sop-object-bar__meta"
                  ><i>{{ selectedSop.storeName }}</i
                  ><i>{{
                    t(
                      `gmvMaxMature.tracks.${selectedSop.track || "new_product"}`,
                    )
                  }}</i
                  ><i>{{
                    operationStatusLabel(selectedSop.campaignOperationStatus)
                  }}</i
                  ><i>{{
                    t(`gmvMaxSop.status.${selectedSop.status}`)
                  }}</i></span
                >
              </span>
              <span class="gmv-sop-object-bar__change"
                >{{ t("gmvMaxSopUi.changeObject") }}<ChevronDown
              /></span>
            </button>
            <button
              v-if="selectedSop.productId"
              type="button"
              class="gmv-icon-button"
              :title="t('gmvMaxSopUi.copyProductId')"
              @click="copySopIdentifier(selectedSop.productId)"
            >
              <Copy />
            </button>
          </section>

          <section
            v-if="!selectedSop || sopLaunchExpanded"
            class="gmv-sop-launch"
            data-testid="gmv-sop-start"
          >
            <div class="gmv-sop-launch__route">
              <div class="gmv-sop-launch__eyebrow">
                <Rocket /><span
                  ><small>PROTECTED LAUNCH</small
                  ><strong>{{ t("gmvMaxSop.start.title") }}</strong></span
                >
              </div>
              <p>{{ t("gmvMaxSop.start.hint") }}</p>
              <div class="gmv-sop-launch__phases">
                <div v-for="(item, index) in sopPhases" :key="item.phase">
                  <span>{{ String(index + 1).padStart(2, "0") }}</span
                  ><strong>{{ item.label }}</strong
                  ><small>{{ item.days }}</small>
                </div>
              </div>
            </div>
            <div class="gmv-sop-launch__form">
              <header>
                <div>
                  <span>{{ t("gmvMaxSop.start.title") }}</span
                  ><strong>{{
                    selectedSopCampaign
                      ? t(
                          `gmvMax.types.${selectedSopCampaign.campaignType.toLowerCase()}`,
                        )
                      : t("gmvMaxSop.start.campaign")
                  }}</strong>
                </div>
              </header>
              <div class="gmv-sop-launch__fields">
                <label
                  ><span>{{ t("gmvMaxSop.start.campaign") }}</span
                  ><select
                    v-model="sopStartDraft.campaignId"
                    data-testid="gmv-sop-campaign"
                  >
                    <option value="">
                      {{ t("gmvMaxSop.start.campaign") }}
                    </option>
                    <option
                      v-for="campaign in sopCampaignOptions"
                      :key="campaign.id"
                      :value="campaign.id"
                    >
                      {{ campaign.name }} /
                      {{
                        t(`gmvMax.types.${campaign.campaignType.toLowerCase()}`)
                      }}
                    </option>
                  </select></label
                >
                <label v-if="sopRequiresHeroSku"
                  ><span>{{ t("gmvMaxSop.start.productId") }}</span
                  ><select
                    v-model="sopStartDraft.productId"
                    data-testid="gmv-sop-product-id"
                    :disabled="sopProductLoading || !sopProductOptions.length"
                    @change="selectSopProduct"
                  >
                    <option value="">
                      {{
                        sopProductLoading
                          ? t("gmvMaxData.loadingPage")
                          : t("gmvMaxSop.start.productName")
                      }}
                    </option>
                    <option
                      v-for="product in sopProductOptions"
                      :key="product.productId"
                      :value="product.productId"
                    >
                      {{ product.productName || product.productId }} /
                      {{ product.productId }}
                    </option>
                  </select></label
                >
                <label
                  ><span>{{ t("gmvMaxData.startDate") }}</span
                  ><input v-model="sopStartDraft.startDate" type="date"
                /></label>
                <label
                  ><span>{{ t("gmvMaxMature.track") }}</span
                  ><select v-model="sopStartDraft.track">
                    <option value="">{{ t("gmvMaxMature.autoTrack") }}</option>
                    <option value="new_product">
                      {{ t("gmvMaxMature.tracks.new_product") }}
                    </option>
                    <option value="mature_product">
                      {{ t("gmvMaxMature.tracks.mature_product") }}
                    </option>
                    <option value="live">
                      {{ t("gmvMaxMature.tracks.live") }}
                    </option>
                  </select></label
                >
                <label v-if="sopStartDraft.track"
                  ><span>{{ t("gmvMaxMature.overrideReason") }}</span
                  ><input v-model="sopStartDraft.trackOverrideReason"
                /></label>
              </div>
              <div class="gmv-sop-launch__footer">
                <span :class="{ 'is-ready': sopCanStart }"
                  ><CheckCircle2 v-if="sopCanStart" /><ShieldAlert v-else />{{
                    sopStartRequirement
                  }}</span
                ><button
                  class="gmv-button gmv-button--primary"
                  data-testid="gmv-sop-start-button"
                  :title="t('gmvMaxSopActionLabels.startCycleHint')"
                  :disabled="!sopCanStart || !!busyAction || sopProductLoading"
                  @click="startSop"
                >
                  <Rocket class="gmv-icon" />{{
                    t("gmvMaxSopActionLabels.startCycle")
                  }}
                </button>
              </div>
            </div>
          </section>

          <div
            v-if="sopLoading"
            class="gmv-empty"
            data-testid="gmv-sop-loading"
          >
            {{ t("gmvMaxData.loadingPage") }}
          </div>
          <section v-else-if="!selectedSop" class="gmv-sop-readiness">
            <div>
              <CalendarRange /><span
                ><strong>{{ t("gmvMaxSop.empty") }}</strong
                ><small>{{ t("gmvMaxSop.emptyHint") }}</small></span
              >
            </div>
            <dl>
              <div>
                <dt>{{ t("gmvMax.metrics.campaigns") }}</dt>
                <dd>{{ sopCampaignOptions.length }}</dd>
              </div>
              <div>
                <dt>{{ t("gmvMaxCatalog.configured") }}</dt>
                <dd>
                  {{ dashboard.catalog.configuredProducts }} /
                  {{ dashboard.catalog.products }}
                </dd>
              </div>
              <div>
                <dt>{{ t("gmvMaxCatalog.videos") }}</dt>
                <dd>{{ dashboard.catalog.videos }}</dd>
              </div>
            </dl>
          </section>
          <template v-else-if="todayDetailsExpanded">
            <details
              v-if="sopWorkspace.issueQueue.length"
              class="gmv-store-issue-center"
              data-testid="gmv-store-issue-center"
            >
              <summary>
                <span
                  ><ShieldAlert /><strong>{{
                    t("gmvMaxOperations.storeIssues")
                  }}</strong></span
                ><small
                  >{{
                    sopWorkspace.issueQueue.filter(
                      (item) => item.severity === "must_fix",
                    ).length
                  }}
                  {{ t("gmvMaxOperations.mustFix") }}</small
                >
              </summary>
              <div>
                <button
                  v-for="issue in sopWorkspace.issueQueue.slice(0, 5)"
                  :key="issue.id"
                  type="button"
                  @click="handleGlobalSopIssue(issue)"
                >
                  <span
                    ><strong>{{ issueText(issue, "title") }}</strong
                    ><small
                      >{{
                        issue.productName ||
                        issue.productId ||
                        issue.campaignName
                      }}
                      / {{ issue.storeName }}</small
                    ></span
                  ><ChevronRight />
                </button>
              </div>
            </details>

            <div class="gmv-sop-main-grid">
              <div class="gmv-sop-main-grid__diagnosis">
                <section
                  class="gmv-sop-decision"
                  data-testid="gmv-sop-decision"
                >
                  <div class="gmv-sop-decision__main">
                    <span>{{ t("gmvMaxSopUi.systemDecision") }}</span>
                    <h3>
                      {{
                        selectedSop.track === "mature_product" &&
                        selectedSop.matureAssessment
                          ? t(
                              `gmvMaxMature.states.${selectedSop.matureAssessment.state}`,
                            )
                          : t(`gmvMaxSop.phases.${selectedSop.phase}`)
                      }}
                    </h3>
                    <p>
                      {{
                        selectedSop.track === "mature_product" &&
                        selectedSop.matureAssessment
                          ? t(
                              `gmvMaxMature.actions.${selectedSop.matureAssessment.recommendedAction}`,
                            )
                          : t("gmvMaxSopUi.phaseGuidance", {
                              phase: t(`gmvMaxSop.phases.${selectedSop.phase}`),
                            })
                      }}
                    </p>
                    <div>
                      <span
                        :class="[
                          'gmv-status',
                          selectedSop.status === 'blocked'
                            ? 'is-danger'
                            : selectedSop.status === 'paused'
                              ? 'is-warning'
                              : 'is-success',
                        ]"
                        >{{ t(`gmvMaxSop.status.${selectedSop.status}`) }}</span
                      ><small
                        >{{
                          selectedSop.track === "mature_product"
                            ? t("gmvMaxMature.productAge")
                            : t("gmvMaxSop.currentDay")
                        }}
                        {{ selectedSop.currentDay }}</small
                      ><small
                        >{{ t("gmvMaxSopUi.profitFloorLabel") }}
                        {{ formatRoi(selectedSop.profitFloor) }}</small
                      >
                    </div>
                  </div>
                  <div
                    class="gmv-sop-decision__automation"
                    data-testid="gmv-sop-automation-status"
                  >
                    <div>
                      <component
                        :is="
                          selectedSop.automationEnabled === false
                            ? PauseCircle
                            : CheckCircle2
                        "
                      /><span
                        ><strong>{{
                          t(
                            `gmvMaxSopAutomation.${selectedSop.automationEnabled === false ? "disabled" : "enabled"}`,
                          )
                        }}</strong
                        ><small>{{
                          t(
                            selectedSop.automationEnabled === false
                              ? "gmvMaxSopUi.automationPausedHint"
                              : "gmvMaxSopUi.automationEnabledHint",
                          )
                        }}</small></span
                      >
                    </div>
                    <button
                      type="button"
                      class="gmv-button gmv-button--secondary"
                      data-testid="gmv-sop-automation-settings-toggle"
                      :aria-expanded="sopAutomationSettingsExpanded"
                      @click="
                        sopAutomationSettingsExpanded =
                          !sopAutomationSettingsExpanded
                      "
                    >
                      <Settings2 class="gmv-icon" />{{
                        t("gmvMaxSopUi.automationSettings")
                      }}
                    </button>
                  </div>
                  <div
                    v-if="sopAutomationSettingsExpanded"
                    class="gmv-sop-decision__settings"
                    data-testid="gmv-sop-automation-settings"
                  >
                    <button
                      data-testid="gmv-sop-automation-toggle"
                      :class="[
                        'gmv-button',
                        selectedSop.automationEnabled === false
                          ? 'gmv-button--primary'
                          : 'gmv-button--secondary',
                      ]"
                      :disabled="!!busyAction"
                      @click="toggleSopAutomation"
                    >
                      <component
                        :is="
                          selectedSop.automationEnabled === false
                            ? PlayCircle
                            : PauseCircle
                        "
                        class="gmv-icon"
                      />{{
                        t(
                          `gmvMaxSopAutomation.${selectedSop.automationEnabled === false ? "enable" : "disable"}`,
                        )
                      }}
                    </button>
                    <label
                      ><span>{{ t("gmvMaxSopUi.automationMode") }}</span
                      ><select
                        data-testid="gmv-sop-automation-mode"
                        :value="selectedSop.automationMode || 'draft_actions'"
                        :disabled="
                          selectedSop.automationEnabled === false ||
                          !!busyAction
                        "
                        @change="changeSopAutomationMode"
                      >
                        <option value="diagnostic_only">
                          {{ t("gmvMaxSopAutomation.modes.diagnostic_only") }}
                        </option>
                        <option value="draft_actions">
                          {{ t("gmvMaxSopAutomation.modes.draft_actions") }}
                        </option>
                      </select></label
                    >
                    <button
                      class="gmv-button gmv-button--secondary"
                      data-testid="gmv-sop-automation-run"
                      :disabled="
                        selectedSop.automationEnabled === false || !!busyAction
                      "
                      @click="runSopAutomation"
                    >
                      <RefreshCw class="gmv-icon" />{{
                        t("gmvMaxSopUi.recalculateNow")
                      }}
                    </button>
                    <label v-if="selectedSop.track === 'mature_product'"
                      ><span>{{ t("gmvMaxMature.track") }}</span
                      ><select
                        :value="selectedSop.track"
                        :title="t('gmvMaxMature.overrideTrack')"
                        @change="overrideSopTrack"
                      >
                        <option value="new_product">
                          {{ t("gmvMaxMature.tracks.new_product") }}
                        </option>
                        <option value="mature_product">
                          {{ t("gmvMaxMature.tracks.mature_product") }}
                        </option>
                        <option value="live">
                          {{ t("gmvMaxMature.tracks.live") }}
                        </option>
                      </select></label
                    >
                    <small
                      >{{ sopAutomationResult(selectedSopAutomationRun) }} ·
                      {{ t("gmvMaxSopAutomation.nextRun") }}
                      {{ formatDate(selectedSop.nextAutomationAt) }}</small
                    >
                  </div>
                </section>

                <section
                  v-if="primarySopIssue"
                  class="gmv-sop-resolution"
                  data-testid="gmv-sop-resolution-center"
                  :data-issue-code="primarySopIssue.code"
                >
                  <header>
                    <span
                      :class="[
                        'gmv-status',
                        primarySopIssue.severity === 'must_fix'
                          ? 'is-danger'
                          : primarySopIssue.severity === 'observing'
                            ? 'is-blue'
                            : primarySopIssue.severity === 'resolved'
                              ? 'is-success'
                              : 'is-warning',
                      ]"
                      >{{
                        t(
                          `gmvMaxIssueResolutions.severity.${primarySopIssue.severity}`,
                        )
                      }}</span
                    ><small>{{
                      t("gmvMaxIssueResolutions.objectContext", {
                        product:
                          selectedSop.productName ||
                          selectedSop.productId ||
                          t("gmvMaxSop.liveScope"),
                        campaign: selectedSop.campaignName,
                      })
                    }}</small>
                  </header>
                  <div class="gmv-sop-resolution__main">
                    <div>
                      <h3>{{ issueText(primarySopIssue, "title") }}</h3>
                      <p>{{ issueText(primarySopIssue, "reason") }}</p>
                    </div>
                    <div class="gmv-row__actions">
                      <button
                        class="gmv-button gmv-button--ghost"
                        data-testid="gmv-sop-help-action"
                        @click="openHelpIssue(primarySopIssue.code)"
                      >
                        <BookOpen class="gmv-icon" />{{
                          t("gmvMaxHelp.viewResolution")
                        }}</button
                      ><button
                        v-if="primarySopIssue.actionTarget !== 'none'"
                        class="gmv-button gmv-button--primary"
                        data-testid="gmv-sop-primary-action"
                        :disabled="!!busyAction"
                        @click="handleSopIssue(primarySopIssue)"
                      >
                        {{ issueActionLabel(primarySopIssue)
                        }}<ArrowUpRight class="gmv-icon" />
                      </button>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>{{ t("gmvMaxIssueResolutions.currentValue") }}</dt>
                      <dd>
                        {{ structuredValueLabel(primarySopIssue.currentValue) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t("gmvMaxIssueResolutions.targetValue") }}</dt>
                      <dd>
                        {{ structuredValueLabel(primarySopIssue.targetValue) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t("gmvMaxIssueResolutions.evidenceSource") }}</dt>
                      <dd>
                        {{
                          structuredValueLabel(primarySopIssue.evidenceSource)
                        }}
                      </dd>
                    </div>
                  </dl>
                  <div class="gmv-sop-resolution__solution">
                    <strong>{{ t("gmvMaxIssueResolutions.solution") }}</strong
                    ><span>{{ issueText(primarySopIssue, "solution") }}</span
                    ><small>{{
                      issueText(primarySopIssue, "completion")
                    }}</small>
                  </div>
                  <details v-if="selectedSopIssues.length > 1">
                    <summary>
                      {{ t("gmvMaxIssueResolutions.allIssues")
                      }}<span
                        >{{ sopIssueSummary.mustFix }} /
                        {{ sopIssueSummary.recommended }} /
                        {{ sopIssueSummary.observing }} /
                        {{ sopIssueSummary.resolved }}</span
                      >
                    </summary>
                    <div class="gmv-sop-resolution-groups">
                      <section
                        v-for="group in groupedSopIssues"
                        :key="group.severity"
                      >
                        <header>
                          <span
                            :class="[
                              'gmv-sop-resolution-list__mark',
                              `is-${group.severity}`,
                            ]"
                          ></span
                          ><strong>{{
                            t(
                              `gmvMaxIssueResolutions.severity.${group.severity}`,
                            )
                          }}</strong
                          ><small>{{ group.items.length }}</small>
                        </header>
                        <div class="gmv-sop-resolution-list">
                          <details
                            v-for="issue in group.items"
                            :key="issue.id"
                            class="gmv-sop-resolution-item"
                            :data-issue-code="issue.code"
                          >
                            <summary>
                              <div>
                                <strong>{{ issueText(issue, "title") }}</strong
                                ><small
                                  >{{
                                    structuredValueLabel(issue.currentValue)
                                  }}
                                  /
                                  {{
                                    structuredValueLabel(issue.targetValue)
                                  }}</small
                                >
                              </div>
                              <div class="gmv-row__actions">
                                <button
                                  class="gmv-button gmv-button--ghost"
                                  @click.prevent.stop="
                                    openHelpIssue(issue.code)
                                  "
                                >
                                  <BookOpen class="gmv-icon" />{{
                                    t("gmvMaxHelp.viewResolution")
                                  }}</button
                                ><button
                                  v-if="issue.actionTarget !== 'none'"
                                  class="gmv-button gmv-button--ghost"
                                  @click.prevent.stop="handleSopIssue(issue)"
                                >
                                  {{ issueActionLabel(issue) }}
                                </button>
                              </div>
                            </summary>
                            <div class="gmv-sop-resolution-item__body">
                              <p>{{ issueText(issue, "reason") }}</p>
                              <dl>
                                <div>
                                  <dt>
                                    {{ t("gmvMaxIssueResolutions.solution") }}
                                  </dt>
                                  <dd>{{ issueText(issue, "solution") }}</dd>
                                </div>
                                <div>
                                  <dt>
                                    {{
                                      t("gmvMaxIssueResolutions.evidenceSource")
                                    }}
                                  </dt>
                                  <dd>
                                    {{
                                      structuredValueLabel(issue.evidenceSource)
                                    }}
                                  </dd>
                                </div>
                                <div>
                                  <dt>
                                    {{
                                      t("gmvMaxIssueResolutions.targetValue")
                                    }}
                                  </dt>
                                  <dd>{{ issueText(issue, "completion") }}</dd>
                                </div>
                              </dl>
                            </div>
                          </details>
                        </div>
                      </section>
                    </div>
                  </details>
                </section>
              </div>

              <section
                class="gmv-panel gmv-sop-tasks gmv-sop-tasks--focus"
                data-testid="gmv-sop-today-tasks"
              >
                <div class="gmv-panel__heading">
                  <div>
                    <h2>{{ t("gmvMaxSopUi.todayTasks") }}</h2>
                    <p>
                      {{ selectedSopTaskDate || t("gmvMaxSop.tasks.empty") }}
                    </p>
                  </div>
                  <span class="gmv-status is-blue"
                    >{{ selectedSopPendingTasks.length }}
                    {{ t("gmvMaxSopUi.itemsPending") }}</span
                  >
                </div>
                <div
                  v-if="selectedSopPendingTasks.length"
                  class="gmv-sop-task-list"
                >
                  <article
                    v-for="task in selectedSopPendingTasks"
                    :key="task.id"
                    :class="{
                      'is-external': task.executionMode === 'manual_external',
                      'is-blocked': task.status === 'blocked',
                    }"
                  >
                    <time
                      >{{ task.scheduledTime
                      }}<small>{{ task.localDate }}</small></time
                    >
                    <div>
                      <strong
                        ><b
                          v-if="task.priority"
                          :class="[
                            'gmv-task-priority',
                            `is-${task.priority.toLowerCase()}`,
                          ]"
                          >{{ task.priority }}</b
                        >{{ sopTaskTitle(task) }}</strong
                      >
                      <p>{{ sopTaskDescription(task) }}</p>
                      <span v-if="task.executionMode === 'manual_external'"
                        ><ExternalLink />{{
                          t("gmvMaxSopUi.sellerCenterRequired")
                        }}</span
                      >
                    </div>
                    <button
                      v-if="
                        task.status === 'pending' &&
                        task.executionMode === 'manual_external' &&
                        issueForTask(task)
                      "
                      class="gmv-button gmv-button--primary"
                      :disabled="!!busyAction"
                      @click="handleSopIssue(issueForTask(task))"
                    >
                      <ExternalLink class="gmv-icon" />{{
                        t("gmvMaxIssueResolutions.actions.seller_center")
                      }}
                    </button>
                    <button
                      v-else-if="task.status === 'pending' && task.experimentId"
                      class="gmv-button gmv-button--primary"
                      :disabled="!!busyAction"
                      @click="approveExperimentTask(task)"
                    >
                      <ShieldCheck class="gmv-icon" />{{
                        task.recommendedAction === "rollback_roi"
                          ? t("gmvMaxDecision.actions.rollback_roi")
                          : t("gmvMaxExecutionTruth.approveAndExecute")
                      }}
                    </button>
                    <button
                      v-else-if="
                        task.status === 'pending' &&
                        task.executionMode !== 'manual_external'
                      "
                      class="gmv-button gmv-button--secondary"
                      :disabled="!!busyAction"
                      @click="completeSopTask(task)"
                    >
                      <Check class="gmv-icon" />{{
                        t("gmvMaxSopUi.markComplete")
                      }}
                    </button>
                    <span v-else class="gmv-status is-warning">{{
                      t("gmvMaxSop.status.blocked")
                    }}</span>
                  </article>
                </div>
                <div v-else class="gmv-sop-task-empty">
                  <CheckCircle2 /><span
                    ><strong>{{ t("gmvMaxSopUi.todayComplete") }}</strong
                    ><small>{{
                      t("gmvMaxSopUi.todayCompleteHint")
                    }}</small></span
                  >
                </div>
                <button
                  v-if="selectedSopCompletedTasks.length"
                  type="button"
                  class="gmv-sop-inline-toggle"
                  :aria-expanded="sopCompletedTasksExpanded"
                  @click="
                    sopCompletedTasksExpanded = !sopCompletedTasksExpanded
                  "
                >
                  <span
                    >{{ t("gmvMaxSopUi.completedTasks") }} ({{
                      selectedSopCompletedTasks.length
                    }})</span
                  ><ChevronDown
                    :class="{ 'is-open': sopCompletedTasksExpanded }"
                  />
                </button>
                <div
                  v-if="sopCompletedTasksExpanded"
                  class="gmv-sop-task-list is-completed-list"
                >
                  <article
                    v-for="task in selectedSopCompletedTasks"
                    :key="task.id"
                    class="is-complete"
                  >
                    <time
                      >{{ task.scheduledTime
                      }}<small>{{ task.localDate }}</small></time
                    >
                    <div>
                      <strong>{{ sopTaskTitle(task) }}</strong>
                      <p>{{ sopTaskDescription(task) }}</p>
                    </div>
                    <CheckCircle2 class="gmv-sop-task-done" />
                  </article>
                </div>
              </section>
            </div>

            <div class="gmv-sop-insight-grid">
              <section
                class="gmv-sop-key-section"
                data-testid="gmv-sop-key-metrics"
              >
                <header>
                  <div>
                    <span>{{ t("gmvMaxSopUi.keyData") }}</span
                    ><strong>{{ t("gmvMaxSopUi.keyDataHint") }}</strong>
                  </div>
                  <button
                    type="button"
                    class="gmv-button gmv-button--ghost"
                    :aria-expanded="sopMetricsExpanded"
                    @click="sopMetricsExpanded = !sopMetricsExpanded"
                  >
                    {{
                      t(
                        sopMetricsExpanded
                          ? "gmvMaxSopUi.hideAllMetrics"
                          : "gmvMaxSopUi.viewAllMetrics",
                      )
                    }}<ChevronDown
                      class="gmv-icon"
                      :class="{ 'is-open': sopMetricsExpanded }"
                    />
                  </button>
                </header>
                <div class="gmv-sop-metrics">
                  <article
                    v-for="metric in sopMetricsExpanded
                      ? sopMetricCards
                      : sopKeyMetricCards"
                    :key="metric.key"
                    :class="`is-${metric.key}`"
                  >
                    <span>{{ t(`gmvMaxSop.metrics.${metric.key}`) }}</span
                    ><strong>{{ metric.value }}</strong>
                  </article>
                </div>
              </section>

              <section class="gmv-sop-phase-section">
                <header>
                  <span>{{ t("gmvMaxSopUi.sopProgress") }}</span
                  ><strong>{{
                    t("gmvMaxSopUi.currentStep", {
                      current:
                        sopPhases.findIndex(
                          (item) => item.phase === selectedSop.phase,
                        ) + 1,
                      total: sopPhases.length,
                    })
                  }}</strong>
                </header>
                <div class="gmv-sop-rail" data-testid="gmv-sop-phase-rail">
                  <div
                    v-for="(item, index) in sopPhases"
                    :key="item.phase"
                    :class="{
                      'is-active': item.phase === selectedSop.phase,
                      'is-complete':
                        sopPhases.findIndex(
                          (entry) => entry.phase === selectedSop.phase,
                        ) > index,
                    }"
                  >
                    <span>{{ index + 1 }}</span
                    ><strong>{{ item.label }}</strong
                    ><small>{{ item.days }}</small>
                  </div>
                </div>
              </section>
            </div>

            <div class="gmv-sop-detail-grid">
              <section
                v-if="
                  selectedSop.track === 'mature_product' &&
                  selectedSop.matureAssessment
                "
                :class="[
                  'gmv-sop-disclosure',
                  { 'is-expanded': sopHistoryExpanded },
                ]"
                data-testid="gmv-mature-console"
              >
                <button
                  type="button"
                  class="gmv-sop-disclosure__header"
                  :aria-expanded="sopHistoryExpanded"
                  @click="sopHistoryExpanded = !sopHistoryExpanded"
                >
                  <span
                    ><strong>{{ t("gmvMaxSopUi.fullDiagnosis") }}</strong
                    ><small>{{
                      t("gmvMaxSopUi.fullDiagnosisHint")
                    }}</small></span
                  ><ChevronDown :class="{ 'is-open': sopHistoryExpanded }" />
                </button>
                <div v-if="sopHistoryExpanded" class="gmv-sop-disclosure__body">
                  <div class="gmv-mature-console__signals">
                    <article>
                      <span>{{ t("gmvMaxMatureLabels.lastReport") }}</span
                      ><strong>{{
                        selectedSop.matureAssessment.lastReportDate ||
                        t("gmvMaxSopUi.notAvailable")
                      }}</strong
                      ><small>{{
                        t(
                          `gmvMaxMature.freshness.${selectedSop.matureAssessment.dataFreshness}`,
                        )
                      }}</small>
                    </article>
                    <article>
                      <span>{{ t("gmvMaxMature.lastDelivery") }}</span
                      ><strong>{{
                        selectedSop.matureAssessment.lastDeliveryDate ||
                        t("gmvMaxSopUi.noActiveDelivery")
                      }}</strong
                      ><small>{{
                        t("gmvMaxMatureLabels.explicitZeroSeparated")
                      }}</small>
                    </article>
                    <article>
                      <span>{{ t("gmvMaxMature.health") }}</span
                      ><strong>{{
                        selectedSop.matureAssessment.healthScore
                          ? Number(
                              selectedSop.matureAssessment.healthScore,
                            ).toFixed(0)
                          : t("gmvMaxSopUi.insufficientData")
                      }}</strong
                      ><small
                        >{{ t("gmvMaxMature.coverage") }}
                        {{
                          formatPercent(
                            selectedSop.matureAssessment.healthCoverage,
                          )
                        }}</small
                      >
                    </article>
                    <article>
                      <span>{{ t("gmvMaxMature.dataCoverage") }}</span
                      ><strong>{{
                        formatPercent(selectedSop.matureAssessment.dataCoverage)
                      }}</strong
                      ><small>{{
                        selectedSop.matureAssessment.writeActionsAllowed
                          ? t("gmvMaxMature.writeReady")
                          : t("gmvMaxMature.diagnosisOnly")
                      }}</small>
                    </article>
                    <article>
                      <span>{{ t("gmvMaxMature.observation") }}</span
                      ><strong>{{
                        selectedSop.observationDaysRemaining
                      }}</strong
                      ><small>{{
                        t("gmvMaxMature.deliveryDaysRemaining")
                      }}</small>
                    </article>
                    <article>
                      <span>{{ t("gmvMaxSopUi.historicalWinners") }}</span
                      ><strong
                        >{{ selectedSop.protectedWinnerCount }}
                        {{ t("gmvMaxSopUi.itemsUnit") }}</strong
                      ><small>{{ t("gmvMaxSopUi.winnerRatioHint") }}</small>
                    </article>
                  </div>
                  <div class="gmv-mature-console__baselines">
                    <article
                      v-for="(baseline, key) in {
                        baseline30d: selectedSop.matureAssessment.baseline30d,
                        recent7d: selectedSop.matureAssessment.recent7d,
                        previous7d: selectedSop.matureAssessment.previous7d,
                      }"
                      :key="key"
                    >
                      <span>{{ t(`gmvMaxMature.baselines.${key}`) }}</span
                      ><strong>{{ formatMatureBaselineRoi(baseline) }}</strong>
                      <dl>
                        <div>
                          <dt>GMV</dt>
                          <dd>
                            {{
                              baseline.deliveryDays > 0
                                ? formatCny(baseline.gmv, selectedSop.storeId)
                                : t("gmvMaxSopUi.notAvailable")
                            }}
                          </dd>
                        </div>
                        <div>
                          <dt>{{ t("gmvMaxSop.metrics.orders") }}</dt>
                          <dd>
                            {{
                              baseline.deliveryDays > 0
                                ? formatInteger(baseline.orders)
                                : t("gmvMaxSopUi.notAvailable")
                            }}
                          </dd>
                        </div>
                        <div>
                          <dt>{{ t("gmvMaxMature.deliveryDays") }}</dt>
                          <dd>{{ baseline.deliveryDays }}</dd>
                        </div>
                        <div>
                          <dt>{{ t("gmvMaxMature.missingDays") }}</dt>
                          <dd>{{ baseline.missingDays }}</dd>
                        </div>
                      </dl>
                    </article>
                  </div>
                </div>
              </section>

              <section
                :class="[
                  'gmv-sop-disclosure',
                  { 'is-expanded': sopSupplementalExpanded },
                ]"
                data-testid="gmv-sop-supplemental"
              >
                <button
                  type="button"
                  class="gmv-sop-disclosure__header"
                  :aria-expanded="sopSupplementalExpanded"
                  @click="sopSupplementalExpanded = !sopSupplementalExpanded"
                >
                  <span
                    ><strong>{{ t("gmvMaxSop.input.title") }}</strong
                    ><small>{{
                      t("gmvMaxSopUi.supplementalHint")
                    }}</small></span
                  ><ChevronDown
                    :class="{ 'is-open': sopSupplementalExpanded }"
                  />
                </button>
                <div
                  v-if="sopSupplementalExpanded"
                  class="gmv-sop-disclosure__body gmv-sop-input"
                >
                  <div class="gmv-sop-input__bound-scope">
                    <span
                      ><small>{{ t("gmvMaxSopUi.dataObject") }}</small
                      ><strong>{{
                        selectedSop.productName ||
                        selectedSop.productId ||
                        t("gmvMaxSop.liveScope")
                      }}</strong
                      ><em
                        >{{ t("gmvMaxSopUi.campaignLabel") }}
                        {{ selectedSop.campaignName }}</em
                      ></span
                    ><label
                      ><small>{{ t("gmvMaxSopUi.dataDate") }}</small
                      ><input v-model="supplementalDraft.statDate" type="date"
                    /></label>
                  </div>
                  <div class="gmv-sop-input__fields">
                    <label
                      v-for="field in supplementalMetricFields"
                      :key="field"
                      ><span>{{ t(`gmvMaxSop.input.${field}`) }}</span
                      ><input
                        v-model="(supplementalDraft as any)[field]"
                        type="number"
                        min="0"
                        step="0.01"
                    /></label>
                  </div>
                  <div class="gmv-sop-input__controls">
                    <label
                      ><span>{{ t("gmvMaxSop.input.deliveryMode") }}</span
                      ><select v-model="supplementalDraft.deliveryMode">
                        <option value="">
                          {{ t("gmvMaxSop.input.notProvided") }}
                        </option>
                        <option value="target_roi">
                          {{ t("gmvMaxSop.input.deliveryModes.targetRoi") }}
                        </option>
                        <option value="max_delivery">
                          {{ t("gmvMaxSop.input.deliveryModes.maxDelivery") }}
                        </option>
                      </select></label
                    ><label
                      v-for="field in [
                        'autoBudgetEnabled',
                        'inventoryReady',
                        'liveReady',
                      ]"
                      :key="field"
                      ><span>{{ t(`gmvMaxSop.input.${field}`) }}</span
                      ><select v-model="(supplementalDraft as any)[field]">
                        <option value="">
                          {{ t("gmvMaxSop.input.notProvided") }}
                        </option>
                        <option value="true">
                          {{ t("gmvMaxSop.input.yes") }}
                        </option>
                        <option value="false">
                          {{ t("gmvMaxSop.input.no") }}
                        </option>
                      </select></label
                    >
                  </div>
                  <div class="gmv-sop-input__actions">
                    <button
                      class="gmv-button gmv-button--primary"
                      :disabled="!!busyAction"
                      @click="saveSupplementalMetrics"
                    >
                      <Save class="gmv-icon" />{{
                        t("gmvMax.actions.save")
                      }}</button
                    ><button
                      type="button"
                      class="gmv-button gmv-button--ghost"
                      :aria-expanded="sopBulkToolsExpanded"
                      @click="sopBulkToolsExpanded = !sopBulkToolsExpanded"
                    >
                      <FileSpreadsheet class="gmv-icon" />{{
                        t("gmvMaxSopUi.batchTools")
                      }}<ChevronDown
                        class="gmv-icon"
                        :class="{ 'is-open': sopBulkToolsExpanded }"
                      />
                    </button>
                  </div>
                  <div v-if="sopBulkToolsExpanded" class="gmv-sop-input__bulk">
                    <button
                      class="gmv-button gmv-button--secondary"
                      @click="exportSupplementalTemplate"
                    >
                      <Download class="gmv-icon" />{{
                        t("gmvMaxSop.actions.template")
                      }}</button
                    ><label class="gmv-button gmv-button--secondary"
                      ><Upload class="gmv-icon" />{{
                        t("gmvMaxAdvanced.actions.import")
                      }}<input
                        type="file"
                        accept=".csv,text/csv"
                        hidden
                        @change="importSupplementalMetrics"
                    /></label>
                  </div>
                  <p class="gmv-sop-source-note">
                    <ShieldCheck />{{ t("gmvMaxSop.input.sourcePriority") }}
                  </p>
                </div>
              </section>

              <section
                :class="[
                  'gmv-sop-disclosure',
                  { 'is-expanded': sopDnaExpanded },
                ]"
                data-testid="gmv-sop-winner-dna"
              >
                <button
                  type="button"
                  class="gmv-sop-disclosure__header"
                  :aria-expanded="sopDnaExpanded"
                  @click="sopDnaExpanded = !sopDnaExpanded"
                >
                  <span
                    ><strong>{{ t("gmvMaxSopVideo.title") }}</strong
                    ><small>{{ t("gmvMaxSopVideo.subtitle") }}</small></span
                  >
                  <span class="gmv-sop-grade-summary"
                    ><i
                      v-for="grade in ['S', 'A', 'B', 'C']"
                      :key="grade"
                      :class="`is-${grade.toLowerCase()}`"
                      ><b
                        >{{ grade }}
                        {{ t(`gmvMaxSopUi.grades.${grade.toLowerCase()}`) }}</b
                      >{{
                        selectedSopVideoGradeSummary[
                          grade as "S" | "A" | "B" | "C"
                        ]
                      }}</i
                    ><ChevronDown :class="{ 'is-open': sopDnaExpanded }"
                  /></span>
                </button>
                <div
                  v-if="sopDnaExpanded"
                  class="gmv-sop-disclosure__body gmv-sop-video-insights"
                >
                  <div
                    v-if="selectedSopCreativeVideos.length"
                    class="gmv-sop-video-toolbar"
                  >
                    <div
                      class="gmv-sop-video-grades"
                      role="tablist"
                      :aria-label="t('gmvMaxSopVideoWorkbench.gradeFilter')"
                    >
                      <button
                        v-for="grade in ['S', 'A', 'B', 'C'] as SopVideoGrade[]"
                        :key="grade"
                        type="button"
                        role="tab"
                        :data-testid="`gmv-sop-video-grade-${grade.toLowerCase()}`"
                        :aria-selected="selectedSopVideoGrade === grade"
                        :class="[
                          `is-${grade.toLowerCase()}`,
                          { 'is-active': selectedSopVideoGrade === grade },
                        ]"
                        @click="selectSopVideoGrade(grade)"
                      >
                        <span
                          ><b>{{ grade }}</b
                          >{{
                            t(`gmvMaxSopUi.grades.${grade.toLowerCase()}`)
                          }}</span
                        ><strong>{{
                          selectedSopVideoGradeSummary[grade]
                        }}</strong>
                      </button>
                    </div>
                    <label class="gmv-sop-video-sort"
                      ><span>{{ t("gmvMaxSopVideoWorkbench.sort.label") }}</span
                      ><select
                        v-model="sopVideoSort"
                        data-testid="gmv-sop-video-sort"
                      >
                        <option value="profit">
                          {{ t("gmvMaxSopVideoWorkbench.sort.profit") }}
                        </option>
                        <option value="score">
                          {{ t("gmvMaxSopVideoWorkbench.sort.score") }}
                        </option>
                        <option value="roi">
                          {{ t("gmvMaxSopVideoWorkbench.sort.roi") }}
                        </option>
                        <option value="gmv">
                          {{ t("gmvMaxSopVideoWorkbench.sort.gmv") }}
                        </option>
                        <option value="spend">
                          {{ t("gmvMaxSopVideoWorkbench.sort.spend") }}
                        </option>
                        <option value="orders">
                          {{ t("gmvMaxSopVideoWorkbench.sort.orders") }}
                        </option>
                        <option value="latest">
                          {{ t("gmvMaxSopVideoWorkbench.sort.latest") }}
                        </option>
                      </select></label
                    >
                  </div>
                  <div
                    v-if="selectedSopCreativeVideo"
                    class="gmv-sop-video-workspace"
                  >
                    <aside
                      class="gmv-sop-video-list"
                      :aria-label="t('gmvMaxSopVideo.videoList')"
                    >
                      <div class="gmv-sop-video-list__items">
                        <button
                          v-for="item in pagedSopCreativeVideos"
                          :key="item.id"
                          type="button"
                          :data-creative-id="item.creativeId"
                          :class="{
                            'is-active':
                              item.id === selectedSopCreativeVideo.id,
                          }"
                          @click="selectedSopVideoId = item.id"
                        >
                          <span class="gmv-sop-video-list__cover">
                            <img
                              v-if="item.coverUrl"
                              :src="item.coverUrl"
                              alt=""
                              @error="hideBrokenSopVideoCover(item)"
                            />
                            <Film
                              v-else
                              :title="t('gmvMaxSopVideo.previewUnavailable')"
                            />
                            <i v-if="sopVideoPlayable(item)"><PlayCircle /></i>
                          </span>
                          <span class="gmv-sop-video-list__copy"
                            ><strong :title="item.name">{{ item.name }}</strong
                            ><small
                              >{{ shortSopIdentifier(item.creativeId) }} /
                              {{
                                item.performance.available
                                  ? `${item.performance.days} ${t("gmvMaxSopVideo.days")}`
                                  : t("gmvMaxSopVideo.noData")
                              }}</small
                            ><em
                              ><b :class="`is-${item.grade.toLowerCase()}`">{{
                                item.grade
                              }}</b
                              ><span v-if="item.performance.roi">{{
                                formatRoi(item.performance.roi)
                              }}</span
                              ><span v-else>{{
                                t("gmvMaxSopVideo.noData")
                              }}</span></em
                            ></span
                          >
                        </button>
                      </div>
                      <footer class="gmv-sop-video-pagination">
                        <span>{{
                          t("gmvMaxSopVideoWorkbench.page", {
                            current: sopVideoPage,
                            total: sopVideoPageCount,
                            count: selectedSopVideoGradeItems.length,
                          })
                        }}</span>
                        <div>
                          <button
                            type="button"
                            :title="t('gmvMaxData.previous')"
                            :disabled="sopVideoPage <= 1"
                            @click="changeSopVideoPage(sopVideoPage - 1)"
                          >
                            <ChevronRight /></button
                          ><button
                            type="button"
                            :title="t('gmvMaxData.next')"
                            :disabled="sopVideoPage >= sopVideoPageCount"
                            @click="changeSopVideoPage(sopVideoPage + 1)"
                          >
                            <ChevronRight />
                          </button>
                        </div>
                      </footer>
                    </aside>

                    <article class="gmv-sop-video-detail">
                      <div class="gmv-sop-video-detail__preview">
                        <img
                          v-if="selectedSopCreativeVideo.coverUrl"
                          :src="selectedSopCreativeVideo.coverUrl"
                          :alt="selectedSopCreativeVideo.name"
                          @error="
                            hideBrokenSopVideoCover(selectedSopCreativeVideo)
                          "
                        />
                        <div v-else>
                          <Film /><span>{{
                            t("gmvMaxSopVideo.previewUnavailable")
                          }}</span
                          ><small>{{ t("gmvMaxSopVideo.previewHint") }}</small>
                        </div>
                        <button
                          v-if="sopVideoPlayable(selectedSopCreativeVideo)"
                          type="button"
                          data-testid="gmv-sop-video-preview-button"
                          :title="t('gmvMaxSopVideo.preview')"
                          @click="
                            openSopCreativeVideo(selectedSopCreativeVideo)
                          "
                        >
                          <PlayCircle /><span>{{
                            t("gmvMaxSopVideo.preview")
                          }}</span>
                        </button>
                        <span class="gmv-sop-video-detail__duration">{{
                          sopVideoDuration(
                            selectedSopCreativeVideo.durationSeconds,
                          )
                        }}</span>
                      </div>
                      <div class="gmv-sop-video-detail__content">
                        <header>
                          <div>
                            <span>{{
                              t("gmvMaxSopVideo.performanceLabel")
                            }}</span>
                            <h3 :title="selectedSopCreativeVideo.name">
                              {{ selectedSopCreativeVideo.name }}
                            </h3>
                            <p>
                              {{ t("gmvMaxSopVideo.videoId") }}
                              {{
                                shortSopIdentifier(
                                  selectedSopCreativeVideo.creativeId,
                                )
                              }}
                            </p>
                          </div>
                          <span
                            :class="[
                              'gmv-sop-grade',
                              `is-${selectedSopCreativeVideo.grade.toLowerCase()}`,
                            ]"
                            >{{ selectedSopCreativeVideo.grade }}</span
                          >
                        </header>
                        <dl class="gmv-sop-video-meta">
                          <div>
                            <dt>{{ t("gmvMaxSopVideo.source") }}</dt>
                            <dd>
                              {{
                                sopVideoSource(selectedSopCreativeVideo.source)
                              }}
                            </dd>
                          </div>
                          <div>
                            <dt>{{ t("gmvMaxSopVideo.authorization") }}</dt>
                            <dd>
                              {{
                                structuredValueLabel(
                                  selectedSopCreativeVideo.authorizationStatus ||
                                    selectedSopCreativeVideo.authorizationType,
                                )
                              }}
                            </dd>
                          </div>
                          <div>
                            <dt>{{ t("gmvMaxSopVideo.delivery") }}</dt>
                            <dd>
                              {{
                                structuredValueLabel(
                                  selectedSopCreativeVideo.deliveryStatus,
                                )
                              }}
                            </dd>
                          </div>
                          <div>
                            <dt>{{ t("gmvMaxSopVideo.period") }}</dt>
                            <dd>
                              {{
                                selectedSopCreativeVideo.reportingStartDate &&
                                selectedSopCreativeVideo.reportingEndDate
                                  ? `${selectedSopCreativeVideo.reportingStartDate} - ${selectedSopCreativeVideo.reportingEndDate}`
                                  : t("gmvMaxSopVideo.noData")
                              }}
                            </dd>
                          </div>
                        </dl>
                        <div class="gmv-sop-video-primary-metrics">
                          <article>
                            <span>{{ t("gmvMaxSop.metrics.spend") }}</span
                            ><strong>{{
                              selectedSopCreativeVideo.performance.spend !==
                              undefined
                                ? formatCny(
                                    selectedSopCreativeVideo.performance.spend,
                                    selectedSop.storeId,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong>
                          </article>
                          <article>
                            <span>GMV</span
                            ><strong>{{
                              selectedSopCreativeVideo.performance.gmv !==
                              undefined
                                ? formatCny(
                                    selectedSopCreativeVideo.performance.gmv,
                                    selectedSop.storeId,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong>
                          </article>
                          <article>
                            <span>ROI</span
                            ><strong>{{
                              selectedSopCreativeVideo.performance.roi !==
                              undefined
                                ? formatRoi(
                                    selectedSopCreativeVideo.performance.roi,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong>
                          </article>
                          <article>
                            <span>{{ t("gmvMaxSop.metrics.orders") }}</span
                            ><strong>{{
                              selectedSopCreativeVideo.performance.orders !==
                              undefined
                                ? formatInteger(
                                    selectedSopCreativeVideo.performance.orders,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong>
                          </article>
                        </div>
                        <div class="gmv-sop-video-secondary-metrics">
                          <span
                            ><small>CTR</small
                            ><strong>{{
                              selectedSopCreativeVideo.performance.ctr !==
                              undefined
                                ? formatPercent(
                                    selectedSopCreativeVideo.performance.ctr,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong></span
                          ><span
                            ><small>CVR</small
                            ><strong>{{
                              selectedSopCreativeVideo.performance.cvr !==
                              undefined
                                ? formatPercent(
                                    selectedSopCreativeVideo.performance.cvr,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong></span
                          ><span
                            ><small>CPA</small
                            ><strong>{{
                              selectedSopCreativeVideo.performance.cpa !==
                              undefined
                                ? formatCny(
                                    selectedSopCreativeVideo.performance.cpa,
                                    selectedSop.storeId,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong></span
                          ><span
                            ><small>{{ t("gmvMaxSopVideo.playDepth") }}</small
                            ><strong>{{
                              selectedSopCreativeVideo.performance.playDepth !==
                              undefined
                                ? formatPercent(
                                    selectedSopCreativeVideo.performance
                                      .playDepth,
                                  )
                                : t("gmvMaxSopVideo.noData")
                            }}</strong></span
                          >
                        </div>
                        <section
                          class="gmv-sop-video-actions"
                          data-testid="gmv-sop-video-actions"
                        >
                          <div>
                            <strong>{{
                              t("gmvMaxSopVideoWorkbench.actions.title")
                            }}</strong
                            ><span>{{
                              sopCreativeActionBlocked ||
                              t("gmvMaxSopVideoWorkbench.actions.approvalHint")
                            }}</span>
                          </div>
                          <div>
                            <button
                              v-if="selectedSopCreativeVideo.grade !== 'C'"
                              type="button"
                              class="gmv-button gmv-button--primary"
                              :disabled="
                                !!busyAction || !!sopCreativeActionBlocked
                              "
                              :title="
                                sopCreativeActionBlocked ||
                                t('gmvMaxSopVideoWorkbench.actions.heatHint')
                              "
                              @click="
                                createSopCreativeAction(
                                  selectedSopCreativeVideo,
                                  'ADD',
                                )
                              "
                            >
                              <Rocket class="gmv-icon" />{{
                                t(
                                  selectedSopCreativeVideo.grade === "B"
                                    ? "gmvMaxSopVideoWorkbench.actions.heatTest"
                                    : "gmvMaxSopVideoWorkbench.actions.heat",
                                )
                              }}</button
                            ><button
                              v-if="selectedSopCreativeVideo.grade !== 'S'"
                              type="button"
                              class="gmv-button gmv-button--secondary gmv-sop-video-actions__exclude"
                              :disabled="
                                !!busyAction || !!sopCreativeActionBlocked
                              "
                              :title="
                                sopCreativeActionBlocked ||
                                t('gmvMaxSopVideoWorkbench.actions.excludeHint')
                              "
                              @click="
                                createSopCreativeAction(
                                  selectedSopCreativeVideo,
                                  'REMOVE',
                                )
                              "
                            >
                              <ShieldAlert class="gmv-icon" />{{
                                t("gmvMaxSopVideoWorkbench.actions.exclude")
                              }}</button
                            ><span
                              v-else
                              class="gmv-sop-video-actions__protected"
                              ><ShieldCheck />{{
                                t("gmvMaxSopVideoWorkbench.actions.protected")
                              }}</span
                            >
                          </div>
                        </section>
                        <section class="gmv-sop-video-analysis">
                          <header>
                            <strong>{{
                              t("gmvMaxSopVideo.analysisTitle")
                            }}</strong
                            ><span
                              :class="`is-${selectedSopCreativeVideo.freshness}`"
                              >{{
                                t(
                                  `gmvMaxSopVideo.freshness.${selectedSopCreativeVideo.freshness}`,
                                )
                              }}</span
                            >
                          </header>
                          <ul>
                            <li
                              v-for="code in selectedSopCreativeVideo.analysisCodes"
                              :key="code"
                            >
                              {{ sopVideoAnalysis(code) }}
                            </li>
                          </ul>
                        </section>
                        <details class="gmv-sop-video-evidence">
                          <summary>{{ t("gmvMaxSopVideo.details") }}</summary>
                          <dl>
                            <div>
                              <dt>
                                {{ t("gmvMaxSopVideo.intelligenceScore") }}
                              </dt>
                              <dd>
                                {{
                                  formatInteger(
                                    selectedSopCreativeVideo.intelligence.score,
                                  )
                                }}
                              </dd>
                            </div>
                            <div>
                              <dt>{{ t("gmvMaxSopVideo.roiTrend") }}</dt>
                              <dd>
                                {{
                                  selectedSopCreativeVideo.intelligence
                                    .roiTrendPercent !== undefined
                                    ? formatPercent(
                                        selectedSopCreativeVideo.intelligence
                                          .roiTrendPercent,
                                        true,
                                      )
                                    : t("gmvMaxSopVideo.noData")
                                }}
                              </dd>
                            </div>
                            <div>
                              <dt>{{ t("gmvMaxSopVideo.samples") }}</dt>
                              <dd>
                                {{
                                  selectedSopCreativeVideo.performance.samples
                                }}
                              </dd>
                            </div>
                            <div>
                              <dt>{{ t("gmvMaxSopVideo.lastSynced") }}</dt>
                              <dd>
                                {{
                                  selectedSopCreativeVideo.syncedAt
                                    ? formatDate(
                                        selectedSopCreativeVideo.syncedAt,
                                      )
                                    : t("gmvMaxSopVideo.notAvailable")
                                }}
                              </dd>
                            </div>
                          </dl>
                        </details>
                      </div>
                    </article>
                  </div>
                  <div v-else class="gmv-empty gmv-empty--small">
                    {{
                      selectedSopCreativeVideos.length
                        ? t("gmvMaxSopVideoWorkbench.gradeEmpty")
                        : t("gmvMaxSopVideo.empty")
                    }}
                  </div>
                </div>
              </section>
            </div>
          </template>
        </section>

        <section v-else-if="activeTab === 'campaigns'" class="gmv-section">
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMax.campaigns.title") }}</h2>
              <p>
                {{ campaignDataPage.total }} / {{ dashboard.campaigns.length }}
                {{ t("gmvMax.campaigns.subtitle") }}
              </p>
            </div>
            <button class="gmv-button gmv-button--secondary" @click="evaluate">
              <Zap class="gmv-icon" />{{ t("gmvMax.actions.evaluate") }}
            </button>
          </div>
          <details class="gmv-advanced-details">
            <summary>
              <BarChart3 /><span
                ><strong>{{ t("gmvMaxTaskUi.details.health") }}</strong
                ><small>{{ t("gmvMaxTaskUi.details.healthHint") }}</small></span
              ><ChevronDown />
            </summary>
            <div class="gmv-pacing-overview" data-testid="gmv-pacing-overview">
              <article
                v-for="state in pacingStates"
                :key="state"
                :class="`is-${state}`"
              >
                <span>{{ t(`gmvMaxPacing.state.${state}`) }}</span>
                <strong>{{ pacingSummary[state] }}</strong>
                <small>{{ t(`gmvMaxPacing.hint.${state}`) }}</small>
              </article>
            </div>
          </details>
          <details class="gmv-advanced-details">
            <summary>
              <Filter /><span
                ><strong>{{ t("gmvMaxTaskUi.details.metricFilters") }}</strong
                ><small>{{
                  t("gmvMaxTaskUi.details.metricFiltersHint")
                }}</small></span
              ><ChevronDown />
            </summary>
            <div class="gmv-filter-panel">
              <select v-model="campaignStatus">
                <option value="all">{{ t("gmvMaxData.allStatuses") }}</option>
                <option
                  v-for="status in campaignStatuses"
                  :key="status"
                  :value="status"
                >
                  {{ operationStatusLabel(status) }}
                </option>
              </select>
              <select v-model="campaignPacingState">
                <option value="all">{{ t("gmvMaxPacing.allStates") }}</option>
                <option
                  v-for="state in pacingStates"
                  :key="state"
                  :value="state"
                >
                  {{ t(`gmvMaxPacing.state.${state}`) }}
                </option>
              </select>
              <label
                ><span
                  >{{ t("gmvMaxData.minSpend") }} ({{
                    t("gmvMaxCurrency.cnyUnit")
                  }})</span
                ><input
                  v-model.number="minCampaignSpend"
                  type="number"
                  min="0"
                  :disabled="moneyFilterDisabled()"
              /></label>
              <label
                ><span>{{ t("gmvMaxData.minOrders") }}</span
                ><input
                  v-model.number="minCampaignOrders"
                  type="number"
                  min="0"
              /></label>
              <label
                ><span>{{ t("gmvMaxData.minRoi") }}</span
                ><input
                  v-model.number="minCampaignRoi"
                  type="number"
                  min="0"
                  step="0.01"
              /></label>
              <label
                ><span>{{ t("gmvMaxData.minUtilization") }}</span
                ><input
                  v-model.number="minCampaignUtilization"
                  type="number"
                  min="0"
                  max="100"
              /></label>
              <button
                class="gmv-button gmv-button--secondary"
                :disabled="campaignDataLoading"
                @click="loadCampaignPage(1)"
              >
                <Filter class="gmv-icon" />{{ t("gmvMaxData.applyMetrics") }}
              </button>
            </div>
          </details>
          <div class="gmv-table-wrap">
            <table class="gmv-table gmv-table--campaigns">
              <thead>
                <tr>
                  <th>
                    <button
                      class="gmv-sort-button"
                      @click="toggleCampaignSort('name')"
                    >
                      {{ t("gmvMax.fields.campaign") }}
                      <small>{{
                        sortMark("name", campaignSortBy, campaignSortDirection)
                      }}</small>
                    </button>
                  </th>
                  <th>{{ t("gmvMax.fields.accountStore") }}</th>
                  <th>{{ t("gmvMaxLearning.stage") }}</th>
                  <th>
                    <button
                      class="gmv-sort-button"
                      @click="toggleCampaignSort('profitFloor')"
                    >
                      {{ t("gmvMaxProfitCoverage.label") }}
                      <small>{{
                        sortMark(
                          "profitFloor",
                          campaignSortBy,
                          campaignSortDirection,
                        )
                      }}</small>
                    </button>
                  </th>
                  <th>{{ t("gmvMaxOfficial.suggestions") }}</th>
                  <th>{{ t("gmvMaxOfficial.roiProtection") }}</th>
                  <th>{{ t("gmvMaxOfficial.enhancements") }}</th>
                  <th>{{ t("gmvMax.fields.status") }}</th>
                  <th>
                    <button
                      class="gmv-sort-button"
                      @click="toggleCampaignSort('budget')"
                    >
                      {{ t("gmvMax.fields.budget") }}
                      <small>{{
                        sortMark(
                          "budget",
                          campaignSortBy,
                          campaignSortDirection,
                        )
                      }}</small>
                    </button>
                  </th>
                  <th>
                    <button
                      class="gmv-sort-button"
                      @click="toggleCampaignSort('utilization')"
                    >
                      {{ t("gmvMaxConsole.pacing") }}
                      <small>{{
                        sortMark(
                          "utilization",
                          campaignSortBy,
                          campaignSortDirection,
                        )
                      }}</small>
                    </button>
                  </th>
                  <th>
                    <button
                      class="gmv-sort-button"
                      @click="toggleCampaignSort('cost')"
                    >
                      {{ t("gmvMaxConsole.spend") }}
                      <small>{{
                        sortMark("cost", campaignSortBy, campaignSortDirection)
                      }}</small>
                    </button>
                  </th>
                  <th>
                    <button
                      class="gmv-sort-button"
                      @click="toggleCampaignSort('orders')"
                    >
                      {{ t("gmvMax.fields.orders") }}
                      <small>{{
                        sortMark(
                          "orders",
                          campaignSortBy,
                          campaignSortDirection,
                        )
                      }}</small>
                    </button>
                  </th>
                  <th>{{ t("gmvMax.fields.targetRoi") }}</th>
                  <th>
                    <button
                      class="gmv-sort-button"
                      @click="toggleCampaignSort('roi')"
                    >
                      {{ t("gmvMaxConsole.actualRoi") }}
                      <small>{{
                        sortMark("roi", campaignSortBy, campaignSortDirection)
                      }}</small>
                    </button>
                  </th>
                  <th>{{ t("gmvMaxConsole.automation") }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="campaign in pagedCampaigns" :key="campaign.id">
                  <td>
                    <button
                      class="gmv-campaign-link"
                      data-testid="gmv-open-campaign-workspace"
                      @click="openCampaignWorkspace(campaign.id)"
                    >
                      <strong>{{ campaign.name }}</strong
                      ><small>{{ campaign.id }}</small>
                    </button>
                  </td>
                  <td>
                    {{ campaign.binding?.advertiserName
                    }}<small
                      >{{ campaign.binding?.storeName }} /
                      {{
                        t(`gmvMax.types.${campaign.campaignType.toLowerCase()}`)
                      }}</small
                    >
                  </td>
                  <td>
                    <span
                      v-if="campaign.learning"
                      :class="[
                        'gmv-lifecycle',
                        `is-${campaign.learning.stage}`,
                      ]"
                      >{{
                        t(`gmvMaxLearning.stages.${campaign.learning.stage}`)
                      }}</span
                    ><span v-else>-</span>
                  </td>
                  <td>
                    <span
                      :class="[
                        'gmv-status',
                        campaign.profitGuard.complete
                          ? 'is-success'
                          : 'is-warning',
                      ]"
                      >{{
                        formatPercent(
                          campaign.profitGuard.productCoveragePercent ??
                            (campaign.profitGuard.complete ? 100 : 0),
                          true,
                        )
                      }}</span
                    ><small
                      >{{ t("gmvMaxLearning.profitFloor") }}
                      {{
                        formatRoi(campaign.profitGuard.effectiveRoiFloor)
                      }}</small
                    >
                  </td>
                  <td>
                    <button
                      v-if="campaign.recommendationCount"
                      class="gmv-recommendation-count-button"
                      type="button"
                      data-testid="gmv-open-campaign-recommendations"
                      :title="t('gmvMaxCampaignRecommendations.open')"
                      @click.stop="openCampaignRecommendations(campaign.id)"
                    >
                      <span class="gmv-status is-warning">{{
                        campaign.recommendationCount
                      }}</span
                      ><small>{{ t("gmvMaxOfficial.pending") }}</small></button
                    ><template v-else
                      ><span class="gmv-status is-neutral">-</span
                      ><small>{{
                        t("gmvMaxOfficial.pending")
                      }}</small></template
                    >
                  </td>
                  <td>
                    <span
                      :class="[
                        'gmv-status',
                        `is-${campaign.profitGuard.complete ? (campaign.metrics.roi < metricNumber(campaign.profitGuard.effectiveRoiFloor) ? 'danger' : 'success') : 'warning'}`,
                      ]"
                      >{{
                        t(
                          `gmvMaxOfficial.protection.${campaign.profitGuard.complete ? (campaign.metrics.roi < metricNumber(campaign.profitGuard.effectiveRoiFloor) ? "risk" : "eligible") : "incomplete"}`,
                        )
                      }}</span
                    ><small>{{
                      formatRoi(campaign.profitGuard.effectiveRoiFloor)
                    }}</small>
                  </td>
                  <td>
                    <span class="gmv-enhancement-badge"
                      ><Zap class="gmv-icon" />{{
                        campaign.policy.sessionPermission &&
                        campaign.learning?.winningCreativeCount
                          ? t("gmvMaxOfficial.boostReady")
                          : t("gmvMaxOfficial.baseline")
                      }}</span
                    ><small
                      >{{
                        formatInteger(
                          campaign.learning?.winningCreativeCount || 0,
                        )
                      }}
                      {{ t("gmvMaxConsole.winners") }}</small
                    >
                  </td>
                  <td>
                    <span
                      :class="[
                        'gmv-status',
                        statusClass(campaign.operationStatus),
                      ]"
                      >{{
                        operationStatusLabel(campaign.operationStatus)
                      }}</span
                    >
                  </td>
                  <td>
                    <strong>{{
                      formatCny(campaign.budget, campaign.storeId)
                    }}</strong
                    ><small>{{ t("gmvMaxConsole.dailyBudget") }}</small>
                  </td>
                  <td>
                    <template v-if="campaign.pacing"
                      ><span
                        :class="[
                          'gmv-flow-state',
                          `is-${campaign.pacing.state}`,
                        ]"
                        ><Gauge class="gmv-icon" />{{
                          t(`gmvMaxPacing.state.${campaign.pacing.state}`)
                        }}</span
                      ><small
                        >{{ percentage(campaign.pacing.actualSpendRatio) }} /
                        {{ percentage(campaign.pacing.expectedSpendRatio) }}
                        {{ t("gmvMaxPacing.actualExpected") }}</small
                      ><small
                        >{{ campaign.pacing.localTime }}
                        {{ campaign.pacing.timezone }}</small
                      ></template
                    ><template v-else>-</template>
                  </td>
                  <td>
                    <strong>{{
                      campaign.metrics.samples
                        ? formatCny(campaign.metrics.cost, campaign.storeId)
                        : "-"
                    }}</strong
                    ><small v-if="campaign.pacing"
                      >{{ t("gmvMaxCampaignMetrics.realtime") }}
                      {{
                        formatCny(campaign.pacing.currentCost, campaign.storeId)
                      }}</small
                    ><small v-else>{{
                      t("gmvMaxCampaignMetrics.period")
                    }}</small>
                  </td>
                  <td>
                    <strong>{{
                      campaign.metrics.samples
                        ? formatInteger(campaign.metrics.orders)
                        : "-"
                    }}</strong
                    ><small v-if="campaign.pacing"
                      >{{ t("gmvMaxCampaignMetrics.realtime") }}
                      {{ formatInteger(campaign.pacing.currentOrders) }}</small
                    ><small v-else>{{
                      t("gmvMaxCampaignMetrics.period")
                    }}</small>
                  </td>
                  <td>{{ formatRoi(campaign.roasBid) }}</td>
                  <td>
                    <strong>{{
                      campaign.metrics.samples && campaign.metrics.cost > 0
                        ? formatRoi(campaign.metrics.roi)
                        : "-"
                    }}</strong
                    ><small
                      >{{ t("gmvMaxLearning.profitFloor") }}
                      {{
                        formatRoi(campaign.profitGuard.effectiveRoiFloor)
                      }}</small
                    >
                  </td>
                  <td>
                    <div class="gmv-state-stack">
                      <span
                        :class="[
                          'gmv-status',
                          campaign.policy.automationEnabled
                            ? 'is-success'
                            : 'is-neutral',
                        ]"
                        >{{
                          campaign.policy.automationEnabled
                            ? t("gmvMaxConsole.enabled")
                            : t("gmvMaxConsole.manual")
                        }}</span
                      ><span
                        v-if="campaign.policy.shadowMode"
                        class="gmv-status is-blue"
                        >{{ t("gmvMaxAdvanced.shadow") }}</span
                      >
                    </div>
                  </td>
                  <td>
                    <div class="gmv-row__actions">
                      <button
                        class="gmv-icon-button"
                        data-testid="gmv-open-campaign-creatives"
                        :title="t('gmvMaxCampaignLinks.creatives')"
                        @click="openCampaignCreatives(campaign.id)"
                      >
                        <Film class="gmv-icon" /></button
                      ><button
                        class="gmv-icon-button"
                        data-testid="gmv-open-campaign-products"
                        :title="t('gmvMaxCampaignLinks.products')"
                        @click="openCampaignProducts(campaign.id)"
                      >
                        <CircleDollarSign class="gmv-icon" /></button
                      ><button
                        class="gmv-icon-button"
                        data-testid="gmv-open-policy"
                        :title="t('gmvMaxConsole.editPolicy')"
                        @click="openPolicy(campaign.id)"
                      >
                        <SlidersHorizontal class="gmv-icon" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="campaignDataLoading" class="gmv-empty">
              {{ t("gmvMaxData.loadingPage") }}
            </div>
            <div v-else-if="!campaignDataPage.total" class="gmv-empty">
              {{ t("gmvMax.empty.campaigns") }}
            </div>
          </div>
          <div class="gmv-pagination">
            <span>{{
              t("gmvMaxData.pageSummary", {
                current: campaignPage,
                total: campaignPageCount,
                count: campaignDataPage.total,
              })
            }}</span
            ><select v-model.number="campaignPageSize">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option></select
            ><button
              class="gmv-button gmv-button--secondary"
              :disabled="campaignPage <= 1 || campaignDataLoading"
              @click="loadCampaignPage(campaignPage - 1)"
            >
              {{ t("gmvMaxData.previous") }}</button
            ><button
              class="gmv-button gmv-button--secondary"
              :disabled="
                campaignPage >= campaignPageCount || campaignDataLoading
              "
              @click="loadCampaignPage(campaignPage + 1)"
            >
              {{ t("gmvMaxData.next") }}
            </button>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'growth'"
          class="gmv-section"
          data-testid="gmv-growth-workspace"
        >
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMaxLearning.title") }}</h2>
              <p>{{ t("gmvMaxLearning.subtitle") }}</p>
            </div>
            <button
              class="gmv-button gmv-button--primary"
              :disabled="!!busyAction"
              @click="analyzeGrowth"
            >
              <Activity class="gmv-icon" />{{ t("gmvMaxLearning.analyze") }}
            </button>
          </div>
          <details
            class="gmv-advanced-details"
            data-testid="gmv-growth-stage-details"
          >
            <summary>
              <TrendingUp /><span
                ><strong>{{ t("gmvMaxTaskUi.details.growthStages") }}</strong
                ><small>{{
                  t("gmvMaxTaskUi.details.growthStagesHint")
                }}</small></span
              ><ChevronDown />
            </summary>
            <div class="gmv-lifecycle-pipeline">
              <article
                v-for="item in lifecycleStages"
                :key="item.stage"
                :class="['gmv-phase-card', `is-${item.stage}`]"
              >
                <span>{{ t(`gmvMaxLearning.stages.${item.stage}`) }}</span
                ><strong>{{ item.count }}</strong
                ><small>{{
                  t(`gmvMaxLearning.stageHint.${item.stage}`)
                }}</small>
              </article>
            </div>
            <div class="gmv-learning-summary">
              <article>
                <span>{{ t("gmvMaxLearning.coverage") }}</span
                ><strong>{{
                  dashboard.campaigns.length
                    ? `${Math.round((dashboard.learningSnapshots.length / dashboard.campaigns.length) * 100)}%`
                    : "0%"
                }}</strong
                ><small
                  >{{ dashboard.learningSnapshots.length }} /
                  {{ dashboard.campaigns.length }}</small
                >
              </article>
              <article>
                <span>{{ t("gmvMaxLearning.readyToScale") }}</span
                ><strong>{{
                  filteredLearning.filter(
                    (item) => item.snapshot.stage === "scaling",
                  ).length
                }}</strong
                ><small>{{ t("gmvMaxLearning.profitAndPacingPassed") }}</small>
              </article>
              <article>
                <span>{{ t("gmvMaxLearning.creativeGap") }}</span
                ><strong>{{
                  filteredLearning.filter((item) =>
                    item.snapshot.signals.includes("creative_winner_missing"),
                  ).length
                }}</strong
                ><small>{{ t("gmvMaxLearning.needsWinner") }}</small>
              </article>
              <article>
                <span>{{ t("gmvMaxLearning.riskQueue") }}</span
                ><strong>{{
                  filteredLearning.filter((item) =>
                    ["declining", "blocked"].includes(item.snapshot.stage),
                  ).length
                }}</strong
                ><small>{{ t("gmvMaxLearning.recoveryFirst") }}</small>
              </article>
              <article>
                <span>{{ t("gmvMaxLearningFeedback.actionLearning") }}</span
                ><strong>{{
                  outcomePage.total
                    ? `${Math.round(outcomePage.summary.successRate * 100)}%`
                    : "-"
                }}</strong
                ><small
                  >{{ outcomePage.total }}
                  {{ t("gmvMaxLearningFeedback.measuredActions") }}</small
                >
              </article>
              <article>
                <span>{{ t("gmvMaxIntelligence.transferReady") }}</span
                ><strong>{{ proposedPortfolioPlans.length }}</strong
                ><small
                  >{{
                    proposedPortfolioPlans.every(
                      (item) => storeCnyRate(item.storeId) !== null,
                    )
                      ? formatCny(
                          proposedPortfolioPlans.reduce(
                            (sum, item) =>
                              sum +
                              (convertToCny(
                                item.transferAmount,
                                item.storeId,
                              ) || 0),
                            0,
                          ),
                          undefined,
                          true,
                        )
                      : t("gmvMaxCurrency.pending")
                  }}
                  {{ t("gmvMaxIntelligence.protectedCapital") }}</small
                >
              </article>
            </div>
          </details>
          <section
            class="gmv-panel gmv-product-lab"
            data-testid="gmv-product-lab"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxProductLab.title") }}</h2>
                <p>{{ t("gmvMaxProductLab.subtitle") }}</p>
              </div>
              <span class="gmv-status is-blue"
                >{{ productPage.total }}
                {{ t("gmvMaxProductLab.products") }}</span
              >
            </div>
            <details
              class="gmv-advanced-details gmv-advanced-details--embedded"
            >
              <summary>
                <Filter /><span
                  ><strong>{{
                    t("gmvMaxTaskUi.details.productFilters")
                  }}</strong
                  ><small>{{
                    t("gmvMaxTaskUi.details.productFiltersHint")
                  }}</small></span
                ><ChevronDown />
              </summary>
              <div class="gmv-filter-panel gmv-filter-panel--product">
                <select v-model="productCampaign" @change="loadProductPage(1)">
                  <option value="all">
                    {{ t("gmvMaxData.allCampaigns") }}
                  </option>
                  <option
                    v-for="campaign in filteredCampaigns"
                    :key="campaign.id"
                    :value="campaign.id"
                  >
                    {{ campaign.name }}
                  </option>
                </select>
                <select v-model="productState" @change="loadProductPage(1)">
                  <option value="all">
                    {{ t("gmvMaxProductData.allStates") }}
                  </option>
                  <option
                    v-for="state in [
                      'blocked',
                      'cold_start',
                      'testing',
                      'winner',
                      'scale_ready',
                      'stable',
                      'declining',
                      'losing',
                    ]"
                    :key="state"
                    :value="state"
                  >
                    {{ t(`gmvMaxProductLab.states.${state}`) }}
                  </option>
                </select>
                <select
                  v-model="productAllocation"
                  @change="loadProductPage(1)"
                >
                  <option value="all">
                    {{ t("gmvMaxProductData.allAllocations") }}
                  </option>
                  <option
                    v-for="state in [
                      'starved',
                      'balanced',
                      'overfunded',
                      'blocked',
                    ]"
                    :key="state"
                    :value="state"
                  >
                    {{ t(`gmvMaxProductLab.allocationStates.${state}`) }}
                  </option>
                </select>
                <input
                  v-model.number="minProductSpend"
                  type="number"
                  min="0"
                  :disabled="moneyFilterDisabled()"
                  :placeholder="`${t('gmvMaxData.minSpend')} (${t('gmvMaxCurrency.cnyUnit')})`"
                />
                <input
                  v-model.number="minProductOrders"
                  type="number"
                  min="0"
                  :placeholder="t('gmvMaxData.minOrders')"
                />
                <input
                  v-model.number="minProductRoi"
                  type="number"
                  min="0"
                  step="0.01"
                  :placeholder="t('gmvMaxData.minRoi')"
                />
                <input
                  v-model.number="minProductScore"
                  type="number"
                  min="0"
                  max="100"
                  :placeholder="t('gmvMaxProductData.minScore')"
                />
                <button
                  class="gmv-button gmv-button--primary"
                  :disabled="productLoading"
                  @click="loadProductPage(1)"
                >
                  <Filter class="gmv-icon" />{{ t("gmvMaxData.applyMetrics") }}
                </button>
              </div>
            </details>
            <div class="gmv-table-wrap">
              <table class="gmv-table gmv-table--products">
                <thead>
                  <tr>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('productName')"
                      >
                        {{ t("gmvMaxProductLab.product") }}
                        <small>{{
                          sortMark(
                            "productName",
                            productSortBy,
                            productSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>{{ t("gmvMax.fields.campaign") }}</th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('sellingPrice')"
                      >
                        {{ t("gmvMaxCostData.price") }}
                        <small>{{
                          sortMark(
                            "sellingPrice",
                            productSortBy,
                            productSortDirection,
                          )
                        }}</small>
                      </button>
                      /
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('inventory')"
                      >
                        {{ t("gmvMaxCostData.inventory") }}
                        <small>{{
                          sortMark(
                            "inventory",
                            productSortBy,
                            productSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>{{ t("gmvMaxProductLab.stage") }}</th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('score')"
                      >
                        {{ t("gmvMaxIntelligence.score") }}
                        <small>{{
                          sortMark("score", productSortBy, productSortDirection)
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('spend')"
                      >
                        {{ t("gmvMaxConsole.spend") }}
                        <small>{{
                          sortMark("spend", productSortBy, productSortDirection)
                        }}</small>
                      </button>
                      /
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('grossRevenue')"
                      >
                        {{ t("gmvMaxConsole.grossRevenue") }}
                        <small>{{
                          sortMark(
                            "grossRevenue",
                            productSortBy,
                            productSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('roi')"
                      >
                        ROI
                        <small>{{
                          sortMark("roi", productSortBy, productSortDirection)
                        }}</small>
                      </button>
                      / {{ t("gmvMaxLearning.profitFloor") }}
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('estimatedProfit')"
                      >
                        {{ t("gmvMaxProductLab.profit") }}
                        <small>{{
                          sortMark(
                            "estimatedProfit",
                            productSortBy,
                            productSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('spendShare')"
                      >
                        {{ t("gmvMaxProductLab.allocation") }}
                        <small>{{
                          sortMark(
                            "spendShare",
                            productSortBy,
                            productSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductSort('creativeCount')"
                      >
                        {{ t("gmvMaxProductLab.proof") }}
                        <small>{{
                          sortMark(
                            "creativeCount",
                            productSortBy,
                            productSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>{{ t("gmvMaxProductLab.nextAction") }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in filteredProductInsights" :key="item.id">
                    <td>
                      <div class="gmv-product-identity">
                        <button
                          v-if="item.imageUrl"
                          class="gmv-product-thumb"
                          type="button"
                          :title="t('gmvMaxProductImage.open')"
                          @click="openProductImage(item)"
                        >
                          <img
                            :src="item.imageUrl"
                            :alt="item.productName || item.productId"
                            loading="lazy"
                            decoding="async"
                            @error="clearProductImage(item)"
                          /><span><Maximize2 /></span>
                        </button>
                        <div v-else class="gmv-product-thumb is-placeholder">
                          <ImageOff />
                        </div>
                        <div>
                          <strong>{{
                            item.productName || item.productId
                          }}</strong
                          ><small>{{ item.productId }}</small
                          ><small>{{
                            item.categoryName ||
                            t("gmvMaxCostData.uncategorized")
                          }}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{{ campaignName(item.campaignId) }}</strong
                      ><small>{{
                        uniqueStores.find(
                          (store) => store.storeId === item.storeId,
                        )?.storeName || item.storeId
                      }}</small>
                    </td>
                    <td>
                      <strong>{{ actualSellingPriceLabel(item) }}</strong
                      ><small>{{ t("gmvMaxSku.actualPrice") }}</small
                      ><small
                        >{{ t("gmvMaxCostData.inventory") }}
                        {{ item.inventory || "-" }} /
                        {{ t("gmvMaxCostData.skuCount") }}
                        {{ formatInteger(item.skuCount || 0) }}</small
                      ><small>{{
                        structuredValueLabel(
                          item.gmvMaxAdsStatus || item.catalogStatus,
                        )
                      }}</small>
                    </td>
                    <td>
                      <span
                        :class="['gmv-status', productStateClass(item.state)]"
                        >{{ t(`gmvMaxProductLab.states.${item.state}`) }}</span
                      ><small v-if="item.protected">{{
                        t("gmvMaxProductLab.protected")
                      }}</small>
                    </td>
                    <td>
                      <div class="gmv-score">
                        <span :style="{ width: `${item.score}%` }"></span>
                      </div>
                      <strong>{{ item.score }}</strong>
                    </td>
                    <td>
                      <strong
                        >{{ formatCny(item.spend, item.storeId) }} /
                        {{ formatCny(item.grossRevenue, item.storeId) }}</strong
                      ><small
                        >{{ formatInteger(item.orders) }}
                        {{ t("gmvMax.fields.orders") }}</small
                      >
                    </td>
                    <td>
                      <strong
                        >{{ formatRoi(item.roi) }} /
                        {{ formatRoi(item.profitFloor) }}</strong
                      ><small
                        :class="
                          metricNumber(item.roiTrendPercent) >= 0
                            ? 'is-positive'
                            : 'is-negative'
                        "
                        >{{ formatPercent(item.roiTrendPercent, true) }}</small
                      >
                    </td>
                    <td
                      :class="
                        metricNumber(item.estimatedProfit) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                      "
                    >
                      {{
                        item.profitEstimateAvailable
                          ? formatCny(item.estimatedProfit, item.storeId)
                          : "-"
                      }}
                    </td>
                    <td>
                      <span
                        :class="[
                          'gmv-flow-state',
                          item.allocationState === 'starved'
                            ? 'is-slow'
                            : item.allocationState === 'overfunded'
                              ? 'is-fast'
                              : 'is-stable',
                        ]"
                        ><Gauge class="gmv-icon" />{{
                          t(
                            `gmvMaxProductLab.allocationStates.${item.allocationState}`,
                          )
                        }}</span
                      ><small
                        >{{ formatPercent(item.spendShare) }} /
                        {{ formatPercent(item.revenueShare) }}</small
                      >
                    </td>
                    <td>
                      {{ item.creativeCount }}
                      {{ t("gmvMaxProductLab.creatives")
                      }}<small
                        >{{ item.daysObserved }}
                        {{ t("gmvMaxConsole.days") }}</small
                      >
                    </td>
                    <td>
                      <strong>{{
                        t(`gmvMaxProductLab.actions.${item.recommendedAction}`)
                      }}</strong
                      ><small>{{
                        item.signals
                          .slice(0, 2)
                          .map((signal) =>
                            t(`gmvMaxProductLab.signals.${signal}`),
                          )
                          .join(" / ")
                      }}</small>
                    </td>
                    <td>
                      <button
                        class="gmv-button gmv-button--secondary"
                        @click="openProductInsight(item)"
                      >
                        <Pencil class="gmv-icon" />{{
                          t("gmvMaxConsole.configure")
                        }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="productLoading" class="gmv-empty gmv-empty--small">
                {{ t("gmvMaxData.loadingPage") }}
              </div>
              <div
                v-else-if="!filteredProductInsights.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxProductLab.empty") }}
              </div>
              <div class="gmv-pagination">
                <span>{{
                  t("gmvMaxData.pageSummary", {
                    current: productPage.page,
                    total: Math.max(
                      1,
                      Math.ceil(productPage.total / productPage.pageSize),
                    ),
                    count: productPage.total,
                  })
                }}</span
                ><select
                  v-model.number="productPage.pageSize"
                  @change="loadProductPage(1)"
                >
                  <option :value="10">10</option>
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option></select
                ><button
                  class="gmv-button gmv-button--secondary"
                  :disabled="productPage.page <= 1 || productLoading"
                  @click="loadProductPage(productPage.page - 1)"
                >
                  {{ t("gmvMaxData.previous") }}</button
                ><button
                  class="gmv-button gmv-button--secondary"
                  :disabled="
                    productPage.page >=
                      Math.ceil(productPage.total / productPage.pageSize) ||
                    productLoading
                  "
                  @click="loadProductPage(productPage.page + 1)"
                >
                  {{ t("gmvMaxData.next") }}
                </button>
              </div>
            </div>
          </section>
          <section
            class="gmv-panel gmv-calibration-panel"
            data-testid="gmv-strategy-calibrations"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxCalibration.title") }}</h2>
                <p>{{ t("gmvMaxCalibration.subtitle") }}</p>
              </div>
              <span class="gmv-status is-blue"
                >{{ activeCalibrations.length }}
                {{ t("gmvMaxCalibration.active") }}</span
              >
            </div>
            <div class="gmv-table-wrap">
              <table class="gmv-table gmv-table--calibration">
                <thead>
                  <tr>
                    <th>{{ t("gmvMax.fields.campaign") }}</th>
                    <th>{{ t("gmvMax.fields.action") }}</th>
                    <th>{{ t("gmvMaxCalibration.source") }}</th>
                    <th>{{ t("gmvMaxCalibration.samples") }}</th>
                    <th>{{ t("gmvMaxCalibration.winRate") }}</th>
                    <th>{{ t("gmvMaxCalibration.profitLift") }}</th>
                    <th>{{ t("gmvMaxCalibration.step") }}</th>
                    <th>{{ t("gmvMaxLearning.confidence") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in filteredCalibrations.slice(0, 50)"
                    :key="`${item.campaignId}:${item.kind}`"
                  >
                    <td>
                      <strong>{{ campaignName(item.campaignId) }}</strong
                      ><small>{{
                        t(`gmvMaxCalibration.state.${item.state}`)
                      }}</small>
                    </td>
                    <td>{{ t(`gmvMax.kinds.${item.kind}`) }}</td>
                    <td>
                      <span
                        :class="[
                          'gmv-status',
                          calibrationStateClass(item.state),
                        ]"
                        >{{
                          t(`gmvMaxCalibration.sources.${item.source}`)
                        }}</span
                      >
                    </td>
                    <td>
                      {{ formatInteger(item.successCount) }} /
                      {{ formatInteger(item.sampleCount) }}
                    </td>
                    <td>
                      {{
                        item.sampleCount
                          ? formatPercent(item.successRate, true)
                          : "-"
                      }}
                    </td>
                    <td
                      :class="
                        metricNumber(item.averageProfitDeltaPercent) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                      "
                    >
                      {{ formatPercent(item.averageProfitDeltaPercent, true) }}
                    </td>
                    <td>
                      <strong
                        >x{{ item.budgetStepMultiplier.toFixed(2) }}</strong
                      >
                    </td>
                    <td>{{ formatPercent(item.confidence, true) }}</td>
                  </tr>
                </tbody>
              </table>
              <div
                v-if="!filteredCalibrations.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxCalibration.empty") }}
              </div>
            </div>
          </section>
          <section
            class="gmv-panel gmv-portfolio-panel"
            data-testid="gmv-portfolio-plans"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxIntelligence.portfolioTitle") }}</h2>
                <p>{{ t("gmvMaxIntelligence.portfolioSubtitle") }}</p>
              </div>
              <ArrowRightLeft class="gmv-heading-icon" />
            </div>
            <div class="gmv-table-wrap">
              <table class="gmv-table gmv-table--portfolio">
                <thead>
                  <tr>
                    <th>{{ t("gmvMaxAdvanced.fields.store") }}</th>
                    <th>{{ t("gmvMaxIntelligence.donor") }}</th>
                    <th>{{ t("gmvMaxIntelligence.receiver") }}</th>
                    <th>{{ t("gmvMaxIntelligence.amount") }}</th>
                    <th>{{ t("gmvMaxIntelligence.budgetBeforeAfter") }}</th>
                    <th>{{ t("gmvMaxIntelligence.projectedProfit") }}</th>
                    <th>{{ t("gmvMaxIntelligence.confidence") }}</th>
                    <th>{{ t("gmvMax.fields.status") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in filteredPortfolioPlans" :key="item.id">
                    <td>
                      <strong>{{
                        uniqueStores.find(
                          (store) => store.storeId === item.storeId,
                        )?.storeName || item.storeId
                      }}</strong
                      ><small>{{
                        item.evidenceEndDate ||
                        t(`gmvMaxIntelligence.reason.${item.reason}`)
                      }}</small>
                    </td>
                    <td>
                      <strong>{{ campaignName(item.donorCampaignId) }}</strong
                      ><small v-if="item.donorCampaignId"
                        >{{
                          formatCny(item.donorBudgetBefore, item.storeId)
                        }}
                        &gt;
                        {{
                          formatCny(item.donorBudgetAfter, item.storeId)
                        }}</small
                      >
                    </td>
                    <td>
                      <strong>{{
                        campaignName(item.receiverCampaignId)
                      }}</strong
                      ><small v-if="item.receiverCampaignId"
                        >{{
                          formatCny(item.receiverBudgetBefore, item.storeId)
                        }}
                        &gt;
                        {{
                          formatCny(item.receiverBudgetAfter, item.storeId)
                        }}</small
                      >
                    </td>
                    <td>
                      <strong>{{
                        formatCny(item.transferAmount, item.storeId)
                      }}</strong
                      ><small>{{
                        item.budgetConserved
                          ? t("gmvMaxIntelligence.conserved")
                          : t("gmvMaxIntelligence.notConserved")
                      }}</small>
                    </td>
                    <td>
                      <template
                        v-if="item.donorCampaignId && item.receiverCampaignId"
                        >{{
                          formatCny(
                            metricNumber(item.donorBudgetBefore) +
                              metricNumber(item.receiverBudgetBefore),
                            item.storeId,
                          )
                        }}<small>{{
                          formatCny(
                            metricNumber(item.donorBudgetAfter) +
                              metricNumber(item.receiverBudgetAfter),
                            item.storeId,
                          )
                        }}</small></template
                      ><template v-else>-</template>
                    </td>
                    <td
                      :class="
                        metricNumber(item.projectedProfitDelta) > 0
                          ? 'is-positive'
                          : ''
                      "
                    >
                      {{ formatCny(item.projectedProfitDelta, item.storeId) }}
                    </td>
                    <td>{{ formatPercent(item.confidence, true) }}</td>
                    <td>
                      <span
                        :class="[
                          'gmv-status',
                          item.status === 'proposed'
                            ? 'is-success'
                            : item.status === 'executed'
                              ? 'is-blue'
                              : 'is-warning',
                        ]"
                        >{{ portfolioStatusLabel(item.status) }}</span
                      ><small>{{
                        item.lastError ||
                        t(`gmvMaxIntelligence.reason.${item.reason}`)
                      }}</small>
                      <div
                        v-if="item.status === 'proposed'"
                        class="gmv-row__actions"
                      >
                        <button
                          class="gmv-icon-button"
                          :title="t('gmvMax.actions.reject')"
                          :disabled="!!busyAction"
                          @click="rejectPortfolio(item.id)"
                        >
                          <X class="gmv-icon" /></button
                        ><button
                          class="gmv-icon-button"
                          :title="t('gmvMax.actions.approve')"
                          :disabled="!!busyAction"
                          @click="approvePortfolio(item.id)"
                        >
                          <Check class="gmv-icon" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                v-if="!filteredPortfolioPlans.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxIntelligence.noPortfolio") }}
              </div>
            </div>
          </section>
          <div class="gmv-table-wrap">
            <table class="gmv-table gmv-table--learning">
              <thead>
                <tr>
                  <th>{{ t("gmvMax.fields.campaign") }}</th>
                  <th>{{ t("gmvMaxLearning.stage") }}</th>
                  <th>{{ t("gmvMaxLearning.score") }}</th>
                  <th>{{ t("gmvMaxLearning.confidence") }}</th>
                  <th>{{ t("gmvMaxLearning.recentRoi") }}</th>
                  <th>{{ t("gmvMaxLearning.profitFloor") }}</th>
                  <th>{{ t("gmvMaxLearning.trend") }}</th>
                  <th>{{ t("gmvMaxConsole.pacing") }}</th>
                  <th>{{ t("gmvMaxLearning.creativeProof") }}</th>
                  <th>{{ t("gmvMaxLearningFeedback.actionProof") }}</th>
                  <th>{{ t("gmvMaxLearning.nextFocus") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in filteredLearning" :key="item.snapshot.id">
                  <td>
                    <strong>{{ item.campaign.name }}</strong
                    ><small
                      >{{ bindingForCampaign(item.campaign)?.storeName }} /
                      {{ formatInteger(item.snapshot.daysObserved) }}
                      {{ t("gmvMaxConsole.days") }}</small
                    >
                  </td>
                  <td>
                    <span
                      :class="['gmv-lifecycle', `is-${item.snapshot.stage}`]"
                      >{{
                        t(`gmvMaxLearning.stages.${item.snapshot.stage}`)
                      }}</span
                    ><small v-if="item.snapshot.previousStage">{{
                      t("gmvMaxLearning.fromStage", {
                        stage: t(
                          `gmvMaxLearning.stages.${item.snapshot.previousStage}`,
                        ),
                      })
                    }}</small>
                  </td>
                  <td>
                    <div class="gmv-score">
                      <span
                        :style="{ width: `${item.snapshot.score}%` }"
                      ></span>
                    </div>
                    <strong>{{ formatInteger(item.snapshot.score) }}</strong>
                  </td>
                  <td>{{ formatPercent(item.snapshot.confidence, true) }}</td>
                  <td>
                    <strong>{{ formatRoi(item.snapshot.recentRoi) }}</strong>
                  </td>
                  <td>{{ formatRoi(item.snapshot.profitFloor) }}</td>
                  <td
                    :class="
                      metricNumber(item.snapshot.roiTrendPercent) >= 0
                        ? 'is-positive'
                        : 'is-negative'
                    "
                  >
                    {{ formatPercent(item.snapshot.roiTrendPercent, true) }}
                  </td>
                  <td>{{ formatPercent(item.snapshot.budgetUtilization) }}</td>
                  <td>
                    {{ formatInteger(item.snapshot.winningCreativeCount) }} /
                    {{ formatInteger(item.snapshot.creativeCount) }}
                  </td>
                  <td>
                    {{
                      formatInteger(item.snapshot.successfulOutcomeCount || 0)
                    }}
                    /
                    {{ formatInteger(item.snapshot.measuredOutcomeCount || 0) }}
                  </td>
                  <td>
                    <strong>{{
                      t(
                        `gmvMaxLearning.focus.${item.snapshot.recommendedFocus}`,
                      )
                    }}</strong
                    ><small>{{
                      item.snapshot.signals
                        .slice(0, 2)
                        .map(learningSignalLabel)
                        .join(" / ")
                    }}</small>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="!filteredLearning.length" class="gmv-empty">
              {{ t("gmvMaxLearning.empty") }}
            </div>
          </div>
          <section
            class="gmv-panel gmv-outcome-panel"
            data-testid="gmv-outcome-learning"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxLearningFeedback.outcomesTitle") }}</h2>
                <p>{{ t("gmvMaxLearningFeedback.outcomesSubtitle") }}</p>
              </div>
              <span class="gmv-status is-blue"
                >{{ formatInteger(outcomePage.total) }}
                {{ t("gmvMaxLearningFeedback.measuredActions") }}</span
              >
            </div>
            <div class="gmv-table-wrap">
              <table class="gmv-table">
                <thead>
                  <tr>
                    <th>{{ t("gmvMax.fields.campaign") }}</th>
                    <th>{{ t("gmvMaxLearningFeedback.result") }}</th>
                    <th>{{ t("gmvMaxLearningFeedback.roiBeforeAfter") }}</th>
                    <th>{{ t("gmvMaxLearningFeedback.profitBeforeAfter") }}</th>
                    <th>{{ t("gmvMaxLearningFeedback.roiLift") }}</th>
                    <th>{{ t("gmvMaxLearningFeedback.profitLift") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in filteredOutcomes" :key="item.id">
                    <td>
                      <strong>{{ campaignName(item.campaignId) }}</strong
                      ><small>{{ formatDate(item.measuredAt) }}</small>
                    </td>
                    <td>
                      <span
                        :class="[
                          'gmv-status',
                          item.successful ? 'is-success' : 'is-warning',
                        ]"
                        >{{
                          item.successful
                            ? t("gmvMaxLearningFeedback.successful")
                            : t("gmvMaxLearningFeedback.needsAdjustment")
                        }}</span
                      >
                    </td>
                    <td>
                      {{ formatRoi(item.preRoi) }} &gt;
                      {{ formatRoi(item.postRoi) }}
                    </td>
                    <td>
                      {{
                        formatCny(
                          item.preEstimatedProfit,
                          campaignStoreId(item.campaignId),
                        )
                      }}
                      &gt;
                      {{
                        formatCny(
                          item.postEstimatedProfit,
                          campaignStoreId(item.campaignId),
                        )
                      }}
                    </td>
                    <td
                      :class="
                        metricNumber(item.roiDeltaPercent) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                      "
                    >
                      {{ formatPercent(item.roiDeltaPercent, true) }}
                    </td>
                    <td
                      :class="
                        metricNumber(item.profitDeltaPercent) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                      "
                    >
                      {{ formatPercent(item.profitDeltaPercent, true) }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="outcomeLoading" class="gmv-empty gmv-empty--small">
                {{ t("gmvMaxData.loadingPage") }}
              </div>
              <div
                v-else-if="!filteredOutcomes.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxLearningFeedback.noOutcomes") }}
              </div>
            </div>
            <div class="gmv-pagination">
              <span>{{
                t("gmvMaxData.pageSummary", {
                  current: outcomePage.page,
                  total: Math.max(
                    1,
                    Math.ceil(outcomePage.total / outcomePage.pageSize),
                  ),
                  count: outcomePage.total,
                })
              }}</span
              ><select
                v-model.number="outcomePage.pageSize"
                @change="loadOutcomePage(1)"
              >
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option></select
              ><button
                class="gmv-button gmv-button--secondary"
                :disabled="outcomePage.page <= 1 || outcomeLoading"
                @click="loadOutcomePage(outcomePage.page - 1)"
              >
                {{ t("gmvMaxData.previous") }}</button
              ><button
                class="gmv-button gmv-button--secondary"
                :disabled="
                  outcomePage.page >=
                    Math.ceil(outcomePage.total / outcomePage.pageSize) ||
                  outcomeLoading
                "
                @click="loadOutcomePage(outcomePage.page + 1)"
              >
                {{ t("gmvMaxData.next") }}
              </button>
            </div>
          </section>
        </section>

        <section v-else-if="activeTab === 'actions'" class="gmv-section">
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMax.recommendations.title") }}</h2>
              <p>{{ t("gmvMax.recommendations.subtitle") }}</p>
            </div>
            <div class="gmv-segments">
              <button
                v-for="status in ['all', 'pending', 'executed', 'failed']"
                :key="status"
                :class="{ 'is-active': actionStatus === status }"
                @click="
                  actionStatus = status;
                  loadActionPage(1);
                "
              >
                {{ t(`gmvMaxConsole.status.${status}`) }}
              </button>
            </div>
          </div>
          <section class="gmv-v2-decision-categories" data-testid="gmv-decision-categories">
            <article class="is-danger"><ShieldAlert /><div><span>{{ t("gmvMaxV2.action.category.high_risk") }}</span><strong>{{ commandCenter.topActions.filter((item) => item.category === 'high_risk').length }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.high_risk") }}</small></div></article>
            <article class="is-success"><Rocket /><div><span>{{ t("gmvMaxV2.action.category.high_opportunity") }}</span><strong>{{ commandCenter.topActions.filter((item) => item.category === 'high_opportunity').length }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.high_opportunity") }}</small></div></article>
            <article class="is-warning"><Gauge /><div><span>{{ t("gmvMaxV2.action.category.optimization") }}</span><strong>{{ commandCenter.topActions.filter((item) => item.category === 'optimization').length }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.optimization") }}</small></div></article>
            <article class="is-blue"><Clock3 /><div><span>{{ t("gmvMaxV2.action.category.observing") }}</span><strong>{{ commandCenter.actionSummary.observing }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.observing") }}</small></div></article>
          </section>
          <details class="gmv-advanced-details">
            <summary><Filter /><span><strong>{{ t("gmvMaxTaskUi.details.actionFilters") }}</strong><small>{{ t("gmvMaxTaskUi.details.actionFiltersHint") }}</small></span><ChevronDown /></summary>
          <div class="gmv-filter-panel gmv-filter-panel--action">
            <select v-model="actionCampaign" @change="loadActionPage(1)">
              <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
              <option
                v-for="campaign in filteredCampaigns"
                :key="campaign.id"
                :value="campaign.id"
              >
                {{ campaign.name }}
              </option>
            </select>
            <select v-model="actionType" @change="loadActionPage(1)">
              <option value="all">{{ t("gmvMaxActionData.allTypes") }}</option>
              <option
                v-for="type in [
                  'budget',
                  'roi',
                  'creative',
                  'status',
                  'session',
                  'portfolio',
                ]"
                :key="type"
                :value="type"
              >
                {{ actionTypeLabel(type) }}
              </option>
            </select>
            <select v-model="actionRisk" @change="loadActionPage(1)">
              <option value="all">{{ t("gmvMaxActionData.allRisks") }}</option>
              <option value="low">{{ t("gmvMaxActionData.lowRisk") }}</option>
              <option value="medium">
                {{ t("gmvMaxActionData.mediumRisk") }}
              </option>
              <option value="high">{{ t("gmvMaxActionData.highRisk") }}</option>
            </select>
            <div
              class="gmv-action-sort-group"
              role="group"
              :aria-label="t('gmvMaxActionData.sortBy')"
            >
              <span>{{ t("gmvMaxActionData.sortBy") }}</span>
              <button
                :class="{
                  'is-active': actionSortBy === 'projectedNetProfitDelta',
                }"
                :aria-pressed="actionSortBy === 'projectedNetProfitDelta'"
                @click="toggleActionSort('projectedNetProfitDelta')"
              >
                <component
                  :is="
                    actionSortBy === 'projectedNetProfitDelta'
                      ? actionSortDirection === 'asc'
                        ? ArrowUp
                        : ArrowDown
                      : ArrowUpDown
                  "
                />{{ t("gmvMaxOperations.sortProfit") }}
              </button>
              <button
                :class="{ 'is-active': actionSortBy === 'createdAt' }"
                :aria-pressed="actionSortBy === 'createdAt'"
                @click="toggleActionSort('createdAt')"
              >
                <component
                  :is="
                    actionSortBy === 'createdAt'
                      ? actionSortDirection === 'asc'
                        ? ArrowUp
                        : ArrowDown
                      : ArrowUpDown
                  "
                />{{ t("gmvMaxActionData.sortTime") }}
              </button>
              <button
                :class="{ 'is-active': actionSortBy === 'risk' }"
                :aria-pressed="actionSortBy === 'risk'"
                @click="toggleActionSort('risk')"
              >
                <component
                  :is="
                    actionSortBy === 'risk'
                      ? actionSortDirection === 'asc'
                        ? ArrowUp
                        : ArrowDown
                      : ArrowUpDown
                  "
                />{{ t("gmvMaxActionData.sortRisk") }}
              </button>
            </div>
          </div>
          </details>
          <div
            v-if="selectedActionIds.length"
            class="gmv-batch-bar"
            data-testid="gmv-batch-bar"
          >
            <span>{{
              t("gmvMaxOperations.selected", {
                count: selectedActionIds.length,
              })
            }}</span
            ><span v-if="!batchRisk" class="gmv-status is-warning">{{
              t("gmvMaxOperations.sameRiskRequired")
            }}</span
            ><button
              class="gmv-button gmv-button--primary"
              :disabled="
                !!busyAction ||
                !batchRisk ||
                dashboard.scheduler.emergencyStopped
              "
              @click="approveSelectedActions"
            >
              <Check class="gmv-icon" />{{
                t("gmvMaxExecutionTruth.batchApproveAndExecute")
              }}</button
            ><button
              class="gmv-icon-button"
              :title="t('gmvMaxOperations.clearSelection')"
              @click="selectedActionIds = []"
            >
              <X class="gmv-icon" />
            </button>
          </div>
          <div class="gmv-recommendations">
            <article
              v-for="item in filteredActions"
              :key="item.id"
              class="gmv-recommendation"
              @click="openAction(item.id)"
            >
              <div class="gmv-recommendation__top">
                <div class="gmv-recommendation__identity">
                  <input
                    v-if="item.status === 'pending'"
                    type="checkbox"
                    :checked="selectedActionIds.includes(item.id)"
                    :aria-label="t('gmvMaxOperations.selectAction')"
                    @click.stop="toggleActionSelection(item)"
                  />
                  <div>
                    <span
                      :class="[
                        'gmv-status',
                        item.kind === 'scale_up' ? 'is-success' : 'is-warning',
                      ]"
                      >{{ recommendationActionLabel(item) }}</span
                    >
                    <h3>{{ campaignName(item.campaignId) }}</h3>
                  </div>
                </div>
                <div class="gmv-row__actions">
                  <span
                    v-if="item.status === 'pending' && item.shadow"
                    class="gmv-status is-neutral"
                    :title="t('gmvMaxExecutionTruth.shadowApprovalHint')"
                    >{{ t("gmvMaxExecutionTruth.shadowSuggestion") }}</span
                  ><span
                    v-else-if="
                      item.status === 'executed' && item.platformStateVerified
                    "
                    class="gmv-status is-success"
                    :title="item.remoteRequestId || undefined"
                    >{{ t("gmvMaxExecutionTruth.platformVerified") }}</span
                  ><span
                    v-else-if="
                      item.status === 'executed' && item.writeAttempted
                    "
                    class="gmv-status is-blue"
                    :title="item.remoteRequestId || undefined"
                    >{{ t("gmvMaxExecutionTruth.platformAccepted") }}</span
                  ><span :class="['gmv-status', statusClass(item.status)]">{{
                    t(`gmvMax.status.${item.status}`, item.status)
                  }}</span>
                </div>
              </div>
              <div class="gmv-recommendation__summary">
                <strong>{{ t("gmvMaxRecommendationUi.suggestion") }}</strong
                ><span>{{ recommendationActionLabel(item) }}</span>
              </div>
              <div class="gmv-diff">
                <div>
                  <span>{{ t("gmvMax.fields.budget") }}</span
                  ><template
                    v-if="
                      metricNumber(item.currentBudget) !==
                      metricNumber(item.proposedBudget)
                    "
                    ><strong>{{
                      formatCny(
                        item.currentBudget,
                        campaignStoreId(item.campaignId),
                      )
                    }}</strong
                    ><span class="gmv-arrow">&gt;</span
                    ><strong>{{
                      formatCny(
                        item.proposedBudget,
                        campaignStoreId(item.campaignId),
                      )
                    }}</strong></template
                  ><template v-else
                    ><strong class="gmv-no-change">{{
                      t("gmvMaxRecommendationUi.unchanged")
                    }}</strong
                    ><small>{{
                      formatCny(
                        item.currentBudget,
                        campaignStoreId(item.campaignId),
                      )
                    }}</small></template
                  >
                </div>
                <div>
                  <span>{{ t("gmvMax.fields.targetRoi") }}</span
                  ><template
                    v-if="
                      metricNumber(item.currentRoasBid) !==
                      metricNumber(item.proposedRoasBid)
                    "
                    ><strong>{{ formatRoi(item.currentRoasBid) }}</strong
                    ><span class="gmv-arrow">&gt;</span
                    ><strong>{{
                      formatRoi(item.proposedRoasBid)
                    }}</strong></template
                  ><template v-else
                    ><strong class="gmv-no-change">{{
                      t("gmvMaxRecommendationUi.unchanged")
                    }}</strong
                    ><small>{{
                      formatRoi(item.currentRoasBid)
                    }}</small></template
                  >
                </div>
              </div>
              <p class="gmv-reason">
                <strong>{{ t("gmvMaxRecommendationUi.reason") }}</strong
                >{{ recommendationReasonLabel(item.reason) }}
              </p>
              <div v-if="item.status === 'failed'" class="gmv-action-failure">
                <ShieldAlert />
                <div>
                  <strong>{{
                    t("gmvMaxIssueResolutions.executionFailed")
                  }}</strong
                  ><span>{{
                    item.lastError || t("gmvMaxIssueResolutions.failureUnknown")
                  }}</span
                  ><small>{{
                    item.writeAttempted && !item.platformStateVerified
                      ? t("gmvMaxIssueResolutions.verifyBeforeRetry")
                      : item.retryAllowed
                        ? t("gmvMaxIssueResolutions.safeToRetry")
                        : t("gmvMaxIssueResolutions.reviewAudit")
                  }}</small>
                </div>
              </div>
              <dl class="gmv-evidence">
                <div>
                  <dt>{{ t("gmvMaxOperations.projectedProfit") }}</dt>
                  <dd
                    :class="
                      item.projectionSource === 'modeled'
                        ? metricNumber(item.projectedNetProfitDelta) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                        : ''
                    "
                  >
                    {{
                      recommendationProjectionLabel(
                        item.projectedNetProfitDelta,
                        item,
                      )
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxOperations.projectedGmv") }}</dt>
                  <dd>
                    {{
                      recommendationProjectionLabel(
                        item.projectedGmvDelta,
                        item,
                      )
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxOperations.confidence") }}</dt>
                  <dd>{{ recommendationConfidenceLabel(item) }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxRecommendationUi.statisticsPeriod") }}</dt>
                  <dd>{{ formatEvidenceRange(item) }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMax.fields.averageRoi") }}</dt>
                  <dd>{{ formatRoi(item.evidence.averageRoi) }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxAdvanced.fields.profitFloor") }}</dt>
                  <dd>
                    {{
                      item.profitGuard?.effectiveRoiFloor
                        ? formatRoi(item.profitGuard.effectiveRoiFloor)
                        : t("gmvMaxRecommendationUi.notAvailable")
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMax.fields.orders") }}</dt>
                  <dd>{{ formatInteger(item.evidence.totalOrders) }}</dd>
                </div>
                <div v-if="item.remoteRequestId">
                  <dt>{{ t("gmvMaxExecutionTruth.requestId") }}</dt>
                  <dd>{{ item.remoteRequestId }}</dd>
                </div>
                <div v-if="item.calibration">
                  <dt>{{ t("gmvMaxCalibration.step") }}</dt>
                  <dd>
                    x{{ item.calibration.budgetStepMultiplier.toFixed(2) }} /
                    {{ formatInteger(item.calibration.sampleCount) }}
                  </dd>
                </div>
              </dl>
              <div
                v-if="item.status === 'pending'"
                class="gmv-recommendation__actions"
              >
                <button
                  class="gmv-button gmv-button--secondary"
                  :disabled="!!busyAction"
                  @click.stop="reject(item.id)"
                >
                  <X class="gmv-icon" />{{ t("gmvMax.actions.reject") }}</button
                ><button
                  class="gmv-button gmv-button--primary"
                  :disabled="!!busyAction || !canExecute(item)"
                  @click.stop="approve(item.id)"
                >
                  <Check class="gmv-icon" />{{
                    t("gmvMaxExecutionTruth.approveAndExecute")
                  }}
                </button>
              </div>
              <div
                v-else-if="item.status === 'failed'"
                class="gmv-recommendation__actions"
              >
                <button
                  class="gmv-button gmv-button--secondary"
                  :disabled="!!busyAction"
                  @click.stop="reject(item.id)"
                >
                  <X class="gmv-icon" />{{
                    t("gmvMaxRecovery.acknowledge")
                  }}</button
                ><button
                  v-if="item.retryAllowed"
                  class="gmv-button gmv-button--primary"
                  :disabled="!!busyAction"
                  @click.stop="approve(item.id)"
                >
                  <RotateCcw class="gmv-icon" />{{
                    t("gmvMaxSop.actions.retry")
                  }}</button
                ><button
                  v-else
                  class="gmv-button gmv-button--secondary"
                  @click.stop="
                    auditCampaign = item.campaignId;
                    activeTab = 'audit';
                  "
                >
                  <ShieldCheck class="gmv-icon" />{{
                    t("gmvMaxIssueResolutions.actions.audit")
                  }}
                </button>
              </div>
              <div
                v-else-if="item.status === 'executed' && item.reversible"
                class="gmv-recommendation__actions"
              >
                <button
                  class="gmv-button gmv-button--secondary"
                  :disabled="!!busyAction"
                  @click.stop="rollback(item.id)"
                >
                  <RotateCcw class="gmv-icon" />{{
                    t("gmvMaxAdvanced.actions.restore")
                  }}
                </button>
              </div>
            </article>
            <div v-if="actionLoading" class="gmv-empty">
              {{ t("gmvMaxData.loadingPage") }}
            </div>
            <div v-else-if="!filteredActions.length" class="gmv-empty">
              {{ t("gmvMax.empty.recommendations") }}
            </div>
          </div>
          <div class="gmv-pagination">
            <span>{{
              t("gmvMaxData.pageSummary", {
                current: actionPage.page,
                total: Math.max(
                  1,
                  Math.ceil(actionPage.total / actionPage.pageSize),
                ),
                count: actionPage.total,
              })
            }}</span
            ><select
              v-model.number="actionPage.pageSize"
              @change="loadActionPage(1)"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option></select
            ><button
              class="gmv-button gmv-button--secondary"
              :disabled="actionPage.page <= 1 || actionLoading"
              @click="loadActionPage(actionPage.page - 1)"
            >
              {{ t("gmvMaxData.previous") }}</button
            ><button
              class="gmv-button gmv-button--secondary"
              :disabled="
                actionPage.page >=
                  Math.ceil(actionPage.total / actionPage.pageSize) ||
                actionLoading
              "
              @click="loadActionPage(actionPage.page + 1)"
            >
              {{ t("gmvMaxData.next") }}
            </button>
          </div>
        </section>

        <section v-else-if="activeTab === 'rules'" class="gmv-section">
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMax.policies.title") }}</h2>
              <p>{{ t("gmvMax.policies.subtitle") }}</p>
            </div>
            <div class="gmv-row__actions">
              <button
                class="gmv-button gmv-button--secondary"
                data-testid="gmv-run-backtest"
                :disabled="!!busyAction"
                @click="runBacktest"
              >
                <BarChart3 class="gmv-icon" />{{
                  t("gmvMaxAdvanced.actions.backtest")
                }}</button
              ><button
                class="gmv-button gmv-button--primary"
                data-testid="gmv-new-rule"
                @click="openRule()"
              >
                <Plus class="gmv-icon" />{{ t("gmvMaxConsole.newRule") }}
              </button>
            </div>
          </div>
          <section class="gmv-v2-protection-goals" data-testid="gmv-protection-goals">
            <article><CircleDollarSign /><div><strong>{{ t("gmvMaxV2.strategy.profit") }}</strong><small>{{ t("gmvMaxV2.strategy.profitHint") }}</small></div></article>
            <article><Gauge /><div><strong>{{ t("gmvMaxV2.strategy.budget") }}</strong><small>{{ t("gmvMaxV2.strategy.budgetHint") }}</small></div></article>
            <article><Target /><div><strong>{{ t("gmvMaxV2.strategy.roi") }}</strong><small>{{ t("gmvMaxV2.strategy.roiHint") }}</small></div></article>
            <article><Database /><div><strong>{{ t("gmvMaxV2.strategy.data") }}</strong><small>{{ t("gmvMaxV2.strategy.dataHint") }}</small></div></article>
            <article><ShieldCheck /><div><strong>{{ t("gmvMaxV2.strategy.permission") }}</strong><small>{{ t("gmvMaxV2.strategy.permissionHint") }}</small></div></article>
          </section>
          <details class="gmv-advanced-details" data-testid="gmv-backtest-results">
            <summary><BarChart3 /><span><strong>{{ t("gmvMaxTaskUi.details.backtest") }}</strong><small>{{ t("gmvMaxTaskUi.details.backtestHint", { count: dashboard.backtests.length }) }}</small></span><ChevronDown /></summary>
          <section
            class="gmv-panel gmv-backtest-panel"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxBacktest.title") }}</h2>
                <p>{{ t("gmvMaxBacktest.subtitle") }}</p>
              </div>
              <span class="gmv-status is-blue"
                >{{ formatInteger(dashboard.backtests.length) }}
                {{ t("gmvMaxBacktest.runs") }}</span
              >
            </div>
            <div class="gmv-table-wrap">
              <table class="gmv-table gmv-table--backtest">
                <thead>
                  <tr>
                    <th>{{ t("gmvMax.fields.dataRange") }}</th>
                    <th>{{ t("gmvMaxBacktest.scope") }}</th>
                    <th>{{ t("gmvMaxBacktest.scaleUp") }}</th>
                    <th>{{ t("gmvMaxBacktest.scaleDown") }}</th>
                    <th>{{ t("gmvMaxBacktest.hold") }}</th>
                    <th>{{ t("gmvMaxBacktest.transitions") }}</th>
                    <th>{{ t("gmvMaxBacktest.productProof") }}</th>
                    <th>{{ t("gmvMaxBacktest.productGateBlocks") }}</th>
                    <th>{{ t("gmvMaxIntelligence.projectedProfit") }}</th>
                    <th>{{ t("gmvMaxBacktest.coverageBlocks") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in dashboard.backtests.slice(0, 5)"
                    :key="item.id"
                  >
                    <td>
                      <strong>{{ item.startDate }} - {{ item.endDate }}</strong
                      ><small>{{ formatDate(item.createdAt) }}</small>
                    </td>
                    <td>
                      {{
                        item.campaignId
                          ? campaignName(item.campaignId)
                          : t("gmvMaxConsole.allStores")
                      }}
                    </td>
                    <td class="is-positive">
                      {{ formatInteger(item.scaleUpCount || 0) }}
                    </td>
                    <td class="is-negative">
                      {{ formatInteger(item.scaleDownCount || 0) }}
                    </td>
                    <td>{{ formatInteger(item.holdCount || 0) }}</td>
                    <td>{{ formatInteger(item.stageTransitions || 0) }}</td>
                    <td>
                      <strong
                        >{{ formatInteger(item.productQualifiedDays || 0) }} /
                        {{ formatInteger(item.productTestingDays || 0) }} /
                        {{ formatInteger(item.productRiskDays || 0) }}</strong
                      ><small
                        >{{ formatInteger(item.productCostBlockedDays || 0) }}
                        {{ t("gmvMaxBacktest.costBlockedDays") }} /
                        {{
                          formatInteger(item.productEvidenceMissingDays || 0)
                        }}
                        {{ t("gmvMaxBacktest.missingEvidenceDays") }}</small
                      >
                    </td>
                    <td class="is-negative">
                      {{ formatInteger(item.productGateBlockCount || 0) }}
                    </td>
                    <td
                      :class="
                        metricNumber(item.projectedProfitDelta) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                      "
                    >
                      {{
                        backtestStoreId(item)
                          ? formatCny(
                              item.projectedProfitDelta,
                              backtestStoreId(item),
                            )
                          : t("gmvMaxCurrency.pending")
                      }}
                    </td>
                    <td>{{ formatInteger(item.blockedCount) }}</td>
                  </tr>
                </tbody>
              </table>
              <div
                v-if="!dashboard.backtests.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxBacktest.empty") }}
              </div>
            </div>
          </section>
          </details>
          <div class="gmv-rule-grid">
            <article
              v-for="group in dashboard.ruleGroups"
              :key="group.id"
              class="gmv-rule-card"
            >
              <div class="gmv-rule-card__top">
                <div class="gmv-rule-icon"><Gavel /></div>
                <div>
                  <strong>{{ group.name }}</strong
                  ><small
                    >{{
                      uniqueStores.find(
                        (store) => store.storeId === group.storeId,
                      )?.storeName || t("gmvMaxCurrency.legacyScope")
                    }}
                    / {{ t(`gmvMax.presets.${group.preset}`) }}</small
                  >
                </div>
                <button class="gmv-icon-button" @click="openRule(group)">
                  <Pencil class="gmv-icon" /></button
                ><button
                  class="gmv-icon-button is-danger-text"
                  @click="removeRule(group)"
                >
                  <Trash2 class="gmv-icon" />
                </button>
              </div>
              <div class="gmv-rule-stats">
                <span
                  ><small>{{ t("gmvMax.fields.minRoi") }}</small
                  ><strong>{{ formatRoi(group.minRoi) }}</strong></span
                ><span
                  ><small>{{ t("gmvMaxAdvanced.fields.targetCpa") }}</small
                  ><strong>{{
                    formatCny(group.targetCpa, group.storeId)
                  }}</strong></span
                ><span
                  ><small>{{ t("gmvMaxAdvanced.fields.testBudget") }}</small
                  ><strong>{{
                    formatCny(group.creativeTestBudget, group.storeId)
                  }}</strong></span
                >
              </div>
              <footer>
                {{
                  formatInteger(
                    dashboard.ruleBindings.filter(
                      (item) => item.ruleGroupId === group.id,
                    ).length,
                  )
                }}
                {{ t("gmvMaxConsole.boundCampaigns") }}
              </footer>
            </article>
            <button
              class="gmv-rule-card gmv-rule-card--add"
              @click="openRule()"
            >
              <Plus /><span>{{ t("gmvMaxConsole.createRule") }}</span>
            </button>
          </div>
          <div class="gmv-subheading">
            <div>
              <h3>{{ t("gmvMaxConsole.campaignAssignments") }}</h3>
              <p>
                {{ filteredCampaigns.length }}
                {{ t("gmvMax.metrics.campaigns") }}
              </p>
            </div>
          </div>
          <div class="gmv-policy-list">
            <article
              v-for="campaign in filteredCampaigns"
              :key="campaign.id"
              class="gmv-policy gmv-policy--compact"
            >
              <div class="gmv-policy__identity">
                <strong>{{ campaign.name }}</strong
                ><small
                  >{{ bindingForCampaign(campaign)?.advertiserName }} /
                  {{ bindingForCampaign(campaign)?.storeName }}</small
                >
              </div>
              <select
                :value="
                  dashboard.ruleBindings.find(
                    (item) => item.campaignId === campaign.id,
                  )?.ruleGroupId || ''
                "
                @change="
                  setRuleBinding(
                    campaign.id,
                    ($event.target as HTMLSelectElement).value,
                  )
                "
              >
                <option value="">{{ t("gmvMaxConsole.noRule") }}</option>
                <option
                  v-for="group in dashboard.ruleGroups.filter(
                    (item) =>
                      !item.storeId || item.storeId === campaign.storeId,
                  )"
                  :key="group.id"
                  :value="group.id"
                >
                  {{ group.name }}
                </option>
              </select>
              <div class="gmv-permission-strip">
                <span
                  :class="{
                    'is-on': policyDrafts[campaign.id].budgetPermission,
                  }"
                  >B</span
                ><span
                  :class="{ 'is-on': policyDrafts[campaign.id].roiPermission }"
                  >R</span
                ><span
                  :class="{
                    'is-on': policyDrafts[campaign.id].creativePermission,
                  }"
                  >C</span
                ><span
                  :class="{
                    'is-on': policyDrafts[campaign.id].statusPermission,
                  }"
                  >S</span
                ><span
                  :class="{
                    'is-on': policyDrafts[campaign.id].sessionPermission,
                  }"
                  >H</span
                >
              </div>
              <span
                :class="[
                  'gmv-status',
                  policyDrafts[campaign.id].shadowMode
                    ? 'is-blue'
                    : policyDrafts[campaign.id].automationEnabled
                      ? 'is-success'
                      : 'is-neutral',
                ]"
                >{{
                  policyDrafts[campaign.id].shadowMode
                    ? t("gmvMaxAdvanced.shadow")
                    : policyDrafts[campaign.id].automationEnabled
                      ? t("gmvMaxConsole.enabled")
                      : t("gmvMaxConsole.manual")
                }}</span
              >
              <button
                class="gmv-button gmv-button--ghost"
                @click="openPolicy(campaign.id)"
              >
                {{ t("gmvMaxConsole.configure")
                }}<ChevronRight class="gmv-icon" />
              </button>
            </article>
            <div v-if="!dashboard.campaigns.length" class="gmv-empty">
              {{ t("gmvMax.empty.policies") }}
            </div>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'creatives'"
          class="gmv-section gmv-creative-task-page"
        >
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMaxAdvanced.creatives.title") }}</h2>
              <p>{{ t("gmvMaxConsole.creativeOfficialSubtitle") }}</p>
            </div>
            <div class="gmv-row__actions">
              <button
                class="gmv-button gmv-button--primary"
                data-testid="gmv-optimize-creatives"
                :disabled="!connected || !!busyAction"
                @click="optimizeCreatives"
              >
                <Zap class="gmv-icon" />{{
                  t("gmvMaxCreativeOptimize.action")
                }}</button
              ><span class="gmv-status is-warning">{{
                t("gmvMaxIntelligence.fatigued")
              }}</span>
              <div class="gmv-segments">
                <button
                  v-for="source in [
                    'all',
                    'owned',
                    'affiliate',
                    'product_card',
                  ]"
                  :key="source"
                  :class="{ 'is-active': creativeSource === source }"
                  @click="
                    creativeSource = source;
                    loadCreativePage(1);
                  "
                >
                  {{ t(`gmvMaxConsole.source.${source}`) }}
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="incompleteCreativeCostCount || missingCreativeTestBudgetCount"
            class="gmv-alert gmv-alert--warning gmv-creative-blocker-alert"
          >
            <span>{{
              t("gmvMaxCreativeBlockers.summary", {
                costs: incompleteCreativeCostCount,
                budgets: missingCreativeTestBudgetCount,
              })
            }}</span>
            <button
              class="gmv-button gmv-button--secondary"
              type="button"
              @click="activeTab = 'rules'"
            >
              <SlidersHorizontal class="gmv-icon" />{{
                t("gmvMaxCreativeBlockers.configure")
              }}
            </button>
          </div>
          <details
            class="gmv-advanced-details gmv-creative-filters"
            data-testid="gmv-creative-filters"
          >
            <summary>
              <Filter /><span
                ><strong>{{ t("gmvMaxSimpleNav.filters") }}</strong
                ><small>{{ t("gmvMaxTaskUi.details.metricFiltersHint") }}</small></span
              ><ChevronDown />
            </summary>
            <div class="gmv-filter-panel gmv-filter-panel--creative">
            <label
              ><span>{{ t("gmvMax.fields.campaign") }}</span
              ><select v-model="creativeCampaign" @change="loadCreativeContext">
                <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
                <option
                  v-for="campaign in filteredCampaigns"
                  :key="campaign.id"
                  :value="campaign.id"
                >
                  {{ campaign.name }}
                </option>
              </select></label
            >
            <label
              ><span>{{ t("gmvMaxIntelligence.creativeState") }}</span
              ><select v-model="creativeState">
                <option value="all">{{ t("gmvMaxData.allStatuses") }}</option>
                <option
                  v-for="state in [
                    'new',
                    'testing',
                    'winner',
                    'stable',
                    'fatigued',
                    'waste',
                    'blocked',
                  ]"
                  :key="state"
                  :value="state"
                >
                  {{ t(`gmvMaxIntelligence.creativeStates.${state}`) }}
                </option>
              </select></label
            >
            <label
              ><span
                >{{ t("gmvMaxData.minSpend") }} ({{
                  t("gmvMaxCurrency.cnyUnit")
                }})</span
              ><input
                v-model.number="minCreativeSpend"
                type="number"
                min="0"
                :disabled="moneyFilterDisabled()"
            /></label>
            <label
              ><span>{{ t("gmvMaxData.minOrders") }}</span
              ><input v-model.number="minCreativeOrders" type="number" min="0"
            /></label>
            <label
              ><span>{{ t("gmvMaxData.minRoi") }}</span
              ><input
                v-model.number="minCreativeRoi"
                type="number"
                min="0"
                step="0.01"
            /></label>
            <label
              ><span
                >{{ t("gmvMaxData.maxCpa") }} ({{
                  t("gmvMaxCurrency.cnyUnit")
                }})</span
              ><input
                v-model.number="maxCreativeCpa"
                type="number"
                min="0"
                :disabled="moneyFilterDisabled()"
            /></label>
            <label
              ><span>{{ t("gmvMaxData.minCtr") }}</span
              ><input
                v-model.number="minCreativeCtr"
                type="number"
                min="0"
                step="0.01"
            /></label>
            <button
              class="gmv-button gmv-button--primary"
              :disabled="creativeLoading"
              @click="loadCreativePage(1)"
            >
              <Filter class="gmv-icon" />{{ t("gmvMaxData.applyMetrics") }}
            </button>
            </div>
          </details>
          <div class="gmv-creative-hero">
            <div class="gmv-view-tabs">
              <button
                :class="{ 'is-active': creativeView === 'posts' }"
                @click="creativeView = 'posts'"
              >
                <Film class="gmv-icon" />{{ t("gmvMaxConsole.posts") }}</button
              ><button
                :class="{ 'is-active': creativeView === 'creators' }"
                @click="creativeView = 'creators'"
              >
                <Users class="gmv-icon" />{{ t("gmvMaxConsole.creators") }}
              </button>
            </div>
            <div class="gmv-creative-kpis">
              <span
                ><small>{{ t("gmvMaxConsole.grossRevenue") }}</small
                ><strong>{{
                  selectedStore !== "all"
                    ? formatCny(creativePage.summary.revenue, selectedStore)
                    : t("gmvMaxCurrency.pending")
                }}</strong></span
              ><span
                ><small>{{ t("gmvMaxConsole.spend") }}</small
                ><strong>{{
                  selectedStore !== "all"
                    ? formatCny(creativePage.summary.cost, selectedStore)
                    : t("gmvMaxCurrency.pending")
                }}</strong></span
              ><span
                ><small>{{ t("gmvMax.fields.orders") }}</small
                ><strong>{{
                  formatInteger(creativePage.summary.orders)
                }}</strong></span
              ><span
                ><small>ROI</small
                ><strong>{{
                  formatRoi(creativePage.summary.roi)
                }}</strong></span
              ><span
                ><small>{{ t("gmvMaxConsole.authorizedPosts") }}</small
                ><strong>{{ formatInteger(creativePage.total) }}</strong></span
              ><span
                ><small>{{ t("gmvMaxConsole.winners") }}</small
                ><strong>{{
                  formatInteger(
                    filteredCreatives.filter(
                      (item) => item.intelligenceState === "winner",
                    ).length,
                  )
                }}</strong></span
              ><span
                ><small>{{ t("gmvMaxIntelligence.fatigued") }}</small
                ><strong>{{
                  formatInteger(
                    filteredCreatives.filter(
                      (item) => item.intelligenceState === "fatigued",
                    ).length,
                  )
                }}</strong></span
              ><span
                ><small>{{ t("gmvMaxConsole.zeroOrderWaste") }}</small
                ><strong>{{
                  formatInteger(
                    filteredCreatives.filter(
                      (item) => item.intelligenceState === "waste",
                    ).length,
                  )
                }}</strong></span
              >
            </div>
          </div>
          <section
            v-if="creativeExperimentWorkspace"
            class="gmv-experiment-board"
            data-testid="gmv-creative-experiment-board"
          >
            <header>
              <div>
                <span>{{ t("gmvMaxCreativeExperiment.eyebrow") }}</span>
                <h3>{{ creativeExperimentWorkspace.campaign.name }}</h3>
                <p>{{ t("gmvMaxCreativeExperiment.subtitle") }}</p>
              </div>
              <div class="gmv-row__actions">
                <span
                  :class="[
                    'gmv-status',
                    creativeExperimentWorkspace.creativeExperiment.state ===
                    'ready'
                      ? 'is-success'
                      : creativeExperimentWorkspace.creativeExperiment.state ===
                          'blocked'
                        ? 'is-danger'
                        : 'is-warning',
                  ]"
                  >{{
                    t(
                      `gmvMaxCreativeExperiment.states.${creativeExperimentWorkspace.creativeExperiment.state}`,
                    )
                  }}</span
                ><button
                  class="gmv-button gmv-button--secondary"
                  @click="openPolicy(creativeExperimentWorkspace.campaign.id)"
                >
                  <SlidersHorizontal class="gmv-icon" />{{
                    t("gmvMaxConsole.configure")
                  }}
                </button>
              </div>
            </header>
            <div class="gmv-experiment-kpis">
              <article>
                <span>{{ t("gmvMaxCreativeExperiment.activePool") }}</span
                ><strong
                  >{{
                    formatInteger(
                      creativeExperimentWorkspace.creativeExperiment
                        .activeCreativeCount,
                    )
                  }}
                  /
                  {{
                    formatInteger(
                      creativeExperimentWorkspace.creativeExperiment
                        .targetPoolSize,
                    )
                  }}</strong
                ><small
                  >{{
                    formatInteger(
                      creativeExperimentWorkspace.creativeExperiment
                        .missingCreativeCount,
                    )
                  }}
                  {{ t("gmvMaxCreativeExperiment.missing") }}</small
                >
              </article>
              <article>
                <span>{{ t("gmvMaxCreativeExperiment.testBudget") }}</span
                ><strong>{{
                  formatCny(
                    creativeExperimentWorkspace.creativeExperiment.testBudget,
                    creativeExperimentWorkspace.campaign.storeId,
                  )
                }}</strong
                ><small>{{ t("gmvMaxCreativeExperiment.perCreative") }}</small>
              </article>
              <article>
                <span>{{
                  t("gmvMaxCreativeExperiment.explorationBudget")
                }}</span
                ><strong>{{
                  formatCny(
                    creativeExperimentWorkspace.creativeExperiment
                      .explorationBudget,
                    creativeExperimentWorkspace.campaign.storeId,
                  )
                }}</strong
                ><small
                  >{{
                    formatPercent(
                      creativeExperimentWorkspace.creativeExperiment
                        .explorationSharePercent,
                      true,
                    )
                  }}
                  {{ t("gmvMaxCreativeExperiment.ofCampaignBudget") }}</small
                >
              </article>
              <article>
                <span>{{ t("gmvMaxCreativeExperiment.winnerCap") }}</span
                ><strong>{{
                  formatPercent(
                    creativeExperimentWorkspace.creativeExperiment
                      .winnerTrafficCapPercent,
                    true,
                  )
                }}</strong
                ><small>{{ t("gmvMaxCreativeExperiment.advisoryCap") }}</small>
              </article>
              <article>
                <span>{{ t("gmvMaxConsole.winners") }}</span
                ><strong>{{
                  formatInteger(
                    creativeExperimentWorkspace.creativeExperiment.winnerCount,
                  )
                }}</strong
                ><small
                  >{{
                    formatInteger(
                      creativeExperimentWorkspace.creativeExperiment
                        .testingCount,
                    )
                  }}
                  {{ t("gmvMaxCreativeExperiment.testing") }}</small
                >
              </article>
              <article>
                <span>{{ t("gmvMaxCreativeExperiment.candidateSupply") }}</span
                ><strong>{{
                  formatInteger(
                    creativeExperimentWorkspace.creativeExperiment
                      .availableCandidateCount,
                  )
                }}</strong
                ><small
                  >{{
                    formatInteger(
                      creativeExperimentWorkspace.creativeExperiment
                        .fatiguedCount +
                        creativeExperimentWorkspace.creativeExperiment
                          .wasteCount,
                    )
                  }}
                  {{ t("gmvMaxCreativeExperiment.toReplace") }}</small
                >
              </article>
            </div>
            <div class="gmv-experiment-flow">
              <article>
                <span>{{ t("gmvMaxCreativeExperiment.candidate") }}</span
                ><strong>{{
                  creativeExperimentWorkspace.creativeExperiment.candidate
                    ?.name ||
                  creativeExperimentWorkspace.creativeExperiment.candidate
                    ?.creativeId ||
                  "-"
                }}</strong
                ><small>{{
                  creativeExperimentWorkspace.creativeExperiment.candidate
                    ? structuredValueLabel(
                        creativeExperimentWorkspace.creativeExperiment.candidate
                          .status,
                      )
                    : t("gmvMaxCreativeExperiment.noCandidate")
                }}</small>
              </article>
              <ArrowRightLeft class="gmv-icon" />
              <article>
                <span>{{ t("gmvMaxCreativeExperiment.retiring") }}</span
                ><strong>{{
                  creativeExperimentWorkspace.creativeExperiment.retiring
                    ?.name ||
                  creativeExperimentWorkspace.creativeExperiment.retiring
                    ?.creativeId ||
                  "-"
                }}</strong
                ><small>{{
                  creativeExperimentWorkspace.creativeExperiment.retiring
                    ? t(
                        `gmvMaxIntelligence.creativeStates.${creativeExperimentWorkspace.creativeExperiment.retiring.state}`,
                      )
                    : t("gmvMaxCreativeExperiment.noRetiring")
                }}</small>
              </article>
              <button
                v-if="
                  creativeExperimentWorkspace.creativeExperiment.pendingActionId
                "
                class="gmv-button gmv-button--primary"
                @click="
                  openAction(
                    creativeExperimentWorkspace.creativeExperiment
                      .pendingActionId,
                  )
                "
              >
                {{ t("gmvMaxCreativeExperiment.reviewAction") }}
              </button>
            </div>
            <div class="gmv-experiment-signals">
              <span
                v-for="signal in creativeExperimentWorkspace.creativeExperiment
                  .signals"
                :key="signal"
                >{{ t(`gmvMaxCreativeExperiment.signals.${signal}`) }}</span
              >
            </div>
            <div class="gmv-experiment-outcomes">
              <header>
                <strong>{{ t("gmvMaxCreativeOutcome.title") }}</strong
                ><span
                  >{{
                    creativeExperimentWorkspace.creativeOutcomes.filter(
                      (item) => item.successful,
                    ).length
                  }}
                  / {{ creativeExperimentWorkspace.creativeOutcomes.length }}
                  {{ t("gmvMaxCreativeOutcome.successful") }}</span
                >
              </header>
              <div
                v-if="creativeExperimentWorkspace.creativeOutcomes.length"
                class="gmv-outcome-rail"
              >
                <article
                  v-for="item in creativeExperimentWorkspace.creativeOutcomes.slice(
                    0,
                    5,
                  )"
                  :key="item.id"
                >
                  <span
                    :class="[
                      'gmv-status',
                      item.successful ? 'is-success' : 'is-warning',
                    ]"
                    >{{ item.operation || item.actionType }}</span
                  ><strong
                    :title="`${item.comparisonCreativeId || '-'} > ${item.primaryCreativeId || '-'}`"
                    >{{ item.comparisonCreativeId || "-" }} &gt;
                    {{ item.primaryCreativeId || "-" }}</strong
                  ><small
                    >ROI {{ formatRoi(item.preRoi) }} &gt;
                    {{ formatRoi(item.postRoi) }} /
                    {{ formatPercent(item.profitDeltaPercent, true) }}</small
                  >
                </article>
              </div>
              <div v-else class="gmv-empty gmv-empty--small">
                {{ t("gmvMaxCreativeOutcome.empty") }}
              </div>
            </div>
          </section>
          <section
            class="gmv-creative-command"
            data-testid="gmv-creative-command"
          >
            <div class="gmv-creative-funnel">
              <div class="gmv-subheading">
                <div>
                  <h3>{{ t("gmvMaxOfficial.creativeFunnel") }}</h3>
                  <p>{{ t("gmvMaxOfficial.creativeFunnelHint") }}</p>
                </div>
              </div>
              <div class="gmv-funnel-track">
                <article v-for="stage in creativeFunnel" :key="stage.key">
                  <span>{{ t(`gmvMaxOfficial.funnel.${stage.key}`) }}</span
                  ><strong>{{ stage.value }}</strong
                  ><i
                    :style="{
                      width: `${creativeFunnel[0].value ? Math.max(4, (stage.value / creativeFunnel[0].value) * 100) : 0}%`,
                    }"
                  ></i>
                </article>
              </div>
            </div>
            <div class="gmv-signal-board">
              <div class="gmv-subheading">
                <div>
                  <h3>{{ t("gmvMaxOfficial.trafficSignals") }}</h3>
                  <p>{{ t("gmvMaxOfficial.trafficSignalsHint") }}</p>
                </div>
              </div>
              <div class="gmv-signal-grid">
                <article>
                  <span>CTR</span
                  ><strong>{{
                    percentage(String(creativeSignalSummary.ctr))
                  }}</strong>
                </article>
                <article>
                  <span>CVR</span
                  ><strong>{{
                    percentage(String(creativeSignalSummary.conversionRate))
                  }}</strong>
                </article>
                <article>
                  <span>2s</span
                  ><strong>{{
                    percentage(String(creativeSignalSummary.play2sRate))
                  }}</strong>
                </article>
                <article>
                  <span>6s</span
                  ><strong>{{
                    percentage(String(creativeSignalSummary.playDepth))
                  }}</strong>
                </article>
              </div>
              <p class="gmv-signal-note">
                <ShieldAlert class="gmv-icon" />{{
                  t("gmvMaxOfficial.todayGuard")
                }}
              </p>
            </div>
          </section>
          <section
            class="gmv-panel gmv-creative-queue"
            data-testid="gmv-creative-queue"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>
                  {{ t("gmvMaxAdvanced.tabs.creatives") }}
                  {{ t("gmvMaxAdvanced.tabs.actions") }}
                </h2>
                <p>{{ t("gmvMaxConsole.creativeOfficialSubtitle") }}</p>
              </div>
              <span class="gmv-status is-blue"
                >{{ creativeActionQueue.length }}
                {{ t("gmvMaxConsole.entries") }}</span
              >
            </div>
            <div class="gmv-table-wrap">
              <table class="gmv-table gmv-table--creative-queue">
                <thead>
                  <tr>
                    <th>{{ t("gmvMax.fields.campaign") }}</th>
                    <th>{{ t("gmvMax.fields.action") }}</th>
                    <th>{{ t("gmvMaxConsole.performance") }}</th>
                    <th>{{ t("gmvMax.fields.dataRange") }}</th>
                    <th>{{ t("gmvMax.fields.status") }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in creativeActionQueue" :key="item.id">
                    <td>
                      <strong>{{ campaignName(item.campaignId) }}</strong
                      ><small>{{
                        bindingForCampaign(
                          dashboard.campaigns.find(
                            (campaign) => campaign.id === item.campaignId,
                          )!,
                        )?.storeName
                      }}</small>
                    </td>
                    <td>
                      <strong>{{
                        String(item.actionPayload?.operation || "REMOVE")
                      }}</strong
                      ><small>{{ item.reason }}</small>
                    </td>
                    <td>
                      <template
                        v-if="item.actionPayload?.operation === 'ROTATE'"
                        ><strong>{{
                          String(item.actionPayload?.addCreativeId || "-")
                        }}</strong
                        ><small>{{
                          String(item.actionPayload?.removeCreativeId || "-")
                        }}</small></template
                      ><template v-else
                        ><strong>{{
                          String(item.actionPayload?.creativeId || "-")
                        }}</strong></template
                      >
                    </td>
                    <td>
                      {{ item.evidence.startDate
                      }}<small>{{ item.evidence.dataFreshness }}</small>
                    </td>
                    <td>
                      <span :class="['gmv-status', statusClass(item.status)]">{{
                        t(`gmvMax.status.${item.status}`)
                      }}</span
                      ><small v-if="item.shadow">{{
                        t("gmvMaxAdvanced.shadow")
                      }}</small>
                    </td>
                    <td>
                      <div class="gmv-row__actions">
                        <button
                          class="gmv-icon-button"
                          :title="t('gmvMaxConsole.actionDetail')"
                          @click="openAction(item.id)"
                        >
                          <ChevronRight class="gmv-icon" /></button
                        ><button
                          v-if="['pending', 'failed'].includes(item.status)"
                          class="gmv-icon-button"
                          :title="
                            item.status === 'failed'
                              ? t('gmvMaxRecovery.acknowledge')
                              : t('gmvMax.actions.reject')
                          "
                          :disabled="!!busyAction"
                          @click="reject(item.id)"
                        >
                          <X class="gmv-icon" /></button
                        ><button
                          v-if="item.status === 'pending'"
                          class="gmv-icon-button"
                          :title="t('gmvMax.actions.approve')"
                          :disabled="!!busyAction"
                          @click="approve(item.id)"
                        >
                          <Check class="gmv-icon" /></button
                        ><button
                          v-if="item.status === 'executed' && item.reversible"
                          class="gmv-icon-button"
                          :title="t('gmvMaxAdvanced.actions.restore')"
                          :disabled="!!busyAction"
                          @click="rollback(item.id)"
                        >
                          <RotateCcw class="gmv-icon" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                v-if="!creativeActionQueue.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMax.empty.recommendations") }}
              </div>
            </div>
          </section>
          <div class="gmv-creative-layout">
            <div v-if="creativeView === 'posts'" class="gmv-table-wrap">
              <table class="gmv-table gmv-table--creatives">
                <thead>
                  <tr>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('creativeName')"
                      >
                        {{ t("gmvMaxConsole.post") }}
                        <small>{{
                          sortMark(
                            "creativeName",
                            creativeSortBy,
                            creativeSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th class="gmv-creative-campaign-cell">
                      {{ t("gmvMax.fields.campaign") }}
                    </th>
                    <th>{{ t("gmvMaxConsole.creatorProduct") }}</th>
                    <th>{{ t("gmvMaxConsole.authorization") }}</th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('grossRevenue')"
                      >
                        {{ t("gmvMaxConsole.grossRevenue") }}
                        <small>{{
                          sortMark(
                            "grossRevenue",
                            creativeSortBy,
                            creativeSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('cost')"
                      >
                        {{ t("gmvMaxAdvanced.fields.spend") }}
                        <small>{{
                          sortMark(
                            "cost",
                            creativeSortBy,
                            creativeSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('orders')"
                      >
                        {{ t("gmvMax.fields.orders") }}
                        <small>{{
                          sortMark(
                            "orders",
                            creativeSortBy,
                            creativeSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('roi')"
                      >
                        ROI
                        <small>{{
                          sortMark("roi", creativeSortBy, creativeSortDirection)
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('cpa')"
                      >
                        CPA
                        <small>{{
                          sortMark("cpa", creativeSortBy, creativeSortDirection)
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('ctr')"
                      >
                        CTR
                        <small>{{
                          sortMark("ctr", creativeSortBy, creativeSortDirection)
                        }}</small>
                      </button>
                    </th>
                    <th>CVR</th>
                    <th>2s</th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('playDepth')"
                      >
                        {{ t("gmvMaxConsole.play6s") }}
                        <small>{{
                          sortMark(
                            "playDepth",
                            creativeSortBy,
                            creativeSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>{{ t("gmvMaxIntelligence.creativeState") }}</th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('intelligenceScore')"
                      >
                        {{ t("gmvMaxIntelligence.score") }}
                        <small>{{
                          sortMark(
                            "intelligenceScore",
                            creativeSortBy,
                            creativeSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleCreativeSort('intelligenceRoiTrend')"
                      >
                        {{ t("gmvMaxIntelligence.roiTrend") }}
                        <small>{{
                          sortMark(
                            "intelligenceRoiTrend",
                            creativeSortBy,
                            creativeSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in filteredCreatives"
                    :key="`${item.campaignId}:${item.creativeId}:${item.itemGroupId || 'unscoped'}`"
                  >
                    <td>
                      <div class="gmv-creative-post">
                        <div>
                          <strong
                            :title="item.creativeName || item.creativeId"
                            >{{ item.creativeName || item.creativeId }}</strong
                          ><small
                            >{{ item.creativeId }} /
                            {{ formatInteger(item.days) }}
                            {{ t("gmvMaxConsole.days") }}</small
                          >
                        </div>
                        <button
                          v-if="creativeVideoAvailable(item)"
                          class="gmv-icon-button gmv-creative-preview-button"
                          type="button"
                          data-testid="gmv-creative-video-preview-button"
                          :title="t('gmvMaxVideoPreview.open')"
                          @click="openCreativeVideo(item)"
                        >
                          <PlayCircle />
                        </button>
                      </div>
                    </td>
                    <td class="gmv-creative-campaign-cell">
                      <strong :title="item.campaignName">{{
                        item.campaignName
                      }}</strong
                      ><small>{{
                        bindingForCampaign(
                          dashboard.campaigns.find(
                            (campaign) => campaign.id === item.campaignId,
                          )!,
                        )?.storeName
                      }}</small>
                    </td>
                    <td>
                      <strong>{{ item.creatorName }}</strong
                      ><small>{{ item.productName }}</small>
                    </td>
                    <td>
                      {{ item.authorizationType
                      }}<small>{{ item.authorizationStatus }}</small>
                    </td>
                    <td>
                      <strong>{{
                        formatCny(item.grossRevenue, item.storeId)
                      }}</strong>
                    </td>
                    <td>{{ formatCny(item.cost, item.storeId) }}</td>
                    <td>{{ formatInteger(item.orders) }}</td>
                    <td>
                      <strong>{{ formatRoi(item.roi) }}</strong>
                    </td>
                    <td>{{ formatCny(item.cpa, item.storeId) }}</td>
                    <td>{{ formatPercent(item.ctr) }}</td>
                    <td>{{ formatPercent(item.conversionRate) }}</td>
                    <td>{{ formatPercent(item.play2sRate) }}</td>
                    <td>{{ formatPercent(item.playDepth) }}</td>
                    <td>
                      <span
                        :class="[
                          'gmv-intelligence-state',
                          `is-${item.intelligenceState}`,
                        ]"
                        >{{
                          t(
                            `gmvMaxIntelligence.creativeStates.${item.intelligenceState}`,
                          )
                        }}</span
                      >
                    </td>
                    <td>
                      <strong>{{
                        formatInteger(item.intelligenceScore)
                      }}</strong>
                    </td>
                    <td
                      :class="
                        metricNumber(item.intelligenceRoiTrend) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                      "
                    >
                      {{ formatPercent(item.intelligenceRoiTrend, true) }}
                    </td>
                    <td>
                      <div class="gmv-row__actions">
                        <button
                          class="gmv-icon-button"
                          :title="t('gmvMaxConsole.allow')"
                          @click="addCreativeToList(item, 'allow')"
                        >
                          <ShieldCheck class="gmv-icon" /></button
                        ><button
                          class="gmv-icon-button"
                          :title="t('gmvMaxConsole.deny')"
                          @click="addCreativeToList(item, 'deny')"
                        >
                          <ShieldAlert class="gmv-icon" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="creativeLoading" class="gmv-empty">
                {{ t("gmvMaxData.loadingPage") }}
              </div>
              <div v-else-if="!filteredCreatives.length" class="gmv-empty">
                {{ t("gmvMaxAdvanced.empty.creatives") }}
              </div>
              <div class="gmv-pagination">
                <span>{{
                  t("gmvMaxData.pageSummary", {
                    current: creativePage.page,
                    total: Math.max(
                      1,
                      Math.ceil(creativePage.total / creativePage.pageSize),
                    ),
                    count: creativePage.total,
                  })
                }}</span
                ><select
                  v-model.number="creativePage.pageSize"
                  @change="loadCreativePage(1)"
                >
                  <option :value="10">10</option>
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option></select
                ><button
                  class="gmv-button gmv-button--secondary"
                  :disabled="creativePage.page <= 1 || creativeLoading"
                  @click="loadCreativePage(creativePage.page - 1)"
                >
                  {{ t("gmvMaxData.previous") }}</button
                ><button
                  class="gmv-button gmv-button--secondary"
                  :disabled="
                    creativePage.page >=
                      Math.ceil(creativePage.total / creativePage.pageSize) ||
                    creativeLoading
                  "
                  @click="loadCreativePage(creativePage.page + 1)"
                >
                  {{ t("gmvMaxData.next") }}
                </button>
              </div>
            </div>
            <div v-else class="gmv-table-wrap">
              <table class="gmv-table">
                <thead>
                  <tr>
                    <th>{{ t("gmvMaxConsole.creator") }}</th>
                    <th>{{ t("gmvMaxConsole.posts") }}</th>
                    <th>{{ t("gmvMaxConsole.winners") }}</th>
                    <th>{{ t("gmvMaxConsole.grossRevenue") }}</th>
                    <th>{{ t("gmvMaxConsole.spend") }}</th>
                    <th>{{ t("gmvMax.fields.orders") }}</th>
                    <th>ROI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="creator in creatorPerformance" :key="creator.name">
                    <td>
                      <strong>{{ creator.name }}</strong>
                    </td>
                    <td>{{ formatInteger(creator.creativeCount) }}</td>
                    <td>{{ formatInteger(creator.winners) }}</td>
                    <td>
                      {{
                        creator.moneyReady
                          ? formatCny(creator.revenue, undefined, true)
                          : t("gmvMaxCurrency.pending")
                      }}
                    </td>
                    <td>
                      {{
                        creator.moneyReady
                          ? formatCny(creator.cost, undefined, true)
                          : t("gmvMaxCurrency.pending")
                      }}
                    </td>
                    <td>{{ formatInteger(creator.orders) }}</td>
                    <td>
                      <strong>{{ formatRoi(creator.roi) }}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="!creatorPerformance.length" class="gmv-empty">
                {{ t("gmvMaxConsole.noCreators") }}
              </div>
            </div>
            <aside class="gmv-list-panel" data-testid="gmv-list-entry-page">
              <div class="gmv-panel__heading">
                <div>
                  <h2>{{ t("gmvMaxConsole.lists") }}</h2>
                  <p>
                    {{ listEntryPage.total }} {{ t("gmvMaxConsole.entries") }}
                  </p>
                </div>
              </div>
              <div class="gmv-list-filters">
                <select v-model="listEntryMode" @change="loadListEntryPage(1)">
                  <option value="all">
                    {{ t("gmvMaxConsole.status.all") }}
                  </option>
                  <option value="allow">{{ t("gmvMaxConsole.allow") }}</option>
                  <option value="deny">
                    {{ t("gmvMaxConsole.deny") }}
                  </option></select
                ><input
                  v-model="listEntrySearch"
                  :placeholder="t('gmvMaxConsole.search')"
                  @keyup.enter="loadListEntryPage(1)"
                />
              </div>
              <div class="gmv-stack">
                <div
                  v-for="item in listEntryPage.items"
                  :key="item.id"
                  class="gmv-list-entry"
                >
                  <span
                    :class="[
                      'gmv-list-mode',
                      item.mode === 'allow' ? 'is-success' : 'is-danger',
                    ]"
                    >{{ item.mode }}</span
                  >
                  <div>
                    <strong>{{ item.label || item.entityId }}</strong
                    ><small>{{ item.entityId }}</small>
                  </div>
                  <button
                    class="gmv-icon-button"
                    @click="removeListEntry(item)"
                  >
                    <Trash2 class="gmv-icon" />
                  </button>
                </div>
                <div v-if="listEntryLoading" class="gmv-empty gmv-empty--small">
                  {{ t("gmvMaxData.loadingPage") }}
                </div>
                <div
                  v-else-if="!listEntryPage.items.length"
                  class="gmv-empty gmv-empty--small"
                >
                  {{ t("gmvMaxConsole.noEntries") }}
                </div>
              </div>
              <div class="gmv-pagination gmv-pagination--compact">
                <span
                  >{{ listEntryPage.page }} /
                  {{
                    Math.max(
                      1,
                      Math.ceil(listEntryPage.total / listEntryPage.pageSize),
                    )
                  }}</span
                ><button
                  class="gmv-icon-button"
                  :disabled="listEntryPage.page <= 1 || listEntryLoading"
                  @click="loadListEntryPage(listEntryPage.page - 1)"
                >
                  -</button
                ><button
                  class="gmv-icon-button"
                  :disabled="
                    listEntryPage.page >=
                      Math.ceil(listEntryPage.total / listEntryPage.pageSize) ||
                    listEntryLoading
                  "
                  @click="loadListEntryPage(listEntryPage.page + 1)"
                >
                  +
                </button>
              </div>
            </aside>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'profit'"
          class="gmv-section gmv-profit-task-page"
        >
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMaxAdvanced.profit.title") }}</h2>
              <p>{{ t("gmvMaxAdvanced.profit.subtitle") }}</p>
            </div>
            <div class="gmv-row__actions">
              <label
                :class="[
                  'gmv-button',
                  'gmv-button--secondary',
                  { 'is-disabled': !!busyAction },
                ]"
                ><Upload class="gmv-icon" />{{
                  t("gmvMaxAdvanced.actions.import")
                }}<input
                  class="gmv-file"
                  data-testid="gmv-import-product-costs"
                  type="file"
                  accept=".csv,text/csv"
                  :disabled="!!busyAction"
                  @change="importCosts" /></label
              ><button
                class="gmv-button gmv-button--secondary"
                :disabled="!!busyAction"
                @click="exportCosts"
              >
                <Download class="gmv-icon" />{{
                  t("gmvMaxAdvanced.actions.export")
                }}
              </button>
            </div>
          </div>
          <div class="gmv-profit-grid" data-testid="gmv-store-profit-summary">
            <article
              v-for="item in dashboard.storeProfitSummaries.filter(
                (summary) =>
                  selectedStore === 'all' || summary.storeId === selectedStore,
              )"
              :key="item.storeId"
              class="gmv-profit-card"
            >
              <header>
                <div>
                  <strong>{{
                    uniqueStores.find((store) => store.storeId === item.storeId)
                      ?.storeName || item.storeId
                  }}</strong
                  ><small>{{ item.startDate }} - {{ item.endDate }}</small>
                </div>
                <span
                  :class="[
                    'gmv-status',
                    item.spendCoveragePercent >= 95 &&
                    item.exchangeRateCoveragePercent === 100
                      ? 'is-success'
                      : 'is-warning',
                  ]"
                  >{{ formatPercent(item.spendCoveragePercent, true) }}
                  {{ t("gmvMaxOperations.spendCoverage") }}</span
                >
              </header>
              <div class="gmv-profit-card__primary">
                <span
                  ><small>{{ t("gmvMaxProfit.netProfit") }}</small
                  ><strong
                    :class="
                      item.profitEstimateAvailable
                        ? metricNumber(item.estimatedNetProfit) >= 0
                          ? 'is-positive'
                          : 'is-negative'
                        : ''
                    "
                    >{{ storeProfitValue(item) }}</strong
                  ></span
                >
                <span
                  ><small>{{ t("gmvMaxProfit.capitalEfficiency") }}</small
                  ><strong>{{
                    item.profitEstimateAvailable
                      ? formatPercent(item.capitalEfficiency)
                      : "-"
                  }}</strong></span
                >
                <span
                  ><small>ROI</small
                  ><strong>{{ formatRoi(item.roi) }}</strong></span
                >
              </div>
              <dl>
                <div>
                  <dt>{{ t("gmvMaxConsole.spend") }}</dt>
                  <dd>{{ formatCny(item.spend, item.storeId) }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxProfit.atRiskSpend") }}</dt>
                  <dd class="is-negative">
                    {{ formatCny(item.atRiskSpend, item.storeId) }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxProfit.testSpend") }}</dt>
                  <dd>{{ formatCny(item.testSpend, item.storeId) }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxProfit.scaleReady") }}</dt>
                  <dd class="is-positive">{{ item.scaleReadyCampaigns }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxCoverage.exchange") }}</dt>
                  <dd>
                    {{ formatPercent(item.exchangeRateCoveragePercent, true) }}
                  </dd>
                </div>
              </dl>
            </article>
            <div
              v-if="!dashboard.storeProfitSummaries.length"
              class="gmv-empty"
            >
              {{ t("gmvMaxProfit.empty") }}
            </div>
          </div>
          <section
            v-for="binding in dashboard.bindings.filter(
              (item, index, values) =>
                values.findIndex((entry) => entry.storeId === item.storeId) ===
                index,
            )"
            :key="binding.storeId"
            class="gmv-panel gmv-cost-panel gmv-store-cost-panel"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ binding.storeName }}</h2>
                <p>{{ binding.storeId }} / {{ t("gmvMaxCurrency.display") }}</p>
              </div>
              <button
                class="gmv-button gmv-button--secondary"
                @click="saveStoreCost(binding.storeId)"
              >
                <Check class="gmv-icon" />{{ t("gmvMax.actions.save") }}
              </button>
            </div>
            <template v-if="storeCostDrafts[binding.storeId]">
              <div
                class="gmv-account-metadata"
                data-testid="gmv-account-metadata"
              >
                <article>
                  <Store class="gmv-account-metadata__icon" />
                  <div>
                    <span>{{ t("gmvMaxCurrency.sourceCurrency") }}</span
                    ><strong>{{
                      storeCostDrafts[binding.storeId].currency || "-"
                    }}</strong
                    ><small>{{ t("gmvMaxCurrency.syncedField") }}</small>
                  </div>
                </article>
                <article>
                  <Clock3 class="gmv-account-metadata__icon" />
                  <div>
                    <span>{{ t("gmvMaxCurrency.timezone") }}</span
                    ><strong>{{
                      storeCostDrafts[binding.storeId].timezone || "-"
                    }}</strong
                    ><small>{{ t("gmvMaxCurrency.timezoneHint") }}</small>
                  </div>
                </article>
                <article
                  :class="{
                    'is-error':
                      storeCostDrafts[binding.storeId].exchangeRateError,
                  }"
                >
                  <CircleDollarSign class="gmv-account-metadata__icon" />
                  <div>
                    <span>{{ t("gmvMaxCurrency.cnyRate") }}</span
                    ><strong>{{
                      formatExchangeRate(
                        storeCostDrafts[binding.storeId].cnyExchangeRate,
                      )
                    }}</strong
                    ><small
                      v-if="
                        storeCostDrafts[binding.storeId].exchangeRateUpdatedAt
                      "
                      >{{
                        storeCostDrafts[binding.storeId].exchangeRateSource ||
                        t("gmvMaxCurrency.automaticSource")
                      }}
                      /
                      {{
                        formatDate(
                          storeCostDrafts[binding.storeId]
                            .exchangeRateUpdatedAt,
                        )
                      }}</small
                    ><small v-else>{{
                      storeCostDrafts[binding.storeId].exchangeRateError
                        ? t("gmvMaxCurrency.syncFailed")
                        : t("gmvMaxCurrency.syncPending")
                    }}</small>
                  </div>
                </article>
              </div>
              <div class="gmv-form-grid gmv-form-grid--cost">
                <label v-for="field in moneyCostFields" :key="field"
                  ><span
                    >{{ t(`gmvMaxAdvanced.cost.${field}`) }} ({{
                      t("gmvMaxCurrency.cnyUnit")
                    }})</span
                  ><input
                    :value="
                      moneyInputValue(
                        storeCostDrafts[binding.storeId][field],
                        binding.storeId,
                      )
                    "
                    inputmode="decimal"
                    :disabled="storeCnyRate(binding.storeId) === null"
                    @input="
                      setMoneyField(
                        storeCostDrafts[binding.storeId] as unknown as Record<
                          string,
                          unknown
                        >,
                        field,
                        $event,
                        binding.storeId,
                      )
                    " /></label
                ><label v-for="field in rateCostFields" :key="field"
                  ><span
                    >{{ t(`gmvMaxAdvanced.cost.${field}`) }} ({{
                      t("gmvMaxRateInput.percentUnit")
                    }})</span
                  ><input
                    :value="
                      percentInputValue(storeCostDrafts[binding.storeId][field])
                    "
                    type="number"
                    inputmode="decimal"
                    min="0"
                    max="100"
                    step="0.1"
                    :placeholder="t('gmvMaxRateInput.placeholder')"
                    @input="
                      setPercentField(
                        storeCostDrafts[binding.storeId] as unknown as Record<
                          string,
                          unknown
                        >,
                        field,
                        $event,
                      )
                    "
                  /><small>{{ t("gmvMaxRateInput.example") }}</small></label
                >
              </div>
            </template>
            <div
              v-if="storeCnyRate(binding.storeId) === null"
              class="gmv-alert gmv-alert--warning"
            >
              <CircleDollarSign class="gmv-icon" />{{
                storeCostDrafts[binding.storeId]?.exchangeRateError
                  ? t("gmvMaxCurrency.syncFailedHint")
                  : t("gmvMaxCurrency.missingHint")
              }}
            </div>
          </section>
          <section
            class="gmv-panel gmv-cost-panel"
            data-testid="gmv-product-cost-page"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxAdvanced.profit.productOverride") }}</h2>
                <p>
                  {{ productCostPage.total }}
                  {{ t("gmvMaxAdvanced.fields.product") }}
                </p>
              </div>
              <button
                class="gmv-button gmv-button--primary"
                data-testid="gmv-add-product-cost"
                @click="openProduct()"
              >
                <Plus class="gmv-icon" />{{ t("gmvMaxConsole.addProductCost") }}
              </button>
            </div>
            <div class="gmv-cost-summary">
              <article>
                <span>{{ t("gmvMaxCostData.campaignOverrides") }}</span
                ><strong>{{
                  productCostPage.summary.campaignOverrides
                }}</strong>
              </article>
              <article>
                <span>{{ t("gmvMaxCostData.storeDefaults") }}</span
                ><strong>{{ productCostPage.summary.storeDefaults }}</strong>
              </article>
              <article>
                <span>{{ t("gmvMaxCostData.completeCount") }}</span
                ><strong class="is-positive">{{
                  productCostPage.summary.complete
                }}</strong>
              </article>
              <article>
                <span>{{ t("gmvMaxCostData.incompleteCount") }}</span
                ><strong class="is-negative">{{
                  productCostPage.summary.incomplete
                }}</strong>
              </article>
            </div>
            <div class="gmv-filter-panel gmv-filter-panel--cost">
              <select
                v-model="productCostCampaign"
                @change="loadProductCostPage(1)"
              >
                <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
                <option
                  v-for="campaign in filteredCampaigns"
                  :key="campaign.id"
                  :value="campaign.id"
                >
                  {{ campaign.name }}
                </option>
              </select>
              <select
                v-model="productCostScope"
                @change="loadProductCostPage(1)"
              >
                <option value="all">{{ t("gmvMaxCostData.allScopes") }}</option>
                <option value="campaign">
                  {{ t("gmvMaxCostData.campaignOverrides") }}
                </option>
                <option value="store_default">
                  {{ t("gmvMaxCostData.storeDefaults") }}
                </option>
              </select>
              <select
                v-model="productCostCompleteness"
                data-testid="gmv-product-cost-completeness"
                @change="loadProductCostPage(1)"
              >
                <option value="all">
                  {{ t("gmvMaxCostData.allCompleteness") }}
                </option>
                <option value="incomplete">
                  {{ t("gmvMaxCostData.incomplete") }}
                </option>
                <option value="complete">
                  {{ t("gmvMaxCostData.complete") }}
                </option>
              </select>
              <input
                v-model="productCostSearch"
                :placeholder="t('gmvMaxCostData.search')"
                @keyup.enter="loadProductCostPage(1)"
              />
              <button
                class="gmv-button gmv-button--primary"
                :disabled="productCostLoading"
                @click="loadProductCostPage(1)"
              >
                <Filter class="gmv-icon" />{{ t("gmvMaxData.applyFilters") }}
              </button>
            </div>
            <div class="gmv-table-wrap">
              <table class="gmv-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductCostSort('productName')"
                      >
                        {{ t("gmvMaxAdvanced.fields.product") }}
                        <small>{{
                          sortMark(
                            "productName",
                            productCostSortBy,
                            productCostSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>{{ t("gmvMaxAdvanced.fields.store") }}</th>
                    <th>{{ t("gmvMaxCostScope.campaign") }}</th>
                    <th>{{ t("gmvMaxCatalog.status") }}</th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductCostSort('completeness')"
                      >
                        {{ t("gmvMaxCostData.completeness") }}
                        <small>{{
                          sortMark(
                            "completeness",
                            productCostSortBy,
                            productCostSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductCostSort('sellingPrice')"
                      >
                        {{ t("gmvMaxAdvanced.fields.price") }}
                        <small>{{
                          sortMark(
                            "sellingPrice",
                            productCostSortBy,
                            productCostSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductCostSort('purchaseCost')"
                      >
                        {{ t("gmvMaxAdvanced.cost.purchaseCost") }}
                        <small>{{
                          sortMark(
                            "purchaseCost",
                            productCostSortBy,
                            productCostSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductCostSort('platformCommissionRate')"
                      >
                        {{ t("gmvMaxAdvanced.cost.platformCommissionRate") }}
                        <small>{{
                          sortMark(
                            "platformCommissionRate",
                            productCostSortBy,
                            productCostSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th>
                      <button
                        class="gmv-sort-button"
                        @click="toggleProductCostSort('expectedReturnRate')"
                      >
                        {{ t("gmvMaxAdvanced.cost.expectedReturnRate") }}
                        <small>{{
                          sortMark(
                            "expectedReturnRate",
                            productCostSortBy,
                            productCostSortDirection,
                          )
                        }}</small>
                      </button>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in productCostPage.items" :key="item.id">
                    <td>
                      <div
                        class="gmv-product-identity gmv-product-identity--cost"
                      >
                        <button
                          v-if="item.imageUrl"
                          class="gmv-product-thumb"
                          type="button"
                          :title="t('gmvMaxProductImage.open')"
                          @click="openProductImage(item)"
                        >
                          <img
                            :src="item.imageUrl"
                            :alt="item.productName || item.productId"
                            loading="lazy"
                            decoding="async"
                            @error="clearProductImage(item)"
                          /><span><Maximize2 /></span>
                        </button>
                        <div v-else class="gmv-product-thumb is-placeholder">
                          <ImageOff />
                        </div>
                        <div>
                          <strong>{{
                            item.productName || item.productId
                          }}</strong
                          ><small>{{ item.productId }}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {{
                        uniqueStores.find(
                          (store) => store.storeId === item.storeId,
                        )?.storeName || item.storeId
                      }}
                    </td>
                    <td>
                      <span
                        :class="[
                          'gmv-status',
                          item.campaignId ? 'is-blue' : 'is-success',
                        ]"
                        >{{
                          item.campaignId
                            ? campaignName(item.campaignId)
                            : t("gmvMaxCostScope.storeDefault")
                        }}</span
                      >
                    </td>
                    <td>
                      <span
                        :class="[
                          'gmv-status',
                          statusClass(
                            item.gmvMaxAdsStatus || item.catalogStatus || '',
                          ),
                        ]"
                        >{{
                          item.gmvMaxAdsStatus || item.catalogStatus || "-"
                        }}</span
                      ><small>{{
                        item.catalogSyncedAt
                          ? `${t("gmvMaxCatalog.syncedAt")} ${formatDate(item.catalogSyncedAt)}`
                          : t("gmvMaxCatalog.notSynced")
                      }}</small>
                    </td>
                    <td>
                      <span
                        :class="[
                          'gmv-status',
                          productCostComplete(item)
                            ? 'is-success'
                            : 'is-warning',
                        ]"
                        >{{
                          t(
                            `gmvMaxCostData.${productCostComplete(item) ? "complete" : "incomplete"}`,
                          )
                        }}</span
                      >
                    </td>
                    <td>
                      <strong>{{ actualSellingPriceLabel(item) }}</strong
                      ><small>{{ t("gmvMaxSku.actualPrice") }}</small>
                    </td>
                    <td>
                      {{
                        item.purchaseCost
                          ? formatCny(item.purchaseCost, item.storeId)
                          : "-"
                      }}
                    </td>
                    <td>
                      {{
                        item.platformCommissionRate
                          ? formatPercent(item.platformCommissionRate)
                          : "-"
                      }}
                    </td>
                    <td>
                      {{
                        item.expectedReturnRate
                          ? formatPercent(item.expectedReturnRate)
                          : "-"
                      }}
                    </td>
                    <td>
                      <div class="gmv-row__actions">
                        <button
                          class="gmv-button gmv-button--secondary"
                          @click="openProduct(item)"
                        >
                          <Pencil class="gmv-icon" />{{
                            t("gmvMaxTaskEditCost")
                          }}</button
                        ><button
                          class="gmv-icon-button is-danger-text"
                          :title="t('gmvMax.actions.delete')"
                          @click="removeProduct(item)"
                        >
                          <Trash2 class="gmv-icon" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="productCostLoading" class="gmv-empty gmv-empty--small">
                {{ t("gmvMaxData.loadingPage") }}
              </div>
              <div
                v-else-if="!productCostPage.items.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxCostData.empty") }}
              </div>
            </div>
            <div class="gmv-pagination">
              <span>{{
                t("gmvMaxData.pageSummary", {
                  current: productCostPage.page,
                  total: Math.max(
                    1,
                    Math.ceil(productCostPage.total / productCostPage.pageSize),
                  ),
                  count: productCostPage.total,
                })
              }}</span
              ><select
                v-model.number="productCostPage.pageSize"
                @change="loadProductCostPage(1)"
              >
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option></select
              ><button
                class="gmv-button gmv-button--secondary"
                :disabled="productCostPage.page <= 1 || productCostLoading"
                @click="loadProductCostPage(productCostPage.page - 1)"
              >
                {{ t("gmvMaxData.previous") }}</button
              ><button
                class="gmv-button gmv-button--secondary"
                :disabled="
                  productCostPage.page >=
                    Math.ceil(
                      productCostPage.total / productCostPage.pageSize,
                    ) || productCostLoading
                "
                @click="loadProductCostPage(productCostPage.page + 1)"
              >
                {{ t("gmvMaxData.next") }}
              </button>
            </div>
          </section>
          <section
            class="gmv-panel gmv-cost-panel gmv-notification-panel"
            data-testid="gmv-notification-panel"
          >
            <div class="gmv-panel__heading">
              <div>
                <h2>{{ t("gmvMaxAdvanced.notifications.title") }}</h2>
              </div>
              <button
                class="gmv-button gmv-button--secondary"
                @click="saveNotification"
              >
                <Check class="gmv-icon" />{{ t("gmvMax.actions.save") }}
              </button>
            </div>
            <div class="gmv-notification-form">
              <label class="gmv-notification-toggle">
                <input
                  v-model="notificationDraft.enabled"
                  data-testid="gmv-notification-enabled"
                  type="checkbox"
                />
                <span>{{ t("gmvMaxAdvanced.notifications.enabled") }}</span>
              </label>
              <input
                v-model="notificationDraft.target"
                class="gmv-notification-target"
                :aria-label="t('gmvMaxAdvanced.notifications.target')"
                :placeholder="t('gmvMaxAdvanced.notifications.target')"
              />
              <label class="gmv-notification-toggle">
                <input
                  v-model="notificationDraft.dailySummaryEnabled"
                  data-testid="gmv-notification-daily"
                  type="checkbox"
                />
                <span>{{ t("gmvMaxAdvanced.notifications.daily") }}</span>
              </label>
            </div>
          </section>
        </section>

        <section
          v-else-if="activeTab === 'settings'"
          class="gmv-section gmv-v2-settings"
          data-testid="gmv-settings-workspace"
        >
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMaxV2.navigation.settings") }}</h2>
              <p>{{ t("gmvMaxV2.settings.subtitle") }}</p>
            </div>
          </div>
          <div class="gmv-v2-settings-grid">
            <article>
              <Link2 /><div><strong>{{ t("gmvMaxV2.settings.connection") }}</strong><span :class="['gmv-status', connected ? 'is-success' : 'is-danger']">{{ connected ? t("gmvMaxV2.settings.configured") : t("gmvMaxV2.settings.notConfigured") }}</span><small>{{ dashboard.connection?.advertiserName || selectedStoreLabel }}</small></div>
              <button class="gmv-button gmv-button--secondary" @click="connected ? refreshWorkspace(false) : connect()">{{ connected ? t("gmvMax.actions.refresh") : t("gmvMax.actions.connect") }}</button>
            </article>
            <article>
              <RefreshCw /><div><strong>{{ t("gmvMaxV2.settings.sync") }}</strong><span>{{ workspaceFreshness }}</span><small>{{ commandCenter.freshness?.stale || 0 }} {{ t("gmvMaxV2.settings.staleItems") }}</small></div>
              <button class="gmv-button gmv-button--secondary" :disabled="!connected || !!busyAction" @click="syncData">{{ t("gmvMaxV2.settings.syncNow") }}</button>
            </article>
            <article>
              <CircleDollarSign /><div><strong>{{ t("gmvMaxV2.settings.cost") }}</strong><span>{{ dashboard.catalog.configuredProducts }} / {{ dashboard.catalog.products }}</span><small>{{ t("gmvMaxV2.settings.costHint") }}</small></div>
              <button class="gmv-button gmv-button--secondary" @click="selectFeatureTab('profit')">{{ t("gmvMaxV2.settings.open") }}</button>
            </article>
            <article>
              <Gauge /><div><strong>{{ t("gmvMaxV2.settings.strategy") }}</strong><span>{{ dashboard.ruleGroups.length }}</span><small>{{ t("gmvMaxV2.settings.strategyHint") }}</small></div>
              <button class="gmv-button gmv-button--secondary" @click="selectFeatureTab('rules')">{{ t("gmvMaxV2.settings.open") }}</button>
            </article>
            <article>
              <ShieldCheck /><div><strong>{{ t("gmvMaxV2.settings.permissions") }}</strong><span>{{ capabilityRows.filter((item) => item.enabled).length }} / {{ capabilityRows.length }}</span><small>{{ t("gmvMaxV2.settings.permissionHint", { enabled: capabilityRows.filter((item) => item.enabled).length, total: capabilityRows.length }) }}</small></div>
              <details><summary>{{ t("gmvMaxV2.settings.open") }}</summary><ul><li v-for="item in capabilityRows" :key="item.name">{{ t(`gmvMaxCapabilities.${item.name}`) }}: {{ item.enabled ? t("gmvMaxConsole.available") : t("gmvMaxConsole.unavailable") }}</li></ul></details>
            </article>
            <article>
              <Bell /><div><strong>{{ t("gmvMaxV2.settings.notifications") }}</strong><span>{{ notificationDraft.enabled ? t("gmvMaxV2.settings.configured") : t("gmvMaxV2.settings.notConfigured") }}</span><small>{{ notificationDraft.target || "-" }}</small></div>
              <button class="gmv-button gmv-button--secondary" @click="saveNotification">{{ t("gmvMax.actions.save") }}</button>
            </article>
            <article class="is-danger">
              <ShieldAlert /><div><strong>{{ t("gmvMaxV2.settings.emergency") }}</strong><span>{{ dashboard.scheduler.emergencyStopped ? t("gmvMaxOperations.stopActive") : t("gmvMaxConsole.available") }}</span><small>{{ dashboard.scheduler.pausedReason || t("gmvMaxV2.settings.emergencyHint") }}</small></div>
              <button :class="['gmv-button', dashboard.scheduler.emergencyStopped ? 'gmv-button--primary' : 'gmv-button--secondary']" :disabled="!connected || !!busyAction" @click="setEmergencyStop(!dashboard.scheduler.emergencyStopped)">{{ dashboard.scheduler.emergencyStopped ? t("gmvMaxOperations.resume") : t("gmvMaxOperations.stop") }}</button>
            </article>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'help'"
          class="gmv-section gmv-section--help"
        >
          <GmvMaxHelpCenter
            :current-issues="selectedSopIssues"
            :current-object="helpCurrentObject"
            :focus-issue-code="helpFocusIssueCode"
            @navigate="selectFeatureTab"
          />
        </section>

        <section v-else-if="activeTab === 'audit'" class="gmv-section" data-testid="gmv-audit-workspace">
          <div class="gmv-section__heading">
            <div>
              <h2>{{ t("gmvMax.audit.title") }}</h2>
              <p>{{ t("gmvMax.audit.subtitle") }}</p>
            </div>
            <button
              class="gmv-sort-button gmv-sort-button--standalone"
              @click="toggleAuditSort"
            >
              <component
                :is="auditSortDirection === 'asc' ? ArrowUp : ArrowDown"
              />{{ t("gmvMaxActionData.sortTime")
              }}<small>{{
                auditSortDirection === "asc"
                  ? t("gmvMaxActionData.ascending")
                  : t("gmvMaxActionData.descending")
              }}</small>
            </button>
          </div>
          <div class="gmv-v2-view-tabs" role="tablist">
            <button v-for="view in auditViews" :key="view" :class="{ 'is-active': auditView === view }" @click="auditView = view">{{ t(`gmvMaxV2.audit.${view}`) }}</button>
          </div>
          <section v-if="auditView === 'results'" class="gmv-panel gmv-v2-audit-results" data-testid="gmv-audit-results">
            <div class="gmv-v2-result-summary"><span>{{ t("gmvMaxV2.action.status.observing") }} <strong>{{ commandCenter.resultSummary.observing }}</strong></span><span>{{ t("gmvMaxV2.audit.improved") }} <strong>{{ commandCenter.resultSummary.improved }}</strong></span><span>{{ t("gmvMaxV2.audit.stable") }} <strong>{{ commandCenter.resultSummary.stable }}</strong></span><span>{{ t("gmvMaxV2.audit.invalid") }} <strong>{{ commandCenter.resultSummary.declined }}</strong></span></div>
            <div v-if="dashboard.actionOutcomes.length" class="gmv-table-wrap"><table class="gmv-table"><thead><tr><th>{{ t("gmvMax.fields.time") }}</th><th>{{ t("gmvMax.fields.campaign") }}</th><th>{{ t("gmvMaxV2.audit.before") }} ROI</th><th>{{ t("gmvMaxV2.audit.after") }} ROI</th><th>{{ t("gmvMaxOperations.netProfit") }}</th><th>{{ t("gmvMax.fields.status") }}</th></tr></thead><tbody><tr v-for="item in dashboard.actionOutcomes" :key="item.id"><td>{{ formatDate(item.measuredAt) }}</td><td>{{ campaignName(item.campaignId) }}</td><td>{{ formatRoi(item.preRoi) }}</td><td>{{ formatRoi(item.postRoi) }}</td><td>{{ formatCny(item.postEstimatedProfit, campaignStoreId(item.campaignId)) }}</td><td><span :class="['gmv-status', item.successful ? 'is-success' : 'is-danger']">{{ item.successful ? t("gmvMaxV2.audit.improved") : t("gmvMaxV2.audit.invalid") }}</span></td></tr></tbody></table></div>
            <div v-else class="gmv-empty">{{ t("gmvMaxV2.audit.noResults") }}</div>
          </section>
          <section v-else-if="auditView === 'exceptions'" class="gmv-panel" data-testid="gmv-audit-exceptions">
            <div class="gmv-table-wrap"><table class="gmv-table"><thead><tr><th>{{ t("gmvMax.fields.time") }}</th><th>{{ t("gmvMax.fields.action") }}</th><th>{{ t("gmvMax.fields.campaign") }}</th><th>{{ t("gmvMax.fields.status") }}</th><th>{{ t("gmvMax.fields.requestId") }}</th></tr></thead><tbody><tr v-for="item in filteredAudits.filter((entry) => entry.status === 'failed')" :key="item.id"><td>{{ formatDate(item.createdAt) }}</td><td>{{ structuredValueLabel(item.action) }}</td><td>{{ campaignName(item.campaignId) }}</td><td><span class="gmv-status is-danger">{{ structuredValueLabel(item.status) }}</span><small>{{ structuredValueLabel(item.error || '') }}</small></td><td>{{ item.remoteRequestId || "-" }}</td></tr></tbody></table><div v-if="!filteredAudits.some((item) => item.status === 'failed')" class="gmv-empty">{{ t("gmvMaxV2.audit.noExceptions") }}</div></div>
          </section>
          <details v-if="auditView === 'execution'" class="gmv-advanced-details">
            <summary><Filter /><span><strong>{{ t("gmvMaxTaskUi.details.auditFilters") }}</strong><small>{{ t("gmvMaxTaskUi.details.auditFiltersHint") }}</small></span><ChevronDown /></summary>
          <div class="gmv-filter-panel gmv-filter-panel--audit">
            <select v-model="auditCampaign" @change="loadAuditPage(1)">
              <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
              <option
                v-for="campaign in filteredCampaigns"
                :key="campaign.id"
                :value="campaign.id"
              >
                {{ campaign.name }}
              </option></select
            ><select v-model="auditStatus" @change="loadAuditPage(1)">
              <option value="all">{{ t("gmvMaxConsole.status.all") }}</option>
              <option value="succeeded">
                {{ t("gmvMax.status.succeeded") }}
              </option>
              <option value="failed">{{ t("gmvMax.status.failed") }}</option>
              <option value="started">
                {{ t("gmvMax.status.started") }}
              </option></select
            ><input
              v-model="auditAction"
              :placeholder="t('gmvMaxActionData.actionSearch')"
              @change="loadAuditPage(1)"
            /><button
              class="gmv-button gmv-button--primary"
              :disabled="auditLoading"
              @click="loadAuditPage(1)"
            >
              <Filter class="gmv-icon" />{{ t("gmvMaxData.applyFilters") }}
            </button>
          </div>
          </details>
          <details v-if="auditView === 'execution'" class="gmv-advanced-details">
            <summary><ShieldCheck /><span><strong>{{ t("gmvMaxTaskUi.details.capabilities") }}</strong><small>{{ t("gmvMaxTaskUi.details.capabilitiesHint", { enabled: capabilityRows.filter((item) => item.enabled).length, total: capabilityRows.length }) }}</small></span><ChevronDown /></summary>
          <div class="gmv-capabilities">
            <article
              v-for="item in capabilityRows"
              :key="item.name"
              :class="{
                'is-enabled': item.enabled,
                'is-disabled': !item.enabled,
              }"
            >
              <span class="gmv-capability-icon"
                ><component :is="item.enabled ? CheckCircle2 : ShieldAlert"
              /></span>
              <div>
                <strong>{{ t(`gmvMaxCapabilities.${item.name}`) }}</strong
                ><small>{{
                  item.enabled
                    ? t("gmvMaxConsole.available")
                    : t("gmvMaxConsole.unavailable")
                }}</small>
              </div>
              <i></i>
            </article>
          </div>
          </details>
          <div v-if="auditView === 'execution'" class="gmv-table-wrap">
            <table class="gmv-table">
              <thead>
                <tr>
                  <th>{{ t("gmvMax.fields.time") }}</th>
                  <th>{{ t("gmvMax.fields.action") }}</th>
                  <th>{{ t("gmvMax.fields.campaign") }}</th>
                  <th>{{ t("gmvMax.fields.status") }}</th>
                  <th>{{ t("gmvMax.fields.requestId") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in filteredAudits" :key="item.id">
                  <td>{{ formatDate(item.createdAt) }}</td>
                  <td>{{ structuredValueLabel(item.action) }}</td>
                  <td>{{ campaignName(item.campaignId) }}</td>
                  <td>
                    <span :class="['gmv-status', statusClass(item.status)]">{{
                      structuredValueLabel(item.status)
                    }}</span
                    ><small v-if="item.error">{{
                      structuredValueLabel(item.error)
                    }}</small>
                  </td>
                  <td>{{ item.remoteRequestId || "-" }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="auditLoading" class="gmv-empty">
              {{ t("gmvMaxData.loadingPage") }}
            </div>
            <div v-else-if="!filteredAudits.length" class="gmv-empty">
              {{ t("gmvMax.empty.audit") }}
            </div>
          </div>
          <div v-if="auditView === 'execution'" class="gmv-pagination">
            <span>{{
              t("gmvMaxData.pageSummary", {
                current: auditPage.page,
                total: Math.max(
                  1,
                  Math.ceil(auditPage.total / auditPage.pageSize),
                ),
                count: auditPage.total,
              })
            }}</span
            ><select
              v-model.number="auditPage.pageSize"
              @change="loadAuditPage(1)"
            >
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option></select
            ><button
              class="gmv-button gmv-button--secondary"
              :disabled="auditPage.page <= 1 || auditLoading"
              @click="loadAuditPage(auditPage.page - 1)"
            >
              {{ t("gmvMaxData.previous") }}</button
            ><button
              class="gmv-button gmv-button--secondary"
              :disabled="
                auditPage.page >=
                  Math.ceil(auditPage.total / auditPage.pageSize) ||
                auditLoading
              "
              @click="loadAuditPage(auditPage.page + 1)"
            >
              {{ t("gmvMaxData.next") }}
            </button>
          </div>
        </section>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="drawer.kind"
        class="gmv-drawer-backdrop"
        data-testid="gmv-drawer-backdrop"
        @click.self="closeDrawer"
      >
        <aside
          :class="['gmv-drawer', { 'is-wide': drawer.kind === 'campaign' }]"
          data-testid="gmv-drawer"
        >
          <header>
            <div>
              <span class="gmv-drawer__eyebrow">GMV MAX CONTROL</span>
              <h2>
                {{
                  drawer.kind === "campaign"
                    ? campaignWorkspace?.campaign.name
                    : drawer.kind === "campaignRecommendations"
                      ? t("gmvMaxCampaignRecommendations.title")
                      : drawer.kind === "policy"
                        ? selectedPolicyCampaign?.name
                        : drawer.kind === "rule"
                          ? t("gmvMaxConsole.ruleEditor")
                          : drawer.kind === "product"
                            ? t("gmvMaxConsole.productEditor")
                            : drawer.kind === "store"
                              ? t("gmvMaxAdvanced.profit.title")
                              : t("gmvMaxConsole.actionDetail")
                }}
              </h2>
            </div>
            <button class="gmv-icon-button" @click="closeDrawer">
              <X class="gmv-icon" />
            </button>
          </header>

          <div
            v-if="drawer.kind === 'campaign'"
            class="gmv-drawer__body gmv-campaign-workspace"
            data-testid="gmv-campaign-workspace"
          >
            <div v-if="campaignWorkspaceLoading" class="gmv-empty">
              {{ t("gmvMaxData.loadingPage") }}
            </div>
            <template v-else-if="campaignWorkspace">
              <div class="gmv-workspace-identity">
                <div>
                  <span
                    :class="[
                      'gmv-status',
                      statusClass(campaignWorkspace.campaign.operationStatus),
                    ]"
                    >{{
                      operationStatusLabel(
                        campaignWorkspace.campaign.operationStatus,
                      )
                    }}</span
                  ><strong>{{
                    campaignWorkspace.binding?.storeName ||
                    campaignWorkspace.campaign.storeId
                  }}</strong
                  ><small
                    >{{ campaignWorkspace.binding?.advertiserName }} /
                    {{ campaignWorkspace.campaign.campaignType }}</small
                  >
                </div>
                <div class="gmv-row__actions">
                  <button
                    class="gmv-button gmv-button--secondary"
                    @click="
                      openCampaignCreatives(campaignWorkspace.campaign.id);
                      closeDrawer();
                    "
                  >
                    <Film class="gmv-icon" />{{
                      t("gmvMaxCampaignLinks.creatives")
                    }}</button
                  ><button
                    class="gmv-button gmv-button--secondary"
                    @click="
                      openCampaignProducts(campaignWorkspace.campaign.id);
                      closeDrawer();
                    "
                  >
                    <CircleDollarSign class="gmv-icon" />{{
                      t("gmvMaxCampaignLinks.products")
                    }}
                  </button>
                </div>
              </div>
              <div class="gmv-workspace-tabs">
                <button
                  v-for="tab in campaignWorkspaceTabs"
                  :key="tab"
                  :class="{ 'is-active': campaignWorkspaceTab === tab }"
                  @click="campaignWorkspaceTab = tab"
                >
                  {{ t(`gmvMaxCampaignWorkspace.tabs.${tab}`) }}
                </button>
              </div>
              <section
                v-if="campaignWorkspaceTab === 'overview'"
                class="gmv-workspace-pane"
              >
                <div class="gmv-workspace-kpis">
                  <article>
                    <span>{{ t("gmvMaxConsole.spend") }}</span
                    ><strong>{{
                      formatCny(
                        campaignWorkspaceSummary.cost,
                        campaignWorkspace.campaign.storeId,
                      )
                    }}</strong>
                  </article>
                  <article>
                    <span>{{ t("gmvMaxConsole.grossRevenue") }}</span
                    ><strong>{{
                      formatCny(
                        campaignWorkspaceSummary.revenue,
                        campaignWorkspace.campaign.storeId,
                      )
                    }}</strong>
                  </article>
                  <article>
                    <span>{{ t("gmvMax.fields.orders") }}</span
                    ><strong>{{
                      formatInteger(campaignWorkspaceSummary.orders)
                    }}</strong>
                  </article>
                  <article>
                    <span>ROI</span
                    ><strong>{{
                      campaignWorkspaceSummary.cost
                        ? formatRoi(
                            campaignWorkspaceSummary.revenue /
                              campaignWorkspaceSummary.cost,
                          )
                        : "-"
                    }}</strong>
                  </article>
                  <article>
                    <span>{{ t("gmvMaxConsole.pacing") }}</span
                    ><strong>{{
                      campaignWorkspace.pacing
                        ? percentage(campaignWorkspace.pacing.actualSpendRatio)
                        : "-"
                    }}</strong>
                  </article>
                  <article>
                    <span>{{ t("gmvMaxLearning.profitFloor") }}</span
                    ><strong>{{
                      formatRoi(campaignWorkspace.profitGuard.effectiveRoiFloor)
                    }}</strong>
                  </article>
                </div>
                <div class="gmv-workspace-grid">
                  <article>
                    <h3>{{ t("gmvMaxCampaignWorkspace.profitGuard") }}</h3>
                    <dl class="gmv-details">
                      <div>
                        <dt>{{ t("gmvMaxProfitCoverage.label") }}</dt>
                        <dd>
                          {{
                            formatPercent(
                              campaignWorkspace.profitGuard
                                .productCoveragePercent ??
                                (campaignWorkspace.profitGuard.complete
                                  ? 100
                                  : 0),
                              true,
                            )
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>{{ t("gmvMaxCampaignWorkspace.breakEvenRoi") }}</dt>
                        <dd>
                          {{
                            formatRoi(
                              campaignWorkspace.profitGuard.breakEvenRoi,
                            )
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>{{ t("gmvMaxLearning.profitFloor") }}</dt>
                        <dd>
                          {{
                            formatRoi(
                              campaignWorkspace.profitGuard.effectiveRoiFloor,
                            )
                          }}
                        </dd>
                      </div>
                    </dl>
                  </article>
                  <article>
                    <h3>{{ t("gmvMaxCampaignWorkspace.learning") }}</h3>
                    <dl class="gmv-details">
                      <div>
                        <dt>{{ t("gmvMaxLearning.stage") }}</dt>
                        <dd>
                          {{
                            campaignWorkspace.learning
                              ? t(
                                  `gmvMaxLearning.stages.${campaignWorkspace.learning.stage}`,
                                )
                              : "-"
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>{{ t("gmvMaxLearning.score") }}</dt>
                        <dd>
                          {{
                            campaignWorkspace.learning
                              ? formatInteger(campaignWorkspace.learning.score)
                              : "-"
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>{{ t("gmvMaxLearning.creativeProof") }}</dt>
                        <dd>
                          {{
                            formatInteger(
                              campaignWorkspace.learning
                                ?.winningCreativeCount ?? 0,
                            )
                          }}
                        </dd>
                      </div>
                    </dl>
                  </article>
                </div>
              </section>
              <section
                v-else-if="campaignWorkspaceTab === 'creatives'"
                class="gmv-workspace-pane"
              >
                <div class="gmv-workspace-summary">
                  <span
                    >{{ formatInteger(campaignWorkspace.creative.total) }}
                    {{ t("gmvMaxConsole.posts") }}</span
                  ><strong
                    >ROI
                    {{
                      formatRoi(campaignWorkspace.creative.summary.roi)
                    }}</strong
                  >
                </div>
                <div class="gmv-workspace-experiment">
                  <div>
                    <span>{{ t("gmvMaxCreativeExperiment.activePool") }}</span
                    ><strong
                      >{{
                        campaignWorkspace.creativeExperiment.activeCreativeCount
                      }}
                      /
                      {{
                        campaignWorkspace.creativeExperiment.targetPoolSize
                      }}</strong
                    >
                  </div>
                  <div>
                    <span>{{
                      t("gmvMaxCreativeExperiment.explorationBudget")
                    }}</span
                    ><strong>{{
                      formatCny(
                        campaignWorkspace.creativeExperiment.explorationBudget,
                        campaignWorkspace.campaign.storeId,
                      )
                    }}</strong>
                  </div>
                  <div>
                    <span>{{
                      t("gmvMaxCreativeExperiment.candidateSupply")
                    }}</span
                    ><strong>{{
                      formatInteger(
                        campaignWorkspace.creativeExperiment
                          .availableCandidateCount,
                      )
                    }}</strong>
                  </div>
                  <div>
                    <span>{{ t("gmvMaxCreativeExperiment.state") }}</span
                    ><strong>{{
                      t(
                        `gmvMaxCreativeExperiment.states.${campaignWorkspace.creativeExperiment.state}`,
                      )
                    }}</strong>
                  </div>
                </div>
                <div
                  v-if="campaignWorkspace.creativeOutcomes.length"
                  class="gmv-outcome-rail gmv-outcome-rail--workspace"
                >
                  <article
                    v-for="item in campaignWorkspace.creativeOutcomes.slice(
                      0,
                      3,
                    )"
                    :key="item.id"
                  >
                    <span
                      :class="[
                        'gmv-status',
                        item.successful ? 'is-success' : 'is-warning',
                      ]"
                      >{{ item.operation }}</span
                    ><strong
                      :title="`${item.comparisonCreativeId || '-'} > ${item.primaryCreativeId || '-'}`"
                      >{{ item.comparisonCreativeId || "-" }} &gt;
                      {{ item.primaryCreativeId || "-" }}</strong
                    ><small>{{
                      formatPercent(item.profitDeltaPercent, true)
                    }}</small>
                  </article>
                </div>
                <div class="gmv-table-wrap">
                  <table class="gmv-table gmv-table--workspace">
                    <thead>
                      <tr>
                        <th>{{ t("gmvMaxConsole.post") }}</th>
                        <th>{{ t("gmvMaxConsole.creator") }}</th>
                        <th>{{ t("gmvMaxConsole.grossRevenue") }}</th>
                        <th>{{ t("gmvMaxConsole.spend") }}</th>
                        <th>{{ t("gmvMax.fields.orders") }}</th>
                        <th>ROI</th>
                        <th>CTR</th>
                        <th>6s</th>
                        <th>{{ t("gmvMaxIntelligence.creativeState") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="item in campaignWorkspace.creative.items"
                        :key="item.id"
                      >
                        <td>
                          <strong>{{
                            item.creativeName || item.creativeId
                          }}</strong
                          ><small>{{ item.creativeId }}</small>
                        </td>
                        <td>
                          {{ item.creatorName
                          }}<small>{{ item.productName }}</small>
                        </td>
                        <td>
                          {{ formatCny(item.grossRevenue, item.storeId) }}
                        </td>
                        <td>{{ formatCny(item.cost, item.storeId) }}</td>
                        <td>{{ formatInteger(item.orders) }}</td>
                        <td>{{ formatRoi(item.roi) }}</td>
                        <td>{{ formatPercent(item.ctr) }}</td>
                        <td>{{ formatPercent(item.playDepth) }}</td>
                        <td>
                          <span
                            :class="[
                              'gmv-intelligence-state',
                              `is-${item.intelligenceState}`,
                            ]"
                            >{{
                              t(
                                `gmvMaxIntelligence.creativeStates.${item.intelligenceState}`,
                              )
                            }}</span
                          >
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <section
                v-else-if="campaignWorkspaceTab === 'products'"
                class="gmv-workspace-pane"
              >
                <div class="gmv-workspace-summary">
                  <span
                    >{{ formatInteger(campaignWorkspace.products.total) }}
                    {{ t("gmvMaxAdvanced.fields.product") }}</span
                  ><strong
                    >{{ formatInteger(campaignWorkspace.productCosts.total) }}
                    {{ t("gmvMaxCampaignWorkspace.costOverrides") }}</strong
                  >
                </div>
                <div class="gmv-table-wrap">
                  <table class="gmv-table gmv-table--workspace">
                    <thead>
                      <tr>
                        <th>{{ t("gmvMaxProductLab.product") }}</th>
                        <th>{{ t("gmvMaxProductLab.stage") }}</th>
                        <th>{{ t("gmvMaxConsole.spend") }}</th>
                        <th>{{ t("gmvMaxConsole.grossRevenue") }}</th>
                        <th>ROI</th>
                        <th>{{ t("gmvMaxLearning.profitFloor") }}</th>
                        <th>{{ t("gmvMaxProductLab.profit") }}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="item in campaignWorkspace.products.items"
                        :key="item.id"
                      >
                        <td>
                          <strong>{{
                            item.productName || item.productId
                          }}</strong
                          ><small>{{ item.productId }}</small>
                        </td>
                        <td>
                          <span
                            :class="[
                              'gmv-status',
                              productStateClass(item.state),
                            ]"
                            >{{
                              t(`gmvMaxProductLab.states.${item.state}`)
                            }}</span
                          >
                        </td>
                        <td>{{ formatCny(item.spend, item.storeId) }}</td>
                        <td>
                          {{ formatCny(item.grossRevenue, item.storeId) }}
                        </td>
                        <td>{{ formatRoi(item.roi) }}</td>
                        <td>{{ formatRoi(item.profitFloor) }}</td>
                        <td
                          :class="
                            metricNumber(item.estimatedProfit) >= 0
                              ? 'is-positive'
                              : 'is-negative'
                          "
                        >
                          {{
                            item.profitEstimateAvailable
                              ? formatCny(item.estimatedProfit, item.storeId)
                              : "-"
                          }}
                        </td>
                        <td>
                          <button
                            class="gmv-icon-button"
                            @click="openProductInsight(item)"
                          >
                            <Pencil class="gmv-icon" />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <section v-else class="gmv-workspace-pane">
                <div class="gmv-workspace-grid">
                  <article>
                    <h3>{{ t("gmvMaxConsole.executionMode") }}</h3>
                    <dl class="gmv-details">
                      <div>
                        <dt>{{ t("gmvMax.fields.preset") }}</dt>
                        <dd>
                          {{
                            t(
                              `gmvMax.presets.${campaignWorkspace.policy.preset}`,
                            )
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>{{ t("gmvMax.fields.automation") }}</dt>
                        <dd>
                          {{
                            campaignWorkspace.policy.automationEnabled
                              ? t("gmvMaxConsole.enabled")
                              : t("gmvMaxConsole.manual")
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>{{ t("gmvMaxAdvanced.shadow") }}</dt>
                        <dd>
                          {{
                            campaignWorkspace.policy.shadowMode
                              ? t("gmvMaxConsole.enabled")
                              : t("gmvMaxConsole.manual")
                          }}
                        </dd>
                      </div>
                    </dl>
                    <button
                      class="gmv-button gmv-button--primary"
                      @click="openPolicy(campaignWorkspace.campaign.id)"
                    >
                      <SlidersHorizontal class="gmv-icon" />{{
                        t("gmvMaxConsole.editPolicy")
                      }}
                    </button>
                  </article>
                  <article>
                    <h3>{{ t("gmvMaxCampaignWorkspace.recentActions") }}</h3>
                    <div class="gmv-mini-actions">
                      <button
                        v-for="item in campaignWorkspace.actions.items.slice(
                          0,
                          6,
                        )"
                        :key="item.id"
                        @click="openAction(item.id)"
                      >
                        <span
                          :class="['gmv-status', statusClass(item.status)]"
                          >{{ item.actionType || item.kind }}</span
                        ><strong
                          >{{
                            formatCny(
                              item.currentBudget,
                              campaignWorkspace.campaign.storeId,
                            )
                          }}
                          &gt;
                          {{
                            formatCny(
                              item.proposedBudget,
                              campaignWorkspace.campaign.storeId,
                            )
                          }}</strong
                        ><small>{{ item.evidence.endDate }}</small>
                      </button>
                      <div
                        v-if="!campaignWorkspace.actions.items.length"
                        class="gmv-empty gmv-empty--small"
                      >
                        {{ t("gmvMax.empty.recommendations") }}
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </template>
          </div>

          <div
            v-else-if="drawer.kind === 'campaignRecommendations'"
            class="gmv-drawer__body"
            data-testid="gmv-campaign-recommendations"
          >
            <div class="gmv-campaign-recommendations__heading">
              <div>
                <strong>{{ selectedRecommendationCampaign?.name }}</strong
                ><small>{{
                  t("gmvMaxCampaignRecommendations.subtitle", {
                    count: selectedCampaignRecommendations.length,
                  })
                }}</small>
              </div>
              <span class="gmv-status is-warning">{{
                selectedCampaignRecommendations.length
              }}</span>
            </div>
            <div
              v-if="selectedCampaignRecommendations.length"
              class="gmv-campaign-recommendations__list"
            >
              <button
                v-for="item in selectedCampaignRecommendations"
                :key="item.id"
                type="button"
                @click="openAction(item.id)"
              >
                <span
                  :class="[
                    'gmv-status',
                    item.kind === 'scale_up' ? 'is-success' : 'is-warning',
                  ]"
                  >{{ recommendationActionLabel(item) }}</span
                ><strong>{{ recommendationReasonLabel(item.reason) }}</strong
                ><small
                  >{{ t("gmvMaxRecommendationUi.statisticsPeriod") }}
                  {{ formatEvidenceRange(item) }}</small
                ><ChevronRight class="gmv-icon" />
              </button>
            </div>
            <div v-else class="gmv-empty">
              {{ t("gmvMaxCampaignRecommendations.empty") }}
            </div>
          </div>

          <div
            v-else-if="
              drawer.kind === 'policy' &&
              selectedPolicyCampaign &&
              policyDrafts[selectedPolicyCampaign.id]
            "
            class="gmv-drawer__body"
          >
            <div class="gmv-summary-strip">
              <span
                ><small>{{ t("gmvMax.fields.budget") }}</small
                ><strong>{{
                  formatCny(
                    selectedPolicyCampaign.budget,
                    selectedPolicyCampaign.storeId,
                  )
                }}</strong></span
              ><span
                ><small>{{ t("gmvMax.fields.targetRoi") }}</small
                ><strong>{{
                  formatRoi(selectedPolicyCampaign.roasBid)
                }}</strong></span
              ><span
                ><small>{{ t("gmvMax.fields.type") }}</small
                ><strong>{{
                  selectedPolicyCampaign.campaignType
                }}</strong></span
              >
            </div>
            <div class="gmv-drawer-section">
              <h3>{{ t("gmvMaxConsole.strategy") }}</h3>
              <label
                ><span>{{ t("gmvMax.fields.preset") }}</span
                ><select
                  v-model="policyDrafts[selectedPolicyCampaign.id].preset"
                >
                  <option value="roi_guard">
                    {{ t("gmvMax.presets.roi_guard") }}
                  </option>
                  <option value="balanced_growth">
                    {{ t("gmvMax.presets.balanced_growth") }}
                  </option>
                  <option value="gmv_growth">
                    {{ t("gmvMax.presets.gmv_growth") }}
                  </option>
                </select></label
              >
              <div class="gmv-two-col">
                <label
                  ><span>{{ t("gmvMax.fields.minRoi") }}</span
                  ><input
                    v-model="
                      policyDrafts[selectedPolicyCampaign.id].minRoi
                    " /></label
                ><label
                  ><span
                    >{{ t("gmvMaxAdvanced.fields.targetCpa") }} ({{
                      t("gmvMaxCurrency.cnyUnit")
                    }})</span
                  ><input
                    :value="
                      moneyInputValue(
                        policyDrafts[selectedPolicyCampaign.id].targetCpa,
                        selectedPolicyCampaign.storeId,
                      )
                    "
                    inputmode="decimal"
                    :disabled="
                      storeCnyRate(selectedPolicyCampaign.storeId) === null
                    "
                    @input="
                      policyDrafts[selectedPolicyCampaign.id].targetCpa =
                        sourceMoneyValue(
                          inputText($event),
                          selectedPolicyCampaign.storeId,
                        )
                    " /></label
                ><label
                  ><span
                    >{{ t("gmvMaxAdvanced.fields.testBudget") }} ({{
                      t("gmvMaxCurrency.cnyUnit")
                    }})</span
                  ><input
                    :value="
                      moneyInputValue(
                        policyDrafts[selectedPolicyCampaign.id]
                          .creativeTestBudget,
                        selectedPolicyCampaign.storeId,
                      )
                    "
                    inputmode="decimal"
                    :disabled="
                      storeCnyRate(selectedPolicyCampaign.storeId) === null
                    "
                    @input="
                      policyDrafts[
                        selectedPolicyCampaign.id
                      ].creativeTestBudget = sourceMoneyValue(
                        inputText($event),
                        selectedPolicyCampaign.storeId,
                      )
                    " /></label
                ><label
                  ><span>{{ t("gmvMaxConsole.safetyMargin") }} (%)</span
                  ><input
                    v-model.number="
                      policyDrafts[selectedPolicyCampaign.id]
                        .profitSafetyMarginPercent
                    "
                    type="number" /></label
                ><label
                  ><span
                    >{{
                      t("gmvMaxCreativeExperiment.explorationShare")
                    }}
                    (%)</span
                  ><input
                    v-model.number="
                      policyDrafts[selectedPolicyCampaign.id]
                        .creativeExplorationSharePercent
                    "
                    type="number"
                    min="5"
                    max="30" /></label
                ><label
                  ><span>{{ t("gmvMaxCreativeExperiment.minPool") }}</span
                  ><input
                    v-model.number="
                      policyDrafts[selectedPolicyCampaign.id]
                        .minExplorationCreatives
                    "
                    type="number"
                    min="2"
                    max="10" /></label
                ><label
                  ><span>{{ t("gmvMaxCreativeExperiment.winnerCap") }} (%)</span
                  ><input
                    v-model.number="
                      policyDrafts[selectedPolicyCampaign.id]
                        .winnerTrafficCapPercent
                    "
                    type="number"
                    min="50"
                    max="90"
                /></label>
              </div>
            </div>
            <div class="gmv-drawer-section">
              <h3>{{ t("gmvMaxConsole.executionMode") }}</h3>
              <label class="gmv-switch-row"
                ><span
                  ><strong>{{ t("gmvMax.fields.automation") }}</strong
                  ><small>{{ t("gmvMaxConsole.automationHint") }}</small></span
                ><input
                  v-model="
                    policyDrafts[selectedPolicyCampaign.id].automationEnabled
                  "
                  type="checkbox" /></label
              ><label class="gmv-switch-row"
                ><span
                  ><strong>{{ t("gmvMaxAdvanced.fields.shadowMode") }}</strong
                  ><small>{{ t("gmvMaxConsole.shadowHint") }}</small></span
                ><input
                  v-model="policyDrafts[selectedPolicyCampaign.id].shadowMode"
                  type="checkbox" /></label
              ><label class="gmv-switch-row"
                ><span
                  ><strong>{{ t("gmvMaxAdvanced.fields.pilot") }}</strong
                  ><small>{{ t("gmvMaxConsole.pilotHint") }}</small></span
                ><input
                  v-model="policyDrafts[selectedPolicyCampaign.id].pilotEnabled"
                  type="checkbox"
              /></label>
            </div>
            <div class="gmv-drawer-section">
              <h3>{{ t("gmvMaxConsole.permissions") }}</h3>
              <div class="gmv-permission-grid">
                <label
                  v-for="permission in [
                    'budgetPermission',
                    'roiPermission',
                    'creativePermission',
                    'statusPermission',
                    'sessionPermission',
                  ]"
                  :key="permission"
                  ><input
                    v-model="
                      (policyDrafts[selectedPolicyCampaign.id] as any)[
                        permission
                      ]
                    "
                    type="checkbox"
                  /><span>{{
                    t(`gmvMaxConsole.permission.${permission}`)
                  }}</span></label
                >
              </div>
            </div>
            <footer>
              <button
                class="gmv-button gmv-button--secondary"
                @click="closeDrawer"
              >
                {{ t("gmvMax.actions.reject") }}</button
              ><button
                class="gmv-button gmv-button--primary"
                @click="savePolicy(selectedPolicyCampaign.id)"
              >
                <Save class="gmv-icon" />{{ t("gmvMax.actions.save") }}
              </button>
            </footer>
          </div>

          <div v-else-if="drawer.kind === 'rule'" class="gmv-drawer__body">
            <div class="gmv-drawer-section">
              <label
                ><span>{{ t("gmvMaxAdvanced.fields.ruleName") }}</span
                ><input v-model="ruleDraft.name" /></label
              ><label
                ><span>{{ t("gmvMaxCurrency.storeScope") }}</span
                ><select v-model="ruleDraft.storeId">
                  <option
                    v-for="store in uniqueStores"
                    :key="store.storeId"
                    :value="store.storeId"
                  >
                    {{ store.storeName }}
                  </option>
                </select></label
              ><label
                ><span>{{ t("gmvMax.fields.preset") }}</span
                ><select v-model="ruleDraft.preset">
                  <option value="roi_guard">
                    {{ t("gmvMax.presets.roi_guard") }}
                  </option>
                  <option value="balanced_growth">
                    {{ t("gmvMax.presets.balanced_growth") }}
                  </option>
                  <option value="gmv_growth">
                    {{ t("gmvMax.presets.gmv_growth") }}
                  </option>
                </select></label
              >
              <div class="gmv-two-col">
                <label
                  ><span>{{ t("gmvMax.fields.minRoi") }}</span
                  ><input v-model="ruleDraft.minRoi" /></label
                ><label
                  ><span
                    >{{ t("gmvMaxAdvanced.fields.targetCpa") }} ({{
                      t("gmvMaxCurrency.cnyUnit")
                    }})</span
                  ><input
                    :value="
                      moneyInputValue(ruleDraft.targetCpa, ruleDraft.storeId)
                    "
                    inputmode="decimal"
                    :disabled="storeCnyRate(ruleDraft.storeId) === null"
                    @input="
                      ruleDraft.targetCpa = sourceMoneyValue(
                        inputText($event),
                        ruleDraft.storeId,
                      )
                    " /></label
                ><label
                  ><span
                    >{{ t("gmvMaxAdvanced.fields.testBudget") }} ({{
                      t("gmvMaxCurrency.cnyUnit")
                    }})</span
                  ><input
                    :value="
                      moneyInputValue(
                        ruleDraft.creativeTestBudget,
                        ruleDraft.storeId,
                      )
                    "
                    inputmode="decimal"
                    :disabled="storeCnyRate(ruleDraft.storeId) === null"
                    @input="
                      ruleDraft.creativeTestBudget = sourceMoneyValue(
                        inputText($event),
                        ruleDraft.storeId,
                      )
                    " /></label
                ><label
                  ><span>{{ t("gmvMaxConsole.safetyMargin") }} (%)</span
                  ><input
                    v-model.number="ruleDraft.profitSafetyMarginPercent"
                    type="number"
                /></label>
              </div>
            </div>
            <footer>
              <button
                class="gmv-button gmv-button--secondary"
                @click="closeDrawer"
              >
                {{ t("gmvMax.actions.reject") }}</button
              ><button
                class="gmv-button gmv-button--primary"
                @click="saveRuleDraft"
              >
                <Save class="gmv-icon" />{{ t("gmvMax.actions.save") }}
              </button>
            </footer>
          </div>

          <div v-else-if="drawer.kind === 'product'" class="gmv-drawer__body">
            <div class="gmv-drawer-section">
              <div class="gmv-two-col">
                <label
                  ><span>{{ t("gmvMaxAdvanced.fields.store") }}</span
                  ><select v-model="productDraft.storeId">
                    <option value="">-</option>
                    <option
                      v-for="store in uniqueStores"
                      :key="store.storeId"
                      :value="store.storeId"
                    >
                      {{ store.storeName }}
                    </option>
                  </select></label
                >
                <label
                  ><span>{{ t("gmvMaxCostScope.campaign") }}</span
                  ><select v-model="productDraft.campaignId">
                    <option value="">
                      {{ t("gmvMaxCostScope.storeDefault") }}
                    </option>
                    <option
                      v-for="campaign in dashboard.campaigns.filter(
                        (item) =>
                          !productDraft.storeId ||
                          item.storeId === productDraft.storeId,
                      )"
                      :key="campaign.id"
                      :value="campaign.id"
                    >
                      {{ campaign.name }}
                    </option>
                  </select></label
                >
                <label
                  ><span>{{ t("gmvMaxAdvanced.fields.productId") }}</span
                  ><input v-model="productDraft.productId"
                /></label>
                <label
                  ><span>{{ t("gmvMaxAdvanced.fields.product") }}</span
                  ><input v-model="productDraft.productName"
                /></label>
                <label v-if="!productHasMultipleSkus"
                  ><span
                    >{{ t("gmvMaxSku.price") }} ({{
                      t("gmvMaxCurrency.cnyUnit")
                    }})</span
                  ><input
                    :value="
                      moneyInputValue(
                        productDraft.sellingPrice,
                        productDraft.storeId,
                      )
                    "
                    inputmode="decimal"
                    :disabled="storeCnyRate(productDraft.storeId) === null"
                    @input="
                      productDraft.sellingPrice = sourceMoneyValue(
                        inputText($event),
                        productDraft.storeId,
                      )
                    "
                /></label>
                <label
                  ><span>{{ t("gmvMaxCostData.currency") }}</span
                  ><input
                    :value="t('gmvMaxCurrency.cnyUnit')"
                    disabled
                  /><small>{{
                    t("gmvMaxCurrency.inputConversionHint")
                  }}</small></label
                >
              </div>
              <div v-if="productHasCatalogRange" class="gmv-sku-range">
                <div>
                  <span>{{ t("gmvMaxSku.minimum") }}</span
                  ><strong>{{
                    formatCny(
                      productDraft.catalogMinPrice || "0",
                      productDraft.storeId,
                    )
                  }}</strong>
                </div>
                <div>
                  <span>{{ t("gmvMaxSku.maximum") }}</span
                  ><strong>{{
                    formatCny(
                      productDraft.catalogMaxPrice || "0",
                      productDraft.storeId,
                    )
                  }}</strong>
                </div>
                <p>
                  <ShieldAlert class="gmv-icon" />{{
                    t("gmvMaxSku.rangeWarning")
                  }}
                </p>
              </div>
              <div class="gmv-cost-catalog">
                <span
                  :class="[
                    'gmv-status',
                    statusClass(
                      productDraft.gmvMaxAdsStatus ||
                        productDraft.catalogStatus ||
                        '',
                    ),
                  ]"
                  >{{
                    productDraft.gmvMaxAdsStatus ||
                    productDraft.catalogStatus ||
                    t("gmvMaxCatalog.notSynced")
                  }}</span
                ><small>{{
                  productDraft.catalogSyncedAt
                    ? `${t("gmvMaxCatalog.syncedAt")} ${formatDate(productDraft.catalogSyncedAt)}`
                    : t("gmvMaxCostData.catalogHint")
                }}</small>
              </div>
            </div>

            <div class="gmv-drawer-section gmv-sku-section">
              <div class="gmv-drawer-section__heading">
                <div>
                  <h3>{{ t("gmvMaxSku.title") }}</h3>
                  <p>{{ t("gmvMaxSku.subtitle") }}</p>
                </div>
                <button
                  class="gmv-button gmv-button--secondary"
                  data-testid="gmv-add-product-sku"
                  @click="addProductVariant"
                >
                  <Plus class="gmv-icon" />{{ t("gmvMaxSku.add") }}
                </button>
              </div>
              <div
                v-if="!(productDraft.variants || []).length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxSku.empty") }}
              </div>
              <article
                v-for="(variant, index) in productDraft.variants || []"
                :key="variant.id"
                class="gmv-sku-card"
                data-testid="gmv-product-sku-card"
              >
                <header>
                  <strong>{{
                    variant.name || `${t("gmvMaxSku.title")} ${index + 1}`
                  }}</strong
                  ><button
                    class="gmv-icon-button"
                    :aria-label="t('gmvMaxSku.remove')"
                    @click="removeProductVariant(index)"
                  >
                    <Trash2 class="gmv-icon" />
                  </button>
                </header>
                <div class="gmv-two-col">
                  <label
                    ><span>{{ t("gmvMaxSku.name") }}</span
                    ><input v-model="variant.name"
                  /></label>
                  <label
                    ><span
                      >{{ t("gmvMaxSku.price") }} ({{
                        t("gmvMaxCurrency.cnyUnit")
                      }})</span
                    ><input
                      :value="
                        moneyInputValue(
                          variant.sellingPrice,
                          productDraft.storeId,
                        )
                      "
                      inputmode="decimal"
                      @input="
                        variant.sellingPrice = sourceMoneyValue(
                          inputText($event),
                          productDraft.storeId,
                        )
                      "
                  /></label>
                  <label v-for="field in moneyCostFields" :key="field"
                    ><span
                      >{{ t(`gmvMaxAdvanced.cost.${field}`) }} ({{
                        t("gmvMaxCurrency.cnyUnit")
                      }})</span
                    ><input
                      :value="
                        moneyInputValue(variant[field], productDraft.storeId)
                      "
                      inputmode="decimal"
                      :placeholder="t('gmvMaxSku.inherited')"
                      @input="
                        setMoneyField(
                          variant as unknown as Record<string, unknown>,
                          field,
                          $event,
                          productDraft.storeId,
                        )
                      "
                  /></label>
                </div>
                <div class="gmv-sku-card__preview">
                  <span
                    >{{ t("gmvMaxCostData.contributionMargin") }}
                    <strong>{{
                      variantDraftProfitPreview(variant)
                        ? formatPercent(
                            variantDraftProfitPreview(variant)
                              ?.contributionMarginRate,
                          )
                        : "-"
                    }}</strong></span
                  ><span
                    >{{ t("gmvMaxCampaignWorkspace.breakEvenRoi") }}
                    <strong>{{
                      variantDraftProfitPreview(variant)?.profitable
                        ? formatRoi(
                            variantDraftProfitPreview(variant)?.breakEvenRoi,
                          )
                        : "-"
                    }}</strong></span
                  >
                </div>
              </article>
              <p
                v-if="(productDraft.variants || []).length"
                class="gmv-sku-note"
              >
                {{ t("gmvMaxSku.worstCase") }}
              </p>
            </div>

            <div class="gmv-drawer-section">
              <h3>{{ t("gmvMaxAdvanced.profit.title") }}</h3>
              <p class="gmv-section-hint">{{ t("gmvMaxSku.inherited") }}</p>
              <div class="gmv-two-col">
                <label v-for="field in moneyCostFields" :key="field"
                  ><span
                    >{{ t(`gmvMaxAdvanced.cost.${field}`) }} ({{
                      t("gmvMaxCurrency.cnyUnit")
                    }})</span
                  ><input
                    :value="
                      moneyInputValue(productDraft[field], productDraft.storeId)
                    "
                    inputmode="decimal"
                    :disabled="storeCnyRate(productDraft.storeId) === null"
                    @input="
                      setMoneyField(
                        productDraft as unknown as Record<string, unknown>,
                        field,
                        $event,
                        productDraft.storeId,
                      )
                    " /></label
                ><label v-for="field in rateCostFields" :key="field"
                  ><span
                    >{{ t(`gmvMaxAdvanced.cost.${field}`) }} ({{
                      t("gmvMaxRateInput.percentUnit")
                    }})</span
                  ><input
                    :value="percentInputValue(productDraft[field])"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    max="100"
                    step="0.1"
                    :placeholder="t('gmvMaxRateInput.placeholder')"
                    @input="
                      setPercentField(
                        productDraft as unknown as Record<string, unknown>,
                        field,
                        $event,
                      )
                    "
                  /><small>{{ t("gmvMaxRateInput.example") }}</small></label
                >
              </div>
            </div>
            <div class="gmv-summary-strip gmv-summary-strip--cost">
              <span
                ><small>{{ t("gmvMaxCostData.contributionMargin") }}</small
                ><strong>{{
                  productDraftProfitPreview
                    ? formatPercent(
                        productDraftProfitPreview.contributionMarginRate,
                      )
                    : "-"
                }}</strong></span
              ><span
                ><small>{{ t("gmvMaxCampaignWorkspace.breakEvenRoi") }}</small
                ><strong>{{
                  productDraftProfitPreview?.profitable
                    ? formatRoi(productDraftProfitPreview.breakEvenRoi)
                    : "-"
                }}</strong></span
              ><span
                ><small>{{ t("gmvMaxCostData.protectedFloor") }}</small
                ><strong>{{
                  productDraftProfitPreview?.profitable
                    ? formatRoi(productDraftProfitPreview.effectiveRoiFloor)
                    : "-"
                }}</strong></span
              >
            </div>
            <div
              v-if="!productDraftProfitPreview?.profitable"
              class="gmv-alert gmv-alert--warning"
            >
              <ShieldAlert class="gmv-icon" />{{
                productHasMultipleSkus && !(productDraft.variants || []).length
                  ? t("gmvMaxSku.rangeWarning")
                  : t("gmvMaxCostData.completeCostHint")
              }}
            </div>
            <footer>
              <button
                class="gmv-button gmv-button--secondary"
                @click="closeDrawer"
              >
                {{ t("gmvMax.actions.reject") }}</button
              ><button
                class="gmv-button gmv-button--primary"
                @click="saveProductDraft"
              >
                <Save class="gmv-icon" />{{ t("gmvMax.actions.save") }}
              </button>
            </footer>
          </div>

          <div
            v-else-if="drawer.kind === 'action' && selectedAction"
            class="gmv-drawer__body"
          >
            <div class="gmv-action-hero">
              <span
                :class="['gmv-status', statusClass(selectedAction.status)]"
                >{{
                  t(
                    `gmvMax.status.${selectedAction.status}`,
                    selectedAction.status,
                  )
                }}</span
              >
              <h3>{{ campaignName(selectedAction.campaignId) }}</h3>
              <p>{{ recommendationReasonLabel(selectedAction.reason) }}</p>
            </div>
            <div class="gmv-summary-strip">
              <span
                ><small>{{ t("gmvMax.fields.budget") }}</small
                ><strong>{{
                  metricNumber(selectedAction.currentBudget) ===
                  metricNumber(selectedAction.proposedBudget)
                    ? t("gmvMaxRecommendationUi.unchanged")
                    : `${formatCny(selectedAction.currentBudget, campaignStoreId(selectedAction.campaignId))} > ${formatCny(selectedAction.proposedBudget, campaignStoreId(selectedAction.campaignId))}`
                }}</strong></span
              ><span
                ><small>{{ t("gmvMax.fields.targetRoi") }}</small
                ><strong>{{
                  metricNumber(selectedAction.currentRoasBid) ===
                  metricNumber(selectedAction.proposedRoasBid)
                    ? t("gmvMaxRecommendationUi.unchanged")
                    : `${formatRoi(selectedAction.currentRoasBid)} > ${formatRoi(selectedAction.proposedRoasBid)}`
                }}</strong></span
              >
            </div>
            <div
              v-if="selectedAction.status === 'failed'"
              class="gmv-action-failure gmv-action-failure--drawer"
              data-testid="gmv-action-failure-details"
            >
              <ShieldAlert />
              <div>
                <strong>{{
                  t("gmvMaxIssueResolutions.executionFailed")
                }}</strong
                ><span>{{
                  selectedAction.lastError ||
                  t("gmvMaxIssueResolutions.failureUnknown")
                }}</span
                ><small>{{
                  selectedAction.writeAttempted &&
                  !selectedAction.platformStateVerified
                    ? t("gmvMaxIssueResolutions.verifyBeforeRetry")
                    : selectedAction.retryAllowed
                      ? t("gmvMaxIssueResolutions.safeToRetry")
                      : t("gmvMaxIssueResolutions.reviewAudit")
                }}</small>
              </div>
            </div>
            <dl class="gmv-details">
              <div>
                <dt>{{ t("gmvMaxRecommendationUi.statisticsPeriod") }}</dt>
                <dd>{{ formatEvidenceRange(selectedAction) }}</dd>
              </div>
              <div>
                <dt>{{ t("gmvMaxAdvanced.fields.profitFloor") }}</dt>
                <dd>
                  {{ formatRoi(selectedAction.profitGuard?.effectiveRoiFloor) }}
                </dd>
              </div>
              <div>
                <dt>{{ t("gmvMax.fields.orders") }}</dt>
                <dd>
                  {{ formatInteger(selectedAction.evidence.totalOrders) }}
                </dd>
              </div>
              <div v-if="selectedAction.remoteRequestId">
                <dt>{{ t("gmvMaxExecutionTruth.requestId") }}</dt>
                <dd>{{ selectedAction.remoteRequestId }}</dd>
              </div>
              <div v-if="selectedAction.status === 'executed'">
                <dt>{{ t("gmvMaxExecutionTruth.platformState") }}</dt>
                <dd>
                  {{
                    t(
                      selectedAction.platformStateVerified
                        ? "gmvMaxExecutionTruth.platformVerified"
                        : "gmvMaxExecutionTruth.platformAccepted",
                    )
                  }}
                </dd>
              </div>
              <div v-if="selectedAction.calibration">
                <dt>{{ t("gmvMaxCalibration.step") }}</dt>
                <dd>
                  x{{
                    selectedAction.calibration.budgetStepMultiplier.toFixed(2)
                  }}
                  / {{ selectedAction.calibration.sampleCount }}
                  {{ t("gmvMaxCalibration.samples") }}
                </dd>
              </div>
            </dl>
            <footer>
              <button
                v-if="['pending', 'failed'].includes(selectedAction.status)"
                class="gmv-button gmv-button--secondary"
                @click="
                  reject(selectedAction.id);
                  closeDrawer();
                "
              >
                {{
                  selectedAction.status === "failed"
                    ? t("gmvMaxRecovery.acknowledge")
                    : t("gmvMax.actions.reject")
                }}</button
              ><button
                v-if="selectedAction.status === 'pending'"
                class="gmv-button gmv-button--primary"
                @click="
                  approve(selectedAction.id);
                  closeDrawer();
                "
              >
                {{ t("gmvMaxExecutionTruth.approveAndExecute") }}</button
              ><button
                v-if="
                  selectedAction.status === 'failed' &&
                  selectedAction.retryAllowed
                "
                class="gmv-button gmv-button--primary"
                @click="
                  approve(selectedAction.id);
                  closeDrawer();
                "
              >
                <RotateCcw class="gmv-icon" />{{
                  t("gmvMaxSop.actions.retry")
                }}</button
              ><button
                v-if="
                  selectedAction.status === 'executed' &&
                  selectedAction.reversible
                "
                class="gmv-button gmv-button--secondary"
                @click="
                  rollback(selectedAction.id);
                  closeDrawer();
                "
              >
                <RotateCcw class="gmv-icon" />{{
                  t("gmvMaxAdvanced.actions.restore")
                }}
              </button>
            </footer>
          </div>
        </aside>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="sopPickerOpen"
        class="gmv-sop-picker-overlay"
        data-testid="gmv-sop-picker-overlay"
        @click.self="closeSopPicker"
        @wheel.stop
      >
        <section
          ref="sopPickerDialog"
          class="gmv-sop-picker"
          data-testid="gmv-sop-picker"
          role="dialog"
          aria-modal="true"
          :aria-label="t('gmvMaxSopUi.pickerTitle')"
          tabindex="-1"
          @keydown="trapSopPickerFocus"
        >
          <header>
            <div class="gmv-sop-picker__heading">
              <span>{{ t("gmvMaxSopUi.pickerEyebrow") }}</span>
              <h2>{{ t("gmvMaxSopUi.pickerTitle") }}</h2>
              <p>{{ t("gmvMaxSopUi.pickerHint") }}</p>
            </div>
            <div class="gmv-sop-picker__header-side">
              <div class="gmv-sop-picker__summary">
                <span
                  ><strong>{{
                    sopWorkspace.autoOnboarding.managedCampaigns
                  }}</strong
                  >{{ t("gmvMaxSopOnboarding.managed") }}</span
                ><span
                  ><strong>{{
                    sopWorkspace.autoOnboarding.automaticInstances
                  }}</strong
                  >{{ t("gmvMaxSopOnboarding.autoStarted") }}</span
                ><span
                  ><strong>{{
                    sopWorkspace.autoOnboarding.waitingForSalesData
                  }}</strong
                  >{{ t("gmvMaxSopOnboarding.waitingData") }}</span
                >
              </div>
              <button
                type="button"
                class="gmv-icon-button"
                :title="t('common.cancel')"
                @click="closeSopPicker"
              >
                <X />
              </button>
            </div>
          </header>
          <div class="gmv-sop-picker__toolbar">
            <label
              ><Search /><input
                ref="sopPickerSearch"
                v-model="sopPickerQuery"
                type="search"
                :placeholder="t('gmvMaxSopUi.pickerSearch')" /></label
            ><select
              v-model="sopPickerStore"
              :aria-label="t('gmvMaxSopUi.storeFilter')"
            >
              <option value="all">{{ t("gmvMaxSopUi.allStores") }}</option>
              <option
                v-for="store in sopPickerStores"
                :key="store"
                :value="store"
              >
                {{ store }}
              </option></select
            ><span
              >{{ filteredSopInstances.length }}
              {{ t("gmvMaxSopUi.objectsUnit") }}</span
            >
          </div>
          <div v-if="filteredSopInstances.length" class="gmv-sop-picker__list">
            <article
              v-for="item in filteredSopInstances"
              :key="item.id"
              :data-sop-instance-id="item.id"
              :class="{ 'is-selected': item.id === selectedSopId }"
            >
              <button
                type="button"
                class="gmv-sop-picker__item"
                @click="selectSopInstance(item.id)"
              >
                <span class="gmv-sop-picker__image"
                  ><Package /><img
                    v-if="item.productImageUrl"
                    :src="item.productImageUrl"
                    :alt="
                      item.productName || item.productId || item.campaignName
                    "
                    loading="lazy"
                    @error="hideBrokenSopImage"
                /></span>
                <span class="gmv-sop-picker__identity"
                  ><span
                    ><i>{{
                      t(`gmvMaxMature.tracks.${item.track || "new_product"}`)
                    }}</i
                    ><i v-if="item.id === selectedSopId" class="is-selected">{{
                      t("gmvMaxSopUi.currentlySelected")
                    }}</i></span
                  ><strong
                    :title="
                      item.productName ||
                      item.productId ||
                      t('gmvMaxSop.liveScope')
                    "
                    >{{
                      item.productName ||
                      item.productId ||
                      t("gmvMaxSop.liveScope")
                    }}</strong
                  ><small
                    >{{ t("gmvMaxSopUi.productIdLabel") }}
                    {{ item.productId || t("gmvMaxSopUi.notAvailable") }}</small
                  ></span
                >
                <span class="gmv-sop-picker__campaign">
                  <small>{{ t("gmvMaxSopUi.campaignLabel") }}</small>
                  <strong :title="item.campaignName">{{
                    item.campaignName
                  }}</strong>
                  <span class="gmv-sop-picker__meta">
                    <i class="is-store"
                      ><Store /><span
                        ><small>{{ t("gmvMaxAdvanced.fields.store") }}</small
                        ><b>{{ item.storeName }}</b></span
                      ></i
                    >
                    <i
                      :class="
                        sopPickerOperationTone(item.campaignOperationStatus)
                      "
                      ><Activity /><span
                        ><small
                          >{{ t("gmvMax.fields.campaign") }}
                          {{ t("gmvMax.fields.status") }}</small
                        ><b>{{
                          operationStatusLabel(item.campaignOperationStatus)
                        }}</b></span
                      ></i
                    >
                    <i :class="sopPickerStatusTone(item.status)"
                      ><ShieldCheck /><span
                        ><small>SOP {{ t("gmvMax.fields.status") }}</small
                        ><b>{{ t(`gmvMaxSop.status.${item.status}`) }}</b></span
                      ></i
                    >
                  </span>
                </span>
                <ChevronRight />
              </button>
              <button
                v-if="item.productId"
                type="button"
                class="gmv-sop-picker__copy"
                :title="t('gmvMaxSopUi.copyProductId')"
                @click="copySopIdentifier(item.productId)"
              >
                <Copy />
              </button>
            </article>
          </div>
          <div v-else class="gmv-sop-picker__empty">
            <Search /><strong>{{ t("gmvMaxSopUi.noMatchingObjects") }}</strong
            ><small>{{ t("gmvMaxSopUi.noMatchingObjectsHint") }}</small>
          </div>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="externalOperationIssue"
        class="gmv-external-operation-overlay"
        data-testid="gmv-external-operation-overlay"
        @click.self="closeExternalOperation"
      >
        <section
          class="gmv-external-operation"
          role="dialog"
          aria-modal="true"
          :aria-label="issueText(externalOperationIssue, 'title')"
        >
          <header>
            <div>
              <span>{{ t("gmvMaxIssueResolutions.externalEyebrow") }}</span>
              <h2>{{ issueText(externalOperationIssue, "title") }}</h2>
              <p>
                {{
                  selectedSop?.productName ||
                  selectedSop?.productId ||
                  t("gmvMaxSop.liveScope")
                }}
                / {{ selectedSop?.campaignName }}
              </p>
            </div>
            <button
              class="gmv-icon-button"
              :disabled="!!busyAction"
              @click="closeExternalOperation"
            >
              <X />
            </button>
          </header>
          <div class="gmv-external-operation__solution">
            <ShieldAlert />
            <div>
              <strong>{{
                issueText(externalOperationIssue, "solution")
              }}</strong
              ><span>{{
                issueText(externalOperationIssue, "completion")
              }}</span>
            </div>
          </div>
          <ol>
            <li v-for="step in externalOperationIssue.steps" :key="step">
              {{ t(`gmvMaxIssueResolutions.steps.${step}`) }}
            </li>
          </ol>
          <div class="gmv-external-operation__tools">
            <button
              class="gmv-button gmv-button--secondary"
              @click="openSellerCenter"
            >
              <ExternalLink class="gmv-icon" />{{
                t("gmvMaxIssueResolutions.openSellerCenter")
              }}</button
            ><button
              class="gmv-button gmv-button--ghost"
              @click="copyExternalChecklist"
            >
              <Copy class="gmv-icon" />{{
                t("gmvMaxIssueResolutions.copyChecklist")
              }}
            </button>
          </div>
          <div class="gmv-external-operation__form">
            <label
              ><span>{{ t("gmvMaxIssueResolutions.operationDate") }}</span
              ><input v-model="externalOperationDraft.startedDate" type="date"
            /></label>
            <label
              ><span>{{ t("gmvMaxIssueResolutions.actualValue") }}</span
              ><input
                v-model="externalOperationDraft.actualValue"
                data-testid="gmv-external-actual-value"
                :placeholder="
                  externalOperationIssue.targetValue ||
                  t('gmvMaxSopUi.notAvailable')
                "
            /></label>
            <label class="is-wide"
              ><span>{{ t("gmvMaxIssueResolutions.evidenceNote") }}</span
              ><textarea
                v-model="externalOperationDraft.evidenceNote"
                data-testid="gmv-external-evidence"
                :placeholder="t('gmvMaxIssueResolutions.evidencePlaceholder')"
              ></textarea>
            </label>
            <div class="gmv-evidence-picker is-wide">
              <span>{{ t("gmvMaxOperations.evidenceImage") }}</span>
              <div>
                <img
                  v-if="externalOperationDraft.evidenceAttachment"
                  :src="
                    evidencePreview(
                      externalOperationDraft.evidenceAttachment.path,
                    )
                  "
                  alt="evidence"
                /><button
                  class="gmv-button gmv-button--secondary"
                  type="button"
                  @click="selectExternalEvidence"
                >
                  <Upload class="gmv-icon" />{{
                    t("gmvMaxOperations.chooseImage")
                  }}</button
                ><small v-if="externalOperationDraft.evidenceAttachment">{{
                  externalOperationDraft.evidenceAttachment.name
                }}</small>
              </div>
            </div>
          </div>
          <footer>
            <span
              ><LockKeyhole />{{
                externalOperationIssue.code === "external_verification_pending"
                  ? t("gmvMaxOperations.verificationHint")
                  : t("gmvMaxOperations.pendingHint")
              }}</span
            >
            <div>
              <button
                class="gmv-button gmv-button--secondary"
                :disabled="!!busyAction"
                @click="closeExternalOperation"
              >
                {{ t("common.cancel") }}</button
              ><button
                class="gmv-button gmv-button--primary"
                data-testid="gmv-external-submit"
                :disabled="
                  !!busyAction ||
                  !externalOperationDraft.actualValue.trim() ||
                  !externalOperationDraft.evidenceNote.trim()
                "
                @click="submitExternalOperation"
              >
                <Check class="gmv-icon" />{{
                  externalOperationIssue.code ===
                  "external_verification_pending"
                    ? t("gmvMaxOperations.confirmVerification")
                    : t("gmvMaxOperations.submitEvidence")
                }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="syncProgress"
        class="gmv-sync-status"
        data-testid="gmv-sync-progress-overlay"
      >
        <button
          class="gmv-sync-status__main"
          type="button"
          data-testid="gmv-sync-progress-dialog"
          :aria-label="syncProgressTitle"
          @click="syncDetailsOpen = true"
        >
          <span
            :class="[
              'gmv-sync-status__signal',
              {
                'is-complete': syncProgress.status === 'completed',
                'is-failed': syncNeedsRecovery,
              },
            ]"
          >
            <Check v-if="syncProgress.status === 'completed'" />
            <X v-else-if="syncNeedsRecovery" />
            <Activity v-else />
          </span>
          <span class="gmv-sync-status__copy"
            ><strong>{{ syncProgressTitle }}</strong
            ><small>{{ syncProgressDescription }}</small></span
          >
          <span class="gmv-sync-status__progress"
            ><b>{{ syncVisibleProgress }}%</b
            ><i
              ><em
                :class="{
                  'is-failed': syncNeedsRecovery,
                  'is-running': syncProgress.status === 'running',
                }"
                :style="{ width: `${syncVisibleProgress}%` }"
              ></em></i
          ></span>
          <ChevronRight class="gmv-icon" />
        </button>
        <button
          v-if="syncNeedsRecovery"
          class="gmv-sync-status__retry"
          type="button"
          :title="t('gmvMaxSop.actions.retry')"
          @click="retrySync"
        >
          <RotateCcw class="gmv-icon" />
        </button>
      </div>
      <div
        v-if="syncDetailsOpen && syncProgress"
        class="gmv-sync-detail-backdrop"
        data-testid="gmv-sync-detail-backdrop"
        @click.self="syncDetailsOpen = false"
      >
        <aside
          ref="syncProgressDialog"
          class="gmv-sync-detail"
          role="dialog"
          aria-modal="true"
          :aria-label="syncProgressTitle"
        >
          <header>
            <div>
              <span>{{ t("gmvMaxSyncProgress.eyebrow") }}</span>
              <h2>{{ syncProgressTitle }}</h2>
              <p>{{ syncProgressDescription }}</p>
            </div>
            <button
              class="gmv-icon-button"
              type="button"
              :title="t('common.cancel')"
              @click="syncDetailsOpen = false"
            >
              <X />
            </button>
          </header>
          <div class="gmv-sync-detail__body">
            <div class="gmv-sync-detail__percent">
              <strong>{{ syncVisibleProgress }}%</strong
              ><span>{{
                syncProgress.message || syncProgressDescription
              }}</span>
            </div>
            <div
              class="gmv-sync-dialog__track"
              role="progressbar"
              :aria-valuenow="syncVisibleProgress"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span
                :class="{
                  'is-failed': syncNeedsRecovery,
                  'is-running': syncProgress.status === 'running',
                }"
                :style="{ width: `${syncVisibleProgress}%` }"
              ></span>
            </div>
            <div class="gmv-sync-dialog__steps">
              <div
                v-for="(step, index) in syncProgressSteps"
                :key="step"
                :class="syncStepClass(index)"
              >
                <span
                  ><Check v-if="syncStepClass(index) === 'is-complete'" /><X
                    v-else-if="syncStepClass(index) === 'is-failed'" /><Clock3
                    v-else
                /></span>
                <div>
                  <small>{{ String(index + 1).padStart(2, "0") }}</small
                  ><strong>{{ step }}</strong>
                </div>
              </div>
            </div>
            <div v-if="syncNeedsRecovery" class="gmv-sync-dialog__error">
              <ShieldAlert /><span>{{ syncProgress.error || errorText }}</span>
            </div>
            <dl class="gmv-sync-detail__meta">
              <div>
                <dt>{{ t("gmvMaxSyncProgress.currentObject") }}</dt>
                <dd>
                  {{ syncProgress.message || t("gmvMaxSopUi.notAvailable") }}
                </dd>
              </div>
              <div>
                <dt>{{ t("gmvMaxSyncProgress.lastUpdated") }}</dt>
                <dd>{{ formatDate(syncProgress.updatedAt) }}</dd>
              </div>
              <div>
                <dt>{{ t("gmvMaxSyncProgress.jobId") }}</dt>
                <dd>
                  {{ syncProgress.jobId || t("gmvMaxSopUi.notAvailable") }}
                </dd>
              </div>
            </dl>
          </div>
          <footer>
            <span
              ><LockKeyhole />{{
                syncNeedsRecovery
                  ? t("gmvMaxSyncProgress.failedAccess")
                  : t("gmvMaxSyncProgress.backgroundHint")
              }}</span
            >
            <div>
              <button
                v-if="syncNeedsRecovery"
                class="gmv-button gmv-button--secondary"
                @click="dismissSyncFailure"
              >
                {{ t("gmvMaxSyncProgress.dismiss") }}</button
              ><button
                v-if="syncNeedsRecovery"
                class="gmv-button gmv-button--primary"
                @click="retrySync"
              >
                <RotateCcw class="gmv-icon" />{{ t("gmvMaxSop.actions.retry") }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="imagePreview"
        class="gmv-image-preview"
        data-testid="gmv-product-image-preview"
        @click.self="closeProductImage"
      >
        <section
          role="dialog"
          aria-modal="true"
          :aria-label="t('gmvMaxProductImage.preview')"
        >
          <header>
            <div>
              <strong>{{ imagePreview.title }}</strong
              ><small>{{ imagePreview.productId }}</small>
            </div>
            <button
              class="gmv-icon-button"
              type="button"
              :title="t('gmvMaxProductImage.close')"
              @click="closeProductImage"
            >
              <X />
            </button>
          </header>
          <div class="gmv-image-preview__stage">
            <img
              :src="imagePreview.url"
              :alt="imagePreview.title"
              @error="closeProductImage"
            />
          </div>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="creativeVideoPreview"
        class="gmv-image-preview gmv-video-preview"
        data-testid="gmv-creative-video-preview"
        @click.self="closeCreativeVideo"
      >
        <section
          role="dialog"
          aria-modal="true"
          :aria-label="t('gmvMaxVideoPreview.title')"
        >
          <header>
            <div>
              <strong>{{ creativeVideoPreview.title }}</strong
              ><small
                >{{ creativeVideoPreview.creativeId }} /
                {{ t("gmvMaxVideoPreview.lazyHint") }}</small
              >
            </div>
            <div class="gmv-row__actions">
              <button
                class="gmv-button gmv-button--secondary"
                type="button"
                @click="openCreativeVideoExternal"
              >
                <ArrowUpRight class="gmv-icon" />{{
                  t("gmvMaxVideoPreview.openBrowser")
                }}</button
              ><button
                class="gmv-icon-button"
                type="button"
                :title="t('gmvMaxVideoPreview.close')"
                @click="closeCreativeVideo"
              >
                <X />
              </button>
            </div>
          </header>
          <div class="gmv-image-preview__stage gmv-video-preview__stage">
            <iframe
              v-if="creativeVideoPreview.embedded"
              class="gmv-video-preview__player"
              :src="creativeVideoPreview.url"
              :title="creativeVideoPreview.title"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
            ></iframe>
            <video
              v-else
              class="gmv-video-preview__player"
              controls
              autoplay
              playsinline
              preload="metadata"
              :src="creativeVideoPreview.url"
            />
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.gmv-workspace {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 100%;
  padding: 0;
  border: 0 !important;
  border-radius: 0 !important;
  color: var(--theme-text, #f5f7fa);
  background: var(--theme-shell, #0d1117) !important;
  box-shadow: none !important;
  box-sizing: border-box;
  overflow-x: clip;
}
.gmv-sync-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(5, 9, 16, 0.82);
  backdrop-filter: blur(10px) saturate(0.8);
}
.gmv-sync-dialog {
  position: relative;
  width: min(620px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid #344253;
  border-radius: 8px;
  outline: none;
  background: #0f1620;
  color: #f3f6fa;
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.54),
    0 0 0 1px rgba(255, 255, 255, 0.025) inset;
}
.gmv-sync-dialog__accent {
  height: 3px;
  background: linear-gradient(
    90deg,
    #ef405f 0 20%,
    #23c9b5 20% 72%,
    #55c7da 72% 100%
  );
}
.gmv-sync-dialog__header {
  padding: 26px 28px 22px;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}
.gmv-sync-dialog__signal {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(35, 201, 181, 0.42);
  border-radius: 8px;
  background: rgba(35, 201, 181, 0.1);
  color: #5eead4;
}
.gmv-sync-dialog__signal svg {
  width: 25px;
  height: 25px;
  animation: gmv-sync-pulse 1.4s ease-in-out infinite;
}
.gmv-sync-dialog__signal.is-complete {
  border-color: rgba(72, 211, 154, 0.48);
  background: rgba(72, 211, 154, 0.11);
  color: #6ee7b7;
}
.gmv-sync-dialog__signal.is-failed {
  border-color: rgba(239, 64, 95, 0.5);
  background: rgba(239, 64, 95, 0.12);
  color: #ff6b82;
}
.gmv-sync-dialog__signal.is-complete svg,
.gmv-sync-dialog__signal.is-failed svg {
  animation: none;
}
.gmv-sync-dialog__header span {
  display: block;
  margin-bottom: 5px;
  color: #52d3c0;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}
.gmv-sync-dialog__header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
}
.gmv-sync-dialog__header p {
  min-height: 20px;
  margin: 7px 0 0;
  color: #8f9cad;
  font-size: 11px;
  line-height: 1.55;
}
.gmv-sync-dialog__header > strong {
  align-self: start;
  color: #dbe4ee;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.gmv-sync-dialog__track {
  height: 4px;
  margin: 0 28px;
  overflow: hidden;
  border-radius: 2px;
  background: #202a36;
}
.gmv-sync-dialog__track > span {
  position: relative;
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #23c9b5;
  box-shadow: 0 0 18px rgba(35, 201, 181, 0.45);
  transition: width 0.35s ease;
  overflow: hidden;
}
.gmv-sync-dialog__track > span.is-running::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: gmv-sync-progress-shimmer 1.35s linear infinite;
}
.gmv-sync-dialog__track > span.is-failed {
  background: #ef405f;
  box-shadow: 0 0 18px rgba(239, 64, 95, 0.42);
}
@keyframes gmv-sync-progress-shimmer {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
.gmv-sync-dialog__steps {
  padding: 24px 28px 26px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.gmv-sync-dialog__steps > div {
  min-width: 0;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  color: #667487;
}
.gmv-sync-dialog__steps > div:not(:last-child) {
  padding-right: 14px;
  border-right: 1px solid #26313e;
}
.gmv-sync-dialog__steps > div:not(:first-child) {
  padding-left: 14px;
}
.gmv-sync-dialog__steps > div > span {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid #334050;
  border-radius: 50%;
  background: #151e29;
}
.gmv-sync-dialog__steps svg {
  width: 14px;
  height: 14px;
}
.gmv-sync-dialog__steps small,
.gmv-sync-dialog__steps strong {
  display: block;
}
.gmv-sync-dialog__steps small {
  margin-bottom: 3px;
  color: #596779;
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}
.gmv-sync-dialog__steps strong {
  overflow-wrap: anywhere;
  color: #7d8a9b;
  font-size: 10px;
  line-height: 1.35;
}
.gmv-sync-dialog__steps > div.is-active > span {
  border-color: #23c9b5;
  background: rgba(35, 201, 181, 0.1);
  color: #5eead4;
  box-shadow: 0 0 0 4px rgba(35, 201, 181, 0.07);
}
.gmv-sync-dialog__steps > div.is-active strong {
  color: #d9f9f4;
}
.gmv-sync-dialog__steps > div.is-complete > span {
  border-color: rgba(72, 211, 154, 0.5);
  background: rgba(72, 211, 154, 0.1);
  color: #6ee7b7;
}
.gmv-sync-dialog__steps > div.is-complete strong {
  color: #b7c4d2;
}
.gmv-sync-dialog__steps > div.is-failed > span {
  border-color: rgba(239, 64, 95, 0.55);
  background: rgba(239, 64, 95, 0.1);
  color: #ff6b82;
}
.gmv-sync-dialog__steps > div.is-failed strong {
  color: #ff9aaa;
}
.gmv-sync-dialog > footer {
  min-height: 48px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #26313e;
  background: #0b1119;
  color: #9aa7b8;
  font-size: 10px;
}
.gmv-sync-dialog > footer svg {
  width: 14px;
  height: 14px;
  color: #ef6078;
}
.gmv-sync-dialog > footer small {
  margin-left: auto;
  color: #657386;
}
.gmv-sync-dialog > footer > div {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.gmv-sync-dialog > footer .gmv-button {
  min-height: 32px;
  padding: 6px 12px;
}
.gmv-sync-dialog__error {
  margin: 0 28px 22px;
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border: 1px solid rgba(239, 64, 95, 0.35);
  border-radius: 6px;
  background: rgba(239, 64, 95, 0.08);
  color: #ff9aaa;
  font-size: 11px;
  line-height: 1.5;
}
.gmv-sync-dialog__error svg {
  width: 16px;
  flex: 0 0 16px;
}

.gmv-sop {
  display: grid;
  gap: 16px;
}
.gmv-section__heading.gmv-sop-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
}
.gmv-sop-heading > div:first-child {
  min-width: 0;
}
.gmv-sop-heading .gmv-row__actions {
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.gmv-sop-heading .gmv-kicker {
  display: none;
}
.gmv-sop-heading h2 {
  margin: 0 0 5px;
  font-size: 22px;
}
.gmv-sop-heading p {
  max-width: 720px;
  font-size: 12px;
  line-height: 1.55;
}
.gmv-decision-center {
  display: grid;
  gap: 10px;
}
.gmv-growth-cycle-actions {
  min-height: 44px;
  margin-bottom: 10px;
  display: flex;
  justify-content: flex-end;
}
.gmv-growth-cycle-actions .gmv-row__actions {
  justify-content: flex-end;
}
.gmv-decision-scope {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--theme-panel) 90%, var(--theme-root));
}
.gmv-decision-scope__stores {
  min-width: 0;
  padding: 7px 12px;
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
.gmv-decision-scope__label {
  min-width: 0;
  padding: 0 12px 0 2px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-right: 1px solid var(--theme-divider);
  color: var(--theme-text-secondary);
}
.gmv-decision-scope__label > span {
  flex: 1 1 auto;
}
.gmv-decision-scope__label > .gmv-icon-button {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
}
.gmv-decision-scope__label > svg {
  width: 18px;
  height: 18px;
  color: var(--theme-accent);
}
.gmv-decision-scope__label span,
.gmv-decision-scope__label strong,
.gmv-decision-scope__label small {
  min-width: 0;
  display: block;
}
.gmv-decision-scope__label strong {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-decision-scope__label small {
  margin-top: 3px;
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-decision-store-tabs {
  min-width: 0;
  display: grid;
  grid-auto-columns: minmax(132px, 1fr);
  grid-auto-flow: column;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.gmv-decision-store-tabs button {
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--theme-text-muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-decision-store-tabs button:hover {
  background: var(--theme-control-hover);
  color: var(--theme-text-secondary);
}
.gmv-decision-store-tabs button.is-active {
  border-color: color-mix(
    in srgb,
    var(--theme-accent) 40%,
    var(--theme-border-control)
  );
  background: color-mix(
    in srgb,
    var(--theme-accent) 9%,
    var(--theme-control-selected)
  );
  color: var(--theme-text);
  box-shadow: inset 0 -2px 0 var(--theme-accent);
}
.gmv-decision-store-tabs button > svg {
  width: 15px;
  height: 15px;
}
.gmv-decision-store-tabs button.is-active > svg {
  color: var(--theme-accent);
}
.gmv-decision-store-tabs button span,
.gmv-decision-store-tabs button strong,
.gmv-decision-store-tabs button small {
  min-width: 0;
  display: block;
}
.gmv-decision-store-tabs button strong {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-decision-store-tabs button small {
  margin-top: 2px;
  color: var(--theme-text-muted);
  font-size: 8px;
  white-space: nowrap;
}
.gmv-decision-scope__filters {
  min-width: 0;
  min-height: 42px;
  padding: 5px 12px;
  display: flex;
  align-items: center;
  gap: 18px;
  border-top: 1px solid var(--theme-divider);
  background: color-mix(in srgb, var(--theme-input) 42%, transparent);
}
.gmv-decision-scope-filter {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gmv-decision-scope-filter > span {
  color: var(--theme-text-muted);
  font-size: 9px;
  white-space: nowrap;
}
.gmv-decision-scope-filter > div {
  padding: 2px;
  display: flex;
  gap: 3px;
  border: 1px solid var(--theme-border-control);
  border-radius: 5px;
  background: var(--theme-input);
}
.gmv-decision-scope-filter button {
  min-width: 58px;
  height: 26px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.gmv-decision-scope-filter button:hover {
  color: var(--theme-text);
  background: var(--theme-control-hover);
}
.gmv-decision-scope-filter button.is-active {
  color: var(--theme-text);
  background: var(--theme-control-selected);
  box-shadow: inset 0 0 0 1px var(--theme-border-control);
}
.gmv-decision-scope-filter button.is-enabled.is-active {
  color: #57d6a0;
}
.gmv-decision-scope-filter button.is-disabled.is-active {
  color: #ff8798;
}
.gmv-decision-scope-filter button svg {
  width: 12px;
  height: 12px;
}
.gmv-decision-scope__total {
  margin-left: auto;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  color: var(--theme-text-muted);
  font-size: 9px;
  white-space: nowrap;
}
.gmv-decision-scope__total strong {
  color: var(--theme-text);
  font-size: 18px;
}
.gmv-today-status {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.gmv-today-status article {
  min-width: 0;
  min-height: 66px;
  padding: 9px 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 10px;
  align-items: center;
  border: 1px solid var(--theme-border);
  border-left: 3px solid var(--theme-border-control);
  border-radius: 6px;
  background: var(--theme-panel);
}
.gmv-today-status article.is-action {
  border-left-color: #ff5573;
}
.gmv-today-status article.is-observing {
  border-left-color: #f2bd58;
}
.gmv-today-status article.is-normal {
  border-left-color: #57d6a0;
}
.gmv-today-status article.is-suggested {
  border-left-color: #55a7ff;
}
.gmv-today-status article.is-freshness {
  border-left-color: #55d6c2;
}
.gmv-today-status span,
.gmv-today-status small {
  min-width: 0;
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-today-status strong {
  grid-row: 1 / 3;
  grid-column: 2;
  font-size: 23px;
  white-space: nowrap;
}
.gmv-today-status article.is-freshness strong {
  max-width: 112px;
  overflow: hidden;
  color: #6ee7d0;
  font-size: 13px;
  text-overflow: ellipsis;
}
.gmv-decision-workbench {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 0.36fr);
  gap: 10px;
  align-items: start;
}
.gmv-decision-table-panel {
  min-width: 0;
  overflow: hidden;
}
.gmv-today-plan {
  min-width: 0;
  overflow: hidden;
}
.gmv-today-plan__header {
  min-width: 0;
  padding: 15px 16px 13px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-today-plan__header > div {
  min-width: 0;
}
.gmv-today-plan__header h2 {
  margin: 4px 0 0;
  color: var(--theme-text);
  font-size: 18px;
}
.gmv-today-plan__header p {
  margin: 5px 0 0;
  color: var(--theme-text-muted);
  font-size: 10px;
  line-height: 1.45;
}
.gmv-today-plan__date {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--theme-text-muted);
  font-size: 10px;
  white-space: nowrap;
}
.gmv-today-plan__date svg {
  width: 13px;
  color: var(--theme-accent);
}
.gmv-today-plan__list {
  display: grid;
  gap: 1px;
  background: var(--theme-divider);
}
.gmv-today-plan__list button {
  min-width: 0;
  padding: 12px 11px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 14px;
  gap: 9px;
  align-items: center;
  border: 0;
  background: var(--theme-panel);
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-today-plan__list button:hover {
  background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-panel));
}
.gmv-today-plan__list button > svg {
  width: 14px;
  color: var(--theme-text-muted);
}
.gmv-today-plan__priority {
  width: 28px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 1px solid var(--theme-border-control);
  border-radius: 4px;
  color: var(--theme-text-muted);
  font-size: 10px;
  font-weight: 800;
}
.gmv-today-plan__list button.is-P0 .gmv-today-plan__priority {
  border-color: #ff5573;
  color: #ff8296;
  background: rgba(255, 85, 115, 0.08);
}
.gmv-today-plan__list button.is-P1 .gmv-today-plan__priority {
  border-color: #f2bd58;
  color: #f5ce75;
  background: rgba(242, 189, 88, 0.08);
}
.gmv-today-plan__list button.is-P2 .gmv-today-plan__priority {
  border-color: #57d6a0;
  color: #72e5b3;
  background: rgba(87, 214, 160, 0.08);
}
.gmv-today-plan__copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.gmv-today-plan__copy small,
.gmv-today-plan__copy strong,
.gmv-today-plan__copy em {
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-today-plan__copy small {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-today-plan__copy strong {
  color: var(--theme-text);
  font-size: 12px;
}
.gmv-today-plan__copy em {
  color: var(--theme-text-secondary);
  font-size: 10px;
  font-style: normal;
}
.gmv-decision-panel-heading {
  min-height: 60px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-decision-panel-heading h2 {
  margin: 0;
  font-size: 15px;
}
.gmv-decision-panel-heading p {
  margin: 5px 0 0;
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-decision-filters {
  flex: 0 0 auto;
  padding: 3px;
  display: flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--theme-border-control);
  border-radius: 6px;
  background: var(--theme-input);
}
.gmv-decision-filters button {
  min-width: 38px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 10px;
  font-weight: 750;
  cursor: pointer;
}
.gmv-decision-filters button:hover {
  color: var(--theme-text);
  background: var(--theme-control-hover);
}
.gmv-decision-filters button.is-active {
  color: var(--theme-text);
  background: var(--theme-control-selected);
  box-shadow: inset 0 0 0 1px var(--theme-border-control);
}
.gmv-decision-filters button.is-p0.is-active {
  color: #ff7288;
}
.gmv-decision-filters button.is-p1.is-active {
  color: #f2bd58;
}
.gmv-decision-filters button.is-p2.is-active {
  color: #57d6a0;
}
.gmv-decision-filters > span {
  min-width: 72px;
  padding: 0 8px;
  color: var(--theme-text-muted);
  font-size: 10px;
  text-align: center;
  white-space: nowrap;
}
.gmv-decision-grid {
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.gmv-decision-card {
  position: relative;
  min-width: 0;
  min-height: 156px;
  padding: 10px 36px 10px 10px;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 11px;
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-left: 3px solid var(--theme-border-control);
  border-radius: 7px;
  background: color-mix(
    in srgb,
    var(--theme-panel) 88%,
    var(--theme-panel-soft)
  );
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    transform 0.15s ease;
}
.gmv-decision-card:hover {
  border-color: color-mix(
    in srgb,
    var(--theme-accent) 45%,
    var(--theme-border)
  );
  background: color-mix(in srgb, var(--theme-accent) 6%, var(--theme-panel));
  transform: translateY(-1px);
}
.gmv-decision-card.is-selected {
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--theme-accent) 42%, transparent);
}
.gmv-decision-card.is-p0 {
  border-left-color: #ff5573;
}
.gmv-decision-card.is-p1 {
  border-left-color: #f2bd58;
}
.gmv-decision-card.is-p2 {
  border-left-color: #57d6a0;
}
.gmv-decision-card__media {
  position: relative;
  width: 76px;
  height: 96px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--theme-border-control);
  border-radius: 6px;
  background: #f6f7f9;
  color: #8490a0;
}
.gmv-decision-card__media > svg {
  width: 24px;
  height: 24px;
}
.gmv-decision-card__media img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #f6f7f9;
}
.gmv-decision-card__media i {
  position: absolute;
  left: 5px;
  top: 5px;
  min-width: 27px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 3px;
  background: rgba(9, 14, 22, 0.82);
  color: #fff;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  backdrop-filter: blur(4px);
}
.gmv-decision-card__content {
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 4px;
}
.gmv-decision-card__identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.gmv-decision-card__identity > small {
  min-width: 0;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-decision-card__identity > small svg {
  width: 11px;
  height: 11px;
  flex: 0 0 11px;
}
.gmv-decision-card__title {
  min-height: 30px;
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}
.gmv-decision-card__scope {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}
.gmv-decision-card__scope i {
  min-width: 0;
  height: 19px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  border: 1px solid var(--theme-border-control);
  border-radius: 3px;
  color: var(--theme-text-muted);
  font-size: 8px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-decision-card__scope i.is-type {
  color: var(--theme-text-secondary);
}
.gmv-decision-card__scope i.is-enabled {
  border-color: color-mix(in srgb, #57d6a0 38%, var(--theme-border-control));
  color: #57d6a0;
}
.gmv-decision-card__scope i.is-disabled {
  border-color: color-mix(in srgb, #ff7288 32%, var(--theme-border-control));
  color: #ff8798;
}
.gmv-decision-card__scope svg {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
}
.gmv-decision-card__metrics {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--theme-divider);
  border-radius: 5px;
  background: color-mix(in srgb, var(--theme-input) 70%, transparent);
}
.gmv-decision-card__metrics > span {
  min-width: 0;
  padding: 4px 6px;
  border-right: 1px solid var(--theme-divider);
}
.gmv-decision-card__metrics > span:nth-child(2n) {
  border-right: 0;
}
.gmv-decision-card__metrics > span:nth-child(-n + 2) {
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-decision-card__metrics small,
.gmv-decision-card__metrics strong,
.gmv-decision-card__metrics em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-decision-card__metrics small {
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-decision-card__metrics strong {
  margin-top: 2px;
  font-size: 11px;
}
.gmv-decision-card__metrics em {
  margin-top: 1px;
  color: var(--theme-text-muted);
  font-size: 8px;
  font-style: normal;
}
.gmv-decision-card__action {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gmv-decision-card__action > small {
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-decision-card__arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  width: 17px;
  height: 17px;
  color: var(--theme-text-muted);
  transform: translateY(-50%);
}
.gmv-decision-card .gmv-decision-status,
.gmv-decision-card .gmv-decision-action {
  min-height: 21px;
  padding: 2px 6px;
}
.gmv-decision-pagination {
  min-height: 44px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--theme-divider);
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-decision-pagination > div {
  display: flex;
  gap: 5px;
}
.gmv-decision-pagination button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--theme-border-control);
  border-radius: 4px;
  background: var(--theme-control);
  color: var(--theme-text-secondary);
  cursor: pointer;
}
.gmv-decision-pagination button:first-child svg {
  transform: rotate(180deg);
}
.gmv-decision-pagination button:disabled {
  cursor: default;
  opacity: 0.35;
}
.gmv-decision-pagination svg {
  width: 14px;
}
.gmv-decision-status,
.gmv-decision-action {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 3px 7px;
  border: 1px solid var(--theme-border-control);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}
.gmv-decision-status.is-s3,
.gmv-decision-status.is-s4,
.gmv-decision-action.is-p0 {
  border-color: #b7465d;
  color: #ff7288;
}
.gmv-decision-status.is-s5,
.gmv-decision-status.is-s6,
.gmv-decision-status.is-s7,
.gmv-decision-action.is-p1 {
  border-color: #8d6b2b;
  color: #f2bd58;
}
.gmv-decision-status.is-s2,
.gmv-decision-action.is-p2 {
  border-color: #278b69;
  color: #57d6a0;
}
.gmv-task-priority {
  margin-right: 7px;
  padding: 2px 5px;
  border-radius: 3px;
  background: var(--theme-panel-soft);
  font-size: 9px;
}
.gmv-task-priority.is-p0 {
  color: #ff7288;
}
.gmv-task-priority.is-p1 {
  color: #f2bd58;
}
.gmv-task-priority.is-p2 {
  color: #57d6a0;
}
@media (max-width: 1100px) {
  .gmv-decision-scope__stores {
    grid-template-columns: 112px minmax(0, 1fr);
  }
  .gmv-decision-scope__filters {
    gap: 10px;
  }
  .gmv-decision-scope-filter {
    gap: 5px;
  }
  .gmv-today-status {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-decision-panel-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .gmv-decision-filters {
    align-self: stretch;
  }
  .gmv-decision-filters > span {
    margin-left: auto;
  }
  .gmv-decision-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 1350px) {
  .gmv-decision-workbench {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .gmv-decision-scope__stores {
    grid-template-columns: 1fr;
  }
  .gmv-decision-scope__label {
    padding: 0 0 8px;
    border-right: 0;
    border-bottom: 1px solid var(--theme-divider);
  }
  .gmv-decision-scope__filters {
    align-items: flex-start;
    flex-direction: column;
  }
  .gmv-decision-scope__total {
    margin-left: 0;
  }
  .gmv-today-status {
    grid-template-columns: 1fr;
  }
  .gmv-decision-card {
    grid-template-columns: 68px minmax(0, 1fr);
  }
  .gmv-decision-card__media {
    width: 68px;
    height: 92px;
  }
  .gmv-decision-card__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-decision-card__metrics > span:nth-child(2) {
    border-right: 0;
  }
  .gmv-decision-card__metrics > span:nth-child(-n + 2) {
    border-bottom: 1px solid var(--theme-divider);
  }
}
.gmv-sop-instance-select {
  flex: 1 1 360px;
  width: auto;
  max-width: 620px;
  min-width: 280px;
}
.gmv-sop-context {
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  border: 1px solid var(--theme-border);
  border-radius: 5px;
  overflow: hidden;
  background: var(--theme-panel-soft);
}
.gmv-sop-context span {
  padding: 8px 11px;
  color: var(--theme-text-muted);
  font-size: 9px;
  white-space: nowrap;
}
.gmv-sop-context span + span {
  border-left: 1px solid var(--theme-divider);
}
.gmv-sop-launch {
  min-height: 250px;
  display: grid;
  grid-template-columns: minmax(420px, 0.9fr) minmax(520px, 1.1fr);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--theme-panel);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--theme-root) 12%, transparent);
}
.gmv-sop-launch__route {
  padding: 24px 26px;
  border-right: 1px solid var(--theme-divider);
  background: var(--theme-panel-soft);
}
.gmv-sop-launch__eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gmv-sop-launch__eyebrow > svg {
  width: 26px;
  color: #ef6079;
}
.gmv-sop-launch__eyebrow span,
.gmv-sop-launch__eyebrow strong,
.gmv-sop-launch__eyebrow small {
  display: block;
}
.gmv-sop-launch__eyebrow small {
  color: #ef6079;
  font-size: 9px;
  font-weight: 800;
}
.gmv-sop-launch__eyebrow strong {
  margin-top: 4px;
  color: var(--theme-text);
  font-size: 17px;
}
.gmv-sop-launch__route > p {
  max-width: 560px;
  margin: 14px 0 20px;
  color: var(--theme-text-muted);
  font-size: 11px;
  line-height: 1.65;
}
.gmv-sop-launch__phases {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border-top: 1px solid var(--theme-divider);
  overflow: hidden;
}
.gmv-sop-launch__phases > div {
  min-width: 0;
  padding: 14px 8px 0 0;
  position: relative;
}
.gmv-sop-launch__phases > div:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 21px;
  right: 5px;
  width: calc(100% - 31px);
  height: 1px;
  background: var(--theme-border-control);
  transform: translateX(100%);
}
.gmv-sop-launch__phases span {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  position: relative;
  z-index: 1;
  border: 1px solid var(--theme-border-control);
  border-radius: 50%;
  background: var(--theme-panel);
  color: var(--theme-text-secondary);
  font-size: 8px;
}
.gmv-sop-launch__phases strong,
.gmv-sop-launch__phases small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-launch__phases strong {
  margin-top: 9px;
  color: var(--theme-text-secondary);
  font-size: 9px;
}
.gmv-sop-launch__phases small {
  margin-top: 3px;
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-sop-launch__form {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
}
.gmv-sop-launch__form > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-sop-launch__form > header div > span,
.gmv-sop-launch__form > header div > strong {
  display: block;
}
.gmv-sop-launch__form > header div > span {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-launch__form > header div > strong {
  margin-top: 4px;
  color: var(--theme-text);
  font-size: 14px;
}
.gmv-sop-launch__fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 10px;
}
.gmv-sop-launch__fields label {
  min-width: 0;
  display: grid;
  gap: 6px;
}
.gmv-sop-launch__fields label > span {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-launch__fields input,
.gmv-sop-launch__fields select {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--theme-border-control);
  border-radius: 4px;
  background: var(--theme-input);
  color: var(--theme-text);
  box-sizing: border-box;
}
.gmv-sop-launch__fields select:disabled {
  color: var(--theme-text-muted);
  cursor: not-allowed;
}
.gmv-sop-launch__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-sop-launch__footer > span {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #e2b45a;
  font-size: 10px;
  line-height: 1.45;
}
.gmv-sop-launch__footer > span.is-ready {
  color: #62d8b5;
}
.gmv-sop-launch__footer > span svg {
  width: 14px;
  flex: 0 0 14px;
}
.gmv-sop-launch__footer .gmv-button {
  min-width: 132px;
}
.gmv-sop-readiness {
  min-height: 108px;
  padding: 18px 22px;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(420px, 1fr);
  gap: 24px;
  align-items: center;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-panel);
}
.gmv-sop-readiness > div {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gmv-sop-readiness > div > svg {
  width: 24px;
  color: var(--theme-text-muted);
}
.gmv-sop-readiness strong,
.gmv-sop-readiness small {
  display: block;
}
.gmv-sop-readiness strong {
  color: var(--theme-text);
  font-size: 13px;
}
.gmv-sop-readiness small {
  margin-top: 5px;
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-sop-readiness dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.gmv-sop-readiness dl > div {
  padding: 4px 16px;
  border-left: 1px solid var(--theme-divider);
}
.gmv-sop-readiness dt {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-readiness dd {
  margin: 6px 0 0;
  color: var(--theme-text);
  font-size: 17px;
  font-weight: 800;
}
.gmv-sop-hero {
  display: grid;
  grid-template-columns: minmax(280px, 1.2fr) auto minmax(420px, 1.5fr);
  gap: 24px;
  align-items: center;
  padding: 22px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-panel);
}
.gmv-sop-hero > div:first-child {
  min-width: 0;
}
.gmv-sop-hero > div:first-child > span {
  color: #52d3c0;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}
.gmv-sop-hero h3 {
  margin: 6px 0 4px;
  overflow: hidden;
  color: var(--theme-text);
  font-size: 18px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.gmv-sop-hero p {
  margin: 0;
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 11px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.gmv-sop-hero__day {
  min-width: 100px;
  text-align: center;
}
.gmv-sop-hero__day small,
.gmv-sop-hero__day strong {
  display: block;
}
.gmv-sop-hero__day strong {
  margin: 2px 0 8px;
  color: #f4c95d;
  font-size: 32px;
}
.gmv-sop-hero dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(90px, 1fr));
}
.gmv-sop-hero dl > div {
  padding: 4px 16px;
  border-left: 1px solid var(--theme-divider);
}
.gmv-sop-hero dt {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-hero dd {
  margin: 6px 0 0;
  color: var(--theme-text);
  font-size: 15px;
  font-weight: 800;
}
.gmv-sop-rail {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--theme-panel);
}
.gmv-sop-rail > div {
  position: relative;
  min-width: 0;
  min-height: 106px;
  padding: 14px 8px;
  display: grid;
  grid-template-rows: 32px auto auto;
  gap: 5px;
  place-items: center;
  align-content: center;
  color: var(--theme-text-muted);
  text-align: center;
}
.gmv-sop-rail > div:not(:last-child) {
  border-right: 1px solid var(--theme-divider);
}
.gmv-sop-rail span {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--theme-border-control);
  border-radius: 50%;
  font-size: 10px;
}
.gmv-sop-rail strong,
.gmv-sop-rail small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-rail strong {
  width: 100%;
  color: var(--theme-text-secondary);
  font-size: 12px;
}
.gmv-sop-rail small {
  font-size: 9px;
}
.gmv-sop-rail > div.is-complete {
  background: rgba(35, 201, 181, 0.04);
}
.gmv-sop-rail > div.is-complete span {
  border-color: rgba(72, 211, 154, 0.45);
  color: #6ee7b7;
}
.gmv-sop-rail > div.is-active {
  background: rgba(35, 201, 181, 0.1);
  box-shadow: inset 0 3px #23c9b5;
}
.gmv-sop-rail > div.is-active span {
  border-color: #23c9b5;
  background: rgba(35, 201, 181, 0.12);
  color: #5eead4;
}
.gmv-sop-rail > div.is-active strong {
  color: var(--theme-control-selected-text);
}
.gmv-sop-blockers {
  padding: 16px 18px;
  display: flex;
  gap: 12px;
  border: 1px solid
    color-mix(in srgb, var(--theme-danger) 55%, var(--theme-border));
  border-left: 3px solid var(--theme-danger);
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--theme-danger-soft) 45%,
    var(--theme-panel)
  );
  color: var(--theme-danger-text);
}
.gmv-sop-blockers > svg {
  width: 18px;
  flex: 0 0 18px;
}
.gmv-sop-blockers strong {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
}
.gmv-sop-blockers span {
  display: inline-block;
  margin: 0 10px 4px 0;
  color: var(--theme-danger-text);
  font-size: 10px;
}
.gmv-sop-resolution {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 16px 18px;
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-left: 3px solid var(--theme-danger);
  border-radius: 8px;
  background: var(--theme-panel);
  box-sizing: border-box;
}
.gmv-sop-resolution > header,
.gmv-sop-resolution__main,
.gmv-sop-resolution details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-sop-resolution > header small {
  min-width: 0;
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-resolution__main {
  margin-top: 13px;
  align-items: flex-start;
}
.gmv-sop-resolution__main > div {
  min-width: 0;
}
.gmv-sop-resolution__main h3 {
  margin: 0;
  color: var(--theme-text);
  font-size: 17px;
}
.gmv-sop-resolution__main p {
  margin: 6px 0 0;
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.55;
}
.gmv-sop-resolution dl {
  margin: 14px 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--theme-divider);
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-sop-resolution dl div {
  min-width: 0;
  padding: 10px 12px;
}
.gmv-sop-resolution dl div:not(:last-child) {
  border-right: 1px solid var(--theme-divider);
}
.gmv-sop-resolution dt {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-resolution dd {
  min-height: 30px;
  margin: 5px 0 0;
  color: var(--theme-text);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: normal;
}
.gmv-sop-resolution__solution {
  margin-top: 11px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
}
.gmv-sop-resolution__solution strong {
  grid-row: 1 / 3;
  color: var(--theme-accent);
  font-size: 10px;
}
.gmv-sop-resolution__solution span {
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.5;
}
.gmv-sop-resolution__solution small {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-resolution details {
  margin-top: 12px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-sop-resolution details summary {
  padding-top: 11px;
  color: var(--theme-text-secondary);
  font-size: 10px;
  cursor: pointer;
}
.gmv-sop-resolution details summary span {
  color: var(--theme-text-muted);
  font-variant-numeric: tabular-nums;
}
.gmv-sop-resolution-groups {
  margin-top: 10px;
  display: grid;
  gap: 12px;
}
.gmv-sop-resolution-groups > section > header {
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gmv-sop-resolution-groups > section > header strong {
  color: var(--theme-text-secondary);
  font-size: 10px;
}
.gmv-sop-resolution-groups > section > header small {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-resolution-list {
  margin-top: 8px;
  display: grid;
  gap: 4px;
}
.gmv-sop-resolution-list__mark {
  width: 4px;
  height: 22px;
  border-radius: 2px;
  background: var(--theme-warning);
}
.gmv-sop-resolution-list__mark.is-must_fix {
  background: var(--theme-danger);
}
.gmv-sop-resolution-list__mark.is-observing {
  background: var(--theme-info);
}
.gmv-sop-resolution-list__mark.is-resolved {
  background: var(--theme-success);
}
.gmv-sop-resolution-list strong,
.gmv-sop-resolution-list small {
  display: block;
}
.gmv-sop-resolution-list strong {
  color: var(--theme-text);
  font-size: 10px;
}
.gmv-sop-resolution-list small {
  margin-top: 3px;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-resolution-item {
  margin: 0 !important;
  border: 1px solid var(--theme-divider) !important;
  border-radius: 5px;
}
.gmv-sop-resolution-item > summary {
  min-height: 44px;
  padding: 7px 9px !important;
  border: 0 !important;
}
.gmv-sop-resolution-item > summary > div {
  min-width: 0;
}
.gmv-sop-resolution-item > summary strong,
.gmv-sop-resolution-item > summary small {
  display: block;
}
.gmv-sop-resolution-item__body {
  padding: 0 10px 10px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-sop-resolution-item__body > p {
  margin: 9px 0;
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.55;
}
.gmv-sop-resolution-item__body dl {
  margin: 0;
  grid-template-columns: 1fr;
  border: 0;
}
.gmv-sop-resolution-item__body dl div {
  padding: 7px 0;
  border-right: 0 !important;
  border-top: 1px solid var(--theme-divider);
}
.gmv-store-issue-center {
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-panel);
}
.gmv-store-issue-center > summary {
  min-height: 42px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  list-style: none;
}
.gmv-store-issue-center > summary > span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-text);
}
.gmv-store-issue-center > summary svg {
  width: 15px;
  color: var(--theme-warning);
}
.gmv-store-issue-center > summary small {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-store-issue-center > div {
  padding: 0 8px 8px;
  display: grid;
  gap: 4px;
}
.gmv-store-issue-center > div > button {
  min-width: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  border-top: 1px solid var(--theme-divider);
  background: transparent;
  color: var(--theme-text);
  text-align: left;
  cursor: pointer;
}
.gmv-store-issue-center > div > button span {
  min-width: 0;
}
.gmv-store-issue-center > div > button strong,
.gmv-store-issue-center > div > button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-store-issue-center > div > button strong {
  font-size: 10px;
}
.gmv-store-issue-center > div > button small {
  margin-top: 3px;
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-store-issue-center > div > button > svg {
  width: 14px;
  flex: 0 0 14px;
}
.gmv-action-failure--drawer {
  margin: 16px 18px 0;
}
.gmv-action-failure {
  margin: 10px 0;
  padding: 11px 12px;
  display: flex;
  gap: 9px;
  border: 1px solid
    color-mix(in srgb, var(--theme-danger) 50%, var(--theme-border));
  border-radius: 6px;
  background: var(--theme-danger-soft);
  color: var(--theme-danger-text);
}
.gmv-action-failure > svg {
  width: 17px;
  flex: 0 0 17px;
}
.gmv-action-failure strong,
.gmv-action-failure span,
.gmv-action-failure small {
  display: block;
}
.gmv-action-failure span {
  margin-top: 4px;
  overflow-wrap: anywhere;
  font-size: 10px;
  line-height: 1.45;
}
.gmv-action-failure small {
  margin-top: 5px;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-external-operation-overlay {
  position: fixed;
  inset: 0;
  z-index: 10030;
  padding: 24px;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 15, 0.78);
  backdrop-filter: blur(8px);
}
.gmv-external-operation {
  width: min(720px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid var(--theme-border-strong);
  border-radius: 8px;
  background: var(--theme-panel);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.45);
}
.gmv-external-operation > header {
  padding: 20px 22px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-external-operation > header span {
  color: var(--theme-accent);
  font-size: 9px;
  font-weight: 800;
}
.gmv-external-operation > header h2 {
  margin: 5px 0 0;
  color: var(--theme-text);
  font-size: 19px;
}
.gmv-external-operation > header p {
  margin: 5px 0 0;
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-external-operation__solution {
  margin: 18px 22px 0;
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  border-left: 3px solid var(--theme-warning);
  background: var(--theme-panel-soft);
}
.gmv-external-operation__solution > svg {
  width: 18px;
  flex: 0 0 18px;
  color: var(--theme-warning);
}
.gmv-external-operation__solution strong,
.gmv-external-operation__solution span {
  display: block;
}
.gmv-external-operation__solution strong {
  color: var(--theme-text);
  font-size: 11px;
}
.gmv-external-operation__solution span {
  margin-top: 5px;
  color: var(--theme-text-muted);
  font-size: 9px;
  line-height: 1.5;
}
.gmv-external-operation ol {
  margin: 16px 22px;
  padding-left: 20px;
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.8;
}
.gmv-external-operation__tools {
  padding: 0 22px 16px;
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-external-operation__form {
  padding: 18px 22px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.gmv-external-operation__form label span {
  margin-bottom: 6px;
  display: block;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-external-operation__form input,
.gmv-external-operation__form textarea {
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--theme-border);
  border-radius: 5px;
  background: var(--theme-input);
  color: var(--theme-text);
}
.gmv-external-operation__form textarea {
  min-height: 72px;
  resize: vertical;
}
.gmv-external-operation__form .is-wide {
  grid-column: 1 / -1;
}
.gmv-evidence-picker > span {
  margin-bottom: 6px;
  display: block;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-evidence-picker > div {
  min-height: 48px;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px dashed var(--theme-border-strong);
  border-radius: 5px;
}
.gmv-evidence-picker img {
  width: 72px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
}
.gmv-evidence-picker small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--theme-text-muted);
}
.gmv-external-operation > footer {
  min-height: 64px;
  padding: 12px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-external-operation > footer > span {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-external-operation > footer > span svg {
  width: 14px;
}
.gmv-external-operation > footer > div {
  display: flex;
  gap: 8px;
}
.gmv-sop-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  overflow: hidden;
}
.gmv-sop-metrics article {
  min-width: 0;
  min-height: 78px;
  padding: 16px 18px;
  display: grid;
  align-content: center;
  background: var(--theme-panel);
}
.gmv-sop-metrics article:not(:nth-child(6n)) {
  border-right: 1px solid var(--theme-divider);
}
.gmv-sop-metrics article:nth-child(n + 7) {
  border-top: 1px solid var(--theme-divider);
}
.gmv-sop-metrics span,
.gmv-sop-metrics strong {
  display: block;
}
.gmv-sop-metrics span {
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-metrics strong {
  margin-top: 8px;
  color: var(--theme-text);
  font-size: 20px;
  line-height: 1;
}
.gmv-sop-metrics article.is-roi strong,
.gmv-sop-metrics article.is-netRoi strong {
  color: #5eead4;
}
.gmv-sop-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(360px, 0.7fr);
  gap: 16px;
}
.gmv-sop-task-list {
  display: grid;
}
.gmv-sop-task-list article {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 34px;
  gap: 14px;
  align-items: center;
  padding: 15px 2px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-sop-task-list time {
  color: #5eead4;
  font-size: 13px;
  font-weight: 800;
}
.gmv-sop-task-list time small {
  display: block;
  margin-top: 3px;
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-sop-task-list strong {
  color: var(--theme-text);
  font-size: 12px;
}
.gmv-sop-task-list p {
  margin: 5px 0 0;
  color: var(--theme-text-muted);
  font-size: 10px;
  line-height: 1.5;
}
.gmv-sop-task-list div > span {
  margin-top: 6px;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: #f4c95d;
  font-size: 9px;
}
.gmv-sop-task-list div > span svg {
  width: 12px;
}
.gmv-sop-task-list article.is-complete {
  opacity: 0.55;
}
.gmv-sop-task-list article.is-superseded {
  opacity: 0.48;
}
.gmv-sop-task-list article.is-external {
  border-left: 2px solid #f4c95d;
  padding-left: 10px;
}
.gmv-sop-task-done {
  width: 18px;
  color: #48d39a;
}
.gmv-sop-input__scope {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 180px) minmax(0, 140px);
  gap: 8px;
}
.gmv-sop-input__scope select,
.gmv-sop-input__scope input,
.gmv-sop-input__fields input,
.gmv-sop-input__controls select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.gmv-sop-input__fields {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.gmv-sop-input__controls {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.gmv-sop-input__fields label span,
.gmv-sop-input__controls label span {
  display: block;
  margin-bottom: 7px;
  color: var(--theme-text-muted);
  font-size: 10px;
  font-weight: 650;
}
.gmv-sop-input__fields input,
.gmv-sop-input__controls select {
  min-height: 40px;
}
.gmv-sop-input__actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.gmv-sop-source-note {
  margin: 14px 0 0;
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-source-note svg {
  width: 14px;
  color: #52d3c0;
}
.gmv-sop-grade-strip {
  margin-bottom: 14px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
}
.gmv-sop-grade-strip > div {
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  border-right: 1px solid var(--theme-divider);
}
.gmv-sop-grade-strip > div:last-child {
  border-right: 0;
}
.gmv-sop-grade-strip span {
  font-weight: 900;
}
.gmv-sop-grade-strip .is-s span,
.gmv-sop-grade.is-s {
  color: #48d39a;
}
.gmv-sop-grade-strip .is-a span,
.gmv-sop-grade.is-a {
  color: #55c7da;
}
.gmv-sop-grade-strip .is-b span,
.gmv-sop-grade.is-b {
  color: #e8b64f;
}
.gmv-sop-grade-strip .is-c span,
.gmv-sop-grade.is-c {
  color: #ef6079;
}
.gmv-sop-grade {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-weight: 900;
}
.gmv-mature-console {
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--theme-panel);
}
.gmv-sop-track-automation {
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--theme-panel);
}
.gmv-sop-track-automation > header {
  min-height: 72px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--theme-divider);
  background: var(--theme-panel-soft);
}
.gmv-sop-track-automation > header > div:first-child {
  min-width: 0;
}
.gmv-sop-track-automation > header span,
.gmv-sop-track-automation > header strong,
.gmv-sop-track-automation > header small {
  display: block;
}
.gmv-sop-track-automation > header span {
  color: #6fd6c5;
  font-size: 9px;
}
.gmv-sop-track-automation > header strong {
  margin-top: 4px;
  color: var(--theme-text);
  font-size: 17px;
}
.gmv-sop-track-automation > header small {
  margin-top: 5px;
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-mature-console > header {
  min-height: 72px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--theme-divider);
  background: var(--theme-panel-soft);
}
.gmv-mature-console > header div {
  min-width: 0;
}
.gmv-mature-console > header span,
.gmv-mature-console > header strong,
.gmv-mature-console > header small {
  display: block;
}
.gmv-mature-console > header span {
  color: #6fd6c5;
  font-size: 9px;
}
.gmv-mature-console > header strong {
  margin-top: 4px;
  color: var(--theme-text);
  font-size: 17px;
}
.gmv-mature-console > header small {
  margin-top: 5px;
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-mature-console > header select {
  width: 180px;
  flex: 0 0 180px;
}
.gmv-mature-console__controls {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.gmv-mature-console__controls .gmv-button {
  white-space: nowrap;
}
.gmv-mature-console__controls .gmv-icon-button {
  flex: 0 0 36px;
}
.gmv-sop-automation-status {
  min-height: 44px;
  padding: 9px 16px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--theme-divider);
  background: var(--theme-panel);
}
.gmv-sop-automation-status strong {
  min-width: 0;
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-automation-status small {
  color: var(--theme-text-muted);
  font-size: 9px;
  white-space: nowrap;
}
.gmv-mature-console__signals {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}
.gmv-mature-console__signals article {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--theme-divider);
  border-radius: 6px;
  background: var(--theme-panel-soft);
}
.gmv-mature-console__signals article:last-child {
  border-right: 1px solid var(--theme-divider);
}
.gmv-mature-console__signals span,
.gmv-mature-console__signals strong,
.gmv-mature-console__signals small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-mature-console__signals span {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-mature-console__signals strong {
  margin-top: 8px;
  color: var(--theme-text);
  font-size: 18px;
}
.gmv-mature-console__signals article:nth-child(-n + 2) strong {
  font-size: 15px;
}
.gmv-mature-console__signals small {
  margin-top: 6px;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-mature-console__baselines {
  padding: 0 16px 16px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.gmv-mature-console__baselines > article {
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--theme-divider);
  border-radius: 6px;
  background: color-mix(
    in srgb,
    var(--theme-panel-soft) 70%,
    var(--theme-panel)
  );
}
.gmv-mature-console__baselines > article:last-child {
  border-right: 1px solid var(--theme-divider);
}
.gmv-mature-console__baselines > article > span {
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-mature-console__baselines > article > strong {
  display: block;
  margin-top: 6px;
  color: #62d8b5;
  font-size: 22px;
}
.gmv-mature-console__baselines dl {
  margin: 14px 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}
.gmv-mature-console__baselines dt {
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-mature-console__baselines dd {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmv-sop-object-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--theme-panel);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
}
.gmv-sop-object-bar__selector {
  min-width: 0;
  padding: 16px 18px;
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-sop-object-bar__selector:hover {
  background: var(--theme-panel-hover);
}
.gmv-sop-object-bar > .gmv-icon-button {
  width: 44px;
  height: 100%;
  border: 0;
  border-left: 1px solid var(--theme-divider);
  border-radius: 0;
}
.gmv-sop-object-bar__image,
.gmv-sop-picker__image {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--theme-border-control);
  border-radius: 5px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-muted);
}
.gmv-sop-object-bar__image {
  width: 64px;
  height: 64px;
}
.gmv-sop-object-bar__image > svg,
.gmv-sop-picker__image > svg {
  width: 22px;
}
.gmv-sop-object-bar__image img,
.gmv-sop-picker__image img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gmv-sop-object-bar__copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.gmv-sop-object-bar__copy > small {
  color: #42cbb5;
  font-size: 10px;
  font-weight: 800;
}
.gmv-sop-object-bar__copy > strong {
  max-width: 980px;
  overflow: hidden;
  color: var(--theme-text);
  font-size: 17px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.gmv-sop-object-bar__copy > span:not(.gmv-sop-object-bar__meta) {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 7px;
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-sop-object-bar__copy b {
  flex: 0 0 auto;
  color: var(--theme-text-secondary);
  font-size: 9px;
}
.gmv-sop-object-bar__copy em {
  min-width: 0;
  overflow: hidden;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-object-bar__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.gmv-sop-object-bar__meta i {
  padding: 3px 6px;
  border: 1px solid var(--theme-border);
  border-radius: 3px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-muted);
  font-size: 8px;
  font-style: normal;
}
.gmv-sop-object-bar__change {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-text-secondary);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.gmv-sop-object-bar__change svg {
  width: 15px;
}

.gmv-sop-main-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 16px;
  align-items: start;
}
.gmv-sop-main-grid > * {
  min-width: 0;
}
.gmv-sop-main-grid__diagnosis {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: grid;
  gap: 12px;
}
.gmv-sop-main-grid__diagnosis > section {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.gmv-sop-main-grid__diagnosis .gmv-sop-decision {
  grid-template-columns: 1fr;
}
.gmv-sop-main-grid__diagnosis .gmv-sop-decision__automation {
  border-top: 1px solid var(--theme-divider);
  border-left: 0;
}
.gmv-sop-insight-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}
.gmv-sop-detail-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: start;
}
.gmv-sop-detail-grid .gmv-sop-disclosure.is-expanded {
  grid-column: 1 / -1;
}
.gmv-sop-detail-grid .gmv-sop-disclosure__header {
  min-height: 76px;
  padding: 14px 16px;
  gap: 12px;
}
.gmv-sop-detail-grid .gmv-sop-grade-summary {
  max-width: 220px;
  display: grid;
  grid-template-columns: repeat(2, minmax(72px, 1fr)) 15px;
  gap: 4px;
}
.gmv-sop-detail-grid .gmv-sop-grade-summary i {
  min-width: 0;
  padding: 4px 6px;
}
.gmv-sop-detail-grid .gmv-sop-grade-summary > svg {
  grid-column: 3;
  grid-row: 1 / 3;
  align-self: center;
}

.gmv-sop-decision {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.55fr);
  border: 1px solid var(--theme-border);
  border-left: 4px solid #23c9b5;
  border-radius: 8px;
  overflow: hidden;
  background: var(--theme-panel);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
}
.gmv-sop-decision__main {
  min-width: 0;
  padding: 22px 24px;
}
.gmv-sop-decision__main > span {
  color: #42cbb5;
  font-size: 10px;
  font-weight: 800;
}
.gmv-sop-decision__main h3 {
  margin: 8px 0 7px;
  color: var(--theme-text);
  font-size: 24px;
  line-height: 1.2;
}
.gmv-sop-decision__main p {
  max-width: 840px;
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.65;
}
.gmv-sop-decision__main > div {
  margin-top: 13px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}
.gmv-sop-decision__main > div small {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-decision__automation {
  padding: 18px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-left: 1px solid var(--theme-divider);
  background: var(--theme-panel-soft);
}
.gmv-sop-decision__automation > div {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.gmv-sop-decision__automation > div > svg {
  width: 18px;
  flex: 0 0 18px;
  color: #42cbb5;
}
.gmv-sop-decision__automation strong,
.gmv-sop-decision__automation small {
  display: block;
}
.gmv-sop-decision__automation strong {
  color: var(--theme-text);
  font-size: 12px;
}
.gmv-sop-decision__automation small {
  margin-top: 5px;
  color: var(--theme-text-muted);
  font-size: 10px;
  line-height: 1.5;
}
.gmv-sop-decision__settings {
  grid-column: 1 / -1;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: auto minmax(190px, 1fr) auto minmax(150px, 0.72fr);
  align-items: end;
  gap: 12px;
  border-top: 1px solid var(--theme-divider);
  background: var(--theme-panel-soft);
}
.gmv-sop-decision__settings label {
  display: grid;
  gap: 5px;
}
.gmv-sop-decision__settings label span {
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-sop-decision__settings select {
  min-width: 190px;
}
.gmv-sop-decision__settings > small {
  grid-column: 1 / -1;
  align-self: center;
  color: var(--theme-text-muted);
  font-size: 9px;
  text-align: right;
}

.gmv-sop-tasks--focus {
  padding: 20px 22px;
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
}
.gmv-sop-tasks--focus > .gmv-sop-task-list:not(.is-completed-list) {
  max-height: 326px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
}
.gmv-sop-tasks--focus .gmv-sop-task-list article {
  grid-template-columns: 72px minmax(0, 1fr) auto;
}
.gmv-sop-tasks--focus .gmv-sop-task-list .gmv-button {
  min-width: 112px;
}
.gmv-sop-task-list article.is-blocked {
  opacity: 0.7;
}
.gmv-sop-task-empty {
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-top: 1px solid var(--theme-divider);
  color: #48d39a;
}
.gmv-sop-task-empty > svg {
  width: 21px;
}
.gmv-sop-task-empty strong,
.gmv-sop-task-empty small {
  display: block;
}
.gmv-sop-task-empty strong {
  color: var(--theme-text);
  font-size: 11px;
}
.gmv-sop-task-empty small {
  margin-top: 4px;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-inline-toggle {
  width: 100%;
  min-height: 38px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-top: 1px solid var(--theme-divider);
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 10px;
  cursor: pointer;
}
.gmv-sop-inline-toggle svg,
.gmv-sop-key-section header button svg,
.gmv-sop-disclosure__header > svg,
.gmv-sop-grade-summary > svg {
  width: 15px;
  transition: transform 0.16s ease;
}
.gmv-sop-inline-toggle svg.is-open,
.gmv-sop-key-section header button svg.is-open,
.gmv-sop-disclosure__header > svg.is-open,
.gmv-sop-grade-summary > svg.is-open {
  transform: rotate(180deg);
}
.gmv-sop-task-list.is-completed-list {
  border-top: 1px solid var(--theme-divider);
}

.gmv-sop-key-section,
.gmv-sop-phase-section,
.gmv-sop-disclosure {
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--theme-panel);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
}
.gmv-sop-key-section > header,
.gmv-sop-phase-section > header {
  min-height: 60px;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--theme-divider);
  background: var(--theme-panel-soft);
}
.gmv-sop-key-section header span,
.gmv-sop-key-section header strong,
.gmv-sop-phase-section header span,
.gmv-sop-phase-section header strong {
  display: block;
}
.gmv-sop-key-section header span,
.gmv-sop-phase-section header span {
  color: #42cbb5;
  font-size: 9px;
  font-weight: 800;
}
.gmv-sop-key-section header strong,
.gmv-sop-phase-section header strong {
  margin-top: 4px;
  color: var(--theme-text-secondary);
  font-size: 12px;
}
.gmv-sop-key-section .gmv-sop-metrics,
.gmv-sop-phase-section .gmv-sop-rail {
  border: 0;
  border-radius: 0;
}
.gmv-sop-key-section .gmv-sop-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.gmv-sop-key-section .gmv-sop-metrics article {
  border-top: 0;
  border-right: 1px solid var(--theme-divider);
}
.gmv-sop-key-section .gmv-sop-metrics article:nth-child(3n) {
  border-right: 0;
}
.gmv-sop-key-section .gmv-sop-metrics article:nth-child(n + 4) {
  border-top: 1px solid var(--theme-divider);
}

.gmv-sop-disclosure__header {
  width: 100%;
  min-height: 68px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border: 0;
  background: var(--theme-panel);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-sop-disclosure__header:hover {
  background: var(--theme-panel-hover);
}
.gmv-sop-disclosure__header > span:first-child {
  min-width: 0;
}
.gmv-sop-disclosure__header strong,
.gmv-sop-disclosure__header small {
  display: block;
}
.gmv-sop-disclosure__header strong {
  color: var(--theme-text);
  font-size: 13px;
}
.gmv-sop-disclosure__header small {
  margin-top: 5px;
  color: var(--theme-text-muted);
  font-size: 10px;
  line-height: 1.45;
}
.gmv-sop-disclosure__body {
  border-top: 1px solid var(--theme-divider);
  background: var(--theme-panel);
}
.gmv-sop-disclosure__body.gmv-sop-input {
  padding: 24px;
}
.gmv-sop-input__bound-scope {
  padding: 16px 18px;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-panel-soft);
}
.gmv-sop-input__bound-scope > span {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.gmv-sop-input__bound-scope small,
.gmv-sop-input__bound-scope strong,
.gmv-sop-input__bound-scope em {
  display: block;
}
.gmv-sop-input__bound-scope small {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-input__bound-scope strong {
  overflow: hidden;
  color: var(--theme-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-input__bound-scope em {
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-input__bound-scope label {
  flex: 0 0 150px;
}
.gmv-sop-input__bound-scope input {
  width: 100%;
}
.gmv-sop-input__bulk {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.gmv-sop-grade-summary {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
}
.gmv-sop-grade-summary i {
  min-width: 78px;
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  background: var(--theme-panel-soft);
  color: var(--theme-text);
  font-size: 9px;
  font-style: normal;
}
.gmv-sop-grade-summary i b {
  font-weight: 700;
}
.gmv-sop-grade-summary .is-s b {
  color: #48d39a;
}
.gmv-sop-grade-summary .is-a b {
  color: #55c7da;
}
.gmv-sop-grade-summary .is-b b {
  color: #e8b64f;
}
.gmv-sop-grade-summary .is-c b {
  color: #ef6079;
}
.gmv-sop-video-insights {
  padding: 16px;
  background: color-mix(in srgb, var(--theme-panel) 92%, #080d13);
}
.gmv-sop-video-toolbar {
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.gmv-sop-video-grades {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(110px, 1fr));
  gap: 7px;
}
.gmv-sop-video-grades > button {
  min-width: 0;
  min-height: 52px;
  padding: 9px 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-panel);
  color: var(--theme-text-muted);
  cursor: pointer;
}
.gmv-sop-video-grades > button:hover {
  border-color: var(--theme-border-control);
  background: var(--theme-panel-hover);
}
.gmv-sop-video-grades > button.is-active {
  color: var(--theme-text);
  box-shadow: inset 0 -2px currentColor;
}
.gmv-sop-video-grades > button.is-s.is-active {
  border-color: rgba(72, 211, 154, 0.48);
  color: #48d39a;
  background: rgba(72, 211, 154, 0.07);
}
.gmv-sop-video-grades > button.is-a.is-active {
  border-color: rgba(85, 199, 218, 0.48);
  color: #55c7da;
  background: rgba(85, 199, 218, 0.07);
}
.gmv-sop-video-grades > button.is-b.is-active {
  border-color: rgba(232, 182, 79, 0.48);
  color: #e8b64f;
  background: rgba(232, 182, 79, 0.07);
}
.gmv-sop-video-grades > button.is-c.is-active {
  border-color: rgba(239, 96, 121, 0.48);
  color: #ef6079;
  background: rgba(239, 96, 121, 0.07);
}
.gmv-sop-video-grades span {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  color: inherit;
  font-size: 10px;
}
.gmv-sop-video-grades b {
  width: 23px;
  height: 23px;
  display: inline-grid;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 4px;
  font-size: 9px;
}
.gmv-sop-video-grades strong {
  color: var(--theme-text);
  font-size: 16px;
}
.gmv-sop-video-sort {
  min-width: 190px;
  display: grid;
  gap: 5px;
}
.gmv-sop-video-sort span {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-video-sort select {
  width: 100%;
  min-height: 36px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--theme-border-control);
  border-radius: 5px;
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: 10px;
}
.gmv-sop-video-workspace {
  min-height: 430px;
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-radius: 7px;
  background: var(--theme-panel);
}
.gmv-sop-video-list {
  max-height: 560px;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
  border-right: 1px solid var(--theme-divider);
  background: color-mix(
    in srgb,
    var(--theme-panel-soft) 76%,
    var(--theme-panel)
  );
}
.gmv-sop-video-list__items {
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
}
.gmv-sop-video-list__items > button {
  width: 100%;
  min-height: 84px;
  padding: 8px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--theme-text);
  text-align: left;
  cursor: pointer;
}
.gmv-sop-video-list__items > button + button {
  margin-top: 4px;
}
.gmv-sop-video-list__items > button:hover {
  background: var(--theme-panel-hover);
}
.gmv-sop-video-list__items > button.is-active {
  border-color: rgba(74, 205, 184, 0.38);
  background: rgba(36, 190, 167, 0.09);
  box-shadow: inset 2px 0 #35c6ad;
}
.gmv-sop-video-list__cover {
  position: relative;
  width: 48px;
  height: 68px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--theme-border-control);
  border-radius: 4px;
  background: #090e15;
  color: var(--theme-text-muted);
}
.gmv-sop-video-list__cover > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gmv-sop-video-list__cover > svg {
  width: 18px;
}
.gmv-sop-video-list__cover > i {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(3, 7, 12, 0.32);
  color: #fff;
  font-style: normal;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.gmv-sop-video-list__items > button:hover .gmv-sop-video-list__cover > i,
.gmv-sop-video-list__items > button.is-active .gmv-sop-video-list__cover > i {
  opacity: 1;
}
.gmv-sop-video-list__cover > i svg {
  width: 21px;
}
.gmv-sop-video-list__copy {
  min-width: 0;
}
.gmv-sop-video-list__copy strong,
.gmv-sop-video-list__copy small,
.gmv-sop-video-list__copy em {
  display: block;
}
.gmv-sop-video-list__copy strong {
  overflow: hidden;
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-video-list__copy small {
  margin-top: 4px;
  overflow: hidden;
  color: var(--theme-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-video-list__copy em {
  margin-top: 7px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-text-secondary);
  font-size: 10px;
  font-style: normal;
}
.gmv-sop-video-list__copy b {
  min-width: 22px;
  height: 19px;
  display: inline-grid;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 3px;
  font-size: 9px;
}
.gmv-sop-video-list__copy b.is-s {
  color: #48d39a;
}
.gmv-sop-video-list__copy b.is-a {
  color: #55c7da;
}
.gmv-sop-video-list__copy b.is-b {
  color: #e8b64f;
}
.gmv-sop-video-list__copy b.is-c {
  color: #ef6079;
}
.gmv-sop-video-pagination {
  min-height: 46px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--theme-divider);
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-video-pagination > div {
  display: flex;
  gap: 5px;
}
.gmv-sop-video-pagination button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--theme-border-control);
  border-radius: 4px;
  background: var(--theme-input);
  color: var(--theme-text-secondary);
  cursor: pointer;
}
.gmv-sop-video-pagination button:first-child svg {
  transform: rotate(180deg);
}
.gmv-sop-video-pagination button:disabled {
  cursor: default;
  opacity: 0.35;
}
.gmv-sop-video-pagination svg {
  width: 14px;
}
.gmv-sop-video-detail {
  min-width: 0;
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(170px, 210px) minmax(0, 1fr);
  gap: 20px;
}
.gmv-sop-video-detail__preview {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 14;
  max-height: 390px;
  overflow: hidden;
  align-self: start;
  border: 1px solid var(--theme-border-control);
  border-radius: 6px;
  background: #070b11;
}
.gmv-sop-video-detail__preview > img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.gmv-sop-video-detail__preview > div {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-sop-video-detail__preview > div svg {
  width: 28px;
}
.gmv-sop-video-detail__preview > div small {
  max-width: 150px;
  color: var(--theme-text-subtle);
  font-size: 9px;
  line-height: 1.5;
  text-align: center;
}
.gmv-sop-video-detail__preview > button {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  background: rgba(7, 12, 18, 0.68);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.gmv-sop-video-detail__preview > button:hover {
  background: rgba(24, 177, 154, 0.82);
}
.gmv-sop-video-detail__preview > button svg {
  width: 23px;
}
.gmv-sop-video-detail__preview > button span {
  font-size: 9px;
  font-weight: 700;
}
.gmv-sop-video-detail__duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-height: 20px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  border-radius: 3px;
  background: rgba(4, 7, 11, 0.78);
  color: #fff;
  font-size: 9px;
}
.gmv-sop-video-detail__content {
  min-width: 0;
}
.gmv-sop-video-detail__content > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.gmv-sop-video-detail__content > header > div {
  min-width: 0;
}
.gmv-sop-video-detail__content > header span:first-child {
  color: #55c7da;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}
.gmv-sop-video-detail__content h3 {
  margin: 5px 0 0;
  overflow: hidden;
  color: var(--theme-text);
  font-size: 16px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-video-detail__content header p {
  margin: 5px 0 0;
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-video-meta {
  margin: 14px 0 0;
  padding: 10px 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--theme-divider);
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-sop-video-meta > div {
  min-width: 0;
  padding: 0 9px;
  border-right: 1px solid var(--theme-divider);
}
.gmv-sop-video-meta > div:first-child {
  padding-left: 0;
}
.gmv-sop-video-meta > div:last-child {
  border-right: 0;
}
.gmv-sop-video-meta dt {
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-sop-video-meta dd {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-video-primary-metrics {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--theme-border);
  border-radius: 5px;
  overflow: hidden;
}
.gmv-sop-video-primary-metrics article {
  min-width: 0;
  min-height: 64px;
  padding: 10px;
  border-right: 1px solid var(--theme-divider);
  background: var(--theme-panel-soft);
}
.gmv-sop-video-primary-metrics article:last-child {
  border-right: 0;
}
.gmv-sop-video-primary-metrics span,
.gmv-sop-video-primary-metrics strong {
  display: block;
}
.gmv-sop-video-primary-metrics span {
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-sop-video-primary-metrics strong {
  margin-top: 7px;
  overflow: hidden;
  color: var(--theme-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-video-secondary-metrics {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.gmv-sop-video-secondary-metrics > span {
  min-width: 0;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
}
.gmv-sop-video-secondary-metrics small {
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-sop-video-secondary-metrics strong {
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-video-actions {
  margin-top: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid var(--theme-border);
  border-radius: 5px;
  background: var(--theme-panel-soft);
}
.gmv-sop-video-actions > div:first-child {
  min-width: 0;
}
.gmv-sop-video-actions strong,
.gmv-sop-video-actions span {
  display: block;
}
.gmv-sop-video-actions strong {
  color: var(--theme-text);
  font-size: 10px;
}
.gmv-sop-video-actions span {
  margin-top: 4px;
  color: var(--theme-text-muted);
  font-size: 8px;
  line-height: 1.45;
}
.gmv-sop-video-actions > div:last-child {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 7px;
}
.gmv-sop-video-actions .gmv-button {
  min-height: 34px;
  padding: 0 11px;
  font-size: 9px;
}
.gmv-sop-video-actions__exclude:not(:disabled) {
  border-color: rgba(239, 96, 121, 0.38);
  color: #ef7388;
}
.gmv-sop-video-actions .gmv-sop-video-actions__protected {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #48d39a;
  font-size: 9px;
  font-weight: 700;
}
.gmv-sop-video-actions__protected svg {
  width: 15px;
}
.gmv-sop-video-analysis {
  margin-top: 12px;
  padding: 11px 12px;
  border-left: 2px solid #35c6ad;
  background: rgba(36, 190, 167, 0.055);
}
.gmv-sop-video-analysis > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.gmv-sop-video-analysis header strong {
  font-size: 10px;
}
.gmv-sop-video-analysis header span {
  font-size: 8px;
}
.gmv-sop-video-analysis header span.is-fresh {
  color: #48d39a;
}
.gmv-sop-video-analysis header span.is-stale {
  color: #e8b64f;
}
.gmv-sop-video-analysis header span.is-missing {
  color: #ef6079;
}
.gmv-sop-video-analysis ul {
  margin: 8px 0 0;
  padding-left: 15px;
  color: var(--theme-text-secondary);
  font-size: 9px;
  line-height: 1.55;
}
.gmv-sop-video-evidence {
  margin-top: 10px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-sop-video-evidence summary {
  padding: 9px 0;
  color: var(--theme-text-muted);
  font-size: 9px;
  cursor: pointer;
}
.gmv-sop-video-evidence dl {
  margin: 0;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  background: var(--theme-panel-soft);
}
.gmv-sop-video-evidence dt {
  color: var(--theme-text-muted);
  font-size: 8px;
}
.gmv-sop-video-evidence dd {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmv-sop-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: grid;
  place-items: center;
  padding: 32px;
  background: rgba(3, 7, 12, 0.84);
  backdrop-filter: blur(14px);
  -webkit-app-region: no-drag;
}
.gmv-sop-picker {
  width: min(1180px, calc(100vw - 64px));
  max-height: min(800px, calc(100vh - 64px));
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--theme-border) 82%, #5eead4);
  border-radius: 8px;
  outline: none;
  background: var(--theme-root);
  color: var(--theme-text);
  box-shadow: 0 32px 96px rgba(0, 0, 0, 0.58);
}
.gmv-sop-picker > header {
  min-height: 112px;
  padding: 22px 24px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  border-bottom: 1px solid var(--theme-divider);
  background: var(--theme-panel);
}
.gmv-sop-picker__heading {
  min-width: 0;
}
.gmv-sop-picker__heading > span {
  color: #42cbb5;
  font-size: 9px;
  font-weight: 800;
}
.gmv-sop-picker__heading h2 {
  margin: 7px 0 5px;
  color: var(--theme-text);
  font-size: 23px;
  line-height: 1.2;
}
.gmv-sop-picker__heading p {
  margin: 0;
  color: var(--theme-text-muted);
  font-size: 11px;
  line-height: 1.5;
}
.gmv-sop-picker__header-side {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}
.gmv-sop-picker__header-side > .gmv-icon-button {
  width: 42px;
  height: 42px;
  border-radius: 6px;
}
.gmv-sop-picker__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(94px, 1fr));
  gap: 8px;
}
.gmv-sop-picker__summary span {
  min-height: 54px;
  padding: 8px 12px;
  display: grid;
  align-content: center;
  border: 1px solid var(--theme-divider);
  border-radius: 6px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-muted);
  font-size: 9px;
  white-space: nowrap;
}
.gmv-sop-picker__summary strong {
  margin-bottom: 2px;
  color: var(--theme-text);
  font-size: 18px;
  line-height: 1;
}
.gmv-sop-picker__toolbar {
  padding: 14px 20px;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) 220px auto;
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid var(--theme-divider);
  background: color-mix(
    in srgb,
    var(--theme-panel-soft) 70%,
    var(--theme-panel)
  );
}
.gmv-sop-picker__toolbar label {
  min-width: 0;
  min-height: 44px;
  padding: 0 14px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid var(--theme-border-control);
  border-radius: 6px;
  background: var(--theme-input);
  color: var(--theme-text-muted);
}
.gmv-sop-picker__toolbar label:focus-within {
  border-color: #36c7b1;
  box-shadow: 0 0 0 3px rgba(54, 199, 177, 0.1);
}
.gmv-sop-picker__toolbar label svg {
  width: 17px;
}
.gmv-sop-picker__toolbar input {
  min-width: 0;
  height: 42px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--theme-text);
  font-size: 12px;
}
.gmv-sop-picker__toolbar input:focus {
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}
.gmv-sop-picker__toolbar select {
  width: 100%;
  min-height: 44px;
  border-radius: 6px;
}
.gmv-sop-picker__toolbar > span {
  padding: 7px 10px;
  border: 1px solid var(--theme-divider);
  border-radius: 5px;
  color: var(--theme-text-secondary);
  font-size: 10px;
  white-space: nowrap;
}
.gmv-sop-picker__list {
  min-height: 0;
  max-height: 590px;
  padding: 14px 18px 18px;
  display: grid;
  align-content: start;
  gap: 8px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: var(--theme-root);
}
.gmv-sop-picker__list article {
  position: relative;
  min-height: 96px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  border: 1px solid var(--theme-divider);
  border-radius: 7px;
  overflow: hidden;
  background: color-mix(
    in srgb,
    var(--theme-panel) 88%,
    var(--theme-panel-soft)
  );
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}
.gmv-sop-picker__list article:hover {
  border-color: color-mix(in srgb, #42cbb5 55%, var(--theme-border));
  background: var(--theme-panel-hover);
}
.gmv-sop-picker__list article.is-selected {
  border-color: #35c9b2;
  background: color-mix(in srgb, #23c9b5 7%, var(--theme-panel));
  box-shadow: inset 4px 0 #23c9b5;
}
.gmv-sop-picker__item {
  min-width: 0;
  padding: 14px 16px;
  display: grid;
  grid-template-columns: 64px minmax(300px, 1.05fr) minmax(280px, 0.95fr) 20px;
  gap: 16px;
  align-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-sop-picker__item:focus-visible {
  outline: 2px solid #42cbb5;
  outline-offset: -3px;
}
.gmv-sop-picker__image {
  width: 62px;
  height: 62px;
  border-radius: 6px;
}
.gmv-sop-picker__identity,
.gmv-sop-picker__campaign {
  min-width: 0;
  display: grid;
  gap: 6px;
}
.gmv-sop-picker__identity > span,
.gmv-sop-picker__campaign > span {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.gmv-sop-picker__identity i,
.gmv-sop-picker__campaign i {
  padding: 3px 7px;
  border: 1px solid var(--theme-divider);
  border-radius: 4px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-muted);
  font-size: 8px;
  font-style: normal;
}
.gmv-sop-picker__identity i.is-selected {
  border-color: rgba(35, 201, 181, 0.28);
  background: rgba(35, 201, 181, 0.14);
  color: #5eead4;
}
.gmv-sop-picker__identity strong,
.gmv-sop-picker__campaign strong {
  overflow: hidden;
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.gmv-sop-picker__identity small,
.gmv-sop-picker__campaign small {
  color: var(--theme-text-muted);
  font-size: 9px;
}
.gmv-sop-picker__campaign strong {
  font-size: 12px;
}
.gmv-sop-picker__campaign > .gmv-sop-picker__meta {
  display: grid;
  grid-template-columns: minmax(98px, 1.2fr) minmax(112px, 1fr) minmax(
      96px,
      0.9fr
    );
  gap: 6px;
}
.gmv-sop-picker__meta > i {
  min-width: 0;
  min-height: 34px;
  padding: 4px 7px;
  display: grid;
  grid-template-columns: 13px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  border-color: var(--theme-border-control);
  border-left-width: 2px;
  background: var(--theme-panel-soft);
}
.gmv-sop-picker__meta > i > svg {
  width: 13px;
  height: 13px;
}
.gmv-sop-picker__meta > i > span {
  min-width: 0;
  display: grid;
  gap: 1px;
}
.gmv-sop-picker__meta > i small,
.gmv-sop-picker__meta > i b {
  display: block;
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sop-picker__meta > i small {
  color: var(--theme-text-muted);
  font-size: 9px;
  font-weight: 650;
}
.gmv-sop-picker__meta > i b {
  color: var(--theme-text);
  font-size: 11px;
  font-style: normal;
  font-weight: 750;
}
.gmv-sop-picker__meta > i.is-store {
  border-color: rgba(80, 143, 255, 0.34);
  background: rgba(80, 143, 255, 0.09);
  color: #8db6ff;
}
.gmv-sop-picker__meta > i.is-positive {
  border-color: rgba(65, 210, 157, 0.38);
  background: rgba(65, 210, 157, 0.1);
  color: #62dda9;
}
.gmv-sop-picker__meta > i.is-warning {
  border-color: rgba(235, 180, 70, 0.4);
  background: rgba(235, 180, 70, 0.1);
  color: #efc668;
}
.gmv-sop-picker__meta > i.is-negative {
  border-color: rgba(239, 96, 121, 0.42);
  background: rgba(239, 96, 121, 0.11);
  color: #f07a8e;
}
.gmv-sop-picker__meta > i.is-neutral {
  color: var(--theme-text-secondary);
}
.gmv-sop-picker__meta > i.is-store b {
  color: #b9d1ff;
}
.gmv-sop-picker__meta > i.is-positive b {
  color: #84e7bb;
}
.gmv-sop-picker__meta > i.is-warning b {
  color: #f1cf80;
}
.gmv-sop-picker__meta > i.is-negative b {
  color: #f49aab;
}
.gmv-sop-picker__item > svg {
  width: 17px;
  color: var(--theme-text-muted);
}
.gmv-sop-picker__copy {
  width: 46px;
  border: 0;
  border-left: 1px solid var(--theme-divider);
  background: transparent;
  color: var(--theme-text-muted);
  cursor: pointer;
}
.gmv-sop-picker__copy:hover {
  background: var(--theme-panel-hover);
  color: #5eead4;
}
.gmv-sop-picker__copy svg {
  width: 16px;
}
.gmv-sop-picker__empty {
  min-height: 320px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--theme-text-muted);
}
.gmv-sop-picker__empty svg {
  width: 32px;
}
.gmv-sop-picker__empty strong {
  color: var(--theme-text);
  font-size: 14px;
}
.gmv-sop-picker__empty small {
  font-size: 10px;
}
@keyframes gmv-sync-pulse {
  0%,
  100% {
    transform: scale(0.92);
    opacity: 0.65;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}
.gmv-feature-layout {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  transition: grid-template-columns 0.18s ease;
}
.gmv-feature-layout.is-nav-collapsed {
  grid-template-columns: 64px minmax(0, 1fr);
}
.gmv-feature-content {
  min-width: 0;
  max-width: 100%;
  padding: 18px 20px 48px;
  box-sizing: border-box;
  overflow-x: clip;
}
.gmv-command-coach {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--theme-divider, #263241);
}
.gmv-command-coach__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-command-coach__header h3 {
  margin: 3px 0 0;
  font-size: 19px;
}
.gmv-command-coach__header .gmv-kicker,
.gmv-coach-detail .gmv-kicker {
  font-size: 12px;
}
.gmv-command-coach__diagnosis {
  margin: 10px 0 0;
  padding: 13px 14px;
  border-left: 3px solid var(--theme-accent, #55d6c2);
  border-radius: 4px;
  background: color-mix(
    in srgb,
    var(--theme-accent, #55d6c2) 7%,
    var(--theme-input, #101923)
  );
  color: var(--theme-text-secondary, #c3ccd8);
  font-size: 14px;
  line-height: 1.65;
}
.gmv-coach-profile {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--theme-divider, #263241);
  border-radius: 6px;
}
.gmv-coach-profile span {
  min-width: 0;
  padding: 12px;
  border-right: 1px solid var(--theme-divider, #263241);
  border-bottom: 1px solid var(--theme-divider, #263241);
}
.gmv-coach-profile span:nth-child(3n) {
  border-right: 0;
}
.gmv-coach-profile span:nth-child(n + 4) {
  border-bottom: 0;
}
.gmv-coach-profile small {
  display: block;
  color: var(--theme-text-muted, #8f9bad);
  font-size: 12px;
}
.gmv-coach-profile strong {
  display: block;
  margin-top: 5px;
  font-size: 16px;
}
.gmv-coach-profile em {
  display: block;
  margin-top: 3px;
  color: var(--theme-text-muted, #8f9bad);
  font-size: 12px;
  font-style: normal;
}
.gmv-coach-detail {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  margin-top: 14px;
}
.gmv-coach-detail ul,
.gmv-coach-detail ol {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.gmv-coach-detail li {
  min-width: 0;
  padding: 11px 12px;
  border-radius: 5px;
  background: rgba(8, 14, 22, 0.45);
}
.gmv-coach-detail li strong,
.gmv-coach-detail li small {
  display: block;
}
.gmv-coach-detail li strong {
  font-size: 14px;
  line-height: 1.45;
}
.gmv-coach-detail li small {
  margin-top: 5px;
  color: var(--theme-text-muted, #8f9bad);
  font-size: 13px;
  line-height: 1.6;
}
@media (max-width: 980px) {
  .gmv-coach-profile {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-coach-profile span:nth-child(3n) {
    border-right: 0;
  }
  .gmv-coach-detail {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .gmv-coach-profile {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-coach-profile span:nth-child(3n) {
    border-right: 1px solid var(--theme-divider, #263241);
  }
  .gmv-coach-profile span:nth-child(2n) {
    border-right: 0;
  }
  .gmv-coach-profile span:nth-child(n + 4) {
    border-bottom: 1px solid var(--theme-divider, #263241);
  }
  .gmv-coach-profile span:nth-child(n + 5) {
    border-bottom: 0;
  }
}
.gmv-context-tabs {
  min-width: 0;
  min-height: 42px;
  margin: -5px 0 16px;
  padding: 0 2px;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--theme-border, #293341);
  scrollbar-width: thin;
}
.gmv-context-tabs button {
  min-height: 40px;
  padding: 0 13px;
  flex: 0 0 auto;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--theme-text-muted, #8f9bad);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.gmv-context-tabs button:hover {
  color: var(--theme-text, #eef2f7);
}
.gmv-context-tabs button.is-active {
  border-bottom-color: var(--theme-accent, #55d6c2);
  color: var(--theme-text, #eef2f7);
}
.gmv-feature-content > *,
.gmv-sop {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.gmv-sop > * {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.gmv-feature-nav {
  position: sticky;
  top: 0;
  align-self: start;
  height: calc(100vh - 78px);
  min-height: 560px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--theme-border, #293341);
  background: var(--theme-panel, #101720);
  overflow: hidden;
}
.gmv-feature-nav__brand {
  min-height: 58px;
  padding: 0 8px 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--theme-border, #293341);
  overflow: hidden;
}
.gmv-feature-nav__brand > span {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: #ef405f;
  color: #fff;
}
.gmv-feature-nav__brand svg {
  width: 18px;
  height: 18px;
}
.gmv-feature-nav__brand div {
  min-width: 0;
}
.gmv-feature-nav__brand strong,
.gmv-feature-nav__brand small {
  display: block;
  white-space: nowrap;
}
.gmv-feature-nav__brand strong {
  font-size: 13px;
}
.gmv-feature-nav__brand small {
  margin-top: 3px;
  color: var(--theme-text-muted, #8290a3);
  font-size: 9px;
}
.gmv-feature-nav__footer {
  margin-top: auto;
  padding-top: 10px;
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--theme-border, #293341);
}
.gmv-feature-nav__status {
  min-height: 32px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}
.gmv-feature-nav__status > span {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: #687588;
}
.gmv-feature-nav__status > span.is-connected {
  background: #42d49d;
  box-shadow: 0 0 0 4px rgba(66, 212, 157, 0.1);
}
.gmv-feature-nav__status small {
  color: var(--theme-text-muted, #8290a3);
  white-space: nowrap;
}
.gmv-feature-nav__footer > button {
  min-height: 38px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  border: 1px solid var(--theme-border-control, #303a48);
  border-radius: 5px;
  background: var(--theme-control, #171f2a);
  color: var(--theme-text, #eef2f7);
  cursor: pointer;
  overflow: hidden;
}
.gmv-feature-nav__footer svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
}
.gmv-feature-nav__footer button span {
  white-space: nowrap;
}
.gmv-feature-layout.is-nav-collapsed .gmv-feature-nav__brand {
  padding-inline: 5px;
  justify-content: center;
}
.gmv-feature-layout.is-nav-collapsed .gmv-feature-nav__brand div,
.gmv-feature-layout.is-nav-collapsed .gmv-tab__label,
.gmv-feature-layout.is-nav-collapsed .gmv-feature-nav__status small,
.gmv-feature-layout.is-nav-collapsed .gmv-feature-nav__footer button span {
  display: none;
}
.gmv-feature-layout.is-nav-collapsed .gmv-feature-nav__footer > button,
.gmv-feature-layout.is-nav-collapsed .gmv-feature-nav__status {
  padding: 0;
  justify-content: center;
}
.gmv-header,
.gmv-panel__heading,
.gmv-section__heading,
.gmv-recommendation__top,
.gmv-row,
.gmv-row__actions,
.gmv-header__actions,
.gmv-recommendation__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-header {
  align-items: flex-end;
  margin-bottom: 16px;
  padding: 4px 0;
}
.gmv-header h1 {
  margin: 8px 0 4px;
  color: var(--theme-text, #f5f7fa);
  font-size: 28px;
  letter-spacing: 0;
}
.gmv-header p,
.gmv-panel p,
.gmv-section__heading p {
  margin: 0;
  color: var(--theme-text-muted, #9ca7b8);
  font-size: 13px;
}
.gmv-brand {
  display: flex;
  gap: 8px;
  color: #ff4b67;
  font-size: 12px;
  font-weight: 800;
}
.gmv-brand__mcp {
  color: #51d6a8;
}
.gmv-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}
.gmv-button,
.gmv-icon-button,
.gmv-tab {
  border: 1px solid transparent;
  cursor: pointer;
  color: inherit;
}
.gmv-button {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 650;
  white-space: nowrap;
}
.gmv-button--primary {
  background: #ef405f;
  color: #fff;
  box-shadow: 0 6px 18px rgba(239, 64, 95, 0.18);
}
.gmv-button--secondary {
  background: #171d27;
  border-color: #2b3543;
}
.gmv-button--ghost {
  background: transparent;
  border-color: #2b3543;
  color: #c7d0dc;
}
.gmv-button:disabled,
.gmv-icon-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.gmv-alert {
  min-height: 42px;
  margin: 0 0 12px;
  padding: 0 14px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
}
.gmv-alert--success {
  background: rgba(44, 190, 135, 0.13);
  color: #6ee7b7;
}
.gmv-alert--danger {
  background: rgba(239, 68, 68, 0.13);
  color: #fca5a5;
}
.gmv-alert--warning {
  background: rgba(245, 158, 11, 0.13);
  color: #fcd34d;
}
.gmv-tabs {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gmv-tab {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 0 11px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  color: #8f9bad;
  white-space: nowrap;
  border-radius: 5px;
  overflow: hidden;
}
.gmv-tab .gmv-icon {
  width: 17px;
  height: 17px;
}
.gmv-tab__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.gmv-tab.is-active {
  color: #fff;
}
.gmv-tab.is-active {
  background: #212936;
}
.gmv-tab.is-active::after {
  content: "";
  position: absolute;
  inset: 7px auto 7px 0;
  width: 2px;
  background: #ef405f;
}
.gmv-count {
  min-width: 20px;
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ef3f5d;
  color: #fff;
  font-size: 11px;
}
.gmv-feature-layout.is-nav-collapsed .gmv-tab {
  padding: 0;
  justify-content: center;
  overflow: visible;
}
.gmv-feature-layout.is-nav-collapsed .gmv-count {
  position: absolute;
  top: 3px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 9px;
}
.gmv-section {
  padding-top: 2px;
}
.gmv-control-strip {
  margin-bottom: 12px;
  min-height: 92px;
  padding: 14px 16px;
  display: grid;
  grid-template-columns: minmax(260px, 1.5fr) repeat(
      3,
      minmax(120px, 0.65fr)
    ) minmax(190px, 0.8fr);
  align-items: center;
  border: 1px solid #2b3542;
  border-left: 3px solid #20bfa9;
  border-radius: 6px;
  background: linear-gradient(105deg, #101923 0%, #121923 60%, #13201f 100%);
}
.gmv-control-strip > div {
  min-width: 0;
  padding: 4px 16px;
  border-left: 1px solid #2a3441;
}
.gmv-control-strip > div:first-child {
  padding-left: 0;
  border-left: 0;
}
.gmv-control-strip span,
.gmv-control-strip small {
  display: block;
  color: #7e8da1;
  font-size: 10px;
}
.gmv-control-strip strong {
  display: block;
  margin-top: 5px;
  color: #f4f7fa;
  font-size: 20px;
}
.gmv-control-strip__scope strong {
  font-size: 17px;
}
.gmv-control-strip__scope small {
  margin-top: 5px;
}
.gmv-control-strip .gmv-kicker {
  color: #49d7bf;
  font-weight: 800;
  letter-spacing: 0.11em;
}
.gmv-control-strip strong.is-amber {
  color: #f5c65d;
}
.gmv-control-strip strong.is-green {
  color: #66d9a7;
}
.gmv-control-strip__cutoff {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  align-items: center;
}
.gmv-control-strip__cutoff .gmv-icon {
  grid-row: span 2;
  color: #49d7bf;
}
.gmv-control-strip__cutoff strong {
  font-size: 12px;
}
.gmv-section__heading {
  margin-bottom: 14px;
}
.gmv-section h2,
.gmv-panel h2 {
  margin: 0 0 4px;
  font-size: 17px;
  letter-spacing: 0;
}
.gmv-pacing-overview {
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 8px;
}
.gmv-pacing-overview article {
  min-height: 88px;
  padding: 12px 14px;
  border: 1px solid #283442;
  border-left: 3px solid #6e7b8e;
  border-radius: 6px;
  background: linear-gradient(145deg, #151d28, #101720);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 5px 12px;
  align-items: center;
}
.gmv-pacing-overview article span {
  color: #9aa7b8;
  font-size: 11px;
  font-weight: 700;
}
.gmv-pacing-overview article strong {
  font-size: 26px;
}
.gmv-pacing-overview article small {
  grid-column: 1 / -1;
  color: #718095;
  font-size: 10px;
}
.gmv-pacing-overview article.is-normal {
  border-left-color: #57d6a0;
}
.gmv-pacing-overview article.is-overspend {
  border-left-color: #ff6078;
}
.gmv-pacing-overview article.is-underspend {
  border-left-color: #f2b84b;
}
.gmv-pacing-overview article.is-unstable {
  border-left-color: #72a7ff;
}
.gmv-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.gmv-catalog-strip {
  margin-bottom: 12px;
  min-height: 66px;
  padding: 9px 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(105px, 0.55fr)) minmax(
      190px,
      1fr
    ) auto;
  gap: 8px;
  align-items: center;
  border: 1px solid #2b3644;
  border-left: 3px solid #22c4ad;
  background: #101821;
}
.gmv-catalog-strip > div {
  min-width: 0;
  padding: 4px 10px;
  border-right: 1px solid #2a3441;
}
.gmv-catalog-strip span,
.gmv-catalog-strip strong {
  display: block;
}
.gmv-catalog-strip span {
  color: #77869a;
  font-size: 9px;
}
.gmv-catalog-strip strong {
  margin-top: 5px;
  font-size: 17px;
}
.gmv-catalog-strip__time strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.gmv-metrics article {
  position: relative;
  min-height: 122px;
  padding: 14px;
  border: 1px solid #252f3c;
  border-radius: 6px;
  background: #121923;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
}
.gmv-metrics span {
  color: var(--text-secondary, #9ca7b8);
  font-size: 12px;
}
.gmv-metrics strong {
  margin-top: 8px;
  font-size: 28px;
}
.gmv-metrics small {
  margin-top: 4px;
  color: #758195;
  font-size: 10px;
}
.gmv-priority-panel {
  margin-bottom: 12px;
}
.gmv-priority-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.gmv-priority-grid button {
  min-width: 0;
  padding: 12px;
  display: grid;
  gap: 7px;
  border: 1px solid var(--theme-border, #293341);
  border-radius: 6px;
  background: var(--theme-surface, #151d28);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-priority-grid button > strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-priority-grid button > small {
  color: var(--theme-text-muted, #9ca7b8);
}
.gmv-metric-icon {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 6px;
  opacity: 0.9;
}
.gmv-metric-icon svg {
  width: 15px;
}
.gmv-metric-icon.is-red {
  color: #ff6078;
  background: rgba(255, 96, 120, 0.08);
}
.gmv-metric-icon.is-green {
  color: #57d6a0;
  background: rgba(87, 214, 160, 0.08);
}
.gmv-metric-icon.is-blue {
  color: #72a7ff;
  background: rgba(114, 167, 255, 0.08);
}
.gmv-metric-icon.is-amber {
  color: #f2b84b;
  background: rgba(242, 184, 75, 0.08);
}
.gmv-metric-icon.is-cyan {
  color: #4dd6d0;
  background: rgba(77, 214, 208, 0.08);
}
.gmv-metric-icon.is-violet {
  color: #b08cff;
  background: rgba(176, 140, 255, 0.08);
}
.gmv-ops-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.75fr);
  gap: 12px;
  margin-bottom: 12px;
}
.gmv-heading-icon {
  width: 20px;
  color: #53c6d8;
}
.gmv-flow-chart {
  height: 206px;
  margin-top: 10px;
  padding: 18px 8px 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(42px, 1fr));
  gap: 10px;
  align-items: end;
  border-top: 1px solid #28313e;
  background-image: linear-gradient(#202936 1px, transparent 1px);
  background-size: 100% 25%;
}
.gmv-flow-day {
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  gap: 5px;
  align-items: end;
  justify-items: center;
}
.gmv-flow-bars {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
}
.gmv-flow-bar {
  width: min(18px, 32%);
  min-height: 5px;
  border-radius: 2px 2px 0 0;
  transition: height 0.2s ease;
}
.gmv-flow-bar.is-cost,
.gmv-chart-legend i.is-cost {
  background: #53c6d8;
}
.gmv-flow-bar.is-revenue,
.gmv-chart-legend i.is-revenue {
  background: #f2b84b;
}
.gmv-flow-day strong {
  font-size: 10px;
}
.gmv-flow-day small {
  color: #78869a;
  font-size: 9px;
}
.gmv-chart-legend {
  margin-top: 10px;
  display: flex;
  gap: 18px;
  color: #7f8da0;
  font-size: 10px;
}
.gmv-chart-legend span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gmv-chart-legend i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
.gmv-store-list {
  max-height: 246px;
  margin-top: 10px;
  overflow-y: auto;
  border-top: 1px solid #28313e;
}
.gmv-store-list button {
  width: 100%;
  min-height: 64px;
  padding: 8px 2px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 58px 16px;
  gap: 10px;
  align-items: center;
  border: 0;
  border-bottom: 1px solid #252e3a;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-store-list button:hover {
  background: #171f2a;
}
.gmv-store-avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid #36546a;
  border-radius: 5px;
  background: #15222d;
  color: #65d3df;
  font-size: 10px;
  font-weight: 800;
}
.gmv-store-list strong,
.gmv-store-list small {
  display: block;
}
.gmv-store-list small {
  margin-top: 4px;
  color: #78869a;
  font-size: 9px;
}
.gmv-store-value {
  text-align: right;
}
.gmv-grid {
  display: grid;
  gap: 12px;
}
.gmv-grid--overview {
  grid-template-columns: 1.2fr 0.8fr;
}
.gmv-panel {
  padding: 16px;
  border: 1px solid #252f3c;
  border-radius: 6px;
  background: #121923;
}
.gmv-stack {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.gmv-row {
  min-height: 58px;
  padding: 10px 0;
  border-top: 1px solid var(--border-color, #293240);
}
.gmv-row:first-child {
  border-top: 0;
}
.gmv-row strong,
.gmv-row small,
.gmv-table small,
.gmv-policy small {
  display: block;
}
.gmv-row small,
.gmv-table small,
.gmv-policy small {
  margin-top: 4px;
  color: var(--text-secondary, #9ca7b8);
  font-size: 11px;
}
.gmv-icon-button {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.gmv-details {
  margin: 14px 0;
}
.gmv-details div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-color, #293240);
}
.gmv-details dt {
  color: var(--text-secondary, #9ca7b8);
}
.gmv-details dd {
  margin: 0;
  text-align: right;
}
.gmv-status {
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
}
.is-success {
  background: rgba(44, 190, 135, 0.14);
  color: #6ee7b7;
}
.is-danger {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}
.is-warning {
  background: rgba(245, 158, 11, 0.14);
  color: #fcd34d;
}
.is-neutral {
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
}
.is-blue {
  background: rgba(72, 134, 255, 0.14);
  color: #9bbcff;
}
.gmv-table-wrap {
  border: 1px solid var(--border-color, #293240);
  border-radius: 6px;
  overflow-x: auto;
  background: var(--bg-secondary, #111823);
}
.gmv-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 820px;
}
.gmv-table--campaigns {
  min-width: 1650px;
}
.gmv-table--creatives {
  min-width: 1880px;
  table-layout: fixed;
}
.gmv-table--portfolio {
  min-width: 1160px;
}
.gmv-creative-post {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 8px;
  align-items: center;
}
.gmv-creative-post > div,
.gmv-creative-campaign-cell {
  min-width: 0;
  overflow: hidden;
}
.gmv-creative-post strong,
.gmv-creative-post small,
.gmv-creative-campaign-cell strong,
.gmv-creative-campaign-cell small,
.gmv-table--creatives td:nth-child(3) strong,
.gmv-table--creatives td:nth-child(3) small {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-creative-preview-button {
  width: 30px;
  height: 30px;
  color: #62d8c2;
  border: 1px solid rgba(98, 216, 194, 0.28);
  background: rgba(98, 216, 194, 0.08);
}
.gmv-creative-preview-button:hover {
  color: #e9fffa;
  border-color: #62d8c2;
  background: rgba(98, 216, 194, 0.18);
}
.gmv-table--creatives th:nth-child(1),
.gmv-table--creatives td:nth-child(1) {
  width: 250px;
  min-width: 250px;
  max-width: 250px;
}
.gmv-table--creatives th.gmv-creative-campaign-cell,
.gmv-table--creatives td.gmv-creative-campaign-cell {
  width: 220px;
  min-width: 220px;
  max-width: 220px;
}
.gmv-table--creatives th:nth-child(3),
.gmv-table--creatives td:nth-child(3) {
  width: 210px;
}
.gmv-table--creatives th:nth-child(4),
.gmv-table--creatives td:nth-child(4) {
  width: 110px;
}
.gmv-table--creatives th:nth-child(5),
.gmv-table--creatives td:nth-child(5) {
  width: 120px;
}
.gmv-table th,
.gmv-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, #293240);
  text-align: left;
  font-size: 12px;
  vertical-align: middle;
}
.gmv-table th {
  color: var(--text-secondary, #9ca7b8);
  font-weight: 650;
  background: var(--bg-elevated, #161d29);
}
.gmv-table--campaigns th:first-child,
.gmv-table--campaigns td:first-child {
  width: 280px;
  min-width: 280px;
  max-width: 280px;
}
.gmv-campaign-link {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}
.gmv-campaign-link strong {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.gmv-campaign-link small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-campaign-link:hover strong {
  color: #65d9c2;
}
.gmv-recommendation-count-button {
  min-width: 54px;
  padding: 2px 5px;
  display: inline-grid;
  justify-items: center;
  gap: 2px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.gmv-recommendation-count-button:hover,
.gmv-recommendation-count-button:focus-visible {
  border-color: var(--theme-accent, #14b8a6);
  background: color-mix(in srgb, var(--theme-accent, #14b8a6) 9%, transparent);
  outline: none;
}
.gmv-recommendation-count-button small {
  margin: 0 !important;
}
.gmv-campaign-recommendations__heading {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--theme-border, #293341);
  border-radius: 6px;
  background: var(--theme-panel-soft, #151827);
}
.gmv-campaign-recommendations__heading strong,
.gmv-campaign-recommendations__heading small {
  display: block;
}
.gmv-campaign-recommendations__heading small {
  margin-top: 4px;
  color: var(--theme-text-muted, #8c99ac);
}
.gmv-campaign-recommendations__list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}
.gmv-campaign-recommendations__list button {
  width: 100%;
  min-width: 0;
  padding: 12px 42px 12px 13px;
  position: relative;
  display: grid;
  gap: 7px;
  border: 1px solid var(--theme-border, #293341);
  border-radius: 6px;
  background: var(--theme-panel, #111823);
  color: var(--theme-text, #eef2f7);
  text-align: left;
  cursor: pointer;
}
.gmv-campaign-recommendations__list button:hover {
  border-color: var(--theme-accent, #14b8a6);
  background: color-mix(
    in srgb,
    var(--theme-accent, #14b8a6) 7%,
    var(--theme-panel, #111823)
  );
}
.gmv-campaign-recommendations__list button > strong {
  line-height: 1.5;
}
.gmv-campaign-recommendations__list button > small {
  color: var(--theme-text-muted, #8c99ac);
}
.gmv-campaign-recommendations__list button > svg {
  position: absolute;
  top: 50%;
  right: 13px;
  width: 17px;
  transform: translateY(-50%);
  color: var(--theme-text-muted, #8c99ac);
}
.gmv-recommendations {
  display: grid;
  gap: 12px;
}
.gmv-recommendation {
  padding: 16px;
  border: 1px solid var(--border-color, #293240);
  border-radius: 6px;
  background: var(--bg-secondary, #111823);
}
.gmv-recommendation h3 {
  margin: 8px 0 0;
  font-size: 15px;
}
.gmv-recommendation__summary {
  margin-top: 14px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-left: 3px solid #47cdb1;
  border-radius: 4px;
  background: rgba(71, 205, 177, 0.08);
  font-size: 12px;
}
.gmv-recommendation__summary strong {
  color: #82e1ce;
}
.gmv-recommendation__summary span {
  color: var(--theme-text, #f5f7fa);
  font-weight: 700;
}
.gmv-diff {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0;
}
.gmv-diff > div {
  padding: 12px;
  border: 1px solid var(--border-color, #293240);
  border-radius: 6px;
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 10px;
}
.gmv-diff > div small {
  color: var(--text-secondary, #9ca7b8);
}
.gmv-no-change {
  color: #c4ccda;
  font-weight: 650;
}
.gmv-diff span {
  color: var(--text-secondary, #9ca7b8);
  font-size: 11px;
}
.gmv-arrow {
  color: #ef3f5d !important;
}
.gmv-reason {
  color: var(--text-secondary, #9ca7b8);
  font-size: 12px;
  line-height: 1.6;
}
.gmv-reason strong {
  margin-right: 6px;
  color: #dce3ee;
}
.gmv-evidence {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.gmv-evidence div {
  padding: 10px;
  background: var(--bg-elevated, #161d29);
  border-radius: 4px;
}
.gmv-evidence dt {
  color: var(--text-secondary, #9ca7b8);
  font-size: 10px;
}
.gmv-evidence dd {
  margin: 5px 0 0;
  font-size: 12px;
}
.gmv-recommendation__actions {
  justify-content: flex-end;
  margin-top: 14px;
}
.gmv-recommendation__identity {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gmv-recommendation__identity > input {
  width: 18px;
  height: 18px;
  accent-color: #20bfa9;
}
.gmv-batch-bar {
  margin-bottom: 12px;
  min-height: 52px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  border: 1px solid var(--theme-border, #293341);
  border-radius: 6px;
  background: var(--theme-panel, #111823);
}
.gmv-batch-bar > span:first-child {
  margin-right: auto;
  font-weight: 700;
}
.gmv-policy-list {
  display: grid;
  gap: 8px;
}
.gmv-policy {
  min-height: 74px;
  padding: 12px 14px;
  border: 1px solid var(--border-color, #293240);
  border-radius: 6px;
  background: var(--bg-secondary, #111823);
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) minmax(150px, 0.8fr) 100px minmax(
      140px,
      0.7fr
    ) minmax(160px, 0.8fr) auto;
  gap: 12px;
  align-items: end;
}
.gmv-policy label {
  display: grid;
  gap: 6px;
  color: var(--text-secondary, #9ca7b8);
  font-size: 11px;
}
.gmv-policy select,
.gmv-policy input:not([type="checkbox"]) {
  width: 100%;
  min-height: 36px;
  padding: 0 9px;
  border: 1px solid var(--border-color, #293240);
  border-radius: 4px;
  background: var(--bg-elevated, #161d29);
  color: inherit;
}
.gmv-policy .gmv-toggle {
  align-self: center;
  grid-template-columns: auto 1fr;
  align-items: center;
}
.gmv-toggle input {
  accent-color: #ef3f5d;
}
.gmv-empty {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #9ca7b8);
  font-size: 13px;
}
.gmv-toolbar {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--border-color, #293240);
  background: var(--bg-secondary, #111823);
}
.gmv-form-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr));
  gap: 10px;
  align-items: end;
}
.gmv-form-grid--cost {
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  margin-top: 14px;
}
.gmv-account-metadata {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--border-color, #293240);
  border-radius: 6px;
  background: var(--bg-elevated, #0d141e);
  overflow: hidden;
}
.gmv-account-metadata article {
  min-width: 0;
  min-height: 102px;
  padding: 16px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  border-right: 1px solid var(--border-color, #293240);
}
.gmv-account-metadata article:last-child {
  border-right: 0;
}
.gmv-account-metadata article.is-error {
  background: rgba(245, 158, 11, 0.06);
}
.gmv-account-metadata__icon {
  width: 20px;
  height: 20px;
  margin-top: 2px;
  color: #5dd6c5;
}
.gmv-account-metadata article.is-error .gmv-account-metadata__icon {
  color: #fbbf24;
}
.gmv-account-metadata article > div {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.gmv-account-metadata span {
  color: var(--text-secondary, #9ca7b8);
  font-size: 11px;
}
.gmv-account-metadata strong {
  overflow: hidden;
  color: var(--text-primary, #eef2f7);
  font-size: 18px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-account-metadata small {
  color: var(--text-secondary, #8290a3);
  font-size: 10px;
  line-height: 1.45;
}
.gmv-form-grid label {
  display: grid;
  gap: 6px;
  color: var(--text-secondary, #9ca7b8);
  font-size: 11px;
}
.gmv-form-grid label > small,
.gmv-two-col label > small {
  color: #6f7f93;
  font-size: 9px;
  line-height: 1.4;
}
.gmv-form-grid input:not([type="checkbox"]),
.gmv-form-grid select {
  width: 100%;
  min-height: 36px;
  padding: 0 9px;
  border: 1px solid var(--border-color, #293240);
  border-radius: 4px;
  background: var(--bg-elevated, #161d29);
  color: inherit;
  box-sizing: border-box;
}
.gmv-cost-panel {
  margin-bottom: 12px;
}
.gmv-notification-form {
  display: grid;
  grid-template-columns: minmax(160px, 0.7fr) minmax(240px, 1.5fr) minmax(
      170px,
      0.8fr
    );
  gap: 12px;
  align-items: center;
}
.gmv-notification-toggle {
  min-width: 0;
  min-height: 38px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-color, #293240);
  border-radius: 5px;
  background: var(--bg-elevated, #161d29);
  color: var(--text-secondary, #9ca7b8);
  font-size: 12px;
  cursor: pointer;
  box-sizing: border-box;
}
.gmv-notification-toggle input {
  position: relative;
  width: 34px;
  min-width: 34px;
  height: 18px;
  margin: 0;
  border: 1px solid var(--theme-border-control, #3a4657);
  border-radius: 9px;
  appearance: none;
  background: var(--theme-control, #202837);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}
.gmv-notification-toggle input::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #a7b2c2;
  transition:
    transform 0.15s ease,
    background-color 0.15s ease;
}
.gmv-notification-toggle input:checked {
  border-color: #ef3f5d;
  background: #ef3f5d;
}
.gmv-notification-toggle input:checked::after {
  background: #fff;
  transform: translateX(16px);
}
.gmv-notification-toggle input:focus-visible {
  outline: 2px solid #65d9c2;
  outline-offset: 2px;
}
.gmv-notification-toggle span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-notification-target {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid var(--border-color, #293240);
  border-radius: 5px;
  background: var(--bg-elevated, #161d29);
  color: inherit;
  box-sizing: border-box;
}
.gmv-file {
  display: none;
}
.gmv-commandbar {
  min-height: 50px;
  margin-bottom: 12px;
  padding: 7px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  border: 1px solid #252f3c;
  background: #111720;
}
.gmv-commandbar select,
.gmv-select {
  height: 36px;
  padding: 0 10px;
  border: 1px solid #2b3543;
  border-radius: 4px;
  background: #0e141d;
  color: #dce3ec;
}
.gmv-search {
  height: 36px;
  min-width: 240px;
  flex: 1 1 320px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #2b3543;
  border-radius: 4px;
  background: #0e141d;
}
.gmv-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #eef2f7;
}
.gmv-date-field {
  min-width: 148px;
  height: 36px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #2b3543;
  border-radius: 4px;
  background: #0e141d;
  color: #7f8da0;
  font-size: 9px;
}
.gmv-date-field input {
  min-width: 104px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #dce3ec;
  color-scheme: dark;
}
.gmv-segments {
  padding: 3px;
  display: inline-flex;
  gap: 2px;
  border: 1px solid #2b3543;
  border-radius: 5px;
  background: #0e141d;
}
.gmv-segments button {
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: #8895a8;
  cursor: pointer;
  white-space: nowrap;
}
.gmv-segments button.is-active {
  background: #293344;
  color: #fff;
}
.gmv-live {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #9ba8b9;
  font-size: 11px;
  white-space: nowrap;
}
.gmv-live span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #50d49a;
  box-shadow: 0 0 0 4px rgba(80, 212, 154, 0.09);
}
.gmv-overview-table {
  margin-top: 12px;
}
.gmv-health-list {
  margin-top: 16px;
  display: grid;
  gap: 8px;
}
.gmv-health-row {
  width: 100%;
  min-height: 74px;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 28px 8px minmax(260px, 1fr) 128px 112px 112px 18px;
  gap: 12px;
  align-items: center;
  border: 1px solid #263140;
  border-radius: 8px;
  background: #141b27;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.gmv-health-row:hover {
  border-color: rgba(68, 208, 184, 0.48);
  background: #182330;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}
.gmv-health-rank {
  color: #5f7188;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.gmv-health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #657083;
  box-shadow: 0 0 0 4px rgba(101, 112, 131, 0.1);
}
.gmv-health-dot.is-on {
  background: #51d6a0;
  box-shadow: 0 0 0 4px rgba(81, 214, 160, 0.1);
}
.gmv-health-name,
.gmv-health-state,
.gmv-health-metric {
  min-width: 0;
}
.gmv-health-name strong,
.gmv-health-name small,
.gmv-health-state strong,
.gmv-health-state small,
.gmv-health-metric strong,
.gmv-health-metric small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-health-name strong {
  color: #edf3fa;
  font-size: 13px;
  font-weight: 800;
}
.gmv-health-name small {
  margin-top: 5px;
  color: #8190a4;
  font-size: 10px;
}
.gmv-health-name small b {
  color: #a8b7c9;
  font-weight: 700;
}
.gmv-health-name small i {
  margin: 0 5px;
  color: #536177;
  font-style: normal;
}
.gmv-health-state {
  padding-left: 12px;
  border-left: 1px solid #2b3645;
}
.gmv-health-state strong {
  color: #5ee0c0;
  font-size: 11px;
}
.gmv-health-state small {
  margin-top: 4px;
  color: #8290a3;
  font-size: 10px;
}
.gmv-health-metric {
  padding-left: 12px;
  border-left: 1px solid #2b3645;
}
.gmv-health-metric small {
  color: #718095;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.gmv-health-metric strong {
  margin-top: 5px;
  color: #e6edf5;
  font-size: 12px;
}
.gmv-state-stack {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.gmv-flow-state {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
}
.gmv-flow-state.is-fast,
.gmv-flow-state.is-underspend {
  color: #f2b84b;
}
.gmv-flow-state.is-stable,
.gmv-flow-state.is-normal {
  color: #57d6a0;
}
.gmv-flow-state.is-slow,
.gmv-flow-state.is-overspend {
  color: #ff6078;
}
.gmv-flow-state.is-unstable {
  color: #72a7ff;
}
.gmv-rule-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(210px, 1fr));
  gap: 10px;
  margin-bottom: 22px;
}
.gmv-rule-card {
  min-height: 168px;
  padding: 14px;
  border: 1px solid #293341;
  border-radius: 6px;
  background: #121923;
  color: inherit;
  text-align: left;
}
.gmv-rule-card__top {
  display: grid;
  grid-template-columns: 34px 1fr 32px 32px;
  gap: 8px;
  align-items: center;
}
.gmv-rule-card__top strong,
.gmv-rule-card__top small {
  display: block;
}
.gmv-rule-card__top small {
  color: #8591a3;
  margin-top: 3px;
}
.gmv-rule-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid #36546a;
  border-radius: 6px;
  color: #53c6d8;
  background: rgba(83, 198, 216, 0.08);
}
.gmv-rule-icon svg {
  width: 16px;
}
.gmv-rule-stats {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.gmv-rule-stats span {
  padding: 8px;
  background: #0e141d;
}
.gmv-rule-stats small,
.gmv-rule-stats strong {
  display: block;
}
.gmv-rule-stats small {
  color: #728094;
  font-size: 9px;
}
.gmv-rule-stats strong {
  margin-top: 4px;
}
.gmv-rule-card footer {
  margin-top: 12px;
  color: #8b97a8;
  font-size: 10px;
}
.gmv-rule-card--add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-style: dashed;
  color: #8f9bad;
  cursor: pointer;
}
.gmv-rule-card--add svg {
  width: 20px;
}
.gmv-subheading {
  margin: 6px 0 10px;
  display: flex;
  justify-content: space-between;
}
.gmv-subheading h3,
.gmv-subheading p {
  margin: 0;
}
.gmv-subheading p {
  color: #8290a3;
  font-size: 11px;
}
.gmv-policy--compact {
  grid-template-columns: minmax(230px, 1.5fr) minmax(
      160px,
      0.8fr
    ) 170px 100px 120px;
  align-items: center;
}
.gmv-policy--compact select {
  min-height: 36px;
  border: 1px solid #2b3543;
  border-radius: 4px;
  background: #0e141d;
  color: #dce3ec;
}
.gmv-permission-strip {
  display: flex;
  gap: 5px;
}
.gmv-permission-strip span {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border: 1px solid #303a48;
  border-radius: 4px;
  color: #677386;
  font-size: 9px;
  font-weight: 800;
}
.gmv-permission-strip span.is-on {
  color: #66d9a7;
  border-color: #356f5a;
  background: rgba(102, 217, 167, 0.08);
}
.gmv-creative-hero {
  margin-bottom: 10px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid #293341;
  background: #121923;
}
.gmv-experiment-board {
  margin-bottom: 10px;
  padding: 15px;
  border: 1px solid #315064;
  border-top: 2px solid #48c9b0;
  border-radius: 6px;
  background: linear-gradient(145deg, #111b25, #101720 58%, #101820);
}
.gmv-experiment-board > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.gmv-experiment-board > header span {
  color: #59d5bf;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.gmv-experiment-board > header h3 {
  margin: 5px 0 3px;
  font-size: 16px;
}
.gmv-experiment-board > header p {
  margin: 0;
  color: #8593a6;
  font-size: 10px;
}
.gmv-experiment-kpis {
  margin-top: 13px;
  display: grid;
  grid-template-columns: repeat(6, minmax(105px, 1fr));
  gap: 7px;
}
.gmv-experiment-kpis article {
  min-height: 72px;
  padding: 10px;
  border: 1px solid #293746;
  background: rgba(10, 16, 23, 0.72);
}
.gmv-experiment-kpis span,
.gmv-experiment-kpis strong,
.gmv-experiment-kpis small {
  display: block;
}
.gmv-experiment-kpis span {
  color: #8190a4;
  font-size: 9px;
}
.gmv-experiment-kpis strong {
  margin: 7px 0 3px;
  font-size: 18px;
}
.gmv-experiment-kpis small {
  color: #67778c;
  font-size: 9px;
}
.gmv-experiment-flow {
  margin-top: 8px;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 26px minmax(180px, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.gmv-experiment-flow > article {
  min-height: 54px;
  padding: 9px 11px;
  border: 1px solid #2a3948;
  background: #0e161f;
}
.gmv-experiment-flow > article span,
.gmv-experiment-flow > article strong,
.gmv-experiment-flow > article small {
  display: block;
}
.gmv-experiment-flow > article span {
  color: #718196;
  font-size: 9px;
}
.gmv-experiment-flow > article strong {
  margin: 5px 0 2px;
}
.gmv-experiment-flow > article small {
  color: #66758a;
  font-size: 9px;
}
.gmv-experiment-flow > svg {
  color: #4fcdb6;
}
.gmv-experiment-signals {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.gmv-experiment-signals span {
  padding: 4px 7px;
  border: 1px solid #354252;
  border-radius: 3px;
  color: #9aa7b8;
  background: #111923;
  font-size: 9px;
}
.gmv-experiment-outcomes {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #2b3a48;
}
.gmv-experiment-outcomes > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-experiment-outcomes > header span {
  color: #7f8da0;
  font-size: 9px;
}
.gmv-outcome-rail {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(5, minmax(130px, 1fr));
  gap: 6px;
}
.gmv-outcome-rail article {
  min-width: 0;
  padding: 9px;
  border: 1px solid #2c3948;
  background: #0d151e;
}
.gmv-outcome-rail article > strong,
.gmv-outcome-rail article > small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-outcome-rail article > strong {
  margin: 7px 0 3px;
  font-size: 10px;
}
.gmv-outcome-rail article > small {
  color: #748397;
  font-size: 9px;
}
.gmv-outcome-rail--workspace {
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  margin-bottom: 8px;
}
.gmv-workspace-experiment {
  margin-bottom: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 7px;
}
.gmv-workspace-experiment > div {
  padding: 10px;
  border: 1px solid #2a3948;
  background: #0e161f;
}
.gmv-workspace-experiment span,
.gmv-workspace-experiment strong {
  display: block;
}
.gmv-workspace-experiment span {
  color: #7f8da0;
  font-size: 9px;
}
.gmv-workspace-experiment strong {
  margin-top: 6px;
}
.gmv-creative-command {
  margin-bottom: 10px;
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.75fr);
  gap: 10px;
}
.gmv-creative-funnel,
.gmv-signal-board {
  padding: 13px 14px;
  border: 1px solid #293341;
  border-radius: 6px;
  background: #111923;
}
.gmv-funnel-track {
  display: grid;
  grid-template-columns: repeat(5, minmax(90px, 1fr));
  gap: 6px;
}
.gmv-funnel-track article {
  min-width: 0;
  padding: 10px;
  border: 1px solid #27313d;
  border-radius: 5px;
  background: #0e151e;
  overflow: hidden;
}
.gmv-funnel-track span {
  display: block;
  color: #7e8da1;
  font-size: 9px;
  white-space: nowrap;
}
.gmv-funnel-track strong {
  display: block;
  margin: 5px 0 8px;
  font-size: 17px;
}
.gmv-funnel-track i {
  height: 4px;
  display: block;
  border-radius: 4px;
  background: linear-gradient(90deg, #21bca8, #61dcb5);
}
.gmv-signal-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.gmv-signal-grid article {
  padding: 9px;
  border: 1px solid #27313d;
  border-radius: 5px;
  background: #0e151e;
}
.gmv-signal-grid span {
  display: block;
  color: #7e8da1;
  font-size: 9px;
}
.gmv-signal-grid strong {
  display: block;
  margin-top: 5px;
  font-size: 15px;
}
.gmv-signal-note {
  margin: 10px 0 0;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: #e4b75c;
  font-size: 10px;
  line-height: 1.5;
}
.gmv-enhancement-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #71cdbc;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.gmv-view-tabs {
  display: flex;
  gap: 4px;
}
.gmv-view-tabs button {
  min-height: 36px;
  padding: 0 13px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #8794a7;
  cursor: pointer;
}
.gmv-view-tabs button.is-active {
  border-color: #354150;
  background: #202936;
  color: #fff;
}
.gmv-creative-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(90px, 1fr));
  gap: 6px;
}
.gmv-creative-kpis span {
  min-width: 100px;
  padding: 6px 10px;
  border-left: 1px solid #2b3543;
}
.gmv-creative-kpis small,
.gmv-creative-kpis strong {
  display: block;
}
.gmv-creative-kpis small {
  color: #748196;
  font-size: 9px;
}
.gmv-creative-kpis strong {
  margin-top: 4px;
  font-size: 14px;
}
.gmv-creative-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 10px;
}
.gmv-list-panel {
  padding: 14px;
  border: 1px solid #293341;
  background: #121923;
}
.gmv-list-filters {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: 6px;
}
.gmv-list-filters select,
.gmv-list-filters input {
  min-width: 0;
  min-height: 32px;
  padding: 0 7px;
  border: 1px solid #303a48;
  border-radius: 4px;
  background: #0d131b;
  color: #e5ebf3;
}
.gmv-list-entry {
  min-height: 52px;
  display: grid;
  grid-template-columns: 50px 1fr 32px;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid #27303c;
}
.gmv-list-entry strong,
.gmv-list-entry small {
  display: block;
}
.gmv-list-entry small {
  color: #778496;
  font-size: 9px;
}
.gmv-list-mode {
  font-size: 9px;
  text-align: center;
  text-transform: uppercase;
}
.gmv-empty--small {
  min-height: 90px;
}
.gmv-creative-queue {
  margin-bottom: 10px;
}
.gmv-creative-queue > .gmv-table-wrap {
  margin-top: 10px;
}
.gmv-table--creative-queue {
  min-width: 1040px;
}
.gmv-performance {
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.gmv-performance.is-winner {
  background: rgba(44, 190, 135, 0.14);
  color: #6ee7b7;
}
.gmv-performance.is-testing {
  background: rgba(72, 134, 255, 0.14);
  color: #9bbcff;
}
.gmv-performance.is-waste {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}
.gmv-performance.is-watch {
  background: rgba(245, 158, 11, 0.14);
  color: #fcd34d;
}
.gmv-lifecycle-pipeline {
  display: grid;
  grid-template-columns: repeat(7, minmax(118px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.gmv-phase-card {
  min-height: 108px;
  padding: 12px;
  border: 1px solid #2b3543;
  border-top: 3px solid #536073;
  border-radius: 5px;
  background: #121923;
}
.gmv-phase-card span,
.gmv-phase-card strong,
.gmv-phase-card small {
  display: block;
}
.gmv-phase-card span {
  color: #a9b4c3;
  font-size: 10px;
  font-weight: 700;
}
.gmv-phase-card strong {
  margin: 8px 0 5px;
  font-size: 24px;
}
.gmv-phase-card small {
  color: #748196;
  font-size: 9px;
  line-height: 1.45;
}
.gmv-phase-card.is-cold_start {
  border-top-color: #7d8999;
}
.gmv-phase-card.is-exploration {
  border-top-color: #4f9de8;
}
.gmv-phase-card.is-validation {
  border-top-color: #9b7bea;
}
.gmv-phase-card.is-scaling {
  border-top-color: #43c897;
}
.gmv-phase-card.is-mature {
  border-top-color: #e8b64f;
}
.gmv-phase-card.is-declining,
.gmv-phase-card.is-blocked {
  border-top-color: #ef6079;
}
.gmv-learning-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(130px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.gmv-learning-summary article {
  min-height: 86px;
  padding: 12px 14px;
  border: 1px solid #293341;
  background: #111823;
}
.gmv-learning-summary span,
.gmv-learning-summary strong,
.gmv-learning-summary small {
  display: block;
}
.gmv-learning-summary span {
  color: #8794a7;
  font-size: 10px;
}
.gmv-learning-summary strong {
  margin: 7px 0 3px;
  font-size: 21px;
}
.gmv-learning-summary small {
  color: #69778b;
  font-size: 9px;
}
.gmv-product-lab {
  margin-bottom: 12px;
  border-top: 2px solid #49c99b;
}
.gmv-product-lab__stats {
  margin: 12px 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 8px;
}
.gmv-product-lab__stats article {
  min-height: 76px;
  padding: 11px 13px;
  border: 1px solid #2a3543;
  background: #0f161f;
}
.gmv-product-lab__stats span,
.gmv-product-lab__stats strong,
.gmv-product-lab__stats small {
  display: block;
}
.gmv-product-lab__stats span {
  color: #8492a5;
  font-size: 10px;
}
.gmv-product-lab__stats strong {
  margin: 6px 0 2px;
  font-size: 20px;
}
.gmv-product-lab__stats small {
  color: #69778b;
  font-size: 9px;
}
.gmv-table--products {
  width: 1710px;
  min-width: 1710px;
  table-layout: fixed;
}
.gmv-table--products th {
  white-space: nowrap;
}
.gmv-table--products th:first-child,
.gmv-table--products td:first-child {
  width: 300px;
  min-width: 300px;
  max-width: 300px;
}
.gmv-table--products th:nth-child(2),
.gmv-table--products td:nth-child(2) {
  width: 220px;
}
.gmv-table--products th:nth-child(3),
.gmv-table--products td:nth-child(3) {
  width: 130px;
}
.gmv-table--products th:nth-child(4),
.gmv-table--products td:nth-child(4) {
  width: 100px;
}
.gmv-table--products th:nth-child(5),
.gmv-table--products td:nth-child(5) {
  width: 110px;
}
.gmv-table--products th:nth-child(6),
.gmv-table--products td:nth-child(6) {
  width: 150px;
}
.gmv-table--products th:nth-child(7),
.gmv-table--products td:nth-child(7) {
  width: 140px;
}
.gmv-table--products th:nth-child(8),
.gmv-table--products td:nth-child(8) {
  width: 120px;
}
.gmv-table--products th:nth-child(9),
.gmv-table--products td:nth-child(9) {
  width: 130px;
}
.gmv-table--products th:nth-child(10),
.gmv-table--products td:nth-child(10) {
  width: 110px;
}
.gmv-table--products th:nth-child(11),
.gmv-table--products td:nth-child(11) {
  width: 200px;
}
.gmv-table--products th:nth-child(12),
.gmv-table--products td:nth-child(12) {
  width: 100px;
}
.gmv-table--products td:nth-child(2) strong,
.gmv-table--products td:nth-child(11) strong,
.gmv-table--products td:nth-child(11) small {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.gmv-table--products td:last-child .gmv-button {
  padding: 0 10px;
  white-space: nowrap;
}
.gmv-table--products .gmv-product-identity {
  width: 100%;
  min-width: 0;
}
.gmv-table--products .gmv-product-identity > div:last-child {
  min-width: 0;
}
.gmv-table--products .gmv-product-identity strong {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.gmv-product-identity {
  min-width: 250px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}
.gmv-product-identity--cost {
  min-width: 410px;
  grid-template-columns: 56px minmax(0, 1fr);
}
.gmv-product-identity strong,
.gmv-product-identity small {
  display: block;
}
.gmv-product-thumb {
  position: relative;
  width: 44px;
  height: 44px;
  padding: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid #334050;
  border-radius: 5px;
  background: #0b1118;
  color: #607086;
  cursor: zoom-in;
}
.gmv-product-identity--cost .gmv-product-thumb {
  width: 56px;
  height: 56px;
}
.gmv-product-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform 0.16s ease;
}
.gmv-product-thumb > span {
  position: absolute;
  inset: auto 3px 3px auto;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 4px;
  background: rgba(5, 10, 17, 0.78);
  color: #f4f7fb;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.gmv-product-thumb:hover img {
  transform: scale(1.06);
}
.gmv-product-thumb:hover > span,
.gmv-product-thumb:focus-visible > span {
  opacity: 1;
  transform: translateY(0);
}
.gmv-product-thumb svg {
  width: 15px;
  height: 15px;
}
.gmv-product-thumb.is-placeholder {
  cursor: default;
}
.gmv-product-thumb.is-placeholder svg {
  width: 18px;
  height: 18px;
}
.gmv-image-preview {
  position: fixed;
  inset: 0;
  z-index: 2147483100;
  padding: 28px;
  display: grid;
  place-items: center;
  background: rgba(3, 7, 12, 0.86);
  backdrop-filter: blur(5px);
  -webkit-app-region: no-drag;
}
.gmv-image-preview > section {
  width: min(980px, 94vw);
  max-height: 92vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--theme-border-control, #354151);
  border-radius: 7px;
  background: var(--theme-panel, #111823);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.gmv-image-preview header {
  min-height: 62px;
  padding: 10px 14px 10px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--theme-border, #293341);
}
.gmv-image-preview header div {
  min-width: 0;
}
.gmv-image-preview header strong,
.gmv-image-preview header small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-image-preview header strong {
  font-size: 13px;
}
.gmv-image-preview header small {
  margin-top: 4px;
  color: var(--theme-text-muted, #8491a3);
  font-size: 10px;
}
.gmv-image-preview header .gmv-icon-button {
  flex: 0 0 auto;
}
.gmv-image-preview header svg {
  width: 18px;
  height: 18px;
}
.gmv-image-preview__stage {
  min-height: 320px;
  padding: 18px;
  display: grid;
  place-items: center;
  background: #090e15;
}
.gmv-image-preview__stage img {
  max-width: 100%;
  max-height: calc(92vh - 99px);
  display: block;
  object-fit: contain;
}
.gmv-video-preview__stage {
  min-height: 420px;
}
.gmv-video-preview__player {
  width: min(960px, 100%);
  height: min(70vh, 540px);
  border: 0;
  display: block;
  background: #05080d;
  object-fit: contain;
}
.gmv-calibration-panel,
.gmv-portfolio-panel {
  margin-bottom: 12px;
}
.gmv-table--calibration {
  min-width: 1040px;
}
.gmv-intelligence-state {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  padding: 2px 7px;
  border: 1px solid #344153;
  border-radius: 3px;
  color: #aab6c6;
  font-size: 9px;
  font-weight: 700;
}
.gmv-intelligence-state.is-winner {
  border-color: #278b69;
  color: #57d6a0;
}
.gmv-intelligence-state.is-fatigued,
.gmv-intelligence-state.is-waste {
  border-color: #a83d54;
  color: #ff7288;
}
.gmv-intelligence-state.is-new,
.gmv-intelligence-state.is-testing {
  border-color: #35728c;
  color: #67cce0;
}
.gmv-intelligence-state.is-blocked {
  border-color: #8d6b2b;
  color: #f2bd58;
}
.gmv-backtest-panel {
  margin-bottom: 12px;
}
.gmv-table--backtest {
  min-width: 1320px;
}
.gmv-profit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(320px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.gmv-profit-card {
  padding: 14px;
  border: 1px solid #293341;
  border-radius: 6px;
  background: #121923;
}
.gmv-profit-card header,
.gmv-profit-card__primary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-profit-card header strong,
.gmv-profit-card header small,
.gmv-profit-card__primary small,
.gmv-profit-card__primary strong {
  display: block;
}
.gmv-profit-card header small,
.gmv-profit-card__primary small {
  margin-top: 3px;
  color: #78869a;
  font-size: 9px;
}
.gmv-profit-card__primary {
  margin: 14px 0;
  padding: 12px 0;
  border-top: 1px solid #293341;
  border-bottom: 1px solid #293341;
}
.gmv-profit-card__primary span {
  flex: 1;
}
.gmv-profit-card__primary strong {
  margin-top: 5px;
  font-size: 18px;
}
.gmv-profit-card dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 0;
}
.gmv-profit-card dl div {
  min-width: 0;
}
.gmv-profit-card dt {
  color: #78869a;
  font-size: 9px;
}
.gmv-profit-card dd {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 700;
}
.gmv-lifecycle {
  min-height: 24px;
  padding: 3px 8px;
  border: 1px solid #384454;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  color: #c9d2de;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.gmv-lifecycle.is-scaling {
  border-color: #347d61;
  color: #66d9a7;
  background: rgba(102, 217, 167, 0.08);
}
.gmv-lifecycle.is-mature {
  border-color: #735f31;
  color: #edc768;
  background: rgba(237, 199, 104, 0.08);
}
.gmv-lifecycle.is-declining,
.gmv-lifecycle.is-blocked {
  border-color: #7d3947;
  color: #f2869a;
  background: rgba(242, 134, 154, 0.08);
}
.gmv-lifecycle.is-validation {
  border-color: #5f4e8c;
  color: #b8a0f4;
  background: rgba(184, 160, 244, 0.08);
}
.gmv-lifecycle.is-exploration {
  border-color: #365f85;
  color: #75b9f5;
  background: rgba(117, 185, 245, 0.08);
}
.gmv-table--learning {
  min-width: 1420px;
}
.gmv-score {
  width: 76px;
  height: 5px;
  margin-bottom: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: #27313e;
}
.gmv-score span {
  height: 100%;
  display: block;
  border-radius: inherit;
  background: #51cfa0;
}
.gmv-table td.is-positive {
  color: #66d9a7;
}
.gmv-table td.is-negative {
  color: #f2869a;
}
.gmv-outcome-panel {
  margin-top: 12px;
}
.gmv-outcome-panel > .gmv-table-wrap {
  margin-top: 12px;
}
.is-danger-text {
  color: #f27a8e !important;
}
.gmv-capabilities {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.gmv-capabilities article {
  position: relative;
  min-height: 68px;
  padding: 11px 14px;
  display: flex;
  align-items: center;
  gap: 11px;
  border: 1px solid var(--theme-border, #293341);
  border-radius: 6px;
  background: var(--theme-panel, #121923);
  overflow: hidden;
}
.gmv-capabilities article::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: #42c997;
  content: "";
}
.gmv-capabilities article.is-disabled::before {
  background: #e2677e;
}
.gmv-capability-icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(66, 201, 151, 0.28);
  border-radius: 5px;
  background: rgba(66, 201, 151, 0.08);
}
.gmv-capabilities article.is-disabled .gmv-capability-icon {
  border-color: rgba(226, 103, 126, 0.3);
  background: rgba(226, 103, 126, 0.08);
}
.gmv-capabilities svg {
  width: 16px;
  height: 16px;
  color: #55d29f;
}
.gmv-capabilities article.is-disabled svg {
  color: #ec7a8f;
}
.gmv-capabilities strong,
.gmv-capabilities small {
  display: block;
}
.gmv-capabilities strong {
  color: var(--theme-text, #edf2f7);
  font-size: 11px;
  font-weight: 700;
}
.gmv-capabilities small {
  margin-top: 4px;
  color: var(--theme-text-muted, #7c899c);
  font-size: 9px;
}
.gmv-capabilities article > i {
  width: 6px;
  height: 6px;
  margin-left: auto;
  flex: 0 0 6px;
  border-radius: 50%;
  background: #42c997;
  box-shadow: 0 0 0 3px rgba(66, 201, 151, 0.1);
}
.gmv-capabilities article.is-disabled > i {
  background: #e2677e;
  box-shadow: 0 0 0 3px rgba(226, 103, 126, 0.1);
}
.gmv-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483000 !important;
  display: flex;
  justify-content: flex-end;
  background: rgba(3, 7, 12, 0.66);
  backdrop-filter: blur(2px);
  -webkit-app-region: no-drag;
}
.gmv-drawer {
  width: min(560px, 94vw);
  height: 100%;
  border-left: 1px solid #303a48;
  background: #0f151e;
  box-shadow: -24px 0 60px rgba(0, 0, 0, 0.38);
  overflow-y: auto;
}
.gmv-drawer.is-wide {
  width: min(1040px, 96vw);
}
.gmv-drawer > header {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 86px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #293341;
  background: #111923;
}
.gmv-drawer h2 {
  margin: 5px 0 0;
  font-size: 19px;
}
.gmv-drawer__eyebrow {
  color: #ef6079;
  font-size: 10px;
  font-weight: 800;
}
.gmv-drawer__body {
  padding: 18px 20px 30px;
}
.gmv-drawer__body > footer {
  position: sticky;
  bottom: -30px;
  margin: 20px -20px -30px;
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #293341;
  background: #111923;
}
.gmv-drawer-section {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #293341;
  background: #121923;
}
.gmv-drawer-section h3 {
  margin: 0 0 13px;
  font-size: 13px;
}
.gmv-drawer-section label {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
  color: #8f9bad;
  font-size: 10px;
}
.gmv-drawer-section input:not([type="checkbox"]),
.gmv-drawer-section select {
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid #303b49;
  border-radius: 4px;
  background: #0d131b;
  color: #eef2f7;
  box-sizing: border-box;
}
.gmv-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.gmv-summary-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-bottom: 14px;
}
.gmv-summary-strip span {
  padding: 11px;
  border: 1px solid #293341;
  background: #121923;
}
.gmv-summary-strip small,
.gmv-summary-strip strong {
  display: block;
}
.gmv-summary-strip small {
  color: #7f8c9e;
  font-size: 9px;
}
.gmv-summary-strip strong {
  margin-top: 5px;
  font-size: 13px;
}
.gmv-cost-catalog {
  min-height: 36px;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.gmv-cost-catalog small {
  color: #7f8c9e;
  font-size: 10px;
}
.gmv-summary-strip--cost strong {
  color: #6ee7b7;
}
.gmv-drawer-section__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}
.gmv-drawer-section__heading h3 {
  margin: 0 0 5px;
}
.gmv-drawer-section__heading p,
.gmv-section-hint {
  margin: 0;
  color: #7f8c9e;
  font-size: 11px;
  line-height: 1.55;
}
.gmv-sku-range {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(45, 212, 191, 0.24);
  border-radius: 8px;
  background: rgba(20, 184, 166, 0.06);
}
.gmv-sku-range > div {
  display: grid;
  gap: 4px;
}
.gmv-sku-range span {
  color: #8f9bad;
  font-size: 10px;
}
.gmv-sku-range strong {
  color: #f8fafc;
  font-size: 16px;
}
.gmv-sku-range p {
  grid-column: 1/-1;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 2px 0 0;
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.5;
}
.gmv-sku-section {
  display: grid;
  gap: 10px;
}
.gmv-sku-card {
  padding: 12px;
  border: 1px solid #2b3746;
  border-radius: 8px;
  background: #0e151e;
}
.gmv-sku-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.gmv-sku-card > header strong {
  color: #f8fafc;
  font-size: 12px;
}
.gmv-sku-card__preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding-top: 8px;
  border-top: 1px solid #25303d;
  color: #8f9bad;
  font-size: 10px;
}
.gmv-sku-card__preview strong {
  margin-left: 4px;
  color: #6ee7b7;
}
.gmv-sku-note {
  margin: 0;
  color: #fbbf24;
  font-size: 10px;
  line-height: 1.55;
}
.gmv-switch-row {
  min-height: 48px !important;
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #27303c;
}
.gmv-switch-row strong,
.gmv-switch-row small {
  display: block;
}
.gmv-switch-row small {
  margin-top: 3px;
  color: #69778b;
}
.gmv-switch-row input,
.gmv-permission-grid input {
  accent-color: #ef405f;
}
.gmv-permission-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.gmv-permission-grid label {
  min-height: 38px;
  margin: 0 !important;
  padding: 0 9px;
  display: flex !important;
  align-items: center;
  gap: 8px;
  border: 1px solid #293341;
  border-radius: 4px;
  background: #0e141d;
}
.gmv-action-hero {
  padding: 16px;
  margin-bottom: 14px;
  border-left: 3px solid #ef405f;
  background: #121923;
}
.gmv-action-hero h3 {
  margin: 10px 0 5px;
}
.gmv-action-hero p {
  margin: 0;
  color: #95a1b2;
  line-height: 1.6;
  font-size: 12px;
}
.gmv-workspace-identity {
  margin-bottom: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid #293441;
  border-left: 3px solid #22c4ad;
  background: #111923;
}
.gmv-workspace-identity strong,
.gmv-workspace-identity small {
  display: block;
}
.gmv-workspace-identity strong {
  margin-top: 8px;
  font-size: 16px;
}
.gmv-workspace-identity small {
  margin-top: 4px;
  color: #7e8b9e;
  font-size: 10px;
}
.gmv-workspace-tabs {
  margin-bottom: 12px;
  padding: 4px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  border: 1px solid #293441;
  background: #0d141d;
}
.gmv-workspace-tabs button {
  min-height: 38px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #8190a4;
  cursor: pointer;
}
.gmv-workspace-tabs button.is-active {
  background: #21303a;
  color: #65d9c2;
}
.gmv-workspace-kpis {
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: repeat(6, minmax(110px, 1fr));
  gap: 7px;
}
.gmv-workspace-kpis article {
  padding: 12px;
  border: 1px solid #293441;
  background: #111923;
}
.gmv-workspace-kpis span,
.gmv-workspace-kpis strong {
  display: block;
}
.gmv-workspace-kpis span {
  color: #7f8da0;
  font-size: 9px;
}
.gmv-workspace-kpis strong {
  margin-top: 7px;
  font-size: 18px;
}
.gmv-workspace-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.gmv-workspace-grid > article {
  padding: 14px;
  border: 1px solid #293441;
  background: #111923;
}
.gmv-workspace-grid h3 {
  margin: 0 0 10px;
  font-size: 13px;
}
.gmv-workspace-summary {
  margin-bottom: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #293441;
  background: #111923;
}
.gmv-workspace-summary span {
  color: #8997a9;
}
.gmv-table--workspace {
  min-width: 900px;
}
.gmv-mini-actions {
  display: grid;
  gap: 6px;
}
.gmv-mini-actions button {
  min-height: 52px;
  padding: 8px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  border: 1px solid #293441;
  background: #0e151e;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-mini-actions small {
  color: #78869a;
  font-size: 9px;
}
.gmv-filter-panel {
  margin-bottom: 10px;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr)) auto;
  gap: 8px;
  align-items: end;
  border: 1px solid #293341;
  background: #111823;
}
.gmv-filter-panel--creative {
  grid-template-columns: repeat(4, minmax(130px, 1fr));
}
.gmv-filter-panel--product {
  grid-template-columns: repeat(4, minmax(130px, 1fr));
}
.gmv-filter-panel--action {
  grid-template-columns: repeat(3, minmax(150px, 0.75fr)) minmax(500px, 1.75fr);
  align-items: center;
}
.gmv-filter-panel--audit {
  grid-template-columns: repeat(3, minmax(150px, 1fr)) auto;
}
.gmv-filter-panel--cost {
  grid-template-columns: minmax(150px, 1fr) minmax(150px, 0.8fr) minmax(
      150px,
      0.8fr
    ) minmax(200px, 1.2fr) auto;
}
.gmv-cost-summary {
  margin-bottom: 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 8px;
}
.gmv-cost-summary article {
  padding: 10px 12px;
  border: 1px solid #293441;
  border-radius: 5px;
  background: #101720;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-cost-summary span {
  color: #8794a7;
  font-size: 10px;
}
.gmv-cost-summary strong {
  font-size: 20px;
}
.gmv-filter-panel label {
  display: grid;
  gap: 5px;
  color: #7d899b;
  font-size: 9px;
}
.gmv-filter-panel input,
.gmv-filter-panel select {
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid #303a48;
  border-radius: 4px;
  background: #0d131b;
  color: #e5ebf3;
}
.gmv-action-sort-group {
  min-width: 0;
  min-height: 36px;
  padding: 3px;
  display: grid;
  grid-template-columns: auto repeat(3, minmax(0, 1fr));
  gap: 3px;
  align-items: center;
  border: 1px solid var(--theme-border-control, #303a48);
  border-radius: 5px;
  background: var(--theme-input, #0d131b);
}
.gmv-action-sort-group > span {
  padding: 0 8px;
  color: var(--theme-text-muted, #7d899b);
  font-size: 9px;
  white-space: nowrap;
}
.gmv-action-sort-group button {
  min-width: 0;
  min-height: 28px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--theme-text-muted, #8d9aad);
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}
.gmv-action-sort-group button:hover {
  background: var(--theme-panel-soft, #181f2b);
  color: var(--theme-text, #eef2f7);
}
.gmv-action-sort-group button.is-active {
  border-color: rgba(74, 205, 184, 0.34);
  background: rgba(36, 190, 167, 0.12);
  color: #63d7c4;
}
.gmv-action-sort-group svg {
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
}
.gmv-sort-button {
  min-height: 24px;
  padding: 2px 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.gmv-sort-button:hover {
  color: var(--theme-text, #eef2f7);
}
.gmv-sort-button > svg {
  width: 14px;
  height: 14px;
  color: #55c7da;
}
.gmv-sort-button small {
  min-height: 17px;
  margin-top: 0;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(85, 199, 218, 0.25);
  border-radius: 3px;
  background: rgba(85, 199, 218, 0.08);
  color: #67cfe0;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
}
.gmv-sort-button small:empty {
  display: none;
}
.gmv-sort-button--standalone {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--theme-border-control, #303a48);
  border-radius: 5px;
  background: var(--theme-input, #0d131b);
}
.gmv-table th:first-child,
.gmv-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--theme-panel, #111823);
}
.gmv-table th:first-child {
  z-index: 2;
}
.gmv-pagination {
  min-height: 50px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border: 1px solid #293341;
  border-top: 0;
  background: #111823;
  color: #8693a5;
  font-size: 10px;
}
.gmv-pagination select {
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid #303a48;
  border-radius: 4px;
  background: #0d131b;
  color: #e5ebf3;
}
.gmv-pagination--compact {
  min-height: 42px;
  padding: 6px 0 0;
  border: 0;
  background: transparent;
}
.gmv-setup-guide {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid var(--theme-border-control, #334155);
  border-left: 3px solid var(--theme-accent, #14b8a6);
  border-radius: 6px;
  background: var(--theme-panel, #111823);
}
.gmv-setup-guide > header {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gmv-setup-guide > header span,
.gmv-setup-guide > header strong {
  display: block;
}
.gmv-setup-guide > header span {
  color: var(--theme-accent, #14b8a6);
  font-size: 9px;
  font-weight: 800;
}
.gmv-setup-guide > header strong {
  margin-top: 4px;
  font-size: 15px;
}
.gmv-setup-guide__steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.gmv-setup-guide__steps button {
  min-height: 64px;
  padding: 10px;
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--theme-border, #293341);
  border-radius: 5px;
  background: var(--theme-panel-soft, #151827);
  color: var(--theme-text, #eef2f7);
  text-align: left;
  cursor: pointer;
}
.gmv-setup-guide__steps button > svg {
  width: 18px;
  color: var(--theme-text-muted, #8c99ac);
}
.gmv-setup-guide__steps button span,
.gmv-setup-guide__steps button strong,
.gmv-setup-guide__steps button small {
  display: block;
}
.gmv-setup-guide__steps button small {
  margin-top: 4px;
  color: var(--theme-text-muted, #8c99ac);
  font-size: 9px;
  line-height: 1.35;
}
.gmv-setup-guide__steps button.is-complete {
  border-color: var(--theme-accent, #14b8a6);
  background: var(--theme-accent-soft, #123f3b);
}
.gmv-setup-guide__steps button.is-complete > svg {
  color: var(--theme-accent, #14b8a6);
}
.gmv-panel,
.gmv-metrics article,
.gmv-control-strip,
.gmv-commandbar,
.gmv-catalog-strip,
.gmv-profit-card,
.gmv-phase-card,
.gmv-learning-summary article,
.gmv-product-lab__stats article,
.gmv-rule-card,
.gmv-drawer-section,
.gmv-workspace-grid > article,
.gmv-workspace-kpis article,
.gmv-workspace-summary {
  border-color: var(--theme-border, #293341) !important;
  background: var(--theme-panel, #111823) !important;
  color: var(--theme-text, #eef2f7);
}
.gmv-table-wrap,
.gmv-table th,
.gmv-filter-panel,
.gmv-pagination,
.gmv-list-panel,
.gmv-drawer,
.gmv-drawer > header,
.gmv-drawer__body > footer {
  border-color: var(--theme-border, #293341) !important;
  background: var(--theme-panel, #111823) !important;
  color: var(--theme-text, #eef2f7);
}
.gmv-table th,
.gmv-tabs,
.gmv-workspace-tabs {
  background: var(--theme-panel-soft, #151827) !important;
}
.gmv-table td {
  border-color: var(--theme-divider, #27303c) !important;
}
.gmv-table tbody tr:nth-child(odd) > td {
  background: var(--theme-panel, #111823);
}
.gmv-table tbody tr:nth-child(even) > td {
  background: color-mix(
    in srgb,
    var(--theme-panel-soft, #151827) 72%,
    var(--theme-panel, #111823)
  );
}
.gmv-table tbody tr:hover > td {
  background: color-mix(
    in srgb,
    var(--theme-accent, #14b8a6) 9%,
    var(--theme-panel, #111823)
  );
}
.gmv-table tbody td {
  transition: background-color 0.12s ease;
}
.gmv-commandbar input,
.gmv-commandbar select,
.gmv-filter-panel input,
.gmv-filter-panel select,
.gmv-pagination select,
.gmv-drawer-section input:not([type="checkbox"]),
.gmv-drawer-section select {
  border-color: var(--theme-border-control, #303a48) !important;
  background: var(--theme-input, #0d131b) !important;
  color: var(--theme-text, #eef2f7) !important;
}
.gmv-search,
.gmv-date-field,
.gmv-segments {
  border-color: var(--theme-border-control, #303a48) !important;
  background: var(--theme-input, #0d131b) !important;
  color: var(--theme-text-muted, #8c99ac) !important;
}
.gmv-search input,
.gmv-date-field input {
  background: transparent !important;
  color: var(--theme-text, #eef2f7) !important;
  color-scheme: inherit;
}
.gmv-segments button {
  color: var(--theme-text-muted, #8c99ac);
}
.gmv-segments button.is-active {
  background: var(--theme-control-selected, #123f3b);
  color: var(--theme-control-selected-text, #5eead4);
}
.gmv-button--secondary,
.gmv-icon-button {
  border-color: var(--theme-border-control, #303a48) !important;
  background: var(--theme-control, #171c2a) !important;
  color: var(--theme-text-secondary, #c6cfdb) !important;
}
.gmv-button--secondary:hover,
.gmv-icon-button:hover {
  background: var(--theme-control-hover, #20283a) !important;
}
.gmv-tab.is-active,
.gmv-workspace-tabs button.is-active {
  background: var(--theme-control-selected, #123f3b) !important;
  color: var(--theme-control-selected-text, #5eead4) !important;
}
.gmv-panel p,
.gmv-section__heading p,
.gmv-table small,
.gmv-profit-card small,
.gmv-phase-card small,
.gmv-learning-summary small {
  color: var(--theme-text-muted, #8c99ac) !important;
}
.gmv-control-strip__scope > strong,
.gmv-control-strip__cutoff strong,
.gmv-panel__heading h2,
.gmv-section__heading h2,
.gmv-profit-card header strong {
  color: var(--theme-text, #eef2f7) !important;
}

/* Keep operational text readable without scaling the entire desktop surface. */
.gmv-feature-nav__brand strong {
  font-size: 14px;
}
.gmv-feature-nav__brand small,
.gmv-feature-nav__status small,
.gmv-feature-nav__footer button span {
  font-size: 11px;
}
.gmv-tab {
  min-height: 46px;
  font-size: 13px;
  font-weight: 650;
}
.gmv-sop-context span,
.gmv-sop-object-bar__copy > small,
.gmv-sop-object-bar__copy > span:not(.gmv-sop-object-bar__meta),
.gmv-sop-object-bar__copy b,
.gmv-sop-object-bar__change,
.gmv-sop-object-bar__meta i {
  font-size: 10px;
}
.gmv-sop-object-bar__meta i {
  padding: 4px 7px;
}
.gmv-sop-decision__main > span,
.gmv-sop-decision__main > div small,
.gmv-sop-decision__settings label span,
.gmv-sop-decision__settings > small {
  font-size: 10px;
}
.gmv-sop-decision__main p,
.gmv-sop-decision__automation strong {
  font-size: 12px;
}
.gmv-sop-decision__automation small {
  font-size: 11px;
}
.gmv-sop-task-list time small,
.gmv-sop-task-list div > span,
.gmv-sop-task-empty small,
.gmv-sop-inline-toggle {
  font-size: 10px;
}
.gmv-sop-task-list strong {
  font-size: 12px;
}
.gmv-sop-task-list p {
  font-size: 11px;
  line-height: 1.55;
}
.gmv-sop-resolution > header small,
.gmv-sop-resolution dt,
.gmv-sop-resolution__solution small,
.gmv-sop-resolution-groups > section > header small,
.gmv-sop-resolution-list small {
  font-size: 10px;
}
.gmv-sop-resolution__main p,
.gmv-sop-resolution dd,
.gmv-sop-resolution__solution span,
.gmv-sop-resolution-item__body > p {
  font-size: 11px;
}
.gmv-sop-resolution__solution strong,
.gmv-sop-resolution details summary,
.gmv-sop-resolution-groups > section > header strong,
.gmv-sop-resolution-list strong {
  font-size: 11px;
}
.gmv-sop-disclosure__header strong {
  font-size: 13px;
}
.gmv-sop-disclosure__header small,
.gmv-sop-input__fields label span,
.gmv-sop-input__controls label span,
.gmv-sop-source-note {
  font-size: 11px;
}
.gmv-sop-grade-summary i {
  font-size: 10px;
}
.gmv-sop-video-grades > button {
  min-height: 56px;
  padding: 10px 12px;
}
.gmv-sop-video-grades span {
  font-size: 11px;
}
.gmv-sop-video-grades b {
  width: 25px;
  height: 25px;
  font-size: 11px;
}
.gmv-sop-video-sort {
  gap: 7px;
}
.gmv-sop-video-sort span,
.gmv-sop-video-sort select {
  font-size: 11px;
}
.gmv-sop-video-sort select {
  min-height: 40px;
}
.gmv-sop-video-list {
  max-height: 600px;
}
.gmv-sop-video-list__items > button {
  min-height: 90px;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 12px;
  padding: 10px;
}
.gmv-sop-video-list__cover {
  width: 54px;
  height: 76px;
}
.gmv-sop-video-list__copy strong {
  font-size: 12px;
}
.gmv-sop-video-list__copy small,
.gmv-sop-video-list__copy em {
  font-size: 10px;
}
.gmv-sop-video-list__copy b {
  min-width: 24px;
  height: 21px;
  font-size: 11px;
}
.gmv-sop-video-pagination {
  min-height: 48px;
  font-size: 11px;
}
.gmv-sop-video-pagination button {
  width: 32px;
  height: 32px;
}
.gmv-sop-video-detail__preview > div {
  font-size: 11px;
}
.gmv-sop-video-detail__preview > div small,
.gmv-sop-video-detail__preview > button span,
.gmv-sop-video-detail__duration {
  font-size: 10px;
}
.gmv-sop-video-detail__content > header span:first-child,
.gmv-sop-video-detail__content header p {
  font-size: 10px;
}
.gmv-sop-video-detail__content h3 {
  font-size: 17px;
}
.gmv-sop-video-meta {
  padding: 12px 0;
}
.gmv-sop-video-meta dt,
.gmv-sop-video-primary-metrics span,
.gmv-sop-video-secondary-metrics small {
  font-size: 10px;
}
.gmv-sop-video-meta dd,
.gmv-sop-video-secondary-metrics strong {
  font-size: 11px;
}
.gmv-sop-video-primary-metrics article {
  min-height: 68px;
  padding: 11px;
}
.gmv-sop-video-primary-metrics strong {
  font-size: 15px;
}
.gmv-sop-video-secondary-metrics > span {
  min-height: 38px;
  padding: 8px 10px;
  box-sizing: border-box;
}
.gmv-sop-video-actions {
  padding: 12px 14px;
}
.gmv-sop-video-actions strong,
.gmv-sop-video-analysis header strong {
  font-size: 11px;
}
.gmv-sop-video-actions span,
.gmv-sop-video-analysis header span,
.gmv-sop-video-analysis ul,
.gmv-sop-video-evidence summary,
.gmv-sop-video-evidence dt,
.gmv-sop-video-evidence dd {
  font-size: 10px;
}
.gmv-sop-video-actions .gmv-button {
  min-height: 36px;
  font-size: 11px;
}
.gmv-sop-video-actions .gmv-sop-video-actions__protected {
  font-size: 11px;
}
.gmv-sop-video-analysis ul {
  line-height: 1.65;
}
.gmv-sync-dialog__header span,
.gmv-sync-dialog__steps small {
  font-size: 10px;
}
.gmv-sync-dialog__header p,
.gmv-sync-dialog__steps strong,
.gmv-sync-dialog > footer {
  font-size: 11px;
}
.gmv-filter-panel label,
.gmv-action-sort-group > span,
.gmv-action-sort-group button,
.gmv-pagination {
  font-size: 11px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1100px) {
  .gmv-account-metadata {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-account-metadata article:nth-child(2) {
    border-right: 0;
  }
  .gmv-account-metadata article:last-child {
    grid-column: 1 / -1;
    border-top: 1px solid var(--border-color, #293240);
  }
}
@media (max-width: 780px) {
  .gmv-account-metadata {
    grid-template-columns: 1fr;
  }
  .gmv-account-metadata article {
    min-height: 88px;
    border-right: 0;
    border-bottom: 1px solid var(--border-color, #293240);
  }
  .gmv-account-metadata article:last-child {
    grid-column: auto;
    border-top: 0;
    border-bottom: 0;
  }
}
@media (max-width: 1350px) {
  .gmv-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-rule-grid {
    grid-template-columns: repeat(3, minmax(200px, 1fr));
  }
  .gmv-capabilities {
    grid-template-columns: repeat(4, minmax(110px, 1fr));
  }
  .gmv-lifecycle-pipeline {
    grid-template-columns: repeat(4, minmax(118px, 1fr));
  }
}
@media (max-width: 1100px) {
  .gmv-ops-grid,
  .gmv-creative-layout,
  .gmv-profit-grid,
  .gmv-creative-command {
    grid-template-columns: 1fr;
  }
  .gmv-control-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-control-strip__scope {
    grid-column: 1 / -1;
  }
  .gmv-section__heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .gmv-section__heading > div:first-child {
    min-width: 260px;
    flex: 1;
  }
  .gmv-section__heading > .gmv-row__actions {
    flex-wrap: wrap;
  }
  .gmv-catalog-strip {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }
  .gmv-catalog-strip > .gmv-button {
    justify-self: stretch;
  }
  .gmv-workspace-kpis {
    grid-template-columns: repeat(3, minmax(110px, 1fr));
  }
  .gmv-experiment-kpis {
    grid-template-columns: repeat(3, minmax(105px, 1fr));
  }
  .gmv-outcome-rail {
    grid-template-columns: repeat(3, minmax(130px, 1fr));
  }
  .gmv-list-panel {
    max-height: 280px;
    overflow-y: auto;
  }
  .gmv-policy {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-policy__identity {
    grid-column: span 3;
  }
  .gmv-policy--compact {
    grid-template-columns: minmax(220px, 1fr) minmax(
        150px,
        0.8fr
      ) 160px 90px 110px;
  }
  .gmv-policy--compact .gmv-policy__identity {
    grid-column: auto;
  }
  .gmv-rule-grid {
    grid-template-columns: repeat(2, minmax(210px, 1fr));
  }
  .gmv-evidence {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-form-grid,
  .gmv-form-grid--cost {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-product-lab__stats,
  .gmv-pacing-overview {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }
  .gmv-filter-panel,
  .gmv-filter-panel--creative {
    grid-template-columns: repeat(4, minmax(110px, 1fr));
  }
}
@media (max-width: 780px) {
  .gmv-workspace {
    padding: 14px;
  }
  .gmv-header {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-header__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .gmv-setup-guide__steps {
    grid-template-columns: 1fr 1fr;
  }
  .gmv-commandbar {
    grid-template-columns: 1fr 1fr;
  }
  .gmv-commandbar .gmv-search,
  .gmv-commandbar .gmv-segments,
  .gmv-commandbar .gmv-live {
    grid-column: 1 / -1;
  }
  .gmv-commandbar .gmv-segments {
    width: 100%;
  }
  .gmv-commandbar .gmv-segments button {
    flex: 1;
  }
  .gmv-tabs {
    justify-content: flex-start;
  }
  .gmv-tab {
    min-width: 96px;
  }
  .gmv-catalog-strip {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }
  .gmv-catalog-strip > .gmv-button {
    grid-column: 1 / -1;
  }
  .gmv-control-strip {
    grid-template-columns: 1fr 1fr;
    padding: 10px;
  }
  .gmv-control-strip > div {
    padding: 8px;
  }
  .gmv-control-strip__cutoff {
    grid-column: 1 / -1;
  }
  .gmv-metrics,
  .gmv-learning-summary,
  .gmv-product-lab__stats,
  .gmv-pacing-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-priority-grid {
    grid-template-columns: 1fr;
  }
  .gmv-metrics article {
    min-height: 108px;
  }
  .gmv-workspace-identity {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-workspace-tabs {
    grid-template-columns: repeat(2, 1fr);
  }
  .gmv-workspace-kpis,
  .gmv-experiment-kpis,
  .gmv-workspace-experiment {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }
  .gmv-experiment-board > header {
    flex-direction: column;
  }
  .gmv-experiment-flow {
    grid-template-columns: 1fr;
  }
  .gmv-experiment-flow > svg {
    transform: rotate(90deg);
  }
  .gmv-workspace-grid {
    grid-template-columns: 1fr;
  }
  .gmv-lifecycle-pipeline {
    grid-template-columns: repeat(2, minmax(118px, 1fr));
  }
  .gmv-grid--overview,
  .gmv-diff {
    grid-template-columns: 1fr;
  }
  .gmv-flow-chart {
    gap: 5px;
  }
  .gmv-health-row {
    grid-template-columns: 24px 8px minmax(150px, 1fr) 18px;
  }
  .gmv-health-row .gmv-health-state,
  .gmv-health-row .gmv-health-metric {
    display: none;
  }
  .gmv-rule-grid {
    grid-template-columns: 1fr;
  }
  .gmv-policy,
  .gmv-policy--compact,
  .gmv-form-grid,
  .gmv-form-grid--cost {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .gmv-policy__identity,
  .gmv-policy--compact .gmv-policy__identity {
    grid-column: auto;
  }
  .gmv-creative-hero {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-creative-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
  .gmv-creative-kpis span {
    border-left: 0;
    border-top: 1px solid var(--theme-border, #2b3543);
  }
  .gmv-funnel-track {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }
  .gmv-signal-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .gmv-capabilities {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }
  .gmv-two-col,
  .gmv-summary-strip,
  .gmv-permission-grid {
    grid-template-columns: 1fr;
  }
  .gmv-drawer {
    width: 100vw;
  }
  .gmv-drawer > header {
    min-height: 72px;
  }
  .gmv-section__heading {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-section__heading .gmv-row__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
@media (max-width: 780px) {
  .gmv-tabs {
    display: flex;
    justify-content: flex-start;
  }
  .gmv-tab {
    min-width: 96px;
  }
}
@media (max-width: 1100px) {
  .gmv-cost-summary {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
  .gmv-filter-panel--cost {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }
}
@media (max-width: 780px) {
  .gmv-cost-summary,
  .gmv-filter-panel--cost {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 780px) {
  .gmv-notification-form {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 1100px) {
  .gmv-filter-panel--action {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
  }
  .gmv-action-sort-group {
    grid-column: 1 / -1;
  }
  .gmv-capabilities {
    grid-template-columns: repeat(2, minmax(160px, 1fr));
  }
}
@media (max-width: 780px) {
  .gmv-filter-panel--action {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
  .gmv-filter-panel--action > select:nth-child(3) {
    grid-column: 1 / -1;
  }
  .gmv-action-sort-group {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-action-sort-group > span {
    grid-column: 1 / -1;
    padding: 3px 5px 2px;
  }
}
@media (max-width: 780px) {
  .gmv-image-preview {
    padding: 12px;
  }
  .gmv-image-preview > section {
    width: 100%;
    max-height: 94vh;
  }
  .gmv-image-preview__stage {
    min-height: 240px;
    padding: 10px;
  }
  .gmv-image-preview__stage img {
    max-height: calc(94vh - 83px);
  }
}
@media (max-width: 1180px) {
  .gmv-feature-layout {
    grid-template-columns: 64px minmax(0, 1fr);
  }
  .gmv-feature-nav__brand {
    padding-inline: 5px;
    justify-content: center;
  }
  .gmv-feature-nav__brand div,
  .gmv-tab__label,
  .gmv-feature-nav__status small,
  .gmv-feature-nav__footer button span {
    display: none;
  }
  .gmv-feature-nav__footer > button,
  .gmv-feature-nav__status {
    padding: 0;
    justify-content: center;
  }
  .gmv-feature-nav .gmv-tab {
    min-width: 0;
    padding: 0;
    justify-content: center;
    overflow: visible;
  }
  .gmv-feature-nav .gmv-count {
    position: absolute;
    top: 3px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-size: 9px;
  }
}
@media (max-width: 780px) {
  .gmv-workspace {
    padding: 0;
  }
  .gmv-feature-content {
    padding: 14px 14px 40px;
  }
}
@media (max-width: 1350px) {
  .gmv-sop-context {
    display: none;
  }
  .gmv-sop-launch {
    grid-template-columns: 1fr;
  }
  .gmv-sop-launch__route {
    border-right: 0;
    border-bottom: 1px solid var(--theme-divider);
  }
  .gmv-sop-hero {
    grid-template-columns: minmax(220px, 1fr) auto;
  }
  .gmv-sop-hero dl {
    grid-column: 1 / -1;
  }
  .gmv-sop-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .gmv-sop-metrics article:not(:nth-child(6n)) {
    border-right: 0;
  }
  .gmv-sop-metrics article:not(:nth-child(4n)) {
    border-right: 1px solid var(--theme-divider);
  }
  .gmv-sop-metrics article:nth-child(n + 5) {
    border-top: 1px solid var(--theme-divider);
  }
}
@media (max-width: 1500px) {
  .gmv-mature-console > header,
  .gmv-sop-track-automation > header {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-mature-console__controls {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .gmv-sop-tasks--focus .gmv-sop-task-list article {
    grid-template-columns: 58px minmax(0, 1fr);
  }
  .gmv-sop-tasks--focus .gmv-sop-task-list .gmv-button {
    grid-column: 1 / -1;
    width: 100%;
  }
}
@media (max-width: 1100px) {
  .gmv-sop-heading {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .gmv-sop-heading .gmv-row__actions {
    justify-content: flex-start;
  }
  .gmv-sop-instance-select {
    width: min(100%, 520px);
  }
  .gmv-sop-context {
    display: none;
  }
  .gmv-sop-launch__route {
    padding: 16px 20px;
  }
  .gmv-sop-launch__route > p {
    display: none;
  }
  .gmv-sop-launch__phases {
    margin-top: 14px;
  }
  .gmv-sop-launch__phases > div {
    padding-top: 10px;
  }
  .gmv-sop-launch__phases > div:not(:last-child)::after {
    top: 17px;
  }
  .gmv-sop-launch__phases strong {
    margin-top: 6px;
  }
  .gmv-sop-launch__form {
    padding: 16px 20px;
  }
  .gmv-sop-readiness {
    grid-template-columns: 1fr;
  }
  .gmv-sop-rail {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-sop-rail > div:nth-child(3n) {
    border-right: 0;
  }
  .gmv-sop-rail > div:nth-child(n + 4) {
    border-top: 1px solid var(--theme-divider);
  }
  .gmv-sop-grid {
    grid-template-columns: 1fr;
  }
  .gmv-sop-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-sop-metrics article:not(:nth-child(4n)) {
    border-right: 0;
  }
  .gmv-sop-metrics article:not(:nth-child(3n)) {
    border-right: 1px solid var(--theme-divider);
  }
  .gmv-sop-metrics article:nth-child(n + 4) {
    border-top: 1px solid var(--theme-divider);
  }
}
@media (max-width: 1100px) {
  .gmv-mature-console > header {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-mature-console__controls {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .gmv-mature-console__signals {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-mature-console__signals article:nth-child(3n) {
    border-right: 0;
  }
  .gmv-mature-console__signals article:nth-child(n + 4) {
    border-top: 1px solid #2b3948;
  }
}
@media (max-width: 1350px) {
  .gmv-sop-object-bar__copy > strong {
    max-width: 660px;
  }
  .gmv-sop-picker__item {
    grid-template-columns: 52px minmax(190px, 0.8fr) minmax(250px, 1.2fr) 18px;
  }
  .gmv-sop-grade-summary i {
    min-width: 68px;
  }
  .gmv-sop-grade-summary i b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
@media (max-width: 1600px) {
  .gmv-sop-video-toolbar {
    grid-template-columns: 1fr;
  }
  .gmv-sop-video-sort {
    width: 210px;
  }
  .gmv-sop-video-workspace {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .gmv-sop-video-detail {
    grid-template-columns: 160px minmax(0, 1fr);
    gap: 14px;
    padding: 14px;
  }
  .gmv-sop-video-meta,
  .gmv-sop-video-primary-metrics,
  .gmv-sop-video-secondary-metrics,
  .gmv-sop-video-evidence dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-sop-video-meta > div:nth-child(2) {
    border-right: 0;
  }
  .gmv-sop-video-meta > div:nth-child(n + 3) {
    margin-top: 8px;
  }
  .gmv-sop-video-primary-metrics article:nth-child(2) {
    border-right: 0;
  }
  .gmv-sop-video-primary-metrics article:nth-child(n + 3) {
    border-top: 1px solid var(--theme-divider);
  }
  .gmv-sop-video-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .gmv-sop-video-actions > div:last-child {
    flex-wrap: wrap;
  }
}
@media (max-width: 1100px) {
  .gmv-sop-main-grid,
  .gmv-sop-insight-grid,
  .gmv-sop-detail-grid {
    grid-template-columns: 1fr;
  }
  .gmv-sop-detail-grid .gmv-sop-disclosure.is-expanded {
    grid-column: auto;
  }
  .gmv-sop-decision {
    grid-template-columns: 1fr;
  }
  .gmv-sop-decision__automation {
    border-top: 1px solid var(--theme-divider);
    border-left: 0;
  }
  .gmv-sop-object-bar__copy > strong {
    max-width: 520px;
  }
  .gmv-sop-picker__toolbar {
    grid-template-columns: minmax(220px, 1fr) 170px;
  }
  .gmv-sop-picker__toolbar > span {
    grid-column: 1 / -1;
  }
  .gmv-sop-picker__item {
    grid-template-columns: 48px minmax(0, 0.9fr) minmax(0, 1.1fr) 16px;
  }
  .gmv-sop-picker__image {
    width: 46px;
    height: 46px;
  }
  .gmv-sop-grade-summary {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .gmv-sop-grade-summary > svg {
    flex: 0 0 15px;
  }
  .gmv-external-operation__form {
    grid-template-columns: 1fr;
  }
  .gmv-external-operation__form .is-wide {
    grid-column: auto;
  }
}
@media (max-width: 1100px) {
  .gmv-sop-decision__settings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-sop-input__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-mature-console__signals {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 780px) {
  .gmv-sop-launch__route,
  .gmv-sop-launch__form {
    padding: 18px;
  }
  .gmv-sop-launch__phases {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px 0;
  }
  .gmv-sop-launch__phases > div:not(:last-child)::after {
    display: none;
  }
  .gmv-sop-launch__fields {
    grid-template-columns: 1fr;
  }
  .gmv-sop-launch__footer {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-sop-launch__footer .gmv-button {
    width: 100%;
  }
  .gmv-sop-readiness {
    grid-template-columns: 1fr;
  }
  .gmv-sop-readiness dl {
    grid-template-columns: 1fr;
  }
  .gmv-sop-readiness dl > div {
    padding: 9px 0;
    border-left: 0;
    border-top: 1px solid var(--theme-divider);
  }
  .gmv-sop-hero {
    grid-template-columns: 1fr auto;
    gap: 14px;
  }
  .gmv-sop-hero dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-sop-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-sop-rail > div:nth-child(3n) {
    border-right: 1px solid var(--theme-divider);
  }
  .gmv-sop-rail > div:nth-child(2n) {
    border-right: 0;
  }
  .gmv-sop-rail > div:nth-child(n + 3) {
    border-top: 1px solid var(--theme-divider);
  }
  .gmv-sop-metrics,
  .gmv-sop-key-section .gmv-sop-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-sop-metrics article:not(:nth-child(3n)),
  .gmv-sop-key-section .gmv-sop-metrics article:nth-child(3n) {
    border-right: 0;
  }
  .gmv-sop-metrics article:not(:nth-child(2n)),
  .gmv-sop-key-section .gmv-sop-metrics article:not(:nth-child(2n)) {
    border-right: 1px solid var(--theme-divider);
  }
  .gmv-sop-metrics article:nth-child(n + 3) {
    border-top: 1px solid var(--theme-divider);
  }
  .gmv-sop-input__scope,
  .gmv-sop-input__fields,
  .gmv-sop-input__controls,
  .gmv-sop-decision__settings {
    grid-template-columns: 1fr;
  }
  .gmv-mature-console > header,
  .gmv-sop-track-automation > header {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-mature-console > header select {
    width: 100%;
    flex-basis: auto;
  }
  .gmv-mature-console__controls {
    display: grid;
    grid-template-columns: 1fr;
  }
  .gmv-mature-console__controls .gmv-button,
  .gmv-mature-console__controls .gmv-icon-button {
    width: 100%;
  }
  .gmv-sop-automation-status {
    grid-template-columns: 1fr;
  }
  .gmv-sop-automation-status strong {
    white-space: normal;
  }
  .gmv-mature-console__signals,
  .gmv-mature-console__baselines {
    grid-template-columns: 1fr;
  }
  .gmv-mature-console__signals article,
  .gmv-mature-console__baselines > article {
    border-right: 1px solid var(--theme-divider);
    border-top: 1px solid var(--theme-divider);
  }
}
@media (max-width: 780px) {
  .gmv-sop-object-bar {
    grid-template-columns: minmax(0, 1fr) 40px;
  }
  .gmv-sop-object-bar__selector {
    padding: 12px;
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 10px;
  }
  .gmv-sop-object-bar__image {
    width: 44px;
    height: 44px;
  }
  .gmv-sop-object-bar__change {
    grid-column: 2;
    justify-self: start;
  }
  .gmv-sop-object-bar__copy > strong {
    max-width: none;
    font-size: 13px;
  }
  .gmv-sop-decision__main {
    padding: 16px;
  }
  .gmv-sop-decision__main h3 {
    font-size: 17px;
  }
  .gmv-sop-decision__automation {
    padding: 14px 16px;
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-sop-decision__automation .gmv-button {
    width: 100%;
  }
  .gmv-sop-decision__settings {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-sop-decision__settings label,
  .gmv-sop-decision__settings select,
  .gmv-sop-decision__settings .gmv-button {
    width: 100%;
  }
  .gmv-sop-decision__settings > small {
    flex-basis: auto;
    text-align: left;
  }
  .gmv-sop-tasks--focus .gmv-sop-task-list article {
    grid-template-columns: 58px minmax(0, 1fr);
  }
  .gmv-sop-tasks--focus .gmv-sop-task-list .gmv-button {
    grid-column: 1 / -1;
    width: 100%;
  }
  .gmv-sop-key-section > header,
  .gmv-sop-phase-section > header {
    align-items: flex-start;
    flex-direction: column;
  }
  .gmv-sop-disclosure__header {
    align-items: flex-start;
  }
  .gmv-sop-input__bound-scope {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-sop-input__bound-scope label {
    flex-basis: auto;
  }
  .gmv-sop-grade-summary {
    max-width: 54%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) 15px;
  }
  .gmv-sop-grade-summary i {
    min-width: 0;
  }
  .gmv-sop-grade-summary > svg {
    grid-column: 3;
    grid-row: 1 / 3;
    align-self: center;
  }
  .gmv-sop-picker-overlay {
    padding: 10px;
  }
  .gmv-sop-picker {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
  }
  .gmv-sop-picker > header {
    padding: 14px;
  }
  .gmv-sop-picker > header h2 {
    font-size: 16px;
  }
  .gmv-sop-picker__summary {
    grid-template-columns: 1fr;
  }
  .gmv-sop-picker__summary span {
    border-right: 0;
    border-bottom: 1px solid var(--theme-divider);
  }
  .gmv-sop-picker__summary span:last-child {
    border-bottom: 0;
  }
  .gmv-sop-picker__toolbar {
    padding: 10px;
    grid-template-columns: 1fr;
  }
  .gmv-sop-picker__toolbar > span {
    grid-column: auto;
  }
  .gmv-sop-picker__item {
    grid-template-columns: 42px minmax(0, 1fr) 14px;
    gap: 9px;
  }
  .gmv-sop-picker__image {
    width: 40px;
    height: 40px;
  }
  .gmv-sop-picker__campaign {
    grid-column: 2;
  }
  .gmv-sop-picker__item > svg {
    grid-column: 3;
    grid-row: 1 / 3;
  }
  .gmv-sop-picker__list article {
    grid-template-columns: minmax(0, 1fr) 34px;
  }
  .gmv-sop-picker__copy {
    width: 34px;
  }
}
@media (max-width: 780px) {
  .gmv-sop-video-insights {
    padding: 10px;
  }
  .gmv-sop-video-grades {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gmv-sop-video-sort {
    width: 100%;
  }
  .gmv-sop-video-workspace {
    grid-template-columns: 1fr;
  }
  .gmv-sop-video-list {
    max-height: 250px;
    border-right: 0;
    border-bottom: 1px solid var(--theme-divider);
  }
  .gmv-sop-video-detail {
    grid-template-columns: 120px minmax(0, 1fr);
    padding: 12px;
  }
  .gmv-sop-video-detail__preview {
    max-height: 220px;
  }
  .gmv-sop-video-meta {
    grid-template-columns: 1fr;
  }
  .gmv-sop-video-meta > div {
    padding: 6px 0;
    border-right: 0;
    border-bottom: 1px solid var(--theme-divider);
  }
  .gmv-sop-video-meta > div:last-child {
    border-bottom: 0;
  }
  .gmv-sop-video-primary-metrics,
  .gmv-sop-video-secondary-metrics,
  .gmv-sop-video-evidence dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 620px) {
  .gmv-sync-overlay {
    padding: 12px;
  }
  .gmv-sync-dialog__header {
    padding: 22px 20px 18px;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    gap: 12px;
  }
  .gmv-sync-dialog__signal {
    width: 46px;
    height: 46px;
  }
  .gmv-sync-dialog__header h2 {
    font-size: 17px;
  }
  .gmv-sync-dialog__track {
    margin: 0 20px;
  }
  .gmv-sync-dialog__steps {
    padding: 20px;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .gmv-sync-dialog__steps > div:not(:last-child) {
    padding: 0 0 12px;
    border-right: 0;
    border-bottom: 1px solid #26313e;
  }
  .gmv-sync-dialog__steps > div:not(:first-child) {
    padding-left: 0;
  }
  .gmv-sync-dialog > footer {
    padding: 0 20px;
  }
  .gmv-sync-dialog > footer small {
    display: none;
  }
}
@media (max-width: 1100px) {
  .gmv-sop-picker > header {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
  }
  .gmv-sop-picker__header-side {
    justify-content: space-between;
  }
  .gmv-sop-picker__summary {
    flex: 1 1 auto;
  }
  .gmv-sop-picker__item {
    grid-template-columns: 52px minmax(0, 0.9fr) minmax(0, 1.1fr) 16px;
  }
  .gmv-sop-picker__image {
    width: 50px;
    height: 50px;
  }
}
@media (max-width: 780px) {
  .gmv-sop-picker-overlay {
    padding: 10px;
  }
  .gmv-sop-picker {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
  }
  .gmv-sop-picker > header {
    min-height: 0;
    padding: 16px;
  }
  .gmv-sop-picker__heading h2 {
    font-size: 18px;
  }
  .gmv-sop-picker__header-side {
    align-items: stretch;
  }
  .gmv-sop-picker__summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gmv-sop-picker__summary span {
    min-height: 48px;
    padding: 7px 8px;
    border: 1px solid var(--theme-divider);
    font-size: 8px;
  }
  .gmv-sop-picker__summary strong {
    font-size: 15px;
  }
  .gmv-sop-picker__toolbar {
    padding: 10px;
    grid-template-columns: 1fr;
  }
  .gmv-sop-picker__toolbar > span {
    grid-column: auto;
  }
  .gmv-sop-picker__list {
    max-height: none;
    padding: 10px;
  }
  .gmv-sop-picker__list article {
    grid-template-columns: minmax(0, 1fr) 38px;
  }
  .gmv-sop-picker__item {
    grid-template-columns: 46px minmax(0, 1fr) 14px;
    gap: 10px;
    padding: 12px;
  }
  .gmv-sop-picker__image {
    width: 44px;
    height: 44px;
  }
  .gmv-sop-picker__campaign {
    grid-column: 2;
  }
  .gmv-sop-picker__item > svg {
    grid-column: 3;
    grid-row: 1 / 3;
  }
  .gmv-sop-picker__copy {
    width: 38px;
  }
}
.gmv-sop {
  --theme-text-muted: #a9b6c7;
  --theme-text-secondary: #d1dae6;
}
.gmv-sop-heading h2 {
  font-size: 24px;
}
.gmv-sop-heading p {
  color: var(--theme-text-muted);
  font-size: 13px;
}
.gmv-sop-heading .gmv-button {
  min-height: 44px;
  padding: 0 14px;
  font-size: 13px;
}
.gmv-sop .gmv-panel__heading h2 {
  font-size: 18px;
}
.gmv-sop .gmv-panel__heading p {
  font-size: 12px;
}
.gmv-sop .gmv-status {
  font-size: 11px;
}
.gmv-decision-scope__label strong {
  font-size: 12px;
}
.gmv-decision-scope__label small {
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-decision-store-tabs button strong {
  font-size: 12px;
}
.gmv-decision-store-tabs button small {
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-decision-scope-filter > span {
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.gmv-decision-scope-filter button {
  font-size: 11px;
}
.gmv-decision-scope__total {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-today-status span,
.gmv-today-status small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-today-status strong {
  font-size: 25px;
}
.gmv-decision-panel-heading h2 {
  font-size: 18px;
}
.gmv-decision-panel-heading p {
  color: var(--theme-text-muted);
  font-size: 12px;
}
.gmv-decision-filters button,
.gmv-decision-filters > span {
  font-size: 11px;
}
.gmv-decision-card__identity > small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-decision-card__title {
  font-size: 14px;
}
.gmv-decision-card__scope i {
  font-size: 10px;
}
.gmv-decision-card__metrics small {
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-decision-card__metrics strong {
  font-size: 13px;
}
.gmv-decision-card__metrics em {
  color: var(--theme-text-muted);
  font-size: 10px;
}
.gmv-decision-card .gmv-decision-status,
.gmv-decision-card .gmv-decision-action {
  font-size: 10px;
}
.gmv-decision-card__action > small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-decision-pagination {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-object-bar__copy > small,
.gmv-sop-object-bar__copy > span:not(.gmv-sop-object-bar__meta),
.gmv-sop-object-bar__copy b,
.gmv-sop-object-bar__change {
  font-size: 12px;
}
.gmv-sop-object-bar__copy > strong {
  font-size: 20px;
}
.gmv-sop-object-bar__meta i {
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.gmv-sop-launch__eyebrow small {
  font-size: 11px;
}
.gmv-sop-launch__eyebrow strong {
  font-size: 19px;
}
.gmv-sop-launch__route > p {
  color: var(--theme-text-muted);
  font-size: 13px;
}
.gmv-sop-launch__phases strong {
  font-size: 11px;
}
.gmv-sop-launch__phases small {
  font-size: 10px;
}
.gmv-sop-launch__form > header div > span {
  font-size: 11px;
}
.gmv-sop-launch__form > header div > strong {
  font-size: 16px;
}
.gmv-sop-launch__fields label > span {
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.gmv-sop-launch__footer > span {
  font-size: 12px;
}
.gmv-sop-decision__main > span {
  color: var(--theme-text-secondary);
  font-size: 12px;
}
.gmv-sop-decision__main h3 {
  font-size: 26px;
}
.gmv-sop-decision__main p {
  color: var(--theme-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.gmv-sop-decision__main > div small {
  color: var(--theme-text-muted);
  font-size: 12px;
}
.gmv-sop-decision__automation strong {
  font-size: 14px;
}
.gmv-sop-decision__automation small {
  color: var(--theme-text-muted);
  font-size: 12px;
}
.gmv-sop-decision__settings label span,
.gmv-sop-decision__settings > small {
  font-size: 11px;
}
.gmv-sop-resolution > header small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-resolution__main h3 {
  font-size: 19px;
}
.gmv-sop-resolution__main p {
  color: var(--theme-text-secondary);
  font-size: 13px;
}
.gmv-sop-resolution dt {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-resolution dd {
  font-size: 13px;
}
.gmv-sop-resolution__solution strong {
  font-size: 12px;
}
.gmv-sop-resolution__solution span {
  font-size: 13px;
}
.gmv-sop-resolution__solution small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-resolution details summary {
  font-size: 12px;
}
.gmv-sop-resolution-groups > section > header strong,
.gmv-sop-resolution-list strong {
  font-size: 12px;
}
.gmv-sop-resolution-groups > section > header small,
.gmv-sop-resolution-list small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-resolution-item__body > p {
  color: var(--theme-text-secondary);
  font-size: 12px;
}
.gmv-sop-task-list time {
  font-size: 14px;
}
.gmv-sop-task-list time small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-task-list strong {
  font-size: 14px;
}
.gmv-sop-task-list p {
  color: var(--theme-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
.gmv-sop-task-list div > span {
  font-size: 11px;
}
.gmv-sop-metrics span {
  color: var(--theme-text-muted);
  font-size: 12px;
}
.gmv-sop-metrics strong {
  font-size: 21px;
}
.gmv-sop-key-section header span,
.gmv-sop-phase-section header span {
  font-size: 11px;
}
.gmv-sop-key-section header strong,
.gmv-sop-phase-section header strong {
  font-size: 14px;
}
.gmv-sop-disclosure__header strong {
  font-size: 15px;
}
.gmv-sop-disclosure__header small {
  color: var(--theme-text-muted);
  font-size: 12px;
}
.gmv-sop-input__fields label span,
.gmv-sop-input__controls label span {
  font-size: 12px;
}
.gmv-sop-source-note {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-video-grades span {
  font-size: 12px;
}
.gmv-sop-video-sort span,
.gmv-sop-video-sort select {
  font-size: 12px;
}
.gmv-sop-video-list__copy strong {
  font-size: 13px;
}
.gmv-sop-video-list__copy small,
.gmv-sop-video-list__copy em {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-video-pagination {
  color: var(--theme-text-muted);
  font-size: 12px;
}
.gmv-sop-video-detail__preview > div {
  font-size: 12px;
}
.gmv-sop-video-detail__preview > div small,
.gmv-sop-video-detail__duration {
  font-size: 11px;
}
.gmv-sop-video-detail__content > header span:first-child,
.gmv-sop-video-detail__content header p {
  font-size: 11px;
}
.gmv-sop-video-detail__content h3 {
  font-size: 19px;
}
.gmv-sop-video-meta dt,
.gmv-sop-video-primary-metrics span,
.gmv-sop-video-secondary-metrics small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-video-meta dd,
.gmv-sop-video-secondary-metrics strong {
  font-size: 12px;
}
.gmv-sop-video-primary-metrics strong {
  font-size: 16px;
}
.gmv-sop-video-actions strong,
.gmv-sop-video-analysis header strong {
  font-size: 13px;
}
.gmv-sop-video-actions span,
.gmv-sop-video-analysis header span,
.gmv-sop-video-analysis ul,
.gmv-sop-video-evidence summary,
.gmv-sop-video-evidence dt,
.gmv-sop-video-evidence dd {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-sop-video-analysis ul {
  color: var(--theme-text-secondary);
  line-height: 1.7;
}
.gmv-sop-video-actions .gmv-button {
  font-size: 12px;
}
.gmv-sop .gmv-button--secondary,
.gmv-sop .gmv-button--primary,
.gmv-sop .gmv-button--ghost {
  font-size: 13px;
}

.gmv-feature-content {
  background: #0b1118;
}
.gmv-feature-nav {
  background: #0a1017;
  border-right-color: #202b38;
}
.gmv-header {
  min-height: 76px;
  padding: 10px 0 18px;
  border-bottom: 1px solid #202b38;
}
.gmv-header h1 {
  font-size: 30px;
  font-weight: 760;
  letter-spacing: 0;
}
.gmv-header p {
  max-width: 760px;
  color: #aeb9c7;
  font-size: 13px;
}
.gmv-cockpit-scopebar {
  position: sticky;
  top: 8px;
  z-index: 20;
  min-width: 0;
  padding: 10px 12px;
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(190px, 0.8fr) auto auto;
  gap: 10px;
  align-items: center;
  border: 1px solid #2b3948;
  border-radius: 8px;
  background: rgba(18, 27, 38, 0.96);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(14px);
}
.gmv-cockpit-scopebar__identity,
.gmv-cockpit-scopebar__freshness {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}
.gmv-cockpit-scopebar__identity > svg {
  width: 20px;
  color: #55d6c2;
}
.gmv-cockpit-scopebar__identity span,
.gmv-cockpit-scopebar__freshness span {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.gmv-cockpit-scopebar small {
  color: #8998aa;
  font-size: 10px;
}
.gmv-cockpit-scopebar strong {
  overflow: hidden;
  color: #f3f6fa;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-cockpit-scopebar em {
  overflow: hidden;
  color: #a4b2c2;
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-cockpit-scopebar__segments,
.gmv-cockpit-scopebar__lifecycle {
  min-width: 0;
  padding: 3px;
  display: flex;
  gap: 3px;
  overflow-x: auto;
  border: 1px solid #304052;
  border-radius: 6px;
  background: #101923;
  scrollbar-width: thin;
}
.gmv-cockpit-scopebar__segments button,
.gmv-cockpit-scopebar__lifecycle button {
  min-height: 30px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #9eacbd;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.gmv-cockpit-scopebar__segments button:hover,
.gmv-cockpit-scopebar__lifecycle button:hover {
  background: #1c2a38;
  color: #f3f6fa;
}
.gmv-cockpit-scopebar__segments button.is-active,
.gmv-cockpit-scopebar__lifecycle button.is-active {
  background: #233544;
  color: #f4f7fb;
  box-shadow: inset 0 -2px #55d6c2;
}
.gmv-cockpit-scopebar__segments svg,
.gmv-cockpit-scopebar__lifecycle svg {
  width: 14px;
  height: 14px;
}
.gmv-cockpit-scopebar__lifecycle button.is-running.is-active {
  color: #6fe3ae;
  box-shadow: inset 0 -2px #6fe3ae;
}
.gmv-cockpit-scopebar__lifecycle button.is-paused.is-active {
  color: #f3c665;
  box-shadow: inset 0 -2px #f3c665;
}
.gmv-cockpit-scopebar__lifecycle button.is-closed.is-active {
  color: #b4c0ce;
  box-shadow: inset 0 -2px #8290a3;
}
.gmv-cockpit-scopebar__lifecycle button.is-exception.is-active {
  color: #ff8296;
  box-shadow: inset 0 -2px #ff8296;
}
.gmv-cockpit-scopebar__lifecycle b {
  color: inherit;
  font-size: 10px;
}
.gmv-cockpit-scopebar__freshness {
  padding-left: 9px;
  border-left: 1px solid #304052;
}
.gmv-freshness-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  border-radius: 50%;
  background: #65dfa7;
  box-shadow: 0 0 0 4px rgba(101, 223, 167, 0.12);
}
.gmv-freshness-dot.is-stale {
  background: #f4c45d;
  box-shadow: 0 0 0 4px rgba(244, 196, 93, 0.12);
}
.gmv-cockpit-scopebar__sync {
  min-height: 34px;
  white-space: nowrap;
}
.gmv-cockpit-scopebar__sync svg {
  width: 15px;
}
.gmv-cockpit-scopebar__filter {
  min-height: 34px;
}
.gmv-cockpit-scopebar__filter svg:last-child,
.gmv-today-details-toggle > svg {
  transition: transform 0.18s ease;
}
.gmv-cockpit-scopebar__filter svg.is-open,
.gmv-today-details-toggle > svg.is-open {
  transform: rotate(180deg);
}
.gmv-sop-heading {
  margin-bottom: 8px;
}
.gmv-sop-heading h2 {
  font-size: 25px;
  font-weight: 760;
}
.gmv-sop-heading p {
  font-size: 13px;
  color: #aeb9c7;
}
.gmv-decision-center {
  gap: 12px;
}
.gmv-decision-scope {
  border-color: #2b3948;
  background: #121c27;
}
.gmv-today-status article {
  min-height: 72px;
  background: #111b26;
  border-color: #2a3949;
}
.gmv-today-status strong {
  font-size: 27px;
}
.gmv-decision-table-panel {
  border-color: #2a3949;
  background: #0f1822;
}
.gmv-decision-panel-heading {
  min-height: 70px;
  padding: 14px 18px;
}
.gmv-decision-panel-heading h2 {
  font-size: 19px;
}
.gmv-decision-panel-heading p {
  font-size: 12px;
  color: #9eacbd;
}
.gmv-decision-card {
  min-height: 170px;
  padding: 12px 40px 12px 12px;
  border-color: #2a3949;
  background: #15202c;
}
.gmv-decision-card__media {
  width: 82px;
  height: 106px;
  border-color: #405164;
}
.gmv-decision-card__title {
  font-size: 15px;
}
.gmv-decision-card__metrics small {
  font-size: 10px;
}
.gmv-decision-card__metrics strong {
  font-size: 14px;
}
.gmv-decision-card__metrics em {
  font-size: 10px;
}
.gmv-decision-card__scope i {
  height: 23px;
  font-size: 10px;
}
.gmv-decision-card .gmv-decision-status,
.gmv-decision-card .gmv-decision-action {
  font-size: 11px;
}
.gmv-today-details-toggle {
  width: 100%;
  min-height: 58px;
  padding: 9px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #2b3948;
  border-radius: 7px;
  background: #111b26;
  color: #dce5ee;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-today-details-toggle:hover {
  border-color: #3c5165;
  background: #152230;
}
.gmv-today-details-toggle > span {
  min-width: 0;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  column-gap: 9px;
  align-items: center;
}
.gmv-today-details-toggle > span > svg {
  width: 18px;
  grid-row: 1 / 3;
  color: #55d6c2;
}
.gmv-today-details-toggle strong,
.gmv-today-details-toggle small {
  min-width: 0;
  display: block;
}
.gmv-today-details-toggle strong {
  font-size: 12px;
}
.gmv-today-details-toggle small {
  margin-top: 3px;
  overflow: hidden;
  color: #91a1b3;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-today-details-toggle > svg {
  width: 17px;
  flex: 0 0 17px;
  color: #91a1b3;
}

.gmv-command-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9900;
  display: flex;
  justify-content: flex-end;
  background: rgba(3, 7, 12, 0.54);
  backdrop-filter: blur(3px);
  pointer-events: auto;
}
.gmv-command-drawer {
  width: min(700px, 100vw);
  height: 100vh;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  border-left: 1px solid #3a4b5e;
  background: #101923;
  color: #f3f6fa;
  box-shadow: -24px 0 68px rgba(0, 0, 0, 0.46);
  pointer-events: auto;
}
.gmv-command-drawer__header {
  min-width: 0;
  padding: 18px 20px 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid #2b3948;
  background: #131e2a;
}
.gmv-command-drawer__identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.gmv-command-drawer__identity > span:last-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.gmv-command-drawer__identity small {
  color: #6fd6c5;
  font-size: 10px;
  font-weight: 750;
}
.gmv-command-drawer__identity strong {
  overflow: hidden;
  color: #f4f7fb;
  font-size: 18px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-command-drawer__identity em {
  overflow: hidden;
  color: #aeb9c7;
  font-size: 11px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-command-drawer__image {
  position: relative;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid #425569;
  border-radius: 7px;
  background: #1c2936;
  color: #8ea1b5;
}
.gmv-command-drawer__image svg {
  width: 22px;
}
.gmv-command-drawer__image img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gmv-command-drawer__context {
  min-width: 0;
  padding: 10px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  border-bottom: 1px solid #273646;
  background: #0e1721;
  color: #aeb9c7;
  font-size: 11px;
}
.gmv-command-drawer__context > span:not(.gmv-status) {
  padding: 4px 8px;
  border: 1px solid #314153;
  border-radius: 4px;
}
.gmv-command-drawer__tabs {
  min-width: 0;
  padding: 0 12px;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  border-bottom: 1px solid #2b3948;
  background: #111b26;
  scrollbar-width: thin;
}
.gmv-command-drawer__tabs button {
  min-height: 46px;
  padding: 0 10px;
  flex: 0 0 auto;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8e9daf;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.gmv-command-drawer__tabs button:hover {
  color: #e8eef5;
}
.gmv-command-drawer__tabs button.is-active {
  border-bottom-color: #55d6c2;
  color: #f4f7fb;
}
.gmv-command-drawer__body {
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  scrollbar-gutter: stable;
}
.gmv-command-drawer__section {
  display: grid;
  gap: 12px;
}
.gmv-command-drawer__section h3 {
  margin: 0;
  color: #f4f7fb;
  font-size: 22px;
  line-height: 1.25;
}
.gmv-command-drawer__section > p {
  margin: 0;
  color: #c0ccd9;
  font-size: 13px;
  line-height: 1.65;
}
.gmv-command-drawer__section .gmv-kicker {
  color: #6fd6c5;
  font-size: 10px;
  font-weight: 800;
}
.gmv-command-drawer__issue {
  padding: 13px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid rgba(255, 109, 132, 0.38);
  border-left: 3px solid #ff6d84;
  border-radius: 6px;
  background: rgba(255, 109, 132, 0.08);
}
.gmv-command-drawer__issue > svg {
  width: 18px;
  flex: 0 0 18px;
  color: #ff8296;
}
.gmv-command-drawer__issue strong,
.gmv-command-drawer__issue small {
  display: block;
}
.gmv-command-drawer__issue strong {
  color: #ffb2bf;
  font-size: 13px;
}
.gmv-command-drawer__issue small {
  margin-top: 5px;
  color: #cbd6e2;
  font-size: 11px;
  line-height: 1.5;
}
.gmv-command-drawer__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid #2c3c4e;
  border-radius: 6px;
  background: #15212d;
}
.gmv-command-drawer__facts > span {
  min-width: 0;
  padding: 13px;
  border-right: 1px solid #2c3c4e;
}
.gmv-command-drawer__facts > span:last-child {
  border-right: 0;
}
.gmv-command-drawer__facts small,
.gmv-command-drawer__facts strong,
.gmv-command-drawer__facts em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-command-drawer__facts small {
  color: #96a5b6;
  font-size: 10px;
}
.gmv-command-drawer__facts strong {
  margin-top: 7px;
  color: #f2f6fa;
  font-size: 18px;
}
.gmv-command-drawer__facts em {
  margin-top: 4px;
  color: #91a0b1;
  font-size: 10px;
  font-style: normal;
}
.gmv-command-drawer__primary {
  min-height: 42px;
  justify-content: center;
}
.gmv-command-drawer__section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.gmv-command-drawer__section-heading > span {
  display: grid;
  gap: 4px;
}
.gmv-command-drawer__section-heading small {
  color: #9eacbd;
  font-size: 11px;
}
.gmv-command-timeline {
  position: relative;
  display: grid;
  gap: 0;
}
.gmv-command-timeline::before {
  content: "";
  position: absolute;
  left: 9px;
  top: 15px;
  bottom: 15px;
  width: 1px;
  background: #3a4a5c;
}
.gmv-command-timeline article {
  position: relative;
  min-width: 0;
  padding: 0 0 18px 32px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}
.gmv-command-timeline__dot {
  position: absolute;
  left: 0;
  top: 2px;
  width: 19px;
  height: 19px;
  display: grid;
  place-items: center;
  border: 1px solid #53677c;
  border-radius: 50%;
  background: #14202c;
  color: #9aabba;
}
.gmv-command-timeline article.is-completed .gmv-command-timeline__dot {
  border-color: #5fdca8;
  color: #5fdca8;
}
.gmv-command-timeline__dot svg {
  width: 11px;
}
.gmv-command-timeline article small,
.gmv-command-timeline article strong,
.gmv-command-timeline article p {
  display: block;
}
.gmv-command-timeline article small {
  color: #93a3b5;
  font-size: 10px;
}
.gmv-command-timeline article strong {
  color: #f1f5f9;
  font-size: 13px;
}
.gmv-command-timeline article p {
  margin: 0;
  color: #b5c1cf;
  font-size: 11px;
  line-height: 1.5;
}
.gmv-command-timeline article .gmv-button {
  justify-self: start;
  min-height: 32px;
  margin-top: 3px;
  font-size: 11px;
}
.gmv-command-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid #2d3e50;
  border-radius: 6px;
  background: #15212d;
}
.gmv-command-metrics > span {
  min-width: 0;
  padding: 14px;
  border-right: 1px solid #2d3e50;
  border-bottom: 1px solid #2d3e50;
}
.gmv-command-metrics > span:nth-child(2n) {
  border-right: 0;
}
.gmv-command-metrics > span:nth-last-child(-n + 2) {
  border-bottom: 0;
}
.gmv-command-metrics small,
.gmv-command-metrics strong,
.gmv-command-metrics em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-command-metrics small {
  color: #97a6b7;
  font-size: 10px;
}
.gmv-command-metrics strong {
  margin-top: 7px;
  color: #f4f7fb;
  font-size: 18px;
}
.gmv-command-metrics em {
  margin-top: 4px;
  color: #8f9eaf;
  font-size: 10px;
  font-style: normal;
}
.gmv-command-drawer__freshness {
  padding: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #2d3e50;
  border-radius: 6px;
  background: #15212d;
}
.gmv-command-drawer__freshness > svg {
  width: 18px;
  color: #55d6c2;
}
.gmv-command-drawer__freshness strong,
.gmv-command-drawer__freshness small {
  display: block;
}
.gmv-command-drawer__freshness strong {
  color: #edf3f9;
  font-size: 12px;
}
.gmv-command-drawer__freshness small {
  margin-top: 3px;
  color: #9cabbc;
  font-size: 11px;
}
.gmv-command-creative-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.gmv-command-creative-grid article {
  min-width: 0;
  padding: 9px;
  display: grid;
  gap: 7px;
  border: 1px solid #2d3e50;
  border-radius: 6px;
  background: #15212d;
}
.gmv-command-creative-grid__cover {
  position: relative;
  height: 128px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 4px;
  background: #1a2734;
  color: #8fa2b6;
}
.gmv-command-creative-grid__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gmv-command-creative-grid__cover svg {
  width: 24px;
}
.gmv-command-creative-grid__cover i {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 3px 5px;
  border-radius: 3px;
  background: rgba(8, 13, 20, 0.84);
  color: #f3c862;
  font-size: 9px;
  font-style: normal;
}
.gmv-command-creative-grid strong {
  overflow: hidden;
  color: #eef3f8;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-command-creative-grid small {
  color: #9cabbc;
  font-size: 10px;
}
.gmv-command-history {
  display: grid;
  gap: 1px;
  border: 1px solid #2d3e50;
  border-radius: 6px;
  overflow: hidden;
  background: #2d3e50;
}
.gmv-command-history article {
  min-width: 0;
  padding: 12px;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto;
  gap: 7px 10px;
  align-items: center;
  background: #15212d;
}
.gmv-command-history article span,
.gmv-command-history article small {
  color: #98a7b8;
  font-size: 10px;
}
.gmv-command-history article strong {
  min-width: 0;
  overflow: hidden;
  color: #edf3f8;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-command-history article b {
  padding: 3px 5px;
  border: 1px solid #405367;
  border-radius: 3px;
  color: #a9bacb;
  font-size: 9px;
  font-weight: 700;
}
.gmv-command-history article b.is-completed {
  border-color: #3c8a6b;
  color: #6fe3ae;
}
.gmv-command-history article b.is-failed {
  border-color: #914b5a;
  color: #ff8296;
}
.gmv-command-drawer__footer {
  min-height: 70px;
  padding: 12px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #2b3948;
  background: #0d151e;
}
.gmv-command-drawer__footer .gmv-button {
  min-height: 42px;
}

.gmv-sync-status {
  position: fixed;
  top: 16px;
  right: 20px;
  z-index: 9800;
  width: min(470px, calc(100vw - 32px));
  display: flex;
  align-items: stretch;
  border: 1px solid #385268;
  border-radius: 7px;
  background: #12202d;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.35);
}
.gmv-sync-status__main {
  min-width: 0;
  flex: 1 1 auto;
  padding: 9px 10px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 82px 16px;
  gap: 9px;
  align-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.gmv-sync-status__main:hover {
  background: #182b3b;
}
.gmv-sync-status__signal {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid #3e6f77;
  border-radius: 5px;
  color: #62dfcc;
}
.gmv-sync-status__signal svg {
  width: 16px;
  animation: gmv-sync-pulse 1.4s ease-in-out infinite;
}
.gmv-sync-status__signal.is-complete {
  border-color: #3f8e6f;
  color: #6fe3ae;
}
.gmv-sync-status__signal.is-failed {
  border-color: #955265;
  color: #ff8296;
}
.gmv-sync-status__signal.is-complete svg,
.gmv-sync-status__signal.is-failed svg {
  animation: none;
}
.gmv-sync-status__copy,
.gmv-sync-status__copy strong,
.gmv-sync-status__copy small {
  min-width: 0;
  display: block;
}
.gmv-sync-status__copy strong {
  overflow: hidden;
  color: #eef3f8;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sync-status__copy small {
  margin-top: 3px;
  overflow: hidden;
  color: #a1b0c0;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmv-sync-status__progress {
  display: grid;
  gap: 4px;
  text-align: right;
}
.gmv-sync-status__progress b {
  color: #d9f9f4;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.gmv-sync-status__progress i {
  width: 82px;
  height: 4px;
  display: block;
  overflow: hidden;
  border-radius: 3px;
  background: #273847;
}
.gmv-sync-status__progress em {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #4fd5c2;
  transition: width 0.3s ease;
}
.gmv-sync-status__progress em.is-failed {
  background: #ef6079;
}
.gmv-sync-status__progress em.is-running {
  position: relative;
  overflow: hidden;
}
.gmv-sync-status__progress em.is-running::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.36),
    transparent
  );
  animation: gmv-sync-progress-shimmer 1.35s linear infinite;
}
.gmv-sync-status__main > svg {
  width: 15px;
  color: #91a3b6;
}
.gmv-sync-status__retry {
  width: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-left: 1px solid #385268;
  background: rgba(255, 109, 132, 0.08);
  color: #ff8296;
  cursor: pointer;
}
.gmv-sync-status__retry svg {
  width: 15px;
}
.gmv-sync-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  justify-content: flex-end;
  background: rgba(3, 7, 12, 0.38);
}
.gmv-sync-detail {
  width: min(520px, 100vw);
  height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border-left: 1px solid #3a4b5e;
  background: #101923;
  box-shadow: -20px 0 54px rgba(0, 0, 0, 0.4);
}
.gmv-sync-detail > header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #2b3948;
  background: #131e2a;
}
.gmv-sync-detail > header span {
  color: #6fd6c5;
  font-size: 10px;
  font-weight: 800;
}
.gmv-sync-detail > header h2 {
  margin: 5px 0 0;
  color: #f4f7fb;
  font-size: 20px;
}
.gmv-sync-detail > header p {
  margin: 6px 0 0;
  color: #aeb9c7;
  font-size: 11px;
  line-height: 1.5;
}
.gmv-sync-detail__body {
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
}
.gmv-sync-detail__percent {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.gmv-sync-detail__percent strong {
  color: #eaf4f5;
  font-size: 30px;
}
.gmv-sync-detail__percent span {
  color: #aeb9c7;
  font-size: 11px;
  text-align: right;
}
.gmv-sync-detail .gmv-sync-dialog__track {
  margin: 14px 0 0;
}
.gmv-sync-detail .gmv-sync-dialog__steps {
  padding: 22px 0;
}
.gmv-sync-detail__meta {
  margin: 0;
  display: grid;
  gap: 1px;
  border: 1px solid #2d3e50;
  border-radius: 6px;
  overflow: hidden;
  background: #2d3e50;
}
.gmv-sync-detail__meta > div {
  padding: 11px 12px;
  background: #15212d;
}
.gmv-sync-detail__meta dt {
  color: #91a1b3;
  font-size: 10px;
}
.gmv-sync-detail__meta dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: #e6edf3;
  font-size: 11px;
  line-height: 1.45;
}
.gmv-sync-detail > footer {
  min-height: 62px;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid #2b3948;
  background: #0d151e;
  color: #aeb9c7;
  font-size: 11px;
}
.gmv-sync-detail > footer > span {
  display: flex;
  align-items: center;
  gap: 7px;
}
.gmv-sync-detail > footer > span svg {
  width: 14px;
  color: #6fd6c5;
}
.gmv-sync-detail > footer > div {
  display: flex;
  gap: 7px;
}

.gmv-sop-tasks--focus > .gmv-sop-task-list:not(.is-completed-list) {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}
.gmv-sop-video-list {
  max-height: none;
  overflow: visible;
}
.gmv-sop-video-list__items {
  max-height: none;
  overflow: visible;
}

@media (max-width: 1250px) {
  .gmv-cockpit-scopebar {
    grid-template-columns: minmax(180px, 1fr) minmax(170px, 0.8fr) auto auto;
  }
}
@media (max-width: 900px) {
  .gmv-cockpit-scopebar {
    position: static;
    grid-template-columns: 1fr 1fr;
  }
  .gmv-cockpit-scopebar__identity,
  .gmv-cockpit-scopebar__freshness {
    grid-column: 1 / -1;
  }
  .gmv-cockpit-scopebar__segments,
  .gmv-cockpit-scopebar__lifecycle {
    min-width: 0;
  }
  .gmv-cockpit-scopebar__sync {
    grid-column: auto;
    grid-row: auto;
  }
  .gmv-command-drawer {
    width: min(620px, 100vw);
  }
}
@media (max-width: 620px) {
  .gmv-header {
    align-items: stretch;
    flex-direction: column;
  }
  .gmv-header__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .gmv-cockpit-scopebar {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .gmv-cockpit-scopebar__sync {
    width: 100%;
    justify-content: center;
  }
  .gmv-command-drawer__header {
    padding: 14px;
  }
  .gmv-command-drawer__body {
    padding: 15px;
  }
  .gmv-command-drawer__footer {
    padding: 10px 14px;
    flex-direction: column;
  }
  .gmv-command-drawer__footer .gmv-button {
    width: 100%;
    justify-content: center;
  }
  .gmv-command-drawer__facts {
    grid-template-columns: 1fr;
  }
  .gmv-command-drawer__facts > span {
    border-right: 0;
    border-bottom: 1px solid #2c3c4e;
  }
  .gmv-command-drawer__facts > span:last-child {
    border-bottom: 0;
  }
  .gmv-command-creative-grid {
    grid-template-columns: 1fr;
  }
  .gmv-sync-status {
    top: 8px;
    right: 8px;
    width: calc(100vw - 16px);
  }
  .gmv-sync-status__main {
    grid-template-columns: 30px minmax(0, 1fr) 58px 14px;
    gap: 7px;
  }
  .gmv-sync-status__progress i {
    width: 58px;
  }
}
.gmv-task-header { min-height: 68px; padding-bottom: 14px; }
.gmv-task-header { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 12px; }
.gmv-task-header .gmv-header__actions { width: 100%; display: flex; justify-content: flex-start; flex-wrap: wrap; gap: 8px; }
.gmv-v2-scope-button { width: 184px; min-height: 48px; padding: 6px 10px; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; gap: 8px; align-items: center; color: inherit; font: inherit; border: 1px solid var(--theme-border, #293341); border-radius: 7px; background: var(--theme-panel, #111823); text-align: left; cursor: pointer; }
.gmv-v2-scope-button > svg { width: 18px; color: #55d6c2; }.gmv-v2-scope-button > svg:last-child { width: 15px; color: var(--theme-text-muted, #8c99ac); }.gmv-v2-scope-button span,.gmv-v2-freshness span { min-width: 0; display: grid; gap: 1px; }.gmv-v2-scope-button small,.gmv-v2-freshness small { color: var(--theme-text-muted, #8c99ac); font-size: 11px; }.gmv-v2-scope-button strong,.gmv-v2-freshness strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.gmv-v2-freshness { min-width: 220px; min-height: 48px; padding: 6px 10px; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; align-items: center; border: 1px solid var(--theme-border, #293341); border-radius: 7px; background: var(--theme-panel, #111823); }.gmv-v2-freshness > svg { width: 18px; color: #58a8ff; }
.gmv-task-header h1 { font-size: 28px; }
.gmv-task-header p { max-width: 720px; font-size: 14px; line-height: 1.55; }
.gmv-task-scope { min-width: 0; min-height: 58px; margin-bottom: 12px; padding: 9px 12px; display: grid; grid-template-columns: minmax(180px, 1fr) minmax(220px, 1fr) auto; gap: 12px; align-items: center; border: 1px solid var(--theme-border, #293341); border-radius: 7px; background: var(--theme-panel, #111823); }
.gmv-task-scope > div { min-width: 0; display: flex; align-items: center; gap: 9px; }
.gmv-task-scope > div > svg { width: 18px; color: #55d6c2; }
.gmv-task-scope span { min-width: 0; display: grid; gap: 2px; }
.gmv-task-scope small { color: var(--theme-text-muted, #8c99ac); font-size: 12px; }
.gmv-task-scope strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.gmv-task-scope .gmv-button svg:last-child { transition: transform .18s ease; }
.gmv-task-scope .gmv-button svg.is-open { transform: rotate(180deg); }
.gmv-catalog-details,.gmv-advanced-details { min-width: 0; margin-bottom: 12px; overflow: hidden; border: 1px solid var(--theme-border, #293341); border-radius: 7px; background: var(--theme-panel, #111823); }
.gmv-catalog-details > summary,.gmv-advanced-details > summary { min-height: 54px; padding: 8px 13px; display: grid; grid-template-columns: 20px minmax(0, 1fr) 18px; gap: 10px; align-items: center; cursor: pointer; list-style: none; }
.gmv-catalog-details > summary::-webkit-details-marker,.gmv-advanced-details > summary::-webkit-details-marker { display: none; }
.gmv-catalog-details > summary > svg:first-child,.gmv-advanced-details > summary > svg:first-child { width: 18px; color: #55d6c2; }
.gmv-catalog-details > summary > svg:last-child,.gmv-advanced-details > summary > svg:last-child { width: 17px; color: var(--theme-text-muted, #8c99ac); transition: transform .18s ease; }
.gmv-catalog-details[open] > summary > svg:last-child,.gmv-advanced-details[open] > summary > svg:last-child { transform: rotate(180deg); }
.gmv-catalog-details summary span,.gmv-advanced-details summary span { min-width: 0; display: grid; gap: 2px; }
.gmv-catalog-details summary strong,.gmv-advanced-details summary strong { font-size: 14px; }
.gmv-catalog-details summary small,.gmv-advanced-details summary small { overflow: hidden; color: var(--theme-text-muted, #8c99ac); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.gmv-catalog-details .gmv-catalog-strip,.gmv-advanced-details > :not(summary) { margin: 0; border-right: 0; border-bottom: 0; border-left: 0; }
.gmv-advanced-details--embedded { margin: 10px 0; }
.gmv-task-summary { min-width: 0; margin-bottom: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.gmv-task-summary article { min-width: 0; min-height: 78px; padding: 12px 14px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; align-items: center; border: 1px solid var(--theme-border, #293341); border-left: 3px solid #7890a8; border-radius: 6px; background: var(--theme-panel, #111823); }
.gmv-task-summary article.is-danger { border-left-color: #ff607c; }.gmv-task-summary article.is-warning { border-left-color: #f2bd58; }.gmv-task-summary article.is-success { border-left-color: #57d6a0; }
.gmv-task-summary span { font-size: 14px; font-weight: 700; }.gmv-task-summary strong { grid-row: 1 / 3; grid-column: 2; font-size: 24px; }.gmv-task-summary small { min-width: 0; overflow: hidden; color: var(--theme-text-muted, #8c99ac); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.gmv-section__heading h2,.gmv-panel__heading h2 { font-size: 19px; }.gmv-section__heading p,.gmv-panel__heading p { font-size: 13px; line-height: 1.55; }
.gmv-table th { font-size: 12px; }.gmv-table td { font-size: 13px; }.gmv-table td small { font-size: 12px; line-height: 1.45; }
.gmv-filter-panel label { font-size: 12px; }
.gmv-profit-task-page { display: flex; flex-direction: column; }
.gmv-profit-task-page > .gmv-section__heading { order: 0; }.gmv-profit-task-page > [data-testid="gmv-product-cost-page"] { order: 1; }.gmv-profit-task-page > [data-testid="gmv-store-profit-summary"] { order: 2; }.gmv-profit-task-page > .gmv-store-cost-panel { order: 3; }.gmv-profit-task-page > .gmv-notification-panel { order: 4; }
.gmv-profit-task-page > [data-testid="gmv-product-cost-page"] { margin-bottom: 14px; }
.gmv-v2-results { margin-bottom: 12px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.gmv-v2-results article { min-width: 0; min-height: 104px; padding: 15px; display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 4px 11px; align-items: center; border: 1px solid var(--theme-border, #293341); border-radius: 7px; background: var(--theme-panel, #111823); }
.gmv-v2-results .gmv-metric-icon { grid-row: 1 / 4; width: 36px; height: 36px; }
.gmv-v2-results span { color: var(--theme-text-muted, #8c99ac); font-size: 13px; white-space: nowrap; }
.gmv-v2-results strong { overflow: hidden; font-size: 23px; text-overflow: ellipsis; white-space: nowrap; }
.gmv-v2-results small { color: var(--theme-text-muted, #8c99ac); font-size: 12px; }
.gmv-v2-signals { margin-bottom: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.gmv-v2-signals article { min-width: 0; min-height: 80px; padding: 12px 14px; display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 10px; align-items: center; border: 1px solid var(--theme-border, #293341); border-left: 3px solid #8796aa; border-radius: 7px; background: var(--theme-panel, #111823); }
.gmv-v2-signals article.is-risk { border-left-color: #ff607c; }.gmv-v2-signals article.is-opportunity { border-left-color: #55d6a0; }.gmv-v2-signals article.is-action { border-left-color: #58a8ff; }
.gmv-v2-signals > article > svg { width: 24px; color: #aab7c8; }.gmv-v2-signals div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; }.gmv-v2-signals span { font-size: 14px; font-weight: 700; }.gmv-v2-signals strong { grid-row: 1 / 3; grid-column: 2; font-size: 23px; }.gmv-v2-signals small { overflow: hidden; color: var(--theme-text-muted, #8c99ac); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.gmv-v2-action-list { display: grid; gap: 7px; }.gmv-v2-action-list > button { width: 100%; min-height: 78px; padding: 10px 12px; display: grid; grid-template-columns: 28px minmax(0, 1fr) minmax(145px, 190px) 20px; gap: 12px; align-items: center; color: inherit; border: 1px solid var(--theme-border, #293341); border-radius: 6px; background: var(--theme-bg-soft, #0e1620); text-align: left; cursor: pointer; }.gmv-v2-action-list > button:hover { border-color: #4b958b; background: #13221f; }.gmv-v2-action-list > button > em { width: 26px; height: 26px; display: grid; place-items: center; color: #0b1716; font-size: 12px; font-style: normal; font-weight: 800; border-radius: 50%; background: #55d6c2; }.gmv-v2-action-list__main,.gmv-v2-action-list__impact { min-width: 0; display: grid; gap: 4px; }.gmv-v2-action-list__main .gmv-status { width: max-content; }.gmv-v2-action-list__main strong,.gmv-v2-action-list__main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.gmv-v2-action-list__main strong { font-size: 14px; }.gmv-v2-action-list__main small,.gmv-v2-action-list__impact span,.gmv-v2-action-list__impact small { color: var(--theme-text-muted, #8c99ac); font-size: 12px; }.gmv-v2-action-list__impact strong { font-size: 15px; }.gmv-v2-action-list > button > svg { width: 18px; color: #55d6c2; }
.gmv-v2-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.gmv-v2-settings-grid > article { min-width: 0; min-height: 108px; padding: 15px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid var(--theme-border, #293341); border-radius: 7px; background: var(--theme-panel, #111823); }.gmv-v2-settings-grid > article > svg { width: 24px; color: #55d6c2; }.gmv-v2-settings-grid > article.is-danger > svg { color: #ff607c; }.gmv-v2-settings-grid article > div { min-width: 0; display: grid; gap: 4px; }.gmv-v2-settings-grid article strong { font-size: 15px; }.gmv-v2-settings-grid article span,.gmv-v2-settings-grid article small { color: var(--theme-text-muted, #8c99ac); font-size: 12px; }.gmv-v2-settings-grid details { font-size: 12px; }.gmv-v2-settings-grid ul { padding-left: 18px; }
.gmv-v2-view-tabs { margin-bottom: 12px; padding: 4px; display: inline-grid; grid-template-columns: repeat(3, minmax(100px, 1fr)); border: 1px solid var(--theme-border, #293341); border-radius: 7px; background: var(--theme-panel, #111823); }.gmv-v2-view-tabs button { min-height: 36px; padding: 0 13px; color: var(--theme-text-muted, #8c99ac); font: inherit; font-size: 13px; font-weight: 700; border: 0; border-radius: 5px; background: transparent; cursor: pointer; }.gmv-v2-view-tabs button.is-active { color: #55d6c2; background: #14322f; }.gmv-v2-result-summary { padding: 12px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }.gmv-v2-result-summary span { padding: 10px; display: flex; justify-content: space-between; color: var(--theme-text-muted, #8c99ac); border: 1px solid var(--theme-border, #293341); border-radius: 6px; }.gmv-v2-result-summary strong { color: var(--theme-text, #eef4fa); font-size: 18px; }
.gmv-v2-decision-categories { margin-bottom: 12px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }.gmv-v2-decision-categories article { min-width: 0; min-height: 78px; padding: 11px 12px; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 9px; align-items: center; border: 1px solid var(--theme-border, #293341); border-top: 3px solid #8796aa; border-radius: 6px; background: var(--theme-panel, #111823); }.gmv-v2-decision-categories article.is-danger { border-top-color: #ff607c; }.gmv-v2-decision-categories article.is-success { border-top-color: #55d6a0; }.gmv-v2-decision-categories article.is-warning { border-top-color: #f2bd58; }.gmv-v2-decision-categories article.is-blue { border-top-color: #58a8ff; }.gmv-v2-decision-categories svg { width: 21px; color: #9eabba; }.gmv-v2-decision-categories div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; }.gmv-v2-decision-categories span { font-size: 13px; font-weight: 700; }.gmv-v2-decision-categories strong { grid-row: 1 / 3; grid-column: 2; font-size: 21px; }.gmv-v2-decision-categories small { overflow: hidden; color: var(--theme-text-muted, #8c99ac); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.gmv-v2-protection-goals { margin-bottom: 12px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }.gmv-v2-protection-goals article { min-width: 0; min-height: 82px; padding: 11px; display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 8px; align-items: center; border: 1px solid var(--theme-border, #293341); border-radius: 6px; background: var(--theme-panel, #111823); }.gmv-v2-protection-goals svg { width: 20px; color: #55d6c2; }.gmv-v2-protection-goals div { min-width: 0; display: grid; gap: 3px; }.gmv-v2-protection-goals strong { font-size: 13px; }.gmv-v2-protection-goals small { overflow: hidden; color: var(--theme-text-muted, #8c99ac); font-size: 11px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
/* V2 visual hierarchy: canvas, section, panel, and control surfaces. */
.gmv-feature-content {
  --gmv-canvas: var(--theme-shell);
  --gmv-section-surface: var(--theme-panel-soft);
  --gmv-panel-surface: var(--theme-panel);
  --gmv-control-surface: var(--theme-input);
  --gmv-border-soft: var(--theme-divider);
  --gmv-border-strong: var(--theme-border-control);
  --gmv-shadow: 0 12px 30px color-mix(in srgb, var(--theme-root) 22%, transparent);
  background: var(--gmv-canvas);
  color: var(--theme-text);
}
.gmv-task-header {
  margin: 0 0 22px;
  padding: 4px 0 20px;
  border-bottom: 1px solid var(--gmv-border-strong);
}
.gmv-task-header h1 {
  margin-top: 10px;
  font-size: 30px;
  line-height: 1.15;
}
.gmv-task-header .gmv-header__actions {
  padding-top: 2px;
}
.gmv-v2-scope-button,
.gmv-v2-freshness {
  border-color: var(--gmv-border-strong);
  background: var(--gmv-panel-surface);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--theme-root) 16%, transparent);
}
.gmv-section > .gmv-section__heading {
  min-height: 72px;
  margin: 0 0 18px;
  padding: 16px 18px;
  border: 1px solid var(--gmv-border-soft);
  border-left: 3px solid var(--theme-accent);
  border-radius: 7px;
  background: var(--gmv-section-surface);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--theme-root) 14%, transparent);
}
.gmv-section > .gmv-section__heading h2 {
  font-size: 21px;
}
.gmv-panel {
  border-color: var(--gmv-border-strong) !important;
  background: var(--gmv-panel-surface) !important;
  box-shadow: var(--gmv-shadow);
}
.gmv-panel + .gmv-panel,
.gmv-panel + .gmv-ops-grid,
.gmv-ops-grid + .gmv-panel {
  margin-top: 16px;
}
.gmv-panel__heading {
  min-height: 48px;
  margin: -2px -2px 14px;
  padding: 0 2px 13px;
  border-bottom: 1px solid var(--gmv-border-soft);
}
.gmv-panel__heading h2 {
  font-size: 20px;
}
.gmv-task-summary,
.gmv-v2-results,
.gmv-v2-signals,
.gmv-v2-decision-categories,
.gmv-v2-protection-goals {
  gap: 12px;
  margin-bottom: 18px;
}
.gmv-task-summary article,
.gmv-v2-results article,
.gmv-v2-signals article,
.gmv-v2-decision-categories article,
.gmv-v2-protection-goals article,
.gmv-v2-settings-grid > article {
  border-color: var(--gmv-border-strong);
  background: var(--gmv-panel-surface);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--theme-root) 16%, transparent);
}
.gmv-task-summary article {
  min-height: 92px;
  padding: 16px 18px;
  border-left-width: 4px;
}
.gmv-task-summary article.is-danger {
  color: inherit;
  background: var(--gmv-panel-surface) !important;
}
.gmv-task-summary article.is-warning {
  color: inherit;
  background: var(--gmv-panel-surface) !important;
}
.gmv-task-summary article.is-success {
  color: inherit;
  background: var(--gmv-panel-surface) !important;
}
.gmv-task-summary article.is-neutral {
  color: inherit;
  background: var(--gmv-panel-surface) !important;
}
.gmv-task-summary strong,
.gmv-v2-results strong,
.gmv-v2-signals strong {
  color: var(--theme-text);
  font-variant-numeric: tabular-nums;
}
.gmv-v2-results article {
  min-height: 118px;
  padding: 18px;
  border-top: 2px solid var(--gmv-border-strong);
  background: var(--gmv-panel-surface) !important;
}
.gmv-v2-results .gmv-metric-icon {
  position: static;
  top: auto;
  right: auto;
}
.gmv-v2-results article:nth-child(1) { border-top-color: #4fd3bd; }
.gmv-v2-results article:nth-child(2) { border-top-color: #62a8ff; }
.gmv-v2-results article:nth-child(3) { border-top-color: #f0bd58; }
.gmv-v2-results article:nth-child(4) { border-top-color: #72d6a5; }
.gmv-v2-signals article {
  min-height: 92px;
  padding: 15px 18px;
  border-left-width: 4px;
}
.gmv-v2-priority-panel {
  margin-top: 2px;
  padding: 20px;
  border-color: var(--gmv-border-strong);
  background: var(--gmv-section-surface);
}
.gmv-v2-action-list {
  gap: 10px;
}
.gmv-v2-action-list > button {
  min-height: 88px;
  padding: 13px 15px;
  border-color: var(--gmv-border-strong);
  background: var(--gmv-panel-surface);
  box-shadow: 0 5px 14px color-mix(in srgb, var(--theme-root) 14%, transparent);
}
.gmv-v2-action-list > button:hover {
  border-color: var(--theme-accent);
  background: var(--theme-control-hover);
  transform: translateY(-1px);
}
.gmv-catalog-details,
.gmv-advanced-details {
  margin-bottom: 16px;
  border-color: var(--gmv-border-strong);
  background: var(--gmv-panel-surface);
  box-shadow: 0 7px 20px color-mix(in srgb, var(--theme-root) 14%, transparent);
}
.gmv-catalog-details > summary,
.gmv-advanced-details > summary {
  min-height: 64px;
  padding: 11px 16px;
}
.gmv-catalog-details[open] > summary,
.gmv-advanced-details[open] > summary {
  border-bottom: 1px solid var(--gmv-border-strong);
  background: var(--theme-control-selected);
}
.gmv-filter-panel {
  margin-bottom: 16px;
  padding: 14px;
  gap: 10px;
  border-color: var(--gmv-border-strong) !important;
  border-radius: 7px;
  background: var(--gmv-control-surface) !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-text) 2%, transparent) inset;
}
.gmv-filter-panel input,
.gmv-filter-panel select {
  min-height: 40px;
  border-color: var(--theme-border-control);
  background: var(--theme-input);
  color: var(--theme-text);
}
.gmv-table-wrap {
  border-color: var(--gmv-border-strong) !important;
  border-radius: 7px;
  background: var(--gmv-section-surface) !important;
  box-shadow: 0 9px 24px color-mix(in srgb, var(--theme-root) 16%, transparent);
}
.gmv-table thead {
  background: var(--theme-panel-soft) !important;
}
.gmv-table th {
  height: 48px;
  color: var(--theme-text-secondary);
  border-color: var(--gmv-border-strong) !important;
  background: var(--theme-panel-soft) !important;
}
.gmv-table tbody tr > td {
  background: var(--theme-panel) !important;
}
.gmv-table tbody tr:nth-child(even) > td {
  background: color-mix(in srgb, var(--theme-panel-soft) 56%, var(--theme-panel)) !important;
}
.gmv-table tbody tr:hover > td {
  background: color-mix(in srgb, var(--theme-accent) 9%, var(--theme-panel)) !important;
}
.gmv-cost-summary {
  gap: 10px;
  margin-bottom: 14px;
}
.gmv-cost-summary article {
  min-height: 64px;
  padding: 12px 14px;
  border-color: var(--gmv-border-strong);
  background: var(--theme-panel-soft);
}
.gmv-creative-blocker-alert,
.gmv-alert {
  border: 1px solid currentColor;
  box-shadow: 0 7px 20px color-mix(in srgb, var(--theme-root) 14%, transparent);
}
.gmv-pagination {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--gmv-border-soft);
}
@media (max-width: 1100px) { .gmv-v2-results { grid-template-columns: repeat(2, minmax(0, 1fr)); }.gmv-v2-settings-grid { grid-template-columns: 1fr; }.gmv-v2-protection-goals { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1300px) {
  .gmv-v2-results article {
    padding: 14px;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 4px 8px;
  }
  .gmv-v2-results .gmv-metric-icon {
    width: 30px;
    height: 30px;
  }
  .gmv-v2-results strong {
    font-size: 20px;
  }
}

@media (max-width: 900px) { .gmv-task-scope { grid-template-columns: 1fr 1fr; }.gmv-task-scope > .gmv-button { grid-column: 1 / -1; justify-self: stretch; }.gmv-task-summary { grid-template-columns: 1fr; } }

/* Command header: page identity on top, operational context below. */
.gmv-task-header {
  min-height: 0;
  margin-bottom: 24px;
  padding: 2px 0 20px;
  gap: 18px;
}
.gmv-task-header__identity {
  min-width: 0;
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.gmv-task-header__symbol {
  width: 50px;
  height: 50px;
  flex: 0 0 50px;
  display: grid;
  place-items: center;
  color: var(--theme-accent);
  border: 1px solid var(--theme-border-control);
  border-radius: 8px;
  background: var(--theme-accent-soft);
  box-shadow:
    0 9px 24px color-mix(in srgb, var(--theme-root) 18%, transparent),
    0 1px 0 color-mix(in srgb, var(--theme-text) 4%, transparent) inset;
}
.gmv-task-header__symbol svg {
  width: 23px;
  height: 23px;
}
.gmv-task-header__copy {
  min-width: 0;
}
.gmv-task-header h1 {
  margin: 0 0 7px;
  color: var(--theme-text);
  font-size: 32px;
  font-weight: 760;
  line-height: 1.1;
}
.gmv-task-header p {
  color: var(--theme-text-muted);
  font-size: 14px;
}
.gmv-task-header .gmv-header__actions {
  width: 100%;
  min-height: 64px;
  padding: 7px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--theme-border-control);
  border-radius: 8px;
  background: var(--theme-panel);
  box-shadow:
    0 10px 26px color-mix(in srgb, var(--theme-root) 16%, transparent),
    0 1px 0 color-mix(in srgb, var(--theme-text) 3%, transparent) inset;
}
.gmv-task-header .gmv-v2-scope-button,
.gmv-task-header .gmv-v2-freshness {
  min-height: 48px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  box-shadow: none;
}
.gmv-task-header .gmv-v2-scope-button {
  width: 210px;
  padding-inline: 12px;
}
.gmv-task-header .gmv-v2-scope-button:hover {
  background: var(--theme-control-hover);
}
.gmv-task-header .gmv-v2-freshness {
  min-width: 238px;
  margin-right: auto;
  padding-inline: 14px;
  border-left: 1px solid var(--theme-border-control);
}
.gmv-task-header .gmv-v2-scope-button small,
.gmv-task-header .gmv-v2-freshness small {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-task-header .gmv-v2-scope-button strong,
.gmv-task-header .gmv-v2-freshness strong {
  color: var(--theme-text);
  font-size: 14px;
}
.gmv-task-header .gmv-button {
  min-height: 42px;
  padding-inline: 14px;
  border-color: var(--theme-border-control);
  background: var(--theme-control);
  color: var(--theme-text-secondary);
  box-shadow: none;
  font-size: 13px;
}
.gmv-task-header .gmv-button:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 46%, var(--theme-border-control));
  background: var(--theme-control-hover);
}
.gmv-task-header [data-testid="gmv-emergency-stop"] {
  border-color: color-mix(in srgb, var(--theme-danger) 42%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-danger) 8%, var(--theme-panel));
  color: var(--theme-danger-text);
}
.gmv-task-header [data-testid="gmv-sync-data"] {
  border-color: color-mix(in srgb, var(--theme-accent) 48%, var(--theme-border));
  background: var(--theme-control-selected);
  color: var(--theme-control-selected-text);
}
.gmv-task-header [data-testid="gmv-sync-data"]:hover {
  border-color: var(--theme-accent);
  background: var(--theme-control-hover);
}
@media (max-width: 1300px) {
  .gmv-task-header .gmv-header__actions {
    min-height: 60px;
    padding: 6px;
  }
  .gmv-task-header .gmv-v2-scope-button {
    width: 180px;
  }
  .gmv-task-header .gmv-v2-freshness {
    min-width: 210px;
  }
  .gmv-task-header .gmv-button {
    padding-inline: 11px;
  }
}

/* Keep the decision surface above the fold on desktop workspaces. */
.gmv-task-header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  padding: 0 0 14px;
}
.gmv-task-header__identity {
  min-height: 54px;
  gap: 12px;
}
.gmv-task-header__symbol {
  width: 44px;
  height: 44px;
  flex-basis: 44px;
}
.gmv-task-header h1 {
  margin-bottom: 3px;
  font-size: 27px;
}
.gmv-task-header p {
  font-size: 13px;
}
.gmv-task-header .gmv-header__actions {
  width: auto;
  min-height: 52px;
  padding: 5px;
  gap: 5px;
}
.gmv-task-header .gmv-v2-scope-button,
.gmv-task-header .gmv-v2-freshness {
  min-height: 40px;
}
.gmv-task-header .gmv-v2-scope-button {
  width: 176px;
}
.gmv-task-header .gmv-v2-freshness {
  min-width: 196px;
  padding-inline: 10px;
}
.gmv-task-header .gmv-button {
  min-height: 36px;
  padding-inline: 10px;
  font-size: 12px;
}
.gmv-task-summary,
.gmv-v2-results,
.gmv-v2-signals,
.gmv-v2-decision-categories,
.gmv-v2-protection-goals {
  gap: 8px;
  margin-bottom: 10px;
}
.gmv-task-summary article {
  min-height: 68px;
  padding: 10px 12px;
}
.gmv-task-summary strong {
  font-size: 21px;
}
.gmv-section > .gmv-section__heading {
  min-height: 56px;
  margin-bottom: 10px;
  padding: 11px 14px;
}
.gmv-section > .gmv-section__heading h2 {
  font-size: 18px;
}
.gmv-section > .gmv-section__heading p {
  font-size: 12px;
}
.gmv-panel__heading {
  min-height: 42px;
  margin-bottom: 10px;
  padding-bottom: 8px;
}
.gmv-panel__heading h2 {
  font-size: 18px;
}
.gmv-catalog-details > summary,
.gmv-advanced-details > summary {
  min-height: 48px;
  padding: 8px 12px;
}
.gmv-filter-panel {
  margin-bottom: 10px;
  padding: 10px;
}
.gmv-creative-task-page {
  display: flex;
  flex-direction: column;
}
.gmv-creative-task-page > .gmv-section__heading { order: 0; }
.gmv-creative-task-page > .gmv-creative-blocker-alert { order: 1; }
.gmv-creative-task-page > .gmv-creative-queue { order: 2; }
.gmv-creative-task-page > .gmv-creative-filters { order: 3; }
.gmv-creative-task-page > .gmv-creative-hero { order: 4; }
.gmv-creative-task-page > .gmv-creative-layout { order: 5; }
.gmv-creative-task-page > .gmv-experiment-board { order: 6; }
.gmv-creative-task-page > .gmv-creative-command { order: 7; }
.gmv-creative-filters > .gmv-filter-panel {
  margin: 0;
  border-right: 0 !important;
  border-bottom: 0 !important;
  border-left: 0 !important;
  box-shadow: none;
}
@media (max-width: 1350px) {
  .gmv-task-header {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
  .gmv-task-header .gmv-header__actions {
    width: 100%;
  }
}
</style>
