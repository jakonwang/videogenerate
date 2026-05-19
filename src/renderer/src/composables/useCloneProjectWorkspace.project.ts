import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'
import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'
import { extractProjectProductRefs } from './useCloneProjectWorkspace.shared'

type CloneProjectSummaryLike = {
  id: string
  title?: string
  description?: string
  status?: string
  updatedAt?: number
  currentStep?: string
  progressPercent?: number
  referenceVideoName?: string
  referenceVideoPath?: string
  coverAssetPath?: string
  previewOutputPath?: string
  previewReportPath?: string
  outputDir?: string
  finalOutputPath?: string
  selectedModelIdentityName?: string
  productReferenceImageCount?: number
  shotCount?: number
  generatedImageCount?: number
  generatedVideoCount?: number
  lastError?: string
}

export function useCloneProjectWorkspaceProject<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
) {
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Object.prototype.toString.call(value) === '[object Object]'

  const listIdentityKey = (item: unknown) => {
    if (!isPlainObject(item)) return ''
    const keys = ['id', 'shotId', 'taskId']
    for (const key of keys) {
      const value = String(item[key] ?? '').trim()
      if (value) return `${key}:${value}`
    }
    return ''
  }

  const patchArrayInPlace = (target: unknown[], source: unknown[]) => {
    const canPatchByIdentity =
      target.length > 0 &&
      source.length > 0 &&
      target.every((item) => Boolean(listIdentityKey(item))) &&
      source.every((item) => Boolean(listIdentityKey(item)))

    if (!canPatchByIdentity) {
      target.splice(0, target.length, ...source)
      return
    }

    const sourceMap = new Map(source.map((item) => [listIdentityKey(item), item]))
    const nextItems: unknown[] = []
    for (const sourceItem of source) {
      const identity = listIdentityKey(sourceItem)
      const currentItem = target.find((item) => listIdentityKey(item) === identity)
      if (isPlainObject(currentItem) && isPlainObject(sourceItem)) {
        patchObjectInPlace(currentItem, sourceItem)
        nextItems.push(currentItem)
      } else {
        nextItems.push(sourceItem)
      }
    }

    for (let index = target.length - 1; index >= 0; index -= 1) {
      const identity = listIdentityKey(target[index])
      if (identity && !sourceMap.has(identity)) {
        target.splice(index, 1)
      }
    }
    target.splice(0, target.length, ...nextItems)
  }

  const patchObjectInPlace = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const key of Object.keys(target)) {
      if (!(key in source)) {
        delete target[key]
      }
    }
    for (const [key, value] of Object.entries(source)) {
      const current = target[key]
      if (Array.isArray(value)) {
        if (Array.isArray(current)) {
          patchArrayInPlace(current, value)
          target[key] = current
        } else {
          target[key] = value.slice()
        }
        continue
      }
      if (isPlainObject(value)) {
        if (isPlainObject(current)) {
          patchObjectInPlace(current, value)
          continue
        }
        target[key] = { ...value }
        continue
      }
      target[key] = value
    }
  }

  const applyProject = (next: TProject | null) => {
    const currentProject = options.current.value
    if (!next) {
      options.current.value = null
    } else if (currentProject?.id && currentProject.id === next.id) {
      patchObjectInPlace(currentProject as Record<string, unknown>, next as Record<string, unknown>)
      options.current.value = currentProject
    } else {
      options.current.value = next
    }
    if (next?.referenceVideoPath) {
      options.referenceVideoPath.value = next.referenceVideoPath
    } else if ((!currentProject?.id || currentProject.id !== next?.id) && next?.referenceVideoPath === '' && next?.id) {
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

  const refreshRuntimeProject = async () => {
    const currentId = String(options.current.value?.id || '').trim()
    const currentProject = options.current.value
    if (!currentId || !currentProject) return
    if (hasStoredWebToken()) {
      const runtimeRes = await webApiClient.getCloneRuntime(currentId).catch(() => null)
      if (runtimeRes?.pipeline && options.applyPipelineStatus) {
        const next = options.applyPipelineStatus(currentProject, runtimeRes)
        applyProject(next)
      }
      return
    }
    const [summaryRes, pipelineStatus] = await Promise.all([
      window.api.clone.getProjectSummary({ cloneProjectId: currentId }) as Promise<CloneProjectSummaryLike>,
      window.api.clone.getClonePipelineStatus({ cloneProjectId: currentId }) as Promise<unknown>,
    ])
    const currentProjectRecord = currentProject as Record<string, unknown>
    const currentWorkflow = (currentProject.workflowV2 || {}) as Record<string, unknown>
    const currentPreviewPipeline = ((currentProject.previewPipeline || {}) as Record<string, unknown>)
    const currentFinalCompose = ((currentProject.finalCompose || {}) as Record<string, unknown>)
    const next = {
      ...currentProject,
      title: String(summaryRes?.title || currentProjectRecord.title || '').trim() || currentProjectRecord.title,
      description: String(summaryRes?.description || currentProjectRecord.description || '').trim() || currentProjectRecord.description,
      status: String(summaryRes?.status || currentProjectRecord.status || '').trim() || currentProjectRecord.status,
      updatedAt: Number(summaryRes?.updatedAt || currentProjectRecord.updatedAt || 0) || currentProjectRecord.updatedAt,
      referenceVideoName: String(summaryRes?.referenceVideoName || currentProjectRecord.referenceVideoName || '').trim() || currentProjectRecord.referenceVideoName,
      referenceVideoPath: String(summaryRes?.referenceVideoPath || currentProject.referenceVideoPath || '').trim() || currentProject.referenceVideoPath,
      outputDir: String(summaryRes?.outputDir || currentProject.outputDir || '').trim() || currentProject.outputDir,
      lastError: String(summaryRes?.lastError || currentProject.lastError || '').trim() || currentProject.lastError,
      pipelineStatus,
      workflowV2: {
        ...currentWorkflow,
        currentStep: String(summaryRes?.currentStep || currentWorkflow.currentStep || '').trim() || currentWorkflow.currentStep,
      },
      previewPipeline: {
        ...currentPreviewPipeline,
        status: String(summaryRes?.status || currentPreviewPipeline.status || '').trim() || currentPreviewPipeline.status,
        previewOutputPath:
          String(summaryRes?.previewOutputPath || currentPreviewPipeline.previewOutputPath || '').trim()
          || currentPreviewPipeline.previewOutputPath,
        previewReportPath:
          String(summaryRes?.previewReportPath || currentPreviewPipeline.previewReportPath || '').trim()
          || currentPreviewPipeline.previewReportPath,
        lastError: String(summaryRes?.lastError || currentPreviewPipeline.lastError || '').trim() || currentPreviewPipeline.lastError,
      },
      finalCompose: {
        ...currentFinalCompose,
        outputPath: String(summaryRes?.finalOutputPath || currentFinalCompose.outputPath || '').trim() || currentFinalCompose.outputPath,
        error: String(summaryRes?.lastError || currentFinalCompose.error || '').trim() || currentFinalCompose.error,
      },
    } as TProject
    applyProject(next)
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
    refreshRuntimeProject,
    ensureCurrentProjectReady,
    refreshProjectAfterFailure,
    loadProject,
    waitForStoryboardFrames,
  }
}
