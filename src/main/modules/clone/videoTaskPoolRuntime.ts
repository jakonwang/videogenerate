import type { CloneProject } from './types'

export const globalVideoTaskPoolState = {
  submitActive: 0,
  pollActive: 0,
  downloadActive: 0,
}

export const GLOBAL_VIDEO_TASK_LIMITS = {
  submit: 4,
  poll: 12,
  download: 3,
} as const

export async function refreshGenerationQueueRuntime(input: {
  projectId: string
  activePatch?: Partial<NonNullable<CloneProject['generationQueue']>['runtime']>
  getProject: (projectId: string) => Promise<CloneProject | null>
  upsertProject: (project: CloneProject) => Promise<CloneProject>
  summarizeVideoDispatchCounts: (project: CloneProject) => {
    submitQueued: number
    pollQueued: number
    downloadQueued: number
  }
  computeGenerationQueueRuntimeSummary: (args: {
    project: CloneProject
    submitQueued: number
    pollQueued: number
    downloadQueued: number
    submitActive: number
    pollActive: number
    downloadActive: number
  }) => unknown
}) {
  const latest = await input.getProject(input.projectId)
  if (!latest) return null
  const counts = input.summarizeVideoDispatchCounts(latest)
  input.computeGenerationQueueRuntimeSummary({
    project: latest,
    submitQueued: counts.submitQueued,
    pollQueued: counts.pollQueued,
    downloadQueued: counts.downloadQueued,
    submitActive: Number(input.activePatch?.submitActive ?? latest.generationQueue?.runtime?.submitActive ?? 0) || 0,
    pollActive: Number(input.activePatch?.pollActive ?? latest.generationQueue?.runtime?.pollActive ?? 0) || 0,
    downloadActive: Number(input.activePatch?.downloadActive ?? latest.generationQueue?.runtime?.downloadActive ?? 0) || 0,
  })
  await input.upsertProject(latest)
  return latest
}

export async function runVideoTaskPoolJob<T>(input: {
  pool: 'submit' | 'poll' | 'download'
  project: CloneProject
  worker: () => Promise<T>
  waitMs?: number
  refreshGenerationQueueRuntime: (input: {
    projectId: string
    activePatch?: Partial<NonNullable<CloneProject['generationQueue']>['runtime']>
  }) => Promise<CloneProject | null>
  getProject: (projectId: string) => Promise<CloneProject | null>
}) {
  const sanitizeProjectRuntime = async () => {
    const latest = await input.getProject(input.project.id)
    if (!latest) return
    input.project = latest
    const runtime = latest.generationQueue?.runtime
    if (!runtime) return
    const sanitized = {
      submitActive: Math.min(Math.max(0, Number(runtime.submitActive ?? 0) || 0), globalVideoTaskPoolState.submitActive),
      pollActive: Math.min(Math.max(0, Number(runtime.pollActive ?? 0) || 0), globalVideoTaskPoolState.pollActive),
      downloadActive: Math.min(Math.max(0, Number(runtime.downloadActive ?? 0) || 0), globalVideoTaskPoolState.downloadActive),
    }
    if (
      sanitized.submitActive !== Number(runtime.submitActive ?? 0) ||
      sanitized.pollActive !== Number(runtime.pollActive ?? 0) ||
      sanitized.downloadActive !== Number(runtime.downloadActive ?? 0)
    ) {
      await input.refreshGenerationQueueRuntime({
        projectId: latest.id,
        activePatch: sanitized,
      })
      const refreshed = await input.getProject(latest.id)
      if (refreshed) input.project = refreshed
    }
  }

  await sanitizeProjectRuntime()
  const projectLimitMap = {
    submit: Number(input.project.generationQueue?.options?.maxConcurrentSubmitJobs ?? 2) || 2,
    poll: Number(input.project.generationQueue?.options?.maxConcurrentPollJobs ?? 4) || 4,
    download: Number(input.project.generationQueue?.options?.maxConcurrentDownloadJobs ?? 1) || 1,
  } as const
  const globalLimitMap = {
    submit: GLOBAL_VIDEO_TASK_LIMITS.submit,
    poll: GLOBAL_VIDEO_TASK_LIMITS.poll,
    download: GLOBAL_VIDEO_TASK_LIMITS.download,
  } as const
  const activeKey = `${input.pool}Active` as const
  const waitMs = Math.max(0, Number(input.waitMs ?? 120))
  while (
    Number(input.project.generationQueue?.runtime?.[activeKey] ?? 0) >= projectLimitMap[input.pool] ||
    globalVideoTaskPoolState[activeKey] >= globalLimitMap[input.pool]
  ) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    await sanitizeProjectRuntime()
  }
  globalVideoTaskPoolState[activeKey] += 1
  await input.refreshGenerationQueueRuntime({
    projectId: input.project.id,
    activePatch: {
      [activeKey]: Number(input.project.generationQueue?.runtime?.[activeKey] ?? 0) + 1,
    } as Partial<NonNullable<CloneProject['generationQueue']>['runtime']>,
  })
  try {
    return await input.worker()
  } finally {
    globalVideoTaskPoolState[activeKey] = Math.max(0, globalVideoTaskPoolState[activeKey] - 1)
    const latest = await input.getProject(input.project.id)
    if (latest) {
      await input.refreshGenerationQueueRuntime({
        projectId: latest.id,
        activePatch: {
          [activeKey]: Math.max(0, Number(latest.generationQueue?.runtime?.[activeKey] ?? 0) - 1),
        } as Partial<NonNullable<CloneProject['generationQueue']>['runtime']>,
      })
    }
  }
}
