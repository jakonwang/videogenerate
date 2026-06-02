import { cloneRepo } from './repo'
import type { CloneProject } from './types'

export type CloneRemoteStoryboardRecoveryDeps = {
  ensureCloneFlowState: (project: CloneProject) => void
  projectBlueprintShots: (project: CloneProject) => any[]
  refreshGenerationQueueRuntime: (projectId: string) => Promise<any>
  mapWithConcurrency: <T>(items: T[], concurrency: number, worker: (item: T) => Promise<unknown>) => Promise<unknown>
  globalVideoTaskLimits: { poll: number; download: number }
  resolveShotVideoOutput: (project: CloneProject, shot: any) => any
  checkLocalTaskStatus: (input: { project: CloneProject; shot: any }) => Promise<any>
  syncSegmentVideoOutput: (project: CloneProject, shot: any, patch: any) => void
  replaceProjectShot: (project: CloneProject, shotId: string, patch: any) => void
  now: () => number
  isRecoverableVideoStatus: (status: string) => boolean
  setProjectErrorContext: (project: CloneProject, context: any) => void
  apifoxContextByCapability: (credentials: any, capability: any) => any
  runVideoTaskPoolJob: (input: { pool: 'poll' | 'download'; project: CloneProject; worker: () => Promise<any> }) => Promise<any>
  downloadCompletedSegmentTask: (input: { project: CloneProject; shot: any }) => Promise<any>
  pollExistingSegmentTask: (input: { project: CloneProject; shot: any; waitMs: number; allowFailed?: boolean; skipDownload?: boolean }) => Promise<any>
}

export function createCloneRemoteStoryboardRecovery(deps: CloneRemoteStoryboardRecoveryDeps) {
  async function reconcileRemoteStoryboardVideosInternal(projectId: string) {
    let project = await cloneRepo.getProject(projectId)
    if (!project) throw new Error('复刻项目不存在')
    deps.ensureCloneFlowState(project)
    const results: Array<{ shotId: string; status: string; taskId?: string; synced?: boolean; error?: string }> = []
    const shots = deps.projectBlueprintShots(project).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    await deps.refreshGenerationQueueRuntime(project.id)
    await deps.mapWithConcurrency(
      shots,
      Math.min(shots.length || 1, deps.globalVideoTaskLimits.poll + deps.globalVideoTaskLimits.download),
      async (shot) => {
        const latestProject = await cloneRepo.getProject(projectId)
        if (!latestProject) return
        project = latestProject
        const currentProject = latestProject
        const output = deps.resolveShotVideoOutput(currentProject, shot)
        const local = await deps.checkLocalTaskStatus({ project: currentProject, shot })
        if (local.skip) {
          console.log('[clone-debug] shot-video-reconcile:local-result-hit', {
            projectId,
            shotId: shot.id,
            taskId: local.taskId || output.taskId || undefined,
            videoPath: local.videoPath,
            previousStatus: output.status,
          })
          deps.syncSegmentVideoOutput(currentProject, shot, {
            status: 'done',
            taskId: local.taskId || output.taskId,
            videoPath: local.videoPath,
            localPath: local.videoPath,
            error: undefined,
            completedAt: output.completedAt || deps.now(),
          })
          deps.replaceProjectShot(currentProject, shot.id, {
            status: 'done',
            generatedClipPath: local.videoPath,
            generatedTaskId: local.taskId || output.taskId,
            error: '',
          })
          project = await cloneRepo.upsertProject(currentProject)
          results.push({ shotId: shot.id, status: 'done', taskId: local.taskId || output.taskId, synced: true })
          await deps.refreshGenerationQueueRuntime(project.id)
          return
        }
        const recoverTaskId = String(output.taskId || shot.generatedTaskId || '').trim()
        if (String(output.videoUrl || '').trim()) {
          const downloaded = await deps.runVideoTaskPoolJob({
            pool: 'download',
            project: currentProject,
            worker: () => deps.downloadCompletedSegmentTask({ project: currentProject, shot }),
          })
          results.push({
            shotId: shot.id,
            status: downloaded.status,
            taskId: recoverTaskId || undefined,
            synced: downloaded.status === 'done',
            error: downloaded.status === 'failed' ? downloaded.reason : undefined,
          })
          await deps.refreshGenerationQueueRuntime(project.id)
          return
        }
        if (output.status === 'done') return
        if (!deps.isRecoverableVideoStatus(output.status)) return
        if (!recoverTaskId) {
          const reason = '当前分镜缺少可继续查询的 taskId，已跳过远端续查，请重新生成该分镜视频。'
          deps.syncSegmentVideoOutput(currentProject, shot, {
            status: 'failed',
            error: reason,
            lastPollAt: deps.now(),
          })
          deps.replaceProjectShot(currentProject, shot.id, {
            status: 'failed',
            error: reason,
            generatedTaskId: undefined,
          })
          currentProject.lastError = reason
          deps.setProjectErrorContext(currentProject, {
            ...deps.apifoxContextByCapability(await cloneRepo.getCredentials(), 'video_start_end_to_video'),
            action: 'reconcile_remote_storyboard_videos_missing_task_id',
            message: reason,
            responseSnippet: JSON.stringify({
              shotId: shot.id,
              shotStatus: shot.status,
              outputStatus: output.status,
            }).slice(0, 500),
          })
          project = await cloneRepo.upsertProject(currentProject)
          results.push({ shotId: shot.id, status: 'failed', error: reason, synced: false })
          await deps.refreshGenerationQueueRuntime(project.id)
          return
        }
        if (String(output.status || '').trim().toLowerCase() === 'downloading' && String(output.videoUrl || '').trim()) {
          const downloaded = await deps.runVideoTaskPoolJob({
            pool: 'download',
            project: currentProject,
            worker: () => deps.downloadCompletedSegmentTask({ project: currentProject, shot }),
          })
          results.push({
            shotId: shot.id,
            status: downloaded.status,
            taskId: recoverTaskId,
            synced: downloaded.status === 'done',
            error: downloaded.status === 'failed' ? downloaded.reason : undefined,
          })
          await deps.refreshGenerationQueueRuntime(project.id)
          return
        }
        const polled = await deps.runVideoTaskPoolJob({
          pool: 'poll',
          project: currentProject,
          worker: () => deps.pollExistingSegmentTask({ project: currentProject, shot, waitMs: 0, skipDownload: true }),
        })
        if (polled.status === 'downloading') {
          const latestProjectAfterPoll = await cloneRepo.getProject(projectId)
          if (latestProjectAfterPoll) {
            const latestShotAfterPoll = deps.projectBlueprintShots(latestProjectAfterPoll).find((item) => item.id === shot.id) || shot
            const latestOutputAfterPoll = deps.resolveShotVideoOutput(latestProjectAfterPoll, latestShotAfterPoll)
            if (String(latestOutputAfterPoll.videoUrl || '').trim()) {
              const downloaded = await deps.runVideoTaskPoolJob({
                pool: 'download',
                project: latestProjectAfterPoll,
                worker: () => deps.downloadCompletedSegmentTask({ project: latestProjectAfterPoll, shot: latestShotAfterPoll }),
              })
              results.push({
                shotId: shot.id,
                status: downloaded.status,
                taskId: recoverTaskId,
                synced: downloaded.status === 'done',
                error: downloaded.status === 'failed' ? downloaded.reason : undefined,
              })
              await deps.refreshGenerationQueueRuntime(project.id)
              return
            }
          }
        }
        results.push({ shotId: shot.id, status: polled.status, taskId: recoverTaskId, synced: polled.synced })
        await deps.refreshGenerationQueueRuntime(project.id)
      },
    )
    const latest = (await cloneRepo.getProject(projectId)) || project
    return { project: latest, results }
  }

  return {
    reconcileRemoteStoryboardVideosInternal,
    async reconcileRemoteStoryboardVideos(input: { cloneProjectId: string }) {
      return await reconcileRemoteStoryboardVideosInternal(input.cloneProjectId)
    },
  }
}
