import assert from 'node:assert/strict'
import {
  GLOBAL_STORYBOARD_FRAME_TASK_LIMIT,
  globalStoryboardFrameTaskPoolState,
  runStoryboardFrameTaskPoolJob,
} from '../src/main/modules/clone/storyboardFrameTaskPoolRuntime'

async function main() {
  globalStoryboardFrameTaskPoolState.active = 0

  let currentActive = 0
  let maxObservedActive = 0
  const started: string[] = []
  const finished: string[] = []

  const createWorker = (name: string, delayMs: number) =>
    runStoryboardFrameTaskPoolJob({
      waitMs: 5,
      globalLimit: 2,
      worker: async () => {
        started.push(name)
        currentActive += 1
        maxObservedActive = Math.max(maxObservedActive, currentActive)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        currentActive -= 1
        finished.push(name)
        return name
      },
    })

  const result = await Promise.all([createWorker('project-a-shot-1', 40), createWorker('project-b-shot-1', 40), createWorker('project-a-shot-2', 10)])

  assert.deepEqual(result.sort(), ['project-a-shot-1', 'project-a-shot-2', 'project-b-shot-1'])
  assert.equal(maxObservedActive, 2)
  assert.equal(globalStoryboardFrameTaskPoolState.active, 0)
  assert.equal(started.length, 3)
  assert.equal(finished.length, 3)
  assert.equal(GLOBAL_STORYBOARD_FRAME_TASK_LIMIT, 2)
  console.log('clone storyboard frame task pool runtime smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
