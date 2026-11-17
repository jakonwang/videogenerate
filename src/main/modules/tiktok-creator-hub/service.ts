import { safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  CreatorHubContactChannel,
  CreatorHubContactInput,
  CreatorHubFetchContactsResult,
  CreatorHubMessageTemplate,
  CreatorHubCreatorDetail,
  CreatorHubCreatorPerf,
  CreatorHubCreatorProfile,
  CreatorHubDiscoverQuery,
  CreatorHubDiscoverResult,
  CreatorHubImportCookiesInput,
  CreatorHubPoolCreator,
  CreatorHubProductCost,
  CreatorHubSettings,
  CreatorHubShop,
  CreatorHubSyncJob,
  CreatorHubSyncProgress,
  CreatorHubSyncStage,
  CreatorHubVideo,
} from '../../../shared/creatorHub'
import { CREATOR_HUB_CONTACT_STATUSES, CREATOR_HUB_MARKET_CATEGORIES, CREATOR_HUB_SYNC_STAGES } from '../../../shared/creatorHub'
import { buildCrm, buildOverview, linkVideosToSamples } from '../../../shared/creatorHubAnalytics'
import { buildPool } from '../../../shared/creatorHubDiscovery'
import { DISCOVER_MAX_PAGES, discoverBody, discoverLabel, parseDiscoverPage, parseProfile, profileBody, type DiscoverCursor } from './discoverParser'
import { applyContactInput, DEFAULT_TEMPLATES, mergeBioContact } from '../../../shared/creatorHubContacts'
import { analyticsWindow, creatorListBody, orderListBody, parseCreatorPage, parseOrderPage, parseVideoPage, videoListBody } from './analyticsParser'
import { clearShopSession, closeBackend, openBackend, pageApi, replaceCookies, withAffiliatePage, type ShopTarget } from './browser'
import { parseCookieEditorJson } from './cookies'
import { costKey, creatorStats, summarize } from '../../../shared/creatorHubFulfillment'
import { creatorHubRepo, type StoredShop } from './repo'
import { parseSamplePage } from './sampleParser'

const PAGE_SIZE = 50
const MAX_PAGES = 200
const MAX_ORDER_PAGES = 400
const PAGE_DELAY_MS = 1000

const progress = new Map<string, CreatorHubSyncProgress>()
const discovering = new Set<string>()
let interruptedChecked = false

function publicShop(shop: StoredShop): CreatorHubShop {
  const { cookieEncrypted: _secret, ...rest } = shop
  return rest
}

function encrypt(value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('CREATOR_HUB_SECURE_STORAGE_UNAVAILABLE')
  return safeStorage.encryptString(value).toString('base64')
}

function target(shop: CreatorHubShop): ShopTarget {
  return { id: shop.id, region: shop.region, shopId: shop.shopId || undefined }
}

function requireShop(id: string) {
  const shop = creatorHubRepo.getShop(id)
  if (!shop) throw new Error('CREATOR_HUB_SHOP_NOT_FOUND')
  return shop
}

function ensureStartup() {
  if (interruptedChecked) return
  interruptedChecked = true
  creatorHubRepo.failInterruptedJobs()
}

async function readAccount(contents: Electron.WebContents) {
  const json = await pageApi(contents, { method: 'GET', path: '/api/v1/affiliate/account/info_v2' })
  const shop = json?.data?.shop
  if (Number(json?.code) !== 0 || !shop?.shop_id) {
    const detail = `account code=${json?.code ?? 'none'} ${String(json?.message || json?.msg || '').slice(0, 80)}`.trim()
    console.warn('[creator-hub] account check failed', detail)
    throw new Error(`CREATOR_HUB_LOGIN_EXPIRED:${detail}`)
  }
  return {
    shopId: String(shop.shop_id),
    name: String(shop.shop_name || ''),
    region: String(shop.region || '').toUpperCase(),
    shopCode: shop.shop_code ? String(shop.shop_code) : undefined,
    timezone: shop.timezone?.name ? String(shop.timezone.name) : undefined,
    sellerName: json?.data?.global_seller?.global_seller_name ? String(json.data.global_seller.global_seller_name) : undefined,
  }
}

async function markLogin(shop: StoredShop, state: CreatorHubShop['loginState'], extra: Partial<StoredShop> = {}) {
  return creatorHubRepo.saveShop({ ...shop, ...extra, loginState: state, lastVerifiedAt: Date.now(), updatedAt: Date.now() })
}

export const creatorHubService = {
  listShops() {
    ensureStartup()
    return creatorHubRepo.listShops().map(publicShop)
  },

  /**
   * Imports a Cookie-Editor JSON export. A new shop is created unless `shopId` points to an
   * existing one; the cookies are verified against the affiliate account API before saving, and a
   * cookie that belongs to a shop already in the list refreshes that shop instead of duplicating it.
   */
  async importCookies(input: CreatorHubImportCookiesInput) {
    ensureStartup()
    const parsed = parseCookieEditorJson(input.cookieJson)
    if (!parsed.hasSession) throw new Error('CREATOR_HUB_COOKIE_NO_SESSION')
    const existing = input.shopId ? requireShop(input.shopId) : undefined
    const stagingId = existing?.id || randomUUID()
    await replaceCookies(stagingId, parsed.cookies)
    let account: Awaited<ReturnType<typeof readAccount>>
    try {
      account = await withAffiliatePage({ id: stagingId, region: existing?.region || 'VN' }, 'affiliate/platform/homepage', readAccount)
    } catch (error) {
      if (!existing) await clearShopSession(stagingId)
      else await markLogin(existing, 'expired')
      throw error
    }
    if (existing?.shopId && existing.shopId !== account.shopId) {
      throw new Error(`CREATOR_HUB_COOKIE_SHOP_MISMATCH:${account.name || account.shopId}`)
    }
    const duplicate = !existing ? creatorHubRepo.findShopByShopId(account.shopId) : undefined
    if (duplicate) {
      // Same shop imported again: move the fresh cookies onto the existing record.
      await replaceCookies(duplicate.id, parsed.cookies)
      await clearShopSession(stagingId)
    }
    const base = existing || duplicate
    const now = Date.now()
    const shop: StoredShop = {
      id: base?.id || stagingId,
      name: input.name?.trim() || account.name || base?.name || account.shopId,
      region: account.region || base?.region || 'VN',
      shopId: account.shopId,
      shopCode: account.shopCode,
      sellerName: account.sellerName,
      timezone: account.timezone,
      loginState: 'valid',
      cookieImportedAt: now,
      cookieExpiresAt: parsed.expiresAt,
      lastVerifiedAt: now,
      lastSyncAt: base?.lastSyncAt,
      lastSyncError: undefined,
      createdAt: base?.createdAt || now,
      updatedAt: now,
      cookieEncrypted: encrypt(input.cookieJson),
    }
    creatorHubRepo.saveShop(shop)
    return { shop: publicShop(shop), merged: Boolean(duplicate), cookies: parsed.cookies.length, skipped: parsed.skipped }
  },

  async verifyShop(id: string) {
    const shop = requireShop(id)
    try {
      const account = await withAffiliatePage(target(shop), 'affiliate/platform/homepage', readAccount)
      if (shop.shopId && account.shopId !== shop.shopId) throw new Error(`CREATOR_HUB_COOKIE_SHOP_MISMATCH:${account.name || account.shopId}`)
      return publicShop(await markLogin(shop, 'valid', { name: shop.name || account.name }))
    } catch (error) {
      if (String((error as Error)?.message).includes('LOGIN_EXPIRED')) return publicShop(await markLogin(shop, 'expired'))
      throw error
    }
  },

  renameShop(id: string, name: string) {
    const shop = requireShop(id)
    const trimmed = String(name || '').trim().slice(0, 80)
    if (!trimmed) throw new Error('CREATOR_HUB_SHOP_NAME_REQUIRED')
    return publicShop(creatorHubRepo.saveShop({ ...shop, name: trimmed, updatedAt: Date.now() }))
  },

  async removeShop(id: string) {
    requireShop(id)
    if (progress.get(id)?.status === 'running') throw new Error('CREATOR_HUB_SYNC_RUNNING')
    closeBackend(id)
    await clearShopSession(id)
    creatorHubRepo.removeShop(id)
    return { ok: true as const }
  },

  async openBackend(id: string, path?: string) {
    const shop = requireShop(id)
    const result = await openBackend(target(shop), path)
    if (!result.loggedIn) await markLogin(shop, 'expired')
    return result
  },

  /**
   * Read-only sync of one shop, stage by stage: sample applications, creator performance,
   * videos (both over the analytics window) and affiliate orders. A login failure stops the
   * sync; any other stage failure is recorded and the remaining stages still run.
   */
  async syncShop(id: string, stages: CreatorHubSyncStage[] = CREATOR_HUB_SYNC_STAGES) {
    ensureStartup()
    const shop = requireShop(id)
    if (progress.get(id)?.status === 'running') throw new Error('CREATOR_HUB_SYNC_RUNNING')
    const settings = creatorHubRepo.getSettings()
    const job: CreatorHubSyncJob = { id: randomUUID(), shopId: id, status: 'running', startedAt: Date.now(), pages: 0, rows: 0, stageRows: {}, stageErrors: {} }
    const update = (patch: Partial<CreatorHubSyncJob>) => {
      Object.assign(job, patch)
      progress.set(id, { shopId: id, stage: job.stage, pages: job.pages, rows: job.rows, total: job.total, status: job.status, stageErrors: job.stageErrors, error: job.error })
    }
    update({})
    creatorHubRepo.saveSyncJob(job)
    const query: Record<string, string> = { shop_region: shop.region }
    if (shop.shopId) query.oec_seller_id = shop.shopId
    const pause = () => new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS))
    const begin = (stage: CreatorHubSyncStage) => { update({ stage, pages: 0, rows: 0, total: undefined }); creatorHubRepo.saveSyncJob(job) }
    const step = (rows: number, total?: number) => { update({ pages: job.pages + 1, rows: job.rows + rows, total: total ?? job.total }); creatorHubRepo.saveSyncJob(job) }
    const COMPASS = '/api/v1/oec/affiliate/compass/transaction/detail_list/get'

    const runners: Record<CreatorHubSyncStage, (contents: Electron.WebContents) => Promise<number>> = {
      samples: async (contents) => {
        let saved = 0
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const json = await pageApi(contents, {
            method: 'POST',
            path: '/api/v1/affiliate/sample/group/list',
            query,
            // search_key 3 returns one row per application (view_type 2) instead of creator groups.
            body: { tab: 0, cur_page: page, page_size: PAGE_SIZE, search_params: [{ search_key: 3, search_type: 2, value: '' }], order_params: [] },
          })
          const parsed = parseSamplePage(json, id)
          if (parsed.rows.length) creatorHubRepo.upsertSamples(parsed.rows)
          saved += parsed.rows.length
          step(parsed.rows.length, parsed.total)
          if (!parsed.hasMore || !parsed.rows.length) break
          await pause()
        }
        return saved
      },
      creators: async (contents) => {
        const window = analyticsWindow(settings.analyticsWindowDays, shop.region)
        const rows: CreatorHubCreatorPerf[] = []
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const json = await pageApi(contents, { method: 'POST', path: COMPASS, query, body: creatorListBody(window, shop.region, page, PAGE_SIZE) })
          const parsed = parseCreatorPage(json, id, window)
          rows.push(...parsed.rows)
          step(parsed.rows.length, parsed.total)
          if (!parsed.rows.length || (parsed.total != null && rows.length >= parsed.total) || parsed.rows.length < PAGE_SIZE) break
          await pause()
        }
        creatorHubRepo.replaceCreatorPerf(id, rows)
        return rows.length
      },
      videos: async (contents) => {
        const window = analyticsWindow(settings.analyticsWindowDays, shop.region)
        const rows: CreatorHubVideo[] = []
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const json = await pageApi(contents, { method: 'POST', path: COMPASS, query, body: videoListBody(window, shop.region, page, PAGE_SIZE) })
          const parsed = parseVideoPage(json, id, window)
          rows.push(...parsed.rows)
          step(parsed.rows.length, parsed.total)
          if (!parsed.rows.length || (parsed.total != null && rows.length >= parsed.total) || parsed.rows.length < PAGE_SIZE) break
          await pause()
        }
        creatorHubRepo.replaceVideos(id, rows)
        return rows.length
      },
      orders: async (contents) => {
        const end = Date.now()
        const window = { start: end - settings.orderWindowDays * 86_400_000, end }
        let cursor: string | undefined
        let saved = 0
        const seen = new Set<string>()
        for (let page = 1; page <= MAX_ORDER_PAGES; page += 1) {
          const json = await pageApi(contents, { method: 'POST', path: '/api/oec/pay/statement/order/seller/orders/list', query, body: orderListBody(window, cursor) })
          const parsed = parseOrderPage(json, id)
          const fresh = parsed.rows.filter((row) => !seen.has(row.id))
          fresh.forEach((row) => seen.add(row.id))
          if (fresh.length) creatorHubRepo.upsertOrders(fresh)
          saved += fresh.length
          step(fresh.length, parsed.total)
          // Stop on the last page, or when the cursor stops moving (guards against an endless loop).
          if (!parsed.hasMore || !parsed.cursor || parsed.cursor === cursor || !fresh.length) break
          cursor = parsed.cursor
          await pause()
        }
        return saved
      },
    }

    try {
      await withAffiliatePage(target(shop), 'affiliate/sample/sample-request', async (contents) => {
        for (const stage of stages) {
          begin(stage)
          try {
            const saved = await runners[stage](contents)
            job.stageRows = { ...job.stageRows, [stage]: saved }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (message.includes('LOGIN_EXPIRED')) throw error
            console.warn('[creator-hub] sync stage failed', { stage, message })
            job.stageErrors = { ...job.stageErrors, [stage]: message }
          }
          creatorHubRepo.saveSyncJob(job)
          await pause()
        }
      })
      const failedStages = Object.keys(job.stageErrors || {}) as CreatorHubSyncStage[]
      const allFailed = failedStages.length === stages.length
      update({ status: allFailed ? 'failed' : 'completed', finishedAt: Date.now(), error: allFailed ? job.stageErrors?.[failedStages[0]] : undefined })
      creatorHubRepo.saveSyncJob(job)
      creatorHubRepo.saveShop({
        ...requireShop(id),
        loginState: 'valid',
        lastSyncAt: Date.now(),
        lastSyncError: failedStages.length ? failedStages.map((stage) => stage + ': ' + job.stageErrors?.[stage]).join('; ').slice(0, 400) : undefined,
        lastVerifiedAt: Date.now(),
        updatedAt: Date.now(),
      })
      if (allFailed) throw new Error(job.error || 'CREATOR_HUB_SYNC_FAILED')
      return job
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (job.status !== 'failed') {
        update({ status: 'failed', finishedAt: Date.now(), error: message })
        creatorHubRepo.saveSyncJob(job)
      }
      const latest = requireShop(id)
      creatorHubRepo.saveShop({ ...latest, loginState: message.includes('LOGIN_EXPIRED') ? 'expired' : latest.loginState, lastSyncError: message, updatedAt: Date.now() })
      throw error
    }
  },

  /** Sample list only. */
  syncSamples(id: string) {
    return creatorHubService.syncShop(id, ['samples'])
  },

  getSyncProgress(id: string) {
    return progress.get(id) || null
  },

  listSyncJobs(id: string) {
    return creatorHubRepo.listSyncJobs(id)
  },

  listSamples(shopId?: string) {
    return creatorHubRepo.listSamples(shopId)
  },

  updateSample(payload: { id: string; costOverride?: number | null; note?: string | null }) {
    if (payload.costOverride != null && (!Number.isFinite(Number(payload.costOverride)) || Number(payload.costOverride) < 0)) throw new Error('CREATOR_HUB_COST_INVALID')
    return creatorHubRepo.updateSampleLocal(payload.id, payload)
  },

  listCosts(shopId?: string) {
    return creatorHubRepo.listCosts(shopId)
  },

  saveCost(payload: { shopId: string; productId: string; skuId?: string; productTitle?: string; unitCost: number; shippingCost?: number }) {
    requireShop(payload.shopId)
    const productId = String(payload.productId || '').trim()
    if (!productId) throw new Error('CREATOR_HUB_PRODUCT_REQUIRED')
    const unitCost = Number(payload.unitCost)
    const shippingCost = Number(payload.shippingCost || 0)
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(shippingCost) || shippingCost < 0) throw new Error('CREATOR_HUB_COST_INVALID')
    const skuId = String(payload.skuId || '').trim() || undefined
    const cost: CreatorHubProductCost = {
      id: costKey(payload.shopId, productId, skuId),
      shopId: payload.shopId,
      productId,
      skuId,
      productTitle: payload.productTitle?.trim() || undefined,
      unitCost,
      shippingCost,
      updatedAt: Date.now(),
    }
    return creatorHubRepo.saveCost(cost)
  },

  removeCost(id: string) {
    creatorHubRepo.removeCost(id)
    return { ok: true as const }
  },

  getSettings() {
    return creatorHubRepo.getSettings()
  },

  saveSettings(input: Partial<CreatorHubSettings>) {
    const current = creatorHubRepo.getSettings()
    const clamp = (value: unknown, fallback: number, max: number) => {
      const parsed = Math.round(Number(value))
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : fallback
    }
    return creatorHubRepo.saveSettings({
      fulfillmentWindowDays: Math.max(1, clamp(input.fulfillmentWindowDays, current.fulfillmentWindowDays, 365)),
      logisticsBufferDays: clamp(input.logisticsBufferDays, current.logisticsBufferDays, 60),
      analyticsWindowDays: Math.max(1, clamp(input.analyticsWindowDays, current.analyticsWindowDays, 90)),
      orderWindowDays: Math.max(1, clamp(input.orderWindowDays, current.orderWindowDays, 90)),
    })
  },

  /** Videos in the analytics window, each flagged with the sample it came from (if any). */
  listVideos(shopId?: string) {
    const videos = creatorHubRepo.listVideos(shopId)
    const links = linkVideosToSamples(videos, creatorHubRepo.listSamples(shopId))
    return videos.map((video) => ({ ...video, sampleId: links.get(video.id) }))
  },

  listOrders(shopId?: string) {
    const settings = creatorHubRepo.getSettings()
    return creatorHubRepo.listOrders(shopId, Date.now() - settings.orderWindowDays * 86_400_000)
  },

  listCrm(shopId?: string) {
    return buildCrm({
      perf: creatorHubRepo.listCreatorPerf(shopId),
      samples: creatorHubRepo.listSamples(shopId),
      costs: creatorHubRepo.listCosts(shopId),
      profiles: creatorHubRepo.listProfiles(shopId),
      settings: creatorHubRepo.getSettings(),
    })
  },

  saveProfile(payload: { shopId: string; creatorId: string; tags?: string[]; note?: string; blocked?: boolean }) {
    requireShop(payload.shopId)
    const creatorId = String(payload.creatorId || '').trim()
    if (!creatorId) throw new Error('CREATOR_HUB_CREATOR_REQUIRED')
    const id = payload.shopId + ':' + creatorId
    const current = creatorHubRepo.listProfiles(payload.shopId).find((item) => item.id === id)
    const tags = [...new Set((payload.tags ?? current?.tags ?? []).map((tag) => String(tag).trim().slice(0, 24)).filter(Boolean))].slice(0, 12)
    const profile: CreatorHubCreatorProfile = {
      id,
      shopId: payload.shopId,
      creatorId,
      tags,
      note: payload.note !== undefined ? (String(payload.note).trim().slice(0, 500) || undefined) : current?.note,
      blocked: payload.blocked ?? current?.blocked ?? false,
      updatedAt: Date.now(),
    }
    return creatorHubRepo.saveProfile(profile)
  },

  getOverview(shopId?: string) {
    const settings = creatorHubRepo.getSettings()
    const shopIds = shopId ? [shopId] : creatorHubRepo.listShops().map((shop) => shop.id)
    return buildOverview({
      shopIds,
      perf: creatorHubRepo.listCreatorPerf(shopId),
      samples: creatorHubRepo.listSamples(shopId),
      costs: creatorHubRepo.listCosts(shopId),
      orders: creatorHubRepo.listOrders(shopId, Date.now() - settings.orderWindowDays * 86_400_000),
      settings,
    })
  },

  /** Per-creator fulfilment table plus totals for one shop (or all shops). */
  getFulfillment(shopId?: string) {
    const settings = creatorHubRepo.getSettings()
    const stats = creatorStats(creatorHubRepo.listSamples(shopId), creatorHubRepo.listCosts(shopId), settings)
    return { settings, creators: stats, summary: summarize(stats) }
  },

  // ===== Creator discovery (read-only marketplace search) =====

  /**
   * Runs one marketplace search inside the shop's logged-in affiliate page and stores the
   * creators it returns in the shop's pool. Read-only: nothing is sent to creators.
   */
  async discoverCreators(query: CreatorHubDiscoverQuery): Promise<CreatorHubDiscoverResult> {
    ensureStartup()
    const shop = requireShop(query.shopId)
    if (discovering.has(shop.id)) throw new Error('CREATOR_HUB_DISCOVER_RUNNING')
    const pages = Math.min(DISCOVER_MAX_PAGES, Math.max(1, Math.round(Number(query.pages) || 3)))
    const label = discoverLabel(query, (id) => CREATOR_HUB_MARKET_CATEGORIES.find((item) => item.id === id)?.name || id)
    discovering.add(shop.id)
    try {
      const params: Record<string, string> = { shop_region: shop.region }
      if (shop.shopId) params.oec_seller_id = shop.shopId
      const result = await withAffiliatePage(target(shop), 'affiliate/creator', async (contents) => {
        const seen = new Map<string, CreatorHubPoolCreator>()
        let cursor: DiscoverCursor | undefined = { page: 0 }
        let fetchedPages = 0
        let hasMore = false
        for (let index = 0; index < pages && cursor; index += 1) {
          if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1200 + Math.round(Math.random() * 800)))
          const json = await pageApi(contents, { method: 'POST', path: '/api/v1/oec/affiliate/creator/marketplace/find', query: params, body: discoverBody(query, cursor) })
          const parsed = parseDiscoverPage(json, shop.id)
          fetchedPages += 1
          parsed.rows.forEach((row) => seen.set(row.id, row))
          hasMore = parsed.hasMore
          cursor = parsed.rows.length ? parsed.cursor : undefined
        }
        const rows = [...seen.values()]
        const saved = rows.length ? creatorHubRepo.upsertPool(rows, label) : { added: 0, updated: 0 }
        return { fetched: rows.length, ...saved, pages: fetchedPages, hasMore }
      })
      creatorHubRepo.saveShop({ ...requireShop(shop.id), loginState: 'valid', lastVerifiedAt: Date.now(), updatedAt: Date.now() })
      return result
    } catch (error) {
      if (String((error as Error)?.message).includes('LOGIN_EXPIRED')) await markLogin(requireShop(shop.id), 'expired')
      throw error
    } finally {
      discovering.delete(shop.id)
    }
  },

  /** Pool creators of one shop (or all shops), scored against the shop's own history. */
  listPool(shopId?: string) {
    return buildPool({
      pool: creatorHubRepo.listPool(shopId),
      crm: creatorHubService.listCrm(shopId),
      profiles: creatorHubRepo.listProfiles(shopId),
      samples: creatorHubRepo.listSamples(shopId),
      contacts: creatorHubRepo.listContacts(shopId),
    })
  },

  // ===== Creator contacts (Zalo outreach; nothing is sent from here) =====

  /**
   * Reads the profile (bio + "shared contact info" flag) of up to 50 creators inside the shop's
   * logged-in backend, one request every 1.5-2.5 s, and keeps any Zalo / phone / email found in the bio.
   */
  async fetchContacts(payload: { shopId: string; creators: Array<{ creatorId: string; handle: string }> }): Promise<CreatorHubFetchContactsResult> {
    ensureStartup()
    const shop = requireShop(payload.shopId)
    const creators = (payload.creators || []).filter((item) => /^\d+$/.test(String(item.creatorId || ''))).slice(0, 50)
    if (!creators.length) throw new Error('CREATOR_HUB_CREATOR_REQUIRED')
    if (discovering.has(shop.id)) throw new Error('CREATOR_HUB_DISCOVER_RUNNING')
    discovering.add(shop.id)
    const result: CreatorHubFetchContactsResult = { checked: 0, failed: 0, withZalo: 0, withPhone: 0, withEmail: 0, onBackend: 0 }
    try {
      const params: Record<string, string> = { shop_region: shop.region }
      if (shop.shopId) params.oec_seller_id = shop.shopId
      await withAffiliatePage(target(shop), 'affiliate/creator', async (contents) => {
        for (const [index, creator] of creators.entries()) {
          if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1500 + Math.round(Math.random() * 1000)))
          try {
            const parsed = parseProfile(await pageApi(contents, { method: 'POST', path: '/api/v1/oec/affiliate/creator/marketplace/profile', query: params, body: profileBody(creator.creatorId) }))
            const id = `${shop.id}:${creator.creatorId}`
            const contact = creatorHubRepo.saveContact(mergeBioContact(creatorHubRepo.getContact(id), { shopId: shop.id, creatorId: creator.creatorId, handle: parsed.handle || creator.handle, bio: parsed.bio, contactInfoAvailable: parsed.contactInfoAvailable, now: Date.now() }))
            result.checked += 1
            if (contact.zalo) result.withZalo += 1
            if (contact.phone) result.withPhone += 1
            if (contact.email) result.withEmail += 1
            if (contact.contactInfoAvailable) result.onBackend += 1
          } catch (error) {
            if (String((error as Error)?.message).includes('LOGIN_EXPIRED')) throw error
            console.warn('[creator-hub] profile read failed', { message: (error as Error)?.message })
            result.failed += 1
          }
        }
      })
      return result
    } catch (error) {
      if (String((error as Error)?.message).includes('LOGIN_EXPIRED')) await markLogin(requireShop(shop.id), 'expired')
      throw error
    } finally {
      discovering.delete(shop.id)
    }
  },

  saveContact(input: CreatorHubContactInput) {
    requireShop(input.shopId)
    const creatorId = String(input.creatorId || '').trim()
    if (!creatorId) throw new Error('CREATOR_HUB_CREATOR_REQUIRED')
    const status = input.status && CREATOR_HUB_CONTACT_STATUSES.includes(input.status) ? input.status : undefined
    const id = `${input.shopId}:${creatorId}`
    return creatorHubRepo.saveContact(applyContactInput(creatorHubRepo.getContact(id), { ...input, creatorId, status }, Date.now()))
  },

  /** Records that a message went out (the user sends it in Zalo); a new contact moves to "contacted". */
  logContact(payload: { shopId: string; creatorId: string; handle: string; channel: CreatorHubContactChannel; note?: string }) {
    requireShop(payload.shopId)
    const creatorId = String(payload.creatorId || '').trim()
    if (!creatorId) throw new Error('CREATOR_HUB_CREATOR_REQUIRED')
    const now = Date.now()
    const id = `${payload.shopId}:${creatorId}`
    const previous = creatorHubRepo.getContact(id) || applyContactInput(undefined, { shopId: payload.shopId, creatorId, handle: payload.handle }, now)
    const channel: CreatorHubContactChannel = ['zalo', 'email', 'phone', 'other'].includes(payload.channel) ? payload.channel : 'other'
    return creatorHubRepo.saveContact({
      ...previous,
      status: previous.status === 'none' ? 'contacted' : previous.status,
      lastContactAt: now,
      log: [{ at: now, channel, note: payload.note ? String(payload.note).slice(0, 200) : undefined }, ...previous.log].slice(0, 50),
      updatedAt: now,
    })
  },

  listTemplates(): CreatorHubMessageTemplate[] {
    return creatorHubRepo.getTemplates() ?? DEFAULT_TEMPLATES.map((item) => ({ ...item, updatedAt: 0 }))
  },

  saveTemplate(payload: { id?: string; name: string; body: string }) {
    const name = String(payload.name || '').trim().slice(0, 40)
    const body = String(payload.body || '').trim().slice(0, 2000)
    if (!name || !body) throw new Error('CREATOR_HUB_TEMPLATE_REQUIRED')
    const list = creatorHubService.listTemplates()
    const id = payload.id && list.some((item) => item.id === payload.id) ? payload.id : randomUUID()
    const next = { id, name, body, updatedAt: Date.now() }
    return creatorHubRepo.saveTemplates(list.some((item) => item.id === id) ? list.map((item) => (item.id === id ? next : item)) : [...list, next])
  },

  removeTemplate(id: string) {
    return creatorHubRepo.saveTemplates(creatorHubService.listTemplates().filter((item) => item.id !== id))
  },

  /** Opens the creator's page in the shop's backend window (to read contact info the platform shows there). */
  async openCreatorBackend(payload: { shopId: string; creatorId: string }) {
    const creatorId = String(payload.creatorId || '')
    if (!/^\d+$/.test(creatorId)) throw new Error('CREATOR_HUB_CREATOR_REQUIRED')
    return creatorHubService.openBackend(payload.shopId, `affiliate/creator/detail?cid=${creatorId}`)
  },

  setPoolStar(payload: { ids: string[]; starred: boolean }) {
    const ids = (payload.ids || []).map(String).filter(Boolean)
    creatorHubRepo.setPoolStar(ids, Boolean(payload.starred))
    return { ok: true as const, count: ids.length }
  },

  removePool(ids: string[]) {
    const list = (ids || []).map(String).filter(Boolean)
    creatorHubRepo.removePool(list)
    return { ok: true as const, count: list.length }
  },

  /** Everything known about one creator in one shop: pool data, CRM row, samples, videos and orders. */
  getCreatorDetail(payload: { shopId: string; creatorId?: string; handle?: string }): CreatorHubCreatorDetail {
    const shopId = requireShop(payload.shopId).id
    const creatorId = String(payload.creatorId || '').trim()
    const handle = String(payload.handle || '').trim().toLowerCase()
    if (!creatorId && !handle) throw new Error('CREATOR_HUB_CREATOR_REQUIRED')
    const matches = (row: { creatorId: string; creatorHandle?: string; handle?: string }) =>
      (creatorId && row.creatorId === creatorId) || (handle && String(row.creatorHandle ?? row.handle ?? '').toLowerCase() === handle)
    const pool = creatorHubService.listPool(shopId).find((row) => matches(row))
    const crm = creatorHubService.listCrm(shopId).find((row) => matches(row))
    const samples = creatorHubRepo.listSamples(shopId).filter((row) => matches(row) || (pool && row.creatorHandle.toLowerCase() === pool.handle.toLowerCase()))
    const videos = creatorHubRepo.listVideos(shopId).filter((row) => matches(row) || (pool && (row.creatorId === pool.creatorId || row.creatorHandle.toLowerCase() === pool.handle.toLowerCase())))
    const orders = creatorHubRepo.listOrders(shopId).filter((row) => matches(row) || (pool && row.creatorId === pool.creatorId))
    const contact = creatorHubRepo.listContacts(shopId).find((row) => matches(row) || (pool && row.creatorId === pool.creatorId))
    return {
      pool,
      crm,
      contact,
      samples,
      videos,
      orders: {
        count: orders.length,
        amount: orders.reduce((sum, order) => sum + order.amount, 0),
        commission: orders.reduce((sum, order) => sum + (order.actualCommission ?? order.estCommission), 0),
        refunded: orders.filter((order) => order.refundQuantity > 0 || order.returnQuantity > 0).length,
        lastAt: orders.reduce<number | undefined>((latest, order) => (latest == null || order.createdAt > latest ? order.createdAt : latest), undefined),
      },
    }
  },
}
