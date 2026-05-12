import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'
import type {
  CloneProjectLike,
  ShotVideoGenerateResponse,
  ShotVideoSyncResponse,
  UseCloneProjectWorkspaceOptions,
} from './useCloneProjectWorkspace.shared'

type VideoProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null) => void
  ensureCurrentProjectReady: () => Promise<TProject | null>
  refreshProjectAfterFailure: () => Promise<void>
}

export function useCloneProjectWorkspaceVideo<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: VideoProjectActions<TProject>,
) {
  const shotLabel = (shotId: string) => options.shotLabel?.(shotId) || `分镜 ${shotId}`

  const generateShotVideos = async () => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    const ensuredProject = projectId ? options.current.value || (await projectActions.ensureCurrentProjectReady()) : await projectActions.ensureCurrentProjectReady()
    if (!ensuredProject?.id) {
      options.markError?.('请先完成前面的步骤。', '请先完成前面的步骤。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在根据分镜图和脚本生成视频片段。')
    try {
      options.pushRuntimeLog?.(
        `提交分镜视频生成：project=${ensuredProject.id} frames=${options.getStoryboardFrameCount?.() ?? 0}`,
        'info',
      )
      const res = hasStoredWebToken()
        ? ((await webApiClient.generateCloneShotVideos(ensuredProject.id)) as ShotVideoGenerateResponse<TProject>)
        : ((await window.api.clone.generateShotVideosFromStoryboard({
            cloneProjectId: ensuredProject.id,
          })) as ShotVideoGenerateResponse<TProject>)
      projectActions.applyProject((res.project || options.current.value) as TProject)
      const summary = res.queueSummary
      if (summary?.failed || summary?.pending || summary?.timeout) {
        options.pushRuntimeLog?.(
          `分镜视频生成返回：done=${summary.done || 0} failed=${summary.failed || 0} pending=${summary.pending || 0} timeout=${summary.timeout || 0}`,
          'error',
        )
        options.setStageLog?.(
          `分镜视频已继续执行：成功 ${summary.done || 0} 条，失败 ${summary.failed || 0} 条，云端待同步 ${summary.pending || 0} 条。失败项可选择继续查询或直接重新生成。`,
          'error',
        )
      } else {
        options.pushRuntimeLog?.(`分镜视频生成返回：done=${summary?.done || 0} failed=0 pending=0`, 'success')
        options.setStageLog?.('分镜视频已按脚本顺序全部生成完成，可在合成前检查区替换个别分镜。', 'success')
      }
    } catch (error: any) {
      options.pushRuntimeLog?.(`分镜视频生成异常：${String(error?.message ?? error ?? '未知错误')}`, 'error')
      options.markError?.(error?.message ?? error, '分镜视频生成失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('分镜视频生成失败。你可以同步云端状态，或对失败项直接重新生成。', 'error')
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
      const res = hasStoredWebToken()
        ? ((await webApiClient.syncCloneShotVideoTask(projectId, shotId)) as ShotVideoSyncResponse<TProject>)
        : ((await window.api.clone.syncShotVideoTask({
            cloneProjectId: projectId,
            shotId,
          })) as ShotVideoSyncResponse<TProject>)
      projectActions.applyProject((res.project || options.current.value) as TProject)
      const taskId = String(
        res.task?.taskId || options.current.value?.shotVideoOutputs?.find((item) => item.shotId === shotId)?.taskId || '',
      ).trim()
      if (res.synced) {
        options.setStageLog?.(`${shotLabel(shotId)} 已从云端同步成功。${taskId ? ` taskId=${taskId}` : ''}`, 'success')
      } else if (res.task?.status === 'failed') {
        options.setStageLog?.(`${shotLabel(shotId)} 云端仍然失败。${taskId ? ` taskId=${taskId}` : ''}`, 'error')
      } else {
        options.setStageLog?.(`${shotLabel(shotId)} 暂未拿到最终结果，保留 taskId 继续查询。${taskId ? ` taskId=${taskId}` : ''}`, 'info')
      }
    } catch (error: any) {
      options.markError?.(error?.message ?? error, `${shotLabel(shotId)} 云端状态同步失败。`)
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`${shotLabel(shotId)} 云端状态同步失败，请检查 taskId 后继续查询。`, 'error')
    } finally {
      if (options.loading) options.loading.value = false
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
      const res = hasStoredWebToken()
        ? ((await webApiClient.regenerateCloneShotVideo(projectId, shotId)) as { project?: TProject })
        : ((await window.api.clone.generateShotClip({
            cloneProjectId: projectId,
            shotId,
            forceRegenerate: true,
          })) as { project?: TProject })
      projectActions.applyProject((res.project || options.current.value) as TProject)
      options.setStageLog?.(`${shotLabel(shotId)} 强制重新生成已提交。`, 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, `${shotLabel(shotId)} 强制重新生成失败。`)
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.(`${shotLabel(shotId)} 强制重新生成失败，请检查右侧错误上下文。`, 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  const refreshRemoteStatus = async () => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) return
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    options.setStageLog?.('正在同步所有云端分镜任务状态。')
    try {
      if (hasStoredWebToken()) {
        const [projectRes, runtimeRes] = await Promise.all([
          webApiClient.getCloneProject(projectId),
          webApiClient.getCloneRuntime(projectId).catch(() => null),
        ])
        let next = (projectRes?.project || options.current.value) as TProject
        if (runtimeRes?.pipeline && options.applyPipelineStatus) {
          next = options.applyPipelineStatus(next, runtimeRes)
        }
        projectActions.applyProject(next)
      } else {
        const res = (await window.api.clone.refreshProjectStatus({
          cloneProjectId: projectId,
        })) as { project?: TProject }
        projectActions.applyProject((res.project || options.current.value) as TProject)
      }
      options.setStageLog?.('云端状态同步完成。', 'success')
    } catch (error: any) {
      options.markError?.(error?.message ?? error, '云端状态同步失败。')
      options.setStageLog?.('云端状态同步失败，请稍后再试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  return {
    generateShotVideos,
    syncFailedShotVideo,
    replaceShotVideo,
    regenerateShotClip,
    refreshRemoteStatus,
  }
}
