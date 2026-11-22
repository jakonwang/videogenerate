/**
 * 每日自动驾驶：每天按投放数据生成「今日待批准」，用户点同意（或自动模式下直接执行）。
 * 主进程和界面共用的类型、默认设置和排序规则。
 */

export type AutopilotMode = 'suggest' | 'auto'
export type AutopilotSettings = {
  enabled: boolean
  /** 每天几点生成计划（电脑时间） */
  hour: number
  /** 每天最多执行几个生成任务（提醒类不算） */
  maxTasksPerDay: number
  /** suggest：只建议、等批准；auto：在额度内直接执行 */
  mode: AutopilotMode
  /** 把审核通过的成片送进发布中心（只建草稿，不会自动提交） */
  includePublish: boolean
}

export const AUTOPILOT_DEFAULTS: AutopilotSettings = { enabled: false, hour: 9, maxTasksPerDay: 3, mode: 'suggest', includePublish: true }

export function normalizeAutopilotSettings(input: Partial<AutopilotSettings> = {}): AutopilotSettings {
  const int = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Math.round(Number(value))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }
  return {
    enabled: Boolean(input.enabled),
    hour: int(input.hour, AUTOPILOT_DEFAULTS.hour, 0, 23),
    maxTasksPerDay: int(input.maxTasksPerDay, AUTOPILOT_DEFAULTS.maxTasksPerDay, 1, 20),
    mode: input.mode === 'auto' ? 'auto' : 'suggest',
    includePublish: input.includePublish !== false,
  }
}

/**
 * stop_loss：投放在亏钱（只提醒，去 GMV MAX 处理，不自动改投放）
 * replenish：主力素材在衰退 → 照它补一批变体
 * scale_winner：有素材明显跑赢 → 照它多做几条
 * more_content：在投素材太少 → 照花费最高的素材补
 * publish_approved：审核通过还没发的成片 → 送进发布中心
 */
export type AutopilotKind = 'stop_loss' | 'replenish' | 'scale_winner' | 'more_content' | 'publish_approved'
export const AUTOPILOT_PRIORITY: AutopilotKind[] = ['stop_loss', 'replenish', 'scale_winner', 'more_content', 'publish_approved']
export const AUTOPILOT_KIND_LABEL: Record<AutopilotKind, string> = {
  stop_loss: '止损提醒',
  replenish: '补货',
  scale_winner: '放大爆款',
  more_content: '补素材',
  publish_approved: '送去发布',
}

export type AutopilotProposalStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'acknowledged'

export type AutopilotProposal = {
  id: string
  kind: AutopilotKind
  productId?: string
  productName?: string
  creativeId?: string
  title: string
  /** 为什么建议做这件事（带数字的大白话） */
  reason: string
  /** plan：交给 AI 制片人执行；route：提醒，打开某个页面自己处理 */
  action: { type: 'plan'; source: 'project' | 'creative' | 'approved'; projectId?: string } | { type: 'route'; route: string }
  status: AutopilotProposalStatus
  /** 自动模式下由系统批准 */
  auto?: boolean
  runId?: string
  conversationId?: string
  error?: string
  decidedAt?: number
}

export type AutopilotDay = { day: string; generatedAt: number; proposals: AutopilotProposal[] }

export const isPlanProposal = (proposal: AutopilotProposal) => proposal.action.type === 'plan'
