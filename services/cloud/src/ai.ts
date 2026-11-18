import type { CloudDb } from './db'
import { badRequest, CloudError } from './security'
import type { ManagedSoftwareSettings } from '../../../src/shared/cloud/managedSettings'
import type { AiChatRequest, AiChatResponse, AiUsageResponse } from '../../../src/shared/cloud/ai'
import { AI_MAX_IMAGES, AI_MAX_PROMPT_CHARS } from '../../../src/shared/cloud/ai'

/**
 * 云端 AI 网关：手机 App 不保存任何平台密钥，由云端用后台「软件设置」里的平台和模型代为调用。
 * 每次调用都校验会员、按账号限流，并按天记录用量（以后计费 / 对账用）。
 */

const DEFAULT_BASE_URL: Partial<Record<string, string>> = { grsai: 'https://grsaiapi.com' }
const DEFAULT_CHAT_MODEL = 'gpt-4.1-mini'
const DAY_MS = 24 * 60 * 60 * 1000

type ReadFile = (userId: string, fileId: string) => { mime: string; body: Buffer }

/** 服务器复刻引擎的 AI 调用记在 ai_usage 里的用途名 */
export const CLONE_ENGINE_PURPOSE = 'clone-engine'

export function createAiService(deps: {
  db: CloudDb
  now: () => number
  readManagedSettings: () => ManagedSoftwareSettings
  readFile: ReadFile
  perMinute: number
  perDay: number
  /** 服务器复刻引擎每个账号每天最多向 AI 平台发起几次生成请求，0 = 不限（单独计数，不占上面的 AI 次数） */
  cloneEnginePerDay?: number
  fetchImpl?: typeof fetch
}) {
  const { db, now } = deps
  const fetchImpl = deps.fetchImpl ?? fetch
  const recent = new Map<string, number[]>()

  const day = (at: number) => new Date(at).toISOString().slice(0, 10)

  function usedToday(userId: string): number {
    const row = db.prepare('SELECT COALESCE(SUM(calls), 0) AS calls FROM ai_usage WHERE user_id = ? AND day = ? AND purpose != ?').get(userId, day(now()), CLONE_ENGINE_PURPOSE) as { calls: number }
    return Number(row.calls)
  }

  function cloneEngineUsedToday(userId: string): number {
    const row = db.prepare('SELECT COALESCE(SUM(calls), 0) AS calls FROM ai_usage WHERE user_id = ? AND day = ? AND purpose = ?').get(userId, day(now()), CLONE_ENGINE_PURPOSE) as { calls: number }
    return Number(row.calls)
  }

  /** 服务器复刻引擎每次向 AI 平台发起生成前调用：超过每日上限就拒绝，否则记一次 */
  function meterCloneEngine(userId: string) {
    const limit = deps.cloneEnginePerDay ?? 0
    if (limit > 0 && cloneEngineUsedToday(userId) >= limit) {
      throw new CloudError('RATE_LIMITED', `今天服务器复刻的 AI 生成次数已用完（每天 ${limit} 次），明天再来，或在电脑端继续`, 429)
    }
    record(userId, CLONE_ENGINE_PURPOSE, true)
  }

  function assertQuota(userId: string) {
    const t = now()
    const windowStart = t - 60_000
    const calls = (recent.get(userId) ?? []).filter((at) => at > windowStart)
    if (calls.length >= deps.perMinute) throw new CloudError('RATE_LIMITED', '操作太频繁，请稍后再试', 429)
    if (usedToday(userId) >= deps.perDay) throw new CloudError('RATE_LIMITED', `今天的 AI 次数已用完（每天 ${deps.perDay} 次），明天再来`, 429)
    calls.push(t)
    recent.set(userId, calls)
  }

  function record(userId: string, purpose: string, ok: boolean) {
    db.prepare(`
      INSERT INTO ai_usage (user_id, day, purpose, calls, failures) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (user_id, day, purpose) DO UPDATE SET calls = calls + 1, failures = failures + excluded.failures
    `).run(userId, day(now()), purpose, ok ? 0 : 1)
  }

  function chatRoute() {
    const settings = deps.readManagedSettings()
    if (!settings.enabled) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置 AI 服务，请联系客服', 503)
    const platform = settings.capabilities.chat.platform
    const credential = settings.platforms[platform]
    const baseUrl = (credential?.baseUrl || DEFAULT_BASE_URL[platform] || '').replace(/\/+$/, '')
    if (!credential?.apiKey || !baseUrl) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置对话模型的平台密钥，请联系客服', 503)
    return { baseUrl, apiKey: credential.apiKey, model: settings.capabilities.chat.model || DEFAULT_CHAT_MODEL }
  }

  async function chat(userId: string, input: AiChatRequest): Promise<AiChatResponse> {
    const prompt = String(input?.prompt || '').trim()
    if (!prompt) throw badRequest('缺少提示词')
    if (prompt.length > AI_MAX_PROMPT_CHARS) throw badRequest('提示词过长')
    const system = String(input.system || '').trim().slice(0, 4000)
    const imageIds = Array.isArray(input.imageFileIds) ? input.imageFileIds.map(String).slice(0, AI_MAX_IMAGES) : []
    const purpose = String(input.purpose || 'chat').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'chat'

    const route = chatRoute()
    assertQuota(userId)
    // Images come from the account's own synced files, so one user can never read another's.
    const images = imageIds.map((fileId) => {
      const file = deps.readFile(userId, fileId)
      return `data:${file.mime};base64,${file.body.toString('base64')}`
    })

    let ok = false
    try {
      const res = await fetchImpl(`${route.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}`, 'x-api-key': route.apiKey },
        body: JSON.stringify({
          model: route.model,
          stream: false,
          temperature: 0.4,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            {
              role: 'user',
              content: images.length
                ? [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
                : prompt,
            },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      const text = await res.text()
      if (!res.ok) {
        console.warn('[cloud-ai] provider error', res.status, text.slice(0, 300))
        throw new CloudError('INTERNAL', `AI 服务暂时不可用（HTTP ${res.status}），请稍后再试`, 502)
      }
      let content = ''
      try {
        const json = JSON.parse(text)
        const message = json?.choices?.[0]?.message?.content
        content = Array.isArray(message) ? message.map((part: any) => part?.text || '').join('') : String(message ?? '')
      } catch {
        content = ''
      }
      content = content.replace(/^```[a-z]*\n?|```$/gim, '').trim()
      if (!content) throw new CloudError('INTERNAL', 'AI 没有返回内容，请重试', 502)
      ok = true
      return { content, model: route.model }
    } catch (error) {
      if (error instanceof CloudError) throw error
      throw new CloudError('INTERNAL', `AI 服务连接失败：${(error as Error).message}`, 502)
    } finally {
      record(userId, purpose, ok)
    }
  }

  function usage(userId: string): AiUsageResponse {
    return {
      usedToday: usedToday(userId),
      dailyLimit: deps.perDay,
      resetsAt: Math.ceil(now() / DAY_MS) * DAY_MS,
      cloneEngine: { usedToday: cloneEngineUsedToday(userId), dailyLimit: deps.cloneEnginePerDay ?? 0 },
    }
  }

  return { chat, usage, quota: { assert: assertQuota, record }, cloneEngine: { meter: meterCloneEngine, usedToday: cloneEngineUsedToday } }
}

export type AiService = ReturnType<typeof createAiService>
