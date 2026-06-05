import {
  createWebCloneWorkspaceClient,
  normalizeCloneWorkspaceError,
  type CloneWorkspaceClient,
  type CloneWorkspaceProductImageUploadInput,
  type CloneWorkspaceProjectResponse,
  type CloneWorkspaceReferenceVideoUploadInput,
  type CloneWorkspaceTaskOwnership,
  type CloneWorkspaceUpdateShotInput,
} from '../../../shared/clone-workspace/client'
import type { CloneRuntimeResponse } from '../../../shared/web-api/types'
import { getStoredWebToken, webApiClient } from './webApiClient'

type CloneProjectSummaryLike = {
  id: string
  sourceType?: string
  ownership?: string
  ownerUserId?: string
}

function mapOwnership(value: unknown): CloneWorkspaceTaskOwnership {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'web') return 'web'
  if (normalized === 'local') return 'local'
  return 'unknown'
}

function ownershipFromProject(project: any): CloneWorkspaceTaskOwnership {
  const explicit =
    mapOwnership(project?.ownership) ||
    mapOwnership(project?.sourceType) ||
    mapOwnership(project?.meta?.ownership) ||
    mapOwnership(project?.runtimeMeta?.ownership)
  if (explicit !== 'unknown') return explicit
  if (project?.ownerUserId || project?.webOwnerUserId || project?.webProjectId) return 'web'
  return 'unknown'
}

function resolveDesktopProject(project: any) {
  return { project: (project || null) as any }
}

const desktopClient: CloneWorkspaceClient<any> = {
  async getOwnership(projectId) {
    if (!projectId) return 'unknown'
    try {
      const summary = (await window.api.clone.getProjectSummary({
        cloneProjectId: projectId,
      })) as CloneProjectSummaryLike | null
      if (!summary?.id) return 'unknown'
      const mapped = mapOwnership(summary?.ownership || summary?.sourceType)
      if (mapped !== 'unknown') return mapped
      if (summary?.ownerUserId) return 'web'
      return 'local'
    } catch {
      return 'unknown'
    }
  },
  async getProject(projectId) {
    try {
      const project = await window.api.clone.getProject({ cloneProjectId: projectId })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async getRuntime(projectId) {
    try {
      const pipeline = (await window.api.clone.getClonePipelineStatus({
        cloneProjectId: projectId,
      })) as unknown
      return { pipeline } as CloneRuntimeResponse
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async uploadReferenceVideo(projectId, input) {
    try {
      if (input.localFilePath) {
        const result = (await window.api.clone.bindProjectReferenceVideo({
          cloneProjectId: projectId,
          videoPath: input.localFilePath,
        })) as { project?: any }
        return result
      }
      throw new Error('本地任务上传参考视频缺少 localFilePath')
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async saveProductImages(projectId, input) {
    try {
      const project = await window.api.clone.saveProjectProductImages({
        cloneProjectId: projectId,
        productReferenceImagePaths: input.productReferenceImagePaths,
      })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async bindProduct(projectId, input) {
    try {
      const project = await window.api.clone.bindProjectProduct({
        cloneProjectId: projectId,
        productId: input.productId,
      })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async uploadProductImages(projectId, input) {
    try {
      const productReferenceImagePaths = input.files
        .map((item) => String(item.localFilePath || '').trim())
        .filter(Boolean)
      const project = await window.api.clone.saveProjectProductImages({
        cloneProjectId: projectId,
        productReferenceImagePaths,
      })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async selectModelIdentity(projectId, input) {
    try {
      const project = await window.api.clone.selectProjectModelIdentity({
        cloneProjectId: projectId,
        identityId: input.identityId,
      })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async analyzeReference(projectId, input) {
    try {
      const result = (await window.api.clone.createBlueprint({
        cloneProjectId: projectId,
        videoPath: input.videoPath,
        locale: input.locale || 'zh-CN',
        strength: 'structure',
      })) as { project?: any }
      return result
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async generateScriptVariants(projectId, input) {
    try {
      return (await window.api.clone.generateScriptVariants({
        cloneProjectId: projectId,
        variantCount: input.variantCount,
      })) as CloneWorkspaceProjectResponse<any>
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async selectScriptVariant(projectId, input) {
    try {
      return (await window.api.clone.selectScriptVariant({
        cloneProjectId: projectId,
        variantId: input.variantId,
      })) as CloneWorkspaceProjectResponse<any>
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async generateStoryboardImages(projectId, input) {
    try {
      return await window.api.clone.generateStoryboardGrids({
        cloneProjectId: projectId,
        productReferenceImagePaths: input.productReferenceImagePaths,
        selectedModelIdentityId: input.selectedModelIdentityId,
      })
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async batchQueryStoryboardImages(projectId, input) {
    try {
      return await window.api.clone.generateAllShotFrames({
        cloneProjectId: projectId,
        onlyMissing: true,
        shotIds: input.shotIds,
        productReferenceImagePaths: input.productReferenceImagePaths,
      })
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async regenerateStoryboardImage(projectId, shotId, input) {
    try {
      const project = await window.api.clone.generateGptShotFrames({
        cloneProjectId: projectId,
        shotId,
        which: 'start',
        forceRegenerate: true,
        productReferenceImagePaths: input.productReferenceImagePaths,
        selectedModelIdentityId: input.selectedModelIdentityId,
      })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async generateShotVideos(projectId) {
    try {
      return await window.api.clone.generateShotVideosFromStoryboard({
        cloneProjectId: projectId,
      })
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async syncShotVideoTask(projectId, shotId) {
    try {
      return await window.api.clone.syncShotVideoTask({
        cloneProjectId: projectId,
        shotId,
      })
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async forceDownloadShotVideoResult(projectId, shotId) {
    try {
      return await window.api.clone.forceDownloadShotVideoResult({
        cloneProjectId: projectId,
        shotId,
      })
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async regenerateShotVideo(projectId, shotId) {
    try {
      const project = await window.api.clone.generateShotClip({
        cloneProjectId: projectId,
        shotId,
        forceRegenerate: true,
      })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async composeFinalVideo(projectId, input) {
    try {
      return (await window.api.clone.composeCloneVideo({
        cloneProjectId: projectId,
        outputDir: input?.outputDir,
      })) as CloneWorkspaceProjectResponse<any>
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
  async updateShot(projectId, shotId, input) {
    try {
      const project = await window.api.clone.updateShotEnhanced({
        cloneProjectId: projectId,
        shotId,
        ...input,
      })
      return resolveDesktopProject(project)
    } catch (error) {
      throw normalizeCloneWorkspaceError(error)
    }
  },
}

const webClient = createWebCloneWorkspaceClient(webApiClient)

export type ResolvedCloneWorkspaceClient<TProject = any> = {
  client: CloneWorkspaceClient<TProject>
  ownership: CloneWorkspaceTaskOwnership
  channel: 'web-api' | 'electron-ipc'
}

export async function resolveCloneWorkspaceClient<TProject = any>(
  projectId?: string,
): Promise<ResolvedCloneWorkspaceClient<TProject>> {
  const token = getStoredWebToken()
  if (!token) {
    return { client: desktopClient as CloneWorkspaceClient<TProject>, ownership: 'local', channel: 'electron-ipc' }
  }

  if (projectId) {
    try {
      const ownership = await desktopClient.getOwnership(projectId)
      if (ownership === 'web') {
        return { client: webClient as CloneWorkspaceClient<TProject>, ownership, channel: 'web-api' }
      }
      return {
        client: desktopClient as CloneWorkspaceClient<TProject>,
        ownership: ownership === 'unknown' ? 'local' : ownership,
        channel: 'electron-ipc',
      }
    } catch {
      return { client: desktopClient as CloneWorkspaceClient<TProject>, ownership: 'local', channel: 'electron-ipc' }
    }
  }

  return { client: desktopClient as CloneWorkspaceClient<TProject>, ownership: 'local', channel: 'electron-ipc' }
}

export async function resolveWebCloneWorkspaceClient<TProject = any>() {
  return {
    client: webClient as CloneWorkspaceClient<TProject>,
    ownership: 'web' as const,
    channel: 'web-api' as const,
  }
}

export type CloneWorkspaceUploadPayload = CloneWorkspaceReferenceVideoUploadInput
export type CloneWorkspaceProductUploadPayload = CloneWorkspaceProductImageUploadInput
export type CloneWorkspaceShotUpdatePayload = CloneWorkspaceUpdateShotInput
