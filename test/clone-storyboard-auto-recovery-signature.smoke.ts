import assert from 'node:assert/strict'

type StoryboardFrameLike = {
  imagePath?: string
  error?: string
  retryCount?: number
  updatedAt?: number
}

function summarizeStoryboardFrameState(frames: StoryboardFrameLike[]) {
  return frames.reduce(
    (acc, item) => {
      if (String(item.imagePath || '').trim()) acc.ready += 1
      else if (String(item.error || '').trim()) acc.failed += 1
      else acc.pending += 1
      acc.retryableFailed += !String(item.imagePath || '').trim() && String(item.error || '').trim() && Number(item.retryCount || 0) < 2 ? 1 : 0
      acc.updatedAtMax = Math.max(acc.updatedAtMax, Number(item.updatedAt || 0))
      return acc
    },
    {
      total: frames.length,
      ready: 0,
      pending: 0,
      failed: 0,
      retryableFailed: 0,
      updatedAtMax: 0,
    },
  )
}

function buildAutoStoryboardRecoverySignature(projectId: string, kind: 'query' | 'retry', frames: StoryboardFrameLike[]) {
  const state = summarizeStoryboardFrameState(frames)
  return [
    projectId,
    kind,
    state.total,
    state.ready,
    state.pending,
    state.failed,
    state.retryableFailed,
    state.updatedAtMax,
  ].join(':')
}

const pendingFrames: StoryboardFrameLike[] = [
  { updatedAt: 100 },
  { imagePath: 'C:\\frames\\shot_2.png', updatedAt: 110 },
]
const failedFrames: StoryboardFrameLike[] = [
  { error: 'provider timeout', retryCount: 0, updatedAt: 210 },
  { imagePath: 'C:\\frames\\shot_2.png', updatedAt: 110 },
]
const exhaustedFrames: StoryboardFrameLike[] = [
  { error: 'provider timeout', retryCount: 2, updatedAt: 310 },
  { imagePath: 'C:\\frames\\shot_2.png', updatedAt: 110 },
]

const pendingSignature = buildAutoStoryboardRecoverySignature('project-1', 'query', pendingFrames)
const failedSignature = buildAutoStoryboardRecoverySignature('project-1', 'retry', failedFrames)
const exhaustedSignature = buildAutoStoryboardRecoverySignature('project-1', 'retry', exhaustedFrames)
const failedState = summarizeStoryboardFrameState(failedFrames)
const exhaustedState = summarizeStoryboardFrameState(exhaustedFrames)

assert.notEqual(pendingSignature, failedSignature)
assert.notEqual(failedSignature, exhaustedSignature)
assert.equal(failedState.failed, 1)
assert.equal(failedState.retryableFailed, 1)
assert.equal(exhaustedState.failed, 1)
assert.equal(exhaustedState.retryableFailed, 0)
assert.equal(exhaustedState.updatedAtMax, 310)

console.log('clone storyboard auto recovery signature smoke test passed')
