import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-material-usage-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const productsRepoModule = await import('../src/main/modules/products/repo')
  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const productImageMaterialsRepoModule = await import('../src/main/modules/product-image-materials/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  async function rmWithRetry(targetPath: string, attempts = 10, delayMs = 200) {
    let lastError: unknown = null
    for (let index = 0; index < attempts; index += 1) {
      try {
        await rm(targetPath, { recursive: true, force: true })
        return
      } catch (error: any) {
        lastError = error
        if (error?.code !== 'EBUSY' && error?.code !== 'ENOTEMPTY') throw error
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    if (lastError) {
      const code = String((lastError as any)?.code || '').trim()
      if (code !== 'EBUSY' && code !== 'ENOTEMPTY') throw lastError
    }
  }

  try {
    await cloneRepoModule.cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
    } as any)

    const fixtureDir = path.join(root, 'fixtures')
    await mkdir(fixtureDir, { recursive: true })
    const productImage = path.join(fixtureDir, 'product.jpg')
    const referenceImage = path.join(fixtureDir, 'reference.jpg')
    await writeFile(productImage, 'product-image', 'utf-8')
    await writeFile(referenceImage, 'reference-image', 'utf-8')

    const product = await productsRepoModule.productsRepo.upsert({
      name: 'Live Photo Material Usage Product',
      type: 'earring',
      images: [
        {
          id: 'img-1',
          productId: 'pending',
          filePath: productImage,
          fileName: 'product.jpg',
          fileSize: 12,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isCover: true,
        },
      ],
      coverImagePath: productImage,
      livePhotoReferenceImagePath: productImage,
      canonicalSourcePath: productImage,
      canonicalSourceStatus: 'done',
    } as any)

    await productImageMaterialsRepoModule.productImageMaterialsRepo.upsertMaterial({
      id: 'mat-live-photo-used',
      userId: 'desktop-local',
      batchId: 'batch-live-photo-used',
      category: 'earring',
      sourceVideoPath: 'D:/video.mp4',
      sourceVideoName: 'video.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1,
      localImagePath: referenceImage,
      qiniuUrl: 'https://example.com/reference.jpg',
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const queued = await livePhotoService.enqueueReferenceItems({
      referenceImagePath: referenceImage,
      productId: product.id,
      motionTemplate: 'push_in',
    })

    assert.ok(queued)
    const updated = await productImageMaterialsRepoModule.productImageMaterialsRepo.getMaterial('desktop-local', 'mat-live-photo-used')
    assert.equal(updated?.usageStatus, 'used')

    console.log('live photo material usage smoke test passed')
  } finally {
    await livePhotoService.resetTestDependencies()
    await rmWithRetry(root)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
