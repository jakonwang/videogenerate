/**
 * Timing of the 店铺 / 销售与库存 read paths at real-shop scale (2 shops, ~500 SKUs each,
 * 90 days of SKU history, 3 days of orders). These run on the Electron main process, so
 * anything slow here freezes the whole app. Usage: npx tsx test/seller-inventory.perf.ts
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { buildDashboard, shiftDate, zonedDate, type SiCompassRow, type SiOrderLine, type SiPlatformSku, type SiShopDay } from '../src/shared/sellerInventory'
import { sellerInventoryRepo as repo } from '../src/main/modules/seller-inventory/repo'
import { sellerInventoryService, setSellerInventoryDependenciesForTest } from '../src/main/modules/seller-inventory/service'

const TZ = 'Asia/Ho_Chi_Minh'
const NOW = Date.UTC(2026, 10, 22, 8, 0, 0)
const TODAY = zonedDate(NOW, TZ)

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'si-perf-'))
  configureAppPathRuntime({ dataDir })
  repo.close()
  const shops = ['A', 'B'].map((id) => ({ id: `shop-${id}`, name: `Shop ${id}`, region: 'VN', loginState: 'valid', timezone: TZ, shopId: id }))
  setSellerInventoryDependenciesForTest({ now: () => NOW, listShops: () => shops, delay: async () => undefined, markLogin: () => undefined })

  for (const shop of shops) {
    const skus: SiPlatformSku[] = Array.from({ length: 500 }, (_, i) => ({ id: `${shop.id}:s${i}`, shopKey: shop.id, skuId: `s${i}`, productId: `p${Math.floor(i / 3)}`, productName: `Product ${i} A-${i}`, skuName: '', sellerSku: i % 7 === 0 ? '' : `A-${i}`, stockTotal: 50, stockAvailable: 50, updatedAt: NOW }))
    repo.upsertPlatformSkus(skus)
    for (let d = 3; d < 90; d += 1) {
      const date = shiftDate(TODAY, -d)
      const rows: SiCompassRow[] = Array.from({ length: 120 }, (_, i) => ({ shopKey: shop.id, skuId: `s${i}`, productId: 'p', productName: 'P', skuName: '', date, gmv: 39200 * (i % 9 + 1), orders: i % 9 + 1, units: i % 9 + 1 }))
      repo.replaceCompassDay(shop.id, date, rows, NOW)
    }
    const lines: SiOrderLine[] = []
    for (let d = 0; d < 3; d += 1) {
      for (let n = 0; n < 1200; n += 1) lines.push({ id: `${shop.id}:o${d}-${n}:s${n % 150}`, shopKey: shop.id, orderId: `o${d}-${n}`, skuId: `s${n % 150}`, sellerSku: `A-${n % 150}`, productName: 'P', skuName: '', quantity: 1, amount: 39200, status: n % 20 === 0 ? 140 : 122, createdAt: NOW - d * 86_400_000, date: shiftDate(TODAY, -d) })
    }
    repo.upsertOrderLines(lines)
    const days: SiShopDay[] = Array.from({ length: 90 }, (_, d) => ({ shopKey: shop.id, date: shiftDate(TODAY, -d), fetchedAt: NOW, gmv: 3e7, itemsSold: 700, skuOrders: 680, orders: 660, buyers: 640, visitors: 15000, impressions: 6e5, uniqueImpressions: 3e5, conversion: 0.04, aov: 45000, liveGmv: 3e6, videoGmv: 2.4e7, cardGmv: 3e6, affiliateLiveGmv: 3e6, sellerLiveGmv: 0, affiliateVideoGmv: 2.4e7, sellerVideoGmv: 0 }))
    repo.upsertShopDays(days)
    repo.saveShopState({ shopKey: shop.id, sellerId: shop.shopId, ordersFrom: shiftDate(TODAY, -2), ordersSyncedTo: NOW, lastSyncAt: NOW })
  }

  const time = (label: string, run: () => unknown) => {
    const start = performance.now()
    run()
    const ms = Math.round(performance.now() - start)
    console.log(`${label.padEnd(28)} ${ms} ms`)
    return ms
  }
  if (process.env.SI_PERF_PIECES) {
    const piece = (label: string, run: () => unknown) => { const start = performance.now(); const value = run(); console.log(`  ${label.padEnd(26)} ${Math.round(performance.now() - start)} ms`); return value }
    piece('compass rows (shop A)', () => repo.dailyFromCompass('shop-A', shiftDate(TODAY, -89), shiftDate(TODAY, -2)))
    piece('order rows (shop A)', () => repo.dailyFromOrders('shop-A', shiftDate(TODAY, -2)))
    piece('platform skus', () => repo.listPlatformSkus())
    piece('mappings+moves+settings', () => [repo.listMappings(), repo.listMoves(), repo.listSkuSettings()])
    const daily = [...repo.dailyFromCompass('shop-A', shiftDate(TODAY, -89), shiftDate(TODAY, -2)), ...repo.dailyFromOrders('shop-A', shiftDate(TODAY, -2)), ...repo.dailyFromCompass('shop-B', shiftDate(TODAY, -89), shiftDate(TODAY, -2)), ...repo.dailyFromOrders('shop-B', shiftDate(TODAY, -2))]
    const input = { today: TODAY, days: 30, shops: [], platformSkus: repo.listPlatformSkus(), daily, mappings: repo.listMappings(), moves: [], skuSettings: [], settings: repo.getSettings() }
    piece(`buildDashboard (${daily.length} rows)`, () => buildDashboard(input))
    piece('buildDashboard again', () => buildDashboard(input))
    const bump = () => repo.saveSettings(repo.getSettings())
    bump(); piece('dashboard shop A', () => sellerInventoryService.getDashboard({ shopKey: 'shop-A', days: 30 }))
    const spent = new Map<string, number>()
    const original = { ...repo } as Record<string, (...args: unknown[]) => unknown>
    for (const name of Object.keys(original)) {
      if (typeof original[name] !== 'function') continue
      ;(repo as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => { const start = performance.now(); try { return original[name](...args) } finally { spent.set(name, (spent.get(name) || 0) + performance.now() - start) } }
    }
    piece('profit shop A (8d)', () => sellerInventoryService.getShopProfit({ shopKey: 'shop-A', days: 8 }))
    console.log('   repo time in profit:', [...spent.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k} ${Math.round(v)}ms`).join(', '))
    Object.assign(repo, original)
    piece('profitSignal shop A', () => sellerInventoryService.profitSignal('shop-A'))
    piece('analyzeShop shop A', () => sellerInventoryService.analyzeShop('shop-A'))
    bump(); piece('overview (cold)', () => sellerInventoryService.getShopsOverview())
  }
  // Cold: first build after data changed (happens once per sync, and is pre-computed right after it).
  // Warm: every other open of the page. Both run on the main process, so both must stay short.
  const views: Array<[string, () => unknown]> = [
    ['getDashboard (all shops)', () => sellerInventoryService.getDashboard({ days: 30 })],
    ['getShopsOverview', () => sellerInventoryService.getShopsOverview()],
    ['getShopReport (30 days)', () => sellerInventoryService.getShopReport({ shopKey: 'shop-A', days: 30 })],
    ['getShopProfit (30 days)', () => sellerInventoryService.getShopProfit({ shopKey: 'shop-A', days: 30 })],
    ['listMappings', () => sellerInventoryService.listMappings()],
    ['businessDigest (phone)', () => sellerInventoryService.businessDigest()],
  ]
  repo.saveSettings(repo.getSettings())
  const cold = views.map(([label, run]) => [label, time(`${label} cold`, run)] as const)
  const warm = views.map(([label, run]) => [label, time(`${label} warm`, run)] as const)
  const coldTotal = cold.reduce((total, [, ms]) => total + ms, 0)
  console.log(`all views cold, total          ${coldTotal} ms`)
  assert.ok(coldTotal <= Number(process.env.SI_PERF_COLD_MS || 600), `cold views took ${coldTotal} ms`)
  for (const [name, ms] of warm) assert.ok(ms <= Number(process.env.SI_PERF_WARM_MS || 20), `${name} warm took ${ms} ms`)
  repo.close()
  await rm(dataDir, { recursive: true, force: true })
  console.log('seller-inventory perf: ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
