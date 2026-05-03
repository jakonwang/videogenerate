import type { ModelCredentials } from './types'

export type GrsAiResult = {
  outputUrl: string
  task: any
}

export type GrsAiCredits = {
  available?: number
  raw: any
}

const DEFAULT_GRS_HOST = 'https://grsaiapi.com'

export function grsHost(credentials: ModelCredentials) {
  return String(credentials.grsaiHost || DEFAULT_GRS_HOST).replace(/\/+$/, '')
}

export function requireGrsKey(credentials: ModelCredentials) {
  const key = String(credentials.grsaiApiKey || '').trim()
  if (!key) throw new Error('未配置 GRS.AI API Key')
  return key
}

export function isPublicHttpUrl(v: string | undefined) {
  return /^https?:\/\//i.test(String(v || '').trim())
}

function grsHeaders(credentials: ModelCredentials, key: string) {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function postJson(url: string, key: string, body: any, credentials?: ModelCredentials) {
  const res = await fetch(url, {
    method: 'POST',
    headers: credentials ? grsHeaders(credentials, key) : { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text().catch(() => '')
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${res.status} ${text || res.statusText}`)
  return json
}

export function pickTaskId(json: any) {
  return String(json?.id ?? json?.taskId ?? json?.task_id ?? json?.data?.id ?? json?.data?.taskId ?? json?.data?.task_id ?? '').trim()
}

export function pickStatus(json: any) {
  return String(json?.status ?? json?.data?.status ?? '').toLowerCase()
}

export function pickError(json: any) {
  const err = json?.error ?? json?.failure_reason ?? json?.data?.error ?? json?.data?.failure_reason
  if (typeof err === 'string') return err.trim()
  if (err && typeof err === 'object') return [err.code, err.message].filter(Boolean).map(String).join(': ')
  return String(json?.msg ?? json?.message ?? '').trim()
}

export function pickOutputUrl(json: any): string {
  const candidates = [
    json?.url,
    json?.output,
    json?.outputs,
    json?.result,
    json?.results,
    json?.data?.url,
    json?.data?.output,
    json?.data?.outputs,
    json?.data?.result,
    json?.data?.results,
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && isPublicHttpUrl(v)) return v
    if (Array.isArray(v)) {
      const hit = v.find((x) => typeof x === 'string' && isPublicHttpUrl(x))
      if (hit) return String(hit)
      const nested = v.map((x) => pickOutputUrl(x)).find(Boolean)
      if (nested) return nested
    }
    if (v && typeof v === 'object') {
      const nested = pickOutputUrl(v)
      if (nested) return nested
    }
  }
  return ''
}

export async function createGrsImageTask(input: {
  credentials: ModelCredentials
  prompt: string
  urls: string[]
}) {
  const key = requireGrsKey(input.credentials)
  const host = grsHost(input.credentials)
  const body = {
    model: String(input.credentials.grsaiImageModel || '').trim() || 'gpt-image-2',
    prompt: input.prompt,
    aspectRatio: '9:16',
    urls: input.urls,
    webHook: '-1',
    shutProgress: false,
  }
  const json = await postJson(`${host}/v1/draw/completions`, key, body, input.credentials)
  const taskId = pickTaskId(json)
  const directUrl = pickOutputUrl(json)
  if (!taskId && !directUrl) throw new Error(`GRS.AI 图片任务缺少 id 或 url: ${JSON.stringify(json)}`)
  return { taskId, directUrl, model: body.model, raw: json }
}

export async function createGrsVideoTask(input: {
  credentials: ModelCredentials
  prompt: string
  firstFrameUrl: string
  lastFrameUrl?: string
}) {
  const key = requireGrsKey(input.credentials)
  const host = grsHost(input.credentials)
  const body = {
    model: String(input.credentials.grsaiVideoModel || '').trim() || 'veo3.1-fast',
    prompt: input.prompt,
    firstFrameUrl: input.firstFrameUrl,
    lastFrameUrl: input.lastFrameUrl || '',
    urls: [],
    aspectRatio: '9:16',
    webHook: '-1',
    shutProgress: false,
  }
  const json = await postJson(`${host}/v1/video/veo`, key, body, input.credentials)
  const taskId = pickTaskId(json)
  const directUrl = pickOutputUrl(json)
  if (!taskId && !directUrl) throw new Error(`GRS.AI 视频任务缺少 id 或 url: ${JSON.stringify(json)}`)
  return { taskId, directUrl, model: body.model, raw: json }
}

export async function waitGrsResult(credentials: ModelCredentials, taskId: string, timeoutMs = 10 * 60 * 1000): Promise<GrsAiResult> {
  const key = requireGrsKey(credentials)
  const host = grsHost(credentials)
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const json = await postJson(`${host}/v1/draw/result`, key, { id: taskId }, credentials)
    const status = pickStatus(json)
    const outputUrl = pickOutputUrl(json)
    if ((status === 'succeeded' || status === 'success' || status === 'completed' || status === 'done') && outputUrl) {
      return { outputUrl, task: json }
    }
    if (outputUrl && Number(json?.data?.progress ?? 0) >= 100) return { outputUrl, task: json }
    if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
      throw new Error(pickError(json) || JSON.stringify(json))
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('GRS.AI 任务超时')
}

export async function queryGrsCredits(credentials: ModelCredentials): Promise<GrsAiCredits> {
  const key = requireGrsKey(credentials)
  const host = grsHost(credentials)
  const json = await postJson(`${host}/client/grsai/getCredits`, key, {})
  const n = Number(json?.data?.credits ?? json?.credits ?? json?.data?.balance ?? json?.balance)
  return { available: Number.isFinite(n) ? n : undefined, raw: json }
}
