import type { MuseProxyPublic } from './types'

export type MuseProxy = { protocol: 'http' | 'socks5'; host: string; port: number; username: string; password: string }

function validated(protocol: MuseProxy['protocol'], host: string, portText: string, username: string, password: string): MuseProxy {
  const port = Number(portText)
  if (!/^[a-z0-9.-]+$/i.test(host) || !/^\d+$/.test(portText) || port < 1 || port > 65535) throw new Error('代理地址或端口不正确')
  if (Buffer.byteLength(username) > 255 || Buffer.byteLength(password) > 255) throw new Error('代理用户名或密码过长')
  return { protocol, host, port, username, password }
}

/**
 * Accepts `user:pass@host:port`, `host:port` and the `host:port:user:pass` form proxy shops hand out,
 * each with an optional http:// or socks5:// prefix (http when missing).
 * Error messages never include the input, which contains the password.
 */
export function parseMuseProxy(input: string): MuseProxy {
  const text = String(input || '').trim()
  if (!text) throw new Error('请填写代理地址')
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1]?.toLowerCase() || 'http'
  if (!['http', 'socks5', 'socks5h'].includes(scheme)) throw new Error('只支持 HTTP 和 SOCKS5 代理')
  const protocol = scheme === 'http' ? 'http' : 'socks5'
  const rest = text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const parts = rest.split(':')
  if (parts.length >= 4 && /^\d+$/.test(parts[1])) return validated(protocol, parts[0], parts[1], parts[2], parts.slice(3).join(':'))
  let url: URL
  try {
    url = new URL(`http://${rest}`)
  } catch {
    throw new Error('代理地址格式不正确')
  }
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('代理地址格式不正确；密码含特殊字符时请做 URL 编码')
  // URL drops an explicit :80.
  const port = url.port || (/:80\/?$/.test(rest) ? '80' : '')
  let username: string
  let password: string
  try {
    username = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  } catch {
    throw new Error('代理用户名或密码的 URL 编码不正确')
  }
  return validated(protocol, url.hostname, port, username, password)
}

export const publicMuseProxy = (proxy: MuseProxy): MuseProxyPublic => ({
  protocol: proxy.protocol,
  host: proxy.host,
  port: proxy.port,
  username: proxy.username,
  hasPassword: Boolean(proxy.password),
})
