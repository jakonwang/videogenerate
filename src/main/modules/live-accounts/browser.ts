import { BrowserWindow } from 'electron'
import { partitionFor } from '../tiktok-creator-hub/browser'

/** 主播工作台的登录和只读接口。每个直播账号一个独立的登录分区。 */

const ORIGIN = 'https://shop.tiktok.com'
const HOME = '/streamer/compass/live-details/view'
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${(process.versions.chrome || '132.0.0.0').split('.')[0]}.0.0.0 Safari/537.36`

/** 只允许调用这几个读取接口 */
export const LIVE_PATHS = {
  creator: '/api/v2/insights/creator/info',
  rooms: '/api/v1/streamer_desktop/live_analytics/detail_performance/list',
  products: '/api/v1/insights/workbench/live/detail/product/list',
} as const

const QUERY: Record<string, Record<string, string>> = {
  [LIVE_PATHS.products]: { app_name: 'i18n_ecom_shop', device_id: '0', device_platform: 'web', vertical: '3' },
}
const DEFAULT_QUERY = { user_language: 'en', locale: 'en', aid: '253642', app_name: 'i18n_ecom_alliance', device_id: '0', device_platform: 'web' }

export function isStreamerPage(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.host === 'shop.tiktok.com' && /^\/(streamer|workbench)\//.test(parsed.pathname) && !/login/i.test(parsed.pathname)
  } catch {
    return false
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface LiveSessionLike {
  open(): Promise<void>
  api(path: string, body: unknown): Promise<unknown>
  close(): void
}

export class LiveSession implements LiveSessionLike {
  private window: BrowserWindow | null = null
  constructor(private readonly accountId: string) {}

  async open() {
    this.window = new BrowserWindow({ show: false, width: 1366, height: 900, webPreferences: { partition: partitionFor(this.accountId), contextIsolation: true, nodeIntegration: false, sandbox: true } })
    this.window.webContents.setUserAgent(USER_AGENT)
    this.window.webContents.setAudioMuted(true)
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await this.window.loadURL(`${ORIGIN}${HOME}`).catch(() => undefined)
    // 没登录时页面加载后才跳走，等它定下来
    await wait(4000)
    if (!isStreamerPage(this.window.webContents.getURL())) throw new Error('LIVE_LOGIN_REQUIRED')
  }

  async api(path: string, body: unknown) {
    if (!(Object.values(LIVE_PATHS) as string[]).includes(path)) throw new Error('LIVE_API_PATH_NOT_ALLOWED')
    const contents = this.window && !this.window.isDestroyed() ? this.window.webContents : null
    if (!contents) throw new Error('LIVE_WINDOW_CLOSED')
    const request = { url: `${path}?${new URLSearchParams(QUERY[path] || DEFAULT_QUERY)}`, body: JSON.stringify(body) }
    const script = `(async () => {
      const req = ${JSON.stringify(request)};
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await window.fetch(req.url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: req.body, signal: controller.signal });
        return { status: response.status, text: await response.text(), url: location.href };
      } catch (error) {
        return { status: 0, text: '', url: location.href };
      } finally { clearTimeout(timer); }
    })()`
    let timer: ReturnType<typeof setTimeout> | undefined
    const limit = new Promise<{ status: number; text: string; url: string }>((resolve) => { timer = setTimeout(() => resolve({ status: -1, text: '', url: contents.isDestroyed() ? '' : contents.getURL() }), 40_000) })
    const result = await Promise.race([contents.executeJavaScript(script, true) as Promise<{ status: number; text: string; url: string }>, limit])
    clearTimeout(timer)
    if (!isStreamerPage(result.url) || result.status === 401) throw new Error('LIVE_LOGIN_REQUIRED')
    if (result.status !== 200) throw new Error(`LIVE_API_HTTP_${result.status}`)
    try {
      return JSON.parse(result.text) as unknown
    } catch {
      throw new Error('LIVE_API_BAD_JSON')
    }
  }

  close() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }
}

const visible = new Map<string, BrowserWindow>()

/** 打开这个账号的主播工作台，登录过期时也可以在里面重新登录 */
export async function openLiveBackend(accountId: string) {
  let window = visible.get(accountId)
  if (!window || window.isDestroyed()) {
    window = new BrowserWindow({ width: 1366, height: 900, show: true, title: 'TikTok Shop LIVE', webPreferences: { partition: partitionFor(accountId), contextIsolation: true, nodeIntegration: false, sandbox: true } })
    window.webContents.setUserAgent(USER_AGENT)
    window.on('closed', () => visible.delete(accountId))
    visible.set(accountId, window)
  }
  await window.loadURL(`${ORIGIN}${HOME}`).catch(() => undefined)
  window.show()
  window.focus()
  return { loggedIn: isStreamerPage(window.webContents.getURL()) }
}

export function closeLiveBackend(accountId: string) {
  const window = visible.get(accountId)
  if (window && !window.isDestroyed()) window.close()
  visible.delete(accountId)
}
