export function resolveTiktokImageRetryFailure(input: {
  retryCount: number
  retryLimit: number
  retryMode?: 'auto' | 'manual_once'
  qualityDecision?: string
}) {
  const retryLimit = Math.max(0, Math.min(20, Math.floor(Number(input.retryLimit) || 0)))
  const retryCount = Math.min(retryLimit, Math.max(0, Math.floor(Number(input.retryCount) || 0)))
  const shouldRetry = input.qualityDecision === 'retry' && input.retryMode !== 'manual_once' && retryCount < retryLimit
  return {
    retryCount,
    retryLimit,
    shouldRetry,
    nextRetryCount: shouldRetry ? retryCount + 1 : retryCount,
  }
}
