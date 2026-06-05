import assert from 'node:assert/strict'
import { __cloneServiceInternals } from '../src/main/modules/clone/service'

function makeShot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shot_1',
    index: 1,
    durationSec: 3,
    qualityMode: 'high',
    productReferenceImagePaths: ['C:\\temp\\product.png'],
    prompt: { aspectRatio: '9:16' },
    ...overrides,
  } as any
}

async function main() {
  const shot = makeShot()
  const fingerprint = __cloneServiceInternals.computeShotVideoSubmissionFingerprint({
    shot,
    firstFramePath: 'C:\\temp\\first.png',
    lastFramePath: 'C:\\temp\\last.png',
    provider: 'apifox_hub',
    model: 'veo_3_1-lite',
    requestCapability: 'video_start_end_to_video',
  })

  const now = Date.now()
  assert.equal(
    __cloneServiceInternals.isShotVideoSubmissionLocked(
      {
        status: 'creating',
        submissionFingerprint: fingerprint,
        submissionStartedAt: now,
        submissionLockedUntil: now + __cloneServiceInternals.SHOT_VIDEO_SUBMISSION_LOCK_MS,
      },
      fingerprint,
      now + 1000,
    ),
    true,
  )

  assert.equal(
    __cloneServiceInternals.isShotVideoSubmissionLocked(
      {
        status: 'creating',
        submissionFingerprint: fingerprint,
        submissionLockedUntil: now - 1,
      },
      fingerprint,
      now,
    ),
    false,
  )

  assert.equal(
    __cloneServiceInternals.isShotVideoSubmissionLocked(
      {
        status: 'creating',
        submissionFingerprint: fingerprint,
        submissionLockedUntil: now + __cloneServiceInternals.SHOT_VIDEO_SUBMISSION_LOCK_MS,
      },
      'different-fingerprint',
      now,
    ),
    false,
  )

  const reason = __cloneServiceInternals.buildShotVideoCreatingLockReason({
    status: 'creating',
    submissionLockedUntil: now + __cloneServiceInternals.SHOT_VIDEO_SUBMISSION_LOCK_MS,
  })
  assert.match(reason, /\[submit_locked\]/)
  console.log('clone video submit idempotency smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
