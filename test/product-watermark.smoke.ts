import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { productWatermarkService } from '../src/main/modules/product-watermark/service'

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'product-watermark-'))
  try {
    configureAppPathRuntime({ dataDir: join(dir, 'data') })
    const outputDir = join(dir, 'output'); await mkdir(outputDir, { recursive: true })
    const source = join(dir, 'source.png'); const template = join(dir, 'template.png')
    await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 220, g: 20, b: 20 } } }).png().toFile(source)
    await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.5 } } }).png().toFile(template)
    const saved = await productWatermarkService.saveTemplate({ filePath: template, name: 'Brand' })
    const result = await productWatermarkService.processBatch({ templateId: saved.id, sourcePaths: [source], outputDir })
    assert.equal(result.successCount, 1); assert.equal(result.failedCount, 0)
    const meta = await sharp(result.success[0]).metadata(); assert.equal(meta.width, 200); assert.equal(meta.height, 200); assert.equal(meta.channels, 3)
    await productWatermarkService.renameTemplate({ id: saved.id, name: 'Renamed' }); assert.equal((await productWatermarkService.listTemplates())[0].name, 'Renamed')
    await productWatermarkService.deleteTemplate(saved.id); assert.equal((await productWatermarkService.listTemplates()).length, 0)
    console.log('product-watermark smoke passed')
  } finally { await rm(dir, { recursive: true, force: true }) }
}
void main()
