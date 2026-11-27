export type LivePhotoSourceType = 'reference_replace' | 'clone_shot'
export type LivePhotoPackagingStatus = 'draft' | 'processing' | 'completed' | 'failed'
export type LivePhotoMotionTemplate = 'push_in' | 'push_out' | 'ambient_sway'
export type LivePhotoOutputResolution = '1080x1440' | '2160x2880' | '3024x4032'
export type LivePhotoFrameRate = '24' | '30'
export type LivePhotoQuality = 'medium' | 'high'
export type LivePhotoPromptKind = 'image' | 'video'

export type LivePhotoProductSnapshot = {
  id: string
  name: string
  type: string
  coverImagePath?: string
  authoritativeProductReferencePath?: string
  imagePaths: string[]
  productAnalysis?: {
    category?: string
    summary?: string
    coreSubject?: string
    connectionStructure?: string
    materialDetails?: string
    wearingPosition?: string
    surfaceDetails?: string
    colorDetails?: string
    geometryDetails?: string
    sizeScale?: string
    matchingRules?: string[]
    rawDescription?: string
  }
}

export type LivePhotoCloneShotSnapshot = {
  shotId: string
  shotLabel: string
  imagePath?: string
  videoPath?: string
}

export type LivePhotoPromptPreview = {
  title: string
  instructions: string[]
}

export type LivePhotoRequestPreview = {
  provider?: string
  model?: string
  prompt: string
  negativePrompt?: string
  referenceImagePaths: string[]
  /** 实际发出去时用的提示词版本（只有「已发送」的记录才有） */
  promptVersion?: number
  promptVersionName?: string
  sentAt?: number
}

export type LivePhotoPromptVersion = {
  id: string
  name: string
  version: number
  prompt: string
  promptHash: string
  active: boolean
  createdAt: number
  updatedAt: number
  kind?: LivePhotoPromptKind
}

export type LivePhotoQualityDecision = 'pass' | 'retry' | 'reject'

export type LivePhotoReplacementRegion = {
  x: number
  y: number
  width: number
  height: number
  source: 'auto' | 'manual'
  confidence?: number
  revision: number
  updatedAt: number
}

/**
 * 「贴真实商品」的摆放：中心点（占整张图的比例）、商品宽度（占整张图宽度的比例）、角度（度）。
 * confirmedAt：用户在「调整摆放」里点过确认的时间；选了「生成前让我确认」时，没确认就停下来等。
 */
export type LivePhotoProductPlacement = {
  cx: number
  cy: number
  width: number
  rotation: number
  /** 侧倾：横向压窄的比例（0.2~1，不填 = 1），模拟商品侧过来、斜过来 */
  squash?: number
  /** 翻面：左右镜像 */
  flip?: boolean
  confirmedAt?: number
}

/** 商品替换方式：paste = 贴真实商品再让 AI 融合（新任务默认）；不填 = 原来的 AI 直接画（旧任务） */
export type LivePhotoReplaceMode = 'paste'
export type LivePhotoPlacementMode = 'auto' | 'confirm'

export type LivePhotoSceneInteractionMode = 'worn' | 'held' | 'placed' | 'hanging' | 'attached' | 'none' | 'unknown'

export type LivePhotoSceneInteraction = {
  mode: LivePhotoSceneInteractionMode
  confidence: number
  support?: string
  occlusion?: string
  revision: number
  updatedAt: number
}

export type LivePhotoQualityReport = {
  checkerVersion: string
  mode: 'local_python' | 'remote_fallback'
  decision: LivePhotoQualityDecision
  score: number
  threshold: number
  retryFloor: number
  components: {
    clip: number
    dinov2: number
    orb: number
    ssim: number
    scenePreservation: number
    textConsistency: number
  }
  hardFailures: string[]
  notes: string[]
  fallbackReason?: string
  durationMs: number
  checkedAt: number
}

export type LivePhotoGenerationAttempt = {
  id: string
  index: number
  outputPath: string
  provider?: string
  model?: string
  strategy?: string
  negativePrompt?: string
  cacheHit: boolean
  quality?: LivePhotoQualityReport
  regionRevision?: number
  createdAt: number
}

export type LivePhotoTaskLogLevel = 'info' | 'success' | 'error'

export type LivePhotoTaskLog = {
  id: string
  level: LivePhotoTaskLogLevel
  message: string
  time: number
}

export type LivePhotoWorkflowStep =
  | 'queued'
  | 'image_generation'
  | 'image_validation'
  | 'video_generation'
  | 'live_photo_packaging'
  | 'completed'

export type LivePhotoWorkflowStepStatus = {
  status: 'idle' | 'running' | 'done' | 'failed'
  updatedAt: number
  error?: string
}

export type LivePhotoWorkflow = {
  currentStep: LivePhotoWorkflowStep
  stepStatus: Record<LivePhotoWorkflowStep, LivePhotoWorkflowStepStatus>
  updatedAt: number
}

export type LivePhotoAutoFlowStatus = {
  enabled: boolean
  status: 'idle' | 'running' | 'done' | 'failed_retryable' | 'failed_terminal'
  paused?: boolean
  imageValidationBypassed?: boolean
  imageRetryMode?: 'auto' | 'manual_once'
  failedStage?: 'image' | 'video'
  retryScope?: 'image' | 'video'
  retryLimit: number
  retryCount: number
  imageRetryCount?: number
  videoRetryCount?: number
  currentStage: LivePhotoWorkflowStep
  lastStartedAt?: number
  lastCompletedAt?: number
  lastError?: string
}

export type LivePhotoSubtitleOverlay = {
  active: boolean
  originalOutputPath: string
  originalCoverImagePath?: string
  subtitleOutputPath: string
  subtitleCoverImagePath?: string
  appliedAt: number
}

export type LivePhotoItem = {
  id: string
  usageStatus?: 'unused' | 'used'
  usedAt?: number
  usedChannel?: string
  usedUserId?: string
  sourceType: LivePhotoSourceType
  sourceProjectId?: string
  sourceProjectTitle?: string
  sourceShotId?: string
  sourceShotLabel?: string
  productId?: string
  productSnapshot?: LivePhotoProductSnapshot
  cloneShotSnapshot?: LivePhotoCloneShotSnapshot
  referenceImagePath?: string
  /** 同款模板 this item copies: camera work and look of a reference clip. */
  styleReference?: {
    id: string
    videoName: string
    camera: string
    action: string
    lighting: string
    background: string
    style: string
  }
  generatedStillPath?: string
  originalMotionVideoPath?: string
  motionVideoPath?: string
  livePhotoImagePath?: string
  livePhotoVideoPath?: string
  packagingStatus: LivePhotoPackagingStatus
  previewVideoPath?: string
  posterPath?: string
  exportBundlePath?: string
  packagingManifestPath?: string
  packagingAssetIdentifier?: string
  packagingMetadataBridgePath?: string
  videoMetadataMode?: 'quicktime_mdta' | 'copied_fallback'
  imageMetadataMode?: 'copied_pending_native_metadata'
  subtitleOverlayActive?: boolean
  subtitleOriginalOutputPath?: string
  subtitleOutputPath?: string
  subtitleCoverImagePath?: string
  subtitleAppliedAt?: number
  subtitleOverlay?: LivePhotoSubtitleOverlay
  promptPreview?: LivePhotoPromptPreview
  imagePromptPreview?: LivePhotoRequestPreview
  videoPromptPreview?: LivePhotoRequestPreview
  /** 视频这一步真正提交给模型的提示词（提交时记下，详情里显示它，而不是按当前版本重新拼） */
  videoPromptSent?: LivePhotoRequestPreview
  imageTaskId?: string
  imageTaskProvider?: string
  imageTaskModel?: string
  imageTaskBaseUrl?: string
  imageTaskEndpointStyle?: string
  videoTaskId?: string
  videoTaskProvider?: string
  videoTaskModel?: string
  videoTaskBaseUrl?: string
  videoTaskEndpointStyle?: string
  /** 图生视频选的模型（清单 id，见 src/shared/videoModels.ts）；没有 = 沿用设置里的视频接口 */
  videoModelId?: string
  /** 图生视频时长（秒），会收敛到模型支持的值 */
  videoDurationSec?: number
  /** 图生视频清晰度（如 720p），会收敛到模型支持的值 */
  videoResolution?: string
  /**
   * 尾帧（参考 tk创意室）：模型支持首尾帧时，没用同款模板就把首帧放大这个百分比当尾帧（镜头推近）；
   * 0 = 只传首帧。用了同款模板时尾帧是模板结尾帧换上商品，换失败再按这个放大。
   */
  videoZoomPercent?: number
  /** 已经做好的尾帧，重试时直接复用 */
  videoLastFramePath?: string
  promptVersionId?: string
  promptVersion?: number
  promptHash?: string
  qualityReport?: LivePhotoQualityReport
  replacementRegion?: LivePhotoReplacementRegion
  /** 贴真实商品（见 pasteReplace.ts）：替换方式、摆放方式、抠图用的商品图、中间产物和摆放 */
  replaceMode?: LivePhotoReplaceMode
  placementMode?: LivePhotoPlacementMode
  cutoutSourcePath?: string
  /** user = 创建时手动选的；auto = 按参考图里原商品的角度自动挑的（只挑一次） */
  cutoutSourceChosenBy?: 'user' | 'auto'
  /** 参考图里原商品是一对还是一只（自动挑图时一起判断） */
  cutoutPair?: boolean
  productCutoutPath?: string
  erasedScenePath?: string
  erasedRegionRevision?: number
  placement?: LivePhotoProductPlacement
  /** 停在「待确认摆放」：等用户在「调整摆放」里确认 */
  awaitingPlacement?: boolean
  sceneInteraction?: LivePhotoSceneInteraction
  generationAttempts?: LivePhotoGenerationAttempt[]
  cacheKey?: string
  cacheHit?: boolean
  checkerFallbackReason?: string
  workflow?: LivePhotoWorkflow
  autoFlowStatus?: LivePhotoAutoFlowStatus
  logs?: LivePhotoTaskLog[]
  error?: string
  createdAt: number
  updatedAt: number
}

export type LivePhotoItemSummary = Omit<
  LivePhotoItem,
  'logs' | 'promptPreview' | 'imagePromptPreview' | 'videoPromptPreview' | 'videoPromptSent'
> & {
  /** 当前这一步开始的时间（摘要不带日志，界面用它显示「已等 x 秒」） */
  stageStartedAt?: number
}

export type CreateReferenceLivePhotoInput = {
  referenceImagePath?: string
  referenceImagePaths?: string[]
  productId: string
  motionTemplate?: LivePhotoMotionTemplate
  /** 同款模板: use its opening frame as the scene and its camera work as the motion. */
  styleReferenceId?: string
  videoModelId?: string
  videoDurationSec?: number
  videoResolution?: string
  videoZoomPercent?: number
  /** 商品摆放：auto = 和原商品一样大，直接生成；confirm = 擦完、抠完图先停下来让用户调整 */
  placementMode?: LivePhotoPlacementMode
  /** 抠图用的商品图（单只、白底最好）；不填用商品主图 */
  cutoutSourcePath?: string
}

export type CreateCloneShotLivePhotosInput = {
  cloneProjectId: string
  shotIds: string[]
  motionTemplate?: LivePhotoMotionTemplate
  videoModelId?: string
  videoDurationSec?: number
  videoResolution?: string
  videoZoomPercent?: number
}

export type ExportLivePhotoItemsInput = {
  ids: string[]
  outputDir?: string
  settings?: Partial<LivePhotoSettings>
}

export type RetryLivePhotoItemInput = {
  id: string
  motionTemplate?: LivePhotoMotionTemplate
  replacementRegion?: Pick<LivePhotoReplacementRegion, 'x' | 'y' | 'width' | 'height'>
  retryMode?: 'auto' | 'manual_once'
  /** 一定从出图那步重做（例如改了商品摆放），不只重做视频 */
  forceImageStage?: boolean
  /** 重试时换模型 / 时长（不传 = 沿用任务原来的） */
  videoModelId?: string
  videoDurationSec?: number
  videoResolution?: string
  videoZoomPercent?: number
}

export type ExportLivePhotoItemsResult = {
  outputDir: string
  total: number
  exported: Array<{
    id: string
    videoPath: string
  }>
  skipped: Array<{ id: string; reason: string }>
}

export type LivePhotoSettings = {
  referenceMotionTemplate: LivePhotoMotionTemplate
  cloneMotionTemplate: LivePhotoMotionTemplate
  outputResolution: LivePhotoOutputResolution
  frameRate: LivePhotoFrameRate
  quality: LivePhotoQuality
  qualityCheckerEnabled?: boolean
  qualityPassThreshold?: number
  qualityRetryFloor?: number
  retryLimit?: number
  updatedAt: number
}

export type SaveLivePhotoPromptVersionInput = {
  id?: string
  name: string
  prompt: string
  kind?: LivePhotoPromptKind
}
