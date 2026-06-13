import type {
  CloneProjectLike,
  ShotVideoGenerateResponse,
  ShotVideoSyncResponse,
  UseCloneProjectWorkspaceOptions,
} from './useCloneProjectWorkspace.shared'

type VideoProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null, mode?: 'patch' | 'replace') => void
  ensureCurrentProjectReady: () => Promise<TProject | null>
  refreshProjectAfterFailure: () => Promise<void>
}

type ShotVideoSyncSource = 'manual_sync' | 'manual_pending_sync' | 'auto_timer_sync' | 'auto_download_recovery'

export function useCloneProjectWorkspaceVideo<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: VideoProjectActions<TProject>,
) {
  const shotLabel = (shotId: string) => options.shotLabel?.(shotId) || `分镜 ${shotId}`

  const isStaleImageTaskId = (value?: string) => {
    const taskId = String(value || '').trim().toLowerCase()
    return taskId.startsWith('gpt_frame_') || taskId.startsWith('mj_')
  }

  const formatPoolSummary = (summary?: {
    submitActive?: number
    pollActive?: number
    downloadActive?: number
    submitQueued?: number
    pollQueued?: number
    downloadQueued?: number
  }) =>
    `提交 ${summary?.submitActive || 0}/${summary?.submitQueued || 0}，续查 ${summary?.pollActive || 0}/${summary?.pollQueued || 0}，下载 ${summary?.downloadActive || 0}/${summary?.downloadQueued || 0}`

  const pendingStatuses = new Set([
    'idle',
    'submitting',
    'remote_pending',
    'remote_running',
    'remote_succeeded_pending_download',
    'downloading',
    'polling_timeout',
    'failed_retryable',
  ])

  const isAutomaticSyncSource = (source: ShotVideoSyncSource) =>
    source === 'auto_timer_sync' || source === 'auto_download_recovery'

  const resolveShotOutputVideoPath = (item?: { videoPath?: string; localPath?: string } | null) =>
    String(item?.videoPath || item?.localPath || '').trim()

  const effectiveShotTaskId = (shotId: string) => {
    const id = String(shotId || '').trim()
    if (!id) return ''
    const outputTaskId = String(options.current.value?.shotVideoOutputs?.find((item) => item.shotId === id)?.taskId || '').trim()
    if (outputTaskId && !isStaleImageTaskId(outputTaskId)) return outputTaskId
    const blueprintTaskId = String(options.current.value?.blueprint?.shots?.find((item) => item.id === id)?.generatedTaskId || '').trim()
    if (isStaleImageTaskId(blueprintTaskId)) return ''
    return blueprintTaskId
  }

  const resolveShotVideoTaskIdFromProject = (project: TProject | null | undefined, shotId: string) => {
    const id = String(shotId || '').trim()
    if (!project || !id) return ''
    const outputTaskId = String(project.shotVideoOutputs?.find((item) => item.shotId === id)?.taskId || '').trim()
    if (outputTaskId && !isStaleImageTaskId(outputTaskId)) return outputTaskId
    const blueprintTaskId = String(project.blueprint?.shots?.find((item) => item.id === id)?.generatedTaskId || '').trim()
    if (isStaleImageTaskId(blueprintTaskId)) return ''
    return blueprintTaskId
  }

  const isPendingSyncItem = (item: NonNullable<TProject['shotVideoOutputs']>[number]) => {
    const normalizedStatus = String(item.status || '').toLowerCase()
    const retryCount = Number(item.retryCount ?? 0)
    if (resolveShotOutputVideoPath(item)) return false
    if (
      (normalizedStatus === 'remote_succeeded_pending_download' || normalizedStatus === 'downloading') &&
      String(item.videoUrl || '').trim()
    ) {
      return true
    }
    if (!effectiveShotTaskId(item.shotId)) return false
    if (normalizedStatus === 'failed_retryable' && retryCount >= 2) return false
    return pendingStatuses.has(normalizedStatus)
  }

  const collectPendingSyncItems = (project: TProject | null | undefined) => {
    if (!project) return [] as Array<NonNullable<TProject['shotVideoOutputs']>[number]>
    const outputs = Array.isArray(project.shotVideoOutputs) ? project.shotVideoOutputs : []
    const outputMap = new Map(outputs.map((item) => [String(item.shotId || '').trim(), item]))
    const shotIds = new Set<string>()

    for (const item of outputs) {
      const shotId = String(item.shotId || '').trim()
      if (shotId) shotIds.add(shotId)
    }

    for (const shot of project.blueprint?.shots ?? []) {
      const shotId = String(shot.id || '').trim()
      if (shotId) shotIds.add(shotId)
    }

    const pendingItems: Array<NonNullable<TProject['shotVideoOutputs']>[number]> = []
    for (const shotId of shotIds) {
      const output = outputMap.get(shotId)
      const blueprintShot = project.blueprint?.shots?.find((item) => String(item.id || '').trim() === shotId)
      const mergedItem = {
        ...(output || {}),
        shotId,
        taskId: String(output?.taskId || '').trim() || String(blueprintShot?.generatedTaskId || '').trim() || undefined,
        status: String(output?.status || '').trim() || 'idle',
        videoPath: String(output?.videoPath || output?.localPath || '').trim() || undefined,
        localPath: String(output?.localPath || output?.videoPath || '').trim() || undefined,
        videoUrl: String(output?.videoUrl || '').trim() || undefined,
        remoteStatus: String(output?.remoteStatus || '').trim() || undefined,
        error: String(output?.error || blueprintShot?.error || '').trim() || undefined,
        retryCount: typeof output?.retryCount === 'number' ? output.retryCount : blueprintShot?.retryCount,
      } as NonNullable<TProject['shotVideoOutputs']>[number]
      if (isPendingSyncItem(mergedItem)) pendingItems.push(mergedItem)
    }

    return pendingItems
  }

  const countPendingSyncItems = (project: TProject | null | undefined) => collectPendingSyncItems(project).length

  const logSyncStats = (
    kind: 'shot-video-sync' | 'shot-video-pending-sync',
    phase: 'start' | 'done' | 'failed',
    payload: Record<string, unknown>,
    level: 'info' | 'error' = 'info',
  ) => {
    options.pushRuntimeLog?.(`[clone-debug] ${kind}:${phase} ${JSON.stringify(payload)}`, level)
  }

  const generateShotVideos = async () => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    const ensuredProject = projectId
      ? options.current.value || (await projectActions.ensureCurrentProjectReady())
      : await projectActions.ensureCurrentProjectReady()
    if (!ensuredProject?.id) {
      options.markError?.('请先完成前面的步骤。', '请先完成前面的步骤。')
      return
    }
    options.errorText.value = ''
    options.setStageLog?.('正在提交分镜视频任务，后台会分池推进提交、续查与下载。')
    try {
      const resolved = await options.getWorkspaceClient?.(ensuredProject.id)
      const res = (await resolved?.client.generateShotVideos(ensuredProject.id)) as ShotVideoGenerateResponse<TProject>
      projectActions.applyProject((res.project || options.current.value) as TProject, 'replace')
      const summary = res.queueSummary
      if (summary?.failed || summary?.pending || summary?.timeout) {
        options.setStageLog?.(
          `分镜视频已进入后台调度：成功 ${summary.done || 0} 条，失败 ${summary.failed || 0} 条，待续查 ${summary.pending || 0} 条。当前队列：${formatPoolSummary(summary)}`,
          'error',
        )
      } else {
        options.setStageLog?.(`分镜视频调度完成，当前通道：${resolved?.channel || 'unknown'}，当前队列：${formatPoolSummary(summary)}`, 'success')
      }
    } catch (error: any) {
      options.pushRuntimeLog?.(`分镜视频异常：${String(error?.message ?? error ?? '未知错误')}`, 'error')
      options.markError?.(error?.message ?? error, '分镜视频失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('分镜视频失败。你可以同步状态，或对失败项重新生成。', 'error')
    }
  }

  const autoRunToStoryboardVideos = async (input?: {
    variantCount?: number
    selectedModelIdentityId?: string
    productReferenceImagePaths?: string[]
    autoBindModelPack?: boolean
  }) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    const ensuredProject = projectId
      ? options.current.value || (await projectActions.ensureCurrentProjectReady())
      : await projectActions.ensureCurrentProjectReady()
    if (!ensuredProject?.id) {
      options.markError?.('请先完成参考视频分析并创建项目。', '请先完成参考视频分析并创建项目。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在自动推进到分镜视频阶段，任务会拆分为提交、续查、下载三条后台通道。')
    try {
      const selectedModelIdentityId = String(
        input?.selectedModelIdentityId ||
          options.selectedModelId.value ||
          options.current.value?.selectedModelIdentitySnapshot?.id ||
          '',
      ).trim() || undefined
      const productReferenceImagePaths = Array.isArray(input?.productReferenceImagePaths)
        ? input.productReferenceImagePaths.map((item) => String(item || '').trim()).filter(Boolean)
        : undefined
      const res = (await window.api.clone.autoRunToStoryboardVideos({
        cloneProjectId: ensuredProject.id,
        variantCount: Math.max(1, Math.min(6, Number(input?.variantCount ?? options.variantCount?.value ?? 3) || 3)),
        selectedModelIdentityId,
        productReferenceImagePaths,
        autoBindModelPack: input?.autoBindModelPack,
      })) as {
        project?: TProject
        queueSummary?: {
          done?: number
          failed?: number
          timeout?: number
          submitActive?: number
          pollActive?: number
          downloadActive?: number
          submitQueued?: number
          pollQueued?: number
          downloadQueued?: number
        }
        frameErrors?: Array<{ shotId: string; reason: string }>
        videoErrors?: Array<{ shotId: string; reason: string }>
      }
      projectActions.applyProject((res.project || options.current.value) as TProject, 'replace')
      const frameFailed = Number(res.frameErrors?.length ?? 0)
      const videoFailed = Number(res.queueSummary?.failed ?? 0) + Number(res.queueSummary?.timeout ?? 0)
      const totalFailed = frameFailed + videoFailed
      if (totalFailed > 0) {
        options.setStageLog?.(
          `自动流程已完成，但有 ${totalFailed} 个镜头失败。视频队列：${formatPoolSummary(res.queueSummary)}`,
          'error',
        )
      } else {
        options.setStageLog?.(`自动流程已完成，已停在分镜视频阶段。视频队列：${formatPoolSummary(res.queueSummary)}`, 'success')
      }
    } catch (error: any) {
      const reason = String(error?.message ?? error ?? '未知错误')
      options.pushRuntimeLog?.(`自动流程异常：${reason}`, 'error')
      options.markError?.(reason, '自动流程失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`自动流程失败：${reason}`, 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const syncFailedShotVideo = async (shotId: string) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) return
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.(`正在继续查询 ${shotLabel(shotId)} 的云端任务结果。`)
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const res = (await resolved?.client.syncShotVideoTask(projectId, shotId)) as ShotVideoSyncResponse<TProject>
      projectActions.applyProject((res.project || options.current.value) as TProject, 'replace')
      const latestProject = ((await resolved?.client.getProject(projectId))?.project || options.current.value) as TProject
      projectActions.applyProject(latestProject, 'replace')
      const taskId = String(
        res.task?.taskId || latestProject?.shotVideoOutputs?.find((item) => item.shotId === shotId)?.taskId || '',
      ).trim()
      if (res.synced) {
        options.setStageLog?.(`${shotLabel(shotId)} 已从云端同步成功${taskId ? ` taskId=${taskId}` : ''}`, 'success')
      } else if (res.task?.status === 'failed_retryable' || res.task?.status === 'failed_terminal') {
        options.setStageLog?.(`${shotLabel(shotId)} 云端仍然失败${taskId ? ` taskId=${taskId}` : ''}`, 'error')
      } else {
        options.setStageLog?.(`${shotLabel(shotId)} 暂未拿到最终结果，保留 taskId 继续查询${taskId ? ` taskId=${taskId}` : ''}`, 'info')
      }
    } catch (error: any) {
      options.markError?.(error?.message ?? error, `${shotLabel(shotId)} 云端状态同步失败。`)
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`${shotLabel(shotId)} 云端状态同步失败，请检查 taskId 后继续查询。`, 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const forceDownloadShotVideoResult = async (shotId: string) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) return
    options.errorText.value = ''
    options.setStageLog?.(`正在强制下载回写 ${shotLabel(shotId)} 的云端视频结果。`)
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const res = (await resolved?.client.forceDownloadShotVideoResult(projectId, shotId)) as ShotVideoSyncResponse<TProject>
      projectActions.applyProject((res.project || options.current.value) as TProject, 'replace')
      const latestProject = ((await resolved?.client.getProject(projectId))?.project || options.current.value) as TProject
      projectActions.applyProject(latestProject, 'replace')
      const taskId = String(
        res.task?.taskId || latestProject?.shotVideoOutputs?.find((item) => item.shotId === shotId)?.taskId || '',
      ).trim()
      if (res.synced) {
        options.setStageLog?.(`${shotLabel(shotId)} 已完成下载回写${taskId ? ` taskId=${taskId}` : ''}`, 'success')
      } else {
        options.setStageLog?.(`${shotLabel(shotId)} 下载回写失败${taskId ? ` taskId=${taskId}` : ''}`, 'error')
      }
    } catch (error: any) {
      options.markError?.(error?.message ?? error, `${shotLabel(shotId)} 强制下载回写失败。`)
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`${shotLabel(shotId)} 强制下载回写失败，请稍后重试。`, 'error')
    }
  }

  const replaceShotVideo = async (shotId: string, videoPath: string) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId || !String(videoPath || '').trim()) return
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.(`正在替换 ${shotLabel(shotId)}。`)
    try {
      const res = (await window.api.clone.replaceShotVideo({
        cloneProjectId: projectId,
        shotId,
        videoPath,
      })) as { project?: TProject }
      projectActions.applyProject((res.project || options.current.value) as TProject)
      options.setStageLog?.(`${shotLabel(shotId)} 已替换，可重新合成最终成片。`, 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '分镜替换失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('分镜替换失败，请重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const regenerateShotClip = async (shotId: string) => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) return
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.(`正在放弃旧任务并强制重新生成 ${shotLabel(shotId)}。`)
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const res = await resolved?.client.regenerateShotVideo(projectId, shotId)
      let latestProject = ((await resolved?.client.getProject(projectId))?.project || res?.project || options.current.value) as TProject
      const nextProject = latestProject as TProject
      projectActions.applyProject(nextProject, 'replace')
      const taskId = String((res as { task?: { taskId?: string } } | undefined)?.task?.taskId || resolveShotVideoTaskIdFromProject(nextProject, shotId) || '').trim()
      const runtime = (res?.project as TProject | undefined)?.generationQueue?.runtime
      const poolSummary =
        runtime && (Number(runtime.submitActive || 0) > 0 || Number(runtime.pollActive || 0) > 0 || Number(runtime.downloadActive || 0) > 0)
          ? `，当前队列：${formatPoolSummary(runtime)}`
          : ''
      if (res?.executionMode === 'blocking_completed') {
        options.setStageLog?.(`${shotLabel(shotId)} 已同步生成完成，当前通道：${resolved?.channel || 'unknown'}${poolSummary}`, 'success')
      } else {
        try {
          const synced = await resolved?.client.syncShotVideoTask(projectId, shotId)
          latestProject = ((await resolved?.client.getProject(projectId))?.project || synced?.project || latestProject) as TProject
          projectActions.applyProject(latestProject, 'replace')
          const latestOutput = latestProject?.shotVideoOutputs?.find((item) => item.shotId === shotId)
          const hasLocalVideo = Boolean(String(latestOutput?.videoPath || latestOutput?.localPath || '').trim())
          if (!hasLocalVideo) {
            const forced = await resolved?.client.forceDownloadShotVideoResult(projectId, shotId)
            latestProject = ((await resolved?.client.getProject(projectId))?.project || forced?.project || latestProject) as TProject
            projectActions.applyProject(latestProject, 'replace')
          }
        } catch (syncError: any) {
          options.pushRuntimeLog?.(
            `[clone-debug] regenerate-shot-video:post-sync-failed project=${projectId} shot=${shotId} message=${String(syncError?.message ?? syncError ?? 'unknown error')}`,
            'error',
          )
        }
        options.setStageLog?.(
          `${shotLabel(shotId)} 强制重新生成已提交${taskId ? `，新 taskId=${taskId}` : ''}，后台会继续查询并在完成后自动下载回写，当前通道：${resolved?.channel || 'unknown'}${poolSummary}`,
          'success',
        )
      }
    } catch (error: any) {
      options.pushRuntimeLog?.(
        `分镜视频强制重新生成异常：project=${projectId} shot=${shotId} message=${String(error?.message ?? error ?? '未知错误')}`,
        'error',
      )
      options.markError?.(error?.message ?? error, `${shotLabel(shotId)} 强制重新生成失败。`)
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`${shotLabel(shotId)} 强制重新生成失败，请检查右侧错误上下文。`, 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const refreshRemoteStatus = async (source: ShotVideoSyncSource = 'manual_sync') => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) return
    const shouldToggleLoading = !isAutomaticSyncSource(source)
    if (shouldToggleLoading && options.loading) options.loading.value = true
    options.errorText.value = ''
    if (source === 'manual_sync') {
      options.setStageLog?.('正在同步所有云端分镜任务状态。')
    }
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      const res = (await window.api.clone.reconcileRemoteStoryboardVideos({
        cloneProjectId: projectId,
      })) as {
        project?: TProject
        results?: Array<{ shotId: string; status: string; synced?: boolean; error?: string }>
      }
      const resultCount = Array.isArray(res.results) ? res.results.length : 0
      logSyncStats('shot-video-sync', 'start', { source, projectId, shotCount: resultCount })
      projectActions.applyProject((res.project || options.current.value) as TProject, 'replace')
      const latestProject = ((await resolved?.client.getProject(projectId))?.project || options.current.value) as TProject
      projectActions.applyProject(latestProject, 'replace')
      const syncedCount = Array.isArray(res.results) ? res.results.filter((item) => item.synced).length : 0
      const failedCount = Array.isArray(res.results)
        ? res.results.filter((item) => {
            const status = String(item.status || '').toLowerCase()
            return status === 'failed' || status === 'failed_retryable' || status === 'failed_terminal'
          }).length
        : 0
      const pendingCount = countPendingSyncItems(latestProject)
      logSyncStats(
        'shot-video-sync',
        'done',
        { source, projectId, shotCount: resultCount, syncedCount, failedCount, pendingCount },
        failedCount ? 'error' : 'info',
      )
      if (source === 'manual_sync') {
        options.setStageLog?.(
          `云端状态同步完成，已处理 ${resultCount} 个分镜，同步回写 ${syncedCount} 个，失败 ${failedCount} 个，当前通道：${resolved?.channel || 'unknown'}`,
          failedCount ? 'error' : 'success',
        )
      }
    } catch (error: any) {
      logSyncStats('shot-video-sync', 'failed', {
        source,
        projectId,
        message: String(error?.message ?? error ?? 'unknown error'),
      }, 'error')
      if (source === 'manual_sync') {
        options.markError?.(error?.message ?? error, '云端状态同步失败。')
        options.setStageLog?.('云端状态同步失败，请稍后再试。', 'error')
      }
    } finally {
      if (shouldToggleLoading && options.loading) options.loading.value = false
    }
  }

  const syncPendingShotVideos = async (source: ShotVideoSyncSource = 'manual_pending_sync') => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) return
    const pendingItems = collectPendingSyncItems(options.current.value)
    if (!pendingItems.length) {
      if (source === 'manual_pending_sync') {
        options.setStageLog?.('当前没有可手动查询的待回写分镜任务。')
      }
      return
    }
    const shouldToggleLoading = !isAutomaticSyncSource(source)
    if (shouldToggleLoading && options.loading) options.loading.value = true
    options.errorText.value = ''
    if (source === 'manual_pending_sync') {
      options.setStageLog?.(`正在手动查询 ${pendingItems.length} 个待回写分镜任务。`)
    }
    try {
      const resolved = await options.getWorkspaceClient?.(projectId)
      logSyncStats('shot-video-pending-sync', 'start', { source, projectId, shotCount: pendingItems.length })
      for (const item of pendingItems) {
        const shotId = String(item.shotId || '').trim()
        if (!shotId) continue
        const status = String(item.status || '').toLowerCase()
        const hasDownloadableVideoUrl =
          (status === 'remote_succeeded_pending_download' || status === 'downloading') &&
          Boolean(String(item.videoUrl || '').trim())
        const res = (hasDownloadableVideoUrl
          ? await resolved?.client.forceDownloadShotVideoResult(projectId, shotId)
          : await resolved?.client.syncShotVideoTask(projectId, shotId)) as ShotVideoSyncResponse<TProject>
        projectActions.applyProject((res.project || options.current.value) as TProject, 'replace')
      }
      const latestProject = ((await resolved?.client.getProject(projectId))?.project || options.current.value) as TProject
      projectActions.applyProject(latestProject, 'replace')
      const pendingCount = countPendingSyncItems(latestProject)
      const syncedCount = Math.max(0, pendingItems.length - pendingCount)
      logSyncStats('shot-video-pending-sync', 'done', {
        source,
        projectId,
        shotCount: pendingItems.length,
        syncedCount,
        pendingCount,
      })
      if (source === 'manual_pending_sync') {
        options.setStageLog?.(`手动查询完成，已轮询 ${pendingItems.length} 个分镜任务。`, 'success')
      }
    } catch (error: any) {
      logSyncStats('shot-video-pending-sync', 'failed', {
        source,
        projectId,
        shotCount: pendingItems.length,
        message: String(error?.message ?? error ?? 'unknown error'),
      }, 'error')
      if (source === 'manual_pending_sync') {
        options.markError?.(error?.message ?? error, '手动查询待回写分镜任务失败。')
        await projectActions.refreshProjectAfterFailure()
        options.setStageLog?.('手动查询失败，请稍后重试。', 'error')
      }
    } finally {
      if (shouldToggleLoading && options.loading) options.loading.value = false
    }
  }

  return {
    generateShotVideos,
    autoRunToStoryboardVideos,
    syncFailedShotVideo,
    forceDownloadShotVideoResult,
    replaceShotVideo,
    regenerateShotClip,
    refreshRemoteStatus,
    syncPendingShotVideos,
  }
}
