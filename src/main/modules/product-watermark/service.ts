import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { getAppPaths } from '../../lib/paths'

export type WatermarkTemplate = { id: string; name: string; filePath: string; width: number; height: number; createdAt: number; updatedAt: number }
type Store = { templates: WatermarkTemplate[] }

const root = () => join(getAppPaths().dataDir, 'product-watermark')
const templateDir = () => join(root(), 'templates')
const metadataPath = () => join(root(), 'templates.json')

async function readStore(): Promise<Store> {
  try { const value = JSON.parse(await readFile(metadataPath(), 'utf8')); return { templates: Array.isArray(value?.templates) ? value.templates : [] } }
  catch { return { templates: [] } }
}
async function writeStore(store: Store) { await mkdir(root(), { recursive: true }); await writeFile(metadataPath(), JSON.stringify(store, null, 2), 'utf8') }
async function validateTemplate(filePath: string) {
  const ext = extname(filePath).toLowerCase()
  if (!['.png', '.webp'].includes(ext)) throw new Error('Watermark template must be PNG or WebP.')
  const image = sharp(filePath)
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height || metadata.width !== metadata.height) throw new Error('Watermark template must be square.')
  if (!metadata.hasAlpha) throw new Error('Watermark template must contain transparency.')
  return { width: metadata.width, height: metadata.height }
}
function safeName(name: string) { return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'watermark' }

export const productWatermarkService = {
  async listTemplates() { return (await readStore()).templates },
  async saveTemplate(input: { filePath: string; name: string }) {
    const source = String(input?.filePath || '')
    const dimensions = await validateTemplate(source)
    await mkdir(templateDir(), { recursive: true })
    const id = randomUUID()
    const target = join(templateDir(), `${id}${extname(source).toLowerCase()}`)
    await copyFile(source, target)
    const now = Date.now(); const item = { id, name: safeName(String(input?.name || '')), filePath: target, ...dimensions, createdAt: now, updatedAt: now }
    const store = await readStore(); store.templates.unshift(item); await writeStore(store); return item
  },
  async renameTemplate(input: { id: string; name: string }) {
    const store = await readStore(); const item = store.templates.find((entry) => entry.id === input?.id)
    if (!item) throw new Error('Template not found.')
    item.name = safeName(String(input?.name || '')); item.updatedAt = Date.now(); await writeStore(store); return item
  },
  async deleteTemplate(id: string) {
    const store = await readStore(); const index = store.templates.findIndex((entry) => entry.id === id)
    if (index < 0) throw new Error('Template not found.')
    const [item] = store.templates.splice(index, 1); await rm(item.filePath, { force: true }); await writeStore(store); return { ok: true }
  },
  async processBatch(input: { templateId: string; sourcePaths: string[]; outputDir: string }) {
    const store = await readStore(); const template = store.templates.find((entry) => entry.id === input?.templateId)
    if (!template) throw new Error('Please select a watermark template.')
    if (!input?.outputDir) throw new Error('Please select an output directory.')
    await mkdir(input.outputDir, { recursive: true }); const success: string[] = []; const failed: Array<{ name: string; reason: string }> = []
    for (const source of Array.isArray(input.sourcePaths) ? input.sourcePaths : []) {
      try {
        const meta = await sharp(source).rotate().metadata(); const size = Math.min(meta.width || 0, meta.height || 0)
        if (!size) throw new Error('Unable to decode image.')
        const watermarkBuffer = await sharp(template.filePath).resize(size, size, { fit: 'fill' }).ensureAlpha().png().toBuffer()
        const output = await sharp(source).rotate().resize(size, size, { fit: 'cover', position: 'centre' }).flatten({ background: '#ffffff' }).removeAlpha().toColourspace('srgb')
          .composite([{ input: watermarkBuffer, left: 0, top: 0, blend: 'over' }])
          .jpeg({ quality: 92 }).toBuffer()
        const stem = basename(source, extname(source)); let target = join(input.outputDir, `${stem}-watermarked.jpg`); let index = 2
        while (true) { try { await readFile(target); target = join(input.outputDir, `${stem}-watermarked-${index++}.jpg`) } catch { break } }
        await writeFile(target, output); success.push(target)
      } catch (error) { failed.push({ name: basename(source), reason: error instanceof Error ? error.message : String(error) }) }
    }
    return { successCount: success.length, failedCount: failed.length, success, failed }
  },
}
