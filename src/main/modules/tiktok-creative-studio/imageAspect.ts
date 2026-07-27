import { mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'

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
  const metadata = await sharp(sourcePath).metadata()
  const sourceWidth = Number(metadata.width || 0)
  const sourceHeight = Number(metadata.height || 0)
  if (!sourceWidth || !sourceHeight) throw new Error('TikTok prepared image dimensions are unavailable')

  if (Math.abs(sourceWidth / sourceHeight - TIKTOK_IMAGE_ASPECT_RATIO) <= ASPECT_RATIO_TOLERANCE) {
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
  const outputPath = join(outputDir, `tiktok-9x16-${Date.now()}-${sourceName}.png`)
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
