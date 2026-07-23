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

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const REFERENCE_PREPARATION_VERSION = 'live-photo-single-product-v1'

function isAnalysisBoard(path: string) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  return normalized.includes('product-library-analysis-board') || normalized.includes('_analysis_board_')
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

async function extractBoardView(input: Buffer, width: number, height: number, variant: LivePhotoProductReferenceVariant) {
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

export async function prepareLivePhotoProductReference(input: {
  sourcePath: string
  outputDir: string
  variant: LivePhotoProductReferenceVariant
}): Promise<PreparedProductReference> {
  const sourcePath = String(input.sourcePath || '').trim()
  if (!sourcePath || !existsSync(sourcePath)) throw new Error('Selected product does not have a usable reference image')

  const sourceStat = await stat(sourcePath)
  const cacheId = createHash('sha256')
    .update(`${REFERENCE_PREPARATION_VERSION}|${sourcePath}|${sourceStat.size}|${sourceStat.mtimeMs}|${input.variant}`, 'utf8')
    .digest('hex')
    .slice(0, 16)
  await mkdir(input.outputDir, { recursive: true })
  const outputPath = join(input.outputDir, `single-product-${input.variant}-${cacheId}.png`)
  if (existsSync(outputPath)) return { path: outputPath, derived: true, variant: input.variant }

  try {
    const sourceBuffer = await sharp(sourcePath, { failOn: 'error' }).rotate().png().toBuffer({ resolveWithObject: true })
    const width = sourceBuffer.info.width
    const height = sourceBuffer.info.height
    const isolated = isAnalysisBoard(sourcePath)
      ? await extractBoardView(sourceBuffer.data, width, height, input.variant)
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
