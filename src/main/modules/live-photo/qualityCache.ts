import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { LivePhotoQualityReport } from './types'

type CacheMetadata = {
  key: string
  imagePath: string
  imageHash: string
  quality: LivePhotoQualityReport
  createdAt: number
}

async function fileHash(path: string) {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

function cacheRoot() {
  return join(getAppPaths().dataDir, 'plugin-live-photo', 'quality-cache')
}

export async function buildLivePhotoQualityCacheKey(input: {
  scenePath: string
  productPath: string
  promptHash: string
  provider?: string
  model?: string
  outputSize?: string
  generationParams?: Record<string, unknown>
  checkerVersion: string
}) {
  const [sceneHash, productHash] = await Promise.all([fileHash(input.scenePath), fileHash(input.productPath)])
  return createHash('sha256')
    .update(
      JSON.stringify({
        sceneHash,
        productHash,
        promptHash: input.promptHash,
        provider: String(input.provider || ''),
        model: String(input.model || ''),
        outputSize: String(input.outputSize || ''),
        generationParams: input.generationParams || {},
        checkerVersion: input.checkerVersion,
      }),
    )
    .digest('hex')
}

export const livePhotoQualityCache = {
  async get(key: string) {
    const metadataPath = join(cacheRoot(), `${key}.json`)
    if (!existsSync(metadataPath)) return null
    try {
      const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as CacheMetadata
      if (!metadata.imagePath || !metadata.imageHash || !existsSync(metadata.imagePath) || metadata.quality?.decision !== 'pass') return null
      await stat(metadata.imagePath)
      if ((await fileHash(metadata.imagePath)) !== metadata.imageHash) return null
      return metadata
    } catch {
      return null
    }
  },

  async put(input: { key: string; sourcePath: string; quality: LivePhotoQualityReport }) {
    if (input.quality.decision !== 'pass') return null
    await mkdir(cacheRoot(), { recursive: true })
    const extension = extname(input.sourcePath) || '.png'
    const imagePath = join(cacheRoot(), `${input.key}${extension}`)
    await copyFile(input.sourcePath, imagePath)
    const metadata: CacheMetadata = {
      key: input.key,
      imagePath,
      imageHash: await fileHash(imagePath),
      quality: input.quality,
      createdAt: Date.now(),
    }
    await writeFile(join(cacheRoot(), `${input.key}.json`), JSON.stringify(metadata, null, 2), 'utf8')
    return metadata
  },
}
