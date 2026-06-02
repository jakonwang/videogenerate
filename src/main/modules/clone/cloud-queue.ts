import { randomUUID } from 'node:crypto'
import type { CloneGenerationQueueJob, CloneGenerationQueueOptions, CloneProject, ShotSpec } from './types'

function now() {
  return Date.now()
}

export function createCloneGenerationQueue(project: CloneProject) {
  const options: CloneGenerationQueueOptions = {
    maxConcurrentCloudJobs: Math.max(1, Number(project.generationQueue?.options?.maxConcurrentCloudJobs ?? 2)),
    maxConcurrentSubmitJobs: Math.max(1, Number(project.generationQueue?.options?.maxConcurrentSubmitJobs ?? 2)),
    maxConcurrentPollJobs: Math.max(1, Number(project.generationQueue?.options?.maxConcurrentPollJobs ?? 4)),
    maxConcurrentDownloadJobs: Math.max(1, Number(project.generationQueue?.options?.maxConcurrentDownloadJobs ?? 1)),
    pollIntervalMs: Math.max(500, Number(project.generationQueue?.options?.pollIntervalMs ?? 2000)),
    perShotTimeoutMs: Math.max(30_000, Number(project.generationQueue?.options?.perShotTimeoutMs ?? 10 * 60 * 1000)),
  }
  return {
    options,
    jobs: [...(project.generationQueue?.jobs ?? [])],
    runtime: {
      submitActive: Number(project.generationQueue?.runtime?.submitActive ?? 0) || 0,
      pollActive: Number(project.generationQueue?.runtime?.pollActive ?? 0) || 0,
      downloadActive: Number(project.generationQueue?.runtime?.downloadActive ?? 0) || 0,
      submitQueued: Number(project.generationQueue?.runtime?.submitQueued ?? 0) || 0,
      pollQueued: Number(project.generationQueue?.runtime?.pollQueued ?? 0) || 0,
      downloadQueued: Number(project.generationQueue?.runtime?.downloadQueued ?? 0) || 0,
      updatedAt: Number(project.generationQueue?.runtime?.updatedAt ?? now()) || now(),
    },
    paused: Boolean(project.generationQueue?.paused),
  }
}

export function pauseCloneGenerationQueue(project: CloneProject) {
  const queue = createCloneGenerationQueue(project)
  project.generationQueue = { ...queue, paused: true }
  return project.generationQueue
}

export function resumeCloneGenerationQueue(project: CloneProject) {
  const queue = createCloneGenerationQueue(project)
  project.generationQueue = { ...queue, paused: false }
  return project.generationQueue
}

export function enqueueCloneShotJob(input: {
  project: CloneProject
  shot: ShotSpec
  retryCount?: number
  priority: number
}) {
  const queue = createCloneGenerationQueue(input.project)
  const existing = queue.jobs.find((job) => job.shotId === input.shot.id && job.status !== 'done')
  const ts = now()
  const nextJob: CloneGenerationQueueJob = existing
    ? {
        ...existing,
        priority: input.priority,
        retryCount: Number(input.retryCount ?? existing.retryCount ?? 0),
        status: existing.status === 'failed' ? 'queued' : existing.status,
        updatedAt: ts,
      }
    : {
        id: randomUUID(),
        cloneProjectId: input.project.id,
        shotId: input.shot.id,
        priority: input.priority,
        status: 'queued',
        retryCount: Number(input.retryCount ?? 0),
        createdAt: ts,
        updatedAt: ts,
      }
  queue.jobs = [...queue.jobs.filter((job) => job.id !== nextJob.id), nextJob].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)
  input.project.generationQueue = queue
  return nextJob
}
