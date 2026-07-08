import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-product-image-materials-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  try {
    const { productImageMaterialsRepo } = await import('../src/main/modules/product-image-materials/repo')
    const { productImageMaterialsService, __productImageMaterialsTestUtils } = await import('../src/main/modules/product-image-materials/service')
    const { productsRepo } = await import('../src/main/modules/products/repo')
    const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')

    async function waitForBatchDone(batchId: string, timeoutMs = 5000) {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        const batch = await productImageMaterialsRepo.getBatch('desktop-local', batchId)
        if (!batch) throw new Error('Batch disappeared during test')
        if (batch.status === 'completed' || batch.status === 'partial_failed' || batch.status === 'failed') {
          return batch
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out waiting for batch ${batchId}`)
    }

    const product = await productsRepo.upsert({
      name: 'Ring Product',
      type: 'ring',
    } as any)

    assert.equal(__productImageMaterialsTestUtils.inferCategoryFromProductType('ring'), 'ring')
    assert.equal(
      __productImageMaterialsTestUtils.computeFrameTimeSec({ startSec: 0, endSec: 3, durationSec: 3 }),
      1.5,
    )
    assert.equal(
      __productImageMaterialsTestUtils.computeFrameTimeSec({ startSec: 0, endSec: 0.4, durationSec: 0.4 }),
      null,
    )

    const fixtureDir = path.join(root, 'fixtures')
    await mkdir(fixtureDir, { recursive: true })
    const sourceVideoPath = path.join(fixtureDir, 'source.mp4')
    await writeFile(sourceVideoPath, 'mock-source-video', 'utf-8')

    productImageMaterialsService.setTestDependencies({
      detectVideoSegments: async () => [
        { startSec: 0, endSec: 3, durationSec: 3 },
        { startSec: 3, endSec: 3.4, durationSec: 0.4 },
      ],
      probeMedia: async () => ({
        durationSec: 3.4,
        hasAudio: false,
      } as any),
      runFfmpeg: async (input: { args: string[] }) => {
        const outPath = String(input.args[input.args.length - 1] || '').trim()
        await mkdir(path.dirname(outPath), { recursive: true })
        await writeFile(outPath, `mock-frame:${path.basename(outPath)}`, 'utf-8')
      },
      generateThumbnailJpg: async (input: { filePath: string }) => {
        const thumbnailPath = `${input.filePath}.thumb.jpg`
        await writeFile(thumbnailPath, 'mock-thumb', 'utf-8')
        return thumbnailPath
      },
      toPublicUrlViaQiniu: async (_credentials: unknown, filePath: string) => `https://example.com/${path.basename(filePath)}` as any,
    })

    const createdBatch = await productImageMaterialsService.createBatch({
      userId: 'desktop-local',
      category: 'ring',
      sourceVideoPaths: [sourceVideoPath],
    })
    const finishedBatch = await waitForBatchDone(createdBatch.id)
    assert.equal(finishedBatch.status, 'completed')
    assert.equal(finishedBatch.generatedImageCount, 1)
    assert.equal(finishedBatch.sourceItems[0]?.generatedCount, 1)
    assert.equal(finishedBatch.sourceItems[0]?.skippedCount, 1)

    const createdMaterials = await productImageMaterialsRepo.listMaterials('desktop-local', { category: 'ring' })
    assert.ok(createdMaterials.some((item) => existsSync(item.localImagePath)))

    await productImageMaterialsRepo.upsertMaterial({
      id: 'mat-1',
      userId: 'desktop-local',
      batchId: 'batch-1',
      category: 'ring',
      sourceVideoPath: 'D:/video-1.mp4',
      sourceVideoName: 'video-1.mp4',
      segmentIndex: 0,
      segmentPath: 'D:/segments/part_001.mp4',
      frameTimeSec: 1.5,
      localImagePath: 'D:/frames/frame-1.jpg',
      qiniuUrl: 'https://example.com/frame-1.jpg',
      usageStatus: 'unused',
      boundProductId: product.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await productImageMaterialsRepo.upsertMaterial({
      id: 'mat-2',
      userId: 'desktop-local',
      batchId: 'batch-1',
      category: 'ring',
      sourceVideoPath: 'D:/video-2.mp4',
      sourceVideoName: 'video-2.mp4',
      segmentIndex: 1,
      segmentPath: 'D:/segments/part_002.mp4',
      frameTimeSec: 1.2,
      localImagePath: 'D:/frames/frame-2.jpg',
      qiniuUrl: 'https://example.com/frame-2.jpg',
      usageStatus: 'unused',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
    })

    const options = await productImageMaterialsService.listHermesMaterialOptionsForProduct({
      productId: product.id,
      limit: 8,
    })

    assert.equal(options.category, 'ring')
    assert.equal(options.options.length, 3)
    assert.equal(options.options[0]?.id, 'mat-1')
    assert.equal(options.options[0]?.index, 1)

    await productImageMaterialsService.markMaterialUsed('mat-1')
    const updated = await productImageMaterialsRepo.getMaterial('desktop-local', 'mat-1')
    assert.equal(updated?.usageStatus, 'used')

    const frameDeleteA = path.join(fixtureDir, 'delete-a.jpg')
    const frameDeleteB = path.join(fixtureDir, 'delete-b.jpg')
    await writeFile(frameDeleteA, 'delete-a', 'utf-8')
    await writeFile(frameDeleteB, 'delete-b', 'utf-8')

    await productImageMaterialsRepo.upsertMaterial({
      id: 'mat-delete-1',
      userId: 'desktop-local',
      batchId: 'batch-delete',
      category: 'ring',
      sourceVideoPath: 'D:/video-3.mp4',
      sourceVideoName: 'video-3.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 0.8,
      localImagePath: frameDeleteA,
      qiniuUrl: 'https://example.com/delete-a.jpg',
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await productImageMaterialsRepo.upsertMaterial({
      id: 'mat-delete-2',
      userId: 'desktop-local',
      batchId: 'batch-delete',
      category: 'ring',
      sourceVideoPath: 'D:/video-4.mp4',
      sourceVideoName: 'video-4.mp4',
      segmentIndex: 1,
      segmentPath: '',
      frameTimeSec: 1.1,
      localImagePath: frameDeleteB,
      qiniuUrl: 'https://example.com/delete-b.jpg',
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const deleted = await productImageMaterialsService.deleteMaterials({
      userId: 'desktop-local',
      materialIds: ['mat-delete-1', 'mat-delete-2'],
    })
    assert.equal(deleted.count, 2)
    assert.equal(await productImageMaterialsRepo.getMaterial('desktop-local', 'mat-delete-1'), null)
    assert.equal(await productImageMaterialsRepo.getMaterial('desktop-local', 'mat-delete-2'), null)
    assert.equal(existsSync(frameDeleteA), false)
    assert.equal(existsSync(frameDeleteB), false)

    const frameDeleteAny = path.join(fixtureDir, 'delete-any.jpg')
    await writeFile(frameDeleteAny, 'delete-any', 'utf-8')
    await productImageMaterialsRepo.upsertMaterial({
      id: 'mat-delete-any',
      userId: 'desktop-other',
      batchId: 'batch-delete-any',
      category: 'ring',
      sourceVideoPath: 'D:/video-5.mp4',
      sourceVideoName: 'video-5.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 0.9,
      localImagePath: frameDeleteAny,
      qiniuUrl: 'https://example.com/delete-any.jpg',
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const deletedAny = await productImageMaterialsService.deleteMaterialAny('mat-delete-any')
    assert.equal(deletedAny.ok, true)
    assert.equal(await productImageMaterialsRepo.getMaterialAny('mat-delete-any'), null)
    assert.equal(existsSync(frameDeleteAny), false)

    console.log('product image materials smoke test passed')
    closeCloneSqlite()
  } finally {
    const { productImageMaterialsService } = await import('../src/main/modules/product-image-materials/service')
    const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
    productImageMaterialsService.resetTestDependencies()
    closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
