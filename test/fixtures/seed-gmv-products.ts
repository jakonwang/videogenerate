/**
 * Adds catalog products with long real-world titles to a GMV MAX database already seeded by seed-gmv-v2.ts,
 * so table layouts can be checked against long names. Costs are left incomplete on purpose (no diagnosis impact).
 * Usage: tsx test/fixtures/seed-gmv-products.ts <dataDir>
 */
import { configureAppPathRuntime } from '../../src/main/lib/paths'

async function main() {
  const dataDir = process.argv[2]
  if (!dataDir) throw new Error('dataDir required')
  configureAppPathRuntime({ dataDir, userDataDir: dataDir })
  const { gmvMaxRepo } = await import('../../src/main/modules/tiktok-gmv-max/sqlite')
  const now = Date.now()
  const names = [
    '#13 Bông tai hoa đồng mạ bạc 925 cho nữ thiết kế độc lạ mẫu mới 2026 bán chạy phong cách cao cấp phụ kiện khuyên tai tinh tế A-152',
    '#02 Bông Tai Nữ Bạc Màu Hình Vuông Trắng Thanh Lịch, Khuyên Tai Khoen Tròn Đính Mặt Vuông Phong Cách Hàn Quốc A-267',
    '#11 Bông Tai Nữ Khoen Đính Đá Lấp Lánh, Thiết Kế Hoa Thanh Lịch, Phong Cách Hàn Quốc A-270',
    '耳环-主推 925 银针防过敏 气质百搭 小众设计 高级感 2026 新款',
    '#09 Bông Tai Nữ Hình Thoi Dạng Vòng, Phong Cách Hàn Quốc Thanh Lịch A-269',
    'Short name',
  ]
  const empty = { purchaseCost: '', firstMileCost: '', lastMileCost: '', warehousingCost: '', platformCommissionRate: '', creatorCommissionRate: '', expectedReturnRate: '', returnLossRate: '' }
  names.forEach((productName, index) => {
    gmvMaxRepo.saveProductCost({
      ...empty,
      id: `pc-${index}`,
      storeId: 'store-1',
      campaignId: index === 0 ? 'c-losing' : undefined,
      productId: `17339966518794340${index}0`,
      productName,
      categoryName: index % 2 ? undefined : 'Jewelry',
      inventory: String(100 + index * 7),
      skuCount: index + 1,
      sellingPrice: (10 + index * 3.25).toFixed(2),
      currency: 'USD',
      catalogStatus: index === 0 ? 'OCCUPIED' : 'UNOCCUPIED',
      catalogSyncedAt: now - index * 3600_000,
      updatedAt: now,
    })
  })
  console.log('seeded products')
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
