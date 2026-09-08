import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-startup-filter-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')

  try {
    const referenceImagePath = path.join(root, 'reference.jpg')
    await writeFile(referenceImagePath, 'reference', 'utf-8')
    const createdAt = Date.now()
    const baseItem = {
      sourceType: 'reference_replace',
      referenceImagePath,
      packagingStatus: 'processing',
      createdAt,
      updatedAt: createdAt,
    }

    await livePhotoRepo.upsert({
      ...baseItem,
      id: 'idle-without-remote-task',
      autoFlowStatus: {
        enabled: true,
        status: 'idle',
        paused: false,
        retryLimit: 2,
        retryCount: 0,
        currentStage: 'queued',
      },
    } as any)
    await livePhotoRepo.upsert({
      ...baseItem,
      id: 'retryable-without-remote-task',
      packagingStatus: 'failed',
      autoFlowStatus: {
        enabled: true,
        status: 'failed_retryable',
        paused: false,
        retryLimit: 2,
        retryCount: 1,
        currentStage: 'image_generation',
        lastError: '[retryable_timeout] simulated timeout',
      },
    } as any)
    await livePhotoRepo.upsert({
      ...baseItem,
      id: 'running-with-remote-task',
      imageTaskId: 'remote-image-task',
      autoFlowStatus: {
        enabled: true,
        status: 'running',
        paused: false,
        retryLimit: 2,
        retryCount: 0,
        currentStage: 'image_generation',
      },
    } as any)
    await livePhotoRepo.upsert({
      ...baseItem,
      id: 'exhausted-with-remote-task',
      packagingStatus: 'failed',
      imageTaskId: 'exhausted-remote-image-task',
      autoFlowStatus: {
        enabled: true,
        status: 'failed_terminal',
        paused: true,
        retryLimit: 2,
        retryCount: 2,
        currentStage: 'image_validation',
        lastError: '[image_validation_failed] simulated rejection',
      },
    } as any)

    const resumed = await livePhotoService.resumePendingTasksOnStartup()
    assert.equal(resumed.resumableCount, 1)
    assert.deepEqual(resumed.itemIds, ['running-with-remote-task'])
    assert.equal(resumed.itemIds.includes('exhausted-with-remote-task'), false)

    console.log('live photo startup resume filter smoke test passed')
  } finally {
    await livePhotoService.resetTestDependencies()
    livePhotoSqliteModule.closeLivePhotoSqlite?.()
    cloneSqliteModule.closeCloneSqlite?.()
    delete process.env.VIDEOGENERATE_DATA_DIR
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
