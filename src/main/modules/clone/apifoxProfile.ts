import type { ApifoxHubCredentials, ModelCredentials } from './types'

export type ApifoxCapability = 'video' | 'image' | 'chat'
export type ApifoxProfile = 'ai666' | 'vectorengine' | 'xibapi'

export function resolveApifoxHubProfile(credentials: ModelCredentials | undefined, capability: ApifoxCapability): ApifoxProfile {
  const profile =
    capability === 'video'
      ? credentials?.videoApifoxHubProfile
      : capability === 'image'
        ? credentials?.imageApifoxHubProfile
        : credentials?.chatApifoxHubProfile
  if (profile === 'ai666' || profile === 'vectorengine' || profile === 'xibapi') return profile
  return credentials?.apifoxHubProfile === 'ai666'
    ? 'ai666'
    : credentials?.apifoxHubProfile === 'xibapi'
      ? 'xibapi'
      : 'vectorengine'
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
