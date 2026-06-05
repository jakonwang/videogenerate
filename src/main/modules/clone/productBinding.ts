import { cloneRepo } from './repo'
import type { CloneProject } from './types'

export type CloneProductBindingDeps = {
  bindProjectProductFromLibrary: (project: CloneProject, productId: string) => Promise<unknown>
  refreshProductCanonicalSourceFromLibrary: (input: { productId: string; force?: boolean }) => Promise<unknown>
  refreshProductAnalysisFromLibrary: (input: { productId: string }) => Promise<unknown>
  onProjectBound?: (project: CloneProject) => Promise<void>
}

export function createCloneProductBindingService(deps: CloneProductBindingDeps) {
  return {
    async bindProjectProduct(input: { cloneProjectId: string; productId: string }) {
      const project = await cloneRepo.getProject(input.cloneProjectId)
      if (!project) throw new Error('复制项目不存在')
      await deps.bindProjectProductFromLibrary(project, input.productId)
      const saved = await cloneRepo.upsertProject(project)
      if (deps.onProjectBound) {
        await deps.onProjectBound(saved)
      }
      return saved
    },

    async refreshLibraryProductCanonicalSource(input: { productId: string; force?: boolean }) {
      return await deps.refreshProductCanonicalSourceFromLibrary(input)
    },

    async refreshLibraryProductAnalysis(input: { productId: string }) {
      return await deps.refreshProductAnalysisFromLibrary(input)
    },
  }
}
