import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'
import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'

type ScriptProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null) => void
  refreshProjectAfterFailure: () => Promise<void>
}

export function useCloneProjectWorkspaceScript<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: ScriptProjectActions<TProject>,
) {
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
      if (hasStoredWebToken() && projectId) {
        const res = await webApiClient.analyzeCloneReference(projectId, {
          videoPath,
          locale: 'zh-CN',
        })
        projectActions.applyProject((res.project || null) as TProject | null)
      } else {
        const res = (await window.api.clone.createBlueprint({
          videoPath,
          locale: 'zh-CN',
          strength: 'structure',
          cloneProjectId: projectId || options.current.value?.id,
        })) as { project?: TProject }
        projectActions.applyProject((res.project || null) as TProject | null)
      }
      options.setStageLog?.('脚本分析完成，可以继续生成脚本变体。', 'success')
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
    if (!projectId) {
      options.markError?.('请先完成参考视频分析。', '请先完成参考视频分析。')
      return
    }
    if (!hasBoundModel) {
      options.markError?.('请先选择模特。', '请先选择模特。')
      options.setStageLog?.('缺少模特，无法生成脚本。', 'error')
      return
    }
    if (!effectiveProductRefs.length) {
      options.markError?.('请先上传商品图。', '请先上传商品图。')
      options.setStageLog?.('缺少商品图，无法生成脚本。', 'error')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在生成脚本变体并进行评分。')
    try {
      const localSelectedModelId = String(options.selectedModelId.value || '').trim()
      const persistedModelId = String(options.current.value?.selectedModelIdentitySnapshot?.id || '').trim()
      if (localSelectedModelId && localSelectedModelId !== persistedModelId) {
        const syncedProject = hasStoredWebToken()
          ? ((await webApiClient.selectCloneProjectModelIdentity(projectId, {
              identityId: localSelectedModelId,
            }))?.project as TProject)
          : ((await window.api.clone.selectProjectModelIdentity({
              cloneProjectId: projectId,
              identityId: localSelectedModelId,
            })) as TProject)
        projectActions.applyProject((syncedProject || options.current.value) as TProject)
        options.pushRuntimeLog?.(`脚本变体生成前已自动绑定模特：${localSelectedModelId}`, 'info')
      }

      if (options.productRefsDraft.value) {
        const syncedProject = hasStoredWebToken()
          ? ((await webApiClient.saveCloneProjectProductImages(projectId, {
              productReferenceImagePaths: options.productRefsDraft.value,
            }))?.project as TProject)
          : (((await window.api.clone.saveProjectProductImages({
              cloneProjectId: projectId,
              productReferenceImagePaths: options.productRefsDraft.value,
            })) as { project?: TProject })?.project as TProject)
        projectActions.applyProject((syncedProject || options.current.value) as TProject)
        options.pushRuntimeLog?.(`脚本变体生成前已同步商品图：${options.productRefsDraft.value.length} 张`, 'info')
      }

      const variantCount = Math.max(1, Math.min(6, Number(options.variantCount?.value || 3)))
      if (hasStoredWebToken()) {
        const res = await webApiClient.generateCloneScriptVariants(projectId, {
          variantCount,
        })
        projectActions.applyProject((res.project || options.current.value) as TProject)
      } else {
        const res = (await window.api.clone.generateScriptVariants({
          cloneProjectId: projectId,
          variantCount,
        })) as { project?: TProject }
        projectActions.applyProject((res.project || options.current.value) as TProject)
      }

      options.setStageLog?.(
        options.current.value?.lastError
          ? '脚本变体已生成，部分候选使用了本地兜底逻辑，请直接选择一条继续。'
          : '脚本变体生成完成，请选择一条高分脚本继续。',
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
      if (hasStoredWebToken()) {
        const res = await webApiClient.selectCloneScriptVariant(projectId, { variantId })
        projectActions.applyProject((res.project || options.current.value) as TProject)
      } else {
        const res = (await window.api.clone.selectScriptVariant({
          cloneProjectId: projectId,
          variantId,
        })) as { project?: TProject }
        projectActions.applyProject((res.project || options.current.value) as TProject)
      }
      options.setStageLog?.('脚本变体已确认，可以继续生成分镜图片。', 'success')
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
