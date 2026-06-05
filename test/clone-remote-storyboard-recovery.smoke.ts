import assert from 'node:assert/strict'
import { createCloneRemoteStoryboardRecovery } from '../src/main/modules/clone/remoteStoryboardRecovery'

const recovery = createCloneRemoteStoryboardRecovery({
  ensureCloneFlowState() {},
  projectBlueprintShots() {
    return [{ id: 'shot-1', index: 0, status: 'remote_running' }]
  },
  async refreshGenerationQueueRuntime() {
    return {}
  },
  async mapWithConcurrency(items, _concurrency, worker) {
    for (const item of items) await worker(item)
  },
  globalVideoTaskLimits: { poll: 1, download: 1 },
  resolveShotVideoOutput() {
    return { status: 'remote_running', taskId: '' }
  },
  async checkLocalTaskStatus() {
    return { skip: false }
  },
  syncSegmentVideoOutput() {},
  replaceProjectShot() {},
  now() {
    return Date.now()
  },
  isRecoverableVideoStatus() {
    return true
  },
  setProjectErrorContext() {},
  apifoxContextByCapability() {
    return {}
  },
  async runVideoTaskPoolJob() {
    return { status: 'pending', synced: false }
  },
  async downloadCompletedSegmentTask() {
    return {}
  },
  async pollExistingSegmentTask() {
    return { status: 'pending', synced: false }
  },
})

assert.ok(recovery)
assert.equal(typeof recovery.reconcileRemoteStoryboardVideos, 'function')
console.log('clone remote storyboard recovery smoke test passed')
