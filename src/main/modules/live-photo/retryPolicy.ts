import type { LivePhotoWorkflowStep } from './types'

export const LIVE_PHOTO_DEFAULT_RETRY_LIMIT = 2
export const LIVE_PHOTO_IMAGE_RETRY_LIMIT = 2

export function resolveLivePhotoRetryLimit(stage: LivePhotoWorkflowStep) {
  return stage === 'image_generation' || stage === 'image_validation'
    ? LIVE_PHOTO_IMAGE_RETRY_LIMIT
    : LIVE_PHOTO_DEFAULT_RETRY_LIMIT
}
