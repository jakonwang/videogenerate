import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  buildLiveOverview,
  parseCreator,
  parseRoomList,
  parseRoomProducts,
  roomListBody,
  roomProductsBody,
  type LiveAccount,
  type LiveMatchInput,
  type LiveOverview,
  type LiveRoom,
  type LiveSyncState,
} from '../../../shared/liveAccounts'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { parseCookieEditorJson } from '../tiktok-creator-hub/cookies'
import type { LiveSessionLike } from './browser'

type State = { accounts: LiveAccount[]; rooms: LiveRoom[] }

type Deps = {
  now: () => number
  session: (accountId: string) => Promise<LiveSessionLike>
  replaceCookies: (accountId: string, cookies: ReturnType<typeof parseCookieEditorJson>['cookies']) => Promise<unknown>
  clearSession: (accountId: string) => Promise<void>
  match: () => Promise<LiveMatchInput>
  delay: (ms: number) => Promise<void>
}

const DAY = 86_400_000
const FIRST_DAYS = 60
const REFRESH_DAYS = 14
/** 归因还会变动：这几天内下播的场次每次都重新取商品 */
const SETTLE_DAYS = 3
const PAGE = 20
const AUTO_SYNC_MS = 3 * 3_600_000

const defaultDeps: Deps = {
  now: () => Date.now(),
  session: async (id) => new (await import('./browser')).LiveSession(id),
  replaceCookies: async (id, cookies) => (await import('../tiktok-creator-hub/browser')).replaceCookies(id, cookies),
  clearSession: async (id) => (await import('../tiktok-creator-hub/browser')).clearShopSession(id),
  match: async () => {
    const { productCodesService } = await import('../product-codes/service')
    const { sellerInventoryRepo } = await import('../seller-inventory/repo')
    const { store, known } = await productCodesService.matchContext()
    return { skus: store.skus, mappings: store.mappings, known, orders: (keys, from, to) => sellerInventoryRepo.listOrderLinesBySkus(keys, from, to) }
  },
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}
let deps = defaultDeps
export function setLiveAccountsTestDependencies(next?: Partial<Deps>) {
  deps = { ...defaultDeps, ...next }
  state = null
}

const file = () => join(getAppPaths().dbDir, 'live-accounts.json')
let state: State | null = null
async function load(): Promise<State> {
  if (!state) {
    const data = await readJsonFile<State>(file(), { accounts: [], rooms: [] })
    state = { accounts: Array.isArray(data.accounts) ? data.accounts : [], rooms: Array.isArray(data.rooms) ? data.rooms : [] }
  }
  return state
}
const persist = async () => writeJsonFile(file(), await load())

const running = new Map<string, LiveSyncState>()

async function requireAccount(id: string) {
  const account = (await load()).accounts.find((item) => item.id === id)
  if (!account) throw new Error('LIVE_ACCOUNT_NOT_FOUND')
  return account
}

async function readCreator(session: LiveSessionLike) {
  const creator = parseCreator(await session.api('/api/v2/insights/creator/info', {}))
  if (!creator) throw new Error('LIVE_LOGIN_REQUIRED')
  return creator
}

async function withSession<T>(accountId: string, task: (session: LiveSessionLike) => Promise<T>) {
  const session = await deps.session(accountId)
  try {
    await session.open()
    return await task(session)
  } finally {
    session.close()
  }
}

const isLoginError = (error: unknown) => String((error as Error)?.message || error).includes('LIVE_LOGIN_REQUIRED')

let timer: ReturnType<typeof setInterval> | null = null

export const liveAccountsService = {
  async list() {
    return (await load()).accounts.map((item) => ({ ...item }))
  },

  getProgress(): LiveSyncState[] {
    return [...running.values()]
  },

  /** Cookie-Editor 导出的 JSON；先校验是哪个账号再保存，已有的账号自动更新登录。Cookie 只留在本机的登录分区里。 */
  async importCookies(input: { cookieJson: string; accountId?: string; name?: string }) {
    const parsed = parseCookieEditorJson(input.cookieJson)
    if (!parsed.hasSession) throw new Error('CREATOR_HUB_COOKIE_NO_SESSION')
    const data = await load()
    const target = input.accountId ? await requireAccount(input.accountId) : undefined
    const stagingId = `live-${randomUUID()}`
    let creator: Awaited<ReturnType<typeof readCreator>>
    try {
      // 先放到临时分区校验，失败不影响已有登录
      await deps.replaceCookies(stagingId, parsed.cookies)
      creator = await withSession(stagingId, readCreator)
    } catch (error) {
      await deps.clearSession(stagingId)
      throw error
    }
    if (target && target.handle !== creator.handle) {
      await deps.clearSession(stagingId)
      throw new Error(`LIVE_ACCOUNT_MISMATCH:${creator.handle}`)
    }
    const existing = target || data.accounts.find((item) => item.handle === creator.handle)
    const now = deps.now()
    if (existing) {
      await deps.replaceCookies(existing.id, parsed.cookies)
      await deps.clearSession(stagingId)
    }
    const account: LiveAccount = {
      id: existing?.id || stagingId,
      handle: creator.handle,
      name: input.name?.trim().slice(0, 80) || existing?.name || creator.name,
      region: creator.region || existing?.region || '',
      currency: creator.currency || existing?.currency || '',
      loginState: 'valid',
      cookieImportedAt: now,
      cookieExpiresAt: parsed.expiresAt,
      lastVerifiedAt: now,
      lastSyncAt: existing?.lastSyncAt,
      createdAt: existing?.createdAt || now,
    }
    data.accounts = existing ? data.accounts.map((item) => (item.id === account.id ? account : item)) : [...data.accounts, account]
    await persist()
    return { account, merged: Boolean(existing && !target) }
  },

  async verify(id: string) {
    const account = await requireAccount(id)
    try {
      const creator = await withSession(id, readCreator)
      if (creator.handle !== account.handle) throw new Error(`LIVE_ACCOUNT_MISMATCH:${creator.handle}`)
      Object.assign(account, { loginState: 'valid', lastVerifiedAt: deps.now(), lastSyncError: undefined })
    } catch (error) {
      if (!isLoginError(error)) throw error
      Object.assign(account, { loginState: 'expired', lastVerifiedAt: deps.now() })
    }
    await persist()
    return { ...account }
  },

  async rename(id: string, name: string) {
    const account = await requireAccount(id)
    const next = String(name || '').trim().slice(0, 80)
    if (next) account.name = next
    await persist()
    return { ...account }
  },

  async remove(id: string) {
    await requireAccount(id)
    if (running.get(id)?.status === 'running') throw new Error('LIVE_SYNC_RUNNING')
    ;(await import('./browser').catch(() => null))?.closeLiveBackend(id)
    await deps.clearSession(id)
    const data = await load()
    data.accounts = data.accounts.filter((item) => item.id !== id)
    data.rooms = data.rooms.filter((item) => item.accountId !== id)
    running.delete(id)
    await persist()
    return { ok: true as const }
  },

  async openBackend(id: string) {
    await requireAccount(id)
    return (await import('./browser')).openLiveBackend(id)
  },

  /** 同步场次和每场的商品；不传账号就同步全部 */
  async sync(input?: { accountId?: string }) {
    const accounts = input?.accountId ? [await requireAccount(input.accountId)] : (await load()).accounts
    for (const account of accounts) await this.syncAccount(account.id)
    return { ok: true as const }
  },

  async syncAccount(id: string) {
    const account = await requireAccount(id)
    if (running.get(id)?.status === 'running') return
    const job: LiveSyncState = { accountId: id, status: 'running', done: 0, total: 0 }
    running.set(id, job)
    try {
      await withSession(id, async (session) => {
        const creator = await readCreator(session)
        if (creator.handle !== account.handle) throw new Error(`LIVE_ACCOUNT_MISMATCH:${creator.handle}`)
        const now = deps.now()
        const start = now - (account.lastSyncAt ? REFRESH_DAYS : FIRST_DAYS) * DAY
        const found: LiveRoom[] = []
        for (let page = 1; page <= 50; page += 1) {
          const result = parseRoomList(await session.api('/api/v1/streamer_desktop/live_analytics/detail_performance/list', roomListBody(start, now, page, PAGE)), id, creator.currency || account.currency)
          found.push(...result.rooms)
          if (!result.rooms.length || page * PAGE >= result.total) break
          await deps.delay(400)
        }
        const data = await load()
        // 还在播的场次等下播后再收
        const ended = found.filter((room) => room.endAt > room.startAt && room.endAt <= now)
        job.total = ended.length
        for (const room of ended) {
          const old = data.rooms.find((item) => item.id === room.id)
          const settled = old?.productsAt && old.productsAt > room.endAt + SETTLE_DAYS * DAY
          let next: LiveRoom = { ...room, products: old?.products || [], productsAt: old?.productsAt }
          if (!settled) {
            const products = parseRoomProducts(await session.api('/api/v1/insights/workbench/live/detail/product/list', roomProductsBody(room.id)))
            next = { ...next, products, productsAt: deps.now() }
            await deps.delay(400)
          }
          data.rooms = [...data.rooms.filter((item) => item.id !== room.id), next]
          job.done += 1
        }
      })
      Object.assign(account, { loginState: 'valid', lastVerifiedAt: deps.now(), lastSyncAt: deps.now(), lastSyncError: undefined })
      job.status = 'done'
    } catch (error) {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : String(error)
      account.lastSyncError = job.error
      if (isLoginError(error)) account.loginState = 'expired'
    }
    await persist()
  },

  /** 场次、按款号汇总、没法归款的商品；since 只看这之后的场次 */
  async overview(input?: { since?: number }): Promise<LiveOverview> {
    const data = await load()
    const match = await deps.match().catch((): LiveMatchInput => ({ skus: [], mappings: new Map(), known: new Set(), orders: () => [] }))
    return buildLiveOverview(data.accounts, data.rooms, match, Number(input?.since) || 0)
  },

  startScheduler() {
    if (timer) return
    const tick = async () => {
      for (const account of await this.list()) {
        if (account.loginState !== 'valid' || (account.lastSyncAt && deps.now() - account.lastSyncAt < AUTO_SYNC_MS)) continue
        await this.syncAccount(account.id).catch((error) => console.warn('[live-accounts] auto sync failed', error instanceof Error ? error.message : error))
      }
    }
    timer = setInterval(() => void tick(), 30 * 60_000)
    setTimeout(() => void tick(), 150_000)
  },
}
