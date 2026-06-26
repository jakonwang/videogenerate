import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadAtlasToFile, getAtlasJson, pickAtlasOutputUrl } from './atlasRetry'
import { resolveApifoxHubCredentials, resolveApifoxHubProfile } from './apifoxProfile'
import type { ModelCredentials, UnifiedCapability } from './types'

const VECTOR_ENGINE_LABEL = 'VectorEngine'

function providerLabel(credentials: ModelCredentials) {
  const profile = resolveApifoxHubProfile(credentials, 'video')
  if (profile === 'ai666') return 'AI666'
  if (profile === 'xibapi') return 'XIBAPI'
  if (profile === 'gaorui') return 'GaoruiAPI'
  return 'VectorEngine'
}

function baseUrl(credentials: ModelCredentials) {
  return String(resolveApifoxHubCredentials(credentials, 'video')?.baseUrl || '').trim().replace(/\/+$/, '')
}

function isAi666KlingVideo(credentials: ModelCredentials, cfg?: NonNullable<ModelCredentials['apifoxHub']>) {
  return resolveApifoxHubProfile(credentials, 'video') === 'ai666' && String(cfg?.videoProvider || '').trim() === 'kling'
}

function isAi666Seedance2Video(credentials: ModelCredentials, cfg?: NonNullable<ModelCredentials['apifoxHub']>) {
  return resolveApifoxHubProfile(credentials, 'video') === 'ai666' && String(cfg?.videoProvider || '').trim() === 'seedance2'
}

function officialRestBaseUrl(root: string) {
  return /\/api\/v1\/?$/i.test(root) ? root.replace(/\/+$/, '') : `${root}/api/v1`
}

function apiKey(credentials: ModelCredentials) {
  const cfg = resolveApifoxHubCredentials(credentials, 'video')
  const key = String(cfg?.apiKey || '').trim()
  if (!cfg?.enabled || !key) throw new Error(`未启用 ${providerLabel(credentials)} 视频接口`)
  return key
}

function resolveHistoricalVideoHub(input: {
  credentials: ModelCredentials
  baseUrl?: string
  model?: string
}) {
  const current = resolveApifoxHubCredentials(input.credentials, 'video')
  const requestedBaseUrl = String(input.baseUrl || '').trim().replace(/\/+$/, '')
  const requestedModel = String(input.model || '').trim()
  if (requestedBaseUrl && requestedBaseUrl === String(current?.baseUrl || '').trim().replace(/\/+$/, '')) {
    return current
  }

  const ai666 = input.credentials.ai666Hub ?? input.credentials.apifoxHub
  const vectorengine = input.credentials.vectorEngineHub ?? input.credentials.apifoxHub
  const xibapi = input.credentials.xibapiHub ?? input.credentials.apifoxHub
  const gaorui = input.credentials.gaoruiHub ?? input.credentials.apifoxHub
  const hubs = [ai666, vectorengine, xibapi, gaorui].filter(Boolean)
  if (requestedBaseUrl) {
    const matchedByBaseUrl = hubs.find(
      (hub) => String(hub?.baseUrl || '').trim().replace(/\/+$/, '') === requestedBaseUrl,
    )
    if (matchedByBaseUrl) return matchedByBaseUrl
  }
  if (requestedModel) {
    const matchedByModel = hubs.find((hub) =>
      [
        hub?.startEndVideoModel,
        hub?.imageToVideoModel,
        hub?.textToVideoModel,
        hub?.referenceVideoModel,
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .includes(requestedModel),
    )
    if (matchedByModel) return matchedByModel
  }
  return current
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

function pickFallbackModels(input: {
  cfg: NonNullable<ModelCredentials['apifoxHub']>
  credentials: ModelCredentials
  capability: UnifiedCapability
}): string[] {
  const primary = modelForCapability(input.cfg, input.capability)
  const candidates = [
    primary,
    'veo_3_1',
    'veo3.1',
    'veo3.1-fast',
    'veo3.1-4k',
    'veo3-fast',
    'veo3',
    'veo2-fast',
    'veo2-pro',
    'veo3-pro',
    input.cfg.startEndVideoModel,
    input.cfg.imageToVideoModel,
    input.cfg.textToVideoModel,
    input.credentials.videoModelPrimary,
    input.credentials.videoModelFallback,
    'veo_3_1-fast-4K',
    'veo_3_1-fast',
    'veo_3_1-lite',
  ]
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

function normalizeTaskIdForQuery(model: string, taskId: string) {
  const rawTaskId = String(taskId || '').trim()
  const rawModel = String(model || '').trim()
  if (!rawTaskId) return ''
  if (!rawModel || rawTaskId.includes(':')) return rawTaskId
  return `${rawModel}:${rawTaskId}`
}

function stripModelPrefixTaskId(taskId: string) {
  const rawTaskId = String(taskId || '').trim()
  if (!rawTaskId) return ''
  const colonIndex = rawTaskId.indexOf(':')
  if (colonIndex <= 0 || colonIndex >= rawTaskId.length - 1) return rawTaskId
  return rawTaskId.slice(colonIndex + 1).trim()
}

function isModelChannelUnavailable(resStatus: number, text: string) {
  const normalized = String(text || '')
  if (resStatus === 503 && /no available channel for model/i.test(normalized)) return true
  if ((resStatus === 429 || resStatus === 400) && /model [`'"]?.+[`'"]? does not exist/i.test(normalized)) return true
  return false
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
  if (provider === 'xibapi') return `${root}/v1/videos/${encodeURIComponent(taskId)}`
  if (provider === 'gaorui') return `${root}/v1/videos/${encodeURIComponent(taskId)}`
  if (provider === 'vidu') return `${root}/vidu/ent/v2/task/${encodeURIComponent(taskId)}/creations`
  if (provider === 'veo') return `${root}/v1/video/query?id=${encodeURIComponent(taskId)}`
  if (provider === 'seedance2') return `${root}/v1/video/generations/${encodeURIComponent(taskId)}`
  if (provider === 'jimeng') return `${root}/v1/video/generations/${encodeURIComponent(taskId)}`
  if (provider === 'openai_video' || provider === 'sora' || provider === 'grok') return `${root}/v1/video/query?id=${encodeURIComponent(taskId)}`
  return `${officialRestBaseUrl(root)}/model/prediction/${encodeURIComponent(taskId)}`
}

function ai666KlingVideoQueryUrl(root: string, taskId: string) {
  return `${root}/v1/videos/${encodeURIComponent(taskId)}`
}

function buildAuthHeaders(key: string) {
  const raw = String(key || '').trim()
  return {
    Authorization: /^bearer\s+/i.test(raw) || /^sk[-_]/i.test(raw) ? raw : `Bearer ${raw}`,
    'x-api-key': raw,
  }
}

function clampSeedanceDuration(durationSec: number) {
  return Math.max(4, Math.min(15, Math.round(Number(durationSec || 5))))
}

type XibapiVideoSize = '1280x720' | '720x1280' | '1920x1080' | '1080x1920'

function normalizeXibapiSize(size?: string): XibapiVideoSize | undefined {
  const value = String(size || '').trim()
  if (value === '1280x720' || value === '720x1280' || value === '1920x1080' || value === '1080x1920') return value
  return undefined
}

function xibapiSizeByAspectRatio(aspectRatio?: '9:16' | '16:9', preferredSize?: string): XibapiVideoSize {
  return normalizeXibapiSize(preferredSize) || (aspectRatio === '16:9' ? '1280x720' : '720x1280')
}

function buildQueryCandidates(input: {
  root: string
  provider: string
  endpointStyle?: string
  rawTaskId: string
  normalizedTaskId: string
  strippedTaskId: string
}) {
  if (input.provider === 'xibapi') {
    const taskId = String(input.rawTaskId || input.strippedTaskId || '').trim()
    return taskId
      ? [
          {
            label: `xibapi:${taskId}`,
            taskId,
            url: providerQueryUrl(input.root, input.provider, taskId, input.endpointStyle || ''),
          },
        ]
      : []
  }
  if (input.provider === 'gaorui') {
    const taskId = String(input.rawTaskId || input.strippedTaskId || '').trim()
    return taskId
      ? [
          {
            label: `gaorui:${taskId}`,
            taskId,
            url: providerQueryUrl(input.root, input.provider, taskId, input.endpointStyle || ''),
          },
        ]
      : []
  }
  const rawHasModelPrefix = input.rawTaskId.includes(':')
  const normalizedHasModelPrefix = input.normalizedTaskId.includes(':')
  const taskIds = Array.from(
    new Set(
      [
        input.rawTaskId,
        input.normalizedTaskId,
        rawHasModelPrefix || normalizedHasModelPrefix ? '' : input.strippedTaskId,
      ].filter(Boolean),
    ),
  )
  const candidates: Array<{ label: string; taskId: string; url: string }> = []
  const pushCandidate = (label: string, taskId: string, url: string) => {
    if (!taskId || !url) return
    if (candidates.some((item) => item.taskId === taskId && item.url === url)) return
    candidates.push({ label, taskId, url })
  }
  const shouldPreferLegacyQueryOnly =
    input.provider === 'openai_video' ||
    input.provider === 'sora' ||
    input.provider === 'grok' ||
    input.provider === 'veo'
  const shouldTryDualRoutes = input.provider === 'apifox_hub'

  for (const taskId of taskIds) {
    if (shouldPreferLegacyQueryOnly) {
      pushCandidate(`legacy_query:${taskId}`, taskId, `${input.root}/v1/video/query?id=${encodeURIComponent(taskId)}`)
      continue
    }
    if (shouldTryDualRoutes) {
      pushCandidate(`legacy_query:${taskId}`, taskId, `${input.root}/v1/video/query?id=${encodeURIComponent(taskId)}`)
      pushCandidate(`official_rest:${taskId}`, taskId, `${officialRestBaseUrl(input.root)}/model/prediction/${encodeURIComponent(taskId)}`)
      continue
    }
    pushCandidate(
      `${input.provider || 'default'}:${taskId}`,
      taskId,
      providerQueryUrl(input.root, input.provider, taskId, input.endpointStyle || ''),
    )
  }
  return candidates
}

function createUrlForProvider(root: string, provider: string, capability: UnifiedCapability, endpointStyle: string) {
  if (provider === 'xibapi') return `${root}/v1/videos`
  if (provider === 'gaorui') return `${root}/v1/videos`
  if (provider === 'veo') return `${root}/v1/video/create`
  if (provider === 'vidu') return `${root}${viduCreatePath(capability)}`
  if (provider === 'jimeng') return `${root}/v1/video/generations`
  if (provider === 'seedance2') return `${root}/v1/video/generations`
  if (provider === 'openai_video') return `${root}/v1/video/create`
  if (provider === 'grok') return `${root}/v1/video/create`
  if (provider === 'sora') return `${root}/model/generateVideo`
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
  if (rawStatus === 'queued' || rawStatus === 'processing') return 'running'
  if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'failure' || rawStatus === 'cancelled' || rawStatus === 'canceled') return 'failed'
  return 'running'
}

function gaoruiAspectRatio(aspectRatio?: '9:16' | '16:9') {
  return aspectRatio === '9:16' ? '9:16' : '16:9'
}

function buildGaoruiImages(input: {
  capability: UnifiedCapability
  image?: string
  lastImage?: string
  referenceImages: string[]
}) {
  if (input.capability === 'video_text_to_video') return []
  if (input.capability === 'video_reference_to_video') {
    return [input.image, input.lastImage, ...input.referenceImages].filter(Boolean)
  }
  return [input.image, input.lastImage, ...input.referenceImages].filter(Boolean)
}

function inferSucceededFromOutputUrls(input: {
  status: 'running' | 'succeeded' | 'failed'
  outputUrls: string[]
  raw: any
}) {
  if (input.status === 'succeeded' || input.status === 'failed') return input.status
  if (!input.outputUrls.length) return input.status
  const explicitFailure = String(
    input.raw?.data?.error ??
      input.raw?.error ??
      input.raw?.message ??
      input.raw?.data?.message ??
      '',
  ).toLowerCase()
  if (/(failed|error|cancelled|canceled|task_not_exist)/i.test(explicitFailure)) {
    return 'failed' as const
  }
  const completionHints = [
    input.raw?.data?.completed,
    input.raw?.data?.finished,
    input.raw?.data?.is_completed,
    input.raw?.data?.isFinished,
    input.raw?.data?.done,
    input.raw?.data?.success,
    input.raw?.data?.result_ready,
    input.raw?.data?.resultReady,
    input.raw?.data?.prediction?.completed,
    input.raw?.data?.prediction?.finished,
    input.raw?.data?.result?.completed,
    input.raw?.data?.result?.finished,
    input.raw?.completed,
    input.raw?.finished,
    input.raw?.is_completed,
    input.raw?.isFinished,
    input.raw?.done,
    input.raw?.success,
    input.raw?.result_ready,
    input.raw?.resultReady,
    input.raw?.completed_at,
    input.raw?.completedAt,
    input.raw?.finished_at,
    input.raw?.finishedAt,
    input.raw?.ended_at,
    input.raw?.endedAt,
    input.raw?.data?.completed_at,
    input.raw?.data?.completedAt,
    input.raw?.data?.finished_at,
    input.raw?.data?.finishedAt,
    input.raw?.data?.ended_at,
    input.raw?.data?.endedAt,
  ]
  const hasExplicitCompletionHint = completionHints.some((value) => {
    if (typeof value === 'boolean') return value
    return String(value || '').trim().length > 0
  })
  return hasExplicitCompletionHint ? ('succeeded' as const) : input.status
}

function pickTaskId(json: any) {
  const directDataValue =
    typeof json?.data === 'string' || typeof json?.data === 'number'
      ? String(json.data).trim()
      : ''
  const candidates = [
    directDataValue,
    json?.data?.task_uuid,
    json?.data?.taskUuid,
    json?.data?.task_id,
    json?.data?.taskId,
    json?.data?.task?.uuid,
    json?.data?.task?.id,
    json?.data?.task?.task_id,
    json?.data?.task?.taskId,
    json?.data?.record_id,
    json?.data?.recordId,
    json?.data?.uuid,
    json?.data?.trace_id,
    json?.data?.traceId,
    json?.data?.job_id,
    json?.data?.jobId,
    json?.data?.prediction_id,
    json?.data?.predictionId,
    json?.data?.prediction?.uuid,
    json?.data?.prediction?.id,
    json?.data?.prediction?.task_id,
    json?.data?.prediction?.taskId,
    json?.data?.result?.uuid,
    json?.data?.result?.id,
    json?.data?.result?.task_id,
    json?.data?.result?.taskId,
    json?.data?.video_id,
    json?.data?.videoId,
    json?.data?.request_id,
    json?.data?.requestId,
    json?.data?.id,
    json?.task?.uuid,
    json?.task?.id,
    json?.task?.task_id,
    json?.task?.taskId,
    json?.record_id,
    json?.recordId,
    json?.trace_id,
    json?.traceId,
    json?.job_id,
    json?.jobId,
    json?.prediction_id,
    json?.predictionId,
    json?.prediction?.uuid,
    json?.prediction?.id,
    json?.prediction?.task_id,
    json?.prediction?.taskId,
    json?.result?.uuid,
    json?.result?.id,
    json?.result?.task_id,
    json?.result?.taskId,
    json?.video_id,
    json?.videoId,
    json?.task_id,
    json?.taskId,
    json?.request_id,
    json?.requestId,
    json?.uuid,
    json?.id,
  ]
  for (const candidate of candidates) {
    const taskId = String(candidate ?? '').trim()
    if (taskId) return taskId
  }
  return ''
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
        json?.data?.video_url ??
        json?.data?.download_url ??
        json?.data?.url ??
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
    json?.data?.data,
    json?.data?.data?.url,
    json?.data?.data?.video_url,
    json?.data?.data?.download_url,
    json?.data?.result?.data,
    json?.data?.result?.data?.url,
    json?.data?.result?.data?.video_url,
    json?.data?.result?.data?.download_url,
    json?.data?.prediction?.data,
    json?.data?.prediction?.data?.url,
    json?.data?.prediction?.data?.video_url,
    json?.data?.prediction?.data?.download_url,
    json?.data?.response,
    json?.data?.content,
    json?.response,
    json?.content,
  ]
  if (Array.isArray(json?.data?.output)) values.push(...json.data.output)
  if (Array.isArray(json?.data?.outputs)) values.push(...json.data.outputs)
  if (Array.isArray(json?.data?.videos)) values.push(...json.data.videos.map((item: any) => item?.url || item?.video_url || item?.download_url))
  if (Array.isArray(json?.data?.images)) values.push(...json.data.images)
  if (Array.isArray(json?.data?.data)) values.push(...json.data.data)
  if (Array.isArray(json?.data?.result?.videos)) values.push(...json.data.result.videos.map((item: any) => item?.url || item?.video_url || item?.download_url))
  if (Array.isArray(json?.data?.prediction?.videos)) values.push(...json.data.prediction.videos.map((item: any) => item?.url || item?.video_url || item?.download_url))
  if (Array.isArray(json?.data?.result?.data)) values.push(...json.data.result.data)
  if (Array.isArray(json?.data?.prediction?.data)) values.push(...json.data.prediction.data)
  if (Array.isArray(json?.outputs)) values.push(...json.outputs)
  if (Array.isArray(json?.videos)) values.push(...json.videos.map((item: any) => item?.url || item?.video_url || item?.download_url))

  const collected = new Set<string>()
  const visit = (value: unknown, depth = 0) => {
    if (depth > 5 || value == null) return
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (/^https?:\/\//i.test(trimmed)) collected.add(trimmed)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof value === 'object') {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        visit(nested, depth + 1)
      }
    }
  }

  for (const value of values) visit(value)
  return Array.from(collected)
}

function isHtmlShellResponse(json: any) {
  const raw = String(json?.raw || '').trim()
  if (!raw) return false
  return /^<!doctype html/i.test(raw) || /^<html/i.test(raw) || /<title>.*向量引擎.*<\/title>/i.test(raw)
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

  constructor(providerName: string, taskId: string, lastTransientError?: string) {
    super(`${providerName} 视频任务超时: ${taskId}${lastTransientError ? `；最近一次查询错误：${lastTransientError.slice(0, 300)}` : ''}`)
    this.name = 'Ai666TaskTimeoutError'
    this.taskId = taskId
    this.lastTransientError = lastTransientError
  }
}

export async function queryAsyncTask(input: {
  credentials: ModelCredentials
  taskId: string
  baseUrl?: string
  endpointStyle?: string
  model?: string
}) {
  const cfg = resolveHistoricalVideoHub(input)!
  const root = String(input.baseUrl || cfg.baseUrl || '').trim().replace(/\/+$/, '') || baseUrl(input.credentials)
  const key = String(cfg?.apiKey || '').trim() || apiKey(input.credentials)
  const primaryModel =
    String(input.model || '').trim() ||
    modelForCapability(cfg, 'video_start_end_to_video') ||
    modelForCapability(cfg, 'video_image_to_video') ||
    modelForCapability(cfg, 'video_reference_to_video') ||
    modelForCapability(cfg, 'video_text_to_video')
  const endpointStyle = String(input.endpointStyle || cfg.videoEndpointStyle || '').trim()
  const provider = String(cfg.videoProvider || '').trim() || 'apifox_hub'
  const rawTaskId = String(input.taskId || '').trim()
  const normalizedTaskId = normalizeTaskIdForQuery(primaryModel, rawTaskId)
  const strippedTaskId = stripModelPrefixTaskId(rawTaskId)
  const queryCandidates = isAi666KlingVideo(input.credentials, cfg)
    ? Array.from(new Set([rawTaskId, strippedTaskId, normalizedTaskId].filter(Boolean))).map((taskId) => ({
        label: `ai666_kling_videos:${taskId}`,
        taskId,
        url: ai666KlingVideoQueryUrl(root, taskId),
      }))
    : isAi666Seedance2Video(input.credentials, cfg)
      ? Array.from(new Set([rawTaskId, strippedTaskId, normalizedTaskId].filter(Boolean))).map((taskId) => ({
          label: `ai666_seedance2_generations:${taskId}`,
          taskId,
          url: `${root}/v1/video/generations/${encodeURIComponent(taskId)}`,
        }))
      : buildQueryCandidates({
        root,
        provider,
        endpointStyle,
        rawTaskId,
        normalizedTaskId,
        strippedTaskId,
      })
  let lastMissingMessage = ''
  let lastTransientMessage = ''
  let bestResult:
    | {
        taskId: string
        status: 'running' | 'succeeded' | 'failed'
        outputUrls: string[]
        errorMessage?: string
        raw: any
      }
    | null = null

  for (const candidate of queryCandidates) {
    const candidateTaskId = candidate.taskId
    const url = candidate.url
    console.log('[vectorengine-debug] query-video-task', {
      taskId: rawTaskId,
      candidateLabel: candidate.label,
      candidateTaskId,
      provider,
      endpointStyle,
      baseUrl: root,
      model: primaryModel || undefined,
      contextProfile: resolveApifoxHubProfile(input.credentials, 'video'),
      queryUrl: url,
    })

    let json: any
    try {
      json = await getAtlasJson(url, key, `${VECTOR_ENGINE_LABEL} 查询视频任务 ${candidateTaskId}`)
    } catch (error) {
      const message = String((error as any)?.message ?? error ?? '')
      console.warn('[vectorengine-debug] query-video-task:error', {
        taskId: rawTaskId,
        candidateLabel: candidate.label,
        candidateTaskId,
        provider,
        endpointStyle,
        message: message.slice(0, 500),
      })
      if (/task_not_exist/i.test(message)) {
        lastMissingMessage = message
        continue
      }
      if (/502|503|504|bad gateway|gateway time-?out|temporarily unavailable|upstream connect error|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message)) {
        lastTransientMessage = message
        continue
      }
      throw error
    }

    if (isHtmlShellResponse(json)) {
      console.warn('[vectorengine-debug] query-video-task:html-shell-skip', {
        taskId: rawTaskId,
        candidateLabel: candidate.label,
        candidateTaskId,
        provider,
        endpointStyle,
        queryUrl: url,
      })
      continue
    }

    const outputUrl = pickOutputUrl(json)
    const outputUrls = pickAllOutputUrls(json).length ? pickAllOutputUrls(json) : outputUrl ? [outputUrl] : []
    const status = inferSucceededFromOutputUrls({
      status: normalizeTaskStatus(json),
      outputUrls,
      raw: json,
    })
    console.log('[vectorengine-debug] query-video-task:result', {
      taskId: rawTaskId,
      candidateLabel: candidate.label,
      candidateTaskId,
      provider,
      endpointStyle,
      status,
      outputUrlCount: outputUrls.length,
      outputUrlPreview: outputUrls[0] ? String(outputUrls[0]).slice(0, 180) : '',
      rawKeys: json && typeof json === 'object' ? Object.keys(json).slice(0, 20) : [],
      dataKeys: json?.data && typeof json.data === 'object' ? Object.keys(json.data).slice(0, 20) : [],
    })

    const result: {
      taskId: string
      status: 'running' | 'succeeded' | 'failed'
      outputUrls: string[]
      errorMessage?: string
      raw: any
    } = {
      taskId: rawTaskId,
      status: status as 'running' | 'succeeded' | 'failed',
      outputUrls,
      errorMessage: pickTaskErrorMessage(json) || undefined,
      raw: json,
    }

    if (status === 'succeeded' && outputUrls.length > 0) {
      return result
    }
    if (!bestResult) {
      bestResult = result
      continue
    }
    if (bestResult.status !== 'succeeded' && status === 'succeeded') {
      bestResult = result
      continue
    }
    if (bestResult.status === 'running' && status === 'failed') {
      bestResult = result
      continue
    }
    if (outputUrls.length > bestResult.outputUrls.length) {
      bestResult = result
    }
  }

  if (bestResult) return bestResult

  if (lastMissingMessage) {
    return {
      taskId: rawTaskId,
      status: 'failed',
      outputUrls: [],
      errorMessage: 'task_not_exist',
      raw: { terminalError: 'task_not_exist', message: lastMissingMessage },
    }
  }
  if (lastTransientMessage) {
    return {
      taskId: rawTaskId,
      status: 'running',
      outputUrls: [],
      errorMessage: undefined,
      raw: { transientError: lastTransientMessage },
    }
  }
  return {
    taskId: rawTaskId,
    status: 'running',
    outputUrls: [],
    errorMessage: undefined,
    raw: { emptyQueryResult: true },
  }
}

export async function pollTask(input: {
  credentials: ModelCredentials
  taskId: string
  baseUrl?: string
  endpointStyle?: string
  model?: string
}) {
  return await queryAsyncTask(input)
}

export async function submitTask(input: {
  credentials: ModelCredentials
  capability: Extract<UnifiedCapability, 'video_text_to_video' | 'video_image_to_video' | 'video_start_end_to_video' | 'video_reference_to_video'>
  prompt: string
  negativePrompt?: string
  image?: string
  lastImage?: string
}) {
  return await createVideoTask(input)
}

export async function syncRemoteTaskResult(input: {
  credentials: ModelCredentials
  taskId: string
  outDir: string
  baseUrl?: string
  endpointStyle?: string
  model?: string
}) {
  const providerName = providerLabel(input.credentials)
  const task = await queryAsyncTask({
    credentials: input.credentials,
    taskId: input.taskId,
    baseUrl: input.baseUrl,
    endpointStyle: input.endpointStyle,
    model: input.model,
  })
  if (task.status === 'failed') {
    throw new Error(task.errorMessage || `${providerName} video task failed: ${input.taskId}`)
  }
  if (task.status !== 'succeeded' || !task.outputUrls[0]) return { task, outputPath: undefined as string | undefined, synced: false }
  await mkdir(input.outDir, { recursive: true })
  const out = join(input.outDir, `vectorengine_video_${Date.now()}_${randomUUID()}.mp4`)
  await downloadAtlasToFile(task.outputUrls[0], out, `${providerName} 视频下载`)
  return { task, outputPath: out, synced: true }
}

export async function recoverTaskById(input: {
  credentials: ModelCredentials
  taskId: string
  outDir: string
  baseUrl?: string
  endpointStyle?: string
  model?: string
}) {
  return await syncRemoteTaskResult(input)
}

export async function createVideoTask(input: {
  credentials: ModelCredentials
  capability: Extract<UnifiedCapability, 'video_text_to_video' | 'video_image_to_video' | 'video_start_end_to_video' | 'video_reference_to_video'>
  prompt: string
  negativePrompt?: string
  image?: string
  lastImage?: string
  referenceImages?: string[]
  durationSec?: number
  aspectRatio?: '9:16' | '16:9'
  xibapiSize?: XibapiVideoSize
  motionStrength?: number
  enhancePrompt?: boolean
}) {
  const cfg = resolveApifoxHubCredentials(input.credentials, 'video')!
  const providerName = providerLabel(input.credentials)
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const modelCandidates = pickFallbackModels({
    cfg,
    credentials: input.credentials,
    capability: input.capability,
  })
  if (!modelCandidates.length) throw new Error(`未配置 ${input.capability} 对应的视频模型`)

  const referenceImages = Array.from(new Set((input.referenceImages ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
  const motionStrength = Math.max(1, Math.min(3, Math.round(Number(input.motionStrength ?? 2) || 2)))
  const durationSec = Math.max(1, Math.min(10, Math.round(Number(input.durationSec ?? 8) || 8)))
  const aspectRatio = input.aspectRatio === '16:9' ? '16:9' : '9:16'
  const enhancePrompt = input.enhancePrompt !== false
  const ai666Kling = isAi666KlingVideo(input.credentials, cfg)
  const ai666Seedance2 = isAi666Seedance2Video(input.credentials, cfg)
  const url = ai666Kling
    ? `${root}/v1/videos`
    : ai666Seedance2
      ? `${root}/v1/video/generations`
      : createUrlForProvider(root, cfg.videoProvider, input.capability, cfg.videoEndpointStyle)
  let lastFailureText = ''
  let lastFailureStatus = 0
  for (const model of modelCandidates) {
      let body: Record<string, any> = {
      model,
      prompt: input.prompt,
      negative_prompt: String(input.negativePrompt || '').trim() || undefined,
      aspect_ratio: aspectRatio,
      duration: durationSec,
      resolution: '720p',
      seed: -1,
      motion_strength: motionStrength,
      weight: motionStrength,
    }

    if (cfg.videoProvider === 'vidu') {
        body = {
          model,
          prompt: input.prompt,
          negative_prompt: String(input.negativePrompt || '').trim() || undefined,
          aspect_ratio: aspectRatio,
          duration: durationSec,
          ...(input.image ? { image: input.image } : {}),
          ...(input.lastImage ? { last_image: input.lastImage } : {}),
          motion_strength: motionStrength,
          weight: motionStrength,
        }
    } else if (cfg.videoProvider === 'veo') {
        body = {
          model,
          prompt: input.prompt,
          negative_prompt: String(input.negativePrompt || '').trim() || undefined,
          images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
          enhance_prompt: enhancePrompt,
          aspect_ratio: aspectRatio,
          generate_audio: false,
          audio_generation: 'Disabled',
          motion_strength: motionStrength,
          weight: motionStrength,
        }
    } else if (cfg.videoProvider === 'jimeng') {
        body = {
          model,
          prompt: input.prompt,
          negative_prompt: String(input.negativePrompt || '').trim() || undefined,
          image_url: input.image,
          last_image_url: input.lastImage,
          metadata: {
            aspect_ratio: aspectRatio,
            duration: durationSec,
            motion_strength: motionStrength,
            weight: motionStrength,
          },
        }
    } else if (cfg.videoProvider === 'seedance2') {
        body = {
          model,
          content: [
            { type: 'text', text: input.prompt },
            ...(input.negativePrompt ? [{ type: 'text', text: `Negative constraints: ${input.negativePrompt}` }] : []),
          ...(input.image ? [{ type: 'image_url', image_url: { url: input.image } }] : []),
          ...(input.lastImage ? [{ type: 'image_url', image_url: { url: input.lastImage } }] : []),
          ...referenceImages.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
          generate_audio: false,
          ratio: aspectRatio,
          duration: durationSec,
          watermark: false,
          motion_strength: motionStrength,
          weight: motionStrength,
        }
    } else if (cfg.videoProvider === 'kling') {
        body = {
          model,
          prompt: input.prompt,
          negative_prompt: String(input.negativePrompt || '').trim() || undefined,
          ...(input.image ? { image: input.image } : {}),
          ...(input.lastImage ? { last_image: input.lastImage } : {}),
          aspect_ratio: aspectRatio,
          duration: durationSec,
          resolution: '720p',
          seed: -1,
          motion_strength: motionStrength,
          weight: motionStrength,
        }
    } else if (cfg.videoProvider === 'grok') {
        body = {
          model,
          prompt: input.prompt,
          images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
          aspect_ratio: aspectRatio,
          size: '1080P',
          motion_strength: motionStrength,
          weight: motionStrength,
        }
    } else if (cfg.videoProvider === 'xibapi') {
        body = {
          model,
          prompt: input.prompt,
          size: xibapiSizeByAspectRatio(input.aspectRatio, input.xibapiSize),
          images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
        motion_strength: motionStrength,
        weight: motionStrength,
      }
    } else if (cfg.videoProvider === 'gaorui') {
      const images = buildGaoruiImages({
        capability: input.capability,
        image: input.image,
        lastImage: input.lastImage,
        referenceImages,
      })
      body = {
        model,
        prompt: input.prompt,
        negative_prompt: String(input.negativePrompt || '').trim() || undefined,
        duration: durationSec,
        resolution: '720p',
        aspect_ratio: gaoruiAspectRatio(aspectRatio),
        ...(images.length ? { images } : {}),
        motion_strength: motionStrength,
        weight: motionStrength,
        }
    } else if (cfg.videoProvider === 'openai_video' || cfg.videoProvider === 'sora') {
      body =
        cfg.videoEndpointStyle === 'openai_video'
          ? {
              model,
              prompt: input.prompt,
              negative_prompt: String(input.negativePrompt || '').trim() || undefined,
              images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
              aspect_ratio: aspectRatio,
              enhance_prompt: enhancePrompt,
              motion_strength: motionStrength,
              weight: motionStrength,
            }
          : {
              model,
              prompt: input.prompt,
              negative_prompt: String(input.negativePrompt || '').trim() || undefined,
              ...(input.image ? { image: input.image } : {}),
              ...(input.lastImage ? { last_image: input.lastImage } : {}),
              aspect_ratio: aspectRatio,
              duration: durationSec,
              resolution: '720p',
              seed: -1,
              motion_strength: motionStrength,
              weight: motionStrength,
            }
    } else {
      if (input.image) body.image = input.image
      if (input.lastImage) body.last_image = input.lastImage
    }

    if (ai666Kling) {
      const images = [input.image, input.lastImage, ...referenceImages].filter(Boolean)
      body = {
        model,
        prompt: input.prompt,
        seconds: String(durationSec),
        ...(images.length ? { images } : {}),
        size: '1280x720',
        motion_strength: motionStrength,
        weight: motionStrength,
        metadata: {
          output_config: {
            duration: durationSec,
            resolution: '720P',
            aspect_ratio: aspectRatio,
            audio_generation: 'Enabled',
            motion_strength: motionStrength,
            weight: motionStrength,
          },
        },
      }
    } else if (ai666Seedance2) {
      const duration = clampSeedanceDuration(input.durationSec ?? 5)
      body = {
        model,
        content: [
          { type: 'text', text: input.prompt },
          ...(input.image ? [{ type: 'image_url', image_url: { url: input.image }, role: 'first_frame' }] : []),
          ...(input.lastImage ? [{ type: 'image_url', image_url: { url: input.lastImage }, role: 'last_frame' }] : []),
          ...referenceImages.map((url, index) => ({
            type: 'image_url' as const,
            image_url: { url },
            ...(index === 0 && !input.image ? { role: 'first_frame' } : {}),
          })),
        ],
        metadata: {
          duration,
          resolution: '720p',
          ratio: aspectRatio,
          motion_strength: motionStrength,
          weight: motionStrength,
        },
      }
    }

    console.log('[vectorengine-debug] create-video-task', {
      capability: input.capability,
      provider: cfg.videoProvider,
      endpointStyle: cfg.videoEndpointStyle,
      baseUrl: root,
      createUrl: url,
      model,
      hasImage: Boolean(input.image),
      hasLastImage: Boolean(input.lastImage),
      referenceImageCount: referenceImages.length,
      fallbackCandidates: modelCandidates,
    })

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(key),
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
    if (!res.ok) {
      lastFailureText = text
      lastFailureStatus = res.status
      if (isModelChannelUnavailable(res.status, text)) {
        console.warn('[vectorengine-debug] create-video-task:model-unavailable-retry', {
          model,
          status: res.status,
          message: text.slice(0, 300),
        })
        continue
      }
      throw new Error(`${providerName} 视频请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
    }
    const directOutputUrl = pickOutputUrl(json)
    const taskId = pickTaskId(json)
    if (!taskId && !directOutputUrl) {
      console.error('[vectorengine-debug] create-video-task:missing-task-id', {
        provider: cfg.videoProvider,
        capability: input.capability,
        model,
        endpointStyle: cfg.videoEndpointStyle,
        response: json,
      })
    }
    if (!taskId && !directOutputUrl) {
      console.warn('[vectorengine-debug] create-video-task:missing-query-handle-returning-raw-response', {
        provider: cfg.videoProvider,
        capability: input.capability,
        model,
        endpointStyle: cfg.videoEndpointStyle,
        response: json,
      })
    }
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
  throw new Error(`${providerName} 视频请求失败 HTTP ${lastFailureStatus || 503}: ${String(lastFailureText || '所有候选模型通道不可用').slice(0, 500)}`)
}

export async function generateVideo(input: {
  credentials: ModelCredentials
  capability: Extract<UnifiedCapability, 'video_text_to_video' | 'video_image_to_video' | 'video_start_end_to_video' | 'video_reference_to_video'>
  prompt: string
  negativePrompt?: string
  outDir: string
  image?: string
  lastImage?: string
  referenceImages?: string[]
  durationSec?: number
  aspectRatio?: '9:16' | '16:9'
  xibapiSize?: XibapiVideoSize
  motionStrength?: number
  enhancePrompt?: boolean
}) {
  const cfg = resolveApifoxHubCredentials(input.credentials, 'video')!
  const providerName = providerLabel(input.credentials)
  const root = baseUrl(input.credentials)
  const key = apiKey(input.credentials)
  const model = modelForCapability(cfg, input.capability)
  if (!model) throw new Error(`未配置 ${input.capability} 对应的视频模型`)

  const referenceImages = Array.from(new Set((input.referenceImages ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
  const motionStrength = Math.max(1, Math.min(3, Math.round(Number(input.motionStrength ?? 2) || 2)))
  const durationSec = Math.max(1, Math.min(10, Math.round(Number(input.durationSec ?? 8) || 8)))
  const aspectRatio = input.aspectRatio === '16:9' ? '16:9' : '9:16'
  const enhancePrompt = input.enhancePrompt !== false
  const ai666Kling = isAi666KlingVideo(input.credentials, cfg)
  const ai666Seedance2 = isAi666Seedance2Video(input.credentials, cfg)
  let url = ai666Kling
    ? `${root}/v1/videos`
    : ai666Seedance2
      ? `${root}/v1/video/generations`
      : createUrlForProvider(root, cfg.videoProvider, input.capability, cfg.videoEndpointStyle)
  let body: Record<string, any> = {
    model,
    prompt: input.prompt,
    negative_prompt: String(input.negativePrompt || '').trim() || undefined,
    aspect_ratio: aspectRatio,
    duration: durationSec,
    resolution: '720p',
    seed: -1,
    motion_strength: motionStrength,
    weight: motionStrength,
  }

  if (cfg.videoProvider === 'vidu') {
    body = {
      model,
      prompt: input.prompt,
      negative_prompt: String(input.negativePrompt || '').trim() || undefined,
      aspect_ratio: aspectRatio,
      duration: durationSec,
      ...(input.image ? { image: input.image } : {}),
      ...(input.lastImage ? { last_image: input.lastImage } : {}),
      motion_strength: motionStrength,
      weight: motionStrength,
    }
  } else if (cfg.videoProvider === 'veo') {
    body = {
      model,
      prompt: input.prompt,
      negative_prompt: String(input.negativePrompt || '').trim() || undefined,
      images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
      enhance_prompt: enhancePrompt,
      aspect_ratio: aspectRatio,
      generate_audio: false,
      audio_generation: 'Disabled',
      motion_strength: motionStrength,
      weight: motionStrength,
    }
  } else if (cfg.videoProvider === 'jimeng') {
    body = {
      model,
      prompt: input.prompt,
      negative_prompt: String(input.negativePrompt || '').trim() || undefined,
      image_url: input.image,
      last_image_url: input.lastImage,
      metadata: {
        aspect_ratio: aspectRatio,
        duration: durationSec,
        motion_strength: motionStrength,
        weight: motionStrength,
      },
    }
  } else if (cfg.videoProvider === 'seedance2') {
    body = {
      model,
      content: [
        { type: 'text', text: input.prompt },
        ...(input.negativePrompt ? [{ type: 'text', text: `Negative constraints: ${input.negativePrompt}` }] : []),
        ...(input.image ? [{ type: 'image_url', image_url: { url: input.image } }] : []),
        ...(input.lastImage ? [{ type: 'image_url', image_url: { url: input.lastImage } }] : []),
        ...referenceImages.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ],
      generate_audio: false,
      ratio: aspectRatio,
      duration: clampSeedanceDuration(durationSec),
      watermark: false,
      motion_strength: motionStrength,
      weight: motionStrength,
    }
  } else if (cfg.videoProvider === 'kling') {
    body = {
      model,
      prompt: input.prompt,
      negative_prompt: String(input.negativePrompt || '').trim() || undefined,
      ...(input.image ? { image: input.image } : {}),
      ...(input.lastImage ? { last_image: input.lastImage } : {}),
      aspect_ratio: aspectRatio,
      duration: durationSec,
      resolution: '720p',
      seed: -1,
      motion_strength: motionStrength,
      weight: motionStrength,
    }
  } else if (cfg.videoProvider === 'grok') {
    body = {
      model,
      prompt: input.prompt,
      images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
      aspect_ratio: aspectRatio,
      size: '1080P',
      motion_strength: motionStrength,
      weight: motionStrength,
    }
  } else if (cfg.videoProvider === 'xibapi') {
    body = {
      model,
      prompt: input.prompt,
      size: xibapiSizeByAspectRatio(input.aspectRatio, input.xibapiSize),
      images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
      motion_strength: motionStrength,
      weight: motionStrength,
    }
  } else if (cfg.videoProvider === 'gaorui') {
    const images = buildGaoruiImages({
      capability: input.capability,
      image: input.image,
      lastImage: input.lastImage,
      referenceImages,
    })
    body = {
      model,
      prompt: input.prompt,
      negative_prompt: String(input.negativePrompt || '').trim() || undefined,
      duration: durationSec,
      resolution: '720p',
      aspect_ratio: gaoruiAspectRatio(aspectRatio),
      ...(images.length ? { images } : {}),
      motion_strength: motionStrength,
      weight: motionStrength,
    }
  } else if (cfg.videoProvider === 'openai_video' || cfg.videoProvider === 'sora') {
    body =
      cfg.videoEndpointStyle === 'openai_video'
        ? {
            model,
            prompt: input.prompt,
            negative_prompt: String(input.negativePrompt || '').trim() || undefined,
            images: [input.image, input.lastImage, ...referenceImages].filter(Boolean),
            aspect_ratio: aspectRatio,
            enhance_prompt: enhancePrompt,
            motion_strength: motionStrength,
            weight: motionStrength,
          }
        : {
            model,
            prompt: input.prompt,
            negative_prompt: String(input.negativePrompt || '').trim() || undefined,
            ...(input.image ? { image: input.image } : {}),
            ...(input.lastImage ? { last_image: input.lastImage } : {}),
            aspect_ratio: aspectRatio,
            duration: durationSec,
            resolution: '720p',
            seed: -1,
            motion_strength: motionStrength,
            weight: motionStrength,
          }
  } else {
    if (input.image) body.image = input.image
    if (input.lastImage) body.last_image = input.lastImage
  }

  if (ai666Kling) {
    const images = [input.image, input.lastImage, ...referenceImages].filter(Boolean)
    body = {
      model,
      prompt: input.prompt,
      seconds: String(durationSec),
      ...(images.length ? { images } : {}),
      size: '1280x720',
      motion_strength: motionStrength,
      weight: motionStrength,
      metadata: {
        output_config: {
          duration: durationSec,
          resolution: '720P',
          aspect_ratio: aspectRatio,
          audio_generation: 'Enabled',
          motion_strength: motionStrength,
          weight: motionStrength,
        },
      },
    }
  } else if (ai666Seedance2) {
    const duration = clampSeedanceDuration(input.durationSec ?? 5)
    body = {
      model,
      content: [
        { type: 'text', text: input.prompt },
        ...(input.image ? [{ type: 'image_url', image_url: { url: input.image }, role: 'first_frame' }] : []),
        ...(input.lastImage ? [{ type: 'image_url', image_url: { url: input.lastImage }, role: 'last_frame' }] : []),
        ...referenceImages.map((url, index) => ({
          type: 'image_url' as const,
          image_url: { url },
          ...(index === 0 && !input.image ? { role: 'first_frame' } : {}),
        })),
      ],
      metadata: {
        duration,
        resolution: '720p',
        ratio: aspectRatio,
        motion_strength: motionStrength,
        weight: motionStrength,
      },
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(key),
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
  if (!res.ok) throw new Error(`${providerName} 视频请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)

  const directOutputUrl = pickOutputUrl(json)
  const taskId = pickTaskId(json)
  if (!taskId && directOutputUrl) {
    await mkdir(input.outDir, { recursive: true })
    const out = join(input.outDir, `vectorengine_video_${Date.now()}_${randomUUID()}.mp4`)
    await downloadAtlasToFile(directOutputUrl, out, `${providerName} 视频下载`)
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
  if (!taskId) throw new Error(`${providerName} 视频任务缺少 id: ${text.slice(0, 500)}`)

  const started = Date.now()
  const timeoutMs = Math.max(Number(cfg.defaultTimeoutMs || 0), 600000)
  const pollMs = Math.max(5000, Number(cfg.defaultPollIntervalMs || 0) || 2000)
  let lastTransientError = ''
  while (Date.now() - started < timeoutMs) {
    let task: Awaited<ReturnType<typeof queryAsyncTask>>
    try {
      task = await queryAsyncTask({
        credentials: input.credentials,
        taskId,
        baseUrl: cfg.baseUrl,
        endpointStyle: cfg.videoEndpointStyle,
        model,
      })
    } catch (error) {
      if (isTransientQueryError(error)) {
        lastTransientError = String((error as any)?.message ?? error)
        await new Promise((resolve) => setTimeout(resolve, pollMs))
        continue
      }
      throw error
    }
    if (task.status === 'failed') throw new Error(task.errorMessage || `${providerName} 视频任务失败: ${taskId}`)
    if (task.status === 'succeeded' && task.outputUrls[0]) {
      await mkdir(input.outDir, { recursive: true })
      const out = join(input.outDir, `vectorengine_video_${Date.now()}_${randomUUID()}.mp4`)
      await downloadAtlasToFile(task.outputUrls[0], out, `${providerName} 视频下载`)
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
    const task = await queryAsyncTask({
      credentials: input.credentials,
      taskId,
      baseUrl: cfg.baseUrl,
      endpointStyle: cfg.videoEndpointStyle,
      model,
    })
    if (task.status === 'succeeded' && task.outputUrls[0]) {
      await mkdir(input.outDir, { recursive: true })
      const out = join(input.outDir, `vectorengine_video_${Date.now()}_${randomUUID()}.mp4`)
      await downloadAtlasToFile(task.outputUrls[0], out, `${providerName} 视频下载`)
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
  throw new Ai666TaskTimeoutError(providerName, taskId, lastTransientError || undefined)
}
