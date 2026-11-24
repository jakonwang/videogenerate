/**
 * 款号：一个款式一个编号（如 A-152），把选品、商品库、店铺商品、订单和库存连在一起。
 * 设计见 docs/sku-linking-plan.md。这里是纯函数，主进程、页面和测试共用。
 */

/** 统一写法：全角转半角、转大写、连续空格合并。A-15 和 A-015 是两个款号，不互相转换。 */
export function normalizeProductCode(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[‐-―−]/g, '-')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

/** 款号要同时有字母和数字，可带 - _ . / + # & 符号；纯数字是平台编号或规格序号，不能当款号。 */
export function isValidProductCode(value: unknown): boolean {
  const code = normalizeProductCode(value)
  return code.length <= 80 && /^[\p{L}\p{N}][\p{L}\p{N}\-_./+#& ]*$/u.test(code) && /\p{L}/u.test(code) && /\p{N}/u.test(code)
}

const DEFAULT_TITLE_CODE = /^[A-Z]{1,4}-?\d{1,6}[A-Z]?$/

/**
 * 标题末尾的款号。已登记的款号支持任意符号组合，且取最长的一个；
 * 没登记的只认「字母 + 数字」（如 A-152）。必须是完整的一段，A-1 不会匹配到 A-152。
 */
export function codeFromTitle(title: unknown, known?: ReadonlySet<string>): string | undefined {
  const text = normalizeProductCode(title).replace(/[\s)\]}】）,.;:!，。；：！]+$/u, '')
  if (!text) return undefined
  const words = text.split(/[\s([{【（]+/u).filter(Boolean)
  if (known?.size) {
    const tail = text.split(' ')
    for (let size = Math.min(4, tail.length); size > 1; size -= 1) {
      const phrase = tail.slice(-size).join(' ')
      if (known.has(phrase)) return phrase
    }
  }
  const last = words[words.length - 1] || ''
  if (known?.has(last)) return last
  return DEFAULT_TITLE_CODE.test(last) ? last : undefined
}

export type CodeMatch = {
  code?: string
  via?: 'manual' | 'title' | 'sellerSku'
  /** 标题和商家 SKU 写的不是同一个款号 */
  conflict?: { title: string; sellerSku: string }
}

/**
 * 店铺的一个规格属于哪个款号：手工绑定 > 标题 > 商家 SKU。
 * 多规格商品的标题只有一个款号，规格自己写了款号时以规格为准。
 */
export function matchStoreSku(input: { title: string; sellerSku: string; singleSku: boolean; manual?: string; known?: ReadonlySet<string> }): CodeMatch {
  const title = codeFromTitle(input.title, input.known)
  const sellerSku = isValidProductCode(input.sellerSku) ? normalizeProductCode(input.sellerSku) : undefined
  const conflict = title && sellerSku && title !== sellerSku && input.singleSku ? { title, sellerSku } : undefined
  if (input.manual) return { code: normalizeProductCode(input.manual), via: 'manual' }
  if (!input.singleSku && sellerSku) return { code: sellerSku, via: 'sellerSku' }
  if (title) return { code: title, via: 'title', conflict }
  if (sellerSku) return { code: sellerSku, via: 'sellerSku' }
  return {}
}

const NUMBERED = /^([\p{L}]{1,6}-?)(\d{1,6})$/u

/** A-152 → { prefix: 'A-', number: 152 } */
export function splitCode(value: unknown): { prefix: string; number: number } | undefined {
  const match = NUMBERED.exec(normalizeProductCode(value))
  return match ? { prefix: match[1], number: Number(match[2]) } : undefined
}

/** 主号段的末号：偶尔跳到很远的特殊号（A-280 之后突然 A-1004）不算 */
function mainMax(numbers: number[]) {
  const sorted = [...numbers].sort((a, b) => a - b)
  let best = { last: sorted[0] || 0, size: 0 }
  let size = 0
  sorted.forEach((value, index) => {
    size = index && value - sorted[index - 1] > 100 ? 1 : size + 1
    if (size >= best.size) best = { last: value, size }
  })
  return best.last
}

/** 用过的前缀，主号段用到几号（last）和最大号（max），用得多的在前 */
export function codePrefixes(used: Iterable<string>): Array<{ prefix: string; last: number; max: number; count: number }> {
  const numbers = new Map<string, number[]>()
  for (const code of used) {
    const part = splitCode(code)
    if (part) numbers.set(part.prefix, [...(numbers.get(part.prefix) || []), part.number])
  }
  return [...numbers]
    .map(([prefix, list]) => ({ prefix, last: mainMax(list), max: Math.max(...list), count: list.length }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix))
}

/** 从指定款号开始往后编，跳过所有用过的号（包括停用的）。 */
export function nextCodes(start: string, count: number, used: Iterable<string>): string[] {
  const part = splitCode(start)
  if (!part) return []
  const taken = new Set([...used].map(normalizeProductCode))
  const out: string[] = []
  for (let number = Math.max(1, part.number); out.length < count && number < 1_000_000; number += 1) {
    const code = `${part.prefix}${number}`
    if (!taken.has(code)) out.push(code)
  }
  return out
}

/** 自然顺序：A-2 在 A-10 前 */
export function compareCodes(a: string, b: string) {
  return a.localeCompare(b, 'en', { numeric: true })
}

export type ProductCodeLink = {
  shopKey: string
  shopName: string
  productId: string
  title: string
  image?: string
  /** 这个款在该商品里的规格数 */
  skuCount: number
  /** 商品里还有别的款（浏览、点击只有商品级） */
  shared: boolean
  price?: number
  stock: number
  via: NonNullable<CodeMatch['via']>
}

export type ProductCodeOverview = {
  /** 商品库、店铺、选品里出现过的全部款号 */
  used: string[]
  prefixes: Array<{ prefix: string; last: number; max: number; count: number }>
  /** 没填款号、但名称就是款号的商品库商品 */
  suggestions: Array<{ productId: string; name: string; code: string; duplicate: boolean }>
  /** 同一款号在商品库有多个商品 */
  duplicates: Array<{ code: string; products: Array<{ id: string; name: string }> }>
  /** 标题和商家 SKU 不一致 */
  conflicts: Array<{ shopName: string; productId: string; title: string; titleCode: string; sellerSku: string; image?: string }>
  /** 店铺里没有任何款号的商品（含直播间通用链接） */
  unmatched: Array<{ shopName: string; productId: string; title: string; image?: string }>
  /** 商品库里填了款号、店铺还没有的 */
  notListed: string[]
  storeProducts: number
  matchedProducts: number
}
