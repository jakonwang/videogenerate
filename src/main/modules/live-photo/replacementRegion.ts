import sharp from 'sharp'

import type { LivePhotoReplacementRegion } from './types'

export type LivePhotoPixelBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type LivePhotoReplacementGeometry = {
  imageWidth: number
  imageHeight: number
  target: LivePhotoPixelBounds
  context: LivePhotoPixelBounds
  writeback: LivePhotoPixelBounds
}

const MIN_REGION_SIZE = 0.01
export const LIVE_PHOTO_AUTO_REGION_MIN_CONFIDENCE = 0.75

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function normalizeLivePhotoReplacementRegion(
  input: Partial<LivePhotoReplacementRegion> | null | undefined,
  fallback?: Pick<LivePhotoReplacementRegion, 'source' | 'revision' | 'updatedAt'>,
): LivePhotoReplacementRegion | null {
  if (!input) return null
  const x = Number(input.x)
  const y = Number(input.y)
  const width = Number(input.width)
  const height = Number(input.height)
  if (![x, y, width, height].every(Number.isFinite)) return null
  if (width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) return null
  const left = clamp(x, 0, 1 - MIN_REGION_SIZE)
  const top = clamp(y, 0, 1 - MIN_REGION_SIZE)
  const right = clamp(x + width, left + MIN_REGION_SIZE, 1)
  const bottom = clamp(y + height, top + MIN_REGION_SIZE, 1)
  const confidenceValue = Number(input.confidence)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    source: input.source === 'manual' ? 'manual' : fallback?.source || 'auto',
    confidence: Number.isFinite(confidenceValue) ? clamp(confidenceValue, 0, 1) : undefined,
    revision: Math.max(1, Math.floor(Number(input.revision || fallback?.revision || 1))),
    updatedAt: Math.max(1, Number(input.updatedAt || fallback?.updatedAt || Date.now())),
  }
}

export function normalizeAutoLocatedLivePhotoReplacementRegion(
  input: Partial<LivePhotoReplacementRegion> | null | undefined,
  timestamp = Date.now(),
): LivePhotoReplacementRegion | null {
  if (!input) return null
  const x = Number(input.x)
  const y = Number(input.y)
  const width = Number(input.width)
  const height = Number(input.height)
  const confidence = Number(input.confidence)
  if (![x, y, width, height, confidence].every(Number.isFinite)) return null
  if (x < 0 || y < 0 || width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) return null
  if (x + width > 1 || y + height > 1 || confidence < LIVE_PHOTO_AUTO_REGION_MIN_CONFIDENCE || confidence > 1) return null
  return {
    x,
    y,
    width,
    height,
    source: 'auto',
    confidence,
    revision: 1,
    updatedAt: Math.max(1, timestamp),
  }
}

function expandedBounds(
  target: LivePhotoPixelBounds,
  imageWidth: number,
  imageHeight: number,
  scale: number,
  square: boolean,
): LivePhotoPixelBounds {
  const centerX = target.left + target.width / 2
  const centerY = target.top + target.height / 2
  let width = Math.max(1, target.width * scale)
  let height = Math.max(1, target.height * scale)
  if (square) {
    const side = Math.min(Math.max(width, height), imageWidth, imageHeight)
    width = side
    height = side
  }
  width = Math.min(imageWidth, Math.round(width))
  height = Math.min(imageHeight, Math.round(height))
  const left = clamp(Math.round(centerX - width / 2), 0, imageWidth - width)
  const top = clamp(Math.round(centerY - height / 2), 0, imageHeight - height)
  return { left, top, width, height }
}

function intersectBounds(bounds: LivePhotoPixelBounds, container: LivePhotoPixelBounds): LivePhotoPixelBounds {
  const left = Math.max(bounds.left, container.left)
  const top = Math.max(bounds.top, container.top)
  const right = Math.min(bounds.left + bounds.width, container.left + container.width)
  const bottom = Math.min(bounds.top + bounds.height, container.top + container.height)
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

export function resolveLivePhotoReplacementGeometry(input: {
  region: LivePhotoReplacementRegion
  imageWidth: number
  imageHeight: number
}): LivePhotoReplacementGeometry {
  const imageWidth = Math.max(1, Math.round(input.imageWidth))
  const imageHeight = Math.max(1, Math.round(input.imageHeight))
  const normalized = normalizeLivePhotoReplacementRegion(input.region)
  if (!normalized) throw new Error('Invalid Live Photo replacement region')
  const left = clamp(Math.floor(normalized.x * imageWidth), 0, imageWidth - 1)
  const top = clamp(Math.floor(normalized.y * imageHeight), 0, imageHeight - 1)
  const right = clamp(Math.ceil((normalized.x + normalized.width) * imageWidth), left + 1, imageWidth)
  const bottom = clamp(Math.ceil((normalized.y + normalized.height) * imageHeight), top + 1, imageHeight)
  const target = { left, top, width: right - left, height: bottom - top }
  const context = expandedBounds(target, imageWidth, imageHeight, 3, true)
  const writeback = intersectBounds(expandedBounds(target, imageWidth, imageHeight, 1.8, false), context)
  return {
    imageWidth,
    imageHeight,
    target,
    context,
    writeback,
  }
}

export async function prepareLivePhotoReplacementCrop(input: {
  scenePath: string
  outputPath: string
  region: LivePhotoReplacementRegion
}) {
  try {
    const metadata = await sharp(input.scenePath, { failOn: 'error' }).rotate().metadata()
    if (!metadata.width || !metadata.height) throw new Error('scene dimensions are unavailable')
    const geometry = resolveLivePhotoReplacementGeometry({
      region: input.region,
      imageWidth: metadata.width,
      imageHeight: metadata.height,
    })
    await sharp(input.scenePath, { failOn: 'error' })
      .rotate()
      .extract(geometry.context)
      .png()
      .toFile(input.outputPath)
    return { path: input.outputPath, geometry }
  } catch (error) {
    throw new Error(`Live Photo scene crop failed for ${input.scenePath}: ${String((error as Error)?.message || error)}`)
  }
}

function smoothStep(value: number) {
  const normalized = clamp(value, 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

function buildFeatherMask(input: {
  width: number
  height: number
  target: LivePhotoPixelBounds
  writeback: LivePhotoPixelBounds
}) {
  const { width, height, target, writeback } = input
  const targetLeft = clamp(target.left - writeback.left, 0, width - 1)
  const targetTop = clamp(target.top - writeback.top, 0, height - 1)
  const targetRight = clamp(target.left + target.width - writeback.left, targetLeft + 1, width)
  const targetBottom = clamp(target.top + target.height - writeback.top, targetTop + 1, height)
  const alpha = Buffer.alloc(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const horizontal = x < targetLeft
        ? x / Math.max(1, targetLeft)
        : x >= targetRight
          ? (width - 1 - x) / Math.max(1, width - targetRight)
          : 1
      const vertical = y < targetTop
        ? y / Math.max(1, targetTop)
        : y >= targetBottom
          ? (height - 1 - y) / Math.max(1, height - targetBottom)
          : 1
      alpha[y * width + x] = Math.round(255 * smoothStep(Math.min(horizontal, vertical)))
    }
  }
  return alpha
}

export async function compositeLivePhotoReplacementCrop(input: {
  scenePath: string
  generatedCropPath: string
  outputPath: string
  geometry: LivePhotoReplacementGeometry
}) {
  try {
    const { context, target, writeback } = input.geometry
    const relative = {
      left: writeback.left - context.left,
      top: writeback.top - context.top,
      width: writeback.width,
      height: writeback.height,
    }
    const generated = await sharp(input.generatedCropPath, { failOn: 'error' })
      .rotate()
      .resize(context.width, context.height, { fit: 'fill' })
      .extract(relative)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const mask = buildFeatherMask({
      width: writeback.width,
      height: writeback.height,
      target,
      writeback,
    })
    const rgba = Buffer.alloc(writeback.width * writeback.height * 4)
    for (let index = 0; index < writeback.width * writeback.height; index += 1) {
      rgba[index * 4] = generated.data[index * 3] || 0
      rgba[index * 4 + 1] = generated.data[index * 3 + 1] || 0
      rgba[index * 4 + 2] = generated.data[index * 3 + 2] || 0
      rgba[index * 4 + 3] = mask[index] || 0
    }
    const overlay = await sharp(rgba, {
      raw: { width: writeback.width, height: writeback.height, channels: 4 },
    }).png().toBuffer()
    await sharp(input.scenePath, { failOn: 'error' })
      .rotate()
      .composite([{ input: overlay, left: writeback.left, top: writeback.top }])
      .png()
      .toFile(input.outputPath)
    const outputMetadata = await sharp(input.outputPath, { failOn: 'error' }).metadata()
    if (outputMetadata.width !== input.geometry.imageWidth || outputMetadata.height !== input.geometry.imageHeight) {
      throw new Error(
        `output canvas mismatch: expected ${input.geometry.imageWidth}x${input.geometry.imageHeight}, received ${outputMetadata.width || 0}x${outputMetadata.height || 0}`,
      )
    }
    return input.outputPath
  } catch (error) {
    throw new Error(`Live Photo crop composite failed for ${input.generatedCropPath}: ${String((error as Error)?.message || error)}`)
  }
}
