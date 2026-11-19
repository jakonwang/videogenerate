import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CapabilityStoredProviderKey, ChatPlatformProfile, ImagePlatformProfile, PlatformProfile } from '../shared/platformSettings'
import { storageCleanupConfirmation, type StorageCategoryId } from '../shared/storageManagement'
import type { CreatorHubContact, CreatorHubContactChannel, CreatorHubContactInput, CreatorHubFetchContactsResult, CreatorHubMessageTemplate, CreatorHubCreatorDetail,CreatorHubDiscoverQuery, CreatorHubDiscoverResult, CreatorHubPoolRow, CreatorHubCreatorProfile, CreatorHubCrmRow,CreatorHubFulfillmentReport, CreatorHubImportCookiesInput, CreatorHubOrder, CreatorHubOverview, CreatorHubProductCost, CreatorHubSample, CreatorHubSettings, CreatorHubShop, CreatorHubSyncJob, CreatorHubSyncProgress, CreatorHubSyncStage, CreatorHubVideo } from '../shared/creatorHub'
import type {
  InventoryDashboard,
  InventoryDetail,
  InventorySyncResult,
  SaveInventorySkuInput,
} from '../main/modules/dianxiaomi-inventory/types'
import type { ProductResearchPairing, ProductResearchSnapshot, ProductResearchTask, ProductResearchScheme, ProductResearchSchemeState } from '../shared/productResearch'
import type { CloudLicenseStatus } from '../main/lib/cloudLicense'
import type { CloudSyncStatus } from '../main/modules/cloud-sync/service'
import type { CloudDevice, CloudMeResponse, CloudOrder, CloudPage, CloudPayChannel, CloudPlansResponse } from '../shared/cloud/types'
import type { CloudRedeemResult } from '../shared/cloud/client'
import type { CreditsResponse } from '../shared/cloud/billing'

type CloudIpcResult<T> = ({ ok: true } & T) | { ok: false; error: string; code: string; details?: unknown }
type CloudActivation = { ok: true } | { ok: false; reason: CloudLicenseStatus['reason']; message: string; devices?: CloudDevice[]; maxDevices?: number }
type CloudAuthResult = { status: CloudLicenseStatus; activation: CloudActivation }


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


const api = {
  productResearch: {
    snapshot: (schemeId?: string) => ipcRenderer.invoke('productResearch:snapshot', schemeId) as Promise<ProductResearchSnapshot>,
    createPairing: () => ipcRenderer.invoke('productResearch:createPairing') as Promise<ProductResearchPairing>,
    createTask: (payload: { keyword: string; schemeId?: string; sort: 'comprehensive' | 'sales'; targetCount: number }) =>
      ipcRenderer.invoke('productResearch:createTask', payload) as Promise<ProductResearchTask>,
    cancelTask: (taskId: string) => ipcRenderer.invoke('productResearch:cancelTask', taskId) as Promise<ProductResearchTask | undefined>,
    removeTask: (taskId: string) => ipcRenderer.invoke('productResearch:removeTask', taskId) as Promise<boolean>,
    removeResult: (resultId: string, schemeId?: string) => ipcRenderer.invoke('productResearch:removeResult', { resultId, schemeId }) as Promise<boolean>,
    removeResults: (resultIds: string[], schemeId?: string) => ipcRenderer.invoke('productResearch:removeResults', { resultIds, schemeId }) as Promise<number>,
    clearResults: (schemeId?: string) => ipcRenderer.invoke('productResearch:clearResults', schemeId) as Promise<number>,
    createScheme: (payload: { name: string; need: string; market: string; keywords: string[]; note?: string }) => ipcRenderer.invoke('productResearch:createScheme', payload) as Promise<ProductResearchScheme>,
    listSchemes: () => ipcRenderer.invoke('productResearch:listSchemes') as Promise<ProductResearchScheme[]>,
    updateScheme: (id: string, patch: any) => ipcRenderer.invoke('productResearch:updateScheme', id, patch) as Promise<ProductResearchScheme | null>,
    deleteScheme: (id: string) => ipcRenderer.invoke('productResearch:deleteScheme', id) as Promise<boolean>,
    getSchemeState: (id: string) => ipcRenderer.invoke('productResearch:getSchemeState', id) as Promise<ProductResearchSchemeState | null>,
    saveSchemeState: (id: string, patch: Partial<ProductResearchSchemeState>) => ipcRenderer.invoke('productResearch:saveSchemeState', id, patch) as Promise<boolean>,
  },
  assetLibrary: {
    list: (payload?: { query?: string; type?: 'all' | 'image' | 'video'; folderId?: string | null }) => ipcRenderer.invoke('assetLibrary:list', payload),
    upload: (folderId?: string | null) => ipcRenderer.invoke('assetLibrary:upload', folderId),
    importPaths: (payload: { paths: string[]; folderId?: string | null }) => ipcRenderer.invoke('assetLibrary:importPaths', payload),
    listFolders: (parentId?: string | null) => ipcRenderer.invoke('assetLibrary:listFolders', parentId),
    listAllFolders: () => ipcRenderer.invoke('assetLibrary:listAllFolders'),
    getFolderPath: (folderId?: string | null) => ipcRenderer.invoke('assetLibrary:getFolderPath', folderId),
    createFolder: (payload: { name: string; parentId?: string | null }) => ipcRenderer.invoke('assetLibrary:createFolder', payload),
    renameFolder: (payload: { id: string; name: string }) => ipcRenderer.invoke('assetLibrary:renameFolder', payload),
    removeFolder: (id: string) => ipcRenderer.invoke('assetLibrary:removeFolder', id),
    moveAssets: (payload: { ids: string[]; folderId?: string | null }) => ipcRenderer.invoke('assetLibrary:moveAssets', payload),
    copyAssets: (payload: { ids: string[]; folderId?: string | null }) => ipcRenderer.invoke('assetLibrary:copyAssets', payload),
    renameAsset: (payload: { id: string; name: string }) => ipcRenderer.invoke('assetLibrary:renameAsset', payload),
    removeMany: (ids: string[]) => ipcRenderer.invoke('assetLibrary:removeMany', ids),
    moveFolder: (payload: { id: string; parentId?: string | null }) => ipcRenderer.invoke('assetLibrary:moveFolder', payload),
    folderStats: (id: string) => ipcRenderer.invoke('assetLibrary:folderStats', id),
    trashAssets: (ids: string[]) => ipcRenderer.invoke('assetLibrary:trashAssets', ids),
    trashFolder: (id: string) => ipcRenderer.invoke('assetLibrary:trashFolder', id),
    listTrash: () => ipcRenderer.invoke('assetLibrary:listTrash'),
    restoreTrash: (payload: { kind: 'asset' | 'folder'; id: string }) => ipcRenderer.invoke('assetLibrary:restoreTrash', payload),
    purgeTrash: (payload?: { kind?: 'asset' | 'folder'; id?: string }) => ipcRenderer.invoke('assetLibrary:purgeTrash', payload),
    audit: (repair?: boolean) => ipcRenderer.invoke('assetLibrary:audit', repair),
    exportBackup: () => ipcRenderer.invoke('assetLibrary:exportBackup'),
    remove: (id: string) => ipcRenderer.invoke('assetLibrary:remove', id),
    updateUsageStatus: (payload: { id: string; pluginId: string; usageStatus: 'used' | 'unused' }) => ipcRenderer.invoke('assetLibrary:updateUsageStatus', payload),
    thumbnail: (id: string) => ipcRenderer.invoke('assetLibrary:thumbnail', id),
    editImage: (payload: { id: string; input: import('../shared/assetLibrary').AssetImageEditInput }) => ipcRenderer.invoke('assetLibrary:editImage', payload),
    createUploadSession: () => ipcRenderer.invoke('assetLibrary:createUploadSession'),
  },
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
  productWatermark: {
    listTemplates: () => ipcRenderer.invoke('productWatermark:listTemplates'),
    saveTemplate: (payload: { filePath: string; name: string }) => ipcRenderer.invoke('productWatermark:saveTemplate', payload),
    renameTemplate: (payload: { id: string; name: string }) => ipcRenderer.invoke('productWatermark:renameTemplate', payload),
    deleteTemplate: (id: string) => ipcRenderer.invoke('productWatermark:deleteTemplate', id),
    processBatch: (payload: { templateId: string; sourcePaths: string[]; outputDir: string }) => ipcRenderer.invoke('productWatermark:processBatch', payload),
  },
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
    describePromptTemplates: () => ipcRenderer.invoke('clone:describePromptTemplates'),
    listPromptTemplates: (payload: { kind: string; productType?: string }) =>
      ipcRenderer.invoke('clone:listPromptTemplates', payload),
    listActivePromptTemplateScopes: (payload: { kind: string }) =>
      ipcRenderer.invoke('clone:listActivePromptTemplateScopes', payload),
    savePromptTemplate: (payload: { id?: string; kind: string; productType?: string; name?: string; prompt: string }) =>
      ipcRenderer.invoke('clone:savePromptTemplate', payload),
    activatePromptTemplate: (payload: { id: string; kind: string; productType?: string }) =>
      ipcRenderer.invoke('clone:activatePromptTemplate', payload),
    rollbackPromptTemplate: (payload: { id: string; kind: string; productType?: string }) =>
      ipcRenderer.invoke('clone:rollbackPromptTemplate', payload),
    removePromptTemplate: (payload: { id: string }) => ipcRenderer.invoke('clone:removePromptTemplate', payload),
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
      productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
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
    listShotAlternatives: (payload: { cloneProjectId: string }) => ipcRenderer.invoke('clone:listShotAlternatives', payload),
    useShotAlternative: (payload: { cloneProjectId: string; shotId: string; ref: string }) => ipcRenderer.invoke('clone:useShotAlternative', payload),
    sendProjectToCreative: (payload: { cloneProjectId: string }) => ipcRenderer.invoke('clone:sendProjectToCreative', payload),
    sendShotToCreative: (payload: { cloneProjectId: string; shotId: string }) => ipcRenderer.invoke('clone:sendShotToCreative', payload),
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
      productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
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
      productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
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
      productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
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
      productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
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
      productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
      productPoints?: string
      modelProfileOptions?: import('../shared/modelProfileOptions').ModelProfileOptions
      productReferenceImagePaths?: string[]
    }) => ipcRenderer.invoke('clone:getModelIdentityPromptPreview', payload),
    getProjectIdentityGridPromptPreview: (payload: {
      cloneProjectId: string
      productType?: 'earrings' | 'necklace' | 'ring' | 'bracelet' | 'phone_case' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'
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
    getGrsAiCredits: () =>
      ipcRenderer.invoke('clone:getGrsAiCredits') as Promise<{ available?: number; raw: unknown }>,
    onRuntimeLog: (cb: (payload: { level?: 'info' | 'success' | 'error'; message?: string; time?: number }) => void) => {
      const handler = (_: unknown, payload: { level?: 'info' | 'success' | 'error'; message?: string; time?: number }) => cb(payload)
      ipcRenderer.on('clone:runtimeLog', handler)
      return () => {
        ipcRenderer.off('clone:runtimeLog', handler)
      }
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
      return () => {
        ipcRenderer.removeListener('media:segmentSplitProgress', fn)
      }
    },
  },

  liveSlicer: {
    probe: (inputPath: string) =>
      ipcRenderer.invoke('liveSlicer:probe', inputPath) as Promise<
        | { ok: true; source: import('../main/modules/live-slicer/analyze').LiveSlicerSource }
        | { ok: false; error: string }
      >,
    analyze: (payload: { jobId: string; inputPath: string }) =>
      ipcRenderer.invoke('liveSlicer:analyze', payload) as Promise<
        | { ok: true; analysis: import('../main/modules/live-slicer/analyze').LiveSlicerAnalysis }
        | { ok: false; cancelled: boolean; error: string }
      >,
    thumbnail: (payload: { inputPath: string; atSec: number; width?: number; height?: number }) =>
      ipcRenderer.invoke('liveSlicer:thumbnail', payload) as Promise<string | null>,
    export: (payload: {
      jobId: string
      inputPath: string
      segments: import('../main/modules/live-slicer/export').LiveSlicerExportSegment[]
      options: import('../main/modules/live-slicer/export').LiveSlicerExportOptions
    }) =>
      ipcRenderer.invoke('liveSlicer:export', payload) as Promise<
        | { ok: true; outputDir: string; results: import('../main/modules/live-slicer/export').LiveSlicerExportResult[] }
        | { ok: false; cancelled: boolean; error: string }
      >,
    cancel: (jobId: string) => ipcRenderer.invoke('liveSlicer:cancel', jobId),
    onProgress: (cb: (p: Record<string, any>) => void) => {
      const fn = (_: unknown, p: Record<string, any>) => cb(p)
      ipcRenderer.on('liveSlicer:progress', fn)
      return () => {
        ipcRenderer.removeListener('liveSlicer:progress', fn)
      }
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
    listPromptVersions: () => ipcRenderer.invoke('products:listPromptVersions'),
    savePromptVersion: (payload: { id?: string; name?: string; prompt: string }) => ipcRenderer.invoke('products:savePromptVersion', payload),
    activatePromptVersion: (id: string) => ipcRenderer.invoke('products:activatePromptVersion', id),
    rollbackPromptVersion: (id: string) => ipcRenderer.invoke('products:rollbackPromptVersion', id),
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
    createBackgroundVariants: (payload: { userId: string; materialIds: string[]; variantCount: number; promptVersionId?: string; prompt?: string }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:createBackgroundVariants', payload),
    createImageVariants: (payload: { userId: string; sourceImagePath: string; category: 'necklace' | 'ring' | 'earring' | 'bracelet'; variantCount: number; promptVersionId?: string; prompt?: string }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:createImageVariants', payload),
    listPromptVersions: () => ipcRenderer.invoke('plugin:productImageMaterials:listPromptVersions'),
    savePromptVersion: (payload: { id?: string; name?: string; prompt: string }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:savePromptVersion', payload),
    activatePromptVersion: (id: string) => ipcRenderer.invoke('plugin:productImageMaterials:activatePromptVersion', id),
    rollbackPromptVersion: (id: string) => ipcRenderer.invoke('plugin:productImageMaterials:rollbackPromptVersion', id),
    listMaterials: (payload: {
      userId: string
      filters?: {
        category?: 'necklace' | 'ring' | 'earring' | 'bracelet' | 'all'
        usageStatus?: 'unused' | 'used' | 'all'
        boundProductId?: string
      }
    }) => ipcRenderer.invoke('plugin:productImageMaterials:listMaterials', payload),
    resolveMaterialImages: (payload: { userId: string; materialIds: string[] }) =>
      ipcRenderer.invoke('plugin:productImageMaterials:resolveMaterialImages', payload),
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
  productReplacement: {
    listProducts: () => ipcRenderer.invoke('plugin:productReplacement:listProducts'),
    pickImages: () => ipcRenderer.invoke('plugin:productReplacement:pickImages'),
    importPaths: (paths: string[]) => ipcRenderer.invoke('plugin:productReplacement:importPaths', paths),
    listBatches: () => ipcRenderer.invoke('plugin:productReplacement:listBatches'),
    createBatch: (payload: { productId?: string; productName: string; productImagePaths: string[]; sourceImages: Array<{ path: string; name: string }>; variantCount: number; promptVersionId?: string }) => ipcRenderer.invoke('plugin:productReplacement:createBatch', payload),
    pauseBatch: (id: string) => ipcRenderer.invoke('plugin:productReplacement:pauseBatch', id),
    resumeBatch: (id: string) => ipcRenderer.invoke('plugin:productReplacement:resumeBatch', id),
    cancelBatch: (id: string) => ipcRenderer.invoke('plugin:productReplacement:cancelBatch', id),
    retryFailed: (id: string) => ipcRenderer.invoke('plugin:productReplacement:retryFailed', id),
    listPromptVersions: () => ipcRenderer.invoke('plugin:productReplacement:listPromptVersions'),
    savePromptVersion: (payload: { id?: string; name?: string; prompt: string }) => ipcRenderer.invoke('plugin:productReplacement:savePromptVersion', payload),
    activatePromptVersion: (id: string) => ipcRenderer.invoke('plugin:productReplacement:activatePromptVersion', id),
    rollbackPromptVersion: (id: string) => ipcRenderer.invoke('plugin:productReplacement:rollbackPromptVersion', id),
    exportResults: (paths: string[]) => ipcRenderer.invoke('plugin:productReplacement:exportResults', paths),
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
  tiktokCreatorHub: {
    listShops: () => ipcRenderer.invoke('plugin:tiktokCreatorHub:listShops') as Promise<CreatorHubShop[]>,
    importCookies: (payload: CreatorHubImportCookiesInput) => ipcRenderer.invoke('plugin:tiktokCreatorHub:importCookies', payload) as Promise<{ shop: CreatorHubShop; merged: boolean; cookies: number; skipped: number }>,
    verifyShop: (id: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:verifyShop', id) as Promise<CreatorHubShop>,
    renameShop: (payload: { id: string; name: string }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:renameShop', payload) as Promise<CreatorHubShop>,
    removeShop: (id: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:removeShop', id) as Promise<{ ok: true }>,
    openBackend: (payload: { id: string; path?: string }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:openBackend', payload) as Promise<{ url: string; loggedIn: boolean }>,
    syncSamples: (id: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:syncSamples', id) as Promise<CreatorHubSyncJob>,
    syncShop: (payload: { id: string; stages?: CreatorHubSyncStage[] }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:syncShop', payload) as Promise<CreatorHubSyncJob>,
    listVideos: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:listVideos', shopId) as Promise<Array<CreatorHubVideo & { sampleId?: string }>>,
    listOrders: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:listOrders', shopId) as Promise<CreatorHubOrder[]>,
    listCrm: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:listCrm', shopId) as Promise<CreatorHubCrmRow[]>,
    saveProfile: (payload: { shopId: string; creatorId: string; tags?: string[]; note?: string; blocked?: boolean }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:saveProfile', payload) as Promise<CreatorHubCreatorProfile>,
    getOverview: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:getOverview', shopId) as Promise<CreatorHubOverview>,
    getSyncProgress: (id: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:getSyncProgress', id) as Promise<CreatorHubSyncProgress | null>,
    listSyncJobs: (id: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:listSyncJobs', id) as Promise<CreatorHubSyncJob[]>,
    listSamples: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:listSamples', shopId) as Promise<CreatorHubSample[]>,
    updateSample: (payload: { id: string; costOverride?: number | null; note?: string | null }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:updateSample', payload) as Promise<CreatorHubSample>,
    listCosts: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:listCosts', shopId) as Promise<CreatorHubProductCost[]>,
    saveCost: (payload: { shopId: string; productId: string; skuId?: string; productTitle?: string; unitCost: number; shippingCost?: number }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:saveCost', payload) as Promise<CreatorHubProductCost>,
    removeCost: (id: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:removeCost', id) as Promise<{ ok: true }>,
    getSettings: () => ipcRenderer.invoke('plugin:tiktokCreatorHub:getSettings') as Promise<CreatorHubSettings>,
    saveSettings: (payload: Partial<CreatorHubSettings>) => ipcRenderer.invoke('plugin:tiktokCreatorHub:saveSettings', payload) as Promise<CreatorHubSettings>,
    getFulfillment: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:getFulfillment', shopId) as Promise<CreatorHubFulfillmentReport>,
    discoverCreators: (payload: CreatorHubDiscoverQuery) => ipcRenderer.invoke('plugin:tiktokCreatorHub:discoverCreators', payload) as Promise<CreatorHubDiscoverResult>,
    listPool: (shopId?: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:listPool', shopId) as Promise<CreatorHubPoolRow[]>,
    setPoolStar: (payload: { ids: string[]; starred: boolean }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:setPoolStar', payload) as Promise<{ ok: true; count: number }>,
    removePool: (ids: string[]) => ipcRenderer.invoke('plugin:tiktokCreatorHub:removePool', ids) as Promise<{ ok: true; count: number }>,
    fetchContacts: (payload: { shopId: string; creators: Array<{ creatorId: string; handle: string }> }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:fetchContacts', payload) as Promise<CreatorHubFetchContactsResult>,
    saveContact: (payload: CreatorHubContactInput) => ipcRenderer.invoke('plugin:tiktokCreatorHub:saveContact', payload) as Promise<CreatorHubContact>,
    logContact: (payload: { shopId: string; creatorId: string; handle: string; channel: CreatorHubContactChannel; note?: string }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:logContact', payload) as Promise<CreatorHubContact>,
    listTemplates: () => ipcRenderer.invoke('plugin:tiktokCreatorHub:listTemplates') as Promise<CreatorHubMessageTemplate[]>,
    saveTemplate: (payload: { id?: string; name: string; body: string }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:saveTemplate', payload) as Promise<CreatorHubMessageTemplate[]>,
    removeTemplate: (id: string) => ipcRenderer.invoke('plugin:tiktokCreatorHub:removeTemplate', id) as Promise<CreatorHubMessageTemplate[]>,
    openCreatorBackend: (payload: { shopId: string; creatorId: string }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:openCreatorBackend', payload) as Promise<{ url: string; loggedIn: boolean }>,
    getCreatorDetail: (payload: { shopId: string; creatorId?: string; handle?: string }) => ipcRenderer.invoke('plugin:tiktokCreatorHub:getCreatorDetail', payload) as Promise<CreatorHubCreatorDetail>,
  },
  tiktokGmvMax: {
    getV2Workspace: (payload?: { storeId?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getV2Workspace', payload),
    saveV2Settings: (payload: { storeId?: string; marginPercent?: number | null; thresholds?: Record<string, number> }) => ipcRenderer.invoke('plugin:tiktokGmvMax:saveV2Settings', payload),
    recordV2Change: (payload: { campaignId: string; kind: 'roi' | 'budget' | 'products' | 'status' | 'other'; from?: number; to?: number; note?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:recordV2Change', payload),
    undoV2Change: (payload: { id: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:undoV2Change', payload),
    getDashboard: (payload?: { startDate?: string; endDate?: string; includeCreativeMetrics?: boolean }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getDashboard', payload),
    getCampaignWorkspace: (payload: { campaignId: string; startDate?: string; endDate?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getCampaignWorkspace', payload),
    getCampaignPage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignType?: string; status?: string; pacingState?: string; search?: string; minSpend?: number; minOrders?: number; minRoi?: number; minUtilization?: number; sortBy?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getCampaignPage', payload),
    getCreativePage: (payload?: { page?: number; pageSize?: number; startDate?: string; endDate?: string; storeId?: string; campaignId?: string; source?: string; state?: string; segment?: string; search?: string; minSpend?: number; minOrders?: number; minRoi?: number; maxCpa?: number; minCtr?: number; sortBy?: string; sortDirection?: 'asc' | 'desc' }) => ipcRenderer.invoke('plugin:tiktokGmvMax:getCreativePage', payload),
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
      return () => {
        ipcRenderer.off('plugin:tiktokGmvMax:syncProgress', handler)
      }
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
    pushCreativeChanges: (payload: { operation: 'REMOVE' | 'ADD'; items: Array<{ campaignId: string; creativeId: string; label?: string }> }) => ipcRenderer.invoke('plugin:tiktokGmvMax:pushCreativeChanges', payload),
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
    getAlerts: () => ipcRenderer.invoke('plugin:tiktokGmvMax:getAlerts'),
    applyManualChange: (payload: { campaignId: string; budget?: string | number; roasBid?: string | number; operationStatus?: string }) => ipcRenderer.invoke('plugin:tiktokGmvMax:applyManualChange', payload),
    applyManualChanges: (payload: { changes: Array<{ campaignId: string; budget?: string | number; roasBid?: string | number; operationStatus?: string }> }) => ipcRenderer.invoke('plugin:tiktokGmvMax:applyManualChanges', payload),
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
    listSummary: (payload?: { ids?: string[] }) => ipcRenderer.invoke('plugin:tiktokCreative:listSummary', payload),
    getTask: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:getTask', id),
    onChanged: (callback: (payload: { taskIds: string[] }) => void) => {
      const handler = (_event: unknown, payload: { taskIds: string[] }) => callback(payload)
      ipcRenderer.on('plugin:tiktokCreative:changed', handler)
      return () => {
        ipcRenderer.off('plugin:tiktokCreative:changed', handler)
      }
    },
    getSettings: () => ipcRenderer.invoke('plugin:tiktokCreative:getSettings'),
    saveSettings: (payload: { imageRetryLimit?: number; qualityCheckerEnabled?: boolean }) => ipcRenderer.invoke('plugin:tiktokCreative:saveSettings', payload),
    listAccounts: () => ipcRenderer.invoke('plugin:tiktokCreative:listAccounts'),
    listPromptVersions: (kind: 'image' | 'video' = 'video') => ipcRenderer.invoke('plugin:tiktokCreative:listPromptVersions', kind),
    createPromptVersion: (payload: { name: string; prompt: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:tiktokCreative:createPromptVersion', payload),
    updatePromptVersion: (payload: { id: string; name: string; prompt: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:tiktokCreative:updatePromptVersion', payload),
    activatePromptVersion: (payload: { id: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:tiktokCreative:activatePromptVersion', payload),
    rollbackPromptVersion: (payload: { id: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:tiktokCreative:rollbackPromptVersion', payload),
    importAccount: (payload: { id?: string; name: string; cookieJson: string }) => ipcRenderer.invoke('plugin:tiktokCreative:importAccount', payload),
    updateAccount: (payload: { id: string; name?: string; enabled?: boolean; priority?: number }) => ipcRenderer.invoke('plugin:tiktokCreative:updateAccount', payload),
    testAccount: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:testAccount', id),
    removeAccount: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:removeAccount', id),
    createFromReference: (payload: { referenceImagePaths: string[]; productId: string; prompt?: string; promptKind?: 'image' | 'video'; promptVersionId?: string; durationSec?: number; mode?: 'reference_to_video' | 'image_to_video'; zoomPercent?: number }) => ipcRenderer.invoke('plugin:tiktokCreative:createFromReference', payload),
    retryShot: (payload: {
      id: string
      shotId: string
      replacementRegion?: { x: number; y: number; width: number; height: number }
      retryMode?: 'auto' | 'manual_once'
    }) => ipcRenderer.invoke('plugin:tiktokCreative:retryShot', payload),
    continueWithVideo: (payload: { id: string; shotId: string }) => ipcRenderer.invoke('plugin:tiktokCreative:continueWithVideo', payload),
    exportItems: (payload: { taskId: string; shotIds: string[]; outputDir: string }) => ipcRenderer.invoke('plugin:tiktokCreative:exportItems', payload),
    removeShot: (payload: { taskId: string; shotId: string }) => ipcRenderer.invoke('plugin:tiktokCreative:removeShot', payload),
    generateSubtitles: (payload: { items: Array<{ taskId: string; shotId: string }>; titleText?: string; titleConfig?: { strategy?: 'single_for_all' | 'random_pool'; singleText?: string; titlePool?: string[] }; captionStyle?: Record<string, unknown>; overlayImageConfig?: Record<string, unknown>; layoutPolicy?: Record<string, unknown> }) => ipcRenderer.invoke('plugin:tiktokCreative:generateSubtitles', payload),
    revertSubtitles: (payload: { taskId: string; shotId: string }) => ipcRenderer.invoke('plugin:tiktokCreative:revertSubtitles', payload),
    revertSubtitlesBatch: (payload: { items: Array<{ taskId: string; shotId: string }> }) => ipcRenderer.invoke('plugin:tiktokCreative:revertSubtitlesBatch', payload),
    remove: (id: string) => ipcRenderer.invoke('plugin:tiktokCreative:remove', id),
  },
  tiktokPublisher: {
    credentialStatus: () => ipcRenderer.invoke('plugin:tiktokPublisher:credentialStatus'),
    saveCredential: (key: string) => ipcRenderer.invoke('plugin:tiktokPublisher:saveCredential', key),
    clearCredential: () => ipcRenderer.invoke('plugin:tiktokPublisher:clearCredential'),
    testCredential: () => ipcRenderer.invoke('plugin:tiktokPublisher:testCredential'),
    connections: () => ipcRenderer.invoke('plugin:tiktokPublisher:connections'),
    products: (connection?: string) => ipcRenderer.invoke('plugin:tiktokPublisher:products', connection),
    productsPage: (connection?: string, options?: { pageSize?: number; pageToken?: string; query?: string; includeTotal?: boolean }) => ipcRenderer.invoke('plugin:tiktokPublisher:productsPage', connection, options),
    music: (query: string, connection?: string) => ipcRenderer.invoke('plugin:tiktokPublisher:music', query, connection),
    listTasks: () => ipcRenderer.invoke('plugin:tiktokPublisher:listTasks'),
    removeTask: (id: string) => ipcRenderer.invoke('plugin:tiktokPublisher:removeTask', id),
    updateTask: (id: string, patch: Record<string, unknown>) => ipcRenderer.invoke('plugin:tiktokPublisher:updateTask', id, patch),
    createDrafts: (payload: { items: Array<{ taskId: string; shotId: string }>; defaults?: Record<string, unknown> }) => ipcRenderer.invoke('plugin:tiktokPublisher:createDrafts', payload),
    createDraftsFromPaths: (payload: { paths: string[]; defaults?: Record<string, unknown> }) => ipcRenderer.invoke('plugin:tiktokPublisher:createDraftsFromPaths', payload),
    precheck: (ids: string[]) => ipcRenderer.invoke('plugin:tiktokPublisher:precheck', ids),
    submit: (ids: string[]) => ipcRenderer.invoke('plugin:tiktokPublisher:submit', ids),
    refresh: () => ipcRenderer.invoke('plugin:tiktokPublisher:refresh'),
  },
  livePhoto: {
    list: () => ipcRenderer.invoke('plugin:livePhoto:list'),
    listSummaries: (payload?: { page?: number; pageSize?: number; filter?: 'all' | 'failed' | 'running' | 'paused' | 'success_not_exported' | 'success_exported' | 'success_not_subtitled' }) => ipcRenderer.invoke('plugin:livePhoto:listSummaries', payload),
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
      retryLimit?: number
    }) => ipcRenderer.invoke('plugin:livePhoto:saveSettings', payload),
    listPromptVersions: (kind: 'image' | 'video' = 'image') => ipcRenderer.invoke('plugin:livePhoto:listPromptVersions', kind),
    createPromptVersion: (payload: { name: string; prompt: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:livePhoto:createPromptVersion', payload),
    updatePromptVersion: (payload: { id: string; name: string; prompt: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:livePhoto:updatePromptVersion', payload),
    activatePromptVersion: (payload: { id: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:livePhoto:activatePromptVersion', payload),
    rollbackPromptVersion: (payload: { id: string; kind?: 'image' | 'video' }) => ipcRenderer.invoke('plugin:livePhoto:rollbackPromptVersion', payload),
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
    revertSubtitleVideosFromItems: (payload: { ids: string[] }) => ipcRenderer.invoke('plugin:livePhoto:revertSubtitleVideosFromItems', payload),
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
      retryMode?: 'auto' | 'manual_once'
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
    continueWithVideo: (payload: { id: string; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      ipcRenderer.invoke('plugin:livePhoto:continueWithVideo', payload),
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
    confirmStep: (payload: { runId: string; stepId: string }) => ipcRenderer.invoke('agentOs:confirmStep', payload),
    estimateRun: (runId: string) => ipcRenderer.invoke('agentOs:estimateRun', runId),
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
      return () => {
        ipcRenderer.off('agentOs:event', handler)
      }
    },
  },

  videoWatermark: {
    getState: () => ipcRenderer.invoke('videoWatermark:getState'),
    start: (payload: { videoPaths: string[]; settings: Record<string, unknown>; outputDir?: string; archiveToLibrary?: boolean }) => ipcRenderer.invoke('videoWatermark:start', payload),
    retryFailed: (batchId: string) => ipcRenderer.invoke('videoWatermark:retryFailed', batchId),
    removeBatch: (batchId: string) => ipcRenderer.invoke('videoWatermark:removeBatch', batchId),
    preview: (settings: Record<string, unknown>) => ipcRenderer.invoke('videoWatermark:preview', settings),
    onChanged: (callback: (batch: any) => void) => {
      const handler = (_event: unknown, batch: any) => callback(batch)
      ipcRenderer.on('videoWatermark:changed', handler)
      return () => {
        ipcRenderer.off('videoWatermark:changed', handler)
      }
    },
  },

  contentHub: {
    listContent: (payload?: { productId?: string; line?: string; status?: string; limit?: number }) => ipcRenderer.invoke('contentHub:listContent', payload),
    recentProjects: (limit?: number) => ipcRenderer.invoke('contentHub:recentProjects', limit),
    productOverview: (productId: string) => ipcRenderer.invoke('contentHub:productOverview', productId),
    linkProductChannels: (payload: { productId: string; tiktokProductIds: string[] }) => ipcRenderer.invoke('contentHub:linkProductChannels', payload) as Promise<{ tiktokProductIds: string[] }>,
    linkContentPerformance: (payload: { ref: string; creativeId: string; creativeName?: string }) => ipcRenderer.invoke('contentHub:linkContentPerformance', payload),
    unlinkContentPerformance: (ref: string) => ipcRenderer.invoke('contentHub:unlinkContentPerformance', ref) as Promise<{ ok: boolean }>,
    listReviews: (payload?: { decision?: string; line?: string; productId?: string }) => ipcRenderer.invoke('contentHub:listReviews', payload),
    reviewCounts: () => ipcRenderer.invoke('contentHub:reviewCounts'),
    decideReview: (payload: { ref: string; decision: 'approved' | 'redo' | 'discarded'; reason?: string; note?: string }) => ipcRenderer.invoke('contentHub:decideReview', payload),
    reopenReview: (ref: string) => ipcRenderer.invoke('contentHub:reopenReview', ref),
    lineageFor: (ref: string) => ipcRenderer.invoke('contentHub:lineageFor', ref),
    getBrandMemory: () => ipcRenderer.invoke('contentHub:getBrandMemory'),
    saveBrand: (payload: any) => ipcRenderer.invoke('contentHub:saveBrand', payload),
    getProductMemory: (productId: string) => ipcRenderer.invoke('contentHub:getProductMemory', productId),
    saveProductMemory: (payload: any) => ipcRenderer.invoke('contentHub:saveProductMemory', payload),
    removeFeedback: (id: string) => ipcRenderer.invoke('contentHub:removeFeedback', id),
    healthCheck: (force?: boolean) => ipcRenderer.invoke('contentHub:healthCheck', force),
    insights: (rangeDays?: number) => ipcRenderer.invoke('contentHub:insights', rangeDays),
    latestBriefs: () => ipcRenderer.invoke('contentHub:latestBriefs'),
    generateBrief: (kind: 'daily' | 'weekly') => ipcRenderer.invoke('contentHub:generateBrief', kind),
    listBriefs: (limit?: number) => ipcRenderer.invoke('contentHub:listBriefs', limit),
    getAutomationSettings: () => ipcRenderer.invoke('contentHub:getAutomationSettings'),
    saveAutomationSettings: (payload: any) => ipcRenderer.invoke('contentHub:saveAutomationSettings', payload),
    testFeishuPush: (payload?: { webhookUrl?: string; secret?: string }) => ipcRenderer.invoke('contentHub:testFeishuPush', payload),
    pushLatestBrief: (kind: 'daily' | 'weekly') => ipcRenderer.invoke('contentHub:pushLatestBrief', kind),
    importProductFromLink: (payload: { url: string; name?: string; type?: string }) => ipcRenderer.invoke('contentHub:importProductFromLink', payload),
    onChanged: (callback: (payload: { kind: string; counts?: { pending: number; approved: number; redo: number; discarded: number } }) => void) => {
      const handler = (_event: unknown, payload: any) => callback(payload)
      ipcRenderer.on('contentHub:changed', handler)
      return () => {
        ipcRenderer.off('contentHub:changed', handler)
      }
    },
  },

  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    upsert: (payload: any) => ipcRenderer.invoke('templates:upsert', payload),
    remove: (id: string) => ipcRenderer.invoke('templates:remove', id),
    /** 导入一条视频，AI 识别分镜结构，返回模板草稿（不会自动保存） */
    analyzeVideo: (payload: { videoPath: string; locale?: string }) =>
      ipcRenderer.invoke('templates:analyzeVideo', payload) as Promise<
        import('../main/modules/templates/analyzeVideoTemplate').VideoTemplateDraft
      >,
  },

  mixStudio: {
    listFormulas: () => ipcRenderer.invoke('mixStudio:listFormulas') as Promise<import('../shared/mixFormula').MixFormula[]>,
    saveFormula: (formula: Partial<import('../shared/mixFormula').MixFormula> & { name: string; beats: import('../shared/mixFormula').FormulaBeat[] }) =>
      ipcRenderer.invoke('mixStudio:saveFormula', formula) as Promise<import('../shared/mixFormula').MixFormula>,
    removeFormula: (formulaId: string) => ipcRenderer.invoke('mixStudio:removeFormula', formulaId) as Promise<{ ok: boolean }>,
    formulaFromReference: (payload?: { name?: string }) =>
      ipcRenderer.invoke('mixStudio:formulaFromReference', payload) as Promise<import('../shared/mixFormula').MixFormula | null>,
    preview: (input: import('../shared/mixFormula').MixJobInput) =>
      ipcRenderer.invoke('mixStudio:preview', input) as Promise<import('../shared/mixFormula').MixPreviewResult>,
    enqueue: (payload: { input: import('../shared/mixFormula').MixJobInput; drafts: import('../shared/mixFormula').MixDraft[] }) =>
      ipcRenderer.invoke('mixStudio:enqueue', payload) as Promise<{ enqueued: number; skipped: number }>,
    ledger: (productId?: string) => ipcRenderer.invoke('mixStudio:ledger', productId) as Promise<import('../shared/mixInsights').MixLedgerEntry[]>,
    insights: (productId?: string) => ipcRenderer.invoke('mixStudio:insights', productId) as Promise<import('../shared/mixInsights').MixInsights>,
    refreshPerformance: () => ipcRenderer.invoke('mixStudio:refreshPerformance') as Promise<import('../shared/mixInsights').MixRefreshResult>,
    listCreatives: () => ipcRenderer.invoke('mixStudio:listCreatives') as Promise<import('../shared/mixInsights').MixCreativeOption[]>,
    linkCreative: (payload: { entryId: string; creativeId: string | null }) =>
      ipcRenderer.invoke('mixStudio:linkCreative', payload) as Promise<import('../shared/mixInsights').MixLedgerEntry | null>,
    sendToPublish: (entryIds: string[]) => ipcRenderer.invoke('mixStudio:sendToPublish', entryIds) as Promise<{ created: number }>,
    removeLedgerEntry: (entryId: string) => ipcRenderer.invoke('mixStudio:removeLedgerEntry', entryId) as Promise<void>,
  },
  mixPool: {
    overview: (productId: string) =>
      ipcRenderer.invoke('mixPool:overview', productId) as Promise<import('../shared/mixPool').MixPoolOverview & { running: boolean }>,
    syncLinked: (productId: string) => ipcRenderer.invoke('mixPool:syncLinked', productId) as Promise<{ added: number; found: number; scan: Record<'product_asset' | 'clone_output' | 'creative_studio' | 'live_photo', number> }>,
    importFiles: (payload: { productId: string; origin: import('../shared/mixPool').ClipOrigin }) =>
      ipcRenderer.invoke('mixPool:importFiles', payload) as Promise<{ added: number; skipped: number }>,
    process: (productId: string) => ipcRenderer.invoke('mixPool:process', productId) as Promise<{ started: boolean }>,
    retag: (payload: { productId: string; clipIds?: string[] }) => ipcRenderer.invoke('mixPool:retag', payload) as Promise<{ started: boolean }>,
    resplitSource: (payload: { productId: string; sourceId: string }) => ipcRenderer.invoke('mixPool:resplitSource', payload),
    updateClip: (payload: { id: string; roleOverride?: import('../shared/mixPool').ClipRole | null; disabled?: boolean }) =>
      ipcRenderer.invoke('mixPool:updateClip', payload) as Promise<import('../shared/mixPool').PoolClip | null>,
    setSourceOrigin: (payload: { sourceId: string; origin: import('../shared/mixPool').ClipOrigin }) => ipcRenderer.invoke('mixPool:setSourceOrigin', payload),
    removeSource: (sourceId: string) => ipcRenderer.invoke('mixPool:removeSource', sourceId) as Promise<{ ok: boolean }>,
    onProgress: (callback: (p: import('../shared/mixPool').MixPoolProgress) => void) => {
      const handler = (_event: unknown, p: import('../shared/mixPool').MixPoolProgress) => callback(p)
      ipcRenderer.on('mixPool:progress', handler)
      return () => {
        ipcRenderer.off('mixPool:progress', handler)
      }
    },
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
      return () => {
        ipcRenderer.off('tasks:event', handler)
      }
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
      return () => {
        ipcRenderer.off('updater:update-downloaded', handler)
      }
    },
  },

  /** 商品库、模特库与手机 App 经云端同步 */
  cloudSync: {
    status: () => ipcRenderer.invoke('cloudSync:status') as Promise<CloudSyncStatus>,
    run: () => ipcRenderer.invoke('cloudSync:run') as Promise<CloudSyncStatus>,
  },
  cloud: {
    getStatus: () => ipcRenderer.invoke('cloud:getStatus') as Promise<CloudLicenseStatus>,
    refresh: () => ipcRenderer.invoke('cloud:refresh') as Promise<CloudLicenseStatus>,
    login: (input: { account: string; password: string }) => ipcRenderer.invoke('cloud:login', input) as Promise<CloudIpcResult<CloudAuthResult>>,
    register: (input: { account: string; password: string; displayName?: string }) =>
      ipcRenderer.invoke('cloud:register', input) as Promise<CloudIpcResult<CloudAuthResult>>,
    logout: () => ipcRenderer.invoke('cloud:logout') as Promise<CloudIpcResult<{ status: CloudLicenseStatus }>>,
    me: () => ipcRenderer.invoke('cloud:me') as Promise<CloudIpcResult<CloudMeResponse>>,
    unbindDevice: (deviceId: string) =>
      ipcRenderer.invoke('cloud:unbindDevice', deviceId) as Promise<CloudIpcResult<{ devices: CloudDevice[]; activation: CloudActivation; status: CloudLicenseStatus }>>,
    listPlans: () => ipcRenderer.invoke('cloud:listPlans') as Promise<CloudIpcResult<CloudPlansResponse>>,
    createOrder: (input: { planCode: string; channel: CloudPayChannel }) =>
      ipcRenderer.invoke('cloud:createOrder', input) as Promise<CloudIpcResult<{ order: CloudOrder }>>,
    getOrder: (orderNo: string) => ipcRenderer.invoke('cloud:getOrder', orderNo) as Promise<CloudIpcResult<{ order: CloudOrder; status: CloudLicenseStatus }>>,
    mockPay: (orderNo: string) => ipcRenderer.invoke('cloud:mockPay', orderNo) as Promise<CloudIpcResult<{ order: CloudOrder; status: CloudLicenseStatus }>>,
    listOrders: () => ipcRenderer.invoke('cloud:listOrders') as Promise<CloudIpcResult<CloudPage<CloudOrder>>>,
    redeem: (code: string) =>
      ipcRenderer.invoke('cloud:redeem', code) as Promise<CloudIpcResult<{ status: CloudLicenseStatus; redeemed: CloudRedeemResult['redeemed']; credits: number }>>,
    credits: (page?: number) => ipcRenderer.invoke('cloud:credits', page) as Promise<CloudIpcResult<CreditsResponse>>,
    getConfig: () => ipcRenderer.invoke('cloud:getConfig') as Promise<CloudIpcResult<{ values: Record<string, unknown>; version: string }>>,
    onStatusChanged: (handler: (status: CloudLicenseStatus) => void) => {
      const listener = (_event: unknown, status: CloudLicenseStatus) => handler(status)
      ipcRenderer.on('cloud:statusChanged', listener)
      return () => {
        ipcRenderer.off('cloud:statusChanged', listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api

