import type { Product } from '../products/types'

/**
 * 商品库：电脑端商品里 AI 生成的部分（商品分析、分析板、标准源图）↔ 云端同步记录。
 *
 * 名称、类型、备注、图片照旧放在 SyncProduct 明面上；这些 AI 结果放进 `desktop`，两张生成图（分析板、标准源图）
 * 作为云端文件放进 `desktopFiles`。网页的商品库是电脑端同一个页面（在服务器引擎上运行），在那里重新分析的结果要回到电脑，
 * 电脑上分析的结果也要到网页。
 *
 * 每一组按自己的更新时间合并，较新的一方生效：旧版桌面端会把收到的 desktop 原样回传（未知字段），较旧的结果不会盖掉较新的。
 * 分段素材（assets）是本机的视频文件，不同步。
 */

export type ProductFileKey = 'analysisBoardPath' | 'canonicalSourcePath'

type Group = { at: (p: Partial<Product>) => number; keys: Array<keyof Product>; file?: ProductFileKey }

export const PRODUCT_DESKTOP_GROUPS: Group[] = [
  {
    at: (p) => Number(p.analysisBoardUpdatedAt || 0),
    keys: ['analysisBoardStatus', 'analysisBoardPrompt', 'analysisBoardDiagnostics', 'analysisBoardUpdatedAt', 'analysisSourceSignature'],
    file: 'analysisBoardPath',
  },
  {
    at: (p) => Number(p.canonicalSourceUpdatedAt || 0),
    keys: ['canonicalSourceStatus', 'canonicalSourcePrompt', 'canonicalSourceDiagnostics', 'canonicalSourceUpdatedAt', 'canonicalSourceSourceSignature'],
    file: 'canonicalSourcePath',
  },
  { at: (p) => Number(p.productAnalysis?.updatedAt || 0), keys: ['productAnalysis'] },
]

/** 跟着最新一组走的零散设置 */
const LOOSE_KEYS: Array<keyof Product> = ['storyboardTemplateType']

/** 电脑端商品 → `desktop`（不含文件路径；文件另外上传） */
export function productDesktopFields(product: Product): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const group of PRODUCT_DESKTOP_GROUPS) for (const key of group.keys) if (product[key] !== undefined) out[key] = product[key]
  for (const key of LOOSE_KEYS) if (product[key] !== undefined) out[key] = product[key]
  return out
}

/** 需要上传的生成图（只上传最新一组里实际存在的） */
export function productDesktopFilePaths(product: Product): Partial<Record<ProductFileKey, string>> {
  const out: Partial<Record<ProductFileKey, string>> = {}
  for (const group of PRODUCT_DESKTOP_GROUPS) if (group.file && product[group.file]) out[group.file] = String(product[group.file])
  return out
}

/**
 * 云端带来的 `desktop` → 要写回本机商品的字段。`files` 是已经下载到本机的生成图路径。
 * 本机那一组更新（或一样新）就保留本机的，不写这一组。
 */
export function mergeProductDesktopFields(
  existing: Partial<Product> | undefined,
  incoming: Record<string, unknown> | undefined,
  files: Partial<Record<ProductFileKey, string>>,
): Partial<Product> {
  if (!incoming || typeof incoming !== 'object') return {}
  const remote = incoming as Partial<Product>
  const out: Partial<Product> = {}
  let newest = false
  for (const group of PRODUCT_DESKTOP_GROUPS) {
    const theirs = group.at(remote)
    if (!theirs || theirs <= group.at(existing ?? {})) continue
    newest = true
    for (const key of group.keys) (out as Record<string, unknown>)[key] = remote[key]
    if (group.file) out[group.file] = files[group.file]
  }
  if (newest || !existing) for (const key of LOOSE_KEYS) if (remote[key] !== undefined) (out as Record<string, unknown>)[key] = remote[key]
  return out
}
