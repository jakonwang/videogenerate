import { createHash } from 'node:crypto'
import {
  GMV_DIGEST_MAX_CAMPAIGNS,
  GMV_DIGEST_MAX_RECOMMENDATIONS,
  numberOf,
  type GmvDigestTotals,
  type SyncGmvDecision,
  type SyncGmvDigest,
} from '../../../shared/cloud/selling'

/**
 * GMV Max ↔ 手机：电脑端生成摘要给手机看；手机上的批准 / 拒绝在这里交给原有的执行流程。
 * 依赖以接口注入，测试时不用加载整个 GMV Max 模块。
 */

type Dashboard = {
  connection?: { name?: string; state?: string } | null
  campaigns: Array<{ id: string; name: string; campaignType: 'PRODUCT' | 'LIVE'; operationStatus: string; budget: string; roasBid: string }>
  dailyMetrics: Array<{ campaignId: string; statDate: string; cost: string; grossRevenue: string; orders: string }>
  recommendations: Array<{
    id: string
    campaignId: string
    kind: 'scale_up' | 'scale_down'
    actionType?: string
    status: string
    risk: 'low' | 'medium' | 'high'
    currentBudget: string
    proposedBudget: string
    currentRoasBid: string
    proposedRoasBid: string
    reason: string
    projectedGmvDelta?: string
    confidence?: number
    createdAt: number
  }>
  scheduler?: { emergencyStopped?: boolean }
}

export type GmvService = {
  getDashboard(input?: { startDate?: string; endDate?: string; includeCreativeMetrics?: boolean }): Promise<Dashboard>
  approveRecommendation(id: string): Promise<{ status?: string } | unknown>
  rejectRecommendation(id: string): Promise<{ status?: string } | unknown>
}

function totalsOf(rows: Dashboard['dailyMetrics']): GmvDigestTotals {
  const spend = rows.reduce((sum, row) => sum + numberOf(row.cost), 0)
  const gmv = rows.reduce((sum, row) => sum + numberOf(row.grossRevenue), 0)
  const orders = rows.reduce((sum, row) => sum + numberOf(row.orders), 0)
  return { spend: round(spend), gmv: round(gmv), orders: Math.round(orders), roi: spend > 0 ? round(gmv / spend) : 0 }
}

const round = (value: number) => Math.round(value * 100) / 100

export async function buildGmvDigest(service: GmvService, now = Date.now()): Promise<SyncGmvDigest> {
  const dashboard = await service.getDashboard({ includeCreativeMetrics: false })
  const dates = dashboard.dailyMetrics.map((row) => row.statDate).sort()
  const names = new Map(dashboard.campaigns.map((campaign) => [campaign.id, campaign.name]))
  const campaigns = dashboard.campaigns
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      type: campaign.campaignType,
      status: campaign.operationStatus,
      budget: campaign.budget,
      roasBid: campaign.roasBid,
      ...totalsOf(dashboard.dailyMetrics.filter((row) => row.campaignId === campaign.id)),
    }))
    .sort((a, b) => b.spend - a.spend)
  const pending = dashboard.recommendations.filter((item) => item.status === 'pending')
  return {
    generatedAt: now,
    connected: dashboard.connection?.state === 'connected',
    accountName: dashboard.connection?.name,
    emergencyStopped: Boolean(dashboard.scheduler?.emergencyStopped),
    range: { startDate: dates[0] ?? '', endDate: dates[dates.length - 1] ?? '' },
    totals: totalsOf(dashboard.dailyMetrics),
    campaigns: campaigns.slice(0, GMV_DIGEST_MAX_CAMPAIGNS),
    pending: pending
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, GMV_DIGEST_MAX_RECOMMENDATIONS)
      .map((item) => ({
        id: item.id,
        campaignId: item.campaignId,
        campaignName: names.get(item.campaignId) ?? item.campaignId,
        kind: item.kind,
        actionType: item.actionType || 'budget',
        risk: item.risk,
        currentBudget: item.currentBudget,
        proposedBudget: item.proposedBudget,
        currentRoasBid: item.currentRoasBid,
        proposedRoasBid: item.proposedRoasBid,
        reason: item.reason.slice(0, 400),
        projectedGmvDelta: item.projectedGmvDelta,
        confidence: item.confidence,
        createdAt: item.createdAt,
      })),
    pendingCount: pending.length,
  }
}

/** 摘要内容的指纹（不含生成时间），没变化就不重复上传 */
export function digestFingerprint(digest: SyncGmvDigest) {
  const { generatedAt: _generatedAt, ...content } = digest
  return createHash('sha1').update(JSON.stringify(content)).digest('hex')
}

/**
 * 执行手机上做出的决定。只处理还没有结果的记录；失败（含急停、动作锁）把原因写回给手机看。
 */
export async function applyGmvDecision(service: GmvService, recommendationId: string, decision: SyncGmvDecision): Promise<SyncGmvDecision> {
  const now = Date.now()
  try {
    if (decision.decision === 'reject') {
      await service.rejectRecommendation(recommendationId)
      return { ...decision, result: 'rejected', resultAt: now, error: undefined }
    }
    const outcome = (await service.approveRecommendation(recommendationId)) as { status?: string } | undefined
    const status = outcome?.status
    if (status === 'failed') return { ...decision, result: 'failed', resultAt: now, error: '执行失败，请在电脑端「GMV Max」查看原因' }
    return { ...decision, result: 'executed', resultAt: now, error: undefined }
  } catch (error) {
    const message = (error as Error)?.message || String(error)
    const friendly = /emergency stop/i.test(message)
      ? '电脑端开启了急停，暂不执行'
      : /PENDING_VERIFICATION/.test(message)
        ? '这个计划还有一个动作在等待确认，稍后再试'
        : /does not exist|cannot be approved/i.test(message)
          ? '这条建议已失效（可能已在电脑端处理）'
          : message.slice(0, 200)
    return { ...decision, result: 'failed', resultAt: now, error: friendly }
  }
}
