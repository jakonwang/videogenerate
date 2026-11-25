import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { MuseProxy } from './proxy'
import { isMuseDomain, museSessionValue, type MuseCookie } from './session'
import { openProxyEndpoint } from './socksRelay'
import type { MuseExit } from './types'

const MUSE_URL = 'https://muse.ai/'
const EXIT_SERVICES = ['https://ipinfo.io/json', 'https://api.country.is/']
const LOGIN_TIMEOUT_MS = 15 * 60_000

/** Fixed messages only: raw Playwright errors can carry request details. */
export class MuseProxyError extends Error {}

function proxyError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  if (/407|proxy auth|INVALID_AUTH_CREDENTIALS|PROXY_AUTH/i.test(text)) return new MuseProxyError('代理用户名或密码错误')
  if (/timeout|timed out|ETIMEDOUT/i.test(text)) return new MuseProxyError('代理连接超时，未使用本机网络')
  return new MuseProxyError('代理连接失败，未使用本机网络')
}

function findBrowser() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
    .filter((value): value is string => Boolean(value))
  const mac = process.platform === 'darwin'
    ? ['/Applications', join(homedir(), 'Applications')].flatMap((dir) => [
        join(dir, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        join(dir, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
      ])
    : []
  return [
    String(process.env.PLAYWRIGHT_EXECUTABLE_PATH || '').trim(),
    ...roots.map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...roots.map((root) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ...mac,
  ].find((path) => path && existsSync(path))
}

/**
 * One browser process per account with the proxy set on the process itself, so page traffic, downloads and
 * Chromium's own background requests all use it. WebRTC may not open UDP outside it.
 */
export async function launchMuseBrowser(proxy: MuseProxy, options: { headless: boolean }) {
  const { chromium } = await import('playwright')
  const executablePath = findBrowser()
  if (!executablePath) throw new Error('没有找到 Chrome 或 Edge，请先安装')
  const { close, authFailed: _authFailed, ...endpoint } = await openProxyEndpoint(proxy)
  const browser = await chromium.launch({
    executablePath,
    headless: options.headless,
    proxy: endpoint,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-quic',
      // A covered window must keep waiting for the result.
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--force-webrtc-ip-handling-policy',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  }).catch((error: unknown) => {
    close()
    throw error
  })
  browser.on('disconnected', close)
  return browser
}

/** Node-side requests for an account, always through its proxy. */
async function withMuseRequest<T>(proxy: MuseProxy, cookies: MuseCookie[], run: (request: any) => Promise<T>): Promise<T> {
  const { request } = await import('playwright')
  const { close, authFailed, ...endpoint } = await openProxyEndpoint(proxy)
  try {
    const context = await request.newContext({ proxy: endpoint, storageState: { cookies, origins: [] }, timeout: 30_000 })
    try {
      return await run(context)
    } finally {
      await context.dispose()
    }
  } catch (error) {
    throw authFailed() ? proxyError('407') : error
  } finally {
    close()
  }
}

export async function checkMuseExit(proxy: MuseProxy, options: { exitServices?: string[]; museUrl?: string } = {}): Promise<MuseExit> {
  return await withMuseRequest(proxy, [], async (request) => {
    let failure: unknown
    for (const url of options.exitServices ?? EXIT_SERVICES) {
      let ip = ''
      let country = ''
      try {
        const response = await request.get(url)
        if (!response.ok()) throw new Error(`exit service ${response.status()}`)
        const body = await response.json()
        ip = String(body?.ip || '').trim()
        country = String(body?.country || '').trim().toUpperCase()
        if (!ip || !country) throw new Error('exit service returned no data')
      } catch (error) {
        failure = error
        if (/407/.test(String(error))) break
        continue
      }
      let museStatus: number | undefined
      try {
        museStatus = (await request.get(options.museUrl ?? MUSE_URL)).status()
      } catch {
        museStatus = undefined
      }
      return { ip, country, museStatus, museReachable: museStatus !== undefined && museStatus < 400, checkedAt: Date.now() }
    }
    throw proxyError(failure)
  })
}

export type MuseSessionCheck = {
  state: 'ready' | 'expired' | 'region_blocked' | 'error'
  error?: string
  /** Cookies muse.ai rotated during the check. */
  cookies?: MuseCookie[]
}

export async function checkMuseSession(proxy: MuseProxy, cookies: MuseCookie[], museUrl = MUSE_URL): Promise<MuseSessionCheck> {
  return await withMuseRequest(proxy, cookies, async (request): Promise<MuseSessionCheck> => {
    let response: any
    try {
      response = await request.get(new URL('api/session', museUrl).href, { maxRedirects: 0, headers: { referer: museUrl } })
    } catch (error) {
      throw proxyError(error)
    }
    const status = response.status()
    if (status === 407) throw proxyError('407')
    if (status === 401) return { state: 'expired', error: '登录已失效，请重新登录' }
    if (status === 403) return { state: 'region_blocked', error: 'Muse 拒绝访问（403），可能是出口地区、IP 或账号权限' }
    if (status !== 200) return { state: 'error', error: `Muse 会话检查失败（${status}）` }
    const body = await response.json().catch(() => null)
    if (!body || typeof body !== 'object') return { state: 'error', error: 'Muse 返回了无法识别的会话信息' }
    const stored = ((await request.storageState()).cookies as MuseCookie[]).filter((cookie) => isMuseDomain(cookie.domain))
    const rotated = museSessionValue(stored) ? stored : undefined
    if (body.status !== 'assigned') {
      return { state: 'error', error: `Muse 工作区未就绪（${String(body.status || '未知').slice(0, 40)}）`, cookies: rotated }
    }
    return { state: 'ready', cookies: rotated }
  })
}

// `null` while the browser is still starting.
const loginBrowsers = new Map<string, any>()

/** Opens a visible window for the user to sign in; resolves once muse.ai confirms the session. */
export async function loginMuse(
  accountId: string,
  proxy: MuseProxy,
  cookies: MuseCookie[],
  options: { museUrl?: string; headless?: boolean; timeoutMs?: number; pollMs?: number } = {},
): Promise<MuseCookie[]> {
  if (loginBrowsers.has(accountId)) throw new Error('该账号的登录窗口已经打开')
  loginBrowsers.set(accountId, null)
  try {
    const browser = await launchMuseBrowser(proxy, { headless: options.headless ?? false })
    loginBrowsers.set(accountId, browser)
    const context = await browser.newContext({ viewport: null, storageState: { cookies, origins: [] } })
    const page = await context.newPage()
    const closed = () => new Error('登录窗口已关闭，没有完成登录')
    try {
      const response = await page.goto(options.museUrl ?? MUSE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      if (response?.status() === 407) throw new Error('407')
    } catch (error) {
      if (!browser.isConnected() || page.isClosed()) throw closed()
      throw proxyError(error)
    }
    const deadline = Date.now() + (options.timeoutMs ?? LOGIN_TIMEOUT_MS)
    let lastChecked = ''
    let nextCheckAt = 0
    while (Date.now() < deadline) {
      if (!browser.isConnected() || !context.pages().length) throw closed()
      const current = ((await context.cookies().catch(() => { throw closed() })) as MuseCookie[])
        .filter((cookie) => isMuseDomain(cookie.domain))
      const value = museSessionValue(current)
      // The cookie can exist before sign-in, so the session endpoint decides; unchanged values are asked rarely.
      if (value && (value !== lastChecked || Date.now() >= nextCheckAt)) {
        lastChecked = value
        nextCheckAt = Date.now() + 15_000
        const check = await checkMuseSession(proxy, current, options.museUrl).catch(() => null)
        if (check?.state === 'ready') return check.cookies ?? current
      }
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 2000))
    }
    throw new Error('等待登录超时')
  } finally {
    const browser = loginBrowsers.get(accountId)
    loginBrowsers.delete(accountId)
    await browser?.close().catch(() => undefined)
  }
}

export async function closeMuseBrowsers(accountId?: string) {
  const open = accountId ? [loginBrowsers.get(accountId)] : [...loginBrowsers.values()]
  await Promise.all(open.map((browser) => browser?.close().catch(() => undefined)))
}
