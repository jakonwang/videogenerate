/**
 * GMV MAX V2: builds the "today" workspace (one diagnosis per campaign, daily checklist, account summary)
 * from data already synced into the local store, and keeps V2 settings and the manual change log.
 */
import { randomUUID } from 'node:crypto'
import { gmvMaxRepo } from './sqlite'
import {
  DEFAULT_DIAGNOSIS_SETTINGS,
  buildDailyChecklist,
  countCreativeStatuses,
  diagnoseCampaign,
  summarizeAccount,
  type CampaignDiagnosis,
  type DiagnosisChange,
  type DiagnosisDay,
  type DiagnosisSettings,
} from './diagnosis'
import type { GmvMaxAccountBinding, GmvMaxCampaign, GmvMaxDailyMetric } from './types'

const SETTINGS_ID = 'v2-settings'
const CHANGES_ID = 'v2-changes'
const DAY_MS = 24 * 60 * 60 * 1000

export type GmvMaxV2Settings = {
  /** Store default margin (0–1) keyed by storeId. */
  storeMargins: Record<string, number>
  thresholds: Omit<DiagnosisSettings, 'defaultMargin'>
  updatedAt: number
}

export type GmvMaxV2Change = DiagnosisChange & { id: string; campaignId: string; note?: string }

function num(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function rawMetric(metric: GmvMaxDailyMetric, key: string) {
  const raw = metric.raw as Record<string, any> | undefined
  const value = raw?.metrics?.[key] ?? raw?.metric?.[key] ?? raw?.[key]
  return value === undefined || value === null || value === '' ? undefined : num(value)
}

export function readV2Settings(): GmvMaxV2Settings {
  const stored = gmvMaxRepo.getRuntimeRecord<Partial<GmvMaxV2Settings>>(SETTINGS_ID)
  const { defaultMargin: _ignored, ...defaults } = DEFAULT_DIAGNOSIS_SETTINGS
  return {
    storeMargins: stored?.storeMargins && typeof stored.storeMargins === 'object' ? stored.storeMargins : {},
    thresholds: { ...defaults, ...(stored?.thresholds || {}) },
    updatedAt: Number(stored?.updatedAt || 0),
  }
}

export function saveV2Settings(input: { storeId?: string; marginPercent?: number | null; thresholds?: Partial<GmvMaxV2Settings['thresholds']> }) {
  const current = readV2Settings()
  const next: GmvMaxV2Settings = { ...current, storeMargins: { ...current.storeMargins }, thresholds: { ...current.thresholds }, updatedAt: Date.now() }
  if (input.storeId) {
    const percent = input.marginPercent === null || input.marginPercent === undefined ? null : Number(input.marginPercent)
    if (percent === null) delete next.storeMargins[input.storeId]
    else if (Number.isFinite(percent) && percent > 0 && percent < 100) next.storeMargins[input.storeId] = Math.round(percent * 100) / 10_000
    else throw new Error('毛利率需要在 1%–99% 之间')
  }
  if (input.thresholds) {
    const t = input.thresholds
    const clamp = (value: unknown, min: number, max: number, fallback: number) => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
    }
    next.thresholds = {
      safetyMargin: clamp(t.safetyMargin, 0, 1, next.thresholds.safetyMargin),
      learningDays: Math.round(clamp(t.learningDays, 1, 14, next.thresholds.learningDays)),
      underspendUtilization: clamp(t.underspendUtilization, 0.1, 0.9, next.thresholds.underspendUtilization),
      scaleUtilization: clamp(t.scaleUtilization, 0.5, 1, next.thresholds.scaleUtilization),
      roiStep: clamp(t.roiStep, 0.02, 0.3, next.thresholds.roiStep),
      budgetStep: clamp(t.budgetStep, 0.05, 0.5, next.thresholds.budgetStep),
      minDeliveringCreatives: Math.round(clamp(t.minDeliveringCreatives, 1, 500, next.thresholds.minDeliveringCreatives)),
      minOrdersForVerdict: Math.round(clamp(t.minOrdersForVerdict, 1, 500, next.thresholds.minOrdersForVerdict)),
    }
  }
  gmvMaxRepo.saveRuntimeRecord(SETTINGS_ID, next)
  return next
}

export function listV2Changes(): GmvMaxV2Change[] {
  const stored = gmvMaxRepo.getRuntimeRecord<GmvMaxV2Change[]>(CHANGES_ID)
  return Array.isArray(stored) ? stored : []
}

/** "I changed it myself in TikTok": starts the learning countdown and keeps the history. */
export function recordV2Change(input: { campaignId: string; kind: DiagnosisChange['kind']; from?: number; to?: number; note?: string; at?: number }) {
  const campaignId = String(input.campaignId || '').trim()
  if (!campaignId) throw new Error('缺少推广系列')
  const kind = (['roi', 'budget', 'products', 'status', 'other'] as const).includes(input.kind as any) ? input.kind : 'other'
  const change: GmvMaxV2Change = {
    id: randomUUID(),
    campaignId,
    kind,
    at: Number(input.at) || Date.now(),
    from: input.from === undefined || input.from === null ? undefined : num(input.from),
    to: input.to === undefined || input.to === null ? undefined : num(input.to),
    note: input.note ? String(input.note).slice(0, 300) : undefined,
    source: 'manual',
  }
  const all = [change, ...listV2Changes()].slice(0, 2000)
  gmvMaxRepo.saveRuntimeRecord(CHANGES_ID, all)
  return change
}

export function undoV2Change(id: string) {
  const all = listV2Changes().filter((item) => item.id !== id)
  gmvMaxRepo.saveRuntimeRecord(CHANGES_ID, all)
  return { ok: true as const }
}

function zonedToday(timezone: string | undefined, now: number) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  } catch {
    return new Date(now).toISOString().slice(0, 10)
  }
}

function systemChanges(campaignId: string, since: number, audits = gmvMaxRepo.listAuditsRange(since, Date.now() + DAY_MS)): DiagnosisChange[] {
  return audits
    .filter((audit) => audit.campaignId === campaignId && audit.status === 'succeeded')
    .map((audit) => {
      const action = String(audit.action || '').toLowerCase()
      const kind: DiagnosisChange['kind'] = action.includes('roi') || action.includes('roas') ? 'roi' : action.includes('budget') ? 'budget' : action.includes('status') ? 'status' : 'other'
      return { kind, at: audit.completedAt || audit.createdAt, source: 'system' as const }
    })
    .filter((change) => change.kind === 'roi' || change.kind === 'budget')
}

export type V2SeriesPoint = { date: string; cost: number; grossRevenue: number; roi: number | null; targetRoi: number | null }
export type V2CampaignDiagnosis = CampaignDiagnosis & { series: V2SeriesPoint[] }

function withSeries(series: V2SeriesPoint[], diagnosis: CampaignDiagnosis): V2CampaignDiagnosis {
  return { ...diagnosis, series }
}

export function buildV2Workspace(input: {
  storeId?: string
  now?: number
  /** Margin from complete product costs for a campaign (0–1), or null. */
  productMarginFor: (campaign: GmvMaxCampaign) => number | null
}) {
  const now = input.now || Date.now()
  const settings = readV2Settings()
  const bindings = gmvMaxRepo.listBindings()
  const bindingById = new Map<string, GmvMaxAccountBinding>(bindings.map((binding) => [binding.id, binding]))
  const campaigns = gmvMaxRepo.listCampaigns()
    .filter((campaign) => !input.storeId || input.storeId === 'all' || campaign.storeId === input.storeId)
    .filter((campaign) => !/delete/i.test(campaign.operationStatus || ''))
  const manualChanges = listV2Changes()
  const since = now - 30 * DAY_MS
  const startDate = new Date(now - 8 * DAY_MS).toISOString().slice(0, 10)
  const endDate = new Date(now + DAY_MS).toISOString().slice(0, 10)
  // Read once for all campaigns (these were per-campaign / full-payload reads and took seconds on large accounts).
  const audits = gmvMaxRepo.listAuditsRange(since, now + DAY_MS)
  const creativeStatuses = new Map<string, Array<{ itemKey: string; statDate: string; status: string | null }>>()
  for (const row of gmvMaxRepo.listCreativeStatusesRange(startDate, endDate, campaigns.map((campaign) => campaign.id))) {
    const bucket = creativeStatuses.get(row.campaignId)
    if (bucket) bucket.push(row)
    else creativeStatuses.set(row.campaignId, [row])
  }

  const diagnoses: V2CampaignDiagnosis[] = []
  for (const campaign of campaigns) {
    const binding = bindingById.get(campaign.bindingId)
    const today = zonedToday(binding?.timezone, now)
    const metrics = gmvMaxRepo.listMetrics(campaign.id)
      .filter((metric) => metric.statDate < today)
      .sort((a, b) => a.statDate.localeCompare(b.statDate))
      .slice(-30)
    const days: DiagnosisDay[] = metrics.map((metric) => ({
      date: metric.statDate,
      cost: num(metric.cost),
      netCost: rawMetric(metric, 'net_cost'),
      grossRevenue: num(metric.grossRevenue),
      orders: num(metric.orders),
      targetRoi: rawMetric(metric, 'roas_bid'),
      budgetUtilization: num(metric.budgetUtilization),
    }))
    const todaySample = gmvMaxRepo.listRealtimeSamples(campaign.id)
      .filter((sample) => (sample.localDate || sample.statDate) === today)
      .sort((a, b) => (b.sampledAt || b.syncedAt) - (a.sampledAt || a.syncedAt))[0]
    const latestStatus = new Map<string, { date: string; status?: string }>()
    for (const metric of creativeStatuses.get(campaign.id) || []) {
      const current = latestStatus.get(metric.itemKey)
      if (!current || metric.statDate > current.date) latestStatus.set(metric.itemKey, { date: metric.statDate, status: metric.status ?? undefined })
    }
    const creatives = latestStatus.size ? countCreativeStatuses([...latestStatus.values()].map((item) => item.status)) : undefined
    const changes: DiagnosisChange[] = [
      ...manualChanges.filter((change) => change.campaignId === campaign.id),
      ...systemChanges(campaign.id, since, audits),
    ]
    const raw = campaign.raw as Record<string, any> | undefined
    const bidType = String(raw?.bid_type || raw?.campaign?.bid_type || '').toUpperCase()
    const margin = settings.storeMargins[campaign.storeId] ?? null
    const series = days.slice(-14).map((day) => ({ date: day.date, cost: day.cost, grossRevenue: day.grossRevenue, roi: day.cost > 0 ? Math.round((day.grossRevenue / day.cost) * 100) / 100 : null, targetRoi: day.targetRoi ?? null }))
    diagnoses.push(withSeries(series, diagnoseCampaign({
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignType: campaign.campaignType,
      operationStatus: campaign.operationStatus,
      budget: num(campaign.budget),
      targetRoi: num(campaign.roasBid),
      maxDelivery: bidType === 'NO_BID' || (!num(campaign.roasBid) && bidType !== 'CUSTOM'),
      days,
      today: todaySample ? {
        cost: num(todaySample.cumulativeCost || todaySample.cost),
        grossRevenue: num(todaySample.cumulativeGrossRevenue || todaySample.grossRevenue),
        orders: num(todaySample.cumulativeOrders || todaySample.orders),
        asOf: todaySample.sampledAt || todaySample.syncedAt,
      } : undefined,
      changes,
      creatives,
      productMargin: input.productMarginFor(campaign),
      currency: binding?.currency,
      now,
    }, { ...settings.thresholds, defaultMargin: margin })))
  }

  const stores = [...new Map(bindings.map((binding) => [binding.storeId, {
    storeId: binding.storeId,
    storeName: binding.storeName,
    currency: binding.currency,
    timezone: binding.timezone,
    marginPercent: settings.storeMargins[binding.storeId] !== undefined ? Math.round(settings.storeMargins[binding.storeId] * 10_000) / 100 : null,
  }])).values()].filter((store) => !input.storeId || input.storeId === 'all' || store.storeId === input.storeId)

  const lastSyncedAt = Math.max(0, ...campaigns.map((campaign) => campaign.lastSyncedAt || 0))
  return {
    generatedAt: now,
    lastSyncedAt: lastSyncedAt || null,
    currency: stores.length === 1 ? stores[0].currency : stores.every((store) => store.currency === stores[0]?.currency) ? stores[0]?.currency : undefined,
    stores,
    setupNeeded: stores.filter((store) => store.marginPercent === null).map((store) => store.storeId),
    settings,
    summary: summarizeAccount(diagnoses),
    checklist: buildDailyChecklist(diagnoses),
    diagnoses: diagnoses.sort((a, b) => b.window.cost - a.window.cost),
    observing: diagnoses.filter((item) => item.learning.active && item.learning.since),
    recentChanges: manualChanges.filter((change) => campaigns.some((campaign) => campaign.id === change.campaignId)).slice(0, 20),
  }
}
