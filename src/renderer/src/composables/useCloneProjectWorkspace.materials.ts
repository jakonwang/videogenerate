import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'
import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'

type ProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null) => void
  loadProject: (projectId: string, options2?: { updateStageLog?: boolean }) => Promise<void>
  refreshProjectAfterFailure: () => Promise<void>
}

export function useCloneProjectWorkspaceMaterials<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: ProjectActions<TProject>,
) {
  const pickReferenceVideo = async (filePath: string) => {
    const file = String(filePath || '').trim()
    if (!file) return
    options.errorText.value = ''
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()

    if (hasStoredWebToken() && projectId && options.readFileAsBase64 && options.fileNameFromPath && options.mimeTypeFromPath) {
      if (options.loading) options.loading.value = true
      options.setStageLog?.('正在上传参考视频到当前 Web 任务。')
      try {
        const base64Data = await options.readFileAsBase64(file)
        const res = await webApiClient.uploadCloneReferenceVideo(projectId, {
          fileName: options.fileNameFromPath(file),
          base64Data,
          mimeType: options.mimeTypeFromPath(file),
        })
        projectActions.applyProject((res.project || options.current.value) as TProject)
        options.referenceVideoPath.value = String((res.project as TProject | undefined)?.referenceVideoPath || file)
        if (!options.current.value?.id) {
          await projectActions.loadProject(projectId, { updateStageLog: false })
        }
        options.setStageLog?.('参考视频已上传并绑定到当前任务。', 'success')
        return
      } catch (error: any) {
        options.markError?.(error?.message ?? error, '参考视频上传失败。')
        await projectActions.refreshProjectAfterFailure()
        options.setStageLog?.('参考视频上传失败，请重试。', 'error')
        return
      } finally {
        if (options.loading) options.loading.value = false
      }
    }

    if (projectId) {
      if (options.loading) options.loading.value = true
      options.setStageLog?.('正在绑定参考视频到当前任务。')
      try {
        const res = (await window.api.clone.bindProjectReferenceVideo({
          cloneProjectId: projectId,
          videoPath: file,
        })) as { project?: TProject }
        projectActions.applyProject((res.project || options.current.value) as TProject)
        options.referenceVideoPath.value = String((res.project as TProject | undefined)?.referenceVideoPath || file)
        options.setStageLog?.('参考视频已绑定到当前任务。', 'success')
        return
      } catch (error: any) {
        options.markError?.(error?.message ?? error, '参考视频绑定失败。')
        await projectActions.refreshProjectAfterFailure()
        options.setStageLog?.('参考视频绑定失败，请重试。', 'error')
        return
      } finally {
        if (options.loading) options.loading.value = false
      }
    }

    options.current.value = null
    options.referenceVideoPath.value = file
    options.setStageLog?.('参考视频已选择，可以开始脚本分析。')
  }

  const bindProductImages = async (files: string[], effectiveProductRefs: string[]) => {
    const next = (files || []).map(String).filter(Boolean)
    if (!next.length) return
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    const hasPersistableBlueprint = Boolean(
      options.current.value?.blueprint?.shots?.length || options.current.value?.baseBlueprint?.shots?.length,
    )
    const merged = Array.from(new Set([...effectiveProductRefs, ...next])).slice(0, 9)

    if (projectId && !hasPersistableBlueprint) {
      options.productRefsDraft.value = merged
      options.setStageLog?.(`已选择 ${merged.length} 张商品图，点击“分析脚本”后会自动绑定到当前项目。`)
      return
    }

    if (hasStoredWebToken() && projectId && options.readFileAsBase64 && options.fileNameFromPath && options.mimeTypeFromPath) {
      if (options.loading) options.loading.value = true
      options.errorText.value = ''
      options.setStageLog?.('正在上传商品图到当前 Web 任务。')
      try {
        const uploadFiles = await Promise.all(
          next.map(async (file) => ({
            fileName: options.fileNameFromPath!(file),
            base64Data: await options.readFileAsBase64!(file),
            mimeType: options.mimeTypeFromPath!(file),
          })),
        )
        const res = await webApiClient.uploadCloneProductImages(projectId, {
          files: uploadFiles,
        })
        projectActions.applyProject((res.project || options.current.value) as TProject)
        if (!options.current.value?.id) {
          await projectActions.loadProject(projectId, { updateStageLog: false })
        }
        options.productRefsDraft.value = null
        options.setStageLog?.(`已上传并绑定 ${uploadFiles.length} 张商品图。`, 'success')
        return
      } catch (error: any) {
        options.markError?.(error?.message ?? error, '商品图上传失败。')
        await projectActions.refreshProjectAfterFailure()
        options.setStageLog?.('商品图上传失败，请重试。', 'error')
        return
      } finally {
        if (options.loading) options.loading.value = false
      }
    }
    options.productRefsDraft.value = merged
    if (!options.current.value?.id) {
      options.setStageLog?.(`已选择 ${merged.length} 张商品图，完成参考视频分析后会自动绑定到当前项目。`)
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在绑定商品图到当前项目。')
    try {
      if (hasStoredWebToken()) {
        const res = await webApiClient.saveCloneProjectProductImages(options.current.value.id, {
          productReferenceImagePaths: merged,
        })
        projectActions.applyProject((res.project || options.current.value) as TProject)
      } else {
        const res = (await window.api.clone.saveProjectProductImages({
          cloneProjectId: options.current.value.id,
          productReferenceImagePaths: merged,
        })) as { project?: TProject }
        projectActions.applyProject((res.project || options.current.value) as TProject)
      }
      options.setStageLog?.(`已绑定 ${merged.length} 张商品图。`, 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '商品图绑定失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('商品图绑定失败，请检查图片路径后重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const bindModelIdentity = async (identityId: string) => {
    options.selectedModelId.value = identityId
    if (options.modelModalOpen) options.modelModalOpen.value = false
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) {
      options.setStageLog?.('模特已选中，完成参考视频分析后会自动绑定到当前项目。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在绑定模特。')
    try {
      if (hasStoredWebToken()) {
        const res = await webApiClient.selectCloneProjectModelIdentity(projectId, {
          identityId,
        })
        projectActions.applyProject((res.project || options.current.value) as TProject)
        if (!options.current.value?.id) {
          await projectActions.loadProject(projectId, { updateStageLog: false })
        }
      } else {
        const next = (await window.api.clone.selectProjectModelIdentity({
          cloneProjectId: projectId,
          identityId,
        })) as TProject
        projectActions.applyProject(next)
      }
      options.setStageLog?.('模特已绑定。', 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '模特绑定失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('模特绑定失败，请重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  return {
    pickReferenceVideo,
    bindProductImages,
    bindModelIdentity,
  }
}
