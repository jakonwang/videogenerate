import { mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'

const LIVE_PHOTO_IMAGE_WIDTH = 720
const LIVE_PHOTO_IMAGE_HEIGHT = 1280
const LIVE_PHOTO_IMAGE_ASPECT_RATIO = LIVE_PHOTO_IMAGE_WIDTH / LIVE_PHOTO_IMAGE_HEIGHT
const ASPECT_RATIO_TOLERANCE = 0.001

export type LivePhotoImageAspectResult = {
  path: string
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  normalized: boolean
}

export async function normalizeLivePhotoGeneratedImageAspect(
  sourcePath: string,
  outputDir: string,
): Promise<LivePhotoImageAspectResult> {
  const metadata = await sharp(sourcePath).metadata()
  const sourceWidth = Number(metadata.width || 0)
  const sourceHeight = Number(metadata.height || 0)
  if (!sourceWidth || !sourceHeight) throw new Error('Live Photo generated image dimensions are unavailable')

  if (Math.abs(sourceWidth / sourceHeight - LIVE_PHOTO_IMAGE_ASPECT_RATIO) <= ASPECT_RATIO_TOLERANCE) {
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
  const sourceName = basename(sourcePath, extname(sourcePath))
  const outputPath = join(outputDir, `live-photo-9x16-${Date.now()}-${sourceName}.png`)
  await sharp(sourcePath)
    .resize(LIVE_PHOTO_IMAGE_WIDTH, LIVE_PHOTO_IMAGE_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .png()
    .toFile(outputPath)

  return {
    path: outputPath,
    width: LIVE_PHOTO_IMAGE_WIDTH,
    height: LIVE_PHOTO_IMAGE_HEIGHT,
    sourceWidth,
    sourceHeight,
    normalized: true,
  }
}
