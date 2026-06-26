export type StoredProviderKey = 'kling' | 'grsai' | 'apifox_hub'
export type CapabilityStoredProviderKey = Exclude<StoredProviderKey, 'kling'>
export type PlatformProfile = 'grsai' | 'ai666' | 'vectorengine' | 'xibapi' | 'gaorui'
export type ImagePlatformProfile = Exclude<PlatformProfile, 'xibapi' | 'gaorui'>
export type ChatPlatformProfile = Exclude<PlatformProfile, 'xibapi' | 'gaorui'>
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
  { id: 'vectorengine', label: 'VectorEngine', provider: 'apifox_hub', capabilities: ['video', 'image', 'chat'] },
  { id: 'xibapi', label: 'XIBAPI', provider: 'apifox_hub', capabilities: ['video'] },
  { id: 'gaorui', label: 'GaoruiAPI', provider: 'apifox_hub', capabilities: ['video'] },
]

export function listCapabilityPlatforms(capability: CapabilityKey): CapabilityPlatformOption[] {
  return CAPABILITY_PLATFORM_OPTIONS.filter((item) => item.capabilities.includes(capability))
}

export function getCapabilityPlatformLabel(platform: PlatformProfile): string {
  return CAPABILITY_PLATFORM_OPTIONS.find((item) => item.id === platform)?.label || 'VectorEngine'
}

export function resolveCapabilityPlatform(
  provider: CapabilityStoredProviderKey | undefined,
  profile: PlatformProfile | ImagePlatformProfile | ChatPlatformProfile | undefined,
  capability: CapabilityKey,
): PlatformProfile | ImagePlatformProfile | ChatPlatformProfile {
  if (provider === 'apifox_hub') {
    if (capability === 'video') return profile === 'ai666' || profile === 'xibapi' || profile === 'gaorui' ? profile : 'vectorengine'
    return profile === 'ai666' ? 'ai666' : 'vectorengine'
  }
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
  fallback: PlatformProfile = 'vectorengine',
): PlatformProfile | ImagePlatformProfile | ChatPlatformProfile {
  if (capability === 'video') {
    if (profile === 'ai666' || profile === 'vectorengine' || profile === 'xibapi' || profile === 'gaorui') return profile
    return fallback
  }
  if (profile === 'ai666' || profile === 'vectorengine') return profile
  return fallback === 'ai666' ? 'ai666' : 'vectorengine'
}

export function extractLegacyCapabilityPlatform(
  capability: CapabilityKey,
  provider: unknown,
  fallbackProvider?: unknown,
): Exclude<PlatformProfile, 'grsai'> | ImagePlatformProfile | ChatPlatformProfile | undefined {
  if (capability === 'video') {
    if (provider === 'ai666' || provider === 'vectorengine' || provider === 'xibapi' || provider === 'gaorui') return provider
    if (fallbackProvider === 'ai666' || fallbackProvider === 'vectorengine' || fallbackProvider === 'xibapi' || fallbackProvider === 'gaorui') return fallbackProvider
    return undefined
  }
  if (provider === 'ai666' || provider === 'vectorengine') return provider
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
  const apifoxHubProfile = normalizeIncomingPlatformProfile('video', input.apifoxHubProfile ?? legacyVideoProfile, 'vectorengine') as Exclude<PlatformProfile, 'grsai'>
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
