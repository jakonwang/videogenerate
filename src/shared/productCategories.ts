/**
 * 商品分类（商品库、图生图、上架助手，三端共用）：常用分类 + 用户自己填的分类。
 * 常用分类存英文 key（各处提示词按 key 认），自己填的直接存文字。
 */
export const BUILTIN_PRODUCT_CATEGORIES = ['phone_case', 'earring', 'necklace', 'ring', 'bracelet', 'clothes', 'bag', 'shoes', 'toy', 'general'] as const
export type BuiltinProductCategory = (typeof BUILTIN_PRODUCT_CATEGORIES)[number]
/** 保留常用分类的代码提示，同时允许任意文字 */
export type ProductCategory = BuiltinProductCategory | (string & {})

export const MAX_PRODUCT_CATEGORY_LENGTH = 30

const LABELS: Record<'zh-CN' | 'en-US' | 'vi-VN', Record<BuiltinProductCategory, string>> = {
  'zh-CN': { phone_case: '手机壳', earring: '耳饰', necklace: '项链', ring: '戒指', bracelet: '手链', clothes: '服装', bag: '包袋', shoes: '鞋子', toy: '玩具', general: '通用' },
  'en-US': { phone_case: 'Phone case', earring: 'Earrings', necklace: 'Necklace', ring: 'Ring', bracelet: 'Bracelet', clothes: 'Clothing', bag: 'Bag', shoes: 'Shoes', toy: 'Toy', general: 'General' },
  'vi-VN': { phone_case: 'Ốp điện thoại', earring: 'Bông tai', necklace: 'Dây chuyền', ring: 'Nhẫn', bracelet: 'Vòng tay', clothes: 'Quần áo', bag: 'Túi', shoes: 'Giày', toy: 'Đồ chơi', general: 'Chung' },
}

export const isBuiltinProductCategory = (value: unknown): value is BuiltinProductCategory => BUILTIN_PRODUCT_CATEGORIES.includes(value as BuiltinProductCategory)

/** 整理成能存的分类；填的是常用分类的名字就换成对应的 key，空的返回 '' */
export function normalizeProductCategory(value: unknown): ProductCategory {
  const text = String(value ?? '')
    // 分类会出现在导出的文件名里
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PRODUCT_CATEGORY_LENGTH)
    .trim()
  const lower = text.toLowerCase()
  // all 是筛选里的「全部」
  if (!text || lower === 'all') return ''
  return BUILTIN_PRODUCT_CATEGORIES.find((key) => key === lower || Object.values(LABELS).some((labels) => labels[key].toLowerCase() === lower)) ?? text
}

export function productCategoryLabel(value: unknown, locale = 'zh-CN'): string {
  const labels = LABELS[locale as keyof typeof LABELS] ?? LABELS['en-US']
  return isBuiltinProductCategory(value) ? labels[value] : String(value || '') || labels.general
}

/** 下拉里列哪些：常用的在前，后面是用过的自定义分类 */
export function productCategoryOptions(used: unknown[] = []): ProductCategory[] {
  const custom = used.map(normalizeProductCategory).filter((item) => item && !isBuiltinProductCategory(item))
  return [...BUILTIN_PRODUCT_CATEGORIES.filter((item) => item !== 'general'), ...new Set(custom), 'general']
}

/** 写进英文提示词的叫法 */
export function productCategoryPromptName(value: unknown): string {
  if (!value || value === 'general') return 'product'
  return isBuiltinProductCategory(value) ? LABELS['en-US'][value].toLowerCase() : String(value)
}
