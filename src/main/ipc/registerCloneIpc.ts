/**
 * 复刻页面（CloneView / 复刻任务列表）的 IPC 处理函数：电脑端主进程注册；服务器上的复刻引擎
 * （services/cloud/engine/cloneWorker.ts）用同一份注册到自己的调用表，网页调用的就是同一套处理逻辑。
 */
import type { IpcMain } from 'electron'
import { cloneService } from '../modules/clone/service'

export type CloneIpcHost = Pick<IpcMain, 'handle'>

export function registerCloneIpc(ipcMain: CloneIpcHost) {
  ipcMain.handle(
    'clone:debugLog',
    async (
      _e,
      payload: {
        message: string
        level?: 'info' | 'error'
      },
    ) => {
      const text = String(payload?.message || '').trim()
      if (text) {
        if (payload?.level === 'error') console.error(text)
        else console.log(text)
      }
      return { ok: true }
    },
  )

  ipcMain.handle(
    'clone:createDraftProject',
    async (
      _e,
      payload: {
        locale?: 'vi-VN' | 'zh-CN'
        strength?: 'structure'
        title?: string
        description?: string
        runMode?: 'auto' | 'manual'
      },
    ) => {
      return await cloneService.createDraftProject(payload)
    },
  )
  ipcMain.handle(
    'clone:createBlueprint',
    async (_e, payload: { videoPath: string; locale?: 'vi-VN' | 'zh-CN'; strength?: 'structure'; cloneProjectId?: string }) => {
      return await cloneService.createCloneBlueprintFromReference(payload)
    },
  )
  ipcMain.handle(
    'clone:analyzeReference',
    async (_e, payload: { videoPath: string; locale?: 'vi-VN' | 'zh-CN'; strength?: 'structure' }) => {
      return await cloneService.analyzeReference(payload)
    },
  )
  ipcMain.handle(
    'clone:expandCommercialPrompt',
    async (_e, payload: { cloneProjectId: string; prompt?: string; sceneHint?: string; styleHint?: string }) => {
      return await cloneService.expandCommercialPrompt(payload)
    },
  )
  ipcMain.handle(
    'clone:prepareMaterials',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
        productPoints?: string
        productReferenceImagePaths?: string[]
        generateModelPack?: boolean
        forceRegenerateModelPack?: boolean
      },
    ) => {
      return await cloneService.prepareCloneMaterials(payload)
    },
  )
  ipcMain.handle(
    'clone:saveProjectProductImages',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productReferenceImagePaths?: string[]
      },
    ) => {
      return await cloneService.saveProjectProductImages(payload)
    },
  )
  ipcMain.handle(
    'clone:bindProjectProduct',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productId: string
      },
    ) => {
      return await cloneService.bindProjectProduct(payload)
    },
  )
  ipcMain.handle(
    'clone:generateVariants',
    async (
      _e,
      payload: {
        cloneProjectId: string
        targetProductId?: string
        variantsPerShot?: number
      },
    ) => {
      return await cloneService.generateCloneVariants(payload)
    },
  )
  ipcMain.handle(
    'clone:generateScriptVariants',
    async (
      _e,
      payload: {
        cloneProjectId: string
        variantCount: number
      },
    ) => {
      return await cloneService.generateScriptVariantsForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:selectScriptVariant',
    async (
      _e,
      payload: {
        cloneProjectId: string
        variantId: string
      },
    ) => {
      return await cloneService.selectScriptVariantForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:generateStoryboardGrids',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productReferenceImagePaths?: string[]
        selectedModelIdentityId?: string
      },
    ) => {
      console.log('[clone-debug] ipc:generateStoryboardGrids', payload)
      return await cloneService.generateStoryboardGridsForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:generateShotVideosFromStoryboard',
    async (
      _e,
      payload: {
        cloneProjectId: string
        maxAutoRetryPerShot?: number
      },
    ) => {
      console.log('[clone-debug] ipc:generateShotVideosFromStoryboard', payload)
      return await cloneService.generateShotVideosFromStoryboardFrames(payload)
    },
  )
  ipcMain.handle(
    'clone:autoRunToStoryboardVideos',
    async (
      _e,
      payload: {
        cloneProjectId: string
        variantCount?: number
        selectedModelIdentityId?: string
        productReferenceImagePaths?: string[]
        autoBindModelPack?: boolean
      },
    ) => {
      console.log('[clone-debug] ipc:autoRunToStoryboardVideos', payload)
      return await cloneService.autoRunCloneToStoryboardVideos(payload)
    },
  )
  ipcMain.handle(
    'clone:replaceShotVideo',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        videoPath: string
      },
    ) => {
      return await cloneService.replaceShotVideoForProject(payload)
    },
  )
  ipcMain.handle('clone:listShotAlternatives', async (_e, payload: { cloneProjectId: string }) => {
    const { listCloneShotAlternatives } = await import('../modules/clone/crossLineShots')
    return await listCloneShotAlternatives(payload)
  })
  ipcMain.handle('clone:useShotAlternative', async (_e, payload: { cloneProjectId: string; shotId: string; ref: string }) => {
    const { useCloneShotAlternative } = await import('../modules/clone/crossLineShots')
    return await useCloneShotAlternative(payload)
  })
  ipcMain.handle('clone:sendProjectToCreative', async (_e, payload: { cloneProjectId: string }) => {
    const { sendCloneProjectToCreative } = await import('../modules/clone/crossLineShots')
    return await sendCloneProjectToCreative(payload)
  })
  ipcMain.handle('clone:sendShotToMuse', async (_e, payload: { cloneProjectId: string; shotId: string }) => {
    const { sendCloneShotsToMuse } = await import('../modules/clone/crossLineShots')
    return await sendCloneShotsToMuse({ cloneProjectId: payload.cloneProjectId, shotIds: [payload.shotId], autoReplace: true })
  })
  ipcMain.handle('clone:sendShotToCreative', async (_e, payload: { cloneProjectId: string; shotId: string }) => {
    const { sendCloneShotToCreative } = await import('../modules/clone/crossLineShots')
    return await sendCloneShotToCreative(payload)
  })
  ipcMain.handle(
    'clone:composeCloneVideo',
    async (
      _e,
      payload: {
        cloneProjectId: string
        outputDir?: string
      },
    ) => {
      return await cloneService.composeCloneFinalVideo(payload)
    },
  )
  ipcMain.handle(
    'clone:forceDownloadShotVideoResult',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
      },
    ) => {
      return await cloneService.forceDownloadShotVideoResult(payload)
    },
  )
  ipcMain.handle(
    'clone:generatePreviewBatch',
    async (
      _e,
      payload: {
        cloneProjectId: string
        topN?: number
        onlyMissing?: boolean
        variantsPerShot?: number
        productReferenceImagePaths?: string[]
        targetProductId?: string
        previewFirst?: boolean
      },
    ) => {
      return await cloneService.generateClonePreviewAndBatch(payload)
    },
  )
  ipcMain.handle('clone:getClonePipelineStatus', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getClonePipelineStatus(payload)
  })
  ipcMain.handle('clone:getProject', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getProject(payload)
  })
  ipcMain.handle(
    'clone:updateProjectMeta',
    async (_e, payload: { cloneProjectId: string; title?: string; description?: string }) => {
      return await cloneService.updateProjectMeta(payload)
    },
  )
  ipcMain.handle(
    'clone:applySubtitleVideoToProject',
    async (
      _e,
      payload: { cloneProjectId: string; subtitleVideoPath: string; subtitleCoverImagePath?: string },
    ) => {
      return await cloneService.applySubtitleVideoToProject(payload)
    },
  )
  ipcMain.handle(
    'clone:generateSubtitleVideosForProjects',
    async (
      _e,
      payload: {
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
      },
    ) => {
      return await cloneService.generateSubtitleVideosForProjects(payload)
    },
  )
  ipcMain.handle(
    'clone:revertSubtitleVideoFromProject',
    async (_e, payload: { cloneProjectId: string }) => {
      return await cloneService.revertSubtitleVideoFromProject(payload)
    },
  )
  ipcMain.handle(
    'clone:updateProjectRenderHints',
    async (
      _e,
      payload: {
        cloneProjectId: string
        aspectRatio?: '9:16' | '16:9'
        resolution?: '720x1280' | '1280x720' | '1080x1920' | '1920x1080'
      },
    ) => {
      return await cloneService.updateProjectRenderHints(payload)
    },
  )
  ipcMain.handle('clone:listCloneGroups', async () => {
    return await cloneService.listCloneGroups()
  })
  ipcMain.handle('clone:createCloneGroup', async (_e, payload: { name: string }) => {
    return await cloneService.createCloneGroup(payload)
  })
  ipcMain.handle('clone:renameCloneGroup', async (_e, payload: { groupId: string; name: string }) => {
    return await cloneService.renameCloneGroup(payload)
  })
  ipcMain.handle('clone:removeCloneGroup', async (_e, payload: { groupId: string }) => {
    return await cloneService.removeCloneGroup(payload)
  })
  ipcMain.handle('clone:assignCloneProjectsToGroup', async (_e, payload: { cloneProjectIds: string[]; groupId?: string }) => {
    return await cloneService.assignCloneProjectsToGroup(payload)
  })
  ipcMain.handle(
    'clone:bindProjectReferenceVideo',
    async (_e, payload: { cloneProjectId: string; videoPath: string }) => {
      return await cloneService.bindProjectReferenceVideo(payload)
    },
  )
  ipcMain.handle('clone:getProjectSummary', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getProjectSummary(payload)
  })
  ipcMain.handle('clone:refreshProjectStatus', async (_e, payload: { cloneProjectId: string }) => {
    const project = await cloneService.getProject(payload)
    return {
      project,
      results: [],
    }
  })
  ipcMain.handle('clone:reconcileRemoteStoryboardVideos', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.reconcileRemoteStoryboardVideos(payload)
  })
  ipcMain.handle('clone:reanalyzeShotScript', async (_e, payload: { cloneProjectId: string; shotId: string }) => {
    return await cloneService.reanalyzeShotScript(payload)
  })
  ipcMain.handle(
    'clone:generateShotVariants',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotIds?: string[]
        targetProductId?: string
        variantsPerShot?: number
        strategy?: 'balanced' | 'low_cost' | 'high_conversion' | 'anti_duplicate'
      },
    ) => cloneService.generateShotVariants(payload),
  )
  ipcMain.handle(
    'clone:scoreShotVariants',
    async (_e, payload: { cloneProjectId: string; shotIds?: string[]; targetProductId?: string }) =>
      cloneService.scoreShotVariants(payload),
  )
  ipcMain.handle(
    'clone:buildVideoPlans',
    async (
      _e,
      payload: {
        cloneProjectId: string
        targetProductId?: string
        planCount?: number
        maxVideosToGenerate?: number
        strategy?: 'balanced' | 'hook_first' | 'conversion_first' | 'anti_duplicate'
      },
    ) => cloneService.buildVideoPlans(payload),
  )
  ipcMain.handle(
    'clone:buildScriptCandidates',
    async (_e, payload: { cloneProjectId: string }) => cloneService.buildScriptCandidates(payload),
  )
  ipcMain.handle(
    'clone:generateConsistencyAssets',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
        productPoints?: string
        productReferenceImagePaths?: string[]
        generateModelPack?: boolean
        forceRegenerateModelPack?: boolean
      },
    ) => cloneService.generateConsistencyAssets(payload),
  )
  ipcMain.handle(
    'clone:runStoryboardAndVideoBatch',
    async (
      _e,
      payload: {
        cloneProjectId: string
        topN?: number
        onlyMissing?: boolean
        variantsPerShot?: number
        productReferenceImagePaths?: string[]
        targetProductId?: string
        previewFirst?: boolean
      },
    ) => cloneService.runStoryboardAndVideoBatch(payload),
  )
  ipcMain.handle(
    'clone:updateVariantReview',
    async (
      _e,
      payload: { cloneProjectId: string; shotId: string; variantId: string; reviewStatus: 'pending' | 'keep' | 'reject' },
    ) => cloneService.updateVariantReview(payload),
  )
  ipcMain.handle(
    'clone:updateVideoPlanStatus',
    async (
      _e,
      payload: { cloneProjectId: string; videoPlanId: string; status: 'draft' | 'selected' | 'generating' | 'done' | 'failed' | 'rejected' },
    ) => cloneService.updateVideoPlanStatus(payload),
  )
  ipcMain.handle('clone:listProjects', async () => {
    return await cloneService.listProjects()
  })
  ipcMain.handle(
    'clone:listProjectSummaries',
    async (_e, payload?: { query?: string; status?: string; archived?: boolean }) => {
      return await cloneService.listProjectSummaries(payload)
    },
  )
  ipcMain.handle('clone:listModelIdentityLibrary', async () => {
    return await cloneService.listModelIdentityLibrary()
  })
  ipcMain.handle('clone:listModelTasks', async () => {
    return await cloneService.listModelTasks()
  })
  ipcMain.handle(
    'clone:createModelTask',
    async (
      _e,
      payload?: {
        title?: string
        description?: string
        sourceProjectId?: string
        productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
      },
    ) => {
      return await cloneService.createModelTask(payload)
    },
  )
  ipcMain.handle('clone:getGenerationQueue', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getGenerationQueue(payload)
  })
  ipcMain.handle('clone:pauseGenerationQueue', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.pauseGenerationQueue(payload)
  })
  ipcMain.handle('clone:resumeGenerationQueue', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.resumeGenerationQueue(payload)
  })
  ipcMain.handle('clone:renameModelIdentity', async (_e, payload: { id: string; name: string }) => {
    return await cloneService.renameModelIdentity(payload)
  })
  ipcMain.handle('clone:deleteModelIdentity', async (_e, payload: { id: string }) => {
    return await cloneService.deleteModelIdentity(payload)
  })
  ipcMain.handle(
    'clone:selectProjectModelIdentity',
    async (_e, payload: { cloneProjectId: string; identityId: string }) => {
      return await cloneService.selectProjectModelIdentity(payload)
    },
  )
  ipcMain.handle(
    'clone:exportFinalVideos',
    async (_e, payload: { cloneProjectIds: string[]; outputDir: string }) => {
      return await cloneService.exportFinalVideos(payload)
    },
  )
  ipcMain.handle('clone:removeProject', async (_e, payload: { cloneProjectId: string; force?: boolean }) => {
    return await cloneService.removeProject(payload)
  })
  ipcMain.handle(
    'clone:updateShot',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        sourceMode?: 'uploaded' | 'pending' | 'ai'
        uploadedAssetIds?: string[]
        aiEnabled?: boolean
        promptOverrides?: Partial<{ positive: string; negative: string; cameraMotion: string }>
        reviewStatus?: 'pending' | 'keep' | 'reject'
      },
    ) => {
      return await cloneService.updateShot(payload)
    },
  )
  ipcMain.handle(
    'clone:updateShotEnhanced',
    async (
      _e,
        payload: {
          cloneProjectId: string
          shotId: string
          replaceMode?: 'upload_video' | 'upload_image_to_video' | 'ai_generate' | 'locked'
          uploadedAssetPath?: string
          uploadedImagePath?: string
          aiPrompt?: string
          negativePrompt?: string
          locked?: boolean
          qualityMode?: 'fast' | 'standard' | 'high'
          productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
          cloneEligible?: boolean
          filterReason?: string
          cloneClass?: 'real_product' | 'model_demo' | 'screen_recording' | 'tutorial_talking' | 'ui_demo' | 'result_showcase'
          productMainImage?: string
          productDetailImages?: string[]
          productUsageImages?: string[]
          styleReferenceImages?: string[]
          scriptText?: string
          scriptRole?: 'hook' | 'pain_point' | 'solution' | 'show' | 'detail' | 'proof' | 'offer' | 'cta' | 'transition' | 'unknown'
          narrationText?: string
          onScreenText?: string
          visualDescription?: string
          actionDescription?: string
          cameraDescription?: string
          productFocus?: string
          generationPrompt?: string
          scriptConfidence?: number
          analysisNotes?: string[]
        },
    ) => cloneService.updateShotEnhanced(payload),
  )
  ipcMain.handle(
    'clone:uploadShotAssets',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        targetProductId: string
        filePaths: string[]
      },
    ) => {
      return await cloneService.uploadShotAssets(payload)
    },
  )
  ipcMain.handle(
    'clone:generateAiShots',
    async (
      _e,
        payload: {
          cloneProjectId: string
          shotIds: string[]
          videoPlanId?: string
          providerPolicy?: { chain?: Array<'seedance' | 'grsai'> }
          qualityProfile?: 'high'
        },
    ) => {
      return await cloneService.generateAiShots(payload)
    },
  )
  ipcMain.handle(
    'clone:generateShotKeyframes',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotIds: string[]
        targetProductId?: string
        providerPolicy?: { chain?: Array<'seedance'> }
      },
    ) => {
      return await cloneService.generateShotKeyframes(payload)
    },
  )
  ipcMain.handle(
    'clone:regenerateShotKeyframe',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        which: 'start' | 'end'
        promptOverrides?: Partial<{ positive: string; negative: string; cameraMotion: string }>
      },
    ) => {
      return await cloneService.regenerateShotKeyframe(payload)
    },
  )
  ipcMain.handle(
    'clone:generateShotVideos',
    async (
      _e,
      payload: {
        cloneProjectId: string
        sessionId?: string
        shotIds: string[]
        consistencyMode?: 'soft' | 'hard'
        providerPolicy?: { chain?: Array<'seedance'> }
      },
    ) => {
      return await cloneService.generateShotVideos(payload)
    },
  )
  ipcMain.handle(
    'clone:getShotConsistencyReport',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.getShotConsistencyReport(payload),
  )
  ipcMain.handle(
    'clone:getShotImagePromptPreview',
    async (_e, payload: { cloneProjectId: string; shotId: string; selectedModelIdentityId?: string }) =>
      cloneService.getShotImagePromptPreview(payload),
  )
  ipcMain.handle(
    'clone:getShotVideoPromptPreview',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.getShotVideoPromptPreview(payload),
  )
  ipcMain.handle(
    'clone:recompileShotConsistency',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.recompileShotConsistency(payload),
  )
  ipcMain.handle(
    'clone:listShotConsistencyAnchors',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.listShotConsistencyAnchors(payload),
  )
  ipcMain.handle(
    'clone:listShotConsistencyPatches',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.listShotConsistencyPatches(payload),
  )
  ipcMain.handle(
    'clone:generateShotFrames',
    async (_e, payload: { cloneProjectId: string; shotId: string; productReferenceImagePaths?: string[] }) =>
      cloneService.generateShotFrames(payload),
  )
  ipcMain.handle(
    'clone:generateAllShotFrames',
    async (
      _e,
      payload: {
        cloneProjectId: string
        onlyMissing?: boolean
        forceRegenerate?: boolean
        shotIds?: string[]
        productReferenceImagePaths?: string[]
      },
    ) => cloneService.generateAllShotFrames(payload),
  )
  ipcMain.handle(
    'clone:generateModelIdentityPack',
    async (
      _e,
      payload: {
        cloneProjectId?: string
        modelTaskId?: string
        productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
        productPoints?: string
        modelProfileOptions?: import('../../shared/modelProfileOptions').ModelProfileOptions
        productReferenceImagePaths?: string[]
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        grsaiApiKey?: string
        grsaiHost?: string
        grsaiImageModel?: string
        imageProviderCredentials?: Partial<import('../modules/clone/types').ModelCredentials>
      },
    ) => cloneService.generateModelIdentityPack(payload),
  )
  ipcMain.handle(
    'clone:getModelIdentityPromptPreview',
    async (
      _e,
      payload: {
        cloneProjectId?: string
        modelTaskId?: string
        productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
        productPoints?: string
        modelProfileOptions?: import('../../shared/modelProfileOptions').ModelProfileOptions
        productReferenceImagePaths?: string[]
      },
    ) => cloneService.getModelIdentityPromptPreview(payload),
  )
  ipcMain.handle(
    'clone:getProjectIdentityGridPromptPreview',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
        productPoints?: string
        modelProfileOptions?: import('../../shared/modelProfileOptions').ModelProfileOptions
        productReferenceImagePaths?: string[]
      },
    ) => cloneService.getProjectIdentityGridPromptPreview(payload),
  )
  ipcMain.handle(
    'clone:selectModelIdentityPack',
    async (_e, payload: { cloneProjectId: string; packId: string; confirmed?: boolean }) =>
      cloneService.selectModelIdentityPack(payload),
  )
  ipcMain.handle(
    'clone:generateGptShotFrames',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        which?: 'start' | 'end' | 'both'
        selectedModelIdentityId?: string
        productReferenceImagePaths?: string[]
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        grsaiApiKey?: string
        grsaiHost?: string
        grsaiImageModel?: string
        imageProviderCredentials?: Partial<import('../modules/clone/types').ModelCredentials>
      },
    ) => cloneService.generateGptShotFrames(payload),
  )
  ipcMain.handle(
    'clone:confirmGptShotFrames',
    async (_e, payload: { cloneProjectId: string; shotId: string; confirmed?: boolean }) =>
      cloneService.confirmGptShotFrames(payload),
  )
  ipcMain.handle(
    'clone:generateShotClip',
    async (_e, payload: { cloneProjectId: string; shotId: string; forceRegenerate?: boolean }) => cloneService.generateShotClip(payload),
  )
  ipcMain.handle(
    'clone:regenerateShotVideo',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.regenerateShotVideo(payload),
  )
  ipcMain.handle(
    'clone:syncShotVideoTask',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.syncShotVideoTask(payload),
  )
  ipcMain.handle(
    'clone:qualityCheckCurrentShot',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.qualityCheckCurrentShot(payload),
  )
  ipcMain.handle(
    'clone:diagnoseProductImages',
    async (_e, payload: { imagePaths: string[] }) => cloneService.diagnoseProductImages(payload),
  )
  ipcMain.handle(
    'clone:renderPreview',
    async (_e, payload: { cloneProjectId: string; outputDir?: string }) => cloneService.renderPreview(payload),
  )
  ipcMain.handle(
    'clone:renderBatch',
    async (
      _e,
      payload: { cloneProjectId: string; count: number; outputDir?: string; retryFailed?: boolean },
    ) => cloneService.renderBatch(payload),
  )
  ipcMain.handle(
    'clone:saveCloneTemplate',
    async (_e, payload: { cloneProjectId: string; name?: string }) => cloneService.saveCloneTemplate(payload),
  )
  ipcMain.handle(
    'clone:convertToNormalTemplate',
    async (_e, payload: { cloneProjectId: string; name?: string }) => cloneService.convertToNormalTemplate(payload),
  )
  ipcMain.handle(
    'clone:createSession',
    async (
      _e,
      payload: {
        cloneProjectId: string
        targetProductId: string
        count: number
        outputDir?: string
        qualityProfile?: 'high'
        variantStrength?: 'low' | 'medium' | 'high'
        pipelineMode?: 'keyframe_then_video'
      },
    ) => {
      return await cloneService.createSession(payload)
    },
  )
  ipcMain.handle(
    'clone:listSessionResults',
    async (
      _e,
      payload: {
        cloneProjectId: string
        sessionId?: string
        filters?: {
          status?: Array<'pending' | 'passed' | 'rejected' | 'failed'>
          onlyLowScore?: boolean
          targetProductId?: string
        }
      },
    ) => {
      return await cloneService.listSessionResults(payload)
    },
  )
  ipcMain.handle(
    'clone:updateSessionReview',
    async (
      _e,
      payload: {
        cloneProjectId: string
        taskId: string
        reviewStatus: 'pending' | 'keep' | 'reject'
      },
    ) => {
      return await cloneService.updateSessionReview(payload)
    },
  )
  ipcMain.handle(
    'clone:createReplicas',
    async (
      _e,
      payload: {
        cloneProjectId: string
        count: number
        outputDir?: string
        reviewMode?: 'manual'
      },
    ) => {
      return await cloneService.createReplicas(payload)
    },
  )
  ipcMain.handle(
    'clone:updateReplicaReview',
    async (
      _e,
      payload: {
        cloneProjectId: string
        taskId: string
        reviewStatus: 'pending' | 'keep' | 'reject'
      },
    ) => {
      return await cloneService.updateReplicaReview(payload)
    },
  )
  ipcMain.handle('clone:getRuntimeOptions', async () => {
    return await cloneService.getRuntimeOptions()
  })
}
