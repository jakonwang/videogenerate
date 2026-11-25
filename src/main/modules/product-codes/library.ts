import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeProductCode } from '../../../shared/productCode'
import type { CodeImportPreview } from '../../../shared/productCodeStats'
import { getAppPaths } from '../../lib/paths'
import { productsRepo } from '../products/repo'
import type { Product, ProductType } from '../products/types'
import { productCodesService } from './service'
import { mergeRows, readCodeSheet, writeCodeSheet, type ExportRow, type SheetRow } from './sheet'

/** 款号表格和商品库之间的导入导出。 */

const pending = new Map<string, { file: string; rows: SheetRow[]; inShop: Map<string, string> }>()

/** 商品类型看店铺标题（越南语 / 中文 / 英文），看不出来就是通用 */
export function typeFromTitle(title: string): ProductType {
  const text = title.toLowerCase()
  if (/bông tai|khuyên tai|耳|earring/.test(text)) return 'earring'
  if (/dây chuyền|vòng cổ|项链|necklace/.test(text)) return 'necklace'
  if (/nhẫn|戒指|\bring\b/.test(text)) return 'ring'
  if (/vòng tay|lắc tay|手链|手镯|bracelet/.test(text)) return 'bracelet'
  if (/ốp|手机壳|phone case/.test(text)) return 'phone_case'
  return 'general'
}

export async function previewImport(file: string): Promise<CodeImportPreview> {
  const parsed = readCodeSheet(await readFile(file))
  const merged = mergeRows(parsed.rows)
  const { titles } = await productCodesService.storeTitles()
  const library = new Map<string, Product[]>()
  for (const item of await productsRepo.list()) {
    const code = normalizeProductCode(item.code)
    if (code) library.set(code, [...(library.get(code) || []), item])
  }
  // 只有编号、没图没类型、店里也没有的，是预留的空号，不建档
  const rows = merged.filter((row) => library.has(row.code) || row.image || row.hotType || titles.has(row.code))
  const token = randomUUID()
  pending.clear()
  pending.set(token, { file, rows, inShop: titles })
  const hotTypes = new Map<string, number>()
  for (const row of rows) if (row.hotType) hotTypes.set(row.hotType, (hotTypes.get(row.hotType) || 0) + 1)
  return {
    token,
    fileName: file.split(/[\\/]/).pop() || file,
    sheets: parsed.sheets,
    total: merged.length,
    create: rows.filter((row) => !library.has(row.code)).length,
    update: rows.filter((row) => library.has(row.code)).length,
    reserved: merged.length - rows.length,
    withImage: rows.filter((row) => row.image).length,
    inShop: rows.filter((row) => titles.has(row.code)).length,
    hotTypes: [...hotTypes].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    skipped: parsed.skipped.slice(0, 50),
    skippedCount: parsed.skipped.length,
  }
}

export async function applyImport(token: string): Promise<{ created: number; updated: number; failed: number }> {
  const job = pending.get(token)
  if (!job) throw new Error('IMPORT_EXPIRED')
  pending.delete(token)
  const db = join(getAppPaths().dbDir, 'products.json')
  // 导入前留一份商品库备份
  if (existsSync(db)) await copyFile(db, join(getAppPaths().dbDir, `products.before-import-${Date.now()}.json`))
  const temp = join(getAppPaths().dataDir, 'tmp', `code-import-${token}`)
  await mkdir(temp, { recursive: true })
  const result = { created: 0, updated: 0, failed: 0 }
  try {
    for (const row of job.rows) {
      try {
        const existing = (await productsRepo.list()).find((item) => normalizeProductCode(item.code) === row.code)
        const needImage = row.image && !(existing?.images?.length || existing?.coverImagePath)
        let images: Product['images'] | undefined
        if (needImage) {
          const path = join(temp, `${randomUUID()}.${row.image!.ext}`)
          await writeFile(path, row.image!.data)
          const now = Date.now()
          images = [{ id: randomUUID(), productId: existing?.id || '', filePath: path, fileName: `${row.code}.${row.image!.ext}`, fileSize: row.image!.data.length, createdAt: now, updatedAt: now, isCover: true }]
        }
        if (existing) {
          const hotType = row.hotType || existing.hotType
          if (!images && hotType === existing.hotType) continue
          await productsRepo.upsert({ id: existing.id, name: existing.name, type: existing.type, ...(hotType ? { hotType } : {}), ...(images ? { images } : {}) })
          result.updated += 1
        } else {
          await productsRepo.upsert({ name: row.code, code: row.code, type: typeFromTitle(job.inShop.get(row.code) || ''), ...(row.hotType ? { hotType: row.hotType } : {}), images: images || [], remark: '' })
          result.created += 1
        }
      } catch {
        result.failed += 1
      }
    }
    await productCodesService.remember(job.rows.map((row) => row.code))
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
  }
  return result
}

/** 新建一个带封面的商品 */
export async function saveWithImage(product: { name: string; code: string; type: ProductType; remark: string }, data?: Buffer): Promise<Product> {
  if (!data) return productsRepo.upsert({ ...product, images: [] })
  const temp = join(getAppPaths().dataDir, 'tmp', `code-archive-${randomUUID()}`)
  await mkdir(temp, { recursive: true })
  try {
    const { default: sharp } = await import('sharp')
    const path = join(temp, `${randomUUID()}.jpg`)
    const jpeg = await sharp(data).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer()
    await writeFile(path, jpeg)
    const now = Date.now()
    return await productsRepo.upsert({ ...product, images: [{ id: randomUUID(), productId: '', filePath: path, fileName: `${product.code}.jpg`, fileSize: jpeg.length, createdAt: now, updatedAt: now, isCover: true }] })
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function thumbnail(path: string) {
  try {
    const { default: sharp } = await import('sharp')
    return await sharp(path).rotate().resize(200, 200, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer()
  } catch {
    return undefined
  }
}

export async function exportCodes(): Promise<{ data: Buffer; count: number }> {
  const stats = new Map((await productCodesService.stats().catch(() => null))?.items.map((item) => [item.code, item]) || [])
  const rows: ExportRow[] = []
  const seen = new Set<string>()
  for (const item of await productsRepo.list()) {
    const code = normalizeProductCode(item.code)
    if (!code || seen.has(code)) continue
    seen.add(code)
    const cover = item.coverImagePath || item.images?.find((image) => image.isCover)?.filePath || item.images?.[0]?.filePath
    const own = stats.get(code)
    rows.push({ code, hotType: item.hotType || '', units30: own?.units30, stock: own?.stock, image: cover && existsSync(cover) ? await thumbnail(cover) : undefined })
  }
  return { data: writeCodeSheet(rows), count: rows.length }
}
