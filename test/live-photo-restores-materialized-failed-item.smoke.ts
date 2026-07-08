import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-restore-materialized-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const livePhotoSqliteModule = await import('../src/main/modules/live-photo/sqlite')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')

  try {
    const itemId = 'restore-materialized-live-photo'
    const taskRoot = path.join(root, 'plugin-live-photo', itemId)
    await mkdir(taskRoot, { recursive: true })
    await writeFile(path.join(taskRoot, 'live-photo.jpg'), 'image', 'utf-8')
    await writeFile(path.join(taskRoot, 'live-photo.mov'), 'video', 'utf-8')
    await writeFile(path.join(taskRoot, 'preview.mp4'), 'preview', 'utf-8')
    await writeFile(path.join(taskRoot, 'poster.jpg'), 'poster', 'utf-8')
    await writeFile(path.join(taskRoot, 'motion.mp4'), 'motion', 'utf-8')
    await writeFile(path.join(taskRoot, 'still.jpg'), 'still', 'utf-8')
    await writeFile(
      path.join(taskRoot, 'live-photo.json'),
      JSON.stringify({
        itemId,
        type: 'apple_live_photo_manifest',
        image: 'live-photo.jpg',
        video: 'live-photo.mov',
      }),
      'utf-8',
    )

    const createdAt = Date.now()
    await livePhotoRepo.upsert({
      id: itemId,
      sourceType: 'reference_replace',
      packagingStatus: 'failed',
      error: '[retry_limit] Current step timed out while waiting.',
      referenceImagePath: path.join(root, 'reference.jpg'),
      generatedStillPath: path.join(taskRoot, 'still.jpg'),
      workflow: {
        currentStep: 'video_generation',
        stepStatus: {
          queued: { status: 'done', updatedAt: createdAt },
          image_generation: { status: 'done', updatedAt: createdAt },
          video_generation: { status: 'failed', updatedAt: createdAt, error: '[retry_limit] timeout' },
          live_photo_packaging: { status: 'idle', updatedAt: createdAt },
          completed: { status: 'idle', updatedAt: createdAt },
        },
        updatedAt: createdAt,
      },
      autoFlowStatus: {
        enabled: true,
        status: 'failed_terminal',
        paused: false,
        retryLimit: 2,
        retryCount: 2,
        currentStage: 'video_generation',
        lastError: '[retryable_timeout] Current step timed out while waiting.',
      },
      createdAt,
      updatedAt: createdAt,
    } as any)

    const restored = await livePhotoService.get(itemId)
    assert.equal(restored?.packagingStatus, 'failed')

    const resumed = await livePhotoService.resumePendingTasksOnStartup()
    assert.equal(resumed.resumableCount, 0)

    const latest = await livePhotoService.get(itemId)
    assert.equal(latest?.packagingStatus, 'completed')
    assert.equal(latest?.autoFlowStatus?.status, 'done')
    assert.ok(String(latest?.livePhotoVideoPath || '').endsWith('live-photo.mov'))
    assert.ok(String(latest?.previewVideoPath || '').endsWith('preview.mp4'))

    console.log('live photo restores materialized failed item smoke test passed')
  } finally {
    livePhotoSqliteModule.closeLivePhotoSqlite?.()
    cloneSqliteModule.closeCloneSqlite?.()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
