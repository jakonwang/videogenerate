import type { CloneProjectLike, StoryboardGenerateResponse, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'
import { extractProjectProductRefs, sameProjectProductRefs } from './useCloneProjectWorkspace.shared'

const MANUAL_STORYBOARD_RETRY_LIMIT = 2

type StoryboardProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null, mode?: 'patch' | 'replace') => void
  refreshProjectAfterFailure: () => Promise<void>
  waitForStoryboardFrames: (projectId: string, timeoutMs?: number, shotIds?: string[]) => Promise<TProject | null>
}

function preferredStoryboardRefs<TProject extends CloneProjectLike>(project: TProject | null, fallbackRefs: string[]) {
  const originals = Array.isArray((project as any)?.originalProductReferenceImagePaths)
    ? (project as any).originalProductReferenceImagePaths.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : []
  const sanitized = Array.isArray((project as any)?.sanitizedProductReferenceImagePaths)
    ? (project as any).sanitizedProductReferenceImagePaths.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : []
  const fallback = fallbackRefs.map((item) => String(item || '').trim()).filter(Boolean)
  return Array.from(new Set([...originals, ...fallback, ...sanitized])).slice(0, 9)
}

export function useCloneProjectWorkspaceStoryboard<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: StoryboardProjectActions<TProject>,
) {
  const shotLabel = (shotId: string) => options.shotLabel?.(shotId) || `分镜 ${shotId}`

  const shouldSyncDraftProductRefs = () => {
    const draftRefs = Array.isArray(options.productRefsDraft.value) ? options.productRefsDraft.value : []
    if (!draftRefs.length) return false
    const currentSavedRefs = extractProjectProductRefs(options.current.value).map((item) => String(item || '').trim()).filter(Boolean)
    return !sameProjectProductRefs(draftRefs, currentSavedRefs)
  }

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
      options.markError?.('请先选择商品库商品。', '请先选择商品库商品。')
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
      if (shouldSyncDraftProductRefs()) {
        const syncedProject = await resolved?.client.saveProductImages(projectId, {
          productReferenceImagePaths: [...(options.productRefsDraft.value ?? [])],
        })
        projectActions.applyProject((syncedProject?.project || options.current.value) as TProject)
      }
      const storyboardRefs = preferredStoryboardRefs(options.current.value, input.effectiveProductRefs)
      const res = (await resolved?.client.generateStoryboardImages(projectId, {
        productReferenceImagePaths: storyboardRefs,
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
      options.pushRuntimeLog?.(`分镜图片生成异常：${String(error?.message ?? error ?? 'unknown error')}`, 'error')
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
      options.markError?.('请先选择商品库商品。', '请先选择商品库商品。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.(`正在重新生成 ${shotLabel(shotId)} 的分镜图片。`)
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      if (shouldSyncDraftProductRefs()) {
        const syncedProject = await resolved?.client.saveProductImages(projectId, {
          productReferenceImagePaths: [...(options.productRefsDraft.value ?? [])],
        })
        projectActions.applyProject((syncedProject?.project || options.current.value) as TProject)
      }
      const storyboardRefs = preferredStoryboardRefs(options.current.value, effectiveProductRefs)
      let project: TProject | null = null
      let lastError: unknown = null
      for (let attempt = 1; attempt <= MANUAL_STORYBOARD_RETRY_LIMIT; attempt += 1) {
        options.pushRuntimeLog?.(
          `${shotLabel(shotId)} manual storyboard retry ${attempt}/${MANUAL_STORYBOARD_RETRY_LIMIT}`,
          'info',
        )
        try {
          project = (
            await resolved?.client.regenerateStoryboardImage(projectId, shotId, {
              productReferenceImagePaths: storyboardRefs,
              selectedModelIdentityId:
                options.selectedModelId.value || options.current.value?.selectedModelIdentitySnapshot?.id,
            })
          )?.project as TProject
          lastError = null
          break
        } catch (error) {
          lastError = error
          options.pushRuntimeLog?.(
            `${shotLabel(shotId)} manual storyboard retry failed ${attempt}/${MANUAL_STORYBOARD_RETRY_LIMIT}: ${String((error as any)?.message ?? error ?? 'unknown error')}`,
            'error',
          )
          if (attempt >= MANUAL_STORYBOARD_RETRY_LIMIT) throw error
        }
      }
      if (!project && lastError) throw lastError
      projectActions.applyProject(project || options.current.value)
      const latest = (await projectActions.waitForStoryboardFrames(projectId, 12000, [shotId])) || null
      if (latest?.id) {
        projectActions.applyProject(latest)
      }
      options.setStageLog?.(`${shotLabel(shotId)} 分镜图片已重新生成，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.pushRuntimeLog?.(`单镜分镜图片重生成异常：${String(error?.message ?? error ?? 'unknown error')}`, 'error')
      options.markError?.(error?.message ?? error, '单镜分镜图片重生成失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`${shotLabel(shotId)} 分镜图片重生成失败，请检查错误信息后重试。`, 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const regenerateStoryboardFrames = async (input: { shotIds: string[]; effectiveProductRefs: string[]; stageLogLabel?: string }) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) {
      options.markError?.('请先完成参考视频分析。', '请先完成参考视频分析。')
      return
    }
    const shotIds = Array.from(new Set((input.shotIds ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
    if (!shotIds.length) return
    if (!input.effectiveProductRefs.length) {
      options.markError?.('请先选择商品库商品。', '请先选择商品库商品。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.(input.stageLogLabel || `正在批量重新生成 ${shotIds.length} 条分镜图片。`)
    options.pushRuntimeLog?.(`开始批量重生成分镜图片，共 ${shotIds.length} 条。`, 'info')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      if (shouldSyncDraftProductRefs()) {
        const syncedProject = await resolved?.client.saveProductImages(projectId, {
          productReferenceImagePaths: [...(options.productRefsDraft.value ?? [])],
        })
        projectActions.applyProject((syncedProject?.project || options.current.value) as TProject, 'replace')
      }
      const storyboardRefs = preferredStoryboardRefs(options.current.value, input.effectiveProductRefs)
      const res = await window.api.clone.generateAllShotFrames({
        cloneProjectId: projectId,
        shotIds,
        which: 'start',
        forceRegenerate: true,
        productReferenceImagePaths: storyboardRefs,
      })
      projectActions.applyProject(((res as { project?: TProject } | null)?.project || options.current.value) as TProject, 'replace')
      const latest = (await projectActions.waitForStoryboardFrames(projectId, 20000, shotIds)) || null
      if (latest?.id) {
        projectActions.applyProject(latest, 'replace')
      }
      options.pushRuntimeLog?.(
        `批量重生成分镜图片已提交，共 ${shotIds.length} 条，通道：${resolved?.channel || 'unknown'}`,
        'success',
      )
      options.setStageLog?.(`分镜图片批量重新生成已提交，共 ${shotIds.length} 条，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.pushRuntimeLog?.(`分镜图片批量重新生成异常：${String(error?.message ?? error ?? 'unknown error')}`, 'error')
      options.markError?.(error?.message ?? error, '分镜图片批量重新生成失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('分镜图片批量重新生成失败，请检查错误信息后重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const batchQueryStoryboardImages = async (input: { effectiveProductRefs: string[]; shotIds?: string[] }) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) {
      options.markError?.('请先完成参考视频分析。', '请先完成参考视频分析。')
      return
    }
    if (!input.effectiveProductRefs.length) {
      options.markError?.('请先选择商品库商品。', '请先选择商品库商品。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在批量查询未完成的分镜图片。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const storyboardRefs = preferredStoryboardRefs(options.current.value, input.effectiveProductRefs)
      const res = (await resolved?.client.batchQueryStoryboardImages(projectId, {
        productReferenceImagePaths: storyboardRefs,
        shotIds: input.shotIds,
      })) as StoryboardGenerateResponse<TProject>
      if (options.storyboardBatchSummary) {
        options.storyboardBatchSummary.value = res.queueSummary || null
      }
      projectActions.applyProject((res.project || options.current.value) as TProject)
      const latest = (await projectActions.waitForStoryboardFrames(projectId, 12000, input.shotIds)) || null
      if (latest?.id) {
        projectActions.applyProject(latest)
      }
      options.setStageLog?.(`分镜图片批量查询完成，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.pushRuntimeLog?.(`分镜图片批量查询异常：${String(error?.message ?? error ?? 'unknown error')}`, 'error')
      options.markError?.(error?.message ?? error, '分镜图片批量查询失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('分镜图片批量查询失败，请检查错误信息后重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  return {
    syncProductImagesToProject,
    removeProductImage,
    clearProductImages,
    generateStoryboardGrids,
    batchQueryStoryboardImages,
    regenerateStoryboardFrame,
    regenerateStoryboardFrames,
  }
}
