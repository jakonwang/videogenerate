/**
 * 后台统一下发的软件设置（平台 Key、默认平台与模型、七牛存储）。
 * 管理后台编辑这份结构；桌面端拉取后用 applyManagedSettings 映射成本地 setModelCredentials 的入参，
 * 映射规则与桌面端「设置」页完全一致（见 SettingsView.vue 的 platform / model binding）。
 */
import type { ChatPlatformProfile, ImagePlatformProfile, PlatformProfile } from '../platformSettings'

export const MANAGED_PLATFORM_KEYS = ['grsai', 'ai666', 'vectorengine', 'xibapi', 'gaorui'] as const
export type ManagedPlatformKey = (typeof MANAGED_PLATFORM_KEYS)[number]

export type ManagedPlatformCredential = { apiKey: string; baseUrl: string }

export type ManagedSoftwareSettings = {
  /** 关闭时客户端保持用户自己的配置 */
  enabled: boolean
  platforms: Record<ManagedPlatformKey, ManagedPlatformCredential>
  tikhubApiKey: string
  capabilities: {
    video: { platform: PlatformProfile; model: string }
    image: { platform: ImagePlatformProfile; model: string; quality: 'low' | 'medium' | 'high' }
    chat: { platform: ChatPlatformProfile; model: string }
  }
  qiniu: { accessKey: string; secretKey: string; bucket: string; domain: string; uploadHost: string; prefix: string }
}

/** 管理后台读取时，密钥字段只返回掩码 */
export const SECRET_MASK_PREFIX = '••••'

export const MANAGED_PLATFORM_LABELS: Record<ManagedPlatformKey, { label: string; hostPlaceholder: string; desc: string }> = {
  grsai: { label: 'GRS.AI', hostPlaceholder: 'https://grsaiapi.com', desc: '视频、图片、对话' },
  ai666: { label: 'AI666', hostPlaceholder: 'https://your-ai666-host', desc: '视频、图片、对话' },
  vectorengine: { label: 'VectorEngine', hostPlaceholder: 'https://your-vector-engine-host', desc: '视频、图片、对话' },
  xibapi: { label: 'XIBAPI', hostPlaceholder: 'https://xibapi.com', desc: '仅视频' },
  gaorui: { label: 'GaoruiAPI', hostPlaceholder: 'https://gaorui.cc', desc: '仅视频（Veo）' },
}

export function createDefaultManagedSettings(): ManagedSoftwareSettings {
  const empty = (): ManagedPlatformCredential => ({ apiKey: '', baseUrl: '' })
  return {
    enabled: false,
    platforms: { grsai: empty(), ai666: empty(), vectorengine: empty(), xibapi: empty(), gaorui: empty() },
    tikhubApiKey: '',
    capabilities: {
      video: { platform: 'vectorengine', model: '' },
      image: { platform: 'vectorengine', model: '', quality: 'high' },
      chat: { platform: 'vectorengine', model: '' },
    },
    qiniu: { accessKey: '', secretKey: '', bucket: '', domain: '', uploadHost: '', prefix: '' },
  }
}

const VIDEO_PLATFORMS: PlatformProfile[] = ['grsai', 'ai666', 'vectorengine', 'xibapi', 'gaorui']
const IMAGE_CHAT_PLATFORMS: ImagePlatformProfile[] = ['grsai', 'ai666', 'vectorengine']

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
  const imagePlatform = IMAGE_CHAT_PLATFORMS.includes(cap.image?.platform) ? cap.image.platform : base.capabilities.image.platform
  const chatPlatform = IMAGE_CHAT_PLATFORMS.includes(cap.chat?.platform) ? cap.chat.platform : base.capabilities.chat.platform
  const quality = ['low', 'medium', 'high'].includes(cap.image?.quality) ? cap.image.quality : 'high'
  const q = src.qiniu ?? ({} as any)
  return {
    enabled: Boolean(src.enabled),
    platforms,
    tikhubApiKey: str(src.tikhubApiKey, 1000),
    capabilities: {
      video: { platform: videoPlatform, model: str(cap.video?.model, 120) },
      image: { platform: imagePlatform, model: str(cap.image?.model, 120), quality },
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
  vectorEngineHub?: HubLike
  xibapiHub?: HubLike
  gaoruiHub?: HubLike
  apifoxHub?: HubLike
  [key: string]: unknown
}

const HUB_FIELD: Record<Exclude<ManagedPlatformKey, 'grsai'>, 'ai666Hub' | 'vectorEngineHub' | 'xibapiHub' | 'gaoruiHub'> = {
  ai666: 'ai666Hub',
  vectorengine: 'vectorEngineHub',
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
  for (const key of ['ai666', 'vectorengine', 'xibapi', 'gaorui'] as const) {
    const h = hub(key)
    h.apiKey = managed.platforms[key].apiKey
    h.baseUrl = managed.platforms[key].baseUrl
    if (key === 'xibapi' || key === 'gaorui') h.videoProvider = key
  }
  next.tikhubApiKey = managed.tikhubApiKey

  // 视频
  const video = managed.capabilities.video
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
  return copy
}
