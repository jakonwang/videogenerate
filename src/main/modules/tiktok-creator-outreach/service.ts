import { randomUUID } from 'node:crypto'
import { TiktokCreatorOutreachBrowser } from './browserClient'
import { tiktokCreatorOutreachRepo } from './repo'
import { renderTemplate, tiktokShopAffiliateApi } from './apiClient'
import type { OutreachTemplate, OutreachBatch, OutreachCampaign, CreatorLibraryEntry, OutreachTask, CreatorSource } from './types'
import { buildAffiliateUrl } from './regions'

const browser = new TiktokCreatorOutreachBrowser()
export function splitOutreachBatches(ids: string[], names: string[] = [], size = 50): OutreachBatch[] { const safeSize = Math.min(50, Math.max(1, Math.trunc(Number(size) || 50))); const total = Math.ceil(ids.length / safeSize); return Array.from({ length: total }, (_, index) => ({ index, total, creatorIds: ids.slice(index * safeSize, (index + 1) * safeSize), creatorNames: names.slice(index * safeSize, (index + 1) * safeSize) })) }
function rowsFromSearch(result: any) { const rows = result?.data?.creators || result?.data?.creator_list || result?.data?.list || result?.creators || []; return Array.isArray(rows) ? rows.map((item: any) => ({ id: String(item.creator_open_id || item.creator_id || item.id || item.handle || ''), name: String(item.creator_name || item.handle || item.username || item.name || ''), followers: item.follower_count == null ? undefined : String(item.follower_count), gmv: item.gmv == null ? undefined : String(item.gmv), invited: Boolean(item.invited || item.in_collaboration || item.cooperated) })).filter((item: any) => item.id && item.name) : [] }
function buildTargetCollaborationPayload(input: any, creatorIds: string[], creatorNames: string[], body: string) {
  const invitation = input || {}
  const productIds = Array.isArray(invitation.productIds) ? invitation.productIds.filter(Boolean).slice(0, 100) : []
  const payload: Record<string, unknown> = {
    creator_ids: creatorIds,
    creator_names: creatorNames,
    collaboration_name: invitation.name || undefined,
    message: body,
    expiration_time: invitation.expiresAt || undefined,
    content_type: invitation.contentType || undefined,
    product_ids: productIds,
    commission_rate: invitation.commissionRate == null ? undefined : Number(invitation.commissionRate),
    ad_commission_rate: invitation.adCommissionRate == null ? undefined : Number(invitation.adCommissionRate),
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== ''))
}

export const tiktokCreatorOutreachService = {
  listAccounts: () => tiktokCreatorOutreachRepo.listAccounts(),
  createAccount: (payload: any) => tiktokCreatorOutreachRepo.upsertAccount(payload),
  removeAccount: async (id: string) => { browser.close(); return tiktokCreatorOutreachRepo.removeAccount(id) },
  listTemplates: (kind?: OutreachTemplate['kind']) => tiktokCreatorOutreachRepo.listTemplates(kind),
  saveTemplate: (payload: any) => tiktokCreatorOutreachRepo.upsertTemplate(payload),
  configureApi: (payload: { appKey: string; appSecret: string; redirectUri: string; apiBaseUrl?: string; apiVersion?: string }) => tiktokShopAffiliateApi.saveCredential(payload),
  getApiConfigStatus: () => tiktokShopAffiliateApi.credentialStatus(),
  startOAuth: (accountId: string) => tiktokShopAffiliateApi.startOAuth(accountId),
  handleOAuthCallback: (code: string, state: string) => tiktokShopAffiliateApi.handleOAuthCallback(code, state),
  disconnectShop: (accountId: string) => tiktokShopAffiliateApi.disconnectShop(accountId),
  authorizationStatus: (accountId: string) => tiktokShopAffiliateApi.authorizationStatus(accountId),
  open: async (payload: { accountId: string; path?: string }) => { const account = (await tiktokCreatorOutreachRepo.listAccounts()).find((item) => item.id === payload.accountId); if (!account) throw new Error('OUTREACH_ACCOUNT_NOT_FOUND'); return browser.open(account.id, buildAffiliateUrl({ shopRegion: account.shopRegion, shopId: account.shopId, affiliateHost: account.affiliateHost, path: payload.path || 'platform/homepage' })) },
  authStatus: (accountId: string) => tiktokShopAffiliateApi.authorizationStatus(accountId),
  getCreatorFilters: (accountId: string) => tiktokShopAffiliateApi.getCreatorFilters(accountId),
  searchTargetCollaborations: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.searchTargetCollaborations(accountId, payload),
  getTargetCollaborationDetail: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.getTargetCollaborationDetail(accountId, payload),
  getConversationList: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.getConversationList(accountId, payload),
  getMessages: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.getMessages(accountId, payload),
  markConversationRead: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.markConversationRead(accountId, payload),
  generateCollaborationLink: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.generateCollaborationLink(accountId, payload),
  getCreatorPerformance: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.getCreatorPerformance(accountId, payload),
  getWeeklyOutreachRecords: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.getWeeklyOutreachRecords(accountId, payload),
  getWeeklyOutreachQuota: (accountId: string) => tiktokShopAffiliateApi.getWeeklyOutreachQuota(accountId),
  getInboxCounts: (accountId: string) => tiktokShopAffiliateApi.getInboxCounts(accountId),
  getPromotionDetails: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.getPromotionDetails(accountId, payload),
  listShopProducts: async (accountId: string, payload: Record<string, unknown> = {}) => { const result = await tiktokShopAffiliateApi.listShopProducts(accountId, payload); const rows = result?.data?.products || result?.data?.product_list || result?.products || result?.data?.list || []; return { ...result, products: Array.isArray(rows) ? rows.map((item: any) => ({ id: String(item.product_id || item.item_id || item.id || ''), name: String(item.product_name || item.title || item.name || ''), status: String(item.status || 'unknown'), skuCount: Number(item.sku_count || item.skus?.length || 0) })).filter((item: any) => item.id) : [] } } ,
  searchCreators: async (accountId: string, filters: Record<string, unknown> = {}, cursor?: string) => { const target = Math.min(10000, Math.max(1, Number(filters.targetCount || filters.target_count || 50))); const cleanFilters = { ...filters }; delete cleanFilters.targetCount; delete cleanFilters.target_count; const all: any[] = []; let next = cursor; let last: any = {}; for (let page = 0; page < 200 && all.length < target; page += 1) { const result = await tiktokShopAffiliateApi.searchCreators(accountId, cleanFilters, next); last = result; all.push(...rowsFromSearch(result)); const token = result?.data?.next_page_token || result?.data?.next_cursor || result?.next_page_token; if (!token || token === next) break; next = String(token) } const unique = [...new Map(all.filter((item) => item.id).map((item) => [item.id, item])).values()].slice(0, target); await tiktokCreatorOutreachRepo.appendAudit({ accountId, action: 'read_creators', status: 'success', count: unique.length, detail: `pages_until_target=${unique.length >= target}` }); return { ...last, creators: unique, nextCursor: next } },
  readCreators: async (accountId: string) => { const result = await tiktokCreatorOutreachService.searchCreators(accountId, { page_size: 50, targetCount: 50 }); return result.creators },
  preview: async (payload: any) => { if (!payload.creatorIds?.length) throw new Error('OUTREACH_BATCH_EMPTY'); const body = renderTemplate(payload.template || '', payload.variables || {}); const result = splitOutreachBatches(payload.creatorIds, payload.creatorNames || [], payload.batchSize); const campaign: OutreachCampaign = { id: randomUUID(), accountId: payload.accountId, mode: payload.action, targetCount: payload.creatorIds.length, batchSize: Math.min(50, Math.max(1, Number(payload.batchSize) || 50)), filters: payload.filters || {}, invitation: payload.action === 'invite' ? payload.invitation : undefined, messageTemplate: payload.action === 'message' ? payload.template || '' : undefined, status: 'ready', createdAt: Date.now(), updatedAt: Date.now() }; await tiktokCreatorOutreachRepo.saveCampaign(campaign); await tiktokCreatorOutreachRepo.appendAudit({ accountId: payload.accountId, action: payload.action === 'invite' ? 'preview_invite' : 'preview_message', status: 'success', count: payload.creatorIds.length, detail: `campaign=${campaign.id};batches=${result.length}` }); return { campaignId: campaign.id, count: payload.creatorIds.length, body, batches: result, requiresConfirmation: true } },
  confirm: async (payload: any) => { if (!Number.isInteger(payload.count) || payload.count < 1 || payload.count > 50) throw new Error('OUTREACH_BATCH_LIMIT'); if (payload.action === 'invite') { const creatorIds = payload.creatorIds || []; const creatorNames = payload.creatorNames || []; const invitation = payload.invitation || {}; if (!Array.isArray(invitation.productIds) || invitation.productIds.length < 1) throw new Error('OUTREACH_PRODUCT_REQUIRED'); if (invitation.commissionRate == null || Number.isNaN(Number(invitation.commissionRate))) throw new Error('OUTREACH_COMMISSION_REQUIRED'); const result = await tiktokShopAffiliateApi.createTargetCollaboration(payload.accountId, buildTargetCollaborationPayload(invitation, creatorIds, creatorNames, payload.body || '')); await tiktokCreatorOutreachRepo.appendAudit({ accountId: payload.accountId, action: 'confirm_invite', status: 'success', count: payload.count, detail: `api_request=${result.request_id || ''};products=${invitation.productIds.length}` }); return { ok: true, note: 'Target collaboration request submitted through TikTok Shop API.', result } } const results: any[] = []; for (const creatorId of payload.creatorIds || []) { const conversation = await tiktokShopAffiliateApi.createConversation(payload.accountId, { creator_id: creatorId }); const conversationId = conversation?.data?.conversation_id || conversation?.data?.id; if (!conversationId) throw new Error('OUTREACH_CONVERSATION_NOT_FOUND'); const sent = await tiktokShopAffiliateApi.sendMessage(payload.accountId, { conversation_id: conversationId, message: payload.body || '' }); results.push({ creatorId, conversationId, sent }) } await tiktokCreatorOutreachRepo.appendAudit({ accountId: payload.accountId, action: 'confirm_message', status: 'success', count: payload.count, detail: `sent=${results.length}` }); return { ok: true, note: `Sent ${results.length} messages through TikTok Shop API.`, results } },
  listCampaigns: (accountId?: string) => tiktokCreatorOutreachRepo.listCampaigns(accountId),
  updateCampaignStatus: (id: string, status: OutreachCampaign['status']) => tiktokCreatorOutreachRepo.updateCampaignStatus(id, status),
  listAudits: (accountId?: string) => tiktokCreatorOutreachRepo.listAudits(accountId),
  parseSpecifiedCreators: async (input: string) => {
    const valid: Array<{ creatorId: string; creatorName: string; profileUrl?: string }> = []
    const invalid: Array<{ value: string; reason: string }> = []
    const seen = new Set<string>()
    for (const raw of String(input || '').split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean)) {
      let value = raw
      let profileUrl: string | undefined
      try { if (/^https?:\/\//i.test(value)) { const url = new URL(value); profileUrl = value; value = url.pathname.split('/').filter(Boolean).pop() || '' } } catch { /* ignore malformed url */ }
      value = value.replace(/^@/, '').trim()
      if (!/^[A-Za-z0-9._:-]{2,128}$/.test(value)) { invalid.push({ value: raw, reason: 'INVALID_CREATOR_ID' }); continue }
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      valid.push({ creatorId: value, creatorName: value, profileUrl })
    }
    return { valid, invalid }
  },
  listCreatorLibrary: (accountId?: string) => tiktokCreatorOutreachRepo.listCreatorLibrary(accountId),
  addCreatorsToLibrary: async (payload: { accountId: string; creators: Array<{ creatorId: string; creatorName?: string; profileUrl?: string; tags?: string[]; note?: string }> }) => {
    const result: CreatorLibraryEntry[] = []
    for (const creator of payload.creators || []) {
      if (!creator.creatorId) continue
      result.push(await tiktokCreatorOutreachRepo.upsertCreatorLibrary({ id: randomUUID(), accountId: payload.accountId, creatorId: String(creator.creatorId), creatorName: String(creator.creatorName || creator.creatorId), profileUrl: creator.profileUrl, tags: creator.tags || [], note: creator.note, status: 'active', createdAt: Date.now(), updatedAt: Date.now() }))
    }
    await tiktokCreatorOutreachRepo.appendAudit({ accountId: payload.accountId, action: 'creator_library', status: 'success', count: result.length, detail: 'upsert' })
    return result
  },
  removeCreatorsFromLibrary: (ids: string[]) => tiktokCreatorOutreachRepo.removeCreatorLibrary(ids),
  updateCreatorTags: async (payload: { id: string; tags: string[] }) => tiktokCreatorOutreachRepo.updateCreatorLibrary(payload.id, { tags: payload.tags || [] }),
  blockCreators: async (ids: string[], blocked = true) => { for (const id of ids) await tiktokCreatorOutreachRepo.updateCreatorLibrary(id, { status: blocked ? 'blocked' : 'active' }); return { ok: true as const } },
  previewOutreachTask: async (payload: any) => {
    const source: CreatorSource = payload.source || 'marketplace'
    let creators = Array.isArray(payload.creators) ? payload.creators : []
    if (source === 'marketplace' && !creators.length) {
      const result = await tiktokCreatorOutreachService.searchCreators(payload.accountId, {
        ...(payload.filters || {}),
        targetCount: payload.targetCount,
      })
      creators = result.creators
    }
    if (source === 'specified' && typeof payload.input === 'string') creators = (await tiktokCreatorOutreachService.parseSpecifiedCreators(payload.input)).valid
    if (source === 'library') creators = (await tiktokCreatorOutreachService.listCreatorLibrary(payload.accountId)).filter((item) => item.status === 'active')
    const uniqueCreators = [...new Map<string, Record<string, unknown>>(creators.map((item: any): [string, Record<string, unknown>] => {
      const id = String(item.creatorId || item.id || item.creator_id || '').trim()
      return [id, { ...item, id }]
    }).filter(([id]: [string, Record<string, unknown>]) => Boolean(id))).values()]
    const ids = uniqueCreators.map((item: any) => item.id)
    const names = uniqueCreators.map((item: any) => String(item.creatorName || item.name || item.id))
    const batches = splitOutreachBatches(ids, names, payload.batchSize)
    const count = Math.min(ids.length, Number(payload.targetCount || ids.length))
    return { source, count, batches: splitOutreachBatches(ids.slice(0, count), names.slice(0, count), payload.batchSize), creators: uniqueCreators.slice(0, count), requiresConfirmation: true }
  },
  createOutreachTask: async (payload: any) => {
    const preview = await tiktokCreatorOutreachService.previewOutreachTask(payload)
    const creatorIds = preview.batches.flatMap((batch) => batch.creatorIds).slice(0, Number(payload.targetCount || preview.count))
    const creatorNames = preview.batches.flatMap((batch) => batch.creatorNames || []).slice(0, creatorIds.length)
    const task: OutreachTask = { id: randomUUID(), accountId: payload.accountId, source: payload.source || 'marketplace', mode: payload.mode || payload.action || 'invite', targetCount: creatorIds.length, batchSize: Math.min(50, Math.max(1, Number(payload.batchSize) || 50)), filters: payload.filters || {}, creatorIds, creatorNames, successfulCreatorIds: [], failedCreatorIds: [], skippedCreatorIds: [], status: 'preview', progress: { total: creatorIds.length, completed: 0, success: 0, failed: 0, skipped: 0 }, invitation: payload.invitation, messageTemplate: payload.messageTemplate || payload.template, messageFilters: payload.messageFilters, createdAt: Date.now(), updatedAt: Date.now() }
    await tiktokCreatorOutreachRepo.saveTask(task)
    await tiktokCreatorOutreachRepo.appendAudit({ accountId: task.accountId, action: 'task_created', status: 'success', count: task.targetCount, detail: `task=${task.id}` })
    return { task, batches: splitOutreachBatches(creatorIds, creatorNames, task.batchSize) }
  },
  getOutreachTask: (id: string) => tiktokCreatorOutreachRepo.getTask(id),
  listOutreachTasks: (accountId?: string) => tiktokCreatorOutreachRepo.listTasks(accountId),
  listTaskBatches: async (id: string) => {
    const task = await tiktokCreatorOutreachRepo.getTask(id)
    if (!task) throw new Error('OUTREACH_TASK_NOT_FOUND')
    return splitOutreachBatches(task.creatorIds, task.creatorNames, task.batchSize).map((batch) => ({ ...batch, status: task.status === 'completed' ? 'completed' : task.currentBatch === batch.index + 1 ? task.status : 'pending' }))
  },
  listTaskAuditLogs: async (id: string) => {
    const task = await tiktokCreatorOutreachRepo.getTask(id)
    if (!task) throw new Error('OUTREACH_TASK_NOT_FOUND')
    return (await tiktokCreatorOutreachRepo.listAudits(task.accountId)).filter((item) => String(item.detail || '').includes(`task=${id}`))
  },
  confirmOutreachTask: async (id: string) => {
    const task = await tiktokCreatorOutreachRepo.getTask(id)
    if (!task) throw new Error('OUTREACH_TASK_NOT_FOUND')
    if (task.status !== 'preview') throw new Error('OUTREACH_TASK_CONFIRMATION_INVALID')
    const confirmedAt = Date.now()
    const result = await tiktokCreatorOutreachRepo.updateTask(id, { status: 'ready' as OutreachTask['status'], confirmedAt })
    await tiktokCreatorOutreachRepo.appendAudit({ accountId: task.accountId, action: 'task_confirmed', status: 'success', detail: `task=${id};confirmed_at=${confirmedAt}` })
    return result
  },
  startOutreachTask: async (id: string) => {
    const task = await tiktokCreatorOutreachRepo.getTask(id)
    if (!task) throw new Error('OUTREACH_TASK_NOT_FOUND')
    if (task.status === 'cancelled' || task.status === 'completed') return task
    if (task.status !== 'ready' && task.status !== 'paused') throw new Error('OUTREACH_TASK_REQUIRES_CONFIRMATION')
    await tiktokCreatorOutreachRepo.updateTask(id, { status: 'running', lastError: undefined }); await tiktokCreatorOutreachRepo.appendAudit({ accountId: task.accountId, action: 'task_started', status: 'success', detail: `task=${id}` })
    const successful = new Set<string>(task.successfulCreatorIds || [])
    const pendingCreatorIds = task.creatorIds.filter((creatorId) => !successful.has(creatorId) && !(task.skippedCreatorIds || []).includes(creatorId))
    if (task.mode === 'invite') {
      const inviteBatches = splitOutreachBatches(pendingCreatorIds, pendingCreatorIds.map((creatorId) => task.creatorNames[task.creatorIds.indexOf(creatorId)] || creatorId), task.batchSize)
      for (const batch of inviteBatches) {
        const current = await tiktokCreatorOutreachRepo.getTask(id)
        if (!current || current.status === 'cancelled' || current.status === 'paused') break
        const batchNumber = batch.index + 1
        await tiktokCreatorOutreachRepo.updateTask(id, { currentBatch: batchNumber })
        await tiktokCreatorOutreachRepo.appendAudit({ accountId: task.accountId, action: 'invite_batch_started', status: 'success', count: batch.creatorIds.length, detail: `task=${id};batch=${batchNumber}/${batch.total}` })
        try {
          await tiktokShopAffiliateApi.createTargetCollaboration(task.accountId, buildTargetCollaborationPayload(task.invitation || {}, batch.creatorIds, batch.creatorNames || [], task.invitation?.message || ''))
          const latest = await tiktokCreatorOutreachRepo.getTask(id)
          if (latest) {
            const completed = latest.progress.completed + batch.creatorIds.length
            await tiktokCreatorOutreachRepo.updateTask(id, {
              successfulCreatorIds: [...new Set([...(latest.successfulCreatorIds || []), ...batch.creatorIds])],
              failedCreatorIds: (latest.failedCreatorIds || []).filter((creatorId) => !batch.creatorIds.includes(creatorId)),
              progress: { ...latest.progress, completed, success: latest.progress.success + batch.creatorIds.length },
            })
          }
          await tiktokCreatorOutreachRepo.appendAudit({ accountId: task.accountId, action: 'invite_batch_completed', status: 'success', count: batch.creatorIds.length, detail: `task=${id};batch=${batchNumber}/${batch.total}` })
        } catch (error) {
          const latest = await tiktokCreatorOutreachRepo.getTask(id)
          if (latest) await tiktokCreatorOutreachRepo.updateTask(id, {
            failedCreatorIds: [...new Set([...(latest.failedCreatorIds || []), ...batch.creatorIds])],
            progress: { ...latest.progress, completed: latest.progress.completed + batch.creatorIds.length, failed: latest.progress.failed + batch.creatorIds.length },
            status: 'paused',
            lastError: error instanceof Error ? error.message : String(error),
          })
          await tiktokCreatorOutreachRepo.appendAudit({ accountId: task.accountId, action: 'creator_failed', status: 'failed', count: batch.creatorIds.length, detail: `task=${id};batch=${batchNumber}` })
          break
        }
      }
    } else for (const creatorId of pendingCreatorIds) {
      const current = await tiktokCreatorOutreachRepo.getTask(id); if (!current || current.status === 'cancelled' || current.status === 'paused') break
      if (successful.has(creatorId)) continue
      try {
        const conversation = await tiktokShopAffiliateApi.createConversation(task.accountId, { creator_id: creatorId }); const conversationId = conversation?.data?.conversation_id || conversation?.data?.id; if (!conversationId) throw new Error('OUTREACH_CONVERSATION_NOT_FOUND')
        const history = task.messageFilters ? await tiktokShopAffiliateApi.getMessages(task.accountId, { conversation_id: conversationId }) : null
        const messages = history?.data?.messages || history?.messages || []
        if (task.messageFilters?.skipCreatorReply && messages.length && String(messages[messages.length - 1]?.sender_type || '').toLowerCase() === 'creator') { await tiktokCreatorOutreachRepo.updateTask(id, { skippedCreatorIds: [...(current.skippedCreatorIds || []), creatorId], progress: { ...current.progress, completed: current.progress.completed + 1, skipped: current.progress.skipped + 1 } }); continue }
        await tiktokShopAffiliateApi.sendMessage(task.accountId, { conversation_id: conversationId, message: renderTemplate(task.messageTemplate || '', { creatorName: task.creatorNames[task.creatorIds.indexOf(creatorId)] || creatorId }) })
        successful.add(creatorId); const latest = await tiktokCreatorOutreachRepo.getTask(id); if (latest) await tiktokCreatorOutreachRepo.updateTask(id, { successfulCreatorIds: [...successful], failedCreatorIds: (latest.failedCreatorIds || []).filter((value) => value !== creatorId), progress: { ...latest.progress, completed: latest.progress.completed + 1, success: latest.progress.success + 1 } })
      } catch (error) { const latest = await tiktokCreatorOutreachRepo.getTask(id); if (latest) await tiktokCreatorOutreachRepo.updateTask(id, { failedCreatorIds: [...new Set([...(latest.failedCreatorIds || []), creatorId])], progress: { ...latest.progress, completed: latest.progress.completed + 1, failed: latest.progress.failed + 1 }, status: 'paused', lastError: error instanceof Error ? error.message : String(error) }); await tiktokCreatorOutreachRepo.appendAudit({ accountId: task.accountId, action: 'creator_failed', status: 'failed', count: 1, detail: `task=${id};creator=${creatorId}` }); break }
    }
    const final = await tiktokCreatorOutreachRepo.getTask(id); if (final && final.status === 'running') { await tiktokCreatorOutreachRepo.updateTask(id, { status: final.progress.completed >= final.progress.total ? 'completed' : 'paused' }); }
    return tiktokCreatorOutreachRepo.getTask(id)
  },
  pauseOutreachTask: async (id: string) => tiktokCreatorOutreachRepo.updateTask(id, { status: 'paused' }),
  resumeOutreachTask: (id: string) => tiktokCreatorOutreachService.startOutreachTask(id),
  cancelOutreachTask: async (id: string) => tiktokCreatorOutreachRepo.updateTask(id, { status: 'cancelled' }),
  retryFailedCreators: async (id: string) => { const task = await tiktokCreatorOutreachRepo.getTask(id); if (!task) throw new Error('OUTREACH_TASK_NOT_FOUND'); const remaining = (task.failedCreatorIds || []); if (!remaining.length) return task; const names = remaining.map((creatorId) => task.creatorNames[task.creatorIds.indexOf(creatorId)] || creatorId); await tiktokCreatorOutreachRepo.updateTask(id, { creatorIds: remaining, creatorNames: names, successfulCreatorIds: [], failedCreatorIds: [], skippedCreatorIds: [], targetCount: remaining.length, progress: { total: remaining.length, completed: 0, success: 0, failed: 0, skipped: 0 }, status: 'paused', lastError: undefined }); return tiktokCreatorOutreachService.startOutreachTask(id) },
  getOutreachStatistics: async (accountId?: string) => {
    const tasks = await tiktokCreatorOutreachRepo.listTasks(accountId)
    const totals = tasks.reduce((acc, task) => ({ total: acc.total + task.progress.total, success: acc.success + task.progress.success, failed: acc.failed + task.progress.failed, skipped: acc.skipped + task.progress.skipped, inviteTotal: acc.inviteTotal + (task.mode === 'invite' ? task.progress.total : 0), inviteSuccess: acc.inviteSuccess + (task.mode === 'invite' ? task.progress.success : 0), messageTotal: acc.messageTotal + (task.mode === 'message' ? task.progress.total : 0), messageSuccess: acc.messageSuccess + (task.mode === 'message' ? task.progress.success : 0) }), { total: 0, success: 0, failed: 0, skipped: 0, inviteTotal: 0, inviteSuccess: 0, messageTotal: 0, messageSuccess: 0 })
    return { ...totals, inviteAcceptanceRate: totals.inviteTotal ? totals.inviteSuccess / totals.inviteTotal : 0, messageSuccessRate: totals.messageTotal ? totals.messageSuccess / totals.messageTotal : 0, taskCount: tasks.length }
  },
  getFeatureAvailability: (accountId?: string) => ({ accountId, api: { creatorSearch: true, targetCollaboration: true, conversations: true, messaging: true, products: true }, pendingOfficialApi: ['email', 'competitor_product', 'competitor_shop', 'fulfillment', 'plan_cleanup', 'plan_merge', 'team_performance'] }),
  listMessageHistory: (accountId: string, payload: Record<string, unknown>) => tiktokShopAffiliateApi.getMessages(accountId, payload),
}
