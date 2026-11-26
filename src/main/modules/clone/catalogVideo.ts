/**
 * 按模型清单（src/shared/videoModels.ts）提交 / 查询图生视频任务。
 * 每个模型自带平台，不再依赖「设置里只能选一个视频平台」。
 */
import {
  VIDEO_CATALOG_PLATFORM_LABELS,
  VIDEO_MODEL_CATALOG,
  buildVideoQueryPath,
  buildVideoSubmitRequest,
  findVideoModelSpec,
  parseVideoTaskResponse,
  resolveEnabledVideoModelIds,
  resolveVideoParams,
  type VideoCatalogPlatform,
  type VideoGenerateParams,
  type VideoModelSpec,
  type VideoTaskSnapshot,
} from '../../../shared/videoModels'
import type { ModelCredentials } from './types'
import { withUsageCharge } from './usageMeter'

/** 任务记录里 videoTaskProvider 用这个值，查询时就知道走清单 */
export const CATALOG_VIDEO_PROVIDER = 'video_catalog'

type PlatformAccess = { baseUrl: string; apiKey: string }

export function resolveCatalogPlatformAccess(credentials: ModelCredentials, platform: VideoCatalogPlatform): PlatformAccess | null {
  const clean = (value: unknown) => String(value ?? '').trim()
  if (platform === 'grsai') {
    const apiKey = clean(credentials.grsaiApiKey)
    const baseUrl = (clean(credentials.grsaiHost) || 'https://grsaiapi.com').replace(/\/+$/, '')
    return apiKey ? { baseUrl, apiKey } : null
  }
  const hub = platform === 'gaorui' ? credentials.gaoruiHub : credentials.xibapiHub
  const apiKey = clean(hub?.apiKey)
  const baseUrl = clean(hub?.baseUrl).replace(/\/+$/, '')
  return apiKey && baseUrl ? { baseUrl, apiKey } : null
}

export type CatalogVideoModelOption = {
  id: string
  label: string
  platform: VideoCatalogPlatform
  platformLabel: string
  family: string
  lastFrame: boolean
  durations: number[]
  defaultDuration: number
  aspectRatios: string[]
  resolutions: string[]
  defaultResolution: string
  note?: string
}

function toOption(spec: VideoModelSpec): CatalogVideoModelOption {
  return {
    id: spec.id,
    label: spec.label,
    platform: spec.platform,
    platformLabel: VIDEO_CATALOG_PLATFORM_LABELS[spec.platform],
    family: spec.family,
    lastFrame: spec.lastFrame,
    durations: spec.durations,
    defaultDuration: spec.defaultDuration,
    aspectRatios: spec.aspectRatios,
    resolutions: spec.resolutions,
    defaultResolution: spec.defaultResolution,
    note: spec.note,
  }
}

/** 当前账号能用的图生视频模型：后台打开了 + 这个平台有 Key */
export function listAvailableCatalogVideoModels(credentials: ModelCredentials): { models: CatalogVideoModelOption[]; defaultModelId?: string } {
  const enabled = new Set(resolveEnabledVideoModelIds(credentials.videoModelSwitches))
  const models = VIDEO_MODEL_CATALOG.filter((spec) => enabled.has(spec.id) && resolveCatalogPlatformAccess(credentials, spec.platform)).map(toOption)
  const preferred = String(credentials.videoDefaultModelId || '').trim()
  const defaultModelId = models.find((item) => item.id === preferred)?.id ?? models[0]?.id
  return { models, defaultModelId }
}

/** 任务选的模型（没选就用后台默认）；不可用返回 undefined，调用方走旧逻辑 */
export function pickCatalogVideoModel(credentials: ModelCredentials, requestedId?: string): VideoModelSpec | undefined {
  const { models, defaultModelId } = listAvailableCatalogVideoModels(credentials)
  const requested = String(requestedId || '').trim()
  if (requested) {
    const spec = findVideoModelSpec(requested)
    if (!spec) throw new Error(`没有这个视频模型：${requested}`)
    if (!models.some((item) => item.id === requested)) {
      throw new Error(`视频模型「${spec.label}」已被关闭或平台未配置，请换一个模型`)
    }
    return spec
  }
  return findVideoModelSpec(defaultModelId)
}

function authHeaders(apiKey: string) {
  const key = String(apiKey || '').trim()
  return { Authorization: /^bearer\s+/i.test(key) ? key : `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function readJson(res: Response) {
  const text = await res.text()
  try {
    return { text, json: text ? JSON.parse(text) : {} }
  } catch {
    return { text, json: null }
  }
}

function platformError(spec: VideoModelSpec, status: number, text: string, json: any) {
  const message = String(json?.error?.message ?? (typeof json?.error === 'string' ? json.error : '') ?? json?.message ?? '').trim() || text.slice(0, 300)
  const code = String(json?.error?.code ?? '').trim()
  const err = new Error(`${VIDEO_CATALOG_PLATFORM_LABELS[spec.platform]} ${spec.label} 提交失败（HTTP ${status}${code ? ` ${code}` : ''}）：${message}`)
  ;(err as any).code = code
  return err
}

export type CatalogVideoSubmitResult = {
  spec: VideoModelSpec
  taskId?: string
  snapshot: VideoTaskSnapshot
  request: { path: string; body: Record<string, unknown> }
}

async function submitUnmetered(input: { credentials: ModelCredentials; spec: VideoModelSpec; params: VideoGenerateParams; timeoutMs?: number }): Promise<CatalogVideoSubmitResult> {
  const { spec } = input
  const access = resolveCatalogPlatformAccess(input.credentials, spec.platform)
  if (!access) throw new Error(`没有配置 ${VIDEO_CATALOG_PLATFORM_LABELS[spec.platform]} 的接口 Key`)
  const params = resolveVideoParams(spec, input.params)
  if (spec.urlOnly && /^data:/i.test(params.firstFrameUrl)) throw new Error(`${spec.label} 只能传公网图片地址，不能传 base64`)
  const request = buildVideoSubmitRequest(spec, params)
  const res = await fetch(`${access.baseUrl}${request.path}`, {
    method: 'POST',
    headers: authHeaders(access.apiKey),
    body: JSON.stringify(request.body),
    // MiniMax 这类模型提交本身就慢，高瑞建议创建超时 ≥ 120 秒
    signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
  })
  const { text, json } = await readJson(res)
  if (!res.ok) {
    const failed = json && typeof json === 'object' && typeof json.status === 'string' ? parseVideoTaskResponse(json) : null
    if (failed?.status === 'failed') throw new Error(`${spec.label} 生成失败：${failed.error}`)
    throw platformError(spec, res.status, text, json)
  }
  const snapshot = parseVideoTaskResponse(json)
  if (snapshot.status === 'failed') throw new Error(`${spec.label} 生成失败：${snapshot.error}`)
  if (!snapshot.taskId && !snapshot.url) throw new Error(`${spec.label} 返回里没有任务 id：${text.slice(0, 300)}`)
  return { spec, taskId: snapshot.taskId, snapshot, request }
}

/** 提交图生视频任务：提交前冻结点数，失败退回（电脑端商业版由云端代理扣点） */
export async function submitCatalogVideoTask(input: { credentials: ModelCredentials; spec: VideoModelSpec; params: VideoGenerateParams; timeoutMs?: number }) {
  return await withUsageCharge({ capability: 'video', platform: input.spec.platform, model: input.spec.model }, () => submitUnmetered(input))
}

/** 查一次任务状态。传 modelId（任务记录里的 videoTaskModel） */
export async function queryCatalogVideoTask(input: { credentials: ModelCredentials; modelId: string; taskId: string }): Promise<VideoTaskSnapshot> {
  const spec = findVideoModelSpec(input.modelId)
  if (!spec) throw new Error(`没有这个视频模型：${input.modelId}`)
  const access = resolveCatalogPlatformAccess(input.credentials, spec.platform)
  if (!access) throw new Error(`没有配置 ${VIDEO_CATALOG_PLATFORM_LABELS[spec.platform]} 的接口 Key`)
  const res = await fetch(`${access.baseUrl}${buildVideoQueryPath(spec, input.taskId)}`, {
    method: 'GET',
    headers: authHeaders(access.apiKey),
    signal: AbortSignal.timeout(60_000),
  })
  const { text, json } = await readJson(res)
  if (res.status === 404 || (spec.format === 'grsai-generate' && res.status === 400 && /not.?found|不存在/i.test(text))) {
    return { taskId: input.taskId, status: 'failed', error: '平台已查不到这个任务（可能已过期），请重新生成' }
  }
  // GRS 失败 / 违规时 HTTP 400 也带着 status
  if (!res.ok && json && typeof json === 'object' && typeof json.status === 'string') {
    const snapshot = parseVideoTaskResponse(json)
    if (snapshot.status === 'failed') return snapshot
  }
  if (!res.ok) {
    // 5xx / 429 当作暂时查不到，下次再查
    if (res.status >= 500 || res.status === 429) return { taskId: input.taskId, status: 'running' }
    throw platformError(spec, res.status, text, json)
  }
  return parseVideoTaskResponse(json)
}
