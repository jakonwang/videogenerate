import { createHmac } from 'node:crypto'
import type { Brief } from './types'

/**
 * Pushes briefs to a Feishu / Lark group through a custom bot webhook
 * (群机器人 → 自定义机器人). Only the official bot hosts are accepted so a
 * mistyped or pasted URL can never send brief contents somewhere else.
 */

export type FeishuPushSettings = {
  enabled: boolean
  webhookUrl: string
  secret: string
  daily: boolean
  weekly: boolean
}

export const DEFAULT_FEISHU_SETTINGS: FeishuPushSettings = {
  enabled: false,
  webhookUrl: '',
  secret: '',
  daily: true,
  weekly: true,
}

const ALLOWED_HOSTS = new Set(['open.feishu.cn', 'open.larksuite.com'])
const HOOK_PATH = /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]+$/

export function validateFeishuWebhook(raw: string): string | null {
  const value = String(raw || '').trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || !HOOK_PATH.test(url.pathname)) return null
  return `${url.origin}${url.pathname}`
}

export function normalizeFeishuSettings(raw: Partial<FeishuPushSettings> | undefined): FeishuPushSettings {
  return {
    enabled: Boolean(raw?.enabled ?? DEFAULT_FEISHU_SETTINGS.enabled),
    webhookUrl: validateFeishuWebhook(String(raw?.webhookUrl || '')) || '',
    secret: String(raw?.secret || '').trim().slice(0, 200),
    daily: raw?.daily ?? DEFAULT_FEISHU_SETTINGS.daily,
    weekly: raw?.weekly ?? DEFAULT_FEISHU_SETTINGS.weekly,
  }
}

/** Feishu signing: key = `${timestamp}\n${secret}`, HMAC-SHA256 over an empty message, base64. */
export function signFeishu(timestamp: number, secret: string) {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64')
}

const LEVEL_ICON: Record<string, string> = { error: '🔴', warning: '🟠', ok: '🟢' }
const GROWTH_ICON = '📈'

export function buildBriefCard(brief: Pick<Brief, 'kind' | 'headline' | 'items' | 'summary' | 'periodKey' | 'metrics'>) {
  const title = brief.kind === 'weekly' ? 'Klipmill 每周复盘' : 'Klipmill 每日简报'
  const lines = brief.items.slice(0, 12).map((item) => {
    const icon = item.kind === 'growth' ? GROWTH_ICON : LEVEL_ICON[item.level] || '•'
    const detail = item.detail ? `：${item.detail}` : ''
    return `${icon} **${item.title}**${detail}`
  })
  const elements: Array<Record<string, unknown>> = [
    { tag: 'div', text: { tag: 'lark_md', content: `**${brief.headline}**` } },
  ]
  if (brief.metrics) elements.push({ tag: 'div', text: { tag: 'lark_md', content: `📊 ${brief.metrics}` } })
  if (brief.summary) elements.push({ tag: 'div', text: { tag: 'lark_md', content: brief.summary } })
  if (lines.length) {
    elements.push({ tag: 'hr' })
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } })
  }
  elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: `${brief.periodKey} · 打开 Klipmill 工作台处理` }] })
  const problems = brief.items.some((item) => item.level === 'error') ? 'red' : brief.items.some((item) => item.level === 'warning') ? 'orange' : 'green'
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: { template: brief.kind === 'weekly' ? 'blue' : problems, title: { tag: 'plain_text', content: title } },
      elements,
    },
  }
}

export async function sendFeishuMessage(settings: Pick<FeishuPushSettings, 'webhookUrl' | 'secret'>, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch) {
  const url = validateFeishuWebhook(settings.webhookUrl)
  if (!url) throw new Error('飞书 Webhook 地址无效，请粘贴群机器人的完整 Webhook 地址')
  const payload: Record<string, unknown> = { ...body }
  if (settings.secret) {
    const timestamp = Math.floor(Date.now() / 1000)
    payload.timestamp = String(timestamp)
    payload.sign = signFeishu(timestamp, settings.secret)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    let json: { code?: number; StatusCode?: number; msg?: string; StatusMessage?: string } = {}
    try {
      json = JSON.parse(text)
    } catch {
      // Non-JSON replies are treated by HTTP status only.
    }
    const code = json.code ?? json.StatusCode ?? 0
    if (!response.ok || code !== 0) {
      throw new Error(`飞书返回错误：${json.msg || json.StatusMessage || `HTTP ${response.status}`}`)
    }
    return { ok: true as const }
  } finally {
    clearTimeout(timer)
  }
}

export async function pushBriefToFeishu(settings: FeishuPushSettings, brief: Brief, fetchImpl?: typeof fetch) {
  if (!settings.enabled || !settings.webhookUrl) return { skipped: true as const }
  if (brief.kind === 'daily' && !settings.daily) return { skipped: true as const }
  if (brief.kind === 'weekly' && !settings.weekly) return { skipped: true as const }
  await sendFeishuMessage(settings, buildBriefCard(brief), fetchImpl)
  return { skipped: false as const }
}
