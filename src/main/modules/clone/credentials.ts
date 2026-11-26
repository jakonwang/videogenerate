/**
 * 模型凭据归一化（纯函数，无数据库依赖）：桌面端读写凭据、云端 AI 网关都用同一套规则。
 */

import { findVideoModelSpec, normalizeVideoModelSwitches } from '../../../shared/videoModels'
import type { AiProviderName, ApifoxHubCredentials, ImageProviderName, ModelCredentials } from './types'

function normalizeVideoProvider(v: unknown, fallback: AiProviderName): AiProviderName {
  return v === 'seedance' || v === 'kling' || v === 'grsai' || v === 'apifox_hub' ? v : fallback
}

function normalizeImageProvider(v: unknown, fallback: ImageProviderName): ImageProviderName {
  return v === 'openai' || v === 'grsai' || v === 'apifox_hub' ? v : fallback
}

function normalizeCapabilityProvider(v: unknown, fallback: 'grsai' | 'apifox_hub'): 'grsai' | 'apifox_hub' {
  return v === 'grsai' || v === 'apifox_hub' ? v : fallback
}

export function normalizeAi666VideoModel(value: unknown, fallback: string) {
  const raw = String(value ?? '').trim()
  const mapped =
    raw === 'google/veo3.1-lite/image-to-video' || raw === 'google/veo3.1-lite/start-end-frame-to-video'
      ? 'veo_3_1-lite'
      : raw === 'google/veo3.1-fast/image-to-video' || raw === 'google/veo3.1-fast/start-end-frame-to-video'
        ? 'veo_3_1-fast'
        : raw === 'google/veo3.1/image-to-video'
          ? 'veo_3_1'
          : raw === 'bytedance/seedance-2.0/reference-to-video'
            ? 'doubao-seedance-2-0-260128'
            : raw === 'bytedance/seedance-2.0/image-to-video'
              ? 'doubao-seedance-2-0-fast-260128'
              : raw === 'google/veo3.1-lite'
                ? 'veo_3_1-lite'
                : raw === 'google/veo3.1-fast'
                  ? 'veo_3_1-fast'
                  : raw === 'google/veo3.1'
                    ? 'veo_3_1'
                    : raw
  return mapped || fallback
}

function normalizeHubBaseUrl(value: unknown) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

/** 中转平台已下线 gpt-image-1（2026-11 中转平台报 No available channel），旧设置自动换成 gpt-image-2 */
export const DEFAULT_HUB_IMAGE_MODEL = 'gpt-image-2'
const RETIRED_HUB_IMAGE_MODELS = new Set(['gpt-image-1'])

/** fallback 传 null 表示「没填就保持为空」（不能用 undefined，会触发默认值） */
export function normalizeHubImageModel(value: unknown, fallback: string | null = DEFAULT_HUB_IMAGE_MODEL) {
  const model = String(value ?? '').trim()
  if (!model) return fallback ?? undefined
  return RETIRED_HUB_IMAGE_MODELS.has(model.toLowerCase()) ? DEFAULT_HUB_IMAGE_MODEL : model
}

function normalizeApifoxHubCredentials(parsed: any): ApifoxHubCredentials {
  return {
    enabled: Boolean(parsed?.enabled ?? true),
    baseUrl: normalizeHubBaseUrl(parsed?.baseUrl),
    apiKey: String(parsed?.apiKey ?? '').trim() || undefined,
    chatProvider:
      parsed?.chatProvider === 'anthropic' || parsed?.chatProvider === 'gemini'
        ? parsed.chatProvider
        : 'openai',
    chatModel: String(parsed?.chatModel ?? '').trim() || 'gpt-4.1-mini',
    chatEndpointStyle:
      parsed?.chatEndpointStyle === 'anthropic_native' || parsed?.chatEndpointStyle === 'gemini_native'
        ? parsed.chatEndpointStyle
        : 'openai_chat',
    imageProvider:
      parsed?.imageProvider === 'gemini' || parsed?.imageProvider === 'jimeng' || parsed?.imageProvider === 'midjourney'
        ? parsed.imageProvider
        : 'openai',
    imageModel: normalizeHubImageModel(parsed?.imageModel) as string,
    imageEditModel: normalizeHubImageModel(parsed?.imageEditModel, null),
    imageEndpointStyle:
      parsed?.imageEndpointStyle === 'official_rest' || parsed?.imageEndpointStyle === 'midjourney_task'
        ? parsed.imageEndpointStyle
        : 'openai_images',
    videoProvider:
      parsed?.videoProvider === 'sora' ||
      parsed?.videoProvider === 'veo' ||
      parsed?.videoProvider === 'grok' ||
      parsed?.videoProvider === 'jimeng' ||
      parsed?.videoProvider === 'vidu' ||
      parsed?.videoProvider === 'kling' ||
      parsed?.videoProvider === 'seedance2' ||
      parsed?.videoProvider === 'xibapi' ||
      parsed?.videoProvider === 'gaorui'
        ? parsed.videoProvider
        : 'openai_video',
    textToVideoModel: normalizeAi666VideoModel(parsed?.textToVideoModel, 'veo_3_1-lite'),
    imageToVideoModel: normalizeAi666VideoModel(parsed?.imageToVideoModel, 'veo_3_1-lite'),
    startEndVideoModel: normalizeAi666VideoModel(parsed?.startEndVideoModel, 'veo_3_1-lite'),
    referenceVideoModel: normalizeAi666VideoModel(parsed?.referenceVideoModel, 'veo_3_1-lite'),
    videoEndpointStyle: parsed?.videoEndpointStyle === 'official_rest' ? 'official_rest' : 'openai_video',
    defaultPollIntervalMs: Math.max(1000, Number(parsed?.defaultPollIntervalMs ?? 2000) || 2000),
    defaultTimeoutMs: Math.max(30000, Number(parsed?.defaultTimeoutMs ?? 600000) || 600000),
  }
}

function hasOwnHubPayload(parsed: any, key: 'ai666Hub' | 'xibapiHub' | 'gaoruiHub') {
  return Boolean(parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, key))
}

const HUB_PROFILES = ['ai666', 'xibapi', 'gaorui'] as const
type HubProfile = (typeof HUB_PROFILES)[number]
const isHubProfile = (value: unknown): value is HubProfile => (HUB_PROFILES as readonly unknown[]).includes(value)
/** 对话能用的 hub 平台 */
const isChatHubProfile = (value: unknown): value is HubProfile => isHubProfile(value)
/** 旧版把平台名直接写在 provider 字段里；VectorEngine 已删除（2026-11-26），但旧配置里还会读到 */
const isLegacyPlatformName = (value: unknown) => value === 'vectorengine' || isHubProfile(value)

export function normalizeCredentials(parsed: any): ModelCredentials {
  const legacySharedHub = parsed?.apifoxHub
  const ai666Hub = normalizeApifoxHubCredentials(hasOwnHubPayload(parsed, 'ai666Hub') ? parsed?.ai666Hub : legacySharedHub)
  const xibapiHub = normalizeApifoxHubCredentials(hasOwnHubPayload(parsed, 'xibapiHub') ? parsed?.xibapiHub : legacySharedHub)
  const gaoruiHub = normalizeApifoxHubCredentials(hasOwnHubPayload(parsed, 'gaoruiHub') ? parsed?.gaoruiHub : legacySharedHub)
  const normalizedVideoModelPrimary = normalizeAi666VideoModel(parsed?.videoModelPrimary, 'veo_3_1-lite')

  const legacyVideoPlatform = [parsed?.videoProviderPrimary, parsed?.videoProviderFallback].find(isLegacyPlatformName)
  const legacyImagePlatform = parsed?.imageProviderPrimary === 'ai666' || parsed?.imageProviderPrimary === 'vectorengine' ? parsed.imageProviderPrimary : undefined
  const legacyChatPlatform = parsed?.chatProviderPrimary === 'ai666' || parsed?.chatProviderPrimary === 'vectorengine' ? parsed.chatProviderPrimary : undefined

  // 每种能力原来指向哪个 hub 平台；没写过 = 旧默认 VectorEngine
  const storedVideoProfile = parsed?.videoApifoxHubProfile ?? legacyVideoPlatform ?? parsed?.apifoxHubProfile ?? 'vectorengine'
  const storedImageProfile = parsed?.imageApifoxHubProfile ?? legacyImagePlatform ?? parsed?.apifoxHubProfile ?? 'vectorengine'
  const storedChatProfile = parsed?.chatApifoxHubProfile ?? legacyChatPlatform ?? parsed?.apifoxHubProfile ?? 'vectorengine'

  // provider：旧版平台名一律算 apifox_hub；新装默认 GRS.AI
  let normalizedVideoProviderPrimary: AiProviderName = legacyVideoPlatform
    ? 'apifox_hub'
    : normalizeVideoProvider(normalizeCapabilityProvider(parsed?.videoProviderPrimary, 'grsai'), 'grsai')
  let normalizedImageProviderPrimary: ImageProviderName = legacyImagePlatform ? 'apifox_hub' : normalizeImageProvider(parsed?.imageProviderPrimary, 'grsai')
  let normalizedChatProviderPrimary: 'grsai' | 'apifox_hub' = legacyChatPlatform
    ? 'apifox_hub'
    : parsed?.chatProviderPrimary === 'apifox_hub'
      ? 'apifox_hub'
      : 'grsai'
  // 原来用的是 VectorEngine（或别的已不存在的 hub 平台）：改走 GRS.AI
  if (normalizedVideoProviderPrimary === 'apifox_hub' && !isHubProfile(storedVideoProfile)) normalizedVideoProviderPrimary = 'grsai'
  if (normalizedImageProviderPrimary === 'apifox_hub' && !isHubProfile(storedImageProfile)) normalizedImageProviderPrimary = 'grsai'
  if (normalizedChatProviderPrimary === 'apifox_hub' && !isChatHubProfile(storedChatProfile)) normalizedChatProviderPrimary = 'grsai'

  // hub 平台档位：以后切回 apifox_hub 时用；没有可用值就落到 AI666
  const persistedVideoProfile: HubProfile = isHubProfile(storedVideoProfile) ? storedVideoProfile : 'ai666'
  const persistedImageProfile: HubProfile = isHubProfile(storedImageProfile) ? storedImageProfile : 'ai666'
  const persistedChatProfile: HubProfile = isChatHubProfile(storedChatProfile) ? storedChatProfile : 'ai666'
  const profile = persistedVideoProfile
  const activeHub = persistedVideoProfile === 'xibapi' ? xibapiHub : persistedVideoProfile === 'gaorui' ? gaoruiHub : ai666Hub
  return {
    seedanceApiKey: String(parsed?.seedanceApiKey ?? '').trim() || undefined,
    seedanceHost: String(parsed?.seedanceHost ?? '').trim() || 'https://ark.ap-southeast.bytepluses.com',
    grsaiApiKey: String(parsed?.grsaiApiKey ?? '').trim() || undefined,
    grsaiHost: String(parsed?.grsaiHost ?? '').trim() || 'https://grsaiapi.com',
    tikhubApiKey: String(parsed?.tikhubApiKey ?? '').trim() || undefined,
    qiniuAccessKey: String(parsed?.qiniuAccessKey ?? '').trim() || undefined,
    qiniuSecretKey: String(parsed?.qiniuSecretKey ?? '').trim() || undefined,
    qiniuBucket: String(parsed?.qiniuBucket ?? '').trim() || undefined,
    qiniuDomain: String(parsed?.qiniuDomain ?? '').trim() || undefined,
    qiniuUploadHost: String(parsed?.qiniuUploadHost ?? '').trim() || 'https://upload.qiniup.com',
    qiniuPrefix: String(parsed?.qiniuPrefix ?? '').trim() || 'videogenerate/clone',
    allowMockWhenNoKey: Boolean(parsed?.allowMockWhenNoKey ?? true),
    keyframeModel: String(parsed?.keyframeModel ?? '').trim() || 'local-product-frame',
    videoModelPrimary: normalizedVideoModelPrimary,
    videoModelFallback: normalizedVideoModelPrimary,
    grsaiVideoModel: normalizeAi666VideoModel(parsed?.grsaiVideoModel, 'grok-video-3'),
    grsaiAnalysisModel: String(parsed?.grsaiAnalysisModel ?? '').trim() || 'gemini-3.1-pro',
    chatProviderPrimary: normalizedChatProviderPrimary,
    videoProviderPrimary: normalizedVideoProviderPrimary,
    videoProviderFallback: normalizedVideoProviderPrimary,
    openaiApiKey: String(parsed?.openaiApiKey ?? '').trim() || undefined,
    openaiImageModel: String(parsed?.openaiImageModel ?? '').trim() || 'gpt-image-2',
    openaiImageQuality:
      parsed?.openaiImageQuality === 'low' || parsed?.openaiImageQuality === 'medium'
        ? parsed.openaiImageQuality
        : 'high',
    replicateApiToken: String(parsed?.replicateApiToken ?? '').trim() || undefined,
    imageProviderPrimary: normalizedImageProviderPrimary,
    grsaiImageModel: String(parsed?.grsaiImageModel ?? '').trim() || 'gpt-image-2',
    apifoxHubProfile: profile,
    videoApifoxHubProfile: persistedVideoProfile,
    imageApifoxHubProfile: persistedImageProfile,
    chatApifoxHubProfile: persistedChatProfile,
    ai666Hub,
    xibapiHub,
    gaoruiHub,
    apifoxHub: activeHub,
    videoModelSwitches: parsed?.videoModelSwitches && typeof parsed.videoModelSwitches === 'object' ? normalizeVideoModelSwitches(parsed.videoModelSwitches) : undefined,
    videoDefaultModelId: findVideoModelSpec(parsed?.videoDefaultModelId)?.id,
  }
}
