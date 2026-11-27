/** 图生视频任务（渲染层视图用的形状，和主进程 live-photo/types.ts 对齐） */
export type LivePhotoItem = {
  id: string
  sourceType: 'reference_replace' | 'clone_shot'
  sourceProjectTitle?: string
  sourceShotLabel?: string
  productSnapshot?: {
    id: string
    name: string
    type: string
    coverImagePath?: string
    authoritativeProductReferencePath?: string
    imagePaths: string[]
  }
  referenceImagePath?: string
  /** 贴真实商品（见主进程 live-photo/pasteReplace.ts） */
  replaceMode?: 'paste'
  placementMode?: 'auto' | 'confirm'
  erasedScenePath?: string
  productCutoutPath?: string
  placement?: { cx: number; cy: number; width: number; rotation: number; squash?: number; flip?: boolean; confirmedAt?: number }
  awaitingPlacement?: boolean
  /** 融合一次出的几张图，等用户挑一张（见主进程 integratePlacedProduct） */
  stillCandidates?: Array<{ path: string; drift?: number }>
  pickedStillIndex?: number
  awaitingStillPick?: boolean
  packagingStatus: 'draft' | 'processing' | 'completed' | 'failed'
  generatedStillPath?: string
  motionVideoPath?: string
  previewVideoPath?: string
  posterPath?: string
  livePhotoImagePath?: string
  livePhotoVideoPath?: string
  subtitleOverlayActive?: boolean
  subtitleOutputPath?: string
  createdAt?: number
  /** 列表摘要：当前这一步开始的时间（摘要不带日志） */
  stageStartedAt?: number
  exportBundlePath?: string
  packagingMetadataBridgePath?: string
  packagingAssetIdentifier?: string
  videoMetadataMode?: 'quicktime_mdta' | 'copied_fallback'
  imageMetadataMode?: 'copied_pending_native_metadata'
  promptPreview?: { title: string; instructions: string[] }
  imagePromptPreview?: {
    provider?: string
    model?: string
    prompt: string
    negativePrompt?: string
    referenceImagePaths: string[]
  }
  videoPromptPreview?: {
    provider?: string
    model?: string
    prompt: string
    negativePrompt?: string
    referenceImagePaths: string[]
    /** 有 sentAt 表示这是提交时真正发出去的提示词 */
    promptVersion?: number
    promptVersionName?: string
    sentAt?: number
  }
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
  subtitleOverlay?: {
    active: boolean
    originalOutputPath: string
    originalCoverImagePath?: string
    subtitleOutputPath: string
    subtitleCoverImagePath?: string
    appliedAt: number
  }
  workflow?: {
    currentStep: 'queued' | 'image_generation' | 'image_validation' | 'video_generation' | 'live_photo_packaging' | 'completed'
    stepStatus: Record<
      'queued' | 'image_generation' | 'image_validation' | 'video_generation' | 'live_photo_packaging' | 'completed',
      { status: 'idle' | 'running' | 'done' | 'failed'; updatedAt: number; error?: string }
    >
    updatedAt: number
  }
  autoFlowStatus?: {
    enabled: boolean
    status: 'idle' | 'running' | 'done' | 'failed_retryable' | 'failed_terminal'
    paused?: boolean
    retryLimit: number
    retryCount: number
    imageRetryMode?: 'auto' | 'manual_once'
    currentStage: 'queued' | 'image_generation' | 'image_validation' | 'video_generation' | 'live_photo_packaging' | 'completed'
    lastStartedAt?: number
    lastCompletedAt?: number
    lastError?: string
    imageValidationBypassed?: boolean
    failedStage?: 'image' | 'video'
    retryScope?: 'image' | 'video'
  }
  promptVersionId?: string
  promptVersion?: number
  promptHash?: string
  cacheHit?: boolean
  checkerFallbackReason?: string
  qualityReport?: LivePhotoQualityReport
  replacementRegion?: {
    x: number
    y: number
    width: number
    height: number
    source: 'auto' | 'manual'
    confidence?: number
    revision: number
    updatedAt: number
  }
  generationAttempts?: Array<{
    id: string
    index: number
    outputPath: string
    provider?: string
    model?: string
    strategy?: string
    cacheHit: boolean
    quality?: LivePhotoQualityReport
    createdAt: number
  }>
  logs?: Array<{ id: string; level: 'info' | 'success' | 'error'; message: string; time: number }>
  error?: string
  updatedAt: number
}

export type LivePhotoQualityReport = {
  checkerVersion: string
  mode: 'local_python' | 'remote_fallback'
  decision: 'pass' | 'retry' | 'reject'
  score: number
  threshold: number
  retryFloor: number
  components: Record<string, number>
  hardFailures: string[]
  notes: string[]
  fallbackReason?: string
  durationMs: number
  checkedAt: number
}
