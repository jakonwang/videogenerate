import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { buildDashboard, classifyTag, ledgerStock, shiftDate, suggestCode, zonedDate, SI_DEFAULT_SETTINGS, type SiStockMove } from '../src/shared/sellerInventory'
import { parseCompassPage, parseOrderPage, parseProductPage, parseProductSkus, parseSellerId, toPlatformSku } from '../src/main/modules/seller-inventory/parser'
import { sellerInventoryRepo } from '../src/main/modules/seller-inventory/repo'
import { dayStartMs, sellerInventoryService, setSellerInventoryDependenciesForTest } from '../src/main/modules/seller-inventory/service'
import { gmvAds } from '../src/main/modules/seller-inventory/gmvAds'

const TZ = 'Asia/Ho_Chi_Minh'
// 2026-11-22 15:00 in Vietnam.
const NOW = Date.UTC(2026, 10, 22, 8, 0, 0)
const TODAY = '2026-11-22'
const sec = (date: string, hour = 10) => String(Math.floor((dayStartMs(date, TZ) + hour * 3_600_000) / 1000))

function order(id: string, date: string, items: Array<{ skuId: string; seller: string; qty: number; amount: number; status?: number }>, hour = 10) {
  return {
    main_order_id: id,
    trade_order_module: { create_time: sec(date, hour) },
    order_status_module: items.map((item, index) => ({ order_line_id: `${id}-${index}`, main_order_status: 101, sku_display_status: item.status ?? 111 })),
    sku_module: items.map((item, index) => ({
      sku_id: item.skuId,
      order_line_ids: [`${id}-${index}`],
      product_name: `Product ${item.skuId}`,
      sku_name: 'Mặc định',
      seller_sku_name: item.seller,
      quantity: item.qty,
      sku_total_price: { price_val: String(item.amount) },
      product_image: { thumb_url_list: ['https://img.example/a.jpg'] },
    })),
  }
}

function testPureHelpers() {
  assert.equal(zonedDate(Date.UTC(2026, 10, 21, 18, 0), TZ), '2026-11-22', 'UTC 18:00 is next day in Vietnam')
  assert.equal(new Date(dayStartMs('2026-11-22', TZ)).toISOString(), '2026-11-21T17:00:00.000Z')
  assert.equal(suggestCode({ productName: '#13 Bông tai hoa đồng ... A-152', sellerSku: '', singleSku: true }), 'A-152')
  assert.equal(suggestCode({ productName: 'Bông tai A-152', sellerSku: '', singleSku: false }), undefined, 'multi-SKU products are not guessed')
  assert.equal(suggestCode({ productName: 'x', sellerSku: ' a-9 ', singleSku: false }), 'A-9')

  // Count of 100 on 11-20 saved after 5 units of that day were sold; then 3 more that day,
  // 10 on 11-21, an inbound of 50 on 11-21, 4 today.
  const moves: SiStockMove[] = [
    { id: '1', code: 'A', date: '2026-11-20', kind: 'count', quantity: 100, soldAtSave: 5, createdAt: 1 },
    { id: '2', code: 'A', date: '2026-11-21', kind: 'inbound', quantity: 50, createdAt: 2 },
    { id: '3', code: 'A', date: '2026-11-19', kind: 'inbound', quantity: 999, createdAt: 0 },
  ]
  const units = new Map([['2026-11-19', 7], ['2026-11-20', 8], ['2026-11-21', 10], ['2026-11-22', 4]])
  assert.equal(ledgerStock(moves, units), 100 - 3 + 50 - 10 - 4, 'only movements and sales after the count apply')
  assert.equal(ledgerStock(moves.filter((move) => move.kind !== 'count'), units), undefined, 'no count means no ledger balance')

  assert.equal(classifyTag({ units7: 100, unitsPrev7: 40, units14: 140, firstSaleDate: '2026-10-01', today: TODAY, hotThreshold: 50 }), 'hot')
  assert.equal(classifyTag({ units7: 10, unitsPrev7: 7, units14: 17, firstSaleDate: '2026-10-01', today: TODAY, hotThreshold: 50 }), 'rising')
  assert.equal(classifyTag({ units7: 4, unitsPrev7: 20, units14: 24, firstSaleDate: '2026-10-01', today: TODAY, hotThreshold: 50 }), 'declining')
  assert.equal(classifyTag({ units7: 0, unitsPrev7: 0, units14: 0, stock: 5, firstSaleDate: '2026-10-01', today: TODAY, hotThreshold: 50 }), 'slow')
  assert.equal(classifyTag({ units7: 3, unitsPrev7: 0, units14: 3, firstSaleDate: '2026-11-20', today: TODAY, hotThreshold: 50 }), 'new')
}

function testParsers() {
  assert.deepEqual(parseSellerId({ code: 0, data: { sellers_data: { x: { global_seller: { seller_map: [{ seller_id: '11', region: 'TH' }, { seller_id: '22', region: 'VN', shop_name: 'Shop' }] } } } } }, 'vn'), { sellerId: '22', shopName: 'Shop', shopCode: '' })
  assert.throws(() => parseSellerId({ code: 1, message: 'no' }, 'VN'), /code=1/)

  const page = parseProductPage({ code: 0, data: { total_product_count: 2, products: [{ product_id: 'p1', product_name: 'P1 A-1', total_sku_count: 2, image: { url_list: ['https://img/p1'] }, skus: [{ id: 's1', seller_sku: '', quantities: [{ total_quantity: 5, available_quantity: 4 }, { total_quantity: 2, available_quantity: 2 }], properties: [{ value_name: 'Red' }] }] }] } })
  assert.equal(page.products[0].totalSkuCount, 2)
  const sku = toPlatformSku('shop', page.products[0].product, page.products[0].skus[0], 1)
  assert.equal(sku?.stockAvailable, 6, 'stock adds up across warehouses')
  assert.equal(sku?.skuName, 'Red')
  assert.equal(sku?.image, 'https://img/p1')
  assert.equal(parseProductSkus({ code: 0, data: { 0: { id: 'a' }, 1: { id: 'b' } } }).length, 2, 'index-keyed SKU object')

  const parsed = parseOrderPage({ code: 0, data: { main_orders: [order('o1', TODAY, [{ skuId: 's1', seller: 'A-1', qty: 2, amount: 78400 }, { skuId: 's2', seller: '', qty: 1, amount: 100, status: 140 }])], search_next_cursor: 'c2', search_next_has_more: true } }, 'shop', TZ)
  assert.equal(parsed.lines.length, 2)
  assert.equal(parsed.lines[0].date, TODAY)
  assert.equal(parsed.lines[0].amount, 78400)
  assert.equal(parsed.lines[1].status, 140)
  assert.equal(parsed.nextCursor, 'c2')

  const compass = parseCompassPage({ code: 0, data: { items: [{ meta: { product_id: 'p1', sku_id: 's1', product_name: 'P1', sku_property_value: 'Red' }, stats: { sku_gmv: { amount: '1000' }, sku_order_cnt: 3, sku_unit_sold_cnt: 4 } }] } }, 'shop', '2026-11-01')
  assert.deepEqual([compass[0].gmv, compass[0].orders, compass[0].units], [1000, 3, 4])
}

async function testServiceSync() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'seller-inventory-'))
  configureAppPathRuntime({ dataDir })
  sellerInventoryRepo.close()
  const calls: string[] = []
  const loginMarks: string[] = []
  let statsRequests = 0
  const delivered: string[] = []
  const orderPages = [
    // Newest first, like the seller center sorts them.
    { main_orders: [order('o3', TODAY, [{ skuId: 's1', seller: 'A-1', qty: 3, amount: 300 }]), order('o2', '2026-11-21', [{ skuId: 's2', seller: '', qty: 2, amount: 200 }])], search_next_cursor: 'next', search_next_has_more: true },
    { main_orders: [order('o1', '2026-11-20', [{ skuId: 's1', seller: 'A-1', qty: 1, amount: 100 }]), order('o0', '2026-11-20', [{ skuId: 's1', seller: 'A-1', qty: 9, amount: 900, status: 140 }]), order('old', '2026-10-01', [{ skuId: 's1', seller: 'A-1', qty: 50, amount: 1 }])], search_next_cursor: 'more', search_next_has_more: true },
  ]
  setSellerInventoryDependenciesForTest({
    now: () => NOW,
    delay: async () => undefined,
    markLogin: (shopKey, state) => { loginMarks.push(`${shopKey}:${state}`) },
    deliver: async (report, settings) => { delivered.push(report.date); return { desktop: settings.desktop, feishu: settings.feishu } },
    listShops: () => [{ id: 'shopA', name: 'Shop A', region: 'VN', loginState: 'valid', timezone: TZ }],
    createSession: () => ({
      open: async (pathname: string) => { calls.push(`open ${pathname}`) },
      close: () => { calls.push('close') },
      api: async (input) => {
        calls.push(input.path)
        if (input.path.endsWith('get_all_sellers')) return { code: 0, data: { sellers_data: { g: { global_seller: { seller_map: [{ seller_id: 'S1', region: 'VN' }] } } } } }
        if (input.path.endsWith('products/list')) return { code: 0, data: { total_product_count: 2, products: [
          { product_id: 'p1', product_name: 'Earring A-1', total_sku_count: 1, skus: [{ id: 's1', seller_sku: 'A-1', quantities: [{ total_quantity: 40, available_quantity: 40 }] }] },
          { product_id: 'p2', product_name: 'Necklace B-7', total_sku_count: 2, skus: [{ id: 's2', seller_sku: '', quantities: [{ available_quantity: 3 }] }] },
        ] } }
        if (input.path.endsWith('product/skus/list')) return { code: 0, data: { 0: { id: 's2', seller_sku: '', quantities: [{ available_quantity: 3 }] }, 1: { id: 's3', seller_sku: 'B-7-L', quantities: [{ available_quantity: 1 }] } } }
        if (input.path.endsWith('fulfillment/order/list')) {
          const body = input.body as { offset: number; pagination_type: number }
          assert.equal(body.pagination_type, 0, 'offset paging, so pages can load in parallel')
          return { code: 0, data: orderPages[body.offset / 100] || { main_orders: [] } }
        }
        if (input.path.endsWith('sku/list')) {
          const body = input.body as { request: { time_descriptor: { start: string; end: string } } }
          assert.equal(body.request.time_descriptor.end, shiftDate(body.request.time_descriptor.start, 1), 'compass end date is exclusive')
          return { code: 0, data: { items: body.request.time_descriptor.start === '2026-11-01' ? [{ meta: { sku_id: 's1', product_id: 'p1' }, stats: { sku_gmv: { amount: '500' }, sku_order_cnt: 5, sku_unit_sold_cnt: 5 } }] : [] } }
        }
        if (input.path.endsWith('statement/order/list')) {
          const query = input.query as Record<string, string>
          if (query.from !== '0') return { code: 0, data: { order_records: [] } }
          const status = query.settlement_status === '1' ? 'pending' : 'settled'
          // 30 orders of 100 with 30 fees each: a 30% fee rate.
          const records = Array.from({ length: 30 }, (_, index) => ({ statement_detail_id: `${status}-${index}`, trade_order_id: `o${index}`, placed_time: String(NOW - 86_400_000 * (1 + (index % 5))), settlement_time: status === 'settled' ? String(NOW - 3_600_000) : undefined, trade_type: 1, earning_amount: { amount: '100' }, fees: { amount: '-30' }, settlement_amount: { amount: '70' }, shipping_amount: { amount: '0' } }))
          return { code: 0, data: { order_records: records, total_record: 30 } }
        }
        if (input.path.endsWith('home_task/get')) return { code: 0, data: { home_cards: [{ card_title: 'home_task_orders_to_ship_title', card_value: '10', urgent_list: [{ card_value: '1' }] }] } }
        if (input.path.endsWith('performance/list')) return { code: 0, data: { indicators: [{ name: 'x.user_12h_valid_mcs_reply_rate_30d', title: 'Reply', target_value: 0.85, operator: 'ge', value: 0.8, unit: 101 }] } }
        if (input.path.endsWith('violation/overview/get')) return { code: 0, data: { violation_score: 0, violation_points_v2: [] } }
        if (input.path.endsWith('us_overview_stats')) {
          const body = input.body as { query_condition: Array<{ query_time: { start: string; end: string; timezone_offset: number } }> }
          statsRequests += 1
          assert.ok(body.query_condition.length > 1 && body.query_condition.length <= 30, 'many days per request')
          const money = (value: number) => JSON.stringify({ amount: String(value), value: String(value) })
          return { code: 0, data: body.query_condition.map(({ query_time: time }) => {
            assert.equal(time.start, time.end, 'one day per condition')
            assert.equal(time.timezone_offset, 420)
            const n = Number(time.start.slice(-2))
            return { intervals: [{ start_date: time.start, rows: [{ values: { 4024: money(n * 1000), 4031: String(n), 4035: String(n), 4022: String(n), 6070: String(n * 10), 4029: money(n * 100), 4037: money(n * 800), 4033: money(n * 100), 4042: money(n * 100), 4043: money(0), 4045: money(n * 800), 4046: money(0) } }] }] }
          }) }
        }
        throw new Error(`unexpected ${input.path}`)
      },
    }),
  })

  const result = await sellerInventoryService.syncShop('shopA')
  assert.equal(result.status, 'done', result.error)
  assert.deepEqual(loginMarks, ['shopA:valid'], 'a successful sync confirms the shared login')
  assert.ok(calls.includes('open /order') && calls.includes('open /compass/product-analysis'))
  assert.equal(calls.filter((call) => call.endsWith('fulfillment/order/list')).length, 4, 'one parallel batch of order pages, then it stops')
  assert.equal(statsRequests, 3, '90 shop days in 3 requests')
  const state = sellerInventoryRepo.getShopState('shopA')
  const shopDays = sellerInventoryRepo.listShopDays('shopA', '2026-01-01', TODAY)
  assert.equal(shopDays.length, SI_DEFAULT_SETTINGS.historyDays, 'one shop day per history day, today included')
  assert.equal(shopDays.find((day) => day.date === TODAY)?.gmv, 22000)
  const report = sellerInventoryService.getShopReport({ shopKey: 'shopA', days: 7 })
  assert.equal(report.days.length, 7)
  assert.equal(report.totals.gmv, (16 + 17 + 18 + 19 + 20 + 21 + 22) * 1000)
  assert.equal(report.totals.conversion, 0.1, 'conversion is buyers / visitors over the period')
  assert.equal(report.totals.videoGmv + report.totals.liveGmv + report.totals.cardGmv, report.totals.gmv)
  assert.equal(sellerInventoryRepo.getShopHealth('shopA')?.todo.urgentToShip, 1, 'health is synced with the shop')
  assert.ok(report.analysis.findings.some((item) => item.key === 'healthFail' && item.params.indicator === 'user_12h_valid_mcs_reply_rate_30d'))
  assert.ok(report.analysis.findings.some((item) => item.key === 'urgentShip'))
  // Profit: 30% fees learned from settlements, A-1 costs 2 per unit, B-7-M has no cost yet, ad spend from GMV Max.
  assert.equal(sellerInventoryRepo.listSettlements('shopA').length, 60)
  sellerInventoryService.saveSkuSettings({ code: 'A-1', cost: 2 })
  sellerInventoryService.saveSkuSettings({ code: 'A-1', leadDays: 5 })
  assert.equal(sellerInventoryRepo.listSkuSettings().find((item) => item.code === 'A-1')?.cost, 2, 'saving one field keeps the others')
  const gmvDb = new (require('node:sqlite').DatabaseSync)(path.join(dataDir, 'db', 'tiktok-gmv-max.sqlite'))
  gmvDb.exec('CREATE TABLE gmv_bindings (id TEXT PRIMARY KEY, connection_id TEXT, updated_at INTEGER, payload TEXT); CREATE TABLE gmv_metrics (id TEXT PRIMARY KEY, campaign_id TEXT, stat_date TEXT, synced_at INTEGER, payload TEXT);')
  gmvDb.prepare('INSERT INTO gmv_bindings VALUES (?, ?, ?, ?)').run('b1', 'c', 1, JSON.stringify({ storeId: 'S1', storeName: 'Shop A', advertiserId: 'ad1', advertiserName: 'AD', currency: 'VND' }))
  for (const [id, campaign, date, cost] of [['m1', 'c1', TODAY, 1000], ['m2', 'c2', TODAY, 500], ['m3', 'c1', '2026-11-21', 300]] as const) gmvDb.prepare('INSERT INTO gmv_metrics VALUES (?, ?, ?, ?, ?)').run(id, campaign, date, 1, JSON.stringify({ storeId: 'S1', cost: String(cost) }))
  gmvDb.close()
  const profit = sellerInventoryService.getShopProfit({ shopKey: 'shopA', days: 7 })
  assert.equal(profit.feeRate, 0.3)
  assert.equal(profit.adLink?.storeId, 'S1', 'the GMV Max store with the seller id is linked automatically')
  const todayProfit = profit.days.find((day) => day.date === TODAY)!
  assert.equal(todayProfit.gmv, 22000)
  assert.ok(Math.abs(todayProfit.fees - 6600) < 1e-6)
  assert.equal(todayProfit.cogs, 3 * 2, 'today 3 units of A-1 at cost 2')
  assert.equal(todayProfit.adSpend, 1500, 'all campaigns of the store add up')
  assert.ok(Math.abs(todayProfit.profit - (15400 - 6 - 1500)) < 1e-6)
  assert.deepEqual(profit.missingCost, [], 'A-1 has a cost; unmapped SKUs are not asked for one')
  assert.equal(profit.pending.count, 30)
  sellerInventoryService.setAdLink({ shopKey: 'shopA', storeId: 'S1', rate: 2 })
  assert.equal(sellerInventoryService.getShopProfit({ shopKey: 'shopA', days: 7 }).days.find((day) => day.date === TODAY)?.adSpend, 3000, 'exchange rate applies')
  assert.throws(() => sellerInventoryService.setAdLink({ shopKey: 'shopA', storeId: 'nope' }), /AD_STORE_NOT_FOUND/)
  const overview = sellerInventoryService.getShopsOverview()
  const phone = sellerInventoryService.businessDigest()
  assert.equal(phone.shops.length, 1)
  assert.equal(phone.shops[0].currency, '₫')
  assert.ok(phone.shops[0].findings.length > 0 && phone.shops[0].findings.every((item) => item.text && !item.text.includes('{')), 'findings are rendered as Chinese text')
  assert.equal(phone.shops[0].urgentShip, 1)
  assert.ok(overview.cards[0].alerts.some((alert) => alert.kind === 'health' && alert.value === 1))
  assert.equal(overview.cards[0].topFinding?.level, 'error')

  // Morning report: generated once a day after the configured hour (15:00 in Vietnam now).
  sellerInventoryService.saveReportSettings({ hour: 16 })
  assert.equal(await sellerInventoryService.runScheduledReport(), null, 'before the hour nothing runs')
  sellerInventoryService.saveReportSettings({ hour: 9, feishu: false })
  const morning = await sellerInventoryService.runScheduledReport()
  assert.ok(morning, 'after the hour the report runs')
  assert.equal(morning.shops.length, 1)
  assert.deepEqual(morning.delivered, { desktop: true, feishu: false })
  assert.equal(await sellerInventoryService.runScheduledReport(), null, 'only once per day')
  assert.deepEqual(delivered, [TODAY])
  assert.equal(sellerInventoryService.listReports().length, 1)
  assert.equal(overview.cards.length, 1)
  assert.equal(overview.total.todayGmv, 22000)
  assert.equal(overview.cards[0].spark.length, 14)
  assert.equal(state.sellerId, 'S1')
  assert.equal(state.ordersFrom, shiftDate(TODAY, -(SI_DEFAULT_SETTINGS.orderWindowDays - 1)))
  assert.equal(state.skuCount, 3, 'multi-SKU products are expanded')

  let dashboard = sellerInventoryService.getDashboard({ days: 30 })
  const a1 = dashboard.items.find((item) => item.key === 'A-1')
  assert.ok(a1, 'A-1 is listed')
  assert.equal(a1.unitsToday, 3)
  assert.equal(a1.units7, 4, 'cancelled and out-of-window orders are not counted')
  assert.equal(a1.units30, 4 + 5, 'compass history fills days before order coverage')
  assert.equal(a1.stockSource, 'platform')
  assert.equal(a1.stock, 40)
  assert.equal(dashboard.kpi.amountToday, 300)
  const unmapped = dashboard.items.find((item) => item.key === '#s2')
  assert.ok(unmapped && !unmapped.mapped, 'SKU without a code is still visible')

  // Map s2 to a code, count stock, receive stock.
  sellerInventoryService.setMapping({ skuKey: 'shopA:s2', code: 'b-7-m' })
  const count = sellerInventoryService.addMove({ code: 'A-1', date: TODAY, kind: 'count', quantity: 20 })
  assert.equal(count.soldAtSave, 3, 'units already sold today are remembered on a count')
  sellerInventoryService.addMove({ code: 'A-1', date: TODAY, kind: 'inbound', quantity: 15 })
  assert.throws(() => sellerInventoryService.addMove({ code: 'A-1', date: '2026-12-01', kind: 'inbound', quantity: 1 }), /FUTURE/)
  dashboard = sellerInventoryService.getDashboard({ days: 30 })
  const a1After = dashboard.items.find((item) => item.key === 'A-1')
  assert.equal(a1After?.stockSource, 'ledger')
  assert.equal(a1After?.stock, 35)
  assert.ok(dashboard.items.some((item) => item.key === 'B-7-M' && item.mapped && item.units7 === 2))

  assert.ok(sellerInventoryService.getShopProfit({ shopKey: 'shopA', days: 7 }).missingCost.some((item) => item.code === 'B-7-M'), 'once mapped, a selling code without a cost is listed')
  const mappings = sellerInventoryService.listMappings()
  assert.equal(mappings.find((row) => row.skuKey === 'shopA:s2')?.mappedCode, 'B-7-M')

  sellerInventoryRepo.close()
  gmvAds.close()
  await rm(dataDir, { recursive: true, force: true })
}

function testDashboardRisk() {
  const shops = [{ shopKey: 's', name: 'S', region: 'VN', loginState: 'valid', timezone: TZ, state: { shopKey: 's' } }]
  const daily = Array.from({ length: 14 }, (_, index) => ({ shopKey: 's', skuId: 'x', sellerSku: 'X-1', date: shiftDate(TODAY, -index), units: 10, amount: 100, orders: 10, cancelledUnits: 0 }))
  const dashboard = buildDashboard({ today: TODAY, days: 30, shops, platformSkus: [{ id: 's:x', shopKey: 's', skuId: 'x', productId: 'p', productName: 'X', skuName: '', sellerSku: 'X-1', stockTotal: 50, stockAvailable: 50, updatedAt: 1 }], daily, mappings: new Map(), moves: [], skuSettings: [], settings: SI_DEFAULT_SETTINGS })
  const item = dashboard.items[0]
  assert.equal(item.avgDaily, 10)
  assert.equal(item.daysLeft, 5)
  assert.equal(item.risk, 'urgent', '5 days left with a 7-day lead time')
  assert.equal(item.suggestQty, Math.ceil(10 * (7 + 7 + 30)) - 50)
  assert.equal(dashboard.kpi.reorderCount, 1)
}

async function main() {
  testPureHelpers()
  testParsers()
  testDashboardRisk()
  await testServiceSync()
  console.log('seller-inventory smoke: ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
