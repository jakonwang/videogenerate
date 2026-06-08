import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-tiktok-listing-'))
  process.env.VIDEOGEN_DATA_DIR = root

  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const qiniuModule = await import('../src/main/modules/clone/qiniu')
  const { tiktokListingRepo } = await import('../src/main/modules/tiktok-listing/repo')
  const { __setTiktokListingGenerationDepsForTest, tiktokListingService } = await import('../src/main/modules/tiktok-listing/service')

  const originalGetCredentials = cloneRepoModule.cloneRepo.getCredentials
  const originalToPublicUrlViaQiniu = qiniuModule.toPublicUrlViaQiniu
  const originalFetch = globalThis.fetch

  let titleCalls = 0
  let failTitleAttempts = 2
  let failAnalysisBoardAttempts = 0
  let failImageAttempts = 0
  const analysisBoardRequests: Array<{ referenceImagePaths: string[] }> = []
  const imageRequests: Array<{ prompt: string; imagePaths: string[]; filePrefix: string; outputSize: string }> = []

  cloneRepoModule.cloneRepo.getCredentials = async () =>
    ({
      allowMockWhenNoKey: true,
      imageProviderPrimary: 'openai',
      chatProviderPrimary: 'grsai',
      apifoxHubProfile: 'vectorengine',
      imageApifoxHubProfile: 'vectorengine',
      chatApifoxHubProfile: 'vectorengine',
      grsaiApiKey: 'grs-key',
      grsaiAnalysisModel: 'grs-chat',
      grsaiHost: 'https://grsai.example.com',
      apifoxHub: {
        enabled: true,
        baseUrl: 'https://vector.example.com',
        apiKey: '',
        chatProvider: 'openai',
        chatModel: 'vector-chat',
        chatEndpointStyle: 'openai_chat',
        imageProvider: 'openai',
        imageModel: 'vector-image',
        imageEditModel: 'vector-image-edit',
        imageEndpointStyle: 'openai_images',
        videoProvider: 'veo',
        textToVideoModel: 'veo_3_1-lite',
        imageToVideoModel: 'veo_3_1-lite',
        startEndVideoModel: 'veo_3_1-lite',
        referenceVideoModel: 'veo_3_1-lite',
        videoEndpointStyle: 'official_rest',
      },
      qiniuUploadHost: 'https://upload.qiniup.com',
      qiniuPrefix: 'videogenerate/test',
      openaiImageModel: 'gpt-image-2',
      openaiApiKey: '',
      klingHost: 'https://api.atlascloud.ai',
      seedanceHost: 'https://ark.ap-southeast.bytepluses.com',
    } as any)

  ;(qiniuModule as any).toPublicUrlViaQiniu = async (_credentials: unknown, filePath: string) =>
    `https://example.com/${path.basename(filePath)}`

  __setTiktokListingGenerationDepsForTest({
    generateTitle: async () => {
      titleCalls += 1
      if (failTitleAttempts > 0) {
        failTitleAttempts -= 1
        throw new Error(`title transient failure ${titleCalls}`)
      }
      return '高级感百搭耳环 SKU-001'
    },
    generateAnalysisBoard: async (input) => {
      if (failAnalysisBoardAttempts > 0) {
        failAnalysisBoardAttempts -= 1
        throw new Error(`analysis board transient failure ${failAnalysisBoardAttempts}`)
      }
      analysisBoardRequests.push({
        referenceImagePaths: Array.isArray((input as any).referenceImagePaths) ? [...((input as any).referenceImagePaths as string[])] : [input.sourceImagePath],
      })
      return {
        id: 'analysis-board-1',
        filePath: path.join(root, 'mock-images', input.itemId, 'listing_analysis_board.png'),
        fileName: 'listing_analysis_board.png',
        createdAt: Date.now(),
      }
    },
    generateImages: async (input) => {
      if (failImageAttempts > 0) {
        failImageAttempts -= 1
        throw new Error(`image transient failure ${failImageAttempts}`)
      }
      const analysisBoardPath = path.join(root, 'mock-images', input.itemId, 'listing_analysis_board.png')
      const heroPath = path.join(root, 'mock-images', input.itemId, 'listing_1.png')
      return Array.from({ length: 5 }, (_, index) => {
        const filePath = path.join(root, 'mock-images', input.itemId, `listing_${index + 1}.png`)
        imageRequests.push({
          prompt: input.buildImagePrompt({
            category: input.category,
            index,
            sku: input.sku,
            anchorMode: index === 0 ? 'source_only' : 'source_plus_hero',
          }),
          imagePaths:
            index === 0
              ? [input.sourceImagePath, analysisBoardPath, ...((input.referenceImagePaths || []).filter((entry) => entry !== input.sourceImagePath))]
              : [input.sourceImagePath, analysisBoardPath, heroPath, ...((input.referenceImagePaths || []).filter((entry) => entry !== input.sourceImagePath))],
          filePrefix: `listing_${index + 1}`,
          outputSize: '1024x1024',
        })
        return {
          id: `generated-${index + 1}`,
          filePath,
          fileName: `listing_${index + 1}.png`,
          createdAt: Date.now(),
        }
      })
    },
    ensurePublicUrl: async (_credentials, filePath) => `https://example.com/${path.basename(filePath)}`,
  })

  try {
    const created = await tiktokListingRepo.createOrUpdate({
      sourceImagePath: 'C:/demo/source.jpg',
      referenceImagePaths: ['C:/demo/source.jpg', 'C:/demo/detail-back.jpg', 'C:/demo/detail-side.jpg'],
      category: 'earring',
      sku: 'SKU-001',
      localDisplayPrice: '19.99',
      titleLanguage: 'zh-CN',
    })

    await assert.rejects(() => tiktokListingService.exportExcel({ ids: [created.id] }), /标题未生成|商品图不足 5 张/)

    const generated = await tiktokListingService.generate({ id: created.id })
    assert.equal(generated.generationStatus, 'done')
    assert.match(String(generated.generatedTitle || ''), /SKU-001/)
    assert.match(String(generated.analysisBoardImage?.publicUrl || ''), /listing_analysis_board\.png/)
    assert.equal(generated.listingImages.length, 5)
    assert.equal(titleCalls, 3)
    assert.match(String(generated.generatedDescription || ''), /<img src="https:\/\/example\.com\/listing_1\.png" \/>/)
    assert.equal(imageRequests.length, 5)
    assert.deepEqual(analysisBoardRequests[0]?.referenceImagePaths, ['C:/demo/source.jpg', 'C:/demo/detail-back.jpg', 'C:/demo/detail-side.jpg'])
    assert.deepEqual(imageRequests[0]?.imagePaths, [
      'C:/demo/source.jpg',
      generated.analysisBoardImage?.filePath || '',
      'C:/demo/detail-back.jpg',
      'C:/demo/detail-side.jpg',
    ])
    assert.deepEqual(imageRequests[1]?.imagePaths, [
      'C:/demo/source.jpg',
      generated.analysisBoardImage?.filePath || '',
      generated.listingImages[0]?.filePath || '',
      'C:/demo/detail-back.jpg',
      'C:/demo/detail-side.jpg',
    ])
    assert.deepEqual(imageRequests[4]?.imagePaths, [
      'C:/demo/source.jpg',
      generated.analysisBoardImage?.filePath || '',
      generated.listingImages[0]?.filePath || '',
      'C:/demo/detail-back.jpg',
      'C:/demo/detail-side.jpg',
    ])
    assert.equal(imageRequests[0]?.outputSize, '1024x1024')
    assert.match(String(imageRequests[1]?.prompt || ''), /Reference image 2 is the approved hero result/i)

    failTitleAttempts = 3
    const failedTitle = await tiktokListingService.generate({ id: created.id })
    assert.equal(failedTitle.generationStatus, 'failed')
    assert.match(String(failedTitle.generationError || ''), /^title:/)

    failTitleAttempts = 0
    failAnalysisBoardAttempts = 3
    const failedAnalysisBoard = await tiktokListingService.generate({ id: created.id })
    assert.equal(failedAnalysisBoard.generationStatus, 'failed')
    assert.match(String(failedAnalysisBoard.generationError || ''), /^analysis-board:/)

    failAnalysisBoardAttempts = 0
    failImageAttempts = 3
    imageRequests.length = 0
    const failedImage = await tiktokListingService.generate({ id: created.id })
    assert.equal(failedImage.generationStatus, 'failed')
    assert.match(String(failedImage.generationError || ''), /^images:/)

    failTitleAttempts = 0
    failAnalysisBoardAttempts = 0
    failImageAttempts = 0
    imageRequests.length = 0
    const regenerated = await tiktokListingService.generate({ id: created.id })
    assert.equal(regenerated.generationStatus, 'done')
    assert.equal(regenerated.listingImages.length, 5)
    assert.deepEqual(
      imageRequests[1]?.imagePaths,
      [
        'C:/demo/source.jpg',
        regenerated.analysisBoardImage?.filePath || '',
        regenerated.listingImages[0]?.filePath || '',
        'C:/demo/detail-back.jpg',
        'C:/demo/detail-side.jpg',
      ],
    )

    const second = await tiktokListingRepo.createOrUpdate({
      sourceImagePath: 'C:/demo/source-2.jpg',
      category: 'ring',
      sku: 'SKU-002',
      localDisplayPrice: '29.99',
      titleLanguage: 'zh-CN',
      generatedTitle: '轻奢戒指 SKU-002',
      generatedDescription: '<img src="https://example.com/sku-002-1.jpg" />',
      listingImages: Array.from({ length: 5 }, (_, index) => ({
        id: `sku-002-${index + 1}`,
        filePath: `C:/demo/sku-002-${index + 1}.jpg`,
        fileName: `sku-002-${index + 1}.jpg`,
        publicUrl: `https://example.com/sku-002-${index + 1}.jpg`,
        createdAt: Date.now(),
      })),
      generationStatus: 'done',
    })

    const exported = await tiktokListingService.exportExcel({ ids: [regenerated.id, second.id] })
    assert.equal(exported.total, 2)
    assert.match(exported.filePath, /\.xlsx$/)

    console.log('tiktok listing plugin smoke test passed')
  } finally {
    __setTiktokListingGenerationDepsForTest(null)
    cloneRepoModule.cloneRepo.getCredentials = originalGetCredentials
    ;(qiniuModule as any).toPublicUrlViaQiniu = originalToPublicUrlViaQiniu
    globalThis.fetch = originalFetch
    delete process.env.VIDEOGEN_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
