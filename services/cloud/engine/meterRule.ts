/**
 * 服务器复刻引擎：哪些对外请求算一次「AI 生成」（计入每日上限）。
 * 只有向 AI 平台发起生成 / 对话的 POST 才算；云端自己、七牛上传、查询结果 / 进度、上传素材都不算。
 */
const STORAGE_HOST = /qiniu|qbox|qiniup|clouddn/i
const NOT_GENERATION = /(result|recordinfo|query|status|upload|fetch|download)/i

export function isMeteredRequest(url: string, method: string, cloudBaseUrl: string) {
  if (String(method || 'GET').toUpperCase() !== 'POST') return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  try {
    if (parsed.origin === new URL(cloudBaseUrl).origin) return false
  } catch {
    // no cloud address: count everything else
  }
  if (STORAGE_HOST.test(parsed.hostname)) return false
  return !NOT_GENERATION.test(parsed.pathname)
}
