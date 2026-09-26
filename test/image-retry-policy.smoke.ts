import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveLivePhotoImageRetryFailure } from '../src/main/modules/live-photo/retryPolicy'
import {
  isTiktokOfficialTaskResultPendingError,
  resolveTiktokImageRetryFailure,
  resolveTiktokOfficialTaskPollDelay,
} from '../src/main/modules/tiktok-creative-studio/retryPolicy'

function verifyPolicy(resolve: (input: {
  retryCount: number
  retryLimit: number
  retryMode?: 'auto' | 'manual_once'
  qualityDecision?: string
}) => { retryCount: number; shouldRetry: boolean; nextRetryCount: number }) {
  const noRetry = resolve({ retryCount: 0, retryLimit: 0, retryMode: 'auto', qualityDecision: 'retry' })
  assert.equal(noRetry.shouldRetry, false)
  assert.equal(noRetry.nextRetryCount, 0)

  const firstRetry = resolve({ retryCount: 0, retryLimit: 2, retryMode: 'auto', qualityDecision: 'retry' })
  assert.equal(firstRetry.shouldRetry, true)
  assert.equal(firstRetry.nextRetryCount, 1)

  const secondRetry = resolve({ retryCount: 1, retryLimit: 2, retryMode: 'auto', qualityDecision: 'retry' })
  assert.equal(secondRetry.shouldRetry, true)
  assert.equal(secondRetry.nextRetryCount, 2)

  const exhausted = resolve({ retryCount: 2, retryLimit: 2, retryMode: 'auto', qualityDecision: 'retry' })
  assert.equal(exhausted.shouldRetry, false)
  assert.equal(exhausted.nextRetryCount, 2)

  const manual = resolve({ retryCount: 2, retryLimit: 2, retryMode: 'manual_once', qualityDecision: 'retry' })
  assert.equal(manual.shouldRetry, false)
  assert.equal(manual.nextRetryCount, 2)

  const legacyOverflow = resolve({ retryCount: 7, retryLimit: 2, retryMode: 'auto', qualityDecision: 'retry' })
  assert.equal(legacyOverflow.retryCount, 2)
  assert.equal(legacyOverflow.nextRetryCount, 2)
}

verifyPolicy((input) => resolveLivePhotoImageRetryFailure(input))
verifyPolicy((input) => resolveTiktokImageRetryFailure(input))
assert.equal(isTiktokOfficialTaskResultPendingError(new Error('TikTok request failed (401)')), true)
assert.equal(isTiktokOfficialTaskResultPendingError(new Error('TikTok request failed (403)')), false)
assert.equal(isTiktokOfficialTaskResultPendingError(new Error('TikTok request failed (500)')), false)
const initialPollDelay = resolveTiktokOfficialTaskPollDelay(0, 'task-a')
const backedOffPollDelay = resolveTiktokOfficialTaskPollDelay(8, 'task-a')
const maximumPollDelay = resolveTiktokOfficialTaskPollDelay(30, 'task-a')
assert.ok(initialPollDelay >= 10_000 && initialPollDelay <= 13_000)
assert.ok(backedOffPollDelay >= 20_000 && backedOffPollDelay <= 23_000)
assert.ok(maximumPollDelay >= 30_000 && maximumPollDelay <= 33_000)

const root = process.cwd()
const livePhotoService = readFileSync(join(root, 'src/main/modules/live-photo/service.ts'), 'utf8')
const livePhotoView = readFileSync(join(root, 'src/renderer/src/ui/views/LivePhotoGeneratorView.vue'), 'utf8')
const tiktokService = readFileSync(join(root, 'src/main/modules/tiktok-creative-studio/service.ts'), 'utf8')
const tiktokView = readFileSync(join(root, 'src/renderer/src/ui/views/TiktokCreativeStudioView.vue'), 'utf8')
const tiktokRepo = readFileSync(join(root, 'src/main/modules/tiktok-creative-studio/repo.ts'), 'utf8')

assert.match(livePhotoService, /input\.retryMode === 'manual_once' \? 'manual_once' : 'auto'/)
assert.match(livePhotoService, /retryLimit: existingAutoFlowStatus\.retryLimit/)
assert.match(livePhotoService, /generatedStillPath: canAutoRetryImage \? undefined : latestPersisted\.generatedStillPath/)
assert.match(livePhotoService, /Boolean\(String\(item\.imageTaskId \|\| ''\)\.trim\(\) \|\| String\(item\.videoTaskId \|\| ''\)\.trim\(\)\)/)
assert.match(livePhotoView, /canContinueWithVideo\(item\)/)
assert.match(livePhotoView, /canRetryImageOnce\(item\)/)
assert.match(livePhotoView, /retryMode: 'manual_once'/)
assert.match(livePhotoView, /const settingsSnapshot: LivePhotoSettings = \{/)
assert.match(livePhotoView, /saveSettings\(settingsSnapshot\)/)
assert.doesNotMatch(livePhotoView, /saveSettings\(livePhotoSettings\.value\)/)
assert.match(livePhotoView, /class="image-retry-decision"/)
assert.match(livePhotoView, /livePhoto\.workspace\.continueWithVideoShort/)
assert.match(livePhotoView, /Number\(b\.createdAt \|\| 0\) - Number\(a\.createdAt \|\| 0\)/)

assert.match(tiktokService, /input\.retryMode === 'manual_once' \? 'manual_once' : 'auto'/)
assert.match(tiktokService, /isTiktokOfficialTaskResultPendingError\(error\)/)
assert.match(tiktokService, /pollAttempts: shot\.officialTaskId \? 0 : shot\.pollAttempts/)
assert.match(tiktokService, /existing official task queued for result sync/)
assert.match(tiktokService, /new PQueue\(\{ concurrency: 2 \}\)/)
assert.match(tiktokService, /scheduledShots\.get\(key\)/)
assert.match(tiktokService, /resolveTiktokOfficialTaskPollDelay/)
assert.match(tiktokService, /withAccountLock\(shot\.accountId \|\| '__unbound__'/)
assert.match(tiktokService, /function resolveGeneratedImagePath\(shot: TiktokCreativeShotTask\)/)
assert.match(tiktokService, /generationAttempts \|\| \[\]\)\]\s*\.reverse\(\)/)
assert.match(tiktokService, /const imagePath = resolveGeneratedImagePath\(target\)/)
assert.doesNotMatch(
  tiktokService.slice(tiktokService.indexOf('async continueWithVideo'), tiktokService.indexOf('async removeShot')),
  /retryCount < retryLimit/,
)
assert.doesNotMatch(
  tiktokService.slice(tiktokService.indexOf('async continueWithVideo'), tiktokService.indexOf('async removeShot')),
  /referenceImagePath|shot\.imagePath/,
)
assert.match(tiktokView, /canContinueWithVideo\(shot\)/)
assert.match(tiktokView, /function generatedImagePath\(shot\?: Shot\)/)
assert.match(tiktokView, /function shotPreviewPath\(shot\?: Shot\)/)
assert.match(tiktokView, /shot\.status === "requires_manual" && generatedPath/)
assert.match(tiktokView, /generatedImagePath\(shot\)/)
assert.match(tiktokView, /previewSrc\(shotPreviewPath\(shot\)\)/)
assert.match(tiktokView, /canRetryImageOnce\(shot\)/)
assert.match(tiktokView, /retryMode: 'manual_once'/)
assert.match(tiktokView, /class="image-retry-decision"/)
assert.doesNotMatch(
  tiktokRepo.slice(tiktokRepo.indexOf('async list()'), tiktokRepo.indexOf('async get(id: string)')),
  /updatedAt/,
)

console.log('image retry policy smoke test passed')
