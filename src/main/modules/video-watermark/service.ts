/**
 * Batch video watermark: overlays a text or image watermark on many videos with FFmpeg.
 * Text is rendered to a transparent PNG with sharp so CJK text works without a font file path.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import { assetLibraryService } from '../asset-library/service'

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export type WatermarkSettings = {
  kind: 'text' | 'image'
  text: string
  imagePath: string
  color: string
  position: WatermarkPosition
  /** 0.05–1 */
  opacity: number
  /** Watermark width relative to the video width, 0.05–0.6 */
  scale: number
  /** Edge margin relative to the video width, 0–0.15 */
  margin: number
}

export type WatermarkItemStatus = 'queued' | 'running' | 'done' | 'failed'

export type WatermarkItem = {
  id: string
  sourcePath: string
  outputPath?: string
  status: WatermarkItemStatus
  error?: string
  assetId?: string
}

export type WatermarkBatch = {
  id: string
  createdAt: number
  updatedAt: number
  settings: WatermarkSettings
  outputDir: string
  archiveToLibrary: boolean
  items: WatermarkItem[]
}

type Db = { schemaVersion: 1; batches: WatermarkBatch[]; lastSettings?: WatermarkSettings }

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i
const DEFAULT_SETTINGS: WatermarkSettings = {
  kind: 'text',
  text: '',
  imagePath: '',
  color: '#FFFFFF',
  position: 'bottom-right',
  opacity: 0.8,
  scale: 0.22,
  margin: 0.04,
}

function dbPath() {
  return join(getAppPaths().dbDir, 'video-watermark.json')
}

let queue: Promise<unknown> = Promise.resolve()
const listeners = new Set<(batch: WatermarkBatch) => void>()

async function readDb(): Promise<Db> {
  const db = await readJsonFile<Db>(dbPath(), { schemaVersion: 1, batches: [] })
  return { schemaVersion: 1, batches: Array.isArray(db.batches) ? db.batches : [], lastSettings: db.lastSettings }
}

async function mutate<T>(fn: (db: Db) => T): Promise<T> {
  const run = queue.catch(() => undefined).then(async () => {
    const db = await readDb()
    const result = fn(db)
    await writeJsonFile(dbPath(), db)
    return result
  })
  queue = run
  return (await run) as T
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizeWatermarkSettings(input: Partial<WatermarkSettings> | undefined): WatermarkSettings {
  const source = input || {}
  const position = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(String(source.position))
    ? (source.position as WatermarkPosition)
    : DEFAULT_SETTINGS.position
  const color = /^#[0-9a-fA-F]{6}$/.test(String(source.color || '')) ? String(source.color) : DEFAULT_SETTINGS.color
  return {
    kind: source.kind === 'image' ? 'image' : 'text',
    text: String(source.text || '').slice(0, 60),
    imagePath: String(source.imagePath || '').trim(),
    color,
    position,
    opacity: clamp(source.opacity, 0.05, 1, DEFAULT_SETTINGS.opacity),
    scale: clamp(source.scale, 0.05, 0.6, DEFAULT_SETTINGS.scale),
    margin: clamp(source.margin, 0, 0.15, DEFAULT_SETTINGS.margin),
  }
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Renders the watermark (text or image) as a transparent PNG sized for a given video width. */
async function renderWatermarkPng(settings: WatermarkSettings, videoWidth: number, outPath: string) {
  const targetWidth = Math.max(16, Math.round(videoWidth * settings.scale))
  if (settings.kind === 'image') {
    if (!settings.imagePath || !existsSync(settings.imagePath)) throw new Error('水印图片不存在')
    await sharp(settings.imagePath).resize({ width: targetWidth }).ensureAlpha().png().toFile(outPath)
    return
  }
  const text = settings.text.trim()
  if (!text) throw new Error('请填写水印文字')
  // Approximate glyph width: CJK ≈ 1em, latin ≈ 0.6em.
  const units = Array.from(text).reduce((sum, char) => sum + (/[⺀-￿]/.test(char) ? 1 : 0.6), 0)
  const fontSize = Math.max(10, Math.floor(targetWidth / Math.max(1, units)))
  const width = Math.ceil(units * fontSize + fontSize * 0.4)
  const height = Math.ceil(fontSize * 1.5)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <style>text{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC',Arial,sans-serif;font-weight:700}</style>
  <text x="${fontSize * 0.2 + 1}" y="${fontSize * 1.12 + 1}" font-size="${fontSize}" fill="#000000" fill-opacity="0.45">${escapeXml(text)}</text>
  <text x="${fontSize * 0.2}" y="${fontSize * 1.12}" font-size="${fontSize}" fill="${settings.color}">${escapeXml(text)}</text>
</svg>`
  await sharp(Buffer.from(svg)).png().toFile(outPath)
}

function overlayPosition(position: WatermarkPosition, margin: string) {
  switch (position) {
    case 'top-left': return `${margin}:${margin}`
    case 'top-right': return `W-w-${margin}:${margin}`
    case 'bottom-left': return `${margin}:H-h-${margin}`
    case 'center': return '(W-w)/2:(H-h)/2'
    default: return `W-w-${margin}:H-h-${margin}`
  }
}

async function ensureArchiveFolder() {
  const folders = await assetLibraryService.listAllFolders()
  let root = folders.find((folder) => (folder.parentId ?? null) === null && folder.name === 'AI 成片')
  if (!root) root = await assetLibraryService.createFolder('AI 成片', null)
  const all = await assetLibraryService.listAllFolders()
  let child = all.find((folder) => folder.parentId === root!.id && folder.name === '加水印')
  if (!child) child = await assetLibraryService.createFolder('加水印', root.id)
  return child.id
}

async function processItem(batch: WatermarkBatch, item: WatermarkItem) {
  const probe = await probeMedia(item.sourcePath)
  const width = Math.max(64, Number(probe.width || 1080))
  const workDir = join(getAppPaths().tmpDir, 'video-watermark', batch.id)
  await mkdir(workDir, { recursive: true })
  await mkdir(batch.outputDir, { recursive: true })
  const pngPath = join(workDir, `${item.id}.png`)
  await renderWatermarkPng(batch.settings, width, pngPath)
  const base = basename(item.sourcePath, extname(item.sourcePath)).replace(/[\\/:*?"<>|]+/g, '_')
  let outputPath = join(batch.outputDir, `${base}_watermark.mp4`)
  let suffix = 2
  while (existsSync(outputPath)) outputPath = join(batch.outputDir, `${base}_watermark_${suffix++}.mp4`)
  const margin = String(Math.round(width * batch.settings.margin))
  const filter = `[1:v]format=rgba,colorchannelmixer=aa=${batch.settings.opacity.toFixed(2)}[wm];[0:v][wm]overlay=${overlayPosition(batch.settings.position, margin)}:format=auto[v]`
  await runFfmpeg({
    args: [
      '-y', '-i', item.sourcePath, '-i', pngPath,
      '-filter_complex', filter,
      '-map', '[v]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart',
      outputPath,
    ],
  })
  return outputPath
}

async function runBatch(batchId: string) {
  const db = await readDb()
  const batch = db.batches.find((item) => item.id === batchId)
  if (!batch) return
  const archiveFolder = batch.archiveToLibrary ? await ensureArchiveFolder().catch(() => null) : null
  for (const item of batch.items) {
    if (item.status === 'done') continue
    await updateItem(batchId, item.id, { status: 'running', error: undefined })
    try {
      const outputPath = await processItem(batch, item)
      let assetId: string | undefined
      if (archiveFolder) {
        const asset = await assetLibraryService.importFile(outputPath, 'desktop', basename(outputPath), archiveFolder).catch(() => null)
        assetId = asset?.id
      }
      await updateItem(batchId, item.id, { status: 'done', outputPath, assetId })
    } catch (error) {
      await updateItem(batchId, item.id, { status: 'failed', error: String((error as Error)?.message || error).split('\n')[0].slice(0, 300) })
    }
  }
}

async function updateItem(batchId: string, itemId: string, patch: Partial<WatermarkItem>) {
  const batch = await mutate((db) => {
    const target = db.batches.find((item) => item.id === batchId)
    if (!target) return null
    const item = target.items.find((entry) => entry.id === itemId)
    if (item) Object.assign(item, patch)
    target.updatedAt = Date.now()
    return target
  })
  if (batch) for (const listener of listeners) listener(batch)
}

let running: Promise<void> = Promise.resolve()

export const videoWatermarkService = {
  async getState() {
    const db = await readDb()
    return { batches: db.batches.slice(0, 20), lastSettings: db.lastSettings || DEFAULT_SETTINGS }
  },

  async start(input: { videoPaths: string[]; settings: Partial<WatermarkSettings>; outputDir?: string; archiveToLibrary?: boolean }) {
    const videoPaths = Array.from(new Set((input.videoPaths || []).map((path) => String(path || '').trim()))).filter((path) => VIDEO_EXT.test(path) && existsSync(path))
    if (!videoPaths.length) throw new Error('请至少选择一个视频')
    const settings = normalizeWatermarkSettings(input.settings)
    if (settings.kind === 'text' && !settings.text.trim()) throw new Error('请填写水印文字')
    if (settings.kind === 'image' && (!settings.imagePath || !existsSync(settings.imagePath))) throw new Error('请选择水印图片')
    const id = randomUUID()
    const now = Date.now()
    const batch: WatermarkBatch = {
      id,
      createdAt: now,
      updatedAt: now,
      settings,
      outputDir: String(input.outputDir || '').trim() || join(getAppPaths().dataDir, 'video-watermark', id.slice(0, 8)),
      archiveToLibrary: input.archiveToLibrary !== false,
      items: videoPaths.map((sourcePath) => ({ id: randomUUID(), sourcePath, status: 'queued' })),
    }
    await mutate((db) => {
      db.batches.unshift(batch)
      if (db.batches.length > 50) db.batches.length = 50
      db.lastSettings = settings
    })
    running = running.catch(() => undefined).then(() => runBatch(id))
    return batch
  },

  async retryFailed(batchId: string) {
    await mutate((db) => {
      const batch = db.batches.find((item) => item.id === batchId)
      if (!batch) throw new Error('批次不存在')
      for (const item of batch.items) if (item.status === 'failed') Object.assign(item, { status: 'queued', error: undefined })
    })
    running = running.catch(() => undefined).then(() => runBatch(batchId))
    return { ok: true as const }
  },

  async removeBatch(batchId: string) {
    await mutate((db) => {
      db.batches = db.batches.filter((item) => item.id !== batchId)
    })
    return { ok: true as const }
  },

  /** Renders a preview PNG of the watermark for a 1080px wide frame. */
  async preview(settings: Partial<WatermarkSettings>) {
    const normalized = normalizeWatermarkSettings(settings)
    const dir = join(getAppPaths().tmpDir, 'video-watermark', 'preview')
    await mkdir(dir, { recursive: true })
    const outPath = join(dir, `${randomUUID()}.png`)
    await renderWatermarkPng(normalized, 1080, outPath)
    return { path: outPath }
  },

  subscribe(listener: (batch: WatermarkBatch) => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
