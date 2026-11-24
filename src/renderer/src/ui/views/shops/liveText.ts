/** 直播账号的报错变成普通话 */
export function liveErrorText(reason: unknown, t: (key: string, params?: Record<string, unknown>) => string) {
  const message = reason instanceof Error ? reason.message : String(reason)
  const other = /LIVE_ACCOUNT_MISMATCH:([^\s]+)/.exec(message)
  if (other) return t('shops.live.error.mismatch', { name: other[1] })
  if (message.includes('LIVE_LOGIN_REQUIRED')) return t('shops.live.error.login')
  if (message.includes('COOKIE_NO_SESSION')) return t('shops.live.error.noSession')
  if (message.includes('COOKIE_JSON_INVALID') || message.includes('COOKIE_EMPTY')) return t('shops.live.error.json')
  if (message.includes('LIVE_SYNC_RUNNING')) return t('shops.live.error.running')
  if (message.includes('LIVE_API_')) return t('shops.live.error.api')
  return message
}
