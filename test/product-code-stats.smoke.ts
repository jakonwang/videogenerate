import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import * as XLSX from 'xlsx'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { suggestHotType } from '../src/shared/productCodeStats'
import { mergeRows, readCodeSheet, writeCodeSheet } from '../src/main/modules/product-codes/sheet'

const CFB = (XLSX as any).CFB

async function picture(color: string) {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: color } }).jpeg().toBuffer()
}

/** WPS / 金山表格的单元格图片 */
async function dispimgBook() {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['编号', '图片', '爆款类型'], ['D-10', '', '畅销款'], ['D-11', '', '']])
  XLSX.utils.book_append_sheet(book, sheet, 'D')
  const cfb = CFB.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const index = cfb.FullPaths.findIndex((item: string) => item.endsWith('xl/worksheets/sheet1.xml'))
  const xml = Buffer.from(cfb.FileIndex[index].content).toString('utf8').replace('</row><row r="3"', '<c r="F2" t="str"><f>_xlfn.DISPIMG(&quot;ID_AB12&quot;,1)</f><v>x</v></c></row><row r="3"')
  assert.ok(xml.includes('DISPIMG'))
  cfb.FileIndex[index].content = Buffer.from(xml)
  cfb.FileIndex[index].size = cfb.FileIndex[index].content.length
  CFB.utils.cfb_add(cfb, '/xl/cellimages.xml', Buffer.from('<etc:cellImages xmlns:etc="e" xmlns:xdr="x" xmlns:r="r" xmlns:a="a"><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="ID_AB12"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>'))
  CFB.utils.cfb_add(cfb, '/xl/_rels/cellimages.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Type="image" Target="media/image1.jpeg"/></Relationships>'))
  CFB.utils.cfb_add(cfb, '/xl/media/image1.jpeg', await picture('#00ff00'))
  return Buffer.from(CFB.write(cfb, { type: 'buffer', fileType: 'zip' }))
}

async function main() {
  // 爆款建议
  assert.equal(suggestHotType({ units30: 1174, units7: 200, unitsPrev7: 220, activeDays30: 26, share30: 0.063 }).suggestion, '大爆款')
  assert.equal(suggestHotType({ units30: 158, units7: 30, unitsPrev7: 30, activeDays30: 24, share30: 0.0085 }).suggestion, '畅销款')
  assert.equal(suggestHotType({ units30: 8, units7: 2, unitsPrev7: 3, activeDays30: 5, share30: 0.0004, verdict: 'potential' }).suggestion, '潜力款')
  assert.equal(suggestHotType({ units30: 400, units7: 400, unitsPrev7: 0, activeDays30: 2, share30: 0.2 }).suggestion, '潜力款')
  assert.equal(suggestHotType({ units30: 3, units7: 1, unitsPrev7: 1, activeDays30: 3, share30: 0 }).suggestion, undefined)

  // 导出后再导入：编号、类型、图片都对得上，按前缀分表
  const red = await picture('#ff0000')
  const blue = await picture('#0000ff')
  const book = writeCodeSheet([
    { code: 'A-10', hotType: '', image: blue },
    { code: 'A-2', hotType: '大爆款', units30: 12, stock: 5, image: red },
    { code: 'AA-1', hotType: '' },
    { code: 'E-3', hotType: '畅销款', image: blue },
  ])
  const back = readCodeSheet(book)
  assert.deepEqual(back.sheets, ['A', 'AA', 'E'])
  assert.deepEqual(back.rows.map((row) => [row.code, row.hotType, Boolean(row.image)]), [['A-2', '大爆款', true], ['A-10', '', true], ['AA-1', '', false], ['E-3', '畅销款', true]])
  assert.ok(back.rows[0].image!.data.equals(red))
  assert.ok(back.rows[1].image!.data.equals(blue))

  // WPS 单元格图片；重复款号合并；看不懂的编号跳过
  const wps = readCodeSheet(await dispimgBook())
  assert.deepEqual(wps.rows.map((row) => [row.code, Boolean(row.image)]), [['D-10', true], ['D-11', false]])
  const merged = mergeRows([{ sheet: 'A', row: 2, code: 'A-1', hotType: '' }, { sheet: '主推', row: 2, code: 'A-1', hotType: '畅销款' }])
  assert.deepEqual(merged.map((row) => row.hotType), ['畅销款'])
  const odd = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(odd, XLSX.utils.aoa_to_sheet([['编号'], ['59'], ['B-1']]), 'x')
  assert.equal(readCodeSheet(XLSX.write(odd, { type: 'buffer', bookType: 'xlsx' })).skipped.length, 1)

  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-code-stats-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { productsRepo } = await import('../src/main/modules/products/repo')
    const { productCodesService, setProductCodesTestDependencies } = await import('../src/main/modules/product-codes/service')
    const { applyImport, previewImport } = await import('../src/main/modules/product-codes/library')
    const { buildDashboard, SI_DEFAULT_SETTINGS, shiftDate } = await import('../src/shared/sellerInventory')
    const today = '2026-11-24'
    const sku = (shopKey: string, skuId: string, productName: string, sellerSku: string) => ({ id: `${shopKey}:${skuId}`, shopKey, productId: `p${skuId}`, skuId, productName, skuName: '', sellerSku, image: 'https://x/y.jpg', stockTotal: 50, stockAvailable: 50, updatedAt: 1 })
    // 标题 A-2、商家 SKU 写错成 A-9：按标题归到 A-2；只有 s1 上架
    const skus = [sku('s1', '1', 'Bông tai A-2', 'A-9'), sku('s1', '2', 'Nhẫn E-3', 'E-3'), sku('s2', '3', 'Nhẫn E-3', '')]
    const daily = Array.from({ length: 25 }, (_, index) => ({ shopKey: 's1', skuId: '1', date: shiftDate(today, -(index + 1)), units: 20, amount: 2000, orders: 20, sellerSku: 'A-9' }))
    daily.push({ shopKey: 's2', skuId: '3', date: shiftDate(today, -1), units: 4, amount: 400, orders: 4, sellerSku: '' })
    const build = (keys: string[], mappings: Map<string, string>) =>
      buildDashboard({ today, days: 31, shops: [], platformSkus: skus.filter((item) => keys.includes(item.shopKey)), daily: daily.filter((item) => keys.includes(item.shopKey)) as any, mappings, moves: [], skuSettings: [{ code: 'A-2', cost: 30, updatedAt: 1 }], settings: SI_DEFAULT_SETTINGS })
    setProductCodesTestDependencies({
      store: async () => ({ skus, mappings: new Map(), shopNames: new Map([['s1', 'Lumee'], ['s2', 'Arua']]) }),
      researchCodes: async () => [],
      live: async () => [],
      ads: async () => new Map([['p1', { spend: 100, revenue: 500, orders: 5, creatives: 2 }]]),
      fetchImage: async () => red,
      dataVersion: async () => 1,
      stats: async (codes) => ({ all: build(['s1', 's2'], codes), byShop: new Map([['s1', build(['s1'], codes)], ['s2', build(['s2'], codes)]]), cards: [], currency: 'VND', feeRates: new Map([['s1', 0.2]]) }),
    })
    const stats = await productCodesService.stats()
    const top = stats.items[0]
    assert.equal(top.code, 'A-2')
    assert.equal(top.units30, 500)
    assert.equal(top.suggestion, '大爆款')
    assert.deepEqual(stats.gaps.map((item) => [item.code, item.soldIn, item.missingIn]), [['A-2', 'Lumee', 'Arua']])
    const detail = await productCodesService.detail('a-2')
    assert.equal(detail?.profit30, 50000 * 0.8 - 30 * 500)
    assert.equal((await productCodesService.detail('E-3'))?.profit30, undefined)

    // 款号闭环：规则要有样本才下结论
    const { styleActions, styleBaseline, buildYield, priceBand } = await import('../src/shared/styleBoard')
    const liveOf = (code: string, exposures: number, clicks: number, carts: number, orders: number, gmv: number) => ({ code, sessions: 3, exposures, clicks, carts, measuredOrders: orders, measuredGmv: gmv, orders, buyers: orders, sales: orders, gmv, currency: 'VND', lastAt: 1, estimated: false })
    const base = styleBaseline([liveOf('X', 100000, 10000, 1000, 400, 400000)], [{ spend: 1000, revenue: 4000, orders: 40, creatives: 5 }])
    assert.deepEqual([base.liveCartRate, base.liveCartToOrder, base.adsRoi], [0.1, 0.4, 4])
    const row = (patch: object) => ({ code: 'X', name: '', units7: 0, unitsPrev7: 0, units30: 50, amount30: 1, suggestQty: 20, risk: 'healthy' as const, ...patch })
    const kinds = (patch: object) => styleActions(row(patch), base).map((item) => item.kind)
    assert.deepEqual(kinds({ live: liveOf('X', 2000, 200, 30, 20, 40000) }), ['makeVideo', 'livePush'])
    assert.deepEqual(kinds({ risk: 'urgent', stock: 2, daysLeft: 1.5, live: liveOf('X', 2000, 200, 30, 20, 40000) }), ['restock'])
    assert.deepEqual(kinds({ live: liveOf('X', 20000, 2000, 300, 30, 1) }), ['fixPrice'])
    assert.deepEqual(kinds({ live: liveOf('X', 20000, 2400, 100, 60, 1) }), ['fixDetail'])
    assert.deepEqual(kinds({ live: liveOf('X', 100, 20, 10, 4, 99999) }), [])
    assert.deepEqual(kinds({ ads: { spend: 900, revenue: 900, orders: 9, creatives: 2 } }), ['cutAds'])
    assert.deepEqual(kinds({ ads: { spend: 10, revenue: 1, orders: 0, creatives: 1 } }), [])
    const yieldRow = (patch: object) => ({ keyword: '耳环', source: 'douyin', currency: 'CNY', price: 15, candidate: true, kept: true, tested: false, ...patch })
    const yields = buildYield([yieldRow({ code: 'A-2' }), yieldRow({ code: 'A-2' }), yieldRow({ kept: false, candidate: false })], 'keyword', new Map([['A-2', { listed: true, units30: 9, amount30: 90, hot: true }]]))
    assert.deepEqual(yields.map((item) => [item.collected, item.kept, item.coded, item.listed, item.hot, item.units30]), [[3, 2, 1, 1, 1, 9]])
    assert.deepEqual([priceBand(9.9, 'CNY'), priceBand(10, 'CNY'), priceBand(200, 'CNY'), priceBand(undefined, 'CNY')], ['< 10 CNY', '10–20 CNY', '≥ 100 CNY', '—'])
    const board = await productCodesService.board()
    const a2 = board.items.find((item) => item.code === 'A-2')!
    assert.deepEqual([a2.ads, a2.missingIn, a2.actions.some((item) => item.kind === 'gap')], [{ spend: 100, revenue: 500, orders: 5, creatives: 2 }, 'Arua', true])
    assert.equal(board.notArchived, 2)

    // 一键建档：带款号和图片；再点一次不重复建
    const made = await productCodesService.archive('e-3')
    assert.deepEqual([made.created, made.image, (await productCodesService.archive('E-3')).created], [true, true, false])
    const archived = (await productsRepo.list()).find((item) => item.id === made.productId)!
    assert.deepEqual([archived.code, archived.type, existsSync(archived.images![0].filePath)], ['E-3', 'ring', true])
    assert.deepEqual((await productCodesService.linkedProducts()).find((item) => item.id === made.productId)?.tiktokProductIds, ['p2', 'p3'])
    await assert.rejects(() => productCodesService.archive('Z-9'), /NOT_LISTED/)
    await productsRepo.remove(made.productId)

    // 导入：已有商品只补图和类型；空号不建档；先备份
    const keep = await productsRepo.upsert({ name: '我的名字', type: 'earring', code: 'A-2' })
    const file = path.join(root, 'codes.xlsx')
    await writeFile(file, writeCodeSheet([{ code: 'A-2', hotType: '大爆款', image: red }, { code: 'E-3', hotType: '' }, { code: 'D-99', hotType: '' }, { code: 'B-1', hotType: '', image: blue }]))
    const preview = await previewImport(file)
    assert.deepEqual([preview.create, preview.update, preview.reserved, preview.withImage], [2, 1, 1, 2])
    assert.deepEqual(await applyImport(preview.token), { created: 2, updated: 1, failed: 0 })
    await assert.rejects(() => applyImport(preview.token), /IMPORT_EXPIRED/)
    const products = await productsRepo.list()
    const updated = products.find((item) => item.id === keep.id)!
    assert.equal(updated.name, '我的名字')
    assert.equal(updated.hotType, '大爆款')
    assert.ok(updated.images?.[0] && existsSync(updated.images[0].filePath))
    assert.equal(products.find((item) => item.code === 'E-3')?.type, 'ring')
    assert.ok(!products.some((item) => item.code === 'D-99'))
    assert.ok((await readdir(path.join(root, 'db'))).some((name) => name.startsWith('products.before-import-')))
    console.log('product code stats smoke: ok')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
