export type CloneLocale = 'vi-VN' | 'zh-CN'
export type CloneStrength = 'structure'
export type ShotPurpose = 'hook' | 'problem' | 'solution' | 'proof' | 'cta'
export type ShotSourceMode = 'uploaded' | 'pending' | 'ai'
export type CloneHookType =
  | 'price'
  | 'pain_point'
  | 'before_after'
  | 'curiosity'
  | 'visual_impact'
  | 'social_proof'
  | 'style_showcase'
  | 'unknown'
export type CloneShotRole =
  | 'hook'
  | 'product_show'
  | 'detail'
  | 'try_on'
  | 'proof'
  | 'price'
  | 'cta'
  | 'transition'
export type CloneShotType =
  | 'real_product'
  | 'model_demo'
  | 'handheld'
  | 'closeup'
  | 'packaging'
  | 'screen_recording'
  | 'result_showcase'
  | 'other'
export type CloneReplacementMode = 'local_video' | 'local_image_to_video' | 'ai_generate' | 'skip'
export type CloneAIDifficulty = 'low' | 'medium' | 'high'
export type CloneRealismRisk = 'low' | 'medium' | 'high'
export type CloneProductVisibility = 'none' | 'low' | 'medium' | 'high'
export type CloneCutDensity = 'low' | 'medium' | 'high'
export type CloneRealismStyle = 'ugc' | 'studio' | 'live_room' | 'handheld' | 'product_closeup'
export type CloneFraming = 'extreme_closeup' | 'closeup' | 'medium' | 'wide'
export type ViralShotRole =
  | 'hook'
  | 'product_closeup'
  | 'model_scene'
  | 'detail'
  | 'price_offer'
  | 'social_proof'
  | 'cta'
export type ViralReplaceMode = 'upload_video' | 'upload_image_to_video' | 'ai_generate' | 'locked'
export type ViralShotMotion = 'static' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'shake' | 'fast_cut'
export type ViralTransition = 'hardcut' | 'fade' | 'flash' | 'slide' | 'zoom'
export type CaptionPosition = 'top' | 'middle' | 'bottom'
export type RequiredAssetType = 'product_image' | 'product_video' | 'model_video' | 'scene_image' | 'any'
export type ShotStatus = 'empty' | 'ready' | 'generating' | 'done' | 'failed'
export type CloneReviewStatus = 'pending' | 'keep' | 'reject'
export type AiProviderName = 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
export type ImageProviderName = 'openai' | 'kling' | 'grsai' | 'apifox_hub'
export type AiTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'
export type ConsistencyMode = 'soft' | 'hard'
export type CloneQualityMode = 'fast' | 'standard' | 'high'
export type CloneProductType = 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
export type StoryboardImageTemplateType = 'general' | 'jewelry' | 'ecommerce_packaging' | 'lifestyle_interaction'
export type CloneProductMode = 'STRICT' | 'BALANCED' | 'EXPRESSIVE'
export type ModelProfileOptions = import('../../../shared/modelProfileOptions').ModelProfileOptions
export type ScriptRole =
  | 'hook'
  | 'pain_point'
  | 'solution'
  | 'show'
  | 'detail'
  | 'proof'
  | 'offer'
  | 'cta'
  | 'transition'
  | 'unknown'
export type ShotQualityStatus = 'unchecked' | 'pending' | 'passed' | 'warning' | 'failed'
export type GptImageGenerationStatus = 'idle' | 'generating' | 'done' | 'failed'
export type GptFrameConfirmStatus = 'unconfirmed' | 'confirmed'
export type StoryboardReferenceMode = 'product_closeup' | 'model_presentation'
export type StoryboardSubjectType =
  | 'product_only'
  | 'hand_only_product'
  | 'local_wearable_closeup'
  | 'model_visible'
  | 'unknown'
export type StoryboardReferenceConfidence = 'high' | 'medium' | 'low'
export type ShotCloneClass =
  | 'real_product'
  | 'model_demo'
  | 'screen_recording'
  | 'tutorial_talking'
  | 'ui_demo'
  | 'result_showcase'

export type ShotPrompt = {
  positive: string
  negative: string
  cameraMotion: string
  aspectRatio: '9:16' | '16:9'
}

export type ReferenceLock = {
  sceneEnvironment: string
  subjectPose: string
  productAction: string
  cameraComposition: string
  motionPath: string
  mustPreserve: string[]
  mayReplace: string[]
  mustAvoid: string[]
  strength: 'hard_reference_motion'
}

export type ShotSpec = {
  id: string
  index: number
  purpose: ShotPurpose
  startSec: number
  endSec?: number
  durationSec: number
  role?: ViralShotRole
  visualType?: string
  cloneClass?: ShotCloneClass
  cloneEligible?: boolean
  filterReason?: string
  visualPrompt?: string
  thumbnailPath?: string
  referenceFramePaths?: {
    start?: string
    mid?: string
    end?: string
  }
  originalCaption?: string
  captionPosition?: CaptionPosition
  motion?: ViralShotMotion
  transitionIn?: ViralTransition
  transitionOut?: ViralTransition
  replaceMode?: ViralReplaceMode
  requiredAssetType?: RequiredAssetType
  uploadedAssetPath?: string
  uploadedImagePath?: string
  originalProductReferenceImagePaths?: string[]
  sanitizedProductReferenceImagePaths?: string[]
  productReferenceImagePaths?: string[]
  generatedFirstFramePath?: string
  generatedLastFramePath?: string
  generatedClipPath?: string
  generatedProvider?: string
  generatedModel?: string
  generatedTaskId?: string
  generatedSource?: 'cloud' | 'mock' | 'local'
  isMock?: boolean
  qualityMode?: CloneQualityMode
  qualityStatus?: ShotQualityStatus
  qualityScore?: number
  qualityReasons?: string[]
  retryCount?: number
  productType?: CloneProductType
  productMainImage?: string
  productDetailImages?: string[]
  productUsageImages?: string[]
  styleReferenceImages?: string[]
  productIdentityText?: string
  nextRoundPromptDirectives?: string[]
  gptFirstFramePath?: string
  gptLastFramePath?: string
  gptFrameStatus?: GptImageGenerationStatus
  gptFrameError?: string
  gptFrameConfirmed?: boolean
  gptFrameSource?: 'gpt_image'
  gptFrameModel?: string
  generatedClipDurationSec?: number
  generatedClipWidth?: number
  generatedClipHeight?: number
  qualityStatusDetail?: ShotQualityStatus
  retrySuggestion?: string
  freezeRatio?: number
  blackFrameRatio?: number
  productVisibilityScore?: number
  canEnterRender?: boolean
  promptHash?: string
  imagePromptHash?: string
  normalizedCacheKey?: string
  assetMatchScore?: number
  assetMatchLabel?: string
  assetMatchReasons?: string[]
  assetMatchDetail?: AssetMatchScoreDetail
  selectedAssetId?: string
  shotRole?: CloneShotRole
  shotType?: CloneShotType
  storyboardSubjectType?: StoryboardSubjectType
  storyboardReferenceMode?: StoryboardReferenceMode
  storyboardReferenceConfidence?: StoryboardReferenceConfidence
  storyboardReferenceReason?: string[]
  referenceModeLocked?: boolean
  referenceModeLockReason?: 'manual' | 'scene_contains_model_wearing'
  referenceLock?: ReferenceLock
  scriptText: string
  scriptRole: ScriptRole
  narrationText?: string
  onScreenText?: string
  visualDescription: string
  subjectPosition?: {
    person?: string
    product?: string
    text?: string
  }
  sceneDescription?: {
    location?: string
    background?: string
    lighting?: string
    style?: string
  }
  emotionDescription?: {
    tone?: string
    intensity?: number
  }
  actionDescription: string
  cameraDescription: string
  productFocus: string
  textOverlay?: {
    content?: string
    position?: string
    fontSize?: 'small' | 'medium' | 'large' | 'extra_large'
    style?: string
    color?: string
    animation?: string
  }
  generationPrompt: string
  scriptConfidence: number
  analysisNotes?: string[]
  framing?: CloneFraming
  cameraMovement?: string
  action?: string
  productVisibility?: CloneProductVisibility
  replacementMode?: CloneReplacementMode
  aiDifficulty?: CloneAIDifficulty
  realismRisk?: CloneRealismRisk
  requiredAssets?: string[]
  promptHint?: string
  negativePromptHint?: string
  realismStyle?: CloneRealismStyle
  forceAi?: boolean
  aiPrompt?: string
  negativePrompt?: string
  locked?: boolean
  status?: ShotStatus
  error?: string
  visual: string
  subtitleSuggestion: string
  materialNeed: string
  sourceMode: ShotSourceMode
  uploadedAssetIds: string[]
  aiEnabled: boolean
  prompt: ShotPrompt
  keyframes?: ShotKeyframeSpec
  aiGeneratedAssetId?: string
  reviewStatus: CloneReviewStatus
  consistencyMode?: 'standard' | 'strict'
  compiledPrompt?: string
  compiledNegativePrompt?: string
  promptCompilerVersion?: string
}

export type ShotVariant = {
  id: string
  shotId: string
  scriptRole: ShotSpec['scriptRole']
  styleType: 'real_person' | 'product_closeup' | 'comparison' | 'aesthetic' | 'minimal' | 'emotional' | 'no_person'
  scriptText: string
  visualDescription: string
  sceneDescription: string
  actionDescription: string
  cameraDescription: string
  productDisplay: string
  textOverlay: {
    content: string
    position: string
    fontSize: string
    style: string
  }
  generationPrompt: string
  negativePrompt: string
  variationTags: string[]
  isSelected?: boolean
  reviewStatus?: CloneReviewStatus
  createdAt: number
}

export type ShotVariantScore = {
  variantId: string
  hookScore: number
  engagementScore: number
  conversionScore: number
  gmvScore: number
  realismScore: number
  duplicateRiskScore: number
  totalScore: number
  reason: string
  suggestion: string
}

export type VideoPlan = {
  id: string
  name: string
  cloneProjectId: string
  targetProductId?: string
  structure: Array<{
    shotId: string
    variantId: string
    role: ShotSpec['scriptRole']
  }>
  score: {
    hookScore: number
    conversionScore: number
    duplicateSafetyScore: number
    totalScore: number
    reason: string
  }
  status: 'draft' | 'selected' | 'generating' | 'done' | 'failed' | 'rejected'
  outputTaskIds?: string[]
  createdAt: number
}

export type ShotKeyframeAsset = {
  filePath: string
  provider: AiProviderName
  model: string
  taskId: string
  createdAt: number
}

export type ShotKeyframeSpec = {
  startFrame?: ShotKeyframeAsset
  endFrame?: ShotKeyframeAsset
  styleHints: string[]
  consistencyMode: ConsistencyMode
}

export type CloneScriptFramework = {
  hook: string
  painPoint: string
  solution: string
  proof: string
  offer: string
  cta: string
}

export type CloneRhythmProfile = {
  avgShotDurationSec: number
  cutDensity: CloneCutDensity
  first3SecShotCount: number
  hasFastCut: boolean
}

export type CloneVisualStyleProfile = {
  scene: string
  lighting: string
  cameraStyle: string
  movementStyle: string
  realismStyle: CloneRealismStyle
}

export type ProductionQualityCheckResult = {
  qualityStatus: 'pending' | 'passed' | 'warning' | 'failed'
  qualityScore: number
  qualityReasons: string[]
  retrySuggestion: string
  generatedClipDurationSec: number
  generatedClipWidth: number
  generatedClipHeight: number
  freezeRatio: number
  blackFrameRatio: number
  productVisibilityScore: number
  isMock: boolean
  canEnterRender: boolean
}

export type AssetMatchScoreDetail = {
  role: number
  clarity: number
  duration: number
  aspectRatio: number
  resolution: number
  realism: number
  history: number
  total: number
}

export type AssetMatchCandidate = {
  assetId: string
  filePath: string
  source: 'local_video' | 'local_image'
  score: number
  detail: AssetMatchScoreDetail
  reasons: string[]
}

export type ClonePromptCacheEntry = {
  hash: string
  shotId: string
  positivePrompt: string
  negativePrompt: string
  model: string
  qualityMode: CloneQualityMode
  createdAt: number
}

export type CloneFrameCacheEntry = {
  hash: string
  shotId: string
  imagePaths: string[]
  provider: string
  model: string
  createdAt: number
  sourceProductRefs: string[]
  promptHash: string
}

export type CloneCloudClipCacheEntry = {
  hash: string
  shotId: string
  filePath: string
  provider: string
  model: string
  createdAt: number
  promptHash: string
}

export type CloneGenerationQueueOptions = {
  maxConcurrentCloudJobs: number
  maxConcurrentSubmitJobs: number
  maxConcurrentPollJobs: number
  maxConcurrentDownloadJobs: number
  pollIntervalMs: number
  perShotTimeoutMs: number
}

export type CloneGenerationQueueRuntime = {
  submitActive: number
  pollActive: number
  downloadActive: number
  submitQueued: number
  pollQueued: number
  downloadQueued: number
  updatedAt: number
}

export type CloneShotVideoFailureBreakdown = {
  missingTask: number
  remoteTimeout: number
  downloadFailed: number
  remoteFailed: number
  localFailed: number
}

export type ClonePreviewPipelineStatus = {
  status: 'idle' | 'running' | 'preview_ready' | 'background_running' | 'done' | 'failed'
  previewOutputPath?: string
  previewReportPath?: string
  foregroundPlanId?: string
  remainingPlanIds?: string[]
  lastError?: string
  updatedAt: number
}

export type CloneGenerationQueueJob = {
  id: string
  cloneProjectId: string
  shotId: string
  priority: number
  status: 'queued' | 'running' | 'done' | 'failed' | 'skipped'
  retryCount: number
  createdAt: number
  updatedAt: number
}

export type CloneTemplateMeta = {
  source: 'clone_blueprint'
  cloneProjectId: string
  hookType: CloneHookType
  productCategory: CloneProductType
  rhythm: CloneRhythmProfile
  visualStyle: CloneVisualStyleProfile
}

export type ModelIdentityPack = {
  id: string
  createdAt: number
  updatedAt: number
  status: GptImageGenerationStatus
  confirmed: boolean
  productType: CloneProductType
  market: string
  gender: string
  ageRange: string
  faceShape?: string
  hairStyle: string
  hairColor?: string
  skinTone: string
  bodyType?: string
  outfitStyle: string
  mood: string
  sceneStyle: string
  languageStyle?: string
  cameraPresence?: string
  styleBias?: string
  description: string
  imagePaths: string[]
  model?: string
  error?: string
}

export type ModelIdentityLibraryItem = {
  id: string
  createdAt: number
  updatedAt: number
  status: GptImageGenerationStatus
  name: string
  productType: CloneProductType
  market: string
  gender: string
  ageRange: string
  hairStyle: string
  skinTone: string
  outfitStyle: string
  mood: string
  sceneStyle: string
  faceShape?: string
  hairColor?: string
  bodyType?: string
  languageStyle?: string
  cameraPresence?: string
  styleBias?: string
  description: string
  imagePaths: string[]
  coverImagePath?: string
  model?: string
  error?: string
}

export type ScriptFrame = {
  hook: string
  problem: string
  solution: string
  proof: string
  cta: string
}

export type CloneGlobalScript = {
  language: string
  summary: string
  sellingLogic: string
  hook: string
  cta: string
  content?: string
  cameraMotion?: string
  shotScale?: string
  lighting?: string
  colorTone?: string
  subjectAction?: string
  environment?: string
  reversePrompt?: string
}

export type CloneScriptCandidate = {
  id: string
  summary: string
  score: number
  reason: string
  shotPlanRef: string
  selected?: boolean
}

export type CloneScriptVariantCandidate = {
  id: string
  title: string
  summary: string
  fullScript: string
  shotScripts: Array<{
    shotId: string
    shotIndex: number
    timeRange?: string
    scriptText: string
    scriptRole: ScriptRole
    visualDescription: string
    actionDescription: string
    cameraDescription: string
    generationPrompt: string
  }>
  score: number
  reason: string
  selected?: boolean
  createdAt: number
}

export type CloneStoryboardGridBatch = {
  id: string
  shotIds: string[]
  frameCount: number
  gridType: 'grid-6' | 'grid-9'
  imagePath?: string
  croppedFramePaths: string[]
  status: 'idle' | 'generating' | 'done' | 'failed'
  provider?: string
  model?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export type CloneStoryboardFrame = {
  id: string
  shotId: string
  batchId?: string
  frameIndex?: number
  imagePath?: string
  aspectRatio: '9:16'
  status: 'idle' | 'generating' | 'cropped' | 'failed'
  error?: string
  sourceEvent?: string
  retryCount?: number
  updatedAt?: number
}

export type CloneShotVideoOutput = {
  segmentId?: string
  index?: number
  shotId: string
  source: 'generated' | 'uploaded_replacement'
  videoPath?: string
  localPath?: string
  videoUrl?: string
  taskId?: string
  previousTaskIds?: string[]
  provider?: string
  model?: string
  requestCapability?: UnifiedCapability
  endpointStyle?: string
  baseUrl?: string
  remoteStatus?: string
  remoteRaw?: unknown
  submissionFingerprint?: string
  submissionStartedAt?: number
  submissionLockedUntil?: number
  durationSec?: number
  status:
    | 'idle'
    | 'submit_queued'
    | 'submitting'
    | 'poll_queued'
    | 'remote_pending'
    | 'remote_running'
    | 'download_queued'
    | 'remote_succeeded_pending_download'
    | 'downloading'
    | 'done'
    | 'failed_retryable'
    | 'failed_terminal'
  error?: string
  sourceEvent?: string
  retryCount?: number
  createdAt?: number
  lastPollAt?: number
  completedAt?: number
  updatedAt: number
}

export type CloneShotVideoSubmissionAuditLog = {
  id: string
  shotId: string
  shotIndex?: number
  trigger: 'single_submit' | 'batch_submit' | 'auto_run_submit' | 'force_regenerate_submit'
  provider?: string
  model?: string
  requestCapability?: UnifiedCapability
  submissionFingerprint?: string
  firstFramePath?: string
  lastFramePath?: string
  taskId?: string
  remoteStatus?: string
  sourceEvent?: string
  status: 'request_started' | 'task_accepted' | 'direct_output' | 'missing_task' | 'request_failed'
  error?: string
  createdAt: number
}

export type CloneFinalComposeStatus = {
  status: 'idle' | 'ready' | 'composing' | 'done' | 'failed'
  outputPath?: string
  coverImagePath?: string
  nextRoundPlanPath?: string
  composeHealth?: {
    verdict?: 'balanced' | 'needs_tuning'
    flags?: string[]
    recommendations?: string[]
  }
  composeSummary?: {
    totalShots?: number
    stageCounts?: Partial<Record<'hook' | 'body' | 'close', number>>
    aggressiveShotCount?: number
    readabilityProtectedCount?: number
    productPriorityCount?: number
    averageClipDurationSec?: number
    strongHookCount?: number
    payoffHandoffCount?: number
    closeConfirmationCount?: number
    strongCtaCount?: number
    snapCloseCount?: number
    rhythmScore?: number
    optimizationLanes?: Array<'hook' | 'payoff' | 'body' | 'close'>
    nextActions?: string[]
    optimizationBrief?: {
      focusArea?: 'hook' | 'payoff' | 'body' | 'close' | 'maintain'
      urgency?: 'low' | 'medium' | 'high'
      primaryGoal?: string
      actionItems?: string[]
      upstreamPromptHints?: string[]
    }
    bodyUpgradePlan?: {
      proofUpgrade?: boolean
      showUpgrade?: boolean
      preferredMoves?: string[]
    }
    upstreamOptimizationPatch?: {
      tightenOpening?: boolean
      addImmediatePayoff?: boolean
      increaseMidVariation?: boolean
      strengthenCtaUrgency?: boolean
      preferSnapClose?: boolean
    }
  }
  subtitleOverlay?: {
    active: boolean
    originalOutputPath: string
    originalCoverImagePath?: string
    subtitleOutputPath: string
    subtitleCoverImagePath?: string
    appliedAt: number
  }
  error?: string
  updatedAt: number
}

export type CloneConsistencyAssetsSnapshot = {
  boundProductSnapshot?: {
    id: string
    name: string
    type: string
    storyboardTemplateType?: StoryboardImageTemplateType
    remark?: string
    coverImagePath?: string
    analysisBoardPath?: string
    analysisBoardStatus?: 'idle' | 'processing' | 'done' | 'failed'
    canonicalSourcePath?: string
    canonicalSourceStatus?: 'idle' | 'processing' | 'done' | 'failed'
    productAnalysis?: {
      category: string
      summary: string
      coreSubject: string
      connectionStructure: string
      materialDetails: string
      wearingPosition: string
      surfaceDetails: string
      colorDetails: string
      geometryDetails: string
      sizeScale: string
      matchingRules: string[]
      rawDescription: string
      updatedAt: number
    }
    originalImagePaths: string[]
    frozenReferenceImagePaths: string[]
    boundAt: number
    updatedAt: number
  }
  modelPackId?: string
  productImageSetIds?: string[]
  originalProductReferenceImages?: string[]
  sanitizedProductReferenceImages?: string[]
  referenceImages?: string[]
  modelReferenceImages?: string[]
  productReferenceImages?: string[]
  productImageSanitization?: {
    status: 'idle' | 'processing' | 'done' | 'failed'
    originalPaths: string[]
    sanitizedPaths: string[]
    failedPaths: string[]
    diagnostics: Array<{
      originalPath: string
      sanitizedPath?: string
      status: 'kept' | 'sanitized' | 'failed'
      note?: string
      prompt?: string
      fallbackToOriginal?: boolean
    }>
    error?: string
    updatedAt: number
  }
  productAnalysis?: {
    category: string
    summary: string
    coreSubject: string
    connectionStructure: string
    materialDetails: string
    wearingPosition: string
    surfaceDetails: string
    colorDetails: string
    geometryDetails: string
    sizeScale: string
    matchingRules: string[]
    rawDescription: string
    updatedAt: number
  }
  status?: 'saved' | 'generated'
  provider?: string
  updatedAt: number
}

export type CloneWorkflowV2Step =
  | 'reference_analysis'
  | 'script_generation'
  | 'identity_grid'
  | 'storyboard_design'
  | 'storyboard_videos'
  | 'final_compose'

export type CloneWorkflowV2Status = {
  status: 'idle' | 'running' | 'done' | 'failed'
  error?: string
  updatedAt: number
}

export type CloneBlueprintMarket = 'VN' | 'TH' | 'US' | 'GLOBAL'

export type CloneBlueprintHook = {
  start: number
  end: number
  type: string
  visualPattern: string
  textPattern: string
  emotion: string
}

export type CloneBlueprintStoryBeat = {
  id: string
  start: number
  end: number
  purpose: 'hook' | 'problem' | 'demo' | 'benefit' | 'proof' | 'offer' | 'cta'
  shotType: string
  productRole: string
  riskLevel: 'low' | 'medium' | 'high'
  recommendedMaterialType: 'real' | 'ai' | 'mixed' | 'empty-scene'
}

export type CloneBlueprintLocalization = {
  language: string
  currencyStyle: string
  subtitleStyle: string
  culturalNotes: string[]
}

export type CloneBlueprintRenderHints = {
  aspectRatio: '9:16' | '16:9'
  resolution: '720x1280' | '1280x720' | '1080x1920' | '1920x1080'
  pacing: 'fast' | 'medium' | 'slow'
  bgmMood: string
  ttsStyle: string
}

export type CloneBlueprint = {
  id?: string
  sourceVideoId?: string
  title?: string
  duration?: number
  market?: CloneBlueprintMarket
  category?: string
  hook?: CloneBlueprintHook
  storyBeats?: CloneBlueprintStoryBeat[]
  localization?: CloneBlueprintLocalization
  renderHints?: CloneBlueprintRenderHints
  createdAt?: string
  updatedAt?: string
  videoSummary?: string
  productCategory?: CloneProductType
  totalDurationSec: number
  referenceAspectRatio: '9:16' | '16:9'
  referenceWidth?: number
  referenceHeight?: number
  hookType?: CloneHookType
  scriptFramework?: CloneScriptFramework
  rhythm?: CloneRhythmProfile
  visualStyle?: CloneVisualStyleProfile
  globalScript?: CloneGlobalScript
  scriptAnalysisError?: string
  scriptFrame: ScriptFrame
  shots: ShotSpec[]
  variants?: Record<string, ShotVariant[]>
  variantScores?: Record<string, ShotVariantScore[]>
  videoPlans?: VideoPlan[]
  scriptCandidates?: CloneScriptCandidate[]
  consistencyAssets?: CloneConsistencyAssetsSnapshot
  strategyNotes?: string[]
  analysisNotes: string[]
  transcript: string
}

export type CloneExecutionBlueprint = {
  shots: ShotSpec[]
  variants?: Record<string, ShotVariant[]>
  variantScores?: Record<string, ShotVariantScore[]>
  videoPlans?: VideoPlan[]
  scriptCandidates?: CloneScriptCandidate[]
  consistencyAssets?: CloneConsistencyAssetsSnapshot
  strategyNotes?: string[]
}

export type ClonePipelineModelSummary = {
  provider: string
  model: string
}

export type ClonePipelineErrorContext = {
  provider?: string
  model?: string
  endpointStyle?: string
  baseUrl?: string
  requestCapability?: string
  taskId?: string
  responseSnippet?: string
  action?: string
  message?: string
}

export type ClonePipelineStatus = {
  workflowStep: CloneWorkflowV2Step
  previewPipeline?: ClonePreviewPipelineStatus
  activeProviderSummary: {
    video: ClonePipelineModelSummary
    image: ClonePipelineModelSummary
    script: ClonePipelineModelSummary
  }
  activeModelSummary: {
    video: string
    image: string
    script: string
  }
  configuredProviderSummary?: {
    video: ClonePipelineModelSummary
    image: ClonePipelineModelSummary
    script: ClonePipelineModelSummary
  }
  errorContext?: ClonePipelineErrorContext
}

export type AiProviderTask = {
  id: string
  projectId: string
  shotId: string
  taskType?: 'keyframe_start' | 'keyframe_end' | 'shot_video'
  provider: AiProviderName
  status: AiTaskStatus
  createdAt: number
  updatedAt: number
  remoteTaskId?: string
  outputFilePath?: string
  error?: string
}

export type ShotVideoGenTask = {
  id: string
  shotId: string
  provider: AiProviderName
  status: AiTaskStatus
  outputFilePath?: string
  error?: string
}

export type CloneGenerationPolicy = {
  qualityPriority: 'high'
  fallbackChain: AiProviderName[]
  concurrency: number
  retries: number
  qualityGate: {
    enabled: boolean
    minDurationRatio: number
    maxDurationRatio: number
    maxBlackFrameRatio: number
    minShortSide: number
    requireAudio: boolean
  }
}

export type CloneProjectStatus =
  | 'draft'
  | 'analyzed'
  | 'materials_ready'
  | 'generating'
  | 'ready_for_review'
  | 'completed'

export type CloneRunMode = 'auto' | 'manual'

export type SessionResultStatus = 'pending' | 'passed' | 'rejected' | 'failed'

export type SessionResult = {
  taskId: string
  status: SessionResultStatus
  qualityScore: number
  reasons: string[]
  shotSourceSummary: string
  providerSummary: string
  checkedAt: number
}

export type ReplicaSession = {
  sessionId: string
  cloneProjectId: string
  targetProductId: string
  outputDir: string
  qualityProfile: 'high'
  derivedTemplateId: string
  taskIds: string[]
  qualityStats: {
    total: number
    passed: number
    rejected: number
    failed: number
    avgScore: number
  }
  reviewStats: {
    pending: number
    keep: number
    reject: number
  }
  pipelineStats?: {
    keyframePassRate: number
    shotPassRate: number
    regenCount: number
  }
  results: Record<string, SessionResult>
  createdAt: number
  updatedAt: number
}

export type CloneProject = {
  id: string
  createdAt: number
  updatedAt: number
  userId?: string
  subscriptionPlanId?: string
  billingStatus?: 'not_required' | 'pending' | 'paid' | 'failed'
  estimatedCost?: number
  actualCost?: number
  deductionStatus?: 'none' | 'reserved' | 'charged' | 'refunded'
  assetStorageProvider?: 'local_fs' | 'qiniu' | 'web_object_storage'
  title?: string
  description?: string
  groupId?: string
  groupName?: string
  archived?: boolean
  hiddenFromCloneTaskList?: boolean
  status: CloneProjectStatus
  runMode: CloneRunMode
  locale: CloneLocale
  strength: CloneStrength
  referenceVideoPath: string
  referenceVideoName: string
  originalProductReferenceImagePaths?: string[]
  sanitizedProductReferenceImagePaths?: string[]
  productImageSanitizationStatus?: 'idle' | 'processing' | 'done' | 'failed'
  productImageSanitizationError?: string
  productReferenceImagePaths?: string[]
  coverAssetPath?: string
  boundProductSnapshot?: CloneConsistencyAssetsSnapshot['boundProductSnapshot']
  baseBlueprint: CloneBlueprint | null
  executionBlueprint?: CloneExecutionBlueprint | null
  productId?: string
  templateId?: string
  outputDir?: string
  blueprint: CloneBlueprint | null
  aiTasks: AiProviderTask[]
  reviewDecisions?: Record<string, CloneReviewStatus>
  sessions: ReplicaSession[]
  modelIdentityPacks?: ModelIdentityPack[]
  selectedModelIdentityPackId?: string
  selectedModelIdentityId?: string
  selectedModelIdentitySnapshot?: ModelIdentityLibraryItem
  promptCache?: Record<string, ClonePromptCacheEntry>
  frameCache?: Record<string, CloneFrameCacheEntry>
  cloudClipCache?: Record<string, CloneCloudClipCacheEntry>
  generationQueue?: {
    options: CloneGenerationQueueOptions
    jobs: CloneGenerationQueueJob[]
    runtime?: CloneGenerationQueueRuntime
    submissionAuditLogs?: CloneShotVideoSubmissionAuditLog[]
    lastShotVideoSummary?: {
      total?: number
      done?: number
      failed?: number
      skipped?: number
      pending?: number
      timeout?: number
      creating?: number
      remoteRunning?: number
      downloading?: number
      retryableFailed?: number
    }
    lastShotVideoFailureBreakdown?: CloneShotVideoFailureBreakdown
    paused?: boolean
  }
  scriptVariantCandidates?: CloneScriptVariantCandidate[]
  selectedScriptVariantId?: string
  storyboardGridBatches?: CloneStoryboardGridBatch[]
  storyboardFrames?: CloneStoryboardFrame[]
  projectIdentityGridPath?: string
  projectIdentityGridStatus?: 'idle' | 'generating' | 'done' | 'failed'
  projectIdentityGridUpdatedAt?: number
  projectIdentityGridPromptPreview?: {
    profile?: Record<string, unknown>
    description?: string
    prompt?: string
    productType?: CloneProductType
    productPoints?: string
    productReferenceImageCount?: number
    productReferenceImagePaths?: string[]
    modelReferenceImageCount?: number
    modelReferenceImagePaths?: string[]
    gridUsagePlan?: string[]
    requestProvider?: string
    requestModel?: string
    requestJson?: string
  }
  shotVideoOutputs?: CloneShotVideoOutput[]
  finalCompose?: CloneFinalComposeStatus
  previewPipeline?: ClonePreviewPipelineStatus
  defaultGenerationPolicy?: {
    qualityProfile: 'high'
    variantStrength: 'low' | 'medium' | 'high'
  }
  workflowV2?: {
    currentStep: CloneWorkflowV2Step
    stepStatus: Record<CloneWorkflowV2Step, CloneWorkflowV2Status>
    updatedAt: number
  }
  policy: CloneGenerationPolicy
  lastError?: string
  lastErrorContext?: ClonePipelineErrorContext
  autoFlowStatus?: {
    enabled: boolean
    targetStage: 'storyboard_videos' | 'final_compose'
    status: 'idle' | 'running' | 'done' | 'partial_failed' | 'failed'
    currentStage?:
      | 'reference_analysis'
      | 'script_generation'
      | 'identity_grid'
      | 'storyboard_design'
      | 'storyboard_videos'
      | 'final_compose'
    imageRetryLimit: number
    videoRetryLimit: number
    lastStartedAt?: number
    lastCompletedAt?: number
    lastSummary?: string
    lastHeartbeatAt?: number
    lastProgressAt?: number
    lastProgressSignature?: string
    idleHeartbeatCount?: number
  }
}

export type CloneProjectGroup = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sortOrder: number
}

export type CloneProjectSummary = {
  id: string
  ownership?: 'local' | 'web'
  sourceType?: string
  ownerUserId?: string
  title: string
  description?: string
  groupId?: string
  groupName?: string
  archived?: boolean
  hiddenFromCloneTaskList?: boolean
  status: CloneProjectStatus | ClonePreviewPipelineStatus['status'] | string
  runMode: CloneRunMode
  createdAt: number
  updatedAt: number
  currentStep: CloneWorkflowV2Step
  progressPercent: number
  referenceVideoName: string
  referenceVideoPath: string
  coverAssetPath: string
  previewOutputPath: string
  previewReportPath: string
  outputDir: string
  finalOutputPath: string
  subtitleOverlayActive?: boolean
  subtitleOriginalOutputPath?: string
  subtitleOutputPath?: string
  selectedModelIdentityName: string
  productReferenceImageCount: number
  productReferenceImagePaths?: string[]
  shotCount: number
  generatedImageCount: number
  generatedVideoCount: number
  lastError: string
}

export type ModelTaskStatus = 'draft' | 'generating' | 'done' | 'failed'

export type ModelTask = {
  id: string
  createdAt: number
  updatedAt: number
  title: string
  description?: string
  status: ModelTaskStatus
  sourceProjectId?: string
  sourceProjectTitle?: string
  sourceProjectReferenceVideoName?: string
  sourceProjectReferenceVideoPath?: string
  productType?: CloneProductType
  productPoints?: string
  modelProfileOptions?: ModelProfileOptions
  productReferenceImagePaths?: string[]
  modelReferenceImagePaths?: string[]
  projectIdentityGridPath?: string
  projectIdentityGridStatus?: 'idle' | 'generating' | 'done' | 'failed'
  projectIdentityGridUpdatedAt?: number
  projectIdentityGridPromptPreview?: {
    profile?: Record<string, unknown>
    description?: string
    prompt?: string
    productType?: CloneProductType
    productPoints?: string
    productReferenceImageCount?: number
    productReferenceImagePaths?: string[]
    modelReferenceImageCount?: number
    modelReferenceImagePaths?: string[]
    gridUsagePlan?: string[]
    requestProvider?: string
    requestModel?: string
    requestJson?: string
  }
  selectedModelIdentityId?: string
  selectedModelIdentitySnapshot?: ModelIdentityLibraryItem
  modelIdentityPackId?: string
  error?: string
}

export type ModelCredentials = {
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
  allowMockWhenNoKey: boolean
  keyframeModel?: string
  videoModelPrimary?: string
  videoModelFallback?: string
  grsaiVideoModel?: string
  grsaiAnalysisModel?: string
  chatProviderPrimary?: 'apifox_hub' | 'grsai'
  videoProviderPrimary?: AiProviderName
  videoProviderFallback?: AiProviderName
  openaiApiKey?: string
  openaiImageModel?: string
  openaiImageQuality?: 'low' | 'medium' | 'high'
  replicateApiToken?: string
  imageProviderPrimary?: ImageProviderName
  klingImageModel?: string
  grsaiImageModel?: string
  apifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi'
  videoApifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi'
  imageApifoxHubProfile?: 'ai666' | 'vectorengine'
  chatApifoxHubProfile?: 'ai666' | 'vectorengine'
  ai666Hub?: ApifoxHubCredentials
  vectorEngineHub?: ApifoxHubCredentials
  xibapiHub?: ApifoxHubCredentials
  apifoxHub?: ApifoxHubCredentials
}

export type ApifoxChatProvider = 'openai' | 'anthropic' | 'gemini'
export type ApifoxImageProvider = 'openai' | 'gemini' | 'jimeng' | 'midjourney'
export type ApifoxVideoProvider =
  | 'openai_video'
  | 'sora'
  | 'veo'
  | 'grok'
  | 'jimeng'
  | 'vidu'
  | 'kling'
  | 'seedance2'
  | 'xibapi'
export type ApifoxEndpointStyle = 'openai_chat' | 'openai_images' | 'openai_video' | 'official_rest' | 'gemini_native' | 'anthropic_native' | 'midjourney_task'
export type UnifiedCapability =
  | 'chat_completion'
  | 'image_generate'
  | 'image_edit'
  | 'video_text_to_video'
  | 'video_image_to_video'
  | 'video_start_end_to_video'
  | 'video_reference_to_video'
  | 'async_task_query'

export type ApifoxHubCredentials = {
  enabled: boolean
  baseUrl: string
  apiKey?: string
  chatProvider: ApifoxChatProvider
  chatModel: string
  chatEndpointStyle: 'openai_chat' | 'anthropic_native' | 'gemini_native'
  imageProvider: ApifoxImageProvider
  imageModel: string
  imageEditModel?: string
  imageEndpointStyle: 'openai_images' | 'official_rest' | 'midjourney_task'
  videoProvider: ApifoxVideoProvider
  textToVideoModel?: string
  imageToVideoModel?: string
  startEndVideoModel?: string
  referenceVideoModel?: string
  videoEndpointStyle: 'openai_video' | 'official_rest'
  defaultPollIntervalMs: number
  defaultTimeoutMs: number
}
