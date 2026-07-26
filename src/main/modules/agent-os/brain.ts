import { cloneRepo } from '../clone/repo'
import { generateChatCompletion } from '../clone/unifiedChat'
import type {
  AgentArtifact,
  AgentAttachment,
  AgentEmployeeManifest,
  AgentIntentType,
  AgentMessage,
} from './types'

export type AgentBrainDecision =
  | { action: 'reply'; response: string }
  | { action: 'clarify'; response: string }
  | { action: 'artifact_query'; response?: string; artifactType: 'live_photo_video' | 'conversation_artifacts'; limit: number }
  | {
      action: 'workflow'
      summary: string
      intents: AgentIntentType[]
      context: Record<string, unknown>
    }

type BrainCompletion = typeof generateChatCompletion

const brainDependencies: { generateChatCompletion: BrainCompletion } = {
  generateChatCompletion,
}

const intentDescriptions: Record<AgentIntentType, string> = {
  'Intent.ProductInspect': 'Inspect product data and product references.',
  'Intent.ProductSave': 'Create a product record or update approved product metadata and reference images.',
  'Intent.ProductManage': 'Delete an existing product record after explicit approval.',
  'Intent.ProductAnalyze': 'Refresh the structural product analysis for an existing product.',
  'Intent.MaterialPrepare': 'Prepare reusable production materials from supplied media.',
  'Intent.MaterialManage': 'Retry, bind, classify, derive, export, or delete existing production materials.',
  'Intent.CommerceVideoCreate': 'Create commerce videos from an approved reference video and product.',
  'Intent.CloneProjectManage': 'Manage an existing commerce video project, its shots, final output, subtitles, exports, and templates.',
  'Intent.ModelIdentityManage': 'Generate, rename, delete, or assign a reusable model identity.',
  'Intent.LivePhotoCreate': 'Create Live Photo outputs from product references.',
  'Intent.LivePhotoManage': 'Retry, pause, resume, subtitle, export, or delete existing Live Photo work.',
  'Intent.SubtitleGenerate': 'Generate subtitles and packaged video outputs.',
  'Intent.VideoSlice': 'Split a long local video into reusable segment files.',
  'Intent.VideoPublish': 'Publish an approved video to an approved account.',
  'Intent.PublishingManage': 'Manage publishing accounts, music presets, and existing publishing tasks.',
  'Intent.SourceVideoImport': 'Import source videos from approved sharing links.',
  'Intent.SourceVideoManage': 'Retry or delete an existing source-video record.',
  'Intent.ListingGenerate': 'Generate listing copy and product images for an existing listing record.',
  'Intent.ListingExport': 'Export completed listing records as a spreadsheet.',
  'Intent.ListingManage': 'Create, update, delete, or configure product listing records.',
  'Intent.TiktokCreativeManage': 'Create and operate TikTok creative tasks from existing clone projects.',
  'Intent.ProductionBatchCreate': 'Create production tasks from an approved product, template, quantity, and output directory.',
  'Intent.ProductionQueueControl': 'Pause, resume, or cancel the production task queue.',
  'Intent.ProductionTaskManage': 'Retry, cancel, or remove one production task record.',
  'Intent.TemplateSave': 'Create or update a production template.',
  'Intent.TemplateManage': 'Duplicate, delete, or edit an existing production template.',
  'Intent.ArtifactInspect': 'Read and present existing outputs without changing them.',
  'Intent.ArtifactExport': 'Export selected existing outputs to a chosen directory.',
}

const intentRequirements: Record<AgentIntentType, string[]> = {
  'Intent.ProductInspect': [],
  'Intent.ProductSave': ['A product name for creation, or an existing product identifier for updates.'],
  'Intent.ProductManage': ['A product action and an existing product identifier.'],
  'Intent.ProductAnalyze': ['An existing product identifier.'],
  'Intent.MaterialPrepare': ['At least one source video.'],
  'Intent.MaterialManage': ['A material action and the corresponding material or batch identifiers.'],
  'Intent.CommerceVideoCreate': ['A reference video.', 'A product or product reference images.'],
  'Intent.CloneProjectManage': ['A clone project action and an existing clone project identifier.'],
  'Intent.ModelIdentityManage': ['A model identity action and the identifiers or profile required by that action.'],
  'Intent.LivePhotoCreate': ['A product or product reference images.'],
  'Intent.LivePhotoManage': ['A Live Photo action and one or more existing Live Photo identifiers.'],
  'Intent.SubtitleGenerate': ['A source video or an existing video result.'],
  'Intent.VideoSlice': ['A readable local source video.', 'A segment duration between 1 and 600 seconds.'],
  'Intent.VideoPublish': ['An existing video result.', 'An approved publishing account.'],
  'Intent.PublishingManage': ['A publishing management action and the account, preset, or task fields required by that action.'],
  'Intent.SourceVideoImport': ['One or more supported sharing links.'],
  'Intent.SourceVideoManage': ['A source-video action and an existing source-video identifier.'],
  'Intent.ListingGenerate': ['An existing listing record identifier.'],
  'Intent.ListingExport': ['One or more completed listing record identifiers.'],
  'Intent.ListingManage': ['A listing action and the fields or identifier required by that action.'],
  'Intent.TiktokCreativeManage': ['A creative task action and the clone project, task, or shot identifiers required by that action.'],
  'Intent.ProductionBatchCreate': ['A product identifier.', 'A template identifier.', 'An output directory.'],
  'Intent.ProductionQueueControl': ['A queue action: pause, resume, or cancel.'],
  'Intent.ProductionTaskManage': ['A task action and an existing production task identifier.'],
  'Intent.TemplateSave': ['A template name for creation, or an existing template identifier for updates.'],
  'Intent.TemplateManage': ['A template action and an existing template identifier.'],
  'Intent.ArtifactInspect': [],
  'Intent.ArtifactExport': ['One or more selected existing results.', 'An output directory. File formats are preserved.'],
}

export function setAgentBrainTestDependencies(input: { generateChatCompletion?: BrainCompletion }) {
  if (input.generateChatCompletion) brainDependencies.generateChatCompletion = input.generateChatCompletion
}

export function resetAgentBrainTestDependencies() {
  brainDependencies.generateChatCompletion = generateChatCompletion
}

function extractJsonObject(value: string) {
  const source = String(value || '').trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(source)?.[1]
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1)
  if (!candidate) throw new Error('Agent decision does not contain JSON')
  return JSON.parse(candidate) as Record<string, unknown>
}

function cleanText(value: unknown) {
  return String(value ?? '').trim()
}

function cleanContext(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(secret|password|token|api.?key|authorization|credential|binding|adapter|provider|model|tool|capability.?policy|global.?policy|project.?policy)/i.test(key)),
  )
}

export function hasExplicitBusinessExecution(request: string) {
  const value = cleanText(request).toLowerCase()
  const action = /(create|generate|prepare|publish|export|inspect|organize|clone|subtitle|handle|process|execute|retry|delete|remove|bind|unbind|mark|pause|resume|revert|work on|\u521b\u5efa|\u751f\u6210|\u5236\u4f5c|\u51c6\u5907|\u53d1\u5e03|\u5bfc\u51fa|\u68c0\u67e5|\u67e5\u770b|\u6574\u7406|\u590d\u523b|\u5b57\u5e55|\u5904\u7406|\u6267\u884c|\u91cd\u8bd5|\u5220\u9664|\u7ed1\u5b9a|\u89e3\u7ed1|\u6807\u8bb0|\u6682\u505c|\u6062\u590d)/i.test(value)
  const businessObject = /(product|material|video|live photo|subtitle|artifact|result|account|\u5546\u54c1|\u4ea7\u54c1|\u7d20\u6750|\u89c6\u9891|\u52a8\u6001\u7167\u7247|\u5b9e\u51b5\u7167\u7247|\u5b57\u5e55|\u4ea7\u7269|\u7ed3\u679c|\u8d26\u53f7|\u8d44\u6599)/i.test(value)
  return action && businessObject
}

function normalizeDecision(value: Record<string, unknown>, allowedIntents: Set<AgentIntentType>): AgentBrainDecision | null {
  const action = cleanText(value.action).toLowerCase()
  if (action === 'reply' || action === 'clarify') {
    const response = cleanText(value.response)
    return response ? { action, response } : null
  }
  if (action === 'artifact_query') {
    return {
      action,
      response: cleanText(value.response) || undefined,
      artifactType: cleanText(value.artifactType) === 'live_photo_video' ? 'live_photo_video' : 'conversation_artifacts',
      limit: Math.max(1, Math.min(20, Number(value.limit || 6) || 6)),
    }
  }
  if (action !== 'workflow' || !Array.isArray(value.intents)) return null
  const intents = Array.from(new Set(
    value.intents
      .map((item) => cleanText(item) as AgentIntentType)
      .filter((item): item is AgentIntentType => allowedIntents.has(item)),
  ))
  if (!intents.length) return null
  return {
    action,
    summary: cleanText(value.summary) || 'A workflow is ready for approval.',
    intents,
    context: cleanContext(value.context),
  }
}

export async function decideAgentTurn(input: {
  request: string
  employee: AgentEmployeeManifest
  messages: AgentMessage[]
  attachments: AgentAttachment[]
  context: Record<string, unknown>
  artifacts: AgentArtifact[]
}): Promise<AgentBrainDecision | null> {
  const allowedIntents = new Set(input.employee.allowedIntents)
  const credentials = await cloneRepo.getCredentials()
  const decisionDeadline = Date.now() + 25_000
  const explicitBusinessExecution = hasExplicitBusinessExecution(input.request)
  const system = [
    'You are the decision brain for an AI video production employee.',
    'Understand the current request in the context of the full conversation.',
    'Return JSON only.',
    'Choose exactly one action: reply, clarify, artifact_query, or workflow.',
    'Use reply for conversation, memory questions, explanations, brainstorming, status questions, and requests that need no business action.',
    'A request to remember information or answer from conversation history is always reply, never workflow.',
    'Use clarify only when a required user choice or input is genuinely missing.',
    'Ask only for inputs listed as required by the selected intent and do not invent format or configuration choices.',
    'Use artifact_query when the user wants to see or retrieve existing results.',
    'Use workflow only when the user explicitly requests a business operation.',
    'For workflow, return only the smallest necessary ordered intent list from the supplied catalog.',
    'Do not add media creation, publishing, export, or packaging unless the user explicitly requested it.',
    'Never invent an unavailable intent.',
    'Never expose implementation names, vendors, credentials, or internal routing.',
    'All user-facing response and summary text must use the language used by the user.',
    explicitBusinessExecution
      ? 'The current request contains an explicit business execution signal; choose the best action from the request and conversation.'
      : 'The current request contains no explicit business execution signal. You must not choose workflow.',
    `Follow the employee planning policy: ${input.employee.plannerPolicy}`,
  ].join(' ')
  const prompt = JSON.stringify({
    request: input.request,
    employee: {
      role: input.employee.role,
      description: input.employee.description,
      planningPolicy: input.employee.plannerPolicy,
    },
    conversation: input.messages.slice(-16).map((message) => ({
      role: message.role,
      content: message.content,
      attachments: message.attachments.map((item) => ({ name: item.name, mediaType: item.mediaType })),
    })),
    currentAttachments: input.attachments.map((item) => ({ name: item.name, mediaType: item.mediaType })),
    context: cleanContext(input.context),
    existingResults: input.artifacts.slice(-20).map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      name: artifact.name,
      available: Boolean(artifact.localPath),
    })),
    intentCatalog: input.employee.allowedIntents.map((intent) => ({
      intent,
      description: intentDescriptions[intent],
      requiredInputs: intentRequirements[intent],
    })),
    responseSchema: {
      reply: { action: 'reply', response: 'Natural answer' },
      clarify: { action: 'clarify', response: 'One concise question' },
      artifactQuery: {
        action: 'artifact_query',
        response: 'Optional lead-in',
        artifactType: 'live_photo_video or conversation_artifacts',
        limit: 6,
      },
      workflow: {
        action: 'workflow',
        summary: 'Concise business plan summary in the user language',
        intents: ['Intent.ProductInspect'],
        context: { quantity: 1 },
      },
    },
  })
  const response = await brainDependencies.generateChatCompletion({
    credentials,
    system,
    prompt,
    timeoutMs: Math.max(1, decisionDeadline - Date.now()),
  })
  const decision = normalizeDecision(extractJsonObject(response.content), allowedIntents)
  if (!decision) throw new Error('Agent decision is invalid')
  if (decision.action !== 'workflow' || explicitBusinessExecution) return decision

  const retryTimeoutMs = decisionDeadline - Date.now()
  if (retryTimeoutMs < 1_000) throw new Error('Agent decision deadline exceeded')

  const retry = await brainDependencies.generateChatCompletion({
    credentials,
    system: `${system} Your previous classification incorrectly chose workflow. Return reply, clarify, or artifact_query only.`,
    prompt,
    timeoutMs: retryTimeoutMs,
  })
  const corrected = normalizeDecision(extractJsonObject(retry.content), allowedIntents)
  if (!corrected) throw new Error('Corrected agent decision is invalid')
  if (corrected?.action === 'workflow') throw new Error('Agent decision remained invalid after correction')
  return corrected
}
