/**
 * TikHub 分享链接解析（纯函数，无本地存储依赖）：桌面端「视频解析下载」和云端解析任务共用。
 */

export const TIKHUB_FETCH_ONE_BY_SHARE_URL = 'https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video_by_share_url'
const TIKHUB_FETCH_ONE_PATH = '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url'

/** 商业版托管模式：TikHub 请求改走云端代理（TikHub Key 只在服务器）。null 表示直连官方地址 */
let tikhubBaseUrlOverride: string | null = null

export function setTikhubBaseUrlOverride(baseUrl: string | null) {
  tikhubBaseUrlOverride = baseUrl ? baseUrl.replace(/\/+$/, '') : null
}

export function tikhubFetchOneUrl() {
  return tikhubBaseUrlOverride ? `${tikhubBaseUrlOverride}${TIKHUB_FETCH_ONE_PATH}` : TIKHUB_FETCH_ONE_BY_SHARE_URL
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

export function isKnownNonVideoAssetUrl(value: string) {
  const text = String(value || '').trim()
  if (!text) return true
  const normalized = text.toLowerCase()
  if (
    normalized.includes('docs.tikhub.io/') ||
    normalized.includes('api.tikhub.io/#/') ||
    normalized.includes('/fetch_one_video_by_share_url')
  ) {
    return true
  }
  return /\.(?:avif|bmp|gif|heic|heif|jpeg|jpg|json|png|svg|txt|webp)(?:\?|$)/i.test(normalized)
}

export function topLevelKeysOf(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value as Record<string, unknown>).slice(0, 12)
}

export function getByPath(input: unknown, path: string[]) {
  let current: any = input
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined
    current = current[segment]
  }
  return current
}

export function pickFirstString(input: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getByPath(input, path)
    if (typeof value === 'string' && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function collectStringCandidates(input: unknown, keys: string[], output: string[], seen: Set<string>, depth = 0) {
  if (!input || depth > 4) return
  if (typeof input === 'string') {
    const text = String(input).trim()
    if (text && !seen.has(text)) {
      seen.add(text)
      output.push(text)
    }
    return
  }
  if (Array.isArray(input)) {
    for (const item of input) collectStringCandidates(item, keys, output, seen, depth + 1)
    return
  }
  if (typeof input !== 'object') return
  const record = input as Record<string, unknown>
  for (const [key, value] of Object.entries(record)) {
    if (keys.includes(key) && typeof value === 'string') {
      const text = String(value).trim()
      if (text && !seen.has(text)) {
        seen.add(text)
        output.push(text)
      }
    }
    collectStringCandidates(value, keys, output, seen, depth + 1)
  }
}

export function resolveDownloadUrl(payload: unknown) {
  const direct = pickFirstString(payload, [
    ['data', 'aweme_detail', 'video', 'download_no_watermark_addr', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'play_addr_h264', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'play_addr', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'download_addr', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'download_no_watermark_addr', 'uri'],
    ['data', 'aweme_detail', 'video', 'play_addr_h264', 'uri'],
    ['data', 'aweme_detail', 'video', 'play_addr', 'uri'],
    ['data', 'aweme_detail', 'video', 'download_addr', 'uri'],
    ['data', 'video', 'play'],
    ['data', 'video', 'download_addr'],
    ['data', 'video', 'wmplay'],
    ['data', 'video_data', 'nwm_video_url'],
    ['data', 'video_data', 'play_url'],
    ['data', 'play'],
    ['data', 'download_url'],
    ['video', 'play'],
    ['video', 'download_addr'],
    ['video_data', 'nwm_video_url'],
  ])
  if (direct && isHttpUrl(direct) && !isKnownNonVideoAssetUrl(direct)) return direct
  const candidates: string[] = []
  collectStringCandidates(
    payload,
    ['play', 'download_addr', 'download_no_watermark_addr', 'wmplay', 'nwm_video_url', 'play_url', 'download_url'],
    candidates,
    new Set<string>(),
  )
  return (
    candidates.find((item) => isHttpUrl(item) && /\.mp4(\?|$)/i.test(item) && !isKnownNonVideoAssetUrl(item)) ||
    candidates.find((item) => isHttpUrl(item) && !isKnownNonVideoAssetUrl(item)) ||
    ''
  )
}

export function resolveVideoId(payload: unknown) {
  return (
    pickFirstString(payload, [
      ['data', 'aweme_id'],
      ['data', 'video_id'],
      ['data', 'id'],
      ['data', 'aweme_detail', 'aweme_id'],
      ['data', 'video', 'id'],
    ]) || ''
  )
}

export function resolveTitle(payload: unknown) {
  return pickFirstString(payload, [
    ['data', 'title'],
    ['data', 'desc'],
    ['data', 'aweme_detail', 'desc'],
    ['data', 'video_title'],
  ])
}

export function resolveAuthor(payload: unknown) {
  return pickFirstString(payload, [
    ['data', 'author', 'nickname'],
    ['data', 'author', 'unique_id'],
    ['data', 'aweme_detail', 'author', 'nickname'],
    ['data', 'author_name'],
  ])
}

export function resolveCoverUrl(payload: unknown) {
  return pickFirstString(payload, [
    ['data', 'cover'],
    ['data', 'origin_cover'],
    ['data', 'video', 'cover'],
    ['data', 'aweme_detail', 'video', 'cover', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'origin_cover', 'url_list', '0'],
  ])
}
