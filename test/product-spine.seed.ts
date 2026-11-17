/**
 * Channel data for one TikTok Shop product (TT-1001) plus an unrelated one (TT-9999).
 * Shared by the product-spine smoke test and the Electron e2e test.
 * CLI: VIDEOGENERATE_DATA_DIR=<dir> tsx test/product-spine.seed.ts
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { configureAppPathRuntime } from '../src/main/lib/paths'

const DAY = 86_400_000

export function seedDay(offset: number, now: number) {
  return new Date(now - offset * DAY).toISOString().slice(0, 10)
}

export async function seedProductSpineChannels(now = Date.now()) {
  const { gmvMaxRepo, closeGmvMaxSqlite } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  const { creatorHubRepo, closeCreatorHubDb } = await import('../src/main/modules/tiktok-creator-hub/repo')

  // Ads: creative A is the winner, creative B takes most of the spend and is fatiguing.
  const metric = (creativeId: string, name: string, offset: number, cost: number, revenue: number, orders: number, productId = 'TT-1001') => gmvMaxRepo.saveCreativeMetric({
    id: `${creativeId}:${productId}:${seedDay(offset, now)}`, campaignId: 'camp-1', storeId: 'store-1', creativeId, itemGroupId: productId, creativeName: name,
    source: 'video', statDate: seedDay(offset, now), cost: String(cost), grossRevenue: String(revenue), roi: String(revenue / cost), orders: String(orders),
    cpa: '0', ctr: '0', playDepth: '0', raw: {}, syncedAt: now,
  } as any)
  for (const offset of [8, 7, 6, 5]) metric('cr-b', '开箱展示', offset, 100, 300, 6)
  for (const offset of [2, 1, 0]) metric('cr-b', '开箱展示', offset, 100, 120, 2)
  for (const offset of [6, 1]) metric('cr-a', '上耳特写', offset, 20, 160, 4)
  metric('cr-x', '别的商品', 1, 500, 100, 1, 'TT-9999')
  gmvMaxRepo.saveProductCost({ id: 'store-1:TT-1001', storeId: 'store-1', productId: 'TT-1001', productName: 'Pearl Earrings', sellingPrice: '19.9', updatedAt: now } as any)

  const sample = (id: string, creator: string, productId: string, stage: string) => ({
    id, shopId: 'shop-1', applyId: id, creatorId: `c-${creator}`, creatorHandle: creator, creatorNickname: creator, followers: 1000,
    productId, productTitle: productId === 'TT-1001' ? 'Pearl Earrings' : 'Other', skuId: 'k1', status: 1, stage, hasSampleOrder: true, createdAt: now, platformOverdue: false, syncedAt: now,
  })
  creatorHubRepo.upsertSamples([
    sample('s1', 'anna', 'TT-1001', 'awaiting_content'),
    sample('s2', 'bella', 'TT-1001', 'pending_review'),
    sample('s3', 'cara', 'TT-9999', 'shipped'),
  ] as any)
  const video = (itemId: string, title: string, creator: string, productId: string, gmv: number, orders: number) => ({
    id: `shop-1:${itemId}`, shopId: 'shop-1', itemId, title, postedAt: now, creatorId: `c-${creator}`, creatorHandle: creator, creatorNickname: creator, followers: 1000,
    productIds: [productId], productTitles: [productId], gmv, orders, itemsSold: orders, views: 9000, likes: 1, comments: 1, shares: 1, refundedGmv: 0, refundedItems: 0,
    commission: 0, gpm: 0, aov: 0, productImpressions: 0, productClicks: 0, window: { start: 0, end: now }, syncedAt: now,
  })
  creatorHubRepo.replaceVideos('shop-1', [
    video('v1', '通勤耳环搭配', 'anna', 'TT-1001', 420, 12),
    video('v2', '无关视频', 'zed', 'TT-9999', 9999, 99),
  ] as any)

  return { close() { closeGmvMaxSqlite(); closeCreatorHubDb() } }
}

/** A library product with one finished clone video, for the e2e test. */
export async function seedProductWithCloneVideo(dataDir: string) {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  const mediaDir = path.join(dataDir, 'seed-media')
  await mkdir(mediaDir, { recursive: true })
  const reference = path.join(mediaDir, 'reference.mp4')
  const output = path.join(mediaDir, 'final.mp4')
  await writeFile(reference, 'seed')
  await writeFile(output, 'seed')
  const product = await productsRepo.upsert({ name: '珍珠耳环 Pearl', type: 'earring' })
  const project = await cloneRepo.createProject({ locale: 'zh-CN' as any, strength: 'medium' as any, referenceVideoPath: reference, referenceVideoName: 'reference.mp4', title: '上耳特写复刻' })
  await cloneRepo.upsertProject({ ...project, productId: product.id, finalCompose: { status: 'done', outputPath: output } } as any)
  closeCloneSqlite()
  return { productId: product.id, cloneRef: `clone:${project.id}` }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dataDir = process.env.VIDEOGENERATE_DATA_DIR
  if (!dataDir) throw new Error('VIDEOGENERATE_DATA_DIR is required')
  configureAppPathRuntime({ dataDir, userDataDir: process.env.VIDEOGENERATE_USER_DATA_DIR || dataDir })
  seedProductSpineChannels().then(async (seeded) => {
    seeded.close()
    const content = await seedProductWithCloneVideo(dataDir)
    console.log(`SEED_RESULT ${JSON.stringify(content)}`)
  }).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
