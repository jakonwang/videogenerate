import type { AgentCapabilityId, AgentEmployeeManifest, AgentIntentType } from './types'

const createdAt = 1

function employee(input: {
  version?: number
  id: string
  name: string
  description: string
  role: AgentEmployeeManifest['role']
  icon: string
  color: string
  intents: AgentIntentType[]
  capabilities: AgentCapabilityId[]
  plannerPolicy: string
  reviewerPolicy: string
}): AgentEmployeeManifest {
  return {
    id: input.id,
    version: input.version || 1,
    name: input.name,
    description: input.description,
    role: input.role,
    enabled: true,
    builtIn: true,
    icon: input.icon,
    color: input.color,
    allowedIntents: input.intents,
    allowedCapabilities: input.capabilities,
    defaultContext: {},
    plannerPolicy: input.plannerPolicy,
    reviewerPolicy: input.reviewerPolicy,
    approvalPolicy: 'run',
    createdAt,
    updatedAt: createdAt,
  }
}

export const builtInEmployeeManifests: AgentEmployeeManifest[] = [
  employee({
    version: 6,
    id: 'employee.supervisor',
    name: 'Supervisor',
    description: 'Plans goals, coordinates specialists, and delivers results.',
    role: 'supervisor',
    icon: 'sparkles',
    color: '#22c7b8',
    intents: [
      'Intent.ProductInspect',
      'Intent.ProductSave',
      'Intent.ProductManage',
      'Intent.ProductAnalyze',
      'Intent.MaterialPrepare',
      'Intent.MaterialManage',
      'Intent.CommerceVideoCreate',
      'Intent.CloneProjectManage',
      'Intent.ModelIdentityManage',
      'Intent.LivePhotoCreate',
      'Intent.LivePhotoManage',
      'Intent.SubtitleGenerate',
      'Intent.VideoSlice',
      'Intent.VideoPublish',
      'Intent.PublishingManage',
      'Intent.SourceVideoImport',
      'Intent.SourceVideoManage',
      'Intent.ListingGenerate',
      'Intent.ListingExport',
      'Intent.ListingManage',
      'Intent.TiktokCreativeManage',
      'Intent.ProductionBatchCreate',
      'Intent.ProductionQueueControl',
      'Intent.ProductionTaskManage',
      'Intent.TemplateSave',
      'Intent.TemplateManage',
      'Intent.ArtifactInspect',
      'Intent.ArtifactExport',
    ],
    capabilities: [
      'Product.Read',
      'Product.Save',
      'Product.Manage',
      'Product.Analyze',
      'Material.Prepare',
      'Material.Manage',
      'Video.Clone',
      'Video.Clone.Manage',
      'ModelIdentity.Manage',
      'LivePhoto.Create',
      'LivePhoto.Manage',
      'Subtitle.Generate',
      'Video.Slice',
      'Video.Publish',
      'Publishing.Manage',
      'SourceVideo.Import',
      'SourceVideo.Manage',
      'Listing.Generate',
      'Listing.Export',
      'Listing.Manage',
      'TiktokCreative.Manage',
      'Production.BatchCreate',
      'Production.QueueControl',
      'Production.TaskManage',
      'Template.Save',
      'Template.Manage',
      'Artifact.Read',
      'Artifact.Export',
    ],
    plannerPolicy: 'Prefer the smallest complete workflow that satisfies the request.',
    reviewerPolicy: 'Verify required outputs, quantity, and completion before delivery.',
  }),
  employee({
    id: 'employee.material',
    name: 'Material Specialist',
    description: 'Inspects product data and prepares reusable media.',
    role: 'material',
    icon: 'images',
    color: '#50a7ff',
    version: 2,
    intents: ['Intent.ProductInspect', 'Intent.ProductSave', 'Intent.ProductManage', 'Intent.ProductAnalyze', 'Intent.MaterialPrepare', 'Intent.MaterialManage', 'Intent.SourceVideoImport', 'Intent.SourceVideoManage'],
    capabilities: ['Product.Read', 'Product.Save', 'Product.Manage', 'Product.Analyze', 'Material.Prepare', 'Material.Manage', 'SourceVideo.Import', 'SourceVideo.Manage'],
    plannerPolicy: 'Prepare reusable product materials without changing source files.',
    reviewerPolicy: 'Verify product identity and material availability.',
  }),
  employee({
    version: 5,
    id: 'employee.clone',
    name: 'Video Specialist',
    description: 'Creates video work from approved references and products.',
    role: 'clone',
    icon: 'clapperboard',
    color: '#8b78ff',
    intents: ['Intent.CommerceVideoCreate', 'Intent.CloneProjectManage', 'Intent.ModelIdentityManage', 'Intent.LivePhotoCreate', 'Intent.LivePhotoManage', 'Intent.TiktokCreativeManage'],
    capabilities: ['Video.Clone', 'Video.Clone.Manage', 'ModelIdentity.Manage', 'LivePhoto.Create', 'LivePhoto.Manage', 'TiktokCreative.Manage'],
    plannerPolicy: 'Create video outputs from approved references and products.',
    reviewerPolicy: 'Verify output existence and requested quantity.',
  }),
  employee({
    version: 4,
    id: 'employee.package',
    name: 'Packaging Specialist',
    description: 'Creates subtitles and prepares delivery artifacts.',
    role: 'package',
    icon: 'captions',
    color: '#f3a94f',
    intents: ['Intent.SubtitleGenerate', 'Intent.VideoSlice', 'Intent.ListingGenerate', 'Intent.ListingExport', 'Intent.ListingManage', 'Intent.ProductionBatchCreate', 'Intent.ProductionQueueControl', 'Intent.ProductionTaskManage', 'Intent.TemplateSave', 'Intent.TemplateManage', 'Intent.ArtifactInspect', 'Intent.ArtifactExport'],
    capabilities: ['Subtitle.Generate', 'Video.Slice', 'Listing.Generate', 'Listing.Export', 'Listing.Manage', 'Production.BatchCreate', 'Production.QueueControl', 'Production.TaskManage', 'Template.Save', 'Template.Manage', 'Artifact.Read', 'Artifact.Export'],
    plannerPolicy: 'Package existing artifacts without regenerating upstream work.',
    reviewerPolicy: 'Verify subtitle, cover, and export artifacts.',
  }),
  employee({
    version: 2,
    id: 'employee.publish',
    name: 'Publishing Specialist',
    description: 'Publishes approved outputs to approved destinations.',
    role: 'publish',
    icon: 'send',
    color: '#f06f86',
    intents: ['Intent.VideoPublish', 'Intent.PublishingManage'],
    capabilities: ['Video.Publish', 'Publishing.Manage'],
    plannerPolicy: 'Publish only to the approved account and target.',
    reviewerPolicy: 'Verify a publish receipt exists for every requested output.',
  }),
]

export function cloneEmployeeManifest(source: AgentEmployeeManifest, id: string, name: string): AgentEmployeeManifest {
  const now = Date.now()
  return {
    ...source,
    id,
    name,
    role: 'custom',
    builtIn: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: undefined,
  }
}
