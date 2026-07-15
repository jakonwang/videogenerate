import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runFfmpeg } from '../ffmpeg/runner'
import type { LivePhotoFrameRate, LivePhotoOutputResolution, LivePhotoQuality } from './types'

export type LivePhotoPackagerDeps = {
  runFfmpeg: typeof runFfmpeg
}

export type PackageLivePhotoInput = {
  itemId: string
  sourceStillPath: string
  sourceVideoPath: string
  exportDir: string
  baseName: string
  outputResolution?: LivePhotoOutputResolution
  frameRate?: LivePhotoFrameRate
  quality?: LivePhotoQuality
}

export type PackageLivePhotoResult = {
  assetIdentifier: string
  imagePath: string
  videoPath: string
  bundlePath: string
  metadataBridgePath: string
  videoMetadataMode: 'quicktime_mdta' | 'copied_fallback'
  imageMetadataMode: 'copied_pending_native_metadata'
}

function resolveOutputResolution(value?: LivePhotoOutputResolution) {
  if (value === '1080x1440') return { width: 1080, height: 1440 }
  if (value === '3024x4032') return { width: 3024, height: 4032 }
  return { width: 2160, height: 2880 }
}

function resolveVideoCrf(value?: LivePhotoQuality) {
  return value === 'medium' ? '22' : '16'
}

function resolveImageQualityScale(value?: LivePhotoQuality) {
  return value === 'medium' ? '4' : '2'
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true })
}

function safeFileBaseName(input: string, fallback: string) {
  const value = String(input || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 48)
    .trim()
  return value || fallback
}

async function writeJsonArtifact(primaryPath: string, fallbackPath: string, payload: unknown) {
  const content = JSON.stringify(payload, null, 2)
  try {
    await writeFile(primaryPath, content, 'utf-8')
    if (existsSync(primaryPath)) return primaryPath
  } catch {
    // Fall through to the shorter fallback path.
  }
  await writeFile(fallbackPath, content, 'utf-8')
  return fallbackPath
}

async function writeMetadataTaggedMov(input: {
  deps: LivePhotoPackagerDeps
  sourceVideoPath: string
  outputPath: string
  assetIdentifier: string
  outputResolution?: LivePhotoOutputResolution
  frameRate?: LivePhotoFrameRate
  quality?: LivePhotoQuality
}) {
  const qualityCrf = resolveVideoCrf(input.quality)
  try {
    await input.deps.runFfmpeg({
      args: [
        '-y',
        '-i',
        input.sourceVideoPath,
        '-map',
        '0:v:0',
        '-c',
        'copy',
        '-movflags',
        'use_metadata_tags+faststart',
        '-metadata',
        `content.identifier=${input.assetIdentifier}`,
        '-metadata',
        `com.apple.quicktime.content.identifier=${input.assetIdentifier}`,
        '-metadata',
        `live-photo.asset.identifier=${input.assetIdentifier}`,
        '-an',
        input.outputPath,
      ],
    })
    return
  } catch {
    await input.deps.runFfmpeg({
      args: [
        '-y',
        '-i',
        input.sourceVideoPath,
        '-map',
        '0:v:0',
        '-c:v',
        'libx264',
        '-crf',
        qualityCrf,
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        'use_metadata_tags+faststart',
        '-metadata',
        `content.identifier=${input.assetIdentifier}`,
        '-metadata',
        `com.apple.quicktime.content.identifier=${input.assetIdentifier}`,
        '-metadata',
        `live-photo.asset.identifier=${input.assetIdentifier}`,
        '-an',
        input.outputPath,
      ],
    })
  }
}

async function renderOutputJpeg(input: {
  deps: LivePhotoPackagerDeps
  sourceStillPath: string
  outputPath: string
  outputResolution?: LivePhotoOutputResolution
  quality?: LivePhotoQuality
}) {
  const targetResolution = resolveOutputResolution(input.outputResolution)
  const qualityScale = resolveImageQualityScale(input.quality)
  await input.deps.runFfmpeg({
    args: [
      '-y',
      '-i',
      input.sourceStillPath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${targetResolution.width}:${targetResolution.height}:force_original_aspect_ratio=decrease,pad=${targetResolution.width}:${targetResolution.height}:(ow-iw)/2:(oh-ih)/2:black`,
      '-q:v',
      qualityScale,
      input.outputPath,
    ],
  })
}

export async function packageLivePhoto(
  deps: LivePhotoPackagerDeps,
  input: PackageLivePhotoInput,
): Promise<PackageLivePhotoResult> {
  await ensureDir(input.exportDir)
  const assetIdentifier = `livephoto-${input.itemId}-${randomUUID()}`
  const fileBaseName = safeFileBaseName(input.baseName, input.itemId.slice(0, 8))
  const imagePath = join(input.exportDir, `${fileBaseName}.jpg`)
  const videoPath = join(input.exportDir, `${fileBaseName}.mov`)
  const bundlePathPrimary = join(input.exportDir, `${fileBaseName}.livephoto.json`)
  const bundlePathFallback = join(input.exportDir, `bundle-${input.itemId.slice(0, 8)}.livephoto.json`)
  const metadataBridgePathPrimary = join(input.exportDir, `${fileBaseName}.asset-metadata.json`)
  const metadataBridgePathFallback = join(input.exportDir, `bundle-${input.itemId.slice(0, 8)}.asset-metadata.json`)

  try {
    await renderOutputJpeg({
      deps,
      sourceStillPath: input.sourceStillPath,
      outputPath: imagePath,
      outputResolution: input.outputResolution,
      quality: input.quality,
    })
  } catch {
    await copyFile(input.sourceStillPath, imagePath)
  }

  let videoMetadataMode: PackageLivePhotoResult['videoMetadataMode'] = 'quicktime_mdta'
  try {
    await writeMetadataTaggedMov({
      deps,
      sourceVideoPath: input.sourceVideoPath,
      outputPath: videoPath,
      assetIdentifier,
      outputResolution: input.outputResolution,
      frameRate: input.frameRate,
      quality: input.quality,
    })
  } catch {
    videoMetadataMode = 'copied_fallback'
    await copyFile(input.sourceVideoPath, videoPath)
  }

  const metadataBridgePath = await writeJsonArtifact(
    metadataBridgePathPrimary,
    metadataBridgePathFallback,
    {
      type: 'apple_live_photo_metadata_bridge',
      assetIdentifier,
      imagePath,
      videoPath,
      imageMetadataMode: 'copied_pending_native_metadata',
      videoMetadataMode,
      note: 'Video metadata is written through ffmpeg QuickTime mdta when available. Image-side native Apple metadata still requires a dedicated writer.',
    },
  )

  const bundlePath = await writeJsonArtifact(
    bundlePathPrimary,
    bundlePathFallback,
    {
      type: 'apple_live_photo_bundle',
      assetIdentifier,
      imagePath,
      videoPath,
      metadataBridgePath,
      imageMetadataMode: 'copied_pending_native_metadata',
      videoMetadataMode,
    },
  )

  return {
    assetIdentifier,
    imagePath,
    videoPath,
    bundlePath,
    metadataBridgePath,
    imageMetadataMode: 'copied_pending_native_metadata',
    videoMetadataMode,
  }
}
