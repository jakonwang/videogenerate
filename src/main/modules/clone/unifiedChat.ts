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

export async function generateChatCompletion(input: {
  credentials: ModelCredentials
  system?: string
  prompt: string
  model?: string
}) {
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
        { role: 'user', content: input.prompt },
      ],
    }

    if (cfg.chatEndpointStyle === 'gemini_native') {
      url = `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent`
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
        model,
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
    if (!res.ok) {
      lastFailureStatus = res.status
      lastFailureText = text
      if (!isLastCandidate && isModelChannelUnavailable(res.status, text)) continue
      throw new Error(`${VECTOR_ENGINE_LABEL} chat request failed HTTP ${res.status}: ${text.slice(0, 500)}`)
    }

    return {
      provider: 'apifox_hub',
      model,
      endpointStyle: cfg.chatEndpointStyle,
      baseUrl: cfg.baseUrl,
      content: parseChatContent(cfg.chatEndpointStyle, text),
      raw: text,
    }
  }

  throw new Error(
    `${VECTOR_ENGINE_LABEL} chat request failed HTTP ${lastFailureStatus || 503}: ${String(lastFailureText || 'all fallback chat models unavailable').slice(0, 500)}`,
  )
}
