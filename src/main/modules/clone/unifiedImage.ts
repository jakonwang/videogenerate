import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { downloadAtlasToBuffer, pickAtlasOutputUrl } from './atlasRetry'
import { resolveApifoxHubCredentials, resolveApifoxHubProfile } from './apifoxProfile'
import { toPublicUrlViaQiniu } from './qiniu'
import type { ModelCredentials, UnifiedCapability } from './types'

function providerLabel(credentials: ModelCredentials) {
  return resolveApifoxHubProfile(credentials, 'image') === 'ai666' ? 'AI666' : 'VectorEngine'
}

const VECTOR_ENGINE_LABEL = 'VectorEngine'

function baseUrl(credentials: ModelCredentials) {
  return String(resolveApifoxHubCredentials(credentials, 'image')?.baseUrl || '').trim().replace(/\/+$/, '')
}

function officialRestBaseUrl(root: string) {
  return /\/api\/v1\/?$/i.test(root) ? root.replace(/\/+$/, '') : `${root}/api/v1`
}

function apiKey(credentials: ModelCredentials) {
  const cfg = resolveApifoxHubCredentials(credentials, 'image')
  const key = String(cfg?.apiKey || '').trim()
  if (!cfg?.enabled || !key) throw new Error(`未启用 ${VECTOR_ENGINE_LABEL} 图片能力或缺少 API Key`)
  return key
}

function mimeByPath(filePath: string) {
  const ext = extname(String(filePath || '').toLowerCase())
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function isPublicHttpUrl(value: string) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableFetchError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? '')
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|502|503|504|bad gateway|gateway time-?out|temporarily unavailable|upstream connect error|request timeout/i.test(
    message,
  )
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

async function fetchWithRetry(input: {
  url: string
  init?: RequestInit
  label: string
  retries?: number
  timeoutMs?: number
  baseDelayMs?: number
}) {
  const retries = Math.max(0, Number(input.retries ?? 2))
  const baseDelayMs = Math.max(300, Number(input.baseDelayMs ?? 1200))
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(input.url, input.init, input.timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt >= retries || !isRetryableFetchError(error)) break
      console.warn('[clone-debug] unified-image-fetch-retry', {
        label: input.label,
        url: input.url,
        attempt: attempt + 1,
        retries,
        message: String((error as any)?.message ?? error ?? ''),
      })
      await sleep(baseDelayMs * (attempt + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${input.label} failed`)
}

async function ensurePublicRefs(credentials: ModelCredentials, paths: string[] | undefined) {
  const refs = (paths ?? []).map((x) => String(x || '').trim()).filter(Boolean)
  const urls: string[] = []
  for (const ref of refs.slice(0, 8)) {
    urls.push(
      isPublicHttpUrl(ref)
        ? ref
        : await toPublicUrlViaQiniu(
            credentials,
            ref,
            resolveApifoxHubProfile(credentials, 'image') === 'ai666' ? 'ai666-input/images' : 'vectorengine-input/images',
          ),
    )
  }
  return urls
}

async function buildImageEditFormData(input: {
  model: string
  prompt: string
  negativePrompt?: string
  quality: 'low' | 'medium' | 'high'
  imagePaths?: string[]
  uploadFileNames?: string[]
}) {
  const refs = (input.imagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
  if (!refs.length) throw new Error(`${VECTOR_ENGINE_LABEL} 图片编辑缺少参考图`)
  const form = new FormData()
  form.set('model', input.model)
  form.set('prompt', input.prompt)
  if (String(input.negativePrompt || '').trim()) form.set('negative_prompt', String(input.negativePrompt || '').trim())
  form.set('quality', input.quality)
  form.set('size', '1024x1536')
  form.set('n', '1')
  const uploadFileNames = Array.isArray(input.uploadFileNames) ? input.uploadFileNames : []
  for (const [index, ref] of refs.entries()) {
    const fileName = String(uploadFileNames[index] || '').trim() || basename(ref) || `image_${randomUUID()}.png`
    if (existsSync(ref)) {
      const buf = await readFile(ref)
      form.append('image', new Blob([buf], { type: mimeByPath(ref) }), fileName)
      continue
    }
    if (isPublicHttpUrl(ref)) {
      const res = await fetchWithRetry({
        url: ref,
        label: 'image-edit-reference-download',
        timeoutMs: 90_000,
        retries: 2,
      })
      if (!res.ok) throw new Error(`${VECTOR_ENGINE_LABEL} 参考图下载失败 HTTP ${res.status}: ${ref}`)
      const arrayBuffer = await res.arrayBuffer()
      const contentType = String(res.headers.get('content-type') || '').trim() || mimeByPath(ref)
      form.append('image', new Blob([arrayBuffer], { type: contentType }), fileName)
    }
  }
  return form
}

async function fetchTaskJson(url: string, key: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      'x-api-key': key,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${VECTOR_ENGINE_LABEL} 图片任务查询失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
  return json
}

function normalizeTaskStatus(raw: any) {
  const status = String(raw?.data?.status ?? raw?.status ?? raw?.state ?? '').toLowerCase()
  if (status === 'completed' || status === 'succeeded' || status === 'success') return 'succeeded'
  if (status === 'failed' || status === 'error' || status === 'failure') return 'failed'
  return 'running'
}

async function saveOutputImage(input: { outUrl: string; outDir: string; filePrefix: string }) {
  await mkdir(input.outDir, { recursive: true })
  const filePath = join(input.outDir, `${input.filePrefix}_${Date.now()}_${randomUUID()}.png`)
  await writeFile(filePath, await downloadAtlasToBuffer(input.outUrl, `${VECTOR_ENGINE_LABEL} 图片下载`))
  return filePath
}

function pickBase64Output(json: any) {
  const values: unknown[] = [
    json?.data?.[0]?.b64_json,
    json?.data?.[0]?.base64,
    json?.data?.b64_json,
    json?.b64_json,
    json?.base64,
    json?.image_base64,
  ]
  for (const value of values) {
    const raw = String(value ?? '').trim()
    if (raw) return raw
  }
  return ''
}

async function saveOutputBase64(input: { base64: string; outDir: string; filePrefix: string }) {
  await mkdir(input.outDir, { recursive: true })
  const filePath = join(input.outDir, `${input.filePrefix}_${Date.now()}_${randomUUID()}.png`)
  await writeFile(filePath, Buffer.from(input.base64, 'base64'))
  return filePath
}

export async function generateImage(input: {
  credentials: ModelCredentials
  prompt: string
  negativePrompt?: string
  outDir: string
  filePrefix: string
  capability: Extract<UnifiedCapability, 'image_generate' | 'image_edit'>
  imagePaths?: string[]
  uploadFileNames?: string[]
}) {
  const cfg = resolveApifoxHubCredentials(input.credentials, 'image')!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const model = input.capability === 'image_edit' ? cfg.imageEditModel || cfg.imageModel : cfg.imageModel
  const quality = (() => {
    const value = String(input.credentials.openaiImageQuality || 'high').trim().toLowerCase()
    return value === 'low' || value === 'medium' || value === 'high' ? value : 'high'
  })()
  const refs = (input.imagePaths ?? []).map((p) => String(p || '').trim()).filter(Boolean).slice(0, 8)
  console.log('[clone-debug] apifox-image-provider', {
    capability: input.capability,
    profile: resolveApifoxHubProfile(input.credentials, 'image'),
    providerLabel: providerLabel(input.credentials),
    baseUrl: root,
    imageProvider: cfg.imageProvider,
    endpointStyle: cfg.imageEndpointStyle,
    model,
    refCount: refs.length,
  })

  if (cfg.imageProvider === 'midjourney') {
    const url = `${root}/mj/submit/imagine`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'x-api-key': key,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        negative_prompt: String(input.negativePrompt || '').trim() || undefined,
        base64Array: [],
      }),
    })
    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text }
    }
    if (!res.ok) throw new Error(`${VECTOR_ENGINE_LABEL} 图片请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
    const taskId = String(json?.result ?? json?.id ?? json?.task_id ?? '').trim()
    if (!taskId) throw new Error(`Midjourney 任务创建成功但缺少 task id: ${text.slice(0, 400)}`)
    const started = Date.now()
    const pollMs = cfg.defaultPollIntervalMs || 2000
    const timeoutMs = cfg.defaultTimeoutMs || 600000
    while (Date.now() - started < timeoutMs) {
      const taskJson = await fetchTaskJson(`${root}/mj/task/${encodeURIComponent(taskId)}/fetch`, key)
      const status = String(taskJson?.status ?? taskJson?.data?.status ?? '').toUpperCase()
      const outUrl = String(taskJson?.imageUrl ?? taskJson?.data?.imageUrl ?? '').trim() || pickAtlasOutputUrl(taskJson)
      if (status === 'SUCCESS' && outUrl) {
        return {
          provider: 'apifox_hub',
          model,
          endpointStyle: cfg.imageEndpointStyle,
          baseUrl: cfg.baseUrl,
          taskId,
          outputPath: await saveOutputImage({ outUrl, outDir: input.outDir, filePrefix: input.filePrefix }),
          raw: taskJson,
        }
      }
      if (status === 'FAILURE') {
        throw new Error(String(taskJson?.failReason ?? taskJson?.data?.failReason ?? 'Midjourney 图片生成失败'))
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
    throw new Error('Midjourney 图片任务超时')
  }

  if (cfg.imageEndpointStyle === 'openai_images' && input.capability === 'image_edit') {
    if (!refs.length) throw new Error(`${VECTOR_ENGINE_LABEL} 图片编辑缺少参考图，已阻止退化为 JSON 请求。`)
    const url = `${root}/v1/images/edits`
    console.log('[clone-debug] vectorengine-image-edit-request', {
      url,
      endpointStyle: cfg.imageEndpointStyle,
      model,
      refCount: refs.length,
      sampleRef: refs[0] || '',
    })
    const form = await buildImageEditFormData({
      model,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      quality,
      imagePaths: refs,
      uploadFileNames: input.uploadFileNames,
    })
    const res = await fetchWithRetry({
      url,
      label: 'vectorengine-image-edit',
      timeoutMs: 120_000,
      retries: 2,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'x-api-key': key,
          Accept: 'application/json',
        },
        body: form,
      },
    })
    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text }
    }
    if (!res.ok) throw new Error(`${VECTOR_ENGINE_LABEL} 图片请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
    const outUrl = pickAtlasOutputUrl(json) || json?.data?.[0]?.url || json?.imageUrl
    const outBase64 = pickBase64Output(json)
    const taskId = String(json?.data?.id ?? json?.id ?? json?.task_id ?? json?.taskId ?? '').trim()
    if (!outUrl && taskId) {
      throw new Error(`${VECTOR_ENGINE_LABEL} 图片任务返回了 taskId 但没有可下载链接: ${text.slice(0, 400)}`)
    }
    if (!outUrl && !outBase64) throw new Error(`${VECTOR_ENGINE_LABEL} 图片结果为空: ${text.slice(0, 400)}`)
    return {
      provider: 'apifox_hub',
      model,
      endpointStyle: cfg.imageEndpointStyle,
      baseUrl: cfg.baseUrl,
      taskId: taskId || undefined,
      outputPath: outUrl
        ? await saveOutputImage({ outUrl, outDir: input.outDir, filePrefix: input.filePrefix })
        : await saveOutputBase64({ base64: outBase64, outDir: input.outDir, filePrefix: input.filePrefix }),
      raw: json,
    }
  }

  let url = `${root}${input.capability === 'image_edit' ? '/v1/images/edits' : '/v1/images/generations'}`
  let body: any = {
    model,
    prompt: input.prompt,
    negative_prompt: String(input.negativePrompt || '').trim() || undefined,
    quality,
    size: '2K',
    aspect_ratio: '9:16',
    n: 1,
  }

  if (cfg.imageEndpointStyle === 'official_rest') {
    const publicRefs = await ensurePublicRefs(input.credentials, refs)
    if (input.capability === 'image_edit' && publicRefs.length) {
      body.image = publicRefs
    } else if (publicRefs.length) {
      body.image = publicRefs
    }
  } else if (cfg.imageEndpointStyle === 'openai_images' && input.capability === 'image_generate') {
    url = `${url}?async=true`
    body = {
      model,
      prompt: input.prompt,
      negative_prompt: String(input.negativePrompt || '').trim() || undefined,
      quality,
      size: '1024x1536',
      n: 1,
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'x-api-key': key,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${VECTOR_ENGINE_LABEL} 图片请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)

  let outUrl = pickAtlasOutputUrl(json) || json?.data?.[0]?.url || json?.imageUrl
  let outBase64 = pickBase64Output(json)
  const taskId = String(json?.data?.id ?? json?.id ?? json?.task_id ?? json?.taskId ?? '').trim()

  if (!outUrl && !outBase64 && cfg.imageEndpointStyle === 'official_rest') {
    if (!taskId) throw new Error(`${VECTOR_ENGINE_LABEL} 图片任务缺少 task id: ${text.slice(0, 400)}`)
    const started = Date.now()
    const pollMs = cfg.defaultPollIntervalMs || 2000
    const timeoutMs = cfg.defaultTimeoutMs || 600000
    while (Date.now() - started < timeoutMs) {
      const taskJson = await fetchTaskJson(`${officialRestBaseUrl(root)}/model/prediction/${encodeURIComponent(taskId)}`, key)
      outUrl =
        String(taskJson?.data?.outputs?.[0] ?? taskJson?.data?.output ?? taskJson?.output ?? taskJson?.imageUrl ?? '').trim() ||
        pickAtlasOutputUrl(taskJson)
      outBase64 = pickBase64Output(taskJson)
      const status = normalizeTaskStatus(taskJson)
      if (status === 'succeeded' && (outUrl || outBase64)) {
        json = taskJson
        break
      }
      if (status === 'failed') {
        throw new Error(String(taskJson?.data?.error ?? taskJson?.error ?? taskJson?.message ?? `${VECTOR_ENGINE_LABEL} 图片生成失败`))
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }

  if (!outUrl && !outBase64) throw new Error(`${VECTOR_ENGINE_LABEL} 图片结果为空: ${text.slice(0, 400)}`)
  return {
    provider: 'apifox_hub',
    model,
    endpointStyle: cfg.imageEndpointStyle,
    baseUrl: cfg.baseUrl,
    taskId: taskId || undefined,
    outputPath: outUrl
      ? await saveOutputImage({ outUrl, outDir: input.outDir, filePrefix: input.filePrefix })
      : await saveOutputBase64({ base64: outBase64, outDir: input.outDir, filePrefix: input.filePrefix }),
    raw: json,
  }
}
