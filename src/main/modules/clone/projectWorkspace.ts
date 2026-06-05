import { cloneRepo } from './repo'
import type { CloneProject, CloneProjectSummary } from './types'

export type CloneProjectWorkspaceDeps = {
  syncProjectBoundProductSnapshotFromLibrary: (project: CloneProject) => Promise<CloneProject>
  syncProjectBlueprintLayers: (project: CloneProject) => void
  recoverLocalStoryboardFrames: (project: CloneProject) => Promise<CloneProject>
  getReadonlyProjectWithRuntime: (project: CloneProject) => Promise<CloneProject>
  pipelineStatusFromProject: (project: CloneProject) => unknown
  buildProjectSummary: (project: CloneProject) => CloneProjectSummary
}

export function createCloneProjectWorkspaceService(deps: CloneProjectWorkspaceDeps) {
  return {
    async getProject(input: { cloneProjectId: string }) {
      let item = await cloneRepo.getProject(input.cloneProjectId)
      if (!item) throw new Error('复刻项目不存在')
      const beforeSync = JSON.stringify({
        boundProductSnapshot: item.boundProductSnapshot,
        storyboardFrames: item.storyboardFrames,
        blueprintShots: item.blueprint?.shots,
      })
      try {
        item = await deps.syncProjectBoundProductSnapshotFromLibrary(item)
      } catch (error) {
        console.warn('[clone-workspace] sync bound product snapshot skipped', {
          cloneProjectId: item.id,
          message: String((error as Error)?.message ?? error ?? 'unknown error'),
        })
      }
      try {
        deps.syncProjectBlueprintLayers(item)
      } catch (error) {
        console.warn('[clone-workspace] sync blueprint layers skipped', {
          cloneProjectId: item.id,
          message: String((error as Error)?.message ?? error ?? 'unknown error'),
        })
      }
      try {
        item = await deps.recoverLocalStoryboardFrames(item)
      } catch (error) {
        console.warn('[clone-workspace] recover storyboard frames skipped', {
          cloneProjectId: item.id,
          message: String((error as Error)?.message ?? error ?? 'unknown error'),
        })
      }
      const afterSync = JSON.stringify({
        boundProductSnapshot: item.boundProductSnapshot,
        storyboardFrames: item.storyboardFrames,
        blueprintShots: item.blueprint?.shots,
      })
      if (beforeSync !== afterSync) {
        item = await cloneRepo.upsertProject(item)
      }
      let latest = item
      try {
        latest = await deps.getReadonlyProjectWithRuntime(item)
      } catch (error) {
        console.warn('[clone-workspace] attach runtime skipped', {
          cloneProjectId: item.id,
          message: String((error as Error)?.message ?? error ?? 'unknown error'),
        })
      }
      return {
        ...latest,
        pipelineStatus: deps.pipelineStatusFromProject(latest),
      }
    },

    async listProjects() {
      return (await cloneRepo.listProjects())
        .slice()
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .map((project) => deps.buildProjectSummary(project))
    },

    async listProjectSummaries(input?: { query?: string; status?: string; archived?: boolean }) {
      const query = String(input?.query ?? '').trim().toLowerCase()
      const status = String(input?.status ?? '').trim().toLowerCase()
      const archived = typeof input?.archived === 'boolean' ? input.archived : undefined
      return (await cloneRepo.listRawProjects())
        .slice()
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .filter((project) => {
          if (typeof archived === 'boolean' && Boolean(project.archived) !== archived) return false
          const projectStatus = String(project.previewPipeline?.status || project.status || '').toLowerCase()
          if (status && status !== 'all' && projectStatus !== status) return false
          if (query) {
            const haystack = [
              project.title,
              project.description,
              project.referenceVideoName,
              project.selectedModelIdentitySnapshot?.name,
              project.lastError,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
            if (!haystack.includes(query)) return false
          }
          return true
        })
        .map((project) => deps.buildProjectSummary(project))
    },
  }
}
