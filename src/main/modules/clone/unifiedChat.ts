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
  if (!cfg?.enabled || !key) throw new Error(`未启用 ${VECTOR_ENGINE_LABEL} 对话模型或缺少 API Key`)
  return key
}

export async function generateChatCompletion(input: {
  credentials: ModelCredentials
  system?: string
  prompt: string
}) {
  const cfg = resolveApifoxHubCredentials(input.credentials, 'chat')!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)

  let url = `${root}/v1/chat/completions`
  let headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'x-api-key': key,
    'Content-Type': 'application/json',
  }
  let body: any = {
    model: cfg.chatModel,
    messages: [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content: input.prompt },
    ],
  }

  if (cfg.chatEndpointStyle === 'gemini_native') {
    url = `${root}/v1beta/models/${encodeURIComponent(cfg.chatModel)}:generateContent`
    headers = { 'x-goog-api-key': key, 'Content-Type': 'application/json' }
    body = {
      system_instruction: input.system ? { parts: [{ text: input.system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
    }
  } else if (cfg.chatEndpointStyle === 'anthropic_native') {
    url = `${root}/v1/messages`
    headers = {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }
    body = {
      model: cfg.chatModel,
      system: input.system || undefined,
      max_tokens: 4096,
      messages: [{ role: 'user', content: input.prompt }],
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${VECTOR_ENGINE_LABEL} 对话请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)

  let content = ''
  if (cfg.chatEndpointStyle === 'gemini_native') {
    try {
      const json = JSON.parse(text)
      content = cleanAiText(json?.candidates?.[0]?.content?.parts?.map((item: any) => item?.text || '').join('\n'))
    } catch {
      content = cleanAiText(text)
    }
  } else if (cfg.chatEndpointStyle === 'anthropic_native') {
    try {
      const json = JSON.parse(text)
      content = cleanAiText(json?.content?.map((item: any) => item?.text || '').join('\n'))
    } catch {
      content = cleanAiText(text)
    }
  } else {
    content = cleanAiText(extractModelMessageContent(text))
  }

  return {
    provider: 'apifox_hub',
    model: cfg.chatModel,
    endpointStyle: cfg.chatEndpointStyle,
    baseUrl: cfg.baseUrl,
    content,
    raw: text,
  }
}
