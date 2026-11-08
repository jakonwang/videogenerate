import { join } from 'node:path'
import { decryptRuntimeString, encryptRuntimeString, isRuntimeEncryptionAvailable } from '../../lib/runtimeCrypto'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { getAppPaths } from '../../lib/paths'
import type { GmvMaxOAuthSecrets } from './types'

type StoredAuth = { connectionId: string; encryptedPayload: string; updatedAt: number }
type AuthDb = { entries: StoredAuth[] }
type AuthRuntime = {
  encryptionAvailable: () => boolean
  read: (connectionId: string) => Promise<GmvMaxOAuthSecrets>
  write: (connectionId: string, secrets: GmvMaxOAuthSecrets) => Promise<void>
  remove: (connectionId: string) => Promise<void>
}

let runtime: AuthRuntime | null = null

export function configureGmvMaxAuthRuntime(value: AuthRuntime | null) {
  runtime = value
}

function authPath() {
  return join(getAppPaths().dbDir, 'tiktok-gmv-max-auth.json')
}

async function readDb() {
  return await readJsonFile<AuthDb>(authPath(), { entries: [] })
}

export const gmvMaxAuthStore = {
  encryptionAvailable: () => runtime?.encryptionAvailable() ?? isRuntimeEncryptionAvailable(),

  async read(connectionId: string): Promise<GmvMaxOAuthSecrets> {
    if (runtime) return await runtime.read(connectionId)
    const db = await readDb()
    const entry = db.entries.find((item) => item.connectionId === connectionId)
    if (!entry) return {}
    const decrypted = decryptRuntimeString(entry.encryptedPayload)
    if (!decrypted) throw new Error('Secure GMV MAX credentials cannot be decrypted on this device.')
    return JSON.parse(decrypted) as GmvMaxOAuthSecrets
  },

  async write(connectionId: string, secrets: GmvMaxOAuthSecrets) {
    if (runtime) return await runtime.write(connectionId, secrets)
    if (!isRuntimeEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this device.')
    const encryptedPayload = encryptRuntimeString(JSON.stringify(secrets))
    if (!encryptedPayload) throw new Error('Secure credential storage is unavailable on this device.')
    const db = await readDb()
    const next: StoredAuth = { connectionId, encryptedPayload, updatedAt: Date.now() }
    const index = db.entries.findIndex((item) => item.connectionId === connectionId)
    if (index >= 0) db.entries[index] = next
    else db.entries.push(next)
    await writeJsonFile(authPath(), db)
  },

  async remove(connectionId: string) {
    if (runtime) return await runtime.remove(connectionId)
    const db = await readDb()
    db.entries = db.entries.filter((item) => item.connectionId !== connectionId)
    await writeJsonFile(authPath(), db)
  },
}
