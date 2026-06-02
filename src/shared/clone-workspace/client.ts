import type { createWebApiClient } from '../web-api/client'
import type { CloneRuntimeResponse } from '../web-api/types'

export type CloneWorkspaceTaskOwnership = 'web' | 'local' | 'unknown'

export type CloneWorkspaceErrorCode =
  | 'UNAUTHORIZED_TASK'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'PIPELINE_ERROR'
  | 'TRANSPORT_ERROR'

export type CloneWorkspaceError = Error & {
  code: CloneWorkspaceErrorCode
  cause?: unknown
}

export type CloneWorkspaceProjectResponse<TProject> = {
  project?: TProject | null
  executionMode?: 'background_dispatched' | 'blocking_completed'
}

export type CloneWorkspaceAssetResponse<TProject> = CloneWorkspaceProjectResponse<TProject> & {
  asset?: unknown
  assets?: unknown[]
}

export type CloneWorkspaceStoryboardResponse<TProject> = CloneWorkspaceProjectResponse<TProject> & {
  queueSummary?: { total: number; done: number; failed: number; skipped: number }
  imageProvider?: string
  imageModel?: string
}

export type CloneWorkspaceShotVideoResponse<TProject> = CloneWorkspaceProjectResponse<TProject> & {
  queueSummary?: {
    total: number
    done: number
    failed: number
    skipped: number
    pending?: number
    timeout?: number
    creating?: number
    remoteRunning?: number
    downloading?: number
    retryableFailed?: number
    submitActive?: number
    pollActive?: number
    downloadActive?: number
    submitQueued?: number
    pollQueued?: number
    downloadQueued?: number
  }
  failureBreakdown?: {
    missingTask?: number
    remoteTimeout?: number
    downloadFailed?: number
    remoteFailed?: number
    localFailed?: number
  }
}

export type CloneWorkspaceShotVideoSyncResponse<TProject> = CloneWorkspaceProjectResponse<TProject> & {
  task?: { taskId?: string; status?: string; errorMessage?: string }
  synced?: boolean
}

export type CloneWorkspaceUpdateShotInput = {
  locked?: boolean
  scriptText?: string
  narrationText?: string
  onScreenText?: string
  visualDescription?: string
  actionDescription?: string
  cameraDescription?: string
  durationSec?: number
  cameraMovement?: string
  subtitleSuggestion?: string
  materialNeed?: string
  order?: number
}

export type CloneWorkspaceReferenceVideoUploadInput = {
  fileName: string
  base64Data?: string
  mimeType?: string
  localFilePath?: string
}

export type CloneWorkspaceProductImageUploadFile = {
  fileName: string
  base64Data?: string
  mimeType?: string
  localFilePath?: string
}

export type CloneWorkspaceProductImageUploadInput = {
  files: CloneWorkspaceProductImageUploadFile[]
}

export type CloneWorkspaceBindProductInput = {
  productId: string
}

export interface CloneWorkspaceClient<TProject = any> {
  getOwnership(projectId?: string): Promise<CloneWorkspaceTaskOwnership>
  getProject(projectId: string): Promise<CloneWorkspaceProjectResponse<TProject>>
  getRuntime(projectId: string): Promise<CloneRuntimeResponse | null>
  uploadReferenceVideo(
    projectId: string,
    input: CloneWorkspaceReferenceVideoUploadInput,
  ): Promise<CloneWorkspaceAssetResponse<TProject>>
  saveProductImages(
    projectId: string,
    input: { productReferenceImagePaths?: string[] },
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  bindProduct(
    projectId: string,
    input: CloneWorkspaceBindProductInput,
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  uploadProductImages(
    projectId: string,
    input: CloneWorkspaceProductImageUploadInput,
  ): Promise<CloneWorkspaceAssetResponse<TProject>>
  selectModelIdentity(
    projectId: string,
    input: { identityId: string },
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  analyzeReference(
    projectId: string | undefined,
    input: { videoPath: string; locale?: 'zh-CN' | 'vi-VN' },
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  generateScriptVariants(
    projectId: string,
    input: { variantCount: number },
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  selectScriptVariant(
    projectId: string,
    input: { variantId: string },
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  generateStoryboardImages(
    projectId: string,
    input: { productReferenceImagePaths?: string[]; selectedModelIdentityId?: string },
  ): Promise<CloneWorkspaceStoryboardResponse<TProject>>
  batchQueryStoryboardImages(
    projectId: string,
    input: { productReferenceImagePaths?: string[]; shotIds?: string[] },
  ): Promise<CloneWorkspaceStoryboardResponse<TProject>>
  regenerateStoryboardImage(
    projectId: string,
    shotId: string,
    input: { productReferenceImagePaths?: string[]; selectedModelIdentityId?: string },
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  generateShotVideos(projectId: string): Promise<CloneWorkspaceShotVideoResponse<TProject>>
  syncShotVideoTask(
    projectId: string,
    shotId: string,
  ): Promise<CloneWorkspaceShotVideoSyncResponse<TProject>>
  forceDownloadShotVideoResult(
    projectId: string,
    shotId: string,
  ): Promise<CloneWorkspaceShotVideoSyncResponse<TProject>>
  regenerateShotVideo(
    projectId: string,
    shotId: string,
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  composeFinalVideo(
    projectId: string,
    input?: { outputDir?: string },
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
  updateShot(
    projectId: string,
    shotId: string,
    input: CloneWorkspaceUpdateShotInput,
  ): Promise<CloneWorkspaceProjectResponse<TProject>>
}

export function normalizeCloneWorkspaceError(error: unknown): CloneWorkspaceError {
  if (error instanceof Error && 'code' in error) {
    return error as CloneWorkspaceError
  }
  const message = String((error as Error)?.message ?? error ?? '未知错误')
  const normalized = new Error(message) as CloneWorkspaceError
  normalized.cause = error
  if (message.includes('无权访问该任务')) {
    normalized.code = 'UNAUTHORIZED_TASK'
  } else if (message.includes('不存在') || message.includes('已删除') || message.includes('not found')) {
    normalized.code = 'NOT_FOUND'
  } else if (message.includes('参数') || message.includes('请先') || message.includes('校验')) {
    normalized.code = 'VALIDATION_ERROR'
  } else if (message.includes('生成失败') || message.includes('合成失败') || message.includes('pipeline')) {
    normalized.code = 'PIPELINE_ERROR'
  } else {
    normalized.code = 'TRANSPORT_ERROR'
  }
  return normalized
}

export function createWebCloneWorkspaceClient<TProject = any>(
  apiClient: ReturnType<typeof createWebApiClient>,
): CloneWorkspaceClient<TProject> {
  const wrap = async <T>(runner: () => Promise<T>) => {
    try {
      return await runner()
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  }

  return {
    async getOwnership() {
      return 'web'
    },
    async getProject(projectId) {
      return await wrap(async () => {
        const result = await apiClient.getCloneProject(projectId)
        return { project: (result?.project || null) as TProject | null }
      })
    },
    async getRuntime(projectId) {
      return await wrap(async () => await apiClient.getCloneRuntime(projectId))
    },
    async uploadReferenceVideo(projectId, input) {
      return await wrap(async () => {
        if (!input.base64Data) {
          throw new Error('Web 任务上传参考视频缺少 base64Data')
        }
        return await apiClient.uploadCloneReferenceVideo(projectId, {
          fileName: input.fileName,
          base64Data: input.base64Data,
          mimeType: input.mimeType,
        })
      })
    },
    async saveProductImages(projectId, input) {
      return await wrap(async () => await apiClient.saveCloneProjectProductImages(projectId, input))
    },
    async bindProduct(projectId, input) {
      return await wrap(async () => await apiClient.bindCloneProjectProduct(projectId, input))
    },
    async uploadProductImages(projectId, input) {
      return await wrap(async () => {
        const files = input.files.map((item) => {
          if (!item.base64Data) {
            throw new Error(`Web 任务上传商品图缺少 base64Data: ${item.fileName}`)
          }
          return {
            fileName: item.fileName,
            base64Data: item.base64Data,
            mimeType: item.mimeType,
          }
        })
        return await apiClient.uploadCloneProductImages(projectId, { files })
      })
    },
    async selectModelIdentity(projectId, input) {
      return await wrap(async () => await apiClient.selectCloneProjectModelIdentity(projectId, input))
    },
    async analyzeReference(projectId, input) {
      return await wrap(async () => {
        if (!projectId) throw new Error('Web 任务缺少 projectId，无法分析参考视频')
        return await apiClient.analyzeCloneReference(projectId, input)
      })
    },
    async generateScriptVariants(projectId, input) {
      return await wrap(async () => await apiClient.generateCloneScriptVariants(projectId, input))
    },
    async selectScriptVariant(projectId, input) {
      return await wrap(async () => await apiClient.selectCloneScriptVariant(projectId, input))
    },
    async generateStoryboardImages(projectId, input) {
      return await wrap(async () => await apiClient.generateStoryboardImages(projectId, input))
    },
    async batchQueryStoryboardImages(projectId, input) {
      return await wrap(async () =>
        await apiClient.generateStoryboardImages(projectId, {
          productReferenceImagePaths: input.productReferenceImagePaths,
          shotIds: input.shotIds,
          onlyMissing: true,
        }),
      )
    },
    async regenerateStoryboardImage(projectId, shotId, input) {
      return await wrap(async () => await apiClient.regenerateStoryboardImage(projectId, shotId, input))
    },
    async generateShotVideos(projectId) {
      return await wrap(async () => await apiClient.generateCloneShotVideos(projectId))
    },
    async syncShotVideoTask(projectId, shotId) {
      return await wrap(async () => await apiClient.syncCloneShotVideoTask(projectId, shotId))
    },
    async forceDownloadShotVideoResult(projectId, shotId) {
      return await wrap(async () => await apiClient.syncCloneShotVideoTask(projectId, shotId))
    },
    async regenerateShotVideo(projectId, shotId) {
      return await wrap(async () => await apiClient.regenerateCloneShotVideo(projectId, shotId))
    },
    async composeFinalVideo(projectId, input) {
      return await wrap(async () => await apiClient.composeCloneFinalVideo(projectId, input))
    },
    async updateShot(projectId, shotId, input) {
      return await wrap(async () => await apiClient.updateCloneShot(projectId, shotId, input))
    },
  }
}
