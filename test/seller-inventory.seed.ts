/**
 * Seeds two shops with products, 14 days of orders and older compass history for the
 * 销售与库存 e2e. Uses VIDEOGENERATE_DATA_DIR from the environment.
 */
import { creatorHubRepo } from '../src/main/modules/tiktok-creator-hub/repo'
import { sellerInventoryRepo as repo } from '../src/main/modules/seller-inventory/repo'
import { shiftDate, zonedDate, type SiOrderLine, type SiPlatformSku, type SiShopDay } from '../src/shared/sellerInventory'

const TZ = 'Asia/Ho_Chi_Minh'
const now = Date.now()
const today = zonedDate(now, TZ)
const shops = [
  { id: 'shop-a', name: 'ARUA VN', shopId: '111' },
  { id: 'shop-b', name: 'ARUA Store 2', shopId: '222' },
]
for (const shop of shops) {
  creatorHubRepo.saveShop({ id: shop.id, name: shop.name, region: 'VN', shopId: shop.shopId, timezone: TZ, loginState: 'valid', createdAt: now, updatedAt: now })
}

const image = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23d4a373"/></svg>'
const products: Array<{ shop: string; skuId: string; seller: string; name: string; stock: number; perDay: (day: number) => number; price: number }> = [
  // A-152 sells in both shops and is accelerating: a best seller.
  { shop: 'shop-a', skuId: 'a1', seller: 'A-152', name: '#13 Bông tai hoa đồng mạ bạc 925 A-152', stock: 120, perDay: (d) => (d < 7 ? 40 : 18), price: 39200 },
  { shop: 'shop-b', skuId: 'b1', seller: 'A-152', name: 'Bông tai hoa A-152', stock: 30, perDay: (d) => (d < 7 ? 12 : 6), price: 39200 },
  // A-67 sells steadily and has little stock left.
  { shop: 'shop-a', skuId: 'a2', seller: 'A-67', name: '#10 Bông tai zircon vòng nhỏ A-67', stock: 25, perDay: () => 9, price: 41000 },
  // No seller SKU in the backend: shows as unmapped with a suggestion from the title.
  { shop: 'shop-a', skuId: 'a3', seller: '', name: 'Lắc tay đính đá sang trọng B-21', stock: 400, perDay: (d) => (d < 7 ? 3 : 8), price: 89000 },
  // In stock, not selling: slow mover.
  { shop: 'shop-b', skuId: 'b2', seller: 'C-9', name: 'Dây chuyền bạc C-9', stock: 60, perDay: (d) => (d > 20 ? 2 : 0), price: 120000 },
]

const skus: SiPlatformSku[] = products.map((item) => ({ id: `${item.shop}:${item.skuId}`, shopKey: item.shop, skuId: item.skuId, productId: `p-${item.skuId}`, productName: item.name, skuName: '', sellerSku: item.seller, image, price: item.price, stockTotal: item.stock, stockAvailable: item.stock, updatedAt: now }))
repo.upsertPlatformSkus(skus)

const ordersFrom = shiftDate(today, -13)
const lines: SiOrderLine[] = []
let n = 0
for (const item of products) {
  for (let day = 0; day < 14; day += 1) {
    const date = shiftDate(today, -day)
    const units = item.perDay(day)
    for (let i = 0; i < units; i += 1) {
      n += 1
      // One cancelled order a day must not count.
      const status = i === 0 && day % 3 === 0 ? 140 : 122
      lines.push({ id: `${item.shop}:o${n}:${item.skuId}`, shopKey: item.shop, orderId: `o${n}`, skuId: item.skuId, sellerSku: item.seller, productName: item.name, skuName: '', quantity: 1, amount: item.price, status, createdAt: now - day * 86_400_000, date })
    }
  }
}
// Compass history is stored one whole shop-day at a time.
for (const shop of shops) {
  for (let day = 14; day < 60; day += 1) {
    const date = shiftDate(today, -day)
    const rows = products.filter((item) => item.shop === shop.id).map((item) => {
      const units = item.perDay(day)
      return { shopKey: item.shop, skuId: item.skuId, productId: `p-${item.skuId}`, productName: item.name, skuName: '', date, gmv: units * item.price, orders: units, units }
    })
    repo.replaceCompassDay(shop.id, date, rows, now)
  }
}
repo.upsertOrderLines(lines)
// Shop KPIs: shop A grows then drops ~30% in the last week; shop B is steady and smaller.
const shopDays: SiShopDay[] = []
for (const shop of shops) {
  for (let day = 0; day < 90; day += 1) {
    const date = shiftDate(today, -day)
    const weekly = 1 + 0.1 * Math.sin(day / 2)
    const base = shop.id === 'shop-a' ? (day >= 1 && day <= 7 ? 14_000_000 : 26_000_000) : 6_000_000
    const gmv = Math.round(base * weekly * (day === 0 ? 0.45 : 1))
    const orders = Math.round(gmv / 46_000)
    const visitors = Math.round(orders / 0.042)
    const live = Math.round(gmv * 0.18)
    const card = Math.round(gmv * 0.1)
    const video = gmv - live - card
    shopDays.push({ shopKey: shop.id, date, fetchedAt: now, gmv, orders, skuOrders: orders + 4, itemsSold: orders + 9, buyers: Math.round(orders * 0.97), visitors, impressions: visitors * 40, uniqueImpressions: visitors * 23, conversion: (orders * 0.97) / visitors, aov: gmv / (orders + 4), liveGmv: live, videoGmv: video, cardGmv: card, affiliateLiveGmv: Math.round(live * 0.95), sellerLiveGmv: live - Math.round(live * 0.95), affiliateVideoGmv: video, sellerVideoGmv: 0 })
  }
}
repo.upsertShopDays(shopDays)
repo.saveShopHealth({
  shopKey: 'shop-a', fetchedAt: now,
  indicators: [
    { key: 'user_12h_valid_mcs_reply_rate_30d', title: 'Tỷ lệ trả lời trong 12 giờ', value: 0.82, target: 0.85, operator: 'ge', unit: 101, defective: 0 },
    { key: 'IMART_hour_30d', title: 'Thời gian phản hồi trung bình', value: 2.99, target: 1, operator: 'lt', unit: 202, defective: 0 },
    { key: 'compute_non_fbt_late_dispatch_s7d_e1d', title: 'Tỷ lệ gửi hàng muộn', value: 0.004, target: 0.04, operator: 'le', unit: 101, defective: 14 },
    { key: 'seller_im_csat_30d', title: 'Tỷ lệ hài lòng qua chat', value: 0.63, target: 0.7, operator: 'ge', unit: 101, defective: 0 },
    { key: 'extra_indicator_0', title: 'Chỉ số 0', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_1', title: 'Chỉ số 1', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_2', title: 'Chỉ số 2', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_3', title: 'Chỉ số 3', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_4', title: 'Chỉ số 4', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_5', title: 'Chỉ số 5', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_6', title: 'Chỉ số 6', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_7', title: 'Chỉ số 7', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
    { key: 'extra_indicator_8', title: 'Chỉ số 8', value: 0.001, target: 0.05, operator: 'le', unit: 101, defective: 0 },
  ],
  todo: { toShip: 445, urgentToShip: 2, returns: 92, urgentReturns: 3, negativeReviews: 4, outOfStock: 358, rejectedProducts: 0 },
  violationScore: 0, violations: [], warnings: 2,
})
// Profit inputs: settlements (33% fees), cost prices for two codes, and a GMV Max store for shop A.
repo.replacePendingSettlements('shop-a', Array.from({ length: 40 }, (_, index) => ({ id: `p${index}`, shopKey: 'shop-a', orderId: `o${index}`, placedAt: now - index * 3_600_000, placedDate: today, status: 'pending' as const, tradeType: 1, revenue: 39200, fees: -12936, settlement: 26264, shipping: 0 })))
repo.saveSkuSettings({ code: 'A-152', cost: 9000, updatedAt: now })
repo.saveSkuSettings({ code: 'A-67', cost: 11000, updatedAt: now })
{
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => { exec(sql: string): void; prepare(sql: string): { run(...args: unknown[]): void }; close(): void } }
  const gmv = new DatabaseSync(require('node:path').join(process.env.VIDEOGENERATE_DATA_DIR as string, 'db', 'tiktok-gmv-max.sqlite'))
  gmv.exec('CREATE TABLE IF NOT EXISTS gmv_bindings (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS gmv_metrics (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, stat_date TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);')
  gmv.prepare('INSERT OR REPLACE INTO gmv_bindings VALUES (?, ?, ?, ?)').run('b1', 'c1', now, JSON.stringify({ storeId: '111', storeName: 'ARUA VN', advertiserId: 'adv1', advertiserName: 'ARUA Ads', currency: 'VND' }))
  for (let day = 0; day < 30; day += 1) gmv.prepare('INSERT OR REPLACE INTO gmv_metrics VALUES (?, ?, ?, ?, ?)').run(`m${day}`, 'camp1', shiftDate(today, -day), now, JSON.stringify({ storeId: '111', cost: String(2_500_000) }))
  gmv.close()
}
// The test profile must not fire the real morning report (and a desktop notification) on its own.
repo.saveReportSettings({ enabled: false, hour: 9, desktop: true, feishu: true })
for (const shop of shops) repo.saveShopState({ shopKey: shop.id, sellerId: shop.shopId, ordersFrom, ordersSyncedTo: now, lastSyncAt: now, skuCount: skus.filter((sku) => sku.shopKey === shop.id).length })
console.log(`seeded ${lines.length} order lines`)
