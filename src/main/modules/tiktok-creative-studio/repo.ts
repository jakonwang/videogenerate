import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { materializeManagedAsset } from '../managed-assets/service'
import type { TiktokCreativeShotTask, TiktokCreativeTask, TiktokCreativeTaskLog } from './types'

type DbShape = {
  tasks: TiktokCreativeTask[]
}

function dbPath() {
  return join(getAppPaths().dbDir, 'tiktok-creative-studio.json')
}

function now() {
  return Date.now()
}

function defaultDb(): DbShape {
  return { tasks: [] }
}

function normalizeLogs(logs: TiktokCreativeTaskLog[] | undefined) {
  return Array.isArray(logs) ? logs.slice(-200) : []
}

function normalizeShotTask(shot: TiktokCreativeShotTask): TiktokCreativeShotTask {
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
    lastError: String(shot.lastError || '').trim() || undefined,
    logs: normalizeLogs(shot.logs),
    sourceType: shot.sourceType || (shot.shotId ? 'legacy_clone_shot' : 'reference_image'),
    referenceImagePath: String(shot.referenceImagePath || '').trim() || undefined,
    preparedImagePath: String(shot.preparedImagePath || '').trim() || undefined,
    imagePreparation: shot.imagePreparation && typeof shot.imagePreparation === 'object'
      ? { ...shot.imagePreparation }
      : undefined,
    imageRetryCount: Math.max(0, Number(shot.imageRetryCount || 0) || 0),
    imageRetryLimit: Math.max(1, Number(shot.imageRetryLimit || 2) || 2),
    accountId: String(shot.accountId || '').trim() || undefined,
    officialTaskId: String(shot.officialTaskId || '').trim() || undefined,
    officialVideoId: String(shot.officialVideoId || '').trim() || undefined,
    remoteStatus: shot.remoteStatus,
    remoteStatusUpdatedAt: Number(shot.remoteStatusUpdatedAt || 0) || undefined,
    posterPath: String(shot.posterPath || '').trim() || undefined,
    pollAttempts: Math.max(0, Number(shot.pollAttempts || 0) || 0),
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
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    return [...db.tasks].map(normalizeTask).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async get(id: string) {
    const tasks = await this.list()
    return tasks.find((item) => item.id === id) || null
  },

  async upsert(task: TiktokCreativeTask) {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    const normalized = normalizeTask(await materializeTaskAssets(task))
    const index = db.tasks.findIndex((item) => item.id === normalized.id)
    if (index >= 0) db.tasks[index] = normalized
    else db.tasks.unshift(normalized)
    await writeJsonFile(dbPath(), db)
    return normalized
  },

  async migrateExternalAssets(): Promise<{ migrated: number }> {
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    let migrated = 0
    for (let index = 0; index < db.tasks.length; index += 1) {
      const current = normalizeTask(db.tasks[index])
      const next = normalizeTask(await materializeTaskAssets(current))
      if (JSON.stringify(next) === JSON.stringify(current)) continue
      db.tasks[index] = next
      migrated += 1
    }
    if (migrated) await writeJsonFile(dbPath(), db)
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
    const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
    db.tasks = db.tasks.filter((item) => item.id !== id)
    await writeJsonFile(dbPath(), db)
    return { ok: true as const }
  },
}
