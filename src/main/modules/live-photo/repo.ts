import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile } from '../../lib/storeJson'
import type { LivePhotoItem, LivePhotoSettings, LivePhotoWorkflow, LivePhotoWorkflowStep } from './types'
import { normalizeLivePhotoReplacementRegion } from './replacementRegion'
import { normalizeLivePhotoSceneInteraction } from './sceneInteraction'
import { materializeManagedAsset } from '../managed-assets/service'
import {
  canInitializeLivePhotoSqlite,
  getLivePhotoSqliteUnavailableReason,
  initializeLivePhotoSqlite,
  isLivePhotoSqliteEmpty,
  readLivePhotoItemByIdFromSqlite,
  readLivePhotoItemsFromSqlite,
  readLivePhotoSettingsFromSqlite,
  removeLivePhotoItemFromSqlite,
  upsertLivePhotoItemInSqlite,
  writeLivePhotoSettingsToSqlite,
  writeLivePhotoItemsToSqlite,
} from './sqlite'

type DbShape = {
  items: LivePhotoItem[]
  settings?: LivePhotoSettings
}

function dbPath() {
  return join(getAppPaths().dbDir, 'live-photo.json')
}

function defaultDb(): DbShape {
  return { items: [] }
}

function defaultSettings(): LivePhotoSettings {
  return {
    referenceMotionTemplate: 'push_in',
    cloneMotionTemplate: 'ambient_sway',
    outputResolution: '2160x2880',
    frameRate: '30',
    quality: 'high',
    qualityCheckerEnabled: true,
    qualityPassThreshold: 0.88,
    qualityRetryFloor: 0.65,
    updatedAt: Date.now(),
  }
}

const workflowSteps: LivePhotoWorkflowStep[] = [
  'queued',
  'image_generation',
  'image_validation',
  'video_generation',
  'live_photo_packaging',
  'completed',
]

function normalizeWorkflow(workflow?: LivePhotoWorkflow): LivePhotoWorkflow | undefined {
  if (!workflow) return undefined
  const updatedAt = Number(workflow.updatedAt || 0) || Date.now()
  const stepStatus = { ...workflow.stepStatus } as LivePhotoWorkflow['stepStatus']
  for (const step of workflowSteps) {
    if (!stepStatus[step]) stepStatus[step] = { status: 'idle', updatedAt, error: '' }
  }
  return {
    ...workflow,
    currentStep: workflow.currentStep || 'queued',
    stepStatus,
    updatedAt,
  }
}

function normalizeItem(item: LivePhotoItem): LivePhotoItem {
  return {
    ...item,
    workflow: normalizeWorkflow(item.workflow),
    generationAttempts: Array.isArray(item.generationAttempts) ? item.generationAttempts : [],
    replacementRegion: normalizeLivePhotoReplacementRegion(item.replacementRegion) || undefined,
    sceneInteraction: normalizeLivePhotoSceneInteraction(item.sceneInteraction) || undefined,
    cacheHit: Boolean(item.cacheHit),
    usageStatus: item.usageStatus === 'used' ? 'used' : 'unused',
    usedAt: Number(item.usedAt || 0) || undefined,
    usedChannel: String(item.usedChannel || '').trim() || undefined,
    usedUserId: String(item.usedUserId || '').trim() || undefined,
  }
}

async function materializeLivePhotoInputAsset(item: LivePhotoItem): Promise<LivePhotoItem> {
  return {
    ...item,
    referenceImagePath: await materializeManagedAsset({
      sourcePath: item.referenceImagePath,
      module: 'live-photo',
      ownerId: item.id,
      assetId: 'reference-image',
    }),
  }
}

let livePhotoSqliteReadyState: { migrated: boolean; source: 'sqlite' | 'json_import' | 'empty' } | null = null
let livePhotoSqliteFallbackLogged = false

async function readLegacyJsonItems() {
  const db = await readJsonFile<DbShape>(dbPath(), defaultDb())
  return Array.isArray(db.items) ? db.items : []
}

async function ensureLivePhotoSqliteReady() {
  if (!canInitializeLivePhotoSqlite()) {
    if (!livePhotoSqliteFallbackLogged) {
      livePhotoSqliteFallbackLogged = true
      console.warn('[live-photo] sqlite unavailable:', getLivePhotoSqliteUnavailableReason())
    }
    throw new Error(`Live Photo sqlite unavailable: ${getLivePhotoSqliteUnavailableReason() || 'unknown'}`)
  }
  if (livePhotoSqliteReadyState) return livePhotoSqliteReadyState
  initializeLivePhotoSqlite()
  if (!isLivePhotoSqliteEmpty()) {
    livePhotoSqliteReadyState = { migrated: false, source: 'sqlite' }
    return livePhotoSqliteReadyState
  }
  if (existsSync(dbPath())) {
    const legacyItems = await readLegacyJsonItems()
    if (legacyItems.length) {
      writeLivePhotoItemsToSqlite(legacyItems)
      livePhotoSqliteReadyState = { migrated: true, source: 'json_import' }
      return livePhotoSqliteReadyState
    }
  }
  livePhotoSqliteReadyState = { migrated: false, source: 'empty' }
  return livePhotoSqliteReadyState
}

export const livePhotoRepo = {
  async list(): Promise<LivePhotoItem[]> {
    await ensureLivePhotoSqliteReady()
    return readLivePhotoItemsFromSqlite().map(normalizeItem)
  },

  async get(id: string): Promise<LivePhotoItem | null> {
    await ensureLivePhotoSqliteReady()
    const item = readLivePhotoItemByIdFromSqlite(String(id || '').trim())
    return item ? normalizeItem(item) : null
  },

  async upsert(item: LivePhotoItem): Promise<LivePhotoItem> {
    await ensureLivePhotoSqliteReady()
    const normalized = normalizeItem(await materializeLivePhotoInputAsset(item))
    upsertLivePhotoItemInSqlite(normalized)
    return normalized
  },

  async migrateExternalAssets(): Promise<{ migrated: number }> {
    await ensureLivePhotoSqliteReady()
    const items = readLivePhotoItemsFromSqlite()
    let migrated = 0
    for (const item of items) {
      const current = normalizeItem(item)
      const next = normalizeItem(await materializeLivePhotoInputAsset(current))
      if (JSON.stringify(next) === JSON.stringify(current)) continue
      upsertLivePhotoItemInSqlite(next)
      migrated += 1
    }
    return { migrated }
  },

  async remove(id: string) {
    await ensureLivePhotoSqliteReady()
    removeLivePhotoItemFromSqlite(String(id || '').trim())
    return { ok: true as const }
  },

  async getSettings(): Promise<LivePhotoSettings> {
    await ensureLivePhotoSqliteReady()
    return readLivePhotoSettingsFromSqlite() || defaultSettings()
  },

  async saveSettings(input: Partial<LivePhotoSettings>): Promise<LivePhotoSettings> {
    const current = await this.getSettings()
    const allowedResolutions = new Set(['1080x1440', '2160x2880', '3024x4032'])
    const allowedFrameRates = new Set(['24', '30'])
    const allowedQualities = new Set(['medium', 'high'])
    const next: LivePhotoSettings = {
      referenceMotionTemplate:
        input.referenceMotionTemplate === 'push_in' || input.referenceMotionTemplate === 'push_out' || input.referenceMotionTemplate === 'ambient_sway'
          ? input.referenceMotionTemplate
          : current.referenceMotionTemplate,
      cloneMotionTemplate:
        input.cloneMotionTemplate === 'push_in' || input.cloneMotionTemplate === 'push_out' || input.cloneMotionTemplate === 'ambient_sway'
          ? input.cloneMotionTemplate
          : current.cloneMotionTemplate,
      outputResolution: allowedResolutions.has(String(input.outputResolution || '')) ? (input.outputResolution as LivePhotoSettings['outputResolution']) : current.outputResolution,
      frameRate: allowedFrameRates.has(String(input.frameRate || '')) ? (input.frameRate as LivePhotoSettings['frameRate']) : current.frameRate,
      quality: allowedQualities.has(String(input.quality || '')) ? (input.quality as LivePhotoSettings['quality']) : current.quality,
      qualityCheckerEnabled: input.qualityCheckerEnabled !== false,
      qualityPassThreshold: Math.max(0.5, Math.min(1, Number(input.qualityPassThreshold ?? current.qualityPassThreshold ?? 0.88))),
      qualityRetryFloor: Math.max(0, Math.min(0.95, Number(input.qualityRetryFloor ?? current.qualityRetryFloor ?? 0.65))),
      updatedAt: Date.now(),
    }
    await ensureLivePhotoSqliteReady()
    writeLivePhotoSettingsToSqlite(next)
    return next
  },
}
