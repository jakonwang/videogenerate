import assert from 'node:assert/strict'
import { normalizeProductCategory, productCategoryLabel, productCategoryOptions, productCategoryPromptName } from '../src/shared/productCategories'
import { buildListingExportRow, mergeListingExportConfigs } from '../src/shared/tiktokListingExport'
import { buildTiktokListingDescriptionPrompt, buildTiktokListingImagePrompt, buildTiktokListingTitlePrompt } from '../src/shared/tiktokListingPrompts'

assert.equal(normalizeProductCategory('  发夹 / 头饰 '), '发夹 头饰')
assert.equal(normalizeProductCategory('项链'), 'necklace')
assert.equal(normalizeProductCategory('Phone Case'), 'phone_case')
assert.equal(normalizeProductCategory(''), '')
assert.equal(normalizeProductCategory('all'), '')
assert.equal(normalizeProductCategory('长'.repeat(50)).length, 30)
assert.deepEqual(productCategoryOptions(['发夹', 'ring', '发夹', '']).slice(-2), ['发夹', 'general'])
assert.deepEqual([productCategoryLabel('earring'), productCategoryLabel('发夹'), productCategoryLabel('', 'en-US')], ['耳饰', '发夹', 'General'])
assert.deepEqual([productCategoryPromptName('phone_case'), productCategoryPromptName('general'), productCategoryPromptName('发夹')], ['phone case', 'product', '发夹'])

// 自定义分类走通用模板，不混进首饰的说法
for (const index of [0, 1, 4]) {
  const prompt = buildTiktokListingImagePrompt({ category: '发夹', index, anchorMode: 'source_plus_hero' })
  assert.match(prompt, /发夹/)
  assert.doesNotMatch(prompt, /earring|necklace|undefined/)
}
for (const build of [buildTiktokListingTitlePrompt, buildTiktokListingDescriptionPrompt]) assert.doesNotMatch(build({ category: 'clothes', language: 'zh-CN', sku: 'A1' }), /undefined|jewelry/)

// 导出：自定义分类要先填分类 id，填过就保留
const item = { category: '发夹', title: 't', description: 'd', sku: 's', price: '1', imageUrls: ['u'] }
assert.throws(() => buildListingExportRow(item), /发夹.*分类 id/)
const config = mergeListingExportConfigs([{ category: '发夹', categoryId: '123', productAttributes: '' }]).find((row) => row.category === '发夹')!
assert.equal(buildListingExportRow(item, config)['*分类id\n（必填）'], '123')
assert.equal(buildListingExportRow({ ...item, category: 'ring' })['*分类id\n（必填）'], '605273')
console.log('product categories smoke ok')
