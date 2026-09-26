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

export function isTiktokOfficialTaskResultPendingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /TikTok request failed\s*\(401\)/i.test(message)
}

export function resolveTiktokOfficialTaskPollDelay(pollAttempts: number, taskKey: string) {
  const attempts = Math.max(0, Math.floor(Number(pollAttempts) || 0))
  const baseDelayMs = attempts < 6 ? 10_000 : attempts < 18 ? 20_000 : 30_000
  const jitterMs = Array.from(String(taskKey || '')).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 3_001,
    0,
  )
  return baseDelayMs + jitterMs
}
