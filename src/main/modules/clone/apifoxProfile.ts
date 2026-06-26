import type { ApifoxHubCredentials, ModelCredentials } from './types'
import { normalizeIncomingPlatformProfile, type CapabilityKey } from '../../../shared/platformSettings'

export type ApifoxCapability = CapabilityKey
export type ApifoxProfile = 'ai666' | 'vectorengine' | 'xibapi' | 'gaorui'

export function resolveApifoxHubProfile(credentials: ModelCredentials | undefined, capability: ApifoxCapability): ApifoxProfile {
  const profile =
    capability === 'video'
      ? credentials?.videoApifoxHubProfile
      : capability === 'image'
        ? credentials?.imageApifoxHubProfile
        : credentials?.chatApifoxHubProfile
  return normalizeIncomingPlatformProfile(capability, profile ?? credentials?.apifoxHubProfile, 'vectorengine') as ApifoxProfile
}

export function resolveApifoxHubCredentials(
  credentials: ModelCredentials | undefined,
  capability: ApifoxCapability,
): ApifoxHubCredentials | undefined {
  if (!credentials) return undefined
  const profile = resolveApifoxHubProfile(credentials, capability)
  const shared = credentials.apifoxHub
  const scoped =
    profile === 'ai666'
      ? credentials.ai666Hub
      : profile === 'xibapi'
        ? credentials.xibapiHub
        : profile === 'gaorui'
          ? credentials.gaoruiHub
        : credentials.vectorEngineHub
  if (!scoped) return shared
  if (!shared) return scoped
  return {
    ...shared,
    ...scoped,
    baseUrl: String(scoped.baseUrl || shared.baseUrl || '').trim(),
    apiKey: String(scoped.apiKey || shared.apiKey || '').trim() || undefined,
  }
}
