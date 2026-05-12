import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { downloadAtlasToBuffer, pickAtlasOutputUrl } from './atlasRetry'
import { toPublicUrlViaQiniu } from './qiniu'
import type { ModelCredentials, UnifiedCapability } from './types'

function baseUrl(credentials: ModelCredentials) {
  return String(credentials.apifoxHub?.baseUrl || '').trim().replace(/\/+$/, '')
}

function officialRestBaseUrl(root: string) {
  return /\/api\/v1\/?$/i.test(root) ? root.replace(/\/+$/, '') : `${root}/api/v1`
}

function apiKey(credentials: ModelCredentials) {
  const key = String(credentials.apifoxHub?.apiKey || '').trim()
  if (!credentials.apifoxHub?.enabled || !key) throw new Error('未启用 ai666 图片能力或缺少 API Key')
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

async function ensurePublicRefs(credentials: ModelCredentials, paths: string[] | undefined) {
  const refs = (paths ?? []).map((x) => String(x || '').trim()).filter(Boolean)
  const urls: string[] = []
  for (const ref of refs.slice(0, 8)) {
    urls.push(isPublicHttpUrl(ref) ? ref : await toPublicUrlViaQiniu(credentials, ref, 'ai666-input/images'))
  }
  return urls
}

async function buildImageEditFormData(input: {
  model: string
  prompt: string
  imagePaths?: string[]
}) {
  const refs = (input.imagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
  if (!refs.length) throw new Error('ai666 图片编辑缺少参考图')
  const form = new FormData()
  form.set('model', input.model)
  form.set('prompt', input.prompt)
  form.set('size', '1024x1536')
  form.set('n', '1')
  for (const ref of refs) {
    const fileName = basename(ref) || `image_${randomUUID()}.png`
    if (existsSync(ref)) {
      const buf = await readFile(ref)
      form.append('image', new Blob([buf], { type: mimeByPath(ref) }), fileName)
      continue
    }
    if (isPublicHttpUrl(ref)) {
      const res = await fetch(ref)
      if (!res.ok) throw new Error(`ai666 参考图下载失败 HTTP ${res.status}: ${ref}`)
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
  if (!res.ok) throw new Error(`聚合接口图片任务查询失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
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
  await writeFile(filePath, await downloadAtlasToBuffer(input.outUrl, '聚合接口图片下载'))
  return filePath
}

export async function generateImage(input: {
  credentials: ModelCredentials
  prompt: string
  outDir: string
  filePrefix: string
  capability: Extract<UnifiedCapability, 'image_generate' | 'image_edit'>
  imagePaths?: string[]
}) {
  const cfg = input.credentials.apifoxHub!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const model = input.capability === 'image_edit' ? cfg.imageEditModel || cfg.imageModel : cfg.imageModel
  const refs = (input.imagePaths ?? []).map((p) => String(p || '').trim()).filter(Boolean).slice(0, 8)

  if (cfg.imageProvider === 'midjourney') {
    const url = `${root}/mj/submit/imagine`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
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
    if (!res.ok) throw new Error(`聚合接口图片请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
    let taskId = String(json?.result ?? json?.id ?? json?.task_id ?? '').trim()
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
    if (!refs.length) throw new Error('ai666 图片编辑缺少参考图，已阻止退化为 JSON 请求。')
    const url = `${root}/v1/images/edits`
    console.log('[clone-debug] ai666-image-edit-request', {
      url,
      endpointStyle: cfg.imageEndpointStyle,
      model,
      refCount: refs.length,
      sampleRef: refs[0] || '',
    })
    const form = await buildImageEditFormData({
      model,
      prompt: input.prompt,
      imagePaths: refs,
    })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      body: form,
    })
    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text }
    }
    if (!res.ok) throw new Error(`聚合接口图片请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
    const outUrl = pickAtlasOutputUrl(json) || json?.data?.[0]?.url || json?.imageUrl
    const taskId = String(json?.data?.id ?? json?.id ?? json?.task_id ?? json?.taskId ?? '').trim()
    if (!outUrl && taskId) {
      throw new Error(`聚合接口图片任务返回了 taskId 但没有可下载链接: ${text.slice(0, 400)}`)
    }
    if (!outUrl) throw new Error(`聚合接口图片结果为空: ${text.slice(0, 400)}`)
    return {
      provider: 'apifox_hub',
      model,
      endpointStyle: cfg.imageEndpointStyle,
      baseUrl: cfg.baseUrl,
      taskId: taskId || undefined,
      outputPath: await saveOutputImage({ outUrl, outDir: input.outDir, filePrefix: input.filePrefix }),
      raw: json,
    }
  }

  let url = `${root}${input.capability === 'image_edit' ? '/v1/images/edits' : '/v1/images/generations'}`
  let body: any = {
    model,
    prompt: input.prompt,
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
      size: '1024x1536',
      n: 1,
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
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
  if (!res.ok) throw new Error(`聚合接口图片请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)

  let outUrl = pickAtlasOutputUrl(json) || json?.data?.[0]?.url || json?.imageUrl
  const taskId = String(json?.data?.id ?? json?.id ?? json?.task_id ?? json?.taskId ?? '').trim()

  if (!outUrl && cfg.imageEndpointStyle === 'official_rest') {
    if (!taskId) throw new Error(`聚合接口图片任务缺少 task id: ${text.slice(0, 400)}`)
    const started = Date.now()
    const pollMs = cfg.defaultPollIntervalMs || 2000
    const timeoutMs = cfg.defaultTimeoutMs || 600000
    while (Date.now() - started < timeoutMs) {
      const taskJson = await fetchTaskJson(`${officialRestBaseUrl(root)}/model/prediction/${encodeURIComponent(taskId)}`, key)
      outUrl =
        String(taskJson?.data?.outputs?.[0] ?? taskJson?.data?.output ?? taskJson?.output ?? taskJson?.imageUrl ?? '').trim() ||
        pickAtlasOutputUrl(taskJson)
      const status = normalizeTaskStatus(taskJson)
      if (status === 'succeeded' && outUrl) {
        json = taskJson
        break
      }
      if (status === 'failed') {
        throw new Error(String(taskJson?.data?.error ?? taskJson?.error ?? taskJson?.message ?? '聚合接口图片生成失败'))
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }

  if (!outUrl) throw new Error(`聚合接口图片结果为空: ${text.slice(0, 400)}`)
  return {
    provider: 'apifox_hub',
    model,
    endpointStyle: cfg.imageEndpointStyle,
    baseUrl: cfg.baseUrl,
    taskId: taskId || undefined,
    outputPath: await saveOutputImage({ outUrl, outDir: input.outDir, filePrefix: input.filePrefix }),
    raw: json,
  }
}
