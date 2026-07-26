import { existsSync } from 'node:fs'
import { lstat, readdir, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { cloneRepo } from '../clone/repo'
import { hermesRuntime } from '../hermes/runtime'
import { hermesManagement } from '../hermes/management'
import { livePhotoRepo } from '../live-photo/repo'
import { webPlatformRepo } from '../web-platform/repo'
import {
  STORAGE_CATEGORY_IDS,
  isStorageCategoryId,
  storageCleanupConfirmation,
  storageCleanupChallenge,
  type StorageCategoryId,
  type StorageCategoryRisk,
  type StorageCategorySnapshot,
  type StorageCleanupResult,
  type StorageOverview,
} from '../../../shared/storageManagement'

type TargetRecord =
  | { kind: 'live_photo'; id: string }
  | { kind: 'clone_project'; id: string }
  | { kind: 'subtitle_job'; id: string }

type StorageTarget = {
  path: string
  preserveRoot?: boolean
  bestEffort?: boolean
  record?: TargetRecord
}

type CategoryDefinition = {
  id: StorageCategoryId
  risk: StorageCategoryRisk
  requiresRuntimeStop: boolean
  cleanupAllowed: boolean
  requiresTypedConfirmation: boolean
  backupRequired: boolean
  targets: () => Promise<StorageTarget[]>
}

type TargetStats = {
  sizeBytes: number
  fileCount: number
}

const STALE_TEMPORARY_FILE_AGE_MS = 24 * 60 * 60 * 1000
const STALE_DIAGNOSTIC_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000

function uniqueTargets(targets: StorageTarget[]) {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = resolve(target.path).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function scanPath(path: string): Promise<TargetStats> {
  const root = resolve(path)
  if (!existsSync(root)) return { sizeBytes: 0, fileCount: 0 }
  const rootStat = await lstat(root).catch(() => null)
  if (!rootStat) return { sizeBytes: 0, fileCount: 0 }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    return {
      sizeBytes: rootStat.isFile() ? rootStat.size : 0,
      fileCount: rootStat.isFile() ? 1 : 0,
    }
  }
  const pending = [root]
  let sizeBytes = 0
  let fileCount = 0

  while (pending.length) {
    const current = pending.pop()!
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const entryPath = join(current, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        pending.push(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      const fileStat = await lstat(entryPath).catch(() => null)
      if (!fileStat?.isFile()) continue
      sizeBytes += fileStat.size
      fileCount += 1
    }
  }

  return { sizeBytes, fileCount }
}

async function staleFileTargets(root: string, minimumAgeMs: number): Promise<StorageTarget[]> {
  if (!existsSync(root)) return []
  const cutoff = Date.now() - minimumAgeMs
  const pending = [resolve(root)]
  const targets: StorageTarget[] = []
  while (pending.length) {
    const current = pending.pop()!
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        pending.push(path)
        continue
      }
      const itemStat = await lstat(path).catch(() => null)
      if (itemStat?.isFile() && itemStat.mtimeMs <= cutoff) targets.push({ path, bestEffort: true })
    }
  }
  return targets
}

function assertManagedTarget(path: string) {
  const { dataDir, userData } = getAppPaths()
  const profileDir = hermesRuntime.getProfileDirectory()
  const runtimeParent = dirname(hermesRuntime.getRuntimeRoot())
  const target = resolve(path)
  const allowedRoots = [dataDir, userData, profileDir, runtimeParent].map((item) => resolve(item))
  const allowed = allowedRoots.some((root) => {
    const suffix = relative(root, target)
    return Boolean(suffix) && suffix !== '..' && !suffix.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  })
  if (!allowed) throw new Error('Storage cleanup target is outside managed application directories.')
}

async function clearTarget(target: StorageTarget) {
  assertManagedTarget(target.path)
  if (!existsSync(target.path)) return []
  if (!target.preserveRoot) {
    try {
      await rm(target.path, { recursive: true, force: true })
      return []
    } catch (error) {
      if (!target.bestEffort) throw error
      return [String((error as Error)?.message || error)]
    }
  }
  const entries = await readdir(target.path, { withFileTypes: true }).catch(() => [])
  const results = await Promise.all(entries.map(async (entry) => {
    try {
      await rm(join(target.path, entry.name), { recursive: true, force: true })
      return ''
    } catch (error) {
      if (!target.bestEffort) throw error
      return String((error as Error)?.message || error)
    }
  }))
  return results.filter(Boolean)
}

async function completedArtifactTargets(): Promise<StorageTarget[]> {
  const { dataDir } = getAppPaths()
  const [livePhotos, cloneProjects, webDb] = await Promise.all([
    livePhotoRepo.list(),
    cloneRepo.listProjects(),
    webPlatformRepo.readDb(),
  ])
  const subtitleJobs = Array.isArray(webDb.batchSubtitleJobs) ? webDb.batchSubtitleJobs : []
  return uniqueTargets([
    ...livePhotos
      .filter((item) => item.packagingStatus === 'completed')
      .map((item) => ({ path: join(dataDir, 'plugin-live-photo', item.id), record: { kind: 'live_photo' as const, id: item.id } })),
    ...cloneProjects
      .filter((item) => item.status === 'completed')
      .map((item) => ({ path: join(dataDir, 'viral-clone', item.id), record: { kind: 'clone_project' as const, id: item.id } })),
    ...subtitleJobs
      .filter((item) => item.status === 'completed')
      .map((item) => ({
        path: join(dataDir, 'batch-subtitle', item.userId, item.id),
        record: { kind: 'subtitle_job' as const, id: item.id },
      })),
    { path: join(dataDir, 'exports'), preserveRoot: true },
  ])
}

async function hermesSessionTargets(): Promise<StorageTarget[]> {
  const profileDir = hermesRuntime.getProfileDirectory()
  return uniqueTargets([
    { path: join(profileDir, 'sessions'), preserveRoot: true },
    { path: join(profileDir, 'memories'), preserveRoot: true },
  ])
}

async function diagnosticLogTargets(): Promise<StorageTarget[]> {
  const { dataDir, userData } = getAppPaths()
  const profileDir = hermesRuntime.getProfileDirectory()
  const roots = [
    join(dataDir, 'logs'),
    join(dataDir, 'diagnostics'),
    join(userData, 'logs'),
    join(userData, 'Logs'),
    join(userData, 'Crashpad', 'reports'),
    join(userData, 'crashDumps'),
    join(profileDir, 'logs'),
  ]
  const targets = await Promise.all(roots.map((root) => staleFileTargets(root, STALE_DIAGNOSTIC_LOG_AGE_MS)))
  return uniqueTargets(targets.flat())
}

function definitions(): Record<StorageCategoryId, CategoryDefinition> {
  const { cacheDir, dataDir, tmpDir, userData } = getAppPaths()
  const profileDir = hermesRuntime.getProfileDirectory()
  const runtimeRoot = hermesRuntime.getRuntimeRoot()
  const runtimeParent = dirname(runtimeRoot)
  return {
    safe_cache: {
      id: 'safe_cache',
      risk: 'safe',
      requiresRuntimeStop: false,
      cleanupAllowed: true,
      requiresTypedConfirmation: false,
      backupRequired: false,
      targets: async () => uniqueTargets([
        { path: cacheDir, preserveRoot: true, bestEffort: true },
        { path: join(dataDir, 'emoji-cache'), preserveRoot: true, bestEffort: true },
        { path: join(dataDir, 'plugin-live-photo', 'quality-cache'), preserveRoot: true, bestEffort: true },
        ...['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'blob_storage', 'VideoDecodeStats']
          .map((name) => ({ path: join(userData, name), preserveRoot: true, bestEffort: true })),
        ...['cache', 'audio_cache', 'image_cache', 'chrome-debug']
          .map((name) => ({ path: join(profileDir, name), preserveRoot: true, bestEffort: true })),
      ]),
    },
    temporary_files: {
      id: 'temporary_files',
      risk: 'safe',
      requiresRuntimeStop: false,
      cleanupAllowed: true,
      requiresTypedConfirmation: false,
      backupRequired: false,
      targets: async () => await staleFileTargets(tmpDir, STALE_TEMPORARY_FILE_AGE_MS),
    },
    preview_files: {
      id: 'preview_files',
      risk: 'caution',
      requiresRuntimeStop: false,
      cleanupAllowed: true,
      requiresTypedConfirmation: false,
      backupRequired: false,
      targets: async () => [{ path: join(dataDir, 'batch-subtitle-preview'), preserveRoot: true }],
    },
    diagnostic_logs: {
      id: 'diagnostic_logs',
      risk: 'caution',
      requiresRuntimeStop: false,
      cleanupAllowed: true,
      requiresTypedConfirmation: false,
      backupRequired: false,
      targets: diagnosticLogTargets,
    },
    completed_project_artifacts: {
      id: 'completed_project_artifacts',
      risk: 'destructive',
      requiresRuntimeStop: false,
      cleanupAllowed: true,
      requiresTypedConfirmation: true,
      backupRequired: false,
      targets: completedArtifactTargets,
    },
    hermes_runtime: {
      id: 'hermes_runtime',
      risk: 'destructive',
      requiresRuntimeStop: true,
      cleanupAllowed: true,
      requiresTypedConfirmation: true,
      backupRequired: false,
      targets: async () => uniqueTargets([
        { path: runtimeRoot },
        { path: join(runtimeParent, 'hermes-agent.videogenerate-staging') },
        { path: join(runtimeParent, 'hermes-agent.videogenerate-previous') },
      ]),
    },
    hermes_sessions_memory: {
      id: 'hermes_sessions_memory',
      risk: 'destructive',
      requiresRuntimeStop: true,
      cleanupAllowed: true,
      requiresTypedConfirmation: true,
      backupRequired: true,
      targets: hermesSessionTargets,
    },
    managed_source_assets: {
      id: 'managed_source_assets',
      risk: 'protected',
      requiresRuntimeStop: false,
      cleanupAllowed: false,
      requiresTypedConfirmation: false,
      backupRequired: false,
      targets: async () => uniqueTargets([
        { path: join(dataDir, 'managed-assets') },
        { path: join(dataDir, 'product-library', 'images') },
      ]),
    },
    business_records: {
      id: 'business_records',
      risk: 'protected',
      requiresRuntimeStop: false,
      cleanupAllowed: false,
      requiresTypedConfirmation: false,
      backupRequired: false,
      targets: async () => uniqueTargets([
        { path: join(dataDir, 'db') },
        { path: join(profileDir, 'state.db') },
        { path: join(profileDir, 'state.db-shm') },
        { path: join(profileDir, 'state.db-wal') },
      ]),
    },
    configuration_credentials: {
      id: 'configuration_credentials',
      risk: 'protected',
      requiresRuntimeStop: false,
      cleanupAllowed: false,
      requiresTypedConfirmation: false,
      backupRequired: false,
      targets: async () => {
        const profileDir = hermesRuntime.getProfileDirectory()
        return uniqueTargets([
          ...['.env', 'config.yaml', 'config.yml', 'config.json', 'channels.json'].map((name) => ({ path: join(profileDir, name) })),
        ])
      },
    },
  }
}

async function snapshotCategory(definition: CategoryDefinition): Promise<StorageCategorySnapshot> {
  const targets = await definition.targets()
  const stats = await Promise.all(targets.map((target) => scanPath(target.path)))
  return {
    id: definition.id,
    sizeBytes: stats.reduce((sum, item) => sum + item.sizeBytes, 0),
    fileCount: stats.reduce((sum, item) => sum + item.fileCount, 0),
    itemCount: targets.filter((target) => target.record).length,
    risk: definition.risk,
    available: targets.some((target) => existsSync(target.path)),
    requiresRuntimeStop: definition.requiresRuntimeStop,
    cleanupAllowed: definition.cleanupAllowed,
    requiresTypedConfirmation: definition.requiresTypedConfirmation,
    backupRequired: definition.backupRequired,
  }
}

class StorageManagementService {
  private readonly cacheTtlMs = 60_000
  private snapshots = new Map<StorageCategoryId, { value: StorageCategorySnapshot; cachedAt: number }>()
  private operation: Promise<StorageCleanupResult> | null = null

  async getCategory(input: { categoryId?: unknown; force?: unknown }): Promise<StorageCategorySnapshot> {
    if (!isStorageCategoryId(input?.categoryId)) throw new Error('A valid storage category is required.')
    const categoryId = input.categoryId
    const cached = this.snapshots.get(categoryId)
    const force = Boolean(input.force)
    if (!force && cached && Date.now() - cached.cachedAt < this.cacheTtlMs) return cached.value
    const value = await snapshotCategory(definitions()[categoryId])
    this.snapshots.set(categoryId, { value, cachedAt: Date.now() })
    return value
  }

  async getOverview(force = false): Promise<StorageOverview> {
    const categories = await Promise.all(STORAGE_CATEGORY_IDS.map((categoryId) => this.getCategory({ categoryId, force })))
    return {
      categories,
      totalBytes: categories.reduce((sum, item) => sum + item.sizeBytes, 0),
      scannedAt: Date.now(),
    }
  }

  async cleanup(input: { categoryId?: unknown; confirmation?: unknown; challenge?: unknown }): Promise<StorageCleanupResult> {
    if (!isStorageCategoryId(input?.categoryId)) throw new Error('A valid storage category is required.')
    const categoryId = input.categoryId
    const definition = definitions()[categoryId]
    if (!definition.cleanupAllowed) throw new Error('This category is protected and cannot be cleaned from the storage manager.')
    if (String(input?.confirmation || '') !== storageCleanupConfirmation(categoryId)) {
      throw new Error('Storage cleanup confirmation is invalid.')
    }
    if (definition.requiresTypedConfirmation && String(input?.challenge || '').trim() !== storageCleanupChallenge(categoryId)) {
      throw new Error('Typed cleanup confirmation is required for this category.')
    }
    if (this.operation) throw new Error('Another storage cleanup operation is already running.')
    this.operation = this.cleanupInternal(categoryId).finally(() => {
      this.operation = null
    })
    return await this.operation
  }

  private async cleanupInternal(categoryId: StorageCategoryId): Promise<StorageCleanupResult> {
    const definition = definitions()[categoryId]
    const targets = await definition.targets()
    const before = await Promise.all(targets.map((target) => scanPath(target.path)))
    const runtimeWasReady = hermesRuntime.getStatus().state === 'ready'
    const warnings: string[] = []
    let backupCreated = false
    if (definition.backupRequired) {
      try {
        await hermesManagement.createBackup()
        backupCreated = true
      } catch (error) {
        throw new Error(`A backup is required before cleaning this category: ${String((error as Error)?.message || error)}`)
      }
    }

    if (definition.requiresRuntimeStop) await hermesRuntime.stop()
    try {
      for (const target of targets) {
        warnings.push(...await clearTarget(target))
      }
    } finally {
      if (definition.requiresRuntimeStop && categoryId !== 'hermes_runtime' && runtimeWasReady) {
        await hermesRuntime.start().catch((error) => {
          warnings.push(String((error as Error)?.message || error))
        })
      }
    }

    const after = await Promise.all(targets.map((target) => scanPath(target.path)))
    this.snapshots.delete(categoryId)
    await this.getCategory({ categoryId, force: true })
    const overview = await this.getOverview(false)
    const beforeBytes = before.reduce((sum, item) => sum + item.sizeBytes, 0)
    const afterBytes = after.reduce((sum, item) => sum + item.sizeBytes, 0)
    const beforeFiles = before.reduce((sum, item) => sum + item.fileCount, 0)
    const afterFiles = after.reduce((sum, item) => sum + item.fileCount, 0)
    return {
      categoryId,
      reclaimedBytes: Math.max(0, beforeBytes - afterBytes),
      removedFiles: Math.max(0, beforeFiles - afterFiles),
      removedItems: 0,
      ...(backupCreated ? { backupCreated: true } : {}),
      ...(warnings.length ? { warning: `${warnings.length} locked or unavailable entries were retained.` } : {}),
      overview,
    }
  }
}

export const storageManagementService = new StorageManagementService()
