import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import type { AgentIntentType } from '../src/main/modules/agent-os/types'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-agent-business-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const {
    resetAgentCapabilityTestDependencies,
    setAgentCapabilityTestDependencies,
  } = await import('../src/main/modules/agent-os/capabilityRegistry')
  const { agentOsService } = await import('../src/main/modules/agent-os/service')
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')

  const calls = {
    imports: 0,
    sourceRetries: 0,
    sourceDeletes: 0,
    materialBatchRetries: 0,
    materialVariants: 0,
    materialBindings: 0,
    materialUsageUpdates: 0,
    materialExports: 0,
    materialDeletes: 0,
    livePhotoRetries: 0,
    livePhotoPauses: 0,
    livePhotoResumes: 0,
    livePhotoExports: 0,
    livePhotoDeletes: 0,
    livePhotoSubtitleJobs: 0,
    livePhotoSubtitleApplies: 0,
    livePhotoSubtitleReverts: 0,
    listings: 0,
    exports: 0,
    listingSaves: 0,
    listingDeletes: 0,
    listingConfigSaves: 0,
    productDeletes: 0,
    creativeCreates: 0,
    creativeStarts: 0,
    creativeNextStarts: 0,
    creativeCompletions: 0,
    creativeFailures: 0,
    creativeDeletes: 0,
    videoSlices: 0,
    publishes: 0,
    publishAccountSaves: 0,
    publishAccountDeletes: 0,
    publishTaskSyncs: 0,
    musicPresetSaves: 0,
    musicPresetDeletes: 0,
    batches: 0,
    enqueues: 0,
    products: 0,
    analyses: 0,
    templates: 0,
    templateDeletes: 0,
    modelIdentityGenerations: 0,
    modelIdentityRenames: 0,
    modelIdentityAssignments: 0,
    modelIdentityDeletes: 0,
    cloneActions: [] as string[],
    queueControls: [] as string[],
    productionTaskRetries: 0,
    productionTaskCancels: 0,
    productionTaskRemovals: 0,
  }
  const templates: any[] = []
  const modelIdentities: any[] = [{
    id: 'identity-existing',
    name: 'Existing identity',
    status: 'done',
    productType: 'earrings',
    market: 'southeast_asia_female',
    gender: 'female',
    ageRange: '20_28',
    hairStyle: 'tied_back',
    skinTone: 'natural_warm',
    outfitStyle: 'clean_minimal',
    mood: 'calm_confident',
    sceneStyle: 'clean_studio',
    description: 'Existing deterministic identity',
    imagePaths: [path.join(root, 'identity-existing.png')],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }]
  const productionTasks = new Map<string, any>([
    ['task-retry', { id: 'task-retry', productId: 'product-1', templateId: 'template-1', outDir: root, outPath: path.join(root, 'task-retry.mp4'), status: 'error', progress: 0.5, logs: [], createdAt: Date.now() }],
    ['task-cancel', { id: 'task-cancel', productId: 'product-1', templateId: 'template-1', outDir: root, outPath: path.join(root, 'task-cancel.mp4'), status: 'queued', progress: 0, logs: [], createdAt: Date.now() }],
    ['task-remove', { id: 'task-remove', productId: 'product-1', templateId: 'template-1', outDir: root, outPath: path.join(root, 'task-remove.mp4'), status: 'done', progress: 1, logs: [], createdAt: Date.now() }],
  ])
  const listings: any[] = []
  const creativeTasks: any[] = []
  const publishAccounts: any[] = []
  const musicPresets: any[] = []
  const publishTasks: any[] = [{
    id: 'publish-task-1',
    pluginId: 'geelark-publisher',
    publishAccountId: 'publish-account-managed',
    cloudPhoneId: 'cloud-phone-1',
    cloudPhoneName: 'Cloud Phone 1',
    sourceVideoPath: path.join(root, 'publish-video.mp4'),
    scheduleAt: Date.now(),
    geelarkTaskId: 'external-publish-task-1',
    status: 'waiting',
    resultImages: [],
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }]

  function creativeTask(id: string, status = 'draft') {
    return {
      id,
      sourceCloneProjectId: 'clone-project-1',
      sourceCloneProjectTitle: 'Deterministic clone project',
      status,
      totalShots: 1,
      completedShots: status === 'completed' ? 1 : 0,
      failedShots: status === 'failed' ? 1 : 0,
      waitingShots: status === 'requires_manual' ? 1 : 0,
      shots: [{
        id: 'creative-shot-row-1',
        shotId: 'shot-1',
        shotIndex: 0,
        imagePath: path.join(root, 'creative-shot.png'),
        prompt: 'Create a deterministic commerce shot.',
        durationSec: 5,
        status,
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  setAgentCapabilityTestDependencies({
    importShareUrls: (async ({ shareUrls }: { shareUrls: string[] }) => {
      calls.imports += 1
      return {
        ok: true,
        items: shareUrls.map((shareUrl, index) => ({
          id: `source-${index + 1}`,
          userId: 'desktop-local',
          shareUrl,
          videoId: `video-${index + 1}`,
          platform: 'tiktok',
          title: `Source ${index + 1}`,
          author: 'tester',
          localVideoPath: path.join(root, `source-${index + 1}.mp4`),
          thumbnailPath: path.join(root, `source-${index + 1}.jpg`),
          status: 'completed',
          usedStatus: 'unused',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })),
        errors: [],
      }
    }) as any,
    retrySourceVideo: (async ({ id }: { id: string }) => {
      calls.sourceRetries += 1
      return {
        id,
        userId: 'desktop-local',
        shareUrl: 'https://www.tiktok.com/t/ZT-retry/',
        videoId: 'video-retry',
        platform: 'tiktok',
        title: 'Retried source',
        localVideoPath: path.join(root, 'source-retry.mp4'),
        status: 'completed',
        usedStatus: 'unused',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    }) as any,
    deleteSourceVideo: (async () => {
      calls.sourceDeletes += 1
      return { ok: true }
    }) as any,
    retryMaterialBatch: (async ({ batchId }: { batchId: string }) => {
      calls.materialBatchRetries += 1
      return { id: batchId, status: 'queued', sourceItems: [] }
    }) as any,
    createMaterialVariants: (async ({ materialIds }: { materialIds: string[] }) => {
      calls.materialVariants += 1
      return {
        ok: true,
        count: materialIds.length,
        created: materialIds.map((id, index) => ({
          id: `variant-${index + 1}`,
          localImagePath: path.join(root, `variant-${index + 1}.png`),
          derivedFromMaterialId: id,
          category: 'earring',
        })),
        failedCount: 0,
        errors: [],
      }
    }) as any,
    bindMaterialProduct: (async ({ materialId, productId }: { materialId: string; productId?: string }) => {
      calls.materialBindings += 1
      return { id: materialId, boundProductId: productId }
    }) as any,
    updateMaterialUsageStatus: (async ({ materialId, usageStatus }: { materialId: string; usageStatus: string }) => {
      calls.materialUsageUpdates += 1
      return { id: materialId, usageStatus }
    }) as any,
    exportMaterials: (async ({ materialIds, outputDir }: { materialIds: string[]; outputDir: string }) => {
      calls.materialExports += 1
      return {
        ok: true,
        outputDir,
        count: materialIds.length,
        exported: materialIds.map((id, index) => ({ id, filePath: path.join(outputDir, `material-${index + 1}.png`) })),
      }
    }) as any,
    deleteMaterials: (async ({ materialIds }: { materialIds: string[] }) => {
      calls.materialDeletes += 1
      return { ok: true, count: materialIds.length, ids: materialIds }
    }) as any,
    getLivePhoto: (async (id: string) => ({
      id,
      sourceType: 'reference_replace',
      sourceProjectTitle: 'Conversation Live Photo',
      productSnapshot: { name: 'Conversation product' },
      livePhotoVideoPath: path.join(root, `${id}.mov`),
      posterPath: path.join(root, `${id}.jpg`),
      packagingStatus: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })) as any,
    retryLivePhoto: (async ({ id }: { id: string }) => {
      calls.livePhotoRetries += 1
      return { id, packagingStatus: 'processing' }
    }) as any,
    pauseLivePhoto: (async ({ id }: { id: string }) => {
      calls.livePhotoPauses += 1
      return { id, autoFlowStatus: { paused: true } }
    }) as any,
    resumeLivePhoto: (async ({ id }: { id: string }) => {
      calls.livePhotoResumes += 1
      return { id, autoFlowStatus: { paused: false } }
    }) as any,
    exportLivePhotos: (async ({ ids, outputDir }: { ids: string[]; outputDir?: string }) => {
      calls.livePhotoExports += 1
      const targetDir = outputDir || root
      return {
        outputDir: targetDir,
        total: ids.length,
        exported: ids.map((id) => ({ id, videoPath: path.join(targetDir, `${id}-export.mov`) })),
        skipped: [],
      }
    }) as any,
    removeLivePhoto: (async () => {
      calls.livePhotoDeletes += 1
      return { ok: true }
    }) as any,
    generateLivePhotoSubtitles: (async ({ sourceItems }: { sourceItems: any[] }) => {
      calls.livePhotoSubtitleJobs += 1
      return {
        id: 'live-photo-subtitle-job',
        sourceItems,
        outputs: sourceItems.map((item) => ({
          sourceItemId: item.id,
          outputVideoPath: path.join(root, `${item.id}-subtitle.mp4`),
          coverImagePath: path.join(root, `${item.id}-subtitle.jpg`),
          renderStatus: 'success',
        })),
      }
    }) as any,
    applyLivePhotoSubtitle: (async ({ id }: { id: string }) => {
      calls.livePhotoSubtitleApplies += 1
      return { id, subtitleOverlayActive: true }
    }) as any,
    revertLivePhotoSubtitle: (async ({ id }: { id: string }) => {
      calls.livePhotoSubtitleReverts += 1
      return { id, subtitleOverlayActive: false }
    }) as any,
    generateListing: (async ({ id }: { id: string }) => {
      calls.listings += 1
      return {
        id,
        sku: 'SKU-001',
        category: 'fashion_accessories',
        generatedTitle: 'Generated listing',
        generationStatus: 'done',
        generationError: '',
        listingImages: [{
          id: 'listing-image-1',
          fileName: 'listing-image-1.png',
          filePath: path.join(root, 'listing-image-1.png'),
          publicUrl: 'https://example.invalid/listing-image-1.png',
        }],
      }
    }) as any,
    exportListings: (async ({ ids }: { ids: string[] }) => {
      calls.exports += 1
      return { filePath: path.join(root, 'listings.xlsx'), total: ids.length }
    }) as any,
    listListings: (async () => listings) as any,
    saveListing: (async (input: any) => {
      calls.listingSaves += 1
      const index = listings.findIndex((item) => item.id === input.id)
      const saved = {
        ...(index >= 0 ? listings[index] : {}),
        ...input,
        id: input.id || 'listing-managed',
        listingImages: index >= 0 ? listings[index].listingImages : [],
        generationStatus: index >= 0 ? listings[index].generationStatus : 'idle',
        createdAt: index >= 0 ? listings[index].createdAt : Date.now(),
        updatedAt: Date.now(),
      }
      if (index >= 0) listings[index] = saved
      else listings.push(saved)
      return saved
    }) as any,
    removeListing: (async (id: string) => {
      calls.listingDeletes += 1
      listings.splice(listings.findIndex((item) => item.id === id), 1)
      return { ok: true }
    }) as any,
    saveListingExportConfigs: (async (configs: any[]) => {
      calls.listingConfigSaves += 1
      return configs
    }) as any,
    removeProduct: (async () => {
      calls.productDeletes += 1
      return { ok: true }
    }) as any,
    listCreativeTasks: (async () => creativeTasks) as any,
    createCreativeDrafts: (async () => {
      calls.creativeCreates += 1
      const task = creativeTask('creative-created')
      creativeTasks.push(task)
      return [task]
    }) as any,
    startCreativeShot: (async ({ id }: { id: string }) => {
      calls.creativeStarts += 1
      const task = creativeTasks.find((item) => item.id === id) || creativeTask(id)
      Object.assign(task, creativeTask(id, 'requires_manual'))
      if (!creativeTasks.includes(task)) creativeTasks.push(task)
      return task
    }) as any,
    startNextCreativeShot: (async ({ id }: { id: string }) => {
      calls.creativeNextStarts += 1
      const task = creativeTasks.find((item) => item.id === id) || creativeTask(id)
      Object.assign(task, creativeTask(id, 'requires_manual'))
      if (!creativeTasks.includes(task)) creativeTasks.push(task)
      return task
    }) as any,
    completeCreativeShot: (async ({ id, resultVideoPath }: { id: string; resultVideoPath: string }) => {
      calls.creativeCompletions += 1
      const task = creativeTasks.find((item) => item.id === id) || creativeTask(id)
      Object.assign(task, creativeTask(id, 'completed'))
      task.shots[0].resultVideoPath = resultVideoPath
      if (!creativeTasks.includes(task)) creativeTasks.push(task)
      return task
    }) as any,
    failCreativeShot: (async ({ id, error }: { id: string; error: string }) => {
      calls.creativeFailures += 1
      const task = creativeTasks.find((item) => item.id === id) || creativeTask(id)
      Object.assign(task, creativeTask(id, 'failed'), { lastError: error })
      if (!creativeTasks.includes(task)) creativeTasks.push(task)
      return task
    }) as any,
    removeCreativeTask: (async (id: string) => {
      calls.creativeDeletes += 1
      creativeTasks.splice(creativeTasks.findIndex((item) => item.id === id), 1)
      return { ok: true }
    }) as any,
    splitVideo: (async ({ outputDir }: { outputDir?: string }) => {
      calls.videoSlices += 1
      const targetDir = outputDir || root
      const outputPaths = [path.join(targetDir, 'part_000.mp4'), path.join(targetDir, 'part_001.mp4')]
      await Promise.all(outputPaths.map((outputPath) => writeFile(outputPath, Buffer.from('segment'))))
      return outputPaths
    }) as any,
    publishVideo: (async (_token: string, input: any) => {
      calls.publishes += 1
      return {
        id: 'publish-created',
        publishAccountId: input.publishAccountId,
        sourceVideoPath: input.videoPath,
        status: 'waiting',
      }
    }) as any,
    listPublishAccounts: (async () => publishAccounts) as any,
    savePublishAccount: (async (_userId: string, input: any) => {
      calls.publishAccountSaves += 1
      const index = publishAccounts.findIndex((item) => item.id === input.id)
      const saved = {
        ...(index >= 0 ? publishAccounts[index] : {}),
        ...input,
        id: input.id || 'publish-account-managed',
        platform: 'tiktok',
        createdAt: index >= 0 ? publishAccounts[index].createdAt : Date.now(),
        updatedAt: Date.now(),
      }
      if (index >= 0) publishAccounts[index] = saved
      else publishAccounts.push(saved)
      return saved
    }) as any,
    removePublishAccount: (async (_userId: string, id: string) => {
      calls.publishAccountDeletes += 1
      publishAccounts.splice(publishAccounts.findIndex((item) => item.id === id), 1)
    }) as any,
    listPublishTasks: (async () => publishTasks) as any,
    syncPublishTask: (async (_userId: string, id: string) => {
      calls.publishTaskSyncs += 1
      const task = publishTasks.find((item) => item.id === id)
      Object.assign(task, { status: 'completed', lastSyncAt: Date.now(), updatedAt: Date.now(), resultImages: ['result.png'] })
      return task
    }) as any,
    listMusicPresets: (async () => musicPresets) as any,
    saveMusicPreset: (async (_userId: string, input: any) => {
      calls.musicPresetSaves += 1
      const index = musicPresets.findIndex((item) => item.id === input.id)
      const saved = {
        ...(index >= 0 ? musicPresets[index] : {}),
        ...input,
        id: input.id || 'music-preset-managed',
        createdAt: index >= 0 ? musicPresets[index].createdAt : Date.now(),
        updatedAt: Date.now(),
      }
      if (index >= 0) musicPresets[index] = saved
      else musicPresets.push(saved)
      return saved
    }) as any,
    removeMusicPreset: (async (_userId: string, id: string) => {
      calls.musicPresetDeletes += 1
      musicPresets.splice(musicPresets.findIndex((item) => item.id === id), 1)
    }) as any,
    createProductionBatch: (async ({ count }: { count: number }) => {
      calls.batches += 1
      return {
        tasks: Array.from({ length: count }, (_, index) => ({
          productId: 'product-1',
          templateId: 'template-1',
          outDir: root,
          outPath: path.join(root, `production-${index + 1}.mp4`),
          plan: { segments: [] },
          hash: `production-hash-${index + 1}`,
        })),
        meta: { requested: count, enqueued: count, attempts: count, skipped: {} },
      }
    }) as any,
    enqueueProductionTask: (task: { hash: string }) => {
      calls.enqueues += 1
      return `queue-${task.hash}`
    },
    saveProduct: (async (input: any) => {
      calls.products += 1
      return await productsRepo.upsert(input)
    }) as any,
    analyzeProduct: (async ({ productId }: { productId: string }) => {
      calls.analyses += 1
      const current = (await productsRepo.list()).find((item) => item.id === productId)
      if (!current) throw new Error('Product does not exist')
      return await productsRepo.upsert({
        ...current,
        productAnalysis: {
          category: current.type,
          summary: 'Deterministic product analysis',
          coreSubject: current.name,
          connectionStructure: 'stable',
          materialDetails: 'metal',
          wearingPosition: 'ear',
          surfaceDetails: 'polished',
          colorDetails: 'silver',
          geometryDetails: 'round',
          sizeScale: 'small',
          matchingRules: ['preserve shape'],
          rawDescription: 'Deterministic product analysis',
          updatedAt: Date.now(),
        },
      })
    }) as any,
    getCloneProject: (async ({ cloneProjectId }: { cloneProjectId: string }) => ({
      id: cloneProjectId,
      title: 'Deterministic clone project',
      finalCompose: {
        status: 'done',
        outputPath: path.join(root, 'clone-final.mp4'),
        coverImagePath: path.join(root, 'clone-final.jpg'),
      },
    })) as any,
    updateCloneProjectMeta: (async ({ cloneProjectId, title, description }: any) => {
      calls.cloneActions.push('update_meta')
      return { project: { id: cloneProjectId, title, description }, summary: {} }
    }) as any,
    pauseCloneQueue: (async () => {
      calls.cloneActions.push('pause_queue')
      return { paused: true }
    }) as any,
    resumeCloneQueue: (async () => {
      calls.cloneActions.push('resume_queue')
      return { paused: false }
    }) as any,
    reconcileCloneProject: (async () => {
      calls.cloneActions.push('reconcile')
      return { results: [{ shotId: 'shot-1', status: 'done' }] }
    }) as any,
    retryCloneShot: (async ({ shotId }: { shotId: string }) => {
      calls.cloneActions.push('retry_shot')
      return { status: 'submitting', synced: false, task: { taskId: `retry-${shotId}` } }
    }) as any,
    downloadCloneShot: (async ({ shotId }: { shotId: string }) => {
      calls.cloneActions.push('download_shot')
      return { status: 'done', synced: true, task: { taskId: `download-${shotId}` } }
    }) as any,
    composeCloneFinal: (async ({ cloneProjectId }: { cloneProjectId: string }) => {
      calls.cloneActions.push('compose')
      return {
        project: { id: cloneProjectId },
        finalCompose: { status: 'done', outputPath: path.join(root, 'clone-composed.mp4') },
      }
    }) as any,
    exportCloneFinal: (async ({ cloneProjectIds, outputDir }: { cloneProjectIds: string[]; outputDir: string }) => {
      calls.cloneActions.push('export')
      return {
        outputDir,
        exported: cloneProjectIds.map((cloneProjectId) => ({
          cloneProjectId,
          title: 'Deterministic clone project',
          sourcePath: path.join(root, 'clone-final.mp4'),
          targetPath: path.join(outputDir, `${cloneProjectId}.mp4`),
        })),
        skipped: [],
        total: cloneProjectIds.length,
      }
    }) as any,
    generateCloneSubtitles: (async ({ sourceItems }: any) => {
      calls.cloneActions.push('subtitle_generate')
      return {
        id: 'clone-subtitle-job',
        sourceItems,
        outputs: [{
          sourceItemId: sourceItems[0].id,
          renderStatus: 'success',
          outputVideoPath: path.join(root, 'clone-subtitled.mp4'),
          coverImagePath: path.join(root, 'clone-subtitled.jpg'),
        }],
      }
    }) as any,
    applyCloneSubtitle: (async () => {
      calls.cloneActions.push('subtitle_apply')
      return { project: {}, summary: {} }
    }) as any,
    revertCloneSubtitle: (async () => {
      calls.cloneActions.push('subtitle_revert')
      return { project: {}, summary: {} }
    }) as any,
    removeCloneProject: (async () => {
      calls.cloneActions.push('delete')
      return true
    }) as any,
    saveCloneProjectTemplate: (async () => {
      calls.cloneActions.push('save_clone_template')
      return { templateId: 'clone-template', templateName: 'Clone template' }
    }) as any,
    convertCloneProjectTemplate: (async () => {
      calls.cloneActions.push('convert_template')
      return { templateId: 'production-template', templateName: 'Production template' }
    }) as any,
    listModelIdentities: (async () => modelIdentities) as any,
    generateModelIdentity: (async (input: any) => {
      calls.modelIdentityGenerations += 1
      const generated = {
        ...modelIdentities[0],
        id: 'identity-generated',
        name: 'Generated identity',
        productType: input.productType,
        imagePaths: [path.join(root, 'identity-generated.png')],
      }
      modelIdentities.push(generated)
      return generated
    }) as any,
    renameModelIdentity: (async ({ id, name }: { id: string; name: string }) => {
      calls.modelIdentityRenames += 1
      const item = modelIdentities.find((candidate) => candidate.id === id)
      Object.assign(item, { name, updatedAt: Date.now() })
      return item
    }) as any,
    selectProjectModelIdentity: (async ({ cloneProjectId, identityId }: { cloneProjectId: string; identityId: string }) => {
      calls.modelIdentityAssignments += 1
      return { id: cloneProjectId, title: 'Identity-bound clone project', selectedModelIdentityId: identityId }
    }) as any,
    deleteModelIdentity: (async ({ id }: { id: string }) => {
      calls.modelIdentityDeletes += 1
      modelIdentities.splice(modelIdentities.findIndex((item) => item.id === id), 1)
      return { ok: true }
    }) as any,
    listTemplates: (async () => templates) as any,
    saveTemplate: (async (input: any) => {
      calls.templates += 1
      const existingIndex = templates.findIndex((item) => item.id === input.id)
      const saved = {
        ...(existingIndex >= 0 ? templates[existingIndex] : {}),
        ...input,
        id: input.id || 'template-created',
        totalDurationSec: input.totalDurationSec || { min: 7, max: 15 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      if (existingIndex >= 0) templates[existingIndex] = saved
      else templates.push(saved)
      return saved
    }) as any,
    removeTemplate: (async (id: string) => {
      calls.templateDeletes += 1
      templates.splice(templates.findIndex((item) => item.id === id), 1)
      return { ok: true }
    }) as any,
    getProductionTask: ((id: string) => productionTasks.get(id)) as any,
    retryProductionTask: ((id: string) => {
      calls.productionTaskRetries += 1
      const task = productionTasks.get(id)
      Object.assign(task, { status: 'queued', progress: 0, error: undefined })
      return task
    }) as any,
    cancelProductionTask: ((id: string) => {
      calls.productionTaskCancels += 1
      const task = productionTasks.get(id)
      Object.assign(task, { status: 'cancelled', progress: 0 })
      return task
    }) as any,
    removeProductionTask: ((id: string) => {
      calls.productionTaskRemovals += 1
      const task = productionTasks.get(id)
      productionTasks.delete(id)
      return { ok: true, task, outputFilesPreserved: true }
    }) as any,
    controlProductionQueue: (action) => {
      calls.queueControls.push(action)
      return {
        before: { paused: action === 'resume', pending: 2 },
        after: { paused: action === 'pause', pending: action === 'cancel' ? 0 : 2 },
      }
    },
  })

  async function execute(intentType: AgentIntentType, stepInput: Record<string, unknown>) {
    const created = await agentOsService.createIntentRun({
      intentType,
      request: `Execute ${intentType}`,
      stepInput,
      requireApproval: false,
    })
    const detail = await agentOsService.waitForRun(created.run.id, 10_000)
    assert.equal(detail.run.status, 'completed', `${intentType} should complete`)
    assert.equal(detail.steps[0].status, 'completed')
    return detail
  }

  try {
    await agentOsService.initialize()

    const productImagePath = path.join(root, 'product-reference.png')
    await writeFile(productImagePath, Buffer.from('product-reference'))
    const product = await execute('Intent.ProductSave', {
      productName: 'Conversation product',
      productType: 'earring',
      storyboardTemplateType: 'jewelry',
      imagePaths: [productImagePath],
    })
    assert.equal(calls.products, 1)
    assert.equal(product.artifacts.find((item) => item.kind === 'product')?.metadata.action, 'created')
    assert.equal(product.artifacts.find((item) => item.kind === 'product')?.metadata.imageCount, 1)

    const productId = String(product.artifacts.find((item) => item.kind === 'product')?.metadata.productId || '')
    const analyzed = await execute('Intent.ProductAnalyze', { productId })
    assert.equal(calls.analyses, 1)
    assert.equal(
      (analyzed.artifacts.find((item) => item.kind === 'report')?.metadata.analysis as { summary?: string })?.summary,
      'Deterministic product analysis',
    )

    const template = await execute('Intent.TemplateSave', {
      templateName: 'Conversation template',
      structure: ['hook', 'show', 'detail'],
      segmentSyncMode: 'follow_product',
      durationMin: 8,
      durationMax: 12,
      skipStartSec: 0.75,
      segmentDurations: { hook: { min: 1.5, max: 2.5 } },
      randomOrderMode: 'partial',
      keepFirstCount: 2,
      transitionEnabled: true,
      transitionTypes: ['fade', 'slideleft'],
      transitionDurationMin: 0.1,
      transitionDurationMax: 0.2,
      audioSource: 'keep',
      audioDuckingEnabled: true,
      audioDuckingAmountDb: 12,
      subtitleEnabled: true,
      ttsEnabled: true,
      ttsVoice: 'zh-CN-XiaoxiaoNeural',
      ttsMixVolume: 0.8,
      aspectUnifyMode: 'cover_crop',
    })
    assert.equal(calls.templates, 1)
    assert.equal(template.artifacts.find((item) => item.kind === 'template')?.metadata.action, 'created')
    assert.deepEqual(template.artifacts.find((item) => item.kind === 'template')?.metadata.totalDurationSec, { min: 8, max: 12 })
    assert.deepEqual(template.artifacts.find((item) => item.kind === 'template')?.metadata.transition, {
      enabled: true,
      pool: ['fade', 'slideleft'],
      durationSec: { min: 0.1, max: 0.2 },
    })
    assert.equal(template.artifacts.find((item) => item.kind === 'template')?.metadata.aspectUnifyMode, 'cover_crop')

    const duplicatedTemplate = await execute('Intent.TemplateManage', {
      action: 'duplicate',
      templateId: 'template-created',
      templateName: 'Conversation template copy',
    })
    assert.equal(duplicatedTemplate.artifacts.find((item) => item.kind === 'template')?.metadata.action, 'duplicated')
    await execute('Intent.TemplateManage', { action: 'delete', templateId: 'template-created' })
    assert.equal(calls.templateDeletes, 1)

    const generatedIdentity = await execute('Intent.ModelIdentityManage', {
      action: 'generate',
      productType: 'earrings',
      profile: { gender: 'female', ageRange: '20_28', sceneStyle: 'clean_studio' },
      referenceImagePaths: [path.join(root, 'identity-reference.png')],
    })
    assert.equal(calls.modelIdentityGenerations, 1)
    assert.equal(generatedIdentity.artifacts.filter((item) => item.kind === 'image').length, 1)
    assert.equal(generatedIdentity.artifacts.find((item) => item.kind === 'report')?.metadata.identityId, 'identity-generated')
    await execute('Intent.ModelIdentityManage', { action: 'rename', identityId: 'identity-generated', name: 'Renamed identity' })
    await execute('Intent.ModelIdentityManage', { action: 'assign', identityId: 'identity-generated', cloneProjectId: 'clone-project-1' })
    await execute('Intent.ModelIdentityManage', { action: 'delete', identityId: 'identity-generated' })
    assert.equal(calls.modelIdentityRenames, 1)
    assert.equal(calls.modelIdentityAssignments, 1)
    assert.equal(calls.modelIdentityDeletes, 1)

    const queue = await execute('Intent.ProductionQueueControl', { action: 'pause' })
    assert.deepEqual(calls.queueControls, ['pause'])
    assert.equal(queue.artifacts.find((item) => item.kind === 'report')?.metadata.action, 'pause')

    const retriedProductionTask = await execute('Intent.ProductionTaskManage', { action: 'retry', taskId: 'task-retry' })
    assert.equal(calls.productionTaskRetries, 1)
    assert.equal(retriedProductionTask.attempts[0]?.result?.status, 'accepted')
    assert.equal(retriedProductionTask.artifacts.find((item) => item.kind === 'task')?.metadata.status, 'queued')
    const cancelledProductionTask = await execute('Intent.ProductionTaskManage', { action: 'cancel', taskId: 'task-cancel' })
    assert.equal(calls.productionTaskCancels, 1)
    assert.equal(cancelledProductionTask.artifacts.find((item) => item.kind === 'task')?.metadata.status, 'cancelled')
    const removedProductionTask = await execute('Intent.ProductionTaskManage', { action: 'remove', taskId: 'task-remove' })
    assert.equal(calls.productionTaskRemovals, 1)
    assert.equal(removedProductionTask.artifacts.find((item) => item.kind === 'report')?.metadata.outputFilesPreserved, true)

    const cloneProjectId = 'clone-project-1'
    await execute('Intent.CloneProjectManage', { action: 'update_meta', cloneProjectId, title: 'Updated clone project' })
    await execute('Intent.CloneProjectManage', { action: 'pause_queue', cloneProjectId })
    const resumedClone = await execute('Intent.CloneProjectManage', { action: 'resume_queue', cloneProjectId })
    assert.equal(resumedClone.attempts[0]?.result?.status, 'accepted')
    await execute('Intent.CloneProjectManage', { action: 'reconcile', cloneProjectId })
    await execute('Intent.CloneProjectManage', { action: 'retry_shot', cloneProjectId, shotId: 'shot-1' })
    await execute('Intent.CloneProjectManage', { action: 'download_shot', cloneProjectId, shotId: 'shot-1' })
    const composedClone = await execute('Intent.CloneProjectManage', { action: 'compose', cloneProjectId })
    assert.equal(composedClone.artifacts.filter((item) => item.kind === 'video').length, 1)
    const exportedClone = await execute('Intent.CloneProjectManage', { action: 'export', cloneProjectId, outputDir: root })
    assert.equal(exportedClone.artifacts.filter((item) => item.kind === 'video').length, 1)
    const subtitledClone = await execute('Intent.CloneProjectManage', { action: 'subtitle_generate', cloneProjectId, titleText: 'Clone title' })
    assert.equal(subtitledClone.artifacts.filter((item) => item.kind === 'video').length, 1)
    await execute('Intent.CloneProjectManage', { action: 'subtitle_revert', cloneProjectId })
    const cloneTemplate = await execute('Intent.CloneProjectManage', { action: 'save_clone_template', cloneProjectId })
    assert.equal(cloneTemplate.artifacts.find((item) => item.kind === 'template')?.metadata.templateId, 'clone-template')
    const productionTemplate = await execute('Intent.CloneProjectManage', { action: 'convert_template', cloneProjectId })
    assert.equal(productionTemplate.artifacts.find((item) => item.kind === 'template')?.metadata.templateId, 'production-template')
    await execute('Intent.CloneProjectManage', { action: 'delete', cloneProjectId })
    assert.deepEqual(calls.cloneActions, [
      'update_meta',
      'pause_queue',
      'resume_queue',
      'reconcile',
      'retry_shot',
      'download_shot',
      'compose',
      'export',
      'subtitle_generate',
      'subtitle_apply',
      'subtitle_revert',
      'save_clone_template',
      'convert_template',
      'delete',
    ])

    const imported = await execute('Intent.SourceVideoImport', {
      shareUrls: ['https://www.tiktok.com/t/ZT-test-1/', 'https://www.tiktok.com/t/ZT-test-2/'],
    })
    assert.equal(calls.imports, 1)
    assert.equal(imported.artifacts.filter((item) => item.kind === 'source_video').length, 2)
    assert.ok(imported.artifacts.every((item) => item.metadata.usedStatus === 'unused'))

    const retriedSource = await execute('Intent.SourceVideoManage', {
      action: 'retry',
      sourceVideoId: 'source-retry',
    })
    assert.equal(calls.sourceRetries, 1)
    assert.ok(retriedSource.artifacts.some((item) => item.kind === 'source_video'))
    assert.ok(retriedSource.artifacts.some((item) => item.kind === 'report'))

    const deletedSource = await execute('Intent.SourceVideoManage', {
      action: 'delete',
      sourceVideoId: 'source-delete',
    })
    assert.equal(calls.sourceDeletes, 1)
    assert.equal(deletedSource.artifacts.find((item) => item.kind === 'report')?.metadata.deleted, true)

    const retriedMaterialBatch = await execute('Intent.MaterialManage', {
      action: 'retry_batch',
      batchId: 'batch-retry',
    })
    assert.equal(calls.materialBatchRetries, 1)
    assert.equal(retriedMaterialBatch.artifacts.find((item) => item.kind === 'report')?.metadata.batchId, 'batch-retry')

    const materialVariants = await execute('Intent.MaterialManage', {
      action: 'create_variants',
      materialIds: ['material-1', 'material-2'],
      variantCount: 1,
    })
    assert.equal(calls.materialVariants, 1)
    assert.equal(materialVariants.artifacts.filter((item) => item.kind === 'image').length, 2)

    await execute('Intent.MaterialManage', {
      action: 'bind_product',
      materialId: 'material-1',
      productId,
    })
    assert.equal(calls.materialBindings, 1)

    await execute('Intent.MaterialManage', {
      action: 'update_usage',
      materialIds: ['material-1', 'material-2'],
      usageStatus: 'used',
    })
    assert.equal(calls.materialUsageUpdates, 2)

    const exportedMaterials = await execute('Intent.MaterialManage', {
      action: 'export',
      materialIds: ['material-1', 'material-2'],
      outputDir: root,
    })
    assert.equal(calls.materialExports, 1)
    assert.equal(exportedMaterials.artifacts.filter((item) => item.kind === 'image').length, 2)

    const deletedMaterials = await execute('Intent.MaterialManage', {
      action: 'delete',
      materialIds: ['material-1', 'material-2'],
    })
    assert.equal(calls.materialDeletes, 1)
    assert.equal(deletedMaterials.artifacts.find((item) => item.kind === 'report')?.metadata.deletedCount, 2)

    const retriedLivePhoto = await execute('Intent.LivePhotoManage', {
      action: 'retry',
      livePhotoIds: ['live-photo-1'],
      motionTemplate: 'push_in',
    })
    assert.equal(calls.livePhotoRetries, 1)
    assert.equal(retriedLivePhoto.attempts[0]?.result?.status, 'accepted')

    await execute('Intent.LivePhotoManage', { action: 'pause', livePhotoIds: ['live-photo-1'] })
    assert.equal(calls.livePhotoPauses, 1)

    const resumedLivePhoto = await execute('Intent.LivePhotoManage', {
      action: 'resume',
      livePhotoIds: ['live-photo-1'],
      motionTemplate: 'ambient_sway',
    })
    assert.equal(calls.livePhotoResumes, 1)
    assert.equal(resumedLivePhoto.attempts[0]?.result?.status, 'accepted')

    const exportedLivePhotos = await execute('Intent.LivePhotoManage', {
      action: 'export',
      livePhotoIds: ['live-photo-1', 'live-photo-2'],
      outputDir: root,
    })
    assert.equal(calls.livePhotoExports, 1)
    assert.equal(exportedLivePhotos.artifacts.filter((item) => item.kind === 'video').length, 2)

    const subtitledLivePhoto = await execute('Intent.LivePhotoManage', {
      action: 'subtitle_generate',
      livePhotoIds: ['live-photo-1', 'live-photo-2'],
      titleText: 'Conversation title',
    })
    assert.equal(calls.livePhotoSubtitleJobs, 1)
    assert.equal(calls.livePhotoSubtitleApplies, 2)
    assert.equal(subtitledLivePhoto.artifacts.filter((item) => item.kind === 'video').length, 2)

    await execute('Intent.LivePhotoManage', {
      action: 'subtitle_revert',
      livePhotoIds: ['live-photo-1', 'live-photo-2'],
    })
    assert.equal(calls.livePhotoSubtitleReverts, 2)

    const deletedLivePhotos = await execute('Intent.LivePhotoManage', {
      action: 'delete',
      livePhotoIds: ['live-photo-1', 'live-photo-2'],
    })
    assert.equal(calls.livePhotoDeletes, 2)
    assert.equal(deletedLivePhotos.artifacts.find((item) => item.kind === 'report')?.metadata.deletedCount, 2)

    const listing = await execute('Intent.ListingGenerate', { listingId: 'listing-1' })
    assert.equal(calls.listings, 1)
    assert.ok(listing.artifacts.some((item) => item.kind === 'listing'))
    assert.ok(listing.artifacts.some((item) => item.kind === 'image'))

    const exported = await execute('Intent.ListingExport', { listingIds: ['listing-1', 'listing-2'] })
    assert.equal(calls.exports, 1)
    assert.equal(exported.artifacts.find((item) => item.kind === 'spreadsheet')?.metadata.total, 2)

    const managedListing = await execute('Intent.ListingManage', {
      action: 'save',
      sourceImagePath: productImagePath,
      referenceImagePaths: [productImagePath],
      category: 'earring',
      sku: 'SKU-MANAGED',
      localDisplayPrice: '19.99',
      titleLanguage: 'en-US',
    })
    assert.equal(calls.listingSaves, 1)
    assert.equal(managedListing.artifacts.find((item) => item.kind === 'listing')?.metadata.action, 'created')
    await execute('Intent.ListingManage', {
      action: 'save_export_config',
      configs: [{ category: 'earring', categoryId: '123', productAttributes: 'material:silver' }],
    })
    assert.equal(calls.listingConfigSaves, 1)
    await execute('Intent.ListingManage', { action: 'delete', listingId: 'listing-managed' })
    assert.equal(calls.listingDeletes, 1)

    const createdCreative = await execute('Intent.TiktokCreativeManage', {
      action: 'create_drafts',
      cloneProjectIds: ['clone-project-1'],
    })
    assert.equal(calls.creativeCreates, 1)
    assert.equal(createdCreative.artifacts.find((item) => item.kind === 'task')?.metadata.taskId, 'creative-created')
    const startedCreative = await execute('Intent.TiktokCreativeManage', {
      action: 'start_shot',
      taskId: 'creative-created',
      shotId: 'shot-1',
    })
    assert.equal(calls.creativeStarts, 1)
    assert.equal(startedCreative.attempts[0]?.result?.status, 'accepted')
    await execute('Intent.TiktokCreativeManage', { action: 'start_next', taskId: 'creative-created' })
    assert.equal(calls.creativeNextStarts, 1)
    const creativeResultPath = path.join(root, 'creative-result.mp4')
    await writeFile(creativeResultPath, Buffer.from('creative-result'))
    const completedCreative = await execute('Intent.TiktokCreativeManage', {
      action: 'mark_completed',
      taskId: 'creative-created',
      shotId: 'shot-1',
      resultVideoPath: creativeResultPath,
    })
    assert.equal(calls.creativeCompletions, 1)
    assert.equal(completedCreative.artifacts.filter((item) => item.kind === 'video').length, 1)
    await execute('Intent.TiktokCreativeManage', {
      action: 'mark_failed',
      taskId: 'creative-created',
      shotId: 'shot-1',
      error: 'Deterministic failure',
    })
    assert.equal(calls.creativeFailures, 1)
    await execute('Intent.TiktokCreativeManage', { action: 'delete', taskId: 'creative-created' })
    assert.equal(calls.creativeDeletes, 1)

    const batch = await execute('Intent.ProductionBatchCreate', {
      productId: 'product-1',
      templateId: 'template-1',
      outputDir: root,
      quantity: 2,
    })
    assert.equal(calls.batches, 1)
    assert.equal(calls.enqueues, 2)
    assert.equal(batch.artifacts.filter((item) => item.kind === 'task').length, 2)
    assert.ok(batch.artifacts.every((item) => String(item.metadata.taskId || '').startsWith('queue-')))

    const sliceSourcePath = path.join(root, 'long-video.mp4')
    await writeFile(sliceSourcePath, Buffer.from('long-video'))
    const sliced = await execute('Intent.VideoSlice', {
      inputPath: sliceSourcePath,
      segmentTimeSec: 30,
      outputDir: root,
      outputFormat: 'mp4',
    })
    assert.equal(calls.videoSlices, 1)
    assert.equal(sliced.artifacts.filter((item) => item.kind === 'video').length, 2)
    assert.equal(sliced.artifacts[0]?.metadata.segmentTimeSec, 30)

    const publishAccount = await execute('Intent.PublishingManage', {
      action: 'account_save',
      name: 'Managed account',
      cloudPhoneId: 'cloud-phone-1',
      cloudPhoneName: 'Cloud Phone 1',
      status: 'active',
    })
    assert.equal(calls.publishAccountSaves, 1)
    assert.equal(publishAccount.artifacts.find((item) => item.kind === 'report')?.metadata.publishAccountId, 'publish-account-managed')
    const publishVideoPath = path.join(root, 'publish-video.mp4')
    await writeFile(publishVideoPath, Buffer.from('publish-video'))
    const published = await execute('Intent.VideoPublish', {
      videoPath: publishVideoPath,
      publishAccountId: 'publish-account-managed',
      videoDesc: 'Deterministic publish test',
    })
    assert.equal(calls.publishes, 1)
    assert.equal(published.artifacts.find((item) => item.kind === 'publish_receipt')?.metadata.taskId, 'publish-created')

    const musicPreset = await execute('Intent.PublishingManage', {
      action: 'music_save',
      label: 'Managed music',
      refVideoId: 'music-reference-1',
    })
    assert.equal(calls.musicPresetSaves, 1)
    assert.equal(musicPreset.artifacts.find((item) => item.kind === 'report')?.metadata.musicPresetId, 'music-preset-managed')
    const syncedPublishTask = await execute('Intent.PublishingManage', {
      action: 'task_sync',
      publishTaskId: 'publish-task-1',
    })
    assert.equal(calls.publishTaskSyncs, 1)
    assert.equal(syncedPublishTask.artifacts.find((item) => item.kind === 'publish_receipt')?.metadata.status, 'completed')
    await execute('Intent.PublishingManage', { action: 'music_delete', musicPresetId: 'music-preset-managed' })
    assert.equal(calls.musicPresetDeletes, 1)
    await execute('Intent.PublishingManage', { action: 'account_delete', publishAccountId: 'publish-account-managed' })
    assert.equal(calls.publishAccountDeletes, 1)

    const deletedProduct = await execute('Intent.ProductManage', { action: 'delete', productId })
    assert.equal(calls.productDeletes, 1)
    assert.equal(deletedProduct.artifacts.find((item) => item.kind === 'report')?.metadata.deleted, true)

    console.log('agent-os-business-capabilities.smoke: ok')
  } finally {
    resetAgentCapabilityTestDependencies()
    closeCloneSqlite()
    closeLivePhotoSqlite()
    await rm(root, { recursive: true, force: true })
  }
}

void main()
