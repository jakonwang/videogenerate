export type WebUserStatus = 'active' | 'disabled'
export type SubscriptionStatus = 'inactive' | 'active' | 'expired'
export type PluginStatus = 'installed' | 'uninstalled'
export type PluginRuntimeState = 'enabled' | 'disabled'
export type WalletTransactionType =
  | 'topup'
  | 'subscription_purchase'
  | 'compute_reserve'
  | 'compute_charge'
  | 'compute_refund'
export type BillingAction =
  | 'analyze_reference'
  | 'generate_script_variants'
  | 'generate_storyboard_images'
  | 'generate_shot_videos'
  | 'compose_final_video'

export type WebUploadPurpose = 'clone_reference_video' | 'clone_product_image'
export type WebAuthCodeRecord = {
  phone: string
  code: string
  channel: AuthCodeChannel
  expiresAt: number
  updatedAt: number
}

export type CloneModelIdentitySummary = {
  id: string
  name: string
  status: 'idle' | 'generating' | 'done' | 'failed'
  productType: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
  coverImagePath?: string
  imagePaths: string[]
  description: string
  updatedAt: number
}

export type PluginCategory = 'video_download' | 'video_processing' | 'ecommerce_listing' | 'advertising_optimization' | 'inventory_analysis'
export type PluginEntryType = 'tool'

export type PluginConfigFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select'
export type GeelarkTaskStatus = 'waiting' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'unknown'

export type GeelarkMusicMode = 'library_ref' | 'manual_ref' | 'volume_only'

export type PluginConfigField = {
  key: string
  label: string
  type: PluginConfigFieldType
  placeholder?: string
  description?: string
  options?: Array<{ label: string; value: string }>
}

export type PluginDefinition = {
  id: string
  name: string
  category: PluginCategory
  description: string
  version: string
  entryType: PluginEntryType
  workspacePath: string
  usageHint: string
  configSchema: PluginConfigField[]
}

export type PluginRecord = {
  pluginId: string
  userId: string
  status: PluginStatus
  runtimeState: PluginRuntimeState
  config: Record<string, unknown>
  installedAt?: number
  updatedAt: number
}

export type PluginSummary = {
  id: string
  name: string
  category: PluginCategory
  description: string
  version: string
  entryType: PluginEntryType
  workspacePath: string
  status: PluginStatus
  enabled: boolean
}

export type PluginDetail = PluginSummary & {
  runtimeState: PluginRuntimeState
  usageHint: string
  configSchema: PluginConfigField[]
  config: Record<string, unknown>
}

export type GeelarkPluginConfigPayload = {
  baseUrl?: string
  appId?: string
  appSecret?: string
  accessToken?: string
  requestTimeoutMs?: number
}

export type GeelarkPluginConfigSummary = {
  baseUrl: string
  appId: string
  requestTimeoutMs: number
  hasAppSecret: boolean
  hasAccessToken: boolean
  updatedAt: number
}

export type GeelarkCloudPhoneSummary = {
  id: string
  serialName: string
  serialNo?: string
  status: number
  rpaStatus?: number
  remark?: string
  groupName?: string
  tags?: string[]
  proxyServer?: string
}

export type GeelarkPublishAccount = {
  id: string
  name: string
  platform: 'tiktok'
  geelarkAccountId?: string
  cloudPhoneId: string
  cloudPhoneName: string
  remark?: string
  status: 'active' | 'disabled'
  createdAt: number
  updatedAt: number
}

export type GeelarkPublishTaskSummary = {
  id: string
  pluginId: string
  cloneProjectId?: string
  publishAccountId: string
  cloudPhoneId: string
  cloudPhoneName?: string
  sourceVideoPath: string
  videoDesc?: string
  productId?: string
  productTitle?: string
  refVideoId?: string
  sameVideoVolume?: number
  sourceVideoVolume?: number
  markAI?: boolean
  musicMode?: GeelarkMusicMode
  musicLabel?: string
  scheduleAt: number
  geelarkTaskId?: string
  status: GeelarkTaskStatus
  failCode?: number
  failDesc?: string
  createdAt: number
  updatedAt: number
  lastSyncAt?: number
}

export type GeelarkPublishTaskDetail = GeelarkPublishTaskSummary & {
  resultImages: string[]
  logs: string[]
  raw?: unknown
}

export type GeelarkMusicPreset = {
  id: string
  label: string
  refVideoId: string
  remark?: string
  createdAt: number
  updatedAt: number
}

export type GeelarkClonePublishCandidate = {
  cloneProjectId: string
  sourceType?: 'clone_final' | 'batch_subtitle_output'
  sourceProjectId?: string
  sourceJobId?: string
  sourceOutputId?: string
  title: string
  coverAssetPath: string
  finalOutputPath: string
  referenceVideoName: string
  referenceVideoPath: string
  updatedAt: number
  publishedStatus: 'unpublished' | 'published' | 'failed'
  lastPublishTaskId?: string
  lastPublishStatus?: GeelarkTaskStatus
}

export type WebUser = {
  id: string
  phone: string
  displayName: string
  status: WebUserStatus
  createdAt: number
  updatedAt: number
}

export type WebSession = {
  token: string
  userId: string
  createdAt: number
  updatedAt: number
  expiresAt: number
}

export type SubscriptionPlan = {
  id: string
  name: string
  priceCny: number
  durationDays: number
  monthlyComputeCredits: number
  enabled: boolean
}

export type UserSubscription = {
  userId: string
  planId: string
  planName: string
  status: SubscriptionStatus
  startedAt?: number
  expiresAt?: number
  updatedAt: number
}

export type WalletAccount = {
  userId: string
  balanceCredits: number
  totalChargedCredits: number
  totalRefundedCredits: number
  updatedAt: number
}

export type WalletTransaction = {
  id: string
  userId: string
  type: WalletTransactionType
  amountCredits: number
  balanceAfter: number
  note: string
  relatedOrderId?: string
  relatedProjectId?: string
  relatedAction?: BillingAction
  createdAt: number
}

export type BillingOrderType = 'subscription' | 'compute_pack'
export type BillingOrderStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type BillingPaymentProvider = 'wechat_native' | 'alipay_native'
export type AuthCodeChannel = 'sms'

export type BillingOrder = {
  id: string
  userId: string
  type: BillingOrderType
  planId?: string
  planName?: string
  amountCny: number
  credits?: number
  paymentChannel: BillingPaymentProvider
  status: BillingOrderStatus
  createdAt: number
  updatedAt: number
  paidAt?: number
  paymentReference?: string
}

export type ComputePriceRule = {
  action: BillingAction
  credits: number
}

export type WebPlatformDb = {
  users: WebUser[]
  sessions: WebSession[]
  subscriptions: UserSubscription[]
  wallets: WalletAccount[]
  walletTransactions: WalletTransaction[]
  orders: BillingOrder[]
  subscriptionPlans: SubscriptionPlan[]
  computePriceRules: ComputePriceRule[]
  loginCodes: WebAuthCodeRecord[]
  plugins: PluginRecord[]
  batchSubtitleJobs?: BatchSubtitleJob[]
}

export type BatchSubtitleSourceType = 'upload' | 'clone_final'
export type BatchSubtitleTitleStrategy = 'single_for_all' | 'random_pool'
export type BatchSubtitleTitleRenderMode = 'overlay_image' | 'ass_text'
export type BatchSubtitleLineMode = 'single' | 'multi'
export type BatchSubtitleTextAlign = 'left' | 'center' | 'right'
export type BatchSubtitlePosition = 'top' | 'center' | 'bottom'
export type BatchSubtitleMode = 'static_title' | 'timed_caption' | 'hybrid'
export type BatchSubtitleTrackStatus = 'idle' | 'processing' | 'completed' | 'failed'
export type BatchSubtitleReflowStrategy = 'balanced' | 'punctuation'
export type BatchSubtitleAvoidPosition = 'auto' | 'top' | 'bottom'
export type BatchSubtitleJobStatus = 'draft' | 'queued' | 'processing' | 'paused' | 'completed' | 'partial_failed' | 'failed'
export type BatchSubtitleOutputPublishStatus = 'idle' | 'queued'
export type BatchSubtitleSourceEngine = 'whisper_compatible' | 'manual'
export type BatchSubtitleExportEngine = 'capcut_mate' | 'ass_fallback'

export type BatchSubtitleSourceItem = {
  id: string
  sourceType: BatchSubtitleSourceType
  sourceVideoPath: string
  sourceProjectId?: string
  sourceProjectTitle?: string
  fileName: string
  coverImagePath?: string
  durationSec?: number
  width?: number
  height?: number
}

export type BatchSubtitleStyleConfig = {
  fontName: string
  fontSize: number
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  position: BatchSubtitlePosition
  safeMargin: number
  lineMode: BatchSubtitleLineMode
  textAlign: BatchSubtitleTextAlign
  maxLines?: number
  maxWidthRatio?: number
  lineGap?: number
  bottomMargin?: number
}

export type BatchSubtitleTitleConfig = {
  strategy: BatchSubtitleTitleStrategy
  singleText: string
  titlePool: string[]
}

export type BatchSubtitleTitleItem = {
  sourceItemId: string
  text: string
  updatedAt: number
}

export type BatchSubtitleTitleStyleMode = 'default' | 'vn_tiktok_viral'

export type BatchSubtitleViralTitleTone = 'hook' | 'conversion' | 'emotional'

export type BatchSubtitleViralSymbolIntensity = 'low' | 'medium' | 'high'

export type BatchSubtitleViralTitleConfig = {
  language?: 'vi' | 'en' | 'zh'
  tone?: BatchSubtitleViralTitleTone
  sellingPoints?: string
  symbolIntensity?: BatchSubtitleViralSymbolIntensity
  generationMode?: 'video_content'
}

export type BatchSubtitleTitleAnalysisItem = {
  sourceItemId: string
  summary: string
  subject?: string
  action?: string
  scene?: string
  durationSec?: number
  updatedAt: number
}

export type BatchSubtitleOverlayImageConfig = {
  canvasWidth: number
  canvasHeight: number
  fontName: string
  fontSize: number
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  position: BatchSubtitlePosition
  safeMargin: number
  textAlign: BatchSubtitleTextAlign
  maxLines: number
  maxWidthRatio: number
  lineGap: number
  bottomMargin: number
}

export type BatchSubtitleOverlayAsset = {
  sourceItemId: string
  titleText: string
  overlayImagePath: string
  overlayPreviewPath?: string
  overlaySvgPath?: string
  generatedAt: number
}

export type BatchSubtitleLayoutPolicy = {
  maxLines: number
  maxWidthRatio: number
  reflowStrategy: BatchSubtitleReflowStrategy
  avoidPosition: BatchSubtitleAvoidPosition
}

export type BatchSubtitleCue = {
  id: string
  startMs: number
  endMs: number
  text: string
  lines: string[]
}

export type BatchSubtitleTrack = {
  sourceItemId: string
  status: BatchSubtitleTrackStatus
  language?: string
  cues: BatchSubtitleCue[]
  error?: string
  updatedAt: number
}

export type BatchSubtitleCaptionStyle = {
  fontName: string
  fontSize: number
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  position: BatchSubtitlePosition
  safeMargin: number
  textAlign: BatchSubtitleTextAlign
  maxLines: number
  maxWidthRatio: number
  lineGap: number
  bottomMargin: number
}

export type BatchSubtitleOutputItem = {
  id: string
  jobId: string
  sourceItemId: string
  sourceVideoPath: string
  outputVideoPath?: string
  coverImagePath?: string
  selectedTitle: string
  titleRenderMode?: BatchSubtitleTitleRenderMode
  overlayImagePath?: string
  renderStatus: 'success' | 'failed'
  error?: string
  publishReady: boolean
  publishStatus: BatchSubtitleOutputPublishStatus
  sourcePreserved: true
  createdAt: number
  updatedAt: number
}

export type BatchSubtitlePreviewResult = {
  sourceItemId: string
  previewImagePath: string
  overlayImagePath: string
  titleRenderMode?: BatchSubtitleTitleRenderMode
  overlayAsset?: BatchSubtitleOverlayAsset
  previewVideoPath?: string
  previewPosterPath?: string
  previewAtSec?: number
  activeCueId?: string
  activeCueText?: string
  activeCueLines?: string[]
  renderedMode?: BatchSubtitleMode
  generatedAt: number
}

export type BatchSubtitleJob = {
  id: string
  userId: string
  name: string
  sourceItems: BatchSubtitleSourceItem[]
  subtitleMode: BatchSubtitleMode
  subtitleSource: BatchSubtitleSourceEngine
  exportEngine: BatchSubtitleExportEngine
  titleRenderMode?: BatchSubtitleTitleRenderMode
  titleConfig: BatchSubtitleTitleConfig
  titleItems?: BatchSubtitleTitleItem[]
  titleStyleMode?: BatchSubtitleTitleStyleMode
  viralTitleConfig?: BatchSubtitleViralTitleConfig
  titleAnalysisItems?: BatchSubtitleTitleAnalysisItem[]
  overlayImageConfig?: BatchSubtitleOverlayImageConfig
  styleConfig: BatchSubtitleStyleConfig
  captionStyle: BatchSubtitleCaptionStyle
  layoutPolicy: BatchSubtitleLayoutPolicy
  subtitleTracks: BatchSubtitleTrack[]
  capcutDraft?: {
    draftId?: string
    status?: string
    error?: string
    taskId?: string
    exportPath?: string
    updatedAt?: number
  }
  batchRuntime?: {
    batchSize?: number
    nextSourceIndex?: number
    totalBatches?: number
    completedBatches?: number
    lastBatchStartedAt?: number
    lastBatchFinishedAt?: number
  }
  status: BatchSubtitleJobStatus
  progress: number
  outputCount: number
  outputs: BatchSubtitleOutputItem[]
  error?: string
  createdAt: number
  updatedAt: number
}

export type WebUploadFileInput = {
  fileName: string
  base64Data: string
  mimeType?: string
}

export type WebAuthLoginInput = {
  phone: string
  code: string
  displayName?: string
}

export type WebAuthSendCodeInput = {
  phone: string
  channel?: AuthCodeChannel
}

export type WebAuthLoginResult = {
  token: string
  user: WebUser
  subscription: UserSubscription
  wallet: WalletAccount
}
