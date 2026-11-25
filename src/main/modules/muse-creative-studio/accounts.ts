import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { parseMuseProxy, publicMuseProxy, type MuseProxy } from './proxy'
import { normalizeMuseCookies, type MuseCookie } from './session'
import type { MuseAccount, MuseAccountState, MuseExit, MuseQuota } from './types'

type StoredAccount = Omit<MuseAccount, 'hasSession'> & { encryptedProxy?: string; encryptedCookies?: string }
type Db = { accounts: StoredAccount[] }

export type MuseVault = { encrypt(value: string): string | null; decrypt(value: string): string | null }

/** File and encryption are injected so the store can be tested without Electron. */
export function createMuseAccounts(options: { path: () => string; vault: MuseVault }) {
  let queue: Promise<unknown> = Promise.resolve()

  const read = () => readJsonFile<Db>(options.path(), { accounts: [] })
  const mutate = <T>(change: (db: Db) => T): Promise<T> => {
    const run = queue.then(async () => {
      const db = await read()
      const result = change(db)
      await writeJsonFile(options.path(), db)
      return result
    })
    queue = run.catch(() => undefined)
    return run
  }
  const seal = (value: unknown) => {
    const sealed = options.vault.encrypt(JSON.stringify(value))
    if (!sealed) throw new Error('本机安全存储不可用，无法保存代理和登录信息')
    return sealed
  }
  const open = <T>(value: string): T => {
    const text = options.vault.decrypt(value)
    if (!text) throw new Error('无法在本机解密账号信息，请重新填写')
    return JSON.parse(text) as T
  }
  const find = (db: Db, id: string) => {
    const account = db.accounts.find((item) => item.id === id)
    if (!account) throw new Error('Muse 账号不存在')
    return account
  }
  const toPublic = ({ encryptedProxy: _proxy, encryptedCookies, ...rest }: StoredAccount): MuseAccount => ({
    ...rest,
    hasSession: Boolean(encryptedCookies),
  })
  const change = (id: string, apply: (account: StoredAccount) => void) => mutate((db) => {
    const account = find(db, id)
    apply(account)
    account.updatedAt = Date.now()
    return toPublic(account)
  })

  return {
    async list() {
      return (await read()).accounts.map(toPublic).sort((a, b) => a.priority - b.priority)
    },

    async get(id: string) {
      return toPublic(find(await read(), id))
    },

    async getProxy(id: string): Promise<MuseProxy> {
      const account = find(await read(), id)
      if (!account.encryptedProxy) throw new Error('该账号还没有设置代理，已停止访问')
      return open<MuseProxy>(account.encryptedProxy)
    },

    async getCookies(id: string): Promise<MuseCookie[]> {
      const account = find(await read(), id)
      return account.encryptedCookies ? open<MuseCookie[]>(account.encryptedCookies) : []
    },

    async create(input: { name: string; proxy: string }) {
      const proxy = parseMuseProxy(input.proxy)
      return await mutate((db) => {
        const account: StoredAccount = {
          id: randomUUID(),
          name: String(input.name || '').trim() || `Muse 账号 ${db.accounts.length + 1}`,
          enabled: false,
          priority: db.accounts.reduce((max, item) => Math.max(max, item.priority + 1), 0),
          state: 'unchecked',
          proxy: publicMuseProxy(proxy),
          encryptedProxy: seal(proxy),
          updatedAt: Date.now(),
        }
        db.accounts.push(account)
        return toPublic(account)
      })
    },

    /** A blank proxy keeps the saved one. A new one must be checked again before use. */
    async update(input: { id: string; name?: string; proxy?: string }) {
      const proxy = String(input.proxy || '').trim() ? parseMuseProxy(input.proxy!) : undefined
      return await change(input.id, (account) => {
        if (input.name !== undefined) account.name = String(input.name).trim() || account.name
        if (!proxy) return
        account.proxy = publicMuseProxy(proxy)
        account.encryptedProxy = seal(proxy)
        account.exit = undefined
        account.pinnedIp = undefined
        account.enabled = false
        account.state = 'unchecked'
        account.lastError = undefined
      })
    },

    setEnabled(id: string, enabled: boolean) {
      return change(id, (account) => {
        if (enabled) {
          if (account.state !== 'ready' && account.state !== 'disabled') throw new Error('账号未就绪，请先完成代理检测和登录')
          if (account.exit?.country !== 'US' || account.pinnedIp !== account.exit.ip) throw new Error('请先检测代理并确认美国出口')
          if (!account.encryptedCookies) throw new Error('请先登录 Muse')
          account.state = 'ready'
        } else if (account.state === 'ready') {
          account.state = 'disabled'
        }
        account.enabled = enabled
      })
    },

    /** Accounts are used in this order. */
    move(id: string, step: -1 | 1) {
      return mutate((db) => {
        const ordered = [...db.accounts].sort((a, b) => a.priority - b.priority)
        const from = ordered.findIndex((item) => item.id === id)
        const to = from + (Number(step) < 0 ? -1 : 1)
        if (from < 0 || to < 0 || to >= ordered.length) return
        ;[ordered[from], ordered[to]] = [ordered[to], ordered[from]]
        ordered.forEach((item, index) => { item.priority = index })
      })
    },

    setState(id: string, state: MuseAccountState, lastError?: string) {
      return change(id, (account) => {
        account.state = state
        account.lastError = lastError
      })
    },

    setQuotaUntil(id: string, quotaUntil?: number) {
      return change(id, (account) => {
        account.quotaUntil = quotaUntil
      })
    },

    setQuota(id: string, quota: MuseQuota, quotaUntil?: number) {
      return change(id, (account) => {
        account.quota = quota
        account.quotaUntil = quotaUntil
      })
    },

    /** The first US exit is pinned; afterwards a different IP needs `acceptExit`. */
    recordExit(id: string, exit: MuseExit) {
      return change(id, (account) => {
        account.exit = exit
        if (exit.country === 'US' && !account.pinnedIp) account.pinnedIp = exit.ip
      })
    },

    acceptExit(id: string) {
      return change(id, (account) => {
        if (account.exit?.country !== 'US') throw new Error('当前出口不在美国，不能确认')
        account.pinnedIp = account.exit.ip
        account.state = 'unchecked'
        account.lastError = undefined
      })
    },

    async saveCookies(id: string, input: unknown) {
      const cookies = normalizeMuseCookies(input)
      return await change(id, (account) => {
        account.encryptedCookies = seal(cookies)
      })
    },

    remove(id: string) {
      return mutate((db) => {
        db.accounts = db.accounts.filter((item) => item.id !== id)
        return { ok: true as const }
      })
    },
  }
}

export type MuseAccounts = ReturnType<typeof createMuseAccounts>
