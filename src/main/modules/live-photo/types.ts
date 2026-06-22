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
  imagePaths: string[]
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

export type LivePhotoItem = {
  id: string
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
}

export type ExportLivePhotoItemsResult = {
  outputDir: string
  total: number
  exported: Array<{
    id: string
    targetDir: string
    imagePath: string
    videoPath: string
    bundlePath: string
    metadataBridgePath: string
    assetIdentifier: string
    videoMetadataMode: 'quicktime_mdta' | 'copied_fallback'
    imageMetadataMode: 'copied_pending_native_metadata'
  }>
  skipped: Array<{ id: string; reason: string }>
}

export type LivePhotoSettings = {
  referenceMotionTemplate: LivePhotoMotionTemplate
  cloneMotionTemplate: LivePhotoMotionTemplate
  outputResolution: LivePhotoOutputResolution
  frameRate: LivePhotoFrameRate
  quality: LivePhotoQuality
  updatedAt: number
}
