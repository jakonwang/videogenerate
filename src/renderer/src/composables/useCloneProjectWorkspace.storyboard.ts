import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'
import type {
  CloneProjectLike,
  StoryboardGenerateResponse,
  UseCloneProjectWorkspaceOptions,
} from './useCloneProjectWorkspace.shared'

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
    options.pushRuntimeLog?.(
      `[clone-debug] sync-product-images-start ${JSON.stringify({
        currentId: options.current.value?.id || '',
        nextRefs: normalizedRefs,
        previousRefs: [...options.productRefs.value],
      })}`,
      'info',
    )
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
      const project = hasStoredWebToken()
        ? ((await webApiClient.saveCloneProjectProductImages(projectId, {
            productReferenceImagePaths: options.productRefsDraft.value ?? [],
          }))?.project as TProject)
        : (((await window.api.clone.saveProjectProductImages({
            cloneProjectId: projectId,
            productReferenceImagePaths: options.productRefsDraft.value,
          })) as { project?: TProject })?.project as TProject)
      projectActions.applyProject(project || options.current.value)
      options.setStageLog?.(successMessage, 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '商品图同步失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('商品图同步失败，请重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const removeProductImage = async (imagePath: string, effectiveProductRefs: string[]) => {
    options.pushRuntimeLog?.(
      `[clone-debug] remove-product-image-click ${JSON.stringify({
        imagePath,
        currentRefs: [...effectiveProductRefs],
      })}`,
      'info',
    )
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
    options.pushRuntimeLog?.(
      `[clone-debug] generate-storyboard-frames-click ${JSON.stringify({
        currentId: projectId,
        selectedVariantId: input.selectedVariantId || '',
        productRefCount: input.effectiveProductRefs.length,
        selectedModelId: options.selectedModelId.value || options.current.value?.selectedModelIdentitySnapshot?.id || '',
      })}`,
      'info',
    )
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
    options.pushRuntimeLog?.(
      `提交分镜图片生成：project=${projectId} variant=${input.selectedVariantId} refs=${input.effectiveProductRefs.length} provider=${options.getActiveImageProvider?.() || '--'} model=${options.getActiveImageModel?.() || '--'}`,
      'info',
    )
    try {
      if (options.productRefsDraft.value) {
        options.pushRuntimeLog?.(`检测到未保存的商品图草稿，先同步到项目：${options.productRefsDraft.value.length} 张`, 'info')
        const syncedProject = hasStoredWebToken()
          ? ((await webApiClient.saveCloneProjectProductImages(projectId, {
              productReferenceImagePaths: [...options.productRefsDraft.value],
            }))?.project as TProject)
          : (((await window.api.clone.saveProjectProductImages({
              cloneProjectId: projectId,
              productReferenceImagePaths: [...options.productRefsDraft.value],
            })) as { project?: TProject })?.project as TProject)
        projectActions.applyProject(syncedProject || options.current.value)
        options.pushRuntimeLog?.('商品图草稿同步完成，开始提交分镜图片生成。', 'success')
      }
      options.pushRuntimeLog?.(
        `调用 clone:generateStoryboardGrids -> model=${options.selectedModelId.value || options.current.value?.selectedModelIdentitySnapshot?.id || '--'}`,
        'info',
      )
      const res = hasStoredWebToken()
        ? ((await webApiClient.generateStoryboardImages(projectId, {
            productReferenceImagePaths: [...input.effectiveProductRefs],
            selectedModelIdentityId:
              options.selectedModelId.value || options.current.value?.selectedModelIdentitySnapshot?.id,
          })) as StoryboardGenerateResponse<TProject>)
        : ((await window.api.clone.generateStoryboardGrids({
            cloneProjectId: projectId,
            productReferenceImagePaths: [...input.effectiveProductRefs],
            selectedModelIdentityId:
              options.selectedModelId.value || options.current.value?.selectedModelIdentitySnapshot?.id,
          })) as StoryboardGenerateResponse<TProject>)
      if (options.storyboardBatchSummary) {
        options.storyboardBatchSummary.value = res.queueSummary || null
      }
      options.pushRuntimeLog?.(
        `分镜图片生成返回：provider=${String(res.imageProvider || '--')} model=${String(res.imageModel || '--')} total=${res.queueSummary?.total ?? 0} done=${res.queueSummary?.done ?? 0} failed=${res.queueSummary?.failed ?? 0} skipped=${res.queueSummary?.skipped ?? 0} frames=${res.project?.storyboardFrames?.length ?? 0} workflow=${res.project?.workflowV2?.currentStep || ''}`,
        'success',
      )
      projectActions.applyProject((res.project || options.current.value) as TProject)
      const latest =
        (await projectActions.waitForStoryboardFrames(projectId, 20000)) ||
        (hasStoredWebToken()
          ? (((await webApiClient.getCloneProject(projectId))?.project || null) as TProject | null)
          : ((await window.api.clone.getProject({ cloneProjectId: projectId })) as TProject))
      if (latest?.id) {
        projectActions.applyProject(latest)
        options.pushRuntimeLog?.(
          `分镜图片回刷完成：shots=${latest.blueprint?.shots?.length ?? 0} frames=${latest.storyboardFrames?.length ?? 0}`,
          'success',
        )
      }
      options.setStageLog?.('分镜图片生成完成，可以开始生成分镜视频。', 'success')
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
    const useWebApi = hasStoredWebToken()
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
    options.pushRuntimeLog?.(`提交单镜分镜图片重生成：project=${projectId} shot=${shotId} refs=${effectiveProductRefs.length} channel=${useWebApi ? 'web-api' : 'electron-ipc'}`, 'info')
    try {
      if (options.productRefsDraft.value) {
        const syncedProject = useWebApi
          ? ((await webApiClient.saveCloneProjectProductImages(projectId, {
              productReferenceImagePaths: [...options.productRefsDraft.value],
            }))?.project as TProject)
          : (((await window.api.clone.saveProjectProductImages({
              cloneProjectId: projectId,
              productReferenceImagePaths: [...options.productRefsDraft.value],
            })) as { project?: TProject })?.project as TProject)
        projectActions.applyProject(syncedProject || options.current.value)
        options.pushRuntimeLog?.('单镜重生成前已同步商品图草稿。', 'success')
      }
      const project = useWebApi
        ? (((await webApiClient.regenerateStoryboardImage(projectId, shotId, {
            productReferenceImagePaths: [...effectiveProductRefs],
          }))?.project || options.current.value) as TProject)
        : ((await window.api.clone.generateGptShotFrames({
            cloneProjectId: projectId,
            shotId,
            which: 'both',
            productReferenceImagePaths: [...effectiveProductRefs],
          })) as TProject)
      projectActions.applyProject(project || options.current.value)
      const latest =
        (await projectActions.waitForStoryboardFrames(projectId, 12000)) ||
        (useWebApi
          ? (((await webApiClient.getCloneProject(projectId))?.project || null) as TProject | null)
          : ((await window.api.clone.getProject({ cloneProjectId: projectId })) as TProject))
      if (latest?.id) {
        projectActions.applyProject(latest)
      }
      options.setStageLog?.(`${shotLabel(shotId)} 分镜图片已重新生成。`, 'success')
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
