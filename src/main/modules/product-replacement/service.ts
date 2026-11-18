import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import sharp from 'sharp'
import { productsRepo } from '../products/repo'
import { cloneRepo } from '../clone/repo'
import { resolveApifoxHubCredentials } from '../clone/apifoxProfile'
import { hasStrictImageEditProviderCredential } from '../clone/gptImage'
import { generateGptShotFrameImage } from '../clone/gptImage'
import { assetLibraryService } from '../asset-library/service'
import { PRODUCT_REPLACEMENT_PROMPT } from '../../../shared/productReplacementPrompt'
import type { ProductReplacementBatch, ProductReplacementItem, ProductReplacementPromptVersion } from './types'

const DEFAULT_PROMPT = PRODUCT_REPLACEMENT_PROMPT
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const MAX_PROMPT_LENGTH = 20000

function root() { return join(getAppPaths().dataDir, 'product-replacement') }
function batchesPath() { return join(getAppPaths().dbDir, 'product-replacement-batches.json') }
function promptsPath() { return join(getAppPaths().dbDir, 'product-replacement-prompts.json') }
function hashPrompt(prompt: string) { return createHash('sha256').update(prompt).digest('hex') }
function normalizePrompt(item: ProductReplacementPromptVersion): ProductReplacementPromptVersion {
  return { ...item, promptHash: hashPrompt(item.prompt) }
}

let workerRunning = false

async function readBatches(): Promise<ProductReplacementBatch[]> {
  return await readJsonFile(batchesPath(), [] as ProductReplacementBatch[])
}
async function saveBatch(batch: ProductReplacementBatch) {
  const all = await readBatches()
  const index = all.findIndex((item) => item.id === batch.id)
  if (index >= 0) all[index] = batch
  else all.unshift(batch)
  batch.updatedAt = Date.now()
  await writeJsonFile(batchesPath(), all)
}
async function listPrompts() {
  const db = await readJsonFile(promptsPath(), { versions: [] as ProductReplacementPromptVersion[] })
  if (db.versions.length) return db.versions.map(normalizePrompt).sort((a, b) => b.version - a.version)
  const timestamp = Date.now()
  const seed: ProductReplacementPromptVersion = {
    id: randomUUID(), name: 'Basic Product Replacement', version: 1, prompt: DEFAULT_PROMPT,
    promptHash: hashPrompt(DEFAULT_PROMPT), active: true, createdAt: timestamp, updatedAt: timestamp,
  }
  await writeJsonFile(promptsPath(), { versions: [seed] })
  return [seed]
}
async function savePrompts(versions: ProductReplacementPromptVersion[]) {
  await writeJsonFile(promptsPath(), { versions })
}
function summarize(batch: ProductReplacementBatch): ProductReplacementBatch {
  const items = batch.items
  if (batch.status === 'paused' || batch.status === 'cancelled') return batch
  const completed = items.filter((item) => item.status === 'completed').length
  const failed = items.filter((item) => item.status === 'failed').length
  const queued = items.some((item) => item.status === 'queued' || item.status === 'processing')
  batch.status = queued ? (items.some((item) => item.status === 'processing') ? 'processing' : 'queued')
    : failed === items.length ? 'failed' : failed ? 'partial_failed' : completed ? 'completed' : 'queued'
  return batch
}

async function processQueue() {
  if (workerRunning) return
  workerRunning = true
  try {
    while (true) {
      const batches = await readBatches()
      const batch = batches.find((item) => item.status !== 'paused' && item.status !== 'cancelled' && item.items.some((entry) => entry.status === 'queued'))
      if (!batch) break
      const item = batch.items.find((entry) => entry.status === 'queued')!
      const key = `${batch.id}:${item.id}`
      item.status = 'processing'
      item.updatedAt = Date.now()
      summarize(batch)
      await saveBatch(batch)
      let outputPath = ''
      let assetId = ''
      let failure = ''
      try {
        const credentials = await cloneRepo.getCredentials()
        assetLibraryService.setQiniuCredentials(credentials)
        outputPath = await generateGptShotFrameImage({
          credentials,
          prompt: batch.prompt,
          negativePrompt: '',
          imagePaths: [item.sourcePath, ...batch.productImagePaths],
          outDir: join(root(), batch.id, 'outputs'),
          filePrefix: `${item.id}_v${item.variantIndex}`,
          normalizeOutput: 'preserve',
        })
        const imported = await assetLibraryService.importFile(outputPath, 'desktop', `${basename(item.sourceName, extname(item.sourceName))}_replacement_${item.variantIndex}${extname(outputPath) || '.png'}`)
        assetId = imported.id
        await assetLibraryService.updateUsageStatus(imported.id, 'product-replacement', 'used')
      } catch (error) {
        failure = String((error as Error)?.message || error)
      } finally {
        const latest = (await readBatches()).find((entry) => entry.id === batch.id)
        if (latest) {
          const current = latest.items.find((entry) => entry.id === item.id)
          if (current) {
            current.status = failure ? 'failed' : 'completed'
            current.outputPath = outputPath || undefined
            current.assetId = assetId || undefined
            current.error = failure || undefined
            current.updatedAt = Date.now()
          }
          summarize(latest)
          await saveBatch(latest)
        }
      }
    }
  } finally {
    workerRunning = false
    const remaining = (await readBatches()).some((item) => item.status !== 'paused' && item.status !== 'cancelled' && item.items.some((entry) => entry.status === 'queued'))
    if (remaining) queueMicrotask(() => { void processQueue() })
  }
}

export const productReplacementService = {
  async listProducts() {
    return (await productsRepo.list()).map((product) => ({
      id: product.id, name: product.name, coverImagePath: product.coverImagePath,
      images: (product.images || []).map((image) => ({ filePath: image.filePath, fileName: image.fileName })),
    }))
  },
  async importImages(paths: string[]) {
    const target = join(root(), 'inputs')
    await mkdir(target, { recursive: true })
    const result: Array<{ path: string; name: string }> = []
    for (const source of paths) {
      const extension = extname(source).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(extension)) continue
      const info = await stat(source)
      if (!info.isFile() || !info.size || info.size > 100 * 1024 * 1024) continue
      const destination = join(target, `${randomUUID()}${extension}`)
      await copyFile(source, destination)
      result.push({ path: destination, name: basename(source) })
    }
    return result
  },
  async listBatches() { return await readBatches() },
  async listPromptVersions() { return await listPrompts() },
  async savePromptVersion(input: { id?: string; name?: string; prompt: string }) {
    const prompt = String(input.prompt || '').trim()
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) throw new Error('Prompt must contain 1 to 20000 characters.')
    const versions = await listPrompts()
    const old = versions.find((item) => item.id === input.id)
    const timestamp = Date.now()
    const item: ProductReplacementPromptVersion = {
      id: old?.id || randomUUID(), name: String(input.name || '').trim() || old?.name || `Prompt V${Math.max(0, ...versions.map((row) => row.version)) + 1}`,
      version: old?.version || Math.max(0, ...versions.map((row) => row.version)) + 1,
      prompt, promptHash: hashPrompt(prompt), active: old?.active || false, createdAt: old?.createdAt || timestamp, updatedAt: timestamp,
    }
    await savePrompts([item, ...versions.filter((row) => row.id !== item.id)])
    return item
  },
  async activatePromptVersion(id: string) {
    const versions = await listPrompts()
    if (!versions.some((item) => item.id === id)) throw new Error('Prompt version does not exist.')
    const next = versions.map((item) => ({ ...item, active: item.id === id, updatedAt: item.id === id ? Date.now() : item.updatedAt }))
    await savePrompts(next)
    return next.find((item) => item.id === id)
  },
  async rollbackPromptVersion(id: string) {
    const source = (await listPrompts()).find((item) => item.id === id)
    if (!source) throw new Error('Prompt version does not exist.')
    const copy = await this.savePromptVersion({ name: `${source.name} Rollback`, prompt: source.prompt })
    return await this.activatePromptVersion(copy.id)
  },
  async createBatch(input: { productId?: string; productName: string; productImagePaths: string[]; sourceImages: Array<{ path: string; name: string }>; variantCount: number; promptVersionId?: string }) {
    const imagePaths = [...new Set(input.productImagePaths.map((path) => String(path || '').trim()).filter(Boolean))].slice(0, 4)
    if (!imagePaths.length) throw new Error('Select at least one product reference image.')
    if (!input.sourceImages.length) throw new Error('Select at least one scene image.')
    const prompts = await listPrompts()
    const promptVersion = prompts.find((item) => item.id === input.promptVersionId) || prompts.find((item) => item.active) || prompts[0]
    if (!promptVersion) throw new Error('No prompt version is available.')
    const count = Math.max(1, Math.min(4, Math.floor(Number(input.variantCount) || 1)))
    const credentials = await cloneRepo.getCredentials()
    const provider = String(credentials.imageProviderPrimary || 'openai')
    const configuredProvider = provider as 'openai' | 'kling' | 'grsai' | 'apifox_hub'
    if (!hasStrictImageEditProviderCredential(credentials, configuredProvider) && !(credentials.allowMockWhenNoKey && process.env.NODE_ENV !== 'production' && process.env.VG_ALLOW_MOCK_GENERATION !== 'false')) {
      throw new Error('The configured image model does not have a valid image-edit credential.')
    }
    const model = provider === 'apifox_hub'
      ? String(resolveApifoxHubCredentials(credentials, 'image')?.imageEditModel || resolveApifoxHubCredentials(credentials, 'image')?.imageModel || '')
      : provider === 'grsai' ? String(credentials.grsaiImageModel || 'gpt-image-2')
        : provider === 'kling' ? String(credentials.klingImageModel || 'openai/gpt-image-1/edit')
          : String(credentials.openaiImageModel || 'gpt-image-1')
    const batchId = randomUUID()
    const batchDir = join(root(), batchId, 'inputs')
    await mkdir(batchDir, { recursive: true })
    const batchProductImages: string[] = []
    for (const source of imagePaths) {
      if (!IMAGE_EXTENSIONS.has(extname(source).toLowerCase())) throw new Error('Product reference files must be supported images.')
      const metadata = await sharp(source).metadata()
      if (!metadata.width || !metadata.height) throw new Error('A product reference image is unreadable.')
      const destination = join(batchDir, `${randomUUID()}${extname(source) || '.png'}`)
      await copyFile(source, destination)
      batchProductImages.push(destination)
    }
    const items: ProductReplacementItem[] = []
    for (const source of input.sourceImages) {
      const info = await stat(source.path).catch(() => null)
      if (!info?.isFile() || !IMAGE_EXTENSIONS.has(extname(source.path).toLowerCase())) continue
      const metadata = await sharp(source.path).metadata().catch(() => null)
      if (!metadata?.width || !metadata.height) continue
      const scenePath = join(batchDir, `${randomUUID()}${extname(source.path).toLowerCase()}`)
      await copyFile(source.path, scenePath)
      for (let variantIndex = 1; variantIndex <= count; variantIndex += 1) items.push({
        id: randomUUID(), sourcePath: scenePath, sourceName: source.name, variantIndex, status: 'queued', updatedAt: Date.now(),
      })
    }
    if (!items.length) throw new Error('No valid scene images were provided.')
    const batch: ProductReplacementBatch = {
      id: batchId, status: 'queued', productName: String(input.productName || 'Custom product'), productId: input.productId,
      productImagePaths: batchProductImages, promptVersionId: promptVersion.id, promptVersion: promptVersion.version,
      promptHash: promptVersion.promptHash, prompt: promptVersion.prompt, variantCount: count,
      modelSnapshot: { provider, model },
      items, createdAt: Date.now(), updatedAt: Date.now(),
    }
    await saveBatch(batch)
    void processQueue()
    return batch
  },
  async pauseBatch(id: string) {
    const batch = (await readBatches()).find((item) => item.id === id)
    if (!batch) throw new Error('Batch not found.')
    batch.status = 'paused'
    await saveBatch(batch)
    return batch
  },
  async resumeBatch(id: string) {
    const batch = (await readBatches()).find((item) => item.id === id)
    if (!batch) throw new Error('Batch not found.')
    if (batch.status === 'paused') {
      batch.status = 'queued'
    }
    await saveBatch(batch)
    void processQueue()
    return batch
  },
  async cancelBatch(id: string) {
    const batch = (await readBatches()).find((item) => item.id === id)
    if (!batch) throw new Error('Batch not found.')
    for (const item of batch.items) if (item.status === 'queued') item.status = 'cancelled'
    batch.status = 'cancelled'
    await saveBatch(batch)
    return batch
  },
  async retryFailed(id: string) {
    const batch = (await readBatches()).find((item) => item.id === id)
    if (!batch) throw new Error('Batch not found.')
    for (const item of batch.items) if (item.status === 'failed') { item.status = 'queued'; item.error = undefined }
    batch.status = 'queued'
    await saveBatch(batch)
    void processQueue()
    return batch
  },
  async exportResults(paths: string[]) {
    const { dialog, shell } = await import('electron')
    const { copyFile: copy, mkdir: makeDir } = await import('node:fs/promises')
    const selected = paths.filter((path) => String(path || '').trim())
    if (!selected.length) return { canceled: true }
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const directory = result.filePaths[0]
    await makeDir(directory, { recursive: true })
    for (const path of selected) await copy(path, join(directory, basename(path)))
    const exportedAt = Date.now()
    const batches = await readBatches()
    for (const batch of batches) {
      let changed = false
      for (const item of batch.items) {
        if (item.outputPath && selected.includes(item.outputPath)) {
          item.exportedAt = exportedAt
          item.updatedAt = exportedAt
          changed = true
        }
      }
      if (changed) await saveBatch(batch)
    }
    await shell.openPath(directory)
    return { canceled: false, count: selected.length, directory, exportedAt }
  },
  async recoverOnStartup() {
    const batches = await readBatches()
    for (const batch of batches) {
      for (const item of batch.items) if (item.status === 'processing') item.status = 'queued'
      if (batch.status === 'processing') batch.status = 'queued'
      await saveBatch(batch)
    }
    void processQueue()
  },
}
