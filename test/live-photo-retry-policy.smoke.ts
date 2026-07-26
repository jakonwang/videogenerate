import assert from 'node:assert/strict'
import {
  LIVE_PHOTO_DEFAULT_RETRY_LIMIT,
  LIVE_PHOTO_IMAGE_RETRY_LIMIT,
  resolveLivePhotoRetryLimit,
} from '../src/main/modules/live-photo/retryPolicy'

assert.equal(LIVE_PHOTO_IMAGE_RETRY_LIMIT, 2)
assert.equal(resolveLivePhotoRetryLimit('image_generation'), 2)
assert.equal(resolveLivePhotoRetryLimit('image_validation'), 2)
assert.equal(resolveLivePhotoRetryLimit('video_generation'), LIVE_PHOTO_DEFAULT_RETRY_LIMIT)
assert.equal(resolveLivePhotoRetryLimit('live_photo_packaging'), LIVE_PHOTO_DEFAULT_RETRY_LIMIT)
assert.equal(resolveLivePhotoRetryLimit('completed'), LIVE_PHOTO_DEFAULT_RETRY_LIMIT)

console.log('live photo retry policy smoke test passed')
