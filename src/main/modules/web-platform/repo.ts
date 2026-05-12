import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type {
  BillingOrder,
  ComputePriceRule,
  SubscriptionPlan,
  UserSubscription,
  WalletAccount,
  WalletTransaction,
  WebPlatformDb,
  WebSession,
  WebUser,
} from './types'

const webPlatformDbPath = () => join(getAppPaths().dbDir, 'web-platform.json')

function now() {
  return Date.now()
}

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
    subscriptionPlans: defaultPlans(),
    computePriceRules: defaultComputeRules(),
  }
}

export const webPlatformRepo = {
  async readDb(): Promise<WebPlatformDb> {
    const db = await readJsonFile<WebPlatformDb>(webPlatformDbPath(), emptyDb())
    db.subscriptionPlans = Array.isArray(db.subscriptionPlans) && db.subscriptionPlans.length ? db.subscriptionPlans : defaultPlans()
    db.computePriceRules = Array.isArray(db.computePriceRules) && db.computePriceRules.length ? db.computePriceRules : defaultComputeRules()
    return db
  },

  async writeDb(input: WebPlatformDb) {
    await writeJsonFile(webPlatformDbPath(), input)
  },

  async ensureSeed() {
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
}
