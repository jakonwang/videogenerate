export type StoredProviderKey = 'kling' | 'grsai' | 'apifox_hub'
export type CapabilityStoredProviderKey = Exclude<StoredProviderKey, 'kling'>
export type PlatformProfile = 'grsai' | 'ai666' | 'xibapi' | 'gaorui'
// VectorEngine 已于 2026-11-26 删除；旧配置里读到它时按默认平台处理（见 clone/credentials.ts）
/** apifox_hub 类平台都不可用时的兜底（GRS.AI 不是 hub，单独走 provider=grsai） */
const DEFAULT_HUB_PROFILE = 'ai666' as const
/** 图片：GRS.AI、AI666、小扳手、高瑞都有 OpenAI 兼容的 /v1/images/generations、/v1/images/edits */
export type ImagePlatformProfile = PlatformProfile
/** 对话：四个平台都有 OpenAI 兼容的 /v1/chat/completions */
export type ChatPlatformProfile = PlatformProfile
type HubProfile = Exclude<PlatformProfile, 'grsai'>
/** 每种能力可用的 hub 平台（GRS.AI 不是 hub，单独走 provider=grsai） */
const HUB_PROFILES_BY_CAPABILITY: Record<'video' | 'image' | 'chat', HubProfile[]> = {
  video: ['ai666', 'xibapi', 'gaorui'],
  image: ['ai666', 'xibapi', 'gaorui'],
  chat: ['ai666', 'xibapi', 'gaorui'],
}
const isHubProfileFor = (capability: 'video' | 'image' | 'chat', value: unknown): value is HubProfile =>
  (HUB_PROFILES_BY_CAPABILITY[capability] as unknown[]).includes(value)
export type CapabilityKey = 'video' | 'image' | 'chat'

export type CapabilityPlatformOption = {
  id: PlatformProfile
  label: string
  provider: StoredProviderKey | 'grsai'
  capabilities: CapabilityKey[]
}

export type CapabilityProfileState = {
  apifoxHubProfile: Exclude<PlatformProfile, 'grsai'>
  videoApifoxHubProfile: Exclude<PlatformProfile, 'grsai'>
  imageApifoxHubProfile: ImagePlatformProfile
  chatApifoxHubProfile: ChatPlatformProfile
}

export const CAPABILITY_PLATFORM_OPTIONS: CapabilityPlatformOption[] = [
  { id: 'grsai', label: 'GRS.AI', provider: 'grsai', capabilities: ['video', 'image', 'chat'] },
  { id: 'ai666', label: 'AI666', provider: 'apifox_hub', capabilities: ['video', 'image', 'chat'] },
  { id: 'xibapi', label: '小扳手', provider: 'apifox_hub', capabilities: ['video', 'image', 'chat'] },
  { id: 'gaorui', label: '高瑞', provider: 'apifox_hub', capabilities: ['video', 'image', 'chat'] },
]

export function listCapabilityPlatforms(capability: CapabilityKey): CapabilityPlatformOption[] {
  return CAPABILITY_PLATFORM_OPTIONS.filter((item) => item.capabilities.includes(capability))
}

export function getCapabilityPlatformLabel(platform: PlatformProfile): string {
  return CAPABILITY_PLATFORM_OPTIONS.find((item) => item.id === platform)?.label || 'GRS.AI'
}

export function resolveCapabilityPlatform(
  provider: CapabilityStoredProviderKey | undefined,
  profile: PlatformProfile | ImagePlatformProfile | ChatPlatformProfile | undefined,
  capability: CapabilityKey,
): PlatformProfile | ImagePlatformProfile | ChatPlatformProfile {
  if (provider === 'apifox_hub') return isHubProfileFor(capability, profile) ? profile : DEFAULT_HUB_PROFILE
  return 'grsai'
}

export function resolveCapabilityProviderLabel(
  provider: CapabilityStoredProviderKey | undefined,
  profile: PlatformProfile | ImagePlatformProfile | ChatPlatformProfile | undefined,
  capability: CapabilityKey,
): string {
  const platform = resolveCapabilityPlatform(provider, profile, capability)
  return getCapabilityPlatformLabel(platform as PlatformProfile)
}

export function mapPlatformToStoredProvider(
  platform: PlatformProfile | ImagePlatformProfile | ChatPlatformProfile,
) : { provider: CapabilityStoredProviderKey; profile?: PlatformProfile } {
  if (platform === 'grsai') return { provider: 'grsai' }
  return { provider: 'apifox_hub', profile: platform as PlatformProfile }
}

export function normalizeIncomingPlatformProfile(
  capability: CapabilityKey,
  profile: unknown,
  fallback: PlatformProfile = DEFAULT_HUB_PROFILE,
): PlatformProfile | ImagePlatformProfile | ChatPlatformProfile {
  if (isHubProfileFor(capability, profile)) return profile
  return isHubProfileFor(capability, fallback) ? fallback : DEFAULT_HUB_PROFILE
}

export function extractLegacyCapabilityPlatform(
  capability: CapabilityKey,
  provider: unknown,
  fallbackProvider?: unknown,
): Exclude<PlatformProfile, 'grsai'> | ImagePlatformProfile | ChatPlatformProfile | undefined {
  if (isHubProfileFor(capability, provider)) return provider
  if (capability === 'video' && isHubProfileFor(capability, fallbackProvider)) return fallbackProvider
  return undefined
}

export function normalizeCapabilityProfileState(input: {
  apifoxHubProfile?: unknown
  videoApifoxHubProfile?: unknown
  imageApifoxHubProfile?: unknown
  chatApifoxHubProfile?: unknown
  videoProviderPrimary?: unknown
  videoProviderFallback?: unknown
  imageProviderPrimary?: unknown
  chatProviderPrimary?: unknown
}): CapabilityProfileState {
  const legacyVideoProfile = extractLegacyCapabilityPlatform('video', input.videoProviderPrimary, input.videoProviderFallback)
  const legacyImageProfile = extractLegacyCapabilityPlatform('image', input.imageProviderPrimary)
  const legacyChatProfile = extractLegacyCapabilityPlatform('chat', input.chatProviderPrimary)
  const apifoxHubProfile = normalizeIncomingPlatformProfile('video', input.apifoxHubProfile ?? legacyVideoProfile, DEFAULT_HUB_PROFILE) as Exclude<PlatformProfile, 'grsai'>
  return {
    apifoxHubProfile,
    videoApifoxHubProfile: normalizeIncomingPlatformProfile(
      'video',
      input.videoApifoxHubProfile ?? legacyVideoProfile ?? apifoxHubProfile,
      apifoxHubProfile,
    ) as Exclude<PlatformProfile, 'grsai'>,
    imageApifoxHubProfile: normalizeIncomingPlatformProfile(
      'image',
      input.imageApifoxHubProfile ?? legacyImageProfile ?? apifoxHubProfile,
      apifoxHubProfile,
    ) as ImagePlatformProfile,
    chatApifoxHubProfile: normalizeIncomingPlatformProfile(
      'chat',
      input.chatApifoxHubProfile ?? legacyChatProfile ?? apifoxHubProfile,
      apifoxHubProfile,
    ) as ChatPlatformProfile,
  }
}
