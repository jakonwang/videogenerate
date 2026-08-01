import type { GmvMaxCampaign, GmvMaxSessionSnapshot } from './types'

function valueText(value: unknown) {
  return String(value ?? '').trim()
}

function parseUtc(value?: string) {
  const normalized = valueText(value)
  if (!normalized) return undefined
  const timestamp = Date.parse(normalized.includes('T') ? normalized : `${normalized.replace(' ', 'T')}Z`)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export function formatGmvMaxUtcTime(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')
}

export function buildGmvMaxSessionWindow(input: { campaign: GmvMaxCampaign; now: number; durationHours?: number }) {
  const startAt = input.now
  const requestedEndAt = startAt + Math.max(1, input.durationHours || 24) * 60 * 60_000
  const campaignEndAt = parseUtc(input.campaign.scheduleEndTime)
  const endAt = campaignEndAt === undefined ? requestedEndAt : Math.min(requestedEndAt, campaignEndAt)
  if (endAt - startAt < 30 * 60_000) throw new Error('Campaign schedule does not leave enough time for a protected boost session.')
  return { startTime: formatGmvMaxUtcTime(startAt), endTime: formatGmvMaxUtcTime(endAt) }
}

export function refreshGmvMaxCreativeBoostSchedule(input: {
  campaign: GmvMaxCampaign
  actionPayload: Record<string, unknown>
  now: number
}) {
  const previousStart = parseUtc(valueText(input.actionPayload.scheduleStartTime || input.actionPayload.schedule_start_time))
  const previousEnd = parseUtc(valueText(input.actionPayload.scheduleEndTime || input.actionPayload.schedule_end_time))
  const durationHours = previousStart !== undefined && previousEnd !== undefined && previousEnd > previousStart
    ? Math.max(1, Math.min(168, (previousEnd - previousStart) / (60 * 60_000)))
    : 24
  const window = buildGmvMaxSessionWindow({ campaign: input.campaign, now: input.now, durationHours })
  return {
    ...input.actionPayload,
    scheduleType: 'SCHEDULE_START_END',
    scheduleStartTime: window.startTime,
    scheduleEndTime: window.endTime,
  }
}

export function isGmvMaxSessionInputRejection(message: unknown) {
  return /campaign_gmv_max_session_(?:create|update).*code=40002/i.test(valueText(message))
}

export function buildGmvMaxSessionToolCall(input: {
  advertiserId: string
  storeId: string
  campaign: GmvMaxCampaign
  actionPayload: Record<string, unknown>
}) {
  const operation = valueText(input.actionPayload.operation || 'create').toLowerCase()
  const sessionId = valueText(input.actionPayload.sessionId || input.actionPayload.session_id)
  if (operation === 'delete') {
    if (!sessionId) throw new Error('TikTok session deletion requires a session ID.')
    return { tool: 'campaign_gmv_max_session_delete', args: { advertiser_id: input.advertiserId, session_id: sessionId } }
  }
  const itemId = valueText(input.actionPayload.itemId || input.actionPayload.item_id || input.actionPayload.creativeId)
  const spuId = valueText(input.actionPayload.spuId || input.actionPayload.spu_id)
  const budget = valueText(input.actionPayload.budget)
  const endTime = valueText(input.actionPayload.scheduleEndTime || input.actionPayload.schedule_end_time)
  const scheduleType = valueText(input.actionPayload.scheduleType || input.actionPayload.schedule_type || 'SCHEDULE_START_END').toUpperCase()
  if (!['SCHEDULE_FROM_NOW', 'SCHEDULE_START_END'].includes(scheduleType)) throw new Error(`Unsupported TikTok session schedule type: ${scheduleType || 'missing'}`)
  if (!budget || !Number.isFinite(Number(budget)) || Number(budget) <= 0) throw new Error('TikTok creative boost session requires a valid budget.')
  if (scheduleType === 'SCHEDULE_START_END' && !endTime) throw new Error('TikTok creative boost session requires a bounded UTC end time.')
  const schedule = {
    schedule_type: scheduleType,
    ...(scheduleType === 'SCHEDULE_START_END' ? { schedule_end_time: endTime } : {}),
  }
  if (operation === 'update') {
    if (!sessionId) throw new Error('TikTok session update requires a session ID.')
    return {
      tool: 'campaign_gmv_max_session_update',
      args: {
        advertiser_id: input.advertiserId,
        campaign_id: input.campaign.id,
        store_id: input.storeId,
        session_id: sessionId,
        session: { budget: Number(budget), ...schedule },
      },
    }
  }
  if (operation !== 'create') throw new Error(`Unsupported TikTok session operation: ${operation}`)
  if (input.campaign.campaignType !== 'PRODUCT') throw new Error('Creative boost sessions are only enabled for Product GMV MAX campaigns.')
  if (!itemId || !spuId) throw new Error('TikTok creative boost session requires one item and one SPU.')
  return {
    tool: 'campaign_gmv_max_session_create',
    args: {
      advertiser_id: input.advertiserId,
      campaign_id: input.campaign.id,
      store_id: input.storeId,
      session: {
        bid_type: 'CREATIVE_NO_BID',
        product_list: [{ spu_id: spuId }],
        item_id: itemId,
        budget: Number(budget),
        ...schedule,
      },
    },
  }
}

export function verifyGmvMaxSessionState(input: {
  operation: string
  sessionId?: string
  expectedBudget?: string
  sessions: GmvMaxSessionSnapshot[]
}) {
  const operation = input.operation.toLowerCase()
  const session = input.sessionId ? input.sessions.find((item) => item.sessionId === input.sessionId) : undefined
  const inactive = new Set(['DELETED', 'CANCELLED', 'ENDED', 'DISABLED'])
  if (operation === 'delete') {
    if (!session || inactive.has(session.status.toUpperCase())) return { state: 'confirmed' as const, reason: 'TikTok session is no longer active.' }
    return { state: 'diverged' as const, reason: 'TikTok session remains active after deletion.' }
  }
  if (!session) return { state: 'pending' as const, reason: 'TikTok session has not appeared in the remote session list.' }
  if (inactive.has(session.status.toUpperCase())) return { state: 'diverged' as const, reason: 'TikTok session is inactive after creation or update.' }
  if (input.expectedBudget && Number(session.budget) !== Number(input.expectedBudget)) {
    return { state: 'diverged' as const, reason: 'TikTok session budget differs from the requested budget.' }
  }
  return { state: 'confirmed' as const, reason: 'TikTok session state matches the requested action.' }
}
