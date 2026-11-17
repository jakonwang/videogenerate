/**
 * Seeds a GMV MAX local database with five campaigns, each shaped to trigger a different V2 diagnosis.
 * Usage: tsx test/fixtures/seed-gmv-v2.ts <dataDir>
 */
import { configureAppPathRuntime } from '../../src/main/lib/paths'

async function main() {
  const dataDir = process.argv[2]
  if (!dataDir) throw new Error('dataDir required')
  configureAppPathRuntime({ dataDir, userDataDir: dataDir })
  const { gmvMaxRepo } = await import('../../src/main/modules/tiktok-gmv-max/sqlite')
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  gmvMaxRepo.saveConnection({ id: 'conn-1', name: 'Demo', state: 'connected', serverUrl: 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat', missingTools: [], createdAt: now, updatedAt: now } as any)
  gmvMaxRepo.saveBinding({ id: 'bind-1', connectionId: 'conn-1', advertiserId: 'adv-1', advertiserName: 'Demo Ads', currency: 'USD', timezone: 'UTC', storeId: 'store-1', storeName: 'Demo Shop', campaignType: 'PRODUCT', active: true, updatedAt: now })
  const campaigns = [
    { id: 'c-losing', name: '耳环-主推', budget: 200, roas: 2, revenueRoi: 2, util: 0.7 },
    { id: 'c-under', name: '项链-新款', budget: 300, roas: 3.2, revenueRoi: 3.6, util: 0.3 },
    { id: 'c-scale', name: '手链-爆款', budget: 150, roas: 3, revenueRoi: 3.8, util: 0.96 },
    { id: 'c-healthy', name: '戒指-常规', budget: 100, roas: 3, revenueRoi: 3.5, util: 0.65 },
    { id: 'c-learning', name: '发夹-测试', budget: 80, roas: 3, revenueRoi: 2.2, util: 0.6 },
  ]
  for (const campaign of campaigns) {
    gmvMaxRepo.saveCampaign({
      id: campaign.id, bindingId: 'bind-1', advertiserId: 'adv-1', storeId: 'store-1', name: campaign.name, campaignType: 'PRODUCT',
      operationStatus: 'ENABLE', budget: String(campaign.budget), roasBid: String(campaign.roas), promotionDaysEnabled: false,
      lastSyncedAt: now, raw: { bid_type: 'CUSTOM' },
    })
    for (let index = 14; index >= 1; index -= 1) {
      const date = new Date(now - index * day).toISOString().slice(0, 10)
      // Deterministic day-to-day wobble (sums to ~0 over any 7 days) and a smaller prior week, so charts show movement
      // while the 7-day averages that drive the diagnosis stay where the scenarios need them.
      const wobble = [0.05, -0.03, 0.02, -0.04, 0.03, -0.02, 0][index % 7]
      const priorWeek = index > 7 ? 0.86 : 1
      const cost = campaign.budget * campaign.util * priorWeek * (1 + wobble)
      const revenue = cost * campaign.revenueRoi * (1 - wobble / 2)
      const targetForDay = campaign.id === 'c-learning' && index <= 1 ? 3 : campaign.id === 'c-learning' ? 2.5 : campaign.roas
      gmvMaxRepo.saveMetric({
        id: `${campaign.id}-${date}`, campaignId: campaign.id, advertiserId: 'adv-1', storeId: 'store-1', campaignType: 'PRODUCT', statDate: date,
        cost: cost.toFixed(2), grossRevenue: revenue.toFixed(2), roi: campaign.revenueRoi.toFixed(2), orders: String(Math.round(revenue / 30)),
        budgetUtilization: campaign.util.toFixed(4), raw: { metrics: { roas_bid: String(targetForDay), net_cost: (cost * 0.95).toFixed(2) } }, syncedAt: now,
      })
    }
  }
  console.log('seeded')
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
