import type { CloneProject } from './types'

type ShotVideoPool = 'submit' | 'poll' | 'download'

type ShotVideoRegistryEntry = {
  projectId: string
  shotId: string
  pool: ShotVideoPool
  taskId?: string
  version: number
  startedAt: number
}

type QueueRuntimeSummary = NonNullable<CloneProject['generationQueue']>['runtime']

function now() {
  return Date.now()
}

function queueKey(projectId: string, shotId: string) {
  return `${String(projectId || '').trim()}:${String(shotId || '').trim()}`
}

export function createShotVideoOrchestrator() {
  const registry = new Map<string, ShotVideoRegistryEntry>()
  const counters = {
    submit: 0,
    poll: 0,
    download: 0,
  }

  function begin(input: { projectId: string; shotId: string; pool: ShotVideoPool; taskId?: string }) {
    const key = queueKey(input.projectId, input.shotId)
    const existing = registry.get(key)
    const version = Number(existing?.version ?? 0) + 1
    const next: ShotVideoRegistryEntry = {
      projectId: input.projectId,
      shotId: input.shotId,
      pool: input.pool,
      taskId: input.taskId,
      version,
      startedAt: now(),
    }
    if (!existing || existing.pool !== input.pool) {
      counters[input.pool] += 1
      if (existing) {
        counters[existing.pool] = Math.max(0, counters[existing.pool] - 1)
      }
    }
    registry.set(key, next)
    return next
  }

  function finish(input: { projectId: string; shotId: string; version: number }) {
    const key = queueKey(input.projectId, input.shotId)
    const existing = registry.get(key)
    if (!existing || existing.version !== input.version) return
    counters[existing.pool] = Math.max(0, counters[existing.pool] - 1)
    registry.delete(key)
  }

  function get(projectId: string, shotId: string) {
    return registry.get(queueKey(projectId, shotId)) || null
  }

  function summarize(project: CloneProject, statuses: Array<{ status: string; taskId?: string; videoUrl?: string; videoPath?: string; localPath?: string }>): QueueRuntimeSummary {
    let submitQueued = 0
    let pollQueued = 0
    let downloadQueued = 0
    for (const item of statuses) {
      const status = String(item.status || '').trim().toLowerCase()
      if (status === 'submit_queued' || status === 'submitting') {
        submitQueued += 1
        continue
      }
      if (status === 'download_queued' || status === 'downloading' || status === 'remote_succeeded_pending_download') {
        downloadQueued += 1
        continue
      }
      if (
        status === 'poll_queued' ||
        status === 'remote_pending' ||
        status === 'remote_running' ||
        status === 'failed_retryable'
      ) {
        pollQueued += 1
      }
    }
    return {
      submitActive: counters.submit,
      pollActive: counters.poll,
      downloadActive: counters.download,
      submitQueued,
      pollQueued,
      downloadQueued,
      updatedAt: now(),
    }
  }

  return {
    begin,
    finish,
    get,
    summarize,
  }
}
