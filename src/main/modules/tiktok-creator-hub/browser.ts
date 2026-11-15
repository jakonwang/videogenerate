import { BrowserWindow, session, type WebContents } from 'electron'
import type { ElectronCookieDetails } from './cookies'

export const CREATOR_HUB_PARTITION_PREFIX = 'persist:tiktok-creator-hub-'
const AFFILIATE_ORIGIN = 'https://affiliate.tiktok.com'
// Plain Chrome UA that matches the embedded Chromium version, so it agrees with the Sec-CH-UA client hints.
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${(process.versions.chrome || '132.0.0.0').split('.')[0]}.0.0.0 Safari/537.36`
const COOKIE_DOMAINS = ['tiktok.com', 'tiktokshop.com', 'tiktokglobalshop.com', 'tiktok-shops.com']

export type ShopTarget = { id: string; region: string; shopId?: string }

export function partitionFor(id: string) {
  return `${CREATOR_HUB_PARTITION_PREFIX}${id.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

export function affiliateUrl(target: ShopTarget, path = 'affiliate/platform/homepage') {
  const params = new URLSearchParams({ shop_region: (target.region || 'VN').toUpperCase() })
  if (target.shopId) params.set('shop_id', target.shopId)
  return `${AFFILIATE_ORIGIN}/${path.replace(/^\/+/, '')}?${params.toString()}`
}

function isAffiliatePage(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.host === 'affiliate.tiktok.com' && !/login|errorpage/i.test(parsed.pathname)
  } catch {
    return false
  }
}

export async function replaceCookies(id: string, cookies: ElectronCookieDetails[]) {
  const ses = session.fromPartition(partitionFor(id))
  const existing = await ses.cookies.get({})
  for (const cookie of existing) {
    const domain = String(cookie.domain || '').replace(/^\./, '')
    if (!COOKIE_DOMAINS.some((item) => domain === item || domain.endsWith(`.${item}`))) continue
    await ses.cookies.remove(`https://${domain}${cookie.path || '/'}`, cookie.name).catch(() => undefined)
  }
  const failedNames: string[] = []
  for (const cookie of cookies) {
    try { await ses.cookies.set(cookie) } catch (error) {
      failedNames.push(cookie.name)
      // Names and reasons only: cookie values are credentials and are never logged.
      console.warn('[creator-hub] cookie rejected', { name: cookie.name, domain: cookie.domain || new URL(cookie.url).host, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  await ses.cookies.flushStore().catch(() => undefined)
  console.log('[creator-hub] cookies applied', { total: cookies.length, failed: failedNames.length, failedNames })
  if (failedNames.length === cookies.length) throw new Error('CREATOR_HUB_COOKIE_SET_FAILED')
  return { set: cookies.length - failedNames.length, failed: failedNames.length }
}

export async function clearShopSession(id: string) {
  await session.fromPartition(partitionFor(id)).clearStorageData().catch(() => undefined)
}

/** Opens a hidden window on the shop's affiliate page, runs `task`, then closes it. */
export async function withAffiliatePage<T>(target: ShopTarget, path: string, task: (contents: WebContents) => Promise<T>): Promise<T> {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    webPreferences: { partition: partitionFor(target.id), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.webContents.setUserAgent(USER_AGENT)
  window.webContents.setAudioMuted(true)
  try {
    await window.loadURL(affiliateUrl(target, path)).catch(() => undefined)
    // Let the page's own request SDK initialise before issuing API calls.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const finalUrl = window.webContents.getURL()
    const landed = (() => { try { const url = new URL(finalUrl); return `${url.host}${url.pathname}` } catch { return finalUrl || 'blank' } })()
    console.log('[creator-hub] page loaded', { requested: path, landed })
    if (!isAffiliatePage(finalUrl)) throw new Error(`CREATOR_HUB_LOGIN_EXPIRED:redirect ${landed}`)
    return await task(window.webContents)
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}

/**
 * Calls an affiliate API from inside the logged-in page, so the request carries the
 * page's own cookies and request signing. Read-only endpoints only.
 */
export async function pageApi(contents: WebContents, input: { method: 'GET' | 'POST'; path: string; query?: Record<string, string>; body?: unknown }) {
  if (!/^\/api\/(v1\/(affiliate|oec\/affiliate)|oec\/pay\/statement\/order\/seller)\//.test(input.path)) throw new Error('CREATOR_HUB_API_PATH_NOT_ALLOWED')
  const query = new URLSearchParams({ user_language: 'vi-VN', aid: '4331', app_name: 'i18n_ecom_alliance', device_platform: 'web', ...(input.query || {}) })
  const request = { method: input.method, url: `${input.path}?${query.toString()}`, body: input.body == null ? null : JSON.stringify(input.body) }
  const script = `new Promise((resolve) => {
    const req = ${JSON.stringify(request)};
    const xhr = new XMLHttpRequest();
    xhr.open(req.method, location.origin + req.url);
    xhr.timeout = 30000;
    if (req.body) xhr.setRequestHeader('content-type', 'application/json');
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => resolve({ status: 0, text: '' });
    xhr.ontimeout = () => resolve({ status: -1, text: '' });
    xhr.send(req.body);
  })`
  const result = await contents.executeJavaScript(script, true) as { status: number; text: string }
  if (result.status === 401 || result.status === 403) throw new Error(`CREATOR_HUB_LOGIN_EXPIRED:http ${result.status}`)
  if (result.status !== 200) throw new Error(`CREATOR_HUB_API_HTTP_${result.status}`)
  try {
    return JSON.parse(result.text)
  } catch {
    throw new Error('CREATOR_HUB_API_BAD_JSON')
  }
}

let visibleWindows = new Map<string, BrowserWindow>()

/** Shows the shop's affiliate backend for manual work (approve / ship samples stays there). */
export async function openBackend(target: ShopTarget, path?: string) {
  let window = visibleWindows.get(target.id)
  if (!window || window.isDestroyed()) {
    window = new BrowserWindow({ width: 1320, height: 900, show: true, title: 'TikTok Shop Affiliate', webPreferences: { partition: partitionFor(target.id), contextIsolation: true, nodeIntegration: false, sandbox: true } })
    window.webContents.setUserAgent(USER_AGENT)
    window.on('closed', () => { visibleWindows.delete(target.id) })
    visibleWindows.set(target.id, window)
  }
  await window.loadURL(affiliateUrl(target, path)).catch(() => undefined)
  window.show()
  window.focus()
  return { url: window.webContents.getURL(), loggedIn: isAffiliatePage(window.webContents.getURL()) }
}

export function closeBackend(id: string) {
  const window = visibleWindows.get(id)
  if (window && !window.isDestroyed()) window.close()
  visibleWindows.delete(id)
}

export function closeAllBackends() {
  for (const window of visibleWindows.values()) if (!window.isDestroyed()) window.close()
  visibleWindows = new Map()
}
