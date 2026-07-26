import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

export type LivePhotoProductReferenceVariant = 'primary' | 'structure_retry'

type PreparedProductReference = {
  path: string
  derived: boolean
  variant: LivePhotoProductReferenceVariant
}

type ProductReferenceHint = {
  type?: string
  category?: string
}

type BoardCellCandidate = {
  buffer: Buffer
  left: number
  top: number
  width: number
  height: number
}

type CandidateMetrics = {
  trimmed: Buffer
  width: number
  height: number
  fillRatio: number
  holeRatio: number
  widthCoverage: number
  heightCoverage: number
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const REFERENCE_PREPARATION_VERSION = 'live-photo-product-reference-v3'

function isAnalysisBoard(path: string) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  return normalized.includes('product-library-analysis-board') || normalized.includes('_analysis_board_')
}

function isRingLikeHint(hint?: ProductReferenceHint) {
  const text = [hint?.type, hint?.category]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .join('\n')
  return /\b(?:ring|rings)\b/.test(text)
}

async function trimWhite(input: Buffer) {
  return await sharp(input)
    .flatten({ background: WHITE })
    .trim({ background: WHITE, threshold: 18 })
    .png()
    .toBuffer({ resolveWithObject: true })
}

async function isolateOneProduct(input: Buffer, variant: LivePhotoProductReferenceVariant) {
  const trimmed = await trimWhite(input)
  const width = trimmed.info.width
  const height = trimmed.info.height
  if (width <= height * 1.25) return trimmed.data

  const halfWidth = Math.max(1, Math.floor(width / 2))
  const left = variant === 'structure_retry' ? width - halfWidth : 0
  const isolated = await sharp(trimmed.data)
    .extract({ left, top: 0, width: halfWidth, height })
    .png()
    .toBuffer()
  return (await trimWhite(isolated)).data
}

async function analyzeCandidateMetrics(input: Buffer): Promise<CandidateMetrics> {
  const trimmed = await trimWhite(input)
  const stats = await sharp(trimmed.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const channels = stats.info.channels
  const width = stats.info.width
  const height = stats.info.height
  let foreground = 0
  const mask = new Uint8Array(width * height)
  for (let offset = 0; offset < stats.data.length; offset += channels) {
    const index = Math.floor(offset / channels)
    const r = stats.data[offset] || 0
    const g = stats.data[offset + 1] || 0
    const b = stats.data[offset + 2] || 0
    const alpha = channels >= 4 ? (stats.data[offset + 3] || 0) : 255
    const active = alpha > 24 && (r < 245 || g < 245 || b < 245)
    if (active) {
      mask[index] = 1
      foreground += 1
    }
  }
  const total = Math.max(1, width * height)
  const fillRatio = foreground / total
  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  const push = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const index = y * width + x
    if (visited[index] || mask[index]) return
    visited[index] = 1
    queue[tail++] = index
  }
  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y)
    push(width - 1, y)
  }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    push(x - 1, y)
    push(x + 1, y)
    push(x, y - 1)
    push(x, y + 1)
  }
  let enclosedWhitespace = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let index = 0; index < total; index += 1) {
    if (mask[index]) {
      const x = index % width
      const y = Math.floor(index / width)
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      continue
    }
    if (!visited[index]) enclosedWhitespace += 1
  }
  const bboxWidth = maxX >= minX ? maxX - minX + 1 : width
  const bboxHeight = maxY >= minY ? maxY - minY + 1 : height
  return {
    trimmed: trimmed.data,
    width,
    height,
    fillRatio,
    holeRatio: enclosedWhitespace / total,
    widthCoverage: foreground > 0 ? bboxWidth / Math.max(1, width) : 0,
    heightCoverage: foreground > 0 ? bboxHeight / Math.max(1, height) : 0,
  }
}

function buildBoardCellCandidates(input: Buffer, width: number, height: number) {
  const columnWidth = Math.floor(width / 2)
  const rowHeight = Math.floor(height / 3)
  const candidates: BoardCellCandidate[] = []
  for (let row = 0; row < 3; row += 1) {
    candidates.push({
      left: columnWidth + 2,
      top: row * rowHeight + 2,
      width: Math.max(1, width - columnWidth - 4),
      height: Math.max(1, Math.floor(rowHeight * 0.78)),
      buffer: Buffer.alloc(0),
    })
  }
  return candidates
}

function scoreBoardCandidate(metrics: CandidateMetrics, hint: ProductReferenceHint | undefined, variant: LivePhotoProductReferenceVariant) {
  const isRing = isRingLikeHint(hint)
  if (metrics.fillRatio <= 0.0005) return Number.NEGATIVE_INFINITY
  const targetFill = variant === 'structure_retry' ? 0.2 : 0.28
  const fillBalance = Math.max(0, 1 - Math.abs(metrics.fillRatio - targetFill) * 3.2)
  const densePenalty = metrics.fillRatio > 0.55 ? (metrics.fillRatio - 0.55) * 2.4 : 0
  const extentScore = metrics.widthCoverage * 0.55 + metrics.heightCoverage * 0.45
  const ringBonus = isRing
    ? metrics.holeRatio * (variant === 'structure_retry' ? 5.2 : 2.8)
      + Math.max(0, 0.34 - metrics.fillRatio) * 0.9
      - (variant === 'structure_retry' && metrics.fillRatio > 0.38 ? (metrics.fillRatio - 0.38) * 2.4 : 0)
    : 0
  const retryBonus = variant === 'structure_retry' ? metrics.widthCoverage * 0.2 : 0
  return extentScore + fillBalance + ringBonus + retryBonus - densePenalty
}

async function extractBoardView(
  input: Buffer,
  width: number,
  height: number,
  variant: LivePhotoProductReferenceVariant,
  hint?: ProductReferenceHint,
) {
  if (!isRingLikeHint(hint)) {
    const columnWidth = Math.floor(width / 2)
    const rowHeight = Math.floor(height / 3)
    const row = variant === 'structure_retry' ? 0 : 2
    const cell = await sharp(input)
      .extract({
        left: columnWidth + 2,
        top: row * rowHeight + 2,
        width: Math.max(1, width - columnWidth - 4),
        height: Math.max(1, Math.floor(rowHeight * 0.78)),
      })
      .png()
      .toBuffer()
    if (variant === 'structure_retry') {
      const trimmed = await trimWhite(cell)
      const halfWidth = Math.max(1, Math.floor(trimmed.info.width * 0.46))
      const isolated = await sharp(trimmed.data)
        .extract({ left: 0, top: 0, width: halfWidth, height: trimmed.info.height })
        .png()
        .toBuffer()
      return (await trimWhite(isolated)).data
    }
    return await isolateOneProduct(cell, variant)
  }
  const effectiveVariant: LivePhotoProductReferenceVariant = 'primary'
  const candidates = buildBoardCellCandidates(input, width, height)
  const isRing = isRingLikeHint(hint)
  const ringMetrics: CandidateMetrics[] = []
  let selected: CandidateMetrics | null = null
  let selectedScore = Number.NEGATIVE_INFINITY
  for (const candidate of candidates) {
    const buffer = await sharp(input)
      .extract({
        left: candidate.left,
        top: candidate.top,
        width: candidate.width,
        height: candidate.height,
      })
      .png()
      .toBuffer()
    const metrics = await analyzeCandidateMetrics(buffer)
    if (isRing) ringMetrics.push(metrics)
    const score = scoreBoardCandidate(metrics, hint, effectiveVariant)
    if (score > selectedScore) {
      selected = metrics
      selectedScore = score
    }
  }
  if (isRing) {
    const ringWithOpenCenter = ringMetrics
      .filter((item) => item.holeRatio > 0.01)
      .sort((left, right) => {
        const holeDelta = right.holeRatio - left.holeRatio
        if (Math.abs(holeDelta) > 0.0001) return holeDelta
        return scoreBoardCandidate(right, hint, 'primary') - scoreBoardCandidate(left, hint, 'primary')
      })[0]
    if (ringWithOpenCenter) selected = ringWithOpenCenter
  }
  if (!selected) {
    return await isolateOneProduct(input, effectiveVariant)
  }
  return await isolateOneProduct(selected.trimmed, effectiveVariant)
}

async function buildRingMultiViewPack(input: Buffer, width: number, height: number) {
  const columnWidth = Math.floor(width / 2)
  const rowHeight = Math.floor(height / 3)
  const positions = [
    { left: 2, top: 2 },
    { left: columnWidth + 2, top: 2 },
    { left: 2, top: rowHeight + 2 },
    { left: columnWidth + 2, top: rowHeight + 2 },
  ]
  const composites: Array<{ input: Buffer; left: number; top: number }> = []
  for (const [index, position] of positions.entries()) {
    const cell = await sharp(input)
      .extract({
        left: position.left,
        top: position.top,
        width: Math.max(1, columnWidth - 4),
        height: Math.max(1, Math.floor(rowHeight * 0.78)),
      })
      .png()
      .toBuffer()
    const trimmed = await trimWhite(cell)
    const resized = await sharp(trimmed.data)
      .flatten({ background: WHITE })
      .resize(440, 440, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true })
    const cellLeft = index % 2 === 0 ? 0 : 512
    const cellTop = index < 2 ? 0 : 512
    composites.push({
      input: resized.data,
      left: cellLeft + Math.floor((512 - resized.info.width) / 2),
      top: cellTop + Math.floor((512 - resized.info.height) / 2),
    })
  }
  const divider = await sharp({ create: { width: 1024, height: 3, channels: 4, background: '#d8d8d8' } }).png().toBuffer()
  const verticalDivider = await sharp({ create: { width: 3, height: 1024, channels: 4, background: '#d8d8d8' } }).png().toBuffer()
  return await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
    .composite([
      ...composites,
      { input: divider, left: 0, top: 510 },
      { input: verticalDivider, left: 510, top: 0 },
    ])
    .png()
    .toBuffer()
}

export async function prepareLivePhotoProductReference(input: {
  sourcePath: string
  outputDir: string
  variant: LivePhotoProductReferenceVariant
  hint?: ProductReferenceHint
}): Promise<PreparedProductReference> {
  const sourcePath = String(input.sourcePath || '').trim()
  if (!sourcePath || !existsSync(sourcePath)) throw new Error('Selected product does not have a usable reference image')

  const sourceStat = await stat(sourcePath)
  const cacheId = createHash('sha256')
    .update(`${REFERENCE_PREPARATION_VERSION}|${sourcePath}|${sourceStat.size}|${sourceStat.mtimeMs}|${input.variant}|${input.hint?.type || ''}|${input.hint?.category || ''}`, 'utf8')
    .digest('hex')
    .slice(0, 16)
  await mkdir(input.outputDir, { recursive: true })
  const ringBoard = isAnalysisBoard(sourcePath) && isRingLikeHint(input.hint)
  const outputPath = join(input.outputDir, `${ringBoard ? 'ring-multiview' : 'single-product'}-${input.variant}-${cacheId}.png`)
  if (existsSync(outputPath)) return { path: outputPath, derived: true, variant: input.variant }

  try {
    const sourceBuffer = await sharp(sourcePath, { failOn: 'error' }).rotate().png().toBuffer({ resolveWithObject: true })
    const width = sourceBuffer.info.width
    const height = sourceBuffer.info.height
    const isolated = ringBoard
      ? await buildRingMultiViewPack(sourceBuffer.data, width, height)
      : isAnalysisBoard(sourcePath)
        ? await extractBoardView(sourceBuffer.data, width, height, input.variant, input.hint)
      : await isolateOneProduct(sourceBuffer.data, input.variant)

    const resized = await sharp(isolated)
      .flatten({ background: WHITE })
      .resize(896, 896, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true })
    await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
      .composite([{
        input: resized.data,
        left: Math.max(0, Math.floor((1024 - resized.info.width) / 2)),
        top: Math.max(0, Math.floor((1024 - resized.info.height) / 2)),
      }])
      .png({ compressionLevel: 9 })
      .toFile(outputPath)
  } catch {
    return { path: sourcePath, derived: false, variant: input.variant }
  }

  return { path: outputPath, derived: true, variant: input.variant }
}
