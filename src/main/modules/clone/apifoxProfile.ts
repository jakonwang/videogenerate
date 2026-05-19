import type { ApifoxHubCredentials, ModelCredentials } from './types'

export type ApifoxCapability = 'video' | 'image' | 'chat'
export type ApifoxProfile = 'ai666' | 'vectorengine'

export function resolveApifoxHubProfile(credentials: ModelCredentials | undefined, capability: ApifoxCapability): ApifoxProfile {
  const profile =
    capability === 'video'
      ? credentials?.videoApifoxHubProfile
      : capability === 'image'
        ? credentials?.imageApifoxHubProfile
        : credentials?.chatApifoxHubProfile
  if (profile === 'ai666' || profile === 'vectorengine') return profile
  return credentials?.apifoxHubProfile === 'ai666' ? 'ai666' : 'vectorengine'
}

export function resolveApifoxHubCredentials(
  credentials: ModelCredentials | undefined,
  capability: ApifoxCapability,
): ApifoxHubCredentials | undefined {
  if (!credentials) return undefined
  const profile = resolveApifoxHubProfile(credentials, capability)
  return profile === 'ai666' ? credentials.ai666Hub ?? credentials.apifoxHub : credentials.vectorEngineHub ?? credentials.apifoxHub
}
