import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile } from '../../lib/storeJson'
import type { LivePhotoItem, LivePhotoSettings } from './types'
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
    updatedAt: Date.now(),
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
    return readLivePhotoItemsFromSqlite()
  },

  async get(id: string): Promise<LivePhotoItem | null> {
    await ensureLivePhotoSqliteReady()
    return readLivePhotoItemByIdFromSqlite(String(id || '').trim())
  },

  async upsert(item: LivePhotoItem): Promise<LivePhotoItem> {
    await ensureLivePhotoSqliteReady()
    upsertLivePhotoItemInSqlite(item)
    return item
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
      updatedAt: Date.now(),
    }
    await ensureLivePhotoSqliteReady()
    writeLivePhotoSettingsToSqlite(next)
    return next
  },
}
