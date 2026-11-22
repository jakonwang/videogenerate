import { BrowserWindow, type WebContents } from 'electron'
import { partitionFor } from '../tiktok-creator-hub/browser'

/**
 * Seller center access for one shop. The shop's login lives in the same session partition as the
 * creator hub (cookies are on `.tiktok.com`), so a shop added there works here too.
 */

const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${(process.versions.chrome || '132.0.0.0').split('.')[0]}.0.0.0 Safari/537.36`

/** Read-only seller center endpoints this module may call. */
const ALLOWED_PATHS = [
  '/api/v1/seller/workbench/get_all_sellers',
  '/api/v1/product/local/products/list',
  '/api/v1/product/local/product/skus/list',
  '/api/fulfillment/order/list',
  '/api/v2/insights/seller/ttp/product/sku/list',
  '/api/v2/insights/seller/unified/query/us_overview_stats',
  '/api/v1/seller/home_task/get',
  '/api/v1/seller/growth_center/performance/list',
  '/api/v1/seller/growth_center/violation/overview/get',
  '/api/v1/pay/statement/order/list',
]

export type SellerTarget = { shopKey: string; region: string }

export function sellerOrigin(region: string) {
  const code = String(region || 'VN').trim().toLowerCase().replace(/[^a-z]/g, '') || 'vn'
  return `https://seller-${code}.tiktok.com`
}

export function isLoginUrl(url: string) {
  try {
    const parsed = new URL(url)
    return !/^seller-[a-z]+\.tiktok\.com$/.test(parsed.host) || /\/account\/(login|register)|\/login/i.test(parsed.pathname)
  } catch {
    return true
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** One hidden window per sync; pages are switched with `open()` so each API runs on its own page. */
export class SellerSession {
  private window: BrowserWindow | null = null
  private currentPath = ''
  private recovering: Promise<void> | null = null

  constructor(private readonly target: SellerTarget) {}

  get contents(): WebContents {
    if (!this.window || this.window.isDestroyed()) throw new Error('SELLER_WINDOW_CLOSED')
    return this.window.webContents
  }

  async open(path: string) {
    this.currentPath = path
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        show: false,
        width: 1366,
        height: 900,
        webPreferences: { partition: partitionFor(this.target.shopKey), contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      this.window.webContents.setUserAgent(USER_AGENT)
      this.window.webContents.setAudioMuted(true)
    }
    const url = `${sellerOrigin(this.target.region)}${path}${path.includes('?') ? '&' : '?'}shop_region=${encodeURIComponent(this.target.region.toUpperCase())}`
    await this.window.loadURL(url).catch(() => undefined)
    // The page installs its request-signing SDK on load; give it a moment before calling APIs.
    await wait(2500)
    const landed = this.window.webContents.getURL()
    if (isLoginUrl(landed)) throw new Error('SELLER_LOGIN_REQUIRED')
  }

  /**
   * Calls a seller API with the page's own `fetch`, which carries the session cookies and the
   * page's request signing.
   */
  async api(input: { method: 'GET' | 'POST'; path: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string>; timeoutMs?: number }) {
    if (!ALLOWED_PATHS.includes(input.path)) throw new Error('SELLER_API_PATH_NOT_ALLOWED')
    const query = new URLSearchParams({ locale: 'vi-VN', language: 'vi-VN', aid: '4068', app_name: 'i18n_ecom_shop', device_platform: 'web', ...(input.query || {}) })
    const request = {
      method: input.method,
      url: `${input.path}?${query.toString()}`,
      headers: { ...(input.body == null ? {} : { 'content-type': 'application/json' }), ...(input.headers || {}) },
      body: input.body == null ? null : JSON.stringify(input.body),
      timeoutMs: input.timeoutMs ?? 30_000,
    }
    const script = `(async () => {
      const req = ${JSON.stringify(request)};
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      try {
        const init = { method: req.method, credentials: 'include', headers: req.headers, signal: controller.signal };
        if (req.body) init.body = req.body;
        const response = await window.fetch(req.url, init);
        return { status: response.status, text: await response.text(), url: location.href };
      } catch (error) {
        return { status: 0, text: String(error && error.message || error), url: location.href };
      } finally {
        clearTimeout(timer);
      }
    })()`
    // The page's own request wrapper can stop answering; never wait longer than the request timeout.
    let timer: ReturnType<typeof setTimeout> | null = null
    const hardLimit = new Promise<{ status: number; text: string; url: string }>((resolve) => {
      timer = setTimeout(() => resolve({ status: -1, text: '', url: this.window?.webContents.getURL() || '' }), request.timeoutMs + 10_000)
    })
    const result = await Promise.race([this.contents.executeJavaScript(script, true) as Promise<{ status: number; text: string; url: string }>, hardLimit])
    if (timer) clearTimeout(timer)
    if (isLoginUrl(result.url) || result.status === 401 || result.status === 403) throw new Error('SELLER_LOGIN_REQUIRED')
    if (result.status !== 200) throw new Error(`SELLER_API_HTTP_${result.status}`)
    try {
      return JSON.parse(result.text) as unknown
    } catch {
      throw new Error('SELLER_API_BAD_JSON')
    }
  }

  /** Reloads the current page so a stuck request layer starts fresh; concurrent callers share one reload. */
  async recover() {
    if (!this.currentPath) return
    this.recovering ??= this.open(this.currentPath).catch(() => undefined).finally(() => { this.recovering = null })
    await this.recovering
  }

  close() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }
}

const visibleWindows = new Map<string, BrowserWindow>()

/** Shows the shop's seller center so the user can log in or check something by hand. */
export async function openSellerCenter(target: SellerTarget, path = '/homepage') {
  let window = visibleWindows.get(target.shopKey)
  if (!window || window.isDestroyed()) {
    window = new BrowserWindow({ width: 1366, height: 900, show: true, title: 'TikTok Shop Seller Center', webPreferences: { partition: partitionFor(target.shopKey), contextIsolation: true, nodeIntegration: false, sandbox: true } })
    window.webContents.setUserAgent(USER_AGENT)
    window.on('closed', () => visibleWindows.delete(target.shopKey))
    visibleWindows.set(target.shopKey, window)
  }
  await window.loadURL(`${sellerOrigin(target.region)}${path}`).catch(() => undefined)
  window.show()
  window.focus()
  return { loggedIn: !isLoginUrl(window.webContents.getURL()) }
}
