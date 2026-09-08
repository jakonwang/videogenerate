import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

async function getSharp(): Promise<any> {
  const module = await import('sharp')
  return module.default || module
}

const TIKTOK_IMAGE_WIDTH = 720
const TIKTOK_IMAGE_HEIGHT = 1280
const TIKTOK_IMAGE_ASPECT_RATIO = TIKTOK_IMAGE_WIDTH / TIKTOK_IMAGE_HEIGHT
const ASPECT_RATIO_TOLERANCE = 0.001

export type TiktokImageAspectResult = {
  path: string
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  normalized: boolean
}

export async function normalizeTiktokPreparedImageAspect(
  sourcePath: string,
  outputDir: string,
): Promise<TiktokImageAspectResult> {
  const sharp = await getSharp()
  const metadata = await sharp(sourcePath).metadata()
  const sourceWidth = Number(metadata.width || 0)
  const sourceHeight = Number(metadata.height || 0)
  if (!sourceWidth || !sourceHeight) throw new Error('TikTok prepared image dimensions are unavailable')

  // Keep the upload payload bounded. A source can have the right aspect ratio
  // while still being an extremely large image (for example 4000x7111).
  if (
    sourceWidth === TIKTOK_IMAGE_WIDTH &&
    sourceHeight === TIKTOK_IMAGE_HEIGHT &&
    Math.abs(sourceWidth / sourceHeight - TIKTOK_IMAGE_ASPECT_RATIO) <= ASPECT_RATIO_TOLERANCE
  ) {
    return {
      path: sourcePath,
      width: sourceWidth,
      height: sourceHeight,
      sourceWidth,
      sourceHeight,
      normalized: false,
    }
  }

  await mkdir(outputDir, { recursive: true })
  const outputPath = join(outputDir, `tiktok-9x16-${Date.now()}-${randomUUID()}.png`)
  await sharp(sourcePath)
    .resize(TIKTOK_IMAGE_WIDTH, TIKTOK_IMAGE_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .png()
    .toFile(outputPath)

  return {
    path: outputPath,
    width: TIKTOK_IMAGE_WIDTH,
    height: TIKTOK_IMAGE_HEIGHT,
    sourceWidth,
    sourceHeight,
    normalized: true,
  }
}
