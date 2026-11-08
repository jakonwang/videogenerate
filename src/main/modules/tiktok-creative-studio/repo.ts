import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { backgroundRecordStore } from '../../lib/backgroundRecordStore'
import { materializeManagedAsset } from '../managed-assets/service'
import type { TiktokCreativeShotTask, TiktokCreativeTask, TiktokCreativeTaskLog } from './types'

const STORE_NAMESPACE = 'tiktok-creative-studio-tasks'
let migrationPromise: Promise<{ migrated: number }> | null = null

function dbPath() {
  return join(getAppPaths().dbDir, 'tiktok-creative-studio.json')
}

function now() {
  return Date.now()
}

function ensureMigrated() {
  migrationPromise ||= backgroundRecordStore.migrate(STORE_NAMESPACE, dbPath(), 'tasks')
  return migrationPromise
}

function normalizeLogs(logs: TiktokCreativeTaskLog[] | undefined) {
  return Array.isArray(logs) ? logs.slice(-200) : []
}

function normalizeShotTask(shot: TiktokCreativeShotTask): TiktokCreativeShotTask {
  const zoomPercent = [10, 20, 30, 40, 50, 60, 70, 80].includes(Number(shot.zoomPercent)) ? Number(shot.zoomPercent) : 20
  const imageRetryLimit = Math.max(0, Math.min(20, Math.floor(Number(shot.imageRetryLimit ?? 1) || 0)))
  const imageRetryCount = Math.min(imageRetryLimit, Math.max(0, Number(shot.imageRetryCount || 0) || 0))
  const lastError = String(shot.lastError || '').trim() || undefined
  const imageQualityFailed = Boolean(
    lastError?.includes('[image_retry_exhausted]') ||
    shot.imagePreparation?.qualityReport?.decision === 'retry' ||
    shot.imagePreparation?.qualityReport?.decision === 'reject',
  )
  const exhaustedImageRetry = !shot.officialTaskId && imageQualityFailed && Number(shot.imageRetryCount || 0) >= imageRetryLimit
  return {
    ...shot,
    shotId: String(shot.shotId || '').trim(),
    shotIndex: Number(shot.shotIndex || 0),
    scriptText: String(shot.scriptText || '').trim() || undefined,
    imagePath: String(shot.imagePath || '').trim(),
    prompt: String(shot.prompt || '').trim(),
    durationSec: Math.max(3, Number(shot.durationSec || 5) || 5),
    downloadDir: String(shot.downloadDir || '').trim() || undefined,
    resultVideoPath: String(shot.resultVideoPath || '').trim() || undefined,
    lastError,
    logs: normalizeLogs(shot.logs),
    sourceType: shot.sourceType || (shot.shotId ? 'legacy_clone_shot' : 'reference_image'),
    zoomPercent,
    referenceImagePath: String(shot.referenceImagePath || '').trim() || undefined,
    preparedImagePath: String(shot.preparedImagePath || '').trim() || undefined,
    imagePreparation: shot.imagePreparation && typeof shot.imagePreparation === 'object'
      ? { ...shot.imagePreparation }
      : undefined,
    imageRetryCount,
    imageRetryLimit,
    imageRetryMode: shot.imageRetryMode === 'manual_once' ? 'manual_once' : 'auto',
    accountId: String(shot.accountId || '').trim() || undefined,
    officialTaskId: String(shot.officialTaskId || '').trim() || undefined,
    officialVideoId: String(shot.officialVideoId || '').trim() || undefined,
    status: exhaustedImageRetry ? 'requires_manual' : shot.status,
    remoteStatus: exhaustedImageRetry ? 'paused_error' : shot.remoteStatus,
    remoteStatusUpdatedAt: Number(shot.remoteStatusUpdatedAt || 0) || undefined,
    posterPath: String(shot.posterPath || '').trim() || undefined,
    pollAttempts: Math.max(0, Number(shot.pollAttempts || 0) || 0),
    exportedAt: Number(shot.exportedAt || 0) || undefined,
    exportedVideoPath: String(shot.exportedVideoPath || '').trim() || undefined,
  }
}

function canMaterializeShotAssets(shot: TiktokCreativeShotTask) {
  if (shot.sourceType !== 'reference_image') return false
  return !String((shot as TiktokCreativeShotTask & { preparationItemId?: string }).preparationItemId || '').trim()
}

function summarizeShots(shots: TiktokCreativeShotTask[]) {
  const totalShots = shots.length
  const completedShots = shots.filter((item) => item.status === 'completed').length
  const failedShots = shots.filter((item) => item.status === 'failed').length
  const waitingShots = shots.filter((item) => item.status === 'requires_manual').length
  return { totalShots, completedShots, failedShots, waitingShots }
}

function normalizeTask(task: TiktokCreativeTask): TiktokCreativeTask {
  const shots = Array.isArray(task.shots) ? task.shots.map(normalizeShotTask) : []
  const summary = summarizeShots(shots)
  return {
    ...task,
    productId: String(task.productId || '').trim() || undefined,
    productName: String(task.productName || '').trim() || undefined,
    sourceCloneProjectId: String(task.sourceCloneProjectId || '').trim() || undefined,
    sourceCloneProjectTitle: String(task.sourceCloneProjectTitle || '').trim() || undefined,
    lastError: String(task.lastError || '').trim() || undefined,
    shots,
    logs: normalizeLogs(task.logs),
    totalShots: summary.totalShots,
    completedShots: summary.completedShots,
    failedShots: summary.failedShots,
    waitingShots: summary.waitingShots,
  }
}

async function materializeTaskAssets(task: TiktokCreativeTask): Promise<TiktokCreativeTask> {
  return {
    ...task,
    shots: await Promise.all(
      task.shots.map(async (shot) => ({
        ...shot,
        imagePath: canMaterializeShotAssets(shot)
          ? await materializeManagedAsset({
              sourcePath: shot.imagePath,
              module: 'tiktok-creative',
              ownerId: task.id,
              assetId: `shot-${shot.shotId}-image`,
            })
          : shot.imagePath,
        referenceImagePath: canMaterializeShotAssets(shot) && shot.referenceImagePath
          ? await materializeManagedAsset({
              sourcePath: shot.referenceImagePath,
              module: 'tiktok-creative',
              ownerId: task.id,
              assetId: `shot-${shot.shotId}-reference`,
            })
          : shot.referenceImagePath,
        preparedImagePath: canMaterializeShotAssets(shot) && shot.preparedImagePath
          ? await materializeManagedAsset({
              sourcePath: shot.preparedImagePath,
              module: 'tiktok-creative',
              ownerId: task.id,
              assetId: `shot-${shot.shotId}-prepared`,
            })
          : shot.preparedImagePath,
      })),
    ),
  }
}

export const tiktokCreativeStudioRepo = {
  async list(): Promise<TiktokCreativeTask[]> {
    await ensureMigrated()
    const page = await backgroundRecordStore.list<TiktokCreativeTask>(STORE_NAMESPACE, { limit: 10_000 })
    return page.items
      .map(normalizeTask)
      .sort(
        (a, b) =>
          Number(b.createdAt || 0) - Number(a.createdAt || 0) ||
          String(b.id).localeCompare(String(a.id)),
      )
  },

  async get(id: string) {
    await ensureMigrated()
    const task = await backgroundRecordStore.get<TiktokCreativeTask>(STORE_NAMESPACE, id)
    return task ? normalizeTask(task) : null
  },

  async upsert(task: TiktokCreativeTask) {
    await ensureMigrated()
    const normalized = normalizeTask(await materializeTaskAssets(task))
    await backgroundRecordStore.upsert(STORE_NAMESPACE, normalized as unknown as Record<string, unknown>)
    return normalized
  },

  async listPage(input: { offset?: number; limit?: number } = {}) {
    await ensureMigrated()
    const page = await backgroundRecordStore.list<TiktokCreativeTask>(STORE_NAMESPACE, input)
    return { ...page, items: page.items.map(normalizeTask) }
  },

  async migrateExternalAssets(): Promise<{ migrated: number }> {
    await ensureMigrated()
    const tasks = await this.list()
    let migrated = 0
    for (const task of tasks) {
      const current = normalizeTask(task)
      const next = normalizeTask(await materializeTaskAssets(current))
      if (JSON.stringify(next) === JSON.stringify(current)) continue
      await backgroundRecordStore.upsert(STORE_NAMESPACE, next as unknown as Record<string, unknown>)
      migrated += 1
    }
    return { migrated }
  },

  async create(
    input: Omit<TiktokCreativeTask, 'id' | 'createdAt' | 'updatedAt' | 'logs' | 'totalShots' | 'completedShots' | 'failedShots' | 'waitingShots'> & {
      logs?: TiktokCreativeTaskLog[]
    },
  ) {
    const timestamp = now()
    return await this.upsert({
      ...input,
      id: randomUUID(),
      totalShots: 0,
      completedShots: 0,
      failedShots: 0,
      waitingShots: 0,
      logs: normalizeLogs(input.logs),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  },

  async remove(id: string) {
    await ensureMigrated()
    return { ok: await backgroundRecordStore.remove(STORE_NAMESPACE, id) }
  },
}
