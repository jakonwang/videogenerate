import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { cloneRepo } from '../clone/repo'
import { cloneService } from '../clone/service'
import type { ModelIdentityLibraryItem } from '../clone/types'
import { livePhotoService } from '../live-photo/service'
import { productImageMaterialsService } from '../product-image-materials/service'
import { productsRepo } from '../products/repo'
import { webPlatformService } from '../web-platform/service'
import { videoParserDownloadService } from '../video-parser-download/service'
import { tiktokListingService } from '../tiktok-listing/service'
import { tiktokCreativeStudioService } from '../tiktok-creative-studio/service'
import { splitVideoToSegmentFiles } from '../media/segmentSplit'
import { geelarkPublisher } from '../web-platform/geelark'
import { createBatchTasks } from '../tasks/createBatchTasks'
import { taskQueue } from '../tasks/queue'
import { templatesRepo } from '../templates/repo'
import type { Template, TransitionConfig } from '../templates/types'
import { MODEL_PROFILE_OPTION_GROUPS, type ModelProfileOptions } from '../../../shared/modelProfileOptions'
import type {
  AgentArtifact,
  AgentCapabilityBinding,
  AgentCapabilityDefinition,
  AgentCapabilityId,
  AgentIntentType,
  AgentToolResult,
} from './types'

const intentCapabilities: Record<AgentIntentType, AgentCapabilityId> = {
  'Intent.ProductInspect': 'Product.Read',
  'Intent.ProductSave': 'Product.Save',
  'Intent.ProductManage': 'Product.Manage',
  'Intent.ProductAnalyze': 'Product.Analyze',
  'Intent.MaterialPrepare': 'Material.Prepare',
  'Intent.MaterialManage': 'Material.Manage',
  'Intent.CommerceVideoCreate': 'Video.Clone',
  'Intent.CloneProjectManage': 'Video.Clone.Manage',
  'Intent.ModelIdentityManage': 'ModelIdentity.Manage',
  'Intent.LivePhotoCreate': 'LivePhoto.Create',
  'Intent.LivePhotoManage': 'LivePhoto.Manage',
  'Intent.SubtitleGenerate': 'Subtitle.Generate',
  'Intent.VideoSlice': 'Video.Slice',
  'Intent.VideoPublish': 'Video.Publish',
  'Intent.PublishingManage': 'Publishing.Manage',
  'Intent.SourceVideoImport': 'SourceVideo.Import',
  'Intent.SourceVideoManage': 'SourceVideo.Manage',
  'Intent.ListingGenerate': 'Listing.Generate',
  'Intent.ListingExport': 'Listing.Export',
  'Intent.ListingManage': 'Listing.Manage',
  'Intent.TiktokCreativeManage': 'TiktokCreative.Manage',
  'Intent.ProductionBatchCreate': 'Production.BatchCreate',
  'Intent.ProductionQueueControl': 'Production.QueueControl',
  'Intent.ProductionTaskManage': 'Production.TaskManage',
  'Intent.TemplateSave': 'Template.Save',
  'Intent.TemplateManage': 'Template.Manage',
  'Intent.ArtifactInspect': 'Artifact.Read',
  'Intent.ArtifactExport': 'Artifact.Export',
}

type AgentCapabilityDependencies = {
  importShareUrls: typeof videoParserDownloadService.importShareUrls
  getLivePhoto: typeof livePhotoService.get
  retryLivePhoto: typeof livePhotoService.retry
  pauseLivePhoto: typeof livePhotoService.pauseAutoFlow
  resumeLivePhoto: typeof livePhotoService.resumeAutoFlow
  exportLivePhotos: typeof livePhotoService.exportItems
  removeLivePhoto: typeof livePhotoService.remove
  generateLivePhotoSubtitles: typeof livePhotoService.generateSubtitleVideosForItems
  applyLivePhotoSubtitle: typeof livePhotoService.applySubtitleVideoToItem
  revertLivePhotoSubtitle: typeof livePhotoService.revertSubtitleVideoFromItem
  retrySourceVideo: typeof videoParserDownloadService.retryItem
  deleteSourceVideo: typeof videoParserDownloadService.deleteItem
  retryMaterialBatch: typeof productImageMaterialsService.retryBatch
  createMaterialVariants: typeof productImageMaterialsService.createBackgroundVariants
  updateMaterialUsageStatus: typeof productImageMaterialsService.updateMaterialUsageStatus
  bindMaterialProduct: typeof productImageMaterialsService.bindMaterialProduct
  deleteMaterials: typeof productImageMaterialsService.deleteMaterials
  exportMaterials: typeof productImageMaterialsService.exportMaterials
  generateListing: typeof tiktokListingService.generate
  exportListings: typeof tiktokListingService.exportExcel
  listListings: typeof tiktokListingService.list
  saveListing: typeof tiktokListingService.createOrUpdate
  removeListing: typeof tiktokListingService.remove
  saveListingExportConfigs: typeof tiktokListingService.saveExportCategoryConfigs
  removeProduct: typeof productsRepo.remove
  listCreativeTasks: typeof tiktokCreativeStudioService.list
  createCreativeDrafts: typeof tiktokCreativeStudioService.createDraftsFromCloneProjects
  startCreativeShot: typeof tiktokCreativeStudioService.startShot
  startNextCreativeShot: typeof tiktokCreativeStudioService.startNextPendingShot
  completeCreativeShot: typeof tiktokCreativeStudioService.markShotCompleted
  failCreativeShot: typeof tiktokCreativeStudioService.markShotFailed
  removeCreativeTask: typeof tiktokCreativeStudioService.remove
  splitVideo: typeof splitVideoToSegmentFiles
  publishVideo: typeof webPlatformService.publishGeelarkVideo
  listPublishAccounts: typeof geelarkPublisher.listAccounts
  savePublishAccount: typeof geelarkPublisher.upsertAccount
  removePublishAccount: typeof geelarkPublisher.deleteAccount
  listPublishTasks: typeof geelarkPublisher.listTasks
  syncPublishTask: typeof geelarkPublisher.syncTask
  listMusicPresets: typeof geelarkPublisher.listMusicPresets
  saveMusicPreset: typeof geelarkPublisher.upsertMusicPreset
  removeMusicPreset: typeof geelarkPublisher.deleteMusicPreset
  createProductionBatch: typeof createBatchTasks
  enqueueProductionTask: (task: any) => string
  saveProduct: typeof productsRepo.upsert
  analyzeProduct: typeof cloneService.refreshLibraryProductAnalysis
  getCloneProject: typeof cloneService.getProject
  updateCloneProjectMeta: typeof cloneService.updateProjectMeta
  pauseCloneQueue: typeof cloneService.pauseGenerationQueue
  resumeCloneQueue: typeof cloneService.resumeGenerationQueue
  reconcileCloneProject: typeof cloneService.reconcileRemoteStoryboardVideos
  retryCloneShot: typeof cloneService.regenerateShotVideo
  downloadCloneShot: typeof cloneService.forceDownloadShotVideoResult
  composeCloneFinal: typeof cloneService.composeCloneFinalVideo
  exportCloneFinal: typeof cloneService.exportFinalVideos
  generateCloneSubtitles: typeof cloneService.generateSubtitleVideosForProjects
  applyCloneSubtitle: typeof cloneService.applySubtitleVideoToProject
  revertCloneSubtitle: typeof cloneService.revertSubtitleVideoFromProject
  removeCloneProject: typeof cloneService.removeProject
  saveCloneProjectTemplate: typeof cloneService.saveCloneTemplate
  convertCloneProjectTemplate: typeof cloneService.convertToNormalTemplate
  listModelIdentities: typeof cloneService.listModelIdentityLibrary
  generateModelIdentity: typeof cloneService.generateModelIdentityPack
  renameModelIdentity: typeof cloneService.renameModelIdentity
  deleteModelIdentity: typeof cloneService.deleteModelIdentity
  selectProjectModelIdentity: typeof cloneService.selectProjectModelIdentity
  listTemplates: typeof templatesRepo.list
  saveTemplate: typeof templatesRepo.upsert
  removeTemplate: typeof templatesRepo.remove
  controlProductionQueue: (action: 'pause' | 'resume' | 'cancel') => { before: Record<string, unknown>; after: Record<string, unknown> }
  getProductionTask: typeof taskQueue.getTask
  retryProductionTask: typeof taskQueue.retryTask
  cancelProductionTask: typeof taskQueue.cancelTask
  removeProductionTask: typeof taskQueue.removeTask
}

const defaultCapabilityDependencies: AgentCapabilityDependencies = {
  importShareUrls: (input) => videoParserDownloadService.importShareUrls(input),
  getLivePhoto: (id) => livePhotoService.get(id),
  retryLivePhoto: (input) => livePhotoService.retry(input),
  pauseLivePhoto: (input) => livePhotoService.pauseAutoFlow(input),
  resumeLivePhoto: (input) => livePhotoService.resumeAutoFlow(input),
  exportLivePhotos: (input) => livePhotoService.exportItems(input),
  removeLivePhoto: (id) => livePhotoService.remove(id),
  generateLivePhotoSubtitles: (input) => livePhotoService.generateSubtitleVideosForItems(input),
  applyLivePhotoSubtitle: (input) => livePhotoService.applySubtitleVideoToItem(input),
  revertLivePhotoSubtitle: (input) => livePhotoService.revertSubtitleVideoFromItem(input),
  retrySourceVideo: (input) => videoParserDownloadService.retryItem(input),
  deleteSourceVideo: (input) => videoParserDownloadService.deleteItem(input),
  retryMaterialBatch: (input) => productImageMaterialsService.retryBatch(input),
  createMaterialVariants: (input) => productImageMaterialsService.createBackgroundVariants(input),
  updateMaterialUsageStatus: (input) => productImageMaterialsService.updateMaterialUsageStatus(input),
  bindMaterialProduct: (input) => productImageMaterialsService.bindMaterialProduct(input),
  deleteMaterials: (input) => productImageMaterialsService.deleteMaterials(input),
  exportMaterials: (input) => productImageMaterialsService.exportMaterials(input),
  generateListing: (input) => tiktokListingService.generate(input),
  exportListings: (input) => tiktokListingService.exportExcel(input),
  listListings: () => tiktokListingService.list(),
  saveListing: (input) => tiktokListingService.createOrUpdate(input),
  removeListing: (id) => tiktokListingService.remove(id),
  saveListingExportConfigs: (input) => tiktokListingService.saveExportCategoryConfigs(input),
  removeProduct: (id) => productsRepo.remove(id),
  listCreativeTasks: () => tiktokCreativeStudioService.list(),
  createCreativeDrafts: (input) => tiktokCreativeStudioService.createDraftsFromCloneProjects(input),
  startCreativeShot: (input) => tiktokCreativeStudioService.startShot(input),
  startNextCreativeShot: (input) => tiktokCreativeStudioService.startNextPendingShot(input),
  completeCreativeShot: (input) => tiktokCreativeStudioService.markShotCompleted(input),
  failCreativeShot: (input) => tiktokCreativeStudioService.markShotFailed(input),
  removeCreativeTask: (id) => tiktokCreativeStudioService.remove(id),
  splitVideo: (input) => splitVideoToSegmentFiles(input),
  publishVideo: (token, input) => webPlatformService.publishGeelarkVideo(token, input),
  listPublishAccounts: (userId) => geelarkPublisher.listAccounts(userId),
  savePublishAccount: (userId, input) => geelarkPublisher.upsertAccount(userId, input),
  removePublishAccount: (userId, id) => geelarkPublisher.deleteAccount(userId, id),
  listPublishTasks: (userId) => geelarkPublisher.listTasks(userId),
  syncPublishTask: (userId, id) => geelarkPublisher.syncTask(userId, id),
  listMusicPresets: (userId) => geelarkPublisher.listMusicPresets(userId),
  saveMusicPreset: (userId, input) => geelarkPublisher.upsertMusicPreset(userId, input),
  removeMusicPreset: (userId, id) => geelarkPublisher.deleteMusicPreset(userId, id),
  createProductionBatch: (input) => createBatchTasks(input),
  enqueueProductionTask: (task) => {
    taskQueue.enqueue(task)
    return text(taskQueue.list()[0]?.id)
  },
  saveProduct: (input) => productsRepo.upsert(input),
  analyzeProduct: (input) => cloneService.refreshLibraryProductAnalysis(input),
  getCloneProject: (input) => cloneService.getProject(input),
  updateCloneProjectMeta: (input) => cloneService.updateProjectMeta(input),
  pauseCloneQueue: (input) => cloneService.pauseGenerationQueue(input),
  resumeCloneQueue: (input) => cloneService.resumeGenerationQueue(input),
  reconcileCloneProject: (input) => cloneService.reconcileRemoteStoryboardVideos(input),
  retryCloneShot: (input) => cloneService.regenerateShotVideo(input),
  downloadCloneShot: (input) => cloneService.forceDownloadShotVideoResult(input),
  composeCloneFinal: (input) => cloneService.composeCloneFinalVideo(input),
  exportCloneFinal: (input) => cloneService.exportFinalVideos(input),
  generateCloneSubtitles: (input) => cloneService.generateSubtitleVideosForProjects(input),
  applyCloneSubtitle: (input) => cloneService.applySubtitleVideoToProject(input),
  revertCloneSubtitle: (input) => cloneService.revertSubtitleVideoFromProject(input),
  removeCloneProject: (input) => cloneService.removeProject(input),
  saveCloneProjectTemplate: (input) => cloneService.saveCloneTemplate(input),
  convertCloneProjectTemplate: (input) => cloneService.convertToNormalTemplate(input),
  listModelIdentities: () => cloneService.listModelIdentityLibrary(),
  generateModelIdentity: (input) => cloneService.generateModelIdentityPack(input),
  renameModelIdentity: (input) => cloneService.renameModelIdentity(input),
  deleteModelIdentity: (input) => cloneService.deleteModelIdentity(input),
  selectProjectModelIdentity: (input) => cloneService.selectProjectModelIdentity(input),
  listTemplates: () => templatesRepo.list(),
  saveTemplate: (input) => templatesRepo.upsert(input),
  removeTemplate: (id) => templatesRepo.remove(id),
  getProductionTask: (id) => taskQueue.getTask(id),
  retryProductionTask: (id) => taskQueue.retryTask(id),
  cancelProductionTask: (id) => taskQueue.cancelTask(id),
  removeProductionTask: (id) => taskQueue.removeTask(id),
  controlProductionQueue: (action) => {
    const before = taskQueue.stats()
    if (action === 'pause') taskQueue.pause()
    else if (action === 'resume') taskQueue.resume()
    else taskQueue.cancelAll()
    return { before, after: taskQueue.stats() }
  },
}

let capabilityDependencies: AgentCapabilityDependencies = { ...defaultCapabilityDependencies }

export function setAgentCapabilityTestDependencies(input: Partial<AgentCapabilityDependencies>) {
  capabilityDependencies = { ...capabilityDependencies, ...input }
}

export function resetAgentCapabilityTestDependencies() {
  capabilityDependencies = { ...defaultCapabilityDependencies }
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

const modelProfileValues = new Set(MODEL_PROFILE_OPTION_GROUPS.flatMap((group) => group.options.map((item) => item.value)))

function modelProfileOptions(value: unknown): ModelProfileOptions | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const output: Record<string, string> = {}
  for (const group of MODEL_PROFILE_OPTION_GROUPS) {
    const selected = text(source[group.key])
    if (modelProfileValues.has(selected as never)) output[group.key] = selected
  }
  return Object.keys(output).length ? output as ModelProfileOptions : undefined
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : undefined
}

function completed(input?: Partial<AgentToolResult>): AgentToolResult {
  return {
    success: true,
    status: 'completed',
    artifactIds: [],
    logs: [],
    warnings: [],
    cost: {},
    retryable: false,
    externalRefs: {},
    ...input,
  }
}

function failed(code: string, message: string, retryable = false): AgentToolResult {
  return {
    success: false,
    status: 'failed',
    artifactIds: [],
    logs: [],
    warnings: [],
    cost: {},
    retryable,
    externalRefs: {},
    error: { code, message },
  }
}

function imagePathsFromProduct(product: any) {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(product?.images) ? product.images.map((item: any) => text(item?.filePath)) : []),
        text(product?.coverImagePath),
        text(product?.livePhotoReferenceImagePath),
      ].filter(Boolean),
    ),
  )
}

async function resolveProduct(input: Record<string, unknown>) {
  const products = await productsRepo.list()
  const productId = text(input.productId)
  if (productId) return products.find((item) => item.id === productId) || null
  const request = text(input.request).toLowerCase()
  return products.find((item) => request.includes(text(item.name).toLowerCase())) || products[0] || null
}

function materialCategory(value: unknown): 'necklace' | 'ring' | 'earring' | 'bracelet' {
  const normalized = text(value).toLowerCase()
  if (normalized.includes('necklace') || normalized.includes('\u9879\u94fe')) return 'necklace'
  if (normalized.includes('earring') || normalized.includes('\u8033')) return 'earring'
  if (normalized.includes('bracelet') || normalized.includes('\u624b\u94fe')) return 'bracelet'
  return 'ring'
}

function livePhotoMotionTemplate(value: unknown): 'push_in' | 'push_out' | 'ambient_sway' | undefined {
  const normalized = text(value)
  if (normalized === 'push_in' || normalized === 'push_out' || normalized === 'ambient_sway') return normalized
  return undefined
}

async function safeModelSnapshot() {
  const credentials = await cloneRepo.getCredentials()
  return {
    chat: {
      profile: text(credentials.chatApifoxHubProfile),
      model: text((credentials as any)?.vectorEngineHub?.chatModel || (credentials as any)?.ai666Hub?.chatModel || credentials.grsaiAnalysisModel),
    },
    image: {
      profile: text(credentials.imageApifoxHubProfile || credentials.imageProviderPrimary),
      model: text(credentials.openaiImageModel || credentials.grsaiImageModel || credentials.klingImageModel),
    },
    video: {
      profile: text(credentials.videoApifoxHubProfile || credentials.videoProviderPrimary),
      model: text(credentials.videoModelPrimary || credentials.grsaiVideoModel),
    },
  }
}

const productReadBinding: AgentCapabilityBinding = {
  id: 'binding.product.read.local.v1',
  capabilityId: 'Product.Read',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'read',
  resourceType: 'Product',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const products = await productsRepo.list()
    const product = await resolveProduct(input)
    const rows = product ? [product] : products
    const artifactId = context.registerArtifact({
      kind: 'report',
      name: product ? `Product inspection: ${product.name}` : 'Product library inspection',
      uri: product ? `agent-product://${product.id}` : 'agent-product://all',
      metadata: {
        count: rows.length,
        products: rows.slice(0, 20).map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          imageCount: imagePathsFromProduct(item).length,
        })),
      },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [artifactId],
      logs: [product ? `Matched product ${product.id}` : `Listed ${rows.length} products`],
      warnings: product || products.length ? [] : ['The product library is empty.'],
      externalRefs: product ? { productId: product.id } : {},
    })
  },
}

const productTypes = new Set([
  'phone_case',
  'earring',
  'necklace',
  'ring',
  'bracelet',
  'clothes',
  'bag',
  'shoes',
  'toy',
  'general',
])

const storyboardTemplateTypes = new Set([
  'general',
  'jewelry',
  'ecommerce_packaging',
  'lifestyle_interaction',
])

const productSaveBinding: AgentCapabilityBinding = {
  id: 'binding.product.save.local.v1',
  capabilityId: 'Product.Save',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Product',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const productId = text(input.productId)
    const products = await productsRepo.list()
    const current = productId ? products.find((item) => item.id === productId) : undefined
    if (productId && !current) return failed('product_not_found', 'The selected product does not exist.')

    const name = text(input.productName || input.name) || current?.name || ''
    if (!name) return failed('missing_product_name', 'Add a product name before creating the product.')
    const requestedType = text(input.productType).toLowerCase()
    const productType = productTypes.has(requestedType) ? requestedType : current?.type || 'general'
    const requestedStoryboardType = text(input.storyboardTemplateType).toLowerCase()
    const imagePaths = Array.from(new Set(strings(input.imagePaths)))
    const images = []
    for (const imagePath of imagePaths) {
      if (!/\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(imagePath)) {
        return failed('invalid_product_image', `Unsupported product image format: ${imagePath}`)
      }
      try {
        const details = await stat(imagePath)
        if (!details.isFile()) return failed('invalid_product_image', `Product image is not a file: ${imagePath}`)
        images.push({
          id: randomUUID(),
          productId: current?.id || '',
          filePath: imagePath,
          fileName: basename(imagePath),
          fileSize: details.size,
          thumbnailPath: imagePath,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isCover: images.length === 0,
        })
      } catch {
        return failed('invalid_product_image', `Product image does not exist: ${imagePath}`)
      }
    }

    const saved = await capabilityDependencies.saveProduct({
      ...(current ? { id: current.id } : {}),
      name,
      type: productType as any,
      ...(Object.prototype.hasOwnProperty.call(input, 'remark') ? { remark: text(input.remark) } : {}),
      ...(storyboardTemplateTypes.has(requestedStoryboardType)
        ? { storyboardTemplateType: requestedStoryboardType as any }
        : {}),
      ...(imagePaths.length ? {
        images,
        coverImagePath: images[0]?.filePath,
        livePhotoReferenceImagePath: images[0]?.filePath,
      } : {}),
    })
    const artifactId = context.registerArtifact({
      kind: 'product',
      name: saved.name,
      uri: `agent-product://${saved.id}`,
      metadata: {
        productId: saved.id,
        type: saved.type,
        imageCount: saved.images?.length || 0,
        action: current ? 'updated' : 'created',
      },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [artifactId],
      logs: [`${current ? 'Updated' : 'Created'} product ${saved.id}`],
      externalRefs: { productId: saved.id },
    })
  },
}

const productManageBinding: AgentCapabilityBinding = {
  id: 'binding.product.manage.local.v1',
  capabilityId: 'Product.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Product',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const action = text(input.action)
    const productId = text(input.productId)
    if (action !== 'delete') return failed('unsupported_product_action', 'Choose delete for the product operation.')
    if (!productId) return failed('missing_product', 'Select a product before deletion.')
    const product = (await productsRepo.list()).find((item) => item.id === productId)
    if (!product) return failed('product_not_found', 'The selected product does not exist.')
    await capabilityDependencies.removeProduct(productId)
    const reportId = context.registerArtifact({
      kind: 'report',
      name: `Deleted product ${product.name}`,
      uri: `agent-product-action://${context.step.id}`,
      metadata: { action, productId, productName: product.name, deleted: true },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [reportId],
      logs: [`Deleted product record ${productId}`],
      externalRefs: { productId },
    })
  },
}

const productAnalyzeBinding: AgentCapabilityBinding = {
  id: 'binding.product.analyze.desktop.v1',
  capabilityId: 'Product.Analyze',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Product',
  isHealthy: async () => true,
  estimateCost: async () => ({ quantity: 1, unit: 'product_analysis' }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const productId = text(input.productId)
    if (!productId) return failed('missing_product', 'Select a product before refreshing its analysis.')
    const current = (await productsRepo.list()).find((item) => item.id === productId)
    if (!current) return failed('product_not_found', 'The selected product does not exist.')
    await capabilityDependencies.analyzeProduct({ productId })
    const product = (await productsRepo.list()).find((item) => item.id === productId) || current
    const artifactId = context.registerArtifact({
      kind: 'report',
      name: `Product analysis: ${product.name}`,
      uri: `agent-product://${product.id}/analysis`,
      metadata: {
        productId: product.id,
        analysis: product.productAnalysis || null,
        analysisBoardPath: product.analysisBoardPath,
      },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [artifactId],
      logs: [`Refreshed product analysis ${product.id}`],
      warnings: product.productAnalysis ? [] : ['The product analysis did not return structured details.'],
      externalRefs: { productId: product.id },
    })
  },
}

const materialPrepareBinding: AgentCapabilityBinding = {
  id: 'binding.material.prepare.local.v1',
  capabilityId: 'Material.Prepare',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Product',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const sourceVideoPaths = strings(input.videoPaths)
    if (!sourceVideoPaths.length) return failed('missing_video', 'Add video materials before preparing them.')
    const product = await resolveProduct(input)
    const batch = await productImageMaterialsService.createBatch({
      userId: 'desktop-local',
      category: materialCategory(product?.type || input.category),
      sourceVideoPaths,
    })
    const artifactId = context.registerArtifact({
      kind: 'manifest',
      name: 'Material preparation batch',
      uri: `agent-material-batch://${batch.id}`,
      metadata: { batchId: batch.id, status: batch.status, sourceVideoPaths },
      sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
      lifecycle: 'referenced',
    })
    return completed({
      status: batch.status === 'completed' ? 'completed' : 'accepted',
      artifactIds: [artifactId],
      logs: [`Created material batch ${batch.id}`],
      externalRefs: { batchId: batch.id, ...(product ? { productId: product.id } : {}) },
    })
  },
}

const materialManageBinding: AgentCapabilityBinding = {
  id: 'binding.material.manage.desktop.v1',
  capabilityId: 'Material.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async (input) => ({
    action: text(input.action),
    quantity: Math.max(1, strings(input.materialIds).length),
  }),
  execute: async (input, context) => {
    const action = text(input.action).toLowerCase()
    const materialIds = Array.from(new Set([
      text(input.materialId),
      ...strings(input.materialIds),
    ].filter(Boolean)))
    const userId = 'desktop-local'
    const artifactIds: string[] = []
    const sourceArtifactIds = context.dependencyArtifacts.map((item) => item.id)
    let metadata: Record<string, unknown> = { action, materialIds }
    let logs: string[] = []
    let warnings: string[] = []

    if (action === 'retry_batch') {
      const batchId = text(input.batchId)
      if (!batchId) return failed('missing_batch_id', 'Select a material batch to retry.')
      const batch = await capabilityDependencies.retryMaterialBatch({ userId, batchId })
      metadata = { action, batchId: batch.id, status: batch.status }
      logs = [`Retried material batch ${batch.id}`]
    } else if (action === 'create_variants') {
      if (!materialIds.length) return failed('missing_material_id', 'Select at least one material.')
      const result = await capabilityDependencies.createMaterialVariants({
        userId,
        materialIds,
        variantCount: Math.max(1, Math.min(6, Number(input.variantCount || 1) || 1)),
      })
      for (const item of result.created) {
        artifactIds.push(context.registerArtifact({
          kind: 'image',
          name: basename(text(item.localImagePath)) || `Material variant ${item.id}`,
          uri: `agent-material://${item.id}`,
          localPath: text(item.localImagePath) || undefined,
          metadata: {
            materialId: item.id,
            derivedFromMaterialId: item.derivedFromMaterialId,
            category: item.category,
          },
          sourceArtifactIds,
          lifecycle: 'managed',
        }))
      }
      metadata = { action, materialIds, createdCount: result.count, failedCount: result.failedCount }
      logs = [`Created ${result.count} material variants`]
      warnings = result.errors
    } else if (action === 'bind_product') {
      if (materialIds.length !== 1) return failed('invalid_material_selection', 'Select exactly one material to bind.')
      const productId = text(input.productId) || undefined
      const material = await capabilityDependencies.bindMaterialProduct({ userId, materialId: materialIds[0], productId })
      metadata = { action, materialId: material.id, productId: material.boundProductId || null }
      logs = [productId ? `Bound material ${material.id} to product ${productId}` : `Removed the product binding from material ${material.id}`]
    } else if (action === 'update_usage') {
      if (!materialIds.length) return failed('missing_material_id', 'Select at least one material.')
      const usageStatus = text(input.usageStatus)
      if (usageStatus !== 'used' && usageStatus !== 'unused') {
        return failed('invalid_usage_status', 'Choose either used or unused material status.')
      }
      for (const materialId of materialIds) {
        await capabilityDependencies.updateMaterialUsageStatus({ userId, materialId, usageStatus })
      }
      metadata = { action, materialIds, usageStatus }
      logs = [`Updated ${materialIds.length} material usage records`]
    } else if (action === 'export') {
      if (!materialIds.length) return failed('missing_material_id', 'Select at least one material to export.')
      const outputDir = text(input.outputDir)
      if (!outputDir) return failed('missing_output_directory', 'Choose an output directory.')
      const result = await capabilityDependencies.exportMaterials({ userId, materialIds, outputDir })
      for (const item of result.exported) {
        artifactIds.push(context.registerArtifact({
          kind: 'image',
          name: basename(item.filePath),
          uri: `agent-material-export://${item.id}`,
          localPath: item.filePath,
          metadata: { materialId: item.id, outputDir },
          sourceArtifactIds,
          lifecycle: 'managed',
        }))
      }
      metadata = { action, materialIds, outputDir, exportedCount: result.count }
      logs = [`Exported ${result.count} materials`]
    } else if (action === 'delete') {
      if (!materialIds.length) return failed('missing_material_id', 'Select at least one material to delete.')
      const result = await capabilityDependencies.deleteMaterials({ userId, materialIds })
      metadata = { action, deletedIds: result.ids, deletedCount: result.count }
      logs = [`Deleted ${result.count} materials`]
    } else {
      return failed('unsupported_material_action', 'The requested material action is not supported.')
    }

    const reportId = context.registerArtifact({
      kind: 'report',
      name: 'Material operation result',
      uri: `agent-material-action://${context.step.id}`,
      metadata,
      sourceArtifactIds,
      lifecycle: 'referenced',
    })
    return completed({
      success: warnings.length === 0,
      status: warnings.length ? 'partial' : 'completed',
      artifactIds: [reportId, ...artifactIds],
      logs,
      warnings,
      retryable: action === 'retry_batch' || action === 'create_variants',
      externalRefs: {
        ...(text(input.batchId) ? { batchId: text(input.batchId) } : {}),
        ...(materialIds.length ? { materialIds: materialIds.join(',') } : {}),
      },
    })
  },
}

const videoCloneBinding: AgentCapabilityBinding = {
  id: 'binding.video.clone.desktop.v1',
  capabilityId: 'Video.Clone',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Project',
  isHealthy: async () => true,
  estimateCost: async (input) => ({ quantity: Math.max(1, Number(input.quantity || 1)), unit: 'video' }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const referenceVideoPath = text(input.referenceVideoPath) || strings(input.videoPaths)[0]
    if (!referenceVideoPath) return failed('missing_reference_video', 'Add a reference video before creating a video.')
    const product = await resolveProduct(input)
    const productImagePaths = Array.from(new Set([...strings(input.productImagePaths), ...(product ? imagePathsFromProduct(product) : [])]))
    const draft = await cloneService.createDraftProject({
      locale: 'zh-CN',
      runMode: 'auto',
      title: text(input.request).slice(0, 48) || 'Agent video task',
    })
    await cloneService.bindProjectReferenceVideo({ cloneProjectId: draft.project.id, videoPath: referenceVideoPath })
    if (product?.id) {
      await cloneService.bindProjectProduct({ cloneProjectId: draft.project.id, productId: product.id })
    } else if (productImagePaths.length) {
      await cloneService.saveProjectProductImages({ cloneProjectId: draft.project.id, productReferenceImagePaths: productImagePaths })
    }
    const projectArtifactId = context.registerArtifact({
      kind: 'project',
      name: draft.project.title || 'Video creation project',
      uri: `agent-clone-project://${draft.project.id}`,
      metadata: { projectId: draft.project.id, referenceVideoPath },
      sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
      lifecycle: 'referenced',
    })
    try {
      const result = await cloneService.autoRunCloneToStoryboardVideos({
        cloneProjectId: draft.project.id,
        variantCount: Math.max(1, Math.min(6, Number(input.quantity || 3))),
        productReferenceImagePaths: productImagePaths,
        autoBindModelPack: true,
      })
      const project = result.project
      const finalPath = text(project?.finalCompose?.outputPath)
      const artifactIds = [projectArtifactId]
      if (finalPath) {
        artifactIds.push(context.registerArtifact({
          kind: 'video',
          name: basename(finalPath),
          uri: `vg-file://${encodeURIComponent(finalPath)}`,
          localPath: finalPath,
          metadata: { projectId: draft.project.id },
          sourceArtifactIds: [projectArtifactId],
          lifecycle: 'managed',
        }))
      }
      return completed({
        status: finalPath ? 'completed' : 'accepted',
        artifactIds,
        logs: [`Created clone project ${draft.project.id}`],
        warnings: finalPath ? [] : ['The project was created and video generation is still running.'],
        externalRefs: { projectId: draft.project.id },
      })
    } catch (error) {
      return completed({
        success: false,
        status: 'partial',
        artifactIds: [projectArtifactId],
        warnings: [String((error as Error)?.message || error)],
        retryable: true,
        externalRefs: { projectId: draft.project.id },
        error: { code: 'clone_incomplete', message: String((error as Error)?.message || error) },
      })
    }
  },
}

const cloneProjectManageBinding: AgentCapabilityBinding = {
  id: 'binding.video.clone.manage.desktop.v1',
  capabilityId: 'Video.Clone.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Project',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const action = text(input.action).toLowerCase()
    const projectId = text(input.cloneProjectId) || text(input.projectId)
    if (!projectId) return failed('missing_clone_project_id', 'Select an existing clone project.')
    const project: any = await capabilityDependencies.getCloneProject({ cloneProjectId: projectId })
    if (!project) return failed('clone_project_not_found', 'The selected clone project does not exist.')

    const artifactIds: string[] = []
    const warnings: string[] = []
    const logs: string[] = []
    let metadata: Record<string, unknown> = { action, projectId }
    let accepted = false

    if (action === 'update_meta') {
      const title = text(input.title)
      const description = text(input.description)
      if (!title && !description) return failed('missing_project_metadata', 'Add a title or description to update.')
      const result: any = await capabilityDependencies.updateCloneProjectMeta({
        cloneProjectId: projectId,
        title: title || undefined,
        description: description || undefined,
      })
      metadata = { ...metadata, title: result.project?.title, description: result.project?.description }
      logs.push(`Updated clone project ${projectId}`)
    } else if (action === 'pause_queue') {
      const queue: any = await capabilityDependencies.pauseCloneQueue({ cloneProjectId: projectId })
      metadata = { ...metadata, queue }
      logs.push(`Paused generation queue for ${projectId}`)
    } else if (action === 'resume_queue') {
      const queue: any = await capabilityDependencies.resumeCloneQueue({ cloneProjectId: projectId })
      metadata = { ...metadata, queue }
      accepted = true
      logs.push(`Resumed generation queue for ${projectId}`)
    } else if (action === 'reconcile') {
      const result: any = await capabilityDependencies.reconcileCloneProject({ cloneProjectId: projectId })
      if (result?.missing) return failed('clone_project_not_found', 'The selected clone project no longer exists.')
      metadata = { ...metadata, resultCount: Array.isArray(result?.results) ? result.results.length : 0 }
      accepted = true
      logs.push(`Reconciled remote work for ${projectId}`)
    } else if (action === 'retry_shot' || action === 'download_shot') {
      const shotId = text(input.shotId)
      if (!shotId) return failed('missing_clone_shot_id', 'Select a storyboard shot.')
      const result: any = action === 'retry_shot'
        ? await capabilityDependencies.retryCloneShot({ cloneProjectId: projectId, shotId })
        : await capabilityDependencies.downloadCloneShot({ cloneProjectId: projectId, shotId })
      metadata = { ...metadata, shotId, status: result?.status, taskId: result?.task?.taskId, synced: Boolean(result?.synced) }
      accepted = !result?.synced
      logs.push(`${action === 'retry_shot' ? 'Retried' : 'Downloaded'} shot ${shotId} for ${projectId}`)
    } else if (action === 'compose') {
      const result: any = await capabilityDependencies.composeCloneFinal({
        cloneProjectId: projectId,
        outputDir: text(input.outputDir) || undefined,
      })
      const outputPath = text(result?.finalCompose?.outputPath)
      if (!outputPath) return failed('clone_compose_incomplete', 'The final video was not produced.', true)
      artifactIds.push(context.registerArtifact({
        kind: 'video',
        name: basename(outputPath),
        uri: `vg-file://${encodeURIComponent(outputPath)}`,
        localPath: outputPath,
        mimeType: 'video/mp4',
        metadata: { projectId, composeHealth: result?.finalCompose?.composeHealth },
        sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
        lifecycle: 'managed',
      }))
      metadata = { ...metadata, outputPath }
      logs.push(`Composed final video for ${projectId}`)
    } else if (action === 'export') {
      const outputDir = text(input.outputDir)
      if (!outputDir) return failed('missing_output_directory', 'Select an output directory.')
      const result = await capabilityDependencies.exportCloneFinal({ cloneProjectIds: [projectId], outputDir })
      for (const exported of result.exported) {
        artifactIds.push(context.registerArtifact({
          kind: 'video',
          name: basename(exported.targetPath),
          uri: `vg-file://${encodeURIComponent(exported.targetPath)}`,
          localPath: exported.targetPath,
          mimeType: 'video/mp4',
          metadata: { projectId, sourcePath: exported.sourcePath, outputDir: result.outputDir },
          sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
          lifecycle: 'managed',
        }))
      }
      warnings.push(...result.skipped.map((item) => `${item.cloneProjectId}: ${item.reason}`))
      metadata = { ...metadata, outputDir: result.outputDir, exportedCount: result.exported.length, skippedCount: result.skipped.length }
      logs.push(`Exported ${result.exported.length} final videos`)
    } else if (action === 'subtitle_generate') {
      const sourceVideoPath = text(project.finalCompose?.subtitleOverlay?.originalOutputPath || project.finalCompose?.outputPath)
      if (!sourceVideoPath) return failed('missing_clone_final_video', 'The project does not have a final video.')
      const titleText = text(input.titleText)
      const sourceItemId = `clone-project-${projectId}`
      const result: any = await capabilityDependencies.generateCloneSubtitles({
        name: text(input.jobName) || `Clone subtitles ${new Date().toISOString()}`,
        sourceItems: [{
          id: sourceItemId,
          sourceType: 'clone_final',
          sourceVideoPath,
          sourceProjectId: projectId,
          sourceProjectTitle: project.title,
          fileName: basename(sourceVideoPath),
          coverImagePath: project.finalCompose?.coverImagePath,
        }],
        subtitleMode: titleText ? 'static_title' : 'timed_caption',
        subtitleSource: titleText ? 'manual' : 'whisper_compatible',
        exportEngine: 'ass_fallback',
        titleRenderMode: titleText ? 'overlay_image' : 'ass_text',
        titleConfig: titleText ? { strategy: 'single_for_all', singleText: titleText } : undefined,
        titleItems: [],
      })
      const output = (Array.isArray(result?.outputs) ? result.outputs : []).find((item: any) =>
        item.renderStatus === 'success' && text(item.outputVideoPath),
      )
      if (!output) return failed('clone_subtitle_generation_failed', 'No subtitle video was generated.', true)
      const outputPath = text(output.outputVideoPath)
      await capabilityDependencies.applyCloneSubtitle({
        cloneProjectId: projectId,
        subtitleVideoPath: outputPath,
        subtitleCoverImagePath: text(output.coverImagePath) || undefined,
      })
      artifactIds.push(context.registerArtifact({
        kind: 'video',
        name: basename(outputPath),
        uri: `vg-file://${encodeURIComponent(outputPath)}`,
        localPath: outputPath,
        mimeType: 'video/mp4',
        metadata: { projectId, subtitleJobId: result.id, titleText: titleText || undefined },
        sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
        lifecycle: 'managed',
      }))
      metadata = { ...metadata, subtitleJobId: result.id, outputPath, titleText: titleText || undefined }
      logs.push(`Generated and applied subtitles to ${projectId}`)
    } else if (action === 'subtitle_revert') {
      await capabilityDependencies.revertCloneSubtitle({ cloneProjectId: projectId })
      logs.push(`Reverted subtitles for ${projectId}`)
    } else if (action === 'save_clone_template' || action === 'convert_template') {
      const result = action === 'save_clone_template'
        ? await capabilityDependencies.saveCloneProjectTemplate({ cloneProjectId: projectId, name: text(input.templateName) || undefined })
        : await capabilityDependencies.convertCloneProjectTemplate({ cloneProjectId: projectId, name: text(input.templateName) || undefined })
      artifactIds.push(context.registerArtifact({
        kind: 'template',
        name: result.templateName,
        uri: `agent-template://${result.templateId}`,
        metadata: { projectId, templateId: result.templateId, action },
        sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
        lifecycle: 'referenced',
      }))
      metadata = { ...metadata, templateId: result.templateId, templateName: result.templateName }
      logs.push(`Saved template ${result.templateId} from ${projectId}`)
    } else if (action === 'delete') {
      const removed = await capabilityDependencies.removeCloneProject({ cloneProjectId: projectId, force: true })
      metadata = { ...metadata, removed: Boolean(removed) }
      logs.push(`Deleted clone project ${projectId}`)
    } else {
      return failed('unsupported_clone_project_action', 'The requested clone project action is not supported.')
    }

    const reportId = context.registerArtifact({
      kind: 'report',
      name: 'Clone project operation result',
      uri: `agent-clone-project-action://${context.step.id}`,
      metadata,
      sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
      lifecycle: 'referenced',
    })
    return completed({
      success: warnings.length === 0,
      status: accepted ? 'accepted' : warnings.length ? 'partial' : 'completed',
      artifactIds: [reportId, ...artifactIds],
      logs,
      warnings,
      retryable: ['resume_queue', 'reconcile', 'retry_shot', 'download_shot', 'compose', 'subtitle_generate'].includes(action),
      externalRefs: { projectId, ...(text(input.shotId) ? { shotId: text(input.shotId) } : {}) },
    })
  },
}

const modelIdentityManageBinding: AgentCapabilityBinding = {
  id: 'binding.model-identity.manage.desktop.v1',
  capabilityId: 'ModelIdentity.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async (input) => ({
    action: text(input.action),
    quantity: text(input.action).toLowerCase() === 'generate' ? 1 : 0,
    unit: 'model_identity',
  }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const action = text(input.action).toLowerCase()
    const identityId = text(input.identityId)
    const existingItems = action === 'generate' ? [] : await capabilityDependencies.listModelIdentities()
    const existing = identityId ? existingItems.find((item) => item.id === identityId) : undefined

    if (action === 'generate') {
      const generated = await capabilityDependencies.generateModelIdentity({
        purpose: 'model_library',
        productType: ['earrings', 'phone_case', 'clothes', 'toy', 'general'].includes(text(input.productType))
          ? text(input.productType) as 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
          : 'general',
        productPoints: text(input.productPoints) || undefined,
        modelProfileOptions: modelProfileOptions(input.profile),
        modelReferenceImagePaths: strings(input.referenceImagePaths),
      }) as ModelIdentityLibraryItem
      const imageArtifactIds = generated.imagePaths.map((imagePath, index) => context.registerArtifact({
        kind: 'image',
        name: basename(imagePath) || `${generated.name} ${index + 1}`,
        uri: `agent-model-identity-image://${generated.id}/${index + 1}`,
        localPath: imagePath,
        metadata: { identityId: generated.id, role: index === 0 ? 'cover' : 'reference' },
        sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
        lifecycle: 'managed',
      }))
      const reportId = context.registerArtifact({
        kind: 'report',
        name: generated.name,
        uri: `agent-model-identity://${generated.id}`,
        metadata: {
          identityId: generated.id,
          status: generated.status,
          productType: generated.productType,
          imageCount: generated.imagePaths.length,
        },
        sourceArtifactIds: imageArtifactIds,
        lifecycle: 'referenced',
      })
      return completed({
        success: generated.status !== 'failed',
        status: generated.status === 'done' ? 'completed' : generated.status === 'failed' ? 'failed' : 'accepted',
        artifactIds: [reportId, ...imageArtifactIds],
        logs: [`Generated model identity ${generated.id}`],
        warnings: generated.error ? [generated.error] : [],
        retryable: generated.status === 'failed',
        externalRefs: { identityId: generated.id },
        ...(generated.status === 'failed'
          ? { error: { code: 'model_identity_generation_failed', message: generated.error || 'Model identity generation failed.' } }
          : {}),
      })
    }

    if (!identityId) return failed('missing_model_identity', 'Select a model identity.')
    if (!existing) return failed('model_identity_not_found', 'The selected model identity does not exist.')

    if (action === 'rename') {
      const name = text(input.name)
      if (!name) return failed('missing_model_identity_name', 'Add a new model identity name.')
      const renamed = await capabilityDependencies.renameModelIdentity({ id: identityId, name })
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: renamed.name,
        uri: `agent-model-identity://${renamed.id}`,
        metadata: { action, identityId: renamed.id, name: renamed.name },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Renamed model identity ${identityId}`], externalRefs: { identityId } })
    }

    if (action === 'assign') {
      const cloneProjectId = text(input.cloneProjectId)
      if (!cloneProjectId) return failed('missing_clone_project', 'Select a clone project for the model identity.')
      const project = await capabilityDependencies.selectProjectModelIdentity({ cloneProjectId, identityId })
      const artifactId = context.registerArtifact({
        kind: 'project',
        name: text(project.title) || `Clone project ${cloneProjectId}`,
        uri: `agent-clone-project://${cloneProjectId}`,
        metadata: { action, cloneProjectId, identityId, identityName: existing.name },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Assigned model identity ${identityId} to project ${cloneProjectId}`], externalRefs: { identityId, cloneProjectId } })
    }

    if (action === 'delete') {
      await capabilityDependencies.deleteModelIdentity({ id: identityId })
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: existing.name,
        uri: `agent-model-identity-deleted://${identityId}`,
        metadata: { action, identityId, deleted: true },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Deleted model identity ${identityId}`], externalRefs: { identityId } })
    }

    return failed('unsupported_model_identity_action', 'Choose generate, rename, assign, or delete for the model identity.')
  },
}

const livePhotoBinding: AgentCapabilityBinding = {
  id: 'binding.live-photo.create.desktop.v1',
  capabilityId: 'LivePhoto.Create',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Product',
  isHealthy: async () => true,
  estimateCost: async (input) => ({ quantity: Math.max(1, Number(input.quantity || 1)), unit: 'live_photo' }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const product = await resolveProduct(input)
    if (!product) return failed('missing_product', 'Select a product before creating a live photo.')
    const referenceImagePaths = Array.from(new Set([...strings(input.productImagePaths), ...imagePathsFromProduct(product)]))
    if (!referenceImagePaths.length) return failed('missing_reference_image', 'The selected product has no reference images.')
    const created = await livePhotoService.createFromReference({
      productId: product.id,
      referenceImagePaths: referenceImagePaths.slice(0, Math.max(1, Number(input.quantity || 1))),
    })
    const items = Array.isArray(created) ? created : [created]
    const artifactIds = items.filter(Boolean).map((item: any) => {
      const localPath = text(item.livePhotoVideoPath || item.previewVideoPath || item.motionVideoPath)
      return context.registerArtifact({
        kind: localPath ? 'video' : 'manifest',
        name: localPath ? basename(localPath) : `Live photo ${item.id}`,
        uri: localPath ? `vg-file://${encodeURIComponent(localPath)}` : `agent-live-photo://${item.id}`,
        localPath: localPath || undefined,
        metadata: { itemId: item.id, productId: product.id, status: item.status },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: localPath ? 'managed' : 'referenced',
      })
    })
    return completed({
      status: items.every((item: any) => item?.status === 'completed') ? 'completed' : 'accepted',
      artifactIds,
      logs: [`Created ${items.length} live photo items`],
      externalRefs: { productId: product.id, itemIds: items.map((item: any) => item.id).join(',') },
    })
  },
}

const livePhotoManageBinding: AgentCapabilityBinding = {
  id: 'binding.live-photo.manage.desktop.v1',
  capabilityId: 'LivePhoto.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async (input) => ({
    action: text(input.action),
    quantity: Math.max(1, strings(input.livePhotoIds).length || strings(input.itemIds).length),
  }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const action = text(input.action).toLowerCase()
    const itemIds = Array.from(new Set([
      text(input.livePhotoId),
      text(input.itemId),
      ...strings(input.livePhotoIds),
      ...strings(input.itemIds),
    ].filter(Boolean)))
    if (!itemIds.length) return failed('missing_live_photo_id', 'Select at least one Live Photo item.')

    const existingItems = (await Promise.all(itemIds.map((id) => capabilityDependencies.getLivePhoto(id)))).filter(Boolean)
    if (existingItems.length !== itemIds.length) {
      return failed('live_photo_not_found', 'One or more selected Live Photo items do not exist.')
    }
    const artifactIds: string[] = []
    const warnings: string[] = []
    const logs: string[] = []
    let metadata: Record<string, unknown> = { action, itemIds }
    let accepted = false
    const motionTemplate = livePhotoMotionTemplate(input.motionTemplate)

    if (action === 'retry') {
      const rawRegion = input.replacementRegion && typeof input.replacementRegion === 'object'
        ? input.replacementRegion as Record<string, unknown>
        : null
      const replacementRegion = rawRegion
        ? {
            x: Number(rawRegion.x),
            y: Number(rawRegion.y),
            width: Number(rawRegion.width),
            height: Number(rawRegion.height),
          }
        : undefined
      for (const id of itemIds) {
        await capabilityDependencies.retryLivePhoto({ id, motionTemplate, replacementRegion })
      }
      accepted = true
      logs.push(`Retried ${itemIds.length} Live Photo items`)
    } else if (action === 'pause') {
      for (const id of itemIds) await capabilityDependencies.pauseLivePhoto({ id })
      logs.push(`Paused ${itemIds.length} Live Photo items`)
    } else if (action === 'resume') {
      for (const id of itemIds) await capabilityDependencies.resumeLivePhoto({ id, motionTemplate })
      accepted = true
      logs.push(`Resumed ${itemIds.length} Live Photo items`)
    } else if (action === 'export') {
      const outputDir = text(input.outputDir) || undefined
      const result = await capabilityDependencies.exportLivePhotos({ ids: itemIds, outputDir })
      for (const exported of result.exported) {
        artifactIds.push(context.registerArtifact({
          kind: 'video',
          name: basename(exported.videoPath),
          uri: `vg-file://${encodeURIComponent(exported.videoPath)}`,
          localPath: exported.videoPath,
          mimeType: 'video/mp4',
          metadata: { livePhotoId: exported.id, outputDir: result.outputDir },
          sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
          lifecycle: 'managed',
        }))
      }
      warnings.push(...result.skipped.map((item) => `${item.id}: ${item.reason}`))
      metadata = {
        action,
        itemIds,
        outputDir: result.outputDir,
        exportedCount: result.exported.length,
        skippedCount: result.skipped.length,
      }
      logs.push(`Exported ${result.exported.length} Live Photo videos`)
    } else if (action === 'subtitle_generate') {
      const titleText = text(input.titleText)
      if (!titleText) return failed('missing_subtitle_title', 'Add the title text to place on the Live Photo videos.')
      const sourceItems = existingItems.map((item) => {
        const sourceVideoPath = text(
          item?.subtitleOverlay?.originalOutputPath ||
          item?.subtitleOriginalOutputPath ||
          item?.livePhotoVideoPath ||
          item?.previewVideoPath ||
          item?.motionVideoPath ||
          item?.originalMotionVideoPath,
        )
        return {
          id: `live-photo-${item!.id}`,
          sourceType: 'upload' as const,
          sourceVideoPath,
          sourceProjectId: item!.id,
          sourceProjectTitle: item!.sourceProjectTitle || item!.productSnapshot?.name,
          fileName: item!.sourceShotLabel || item!.productSnapshot?.name || item!.id,
          coverImagePath: item!.posterPath || undefined,
        }
      })
      if (sourceItems.some((item) => !item.sourceVideoPath)) {
        return failed('missing_live_photo_video', 'One or more selected Live Photo items do not have a video output.')
      }
      const result = await capabilityDependencies.generateLivePhotoSubtitles({
        name: text(input.jobName) || `Live Photo subtitles ${new Date().toISOString()}`,
        sourceItems,
        subtitleMode: 'static_title',
        subtitleSource: 'manual',
        exportEngine: 'ass_fallback',
        titleRenderMode: 'overlay_image',
        titleConfig: { strategy: 'single_for_all', singleText: titleText },
        titleItems: [],
      })
      const sourceById = new Map(result.sourceItems.map((item) => [item.id, item]))
      let appliedCount = 0
      for (const output of result.outputs || []) {
        if (output.renderStatus !== 'success' || !text(output.outputVideoPath)) {
          if (output.error) warnings.push(`${output.sourceItemId}: ${output.error}`)
          continue
        }
        const source = sourceById.get(output.sourceItemId)
        const livePhotoId = text(source?.sourceProjectId) || output.sourceItemId.replace(/^live-photo-/, '')
        await capabilityDependencies.applyLivePhotoSubtitle({
          id: livePhotoId,
          subtitleVideoPath: text(output.outputVideoPath),
          subtitleCoverImagePath: text(output.coverImagePath) || undefined,
        })
        artifactIds.push(context.registerArtifact({
          kind: 'video',
          name: basename(text(output.outputVideoPath)),
          uri: `vg-file://${encodeURIComponent(text(output.outputVideoPath))}`,
          localPath: text(output.outputVideoPath),
          mimeType: 'video/mp4',
          metadata: { livePhotoId, subtitleJobId: result.id, titleText },
          sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
          lifecycle: 'managed',
        }))
        appliedCount += 1
      }
      if (!appliedCount) return failed('subtitle_generation_failed', warnings.join(' | ') || 'No subtitle video was generated.', true)
      metadata = { action, itemIds, subtitleJobId: result.id, appliedCount, titleText }
      logs.push(`Generated and applied subtitles to ${appliedCount} Live Photo videos`)
    } else if (action === 'subtitle_revert') {
      for (const id of itemIds) await capabilityDependencies.revertLivePhotoSubtitle({ id })
      logs.push(`Reverted subtitles for ${itemIds.length} Live Photo items`)
    } else if (action === 'delete') {
      for (const id of itemIds) await capabilityDependencies.removeLivePhoto(id)
      metadata = { action, itemIds, deletedCount: itemIds.length }
      logs.push(`Deleted ${itemIds.length} Live Photo records`)
    } else {
      return failed('unsupported_live_photo_action', 'The requested Live Photo action is not supported.')
    }

    const reportId = context.registerArtifact({
      kind: 'report',
      name: 'Live Photo operation result',
      uri: `agent-live-photo-action://${context.step.id}`,
      metadata,
      sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
      lifecycle: 'referenced',
    })
    return completed({
      success: warnings.length === 0,
      status: accepted ? 'accepted' : warnings.length ? 'partial' : 'completed',
      artifactIds: [reportId, ...artifactIds],
      logs,
      warnings,
      retryable: action === 'retry' || action === 'resume' || action === 'subtitle_generate',
      externalRefs: { livePhotoIds: itemIds.join(',') },
    })
  },
}

const subtitleBinding: AgentCapabilityBinding = {
  id: 'binding.subtitle.generate.desktop.v1',
  capabilityId: 'Subtitle.Generate',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const source = context.dependencyArtifacts.find((item) => item.kind === 'video' && item.localPath)
    let sourceVideoPath = text(input.sourceVideoPath) || text(source?.localPath)
    const projectId = text(input.projectId) || text(source?.metadata?.projectId)
    if (!sourceVideoPath && projectId) {
      sourceVideoPath = text((await cloneService.getProject({ cloneProjectId: projectId }))?.finalCompose?.outputPath)
    }
    if (!sourceVideoPath) return failed('missing_video_artifact', 'No video artifact is available for subtitles.')
    const result: any = await cloneService.generateSubtitleVideosForProjects({
      name: text(input.request).slice(0, 48) || 'Agent subtitle task',
      sourceItems: [{
        id: source?.id || projectId || sourceVideoPath,
        sourceType: projectId ? 'clone_final' : 'upload',
        sourceVideoPath,
        sourceProjectId: projectId || undefined,
        fileName: basename(sourceVideoPath),
      }],
      subtitleMode: 'timed_caption',
      subtitleSource: 'whisper_compatible',
      exportEngine: 'ass_fallback',
    })
    const outputs = Array.isArray(result?.outputs) ? result.outputs : []
    const artifactIds = outputs.map((item: any) => {
      const outputPath = text(item.outputVideoPath)
      return context.registerArtifact({
        kind: 'video',
        name: basename(outputPath || sourceVideoPath),
        uri: outputPath ? `vg-file://${encodeURIComponent(outputPath)}` : `agent-subtitle://${item.id}`,
        localPath: outputPath || undefined,
        metadata: { jobId: result.id, outputId: item.id, subtitle: true },
        sourceArtifactIds: source ? [source.id] : [],
        lifecycle: outputPath ? 'managed' : 'referenced',
      })
    })
    return completed({
      status: outputs.length ? 'completed' : 'accepted',
      artifactIds,
      logs: [`Created subtitle job ${text(result?.id)}`],
      externalRefs: { jobId: text(result?.id) },
    })
  },
}

const videoSliceBinding: AgentCapabilityBinding = {
  id: 'binding.video.slice.local.v1',
  capabilityId: 'Video.Slice',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const source = [...context.dependencyArtifacts].reverse().find((item) => item.kind === 'video' && item.localPath)
    const inputPath = text(input.inputPath || input.sourceVideoPath) || text(source?.localPath)
    if (!inputPath) return failed('missing_slice_video', 'Select a local video before splitting it.')
    if (!existsSync(inputPath)) return failed('slice_video_not_found', 'The selected video does not exist.')
    const segmentTimeSec = Math.max(1, Math.min(600, Math.round(Number(input.segmentTimeSec || 30) || 30)))
    const outputDir = text(input.outputDir) || undefined
    const outputFormat = text(input.outputFormat) === 'source' ? 'source' : 'mp4'
    const outputPaths = await capabilityDependencies.splitVideo({
      inputPath,
      segmentTimeSec,
      outputDir,
      outputFormat,
    })
    const artifactIds = outputPaths.map((outputPath, index) => context.registerArtifact({
      kind: 'video',
      name: basename(outputPath),
      uri: `vg-file://${encodeURIComponent(outputPath)}`,
      localPath: outputPath,
      metadata: {
        sourceVideoPath: inputPath,
        segmentIndex: index,
        segmentTimeSec,
        outputFormat,
      },
      sourceArtifactIds: source ? [source.id] : context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'managed',
    }))
    return completed({
      artifactIds,
      logs: [`Split video into ${outputPaths.length} segments`],
      externalRefs: { outputPaths: outputPaths.join('|') },
    })
  },
}

const publishBinding: AgentCapabilityBinding = {
  id: 'binding.video.publish.geelark.v1',
  capabilityId: 'Video.Publish',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Publish',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const source = [...context.dependencyArtifacts].reverse().find((item) => item.kind === 'video' && item.localPath)
    const videoPath = text(input.videoPath) || text(source?.localPath)
    const publishAccountId = text(input.publishAccountId)
    if (!videoPath) return failed('missing_video_artifact', 'No video artifact is available for publishing.')
    if (!publishAccountId) return failed('missing_publish_account', 'Select a publishing account in the run context.')
    const result: any = await capabilityDependencies.publishVideo('', {
      cloneProjectId: text(input.projectId) || text(source?.metadata?.projectId) || undefined,
      videoPath,
      publishAccountId,
      videoDesc: text(input.videoDesc || input.request),
      productId: text(input.productId) || undefined,
      scheduleAt: Number(input.scheduleAt || Date.now()),
    })
    const artifactId = context.registerArtifact({
      kind: 'publish_receipt',
      name: 'Video publishing receipt',
      uri: `agent-publish://${result.id}`,
      metadata: { taskId: result.id, status: result.status, publishAccountId },
      sourceArtifactIds: source ? [source.id] : [],
      lifecycle: 'published',
    })
    return completed({ artifactIds: [artifactId], logs: [`Created publish task ${result.id}`], externalRefs: { publishTaskId: result.id } })
  },
}

const publishingManageBinding: AgentCapabilityBinding = {
  id: 'binding.publishing.manage.local.v1',
  capabilityId: 'Publishing.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Publish',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const userId = 'desktop-local'
    const action = text(input.action)
    if (action === 'account_save') {
      const accountId = text(input.publishAccountId || input.accountId)
      const existing = accountId ? (await capabilityDependencies.listPublishAccounts(userId)).find((item) => item.id === accountId) : undefined
      if (accountId && !existing) return failed('publish_account_not_found', 'The selected publishing account does not exist.')
      const name = text(input.name) || existing?.name || ''
      const cloudPhoneId = text(input.cloudPhoneId) || existing?.cloudPhoneId || ''
      const cloudPhoneName = text(input.cloudPhoneName) || existing?.cloudPhoneName || ''
      if (!name || !cloudPhoneId || !cloudPhoneName) {
        return failed('missing_publish_account_fields', 'Publishing account name, cloud phone identifier, and cloud phone name are required.')
      }
      const saved = await capabilityDependencies.savePublishAccount(userId, {
        ...(existing ? { id: existing.id } : {}),
        name,
        cloudPhoneId,
        cloudPhoneName,
        geelarkAccountId: text(input.externalAccountId) || existing?.geelarkAccountId,
        remark: Object.prototype.hasOwnProperty.call(input, 'remark') ? text(input.remark) : existing?.remark,
        status: text(input.status) === 'disabled' ? 'disabled' : 'active',
      })
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: saved.name,
        uri: `agent-publishing-account://${saved.id}`,
        metadata: { action, publishAccountId: saved.id, status: saved.status, cloudPhoneId: saved.cloudPhoneId },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`${existing ? 'Updated' : 'Created'} publishing account ${saved.id}`], externalRefs: { publishAccountId: saved.id } })
    }

    if (action === 'account_delete') {
      const accountId = text(input.publishAccountId || input.accountId)
      if (!accountId) return failed('missing_publish_account', 'Select a publishing account before deletion.')
      const existing = (await capabilityDependencies.listPublishAccounts(userId)).find((item) => item.id === accountId)
      if (!existing) return failed('publish_account_not_found', 'The selected publishing account does not exist.')
      await capabilityDependencies.removePublishAccount(userId, accountId)
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: `Deleted publishing account ${existing.name}`,
        uri: `agent-publishing-account-action://${context.step.id}`,
        metadata: { action, publishAccountId: accountId, deleted: true },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Deleted publishing account ${accountId}`], externalRefs: { publishAccountId: accountId } })
    }

    if (action === 'music_save') {
      const presetId = text(input.musicPresetId || input.presetId)
      const existing = presetId ? (await capabilityDependencies.listMusicPresets(userId)).find((item) => item.id === presetId) : undefined
      if (presetId && !existing) return failed('music_preset_not_found', 'The selected music preset does not exist.')
      const label = text(input.label) || existing?.label || ''
      const refVideoId = text(input.refVideoId) || existing?.refVideoId || ''
      if (!label || !refVideoId) return failed('missing_music_preset_fields', 'Music preset label and reference video identifier are required.')
      const saved = await capabilityDependencies.saveMusicPreset(userId, {
        ...(existing ? { id: existing.id } : {}),
        label,
        refVideoId,
        remark: Object.prototype.hasOwnProperty.call(input, 'remark') ? text(input.remark) : existing?.remark,
      })
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: saved.label,
        uri: `agent-publishing-music://${saved.id}`,
        metadata: { action, musicPresetId: saved.id, refVideoId: saved.refVideoId },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`${existing ? 'Updated' : 'Created'} music preset ${saved.id}`], externalRefs: { musicPresetId: saved.id } })
    }

    if (action === 'music_delete') {
      const presetId = text(input.musicPresetId || input.presetId)
      if (!presetId) return failed('missing_music_preset', 'Select a music preset before deletion.')
      const existing = (await capabilityDependencies.listMusicPresets(userId)).find((item) => item.id === presetId)
      if (!existing) return failed('music_preset_not_found', 'The selected music preset does not exist.')
      await capabilityDependencies.removeMusicPreset(userId, presetId)
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: `Deleted music preset ${existing.label}`,
        uri: `agent-publishing-music-action://${context.step.id}`,
        metadata: { action, musicPresetId: presetId, deleted: true },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Deleted music preset ${presetId}`], externalRefs: { musicPresetId: presetId } })
    }

    if (action === 'task_sync') {
      const taskId = text(input.publishTaskId || input.taskId)
      if (!taskId) return failed('missing_publish_task', 'Select a publishing task before synchronization.')
      const existing = (await capabilityDependencies.listPublishTasks(userId)).find((item) => item.id === taskId)
      if (!existing) return failed('publish_task_not_found', 'The selected publishing task does not exist.')
      const synced = await capabilityDependencies.syncPublishTask(userId, taskId)
      const artifactId = context.registerArtifact({
        kind: 'publish_receipt',
        name: `Publishing task ${taskId}`,
        uri: `agent-publish://${taskId}`,
        metadata: {
          action,
          taskId,
          status: synced.status,
          failCode: synced.failCode,
          failDesc: synced.failDesc,
          lastSyncAt: synced.lastSyncAt,
          resultImages: synced.resultImages,
        },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: synced.status === 'completed' ? 'published' : 'referenced',
      })
      return completed({
        status: synced.status === 'failed' ? 'failed' : synced.status === 'waiting' || synced.status === 'in_progress' ? 'accepted' : 'completed',
        success: synced.status !== 'failed',
        artifactIds: [artifactId],
        logs: [`Synchronized publishing task ${taskId}`],
        warnings: synced.failDesc ? [synced.failDesc] : [],
        retryable: synced.status === 'failed',
        externalRefs: { publishTaskId: taskId, externalTaskId: text(synced.geelarkTaskId) },
        ...(synced.status === 'failed' ? { error: { code: 'publish_task_failed', message: text(synced.failDesc) || 'Publishing task failed.' } } : {}),
      })
    }

    return failed('unsupported_publishing_action', 'Choose account_save, account_delete, music_save, music_delete, or task_sync.')
  },
}

const exportBinding: AgentCapabilityBinding = {
  id: 'binding.artifact.export.local.v1',
  capabilityId: 'Artifact.Export',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const outputDir = text(input.outputDir)
    if (!outputDir) return failed('missing_output_directory', 'Select an output directory before exporting.')
    const sources = [...context.dependencyArtifacts.filter((item) => item.localPath)]
    for (const localPath of strings(input.artifactPaths)) {
      if (!existsSync(localPath) || sources.some((item) => item.localPath === localPath)) continue
      sources.push({
        id: `input-${sources.length + 1}`,
        kind: /\.(png|jpe?g|webp)$/i.test(localPath) ? 'image' : 'video',
        name: basename(localPath),
        uri: `vg-file://${encodeURIComponent(localPath)}`,
        localPath,
        metadata: {},
        sourceArtifactIds: [],
        producerRunId: context.run.id,
        producerStepId: context.step.id,
        lifecycle: 'referenced',
        createdAt: Date.now(),
      })
    }
    if (!sources.length) return failed('missing_artifact', 'No local artifacts are available for export.')
    await mkdir(outputDir, { recursive: true })
    const artifactIds: string[] = []
    for (const source of sources) {
      const target = join(outputDir, basename(source.localPath!))
      await copyFile(source.localPath!, target)
      artifactIds.push(context.registerArtifact({
        kind: source.kind,
        name: basename(target),
        uri: `vg-file://${encodeURIComponent(target)}`,
        localPath: target,
        metadata: { exportedFrom: source.id },
        sourceArtifactIds: [source.id],
        lifecycle: 'managed',
      }))
    }
    return completed({ artifactIds, logs: [`Exported ${artifactIds.length} artifacts`] })
  },
}

const artifactReadBinding: AgentCapabilityBinding = {
  id: 'binding.artifact.read.local.v1',
  capabilityId: 'Artifact.Read',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'read',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (_input, context) => {
    const items = await livePhotoService.list()
    const completedItems = (Array.isArray(items) ? items : [])
      .map((item: any) => ({
        item,
        path: [item.livePhotoVideoPath, item.previewVideoPath, item.motionVideoPath].map(text).find((path) => path && existsSync(path)) || '',
      }))
      .filter((row) => Boolean(row.path))
      .sort((a, b) => Number(b.item.createdAt || b.item.updatedAt || 0) - Number(a.item.createdAt || a.item.updatedAt || 0))
      .slice(0, 6)
    const artifactIds = completedItems.map(({ item, path }, index) => context.registerArtifact({
      kind: 'video',
      name: text(item.name || item.sourceShotLabel) || `Live Photo video ${index + 1}`,
      uri: `live-photo://${text(item.id)}/video`,
      localPath: path,
      mimeType: 'video/mp4',
      metadata: { source: 'live_photo', sourceId: text(item.id), productId: text(item.productId) || undefined },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    }))
    return completed({
      artifactIds,
      logs: [`Read ${artifactIds.length} existing Live Photo videos`],
      warnings: artifactIds.length ? [] : ['No completed Live Photo videos were found.'],
    })
  },
}

const sourceVideoImportBinding: AgentCapabilityBinding = {
  id: 'binding.source-video.import.desktop.v1',
  capabilityId: 'SourceVideo.Import',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async (input) => ({ quantity: strings(input.shareUrls).length, unit: 'source_video' }),
  execute: async (input, context) => {
    const shareUrls = Array.from(new Set(strings(input.shareUrls)))
    if (!shareUrls.length) return failed('missing_share_url', 'Add at least one supported sharing link.')
    const result = await capabilityDependencies.importShareUrls({ userId: 'desktop-local', shareUrls })
    const artifactIds = result.items.map((item) => context.registerArtifact({
      kind: 'source_video',
      name: text(item.title) || basename(text(item.localVideoPath)) || `Source video ${item.videoId}`,
      uri: `agent-source-video://${item.id}`,
      localPath: text(item.localVideoPath) || undefined,
      metadata: {
        sourceId: item.id,
        videoId: item.videoId,
        platform: item.platform,
        author: item.author,
        usedStatus: item.usedStatus,
        thumbnailPath: item.thumbnailPath,
      },
      sourceArtifactIds: [],
      lifecycle: text(item.localVideoPath) ? 'managed' : 'referenced',
    }))
    const warnings = result.errors.map((item) => `${item.shareUrl}: ${item.message}`)
    if (!artifactIds.length) {
      return failed('source_import_failed', warnings.join(' | ') || 'No source videos were imported.', true)
    }
    return completed({
      success: warnings.length === 0,
      status: warnings.length ? 'partial' : 'completed',
      artifactIds,
      logs: [`Imported ${artifactIds.length} source videos`],
      warnings,
      retryable: warnings.length > 0,
      externalRefs: { sourceIds: result.items.map((item) => item.id).join(',') },
    })
  },
}

const sourceVideoManageBinding: AgentCapabilityBinding = {
  id: 'binding.source-video.manage.desktop.v1',
  capabilityId: 'SourceVideo.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async (input) => ({ action: text(input.action), quantity: 1 }),
  execute: async (input, context) => {
    const action = text(input.action).toLowerCase()
    const sourceVideoId = text(input.sourceVideoId || input.itemId)
    if (!sourceVideoId) return failed('missing_source_video_id', 'Select a source video.')
    const userId = 'desktop-local'
    const artifactIds: string[] = []
    let metadata: Record<string, unknown>
    let logs: string[]
    if (action === 'retry') {
      const item = await capabilityDependencies.retrySourceVideo({ userId, id: sourceVideoId })
      artifactIds.push(context.registerArtifact({
        kind: 'source_video',
        name: text(item.title) || basename(text(item.localVideoPath)) || `Source video ${item.videoId}`,
        uri: `agent-source-video://${item.id}`,
        localPath: text(item.localVideoPath) || undefined,
        metadata: {
          sourceId: item.id,
          videoId: item.videoId,
          status: item.status,
          usedStatus: item.usedStatus,
          thumbnailPath: item.thumbnailPath,
        },
        sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
        lifecycle: text(item.localVideoPath) ? 'managed' : 'referenced',
      }))
      metadata = { action, sourceVideoId: item.id, status: item.status }
      logs = [`Retried source video ${item.id}`]
    } else if (action === 'delete') {
      await capabilityDependencies.deleteSourceVideo({ userId, id: sourceVideoId })
      metadata = { action, sourceVideoId, deleted: true }
      logs = [`Deleted source video ${sourceVideoId}`]
    } else {
      return failed('unsupported_source_video_action', 'Choose retry or delete for the source video.')
    }
    const reportId = context.registerArtifact({
      kind: 'report',
      name: 'Source video operation result',
      uri: `agent-source-video-action://${context.step.id}`,
      metadata,
      sourceArtifactIds: context.dependencyArtifacts.map((item) => item.id),
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [reportId, ...artifactIds],
      logs,
      retryable: action === 'retry',
      externalRefs: { sourceVideoId },
    })
  },
}

const listingGenerateBinding: AgentCapabilityBinding = {
  id: 'binding.listing.generate.desktop.v1',
  capabilityId: 'Listing.Generate',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ quantity: 1, unit: 'listing' }),
  getModelSnapshot: safeModelSnapshot,
  execute: async (input, context) => {
    const listingId = text(input.listingId)
    if (!listingId) return failed('missing_listing', 'Select a listing record before generation.')
    const item = await capabilityDependencies.generateListing({ id: listingId })
    const listingArtifactId = context.registerArtifact({
      kind: 'listing',
      name: text(item.generatedTitle) || text(item.sku) || `Listing ${item.id}`,
      uri: `agent-listing://${item.id}`,
      metadata: {
        listingId: item.id,
        sku: item.sku,
        category: item.category,
        status: item.generationStatus,
        title: item.generatedTitle,
        imageCount: item.listingImages.length,
      },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    })
    const imageArtifactIds = item.listingImages.map((image) => context.registerArtifact({
      kind: 'image',
      name: image.fileName,
      uri: `agent-listing-image://${item.id}/${image.id}`,
      localPath: image.filePath,
      metadata: { listingId: item.id, publicUrl: image.publicUrl },
      sourceArtifactIds: [listingArtifactId],
      lifecycle: 'managed',
    }))
    if (item.generationStatus === 'failed') {
      return completed({
        success: false,
        status: 'partial',
        artifactIds: [listingArtifactId],
        warnings: [text(item.generationError) || 'Listing generation failed.'],
        retryable: true,
        externalRefs: { listingId: item.id },
        error: { code: 'listing_generation_failed', message: text(item.generationError) || 'Listing generation failed.' },
      })
    }
    return completed({
      status: item.generationStatus === 'done' ? 'completed' : 'accepted',
      artifactIds: [listingArtifactId, ...imageArtifactIds],
      logs: [`Generated listing ${item.id}`],
      externalRefs: { listingId: item.id },
    })
  },
}

const listingExportBinding: AgentCapabilityBinding = {
  id: 'binding.listing.export.desktop.v1',
  capabilityId: 'Listing.Export',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const listingIds = Array.from(new Set(strings(input.listingIds)))
    if (!listingIds.length) return failed('missing_listings', 'Select at least one completed listing record.')
    const result = await capabilityDependencies.exportListings({ ids: listingIds })
    const artifactId = context.registerArtifact({
      kind: 'spreadsheet',
      name: basename(result.filePath),
      uri: `vg-file://${encodeURIComponent(result.filePath)}`,
      localPath: result.filePath,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: { listingIds, total: result.total },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'managed',
    })
    return completed({
      artifactIds: [artifactId],
      logs: [`Exported ${result.total} listing records`],
      externalRefs: { exportPath: result.filePath },
    })
  },
}

const listingCategories = new Set(['earring', 'ring', 'necklace', 'phone_case', 'bracelet'])
const listingLanguages = new Set(['zh-CN', 'en-US', 'vi-VN'])

const listingManageBinding: AgentCapabilityBinding = {
  id: 'binding.listing.manage.desktop.v1',
  capabilityId: 'Listing.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const action = text(input.action)
    if (action === 'delete') {
      const listingId = text(input.listingId)
      if (!listingId) return failed('missing_listing', 'Select a listing record before deletion.')
      const existing = (await capabilityDependencies.listListings()).find((item) => item.id === listingId)
      if (!existing) return failed('listing_not_found', 'The selected listing record does not exist.')
      await capabilityDependencies.removeListing(listingId)
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: `Deleted listing ${existing.sku}`,
        uri: `agent-listing-action://${context.step.id}`,
        metadata: { action, listingId, sku: existing.sku, deleted: true },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Deleted listing record ${listingId}`], externalRefs: { listingId } })
    }

    if (action === 'save_export_config') {
      const rawConfigs = Array.isArray(input.configs) ? input.configs : [input]
      const configs = rawConfigs.map((value) => {
        const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
        return {
          category: text(row.category),
          categoryId: text(row.categoryId),
          productAttributes: text(row.productAttributes),
        }
      }).filter((item) => listingCategories.has(item.category))
      if (!configs.length) return failed('missing_listing_config', 'Add at least one supported listing category configuration.')
      if (configs.some((item) => !item.categoryId)) return failed('missing_listing_category_id', 'Every listing category configuration requires a category identifier.')
      const saved = await capabilityDependencies.saveListingExportConfigs(configs as any)
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: 'Listing export configuration',
        uri: `agent-listing-config://${context.step.id}`,
        metadata: { action, categories: configs.map((item) => item.category), configCount: Array.isArray(saved) ? saved.length : configs.length },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Saved ${configs.length} listing export configurations`] })
    }

    if (action !== 'save') return failed('unsupported_listing_action', 'Choose save, delete, or save_export_config for the listing operation.')
    const listingId = text(input.listingId)
    const current = listingId ? (await capabilityDependencies.listListings()).find((item) => item.id === listingId) : undefined
    if (listingId && !current) return failed('listing_not_found', 'The selected listing record does not exist.')
    const sourceImagePath = text(input.sourceImagePath) || current?.sourceImagePath || ''
    const category = text(input.category) || current?.category || ''
    const sku = text(input.sku) || current?.sku || ''
    const localDisplayPrice = text(input.localDisplayPrice) || current?.localDisplayPrice || ''
    const titleLanguage = text(input.titleLanguage) || current?.titleLanguage || 'zh-CN'
    if (!sourceImagePath) return failed('missing_listing_image', 'Add a source image before saving the listing.')
    if (!existsSync(sourceImagePath)) return failed('listing_image_not_found', 'The listing source image does not exist.')
    if (!listingCategories.has(category)) return failed('invalid_listing_category', 'Choose a supported listing category.')
    if (!sku) return failed('missing_listing_sku', 'Add a SKU before saving the listing.')
    if (!localDisplayPrice) return failed('missing_listing_price', 'Add a local display price before saving the listing.')
    if (!listingLanguages.has(titleLanguage)) return failed('invalid_listing_language', 'Choose a supported listing title language.')
    const referenceImagePaths = Object.prototype.hasOwnProperty.call(input, 'referenceImagePaths')
      ? Array.from(new Set(strings(input.referenceImagePaths)))
      : current?.referenceImagePaths || []
    const missingReference = referenceImagePaths.find((item) => !existsSync(item))
    if (missingReference) return failed('listing_reference_not_found', `Listing reference image does not exist: ${missingReference}`)
    const saved = await capabilityDependencies.saveListing({
      ...(current ? { id: current.id } : {}),
      sourceImagePath,
      referenceImagePaths,
      category: category as any,
      sku,
      localDisplayPrice,
      titleLanguage: titleLanguage as any,
    })
    const artifactId = context.registerArtifact({
      kind: 'listing',
      name: saved.sku,
      uri: `agent-listing://${saved.id}`,
      metadata: { listingId: saved.id, action: current ? 'updated' : 'created', category: saved.category, status: saved.generationStatus },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [artifactId],
      logs: [`${current ? 'Updated' : 'Created'} listing record ${saved.id}`],
      externalRefs: { listingId: saved.id },
    })
  },
}

const tiktokCreativeManageBinding: AgentCapabilityBinding = {
  id: 'binding.tiktok-creative.manage.desktop.v1',
  capabilityId: 'TiktokCreative.Manage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Project',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const action = text(input.action)
    const taskId = text(input.taskId)
    const shotId = text(input.shotId)
    let tasks: Awaited<ReturnType<typeof tiktokCreativeStudioService.list>> = []
    let status: AgentToolResult['status'] = 'completed'
    let warnings: string[] = []
    let logs: string[] = []

    if (action === 'create_drafts') {
      const cloneProjectIds = Array.from(new Set(strings(input.cloneProjectIds).concat(text(input.cloneProjectId)).filter(Boolean)))
      if (!cloneProjectIds.length) return failed('missing_clone_projects', 'Select at least one clone project before creating creative tasks.')
      tasks = await capabilityDependencies.createCreativeDrafts({ cloneProjectIds })
      logs = [`Created ${tasks.length} TikTok creative draft tasks`]
    } else if (action === 'start_shot') {
      if (!taskId || !shotId) return failed('missing_creative_shot', 'Select a creative task and shot before starting it.')
      tasks = [await capabilityDependencies.startCreativeShot({ id: taskId, shotId })]
      status = 'accepted'
      warnings = ['A visible browser session was opened. Login or manual review may still be required.']
      logs = [`Started creative shot ${shotId}`]
    } else if (action === 'start_next') {
      if (!taskId) return failed('missing_creative_task', 'Select a creative task before starting its next shot.')
      tasks = [await capabilityDependencies.startNextCreativeShot({ id: taskId })]
      status = 'accepted'
      warnings = ['A visible browser session was opened. Login or manual review may still be required.']
      logs = [`Started the next pending shot for creative task ${taskId}`]
    } else if (action === 'mark_completed') {
      const resultVideoPath = text(input.resultVideoPath)
      if (!taskId || !shotId || !resultVideoPath) return failed('missing_creative_result', 'Select a task, shot, and local result video before completion.')
      if (!existsSync(resultVideoPath)) return failed('creative_result_not_found', 'The selected result video does not exist.')
      tasks = [await capabilityDependencies.completeCreativeShot({ id: taskId, shotId, resultVideoPath })]
      logs = [`Completed creative shot ${shotId}`]
    } else if (action === 'mark_failed') {
      const error = text(input.error)
      if (!taskId || !shotId) return failed('missing_creative_shot', 'Select a creative task and shot before recording failure.')
      tasks = [await capabilityDependencies.failCreativeShot({ id: taskId, shotId, error })]
      logs = [`Recorded failure for creative shot ${shotId}`]
    } else if (action === 'delete') {
      if (!taskId) return failed('missing_creative_task', 'Select a creative task before deletion.')
      const existing = (await capabilityDependencies.listCreativeTasks()).find((item) => item.id === taskId)
      if (!existing) return failed('creative_task_not_found', 'The selected creative task does not exist.')
      await capabilityDependencies.removeCreativeTask(taskId)
      const reportId = context.registerArtifact({
        kind: 'report',
        name: `Deleted creative task ${taskId}`,
        uri: `agent-tiktok-creative-action://${context.step.id}`,
        metadata: { action, taskId, deleted: true, sourceCloneProjectId: existing.sourceCloneProjectId },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [reportId], logs: [`Deleted TikTok creative task ${taskId}`], externalRefs: { taskId } })
    } else {
      return failed('unsupported_creative_action', 'Choose create_drafts, start_shot, start_next, mark_completed, mark_failed, or delete.')
    }

    const artifactIds: string[] = []
    for (const task of tasks) {
      const taskArtifactId = context.registerArtifact({
        kind: 'task',
        name: task.sourceCloneProjectTitle || `TikTok creative task ${task.id}`,
        uri: `agent-tiktok-creative://${task.id}`,
        metadata: {
          taskId: task.id,
          status: task.status,
          sourceCloneProjectId: task.sourceCloneProjectId,
          totalShots: task.totalShots,
          completedShots: task.completedShots,
          failedShots: task.failedShots,
          waitingShots: task.waitingShots,
        },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      })
      artifactIds.push(taskArtifactId)
      for (const shot of task.shots.filter((item) => item.resultVideoPath)) {
        artifactIds.push(context.registerArtifact({
          kind: 'video',
          name: basename(shot.resultVideoPath!),
          uri: `vg-file://${encodeURIComponent(shot.resultVideoPath!)}`,
          localPath: shot.resultVideoPath,
          metadata: { taskId: task.id, shotId: shot.shotId, status: shot.status },
          sourceArtifactIds: [taskArtifactId],
          lifecycle: 'referenced',
        }))
      }
    }
    return completed({
      status,
      artifactIds,
      logs,
      warnings,
      externalRefs: { taskIds: tasks.map((item) => item.id).join(',') },
    })
  },
}

const transitionTypes = new Set<TransitionConfig['pool'][number]>([
  'hardcut',
  'fade',
  'slideleft',
  'slideright',
  'pixelize',
  'circlecrop',
  'wipeup',
  'squeezev',
  'squeezeh',
])

function hasInput(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function buildTemplateUpdate(input: Record<string, unknown>, current?: Template): Partial<Template> & Pick<Template, 'name' | 'structure'> {
  const name = text(input.templateName || input.name) || current?.name || ''
  const requestedStructure = Array.from(new Set(strings(input.structure).map((item) => item.toLowerCase())))
  const structure = requestedStructure.length ? requestedStructure : current?.structure || ['hook', 'show', 'detail']
  const durationMin = finiteNumber(input.durationMin, 0.5, 600)
  const durationMax = finiteNumber(input.durationMax, 0.5, 600)
  const resolvedDurationMin = durationMin ?? current?.totalDurationSec.min ?? 7
  const resolvedDurationMax = Math.max(resolvedDurationMin, durationMax ?? current?.totalDurationSec.max ?? 15)
  const update: Partial<Template> & Pick<Template, 'name' | 'structure'> = {
    ...(current ? { id: current.id } : {}),
    name,
    structure,
    ...((durationMin != null || durationMax != null || !current)
      ? { totalDurationSec: { min: resolvedDurationMin, max: resolvedDurationMax } }
      : {}),
  }
  const syncMode = text(input.segmentSyncMode)
  if (syncMode === 'follow_product' || syncMode === 'fixed') update.segmentSyncMode = syncMode
  const skipStartSec = finiteNumber(input.skipStartSec, 0, 60)
  if (skipStartSec != null) update.skipStartSec = skipStartSec

  if (input.segmentDurations && typeof input.segmentDurations === 'object' && !Array.isArray(input.segmentDurations)) {
    const segmentDurationSec: Template['segmentDurationSec'] = { ...(current?.segmentDurationSec || {}) }
    for (const [segment, value] of Object.entries(input.segmentDurations as Record<string, unknown>)) {
      if (!segment.trim() || !value || typeof value !== 'object' || Array.isArray(value)) continue
      const range = value as Record<string, unknown>
      const minimum = finiteNumber(range.min, 0.1, 600)
      const maximum = finiteNumber(range.max, 0.1, 600)
      if (minimum == null && maximum == null) continue
      const resolvedMinimum = minimum ?? segmentDurationSec[segment]?.min ?? 1
      segmentDurationSec[segment] = { min: resolvedMinimum, max: Math.max(resolvedMinimum, maximum ?? segmentDurationSec[segment]?.max ?? resolvedMinimum) }
    }
    update.segmentDurationSec = segmentDurationSec
  }

  const randomMode = text(input.randomOrderMode)
  if (randomMode === 'none' || randomMode === 'partial') {
    update.randomizeOrder = {
      mode: randomMode,
      ...(randomMode === 'partial'
        ? { keepFirstCount: Math.round(finiteNumber(input.keepFirstCount, 0, 20) ?? current?.randomizeOrder?.keepFirstCount ?? 1) }
        : {}),
    }
  }

  if (hasInput(input, 'transitionEnabled') || hasInput(input, 'transitionTypes') || hasInput(input, 'transitionDurationMin') || hasInput(input, 'transitionDurationMax')) {
    const pool = strings(input.transitionTypes).filter((item): item is TransitionConfig['pool'][number] => transitionTypes.has(item as TransitionConfig['pool'][number]))
    const transitionMin = finiteNumber(input.transitionDurationMin, 0, 10)
    const transitionMax = finiteNumber(input.transitionDurationMax, 0, 10)
    const resolvedMinimum = transitionMin ?? current?.transition?.durationSec.min ?? 0.08
    update.transition = {
      enabled: hasInput(input, 'transitionEnabled') ? input.transitionEnabled === true : current?.transition?.enabled !== false,
      pool: pool.length ? pool : current?.transition?.pool || ['fade'],
      durationSec: {
        min: resolvedMinimum,
        max: Math.max(resolvedMinimum, transitionMax ?? current?.transition?.durationSec.max ?? 0.16),
      },
    }
  }

  if (hasInput(input, 'audioSource') || hasInput(input, 'audioDuckingEnabled') || hasInput(input, 'audioDuckingAmountDb')) {
    const source = text(input.audioSource)
    update.audio = {
      source: source === 'mute' || source === 'keep' ? source : current?.audio?.source || 'keep',
      ducking: {
        enabled: hasInput(input, 'audioDuckingEnabled') ? input.audioDuckingEnabled === true : current?.audio?.ducking.enabled !== false,
        amountDb: finiteNumber(input.audioDuckingAmountDb, 0, 60) ?? current?.audio?.ducking.amountDb ?? 14,
      },
    }
  }

  if (hasInput(input, 'subtitleEnabled')) {
    update.subtitle = { ...(current?.subtitle || { pool: [], x: '(w-text_w)/2', y: '(h-text_h)/4', fontSize: 62 }), enabled: input.subtitleEnabled === true }
  }
  if (hasInput(input, 'ttsEnabled') || hasInput(input, 'ttsVoice') || hasInput(input, 'ttsRate') || hasInput(input, 'ttsPitch') || hasInput(input, 'ttsMixVolume') || hasInput(input, 'ttsKeepOriginal')) {
    update.tts = {
      ...(current?.tts || { enabled: false, textPool: [], voice: 'zh-CN-XiaoxiaoNeural', mixVolume: 1, keepOriginal: true }),
      ...(hasInput(input, 'ttsEnabled') ? { enabled: input.ttsEnabled === true } : {}),
      ...(text(input.ttsVoice) ? { voice: text(input.ttsVoice) } : {}),
      ...(text(input.ttsRate) ? { rate: text(input.ttsRate) } : {}),
      ...(text(input.ttsPitch) ? { pitch: text(input.ttsPitch) } : {}),
      ...(finiteNumber(input.ttsMixVolume, 0, 1) != null ? { mixVolume: finiteNumber(input.ttsMixVolume, 0, 1)! } : {}),
      ...(hasInput(input, 'ttsKeepOriginal') ? { keepOriginal: input.ttsKeepOriginal === true } : {}),
    }
  }
  if (hasInput(input, 'aspectUnifyMode')) {
    const mode = text(input.aspectUnifyMode)
    update.aspectUnifyMode = mode === 'contain_pad' || mode === 'cover_crop' ? mode : null
  }
  return update
}

async function executeTemplateOperation(input: Record<string, unknown>, context: Parameters<AgentCapabilityBinding['execute']>[1]) {
  const action = text(input.action).toLowerCase() || 'save'
  const templateId = text(input.templateId)
  const current = templateId ? (await capabilityDependencies.listTemplates()).find((item) => item.id === templateId) : undefined
  if (templateId && !current) return failed('template_not_found', 'The selected template does not exist.')

  if (action === 'delete') {
    if (!current) return failed('missing_template', 'Select a production template to delete.')
    await capabilityDependencies.removeTemplate(current.id)
    const artifactId = context.registerArtifact({
      kind: 'report',
      name: current.name,
      uri: `agent-template-deleted://${current.id}`,
      metadata: { action, templateId: current.id, deleted: true },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    })
    return completed({ artifactIds: [artifactId], logs: [`Deleted template ${current.id}`], externalRefs: { templateId: current.id } })
  }

  let saved: Template
  let completedAction: 'created' | 'updated' | 'duplicated'
  if (action === 'duplicate') {
    if (!current) return failed('missing_template', 'Select a production template to duplicate.')
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = current
    saved = await capabilityDependencies.saveTemplate({
      ...copy,
      name: text(input.templateName || input.name) || `${current.name} Copy`,
    })
    completedAction = 'duplicated'
  } else if (action === 'save' || action === 'create' || action === 'update') {
    const update = buildTemplateUpdate(input, current)
    if (!update.name) return failed('missing_template_name', 'Add a template name before creating the template.')
    saved = await capabilityDependencies.saveTemplate(update)
    completedAction = current ? 'updated' : 'created'
  } else {
    return failed('unsupported_template_action', 'Choose save, duplicate, or delete for the production template.')
  }

  const artifactId = context.registerArtifact({
    kind: 'template',
    name: saved.name,
    uri: `agent-template://${saved.id}`,
    metadata: {
      templateId: saved.id,
      structure: saved.structure,
      totalDurationSec: saved.totalDurationSec,
      segmentSyncMode: saved.segmentSyncMode,
      transition: saved.transition,
      audio: saved.audio,
      randomizeOrder: saved.randomizeOrder,
      aspectUnifyMode: saved.aspectUnifyMode,
      action: completedAction,
    },
    sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
    lifecycle: 'referenced',
  })
  return completed({
    artifactIds: [artifactId],
    logs: [`${completedAction} template ${saved.id}`],
    externalRefs: { templateId: saved.id },
  })
}

const templateSaveBinding: AgentCapabilityBinding = {
  id: 'binding.template.save.local.v1',
  capabilityId: 'Template.Save',
  capabilityVersion: 1,
  adapterVersion: '1.1.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: executeTemplateOperation,
}

const templateManageBinding: AgentCapabilityBinding = {
  ...templateSaveBinding,
  id: 'binding.template.manage.local.v1',
  capabilityId: 'Template.Manage',
}

const productionQueueControlBinding: AgentCapabilityBinding = {
  id: 'binding.production.queue-control.desktop.v1',
  capabilityId: 'Production.QueueControl',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const action = text(input.action).toLowerCase()
    if (action !== 'pause' && action !== 'resume' && action !== 'cancel') {
      return failed('invalid_queue_action', 'Choose pause, resume, or cancel for the production queue.')
    }
    const result = capabilityDependencies.controlProductionQueue(action)
    const artifactId = context.registerArtifact({
      kind: 'report',
      name: `Production queue ${action}`,
      uri: `agent-production-queue://${action}/${context.idempotencyKey}`,
      metadata: { action, before: result.before, after: result.after },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [artifactId],
      logs: [`Production queue action completed: ${action}`],
      externalRefs: { action },
    })
  },
}

const productionTaskManageBinding: AgentCapabilityBinding = {
  id: 'binding.production.task-manage.desktop.v1',
  capabilityId: 'Production.TaskManage',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Artifact',
  isHealthy: async () => true,
  estimateCost: async (input) => ({ action: text(input.action), quantity: 1 }),
  execute: async (input, context) => {
    const action = text(input.action).toLowerCase()
    const taskId = text(input.taskId)
    if (!taskId) return failed('missing_production_task', 'Select a production task.')
    const existing = capabilityDependencies.getProductionTask(taskId)
    if (!existing) return failed('production_task_not_found', 'The selected production task does not exist.')

    if (action === 'retry') {
      if (!['error', 'cancelled', 'skipped'].includes(existing.status)) {
        return failed('production_task_not_retryable', 'Only failed, cancelled, or skipped production tasks can be retried.')
      }
      const task = capabilityDependencies.retryProductionTask(taskId)
      const artifactId = context.registerArtifact({
        kind: 'task',
        name: `Production task ${task.id}`,
        uri: `agent-production-task://${task.id}`,
        metadata: { action, taskId: task.id, status: task.status, productId: task.productId, templateId: task.templateId },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      })
      return completed({ status: 'accepted', artifactIds: [artifactId], logs: [`Retried production task ${taskId}`], retryable: true, externalRefs: { taskId } })
    }

    if (action === 'cancel') {
      if (!['queued', 'running', 'paused'].includes(existing.status)) {
        return failed('production_task_not_active', 'Only queued, running, or paused production tasks can be cancelled.')
      }
      const task = capabilityDependencies.cancelProductionTask(taskId)
      const artifactId = context.registerArtifact({
        kind: 'task',
        name: `Production task ${task.id}`,
        uri: `agent-production-task://${task.id}`,
        metadata: { action, taskId: task.id, status: task.status, outputFilesPreserved: true },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Cancelled production task ${taskId}`], externalRefs: { taskId } })
    }

    if (action === 'remove') {
      if (['queued', 'running', 'paused'].includes(existing.status)) {
        return failed('production_task_still_active', 'Stop the production task before removing its record.')
      }
      const result = capabilityDependencies.removeProductionTask(taskId)
      const artifactId = context.registerArtifact({
        kind: 'report',
        name: `Removed production task ${taskId}`,
        uri: `agent-production-task-removed://${taskId}`,
        metadata: { action, taskId, removed: result.ok, outputFilesPreserved: result.outputFilesPreserved },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      })
      return completed({ artifactIds: [artifactId], logs: [`Removed production task record ${taskId}`], externalRefs: { taskId } })
    }

    return failed('unsupported_production_task_action', 'Choose retry, cancel, or remove for the production task.')
  },
}

const productionBatchBinding: AgentCapabilityBinding = {
  id: 'binding.production.batch.desktop.v1',
  capabilityId: 'Production.BatchCreate',
  capabilityVersion: 1,
  adapterVersion: '1.0.0',
  priority: 100,
  lockMode: 'write',
  resourceType: 'Product',
  isHealthy: async () => true,
  estimateCost: async (input) => ({ quantity: Math.max(1, Number(input.quantity || input.count || 1)), unit: 'video_task' }),
  execute: async (input, context) => {
    const productId = text(input.productId)
    const templateId = text(input.templateId)
    const outputDir = text(input.outputDir)
    const count = Math.max(1, Math.min(100, Number(input.quantity || input.count || 1) || 1))
    if (!productId) return failed('missing_product', 'Select a product before creating a production batch.')
    if (!templateId) return failed('missing_template', 'Select a production template.')
    if (!outputDir) return failed('missing_output_directory', 'Select an output directory for the production batch.')
    const result = await capabilityDependencies.createProductionBatch({ productId, templateId, count, outDir: outputDir })
    if (!result.tasks.length) {
      const missingSegments = Array.isArray(result.meta.missingSegments) ? result.meta.missingSegments.join(', ') : ''
      return failed(
        'production_batch_empty',
        missingSegments ? `Product materials are missing for segments: ${missingSegments}` : text(result.meta.planError) || 'No production tasks could be created.',
        true,
      )
    }
    const taskIds = result.tasks.map((task) => capabilityDependencies.enqueueProductionTask(task)).filter(Boolean)
    const artifactIds = result.tasks.map((task, index) => context.registerArtifact({
      kind: 'task',
      name: basename(task.outPath),
      uri: `agent-production-task://${taskIds[index] || task.hash}`,
      metadata: {
        taskId: taskIds[index],
        productId,
        templateId,
        outputPath: task.outPath,
        planHash: task.hash,
      },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    }))
    return completed({
      status: 'accepted',
      artifactIds,
      logs: [`Queued ${artifactIds.length} production tasks`],
      warnings: result.meta.enqueued < count ? [`Requested ${count}, queued ${result.meta.enqueued}.`] : [],
      externalRefs: { taskIds: taskIds.join(','), outputDir },
    })
  },
}

export const capabilityDefinitions: AgentCapabilityDefinition[] = [
  { id: 'Product.Read', version: 1, title: 'Inspect product', description: 'Read product data and references.', intentType: 'Intent.ProductInspect', expectedArtifacts: ['report'], bindings: [productReadBinding] },
  { id: 'Product.Save', version: 1, title: 'Save product', description: 'Create or update approved product metadata and references.', intentType: 'Intent.ProductSave', expectedArtifacts: ['product'], bindings: [productSaveBinding] },
  { id: 'Product.Manage', version: 1, title: 'Manage product', description: 'Delete an existing product record after approval.', intentType: 'Intent.ProductManage', expectedArtifacts: ['report'], bindings: [productManageBinding] },
  { id: 'Product.Analyze', version: 1, title: 'Analyze product', description: 'Refresh structural product analysis.', intentType: 'Intent.ProductAnalyze', expectedArtifacts: ['report'], bindings: [productAnalyzeBinding] },
  { id: 'Material.Prepare', version: 1, title: 'Prepare materials', description: 'Prepare reusable video and image materials.', intentType: 'Intent.MaterialPrepare', expectedArtifacts: ['manifest'], bindings: [materialPrepareBinding] },
  { id: 'Material.Manage', version: 1, title: 'Manage materials', description: 'Retry, bind, classify, derive, export, or delete existing materials.', intentType: 'Intent.MaterialManage', expectedArtifacts: ['report'], bindings: [materialManageBinding] },
  { id: 'Video.Clone', version: 1, title: 'Create video', description: 'Create a commerce video from approved references.', intentType: 'Intent.CommerceVideoCreate', expectedArtifacts: ['project'], bindings: [videoCloneBinding] },
  { id: 'Video.Clone.Manage', version: 1, title: 'Manage video project', description: 'Manage an existing commerce video clone project and its outputs.', intentType: 'Intent.CloneProjectManage', expectedArtifacts: ['report'], bindings: [cloneProjectManageBinding] },
  { id: 'ModelIdentity.Manage', version: 1, title: 'Manage model identity', description: 'Generate, rename, delete, or assign a reusable model identity.', intentType: 'Intent.ModelIdentityManage', expectedArtifacts: ['report'], bindings: [modelIdentityManageBinding] },
  { id: 'LivePhoto.Create', version: 1, title: 'Create live photo', description: 'Create a live photo from product references.', intentType: 'Intent.LivePhotoCreate', expectedArtifacts: ['video'], bindings: [livePhotoBinding] },
  { id: 'LivePhoto.Manage', version: 1, title: 'Manage live photo', description: 'Retry, pause, resume, subtitle, export, or delete existing Live Photo work.', intentType: 'Intent.LivePhotoManage', expectedArtifacts: ['report'], bindings: [livePhotoManageBinding] },
  { id: 'Subtitle.Generate', version: 1, title: 'Generate subtitles', description: 'Create subtitle packaging for an existing video.', intentType: 'Intent.SubtitleGenerate', expectedArtifacts: ['video'], bindings: [subtitleBinding] },
  { id: 'Video.Slice', version: 1, title: 'Split video', description: 'Split a long local video into reusable segment files.', intentType: 'Intent.VideoSlice', expectedArtifacts: ['video'], bindings: [videoSliceBinding] },
  { id: 'Video.Publish', version: 1, title: 'Publish video', description: 'Submit an approved video to an approved account.', intentType: 'Intent.VideoPublish', expectedArtifacts: ['publish_receipt'], bindings: [publishBinding] },
  { id: 'Publishing.Manage', version: 1, title: 'Manage publishing', description: 'Manage publishing accounts, music presets, and existing publishing tasks.', intentType: 'Intent.PublishingManage', expectedArtifacts: ['report', 'publish_receipt'], bindings: [publishingManageBinding] },
  { id: 'SourceVideo.Import', version: 1, title: 'Import source videos', description: 'Import source videos from approved sharing links.', intentType: 'Intent.SourceVideoImport', expectedArtifacts: ['source_video'], bindings: [sourceVideoImportBinding] },
  { id: 'SourceVideo.Manage', version: 1, title: 'Manage source videos', description: 'Retry or delete an existing source video.', intentType: 'Intent.SourceVideoManage', expectedArtifacts: ['report'], bindings: [sourceVideoManageBinding] },
  { id: 'Listing.Generate', version: 1, title: 'Generate listing', description: 'Generate listing copy and product images.', intentType: 'Intent.ListingGenerate', expectedArtifacts: ['listing', 'image'], bindings: [listingGenerateBinding] },
  { id: 'Listing.Export', version: 1, title: 'Export listings', description: 'Export completed listing records as a spreadsheet.', intentType: 'Intent.ListingExport', expectedArtifacts: ['spreadsheet'], bindings: [listingExportBinding] },
  { id: 'Listing.Manage', version: 1, title: 'Manage listings', description: 'Create, update, delete, or configure product listing records.', intentType: 'Intent.ListingManage', expectedArtifacts: ['listing', 'report'], bindings: [listingManageBinding] },
  { id: 'TiktokCreative.Manage', version: 1, title: 'Manage TikTok creative tasks', description: 'Create and operate TikTok creative tasks from clone projects.', intentType: 'Intent.TiktokCreativeManage', expectedArtifacts: ['task', 'video'], bindings: [tiktokCreativeManageBinding] },
  { id: 'Production.BatchCreate', version: 1, title: 'Create production batch', description: 'Create queued production tasks from a product and template.', intentType: 'Intent.ProductionBatchCreate', expectedArtifacts: ['task'], bindings: [productionBatchBinding] },
  { id: 'Production.QueueControl', version: 1, title: 'Control production queue', description: 'Pause, resume, or cancel the production task queue.', intentType: 'Intent.ProductionQueueControl', expectedArtifacts: ['report'], bindings: [productionQueueControlBinding] },
  { id: 'Production.TaskManage', version: 1, title: 'Manage production task', description: 'Retry, cancel, or remove one existing production task.', intentType: 'Intent.ProductionTaskManage', expectedArtifacts: ['task'], bindings: [productionTaskManageBinding] },
  { id: 'Template.Save', version: 1, title: 'Save production template', description: 'Create or update a production template.', intentType: 'Intent.TemplateSave', expectedArtifacts: ['template'], bindings: [templateSaveBinding] },
  { id: 'Template.Manage', version: 1, title: 'Manage production template', description: 'Duplicate, delete, or edit an existing production template.', intentType: 'Intent.TemplateManage', expectedArtifacts: ['template'], bindings: [templateManageBinding] },
  { id: 'Artifact.Read', version: 1, title: 'Inspect artifacts', description: 'Read existing artifacts without changing them.', intentType: 'Intent.ArtifactInspect', expectedArtifacts: ['video'], bindings: [artifactReadBinding] },
  { id: 'Artifact.Export', version: 1, title: 'Export artifacts', description: 'Export existing artifacts.', intentType: 'Intent.ArtifactExport', expectedArtifacts: [], bindings: [exportBinding] },
]

export function capabilityForIntent(intentType: AgentIntentType) {
  return intentCapabilities[intentType]
}

export async function resolveCapabilityBinding(input: {
  intentType: AgentIntentType
  approvedPolicy: Record<string, string>
  projectPolicy?: Record<string, string>
  globalPolicy?: Record<string, string>
}) {
  const capabilityId = capabilityForIntent(input.intentType)
  const definition = capabilityDefinitions.find((item) => item.id === capabilityId)
  if (!definition) throw new Error(`Capability is not registered: ${capabilityId}`)
  const preferredId = input.approvedPolicy[capabilityId] || input.projectPolicy?.[capabilityId] || input.globalPolicy?.[capabilityId]
  const bindings = definition.bindings.slice().sort((a, b) => {
    if (a.id === preferredId) return -1
    if (b.id === preferredId) return 1
    return b.priority - a.priority || a.id.localeCompare(b.id)
  })
  for (const binding of bindings) {
    if (await binding.isHealthy()) return { definition, binding }
  }
  throw new Error(`No healthy binding is available for capability: ${capabilityId}`)
}

export function resourceLockKey(binding: AgentCapabilityBinding, input: Record<string, unknown>, artifacts: AgentArtifact[]) {
  if (!binding.resourceType) return ''
  if (binding.resourceType === 'Product') return `Product:${text(input.productId) || 'library'}`
  if (binding.resourceType === 'Project') return `Project:${text(input.projectId) || text(input.cloneProjectId) || text(input.taskId) || 'new'}`
  if (binding.resourceType === 'Publish') return `Publish:${text(input.publishAccountId) || text(input.accountId) || text(input.publishTaskId) || text(input.taskId) || text(input.musicPresetId) || text(input.presetId) || 'unselected'}`
  const inputArtifactScope = [
    text(input.artifactId),
    text(input.listingId),
    text(input.templateId),
    text(input.identityId),
    text(input.cloneProjectId),
    text(input.sourceVideoId),
    text(input.taskId),
    text(input.itemId),
    text(input.materialId),
    text(input.batchId),
    text(input.livePhotoId),
    ...strings(input.artifactIds),
    ...strings(input.listingIds),
    ...strings(input.materialIds),
    ...strings(input.livePhotoIds),
    ...strings(input.itemIds),
    ...strings(input.shareUrls),
  ].filter(Boolean).sort().join(',')
  return `Artifact:${inputArtifactScope || artifacts.map((item) => item.id).sort().join(',') || 'new'}`
}
