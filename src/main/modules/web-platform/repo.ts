import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { defaultPluginRecord } from './plugins'
import { buildDefaultPlans, buildDefaultWebUser } from './repoRuntime'
import { materializeManagedAsset } from '../managed-assets/service'
import {
  canInitializeWebPlatformSqlite,
  getWebPlatformSqliteUnavailableReason,
  initializeWebPlatformSqlite,
  isWebPlatformSqliteEmpty,
  readWebPlatformDbFromSqlite,
  writeWebPlatformDbToSqlite,
} from './sqlite'
import type {
  AuthCodeChannel,
  BatchSubtitleJob,
  BillingOrder,
  ComputePriceRule,
  PluginRecord,
  SubscriptionPlan,
  UserSubscription,
  WalletAccount,
  WalletTransaction,
  WebAuthCodeRecord,
  WebPlatformDb,
  WebSession,
  WebUser,
} from './types'

const webPlatformDbPath = () => join(getAppPaths().dbDir, 'web-platform.json')

function now() {
  return Date.now()
}

async function materializeBatchSubtitleJobAssets(input: BatchSubtitleJob): Promise<BatchSubtitleJob> {
  return {
    ...input,
    sourceItems: await Promise.all(
      input.sourceItems.map(async (item) => ({
        ...item,
        sourceVideoPath: await materializeManagedAsset({
          sourcePath: item.sourceVideoPath,
          module: 'subtitle',
          ownerId: input.id,
          assetId: `${item.id}-video`,
        }),
        coverImagePath: await materializeManagedAsset({
          sourcePath: item.coverImagePath,
          module: 'subtitle',
          ownerId: input.id,
          assetId: `${item.id}-cover`,
        }),
      })),
    ),
  }
}

let sqliteFallbackLogged = false

function defaultPlans(): SubscriptionPlan[] {
  return [
    {
      id: 'starter-monthly',
      name: '基础会员',
      priceCny: 99,
      durationDays: 30,
      monthlyComputeCredits: 120,
      enabled: true,
    },
    {
      id: 'pro-monthly',
      name: '专业会员',
      priceCny: 299,
      durationDays: 30,
      monthlyComputeCredits: 420,
      enabled: true,
    },
  ]
}

function defaultComputeRules(): ComputePriceRule[] {
  return [
    { action: 'analyze_reference', credits: 8 },
    { action: 'generate_script_variants', credits: 15 },
    { action: 'generate_storyboard_images', credits: 25 },
    { action: 'generate_shot_videos', credits: 40 },
    { action: 'compose_final_video', credits: 12 },
  ]
}

function emptyDb(): WebPlatformDb {
  return {
    users: [],
    sessions: [],
    subscriptions: [],
    wallets: [],
    walletTransactions: [],
    orders: [],
    subscriptionPlans: buildDefaultPlans(),
    computePriceRules: defaultComputeRules(),
    loginCodes: [],
    plugins: [],
    batchSubtitleJobs: [],
  }
}

function normalizeDb(input?: Partial<WebPlatformDb> | null): WebPlatformDb {
  return {
    users: Array.isArray(input?.users) ? input.users : [],
    sessions: Array.isArray(input?.sessions) ? input.sessions : [],
    subscriptions: Array.isArray(input?.subscriptions) ? input.subscriptions : [],
    wallets: Array.isArray(input?.wallets) ? input.wallets : [],
    walletTransactions: Array.isArray(input?.walletTransactions) ? input.walletTransactions : [],
    orders: Array.isArray(input?.orders) ? input.orders : [],
    subscriptionPlans:
      Array.isArray(input?.subscriptionPlans) && input.subscriptionPlans.length ? input.subscriptionPlans : buildDefaultPlans(),
    computePriceRules:
      Array.isArray(input?.computePriceRules) && input.computePriceRules.length
        ? input.computePriceRules
        : defaultComputeRules(),
    loginCodes: Array.isArray(input?.loginCodes)
      ? input.loginCodes.filter((item) => Number(item.expiresAt || 0) > now())
      : [],
    plugins: Array.isArray(input?.plugins) ? input.plugins : [],
    batchSubtitleJobs: Array.isArray(input?.batchSubtitleJobs) ? input.batchSubtitleJobs : [],
  }
}

function canUseSqlite() {
  const supported = canInitializeWebPlatformSqlite()
  if (!supported && !sqliteFallbackLogged) {
    sqliteFallbackLogged = true
    console.warn(
      `[web-platform] SQLite unavailable, fallback to JSON storage: ${getWebPlatformSqliteUnavailableReason() || 'unknown reason'}`,
    )
  }
  return supported
}

export const webPlatformRepo = {
  async readDb(): Promise<WebPlatformDb> {
    if (canUseSqlite()) {
      return normalizeDb(readWebPlatformDbFromSqlite())
    }
    const db = await readJsonFile<WebPlatformDb>(webPlatformDbPath(), emptyDb())
    return normalizeDb(db)
  },

  async writeDb(input: WebPlatformDb) {
    const normalized = normalizeDb(input)
    if (canUseSqlite()) {
      writeWebPlatformDbToSqlite(normalized)
      return
    }
    await writeJsonFile(webPlatformDbPath(), normalized)
  },

  async ensureSeed() {
    if (canUseSqlite()) {
      initializeWebPlatformSqlite()
      if (isWebPlatformSqliteEmpty() && existsSync(webPlatformDbPath())) {
        const legacyDb = await readJsonFile<WebPlatformDb>(webPlatformDbPath(), emptyDb())
        writeWebPlatformDbToSqlite(normalizeDb(legacyDb))
      }
    }
    const db = await this.readDb()
    await this.writeDb(db)
  },

  async listUsers() {
    const db = await this.readDb()
    return db.users
  },

  async getUserById(id: string) {
    const db = await this.readDb()
    return db.users.find((item) => item.id === id) ?? null
  },

  async getUserByPhone(phone: string) {
    const db = await this.readDb()
    return db.users.find((item) => item.phone === phone) ?? null
  },

  async upsertUser(input: WebUser) {
    const db = await this.readDb()
    const next = { ...input, updatedAt: now() }
    const idx = db.users.findIndex((item) => item.id === next.id)
    if (idx >= 0) db.users[idx] = next
    else db.users.unshift(next)
    await this.writeDb(db)
    return next
  },

  async createUser(input: { phone: string; displayName?: string }) {
    const createdAt = now()
    const item: WebUser = {
      id: randomUUID(),
      phone: String(input.phone || '').trim(),
      displayName: String(input.displayName || '').trim() || `用户${String(input.phone || '').slice(-4)}`,
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    }
    return await this.upsertUser(item)
  },

  async getSession(token: string) {
    const db = await this.readDb()
    return db.sessions.find((item) => item.token === token) ?? null
  },

  async createSession(input: { userId: string; expiresAt: number }) {
    const createdAt = now()
    const item: WebSession = {
      token: randomUUID().replace(/-/g, ''),
      userId: input.userId,
      createdAt,
      updatedAt: createdAt,
      expiresAt: input.expiresAt,
    }
    const db = await this.readDb()
    db.sessions = db.sessions.filter((entry) => entry.userId !== input.userId)
    db.sessions.unshift(item)
    await this.writeDb(db)
    return item
  },

  async removeSession(token: string) {
    const db = await this.readDb()
    db.sessions = db.sessions.filter((item) => item.token !== token)
    await this.writeDb(db)
    return { ok: true as const }
  },

  async getSubscription(userId: string) {
    const db = await this.readDb()
    return db.subscriptions.find((item) => item.userId === userId) ?? null
  },

  async upsertSubscription(input: UserSubscription) {
    const db = await this.readDb()
    const next = { ...input, updatedAt: now() }
    const idx = db.subscriptions.findIndex((item) => item.userId === next.userId)
    if (idx >= 0) db.subscriptions[idx] = next
    else db.subscriptions.unshift(next)
    await this.writeDb(db)
    return next
  },

  async getWallet(userId: string) {
    const db = await this.readDb()
    return db.wallets.find((item) => item.userId === userId) ?? null
  },

  async upsertWallet(input: WalletAccount) {
    const db = await this.readDb()
    const next = { ...input, updatedAt: now() }
    const idx = db.wallets.findIndex((item) => item.userId === next.userId)
    if (idx >= 0) db.wallets[idx] = next
    else db.wallets.unshift(next)
    await this.writeDb(db)
    return next
  },

  async appendWalletTransaction(input: WalletTransaction) {
    const db = await this.readDb()
    db.walletTransactions.unshift(input)
    await this.writeDb(db)
    return input
  },

  async listWalletTransactions(userId: string) {
    const db = await this.readDb()
    return db.walletTransactions.filter((item) => item.userId === userId)
  },

  async createOrder(input: BillingOrder) {
    const db = await this.readDb()
    db.orders.unshift(input)
    await this.writeDb(db)
    return input
  },

  async getOrder(id: string) {
    const db = await this.readDb()
    return db.orders.find((item) => item.id === id) ?? null
  },

  async upsertOrder(input: BillingOrder) {
    const db = await this.readDb()
    const next = { ...input, updatedAt: now() }
    const idx = db.orders.findIndex((item) => item.id === next.id)
    if (idx >= 0) db.orders[idx] = next
    else db.orders.unshift(next)
    await this.writeDb(db)
    return next
  },

  async listOrders(userId: string) {
    const db = await this.readDb()
    return db.orders.filter((item) => item.userId === userId)
  },

  async listSubscriptionPlans() {
    const db = await this.readDb()
    return db.subscriptionPlans.filter((item) => item.enabled)
  },

  async getSubscriptionPlan(id: string) {
    const db = await this.readDb()
    return db.subscriptionPlans.find((item) => item.id === id) ?? null
  },

  async listComputeRules() {
    const db = await this.readDb()
    return db.computePriceRules
  },

  async getComputeRule(action: ComputePriceRule['action']) {
    const db = await this.readDb()
    return db.computePriceRules.find((item) => item.action === action) ?? null
  },

  async saveLoginCode(input: { phone: string; code: string; channel: AuthCodeChannel; expiresAt: number }) {
    const db = await this.readDb()
    const item: WebAuthCodeRecord = {
      phone: input.phone,
      code: input.code,
      channel: input.channel,
      expiresAt: input.expiresAt,
      updatedAt: now(),
    }
    db.loginCodes = db.loginCodes.filter((entry) => entry.phone !== input.phone)
    db.loginCodes.unshift(item)
    await this.writeDb(db)
    return item
  },

  async getLoginCode(phone: string) {
    const db = await this.readDb()
    return db.loginCodes.find((item) => item.phone === phone) ?? null
  },

  async removeLoginCode(phone: string) {
    const db = await this.readDb()
    db.loginCodes = db.loginCodes.filter((item) => item.phone !== phone)
    await this.writeDb(db)
  },

  async listPluginRecords(userId: string) {
    const db = await this.readDb()
    return db.plugins.filter((item) => item.userId === userId)
  },

  async getPluginRecord(userId: string, pluginId: string) {
    const db = await this.readDb()
    return db.plugins.find((item) => item.userId === userId && item.pluginId === pluginId) ?? null
  },

  async upsertPluginRecord(input: PluginRecord) {
    const db = await this.readDb()
    const next: PluginRecord = {
      ...input,
      updatedAt: now(),
    }
    const idx = db.plugins.findIndex((item) => item.userId === next.userId && item.pluginId === next.pluginId)
    if (idx >= 0) db.plugins[idx] = next
    else db.plugins.unshift(next)
    await this.writeDb(db)
    return next
  },

  async ensurePluginRecord(userId: string, pluginId: string) {
    const current = await this.getPluginRecord(userId, pluginId)
    if (current) return current
    return await this.upsertPluginRecord(defaultPluginRecord(userId, pluginId))
  },

  async listBatchSubtitleJobs(userId: string) {
    const db = await this.readDb()
    const jobs = Array.isArray((db as WebPlatformDb & { batchSubtitleJobs?: BatchSubtitleJob[] }).batchSubtitleJobs)
      ? ((db as WebPlatformDb & { batchSubtitleJobs?: BatchSubtitleJob[] }).batchSubtitleJobs as BatchSubtitleJob[])
      : []
    return jobs
      .filter((item) => item.userId === userId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async getBatchSubtitleJob(userId: string, jobId: string) {
    const items = await this.listBatchSubtitleJobs(userId)
    return items.find((item) => item.id === jobId) ?? null
  },

  async upsertBatchSubtitleJob(input: BatchSubtitleJob) {
    const db = (await this.readDb()) as WebPlatformDb & { batchSubtitleJobs?: BatchSubtitleJob[] }
    const list = Array.isArray(db.batchSubtitleJobs) ? db.batchSubtitleJobs : []
    const idx = list.findIndex((item) => item.userId === input.userId && item.id === input.id)
    const next: BatchSubtitleJob = {
      ...(await materializeBatchSubtitleJobAssets(input)),
      updatedAt: now(),
    }
    if (idx >= 0) list[idx] = next
    else list.unshift(next)
    db.batchSubtitleJobs = list
    await this.writeDb(db)
    return next
  },

  async migrateBatchSubtitleExternalAssets(): Promise<{ migrated: number }> {
    const db = (await this.readDb()) as WebPlatformDb & { batchSubtitleJobs?: BatchSubtitleJob[] }
    const list = Array.isArray(db.batchSubtitleJobs) ? db.batchSubtitleJobs : []
    let migrated = 0
    for (let index = 0; index < list.length; index += 1) {
      const current = list[index]
      const next = await materializeBatchSubtitleJobAssets(current)
      if (JSON.stringify(next) === JSON.stringify(current)) continue
      list[index] = next
      migrated += 1
    }
    if (migrated) {
      db.batchSubtitleJobs = list
      await this.writeDb(db)
    }
    return { migrated }
  },
}

webPlatformRepo.createUser = async function createUserClean(input: { phone: string; displayName?: string }) {
  const createdAt = now()
  const item: WebUser = buildDefaultWebUser({
    phone: input.phone,
    displayName: input.displayName,
    createdAt,
  })
  return await this.upsertUser(item)
}
