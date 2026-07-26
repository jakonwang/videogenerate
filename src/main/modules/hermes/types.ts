export type HermesRuntimeState =
  | 'missing'
  | 'installing'
  | 'updating'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'repair_required'
  | 'error'

export type HermesRuntimeStatus = {
  state: HermesRuntimeState
  version?: string
  profile: string
  root?: string
  port?: number
  error?: string
  logs: string[]
}

export type HermesInstallationState =
  | 'missing'
  | 'installing'
  | 'updating'
  | 'repairing'
  | 'update_available'
  | 'ready'
  | 'repair_required'

export type HermesInstallationStatus = {
  state: HermesInstallationState
  installedVersion?: string
  installedCommit?: string
  targetVersion?: string
  targetCommit?: string
  root?: string
  profileDir?: string
  error?: string
  logs: string[]
  updatedAt?: number
}

export type HermesChannelField = {
  key: string
  prompt: string
  description: string
  required: boolean
  password: boolean
  advanced: boolean
  configured: boolean
  redactedValue: string
}

export type HermesChannelSummary = {
  id: string
  name: string
  description: string
  docsUrl: string
  enabled: boolean
  configured: boolean
  connected: boolean
  state: string
  gatewayRunning: boolean
  fields: HermesChannelField[]
}

export type HermesPairingStatus = {
  pairingId: string
  platform: 'wecom' | 'weixin'
  state: 'waiting' | 'scanned' | 'connected' | 'expired'
  qrContent?: string
  expiresAt: number
}

export type HermesGatewayEvent = {
  sequence: number
  type: string
  sessionId?: string
  storedSessionId?: string
  payload: Record<string, unknown>
  createdAt: number
}

export type HermesPendingInput = {
  kind: 'approval' | 'clarification' | 'secret' | 'sudo'
  requestId?: string
  sessionId?: string
  storedSessionId?: string
  payload: Record<string, unknown>
  createdAt: number
}

export type HermesSessionSummary = {
  id: string
  title: string
  preview: string
  startedAt: number
  messageCount: number
  source: string
}

export type HermesSessionMessage = {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: unknown
  text?: unknown
  reasoning?: string | null
  reasoningContent?: string | null
  toolCallId?: string | null
  toolCalls?: unknown
  toolName?: string
  timestamp?: number
}

export type HermesSessionCreateResult = {
  sessionId: string
  storedSessionId: string
  messages: HermesSessionMessage[]
  info: Record<string, unknown>
  conversationId?: string
  employeeId?: string
}

export type HermesSessionResumeResult = HermesSessionCreateResult & {
  resumed?: string
}

export type HermesPromptAttachment = {
  path: string
  name?: string
  mediaType?: 'image' | 'video' | 'file'
}

export type HermesEmployeeSessionInput = {
  employeeId: string
  cwd?: string
  model?: string
  provider?: string
  reasoningEffort?: string
  attachments?: HermesPromptAttachment[]
}

export type HermesModelProvider = {
  slug: string
  name: string
  authenticated: boolean
  authType: string
  keyEnv?: string
  isCurrent: boolean
  isUserDefined: boolean
  models: string[]
  warning?: string
}

export type HermesModelOptions = {
  provider: string
  model: string
  providers: HermesModelProvider[]
  custom: {
    model: string
    baseUrl: string
    apiKeyConfigured: boolean
  }
}
