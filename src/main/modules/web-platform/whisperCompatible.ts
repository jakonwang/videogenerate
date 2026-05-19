import { basename } from 'node:path'

export type WhisperCompatibleConfig = {
  baseUrl: string
  apiKey?: string
  model?: string
  requestTimeoutMs: number
}

export type WhisperCue = {
  id: string
  startMs: number
  endMs: number
  text: string
}

type JsonRecord = Record<string, unknown>

function normalizeBaseUrl(input?: string) {
  return String(input || '').trim().replace(/\/+$/, '')
}

export function isWhisperCompatibleConfigured(config: Partial<WhisperCompatibleConfig> | null | undefined) {
  return Boolean(normalizeBaseUrl(config?.baseUrl))
}

function asNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toCueId(index: number, raw?: unknown) {
  const text = String(raw || '').trim()
  return text || `cue-${index + 1}`
}

export async function transcribeWithWhisperCompatible(
  config: WhisperCompatibleConfig,
  input: { filePath: string; language?: string },
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(10_000, config.requestTimeoutMs || 120_000))
  try {
    const form = new FormData()
    const buffer = await import('node:fs/promises').then((mod) => mod.readFile(input.filePath))
    form.append('file', new Blob([buffer]), basename(input.filePath))
    form.append('model', String(config.model || 'whisper-1'))
    form.append('response_format', 'verbose_json')
    if (String(input.language || '').trim()) form.append('language', String(input.language || '').trim())
    const headers = new Headers()
    if (String(config.apiKey || '').trim()) headers.set('Authorization', `Bearer ${String(config.apiKey).trim()}`)
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    })
    const payload = (await response.json().catch(() => ({}))) as JsonRecord
    if (!response.ok) {
      throw new Error(String(payload.error || payload.message || `ASR 请求失败: ${response.status}`))
    }
    const segments = Array.isArray(payload.segments) ? payload.segments : []
    const cues: WhisperCue[] = segments
      .map((segment, index) => {
        const item = segment as JsonRecord
        const text = String(item.text || '').trim()
        if (!text) return null
        return {
          id: toCueId(index, item.id),
          startMs: Math.max(0, Math.round(asNumber(item.start) * 1000)),
          endMs: Math.max(0, Math.round(asNumber(item.end) * 1000)),
          text,
        } satisfies WhisperCue
      })
      .filter(Boolean) as WhisperCue[]
    return {
      language: String(payload.language || input.language || '').trim() || undefined,
      cues,
      raw: payload,
    }
  } finally {
    clearTimeout(timer)
  }
}
