import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-product-image-provider-routing-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  try {
    const { cloneRepo } = await import('../src/main/modules/clone/repo')
    const { productImageMaterialsRepo } = await import('../src/main/modules/product-image-materials/repo')
    const { productImageMaterialsService } = await import('../src/main/modules/product-image-materials/service')

    await cloneRepo.setCredentials({
      imageProviderPrimary: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiImageModel: 'gpt-image-1',
    } as any)

    const fixtureDir = path.join(root, 'fixtures')
    await mkdir(fixtureDir, { recursive: true })
    const sourceImage = path.join(fixtureDir, 'source.jpg')
    await writeFile(sourceImage, 'mock-source-image', 'utf-8')

    await productImageMaterialsRepo.upsertMaterial({
      id: 'mat-provider-route',
      userId: 'desktop-local',
      batchId: 'batch-provider-route',
      category: 'ring',
      sourceVideoPath: 'D:/video.mp4',
      sourceVideoName: 'video.mp4',
      segmentIndex: 0,
      segmentPath: '',
      frameTimeSec: 1.2,
      localImagePath: sourceImage,
      qiniuUrl: 'https://example.com/source.jpg',
      usageStatus: 'unused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    let captured: { provider?: string; model?: string; imagePaths?: string[] } | null = null

    productImageMaterialsService.setTestDependencies({
      toPublicUrlViaQiniu: async (_credentials: unknown, filePath: string) => `https://example.com/${path.basename(filePath)}` as any,
      generateVariantImage: async (input: { credentials: any; imagePaths: string[]; outDir: string; filePrefix: string }) => {
        captured = {
          provider: String(input.credentials.imageProviderPrimary || ''),
          model: String(input.credentials.openaiImageModel || ''),
          imagePaths: [...input.imagePaths],
        }
        const outputPath = path.join(input.outDir, `${input.filePrefix}.png`)
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, 'mock-variant', 'utf-8')
        return outputPath
      },
    })

    const result = await productImageMaterialsService.createBackgroundVariants({
      userId: 'desktop-local',
      materialIds: ['mat-provider-route'],
      variantCount: 1,
    })

    assert.equal(result.count, 1)
    assert.equal(captured?.provider, 'openai')
    assert.equal(captured?.model, 'gpt-image-1')
    assert.deepEqual(captured?.imagePaths, [sourceImage])

    console.log('product image materials provider routing smoke test passed')
  } finally {
    const { productImageMaterialsService } = await import('../src/main/modules/product-image-materials/service')
    const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
    productImageMaterialsService.resetTestDependencies()
    closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
