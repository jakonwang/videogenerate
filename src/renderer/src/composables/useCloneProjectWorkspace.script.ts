import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'
import { extractProjectProductRefs } from './useCloneProjectWorkspace.shared'

type ScriptProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null) => void
  refreshProjectAfterFailure: () => Promise<void>
}

export function useCloneProjectWorkspaceScript<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: ScriptProjectActions<TProject>,
) {
  const resolveEffectiveProductRefs = (effectiveProductRefs: string[]) => {
    const inputRefs = (effectiveProductRefs || []).map((item) => String(item || '').trim()).filter(Boolean)
    if (inputRefs.length) return inputRefs
    const draftRefs = (options.productRefsDraft.value || []).map((item) => String(item || '').trim()).filter(Boolean)
    if (draftRefs.length) return draftRefs
    return extractProjectProductRefs(options.current.value).map((item) => String(item || '').trim()).filter(Boolean)
  }

  const resolveHasBoundModel = (hasBoundModel: boolean) =>
    Boolean(hasBoundModel || options.selectedModelId.value || options.current.value?.selectedModelIdentitySnapshot?.id)

  const createBlueprint = async (sourcePath: string) => {
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    const videoPath = String(sourcePath || '').trim()
    if (!videoPath) {
      options.markError?.('请先上传参考视频。', '请先上传参考视频。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在分析参考视频脚本与分镜结构。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId || undefined)
      const res = await resolved?.client.analyzeReference(projectId || undefined, {
        videoPath,
        locale: 'zh-CN',
      })
      projectActions.applyProject((res?.project || null) as TProject | null)
      options.setStageLog?.(`脚本分析完成，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '参考视频分析失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('参考视频分析失败，请检查错误信息后重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const generateScriptVariants = async (effectiveProductRefs: string[], hasBoundModel: boolean) => {
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    const resolvedProductRefs = resolveEffectiveProductRefs(effectiveProductRefs)
    const resolvedHasBoundModel = resolveHasBoundModel(hasBoundModel)
    if (!projectId) {
      options.markError?.('请先完成参考视频分析。', '请先完成参考视频分析。')
      return
    }
    if (!resolvedHasBoundModel) {
      options.markError?.('请先选择模特。', '请先选择模特。')
      options.setStageLog?.('缺少模特，无法生成脚本。', 'error')
      return
    }
    if (!resolvedProductRefs.length) {
      options.markError?.('请先上传商品图。', '请先上传商品图。')
      options.setStageLog?.('缺少商品图，无法生成脚本。', 'error')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在生成脚本变体并进行评分。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const hasBlueprint = Boolean(options.current.value?.blueprint?.shots?.length || options.current.value?.baseBlueprint?.shots?.length)
      if (!hasBlueprint) {
        const fallbackVideoPath = String(options.current.value?.referenceVideoPath || options.referenceVideoPath.value || '').trim()
        if (!fallbackVideoPath) {
          throw new Error('复刻项目缺少参考视频，无法补建蓝图')
        }
        options.pushRuntimeLog?.('检测到当前任务还没有可用蓝图，先自动补做一次参考分析。', 'info')
        const analyzed = await resolved?.client.analyzeReference(projectId, {
          videoPath: fallbackVideoPath,
          locale: 'zh-CN',
        })
        projectActions.applyProject((analyzed?.project || options.current.value) as TProject)
      }

      const localSelectedModelId = String(options.selectedModelId.value || '').trim()
      const persistedModelId = String(options.current.value?.selectedModelIdentitySnapshot?.id || '').trim()
      if (localSelectedModelId && localSelectedModelId !== persistedModelId) {
        const syncedProject = await resolved?.client.selectModelIdentity(projectId, {
          identityId: localSelectedModelId,
        })
        projectActions.applyProject((syncedProject?.project || options.current.value) as TProject)
        options.pushRuntimeLog?.(`脚本变体生成前已自动绑定模特：${localSelectedModelId}`, 'info')
      }

      const currentSavedRefs = extractProjectProductRefs(options.current.value).map((item) => String(item || '').trim()).filter(Boolean)
      const shouldSyncProductRefs =
        resolvedProductRefs.length > 0 &&
        (resolvedProductRefs.length !== currentSavedRefs.length ||
          resolvedProductRefs.some((item, index) => item !== currentSavedRefs[index]))
      if (shouldSyncProductRefs) {
        const syncedProject = await resolved?.client.saveProductImages(projectId, {
          productReferenceImagePaths: resolvedProductRefs,
        })
        projectActions.applyProject((syncedProject?.project || options.current.value) as TProject)
        options.pushRuntimeLog?.(`脚本变体生成前已同步商品图：${resolvedProductRefs.length} 张`, 'info')
      }

      const variantCount = Math.max(1, Math.min(6, Number(options.variantCount?.value || 3)))
      const res = await resolved?.client.generateScriptVariants(projectId, {
        variantCount,
      })
      projectActions.applyProject((res?.project || options.current.value) as TProject)

      options.setStageLog?.(
        options.current.value?.lastError
          ? '脚本变体已生成，部分候选使用了兜底逻辑，请直接选择一条继续。'
          : `脚本变体生成完成，当前通道：${resolved?.channel || 'unknown'}`,
        options.current.value?.lastError ? 'info' : 'success',
      )
    } catch (error: any) {
      options.pushRuntimeLog?.(`脚本变体生成异常：${String(error?.message ?? error ?? '未知错误')}`, 'error')
      options.markError?.(error?.message ?? error, '脚本变体生成失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('脚本变体生成失败，请检查错误信息后重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const selectScriptVariant = async (variantId: string) => {
    const projectId = options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) return
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在应用选中的脚本变体。')
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const res = await resolved?.client.selectScriptVariant(projectId, { variantId })
      projectActions.applyProject((res?.project || options.current.value) as TProject)
      options.setStageLog?.(`脚本变体已确认，当前通道：${resolved?.channel || 'unknown'}`, 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '脚本变体选择失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('脚本变体选择失败，请重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  return {
    createBlueprint,
    generateScriptVariants,
    selectScriptVariant,
  }
}
