import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { codeFromTitle, codePrefixes, isValidProductCode, matchStoreSku, nextCodes, normalizeProductCode } from '../src/shared/productCode'

async function main() {
  // 写法统一
  assert.equal(normalizeProductCode(' ａ－152 '), 'A-152')
  assert.equal(normalizeProductCode('a–152'), 'A-152')
  for (const code of ['A-1', 'AA-3', 'A-4-1', 'B_2/X']) assert.ok(isValidProductCode(code), code)
  for (const code of ['', '59', '1731512450885322390', 'ABC', '耳环', '#14']) assert.equal(isValidProductCode(code), false, code)

  // 标题
  assert.equal(codeFromTitle('#25 Bông tai vòng lấp lánh cho nữ A-235'), 'A-235')
  assert.equal(codeFromTitle('Bông tai （a-152）'), 'A-152')
  assert.equal(codeFromTitle('Bông tai A-152.'), 'A-152')
  assert.equal(codeFromTitle('Khuyên Tai Đinh Tai Sụn, Size 3mm 4mm 5mm'), undefined)
  assert.equal(codeFromTitle('Chọn Mẫu Trên Livestream'), undefined)
  assert.equal(codeFromTitle('Bông tai A-152', new Set(['A-1'])), 'A-152')
  assert.equal(codeFromTitle('Bông tai A-4-1'), undefined)
  assert.equal(codeFromTitle('Bông tai A-4-1', new Set(['A-4-1', 'A-4'])), 'A-4-1')

  // 店铺规格
  const single = { singleSku: true }
  assert.deepEqual(matchStoreSku({ ...single, title: 'X A-257', sellerSku: 'A-275' }), { code: 'A-257', via: 'title', conflict: { title: 'A-257', sellerSku: 'A-275' } })
  assert.equal(matchStoreSku({ ...single, title: 'X A-257', sellerSku: 'A-275', manual: 'a-9' }).code, 'A-9')
  assert.equal(matchStoreSku({ ...single, title: 'no code here', sellerSku: 'd-15' }).code, 'D-15')
  assert.equal(matchStoreSku({ ...single, title: 'no code here', sellerSku: '59' }).code, undefined)
  assert.equal(matchStoreSku({ singleSku: false, title: 'X A-1', sellerSku: 'A-2' }).code, 'A-2')

  // 编号
  assert.deepEqual(nextCodes('a-152', 2, ['A-9', 'A-152', 'A-154', 'B-3']), ['A-153', 'A-155'])
  assert.deepEqual(nextCodes('K-1', 1, []), ['K-1'])
  assert.deepEqual(codePrefixes(['A-1', 'A-7', 'AA-3', 'A-4-1']).map((item) => [item.prefix, item.max]), [['A-', 7], ['AA-', 3]])
  assert.equal(codePrefixes([1, 2, 3, 80, 150, 1004].map((n) => `A-${n}`))[0].last, 150)

  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-product-codes-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { productsRepo } = await import('../src/main/modules/products/repo')
    const { productCodesService, setProductCodesTestDependencies } = await import('../src/main/modules/product-codes/service')
    const sku = (shopKey: string, productId: string, skuId: string, productName: string, sellerSku: string) => ({ id: `${shopKey}:${skuId}`, shopKey, productId, skuId, productName, skuName: '', sellerSku, stockTotal: 5, stockAvailable: 5, updatedAt: 1 })
    setProductCodesTestDependencies({
      store: async () => ({
        skus: [
          sku('s1', 'p1', 'k1', 'Bông tai A-36', 'A-36'),
          sku('s2', 'p2', 'k2', 'Bông tai A-36', ''),
          sku('s1', 'p3', 'k3', 'Set', 'A-36'),
          sku('s1', 'p3', 'k4', 'Set', 'E-1'),
          sku('s1', 'p4', 'k5', 'Chọn Mẫu Trên Livestream', '59'),
          sku('s1', 'p5', 'k6', 'X A-257', 'A-275'),
        ],
        mappings: new Map(),
        shopNames: new Map([['s1', 'Lumee'], ['s2', 'Arua']]),
      }),
      researchCodes: async () => ['A-400'],
    })
    const a = await productsRepo.upsert({ name: 'A-36', type: 'earring' })
    const b = await productsRepo.upsert({ name: 'a-36', type: 'earring' })
    const c = await productsRepo.upsert({ name: 'D-12', type: 'necklace' })
    await productsRepo.upsert({ name: '#14', type: 'earring' })

    let view = await productCodesService.overview()
    assert.equal(view.storeProducts, 5)
    assert.equal(view.matchedProducts, 4)
    assert.deepEqual(view.unmatched.map((item) => item.productId), ['p4'])
    assert.deepEqual(view.conflicts.map((item) => [item.titleCode, item.sellerSku]), [['A-257', 'A-275']])
    assert.equal(view.suggestions.length, 3)
    assert.equal(view.suggestions.filter((item) => item.duplicate).length, 2)

    // 迁移只处理不重复的
    assert.deepEqual(await productCodesService.applySuggestions(), { applied: 1, skipped: 2 })
    assert.equal((await productsRepo.list()).find((item) => item.id === c.id)?.code, 'D-12')

    // 唯一性：格式错、被占用报错；自己重存不报错
    await productsRepo.upsert({ id: a.id, name: a.name, type: a.type, code: await productCodesService.prepare('a-36', a.id) })
    await assert.rejects(() => productCodesService.prepare('A-36', b.id), /PRODUCT_CODE_TAKEN/)
    await assert.rejects(() => productCodesService.prepare('59', b.id), /PRODUCT_CODE_INVALID/)
    assert.equal(await productCodesService.prepare('A-36', a.id), 'A-36')

    // 其他编辑不会弄丢款号；跨店合并；多款商品标注共用
    await productsRepo.upsert({ id: a.id, name: '改名', type: 'earring' })
    assert.equal((await productsRepo.list()).find((item) => item.id === a.id)?.code, 'A-36')
    const links = await productCodesService.links('a-36')
    assert.deepEqual(links.map((item) => [item.shopName, item.productId, item.shared]), [['Lumee', 'p1', false], ['Arua', 'p2', false], ['Lumee', 'p3', true]])
    assert.deepEqual((await productCodesService.storeProductIds()).get('A-36'), ['p1', 'p2'])

    // 编号接着全局最大号；删掉的商品不会让号被重新用
    assert.deepEqual(await productCodesService.next({ start: 'A-400' }), ['A-401'])
    const gone = await productsRepo.upsert({ name: 'x', type: 'ring', code: 'D-50' })
    await productCodesService.remember(['D-50'])
    await productsRepo.remove(gone.id)
    assert.deepEqual(await productCodesService.next({ start: 'D-50' }), ['D-51'])
    view = await productCodesService.overview()
    assert.ok(view.notListed.includes('D-12'))
    console.log('product codes smoke: ok')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
