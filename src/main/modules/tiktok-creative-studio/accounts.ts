import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { decryptRuntimeString, encryptRuntimeString, isRuntimeEncryptionAvailable } from '../../lib/runtimeCrypto'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { TiktokCreativeAccount, TiktokCreativeAccountState } from './types'

export type TiktokCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

type StoredAccount = TiktokCreativeAccount & {
  encryptedCookies: string
}

type AccountsDb = {
  accounts: StoredAccount[]
}

function accountsPath() {
  return join(getAppPaths().dbDir, 'tiktok-creative-studio-accounts.json')
}

function normalizeSameSite(value: unknown): TiktokCookie['sameSite'] {
  const text = String(value || '').toLowerCase()
  if (text === 'strict') return 'Strict'
  if (text === 'none' || text === 'no_restriction') return 'None'
  return 'Lax'
}

export function normalizeTiktokCookies(input: unknown): TiktokCookie[] {
  const rows = Array.isArray(input) ? input : []
  const cookies = rows
    .map((entry: any) => {
      const name = String(entry?.name || '').trim()
      const value = String(entry?.value || '')
      const domain = String(entry?.domain || '').trim()
      if (!name || !domain) return null
      const expiration = Number(entry?.expirationDate ?? entry?.expires)
      return {
        name,
        value,
        domain,
        path: String(entry?.path || '/').trim() || '/',
        expires: Number.isFinite(expiration) && expiration > 0 ? expiration : undefined,
        httpOnly: Boolean(entry?.httpOnly),
        secure: entry?.secure !== false,
        sameSite: normalizeSameSite(entry?.sameSite),
      } satisfies TiktokCookie
    })
    .filter(Boolean) as TiktokCookie[]
  if (!cookies.length) throw new Error('Cookie JSON does not contain valid cookies')
  if (!cookies.some((cookie) => cookie.domain.endsWith('tiktok.com'))) {
    throw new Error('Cookie JSON does not contain TikTok cookies')
  }
  return cookies
}

function publicAccount(account: StoredAccount): TiktokCreativeAccount {
  const { encryptedCookies: _encryptedCookies, ...summary } = account
  return summary
}

async function readDb() {
  return await readJsonFile<AccountsDb>(accountsPath(), { accounts: [] })
}

export const tiktokCreativeAccounts = {
  encryptionAvailable() {
    return isRuntimeEncryptionAvailable()
  },

  async list() {
    const db = await readDb()
    return db.accounts
      .map(publicAccount)
      .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async import(input: { id?: string; name: string; cookieJson: string }) {
    if (!isRuntimeEncryptionAvailable()) throw new Error('Secure cookie storage is unavailable on this device')
    let parsed: unknown
    try {
      parsed = JSON.parse(String(input.cookieJson || ''))
    } catch {
      throw new Error('Cookie JSON is invalid')
    }
    const cookies = normalizeTiktokCookies(parsed)
    const encryptedCookies = encryptRuntimeString(JSON.stringify(cookies))
    if (!encryptedCookies) throw new Error('Secure cookie storage is unavailable on this device')
    const db = await readDb()
    const existingIndex = db.accounts.findIndex((item) => item.id === String(input.id || '').trim())
    const timestamp = Date.now()
    const account: StoredAccount = {
      id: existingIndex >= 0 ? db.accounts[existingIndex].id : randomUUID(),
      name: String(input.name || '').trim() || `TikTok account ${db.accounts.length + 1}`,
      priority: existingIndex >= 0 ? db.accounts[existingIndex].priority : db.accounts.length,
      enabled: existingIndex >= 0 ? db.accounts[existingIndex].enabled : true,
      state: 'unknown',
      cookieCount: cookies.length,
      encryptedCookies,
      updatedAt: timestamp,
    }
    if (existingIndex >= 0) db.accounts[existingIndex] = account
    else db.accounts.push(account)
    await writeJsonFile(accountsPath(), db)
    return publicAccount(account)
  },

  async getCookies(id: string) {
    const db = await readDb()
    const account = db.accounts.find((item) => item.id === id)
    if (!account) throw new Error('TikTok account does not exist')
    const decrypted = decryptRuntimeString(account.encryptedCookies)
    if (!decrypted) throw new Error('TikTok account cookies cannot be decrypted on this device')
    return normalizeTiktokCookies(JSON.parse(decrypted))
  },

  async update(input: { id: string; name?: string; enabled?: boolean; priority?: number }) {
    const db = await readDb()
    const index = db.accounts.findIndex((item) => item.id === input.id)
    if (index < 0) throw new Error('TikTok account does not exist')
    const current = db.accounts[index]
    db.accounts[index] = {
      ...current,
      name: input.name === undefined ? current.name : String(input.name || '').trim() || current.name,
      enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
      priority: input.priority === undefined ? current.priority : Math.max(0, Number(input.priority) || 0),
      state: input.enabled === false ? 'disabled' : current.state === 'disabled' ? 'unknown' : current.state,
      updatedAt: Date.now(),
    }
    await writeJsonFile(accountsPath(), db)
    return publicAccount(db.accounts[index])
  },

  async updateState(id: string, input: { state: TiktokCreativeAccountState; credit?: number; lastError?: string }) {
    const db = await readDb()
    const index = db.accounts.findIndex((item) => item.id === id)
    if (index < 0) return null
    db.accounts[index] = {
      ...db.accounts[index],
      state: input.state,
      credit: input.credit,
      creditCheckedAt: Date.now(),
      lastError: String(input.lastError || '').trim() || undefined,
      updatedAt: Date.now(),
    }
    await writeJsonFile(accountsPath(), db)
    return publicAccount(db.accounts[index])
  },

  async remove(id: string) {
    const db = await readDb()
    db.accounts = db.accounts.filter((item) => item.id !== id)
    await writeJsonFile(accountsPath(), db)
    return { ok: true as const }
  },
}
