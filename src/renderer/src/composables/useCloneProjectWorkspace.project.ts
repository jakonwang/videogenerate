import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'
import { extractProjectProductRefs } from './useCloneProjectWorkspace.shared'

type CloneProjectSummaryLike = {
  id: string
  title?: string
  description?: string
  status?: string
  updatedAt?: number
  currentStep?: string
  referenceVideoName?: string
  referenceVideoPath?: string
  previewOutputPath?: string
  previewReportPath?: string
  outputDir?: string
  finalOutputPath?: string
  lastError?: string
}

export function useCloneProjectWorkspaceProject<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
) {
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Object.prototype.toString.call(value) === '[object Object]'

  const listIdentityKey = (item: unknown) => {
    if (!isPlainObject(item)) return ''
    for (const key of ['id', 'shotId', 'taskId']) {
      const value = String(item[key] ?? '').trim()
      if (value) return `${key}:${value}`
    }
    return ''
  }

  const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

  const patchArrayInPlace = (target: unknown[], source: unknown[]) => {
    const safeTarget = asArray(target)
    const safeSource = asArray(source)
    const canPatchByIdentity =
      safeTarget.length > 0 &&
      safeSource.length > 0 &&
      safeTarget.every((item) => Boolean(listIdentityKey(item))) &&
      safeSource.every((item) => Boolean(listIdentityKey(item)))

    if (!canPatchByIdentity) {
      safeTarget.splice(0, safeTarget.length, ...safeSource)
      return
    }

    const sourceMap = new Map(safeSource.map((item) => [listIdentityKey(item), item]))
    const nextItems: unknown[] = []
    for (const sourceItem of safeSource) {
      const identity = listIdentityKey(sourceItem)
      const currentItem = safeTarget.find((item) => listIdentityKey(item) === identity)
      if (isPlainObject(currentItem) && isPlainObject(sourceItem)) {
        patchObjectInPlace(currentItem, sourceItem)
        nextItems.push(currentItem)
      } else {
        nextItems.push(sourceItem)
      }
    }

    for (let index = safeTarget.length - 1; index >= 0; index -= 1) {
      const identity = listIdentityKey(safeTarget[index])
      if (identity && !sourceMap.has(identity)) {
        safeTarget.splice(index, 1)
      }
    }
    safeTarget.splice(0, safeTarget.length, ...nextItems)
  }

  const patchObjectInPlace = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const key of Object.keys(target)) {
      if (!(key in source)) delete target[key]
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
        } else {
          target[key] = { ...value }
        }
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
    if (Array.isArray(options.productRefsDraft.value)) {
      const same =
        options.productRefsDraft.value.length === nextRefs.length &&
        options.productRefsDraft.value.every((item, index) => item === nextRefs[index])
      if (same) options.productRefsDraft.value = null
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
    const projectId = String(options.current.value?.id || '').trim()
    if (!projectId) return
    const resolved = await options.getWorkspaceClient?.(projectId)
    if (!resolved) return
    const [projectRes, runtimeRes] = await Promise.all([
      resolved.client.getProject(projectId),
      resolved.client.getRuntime(projectId).catch(() => null),
    ])
    let next = (projectRes?.project || options.current.value) as TProject
    if (runtimeRes?.pipeline && options.applyPipelineStatus) {
      next = options.applyPipelineStatus(next, runtimeRes)
    }
    applyProject(next)
  }

  const refreshRuntimeProject = async () => {
    const currentId = String(options.current.value?.id || '').trim()
    const currentProject = options.current.value
    if (!currentId || !currentProject) return
    const resolved = await options.getWorkspaceClient?.(currentId)
    if (!resolved) return

    const runtimeRes = await resolved.client.getRuntime(currentId).catch(() => null)
    if (runtimeRes?.pipeline && options.applyPipelineStatus) {
      applyProject(options.applyPipelineStatus(currentProject, runtimeRes))
      return
    }

    if (resolved.channel === 'electron-ipc') {
      const [summaryRes, pipelineStatus] = await Promise.all([
        window.api.clone.getProjectSummary({ cloneProjectId: currentId }) as Promise<CloneProjectSummaryLike>,
        window.api.clone.getClonePipelineStatus({ cloneProjectId: currentId }) as Promise<unknown>,
      ])
      const currentProjectRecord = currentProject as Record<string, unknown>
      const currentWorkflow = (currentProject.workflowV2 || {}) as Record<string, unknown>
      const currentPreviewPipeline = (currentProject.previewPipeline || {}) as Record<string, unknown>
      const currentFinalCompose = (currentProject.finalCompose || {}) as Record<string, unknown>
      const next = {
        ...currentProject,
        title: String(summaryRes?.title || currentProjectRecord.title || '').trim() || currentProjectRecord.title,
        description:
          String(summaryRes?.description || currentProjectRecord.description || '').trim() || currentProjectRecord.description,
        status: String(summaryRes?.status || currentProjectRecord.status || '').trim() || currentProjectRecord.status,
        updatedAt: Number(summaryRes?.updatedAt || currentProjectRecord.updatedAt || 0) || currentProjectRecord.updatedAt,
        referenceVideoName:
          String(summaryRes?.referenceVideoName || currentProjectRecord.referenceVideoName || '').trim() ||
          currentProjectRecord.referenceVideoName,
        referenceVideoPath:
          String(summaryRes?.referenceVideoPath || currentProject.referenceVideoPath || '').trim() || currentProject.referenceVideoPath,
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
            String(summaryRes?.previewOutputPath || currentPreviewPipeline.previewOutputPath || '').trim() ||
            currentPreviewPipeline.previewOutputPath,
          previewReportPath:
            String(summaryRes?.previewReportPath || currentPreviewPipeline.previewReportPath || '').trim() ||
            currentPreviewPipeline.previewReportPath,
          lastError: String(summaryRes?.lastError || currentPreviewPipeline.lastError || '').trim() || currentPreviewPipeline.lastError,
        },
        finalCompose: {
          ...currentFinalCompose,
          outputPath:
            String(summaryRes?.finalOutputPath || currentFinalCompose.outputPath || '').trim() || currentFinalCompose.outputPath,
          error: String(summaryRes?.lastError || currentFinalCompose.error || '').trim() || currentFinalCompose.error,
        },
      } as TProject
      applyProject(next)
    }
  }

  const ensureCurrentProjectReady = async () => {
    const currentId = String(options.current.value?.id || '').trim()
    if (!currentId) return null
    try {
      const resolved = await options.getWorkspaceClient?.(currentId)
      const result = resolved ? await resolved.client.getProject(currentId) : null
      const project = (result?.project || null) as TProject | null
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
    const resolved = await options.getWorkspaceClient?.(projectId)
    const [projectRes, runtimeRes] = resolved
      ? await Promise.all([
          resolved.client.getProject(projectId),
          resolved.client.getRuntime(projectId).catch(() => null),
        ])
      : [null, null]
    let next = (projectRes?.project || null) as TProject | null
    if (next && runtimeRes?.pipeline && options.applyPipelineStatus) {
      next = options.applyPipelineStatus(next, runtimeRes)
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
      const resolved = await options.getWorkspaceClient?.(projectId)
      if (!resolved) return null
      const [projectRes, runtimeRes] = await Promise.all([
        resolved.client.getProject(projectId),
        resolved.client.getRuntime(projectId).catch(() => null),
      ])
      latestProject = (projectRes?.project || null) as TProject | null
      if (latestProject && runtimeRes?.pipeline && options.applyPipelineStatus) {
        latestProject = options.applyPipelineStatus(latestProject, runtimeRes)
      }
      if (latestProject?.id) {
        applyProject(latestProject)
        const shots = latestProject.blueprint?.shots ?? []
        const hasAnyFrame = shots.some((shot) =>
          Boolean(String(shot.gptFirstFramePath || '').trim() || String(shot.generatedFirstFramePath || '').trim()),
        )
        if (hasAnyFrame) return latestProject
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
