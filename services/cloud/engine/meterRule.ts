/**
 * 服务器复刻引擎：哪些对外请求算一次「AI 生成」（计入每日上限）。
 * 只有向 AI 平台发起生成 / 对话的 POST 才算；云端自己、七牛上传、查询结果 / 进度、上传素材都不算。
 */
import { AI_PROXY_PATH } from '../../../src/shared/cloud/managedSettings'

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
    if (parsed.origin === new URL(cloudBaseUrl).origin) {
      // 云端 AI 代理转发的是 AI 平台的请求：按代理后面的平台路径判断，其它云端接口不算
      if (!parsed.pathname.startsWith(`${AI_PROXY_PATH}/`)) return false
      const rest = parsed.pathname.slice(AI_PROXY_PATH.length + 1).replace(/^[^/]+/, '')
      return !NOT_GENERATION.test(rest)
    }
  } catch {
    // no cloud address: count everything else
  }
  if (STORAGE_HOST.test(parsed.hostname)) return false
  return !NOT_GENERATION.test(parsed.pathname)
}
