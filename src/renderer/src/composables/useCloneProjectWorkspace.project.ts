import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'
import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'
import { extractProjectProductRefs } from './useCloneProjectWorkspace.shared'

export function useCloneProjectWorkspaceProject<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
) {
  const applyProject = (next: TProject | null) => {
    options.current.value = next
    if (next?.referenceVideoPath) {
      options.referenceVideoPath.value = next.referenceVideoPath
    } else if (next?.referenceVideoPath === '' && next?.id) {
      options.referenceVideoPath.value = ''
    }
    const nextRefs = extractProjectProductRefs(next)
    options.productRefs.value = nextRefs
    if (options.productRefsDraft.value) {
      const same =
        options.productRefsDraft.value.length === nextRefs.length &&
        options.productRefsDraft.value.every((item, index) => item === nextRefs[index])
      if (same) {
        options.productRefsDraft.value = null
      }
    }
    options.errorText.value =
      next?.finalCompose?.error || next?.previewPipeline?.lastError || next?.blueprint?.scriptAnalysisError || next?.lastError || ''
    if (next?.selectedModelIdentitySnapshot?.id) {
      options.selectedModelId.value = next.selectedModelIdentitySnapshot.id
    } else if (!next?.id) {
      options.selectedModelId.value = ''
    }
    options.composeOutputDir.value = String(next?.outputDir || '').trim()
  }

  const refreshCurrentProject = async () => {
    if (!options.current.value?.id) return
    if (hasStoredWebToken()) {
      const [projectRes, runtimeRes] = await Promise.all([
        webApiClient.getCloneProject(options.current.value.id),
        webApiClient.getCloneRuntime(options.current.value.id).catch(() => null),
      ])
      let next = (projectRes?.project || options.current.value) as TProject
      if (runtimeRes?.pipeline && options.applyPipelineStatus) {
        next = options.applyPipelineStatus(next, runtimeRes)
      }
      applyProject(next)
      return
    }
    const res = (await window.api.clone.refreshProjectStatus({
      cloneProjectId: options.current.value.id,
    })) as { project?: TProject }
    applyProject((res.project || options.current.value) as TProject)
  }

  const ensureCurrentProjectReady = async () => {
    const currentId = String(options.current.value?.id || '').trim()
    if (!currentId) return null
    try {
      const project = hasStoredWebToken()
        ? (((await webApiClient.getCloneProject(currentId))?.project || null) as TProject | null)
        : ((await window.api.clone.getProject({ cloneProjectId: currentId })) as TProject)
      if (project?.id) {
        applyProject(project)
        return project
      }
    } catch {
      return null
    }
    return null
  }

  const refreshProjectAfterFailure = async () => {
    try {
      await refreshCurrentProject()
    } catch (error) {
      options.pushRuntimeLog?.(
        `刷新失败状态失败：${String((error as Error)?.message ?? error ?? '未知错误')}`,
        'error',
      )
    }
  }

  const loadProject = async (projectId: string, options2: { updateStageLog?: boolean } = {}) => {
    let next: TProject | null = null
    if (hasStoredWebToken()) {
      const [projectRes, runtimeRes] = await Promise.all([
        webApiClient.getCloneProject(projectId),
        webApiClient.getCloneRuntime(projectId).catch(() => null),
      ])
      next = (projectRes?.project || null) as TProject | null
      if (next && runtimeRes?.pipeline && options.applyPipelineStatus) {
        next = options.applyPipelineStatus(next, runtimeRes)
      }
    } else {
      const res = (await window.api.clone.refreshProjectStatus({ cloneProjectId: projectId })) as { project?: TProject }
      next = res.project || null
    }
    if (!next?.id) {
      throw new Error('复刻任务不存在或已删除')
    }
    applyProject(next)
    if (options2.updateStageLog !== false) {
      options.setStageLog?.(
        next.finalCompose?.outputPath ? '任务已载入，可直接查看结果或替换分镜重新合成。' : '任务已载入，可从当前阶段继续推进。',
      )
    }
  }

  const waitForStoryboardFrames = async (projectId: string, timeoutMs = 20000) => {
    const startedAt = Date.now()
    let latestProject: TProject | null = null
    while (Date.now() - startedAt < timeoutMs) {
      if (hasStoredWebToken()) {
        const [projectRes, runtimeRes] = await Promise.all([
          webApiClient.getCloneProject(projectId),
          webApiClient.getCloneRuntime(projectId).catch(() => null),
        ])
        latestProject = (projectRes?.project || null) as TProject | null
        if (latestProject && runtimeRes?.pipeline && options.applyPipelineStatus) {
          latestProject = options.applyPipelineStatus(latestProject, runtimeRes)
        }
      } else {
        const res = (await window.api.clone.refreshProjectStatus({ cloneProjectId: projectId })) as { project?: TProject }
        latestProject = res.project || null
      }
      if (latestProject?.id) {
        applyProject(latestProject)
        const shots = latestProject.blueprint?.shots ?? []
        const hasAnyFrame = shots.some((shot) =>
          Boolean(
            String(shot.gptFirstFramePath || '').trim() ||
              String(shot.generatedFirstFramePath || '').trim(),
          ),
        )
        if (hasAnyFrame) {
          return latestProject
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
    return latestProject
  }

  return {
    applyProject,
    refreshCurrentProject,
    ensureCurrentProjectReady,
    refreshProjectAfterFailure,
    loadProject,
    waitForStoryboardFrames,
  }
}
