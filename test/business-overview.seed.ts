/**
 * Data for the business overview e2e: the product-spine channel data plus a bound product, two weeks of
 * GMV Max campaign metrics (GMV falling, one campaign burning money), a creator shop and two inventory SKUs.
 * CLI: VIDEOGENERATE_DATA_DIR=<dir> tsx test/business-overview.seed.ts
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { seedProductSpineChannels, seedProductWithCloneVideo } from './product-spine.seed'

const DAY = 86_400_000

function localDay(offset: number, now: number) {
  const date = new Date(now - offset * DAY)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function seedBusinessOverview(dataDir: string, now = Date.now()) {
  const channels = await seedProductSpineChannels(now)
  const { gmvMaxRepo } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  const { creatorHubRepo } = await import('../src/main/modules/tiktok-creator-hub/repo')

  gmvMaxRepo.saveBinding({ id: 'bind-1', connectionId: 'conn-1', advertiserId: 'adv-1', advertiserName: 'Demo Ads', currency: 'USD', storeId: 'store-1', storeName: 'Demo Store', campaignType: 'PRODUCT', active: true, updatedAt: now } as any)
  gmvMaxRepo.saveCampaign({ id: 'camp-1', bindingId: 'bind-1', advertiserId: 'adv-1', storeId: 'store-1', name: '耳环主推', campaignType: 'PRODUCT', operationStatus: 'ENABLE', budget: '100', roasBid: '2', promotionDaysEnabled: false, lastSyncedAt: now, raw: {} } as any)
  gmvMaxRepo.saveCampaign({ id: 'camp-2', bindingId: 'bind-1', advertiserId: 'adv-1', storeId: 'store-1', name: '项链测款', campaignType: 'PRODUCT', operationStatus: 'ENABLE', budget: '50', roasBid: '2', promotionDaysEnabled: false, lastSyncedAt: now, raw: {} } as any)
  const metric = (campaignId: string, offset: number, cost: number, revenue: number, orders: number) => gmvMaxRepo.saveMetric({
    id: `${campaignId}:${localDay(offset, now)}`, campaignId, advertiserId: 'adv-1', storeId: 'store-1', campaignType: 'PRODUCT', statDate: localDay(offset, now),
    cost: String(cost), grossRevenue: String(revenue), roi: String(cost ? revenue / cost : 0), orders: String(orders), budgetUtilization: '0', raw: {}, syncedAt: now,
  } as any)
  for (let offset = 7; offset < 14; offset += 1) metric('camp-1', offset, 100, 400, 12)
  for (let offset = 0; offset < 7; offset += 1) {
    metric('camp-1', offset, 120, 260, 9)
    metric('camp-2', offset, 30, 0, 0)
  }

  creatorHubRepo.saveShop({ id: 'shop-1', name: 'Demo Shop', region: 'US', shopId: 'S1', loginState: 'ok', createdAt: now, updatedAt: now } as any)
  channels.close()

  const { dianxiaomiInventoryRepo } = await import('../src/main/modules/dianxiaomi-inventory/repo')
  const baselineDate = localDay(20, now)
  const sku = async (id: string, code: string, stock: number, perDay: number) => {
    await dianxiaomiInventoryRepo.upsertSku({ id, sku: code, baselineDate, baselineStock: stock, forecastWindowDays: 14, warningDays: 7, createdAt: now, updatedAt: now, lastSyncAt: now } as any)
    const rows = Array.from({ length: 21 }, (_, index) => ({ id: `${id}:${localDay(index, now)}`, skuId: id, date: localDay(index, now), quantity: perDay, orderCount: perDay, syncedAt: now }))
    await dianxiaomiInventoryRepo.replaceShipments(id, baselineDate, localDay(0, now), rows)
  }
  await sku('sku-1', 'EAR-PEARL-01', 100, 5)
  await sku('sku-2', 'NECK-GOLD-02', 120, 5)

  const content = await seedProductWithCloneVideo(dataDir)
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const product = (await productsRepo.list()).find((item) => item.id === content.productId)!
  await productsRepo.upsert({ id: product.id, name: product.name, type: product.type, tiktokProductIds: ['TT-1001'] })
  return content
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dataDir = process.env.VIDEOGENERATE_DATA_DIR
  if (!dataDir) throw new Error('VIDEOGENERATE_DATA_DIR is required')
  configureAppPathRuntime({ dataDir, userDataDir: process.env.VIDEOGENERATE_USER_DATA_DIR || dataDir })
  seedBusinessOverview(dataDir).then((content) => {
    console.log(`SEED_RESULT ${JSON.stringify(content)}`)
    process.exit(0)
  }).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
