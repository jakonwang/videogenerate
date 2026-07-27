<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  Archive,
  Bot,
  Boxes,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Command,
  Copy,
  CornerDownRight,
  DatabaseBackup,
  Download,
  Eye,
  FileImage,
  FileText,
  FolderOpen,
  GitFork,
  History,
  KeyRound,
  ListPlus,
  LoaderCircle,
  MessageSquarePlus,
  MoreVertical,
  Paperclip,
  Palette,
  PanelRightOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  PlugZap,
  Puzzle,
  RefreshCw,
  Radio,
  Rocket,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings2,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  Unplug,
  UserRoundCog,
  Video,
  Wrench,
  X,
} from 'lucide-vue-next'
import HermesMessageContent from '../components/HermesMessageContent.vue'
import { HERMES_WORKSPACES } from '../../../../shared/hermesWorkspace'
import {
  HERMES_BUSINESS_ACTIONS,
  HERMES_BUSINESS_CATEGORIES,
  type HermesBusinessCategory,
} from '../../../../shared/hermesBusinessActions'

type RuntimeStatus = {
  state: 'stopped' | 'starting' | 'ready' | 'error'
  version?: string
  profile: string
  error?: string
  logs: string[]
}

type Employee = {
  id: string
  name: string
  description: string
  enabled: boolean
  builtIn: boolean
  color: string
  allowedIntents: string[]
  plannerPolicy: string
  reviewerPolicy: string
  defaultContext: Record<string, unknown>
}

type SessionSummary = {
  id: string
  title: string
  preview: string
  startedAt: number
  messageCount: number
  source: string
}

type SessionDialogMode = 'rename' | 'delete'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
  promptText?: string
  reasoning?: string
  attachments?: Attachment[]
  createdAt: number
}

type Attachment = {
  id: string
  name: string
  path: string
  mediaType: 'image' | 'video' | 'file'
  size: number
}

type QueuedPrompt = {
  id: string
  sessionId: string
  text: string
  attachments: Attachment[]
  createdAt: number
}

type MessageEdit = {
  messageId: string
  messageIndex: number
  userOrdinal: number
}

type HermesSkill = {
  name: string
  description?: string
  enabled?: boolean
  category?: string
}

type CommandItem = {
  id: string
  group: 'workflow' | 'business' | 'management' | 'skill' | 'workspace'
  businessCategory?: HermesBusinessCategory
  label: string
  description: string
  prompt?: string
  workspaceId?: string
  settingsSection?: string
  icon: unknown
}

type CommandScope = 'recommended' | 'business' | 'skill' | 'workspace' | 'management'

type GatewayEvent = {
  sequence: number
  type: string
  sessionId?: string
  storedSessionId?: string
  payload: Record<string, unknown>
  createdAt: number
}

type PendingInput = {
  kind: PendingPrompt['kind']
  requestId?: string
  sessionId?: string
  storedSessionId?: string
  payload: Record<string, unknown>
  createdAt: number
}

type ActivityCard = {
  id: string
  kind: 'tool' | 'subagent' | 'background' | 'browser' | 'status'
  eventType: string
  title: string
  detail: string
  status: 'running' | 'completed' | 'failed'
  createdAt: number
  depth: number
  subagentId?: string
  processId?: string
  durationSeconds?: number
  sections: Array<{ id: string; label: string; text: string }>
}

type DelegationStatus = {
  active: Array<Record<string, unknown>>
  paused: boolean
  maxSpawnDepth: number
  maxConcurrentChildren: number
}

type BackgroundProcess = {
  session_id?: string
  command?: string
  status?: string
  exit_code?: number
  output_tail?: string
  started_at?: number
}

type BrowserStatus = {
  connected: boolean
  url: string
  messages: string[]
}

type PendingPrompt = {
  kind: 'approval' | 'clarification' | 'secret' | 'sudo'
  requestId?: string
  title: string
  detail: string
  choices?: string[]
}

type RunDetail = {
  run: {
    id: string
    shortId: string
    status: string
    activeRevision: number
    revisions: Array<{ version: number; summary: string; hash: string }>
    error?: string
    startedAt?: number
    completedAt?: number
  }
  steps: Array<{
    id: string
    title: string
    status: string
    employeeId: string
    repairCount: number
    error?: string
    startedAt?: number
    completedAt?: number
  }>
  attempts: Array<{
    id: string
    stepId: string
    sequence: number
    capabilityId: string
    capabilityVersion: number
    status: 'running' | 'completed' | 'failed'
    result?: {
      success: boolean
      status: 'completed' | 'accepted' | 'partial' | 'failed'
      artifactIds: string[]
      warnings: string[]
      cost: Record<string, unknown>
      retryable: boolean
      externalRefs: Record<string, string>
      error?: { code: string; message: string }
    }
    createdAt: number
    completedAt?: number
  }>
  artifacts: Array<{
    id: string
    kind: string
    name: string
    localPath?: string
    uri?: string
    media?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }>
  approvals: Array<{
    id: string
    revision: number
    status: 'approved' | 'rejected'
    channel: 'desktop' | 'feishu'
    approverId: string
    createdAt: number
  }>
  recovery: {
    action: 'none' | 'resume' | 'reconcile' | 'diagnose'
    canResume: boolean
    blockedStepIds: string[]
    unresolvedAttemptIds: string[]
    retryable?: boolean
    reason: string
  }
  events: Array<{ id: string; sequence: number; type: string; stepId?: string; payload: Record<string, unknown>; createdAt: number }>
}

type ConversationRunSummary = {
  id: string
  shortId: string
  status: string
  activeRevision: number
  revisions: Array<{ version: number; summary: string; hash: string }>
  artifactIds: string[]
  warningCount: number
  error?: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
}

type RunStatusFilter = 'all' | 'active' | 'completed' | 'failed'

type EmployeeDraft = {
  id?: string
  sourceEmployeeId: string
  name: string
  description: string
  plannerPolicy: string
  reviewerPolicy: string
  color: string
}

type ModelProvider = {
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

type ModelOptions = {
  provider: string
  model: string
  providers: ModelProvider[]
  custom: { model: string; baseUrl: string; apiKeyConfigured: boolean }
}

const { t } = useI18n()
const runtime = ref<RuntimeStatus>({ state: 'stopped', profile: 'videogenerate', logs: [] })
const employees = ref<Employee[]>([])
const sessions = ref<SessionSummary[]>([])
const sessionQuery = ref('')
const selectedEmployeeId = ref('employee.supervisor')
const selectedStoredSessionId = ref('')
const activeSessionId = ref('')
const switchingSessionId = ref('')
const conversationId = ref('')
const sessionTitle = ref('')
const sessionMenuId = ref('')
const sessionDialogMode = ref<SessionDialogMode | null>(null)
const sessionDialogTarget = ref<SessionSummary | null>(null)
const sessionTitleDraft = ref('')
const sessionActionBusy = ref(false)
const messages = ref<ChatMessage[]>([])
const activities = ref<GatewayEvent[]>([])
const delegationStatus = ref<DelegationStatus>({ active: [], paused: false, maxSpawnDepth: 0, maxConcurrentChildren: 0 })
const interruptingSubagentId = ref('')
const delegationControlBusy = ref(false)
const backgroundProcesses = ref<BackgroundProcess[]>([])
const stoppingProcessId = ref('')
const browserStatus = ref<BrowserStatus>({ connected: false, url: '', messages: [] })
const browserBusy = ref(false)
const activityRailOpen = ref(false)
const commandCenterOpen = ref(false)
const commandQuery = ref('')
const commandSelection = ref(0)
const commandScope = ref<CommandScope>('recommended')
const commandSkills = ref<HermesSkill[]>([])
const commandSkillsLoading = ref(false)
const prompt = ref('')
const attachments = ref<Attachment[]>([])
const messageEdit = ref<MessageEdit | null>(null)
const queuedPrompts = ref<QueuedPrompt[]>([])
const isDraggingFiles = ref(false)
const streamingText = ref('')
const streamingReasoning = ref('')
const isStreaming = ref(false)
const loading = ref(true)
const actionBusy = ref(false)
const uiError = ref('')
const pendingPrompt = ref<PendingPrompt | null>(null)
const pendingAnswer = ref('')
const pendingSessionIds = ref(new Set<string>())
const runDetail = ref<RunDetail | null>(null)
const conversationRuns = ref<ConversationRunSummary[]>([])
const selectedRunId = ref('')
const runHistoryOpen = ref(false)
const runStatusFilter = ref<RunStatusFilter>('all')
const runSelectionPinned = ref(false)
const showAllRunEvents = ref(false)
const expandedRunStepIds = ref<Set<string>>(new Set())
const selectedArtifact = ref<RunDetail['artifacts'][number] | null>(null)
const artifactActionBusy = ref(false)
const employeeDraft = ref<EmployeeDraft | null>(null)
const modelOverride = ref('')
const modelOptions = ref<ModelOptions | null>(null)
const sessionMessageCache = new Map<string, ChatMessage[]>()
let sessionSwitchSequence = 0
const modelPanelOpen = ref(false)
const modelProvider = ref('')
const modelName = ref('')
const modelApiKey = ref('')
const customBaseUrl = ref('')
const modelBusy = ref(false)
const modelTesting = ref(false)
const copiedMessageId = ref('')
const copiedActivitySectionId = ref('')
const expandedActivityIds = ref<Set<string>>(new Set())
const modelError = ref('')
const modelSuccess = ref('')
const messageList = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)
const commandSearch = ref<HTMLInputElement | null>(null)
const commandCenter = ref<HTMLElement | null>(null)
let unsubscribeHermesEvents: (() => void) | undefined
let unsubscribeRuntime: (() => void) | undefined
let unsubscribeAgentEvents: (() => void) | undefined
let lastHermesSequence = 0
let lastAgentSequence = 0
let dragDepth = 0
let restoringStoredSessionId = ''

const ACTIVE_SESSION_STORAGE_KEY = 'videogenerate.hermes.activeSessionId'
const MAX_ATTACHMENTS = 20
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024 * 1024
const MAX_STAGED_ATTACHMENT_BYTES = 64 * 1024 * 1024
const runStatusFilters: RunStatusFilter[] = ['all', 'active', 'completed', 'failed']

const currentEmployee = computed(() => employees.value.find((item) => item.id === selectedEmployeeId.value) || employees.value[0])
const activeEmployees = computed(() => employees.value.filter((item) => item.enabled))
const hasSession = computed(() => Boolean(activeSessionId.value))
const hasConversationActivity = computed(() => messages.value.length > 0 || isStreaming.value)
const canSend = computed(() => runtime.value.state === 'ready'
  && Boolean(prompt.value.trim() || attachments.value.length)
  && !actionBusy.value
  && !(messageEdit.value && isStreaming.value))
const currentRevision = computed(() => runDetail.value?.run.revisions.find((item) => item.version === runDetail.value?.run.activeRevision))
const activeRunStatuses = new Set(['draft', 'planning', 'waiting_approval', 'running', 'paused', 'reviewing'])
const filteredConversationRuns = computed(() => conversationRuns.value.filter((run) => {
  if (runStatusFilter.value === 'all') return true
  if (runStatusFilter.value === 'active') return activeRunStatuses.has(run.status)
  if (runStatusFilter.value === 'completed') return run.status === 'completed'
  return run.status === 'failed' || run.status === 'cancelled'
}))
const activeRunCount = computed(() => conversationRuns.value.filter((run) => activeRunStatuses.has(run.status)).length)
const visibleRunEvents = computed(() => {
  const events = runDetail.value?.events || []
  return showAllRunEvents.value ? events : events.slice(-8)
})
const runWarningCount = computed(() => runDetail.value?.attempts.reduce((count, attempt) => count + (attempt.result?.warnings.length || 0), 0) || 0)
const runCostEntries = computed(() => {
  const totals = new Map<string, number>()
  for (const attempt of runDetail.value?.attempts || []) {
    for (const [key, value] of Object.entries(attempt.result?.cost || {})) {
      const amount = Number(value)
      if (!Number.isFinite(amount)) continue
      totals.set(key, (totals.get(key) || 0) + amount)
    }
  }
  return Array.from(totals, ([key, value]) => ({ key, value }))
})
const activityCards = computed<ActivityCard[]>(() => {
  const cards = new Map<string, ActivityCard>()
  for (const item of delegationStatus.value.active) {
    const subagentId = String(item.subagent_id || item.id || '')
    if (!subagentId) continue
    cards.set(`subagent:${subagentId}`, {
      id: `subagent:${subagentId}`,
      kind: 'subagent',
      eventType: 'subagent.start',
      title: String(item.goal || item.name || t('agentOs.hermes.subagent')),
      detail: String(item.model || item.status || ''),
      status: 'running',
      createdAt: Number(item.started_at || Date.now()),
      depth: Number(item.depth || 0),
      subagentId,
      sections: [],
    })
  }
  for (const process of backgroundProcesses.value) {
    const processId = String(process.session_id || '')
    if (!processId) continue
    const exited = process.status === 'exited'
    const failed = exited && Number(process.exit_code || 0) !== 0
    const command = String(process.command || '').split(/\r?\n/, 1)[0].trim()
    const output = safeHermesText(String(process.output_tail || '')).trim()
    cards.set(`background:${processId}`, {
      id: `background:${processId}`,
      kind: 'background',
      eventType: exited ? 'background.complete' : 'background.running',
      title: command || t('agentOs.hermesUx.backgroundTask'),
      detail: exited
        ? t(failed ? 'agentOs.hermesUx.backgroundFailed' : 'agentOs.hermesUx.backgroundCompleted')
        : t('agentOs.hermesUx.backgroundRunning'),
      status: failed ? 'failed' : exited ? 'completed' : 'running',
      createdAt: timestampMs(process.started_at),
      depth: 0,
      processId,
      sections: output ? [{ id: 'output', label: t('agentOs.hermesActivityActions.output'), text: output }] : [],
    })
  }
  for (const event of activities.value) {
    const payload = event.payload
    const kind: ActivityCard['kind'] = event.type.startsWith('tool.')
      ? 'tool'
      : event.type.startsWith('subagent.')
        ? 'subagent'
        : event.type.startsWith('background.')
          ? 'background'
          : event.type.startsWith('browser.')
            ? 'browser'
            : 'status'
    const stableId = kind === 'tool'
      ? String(payload.tool_id || event.sequence)
      : kind === 'subagent'
        ? String(payload.subagent_id || event.sequence)
      : kind === 'background'
          ? String(payload.task_id || event.sequence)
          : kind === 'browser'
            ? String(payload.browser_id || event.sessionId || activeSessionId.value || 'runtime')
            : String(event.sequence)
    const key = `${kind}:${stableId}`
    const previous = cards.get(key)
    const complete = event.type.endsWith('.complete')
    const rawResult = payload.result && typeof payload.result === 'object' ? payload.result as Record<string, unknown> : {}
    const failed = (complete || kind === 'browser') && (
      rawResult.success === false
      || rawResult.status === 'failed'
      || payload.level === 'error'
      || Boolean(payload.error)
      || /(?:^|\b)(?:error|failed)(?:\b|:)/i.test(String(payload.summary || payload.text || payload.message || ''))
    )
    const title = kind === 'tool'
      ? friendlyToolName(String(payload.name || payload.tool_name || previous?.title || ''))
      : kind === 'subagent'
        ? String(payload.goal || previous?.title || t('agentOs.hermes.subagent'))
        : kind === 'background'
          ? t('agentOs.hermesUx.backgroundTask')
          : kind === 'browser'
            ? t('agentOs.hermesUx.browserActivity')
            : t('agentOs.hermes.statusUpdate')
    const rawDetail = String(payload.summary || payload.context || payload.message || payload.text || payload.tool_preview || previous?.detail || '')
    const detail = compactActivityText(rawDetail)
    const sections = activitySections(payload, kind, previous?.sections || [])
    cards.set(key, {
      id: key,
      kind,
      eventType: event.type,
      title,
      detail,
      status: failed
        ? 'failed'
        : complete || (kind === 'browser' && !browserBusy.value)
          ? 'completed'
          : previous?.status || 'running',
      createdAt: event.createdAt,
      depth: Number(payload.depth ?? previous?.depth ?? 0),
      subagentId: kind === 'subagent' ? stableId : undefined,
      durationSeconds: Number(payload.duration_s ?? payload.duration_seconds ?? previous?.durationSeconds ?? 0) || undefined,
      sections,
    })
  }
  return Array.from(cards.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
})
const filteredSessions = computed(() => {
  const query = sessionQuery.value.trim().toLocaleLowerCase()
  if (!query) return sessions.value
  return sessions.value.filter((item) => `${item.title}\n${item.preview}`.toLocaleLowerCase().includes(query))
})
const activeQueuedPrompts = computed(() => queuedPrompts.value.filter((item) => item.sessionId === activeSessionId.value))
const modelProviders = computed<ModelProvider[]>(() => {
  const providers = [...(modelOptions.value?.providers || [])]
  if (!providers.some((item) => item.slug === 'custom')) {
    providers.unshift({
      slug: 'custom',
      name: t('agentOs.hermes.modelSettings.customProvider'),
      authenticated: Boolean(modelOptions.value?.custom.apiKeyConfigured),
      authType: 'api_key',
      isCurrent: modelOptions.value?.provider === 'custom',
      isUserDefined: true,
      models: modelOptions.value?.custom.model ? [modelOptions.value.custom.model] : [],
    })
  }
  return providers
})
const selectedModelProvider = computed(() => modelProviders.value.find((item) => item.slug === modelProvider.value))
const currentModelLabel = computed(() => modelOptions.value?.model || t('agentOs.hermes.defaultModel'))
const hasModelAuthenticationIssue = computed(() => uiError.value === t('agentOs.hermes.modelAuthenticationRequired'))
const starterCommands = computed(() => [
  { id: 'video', label: t('agentOs.shortcuts.video'), prompt: t('agentOs.shortcuts.videoPrompt'), icon: Video },
  { id: 'material', label: t('agentOs.shortcuts.material'), prompt: t('agentOs.shortcuts.materialPrompt'), icon: FolderOpen },
  { id: 'publish', label: t('agentOs.shortcuts.publish'), prompt: t('agentOs.shortcuts.publishPrompt'), icon: Rocket },
])
const workflowCommands = computed<CommandItem[]>(() => [
  { id: 'workflow.video', group: 'workflow', label: t('agentOs.commandCenter.commands.video'), description: t('agentOs.commandCenter.descriptions.video'), prompt: t('agentOs.shortcuts.videoPrompt'), icon: Video },
  { id: 'workflow.material', group: 'workflow', label: t('agentOs.commandCenter.commands.material'), description: t('agentOs.commandCenter.descriptions.material'), prompt: t('agentOs.shortcuts.materialPrompt'), icon: FolderOpen },
  { id: 'workflow.livePhoto', group: 'workflow', label: t('agentOs.commandCenter.commands.livePhoto'), description: t('agentOs.commandCenter.descriptions.livePhoto'), prompt: t('agentOs.commandCenter.prompts.livePhoto'), icon: FileImage },
  { id: 'workflow.subtitle', group: 'workflow', label: t('agentOs.commandCenter.commands.subtitle'), description: t('agentOs.commandCenter.descriptions.subtitle'), prompt: t('agentOs.commandCenter.prompts.subtitle'), icon: FileText },
  { id: 'workflow.publish', group: 'workflow', label: t('agentOs.commandCenter.commands.publish'), description: t('agentOs.commandCenter.descriptions.publish'), prompt: t('agentOs.shortcuts.publishPrompt'), icon: Rocket },
  { id: 'workflow.production', group: 'workflow', label: t('agentOs.commandCenter.commands.production'), description: t('agentOs.commandCenter.descriptions.production'), prompt: t('agentOs.commandCenter.prompts.production'), icon: History },
  { id: 'workflow.research', group: 'workflow', label: t('agentOs.commandCenter.commands.research'), description: t('agentOs.commandCenter.descriptions.research'), prompt: t('agentOs.commandCenter.prompts.research'), icon: Search },
  { id: 'workflow.delegate', group: 'workflow', label: t('agentOs.commandCenter.commands.delegate'), description: t('agentOs.commandCenter.descriptions.delegate'), prompt: t('agentOs.commandCenter.prompts.delegate'), icon: Bot },
])
function businessCommandIcon(category: HermesBusinessCategory) {
  if (category === 'product' || category === 'material') return FolderOpen
  if (category === 'sourceVideo') return Download
  if (category === 'clone' || category === 'creative') return Video
  if (category === 'livePhoto') return FileImage
  if (category === 'subtitle' || category === 'listing') return FileText
  if (category === 'modelIdentity') return UserRoundCog
  if (category === 'template') return Archive
  if (category === 'production') return History
  if (category === 'publishing') return Rocket
  return Boxes
}

const businessCommands = computed<CommandItem[]>(() => HERMES_BUSINESS_ACTIONS.map((action) => {
  const label = t(`agentOs.${action.localeGroup}.${action.localeKey}`)
  return {
    id: `business.${action.id}`,
    group: 'business',
    businessCategory: action.category,
    label,
    description: t(`agentOs.businessCommandCatalog.descriptions.${action.mode}`),
    prompt: t(`agentOs.businessCommandCatalog.prompts.${action.mode}`, { action: label }),
    icon: businessCommandIcon(action.category),
  }
}))
const managementCommands = computed<CommandItem[]>(() => [
  { id: 'management.runtime', group: 'management', label: t('agentOs.commandCatalog.management.runtime'), description: t('agentOs.commandCatalog.managementDescriptions.runtime'), workspaceId: 'settings', settingsSection: 'hermes-runtime', icon: Server },
  { id: 'management.skills', group: 'management', label: t('agentOs.commandCatalog.management.skills'), description: t('agentOs.commandCatalog.managementDescriptions.skills'), workspaceId: 'settings', settingsSection: 'hermes-skills', icon: Puzzle },
  { id: 'management.channels', group: 'management', label: t('agentOs.commandCatalog.management.channels'), description: t('agentOs.commandCatalog.managementDescriptions.channels'), workspaceId: 'settings', settingsSection: 'hermes-channels', icon: Radio },
  { id: 'management.data', group: 'management', label: t('agentOs.commandCatalog.management.data'), description: t('agentOs.commandCatalog.managementDescriptions.data'), workspaceId: 'settings', settingsSection: 'hermes-data', icon: DatabaseBackup },
  { id: 'management.platforms', group: 'management', label: t('agentOs.commandCatalog.management.platforms'), description: t('agentOs.commandCatalog.managementDescriptions.platforms'), workspaceId: 'settings', settingsSection: 'platforms', icon: KeyRound },
  { id: 'management.capabilities', group: 'management', label: t('agentOs.commandCatalog.management.capabilities'), description: t('agentOs.commandCatalog.managementDescriptions.capabilities'), workspaceId: 'settings', settingsSection: 'capabilities', icon: Boxes },
  { id: 'management.appearance', group: 'management', label: t('agentOs.commandCatalog.management.appearance'), description: t('agentOs.commandCatalog.managementDescriptions.appearance'), workspaceId: 'settings', settingsSection: 'appearance', icon: Palette },
])
const skillCommands = computed<CommandItem[]>(() => commandSkills.value
  .filter((skill) => skill.enabled !== false && skill.name.trim())
  .map((skill) => ({
    id: `skill.${skill.name}`,
    group: 'skill',
    label: skill.name,
    description: skill.description || skill.category || t('agentOs.commandCenter.skillDescription'),
    prompt: t('agentOs.commandCenter.skillPrompt', { name: skill.name }),
    icon: Puzzle,
  })))
function workspaceCommandIcon(workspaceId: string) {
  if (workspaceId === 'models') return UserRoundCog
  if (workspaceId === 'products' || workspaceId === 'product-materials') return FolderOpen
  if (workspaceId === 'clone-projects' || workspaceId === 'tiktok-creative') return Video
  if (workspaceId === 'production' || workspaceId === 'publisher' || workspaceId === 'publish-center') return Rocket
  if (workspaceId === 'production-tasks') return History
  if (workspaceId === 'templates') return Archive
  if (workspaceId === 'plugins') return Puzzle
  if (workspaceId === 'live-photo') return FileImage
  if (workspaceId === 'tiktok-listing' || workspaceId === 'video-subtitles') return FileText
  if (workspaceId === 'video-downloads') return Download
  if (workspaceId === 'settings') return Settings2
  return FolderOpen
}

const workspaceCommands = computed<CommandItem[]>(() => HERMES_WORKSPACES
  .filter((workspace) => !workspace.entityParam && workspace.id !== 'home')
  .map((workspace) => ({
    id: `workspace.${workspace.id}`,
    group: 'workspace',
    label: t(`agentOs.commandCatalog.workspaces.${workspace.id}.label`, workspace.name),
    description: t(`agentOs.commandCatalog.workspaces.${workspace.id}.description`, workspace.description),
    workspaceId: workspace.id,
    icon: workspaceCommandIcon(workspace.id),
  })))
const filteredCommandItems = computed(() => {
  const query = commandQuery.value.trim().toLocaleLowerCase()
  const items = [...workflowCommands.value, ...businessCommands.value, ...managementCommands.value, ...skillCommands.value, ...workspaceCommands.value]
  if (!query) {
    if (commandScope.value === 'recommended') return workflowCommands.value
    return items.filter((item) => item.group === commandScope.value)
  }
  return items.filter((item) => `${item.label}\n${item.description}`.toLocaleLowerCase().includes(query))
})
const commandScopes: readonly CommandScope[] = ['recommended', 'business', 'skill', 'workspace', 'management']
const commandGroups = computed(() => {
  const items = filteredCommandItems.value
  const groups: Array<{ group: string; label: string; items: CommandItem[] }> = []
  const workflowItems = items.filter((item) => item.group === 'workflow')
  if (workflowItems.length) groups.push({ group: 'workflow', label: t('agentOs.commandCenter.groups.workflow'), items: workflowItems })
  for (const category of HERMES_BUSINESS_CATEGORIES) {
    const categoryItems = items.filter((item) => item.group === 'business' && item.businessCategory === category)
    if (categoryItems.length) groups.push({ group: `business.${category}`, label: t(`agentOs.businessCommandCatalog.categories.${category}`), items: categoryItems })
  }
  const managementItems = items.filter((item) => item.group === 'management')
  if (managementItems.length) groups.push({ group: 'management', label: t('agentOs.commandCatalog.managementGroup'), items: managementItems })
  const skillItems = items.filter((item) => item.group === 'skill')
  if (skillItems.length) groups.push({ group: 'skill', label: t('agentOs.commandCenter.groups.skill'), items: skillItems })
  const workspaceItems = items.filter((item) => item.group === 'workspace')
  if (workspaceItems.length) groups.push({ group: 'workspace', label: t('agentOs.commandCenter.groups.workspace'), items: workspaceItems })
  return groups
})

function errorText(error: unknown) {
  return friendlyHermesError(String((error as Error)?.message || error || t('agentOs.common.unknownError')))
}

function isHermesAuthenticationError(message: string) {
  return /\b401\b|invalid (?:api )?(?:key|token)|unauthori[sz]ed|not logged in|authentication (?:failed|required)/i.test(message)
}

function friendlyHermesError(message: string) {
  if (isHermesAuthenticationError(message)) {
    return t('agentOs.hermes.modelAuthenticationRequired')
  }
  return message.replace(/\s*\(request id:[^)]+\)/gi, '').trim()
}

function safeHermesText(message: string) {
  return friendlyHermesError(String(message || ''))
}

function activityValueText(value: unknown) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return safeHermesText(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function compactActivityText(value: string) {
  const compact = safeHermesText(value).replace(/\s+/g, ' ').trim()
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact
}

function activitySections(payload: Record<string, unknown>, kind: ActivityCard['kind'], previous: ActivityCard['sections']) {
  const sections: ActivityCard['sections'] = []
  const add = (id: string, label: string, value: unknown) => {
    const text = activityValueText(value).trim()
    if (!text || sections.some((item) => item.text === text)) return
    sections.push({ id, label, text })
  }
  if (kind === 'tool') {
    add('input', t('agentOs.hermesActivityActions.input'), payload.args_text || payload.args)
    add('output', t('agentOs.hermesActivityActions.output'), payload.result_text || payload.result)
    add('changes', t('agentOs.hermesActivityActions.changes'), payload.inline_diff)
  } else if (kind === 'background') {
    add('output', t('agentOs.hermesActivityActions.output'), payload.text || payload.result)
  } else if (kind === 'browser') {
    add('details', t('agentOs.hermesActivityActions.details'), payload.message || payload.text)
  } else if (kind === 'subagent') {
    add('details', t('agentOs.hermesActivityActions.details'), payload.summary || payload.result)
  }
  return sections.length ? sections : previous
}

function activityExpanded(cardId: string) {
  return expandedActivityIds.value.has(cardId)
}

function toggleActivity(cardId: string) {
  const next = new Set(expandedActivityIds.value)
  if (next.has(cardId)) next.delete(cardId)
  else next.add(cardId)
  expandedActivityIds.value = next
}

async function copyActivitySection(cardId: string, section: ActivityCard['sections'][number]) {
  const copyId = `${cardId}:${section.id}`
  try {
    await navigator.clipboard.writeText(section.text)
    copiedActivitySectionId.value = copyId
    window.setTimeout(() => {
      if (copiedActivitySectionId.value === copyId) copiedActivitySectionId.value = ''
    }, 1500)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

function employeeName(id: string) {
  const keyById: Record<string, string> = {
    'employee.supervisor': 'agentOs.employee.supervisor',
    'employee.material': 'agentOs.employee.material',
    'employee.clone': 'agentOs.employee.video',
    'employee.package': 'agentOs.employee.package',
    'employee.publish': 'agentOs.employee.publish',
  }
  const key = keyById[id]
  return key ? t(key) : employees.value.find((item) => item.id === id)?.name || t('agentOs.employee.unknown')
}

function friendlyToolName(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return t('agentOs.hermes.toolRunning')
  if (raw.startsWith('videogenerate_')) {
    const suffix = raw.slice('videogenerate_'.length).replace(/[^a-z0-9_]/g, '')
    for (const namespace of ['agentOs.hermesPublisherTools', 'agentOs.hermesTaskTools', 'agentOs.hermesTools']) {
      const key = `${namespace}.${suffix}`
      const translated = t(key)
      if (translated !== key) return translated
    }
  }
  const readable = raw
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : t('agentOs.hermes.toolRunning')
}

function formatTime(timestamp: number) {
  const value = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value || Date.now())
}

function timestampMs(timestamp: unknown) {
  const value = Number(timestamp || 0)
  if (!Number.isFinite(value) || value <= 0) return Date.now()
  return value > 10_000_000_000 ? value : value * 1000
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((item) => contentText(item)).filter(Boolean).join('\n')
  if (content && typeof content === 'object') {
    const row = content as Record<string, unknown>
    return contentText(row.text ?? row.content ?? '')
  }
  return ''
}

function historyAttachmentRows(text: string, messageIndex: number) {
  const rows: Attachment[] = []
  const add = (path: string, mediaType?: Attachment['mediaType']) => {
    const normalizedPath = String(path || '').trim()
    if (!normalizedPath || rows.some((item) => item.path.toLocaleLowerCase() === normalizedPath.toLocaleLowerCase())) return
    const name = normalizedPath.split(/[\\/]/).pop() || normalizedPath
    rows.push({
      id: `history-attachment-${messageIndex}-${rows.length}`,
      name,
      path: normalizedPath,
      mediaType: mediaType || attachmentMediaType(name),
      size: 0,
    })
  }

  for (const match of text.matchAll(/\[Image attached at:\s*([^\]]+)\]/gi)) add(match[1] || '', 'image')
  for (const match of text.matchAll(/@file:(?:`([^`]+)`|([^\s(]+))/g)) add(match[1] || match[2] || '')
  return rows
}

function structuredHistoryAttachments(value: unknown, messageIndex: number) {
  if (!Array.isArray(value)) return [] as Attachment[]
  return value.flatMap((item, attachmentIndex) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const path = String(row.path || row.local_path || row.uri || '').trim()
    if (!path) return []
    const name = String(row.name || '').trim() || path.split(/[\\/]/).pop() || path
    const declaredType = String(row.mediaType || row.media_type || row.type || '')
    const mediaType: Attachment['mediaType'] = declaredType === 'image' || declaredType === 'video'
      ? declaredType
      : attachmentMediaType(name)
    return [{
      id: String(row.id || `history-attachment-${messageIndex}-${attachmentIndex}`),
      name,
      path,
      mediaType,
      size: Math.max(0, Number(row.size || 0)),
    }]
  })
}

function visibleHistoryUserText(text: string, attachmentCount: number) {
  const markerIndex = text.indexOf('\n\n--- Attached Context ---')
  const visible = (markerIndex >= 0 ? text.slice(0, markerIndex) : text)
    .replace(/\[Image attached at:\s*[^\]]+\]/gi, '')
    .replace(/^\s*\[screenshot\]\s*$/gim, '')
    .trim()
  return visible || messageText('', attachmentCount)
}

function normalizeHistory(rows: unknown[]): ChatMessage[] {
  const normalized = rows.flatMap((item, index) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null
    if (!role) return []
    const rawText = contentText(row.text ?? row.content)
    const messageAttachments = role === 'user'
      ? [...structuredHistoryAttachments(row.attachments, index), ...historyAttachmentRows(rawText, index)]
        .filter((attachment, attachmentIndex, all) => all.findIndex((item) => item.path.toLocaleLowerCase() === attachment.path.toLocaleLowerCase()) === attachmentIndex)
      : []
    const text = role === 'assistant'
      ? safeHermesText(rawText)
      : visibleHistoryUserText(rawText, messageAttachments.length)
    if (!text) return []
    return [{
      id: `history-${index}-${String(row.timestamp || '')}`,
      role,
      text,
      reasoning: contentText(row.reasoning ?? row.reasoning_content) || undefined,
      attachments: messageAttachments.length ? messageAttachments : undefined,
      createdAt: Number(row.timestamp || Date.now()),
    }]
  })
  return normalized.filter((message, index) => {
    const previous = normalized[index - 1]
    if (!previous || previous.role !== message.role) return true
    const previousAttachments = (previous.attachments || []).map((item) => `${item.path}|${item.name}`).join('\n')
    const messageAttachments = (message.attachments || []).map((item) => `${item.path}|${item.name}`).join('\n')
    return safeHermesText(previous.text).trim() !== safeHermesText(message.text).trim()
      || previousAttachments !== messageAttachments
  })
}

function hasEquivalentMessage(role: ChatMessage['role'], text: string, createdAt: number) {
  const normalizedText = safeHermesText(text).trim()
  if (!normalizedText) return false
  return messages.value.some((message) => (
    message.role === role
    && safeHermesText(message.text).trim() === normalizedText
    && Math.abs(Number(message.createdAt || 0) - Number(createdAt || 0)) <= 5_000
  ))
}

function activityTitle(event: GatewayEvent) {
  const name = String(event.payload.name || event.payload.tool_name || '')
  if (event.type === 'tool.start') return friendlyToolName(name)
  if (event.type === 'tool.complete') return String(event.payload.summary || friendlyToolName(name) || t('agentOs.hermes.toolComplete'))
  if (event.type.startsWith('subagent.')) return String(event.payload.goal || event.payload.summary || t('agentOs.hermes.subagent'))
  if (event.type === 'background.complete') return t('agentOs.hermes.backgroundComplete')
  if (event.type === 'status.update') return safeHermesText(String(event.payload.text || t('agentOs.hermes.statusUpdate')))
  return event.type
}

function activityIcon(card: ActivityCard) {
  if (card.kind === 'subagent') return Bot
  if (card.kind === 'tool') return Wrench
  if (card.kind === 'browser') return Search
  if (card.eventType.includes('approval')) return ShieldAlert
  if (card.eventType.includes('sudo') || card.eventType.includes('terminal')) return Terminal
  return BrainCircuit
}

function attachmentIcon(mediaType: Attachment['mediaType']) {
  if (mediaType === 'image') return FileImage
  if (mediaType === 'video') return Video
  return FileText
}

function attachmentPreviewUrl(attachment: Attachment) {
  if (attachment.mediaType !== 'image') return ''
  return attachment.path.startsWith('data:image/') ? attachment.path : `vg://file?path=${encodeURIComponent(attachment.path)}`
}

async function copyMessage(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(safeHermesText(message.text))
    copiedMessageId.value = message.id
    window.setTimeout(() => {
      if (copiedMessageId.value === message.id) copiedMessageId.value = ''
    }, 1500)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

async function editMessage(message: ChatMessage, messageIndex: number) {
  if (message.role !== 'user' || isStreaming.value || actionBusy.value) return
  const userOrdinal = messages.value
    .slice(0, messageIndex + 1)
    .filter((item) => item.role === 'user')
    .length - 1
  if (userOrdinal < 0) return
  messageEdit.value = { messageId: message.id, messageIndex, userOrdinal }
  prompt.value = safeHermesText(message.promptText ?? message.text)
  attachments.value = (message.attachments || []).map((item) => ({ ...item, id: crypto.randomUUID() }))
  await nextTick()
  composer.value?.focus()
  composer.value?.setSelectionRange(prompt.value.length, prompt.value.length)
}

function cancelMessageEdit() {
  messageEdit.value = null
  prompt.value = ''
  attachments.value = []
  composer.value?.focus()
}

async function openExternalLink(url: string) {
  try {
    await window.api.shell.openExternal(url)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

async function openMessageAttachment(attachment: Attachment) {
  if (!attachment.path || attachment.path.startsWith('data:')) return
  try {
    await window.api.shell.openPath(attachment.path)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

async function scrollToBottom() {
  await nextTick()
  messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' })
}

async function selectStarterCommand(value: string) {
  prompt.value = String(value || '').trim()
  await nextTick()
  composer.value?.focus()
}

async function loadCommandSkills() {
  if (commandSkillsLoading.value || commandSkills.value.length || runtime.value.state !== 'ready') return
  commandSkillsLoading.value = true
  try {
    const rows = await window.api.hermes.listSkills()
    commandSkills.value = (Array.isArray(rows) ? rows : []).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        name: String(row.name || ''),
        description: String(row.description || '') || undefined,
        enabled: row.enabled !== false,
        category: String(row.category || '') || undefined,
      }
    }).filter((item) => item.name)
  } catch {
    commandSkills.value = []
  } finally {
    commandSkillsLoading.value = false
  }
}

async function openCommandCenter() {
  commandCenterOpen.value = true
  commandQuery.value = ''
  commandSelection.value = 0
  commandScope.value = 'recommended'
  void loadCommandSkills()
  await nextTick()
  commandSearch.value?.focus()
}

function closeCommandCenter() {
  commandCenterOpen.value = false
  commandQuery.value = ''
  commandSelection.value = 0
  composer.value?.focus()
}

function selectCommandScope(scope: CommandScope) {
  commandScope.value = scope
  commandSelection.value = 0
  commandSearch.value?.focus()
}

async function selectCommand(item: CommandItem) {
  if (item.workspaceId) {
    closeCommandCenter()
    await window.api.hermes.openWorkspace({ workspaceId: item.workspaceId, settingsSection: item.settingsSection })
    return
  }
  const existing = prompt.value.trim()
  const template = String(item.prompt || '').trim()
  prompt.value = existing && existing !== '/'
    ? `${template}\n\n${existing}`.trim()
    : template
  closeCommandCenter()
  await nextTick()
  composer.value?.focus()
  composer.value?.setSelectionRange(prompt.value.length, prompt.value.length)
}

function onCommandKeydown(event: KeyboardEvent) {
  const count = filteredCommandItems.value.length
  if (event.key === 'Escape') {
    event.preventDefault()
    closeCommandCenter()
    return
  }
  if (!count) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    commandSelection.value = (commandSelection.value + 1) % count
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    commandSelection.value = (commandSelection.value - 1 + count) % count
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const selected = filteredCommandItems.value[commandSelection.value]
    if (selected) void selectCommand(selected)
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    if (commandCenterOpen.value) closeCommandCenter()
    else void openCommandCenter()
    return
  }
  if (event.key === 'Escape' && commandCenterOpen.value) closeCommandCenter()
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!commandCenterOpen.value) return
  const target = event.target
  if (!(target instanceof Node) || commandCenter.value?.contains(target)) return
  if (target instanceof Element && target.closest('.command-button')) return
  closeCommandCenter()
}

async function refreshEmployees() {
  const rows = await window.api.agentOs.listEmployees()
  employees.value = Array.isArray(rows) ? rows as Employee[] : []
  if (!employees.value.some((item) => item.id === selectedEmployeeId.value && item.enabled)) {
    selectedEmployeeId.value = employees.value.find((item) => item.enabled)?.id || ''
  }
}

async function refreshSessions() {
  if (runtime.value.state !== 'ready') return
  const rows = await window.api.hermes.listSessions(200)
  sessions.value = Array.isArray(rows) ? rows as SessionSummary[] : []
  await refreshPendingInputs()
}

function pendingInputEvent(input: PendingInput): GatewayEvent {
  const type = input.kind === 'approval'
    ? 'approval.request'
    : input.kind === 'clarification'
      ? 'clarify.request'
      : `${input.kind}.request`
  return {
    sequence: 0,
    type,
    sessionId: input.sessionId,
    storedSessionId: input.storedSessionId,
    payload: input.payload,
    createdAt: input.createdAt,
  }
}

async function refreshPendingInputs() {
  if (runtime.value.state !== 'ready') return [] as PendingInput[]
  const rows = await window.api.hermes.listPendingInputs()
  const pending = Array.isArray(rows) ? rows as PendingInput[] : []
  pendingSessionIds.value = new Set(pending.map((item) => String(item.storedSessionId || item.sessionId || '')).filter(Boolean))
  const active = pending.find((item) =>
    Boolean(
      (item.storedSessionId && item.storedSessionId === selectedStoredSessionId.value)
      || (item.sessionId && item.sessionId === activeSessionId.value),
    ),
  )
  pendingPrompt.value = active ? buildPendingPrompt(pendingInputEvent(active)) : null
  return pending
}

function isActivityEvent(event: GatewayEvent) {
  return /^(tool\.|subagent\.|background\.|status\.|notification\.|browser\.)/.test(event.type)
}

async function restoreHermesSessionState(sessionId: string, storedSessionId: string) {
  const rows = await window.api.hermes.listSessionEvents({ sessionId, storedSessionId, limit: 300 })
  if (selectedStoredSessionId.value !== storedSessionId) return
  const events = Array.isArray(rows) ? rows as GatewayEvent[] : []
  const localMessages = events.filter((event) => (
    event.payload.local_command === true
    && (event.type === 'message.user' || event.type === 'message.complete')
  ))
  for (const event of localMessages) {
    const role = event.type === 'message.user' ? 'user' : 'assistant'
    const text = safeHermesText(String(event.payload.text || ''))
    if (!text || hasEquivalentMessage(role, text, event.createdAt)) continue
    messages.value.push({
      id: String(event.payload.message_id || `local-command-${event.sequence}`),
      role,
      text,
      createdAt: event.createdAt,
    })
  }
  activities.value = events.filter(isActivityEvent).slice(-100)
  expandedActivityIds.value = new Set()
  lastHermesSequence = events.reduce((max, event) => Math.max(max, Number(event.sequence || 0)), lastHermesSequence)
  await refreshPendingInputs()
}

async function refreshDelegationStatus() {
  if (runtime.value.state !== 'ready') return
  try {
    const result = await window.api.hermes.getDelegationStatus() as Record<string, unknown>
    delegationStatus.value = {
      active: Array.isArray(result.active) ? result.active as Array<Record<string, unknown>> : [],
      paused: Boolean(result.paused),
      maxSpawnDepth: Number(result.max_spawn_depth || 0),
      maxConcurrentChildren: Number(result.max_concurrent_children || 0),
    }
  } catch {
    delegationStatus.value.active = []
  }
}

async function refreshBackgroundProcesses() {
  if (runtime.value.state !== 'ready' || !activeSessionId.value) {
    backgroundProcesses.value = []
    return
  }
  try {
    const result = await window.api.hermes.listBackgroundProcesses(activeSessionId.value) as Record<string, unknown>
    backgroundProcesses.value = Array.isArray(result.processes) ? result.processes as BackgroundProcess[] : []
  } catch {
    backgroundProcesses.value = []
  }
}

async function stopBackgroundProcess(processId: string) {
  if (!activeSessionId.value || !processId) return
  stoppingProcessId.value = processId
  uiError.value = ''
  try {
    await window.api.hermes.stopBackgroundProcess({ sessionId: activeSessionId.value, processId })
    await refreshBackgroundProcesses()
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    stoppingProcessId.value = ''
  }
}

async function refreshBrowserStatus() {
  if (runtime.value.state !== 'ready') {
    browserStatus.value = { connected: false, url: '', messages: [] }
    return
  }
  try {
    const result = await window.api.hermes.manageBrowser({
      action: 'status',
      sessionId: activeSessionId.value || undefined,
    }) as Record<string, unknown>
    browserStatus.value = {
      connected: Boolean(result.connected),
      url: String(result.url || ''),
      messages: Array.isArray(result.messages) ? result.messages.map(String) : [],
    }
  } catch {
    browserStatus.value = { connected: false, url: '', messages: [] }
  }
}

async function toggleBrowserConnection() {
  if (runtime.value.state !== 'ready' || browserBusy.value) return
  browserBusy.value = true
  uiError.value = ''
  try {
    const result = await window.api.hermes.manageBrowser({
      action: browserStatus.value.connected ? 'disconnect' : 'connect',
      sessionId: activeSessionId.value || undefined,
    }) as Record<string, unknown>
    browserStatus.value = {
      connected: Boolean(result.connected),
      url: String(result.url || ''),
      messages: Array.isArray(result.messages) ? result.messages.map(String) : [],
    }
    if (!browserStatus.value.connected && result.messages && Array.isArray(result.messages)) {
      const failure = result.messages.map(String).filter(Boolean).at(-1)
      if (failure) uiError.value = failure
    }
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    browserBusy.value = false
  }
}

function runRevision(run: ConversationRunSummary) {
  return run.revisions.find((item) => item.version === run.activeRevision)
}

function runStatusLabel(status: string) {
  const key = `agentOs.status.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

function runEventLabel(type: string) {
  const eventName = type.replace(/^agent\./, '').replace(/\./g, '_')
  const key = `agentOs.event.${eventName}`
  const translated = t(key)
  if (translated !== key) return translated
  return type.replace(/^agent\./, '').replace(/[._]/g, ' ')
}

function runEventDetail(event: RunDetail['events'][number]) {
  const payload = event.payload || {}
  const direct = payload.summary || payload.error || payload.message || payload.name
  if (direct) return String(direct)
  if (event.stepId) return runDetail.value?.steps.find((step) => step.id === event.stepId)?.title || ''
  if (payload.revision) return t('agentOs.plan.version', { version: Number(payload.revision) })
  return ''
}

function formatDuration(startedAt?: number, completedAt?: number) {
  if (!startedAt) return t('agentOs.execution.pendingDuration')
  const end = completedAt || Date.now()
  const seconds = Math.max(0, Math.round((end - startedAt) / 1000))
  if (seconds < 60) return t('agentOs.execution.seconds', { count: seconds })
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? t('agentOs.execution.minutesSeconds', { minutes, seconds: remainder }) : t('agentOs.execution.minutes', { count: minutes })
}

function formatMetricValue(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value)
}

function attemptsForStep(stepId: string) {
  return (runDetail.value?.attempts || []).filter((attempt) => attempt.stepId === stepId).sort((a, b) => a.sequence - b.sequence)
}

function friendlyCapabilityName(capabilityId: string) {
  return String(capabilityId || '')
    .replace(/\./g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
}

function runStepExpanded(stepId: string) {
  return expandedRunStepIds.value.has(stepId)
}

function toggleRunStep(stepId: string) {
  const next = new Set(expandedRunStepIds.value)
  if (next.has(stepId)) next.delete(stepId)
  else next.add(stepId)
  expandedRunStepIds.value = next
}

function safeExternalReferences(attempt: RunDetail['attempts'][number]) {
  return Object.entries(attempt.result?.externalRefs || {})
    .filter(([key, value]) => !/(?:api|access|auth|credential|password|secret|token)[_-]?(?:key|value|id)?/i.test(key) && String(value || '').trim())
    .map(([key, value]) => ({ key, value: String(value) }))
}

function runReviewState() {
  const status = runDetail.value?.run.status || ''
  if (status === 'completed' && !runWarningCount.value) return 'passed'
  if (status === 'failed' || runWarningCount.value) return 'needsAttention'
  return 'pending'
}

async function loadRunDetail(runId: string, pinSelection = false) {
  if (!runId) return
  selectedArtifact.value = null
  if (selectedRunId.value !== runId) {
    showAllRunEvents.value = false
    expandedRunStepIds.value = new Set()
  }
  selectedRunId.value = runId
  if (pinSelection) runSelectionPinned.value = true
  runDetail.value = await window.api.agentOs.getRun(runId) as RunDetail
}

async function selectConversationRun(runId: string) {
  actionBusy.value = true
  uiError.value = ''
  try {
    await loadRunDetail(runId, true)
    runHistoryOpen.value = false
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

async function restoreBusinessContext(id: string, eventRunId = '') {
  selectedArtifact.value = null
  if (!id) {
    conversationRuns.value = []
    selectedRunId.value = ''
    runDetail.value = null
    runSelectionPinned.value = false
    return
  }
  try {
    const detail = await window.api.agentOs.getConversation(id) as {
      runs?: ConversationRunSummary[]
    }
    const runs = (Array.isArray(detail.runs) ? detail.runs : [])
      .slice()
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
    conversationRuns.value = runs
    const selectedStillExists = runs.some((item) => item.id === selectedRunId.value)
    if (!selectedStillExists) runSelectionPinned.value = false
    const eventRun = runs.find((item) => item.id === eventRunId)
    const selectedRun = runs.find((item) => item.id === selectedRunId.value)
    const targetRun = runSelectionPinned.value && selectedRun
      ? selectedRun
      : eventRun || selectedRun || runs.find((item) => activeRunStatuses.has(item.status)) || runs[0]
    if (targetRun?.id) await loadRunDetail(targetRun.id)
    else {
      selectedRunId.value = ''
      runDetail.value = null
    }
  } catch {
    conversationRuns.value = []
    selectedRunId.value = ''
    runDetail.value = null
    runSelectionPinned.value = false
  }
}

async function restoreLastSession() {
  if (runtime.value.state !== 'ready' || activeSessionId.value || restoringStoredSessionId) return
  const preferredId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || ''
  if (!preferredId) return
  if (!sessions.value.some((item) => item.id === preferredId)) {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY)
    return
  }
  restoringStoredSessionId = preferredId
  try {
    await resumeSession(preferredId)
  } finally {
    restoringStoredSessionId = ''
  }
}

function selectModelProvider(provider: string) {
  modelProvider.value = provider
  modelApiKey.value = ''
  modelError.value = ''
  modelSuccess.value = ''
  if (provider === 'custom') {
    modelName.value = modelOptions.value?.custom.model || ''
    customBaseUrl.value = modelOptions.value?.custom.baseUrl || ''
    return
  }
  const selected = modelProviders.value.find((item) => item.slug === provider)
  modelName.value = provider === modelOptions.value?.provider && selected?.models.includes(modelOptions.value.model)
    ? modelOptions.value.model
    : selected?.models[0] || ''
}

async function loadModelOptions() {
  modelOptions.value = await window.api.hermes.getModelOptions(activeSessionId.value || undefined) as ModelOptions
  const provider = modelOptions.value.provider || modelOptions.value.providers.find((item) => item.isCurrent)?.slug || 'custom'
  selectModelProvider(provider)
}

async function openModelSettings() {
  modelPanelOpen.value = true
  modelBusy.value = true
  modelError.value = ''
  modelSuccess.value = ''
  try {
    await loadModelOptions()
  } catch (error) {
    modelError.value = errorText(error)
  } finally {
    modelBusy.value = false
  }
}

async function saveModelSettings() {
  if (!modelProvider.value || !modelName.value.trim()) return
  modelBusy.value = true
  modelError.value = ''
  modelSuccess.value = ''
  try {
    if (modelProvider.value === 'custom') {
      const configured = Boolean(modelOptions.value?.custom.apiKeyConfigured)
      if (!configured && !modelApiKey.value.trim()) throw new Error(t('agentOs.hermes.modelSettings.keyRequired'))
      const storedSessionId = selectedStoredSessionId.value
      await window.api.hermes.saveCustomModel({
        model: modelName.value.trim(),
        baseUrl: customBaseUrl.value.trim(),
        apiKey: modelApiKey.value.trim() || undefined,
      })
      activeSessionId.value = ''
      await loadModelOptions()
      if (storedSessionId) await resumeSession(storedSessionId)
    } else {
      const selected = selectedModelProvider.value
      if (!selected?.authenticated && !modelApiKey.value.trim()) throw new Error(t('agentOs.hermes.modelSettings.keyRequired'))
      if (modelApiKey.value.trim()) {
        await window.api.hermes.saveProviderKey({
          provider: modelProvider.value,
          apiKey: modelApiKey.value.trim(),
          sessionId: activeSessionId.value || undefined,
        })
      }
      await window.api.hermes.selectModel({
        provider: modelProvider.value,
        model: modelName.value.trim(),
        sessionId: activeSessionId.value || undefined,
      })
      await loadModelOptions()
    }
    modelApiKey.value = ''
    modelSuccess.value = t('agentOs.hermes.modelSettings.saved')
  } catch (error) {
    modelError.value = errorText(error)
  } finally {
    modelBusy.value = false
  }
}

async function useApplicationModel() {
  modelBusy.value = true
  modelError.value = ''
  modelSuccess.value = ''
  try {
    const storedSessionId = selectedStoredSessionId.value
    modelOptions.value = await window.api.hermes.useApplicationModel() as ModelOptions
    activeSessionId.value = ''
    selectModelProvider(modelOptions.value.provider || 'custom')
    if (storedSessionId) await resumeSession(storedSessionId)
    uiError.value = ''
    modelSuccess.value = t('agentOs.hermesModelActions.applicationModelApplied')
  } catch (error) {
    modelError.value = errorText(error)
  } finally {
    modelBusy.value = false
  }
}

async function testModelConnection() {
  modelTesting.value = true
  modelError.value = ''
  modelSuccess.value = ''
  try {
    await window.api.hermes.testModelConnection()
    modelSuccess.value = t('agentOs.hermes.modelSettings.testPassed')
    await refreshSessions()
  } catch (error) {
    modelError.value = errorText(error)
  } finally {
    modelTesting.value = false
  }
}

async function disconnectModelProvider() {
  if (!modelProvider.value || modelProvider.value === 'custom') return
  modelBusy.value = true
  modelError.value = ''
  modelSuccess.value = ''
  try {
    modelOptions.value = await window.api.hermes.disconnectModelProvider({
      provider: modelProvider.value,
      sessionId: activeSessionId.value || undefined,
    }) as ModelOptions
    selectModelProvider(modelOptions.value.provider || 'custom')
    modelSuccess.value = t('agentOs.hermes.modelSettings.disconnected')
  } catch (error) {
    modelError.value = errorText(error)
  } finally {
    modelBusy.value = false
  }
}

async function createSession() {
  if (runtime.value.state !== 'ready') return
  actionBusy.value = true
  uiError.value = ''
  try {
    const result = await window.api.hermes.createSession({
      employeeId: selectedEmployeeId.value,
      model: modelOverride.value.trim() || undefined,
      channel: 'desktop',
    })
    activeSessionId.value = String(result.sessionId || '')
    selectedStoredSessionId.value = String(result.storedSessionId || '')
    if (selectedStoredSessionId.value) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, selectedStoredSessionId.value)
    conversationId.value = String(result.conversationId || '')
    if (result.employeeId && employees.value.some((item) => item.id === result.employeeId && item.enabled)) {
      selectedEmployeeId.value = String(result.employeeId)
    }
    sessionTitle.value = employeeName(selectedEmployeeId.value)
    messages.value = normalizeHistory(Array.isArray(result.messages) ? result.messages : [])
    activities.value = []
    expandedActivityIds.value = new Set()
    queuedPrompts.value = []
    messageEdit.value = null
    prompt.value = ''
    attachments.value = []
    pendingPrompt.value = null
    pendingAnswer.value = ''
    runDetail.value = null
    conversationRuns.value = []
    selectedRunId.value = ''
    runHistoryOpen.value = false
    runSelectionPinned.value = false
    await nextTick()
    composer.value?.focus()
    void Promise.all([refreshDelegationStatus(), refreshBackgroundProcesses(), refreshBrowserStatus()])
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

async function resumeSession(storedSessionId: string) {
  if (!storedSessionId || (isStreaming.value && selectedStoredSessionId.value !== storedSessionId)) return
  if (storedSessionId === selectedStoredSessionId.value && activeSessionId.value) return
  sessionMenuId.value = ''
  uiError.value = ''
  const switchSequence = ++sessionSwitchSequence
  const previousStoredSessionId = selectedStoredSessionId.value
  if (previousStoredSessionId) sessionMessageCache.set(previousStoredSessionId, messages.value.map((message) => ({ ...message })))

  selectedStoredSessionId.value = storedSessionId
  switchingSessionId.value = storedSessionId
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, storedSessionId)
  activeSessionId.value = ''
  conversationId.value = ''
  sessionTitle.value = sessions.value.find((item) => item.id === storedSessionId)?.title || t('agentOs.hermes.untitled')
  messages.value = (sessionMessageCache.get(storedSessionId) || []).map((message) => ({ ...message }))
  activities.value = []
  expandedActivityIds.value = new Set()
  isStreaming.value = false
  streamingText.value = ''
  streamingReasoning.value = ''
  queuedPrompts.value = []
  messageEdit.value = null
  prompt.value = ''
  attachments.value = []
  pendingPrompt.value = null
  pendingAnswer.value = ''
  runDetail.value = null
  conversationRuns.value = []
  selectedRunId.value = ''
  runHistoryOpen.value = false
  runSelectionPinned.value = false
  try {
    const result = await window.api.hermes.resumeSession(storedSessionId)
    if (switchSequence !== sessionSwitchSequence || selectedStoredSessionId.value !== storedSessionId) {
      return
    }
    activeSessionId.value = String(result.sessionId || '')
    conversationId.value = String(result.conversationId || '')
    if (result.employeeId && employees.value.some((item) => item.id === result.employeeId && item.enabled)) {
      selectedEmployeeId.value = String(result.employeeId)
    }
    const resumedMessages = normalizeHistory(Array.isArray(result.messages) ? result.messages : [])
    if (resumedMessages.length) {
      sessionMessageCache.set(storedSessionId, resumedMessages)
      messages.value = resumedMessages.map((message) => ({ ...message }))
    }
    const info = result.info && typeof result.info === 'object' ? result.info as Record<string, unknown> : {}
    const inflight = info.inflight && typeof info.inflight === 'object' ? info.inflight as Record<string, unknown> : {}
    isStreaming.value = Boolean(info.running || info.status === 'working')
    streamingText.value = String(inflight.assistant || '')
    streamingReasoning.value = String(inflight.reasoning || '')
    switchingSessionId.value = ''
    void restoreHermesSessionState(activeSessionId.value, storedSessionId).catch(() => undefined)
    void Promise.all([
      refreshDelegationStatus(),
      refreshBackgroundProcesses(),
      refreshBrowserStatus(),
      restoreBusinessContext(conversationId.value),
    ])
    await scrollToBottom()
  } catch (error) {
    if (switchSequence === sessionSwitchSequence) uiError.value = errorText(error)
  } finally {
    if (switchSequence === sessionSwitchSequence) switchingSessionId.value = ''
  }
}

function openSessionDialog(mode: SessionDialogMode, session: SessionSummary) {
  sessionMenuId.value = ''
  sessionDialogMode.value = mode
  sessionDialogTarget.value = session
  sessionTitleDraft.value = session.title || t('agentOs.hermes.untitled')
  uiError.value = ''
}

function closeSessionDialog(force = false) {
  if (sessionActionBusy.value && !force) return
  sessionDialogMode.value = null
  sessionDialogTarget.value = null
  sessionTitleDraft.value = ''
}

async function renameSession() {
  const session = sessionDialogTarget.value
  const title = sessionTitleDraft.value.trim()
  if (!session || !title) return
  sessionActionBusy.value = true
  uiError.value = ''
  try {
    await window.api.hermes.renameSession({ sessionId: session.id, title })
    if (selectedStoredSessionId.value === session.id) sessionTitle.value = title
    await refreshSessions()
    closeSessionDialog(true)
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    sessionActionBusy.value = false
  }
}

function clearSelectedSession() {
  selectedStoredSessionId.value = ''
  activeSessionId.value = ''
  conversationId.value = ''
  sessionTitle.value = ''
  messages.value = []
  activities.value = []
  expandedActivityIds.value = new Set()
  pendingPrompt.value = null
  runDetail.value = null
  conversationRuns.value = []
  selectedRunId.value = ''
  runHistoryOpen.value = false
  runSelectionPinned.value = false
  streamingText.value = ''
  streamingReasoning.value = ''
  isStreaming.value = false
  queuedPrompts.value = []
  messageEdit.value = null
  prompt.value = ''
  attachments.value = []
  localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY)
}

async function deleteSession() {
  const session = sessionDialogTarget.value
  if (!session) return
  sessionActionBusy.value = true
  uiError.value = ''
  try {
    await window.api.hermes.deleteSession(session.id)
    if (selectedStoredSessionId.value === session.id) clearSelectedSession()
    await refreshSessions()
    closeSessionDialog(true)
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    sessionActionBusy.value = false
  }
}

async function ensureSession() {
  if (!activeSessionId.value) await createSession()
  if (!activeSessionId.value) throw new Error(t('agentOs.hermes.sessionUnavailable'))
  return activeSessionId.value
}

function plainAttachments(rows: Attachment[]) {
  return rows.map(({ name, path, mediaType }) => ({ name, path, mediaType }))
}

function messageText(text: string, attachmentCount: number) {
  return text || t('agentOs.hermesUx.attachmentOnly', { count: attachmentCount })
}

async function dispatchPrompt(input: { text: string; attachments: Attachment[] }) {
  const sessionId = await ensureSession()
  const previousMessageCount = messages.value.length
  messages.value.push({
    id: crypto.randomUUID(),
    role: 'user',
    text: messageText(input.text, input.attachments.length),
    promptText: input.text,
    attachments: input.attachments.map((item) => ({ ...item })),
    createdAt: Date.now(),
  })
  isStreaming.value = true
  streamingText.value = ''
  streamingReasoning.value = ''
  await scrollToBottom()
  try {
    await window.api.hermes.sendPrompt({ sessionId, text: input.text, attachments: plainAttachments(input.attachments) })
  } catch (error) {
    messages.value.splice(previousMessageCount)
    throw error
  }
}

async function dispatchEditedPrompt(input: { text: string; attachments: Attachment[]; edit: MessageEdit }) {
  const sessionId = await ensureSession()
  const previousMessages = messages.value.map((item) => ({
    ...item,
    attachments: item.attachments?.map((attachment) => ({ ...attachment })),
  }))
  messages.value = messages.value.slice(0, input.edit.messageIndex)
  messages.value.push({
    id: input.edit.messageId,
    role: 'user',
    text: messageText(input.text, input.attachments.length),
    promptText: input.text,
    attachments: input.attachments.map((item) => ({ ...item })),
    createdAt: Date.now(),
  })
  isStreaming.value = true
  streamingText.value = ''
  streamingReasoning.value = ''
  await scrollToBottom()
  try {
    await window.api.hermes.sendPrompt({
      sessionId,
      text: input.text,
      attachments: plainAttachments(input.attachments),
      regenerateUserOrdinal: input.edit.userOrdinal,
    })
  } catch (error) {
    messages.value = previousMessages
    throw error
  }
}

async function flushQueuedPrompt() {
  if (isStreaming.value || actionBusy.value || !activeSessionId.value) return
  const nextPrompt = queuedPrompts.value.find((item) => item.sessionId === activeSessionId.value)
  if (!nextPrompt) return
  try {
    await dispatchPrompt(nextPrompt)
    queuedPrompts.value = queuedPrompts.value.filter((item) => item.id !== nextPrompt.id)
  } catch (error) {
    isStreaming.value = false
    uiError.value = errorText(error)
  }
}

async function submit(mode: 'queue' | 'steer' | 'send' = 'send') {
  if (!canSend.value) return
  const text = prompt.value.trim()
  const selectedAttachmentRows = attachments.value.map((item) => ({
    id: String(item.id),
    name: String(item.name),
    path: String(item.path),
    mediaType: item.mediaType,
    size: Number(item.size || 0),
  }))
  const activeEdit = messageEdit.value
  prompt.value = ''
  attachments.value = []
  messageEdit.value = null
  uiError.value = ''
  try {
    const sessionId = await ensureSession()
    if (isStreaming.value) {
      if (mode !== 'steer') {
        queuedPrompts.value.push({
          id: crypto.randomUUID(),
          sessionId,
          text,
          attachments: selectedAttachmentRows,
          createdAt: Date.now(),
        })
        return
      }
      const attachmentLines = selectedAttachmentRows.map((item) => `- ${item.path}`).join('\n')
      const steerText = attachmentLines ? `${text}\n\nAttached local files:\n${attachmentLines}` : text
      await window.api.hermes.steerSession({ sessionId, text: steerText })
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'user',
        text: messageText(text, selectedAttachmentRows.length),
        attachments: selectedAttachmentRows.map((item) => ({ ...item })),
        createdAt: Date.now(),
      })
      await scrollToBottom()
      return
    }
    if (activeEdit) {
      await dispatchEditedPrompt({ text, attachments: selectedAttachmentRows, edit: activeEdit })
    } else {
      await dispatchPrompt({ text, attachments: selectedAttachmentRows })
    }
  } catch (error) {
    isStreaming.value = false
    if (!prompt.value.trim()) prompt.value = text
    if (!attachments.value.length) attachments.value = selectedAttachmentRows
    if (activeEdit) messageEdit.value = activeEdit
    uiError.value = errorText(error)
  }
}

async function regenerate(messageIndex: number) {
  if (!activeSessionId.value || isStreaming.value) return
  const userRows = messages.value.slice(0, messageIndex).filter((item) => item.role === 'user')
  const source = userRows.at(-1)
  if (!source) return
  const sourceIndex = messages.value.lastIndexOf(source)
  const previousMessages = messages.value
  isStreaming.value = true
  streamingText.value = ''
  streamingReasoning.value = ''
  messages.value = messages.value.slice(0, sourceIndex + 1)
  try {
    await window.api.hermes.sendPrompt({
      sessionId: activeSessionId.value,
      text: source.text,
      attachments: source.attachments?.length ? plainAttachments(source.attachments) : undefined,
      regenerateUserOrdinal: userRows.length - 1,
    })
  } catch (error) {
    messages.value = previousMessages
    isStreaming.value = false
    uiError.value = errorText(error)
  }
}

async function forkSession() {
  if (!activeSessionId.value) return
  actionBusy.value = true
  uiError.value = ''
  try {
    const sourceLiveSessionId = activeSessionId.value
    const result = await window.api.hermes.forkSession({ sessionId: sourceLiveSessionId })
    const branchLiveSessionId = String(result.sessionId || result.session_id || '')
    const branchStoredSessionId = String(result.storedSessionId || result.stored_session_id || '')
    if (!branchLiveSessionId || !branchStoredSessionId) throw new Error(t('agentOs.hermes.sessionUnavailable'))

    activeSessionId.value = branchLiveSessionId
    selectedStoredSessionId.value = branchStoredSessionId
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, branchStoredSessionId)
    conversationId.value = String(result.conversationId || conversationId.value)
    if (result.employeeId && employees.value.some((item) => item.id === result.employeeId && item.enabled)) {
      selectedEmployeeId.value = String(result.employeeId)
    }
    sessionTitle.value = String(result.title || t('agentOs.hermes.branch'))
    activities.value = []
    expandedActivityIds.value = new Set()
    queuedPrompts.value = []
    messageEdit.value = null
    prompt.value = ''
    attachments.value = []
    pendingPrompt.value = null
    await restoreBusinessContext(conversationId.value)
    streamingText.value = ''
    streamingReasoning.value = ''
    isStreaming.value = false
    await window.api.hermes.closeSession(sourceLiveSessionId).catch(() => undefined)
    await refreshSessions()
    await refreshDelegationStatus()
    await scrollToBottom()
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

async function interruptSession() {
  if (!activeSessionId.value) return
  try {
    await window.api.hermes.interruptSession(activeSessionId.value)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

function attachmentMediaType(name: string): Attachment['mediaType'] {
  const extension = name.split('.').pop()?.toLowerCase() || ''
  if (/^(png|jpe?g|gif|webp|avif|bmp)$/.test(extension)) return 'image'
  if (/^(mp4|mov|mkv|webm|avi|m4v)$/.test(extension)) return 'video'
  return 'file'
}

async function addAttachmentPaths(paths: string[]) {
  const candidates = Array.from(new Set(paths.map((item) => String(item || '').trim()).filter(Boolean)))
    .filter((path) => !attachments.value.some((item) => item.path.toLocaleLowerCase() === path.toLocaleLowerCase()))
  if (!candidates.length) return
  const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.value.length)
  if (!remaining) {
    uiError.value = t('agentOs.hermesUx.attachmentLimit', { count: MAX_ATTACHMENTS })
    return
  }
  const selected = candidates.slice(0, remaining)
  const details = await window.api.describeFiles(selected)
  const valid = details.filter((item) => item.exists && item.isFile && item.size <= MAX_ATTACHMENT_BYTES)
  if (valid.length !== selected.length) {
    uiError.value = t('agentOs.hermesUx.attachmentRejected')
  }
  if (candidates.length > remaining) {
    uiError.value = t('agentOs.hermesUx.attachmentLimit', { count: MAX_ATTACHMENTS })
  }
  for (const item of valid) {
    const name = item.path.split(/[\\/]/).pop() || item.path
    attachments.value.push({
      id: crypto.randomUUID(),
      name,
      path: item.path,
      mediaType: attachmentMediaType(name),
      size: item.size,
    })
  }
}

async function pickAttachments() {
  uiError.value = ''
  try {
    const pickFilesOverride = (window as typeof window & {
      __VG_TEST_pickFiles?: (options: { multiple: boolean }) => Promise<string[]>
    }).__VG_TEST_pickFiles
    const paths = await (pickFilesOverride || window.api.pickFiles)({ multiple: true })
    await addAttachmentPaths(Array.isArray(paths) ? paths : [])
  } catch (error) {
    uiError.value = errorText(error)
  }
}

function localPathForFile(file: File) {
  try {
    return String(window.api.getPathForFile(file) || '').trim()
  } catch {
    return ''
  }
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('The attachment could not be read.'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const separatorIndex = result.indexOf(',')
      if (separatorIndex < 0) {
        reject(new Error('The attachment data is invalid.'))
        return
      }
      resolve(result.slice(separatorIndex + 1))
    }
    reader.readAsDataURL(file)
  })
}

async function addAttachmentFiles(files: File[]) {
  const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.value.length)
  if (!remaining) {
    uiError.value = t('agentOs.hermesUx.attachmentLimit', { count: MAX_ATTACHMENTS })
    return
  }
  const selected = files.slice(0, remaining)
  if (files.length > remaining) uiError.value = t('agentOs.hermesUx.attachmentLimit', { count: MAX_ATTACHMENTS })
  const localPaths: string[] = []
  for (const file of selected) {
    const localPath = localPathForFile(file)
    if (localPath) {
      localPaths.push(localPath)
      continue
    }
    if (!file.size || file.size > MAX_STAGED_ATTACHMENT_BYTES) {
      uiError.value = t('agentOs.hermesUx.attachmentRejected')
      continue
    }
    try {
      const staged = await window.api.stageAttachment({
        name: file.name || 'attachment.bin',
        base64: await readFileAsBase64(file),
      })
      attachments.value.push({
        id: crypto.randomUUID(),
        name: staged.name,
        path: staged.path,
        mediaType: file.type.startsWith('image/') ? 'image' : attachmentMediaType(staged.name),
        size: staged.size,
      })
    } catch (error) {
      uiError.value = errorText(error)
    }
  }
  await addAttachmentPaths(localPaths)
}

function onAttachmentDragEnter() {
  dragDepth += 1
  isDraggingFiles.value = true
}

function onAttachmentDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) isDraggingFiles.value = false
}

async function onAttachmentDrop(event: DragEvent) {
  dragDepth = 0
  isDraggingFiles.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  try {
    await addAttachmentFiles(files)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

async function onComposerPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || [])
  if (!files.length) return
  event.preventDefault()
  uiError.value = ''
  await addAttachmentFiles(files)
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key === '/' && !prompt.value) {
    event.preventDefault()
    void openCommandCenter()
    return
  }
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void submit()
}

function buildPendingPrompt(event: GatewayEvent): PendingPrompt | null {
  const payload = event.payload
  const requestId = String(payload.request_id || '') || undefined
  if (event.type === 'clarify.request') {
    return {
      kind: 'clarification',
      requestId,
      title: t('agentOs.hermes.clarificationTitle'),
      detail: String(payload.question || ''),
      choices: Array.isArray(payload.choices) ? payload.choices.map(String) : undefined,
    }
  }
  if (event.type === 'approval.request') {
    return {
      kind: 'approval',
      title: t('agentOs.hermes.approvalTitle'),
      detail: String(payload.description || payload.command || payload.message || t('agentOs.hermes.approvalDetail')),
    }
  }
  if (event.type === 'sudo.request') {
    return { kind: 'sudo', requestId, title: t('agentOs.hermes.sudoTitle'), detail: String(payload.prompt || t('agentOs.hermes.sudoDetail')) }
  }
  if (event.type === 'secret.request') {
    return { kind: 'secret', requestId, title: t('agentOs.hermes.secretTitle'), detail: String(payload.prompt || payload.name || t('agentOs.hermes.secretDetail')) }
  }
  return null
}

async function respondPending(value: string) {
  const request = pendingPrompt.value
  if (!request || !activeSessionId.value) return
  actionBusy.value = true
  try {
    if (request.kind === 'approval') {
      await window.api.hermes.respondApproval({ sessionId: activeSessionId.value, choice: value })
    } else if (request.kind === 'clarification') {
      await window.api.hermes.respondClarification({ sessionId: activeSessionId.value, requestId: request.requestId, answer: value })
    } else if (request.kind === 'sudo') {
      await window.api.hermes.respondSudo({ sessionId: activeSessionId.value, requestId: request.requestId, password: value })
    } else {
      await window.api.hermes.respondSecret({ sessionId: activeSessionId.value, requestId: request.requestId, value })
    }
    pendingPrompt.value = null
    pendingAnswer.value = ''
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

function handleHermesEvents(events: GatewayEvent[]) {
  let delegationChanged = false
  let backgroundChanged = false
  let browserChanged = false
  for (const event of events) {
    lastHermesSequence = Math.max(lastHermesSequence, Number(event.sequence || 0))
    const pendingSessionId = String(event.storedSessionId || (event.sessionId === activeSessionId.value ? selectedStoredSessionId.value : event.sessionId) || '')
    if (/^(approval|clarify|sudo|secret)\.request$/.test(event.type) && pendingSessionId) {
      pendingSessionIds.value = new Set([...pendingSessionIds.value, pendingSessionId])
    } else if (['input.resolved', 'session.interrupted', 'session.closed'].includes(event.type) && pendingSessionId) {
      const next = new Set(pendingSessionIds.value)
      next.delete(pendingSessionId)
      pendingSessionIds.value = next
    }
    if (event.sessionId && event.sessionId !== activeSessionId.value) continue
    if (event.type === 'input.resolved' || event.type === 'session.interrupted') {
      pendingPrompt.value = null
      pendingAnswer.value = ''
    }
    const pending = buildPendingPrompt(event)
    if (pending) pendingPrompt.value = pending
    if (event.type === 'message.user') {
      const normalized = normalizeHistory([{
        id: event.payload.message_id || event.payload.id,
        role: 'user',
        content: event.payload.text || event.payload.content,
        attachments: event.payload.attachments,
        timestamp: event.createdAt,
      }])[0]
      if (normalized && !messages.value.some((item) => item.id === normalized.id) && !hasEquivalentMessage('user', normalized.text, normalized.createdAt)) {
        messages.value.push(normalized)
      }
    } else if (event.type === 'message.start') {
      isStreaming.value = true
      streamingText.value = ''
      streamingReasoning.value = ''
    } else if (event.type === 'message.delta') {
      streamingText.value += String(event.payload.text || '')
    } else if (event.type === 'reasoning.delta' || event.type === 'thinking.delta') {
      streamingReasoning.value += String(event.payload.text || '')
    } else if (event.type === 'message.complete') {
      const finalText = safeHermesText(String(event.payload.text || streamingText.value || ''))
      if (finalText && !hasEquivalentMessage('assistant', finalText, event.createdAt)) {
        messages.value.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          text: finalText,
          reasoning: String(event.payload.reasoning || streamingReasoning.value || '') || undefined,
          createdAt: event.createdAt,
        })
      }
      isStreaming.value = false
      streamingText.value = ''
      streamingReasoning.value = ''
      void refreshSessions()
      setTimeout(() => void refreshSessions(), 4_000)
      setTimeout(() => void flushQueuedPrompt(), 0)
    } else if (event.type === 'error') {
      isStreaming.value = false
      uiError.value = friendlyHermesError(String(event.payload.message || t('agentOs.hermes.generationFailed')))
    }
    if (isActivityEvent(event) && !activities.value.some((item) => item.sequence === event.sequence)) {
      activities.value.push(event)
      if (activities.value.length > 100) activities.value.splice(0, activities.value.length - 100)
    }
    if (event.type.startsWith('subagent.')) delegationChanged = true
    if (event.type.startsWith('background.') || event.type === 'tool.complete' || event.type === 'tool.start') backgroundChanged = true
    if (event.type.startsWith('browser.')) browserChanged = true
  }
  if (delegationChanged) void refreshDelegationStatus()
  if (backgroundChanged) void refreshBackgroundProcesses()
  if (browserChanged) void refreshBrowserStatus()
  void scrollToBottom()
}

async function interruptSubagent(subagentId: string) {
  if (!subagentId) return
  interruptingSubagentId.value = subagentId
  uiError.value = ''
  try {
    await window.api.hermes.interruptSubagent(subagentId)
    await refreshDelegationStatus()
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    interruptingSubagentId.value = ''
  }
}

async function toggleDelegationPaused() {
  delegationControlBusy.value = true
  uiError.value = ''
  try {
    await window.api.hermes.setDelegationPaused(!delegationStatus.value.paused)
    await refreshDelegationStatus()
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    delegationControlBusy.value = false
  }
}

async function handleAgentEvents(events: Array<{ sequence: number; conversationId?: string; runId?: string }>) {
  for (const event of events) lastAgentSequence = Math.max(lastAgentSequence, Number(event.sequence || 0))
  if (!conversationId.value) return
  const runId = events.slice().reverse().find((event) => (
    event.conversationId === conversationId.value && event.runId
  ))?.runId
  if (!runId) return
  try {
    await restoreBusinessContext(conversationId.value, runId)
  } catch {
    return
  }
}

async function approveRun(approved: boolean) {
  const run = runDetail.value?.run
  const revision = currentRevision.value
  if (!run || !revision) return
  actionBusy.value = true
  try {
    if (approved) await window.api.agentOs.approveRun({ runId: run.id, revision: revision.version, planHash: revision.hash })
    else await window.api.agentOs.rejectRun({ runId: run.id, revision: revision.version, planHash: revision.hash })
    await restoreBusinessContext(conversationId.value, run.id)
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

async function controlRun(action: 'pause' | 'resume' | 'cancel') {
  const runId = runDetail.value?.run.id
  if (!runId) return
  actionBusy.value = true
  uiError.value = ''
  try {
    if (action === 'pause') await window.api.agentOs.pauseRun(runId)
    else if (action === 'resume') await window.api.agentOs.resumeRun(runId)
    else await window.api.agentOs.cancelRun(runId)
    await restoreBusinessContext(conversationId.value, runId)
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

async function requestRunRecovery() {
  const run = runDetail.value?.run
  if (!run || !activeSessionId.value) return
  const text = t('agentOs.recovery.prompt', { shortId: run.shortId, runId: run.id })
  actionBusy.value = true
  uiError.value = ''
  try {
    if (isStreaming.value) {
      queuedPrompts.value.push({
        id: crypto.randomUUID(),
        sessionId: activeSessionId.value,
        text,
        attachments: [],
        createdAt: Date.now(),
      })
    } else {
      await dispatchPrompt({ text, attachments: [] })
    }
  } catch (error) {
    isStreaming.value = false
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

function artifactMediaKind(artifact: RunDetail['artifacts'][number]) {
  const extension = String(artifact.localPath || artifact.name || '').split('.').pop()?.toLowerCase() || ''
  if (artifact.kind === 'image' || /^(png|jpe?g|gif|webp|avif|bmp)$/.test(extension)) return 'image'
  if (artifact.kind === 'video' || /^(mp4|mov|mkv|webm|avi|m4v)$/.test(extension)) return 'video'
  if (/^(mp3|wav|m4a|aac|flac|ogg)$/.test(extension)) return 'audio'
  return 'file'
}

function artifactPreviewUrl(artifact: RunDetail['artifacts'][number]) {
  return artifact.localPath ? `vg://file?path=${encodeURIComponent(artifact.localPath)}` : ''
}

function previewArtifact(artifact: RunDetail['artifacts'][number]) {
  selectedArtifact.value = artifact
}

async function openArtifact(artifactId: string) {
  uiError.value = ''
  try {
    await window.api.agentOs.openArtifact(artifactId)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

async function revealArtifact(artifact: RunDetail['artifacts'][number]) {
  if (!artifact.localPath) return
  uiError.value = ''
  try {
    await window.api.shell.showItemInFolder(artifact.localPath)
  } catch (error) {
    uiError.value = errorText(error)
  }
}

async function saveArtifact(artifact: RunDetail['artifacts'][number]) {
  if (!artifact.localPath) return
  artifactActionBusy.value = true
  uiError.value = ''
  try {
    await window.api.saveFileAs({
      sourcePath: artifact.localPath,
      defaultFileName: artifact.name,
      title: t('agentOs.artifactActions.saveAs'),
    })
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    artifactActionBusy.value = false
  }
}

async function restartRuntime() {
  actionBusy.value = true
  uiError.value = ''
  try {
    runtime.value = await window.api.hermes.restartRuntime() as RuntimeStatus
    await refreshSessions()
  } catch (error) {
    uiError.value = errorText(error)
    runtime.value = await window.api.hermes.getRuntimeStatus() as RuntimeStatus
  } finally {
    actionBusy.value = false
  }
}

function openEmployeeEditor(employee?: Employee) {
  const source = employee || currentEmployee.value
  if (!source) return
  employeeDraft.value = {
    id: employee?.id,
    sourceEmployeeId: source.id,
    name: employee ? employeeName(employee.id) : '',
    description: source.description,
    plannerPolicy: source.plannerPolicy,
    reviewerPolicy: source.reviewerPolicy,
    color: source.color,
  }
}

async function saveEmployee() {
  const draft = employeeDraft.value
  if (!draft || !draft.name.trim()) return
  actionBusy.value = true
  try {
    if (draft.id) {
      await window.api.agentOs.updateEmployee({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim(),
        plannerPolicy: draft.plannerPolicy.trim(),
        reviewerPolicy: draft.reviewerPolicy.trim(),
        color: draft.color,
      })
    } else {
      await window.api.agentOs.createEmployee({
        sourceEmployeeId: draft.sourceEmployeeId,
        name: draft.name.trim(),
        description: draft.description.trim(),
        plannerPolicy: draft.plannerPolicy.trim(),
        reviewerPolicy: draft.reviewerPolicy.trim(),
        color: draft.color,
      })
    }
    employeeDraft.value = null
    await refreshEmployees()
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    actionBusy.value = false
  }
}

async function duplicateEmployee(employee: Employee) {
  try {
    await window.api.agentOs.duplicateEmployee({ id: employee.id })
    await refreshEmployees()
  } catch (error) {
    uiError.value = errorText(error)
  }
}

async function toggleEmployee(employee: Employee) {
  if (employee.id === 'employee.supervisor' && employee.enabled) return
  try {
    await window.api.agentOs.updateEmployee({ id: employee.id, enabled: !employee.enabled })
    await refreshEmployees()
  } catch (error) {
    uiError.value = errorText(error)
  }
}

async function archiveEmployee(employee: Employee) {
  if (employee.builtIn) return
  try {
    await window.api.agentOs.archiveEmployee(employee.id)
    await refreshEmployees()
  } catch (error) {
    uiError.value = errorText(error)
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  try {
    runtime.value = await window.api.hermes.getRuntimeStatus() as RuntimeStatus
    await refreshEmployees()
    unsubscribeHermesEvents = window.api.hermes.subscribeEvents(lastHermesSequence, handleHermesEvents)
    unsubscribeRuntime = window.api.hermes.subscribeRuntimeStatus((status: RuntimeStatus) => {
      const becameReady = runtime.value.state !== 'ready' && status.state === 'ready'
      runtime.value = status
      if (becameReady) {
        void refreshSessions().then(() => restoreLastSession())
      }
    })
    unsubscribeAgentEvents = window.api.agentOs.subscribeEvents(lastAgentSequence, (events: Array<{ sequence: number; runId?: string }>) => {
      void handleAgentEvents(events)
    })
    if (runtime.value.state === 'ready') {
      await refreshSessions()
      await restoreLastSession()
      await loadModelOptions()
    }
  } catch (error) {
    uiError.value = errorText(error)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  unsubscribeHermesEvents?.()
  unsubscribeRuntime?.()
  unsubscribeAgentEvents?.()
})
</script>

<template>
  <div class="hermes-workspace" :data-conversation-id="conversationId" :data-session-id="activeSessionId">
    <div v-if="uiError" class="error-banner" :class="{ 'has-action': hasModelAuthenticationIssue }" role="alert">
      <AlertTriangle />
      <span>{{ uiError }}</span>
      <button v-if="hasModelAuthenticationIssue" type="button" @click="openModelSettings">{{ t('agentOs.hermesModelActions.fixNow') }}</button>
      <button class="icon-button" type="button" :title="t('agentOs.common.dismiss')" @click="uiError = ''"><X /></button>
    </div>

    <aside class="session-rail">
      <header class="rail-header">
        <div><strong>{{ t('agentOs.hermes.sessions') }}</strong><small>Hermes {{ runtime.version || '' }}</small></div>
        <button class="icon-button" type="button" :title="t('agentOs.conversations.new')" :disabled="runtime.state !== 'ready'" @click="createSession"><MessageSquarePlus /></button>
      </header>
      <label class="session-search">
        <Search />
        <input v-model="sessionQuery" type="search" :placeholder="t('agentOs.hermesUx.searchSessions')" />
        <button v-if="sessionQuery" type="button" :title="t('agentOs.common.remove')" @click="sessionQuery = ''"><X /></button>
      </label>
      <div class="session-list" @click.self="sessionMenuId = ''">
        <article
          v-for="session in filteredSessions"
          :key="session.id"
          :data-session-id="session.id"
          class="session-row"
          :class="{ 'is-active': session.id === selectedStoredSessionId, 'is-switching': session.id === switchingSessionId }"
        >
          <button class="session-select" type="button" :disabled="actionBusy || (isStreaming && selectedStoredSessionId !== session.id)" @click="resumeSession(session.id)">
            <span class="session-icon"><Sparkles /></span>
            <span><strong>{{ session.title || t('agentOs.hermes.untitled') }}</strong><small>{{ session.preview || t('agentOs.hermes.noMessages') }}</small></span>
            <span v-if="session.id === switchingSessionId" class="session-switching" :title="t('agentOs.common.loading')"><LoaderCircle class="spin" /></span>
            <span v-else-if="pendingSessionIds.has(session.id)" class="session-needs-input" :title="t('agentOs.hermesUx.needsInput')"><ShieldAlert /></span>
          </button>
          <button class="session-menu-trigger" type="button" :title="t('agentOs.sessionActions.manage')" @click.stop="sessionMenuId = sessionMenuId === session.id ? '' : session.id"><MoreVertical /></button>
          <div v-if="sessionMenuId === session.id" class="session-menu">
            <button type="button" @click="openSessionDialog('rename', session)"><Pencil />{{ t('agentOs.sessionActions.rename') }}</button>
            <button class="is-danger" type="button" :disabled="isStreaming && selectedStoredSessionId === session.id" @click="openSessionDialog('delete', session)"><Trash2 />{{ t('agentOs.sessionActions.delete') }}</button>
          </div>
        </article>
        <p v-if="!filteredSessions.length && !loading" class="empty-copy">{{ sessionQuery ? t('agentOs.hermesUx.noSessionMatches') : t('agentOs.conversations.empty') }}</p>
      </div>
      <section class="employee-dock">
        <header>
          <div><strong>{{ t('agentOs.employees.title') }}</strong><small>{{ t('agentOs.employees.active', { count: activeEmployees.length }) }}</small></div>
          <button class="mini-button" type="button" :title="t('agentOs.employees.create')" @click="openEmployeeEditor()"><Plus /></button>
        </header>
        <div class="employee-list">
          <article v-for="employee in employees" :key="employee.id" class="employee-row" :class="{ 'is-active': employee.id === selectedEmployeeId, 'is-disabled': !employee.enabled }">
            <button class="employee-main" type="button" :disabled="!employee.enabled || hasSession" @click="selectedEmployeeId = employee.id">
              <span class="employee-avatar" :style="{ '--employee-color': employee.color }"><UserRoundCog /></span>
              <span><strong>{{ employeeName(employee.id) }}</strong><small>{{ employee.builtIn ? t('agentOs.employees.builtIn') : t('agentOs.employees.custom') }}</small></span>
            </button>
            <div class="employee-actions">
              <button class="toggle" :class="{ 'is-on': employee.enabled }" type="button" @click="toggleEmployee(employee)"><span></span></button>
              <button class="mini-button" type="button" :title="t('agentOs.employees.duplicate')" @click="duplicateEmployee(employee)"><Copy /></button>
              <button class="mini-button" type="button" :title="t('agentOs.employees.details')" @click="openEmployeeEditor(employee)"><Pencil /></button>
              <button v-if="!employee.builtIn" class="mini-button" type="button" :title="t('agentOs.employees.archive')" @click="archiveEmployee(employee)"><Archive /></button>
            </div>
          </article>
        </div>
      </section>
      <div class="runtime-block" :class="`is-${runtime.state}`">
        <span class="runtime-dot"></span>
        <div><strong>{{ t(`agentOs.hermes.runtime.${runtime.state}`) }}</strong><small>{{ runtime.error || runtime.profile }}</small></div>
        <button v-if="runtime.state === 'error' || runtime.state === 'stopped'" class="icon-button" type="button" :title="t('agentOs.hermes.repair')" @click="restartRuntime"><RefreshCw /></button>
      </div>
    </aside>

    <main class="conversation-surface">
      <header class="surface-header">
        <div class="surface-title">
          <span><Bot /></span>
          <div><strong>{{ sessionTitle || employeeName(selectedEmployeeId) }}</strong><small>{{ t('agentOs.hermes.fullCapability') }}</small></div>
        </div>
        <div class="surface-actions">
          <button class="icon-button activity-rail-trigger" type="button" :class="{ 'is-active': activityRailOpen }" :title="t('agentOs.hermes.activity')" @click="activityRailOpen = !activityRailOpen"><PanelRightOpen /><small v-if="activityCards.length">{{ activityCards.length }}</small></button>
          <button class="browser-field" :class="{ 'is-connected': browserStatus.connected }" type="button" :title="browserStatus.connected ? t('agentOs.hermesUx.disconnectBrowser') : t('agentOs.hermesUx.connectBrowser')" :disabled="runtime.state !== 'ready' || browserBusy" @click="toggleBrowserConnection">
            <LoaderCircle v-if="browserBusy" class="spin" /><PlugZap v-else-if="browserStatus.connected" /><Unplug v-else />
            <span>{{ t(browserStatus.connected ? 'agentOs.hermesUx.browserConnected' : 'agentOs.hermesUx.browserDisconnected') }}</span>
          </button>
          <button class="model-field" type="button" :title="t('agentOs.hermes.modelSettings.title')" :disabled="runtime.state !== 'ready' || isStreaming" @click="openModelSettings">
            <Settings2 /><span>{{ currentModelLabel }}</span>
          </button>
          <button class="icon-button" type="button" :title="t('agentOs.hermes.fork')" :disabled="!hasSession || actionBusy" @click="forkSession"><GitFork /></button>
          <button v-if="isStreaming" class="stop-button" type="button" @click="interruptSession"><CircleStop />{{ t('agentOs.hermes.stop') }}</button>
        </div>
      </header>

      <section v-if="runtime.state !== 'ready'" class="runtime-gate">
        <LoaderCircle v-if="runtime.state === 'starting'" class="spin" />
        <AlertTriangle v-else />
        <h1>{{ t(`agentOs.hermes.runtime.${runtime.state}`) }}</h1>
        <p>{{ runtime.error || t('agentOs.hermes.runtimeHint') }}</p>
        <button v-if="runtime.state !== 'starting'" class="primary-button" type="button" @click="restartRuntime"><RefreshCw />{{ t('agentOs.hermes.repair') }}</button>
        <details v-if="runtime.logs.length"><summary>{{ t('agentOs.hermes.diagnostics') }}</summary><pre>{{ runtime.logs.join('\n') }}</pre></details>
      </section>

      <template v-else>
        <div ref="messageList" class="conversation-scroll">
          <section v-if="!hasConversationActivity" class="idle-state">
            <span class="idle-mark"><BrainCircuit /></span>
            <h1>{{ t('agentOs.hermes.idleTitle') }}</h1>
            <p>{{ t('agentOs.hermes.idleSubtitle') }}</p>
            <div class="starter-command-grid">
              <button v-for="item in starterCommands" :key="item.id" type="button" @click="selectStarterCommand(item.prompt)">
                <span><component :is="item.icon" /></span>
                <strong>{{ item.label }}</strong>
                <CornerDownRight />
              </button>
            </div>
          </section>

          <section v-else class="message-stream">
            <article v-for="(message, index) in messages" :key="message.id" class="message-row" :class="`is-${message.role}`">
              <span class="message-avatar"><UserRoundCog v-if="message.role === 'user'" /><Bot v-else /></span>
              <div class="message-body">
                <header><strong>{{ message.role === 'user' ? t('agentOs.message.you') : employeeName(selectedEmployeeId) }}</strong><small>{{ formatTime(message.createdAt) }}</small></header>
                <details v-if="message.reasoning" class="reasoning"><summary><BrainCircuit />{{ t('agentOs.hermes.reasoning') }}</summary><p>{{ safeHermesText(message.reasoning) }}</p></details>
                <HermesMessageContent
                  :text="safeHermesText(message.text)"
                  :copy-label="t('agentOs.hermesMessageActions.copyCode')"
                  :copied-label="t('agentOs.hermesMessageActions.copied')"
                  :open-link-label="t('agentOs.hermesMessageActions.openLink')"
                  @error="uiError = $event"
                  @open-link="openExternalLink"
                />
                <div v-if="message.attachments?.length" class="message-attachment-list">
                  <button v-for="attachment in message.attachments" :key="attachment.id" type="button" :title="t('agentOs.hermesMessageActions.openAttachment')" :disabled="!attachment.path || attachment.path.startsWith('data:')" @click="openMessageAttachment(attachment)">
                    <img v-if="attachment.mediaType === 'image'" :src="attachmentPreviewUrl(attachment)" :alt="attachment.name" />
                    <span v-else><component :is="attachmentIcon(attachment.mediaType)" /></span>
                    <div><strong>{{ attachment.name }}</strong><small v-if="attachment.size > 0">{{ formatBytes(attachment.size) }}</small></div>
                    <FolderOpen />
                  </button>
                </div>
                <div class="message-actions">
                  <button type="button" :title="copiedMessageId === message.id ? t('agentOs.hermesMessageActions.copied') : t('agentOs.hermesMessageActions.copyMessage')" @click="copyMessage(message)"><Check v-if="copiedMessageId === message.id" /><Copy v-else /></button>
                  <button v-if="message.role === 'user'" type="button" :disabled="isStreaming || actionBusy" :title="t('agentOs.hermesMessageActions.editMessage')" @click="editMessage(message, index)"><Pencil /></button>
                  <button v-if="message.role === 'assistant'" type="button" :disabled="isStreaming || actionBusy" :title="t('agentOs.hermes.regenerate')" @click="regenerate(index)"><RotateCcw /></button>
                </div>
              </div>
            </article>

            <article v-if="isStreaming" class="message-row is-assistant">
              <span class="message-avatar"><Bot /></span>
              <div class="message-body is-streaming">
                <header><strong>{{ employeeName(selectedEmployeeId) }}</strong><LoaderCircle class="spin" /></header>
                <details v-if="streamingReasoning" class="reasoning" open><summary><BrainCircuit />{{ t('agentOs.hermes.reasoning') }}</summary><p>{{ safeHermesText(streamingReasoning) }}</p></details>
                <HermesMessageContent
                  v-if="streamingText"
                  :text="safeHermesText(streamingText)"
                  :copy-label="t('agentOs.hermesMessageActions.copyCode')"
                  :copied-label="t('agentOs.hermesMessageActions.copied')"
                  :open-link-label="t('agentOs.hermesMessageActions.openLink')"
                  @error="uiError = $event"
                  @open-link="openExternalLink"
                />
                <p v-else class="thinking-copy">{{ t('agentOs.message.thinking') }}</p>
              </div>
            </article>
          </section>

          <section v-if="pendingPrompt" class="prompt-band" :class="`is-${pendingPrompt.kind}`">
            <span><ShieldAlert v-if="pendingPrompt.kind === 'approval'" /><KeyRound v-else-if="pendingPrompt.kind === 'secret'" /><Terminal v-else-if="pendingPrompt.kind === 'sudo'" /><MessageSquarePlus v-else /></span>
            <div><strong>{{ pendingPrompt.title }}</strong><p>{{ pendingPrompt.detail }}</p></div>
            <div v-if="pendingPrompt.kind === 'approval'" class="prompt-actions">
              <button type="button" @click="respondPending('deny')">{{ t('agentOs.hermes.deny') }}</button>
              <button type="button" @click="respondPending('once')">{{ t('agentOs.hermes.allowOnce') }}</button>
              <button class="primary-button" type="button" @click="respondPending('session')">{{ t('agentOs.hermes.allowSession') }}</button>
            </div>
            <form v-else class="prompt-answer" @submit.prevent="respondPending(pendingAnswer)">
              <div v-if="pendingPrompt.choices?.length" class="choice-list">
                <button v-for="choice in pendingPrompt.choices" :key="choice" type="button" @click="respondPending(choice)">{{ choice }}</button>
              </div>
              <input v-model="pendingAnswer" :type="pendingPrompt.kind === 'clarification' ? 'text' : 'password'" autocomplete="off" />
              <button class="primary-button" type="submit" :disabled="!pendingAnswer">{{ t('agentOs.hermes.respond') }}</button>
            </form>
          </section>

          <section v-if="runHistoryOpen && conversationRuns.length" class="run-history-panel">
            <header>
              <div><History /><div><strong>{{ t('agentOs.runHistory.title') }}</strong><small>{{ t('agentOs.runHistory.subtitle', { count: conversationRuns.length }) }}</small></div></div>
              <button class="icon-button" type="button" :title="t('agentOs.runHistory.close')" @click="runHistoryOpen = false"><X /></button>
            </header>
            <nav class="run-filter-tabs" :aria-label="t('agentOs.runHistory.filterLabel')">
              <button v-for="filter in runStatusFilters" :key="filter" type="button" :class="{ 'is-active': runStatusFilter === filter }" @click="runStatusFilter = filter">{{ t(`agentOs.runHistory.filters.${filter}`) }}</button>
            </nav>
            <div v-if="filteredConversationRuns.length" class="run-history-list">
              <button v-for="run in filteredConversationRuns" :key="run.id" type="button" :class="['run-history-row', `is-${run.status}`, { 'is-selected': selectedRunId === run.id }]" :disabled="actionBusy" @click="selectConversationRun(run.id)">
                <span class="run-state-dot" />
                <span class="run-history-copy">
                  <strong>#{{ run.shortId }} <small>{{ t('agentOs.plan.version', { version: run.activeRevision }) }}</small></strong>
                  <span>{{ runRevision(run)?.summary || t('agentOs.runHistory.noSummary') }}</span>
                  <small>{{ formatTime(run.updatedAt || run.createdAt) }}<template v-if="run.artifactIds.length"> - {{ t('agentOs.runHistory.artifacts', { count: run.artifactIds.length }) }}</template><template v-if="run.warningCount"> - {{ t('agentOs.runHistory.warnings', { count: run.warningCount }) }}</template></small>
                  <small v-if="run.error" class="run-error-copy">{{ run.error }}</small>
                </span>
                <span class="run-status-label">{{ runStatusLabel(run.status) }}</span>
              </button>
            </div>
            <p v-else class="run-history-empty">{{ t('agentOs.runHistory.empty') }}</p>
          </section>

          <section v-if="runDetail" class="run-band">
            <header class="band-header">
              <div><strong>{{ t('agentOs.plan.title') }} #{{ runDetail.run.shortId }}</strong><small>{{ currentRevision?.summary }} - {{ runStatusLabel(runDetail.run.status) }}</small></div>
              <div class="run-header-actions">
                <button class="run-history-toggle" type="button" :class="{ 'is-active': runHistoryOpen }" :title="t('agentOs.runHistory.open')" @click="runHistoryOpen = !runHistoryOpen"><History /><span>{{ t('agentOs.runHistory.button') }}</span><small>{{ conversationRuns.length }}</small><span v-if="activeRunCount" class="active-run-indicator" /></button>
                <div v-if="runDetail.run.status === 'waiting_approval'" class="prompt-actions">
                  <button type="button" @click="approveRun(false)">{{ t('agentOs.run.reject') }}</button>
                  <button class="primary-button" type="button" @click="approveRun(true)">{{ t('agentOs.run.approve') }}</button>
                </div>
                <div v-else-if="['running', 'reviewing', 'paused'].includes(runDetail.run.status)" class="prompt-actions">
                  <button v-if="runDetail.run.status !== 'paused'" type="button" :disabled="actionBusy" @click="controlRun('pause')">{{ t('agentOs.run.pause') }}</button>
                  <button v-else-if="runDetail.recovery.canResume" type="button" :disabled="actionBusy" @click="controlRun('resume')">{{ t('agentOs.run.resume') }}</button>
                  <button type="button" :disabled="actionBusy" @click="controlRun('cancel')">{{ t('agentOs.run.cancel') }}</button>
                </div>
              </div>
            </header>
            <dl class="run-metrics">
              <div><dt>{{ t('agentOs.execution.status') }}</dt><dd>{{ runStatusLabel(runDetail.run.status) }}</dd></div>
              <div><dt>{{ t('agentOs.execution.duration') }}</dt><dd>{{ formatDuration(runDetail.run.startedAt, runDetail.run.completedAt) }}</dd></div>
              <div><dt>{{ t('agentOs.execution.attempts') }}</dt><dd>{{ runDetail.attempts.length }}</dd></div>
              <div><dt>{{ t('agentOs.execution.artifacts') }}</dt><dd>{{ runDetail.artifacts.length }}</dd></div>
              <div><dt>{{ t('agentOs.execution.warnings') }}</dt><dd>{{ runWarningCount }}</dd></div>
              <div><dt>{{ t('agentOs.execution.cost') }}</dt><dd>{{ runCostEntries.length ? runCostEntries.map((item) => `${item.key}: ${formatMetricValue(item.value)}`).join(' / ') : t('agentOs.execution.noCost') }}</dd></div>
            </dl>
            <div class="step-list">
              <article v-for="(step, index) in runDetail.steps" :key="step.id" :class="[`is-${step.status}`, { 'is-expanded': runStepExpanded(step.id) }]">
                <button class="step-summary" type="button" :disabled="!attemptsForStep(step.id).length" @click="toggleRunStep(step.id)">
                  <span>{{ index + 1 }}</span>
                  <div><strong>{{ step.title }}</strong><small>{{ step.error || runStatusLabel(step.status) }}<template v-if="step.repairCount"> - {{ t('agentOs.execution.repairs', { count: step.repairCount }) }}</template></small></div>
                  <small>{{ t('agentOs.execution.attemptCount', { count: attemptsForStep(step.id).length }) }}</small>
                  <ChevronDown v-if="attemptsForStep(step.id).length" />
                </button>
                <div v-if="runStepExpanded(step.id)" class="attempt-list">
                  <article v-for="attempt in attemptsForStep(step.id)" :key="attempt.id" :class="`is-${attempt.status}`">
                    <header>
                      <div><strong>{{ friendlyCapabilityName(attempt.capabilityId) }}</strong><small>{{ t('agentOs.execution.attemptVersion', { attempt: attempt.sequence, version: attempt.capabilityVersion }) }}</small></div>
                      <span>{{ runStatusLabel(attempt.result?.status || attempt.status) }}</span>
                    </header>
                    <dl>
                      <div><dt>{{ t('agentOs.execution.duration') }}</dt><dd>{{ formatDuration(attempt.createdAt, attempt.completedAt) }}</dd></div>
                      <div v-if="Object.keys(attempt.result?.cost || {}).length"><dt>{{ t('agentOs.execution.cost') }}</dt><dd>{{ Object.entries(attempt.result?.cost || {}).map(([key, value]) => `${key}: ${String(value)}`).join(' / ') }}</dd></div>
                    </dl>
                    <p v-if="attempt.result?.error" class="attempt-error">{{ attempt.result.error.message }}</p>
                    <ul v-if="attempt.result?.warnings.length" class="attempt-warnings"><li v-for="warning in attempt.result.warnings" :key="warning">{{ warning }}</li></ul>
                    <div v-if="safeExternalReferences(attempt).length" class="attempt-refs"><span v-for="reference in safeExternalReferences(attempt)" :key="`${reference.key}:${reference.value}`"><strong>{{ reference.key }}</strong>{{ reference.value }}</span></div>
                  </article>
                </div>
              </article>
            </div>
            <section class="run-review" :class="`is-${runReviewState()}`">
              <span><CheckCircle2 v-if="runReviewState() === 'passed'" /><AlertTriangle v-else-if="runReviewState() === 'needsAttention'" /><LoaderCircle v-else /></span>
              <div><strong>{{ t(`agentOs.review.${runReviewState()}`) }}</strong><small>{{ t('agentOs.review.deterministic') }}</small></div>
              <div v-if="runDetail.approvals.length" class="approval-ledger">
                <span v-for="approval in runDetail.approvals" :key="approval.id"><strong>{{ approval.status === 'approved' ? t('agentOs.execution.approved') : t('agentOs.execution.rejected') }}</strong>{{ t('agentOs.execution.approvalMeta', { version: approval.revision, channel: approval.channel, time: formatTime(approval.createdAt) }) }}</span>
              </div>
              <button v-if="runDetail.recovery.action === 'reconcile' || runDetail.recovery.action === 'diagnose'" class="run-recovery-action" type="button" :disabled="actionBusy || runtime.state !== 'ready'" @click="requestRunRecovery"><Wrench /><span><strong>{{ t('agentOs.recovery.action') }}</strong><small>{{ runDetail.recovery.reason || t('agentOs.recovery.hint') }}</small></span></button>
            </section>
            <section v-if="runDetail.events.length" class="run-timeline">
              <header>
                <div><strong>{{ t('agentOs.timeline.title') }}</strong><small>{{ t('agentOs.timeline.subtitle') }}</small></div>
                <button v-if="runDetail.events.length > 8" type="button" @click="showAllRunEvents = !showAllRunEvents">{{ showAllRunEvents ? t('agentOs.timeline.showRecent') : t('agentOs.timeline.showAll', { count: runDetail.events.length }) }}</button>
              </header>
              <div class="run-timeline-list">
                <article v-for="event in visibleRunEvents" :key="event.id">
                  <span class="run-timeline-dot" />
                  <div><strong>{{ runEventLabel(event.type) }}</strong><small v-if="runEventDetail(event)">{{ runEventDetail(event) }}</small></div>
                  <time>{{ formatTime(event.createdAt) }}</time>
                </article>
              </div>
            </section>
            <div v-if="runDetail.artifacts.length" class="artifact-list">
              <article v-for="artifact in runDetail.artifacts" :key="artifact.id">
                <button class="artifact-main" type="button" :disabled="!artifact.localPath" :title="t('agentOs.artifactActions.preview')" @click="previewArtifact(artifact)">
                  <img v-if="artifactMediaKind(artifact) === 'image' && artifactPreviewUrl(artifact)" :src="artifactPreviewUrl(artifact)" :alt="artifact.name" />
                  <Video v-else-if="artifactMediaKind(artifact) === 'video'" />
                  <FileImage v-else-if="artifactMediaKind(artifact) === 'image'" />
                  <FileText v-else />
                  <span><strong>{{ artifact.name }}</strong><small>{{ artifact.kind }}</small></span><Eye v-if="artifact.localPath" />
                </button>
                <div class="artifact-quick-actions">
                  <button type="button" :disabled="!artifact.localPath" :title="t('agentOs.artifactActions.open')" @click="openArtifact(artifact.id)"><FolderOpen /></button>
                  <button type="button" :disabled="!artifact.localPath || artifactActionBusy" :title="t('agentOs.artifactActions.saveAs')" @click="saveArtifact(artifact)"><Download /></button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <section v-if="activeQueuedPrompts.length" class="queue-band">
          <header><div><ListPlus /><strong>{{ t('agentOs.hermesUx.queueTitle') }}</strong></div><small>{{ t('agentOs.hermesUx.queueCount', { count: activeQueuedPrompts.length }) }}</small></header>
          <div class="queue-list">
            <article v-for="item in activeQueuedPrompts" :key="item.id">
              <div><strong>{{ messageText(item.text, item.attachments.length) }}</strong><small>{{ formatTime(item.createdAt) }} - {{ t('agentOs.hermesUx.queueAttachmentCount', { count: item.attachments.length }) }}</small></div>
              <button type="button" :title="t('agentOs.common.remove')" @click="queuedPrompts = queuedPrompts.filter((row) => row.id !== item.id)"><X /></button>
            </article>
          </div>
        </section>

        <div
          class="composer"
          :class="{ 'is-dragging': isDraggingFiles }"
          @dragenter.prevent="onAttachmentDragEnter"
          @dragover.prevent
          @dragleave.prevent="onAttachmentDragLeave"
          @drop.prevent="onAttachmentDrop"
        >
          <div v-if="isDraggingFiles" class="attachment-drop-overlay"><Paperclip /><strong>{{ t('agentOs.hermesUx.dropFiles') }}</strong></div>
          <section v-if="commandCenterOpen" ref="commandCenter" class="command-center" @keydown="onCommandKeydown">
            <header class="command-search">
              <Search />
              <input ref="commandSearch" v-model="commandQuery" type="search" :placeholder="t('agentOs.commandCatalog.search')" @input="commandSelection = 0" />
              <kbd>Esc</kbd>
            </header>
            <nav class="command-scopes" :aria-label="t('agentOs.businessCommandCatalog.scopeLabel')">
              <button
                v-for="scope in commandScopes"
                :key="scope"
                type="button"
                :data-command-scope="scope"
                :class="{ 'is-active': commandScope === scope && !commandQuery.trim() }"
                @click="selectCommandScope(scope)"
              >
                {{ t(`agentOs.businessCommandCatalog.scopes.${scope}`) }}
              </button>
            </nav>
            <div class="command-results">
              <section v-for="entry in commandGroups" :key="entry.group" class="command-group">
                <header><strong>{{ entry.label }}</strong><small>{{ entry.items.length }}</small></header>
                <button
                  v-for="item in entry.items"
                  :key="item.id"
                  type="button"
                  :data-command-id="item.id"
                  :data-command-group="item.group"
                  :class="{ 'is-selected': filteredCommandItems.indexOf(item) === commandSelection }"
                  @mouseenter="commandSelection = filteredCommandItems.indexOf(item)"
                  @click="selectCommand(item)"
                >
                  <span><component :is="item.icon" /></span>
                  <div><strong>{{ item.label }}</strong><small>{{ item.description }}</small></div>
                  <CornerDownRight />
                </button>
              </section>
              <div v-if="commandSkillsLoading" class="command-loading"><LoaderCircle class="spin" />{{ t('agentOs.commandCenter.loadingSkills') }}</div>
              <div v-if="!commandSkillsLoading && !filteredCommandItems.length" class="command-empty">{{ t('agentOs.commandCenter.empty') }}</div>
            </div>
            <footer><span><kbd>Up</kbd><kbd>Down</kbd>{{ t('agentOs.commandCenter.navigate') }}</span><span><kbd>Enter</kbd>{{ t('agentOs.commandCenter.select') }}</span></footer>
          </section>
          <div v-if="messageEdit" class="message-edit-band">
            <Pencil />
            <div><strong>{{ t('agentOs.hermesMessageActions.editingTitle') }}</strong><small>{{ t('agentOs.hermesMessageActions.editingHint') }}</small></div>
            <button type="button" :title="t('agentOs.hermesMessageActions.cancelEdit')" @click="cancelMessageEdit"><X /></button>
          </div>
          <div v-if="attachments.length" class="attachment-list">
            <article v-for="attachment in attachments" :key="attachment.id">
              <img v-if="attachment.mediaType === 'image'" :src="attachmentPreviewUrl(attachment)" :alt="attachment.name" />
              <span v-else><component :is="attachmentIcon(attachment.mediaType)" /></span>
              <div><strong>{{ attachment.name }}</strong><small>{{ formatBytes(attachment.size) }}</small></div>
              <button type="button" :title="t('agentOs.common.remove')" @click="attachments = attachments.filter((item) => item.id !== attachment.id)"><X /></button>
            </article>
          </div>
          <textarea ref="composer" v-model="prompt" :placeholder="isStreaming ? t('agentOs.hermesUx.queuePlaceholder') : t('agentOs.composer.placeholder')" rows="2" @keydown="onComposerKeydown" @paste="onComposerPaste"></textarea>
          <footer>
            <button class="icon-button command-button" type="button" :class="{ 'is-active': commandCenterOpen }" :title="t('agentOs.commandCenter.title')" @click="commandCenterOpen ? closeCommandCenter() : openCommandCenter()"><Command /></button>
            <button class="icon-button" type="button" :title="t('agentOs.composer.attach')" @click="pickAttachments"><Paperclip /></button>
            <span>{{ messageEdit ? t('agentOs.hermesMessageActions.editingSubmitHint') : isStreaming ? t('agentOs.hermesUx.queueHint') : t('agentOs.composer.hint') }}</span>
            <button v-if="isStreaming" class="steer-button" type="button" :disabled="!canSend" :title="t('agentOs.hermes.steerHint')" @click="submit('steer')"><CornerDownRight /></button>
            <button class="send-button" type="button" :disabled="!canSend" :title="isStreaming ? t('agentOs.hermesUx.addToQueue') : t('agentOs.composer.send')" @click="submit(isStreaming ? 'queue' : 'send')"><ListPlus v-if="isStreaming" /><Send v-else /></button>
          </footer>
        </div>
      </template>
    </main>

    <aside class="activity-rail" :class="{ 'is-open': activityRailOpen }">
      <header class="rail-header activity-rail-header">
        <div><strong>{{ t('agentOs.hermes.activity') }}</strong><small>{{ t('agentOs.hermes.activityHint') }}</small></div>
        <div class="activity-rail-actions">
          <span v-if="delegationStatus.active.length">{{ t('agentOs.hermesUx.activeSubagents', { count: delegationStatus.active.length }) }}</span>
          <button class="activity-control" type="button" :disabled="delegationControlBusy" :title="delegationStatus.paused ? t('agentOs.hermesUx.resumeDelegation') : t('agentOs.hermesUx.pauseDelegation')" @click="toggleDelegationPaused"><Play v-if="delegationStatus.paused" /><Pause v-else /></button>
          <button class="activity-rail-close" type="button" :title="t('agentOs.common.close')" @click="activityRailOpen = false"><X /></button>
        </div>
      </header>
      <div v-if="activityCards.length" class="activity-list activity-rail-list">
        <article v-for="card in activityCards" :key="card.id" class="activity-row" :class="[`is-${card.kind}`, `is-${card.status}`]" :style="{ '--activity-depth': String(card.depth) }">
          <div class="activity-summary">
            <span class="activity-icon"><component :is="activityIcon(card)" /></span>
            <button class="activity-main" type="button" :disabled="!card.sections.length" @click="toggleActivity(card.id)">
              <strong>{{ card.title }}</strong>
              <small>{{ card.detail || card.eventType }}<template v-if="card.durationSeconds"> - {{ card.durationSeconds.toFixed(1) }}s</template></small>
            </button>
            <span class="activity-status"><LoaderCircle v-if="card.status === 'running'" class="spin" /><AlertTriangle v-else-if="card.status === 'failed'" /><Check v-else /></span>
            <button v-if="card.kind === 'subagent' && card.status === 'running' && card.subagentId" class="activity-control" type="button" :disabled="interruptingSubagentId === card.subagentId" :title="t('agentOs.hermesUx.stopSubagent')" @click="interruptSubagent(card.subagentId)"><CircleStop /></button>
            <button v-if="card.kind === 'background' && card.status === 'running' && card.processId" class="activity-control" type="button" :disabled="stoppingProcessId === card.processId" :title="t('agentOs.hermesUx.stopBackground')" @click="stopBackgroundProcess(card.processId)"><CircleStop /></button>
            <button v-if="card.sections.length" class="activity-control activity-expand" :class="{ 'is-expanded': activityExpanded(card.id) }" type="button" :title="t('agentOs.hermesActivityActions.details')" @click="toggleActivity(card.id)"><ChevronDown /></button>
          </div>
          <div v-if="card.sections.length && activityExpanded(card.id)" class="activity-details">
            <section v-for="section in card.sections" :key="section.id">
              <header><strong>{{ section.label }}</strong><button type="button" :title="copiedActivitySectionId === `${card.id}:${section.id}` ? t('agentOs.hermesMessageActions.copied') : t('agentOs.hermesMessageActions.copyMessage')" @click="copyActivitySection(card.id, section)"><Check v-if="copiedActivitySectionId === `${card.id}:${section.id}`" /><Copy v-else /></button></header>
              <pre>{{ section.text }}</pre>
            </section>
          </div>
        </article>
      </div>
      <div v-else class="activity-empty"><BrainCircuit /><strong>{{ t('agentOs.hermes.activity') }}</strong><small>{{ t('agentOs.hermes.activityHint') }}</small></div>
    </aside>

    <div v-if="sessionDialogTarget && sessionDialogMode" class="modal-backdrop" @click.self="closeSessionDialog()">
      <form class="session-modal" @submit.prevent="sessionDialogMode === 'rename' ? renameSession() : deleteSession()">
        <header>
          <div><strong>{{ t(`agentOs.sessionActions.${sessionDialogMode}Title`) }}</strong><small>{{ sessionDialogTarget.title || t('agentOs.hermes.untitled') }}</small></div>
          <button class="icon-button" type="button" :disabled="sessionActionBusy" :title="t('agentOs.common.close')" @click="closeSessionDialog()"><X /></button>
        </header>
        <label v-if="sessionDialogMode === 'rename'"><span>{{ t('agentOs.sessionActions.name') }}</span><input v-model.trim="sessionTitleDraft" maxlength="120" autofocus /></label>
        <p v-else class="session-delete-copy">{{ t('agentOs.sessionActions.deleteConfirm') }}</p>
        <footer>
          <button type="button" :disabled="sessionActionBusy" @click="closeSessionDialog()">{{ t('agentOs.common.cancel') }}</button>
          <button v-if="sessionDialogMode === 'rename'" class="primary-button" type="submit" :disabled="sessionActionBusy || !sessionTitleDraft.trim()"><Check />{{ t('agentOs.sessionActions.rename') }}</button>
          <button v-else class="danger-button" type="submit" :disabled="sessionActionBusy"><Trash2 />{{ t('agentOs.sessionActions.delete') }}</button>
        </footer>
      </form>
    </div>

    <div v-if="selectedArtifact" class="modal-backdrop" @click.self="selectedArtifact = null">
      <section class="artifact-modal">
        <header>
          <div><strong>{{ selectedArtifact.name }}</strong><small>{{ t(`agentOs.artifactKind.${selectedArtifact.kind}`, selectedArtifact.kind) }}</small></div>
          <button class="icon-button" type="button" :title="t('agentOs.common.close')" @click="selectedArtifact = null"><X /></button>
        </header>
        <div class="artifact-preview-stage">
          <img v-if="artifactMediaKind(selectedArtifact) === 'image'" :src="artifactPreviewUrl(selectedArtifact)" :alt="selectedArtifact.name" />
          <video v-else-if="artifactMediaKind(selectedArtifact) === 'video'" :src="artifactPreviewUrl(selectedArtifact)" controls preload="metadata"></video>
          <audio v-else-if="artifactMediaKind(selectedArtifact) === 'audio'" :src="artifactPreviewUrl(selectedArtifact)" controls preload="metadata"></audio>
          <div v-else class="artifact-file-preview"><FileText /><strong>{{ selectedArtifact.name }}</strong><small>{{ selectedArtifact.localPath || selectedArtifact.uri }}</small></div>
        </div>
        <dl v-if="selectedArtifact.media || selectedArtifact.metadata" class="artifact-metadata">
          <template v-for="(value, key) in { ...(selectedArtifact.media || {}), ...(selectedArtifact.metadata || {}) }" :key="String(key)">
            <dt>{{ key }}</dt><dd>{{ activityValueText(value) }}</dd>
          </template>
        </dl>
        <footer>
          <button type="button" :disabled="!selectedArtifact.localPath" @click="revealArtifact(selectedArtifact)"><FolderOpen />{{ t('agentOs.artifactActions.reveal') }}</button>
          <button type="button" :disabled="!selectedArtifact.localPath" @click="openArtifact(selectedArtifact.id)"><Eye />{{ t('agentOs.artifactActions.open') }}</button>
          <button class="primary-button" type="button" :disabled="!selectedArtifact.localPath || artifactActionBusy" @click="saveArtifact(selectedArtifact)"><Download />{{ t('agentOs.artifactActions.saveAs') }}</button>
        </footer>
      </section>
    </div>

    <div v-if="employeeDraft" class="modal-backdrop" @click.self="employeeDraft = null">
      <form class="employee-modal" @submit.prevent="saveEmployee">
        <header><div><strong>{{ employeeDraft.id ? t('agentOs.employeeEditor.editTitle') : t('agentOs.employeeEditor.createTitle') }}</strong><small>{{ t('agentOs.employeeEditor.subtitle') }}</small></div><button class="icon-button" type="button" @click="employeeDraft = null"><X /></button></header>
        <label><span>{{ t('agentOs.employeeEditor.name') }}</span><input v-model="employeeDraft.name" maxlength="48" /></label>
        <label><span>{{ t('agentOs.employeeEditor.description') }}</span><textarea v-model="employeeDraft.description" rows="2"></textarea></label>
        <label><span>{{ t('agentOs.employeeEditor.plannerPolicy') }}</span><textarea v-model="employeeDraft.plannerPolicy" rows="3"></textarea></label>
        <label><span>{{ t('agentOs.employeeEditor.reviewerPolicy') }}</span><textarea v-model="employeeDraft.reviewerPolicy" rows="3"></textarea></label>
        <footer><button type="button" @click="employeeDraft = null">{{ t('agentOs.common.cancel') }}</button><button class="primary-button" type="submit" :disabled="!employeeDraft.name.trim()"><Check />{{ t('agentOs.common.save') }}</button></footer>
      </form>
    </div>

    <div v-if="modelPanelOpen" class="modal-backdrop" @click.self="modelPanelOpen = false">
      <form class="model-modal" @submit.prevent="saveModelSettings">
        <header>
          <div><strong>{{ t('agentOs.hermes.modelSettings.title') }}</strong><small>{{ t('agentOs.hermes.modelSettings.subtitle') }}</small></div>
          <button class="icon-button" type="button" :title="t('agentOs.common.close')" @click="modelPanelOpen = false"><X /></button>
        </header>

        <div v-if="modelBusy && !modelOptions" class="model-loading"><LoaderCircle class="spin" />{{ t('agentOs.common.loading') }}</div>
        <template v-else>
          <label>
            <span>{{ t('agentOs.hermes.modelSettings.provider') }}</span>
            <select :value="modelProvider" @change="selectModelProvider(($event.target as HTMLSelectElement).value)">
              <option v-for="provider in modelProviders" :key="provider.slug" :value="provider.slug">{{ provider.slug.includes('videogenerate-bridge') ? t('agentOs.hermesModelActions.useApplicationModel') : provider.name }}</option>
            </select>
          </label>

          <div class="model-auth-state" :class="{ 'is-ready': selectedModelProvider?.authenticated || (modelProvider === 'custom' && modelOptions?.custom.apiKeyConfigured) }">
            <CheckCircle2 v-if="selectedModelProvider?.authenticated || (modelProvider === 'custom' && modelOptions?.custom.apiKeyConfigured)" />
            <KeyRound v-else />
            <div>
              <strong>{{ selectedModelProvider?.authenticated || (modelProvider === 'custom' && modelOptions?.custom.apiKeyConfigured) ? t('agentOs.hermes.modelSettings.authenticated') : t('agentOs.hermes.modelSettings.authenticationRequired') }}</strong>
              <small>{{ selectedModelProvider?.warning || t('agentOs.hermes.modelSettings.localSecret') }}</small>
            </div>
          </div>

          <label v-if="modelProvider === 'custom'">
            <span>{{ t('agentOs.hermes.modelSettings.endpoint') }}</span>
            <input v-model="customBaseUrl" type="url" autocomplete="off" placeholder="https://api.example.com/v1" />
          </label>

          <label>
            <span>{{ t('agentOs.hermes.modelSettings.model') }}</span>
            <input v-if="modelProvider === 'custom'" v-model="modelName" autocomplete="off" />
            <select v-else v-model="modelName">
              <option v-for="model in selectedModelProvider?.models || []" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>

          <label v-if="modelProvider === 'custom' || selectedModelProvider?.authType === 'api_key'">
            <span>{{ t('agentOs.hermes.modelSettings.apiKey') }}</span>
            <input v-model="modelApiKey" type="password" autocomplete="new-password" :placeholder="selectedModelProvider?.authenticated || modelOptions?.custom.apiKeyConfigured ? t('agentOs.hermes.modelSettings.keepExistingKey') : t('agentOs.hermes.modelSettings.enterKey')" />
          </label>

          <p v-if="selectedModelProvider && selectedModelProvider.authType && selectedModelProvider.authType !== 'api_key' && !selectedModelProvider.authenticated" class="model-notice">
            {{ t('agentOs.hermes.modelSettings.oauthUnavailable') }}
          </p>
          <p v-if="modelError" class="model-feedback is-error"><AlertTriangle />{{ modelError }}</p>
          <p v-if="modelSuccess" class="model-feedback is-success"><CheckCircle2 />{{ modelSuccess }}</p>
        </template>

        <footer>
          <button type="button" :disabled="modelBusy || modelTesting" @click="useApplicationModel"><Sparkles />{{ t('agentOs.hermesModelActions.useApplicationModel') }}</button>
          <button v-if="modelProvider !== 'custom' && selectedModelProvider?.authenticated" type="button" :disabled="modelBusy || modelTesting" @click="disconnectModelProvider"><Unplug />{{ t('agentOs.hermes.modelSettings.disconnect') }}</button>
          <span></span>
          <button type="button" :disabled="modelBusy || modelTesting" @click="testModelConnection"><PlugZap />{{ modelTesting ? t('agentOs.hermes.modelSettings.testing') : t('agentOs.hermes.modelSettings.test') }}</button>
          <button class="primary-button" type="submit" :disabled="modelBusy || modelTesting || !modelName.trim() || (modelProvider === 'custom' && !customBaseUrl.trim())"><Check />{{ t('agentOs.hermes.modelSettings.save') }}</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.hermes-workspace {
  --surface: var(--theme-panel);
  --surface-soft: var(--theme-panel-soft);
  --input: var(--theme-input);
  --border: var(--theme-border);
  --control-border: var(--theme-border-control);
  --text: var(--theme-text);
  --text-secondary: var(--theme-text-secondary);
  --text-muted: var(--theme-text-muted);
  --accent: var(--theme-accent);
  position: relative;
  display: grid;
  grid-template-columns: 210px minmax(360px, 1fr) 300px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
}
button, input, textarea { font: inherit; }
button { color: inherit; }
.session-rail, .activity-rail { display: flex; min-width: 0; min-height: 0; flex-direction: column; background: color-mix(in srgb, var(--surface-soft) 94%, var(--surface)); }
.session-rail { border-right: 1px solid var(--border); }
.activity-rail { border-left: 1px solid var(--border); }
.rail-header, .surface-header, .band-header, .employee-modal > header, .model-modal > header, .artifact-modal > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.rail-header { min-height: 68px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.rail-header > div, .surface-title > div, .runtime-block > div, .employee-modal > header > div, .model-modal > header > div { display: grid; min-width: 0; gap: 3px; }
strong { font-weight: 650; }
small { color: var(--text-muted); font-size: 10px; }
.icon-button, .mini-button, .send-button { display: inline-grid; flex: 0 0 auto; place-items: center; border: 1px solid var(--control-border); border-radius: 6px; background: var(--theme-control); }
.icon-button { width: 32px; height: 32px; }
.mini-button { width: 25px; height: 25px; border-color: transparent; background: transparent; }
.icon-button svg, .mini-button svg, .send-button svg { width: 15px; height: 15px; }
.icon-button:hover:not(:disabled), .mini-button:hover:not(:disabled) { background: var(--theme-control-hover); }
button:disabled { cursor: not-allowed; opacity: .45; }
.session-list { display: grid; min-height: 0; flex: 1; grid-auto-rows: max-content; align-content: start; gap: 3px; overflow-y: auto; padding: 8px; }
.employee-list { display: grid; min-height: 0; grid-auto-rows: max-content; align-content: start; gap: 3px; overflow-y: auto; padding: 6px 7px 8px; }
.session-search { display: flex; height: 32px; align-items: center; gap: 6px; margin: 8px 8px 2px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--input); color: var(--text-muted); }
.session-search > svg { width: 13px; flex: 0 0 auto; }
.session-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 11px; }
.session-search button { display: grid; width: 18px; height: 18px; place-items: center; border: 0; background: transparent; color: var(--text-muted); }
.session-search button svg { width: 12px; }
.session-row { position: relative; display: grid; min-height: 50px; grid-template-columns: minmax(0, 1fr) 27px; width: 100%; align-items: center; gap: 2px; padding: 3px; border: 1px solid transparent; border-left: 2px solid transparent; border-radius: 6px; background: transparent; text-align: left; }
.session-row:hover { border-color: var(--control-border); background: color-mix(in srgb, var(--surface) 72%, transparent); }
.session-row.is-active { border-color: color-mix(in srgb, var(--accent) 28%, var(--control-border)); border-left-color: var(--accent); background: var(--surface); }
.session-select { display: grid; grid-template-columns: 31px minmax(0, 1fr) 16px; min-width: 0; align-items: center; gap: 8px; padding: 5px 4px; border: 0; background: transparent; text-align: left; }
.session-select > span:nth-child(2) { display: grid; min-width: 0; gap: 3px; }
.session-needs-input { display: grid; width: 16px; height: 16px; place-items: center; color: var(--theme-warning-text); }
.session-needs-input svg { width: 14px; height: 14px; }
.session-switching { display: grid; width: 16px; height: 16px; place-items: center; color: var(--accent); }
.session-switching svg { width: 14px; height: 14px; }
.session-row.is-switching { border-color: color-mix(in srgb, var(--accent) 38%, var(--control-border)); }
.session-row strong, .session-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-menu-trigger { display: grid; width: 27px; height: 27px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); opacity: 0; }
.session-row:hover .session-menu-trigger, .session-row.is-active .session-menu-trigger, .session-menu-trigger:focus-visible { opacity: 1; }
.session-menu-trigger:hover { background: var(--theme-control-hover); color: var(--text); }
.session-menu-trigger svg { width: 14px; }
.session-menu { position: absolute; z-index: 20; top: 31px; right: 3px; display: grid; width: 116px; padding: 4px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--surface); box-shadow: 0 10px 28px color-mix(in srgb, var(--theme-root) 28%, transparent); }
.session-menu button { display: flex; min-height: 30px; align-items: center; gap: 7px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; font-size: 11px; text-align: left; }
.session-menu button:hover:not(:disabled) { background: var(--theme-control-hover); }
.session-menu button.is-danger { color: var(--theme-danger-text); }
.session-menu svg { width: 13px; }
.session-icon, .employee-avatar { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 6px; background: color-mix(in srgb, var(--accent) 12%, var(--surface)); color: var(--accent); }
.session-icon svg, .employee-avatar svg { width: 15px; }
.empty-copy { padding: 20px 8px; color: var(--text-muted); font-size: 11px; text-align: center; }
.runtime-block { display: grid; min-height: 58px; grid-template-columns: 9px minmax(0, 1fr) 30px; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); background: var(--surface); }
.runtime-block small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.runtime-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); }
.runtime-block.is-ready .runtime-dot { background: var(--theme-success); }
.runtime-block.is-starting .runtime-dot { background: var(--theme-warning); }
.runtime-block.is-error .runtime-dot { background: var(--theme-danger); }
.employee-dock { display: flex; min-height: 132px; max-height: 260px; flex: 0 1 250px; flex-direction: column; border-top: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 46%, var(--surface-soft)); }
.employee-dock > header { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 7px; padding: 7px 10px; border-bottom: 1px solid var(--border); }
.employee-dock > header > div { display: grid; min-width: 0; gap: 1px; }
.employee-dock > header strong { font-size: 11px; }
.employee-dock .employee-row { padding: 5px; border-color: transparent; border-left: 2px solid transparent; background: transparent; }
.employee-dock .employee-row:hover { border-color: var(--control-border); background: color-mix(in srgb, var(--surface) 72%, transparent); }
.employee-dock .employee-row.is-active { border-color: color-mix(in srgb, var(--accent) 24%, var(--control-border)); border-left-color: var(--employee-color, var(--accent)); background: var(--surface); }
.employee-dock .employee-main { min-height: 36px; grid-template-columns: 31px minmax(0, 1fr); gap: 8px; }
.employee-dock .employee-avatar { width: 31px; height: 31px; }
.employee-dock .employee-actions { justify-content: flex-start; gap: 3px; margin: 5px 0 0 39px; padding-top: 4px; border-top: 1px solid var(--border); opacity: 0; }
.employee-dock .employee-row:hover .employee-actions, .employee-dock .employee-row.is-active .employee-actions, .employee-dock .employee-actions:focus-within { opacity: 1; }
.conversation-surface { position: relative; display: flex; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; border-radius: 0 !important; background: var(--surface) !important; }
.surface-header { min-height: 64px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.surface-title { display: flex; min-width: 0; align-items: center; gap: 9px; }
.surface-title > span { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 6px; background: color-mix(in srgb, var(--accent) 12%, var(--surface)); color: var(--accent); }
.surface-title svg { width: 17px; }
.surface-actions { display: flex; align-items: center; gap: 6px; }
.activity-rail-trigger { position: relative; display: none; }
.activity-rail-trigger.is-active { border-color: var(--accent); color: var(--accent); }
.activity-rail-trigger small { position: absolute; top: -5px; right: -5px; display: grid; min-width: 16px; height: 16px; place-items: center; border: 1px solid var(--surface); border-radius: 8px; background: var(--accent); padding: 0 4px; color: var(--theme-on-accent); font-size: 8px; }
.model-field, .browser-field { display: flex; height: 32px; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--input); text-align: left; }
.model-field { width: 150px; }
.browser-field { max-width: 150px; color: var(--text-secondary); }
.model-field svg, .browser-field svg { width: 13px; flex: 0 0 auto; color: var(--text-muted); }
.model-field span, .browser-field span { min-width: 0; overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.browser-field.is-connected { border-color: color-mix(in srgb, var(--theme-success) 65%, var(--control-border)); }
.browser-field.is-connected svg { color: var(--theme-success); }
.stop-button, .primary-button, .prompt-actions button, .prompt-answer button, .employee-modal footer button { display: inline-flex; min-height: 31px; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--theme-control); }
.stop-button { color: var(--theme-danger-text); }
.stop-button svg, .primary-button svg { width: 14px; }
.primary-button { border-color: var(--accent) !important; background: var(--accent) !important; color: var(--theme-on-accent) !important; }
.conversation-scroll { min-height: 0; flex: 1; overflow-y: auto; }
.idle-state, .runtime-gate { display: flex; min-height: 100%; align-items: center; justify-content: center; flex-direction: column; padding: 40px; text-align: center; }
.idle-mark { display: grid; width: 48px; height: 48px; place-items: center; border: 1px solid var(--control-border); border-radius: 8px; color: var(--accent); }
.idle-mark svg { width: 24px; }
.idle-state h1, .runtime-gate h1 { margin: 15px 0 5px; font-size: 20px; letter-spacing: 0; }
.idle-state p, .runtime-gate p { max-width: 520px; margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.starter-command-grid { display: grid; width: min(620px, 100%); grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 20px; }
.starter-command-grid button { display: grid; min-width: 0; min-height: 52px; grid-template-columns: 28px minmax(0, 1fr) 16px; align-items: center; gap: 7px; padding: 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); text-align: left; transition: border-color 140ms ease, background 140ms ease; }
.starter-command-grid button:hover { border-color: var(--accent); background: var(--surface-raised); }
.starter-command-grid button > span { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 5px; background: color-mix(in srgb, var(--accent) 13%, var(--surface-raised)); color: var(--accent); }
.starter-command-grid svg { width: 14px; height: 14px; }
.starter-command-grid button > svg { color: var(--text-muted); }
.starter-command-grid strong { min-width: 0; overflow-wrap: anywhere; font-size: 11px; letter-spacing: 0; }
.runtime-gate details { width: min(620px, 100%); margin-top: 18px; text-align: left; }
.runtime-gate pre { max-height: 180px; overflow: auto; padding: 10px; border: 1px solid var(--border); background: var(--surface-soft); color: var(--text-secondary); font-size: 10px; white-space: pre-wrap; }
.message-stream { width: min(780px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 10px; }
.message-row { display: grid; grid-template-columns: 31px minmax(0, 1fr); gap: 10px; padding: 12px 0; }
.message-avatar { display: grid; width: 31px; height: 31px; place-items: center; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-soft); color: var(--text-secondary); }
.message-row.is-assistant .message-avatar { color: var(--accent); }
.message-avatar svg { width: 16px; }
.message-body { position: relative; min-width: 0; padding-right: 58px; color: var(--text); }
.message-body > header { display: flex; min-height: 24px; align-items: center; gap: 8px; }
.message-body > header svg { width: 14px; color: var(--accent); }
.message-row.is-user { width: min(86%, 680px); grid-template-columns: minmax(0, 1fr) 31px; margin-left: auto; }
.message-row.is-user .message-avatar { grid-column: 2; grid-row: 1; border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); color: var(--accent); }
.message-row.is-user .message-body { grid-column: 1; grid-row: 1; width: fit-content; max-width: 100%; min-width: 132px; justify-self: end; padding: 8px 11px 9px; border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border)); border-radius: 7px; background: color-mix(in srgb, var(--accent) 9%, var(--surface)); color: var(--text); }
.message-row.is-user .message-body > header { justify-content: flex-end; }
.message-row.is-user .message-attachment-list { justify-content: flex-end; }
.message-row.is-user .message-actions { right: auto; left: -58px; }
.message-attachment-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.message-attachment-list > button { display: grid; width: min(230px, 100%); min-height: 46px; grid-template-columns: 38px minmax(0, 1fr) 15px; align-items: center; gap: 7px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); text-align: left; }
.message-attachment-list > button:hover:not(:disabled) { border-color: var(--accent); background: var(--surface-raised); }
.message-attachment-list > button > img, .message-attachment-list > button > span { width: 38px; height: 38px; border-radius: 4px; object-fit: cover; }
.message-attachment-list > button > span { display: grid; place-items: center; background: var(--surface-raised); color: var(--text-muted); }
.message-attachment-list > button > span svg { width: 16px; }
.message-attachment-list > button > div { min-width: 0; }
.message-attachment-list > button > svg { width: 14px; color: var(--text-muted); }
.message-attachment-list strong, .message-attachment-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.message-attachment-list strong { font-size: 10px; }
.message-attachment-list small { margin-top: 2px; color: var(--text-muted); font-size: 9px; }
.message-actions { position: absolute; top: 0; right: 0; display: flex; gap: 2px; opacity: 0; transition: opacity 120ms ease; }
.message-body:hover .message-actions, .message-actions:focus-within { opacity: 1; }
.message-actions button { display: grid; width: 25px; height: 25px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); }
.message-actions button:hover { background: var(--theme-control-hover); color: var(--text); }
.message-actions button:disabled { cursor: not-allowed; opacity: .4; }
.message-actions svg { width: 13px; }
.reasoning { margin: 5px 0; color: var(--text-secondary); font-size: 11px; }
.reasoning summary { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; color: var(--text-muted); }
.reasoning summary svg { width: 13px; }
.reasoning p { margin: 6px 0; padding-left: 10px; border-left: 2px solid var(--border); white-space: pre-wrap; }
.thinking-copy { color: var(--text-muted) !important; }
.prompt-band, .run-band, .run-history-panel { width: min(780px, calc(100% - 32px)); margin: 10px auto; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--surface-soft); }
.prompt-band { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: start; gap: 8px 10px; padding: 12px; }
.prompt-band > span { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 6px; background: color-mix(in srgb, var(--theme-warning) 15%, var(--surface)); color: var(--theme-warning-text); }
.prompt-band > span svg { width: 16px; }
.prompt-band > div:nth-child(2) { min-width: 0; padding-top: 1px; }
.prompt-band > div:nth-child(2) strong { display: block; font-size: 12px; line-height: 1.4; }
.prompt-band p { margin: 3px 0 0; color: var(--text-secondary); font-size: 11px; }
.prompt-band > .prompt-actions, .prompt-band > .prompt-answer { grid-column: 2; }
.prompt-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.prompt-answer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px; }
.prompt-answer input { width: 100%; min-width: 0; height: 31px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--input); padding: 0 8px; color: var(--text); outline: 0; }
.choice-list { display: flex; flex-wrap: wrap; gap: 5px; }
.prompt-answer .choice-list { grid-column: 1 / -1; }
.run-band { padding: 12px; }
.run-band > .band-header > div:first-child { display: grid; min-width: 0; flex: 1; gap: 2px; }
.run-band > .band-header > div:first-child > strong, .run-band > .band-header > div:first-child > small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
.run-history-toggle { position: relative; display: inline-flex; min-height: 31px; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--theme-control); color: var(--text-secondary); white-space: nowrap; }
.run-history-toggle:hover, .run-history-toggle.is-active { border-color: var(--accent); background: var(--theme-control-hover); color: var(--text); }
.run-history-toggle > svg { width: 14px; }
.run-history-toggle > small { display: grid; min-width: 17px; height: 17px; place-items: center; border-radius: 4px; background: var(--surface); color: var(--text-muted); font-size: 9px; }
.active-run-indicator { position: absolute; top: 3px; right: 3px; width: 5px; height: 5px; border-radius: 50%; background: var(--theme-warning); }
.run-history-panel { position: absolute; z-index: 35; top: 74px; right: 16px; bottom: 78px; left: 16px; display: flex; width: auto; min-height: 0; flex-direction: column; margin: 0 auto; overflow: hidden; border: 1px solid var(--control-border); border-radius: 7px; background: var(--surface); box-shadow: 0 18px 42px color-mix(in srgb, var(--theme-root) 38%, transparent); }
.run-history-panel > header { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.run-history-panel > header > div { display: flex; min-width: 0; align-items: center; gap: 8px; }
.run-history-panel > header > div > svg { width: 16px; color: var(--accent); }
.run-history-panel > header > div > div { display: grid; min-width: 0; gap: 2px; }
.run-filter-tabs { display: flex; gap: 2px; padding: 6px 8px; overflow-x: auto; border-bottom: 1px solid var(--border); }
.run-filter-tabs button { min-height: 28px; padding: 0 9px; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); font-size: 10px; white-space: nowrap; }
.run-filter-tabs button:hover { background: var(--theme-control-hover); color: var(--text); }
.run-filter-tabs button.is-active { background: var(--theme-control); color: var(--accent); }
.run-history-list { display: grid; min-height: 0; flex: 1; align-content: start; overflow-y: auto; padding: 4px 8px 8px; }
.run-history-row { display: grid; width: 100%; grid-template-columns: 8px minmax(0, 1fr) max-content; align-items: center; gap: 8px; padding: 8px 6px; border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); text-align: left; }
.run-history-row:last-child { border-bottom: 0; }
.run-history-row:hover, .run-history-row.is-selected { background: var(--surface); }
.run-history-row.is-selected { box-shadow: inset 2px 0 0 var(--accent); }
.run-state-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); }
.run-history-row.is-running .run-state-dot, .run-history-row.is-reviewing .run-state-dot, .run-history-row.is-planning .run-state-dot { background: var(--accent); }
.run-history-row.is-waiting_approval .run-state-dot, .run-history-row.is-paused .run-state-dot { background: var(--theme-warning); }
.run-history-row.is-completed .run-state-dot { background: var(--theme-success); }
.run-history-row.is-failed .run-state-dot, .run-history-row.is-cancelled .run-state-dot { background: var(--theme-danger); }
.run-history-copy { display: grid; min-width: 0; gap: 2px; }
.run-history-copy > strong { display: flex; min-width: 0; align-items: baseline; gap: 6px; font-size: 11px; }
.run-history-copy > span, .run-history-copy > small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-history-copy > span { color: var(--text-secondary); font-size: 10px; }
.run-error-copy { color: var(--theme-danger-text) !important; }
.run-status-label { padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font-size: 9px; white-space: nowrap; }
.run-history-empty { margin: 0; padding: 24px; color: var(--text-muted); font-size: 11px; text-align: center; }
.activity-rail-header { align-items: flex-start; }
.activity-rail-header > div:first-child { display: grid; min-width: 0; gap: 3px; }
.activity-rail-actions { display: flex; align-items: center; gap: 4px; }
.activity-rail-actions > span { padding: 2px 5px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); border-radius: 4px; color: var(--accent); font-size: 8px; white-space: nowrap; }
.activity-rail-close { display: none; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); }
.activity-rail-close:hover { background: var(--theme-control-hover); color: var(--text); }
.activity-rail-close svg { width: 13px; }
.activity-rail-list { min-height: 0; flex: 1; overflow-y: auto; padding: 8px; }
.activity-empty { display: grid; min-height: 0; flex: 1; place-content: center; justify-items: center; gap: 5px; padding: 20px; color: var(--text-muted); text-align: center; }
.activity-empty > svg { width: 24px; margin-bottom: 3px; color: var(--accent); }
.activity-empty strong { color: var(--text-secondary); font-size: 11px; }
.activity-empty small { max-width: 210px; line-height: 1.5; }
.activity-list { display: grid; grid-auto-rows: max-content; align-content: start; gap: 6px; }
.activity-row { min-width: 0; margin-left: calc(min(var(--activity-depth), 4) * 10px); overflow: hidden; border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: 6px; background: color-mix(in srgb, var(--surface) 84%, transparent); }
.activity-row.is-running { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.activity-row.is-failed { border-left-color: var(--danger); background: color-mix(in srgb, var(--danger) 5%, var(--surface)); }
.activity-row.is-completed { border-left-color: var(--theme-success); }
.activity-summary { display: grid; min-height: 50px; grid-template-columns: 29px minmax(0, 1fr) 22px auto auto; align-items: center; gap: 6px; padding: 6px 7px; }
.activity-icon { display: grid; width: 29px; height: 29px; place-items: center; border-radius: 5px; background: var(--surface-raised); color: var(--text-muted); }
.activity-row svg { width: 13px; }
.activity-main { display: grid; min-width: 0; gap: 3px; padding: 0; border: 0; background: transparent; color: var(--text); text-align: left; }
.activity-main:disabled { cursor: default; opacity: 1; }
.activity-main strong { overflow: hidden; font-size: 10px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.activity-main small { overflow: hidden; color: var(--text-muted); font-size: 9px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.activity-status { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 5px; background: var(--surface-raised); color: var(--text-muted); }
.activity-row.is-running .activity-status { color: var(--accent); }
.activity-row.is-completed .activity-status { color: var(--theme-success); }
.activity-row.is-failed .activity-status { color: var(--danger); }
.activity-control { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text-muted); }
.activity-control:hover { border-color: var(--accent); color: var(--text); }
.activity-expand svg { transition: transform 140ms ease; }
.activity-expand.is-expanded svg { transform: rotate(180deg); }
.activity-details { display: grid; gap: 6px; padding: 0 7px 8px 42px; }
.activity-details section { min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); }
.activity-details section > header { display: flex; min-height: 27px; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 7px; border-bottom: 1px solid var(--border); color: var(--text-secondary); }
.activity-details section > header strong { font-size: 9px; letter-spacing: 0; }
.activity-details section > header button { display: grid; width: 20px; height: 20px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); }
.activity-details section > header button:hover { background: var(--theme-control-hover); color: var(--text); }
.activity-details pre { max-height: 240px; margin: 0; overflow: auto; padding: 8px; color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.run-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 10px 0 0; border-top: 1px solid var(--border); border-left: 1px solid var(--border); }
.run-metrics > div { display: grid; min-width: 0; gap: 2px; padding: 7px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.run-metrics dt { color: var(--text-muted); font-size: 9px; }
.run-metrics dd { min-width: 0; overflow: hidden; margin: 0; color: var(--text-secondary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.step-list { display: grid; gap: 4px; margin-top: 10px; }
.step-list > article { overflow: hidden; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); }
.step-summary { display: grid; width: 100%; min-height: 42px; grid-template-columns: 24px minmax(0, 1fr) max-content 18px; align-items: center; gap: 7px; padding: 5px 7px; border: 0; background: transparent; color: var(--text); text-align: left; }
.step-summary:hover:not(:disabled) { background: var(--theme-control-hover); }
.step-summary:disabled { cursor: default; opacity: 1; }
.step-summary > span:first-child { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid var(--border); border-radius: 5px; font-size: 10px; }
.step-summary > div { display: grid; min-width: 0; gap: 2px; }
.step-summary > div strong, .step-summary > div small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-summary > small { white-space: nowrap; }
.step-summary > svg { width: 13px; transition: transform 140ms ease; }
.step-list > article.is-expanded .step-summary > svg { transform: rotate(180deg); }
.attempt-list { display: grid; gap: 5px; padding: 5px 7px 7px 38px; border-top: 1px solid var(--border); }
.attempt-list > article { display: grid; gap: 6px; padding: 7px; border-left: 2px solid var(--accent); background: var(--surface-soft); }
.attempt-list > article.is-failed { border-left-color: var(--theme-danger); }
.attempt-list > article > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.attempt-list > article > header > div { display: grid; min-width: 0; gap: 2px; }
.attempt-list > article > header > div strong, .attempt-list > article > header > div small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attempt-list > article > header > span { color: var(--text-muted); font-size: 9px; white-space: nowrap; }
.attempt-list dl { display: flex; flex-wrap: wrap; gap: 5px 12px; margin: 0; }
.attempt-list dl > div { display: flex; gap: 5px; font-size: 9px; }
.attempt-list dt { color: var(--text-muted); }
.attempt-list dd { margin: 0; color: var(--text-secondary); }
.attempt-error { margin: 0; color: var(--theme-danger-text); font-size: 10px; line-height: 1.45; }
.attempt-warnings { display: grid; gap: 3px; margin: 0; padding-left: 15px; color: var(--theme-warning-text); font-size: 9px; }
.attempt-refs { display: flex; flex-wrap: wrap; gap: 4px; }
.attempt-refs span { display: inline-flex; max-width: 100%; gap: 4px; padding: 3px 5px; border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font-size: 9px; overflow-wrap: anywhere; }
.attempt-refs strong { color: var(--text-secondary); }
.run-review { display: grid; grid-template-columns: 25px minmax(0, 1fr); align-items: start; gap: 7px; margin-top: 10px; padding: 8px; border: 1px solid var(--border); border-left: 2px solid var(--theme-warning); border-radius: 5px; background: var(--surface); }
.run-review.is-passed { border-left-color: var(--theme-success); }
.run-review.is-needsAttention { border-left-color: var(--theme-danger); }
.run-review > span { display: grid; width: 25px; height: 25px; place-items: center; color: var(--theme-warning-text); }
.run-review.is-passed > span { color: var(--theme-success); }
.run-review.is-needsAttention > span { color: var(--theme-danger-text); }
.run-review > span svg { width: 15px; }
.run-review > div:nth-child(2) { display: grid; min-width: 0; gap: 2px; }
.approval-ledger { display: flex; grid-column: 2; flex-wrap: wrap; gap: 4px; }
.approval-ledger > span { display: inline-flex; gap: 4px; padding: 3px 5px; border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font-size: 9px; }
.approval-ledger strong { color: var(--text-secondary); }
.run-recovery-action { display: grid; grid-column: 2; width: 100%; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: 7px; padding: 7px; border: 1px solid var(--theme-warning); border-radius: 5px; background: var(--theme-warning-soft); color: var(--theme-warning-text); text-align: left; }
.run-recovery-action:hover:not(:disabled) { border-color: var(--accent); background: var(--theme-control-hover); color: var(--text); }
.run-recovery-action > svg { width: 15px; }
.run-recovery-action > span { display: grid; min-width: 0; gap: 2px; }
.run-recovery-action strong, .run-recovery-action small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-timeline { margin-top: 12px; border-top: 1px solid var(--border); }
.run-timeline > header { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 8px; }
.run-timeline > header > div { display: grid; min-width: 0; gap: 2px; }
.run-timeline > header button { min-height: 26px; padding: 0 7px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-muted); font-size: 9px; }
.run-timeline > header button:hover { background: var(--theme-control-hover); color: var(--text); }
.run-timeline-list { display: grid; max-height: 190px; overflow-y: auto; padding-right: 4px; }
.run-timeline-list article { position: relative; display: grid; min-height: 36px; grid-template-columns: 12px minmax(0, 1fr) max-content; align-items: start; gap: 6px; padding: 5px 0; }
.run-timeline-list article:not(:last-child)::after { position: absolute; top: 17px; bottom: -7px; left: 5px; width: 1px; background: var(--border); content: ''; }
.run-timeline-dot { position: relative; z-index: 1; width: 7px; height: 7px; margin-top: 4px; border: 2px solid var(--surface-soft); border-radius: 50%; background: var(--accent); box-sizing: content-box; }
.run-timeline-list article > div { display: grid; min-width: 0; gap: 2px; }
.run-timeline-list article > div strong, .run-timeline-list article > div small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-timeline-list article > div strong { font-size: 10px; }
.run-timeline-list time { color: var(--text-muted); font-size: 9px; white-space: nowrap; }
.artifact-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.artifact-list > article { display: grid; min-width: 230px; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--surface); }
.artifact-main { display: grid; min-width: 0; grid-template-columns: 34px minmax(0, 1fr) 15px; align-items: center; gap: 6px; padding: 5px; border: 0; background: transparent; text-align: left; }
.artifact-main:hover:not(:disabled) { background: var(--surface-raised); }
.artifact-main > img { width: 34px; height: 34px; border-radius: 4px; object-fit: cover; }
.artifact-list svg { width: 14px; }
.artifact-main > span { display: grid; min-width: 0; gap: 2px; }
.artifact-main > span strong, .artifact-main > span small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifact-quick-actions { display: grid; grid-template-rows: 1fr 1fr; border-left: 1px solid var(--border); }
.artifact-quick-actions button { display: grid; width: 28px; min-height: 22px; place-items: center; border: 0; background: transparent; color: var(--text-muted); }
.artifact-quick-actions button + button { border-top: 1px solid var(--border); }
.artifact-quick-actions button:hover:not(:disabled) { background: var(--surface-raised); color: var(--accent); }
.queue-band { width: min(780px, calc(100% - 32px)); margin: 8px auto 0; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.queue-band > header { display: flex; align-items: center; justify-content: space-between; padding: 7px 9px; border-bottom: 1px solid var(--border); }
.queue-band > header > div { display: flex; align-items: center; gap: 6px; }
.queue-band > header svg { width: 13px; color: var(--accent); }
.queue-band > header strong { font-size: 11px; }
.queue-band > header small { color: var(--text-muted); font-size: 10px; }
.queue-list { max-height: 92px; overflow-y: auto; padding: 3px 7px; }
.queue-list article { display: flex; min-height: 34px; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); }
.queue-list article:last-child { border-bottom: 0; }
.queue-list article > div { min-width: 0; flex: 1; }
.queue-list strong, .queue-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queue-list strong { font-size: 10px; }
.queue-list small { margin-top: 2px; color: var(--text-muted); font-size: 9px; }
.queue-list button { display: grid; width: 22px; height: 22px; place-items: center; border: 0; background: transparent; color: var(--text-muted); }
.queue-list button svg { width: 13px; }
.composer { position: relative; width: min(780px, calc(100% - 32px)); margin: 10px auto 14px; border: 1px solid var(--control-border); border-radius: 8px; background: var(--input); box-shadow: 0 8px 24px color-mix(in srgb, var(--theme-root) 20%, transparent); }
.composer.is-dragging { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent); }
.command-center { position: absolute; z-index: 42; right: 0; bottom: calc(100% + 8px); left: 0; display: flex; max-height: min(480px, 68vh); flex-direction: column; overflow: hidden; border: 1px solid var(--control-border); border-radius: 7px; background: var(--surface); box-shadow: 0 18px 44px color-mix(in srgb, var(--theme-root) 42%, transparent); }
.command-search { display: grid; min-height: 44px; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 6px 9px; border-bottom: 1px solid var(--border); }
.command-search > svg { width: 15px; color: var(--text-muted); }
.command-search input { min-width: 0; height: 31px; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 11px; }
.command-center kbd { display: inline-grid; min-width: 25px; height: 20px; place-items: center; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-soft); padding: 0 4px; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 8px; }
.command-scopes { display: flex; min-height: 34px; align-items: center; gap: 4px; overflow-x: auto; padding: 5px 7px; border-bottom: 1px solid var(--border); }
.command-scopes button { min-width: max-content; height: 24px; padding: 0 8px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-muted); font-size: 9px; }
.command-scopes button:hover { background: var(--theme-control-hover); color: var(--text); }
.command-scopes button.is-active { border-color: var(--control-border); background: var(--theme-control); color: var(--accent); }
.command-results { min-height: 0; overflow-y: auto; padding: 5px; }
.command-group + .command-group { margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--border); }
.command-group > header { display: flex; min-height: 24px; align-items: center; justify-content: space-between; gap: 8px; padding: 0 6px; color: var(--text-muted); }
.command-group > header strong { font-size: 9px; letter-spacing: 0; }
.command-group > header small { font-size: 8px; }
.command-group > button { display: grid; width: 100%; min-height: 43px; grid-template-columns: 28px minmax(0, 1fr) 16px; align-items: center; gap: 7px; padding: 5px 7px; border: 0; border-radius: 5px; background: transparent; color: var(--text); text-align: left; }
.command-group > button:hover, .command-group > button.is-selected { background: var(--theme-control-hover); }
.command-group > button.is-selected { box-shadow: inset 2px 0 0 var(--accent); }
.command-group > button > span { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 5px; background: color-mix(in srgb, var(--accent) 12%, var(--surface-soft)); color: var(--accent); }
.command-group > button svg { width: 14px; }
.command-group > button > svg { color: var(--text-muted); }
.command-group > button > div { display: grid; min-width: 0; gap: 2px; }
.command-group > button strong, .command-group > button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.command-group > button strong { font-size: 10px; }
.command-group > button small { font-size: 9px; }
.command-loading, .command-empty { display: flex; min-height: 42px; align-items: center; justify-content: center; gap: 7px; color: var(--text-muted); font-size: 10px; }
.command-loading svg { width: 13px; }
.command-center > footer { display: flex; min-height: 32px; align-items: center; justify-content: flex-end; gap: 12px; padding: 5px 8px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 8px; }
.command-center > footer span { display: flex; align-items: center; gap: 4px; }
.command-button.is-active { border-color: var(--accent); color: var(--accent); }
.attachment-drop-overlay { position: absolute; z-index: 4; inset: 4px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 1px dashed var(--accent); border-radius: 5px; background: color-mix(in srgb, var(--input) 92%, var(--accent)); color: var(--accent); }
.attachment-drop-overlay svg { width: 17px; }
.attachment-drop-overlay strong { font-size: 11px; }
.message-edit-band { display: grid; min-height: 42px; grid-template-columns: 24px minmax(0, 1fr) 24px; align-items: center; gap: 7px; margin: 5px 7px 0; padding: 5px 7px; border-left: 2px solid var(--accent); border-radius: 4px; background: var(--surface); color: var(--text-secondary); }
.message-edit-band > svg { width: 14px; color: var(--accent); }
.message-edit-band > div { display: grid; min-width: 0; gap: 2px; }
.message-edit-band strong, .message-edit-band small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.message-edit-band strong { color: var(--text); font-size: 10px; }
.message-edit-band small { color: var(--text-muted); font-size: 9px; }
.message-edit-band button { display: grid; width: 24px; height: 24px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); }
.message-edit-band button:hover { background: var(--theme-control-hover); color: var(--text); }
.message-edit-band button svg { width: 13px; }
.composer textarea { display: block; width: 100%; min-height: 55px; resize: none; border: 0; outline: 0; background: transparent; padding: 12px 13px 5px; color: var(--text); font-size: 12px; line-height: 1.5; }
.composer > footer { display: flex; min-height: 38px; align-items: center; gap: 8px; padding: 4px 7px; }
.composer > footer > span { min-width: 0; flex: 1; color: var(--text-muted); font-size: 10px; }
.send-button { width: 32px; height: 32px; border-color: var(--accent); background: var(--accent); color: var(--theme-on-accent); }
.composer .attachment-list { display: flex; gap: 5px; overflow-x: auto; margin: 0; padding: 7px 8px 2px; }
.composer .attachment-list article { display: grid; min-width: 170px; max-width: 220px; height: 44px; grid-template-columns: 34px minmax(0, 1fr) 18px; align-items: center; gap: 6px; padding: 4px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); }
.composer .attachment-list article > img, .composer .attachment-list article > span { width: 34px; height: 34px; border-radius: 3px; object-fit: cover; }
.composer .attachment-list article > span { display: grid; place-items: center; background: var(--surface-raised); color: var(--text-muted); }
.composer .attachment-list article > span svg { width: 15px; }
.composer .attachment-list article > div { min-width: 0; }
.composer .attachment-list strong, .composer .attachment-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer .attachment-list strong { font-size: 10px; }
.composer .attachment-list small { margin-top: 2px; color: var(--text-muted); font-size: 9px; }
.composer .attachment-list button { display: grid; width: 18px; height: 18px; place-items: center; border: 0; background: transparent; color: var(--text-muted); }
.composer .attachment-list button svg { width: 12px; }
.steer-button { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); color: var(--text); }
.steer-button svg { width: 14px; }
.employee-row { padding: 7px; border: 1px solid transparent; border-radius: 6px; }
.employee-row.is-active { border-color: var(--control-border); background: var(--surface); }
.employee-row.is-disabled { opacity: .55; }
.employee-main { display: grid; grid-template-columns: 31px minmax(0, 1fr); width: 100%; align-items: center; gap: 8px; border: 0; background: transparent; text-align: left; }
.employee-main > span:last-child { display: grid; min-width: 0; gap: 2px; }
.employee-avatar { background: color-mix(in srgb, var(--employee-color, var(--accent)) 15%, var(--surface)); color: var(--employee-color, var(--accent)); }
.employee-actions { display: flex; justify-content: flex-end; gap: 2px; margin-top: 5px; }
.toggle { position: relative; width: 29px; height: 18px; border: 1px solid var(--control-border); border-radius: 9px; background: var(--theme-control); }
.toggle span { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--text-muted); transition: transform 140ms ease; }
.toggle.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 20%, var(--surface)); }
.toggle.is-on span { background: var(--accent); transform: translateX(11px); }
.error-banner { position: absolute; z-index: 50; top: 10px; left: 50%; display: grid; grid-template-columns: 17px minmax(0, 1fr) 30px; width: min(560px, calc(100% - 30px)); align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--theme-danger); border-radius: 6px; background: var(--theme-danger-soft); color: var(--theme-danger-text); transform: translateX(-50%); }
.error-banner.has-action { grid-template-columns: 17px minmax(0, 1fr) auto 30px; }
.error-banner > svg { width: 15px; }
.error-banner > button:not(.icon-button) { min-height: 29px; padding: 0 9px; border: 1px solid currentColor; border-radius: 5px; background: transparent; font-size: 11px; }
.modal-backdrop { position: absolute; z-index: 60; inset: 0; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--theme-root) 55%, transparent); }
.employee-modal, .model-modal, .session-modal, .artifact-modal { display: grid; width: min(520px, 100%); max-height: 90%; gap: 12px; overflow-y: auto; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-shadow: 0 18px 50px color-mix(in srgb, var(--theme-root) 35%, transparent); }
.session-modal { width: min(420px, 100%); }
.session-modal > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.session-modal > header > div { display: grid; min-width: 0; gap: 3px; }
.session-modal label { display: grid; gap: 5px; }
.session-modal label > span { color: var(--text-secondary); font-size: 11px; }
.session-modal input { width: 100%; height: 36px; padding: 0 9px; border: 1px solid var(--control-border); border-radius: 6px; outline: 0; background: var(--input); color: var(--text); }
.session-delete-copy { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.session-modal footer { display: flex; justify-content: flex-end; gap: 7px; }
.session-modal footer button { display: inline-flex; min-height: 31px; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--theme-control); }
.session-modal footer svg { width: 14px; }
.session-modal .danger-button { border-color: var(--theme-danger); background: var(--theme-danger); color: var(--theme-on-danger, #fff); }
.employee-modal label { display: grid; gap: 5px; }
.employee-modal label > span { color: var(--text-secondary); font-size: 11px; }
.employee-modal input, .employee-modal textarea { width: 100%; border: 1px solid var(--control-border); border-radius: 6px; outline: 0; background: var(--input); padding: 8px; color: var(--text); font-size: 11px; }
.employee-modal footer { display: flex; justify-content: flex-end; gap: 7px; }
.model-modal { width: min(600px, 100%); }
.model-modal label { display: grid; gap: 5px; }
.model-modal label > span { color: var(--text-secondary); font-size: 11px; }
.model-modal input, .model-modal select { width: 100%; height: 36px; border: 1px solid var(--control-border); border-radius: 6px; outline: 0; background: var(--input); padding: 0 9px; color: var(--text); font-size: 11px; }
.model-modal footer { display: flex; align-items: center; gap: 7px; padding-top: 3px; }
.model-modal footer > span { flex: 1; }
.model-modal footer button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--theme-control); }
.model-modal footer svg { width: 14px; }
.artifact-modal { width: min(920px, 100%); }
.artifact-modal > header > div { display: grid; min-width: 0; gap: 3px; }
.artifact-modal > header strong, .artifact-modal > header small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifact-preview-stage { display: grid; width: 100%; height: min(56vh, 560px); min-height: 260px; place-items: center; overflow: hidden; border: 1px solid var(--border); border-radius: 6px !important; background: var(--theme-root); }
.artifact-preview-stage > img, .artifact-preview-stage > video { display: block; width: auto !important; height: auto !important; max-width: 100%; max-height: 100%; border-radius: 0 !important; object-fit: contain; }
.artifact-preview-stage > audio { width: min(560px, calc(100% - 32px)); }
.artifact-file-preview { display: grid; max-width: 100%; justify-items: center; gap: 8px; padding: 28px; color: var(--text-muted); text-align: center; }
.artifact-file-preview svg { width: 42px; height: 42px; }
.artifact-file-preview small { max-width: 100%; overflow-wrap: anywhere; }
.artifact-metadata { display: grid; grid-template-columns: max-content minmax(0, 1fr); max-height: 150px; gap: 5px 12px; overflow: auto; margin: 0; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 10px; }
.artifact-metadata dt { color: var(--text-muted); }
.artifact-metadata dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.artifact-modal > footer { display: flex; justify-content: flex-end; gap: 7px; }
.artifact-modal > footer button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--theme-control); }
.artifact-modal > footer svg { width: 14px; }
.model-loading { display: flex; min-height: 160px; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted); font-size: 11px; }
.model-loading svg { width: 16px; }
.model-auth-state { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 8px; padding: 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-soft); }
.model-auth-state > svg { width: 17px; color: var(--theme-warning-text); }
.model-auth-state.is-ready > svg { color: var(--theme-success); }
.model-auth-state > div { display: grid; gap: 2px; }
.model-notice { margin: 0; padding: 8px; border: 1px solid var(--theme-warning); border-radius: 6px; background: var(--theme-warning-soft); color: var(--theme-warning-text); font-size: 11px; line-height: 1.5; }
.model-feedback { display: flex; margin: 0; align-items: center; gap: 7px; padding: 8px; border-radius: 6px; font-size: 11px; line-height: 1.5; }
.model-feedback svg { width: 15px; flex: 0 0 auto; }
.model-feedback.is-error { border: 1px solid var(--theme-danger); background: var(--theme-danger-soft); color: var(--theme-danger-text); }
.model-feedback.is-success { border: 1px solid var(--theme-success); background: color-mix(in srgb, var(--theme-success) 12%, var(--surface)); color: var(--text); }
.spin { animation: spin 850ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) { .model-field, .browser-field { width: 32px; padding: 0; justify-content: center; } .model-field span, .browser-field span { display: none; } }
@media (max-width: 1200px) { .starter-command-grid { grid-template-columns: 1fr; max-width: 320px; } }
@media (max-width: 1000px) { .hermes-workspace { grid-template-columns: 200px minmax(360px, 1fr); } .activity-rail-trigger { display: inline-grid; } .activity-rail { position: absolute; z-index: 44; top: 0; right: 0; bottom: 0; display: none; width: min(320px, calc(100% - 24px)); border-left: 1px solid var(--control-border); box-shadow: -16px 0 40px color-mix(in srgb, var(--theme-root) 40%, transparent); } .activity-rail.is-open { display: flex; } .activity-rail-close { display: grid; } }
@media (max-width: 720px) { .hermes-workspace { grid-template-columns: 1fr; } .session-rail { display: none; } .surface-header { padding-inline: 10px; } .model-field { display: none; } .message-stream, .composer, .prompt-band, .run-band { width: calc(100% - 20px); } .message-row.is-user { width: 92%; } .run-history-panel { right: 10px; left: 10px; width: auto; } .prompt-band { grid-template-columns: 28px minmax(0, 1fr); } .prompt-band > .prompt-actions, .prompt-band > .prompt-answer { grid-column: 1 / -1; } .band-header { align-items: flex-start; flex-direction: column; } .run-header-actions { width: 100%; flex-wrap: wrap; justify-content: flex-start; } .run-history-row { grid-template-columns: 8px minmax(0, 1fr); } .run-status-label { grid-column: 2; justify-self: start; } .run-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .step-summary { grid-template-columns: 24px minmax(0, 1fr) 18px; } .step-summary > small { display: none; } .attempt-list { padding-left: 12px; } .artifact-modal { padding: 12px; } .artifact-preview-stage { height: min(48vh, 360px); min-height: 180px; } .artifact-modal > footer { flex-wrap: wrap; } }
@media (max-width: 720px) { .starter-command-grid { grid-template-columns: 1fr; max-width: 320px; } .idle-state { padding-inline: 18px; } }
</style>
