import type { ChatPlatformProfile, ImagePlatformProfile, PlatformProfile } from '../platformSettings'

export type WebUser = {
  id: string
  phone: string
  displayName: string
  status: 'active' | 'disabled'
  createdAt: number
  updatedAt: number
}

export type UserSubscription = {
  userId: string
  planId: string
  planName: string
  status: 'inactive' | 'active' | 'expired'
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

export type SubscriptionPlan = {
  id: string
  name: string
  priceCny: number
  durationDays: number
  monthlyComputeCredits: number
  enabled: boolean
}

export type BillingOrder = {
  id: string
  userId: string
  type: 'subscription' | 'compute_pack'
  planId?: string
  planName?: string
  amountCny: number
  credits?: number
  paymentChannel: 'wechat_native' | 'alipay_native'
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  createdAt: number
  updatedAt: number
  paidAt?: number
  paymentReference?: string
}

export type WalletTransaction = {
  id: string
  userId: string
  type: 'topup' | 'subscription_purchase' | 'compute_reserve' | 'compute_charge' | 'compute_refund'
  amountCredits: number
  balanceAfter: number
  note: string
  relatedOrderId?: string
  relatedProjectId?: string
  relatedAction?: string
  createdAt: number
}

export type CloneProjectSummary = {
  id: string
  title: string
  description?: string
  groupId?: string
  groupName?: string
  archived?: boolean
  status: string
  runMode: 'auto' | 'manual'
  createdAt: number
  updatedAt: number
  currentStep: string
  progressPercent: number
  referenceVideoName: string
  referenceVideoPath: string
  coverAssetPath: string
  previewOutputPath: string
  previewReportPath: string
  outputDir: string
  finalOutputPath: string
  selectedModelIdentityName: string
  productReferenceImageCount: number
  productReferenceImagePaths?: string[]
  shotCount: number
  generatedImageCount: number
  generatedVideoCount: number
  lastError: string
}

export type CloneRunMode = 'auto' | 'manual'
export type PluginStatus = 'installed' | 'uninstalled'
export type PluginRuntimeState = 'enabled' | 'disabled'
export type PluginCategory = 'video_download' | 'video_processing' | 'ecommerce_listing'
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

export type ProductImageMaterialCategory = 'necklace' | 'ring' | 'earring' | 'bracelet'
export type ProductImageMaterialUsageStatus = 'unused' | 'used'
export type ProductImageMaterialBatchStatus = 'queued' | 'processing' | 'completed' | 'partial_failed' | 'failed'

export type ProductImageMaterialProductSummary = {
  id: string
  name: string
  type: string
  coverImagePath?: string
}

export type ProductImageMaterialBatch = {
  id: string
  category: ProductImageMaterialCategory
  status: ProductImageMaterialBatchStatus
  segmentTimeSec: number
  totalVideos: number
  completedVideos: number
  failedVideos: number
  generatedImageCount: number
  currentSourceVideoPath?: string
  lastError?: string
  createdAt: number
  updatedAt: number
}

export type ProductImageMaterialItem = {
  id: string
  batchId: string
  category: ProductImageMaterialCategory
  sourceVideoPath: string
  sourceVideoName: string
  segmentIndex: number
  frameTimeSec: number
  localImagePath: string
  qiniuUrl: string
  materialOrigin?: 'original' | 'derived'
  derivedFromMaterialId?: string
  derivedVariantIndex?: number
  usageStatus: ProductImageMaterialUsageStatus
  boundProductId?: string
  createdAt: number
  updatedAt: number
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
  productReferenceImagePaths?: string[]
  updatedAt: number
  publishedStatus: 'unpublished' | 'published' | 'failed'
  lastPublishTaskId?: string
  lastPublishStatus?: GeelarkTaskStatus
}

export type PluginConfigPayload = Record<string, unknown>

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

export type BatchSubtitleFontOption = {
  family: string
  fileName: string
  source: 'bundled' | 'user' | 'system'
  path?: string
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

export type CloneRuntimeResponse = {
  pipeline: any
  wallet: WalletAccount
  recentBillingLogs: WalletTransaction[]
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

export type ModelProfileOptionValue =
  import('../modelProfileOptions').ModelProfileOptionValue

export type ModelProfileOptions = import('../modelProfileOptions').ModelProfileOptions

export type CloneModelIdentityCreateInput = {
  cloneProjectId: string
  productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
  productPoints?: string
  modelProfileOptions?: ModelProfileOptions
  productReferenceImagePaths?: string[]
  imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
  openaiApiKey?: string
  openaiImageModel?: string
  openaiImageQuality?: 'low' | 'medium' | 'high'
  klingApiKey?: string
  klingHost?: string
  klingImageModel?: string
  grsaiApiKey?: string
  grsaiHost?: string
  grsaiImageModel?: string
  apifoxHub?: {
    enabled?: boolean
    baseUrl?: string
    apiKey?: string
    imageModel?: string
  }
}

export type CloneModelCredentialsPayload = {
  seedanceApiKey?: string
  seedanceHost?: string
  klingApiKey?: string
  klingHost?: string
  grsaiApiKey?: string
  grsaiHost?: string
  qiniuAccessKey?: string
  qiniuSecretKey?: string
  qiniuBucket?: string
  qiniuDomain?: string
  qiniuUploadHost?: string
  qiniuPrefix?: string
  allowMockWhenNoKey?: boolean
  keyframeModel?: string
  videoModelPrimary?: string
  videoModelFallback?: string
  grsaiVideoModel?: string
  grsaiAnalysisModel?: string
  chatProviderPrimary?: 'apifox_hub' | 'grsai'
  videoProviderPrimary?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
  videoProviderFallback?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
  openaiApiKey?: string
  openaiImageModel?: string
  openaiImageQuality?: 'low' | 'medium' | 'high'
  imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
  klingImageModel?: string
  grsaiImageModel?: string
  apifoxHubProfile?: Exclude<PlatformProfile, 'grsai'>
  videoApifoxHubProfile?: Exclude<PlatformProfile, 'grsai'>
  imageApifoxHubProfile?: ImagePlatformProfile
  chatApifoxHubProfile?: ChatPlatformProfile
  ai666Hub?: {
    enabled?: boolean
    baseUrl?: string
    apiKey?: string
    chatProvider?: 'openai' | 'anthropic' | 'gemini'
    chatModel?: string
    chatEndpointStyle?: 'openai_chat' | 'anthropic_native' | 'gemini_native'
    imageProvider?: 'openai' | 'gemini' | 'jimeng' | 'midjourney'
    imageModel?: string
    imageEditModel?: string
    imageEndpointStyle?: 'openai_images' | 'official_rest' | 'midjourney_task'
    videoProvider?: 'openai_video' | 'sora' | 'veo' | 'grok' | 'jimeng' | 'vidu' | 'kling' | 'seedance2' | 'xibapi' | 'gaorui'
    textToVideoModel?: string
    imageToVideoModel?: string
    startEndVideoModel?: string
    referenceVideoModel?: string
    videoEndpointStyle?: 'openai_video' | 'official_rest'
    defaultPollIntervalMs?: number
    defaultTimeoutMs?: number
  }
  vectorEngineHub?: {
    enabled?: boolean
    baseUrl?: string
    apiKey?: string
    chatProvider?: 'openai' | 'anthropic' | 'gemini'
    chatModel?: string
    chatEndpointStyle?: 'openai_chat' | 'anthropic_native' | 'gemini_native'
    imageProvider?: 'openai' | 'gemini' | 'jimeng' | 'midjourney'
    imageModel?: string
    imageEditModel?: string
    imageEndpointStyle?: 'openai_images' | 'official_rest' | 'midjourney_task'
    videoProvider?: 'openai_video' | 'sora' | 'veo' | 'grok' | 'jimeng' | 'vidu' | 'kling' | 'seedance2' | 'xibapi' | 'gaorui'
    textToVideoModel?: string
    imageToVideoModel?: string
    startEndVideoModel?: string
    referenceVideoModel?: string
    videoEndpointStyle?: 'openai_video' | 'official_rest'
    defaultPollIntervalMs?: number
    defaultTimeoutMs?: number
  }
  xibapiHub?: {
    enabled?: boolean
    baseUrl?: string
    apiKey?: string
    chatProvider?: 'openai' | 'anthropic' | 'gemini'
    chatModel?: string
    chatEndpointStyle?: 'openai_chat' | 'anthropic_native' | 'gemini_native'
    imageProvider?: 'openai' | 'gemini' | 'jimeng' | 'midjourney'
    imageModel?: string
    imageEditModel?: string
    imageEndpointStyle?: 'openai_images' | 'official_rest' | 'midjourney_task'
    videoProvider?: 'openai_video' | 'sora' | 'veo' | 'grok' | 'jimeng' | 'vidu' | 'kling' | 'seedance2' | 'xibapi' | 'gaorui'
    textToVideoModel?: string
    imageToVideoModel?: string
    startEndVideoModel?: string
    referenceVideoModel?: string
    videoEndpointStyle?: 'openai_video' | 'official_rest'
    defaultPollIntervalMs?: number
    defaultTimeoutMs?: number
  }
  gaoruiHub?: {
    enabled?: boolean
    baseUrl?: string
    apiKey?: string
    chatProvider?: 'openai' | 'anthropic' | 'gemini'
    chatModel?: string
    chatEndpointStyle?: 'openai_chat' | 'anthropic_native' | 'gemini_native'
    imageProvider?: 'openai' | 'gemini' | 'jimeng' | 'midjourney'
    imageModel?: string
    imageEditModel?: string
    imageEndpointStyle?: 'openai_images' | 'official_rest' | 'midjourney_task'
    videoProvider?: 'openai_video' | 'sora' | 'veo' | 'grok' | 'jimeng' | 'vidu' | 'kling' | 'seedance2' | 'xibapi' | 'gaorui'
    textToVideoModel?: string
    imageToVideoModel?: string
    startEndVideoModel?: string
    referenceVideoModel?: string
    videoEndpointStyle?: 'openai_video' | 'official_rest'
    defaultPollIntervalMs?: number
    defaultTimeoutMs?: number
  }
  apifoxHub?: {
    enabled?: boolean
    baseUrl?: string
    apiKey?: string
    chatProvider?: 'openai' | 'anthropic' | 'gemini'
    chatModel?: string
    chatEndpointStyle?: 'openai_chat' | 'anthropic_native' | 'gemini_native'
    imageProvider?: 'openai' | 'gemini' | 'jimeng' | 'midjourney'
    imageModel?: string
    imageEditModel?: string
    imageEndpointStyle?: 'openai_images' | 'official_rest' | 'midjourney_task'
    videoProvider?: 'openai_video' | 'sora' | 'veo' | 'grok' | 'jimeng' | 'vidu' | 'kling' | 'seedance2' | 'xibapi' | 'gaorui'
    textToVideoModel?: string
    imageToVideoModel?: string
    startEndVideoModel?: string
    referenceVideoModel?: string
    videoEndpointStyle?: 'openai_video' | 'official_rest'
    defaultPollIntervalMs?: number
    defaultTimeoutMs?: number
  }
}

export type CloneWorkflowStep =
  | 'upload_analyze_script'
  | 'model_product_consistency'
  | 'storyboard_video_generation'
  | 'export_final'
  | 'generate_script_variants'
  | 'select_script_variant'
  | 'generate_storyboard_grids'
  | 'generate_shot_videos'
  | 'review_replace_shots'
  | 'compose_final_video'

export type DesktopReleaseItem = {
  version: string
  releaseNotes: string
  downloadUrl: string
  publishedAt?: string
  isMandatory?: boolean
  platform?: string
}

export type DesktopReleaseInfo = {
  latest: DesktopReleaseItem | null
  items: DesktopReleaseItem[]
}
