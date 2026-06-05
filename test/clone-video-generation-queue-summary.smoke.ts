import assert from 'node:assert/strict'
import { computeGenerationQueueRuntimeSummary, summarizeVideoDispatchCounts } from '../src/main/modules/clone/videoGenerationQueueSummary'

const shots = [
  { id: 'shot-submit', index: 0, generatedClipPath: '' },
  { id: 'shot-poll', index: 1, generatedTaskId: 'task-poll', generatedClipPath: '' },
  { id: 'shot-download', index: 2, generatedClipPath: '' },
  { id: 'shot-done', index: 3, generatedClipPath: 'C:\\video.mp4' },
] as any[]

const project = {
  id: 'project-queue',
  generationQueue: {
    options: {
      maxConcurrentCloudJobs: 2,
      maxConcurrentSubmitJobs: 2,
      maxConcurrentPollJobs: 4,
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
} as any

const counts = summarizeVideoDispatchCounts({
  project,
  shots,
  resolveShotVideoOutput(_project, shot) {
    if (shot.id === 'shot-download') {
      return { status: 'downloading', videoUrl: 'https://example.com/video.mp4' }
    }
    if (shot.id === 'shot-poll') {
      return { status: 'remote_running', taskId: 'task-poll' }
    }
    if (shot.id === 'shot-done') {
      return { status: 'done', videoPath: 'C:\\video.mp4' }
    }
    return { status: 'idle' }
  },
})

assert.deepEqual(counts, {
  submitQueued: 1,
  pollQueued: 1,
  downloadQueued: 1,
})

const runtime = computeGenerationQueueRuntimeSummary({
  project,
  submitQueued: counts.submitQueued,
  pollQueued: counts.pollQueued,
  downloadQueued: counts.downloadQueued,
  submitActive: 1,
  pollActive: 2,
  downloadActive: 1,
})

assert.equal(runtime.submitQueued, 1)
assert.equal(runtime.pollQueued, 1)
assert.equal(runtime.downloadQueued, 1)
assert.equal(runtime.submitActive, 1)
assert.equal(runtime.pollActive, 2)
assert.equal(runtime.downloadActive, 1)
console.log('clone video generation queue summary smoke test passed')
