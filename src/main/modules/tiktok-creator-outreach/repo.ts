import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { CreatorOutreachAccount, CreatorOutreachDb, OutreachAudit, OutreachTemplate, TiktokShopApiCredential, OutreachCampaign, OutreachBatchRecord, CreatorLibraryEntry, OutreachTask } from './types'
import type { StoreType } from './regions'

const dbPath = () => join(getAppPaths().dbDir, 'tiktok-creator-outreach.json')
const now = () => Date.now()
const emptyDb = (): CreatorOutreachDb => ({ version: 2, accounts: [], templates: [], audits: [], campaigns: [], batches: [], library: [], tasks: [] })

async function readDb() {
  const raw = await readJsonFile<Partial<CreatorOutreachDb>>(dbPath(), emptyDb())
  return {
    version: 2 as const,
    apiCredential: raw.apiCredential,
    accounts: Array.isArray(raw.accounts) ? raw.accounts.map((item) => ({ ...item, storeType: item.storeType || 'cross_border' as StoreType, authorizationStatus: item.authorizationStatus || 'not_connected' })) : [],
    templates: Array.isArray(raw.templates) ? raw.templates : [],
    audits: Array.isArray(raw.audits) ? raw.audits.slice(-2000) : [],
    campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [],
    batches: Array.isArray(raw.batches) ? raw.batches : [],
    library: Array.isArray(raw.library) ? raw.library : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
  }
}

export const tiktokCreatorOutreachRepo = {
  async getApiCredential() { return (await readDb()).apiCredential },
  async saveApiCredential(input: TiktokShopApiCredential) { const db = await readDb(); db.apiCredential = input; await writeJsonFile(dbPath(), db); return { appKey: input.appKey, redirectUri: input.redirectUri, apiBaseUrl: input.apiBaseUrl, apiVersion: input.apiVersion } },
  async listAccounts() { return (await readDb()).accounts },
  async upsertAccount(input: Partial<CreatorOutreachAccount> & { name: string; shopRegion: string; shopId: string }) {
    const db = await readDb(); const timestamp = now(); const id = String(input.id || randomUUID())
    const item = { id, name: input.name.trim(), shopRegion: input.shopRegion.trim().toUpperCase(), shopId: input.shopId.trim(), storeType: input.storeType || 'cross_border' as StoreType, affiliateHost: input.affiliateHost, authorizationStatus: input.authorizationStatus || 'not_connected', tokenUpdatedAt: input.tokenUpdatedAt, createdAt: Number(input.createdAt || timestamp), updatedAt: timestamp }
    const index = db.accounts.findIndex((entry) => entry.id === id)
    if (index >= 0) db.accounts[index] = item; else db.accounts.unshift(item)
    await writeJsonFile(dbPath(), db); return item
  },
  async removeAccount(id: string) { const db = await readDb(); db.accounts = db.accounts.filter((item) => item.id !== id); await writeJsonFile(dbPath(), db); return { ok: true as const } },
  async listTemplates(kind?: OutreachTemplate['kind']) { return (await readDb()).templates.filter((item) => !kind || item.kind === kind) },
  async upsertTemplate(input: Partial<OutreachTemplate> & { name: string; kind: OutreachTemplate['kind']; body: string }) {
    const db = await readDb(); const timestamp = now(); const id = String(input.id || randomUUID())
    const item = { id, name: input.name.trim(), kind: input.kind, body: input.body, createdAt: Number(input.createdAt || timestamp), updatedAt: timestamp }
    const index = db.templates.findIndex((entry) => entry.id === id)
    if (index >= 0) db.templates[index] = item; else db.templates.unshift(item)
    await writeJsonFile(dbPath(), db); return item
  },
  async appendAudit(input: Omit<OutreachAudit, 'id' | 'createdAt'>) { const db = await readDb(); db.audits.push({ ...input, id: randomUUID(), createdAt: now() }); db.audits = db.audits.slice(-2000); await writeJsonFile(dbPath(), db) },
  async listAudits(accountId?: string) { return (await readDb()).audits.filter((item) => !accountId || item.accountId === accountId).sort((a, b) => b.createdAt - a.createdAt) },
  async listCampaigns(accountId?: string) { return (await readDb()).campaigns?.filter((item) => !accountId || item.accountId === accountId) || [] },
  async saveCampaign(input: OutreachCampaign) { const db = await readDb(); db.campaigns = db.campaigns || []; const index = db.campaigns.findIndex((item) => item.id === input.id); if (index >= 0) db.campaigns[index] = input; else db.campaigns.unshift(input); await writeJsonFile(dbPath(), db); return input },
  async updateCampaignStatus(id: string, status: OutreachCampaign['status']) { const db = await readDb(); const item = db.campaigns?.find((entry) => entry.id === id); if (!item) throw new Error('OUTREACH_CAMPAIGN_NOT_FOUND'); item.status = status; item.updatedAt = now(); await writeJsonFile(dbPath(), db); return item },
  async saveBatch(input: OutreachBatchRecord) { const db = await readDb(); db.batches = db.batches || []; const index = db.batches.findIndex((item) => item.id === input.id); if (index >= 0) db.batches[index] = input; else db.batches.push(input); await writeJsonFile(dbPath(), db); return input },
  async listBatches(campaignId: string) { return (await readDb()).batches?.filter((item) => item.campaignId === campaignId) || [] },
  async listCreatorLibrary(accountId?: string) { return (await readDb()).library?.filter((item) => !accountId || item.accountId === accountId) || [] },
  async upsertCreatorLibrary(input: CreatorLibraryEntry) { const db = await readDb(); db.library = db.library || []; const index = db.library.findIndex((item) => item.id === input.id || (item.accountId === input.accountId && item.creatorId === input.creatorId)); if (index >= 0) db.library[index] = { ...db.library[index], ...input, updatedAt: now() }; else db.library.unshift(input); await writeJsonFile(dbPath(), db); return index >= 0 ? db.library[index] : input },
  async removeCreatorLibrary(ids: string[]) { const db = await readDb(); db.library = (db.library || []).filter((item) => !ids.includes(item.id) && !ids.includes(item.creatorId)); await writeJsonFile(dbPath(), db); return { ok: true as const } },
  async updateCreatorLibrary(id: string, patch: Partial<CreatorLibraryEntry>) { const db = await readDb(); const item = (db.library || []).find((entry) => entry.id === id); if (!item) throw new Error('OUTREACH_CREATOR_NOT_FOUND'); Object.assign(item, patch, { updatedAt: now() }); await writeJsonFile(dbPath(), db); return item },
  async listTasks(accountId?: string) { return (await readDb()).tasks?.filter((item) => !accountId || item.accountId === accountId) || [] },
  async getTask(id: string) { return (await readDb()).tasks?.find((item) => item.id === id) },
  async saveTask(input: OutreachTask) { const db = await readDb(); db.tasks = db.tasks || []; const index = db.tasks.findIndex((item) => item.id === input.id); if (index >= 0) db.tasks[index] = input; else db.tasks.unshift(input); await writeJsonFile(dbPath(), db); return input },
  async updateTask(id: string, patch: Partial<OutreachTask>) { const db = await readDb(); const item = (db.tasks || []).find((entry) => entry.id === id); if (!item) throw new Error('OUTREACH_TASK_NOT_FOUND'); Object.assign(item, patch, { updatedAt: now() }); await writeJsonFile(dbPath(), db); return item },
}
