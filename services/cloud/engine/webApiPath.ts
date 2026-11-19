/**
 * 服务器复刻引擎里转发给本机 Web API 的路径白名单。
 *
 * 子进程里的 Web API 不带登录令牌、按本机默认用户放行，里面有读取平台密钥等接口，
 * 所以这里必须保证「检查的路径」和「路由实际看到的路径」完全一致：
 * 不允许 . / .. 路径段、编码过的点或斜杠（URL 解析会把 %2e%2e 当成 .. 处理）。
 */

const WEB_API_ALLOWED = [/^\/plugins\/video-batch-subtitle(\/[a-zA-Z0-9_%.-]+)*$/, /^\/clone\/projects$/]
export const WEB_API_RENDER = /^\/plugins\/video-batch-subtitle\/(preview-frame|jobs\/[^/]+\/(run|resume))$/

/** 返回可以转发的路径（含查询串）；不允许时抛错 */
export function assertWebApiPath(method: string, rawPath: string): { path: string; requestPath: string } {
  const requestPath = String(rawPath || '')
  const path = requestPath.split('?')[0]!
  if (/[#\\]/.test(requestPath)) throw new Error('服务器上没有这个功能')
  // 路径段不能是 . 或 ..（含编码形式），也不能带编码的斜杠
  if (path.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment)) || /%2f|%5c|%2e/i.test(path)) {
    throw new Error('服务器上没有这个功能')
  }
  // 再用和路由相同的方式解析一遍，结果必须和原样一致
  if (new URL(requestPath, 'http://127.0.0.1').pathname !== path) throw new Error('服务器上没有这个功能')
  if (!WEB_API_ALLOWED.some((re) => re.test(path))) throw new Error('服务器上没有这个功能')
  if (path === '/clone/projects' && method !== 'GET') throw new Error('服务器上没有这个功能')
  return { path, requestPath }
}
