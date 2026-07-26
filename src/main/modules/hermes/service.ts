import type { AgentEmployeeManifest } from '../agent-os/types'
import { agentOsService } from '../agent-os/service'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { materializeManagedAsset } from '../managed-assets/service'
import { hermesRuntime } from './runtime'
import type { HermesGatewayClient } from './gatewayClient'
import { sanitizeHermesEvent } from './eventSanitizer'
import { hermesEventStore } from './eventStore'
import { parseHermesMessagingAttachmentSend, parseHermesMessagingSend, sendHermesMessage } from './messaging'
import { approveHermesPairing, listHermesPairings, parseHermesPairingCommand } from './pairing'
import type {
  HermesEmployeeSessionInput,
  HermesGatewayEvent,
  HermesModelOptions,
  HermesModelProvider,
  HermesPromptAttachment,
  HermesSessionCreateResult,
  HermesSessionMessage,
  HermesSessionResumeResult,
  HermesSessionSummary,
} from './types'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function isSessionBusyError(error: unknown) {
  return /session busy/i.test(String((error as Error)?.message || error))
}

function normalizeCreateResult(value: unknown): HermesSessionCreateResult {
  const result = asRecord(value)
  return {
    sessionId: String(result.session_id || ''),
    storedSessionId: String(result.stored_session_id || result.resumed || ''),
    messages: Array.isArray(result.messages) ? result.messages as HermesSessionMessage[] : [],
    info: {
      ...asRecord(result.info),
      running: Boolean(result.running),
      status: String(result.status || ''),
      inflight: asRecord(result.inflight),
    },
  }
}

function normalizeModelProvider(value: unknown): HermesModelProvider {
  const row = asRecord(value)
  return {
    slug: String(row.slug || ''),
    name: String(row.name || row.slug || ''),
    authenticated: Boolean(row.authenticated),
    authType: String(row.auth_type || ''),
    keyEnv: String(row.key_env || '') || undefined,
    isCurrent: Boolean(row.is_current),
    isUserDefined: Boolean(row.is_user_defined),
    models: Array.isArray(row.models) ? row.models.map(String).filter(Boolean) : [],
    warning: String(row.warning || '') || undefined,
  }
}

function employeeSeed(employee: AgentEmployeeManifest, channel: 'desktop' | 'feishu', conversationId: string) {
  const channelPolicy = channel === 'feishu'
    ? 'This remote channel may use reasoning, memory, skills, and VideoGenerate business capabilities only. Do not use terminal, file write, secret, or administrator capabilities. For business workflows, return the pending run for approval instead of waiting for completion.'
    : 'Use the full local Hermes capability set. Ask for approval before destructive actions, publishing, file writes, secrets, or administrator access.'
  return [
    `You are the ${employee.name} employee inside VideoGenerate.`,
    employee.description,
    employee.plannerPolicy,
    employee.reviewerPolicy,
    channelPolicy,
    `Conversation reference: ${conversationId}.`,
    'Use semantic VideoGenerate business capabilities for product, material, video, subtitle, publishing, artifact, and run operations.',
    'Use the VideoGenerate messaging pairing capability when the user explicitly supplies a supported channel and pairing code.',
    'Use the VideoGenerate messaging delivery capability when the user explicitly asks to send a specific message or attached local media to a supported channel. Pass the exact attached local path in mediaPaths. Never claim delivery unless the capability returns success.',
    'Never expose internal provider names, adapter names, access tokens, or implementation details to the user.',
  ].filter(Boolean).join('\n')
}

type HermesRequest = (method: string, params: Record<string, unknown>) => Promise<unknown>

type StagedHermesPrompt = {
  text: string
  attachedImagePaths: string[]
}

async function detachImages(request: HermesRequest, sessionId: string, imagePaths: string[]) {
  await Promise.all(imagePaths.map(async (path) => {
    await request('image.detach', { session_id: sessionId, path }).catch(() => undefined)
  }))
}

export async function stageHermesPromptAttachments(input: {
  sessionId: string
  text: string
  attachments?: HermesPromptAttachment[]
}, request: HermesRequest): Promise<StagedHermesPrompt> {
  const sessionId = String(input.sessionId || '').trim()
  const promptText = String(input.text || '').trim()
  const attachments = await Promise.all(
    (Array.isArray(input.attachments) ? input.attachments : [])
      .map((item) => ({
        path: String(item?.path || '').trim(),
        name: String(item?.name || '').trim(),
        mediaType: item?.mediaType,
      }))
      .filter((item) => item.path)
      .map(async (item) => ({
        ...item,
        path: await materializeManagedAsset({
          sourcePath: item.path,
          module: 'hermes',
          ownerId: sessionId,
          assetId: `${Date.now()}-${randomUUID()}`,
        }),
      })),
  )
  const uniqueAttachments = attachments.filter((item, index) => {
    const key = item.path.toLocaleLowerCase()
    return attachments.findIndex((candidate) => candidate.path.toLocaleLowerCase() === key) === index
  })
  const attachedImagePaths: string[] = []
  const fileReferences: string[] = []

  try {
    for (const attachment of uniqueAttachments) {
      if (attachment.mediaType === 'image') {
        const result = asRecord(await request('image.attach', {
          session_id: sessionId,
          path: attachment.path,
        }))
        if (!result.attached) throw new Error(String(result.message || `Hermes could not attach ${attachment.name || attachment.path}.`))
        attachedImagePaths.push(String(result.path || attachment.path))
        continue
      }

      const result = asRecord(await request('file.attach', {
        session_id: sessionId,
        path: attachment.path,
        name: attachment.name || basename(attachment.path),
      }))
      const reference = String(result.ref_text || '').trim()
      if (!result.attached || !reference) throw new Error(String(result.message || `Hermes could not attach ${attachment.name || attachment.path}.`))
      fileReferences.push(reference)
    }
  } catch (error) {
    await detachImages(request, sessionId, attachedImagePaths)
    throw error
  }

  const text = [fileReferences.join('\n'), promptText].filter(Boolean).join('\n\n')
    || (attachedImagePaths.length ? 'What do you see in the attached image?' : '')
  return { text, attachedImagePaths }
}

class HermesAgentService {
  private listeners = new Set<(events: HermesGatewayEvent[]) => void>()
  private liveStoredSessionIds = new Map<string, string>()
  private refreshedApplicationModelSessions = new Map<string, string>()
  private remoteSessionIds = new Set<string>()
  private remoteLiveSessions = new Map<string, string>()
  private remoteClarifications = new Map<string, { sessionId: string; requestId: string }>()

  constructor() {
    hermesRuntime.gateway.subscribe((event) => {
      void this.handleGatewayEvent(event).catch((error) => {
        console.error('[hermes] event persistence failed', error)
      })
    })
  }

  private async handleGatewayEvent(event: HermesGatewayEvent) {
    const safeEvent = sanitizeHermesEvent({
      ...event,
      storedSessionId: event.sessionId ? this.liveStoredSessionIds.get(event.sessionId) : undefined,
    })
    const storedEvent = await hermesEventStore.append({
      type: safeEvent.type,
      sessionId: safeEvent.sessionId,
      storedSessionId: safeEvent.storedSessionId,
      payload: safeEvent.payload,
      createdAt: safeEvent.createdAt,
    })
    for (const listener of this.listeners) listener([storedEvent])
    if (!storedEvent.sessionId || !this.remoteSessionIds.has(storedEvent.sessionId)) return
    if (storedEvent.type === 'approval.request') {
      await this.respondApproval(storedEvent.sessionId, 'deny').catch(() => undefined)
    } else if (storedEvent.type === 'sudo.request') {
      await this.respondSudo(storedEvent.sessionId, String(storedEvent.payload.request_id || ''), '').catch(() => undefined)
    } else if (storedEvent.type === 'secret.request') {
      await this.respondSecret(storedEvent.sessionId, String(storedEvent.payload.request_id || ''), '').catch(() => undefined)
    }
  }

  private async recordLocalEvent(sessionId: string, type: string, payload: Record<string, unknown> = {}) {
    const event = await hermesEventStore.append({
      type,
      sessionId,
      storedSessionId: this.liveStoredSessionIds.get(sessionId),
      payload,
      createdAt: Date.now(),
    })
    for (const listener of this.listeners) listener([event])
    return event
  }

  getRuntimeStatus() {
    return hermesRuntime.getStatus()
  }

  async restartRuntime() {
    return await hermesRuntime.restart()
  }

  async listSessions(limit = 100): Promise<HermesSessionSummary[]> {
    const client = await this.client()
    const result = asRecord(await client.request('session.list', { limit }))
    return (Array.isArray(result.sessions) ? result.sessions : []).map((item) => {
      const row = asRecord(item)
      return {
        id: String(row.id || ''),
        title: String(row.title || ''),
        preview: String(row.preview || ''),
        startedAt: Number(row.started_at || 0),
        messageCount: Number(row.message_count || 0),
        source: String(row.source || ''),
      }
    }).filter((item) => item.id)
  }

  async getModelOptions(sessionId?: string): Promise<HermesModelOptions> {
    const client = await this.client()
    const result = asRecord(await client.request('model.options', sessionId ? { session_id: sessionId } : {}))
    const custom = await hermesRuntime.getCustomModelSettings()
    return {
      provider: String(result.provider || ''),
      model: String(result.model || ''),
      providers: (Array.isArray(result.providers) ? result.providers : [])
        .map(normalizeModelProvider)
        .filter((item) => item.slug),
      custom,
    }
  }

  async saveProviderKey(input: { provider: string; apiKey: string; sessionId?: string }) {
    const provider = String(input.provider || '').trim()
    const apiKey = String(input.apiKey || '').trim()
    if (!provider || !apiKey || /[\r\n]/.test(apiKey)) throw new Error('A valid provider and API key are required.')
    const options = await this.getModelOptions(input.sessionId)
    const selected = options.providers.find((item) => item.slug === provider)
    if (!selected || selected.authType !== 'api_key') throw new Error('This provider does not support API key setup in the desktop app.')
    const client = await this.client()
    await client.request('model.save_key', { slug: provider, api_key: apiKey, session_id: input.sessionId })
    return await this.getModelOptions(input.sessionId)
  }

  async selectModel(input: { provider: string; model: string; sessionId?: string }) {
    const provider = String(input.provider || '').trim()
    const model = String(input.model || '').trim()
    const options = await this.getModelOptions(input.sessionId)
    const selected = options.providers.find((item) => item.slug === provider)
    if (!selected || !selected.models.includes(model)) throw new Error('The selected Hermes model is unavailable.')
    if (!selected.authenticated) throw new Error('Model authentication is required before selecting this provider.')
    const client = await this.client()
    return asRecord(await client.request('config.set', {
      key: 'model',
      value: `${model} --provider ${provider} --global`,
      session_id: input.sessionId,
    }))
  }

  async disconnectModelProvider(input: { provider: string; sessionId?: string }) {
    const provider = String(input.provider || '').trim()
    if (!provider) throw new Error('A provider is required.')
    const client = await this.client()
    await client.request('model.disconnect', { slug: provider, session_id: input.sessionId })
    return await this.getModelOptions(input.sessionId)
  }

  async saveCustomModel(input: { model: string; baseUrl: string; apiKey?: string }) {
    await hermesRuntime.saveCustomModelSettings(input)
    await hermesRuntime.restart()
    return await this.getModelOptions()
  }

  async useApplicationModel() {
    const [{ cloneService }, { resolveApifoxHubCredentials }, { generateChatCompletion }] = await Promise.all([
      import('../clone/service'),
      import('../clone/apifoxProfile'),
      import('../clone/unifiedChat'),
    ])
    const credentials = await cloneService.getModelCredentials()
    const hub = resolveApifoxHubCredentials(credentials, 'chat')
    if (!hub?.enabled || !String(hub.baseUrl || '').trim() || !String(hub.apiKey || '').trim()) {
      throw new Error('The application chat model is not configured.')
    }
    const verification = await generateChatCompletion({
      credentials,
      prompt: 'Reply with exactly VG_APP_MODEL_OK.',
      timeoutMs: 60_000,
    })
    if (!String(verification.content || '').includes('VG_APP_MODEL_OK')) {
      throw new Error('The application chat model did not pass verification.')
    }
    await hermesRuntime.saveApplicationModelBridge(verification.model)
    await hermesRuntime.restart()
    return await this.getModelOptions()
  }

  async testModelConnection() {
    const client = await this.client()
    const created = normalizeCreateResult(await client.request('session.create', {
      source: 'videogenerate-diagnostic',
      title: 'Connection diagnostic',
      messages: [{ role: 'system', content: 'This is a private connection diagnostic. Reply with OK only.' }],
    }))
    if (!created.sessionId || !created.storedSessionId) throw new Error('Hermes could not create a diagnostic session.')
    try {
      const outcomePromise = this.waitForSessionOutcome(created.sessionId, 90_000)
      await client.request('prompt.submit', { session_id: created.sessionId, text: 'Reply with OK only.' })
      const outcome = await outcomePromise
      if (outcome.type === 'error') throw new Error(String(outcome.payload.message || 'Hermes model connection failed.'))
      return { success: true }
    } finally {
      await client.request('session.close', { session_id: created.sessionId }).catch(() => undefined)
      await client.request('session.delete', { session_id: created.storedSessionId }).catch(() => undefined)
    }
  }

  async createSession(input: HermesEmployeeSessionInput & {
    channel?: 'desktop' | 'feishu'
    context?: Record<string, unknown>
    externalUserId?: string
    externalConversationId?: string
  }) {
    const channel = input.channel === 'feishu' ? 'feishu' : 'desktop'
    const employees = await agentOsService.listEmployees()
    const employee = employees.find((item) => item.id === input.employeeId && item.enabled)
    if (!employee) throw new Error('The selected employee is unavailable.')
    const conversation = await agentOsService.createConversation({
      employeeId: employee.id,
      channel,
      context: input.context,
      externalUserId: input.externalUserId,
      externalConversationId: input.externalConversationId,
    })
    const client = await this.client()
    const created = normalizeCreateResult(await client.request('session.create', {
      source: channel === 'feishu' ? 'videogenerate-feishu' : 'videogenerate-desktop',
      cwd: input.cwd,
      model: input.model,
      provider: input.provider,
      reasoning_effort: input.reasoningEffort,
      messages: [{ role: 'system', content: employeeSeed(employee, channel, conversation.id) }],
    }))
    if (!created.sessionId || !created.storedSessionId) throw new Error('Hermes returned an invalid session identity.')
    this.liveStoredSessionIds.set(created.sessionId, created.storedSessionId)
    await agentOsService.linkHermesSession({ conversationId: conversation.id, storedSessionId: created.storedSessionId })
    if (channel === 'feishu') this.remoteSessionIds.add(created.sessionId)
    return { ...created, conversationId: conversation.id, employeeId: employee.id }
  }

  async resumeSession(storedSessionId: string): Promise<HermesSessionResumeResult> {
    const client = await this.client()
    const active = asRecord(await client.request('session.active_list', {}))
    const activeSession = (Array.isArray(active.sessions) ? active.sessions : [])
      .map(asRecord)
      .find((item) => String(item.session_key || '') === storedSessionId)
    const activeSessionId = String(activeSession?.id || activeSession?.session_id || '')
    if (activeSessionId) {
      this.liveStoredSessionIds.set(activeSessionId, storedSessionId)
      if (!activeSession?.running) await this.refreshApplicationModelBridgeSession(client, activeSessionId)
      const [messages, conversation] = await Promise.all([
        this.getHistory(activeSessionId).catch(() => [] as HermesSessionMessage[]),
        agentOsService.findConversationByHermesSession(storedSessionId),
      ])
      return {
        sessionId: activeSessionId,
        storedSessionId,
        messages,
        info: {
          running: Boolean(activeSession?.running),
          status: String(activeSession?.status || ''),
          inflight: asRecord(activeSession?.inflight),
        },
        resumed: storedSessionId,
        conversationId: conversation?.id,
        employeeId: conversation?.employeeId,
      }
    }
    const result = normalizeCreateResult(await client.request('session.resume', {
      session_id: storedSessionId,
    }))
    if (result.sessionId && result.storedSessionId) this.liveStoredSessionIds.set(result.sessionId, result.storedSessionId)
    if (result.sessionId) await this.refreshApplicationModelBridgeSession(client, result.sessionId)
    const conversation = (
      await agentOsService.findConversationByHermesSession(result.storedSessionId)
      || await agentOsService.findConversationByHermesSession(storedSessionId)
    )
    if (conversation && result.storedSessionId && result.storedSessionId !== storedSessionId) {
      await agentOsService.linkHermesSession({ conversationId: conversation.id, storedSessionId: result.storedSessionId })
    }
    return {
      ...result,
      resumed: result.storedSessionId,
      conversationId: conversation?.id,
      employeeId: conversation?.employeeId,
    }
  }

  private async refreshApplicationModelBridgeSession(client: HermesGatewayClient, sessionId: string) {
    const selection = await hermesRuntime.getApplicationModelBridgeSelection()
    if (!selection) return
    const bindingKey = `${selection.provider}|${selection.model}|${selection.baseUrl}`
    if (this.refreshedApplicationModelSessions.get(sessionId) === bindingKey) return
    const options = asRecord(await client.request('model.options', { session_id: sessionId }))
    const provider = String(options.provider || '').trim()
    const model = String(options.model || '').trim()
    if (model !== selection.model || !['custom', selection.provider].includes(provider)) return
    await client.request('config.set', {
      key: 'model',
      value: `${selection.model} --provider ${selection.provider} --session`,
      session_id: sessionId,
    })
    this.refreshedApplicationModelSessions.set(sessionId, bindingKey)
  }

  async handleFeishuOfficialEvent(body: Record<string, unknown>) {
    const text = this.findString(body, ['text', 'content', 'message'])
    const externalUserId = this.findString(body, ['userId', 'user_id', 'open_id', 'sender_id']) || 'feishu-user'
    const externalConversationId = this.findString(body, ['conversationId', 'conversation_id', 'chat_id', 'open_chat_id']) || externalUserId
    const identityKey = `${externalConversationId}:${externalUserId}`
    const pending = this.remoteClarifications.get(identityKey)
    let requestText = text
    if (!pending) {
      const match = /^(?:AI\u5458\u5de5|\u5458\u5de5|Hermes)\s*[:\uFF1A]\s*([\s\S]+)$/i.exec(text)
      if (!match) return { ok: true, matched: false, actions: [] }
      requestText = match[1].trim()
    }

    let sessionId = pending?.sessionId || this.remoteLiveSessions.get(identityKey) || ''
    if (!sessionId) {
      const conversations = await agentOsService.listConversations(500)
      const existing = conversations.find((item) =>
        item.channel === 'feishu' &&
        item.externalConversationId === externalConversationId &&
        item.externalUserId === externalUserId &&
        item.hermesStoredSessionId,
      )
      if (existing?.hermesStoredSessionId) {
        const resumed = await this.resumeSession(existing.hermesStoredSessionId)
        sessionId = resumed.sessionId
      } else {
        const created = await this.createSession({
          employeeId: 'employee.supervisor',
          channel: 'feishu',
          externalUserId,
          externalConversationId,
          context: { remoteBusinessRunsShouldReturnAfterApprovalRequest: true },
        })
        sessionId = created.sessionId
      }
      this.remoteLiveSessions.set(identityKey, sessionId)
      this.remoteSessionIds.add(sessionId)
    }

    if (pending) {
      this.remoteClarifications.delete(identityKey)
      await this.respondClarification(sessionId, pending.requestId, requestText)
    } else {
      await this.sendPrompt({ sessionId, text: requestText })
    }

    const outcome = await this.waitForRemoteOutcome(sessionId, 180_000)
    if (outcome.type === 'clarify.request') {
      const requestId = String(outcome.payload.request_id || '')
      if (requestId) this.remoteClarifications.set(identityKey, { sessionId, requestId })
      return { ok: true, matched: true, actions: [{ type: 'text', text: String(outcome.payload.question || 'More information is required.') }] }
    }
    if (outcome.type === 'error') {
      return { ok: false, matched: true, actions: [{ type: 'text', text: String(outcome.payload.message || 'Hermes could not complete the request.') }] }
    }
    return { ok: true, matched: true, actions: [{ type: 'text', text: String(outcome.payload.text || '') }] }
  }

  async forkSession(sessionId: string, name?: string) {
    const sourceSessionId = String(sessionId || '').trim()
    if (!sourceSessionId) throw new Error('A session ID is required.')
    const client = await this.client()
    const branched = asRecord(await client.request('session.branch', { session_id: sourceSessionId, name }))
    const branchedSessionId = String(branched.session_id || '').trim()
    if (!branchedSessionId) throw new Error('Hermes returned an invalid branch session identity.')

    const active = asRecord(await client.request('session.active_list', { current_session_id: branchedSessionId }))
    const activeSession = (Array.isArray(active.sessions) ? active.sessions : [])
      .map(asRecord)
      .find((item) => String(item.id || item.session_id || '') === branchedSessionId)
    const storedSessionId = String(activeSession?.session_key || '').trim()
    if (!storedSessionId) throw new Error('Hermes did not expose the persistent branch identity.')
    const activeSessions = (Array.isArray(active.sessions) ? active.sessions : []).map(asRecord)
    const sourceActiveSession = activeSessions.find((item) => String(item.id || item.session_id || '') === sourceSessionId)
    const sourceStoredSessionId = String(sourceActiveSession?.session_key || branched.parent || '').trim()
    const conversation = await agentOsService.findConversationByHermesSession(sourceStoredSessionId)
    if (conversation) {
      await agentOsService.linkHermesSession({ conversationId: conversation.id, storedSessionId })
    }
    this.liveStoredSessionIds.set(branchedSessionId, storedSessionId)

    return {
      sessionId: branchedSessionId,
      storedSessionId,
      title: String(branched.title || activeSession?.title || ''),
      parentStoredSessionId: String(branched.parent || ''),
      conversationId: conversation?.id,
      employeeId: conversation?.employeeId,
    }
  }

  async closeSession(sessionId: string) {
    const client = await this.client()
    const result = asRecord(await client.request('session.close', { session_id: sessionId }))
    this.liveStoredSessionIds.delete(sessionId)
    this.refreshedApplicationModelSessions.delete(sessionId)
    return result
  }

  async renameSession(input: { sessionId: string; title: string }) {
    const sessionId = String(input.sessionId || '').trim()
    const title = String(input.title || '').trim()
    if (!sessionId) throw new Error('A session ID is required.')
    if (!title) throw new Error('A session title is required.')
    if (title.length > 120) throw new Error('The session title must not exceed 120 characters.')
    return await hermesRuntime.dashboardRequest(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
  }

  async deleteSession(sessionId: string) {
    const storedSessionId = String(sessionId || '').trim()
    if (!storedSessionId) throw new Error('A session ID is required.')
    const client = await this.client()
    const active = asRecord(await client.request('session.active_list', {}))
    const matchingLiveIds = (Array.isArray(active.sessions) ? active.sessions : [])
      .map(asRecord)
      .filter((item) => String(item.session_key || '') === storedSessionId)
      .map((item) => String(item.id || item.session_id || ''))
      .filter(Boolean)
    for (const liveSessionId of matchingLiveIds) {
      await client.request('session.close', { session_id: liveSessionId })
      this.liveStoredSessionIds.delete(liveSessionId)
      this.refreshedApplicationModelSessions.delete(liveSessionId)
    }
    const result = asRecord(await client.request('session.delete', { session_id: storedSessionId }))
    await hermesEventStore.removeSession(storedSessionId)
    return result
  }

  async getHistory(sessionId: string) {
    const client = await this.client()
    const result = asRecord(await client.request('session.history', { session_id: sessionId }))
    return Array.isArray(result.messages) ? result.messages as HermesSessionMessage[] : []
  }

  async sendPrompt(input: { sessionId: string; text: string; attachments?: HermesPromptAttachment[]; regenerateUserOrdinal?: number }) {
    const attachmentMessagingCommand = input.attachments?.length
      ? parseHermesMessagingAttachmentSend(input.text)
      : undefined
    if (attachmentMessagingCommand) {
      const attachments = await Promise.all(
        (input.attachments || []).map(async (attachment) => ({
          ...attachment,
          path: await materializeManagedAsset({
            sourcePath: attachment.path,
            module: 'hermes',
            ownerId: input.sessionId,
            assetId: `${Date.now()}-${randomUUID()}`,
          }),
        })),
      )
      await this.recordLocalEvent(input.sessionId, 'message.user', {
        message_id: `local-messaging-user-${Date.now()}`,
        text: input.text.trim(),
        attachments,
        local_command: true,
      })
      let text = ''
      try {
        const result = await sendHermesMessage({
          ...attachmentMessagingCommand,
          mediaPaths: attachments.map((attachment) => attachment.path),
        })
        text = `Media sent successfully through ${result.platform}. Message ID: ${result.messageId || 'unavailable'}`
      } catch (error) {
        text = String((error as Error)?.message || error || 'Hermes media delivery failed.')
      }
      await this.recordLocalEvent(input.sessionId, 'message.complete', {
        message_id: `local-messaging-assistant-${Date.now()}`,
        text,
        local_command: true,
      })
      return { local: true, command: 'messaging.send_media' }
    }

    const messagingCommand = parseHermesMessagingSend(input.text)
    if (messagingCommand && !(input.attachments?.length)) {
      await this.recordLocalEvent(input.sessionId, 'message.user', {
        message_id: `local-messaging-user-${Date.now()}`,
        text: input.text.trim(),
        local_command: true,
      })
      let text = ''
      try {
        const result = await sendHermesMessage(messagingCommand)
        text = `Message sent successfully through ${result.platform}. Message ID: ${result.messageId || 'unavailable'}`
      } catch (error) {
        text = String((error as Error)?.message || error || 'Hermes message delivery failed.')
      }
      await this.recordLocalEvent(input.sessionId, 'message.complete', {
        message_id: `local-messaging-assistant-${Date.now()}`,
        text,
        local_command: true,
      })
      return { local: true, command: 'messaging.send' }
    }

    const pairingCommand = parseHermesPairingCommand(input.text)
    if (pairingCommand && !(input.attachments?.length)) {
      await this.recordLocalEvent(input.sessionId, 'message.user', {
        message_id: `local-pairing-user-${Date.now()}`,
        text: input.text.trim(),
        local_command: true,
      })
      let text = ''
      try {
        const result = pairingCommand.action === 'list'
          ? await listHermesPairings()
          : await approveHermesPairing(pairingCommand)
        text = result.message
      } catch (error) {
        text = String((error as Error)?.message || error || 'Hermes pairing command failed.')
      }
      await this.recordLocalEvent(input.sessionId, 'message.complete', {
        message_id: `local-pairing-assistant-${Date.now()}`,
        text,
        local_command: true,
      })
      return { local: true, command: `pairing.${pairingCommand.action}` }
    }

    const client = await this.client()
    await this.refreshApplicationModelBridgeSession(client, input.sessionId)
    const request: HermesRequest = async (method, params) => await client.request(method, params)
    const staged = await stageHermesPromptAttachments(input, request)
    if (!staged.text) throw new Error('Message text or an attachment is required.')
    try {
      const params = {
        session_id: input.sessionId,
        text: staged.text,
        ...(Number.isInteger(input.regenerateUserOrdinal) ? { truncate_before_user_ordinal: input.regenerateUserOrdinal } : {}),
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return asRecord(await request('prompt.submit', params))
        } catch (error) {
          if (!isSessionBusyError(error) || attempt === 2) throw error
          await wait(200 * (attempt + 1))
        }
      }
      throw new Error('Hermes could not accept the prompt.')
    } catch (error) {
      await detachImages(request, input.sessionId, staged.attachedImagePaths)
      throw error
    }
  }

  async interruptSession(sessionId: string) {
    const result = await this.sessionRequest('session.interrupt', sessionId)
    await this.recordLocalEvent(sessionId, 'session.interrupted')
    return result
  }

  async steerSession(sessionId: string, text: string) {
    const client = await this.client()
    return asRecord(await client.request('session.steer', { session_id: sessionId, text }))
  }

  async respondClarification(sessionId: string, requestId: string, answer: string) {
    const result = await this.responseRequest('clarify.respond', sessionId, requestId, { answer })
    await this.recordLocalEvent(sessionId, 'input.resolved', { kind: 'clarification', request_id: requestId })
    return result
  }

  async respondApproval(sessionId: string, choice: string, all = false) {
    const client = await this.client()
    const result = asRecord(await client.request('approval.respond', { session_id: sessionId, choice, all }))
    await this.recordLocalEvent(sessionId, 'input.resolved', { kind: 'approval', choice: String(choice || '') })
    return result
  }

  async respondSudo(sessionId: string, requestId: string, password: string) {
    const result = await this.responseRequest('sudo.respond', sessionId, requestId, { password })
    await this.recordLocalEvent(sessionId, 'input.resolved', { kind: 'sudo', request_id: requestId })
    return result
  }

  async respondSecret(sessionId: string, requestId: string, value: string) {
    const result = await this.responseRequest('secret.respond', sessionId, requestId, { value })
    await this.recordLocalEvent(sessionId, 'input.resolved', { kind: 'secret', request_id: requestId })
    return result
  }

  async getDelegationStatus() {
    const client = await this.client()
    return asRecord(await client.request('delegation.status', {}))
  }

  async setDelegationPaused(paused: boolean) {
    const client = await this.client()
    return asRecord(await client.request('delegation.pause', { paused: Boolean(paused) }))
  }

  async interruptSubagent(subagentId: string) {
    const id = String(subagentId || '').trim()
    if (!id) throw new Error('Subagent id is required.')
    const client = await this.client()
    return asRecord(await client.request('subagent.interrupt', { subagent_id: id }))
  }

  async listBackgroundProcesses(sessionId: string) {
    const id = String(sessionId || '').trim()
    if (!id) return { processes: [] }
    const client = await this.client()
    return asRecord(await client.request('process.list', { session_id: id }))
  }

  async stopBackgroundProcess(sessionId: string, processId: string) {
    const sid = String(sessionId || '').trim()
    const pid = String(processId || '').trim()
    if (!sid) throw new Error('Session id is required.')
    if (!pid) throw new Error('Process id is required.')
    const client = await this.client()
    return asRecord(await client.request('process.kill', { session_id: sid, process_id: pid }))
  }

  async manageBrowser(input: { action: 'status' | 'connect' | 'disconnect'; sessionId?: string; url?: string }) {
    const action = input?.action
    if (!['status', 'connect', 'disconnect'].includes(action)) throw new Error('Unknown browser action.')
    const client = await this.client()
    return asRecord(await client.request('browser.manage', {
      action,
      ...(input.sessionId ? { session_id: String(input.sessionId) } : {}),
      ...(action === 'connect' && input.url ? { url: String(input.url) } : {}),
    }))
  }

  async listEvents(afterSequence = 0) {
    return await hermesEventStore.list(afterSequence)
  }

  async listSessionEvents(input: { sessionId?: string; storedSessionId?: string; limit?: number }) {
    return await hermesEventStore.listSession(input)
  }

  async listPendingInputs() {
    return await hermesEventStore.listPendingInputs()
  }

  subscribe(listener: (events: HermesGatewayEvent[]) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async client() {
    await hermesRuntime.ensureReady()
    return hermesRuntime.gateway
  }

  private async sessionRequest(method: string, sessionId: string) {
    const client = await this.client()
    return asRecord(await client.request(method, { session_id: sessionId }))
  }

  private async responseRequest(method: string, sessionId: string, requestId: string, payload: Record<string, unknown>) {
    const client = await this.client()
    return asRecord(await client.request(method, { session_id: sessionId, request_id: requestId, ...payload }))
  }

  private findString(value: unknown, keys: string[]): string {
    if (!value || typeof value !== 'object') return ''
    const row = value as Record<string, unknown>
    for (const key of keys) {
      if (typeof row[key] === 'string' && row[key].trim()) return row[key].trim()
    }
    for (const child of Object.values(row)) {
      const nested = this.findString(child, keys)
      if (nested) return nested
    }
    return ''
  }

  private async waitForRemoteOutcome(sessionId: string, timeoutMs: number) {
    return await new Promise<HermesGatewayEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('Hermes remote response timed out.'))
      }, timeoutMs)
      const unsubscribe = this.subscribe((events) => {
        const event = events.find((item) =>
          item.sessionId === sessionId &&
          ['message.complete', 'clarify.request', 'error'].includes(item.type),
        )
        if (!event) return
        clearTimeout(timer)
        unsubscribe()
        resolve(event)
      })
    })
  }

  private async waitForSessionOutcome(sessionId: string, timeoutMs: number) {
    return await new Promise<HermesGatewayEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('Hermes model connection timed out.'))
      }, timeoutMs)
      const unsubscribe = this.subscribe((events) => {
        const event = events.find((item) => item.sessionId === sessionId && ['message.complete', 'error'].includes(item.type))
        if (!event) return
        clearTimeout(timer)
        unsubscribe()
        resolve(event)
      })
    })
  }
}

export const hermesAgentService = new HermesAgentService()
