export type AgentRunStatus =
  | 'draft'
  | 'planning'
  | 'waiting_approval'
  | 'running'
  | 'paused'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentStepStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'cancelled'

export type AgentIntentType =
  | 'Intent.ProductInspect'
  | 'Intent.ProductSave'
  | 'Intent.ProductManage'
  | 'Intent.ProductAnalyze'
  | 'Intent.MaterialPrepare'
  | 'Intent.MaterialManage'
  | 'Intent.CommerceVideoCreate'
  | 'Intent.CloneProjectManage'
  | 'Intent.ModelIdentityManage'
  | 'Intent.LivePhotoCreate'
  | 'Intent.LivePhotoManage'
  | 'Intent.SubtitleGenerate'
  | 'Intent.VideoSlice'
  | 'Intent.VideoPublish'
  | 'Intent.PublishingManage'
  | 'Intent.SourceVideoImport'
  | 'Intent.SourceVideoManage'
  | 'Intent.ListingGenerate'
  | 'Intent.ListingExport'
  | 'Intent.ListingManage'
  | 'Intent.TiktokCreativeManage'
  | 'Intent.ProductionBatchCreate'
  | 'Intent.ProductionQueueControl'
  | 'Intent.ProductionTaskManage'
  | 'Intent.TemplateSave'
  | 'Intent.TemplateManage'
  | 'Intent.ArtifactInspect'
  | 'Intent.ArtifactExport'

export type AgentCapabilityId =
  | 'Product.Read'
  | 'Product.Save'
  | 'Product.Manage'
  | 'Product.Analyze'
  | 'Material.Prepare'
  | 'Material.Manage'
  | 'Video.Clone'
  | 'Video.Clone.Manage'
  | 'ModelIdentity.Manage'
  | 'LivePhoto.Create'
  | 'LivePhoto.Manage'
  | 'Subtitle.Generate'
  | 'Video.Slice'
  | 'Video.Publish'
  | 'Publishing.Manage'
  | 'SourceVideo.Import'
  | 'SourceVideo.Manage'
  | 'Listing.Generate'
  | 'Listing.Export'
  | 'Listing.Manage'
  | 'TiktokCreative.Manage'
  | 'Production.BatchCreate'
  | 'Production.QueueControl'
  | 'Production.TaskManage'
  | 'Template.Save'
  | 'Template.Manage'
  | 'Artifact.Read'
  | 'Artifact.Export'

export type AgentArtifactKind =
  | 'image'
  | 'video'
  | 'subtitle'
  | 'thumbnail'
  | 'report'
  | 'publish_receipt'
  | 'manifest'
  | 'project'
  | 'product'
  | 'template'
  | 'source_video'
  | 'listing'
  | 'spreadsheet'
  | 'task'

export type AgentEmployeeManifest = {
  id: string
  version: number
  name: string
  description: string
  role: 'supervisor' | 'material' | 'clone' | 'package' | 'publish' | 'custom'
  enabled: boolean
  builtIn: boolean
  icon: string
  color: string
  allowedIntents: AgentIntentType[]
  allowedCapabilities: AgentCapabilityId[]
  defaultContext: Record<string, unknown>
  plannerPolicy: string
  reviewerPolicy: string
  approvalPolicy: 'run'
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export type AgentAttachment = {
  id: string
  name: string
  path: string
  mediaType: 'image' | 'video' | 'file'
}

export type AgentConversation = {
  id: string
  title: string
  channel: 'desktop' | 'feishu'
  externalUserId?: string
  externalConversationId?: string
  employeeId: string
  hermesStoredSessionId?: string
  hermesStoredSessionIds?: string[]
  context: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export type AgentMessage = {
  id: string
  conversationId: string
  runId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments: AgentAttachment[]
  artifactIds?: string[]
  responseCode?: string
  responseParams?: Record<string, string | number>
  createdAt: number
}

export type AgentWorkflowStep = {
  id: string
  runId: string
  revision: number
  order: number
  title: string
  intentType: AgentIntentType
  intentVersion: number
  input: Record<string, unknown>
  dependsOn: string[]
  employeeId: string
  status: AgentStepStatus
  repairCount: number
  currentAttemptId?: string
  error?: string
  startedAt?: number
  completedAt?: number
  updatedAt: number
}

export type AgentPlanRevision = {
  version: number
  summary: string
  requestSnapshot: string
  contextSnapshot: Record<string, unknown>
  capabilityPolicySnapshot: Record<string, string>
  workflowVersion: number
  quantity: number
  budget: Record<string, unknown>
  promptSnapshot: string
  stepIds: string[]
  hash: string
  createdAt: number
}

export type AgentRun = {
  id: string
  shortId: string
  conversationId: string
  employeeId: string
  requestKey?: string
  status: AgentRunStatus
  activeRevision: number
  revisions: AgentPlanRevision[]
  artifactIds: string[]
  warningCount: number
  error?: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
}

export type AgentExecutionAttempt = {
  id: string
  runId: string
  stepId: string
  sequence: number
  capabilityId: AgentCapabilityId
  capabilityVersion: number
  bindingId: string
  adapterVersion: string
  modelSnapshot?: Record<string, unknown>
  inputSnapshot: Record<string, unknown>
  idempotencyKey: string
  status: 'running' | 'completed' | 'failed'
  result?: AgentToolResult
  createdAt: number
  completedAt?: number
}

export type AgentToolResult = {
  success: boolean
  status: 'completed' | 'accepted' | 'partial' | 'failed'
  artifactIds: string[]
  logs: string[]
  warnings: string[]
  cost: Record<string, unknown>
  retryable: boolean
  externalRefs: Record<string, string>
  error?: { code: string; message: string }
}

export type AgentArtifact = {
  id: string
  kind: AgentArtifactKind
  name: string
  uri: string
  localPath?: string
  mimeType?: string
  size?: number
  checksum?: string
  metadata: Record<string, unknown>
  sourceArtifactIds: string[]
  producerRunId: string
  producerStepId: string
  lifecycle: 'managed' | 'referenced' | 'published'
  createdAt: number
}

export type AgentApproval = {
  id: string
  runId: string
  revision: number
  planHash: string
  status: 'approved' | 'rejected'
  channel: 'desktop' | 'feishu'
  approverId: string
  createdAt: number
}

export type AgentDomainEvent = {
  id: string
  sequence: number
  schemaVersion: number
  type: string
  aggregateType: 'conversation' | 'run' | 'step' | 'artifact' | 'employee'
  aggregateId: string
  conversationId?: string
  runId?: string
  stepId?: string
  correlationId: string
  causationId?: string
  payload: Record<string, unknown>
  createdAt: number
}

export type AgentOsDb = {
  schemaVersion: number
  nextEventSequence: number
  employees: AgentEmployeeManifest[]
  conversations: AgentConversation[]
  messages: AgentMessage[]
  runs: AgentRun[]
  steps: AgentWorkflowStep[]
  attempts: AgentExecutionAttempt[]
  artifacts: AgentArtifact[]
  approvals: AgentApproval[]
  events: AgentDomainEvent[]
}

export type AgentArtifactDraft = Omit<AgentArtifact, 'id' | 'producerRunId' | 'producerStepId' | 'createdAt'> & {
  id?: string
}

export type AgentCapabilityBinding = {
  id: string
  capabilityId: AgentCapabilityId
  capabilityVersion: number
  adapterVersion: string
  priority: number
  lockMode: 'read' | 'write'
  resourceType?: 'Product' | 'Project' | 'Publish' | 'Artifact'
  isHealthy: () => Promise<boolean>
  estimateCost: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  getModelSnapshot?: () => Promise<Record<string, unknown> | undefined>
  execute: (input: Record<string, unknown>, context: AgentAdapterContext) => Promise<AgentToolResult>
}

export type AgentAdapterContext = {
  run: AgentRun
  step: AgentWorkflowStep
  idempotencyKey: string
  dependencyArtifacts: AgentArtifact[]
  registerArtifact: (draft: AgentArtifactDraft) => string
}

export type AgentCapabilityDefinition = {
  id: AgentCapabilityId
  version: number
  title: string
  description: string
  intentType: AgentIntentType
  expectedArtifacts: AgentArtifactKind[]
  bindings: AgentCapabilityBinding[]
}
