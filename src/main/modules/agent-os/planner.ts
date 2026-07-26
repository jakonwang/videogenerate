import { createHash, randomUUID } from 'node:crypto'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion } from '../clone/unifiedChat'
import type {
  AgentAttachment,
  AgentEmployeeManifest,
  AgentIntentType,
  AgentPlanRevision,
  AgentWorkflowStep,
} from './types'

type PlannedIntent = {
  intentType: AgentIntentType
  title: string
}

type PlannerCompletion = typeof generateChatCompletion

const plannerDependencies: { generateChatCompletion: PlannerCompletion } = {
  generateChatCompletion,
}

export function setAgentPlannerTestDependencies(input: { generateChatCompletion?: PlannerCompletion }) {
  if (input.generateChatCompletion) plannerDependencies.generateChatCompletion = input.generateChatCompletion
}

export function resetAgentPlannerTestDependencies() {
  plannerDependencies.generateChatCompletion = generateChatCompletion
}

const intentCatalog: Array<PlannedIntent & { description: string; employeeId: string }> = [
  { intentType: 'Intent.ProductInspect', title: 'Inspect product data', description: 'Read product data and references.', employeeId: 'employee.material' },
  { intentType: 'Intent.ProductSave', title: 'Save product data', description: 'Create a product or update approved product metadata and reference images.', employeeId: 'employee.material' },
  { intentType: 'Intent.ProductManage', title: 'Manage product', description: 'Delete an existing product record after approval.', employeeId: 'employee.material' },
  { intentType: 'Intent.ProductAnalyze', title: 'Analyze product', description: 'Refresh structural product analysis for an existing product.', employeeId: 'employee.material' },
  { intentType: 'Intent.MaterialPrepare', title: 'Prepare production materials', description: 'Prepare reusable image and video materials.', employeeId: 'employee.material' },
  { intentType: 'Intent.MaterialManage', title: 'Manage production materials', description: 'Retry, bind, classify, derive, export, or delete existing materials.', employeeId: 'employee.material' },
  { intentType: 'Intent.CommerceVideoCreate', title: 'Create commerce video', description: 'Create a commerce video from approved references.', employeeId: 'employee.clone' },
  { intentType: 'Intent.CloneProjectManage', title: 'Manage commerce video project', description: 'Manage an existing commerce video clone project and its outputs.', employeeId: 'employee.clone' },
  { intentType: 'Intent.ModelIdentityManage', title: 'Manage model identity', description: 'Generate, rename, delete, or assign a reusable model identity.', employeeId: 'employee.clone' },
  { intentType: 'Intent.LivePhotoCreate', title: 'Create live photo', description: 'Create a live photo from product references.', employeeId: 'employee.clone' },
  { intentType: 'Intent.LivePhotoManage', title: 'Manage live photo', description: 'Retry, pause, resume, subtitle, export, or delete existing Live Photo work.', employeeId: 'employee.clone' },
  { intentType: 'Intent.SubtitleGenerate', title: 'Create subtitle package', description: 'Create subtitle and packaging outputs.', employeeId: 'employee.package' },
  { intentType: 'Intent.VideoSlice', title: 'Split long video', description: 'Split a long local video into reusable segments.', employeeId: 'employee.package' },
  { intentType: 'Intent.VideoPublish', title: 'Publish video', description: 'Publish an approved video to an approved account.', employeeId: 'employee.publish' },
  { intentType: 'Intent.PublishingManage', title: 'Manage publishing', description: 'Manage publishing accounts, music presets, and publishing tasks.', employeeId: 'employee.publish' },
  { intentType: 'Intent.SourceVideoImport', title: 'Import source videos', description: 'Import source videos from approved sharing links.', employeeId: 'employee.material' },
  { intentType: 'Intent.SourceVideoManage', title: 'Manage source videos', description: 'Retry or delete an existing source video.', employeeId: 'employee.material' },
  { intentType: 'Intent.ListingGenerate', title: 'Generate product listing', description: 'Generate listing copy and product images for an existing listing record.', employeeId: 'employee.package' },
  { intentType: 'Intent.ListingExport', title: 'Export product listings', description: 'Export completed listing records as a spreadsheet.', employeeId: 'employee.package' },
  { intentType: 'Intent.ListingManage', title: 'Manage product listings', description: 'Create, update, delete, or configure product listing records.', employeeId: 'employee.package' },
  { intentType: 'Intent.TiktokCreativeManage', title: 'Manage TikTok creative tasks', description: 'Create and operate TikTok creative tasks from clone projects.', employeeId: 'employee.clone' },
  { intentType: 'Intent.ProductionBatchCreate', title: 'Create production batch', description: 'Create queued production tasks from an approved product and template.', employeeId: 'employee.package' },
  { intentType: 'Intent.ProductionQueueControl', title: 'Control production queue', description: 'Pause, resume, or cancel the production task queue.', employeeId: 'employee.package' },
  { intentType: 'Intent.ProductionTaskManage', title: 'Manage production task', description: 'Retry, cancel, or remove one existing production task.', employeeId: 'employee.package' },
  { intentType: 'Intent.TemplateSave', title: 'Save production template', description: 'Create or update a production template.', employeeId: 'employee.package' },
  { intentType: 'Intent.TemplateManage', title: 'Manage production template', description: 'Duplicate, delete, or edit an existing production template.', employeeId: 'employee.package' },
  { intentType: 'Intent.ArtifactInspect', title: 'Inspect existing results', description: 'Read existing results without exporting or regenerating them.', employeeId: 'employee.package' },
  { intentType: 'Intent.ArtifactExport', title: 'Export deliverables', description: 'Export existing artifacts without regenerating them.', employeeId: 'employee.package' },
]

function uniqueIntents(values: AgentIntentType[]) {
  return Array.from(new Set(values))
}

function fallbackIntentTypes(prompt: string, attachments: AgentAttachment[]) {
  const text = String(prompt || '').toLowerCase()
  const hasVideo = attachments.some((item) => item.mediaType === 'video')
  const hasImage = attachments.some((item) => item.mediaType === 'image')
  const intents: AgentIntentType[] = []
  const manageAction = /\u91cd\u8bd5|\u5220\u9664|\u7ed1\u5b9a|\u89e3\u7ed1|\u6807\u8bb0|\u5bfc\u51fa|\u53d8\u4f53|\u6682\u505c|\u6062\u590d|retry|delete|remove|bind|unbind|mark|export|variant|pause|resume|revert/.test(text)
  const sourceVideoManage = manageAction && /(\u6e90\u89c6\u9891|\u4e0b\u8f7d\u89c6\u9891|source\s*video|downloaded\s*video)/.test(text)
  const livePhotoManage = /(\u52a8\u6001\u7167\u7247|live\s*photo)/.test(text) && (manageAction || /\u5b57\u5e55|subtitle|caption/.test(text))
  const productSave = /(\u521b\u5efa|\u65b0\u5efa|\u6dfb\u52a0|\u66f4\u65b0|\u4fee\u6539|create|add|update|edit).*(\u5546\u54c1|\u4ea7\u54c1|product)|(\u5546\u54c1|\u4ea7\u54c1|product).*(\u521b\u5efa|\u65b0\u5efa|\u6dfb\u52a0|\u66f4\u65b0|\u4fee\u6539|create|add|update|edit)/.test(text)
  const modelIdentityManage = /(\u6a21\u7279|model\s*identity|model\s*profile).*(\u751f\u6210|\u521b\u5efa|\u91cd\u547d\u540d|\u5220\u9664|\u7ed1\u5b9a|generate|create|rename|delete|assign|bind)|(\u751f\u6210|\u521b\u5efa|\u91cd\u547d\u540d|\u5220\u9664|\u7ed1\u5b9a|generate|create|rename|delete|assign|bind).*(\u6a21\u7279|model\s*identity|model\s*profile)/.test(text)
  const templateManage = /(\u6a21\u677f|template).*(\u590d\u5236|\u5220\u9664|duplicate|copy|delete|remove)|(\u590d\u5236|\u5220\u9664|duplicate|copy|delete|remove).*(\u6a21\u677f|template)/.test(text)
  const productionTaskManage = /(\u751f\u4ea7\u4efb\u52a1|production\s*task).*(\u91cd\u8bd5|\u53d6\u6d88|\u5220\u9664|retry|cancel|delete|remove)|(\u91cd\u8bd5|\u53d6\u6d88|\u5220\u9664|retry|cancel|delete|remove).*(\u751f\u4ea7\u4efb\u52a1|production\s*task)/.test(text)
  const productDelete = /(\u5220\u9664|delete|remove).*(\u5546\u54c1|\u4ea7\u54c1|product)|(\u5546\u54c1|\u4ea7\u54c1|product).*(\u5220\u9664|delete|remove)/.test(text)
  const listingManage = /(\u5546\u54c1\u520a\u767b|listing).*(\u521b\u5efa|\u66f4\u65b0|\u4fee\u6539|\u5220\u9664|\u914d\u7f6e|create|update|edit|delete|configure)/.test(text)
  const creativeManage = /(tiktok\s*creative|creative\s*studio|\u521b\u610f\u5de5\u4f5c\u5ba4)/.test(text)
  const videoSlice = /(\u957f\u89c6\u9891|\u76f4\u64ad\u5f55\u50cf|long\s*video|live\s*recording).*(\u5207\u7247|\u5206\u5272|split|slice)|(\u5207\u7247|\u5206\u5272|split|slice).*(\u89c6\u9891|video)/.test(text)
  const publishingManage = /(\u53d1\u5e03\u8d26\u53f7|\u53d1\u5e03\u4efb\u52a1|\u97f3\u4e50\u9884\u8bbe|publishing\s*account|publishing\s*task|music\s*preset).*(\u65b0\u5efa|\u4fdd\u5b58|\u5220\u9664|\u540c\u6b65|create|save|delete|sync)/.test(text)
  if (productDelete) intents.push('Intent.ProductManage')
  else if (productSave) intents.push('Intent.ProductSave')
  else if (/\u5546\u54c1|\u4ea7\u54c1|product/.test(text)) intents.push('Intent.ProductInspect')
  if (/(\u5206\u6790|\u8bc6\u522b|analy[sz]e).*(\u5546\u54c1|\u4ea7\u54c1|product)|(\u5546\u54c1|\u4ea7\u54c1|product).*(\u5206\u6790|\u8bc6\u522b|analy[sz]e)/.test(text)) intents.push('Intent.ProductAnalyze')
  if (/\u7d20\u6750|\u6574\u7406|\u62c6\u7247|material/.test(text)) {
    intents.push(manageAction ? 'Intent.MaterialManage' : 'Intent.MaterialPrepare')
  }
  if (/(\u67e5\u770b|\u6253\u5f00|\u6700\u8fd1|show|view|open|recent).*(\u52a8\u6001\u7167\u7247|live\s*photo|\u7ed3\u679c|artifact)/.test(text)) {
    intents.push('Intent.ArtifactInspect')
  } else if (/\u52a8\u6001\u7167\u7247|live\s*photo/.test(text)) {
    intents.push(livePhotoManage ? 'Intent.LivePhotoManage' : 'Intent.LivePhotoCreate')
  }
  const cloneProjectManage = /cloneProjectId|projectId|\u590d\u523b\u9879\u76ee|\u9879\u76ee\u961f\u5217|\u5206\u955c\u91cd\u8bd5|\u5408\u6210\u6210\u7247|\u5bfc\u51fa\u6210\u7247|clone project/i.test(text)
  if (cloneProjectManage) intents.push('Intent.CloneProjectManage')
  if (modelIdentityManage) intents.push('Intent.ModelIdentityManage')
  if (!cloneProjectManage && !sourceVideoManage && (/\u89c6\u9891|\u590d\u523b|\u6210\u7247|video|clone/.test(text) || hasVideo)) intents.push('Intent.CommerceVideoCreate')
  if (!livePhotoManage && /\u5b57\u5e55|\u5305\u88c5|subtitle|caption/.test(text)) intents.push('Intent.SubtitleGenerate')
  if (videoSlice) intents.push('Intent.VideoSlice')
  if (publishingManage) intents.push('Intent.PublishingManage')
  else if (/\u53d1\u5e03|\u4e0a\u67b6|publish/.test(text)) intents.push('Intent.VideoPublish')
  if (!sourceVideoManage && /(https?:\/\/|\u5206\u4eab\u94fe\u63a5|\u4e0b\u8f7d|download|import).*(tiktok|\u89c6\u9891|video)/.test(text)) intents.push('Intent.SourceVideoImport')
  if (sourceVideoManage) intents.push('Intent.SourceVideoManage')
  if (/(\u5546\u54c1\u520a\u767b|listing).*(\u751f\u6210|generate)/.test(text)) intents.push('Intent.ListingGenerate')
  if (/(\u5546\u54c1\u520a\u767b|listing).*(\u5bfc\u51fa|export)/.test(text)) intents.push('Intent.ListingExport')
  if (listingManage) intents.push('Intent.ListingManage')
  if (creativeManage) intents.push('Intent.TiktokCreativeManage')
  if (/(\u751f\u4ea7\u6279\u6b21|\u751f\u4ea7\u4efb\u52a1|production batch|production task).*(\u521b\u5efa|\u751f\u6210|create)/.test(text)) intents.push('Intent.ProductionBatchCreate')
  if (/(\u751f\u4ea7\u961f\u5217|production queue).*(\u6682\u505c|\u6062\u590d|\u53d6\u6d88|pause|resume|cancel)|(\u6682\u505c|\u6062\u590d|\u53d6\u6d88|pause|resume|cancel).*(\u751f\u4ea7\u961f\u5217|production queue)/.test(text)) intents.push('Intent.ProductionQueueControl')
  if (productionTaskManage) intents.push('Intent.ProductionTaskManage')
  if (templateManage) intents.push('Intent.TemplateManage')
  else if (/(\u521b\u5efa|\u65b0\u5efa|\u66f4\u65b0|\u4fee\u6539|create|update|edit).*(\u6a21\u677f|template)|(\u6a21\u677f|template).*(\u521b\u5efa|\u65b0\u5efa|\u66f4\u65b0|\u4fee\u6539|create|update|edit)/.test(text)) intents.push('Intent.TemplateSave')
  if (/\u5bfc\u51fa|\u4ea4\u4ed8|export/.test(text)) intents.push('Intent.ArtifactExport')
  if (!intents.length && hasImage) intents.push('Intent.LivePhotoCreate')
  if (!intents.length) intents.push('Intent.ProductInspect')
  if (intents.includes('Intent.CommerceVideoCreate') && !intents.includes('Intent.ProductInspect')) {
    intents.unshift('Intent.ProductInspect')
  }
  return uniqueIntents(intents)
}

function extractJsonObject(text: string) {
  const source = String(text || '').trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(source)?.[1]
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1)
  if (!candidate) throw new Error('Planner response does not contain JSON')
  return JSON.parse(candidate) as { summary?: unknown; intents?: unknown }
}

function normalizeModelIntents(value: unknown, allowed: Set<AgentIntentType>) {
  if (!Array.isArray(value)) return []
  return uniqueIntents(
    value
      .map((item) => String(item || '').trim() as AgentIntentType)
      .filter((item): item is AgentIntentType => allowed.has(item)),
  )
}

async function planWithModel(input: {
  prompt: string
  employee: AgentEmployeeManifest
}) {
  const allowed = new Set(input.employee.allowedIntents)
  const catalog = intentCatalog
    .filter((item) => allowed.has(item.intentType))
    .map((item) => ({ intent: item.intentType, description: item.description }))
  const credentials = await cloneRepo.getCredentials()
  const response = await plannerDependencies.generateChatCompletion({
    credentials,
    timeoutMs: 45_000,
    system: [
      'You are a workflow planner.',
      'Return JSON only with summary and intents.',
      'Use only intent identifiers from the supplied catalog.',
      'Return business intent identifiers without implementation details.',
      `Follow this employee planning policy: ${input.employee.plannerPolicy}`,
    ].join(' '),
    prompt: JSON.stringify({
      request: input.prompt,
      employee: {
        role: input.employee.role,
        planningPolicy: input.employee.plannerPolicy,
      },
      intentCatalog: catalog,
    }),
  })
  const parsed = extractJsonObject(response.content)
  const intents = normalizeModelIntents(parsed.intents, allowed)
  if (!intents.length) throw new Error('Planner returned no allowed intents')
  return {
    summary: String(parsed.summary || '').trim() || 'The execution plan is ready.',
    intents,
  }
}

function buildStepInput(context: Record<string, unknown>, attachments: AgentAttachment[]) {
  const imagePaths = attachments.filter((item) => item.mediaType === 'image').map((item) => item.path)
  const videoPaths = attachments.filter((item) => item.mediaType === 'video').map((item) => item.path)
  return {
    ...context,
    attachmentIds: attachments.map((item) => item.id),
    imagePaths,
    videoPaths,
    referenceVideoPath: String(context.referenceVideoPath || videoPaths[0] || '').trim() || undefined,
    productImagePaths: Array.isArray(context.productImagePaths) ? context.productImagePaths : imagePaths,
  }
}

function hashRevision(input: Omit<AgentPlanRevision, 'hash' | 'createdAt'>) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export function rehashAgentPlanRevision(revision: AgentPlanRevision) {
  const { hash: _hash, createdAt: _createdAt, ...snapshot } = revision
  return hashRevision(snapshot)
}

export async function buildAgentPlan(input: {
  runId: string
  revision: number
  prompt: string
  context: Record<string, unknown>
  attachments: AgentAttachment[]
  employee: AgentEmployeeManifest
  preferredIntents?: AgentIntentType[]
  preferredSummary?: string
}) {
  let summary = 'The execution plan was generated from the request.'
  let intents: AgentIntentType[]
  const preferredIntents = uniqueIntents(input.preferredIntents || [])
    .filter((item) => input.employee.allowedIntents.includes(item))
  if (preferredIntents.length) {
    intents = preferredIntents
    summary = String(input.preferredSummary || '').trim() || summary
  } else {
    try {
      const planned = await planWithModel({ prompt: input.prompt, employee: input.employee })
      summary = planned.summary
      intents = planned.intents
    } catch {
      intents = fallbackIntentTypes(input.prompt, input.attachments).filter((item) => input.employee.allowedIntents.includes(item))
      if (!intents.length) intents = input.employee.allowedIntents.slice(0, 1)
    }
  }
  const sharedInput = buildStepInput(input.context, input.attachments)
  const steps: AgentWorkflowStep[] = intents.map((intentType, index) => {
    const manifest = intentCatalog.find((item) => item.intentType === intentType)!
    const employeeId = input.employee.role === 'supervisor' ? manifest.employeeId : input.employee.id
    return {
      id: randomUUID(),
      runId: input.runId,
      revision: input.revision,
      order: index,
      title: manifest.title,
      intentType,
      intentVersion: 1,
      input: { ...sharedInput, request: input.prompt },
      dependsOn: index > 0 ? [] : [],
      employeeId,
      status: index === 0 ? 'ready' : 'pending',
      repairCount: 0,
      updatedAt: Date.now(),
    }
  })
  for (let index = 1; index < steps.length; index += 1) {
    steps[index].dependsOn = [steps[index - 1].id]
  }
  const base: Omit<AgentPlanRevision, 'hash' | 'createdAt'> = {
    version: input.revision,
    summary,
    requestSnapshot: input.prompt,
    contextSnapshot: { ...input.context, attachments: input.attachments },
    capabilityPolicySnapshot: {},
    workflowVersion: 1,
    quantity: Math.max(1, Number(input.context.quantity || 1)),
    budget: typeof input.context.budget === 'object' && input.context.budget ? input.context.budget as Record<string, unknown> : {},
    promptSnapshot: input.prompt,
    stepIds: steps.map((item) => item.id),
  }
  return {
    revision: { ...base, hash: hashRevision(base), createdAt: Date.now() },
    steps,
  }
}
