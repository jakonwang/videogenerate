import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getAppPaths } from '../../lib/paths'

export type ManagedAssetModule =
  | 'clone'
  | 'subtitle'
  | 'product-materials'
  | 'tiktok-listing'
  | 'tiktok-creative'
  | 'templates'
  | 'live-photo'
  | 'hermes'
  | 'agent-os'
  | 'other'

export type MaterializeAssetInput = {
  sourcePath?: string | null
  module: ManagedAssetModule
  ownerId: string
  assetId?: string
  allowMissing?: boolean
}

function safePart(value: string) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || randomUUID()
}

function isInside(rootPath: string, candidatePath: string) {
  const suffix = relative(resolve(rootPath), resolve(candidatePath))
  return suffix === '' || (!suffix.startsWith('..') && !isAbsolute(suffix))
}

export function isManagedAssetPath(filePath: string) {
  const target = String(filePath || '').trim()
  if (!target) return false
  const { dataDir } = getAppPaths()
  return isInside(dataDir, target)
}

export function managedAssetRoot(module: ManagedAssetModule, ownerId: string) {
  return join(getAppPaths().dataDir, 'managed-assets', module, safePart(ownerId))
}

export async function materializeManagedAsset(input: MaterializeAssetInput): Promise<string> {
  const source = String(input.sourcePath || '').trim()
  if (!source || isManagedAssetPath(source)) return source

  const sourceStat = await stat(source).catch(() => null)
  if (!sourceStat?.isFile()) {
    if (input.allowMissing !== false) return source
    throw new Error(`Managed asset source file does not exist: ${source}`)
  }

  const root = managedAssetRoot(input.module, input.ownerId)
  const extension = extname(source).toLowerCase() || extname(basename(source)).toLowerCase()
  const target = join(root, `${safePart(input.assetId || basename(source, extension))}${extension}`)
  await mkdir(root, { recursive: true })
  await copyFile(source, target)
  return target
}

export async function materializeManagedAssets(
  paths: string[],
  input: Omit<MaterializeAssetInput, 'sourcePath' | 'assetId'> & { assetPrefix?: string },
) {
  const pathMap = new Map<string, string>()
  const result: string[] = []
  for (let index = 0; index < paths.length; index += 1) {
    const source = String(paths[index] || '').trim()
    const target = await materializeManagedAsset({
      ...input,
      sourcePath: source,
      assetId: `${input.assetPrefix || 'asset'}-${index + 1}`,
    })
    if (source && target && source !== target) pathMap.set(source, target)
    result.push(target)
  }
  return { paths: result, pathMap }
}
