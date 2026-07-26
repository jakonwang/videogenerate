import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

async function exists(filePath: string) {
  return await stat(filePath).then(() => true).catch(() => false)
}

function assertManaged(dataDir: string, filePath: string) {
  assert.ok(filePath)
  assert.equal(relative(dataDir, filePath).startsWith('..'), false)
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-managed-assets-'))
  const dataDir = join(root, 'data')
  const sourceDir = join(root, 'source')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir

  try {
    await mkdir(join(dataDir, 'db'), { recursive: true })
    await mkdir(sourceDir, { recursive: true })
    const imagePath = join(sourceDir, 'source-image.png')
    const videoPath = join(sourceDir, 'source-video.mp4')
    const audioPath = join(sourceDir, 'source-audio.mp3')
    const missingPath = join(sourceDir, 'missing.bin')
    await writeFile(imagePath, Buffer.from('managed-image'))
    await writeFile(videoPath, Buffer.from('managed-video'))
    await writeFile(audioPath, Buffer.from('managed-audio'))

    const { configureAppPathRuntime } = await import('../src/main/lib/paths')
    configureAppPathRuntime({ userDataDir: root, dataDir })

    const { materializeManagedAsset } = await import('../src/main/modules/managed-assets/service')
    const directManaged = await materializeManagedAsset({
      sourcePath: imagePath,
      module: 'other',
      ownerId: 'direct',
      assetId: 'image',
    })
    assertManaged(dataDir, directManaged)
    assert.equal(await materializeManagedAsset({
      sourcePath: directManaged,
      module: 'other',
      ownerId: 'direct',
      assetId: 'image-copy',
    }), directManaged)
    assert.equal(await materializeManagedAsset({
      sourcePath: missingPath,
      module: 'other',
      ownerId: 'direct',
      assetId: 'missing',
    }), missingPath)

    const { tiktokListingRepo } = await import('../src/main/modules/tiktok-listing/repo')
    const listing = await tiktokListingRepo.createOrUpdate({
      sourceImagePath: imagePath,
      referenceImagePaths: [imagePath],
      category: 'earring',
      sku: 'managed-listing',
      localDisplayPrice: '10',
      titleLanguage: 'en',
    } as any)
    assertManaged(dataDir, listing.sourceImagePath)
    listing.referenceImagePaths.forEach((item) => assertManaged(dataDir, item))

    const { productImageMaterialsRepo } = await import('../src/main/modules/product-image-materials/repo')
    const batch = await productImageMaterialsRepo.upsertBatch({
      id: 'managed-material-batch',
      userId: 'managed-user',
      category: 'earring',
      status: 'queued',
      segmentTimeSec: 2,
      sourceItems: [{
        id: 'managed-source',
        sourceVideoPath: videoPath,
        sourceVideoName: 'source-video.mp4',
        status: 'queued',
        generatedCount: 0,
        skippedCount: 0,
        updatedAt: Date.now(),
      }],
      totalVideos: 1,
      completedVideos: 0,
      failedVideos: 0,
      generatedImageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any)
    assertManaged(dataDir, batch.sourceItems[0].sourceVideoPath)

    const { templatesRepo } = await import('../src/main/modules/templates/repo')
    const template = await templatesRepo.upsert({
      name: 'Managed template',
      structure: ['hook'],
      bgm: { filePaths: [audioPath], volume: 0.25 },
    } as any)
    assertManaged(dataDir, String(template.bgm?.filePaths[0] || ''))

    const { webPlatformRepo } = await import('../src/main/modules/web-platform/repo')
    const subtitleJob = await webPlatformRepo.upsertBatchSubtitleJob({
      id: 'managed-subtitle-job',
      userId: 'managed-user',
      name: 'Managed subtitle',
      sourceItems: [{
        id: 'managed-subtitle-source',
        sourceType: 'upload',
        sourceVideoPath: videoPath,
        coverImagePath: imagePath,
        fileName: 'source-video.mp4',
      }],
      updatedAt: Date.now(),
    } as any)
    assertManaged(dataDir, subtitleJob.sourceItems[0].sourceVideoPath)
    assertManaged(dataDir, String(subtitleJob.sourceItems[0].coverImagePath || ''))

    const { tiktokCreativeStudioRepo } = await import('../src/main/modules/tiktok-creative-studio/repo')
    const creativeTask = await tiktokCreativeStudioRepo.create({
      status: 'draft',
      shots: [{
        id: 'creative-shot-task',
        shotId: 'shot-1',
        shotIndex: 1,
        imagePath,
        prompt: 'Create a short video',
        durationSec: 5,
        status: 'draft',
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
      logs: [],
    } as any)
    assertManaged(dataDir, creativeTask.shots[0].imagePath)

    const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')
    await ensureCloneSqliteReady()
    const cloneProject = await cloneRepo.createProject({
      locale: 'zh-CN',
      strength: 'structure',
      runMode: 'rewrite',
      referenceVideoPath: videoPath,
      referenceVideoName: 'source-video.mp4',
      title: 'Managed clone',
    })
    const cloneUpdated = await cloneRepo.upsertProject({
      ...cloneProject,
      productReferenceImagePaths: [imagePath],
      blueprint: {
        shots: [{ id: 'shot-1', index: 1, uploadedImagePath: imagePath }],
      } as any,
      shotVideoOutputs: [{
        shotId: 'shot-1',
        source: 'uploaded_replacement',
        videoPath,
        status: 'done',
        updatedAt: Date.now(),
      } as any],
    })
    assertManaged(dataDir, cloneUpdated.referenceVideoPath)
    assertManaged(dataDir, String(cloneUpdated.productReferenceImagePaths?.[0] || ''))
    assertManaged(dataDir, String(cloneUpdated.blueprint?.shots[0]?.uploadedImagePath || ''))
    assertManaged(dataDir, String(cloneUpdated.shotVideoOutputs?.[0]?.videoPath || ''))

    const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
    const livePhoto = await livePhotoRepo.upsert({
      id: 'managed-live-photo',
      sourceType: 'reference_replace',
      referenceImagePath: imagePath,
      packagingStatus: 'processing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    assertManaged(dataDir, String(livePhoto.referenceImagePath || ''))

    let hermesAttachedPath = ''
    const { stageHermesPromptAttachments } = await import('../src/main/modules/hermes/service')
    await stageHermesPromptAttachments({
      sessionId: 'managed-hermes-session',
      text: 'Inspect this image',
      attachments: [{ path: imagePath, name: 'source-image.png', mediaType: 'image' }],
    }, async (method, params) => {
      if (method === 'image.attach') {
        hermesAttachedPath = String(params.path || '')
        return { attached: true, path: hermesAttachedPath }
      }
      return { attached: true }
    })
    assertManaged(dataDir, hermesAttachedPath)

    const managedPaths = [
      directManaged,
      listing.sourceImagePath,
      batch.sourceItems[0].sourceVideoPath,
      String(template.bgm?.filePaths[0] || ''),
      subtitleJob.sourceItems[0].sourceVideoPath,
      String(subtitleJob.sourceItems[0].coverImagePath || ''),
      creativeTask.shots[0].imagePath,
      cloneUpdated.referenceVideoPath,
      String(cloneUpdated.productReferenceImagePaths?.[0] || ''),
      String(cloneUpdated.blueprint?.shots[0]?.uploadedImagePath || ''),
      String(cloneUpdated.shotVideoOutputs?.[0]?.videoPath || ''),
      String(livePhoto.referenceImagePath || ''),
      hermesAttachedPath,
    ]
    await rm(sourceDir, { recursive: true, force: true })
    for (const managedPath of managedPaths) assert.equal(await exists(managedPath), true)
    assert.equal(await readFile(String(template.bgm?.filePaths[0] || ''), 'utf8'), 'managed-audio')
    assert.equal(await readFile(cloneUpdated.referenceVideoPath, 'utf8'), 'managed-video')
    assert.equal(await readFile(String(livePhoto.referenceImagePath || ''), 'utf8'), 'managed-image')

    const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
    const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')
    const { closeWebPlatformSqlite } = await import('../src/main/modules/web-platform/sqlite')
    closeCloneSqlite()
    closeLivePhotoSqlite()
    closeWebPlatformSqlite()
    console.log('[managed-assets-persistence] passed')
  } finally {
    delete process.env.VIDEOGENERATE_USER_DATA_DIR
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error('[managed-assets-persistence] failed', error)
  process.exitCode = 1
})
