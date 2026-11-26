import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { buildLaunchCopyPrompt, findBannedWords, launchCostEstimate, launchSummary, nextStage, normalizeLaunchOptions, parseLaunchCopy, videoReferenceImages } from '../src/shared/productLaunch'

async function main() {
  // ---- 纯函数
  assert.deepEqual(normalizeLaunchOptions({ videoCount: 99, titleCount: 0 }), { images: true, copy: true, videos: true, videoCount: 5, titleCount: 1, videoEngine: 'creative' })
  assert.deepEqual(launchSummary({ itemCount: 2, markets: 2, options: normalizeLaunchOptions({ titleCount: 2, videoCount: 3 }) }), { products: 2, images: 10, details: 4, titles: 8, videos: 6 })
  assert.deepEqual(parseLaunchCopy('```json\n{"titles":["A  b","C","D"],"description":"• x"}\n```', 2), { titles: ['A b', 'C'], description: '• x' })
  assert.throws(() => parseLaunchCopy('sorry', 2), /格式/)
  assert.match(buildLaunchCopyPrompt({ market: 'TH', productName: '包', category: 'bag', titleCount: 2 }), /Thai \(th-TH\)/)
  assert.deepEqual(videoReferenceImages({ images: ['a', 'b', 'a', 'c'], sourceImagePath: 's' }, 2), ['a', 'b'])
  assert.deepEqual(videoReferenceImages({ images: ['a', 'b'], sourceImagePath: 's' }, 5), ['a', 'b', 'a', 'b', 'a'])
  assert.deepEqual(videoReferenceImages({ images: [], sourceImagePath: 's' }, 3), ['s', 's', 's'])
  assert.deepEqual(videoReferenceImages({ images: [], sourceImagePath: '' }, 3), [])
  assert.deepEqual(findBannedWords('Túi xách TỐT NHẤT, cam kết 100% chính hãng', 'VN'), ['100%', 'tốt nhất', 'cam kết 100%'])
  assert.deepEqual(findBannedWords('bestow a bestseller', 'US'), [])
  assert.deepEqual(findBannedWords('กระเป๋าดีที่สุด', 'TH'), ['ดีที่สุด'])
  assert.deepEqual(launchCostEstimate({ products: 2, options: normalizeLaunchOptions({ videoCount: 3 }), imagePoints: [2, 4] }), { imageCalls: 18, videoCalls: 0, min: 36, max: 72 })
  assert.deepEqual(launchCostEstimate({ products: 1, options: normalizeLaunchOptions({ images: false, videos: false }), imagePoints: [] }), { imageCalls: 0, videoCalls: 0, min: null, max: null })

  // ---- 流水线
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-product-launch-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { productLaunchService, setProductLaunchTestDependencies } = await import('../src/main/modules/product-launch/service')
    const white = path.join(root, '托特包.png')
    await writeFile(white, Buffer.from('89504e470d0a1a0a', 'hex'))

    const products: any[] = []
    const chats: string[] = []
    let chatFails = true
    let shotStatus = 'running'
    let inboxSyncs = 0
    const videoRequests: string[][] = []
    const videoSuffixes: string[][] = []
    const chatReplies: string[] = []
    const livePhotoCalls: any[] = []
    const livePhotoState: Record<string, any> = {}
    setProductLaunchTestDependencies({
      credentials: async () => ({}),
      chat: (async (input: any) => {
        chats.push(input.prompt)
        if (chatFails) throw new Error('AI 服务繁忙')
        return { content: chatReplies.shift() ?? '{"titles":["T1","T2"],"description":"• d"}' }
      }) as any,
      products: {
        list: async () => products,
        upsert: async (payload: any) => {
          const saved = { ...payload, id: payload.id || `p${products.length + 1}` }
          products.push(saved)
          return saved
        },
      } as any,
      listing: {
        createOrUpdate: async (payload: any) => ({ ...payload, id: 'listing-1' }),
        generate: async () => ({ generationStatus: 'done', listingImages: [1, 2, 3, 4, 5].map((n) => ({ filePath: path.join(root, `l${n}.png`) })) }),
      } as any,
      creative: {
        listAccounts: async () => ({ encryptionAvailable: true, accounts: [{ enabled: true, state: 'ready' }] }),
        createFromReference: async (input: any) => (videoRequests.push(input.referenceImagePaths), videoSuffixes.push(input.shotPromptSuffixes), { id: 'task-1', shots: input.referenceImagePaths.map((_: string, i: number) => ({ shotId: `s${i}` })) }),
        getTask: async () => ({ id: 'task-1', shots: [0, 1].map((i) => ({ shotId: `s${i}`, status: i === 0 ? 'completed' : shotStatus, resultVideoPath: `v${i}.mp4`, lastError: 'boom' })) }),
      } as any,
      livePhoto: {
        createFromReference: async (input: any) => {
          const id = `lp${livePhotoCalls.length + 1}`
          livePhotoCalls.push({ id, ...input })
          return { id }
        },
        get: async (id: string) => livePhotoState[id] ?? null,
      } as any,
      syncInbox: async () => {
        inboxSyncs += 1
      },
    })

    await assert.rejects(productLaunchService.create({ markets: [], options: {}, items: [{ source: 'upload', imagePath: white }] }), /国家/)

    const job = await productLaunchService.create({ markets: ['VN', 'TH'], options: { videoCount: 2, titleCount: 2 }, items: [{ source: 'upload', imagePath: white, price: '199000' }] })
    assert.equal(job.items[0].productName, '托特包')
    await productLaunchService.idle()

    // 文案失败：停在 copy，前面两步已完成，视频没开始
    let current = (await productLaunchService.get(job.id))!
    let item = current.items[0]
    assert.equal(item.stages.product.status, 'done')
    assert.equal(item.productId, 'p1')
    assert.equal(item.stages.images.status, 'done')
    assert.equal(item.images.length, 5)
    assert.equal(item.stages.copy.status, 'failed')
    assert.match(item.stages.copy.error || '', /繁忙/)
    assert.equal(item.stages.videos.status, 'pending')
    assert.equal(current.status, 'failed')
    assert.equal(nextStage(item), null)

    // 只重跑文案：图不重出，两个国家各写一份，然后进视频
    chatFails = false
    chats.length = 0
    await productLaunchService.retry({ jobId: job.id, itemId: item.id, stage: 'copy' })
    await productLaunchService.idle()
    current = (await productLaunchService.get(job.id))!
    item = current.items[0]
    assert.equal(chats.length, 2)
    assert.match(chats[0], /Vietnamese/)
    assert.deepEqual(item.copy.TH, { titles: ['T1', 'T2'], description: '• d', flags: [] })
    assert.equal(item.videos[0].style, 'hero')
    assert.equal(item.videos[1].style, 'detail')
    assert.match(videoSuffixes[0][1], /close-up/)
    assert.equal(item.stages.videos.status, 'running')
    assert.equal(item.creativeTaskId, 'task-1')
    assert.equal(item.videos.length, 2)

    // 视频一条出了一条还在做：继续等
    await productLaunchService.pollNow()
    item = (await productLaunchService.get(job.id))!.items[0]
    assert.equal(item.stages.videos.status, 'running')
    assert.equal(item.stages.videos.done, 1)

    // 第二条失败：有一条成功就算完成，进审核收件箱
    shotStatus = 'failed'
    await productLaunchService.pollNow()
    await productLaunchService.idle()
    current = (await productLaunchService.get(job.id))!
    item = current.items[0]
    assert.equal(item.stages.videos.status, 'done')
    assert.equal(item.videos[0].path, 'v0.mp4')
    assert.equal(item.videos[1].status, 'failed')
    assert.equal(item.stages.review.status, 'done')
    assert.equal(inboxSyncs, 1)
    assert.equal(current.status, 'review')

    // 商品库来源 + 只要文案：跳过出图和视频
    const second = await productLaunchService.create({ markets: ['US'], options: { images: false, videos: false }, items: [{ source: 'library', productId: 'p1' }] })
    await productLaunchService.idle()
    const secondItem = (await productLaunchService.get(second.id))!.items[0]
    assert.equal(secondItem.stages.images.status, 'skipped')
    assert.equal(secondItem.stages.videos.status, 'skipped')
    assert.equal(secondItem.stages.copy.status, 'done')
    assert.deepEqual(Object.keys(secondItem.copy), ['US'])

    // 不出图只出视频：原图复制成 3 个不同文件，出 3 条（以前只会出 1 条）
    videoRequests.length = 0
    const third = await productLaunchService.create({ markets: [], options: { images: false, copy: false, videoCount: 3 }, items: [{ source: 'upload', imagePath: white }] })
    await productLaunchService.idle()
    const thirdItem = (await productLaunchService.get(third.id))!.items[0]
    assert.equal(thirdItem.stages.videos.status, 'running')
    assert.equal(videoRequests.length, 1)
    const refs = videoRequests[0]
    assert.equal(refs.length, 3)
    assert.equal(new Set(refs).size, 3)
    assert.equal(refs[0], white)
    for (const ref of refs) assert.ok(existsSync(ref), `reference ${ref} exists`)
    assert.equal(thirdItem.videos.length, 3)

    // 违禁词：第一次命中就带着词重写；重写还命中就标出来
    chats.length = 0
    chatReplies.push('{"titles":["Túi tốt nhất số 1"],"description":"• rẻ nhất"}', '{"titles":["Túi vải canvas"],"description":"• bền"}')
    const fourth = await productLaunchService.create({ markets: ['VN'], options: { images: false, videos: false, titleCount: 1 }, items: [{ source: 'upload', imagePath: white }] })
    await productLaunchService.idle()
    let vn = (await productLaunchService.get(fourth.id))!.items[0].copy.VN!
    assert.equal(chats.length, 2)
    assert.match(chats[1], /previous draft.*tốt nhất/)
    assert.deepEqual(vn, { titles: ['Túi vải canvas'], description: '• bền', flags: [] })
    chats.length = 0
    chatReplies.push('{"titles":["Best bag"],"description":"• x"}', '{"titles":["Best tote"],"description":"• x"}')
    const fifth = await productLaunchService.create({ markets: ['US'], options: { images: false, videos: false, titleCount: 1 }, items: [{ source: 'upload', imagePath: white }] })
    await productLaunchService.idle()
    vn = (await productLaunchService.get(fifth.id))!.items[0].copy.US!
    assert.equal(chats.length, 2)
    assert.deepEqual(vn.flags, ['best'])

    // 图生视频：一张图一条，运镜轮流；一条完成一条失败 → 完成，进审核
    const sixth = await productLaunchService.create({ markets: [], options: { images: false, copy: false, videoCount: 2, videoEngine: 'livePhoto' }, items: [{ source: 'upload', imagePath: white }] })
    await productLaunchService.idle()
    let lp = (await productLaunchService.get(sixth.id))!.items[0]
    assert.equal(livePhotoCalls.length, 2)
    assert.deepEqual(livePhotoCalls.map((call) => call.motionTemplate), ['push_in', 'push_out'])
    assert.notEqual(livePhotoCalls[0].referenceImagePaths[0], livePhotoCalls[1].referenceImagePaths[0])
    assert.deepEqual(lp.livePhotoIds, ['lp1', 'lp2'])
    assert.equal(lp.stages.videos.status, 'running')
    livePhotoState.lp1 = { id: 'lp1', packagingStatus: 'completed', motionVideoPath: white }
    livePhotoState.lp2 = { id: 'lp2', packagingStatus: 'processing' }
    await productLaunchService.pollNow()
    lp = (await productLaunchService.get(sixth.id))!.items[0]
    assert.equal(lp.stages.videos.status, 'running')
    livePhotoState.lp2 = { id: 'lp2', packagingStatus: 'failed', error: '视频模型超时' }
    const syncsBefore = inboxSyncs
    await productLaunchService.pollNow()
    await productLaunchService.idle()
    lp = (await productLaunchService.get(sixth.id))!.items[0]
    assert.equal(lp.stages.videos.status, 'done')
    assert.equal(lp.videos[0].path, white)
    assert.equal(lp.videos[0].style, 'push_in')
    assert.equal(lp.videos[1].error, '视频模型超时')
    assert.equal(lp.stages.review.status, 'done')
    assert.ok(inboxSyncs > syncsBefore)
    assert.deepEqual(launchCostEstimate({ products: 1, options: normalizeLaunchOptions({ videoCount: 2, videoEngine: 'livePhoto' }), imagePoints: [2], videoPoints: [10] }), { imageCalls: 8, videoCalls: 2, min: 36, max: 36 })

    assert.equal((await productLaunchService.list()).length, 6)

    // 服务器引擎：只开放图生视频；成片「进审核」换成引擎同步
    const { configureProductLaunch } = await import('../src/main/modules/product-launch/service')
    assert.deepEqual((await productLaunchService.info()).videoEngines, ['creative', 'livePhoto'])
    let engineSyncs = 0
    configureProductLaunch({ videoEngines: ['livePhoto'], syncInbox: async () => { engineSyncs += 1 } })
    assert.deepEqual((await productLaunchService.info()).videoEngines, ['livePhoto'])
    await assert.rejects(productLaunchService.create({ markets: [], options: { images: false, copy: false }, items: [{ source: 'upload', imagePath: white }] }), /tk创意室/)
    livePhotoState.lp3 = { id: 'lp3', packagingStatus: 'completed', motionVideoPath: white }
    const onServer = await productLaunchService.create({ markets: [], options: { images: false, copy: false, videoCount: 1, videoEngine: 'livePhoto' }, items: [{ source: 'upload', imagePath: white }] })
    await productLaunchService.idle()
    await productLaunchService.pollNow()
    await productLaunchService.idle()
    assert.equal((await productLaunchService.get(onServer.id))!.status, 'review')
    assert.equal(engineSyncs, 1)
    assert.equal(await productLaunchService.busy(), false)

    // 网页的一键上新调用总是交给服务器引擎
    const { routesToCloneEngine } = await import('../services/cloud/src/cloneEngine')
    const fakeEngine = { ownsPath: () => false } as any
    assert.equal(routesToCloneEngine(fakeEngine, 'u1', { ns: 'productLaunch', method: 'create', args: [] }), true)
    assert.equal(routesToCloneEngine(fakeEngine, 'u1', { ns: 'tiktokCreative', method: 'list', args: [] }), false)
    console.log('product-launch smoke ok')
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
