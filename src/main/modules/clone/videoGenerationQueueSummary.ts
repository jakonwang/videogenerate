import { createCloneGenerationQueue } from './cloud-queue'
import type { CloneProject, CloneShotVideoOutput, ShotSpec } from './types'

function now() {
  return Date.now()
}

function patchGenerationQueueRuntime(
  project: CloneProject,
  patch: Partial<NonNullable<CloneProject['generationQueue']>['runtime']>,
) {
  const queue = createCloneGenerationQueue(project)
  project.generationQueue = {
    ...queue,
    runtime: {
      ...queue.runtime,
      ...patch,
      updatedAt: now(),
    },
  }
  return project.generationQueue.runtime
}

export function computeGenerationQueueRuntimeSummary(input: {
  project: CloneProject
  submitQueued: number
  pollQueued: number
  downloadQueued: number
  submitActive: number
  pollActive: number
  downloadActive: number
}) {
  return patchGenerationQueueRuntime(input.project, {
    submitQueued: input.submitQueued,
    pollQueued: input.pollQueued,
    downloadQueued: input.downloadQueued,
    submitActive: input.submitActive,
    pollActive: input.pollActive,
    downloadActive: input.downloadActive,
  })
}

export function summarizeVideoDispatchCounts(input: {
  project: CloneProject
  shots: ShotSpec[]
  resolveShotVideoOutput: (project: CloneProject, shot: ShotSpec) => Partial<CloneShotVideoOutput>
}) {
  const counts = {
    submitQueued: 0,
    pollQueued: 0,
    downloadQueued: 0,
  }
  for (const shot of input.shots) {
    const output = input.resolveShotVideoOutput(input.project, shot)
    const hasLocalVideo = Boolean(String(output.videoPath || output.localPath || shot.generatedClipPath || '').trim())
    if (hasLocalVideo) continue
    const status = String(output.status || '').trim().toLowerCase()
    if (status === 'downloading' && String(output.videoUrl || '').trim()) {
      counts.downloadQueued += 1
      continue
    }
    if (String(output.taskId || shot.generatedTaskId || '').trim()) {
      counts.pollQueued += 1
      continue
    }
    counts.submitQueued += 1
  }
  return counts
}
