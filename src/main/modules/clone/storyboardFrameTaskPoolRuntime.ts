export const globalStoryboardFrameTaskPoolState = {
  active: 0,
}

export const GLOBAL_STORYBOARD_FRAME_TASK_LIMIT = 2

export async function runStoryboardFrameTaskPoolJob<T>(input: {
  worker: () => Promise<T>
  waitMs?: number
  globalLimit?: number
}) {
  const waitMs = Math.max(0, Number(input.waitMs ?? 120))
  const globalLimit = Math.max(1, Number(input.globalLimit ?? GLOBAL_STORYBOARD_FRAME_TASK_LIMIT) || GLOBAL_STORYBOARD_FRAME_TASK_LIMIT)

  while (globalStoryboardFrameTaskPoolState.active >= globalLimit) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  globalStoryboardFrameTaskPoolState.active += 1
  try {
    return await input.worker()
  } finally {
    globalStoryboardFrameTaskPoolState.active = Math.max(0, globalStoryboardFrameTaskPoolState.active - 1)
  }
}
