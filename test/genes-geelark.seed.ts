/**
 * Product with ad creatives + analyzed genes for the gene panel e2e.
 * CLI: VIDEOGENERATE_DATA_DIR=<dir> tsx test/genes-geelark.seed.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { seedDay, seedProductSpineChannels, seedProductWithCloneVideo } from './product-spine.seed'

async function main() {
  const dataDir = process.env.VIDEOGENERATE_DATA_DIR
  if (!dataDir) throw new Error('VIDEOGENERATE_DATA_DIR is required')
  configureAppPathRuntime({ dataDir, userDataDir: process.env.VIDEOGENERATE_USER_DATA_DIR || dataDir })
  const now = Date.now()
  const seeded = await seedProductSpineChannels(now)
  const { gmvMaxRepo } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  const metric = (creativeId: string, name: string, cost: number, revenue: number, orders: number) => gmvMaxRepo.saveCreativeMetric({
    id: `${creativeId}:TT-1001:${seedDay(2, now)}`, campaignId: 'camp-1', storeId: 'store-1', creativeId, itemGroupId: 'TT-1001', creativeName: name,
    source: 'video', statDate: seedDay(2, now), cost: String(cost), grossRevenue: String(revenue), roi: String(revenue / cost), orders: String(orders), cpa: '0', ctr: '0', playDepth: '0', raw: {}, syncedAt: now,
  } as any)
  metric('7300000000000000001', '痛点开头 A', 100, 420, 12)
  metric('7300000000000000002', '痛点开头 B', 80, 300, 9)
  metric('7300000000000000003', '开箱 A', 100, 130, 3)
  metric('7300000000000000004', '开箱 B', 90, 110, 2)
  seeded.close()
  const content = await seedProductWithCloneVideo(dataDir)
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const product = (await productsRepo.list()).find((item) => item.id === content.productId)!
  await productsRepo.upsert({ id: product.id, name: product.name, type: product.type, tiktokProductIds: ['TT-1001'] })
  const genes = (hook: string, pace: string, subtitle: string) => ({ hook, pace, subtitle, delivery: 'voiceover', person: 'hands', length: 'under15', cta: 'yes' })
  const record = (creativeId: string, g: object) => ({ creativeId, productId: 'TT-1001', category: String(product.type).toLowerCase(), genes: g, analyzedAt: now })
  await mkdir(path.join(dataDir, 'db'), { recursive: true })
  await writeFile(path.join(dataDir, 'db', 'creative-genes.json'), JSON.stringify({
    schemaVersion: 1,
    failed: {},
    records: {
      '7300000000000000001': record('7300000000000000001', genes('pain_point', 'fast', 'bold_highlight')),
      '7300000000000000002': record('7300000000000000002', genes('pain_point', 'fast', 'bold_highlight')),
      '7300000000000000003': record('7300000000000000003', genes('unboxing', 'slow', 'plain')),
      '7300000000000000004': record('7300000000000000004', genes('unboxing', 'slow', 'plain')),
    },
  }))
  console.log(`SEED_RESULT ${JSON.stringify(content)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
