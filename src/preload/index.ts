import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getWebApiInfo: () => ipcRenderer.invoke('app:getWebApiInfo'),
  setUiLocale: (locale: string) => ipcRenderer.invoke('app:setUiLocale', locale),
  getUiLocale: () => ipcRenderer.invoke('app:getUiLocale'),

  pickFiles: (opts?: { title?: string; filters?: Electron.FileFilter[]; multiple?: boolean }) =>
    ipcRenderer.invoke('fs:pickFiles', opts ?? {}),
  pickDir: (opts: { title?: string }) => ipcRenderer.invoke('fs:pickDir', opts),
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
        chatProviderPrimary?: 'apifox_hub' | 'grsai'
        videoProviderPrimary?: 'seedance' | 'grsai' | 'apifox_hub'
        videoProviderFallback?: 'seedance' | 'grsai' | 'apifox_hub'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
        grsaiImageModel?: string
        apifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi'
        videoApifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi'
        imageApifoxHubProfile?: 'ai666' | 'vectorengine'
        chatApifoxHubProfile?: 'ai666' | 'vectorengine'
        ai666Hub?: import('../main/modules/clone/types').ApifoxHubCredentials
        vectorEngineHub?: import('../main/modules/clone/types').ApifoxHubCredentials
        xibapiHub?: import('../main/modules/clone/types').ApifoxHubCredentials
        apifoxHub?: import('../main/modules/clone/types').ApifoxHubCredentials
      }>,
    getRuntimeOptions: () =>
      ipcRenderer.invoke('clone:getRuntimeOptions') as Promise<{
        storyboardFrameConcurrency: number
        globalStoryboardFrameConcurrency: number
      }>,
    setModelCredentials: (payload: {
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
      allowMockWhenNoKey?: boolean
      keyframeModel?: string
      videoModelPrimary?: string
      videoModelFallback?: string
      grsaiVideoModel?: string
      grsaiAnalysisModel?: string
      chatProviderPrimary?: 'apifox_hub' | 'grsai'
      videoProviderPrimary?: 'seedance' | 'grsai' | 'apifox_hub'
      videoProviderFallback?: 'seedance' | 'grsai' | 'apifox_hub'
      openaiApiKey?: string
      openaiImageModel?: string
      openaiImageQuality?: 'low' | 'medium' | 'high'
      imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
      grsaiImageModel?: string
      apifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi'
      videoApifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi'
      imageApifoxHubProfile?: 'ai666' | 'vectorengine'
      chatApifoxHubProfile?: 'ai666' | 'vectorengine'
      ai666Hub?: import('../main/modules/clone/types').ApifoxHubCredentials
      vectorEngineHub?: import('../main/modules/clone/types').ApifoxHubCredentials
      xibapiHub?: import('../main/modules/clone/types').ApifoxHubCredentials
      apifoxHub?: import('../main/modules/clone/types').ApifoxHubCredentials
    }) =>
      ipcRenderer.invoke('clone:setModelCredentials', payload),
    setRuntimeOptions: (payload: {
      storyboardFrameConcurrency?: number
      globalStoryboardFrameConcurrency?: number
    }) =>
      ipcRenderer.invoke('clone:setRuntimeOptions', payload),
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
    createDraftsFromCloneProjects: (payload: { cloneProjectIds: string[] }) => ipcRenderer.invoke('plugin:tiktokCreative:createDraftsFromCloneProjects', payload),
    createDraftFromCloneProject: (payload: { cloneProjectId: string }) => ipcRenderer.invoke('plugin:tiktokCreative:createDraftFromCloneProject', payload),
    startShot: (payload: { id: string; shotId: string }) => ipcRenderer.invoke('plugin:tiktokCreative:startShot', payload),
    startNextPendingShot: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokCreative:startNextPendingShot', payload),
    markShotCompleted: (payload: { id: string; shotId: string; resultVideoPath: string }) => ipcRenderer.invoke('plugin:tiktokCreative:markShotCompleted', payload),
    markShotFailed: (payload: { id: string; shotId: string; error: string }) => ipcRenderer.invoke('plugin:tiktokCreative:markShotFailed', payload),
    remove: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:remove', id),
  },

  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    upsert: (payload: any) => ipcRenderer.invoke('templates:upsert', payload),
    remove: (id: string) => ipcRenderer.invoke('templates:remove', id),
  },

  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    stats: () => ipcRenderer.invoke('tasks:stats'),
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
