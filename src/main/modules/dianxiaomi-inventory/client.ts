import type { BrowserWindow } from 'electron'
import { BrowserWindow as ElectronBrowserWindow, session } from 'electron'
import type { DianxiaomiSearchPayload, InventoryAuthStatus } from './types'

export const DIANXIAOMI_ORDER_URL = 'https://www.dianxiaomi.com/web/order/all?go=m1-1'
export const DIANXIAOMI_ADVANCED_SEARCH_URL = 'https://www.dianxiaomi.com/api/package/advancedSearch.json'
export const DIANXIAOMI_SESSION_PARTITION = 'persist:dianxiaomi-inventory'

export type DianxiaomiClientLike = {
  getAuthStatus(): Promise<InventoryAuthStatus>
  openLogin(): Promise<{ ok: true }>
  logout(): Promise<{ ok: true }>
  search(payload: DianxiaomiSearchPayload): Promise<unknown>
  close(): void
}

export function buildAdvancedSearchPayload(input: {
  sku: string
  startDate: string
  endDate: string
  pageNo: number
  pageSize?: number
  history?: boolean
}): DianxiaomiSearchPayload {
  return {
    searchTypes: 'productSku',
    contents: String(input.sku || '').trim(),
    orderAdvSearchType: 1,
    state: '',
    isVoided: '-1',
    isRemoved: '-1',
    commitPlatforms: '',
    isOversea: '-1',
    shopId: '-1',
    platform: '',
    orderField: 'order_create_time',
    isDesc: '1',
    timeOut: '0',
    warehouseCode: '',
    isGreen: '0',
    isYellow: '0',
    isOrange: '0',
    isRed: '0',
    isViolet: '0',
    isBlue: '0',
    cornflowerBlue: '0',
    pink: '0',
    teal: '0',
    turquoise: '0',
    unmarked: '0',
    shippedStart: `${input.startDate} 00:00:00`,
    shippedEnd: `${input.endDate} 23:59:59`,
    pageNo: Math.max(1, Math.trunc(Number(input.pageNo) || 1)),
    pageSize: Math.min(100, Math.max(1, Math.trunc(Number(input.pageSize) || 100))),
    history: input.history ? '1' : '',
    authId: '-1',
    days: '-1',
    isPrintJh: '-1',
    isPrintJhTemp: '-1',
    isPrintMd: '-1',
    signPriorShip: '-1',
    isHasOrderMessage: '-1',
    isHasOrderComment: '-1',
    isHasServiceComment: '-1',
    isHasPickComment: '-1',
    forbiddenStatus: '-1',
    forbiddenReason: '0',
    pickingInstructions: '',
    priceStart: '',
    priceEnd: '',
    orderCreateStart: '',
    orderCreateEnd: '',
    orderPayStart: '',
    orderPayEnd: '',
    applyTimeStart: '',
    applyTimeEnd: '',
    refundedStart: '',
    refundedEnd: '',
    mdSignStart: '',
    mdSignEnd: '',
    jhSignStart: '',
    jhSignEnd: '',
    timeOutQuery: '-1',
    productCountStart: '',
    productCountEnd: '',
    storageIds: '',
    storageId: '0',
    country: '',
    globalCollection: '-1',
    platformOrderStatus: '',
    productStatus: '',
  }
}

function isDestroyed(window: BrowserWindow | null) {
  return !window || window.isDestroyed()
}

function parseBody(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { raw: text }
  }
}

function isLoginBody(text: string) {
  return /login|sign.?in|captcha|\u767b\u5f55|\u9a8c\u8bc1\u7801/i.test(text)
}

export class DianxiaomiClient implements DianxiaomiClientLike {
  private window: BrowserWindow | null = null
  private loadedUrl = ''

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {}

  private async ensureWindow(show: boolean) {
    if (!isDestroyed(this.window)) {
      if (show) {
        this.window?.show()
        this.window?.focus()
      }
      return this.window as BrowserWindow
    }

    const parent = this.getMainWindow()
    const next = new ElectronBrowserWindow({
      width: 1180,
      height: 820,
      show,
      title: 'Dianxiaomi',
      ...(parent && !parent.isDestroyed() ? { parent } : {}),
      webPreferences: {
        partition: DIANXIAOMI_SESSION_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    this.window = next
    this.loadedUrl = ''
    next.on('closed', () => {
      if (this.window === next) {
        this.window = null
        this.loadedUrl = ''
      }
    })
    await next.loadURL(DIANXIAOMI_ORDER_URL)
    this.loadedUrl = next.webContents.getURL()
    if (show) {
      next.show()
      next.focus()
    }
    return next
  }

  async getAuthStatus(): Promise<InventoryAuthStatus> {
    const checkedAt = Date.now()
    try {
      const cookies = await session.fromPartition(DIANXIAOMI_SESSION_PARTITION).cookies.get({ domain: 'dianxiaomi.com' })
      const hasAuthCookie = cookies.some((cookie) => /session|token|auth|user|login/i.test(cookie.name))
      const authWindow = await this.ensureWindow(false)
      const pageUrl = String(authWindow.webContents.getURL() || '')
      const isOrderWorkspace = /\/web\/order\//i.test(pageUrl)
      const authenticated = hasAuthCookie && isOrderWorkspace
      return {
        available: true,
        authenticated,
        checkedAt,
        ...(authenticated ? {} : { message: 'Dianxiaomi login is required' }),
      }
    } catch (error) {
      return {
        available: false,
        authenticated: false,
        checkedAt,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async openLogin() {
    await this.ensureWindow(true)
    return { ok: true as const }
  }

  async logout() {
    this.window?.close()
    this.window = null
    this.loadedUrl = ''
    await session.fromPartition(DIANXIAOMI_SESSION_PARTITION).clearStorageData({
      storages: ['cookies', 'localstorage', 'serviceworkers', 'cachestorage'],
    })
    return { ok: true as const }
  }

  async search(payload: DianxiaomiSearchPayload) {
    const window = await this.ensureWindow(false)
    const body = new URLSearchParams(
      Object.entries(payload).map(([key, value]) => [key, String(value)]),
    ).toString()
    const script = `(async () => {
      const response = await fetch(${JSON.stringify(DIANXIAOMI_ADVANCED_SEARCH_URL)}, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/x-www-form-urlencoded',
          'bx-v': '2.5.11',
          'x-requested-with': 'XMLHttpRequest'
        },
        body: ${JSON.stringify(body)}
      });
      return { status: response.status, text: await response.text(), url: location.href };
    })()`
    const result = await window.webContents.executeJavaScript(script, true) as { status?: number; text?: string; url?: string }
    const status = Number(result?.status || 0)
    const text = String(result?.text || '')
    if (status === 401 || status === 403 || isLoginBody(text) || /\/login/i.test(String(result?.url || this.loadedUrl))) {
      throw new Error('DIANXIAOMI_AUTH_REQUIRED')
    }
    if (status >= 400) throw new Error(`Dianxiaomi request failed (${status})`)
    return parseBody(text)
  }

  close() {
    if (!isDestroyed(this.window)) this.window?.close()
    this.window = null
    this.loadedUrl = ''
  }
}
