import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadAtlasToFile, getAtlasJson, pickAtlasOutputUrl } from './atlasRetry'
import type { ModelCredentials, UnifiedCapability } from './types'

function baseUrl(credentials: ModelCredentials) {
  return String(credentials.apifoxHub?.baseUrl || '').trim().replace(/\/+$/, '')
}

function officialRestBaseUrl(root: string) {
  return /\/api\/v1\/?$/i.test(root) ? root.replace(/\/+$/, '') : `${root}/api/v1`
}

function apiKey(credentials: ModelCredentials) {
  const key = String(credentials.apifoxHub?.apiKey || '').trim()
  if (!credentials.apifoxHub?.enabled || !key) throw new Error('未启用 ai666 视频接口')
  return key
}

function modelForCapability(cfg: NonNullable<ModelCredentials['apifoxHub']>, capability: UnifiedCapability) {
  const selected =
    capability === 'video_text_to_video'
      ? cfg.textToVideoModel || cfg.imageToVideoModel || cfg.startEndVideoModel || cfg.referenceVideoModel
      : capability === 'video_image_to_video'
        ? cfg.imageToVideoModel || cfg.startEndVideoModel || cfg.referenceVideoModel || cfg.textToVideoModel
        : capability === 'video_start_end_to_video'
          ? cfg.startEndVideoModel || cfg.imageToVideoModel || cfg.referenceVideoModel || cfg.textToVideoModel
          : cfg.referenceVideoModel || cfg.startEndVideoModel || cfg.imageToVideoModel || cfg.textToVideoModel
  return String(selected || '').trim()
}

function viduCreatePath(capability: UnifiedCapability) {
  if (capability === 'video_text_to_video') return '/vidu/ent/v2/text2video'
  if (capability === 'video_image_to_video') return '/vidu/ent/v2/img2video'
  if (capability === 'video_start_end_to_video') return '/vidu/ent/v2/start-end2video'
  return '/vidu/ent/v2/reference2video'
}

function providerQueryUrl(root: string, provider: string, taskId: string) {
  if (provider === 'vidu') return `${root}/vidu/ent/v2/task/${encodeURIComponent(taskId)}/creations`
  if (provider === 'veo') return `${root}/veo/v1/video/query?id=${encodeURIComponent(taskId)}`
  if (provider === 'seedance2') return `${root}/v1/video/generations/${encodeURIComponent(taskId)}`
  if (provider === 'jimeng') return `${root}/v1/video/generations/${encodeURIComponent(taskId)}`
  if (provider === 'openai_video' || provider === 'sora' || provider === 'grok') return `${root}/v1/video/query?id=${encodeURIComponent(taskId)}`
  return `${officialRestBaseUrl(root)}/model/prediction/${encodeURIComponent(taskId)}`
}

function createUrlForProvider(root: string, provider: string, capability: UnifiedCapability, endpointStyle: string) {
  if (provider === 'veo') return `${root}/v1/video/create`
  if (provider === 'vidu') return `${root}${viduCreatePath(capability)}`
  if (provider === 'jimeng') return `${root}/v1/video/generations`
  if (provider === 'seedance2') return `${root}/v1/video/generations`
  if (provider === 'openai_video') return `${root}/v1/video/create`
  if (provider === 'sora' || provider === 'grok') return `${root}/model/generateVideo`
  return endpointStyle === 'official_rest' ? `${officialRestBaseUrl(root)}/model/generateVideo` : `${root}/model/generateVideo`
}

function normalizeTaskStatus(raw: any) {
  const rawStatus = String(raw?.data?.status ?? raw?.status ?? raw?.state ?? '').toLowerCase()
  if (rawStatus === 'completed' || rawStatus === 'succeeded' || rawStatus === 'success') return 'succeeded'
  if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'failure') return 'failed'
  return 'running'
}

function pickTaskId(json: any) {
  return String(
    json?.data?.task_id ??
      json?.data?.taskId ??
      json?.data?.request_id ??
      json?.data?.requestId ??
      json?.data?.id ??
      json?.task_id ??
      json?.taskId ??
      json?.request_id ??
      json?.requestId ??
      json?.id ??
      '',
  ).trim()
}

function pickOutputUrl(json: any) {
  return (
    pickAtlasOutputUrl(json) ||
    String(
      json?.data?.output ??
        json?.data?.outputs?.[0] ??
        json?.data?.metadata?.url ??
        json?.metadata?.url ??
        json?.output ??
        json?.video_url ??
        json?.url ??
        '',
    ).trim()
  )
}

export async function queryAsyncTask(input: {
  credentials: ModelCredentials
  taskId: string
}) {
  const cfg = input.credentials.apifoxHub!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const url = providerQueryUrl(root, cfg.videoProvider, input.taskId)

  const json = await getAtlasJson(url, key, `ai666 查询视频任务 ${input.taskId}`)
  const outputUrl = pickOutputUrl(json)

  return {
    taskId: input.taskId,
    status: normalizeTaskStatus(json),
    outputUrls: outputUrl ? [outputUrl] : [],
    errorMessage: String(json?.data?.error ?? json?.error ?? json?.message ?? json?.fail_reason ?? '').trim() || undefined,
    raw: json,
  }
}

export async function generateVideo(input: {
  credentials: ModelCredentials
  capability: Extract<UnifiedCapability, 'video_text_to_video' | 'video_image_to_video' | 'video_start_end_to_video' | 'video_reference_to_video'>
  prompt: string
  outDir: string
  image?: string
  lastImage?: string
}) {
  const cfg = input.credentials.apifoxHub!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const model = modelForCapability(cfg, input.capability)
  if (!model) throw new Error(`未配置 ${input.capability} 对应的视频模型`)

  let url = createUrlForProvider(root, cfg.videoProvider, input.capability, cfg.videoEndpointStyle)
  let body: Record<string, any> = {
    model,
    prompt: input.prompt,
    aspect_ratio: '9:16',
    duration: 8,
    resolution: '720p',
    seed: -1,
  }

  if (cfg.videoProvider === 'vidu') {
    body = {
      model,
      prompt: input.prompt,
      aspect_ratio: '9:16',
      duration: 8,
      ...(input.image ? { image: input.image } : {}),
      ...(input.lastImage ? { last_image: input.lastImage } : {}),
    }
  } else if (cfg.videoProvider === 'veo') {
    body = {
      model,
      prompt: input.prompt,
      images: [input.image, input.lastImage].filter(Boolean),
      enhance_prompt: true,
      aspect_ratio: '9:16',
    }
  } else if (cfg.videoProvider === 'jimeng') {
    body = {
      model,
      prompt: input.prompt,
      image_url: input.image,
      last_image_url: input.lastImage,
      metadata: {
        aspect_ratio: '9:16',
        duration: 8,
      },
    }
  } else if (cfg.videoProvider === 'seedance2') {
    body = {
      model,
      content: [
        { type: 'text', text: input.prompt },
        ...(input.image ? [{ type: 'image_url', image_url: { url: input.image } }] : []),
        ...(input.lastImage ? [{ type: 'image_url', image_url: { url: input.lastImage } }] : []),
      ],
      generate_audio: false,
      ratio: '9:16',
      duration: 5,
      watermark: false,
    }
  } else if (cfg.videoProvider === 'kling') {
    body = {
      model,
      prompt: input.prompt,
      ...(input.image ? { image: input.image } : {}),
      ...(input.lastImage ? { last_image: input.lastImage } : {}),
      aspect_ratio: '9:16',
      duration: 8,
      resolution: '720p',
      seed: -1,
    }
  } else if (cfg.videoProvider === 'openai_video' || cfg.videoProvider === 'sora' || cfg.videoProvider === 'grok') {
    body =
      cfg.videoEndpointStyle === 'openai_video'
        ? {
            model,
            prompt: input.prompt,
            images: [input.image, input.lastImage].filter(Boolean),
            aspect_ratio: '9:16',
            enhance_prompt: true,
          }
        : {
            model,
            prompt: input.prompt,
            ...(input.image ? { image: input.image } : {}),
            ...(input.lastImage ? { last_image: input.lastImage } : {}),
            aspect_ratio: '9:16',
            duration: 8,
            resolution: '720p',
            seed: -1,
          }
  } else {
    if (input.image) body.image = input.image
    if (input.lastImage) body.last_image = input.lastImage
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
  if (!res.ok) throw new Error(`ai666 视频请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)

  const directOutputUrl = pickOutputUrl(json)
  const taskId = pickTaskId(json)
  if (!taskId && directOutputUrl) {
    await mkdir(input.outDir, { recursive: true })
    const out = join(input.outDir, `apifox_video_${Date.now()}_${randomUUID()}.mp4`)
    await downloadAtlasToFile(directOutputUrl, out, 'ai666 视频下载')
    return {
      provider: 'apifox_hub',
      model,
      endpointStyle: cfg.videoEndpointStyle,
      baseUrl: cfg.baseUrl,
      taskId: undefined,
      outputPath: out,
      raw: json,
    }
  }
  if (!taskId) throw new Error(`ai666 视频任务缺少 id: ${text.slice(0, 500)}`)

  const started = Date.now()
  const timeoutMs = cfg.defaultTimeoutMs || 600000
  const pollMs = cfg.defaultPollIntervalMs || 2000
  while (Date.now() - started < timeoutMs) {
    const task = await queryAsyncTask({ credentials: input.credentials, taskId })
    if (task.status === 'failed') throw new Error(task.errorMessage || `ai666 视频任务失败: ${taskId}`)
    if (task.status === 'succeeded' && task.outputUrls[0]) {
      await mkdir(input.outDir, { recursive: true })
      const out = join(input.outDir, `apifox_video_${Date.now()}_${randomUUID()}.mp4`)
      await downloadAtlasToFile(task.outputUrls[0], out, 'ai666 视频下载')
      return {
        provider: 'apifox_hub',
        model,
        endpointStyle: cfg.videoEndpointStyle,
        baseUrl: cfg.baseUrl,
        taskId,
        outputPath: out,
        raw: task.raw,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  throw new Error(`ai666 视频任务超时: ${taskId}`)
}
