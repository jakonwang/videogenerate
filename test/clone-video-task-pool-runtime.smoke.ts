import assert from 'node:assert/strict'
import { computeGenerationQueueRuntimeSummary, summarizeVideoDispatchCounts } from '../src/main/modules/clone/videoGenerationQueueSummary'
import { globalVideoTaskPoolState, refreshGenerationQueueRuntime, runVideoTaskPoolJob } from '../src/main/modules/clone/videoTaskPoolRuntime'

async function main() {
  const project = {
    id: 'runtime-project',
    generationQueue: {
      options: {
        maxConcurrentCloudJobs: 2,
        maxConcurrentSubmitJobs: 1,
        maxConcurrentPollJobs: 2,
        maxConcurrentDownloadJobs: 1,
        pollIntervalMs: 2000,
        perShotTimeoutMs: 600000,
      },
      jobs: [],
      runtime: {
        submitActive: 0,
        pollActive: 0,
        downloadActive: 0,
        submitQueued: 0,
        pollQueued: 0,
        downloadQueued: 0,
        updatedAt: Date.now(),
      },
      paused: false,
    },
    blueprint: {
      shots: [
        { id: 'shot-submit', index: 0, generatedClipPath: '' },
        { id: 'shot-poll', index: 1, generatedTaskId: 'task-poll', generatedClipPath: '' },
      ],
    },
    shotVideoOutputs: [
      { shotId: 'shot-poll', status: 'remote_running', taskId: 'task-poll', updatedAt: Date.now() },
    ],
  } as any

  const store = new Map([[project.id, project]])

  const summarize = (targetProject: any) =>
    summarizeVideoDispatchCounts({
      project: targetProject,
      shots: targetProject.blueprint.shots,
      resolveShotVideoOutput(currentProject, shot) {
        return currentProject.shotVideoOutputs?.find((item: any) => item.shotId === shot.id) || { status: 'idle' }
      },
    })

  await refreshGenerationQueueRuntime({
    projectId: project.id,
    getProject: async (projectId) => store.get(projectId) ?? null,
    upsertProject: async (nextProject) => {
      store.set(nextProject.id, nextProject)
      return nextProject
    },
    summarizeVideoDispatchCounts: summarize,
    computeGenerationQueueRuntimeSummary,
  })

  assert.equal(store.get(project.id)?.generationQueue?.runtime?.submitQueued, 1)
  assert.equal(store.get(project.id)?.generationQueue?.runtime?.pollQueued, 1)
  assert.equal(store.get(project.id)?.generationQueue?.runtime?.downloadQueued, 0)

  let observedActiveDuringRun = 0
  const result = await runVideoTaskPoolJob({
    pool: 'submit',
    project,
    waitMs: 10,
    getProject: async (projectId) => store.get(projectId) ?? null,
    refreshGenerationQueueRuntime: async ({ projectId, activePatch }) =>
      refreshGenerationQueueRuntime({
        projectId,
        activePatch,
        getProject: async (id) => store.get(id) ?? null,
        upsertProject: async (nextProject) => {
          store.set(nextProject.id, nextProject)
          return nextProject
        },
        summarizeVideoDispatchCounts: summarize,
        computeGenerationQueueRuntimeSummary,
      }),
    worker: async () => {
      observedActiveDuringRun = Number(store.get(project.id)?.generationQueue?.runtime?.submitActive ?? 0)
      return 'ok'
    },
  })

  assert.equal(result, 'ok')
  assert.equal(observedActiveDuringRun, 1)
  assert.equal(store.get(project.id)?.generationQueue?.runtime?.submitActive, 0)
  assert.equal(globalVideoTaskPoolState.submitActive, 0)
  console.log('clone video task pool runtime smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
