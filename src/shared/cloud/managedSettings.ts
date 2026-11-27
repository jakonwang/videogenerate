/**
 * 后台统一下发的软件设置（平台 Key、默认平台与模型、七牛存储）。
 * 管理后台编辑这份结构；桌面端拉取后用 applyManagedSettings 映射成本地 setModelCredentials 的入参，
 * 映射规则与桌面端「设置」页完全一致（见 SettingsView.vue 的 platform / model binding）。
 */
import type { ChatPlatformProfile, ImagePlatformProfile, PlatformProfile } from '../platformSettings'
import { findVideoModelSpec, normalizeVideoModelSwitches } from '../videoModels'

export const MANAGED_PLATFORM_KEYS = ['grsai', 'ai666', 'xibapi', 'gaorui'] as const
export type ManagedPlatformKey = (typeof MANAGED_PLATFORM_KEYS)[number]

export type ManagedPlatformCredential = { apiKey: string; baseUrl: string }

export type ManagedSoftwareSettings = {
  /** 关闭时客户端保持用户自己的配置 */
  enabled: boolean
  platforms: Record<ManagedPlatformKey, ManagedPlatformCredential>
  tikhubApiKey: string
  capabilities: {
    /**
     * platform / model：AI 复刻等旧功能用的视频平台与模型。
     * modelSwitches / defaultModelId：图生视频的模型清单开关和默认模型（清单 id，见 src/shared/videoModels.ts）。
     */
    video: { platform: PlatformProfile; model: string; modelSwitches: Record<string, boolean>; defaultModelId: string }
    /** replaceModel：图生视频「贴真实商品」擦除、融合用的出图模型（GRS.AI，默认 nano-banana-2.1） */
    image: { platform: ImagePlatformProfile; model: string; quality: 'low' | 'medium' | 'high'; replaceModel: string }
    chat: { platform: ChatPlatformProfile; model: string }
  }
  qiniu: { accessKey: string; secretKey: string; bucket: string; domain: string; uploadHost: string; prefix: string }
  /** 批量换景「保真」用的腾讯云数据万象抠图，只在服务器使用，不下发 */
  matting: ManagedMatting
}

export const MATTING_TYPES = ['AIPicMatting', 'AIPortraitMatting', 'GoodsMatting'] as const
export type ManagedMatting = { secretId: string; secretKey: string; bucket: string; region: string; type: (typeof MATTING_TYPES)[number] }

/** 管理后台读取时，密钥字段只返回掩码 */
export const SECRET_MASK_PREFIX = '••••'

/** 管理后台「查看密钥」可以读的字段：platform.<key>、tikhubApiKey、qiniu.accessKey 等 */
export type ManagedSecretField =
  | `platform.${ManagedPlatformKey}`
  | 'tikhubApiKey'
  | 'qiniu.accessKey'
  | 'qiniu.secretKey'
  | 'matting.secretId'
  | 'matting.secretKey'

/** 按字段名取出明文密钥；字段不认识时返回 null */
export function readManagedSecret(settings: ManagedSoftwareSettings, field: string): string | null {
  if (field.startsWith('platform.')) {
    const key = field.slice('platform.'.length) as ManagedPlatformKey
    return (MANAGED_PLATFORM_KEYS as readonly string[]).includes(key) ? settings.platforms[key].apiKey : null
  }
  switch (field) {
    case 'tikhubApiKey':
      return settings.tikhubApiKey
    case 'qiniu.accessKey':
      return settings.qiniu.accessKey
    case 'qiniu.secretKey':
      return settings.qiniu.secretKey
    case 'matting.secretId':
      return settings.matting.secretId
    case 'matting.secretKey':
      return settings.matting.secretKey
    default:
      return null
  }
}

export const MANAGED_PLATFORM_LABELS: Record<ManagedPlatformKey, { label: string; hostPlaceholder: string; desc: string }> = {
  grsai: { label: 'GRS.AI', hostPlaceholder: 'https://grsaiapi.com', desc: '视频、图片、对话' },
  ai666: { label: 'AI666', hostPlaceholder: 'https://your-ai666-host', desc: '图片、对话' },
  xibapi: { label: '小扳手', hostPlaceholder: 'https://5208.ai', desc: '视频' },
  gaorui: { label: '高瑞', hostPlaceholder: 'https://gaorui.cc', desc: '视频' },
}

export function createDefaultManagedSettings(): ManagedSoftwareSettings {
  const empty = (): ManagedPlatformCredential => ({ apiKey: '', baseUrl: '' })
  return {
    enabled: false,
    platforms: { grsai: empty(), ai666: empty(), xibapi: empty(), gaorui: empty() },
    tikhubApiKey: '',
    capabilities: {
      video: { platform: 'grsai', model: '', modelSwitches: {}, defaultModelId: '' },
      image: { platform: 'grsai', model: '', quality: 'high', replaceModel: '' },
      chat: { platform: 'grsai', model: '' },
    },
    qiniu: { accessKey: '', secretKey: '', bucket: '', domain: '', uploadHost: '', prefix: '' },
    matting: { secretId: '', secretKey: '', bucket: '', region: '', type: 'AIPicMatting' },
  }
}

// VectorEngine 已删除：旧设置里选了它的，normalize 时落到默认 GRS.AI
const VIDEO_PLATFORMS: PlatformProfile[] = ['grsai', 'ai666', 'xibapi', 'gaorui']
const IMAGE_PLATFORMS: ImagePlatformProfile[] = ['grsai', 'ai666', 'xibapi', 'gaorui']
const CHAT_PLATFORMS: ChatPlatformProfile[] = ['grsai', 'ai666', 'xibapi', 'gaorui']

const str = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

/** 清洗任意输入为合法结构（服务端保存前、客户端应用前都会调用） */
export function normalizeManagedSettings(input: unknown): ManagedSoftwareSettings {
  const base = createDefaultManagedSettings()
  const src = (input && typeof input === 'object' ? input : {}) as Partial<ManagedSoftwareSettings> & Record<string, any>
  const platforms = { ...base.platforms }
  for (const key of MANAGED_PLATFORM_KEYS) {
    const p: Partial<ManagedPlatformCredential> = src.platforms?.[key] ?? {}
    platforms[key] = { apiKey: str(p.apiKey, 1000), baseUrl: str(p.baseUrl).replace(/\/+$/, '') }
  }
  const cap = src.capabilities ?? ({} as any)
  const videoPlatform = VIDEO_PLATFORMS.includes(cap.video?.platform) ? cap.video.platform : base.capabilities.video.platform
  const imagePlatform = IMAGE_PLATFORMS.includes(cap.image?.platform) ? cap.image.platform : base.capabilities.image.platform
  const chatPlatform = CHAT_PLATFORMS.includes(cap.chat?.platform) ? cap.chat.platform : base.capabilities.chat.platform
  const quality = ['low', 'medium', 'high'].includes(cap.image?.quality) ? cap.image.quality : 'high'
  const q = src.qiniu ?? ({} as any)
  const m = src.matting ?? ({} as any)
  // 桶名、地域会拼进请求域名，只留合法字符
  const hostPart = (value: unknown) => str(value, 80).toLowerCase().replace(/[^a-z0-9-]/g, '')
  return {
    enabled: Boolean(src.enabled),
    platforms,
    tikhubApiKey: str(src.tikhubApiKey, 1000),
    capabilities: {
      video: {
        platform: videoPlatform,
        model: str(cap.video?.model, 120),
        modelSwitches: normalizeVideoModelSwitches(cap.video?.modelSwitches),
        defaultModelId: findVideoModelSpec(cap.video?.defaultModelId)?.id ?? '',
      },
      image: { platform: imagePlatform, model: str(cap.image?.model, 120), quality, replaceModel: str(cap.image?.replaceModel, 120) },
      chat: { platform: chatPlatform, model: str(cap.chat?.model, 120) },
    },
    qiniu: {
      accessKey: str(q.accessKey),
      secretKey: str(q.secretKey),
      bucket: str(q.bucket, 120),
      domain: str(q.domain),
      uploadHost: str(q.uploadHost),
      prefix: str(q.prefix, 120),
    },
    matting: {
      secretId: str(m.secretId),
      secretKey: str(m.secretKey),
      bucket: hostPart(m.bucket),
      region: hostPart(m.region),
      type: MATTING_TYPES.includes(m.type) ? m.type : 'AIPicMatting',
    },
  }
}

function maskSecret(value: string) {
  if (!value) return ''
  return `${SECRET_MASK_PREFIX}${value.slice(-4)}`
}

/** 给管理后台看的版本：所有密钥打码 */
export function maskManagedSettings(settings: ManagedSoftwareSettings): ManagedSoftwareSettings {
  const platforms = { ...settings.platforms }
  for (const key of MANAGED_PLATFORM_KEYS) platforms[key] = { ...platforms[key], apiKey: maskSecret(platforms[key].apiKey) }
  return {
    ...settings,
    platforms,
    tikhubApiKey: maskSecret(settings.tikhubApiKey),
    qiniu: { ...settings.qiniu, accessKey: maskSecret(settings.qiniu.accessKey), secretKey: maskSecret(settings.qiniu.secretKey) },
    matting: { ...settings.matting, secretId: maskSecret(settings.matting.secretId), secretKey: maskSecret(settings.matting.secretKey) },
  }
}

/** 后台提交时：仍是掩码的密钥字段表示「未修改」，沿用旧值 */
export function mergeManagedSecrets(incoming: ManagedSoftwareSettings, previous: ManagedSoftwareSettings): ManagedSoftwareSettings {
  const keep = (next: string, prev: string) => (next.startsWith(SECRET_MASK_PREFIX) ? prev : next)
  const platforms = { ...incoming.platforms }
  for (const key of MANAGED_PLATFORM_KEYS) {
    platforms[key] = { ...platforms[key], apiKey: keep(platforms[key].apiKey, previous.platforms[key].apiKey) }
  }
  return {
    ...incoming,
    platforms,
    tikhubApiKey: keep(incoming.tikhubApiKey, previous.tikhubApiKey),
    qiniu: {
      ...incoming.qiniu,
      accessKey: keep(incoming.qiniu.accessKey, previous.qiniu.accessKey),
      secretKey: keep(incoming.qiniu.secretKey, previous.qiniu.secretKey),
    },
    matting: {
      ...incoming.matting,
      secretId: keep(incoming.matting.secretId, previous.matting.secretId),
      secretKey: keep(incoming.matting.secretKey, previous.matting.secretKey),
    },
  }
}

type HubLike = { enabled?: boolean; baseUrl?: string; apiKey?: string; videoProvider?: string; chatModel?: string; imageModel?: string; textToVideoModel?: string; imageToVideoModel?: string; startEndVideoModel?: string; referenceVideoModel?: string; [key: string]: unknown }

/** 桌面端本地凭据的相关字段（与 clone:getModelCredentials 返回值同形） */
export type LocalModelCredentials = {
  grsaiApiKey?: string
  grsaiHost?: string
  tikhubApiKey?: string
  qiniuAccessKey?: string
  qiniuSecretKey?: string
  qiniuBucket?: string
  qiniuDomain?: string
  qiniuUploadHost?: string
  qiniuPrefix?: string
  grsaiVideoModel?: string
  grsaiImageModel?: string
  livePhotoReplaceImageModel?: string
  grsaiAnalysisModel?: string
  openaiImageQuality?: 'low' | 'medium' | 'high'
  videoProviderPrimary?: string
  videoProviderFallback?: string
  imageProviderPrimary?: string
  chatProviderPrimary?: string
  videoModelPrimary?: string
  videoModelFallback?: string
  apifoxHubProfile?: string
  videoApifoxHubProfile?: string
  imageApifoxHubProfile?: string
  chatApifoxHubProfile?: string
  ai666Hub?: HubLike
  xibapiHub?: HubLike
  gaoruiHub?: HubLike
  apifoxHub?: HubLike
  videoModelSwitches?: Record<string, boolean>
  videoDefaultModelId?: string
  [key: string]: unknown
}

const HUB_FIELD: Record<Exclude<ManagedPlatformKey, 'grsai'>, 'ai666Hub' | 'xibapiHub' | 'gaoruiHub'> = {
  ai666: 'ai666Hub',
  xibapi: 'xibapiHub',
  gaorui: 'gaoruiHub',
}

/**
 * 把后台设置叠加到本地凭据上，返回可直接交给 clone:setModelCredentials 的完整入参。
 * 只覆盖后台负责的字段，其它本地字段原样保留。
 */
export function applyManagedSettings(current: LocalModelCredentials, managed: ManagedSoftwareSettings): LocalModelCredentials {
  const next: LocalModelCredentials = JSON.parse(JSON.stringify(current ?? {}))
  const hub = (key: Exclude<ManagedPlatformKey, 'grsai'>): HubLike => {
    const field = HUB_FIELD[key]
    next[field] = { ...(next[field] ?? {}) }
    return next[field] as HubLike
  }

  // 平台 Key / 地址
  next.grsaiApiKey = managed.platforms.grsai.apiKey
  next.grsaiHost = managed.platforms.grsai.baseUrl
  for (const key of ['ai666', 'xibapi', 'gaorui'] as const) {
    const h = hub(key)
    h.apiKey = managed.platforms[key].apiKey
    h.baseUrl = managed.platforms[key].baseUrl
    if (key === 'xibapi' || key === 'gaorui') h.videoProvider = key
  }
  next.tikhubApiKey = managed.tikhubApiKey
  // VectorEngine 已删除，清掉旧配置里残留的 Key
  delete next.vectorEngineHub

  // 视频
  const video = managed.capabilities.video
  // 图生视频模型清单：后台的开关和默认模型原样下发
  next.videoModelSwitches = { ...(video.modelSwitches ?? {}) }
  next.videoDefaultModelId = video.defaultModelId || undefined
  if (video.platform === 'grsai') {
    next.videoProviderPrimary = 'grsai'
    next.videoProviderFallback = 'grsai'
    if (video.model) next.grsaiVideoModel = video.model
  } else {
    next.videoProviderPrimary = 'apifox_hub'
    next.videoProviderFallback = 'apifox_hub'
    next.videoApifoxHubProfile = video.platform
    next.apifoxHubProfile = video.platform
    const h = hub(video.platform)
    h.enabled = true
    if (video.model) {
      h.textToVideoModel = video.model
      h.imageToVideoModel = video.model
      h.startEndVideoModel = video.model
      h.referenceVideoModel = video.model
    }
  }

  // 图片
  const image = managed.capabilities.image
  next.openaiImageQuality = image.quality
  next.livePhotoReplaceImageModel = image.replaceModel || undefined
  if (image.platform === 'grsai') {
    next.imageProviderPrimary = 'grsai'
    if (image.model) next.grsaiImageModel = image.model
  } else {
    next.imageProviderPrimary = 'apifox_hub'
    next.imageApifoxHubProfile = image.platform
    const h = hub(image.platform)
    h.enabled = true
    if (image.model) h.imageModel = image.model
  }

  // 对话
  const chat = managed.capabilities.chat
  if (chat.platform === 'grsai') {
    next.chatProviderPrimary = 'grsai'
    if (chat.model) next.grsaiAnalysisModel = chat.model
  } else {
    next.chatProviderPrimary = 'apifox_hub'
    next.chatApifoxHubProfile = chat.platform
    const h = hub(chat.platform)
    h.enabled = true
    if (chat.model) h.chatModel = chat.model
  }

  // 与设置页保存逻辑一致：apifoxHub 为视频所用平台的副本
  if (next.videoProviderPrimary === 'apifox_hub' && video.platform !== 'grsai') {
    next.apifoxHub = { ...(next[HUB_FIELD[video.platform]] as HubLike) }
  }

  // 七牛
  next.qiniuAccessKey = managed.qiniu.accessKey
  next.qiniuSecretKey = managed.qiniu.secretKey
  next.qiniuBucket = managed.qiniu.bucket
  next.qiniuDomain = managed.qiniu.domain
  next.qiniuUploadHost = managed.qiniu.uploadHost
  next.qiniuPrefix = managed.qiniu.prefix
  return next
}

/** 后台负责的本地字段：托管模式下这些字段在客户端只读、对渲染进程打码 */
export const MANAGED_SECRET_FIELDS = ['grsaiApiKey', 'tikhubApiKey', 'qiniuAccessKey', 'qiniuSecretKey'] as const

/* ------------------------------------------------------------------ 云端代理（密钥只在服务器） */

/** 经过云端 AI 代理的平台：后台的平台 Key 只保存在服务器，电脑端拿到的是代理地址 + 代理令牌 */
export const AI_PROXY_PLATFORMS = [...MANAGED_PLATFORM_KEYS, 'tikhub'] as const
export type AiProxyPlatform = (typeof AI_PROXY_PLATFORMS)[number]
export const AI_PROXY_PATH = '/api/v1/ai-proxy'
export const TIKHUB_DEFAULT_BASE_URL = 'https://api.tikhub.io'
/** 下发给客户端的设置里，「后台已配置这个密钥」用这个占位，真实密钥不出服务器 */
export const PROXY_KEY_PLACEHOLDER = '__cloud_proxy__'

/** 服务器 → 客户端：去掉所有密钥（平台 Key、TikHub、七牛 AK/SK），已配置的平台 Key 换成占位符 */
export function stripManagedSecretsForClient(settings: ManagedSoftwareSettings): ManagedSoftwareSettings {
  const copy = normalizeManagedSettings(settings)
  for (const key of MANAGED_PLATFORM_KEYS) {
    copy.platforms[key] = { apiKey: copy.platforms[key].apiKey ? PROXY_KEY_PLACEHOLDER : '', baseUrl: '' }
  }
  copy.tikhubApiKey = copy.tikhubApiKey ? PROXY_KEY_PLACEHOLDER : ''
  copy.qiniu = { ...copy.qiniu, accessKey: '', secretKey: '' }
  copy.matting = createDefaultManagedSettings().matting
  return copy
}

/**
 * 客户端：把去密钥的设置换成「走云端代理」的版本——每个已配置平台的地址改成
 * `${cloudBase}/api/v1/ai-proxy/<平台>`、Key 改成代理令牌。之后照常交给 applyManagedSettings。
 */
export function toProxiedManagedSettings(settings: ManagedSoftwareSettings, input: { cloudBaseUrl: string; token: string }): ManagedSoftwareSettings {
  const copy = normalizeManagedSettings(settings)
  const root = `${String(input.cloudBaseUrl || '').replace(/\/+$/, '')}${AI_PROXY_PATH}`
  for (const key of MANAGED_PLATFORM_KEYS) {
    const configured = Boolean(copy.platforms[key].apiKey)
    copy.platforms[key] = configured ? { apiKey: input.token, baseUrl: `${root}/${key}` } : { apiKey: '', baseUrl: '' }
  }
  copy.tikhubApiKey = copy.tikhubApiKey ? input.token : ''
  copy.qiniu = { ...copy.qiniu, accessKey: '', secretKey: '' }
  copy.matting = createDefaultManagedSettings().matting
  return copy
}
