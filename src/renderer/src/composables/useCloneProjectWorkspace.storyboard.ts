import type { CloneProjectLike, StoryboardGenerateResponse, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'

type StoryboardProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null) => void
  refreshProjectAfterFailure: () => Promise<void>
  waitForStoryboardFrames: (projectId: string, timeoutMs?: number) => Promise<TProject | null>
}

export function useCloneProjectWorkspaceStoryboard<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: StoryboardProjectActions<TProject>,
) {
  const shotLabel = (shotId: string) => options.shotLabel?.(shotId) || `分镜 ${shotId}`

  const syncProductImagesToProject = async (nextRefs: string[], successMessage: string) => {
    const normalizedRefs = Array.from(new Set(nextRefs.map(String).filter(Boolean))).slice(0, 9)
    options.productRefsDraft.value = normalizedRefs
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) {
      options.setStageLog?.(successMessage)
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在同步商品图到当前项目。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const project = (
        await resolved?.client.saveProductImages(projectId, {
          productReferenceImagePaths: options.productRefsDraft.value ?? [],
        })
      )?.project as TProject
      projectActions.applyProject(project || options.current.value)
      options.setStageLog?.(`${successMessage} 当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '商品图同步失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('商品图同步失败，请重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const removeProductImage = async (imagePath: string, effectiveProductRefs: string[]) => {
    const nextRefs = effectiveProductRefs.filter((item) => item !== imagePath)
    if (nextRefs.length === effectiveProductRefs.length) return
    await syncProductImagesToProject(
      nextRefs,
      nextRefs.length ? `已更新商品图，当前保留 ${nextRefs.length} 张。` : '已移除全部商品图，请重新上传。',
    )
  }

  const clearProductImages = async (effectiveProductRefs: string[]) => {
    if (!effectiveProductRefs.length) return
    await syncProductImagesToProject([], '已清空商品图，请重新上传。')
  }

  const generateStoryboardGrids = async (input: {
    effectiveProductRefs: string[]
    hasBoundModel: boolean
    selectedVariantId: string
  }) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) {
      options.markError?.('请先完成参考视频分析。', '请先完成参考视频分析。')
      return
    }
    if (!input.selectedVariantId) {
      options.markError?.('请先选择一条脚本变体。', '请先选择一条脚本变体。')
      return
    }
    if (!input.effectiveProductRefs.length) {
      options.markError?.('请先上传商品图。', '请先上传商品图。')
      return
    }
    if (!input.hasBoundModel) {
      options.markError?.('请先选择模特。', '请先选择模特。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    if (options.storyboardBatchSummary) options.storyboardBatchSummary.value = null
    options.setStageLog?.('正在根据脚本、模特与商品图生成逐分镜图片。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      if (options.productRefsDraft.value) {
        const syncedProject = await resolved?.client.saveProductImages(projectId, {
          productReferenceImagePaths: [...options.productRefsDraft.value],
        })
        projectActions.applyProject((syncedProject?.project || options.current.value) as TProject)
      }
      const res = (await resolved?.client.generateStoryboardImages(projectId, {
        productReferenceImagePaths: [...input.effectiveProductRefs],
        selectedModelIdentityId: options.selectedModelId.value || options.current.value?.selectedModelIdentitySnapshot?.id,
      })) as StoryboardGenerateResponse<TProject>
      if (options.storyboardBatchSummary) {
        options.storyboardBatchSummary.value = res.queueSummary || null
      }
      projectActions.applyProject((res.project || options.current.value) as TProject)
      const latest = (await projectActions.waitForStoryboardFrames(projectId, 20000)) || null
      if (latest?.id) {
        projectActions.applyProject(latest)
      }
      options.setStageLog?.(`分镜图片生成完成，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.pushRuntimeLog?.(`分镜图片生成异常：${String(error?.message ?? error ?? '未知错误')}`, 'error')
      options.markError?.(error?.message ?? error, '分镜图片生成失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('分镜图片生成失败，请检查错误信息后重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const regenerateStoryboardFrame = async (shotId: string, effectiveProductRefs: string[]) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) {
      options.markError?.('请先完成参考视频分析。', '请先完成参考视频分析。')
      return
    }
    if (!effectiveProductRefs.length) {
      options.markError?.('请先上传商品图。', '请先上传商品图。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.(`正在重新生成 ${shotLabel(shotId)} 的分镜图片。`)
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      if (options.productRefsDraft.value) {
        const syncedProject = await resolved?.client.saveProductImages(projectId, {
          productReferenceImagePaths: [...options.productRefsDraft.value],
        })
        projectActions.applyProject((syncedProject?.project || options.current.value) as TProject)
      }
      const project = (
        await resolved?.client.regenerateStoryboardImage(projectId, shotId, {
          productReferenceImagePaths: [...effectiveProductRefs],
        })
      )?.project as TProject
      projectActions.applyProject(project || options.current.value)
      const latest = (await projectActions.waitForStoryboardFrames(projectId, 12000)) || null
      if (latest?.id) {
        projectActions.applyProject(latest)
      }
      options.setStageLog?.(`${shotLabel(shotId)} 分镜图片已重新生成，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.pushRuntimeLog?.(`单镜分镜图片重生成异常：${String(error?.message ?? error ?? '未知错误')}`, 'error')
      options.markError?.(error?.message ?? error, '单镜分镜图片重生成失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`${shotLabel(shotId)} 分镜图片重生成失败，请检查错误信息后重试。`, 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  return {
    syncProductImagesToProject,
    removeProductImage,
    clearProductImages,
    generateStoryboardGrids,
    regenerateStoryboardFrame,
  }
}
