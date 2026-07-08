import { access, copyFile, mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { constants as fsConstants } from 'node:fs'
import { spawn } from 'node:child_process'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import { generateThumbnailJpg } from '../media/thumbnail'
import { productsRepo } from '../products/repo'
import { cloneRepo } from '../clone/repo'
import { toPublicUrlViaQiniu } from '../clone/qiniu'
import { getAppPaths } from '../../lib/paths'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import { productImageMaterialsQueue } from './queue'
import { productImageMaterialsRepo } from './repo'
import type {
  ProductImageMaterialBatch,
  ProductImageMaterialCategory,
  ProductImageMaterialHermesOption,
  ProductImageMaterialItem,
  ProductImageMaterialListFilters,
  ProductImageMaterialProductSummary,
  ProductImageMaterialSourceItem,
  ProductImageMaterialUsageStatus,
} from './types'

const DEFAULT_HERMES_LIMIT = 8
const BUILTIN_CATEGORIES: ProductImageMaterialCategory[] = ['necklace', 'ring', 'earring', 'bracelet']
const MAX_SCENE_SEGMENTS = 16
const MAX_SCENE_SEGMENT_DURATION_SEC = 8
const MIN_SEGMENT_DURATION_SEC = 0.5

type ProductImageMaterialsServiceDeps = {
  runFfmpeg: typeof runFfmpeg
  probeMedia: typeof probeMedia
  generateThumbnailJpg: typeof generateThumbnailJpg
  toPublicUrlViaQiniu: typeof toPublicUrlViaQiniu
  detectVideoSegments: typeof detectVideoSegments
}

let deps: ProductImageMaterialsServiceDeps = {
  runFfmpeg,
  probeMedia,
  generateThumbnailJpg,
  toPublicUrlViaQiniu,
  detectVideoSegments,
}

function now() {
  return Date.now()
}

function safeName(input: string) {
  return String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
}

function ensureCategory(input: string): ProductImageMaterialCategory {
  if (BUILTIN_CATEGORIES.includes(input as ProductImageMaterialCategory)) return input as ProductImageMaterialCategory
  throw new Error('Unsupported material category')
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}

function materialRoot(batchId: string) {
  return join(getAppPaths().dataDir, 'product-image-materials', batchId)
}

function dedupePaths(input: string[]) {
  return Array.from(new Set((input || []).map((item) => String(item || '').trim()).filter(Boolean)))
}

function sourceItemOf(videoPath: string): ProductImageMaterialSourceItem {
  return {
    id: randomUUID(),
    sourceVideoPath: videoPath,
    sourceVideoName: basename(videoPath),
    status: 'queued',
    generatedCount: 0,
    skippedCount: 0,
    updatedAt: now(),
  }
}

function updateBatchProgress(batch: ProductImageMaterialBatch): ProductImageMaterialBatch {
  const completedVideos = batch.sourceItems.filter((item) => item.status === 'completed').length
  const failedVideos = batch.sourceItems.filter((item) => item.status === 'failed').length
  const generatedImageCount = batch.sourceItems.reduce((sum, item) => sum + Number(item.generatedCount || 0), 0)
  let status: ProductImageMaterialBatch['status'] = batch.status
  if (completedVideos === batch.sourceItems.length && batch.sourceItems.length > 0) status = 'completed'
  else if (failedVideos === batch.sourceItems.length && batch.sourceItems.length > 0) status = 'failed'
  else if (completedVideos + failedVideos === batch.sourceItems.length && failedVideos > 0) status = 'partial_failed'
  else if (batch.sourceItems.some((item) => item.status === 'processing')) status = 'processing'
  else if (batch.sourceItems.some((item) => item.status === 'queued')) status = 'queued'
  return {
    ...batch,
    status,
    completedVideos,
    failedVideos,
    generatedImageCount,
    updatedAt: now(),
  }
}

type VideoSegment = {
  startSec: number
  endSec: number
  durationSec: number
}

function computeFrameTimeSec(segment: VideoSegment) {
  const duration = Number(segment.durationSec || 0)
  if (!Number.isFinite(duration) || duration <= MIN_SEGMENT_DURATION_SEC) return null
  const safeOffset = Math.max(0.3, Math.min(0.8, duration * 0.12))
  const safeStart = segment.startSec + safeOffset
  const safeEnd = segment.endSec - safeOffset
  if (safeEnd <= safeStart + 0.05) return null
  return Number(((safeStart + safeEnd) / 2).toFixed(3))
}

async function extractFrameJpg(input: { videoPath: string; atSec: number; outputDir: string; filePrefix: string }) {
  await mkdir(input.outputDir, { recursive: true })
  const outPath = join(input.outputDir, `${safeName(input.filePrefix) || randomUUID()}.jpg`)
  await deps.runFfmpeg({
    args: [
      '-y',
      '-ss',
      `${input.atSec}`,
      '-i',
      input.videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outPath,
    ],
  })
  return outPath
}

async function cleanupMaterialFiles(item: {
  localImagePath?: string
  thumbnailPath?: string
  segmentPath?: string
}) {
  const filePaths = [item.localImagePath, item.thumbnailPath, item.segmentPath]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await rm(filePath, { force: true })
      } catch {
        // Ignore file cleanup failures after record removal.
      }
    }),
  )
}

function fallbackCuts(duration: number): number[] {
  if (duration <= 6) return [0, duration]
  if (duration <= 12) return [0, duration * 0.35, duration * 0.72, duration]
  if (duration <= 20) return [0, duration * 0.2, duration * 0.42, duration * 0.62, duration * 0.82, duration]
  return [0, duration * 0.14, duration * 0.29, duration * 0.43, duration * 0.58, duration * 0.72, duration * 0.86, duration]
}

function toSegments(duration: number, cuts: number[]): VideoSegment[] {
  const points = [...cuts].filter((value) => value >= 0 && value <= duration).sort((a, b) => a - b)
  if (!points.length || points[0] > 0.02) points.unshift(0)
  if (points[points.length - 1] < duration) points.push(duration)

  const merged: number[] = []
  for (const point of points) {
    const prev = merged[merged.length - 1]
    if (prev == null || Math.abs(prev - point) > 0.12) merged.push(point)
  }

  const segments: VideoSegment[] = []
  for (let index = 0; index < merged.length - 1; index += 1) {
    const startSec = round3(merged[index]!)
    const endSec = round3(merged[index + 1]!)
    const durationSec = Math.max(MIN_SEGMENT_DURATION_SEC, round3(endSec - startSec))
    if (durationSec <= MAX_SCENE_SEGMENT_DURATION_SEC) {
      segments.push({ startSec, endSec, durationSec })
      continue
    }

    const splitCount = Math.max(2, Math.ceil(durationSec / MAX_SCENE_SEGMENT_DURATION_SEC))
    const splitDuration = durationSec / splitCount
    for (let splitIndex = 0; splitIndex < splitCount; splitIndex += 1) {
      const subStart = round3(startSec + splitDuration * splitIndex)
      const subEnd = splitIndex === splitCount - 1 ? endSec : round3(startSec + splitDuration * (splitIndex + 1))
      const subDuration = Math.max(MIN_SEGMENT_DURATION_SEC, round3(subEnd - subStart))
      segments.push({ startSec: subStart, endSec: subEnd, durationSec: subDuration })
    }
  }

  return segments.slice(0, MAX_SCENE_SEGMENTS)
}

async function detectSceneCuts(videoPath: string): Promise<number[]> {
  let ffmpeg = ''
  try {
    ffmpeg = getFfmpegExecutable()
  } catch {
    return []
  }

  return await new Promise<number[]>((resolve) => {
    const args = ['-hide_banner', '-loglevel', 'info', '-i', videoPath, '-an', '-filter:v', "select='gt(scene,0.33)',showinfo", '-f', 'null', '-']
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', () => resolve([]))
    child.on('close', () => {
      const cuts: number[] = []
      const pattern = /pts_time:([0-9.]+)/g
      let match: RegExpExecArray | null
      while ((match = pattern.exec(stderr))) {
        const cut = Number(match[1])
        if (Number.isFinite(cut)) cuts.push(round3(cut))
      }
      resolve(cuts)
    })
  })
}

async function detectVideoSegments(input: {
  videoPath: string
  durationSec: number
}): Promise<VideoSegment[]> {
  const durationSec = Math.max(MIN_SEGMENT_DURATION_SEC, Number(input.durationSec || 0))
  const sceneCuts = await detectSceneCuts(input.videoPath)
  const points = sceneCuts.length ? [0, ...sceneCuts, durationSec] : fallbackCuts(durationSec)
  return toSegments(durationSec, points)
}

function inferCategoryFromProductType(type: string): ProductImageMaterialCategory | null {
  const normalized = String(type || '').trim()
  if (normalized === 'necklace' || normalized === 'ring' || normalized === 'earring' || normalized === 'bracelet') {
    return normalized
  }
  return null
}

async function listProductSummaries(): Promise<ProductImageMaterialProductSummary[]> {
  const products = await productsRepo.list()
  return products.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    coverImagePath: item.coverImagePath,
  }))
}

async function processBatch(batchId: string) {
  const db = await productImageMaterialsRepo.readDb()
  const batch = db.batches.find((item) => item.id === batchId) ?? null
  if (!batch) return

  const credentials = await cloneRepo.getCredentials()
  let working: ProductImageMaterialBatch = await productImageMaterialsRepo.upsertBatch(
    updateBatchProgress({
      ...batch,
      status: 'processing',
    }),
  )

  for (const sourceItem of working.sourceItems) {
    if (sourceItem.status === 'completed') continue
    const sourceIndex = working.sourceItems.findIndex((item) => item.id === sourceItem.id)
    if (sourceIndex < 0) continue

    try {
      await access(sourceItem.sourceVideoPath, fsConstants.R_OK)
      const nextSource: ProductImageMaterialSourceItem = {
        ...working.sourceItems[sourceIndex],
        status: 'processing',
        error: undefined,
        startedAt: working.sourceItems[sourceIndex].startedAt || now(),
        updatedAt: now(),
      }
      working.sourceItems[sourceIndex] = nextSource
      working.currentSourceVideoPath = nextSource.sourceVideoPath
      working = await productImageMaterialsRepo.upsertBatch(updateBatchProgress(working))

      const sourceProbe = await deps.probeMedia(nextSource.sourceVideoPath)
      const segments = await deps.detectVideoSegments({
        videoPath: nextSource.sourceVideoPath,
        durationSec: sourceProbe.durationSec,
      })

      let generatedCount = 0
      let skippedCount = 0
      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
        const segment = segments[segmentIndex]
        const frameTimeSec = computeFrameTimeSec(segment)
        if (frameTimeSec === null) {
          skippedCount += 1
          continue
        }
        const localImagePath = await extractFrameJpg({
          videoPath: nextSource.sourceVideoPath,
          atSec: frameTimeSec,
          outputDir: join(materialRoot(working.id), 'frames', nextSource.id),
          filePrefix: `${String(segmentIndex + 1).padStart(2, '0')}_${basename(nextSource.sourceVideoName, extname(nextSource.sourceVideoName))}`,
        })
        const thumbnailPath = await deps.generateThumbnailJpg({ filePath: localImagePath, atSec: 0 })
        const qiniuUrl = await deps.toPublicUrlViaQiniu(credentials, localImagePath, 'product-image-materials')
        const material: ProductImageMaterialItem = {
          id: randomUUID(),
          userId: working.userId,
          batchId: working.id,
          category: working.category,
          sourceVideoPath: nextSource.sourceVideoPath,
          sourceVideoName: nextSource.sourceVideoName,
          segmentIndex,
          segmentPath: '',
          frameTimeSec,
          localImagePath,
          thumbnailPath: thumbnailPath || undefined,
          qiniuUrl,
          usageStatus: 'unused',
          createdAt: now(),
          updatedAt: now(),
        }
        await productImageMaterialsRepo.upsertMaterial(material)
        generatedCount += 1
      }

      working.sourceItems[sourceIndex] = {
        ...working.sourceItems[sourceIndex],
        status: 'completed',
        generatedCount,
        skippedCount,
        completedAt: now(),
        updatedAt: now(),
      }
      working.lastError = undefined
      working = await productImageMaterialsRepo.upsertBatch(updateBatchProgress(working))
    } catch (error) {
      const message = String((error as Error)?.message || error || 'Unknown error').trim()
      working.sourceItems[sourceIndex] = {
        ...working.sourceItems[sourceIndex],
        status: 'failed',
        error: message,
        completedAt: now(),
        updatedAt: now(),
      }
      working.lastError = message
      working = await productImageMaterialsRepo.upsertBatch(updateBatchProgress(working))
    }
  }

  await productImageMaterialsRepo.upsertBatch(
    updateBatchProgress({
      ...working,
      currentSourceVideoPath: undefined,
    }),
  )
}

productImageMaterialsQueue.setProcessor(processBatch)

export const productImageMaterialsService = {
  async initialize() {
    const db = await productImageMaterialsRepo.readDb()
    for (const batch of db.batches) {
      if (batch.status === 'queued' || batch.status === 'processing') {
        productImageMaterialsQueue.schedule(batch.id)
      }
    }
  },

  listCategories() {
    return BUILTIN_CATEGORIES
  },

  async createBatch(input: {
    userId: string
    category: string
    sourceVideoPaths: string[]
  }) {
    const category = ensureCategory(input.category)
    const sourceVideoPaths = dedupePaths(input.sourceVideoPaths)
    if (!sourceVideoPaths.length) throw new Error('sourceVideoPaths is required')
    const batch: ProductImageMaterialBatch = {
      id: randomUUID(),
      userId: String(input.userId || '').trim(),
      category,
      status: 'queued',
      segmentTimeSec: MAX_SCENE_SEGMENT_DURATION_SEC,
      sourceItems: sourceVideoPaths.map(sourceItemOf),
      totalVideos: sourceVideoPaths.length,
      completedVideos: 0,
      failedVideos: 0,
      generatedImageCount: 0,
      createdAt: now(),
      updatedAt: now(),
    }
    const saved = await productImageMaterialsRepo.upsertBatch(batch)
    productImageMaterialsQueue.schedule(saved.id)
    return saved
  },

  async listBatches(userId: string) {
    return await productImageMaterialsRepo.listBatches(userId)
  },

  async retryBatch(input: { userId: string; batchId: string }) {
    const current = await productImageMaterialsRepo.getBatch(input.userId, input.batchId)
    if (!current) throw new Error('Batch does not exist')
    const reset: ProductImageMaterialBatch = {
      ...current,
      status: 'queued',
      lastError: undefined,
      currentSourceVideoPath: undefined,
      sourceItems: current.sourceItems.map((item) =>
        item.status === 'failed'
          ? {
              ...item,
              status: 'queued',
              error: undefined,
              updatedAt: now(),
            }
          : item,
      ),
    }
    const saved = await productImageMaterialsRepo.upsertBatch(updateBatchProgress(reset))
    productImageMaterialsQueue.schedule(saved.id)
    return saved
  },

  async listMaterials(userId: string, filters?: ProductImageMaterialListFilters) {
    return await productImageMaterialsRepo.listMaterials(userId, filters)
  },

  async updateMaterialUsageStatus(input: {
    userId: string
    materialId: string
    usageStatus: ProductImageMaterialUsageStatus
  }) {
    return await productImageMaterialsRepo.setMaterialUsageStatus(input.userId, input.materialId, input.usageStatus)
  },

  async bindMaterialProduct(input: { userId: string; materialId: string; productId?: string }) {
    const productId = String(input.productId || '').trim()
    if (productId) {
      const products = await productsRepo.list()
      if (!products.some((item) => item.id === productId)) throw new Error('Selected product does not exist')
    }
    return await productImageMaterialsRepo.bindMaterialProduct(input.userId, input.materialId, productId)
  },

  async deleteMaterial(input: { userId: string; materialId: string }) {
    const removed = await productImageMaterialsRepo.removeMaterial(input.userId, input.materialId)
    await cleanupMaterialFiles(removed)
    return { ok: true, id: removed.id }
  },

  async deleteMaterialAny(materialId: string) {
    const removed = await productImageMaterialsRepo.removeMaterialAny(String(materialId || '').trim())
    await cleanupMaterialFiles(removed)
    return { ok: true, id: removed.id }
  },

  async deleteMaterials(input: { userId: string; materialIds: string[] }) {
    const userId = String(input.userId || '').trim()
    const materialIds = Array.from(new Set((input.materialIds || []).map((item) => String(item || '').trim()).filter(Boolean)))
    if (!userId) throw new Error('userId is required')
    if (!materialIds.length) throw new Error('materialIds is required')

    const deletedIds: string[] = []
    for (const materialId of materialIds) {
      const removed = await productImageMaterialsRepo.removeMaterial(userId, materialId)
      await cleanupMaterialFiles(removed)
      deletedIds.push(removed.id)
    }

    return {
      ok: true,
      count: deletedIds.length,
      ids: deletedIds,
    }
  },

  async deleteMaterialsAny(materialIds: string[]) {
    const normalizedIds = Array.from(new Set((materialIds || []).map((item) => String(item || '').trim()).filter(Boolean)))
    if (!normalizedIds.length) throw new Error('materialIds is required')

    const deletedIds: string[] = []
    for (const materialId of normalizedIds) {
      const removed = await productImageMaterialsRepo.removeMaterialAny(materialId)
      await cleanupMaterialFiles(removed)
      deletedIds.push(removed.id)
    }

    return {
      ok: true,
      count: deletedIds.length,
      ids: deletedIds,
    }
  },

  async exportMaterials(input: { userId: string; materialIds: string[]; outputDir: string }) {
    const userId = String(input.userId || '').trim()
    const outputDir = String(input.outputDir || '').trim()
    const materialIds = Array.from(new Set((input.materialIds || []).map((item) => String(item || '').trim()).filter(Boolean)))
    if (!userId) throw new Error('userId is required')
    if (!outputDir) throw new Error('outputDir is required')
    if (!materialIds.length) throw new Error('materialIds is required')

    await mkdir(outputDir, { recursive: true })
    const materials = await productImageMaterialsRepo.listMaterials(userId)
    const selected = materialIds
      .map((materialId) => materials.find((item) => item.id === materialId) ?? null)
      .filter(Boolean) as ProductImageMaterialItem[]
    if (!selected.length) throw new Error('No materials found to export')

    const exported: Array<{ id: string; filePath: string }> = []
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index]
      const sourcePath = String(item.localImagePath || '').trim()
      if (!sourcePath) continue
      const extension = extname(sourcePath) || '.jpg'
      const fileName = safeName(
        `${String(index + 1).padStart(2, '0')}_${item.category}_${shortId(item.id)}_seg${item.segmentIndex + 1}${extension}`,
      )
      const targetPath = join(outputDir, fileName)
      await copyFile(sourcePath, targetPath)
      exported.push({ id: item.id, filePath: targetPath })
    }

    return {
      ok: true,
      outputDir,
      count: exported.length,
      exported,
    }
  },

  async listProductBindingOptions() {
    return await listProductSummaries()
  },

  async listHermesMaterialOptionsForProduct(input: {
    productId: string
    limit?: number
  }): Promise<{
    product: ProductImageMaterialProductSummary
    category: ProductImageMaterialCategory
    options: ProductImageMaterialHermesOption[]
  }> {
    const products = await listProductSummaries()
    const product = products.find((item) => item.id === String(input.productId || '').trim())
    if (!product) throw new Error('Selected product does not exist')
    const category = inferCategoryFromProductType(product.type)
    if (!category) throw new Error('Selected product type is not supported by material selection yet')
    const materials = await productImageMaterialsRepo.listAllMaterials({
      category,
      usageStatus: 'unused',
    })
    const limit = Math.max(1, Math.min(12, Number(input.limit || DEFAULT_HERMES_LIMIT)))
    const ranked = [...materials].sort((a, b) => {
      const aBound = String(a.boundProductId || '').trim()
      const bBound = String(b.boundProductId || '').trim()
      const target = product.id
      const aScore = aBound === target ? 2 : aBound ? 0 : 1
      const bScore = bBound === target ? 2 : bBound ? 0 : 1
      if (aScore !== bScore) return bScore - aScore
      return Number(b.createdAt || 0) - Number(a.createdAt || 0)
    })
    return {
      product,
      category,
      options: ranked.slice(0, limit).map((item, index) => ({
        id: item.id,
        index: index + 1,
        category: item.category,
        thumbnailUrl: item.qiniuUrl,
        boundProductId: item.boundProductId,
        localImagePath: item.localImagePath,
      })),
    }
  },

  async getMaterial(userId: string, materialId: string) {
    return await productImageMaterialsRepo.getMaterial(userId, materialId)
  },

  async getMaterialAny(materialId: string) {
    return await productImageMaterialsRepo.getMaterialAny(materialId)
  },

  async markMaterialUsed(materialId: string) {
    return await productImageMaterialsRepo.setMaterialUsageStatusAny(materialId, 'used')
  },

  setTestDependencies(overrides: Partial<ProductImageMaterialsServiceDeps>) {
    deps = {
      ...deps,
      ...overrides,
    }
  },

  resetTestDependencies() {
    deps = {
      runFfmpeg,
      probeMedia,
      generateThumbnailJpg,
      toPublicUrlViaQiniu,
      detectVideoSegments,
    }
  },
}

export const __productImageMaterialsTestUtils = {
  computeFrameTimeSec,
  inferCategoryFromProductType,
  fallbackCuts,
  toSegments,
}

function shortId(value: string) {
  const normalized = String(value || '').trim()
  return normalized.length > 8 ? normalized.slice(0, 8) : normalized || 'material'
}
