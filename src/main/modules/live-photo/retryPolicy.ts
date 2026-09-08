import type { LivePhotoWorkflowStep } from './types'

export const LIVE_PHOTO_DEFAULT_RETRY_LIMIT = 2
export const LIVE_PHOTO_IMAGE_RETRY_LIMIT = 2

export function resolveLivePhotoRetryLimit(stage: LivePhotoWorkflowStep, configured?: number) {
  if (configured !== undefined && Number.isFinite(configured)) return Math.max(0, Math.min(20, Math.floor(configured)))
  return stage === 'image_generation' || stage === 'image_validation'
    ? LIVE_PHOTO_IMAGE_RETRY_LIMIT
    : LIVE_PHOTO_DEFAULT_RETRY_LIMIT
}

export function resolveLivePhotoImageRetryFailure(input: {
  retryCount: number
  retryLimit: number
  retryMode?: 'auto' | 'manual_once'
}) {
  const retryLimit = resolveLivePhotoRetryLimit('image_validation', input.retryLimit)
  const retryCount = Math.min(retryLimit, Math.max(0, Math.floor(Number(input.retryCount) || 0)))
  const shouldRetry = input.retryMode !== 'manual_once' && retryCount < retryLimit
  return {
    retryCount,
    retryLimit,
    shouldRetry,
    terminal: !shouldRetry,
    nextRetryCount: shouldRetry ? retryCount + 1 : retryCount,
  }
}
