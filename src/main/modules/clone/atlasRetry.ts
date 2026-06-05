import { basename, resolve } from 'node:path'
import { readFile, stat, writeFile } from 'node:fs/promises'

type AnyJson = Record<string, any>

type RetryOptions = {
  label: string
  retries?: number
  baseDelayMs?: number
  timeoutMs?: number
}

const atlasMediaUrlCache = new Map<string, string>()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseJsonSafely(text: string) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

function isRetriableStatus(status: number) {
  return status === 502 || status === 503 || status === 504
}

function isRetriableText(text: string) {
  return /bad gateway|cloudflare|temporarily unavailable|upstream connect error|gateway timeout/i.test(text)
}

function isRetriableError(error: unknown) {
  const msg = String((error as any)?.message ?? error ?? '')
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|502|503|504|bad gateway|gateway time-?out|temporarily unavailable|upstream connect error/i.test(msg)
}

async function atlasFetchWithRetry<T>(
  factory: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 3)
  const baseDelayMs = Math.max(200, options.baseDelayMs ?? 1200)
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await factory()
    } catch (error) {
      lastError = error
      if (attempt >= retries || !isRetriableError(error)) break
      await sleep(baseDelayMs * Math.pow(2, attempt))
    }
  }
  throw new Error(`${options.label} 澶辫触: ${String((lastError as any)?.message ?? lastError ?? 'unknown error')}`)
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 90_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`request timeout after ${timeoutMs}ms`)), timeoutMs)
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function readArrayBufferWithTimeout(res: Response, timeoutMs = 90_000) {
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`response body timeout after ${timeoutMs}ms`)), timeoutMs)
    res.arrayBuffer().then(
      (buffer) => {
        clearTimeout(timer)
        resolve(buffer)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function parseAtlasResponse(res: Response, label: string) {
  const text = await res.text().catch(() => '')
  const json = parseJsonSafely(text)
  if (!res.ok) {
    const error = new Error(`${res.status} ${text || res.statusText}`)
    if (isRetriableStatus(res.status) || isRetriableText(text)) {
      throw error
    }
    throw error
  }
  if (isRetriableText(text)) {
    throw new Error(`${label}: ${text}`)
  }
  return { text, json }
}

export function pickAtlasOutputUrl(json: any): string {
  const candidates = [
    json?.output,
    json?.outputs,
    json?.image,
    json?.imageUrl,
    json?.image_url,
    json?.videoUrl,
    json?.video_url,
    json?.url,
    json?.download_url,
    json?.downloadUrl,
    json?.file_url,
    json?.data?.output,
    json?.data?.outputs,
    json?.data?.image,
    json?.data?.imageUrl,
    json?.data?.image_url,
    json?.data?.videoUrl,
    json?.data?.video_url,
    json?.data?.url,
    json?.data?.download_url,
    json?.data?.downloadUrl,
    json?.data?.file_url,
    json?.data?.response,
    json?.content,
    json?.content?.video_url,
    json?.response,
    json?.result,
    json?.data?.result,
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
    if (Array.isArray(v)) {
      const hit = v.find((x) => typeof x === 'string' && /^https?:\/\//i.test(x))
      if (hit) return String(hit)
      const nested = v.map((x) => pickAtlasOutputUrl(x)).find(Boolean)
      if (nested) return nested
    }
    if (v && typeof v === 'object') {
      const nested = pickAtlasOutputUrl(v)
      if (nested) return nested
    }
  }
  return ''
}

export async function postAtlasJson(url: string, key: string, body: AnyJson, label = 'AtlasCloud POST') {
  return atlasFetchWithRetry(async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const { json } = await parseAtlasResponse(res, label)
    return json
  }, { label })
}

export async function getAtlasJson(url: string, key: string, label = 'AtlasCloud GET') {
  return atlasFetchWithRetry(async () => {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    }, 45_000)
    const { json } = await parseAtlasResponse(res, label)
    return json
  }, { label })
}

export async function downloadAtlasToBuffer(url: string, label = 'AtlasCloud 涓嬭浇') {
  return atlasFetchWithRetry(async () => {
    const res = await fetchWithTimeout(url, undefined, 90_000)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`${res.status} ${text || res.statusText}`)
    }
    const text = await res.clone().text().catch(() => '')
    if (isRetriableText(text)) throw new Error(text)
    return Buffer.from(await readArrayBufferWithTimeout(res, 90_000))
  }, { label })
}

export async function downloadAtlasToFile(url: string, outPath: string, label = 'AtlasCloud 涓嬭浇鏂囦欢') {
  const buf = await downloadAtlasToBuffer(url, label)
  await writeFile(outPath, buf)
}

function mimeByPath(filePath: string, kind: 'image' | 'video') {
  const ext = filePath.toLowerCase()
  if (kind === 'image') {
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg'
    if (ext.endsWith('.webp')) return 'image/webp'
    return 'image/png'
  }
  if (ext.endsWith('.mov')) return 'video/quicktime'
  if (ext.endsWith('.webm')) return 'video/webm'
  return 'video/mp4'
}

export async function uploadAtlasMedia(input: {
  key: string
  host: string
  filePath: string
  kind: 'image' | 'video'
  label?: string
}) {
  const label = input.label || 'AtlasCloud 上传媒体'
  const normalizedPath = resolve(input.filePath)
  const fileStat = await stat(normalizedPath)
  const cacheKey = [String(input.host || '').replace(/\/+$/, ''), input.kind, normalizedPath, fileStat.size, fileStat.mtimeMs].join('|')
  const cached = atlasMediaUrlCache.get(cacheKey)
  if (cached) return cached

  return atlasFetchWithRetry(async () => {
    const buf = await readFile(normalizedPath)
    const form = new FormData()
    form.append('file', new Blob([buf], { type: mimeByPath(normalizedPath, input.kind) }), basename(normalizedPath))
    const res = await fetch(`${input.host}/api/v1/model/uploadMedia`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.key}` },
      body: form,
    })
    const { json } = await parseAtlasResponse(res, label)
    const url = pickAtlasOutputUrl(json)
    if (!url) throw new Error(`AtlasCloud uploadMedia response missing url: ${JSON.stringify(json)}`)
    atlasMediaUrlCache.set(cacheKey, url)
    return url
  }, { label })
}
