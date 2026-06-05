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
  const bindLibraryProduct = async (productId: string) => {
    const nextProductId = String(productId || '').trim()
    if (!nextProductId) return
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()

    options.pushRuntimeLog?.(
      `[clone-debug] bind-library-product:start ${JSON.stringify({
        productId: nextProductId,
        projectId,
      })}`,
      'info',
    )

    if (!projectId) {
      options.pushRuntimeLog?.('[clone-debug] bind-library-product:skip-no-project', 'error')
      options.setStageLog?.('商品已选中，完成参考分析后会自动绑定到当前项目。')
      return
    }

    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在绑定商品库商品并同步产品标准源缓存。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const res = await resolved?.client.bindProduct(projectId, { productId: nextProductId })
      projectActions.applyProject((res?.project || options.current.value) as TProject)
      options.productRefsDraft.value = null
      options.pushRuntimeLog?.(
        `[clone-debug] bind-library-product:success ${JSON.stringify({
          productId: nextProductId,
          projectId,
          channel: resolved?.channel || 'unknown',
          boundProductId: String((res?.project as TProject | undefined)?.productId || '').trim(),
        })}`,
        'success',
      )
      options.setStageLog?.(`商品库商品已绑定，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.pushRuntimeLog?.(
        `[clone-debug] bind-library-product:failed ${JSON.stringify({
          productId: nextProductId,
          projectId,
          message: String(error?.message ?? error ?? 'unknown error'),
        })}`,
        'error',
      )
      options.markError?.(error?.message ?? error, '商品库商品绑定失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('商品库商品绑定失败，请检查商品素材后重试。', 'error')
      throw error
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const pickReferenceVideo = async (filePath: string) => {
    const file = String(filePath || '').trim()
    if (!file) return
    options.errorText.value = ''
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()

    if (projectId) {
      if (options.loading) options.loading.value = true
      options.setStageLog?.('正在绑定参考视频到当前任务。')
      try {
        const resolved = await options.getWorkspaceClient?.(projectId)
        const base64Data =
          resolved?.channel === 'web-api' && options.readFileAsBase64 ? await options.readFileAsBase64(file) : undefined
        const res = await resolved?.client.uploadReferenceVideo(projectId, {
          fileName: options.fileNameFromPath ? options.fileNameFromPath(file) : file,
          base64Data,
          mimeType: options.mimeTypeFromPath ? options.mimeTypeFromPath(file) : 'video/mp4',
          localFilePath: file,
        })
        projectActions.applyProject((res?.project || options.current.value) as TProject)
        options.referenceVideoPath.value = String((res?.project as TProject | undefined)?.referenceVideoPath || file)
        if (!options.current.value?.id) {
          await projectActions.loadProject(projectId, { updateStageLog: false })
        }
        options.setStageLog?.(`参考视频已绑定，当前通道：${resolved?.channel || 'unknown'}`, 'success')
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

    options.productRefsDraft.value = merged
    if (!projectId) {
      options.setStageLog?.(`已选择 ${merged.length} 张商品图，完成参考视频分析后会自动绑定到当前项目。`)
      return
    }

    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在绑定商品图到当前任务。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const useUpload =
        resolved?.channel === 'web-api' && options.readFileAsBase64 && options.fileNameFromPath && options.mimeTypeFromPath
      const res = useUpload
        ? await resolved?.client.uploadProductImages(projectId, {
            files: await Promise.all(
              next.map(async (file) => ({
                fileName: options.fileNameFromPath!(file),
                base64Data: await options.readFileAsBase64!(file),
                mimeType: options.mimeTypeFromPath!(file),
                localFilePath: file,
              })),
            ),
          })
        : await resolved?.client.saveProductImages(projectId, {
            productReferenceImagePaths: merged,
          })
      projectActions.applyProject((res?.project || options.current.value) as TProject)
      options.productRefsDraft.value = null
      options.setStageLog?.(`已绑定 ${merged.length} 张商品图，当前通道：${resolved?.channel || 'unknown'}`, 'success')
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
      const resolved = await options.getWorkspaceClient?.(projectId)
      const res = await resolved?.client.selectModelIdentity(projectId, { identityId })
      projectActions.applyProject((res?.project || options.current.value) as TProject)
      if (!options.current.value?.id) {
        await projectActions.loadProject(projectId, { updateStageLog: false })
      }
      options.setStageLog?.(`模特已绑定，当前通道：${resolved?.channel || 'unknown'}`, 'success')
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
    bindLibraryProduct,
    bindProductImages,
    bindModelIdentity,
  }
}
