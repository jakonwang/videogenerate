/**
 * Product-spine channel data plus full product costs, so profit and creative runway show up.
 * CLI: VIDEOGENERATE_DATA_DIR=<dir> tsx test/profit-runway.seed.ts
 */
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { seedDay, seedProductSpineChannels, seedProductWithCloneVideo } from './product-spine.seed'

async function main() {
  const dataDir = process.env.VIDEOGENERATE_DATA_DIR
  if (!dataDir) throw new Error('VIDEOGENERATE_DATA_DIR is required')
  configureAppPathRuntime({ dataDir, userDataDir: process.env.VIDEOGENERATE_USER_DATA_DIR || dataDir })
  const now = Date.now()
  const seeded = await seedProductSpineChannels(now)
  const { gmvMaxRepo } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  // A steadily falling main creative, so the runway (days left) is predictable.
  for (const [offset, roi] of [[8, 1.0], [7, 1.0], [6, 3.4], [5, 3.0], [4, 2.6], [3, 2.2]] as const) {
    gmvMaxRepo.saveCreativeMetric({
      id: `cr-b:TT-1001:${seedDay(offset, now)}`, campaignId: 'camp-1', storeId: 'store-1', creativeId: 'cr-b', itemGroupId: 'TT-1001', creativeName: '开箱展示',
      source: 'video', statDate: seedDay(offset, now), cost: '100', grossRevenue: String(roi * 100), roi: String(roi), orders: '5', cpa: '0', ctr: '0', playDepth: '0', raw: {}, syncedAt: now,
    } as any)
  }
  // Full unit costs: margin ≈ 51.5% → break-even ROI ≈ 1.94
  gmvMaxRepo.saveProductCost({
    id: 'store-1:TT-1001', storeId: 'store-1', productId: 'TT-1001', productName: 'Pearl Earrings', sellingPrice: '20',
    purchaseCost: '4', firstMileCost: '0.5', lastMileCost: '1', warehousingCost: '0.5', platformCommissionRate: '0.06', creatorCommissionRate: '0.1', expectedReturnRate: '0.05', returnLossRate: '0.5',
    updatedAt: now,
  } as any)
  seeded.close()
  const content = await seedProductWithCloneVideo(dataDir)
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const product = (await productsRepo.list()).find((item) => item.id === content.productId)!
  await productsRepo.upsert({ id: product.id, name: product.name, type: product.type, tiktokProductIds: ['TT-1001'] })
  console.log(`SEED_RESULT ${JSON.stringify(content)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
