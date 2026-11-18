import type { CreatorHubContactStatus, CreatorHubSampleFulfillment, CreatorHubSampleStage } from '../../../../../shared/creatorHub'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** Which creator the detail dialog shows (header data is available before the detail loads). */
export type CreatorDetailTarget = { shopId: string; creatorId: string; handle: string; nickname: string; avatar?: string }

/** What the detail dialog saves: the local profile plus the contact fields. */
export type DetailSavePayload = { tags: string[]; note: string; blocked: boolean; contact: { zalo: string; phone: string; email: string; status: CreatorHubContactStatus } }

export const SAMPLE_STAGES: CreatorHubSampleStage[] = ['pending_review', 'ready_to_ship', 'shipped', 'awaiting_content', 'completed', 'cancelled']

export function stageTone(stage: CreatorHubSampleStage) {
  if (stage === 'completed') return 'green'
  if (stage === 'awaiting_content' || stage === 'shipped') return 'blue'
  if (stage === 'pending_review' || stage === 'ready_to_ship') return 'amber'
  return ''
}

export function fulfillmentTone(state: CreatorHubSampleFulfillment) {
  if (state === 'fulfilled') return 'green'
  if (state === 'overdue') return 'red'
  if (state === 'pending') return 'blue'
  return ''
}

export function rateTone(rate?: number) {
  if (rate == null) return ''
  if (rate >= 0.8) return 'green'
  if (rate >= 0.5) return 'amber'
  return 'red'
}

export function formatPercent(rate?: number, digits = 1) {
  return rate == null ? '-' : `${(rate * 100).toFixed(digits)}%`
}

export function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}K`
  return value.toLocaleString('en-US')
}

export function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('vi-VN')}₫`
}

export function formatDate(ts?: number) {
  if (!ts) return '-'
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatDateTime(ts?: number) {
  if (!ts) return '-'
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${formatDate(ts)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const KNOWN_ERRORS = [
  'COOKIE_JSON_INVALID', 'COOKIE_EMPTY', 'COOKIE_NO_SESSION', 'COOKIE_SET_FAILED', 'COOKIE_SHOP_MISMATCH', 'LOGIN_EXPIRED',
  'SECURE_STORAGE_UNAVAILABLE', 'SHOP_NOT_FOUND', 'SYNC_RUNNING', 'SYNC_INTERRUPTED', 'SYNC_FAILED', 'COST_INVALID', 'PRODUCT_REQUIRED', 'SHOP_NAME_REQUIRED', 'CREATOR_REQUIRED', 'DISCOVER_RUNNING', 'PHONE_INVALID', 'EMAIL_INVALID', 'TEMPLATE_REQUIRED',
]

/** Maps `CREATOR_HUB_*` error codes from the main process to localised text. */
export function creatorHubError(error: unknown, t: Translate) {
  const raw = error instanceof Error ? error.message : String(error || '')
  const message = raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  const match = message.match(/CREATOR_HUB_([A-Z_]+?)(?::(.*))?$/)
  if (!match) return message
  const [, code, detail] = match
  if (KNOWN_ERRORS.includes(code)) return t(`creatorHub.errors.${code}`, { detail: detail || '' })
  if (code.startsWith('API_') || code.startsWith('SAMPLE_API_ERROR')) return t('creatorHub.errors.API', { detail: `${code}${detail ? `: ${detail}` : ''}` })
  return message
}
