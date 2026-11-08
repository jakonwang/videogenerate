import { app, safeStorage, shell } from 'electron'
import { createHmac, randomUUID } from 'node:crypto'
import type { CreatorRow, TiktokShopApiCredential } from './types'
import { tiktokCreatorOutreachRepo } from './repo'

const DEFAULT_BASE_URL = 'https://open-api.tiktokglobalshop.com'
const DEFAULT_VERSION = '202508'
const ENDPOINTS = {
  searchCreators: '/affiliate/{version}/seller/search_creator_on_marketplace',
  creatorFilters: '/affiliate/{version}/seller/get_creator_marketplace_advanced_filters',
  createTarget: '/affiliate/{version}/seller/create_target_collaboration',
  searchTarget: '/affiliate/{version}/seller/search_target_collaborations',
  targetDetail: '/affiliate/{version}/seller/query_target_collaboration_detail',
  conversations: '/affiliate/{version}/seller/get_conversation_list',
  createConversation: '/affiliate/{version}/seller/create_conversation_with_creator',
  messages: '/affiliate/{version}/seller/get_message_in_the_conversation',
  sendMessage: '/affiliate/{version}/seller/send_im_message',
  markRead: '/affiliate/{version}/seller/mark_conversation_read',
  collaborationLink: '/affiliate/{version}/seller/generate_target_collaboration_link',
  creatorPerformance: '/affiliate/{version}/seller/get_marketplace_creator_performance',
  weeklyOutreach: '/affiliate/{version}/seller/get_weekly_creator_outreach_records',
  outreachQuota: '/affiliate/{version}/seller/get_weekly_creator_outreach_quota',
  inboxCounts: '/affiliate/{version}/seller/get_inbox_category_counts',
  promotionDetails: '/affiliate/{version}/seller/query_creator_promotion_details_in_target_collaboration',
  shopProducts: '/product/202309/products/search',
} as const

type TokenRecord = { accessToken: string; refreshToken: string; expiresAt: number }
type ApiResult = { code?: number | string; message?: string; data?: any; request_id?: string; next_page_token?: string; next_cursor?: string; [key: string]: any }

function encrypt(value: string) {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OUTREACH_SECURE_STORAGE_UNAVAILABLE')
  return safeStorage.encryptString(value).toString('base64')
}
function decrypt(value: string) {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OUTREACH_SECURE_STORAGE_UNAVAILABLE')
  return safeStorage.decryptString(Buffer.from(value, 'base64'))
}
function tokenKey(accountId: string) { return `tiktok-creator-outreach-token:${accountId}` }
function endpoint(name: keyof typeof ENDPOINTS, version: string) { return ENDPOINTS[name].replace('{version}', version) }
function redact(value: unknown) { return String(value).replace(/(access_token|refresh_token|app_secret|sign|authorization)=?[^&\s]+/gi, '$1=[redacted]') }
function isValidAppKey(value: string) { return /^[A-Za-z0-9_-]{6,128}$/.test(value) }
function isValidRedirectUri(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

export function renderTemplate(body: string, variables: Record<string, string>) {
  return String(body || '').replace(/\{\{(creatorName|shopName|productName|commissionRate)\}\}/g, (_, key) => variables[key] ?? '')
}

export class TiktokShopAffiliateApiClient {
  private pendingOAuth = new Map<string, string>()
  async saveCredential(input: { appKey: string; appSecret: string; redirectUri: string; apiBaseUrl?: string; apiVersion?: string }) {
    const appKey = input.appKey.trim()
    const redirectUri = input.redirectUri.trim()
    if (!isValidAppKey(appKey)) throw new Error('OUTREACH_APP_KEY_INVALID')
    if (!isValidRedirectUri(redirectUri)) throw new Error('OUTREACH_REDIRECT_URI_INVALID')
    const existing = await tiktokCreatorOutreachRepo.getApiCredential()
    if (!input.appSecret.trim() && !existing?.appSecretEncrypted) throw new Error('OUTREACH_APP_SECRET_REQUIRED')
    return tiktokCreatorOutreachRepo.saveApiCredential({ appKey, appSecretEncrypted: input.appSecret.trim() ? encrypt(input.appSecret) : existing!.appSecretEncrypted, redirectUri, apiBaseUrl: input.apiBaseUrl?.trim() || DEFAULT_BASE_URL, apiVersion: input.apiVersion?.trim() || DEFAULT_VERSION })
  }

  async credentialStatus() {
    const credential = await tiktokCreatorOutreachRepo.getApiCredential()
    const configured = Boolean(credential?.appKey && credential.appSecretEncrypted && credential.redirectUri && isValidAppKey(credential.appKey) && isValidRedirectUri(credential.redirectUri))
    return { configured, hasAppSecret: Boolean(credential?.appSecretEncrypted), appKey: credential?.appKey || '', redirectUri: credential?.redirectUri || '', apiBaseUrl: credential?.apiBaseUrl || DEFAULT_BASE_URL, apiVersion: credential?.apiVersion || DEFAULT_VERSION }
  }

  async startOAuth(accountId: string) {
    const [credential, account] = await Promise.all([tiktokCreatorOutreachRepo.getApiCredential(), this.getAccount(accountId)])
    if (!credential?.appKey || !credential.redirectUri) throw new Error('OUTREACH_API_CREDENTIALS_NOT_CONFIGURED')
    const state = `${accountId}.${randomUUID()}`
    this.pendingOAuth.set(state, accountId)
    // The Partner Center OAuth entry point selects the shop after sign-in.
    // shop_region and shop_id are API request parameters, not OAuth parameters.
    const url = new URL('https://services.tiktokshop.com/open/authorize')
    url.searchParams.set('app_key', credential.appKey)
    url.searchParams.set('redirect_uri', credential.redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('locale', account.shopRegion === 'VN' ? 'vi-VN' : 'en-US')
    await shell.openExternal(url.toString())
    return { url: url.toString(), state, accountId }
  }

  async handleOAuthCallback(code: string, state: string) {
    const accountId = this.pendingOAuth.get(state) || ''; if (!accountId || !code) throw new Error('OUTREACH_OAUTH_CALLBACK_INVALID'); this.pendingOAuth.delete(state)
    const [credential, account] = await Promise.all([tiktokCreatorOutreachRepo.getApiCredential(), this.getAccount(accountId)])
    if (!credential) throw new Error('OUTREACH_API_CREDENTIALS_NOT_CONFIGURED')
    const response = await fetch('https://auth.tiktok-shops.com/api/v2/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app_key: credential.appKey, app_secret: decrypt(credential.appSecretEncrypted), grant_type: 'authorized_code', auth_code: code }) })
    const json = await response.json().catch(() => ({})) as any
    const oauthMessage = String(json.message || json.error_description || json.error || '').toLowerCase()
    if (oauthMessage.includes('unavailable') || oauthMessage.includes('not available') || oauthMessage.includes('market')) throw new Error('OUTREACH_OAUTH_MARKET_UNAVAILABLE')
    if (!response.ok || !json.access_token) throw new Error(`OUTREACH_OAUTH_FAILED:${json.message || response.status}`)
    const returnedShopId = String(json.shop_id || json.data?.shop_id || '').trim()
    const returnedRegion = String(json.shop_region || json.region || json.data?.shop_region || json.data?.region || '').trim().toUpperCase()
    if (returnedShopId && returnedShopId !== account.shopId) throw new Error('OUTREACH_OAUTH_SHOP_MISMATCH')
    if (returnedRegion && returnedRegion !== account.shopRegion) throw new Error('OUTREACH_OAUTH_REGION_MISMATCH')
    await this.storeToken(accountId, { accessToken: json.access_token, refreshToken: json.refresh_token || '', expiresAt: Date.now() + Number(json.expires_in || 86400) * 1000 })
    await tiktokCreatorOutreachRepo.upsertAccount({ ...account, authorizationStatus: 'connected', tokenUpdatedAt: Date.now() })
    return { accountId, shopId: account.shopId, shopRegion: account.shopRegion, connected: true }
  }

  async disconnectShop(accountId: string) {
    await this.storeToken(accountId, undefined); const account = await this.getAccount(accountId); await tiktokCreatorOutreachRepo.upsertAccount({ ...account, authorizationStatus: 'revoked' }); return { ok: true }
  }

  async authorizationStatus(accountId: string) { const account = await this.getAccount(accountId); const token = await this.readToken(accountId); return { accountId, shopId: account.shopId, shopRegion: account.shopRegion, authenticated: Boolean(token?.accessToken && (token.expiresAt > Date.now() || token.refreshToken)), status: account.authorizationStatus || 'not_connected' } }

  async searchCreators(accountId: string, filters: Record<string, unknown> = {}, cursor?: string) { return this.request(accountId, 'searchCreators', { ...filters, page_token: cursor || undefined }) as Promise<ApiResult> }
  async getCreatorFilters(accountId: string) { return this.request(accountId, 'creatorFilters', {}) as Promise<ApiResult> }
  async createTargetCollaboration(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'createTarget', payload, 'POST') as Promise<ApiResult> }
  async searchTargetCollaborations(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'searchTarget', payload, 'POST') as Promise<ApiResult> }
  async getTargetCollaborationDetail(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'targetDetail', payload, 'POST') as Promise<ApiResult> }
  async getConversationList(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'conversations', payload) as Promise<ApiResult> }
  async createConversation(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'createConversation', payload, 'POST') as Promise<ApiResult> }
  async getMessages(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'messages', payload) as Promise<ApiResult> }
  async sendMessage(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'sendMessage', payload, 'POST') as Promise<ApiResult> }
  async markConversationRead(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'markRead', payload, 'POST') as Promise<ApiResult> }
  async generateCollaborationLink(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'collaborationLink', payload, 'POST') as Promise<ApiResult> }
  async getCreatorPerformance(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'creatorPerformance', payload, 'POST') as Promise<ApiResult> }
  async getWeeklyOutreachRecords(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'weeklyOutreach', payload, 'POST') as Promise<ApiResult> }
  async getWeeklyOutreachQuota(accountId: string) { return this.request(accountId, 'outreachQuota', {}) as Promise<ApiResult> }
  async getInboxCounts(accountId: string) { return this.request(accountId, 'inboxCounts', {}) as Promise<ApiResult> }
  async getPromotionDetails(accountId: string, payload: Record<string, unknown>) { return this.request(accountId, 'promotionDetails', payload, 'POST') as Promise<ApiResult> }
  async listShopProducts(accountId: string, payload: Record<string, unknown> = {}) { return this.request(accountId, 'shopProducts', { page_size: 100, ...payload }, 'POST') as Promise<ApiResult> }

  private async getAccount(accountId: string) { const account = (await tiktokCreatorOutreachRepo.listAccounts()).find((item) => item.id === accountId); if (!account) throw new Error('OUTREACH_ACCOUNT_NOT_FOUND'); return account }
  private async readToken(accountId: string) { const value = await this.readSecret(tokenKey(accountId)); return value ? JSON.parse(value) as TokenRecord : undefined }
  private async storeToken(accountId: string, token?: TokenRecord) { if (!token) return this.writeSecret(tokenKey(accountId), ''); return this.writeSecret(tokenKey(accountId), JSON.stringify(token)) }
  private async readSecret(key: string) { const fs = await import('node:fs/promises'); const file = `${app.getPath('userData')}/${key.replace(/[^a-z0-9_-]/gi, '_')}.bin`; const value = await fs.readFile(file, 'utf8').catch(() => ''); return value ? decrypt(value) : '' }
  private async writeSecret(key: string, value: string) { const fs = await import('node:fs/promises'); const path = `${app.getPath('userData')}/${key.replace(/[^a-z0-9_-]/gi, '_')}.bin`; await fs.mkdir(app.getPath('userData'), { recursive: true }); await fs.writeFile(path, value ? encrypt(value) : '', 'utf8') }
  private async request(accountId: string, name: keyof typeof ENDPOINTS, body: Record<string, unknown>, method: 'GET' | 'POST' = 'POST') {
    const credential = await tiktokCreatorOutreachRepo.getApiCredential(); const account = await this.getAccount(accountId); const token = await this.ensureToken(accountId); if (!credential || !token?.accessToken) throw new Error('OUTREACH_SHOP_NOT_AUTHORIZED')
    const appSecret = decrypt(credential.appSecretEncrypted); const version = credential.apiVersion || DEFAULT_VERSION; const path = endpoint(name, version); const timestamp = Math.floor(Date.now() / 1000).toString(); const content = method === 'GET' ? '' : JSON.stringify(body); const sign = createHmac('sha256', appSecret).update(`${path}${timestamp}${token.accessToken}${content}`).digest('hex'); const url = new URL(`${credential.apiBaseUrl || DEFAULT_BASE_URL}${path}`); url.searchParams.set('app_key', credential.appKey); url.searchParams.set('timestamp', timestamp); url.searchParams.set('sign', sign); url.searchParams.set('access_token', token.accessToken); url.searchParams.set('shop_id', account.shopId); url.searchParams.set('shop_region', account.shopRegion)
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-tts-shop-region': account.shopRegion }, body: method === 'GET' ? undefined : content }); const json = await response.json().catch(() => ({})) as ApiResult; if (!response.ok || (json.code !== undefined && String(json.code) !== '0')) { const error = new Error(`TIKTOK_API_ERROR:${json.code || response.status}:${redact(json.message || response.statusText)}`); (error as any).code = json.code || response.status; throw error } return json
  }

  private async ensureToken(accountId: string) {
    const token = await this.readToken(accountId); if (!token) return undefined
    if (token.expiresAt > Date.now() + 60_000) return token
    if (!token.refreshToken) return token
    const credential = await tiktokCreatorOutreachRepo.getApiCredential(); if (!credential) return token
    const response = await fetch('https://auth.tiktok-shops.com/api/v2/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app_key: credential.appKey, app_secret: decrypt(credential.appSecretEncrypted), grant_type: 'refresh_token', refresh_token: token.refreshToken }) })
    const json = await response.json().catch(() => ({})) as any
    if (!response.ok || !json.access_token) { const account = await this.getAccount(accountId); await tiktokCreatorOutreachRepo.upsertAccount({ ...account, authorizationStatus: 'expired' }); throw new Error(`OUTREACH_TOKEN_REFRESH_FAILED:${json.message || response.status}`) }
    const next = { accessToken: json.access_token, refreshToken: json.refresh_token || token.refreshToken, expiresAt: Date.now() + Number(json.expires_in || 86400) * 1000 }; await this.storeToken(accountId, next); return next
  }
}

export const tiktokShopAffiliateApi = new TiktokShopAffiliateApiClient()
