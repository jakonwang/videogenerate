import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { seedDay, seedProductSpineChannels } from './product-spine.seed'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-product-spine-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { productSpine, buildSignals, summarizeAds, setProductSpineTestDependencies } = await import('../src/main/modules/content-hub/productSpine')
  const publishTasks: Array<{ productId?: string; productTitle?: string; localProductId?: string }> = []
  setProductSpineTestDependencies({ listPublishTasks: async () => publishTasks })

  const now = Date.now()
  let seeded: { close(): void } | null = null
  try {
    const product = await productsRepo.upsert({ name: '珍珠耳环', type: 'earring' })
    const other = await productsRepo.upsert({ name: '项链', type: 'necklace' })

    // 1. A product with no channel data and no binding stays quiet.
    let spine = await productSpine.build(product.id, now)
    assert.deepEqual(spine.tiktokProductIds, [])
    assert.equal(spine.ads, null)
    assert.equal(spine.creators, null)
    assert.deepEqual(spine.signals, [])

    seeded = await seedProductSpineChannels(now)

    // 2. Channel data exists but nothing is bound: the only advice is to bind.
    spine = await productSpine.build(product.id, now)
    assert.deepEqual(spine.signals.map((item) => item.key), ['bind_channel'])
    assert.ok(spine.channelProducts.some((item) => item.id === 'TT-1001' && item.sources.includes('ads') && item.sources.includes('creators')))

    // 3. A publish task for this product infers the binding without the user doing anything.
    publishTasks.push({ productId: 'TT-1001', productTitle: 'Pearl Earrings', localProductId: product.id })
    spine = await productSpine.build(product.id, now)
    assert.deepEqual(spine.inferredIds, ['TT-1001'])
    assert.deepEqual(spine.boundIds, [])
    assert.ok(spine.ads, 'ads attach through the inferred id')

    // 4. Explicit binding persists on the product and survives other product edits.
    assert.deepEqual(await productSpine.link({ productId: product.id, tiktokProductIds: ['TT-1001', ' TT-1001 ', ''] }), ['TT-1001'])
    await productsRepo.upsert({ id: product.id, name: '珍珠耳环 2', type: 'earring' })
    spine = await productSpine.build(product.id, now)
    assert.deepEqual(spine.boundIds, ['TT-1001'])
    assert.deepEqual(spine.inferredIds, [])
    await assert.rejects(() => productSpine.link({ productId: 'missing', tiktokProductIds: [] }), /PRODUCT_NOT_FOUND/)

    // 5. Ads are scoped to the bound product only, and aggregated per creative.
    const ads = spine.ads!
    assert.equal(ads.spend, 740)
    assert.equal(ads.revenue, 1880)
    assert.equal(ads.orders, 38)
    assert.equal(ads.creativeCount, 2)
    assert.equal(ads.campaignCount, 1)
    assert.equal(ads.topCreatives[0].creativeId, 'cr-b')
    assert.equal(ads.topCreatives[0].previousRoi, 3)
    assert.equal(ads.topCreatives[0].recentRoi, 1.2)

    // 6. Creators are scoped to the bound product only.
    const creators = spine.creators!
    assert.equal(creators.sampleCount, 2)
    assert.equal(creators.awaitingContentCount, 1)
    assert.equal(creators.pendingSampleCount, 1)
    assert.equal(creators.videoCount, 1)
    assert.equal(creators.gmv, 420)

    // 7. Ad and creator data turn into content directives.
    const keys = spine.signals.map((item) => item.key)
    for (const key of ['ads_winner', 'ads_fatigue', 'ads_concentration', 'ads_need_creatives', 'creator_winner', 'creators_awaiting_content']) {
      assert.ok(keys.includes(key as any), `signal ${key}`)
    }
    assert.equal(spine.signals.find((item) => item.key === 'ads_winner')!.params.name, '上耳特写')
    assert.equal(spine.signals.find((item) => item.key === 'ads_fatigue')!.params.name, '开箱展示')

    // 8. Another product stays untouched.
    const otherSpine = await productSpine.build(other.id, now)
    assert.equal(otherSpine.ads, null)
    assert.deepEqual(otherSpine.signals.map((item) => item.key), ['bind_channel'])

    // 9. Pure rules: healthy, diversified spend produces no warnings; below break-even is flagged.
    const healthy = summarizeAds(['a', 'b', 'c', 'd'].flatMap((id) => [5, 1].map((offset) => ({ campaignId: 'c', creativeId: id, statDay: seedDay(offset, now), cost: 50, grossRevenue: 150, orders: 2, creativeName: id }))), now)!
    assert.deepEqual(buildSignals({ tiktokProductIds: ['x'], hasChannelData: true, ads: healthy, creators: null }), [])
    assert.deepEqual(buildSignals({ tiktokProductIds: ['x'], hasChannelData: true, ads: healthy, creators: null, breakEvenRoi: 4 }).map((item) => item.key), ['ads_unprofitable'])
    assert.equal(summarizeAds([], now), null)

    // ---------- sales loop: finished videos ↔ the creatives they became
    const { contentPerformance, buildPerformanceGuidance, verdictFor, proposeContentLinks } = await import('../src/main/modules/content-hub/performance')
    const item = (ref: string, line: string, title: string) => ({ ref, line, projectRef: ref, productId: product.id, title, status: 'ready', route: '/', createdAt: now, updatedAt: now }) as any
    const items = [item('clone:p1', 'clone', '上耳特写复刻'), item('creative:t1:s1', 'creative', '开箱创意 #1'), item('clone:p2', 'clone', '未发布的复刻'), item('livephoto:l1', 'livephoto', '动态照片')]
    const published = [
      { state: 'published', sourceRef: 'clone:p1', videoTitle: '上耳特写 #earrings @shop' },
      { state: 'published', sourceTaskId: 't1', sourceShotId: 's1', description: '开箱展示' },
      { state: 'published', sourceRef: 'livephoto:l1', videoTitle: '完全不相关的标题文案' },
      { state: 'draft', sourceRef: 'clone:p2', videoTitle: '上耳特写' },
    ]
    const perfInput = { items, tiktokProductIds: ['TT-1001'], publishTasks: published, now }

    // 10. Published videos are matched to their creative by caption; drafts and mismatches are not.
    let perf = await contentPerformance.forProduct(perfInput)
    assert.equal(perf.byRef['clone:p1'].creativeId, 'cr-a')
    assert.equal(perf.byRef['clone:p1'].method, 'auto')
    assert.equal(perf.byRef['clone:p1'].verdict, 'winner')
    assert.equal(perf.byRef['clone:p1'].roi, 8)
    assert.equal(perf.byRef['clone:p1'].orders, 8)
    assert.equal(perf.byRef['creative:t1:s1'].creativeId, 'cr-b')
    assert.equal(perf.byRef['creative:t1:s1'].verdict, 'average')
    assert.equal(perf.byRef['clone:p2'], undefined)
    assert.equal(perf.byRef['livephoto:l1'], undefined)
    assert.equal(perf.measuredCount, 2)
    assert.equal(perf.publishedUnlinkedCount, 1)
    assert.deepEqual(perf.unlinkedCreatives, [])
    assert.deepEqual(perf.byLine.map((row) => [row.line, row.measured, row.winners]), [['creative', 1, 0], ['clone', 1, 1]])

    // 11. Sales proof becomes planning guidance.
    const guidance = buildPerformanceGuidance(items, perf)
    assert.match(guidance, /Sales-proven videos/)
    assert.match(guidance, /上耳特写复刻/)
    assert.equal(buildPerformanceGuidance(items, { ...perf, byRef: {} }), '')

    // 12. Unlinking sticks: auto-linking does not bring the match back.
    await contentPerformance.unlink('clone:p1')
    perf = await contentPerformance.forProduct(perfInput)
    assert.equal(perf.byRef['clone:p1'], undefined)
    assert.deepEqual(perf.unlinkedCreatives.map((row) => row.creativeId), ['cr-a'])

    // 13. Manual linking wins, and a creative only ever proves one video.
    await contentPerformance.link({ ref: 'clone:p2', creativeId: 'cr-a', creativeName: '上耳特写' })
    perf = await contentPerformance.forProduct(perfInput)
    assert.equal(perf.byRef['clone:p2'].method, 'manual')
    assert.equal(perf.byRef['clone:p2'].verdict, 'winner')
    await contentPerformance.link({ ref: 'clone:p1', creativeId: 'cr-a' })
    perf = await contentPerformance.forProduct(perfInput)
    assert.equal(perf.byRef['clone:p2'], undefined)
    assert.equal(perf.byRef['clone:p1'].creativeId, 'cr-a')
    await assert.rejects(() => contentPerformance.link({ ref: '', creativeId: 'cr-a' }), /PERFORMANCE_LINK_INVALID/)

    // 14. Pure rules.
    assert.equal(verdictFor({ spend: 0, revenue: 0, orders: 0 }, 2), 'unproven')
    assert.equal(verdictFor({ spend: 100, revenue: 100, orders: 9 }, 2), 'weak')
    assert.equal(verdictFor({ spend: 100, revenue: 400, orders: 2 }, 2), 'average')
    assert.equal(verdictFor({ spend: 100, revenue: 400, orders: 3 }, 2), 'winner')
    assert.deepEqual(proposeContentLinks({ refs: new Set(['clone:p1']), publishTasks: published, creatives: [{ creativeId: 'x', name: '上耳特写' }], linked: {}, locked: ['clone:p1'] }), [])

    // 15. Winner and fatigue signals carry the creative id so the page can point at the local video.
    assert.equal(spine.signals.find((entry) => entry.key === 'ads_winner')!.params.creativeId, 'cr-a')
    assert.equal(spine.signals.find((entry) => entry.key === 'ads_fatigue')!.params.creativeId, 'cr-b')

    console.log('product-spine smoke passed')
  } finally {
    seeded?.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
