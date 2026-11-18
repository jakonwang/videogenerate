import type { TiktokListingCategory } from './tiktokListingPrompts'

/**
 * 上架助手导出店小秘 Excel：表头、各类目默认分类 id / 属性、每行的内容。电脑端和网页版共用。
 */

export type ListingExportCategoryConfig = { category: TiktokListingCategory; categoryId: string; productAttributes: string }

const RING_EXPORT_CONFIG: ListingExportCategoryConfig = {
  category: 'ring',
  categoryId: '605273',
  productAttributes:
    '[{"attributeId":"100347","attributeName":"S? l??ng tr?n m?i g?i","values":[{"valueId":"1000256","valueName":"1"}]},{"attributeId":"100392","attributeName":"D?p","values":[{"valueId":"1001082","valueName":"H?ng ng?y"}]},{"attributeId":"100445","attributeName":"Gi?i","values":[{"valueId":"1001452","valueName":"Phi gi?i t?nh"}]},{"attributeId":"100701","attributeName":"V?t li?u","values":[{"valueId":"1001475","valueName":"Ph? kim lo?i"}]},{"attributeId":"100757","attributeName":"Thi?t k?","values":[{"valueId":"1003618","valueName":"H?nh h?c"}]},{"attributeId":"101155","attributeName":"Ph? ki?n c?p ??i","values":[{"valueId":"1000059","valueName":"Kh?ng"}]},{"attributeId":"101157","attributeName":"B? nh?n","values":[{"valueId":"1000059","valueName":"Kh?ng"}]}]',
}

export const DEFAULT_LISTING_EXPORT_CONFIG: Record<TiktokListingCategory, ListingExportCategoryConfig> = {
  earring: {
    category: 'earring',
    categoryId: '605268',
    productAttributes:
      '[{"attributeId":"100392","attributeName":"D?p","values":[{"valueId":"1001532","valueName":"?i?m l?nh"}]},{"attributeId":"100347","attributeName":"S? l??ng tr?n m?i g?i","values":[{"valueId":"1000256","valueName":"1"}]},{"attributeId":"100462","attributeName":"Ki?u b?ng tai","values":[{"valueId":"1001168","valueName":"Thanh l?ch"}]},{"attributeId":"100461","attributeName":"Lo?i b?ng tai","values":[{"valueId":"1001538","valueName":"B?ng tai v?ng"}]},{"attributeId":"100445","attributeName":"Gi?i","values":[{"valueId":"1001450","valueName":"N?"}]},{"attributeId":"100701","attributeName":"V?t li?u","values":[{"valueId":"1001475","valueName":"Ph? kim lo?i"}]},{"attributeId":"100757","attributeName":"Thi?t k?","values":[{"valueId":"1001230","valueName":"Kim c??ng gi?"}]},{"attributeId":"101152","attributeName":"B? b?ng tai","values":[{"valueId":"1000059","valueName":"Kh?ng"}]}]',
  },
  ring: RING_EXPORT_CONFIG,
  necklace: { ...RING_EXPORT_CONFIG, category: 'necklace' },
  phone_case: { ...RING_EXPORT_CONFIG, category: 'phone_case' },
  bracelet: { ...RING_EXPORT_CONFIG, category: 'bracelet' },
}

export const LISTING_EXPORT_HEADERS = [
  '*分类id\n（必填）',
  '*产品标题\n（必填）',
  '*产品描述\n（必填）',
  '品牌',
  '产品属性',
  'SKU',
  '变种属性名称一',
  '变种属性值一',
  '变种属性名称二',
  '变种属性值二',
  '变种属性名称三',
  '变种属性值三',
  '识别码类型',
  '识别码',
  '*本地展示价(站点币种)\n（必填）',
  '*库存\n（必填）',
  '*产品主图(URL)地址\n（必填）',
  '附图一',
  '附图二',
  '附图三',
  '附图四',
  '附图五',
  '附图六',
  '附图七',
  '附图八',
  '视频链接',
  '尺码图',
  '变种主图1图片',
  '*重量(kg)\n（必填）',
  '*长(cm)\n（必填）',
  '*宽(cm)\n（必填）',
  '*高(cm)\n（必填）',
  '*仓库名称\n（必填）',
  '货到付款',
  '来源URL',
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeGeneratedTitle(title: string, sku: string) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim()
  const cleanSku = String(sku || '').replace(/\s+/g, ' ').trim()
  if (!cleanTitle || !cleanSku) return cleanTitle.slice(0, 200)

  const skuPattern = new RegExp(`(?:^|[\\s,.:;\\-\\[\\]()])${escapeRegExp(cleanSku)}(?=$|[\\s,.:;\\-\\[\\]()])`, 'gi')
  const stripped = cleanTitle
    .replace(skuPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-,:;]+$/g, '')

  const base = stripped || cleanTitle
  const normalized = base.toLowerCase().endsWith(cleanSku.toLowerCase()) ? base : `${base} ${cleanSku}`.trim()
  return normalized.slice(0, 200)
}

/** 产品描述：按顺序拼商品图的 <img> 标签（和电脑端一样） */
export function buildListingDescriptionFromUrls(urls: string[]) {
  const tags = urls.map((url) => String(url || '').trim()).filter(Boolean).map((url) => `<img src="${url}" />`)
  if (!tags.length) throw new Error('描述图片拼接失败')
  return tags.join('\n')
}

export type ListingExportInput = { category: TiktokListingCategory; title: string; description: string; sku: string; price: string; imageUrls: string[] }

/** 一行店小秘导入数据 */
export function buildListingExportRow(item: ListingExportInput, config: ListingExportCategoryConfig = DEFAULT_LISTING_EXPORT_CONFIG[item.category]) {
  return {
    '*分类id\n（必填）': config.categoryId,
    '*产品标题\n（必填）': item.title || '',
    '*产品描述\n（必填）': item.description || '',
    品牌: '无品牌',
    产品属性: config.productAttributes,
    SKU: item.sku,
    变种属性名称一: '',
    变种属性值一: '',
    变种属性名称二: '',
    变种属性值二: '',
    变种属性名称三: '',
    变种属性值三: '',
    识别码类型: '',
    识别码: '',
    '*本地展示价(站点币种)\n（必填）': item.price,
    '*库存\n（必填）': '45',
    '*产品主图(URL)地址\n（必填）': item.imageUrls[0] || '',
    附图一: item.imageUrls[1] || '',
    附图二: item.imageUrls[2] || '',
    附图三: item.imageUrls[3] || '',
    附图四: item.imageUrls[4] || '',
    附图五: '',
    附图六: '',
    附图七: '',
    附图八: '',
    视频链接: '',
    尺码图: '',
    变种主图1图片: '',
    '*重量(kg)\n（必填）': '0.001',
    '*长(cm)\n（必填）': '1',
    '*宽(cm)\n（必填）': '1',
    '*高(cm)\n（必填）': '1',
    '*仓库名称\n（必填）': 'Lys',
    货到付款: '是',
    来源URL: '',
  }
}

/** 用户保存的配置盖在默认配置上 */
export function mergeListingExportConfigs(saved: Array<Partial<ListingExportCategoryConfig>> = []): ListingExportCategoryConfig[] {
  const map = new Map<TiktokListingCategory, ListingExportCategoryConfig>()
  for (const category of Object.keys(DEFAULT_LISTING_EXPORT_CONFIG) as TiktokListingCategory[]) map.set(category, { ...DEFAULT_LISTING_EXPORT_CONFIG[category] })
  for (const config of saved) {
    if (!config?.category || !map.has(config.category)) continue
    map.set(config.category, { category: config.category, categoryId: String(config.categoryId || '').trim(), productAttributes: String(config.productAttributes || '').trim() })
  }
  return [...map.values()]
}
