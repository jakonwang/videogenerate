import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CapabilityStoredProviderKey, ChatPlatformProfile, ImagePlatformProfile, PlatformProfile } from '../shared/platformSettings'
import type { HermesWorkspaceAction } from '../shared/hermesWorkspace'
import { storageCleanupConfirmation, type StorageCategoryId } from '../shared/storageManagement'
import type {
  InventoryDashboard,
  InventoryDetail,
  InventorySyncResult,
  SaveInventorySkuInput,
} from '../main/modules/dianxiaomi-inventory/types'

function normalizeFilePickerOptions(opts?: { title?: string; filters?: Electron.FileFilter[]; multiple?: boolean }) {
  return {
    ...(typeof opts?.title === 'string' ? { title: opts.title } : {}),
    ...(typeof opts?.multiple === 'boolean' ? { multiple: opts.multiple } : {}),
    ...(Array.isArray(opts?.filters) ? {
      filters: opts.filters.map((filter) => ({
        name: String(filter?.name || ''),
        extensions: Array.isArray(filter?.extensions) ? filter.extensions.map((extension) => String(extension)) : [],
      })),
    } : {}),
  }
}

function normalizeHermesPromptPayload(payload: any) {
  const attachments = Array.isArray(payload?.attachments)
    ? payload.attachments.map((attachment: any) => ({
      path: String(attachment?.path || ''),
      ...(attachment?.name ? { name: String(attachment.name) } : {}),
      ...(attachment?.mediaType === 'image' || attachment?.mediaType === 'video' || attachment?.mediaType === 'file'
        ? { mediaType: attachment.mediaType }
        : {}),
    })).filter((attachment: { path: string }) => attachment.path)
    : []
  return {
    sessionId: String(payload?.sessionId || ''),
    text: String(payload?.text || ''),
    ...(attachments.length ? { attachments } : {}),
    ...(Number.isInteger(payload?.regenerateUserOrdinal)
      ? { regenerateUserOrdinal: Number(payload.regenerateUserOrdinal) }
      : {}),
  }
}

const api = {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getWebApiInfo: () => ipcRenderer.invoke('app:getWebApiInfo'),
  setUiLocale: (locale: string) => ipcRenderer.invoke('app:setUiLocale', locale),
  getUiLocale: () => ipcRenderer.invoke('app:getUiLocale'),
  storage: {
    getOverview: () => ipcRenderer.invoke('storage:getOverview'),
    getCategory: (categoryId: StorageCategoryId, force = false) => ipcRenderer.invoke('storage:getCategory', {
      categoryId,
      force: Boolean(force),
    }),
    cleanup: (categoryId: StorageCategoryId, challenge = '') => ipcRenderer.invoke('storage:cleanup', {
      categoryId,
      confirmation: storageCleanupConfirmation(categoryId),
      challenge: String(challenge || ''),
    }),
  },

  pickFiles: (opts?: { title?: string; filters?: Electron.FileFilter[]; multiple?: boolean }) =>
    ipcRenderer.invoke('fs:pickFiles', normalizeFilePickerOptions(opts)),
  pickDir: (opts: { title?: string }) => ipcRenderer.invoke('fs:pickDir', opts),
  pathExists: (input: { path: string }) => ipcRenderer.invoke('fs:pathExists', input) as Promise<boolean>,
  describeFiles: (paths: string[]) => ipcRenderer.invoke(
    'fs:describeFiles',
    Array.isArray(paths) ? paths.map((path) => String(path)) : [],
  ) as Promise<Array<{
    path: string
    exists: boolean
    isFile: boolean
    size: number
    modifiedAt: number
  }>>,
  stageAttachment: (input: { name: string; base64: string }) => ipcRenderer.invoke('fs:stageAttachment', {
    name: String(input?.name || 'attachment.bin'),
    base64: String(input?.base64 || ''),
  }) as Promise<{ path: string; name: string; size: number }>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  saveFileAs: (input: { sourcePath: string; defaultFileName?: string; title?: string }) =>
    ipcRenderer.invoke('fs:saveFileAs', input) as Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>,
  readFileAsBase64: (input: { path: string }) => ipcRenderer.invoke('fs:readFileAsBase64', input),
  collectVideoFilesFromDrop: (roots: string[]) =>
    ipcRenderer.invoke('fs:collectVideoFilesFromDrop', roots) as Promise<string[]>,

  luts: {
    list: () =>
      ipcRenderer.invoke('luts:list') as Promise<Array<{ fileName: string; displayName: string }>>,
  },

  style: {
    analyzeVideos: (payload: { dir?: string }) =>
      ipcRenderer.invoke('style:analyzeVideos', payload) as Promise<{
        summary: {
          sourceDir: string
          fileCount: number
          sampledForCut: number
          durationAvgSec: number
          durationMedianSec: number
          durationMinSec: number
          durationMaxSec: number
          fpsAvg: number
          mainResolution: string
          vBitrateAvgKbps: number
          audioPresentRate: number
          cutsPer10sAvg: number
          cutTendency: 'steady_single_shot' | 'mixed' | 'fast_cut'
        }
        suggestedTemplatePayload: any
      }>,
  },

  clone: {
    debugLog: (payload: { message: string; level?: 'info' | 'error' }) =>
      ipcRenderer.invoke('clone:debugLog', payload),
    createDraftProject: (payload?: {
      locale?: 'vi-VN' | 'zh-CN'
      strength?: 'structure'
      title?: string
      description?: string
      runMode?: 'auto' | 'manual'
    }) =>
      ipcRenderer.invoke('clone:createDraftProject', payload ?? {}),
    updateProjectMeta: (payload: { cloneProjectId: string; title?: string; description?: string }) =>
      ipcRenderer.invoke('clone:updateProjectMeta', payload),
    applySubtitleVideoToProject: (payload: {
      cloneProjectId: string
      subtitleVideoPath: string
      subtitleCoverImagePath?: string
    }) => ipcRenderer.invoke('clone:applySubtitleVideoToProject', payload),
    generateSubtitleVideosForProjects: (payload: {
      name: string
      sourceItems: Array<{
        id: string
        sourceType: 'upload' | 'clone_final'
        sourceVideoPath: string
        sourceProjectId?: string
        sourceProjectTitle?: string
        fileName: string
        coverImagePath?: string
      }>
      subtitleMode?: 'static_title' | 'timed_caption' | 'hybrid'
      subtitleSource?: 'whisper_compatible' | 'manual'
      exportEngine?: 'capcut_mate' | 'ass_fallback'
      titleRenderMode?: 'overlay_image' | 'ass_text'
      titleConfig?: {
        strategy?: 'single_for_all' | 'random_pool'
        singleText?: string
        titlePool?: string[]
      }
      titleItems?: Array<{ sourceItemId: string; text: string; updatedAt: number }>
      overlayImageConfig?: {
        canvasWidth?: number
        canvasHeight?: number
        fontName?: string
        fontSize?: number
        fontColor?: string
        strokeColor?: string
        strokeWidth?: number
        shadowColor?: string
        shadowBlur?: number
        position?: 'top' | 'center' | 'bottom'
        safeMargin?: number
        textAlign?: 'left' | 'center' | 'right'
        maxLines?: number
        maxWidthRatio?: number
        lineGap?: number
        bottomMargin?: number
      }
      captionStyle?: {
        fontName?: string
        fontSize?: number
        fontColor?: string
        strokeColor?: string
        strokeWidth?: number
        shadowColor?: string
        shadowBlur?: number
        position?: 'top' | 'center' | 'bottom'
        safeMargin?: number
        textAlign?: 'left' | 'center' | 'right'
        maxLines?: number
        maxWidthRatio?: number
        lineGap?: number
        bottomMargin?: number
      }
      layoutPolicy?: {
        maxLines?: number
        maxWidthRatio?: number
        reflowStrategy?: 'balanced' | 'punctuation'
        avoidPosition?: 'auto' | 'top' | 'bottom'
      }
    }) => ipcRenderer.invoke('clone:generateSubtitleVideosForProjects', payload),
    revertSubtitleVideoFromProject: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:revertSubtitleVideoFromProject', payload),
    updateProjectRenderHints: (payload: {
      cloneProjectId: string
      aspectRatio?: '9:16' | '16:9'
      resolution?: '720x1280' | '1280x720' | '1080x1920' | '1920x1080'
    }) => ipcRenderer.invoke('clone:updateProjectRenderHints', payload),
    listCloneGroups: () =>
      ipcRenderer.invoke('clone:listCloneGroups'),
    createCloneGroup: (payload: { name: string }) =>
      ipcRenderer.invoke('clone:createCloneGroup', payload),
    renameCloneGroup: (payload: { groupId: string; name: string }) =>
      ipcRenderer.invoke('clone:renameCloneGroup', payload),
    removeCloneGroup: (payload: { groupId: string }) =>
      ipcRenderer.invoke('clone:removeCloneGroup', payload),
    assignCloneProjectsToGroup: (payload: { cloneProjectIds: string[]; groupId?: string }) =>
      ipcRenderer.invoke('clone:assignCloneProjectsToGroup', payload),
    bindProjectReferenceVideo: (payload: { cloneProjectId: string; videoPath: string }) =>
      ipcRenderer.invoke('clone:bindProjectReferenceVideo', payload),
    listProjectSummaries: (payload?: { query?: string; status?: string; archived?: boolean }) =>
      ipcRenderer.invoke('clone:listProjectSummaries', payload ?? {}),
    getProjectSummary: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:getProjectSummary', payload),
    createBlueprint: (payload: { videoPath: string; locale?: 'vi-VN' | 'zh-CN'; strength?: 'structure'; cloneProjectId?: string }) =>
      ipcRenderer.invoke('clone:createBlueprint', payload),
    analyzeReference: (payload: { videoPath: string; locale?: 'vi-VN' | 'zh-CN'; strength?: 'structure' }) =>
      ipcRenderer.invoke('clone:analyzeReference', payload),
    expandCommercialPrompt: (payload: { cloneProjectId: string; prompt?: string; sceneHint?: string; styleHint?: string }) =>
      ipcRenderer.invoke('clone:expandCommercialPrompt', payload),
    prepareMaterials: (payload: {
      cloneProjectId: string
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      productPoints?: string
      productReferenceImagePaths?: string[]
      generateModelPack?: boolean
      forceRegenerateModelPack?: boolean
    }) => ipcRenderer.invoke('clone:prepareMaterials', payload),
    saveProjectProductImages: (payload: {
      cloneProjectId: string
      productReferenceImagePaths?: string[]
    }) => ipcRenderer.invoke('clone:saveProjectProductImages', payload),
    bindProjectProduct: (payload: {
      cloneProjectId: string
      productId: string
    }) => ipcRenderer.invoke('clone:bindProjectProduct', payload),
    generateVariants: (payload: {
      cloneProjectId: string
      targetProductId?: string
      variantsPerShot?: number
    }) => ipcRenderer.invoke('clone:generateVariants', payload),
    generateScriptVariants: (payload: {
      cloneProjectId: string
      variantCount: number
    }) => ipcRenderer.invoke('clone:generateScriptVariants', payload),
    selectScriptVariant: (payload: {
      cloneProjectId: string
      variantId: string
    }) => ipcRenderer.invoke('clone:selectScriptVariant', payload),
    generateStoryboardGrids: (payload: {
      cloneProjectId: string
      productReferenceImagePaths?: string[]
      selectedModelIdentityId?: string
    }) => ipcRenderer.invoke('clone:generateStoryboardGrids', payload),
    generateShotVideosFromStoryboard: (payload: {
      cloneProjectId: string
      maxAutoRetryPerShot?: number
    }) => ipcRenderer.invoke('clone:generateShotVideosFromStoryboard', payload),
    autoRunToStoryboardVideos: (payload: {
      cloneProjectId: string
      variantCount?: number
      selectedModelIdentityId?: string
      productReferenceImagePaths?: string[]
      autoBindModelPack?: boolean
    }) => ipcRenderer.invoke('clone:autoRunToStoryboardVideos', payload),
    replaceShotVideo: (payload: {
      cloneProjectId: string
      shotId: string
      videoPath: string
    }) => ipcRenderer.invoke('clone:replaceShotVideo', payload),
    composeCloneVideo: (payload: {
      cloneProjectId: string
      outputDir?: string
    }) => ipcRenderer.invoke('clone:composeCloneVideo', payload),
    generatePreviewBatch: (payload: {
      cloneProjectId: string
      topN?: number
      onlyMissing?: boolean
      variantsPerShot?: number
      productReferenceImagePaths?: string[]
      targetProductId?: string
      previewFirst?: boolean
    }) => ipcRenderer.invoke('clone:generatePreviewBatch', payload),
    getClonePipelineStatus: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:getClonePipelineStatus', payload),
    getProject: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:getProject', payload),
    listModelIdentityLibrary: () => ipcRenderer.invoke('clone:listModelIdentityLibrary'),
    listModelTasks: () => ipcRenderer.invoke('clone:listModelTasks'),
    createModelTask: (payload?: {
      title?: string
      description?: string
      sourceProjectId?: string
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
    }) => ipcRenderer.invoke('clone:createModelTask', payload ?? {}),
    reanalyzeShotScript: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:reanalyzeShotScript', payload),
    generateShotVariants: (payload: {
      cloneProjectId: string
      shotIds?: string[]
      targetProductId?: string
      variantsPerShot?: number
      strategy?: 'balanced' | 'low_cost' | 'high_conversion' | 'anti_duplicate'
    }) => ipcRenderer.invoke('clone:generateShotVariants', payload),
    scoreShotVariants: (payload: { cloneProjectId: string; shotIds?: string[]; targetProductId?: string }) =>
      ipcRenderer.invoke('clone:scoreShotVariants', payload),
    buildVideoPlans: (payload: {
      cloneProjectId: string
      targetProductId?: string
      planCount?: number
      maxVideosToGenerate?: number
      strategy?: 'balanced' | 'hook_first' | 'conversion_first' | 'anti_duplicate'
    }) => ipcRenderer.invoke('clone:buildVideoPlans', payload),
    buildScriptCandidates: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:buildScriptCandidates', payload),
    generateConsistencyAssets: (payload: {
      cloneProjectId: string
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      productPoints?: string
      productReferenceImagePaths?: string[]
      generateModelPack?: boolean
      forceRegenerateModelPack?: boolean
    }) => ipcRenderer.invoke('clone:generateConsistencyAssets', payload),
    runStoryboardAndVideoBatch: (payload: {
      cloneProjectId: string
      topN?: number
      onlyMissing?: boolean
      variantsPerShot?: number
      productReferenceImagePaths?: string[]
      targetProductId?: string
      previewFirst?: boolean
    }) => ipcRenderer.invoke('clone:runStoryboardAndVideoBatch', payload),
    updateVariantReview: (payload: {
      cloneProjectId: string
      shotId: string
      variantId: string
      reviewStatus: 'pending' | 'keep' | 'reject'
    }) => ipcRenderer.invoke('clone:updateVariantReview', payload),
    updateVideoPlanStatus: (payload: {
      cloneProjectId: string
      videoPlanId: string
      status: 'draft' | 'selected' | 'generating' | 'done' | 'failed' | 'rejected'
    }) => ipcRenderer.invoke('clone:updateVideoPlanStatus', payload),
    listProjects: () => ipcRenderer.invoke('clone:listProjects'),
    removeProject: (payload: { cloneProjectId: string; force?: boolean }) =>
      ipcRenderer.invoke('clone:removeProject', payload),
    updateShot: (payload: {
      cloneProjectId: string
      shotId: string
      sourceMode?: 'uploaded' | 'pending' | 'ai'
      uploadedAssetIds?: string[]
      aiEnabled?: boolean
      promptOverrides?: Partial<{ positive: string; negative: string; cameraMotion: string }>
      reviewStatus?: 'pending' | 'keep' | 'reject'
    }) => ipcRenderer.invoke('clone:updateShot', payload),
    updateShotEnhanced: (payload: {
      cloneProjectId: string
      shotId: string
      replaceMode?: 'upload_video' | 'upload_image_to_video' | 'ai_generate' | 'locked'
      uploadedAssetPath?: string
      uploadedImagePath?: string
      aiPrompt?: string
      negativePrompt?: string
      locked?: boolean
      qualityMode?: 'fast' | 'standard' | 'high'
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      cloneEligible?: boolean
      filterReason?: string
      cloneClass?: 'real_product' | 'model_demo' | 'screen_recording' | 'tutorial_talking' | 'ui_demo' | 'result_showcase'
      productMainImage?: string
      productDetailImages?: string[]
      productUsageImages?: string[]
      styleReferenceImages?: string[]
      forceAi?: boolean
      scriptText?: string
      scriptRole?: 'hook' | 'pain_point' | 'solution' | 'proof' | 'offer' | 'cta' | 'transition' | 'unknown'
      narrationText?: string
      onScreenText?: string
      visualDescription?: string
      actionDescription?: string
      cameraDescription?: string
      productFocus?: string
      generationPrompt?: string
      scriptConfidence?: number
      analysisNotes?: string[]
    }) => ipcRenderer.invoke('clone:updateShotEnhanced', payload),
    uploadShotAssets: (payload: {
      cloneProjectId: string
      shotId: string
      targetProductId: string
      filePaths: string[]
    }) => ipcRenderer.invoke('clone:uploadShotAssets', payload),
    generateAiShots: (payload: {
      cloneProjectId: string
      shotIds: string[]
      videoPlanId?: string
      providerPolicy?: { chain?: Array<'seedance' | 'grsai'> }
      qualityProfile?: 'high'
    }) => ipcRenderer.invoke('clone:generateAiShots', payload),
    generateShotKeyframes: (payload: {
      cloneProjectId: string
      shotIds: string[]
      targetProductId?: string
      providerPolicy?: { chain?: Array<'seedance'> }
    }) => ipcRenderer.invoke('clone:generateShotKeyframes', payload),
    regenerateShotKeyframe: (payload: {
      cloneProjectId: string
      shotId: string
      which: 'start' | 'end'
      promptOverrides?: Partial<{ positive: string; negative: string; cameraMotion: string }>
    }) => ipcRenderer.invoke('clone:regenerateShotKeyframe', payload),
    generateShotVideos: (payload: {
      cloneProjectId: string
      sessionId?: string
      shotIds: string[]
      consistencyMode?: 'soft' | 'hard'
      providerPolicy?: { chain?: Array<'seedance'> }
    }) => ipcRenderer.invoke('clone:generateShotVideos', payload),
    getShotConsistencyReport: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:getShotConsistencyReport', payload),
    getShotImagePromptPreview: (payload: {
      cloneProjectId: string
      shotId: string
      selectedModelIdentityId?: string
    }) =>
      ipcRenderer.invoke('clone:getShotImagePromptPreview', payload),
    getShotVideoPromptPreview: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:getShotVideoPromptPreview', payload),
    recompileShotConsistency: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:recompileShotConsistency', payload),
    listShotConsistencyAnchors: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:listShotConsistencyAnchors', payload),
    listShotConsistencyPatches: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:listShotConsistencyPatches', payload),
    generateShotFrames: (payload: {
      cloneProjectId: string
      shotId: string
      productReferenceImagePaths?: string[]
    }) => ipcRenderer.invoke('clone:generateShotFrames', payload),
    generateAllShotFrames: (payload: {
      cloneProjectId: string
      onlyMissing?: boolean
      which?: 'start' | 'end' | 'both'
      forceRegenerate?: boolean
      shotIds?: string[]
      productReferenceImagePaths?: string[]
    }) => ipcRenderer.invoke('clone:generateAllShotFrames', payload),
    generateModelIdentityPack: (payload: {
      cloneProjectId?: string
      modelTaskId?: string
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      productPoints?: string
      modelProfileOptions?: import('../shared/modelProfileOptions').ModelProfileOptions
      productReferenceImagePaths?: string[]
      imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
      openaiApiKey?: string
      openaiImageModel?: string
      openaiImageQuality?: 'low' | 'medium' | 'high'
      grsaiApiKey?: string
      grsaiHost?: string
      grsaiImageModel?: string
      imageProviderCredentials?: Record<string, unknown>
    }) => ipcRenderer.invoke('clone:generateModelIdentityPack', payload),
    getModelIdentityPromptPreview: (payload: {
      cloneProjectId?: string
      modelTaskId?: string
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      productPoints?: string
      modelProfileOptions?: import('../shared/modelProfileOptions').ModelProfileOptions
      productReferenceImagePaths?: string[]
    }) => ipcRenderer.invoke('clone:getModelIdentityPromptPreview', payload),
    getProjectIdentityGridPromptPreview: (payload: {
      cloneProjectId: string
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      productPoints?: string
      modelProfileOptions?: import('../shared/modelProfileOptions').ModelProfileOptions
      productReferenceImagePaths?: string[]
    }) => ipcRenderer.invoke('clone:getProjectIdentityGridPromptPreview', payload),
    getGenerationQueue: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:getGenerationQueue', payload),
    pauseGenerationQueue: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:pauseGenerationQueue', payload),
    resumeGenerationQueue: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:resumeGenerationQueue', payload),
    renameModelIdentity: (payload: { id: string; name: string }) =>
      ipcRenderer.invoke('clone:renameModelIdentity', payload),
    deleteModelIdentity: (payload: { id: string }) =>
      ipcRenderer.invoke('clone:deleteModelIdentity', payload),
    selectProjectModelIdentity: (payload: { cloneProjectId: string; identityId: string }) =>
      ipcRenderer.invoke('clone:selectProjectModelIdentity', payload),
    exportFinalVideos: (payload: { cloneProjectIds: string[]; outputDir: string }) =>
      ipcRenderer.invoke('clone:exportFinalVideos', payload) as Promise<{
        outputDir: string
        total: number
        exported: Array<{ cloneProjectId: string; title: string; sourcePath: string; targetPath: string }>
        skipped: Array<{ cloneProjectId: string; title: string; reason: string }>
      }>,
    selectModelIdentityPack: (payload: { cloneProjectId: string; packId: string; confirmed?: boolean }) =>
      ipcRenderer.invoke('clone:selectModelIdentityPack', payload),
    generateGptShotFrames: (payload: {
      cloneProjectId: string
      shotId: string
      which?: 'start' | 'end' | 'both'
      forceRegenerate?: boolean
      selectedModelIdentityId?: string
      productReferenceImagePaths?: string[]
      imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
      openaiApiKey?: string
      openaiImageModel?: string
      openaiImageQuality?: 'low' | 'medium' | 'high'
      grsaiApiKey?: string
      grsaiHost?: string
      grsaiImageModel?: string
      imageProviderCredentials?: Record<string, unknown>
    }) => ipcRenderer.invoke('clone:generateGptShotFrames', payload),
    confirmGptShotFrames: (payload: { cloneProjectId: string; shotId: string; confirmed?: boolean }) =>
      ipcRenderer.invoke('clone:confirmGptShotFrames', payload),
    generateShotClip: (payload: { cloneProjectId: string; shotId: string; forceRegenerate?: boolean }) =>
      ipcRenderer.invoke('clone:generateShotClip', payload),
    regenerateShotVideo: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:regenerateShotVideo', payload),
    refreshProjectStatus: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:refreshProjectStatus', payload),
    reconcileRemoteStoryboardVideos: (payload: { cloneProjectId: string }) =>
      ipcRenderer.invoke('clone:reconcileRemoteStoryboardVideos', payload),
    syncShotVideoTask: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:syncShotVideoTask', payload),
    forceDownloadShotVideoResult: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:forceDownloadShotVideoResult', payload),
    qualityCheckCurrentShot: (payload: { cloneProjectId: string; shotId: string }) =>
      ipcRenderer.invoke('clone:qualityCheckCurrentShot', payload),
    diagnoseProductImages: (payload: { imagePaths: string[] }) =>
      ipcRenderer.invoke('clone:diagnoseProductImages', payload),
    renderPreview: (payload: { cloneProjectId: string; outputDir?: string }) =>
      ipcRenderer.invoke('clone:renderPreview', payload),
    renderBatch: (payload: { cloneProjectId: string; count: number; outputDir?: string; retryFailed?: boolean }) =>
      ipcRenderer.invoke('clone:renderBatch', payload),
    saveCloneTemplate: (payload: { cloneProjectId: string; name?: string }) =>
      ipcRenderer.invoke('clone:saveCloneTemplate', payload),
    convertToNormalTemplate: (payload: { cloneProjectId: string; name?: string }) =>
      ipcRenderer.invoke('clone:convertToNormalTemplate', payload),
    createSession: (payload: {
      cloneProjectId: string
      targetProductId: string
      count: number
      outputDir?: string
      qualityProfile?: 'high'
      variantStrength?: 'low' | 'medium' | 'high'
      pipelineMode?: 'keyframe_then_video'
    }) => ipcRenderer.invoke('clone:createSession', payload),
    listSessionResults: (payload: {
      cloneProjectId: string
      sessionId?: string
      filters?: {
        status?: Array<'pending' | 'passed' | 'rejected' | 'failed'>
        onlyLowScore?: boolean
        targetProductId?: string
      }
    }) => ipcRenderer.invoke('clone:listSessionResults', payload),
    updateSessionReview: (payload: {
      cloneProjectId: string
      taskId: string
      reviewStatus: 'pending' | 'keep' | 'reject'
    }) => ipcRenderer.invoke('clone:updateSessionReview', payload),
    createReplicas: (payload: {
      cloneProjectId: string
      count: number
      outputDir?: string
      reviewMode?: 'manual'
    }) => ipcRenderer.invoke('clone:createReplicas', payload),
    updateReplicaReview: (payload: {
      cloneProjectId: string
      taskId: string
      reviewStatus: 'pending' | 'keep' | 'reject'
    }) => ipcRenderer.invoke('clone:updateReplicaReview', payload),
    getModelCredentials: () =>
      ipcRenderer.invoke('clone:getModelCredentials') as Promise<{
        seedanceApiKey?: string
        seedanceHost?: string
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
        chatProviderPrimary?: CapabilityStoredProviderKey
        videoProviderPrimary?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
        videoProviderFallback?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
        grsaiImageModel?: string
        apifoxHubProfile?: Exclude<PlatformProfile, 'grsai'>
        videoApifoxHubProfile?: Exclude<PlatformProfile, 'grsai'>
        imageApifoxHubProfile?: ImagePlatformProfile
        chatApifoxHubProfile?: ChatPlatformProfile
        ai666Hub?: import('../main/modules/clone/types').ApifoxHubCredentials
        vectorEngineHub?: import('../main/modules/clone/types').ApifoxHubCredentials
        xibapiHub?: import('../main/modules/clone/types').ApifoxHubCredentials
        gaoruiHub?: import('../main/modules/clone/types').ApifoxHubCredentials
        apifoxHub?: import('../main/modules/clone/types').ApifoxHubCredentials
      }>,
    getRuntimeOptions: () =>
      ipcRenderer.invoke('clone:getRuntimeOptions') as Promise<{
        storyboardFrameConcurrency: number
        globalStoryboardFrameConcurrency: number
      }>,
    getHermesIntegrationSettings: () =>
      ipcRenderer.invoke('clone:getHermesIntegrationSettings') as Promise<import('../main/modules/clone/types').HermesIntegrationSettings>,
    setModelCredentials: (payload: {
      seedanceApiKey?: string
      seedanceHost?: string
      grsaiApiKey?: string
      grsaiHost?: string
      tikhubApiKey?: string
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
      chatProviderPrimary?: CapabilityStoredProviderKey
      videoProviderPrimary?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
      videoProviderFallback?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
      openaiApiKey?: string
      openaiImageModel?: string
      openaiImageQuality?: 'low' | 'medium' | 'high'
      imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
      grsaiImageModel?: string
      apifoxHubProfile?: Exclude<PlatformProfile, 'grsai'>
      videoApifoxHubProfile?: Exclude<PlatformProfile, 'grsai'>
      imageApifoxHubProfile?: ImagePlatformProfile
      chatApifoxHubProfile?: ChatPlatformProfile
      ai666Hub?: import('../main/modules/clone/types').ApifoxHubCredentials
      vectorEngineHub?: import('../main/modules/clone/types').ApifoxHubCredentials
      xibapiHub?: import('../main/modules/clone/types').ApifoxHubCredentials
      gaoruiHub?: import('../main/modules/clone/types').ApifoxHubCredentials
      apifoxHub?: import('../main/modules/clone/types').ApifoxHubCredentials
    }) =>
      ipcRenderer.invoke('clone:setModelCredentials', payload),
    setRuntimeOptions: (payload: {
      storyboardFrameConcurrency?: number
      globalStoryboardFrameConcurrency?: number
    }) =>
      ipcRenderer.invoke('clone:setRuntimeOptions', payload),
    setHermesIntegrationSettings: (payload: {
      enabled?: boolean
      callbackBaseUrl?: string
      feishu?: import('../main/modules/clone/types').HermesFeishuIntegrationSettings
      wecom?: import('../main/modules/clone/types').HermesWecomIntegrationSettings
    }) =>
      ipcRenderer.invoke('clone:setHermesIntegrationSettings', payload),
    getGrsAiCredits: () =>
      ipcRenderer.invoke('clone:getGrsAiCredits') as Promise<{ available?: number; raw: unknown }>,
    onRuntimeLog: (cb: (payload: { level?: 'info' | 'success' | 'error'; message?: string; time?: number }) => void) => {
      const handler = (_: unknown, payload: { level?: 'info' | 'success' | 'error'; message?: string; time?: number }) => cb(payload)
      ipcRenderer.on('clone:runtimeLog', handler)
      return () => ipcRenderer.off('clone:runtimeLog', handler)
    },
  },

  stickers: {
    list: () =>
      ipcRenderer.invoke('stickers:list') as Promise<
        Array<{ ref: string; fileName: string; displayName: string; scope?: 'bundled' | 'user' }>
      >,
    listUser: () =>
      ipcRenderer.invoke('stickers:listUser') as Promise<{ dir: string; files: string[] }>,
    import: (paths: string[]) =>
      ipcRenderer.invoke('stickers:import', paths) as Promise<{ imported: string[] }>,
  },

  fonts: {
    list: () =>
      ipcRenderer.invoke('fonts:list') as Promise<{
        bundledDir: string
        bundledFiles: string[]
        userDir: string
        userFiles: string[]
        bundledFonts?: Array<{ fileName: string; sourceFile: string; familyName: string; renderReady: boolean; message: string }>
        userFonts?: Array<{ fileName: string; sourceFile: string; familyName: string; renderReady: boolean; message: string }>
        renderableFamilies?: Array<{ fileName: string; sourceFile: string; familyName: string; renderReady: boolean; message: string }>
      }>,
    listUser: () =>
      ipcRenderer.invoke('fonts:listUser') as Promise<{
        dir: string
        files: string[]
        fonts?: Array<{ fileName: string; sourceFile: string; familyName: string; renderReady: boolean; message: string }>
      }>,
    import: (paths: string[]) =>
      ipcRenderer.invoke('fonts:import', paths) as Promise<{
        imported: string[]
        fonts?: Array<{ fileName: string; sourceFile: string; familyName: string; renderReady: boolean; message: string }>
      }>,
  },

  media: {
    getInfo: (filePath: string) => ipcRenderer.invoke('media:getInfo', filePath),
    segmentSplit: (payload: { inputPath: string; segmentTimeSec: number; outputDir?: string; outputFormat?: 'source' | 'mp4' }) =>
      ipcRenderer.invoke('media:segmentSplit', payload) as Promise<
        { ok: true; outputPaths: string[] } | { ok: false; error: string }
      >,
    onSegmentSplitProgress: (cb: (p: Record<string, unknown>) => void) => {
      const fn = (_: unknown, p: Record<string, unknown>) => cb(p)
      ipcRenderer.on('media:segmentSplitProgress', fn)
      return () => ipcRenderer.removeListener('media:segmentSplitProgress', fn)
    },
  },

  shell: {
    showItemInFolder: (fullPath: string) => ipcRenderer.invoke('shell:showItemInFolder', fullPath),
    openPath: (fullPath: string) => ipcRenderer.invoke('shell:openPath', fullPath),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  preview: {
    getMobilePlayUrl: (taskId: string) =>
      ipcRenderer.invoke('preview:getMobilePlayUrl', taskId) as Promise<
        | { ok: true; url: string; port: number; ip: string }
        | { ok: false; code: 'not_done' | 'no_lan' | 'server'; detail?: string }
      >,
  },

  products: {
    list: () => ipcRenderer.invoke('products:list'),
    upsert: (payload: any) => ipcRenderer.invoke('products:upsert', payload),
    remove: (id: string) => ipcRenderer.invoke('products:remove', id),
    refreshCanonicalSource: (payload: { productId: string; force?: boolean }) => ipcRenderer.invoke('products:refreshCanonicalSource', payload),
    refreshProductAnalysis: (payload: { productId: string }) => ipcRenderer.invoke('products:refreshProductAnalysis', payload),
    ensureSegmentBucketsFromTemplates: () =>
      ipcRenderer.invoke('products:ensureSegmentBucketsFromTemplates') as Promise<{ ok: true; patched: number }>,
  },
  productImageMaterials: {
    listCategories: () => ipcRenderer.invoke('plugin:productImageMaterials:listCategories'),
    createBatch: (payload: {
      userId: string
      category: 'necklace' | 'ring' | 'earring' | 'bracelet'
      sourceVideoPaths: string[]
      parserVideoIds?: string[]
    }) => ipcRenderer.invoke('plugin:productImageMaterials:createBatch', payload),
    listBatches: (payload: { userId: string }) => ipcRenderer.invoke('plugin:productImageMaterials:listBatches', payload),
    retryBatch: (payload: { userId: string; batchId: string }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:retryBatch', payload),
    createBackgroundVariants: (payload: { userId: string; materialIds: string[]; variantCount: number }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:createBackgroundVariants', payload),
    listMaterials: (payload: {
      userId: string
      filters?: {
        category?: 'necklace' | 'ring' | 'earring' | 'bracelet' | 'all'
        usageStatus?: 'unused' | 'used' | 'all'
        boundProductId?: string
      }
    }) => ipcRenderer.invoke('plugin:productImageMaterials:listMaterials', payload),
    updateUsageStatus: (payload: { userId: string; materialId: string; usageStatus: 'unused' | 'used' }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:updateUsageStatus', payload),
    bindProduct: (payload: { userId: string; materialId: string; productId?: string }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:bindProduct', payload),
    deleteMaterial: (payload: { userId: string; materialId: string }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:deleteMaterial', payload),
    deleteMaterials: (payload: { userId: string; materialIds: string[] }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:deleteMaterials', payload),
    exportMaterials: (payload: { userId: string; materialIds: string[]; outputDir: string }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:exportMaterials', payload),
    listProducts: () => ipcRenderer.invoke('plugin:productImageMaterials:listProducts'),
  },
  videoParserDownload: {
    listItems: (payload: { userId: string }) => ipcRenderer.invoke('plugin:videoParserDownload:listItems', payload),
    importShareUrls: (payload: { userId: string; shareUrls: string[] }) => ipcRenderer.invoke('plugin:videoParserDownload:importShareUrls', payload),
    retryItem: (payload: { userId: string; id: string }) => ipcRenderer.invoke('plugin:videoParserDownload:retryItem', payload),
    deleteItem: (payload: { userId: string; id: string }) => ipcRenderer.invoke('plugin:videoParserDownload:deleteItem', payload),
  },
  dianxiaomiInventory: {
    getDashboard: () => ipcRenderer.invoke('plugin:dianxiaomiInventory:getDashboard') as Promise<InventoryDashboard>,
    getDetail: (payload: { skuId: string; startDate?: string; endDate?: string }) =>
      ipcRenderer.invoke('plugin:dianxiaomiInventory:getDetail', payload) as Promise<InventoryDetail>,
    saveSku: (payload: SaveInventorySkuInput) => ipcRenderer.invoke('plugin:dianxiaomiInventory:saveSku', payload),
    removeSku: (id: string) => ipcRenderer.invoke('plugin:dianxiaomiInventory:removeSku', id),
    sync: (payload?: { skuId?: string }) => ipcRenderer.invoke('plugin:dianxiaomiInventory:sync', payload) as Promise<InventorySyncResult>,
    getAuthStatus: () => ipcRenderer.invoke('plugin:dianxiaomiInventory:getAuthStatus'),
    openLogin: () => ipcRenderer.invoke('plugin:dianxiaomiInventory:openLogin'),
    logout: () => ipcRenderer.invoke('plugin:dianxiaomiInventory:logout'),
  },
  tiktokGmvMax: {
    getDashboard: (payload?: { startDate?: string; endDate?: string; includeCreativeMetrics?: boolean }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getDashboard', payload),
    getCampaignWorkspace: (payload: { campaignId: string; startDate?: string; endDate?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getCampaignWorkspace', payload),
    getCampaignPage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignType?: string; status?: string; pacingState?: string; search?: string; minSpend?: number; minOrders?: number; minRoi?: number; minUtilization?: number; sortBy?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getCampaignPage', payload),
    getCreativePage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignId?: string; source?: string; state?: string; search?: string; minSpend?: number; minOrders?: number; minRoi?: number; maxCpa?: number; minCtr?: number; sortBy?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getCreativePage', payload),
    getProductPage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignId?: string; state?: string; allocationState?: string; search?: string; minSpend?: number; minOrders?: number; minRoi?: number; minScore?: number; sortBy?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getProductPage', payload),
    getProductCostPage: (payload?: { page?: number; pageSize?: number; storeId?: string; campaignId?: string; scope?: string; completeness?: string; search?: string; sortBy?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getProductCostPage', payload),
    getProductCost: (payload: { storeId: string; campaignId: string; productId: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getProductCost', payload),
    exportProductCosts: (payload?: { storeId?: string; campaignId?: string; search?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:exportProductCosts', payload),
    importProductCosts: (payload: { csv: string; storeId?: string; campaignId?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:importProductCosts', payload),
    getListEntryPage: (payload?: { page?: number; pageSize?: number; storeId?: string; campaignId?: string; mode?: string; entityType?: string; search?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getListEntryPage', payload),
    getActionPage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignId?: string; status?: string; actionType?: string; risk?: string; search?: string; sortBy?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getActionPage', payload),
    getOutcomePage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignId?: string; successful?: boolean; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getOutcomePage', payload),
    getAuditPage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignId?: string; status?: string; action?: string; search?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getAuditPage', payload),
    connect: (payload?: { name?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:connect', payload),
    disconnect: (payload: { connectionId: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:disconnect', payload),
    reconnect: (payload: { connectionId: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:reconnect', payload),
    sync: () => ipcRenderer.invoke('plugin:tiktokGmvMax:sync'),
    syncAccounts: () => ipcRenderer.invoke('plugin:tiktokGmvMax:syncAccounts'),
    syncCampaigns: () => ipcRenderer.invoke('plugin:tiktokGmvMax:syncCampaigns'),
    syncCatalogs: () => ipcRenderer.invoke('plugin:tiktokGmvMax:syncCatalogs'),
    runSyncJob: (payload: { action: 'data' | 'catalog' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:runSyncJob', payload),
    getSyncJob: (payload: { jobId: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getSyncJob', payload),
    onSyncProgress: (callback: (progress: import('../main/modules/tiktok-gmv-max/types').GmvMaxSyncProgress) => void) => {
      const handler = (_event: unknown, progress: import('../main/modules/tiktok-gmv-max/types').GmvMaxSyncProgress) => callback(progress)
      ipcRenderer.on('plugin:tiktokGmvMax:syncProgress', handler)
      return () => ipcRenderer.off('plugin:tiktokGmvMax:syncProgress', handler)
    },
    getSopWorkspace: () => ipcRenderer.invoke('plugin:tiktokGmvMax:getSopWorkspace'),
    getCoachWorkspace: () => ipcRenderer.invoke('plugin:tiktokGmvMax:getCoachWorkspace'),
    refreshCoachDecision: (payload?: { sopInstanceId?: string; force?: boolean }) => ipcRenderer.invoke('plugin:tiktokGmvMax:refreshCoachDecision', payload),
    getCoachRun: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getCoachRun', payload),
    getCommandCenter: () => ipcRenderer.invoke('plugin:tiktokGmvMax:getCommandCenter'),
    runSopAutomation: (payload?: { sopInstanceId?: string; force?: boolean }) => ipcRenderer.invoke('plugin:tiktokGmvMax:runSopAutomation', payload),
    startSop: (payload: { campaignId: string; productId?: string; productName?: string; startDate?: string; track?: 'new_product' | 'mature_product' | 'live'; trackOverrideReason?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:startSop', payload),
    updateSop: (payload: { id: string; status?: 'active' | 'paused' | 'completed'; productName?: string; track?: 'new_product' | 'mature_product' | 'live'; trackOverrideReason?: string; clearTrackOverride?: boolean; automationEnabled?: boolean; automationMode?: 'diagnostic_only' | 'draft_actions' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:updateSop', payload),
    completeSopTask: (payload: { id: string; evidence?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:completeSopTask', payload),
    saveSupplementalMetrics: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:saveSupplementalMetrics', payload),
    importSupplementalMetrics: (payload: { csv: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:importSupplementalMetrics', payload),
    exportSupplementalMetricsTemplate: () => ipcRenderer.invoke('plugin:tiktokGmvMax:exportSupplementalMetricsTemplate'),
    createSopInterventionDraft: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:createSopInterventionDraft', payload),
    recordExternalSopIntervention: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:recordExternalSopIntervention', payload),
    verifyExternalSopIntervention: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:verifyExternalSopIntervention', payload),
    selectEvidenceAttachment: () => ipcRenderer.invoke('plugin:tiktokGmvMax:selectEvidenceAttachment'),
    retryWinnerDraft: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:retryWinnerDraft', payload),
    getReport: (payload: { campaignId: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getReport', payload),
    evaluate: (payload?: { campaignId?: string; scope?: 'all' | 'creative' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:evaluate', payload),
    analyzeGrowth: () => ipcRenderer.invoke('plugin:tiktokGmvMax:analyzeGrowth'),
    syncRealtime: () => ipcRenderer.invoke('plugin:tiktokGmvMax:syncRealtime'),
    savePolicy: (payload: {
      campaignId: string
      preset?: 'roi_guard' | 'balanced_growth' | 'gmv_growth'
      automationEnabled?: boolean
      minRoi?: string
      promotionAutoExecutionEnabled?: boolean
      targetCpa?: string
      creativeTestBudget?: string
      profitSafetyMarginPercent?: number
      budgetPermission?: boolean
      roiPermission?: boolean
      statusPermission?: boolean
      creativePermission?: boolean
      sessionPermission?: boolean
      shadowMode?: boolean
      pilotEnabled?: boolean
      pauseOnZeroOrders?: boolean
    }) => ipcRenderer.invoke('plugin:tiktokGmvMax:savePolicy', payload),
    approve: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:approve', payload),
    approveBatch: (payload: { ids: string[] }) => ipcRenderer.invoke('plugin:tiktokGmvMax:approveBatch', payload),
    setEmergencyStop: (payload: { stopped: boolean; reason?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:setEmergencyStop', payload),
    reject: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:reject', payload),
    approvePortfolio: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:approvePortfolio', payload),
    rejectPortfolio: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:rejectPortfolio', payload),
    saveStoreCost: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:saveStoreCost', payload),
    saveProductCost: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:saveProductCost', payload),
    removeProductCost: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:removeProductCost', payload),
    saveRuleGroup: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:saveRuleGroup', payload),
    removeRuleGroup: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:removeRuleGroup', payload),
    bindRuleGroup: (payload: { campaignId: string; ruleGroupId: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:bindRuleGroup', payload),
    unbindRuleGroup: (payload: { campaignId: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:unbindRuleGroup', payload),
    saveListEntry: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:saveListEntry', payload),
    removeListEntry: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:removeListEntry', payload),
    backtest: (payload?: { campaignId?: string; days?: number }) => ipcRenderer.invoke('plugin:tiktokGmvMax:backtest', payload),
    rollback: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:rollback', payload),
    saveNotificationConfig: (payload: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokGmvMax:saveNotificationConfig', payload),
  },
  tiktokListing: {
    list: () => ipcRenderer.invoke('plugin:tiktokListing:list'),
    getExportCategoryConfigs: () => ipcRenderer.invoke('plugin:tiktokListing:getExportCategoryConfigs'),
    saveExportCategoryConfigs: (payload: any) => ipcRenderer.invoke('plugin:tiktokListing:saveExportCategoryConfigs', payload),
    createOrUpdate: (payload: any) => ipcRenderer.invoke('plugin:tiktokListing:createOrUpdate', payload),
    generate: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokListing:generate', payload),
    remove: (id: string) => ipcRenderer.invoke('plugin:tiktokListing:remove', id),
    exportExcel: (payload: { ids: string[] }) => ipcRenderer.invoke('plugin:tiktokListing:exportExcel', payload),
  },
  tiktokCreative: {
    list: () => ipcRenderer.invoke('plugin:tiktokCreative:list'),
    listAccounts: () => ipcRenderer.invoke('plugin:tiktokCreative:listAccounts'),
    listPromptVersions: () => ipcRenderer.invoke('plugin:tiktokCreative:listPromptVersions'),
    createPromptVersion: (payload: { name: string; prompt: string }) => ipcRenderer.invoke('plugin:tiktokCreative:createPromptVersion', payload),
    updatePromptVersion: (payload: { id: string; name: string; prompt: string }) => ipcRenderer.invoke('plugin:tiktokCreative:updatePromptVersion', payload),
    activatePromptVersion: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokCreative:activatePromptVersion', payload),
    rollbackPromptVersion: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokCreative:rollbackPromptVersion', payload),
    importAccount: (payload: { id?: string; name: string; cookieJson: string }) => ipcRenderer.invoke('plugin:tiktokCreative:importAccount', payload),
    updateAccount: (payload: { id: string; name?: string; enabled?: boolean; priority?: number }) => ipcRenderer.invoke('plugin:tiktokCreative:updateAccount', payload),
    testAccount: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:testAccount', id),
    removeAccount: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:removeAccount', id),
    createFromReference: (payload: { referenceImagePaths: string[]; productId: string; prompt?: string; durationSec?: number }) => ipcRenderer.invoke('plugin:tiktokCreative:createFromReference', payload),
    retryShot: (payload: {
      id: string
      shotId: string
      replacementRegion?: { x: number; y: number; width: number; height: number }
    }) => ipcRenderer.invoke('plugin:tiktokCreative:retryShot', payload),
    exportItems: (payload: { taskId: string; shotIds: string[]; outputDir: string }) => ipcRenderer.invoke('plugin:tiktokCreative:exportItems', payload),
    removeShot: (payload: { taskId: string; shotId: string }) => ipcRenderer.invoke('plugin:tiktokCreative:removeShot', payload),
    generateSubtitles: (payload: { items: Array<{ taskId: string; shotId: string }>; titleText?: string; titleConfig?: { strategy?: 'single_for_all' | 'random_pool'; singleText?: string; titlePool?: string[] }; captionStyle?: Record<string, unknown>; overlayImageConfig?: Record<string, unknown>; layoutPolicy?: Record<string, unknown> }) => ipcRenderer.invoke('plugin:tiktokCreative:generateSubtitles', payload),
    revertSubtitles: (payload: { taskId: string; shotId: string }) => ipcRenderer.invoke('plugin:tiktokCreative:revertSubtitles', payload),
    remove: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:remove', id),
  },
  livePhoto: {
    list: () => ipcRenderer.invoke('plugin:livePhoto:list'),
    listSummaries: (payload?: { page?: number; pageSize?: number; filter?: 'all' | 'failed' | 'running' | 'paused' }) => ipcRenderer.invoke('plugin:livePhoto:listSummaries', payload),
    get: (id: string) => ipcRenderer.invoke('plugin:livePhoto:get', id),
    getSettings: () => ipcRenderer.invoke('plugin:livePhoto:getSettings'),
    saveSettings: (payload: {
      referenceMotionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
      cloneMotionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
      outputResolution?: '1080x1440' | '2160x2880' | '3024x4032'
      frameRate?: '24' | '30'
      quality?: 'medium' | 'high'
      qualityCheckerEnabled?: boolean
      qualityPassThreshold?: number
      qualityRetryFloor?: number
    }) => ipcRenderer.invoke('plugin:livePhoto:saveSettings', payload),
    listPromptVersions: () => ipcRenderer.invoke('plugin:livePhoto:listPromptVersions'),
    createPromptVersion: (payload: { name: string; prompt: string }) => ipcRenderer.invoke('plugin:livePhoto:createPromptVersion', payload),
    updatePromptVersion: (payload: { id: string; name: string; prompt: string }) => ipcRenderer.invoke('plugin:livePhoto:updatePromptVersion', payload),
    activatePromptVersion: (payload: { id: string }) => ipcRenderer.invoke('plugin:livePhoto:activatePromptVersion', payload),
    rollbackPromptVersion: (payload: { id: string }) => ipcRenderer.invoke('plugin:livePhoto:rollbackPromptVersion', payload),
    getQualityMetrics: () => ipcRenderer.invoke('plugin:livePhoto:getQualityMetrics'),
    enqueueReference: (payload: { referenceImagePath?: string; referenceImagePaths?: string[]; productId: string; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:enqueueReference', payload),
    startReference: (payload: { ids: string[]; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:startReference', payload),
    enqueueClone: (payload: { cloneProjectId: string; shotIds: string[]; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:enqueueClone', payload),
    startClone: (payload: { ids: string[]; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:startClone', payload),
    createFromReference: (payload: { referenceImagePath?: string; referenceImagePaths?: string[]; productId: string; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:createFromReference', payload),
    createFromCloneShots: (payload: { cloneProjectId: string; shotIds: string[]; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:createFromCloneShots', payload),
    applySubtitleVideoToItem: (payload: { id: string; subtitleVideoPath: string; subtitleCoverImagePath?: string }) =>
      ipcRenderer.invoke('plugin:livePhoto:applySubtitleVideoToItem', payload),
    revertSubtitleVideoFromItem: (payload: { id: string }) => ipcRenderer.invoke('plugin:livePhoto:revertSubtitleVideoFromItem', payload),
    generateSubtitleVideosForItems: (payload: {
      name: string
      sourceItems: Array<{
        id: string
        sourceType: 'upload' | 'clone_final'
        sourceVideoPath: string
        sourceProjectId?: string
        sourceProjectTitle?: string
        fileName: string
        coverImagePath?: string
      }>
      subtitleMode?: 'static_title' | 'timed_caption' | 'hybrid'
      subtitleSource?: 'whisper_compatible' | 'manual'
      exportEngine?: 'capcut_mate' | 'ass_fallback'
      titleRenderMode?: 'overlay_image' | 'ass_text'
      titleConfig?: {
        strategy?: 'single_for_all' | 'random_pool'
        singleText?: string
        titlePool?: string[]
      }
      titleItems?: Array<{ sourceItemId: string; text: string; updatedAt: number }>
      overlayImageConfig?: {
        canvasWidth?: number
        canvasHeight?: number
        fontName?: string
        fontSize?: number
        fontColor?: string
        strokeColor?: string
        strokeWidth?: number
        shadowColor?: string
        shadowBlur?: number
        position?: 'top' | 'center' | 'bottom'
        safeMargin?: number
        textAlign?: 'left' | 'center' | 'right'
        maxLines?: number
        maxWidthRatio?: number
        lineGap?: number
        bottomMargin?: number
      }
      captionStyle?: {
        fontName?: string
        fontSize?: number
        fontColor?: string
        strokeColor?: string
        strokeWidth?: number
        shadowColor?: string
        shadowBlur?: number
        position?: 'top' | 'center' | 'bottom'
        safeMargin?: number
        textAlign?: 'left' | 'center' | 'right'
        maxLines?: number
        maxWidthRatio?: number
        lineGap?: number
        bottomMargin?: number
      }
      layoutPolicy?: {
        maxLines?: number
        maxWidthRatio?: number
        reflowStrategy?: 'balanced' | 'punctuation'
        avoidPosition?: 'auto' | 'top' | 'bottom'
      }
    }) => ipcRenderer.invoke('plugin:livePhoto:generateSubtitleVideosForItems', payload),
    retry: (payload: {
      id: string
      motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
      replacementRegion?: { x: number; y: number; width: number; height: number }
    }) =>
      ipcRenderer.invoke('plugin:livePhoto:retry', payload),
    exportItems: (payload: {
      ids: string[]
      outputDir?: string
      settings?: {
        referenceMotionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
        cloneMotionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
        outputResolution?: '1080x1440' | '2160x2880' | '3024x4032'
        frameRate?: '24' | '30'
        quality?: 'medium' | 'high'
      }
    }) => ipcRenderer.invoke('plugin:livePhoto:exportItems', payload),
    sendItemsToFeishu: (payload: { ids: string[] }) => ipcRenderer.invoke('plugin:livePhoto:sendItemsToFeishu', payload),
    remove: (id: string) => ipcRenderer.invoke('plugin:livePhoto:remove', id),
    pauseAutoFlow: (payload: { id: string }) => ipcRenderer.invoke('plugin:livePhoto:pauseAutoFlow', payload),
    resumeAutoFlow: (payload: { id: string; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:resumeAutoFlow', payload),
  },
  hermes: {
    livePhoto: {
      startReferenceSession: (payload: {
        channel: string
        userId: string
        referenceImagePaths?: string[]
        selectionMode?: 'product' | 'material' | 'delivery'
      }) => ipcRenderer.invoke('hermes:livePhoto:startReferenceSession', payload),
      getLatestSession: (payload: { channel: string; userId: string }) =>
        ipcRenderer.invoke('hermes:livePhoto:getLatestSession', payload),
      listProductOptions: () => ipcRenderer.invoke('hermes:livePhoto:listProductOptions'),
      selectProduct: (payload: { sessionId: string; productId: string }) =>
        ipcRenderer.invoke('hermes:livePhoto:selectProduct', payload),
      selectMaterial: (payload: { sessionId: string; materialId: string }) =>
        ipcRenderer.invoke('hermes:livePhoto:selectMaterial', payload),
      selectDeliveryCount: (payload: { sessionId: string; count: number }) =>
        ipcRenderer.invoke('hermes:livePhoto:selectDeliveryCount', payload),
      getSessionStatus: (sessionId: string) => ipcRenderer.invoke('hermes:livePhoto:getSessionStatus', sessionId),
    },
    getRuntimeStatus: () => ipcRenderer.invoke('hermes:getRuntimeStatus'),
    getInstallationStatus: () => ipcRenderer.invoke('hermes:getInstallationStatus'),
    installRuntime: () => ipcRenderer.invoke('hermes:installRuntime'),
    updateRuntime: () => ipcRenderer.invoke('hermes:updateRuntime'),
    repairRuntime: () => ipcRenderer.invoke('hermes:repairRuntime'),
    startRuntime: () => ipcRenderer.invoke('hermes:startRuntime'),
    stopRuntime: () => ipcRenderer.invoke('hermes:stopRuntime'),
    restartRuntime: () => ipcRenderer.invoke('hermes:restartRuntime'),
    getGatewayStatus: () => ipcRenderer.invoke('hermes:getGatewayStatus'),
    startGateway: () => ipcRenderer.invoke('hermes:startGateway'),
    stopGateway: () => ipcRenderer.invoke('hermes:stopGateway'),
    restartGateway: () => ipcRenderer.invoke('hermes:restartGateway'),
    approvePairing: (payload: { platform: string; code: string }) => ipcRenderer.invoke('hermes:approvePairing', payload),
    listSkills: () => ipcRenderer.invoke('hermes:listSkills'),
    searchSkills: (payload: { query: string; source?: string; limit?: number }) => ipcRenderer.invoke('hermes:searchSkills', payload),
    inspectSkill: (identifier: string) => ipcRenderer.invoke('hermes:inspectSkill', identifier),
    auditSkill: (identifier: string) => ipcRenderer.invoke('hermes:auditSkill', identifier),
    installSkill: (identifier: string) => ipcRenderer.invoke('hermes:installSkill', identifier),
    updateSkills: () => ipcRenderer.invoke('hermes:updateSkills'),
    uninstallSkill: (name: string) => ipcRenderer.invoke('hermes:uninstallSkill', name),
    setSkillEnabled: (payload: { name: string; enabled: boolean }) => ipcRenderer.invoke('hermes:setSkillEnabled', payload),
    listChannels: () => ipcRenderer.invoke('hermes:listChannels'),
    getChannel: (id: string) => ipcRenderer.invoke('hermes:getChannel', id),
    saveChannel: (payload: { id: string; enabled?: boolean; values?: Record<string, string>; clear?: string[] }) => ipcRenderer.invoke('hermes:saveChannel', payload),
    connectChannel: (id: string) => ipcRenderer.invoke('hermes:connectChannel', id),
    disconnectChannel: (id: string) => ipcRenderer.invoke('hermes:disconnectChannel', id),
    testChannel: (id: string) => ipcRenderer.invoke('hermes:testChannel', id),
    startChannelPairing: (id: string) => ipcRenderer.invoke('hermes:startChannelPairing', id),
    pollChannelPairing: (pairingId: string) => ipcRenderer.invoke('hermes:pollChannelPairing', pairingId),
    cancelChannelPairing: (pairingId: string) => ipcRenderer.invoke('hermes:cancelChannelPairing', pairingId),
    createBackup: () => ipcRenderer.invoke('hermes:createBackup'),
    listBackups: () => ipcRenderer.invoke('hermes:listBackups'),
    getMemoryStatus: () => ipcRenderer.invoke('hermes:getMemoryStatus'),
    getDiagnostics: () => ipcRenderer.invoke('hermes:getDiagnostics'),
    openWorkspace: (payload: { workspaceId: string; entityId?: string; settingsSection?: string }) => ipcRenderer.invoke('hermes:openWorkspace', {
      workspaceId: String(payload?.workspaceId || ''),
      ...(payload?.entityId ? { entityId: String(payload.entityId) } : {}),
      ...(payload?.settingsSection ? { settingsSection: String(payload.settingsSection) } : {}),
    }),
    listSessions: (limit?: number) => ipcRenderer.invoke('hermes:listSessions', limit),
    getModelOptions: (sessionId?: string) => ipcRenderer.invoke('hermes:getModelOptions', sessionId),
    saveProviderKey: (payload: { provider: string; apiKey: string; sessionId?: string }) => ipcRenderer.invoke('hermes:saveProviderKey', payload),
    selectModel: (payload: { provider: string; model: string; sessionId?: string }) => ipcRenderer.invoke('hermes:selectModel', payload),
    disconnectModelProvider: (payload: { provider: string; sessionId?: string }) => ipcRenderer.invoke('hermes:disconnectModelProvider', payload),
    saveCustomModel: (payload: { model: string; baseUrl: string; apiKey?: string }) => ipcRenderer.invoke('hermes:saveCustomModel', payload),
    useApplicationModel: () => ipcRenderer.invoke('hermes:useApplicationModel'),
    testModelConnection: () => ipcRenderer.invoke('hermes:testModelConnection'),
    createSession: (payload: any) => ipcRenderer.invoke('hermes:createSession', payload),
    resumeSession: (storedSessionId: string) => ipcRenderer.invoke('hermes:resumeSession', storedSessionId),
    forkSession: (payload: { sessionId: string; name?: string }) => ipcRenderer.invoke('hermes:forkSession', payload),
    closeSession: (sessionId: string) => ipcRenderer.invoke('hermes:closeSession', sessionId),
    renameSession: (payload: { sessionId: string; title: string }) => ipcRenderer.invoke('hermes:renameSession', payload),
    deleteSession: (sessionId: string) => ipcRenderer.invoke('hermes:deleteSession', sessionId),
    getHistory: (sessionId: string) => ipcRenderer.invoke('hermes:getHistory', sessionId),
    sendPrompt: (payload: any) => ipcRenderer.invoke('hermes:sendPrompt', normalizeHermesPromptPayload(payload)),
    interruptSession: (sessionId: string) => ipcRenderer.invoke('hermes:interruptSession', sessionId),
    steerSession: (payload: { sessionId: string; text: string }) => ipcRenderer.invoke('hermes:steerSession', payload),
    respondClarification: (payload: any) => ipcRenderer.invoke('hermes:respondClarification', payload),
    respondApproval: (payload: any) => ipcRenderer.invoke('hermes:respondApproval', payload),
    respondSudo: (payload: any) => ipcRenderer.invoke('hermes:respondSudo', payload),
    respondSecret: (payload: any) => ipcRenderer.invoke('hermes:respondSecret', payload),
    getDelegationStatus: () => ipcRenderer.invoke('hermes:getDelegationStatus'),
    setDelegationPaused: (paused: boolean) => ipcRenderer.invoke('hermes:setDelegationPaused', Boolean(paused)),
    interruptSubagent: (subagentId: string) => ipcRenderer.invoke('hermes:interruptSubagent', subagentId),
    listBackgroundProcesses: (sessionId: string) => ipcRenderer.invoke('hermes:listBackgroundProcesses', String(sessionId || '')),
    stopBackgroundProcess: (payload: { sessionId: string; processId: string }) => ipcRenderer.invoke('hermes:stopBackgroundProcess', {
      sessionId: String(payload?.sessionId || ''),
      processId: String(payload?.processId || ''),
    }),
    manageBrowser: (payload: { action: 'status' | 'connect' | 'disconnect'; sessionId?: string; url?: string }) =>
      ipcRenderer.invoke('hermes:manageBrowser', {
        action: payload?.action,
        ...(payload?.sessionId ? { sessionId: String(payload.sessionId) } : {}),
        ...(payload?.url ? { url: String(payload.url) } : {}),
      }),
    listSessionEvents: (payload: { sessionId?: string; storedSessionId?: string; limit?: number }) =>
      ipcRenderer.invoke('hermes:listSessionEvents', {
        ...(payload?.sessionId ? { sessionId: String(payload.sessionId) } : {}),
        ...(payload?.storedSessionId ? { storedSessionId: String(payload.storedSessionId) } : {}),
        ...(Number.isInteger(payload?.limit) ? { limit: Number(payload.limit) } : {}),
      }),
    listPendingInputs: () => ipcRenderer.invoke('hermes:listPendingInputs'),
    subscribeEvents: (afterSequence: number, callback: (events: any[]) => void) => {
      let lastSequence = Math.max(0, Number(afterSequence || 0))
      const forward = (events: any[]) => {
        const fresh = (Array.isArray(events) ? events : [])
          .filter((event) => Number(event?.sequence || 0) > lastSequence)
          .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
        if (!fresh.length) return
        lastSequence = Number(fresh[fresh.length - 1].sequence || lastSequence)
        callback(fresh)
      }
      const handler = (_event: unknown, events: any[]) => forward(events)
      ipcRenderer.on('hermes:event', handler)
      void ipcRenderer.invoke('hermes:listEvents', lastSequence).then(forward)
      return () => ipcRenderer.off('hermes:event', handler)
    },
    subscribeRuntimeStatus: (callback: (status: any) => void) => {
      const handler = (_event: unknown, status: any) => callback(status)
      ipcRenderer.on('hermes:runtimeStatus', handler)
      return () => ipcRenderer.off('hermes:runtimeStatus', handler)
    },
    subscribeManagementEvents: (callback: (status: any) => void) => {
      const handler = (_event: unknown, status: any) => callback(status)
      ipcRenderer.on('hermes:managementStatus', handler)
      return () => ipcRenderer.off('hermes:managementStatus', handler)
    },
    subscribeWorkspaceActions: (callback: (action: HermesWorkspaceAction) => void) => {
      const handler = (_event: unknown, action: HermesWorkspaceAction) => callback(action)
      ipcRenderer.on('hermes:workspaceAction', handler)
      return () => ipcRenderer.off('hermes:workspaceAction', handler)
    },
  },

  agentOs: {
    listEmployees: () => ipcRenderer.invoke('agentOs:listEmployees'),
    createEmployee: (payload: any) => ipcRenderer.invoke('agentOs:createEmployee', payload),
    updateEmployee: (payload: any) => ipcRenderer.invoke('agentOs:updateEmployee', payload),
    duplicateEmployee: (payload: { id: string; name?: string }) => ipcRenderer.invoke('agentOs:duplicateEmployee', payload),
    archiveEmployee: (id: string) => ipcRenderer.invoke('agentOs:archiveEmployee', id),
    createConversation: (payload?: any) => ipcRenderer.invoke('agentOs:createConversation', payload),
    listConversations: (limit?: number) => ipcRenderer.invoke('agentOs:listConversations', limit),
    getConversation: (id: string) => ipcRenderer.invoke('agentOs:getConversation', id),
    sendMessage: (payload: any) => ipcRenderer.invoke('agentOs:sendMessage', payload),
    getRun: (runId: string) => ipcRenderer.invoke('agentOs:getRun', runId),
    approveRun: (payload: { runId: string; revision: number; planHash: string }) => ipcRenderer.invoke('agentOs:approveRun', payload),
    rejectRun: (payload: { runId: string; revision: number; planHash: string }) => ipcRenderer.invoke('agentOs:rejectRun', payload),
    pauseRun: (runId: string) => ipcRenderer.invoke('agentOs:pauseRun', runId),
    resumeRun: (runId: string) => ipcRenderer.invoke('agentOs:resumeRun', runId),
    cancelRun: (runId: string) => ipcRenderer.invoke('agentOs:cancelRun', runId),
    listArtifacts: (payload?: { runId?: string; conversationId?: string }) => ipcRenderer.invoke('agentOs:listArtifacts', payload),
    openArtifact: (id: string) => ipcRenderer.invoke('agentOs:openArtifact', id),
    subscribeEvents: (afterSequence: number, callback: (events: any[]) => void) => {
      let lastSequence = Math.max(0, Number(afterSequence || 0))
      const forward = (events: any[]) => {
        const fresh = (Array.isArray(events) ? events : [])
          .filter((event) => Number(event?.sequence || 0) > lastSequence)
          .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
        if (!fresh.length) return
        lastSequence = Number(fresh[fresh.length - 1].sequence || lastSequence)
        callback(fresh)
      }
      const handler = (_event: unknown, events: any[]) => forward(events)
      ipcRenderer.on('agentOs:event', handler)
      void ipcRenderer.invoke('agentOs:listEvents', { afterSequence: lastSequence, limit: 1000 }).then(forward)
      return () => ipcRenderer.off('agentOs:event', handler)
    },
  },

  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    upsert: (payload: any) => ipcRenderer.invoke('templates:upsert', payload),
    remove: (id: string) => ipcRenderer.invoke('templates:remove', id),
  },

  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    stats: () => ipcRenderer.invoke('tasks:stats'),
    retry: (id: string) => ipcRenderer.invoke('tasks:retry', String(id || '')),
    cancel: (id: string) => ipcRenderer.invoke('tasks:cancel', String(id || '')),
    remove: (id: string) => ipcRenderer.invoke('tasks:remove', String(id || '')),
    enqueueBatch: (payload: { productId: string; templateId: string; count: number; outDir: string }) =>
      ipcRenderer.invoke('tasks:enqueueBatch', payload),
    pause: () => ipcRenderer.invoke('tasks:pause'),
    resume: () => ipcRenderer.invoke('tasks:resume'),
    cancelAll: () => ipcRenderer.invoke('tasks:cancelAll'),
    onEvent: (cb: (evt: any) => void) => {
      const handler = (_: any, evt: any) => cb(evt)
      ipcRenderer.on('tasks:event', handler)
      return () => ipcRenderer.off('tasks:event', handler)
    },
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onUpdateDownloaded: (cb: (payload: { version: string }) => void) => {
      const handler = (_: unknown, payload: { version: string }) => cb(payload)
      ipcRenderer.on('updater:update-downloaded', handler)
      return () => ipcRenderer.off('updater:update-downloaded', handler)
    },
  },

  license: {
    getMachineId: () =>
      ipcRenderer.invoke('license:getMachineId') as Promise<{
        ok: boolean
        machineId: string
        error?: string
      }>,
    verify: (licenseKey: string) =>
      ipcRenderer.invoke('license:verify', licenseKey) as Promise<{
        code: number
        msg: string
        data?: { valid?: boolean; expire_time?: string }
      }>,
  },
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
