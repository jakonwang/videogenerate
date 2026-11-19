import { cleanAiText, extractModelMessageContent } from './aiResponse'
import { resolveApifoxHubCredentials } from './apifoxProfile'
import type { ModelCredentials } from './types'

const VECTOR_ENGINE_LABEL = 'VectorEngine'

function baseUrl(credentials: ModelCredentials) {
  return String(resolveApifoxHubCredentials(credentials, 'chat')?.baseUrl || '').trim().replace(/\/+$/, '')
}

function apiKey(credentials: ModelCredentials) {
  const cfg = resolveApifoxHubCredentials(credentials, 'chat')
  const key = String(cfg?.apiKey || '').trim()
  if (!cfg?.enabled || !key) throw new Error(`Missing ${VECTOR_ENGINE_LABEL} chat model or API Key`)
  return key
}

function uniqueModels(candidates: string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const raw of candidates) {
    const model = String(raw || '').trim()
    if (!model || seen.has(model)) continue
    seen.add(model)
    normalized.push(model)
  }
  return normalized
}

function buildChatModelCandidates(configuredModel: string) {
  const model = String(configuredModel || '').trim()
  const lower = model.toLowerCase()
  if (lower.includes('gemini')) {
    return uniqueModels([model, 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4.1-mini'])
  }
  if (lower.includes('gpt')) {
    return uniqueModels([model, 'gpt-4.1-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'])
  }
  return uniqueModels([model, 'gpt-4.1-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'])
}

function isModelChannelUnavailable(status: number, text: string) {
  const normalized = String(text || '')
  if (status === 503 && /no available channel for model/i.test(normalized)) return true
  if (status === 503 && /channel not found/i.test(normalized)) return true
  if ((status === 400 || status === 404 || status === 429) && /model[_\s-]*not[_\s-]*found|model .* does not exist/i.test(normalized)) return true
  return false
}

/** 上游临时忙（排队满、限流、网关错误）：等一会儿重试通常就好 */
function isUpstreamBusy(status: number, text: string) {
  if (isModelChannelUnavailable(status, text)) return false
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529) return true
  return /saturated|overloaded|rate[\s_-]*limit|too many requests|try again later|server is busy/i.test(String(text || ''))
}

/** 从上游返回里取出可读的错误说明（JSON 的 error.message / message），取不到就截一段原文 */
function upstreamErrorMessage(text: string) {
  try {
    const json = JSON.parse(text)
    const message = json?.error?.message || json?.message || json?.error
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 200)
  } catch {
    // not json
  }
  return String(text || '').trim().slice(0, 200)
}

/** 忙时重试前等多久（毫秒）；上游给了 Retry-After 就照它（最多 10 秒） */
let busyRetryDelaysMs = [2000, 5000]
export function setChatBusyRetryDelaysForTests(delays: number[]) {
  busyRetryDelaysMs = delays
}

function parseChatContent(endpointStyle: string, text: string) {
  if (endpointStyle === 'gemini_native') {
    try {
      const json = JSON.parse(text)
      return cleanAiText(json?.candidates?.[0]?.content?.parts?.map((item: any) => item?.text || '').join('\n'))
    } catch {
      return cleanAiText(text)
    }
  }
  if (endpointStyle === 'anthropic_native') {
    try {
      const json = JSON.parse(text)
      return cleanAiText(json?.content?.map((item: any) => item?.text || '').join('\n'))
    } catch {
      return cleanAiText(text)
    }
  }
  return cleanAiText(extractModelMessageContent(text))
}

export type ChatImageInput = {
  /** Short caption sent right before the image, e.g. "shot_1 start frame". */
  label?: string
  mimeType: string
  base64: string
}

export async function generateChatCompletion(input: {
  credentials: ModelCredentials
  system?: string
  prompt: string
  /** Optional images for multimodal models, sent after the prompt in order. */
  images?: ChatImageInput[]
  model?: string
  timeoutMs?: number
}) {
  const images = (input.images ?? []).filter((item) => item && item.base64 && item.mimeType)
  const cfg = resolveApifoxHubCredentials(input.credentials, 'chat')!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const modelCandidates = buildChatModelCandidates(String(input.model || cfg.chatModel || '').trim())
  let lastFailureStatus = 0
  let lastFailureText = ''

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index]
    const isLastCandidate = index === modelCandidates.length - 1
    let url = `${root}/v1/chat/completions`
    let headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      'x-api-key': key,
      'Content-Type': 'application/json',
    }
    let body: any = {
      model,
      messages: [
        ...(input.system ? [{ role: 'system', content: input.system }] : []),
        {
          role: 'user',
          content: images.length
            ? [
                { type: 'text', text: input.prompt },
                ...images.flatMap((image) => [
                  ...(image.label ? [{ type: 'text', text: image.label }] : []),
                  { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
                ]),
              ]
            : input.prompt,
        },
      ],
    }

    if (cfg.chatEndpointStyle === 'gemini_native') {
      url = `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent`
      headers = { 'x-goog-api-key': key, 'Content-Type': 'application/json' }
      body = {
        system_instruction: input.system ? { parts: [{ text: input.system }] } : undefined,
        contents: [
          {
            role: 'user',
            parts: [
              { text: input.prompt },
              ...images.flatMap((image) => [
                ...(image.label ? [{ text: image.label }] : []),
                { inline_data: { mime_type: image.mimeType, data: image.base64 } },
              ]),
            ],
          },
        ],
      }
    } else if (cfg.chatEndpointStyle === 'anthropic_native') {
      url = `${root}/v1/messages`
      headers = {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      }
      body = {
        model,
        system: input.system || undefined,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: images.length
              ? [
                  { type: 'text', text: input.prompt },
                  ...images.flatMap((image) => [
                    ...(image.label ? [{ type: 'text', text: image.label }] : []),
                    { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } },
                  ]),
                ]
              : input.prompt,
          },
        ],
      }
    }

    const timeoutMs = Math.max(0, Number(input.timeoutMs || 0))
    let res!: Response
    let text = ''
    // 上游临时忙（如 429「upstream load is saturated」）：等一会儿自动重试，最多 1 + busyRetryDelaysMs.length 次
    for (let attempt = 0; ; attempt += 1) {
      const controller = timeoutMs ? new AbortController() : undefined
      const timer = controller
        ? setTimeout(() => controller.abort(new Error(`${VECTOR_ENGINE_LABEL} chat request timed out after ${timeoutMs}ms`)), timeoutMs)
        : undefined
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller?.signal,
        })
        text = await res.text()
      } catch (error) {
        if (controller?.signal.aborted) {
          throw new Error(`${VECTOR_ENGINE_LABEL} chat request timed out after ${timeoutMs}ms`)
        }
        throw error
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (res.ok || !isUpstreamBusy(res.status, text) || attempt >= busyRetryDelaysMs.length) break
      const retryAfterSec = Number(res.headers?.get?.('retry-after') || 0)
      const waitMs = retryAfterSec > 0 ? Math.min(10_000, retryAfterSec * 1000) : busyRetryDelaysMs[attempt]
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
    if (!res.ok) {
      lastFailureStatus = res.status
      lastFailureText = text
      // 只有「这个模型的通道不存在」才换备用模型；忙的时候只重试后台设置的模型，不换成别的模型
      // （换过去的模型不是管理员选的，平台对它的转换也可能出错，如 HTTP 400「input json is empty」）
      if (!isLastCandidate && isModelChannelUnavailable(res.status, text)) continue
      if (isUpstreamBusy(res.status, text)) {
        throw new Error(`AI 服务现在太忙（模型 ${model}，HTTP ${res.status}），已自动重试 ${busyRetryDelaysMs.length} 次仍未成功，请过一两分钟再试。上游说明：${upstreamErrorMessage(text)}`)
      }
      throw new Error(`${VECTOR_ENGINE_LABEL} AI 请求失败（模型 ${model}，HTTP ${res.status}）：${upstreamErrorMessage(text)}`)
    }

    return {
      provider: 'apifox_hub',
      model,
      endpointStyle: cfg.chatEndpointStyle,
      baseUrl: cfg.baseUrl,
      content: parseChatContent(cfg.chatEndpointStyle, text),
      raw: text,
      imageCount: images.length,
    }
  }

  throw new Error(`${VECTOR_ENGINE_LABEL} AI 请求失败（HTTP ${lastFailureStatus || 503}）：${upstreamErrorMessage(lastFailureText || 'all fallback chat models unavailable')}`)
}
