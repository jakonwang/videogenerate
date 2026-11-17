<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import GmvV2Today from "../components/gmv-max/v2/GmvV2Today.vue";
import GmvV2Campaigns from "../components/gmv-max/v2/GmvV2Campaigns.vue";
import GmvV2Academy from "../components/gmv-max/v2/GmvV2Academy.vue";
import type { DiagnosisCode as V2DiagnosisCode } from "../components/gmv-max/v2/useGmvV2";
import GmvMaxHelpCenter from "../components/gmv-max/GmvMaxHelpCenter.vue";
import "../components/gmv-max/v2/gmv-v2-viz.css";
import "../components/gmv-max/gmv-dashboard-skin.css";
import GmvMaxTopNav, { type GmvNavModule } from "../components/gmv-max/GmvMaxTopNav.vue";
import GmvDateRange from "../components/gmv-max/GmvDateRange.vue";
import GmvAlertsBell, { type GmvAlert } from "../components/gmv-max/GmvAlertsBell.vue";
import GmvOverviewPage from "../components/gmv-max/pages/GmvOverviewPage.vue";
import GmvPlanPage from "../components/gmv-max/pages/GmvPlanPage.vue";
import GmvCampaignsPage from "../components/gmv-max/pages/GmvCampaignsPage.vue";
import GmvProductsPage from "../components/gmv-max/pages/GmvProductsPage.vue";
import GmvActionsPage from "../components/gmv-max/pages/GmvActionsPage.vue";
import GmvRulesPage from "../components/gmv-max/pages/GmvRulesPage.vue";
import GmvCreativesPage from "../components/gmv-max/pages/GmvCreativesPage.vue";
import GmvProfitPage from "../components/gmv-max/pages/GmvProfitPage.vue";
import GmvSettingsPage from "../components/gmv-max/pages/GmvSettingsPage.vue";
import GmvHelpPage from "../components/gmv-max/pages/GmvHelpPage.vue";
import GmvAuditPage from "../components/gmv-max/pages/GmvAuditPage.vue";
import { GMV_WORKSPACE_KEY } from "../components/gmv-max/pages/workspaceContext";
import "../components/gmv-max/gmv-workspace.css";
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
  CalendarCheck,
  Stethoscope,
  GraduationCap,
  Megaphone,
  Bot,
  History,
  TrendingDown,
} from "lucide-vue-next";

type TabId =
  | "today"
  | "diagnosis"
  | "academy"
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
  lastConnectedAt?: number;
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
  previousMetrics?: { cost: number; revenue: number; orders: number; roi: number } | null;
};
type CampaignDataPage = {
  items: CampaignPageItem[];
  total: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  summary: { cost: number; revenue: number; orders: number };
  previousStartDate?: string;
  previousEndDate?: string;
  previousSummary?: { cost: number; revenue: number; orders: number };
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
  realtimeSignal?: {
    windowKey: string;
    windowIndex: 0 | 1 | 2 | 3;
    elapsedRatio: string;
    currentCost: string;
    currentGrossRevenue: string;
    currentOrders: string;
    currentRoi: string;
    baselineCost: string;
    baselineGrossRevenue: string;
    baselineOrders: string;
    baselineRoi: string;
    spendPaceRatio: string;
    revenuePaceRatio: string;
    orderPaceRatio: string;
    state: string;
    confirmedState: string;
    consecutiveSamples: number;
    confirmationRequired: number;
    stateConfirmed: boolean;
    dataFreshness: "fresh" | "stale" | "missing";
  };
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
  productImageUrl?: string;
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
  promotionSeries?: Array<{
    campaignId: string;
    campaignName: string;
    state: ProductInsight["state"];
  }>;
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

const activeTab = ref<TabId>("today");
/** Beginner mode shows only the four pages a new seller needs; pro mode shows every tool. */
const SIMPLE_TABS: TabId[] = ["today", "diagnosis", "academy", "settings", "help"];
function readUiMode(): "simple" | "pro" {
  try {
    return window.localStorage.getItem("gmv-ui-mode") === "pro" ? "pro" : "simple";
  } catch {
    return "simple";
  }
}
const uiMode = ref<"simple" | "pro">(readUiMode());
const simpleMode = computed(() => uiMode.value === "simple");
function setUiMode(mode: "simple" | "pro") {
  if (uiMode.value !== mode) toggleUiMode();
}
function toggleUiMode() {
  uiMode.value = simpleMode.value ? "pro" : "simple";
  try {
    window.localStorage.setItem("gmv-ui-mode", uiMode.value);
  } catch {
    /* preference is optional */
  }
  if (simpleMode.value && !SIMPLE_TABS.includes(activeTab.value)) activeTab.value = "today";
}
const diagnosisFilter = ref<V2DiagnosisCode | "">("");
function openDiagnosis(code?: V2DiagnosisCode) {
  diagnosisFilter.value = code || "";
  selectFeatureTab("diagnosis");
}
const globalFiltersExpanded = ref(false);
const decisionScopeExpanded = ref(false);
const todayDetailsExpanded = ref(false);
const helpFocusIssueCode = ref("");
const auditView = ref<"execution" | "results" | "exceptions">("execution");
const auditViews = ["execution", "results", "exceptions"] as const;
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
let tabPrefetchTimer: ReturnType<typeof setTimeout> | null = null;
let tabPrefetchRunId = 0;
const dashboardRequest = createLatestRequestCoordinator();
const campaignPageRequest = createLatestRequestCoordinator();
const creativePageRequest = createLatestRequestCoordinator();
const listEntryPageRequest = createLatestRequestCoordinator();
const productPageRequest = createLatestRequestCoordinator();
const productCostPageRequest = createLatestRequestCoordinator();
const actionPageRequest = createLatestRequestCoordinator();
const outcomePageRequest = createLatestRequestCoordinator();
const auditPageRequest = createLatestRequestCoordinator();
// Keep empty result pages from being treated as not loaded on every tab switch.
const loadedData = new Set<string>();
const notice = ref("");
const errorText = ref("");
const dashboard = shallowRef<Dashboard>({
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
const sopWorkspace = shallowRef<SopWorkspace>({
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
const commandCenter = shallowRef<CommandCenter>({
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
/** "Compare with the previous period" on data pages; remembered per machine. */
function readCompare() {
  try {
    return window.localStorage.getItem("gmv-compare") !== "off";
  } catch {
    return true;
  }
}
const compareEnabled = ref(readCompare());
function setCompare(enabled: boolean) {
  compareEnabled.value = enabled;
  try {
    window.localStorage.setItem("gmv-compare", enabled ? "on" : "off");
  } catch {
    /* preference is optional */
  }
}
/** Pages whose numbers follow the shared date range. */
const DATE_RANGE_TABS: TabId[] = ["overview", "campaigns", "growth", "creatives", "profit"];
/** Alerts from local data (ROI under break-even, budget burning fast, tired creatives); also sent to the desktop. */
const alerts = ref<GmvAlert[]>([]);
let alertsLoadedAt = 0;
/** At most every 10 minutes, or right after a sync (force), so routine refreshes do not wait on it. */
async function loadAlerts(force = false) {
  if (!force && Date.now() - alertsLoadedAt < 10 * 60_000) return;
  alertsLoadedAt = Date.now();
  try {
    alerts.value = ((await window.api.tiktokGmvMax.getAlerts()) as GmvAlert[]) || [];
  } catch {
    alerts.value = [];
  }
}
/** Desktop alerts are on until the user turns them off (no saved config means on). */
const desktopAlertsEnabled = computed(() => dashboard.value.notificationConfig?.enabled ?? true);
async function setDesktopAlerts(enabled: boolean) {
  try {
    await window.api.tiktokGmvMax.saveNotificationConfig({ ...notificationDraft.value, enabled });
    notificationDraft.value = { ...notificationDraft.value, enabled };
    await loadDashboard();
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  }
}
function openAlertCampaign(campaignId: string) {
  openCampaignWorkspace(campaignId);
}
function setDateRange(range: { startDate: string; endDate: string }) {
  if (range.startDate === startDate.value && range.endDate === endDate.value) return;
  startDate.value = range.startDate;
  endDate.value = range.endDate;
  // The page in view first (about a second), then the slower dashboard behind it.
  void loadActiveData(true).then(async () => {
    await loadDashboard();
    normalizeCampaignScopes();
  });
}
const campaignPage = ref(1);
const campaignPageSize = ref(20);
const campaignDataPage = shallowRef<CampaignDataPage>({
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
const creativePage = shallowRef<CreativePage>({
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
const listEntryPage = shallowRef<ListEntryPage>({
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
const productPage = shallowRef<ProductPage>({
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
const productCostPage = shallowRef<ProductCostPage>({
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
const actionPage = shallowRef<ActionPage>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  startDate: "",
  endDate: "",
  summary: { pending: 0, executed: 0, failed: 0, shadow: 0 },
});
const outcomePage = shallowRef<OutcomePage>({
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
const auditPage = shallowRef<AuditPage>({
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

/**
 * Pro mode groups every page under five modules (overview, ads manager, creatives, profit, automation); settings,
 * academy and help sit at the right of the bar. Beginner mode keeps four single-page modules.
 */
const workspaceModules = computed<GmvNavModule[]>(() => {
  const single = (tab: TabId, label: string, icon: GmvNavModule["icon"]): GmvNavModule => ({
    id: tab,
    label,
    icon,
    pages: [{ tab, label }],
  });
  if (simpleMode.value)
    return [
      single("today", t("gmvV2.simple.nav.today"), CalendarCheck),
      single("diagnosis", t("gmvV2.simple.nav.diagnosis"), Stethoscope),
      single("academy", t("gmvV2.simple.nav.academy"), GraduationCap),
      single("settings", t("gmvV2.simple.nav.settings"), Settings2),
    ];
  const page = (tab: TabId, key: string, count?: number) => ({ tab, label: t(`gmvV2.nav.${key}`), count });
  return [
    { id: "home", label: t("gmvV2.nav.modules.home"), icon: Gauge, pages: [page("today", "today"), page("overview", "overview")] },
    {
      id: "delivery",
      label: t("gmvV2.nav.modules.delivery"),
      icon: Megaphone,
      pages: [page("campaigns", "campaigns"), page("diagnosis", "diagnosis"), page("growth", "products")],
    },
    single("creatives", t("gmvV2.nav.modules.creatives"), Film),
    single("profit", t("gmvV2.nav.modules.profit"), CircleDollarSign),
    {
      id: "automation",
      label: t("gmvV2.nav.modules.automation"),
      icon: Bot,
      pages: [
        page("actions", "pending", commandCenter.value.actionSummary.mustFix),
        page("rules", "strategies"),
        page("sop", "growth"),
        page("audit", "audit"),
      ],
    },
  ];
});
const activeModule = computed(() =>
  workspaceModules.value.find((module) => module.pages.some((entry) => entry.tab === activeTab.value)),
);
const activeNavigationLabel = computed(() => {
  const entry = activeModule.value?.pages.find((item) => item.tab === activeTab.value);
  if (entry) return entry.label;
  if (activeTab.value === "academy") return t("gmvV2.nav.academy");
  if (activeTab.value === "settings") return t("gmvV2.nav.settings");
  return t("gmvMaxV2.navigation.help");
});
const activeNavigationIcon = computed(() => {
  if (activeModule.value) return activeModule.value.icon;
  if (activeTab.value === "academy") return GraduationCap;
  if (activeTab.value === "settings") return Settings2;
  return BookOpen;
});
const pageMeta = computed(() => ({
  title: activeNavigationLabel.value,
  subtitle: te(`gmvV2.pages.${activeTab.value}`)
    ? t(`gmvV2.pages.${activeTab.value}`)
    : activeTab.value === "settings"
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
/** TikTok authorization that no longer works (expired state, a rejected token, or a past expiry date). */
const AUTH_EXPIRED_PATTERN = /authorization is required|GMV_MAX_AUTH_EXPIRED|UnauthorizedError|invalid_grant|invalid_token/i;
const expiredConnections = computed(() =>
  dashboard.value.connections.filter(
    (item) =>
      item.state === "expired" ||
      (item.state === "error" && AUTH_EXPIRED_PATTERN.test(String(item.lastError || ""))) ||
      // expiresAt is the access token, renewed automatically about once a day, so only a refused token counts.
      (item.state === "connected" && AUTH_EXPIRED_PATTERN.test(String(item.lastError || ""))),
  ),
);
/** One working connection is enough to sync, so older duplicates that expired do not keep the warning up. */
const authExpired = computed(
  () =>
    expiredConnections.value.length > 0 &&
    !dashboard.value.connections.some((item) => item.state === "connected" && !expiredConnections.value.includes(item)),
);
/**
 * Authorizes the most recently used expired connection again (opens the TikTok login page). Older connections are
 * usually duplicates of the same account, and one working connection is enough to sync.
 */
async function reauthorize() {
  const target = [...expiredConnections.value].sort((left, right) => (Number(right.lastConnectedAt) || 0) - (Number(left.lastConnectedAt) || 0))[0];
  if (!target) return;
  await runAction(
    "reconnect",
    () => window.api.tiktokGmvMax.reconnect({ connectionId: target.id }),
    t("gmvV2.auth.done"),
  );
}
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

/** Store-currency amount, shown while the CNY exchange rate is not yet available. */
function formatNativeMoney(value: unknown, storeId?: string) {
  const currency = storeCurrency(storeId);
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const amount = metricNumber(value);
  const compact = Math.abs(amount) >= 1_000_000;
  try {
    return new Intl.NumberFormat(locale.value, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: compact ? 1 : 2,
      maximumFractionDigits: compact ? 1 : 2,
    }).format(amount);
  } catch {
    return null;
  }
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
  if (amount === null) return formatNativeMoney(value, storeId) ?? t("gmvMaxCurrency.pending");
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

function formatShortDate(value?: number) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale.value, { month: "numeric", day: "numeric" }).format(new Date(value));
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

/** Maps the legacy is-* tone classes onto status tones that are safe from the app-wide is-* fills. */
function dotTone(cls: string) {
  return (
    {
      "is-success": "gvt-good",
      "is-warning": "gvt-warning",
      "is-danger": "gvt-critical",
      "is-error": "gvt-critical",
      "is-blue": "gvt-info",
    } as Record<string, string>
  )[cls] || "gvt-neutral";
}

function pacingTone(state: string) {
  return (
    { normal: "gvt-good", overspend: "gvt-critical", underspend: "gvt-warning", unstable: "gvt-serious" } as Record<string, string>
  )[state] || "gvt-neutral";
}

function pacingIcon(state: string) {
  return ({ normal: CheckCircle2, overspend: TrendingUp, underspend: TrendingDown, unstable: Activity } as Record<string, unknown>)[state] || Gauge;
}

const policyModeCounts = computed(() => {
  const counts = { auto: 0, shadow: 0, manual: 0, unbound: 0 };
  for (const campaign of filteredCampaigns.value) {
    const draft = policyDrafts.value[campaign.id];
    if (draft?.shadowMode) counts.shadow += 1;
    else if (draft?.automationEnabled) counts.auto += 1;
    else counts.manual += 1;
    if (!dashboard.value.ruleBindings.some((item) => item.campaignId === campaign.id)) counts.unbound += 1;
  }
  return counts;
});

function togglePacingFilter(state: string) {
  campaignPacingState.value = campaignPacingState.value === state ? "all" : (state as typeof campaignPacingState.value);
  void loadCampaignPage(1);
}

function campaignRoiTone(campaign: { metrics: { samples?: number; cost: number; roi: number }; profitGuard: { complete: boolean; effectiveRoiFloor?: unknown } }) {
  if (!campaign.metrics.samples || campaign.metrics.cost <= 0 || !campaign.profitGuard.complete) return "gvt-neutral";
  return campaign.metrics.roi < metricNumber(campaign.profitGuard.effectiveRoiFloor as never) ? "gvt-critical" : "gvt-good";
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

async function prefetchTabData() {
  const runId = ++tabPrefetchRunId;
  const loaders: Array<[string, () => Promise<unknown>]> = [
    ["campaigns", () => loadCampaignPage(1)],
    ["creatives:page", () => loadCreativePage(1)],
    ["creatives:list", () => loadListEntryPage(1)],
    ["growth:products", () => loadProductPage(1)],
    ["growth:outcomes", () => loadOutcomePage(1)],
    ["profit", () => loadProductCostPage(1)],
    ["actions", () => loadActionPage(1)],
    ["audit", () => loadAuditPage(1)],
  ];
  for (const [key, load] of loaders) {
    if (runId !== tabPrefetchRunId || activeTab.value !== "overview") return;
    if (!loadedData.has(key)) await load();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
  }
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
    loadedData.add("sop");
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
  loadedData.add("campaigns");
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
  loadedData.add("creatives:page");
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
  loadedData.add("creatives:list");
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
  loadedData.add("growth:products");
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
  loadedData.add("profit");
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
  loadedData.add("actions");
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
  loadedData.add("growth:outcomes");
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
  loadedData.add("audit");
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
  if (activeTab.value === "campaigns" || activeTab.value === "overview")
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
  void loadAlerts();
  normalizeCampaignScopes();
  await loadActiveData(resetPage);
}

function setTypeFilter(type: string) {
  if (selectedType.value === type) return;
  selectedType.value = type;
  void applyDataFilters();
}
/** Any filter that narrows the data, shown so a remembered filter never hides rows silently. */
const filtersActive = computed(
  () =>
    searchText.value.trim() !== "" ||
    selectedType.value !== "all" ||
    campaignStatus.value !== "all" ||
    campaignPacingState.value !== "all",
);

/**
 * Store, type and search only narrow the current page, so they reload that page's data and leave the
 * (much slower) dashboard alone; date changes go through setDateRange, which refreshes everything.
 */
async function applyDataFilters() {
  await loadActiveData(true);
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
  if (AUTH_EXPIRED_PATTERN.test(message)) return t("gmvV2.auth.expiredError");
  if (/GMV_MAX_SESSION_ITEM_UNSUPPORTED/i.test(message)) return t("gmvMaxRuntime.sessionItemUnsupported");
  if (/GMV_MAX_SESSION_IDENTITY_REQUIRED|Nil item_identity map/i.test(message)) return t("gmvMaxRuntime.sessionIdentityRequired");
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
    void loadAlerts(true);
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
function plainRuleGroupPayload(rule: RuleGroup) {
  return JSON.parse(JSON.stringify(rule)) as RuleGroup;
}
function saveRuleGroup() {
  if (!newRule.value.name) return;
  const payload = plainRuleGroupPayload(newRule.value);
  void runAction(
    "rule-group",
    () => window.api.tiktokGmvMax.saveRuleGroup(payload as any),
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
  const payload = plainRuleGroupPayload(ruleDraft.value);
  void runAction(
    "rule-draft",
    () => window.api.tiktokGmvMax.saveRuleGroup(payload as any),
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
  // The account overview reads its period totals from the campaign page.
  if ((value === "campaigns" || value === "overview") && !loadedData.has("campaigns"))
    void loadCampaignPage(1);
  if (value === "creatives" && !loadedData.has("creatives:page"))
    void loadCreativePage(1);
  if (value === "creatives" && !loadedData.has("creatives:list"))
    void loadListEntryPage(1);
  if (value === "growth" && !loadedData.has("growth:products"))
    void loadProductPage(1);
  if (value === "growth" && !loadedData.has("growth:outcomes"))
    void loadOutcomePage(1);
  if (value === "profit" && !loadedData.has("profit"))
    void loadProductCostPage(1);
  if (value === "actions" && !loadedData.has("actions"))
    void loadActionPage(1);
  if (value === "audit" && !loadedData.has("audit")) void loadAuditPage(1);
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
  window.addEventListener("keydown", handleWorkspaceKeydown);
  removeSyncProgressListener = window.api.tiktokGmvMax.onSyncProgress(
    (progress) => {
      applySyncProgress(progress as SyncProgressState);
    },
  );
  // Load only the visible overview first. SOP data is deferred until its tab is opened.
  void loadDashboard().then(() => {
    tabPrefetchTimer = window.setTimeout(() => {
      tabPrefetchTimer = null;
      void prefetchTabData();
    }, 1200);
  });
});
onUnmounted(() => {
  tabPrefetchRunId += 1;
  if (tabPrefetchTimer) window.clearTimeout(tabPrefetchTimer);
  tabPrefetchTimer = null;
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
provide(GMV_WORKSPACE_KEY, {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  GmvActionsPage,
  GmvAuditPage,
  GmvCampaignsPage,
  GmvCreativesPage,
  GmvHelpPage,
  GmvOverviewPage,
  GmvPlanPage,
  GmvProductsPage,
  GmvProfitPage,
  GmvRulesPage,
  GmvSettingsPage,
  ShieldAlert,
  X,
  actionCampaign,
  actionLoading,
  actionPage,
  actionRisk,
  actionSortBy,
  actionSortDirection,
  actionStatus,
  actionType,
  actionTypeLabel,
  activeCalibrations,
  activeTab,
  actualSellingPriceLabel,
  addCreativeToList,
  alerts,
  approve,
  approveExperimentTask,
  approvePortfolio,
  approveSelectedActions,
  auditAction,
  auditCampaign,
  auditLoading,
  auditPage,
  auditSortDirection,
  auditStatus,
  auditView,
  auditViews,
  backtestStoreId,
  batchRisk,
  bindingForCampaign,
  busyAction,
  calibrationStateClass,
  campaignDataLoading,
  campaignDataPage,
  campaignIdentityCode,
  campaignName,
  campaignPacingState,
  campaignPage,
  campaignPageCount,
  campaignPageSize,
  campaignRoiTone,
  campaignSortBy,
  campaignSortDirection,
  campaignStatus,
  campaignStatuses,
  campaignStoreId,
  canExecute,
  capabilityRows,
  changeDecisionPage,
  changeSopAutomationMode,
  changeSopVideoPage,
  clearProductImage,
  closeSopDetail,
  coachEvidenceDetail,
  coachEvidenceMetricLabel,
  coachGuardrailLabel,
  coachPlanActionLabel,
  cockpitTodayPlan,
  cockpitTodayPlanDate,
  commandCenter,
  compactCampaignName,
  compareEnabled,
  completeSopTask,
  connect,
  connected,
  copySopIdentifier,
  createSopCreativeAction,
  creativeActionQueue,
  creativeCampaign,
  creativeExperimentWorkspace,
  creativeFunnel,
  creativeLoading,
  creativePage,
  creativeSignalSummary,
  creativeSortBy,
  creativeSortDirection,
  creativeSource,
  creativeState,
  creativeVideoAvailable,
  creativeView,
  creatorPerformance,
  dailyFlow,
  dashboard,
  decisionPage,
  decisionPageCount,
  decisionPriorityFilter,
  decisionRowsByTypeAndStatus,
  decisionScopeExpanded,
  decisionStatusFilter,
  decisionStoreFilter,
  decisionStoreOptions,
  decisionTypeFilter,
  desktopAlertsEnabled,
  disconnect,
  drawer,
  endDate,
  evaluate,
  executiveProfit,
  exportCosts,
  exportSupplementalTemplate,
  filteredActions,
  filteredAudits,
  filteredCalibrations,
  filteredCampaigns,
  filteredCreatives,
  filteredDecisionRows,
  filteredLearning,
  filteredOutcomes,
  filteredPortfolioPlans,
  filteredProductInsights,
  flowDateLabel,
  formatCny,
  formatDate,
  formatEvidenceRange,
  formatExchangeRate,
  formatInteger,
  formatMatureBaselineRoi,
  formatPercent,
  formatRoi,
  formatShortDate,
  groupedSopIssues,
  handleCommandCenterAction,
  handleGlobalSopIssue,
  handleSopIssue,
  helpCurrentObject,
  helpFocusIssueCode,
  hideBrokenSopImage,
  hideBrokenSopVideoCover,
  importCosts,
  importSupplementalMetrics,
  incompleteCreativeCostCount,
  isDecisionCampaignEnabled,
  issueActionLabel,
  issueForTask,
  issueText,
  learningSignalLabel,
  listEntryLoading,
  listEntryMode,
  listEntryPage,
  listEntrySearch,
  loadActionPage,
  loadAuditPage,
  loadCampaignPage,
  loadCreativeContext,
  loadCreativePage,
  loadListEntryPage,
  loadOutcomePage,
  loadProductCostPage,
  loadProductPage,
  loading,
  maxCreativeCpa,
  maxDailyCost,
  metricNumber,
  minCampaignOrders,
  minCampaignRoi,
  minCampaignSpend,
  minCampaignUtilization,
  minCreativeCtr,
  minCreativeOrders,
  minCreativeRoi,
  minCreativeSpend,
  minProductOrders,
  minProductRoi,
  minProductScore,
  minProductSpend,
  missingCreativeTestBudgetCount,
  moneyCostFields,
  moneyFilterDisabled,
  moneyInputValue,
  newRule,
  notificationDraft,
  openAction,
  openCampaignCreatives,
  openCampaignProducts,
  openCampaignRecommendations,
  openCampaignWorkspace,
  openCreativeVideo,
  openHelpIssue,
  openPolicy,
  openProduct,
  openProductImage,
  openProductInsight,
  openRule,
  openSopCreativeVideo,
  openSopPicker,
  operationStatusLabel,
  optimizeCreatives,
  outcomeLoading,
  outcomePage,
  overrideSopTrack,
  pacingStates,
  pacingSummary,
  pacingTone,
  pagedCampaigns,
  pagedDecisionRows,
  pagedSopCreativeVideos,
  percentInputValue,
  percentage,
  performanceSummary,
  policyDrafts,
  policyMap,
  policyModeCounts,
  policyPresetLabel,
  portfolioStatusLabel,
  primarySopIssue,
  productAllocation,
  productCampaign,
  productCostCampaign,
  productCostComplete,
  productCostCompleteness,
  productCostLoading,
  productCostPage,
  productCostScope,
  productCostSearch,
  productCostSortBy,
  productCostSortDirection,
  productLoading,
  productPage,
  productSortBy,
  productSortDirection,
  productState,
  productStateClass,
  provide,
  rateCostFields,
  recommendationActionLabel,
  recommendationConfidenceLabel,
  recommendationProjectionLabel,
  recommendationReasonLabel,
  reconnect,
  refreshCoachDecision,
  refreshWorkspace,
  reject,
  rejectPortfolio,
  removeListEntry,
  removeProduct,
  removeRule,
  rollback,
  runBacktest,
  runSopAutomation,
  saveNotification,
  saveStoreCost,
  saveSupplementalMetrics,
  scopedDecisionRows,
  searchText,
  selectFeatureTab,
  selectSopInstance,
  selectSopProduct,
  selectSopVideoGrade,
  selectedActionIds,
  selectedCoachDecision,
  selectedCoachProfile,
  selectedSop,
  selectedSopAutomationRun,
  selectedSopCampaign,
  selectedSopCompletedTasks,
  selectedSopCreativeVideo,
  selectedSopCreativeVideos,
  selectedSopId,
  selectedSopIssues,
  selectedSopPendingTasks,
  selectedSopTaskDate,
  selectedSopTasks,
  selectedSopVideoGrade,
  selectedSopVideoGradeItems,
  selectedSopVideoGradeSummary,
  selectedSopVideoId,
  selectedStore,
  selectedStoreLabel,
  setDecisionPriorityFilter,
  setDecisionStatusFilter,
  setDecisionStoreFilter,
  setDecisionTypeFilter,
  setDesktopAlerts,
  setEmergencyStop,
  setMoneyField,
  setPercentField,
  setRuleBinding,
  shortSopIdentifier,
  sopAutomationResult,
  sopAutomationSettingsExpanded,
  sopBulkToolsExpanded,
  sopCampaignOptions,
  sopCanStart,
  sopCompletedTasksExpanded,
  sopCreativeActionBlocked,
  sopDetailOpen,
  sopDetailTab,
  sopDnaExpanded,
  sopHistoryExpanded,
  sopIssueSummary,
  sopKeyMetricCards,
  sopLaunchExpanded,
  sopLoading,
  sopMetricCards,
  sopMetricsExpanded,
  sopPhases,
  sopProductLoading,
  sopProductOptions,
  sopRequiresHeroSku,
  sopStartDraft,
  sopStartRequirement,
  sopSupplementalExpanded,
  sopTaskDescription,
  sopTaskTitle,
  sopVideoAnalysis,
  sopVideoDuration,
  sopVideoPage,
  sopVideoPageCount,
  sopVideoPlayable,
  sopVideoSort,
  sopVideoSource,
  sopWorkspace,
  sortMark,
  startDate,
  startSop,
  statusClass,
  storeCnyRate,
  storeCostDrafts,
  storeHealth,
  storeProfitSummary,
  storeProfitValue,
  structuredValueLabel,
  supplementalDraft,
  supplementalMetricFields,
  syncData,
  t,
  te,
  todayDetailsExpanded,
  toggleActionSelection,
  toggleActionSort,
  toggleAuditSort,
  toggleCampaignSort,
  toggleCreativeSort,
  togglePacingFilter,
  toggleProductCostSort,
  toggleProductSort,
  toggleSopAutomation,
  toggleSopStatus,
  uniqueStores,
  workspaceFreshness,
});
</script>

<template>
  <main class="gmv-workspace gv-viz gv-skin" data-testid="gmv-max-workspace">
    <div
      :class="[
        'gmv-feature-layout',
        'is-topnav',
      ]"
      data-testid="gmv-feature-layout"
    >
      <GmvMaxTopNav
        :modules="workspaceModules"
        :settings-label="simpleMode ? undefined : t('gmvV2.nav.settings')"
        :academy-label="simpleMode ? undefined : t('gmvV2.nav.academy')"
        :active-tab="activeTab"
        :connected="connected && !authExpired"
        :connection-label="authExpired ? t('gmvV2.auth.status') : connected ? t('gmvMaxHelp.connected') : t('gmvMaxHelp.disconnected')"
        :help-label="t('gmvMaxV2.navigation.help')"
        :simple="simpleMode"
        :simple-label="t('gmvV2.simple.mode.simple')"
        :pro-label="t('gmvV2.simple.mode.pro')"
        :mode-hint="simpleMode ? t('gmvV2.simple.mode.toProHint') : t('gmvV2.simple.mode.toSimpleHint')"
        @select="selectFeatureTab($event as TabId)"
        @help="selectFeatureTab('help')"
        @mode="setUiMode"
      >
        <template #tools>
          <GmvAlertsBell
            v-if="!simpleMode"
            :alerts="alerts"
            :desktop-enabled="desktopAlertsEnabled"
            @open="openAlertCampaign"
            @desktop="setDesktopAlerts"
          />
        </template>
      </GmvMaxTopNav>
      <div class="gmv-feature-content">
        <header
          v-if="activeTab !== 'help'"
          :class="['gmv-header', 'gmv-task-header', { 'has-range': DATE_RANGE_TABS.includes(activeTab) }]"
        >
          <!-- Data pages lead with the shared date range; the top bar already names the page. -->
          <div v-if="DATE_RANGE_TABS.includes(activeTab)" class="gmv-header-filters" data-testid="gmv-global-filters">
            <GmvDateRange
              :start-date="startDate"
              :end-date="endDate"
              :compare="compareEnabled"
              @change="setDateRange"
              @compare="setCompare"
            />
            <div class="gmv-am__seg" role="group" :aria-label="t('gmvV2.filters.type')" data-testid="gmv-type-filter">
              <button
                v-for="type in ['all', 'PRODUCT', 'LIVE']"
                :key="type"
                type="button"
                :class="{ 'is-active': selectedType === type }"
                @click="setTypeFilter(type)"
              >
                {{ type === "all" ? t("gmvMaxConsole.allTypes") : t(`gmvMax.types.${type.toLowerCase()}`) }}
              </button>
            </div>
            <!-- The campaigns page has its own search box in its toolbar. -->
            <label v-if="activeTab !== 'campaigns'" class="gmv-am__search gmv-header-search">
              <Search />
              <input
                v-model="searchText"
                data-testid="gmv-global-search"
                :placeholder="t('gmvMaxConsole.search')"
                @keydown.enter="applyDataFilters"
              />
            </label>
            <button
              v-if="filtersActive"
              type="button"
              class="gmv-dlink"
              data-testid="gmv-clear-filters"
              @click="clearFilters"
            >
              {{ t("gmvV2.filters.clear") }}
            </button>
          </div>
          <div v-else class="gmv-task-header__identity">
            <div class="gmv-task-header__symbol" aria-hidden="true">
              <component :is="activeNavigationIcon" />
            </div>
            <div class="gmv-task-header__copy">
              <h1>{{ pageMeta.title }}</h1>
              <p>{{ pageMeta.subtitle }}</p>
            </div>
          </div>
          <div
            :class="[
              'gmv-header__actions',
              { 'is-sop-header-actions': activeTab === 'sop' },
            ]"
          >
            <label v-if="activeTab !== 'sop'" class="gmv-store-select" :title="t('gmvMaxTaskUi.scope')">
              <Store />
              <select v-model="selectedStore" data-testid="gmv-store-select" :aria-label="t('gmvMaxTaskUi.scope')" @change="applyDataFilters">
                <option value="all">{{ t("gmvMaxConsole.allStores") }}</option>
                <option v-for="store in uniqueStores" :key="store.storeId" :value="store.storeId">{{ store.storeName }}</option>
              </select>
              <ChevronDown />
            </label>
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
        <div v-if="authExpired" class="gmv-alert gmv-alert--danger gmv-auth-banner" data-testid="gmv-auth-expired">
          <ShieldAlert class="gmv-icon" />
          <span>{{ t("gmvV2.auth.expired") }}</span>
          <button
            type="button"
            class="gmv-button gmv-button--primary"
            data-testid="gmv-reauthorize"
            :disabled="!!busyAction"
            @click="reauthorize"
          >
            <Link2 class="gmv-icon" />{{ t("gmvV2.auth.reauthorize") }}
          </button>
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
          v-if="
            taskSummary.length && activeTab !== 'growth' && activeTab !== 'campaigns' && activeTab !== 'creatives'
          "
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

        <GmvV2Today
          v-if="activeTab === 'today'"
          :store-id="selectedStore"
          :connected="connected"
          :loading="loading || !!busyAction"
          :simple="simpleMode"
          @open-campaigns="openDiagnosis"
          @sync="syncData"
          @connect="connect"
        />
        <GmvV2Campaigns
          v-else-if="activeTab === 'diagnosis'"
          :store-id="selectedStore"
          :loading="loading || !!busyAction"
          :initial-code="diagnosisFilter"
          :simple="simpleMode"
        />
        <GmvV2Academy v-else-if="activeTab === 'academy'" :store-id="selectedStore" />
        <GmvOverviewPage v-if="activeTab === 'overview'" />

        <GmvPlanPage v-else-if="activeTab === 'sop'" />

        <GmvCampaignsPage v-else-if="activeTab === 'campaigns'" />

        <GmvProductsPage v-else-if="activeTab === 'growth'" />

        <GmvActionsPage v-else-if="activeTab === 'actions'" />

        <GmvRulesPage v-else-if="activeTab === 'rules'" />

        <GmvCreativesPage v-else-if="activeTab === 'creatives'" />

        <GmvProfitPage v-else-if="activeTab === 'profit'" />

        <GmvSettingsPage v-else-if="activeTab === 'settings'" />

        <GmvHelpPage v-else-if="activeTab === 'help'" />

        <GmvAuditPage v-else-if="activeTab === 'audit'" />
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
              <ShieldAlert /><span>{{ syncProgress.error ? readableError(syncProgress.error) : errorText }}</span>
              <button
                v-if="AUTH_EXPIRED_PATTERN.test(String(syncProgress.error || ''))"
                type="button"
                class="gmv-button gmv-button--primary"
                data-testid="gmv-sync-reauthorize"
                :disabled="!!busyAction"
                @click="reauthorize"
              >
                <Link2 class="gmv-icon" />{{ t("gmvV2.auth.reauthorize") }}
              </button>
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
