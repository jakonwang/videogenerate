import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadAtlasToBuffer, pickAtlasOutputUrl } from './atlasRetry'
import type { ModelCredentials, UnifiedCapability } from './types'

function baseUrl(credentials: ModelCredentials) {
  return String(credentials.apifoxHub?.baseUrl || '').trim().replace(/\/+$/, '')
}

function officialRestBaseUrl(root: string) {
  return /\/api\/v1\/?$/i.test(root) ? root.replace(/\/+$/, '') : `${root}/api/v1`
}

function apiKey(credentials: ModelCredentials) {
  const key = String(credentials.apifoxHub?.apiKey || '').trim()
  if (!credentials.apifoxHub?.enabled || !key) throw new Error('未启用聚合接口图片模型')
  return key
}

async function fetchTaskJson(url: string, key: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
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

export async function generateImage(input: {
  credentials: ModelCredentials
  prompt: string
  outDir: string
  filePrefix: string
  capability: Extract<UnifiedCapability, 'image_generate' | 'image_edit'>
}) {
  const cfg = input.credentials.apifoxHub!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const model = input.capability === 'image_edit' ? cfg.imageEditModel || cfg.imageModel : cfg.imageModel

  let url = `${root}${input.capability === 'image_edit' ? '/v1/images/edits' : '/v1/images/generations'}`
  let body: any = {
    model,
    prompt: input.prompt,
    size: '1024x1536',
    n: 1,
  }

  if (cfg.imageProvider === 'midjourney') {
    url = `${root}/mj/submit/imagine`
    body = {
      prompt: input.prompt,
      base64Array: [],
    }
  } else if (cfg.imageEndpointStyle === 'official_rest') {
    url = `${officialRestBaseUrl(root)}/model/generateImage`
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
  let taskId = String(json?.data?.id ?? json?.id ?? json?.task_id ?? json?.taskId ?? '').trim()

  if (!outUrl && cfg.imageProvider === 'midjourney') {
    taskId = String(json?.result ?? json?.id ?? json?.task_id ?? '').trim()
    if (!taskId) throw new Error(`Midjourney 任务创建成功但缺少 task id: ${text.slice(0, 400)}`)
    const started = Date.now()
    const pollMs = cfg.defaultPollIntervalMs || 2000
    const timeoutMs = cfg.defaultTimeoutMs || 600000
    while (Date.now() - started < timeoutMs) {
      const taskJson = await fetchTaskJson(`${root}/mj/task/${encodeURIComponent(taskId)}/fetch`, key)
      const status = String(taskJson?.status ?? taskJson?.data?.status ?? '').toUpperCase()
      outUrl = String(taskJson?.imageUrl ?? taskJson?.data?.imageUrl ?? '').trim() || pickAtlasOutputUrl(taskJson)
      if (status === 'SUCCESS' && outUrl) {
        json = taskJson
        break
      }
      if (status === 'FAILURE') {
        throw new Error(String(taskJson?.failReason ?? taskJson?.data?.failReason ?? 'Midjourney 图片生成失败'))
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  } else if (!outUrl && cfg.imageEndpointStyle === 'official_rest') {
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
  await mkdir(input.outDir, { recursive: true })
  const filePath = join(input.outDir, `${input.filePrefix}_${Date.now()}_${randomUUID()}.png`)
  await writeFile(filePath, await downloadAtlasToBuffer(outUrl, '聚合接口图片下载'))
  return {
    provider: 'apifox_hub',
    model,
    endpointStyle: cfg.imageEndpointStyle,
    baseUrl: cfg.baseUrl,
    taskId: taskId || undefined,
    outputPath: filePath,
    raw: json,
  }
}
