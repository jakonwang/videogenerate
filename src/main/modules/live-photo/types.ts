export type LivePhotoSourceType = 'reference_replace' | 'clone_shot'
export type LivePhotoPackagingStatus = 'draft' | 'processing' | 'completed' | 'failed'
export type LivePhotoMotionTemplate = 'push_in' | 'push_out' | 'ambient_sway'
export type LivePhotoOutputResolution = '1080x1440' | '2160x2880' | '3024x4032'
export type LivePhotoFrameRate = '24' | '30'
export type LivePhotoQuality = 'medium' | 'high'

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
  retryLimit: number
  retryCount: number
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
  promptVersionId?: string
  promptVersion?: number
  promptHash?: string
  qualityReport?: LivePhotoQualityReport
  replacementRegion?: LivePhotoReplacementRegion
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
  'logs' | 'promptPreview' | 'imagePromptPreview' | 'videoPromptPreview'
>

export type CreateReferenceLivePhotoInput = {
  referenceImagePath?: string
  referenceImagePaths?: string[]
  productId: string
  motionTemplate?: LivePhotoMotionTemplate
}

export type CreateCloneShotLivePhotosInput = {
  cloneProjectId: string
  shotIds: string[]
  motionTemplate?: LivePhotoMotionTemplate
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
  updatedAt: number
}

export type SaveLivePhotoPromptVersionInput = {
  id?: string
  name: string
  prompt: string
}
