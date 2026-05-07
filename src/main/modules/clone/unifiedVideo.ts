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
      ? cfg.textToVideoModel
      : capability === 'video_image_to_video'
        ? cfg.imageToVideoModel
        : capability === 'video_start_end_to_video'
          ? cfg.startEndVideoModel
          : cfg.referenceVideoModel
  return String(selected || '').trim()
}

function viduCreatePath(capability: UnifiedCapability) {
  if (capability === 'video_text_to_video') return '/vidu/ent/v2/text2video'
  if (capability === 'video_image_to_video') return '/vidu/ent/v2/img2video'
  if (capability === 'video_start_end_to_video') return '/vidu/ent/v2/start-end2video'
  return '/vidu/ent/v2/reference2video'
}

function providerQueryUrl(root: string, provider: string, taskId: string, endpointStyle = '') {
  if (provider === 'apifox_hub') {
    return endpointStyle === 'official_rest'
      ? `${officialRestBaseUrl(root)}/model/prediction/${encodeURIComponent(taskId)}`
      : `${root}/v1/video/query?id=${encodeURIComponent(taskId)}`
  }
  if (provider === 'vidu') return `${root}/vidu/ent/v2/task/${encodeURIComponent(taskId)}/creations`
  if (provider === 'veo') return `${root}/v1/video/query?id=${encodeURIComponent(taskId)}`
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
  const rawStatus = String(
    raw?.data?.status ??
      raw?.data?.state ??
      raw?.data?.task_status ??
      raw?.data?.prediction?.status ??
      raw?.data?.result?.status ??
      raw?.status ??
      raw?.state ??
      raw?.task_status ??
      raw?.prediction?.status ??
      raw?.result?.status ??
      '',
  ).toLowerCase()
  if (rawStatus === 'completed' || rawStatus === 'succeeded' || rawStatus === 'success' || rawStatus === 'done' || rawStatus === 'finish' || rawStatus === 'finished') return 'succeeded'
  if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'failure' || rawStatus === 'cancelled' || rawStatus === 'canceled') return 'failed'
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
        json?.data?.output_urls?.[0] ??
        json?.data?.outputUrls?.[0] ??
        json?.data?.video?.url ??
        json?.data?.video?.download_url ??
        json?.data?.videos?.[0]?.url ??
        json?.data?.videos?.[0]?.download_url ??
        json?.data?.prediction?.output ??
        json?.data?.prediction?.outputs?.[0] ??
        json?.data?.prediction?.video_url ??
        json?.data?.prediction?.url ??
        json?.data?.result?.output ??
        json?.data?.result?.outputs?.[0] ??
        json?.data?.result?.video_url ??
        json?.data?.result?.url ??
        json?.data?.metadata?.url ??
        json?.metadata?.url ??
        json?.output ??
        json?.outputs?.[0] ??
        json?.output_urls?.[0] ??
        json?.outputUrls?.[0] ??
        json?.video_url ??
        json?.video?.url ??
        json?.videos?.[0]?.url ??
        json?.url ??
        '',
    ).trim()
  )
}

function pickAllOutputUrls(json: any): string[] {
  const values: unknown[] = [
    pickOutputUrl(json),
    json?.data?.videoUrl,
    json?.data?.video_url,
    json?.data?.url,
    json?.data?.output?.url,
    json?.data?.output?.video_url,
    json?.data?.output_url,
    json?.data?.outputUrl,
    json?.data?.output?.[0],
    json?.data?.outputs?.[0],
    json?.data?.output_urls?.[0],
    json?.data?.outputUrls?.[0],
    json?.data?.result?.videoUrl,
    json?.data?.result?.video_url,
    json?.data?.result?.url,
    json?.data?.result?.output?.url,
    json?.data?.result?.output?.video_url,
    json?.data?.result?.outputs?.[0],
    json?.data?.prediction?.videoUrl,
    json?.data?.prediction?.video_url,
    json?.data?.prediction?.url,
    json?.data?.prediction?.output?.url,
    json?.data?.prediction?.outputs?.[0],
    json?.result?.videoUrl,
    json?.result?.video_url,
    json?.result?.url,
    json?.output?.url,
    json?.output?.video_url,
    json?.videoUrl,
    json?.video_url,
    json?.url,
  ]
  if (Array.isArray(json?.data?.output)) values.push(...json.data.output)
  if (Array.isArray(json?.data?.outputs)) values.push(...json.data.outputs)
  if (Array.isArray(json?.data?.videos)) values.push(...json.data.videos.map((item: any) => item?.url || item?.video_url || item?.download_url))
  if (Array.isArray(json?.outputs)) values.push(...json.outputs)
  if (Array.isArray(json?.videos)) values.push(...json.videos.map((item: any) => item?.url || item?.video_url || item?.download_url))
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function isTransientQueryError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? '')
  return /502|503|504|bad gateway|gateway time-?out|temporarily unavailable|upstream connect error|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message)
}

function pickTaskErrorMessage(json: any) {
  return String(
    json?.data?.error?.message ??
      json?.data?.error ??
      json?.data?.message ??
      json?.data?.fail_reason ??
      json?.error?.message ??
      json?.error ??
      json?.message ??
      json?.fail_reason ??
      '',
  ).trim()
}

export class Ai666TaskTimeoutError extends Error {
  taskId: string
  lastTransientError?: string

  constructor(taskId: string, lastTransientError?: string) {
    super(`ai666 视频任务超时: ${taskId}${lastTransientError ? `；最近一次查询错误：${lastTransientError.slice(0, 300)}` : ''}`)
    this.name = 'Ai666TaskTimeoutError'
    this.taskId = taskId
    this.lastTransientError = lastTransientError
  }
}

export async function queryAsyncTask(input: {
  credentials: ModelCredentials
  taskId: string
}) {
  const cfg = input.credentials.apifoxHub!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const url = providerQueryUrl(root, cfg.videoProvider, input.taskId, cfg.videoEndpointStyle)

  let json: any
  try {
    json = await getAtlasJson(url, key, `ai666 查询视频任务 ${input.taskId}`)
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? '')
    if (/502|503|504|bad gateway|gateway time-?out|temporarily unavailable|upstream connect error|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message)) {
      return {
        taskId: input.taskId,
        status: 'running',
        outputUrls: [],
        errorMessage: undefined,
        raw: { transientError: message },
      }
    }
    throw error
  }
  const outputUrl = pickOutputUrl(json)

  return {
    taskId: input.taskId,
    status: normalizeTaskStatus(json),
    outputUrls: pickAllOutputUrls(json).length ? pickAllOutputUrls(json) : outputUrl ? [outputUrl] : [],
    errorMessage: pickTaskErrorMessage(json) || undefined,
    raw: json,
  }
}

export async function pollTask(input: {
  credentials: ModelCredentials
  taskId: string
}) {
  return await queryAsyncTask(input)
}

export async function submitTask(input: {
  credentials: ModelCredentials
  capability: Extract<UnifiedCapability, 'video_text_to_video' | 'video_image_to_video' | 'video_start_end_to_video' | 'video_reference_to_video'>
  prompt: string
  image?: string
  lastImage?: string
}) {
  return await createVideoTask(input)
}

export async function syncRemoteTaskResult(input: {
  credentials: ModelCredentials
  taskId: string
  outDir: string
}) {
  const task = await queryAsyncTask({ credentials: input.credentials, taskId: input.taskId })
  if (task.status !== 'succeeded' || !task.outputUrls[0]) return { task, outputPath: undefined as string | undefined, synced: false }
  await mkdir(input.outDir, { recursive: true })
  const out = join(input.outDir, `apifox_video_${Date.now()}_${randomUUID()}.mp4`)
  await downloadAtlasToFile(task.outputUrls[0], out, 'ai666 视频下载')
  return { task, outputPath: out, synced: true }
}

export async function recoverTaskById(input: {
  credentials: ModelCredentials
  taskId: string
  outDir: string
}) {
  return await syncRemoteTaskResult(input)
}

export async function createVideoTask(input: {
  credentials: ModelCredentials
  capability: Extract<UnifiedCapability, 'video_text_to_video' | 'video_image_to_video' | 'video_start_end_to_video' | 'video_reference_to_video'>
  prompt: string
  image?: string
  lastImage?: string
}) {
  const cfg = input.credentials.apifoxHub!
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const model = modelForCapability(cfg, input.capability)
  if (!model) throw new Error(`未配置 ${input.capability} 对应的视频模型`)

  const url = createUrlForProvider(root, cfg.videoProvider, input.capability, cfg.videoEndpointStyle)
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
  if (!taskId && !directOutputUrl) throw new Error(`ai666 视频任务缺少 id: ${text.slice(0, 500)}`)
  return {
    provider: 'apifox_hub',
    model,
    endpointStyle: cfg.videoEndpointStyle,
    baseUrl: cfg.baseUrl,
    requestCapability: input.capability,
    taskId: taskId || undefined,
    directOutputUrl: directOutputUrl || undefined,
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
  const timeoutMs = Math.max(Number(cfg.defaultTimeoutMs || 0), 600000)
  const pollMs = cfg.defaultPollIntervalMs || 2000
  let lastTransientError = ''
  while (Date.now() - started < timeoutMs) {
    let task: Awaited<ReturnType<typeof queryAsyncTask>>
    try {
      task = await queryAsyncTask({ credentials: input.credentials, taskId })
    } catch (error) {
      if (isTransientQueryError(error)) {
        lastTransientError = String((error as any)?.message ?? error)
        await new Promise((resolve) => setTimeout(resolve, pollMs))
        continue
      }
      throw error
    }
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
  try {
    const task = await queryAsyncTask({ credentials: input.credentials, taskId })
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
  } catch (error) {
    if (!isTransientQueryError(error)) throw error
    lastTransientError = String((error as any)?.message ?? error)
  }
  throw new Ai666TaskTimeoutError(taskId, lastTransientError || undefined)
}
