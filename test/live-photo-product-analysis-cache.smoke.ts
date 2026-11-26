import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-analysis-cache-'))
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
      // 已有分析，但 AI 把分类写成了一整句描述（真实数据里就是这样）
      productAnalysis: {
        category: 'pair of silver-toned huggie hoop drop earrings with star-shaped crystal charms',
        summary: 'Silver huggie hoops with a star charm.',
        coreSubject: 'star charm huggie hoop',
        connectionStructure: 'hinged hoop',
        materialDetails: 'silver tone metal',
        wearingPosition: 'earlobe',
        surfaceDetails: 'polished',
        colorDetails: 'silver',
        geometryDetails: 'small round hoop',
        sizeScale: 'small',
        matchingRules: ['keep the star charm'],
        rawDescription: 'Silver huggie hoop earrings with star charms.',
        updatedAt: Date.now(),
      },
    } as any)
    let analysisCalls = 0
    livePhotoService.setTestDependencies({
      analyzeProductStructureWithGrs: (async () => {
        analysisCalls += 1
        return { category: 'earrings', summary: 'x' }
      }) as any,
    })

    // 图生视频不再做商品分析：连建两次任务都不应调用 AI 分析商品（以前每建一次就分析一次，任务要等很久才出现）
    for (let round = 0; round < 2; round += 1) {
      const startedAt = Date.now()
      const queued: any = await livePhotoService.enqueueReferenceItems({ referenceImagePath: referenceImage, productId: product.id, motionTemplate: 'push_in' })
      assert.ok(Date.now() - startedAt < 5000, 'creating a task should be quick')
      // 商品分析也不能进提示词，任务快照里也不带
      const item: any = Array.isArray(queued) ? queued[0] : queued
      assert.equal(item.productSnapshot?.productAnalysis, undefined, 'snapshot carries no product analysis')
      const prompts = [item.imagePromptPreview?.prompt, item.imagePromptPreview?.negativePrompt, item.videoPromptPreview?.prompt, item.videoPromptPreview?.negativePrompt, item.promptPreview?.prompt]
        .map((text) => String(text || ''))
        .join(' | ')
      for (const marker of ['star charm', 'huggie hoop', 'hinged hoop', 'silver tone metal', 'small round hoop']) {
        assert.ok(!prompts.toLowerCase().includes(marker), `prompt must not include product analysis text: ${marker}`)
      }
    }
    assert.equal(analysisCalls, 0, 'live photo must not call product analysis')

    console.log('live photo analysis cache smoke test passed')
  } finally {
    await livePhotoService.resetTestDependencies()
    await rmWithRetry(root)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
