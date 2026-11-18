import type { CloneProductType } from './types'

/**
 * Single source of truth for clone product categories.
 *
 * The category must come from the bound product (or an explicit user choice).
 * Free-text keyword inference is only a last resort for `general`, and it uses
 * whole-word matching so that words such as "wearing", "during", "studio",
 * "near" or colour names like "gold"/"silver" never flip a product into a
 * jewelry category.
 */
export const CLONE_PRODUCT_TYPES: readonly CloneProductType[] = [
  'earrings',
  'necklace',
  'ring',
  'bracelet',
  'phone_case',
  'clothes',
  'bag',
  'shoes',
  'toy',
  'general',
]

const PRODUCT_TYPE_ALIASES: Record<string, CloneProductType> = {
  earring: 'earrings',
  earrings: 'earrings',
  necklace: 'necklace',
  necklaces: 'necklace',
  ring: 'ring',
  rings: 'ring',
  bracelet: 'bracelet',
  bracelets: 'bracelet',
  phone_case: 'phone_case',
  phonecase: 'phone_case',
  'phone case': 'phone_case',
  clothes: 'clothes',
  clothing: 'clothes',
  bag: 'bag',
  bags: 'bag',
  shoes: 'shoes',
  shoe: 'shoes',
  toy: 'toy',
  toys: 'toy',
  general: 'general',
}

export function normalizeCloneProductType(value: unknown): CloneProductType {
  const key = String(value ?? '').trim().toLowerCase()
  return PRODUCT_TYPE_ALIASES[key] ?? 'general'
}

export function isJewelryProductType(value: unknown) {
  const type = normalizeCloneProductType(value)
  return type === 'earrings' || type === 'necklace' || type === 'ring' || type === 'bracelet'
}

const EARRING_TEXT_PATTERN = /\b(?:earrings?|ear[\s-]?(?:studs?|cuffs?|jewelry|jewellery))\b/i

// "ring light" is a lighting term, not a product.
const JEWELRY_TEXT_PATTERN =
  /\b(?:earrings?|ear[\s-]?(?:studs?|cuffs?|jewelry|jewellery)|necklaces?|pendants?|chokers?|bracelets?|bangles?|jewelry|jewellery|gemstones?|zircon|diamonds?)\b|\brings?\b(?!\s+lights?)/i

export function textMentionsEarrings(value: unknown) {
  return EARRING_TEXT_PATTERN.test(String(value ?? ''))
}

export function textMentionsJewelry(value: unknown) {
  return JEWELRY_TEXT_PATTERN.test(String(value ?? ''))
}

/**
 * Whether the product should be treated as earrings.
 * An explicit non-general category always wins over text.
 */
export function isEarringTarget(productType: unknown, ...texts: unknown[]) {
  const type = normalizeCloneProductType(productType)
  if (type === 'earrings') return true
  if (type !== 'general') return false
  return textMentionsEarrings(texts.map((item) => String(item ?? '')).join('\n'))
}

/**
 * Whether the product should be treated as jewelry.
 * An explicit non-general category always wins over text.
 */
export function isJewelryTarget(productType: unknown, ...texts: unknown[]) {
  const type = normalizeCloneProductType(productType)
  if (isJewelryProductType(type)) return true
  if (type !== 'general') return false
  // Callers sometimes pass the pseudo-type "jewelry" instead of a real category.
  return textMentionsJewelry([productType, ...texts].map((item) => String(item ?? '')).join('\n'))
}

/** Last-resort text inference, only meaningful when the category is `general`. */
export function inferCloneProductTypeFromText(value: unknown): CloneProductType {
  const text = String(value ?? '').toLowerCase()
  if (!text.trim()) return 'general'
  if (textMentionsEarrings(text)) return 'earrings'
  if (/\b(?:necklaces?|pendants?|chokers?)\b/.test(text)) return 'necklace'
  if (/\b(?:bracelets?|bangles?)\b/.test(text)) return 'bracelet'
  if (/\brings?\b(?!\s+lights?)/.test(text)) return 'ring'
  if (/\b(?:phone\s*cases?|mobile cases?|iphone cases?)\b/.test(text)) return 'phone_case'
  if (/\b(?:dress(?:es)?|shirts?|t-shirts?|hoodies?|jackets?|pants|skirts?|garments?|clothes|clothing)\b/.test(text)) return 'clothes'
  if (/\b(?:handbags?|tote bags?|backpacks?|bags?)\b/.test(text)) return 'bag'
  if (/\b(?:shoes?|sneakers?|boots?|sandals?|heels)\b/.test(text)) return 'shoes'
  if (/\b(?:toys?|figurines?|dolls?|plush(?:ies)?)\b/.test(text)) return 'toy'
  return 'general'
}
