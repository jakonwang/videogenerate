import assert from 'node:assert/strict'
import { createCloneProjectWorkspaceService } from '../src/main/modules/clone/projectWorkspace'

const service = createCloneProjectWorkspaceService({
  async syncProjectBoundProductSnapshotFromLibrary(project) {
    return { ...project, boundProductSnapshot: { productAnalysis: { summary: 'latest dna' } } } as any
  },
  syncProjectBlueprintLayers(project) {
    ;(project as any).blueprintSynced = true
  },
  async getReadonlyProjectWithRuntime(project) {
    return {
      ...project,
      generationQueue: {
        ...(project.generationQueue || {}),
        runtime: {
          submitActive: 0,
          pollActive: 0,
          downloadActive: 0,
          submitQueued: 0,
          pollQueued: 0,
          downloadQueued: 0,
          updatedAt: Date.now(),
        },
      },
    } as any
  },
  pipelineStatusFromProject() {
    return { status: 'ok' }
  },
  buildProjectSummary(project) {
    return { id: project.id, title: project.title, status: 'ready' }
  },
})

assert.ok(service)
assert.equal(typeof service.getProject, 'function')
assert.equal(typeof service.listProjectSummaries, 'function')
console.log('clone project workspace smoke test passed')
