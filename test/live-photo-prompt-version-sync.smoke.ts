import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import type { LivePhotoItem } from '../src/main/modules/live-photo/types'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-prompt-sync-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const scenePath = path.join(root, 'scene.png')
  const productPath = path.join(root, 'product.png')
  await Promise.all([
    writeFile(scenePath, 'scene', 'utf8'),
    writeFile(productPath, 'product', 'utf8'),
  ])

  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  const livePhotoSqlite = await import('../src/main/modules/live-photo/sqlite')
  const cloneSqlite = await import('../src/main/modules/clone/sqlite')

  try {
    const [active] = await livePhotoService.listPromptVersions()
    assert.ok(active?.active)

    const baseItem: LivePhotoItem = {
      id: 'pending-item',
      sourceType: 'reference_replace',
      productSnapshot: {
        id: 'product-1',
        name: 'Product One',
        type: 'general',
        authoritativeProductReferencePath: productPath,
        imagePaths: [productPath],
      },
      referenceImagePath: scenePath,
      packagingStatus: 'failed',
      imagePromptPreview: {
        prompt: 'OLD_PROMPT',
        referenceImagePaths: [scenePath, productPath],
      },
      promptVersionId: active.id,
      promptVersion: active.version,
      promptHash: active.promptHash,
      cacheKey: 'old-cache-key',
      cacheHit: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await livePhotoRepo.upsert(baseItem)
    await livePhotoRepo.upsert({
      ...baseItem,
      id: 'completed-item',
      packagingStatus: 'completed',
    })

    const updated = await livePhotoService.updatePromptVersion({
      id: active.id,
      name: active.name,
      prompt: 'SYNC_PROMPT_MARKER',
    })
    const pending = await livePhotoRepo.get(baseItem.id)
    const completed = await livePhotoRepo.get('completed-item')

    assert.equal(updated.active, true)
    assert.equal(pending?.promptHash, updated.promptHash)
    assert.equal(pending?.promptVersionId, updated.id)
    assert.match(String(pending?.imagePromptPreview?.prompt || ''), /SYNC_PROMPT_MARKER/)
    assert.equal(pending?.cacheKey, undefined)
    assert.equal(pending?.cacheHit, false)
    assert.equal(completed?.promptHash, active.promptHash)
    assert.equal(completed?.imagePromptPreview?.prompt, 'OLD_PROMPT')

    console.log('live photo prompt version sync smoke test passed')
  } finally {
    livePhotoSqlite.closeLivePhotoSqlite()
    cloneSqlite.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
