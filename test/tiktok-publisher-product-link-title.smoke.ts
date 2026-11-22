import assert from 'node:assert/strict'
import { buildProductLinkTitle } from '../src/shared/productLinkTitle'

const chineseTitle = '\u5929\u7136\u4fdd\u6e7f\u9762\u971c\u654f\u611f\u808c\u9002\u7528\u8865\u6c34\u6ecb\u6da6\u65e5\u591c\u62a4\u7406\u5957\u88c5'
assert.equal(buildProductLinkTitle({ productTitle: chineseTitle }), chineseTitle)

const longTitle = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
assert.equal(buildProductLinkTitle({ productTitle: longTitle }), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234')

assert.equal(
  buildProductLinkTitle({ productTitle: 'Portable Fan - USB-C! Summer Deal' }),
  'Portable Fan USB C Summer Deal',
)

assert.equal(
  buildProductLinkTitle({ productLinkTitle: 'Custom Anchor', productTitle: 'Original Product Title' }),
  'Custom Anchor',
)

assert.equal(buildProductLinkTitle({ productTitle: 'https://example.com/item' }), '')

// Never cut mid-word: "…đính đá" cut to "…đính đ" was rejected by TikTok as offensive.
assert.equal(
  buildProductLinkTitle({ productTitle: '#45 Khuyên tai vòng bướm đính đá phong cách ins lạnh lùng cá tính cho nữ A-264' }),
  'Khuyên tai vòng đính đá phong',
)
assert.equal(
  buildProductLinkTitle({ productTitle: 'Dây chuyền nữ họa tiết cành hoa lúa tua rua, thiết kế độc đáo' }),
  'Dây chuyền nữ họa tiết cành',
)
// No lone trailing letter.
assert.equal(buildProductLinkTitle({ productTitle: 'Bông tai bạc nữ kiểu mới cho A B 264 xinh' }), 'Bông tai bạc nữ kiểu mới cho')
// A title that is only a code keeps it.
assert.equal(buildProductLinkTitle({ productTitle: '#45' }), '45')
for (const title of ['#45 Khuyên tai vòng bướm đính đá phong cách', 'Dây chuyền nữ họa tiết cành hoa lúa tua rua']) {
  assert.ok(Array.from(buildProductLinkTitle({ productTitle: title })).length <= 30)
}

// "bướm" is slang TikTok flags; auto titles drop it, a typed title is kept as typed.
assert.equal(buildProductLinkTitle({ productTitle: 'Bướm bạc' }), 'bạc')
assert.equal(buildProductLinkTitle({ productLinkTitle: 'Khuyên tai bướm', productTitle: 'x' }), 'Khuyên tai bướm')

console.log('tiktok publisher product link title smoke test passed')
