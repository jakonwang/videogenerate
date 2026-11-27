/**
 * 图生视频模型清单 + 请求格式适配器。
 *
 * 接新平台 / 新模型：
 *  - 请求格式和已有的一样 → 只在 VIDEO_MODEL_CATALOG 里加一条；
 *  - 格式不一样 → 在 VideoRequestFormat 加一种，并在 buildVideoSubmitRequest 里写它的请求体。
 * 返回值统一用 parseVideoTaskResponse 读（各家的状态值、视频地址字段都在里面兜住）。
 *
 * 文档来源（2026-11）：高瑞 gaoruitech.apifox.cn、小扳手 5208.ai/docs（设置里叫 XIBAPI）、GRS.AI qmy27nhsd9.apifox.cn。
 * 纯函数，桌面端主进程、服务器、管理后台都能引用。
 */

export type VideoCatalogPlatform = 'gaorui' | 'xibapi' | 'grsai'

export const VIDEO_CATALOG_PLATFORM_LABELS: Record<VideoCatalogPlatform, string> = {
  gaorui: '高瑞',
  xibapi: '小扳手',
  grsai: 'GRS.AI',
}

export type VideoRequestFormat =
  | 'gaorui-veo'
  | 'gaorui-grok'
  | 'gaorui-omni'
  | 'gaorui-minimax'
  | 'gaorui-kling'
  | 'gaorui-wan'
  | 'gaorui-seedance'
  | 'xib-videos'
  | 'grsai-generate'

export type VideoModelSpec = {
  /** 全局唯一：`平台:模型名`，后台开关、任务记录都用它 */
  id: string
  platform: VideoCatalogPlatform
  /** 发给平台的真实模型名 */
  model: string
  /** 界面显示名 */
  label: string
  family: string
  format: VideoRequestFormat
  /** 支持首帧 + 尾帧 */
  lastFrame: boolean
  /** 可选时长（秒）；只有一项 = 固定时长 */
  durations: number[]
  defaultDuration: number
  aspectRatios: string[]
  resolutions: string[]
  defaultResolution: string
  /** 平台只收公网 URL（不收 base64） */
  urlOnly: boolean
  /** 后台没设置过开关时是否默认打开 */
  defaultEnabled: boolean
  /** 小扳手专用：要不要发 size（宽x高）、seconds、first_last_frame */
  xib?: { size?: boolean; seconds?: boolean; firstLastFlag?: boolean }
  /** 首尾帧模式下的最长时长 */
  maxDurationWithLastFrame?: number
  note?: string
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const RATIOS_6 = ['9:16', '16:9', '1:1', '3:4', '4:3', '21:9']

function spec(input: Omit<VideoModelSpec, 'id' | 'defaultEnabled' | 'urlOnly'> & { defaultEnabled?: boolean; urlOnly?: boolean }): VideoModelSpec {
  return {
    ...input,
    id: `${input.platform}:${input.model}`,
    defaultEnabled: input.defaultEnabled ?? true,
    urlOnly: input.urlOnly ?? input.platform === 'gaorui',
  }
}

export const VIDEO_MODEL_CATALOG: VideoModelSpec[] = [
  // ---------------- 高瑞：POST /v1/videos，GET /v1/videos/{id}，素材只收公网 URL
  spec({ platform: 'gaorui', model: 'veo_3_1-fl', label: 'Veo 3.1', family: 'Veo', format: 'gaorui-veo', lastFrame: true, durations: [8], defaultDuration: 8, aspectRatios: ['9:16', '16:9'], resolutions: ['720p', '1080p', 'lite'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'grok-imagine-video-1.5', label: 'Grok Imagine 1.5', family: 'Grok', format: 'gaorui-grok', lastFrame: false, durations: range(4, 15), defaultDuration: 6, aspectRatios: ['9:16', '16:9', '1:1'], resolutions: ['480p', '720p'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'omni_flash_8s', label: 'Omni Flash 8 秒', family: 'Omni', format: 'gaorui-omni', lastFrame: true, durations: [8], defaultDuration: 8, aspectRatios: ['9:16', '16:9'], resolutions: ['720p', '1080p', '4k'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'omni_flash_10s', label: 'Omni Flash 10 秒', family: 'Omni', format: 'gaorui-omni', lastFrame: true, durations: [10], defaultDuration: 10, aspectRatios: ['9:16', '16:9'], resolutions: ['720p', '1080p', '4k'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'omni_flash-1.2', label: 'Omni Flash 1.2', family: 'Omni', format: 'gaorui-omni', lastFrame: true, durations: range(3, 15), defaultDuration: 10, maxDurationWithLastFrame: 10, aspectRatios: ['9:16', '16:9'], resolutions: ['360p', '720p', '1080p', '4k'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'minimax-h3', label: 'MiniMax H3', family: 'MiniMax', format: 'gaorui-minimax', lastFrame: true, durations: range(1, 15), defaultDuration: 6, aspectRatios: [...RATIOS_6, 'adaptive'], resolutions: ['768p'], defaultResolution: '768p', note: '生成较慢，5 秒视频约 3 分钟' }),
  spec({ platform: 'gaorui', model: 'kling-v2.1', label: 'Kling 2.1', family: 'Kling', format: 'gaorui-kling', lastFrame: false, durations: [5, 10], defaultDuration: 5, aspectRatios: ['9:16', '16:9', '1:1'], resolutions: ['720p'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'kling-v2.6', label: 'Kling 2.6', family: 'Kling', format: 'gaorui-kling', lastFrame: false, durations: [5, 10], defaultDuration: 5, aspectRatios: ['9:16', '16:9', '1:1'], resolutions: ['720p'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'kling-v3.0', label: 'Kling 3.0', family: 'Kling', format: 'gaorui-kling', lastFrame: true, durations: [10], defaultDuration: 10, aspectRatios: ['9:16', '16:9', '1:1'], resolutions: ['720p'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'kling-v4.0-flash', label: 'Kling 4.0 Flash', family: 'Kling', format: 'gaorui-kling', lastFrame: false, durations: [5, 10], defaultDuration: 5, aspectRatios: ['9:16', '16:9', '1:1'], resolutions: ['720p'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'wan3.0', label: 'Wan 3.0', family: 'Wan', format: 'gaorui-wan', lastFrame: true, durations: range(2, 30), defaultDuration: 5, aspectRatios: ['9:16', '16:9', '1:1', '3:4', '4:3', '21:9', 'adaptive'], resolutions: ['480p', '720p', '1080p'], defaultResolution: '720p', defaultEnabled: false, note: '高瑞文档说需平台单独开通线路，默认关闭' }),
  spec({ platform: 'gaorui', model: 'seedance-2.0-fast', label: 'Seedance 2.0 Fast', family: 'Seedance', format: 'gaorui-seedance', lastFrame: true, durations: range(4, 15), defaultDuration: 5, aspectRatios: RATIOS_6, resolutions: ['480p', '720p'], defaultResolution: '720p' }),
  spec({ platform: 'gaorui', model: 'seedance-2.0-mini', label: 'Seedance 2.0 Mini', family: 'Seedance', format: 'gaorui-seedance', lastFrame: true, durations: range(4, 15), defaultDuration: 5, aspectRatios: RATIOS_6, resolutions: ['480p', '720p'], defaultResolution: '720p' }),

  // ---------------- 小扳手（XIBAPI / 5208.ai）：POST /v1/videos，GET /v1/videos/{id}，收 URL 或 base64
  spec({ platform: 'xibapi', model: 'veo_3_1-fast-fl', label: 'Veo 3.1 Fast', family: 'Veo', format: 'xib-videos', lastFrame: true, durations: [8], defaultDuration: 8, aspectRatios: ['9:16', '16:9'], resolutions: ['720p'], defaultResolution: '720p', xib: { size: true } }),
  spec({ platform: 'xibapi', model: 'veo_3_1-lite-fl', label: 'Veo 3.1 Lite', family: 'Veo', format: 'xib-videos', lastFrame: true, durations: [8], defaultDuration: 8, aspectRatios: ['9:16', '16:9'], resolutions: ['720p'], defaultResolution: '720p', xib: { size: true } }),
  spec({ platform: 'xibapi', model: 'veo_3_1-lite-hd-fl', label: 'Veo 3.1 Lite 1080p', family: 'Veo', format: 'xib-videos', lastFrame: true, durations: [8], defaultDuration: 8, aspectRatios: ['9:16', '16:9'], resolutions: ['1080p'], defaultResolution: '1080p', xib: { size: true } }),
  spec({ platform: 'xibapi', model: 'omni_flash-10s-fl', label: 'Omni 1.1 10 秒', family: 'Omni', format: 'xib-videos', lastFrame: true, durations: [10], defaultDuration: 10, aspectRatios: ['9:16', '16:9'], resolutions: ['720p'], defaultResolution: '720p', xib: { size: true } }),
  spec({ platform: 'xibapi', model: 'omni_1_2_flash-10s-fl', label: 'Omni 1.2 10 秒', family: 'Omni', format: 'xib-videos', lastFrame: true, durations: [10], defaultDuration: 10, aspectRatios: ['9:16', '16:9'], resolutions: ['720p'], defaultResolution: '720p', xib: { size: true } }),
  spec({ platform: 'xibapi', model: 'seedance-2.0', label: 'Seedance 2.0', family: 'Seedance', format: 'xib-videos', lastFrame: true, durations: range(4, 15), defaultDuration: 5, aspectRatios: RATIOS_6, resolutions: ['480p'], defaultResolution: '480p', xib: { seconds: true, firstLastFlag: true }, note: '小扳手只支持 480p；2026-11-26 实测时平台提示该模型维护中' }),
  spec({ platform: 'xibapi', model: 'seedance-2.0-mini', label: 'Seedance 2.0 Mini', family: 'Seedance', format: 'xib-videos', lastFrame: true, durations: range(4, 15), defaultDuration: 5, aspectRatios: RATIOS_6, resolutions: ['480p'], defaultResolution: '480p', xib: { seconds: true, firstLastFlag: true }, note: '小扳手只支持 480p' }),
  spec({ platform: 'xibapi', model: 'muse-video-fl', label: 'Muse', family: 'Muse', format: 'xib-videos', lastFrame: true, durations: [10, 20, 30], defaultDuration: 10, aspectRatios: ['9:16', '16:9', '1:1'], resolutions: ['720p', '1080p'], defaultResolution: '720p', xib: { seconds: true } }),
  spec({ platform: 'xibapi', model: 'minimax-h3', label: 'MiniMax H3', family: 'MiniMax', format: 'xib-videos', lastFrame: true, durations: range(4, 15), defaultDuration: 6, aspectRatios: RATIOS_6, resolutions: ['480p', '768p'], defaultResolution: '768p', xib: { seconds: true, firstLastFlag: true } }),
  spec({ platform: 'xibapi', model: 'minimax-h3-max', label: 'MiniMax H3 Max', family: 'MiniMax', format: 'xib-videos', lastFrame: true, durations: range(4, 15), defaultDuration: 6, aspectRatios: RATIOS_6, resolutions: ['480p', '768p'], defaultResolution: '768p', xib: { seconds: true, firstLastFlag: true } }),

  // ---------------- GRS.AI：POST /v1/api/generate，GET /v1/api/result?id=，收 URL 或 base64
  // minimax-h3 在 GRS 上首尾帧必须两张都传，单张图做不了图生视频，所以没收录
  spec({ platform: 'grsai', model: 'agnes-video-2.5', label: 'Agnes Video 2.5', family: 'Agnes', format: 'grsai-generate', lastFrame: true, durations: range(4, 12), defaultDuration: 6, aspectRatios: ['9:16', '16:9', '1:1', '3:4', '4:3', '21:9'], resolutions: ['720p', '1080p', '2k'], defaultResolution: '720p', defaultEnabled: false, note: '2026-11-26 实测图生视频两次都返回 generate failed，默认关闭' }),
  spec({ platform: 'grsai', model: 'wan-3.0', label: 'Wan 3.0', family: 'Wan', format: 'grsai-generate', lastFrame: true, durations: range(2, 30), defaultDuration: 5, aspectRatios: ['9:16', '16:9', '1:1', '3:4', '4:3', '21:9'], resolutions: ['480p', '720p', '1080p'], defaultResolution: '720p' }),
]

/** 后台矩阵的显示：每行一个系列，格子里是版本。没列到的模型按 label 自成一行 */
const VIDEO_MODEL_SERIES: Record<string, [series: string, variant: string]> = {
  'gaorui:veo_3_1-fl': ['Veo 3.1', '标准'],
  'xibapi:veo_3_1-fast-fl': ['Veo 3.1', 'Fast'],
  'xibapi:veo_3_1-lite-fl': ['Veo 3.1', 'Lite'],
  'xibapi:veo_3_1-lite-hd-fl': ['Veo 3.1', 'Lite 1080p'],
  'gaorui:kling-v2.1': ['Kling', '2.1'],
  'gaorui:kling-v2.6': ['Kling', '2.6'],
  'gaorui:kling-v3.0': ['Kling', '3.0'],
  'gaorui:kling-v4.0-flash': ['Kling', '4.0 Flash'],
  'gaorui:seedance-2.0-fast': ['Seedance 2.0', 'Fast'],
  'gaorui:seedance-2.0-mini': ['Seedance 2.0', 'Mini'],
  'xibapi:seedance-2.0': ['Seedance 2.0', '标准'],
  'xibapi:seedance-2.0-mini': ['Seedance 2.0', 'Mini'],
  'gaorui:minimax-h3': ['MiniMax H3', '标准'],
  'xibapi:minimax-h3': ['MiniMax H3', '标准'],
  'xibapi:minimax-h3-max': ['MiniMax H3', 'Max'],
  'gaorui:omni_flash_8s': ['Omni Flash', '8 秒'],
  'gaorui:omni_flash_10s': ['Omni Flash', '10 秒'],
  'gaorui:omni_flash-1.2': ['Omni Flash', '1.2'],
  'xibapi:omni_flash-10s-fl': ['Omni Flash', '1.1'],
  'xibapi:omni_1_2_flash-10s-fl': ['Omni Flash', '1.2'],
  'gaorui:grok-imagine-video-1.5': ['Grok Imagine', '1.5'],
  'gaorui:wan3.0': ['Wan 3.0', '标准'],
  'grsai:wan-3.0': ['Wan 3.0', '标准'],
  'xibapi:muse-video-fl': ['Muse', '标准'],
  'grsai:agnes-video-2.5': ['Agnes 2.5', '标准'],
}

export function videoModelSeries(spec: VideoModelSpec): { series: string; variant: string } {
  const hit = VIDEO_MODEL_SERIES[spec.id]
  return hit ? { series: hit[0], variant: hit[1] } : { series: spec.label, variant: '标准' }
}

export function findVideoModelSpec(id: string | undefined | null): VideoModelSpec | undefined {
  const key = String(id || '').trim()
  if (!key) return undefined
  return VIDEO_MODEL_CATALOG.find((item) => item.id === key)
}

export function videoModelDisplayName(spec: VideoModelSpec) {
  return `${spec.label} · ${VIDEO_CATALOG_PLATFORM_LABELS[spec.platform]}`
}

/**
 * 后台的开关表 → 打开的模型 id。
 * 后台从没设置过（空表）= 用清单里的默认值；后台设置过 = 只有点亮的才打开，没点过的一律算关闭
 * （否则后台只点了几个，别的平台的模型还会按默认全冒出来）。
 */
export function resolveEnabledVideoModelIds(switches: Record<string, boolean> | undefined | null): string[] {
  const configured = Boolean(switches) && VIDEO_MODEL_CATALOG.some((item) => typeof switches?.[item.id] === 'boolean')
  return VIDEO_MODEL_CATALOG.filter((item) => {
    const value = switches?.[item.id]
    if (typeof value === 'boolean') return value
    return configured ? false : item.defaultEnabled
  }).map((item) => item.id)
}

/** 只保留清单里认识的 id 和布尔值 */
export function normalizeVideoModelSwitches(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!input || typeof input !== 'object') return out
  for (const item of VIDEO_MODEL_CATALOG) {
    const value = (input as Record<string, unknown>)[item.id]
    if (typeof value === 'boolean') out[item.id] = value
  }
  return out
}

/** 所有视频模型名（给云端代理判断「这是视频请求」用） */
export function isCatalogVideoModelName(model: string) {
  const name = String(model || '').trim()
  return Boolean(name) && VIDEO_MODEL_CATALOG.some((item) => item.model === name)
}

/* ------------------------------------------------------------------ 参数整理 */

export type VideoGenerateParams = {
  prompt: string
  firstFrameUrl: string
  lastFrameUrl?: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  seed?: number
}

export type ResolvedVideoParams = {
  prompt: string
  firstFrameUrl: string
  lastFrameUrl?: string
  durationSec: number
  aspectRatio: string
  resolution: string
  seed?: number
}

function nearest(values: number[], target: number) {
  return values.reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best), values[0])
}

/** 把用户选的参数收敛到模型支持的值（时长取最近的可选值，比例 / 清晰度不支持就用默认） */
export function resolveVideoParams(spec: VideoModelSpec, input: VideoGenerateParams): ResolvedVideoParams {
  const lastFrameUrl = spec.lastFrame ? String(input.lastFrameUrl || '').trim() || undefined : undefined
  let durations = spec.durations
  if (lastFrameUrl && spec.maxDurationWithLastFrame) durations = durations.filter((value) => value <= spec.maxDurationWithLastFrame!)
  const wanted = Number(input.durationSec)
  const durationSec = Number.isFinite(wanted) && wanted > 0 ? nearest(durations, wanted) : durations.includes(spec.defaultDuration) ? spec.defaultDuration : durations[0]
  const aspectRatio = spec.aspectRatios.includes(String(input.aspectRatio || '')) ? String(input.aspectRatio) : spec.aspectRatios[0]
  const resolution = spec.resolutions.includes(String(input.resolution || '')) ? String(input.resolution) : spec.defaultResolution
  const seed = Number.isInteger(input.seed) && Number(input.seed) >= 0 ? Number(input.seed) : undefined
  return { prompt: String(input.prompt || ''), firstFrameUrl: String(input.firstFrameUrl || '').trim(), lastFrameUrl, durationSec, aspectRatio, resolution, seed }
}

/* ------------------------------------------------------------------ 请求体 */

export type VideoSubmitRequest = { path: string; body: Record<string, unknown> }

function xibSize(aspectRatio: string, resolution: string) {
  const hd = resolution === '1080p'
  const [long, short] = hd ? [1920, 1080] : [1280, 720]
  return aspectRatio === '16:9' ? `${long}x${short}` : `${short}x${long}`
}

function grsaiMinimaxRatio(aspectRatio: string) {
  return aspectRatio === '16:9' || aspectRatio === '21:9' || aspectRatio === '4:3' ? 'landscape' : 'portrait'
}

export function buildVideoSubmitRequest(spec: VideoModelSpec, params: ResolvedVideoParams): VideoSubmitRequest {
  const { prompt, firstFrameUrl, lastFrameUrl, durationSec, aspectRatio, resolution, seed } = params
  if (!firstFrameUrl) throw new Error('图生视频缺少首帧图片')
  const frames = [firstFrameUrl, lastFrameUrl].filter(Boolean) as string[]
  switch (spec.format) {
    case 'gaorui-veo':
      // 时长固定 8 秒，没有时长参数；veo_3_1-fl 第 1 张 = 首帧，第 2 张 = 尾帧
      return { path: '/v1/videos', body: { model: spec.model, prompt, images: frames, aspect_ratio: aspectRatio, resolution } }
    case 'gaorui-grok':
      return { path: '/v1/videos', body: { model: spec.model, prompt, size: aspectRatio, seconds: durationSec, resolution, image_urls: [firstFrameUrl] } }
    case 'gaorui-omni': {
      const body: Record<string, unknown> = { model: spec.model, prompt, resolution, aspect_ratio: aspectRatio, input_reference: frames, first_last_frame: true }
      // 8s / 10s 型号的时长写在模型名里；1.2 才收 seconds
      if (spec.durations.length > 1) body.seconds = durationSec
      return { path: '/v1/videos', body }
    }
    case 'gaorui-minimax':
      return {
        path: '/v1/videos',
        body: {
          model: spec.model,
          prompt,
          duration: durationSec,
          resolution,
          aspect_ratio: aspectRatio,
          metadata: { first_frame: firstFrameUrl, ...(lastFrameUrl ? { last_frame: lastFrameUrl } : {}) },
        },
      }
    case 'gaorui-kling':
      return {
        path: '/v1/videos',
        body: {
          model: spec.model,
          operation: 'image_to_video',
          prompt,
          duration_seconds: durationSec,
          resolution,
          aspect_ratio: aspectRatio,
          media_inputs: [
            { kind: 'image', role: 'first_frame', url: firstFrameUrl },
            ...(lastFrameUrl ? [{ kind: 'image', role: 'last_frame', url: lastFrameUrl }] : []),
          ],
        },
      }
    case 'gaorui-wan':
      return {
        path: '/v1/videos',
        body: {
          model: spec.model,
          operation: 'image_to_video',
          prompt,
          duration_seconds: durationSec,
          resolution,
          aspect_ratio: aspectRatio,
          media_inputs: [
            { kind: 'image', role: 'first_frame', url: firstFrameUrl },
            ...(lastFrameUrl ? [{ kind: 'image', role: 'last_frame', url: lastFrameUrl }] : []),
          ],
        },
      }
    case 'gaorui-seedance':
      // 与火山方舟 Seedance 2.0 请求体一致
      return {
        path: '/v1/videos',
        body: {
          model: spec.model,
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: firstFrameUrl }, role: 'first_frame' },
            ...(lastFrameUrl ? [{ type: 'image_url', image_url: { url: lastFrameUrl }, role: 'last_frame' }] : []),
          ],
          duration: durationSec,
          ratio: aspectRatio,
          resolution,
          generate_audio: false,
          watermark: false,
          ...(seed !== undefined ? { seed } : {}),
        },
      }
    case 'xib-videos': {
      const body: Record<string, unknown> = { model: spec.model, prompt, images: frames }
      if (spec.xib?.size) body.size = xibSize(aspectRatio, resolution)
      else body.aspect_ratio = aspectRatio
      if (!spec.xib?.size) body.resolution = resolution
      if (spec.xib?.seconds) body.seconds = String(durationSec)
      if (spec.xib?.firstLastFlag) body.first_last_frame = true
      return { path: '/v1/videos', body }
    }
    case 'grsai-generate':
      return {
        path: '/v1/api/generate',
        body: {
          model: spec.model,
          prompt,
          aspectRatio: spec.model.startsWith('minimax') ? grsaiMinimaxRatio(aspectRatio) : aspectRatio,
          resolution,
          duration: durationSec,
          firstFrame: firstFrameUrl,
          ...(lastFrameUrl ? { lastFrame: lastFrameUrl } : {}),
          ...(seed !== undefined ? { seed } : {}),
          replyType: 'async',
        },
      }
  }
}

export function buildVideoQueryPath(spec: VideoModelSpec, taskId: string) {
  const id = encodeURIComponent(String(taskId || '').trim())
  return spec.format === 'grsai-generate' ? `/v1/api/result?id=${id}` : `/v1/videos/${id}`
}

/* ------------------------------------------------------------------ 返回值 */

export type VideoTaskSnapshot = {
  taskId?: string
  status: 'running' | 'succeeded' | 'failed'
  url?: string
  progress?: number
  error?: string
}

const SUCCEEDED = new Set(['completed', 'complete', 'succeeded', 'success', 'succeed', 'done', 'finished'])
const FAILED = new Set(['failed', 'failure', 'fail', 'error', 'cancelled', 'canceled', 'expired', 'rejected', 'violation', 'timeout'])

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/** 统一读各家返回：高瑞 / 小扳手的 OpenAI 风格、火山 Seedance 风格、GRS 的 results[]；套了一层 data 也认 */
export function parseVideoTaskResponse(raw: unknown): VideoTaskSnapshot {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const json = root.data && typeof root.data === 'object' && !Array.isArray(root.data) && (root.data.status || root.data.id) ? root.data : root
  const statusText = String(json.status ?? json.state ?? json.task_status ?? '').trim().toLowerCase()
  const url = firstString(
    json.url,
    json.video_url,
    json.output_url,
    json.metadata?.url,
    json.metadata?.video_url,
    json.content?.video_url,
    Array.isArray(json.results) ? json.results[0]?.url : undefined,
  )
  let status: VideoTaskSnapshot['status'] = 'running'
  if (FAILED.has(statusText)) status = 'failed'
  else if (SUCCEEDED.has(statusText)) status = url ? 'succeeded' : 'running'
  // 同步返回：只给视频地址、不带状态
  else if (!statusText && url) status = 'succeeded'
  const errorValue = json.error ?? root.error
  const error =
    statusText === 'violation'
      ? `内容违规，平台拒绝生成${typeof errorValue === 'string' && errorValue ? `：${errorValue}` : ''}`
      : firstString(typeof errorValue === 'string' ? errorValue : errorValue?.message, errorValue?.code, json.fail_reason, json.message)
  const progressValue = Number(json.progress)
  return {
    taskId: firstString(json.task_id, json.id, root.task_id, root.id),
    status,
    url,
    progress: Number.isFinite(progressValue) ? progressValue : undefined,
    error: status === 'failed' ? error || '平台返回失败' : undefined,
  }
}
