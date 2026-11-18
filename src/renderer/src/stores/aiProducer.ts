import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type AiAttachment = { id: string; name: string; path: string; mediaType: 'image' | 'video' | 'file' }

export type AiMessage = {
  id: string
  conversationId: string
  runId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments: AiAttachment[]
  artifactIds?: string[]
  /** Set on canned server replies; the renderer localizes it via `agentOs.reply.<code>`. */
  responseCode?: string
  responseParams?: Record<string, unknown>
  createdAt: number
}

export type AiStep = {
  id: string
  runId: string
  order: number
  title: string
  intentType: string
  status: string
  error?: string
  input?: Record<string, unknown>
  startedAt?: number
  completedAt?: number
}

export type AiRun = {
  id: string
  shortId: string
  conversationId: string
  status: string
  activeRevision: number
  revisions: Array<{ version: number; summary: string; hash: string; requestSnapshot: string }>
  artifactIds: string[]
  warningCount: number
  error?: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
}

export type AiArtifact = {
  id: string
  kind: string
  name: string
  uri: string
  localPath?: string
  mimeType?: string
  metadata: Record<string, unknown>
  producerRunId: string
  createdAt: number
}

export type AiEstimate = { modelCalls: number; accountCredits: number; minutes: number; notes: string[]; dangerousSteps: string[] }

export type AiRunDetail = { run: AiRun; steps: AiStep[]; artifacts: AiArtifact[]; estimate?: AiEstimate }

export type AiConversation = { id: string; title: string; updatedAt: number; context: Record<string, unknown> }

export type AiPlanOverride = { intents: string[]; summary?: string }

export type AiOpenOptions = {
  prompt?: string
  context?: Record<string, unknown>
  attachments?: AiAttachment[]
  plan?: AiPlanOverride
  /** Send immediately instead of prefilling the composer. */
  send?: boolean
  /** Start a fresh conversation. */
  fresh?: boolean
  recipeId?: string
}

const ACTIVE = new Set(['planning', 'waiting_approval', 'running', 'paused', 'reviewing'])

function mediaTypeOf(path: string): AiAttachment['mediaType'] {
  if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(path)) return 'image'
  if (/\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(path)) return 'video'
  return 'file'
}

export function attachmentFromPath(path: string): AiAttachment {
  const name = path.split(/[\\/]/).pop() || path
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, path, mediaType: mediaTypeOf(path) }
}

export const useAiProducerStore = defineStore('aiProducer', () => {
  const panelOpen = ref(false)
  const commandOpen = ref(false)
  const conversations = ref<AiConversation[]>([])
  const conversationId = ref('')
  const messages = ref<AiMessage[]>([])
  const runs = ref<Record<string, AiRunDetail>>({})
  const trayRunIds = ref<string[]>([])
  const draft = ref('')
  const draftAttachments = ref<AiAttachment[]>([])
  const draftContext = ref<Record<string, unknown>>({})
  const sending = ref(false)
  const error = ref('')
  const pendingReviews = ref(0)
  const recipeId = ref('')
  const notices = ref<Array<{ id: string; text: string; tone: 'success' | 'error' | 'info'; route?: string }>>([])
  let initialized = false
  let unsubscribeAgent: (() => void) | null = null
  let unsubscribeHub: (() => void) | null = null
  const refreshTimers = new Map<string, number>()

  const conversationRuns = computed(() =>
    Object.values(runs.value)
      .filter((detail) => detail.run.conversationId === conversationId.value)
      .sort((a, b) => a.run.createdAt - b.run.createdAt),
  )

  const trayRuns = computed(() =>
    trayRunIds.value
      .map((id) => runs.value[id])
      .filter((detail): detail is AiRunDetail => Boolean(detail))
      .sort((a, b) => b.run.updatedAt - a.run.updatedAt),
  )

  const activeTrayRuns = computed(() => trayRuns.value.filter((detail) => ACTIVE.has(detail.run.status)))
  const waitingCount = computed(() => trayRuns.value.filter((detail) => detail.run.status === 'waiting_approval' || detail.steps.some((step) => step.error === 'awaiting_confirmation')).length)

  function pushNotice(text: string, tone: 'success' | 'error' | 'info' = 'info', route?: string) {
    const id = `${Date.now()}-${Math.random()}`
    notices.value = [...notices.value.slice(-3), { id, text, tone, route }]
    window.setTimeout(() => {
      notices.value = notices.value.filter((item) => item.id !== id)
    }, 6000)
  }

  async function loadRun(runId: string) {
    try {
      const detail = (await window.api.agentOs.getRun(runId)) as AiRunDetail
      let estimate = runs.value[runId]?.estimate
      if (!estimate || detail.run.status === 'waiting_approval') {
        estimate = (await window.api.agentOs.estimateRun(runId).catch(() => undefined)) as AiEstimate | undefined
      }
      runs.value = { ...runs.value, [runId]: { run: detail.run, steps: detail.steps, artifacts: detail.artifacts, estimate } }
      if (!trayRunIds.value.includes(runId)) trayRunIds.value = [runId, ...trayRunIds.value].slice(0, 30)
      return runs.value[runId]
    } catch {
      return null
    }
  }

  function scheduleRunRefresh(runId: string) {
    const existing = refreshTimers.get(runId)
    if (existing) window.clearTimeout(existing)
    refreshTimers.set(runId, window.setTimeout(() => {
      refreshTimers.delete(runId)
      void loadRun(runId)
    }, 250))
  }

  async function loadConversation(id: string) {
    const detail = (await window.api.agentOs.getConversation(id)) as {
      conversation: AiConversation
      messages: AiMessage[]
      runs: AiRun[]
    }
    conversationId.value = id
    messages.value = detail.messages
    await Promise.all(detail.runs.map((run) => loadRun(run.id)))
  }

  async function loadConversations() {
    conversations.value = ((await window.api.agentOs.listConversations(30)) as AiConversation[]) || []
  }

  async function refreshCounts() {
    try {
      const counts = (await window.api.contentHub.reviewCounts()) as { pending: number }
      pendingReviews.value = counts.pending
    } catch {
      pendingReviews.value = 0
    }
  }

  async function init() {
    if (initialized) return
    initialized = true
    await Promise.all([loadConversations().catch(() => undefined), refreshCounts()])
    // Prime the tray with runs of the most recent conversations.
    const recent = conversations.value.slice(0, 8)
    await Promise.all(recent.map(async (conversation) => {
      try {
        const detail = (await window.api.agentOs.getConversation(conversation.id)) as { runs: AiRun[] }
        await Promise.all(detail.runs.slice(0, 4).map((run) => loadRun(run.id)))
      } catch {
        // ignore unavailable conversations
      }
    }))
    unsubscribeAgent = window.api.agentOs.subscribeEvents(0, (events: any[]) => {
      const touchedConversation = new Set<string>()
      for (const event of events) {
        if (event.runId) scheduleRunRefresh(event.runId)
        if (event.conversationId) touchedConversation.add(event.conversationId)
        if (event.type === 'agent.run.completed') pushNotice('ai.notice.runCompleted', 'success', '/inbox')
        if (event.type === 'agent.run.failed') pushNotice('ai.notice.runFailed', 'error')
        if (event.type === 'agent.step.awaiting_confirmation') pushNotice('ai.notice.awaitingConfirmation', 'info')
      }
      if (conversationId.value && touchedConversation.has(conversationId.value) && !sending.value) {
        void window.api.agentOs.getConversation(conversationId.value).then((detail: any) => {
          messages.value = detail.messages
        }).catch(() => undefined)
      }
    })
    unsubscribeHub = window.api.contentHub.onChanged((payload) => {
      if (payload.counts) pendingReviews.value = payload.counts.pending
      else void refreshCounts()
    })
  }

  function dispose() {
    unsubscribeAgent?.()
    unsubscribeHub?.()
    initialized = false
  }

  async function newConversation(context?: Record<string, unknown>) {
    const conversation = (await window.api.agentOs.createConversation({ title: '', context: context || {} })) as AiConversation
    conversations.value = [conversation, ...conversations.value]
    conversationId.value = conversation.id
    messages.value = []
    return conversation
  }

  async function ensureConversation() {
    if (conversationId.value) return conversationId.value
    const conversation = await newConversation()
    return conversation.id
  }

  async function open(options: AiOpenOptions = {}) {
    panelOpen.value = true
    commandOpen.value = false
    error.value = ''
    await init()
    if (options.fresh) await newConversation()
    if (options.prompt !== undefined) draft.value = options.prompt
    if (options.attachments) draftAttachments.value = options.attachments
    if (options.context) draftContext.value = { ...options.context }
    recipeId.value = options.recipeId || ''
    if (options.send && (options.prompt || options.plan)) {
      await send({ content: options.prompt || options.plan?.summary || '', context: options.context, plan: options.plan, attachments: options.attachments })
    }
  }

  function close() {
    panelOpen.value = false
  }

  async function send(input?: { content?: string; context?: Record<string, unknown>; plan?: AiPlanOverride; attachments?: AiAttachment[] }) {
    const content = (input?.content ?? draft.value).trim()
    if (!content || sending.value) return null
    sending.value = true
    error.value = ''
    const attachments = input?.attachments ?? draftAttachments.value
    // Recipe forms hand over reactive arrays (e.g. selected product ids); IPC can only clone plain data.
    const context = JSON.parse(JSON.stringify({ ...draftContext.value, ...(input?.context || {}) })) as Record<string, unknown>
    const plan = input?.plan ? (JSON.parse(JSON.stringify(input.plan)) as AiPlanOverride) : undefined
    try {
      const id = await ensureConversation()
      const optimistic: AiMessage = { id: `local-${Date.now()}`, conversationId: id, role: 'user', content, attachments, createdAt: Date.now() }
      messages.value = [...messages.value, optimistic]
      draft.value = ''
      draftAttachments.value = []
      const result = (await window.api.agentOs.sendMessage({
        conversationId: id,
        content,
        attachments: attachments.map(({ id: attachmentId, name, path, mediaType }) => ({ id: attachmentId, name, path, mediaType })),
        context,
        ...(plan ? { plan } : {}),
      })) as { run: AiRun | null }
      await loadConversation(id)
      if (result.run) await loadRun(result.run.id)
      draftContext.value = {}
      void loadConversations()
      return result
    } catch (cause) {
      error.value = String((cause as Error)?.message || cause)
      messages.value = messages.value.filter((message) => !message.id.startsWith('local-'))
      draft.value = content
      return null
    } finally {
      sending.value = false
    }
  }

  async function approve(runId: string) {
    const detail = runs.value[runId]
    if (!detail) return
    const revision = detail.run.revisions.find((item) => item.version === detail.run.activeRevision)
    if (!revision) return
    await window.api.agentOs.approveRun({ runId, revision: revision.version, planHash: revision.hash })
    await loadRun(runId)
  }

  async function reject(runId: string) {
    const detail = runs.value[runId]
    if (!detail) return
    const revision = detail.run.revisions.find((item) => item.version === detail.run.activeRevision)
    if (!revision) return
    await window.api.agentOs.rejectRun({ runId, revision: revision.version, planHash: revision.hash })
    await loadRun(runId)
  }

  async function control(runId: string, action: 'pause' | 'resume' | 'cancel') {
    try {
      if (action === 'pause') await window.api.agentOs.pauseRun(runId)
      if (action === 'resume') await window.api.agentOs.resumeRun(runId)
      if (action === 'cancel') await window.api.agentOs.cancelRun(runId)
    } catch (cause) {
      pushNotice(String((cause as Error)?.message || cause), 'error')
    }
    await loadRun(runId)
  }

  async function confirmStep(runId: string, stepId: string) {
    try {
      await window.api.agentOs.confirmStep({ runId, stepId })
    } catch (cause) {
      pushNotice(String((cause as Error)?.message || cause), 'error')
    }
    await loadRun(runId)
  }

  async function openArtifact(id: string) {
    try {
      await window.api.agentOs.openArtifact(id)
    } catch (cause) {
      pushNotice(String((cause as Error)?.message || cause), 'error')
    }
  }

  async function selectConversation(id: string) {
    await loadConversation(id)
  }

  return {
    panelOpen,
    commandOpen,
    conversations,
    conversationId,
    messages,
    runs,
    draft,
    draftAttachments,
    draftContext,
    sending,
    error,
    pendingReviews,
    recipeId,
    notices,
    conversationRuns,
    trayRuns,
    activeTrayRuns,
    waitingCount,
    init,
    dispose,
    open,
    close,
    send,
    approve,
    reject,
    control,
    confirmStep,
    openArtifact,
    loadRun,
    newConversation,
    selectConversation,
    loadConversations,
    refreshCounts,
    pushNotice,
  }
})
